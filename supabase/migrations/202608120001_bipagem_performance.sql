-- Melhora os caminhos quentes da bipagem sem alterar dados existentes.
--
-- Contratos das RPCs:
--   buscar_pacote_ativo_normalizado -> zero ou uma linha contendo somente id
--   adicionar_item_sessao_bipagem_v2 -> somente a linha inserida
--   remover_item_sessao_bipagem_v2   -> somente a linha removida/atualizada
--
-- As RPCs sem o sufixo v2 permanecem intactas para que a migration possa ser
-- aplicada antes do deploy do frontend sem quebrar clientes ainda abertos.

begin;

-- A busca de duplicidade usa o mesmo predicado e a mesma expressao do indice
-- funcional idx_pacotes_user_loja_codigo_ativos criado na migracao anterior.
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
  where pacote.user_id = (select auth.uid())
    and pacote.loja_id = p_loja_id
    and public.normalizar_codigo_pacote(pacote.codigo) =
      public.normalizar_codigo_pacote(p_codigo)
    and pacote.status <> 'cancelado'
  limit 1;
$$;

-- Localiza rapidamente os itens que podem mudar de estado de duplicidade.
create index if not exists idx_itens_bipagem_user_sessao_codigo_pendentes
  on public.itens_sessao_bipagem (user_id, sessao_id, codigo_normalizado)
  where status = 'pendente';

-- Mantem pequenas as consultas de abertura/ordenacao de uma sessao ativa.
create index if not exists idx_itens_bipagem_user_sessao_ordem_pendentes
  on public.itens_sessao_bipagem (user_id, sessao_id, ordem desc)
  where status = 'pendente';

create index if not exists idx_sessoes_bipagem_user_abertas_recentes
  on public.sessoes_bipagem (user_id, iniciada_em desc)
  where status = 'aberta';

-- Alinha os historicos globais com user_id + ordenacao usados pelo frontend.
create index if not exists idx_pacotes_user_bipado_em
  on public.pacotes (user_id, bipado_em desc);

create index if not exists idx_sessoes_bipagem_user_finalizadas_recentes
  on public.sessoes_bipagem (
    user_id,
    finalizada_em desc nulls last,
    iniciada_em desc
  );

create index if not exists idx_movimentacoes_user_criada_em
  on public.movimentacoes (user_id, criada_em desc);

create index if not exists idx_pacotes_cancelados_user_cancelado_em
  on public.pacotes_cancelados (user_id, cancelado_em desc);

