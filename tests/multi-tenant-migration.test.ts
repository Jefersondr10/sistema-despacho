import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/202607170001_multi_tenant_accounts.sql",
  import.meta.url,
);
const sql = readFileSync(migrationPath, "utf8");

const tables = [
  "lojas",
  "marketplaces",
  "transportadoras",
  "relatorio_destinatarios",
  "relatorio_envios",
  "sessoes_bipagem",
  "itens_sessao_bipagem",
  "pacotes",
  "movimentacoes",
  "pacotes_cancelados",
];

test("migration faz backfill explicito antes de tornar user_id obrigatorio", () => {
  assert.match(sql, /begin;/i);
  assert.match(sql, /v_owner_email constant text := 'OWNER_EMAIL_AQUI'/);
  assert.match(sql, /where lower\(email\) = lower\(btrim\(v_owner_email\)\)/);
  assert.match(sql, /BACKFILL BLOQUEADO/);
  assert.doesNotMatch(sql, /order by created_at[\s\S]*limit 1/i);

  const backfillPosition = sql.indexOf("set user_id = $1 where user_id is null");
  const notNullPosition = sql.indexOf("alter column user_id set not null");
  assert.ok(backfillPosition > 0 && backfillPosition < notNullPosition);

  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} add column if not exists user_id uuid`));
  }
});

test("migration cria quatro politicas RLS por tabela usando auth.uid", () => {
  assert.match(sql, /for select to authenticated using \(user_id = auth\.uid\(\)\)/);
  assert.match(sql, /for insert to authenticated with check \(user_id = auth\.uid\(\)\)/);
  assert.match(
    sql,
    /for update to authenticated using \(user_id = auth\.uid\(\)\) with check \(user_id = auth\.uid\(\)\)/,
  );
  assert.match(sql, /for delete to authenticated using \(user_id = auth\.uid\(\)\)/);
  assert.match(sql, /alter table public\.%I enable row level security/);
});

test("migration protege relacionamentos e RPCs sem SECURITY DEFINER", () => {
  const expectedCompositeRelations = [
    "foreign key (loja_id, user_id) references public.lojas (id, user_id)",
    "foreign key (marketplace_id, user_id) references public.marketplaces (id, user_id)",
    "foreign key (sessao_id, user_id) references public.sessoes_bipagem (id, user_id)",
    "foreign key (pacote_id, user_id) references public.pacotes (id, user_id)",
  ];

  for (const relation of expectedCompositeRelations) {
    assert.ok(sql.includes(relation), `relacao ausente: ${relation}`);
  }

  for (const functionName of [
    "gerar_codigo_lote",
    "adicionar_item_sessao_bipagem",
    "remover_item_sessao_bipagem",
    "recalcular_duplicados_sessao_bipagem",
    "finalizar_sessao_bipagem",
    "cancelar_sessao_bipagem",
    "finalizar_cancelamentos_lote",
  ]) {
    assert.match(sql, new RegExp(`function public\\.${functionName}`));
  }

  assert.match(sql, /v_user_id uuid := public\.exigir_usuario_autenticado\(\)/);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /revoke all on table[\s\S]*from anon;/i);
});
