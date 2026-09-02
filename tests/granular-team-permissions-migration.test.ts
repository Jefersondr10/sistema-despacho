import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/202609010002_granular_team_permissions.sql",
  import.meta.url,
);
const sql = readFileSync(migrationPath, "utf8");

const permissionKeys = [
  "dashboard.view",
  "bipagem.manage",
  "pacotes.view",
  "cancelamentos.view",
  "cancelamentos.manage",
  "relatorios.view",
  "relatorios.send",
  "cadastros.view",
  "cadastros.manage",
  "team.manage",
] as const;

function functionDefinition(name: string) {
  const definition = sql.match(
    new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
      "i",
    ),
  )?.[0];
  assert.ok(definition, `funcao ${name} ausente`);
  return definition;
}

test("migration e aditiva e normaliza grants por membro", () => {
  assert.match(
    sql,
    /alter table public\.account_members[\s\S]*add column if not exists permissions_initialized boolean not null default false/i,
  );
  assert.match(
    sql,
    /create table if not exists public\.account_member_permissions/i,
  );
  assert.match(
    sql,
    /foreign key \(account_id, user_id\)[\s\S]*references public\.account_members\(account_id, user_id\)[\s\S]*on delete cascade/i,
  );
  assert.match(sql, /primary key \(account_id, user_id, permission\)/i);

  for (const permission of permissionKeys) {
    assert.ok(sql.includes(`'${permission}'`), `permissao ausente: ${permission}`);
  }

  assert.doesNotMatch(
    sql,
    /(?:update|delete from) public\.(?:lojas|marketplaces|transportadoras|relatorio_destinatarios|relatorio_envios|sessoes_bipagem|itens_sessao_bipagem|pacotes|movimentacoes|pacotes_cancelados)\b/i,
  );
});

test("reexecução não restaura permissões removidas de membros personalizados", () => {
  const backfills = [
    ...sql.matchAll(
      /insert into public\.account_member_permissions[\s\S]*?on conflict \(account_id, user_id, permission\) do nothing;/gi,
    ),
  ].filter(([statement]) =>
    statement.includes("from public.account_members as member"),
  );

  assert.ok(backfills.length >= 2, "os dois backfills devem estar presentes");
  for (const [statement] of backfills.slice(0, 2)) {
    assert.match(statement, /where not member\.permissions_initialized/i);
  }
});

test("dependencias sao expandidas e entradas desconhecidas sao rejeitadas", () => {
  const normalize = functionDefinition("normalize_account_permissions");
  assert.match(normalize, /not \(v_permission = any\(v_allowed\)\)/i);
  assert.match(
    normalize,
    /'cancelamentos\.manage' = any\(v_permissions\)[\s\S]*'bipagem\.manage'[\s\S]*'cancelamentos\.view'[\s\S]*'pacotes\.view'/i,
  );
  assert.match(
    normalize,
    /'relatorios\.send' = any\(v_permissions\)[\s\S]*'relatorios\.view'/i,
  );
  assert.match(
    normalize,
    /'cadastros\.manage' = any\(v_permissions\)[\s\S]*'cadastros\.view'/i,
  );
  assert.match(normalize, /select distinct permission/i);
});

test("backfill preserva os cinco perfis e fecha a janela concorrente", () => {
  const legacy = functionDefinition("legacy_account_role_permissions");
  for (const role of ["owner", "admin", "supervisor", "operator", "viewer"]) {
    assert.match(legacy, new RegExp(`when '${role}'`, "i"));
  }
  assert.match(
    sql,
    /insert into public\.account_member_permissions[\s\S]*public\.legacy_account_role_permissions\(member\.role\)[\s\S]*on conflict \(account_id, user_id, permission\) do nothing/i,
  );
  assert.match(
    sql,
    /create trigger sync_legacy_account_member_permissions_insert[\s\S]*after insert on public\.account_members/i,
  );
  assert.match(
    sql,
    /create trigger sync_legacy_account_member_permissions_role[\s\S]*before update of role on public\.account_members/i,
  );
  assert.ok(
    (sql.match(/where not permissions_initialized/gi) ?? []).length >= 2,
    "migration precisa reconciliar membros apos instalar os triggers",
  );
});

test("owner e admin tem acesso total, sem transformar team.manage em admin legado", () => {
  const getPermissions = functionDefinition("get_current_account_permissions");
  assert.match(
    getPermissions,
    /member\.role in \('owner', 'admin'\)[\s\S]*legacy_account_role_permissions\(member\.role\)/i,
  );
  assert.match(getPermissions, /member\.status = 'active'/i);

  const hasPermission = functionDefinition("current_account_has_permission");
  assert.match(hasPermission, /not \(v_permission = any\(v_allowed\)\)[\s\S]*return false/i);
  assert.match(hasPermission, /get_current_account_permissions\(\)/i);

  const isAdmin = functionDefinition("current_account_is_admin");
  assert.match(isAdmin, /member\.role in \('owner', 'admin'\)/i);
  assert.doesNotMatch(isAdmin, /team\.manage/i);

  const context = functionDefinition("get_current_account_context");
  assert.match(context, /returns table \([\s\S]*can_manage_team boolean[\s\S]*\)/i);
  assert.match(context, /member\.role in \('owner', 'admin'\)[\s\S]*current_account_has_permission\('team\.manage'\)/i);
});

