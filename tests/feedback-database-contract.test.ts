import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const migrationSource = read(
  "supabase/migrations/202608170001_feedback_system.sql",
);
const databaseSource = read("lib/database.ts");

function getFunctionSource(functionName: string, nextMarker: RegExp) {
  const match = migrationSource.match(
    new RegExp(
      `create or replace function public\\.${functionName}\\([\\s\\S]*?(?=${nextMarker.source})`,
      "i",
    ),
  );

  assert.ok(match, `funcao ${functionName} nao encontrada`);
  return match[0];
}

test("schema de feedback preserva autoria, revisao e valores permitidos", () => {
  assert.match(
    migrationSource,
    /create table public\.feedback_admins \([\s\S]*user_id uuid primary key references auth\.users\(id\) on delete cascade/i,
  );
  assert.match(
    migrationSource,
    /create table public\.feedbacks \([\s\S]*id uuid primary key default gen_random_uuid\(\)/i,
  );

  for (const column of [
    "user_id uuid not null",
    "sender_email text not null",
    "submission_key uuid not null",
    "category text not null",
    "area text not null",
    "subject text not null",
    "message text not null",
    "page_path text",
    "status text not null default 'novo'",
    "admin_response text",
    "submission_notification_id uuid not null default gen_random_uuid()",
    "submission_notified_at timestamptz",
    "response_notification_id uuid",
    "response_notified_at timestamptz",
    "reviewed_by uuid",
    "reviewed_at timestamptz",
    "created_at timestamptz not null default now()",
    "updated_at timestamptz not null default now()",
  ]) {
    assert.ok(migrationSource.includes(column), `coluna ausente: ${column}`);
  }

  assert.match(migrationSource, /unique \(user_id, submission_key\)/i);
  assert.match(
    migrationSource,
    /category in \('sugestao', 'reclamacao', 'problema', 'duvida', 'elogio'\)/i,
  );
  assert.match(
    migrationSource,
    /area in \('bipagem', 'pacotes', 'relatorios', 'cadastros', 'geral'\)/i,
  );
  assert.match(
    migrationSource,
    /char_length\(subject\) between 3 and 120/i,
  );
  assert.match(
    migrationSource,
    /char_length\(message\) between 20 and 4000/i,
  );
  assert.match(
    migrationSource,
    /page_path is null[\s\S]*char_length\(page_path\) <= 200/i,
  );
  assert.match(
    migrationSource,
    /status in \('novo', 'em_analise', 'respondido', 'resolvido', 'arquivado'\)/i,
  );
  assert.match(
    migrationSource,
    /admin_response is null[\s\S]*regexp_replace\(admin_response[\s\S]*char_length\(admin_response\) <= 4000/i,
  );
  assert.match(migrationSource, /unique \(submission_notification_id\)/i);
  assert.match(migrationSource, /unique \(response_notification_id\)/i);
  assert.match(
    migrationSource,
    /admin_response is null[\s\S]*response_notification_id is null[\s\S]*response_notified_at is null[\s\S]*admin_response is not null[\s\S]*response_notification_id is not null/i,
  );
  assert.match(
    migrationSource,
    /create index feedbacks_status_created_at_idx[\s\S]*\(status, created_at desc\)/i,
  );
  assert.match(
    migrationSource,
    /create index feedbacks_user_created_at_idx[\s\S]*\(user_id, created_at desc\)/i,
  );
});

test("constraints e RPCs removem whitespace POSIX nas bordas", () => {
  const whitespacePattern = /'\^\[\[:space:\]\]\+'[\s\S]*'\[\[:space:\]\]\+\$'/;

  for (const field of ["subject", "message", "page_path", "admin_response"]) {
    const constraint = migrationSource.match(
      new RegExp(
        `constraint feedbacks_${field === "admin_response" ? "admin_response" : field}_check[\\s\\S]*?(?=constraint feedbacks_|\\n\\);)`,
        "i",
      ),
    )?.[0];
    assert.ok(constraint, `constraint ausente para ${field}`);
    assert.match(constraint, whitespacePattern);
  }

  const submitFunction = getFunctionSource(
    "submit_feedback",
    /create or replace function public\.review_feedback/i,
  );
  const reviewFunction = getFunctionSource(
    "review_feedback",
    /create or replace function public\.mark_feedback_submission_notified/i,
  );
  assert.match(submitFunction, whitespacePattern);
  assert.match(reviewFunction, whitespacePattern);
  assert.doesNotMatch(submitFunction, /v_subject := btrim|v_message := btrim/i);
  assert.doesNotMatch(reviewFunction, /v_admin_response text :=\s*nullif\(btrim/i);
});

test("admin inicial e semeado por e-mail sem transformar e-mail em privilegio", () => {
  assert.match(
    migrationSource,
    /from auth\.users[\s\S]*where lower\(email\) = 'jefersondr10@gmail\.com'[\s\S]*insert into public\.feedback_admins \(user_id\)/i,
  );

  const adminFunction = getFunctionSource(
    "is_feedback_admin",
    /drop policy if exists feedbacks_select_own/i,
  );
  assert.match(adminFunction, /security definer/i);
  assert.match(adminFunction, /set search_path = ''/i);
  assert.match(adminFunction, /auth\.uid\(\)/i);
  assert.match(adminFunction, /from public\.feedback_admins/i);
  assert.doesNotMatch(adminFunction, /jefersondr10|@gmail|auth\.jwt/i);
});

test("RLS permite somente leitura propria ou administrativa", () => {
  assert.match(
    migrationSource,
    /alter table public\.feedback_admins enable row level security/i,
  );
  assert.match(
    migrationSource,
    /alter table public\.feedbacks enable row level security/i,
  );
  assert.match(
    migrationSource,
    /create policy feedbacks_select_own[\s\S]*for select[\s\S]*to authenticated[\s\S]*user_id = \(select auth\.uid\(\)\)/i,
  );
  assert.match(
    migrationSource,
    /create policy feedbacks_select_admin[\s\S]*for select[\s\S]*to authenticated[\s\S]*public\.is_feedback_admin\(\)/i,
  );
  assert.doesNotMatch(
    migrationSource,
    /create policy feedbacks_[^\n]+[\s\S]{0,150}for (insert|update|delete)/i,
  );
  assert.match(
    migrationSource,
    /revoke all on table public\.feedback_admins from public, anon, authenticated/i,
  );
  assert.match(
    migrationSource,
    /revoke all on table public\.feedbacks from public, anon, authenticated[\s\S]*grant select \([\s\S]*id,[\s\S]*updated_at[\s\S]*\) on table public\.feedbacks to authenticated/i,
  );
  const columnGrant = migrationSource.match(
    /grant select \([\s\S]*?\) on table public\.feedbacks to authenticated/i,
  )?.[0];
  assert.ok(columnGrant, "grant de colunas publicas ausente");
  for (const internalField of [
    "submission_notification_id",
    "submission_notified_at",
    "response_notification_id",
    "response_notified_at",
    "reviewed_by",
  ]) {
    assert.doesNotMatch(columnGrant, new RegExp(internalField));
  }
  assert.doesNotMatch(
    migrationSource,
    /grant select on (table )?public\.feedbacks/i,
  );
  assert.doesNotMatch(migrationSource, /grant (insert|update|delete|all) on table public\.feedback/i);
});

test("submit_feedback valida antes do replay e detecta conflito idempotente", () => {
  const submitFunction = getFunctionSource(
    "submit_feedback",
    /create or replace function public\.review_feedback/i,
  );

  assert.match(submitFunction, /security definer/i);
  assert.match(submitFunction, /set search_path = ''/i);
  assert.match(submitFunction, /returns jsonb/i);
  assert.match(submitFunction, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(
    submitFunction,
    /from auth\.users as authenticated_user[\s\S]*authenticated_user\.id = v_user_id[\s\S]*authenticated_user\.email_confirmed_at is not null/i,
  );
  assert.doesNotMatch(submitFunction, /auth\.jwt\(\)/i);
  assert.doesNotMatch(
    submitFunction.match(/public\.submit_feedback\([\s\S]*?\)\s*returns/i)?.[0] ?? "",
    /email/i,
  );
  assert.match(submitFunction, /pg_advisory_xact_lock/i);

  const lockPosition = submitFunction.indexOf("pg_advisory_xact_lock");
  const normalizationPosition = submitFunction.indexOf("v_subject :=");
  const validationPosition = submitFunction.indexOf(
    "char_length(v_subject) < 3",
  );
  const idempotencyPosition = submitFunction.indexOf(
    "feedback.submission_key = p_submission_key",
  );
  const rateLimitPosition = submitFunction.indexOf(
    "v_recent_15_minutes >= 3",
  );
  const insertPosition = submitFunction.indexOf("insert into public.feedbacks");
  assert.ok(normalizationPosition > 0 && normalizationPosition < lockPosition);
  assert.ok(validationPosition > normalizationPosition && validationPosition < lockPosition);
  assert.ok(lockPosition < idempotencyPosition);
  assert.ok(idempotencyPosition < rateLimitPosition);
  assert.ok(rateLimitPosition < insertPosition);
  assert.match(
    submitFunction,
    /feedback\.submission_key = p_submission_key;[\s\S]*if found then[\s\S]*v_feedback\.category is distinct from v_category[\s\S]*v_feedback\.page_path is distinct from v_page_path[\s\S]*FEEDBACK_IDEMPOTENCY_CONFLICT/i,
  );
  assert.match(
    submitFunction,
    /return to_jsonb\(v_feedback\) - array\[[\s\S]*submission_notification_id[\s\S]*response_notified_at[\s\S]*reviewed_by/i,
  );
  assert.match(submitFunction, /interval '15 minutes'/i);
  assert.match(submitFunction, /interval '24 hours'/i);
  assert.match(submitFunction, /v_recent_15_minutes >= 3/i);
  assert.match(submitFunction, /v_recent_24_hours >= 10/i);
  assert.match(submitFunction, /char_length\(v_subject\) < 3[\s\S]*> 120/i);
  assert.match(submitFunction, /char_length\(v_message\) < 20[\s\S]*> 4000/i);
  assert.match(submitFunction, /char_length\(v_page_path\) > 200/i);
  assert.match(submitFunction, /'novo',[\s\S]*v_now,[\s\S]*v_now/i);
});

test("review_feedback aplica concorrencia otimista sem quebrar no-op", () => {
  const reviewFunction = getFunctionSource(
    "review_feedback",
    /create or replace function public\.mark_feedback_submission_notified/i,
  );

  assert.match(reviewFunction, /security definer/i);
  assert.match(reviewFunction, /set search_path = ''/i);
  assert.match(reviewFunction, /returns jsonb/i);
  assert.match(reviewFunction, /p_response text default null/i);
  assert.match(reviewFunction, /p_expected_updated_at timestamptz default null/i);
  assert.doesNotMatch(reviewFunction, /p_admin_response/i);
  assert.match(reviewFunction, /if not public\.is_feedback_admin\(\)/i);
  assert.match(
    reviewFunction,
    /v_status not in \([\s\S]*'novo', 'em_analise', 'respondido', 'resolvido', 'arquivado'/i,
  );
  assert.match(
    reviewFunction,
    /v_admin_response is not null[\s\S]*char_length\(v_admin_response\) > 4000/i,
  );
  assert.match(
    reviewFunction,
    /v_status = 'respondido'[\s\S]*char_length\(v_admin_response\) < 3/i,
  );
  assert.match(
    reviewFunction,
    /from public\.feedbacks as feedback[\s\S]*where feedback\.id = p_feedback_id[\s\S]*for update/i,
  );
  assert.match(
    reviewFunction,
    /v_feedback\.status = v_status[\s\S]*admin_response is not distinct from v_admin_response[\s\S]*return to_jsonb\(v_feedback\)/i,
  );
  const noOpPosition = reviewFunction.indexOf("v_feedback.status = v_status");
  const conflictPosition = reviewFunction.indexOf("FEEDBACK_CONFLICT");
  const updatePosition = reviewFunction.indexOf("update public.feedbacks");
  assert.ok(noOpPosition > 0 && noOpPosition < conflictPosition);
  assert.ok(conflictPosition < updatePosition);
  assert.match(
    reviewFunction,
    /p_expected_updated_at is null[\s\S]*v_feedback\.updated_at is distinct from p_expected_updated_at[\s\S]*FEEDBACK_CONFLICT/i,
  );
  assert.match(
    reviewFunction,
    /response_notification_id = case[\s\S]*v_response_changed and v_admin_response is not null[\s\S]*gen_random_uuid\(\)[\s\S]*when v_response_changed then null[\s\S]*else response_notification_id/i,
  );
  assert.match(
    reviewFunction,
    /response_notified_at = case[\s\S]*when v_response_changed then null[\s\S]*else response_notified_at/i,
  );

  const updateClause = reviewFunction.match(
    /update public\.feedbacks\s+set([\s\S]*?)where id = p_feedback_id/i,
  )?.[1];
  assert.ok(updateClause, "update administrativo nao encontrado");
  for (const field of [
    "status",
    "admin_response",
    "response_notification_id",
    "response_notified_at",
    "reviewed_by",
    "reviewed_at",
    "updated_at",
  ]) {
    assert.match(updateClause, new RegExp(`${field}\\s*=`));
  }
  assert.doesNotMatch(
    updateClause,
    /\b(user_id|sender_email|submission_key|category|area|subject|message|page_path|created_at)\s*=/i,
  );
});

test("notificacoes internas ficam restritas ao service_role", () => {
  const submissionMarker = getFunctionSource(
    "mark_feedback_submission_notified",
    /create or replace function public\.get_feedback_submission_notification_state/i,
  );
  const submissionState = getFunctionSource(
    "get_feedback_submission_notification_state",
    /create or replace function public\.mark_feedback_response_notified/i,
  );
  const responseMarker = getFunctionSource(
    "mark_feedback_response_notified",
    /create or replace function public\.get_feedback_response_notification_state/i,
  );
  const responseState = getFunctionSource(
    "get_feedback_response_notification_state",
    /create or replace function public\.list_feedbacks_for_management/i,
  );

  for (const source of [submissionMarker, responseMarker]) {
    assert.match(source, /returns boolean/i);
    assert.match(source, /security definer/i);
    assert.match(source, /set search_path = ''/i);
    assert.match(source, /p_feedback_id uuid[\s\S]*p_notification_id uuid/i);
    assert.match(source, /_notified_at = coalesce\([\s\S]*_notified_at,[\s\S]*clock_timestamp\(\)/i);
    assert.match(source, /return found/i);
    assert.match(source, /auth\.role\(\) is distinct from 'service_role'/i);
  }

  assert.match(
    submissionMarker,
    /submission_notification_id = p_notification_id/i,
  );
  assert.match(
    responseMarker,
    /response_notification_id = p_notification_id/i,
  );

  assert.match(submissionState, /p_feedback_id uuid,[\s\S]*p_user_id uuid/i);
  assert.match(submissionState, /returns table \([\s\S]*notification_id uuid,[\s\S]*notified_at timestamptz/i);
  assert.match(submissionState, /auth\.role\(\) is distinct from 'service_role'/i);
  assert.match(submissionState, /feedback\.user_id = p_user_id/i);
  assert.match(responseState, /returns table \([\s\S]*notification_id uuid,[\s\S]*notified_at timestamptz,[\s\S]*recipient_email text,[\s\S]*response_text text,[\s\S]*subject text/i);
  for (const source of [submissionState, responseState]) {
    assert.match(source, /security definer/i);
    assert.match(source, /stable/i);
    assert.match(source, /set search_path = ''/i);
    assert.match(source, /auth\.role\(\) is distinct from 'service_role'/i);
  }
  assert.match(responseState, /where feedback\.id = p_feedback_id/i);
  assert.match(responseState, /feedback\.response_notification_id/i);
  assert.match(responseState, /feedback\.response_notified_at/i);
  assert.match(responseState, /from public\.feedbacks as feedback[\s\S]*join auth\.users as authenticated_user[\s\S]*email_confirmed_at is not null/i);
  assert.match(responseState, /authenticated_user\.email::text/i);
  assert.match(responseState, /feedback\.admin_response/i);
  assert.match(responseState, /feedback\.subject/i);
});

test("listagem administrativa pagina, valida e pesquisa sem SQL dinamico", () => {
  const listFunction = getFunctionSource(
    "list_feedbacks_for_management",
    /create or replace function public\.get_feedback_management_summary/i,
  );
  const summaryFunction = getFunctionSource(
    "get_feedback_management_summary",
    /-- Nenhuma escrita direta/i,
  );

  assert.match(listFunction, /security definer/i);
  assert.match(listFunction, /stable/i);
  assert.match(listFunction, /if not public\.is_feedback_admin\(\)/i);
  assert.match(
    listFunction,
    /p_status text default null[\s\S]*p_category text default null[\s\S]*p_area text default null[\s\S]*p_search text default null[\s\S]*p_limit integer default 20[\s\S]*p_offset integer default 0/i,
  );
  assert.match(listFunction, /v_limit < 1 or v_limit > 50/i);
  assert.match(listFunction, /v_offset < 0/i);
  assert.match(listFunction, /char_length\(v_search\) > 200/i);
  assert.match(listFunction, /count\(\*\) over\(\) as total_count/i);
  assert.doesNotMatch(listFunction, /reviewed_by/i);
  assert.match(
    listFunction,
    /lower\(feedback\.subject\)[\s\S]*lower\(feedback\.message\)[\s\S]*lower\(feedback\.sender_email\)[\s\S]*lower\(feedback\.id::text\)[\s\S]*'FB-'/i,
  );
  assert.match(listFunction, /limit v_limit[\s\S]*offset v_offset/i);
  assert.doesNotMatch(listFunction, /execute\s|format\s*\(/i);

  assert.match(summaryFunction, /security definer/i);
  assert.match(summaryFunction, /if not public\.is_feedback_admin\(\)/i);
  for (const status of [
    "novo",
    "em_analise",
    "respondido",
    "resolvido",
    "arquivado",
  ]) {
    assert.match(
      summaryFunction,
      new RegExp(`count\\(\\*\\) filter \\(where feedback\\.status = '${status}'\\)`),
    );
  }
});

test("RPCs publicas e internas recebem grants estreitos", () => {
  for (const signature of [
    "public.is_feedback_admin\\(\\)",
    "public.submit_feedback\\(uuid, text, text, text, text, text\\)",
    "public.review_feedback\\(uuid, text, text, timestamptz\\)",
    "public.list_feedbacks_for_management\\([\\s\\n]*text, text, text, text, integer, integer[\\s\\n]*\\)",
    "public.get_feedback_management_summary\\(\\)",
  ]) {
    assert.match(
      migrationSource,
      new RegExp(`revoke all on function ${signature}[\\s\\S]*?from public, anon, authenticated`, "i"),
    );
    assert.match(
      migrationSource,
      new RegExp(`grant execute on function ${signature}[\\s\\S]*?to authenticated`, "i"),
    );
  }

  for (const signature of [
    "public.mark_feedback_submission_notified\\(uuid, uuid\\)",
    "public.get_feedback_submission_notification_state\\(uuid, uuid\\)",
    "public.mark_feedback_response_notified\\(uuid, uuid\\)",
    "public.get_feedback_response_notification_state\\(uuid\\)",
  ]) {
    assert.match(
      migrationSource,
      new RegExp(`revoke all on function ${signature}[\\s\\S]*?from public, anon, authenticated, service_role`, "i"),
    );
    assert.match(
      migrationSource,
      new RegExp(`grant execute on function ${signature}[\\s\\S]*?to service_role`, "i"),
    );
    assert.doesNotMatch(
      migrationSource,
      new RegExp(`grant execute on function ${signature}\\s+to authenticated\\s*;`, "i"),
    );
  }
});

test("database exporta o contrato completo e consultas de leitura estreitas", () => {
  for (const typeName of [
    "FeedbackCategory",
    "FeedbackArea",
    "FeedbackStatus",
    "FeedbackRow",
    "FeedbackPage",
    "FeedbackManagementSummary",
  ]) {
    assert.match(databaseSource, new RegExp(`export type ${typeName}`));
  }

  for (const field of [
    "id",
    "user_id",
    "sender_email",
    "submission_key",
    "category",
    "area",
    "subject",
    "message",
    "page_path",
    "status",
    "admin_response",
    "reviewed_at",
    "created_at",
    "updated_at",
  ]) {
    assert.match(databaseSource, new RegExp(`"${field}"`));
  }

  const helperSource = databaseSource.match(
    /const feedbackSelect =[\s\S]*?(?=export async function getLojas)/,
  )?.[0];
  assert.ok(helperSource, "helpers de feedback nao encontrados");
  const feedbackRowSource = databaseSource.match(
    /export type FeedbackRow = \{[\s\S]*?\n\};/,
  )?.[0];
  assert.ok(feedbackRowSource, "FeedbackRow nao encontrado");
  assert.doesNotMatch(feedbackRowSource, /reviewed_by/);
  assert.doesNotMatch(helperSource, /\.select\(\s*["']\*["']\s*\)/);
  const feedbackSelectSource = helperSource.match(
    /const feedbackSelect = \[[\s\S]*?\]\.join\(", "\);/,
  )?.[0];
  assert.ok(feedbackSelectSource, "select publico de feedback ausente");
  for (const internalField of [
    "submission_notification_id",
    "submission_notified_at",
    "response_notification_id",
    "response_notified_at",
    "reviewed_by",
  ]) {
    assert.doesNotMatch(feedbackSelectSource, new RegExp(internalField));
  }
  assert.match(helperSource, /export async function getFeedbackAdminStatus[\s\S]*\.rpc\("is_feedback_admin"\)/);
  assert.match(
    helperSource,
    /export async function getOwnFeedbacks[\s\S]*getOwnFeedbackPage\([\s\S]*pageSize: 50/,
  );
  assert.match(
    helperSource,
    /export async function getOwnFeedbackPage[\s\S]*actorUserId[\s\S]*\.select\(feedbackSelect, \{ count: "exact" \}\)[\s\S]*\.eq\("user_id", actorUserId\)[\s\S]*\.range\(offset, offset \+ pageSize - 1\)/,
  );
  assert.match(
    helperSource,
    /export async function getFeedbacksForManagement[\s\S]*p_status:[\s\S]*p_category:[\s\S]*p_area:[\s\S]*p_search:[\s\S]*p_limit:[\s\S]*p_offset:[\s\S]*"list_feedbacks_for_management"/,
  );
  assert.match(helperSource, /Math\.min\(50, Math\.trunc\(value\)\)/);
  assert.match(
    helperSource,
    /items:[\s\S]*total,[\s\S]*page,[\s\S]*pageSize/,
  );
  assert.match(
    helperSource,
    /export async function getFeedbackManagementSummary[\s\S]*"get_feedback_management_summary"/,
  );
  assert.match(
    helperSource,
    /novos: getFeedbackCount\(row\.novo\)[\s\S]*emAnalise: getFeedbackCount\(row\.em_analise\)[\s\S]*respondidos: getFeedbackCount\(row\.respondido\)[\s\S]*resolvidos: getFeedbackCount\(row\.resolvido\)[\s\S]*arquivados: getFeedbackCount\(row\.arquivado\)/,
  );
  assert.doesNotMatch(
    helperSource.match(
      /export async function getFeedbacksForManagement[\s\S]*?(?=export async function getFeedbackManagementSummary)/,
    )?.[0] ?? "",
    /\.from\("feedbacks"\)/,
  );
});
