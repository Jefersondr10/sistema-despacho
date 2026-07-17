-- RPCs e tabela de itens temporarios da sessao de bipagem.
-- Execute este arquivo no Supabase SQL Editor para corrigir a bipagem publicada.

create extension if not exists pgcrypto;

create or replace function public.set_itens_sessao_bipagem_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

alter table public.sessoes_bipagem
  add column if not exists cancelada_em timestamptz;

create table if not exists public.itens_sessao_bipagem (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.sessoes_bipagem(id) on delete cascade,
  codigo text not null,
  codigo_normalizado text not null,
  ordem integer,
  status text not null default 'pendente',
  duplicado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);

alter table public.itens_sessao_bipagem
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists sessao_id uuid,
  add column if not exists codigo text,
  add column if not exists codigo_normalizado text,
  add column if not exists ordem integer,
  add column if not exists status text not null default 'pendente',
  add column if not exists duplicado boolean not null default false,
  add column if not exists criado_em timestamptz not null default now(),
  add column if not exists atualizado_em timestamptz;

update public.itens_sessao_bipagem
set id = gen_random_uuid()
where id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where contype = 'p'
      and conrelid = 'public.itens_sessao_bipagem'::regclass
  ) then
    alter table public.itens_sessao_bipagem
      add constraint itens_sessao_bipagem_pkey primary key (id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'itens_sessao_bipagem_sessao_id_fkey'
      and conrelid = 'public.itens_sessao_bipagem'::regclass
  ) then
    alter table public.itens_sessao_bipagem
      add constraint itens_sessao_bipagem_sessao_id_fkey
      foreign key (sessao_id) references public.sessoes_bipagem(id) on delete cascade;
  end if;
end;
$$;

create index if not exists idx_itens_sessao_bipagem_sessao_id
  on public.itens_sessao_bipagem (sessao_id);

create index if not exists idx_itens_sessao_bipagem_sessao_ordem
  on public.itens_sessao_bipagem (sessao_id, ordem desc);

create index if not exists idx_itens_sessao_bipagem_codigo_normalizado
  on public.itens_sessao_bipagem (codigo_normalizado);

drop trigger if exists set_itens_sessao_bipagem_updated_at on public.itens_sessao_bipagem;
drop trigger if exists set_itens_sessao_bipagem_atualizado_em on public.itens_sessao_bipagem;
create trigger set_itens_sessao_bipagem_atualizado_em
  before update on public.itens_sessao_bipagem
  for each row
  execute function public.set_itens_sessao_bipagem_atualizado_em();

create or replace function public.normalizar_codigo_pacote(p_codigo text)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(regexp_replace(coalesce(trim(p_codigo), ''), '\s+', '', 'g'));
$$;

create or replace function public.recalcular_duplicados_sessao_bipagem(
  p_sessao_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.itens_sessao_bipagem item
  set duplicado = exists (
    select 1
    from public.itens_sessao_bipagem outro
    where outro.sessao_id = item.sessao_id
      and outro.status = 'pendente'
      and outro.codigo_normalizado = item.codigo_normalizado
      and outro.id <> item.id
  )
  where item.sessao_id = p_sessao_id
    and item.status = 'pendente';
end;
$$;

drop function if exists public.adicionar_item_sessao_bipagem(uuid, text);
drop function if exists public.adicionar_item_sessao_bipagem(text, uuid);

create function public.adicionar_item_sessao_bipagem(
  p_codigo text,
  p_sessao_id uuid
)
returns setof public.itens_sessao_bipagem
language plpgsql
set search_path = public
as $$
declare
  v_sessao_status text;
  v_codigo_normalizado text;
  v_ordem integer;
begin
  select status
    into v_sessao_status
  from public.sessoes_bipagem
  where id = p_sessao_id
  for update;

  if not found then
    raise exception 'Sessao de bipagem nao encontrada.';
  end if;

  if v_sessao_status <> 'aberta' then
    raise exception 'Sessao de bipagem nao esta aberta.';
  end if;

  v_codigo_normalizado := public.normalizar_codigo_pacote(p_codigo);

  if v_codigo_normalizado = '' then
    raise exception 'codigo obrigatorio.';
  end if;

  select coalesce(max(ordem), 0) + 1
    into v_ordem
  from public.itens_sessao_bipagem
  where sessao_id = p_sessao_id;

  insert into public.itens_sessao_bipagem (
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

  perform public.recalcular_duplicados_sessao_bipagem(p_sessao_id);

  return query
    select *
    from public.itens_sessao_bipagem
    where sessao_id = p_sessao_id
      and status = 'pendente'
    order by ordem desc, criado_em desc;
end;
$$;

create or replace function public.remover_item_sessao_bipagem(
  p_item_id uuid,
  p_status text default 'descartado'
)
returns setof public.itens_sessao_bipagem
language plpgsql
set search_path = public
as $$
declare
  v_sessao_id uuid;
begin
  if p_status not in ('descartado', 'cancelado') then
    raise exception 'Status invalido para remocao de item de sessao.';
  end if;

  select sessao_id
    into v_sessao_id
  from public.itens_sessao_bipagem
  where id = p_item_id
  for update;

  if not found then
    raise exception 'Item de sessao nao encontrado.';
  end if;

  update public.itens_sessao_bipagem
  set status = p_status,
      duplicado = false
  where id = p_item_id;

  perform public.recalcular_duplicados_sessao_bipagem(v_sessao_id);

  return query
    select *
    from public.itens_sessao_bipagem
    where sessao_id = v_sessao_id
      and status = 'pendente'
    order by ordem desc, criado_em desc;
end;
$$;

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
      finalizada_em = v_finalizada_em
  where id = p_sessao_id;

  return jsonb_build_object(
    'sessao_id', p_sessao_id,
    'total_pacotes', v_total_pacotes,
    'finalizada_em', v_finalizada_em
  );
end;
$$;

create or replace function public.cancelar_sessao_bipagem(p_sessao_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_cancelada_em timestamptz := now();
begin
  update public.sessoes_bipagem
  set status = 'cancelada',
      finalizada_em = null,
      cancelada_em = v_cancelada_em
  where id = p_sessao_id
    and status = 'aberta';

  if not found then
    raise exception 'Sessao de bipagem aberta nao encontrada.';
  end if;

  update public.itens_sessao_bipagem
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

grant execute on function public.adicionar_item_sessao_bipagem(text, uuid) to anon, authenticated;
grant execute on function public.remover_item_sessao_bipagem(uuid, text) to anon, authenticated;
grant execute on function public.finalizar_sessao_bipagem(uuid) to anon, authenticated;
grant execute on function public.cancelar_sessao_bipagem(uuid) to anon, authenticated;
