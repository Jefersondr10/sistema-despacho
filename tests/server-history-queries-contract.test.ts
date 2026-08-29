import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const migration = read(
  "supabase/migrations/202608290003_server_history_queries.sql",
);
const databaseSource = read("lib/database.ts");
const queryHookSource = read("app/_lib/server-history-data.ts");
const storeSource = read("app/_lib/supabase-dispatch-store.ts");
const packagesSource = read("app/pacotes/pacotes-view.tsx");
const dashboardSource = read("app/dashboard/dashboard-view.tsx");
const reportsSource = read("app/relatorios/relatorios-view.tsx");

function sqlFunction(name: string) {
  const match = migration.match(
    new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
      "i",
    ),
  );
  assert.ok(match, `funcao ${name} nao encontrada`);
  return match[0];
}

test("historico pagina por cursor e snapshot sem baixar todas as linhas", () => {
  const definition = sqlFunction("listar_pacotes_paginados_v2");

  assert.match(definition, /p_limit integer default 100/i);
  assert.match(definition, /p_cursor_bipado_em timestamptz default null/i);
  assert.match(definition, /p_cursor_id uuid default null/i);
  assert.match(definition, /p_snapshot_at timestamptz default null/i);
  assert.match(definition, /p_incluir_metricas boolean default true/i);
  assert.match(
    definition,
    /coalesce\(p_snapshot_at, statement_timestamp\(\)\) as snapshot_at/i,
  );
  assert.match(
    definition,
    /coalesce\(pacote\.finalizado_em, pacote\.bipado_em\) <=/i,
  );
  assert.match(definition, /filtrados as not materialized \(/i);
  assert.match(definition, /metricas as \([\s\S]*where p_incluir_metricas/i);
  assert.match(definition, /melhor_envio_count/i);
  assert.match(definition, /pendentes_count/i);
  assert.match(
    definition,
    /\(filtrado\.bipado_em, filtrado\.id\) < \(p_cursor_bipado_em, p_cursor_id\)/i,
  );
  assert.match(
    definition,
    /limit \(select limite\.page_limit \+ 1 from limites as limite\)/i,
  );
  assert.match(definition, /as has_more/i);
  assert.doesNotMatch(definition, /\boffset\b/i);
  assert.doesNotMatch(definition, /select\s+pacote\.\*/i);
});

test("datas usam limites de Sao Paulo sem transformar a coluna indexada", () => {
  for (const name of [
    "listar_pacotes_paginados_v2",
    "obter_dashboard_despacho",
  ]) {
    const definition = sqlFunction(name);
    assert.match(
      definition,
      /pacote\.bipado_em >= \(\s*p_data_inicio::timestamp at time zone 'America\/Sao_Paulo'/i,
    );
    assert.match(
      definition,
      /pacote\.bipado_em < \(\s*\(p_data_fim \+ 1\)::timestamp at time zone 'America\/Sao_Paulo'/i,
    );
    assert.doesNotMatch(definition, /pacote\.bipado_em::date/i);
  }
});

test("arrays preservam Todos, Nenhum e transportadora sem cadastro", () => {
  const definition = sqlFunction("listar_pacotes_paginados_v2");

  assert.match(
    definition,
    /p_loja_ids is null or pacote\.loja_id = any\(p_loja_ids\)/i,
  );
  assert.match(
    definition,
    /p_marketplace_ids is null[\s\S]*pacote\.marketplace_id = any\(p_marketplace_ids\)/i,
  );
  assert.match(definition, /not coalesce\(p_filtrar_transportadora, false\)/i);
  assert.match(definition, /p_incluir_sem_transportadora[\s\S]*transportadora_id is null/i);
  assert.match(queryHookSource, /marketplacesExplicitlyEmpty[\s\S]*marketplaceIds = \[\]/);
  assert.match(queryHookSource, /filterCarrier: carriersExplicitlyEmpty \|\| hasCarrierSelection/);
});

test("buscas contains tratam percentuais como texto e nao como wildcard", () => {
  const definition = sqlFunction("listar_pacotes_paginados_v2");

  assert.match(
    definition,
    /position\([\s\S]*normalizar_codigo_pacote\(p_busca\)[\s\S]*in public\.normalizar_codigo_pacote\(pacote\.codigo\)[\s\S]*> 0/i,
  );
  assert.match(
    definition,
    /position\([\s\S]*normalizar_codigo_pacote\(p_codigo_lote\)[\s\S]*coalesce\(sessao\.codigo_lote, sessao\.id::text, ''\)[\s\S]*> 0/i,
  );
  assert.doesNotMatch(definition, /\blike\b/i);
});

test("dashboard retorna apenas metricas, grupos e ultimos registros direcionados", () => {
  const definition = sqlFunction("obter_dashboard_despacho");

  assert.match(definition, /returns jsonb[\s\S]*security invoker/i);
  assert.match(definition, /with filtrados as materialized/i);
  assert.match(definition, /'metricas', jsonb_build_object/i);
  assert.match(definition, /'lojas', coalesce/i);
  assert.match(definition, /'resumo', coalesce/i);
  assert.match(definition, /'recentes', coalesce/i);
  const summaryCte = definition.match(
    /resumo_grupos as \([\s\S]*?\n  \)\n  select jsonb_build_object/i,
  )?.[0];
  assert.ok(summaryCte);
  assert.doesNotMatch(summaryCte, /limit 4/i);
  assert.match(definition, /limit 6/i);
  assert.match(definition, /'movement_count'/i);
  assert.match(definition, /order by movimentacao\.criada_em desc[\s\S]*limit 5/i);
  assert.match(
    databaseSource,
    /normalizeDashboardSummary[\s\S]*localeCompare\([\s\S]*"pt-BR"[\s\S]*\.slice\(0, 4\)/,
  );
});

test("RPCs respeitam auth uid, RLS e grants estreitos", () => {
  for (const name of [
    "listar_pacotes_paginados_v2",
    "obter_dashboard_despacho",
  ]) {
    const definition = sqlFunction(name);
    assert.match(definition, /security invoker/i);
    assert.match(definition, /pacote\.user_id = \(select auth\.uid\(\)\)/i);
    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon`,
        "i",
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `grant execute on function public\\.${name}\\([\\s\\S]*?to authenticated`,
        "i",
      ),
    );
  }
});

test("frontend usa RPCs com fallback somente durante rollout", () => {
  assert.match(databaseSource, /\.rpc\("listar_pacotes_paginados_v2"/);
  assert.match(databaseSource, /"obter_dashboard_despacho"/);
  assert.match(
    databaseSource,
    /if \(!isMissingRpcFunctionError\(error\)\) \{\s*throw error;/g,
  );
  assert.match(databaseSource, /source: "legacy-fallback"/);
  assert.match(queryHookSource, /retrySupabaseReadForJwtClockSkew/);
  assert.match(queryHookSource, /cursor: null,[\s\S]*snapshotAt: null/);
  assert.match(queryHookSource, /snapshotAt: null,[\s\S]*includeMetrics: true/);
  assert.match(
    queryHookSource,
    /cursor,[\s\S]*snapshotAt,[\s\S]*includeMetrics: false/,
  );
  assert.match(databaseSource, /p_incluir_metricas: pagination\.includeMetrics \?\? true/);
  assert.match(queryHookSource, /offset = state\.fallbackOffset/);
  assert.match(
    queryHookSource,
    /fallbackOffset: result\.offset \+ result\.items\.length/,
  );
  assert.match(queryHookSource, /appendUniquePackages/);
  assert.match(queryHookSource, /total: current\.total,[\s\S]*metrics: current\.metrics/);
  assert.match(queryHookSource, /expectedRequestId === requestIdRef\.current/);
  assert.match(queryHookSource, /expectedUserId === activeUserIdRef\.current/);
});

test("datas incompletas nao viram consulta de todo o historico", () => {
  assert.match(
    queryHookSource,
    /filters\.dateMode === "single" && !dateRange\.startDate/,
  );
  assert.match(
    queryHookSource,
    /filters\.dateMode === "range" && !dateRange\.endDate/,
  );
  assert.match(
    queryHookSource,
    /storeIds: incompleteDateSelection \|\| storesExplicitlyEmpty[\s\S]*\? \[\]/,
  );
});

test("Pacotes e Dashboard deixam de carregar o historico global pelo store", () => {
  const activeProfiles = storeSource.match(
    /const loadActivePackages = \[[\s\S]*?\]\.includes\(profile\);/,
  )?.[0];
  assert.ok(activeProfiles);
  assert.doesNotMatch(activeProfiles, /"pacotes"|"dashboard"/);
  assert.match(storeSource, /const loadMovements = profile === "full"/);

  assert.match(packagesSource, /usePaginatedPackageHistory\(filters, catalogs\)/);
  assert.match(packagesSource, /<PackageFilters/);
  assert.match(packagesSource, /history\.loadMore\(\)/);
  assert.match(dashboardSource, /useServerDashboardData\(filters, catalogs\)/);
  assert.match(dashboardSource, /<PackageFilters/);
  assert.match(dashboardSource, /dashboard\.storeCounts\[store\.id\]/);

  assert.match(activeProfiles, /"relatorios"/);
  assert.match(reportsSource, /useSupabaseDispatchData\("relatorios"\)/);
  assert.match(reportsSource, /filterPackages\(packages, effectiveFilters\)/);
  assert.doesNotMatch(reportsSource, /usePaginatedPackageHistory/);
});

test("indices novos acompanham conta, filtro e ordenacao", () => {
  for (const index of [
    "idx_pacotes_user_ativos_bipado_em",
    "idx_pacotes_user_loja_ativos_bipado_em",
    "idx_pacotes_user_marketplace_ativos_bipado_em",
    "idx_movimentacoes_user_pacote_criada_em",
  ]) {
    assert.match(migration, new RegExp(index, "i"));
  }
  assert.match(
    migration,
    /\(user_id, bipado_em desc, id desc\)[\s\S]*where status <> 'cancelado'/i,
  );
  assert.equal(
    migration.match(/create index concurrently if not exists/gi)?.length,
    4,
  );
  assert.doesNotMatch(migration, /^\s*begin;|^\s*commit;/im);
});

test("resumo ignora transportadora quando nao e Melhor Envio", () => {
  const definition = sqlFunction("obter_dashboard_despacho");
  assert.match(
    definition,
    /case when melhor_envio then transportadora_id::text end/i,
  );
  assert.match(
    definition,
    /case when melhor_envio then transportadora_nome end as transportadora_nome/i,
  );
});