-- A verificacao completa continua sendo usada ao finalizar uma sessao, mas
-- agora calcula os grupos uma vez e grava apenas flags realmente alteradas.
create or replace function public.recalcular_duplicados_sessao_bipagem(
  p_sessao_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := public.exigir_usuario_autenticado();
begin
  if not exists (
    select 1
    from public.sessoes_bipagem
    where id = p_sessao_id
      and user_id = v_user_id
  ) then
    raise exception 'Sessao de bipagem nao encontrada.';
  end if;

  with codigos_duplicados as (
    select item.codigo_normalizado
    from public.itens_sessao_bipagem as item
    where item.user_id = v_user_id
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
    where item.user_id = v_user_id
      and item.sessao_id = p_sessao_id
      and item.status = 'pendente'
  )
  update public.itens_sessao_bipagem as item
  set duplicado = flags.duplicado
  from flags_desejadas as flags
  where item.id = flags.id
    and item.user_id = v_user_id
    and item.duplicado is distinct from flags.duplicado;
end;
$$;

-- O bloqueio da sessao serializa apenas as bipagens do mesmo lote. Assim a
-- proxima ordem e a deteccao da primeira repeticao permanecem consistentes,
-- inclusive quando o leitor envia duas requisicoes quase simultaneas.
create or replace function public.adicionar_item_sessao_bipagem_v2(
  p_codigo text,
  p_sessao_id uuid
)
returns setof public.itens_sessao_bipagem
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := public.exigir_usuario_autenticado();
  v_sessao_status text;
  v_loja_id uuid;
  v_codigo_normalizado text;
  v_ordem integer;
  v_duplicado boolean;
  v_item public.itens_sessao_bipagem%rowtype;
begin
  select sessao.status, sessao.loja_id
    into v_sessao_status, v_loja_id
  from public.sessoes_bipagem as sessao
  where sessao.id = p_sessao_id
    and sessao.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Sessao de bipagem nao encontrada.';
  end if;
  if v_loja_id is null then
    raise exception 'Selecione a loja antes de bipar.';
  end if;
  if v_sessao_status <> 'aberta' then
    raise exception 'Sessao de bipagem nao esta aberta.';
  end if;

  v_codigo_normalizado := public.normalizar_codigo_pacote(p_codigo);
  if v_codigo_normalizado = '' then
    raise exception 'codigo obrigatorio.';
  end if;

  select coalesce((
    select item.ordem
    from public.itens_sessao_bipagem as item
    where item.user_id = v_user_id
      and item.sessao_id = p_sessao_id
      and item.ordem is not null
    order by item.ordem desc nulls last
    limit 1
  ), 0) + 1
  into v_ordem;

  select exists (
    select 1
    from public.itens_sessao_bipagem as item
    where item.user_id = v_user_id
      and item.sessao_id = p_sessao_id
      and item.codigo_normalizado = v_codigo_normalizado
      and item.status = 'pendente'
  )
  into v_duplicado;

  -- Na primeira repeticao, somente os itens do mesmo codigo mudam. Nas
  -- repeticoes seguintes esta atualizacao nao regrava linhas ja marcadas.
  if v_duplicado then
    update public.itens_sessao_bipagem as item
    set duplicado = true
    where item.user_id = v_user_id
      and item.sessao_id = p_sessao_id
      and item.codigo_normalizado = v_codigo_normalizado
      and item.status = 'pendente'
      and item.duplicado is distinct from true;
  end if;

  insert into public.itens_sessao_bipagem (
    user_id,
    sessao_id,
    codigo,
    codigo_normalizado,
    ordem,
    status,
    duplicado
  ) values (
    v_user_id,
    p_sessao_id,
    v_codigo_normalizado,
    v_codigo_normalizado,
    v_ordem,
    'pendente',
    v_duplicado
  )
  returning * into v_item;

  return next v_item;
  return;
end;
$$;

-- A remocao tambem devolve somente a linha afetada. Apenas o ultimo item
-- restante do mesmo codigo precisa perder a flag quando uma dupla e desfeita.
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
  v_user_id uuid := public.exigir_usuario_autenticado();
  v_sessao_id uuid;
  v_sessao_status text;
  v_codigo_normalizado text;
  v_restantes integer;
  v_item public.itens_sessao_bipagem%rowtype;
begin
  if p_status not in ('descartado', 'cancelado') then
    raise exception 'Status invalido para remocao de item de sessao.';
  end if;

  -- A primeira leitura descobre qual sessao deve ser serializada. A linha e
  -- relida com bloqueio depois da sessao para manter uma ordem unica de locks.
  select item.sessao_id
    into v_sessao_id
  from public.itens_sessao_bipagem as item
  where item.id = p_item_id
    and item.user_id = v_user_id;

  if not found then
    raise exception 'Item de sessao nao encontrado.';
  end if;

  select sessao.status
    into v_sessao_status
  from public.sessoes_bipagem as sessao
  where sessao.id = v_sessao_id
    and sessao.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Sessao de bipagem nao encontrada.';
  end if;
  if v_sessao_status <> 'aberta' then
    raise exception 'Sessao de bipagem nao esta aberta.';
  end if;

  select item.codigo_normalizado
    into v_codigo_normalizado
  from public.itens_sessao_bipagem as item
  where item.id = p_item_id
    and item.user_id = v_user_id
    and item.sessao_id = v_sessao_id
    and item.status = 'pendente'
  for update;

  if not found then
    raise exception 'Item de sessao nao encontrado.';
  end if;

  update public.itens_sessao_bipagem as item
  set status = p_status,
      duplicado = false
  where item.id = p_item_id
    and item.user_id = v_user_id
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
    where item.user_id = v_user_id
      and item.sessao_id = v_sessao_id
      and item.codigo_normalizado = v_codigo_normalizado
      and item.status = 'pendente'
    limit 2
  ) as restantes;

  if v_restantes = 1 then
    update public.itens_sessao_bipagem as item
    set duplicado = false
    where item.user_id = v_user_id
      and item.sessao_id = v_sessao_id
      and item.codigo_normalizado = v_codigo_normalizado
      and item.status = 'pendente'
      and item.duplicado is distinct from false;
  end if;

  return next v_item;
  return;
end;
$$;

-- auth.uid() como initPlan evita reavaliar a funcao para cada linha. A
-- alteracao e condicional para continuar segura em ambientes com politicas
-- personalizadas ou ausentes.
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
    if exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and policyname = v_table || '_select_own'
    ) then
      execute format(
        'alter policy %I on public.%I using (user_id = (select auth.uid()))',
        v_table || '_select_own', v_table
      );
    end if;

    if exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and policyname = v_table || '_insert_own'
    ) then
      execute format(
        'alter policy %I on public.%I with check (user_id = (select auth.uid()))',
        v_table || '_insert_own', v_table
      );
    end if;

    if exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and policyname = v_table || '_update_own'
    ) then
      execute format(
        'alter policy %I on public.%I using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
        v_table || '_update_own', v_table
      );
    end if;

    if exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and policyname = v_table || '_delete_own'
    ) then
      execute format(
        'alter policy %I on public.%I using (user_id = (select auth.uid()))',
        v_table || '_delete_own', v_table
      );
    end if;
  end loop;
end;
$$;

revoke execute on function public.buscar_pacote_ativo_normalizado(text, uuid)
  from public, anon;
revoke execute on function public.adicionar_item_sessao_bipagem_v2(text, uuid)
  from public, anon;
revoke execute on function public.remover_item_sessao_bipagem_v2(uuid, text)
  from public, anon;

grant execute on function public.buscar_pacote_ativo_normalizado(text, uuid)
  to authenticated;
grant execute on function public.adicionar_item_sessao_bipagem_v2(text, uuid)
  to authenticated;
grant execute on function public.remover_item_sessao_bipagem_v2(uuid, text)
  to authenticated;

commit;
