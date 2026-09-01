import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const apiSource = readFileSync("app/api/equipe/route.ts", "utf8");
const pageSource = readFileSync("app/equipe/page.tsx", "utf8");
const viewSource = readFileSync("app/equipe/team-management-view.tsx", "utf8");
const navigationSource = readFileSync("app/_components/navigation.tsx", "utf8");
const teamContextSource = readFileSync("app/_lib/team-context.tsx", "utf8");
const shellSource = readFileSync("app/_components/authenticated-app-shell.tsx", "utf8");

test("API de equipe autentica e autoriza usando o contexto da conta", () => {
  assert.match(apiSource, /Authorization|authorization/);
  assert.match(apiSource, /auth\.getUser\(token\)/);
  assert.match(apiSource, /rpc\("get_current_account_context"\)/);
  assert.match(apiSource, /context\.can_manage_team/);
  assert.match(apiSource, /\["owner", "admin"\]/);
});

test("GET retorna snapshot administrativo sem cache", () => {
  assert.match(apiSource, /export const dynamic = "force-dynamic"/);
  assert.match(apiSource, /export async function GET/);
  assert.match(apiSource, /rpc\("list_team_admin_snapshot"\)/);
});

test("cadastro usa service role apenas no servidor e desfaz login órfão", () => {
  assert.match(apiSource, /import "server-only"/);
  assert.match(apiSource, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(apiSource, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(apiSource, /auth\.admin\.createUser/);
  assert.match(apiSource, /app_metadata: \{ team_account_id: context\.account_id \}/);
  assert.match(apiSource, /rpc\("add_account_member"/);
  assert.match(apiSource, /auth\.admin\.deleteUser\(createdUserId\)/);
});

test("atualização de membro permanece sob RPC autenticada", () => {
  assert.match(apiSource, /export async function PATCH/);
  assert.match(apiSource, /rpc\("update_account_member"/);
  assert.match(apiSource, /p_user_id: body\.userId/);
  assert.match(apiSource, /p_status: body\.status/);
  assert.match(apiSource, /assertAdminCanManageMember/);
  assert.match(apiSource, /Somente o proprietário pode gerenciar administradores/);
  assert.match(apiSource, /Finalize ou cancele o lote aberto antes de tornar este usuário somente leitura/);
});

test("tela oferece cadastro, perfis, suspensão e histórico", () => {
  assert.match(pageSource, /title="Equipe"/);
  assert.match(viewSource, /Senha inicial/);
  assert.match(viewSource, /Cadastrar usuário/);
  assert.match(viewSource, /TEAM_ROLES\.filter/);
  assert.match(viewSource, /snapshot\?\.context\.role === "owner" \|\| option !== "admin"/);
  assert.match(viewSource, /Suspender/);
  assert.match(viewSource, /Atividades recentes/);
  assert.match(viewSource, /"itens_sessao_bipagem\.removido": "Código removido do lote"/);
  assert.match(viewSource, /"relatorio_envios\.enviado": "Relatório enviado"/);
  assert.match(viewSource, /"relatorio_envios\.erro": "Falha ao enviar relatório"/);
  assert.match(viewSource, /status === 403/);
});

test("Equipe aparece na navegação sem alterar a rota de bipagem", () => {
  assert.match(navigationSource, /href: "\/equipe", label: "Equipe", icon: "team"/);
  assert.match(navigationSource, /teamContext\?\.can_manage_team/);
  assert.match(navigationSource, /href: "\/bipagem", label: "Bipar Pacotes"/);
});

test("contexto de equipe acompanha a autenticação e preserva rollout legado", () => {
  assert.match(teamContextSource, /rpc\(\s*"get_current_account_context"/);
  assert.match(teamContextSource, /isMissingTeamContextRpc/);
  assert.match(teamContextSource, /getLegacyOwnerContext/);
  assert.match(teamContextSource, /actor_user_id !== user\.id/);
  assert.match(shellSource, /<AuthProvider>[\s\S]*<TeamProvider>/);
});
