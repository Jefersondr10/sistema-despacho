-- Equipes e autoria operacional sem reescrever os dados existentes.
--
-- Compatibilidade: nas dez tabelas operacionais, user_id continua sendo o
-- identificador da conta. Para toda conta legada, accounts.id = user_id. O
-- usuário real que executa cada ação é registrado separadamente por auth.uid().

begin;

create extension if not exists pgcrypto;

create table if not exists public.accounts (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_name_check check (
    btrim(name) = name and char_length(name) between 1 and 120
  )
);

create table if not exists public.account_members (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'operator',
  status text not null default 'active',
  selected boolean not null default false,
  display_name text,
  email text not null,
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, user_id),
  constraint account_members_role_check check (
    role in ('owner', 'admin', 'supervisor', 'operator', 'viewer')
  ),
  constraint account_members_status_check check (
    status in ('active', 'suspended')
  ),
  constraint account_members_email_check check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 320
    and position('@' in email) > 1
  )
);

create unique index if not exists account_members_one_selected_account_idx
  on public.account_members (user_id)
  where selected and status = 'active';

create index if not exists account_members_user_active_idx
  on public.account_members (user_id, selected desc, created_at)
  where status = 'active';

create index if not exists account_members_account_role_idx
  on public.account_members (account_id, role, status);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  loja_id uuid,
  sessao_id uuid,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  constraint audit_events_action_check check (
    btrim(action) = action and char_length(action) between 1 and 100
  ),
  constraint audit_events_entity_table_check check (
    btrim(entity_table) = entity_table
    and char_length(entity_table) between 1 and 100
  )
);

create index if not exists audit_events_account_actor_time_idx
  on public.audit_events (account_id, actor_user_id, occurred_at desc);

create index if not exists audit_events_account_time_idx
  on public.audit_events (account_id, occurred_at desc, id desc);

create index if not exists audit_events_account_entity_time_idx
  on public.audit_events (
    account_id, entity_table, entity_id, occurred_at desc
  );

-- Cada usuário já existente mantém exatamente sua conta e seus dados atuais.
-- Nenhuma das dez tabelas operacionais é atualizada neste backfill.
insert into public.accounts (id, owner_user_id, name, active)
select
  authenticated_user.id,
  authenticated_user.id,
  left(
    coalesce(
      nullif(btrim(authenticated_user.raw_user_meta_data->>'name'), ''),
      nullif(btrim(authenticated_user.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(authenticated_user.email, '@', 1), ''),
      'Conta'
    ),
    120
  ),
  true
from auth.users as authenticated_user
where nullif(
  btrim(coalesce(authenticated_user.raw_app_meta_data->>'team_account_id', '')),
  ''
) is null
on conflict (id) do nothing;

insert into public.account_members (
  account_id,
  user_id,
  role,
  status,
  selected,
  display_name,
  email,
  invited_by,
  joined_at
)
select
  authenticated_user.id,
  authenticated_user.id,
  'owner',
  'active',
  true,
  nullif(
    btrim(
      coalesce(
        authenticated_user.raw_user_meta_data->>'name',
        authenticated_user.raw_user_meta_data->>'full_name',
        ''
      )
    ),
    ''
  ),
  coalesce(
    lower(btrim(authenticated_user.email)),
    'usuario-' || authenticated_user.id::text || '@local.invalid'
  ),
  authenticated_user.id,
  coalesce(authenticated_user.confirmed_at, authenticated_user.created_at, now())
from auth.users as authenticated_user
where nullif(
  btrim(coalesce(authenticated_user.raw_app_meta_data->>'team_account_id', '')),
  ''
) is null
on conflict (account_id, user_id) do nothing;

-- Signups normais ganham conta própria. Usuários criados pelo fluxo de convite
-- recebem team_account_id em app_metadata (somente service_role pode gravar) e
-- aguardam a rota concluir add_account_member, sem criar uma conta vazia.
create or replace function public.bootstrap_new_auth_user_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_account_id_text text := nullif(
    btrim(coalesce(new.raw_app_meta_data->>'team_account_id', '')),
    ''
  );
  v_name text;
begin
  if v_team_account_id_text is not null then
    begin
      perform v_team_account_id_text::uuid;
    exception when invalid_text_representation then
      raise exception 'team_account_id invalido no app_metadata.';
    end;

    if not exists (
      select 1
      from public.accounts as account
      where account.id = v_team_account_id_text::uuid
        and account.active
    ) then
      raise exception 'Conta de equipe informada no convite nao existe.';
    end if;

    return new;
  end if;

  v_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Conta'
    ),
    120
  );

  insert into public.accounts (id, owner_user_id, name)
  values (new.id, new.id, v_name)
  on conflict (id) do nothing;

  insert into public.account_members (
    account_id, user_id, role, status, selected, display_name, email,
    invited_by, joined_at
  ) values (
    new.id,
    new.id,
    'owner',
    'active',
    true,
    nullif(btrim(coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      ''
    )), ''),
    coalesce(
      lower(btrim(new.email)),
      'usuario-' || new.id::text || '@local.invalid'
    ),
    new.id,
    coalesce(new.confirmed_at, new.created_at, now())
  )
  on conflict (account_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists bootstrap_new_auth_user_account on auth.users;
create trigger bootstrap_new_auth_user_account
  after insert on auth.users
  for each row execute function public.bootstrap_new_auth_user_account();

-- Fecha a janela entre o primeiro backfill e a instalação do trigger. Um
-- signup concorrente que tenha entrado nesse intervalo é reconciliado aqui;
-- convites de equipe continuam esperando add_account_member.
insert into public.accounts (id, owner_user_id, name, active)
select
  authenticated_user.id,
  authenticated_user.id,
  left(
    coalesce(
      nullif(btrim(authenticated_user.raw_user_meta_data->>'name'), ''),
      nullif(btrim(authenticated_user.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(authenticated_user.email, '@', 1), ''),
      'Conta'
    ),
    120
  ),
  true
from auth.users as authenticated_user
where nullif(
  btrim(coalesce(authenticated_user.raw_app_meta_data->>'team_account_id', '')),
  ''
) is null
on conflict (id) do nothing;

insert into public.account_members (
  account_id,
  user_id,
  role,
  status,
  selected,
  display_name,
  email,
  invited_by,
  joined_at
)
select
  authenticated_user.id,
  authenticated_user.id,
  'owner',
  'active',
  true,
  nullif(
    btrim(
      coalesce(
        authenticated_user.raw_user_meta_data->>'name',
        authenticated_user.raw_user_meta_data->>'full_name',
        ''
      )
    ),
    ''
  ),
  coalesce(
    lower(btrim(authenticated_user.email)),
    'usuario-' || authenticated_user.id::text || '@local.invalid'
  ),
  authenticated_user.id,
  coalesce(authenticated_user.confirmed_at, authenticated_user.created_at, now())
from auth.users as authenticated_user
where nullif(
  btrim(coalesce(authenticated_user.raw_app_meta_data->>'team_account_id', '')),
  ''
) is null
on conflict (account_id, user_id) do nothing;

create or replace function public.current_account_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select member.account_id
  from public.account_members as member
  join public.accounts as account
    on account.id = member.account_id
   and account.active
  where member.user_id = (select auth.uid())
    and member.status = 'active'
  order by
    member.selected desc,
    (member.account_id = (select auth.uid())) desc,
    member.created_at,
    member.account_id
  limit 1;
$$;

create or replace function public.current_account_can_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.account_members as member
    join public.accounts as account
      on account.id = member.account_id
     and account.active
    where member.user_id = (select auth.uid())
      and member.account_id = public.current_account_id()
      and member.status = 'active'
      and member.role in ('owner', 'admin', 'supervisor', 'operator')
  );
$$;

create or replace function public.current_account_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.account_members as member
    join public.accounts as account
      on account.id = member.account_id
     and account.active
    where member.user_id = (select auth.uid())
      and member.account_id = public.current_account_id()
      and member.status = 'active'
      and member.role in ('owner', 'admin')
  );
$$;

