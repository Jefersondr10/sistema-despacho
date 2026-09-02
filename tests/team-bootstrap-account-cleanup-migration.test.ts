import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/202609020001_remove_team_bootstrap_accounts.sql",
  import.meta.url,
);
const sql = readFileSync(migrationPath, "utf8");

function requiredMatch(source: string, expression: RegExp, label: string) {
  const match = source.match(expression);
  assert.ok(match, `${label} nao encontrado`);
  return match[0];
}

const cleanupFunction = requiredMatch(
  sql,
  /create or replace function public\.cleanup_pristine_team_bootstrap_account\([\s\S]*?\n\$\$;/i,
  "funcao de limpeza",
);
const guardedDelete = requiredMatch(
  cleanupFunction,
  /delete from public\.accounts as bootstrap_account[\s\S]*?;\s*\n\s*get diagnostics/i,
  "delete protegido",
);
const metadataTriggerFunction = requiredMatch(
  sql,
  /create or replace function public\.cleanup_team_bootstrap_after_auth_metadata\(\)[\s\S]*?\n\$\$;/i,
  "funcao do trigger de metadata",
);
const backfill = requiredMatch(
  sql,
  /-- Reconcilia convites anteriores\.[\s\S]*?\nend;\s*\n\$\$;/i,
  "backfill",
);

const operationalTables = [
  "audit_events",
  "lojas",
  "marketplaces",
  "transportadoras",
  "sessoes_bipagem",
  "itens_sessao_bipagem",
  "pacotes",
  "movimentacoes",
  "pacotes_cancelados",
  "relatorio_destinatarios",
  "relatorio_envios",
];

test("limpeza nasce da persistencia do team_account_id no auth.users", () => {
  assert.match(
    sql,
    /create trigger cleanup_team_bootstrap_after_auth_metadata\s+after update of raw_app_meta_data on auth\.users/i,
  );
  assert.doesNotMatch(
    sql,
    /create trigger remove_pristine_team_bootstrap_account[\s\S]*after insert on public\.account_members/i,
  );
  assert.match(
    metadataTriggerFunction,
    /v_new_team_account_id_text is not distinct from v_old_team_account_id_text[\s\S]*return new/i,
  );
  assert.match(
    metadataTriggerFunction,
    /v_team_account_id := v_new_team_account_id_text::uuid[\s\S]*exception when invalid_text_representation[\s\S]*return new/i,
  );
  assert.match(
    metadataTriggerFunction,
    /perform public\.cleanup_pristine_team_bootstrap_account\(\s*new\.id,\s*v_team_account_id\s*\)/i,
  );
});

test("funcao fecha as janelas de concorrencia antes de avaliar a conta", () => {
  assert.match(
    cleanupFunction,
    /pg_advisory_xact_lock\([\s\S]*hashtextextended\('team-bootstrap:' \|\| p_user_id::text, 0\)/i,
  );
  assert.match(
    cleanupFunction,
    /from auth\.users as invited_user[\s\S]*invited_user\.id = p_user_id[\s\S]*for update/i,
  );
  assert.match(
    cleanupFunction,
    /lock table\s+public\.accounts,\s+public\.account_members,\s+public\.account_member_permissions\s+in share row exclusive mode/i,
  );

  const operationalLock = requiredMatch(
    cleanupFunction,
    /lock table\s+public\.audit_events,[\s\S]*?in share mode;/i,
    "lock das tabelas operacionais",
  );
  for (const table of operationalTables) {
    assert.match(
      operationalLock,
      new RegExp(`public\\.${table}\\b`, "i"),
      `lock ausente para ${table}`,
    );
  }
});

test("DELETE repete diretamente todas as guardas de conta bootstrap intacta", () => {
  assert.match(
    guardedDelete,
    /bootstrap_account\.id = p_user_id[\s\S]*bootstrap_account\.owner_user_id = p_user_id/i,
  );
  assert.match(
    guardedDelete,
    /raw_app_meta_data->>'team_account_id'[\s\S]*= p_team_account_id::text/i,
  );
  assert.match(
    guardedDelete,
    /intended_account\.id = p_team_account_id[\s\S]*intended_account\.active/i,
  );
  assert.match(
    guardedDelete,
    /select count\(\*\)[\s\S]*from public\.account_members as bootstrap_member[\s\S]*bootstrap_member\.account_id = p_user_id[\s\S]*\) = 1/i,
  );
  assert.match(
    guardedDelete,
    /bootstrap_owner\.account_id = p_user_id[\s\S]*bootstrap_owner\.user_id = p_user_id[\s\S]*bootstrap_owner\.role = 'owner'/i,
  );

  for (const table of operationalTables) {
    const accountColumn = table === "audit_events" ? "account_id" : "user_id";
    assert.match(
      guardedDelete,
      new RegExp(
        `not exists \\(\\s*select 1 from public\\.${table}\\s+where ${accountColumn} = p_user_id\\s*\\)`,
        "i",
      ),
      `guarda direta ausente para ${table}`,
    );
  }

  assert.match(
    cleanupFunction,
    /get diagnostics v_deleted_count = row_count;[\s\S]*return v_deleted_count = 1/i,
  );
});

test("backfill exige vinculo real exatamente com a conta indicada no metadata", () => {
  assert.match(backfill, /raw_app_meta_data->>'team_account_id'/i);
  assert.match(
    backfill,
    /v_team_account_id := v_candidate\.team_account_id_text::uuid[\s\S]*exception when invalid_text_representation[\s\S]*continue/i,
  );
  assert.match(
    backfill,
    /intended_membership\.user_id = v_candidate\.user_id[\s\S]*intended_membership\.account_id = v_team_account_id[\s\S]*intended_membership\.account_id <> v_candidate\.user_id/i,
  );
  assert.doesNotMatch(backfill, /intended_membership\.(?:status|selected)/i);
  assert.match(
    backfill,
    /perform public\.cleanup_pristine_team_bootstrap_account\(\s*v_candidate\.user_id,\s*v_team_account_id\s*\)/i,
  );
});

test("migration e idempotente, transacional e nao expoe funcoes aos clientes", () => {
  assert.match(
    sql,
    /drop trigger if exists remove_pristine_team_bootstrap_account\s+on public\.account_members/i,
  );
  assert.match(
    sql,
    /drop trigger if exists cleanup_team_bootstrap_after_auth_metadata\s+on auth\.users/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.cleanup_pristine_team_bootstrap_account\(uuid, uuid\)\s+from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.cleanup_team_bootstrap_after_auth_metadata\(\)\s+from public, anon, authenticated/i,
  );
  assert.doesNotMatch(
    sql,
    /delete from public\.(?:audit_events|lojas|marketplaces|transportadoras|sessoes_bipagem|itens_sessao_bipagem|pacotes|movimentacoes|pacotes_cancelados|relatorio_destinatarios|relatorio_envios)\b/i,
  );
  assert.match(sql, /\bbegin;[\s\S]*commit;\s*$/i);
});
