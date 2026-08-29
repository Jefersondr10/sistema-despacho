import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../supabase/migrations/202608290001_feedback_notification_recipients.sql",
    import.meta.url,
  ),
  "utf8",
);

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

test("migration cria cadastro vazio, normalizado e sem e-mail pessoal", () => {
  assert.match(migrationSource, /begin;[\s\S]*commit;/i);
  assert.match(
    migrationSource,
    /create table public\.feedback_notification_recipients \([\s\S]*id uuid primary key default gen_random_uuid\(\)/i,
  );

  for (const column of [
    "label text",
    "email text not null",
    "active boolean not null default true",
    "created_by uuid",
    "updated_by uuid",
    "created_at timestamptz not null default now()",
    "updated_at timestamptz not null default now()",
  ]) {
    assert.ok(migrationSource.includes(column), `coluna ausente: ${column}`);
  }

  assert.match(migrationSource, /unique \(email\)/i);
  assert.match(
    migrationSource,
    /email = lower\(btrim\(email\)\)[\s\S]*char_length\(email\) between 3 and 320/i,
  );
  assert.match(
    migrationSource,
    /label is null[\s\S]*label = btrim\(label\)[\s\S]*char_length\(label\) between 1 and 120/i,
  );
  assert.doesNotMatch(migrationSource, /jefersondr10|@gmail\.com/i);
  const schemaSection = migrationSource.split(
    "create or replace function public.list_feedback_notification_recipients",
  )[0];
  assert.doesNotMatch(schemaSection, /insert into/i);
});

test("tabelas privadas usam RLS forcado e nao possuem politicas ou grants diretos", () => {
  for (const tableName of [
    "feedback_notification_recipients",
    "feedback_submission_recipient_snapshots",
  ]) {
    assert.match(
      migrationSource,
      new RegExp(`alter table public\\.${tableName} enable row level security`, "i"),
    );
    assert.match(
      migrationSource,
      new RegExp(`alter table public\\.${tableName} force row level security`, "i"),
    );
    assert.match(
      migrationSource,
      new RegExp(
        `revoke all on table public\\.${tableName}[\\s\\S]*?from public, anon, authenticated, service_role`,
        "i",
      ),
    );
    assert.doesNotMatch(
      migrationSource,
      new RegExp(`create policy[^;]*on public\\.${tableName}`, "i"),
    );
    assert.doesNotMatch(
      migrationSource,
      new RegExp(`grant (select|insert|update|delete|all)[^;]*public\\.${tableName}`, "i"),
    );
  }
});

test("RPCs de cadastro exigem administrador e validam as entradas", () => {
  const listFunction = getFunctionSource(
    "list_feedback_notification_recipients",
    /create or replace function public\.create_feedback_notification_recipient/i,
  );
  const createFunction = getFunctionSource(
    "create_feedback_notification_recipient",
    /create or replace function public\.update_feedback_notification_recipient/i,
  );
  const updateFunction = getFunctionSource(
    "update_feedback_notification_recipient",
    /create or replace function public\.delete_feedback_notification_recipient/i,
  );
  const deleteFunction = getFunctionSource(
    "delete_feedback_notification_recipient",
    /create or replace function public\.get_feedback_submission_delivery_context_v2/i,
  );

  for (const source of [
    listFunction,
    createFunction,
    updateFunction,
    deleteFunction,
  ]) {
    assert.match(source, /security definer/i);
    assert.match(source, /set search_path = ''/i);
    assert.match(source, /auth\.uid\(\)/i);
    assert.match(source, /if not public\.is_feedback_admin\(\)/i);
    assert.doesNotMatch(source, /auth\.jwt\(\)/i);
  }

  for (const source of [createFunction, updateFunction]) {
    assert.match(source, /lower\(btrim\(coalesce\(p_email, ''\)\)\)/i);
    assert.match(source, /char_length\(v_email\) < 3[\s\S]*char_length\(v_email\) > 320/i);
    assert.match(source, /v_email !~ '\^\[\^\[:space:\]@\]/i);
    assert.match(source, /char_length\(v_label\) > 120/i);
    assert.match(source, /FEEDBACK_RECIPIENT_EMAIL_CONFLICT/i);
  }

  assert.match(
    listFunction,
    /order by[\s\S]*recipient\.active desc[\s\S]*recipient\.label asc nulls last[\s\S]*recipient\.email asc/i,
  );
  assert.match(
    createFunction,
    /insert into public\.feedback_notification_recipients[\s\S]*created_by[\s\S]*updated_by/i,
  );
  assert.match(
    updateFunction,
    /set[\s\S]*label = v_label[\s\S]*email = v_email[\s\S]*active = v_active[\s\S]*updated_by = v_user_id[\s\S]*updated_at = v_now/i,
  );
  assert.match(
    deleteFunction,
    /returns boolean[\s\S]*delete from public\.feedback_notification_recipients[\s\S]*where id = p_id;[\s\S]*return true/i,
  );
});

test("limite de 50 ativos e serializado por um lock compartilhado", () => {
  const createFunction = getFunctionSource(
    "create_feedback_notification_recipient",
    /create or replace function public\.update_feedback_notification_recipient/i,
  );
  const updateFunction = getFunctionSource(
    "update_feedback_notification_recipient",
    /create or replace function public\.delete_feedback_notification_recipient/i,
  );
  const deleteFunction = getFunctionSource(
    "delete_feedback_notification_recipient",
    /create or replace function public\.get_feedback_submission_delivery_context_v2/i,
  );
  const deliveryFunction = getFunctionSource(
    "get_feedback_submission_delivery_context_v2",
    /-- Nem usuarios autenticados/i,
  );

  for (const source of [
    createFunction,
    updateFunction,
    deleteFunction,
    deliveryFunction,
  ]) {
    assert.match(source, /pg_advisory_xact_lock/i);
    assert.match(
      source,
      /feedback_notification_recipients:active_set/i,
    );
  }

  assert.match(
    createFunction,
    /where recipient\.active[\s\S]*\) >= 50[\s\S]*FEEDBACK_RECIPIENT_ACTIVE_LIMIT/i,
  );
  assert.match(
    updateFunction,
    /v_active and not v_recipient\.active[\s\S]*where recipient\.active[\s\S]*recipient\.id <> p_id[\s\S]*\) >= 50[\s\S]*FEEDBACK_RECIPIENT_ACTIVE_LIMIT/i,
  );
});