test("RPCs v2 recebem arrays, protegem self-service e privilegios da equipe", () => {
  const addMember = functionDefinition("add_account_member_v2");
  assert.match(
    addMember,
    /p_user_id uuid,[\s\S]*p_email text,[\s\S]*p_display_name text default null,[\s\S]*p_permissions text\[\] default '\{\}'::text\[\],[\s\S]*p_role text default 'operator'/i,
  );
  assert.match(addMember, /normalize_account_permissions\(p_permissions\)/i);
  assert.match(addMember, /p_user_id = v_actor_id[\s\S]*proprio acesso/i);
  assert.match(
    addMember,
    /'team\.manage' = any\(v_permissions\)[\s\S]*v_actor_role <> 'owner'/i,
  );
  assert.match(addMember, /v_existing_role = 'owner'[\s\S]*imutavel/i);
  assert.ok(
    addMember.indexOf("perform pg_advisory_xact_lock") >= 0 &&
      addMember.indexOf("perform pg_advisory_xact_lock") <
        addMember.indexOf("select exists ("),
    "add v2 deve travar o membro antes de ler e validar seu estado",
  );

  const updateMember = functionDefinition("update_account_member_v2");
  assert.match(
    updateMember,
    /p_user_id uuid,[\s\S]*p_display_name text default null,[\s\S]*p_status text default null,[\s\S]*p_permissions text\[\] default null,[\s\S]*p_role text default null/i,
  );
  assert.match(updateMember, /p_user_id = v_actor_id[\s\S]*proprio acesso/i);
  assert.match(updateMember, /v_member\.role = 'owner'[\s\S]*imutavel/i);
  assert.match(
    updateMember,
    /team\.manage[\s\S]*is distinct from[\s\S]*v_actor_role <> 'owner'/i,
  );
  assert.match(
    updateMember,
    /v_next_status = 'active'[\s\S]*not \('bipagem\.manage' = any\(v_permissions\)\)[\s\S]*sessao\.status = 'aberta'[\s\S]*retirar a permissao de bipagem/i,
  );
  assert.match(
    updateMember,
    /when v_next_status = 'suspended' then false/i,
  );
});

test("snapshot v2 expoe grants efetivos e catalogo sem mudar o contexto v1", () => {
  const snapshot = functionDefinition("list_team_admin_snapshot_v2");
  assert.match(snapshot, /'available_permissions'/i);
  assert.match(snapshot, /'permissions_initialized'/i);
  assert.match(snapshot, /'permissions'/i);
  assert.match(snapshot, /'context'/i);
  assert.match(snapshot, /'members'/i);
  assert.match(snapshot, /'activities'/i);
  assert.match(
    snapshot,
    /current_account_is_admin\(\)[\s\S]*current_account_has_permission\('team\.manage'\)/i,
  );
});

test("RLS e trigger exigem capacidade exata para cada familia de escrita", () => {
  const guard = functionDefinition("enforce_operational_permission");
  assert.match(
    guard,
    /tg_table_name in \('lojas', 'marketplaces', 'transportadoras', 'relatorio_destinatarios'\)[\s\S]*'cadastros\.manage'/i,
  );
  assert.match(guard, /tg_table_name = 'relatorio_envios'[\s\S]*'relatorios\.send'/i);
  assert.match(
    guard,
    /tg_table_name in \('sessoes_bipagem', 'itens_sessao_bipagem'\)[\s\S]*'bipagem\.manage'/i,
  );
  assert.match(guard, /tg_table_name = 'pacotes_cancelados'[\s\S]*'cancelamentos\.manage'/i);
  assert.match(
    guard,
    /tg_table_name = 'pacotes'[\s\S]*v_row->>'status' = 'cancelado'[\s\S]*'cancelamentos\.manage'/i,
  );
  assert.match(
    sql,
    /on public\.relatorio_envios for insert to authenticated[\s\S]*current_account_has_permission\('relatorios\.send'\)/i,
  );
  assert.match(
    sql,
    /on public\.pacotes_cancelados for insert to authenticated[\s\S]*current_account_has_permission\('cancelamentos\.manage'\)/i,
  );
  assert.match(
    sql,
    /create trigger enforce_operational_permission before insert or update or delete/i,
  );
});

test("tabela e funcoes internas nao aceitam mutacao direta do navegador", () => {
  assert.match(
    sql,
    /revoke all on table public\.account_member_permissions[\s\S]*from public, anon, authenticated/i,
  );
  assert.doesNotMatch(
    sql,
    /grant (?:insert|update|delete)[^;]*account_member_permissions/i,
  );
  for (const signature of [
    "get_current_account_permissions\\(\\)",
    "current_account_has_permission\\(text\\)",
    "add_account_member_v2\\([\\s\\S]*?\\)",
    "update_account_member_v2\\([\\s\\S]*?\\)",
    "list_team_admin_snapshot_v2\\(\\)",
  ]) {
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*?to authenticated`, "i"),
    );
  }
  assert.doesNotMatch(sql, /drop function public\.(?:add_account_member|update_account_member|list_team_admin_snapshot)\b/i);
  assert.match(sql, /commit;\s*$/i);
});
