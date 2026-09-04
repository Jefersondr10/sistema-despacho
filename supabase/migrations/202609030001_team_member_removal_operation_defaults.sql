-- Remocao segura de membros e padrao de operacao por loja + marketplace.
--
-- A migration e aditiva: usuarios removidos permanecem no Auth e na tabela de
-- membros para preservar autoria/auditoria, mas deixam de ter uma conta ativa.
-- As regras de operacao apenas preenchem Coleta/Postagem na interface; os lotes
-- e historicos existentes nao sao alterados.

begin;

alter table public.account_members
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references auth.users(id) on delete set null;

alter table public.account_members
  drop constraint if exists account_members_status_check;
alter table public.account_members
  add constraint account_members_status_check check (
    status in ('active', 'suspended', 'removed')
  );

create or replace function public.stamp_account_member_removal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'removed' and old.status is distinct from new.status then
    new.removed_at := clock_timestamp();
    new.removed_by := auth.uid();
  elsif new.status <> 'removed' then
    new.removed_at := null;
    new.removed_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists stamp_account_member_removal
  on public.account_members;
create trigger stamp_account_member_removal
  before update of status on public.account_members
  for each row execute function public.stamp_account_member_removal();

create or replace function public.remove_account_member_v2(
  p_user_id uuid
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
  v_member public.account_members%rowtype;
  v_permissions text[] := '{}'::text[];
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
    raise exception 'O membro nao pode remover o proprio acesso.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
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

  if not found or v_member.status = 'removed' then
    raise exception 'Membro nao encontrado nesta conta.';
  end if;
  if v_member.role = 'owner' then
    raise exception 'O proprietario da conta e imutavel.';
  end if;

  v_permissions := case
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

  if (
    v_member.role = 'admin'
    or 'team.manage' = any(v_permissions)
  ) and v_actor_role <> 'owner' then
    raise exception 'Somente o proprietario pode remover responsaveis pelos acessos.';
  end if;

  if exists (
    select 1
    from public.sessoes_bipagem as sessao
    where sessao.user_id = v_account_id
      and sessao.iniciada_por = p_user_id
      and sessao.status = 'aberta'
  ) then
    raise exception 'Finalize ou cancele o lote aberto antes de remover este usuario.';
  end if;

  update public.account_members
  set status = 'removed',
      selected = false,
      permissions_initialized = true,
      updated_at = clock_timestamp()
  where account_id = v_account_id
    and user_id = p_user_id
  returning * into v_member;

  delete from public.account_member_permissions as permission
  where permission.account_id = v_account_id
    and permission.user_id = p_user_id;

  insert into public.audit_events (
    account_id, actor_user_id, action, entity_table, entity_id, details
  ) values (
    v_account_id,
    v_actor_id,
    'team.member_removed',
    'account_members',
    v_member.user_id,
    jsonb_build_object(
      'description', format(
        'Acesso de %s removido da equipe',
        coalesce(v_member.display_name, v_member.email)
      ),
      'display_name', coalesce(v_member.display_name, v_member.email),
      'email', v_member.email,
      'before_role', v_member.role,
      'before_permissions', v_permissions
    )
  );

  return jsonb_build_object(
    'account_id', v_member.account_id,
    'user_id', v_member.user_id,
    'status', v_member.status,
    'display_name', coalesce(v_member.display_name, v_member.email),
    'email', v_member.email
  );
end;
$$;

-- Mantem membros removidos fora da administracao cotidiana, mas conserva a
-- linha para que nomes e autoria continuem disponiveis no historico.
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
        and member.status <> 'removed'
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

create unique index if not exists lojas_user_id_id_uidx
  on public.lojas (user_id, id);
create unique index if not exists marketplaces_user_id_id_uidx
  on public.marketplaces (user_id, id);

create table if not exists public.regras_operacao_bipagem (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_account_id()
    references public.accounts(id) on delete cascade,
  loja_id uuid not null,
  marketplace_id uuid not null,
  tipo_operacao text not null,
  criado_por uuid references auth.users(id) on delete set null,
  atualizado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint regras_operacao_bipagem_tipo_check check (
    tipo_operacao in ('coleta', 'postagem')
  ),
  constraint regras_operacao_bipagem_conta_loja_fkey
    foreign key (user_id, loja_id)
    references public.lojas(user_id, id)
    on delete cascade,
  constraint regras_operacao_bipagem_conta_marketplace_fkey
    foreign key (user_id, marketplace_id)
    references public.marketplaces(user_id, id)
    on delete cascade,
  constraint regras_operacao_bipagem_combinacao_key
    unique (user_id, loja_id, marketplace_id)
);

create index if not exists regras_operacao_bipagem_conta_idx
  on public.regras_operacao_bipagem (user_id, updated_at desc, id);

create or replace function public.salvar_regra_operacao_bipagem(
  p_loja_id uuid,
  p_marketplace_id uuid,
  p_tipo_operacao text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_id uuid := public.current_account_id();
  v_tipo_operacao text := lower(btrim(coalesce(p_tipo_operacao, '')));
  v_rule public.regras_operacao_bipagem%rowtype;
begin
  if v_actor_id is null or v_account_id is null then
    raise exception 'Usuario autenticado e conta ativa obrigatorios.';
  end if;
  if not public.current_account_has_permission('cadastros.manage') then
    raise exception 'Permissao para gerenciar cadastros obrigatoria.';
  end if;
  if p_loja_id is null or p_marketplace_id is null then
    raise exception 'Loja e marketplace sao obrigatorios.';
  end if;
  if v_tipo_operacao not in ('coleta', 'postagem') then
    raise exception 'Tipo de operacao invalido.';
  end if;
  if not exists (
    select 1 from public.lojas as loja
    where loja.user_id = v_account_id
      and loja.id = p_loja_id
      and loja.ativo
  ) then
    raise exception 'Loja ativa nao encontrada nesta conta.';
  end if;
  if not exists (
    select 1 from public.marketplaces as marketplace
    where marketplace.user_id = v_account_id
      and marketplace.id = p_marketplace_id
      and marketplace.ativo
  ) then
    raise exception 'Marketplace ativo nao encontrado nesta conta.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'operation-default:' || v_account_id::text || ':' ||
      p_loja_id::text || ':' || p_marketplace_id::text,
    0
  ));

  insert into public.regras_operacao_bipagem (
    user_id,
    loja_id,
    marketplace_id,
    tipo_operacao,
    criado_por,
    atualizado_por
  ) values (
    v_account_id,
    p_loja_id,
    p_marketplace_id,
    v_tipo_operacao,
    v_actor_id,
    v_actor_id
  )
  on conflict (user_id, loja_id, marketplace_id) do update
  set tipo_operacao = excluded.tipo_operacao,
      atualizado_por = v_actor_id,
      updated_at = clock_timestamp()
  returning * into v_rule;

  return to_jsonb(v_rule);
