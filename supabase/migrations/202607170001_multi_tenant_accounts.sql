-- Isolamento definitivo por conta autenticada.
--
-- ANTES DE APLICAR: substitua OWNER_EMAIL_AQUI pelo e-mail exato da conta que
-- deve receber os registros legados. A migration aborta sem alterar nada se o
-- placeholder permanecer ou se o usuário não existir em auth.users.
--
-- Esta migration não apaga nem recria linhas das tabelas operacionais.

begin;

create extension if not exists pgcrypto;

-- O backfill precisa ocorrer antes dos defaults, NOT NULL, FKs e RLS.
alter table public.lojas add column if not exists user_id uuid;
alter table public.marketplaces add column if not exists user_id uuid;
alter table public.transportadoras add column if not exists user_id uuid;
alter table public.relatorio_destinatarios add column if not exists user_id uuid;
alter table public.relatorio_envios add column if not exists user_id uuid;
alter table public.sessoes_bipagem add column if not exists user_id uuid;
alter table public.itens_sessao_bipagem add column if not exists user_id uuid;
alter table public.pacotes add column if not exists user_id uuid;
alter table public.movimentacoes add column if not exists user_id uuid;
alter table public.pacotes_cancelados add column if not exists user_id uuid;

do $$
declare
  v_owner_email constant text := 'jefersondr10@gmail.com';
  v_owner_id uuid;
  v_table text;
  v_null_count bigint;
begin
  if v_owner_email = 'OWNER_EMAIL_AQUI' or btrim(v_owner_email) = '' then
    raise exception using
      message = 'BACKFILL BLOQUEADO: substitua OWNER_EMAIL_AQUI pelo e-mail da conta proprietária antes de aplicar a migration.';
  end if;

  select id
    into v_owner_id
  from auth.users
  where lower(email) = lower(btrim(v_owner_email));

  if v_owner_id is null then
    raise exception using
      message = format(
        'BACKFILL BLOQUEADO: nenhum usuário com e-mail %s existe em auth.users. Crie/confirme a conta antes de aplicar a migration.',
        v_owner_email
      );
  end if;

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
      'update public.%I set user_id = $1 where user_id is null',
      v_table
    ) using v_owner_id;

    execute format(
      'select count(*) from public.%I where user_id is null',
      v_table
    ) into v_null_count;

    if v_null_count <> 0 then
      raise exception 'BACKFILL INCOMPLETO: public.% ainda possui % registro(s) sem user_id.',
        v_table,
        v_null_count;
    end if;
  end loop;
end;
$$;

-- O usuário autenticado passa a ser o dono obrigatório de toda linha nova.
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
      'alter table public.%I alter column user_id set default auth.uid()',
      v_table
    );
    execute format(
      'alter table public.%I alter column user_id set not null',
      v_table
    );
    execute format(
      'alter table public.%I drop constraint if exists %I',
      v_table,
      v_table || '_user_id_fkey'
    );
    execute format(
      'alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade',
      v_table,
      v_table || '_user_id_fkey'
    );
  end loop;
end;
$$;

comment on column public.lojas.user_id is 'Conta proprietária no Supabase Auth.';
comment on column public.marketplaces.user_id is 'Conta proprietária no Supabase Auth.';
comment on column public.transportadoras.user_id is 'Conta proprietária no Supabase Auth.';
comment on column public.relatorio_destinatarios.user_id is 'Conta proprietária no Supabase Auth.';
comment on column public.relatorio_envios.user_id is 'Conta proprietária no Supabase Auth.';
comment on column public.sessoes_bipagem.user_id is 'Conta proprietária no Supabase Auth.';
comment on column public.itens_sessao_bipagem.user_id is 'Conta proprietária no Supabase Auth.';
comment on column public.pacotes.user_id is 'Conta proprietária no Supabase Auth.';
comment on column public.movimentacoes.user_id is 'Conta proprietária no Supabase Auth.';
comment on column public.pacotes_cancelados.user_id is 'Conta proprietária no Supabase Auth.';

