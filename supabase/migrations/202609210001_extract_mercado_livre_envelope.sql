begin;

-- Algumas etiquetas do Mercado Livre entregam o rastreio em um QR JSON como
-- {"ID":"48055515323","T":"LM"}. Clientes antigos podem enviar o payload
-- inteiro. Esta funcao reconhece somente esse envelope estrito e preserva
-- qualquer outro JSON, URL ou codigo sem alteracao.
create or replace function public.extrair_codigo_envelope_mercado_livre(
  p_codigo text
)
returns text
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog, public
as $$
declare
  v_apresentacao text := btrim(p_codigo);
  v_payload json;
  v_id_count integer;
  v_type_count integer;
  v_id text;
  v_id_type text;
  v_type text;
  v_type_type text;
begin
  if left(v_apresentacao, 1) <> '{' then
    return p_codigo;
  end if;

  begin
    v_payload := v_apresentacao::json;
  exception when others then
    return p_codigo;
  end;

  if json_typeof(v_payload) <> 'object' then
    return p_codigo;
  end if;

  select
    count(*) filter (where lower(btrim(entry.key)) = 'id'),
    count(*) filter (where lower(btrim(entry.key)) = 't'),
    min(entry.value #>> '{}') filter (
      where lower(btrim(entry.key)) = 'id'
    ),
    min(json_typeof(entry.value)) filter (
      where lower(btrim(entry.key)) = 'id'
    ),
    min(entry.value #>> '{}') filter (
      where lower(btrim(entry.key)) = 't'
    ),
    min(json_typeof(entry.value)) filter (
      where lower(btrim(entry.key)) = 't'
    )
  into
    v_id_count,
    v_type_count,
    v_id,
    v_id_type,
    v_type,
    v_type_type
  from json_each(v_payload) as entry(key, value);

  if
    v_id_count <> 1
    or v_type_count <> 1
    or v_type_type <> 'string'
    or upper(btrim(v_type)) <> 'LM'
    or v_id_type not in ('string', 'number')
  then
    return p_codigo;
  end if;

  v_id := btrim(v_id);
  if
    char_length(v_id) not between 6 and 60
    or v_id !~ '^[A-Za-z0-9._/-]+$'
  then
    return p_codigo;
  end if;

  -- Numeros JSON passam pelo JavaScript nos clientes. Nao promovemos valores
  -- acima do maior inteiro seguro para impedir arredondamento silencioso.
  if v_id_type = 'number' then
    if
      v_id !~ '^(0|[1-9][0-9]*)$'
      or char_length(v_id) > 16
      or v_id::numeric > 9007199254740991
    then
      return p_codigo;
    end if;
  end if;

  return v_id;
end;
$$;

comment on function public.extrair_codigo_envelope_mercado_livre(text) is
  'Extrai somente o ID do envelope JSON estrito do Mercado Livre com T=LM.';

revoke execute on function public.extrair_codigo_envelope_mercado_livre(text)
from public, anon;
grant execute on function public.extrair_codigo_envelope_mercado_livre(text)
to authenticated, service_role;

-- O guard de NF-e precisa avaliar o ID extraido mesmo se o trigger rodar antes
-- do trigger de unicidade que persiste o codigo canonico.
create or replace function public.rejeitar_chave_nfe_como_rastreio()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_codigo text := public.extrair_codigo_envelope_mercado_livre(new.codigo);
  v_codigo_normalizado text := public.extrair_codigo_envelope_mercado_livre(
    v_new ->> 'codigo_normalizado'
  );
begin
  if not (
    coalesce(public.eh_chave_nfe_valida(v_codigo), false)
    or coalesce(
      public.eh_chave_nfe_valida(v_codigo_normalizado),
      false
    )
  ) then
    return new;
  end if;

  if
    tg_table_schema = 'public'
    and tg_table_name = 'pacotes'
    and tg_op = 'INSERT'
    and nullif(v_new ->> 'sessao_id', '') is not null
    and exists (
      select 1
      from public.itens_sessao_bipagem as item
      join public.sessoes_bipagem as sessao
        on sessao.id = item.sessao_id
       and sessao.user_id = item.user_id
      where item.user_id = (v_new ->> 'user_id')::uuid
        and item.sessao_id = (v_new ->> 'sessao_id')::uuid
        and item.status = 'pendente'
        and public.normalizar_codigo_pacote(
          public.extrair_codigo_envelope_mercado_livre(
            item.codigo_normalizado
          )
        ) = public.normalizar_codigo_pacote(v_codigo)
        and sessao.status = 'aberta'
        and sessao.loja_id = (v_new ->> 'loja_id')::uuid
        and sessao.marketplace_id is not distinct from
          nullif(v_new ->> 'marketplace_id', '')::uuid
        and sessao.transportadora_id is not distinct from
          nullif(v_new ->> 'transportadora_id', '')::uuid
        and sessao.tipo_operacao::text = (v_new ->> 'tipo_operacao')
        and sessao.melhor_envio is not distinct from
          (v_new ->> 'melhor_envio')::boolean
    )
  then
    return new;
  end if;

  raise exception using
    errcode = '22023',
    message = 'Leitura bloqueada: este codigo e uma chave de NF-e, nao um rastreio de pacote.';
end;
$$;

-- Escritas diretas e a RPC compartilham a mesma representacao canonica. As
-- comparacoes mantem as expressoes ja indexadas; nenhum historico, cancelamento
-- ou lote finalizado e reescrito por esta migration.
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

-- Esta e a definicao mais recente da RPC v3 (conta/equipe/auditoria), com a
-- canonizacao aplicada antes da trava e de todas as consultas de duplicidade.
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
        and public.normalizar_codigo_pacote(pacote.codigo) = v_codigo_normalizado
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
$$;

notify pgrst, 'reload schema';

commit;
