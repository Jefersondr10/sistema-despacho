-- Corrige uma diferenca do GoTrue self-hosted: durante a criacao de um
-- usuario de equipe, auth.users pode ser inserido antes de team_account_id ser
-- persistido em app_metadata. O trigger legado interpreta esse INSERT como um
-- cadastro comum e cria uma conta propria vazia. Quando o metadata chega, esta
-- migration remove somente essa conta bootstrap comprovadamente intacta.

begin;

-- Remove a primeira versao desta correcao, caso a migration tenha sido
-- executada manualmente durante uma homologacao anterior.
drop trigger if exists remove_pristine_team_bootstrap_account
  on public.account_members;
drop function if exists public.remove_pristine_team_bootstrap_account();

create or replace function public.cleanup_pristine_team_bootstrap_account(
  p_user_id uuid,
  p_team_account_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_count integer := 0;
begin
  if p_user_id is null
    or p_team_account_id is null
    or p_user_id = p_team_account_id
  then
    return false;
  end if;

  -- Serializa reconciliacoes do mesmo usuario, inclusive em reaplicacoes e no
  -- backfill abaixo.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('team-bootstrap:' || p_user_id::text, 0)
  );

  -- Mantem o metadata estavel ate o DELETE terminar. No trigger AFTER UPDATE
  -- esta e a propria linha que acabou de receber team_account_id.
  perform 1
  from auth.users as invited_user
  where invited_user.id = p_user_id
  for update;

  if not found then
    return false;
  end if;

  -- account_members tambem precisa ficar estavel: outro membro nao pode entrar
  -- na conta bootstrap entre a verificacao de conta vazia e sua remocao.
  lock table
    public.accounts,
    public.account_members,
    public.account_member_permissions
  in share row exclusive mode;

  -- As tabelas operacionais usam user_id como identificador logico da conta.
  -- SHARE bloqueia escritas concorrentes durante a ultima verificacao, sem
  -- apagar ou reescrever qualquer dado operacional.
  lock table
    public.audit_events,
    public.lojas,
    public.marketplaces,
    public.transportadoras,
    public.sessoes_bipagem,
    public.itens_sessao_bipagem,
    public.pacotes,
    public.movimentacoes,
    public.pacotes_cancelados,
    public.relatorio_destinatarios,
    public.relatorio_envios
  in share mode;

  -- Todas as guardas estao diretamente no DELETE. Assim, mesmo se a funcao
  -- for chamada em outro caminho no futuro, nenhuma verificacao preliminar
  -- separada pode sofrer uma janela TOCTOU.
  delete from public.accounts as bootstrap_account
  where bootstrap_account.id = p_user_id
    and bootstrap_account.owner_user_id = p_user_id
    and p_user_id <> p_team_account_id
    and exists (
      select 1
      from auth.users as invited_user
      where invited_user.id = p_user_id
        and nullif(
          btrim(coalesce(
            invited_user.raw_app_meta_data->>'team_account_id',
            ''
          )),
          ''
        ) = p_team_account_id::text
    )
    and exists (
      select 1
      from public.accounts as intended_account
      where intended_account.id = p_team_account_id
        and intended_account.active
    )
    and (
      select count(*)
      from public.account_members as bootstrap_member
      where bootstrap_member.account_id = p_user_id
    ) = 1
    and exists (
      select 1
      from public.account_members as bootstrap_owner
      where bootstrap_owner.account_id = p_user_id
        and bootstrap_owner.user_id = p_user_id
        and bootstrap_owner.role = 'owner'
    )
    and not exists (
      select 1 from public.audit_events
      where account_id = p_user_id
    )
    and not exists (
      select 1 from public.lojas
      where user_id = p_user_id
    )
    and not exists (
      select 1 from public.marketplaces
      where user_id = p_user_id
    )
    and not exists (
      select 1 from public.transportadoras
      where user_id = p_user_id
    )
    and not exists (
      select 1 from public.sessoes_bipagem
      where user_id = p_user_id
    )
    and not exists (
      select 1 from public.itens_sessao_bipagem
      where user_id = p_user_id
    )
    and not exists (
      select 1 from public.pacotes
      where user_id = p_user_id
    )
    and not exists (
      select 1 from public.movimentacoes
      where user_id = p_user_id
    )
    and not exists (
      select 1 from public.pacotes_cancelados
      where user_id = p_user_id
    )
    and not exists (
      select 1 from public.relatorio_destinatarios
      where user_id = p_user_id
    )
    and not exists (
      select 1 from public.relatorio_envios
      where user_id = p_user_id
    );

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count = 1;
end;
$$;

revoke all on function public.cleanup_pristine_team_bootstrap_account(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.cleanup_team_bootstrap_after_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_team_account_id_text text := nullif(
    btrim(coalesce(old.raw_app_meta_data->>'team_account_id', '')),
    ''
  );
  v_new_team_account_id_text text := nullif(
    btrim(coalesce(new.raw_app_meta_data->>'team_account_id', '')),
    ''
  );
  v_team_account_id uuid;
begin
  -- Alteracoes de outros campos do metadata nao precisam bloquear tabelas.
  if v_new_team_account_id_text is null
    or v_new_team_account_id_text is not distinct from v_old_team_account_id_text
  then
    return new;
  end if;

  begin
    v_team_account_id := v_new_team_account_id_text::uuid;
  exception when invalid_text_representation then
    -- Metadata invalido nunca justifica apagar uma conta.
    return new;
  end;

  perform public.cleanup_pristine_team_bootstrap_account(
    new.id,
    v_team_account_id
  );

  return new;
end;
$$;

revoke all on function public.cleanup_team_bootstrap_after_auth_metadata()
  from public, anon, authenticated;

drop trigger if exists cleanup_team_bootstrap_after_auth_metadata
  on auth.users;
create trigger cleanup_team_bootstrap_after_auth_metadata
  after update of raw_app_meta_data on auth.users
  for each row execute function public.cleanup_team_bootstrap_after_auth_metadata();

-- Reconcilia convites anteriores. O backfill so chama a funcao quando ja
-- existe um vinculo real com a conta indicada no metadata. status/selected nao
-- fazem parte da prova: um membro suspenso ainda pertence a essa conta.
do $$
declare
  v_candidate record;
  v_team_account_id uuid;
begin
  for v_candidate in
    select
      invited_user.id as user_id,
      nullif(
        btrim(coalesce(
          invited_user.raw_app_meta_data->>'team_account_id',
          ''
        )),
        ''
      ) as team_account_id_text
    from auth.users as invited_user
    where nullif(
      btrim(coalesce(
        invited_user.raw_app_meta_data->>'team_account_id',
        ''
      )),
      ''
    ) is not null
  loop
    begin
      v_team_account_id := v_candidate.team_account_id_text::uuid;
    exception when invalid_text_representation then
      continue;
    end;

    if v_team_account_id = v_candidate.user_id
      or not exists (
        select 1
        from public.account_members as intended_membership
        where intended_membership.user_id = v_candidate.user_id
          and intended_membership.account_id = v_team_account_id
          and intended_membership.account_id <> v_candidate.user_id
      )
    then
      continue;
    end if;

    perform public.cleanup_pristine_team_bootstrap_account(
      v_candidate.user_id,
      v_team_account_id
    );
  end loop;
end;
$$;

comment on function public.cleanup_pristine_team_bootstrap_account(uuid, uuid)
  is 'Remove apenas conta propria vazia criada antes do team_account_id do convite ser persistido.';

commit;
