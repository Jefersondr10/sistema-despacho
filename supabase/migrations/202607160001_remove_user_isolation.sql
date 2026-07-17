-- Rollback definitivo do isolamento por usuario para a primeira versao do sistema.
--
-- ATENCAO DE SEGURANCA: esta versao concede acesso de leitura e escrita ao papel
-- anon do Supabase. A aplicacao NAO deve ser exposta publicamente sem uma camada
-- externa de protecao (rede privada, proxy autenticado ou mecanismo equivalente).
-- A separacao operacional dos dados e feita exclusivamente por loja_id.

begin;

-- Remove todas as politicas das tabelas afetadas antes de eliminar a coluna.
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
      where schemaname = 'public'
        and tablename = v_table
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        v_policy.policyname,
        v_table
      );
    end loop;

    execute format('alter table public.%I disable row level security', v_table);
  end loop;
end;
$$;

drop function if exists public.exigir_usuario_autenticado();

-- Defaults, constraints e indices que dependem da coluna sao removidos de
-- forma generica. Nenhuma linha das tabelas e apagada ou recriada.
do $$
declare
  v_table text;
  v_constraint record;
  v_index record;
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
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'user_id'
    ) then
      execute format(
        'alter table public.%I alter column user_id drop default',
        v_table
      );

      for v_constraint in
        select constraint_name
        from information_schema.constraint_column_usage
        where table_schema = 'public'
          and table_name = v_table
          and column_name = 'user_id'
      loop
        execute format(
          'alter table public.%I drop constraint if exists %I',
          v_table,
          v_constraint.constraint_name
        );
      end loop;

      for v_index in
        select distinct index_class.relname as index_name
        from pg_index index_definition
        join pg_class table_class
          on table_class.oid = index_definition.indrelid
        join pg_namespace table_namespace
          on table_namespace.oid = table_class.relnamespace
        join pg_class index_class
          on index_class.oid = index_definition.indexrelid
        join pg_attribute table_attribute
          on table_attribute.attrelid = table_class.oid
         and table_attribute.attnum = any(index_definition.indkey)
        where table_namespace.nspname = 'public'
          and table_class.relname = v_table
          and table_attribute.attname = 'user_id'
      loop
        execute format('drop index if exists public.%I', v_index.index_name);
      end loop;

      execute format(
        'alter table public.%I drop column if exists user_id cascade',
        v_table
      );
    end if;
  end loop;
end;
$$;

-- A antiga migration permitia valores repetidos entre proprietarios. Para
-- restaurar a unicidade sem apagar registros, apenas os slugs/codigos visuais
-- repetidos recebem um sufixo estavel baseado no proprio id.
with ranked as (
  select id, row_number() over (partition by lower(slug) order by created_at, id) as position
  from public.lojas
)
update public.lojas target
set slug = target.slug || '-' || substr(replace(target.id::text, '-', ''), 1, 8)
from ranked
where ranked.id = target.id
  and ranked.position > 1;

with ranked as (
  select id, row_number() over (partition by lower(slug) order by created_at, id) as position
  from public.marketplaces
)
update public.marketplaces target
set slug = target.slug || '-' || substr(replace(target.id::text, '-', ''), 1, 8)
from ranked
where ranked.id = target.id
  and ranked.position > 1;

with ranked as (
  select id, row_number() over (partition by lower(slug) order by created_at, id) as position
  from public.transportadoras
)
update public.transportadoras target
set slug = target.slug || '-' || substr(replace(target.id::text, '-', ''), 1, 8)
from ranked
where ranked.id = target.id
  and ranked.position > 1;

with ranked as (
  select id, row_number() over (partition by lower(email) order by created_at, id) as position
  from public.relatorio_destinatarios
), duplicate_emails as (
  select target.id,
    case
      when strpos(target.email, '@') > 1 then
        split_part(target.email, '@', 1)
        || '+migrado-'
        || substr(replace(target.id::text, '-', ''), 1, 8)
        || '@'
        || split_part(target.email, '@', 2)
      else
        target.email || '+migrado-' || substr(replace(target.id::text, '-', ''), 1, 8)
    end as email
  from public.relatorio_destinatarios target
  join ranked on ranked.id = target.id
  where ranked.position > 1
)
update public.relatorio_destinatarios target
set email = duplicate_emails.email
from duplicate_emails
where duplicate_emails.id = target.id;

