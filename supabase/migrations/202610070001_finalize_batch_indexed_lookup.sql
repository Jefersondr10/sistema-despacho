-- Evita varrer todo o historico a cada pacote sob as politicas RLS.
-- O indice funcional antigo nao podia atravessar a barreira de seguranca:
-- normalizar_codigo_pacote nao e LEAKPROOF. Materializar o mesmo valor permite
-- a busca indexada sem relaxar RLS, grants, locks ou a validacao de duplicados.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.pacotes
  add column codigo_normalizado text
  generated always as (public.normalizar_codigo_pacote(codigo)) stored;

create index idx_pacotes_user_codigo_normalizado_ativos
  on public.pacotes (user_id, codigo_normalizado)
  where status <> 'cancelado';

CREATE OR REPLACE FUNCTION public.adicionar_item_sessao_bipagem_v3(p_codigo text, p_sessao_id uuid)
 RETURNS SETOF itens_sessao_bipagem
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
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

  v_codigo_normalizado := public.normalizar_codigo_pacote(
    public.extrair_codigo_envelope_mercado_livre(p_codigo)
  );
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
        and pacote.codigo_normalizado = v_codigo_normalizado
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
$function$
;

CREATE OR REPLACE FUNCTION public.finalizar_sessao_bipagem(p_sessao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
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
    on pacote.codigo_normalizado = item.codigo_normalizado
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
$function$
;

CREATE OR REPLACE FUNCTION public.validar_unicidade_rastreio_item_pendente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_codigo_normalizado text;
begin
  if new.status is distinct from 'pendente' then
    return new;
  end if;

  if new.user_id is null then
    raise exception 'user_id obrigatorio em itens de bipagem.';
  end if;
  if new.sessao_id is null then
    raise exception 'sessao_id obrigatorio em itens de bipagem.';
  end if;

  v_codigo_normalizado := public.normalizar_codigo_pacote(
    public.extrair_codigo_envelope_mercado_livre(new.codigo)
  );
  if coalesce(v_codigo_normalizado, '') = '' then
    raise exception 'codigo obrigatorio.';
  end if;

  new.codigo := v_codigo_normalizado;
  new.codigo_normalizado := v_codigo_normalizado;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'bipagem-codigo:' || new.user_id::text || ':' || v_codigo_normalizado,
      0
    )
  );

  if exists (
    select 1
    from public.pacotes as pacote
    where pacote.user_id = new.user_id
      and pacote.codigo_normalizado = v_codigo_normalizado
      and pacote.status <> 'cancelado'
  ) then
    raise exception
      'Pacote duplicado: este codigo ja foi finalizado nesta conta.';
  end if;

  if exists (
    select 1
    from public.itens_sessao_bipagem as outro
    join public.sessoes_bipagem as outra_sessao
      on outra_sessao.id = outro.sessao_id
     and outra_sessao.user_id = outro.user_id
    where outro.user_id = new.user_id
      and outro.codigo_normalizado = v_codigo_normalizado
      and outro.status = 'pendente'
      and outra_sessao.status = 'aberta'
      and outro.sessao_id <> new.sessao_id
      and outro.id is distinct from new.id
  ) then
    raise exception
      'Pacote duplicado: este codigo ja esta em outro lote aberto desta conta.';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validar_unicidade_rastreio_pacote_ativo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_codigo_normalizado text;
begin
  if new.status = 'cancelado' then
    return new;
  end if;

  if new.user_id is null then
    raise exception 'user_id obrigatorio em pacotes.';
  end if;

  v_codigo_normalizado := public.normalizar_codigo_pacote(
    public.extrair_codigo_envelope_mercado_livre(new.codigo)
  );
  if coalesce(v_codigo_normalizado, '') = '' then
    raise exception 'codigo obrigatorio.';
  end if;

  new.codigo := v_codigo_normalizado;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'bipagem-codigo:' || new.user_id::text || ':' || v_codigo_normalizado,
      0
    )
  );

  if exists (
    select 1
    from public.pacotes as pacote
    where pacote.user_id = new.user_id
      and pacote.codigo_normalizado = v_codigo_normalizado
      and pacote.status <> 'cancelado'
      and pacote.id is distinct from new.id
  ) then
    raise exception
      'Pacote duplicado: este codigo ja foi bipado nesta conta.';
  end if;

  if exists (
    select 1
    from public.itens_sessao_bipagem as item
    join public.sessoes_bipagem as sessao
      on sessao.id = item.sessao_id
     and sessao.user_id = item.user_id
    where item.user_id = new.user_id
      and item.codigo_normalizado = v_codigo_normalizado
      and item.status = 'pendente'
      and sessao.status = 'aberta'
      and sessao.id is distinct from new.sessao_id
  ) then
    raise exception
      'Pacote duplicado: este codigo ja esta em outro lote aberto desta conta.';
  end if;

  return new;
end;
$function$
;

analyze public.pacotes;
notify pgrst, 'reload schema';
commit;