test("update e delete aplicam concorrencia otimista antes da escrita", () => {
  const updateFunction = getFunctionSource(
    "update_feedback_notification_recipient",
    /create or replace function public\.delete_feedback_notification_recipient/i,
  );
  const deleteFunction = getFunctionSource(
    "delete_feedback_notification_recipient",
    /create or replace function public\.get_feedback_submission_delivery_context_v2/i,
  );

  for (const source of [updateFunction, deleteFunction]) {
    assert.match(source, /p_expected_updated_at timestamptz/i);
    assert.match(
      source,
      /where recipient\.id = p_id[\s\S]*for update/i,
    );
    assert.match(
      source,
      /v_recipient\.updated_at is distinct from p_expected_updated_at[\s\S]*FEEDBACK_RECIPIENT_CONFLICT/i,
    );
  }

  const conflictPosition = updateFunction.indexOf("FEEDBACK_RECIPIENT_CONFLICT");
  const updatePosition = updateFunction.indexOf(
    "update public.feedback_notification_recipients",
  );
  assert.ok(conflictPosition > 0 && conflictPosition < updatePosition);

  assert.match(
    updateFunction,
    /greatest\([\s\S]*clock_timestamp\(\)[\s\S]*v_recipient\.updated_at \+ interval '1 microsecond'/i,
  );
});

test("contexto de envio service-role persiste snapshot deterministico ate quando vazio", () => {
  assert.match(
    migrationSource,
    /create table public\.feedback_submission_recipient_snapshots \([\s\S]*feedback_id uuid primary key[\s\S]*notification_id uuid not null unique[\s\S]*recipient_emails text\[\] not null/i,
  );
  assert.match(
    migrationSource,
    /cardinality\(recipient_emails\) <= 50/i,
  );

  const deliveryFunction = getFunctionSource(
    "get_feedback_submission_delivery_context_v2",
    /-- Nem usuarios autenticados/i,
  );
  assert.match(
    deliveryFunction,
    /returns table \([\s\S]*notification_id uuid,[\s\S]*notified_at timestamptz,[\s\S]*recipient_emails text\[\]/i,
  );
  assert.match(deliveryFunction, /security definer/i);
  assert.match(deliveryFunction, /set search_path = ''/i);
  assert.match(
    deliveryFunction,
    /auth\.role\(\) is distinct from 'service_role'/i,
  );
  assert.match(
    deliveryFunction,
    /feedback\.id = p_feedback_id[\s\S]*feedback\.user_id = p_user_id[\s\S]*for update/i,
  );
  assert.match(
    deliveryFunction,
    /from public\.feedback_submission_recipient_snapshots[\s\S]*where snapshot\.feedback_id = p_feedback_id/i,
  );
  assert.match(
    deliveryFunction,
    /array_agg\(recipient\.email order by recipient\.email asc\)[\s\S]*array\[\]::text\[\][\s\S]*where recipient\.active/i,
  );
  assert.match(
    deliveryFunction,
    /insert into public\.feedback_submission_recipient_snapshots[\s\S]*p_feedback_id,[\s\S]*v_notification_id,[\s\S]*v_recipient_emails/i,
  );
});

test("grants separam gestao autenticada do contexto interno de envio", () => {
  for (const signature of [
    "public.list_feedback_notification_recipients\\(\\)",
    "public.create_feedback_notification_recipient\\([\\s\\n]*text, text, boolean[\\s\\n]*\\)",
    "public.update_feedback_notification_recipient\\([\\s\\n]*uuid, text, text, boolean, timestamptz[\\s\\n]*\\)",
    "public.delete_feedback_notification_recipient\\([\\s\\n]*uuid, timestamptz[\\s\\n]*\\)",
  ]) {
    assert.match(
      migrationSource,
      new RegExp(
        `revoke all on function ${signature}[\\s\\S]*?from public, anon, authenticated, service_role`,
        "i",
      ),
    );
    assert.match(
      migrationSource,
      new RegExp(`grant execute on function ${signature}[\\s\\S]*?to authenticated`, "i"),
    );
  }

  const serviceSignature =
    "public.get_feedback_submission_delivery_context_v2\\([\\s\\n]*uuid, uuid[\\s\\n]*\\)";
  assert.match(
    migrationSource,
    new RegExp(
      `revoke all on function ${serviceSignature}[\\s\\S]*?from public, anon, authenticated, service_role`,
      "i",
    ),
  );
  assert.match(
    migrationSource,
    new RegExp(
      `grant execute on function ${serviceSignature}[\\s\\S]*?to service_role`,
      "i",
    ),
  );
  assert.doesNotMatch(
    migrationSource,
    new RegExp(
      `grant execute on function ${serviceSignature}[\\s\\S]*?to authenticated`,
      "i",
    ),
  );
});
