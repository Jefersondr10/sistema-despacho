-- Um rastreio ativo pertence a uma unica loja/marketplace dentro da conta.
-- Contas diferentes continuam independentes e pacotes cancelados podem ser
-- bipados novamente. Duplicados legados nao sao apagados nem cancelados por
-- esta migration: enquanto existirem, a trigger impede novos duplicados e um
-- indice global nao unico sustenta as consultas. Ao corrigir os dados e aplicar
-- novamente a migration, o indice passa automaticamente a ser UNIQUE.

begin;

-- As triggers usam a mesma trava transacional das RPCs. Isso fecha tambem os
-- caminhos de escrita direta pelo PostgREST e serializa somente a combinacao
-- conta+codigo, sem misturar ou bloquear codigos iguais de contas distintas.
create or replace function public.validar_unicidade_rastreio_item_pendente()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
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

  v_codigo_normalizado := public.normalizar_codigo_pacote(new.codigo);
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
      and public.normalizar_codigo_pacote(pacote.codigo) = v_codigo_normalizado
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
$$;

drop trigger if exists validar_unicidade_rastreio_item_pendente
  on public.itens_sessao_bipagem;
create trigger validar_unicidade_rastreio_item_pendente
  before insert or update of user_id, sessao_id, codigo, codigo_normalizado, status
  on public.itens_sessao_bipagem
  for each row
  execute function public.validar_unicidade_rastreio_item_pendente();

create or replace function public.validar_unicidade_rastreio_pacote_ativo()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_codigo_normalizado text;
begin
  if new.status = 'cancelado' then
    return new;
  end if;

  if new.user_id is null then
    raise exception 'user_id obrigatorio em pacotes.';
  end if;

  v_codigo_normalizado := public.normalizar_codigo_pacote(new.codigo);
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
      and public.normalizar_codigo_pacote(pacote.codigo) = v_codigo_normalizado
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
$$;

drop trigger if exists validar_unicidade_rastreio_pacote_ativo
  on public.pacotes;
create trigger validar_unicidade_rastreio_pacote_ativo
  before insert or update of user_id, sessao_id, codigo, status
  on public.pacotes
  for each row
  execute function public.validar_unicidade_rastreio_pacote_ativo();

-- Busca global da conta para os clientes novos. A assinatura antiga tambem
-- consulta toda a conta, usando p_loja_id apenas para preferir a loja esperada
-- quando ainda houver mais de um pacote ativo legado com o mesmo codigo.
create or replace function public.buscar_pacote_ativo_global_normalizado(
  p_codigo text
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
    and public.normalizar_codigo_pacote(pacote.codigo) =
      public.normalizar_codigo_pacote(p_codigo)
    and pacote.status <> 'cancelado'
  order by pacote.bipado_em, pacote.id
  limit 1;
$$;

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
    and public.normalizar_codigo_pacote(pacote.codigo) =
      public.normalizar_codigo_pacote(p_codigo)
    and pacote.status <> 'cancelado'
  order by
    (pacote.loja_id = p_loja_id) desc nulls last,
    pacote.bipado_em,
    pacote.id
  limit 1;
$$;

-- A v3 rejeita imediatamente um codigo salvo ou pendente em qualquer loja e
-- marketplace da mesma conta. Repetir dentro da propria sessao continua sendo
-- permitido para que a interface marque e permita remover a leitura duplicada.
create or replace function public.adicionar_item_sessao_bipagem_v3(
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
  v_pacote_finalizado boolean;
  v_outro_lote_aberto boolean;
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
  if coalesce(v_codigo_normalizado, '') = '' then
    raise exception 'codigo obrigatorio.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'bipagem-codigo:' || v_user_id::text || ':' || v_codigo_normalizado,
      0
    )
  );

  select
    exists (
      select 1
      from public.pacotes as pacote
      where pacote.user_id = v_user_id
        and public.normalizar_codigo_pacote(pacote.codigo) = v_codigo_normalizado
        and pacote.status <> 'cancelado'
    ),
    exists (
      select 1
      from public.itens_sessao_bipagem as item
      join public.sessoes_bipagem as outra_sessao
        on outra_sessao.id = item.sessao_id
       and outra_sessao.user_id = item.user_id
      where item.user_id = v_user_id
        and item.codigo_normalizado = v_codigo_normalizado
        and item.status = 'pendente'
        and outra_sessao.status = 'aberta'
        and outra_sessao.id <> p_sessao_id
    )
  into v_pacote_finalizado, v_outro_lote_aberto;

  if v_pacote_finalizado then
    raise exception
      'Pacote duplicado: este codigo ja foi finalizado nesta conta.';
  end if;

  if v_outro_lote_aberto then
    raise exception
      'Pacote duplicado: este codigo ja esta em outro lote aberto desta conta.';
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

