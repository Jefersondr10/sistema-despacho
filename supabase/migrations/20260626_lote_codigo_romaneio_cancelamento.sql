-- Codigo visual de lote e cancelamento em lote.

create extension if not exists pgcrypto;

alter table public.sessoes_bipagem
  add column if not exists codigo_lote text;

create unique index if not exists idx_sessoes_bipagem_codigo_lote
  on public.sessoes_bipagem (codigo_lote)
  where codigo_lote is not null;

create or replace function public.gerar_codigo_lote(
  p_data timestamptz default now()
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_codigo text;
begin
  loop
    v_codigo :=
      'LOTE-' ||
      to_char(coalesce(p_data, now()), 'YYYYMMDD') ||
      '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    exit when not exists (
      select 1
      from public.sessoes_bipagem
      where codigo_lote = v_codigo
    );
  end loop;

  return v_codigo;
end;
$$;

create or replace function public.set_codigo_lote_sessao_bipagem()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.codigo_lote is null or btrim(new.codigo_lote) = '' then
    new.codigo_lote := public.gerar_codigo_lote(new.iniciada_em);
  else
    new.codigo_lote := upper(btrim(new.codigo_lote));
  end if;

  return new;
end;
$$;

drop trigger if exists set_codigo_lote_sessao_bipagem on public.sessoes_bipagem;
create trigger set_codigo_lote_sessao_bipagem
  before insert on public.sessoes_bipagem
  for each row
  execute function public.set_codigo_lote_sessao_bipagem();

update public.sessoes_bipagem
set codigo_lote = public.gerar_codigo_lote(
  coalesce(finalizada_em, iniciada_em, now())
)
where codigo_lote is null or btrim(codigo_lote) = '';