create or replace function public.get_current_account_context()
returns table (
  account_id uuid,
  actor_user_id uuid,
  role text,
  display_name text,
  account_name text,
  can_manage_team boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    member.account_id,
    member.user_id,
    member.role,
    coalesce(member.display_name, member.email),
    account.name,
    member.role in ('owner', 'admin')
  from public.account_members as member
  join public.accounts as account
    on account.id = member.account_id
   and account.active
  where member.user_id = (select auth.uid())
    and member.account_id = public.current_account_id()
    and member.status = 'active'
  limit 1;
$$;

-- Mantém o nome público usado pelas RPCs antigas, mas agora retorna a conta
-- selecionada. Para o proprietário legado o resultado continua sendo auth.uid().
create or replace function public.exigir_usuario_autenticado()
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Usuario autenticado obrigatorio.';
  end if;

  v_account_id := public.current_account_id();
  if v_account_id is null then
    raise exception 'Usuario sem conta ativa. Solicite acesso ao administrador.';
  end if;

  return v_account_id;
end;
$$;

create or replace function public.add_account_member(
  p_user_id uuid,
  p_email text,
  p_display_name text default null,
  p_role text default 'operator'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_id uuid := public.current_account_id();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_role text := lower(btrim(coalesce(p_role, 'operator')));
  v_target public.account_members%rowtype;
  v_target_user auth.users%rowtype;
  v_actor_role text;
  v_existing_member boolean;
begin
  if v_actor_id is null or v_account_id is null then
    raise exception 'Usuario autenticado e conta ativa obrigatorios.';
  end if;
  if not public.current_account_is_admin() then
    raise exception 'Somente proprietario ou administrador pode cadastrar usuarios.';
  end if;
  if v_role not in ('admin', 'supervisor', 'operator', 'viewer') then
    raise exception 'Perfil invalido para novo usuario.';
  end if;

  select member.role
    into v_actor_role
  from public.account_members as member
  where member.account_id = v_account_id
    and member.user_id = v_actor_id
    and member.status = 'active';

  if v_actor_role = 'admin' and v_role = 'admin' then
    raise exception 'Somente o proprietario pode cadastrar administradores.';
  end if;
  if char_length(v_email) < 3 or char_length(v_email) > 320
    or position('@' in v_email) <= 1 then
    raise exception 'E-mail invalido.';
  end if;
  if p_user_id is null then
    raise exception 'Usuario obrigatorio.';
  end if;
  if v_display_name is not null and char_length(v_display_name) > 120 then
    raise exception 'Nome deve ter no maximo 120 caracteres.';
  end if;

  select authenticated_user.*
    into v_target_user
  from auth.users as authenticated_user
  where authenticated_user.id = p_user_id
    and lower(btrim(authenticated_user.email)) = v_email
  order by authenticated_user.created_at
  limit 1;

  if not found then
    raise exception 'Usuario ainda nao existe no login. Envie o convite primeiro.';
  end if;
  if v_target_user.id = v_actor_id then
    raise exception 'Use outro usuario para adicionar um membro a equipe.';
  end if;

  select exists (
    select 1
    from public.account_members as member
    where member.account_id = v_account_id
      and member.user_id = v_target_user.id
  ) into v_existing_member;

  if not v_existing_member and nullif(
    btrim(coalesce(v_target_user.raw_app_meta_data->>'team_account_id', '')),
    ''
  ) is distinct from v_account_id::text then
    raise exception 'Convite de equipe ausente ou invalido para este usuario.';
  end if;

  update public.account_members
  set selected = false,
      updated_at = clock_timestamp()
  where user_id = v_target_user.id
    and selected;

  insert into public.account_members (
    account_id, user_id, role, status, selected, display_name, email,
    invited_by, joined_at, created_at, updated_at
  ) values (
    v_account_id,
    v_target_user.id,
    v_role,
    'active',
    true,
    coalesce(
      v_display_name,
      nullif(btrim(coalesce(
        v_target_user.raw_user_meta_data->>'name',
        v_target_user.raw_user_meta_data->>'full_name',
        ''
      )), '')
    ),
    v_email,
    v_actor_id,
    clock_timestamp(),
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (account_id, user_id) do update
  set role = excluded.role,
      status = 'active',
      selected = true,
      display_name = coalesce(
        excluded.display_name,
        public.account_members.display_name
      ),
      email = excluded.email,
      invited_by = excluded.invited_by,
      joined_at = coalesce(
        public.account_members.joined_at,
        excluded.joined_at
      ),
      updated_at = excluded.updated_at
  returning * into v_target;

  insert into public.audit_events (
    account_id, actor_user_id, action, entity_table, entity_id, details
  ) values (
    v_account_id,
    v_actor_id,
    'team.member_added',
    'account_members',
    v_target.user_id,
    jsonb_build_object('role', v_target.role, 'email', v_target.email)
  );

  return jsonb_build_object(
    'account_id', v_target.account_id,
    'user_id', v_target.user_id,
    'role', v_target.role,
    'status', v_target.status,
    'display_name', coalesce(v_target.display_name, v_target.email),
    'email', v_target.email
  );
end;
$$;

create or replace function public.update_account_member(
  p_user_id uuid,
  p_display_name text default null,
  p_role text default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_id uuid := public.current_account_id();
  v_actor_role text;
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_role text := nullif(lower(btrim(coalesce(p_role, ''))), '');
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_member public.account_members%rowtype;
begin
  if v_actor_id is null or v_account_id is null then
    raise exception 'Usuario autenticado e conta ativa obrigatorios.';
  end if;
  if not public.current_account_is_admin() then
    raise exception 'Somente proprietario ou administrador pode alterar usuarios.';
  end if;
  if p_user_id is null then
    raise exception 'Usuario obrigatorio.';
  end if;
  if v_role is not null
    and v_role not in ('admin', 'supervisor', 'operator', 'viewer') then
    raise exception 'Perfil invalido.';
  end if;
  if v_status is not null and v_status not in ('active', 'suspended') then
    raise exception 'Status de membro invalido.';
  end if;
  if v_display_name is not null and char_length(v_display_name) > 120 then
    raise exception 'Nome deve ter no maximo 120 caracteres.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'team-member-operations:' || v_account_id::text || ':' || p_user_id::text,
    0
  ));

  select member.role
    into v_actor_role
  from public.account_members as member
  where member.account_id = v_account_id
    and member.user_id = v_actor_id
    and member.status = 'active';

  select member.*
    into v_member
  from public.account_members as member
  where member.account_id = v_account_id
    and member.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Membro nao encontrado nesta conta.';
  end if;
  if v_member.role = 'owner' then
    raise exception 'O proprietario da conta nao pode ser alterado por esta operacao.';
  end if;
  if v_actor_role = 'admin' and (v_member.role = 'admin' or v_role = 'admin') then
    raise exception 'Somente o proprietario pode gerenciar administradores.';
  end if;

  -- Suspensão precisa revogar o acesso imediatamente, mesmo quando o aparelho
  -- do operador ficou indisponível. O lote permanece intacto e volta a ficar
  -- acessível após reativação. Apenas a troca para viewer é bloqueada enquanto
  -- o próprio usuário ainda precisa concluir um lote aberto.
  if coalesce(v_status, v_member.status) = 'active'
    and coalesce(v_role, v_member.role) = 'viewer'
    and exists (
      select 1
      from public.sessoes_bipagem as sessao
      where sessao.user_id = v_account_id
        and sessao.iniciada_por = p_user_id
        and sessao.status = 'aberta'
    )
  then
    raise exception 'Finalize ou cancele o lote aberto antes de tornar este usuario somente leitura.';
  end if;

  update public.account_members
  set display_name = coalesce(v_display_name, display_name),
      role = coalesce(v_role, role),
      status = coalesce(v_status, status),
      selected = case
        when coalesce(v_status, status) = 'suspended' then false
        else selected
      end,
      updated_at = clock_timestamp()
  where account_id = v_account_id
    and user_id = p_user_id
  returning * into v_member;

  insert into public.audit_events (
    account_id, actor_user_id, action, entity_table, entity_id, details
  ) values (
    v_account_id,
    v_actor_id,
    'team.member_updated',
    'account_members',
    v_member.user_id,
    jsonb_build_object('role', v_member.role, 'status', v_member.status)
  );

  return jsonb_build_object(
    'account_id', v_member.account_id,
    'user_id', v_member.user_id,
    'role', v_member.role,
    'status', v_member.status,
    'display_name', coalesce(v_member.display_name, v_member.email),
    'email', v_member.email
  );
end;
$$;

create or replace function public.list_team_admin_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := public.current_account_id();
begin
  if auth.uid() is null or v_account_id is null then
    raise exception 'Usuario autenticado e conta ativa obrigatorios.';
  end if;
  if not public.current_account_is_admin() then
    raise exception 'Somente proprietario ou administrador pode ver a equipe.';
  end if;

  return jsonb_build_object(
    'context', (
      select to_jsonb(context_row)
      from public.get_current_account_context() as context_row
    ),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', member.user_id,
          'display_name', coalesce(member.display_name, member.email),
          'email', member.email,
          'role', member.role,
          'status', member.status,
          'created_at', member.created_at,
          'updated_at', member.updated_at,
          'last_activity_at', (
            select max(event.occurred_at)
            from public.audit_events as event
            where event.account_id = member.account_id
              and event.actor_user_id = member.user_id
          )
        )
        order by
          case member.role
            when 'owner' then 0
            when 'admin' then 1
            when 'supervisor' then 2
            when 'operator' then 3
            else 4
          end,
          coalesce(member.display_name, member.email)
      )
      from public.account_members as member
      where member.account_id = v_account_id
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(to_jsonb(recent_event) order by recent_event.occurred_at desc)
      from (
        select
          event.id,
          event.actor_user_id,
          coalesce(actor.display_name, actor.email) as actor_display_name,
          event.action,
          event.entity_table as entity_type,
          coalesce(event.details->>'description', '') as description,
          event.occurred_at
        from public.audit_events as event
        left join public.account_members as actor
          on actor.account_id = event.account_id
         and actor.user_id = event.actor_user_id
        where event.account_id = v_account_id
        order by event.occurred_at desc, event.id desc
        limit 100
      ) as recent_event
    ), '[]'::jsonb)
  );
end;
$$;

-- Autoria começa a ser preenchida somente daqui em diante. Linhas antigas
-- permanecem null para não atribuir ações históricas sem evidência.
alter table public.lojas
  add column if not exists criado_por uuid references auth.users(id) on delete set null,
  add column if not exists atualizado_por uuid references auth.users(id) on delete set null;
alter table public.marketplaces
  add column if not exists criado_por uuid references auth.users(id) on delete set null,
  add column if not exists atualizado_por uuid references auth.users(id) on delete set null;
alter table public.transportadoras
  add column if not exists criado_por uuid references auth.users(id) on delete set null,
  add column if not exists atualizado_por uuid references auth.users(id) on delete set null;
alter table public.relatorio_destinatarios
  add column if not exists criado_por uuid references auth.users(id) on delete set null,
  add column if not exists atualizado_por uuid references auth.users(id) on delete set null;
alter table public.relatorio_envios
  add column if not exists realizado_por uuid references auth.users(id) on delete set null;
