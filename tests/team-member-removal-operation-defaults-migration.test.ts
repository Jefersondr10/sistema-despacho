import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSource = readFileSync(
  "supabase/migrations/202609030001_team_member_removal_operation_defaults.sql",
  "utf8",
);

test("migration remove acesso sem apagar Auth ou autoria histórica", () => {
  assert.match(migrationSource, /^begin;/m);
  assert.match(migrationSource, /add column if not exists removed_at timestamptz/);
  assert.match(migrationSource, /status in \('active', 'suspended', 'removed'\)/);
  assert.match(migrationSource, /create or replace function public\.remove_account_member_v2/);
  assert.match(migrationSource, /security definer/);
  assert.match(migrationSource, /p_user_id = v_actor_id/);
  assert.match(migrationSource, /v_member\.role = 'owner'/);
  assert.match(migrationSource, /v_member\.role = 'admin'[\s\S]*v_actor_role <> 'owner'/);
  assert.match(migrationSource, /sessao\.status = 'aberta'/);
  assert.match(migrationSource, /set status = 'removed'/);
  assert.match(migrationSource, /delete from public\.account_member_permissions/);
  assert.match(migrationSource, /'team\.member_removed'/);
  assert.doesNotMatch(migrationSource, /delete\s+from\s+auth\.users/i);
  assert.match(migrationSource, /member\.status <> 'removed'/);
  assert.match(migrationSource, /grant execute on function public\.remove_account_member_v2\(uuid\)/);
});

test("regras são únicas por conta, loja e marketplace e não misturam contas", () => {
  assert.match(migrationSource, /create table if not exists public\.regras_operacao_bipagem/);
  assert.match(migrationSource, /tipo_operacao in \('coleta', 'postagem'\)/);
  assert.match(migrationSource, /foreign key \(user_id, loja_id\)[\s\S]*references public\.lojas\(user_id, id\)/);
  assert.match(migrationSource, /foreign key \(user_id, marketplace_id\)[\s\S]*references public\.marketplaces\(user_id, id\)/);
  assert.match(migrationSource, /unique \(user_id, loja_id, marketplace_id\)/);
  assert.match(migrationSource, /on conflict \(user_id, loja_id, marketplace_id\) do update/);
  assert.match(migrationSource, /loja\.user_id = v_account_id/);
  assert.match(migrationSource, /marketplace\.user_id = v_account_id/);
});

test("leitura e alteração das regras respeitam permissões e RLS", () => {
  assert.match(migrationSource, /current_account_has_permission\('cadastros\.manage'\)/);
  assert.match(migrationSource, /alter table public\.regras_operacao_bipagem enable row level security/);
  assert.match(migrationSource, /user_id = \(select public\.current_account_id\(\)\)/);
  assert.match(migrationSource, /current_account_has_permission\('bipagem\.manage'\)/);
  assert.match(migrationSource, /current_account_has_permission\('cadastros\.view'\)/);
  assert.match(migrationSource, /revoke all on table public\.regras_operacao_bipagem[\s\S]*from public, anon, authenticated/);
  assert.match(migrationSource, /grant select on table public\.regras_operacao_bipagem to authenticated/);
  assert.match(migrationSource, /grant execute on function public\.salvar_regra_operacao_bipagem\(uuid, uuid, text\)/);
  assert.match(migrationSource, /grant execute on function public\.excluir_regra_operacao_bipagem\(uuid\)/);
  assert.match(migrationSource, /append_operational_audit_event/);
  assert.match(migrationSource, /commit;\s*$/);
});