create or replace function public.finalizar_sessao_bipagem(p_sessao_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_sessao public.sessoes_bipagem%rowtype;
  v_total_pacotes integer;
  v_codigo_duplicado text;
  v_codigo_existente text;
  v_finalizada_em timestamptz := now();
  v_codigo_lote text;
begin
  select *
    into v_sessao
  from public.sessoes_bipagem
  where id = p_sessao_id
  for update;

  if not found then
    raise exception 'Sessao de bipagem nao encontrada.';
  end if;

  if v_sessao.status <> 'aberta' then
    raise exception 'Sessao de bipagem nao esta aberta.';
  end if;

  v_codigo_lote := coalesce(
    nullif(btrim(v_sessao.codigo_lote), ''),
    public.gerar_codigo_lote(v_finalizada_em)
  );

  perform public.recalcular_duplicados_sessao_bipagem(p_sessao_id);

  select count(*)
    into v_total_pacotes
  from public.itens_sessao_bipagem
  where sessao_id = p_sessao_id
    and status = 'pendente';

  if v_total_pacotes = 0 then
    raise exception 'Nenhum pacote na sessao.';
  end if;

  select codigo_normalizado
    into v_codigo_duplicado
  from public.itens_sessao_bipagem
  where sessao_id = p_sessao_id
    and status = 'pendente'
  group by codigo_normalizado
  having count(*) > 1
  limit 1;

  if v_codigo_duplicado is not null then
    raise exception 'Existem pacotes duplicados nesta sessao: %.', v_codigo_duplicado;
  end if;

  select item.codigo_normalizado
    into v_codigo_existente
  from public.itens_sessao_bipagem item
  join public.pacotes pacote
    on public.normalizar_codigo_pacote(pacote.codigo) = item.codigo_normalizado
   and pacote.status <> 'cancelado'
  where item.sessao_id = p_sessao_id
    and item.status = 'pendente'
  limit 1;

  if v_codigo_existente is not null then
    raise exception 'Pacote % ja foi bipado em outro lote.', v_codigo_existente;
  end if;

  insert into public.pacotes (
    codigo,
    loja_id,
    marketplace_id,
    transportadora_id,
    sessao_id,
    tipo_operacao,
    melhor_envio,
    status,
    bipado_em,
    finalizado_em
  )
  select
    item.codigo_normalizado,
    v_sessao.loja_id,
    v_sessao.marketplace_id,
    v_sessao.transportadora_id,
    p_sessao_id,
    v_sessao.tipo_operacao,
    v_sessao.melhor_envio,
    'finalizado',
    item.criado_em,
    v_finalizada_em
  from public.itens_sessao_bipagem item
  where item.sessao_id = p_sessao_id
    and item.status = 'pendente'
  order by item.ordem asc;

  insert into public.movimentacoes (
    pacote_id,
    loja_id,
    sessao_id,
    tipo_movimentacao,
    descricao,
    criada_em
  )
  select
    pacote.id,
    pacote.loja_id,
    pacote.sessao_id,
    'Bipagem',
    'Pacote ' || pacote.codigo || ' bipado.',
    pacote.bipado_em
  from public.pacotes pacote
  where pacote.sessao_id = p_sessao_id
    and not exists (
      select 1
      from public.movimentacoes movimentacao
      where movimentacao.pacote_id = pacote.id
        and movimentacao.tipo_movimentacao = 'Bipagem'
    );

  update public.itens_sessao_bipagem
  set status = 'finalizado',
      duplicado = false
  where sessao_id = p_sessao_id
    and status = 'pendente';

  update public.sessoes_bipagem
  set status = 'finalizada',
      finalizada_em = v_finalizada_em,
      codigo_lote = v_codigo_lote
  where id = p_sessao_id;

  return jsonb_build_object(
    'sessao_id', p_sessao_id,
    'codigo_lote', v_codigo_lote,
    'total_pacotes', v_total_pacotes,
    'finalizada_em', v_finalizada_em
  );
end;
$$;

create or replace function public.finalizar_cancelamentos_lote(
  p_cancelamentos jsonb
)
returns setof public.pacotes_cancelados
language plpgsql
set search_path = public
as $$
declare
  v_item jsonb;
  v_pacote_id uuid;
  v_pacote public.pacotes%rowtype;
  v_cancelamento public.pacotes_cancelados%rowtype;
  v_cancelado_em timestamptz := now();
  v_justificativa_geral text;
  v_justificativa_individual text;
begin
  if jsonb_typeof(p_cancelamentos) <> 'array'
    or jsonb_array_length(p_cancelamentos) = 0 then
    raise exception 'Informe ao menos um pacote para cancelar.';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_cancelamentos)
  loop
    v_pacote_id := nullif(v_item->>'pacote_id', '')::uuid;
    v_justificativa_geral := nullif(btrim(v_item->>'justificativa_geral'), '');
    v_justificativa_individual :=
      nullif(btrim(coalesce(v_item->>'justificativa_individual', '')), '');

    if v_pacote_id is null then
      raise exception 'pacote_id obrigatorio para cancelamento.';
    end if;

    if v_justificativa_geral is null then
      raise exception 'justificativa_geral obrigatoria para cancelamento.';
    end if;

    select *
      into v_pacote
    from public.pacotes
    where id = v_pacote_id
    for update;

    if not found then
      raise exception 'Pacote % nao encontrado.', v_pacote_id;
    end if;

    if lower(btrim(v_pacote.status)) = 'cancelado' then
      raise exception 'Pacote % ja esta cancelado.', v_pacote.codigo;
    end if;

    update public.pacotes
    set status = 'cancelado',
        cancelado_em = v_cancelado_em
    where id = v_pacote.id;

    insert into public.pacotes_cancelados (
      pacote_id,
      codigo_pacote,
      loja_id,
      marketplace_id,
      transportadora_id,
      sessao_id,
      tipo_operacao,
      melhor_envio,
      justificativa_geral,
      justificativa_individual,
      bipado_em,
      cancelado_em
    )
    values (
      v_pacote.id,
      v_pacote.codigo,
      v_pacote.loja_id,
      v_pacote.marketplace_id,
      v_pacote.transportadora_id,
      v_pacote.sessao_id,
      v_pacote.tipo_operacao,
      v_pacote.melhor_envio,
      v_justificativa_geral,
      v_justificativa_individual,
      v_pacote.bipado_em,
      v_cancelado_em
    )
    returning * into v_cancelamento;

    insert into public.movimentacoes (
      pacote_id,
      loja_id,
      sessao_id,
      tipo_movimentacao,
      descricao,
      criada_em
    )
    values (
      v_pacote.id,
      v_pacote.loja_id,
      v_pacote.sessao_id,
      'Cancelamento',
      'Pacote ' || v_pacote.codigo || ' cancelado.',
      v_cancelado_em
    );

    return next v_cancelamento;
  end loop;

  return;
end;
$$;

grant execute on function public.finalizar_cancelamentos_lote(jsonb)
  to anon, authenticated;
