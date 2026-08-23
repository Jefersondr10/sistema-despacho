begin;

-- Cada navegador/aparelho mantém o próprio lote aberto. O escopo continua
-- sendo a conta autenticada; estacao_id é apenas uma identidade operacional.
alter table public.sessoes_bipagem
  add column if not exists estacao_id uuid;

comment on column public.sessoes_bipagem.estacao_id is
  'Identidade persistente do aparelho que abriu o lote, sempre combinada com user_id.';

create unique index if not exists idx_sessoes_bipagem_user_estacao_aberta
  on public.sessoes_bipagem (user_id, estacao_id)
  where status = 'aberta' and estacao_id is not null;

create index if not exists idx_itens_sessao_bipagem_user_codigo_pendentes
  on public.itens_sessao_bipagem (user_id, codigo_normalizado, sessao_id)
  where status = 'pendente';

-- Restaura somente o lote deste aparelho. Na primeira abertura após o rollout,
-- uma única sessão legada sem estação pode ser reivindicada sem perder dados.
create or replace function public.obter_sessao_bipagem_aberta(
  p_estacao_id uuid
)
returns setof public.sessoes_bipagem
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := public.exigir_usuario_autenticado();
  v_sessao public.sessoes_bipagem%rowtype;
  v_legacy_open_count integer;
begin
  if p_estacao_id is null then
    raise exception 'estacao_id obrigatorio.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'bipagem-estacao:' || v_user_id::text || ':' || p_estacao_id::text,
      0
    )
  );

  select sessao.*
    into v_sessao
  from public.sessoes_bipagem as sessao
  where sessao.user_id = v_user_id
    and sessao.estacao_id = p_estacao_id
    and sessao.status = 'aberta'
  order by sessao.iniciada_em desc
  limit 1
  for update;

  if not found then
    -- O lock da conta impede duas estações de reivindicarem simultaneamente o
    -- único lote legado. Com mais de um lote legado não fazemos escolha
    -- silenciosa; eles continuam intactos para recuperação administrativa.
    perform pg_advisory_xact_lock(
      hashtextextended('bipagem-legado:' || v_user_id::text, 0)
    );

    select count(*)
      into v_legacy_open_count
    from public.sessoes_bipagem as sessao
    where sessao.user_id = v_user_id
      and sessao.estacao_id is null
      and sessao.status = 'aberta';

    if v_legacy_open_count <> 1 then
      return;
    end if;

    select sessao.*
      into v_sessao
    from public.sessoes_bipagem as sessao
    where sessao.user_id = v_user_id
      and sessao.estacao_id is null
      and sessao.status = 'aberta'
    order by sessao.iniciada_em desc
    limit 1
    for update skip locked;

    if found then
      update public.sessoes_bipagem as sessao
      set estacao_id = p_estacao_id
      where sessao.id = v_sessao.id
        and sessao.user_id = v_user_id
        and sessao.estacao_id is null
        and sessao.status = 'aberta'
      returning sessao.* into v_sessao;
    end if;
  end if;

  if v_sessao.id is null then
    return;
  end if;

  return next v_sessao;
  return;
end;
$$;

-- A criação é serializada apenas por conta+aparelho. Dois aparelhos podem
-- iniciar, em paralelo, lotes distintos com a mesma loja e marketplace.
create or replace function public.iniciar_sessao_bipagem_independente(
  p_estacao_id uuid,
  p_loja_id uuid,
  p_marketplace_id uuid,
  p_tipo_operacao text,
  p_melhor_envio boolean,
  p_transportadora_id uuid,
  p_iniciada_em timestamptz
)
returns setof public.sessoes_bipagem
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := public.exigir_usuario_autenticado();
  v_sessao public.sessoes_bipagem%rowtype;