alter table public.sessoes_bipagem
  add column if not exists iniciada_por uuid references auth.users(id) on delete set null,
  add column if not exists finalizada_por uuid references auth.users(id) on delete set null,
  add column if not exists cancelada_por uuid references auth.users(id) on delete set null;
alter table public.itens_sessao_bipagem
  add column if not exists bipado_por uuid references auth.users(id) on delete set null,
  add column if not exists removido_por uuid references auth.users(id) on delete set null;
alter table public.pacotes
  add column if not exists bipado_por uuid references auth.users(id) on delete set null,
  add column if not exists finalizado_por uuid references auth.users(id) on delete set null,
  add column if not exists cancelado_por uuid references auth.users(id) on delete set null;
alter table public.movimentacoes
  add column if not exists realizado_por uuid references auth.users(id) on delete set null;
alter table public.pacotes_cancelados
  add column if not exists realizado_por uuid references auth.users(id) on delete set null;

-- Um mesmo navegador pode ser compartilhado por operadores diferentes sem
-- que um restaure ou bloqueie o lote aberto pelo outro.
drop index if exists public.idx_sessoes_bipagem_user_estacao_aberta;
create unique index if not exists idx_sessoes_bipagem_conta_operador_estacao_aberta
  on public.sessoes_bipagem (user_id, iniciada_por, estacao_id)
  where status = 'aberta'
    and iniciada_por is not null
    and estacao_id is not null;
create unique index if not exists idx_sessoes_bipagem_conta_estacao_legada_aberta
  on public.sessoes_bipagem (user_id, estacao_id)
  where status = 'aberta'
    and iniciada_por is null
    and estacao_id is not null;

-- O cliente nunca decide quem praticou a ação. O trigger ignora valores
-- enviados e usa exclusivamente a identidade validada no JWT.
create or replace function public.stamp_operational_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_patch jsonb := '{}'::jsonb;
  v_scanner_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Usuario autenticado obrigatorio para registrar autoria.';
  end if;

  if tg_table_name in (
    'lojas', 'marketplaces', 'transportadoras', 'relatorio_destinatarios'
  ) then
    if tg_op = 'INSERT' then
      v_patch := jsonb_build_object(
        'criado_por', v_actor_id,
        'atualizado_por', v_actor_id
      );
    else
      v_patch := jsonb_build_object(
        'criado_por', to_jsonb(old)->'criado_por',
        'atualizado_por', v_actor_id
      );
    end if;
  elsif tg_table_name = 'relatorio_envios' then
    v_patch := jsonb_build_object(
      'realizado_por', case
        when tg_op = 'INSERT' then to_jsonb(v_actor_id)
        else to_jsonb(old)->'realizado_por'
      end
    );
  elsif tg_table_name = 'sessoes_bipagem' then
    if tg_op = 'INSERT' then
      v_patch := jsonb_build_object('iniciada_por', v_actor_id);
    else
      v_patch := jsonb_build_object(
        'iniciada_por', case
          when old.iniciada_por is null
            and new.iniciada_por = v_actor_id
            and exists (
              select 1
              from public.accounts as account
              where account.id = new.user_id
                and account.owner_user_id = v_actor_id
            )
            then to_jsonb(v_actor_id)
          else to_jsonb(old)->'iniciada_por'
        end,
        'finalizada_por', case
          when new.status = 'finalizada'
            and old.status is distinct from new.status
            then to_jsonb(v_actor_id)
          else to_jsonb(old)->'finalizada_por'
        end,
        'cancelada_por', case
          when new.status = 'cancelada'
            and old.status is distinct from new.status
            then to_jsonb(v_actor_id)
          else to_jsonb(old)->'cancelada_por'
        end
      );
    end if;
  elsif tg_table_name = 'itens_sessao_bipagem' then
    if tg_op = 'INSERT' then
      v_patch := jsonb_build_object('bipado_por', v_actor_id);
    else
      v_patch := jsonb_build_object(
        'bipado_por', to_jsonb(old)->'bipado_por',
        'removido_por', case
          when old.status = 'pendente'
            and new.status in ('descartado', 'cancelado')
            and exists (
              select 1
              from public.sessoes_bipagem as sessao
              where sessao.id = new.sessao_id
                and sessao.user_id = new.user_id
                and sessao.status = 'aberta'
            )
            then to_jsonb(v_actor_id)
          else to_jsonb(old)->'removido_por'
        end
      );
    end if;
  elsif tg_table_name = 'pacotes' then
    if tg_op = 'INSERT' then
      select item.bipado_por
        into v_scanner_id
      from public.itens_sessao_bipagem as item
      where item.user_id = new.user_id
        and item.sessao_id = new.sessao_id
        and item.codigo_normalizado = public.normalizar_codigo_pacote(new.codigo)
      order by item.ordem, item.criado_em
      limit 1;

      v_patch := jsonb_build_object(
        'bipado_por', coalesce(v_scanner_id, v_actor_id),
        'finalizado_por', case
          when new.status = 'finalizado' then to_jsonb(v_actor_id)
          else 'null'::jsonb
        end,
        'cancelado_por', case
          when new.status = 'cancelado' then to_jsonb(v_actor_id)
          else 'null'::jsonb
        end
      );
    else
      v_patch := jsonb_build_object(
        'bipado_por', to_jsonb(old)->'bipado_por',
        'finalizado_por', case
          when new.status = 'finalizado'
            and old.status is distinct from new.status
            then to_jsonb(v_actor_id)
          else to_jsonb(old)->'finalizado_por'
        end,
        'cancelado_por', case
          when new.status = 'cancelado'
            and old.status is distinct from new.status
            then to_jsonb(v_actor_id)
          else to_jsonb(old)->'cancelado_por'
        end
      );
    end if;
  elsif tg_table_name = 'movimentacoes' then
    if tg_op = 'INSERT' and new.tipo_movimentacao = 'Bipagem' then
      select pacote.bipado_por
        into v_scanner_id
      from public.pacotes as pacote
      where pacote.id = new.pacote_id
        and pacote.user_id = new.user_id;
    end if;
    v_patch := jsonb_build_object(
      'realizado_por', case
        when tg_op = 'INSERT' then to_jsonb(coalesce(v_scanner_id, v_actor_id))
        else to_jsonb(old)->'realizado_por'
      end
    );
  elsif tg_table_name = 'pacotes_cancelados' then
    v_patch := jsonb_build_object(
      'realizado_por', case
        when tg_op = 'INSERT' then to_jsonb(v_actor_id)
        else to_jsonb(old)->'realizado_por'
      end
    );
  end if;

  new := jsonb_populate_record(new, v_patch);
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'lojas',
    'marketplaces',
    'transportadoras',
    'relatorio_destinatarios',
    'relatorio_envios',
    'sessoes_bipagem',
    'itens_sessao_bipagem',
    'pacotes',
    'movimentacoes',
    'pacotes_cancelados'
  ]
  loop
    execute format(
      'drop trigger if exists stamp_operational_actor on public.%I',
      v_table
    );
    execute format(
      'create trigger stamp_operational_actor before insert or update on public.%I for each row execute function public.stamp_operational_actor()',
      v_table
    );
  end loop;
end;
$$;

-- Auditoria intencionalmente enxuta: não duplica os INSERTs de pacotes e
-- movimentações feitos em massa na finalização. Todo evento é gravado na mesma
-- transação da ação de negócio.
create or replace function public.append_operational_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case
    when tg_op = 'DELETE' then to_jsonb(old)
    else to_jsonb(new)
  end;
  v_old jsonb := case
    when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old)
  end;
  v_account_id uuid := nullif(v_row->>'user_id', '')::uuid;
  v_entity_id uuid := nullif(v_row->>'id', '')::uuid;
  v_loja_id uuid := nullif(v_row->>'loja_id', '')::uuid;
  v_sessao_id uuid := case
    when tg_table_name = 'sessoes_bipagem' then v_entity_id
    else nullif(v_row->>'sessao_id', '')::uuid
  end;
  v_action text;
  v_details jsonb;
begin
  if v_account_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_table_name = 'sessoes_bipagem' then
    if tg_op = 'INSERT' then
      v_action := 'sessoes_bipagem.aberta';
    else
      if v_old->>'status' is not distinct from v_row->>'status'
        or v_row->>'status' not in ('finalizada', 'cancelada') then
        return new;
      end if;
      v_action := 'sessoes_bipagem.' || v_row->>'status';
    end if;
  elsif tg_table_name = 'itens_sessao_bipagem' and tg_op = 'UPDATE' then
    if v_old->>'status' = 'pendente'
      and v_row->>'status' in ('descartado', 'cancelado')
      and nullif(v_row->>'removido_por', '') is not null then
      v_action := 'itens_sessao_bipagem.removido';
    else
      return new;
    end if;
  elsif tg_table_name = 'relatorio_envios' and tg_op = 'INSERT' then
    v_action := case
      when v_row->>'status' = 'sucesso' then 'relatorio_envios.enviado'
      else 'relatorio_envios.erro'
    end;
  else
    v_action := tg_table_name || '.' || lower(tg_op);
  end if;

  v_details := jsonb_strip_nulls(jsonb_build_object(
    'before', case when tg_op in ('UPDATE', 'DELETE') then v_old end,
    'after', case when tg_op in ('INSERT', 'UPDATE') then v_row end
  ));

  insert into public.audit_events (
    account_id,
    actor_user_id,
    action,
    entity_table,
    entity_id,
    loja_id,
    sessao_id,
    details
  ) values (
    v_account_id,
    auth.uid(),
    v_action,
    tg_table_name,
    v_entity_id,
    v_loja_id,
    v_sessao_id,
    v_details
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'lojas',
    'marketplaces',
    'transportadoras',
    'relatorio_destinatarios'
  ]
  loop
    execute format(
      'drop trigger if exists append_operational_audit_event on public.%I',
      v_table
    );
    execute format(
      'create trigger append_operational_audit_event after insert or update or delete on public.%I for each row execute function public.append_operational_audit_event()',
      v_table
    );
  end loop;
