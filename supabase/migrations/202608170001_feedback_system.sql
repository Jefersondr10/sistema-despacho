-- Feedback autenticado com fila administrativa, idempotencia e limites de
-- envio atomicos. O e-mail abaixo serve apenas para semear o primeiro admin;
-- toda autorizacao posterior consulta public.feedback_admins.

begin;

create extension if not exists pgcrypto;

create table public.feedback_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_email text not null,
  submission_key uuid not null,
  category text not null,
  area text not null,
  subject text not null,
  message text not null,
  page_path text,
  status text not null default 'novo',
  admin_response text,
  submission_notification_id uuid not null default gen_random_uuid(),
  submission_notified_at timestamptz,
  response_notification_id uuid,
  response_notified_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedbacks_user_submission_key_unique
    unique (user_id, submission_key),
  constraint feedbacks_submission_notification_id_unique
    unique (submission_notification_id),
  constraint feedbacks_response_notification_id_unique
    unique (response_notification_id),
  constraint feedbacks_sender_email_check
    check (
      sender_email = lower(btrim(sender_email))
      and char_length(sender_email) between 3 and 320
      and position('@' in sender_email) > 1
    ),
  constraint feedbacks_category_check
    check (category in ('sugestao', 'reclamacao', 'problema', 'duvida', 'elogio')),
  constraint feedbacks_area_check
    check (area in ('bipagem', 'pacotes', 'relatorios', 'cadastros', 'geral')),
  constraint feedbacks_subject_check
    check (
      subject = regexp_replace(
        regexp_replace(subject, '^[[:space:]]+', ''),
        '[[:space:]]+$',
        ''
      )
      and char_length(subject) between 3 and 120
    ),
  constraint feedbacks_message_check
    check (
      message = regexp_replace(
        regexp_replace(message, '^[[:space:]]+', ''),
        '[[:space:]]+$',
        ''
      )
      and char_length(message) between 20 and 4000
    ),
  constraint feedbacks_page_path_check
    check (
      page_path is null
      or (
        page_path = regexp_replace(
          regexp_replace(page_path, '^[[:space:]]+', ''),
          '[[:space:]]+$',
          ''
        )
        and char_length(page_path) <= 200
      )
    ),
  constraint feedbacks_status_check
    check (status in ('novo', 'em_analise', 'respondido', 'resolvido', 'arquivado')),
  constraint feedbacks_admin_response_check
    check (
      admin_response is null
      or (
        admin_response = regexp_replace(
          regexp_replace(admin_response, '^[[:space:]]+', ''),
          '[[:space:]]+$',
          ''
        )
        and char_length(admin_response) <= 4000
      )
    ),
  constraint feedbacks_response_notification_check
    check (
      (
        admin_response is null
        and response_notification_id is null
        and response_notified_at is null
      )
      or (
        admin_response is not null
        and response_notification_id is not null
      )
    )
);

create index feedbacks_status_created_at_idx
  on public.feedbacks (status, created_at desc);

create index feedbacks_user_created_at_idx
  on public.feedbacks (user_id, created_at desc);

alter table public.feedback_admins enable row level security;
alter table public.feedbacks enable row level security;

-- A conta precisa existir antes da migration. O e-mail nao participa de
-- nenhuma verificacao de privilegio depois deste seed.
do $$
declare
  v_admin_id uuid;
begin
  select id
  into v_admin_id
  from auth.users
  where lower(email) = 'jefersondr10@gmail.com';

  if v_admin_id is null then
    raise exception
      'ADMIN DE FEEDBACK BLOQUEADO: crie a conta jefersondr10@gmail.com antes de aplicar a migration.';
  end if;

  insert into public.feedback_admins (user_id)
  values (v_admin_id)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.is_feedback_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.feedback_admins as admin
      where admin.user_id = (select auth.uid())
    );
$$;