with ranked as (
  select id,
    row_number() over (partition by upper(btrim(codigo_lote)) order by iniciada_em, id) as position
  from public.sessoes_bipagem
  where codigo_lote is not null
    and btrim(codigo_lote) <> ''
)
update public.sessoes_bipagem target
set codigo_lote = upper(btrim(target.codigo_lote))
  || '-'
  || substr(replace(target.id::text, '-', ''), 1, 8)
from ranked
where ranked.id = target.id
  and ranked.position > 1;

alter table public.lojas drop constraint if exists lojas_slug_key;
alter table public.marketplaces drop constraint if exists marketplaces_slug_key;
alter table public.transportadoras drop constraint if exists transportadoras_slug_key;
alter table public.relatorio_destinatarios
  drop constraint if exists relatorio_destinatarios_email_key;
alter table public.sessoes_bipagem
  drop constraint if exists sessoes_bipagem_codigo_lote_key;

drop index if exists public.idx_lojas_user_slug;
drop index if exists public.idx_marketplaces_user_slug;
drop index if exists public.idx_transportadoras_user_slug;
drop index if exists public.idx_relatorio_destinatarios_user_email_lower;
drop index if exists public.idx_pacotes_user_loja_codigo_ativos;
drop index if exists public.idx_sessoes_bipagem_user_codigo_lote;
drop index if exists public.idx_pacotes_codigo_normalizado;
drop index if exists public.idx_pacotes_codigo_normalizado_ativos;
drop index if exists public.idx_relatorio_destinatarios_email_lower;
drop index if exists public.idx_sessoes_bipagem_codigo_lote;

create unique index idx_lojas_slug
  on public.lojas (lower(slug));
create unique index idx_marketplaces_slug
  on public.marketplaces (lower(slug));
create unique index idx_transportadoras_slug
  on public.transportadoras (lower(slug));
create unique index idx_relatorio_destinatarios_email_lower
  on public.relatorio_destinatarios (lower(email));
create unique index idx_sessoes_bipagem_codigo_lote
  on public.sessoes_bipagem (upper(btrim(codigo_lote)))
  where codigo_lote is not null and btrim(codigo_lote) <> '';
create unique index idx_pacotes_loja_codigo_normalizado_ativos
  on public.pacotes (
    loja_id,
    upper(regexp_replace(codigo, '\s+', '', 'g'))
  )
  where status <> 'cancelado';

-- Mantem as duas lojas operacionais da primeira versao sem duplicar registros.
insert into public.lojas (nome, slug)
select 'Brasília', 'brasilia'
where not exists (
  select 1 from public.lojas where lower(slug) = 'brasilia'
);

insert into public.lojas (nome, slug)
select 'São Paulo', 'sao-paulo'
where not exists (
  select 1 from public.lojas where lower(slug) = 'sao-paulo'
);

create or replace function public.set_codigo_lote_sessao_bipagem()
returns trigger
language plpgsql
set search_path = public
as $$
begin
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
  for each row
  execute function public.set_codigo_lote_sessao_bipagem();

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
  v_loja_id uuid;
  v_codigo_normalizado text;
  v_ordem integer;