end;
$$;

drop trigger if exists audit_sessao_iniciada on public.sessoes_bipagem;
create trigger audit_sessao_iniciada
  after insert on public.sessoes_bipagem
  for each row execute function public.append_operational_audit_event();
drop trigger if exists audit_sessao_encerrada on public.sessoes_bipagem;
create trigger audit_sessao_encerrada
  after update of status on public.sessoes_bipagem
  for each row execute function public.append_operational_audit_event();

drop trigger if exists audit_item_bipado on public.itens_sessao_bipagem;
create trigger audit_item_bipado
  after insert on public.itens_sessao_bipagem
  for each row execute function public.append_operational_audit_event();
drop trigger if exists audit_item_excluido on public.itens_sessao_bipagem;
create trigger audit_item_excluido
  after delete on public.itens_sessao_bipagem
  for each row execute function public.append_operational_audit_event();
drop trigger if exists audit_item_removido on public.itens_sessao_bipagem;
create trigger audit_item_removido
  after update of status on public.itens_sessao_bipagem
  for each row
  when (
    old.status = 'pendente'
    and new.status in ('descartado', 'cancelado')
    and new.removido_por is not null
  )
  execute function public.append_operational_audit_event();
drop trigger if exists audit_cancelamento_criado on public.pacotes_cancelados;
create trigger audit_cancelamento_criado
  after insert on public.pacotes_cancelados
  for each row execute function public.append_operational_audit_event();

drop trigger if exists audit_relatorio_enviado on public.relatorio_envios;
create trigger audit_relatorio_enviado
  after insert on public.relatorio_envios
  for each row execute function public.append_operational_audit_event();

-- RLS por equipe. Nesta primeira versão todos os membros ativos compartilham
-- os dados; viewer é somente leitura. user_id continua sendo a conta.
do $$
declare
  v_table text;
  v_policy record;
begin
  foreach v_table in array array[
    'lojas',
    'marketplaces',
    'transportadoras',
    'relatorio_destinatarios',
    'relatorio_envios',
    'sessoes_bipagem',
    'itens_sessao_bipagem',
    'pacotes',
    'movimentacoes',
    'pacotes_cancelados'
  ]
  loop
    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = v_table
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        v_policy.policyname,
        v_table
      );
    end loop;

    execute format('alter table public.%I enable row level security', v_table);
    execute format(
      'alter table public.%I alter column user_id set default public.current_account_id()',
      v_table
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select public.current_account_id()))',
      v_table || '_select_team',
      v_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select public.current_account_id()) and (select public.current_account_can_write()))',
      v_table || '_insert_team',
      v_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select public.current_account_id()) and (select public.current_account_can_write())) with check (user_id = (select public.current_account_id()) and (select public.current_account_can_write()))',
      v_table || '_update_team',
      v_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select public.current_account_id()) and (select public.current_account_can_write()))',
      v_table || '_delete_team',
      v_table
    );
  end loop;
end;
$$;

alter table public.accounts enable row level security;
alter table public.account_members enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists accounts_select_current on public.accounts;
create policy accounts_select_current
  on public.accounts for select to authenticated
  using (id = (select public.current_account_id()));

drop policy if exists account_members_select_self on public.account_members;
create policy account_members_select_self
  on public.account_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists audit_events_select_admin on public.audit_events;
create policy audit_events_select_admin
  on public.audit_events for select to authenticated
  using (
    account_id = (select public.current_account_id())
    and (select public.current_account_is_admin())
  );

-- Sessões abertas são restauradas por conta + operador + aparelho. Somente o
-- proprietário legado pode reivindicar o único lote antigo sem iniciada_por.
create or replace function public.obter_sessao_bipagem_aberta(
  p_estacao_id uuid
)
returns setof public.sessoes_bipagem
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_id uuid := public.exigir_usuario_autenticado();
  v_sessao public.sessoes_bipagem%rowtype;
  v_legacy_open_count integer;
begin
  if p_estacao_id is null then
    raise exception 'estacao_id obrigatorio.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'bipagem-estacao:' || v_account_id::text || ':' ||
      v_actor_id::text || ':' || p_estacao_id::text,
      0
    )
  );

  select sessao.*
    into v_sessao
  from public.sessoes_bipagem as sessao
  where sessao.user_id = v_account_id
    and sessao.iniciada_por = v_actor_id
    and sessao.estacao_id = p_estacao_id
    and sessao.status = 'aberta'
  order by sessao.iniciada_em desc
  limit 1
  for update;

  if not found and v_account_id = v_actor_id then
    perform pg_advisory_xact_lock(
      hashtextextended('bipagem-legado:' || v_account_id::text, 0)
    );

    select sessao.*
      into v_sessao
    from public.sessoes_bipagem as sessao
    where sessao.user_id = v_account_id
      and sessao.iniciada_por is null
      and sessao.estacao_id = p_estacao_id
      and sessao.status = 'aberta'
    order by sessao.iniciada_em desc
    limit 1
    for update;

    if found then
      update public.sessoes_bipagem as sessao
      set iniciada_por = v_actor_id
      where sessao.id = v_sessao.id
        and sessao.user_id = v_account_id
        and sessao.iniciada_por is null
        and sessao.estacao_id = p_estacao_id
        and sessao.status = 'aberta'
      returning sessao.* into v_sessao;

      return next v_sessao;
      return;
    end if;

    select count(*)
      into v_legacy_open_count
    from public.sessoes_bipagem as sessao
    where sessao.user_id = v_account_id
      and sessao.iniciada_por is null
      and sessao.estacao_id is null
      and sessao.status = 'aberta';

    if v_legacy_open_count = 1 then
      select sessao.*
        into v_sessao
      from public.sessoes_bipagem as sessao
      where sessao.user_id = v_account_id
        and sessao.iniciada_por is null
        and sessao.estacao_id is null
        and sessao.status = 'aberta'
      order by sessao.iniciada_em desc
      limit 1
      for update skip locked;

      if found then
        update public.sessoes_bipagem as sessao
        set estacao_id = p_estacao_id,
            iniciada_por = v_actor_id
        where sessao.id = v_sessao.id
          and sessao.user_id = v_account_id
          and sessao.iniciada_por is null
          and sessao.estacao_id is null
          and sessao.status = 'aberta'
        returning sessao.* into v_sessao;
      end if;
    end if;
  end if;

  if v_sessao.id is null then
    return;
  end if;

  return next v_sessao;
  return;
end;
$$;

create or replace function public.iniciar_sessao_bipagem_independente(
  p_estacao_id uuid,
  p_loja_id uuid,
  p_marketplace_id uuid,
  p_tipo_operacao text,
  p_melhor_envio boolean,
  p_transportadora_id uuid,
  p_iniciada_em timestamptz
)
returns setof public.sessoes_bipagem
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_id uuid := public.exigir_usuario_autenticado();
  v_sessao public.sessoes_bipagem%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'team-member-operations:' || v_account_id::text || ':' || v_actor_id::text,
    0
  ));

  if not public.current_account_can_write() then
    raise exception 'Perfil somente leitura nao pode iniciar bipagem.';
  end if;
  if p_estacao_id is null then
    raise exception 'estacao_id obrigatorio.';
  end if;
  if p_loja_id is null then
    raise exception 'loja_id obrigatorio.';
  end if;
  if p_marketplace_id is null then
    raise exception 'marketplace_id obrigatorio.';
  end if;
  if p_tipo_operacao not in ('coleta', 'postagem') then
    raise exception 'tipo_operacao invalido.';
  end if;
  if coalesce(p_melhor_envio, false) and p_transportadora_id is null then
    raise exception 'transportadora_id obrigatorio para Melhor Envio.';
  end if;

  select restored.*
    into v_sessao
  from public.obter_sessao_bipagem_aberta(p_estacao_id) as restored
  limit 1;

  if found then
    if v_sessao.loja_id is distinct from p_loja_id
      or v_sessao.marketplace_id is distinct from p_marketplace_id
      or v_sessao.tipo_operacao is distinct from p_tipo_operacao
      or v_sessao.melhor_envio is distinct from coalesce(p_melhor_envio, false)
      or v_sessao.transportadora_id is distinct from p_transportadora_id
    then
      raise exception 'Este operador ja possui outro lote aberto neste aparelho. Recarregue a bipagem.';
    end if;

    return next v_sessao;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'bipagem-estacao:' || v_account_id::text || ':' ||
      v_actor_id::text || ':' || p_estacao_id::text,
      0
    )
  );

  select sessao.*
    into v_sessao
  from public.sessoes_bipagem as sessao
  where sessao.user_id = v_account_id
    and sessao.iniciada_por = v_actor_id
    and sessao.estacao_id = p_estacao_id
    and sessao.status = 'aberta'
  order by sessao.iniciada_em desc
  limit 1
  for update;

  if found then
    if v_sessao.loja_id is distinct from p_loja_id
      or v_sessao.marketplace_id is distinct from p_marketplace_id
      or v_sessao.tipo_operacao is distinct from p_tipo_operacao
      or v_sessao.melhor_envio is distinct from coalesce(p_melhor_envio, false)
      or v_sessao.transportadora_id is distinct from p_transportadora_id
    then
      raise exception 'Este operador ja possui outro lote aberto neste aparelho. Recarregue a bipagem.';
    end if;

    return next v_sessao;
    return;
  end if;

  insert into public.sessoes_bipagem (
    user_id,
    iniciada_por,
    estacao_id,
    loja_id,
    marketplace_id,
    tipo_operacao,
    melhor_envio,
    transportadora_id,
    status,
    iniciada_em
  ) values (
    v_account_id,
    v_actor_id,
    p_estacao_id,
    p_loja_id,
    p_marketplace_id,
    p_tipo_operacao,
    coalesce(p_melhor_envio, false),
    p_transportadora_id,
    'aberta',
    coalesce(p_iniciada_em, now())
  )
  returning * into v_sessao;

  return next v_sessao;
  return;