create or replace function public.adicionar_item_sessao_bipagem_v2(
  p_codigo text,
  p_sessao_id uuid
)
returns setof public.itens_sessao_bipagem
language sql
security invoker
set search_path = public
as $$
  select *
  from public.adicionar_item_sessao_bipagem_v3(p_codigo, p_sessao_id);
$$;

-- A finalizacao adquire as mesmas travas em ordem alfabetica. Assim duas
-- sessoes com varios codigos nunca invertem a ordem dos locks. Depois das
-- travas, a verificacao global produz uma mensagem clara; a trigger e o indice
-- continuam sendo a ultima linha de defesa contra qualquer outra escrita.
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
  v_codigo_lock text;
  v_finalizada_em timestamptz := now();
  v_codigo_lote text;
begin
  select * into v_sessao
  from public.sessoes_bipagem
  where id = p_sessao_id
    and user_id = v_user_id
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

  for v_codigo_lock in
    select distinct item.codigo_normalizado
    from public.itens_sessao_bipagem as item
    where item.sessao_id = p_sessao_id
      and item.user_id = v_user_id
      and item.status = 'pendente'
    order by item.codigo_normalizado
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'bipagem-codigo:' || v_user_id::text || ':' || v_codigo_lock,
        0
      )
    );
  end loop;

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
    raise exception 'Existem pacotes duplicados nesta sessao: %.',
      v_codigo_duplicado;
  end if;

  select item.codigo_normalizado into v_codigo_existente
  from public.itens_sessao_bipagem as item
  join public.pacotes as pacote
    on public.normalizar_codigo_pacote(pacote.codigo) = item.codigo_normalizado
   and pacote.status <> 'cancelado'
   and pacote.user_id = v_user_id
  where item.sessao_id = p_sessao_id
    and item.user_id = v_user_id
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
  from public.itens_sessao_bipagem as item
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
  from public.pacotes as pacote
  where pacote.sessao_id = p_sessao_id
    and pacote.user_id = v_user_id
    and pacote.loja_id = v_sessao.loja_id
    and not exists (
      select 1
      from public.movimentacoes as movimentacao
      where movimentacao.pacote_id = pacote.id
        and movimentacao.user_id = v_user_id
        and movimentacao.loja_id = v_sessao.loja_id
        and movimentacao.tipo_movimentacao = 'Bipagem'
    );

  update public.itens_sessao_bipagem
  set status = 'finalizado',
      duplicado = false
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

-- A trigger ja esta ativa antes de trocar o indice antigo. Se houver dados
-- legados duplicados, preservamos todos e instalamos o mesmo indice sem UNIQUE.
-- A reaplicacao promove o indice assim que os dados forem revisados.
drop index if exists public.idx_pacotes_user_codigo_ativos;

do $$
declare
  v_grupos_duplicados bigint;
begin
  select count(*)
    into v_grupos_duplicados
  from (
    select
      pacote.user_id,
      public.normalizar_codigo_pacote(pacote.codigo)
    from public.pacotes as pacote
    where pacote.status <> 'cancelado'
    group by
      pacote.user_id,
      public.normalizar_codigo_pacote(pacote.codigo)
    having count(*) > 1
  ) as grupos;

  if v_grupos_duplicados = 0 then
    create unique index idx_pacotes_user_codigo_ativos
      on public.pacotes (
        user_id,
        public.normalizar_codigo_pacote(codigo)
      )
      where status <> 'cancelado';
  else
    create index idx_pacotes_user_codigo_ativos
      on public.pacotes (
        user_id,
        public.normalizar_codigo_pacote(codigo)
      )
      where status <> 'cancelado';

    raise notice
      'Unicidade global: % grupo(s) legado(s) duplicado(s) foram preservados. A trigger impede novos duplicados; revise os dados e reaplique esta migration para promover o indice a UNIQUE.',
      v_grupos_duplicados;
  end if;
end;
$$;

drop index if exists public.idx_pacotes_user_loja_codigo_ativos;

-- Somente as RPCs de negocio ficam chamaveis pelo cliente autenticado. As
-- funcoes de trigger nao podem ser executadas diretamente pela API.
revoke execute on function
  public.validar_unicidade_rastreio_item_pendente()
from public, anon, authenticated;
revoke execute on function
  public.validar_unicidade_rastreio_pacote_ativo()
from public, anon, authenticated;

revoke execute on function
  public.buscar_pacote_ativo_global_normalizado(text),
  public.buscar_pacote_ativo_normalizado(text, uuid),
  public.adicionar_item_sessao_bipagem_v3(text, uuid),
  public.adicionar_item_sessao_bipagem_v2(text, uuid),
  public.finalizar_sessao_bipagem(uuid)
from public, anon;

grant execute on function
  public.buscar_pacote_ativo_global_normalizado(text),
  public.buscar_pacote_ativo_normalizado(text, uuid),
  public.adicionar_item_sessao_bipagem_v3(text, uuid),
  public.adicionar_item_sessao_bipagem_v2(text, uuid),
  public.finalizar_sessao_bipagem(uuid)
to authenticated;

commit;
