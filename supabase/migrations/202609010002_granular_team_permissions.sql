-- Permissoes granulares por membro da equipe.
--
-- Esta migration e aditiva. Perfis e RPCs da primeira versao permanecem
-- disponiveis para clientes antigos, enquanto os clientes novos passam a usar
-- grants explicitos. Nenhum dado operacional e reescrito.

begin;

alter table public.account_members
  add column if not exists permissions_initialized boolean not null default false;

create table if not exists public.account_member_permissions (
  account_id uuid not null,
  user_id uuid not null,
  permission text not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (account_id, user_id, permission),
  constraint account_member_permissions_member_fkey
    foreign key (account_id, user_id)
    references public.account_members(account_id, user_id)
    on delete cascade,
  constraint account_member_permissions_permission_check check (
    permission in (
      'dashboard.view',
      'bipagem.manage',
      'pacotes.view',
      'cancelamentos.view',
      'cancelamentos.manage',
      'relatorios.view',
      'relatorios.send',
      'cadastros.view',
      'cadastros.manage',
      'team.manage'
    )
  )
);

create index if not exists account_member_permissions_user_idx
  on public.account_member_permissions (user_id, account_id, permission);

create or replace function public.normalize_account_permissions(
  p_permissions text[]
)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_permissions text[];
  v_permission text;
  v_allowed constant text[] := array[
    'dashboard.view',
    'bipagem.manage',
    'pacotes.view',
    'cancelamentos.view',
    'cancelamentos.manage',
    'relatorios.view',
    'relatorios.send',
    'cadastros.view',
    'cadastros.manage',
    'team.manage'
  ]::text[];
begin
  select coalesce(array_agg(permission order by permission), '{}'::text[])
    into v_permissions
  from (
    select distinct lower(btrim(raw_permission)) as permission
    from unnest(coalesce(p_permissions, '{}'::text[])) as raw(raw_permission)
  ) as normalized;

  foreach v_permission in array v_permissions
  loop
    if coalesce(v_permission, '') = ''
      or not (v_permission = any(v_allowed)) then
      raise exception 'Permissao de equipe invalida: %.',
        coalesce(v_permission, '<vazia>');
    end if;
  end loop;

  if 'cancelamentos.manage' = any(v_permissions) then
    v_permissions := v_permissions || array[
      'bipagem.manage',
      'cancelamentos.view',
      'pacotes.view'
    ]::text[];
  end if;
  if 'relatorios.send' = any(v_permissions) then
    v_permissions := v_permissions || array['relatorios.view']::text[];
  end if;
  if 'cadastros.manage' = any(v_permissions) then
    v_permissions := v_permissions || array['cadastros.view']::text[];
  end if;

  select coalesce(array_agg(permission order by permission), '{}'::text[])
    into v_permissions
  from (
    select distinct permission
    from unnest(v_permissions) as expanded(permission)
  ) as unique_permissions;

  return v_permissions;
end;
$$;

create or replace function public.legacy_account_role_permissions(p_role text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_role, '')))
    when 'owner' then array[
      'dashboard.view', 'bipagem.manage', 'pacotes.view',
      'cancelamentos.view', 'cancelamentos.manage', 'relatorios.view',
      'relatorios.send', 'cadastros.view', 'cadastros.manage', 'team.manage'
    ]::text[]
    when 'admin' then array[
      'dashboard.view', 'bipagem.manage', 'pacotes.view',
      'cancelamentos.view', 'cancelamentos.manage', 'relatorios.view',
      'relatorios.send', 'cadastros.view', 'cadastros.manage', 'team.manage'
    ]::text[]
    when 'supervisor' then array[
      'dashboard.view', 'bipagem.manage', 'pacotes.view',
      'cancelamentos.view', 'cancelamentos.manage', 'relatorios.view',
      'relatorios.send', 'cadastros.view', 'cadastros.manage'
    ]::text[]
    when 'operator' then array[
      'dashboard.view', 'bipagem.manage', 'pacotes.view',
      'cancelamentos.view', 'cancelamentos.manage', 'relatorios.view',
      'relatorios.send', 'cadastros.view', 'cadastros.manage'
    ]::text[]
    when 'viewer' then array[
      'dashboard.view', 'pacotes.view', 'cancelamentos.view',
      'relatorios.view', 'cadastros.view'
    ]::text[]
    else '{}'::text[]
  end;