-- Chaves candidatas permitem que todas as relações também carreguem user_id.
alter table public.lojas drop constraint if exists lojas_id_user_id_key;
alter table public.lojas add constraint lojas_id_user_id_key unique (id, user_id);
alter table public.marketplaces drop constraint if exists marketplaces_id_user_id_key;
alter table public.marketplaces add constraint marketplaces_id_user_id_key unique (id, user_id);
alter table public.transportadoras drop constraint if exists transportadoras_id_user_id_key;
alter table public.transportadoras add constraint transportadoras_id_user_id_key unique (id, user_id);
alter table public.sessoes_bipagem drop constraint if exists sessoes_bipagem_id_user_id_key;
alter table public.sessoes_bipagem add constraint sessoes_bipagem_id_user_id_key unique (id, user_id);
alter table public.pacotes drop constraint if exists pacotes_id_user_id_key;
alter table public.pacotes add constraint pacotes_id_user_id_key unique (id, user_id);

-- Remove as FKs simples para evitar relações ambíguas no PostgREST e substitui
-- por FKs compostas, que impedem referências cruzadas entre contas.
alter table public.sessoes_bipagem drop constraint if exists sessoes_bipagem_loja_id_fkey;
alter table public.sessoes_bipagem drop constraint if exists sessoes_bipagem_marketplace_id_fkey;
alter table public.sessoes_bipagem drop constraint if exists sessoes_bipagem_transportadora_id_fkey;
alter table public.itens_sessao_bipagem drop constraint if exists itens_sessao_bipagem_sessao_id_fkey;
alter table public.pacotes drop constraint if exists pacotes_loja_id_fkey;
alter table public.pacotes drop constraint if exists pacotes_marketplace_id_fkey;
alter table public.pacotes drop constraint if exists pacotes_transportadora_id_fkey;
alter table public.pacotes drop constraint if exists pacotes_sessao_id_fkey;
alter table public.movimentacoes drop constraint if exists movimentacoes_pacote_id_fkey;
alter table public.movimentacoes drop constraint if exists movimentacoes_loja_id_fkey;
alter table public.movimentacoes drop constraint if exists movimentacoes_sessao_id_fkey;
alter table public.pacotes_cancelados drop constraint if exists pacotes_cancelados_pacote_id_fkey;
alter table public.pacotes_cancelados drop constraint if exists pacotes_cancelados_loja_id_fkey;
alter table public.pacotes_cancelados drop constraint if exists pacotes_cancelados_marketplace_id_fkey;
alter table public.pacotes_cancelados drop constraint if exists pacotes_cancelados_transportadora_id_fkey;
alter table public.pacotes_cancelados drop constraint if exists pacotes_cancelados_sessao_id_fkey;

alter table public.sessoes_bipagem
  add constraint sessoes_bipagem_loja_owner_fkey
  foreign key (loja_id, user_id) references public.lojas (id, user_id);
alter table public.sessoes_bipagem
  add constraint sessoes_bipagem_marketplace_owner_fkey
  foreign key (marketplace_id, user_id) references public.marketplaces (id, user_id);
alter table public.sessoes_bipagem
  add constraint sessoes_bipagem_transportadora_owner_fkey
  foreign key (transportadora_id, user_id) references public.transportadoras (id, user_id);
alter table public.itens_sessao_bipagem
  add constraint itens_sessao_bipagem_sessao_owner_fkey
  foreign key (sessao_id, user_id) references public.sessoes_bipagem (id, user_id)
  on delete cascade;
alter table public.pacotes
  add constraint pacotes_loja_owner_fkey
  foreign key (loja_id, user_id) references public.lojas (id, user_id);
alter table public.pacotes
  add constraint pacotes_marketplace_owner_fkey
  foreign key (marketplace_id, user_id) references public.marketplaces (id, user_id);
alter table public.pacotes
  add constraint pacotes_transportadora_owner_fkey
  foreign key (transportadora_id, user_id) references public.transportadoras (id, user_id);
alter table public.pacotes
  add constraint pacotes_sessao_owner_fkey
  foreign key (sessao_id, user_id) references public.sessoes_bipagem (id, user_id);
alter table public.movimentacoes
  add constraint movimentacoes_pacote_owner_fkey
  foreign key (pacote_id, user_id) references public.pacotes (id, user_id);
