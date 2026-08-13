import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/202608120001_bipagem_performance.sql",
  import.meta.url,
);
const sql = readFileSync(migrationPath, "utf8");

function functionDefinition(name: string) {
  const match = sql.match(
    new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
      "i",
    ),
  );
  assert.ok(match, `funcao ${name} nao encontrada`);
  return match[0];
}

test("busca normalizada retorna somente o id e usa o indice funcional", () => {
  const definition = functionDefinition("buscar_pacote_ativo_normalizado");

  assert.match(definition, /p_codigo text,\s*p_loja_id uuid/i);
  assert.match(definition, /returns table\(id uuid\)/i);
  assert.match(definition, /stable\s+security invoker/i);
  assert.match(definition, /select pacote\.id/i);
  assert.doesNotMatch(definition, /select\s+\*/i);
  assert.doesNotMatch(definition, /\bjoin\b/i);
  assert.match(definition, /pacote\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(definition, /pacote\.loja_id = p_loja_id/i);
  assert.match(
    definition,
    /normalizar_codigo_pacote\(pacote\.codigo\)[\s\S]*normalizar_codigo_pacote\(p_codigo\)/i,
  );
  assert.match(definition, /pacote\.status <> 'cancelado'/i);
  assert.match(definition, /limit 1/i);
});

test("adicao serializa a sessao e atualiza somente o codigo repetido", () => {
  const definition = functionDefinition("adicionar_item_sessao_bipagem_v2");

  assert.match(
    definition,
    /returns setof public\.itens_sessao_bipagem[\s\S]*security invoker/i,
  );
  assert.match(
    definition,
    /from public\.sessoes_bipagem as sessao[\s\S]*for update/i,
  );
  assert.match(
    definition,
    /item\.ordem is not null\s+order by item\.ordem desc nulls last\s+limit 1/i,
  );
  assert.match(
    definition,
    /item\.codigo_normalizado = v_codigo_normalizado[\s\S]*item\.status = 'pendente'/i,
  );
  assert.match(definition, /and item\.duplicado is distinct from true/i);
  assert.match(definition, /returning \* into v_item/i);
  assert.match(definition, /return next v_item/i);
  assert.doesNotMatch(definition, /recalcular_duplicados_sessao_bipagem/i);
  assert.doesNotMatch(definition, /return query/i);
});

test("remocao devolve uma linha e corrige apenas o ultimo igual restante", () => {
  const definition = functionDefinition("remover_item_sessao_bipagem_v2");

  assert.match(
    definition,
    /returns setof public\.itens_sessao_bipagem[\s\S]*security invoker/i,
  );
  assert.match(
    definition,
    /from public\.sessoes_bipagem as sessao[\s\S]*for update/i,
  );
  assert.match(definition, /limit 2/i);
  assert.match(definition, /if v_restantes = 1 then/i);
  assert.match(
    definition,
    /item\.codigo_normalizado = v_codigo_normalizado[\s\S]*item\.duplicado is distinct from false/i,
  );
  assert.match(definition, /return next v_item/i);
  assert.doesNotMatch(definition, /recalcular_duplicados_sessao_bipagem/i);
  assert.doesNotMatch(definition, /return query/i);
  assert.match(definition, /select sessao\.status[\s\S]*for update/i);
  assert.match(definition, /if v_sessao_status <> 'aberta' then/i);
  assert.match(definition, /item\.status = 'pendente'[\s\S]*for update/i);
});

test("migration preserva as RPCs v1 durante o rollout", () => {
  assert.doesNotMatch(
    sql,
    /create or replace function public\.adicionar_item_sessao_bipagem\s*\(/i,
  );
  assert.doesNotMatch(
    sql,
    /create or replace function public\.remover_item_sessao_bipagem\s*\(/i,
  );
});

test("migracao cria indices parciais dos caminhos quentes", () => {
  assert.match(
    sql,
    /idx_itens_bipagem_user_sessao_codigo_pendentes[\s\S]*\(user_id, sessao_id, codigo_normalizado\)[\s\S]*where status = 'pendente'/i,
  );
  assert.match(
    sql,
    /idx_itens_bipagem_user_sessao_ordem_pendentes[\s\S]*\(user_id, sessao_id, ordem desc\)[\s\S]*where status = 'pendente'/i,
  );
  assert.match(
    sql,
    /idx_sessoes_bipagem_user_abertas_recentes[\s\S]*\(user_id, iniciada_em desc\)[\s\S]*where status = 'aberta'/i,
  );
  for (const indexName of [
    "idx_pacotes_user_bipado_em",
    "idx_sessoes_bipagem_user_finalizadas_recentes",
    "idx_movimentacoes_user_criada_em",
    "idx_pacotes_cancelados_user_cancelado_em",
  ]) {
    assert.match(sql, new RegExp(indexName, "i"));
  }
});

test("politicas usam auth.uid como initPlan e alteracao condicional", () => {
  assert.match(sql, /select 1 from pg_policies/i);
  assert.match(
    sql,
    /alter policy %I on public\.%I using \(user_id = \(select auth\.uid\(\)\)\)/i,
  );
  assert.match(
    sql,
    /with check \(user_id = \(select auth\.uid\(\)\)\)/i,
  );
});

test("novas RPCs continuam indisponiveis para anon", () => {
  for (const signature of [
    "buscar_pacote_ativo_normalizado\\(text, uuid\\)",
    "adicionar_item_sessao_bipagem_v2\\(text, uuid\\)",
    "remover_item_sessao_bipagem_v2\\(uuid, text\\)",
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke execute on function public\\.${signature}[\\s\\S]*?from public, anon`, "i"),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*?to authenticated`, "i"),
    );
  }
});