$$;

-- Preserva exatamente os acessos que cada perfil possuia antes desta versao.
insert into public.account_member_permissions (
  account_id, user_id, permission, granted_by
)
select
  member.account_id,
  member.user_id,
  permission.permission,
  account.owner_user_id
from public.account_members as member
join public.accounts as account on account.id = member.account_id
cross join lateral unnest(
  public.legacy_account_role_permissions(member.role)
) as permission(permission)
where not member.permissions_initialized
  and member.role not in ('owner', 'admin')
  and not member.permissions_initialized
on conflict (account_id, user_id, permission) do nothing;

update public.account_members
set permissions_initialized = true,
    updated_at = case
      when permissions_initialized then updated_at
      else clock_timestamp()
    end
where not permissions_initialized;

-- Clientes v1 que ainda criarem ou trocarem um perfil recebem o preset
-- legado. Atualizar apenas nome/status sem trocar role preserva os checkboxes.
create or replace function public.sync_legacy_account_member_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permissions text[];
  v_granted_by uuid;
begin
  if tg_op = 'INSERT' then
    if new.permissions_initialized then
      return new;
    end if;
  else
    if old.role is not distinct from new.role then
      return new;
    end if;

    if auth.uid() is not null
      and auth.uid() is distinct from (
        select account.owner_user_id
        from public.accounts as account
        where account.id = new.account_id
      )
      and exists (
        select 1
        from public.account_member_permissions as permission
        where permission.account_id = old.account_id
          and permission.user_id = old.user_id
          and permission.permission = 'team.manage'
      )
    then
      raise exception 'Somente o proprietario pode remover gerenciamento da equipe.';
    end if;
  end if;

  v_permissions := public.legacy_account_role_permissions(new.role);
  select account.owner_user_id
    into v_granted_by
  from public.accounts as account
  where account.id = new.account_id;

  delete from public.account_member_permissions as permission
  where permission.account_id = new.account_id
    and permission.user_id = new.user_id;

  insert into public.account_member_permissions (
    account_id, user_id, permission, granted_by
  )
  select new.account_id, new.user_id, permission, v_granted_by
  from unnest(v_permissions) as granted(permission)
  on conflict (account_id, user_id, permission) do nothing;

  if tg_op = 'INSERT' then
    update public.account_members
    set permissions_initialized = true,
        updated_at = clock_timestamp()
    where account_id = new.account_id
      and user_id = new.user_id
      and not permissions_initialized;
  else
    new.permissions_initialized := true;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_legacy_account_member_permissions_insert
  on public.account_members;
create trigger sync_legacy_account_member_permissions_insert
  after insert on public.account_members
  for each row execute function public.sync_legacy_account_member_permissions();

drop trigger if exists sync_legacy_account_member_permissions_role
  on public.account_members;
create trigger sync_legacy_account_member_permissions_role
  before update of role on public.account_members
  for each row execute function public.sync_legacy_account_member_permissions();

-- Fecha a janela de concorrencia entre o primeiro backfill e os triggers.
insert into public.account_member_permissions (
  account_id, user_id, permission, granted_by
)
select
  member.account_id,
  member.user_id,
  permission.permission,
  account.owner_user_id
from public.account_members as member
join public.accounts as account on account.id = member.account_id
cross join lateral unnest(
  public.legacy_account_role_permissions(member.role)
) as permission(permission)
where not member.permissions_initialized
  and member.role not in ('owner', 'admin')
on conflict (account_id, user_id, permission) do nothing;

update public.account_members
set permissions_initialized = true,
    updated_at = clock_timestamp()
where not permissions_initialized;