alter table public.movimentacoes
  add constraint movimentacoes_loja_owner_fkey
  foreign key (loja_id, user_id) references public.lojas (id, user_id);
alter table public.movimentacoes
  add constraint movimentacoes_sessao_owner_fkey
  foreign key (sessao_id, user_id) references public.sessoes_bipagem (id, user_id);
alter table public.pacotes_cancelados
  add constraint pacotes_cancelados_pacote_owner_fkey
  foreign key (pacote_id, user_id) references public.pacotes (id, user_id);
alter table public.pacotes_cancelados
  add constraint pacotes_cancelados_loja_owner_fkey
  foreign key (loja_id, user_id) references public.lojas (id, user_id);
alter table public.pacotes_cancelados
  add constraint pacotes_cancelados_marketplace_owner_fkey
  foreign key (marketplace_id, user_id) references public.marketplaces (id, user_id);
alter table public.pacotes_cancelados
  add constraint pacotes_cancelados_transportadora_owner_fkey
  foreign key (transportadora_id, user_id) references public.transportadoras (id, user_id);
alter table public.pacotes_cancelados
  add constraint pacotes_cancelados_sessao_owner_fkey
  foreign key (sessao_id, user_id) references public.sessoes_bipagem (id, user_id);

-- Unicidade dentro da conta, não entre contas.
alter table public.lojas drop constraint if exists lojas_slug_key;
alter table public.marketplaces drop constraint if exists marketplaces_slug_key;
alter table public.transportadoras drop constraint if exists transportadoras_slug_key;
alter table public.relatorio_destinatarios drop constraint if exists relatorio_destinatarios_email_key;
alter table public.sessoes_bipagem drop constraint if exists sessoes_bipagem_codigo_lote_key;

drop index if exists public.idx_lojas_slug;
drop index if exists public.idx_marketplaces_slug;
drop index if exists public.idx_transportadoras_slug;
drop index if exists public.idx_relatorio_destinatarios_email_lower;
drop index if exists public.idx_sessoes_bipagem_codigo_lote;
drop index if exists public.idx_pacotes_loja_codigo_normalizado_ativos;
drop index if exists public.idx_pacotes_codigo_normalizado;
drop index if exists public.idx_pacotes_codigo_normalizado_ativos;
drop index if exists public.idx_lojas_user_slug;
drop index if exists public.idx_marketplaces_user_slug;
drop index if exists public.idx_transportadoras_user_slug;
drop index if exists public.idx_relatorio_destinatarios_user_email_lower;
drop index if exists public.idx_sessoes_bipagem_user_codigo_lote;
drop index if exists public.idx_pacotes_user_loja_codigo_ativos;

create unique index idx_lojas_user_slug
  on public.lojas (user_id, lower(slug));
create unique index idx_marketplaces_user_slug
  on public.marketplaces (user_id, lower(slug));
create unique index idx_transportadoras_user_slug
  on public.transportadoras (user_id, lower(slug));
create unique index idx_relatorio_destinatarios_user_email_lower
  on public.relatorio_destinatarios (user_id, lower(email));
create unique index idx_sessoes_bipagem_user_codigo_lote
  on public.sessoes_bipagem (user_id, upper(btrim(codigo_lote)))
  where codigo_lote is not null and btrim(codigo_lote) <> '';
create unique index idx_pacotes_user_loja_codigo_ativos
  on public.pacotes (
    user_id,
    loja_id,
    public.normalizar_codigo_pacote(codigo)
  )
  where status <> 'cancelado';

create index if not exists idx_lojas_user_id on public.lojas (user_id);
create index if not exists idx_marketplaces_user_id on public.marketplaces (user_id);
create index if not exists idx_transportadoras_user_id on public.transportadoras (user_id);
create index if not exists idx_relatorio_destinatarios_user_id on public.relatorio_destinatarios (user_id);
create index if not exists idx_relatorio_envios_user_id on public.relatorio_envios (user_id);
create index if not exists idx_sessoes_bipagem_user_id on public.sessoes_bipagem (user_id);
create index if not exists idx_itens_sessao_bipagem_user_id on public.itens_sessao_bipagem (user_id);
create index if not exists idx_itens_sessao_bipagem_user_sessao_ordem
  on public.itens_sessao_bipagem (user_id, sessao_id, ordem desc);
