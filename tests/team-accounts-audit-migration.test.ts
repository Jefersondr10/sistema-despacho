import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/202609010001_team_accounts_audit.sql",
  import.meta.url,
);
const sql = readFileSync(migrationPath, "utf8");

const operationalTables = [
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

test("cria contas, membros e auditoria sem reescrever user_id operacional", () => {
  assert.match(sql, /create table if not exists public\.accounts/i);
  assert.match(sql, /create table if not exists public\.account_members/i);
  assert.match(sql, /create table if not exists public\.audit_events/i);
  assert.match(
    sql,
    /insert into public\.accounts[\s\S]*from auth\.users as authenticated_user[\s\S]*on conflict \(id\) do nothing/i,
  );
  assert.match(
    sql,
    /insert into public\.account_members[\s\S]*authenticated_user\.id,[\s\S]*authenticated_user\.id,[\s\S]*'owner',[\s\S]*'active',[\s\S]*true/i,
  );
  assert.match(sql, /authenticated_user\.id::text \|\| '@local\.invalid'/i);
  assert.doesNotMatch(
    sql,
    /from auth\.users as authenticated_user\s+where authenticated_user\.email is not null\s+on conflict/i,
  );
  assert.ok(
    (sql.match(/raw_app_meta_data->>'team_account_id'/gi) ?? []).length >= 5,
    "backfills e trigger precisam preservar convites de equipe",
  );
  assert.match(sql, /Fecha a janela entre o primeiro backfill e a instalação do trigger/i);

  const beforeActorColumns = sql.slice(
    0,
    sql.indexOf("-- Autoria começa a ser preenchida"),
  );
  for (const table of operationalTables) {
    assert.doesNotMatch(
      beforeActorColumns,
      new RegExp(`(?:update|insert into|delete from) public\\.${table}\\b`, "i"),
      `backfill nao deve alterar public.${table}`,
    );
  }
  assert.doesNotMatch(sql, /alter table public\.(?:lojas|pacotes)[\s\S]{0,100}drop column user_id/i);
});

test("signup normal ganha conta e convite com app_metadata nao cria conta vazia", () => {
  const definition = functionDefinition("bootstrap_new_auth_user_account");
  assert.match(definition, /raw_app_meta_data->>'team_account_id'/i);
  assert.match(definition, /if v_team_account_id_text is not null then[\s\S]*return new;/i);
  assert.match(definition, /insert into public\.accounts/i);
  assert.match(definition, /insert into public\.account_members/i);
  assert.match(sql, /after insert on auth\.users/i);
});

test("contexto separa conta compartilhada do ator autenticado", () => {
  const current = functionDefinition("current_account_id");
  assert.match(current, /member\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(current, /member\.selected desc/i);

  const context = functionDefinition("get_current_account_context");
  for (const column of [
    "account_id uuid",
    "actor_user_id uuid",
    "role text",
    "display_name text",
    "account_name text",
    "can_manage_team boolean",
  ]) {
    assert.ok(context.includes(column), `campo de contexto ausente: ${column}`);
  }
  assert.match(context, /coalesce\(member\.display_name, member\.email\)/i);

  const requireUser = functionDefinition("exigir_usuario_autenticado");
  assert.match(requireUser, /v_account_id := public\.current_account_id\(\)/i);
  assert.match(requireUser, /return v_account_id/i);
});

test("RPCs administrativas validam convite, perfis e contrato da UI", () => {
  const addMember = functionDefinition("add_account_member");
  assert.match(
    addMember,
    /p_user_id uuid,[\s\S]*p_email text,[\s\S]*p_display_name text default null,[\s\S]*p_role text default 'operator'/i,
  );
  assert.match(addMember, /authenticated_user\.id = p_user_id/i);
  assert.match(addMember, /lower\(btrim\(authenticated_user\.email\)\) = v_email/i);
  assert.match(addMember, /raw_app_meta_data->>'team_account_id'/i);
  assert.match(addMember, /v_actor_role = 'admin' and v_role = 'admin'/i);

  const updateMember = functionDefinition("update_account_member");
  assert.match(
    updateMember,
    /p_user_id uuid,[\s\S]*p_display_name text default null,[\s\S]*p_role text default null,[\s\S]*p_status text default null/i,
  );
  assert.match(updateMember, /v_member\.role = 'owner'/i);
  assert.match(
    updateMember,
    /sessao\.iniciada_por = p_user_id[\s\S]*sessao\.status = 'aberta'/i,
  );
  assert.match(
    updateMember,
    /Finalize ou cancele o lote aberto antes de tornar este usuario somente leitura/i,
  );
  assert.match(
    updateMember,
    /coalesce\(v_status, v_member\.status\) = 'active'[\s\S]*coalesce\(v_role, v_member\.role\) = 'viewer'/i,
  );

  const snapshot = functionDefinition("list_team_admin_snapshot");
  assert.match(snapshot, /'context'/i);
  assert.match(snapshot, /'members'/i);
  assert.match(snapshot, /'activities'/i);
  assert.match(snapshot, /'last_activity_at'/i);
  assert.match(snapshot, /actor_display_name/i);
  assert.match(snapshot, /entity_table as entity_type/i);
  assert.match(snapshot, /as description/i);
});

test("RLS compartilha pela conta, bloqueia escrita do viewer e preserva defesa", () => {
  assert.match(
    sql,
    /for select to authenticated using \(user_id = \(select public\.current_account_id\(\)\)\)/i,
  );
  assert.match(
    sql,
    /for insert to authenticated with check \(user_id = \(select public\.current_account_id\(\)\) and \(select public\.current_account_can_write\(\)\)\)/i,
  );
  assert.match(
    functionDefinition("current_account_can_write"),
    /member\.role in \('owner', 'admin', 'supervisor', 'operator'\)/i,
  );
  assert.match(sql, /alter column user_id set default public\.current_account_id\(\)/i);
});

test("autoria e auditoria sao impostas pelo banco e permanecem append-only", () => {
  for (const column of [
    "criado_por",
    "atualizado_por",
    "iniciada_por",
    "finalizada_por",
    "cancelada_por",
    "bipado_por",
    "removido_por",
    "finalizado_por",
    "cancelado_por",
    "realizado_por",
  ]) {
    assert.match(sql, new RegExp(`add column if not exists ${column} uuid`, "i"));
  }
  assert.match(functionDefinition("stamp_operational_actor"), /v_actor_id uuid := auth\.uid\(\)/i);
  assert.match(
    functionDefinition("append_operational_audit_event"),
    /tg_op = 'INSERT'[\s\S]*v_action := 'sessoes_bipagem\.aberta'/i,
  );
  assert.match(sql, /revoke all on table public\.audit_events from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete)[^;]*audit_events/i);
  assert.match(sql, /after insert on public\.itens_sessao_bipagem/i);
  assert.match(
    sql,
    /after update of status on public\.itens_sessao_bipagem[\s\S]*old\.status = 'pendente'[\s\S]*new\.status in \('descartado', 'cancelado'\)[\s\S]*new\.removido_por is not null/i,
  );
  assert.match(
    functionDefinition("append_operational_audit_event"),
    /v_action := 'itens_sessao_bipagem\.removido'/i,
  );
  assert.match(
    functionDefinition("append_operational_audit_event"),
    /'relatorio_envios\.enviado'[\s\S]*'relatorio_envios\.erro'/i,
  );
  assert.doesNotMatch(sql, /after update on public\.pacotes/i);
  assert.doesNotMatch(sql, /after insert on public\.movimentacoes/i);
});

test("lotes novos sao isolados por conta, operador e aparelho e legado so pelo owner", () => {
  assert.match(
    sql,
    /unique index(?: if not exists)? idx_sessoes_bipagem_conta_operador_estacao_aberta[\s\S]*\(user_id, iniciada_por, estacao_id\)/i,
  );
  assert.match(
    sql,
    /unique index(?: if not exists)? idx_sessoes_bipagem_conta_estacao_legada_aberta[\s\S]*\(user_id, estacao_id\)[\s\S]*iniciada_por is null/i,
  );
  const restore = functionDefinition("obter_sessao_bipagem_aberta");
  assert.match(restore, /sessao\.iniciada_por = v_actor_id/i);
  assert.match(restore, /v_account_id = v_actor_id/i);
  assert.match(restore, /sessao\.estacao_id = p_estacao_id/i);

  const start = functionDefinition("iniciar_sessao_bipagem_independente");
  assert.match(start, /public\.obter_sessao_bipagem_aberta\(p_estacao_id\)/i);
  assert.match(start, /v_account_id,[\s\S]*v_actor_id,[\s\S]*p_estacao_id/i);
  assert.match(start, /team-member-operations:/i);

  const updateMember = functionDefinition("update_account_member");
  assert.match(updateMember, /team-member-operations:/i);
});

test("buscas, bipagem e dashboard usam account_id enquanto autoria usa auth.uid", () => {
  for (const name of [
    "buscar_pacote_ativo_global_normalizado",
    "buscar_pacote_ativo_normalizado",
    "buscar_pacotes_finalizados_normalizado",
    "listar_pacotes_paginados_v2",
    "obter_dashboard_despacho",
  ]) {
    const definition = functionDefinition(name);
    assert.match(definition, /public\.current_account_id\(\)/i, `${name} sem account_id`);
    assert.doesNotMatch(definition, /user_id = \(select auth\.uid\(\)\)/i);
  }

  for (const name of [
    "adicionar_item_sessao_bipagem_v3",
    "remover_item_sessao_bipagem_v2",
    "finalizar_sessao_bipagem",
    "cancelar_sessao_bipagem",
  ]) {
    const definition = functionDefinition(name);
    assert.match(definition, /v_actor_id uuid := auth\.uid\(\)/i);
    assert.match(definition, /v_account_id uuid := public\.exigir_usuario_autenticado\(\)/i);
  }
});

test("funcoes SECURITY DEFINER nao ficam executaveis por PUBLIC ou anon", () => {
  for (const signature of [
    "current_account_id\\(\\)",
    "current_account_can_write\\(\\)",
    "current_account_is_admin\\(\\)",
    "get_current_account_context\\(\\)",
    "add_account_member\\(uuid, text, text, text\\)",
    "update_account_member\\(uuid, text, text, text\\)",
    "list_team_admin_snapshot\\(\\)",
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*?from public, anon, authenticated`, "i"),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*?to authenticated`, "i"),
    );
  }
  assert.match(sql, /commit;\s*$/i);
  assert.doesNotMatch(sql, /public\.feedbacks|public\.feedback_admins/i);
});