create or replace function public.get_current_account_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when member.role in ('owner', 'admin')
      then public.legacy_account_role_permissions(member.role)
    when member.permissions_initialized then coalesce((
      select array_agg(permission.permission order by permission.permission)
      from public.account_member_permissions as permission
      where permission.account_id = member.account_id
        and permission.user_id = member.user_id
    ), '{}'::text[])
    else public.legacy_account_role_permissions(member.role)
  end
  from public.account_members as member
  join public.accounts as account
    on account.id = member.account_id
   and account.active
  where member.user_id = (select auth.uid())
    and member.account_id = public.current_account_id()
    and member.status = 'active'
  limit 1;
$$;

create or replace function public.current_account_has_permission(
  p_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_permission text := lower(btrim(coalesce(p_permission, '')));
  v_allowed constant text[] := array[
    'dashboard.view',
    'bipagem.manage',
    'pacotes.view',
    'cancelamentos.view',
    'cancelamentos.manage',
    'relatorios.view',
    'relatorios.send',
    'cadastros.view',
    'cadastros.manage',
    'team.manage'
  ]::text[];
begin
  if not (v_permission = any(v_allowed)) then
    return false;
  end if;

  return v_permission = any(
    coalesce(public.get_current_account_permissions(), '{}'::text[])
  );
end;
$$;

-- Compatibilidade das RPCs de bipagem v1: este booleano passa a representar
-- o ciclo completo da bipagem, e nao qualquer escrita da aplicacao.
create or replace function public.current_account_can_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_account_has_permission('bipagem.manage');
$$;

-- "Administrador" continua sendo a classe privilegiada owner/admin. Um
-- membro com team.manage usa as RPCs v2, mas nao pode escalar pelos endpoints
-- v1 que confiam nesta funcao.
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

-- A assinatura e o retorno permanecem identicos para clientes em rollout.
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
      or public.current_account_has_permission('team.manage')
  from public.account_members as member
  join public.accounts as account
    on account.id = member.account_id
   and account.active
  where member.user_id = (select auth.uid())
    and member.account_id = public.current_account_id()
    and member.status = 'active'
  limit 1;
$$;

create or replace function public.add_account_member_v2(
  p_user_id uuid,
  p_email text,
  p_display_name text default null,
  p_permissions text[] default '{}'::text[],
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
  v_permissions text[] := public.normalize_account_permissions(p_permissions);
  v_actor_role text;
  v_target public.account_members%rowtype;
  v_target_user auth.users%rowtype;
  v_existing_member boolean;
  v_existing_role text;
  v_existing_permissions text[] := '{}'::text[];
begin
  if v_actor_id is null or v_account_id is null then
    raise exception 'Usuario autenticado e conta ativa obrigatorios.';
  end if;
  if not (
    public.current_account_is_admin()
    or public.current_account_has_permission('team.manage')
  ) then
    raise exception 'Permissao para gerenciar equipe obrigatoria.';
  end if;
  if v_role not in ('admin', 'supervisor', 'operator', 'viewer') then
    raise exception 'Perfil interno invalido para novo usuario.';
  end if;

  select member.role
    into v_actor_role
  from public.account_members as member
  where member.account_id = v_account_id
    and member.user_id = v_actor_id
    and member.status = 'active';

  if v_role = 'admin' and v_actor_role <> 'owner' then
    raise exception 'Somente o proprietario pode cadastrar administradores.';
  end if;
  if 'team.manage' = any(v_permissions) and v_actor_role <> 'owner' then
    raise exception 'Somente o proprietario pode conceder gerenciamento da equipe.';
  end if;
  if char_length(v_email) < 3 or char_length(v_email) > 320
    or position('@' in v_email) <= 1 then
    raise exception 'E-mail invalido.';
  end if;
  if p_user_id is null then
    raise exception 'Usuario obrigatorio.';
  end if;
  if p_user_id = v_actor_id then
    raise exception 'O membro nao pode alterar o proprio acesso.';
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
    raise exception 'Usuario ainda nao existe no login. Crie o login primeiro.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'team-member-operations:' || v_account_id::text || ':' || p_user_id::text,
    0
  ));

  select exists (
    select 1
    from public.account_members as member
    where member.account_id = v_account_id
      and member.user_id = v_target_user.id
  ) into v_existing_member;

  if v_existing_member then
    select
      member.role,
      case
        when member.role in ('owner', 'admin')
          then public.legacy_account_role_permissions(member.role)
        when member.permissions_initialized then coalesce((
          select array_agg(permission.permission order by permission.permission)
          from public.account_member_permissions as permission
          where permission.account_id = member.account_id
            and permission.user_id = member.user_id
        ), '{}'::text[])
        else public.legacy_account_role_permissions(member.role)
      end
      into v_existing_role, v_existing_permissions
    from public.account_members as member
    where member.account_id = v_account_id
      and member.user_id = v_target_user.id;

    if v_existing_role = 'owner' then
      raise exception 'O proprietario da conta e imutavel.';
    end if;
    if v_existing_role = 'admin' and v_actor_role <> 'owner' then
      raise exception 'Somente o proprietario pode gerenciar administradores.';
    end if;
    if (
      ('team.manage' = any(v_existing_permissions))
        is distinct from ('team.manage' = any(v_permissions))
    ) and v_actor_role <> 'owner' then
      raise exception 'Somente o proprietario pode conceder ou remover gerenciamento da equipe.';
    end if;
    if 'bipagem.manage' = any(v_existing_permissions)
      and not ('bipagem.manage' = any(v_permissions))
      and exists (
        select 1
        from public.sessoes_bipagem as sessao
        where sessao.user_id = v_account_id
          and sessao.iniciada_por = p_user_id
          and sessao.status = 'aberta'
      )
    then
      raise exception 'Finalize ou cancele o lote aberto antes de retirar a permissao de bipagem.';
    end if;
  end if;

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
    invited_by, joined_at, permissions_initialized, created_at, updated_at
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
    true,
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
      permissions_initialized = true,
      updated_at = excluded.updated_at
  returning * into v_target;

  if v_target.role = 'owner' then
    raise exception 'O proprietario da conta e imutavel.';
  end if;

  delete from public.account_member_permissions as permission
  where permission.account_id = v_account_id
    and permission.user_id = v_target.user_id;

  if v_target.role <> 'admin' then
    insert into public.account_member_permissions (
      account_id, user_id, permission, granted_by
    )
    select v_account_id, v_target.user_id, permission, v_actor_id
    from unnest(v_permissions) as granted(permission);
  end if;

  insert into public.audit_events (
    account_id, actor_user_id, action, entity_table, entity_id, details
  ) values (
    v_account_id,
    v_actor_id,
    'team.member_added_v2',
    'account_members',
    v_target.user_id,
    jsonb_build_object(
      'role', v_target.role,
      'email', v_target.email,
      'permissions', case
        when v_target.role = 'admin'
          then public.legacy_account_role_permissions('admin')
        else v_permissions
      end
    )
  );

  return jsonb_build_object(
    'account_id', v_target.account_id,
    'user_id', v_target.user_id,
    'role', v_target.role,
    'status', v_target.status,
    'display_name', coalesce(v_target.display_name, v_target.email),
    'email', v_target.email,
    'permissions', case
      when v_target.role = 'admin'
        then public.legacy_account_role_permissions('admin')
      else v_permissions
    end,
    'permissions_initialized', true
  );