create index if not exists idx_pacotes_user_id on public.pacotes (user_id);
create index if not exists idx_pacotes_user_loja_id on public.pacotes (user_id, loja_id);
create index if not exists idx_movimentacoes_user_id on public.movimentacoes (user_id);
create index if not exists idx_movimentacoes_user_loja_id on public.movimentacoes (user_id, loja_id);
create index if not exists idx_pacotes_cancelados_user_id on public.pacotes_cancelados (user_id);

create or replace function public.exigir_usuario_autenticado()
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio.';
  end if;

  return v_user_id;
end;
$$;

create or replace function public.gerar_codigo_lote(
  p_data timestamptz default now()
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := public.exigir_usuario_autenticado();
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
      where user_id = v_user_id
        and codigo_lote = v_codigo
    );
  end loop;

  return v_codigo;
end;
$$;

create or replace function public.set_codigo_lote_sessao_bipagem()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := public.exigir_usuario_autenticado();
begin
  if new.user_id is null then
    new.user_id := v_user_id;
  elsif new.user_id <> v_user_id then
    raise exception 'Nao e permitido criar sessao para outra conta.';
  end if;

  if new.loja_id is null then
    raise exception 'Selecione a loja antes de iniciar a sessao.';
  end if;

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
  for each row execute function public.set_codigo_lote_sessao_bipagem();

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
    select 1 from public.sessoes_bipagem
    where id = p_sessao_id and user_id = v_user_id
  ) then
    raise exception 'Sessao de bipagem nao encontrada.';
  end if;

  update public.itens_sessao_bipagem item
  set duplicado = exists (
    select 1
    from public.itens_sessao_bipagem outro
    where outro.user_id = v_user_id
      and outro.sessao_id = item.sessao_id
      and outro.status = 'pendente'
      and outro.codigo_normalizado = item.codigo_normalizado
      and outro.id <> item.id
  )
  where item.user_id = v_user_id
    and item.sessao_id = p_sessao_id
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
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := public.exigir_usuario_autenticado();
  v_sessao_status text;
  v_loja_id uuid;
  v_codigo_normalizado text;
  v_ordem integer;
begin
  select status, loja_id
    into v_sessao_status, v_loja_id
  from public.sessoes_bipagem
  where id = p_sessao_id and user_id = v_user_id
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

  select coalesce(max(ordem), 0) + 1
    into v_ordem
  from public.itens_sessao_bipagem
  where sessao_id = p_sessao_id and user_id = v_user_id;

  insert into public.itens_sessao_bipagem (
    user_id, sessao_id, codigo, codigo_normalizado, ordem, status, duplicado
  ) values (
    v_user_id, p_sessao_id, v_codigo_normalizado,
    v_codigo_normalizado, v_ordem, 'pendente', false
  );

  perform public.recalcular_duplicados_sessao_bipagem(p_sessao_id);

  return query
    select *
    from public.itens_sessao_bipagem
    where sessao_id = p_sessao_id
      and user_id = v_user_id
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
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := public.exigir_usuario_autenticado();
  v_sessao_id uuid;
begin
  if p_status not in ('descartado', 'cancelado') then
    raise exception 'Status invalido para remocao de item de sessao.';
  end if;

  select sessao_id into v_sessao_id
  from public.itens_sessao_bipagem
  where id = p_item_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Item de sessao nao encontrado.';
  end if;

  update public.itens_sessao_bipagem
  set status = p_status, duplicado = false
  where id = p_item_id and user_id = v_user_id;

  perform public.recalcular_duplicados_sessao_bipagem(v_sessao_id);

  return query
    select *
    from public.itens_sessao_bipagem
    where sessao_id = v_sessao_id
      and user_id = v_user_id
      and status = 'pendente'
    order by ordem desc, criado_em desc;
end;
$$;