begin
  select status, loja_id
    into v_sessao_status, v_loja_id
  from public.sessoes_bipagem
  where id = p_sessao_id
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
   and pacote.loja_id = v_sessao.loja_id
   and pacote.status <> 'cancelado'
  where item.sessao_id = p_sessao_id
    and item.status = 'pendente'
  limit 1;

  if v_codigo_existente is not null then
    raise exception 'Pacote % ja foi bipado nesta loja.', v_codigo_existente;
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
    and pacote.loja_id = v_sessao.loja_id
    and not exists (
      select 1
      from public.movimentacoes movimentacao
      where movimentacao.pacote_id = pacote.id
        and movimentacao.loja_id = v_sessao.loja_id
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
  where id = p_sessao_id
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
set search_path = public
as $$
declare
  v_loja_id uuid;
  v_cancelada_em timestamptz := now();
begin
  select loja_id
    into v_loja_id
  from public.sessoes_bipagem
  where id = p_sessao_id
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
    and loja_id = v_loja_id
    and status = 'aberta';

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

    if not found or v_pacote.loja_id is null then
      raise exception 'Pacote % com loja valida nao encontrado.', v_pacote_id;
    end if;

    if lower(btrim(v_pacote.status)) = 'cancelado' then
      raise exception 'Pacote % ja esta cancelado.', v_pacote.codigo;
    end if;

    update public.pacotes
    set status = 'cancelado',
        cancelado_em = v_cancelado_em
    where id = v_pacote.id
      and loja_id = v_pacote.loja_id;

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

-- Garante que toda escrita operacional mantenha a loja da entidade de origem.
create or replace function public.validar_loja_pacote()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.loja_id is null then
    raise exception 'loja_id obrigatorio em pacotes.';
  end if;

  if new.sessao_id is not null and not exists (
    select 1
    from public.sessoes_bipagem sessao
    where sessao.id = new.sessao_id
      and sessao.loja_id = new.loja_id
  ) then
    raise exception 'A loja do pacote deve ser a mesma loja da sessao.';
  end if;

  return new;
end;
$$;

create or replace function public.validar_loja_movimentacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.loja_id is null then
    raise exception 'loja_id obrigatorio em movimentacoes.';
  end if;

  if new.pacote_id is not null and not exists (
    select 1 from public.pacotes pacote
    where pacote.id = new.pacote_id
      and pacote.loja_id = new.loja_id
  ) then
    raise exception 'A loja da movimentacao deve ser a mesma loja do pacote.';
  end if;

  if new.sessao_id is not null and not exists (
    select 1 from public.sessoes_bipagem sessao
    where sessao.id = new.sessao_id
      and sessao.loja_id = new.loja_id
  ) then
    raise exception 'A loja da movimentacao deve ser a mesma loja da sessao.';
  end if;

  return new;
end;
$$;

create or replace function public.validar_loja_cancelamento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.loja_id is null then
    raise exception 'loja_id obrigatorio em pacotes_cancelados.';
  end if;

  if new.pacote_id is not null and not exists (
    select 1 from public.pacotes pacote
    where pacote.id = new.pacote_id
      and pacote.loja_id = new.loja_id
  ) then
    raise exception 'A loja do cancelamento deve ser a mesma loja do pacote.';
  end if;

  if new.sessao_id is not null and not exists (
    select 1 from public.sessoes_bipagem sessao
    where sessao.id = new.sessao_id
      and sessao.loja_id = new.loja_id
  ) then
    raise exception 'A loja do cancelamento deve ser a mesma loja da sessao.';
  end if;

  return new;
end;
$$;

drop trigger if exists validar_loja_pacote on public.pacotes;
create trigger validar_loja_pacote
  before insert or update of loja_id, sessao_id on public.pacotes
  for each row execute function public.validar_loja_pacote();

drop trigger if exists validar_loja_movimentacao on public.movimentacoes;
create trigger validar_loja_movimentacao
  before insert or update of loja_id, pacote_id, sessao_id on public.movimentacoes
  for each row execute function public.validar_loja_movimentacao();

drop trigger if exists validar_loja_cancelamento on public.pacotes_cancelados;
create trigger validar_loja_cancelamento
  before insert or update of loja_id, pacote_id, sessao_id on public.pacotes_cancelados
  for each row execute function public.validar_loja_cancelamento();

grant usage on schema public to anon, authenticated;
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
to anon, authenticated;

revoke execute on function public.adicionar_item_sessao_bipagem(text, uuid) from public;
revoke execute on function public.remover_item_sessao_bipagem(uuid, text) from public;
revoke execute on function public.finalizar_sessao_bipagem(uuid) from public;
revoke execute on function public.cancelar_sessao_bipagem(uuid) from public;
revoke execute on function public.finalizar_cancelamentos_lote(jsonb) from public;

grant execute on function public.adicionar_item_sessao_bipagem(text, uuid)
  to anon, authenticated;
grant execute on function public.remover_item_sessao_bipagem(uuid, text)
  to anon, authenticated;
grant execute on function public.finalizar_sessao_bipagem(uuid)
  to anon, authenticated;
grant execute on function public.cancelar_sessao_bipagem(uuid)
  to anon, authenticated;
grant execute on function public.finalizar_cancelamentos_lote(jsonb)
  to anon, authenticated;

commit;