end;
$$;

create or replace function public.update_account_member_v2(
  p_user_id uuid,
  p_display_name text default null,
  p_status text default null,
  p_permissions text[] default null,
  p_role text default null
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
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_role text := nullif(lower(btrim(coalesce(p_role, ''))), '');
  v_member public.account_members%rowtype;
  v_next_status text;
  v_next_role text;
  v_previous_permissions text[];
  v_permissions text[];
begin
  if v_actor_id is null or v_account_id is null then
    raise exception 'Usuario autenticado e conta ativa obrigatorios.';
  end if;
  if not (
    public.current_account_is_admin()
    or public.current_account_has_permission('team.manage')
  ) then
    raise exception 'Permissao para gerenciar equipe obrigatoria.';
  end if;
  if p_user_id is null then
    raise exception 'Usuario obrigatorio.';
  end if;
  if p_user_id = v_actor_id then
    raise exception 'O membro nao pode alterar o proprio acesso.';
  end if;
  if v_status is not null and v_status not in ('active', 'suspended') then
    raise exception 'Status de membro invalido.';
  end if;
  if v_role is not null
    and v_role not in ('admin', 'supervisor', 'operator', 'viewer') then
    raise exception 'Perfil interno invalido.';
  end if;
  if v_display_name is not null and char_length(v_display_name) > 120 then
    raise exception 'Nome deve ter no maximo 120 caracteres.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'team-member-operations:' || v_account_id::text || ':' || p_user_id::text,
    0
  ));

  select actor.role
    into v_actor_role
  from public.account_members as actor
  where actor.account_id = v_account_id
    and actor.user_id = v_actor_id
    and actor.status = 'active';

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
    raise exception 'O proprietario da conta e imutavel.';
  end if;
  if (v_member.role = 'admin' or v_role = 'admin')
    and v_actor_role <> 'owner' then
    raise exception 'Somente o proprietario pode gerenciar administradores.';
  end if;

  v_previous_permissions := case
    when v_member.role = 'admin'
      then public.legacy_account_role_permissions('admin')
    when v_member.permissions_initialized then coalesce((
      select array_agg(permission.permission order by permission.permission)
      from public.account_member_permissions as permission
      where permission.account_id = v_account_id
        and permission.user_id = p_user_id
    ), '{}'::text[])
    else public.legacy_account_role_permissions(v_member.role)
  end;

  v_permissions := case
    when p_permissions is null then v_previous_permissions
    else public.normalize_account_permissions(p_permissions)
  end;
  v_next_status := coalesce(v_status, v_member.status);
  v_next_role := coalesce(v_role, v_member.role);

  if (
    ('team.manage' = any(v_previous_permissions))
      is distinct from ('team.manage' = any(v_permissions))
  ) and v_actor_role <> 'owner' then
    raise exception 'Somente o proprietario pode conceder ou remover gerenciamento da equipe.';
  end if;

  if v_next_status = 'active'
    and v_next_role not in ('owner', 'admin')
    and not ('bipagem.manage' = any(v_permissions))
    and 'bipagem.manage' = any(v_previous_permissions)
    and exists (
      select 1
      from public.sessoes_bipagem as sessao
      where sessao.user_id = v_account_id
        and sessao.iniciada_por = p_user_id
        and sessao.status = 'aberta'
    )
  then
    raise exception 'Finalize ou cancele o lote aberto antes de retirar a permissao de bipagem.';
  end if;

  update public.account_members
  set display_name = coalesce(v_display_name, display_name),
      role = v_next_role,
      status = v_next_status,
      selected = case
        when v_next_status = 'suspended' then false
        else selected
      end,
      permissions_initialized = true,
      updated_at = clock_timestamp()
  where account_id = v_account_id
    and user_id = p_user_id
  returning * into v_member;

  delete from public.account_member_permissions as permission
  where permission.account_id = v_account_id
    and permission.user_id = p_user_id;

  if v_member.role not in ('owner', 'admin') then
    insert into public.account_member_permissions (
      account_id, user_id, permission, granted_by
    )
    select v_account_id, p_user_id, permission, v_actor_id
    from unnest(v_permissions) as granted(permission);
  end if;

  insert into public.audit_events (
    account_id, actor_user_id, action, entity_table, entity_id, details
  ) values (
    v_account_id,
    v_actor_id,
    'team.member_permissions_updated',
    'account_members',
    v_member.user_id,
    jsonb_build_object(
      'before_permissions', v_previous_permissions,
      'after_permissions', case
        when v_member.role = 'admin'
          then public.legacy_account_role_permissions('admin')
        else v_permissions
      end,
      'role', v_member.role,
      'status', v_member.status
    )
  );

  return jsonb_build_object(
    'account_id', v_member.account_id,
    'user_id', v_member.user_id,
    'role', v_member.role,
    'status', v_member.status,
    'display_name', coalesce(v_member.display_name, v_member.email),
    'email', v_member.email,
    'permissions', case
      when v_member.role = 'admin'
        then public.legacy_account_role_permissions('admin')
      else v_permissions
    end,
    'permissions_initialized', true
  );
