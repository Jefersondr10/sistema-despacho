-- Destinatarios globais das notificacoes de novos feedbacks.
--
-- O cadastro comeca vazio. Administradores gerenciam os destinatarios apenas
-- pelas RPCs abaixo, e o backend captura uma lista imutavel por notificacao
-- para que tentativas repetidas nunca mudem os destinatarios no meio do envio.

begin;

create table public.feedback_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  label text,
  email text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_notification_recipients_email_unique unique (email),
  constraint feedback_notification_recipients_label_check check (
    label is null
    or (
      label = btrim(label)
      and char_length(label) between 1 and 120
      and label !~ '[[:cntrl:]]'
    )
  ),
  constraint feedback_notification_recipients_email_check check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 320
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

-- Tabela exclusivamente interna. Uma linha, inclusive com array vazio,
-- registra de forma definitiva os destinatarios daquela notificacao.
create table public.feedback_submission_recipient_snapshots (
  feedback_id uuid primary key
    references public.feedbacks(id) on delete cascade,
  notification_id uuid not null unique,
  recipient_emails text[] not null,
  created_at timestamptz not null default now(),
  constraint feedback_submission_recipient_snapshots_size_check check (
    cardinality(recipient_emails) <= 50
  )
);

alter table public.feedback_notification_recipients enable row level security;
alter table public.feedback_notification_recipients force row level security;
alter table public.feedback_submission_recipient_snapshots enable row level security;
alter table public.feedback_submission_recipient_snapshots force row level security;