end;
$$;

create or replace function public.recalcular_duplicados_sessao_bipagem(
  p_sessao_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_id uuid := public.exigir_usuario_autenticado();
begin
  update public.sessoes_bipagem
  set iniciada_por = v_actor_id
  where id = p_sessao_id
    and user_id = v_account_id
    and iniciada_por is null
    and status = 'aberta'
    and v_account_id = v_actor_id;

  if not exists (
    select 1
    from public.sessoes_bipagem as sessao
    where sessao.id = p_sessao_id
      and sessao.user_id = v_account_id
      and (
        sessao.iniciada_por = v_actor_id
        or (
          sessao.iniciada_por is null
          and v_account_id = v_actor_id
        )
      )
  ) then
    raise exception 'Sessao de bipagem nao encontrada para este operador.';
  end if;

  with codigos_duplicados as (
    select item.codigo_normalizado
    from public.itens_sessao_bipagem as item
    where item.user_id = v_account_id
      and item.sessao_id = p_sessao_id
      and item.status = 'pendente'
    group by item.codigo_normalizado
    having count(*) > 1
  ), flags_desejadas as (
    select
      item.id,
      duplicado.codigo_normalizado is not null as duplicado
    from public.itens_sessao_bipagem as item
    left join codigos_duplicados as duplicado
      on duplicado.codigo_normalizado = item.codigo_normalizado
    where item.user_id = v_account_id
      and item.sessao_id = p_sessao_id
      and item.status = 'pendente'
  )
  update public.itens_sessao_bipagem as item
  set duplicado = flags.duplicado
  from flags_desejadas as flags
  where item.id = flags.id
    and item.user_id = v_account_id
    and item.duplicado is distinct from flags.duplicado;
end;
$$;

create or replace function public.adicionar_item_sessao_bipagem_v3(
  p_codigo text,
  p_sessao_id uuid
)
returns setof public.itens_sessao_bipagem
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_id uuid := public.exigir_usuario_autenticado();
  v_sessao_status text;
  v_loja_id uuid;
  v_codigo_normalizado text;
  v_ordem integer;
  v_duplicado boolean;
  v_pacote_finalizado boolean;
  v_outro_lote_aberto boolean;
  v_item public.itens_sessao_bipagem%rowtype;
begin
  if not public.current_account_can_write() then
    raise exception 'Perfil somente leitura nao pode bipar.';
  end if;

  select sessao.status, sessao.loja_id
    into v_sessao_status, v_loja_id
  from public.sessoes_bipagem as sessao
  where sessao.id = p_sessao_id
    and sessao.user_id = v_account_id
    and (
      sessao.iniciada_por = v_actor_id
      or (
        sessao.iniciada_por is null
        and v_account_id = v_actor_id
      )
    )
  for update;

  if not found then
    raise exception 'Sessao de bipagem nao encontrada para este operador.';
  end if;
  update public.sessoes_bipagem
  set iniciada_por = v_actor_id
  where id = p_sessao_id
    and user_id = v_account_id
    and iniciada_por is null
    and v_account_id = v_actor_id;
  if v_loja_id is null then
    raise exception 'Selecione a loja antes de bipar.';
  end if;
  if v_sessao_status <> 'aberta' then
    raise exception 'Sessao de bipagem nao esta aberta.';
  end if;

  v_codigo_normalizado := public.normalizar_codigo_pacote(p_codigo);
  if coalesce(v_codigo_normalizado, '') = '' then
    raise exception 'codigo obrigatorio.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'bipagem-codigo:' || v_account_id::text || ':' || v_codigo_normalizado,
      0
    )
  );

  select
    exists (
      select 1
      from public.pacotes as pacote
      where pacote.user_id = v_account_id
        and public.normalizar_codigo_pacote(pacote.codigo) = v_codigo_normalizado
        and pacote.status <> 'cancelado'
    ),
    exists (
      select 1
      from public.itens_sessao_bipagem as item
      join public.sessoes_bipagem as outra_sessao
        on outra_sessao.id = item.sessao_id
       and outra_sessao.user_id = item.user_id
      where item.user_id = v_account_id
        and item.codigo_normalizado = v_codigo_normalizado
        and item.status = 'pendente'
        and outra_sessao.status = 'aberta'
        and outra_sessao.id <> p_sessao_id
    )
  into v_pacote_finalizado, v_outro_lote_aberto;

  if v_pacote_finalizado then
    raise exception 'Pacote duplicado: este codigo ja foi finalizado nesta conta.';
  end if;
  if v_outro_lote_aberto then
    raise exception 'Pacote duplicado: este codigo ja esta em outro lote aberto desta conta.';
  end if;

  select coalesce((
    select item.ordem
    from public.itens_sessao_bipagem as item
    where item.user_id = v_account_id
      and item.sessao_id = p_sessao_id
      and item.ordem is not null
    order by item.ordem desc nulls last
    limit 1
  ), 0) + 1
  into v_ordem;

  select exists (
    select 1
    from public.itens_sessao_bipagem as item
    where item.user_id = v_account_id
      and item.sessao_id = p_sessao_id
      and item.codigo_normalizado = v_codigo_normalizado
      and item.status = 'pendente'
  ) into v_duplicado;

  if v_duplicado then
    update public.itens_sessao_bipagem as item
    set duplicado = true
    where item.user_id = v_account_id
      and item.sessao_id = p_sessao_id
      and item.codigo_normalizado = v_codigo_normalizado
      and item.status = 'pendente'
      and item.duplicado is distinct from true;
  end if;

  insert into public.itens_sessao_bipagem (
    user_id, sessao_id, codigo, codigo_normalizado, ordem, status, duplicado,
    bipado_por
  ) values (
    v_account_id, p_sessao_id, v_codigo_normalizado, v_codigo_normalizado,
    v_ordem, 'pendente', v_duplicado, v_actor_id
  ) returning * into v_item;

  return next v_item;
  return;
end;
$$;

create or replace function public.adicionar_item_sessao_bipagem_v2(
  p_codigo text,
  p_sessao_id uuid
)
returns setof public.itens_sessao_bipagem
language sql
security invoker
set search_path = public
as $$
  select *
  from public.adicionar_item_sessao_bipagem_v3(p_codigo, p_sessao_id);
$$;

create or replace function public.adicionar_item_sessao_bipagem(
  p_codigo text,
  p_sessao_id uuid
)
returns setof public.itens_sessao_bipagem
language sql
security invoker
set search_path = public
as $$
  select *
  from public.adicionar_item_sessao_bipagem_v3(p_codigo, p_sessao_id);
$$;

create or replace function public.remover_item_sessao_bipagem_v2(
  p_item_id uuid,
  p_status text default 'descartado'
)
returns setof public.itens_sessao_bipagem
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_id uuid := public.exigir_usuario_autenticado();
  v_sessao_id uuid;
  v_sessao_status text;
  v_codigo_normalizado text;
  v_restantes integer;
  v_item public.itens_sessao_bipagem%rowtype;
begin
  if not public.current_account_can_write() then
    raise exception 'Perfil somente leitura nao pode remover bipagem.';
  end if;
  if p_status not in ('descartado', 'cancelado') then
    raise exception 'Status invalido para remocao de item de sessao.';
  end if;

  select item.sessao_id
    into v_sessao_id
  from public.itens_sessao_bipagem as item
  where item.id = p_item_id
    and item.user_id = v_account_id;

  if not found then
    raise exception 'Item de sessao nao encontrado.';
  end if;

  update public.sessoes_bipagem
  set iniciada_por = v_actor_id
  where id = v_sessao_id
    and user_id = v_account_id
    and iniciada_por is null
    and status = 'aberta'
    and v_account_id = v_actor_id;

  select sessao.status
    into v_sessao_status
  from public.sessoes_bipagem as sessao
  where sessao.id = v_sessao_id
    and sessao.user_id = v_account_id
    and sessao.iniciada_por = v_actor_id
  for update;

  if not found then
    raise exception 'Sessao de bipagem nao encontrada para este operador.';
  end if;
  if v_sessao_status <> 'aberta' then
    raise exception 'Sessao de bipagem nao esta aberta.';
  end if;

  select item.codigo_normalizado
    into v_codigo_normalizado
  from public.itens_sessao_bipagem as item
  where item.id = p_item_id
    and item.user_id = v_account_id
    and item.sessao_id = v_sessao_id
    and item.status = 'pendente'
  for update;

  if not found then
    raise exception 'Item de sessao nao encontrado.';
  end if;

  update public.itens_sessao_bipagem as item
  set status = p_status,
      duplicado = false,
      removido_por = v_actor_id
  where item.id = p_item_id
    and item.user_id = v_account_id
    and item.status = 'pendente'
  returning * into v_item;

  if not found then
    raise exception 'Item de sessao nao esta pendente.';
  end if;

  select count(*)
    into v_restantes
  from (
    select 1
    from public.itens_sessao_bipagem as item
    where item.user_id = v_account_id
      and item.sessao_id = v_sessao_id
      and item.codigo_normalizado = v_codigo_normalizado
      and item.status = 'pendente'
    limit 2
  ) as restantes;

  if v_restantes = 1 then
    update public.itens_sessao_bipagem as item
    set duplicado = false
    where item.user_id = v_account_id
      and item.sessao_id = v_sessao_id
      and item.codigo_normalizado = v_codigo_normalizado
      and item.status = 'pendente'
      and item.duplicado is distinct from false;
  end if;

  return next v_item;
  return;