end;
$$;

create or replace function public.list_team_admin_snapshot_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := public.current_account_id();
  v_available_permissions constant text[] := array[
    'dashboard.view',
    'bipagem.manage',
    'pacotes.view',
    'cancelamentos.view',
    'cancelamentos.manage',
    'relatorios.view',
    'relatorios.send',
    'cadastros.view',
    'cadastros.manage',
    'team.manage'
  ]::text[];
begin
  if auth.uid() is null or v_account_id is null then
    raise exception 'Usuario autenticado e conta ativa obrigatorios.';
  end if;
  if not (
    public.current_account_is_admin()
    or public.current_account_has_permission('team.manage')
  ) then
    raise exception 'Permissao para gerenciar equipe obrigatoria.';
  end if;

  return jsonb_build_object(
    'context', (
      select to_jsonb(context_row) || jsonb_build_object(
        'permissions', public.get_current_account_permissions()
      )
      from public.get_current_account_context() as context_row
    ),
    'available_permissions', v_available_permissions,
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', member.user_id,
          'display_name', coalesce(member.display_name, member.email),
          'email', member.email,
          'role', member.role,
          'status', member.status,
          'permissions_initialized', member.permissions_initialized,
          'permissions', case
            when member.role in ('owner', 'admin')
              then public.legacy_account_role_permissions(member.role)
            when member.permissions_initialized then coalesce((
              select array_agg(permission.permission order by permission.permission)
              from public.account_member_permissions as permission
              where permission.account_id = member.account_id
                and permission.user_id = member.user_id
            ), '{}'::text[])
            else public.legacy_account_role_permissions(member.role)
          end,
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
            else 2
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

-- Defesa adicional para os caminhos diretos ainda mantidos por clientes v1.
-- A RLS separa contas; este trigger diferencia a acao dentro de tabelas que
-- servem simultaneamente a bipagem e ao cancelamento.
create or replace function public.enforce_operational_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_account_id uuid := nullif(v_row->>'user_id', '')::uuid;
  v_permission text;
begin
  -- Operacoes administrativas com service_role nao carregam auth.uid() e
  -- continuam disponiveis. anon/authenticated sem usuario nao possuem grants.
  if v_actor_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if v_account_id is distinct from public.current_account_id() then
    raise exception 'Registro fora da conta ativa.';
  end if;

  if tg_table_name in ('lojas', 'marketplaces', 'transportadoras', 'relatorio_destinatarios') then
    v_permission := 'cadastros.manage';
  elsif tg_table_name = 'relatorio_envios' then
    v_permission := 'relatorios.send';
  elsif tg_table_name in ('sessoes_bipagem', 'itens_sessao_bipagem') then
    v_permission := 'bipagem.manage';
  elsif tg_table_name = 'pacotes_cancelados' then
    v_permission := 'cancelamentos.manage';
  elsif tg_table_name = 'pacotes' then
    if tg_op = 'UPDATE'
      and v_old->>'status' is distinct from v_row->>'status'
      and v_row->>'status' = 'cancelado' then
      v_permission := 'cancelamentos.manage';
    else
      v_permission := 'bipagem.manage';
    end if;
  elsif tg_table_name = 'movimentacoes' then
    if lower(btrim(coalesce(v_row->>'tipo_movimentacao', ''))) = 'cancelamento' then
      v_permission := 'cancelamentos.manage';
    else
      v_permission := 'bipagem.manage';
    end if;
  else
    raise exception 'Tabela operacional sem regra de permissao.';
  end if;

  if not public.current_account_has_permission(v_permission) then
    raise exception 'Permissao % obrigatoria para esta operacao.', v_permission;
  end if;

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
      'drop trigger if exists enforce_operational_permission on public.%I',
      v_table
    );
    execute format(
      'create trigger enforce_operational_permission before insert or update or delete on public.%I for each row execute function public.enforce_operational_permission()',
      v_table
    );
  end loop;