create or replace function public.list_feedback_notification_recipients()
returns table (
  id uuid,
  label text,
  email text,
  active boolean,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuario autenticado obrigatorio. Entre novamente.';
  end if;

  if not public.is_feedback_admin() then
    raise exception 'Administrador de feedback obrigatorio.';
  end if;

  return query
  select
    recipient.id,
    recipient.label,
    recipient.email,
    recipient.active,
    recipient.created_by,
    recipient.updated_by,
    recipient.created_at,
    recipient.updated_at
  from public.feedback_notification_recipients as recipient
  order by
    recipient.active desc,
    recipient.label asc nulls last,
    recipient.email asc,
    recipient.id asc;
end;
$$;

create or replace function public.create_feedback_notification_recipient(
  p_email text,
  p_label text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_active boolean := p_active;
  v_now timestamptz := clock_timestamp();
  v_recipient public.feedback_notification_recipients%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio. Entre novamente.';
  end if;

  if not public.is_feedback_admin() then
    raise exception 'Administrador de feedback obrigatorio.';
  end if;

  if v_active is null then
    raise exception 'Situacao do destinatario obrigatoria.';
  end if;

  if char_length(v_email) < 3
    or char_length(v_email) > 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'E-mail de destinatario invalido.';
  end if;

  if v_label is not null
    and (
      char_length(v_label) > 120
      or v_label ~ '[[:cntrl:]]'
    ) then
    raise exception 'Identificacao deve ter no maximo 120 caracteres.';
  end if;

  -- Serializa toda operacao que possa mudar o conjunto ativo. O mesmo lock e
  -- usado ao capturar o snapshot de uma notificacao.
  perform pg_advisory_xact_lock(
    hashtextextended('feedback_notification_recipients:active_set', 0)
  );

  if exists (
    select 1
    from public.feedback_notification_recipients as recipient
    where recipient.email = v_email
  ) then
    raise exception 'FEEDBACK_RECIPIENT_EMAIL_CONFLICT';
  end if;

  if v_active and (
    select count(*)
    from public.feedback_notification_recipients as recipient
    where recipient.active
  ) >= 50 then
    raise exception 'FEEDBACK_RECIPIENT_ACTIVE_LIMIT';
  end if;

  insert into public.feedback_notification_recipients (
    label,
    email,
    active,
    created_by,
    updated_by,
    created_at,
    updated_at
  ) values (
    v_label,
    v_email,
    v_active,
    v_user_id,
    v_user_id,
    v_now,
    v_now
  )
  returning * into v_recipient;

  return to_jsonb(v_recipient);
end;
$$;

create or replace function public.update_feedback_notification_recipient(
  p_id uuid,
  p_email text,
  p_label text,
  p_active boolean,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_active boolean := p_active;
  v_now timestamptz;
  v_recipient public.feedback_notification_recipients%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio. Entre novamente.';
  end if;

  if not public.is_feedback_admin() then
    raise exception 'Administrador de feedback obrigatorio.';
  end if;

  if p_id is null then
    raise exception 'Destinatario obrigatorio.';
  end if;

  if p_expected_updated_at is null then
    raise exception 'Versao esperada do destinatario obrigatoria.';
  end if;

  if v_active is null then
    raise exception 'Situacao do destinatario obrigatoria.';
  end if;

  if char_length(v_email) < 3
    or char_length(v_email) > 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'E-mail de destinatario invalido.';
  end if;

  if v_label is not null
    and (
      char_length(v_label) > 120
      or v_label ~ '[[:cntrl:]]'
    ) then
    raise exception 'Identificacao deve ter no maximo 120 caracteres.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('feedback_notification_recipients:active_set', 0)
  );

  select recipient.*
  into v_recipient
  from public.feedback_notification_recipients as recipient
  where recipient.id = p_id
  for update;

  if not found then
    raise exception 'Destinatario nao encontrado.';
  end if;

  if v_recipient.updated_at is distinct from p_expected_updated_at then
    raise exception 'FEEDBACK_RECIPIENT_CONFLICT';
  end if;

  if exists (
    select 1
    from public.feedback_notification_recipients as recipient
    where recipient.email = v_email
      and recipient.id <> p_id
  ) then
    raise exception 'FEEDBACK_RECIPIENT_EMAIL_CONFLICT';
  end if;

  if v_active and not v_recipient.active and (
    select count(*)
    from public.feedback_notification_recipients as recipient
    where recipient.active
      and recipient.id <> p_id
  ) >= 50 then
    raise exception 'FEEDBACK_RECIPIENT_ACTIVE_LIMIT';
  end if;

  if v_recipient.email = v_email
    and v_recipient.label is not distinct from v_label
    and v_recipient.active = v_active then
    return to_jsonb(v_recipient);
  end if;

  v_now := greatest(
    clock_timestamp(),
    v_recipient.updated_at + interval '1 microsecond'
  );

  update public.feedback_notification_recipients
  set
    label = v_label,
    email = v_email,
    active = v_active,
    updated_by = v_user_id,
    updated_at = v_now
  where id = p_id
  returning * into v_recipient;

  return to_jsonb(v_recipient);
end;
$$;

create or replace function public.delete_feedback_notification_recipient(
  p_id uuid,
  p_expected_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_recipient public.feedback_notification_recipients%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio. Entre novamente.';
  end if;

  if not public.is_feedback_admin() then
    raise exception 'Administrador de feedback obrigatorio.';
  end if;

  if p_id is null then
    raise exception 'Destinatario obrigatorio.';
  end if;

  if p_expected_updated_at is null then
    raise exception 'Versao esperada do destinatario obrigatoria.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('feedback_notification_recipients:active_set', 0)
  );

  select recipient.*
  into v_recipient
  from public.feedback_notification_recipients as recipient
  where recipient.id = p_id
  for update;

  if not found then
    raise exception 'Destinatario nao encontrado.';
  end if;

  if v_recipient.updated_at is distinct from p_expected_updated_at then
    raise exception 'FEEDBACK_RECIPIENT_CONFLICT';
  end if;

  delete from public.feedback_notification_recipients
  where id = p_id;

  return true;
end;
$$;

create or replace function public.get_feedback_submission_delivery_context_v2(
  p_feedback_id uuid,
  p_user_id uuid
)
returns table (
  notification_id uuid,
  notified_at timestamptz,
  recipient_emails text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification_id uuid;
  v_notified_at timestamptz;
  v_recipient_emails text[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role obrigatorio.';
  end if;

  if p_feedback_id is null or p_user_id is null then
    raise exception 'Feedback e usuario obrigatorios.';
  end if;

  -- Mantem o snapshot sincronizado com operacoes administrativas e impede
  -- duas primeiras tentativas concorrentes de capturarem listas diferentes.
  perform pg_advisory_xact_lock(
    hashtextextended('feedback_notification_recipients:active_set', 0)
  );

  select
    feedback.submission_notification_id,
    feedback.submission_notified_at
  into v_notification_id, v_notified_at
  from public.feedbacks as feedback
  where feedback.id = p_feedback_id
    and feedback.user_id = p_user_id
  for update;

  if not found then
    return;
  end if;

  select snapshot.recipient_emails
  into v_recipient_emails
  from public.feedback_submission_recipient_snapshots as snapshot
  where snapshot.feedback_id = p_feedback_id;

  if not found then
    select coalesce(
      array_agg(recipient.email order by recipient.email asc),
      array[]::text[]
    )
    into v_recipient_emails
    from public.feedback_notification_recipients as recipient
    where recipient.active;

    insert into public.feedback_submission_recipient_snapshots (
      feedback_id,
      notification_id,
      recipient_emails
    ) values (
      p_feedback_id,
      v_notification_id,
      v_recipient_emails
    );
  end if;

  return query
  select
    v_notification_id,
    v_notified_at,
    v_recipient_emails;
end;
$$;

-- Nem usuarios autenticados nem service_role acessam as tabelas diretamente.
-- Cada papel recebe somente as RPCs necessarias ao seu fluxo.
revoke all on table public.feedback_notification_recipients
  from public, anon, authenticated, service_role;
revoke all on table public.feedback_submission_recipient_snapshots
  from public, anon, authenticated, service_role;

revoke all on function public.list_feedback_notification_recipients()
  from public, anon, authenticated, service_role;
revoke all on function public.create_feedback_notification_recipient(
  text, text, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.update_feedback_notification_recipient(
  uuid, text, text, boolean, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.delete_feedback_notification_recipient(
  uuid, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.get_feedback_submission_delivery_context_v2(
  uuid, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.list_feedback_notification_recipients()
  to authenticated;
grant execute on function public.create_feedback_notification_recipient(
  text, text, boolean
) to authenticated;
grant execute on function public.update_feedback_notification_recipient(
  uuid, text, text, boolean, timestamptz
) to authenticated;
grant execute on function public.delete_feedback_notification_recipient(
  uuid, timestamptz
) to authenticated;
grant execute on function public.get_feedback_submission_delivery_context_v2(
  uuid, uuid
) to service_role;

commit;