create or replace function public.finalizar_sessao_bipagem(p_sessao_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := public.exigir_usuario_autenticado();
  v_sessao public.sessoes_bipagem%rowtype;
  v_total_pacotes integer;
  v_codigo_duplicado text;
  v_codigo_existente text;
  v_finalizada_em timestamptz := now();
  v_codigo_lote text;
begin
  select * into v_sessao
  from public.sessoes_bipagem
  where id = p_sessao_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Sessao de bipagem nao encontrada.';
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

  perform public.recalcular_duplicados_sessao_bipagem(p_sessao_id);

  select count(*) into v_total_pacotes
  from public.itens_sessao_bipagem
  where sessao_id = p_sessao_id
    and user_id = v_user_id
    and status = 'pendente';

  if v_total_pacotes = 0 then
    raise exception 'Nenhum pacote na sessao.';
  end if;

  select codigo_normalizado into v_codigo_duplicado
  from public.itens_sessao_bipagem
  where sessao_id = p_sessao_id
    and user_id = v_user_id
    and status = 'pendente'
  group by codigo_normalizado
  having count(*) > 1
  limit 1;

  if v_codigo_duplicado is not null then
    raise exception 'Existem pacotes duplicados nesta sessao: %.', v_codigo_duplicado;
  end if;

  select item.codigo_normalizado into v_codigo_existente
  from public.itens_sessao_bipagem item
  join public.pacotes pacote
    on public.normalizar_codigo_pacote(pacote.codigo) = item.codigo_normalizado
   and pacote.status <> 'cancelado'
   and pacote.user_id = v_user_id
   and pacote.loja_id = v_sessao.loja_id
  where item.sessao_id = p_sessao_id
    and item.user_id = v_user_id
    and item.status = 'pendente'
  limit 1;

  if v_codigo_existente is not null then
    raise exception 'Pacote % ja foi bipado nesta loja.', v_codigo_existente;
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
    finalizado_em
  )
  select
    v_user_id,
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
    and item.user_id = v_user_id
    and item.status = 'pendente'
  order by item.ordem asc;

  insert into public.movimentacoes (
    user_id,
    pacote_id,
    loja_id,
    sessao_id,
    tipo_movimentacao,
    descricao,
    criada_em
  )
  select
    v_user_id,
    pacote.id,
    pacote.loja_id,
    pacote.sessao_id,
    'Bipagem',
    'Pacote ' || pacote.codigo || ' bipado.',
    pacote.bipado_em
  from public.pacotes pacote
  where pacote.sessao_id = p_sessao_id
    and pacote.user_id = v_user_id
    and pacote.loja_id = v_sessao.loja_id
    and not exists (
      select 1
      from public.movimentacoes movimentacao
      where movimentacao.pacote_id = pacote.id
        and movimentacao.user_id = v_user_id
        and movimentacao.loja_id = v_sessao.loja_id
        and movimentacao.tipo_movimentacao = 'Bipagem'
    );

  update public.itens_sessao_bipagem
  set status = 'finalizado', duplicado = false
  where sessao_id = p_sessao_id
    and user_id = v_user_id
    and status = 'pendente';

  update public.sessoes_bipagem
  set status = 'finalizada',
      finalizada_em = v_finalizada_em,
      codigo_lote = v_codigo_lote
  where id = p_sessao_id
    and user_id = v_user_id
    and loja_id = v_sessao.loja_id;

  return jsonb_build_object(
    'sessao_id', p_sessao_id,
    'codigo_lote', v_codigo_lote,
    'total_pacotes', v_total_pacotes,
    'finalizada_em', v_finalizada_em
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
  v_user_id uuid := public.exigir_usuario_autenticado();
  v_loja_id uuid;
  v_cancelada_em timestamptz := now();
begin
  select loja_id into v_loja_id
  from public.sessoes_bipagem
  where id = p_sessao_id
    and user_id = v_user_id
    and status = 'aberta'
  for update;

  if not found or v_loja_id is null then
    raise exception 'Sessao de bipagem aberta com loja selecionada nao encontrada.';
  end if;

  update public.sessoes_bipagem
  set status = 'cancelada',
      finalizada_em = null,
      cancelada_em = v_cancelada_em
  where id = p_sessao_id
    and user_id = v_user_id
    and loja_id = v_loja_id
    and status = 'aberta';

  update public.itens_sessao_bipagem
  set status = 'descartado', duplicado = false
  where sessao_id = p_sessao_id
    and user_id = v_user_id
    and status = 'pendente';

  return jsonb_build_object(
    'sessao_id', p_sessao_id,
    'cancelada_em', v_cancelada_em
  );
end;
$$;

create or replace function public.finalizar_cancelamentos_lote(
  p_cancelamentos jsonb
)
returns setof public.pacotes_cancelados
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := public.exigir_usuario_autenticado();
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

  for v_item in select value from jsonb_array_elements(p_cancelamentos)
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

    select * into v_pacote
    from public.pacotes
    where id = v_pacote_id and user_id = v_user_id
    for update;

    if not found or v_pacote.loja_id is null then
      raise exception 'Pacote % com loja valida nao encontrado.', v_pacote_id;
    end if;
    if lower(btrim(v_pacote.status)) = 'cancelado' then
      raise exception 'Pacote % ja esta cancelado.', v_pacote.codigo;
    end if;

    update public.pacotes
    set status = 'cancelado', cancelado_em = v_cancelado_em
    where id = v_pacote.id
      and user_id = v_user_id
      and loja_id = v_pacote.loja_id;

    insert into public.pacotes_cancelados (
      user_id,
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
    ) values (
      v_user_id,
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
    ) returning * into v_cancelamento;

    insert into public.movimentacoes (
      user_id,
      pacote_id,
      loja_id,
      sessao_id,
      tipo_movimentacao,
      descricao,
      criada_em
    ) values (
      v_user_id,
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

-- RLS é a fronteira de segurança; filtros no TypeScript são defesa adicional.
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
      'create policy %I on public.%I for select to authenticated using (user_id = auth.uid())',
      v_table || '_select_own', v_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())',
      v_table || '_insert_own', v_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      v_table || '_update_own', v_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())',
      v_table || '_delete_own', v_table
    );
  end loop;