end;
$$;

-- Reaplica RLS por capacidade. A identidade da conta continua em user_id.
do $$
declare
  v_table text;
  v_policy record;
begin
  foreach v_table in array array[
    'lojas', 'marketplaces', 'transportadoras', 'relatorio_destinatarios',
    'relatorio_envios', 'sessoes_bipagem', 'itens_sessao_bipagem',
    'pacotes', 'movimentacoes', 'pacotes_cancelados'
  ]
  loop
    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = v_table
    loop
      execute format('drop policy if exists %I on public.%I', v_policy.policyname, v_table);
    end loop;
    execute format('alter table public.%I enable row level security', v_table);
  end loop;
end;
$$;

-- Catalogos sao referencias para os demais modulos; gerencia-los exige a
-- permissao propria, enquanto a leitura acompanha o modulo concedido.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['lojas', 'marketplaces', 'transportadoras']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select public.current_account_id()) and ((select public.current_account_has_permission(''cadastros.view'')) or (select public.current_account_has_permission(''bipagem.manage'')) or (select public.current_account_has_permission(''dashboard.view'')) or (select public.current_account_has_permission(''pacotes.view'')) or (select public.current_account_has_permission(''cancelamentos.view'')) or (select public.current_account_has_permission(''relatorios.view''))))',
      v_table || '_select_permissions', v_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select public.current_account_id()) and (select public.current_account_has_permission(''cadastros.manage'')))',
      v_table || '_insert_permissions', v_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select public.current_account_id()) and (select public.current_account_has_permission(''cadastros.manage''))) with check (user_id = (select public.current_account_id()) and (select public.current_account_has_permission(''cadastros.manage'')))',
      v_table || '_update_permissions', v_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select public.current_account_id()) and (select public.current_account_has_permission(''cadastros.manage'')))',
      v_table || '_delete_permissions', v_table
    );
  end loop;