end;
$$;

create or replace function public.excluir_regra_operacao_bipagem(
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := public.current_account_id();
  v_deleted_count integer := 0;
begin
  if auth.uid() is null or v_account_id is null then
    raise exception 'Usuario autenticado e conta ativa obrigatorios.';
  end if;
  if not public.current_account_has_permission('cadastros.manage') then
    raise exception 'Permissao para gerenciar cadastros obrigatoria.';
  end if;
  if p_id is null then
    raise exception 'Regra obrigatoria.';
  end if;

  delete from public.regras_operacao_bipagem as rule
  where rule.id = p_id
    and rule.user_id = v_account_id;

  get diagnostics v_deleted_count = row_count;
  if v_deleted_count <> 1 then
    raise exception 'Regra nao encontrada nesta conta.';
  end if;

  return true;
end;
$$;

drop trigger if exists append_operational_audit_event
  on public.regras_operacao_bipagem;
create trigger append_operational_audit_event
  after insert or update or delete on public.regras_operacao_bipagem
  for each row execute function public.append_operational_audit_event();

alter table public.regras_operacao_bipagem enable row level security;

drop policy if exists regras_operacao_bipagem_select_permissions
  on public.regras_operacao_bipagem;
create policy regras_operacao_bipagem_select_permissions
  on public.regras_operacao_bipagem for select to authenticated
  using (
    user_id = (select public.current_account_id())
    and (
      (select public.current_account_has_permission('bipagem.manage'))
      or (select public.current_account_has_permission('cadastros.view'))
    )
  );

revoke all on table public.regras_operacao_bipagem
  from public, anon, authenticated;
grant select on table public.regras_operacao_bipagem to authenticated;

revoke all on function public.stamp_account_member_removal()
  from public, anon, authenticated;
revoke all on function public.remove_account_member_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.remove_account_member_v2(uuid)
  to authenticated;
revoke all on function public.salvar_regra_operacao_bipagem(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.salvar_regra_operacao_bipagem(uuid, uuid, text)
  to authenticated;
revoke all on function public.excluir_regra_operacao_bipagem(uuid)
  from public, anon, authenticated;
grant execute on function public.excluir_regra_operacao_bipagem(uuid)
  to authenticated;

comment on function public.remove_account_member_v2(uuid) is
  'Revoga o acesso do membro sem apagar Auth, autoria ou historico.';
comment on table public.regras_operacao_bipagem is
  'Padrao de Coleta/Postagem por combinacao de loja e marketplace.';

commit;