end;
$$;

create or replace function public.remover_item_sessao_bipagem(
  p_item_id uuid,
  p_status text default 'descartado'
)
returns setof public.itens_sessao_bipagem
language sql
security invoker
set search_path = public
as $$
  select *
  from public.remover_item_sessao_bipagem_v2(p_item_id, p_status);
$$;

create or replace function public.finalizar_sessao_bipagem(p_sessao_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_id uuid := public.exigir_usuario_autenticado();
  v_sessao public.sessoes_bipagem%rowtype;
  v_total_pacotes integer;
  v_codigo_duplicado text;
  v_codigo_existente text;
  v_codigo_lock text;
  v_finalizada_em timestamptz := now();
  v_codigo_lote text;
begin
  if not public.current_account_can_write() then
    raise exception 'Perfil somente leitura nao pode finalizar bipagem.';
  end if;

  update public.sessoes_bipagem
  set iniciada_por = v_actor_id
  where id = p_sessao_id
    and user_id = v_account_id
    and iniciada_por is null
    and status = 'aberta'
    and v_account_id = v_actor_id;

  select * into v_sessao
  from public.sessoes_bipagem
  where id = p_sessao_id
    and user_id = v_account_id
    and iniciada_por = v_actor_id
  for update;

  if not found then
    raise exception 'Sessao de bipagem nao encontrada para este operador.';
  end if;
  if v_sessao.loja_id is null then
    raise exception 'Selecione a loja antes de finalizar a sessao.';
  end if;
  if v_sessao.status <> 'aberta' then
    raise exception 'Sessao de bipagem nao esta aberta.';
  end if;

  v_codigo_lote := coalesce(
    nullif(btrim(v_sessao.codigo_lote), ''),
    public.gerar_codigo_lote(v_finalizada_em)
  );

  for v_codigo_lock in
    select distinct item.codigo_normalizado
    from public.itens_sessao_bipagem as item
    where item.sessao_id = p_sessao_id
      and item.user_id = v_account_id
      and item.status = 'pendente'
    order by item.codigo_normalizado
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'bipagem-codigo:' || v_account_id::text || ':' || v_codigo_lock,
        0
      )
    );
  end loop;

  perform public.recalcular_duplicados_sessao_bipagem(p_sessao_id);

  select count(*) into v_total_pacotes
  from public.itens_sessao_bipagem
  where sessao_id = p_sessao_id
    and user_id = v_account_id
    and status = 'pendente';

  if v_total_pacotes = 0 then
    raise exception 'Nenhum pacote na sessao.';
  end if;

  select codigo_normalizado into v_codigo_duplicado
  from public.itens_sessao_bipagem
  where sessao_id = p_sessao_id
    and user_id = v_account_id
    and status = 'pendente'
  group by codigo_normalizado
  having count(*) > 1
  limit 1;

  if v_codigo_duplicado is not null then
    raise exception 'Existem pacotes duplicados nesta sessao: %.',
      v_codigo_duplicado;
  end if;

  select item.codigo_normalizado into v_codigo_existente
  from public.itens_sessao_bipagem as item
  join public.pacotes as pacote
    on public.normalizar_codigo_pacote(pacote.codigo) = item.codigo_normalizado
   and pacote.status <> 'cancelado'
   and pacote.user_id = v_account_id
  where item.sessao_id = p_sessao_id
    and item.user_id = v_account_id
    and item.status = 'pendente'
  limit 1;

  if v_codigo_existente is not null then
    raise exception 'Pacote % ja foi bipado nesta conta.', v_codigo_existente;
  end if;

  insert into public.pacotes (
    user_id,
    codigo,
    loja_id,
    marketplace_id,
    transportadora_id,
    sessao_id,
    tipo_operacao,
    melhor_envio,
    status,
    bipado_em,
    finalizado_em,
    bipado_por,
    finalizado_por
  )
  select
    v_account_id,
    item.codigo_normalizado,
    v_sessao.loja_id,
    v_sessao.marketplace_id,
    v_sessao.transportadora_id,
    p_sessao_id,
    v_sessao.tipo_operacao,
    v_sessao.melhor_envio,
    'finalizado',
    item.criado_em,
    v_finalizada_em,
    coalesce(item.bipado_por, v_actor_id),
    v_actor_id
  from public.itens_sessao_bipagem as item
  where item.sessao_id = p_sessao_id
    and item.user_id = v_account_id
    and item.status = 'pendente'
  order by item.ordem asc;

  insert into public.movimentacoes (
    user_id,
    pacote_id,
    loja_id,
    sessao_id,
    tipo_movimentacao,
    descricao,
    criada_em,
    realizado_por
  )
  select
    v_account_id,
    pacote.id,
    pacote.loja_id,
    pacote.sessao_id,
    'Bipagem',
    'Pacote ' || pacote.codigo || ' bipado.',
    pacote.bipado_em,
    coalesce(pacote.bipado_por, v_actor_id)
  from public.pacotes as pacote
  where pacote.sessao_id = p_sessao_id
    and pacote.user_id = v_account_id
    and pacote.loja_id = v_sessao.loja_id
    and not exists (
      select 1
      from public.movimentacoes as movimentacao
      where movimentacao.pacote_id = pacote.id
        and movimentacao.user_id = v_account_id
        and movimentacao.loja_id = v_sessao.loja_id
        and movimentacao.tipo_movimentacao = 'Bipagem'
    );

  update public.itens_sessao_bipagem
  set status = 'finalizado',
      duplicado = false
  where sessao_id = p_sessao_id
    and user_id = v_account_id
    and status = 'pendente';

  update public.sessoes_bipagem
  set status = 'finalizada',
      finalizada_em = v_finalizada_em,
      finalizada_por = v_actor_id,
      codigo_lote = v_codigo_lote
  where id = p_sessao_id
    and user_id = v_account_id
    and iniciada_por = v_actor_id
    and loja_id = v_sessao.loja_id;

  return jsonb_build_object(
    'sessao_id', p_sessao_id,
    'codigo_lote', v_codigo_lote,
    'total_pacotes', v_total_pacotes,
    'finalizada_em', v_finalizada_em,
    'finalizada_por', v_actor_id
  );
end;
$$;