end;
$$;

create policy relatorio_destinatarios_select_permissions
  on public.relatorio_destinatarios for select to authenticated
  using (
    user_id = (select public.current_account_id())
    and (
      (select public.current_account_has_permission('cadastros.view'))
      or (select public.current_account_has_permission('relatorios.view'))
    )
  );
create policy relatorio_destinatarios_insert_permissions
  on public.relatorio_destinatarios for insert to authenticated
  with check (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('cadastros.manage'))
  );
create policy relatorio_destinatarios_update_permissions
  on public.relatorio_destinatarios for update to authenticated
  using (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('cadastros.manage'))
  )
  with check (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('cadastros.manage'))
  );
create policy relatorio_destinatarios_delete_permissions
  on public.relatorio_destinatarios for delete to authenticated
  using (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('cadastros.manage'))
  );

create policy relatorio_envios_select_permissions
  on public.relatorio_envios for select to authenticated
  using (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('relatorios.view'))
  );
create policy relatorio_envios_insert_permissions
  on public.relatorio_envios for insert to authenticated
  with check (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('relatorios.send'))
  );

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'sessoes_bipagem', 'itens_sessao_bipagem', 'pacotes', 'movimentacoes'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select public.current_account_id()) and ((select public.current_account_has_permission(''bipagem.manage'')) or (select public.current_account_has_permission(''dashboard.view'')) or (select public.current_account_has_permission(''pacotes.view'')) or (select public.current_account_has_permission(''cancelamentos.view'')) or (select public.current_account_has_permission(''relatorios.view''))))',
      v_table || '_select_permissions', v_table
    );
  end loop;
end;
$$;

create policy sessoes_bipagem_insert_permissions
  on public.sessoes_bipagem for insert to authenticated
  with check (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('bipagem.manage'))
  );
create policy sessoes_bipagem_update_permissions
  on public.sessoes_bipagem for update to authenticated
  using (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('bipagem.manage'))
  )
  with check (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('bipagem.manage'))
  );
create policy sessoes_bipagem_delete_permissions
  on public.sessoes_bipagem for delete to authenticated
  using (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('bipagem.manage'))
  );

