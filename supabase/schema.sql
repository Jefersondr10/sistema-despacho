-- Sistema de Despacho - schema inicial para Supabase
-- Execute este arquivo no SQL Editor do Supabase.
-- Nesta fase ha login via Supabase Auth, sem tabela manual de usuarios, perfis ou RLS.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists marketplaces (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists transportadoras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists relatorio_destinatarios (
  id uuid primary key default gen_random_uuid(),
  nome text,
  email text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table lojas add column if not exists updated_at timestamptz;
alter table marketplaces add column if not exists updated_at timestamptz;
alter table transportadoras add column if not exists updated_at timestamptz;
alter table relatorio_destinatarios add column if not exists updated_at timestamptz;

create table if not exists sessoes_bipagem (
  id uuid primary key default gen_random_uuid(),
  codigo_lote text unique,
  loja_id uuid not null references lojas(id),
  marketplace_id uuid not null references marketplaces(id),
  tipo_operacao text not null check (tipo_operacao in ('coleta', 'postagem')),
  melhor_envio boolean not null default false,
  transportadora_id uuid references transportadoras(id),
  status text not null default 'aberta',
  iniciada_em timestamp with time zone not null default now(),
  finalizada_em timestamp with time zone,
  cancelada_em timestamp with time zone
);

create table if not exists pacotes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  loja_id uuid not null references lojas(id),
  marketplace_id uuid not null references marketplaces(id),
  transportadora_id uuid references transportadoras(id),
  sessao_id uuid references sessoes_bipagem(id),
  tipo_operacao text not null check (tipo_operacao in ('coleta', 'postagem')),
  melhor_envio boolean not null default false,
  status text not null default 'bipado',
  bipado_em timestamp with time zone not null default now(),
  finalizado_em timestamp with time zone,
  cancelado_em timestamp with time zone
);

create table if not exists movimentacoes (
  id uuid primary key default gen_random_uuid(),
  pacote_id uuid references pacotes(id),
  loja_id uuid not null references lojas(id),
  sessao_id uuid references sessoes_bipagem(id),
  tipo_movimentacao text not null,
  descricao text,
  criada_em timestamp with time zone not null default now()
);

create table if not exists pacotes_cancelados (
  id uuid primary key default gen_random_uuid(),
  pacote_id uuid references pacotes(id),
  codigo_pacote text not null,
  loja_id uuid not null references lojas(id),
  marketplace_id uuid references marketplaces(id),
  transportadora_id uuid references transportadoras(id),
  sessao_id uuid references sessoes_bipagem(id),
  tipo_operacao text check (
    tipo_operacao is null or tipo_operacao in ('coleta', 'postagem')
  ),
  melhor_envio boolean,
  justificativa_geral text,
  justificativa_individual text,
  bipado_em timestamp with time zone,
  cancelado_em timestamp with time zone not null default now()
);

create table if not exists relatorio_envios (
  id uuid primary key default gen_random_uuid(),
  destinatarios jsonb not null,
  assunto text not null,
  filtros jsonb not null default '{}'::jsonb,
  status text not null check (status in ('sucesso', 'erro')),
  erro text,
  enviado_em timestamptz not null default now()
);

create index if not exists idx_sessoes_bipagem_loja_id
  on sessoes_bipagem (loja_id);

create index if not exists idx_sessoes_bipagem_marketplace_id
  on sessoes_bipagem (marketplace_id);

create index if not exists idx_pacotes_loja_id
  on pacotes (loja_id);

create index if not exists idx_pacotes_marketplace_id
  on pacotes (marketplace_id);

create index if not exists idx_pacotes_sessao_id
  on pacotes (sessao_id);

drop index if exists idx_pacotes_codigo_normalizado;

create unique index if not exists idx_pacotes_codigo_normalizado_ativos
  on pacotes (upper(regexp_replace(codigo, '\s+', '', 'g')))
  where status <> 'cancelado';

create index if not exists idx_movimentacoes_loja_id
  on movimentacoes (loja_id);

create index if not exists idx_movimentacoes_pacote_id
  on movimentacoes (pacote_id);

create index if not exists idx_pacotes_cancelados_loja_id
  on pacotes_cancelados (loja_id);

create index if not exists idx_pacotes_cancelados_pacote_id
  on pacotes_cancelados (pacote_id);

create unique index if not exists idx_relatorio_destinatarios_email_lower
  on relatorio_destinatarios (lower(email));

create index if not exists idx_relatorio_envios_enviado_em
  on relatorio_envios (enviado_em desc);

drop trigger if exists set_lojas_updated_at on lojas;
create trigger set_lojas_updated_at
  before update on lojas
  for each row
  execute function set_updated_at();

drop trigger if exists set_marketplaces_updated_at on marketplaces;
create trigger set_marketplaces_updated_at
  before update on marketplaces
  for each row
  execute function set_updated_at();

drop trigger if exists set_transportadoras_updated_at on transportadoras;
create trigger set_transportadoras_updated_at
  before update on transportadoras
  for each row
  execute function set_updated_at();

drop trigger if exists set_relatorio_destinatarios_updated_at on relatorio_destinatarios;
create trigger set_relatorio_destinatarios_updated_at
  before update on relatorio_destinatarios
  for each row
  execute function set_updated_at();

alter table public.sessoes_bipagem
  add column if not exists cancelada_em timestamptz;

create or replace function public.set_itens_sessao_bipagem_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

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


insert into lojas (nome, slug)
values
  ('Brasília', 'brasilia'),
  ('São Paulo', 'sao-paulo')
on conflict (slug) do nothing;

insert into marketplaces (nome, slug)
values
  ('Amazon', 'amazon'),
  ('Shopee', 'shopee'),
  ('Mercado Livre', 'mercado-livre'),
  ('TikTok Shop', 'tiktok-shop'),
  ('OLX', 'olx')
on conflict (slug) do nothing;

insert into transportadoras (nome, slug)
values
  ('Correios', 'correios'),
  ('Jadlog', 'jadlog'),
  ('Loggi', 'loggi'),
  ('Azul Cargo', 'azul-cargo')
on conflict (slug) do nothing;

alter table lojas disable row level security;
alter table marketplaces disable row level security;
alter table transportadoras disable row level security;
alter table sessoes_bipagem disable row level security;
alter table itens_sessao_bipagem disable row level security;
alter table pacotes disable row level security;
alter table movimentacoes disable row level security;
alter table pacotes_cancelados disable row level security;
alter table relatorio_destinatarios disable row level security;
alter table relatorio_envios disable row level security;