create or replace function public.cancelar_sessao_bipagem(p_sessao_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_id uuid := public.exigir_usuario_autenticado();
  v_loja_id uuid;
  v_cancelada_em timestamptz := now();
begin
  if not public.current_account_can_write() then
    raise exception 'Perfil somente leitura nao pode cancelar bipagem.';
  end if;

  update public.sessoes_bipagem
  set iniciada_por = v_actor_id
  where id = p_sessao_id
    and user_id = v_account_id
    and iniciada_por is null
    and status = 'aberta'
    and v_account_id = v_actor_id;

  select loja_id into v_loja_id
  from public.sessoes_bipagem
  where id = p_sessao_id
    and user_id = v_account_id
    and iniciada_por = v_actor_id
    and status = 'aberta'
  for update;

  if not found or v_loja_id is null then
    raise exception 'Sessao de bipagem aberta deste operador nao encontrada.';
  end if;

  update public.sessoes_bipagem
  set status = 'cancelada',
      finalizada_em = null,
      cancelada_em = v_cancelada_em,
      cancelada_por = v_actor_id
  where id = p_sessao_id
    and user_id = v_account_id
    and iniciada_por = v_actor_id
    and loja_id = v_loja_id
    and status = 'aberta';

  update public.itens_sessao_bipagem
  set status = 'descartado',
      duplicado = false
  where sessao_id = p_sessao_id
    and user_id = v_account_id
    and status = 'pendente';

  return jsonb_build_object(
    'sessao_id', p_sessao_id,
    'cancelada_em', v_cancelada_em,
    'cancelada_por', v_actor_id
  );
end;
$$;

-- As três buscas ainda comparavam user_id com auth.uid() nas migrations mais
-- recentes. Agora consultam a conta compartilhada selecionada.
create or replace function public.buscar_pacote_ativo_global_normalizado(
  p_codigo text
)
returns table(id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select pacote.id
  from public.pacotes as pacote
  where pacote.user_id = (select public.current_account_id())
    and public.normalizar_codigo_pacote(pacote.codigo) =
      public.normalizar_codigo_pacote(p_codigo)
    and pacote.status <> 'cancelado'
  order by pacote.bipado_em, pacote.id
  limit 1;
$$;

create or replace function public.buscar_pacote_ativo_normalizado(
  p_codigo text,
  p_loja_id uuid
)
returns table(id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select pacote.id
  from public.pacotes as pacote
  where pacote.user_id = (select public.current_account_id())
    and public.normalizar_codigo_pacote(pacote.codigo) =
      public.normalizar_codigo_pacote(p_codigo)
    and pacote.status <> 'cancelado'
  order by
    (pacote.loja_id = p_loja_id) desc nulls last,
    pacote.bipado_em,
    pacote.id
  limit 1;
$$;

create or replace function public.buscar_pacotes_finalizados_normalizado(
  p_codigo text
)
returns table(id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select pacote.id
  from public.pacotes as pacote
  where pacote.user_id = (select public.current_account_id())
    and pacote.status = 'finalizado'
    and public.normalizar_codigo_pacote(pacote.codigo) =
      public.normalizar_codigo_pacote(p_codigo)
  order by pacote.loja_id, pacote.id;
$$;

create or replace function public.listar_pacotes_paginados_v2(
  p_data_inicio date default null,
  p_data_fim date default null,
  p_loja_ids uuid[] default null,
  p_marketplace_ids uuid[] default null,
  p_transportadora_ids uuid[] default null,
  p_incluir_sem_transportadora boolean default true,
  p_filtrar_transportadora boolean default false,
  p_melhor_envio boolean default null,
  p_tipo_operacao text default null,
  p_busca text default null,
  p_codigo_lote text default null,
  p_cursor_bipado_em timestamptz default null,
  p_cursor_id uuid default null,
  p_snapshot_at timestamptz default null,
  p_incluir_metricas boolean default true,
  p_limit integer default 100
)
returns table(
  id uuid,
  codigo text,
  loja_id uuid,
  loja_nome text,
  marketplace_id uuid,
  marketplace_nome text,
  transportadora_id uuid,
  transportadora_nome text,
  sessao_id uuid,
  codigo_lote text,
  tipo_operacao text,
  melhor_envio boolean,
  status text,
  bipado_em timestamptz,
  total_count bigint,
  melhor_envio_count bigint,
  pendentes_count bigint,
  has_more boolean,
  snapshot_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select
      coalesce(p_snapshot_at, statement_timestamp()) as snapshot_at,
      least(greatest(coalesce(p_limit, 100), 1), 100) as page_limit
  ), filtrados as not materialized (
    select
      pacote.id,
      pacote.codigo,
      pacote.loja_id,
      loja.nome as loja_nome,
      pacote.marketplace_id,
      marketplace.nome as marketplace_nome,
      pacote.transportadora_id,
      transportadora.nome as transportadora_nome,
      pacote.sessao_id,
      sessao.codigo_lote,
      pacote.tipo_operacao::text as tipo_operacao,
      pacote.melhor_envio,
      pacote.status::text as status,
      pacote.bipado_em
    from public.pacotes as pacote
    join public.lojas as loja
      on loja.id = pacote.loja_id
     and loja.user_id = pacote.user_id
    join public.marketplaces as marketplace
      on marketplace.id = pacote.marketplace_id
     and marketplace.user_id = pacote.user_id
    left join public.transportadoras as transportadora
      on transportadora.id = pacote.transportadora_id
     and transportadora.user_id = pacote.user_id
    left join public.sessoes_bipagem as sessao
      on sessao.id = pacote.sessao_id
     and sessao.user_id = pacote.user_id
    where pacote.user_id = (select public.current_account_id())
      and pacote.status <> 'cancelado'
      and coalesce(pacote.finalizado_em, pacote.bipado_em) <= (
        select limite.snapshot_at from limites as limite
      )
      and (
        p_data_inicio is null
        or pacote.bipado_em >= (
          p_data_inicio::timestamp at time zone 'America/Sao_Paulo'
        )
      )
      and (
        p_data_fim is null
        or pacote.bipado_em < (
          (p_data_fim + 1)::timestamp at time zone 'America/Sao_Paulo'
        )
      )
      and (p_loja_ids is null or pacote.loja_id = any(p_loja_ids))
      and (
        p_marketplace_ids is null
        or pacote.marketplace_id = any(p_marketplace_ids)
      )
      and (
        not coalesce(p_filtrar_transportadora, false)
        or pacote.transportadora_id = any(
          coalesce(p_transportadora_ids, array[]::uuid[])
        )
        or (
          coalesce(p_incluir_sem_transportadora, false)
          and pacote.transportadora_id is null
        )
      )
      and (
        p_melhor_envio is null
        or pacote.melhor_envio = p_melhor_envio
      )
      and (
        p_tipo_operacao is null
        or pacote.tipo_operacao::text = p_tipo_operacao
      )
      and (
        nullif(public.normalizar_codigo_pacote(p_busca), '') is null
        or position(
          public.normalizar_codigo_pacote(p_busca)
          in public.normalizar_codigo_pacote(pacote.codigo)
        ) > 0
      )
      and (
        nullif(public.normalizar_codigo_pacote(p_codigo_lote), '') is null
        or position(
          public.normalizar_codigo_pacote(p_codigo_lote)
          in public.normalizar_codigo_pacote(
            coalesce(sessao.codigo_lote, sessao.id::text, '')
          )
        ) > 0
      )
  ), metricas as (
    select
      case when p_incluir_metricas then count(*) else null::bigint end
        as total_count,
      case when p_incluir_metricas then
        count(*) filter (where filtrado.melhor_envio)
      else null::bigint end as melhor_envio_count,
      case when p_incluir_metricas then
        count(*) filter (where filtrado.status <> 'finalizado')
      else null::bigint end as pendentes_count
    from filtrados as filtrado
    where p_incluir_metricas
  ), candidatos as materialized (
    select filtrado.*
    from filtrados as filtrado
    where (
      p_cursor_bipado_em is null
      and p_cursor_id is null
    ) or (
      p_cursor_bipado_em is not null
      and p_cursor_id is not null
      and (filtrado.bipado_em, filtrado.id) < (p_cursor_bipado_em, p_cursor_id)
    )
    order by filtrado.bipado_em desc, filtrado.id desc
    limit (select limite.page_limit + 1 from limites as limite)
  ), pagina as (
    select candidato.*
    from candidatos as candidato
    order by candidato.bipado_em desc, candidato.id desc
    limit (select limite.page_limit from limites as limite)
  )
  select
    pagina.id,
    pagina.codigo,
    pagina.loja_id,
    pagina.loja_nome,
    pagina.marketplace_id,
    pagina.marketplace_nome,
    pagina.transportadora_id,
    pagina.transportadora_nome,
    pagina.sessao_id,
    pagina.codigo_lote,
    pagina.tipo_operacao,
    pagina.melhor_envio,
    pagina.status,
    pagina.bipado_em,
    metrica.total_count,
    metrica.melhor_envio_count,
    metrica.pendentes_count,
    (select count(*) from candidatos) > limite.page_limit as has_more,
    limite.snapshot_at
  from pagina
  cross join metricas as metrica
  cross join limites as limite
  order by pagina.bipado_em desc, pagina.id desc;
$$;

create or replace function public.obter_dashboard_despacho(
  p_data_inicio date default null,
  p_data_fim date default null,
  p_loja_ids uuid[] default null,
  p_marketplace_ids uuid[] default null,
  p_transportadora_ids uuid[] default null,
  p_incluir_sem_transportadora boolean default true,
  p_filtrar_transportadora boolean default false,
  p_melhor_envio boolean default null,
  p_tipo_operacao text default null,
  p_busca text default null,
  p_codigo_lote text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with filtrados as materialized (
    select
      pacote.id,
      pacote.codigo,
      pacote.loja_id,
      loja.nome as loja_nome,
      pacote.marketplace_id,
      marketplace.nome as marketplace_nome,
      pacote.transportadora_id,
      transportadora.nome as transportadora_nome,
      pacote.sessao_id,
      sessao.codigo_lote,
      pacote.tipo_operacao::text as tipo_operacao,
      pacote.melhor_envio,
      pacote.status::text as status,
      pacote.bipado_em
    from public.pacotes as pacote
    join public.lojas as loja
      on loja.id = pacote.loja_id
     and loja.user_id = pacote.user_id
    join public.marketplaces as marketplace
      on marketplace.id = pacote.marketplace_id
     and marketplace.user_id = pacote.user_id
    left join public.transportadoras as transportadora
      on transportadora.id = pacote.transportadora_id
     and transportadora.user_id = pacote.user_id
    left join public.sessoes_bipagem as sessao
      on sessao.id = pacote.sessao_id
     and sessao.user_id = pacote.user_id
    where pacote.user_id = (select public.current_account_id())
      and pacote.status <> 'cancelado'
      and (
        p_data_inicio is null
        or pacote.bipado_em >= (
          p_data_inicio::timestamp at time zone 'America/Sao_Paulo'
        )
      )
      and (
        p_data_fim is null
        or pacote.bipado_em < (
          (p_data_fim + 1)::timestamp at time zone 'America/Sao_Paulo'
        )
      )
      and (p_loja_ids is null or pacote.loja_id = any(p_loja_ids))
      and (
        p_marketplace_ids is null
        or pacote.marketplace_id = any(p_marketplace_ids)
      )
      and (
        not coalesce(p_filtrar_transportadora, false)
        or pacote.transportadora_id = any(
          coalesce(p_transportadora_ids, array[]::uuid[])
        )
        or (
          coalesce(p_incluir_sem_transportadora, false)
          and pacote.transportadora_id is null
        )
      )
      and (
        p_melhor_envio is null
        or pacote.melhor_envio = p_melhor_envio
      )
      and (
        p_tipo_operacao is null
        or pacote.tipo_operacao::text = p_tipo_operacao
      )
      and (
        nullif(public.normalizar_codigo_pacote(p_busca), '') is null
        or position(
          public.normalizar_codigo_pacote(p_busca)
          in public.normalizar_codigo_pacote(pacote.codigo)
        ) > 0
      )
      and (
        nullif(public.normalizar_codigo_pacote(p_codigo_lote), '') is null
        or position(
          public.normalizar_codigo_pacote(p_codigo_lote)
          in public.normalizar_codigo_pacote(
            coalesce(sessao.codigo_lote, sessao.id::text, '')
          )
        ) > 0
      )
  ), resumo_lojas as (
    select
      concat_ws(
        '|',
        marketplace_id::text,
        tipo_operacao,
        melhor_envio::text,
        coalesce(case when melhor_envio then transportadora_id::text end, '')
      ) as grupo_id,
      loja_id,
      loja_nome,
      count(*) as pacotes
    from filtrados
    group by
      marketplace_id,
      tipo_operacao,
      melhor_envio,
      case when melhor_envio then transportadora_id::text end,
      loja_id,
      loja_nome
  ), resumo_grupos as (
    select
      concat_ws(
        '|',
        marketplace_id::text,
        tipo_operacao,
        melhor_envio::text,
        coalesce(case when melhor_envio then transportadora_id::text end, '')
      ) as grupo_id,
      marketplace_nome,
      tipo_operacao,
      melhor_envio,
      case when melhor_envio then transportadora_nome end as transportadora_nome,
      count(*) as pacotes
    from filtrados
    group by
      marketplace_id,
      marketplace_nome,
      tipo_operacao,
      melhor_envio,
      case when melhor_envio then transportadora_id::text end,
      case when melhor_envio then transportadora_nome end
    order by
      marketplace_nome,
      tipo_operacao,
      melhor_envio,
      transportadora_nome nulls first
  )
  select jsonb_build_object(
    'metricas', jsonb_build_object(
      'total', (select count(*) from filtrados),
      'melhorEnvio', (select count(*) from filtrados where melhor_envio),
      'semTransportadora', (
        select count(*) from filtrados where transportadora_id is null
      ),
      'pending', (
        select count(*) from filtrados where status <> 'finalizado'
      ),
      'coletas', (select count(*) from filtrados where tipo_operacao = 'coleta'),
      'postagens', (
        select count(*) from filtrados where tipo_operacao = 'postagem'
      )
    ),
    'lojas', coalesce((
      select jsonb_agg(
        jsonb_build_object('loja_id', loja_id, 'pacotes', pacotes)
        order by loja_id
      )
      from (
        select loja_id, count(*) as pacotes
        from filtrados
        group by loja_id
      ) as totais_loja
    ), '[]'::jsonb),
    'resumo', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', grupo.grupo_id,
          'marketplace', grupo.marketplace_nome,
          'tipo_operacao', grupo.tipo_operacao,
          'melhor_envio', grupo.melhor_envio,
          'transportadora', grupo.transportadora_nome,
          'packages', grupo.pacotes,
          'lojas', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'loja_id', por_loja.loja_id,
                'loja_nome', por_loja.loja_nome,
                'packages', por_loja.pacotes
              )
              order by por_loja.pacotes desc, por_loja.loja_nome
            )
            from resumo_lojas as por_loja
            where por_loja.grupo_id = grupo.grupo_id
          ), '[]'::jsonb)
        )
        order by
          grupo.marketplace_nome,
          grupo.tipo_operacao,
          grupo.melhor_envio,
          grupo.transportadora_nome nulls first
      )
      from resumo_grupos as grupo
    ), '[]'::jsonb),
    'recentes', coalesce((
      select jsonb_agg(
        to_jsonb(recente)
        order by recente.bipado_em desc, recente.id desc
      )
      from (
        select
          filtrado.id,
          filtrado.codigo,
          filtrado.loja_id,
          filtrado.loja_nome,
          filtrado.marketplace_id,
          filtrado.marketplace_nome,
          filtrado.transportadora_id,
          filtrado.transportadora_nome,
          filtrado.sessao_id,
          filtrado.codigo_lote,
          filtrado.tipo_operacao,
          filtrado.melhor_envio,
          filtrado.status,
          filtrado.bipado_em
        from filtrados as filtrado
        order by filtrado.bipado_em desc, filtrado.id desc
        limit 6
      ) as recente
    ), '[]'::jsonb),
    'movement_count', (
      select count(*)
      from (
        select movimentacao.id
        from public.movimentacoes as movimentacao
        where movimentacao.user_id = (select public.current_account_id())
          and exists (
            select 1
            from filtrados as filtrado
            where filtrado.id = movimentacao.pacote_id
          )
        order by movimentacao.criada_em desc
        limit 5
      ) as movimentos_recentes
    )
  );