create policy itens_sessao_bipagem_insert_permissions
  on public.itens_sessao_bipagem for insert to authenticated
  with check (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('bipagem.manage'))
  );
create policy itens_sessao_bipagem_update_permissions
  on public.itens_sessao_bipagem for update to authenticated
  using (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('bipagem.manage'))
  )
  with check (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('bipagem.manage'))
  );
create policy itens_sessao_bipagem_delete_permissions
  on public.itens_sessao_bipagem for delete to authenticated
  using (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('bipagem.manage'))
  );

-- Pacotes e movimentacoes atendem bipagem e cancelamento. A policy permite os
-- dois modulos e o trigger acima diferencia a transicao executada.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['pacotes', 'movimentacoes']
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select public.current_account_id()) and ((select public.current_account_has_permission(''bipagem.manage'')) or (select public.current_account_has_permission(''cancelamentos.manage''))))',
      v_table || '_insert_permissions', v_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select public.current_account_id()) and ((select public.current_account_has_permission(''bipagem.manage'')) or (select public.current_account_has_permission(''cancelamentos.manage'')))) with check (user_id = (select public.current_account_id()) and ((select public.current_account_has_permission(''bipagem.manage'')) or (select public.current_account_has_permission(''cancelamentos.manage''))))',
      v_table || '_update_permissions', v_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select public.current_account_id()) and ((select public.current_account_has_permission(''bipagem.manage'')) or (select public.current_account_has_permission(''cancelamentos.manage''))))',
      v_table || '_delete_permissions', v_table
    );
  end loop;
end;
$$;

create policy pacotes_cancelados_select_permissions
  on public.pacotes_cancelados for select to authenticated
  using (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('cancelamentos.view'))
  );
create policy pacotes_cancelados_insert_permissions
  on public.pacotes_cancelados for insert to authenticated
  with check (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('cancelamentos.manage'))
  );
create policy pacotes_cancelados_update_permissions
  on public.pacotes_cancelados for update to authenticated
  using (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('cancelamentos.manage'))
  )
  with check (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('cancelamentos.manage'))
  );
create policy pacotes_cancelados_delete_permissions
  on public.pacotes_cancelados for delete to authenticated
  using (
    user_id = (select public.current_account_id())
    and (select public.current_account_has_permission('cancelamentos.manage'))
  );

alter table public.account_member_permissions enable row level security;

drop policy if exists account_member_permissions_select_self
  on public.account_member_permissions;
create policy account_member_permissions_select_self
  on public.account_member_permissions for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.account_member_permissions
  from public, anon, authenticated;
grant select on table public.account_member_permissions to authenticated;

revoke all on function public.normalize_account_permissions(text[])
  from public, anon, authenticated;
revoke all on function public.legacy_account_role_permissions(text)
  from public, anon, authenticated;
revoke all on function public.sync_legacy_account_member_permissions()
  from public, anon, authenticated;
revoke all on function public.enforce_operational_permission()
  from public, anon, authenticated;

revoke all on function public.get_current_account_permissions()
  from public, anon, authenticated;
revoke all on function public.current_account_has_permission(text)
  from public, anon, authenticated;
revoke all on function public.add_account_member_v2(
  uuid, text, text, text[], text
) from public, anon, authenticated;
revoke all on function public.update_account_member_v2(
  uuid, text, text, text[], text
) from public, anon, authenticated;
revoke all on function public.list_team_admin_snapshot_v2()
  from public, anon, authenticated;

grant execute on function public.get_current_account_permissions()
  to authenticated;
grant execute on function public.current_account_has_permission(text)
  to authenticated;
grant execute on function public.add_account_member_v2(
  uuid, text, text, text[], text
) to authenticated;
grant execute on function public.update_account_member_v2(
  uuid, text, text, text[], text
) to authenticated;
grant execute on function public.list_team_admin_snapshot_v2()
  to authenticated;

comment on table public.account_member_permissions is
  'Permissoes explicitas dos membros; owner/admin recebem acesso total implicitamente.';
comment on column public.account_members.permissions_initialized is
  'Distingue acesso personalizado vazio de membro legado ainda nao reconciliado.';

commit;