begin
  if p_estacao_id is null then
    raise exception 'estacao_id obrigatorio.';
  end if;
  if p_loja_id is null then
    raise exception 'loja_id obrigatorio.';
  end if;
  if p_marketplace_id is null then
    raise exception 'marketplace_id obrigatorio.';
  end if;
  if p_tipo_operacao not in ('coleta', 'postagem') then
    raise exception 'tipo_operacao invalido.';
  end if;
  if coalesce(p_melhor_envio, false) and p_transportadora_id is null then
    raise exception 'transportadora_id obrigatorio para Melhor Envio.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'bipagem-estacao:' || v_user_id::text || ':' || p_estacao_id::text,
      0
    )
  );

  select sessao.*
    into v_sessao
  from public.sessoes_bipagem as sessao
  where sessao.user_id = v_user_id
    and sessao.estacao_id = p_estacao_id
    and sessao.status = 'aberta'
  order by sessao.iniciada_em desc
  limit 1
  for update;

  if found then
    if v_sessao.loja_id is distinct from p_loja_id
      or v_sessao.marketplace_id is distinct from p_marketplace_id
      or v_sessao.tipo_operacao is distinct from p_tipo_operacao
      or v_sessao.melhor_envio is distinct from coalesce(p_melhor_envio, false)
      or v_sessao.transportadora_id is distinct from p_transportadora_id
    then
      raise exception 'Este aparelho já possui outro lote aberto. Recarregue a bipagem.';
    end if;

    return next v_sessao;
    return;
  end if;

  insert into public.sessoes_bipagem (
    user_id,
    estacao_id,
    loja_id,
    marketplace_id,
    tipo_operacao,
    melhor_envio,
    transportadora_id,
    status,
    iniciada_em
  ) values (
    v_user_id,
    p_estacao_id,
    p_loja_id,
    p_marketplace_id,
    p_tipo_operacao,
    coalesce(p_melhor_envio, false),
    p_transportadora_id,
    'aberta',
    coalesce(p_iniciada_em, now())
  )
  returning * into v_sessao;

  return next v_sessao;
  return;
end;
$$;

-- A v3 protege o mesmo rastreio entre lotes concorrentes. A trava é estreita
-- (conta+loja+código), então códigos diferentes continuam em paralelo.
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
      'bipagem-codigo:' || v_user_id::text || ':' || v_loja_id::text || ':' || v_codigo_normalizado,
      0
    )
  );

  -- As duas verificações compartilham o mesmo snapshot. Assim, se outro lote
  -- for finalizado exatamente durante esta leitura, enxergamos o item ainda
  -- pendente ou o pacote já finalizado, sem uma janela entre dois statements.
  select
    exists (
      select 1
      from public.pacotes as pacote
      where pacote.user_id = v_user_id
        and pacote.loja_id = v_loja_id
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
        and outra_sessao.loja_id = v_loja_id
        and outra_sessao.id <> p_sessao_id
    )
  into v_pacote_finalizado, v_outro_lote_aberto;

  if v_pacote_finalizado then
    raise exception 'Pacote duplicado: este codigo ja foi finalizado nesta loja.';
  end if;

  if v_outro_lote_aberto then
    raise exception 'Pacote duplicado: este codigo ja esta em outro lote aberto desta loja.';
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

-- Clientes que já estavam abertos durante o rollout ainda chamam a v2. Ela é
-- redirecionada para a v3 para receber a mesma proteção entre lotes.
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

-- Um pacote vinculado ao lote deve herdar simultaneamente conta, loja e
-- marketplace da sessão. Isso impede romaneios silenciosamente misturados.
create or replace function public.validar_identidade_pacote()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.user_id is null then
    raise exception 'user_id obrigatorio em pacotes.';
  end if;
  if new.loja_id is null then
    raise exception 'loja_id obrigatorio em pacotes.';
  end if;
  if new.marketplace_id is null then
    raise exception 'marketplace_id obrigatorio em pacotes.';
  end if;

  if new.sessao_id is not null and not exists (
    select 1
    from public.sessoes_bipagem as sessao
    where sessao.id = new.sessao_id
      and sessao.user_id = new.user_id
      and sessao.loja_id = new.loja_id
      and sessao.marketplace_id is not distinct from new.marketplace_id
  ) then
    raise exception 'Conta, loja e marketplace do pacote devem ser os mesmos da sessao.';
  end if;

  return new;
end;
$$;

drop trigger if exists validar_loja_pacote on public.pacotes;
drop trigger if exists validar_identidade_pacote on public.pacotes;
create trigger validar_identidade_pacote
  before insert or update of user_id, loja_id, marketplace_id, sessao_id
  on public.pacotes
  for each row execute function public.validar_identidade_pacote();

revoke execute on function public.obter_sessao_bipagem_aberta(uuid)
  from public, anon;
revoke execute on function public.iniciar_sessao_bipagem_independente(
  uuid, uuid, uuid, text, boolean, uuid, timestamptz
) from public, anon;
revoke execute on function public.adicionar_item_sessao_bipagem_v3(text, uuid)
  from public, anon;

grant execute on function public.obter_sessao_bipagem_aberta(uuid)
  to authenticated;
grant execute on function public.iniciar_sessao_bipagem_independente(
  uuid, uuid, uuid, text, boolean, uuid, timestamptz
) to authenticated;
grant execute on function public.adicionar_item_sessao_bipagem_v3(text, uuid)
  to authenticated;

commit;