$$;

-- As tabelas de administração não aceitam mutações diretas do navegador.
revoke all on table public.accounts from public, anon, authenticated;
revoke all on table public.account_members from public, anon, authenticated;
revoke all on table public.audit_events from public, anon, authenticated;
grant select on table public.accounts to authenticated;
grant select on table public.account_members to authenticated;
grant select on table public.audit_events to authenticated;

revoke all on function public.bootstrap_new_auth_user_account()
  from public, anon, authenticated;
revoke all on function public.stamp_operational_actor()
  from public, anon, authenticated;
revoke all on function public.append_operational_audit_event()
  from public, anon, authenticated;

revoke all on function public.current_account_id()
  from public, anon, authenticated;
revoke all on function public.current_account_can_write()
  from public, anon, authenticated;
revoke all on function public.current_account_is_admin()
  from public, anon, authenticated;
revoke all on function public.get_current_account_context()
  from public, anon, authenticated;
revoke all on function public.add_account_member(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.update_account_member(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.list_team_admin_snapshot()
  from public, anon, authenticated;

grant execute on function public.current_account_id()
  to authenticated;
grant execute on function public.current_account_can_write()
  to authenticated;
grant execute on function public.current_account_is_admin()
  to authenticated;
grant execute on function public.get_current_account_context()
  to authenticated;
grant execute on function public.add_account_member(uuid, text, text, text)
  to authenticated;
grant execute on function public.update_account_member(uuid, text, text, text)
  to authenticated;
grant execute on function public.list_team_admin_snapshot()
  to authenticated;

revoke execute on function public.exigir_usuario_autenticado()
  from public, anon;
revoke execute on function public.obter_sessao_bipagem_aberta(uuid)
  from public, anon;
revoke execute on function public.iniciar_sessao_bipagem_independente(
  uuid, uuid, uuid, text, boolean, uuid, timestamptz
) from public, anon;
revoke execute on function public.recalcular_duplicados_sessao_bipagem(uuid)
  from public, anon;
revoke execute on function public.adicionar_item_sessao_bipagem_v3(text, uuid)
  from public, anon;
revoke execute on function public.adicionar_item_sessao_bipagem_v2(text, uuid)
  from public, anon;
revoke execute on function public.adicionar_item_sessao_bipagem(text, uuid)
  from public, anon;
revoke execute on function public.remover_item_sessao_bipagem_v2(uuid, text)
  from public, anon;
revoke execute on function public.remover_item_sessao_bipagem(uuid, text)
  from public, anon;
revoke execute on function public.finalizar_sessao_bipagem(uuid)
  from public, anon;
revoke execute on function public.cancelar_sessao_bipagem(uuid)
  from public, anon;
revoke execute on function public.buscar_pacote_ativo_global_normalizado(text)
  from public, anon;
revoke execute on function public.buscar_pacote_ativo_normalizado(text, uuid)
  from public, anon;
revoke execute on function public.buscar_pacotes_finalizados_normalizado(text)
  from public, anon;
revoke all on function public.listar_pacotes_paginados_v2(
  date, date, uuid[], uuid[], uuid[], boolean, boolean, boolean, text, text,
  text, timestamptz, uuid, timestamptz, boolean, integer
) from public, anon;
revoke all on function public.obter_dashboard_despacho(
  date, date, uuid[], uuid[], uuid[], boolean, boolean, boolean, text, text,
  text
) from public, anon;

grant execute on function public.exigir_usuario_autenticado()
  to authenticated;
grant execute on function public.obter_sessao_bipagem_aberta(uuid)
  to authenticated;
grant execute on function public.iniciar_sessao_bipagem_independente(
  uuid, uuid, uuid, text, boolean, uuid, timestamptz
) to authenticated;
grant execute on function public.recalcular_duplicados_sessao_bipagem(uuid)
  to authenticated;
grant execute on function public.adicionar_item_sessao_bipagem_v3(text, uuid)
  to authenticated;
grant execute on function public.adicionar_item_sessao_bipagem_v2(text, uuid)
  to authenticated;
grant execute on function public.adicionar_item_sessao_bipagem(text, uuid)
  to authenticated;
grant execute on function public.remover_item_sessao_bipagem_v2(uuid, text)
  to authenticated;
grant execute on function public.remover_item_sessao_bipagem(uuid, text)
  to authenticated;
grant execute on function public.finalizar_sessao_bipagem(uuid)
  to authenticated;
grant execute on function public.cancelar_sessao_bipagem(uuid)
  to authenticated;
grant execute on function public.buscar_pacote_ativo_global_normalizado(text)
  to authenticated;
grant execute on function public.buscar_pacote_ativo_normalizado(text, uuid)
  to authenticated;
grant execute on function public.buscar_pacotes_finalizados_normalizado(text)
  to authenticated;
grant execute on function public.listar_pacotes_paginados_v2(
  date, date, uuid[], uuid[], uuid[], boolean, boolean, boolean, text, text,
  text, timestamptz, uuid, timestamptz, boolean, integer
) to authenticated;
grant execute on function public.obter_dashboard_despacho(
  date, date, uuid[], uuid[], uuid[], boolean, boolean, boolean, text, text,
  text
) to authenticated;

comment on table public.accounts is
  'Conta compartilhada. IDs legados permanecem iguais ao antigo user_id.';
comment on table public.account_members is
  'Usuários e perfis que compartilham uma conta operacional.';
comment on table public.audit_events is
  'Histórico append-only de ações relevantes, gravado na mesma transação.';
comment on column public.sessoes_bipagem.user_id is
  'Identificador legado da conta compartilhada; nao representa o operador.';
comment on column public.sessoes_bipagem.iniciada_por is
  'Usuário autenticado que iniciou o lote.';

commit;
