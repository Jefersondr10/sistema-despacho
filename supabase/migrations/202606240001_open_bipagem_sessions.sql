-- Persistencia da sessao aberta de bipagem no Supabase.
-- Execute no Supabase antes de publicar a versao que usa itens_sessao_bipagem.

create extension if not exists pgcrypto;

alter table sessoes_bipagem
  add column if not exists cancelada_em timestamp with time zone;

create table if not exists itens_sessao_bipagem (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references sessoes_bipagem(id) on delete cascade,
  codigo text not null,
  codigo_normalizado text not null,
  ordem integer not null default 1,
  status text not null default 'pendente',
  duplicado boolean not null default false,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone
);

create index if not exists idx_itens_sessao_bipagem_sessao_id
  on itens_sessao_bipagem (sessao_id);

create index if not exists idx_itens_sessao_bipagem_sessao_ordem
  on itens_sessao_bipagem (sessao_id, ordem desc);

create index if not exists idx_itens_sessao_bipagem_codigo_normalizado
  on itens_sessao_bipagem (codigo_normalizado);

drop trigger if exists set_itens_sessao_bipagem_updated_at on itens_sessao_bipagem;
create trigger set_itens_sessao_bipagem_updated_at
  before update on itens_sessao_bipagem
  for each row
  execute function set_updated_at();

create or replace function normalizar_codigo_pacote(p_codigo text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(trim(p_codigo), ''), '\s+', '', 'g'));
$$;

create or replace function recalcular_duplicados_sessao_bipagem(p_sessao_id uuid)
returns void
language plpgsql
as $$
begin
  with contagens as (
    select codigo_normalizado, count(*) as total
    from itens_sessao_bipagem
    where sessao_id = p_sessao_id
      and status = 'pendente'
    group by codigo_normalizado
  )
  update itens_sessao_bipagem item
  set duplicado = contagens.total > 1
  from contagens
  where item.sessao_id = p_sessao_id
    and item.status = 'pendente'
    and item.codigo_normalizado = contagens.codigo_normalizado;
end;
$$;

create or replace function adicionar_item_sessao_bipagem(
  p_sessao_id uuid,
  p_codigo text
)
returns setof itens_sessao_bipagem
language plpgsql
as $$
declare
  v_sessao_status text;
  v_codigo_normalizado text;
  v_ordem integer;
begin
  select status
    into v_sessao_status
  from sessoes_bipagem
  where id = p_sessao_id
  for update;

  if not found then
    raise exception 'Sessao de bipagem nao encontrada.';
  end if;

  if v_sessao_status <> 'aberta' then
    raise exception 'Sessao de bipagem nao esta aberta.';
  end if;

  v_codigo_normalizado := normalizar_codigo_pacote(p_codigo);

  if v_codigo_normalizado = '' then
    raise exception 'codigo obrigatorio.';
  end if;

  select coalesce(max(ordem), 0) + 1
    into v_ordem
  from itens_sessao_bipagem
  where sessao_id = p_sessao_id;

  insert into itens_sessao_bipagem (
    sessao_id,
    codigo,
    codigo_normalizado,
    ordem,
    status,
    duplicado
  )
  values (
    p_sessao_id,
    v_codigo_normalizado,
    v_codigo_normalizado,
    v_ordem,
    'pendente',
    false
  );

  perform recalcular_duplicados_sessao_bipagem(p_sessao_id);

  return query
    select *
    from itens_sessao_bipagem
    where sessao_id = p_sessao_id
      and status = 'pendente'
    order by ordem desc, criado_em desc;
end;
$$;

create or replace function remover_item_sessao_bipagem(
  p_item_id uuid,
  p_status text default 'descartado'
)
returns setof itens_sessao_bipagem
language plpgsql
as $$
declare
  v_sessao_id uuid;
begin
  if p_status not in ('descartado', 'cancelado') then
    raise exception 'Status invalido para remocao de item de sessao.';
  end if;

  select sessao_id
    into v_sessao_id
  from itens_sessao_bipagem
  where id = p_item_id
  for update;

  if not found then
    raise exception 'Item de sessao nao encontrado.';
  end if;

  update itens_sessao_bipagem
  set status = p_status,
      duplicado = false
  where id = p_item_id;

  perform recalcular_duplicados_sessao_bipagem(v_sessao_id);

  return query
    select *
    from itens_sessao_bipagem
    where sessao_id = v_sessao_id
      and status = 'pendente'
    order by ordem desc, criado_em desc;
end;
$$;

create or replace function finalizar_sessao_bipagem(p_sessao_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_sessao sessoes_bipagem%rowtype;
  v_total_pacotes integer;
  v_codigo_duplicado text;
  v_codigo_existente text;
  v_finalizada_em timestamp with time zone := now();
begin
  select *
    into v_sessao
  from sessoes_bipagem
  where id = p_sessao_id
  for update;

  if not found then
    raise exception 'Sessao de bipagem nao encontrada.';
  end if;

  if v_sessao.status <> 'aberta' then
    raise exception 'Sessao de bipagem nao esta aberta.';
  end if;

  perform recalcular_duplicados_sessao_bipagem(p_sessao_id);

  select count(*)
    into v_total_pacotes
  from itens_sessao_bipagem
  where sessao_id = p_sessao_id
    and status = 'pendente';

  if v_total_pacotes = 0 then
    raise exception 'Nenhum pacote na sessao.';
  end if;

  select codigo_normalizado
    into v_codigo_duplicado
  from itens_sessao_bipagem
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
  from itens_sessao_bipagem item
  join pacotes pacote
    on normalizar_codigo_pacote(pacote.codigo) = item.codigo_normalizado
   and pacote.status <> 'cancelado'
  where item.sessao_id = p_sessao_id
    and item.status = 'pendente'
  limit 1;

  if v_codigo_existente is not null then
    raise exception 'Pacote % ja foi bipado em outro lote.', v_codigo_existente;
  end if;

  insert into pacotes (
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
  from itens_sessao_bipagem item
  where item.sessao_id = p_sessao_id
    and item.status = 'pendente'
  order by item.ordem asc;

  insert into movimentacoes (
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
  from pacotes pacote
  where pacote.sessao_id = p_sessao_id
    and not exists (
      select 1
      from movimentacoes movimentacao
      where movimentacao.pacote_id = pacote.id
        and movimentacao.tipo_movimentacao = 'Bipagem'
    );

  update itens_sessao_bipagem
  set status = 'finalizado',
      duplicado = false
  where sessao_id = p_sessao_id
    and status = 'pendente';

  update sessoes_bipagem
  set status = 'finalizada',
      finalizada_em = v_finalizada_em
  where id = p_sessao_id;

  return jsonb_build_object(
    'sessao_id', p_sessao_id,
    'total_pacotes', v_total_pacotes,
    'finalizada_em', v_finalizada_em
  );
end;
$$;

create or replace function cancelar_sessao_bipagem(p_sessao_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_cancelada_em timestamp with time zone := now();
begin
  update sessoes_bipagem
  set status = 'cancelada',
      finalizada_em = null,
      cancelada_em = v_cancelada_em
  where id = p_sessao_id
    and status = 'aberta';

  if not found then
    raise exception 'Sessao de bipagem aberta nao encontrada.';
  end if;

  update itens_sessao_bipagem
  set status = 'descartado',
      duplicado = false
  where sessao_id = p_sessao_id
    and status = 'pendente';

  return jsonb_build_object(
    'sessao_id', p_sessao_id,
    'cancelada_em', v_cancelada_em
  );
end;
$$;

alter table itens_sessao_bipagem disable row level security;