end;
$$;

-- A chave pública pode autenticar, mas o papel anon não acessa dados nem RPCs.
revoke all on table
  public.lojas,
  public.marketplaces,
  public.transportadoras,
  public.relatorio_destinatarios,
  public.relatorio_envios,
  public.sessoes_bipagem,
  public.itens_sessao_bipagem,
  public.pacotes,
  public.movimentacoes,
  public.pacotes_cancelados
from anon;

grant select, insert, update, delete on table
  public.lojas,
  public.marketplaces,
  public.transportadoras,
  public.relatorio_destinatarios,
  public.relatorio_envios,
  public.sessoes_bipagem,
  public.itens_sessao_bipagem,
  public.pacotes,
  public.movimentacoes,
  public.pacotes_cancelados
to authenticated;

revoke execute on function public.exigir_usuario_autenticado() from public, anon;
revoke execute on function public.gerar_codigo_lote(timestamptz) from public, anon;
revoke execute on function public.recalcular_duplicados_sessao_bipagem(uuid) from public, anon;
revoke execute on function public.adicionar_item_sessao_bipagem(text, uuid) from public, anon;
revoke execute on function public.remover_item_sessao_bipagem(uuid, text) from public, anon;
revoke execute on function public.finalizar_sessao_bipagem(uuid) from public, anon;
revoke execute on function public.cancelar_sessao_bipagem(uuid) from public, anon;
revoke execute on function public.finalizar_cancelamentos_lote(jsonb) from public, anon;

grant execute on function public.exigir_usuario_autenticado() to authenticated;
grant execute on function public.gerar_codigo_lote(timestamptz) to authenticated;
grant execute on function public.recalcular_duplicados_sessao_bipagem(uuid) to authenticated;
grant execute on function public.adicionar_item_sessao_bipagem(text, uuid) to authenticated;
grant execute on function public.remover_item_sessao_bipagem(uuid, text) to authenticated;
grant execute on function public.finalizar_sessao_bipagem(uuid) to authenticated;
grant execute on function public.cancelar_sessao_bipagem(uuid) to authenticated;
grant execute on function public.finalizar_cancelamentos_lote(jsonb) to authenticated;

commit;