drop policy if exists feedbacks_select_own on public.feedbacks;
create policy feedbacks_select_own
  on public.feedbacks
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists feedbacks_select_admin on public.feedbacks;
create policy feedbacks_select_admin
  on public.feedbacks
  for select
  to authenticated
  using ((select public.is_feedback_admin()));

create or replace function public.submit_feedback(
  p_submission_key uuid,
  p_category text,
  p_area text,
  p_subject text,
  p_message text,
  p_page_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sender_email text;
  v_category text;
  v_area text;
  v_subject text;
  v_message text;
  v_page_path text;
  v_now timestamptz;
  v_recent_15_minutes bigint;
  v_recent_24_hours bigint;
  v_feedback public.feedbacks%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio. Entre novamente.';
  end if;

  if p_submission_key is null then
    raise exception 'submission_key obrigatoria.';
  end if;

  select lower(
    nullif(
      regexp_replace(
        regexp_replace(
          coalesce(authenticated_user.email::text, ''),
          '^[[:space:]]+',
          ''
        ),
        '[[:space:]]+$',
        ''
      ),
      ''
    )
  )
  into v_sender_email
  from auth.users as authenticated_user
  where authenticated_user.id = v_user_id
    and authenticated_user.email_confirmed_at is not null;

  v_category := lower(btrim(coalesce(p_category, '')));
  v_area := lower(btrim(coalesce(p_area, '')));
  v_subject := regexp_replace(
    regexp_replace(coalesce(p_subject, ''), '^[[:space:]]+', ''),
    '[[:space:]]+$',
    ''
  );
  v_message := regexp_replace(
    regexp_replace(coalesce(p_message, ''), '^[[:space:]]+', ''),
    '[[:space:]]+$',
    ''
  );
  v_page_path := nullif(
    regexp_replace(
      regexp_replace(coalesce(p_page_path, ''), '^[[:space:]]+', ''),
      '[[:space:]]+$',
      ''
    ),
    ''
  );

  if v_sender_email is null
    or char_length(v_sender_email) > 320
    or position('@' in v_sender_email) <= 1 then
    raise exception 'E-mail autenticado e confirmado indisponivel.';
  end if;

  if v_category not in (
    'sugestao', 'reclamacao', 'problema', 'duvida', 'elogio'
  ) then
    raise exception 'Categoria de feedback invalida.';
  end if;

  if v_area not in (
    'bipagem', 'pacotes', 'relatorios', 'cadastros', 'geral'
  ) then
    raise exception 'Area de feedback invalida.';
  end if;

  if char_length(v_subject) < 3 or char_length(v_subject) > 120 then
    raise exception 'O assunto deve ter entre 3 e 120 caracteres.';
  end if;

  if char_length(v_message) < 20 or char_length(v_message) > 4000 then
    raise exception 'A mensagem deve ter entre 20 e 4000 caracteres.';
  end if;

  if v_page_path is not null and char_length(v_page_path) > 200 then
    raise exception 'O caminho da pagina deve ter no maximo 200 caracteres.';
  end if;

  -- Serializa envios da mesma conta. Isso torna a idempotencia e os dois
  -- limites de frequencia atomicos, inclusive com requisicoes concorrentes.
  perform pg_advisory_xact_lock(
    hashtextextended('submit_feedback:' || v_user_id::text, 0)
  );

  select feedback.*
  into v_feedback
  from public.feedbacks as feedback
  where feedback.user_id = v_user_id
    and feedback.submission_key = p_submission_key;

  if found then
    if v_feedback.category is distinct from v_category
      or v_feedback.area is distinct from v_area
      or v_feedback.subject is distinct from v_subject
      or v_feedback.message is distinct from v_message
      or v_feedback.page_path is distinct from v_page_path then
      raise exception 'FEEDBACK_IDEMPOTENCY_CONFLICT';
    end if;

    return to_jsonb(v_feedback) - array[
      'submission_notification_id',
      'submission_notified_at',
      'response_notification_id',
      'response_notified_at',
      'reviewed_by'
    ];
  end if;

  v_now := clock_timestamp();

  select
    count(*) filter (
      where feedback.created_at >= v_now - interval '15 minutes'
    ),
    count(*) filter (
      where feedback.created_at >= v_now - interval '24 hours'
    )
  into v_recent_15_minutes, v_recent_24_hours
  from public.feedbacks as feedback
  where feedback.user_id = v_user_id
    and feedback.created_at >= v_now - interval '24 hours';

  if v_recent_15_minutes >= 3 then
    raise exception 'Limite de 3 feedbacks a cada 15 minutos atingido.';
  end if;

  if v_recent_24_hours >= 10 then
    raise exception 'Limite de 10 feedbacks a cada 24 horas atingido.';
  end if;

  insert into public.feedbacks (
    user_id,
    sender_email,
    submission_key,
    category,
    area,
    subject,
    message,
    page_path,
    status,
    created_at,
    updated_at
  ) values (
    v_user_id,
    v_sender_email,
    p_submission_key,
    v_category,
    v_area,
    v_subject,
    v_message,
    v_page_path,
    'novo',
    v_now,
    v_now
  )
  returning * into v_feedback;

  return to_jsonb(v_feedback) - array[
    'submission_notification_id',
    'submission_notified_at',
    'response_notification_id',
    'response_notified_at',
    'reviewed_by'
  ];
end;
$$;

create or replace function public.review_feedback(
  p_feedback_id uuid,
  p_status text,
  p_response text default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_admin_response text := nullif(
    regexp_replace(
      regexp_replace(coalesce(p_response, ''), '^[[:space:]]+', ''),
      '[[:space:]]+$',
      ''
    ),
    ''
  );
  v_now timestamptz;
  v_response_changed boolean;
  v_feedback public.feedbacks%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio. Entre novamente.';
  end if;

  if not public.is_feedback_admin() then
    raise exception 'Administrador de feedback obrigatorio.';
  end if;

  if p_feedback_id is null then
    raise exception 'feedback_id obrigatorio.';
  end if;

  if v_status not in (
    'novo', 'em_analise', 'respondido', 'resolvido', 'arquivado'
  ) then
    raise exception 'Status de feedback invalido.';
  end if;

  if v_admin_response is not null
    and char_length(v_admin_response) > 4000 then
    raise exception 'A resposta deve ter no maximo 4000 caracteres.';
  end if;

  if v_status = 'respondido'
    and (v_admin_response is null or char_length(v_admin_response) < 3) then
    raise exception
      'A resposta deve ter entre 3 e 4000 caracteres para marcar como respondido.';
  end if;

  select feedback.*
  into v_feedback
  from public.feedbacks as feedback
  where feedback.id = p_feedback_id
  for update;

  if not found then
    raise exception 'Feedback nao encontrado.';
  end if;

  if v_feedback.status = v_status
    and v_feedback.admin_response is not distinct from v_admin_response then
    return to_jsonb(v_feedback) - array[
      'submission_notification_id',
      'submission_notified_at',
      'response_notification_id',
      'response_notified_at',
      'reviewed_by'
    ];
  end if;

  if p_expected_updated_at is null
    or v_feedback.updated_at is distinct from p_expected_updated_at then
    raise exception 'FEEDBACK_CONFLICT';
  end if;

  v_response_changed :=
    v_feedback.admin_response is distinct from v_admin_response;
  v_now := greatest(
    clock_timestamp(),
    v_feedback.updated_at + interval '1 microsecond'
  );

  update public.feedbacks
  set
    status = v_status,
    admin_response = v_admin_response,
    response_notification_id = case
      when v_response_changed and v_admin_response is not null
        then gen_random_uuid()
      when v_response_changed then null
      else response_notification_id
    end,
    response_notified_at = case
      when v_response_changed then null
      else response_notified_at
    end,
    reviewed_by = v_user_id,
    reviewed_at = v_now,
    updated_at = v_now
  where id = p_feedback_id
  returning * into v_feedback;

  return to_jsonb(v_feedback) - array[
    'submission_notification_id',
    'submission_notified_at',
    'response_notification_id',
    'response_notified_at',
    'reviewed_by'
  ];
end;
$$;

create or replace function public.mark_feedback_submission_notified(
  p_feedback_id uuid,
  p_notification_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role obrigatorio.';
  end if;

  if p_feedback_id is null or p_notification_id is null then
    raise exception 'Feedback e notificacao obrigatorios.';
  end if;

  update public.feedbacks
  set submission_notified_at = coalesce(
    submission_notified_at,
    clock_timestamp()
  )
  where id = p_feedback_id
    and submission_notification_id = p_notification_id;

  return found;
end;
$$;

create or replace function public.get_feedback_submission_notification_state(
  p_feedback_id uuid,
  p_user_id uuid
)
returns table (
  notification_id uuid,
  notified_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role obrigatorio.';
  end if;

  if p_feedback_id is null or p_user_id is null then
    raise exception 'Feedback e usuario obrigatorios.';
  end if;

  return query
  select
    feedback.submission_notification_id,
    feedback.submission_notified_at
  from public.feedbacks as feedback
  where feedback.id = p_feedback_id
    and feedback.user_id = p_user_id;
end;
$$;

create or replace function public.mark_feedback_response_notified(
  p_feedback_id uuid,
  p_notification_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role obrigatorio.';
  end if;

  if p_feedback_id is null or p_notification_id is null then
    raise exception 'Feedback e notificacao obrigatorios.';
  end if;

  update public.feedbacks
  set response_notified_at = coalesce(
    response_notified_at,
    clock_timestamp()
  )
  where id = p_feedback_id
    and response_notification_id = p_notification_id;

  return found;
end;
$$;

create or replace function public.get_feedback_response_notification_state(
  p_feedback_id uuid
)
returns table (
  notification_id uuid,
  notified_at timestamptz,
  recipient_email text,
  response_text text,
  subject text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role obrigatorio.';
  end if;

  if p_feedback_id is null then
    raise exception 'feedback_id obrigatorio.';
  end if;

  return query
  select
    feedback.response_notification_id,
    feedback.response_notified_at,
    lower(
      regexp_replace(
        regexp_replace(
          authenticated_user.email::text,
          '^[[:space:]]+',
          ''
        ),
        '[[:space:]]+$',
        ''
      )
    ),
    feedback.admin_response,
    feedback.subject
  from public.feedbacks as feedback
  join auth.users as authenticated_user
    on authenticated_user.id = feedback.user_id
    and authenticated_user.email_confirmed_at is not null
    and authenticated_user.email is not null
  where feedback.id = p_feedback_id;
end;
$$;

create or replace function public.list_feedbacks_for_management(
  p_status text default null,
  p_category text default null,
  p_area text default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  sender_email text,
  submission_key uuid,
  category text,
  area text,
  subject text,
  message text,
  page_path text,
  status text,
  admin_response text,
  reviewed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_category text := nullif(lower(btrim(coalesce(p_category, ''))), '');
  v_area text := nullif(lower(btrim(coalesce(p_area, ''))), '');
  v_search text := nullif(
    lower(
      regexp_replace(
        regexp_replace(coalesce(p_search, ''), '^[[:space:]]+', ''),
        '[[:space:]]+$',
        ''
      )
    ),
    ''
  );
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
begin
  if auth.uid() is null then
    raise exception 'Usuario autenticado obrigatorio. Entre novamente.';
  end if;

  if not public.is_feedback_admin() then
    raise exception 'Administrador de feedback obrigatorio.';
  end if;

  if v_status is not null and v_status not in (
    'novo', 'em_analise', 'respondido', 'resolvido', 'arquivado'
  ) then
    raise exception 'Status de feedback invalido.';
  end if;

  if v_category is not null and v_category not in (
    'sugestao', 'reclamacao', 'problema', 'duvida', 'elogio'
  ) then
    raise exception 'Categoria de feedback invalida.';
  end if;

  if v_area is not null and v_area not in (
    'bipagem', 'pacotes', 'relatorios', 'cadastros', 'geral'
  ) then
    raise exception 'Area de feedback invalida.';
  end if;

  if v_search is not null and char_length(v_search) > 200 then
    raise exception 'Busca de feedback deve ter no maximo 200 caracteres.';
  end if;

  if v_limit < 1 or v_limit > 50 then
    raise exception 'Limite de feedback deve estar entre 1 e 50.';
  end if;

  if v_offset < 0 then
    raise exception 'Offset de feedback nao pode ser negativo.';
  end if;

  return query
  select
    feedback.id,
    feedback.user_id,
    feedback.sender_email,
    feedback.submission_key,
    feedback.category,
    feedback.area,
    feedback.subject,
    feedback.message,
    feedback.page_path,
    feedback.status,
    feedback.admin_response,
    feedback.reviewed_at,
    feedback.created_at,
    feedback.updated_at,
    count(*) over() as total_count
  from public.feedbacks as feedback
  where (v_status is null or feedback.status = v_status)
    and (v_category is null or feedback.category = v_category)
    and (v_area is null or feedback.area = v_area)
    and (
      v_search is null
      or position(v_search in lower(feedback.subject)) > 0
      or position(v_search in lower(feedback.message)) > 0
      or position(v_search in lower(feedback.sender_email)) > 0
      or position(v_search in lower(feedback.id::text)) > 0
      or position(
        v_search in lower(
          'FB-' || substr(replace(feedback.id::text, '-', ''), 1, 10)
        )
      ) > 0
    )
  order by feedback.created_at desc, feedback.id desc
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.get_feedback_management_summary()
returns table (
  total bigint,
  novo bigint,
  em_analise bigint,
  respondido bigint,
  resolvido bigint,
  arquivado bigint
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
    count(*) as total,
    count(*) filter (where feedback.status = 'novo') as novo,
    count(*) filter (where feedback.status = 'em_analise') as em_analise,
    count(*) filter (where feedback.status = 'respondido') as respondido,
    count(*) filter (where feedback.status = 'resolvido') as resolvido,
    count(*) filter (where feedback.status = 'arquivado') as arquivado
  from public.feedbacks as feedback;
end;
$$;

-- Nenhuma escrita direta e permitida: usuarios enviam e administradores
-- revisam exclusivamente pelas RPCs acima.
revoke all on table public.feedback_admins from public, anon, authenticated;
revoke all on table public.feedbacks from public, anon, authenticated;
grant select (
  id,
  user_id,
  sender_email,
  submission_key,
  category,
  area,
  subject,
  message,
  page_path,
  status,
  admin_response,
  reviewed_at,
  created_at,
  updated_at
) on table public.feedbacks to authenticated;

revoke all on function public.is_feedback_admin()
  from public, anon, authenticated;
revoke all on function public.submit_feedback(uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.review_feedback(uuid, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.mark_feedback_submission_notified(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_feedback_submission_notification_state(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_feedback_response_notified(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_feedback_response_notification_state(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.list_feedbacks_for_management(
  text, text, text, text, integer, integer
) from public, anon, authenticated;
revoke all on function public.get_feedback_management_summary()
  from public, anon, authenticated;

grant execute on function public.is_feedback_admin()
  to authenticated;
grant execute on function public.submit_feedback(uuid, text, text, text, text, text)
  to authenticated;
grant execute on function public.review_feedback(uuid, text, text, timestamptz)
  to authenticated;
grant execute on function public.mark_feedback_submission_notified(uuid, uuid)
  to service_role;
grant execute on function public.get_feedback_submission_notification_state(uuid, uuid)
  to service_role;
grant execute on function public.mark_feedback_response_notified(uuid, uuid)
  to service_role;
grant execute on function public.get_feedback_response_notification_state(uuid)
  to service_role;
grant execute on function public.list_feedbacks_for_management(
  text, text, text, text, integer, integer
) to authenticated;
grant execute on function public.get_feedback_management_summary()
  to authenticated;

commit;
