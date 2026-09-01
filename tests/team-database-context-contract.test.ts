import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const databaseSource = readFileSync(
  new URL("../lib/database.ts", import.meta.url),
  "utf8",
);

function sectionBetween(start: string, end: string) {
  const startIndex = databaseSource.indexOf(start);
  const endIndex = databaseSource.indexOf(end, startIndex + start.length);

  assert.notEqual(startIndex, -1, `inicio ausente: ${start}`);
  assert.notEqual(endIndex, -1, `fim ausente: ${end}`);

  return databaseSource.slice(startIndex, endIndex);
}

test("contexto separa ator autenticado da conta operacional", () => {
  const contextSource = sectionBetween(
    "async function resolveCurrentAccountContext(",
    "function withAuthenticatedOwner",
  );

  assert.match(contextSource, /\.rpc\("get_current_account_context"\)/);
  assert.match(contextSource, /row\?\.account_id\?\.trim\(\)/);
  assert.match(contextSource, /row\?\.actor_user_id\?\.trim\(\)/);
  assert.match(contextSource, /resolvedActorUserId !== actorUserId/);
  assert.match(contextSource, /row\.member_status !== "active"/);
  assert.match(contextSource, /userId: accountContext\.accountId/);
  assert.match(contextSource, /accountId: accountContext\.accountId/);
  assert.match(contextSource, /actorUserId: accountContext\.actorUserId/);
  assert.match(contextSource, /role: accountContext\.role/);
});

test("cache e fallback permitem rollout sem esconder erros reais", () => {
  const resolverSource = sectionBetween(
    "async function resolveCurrentAccountContext(",
    "async function getDatabaseContext(",
  );

  assert.match(databaseSource, /new WeakMap<[\s\S]*SupabaseClient/);
  assert.match(resolverSource, /cached\.expiresAt > Date\.now\(\)/);
  assert.match(resolverSource, /if \(error && isMissingRpcFunctionError\(error\)\)/);
  assert.match(
    resolverSource,
    /accountId: actorUserId,[\s\S]*actorUserId,[\s\S]*role: "owner" as const/,
  );
  assert.match(resolverSource, /if \(error\) \{\s*throw error;/);
  assert.match(resolverSource, /clientCache\.delete\(actorUserId\)/);

  const missingRpcSource = sectionBetween(
    "function isMissingRpcFunctionError(",
    "export function mapLojaRowToStore",
  );
  assert.match(missingRpcSource, /code === "PGRST202"/);
  assert.match(missingRpcSource, /code === "42883"/);
});

test("feedback pessoal continua isolado pelo ator, nao pela conta", () => {
  const ownFeedbackSource = sectionBetween(
    "export async function getOwnFeedbackPage(",
    "export async function getFeedbacksForManagement(",
  );

  assert.match(
    ownFeedbackSource,
    /const \{ supabase, actorUserId \} = await getDatabaseContext\(context\)/,
  );
  assert.match(ownFeedbackSource, /\.eq\("user_id", actorUserId\)/);
  assert.doesNotMatch(ownFeedbackSource, /\.eq\("user_id", userId\)/);
});

test("tipos operacionais expõem autoria sem exigir backfill legado", () => {
  const expectedFields = [
    "criado_por?: string | null",
    "atualizado_por?: string | null",
    "iniciada_por?: string | null",
    "finalizada_por?: string | null",
    "cancelada_por?: string | null",
    "bipado_por?: string | null",
    "removido_por?: string | null",
    "finalizado_por?: string | null",
    "cancelado_por?: string | null",
    "realizado_por?: string | null",
  ];

  for (const field of expectedFields) {
    assert.ok(databaseSource.includes(field), `campo de autoria ausente: ${field}`);
  }
});

test("as tabelas operacionais mantêm user_id apontando para accountId", () => {
  const contextReturnSource = sectionBetween(
    "return {\n    supabase,\n    userId: accountContext.accountId",
    "function withAuthenticatedOwner",
  );

  assert.match(contextReturnSource, /userId: accountContext\.accountId/);
  assert.match(
    databaseSource,
    /function withAuthenticatedOwner<[\s\S]*return \{ \.\.\.payload, user_id: userId \}/,
  );

  for (const table of [
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
  ]) {
    assert.match(databaseSource, new RegExp(`\\.from\\(\"${table}\"\\)`));
  }
});
