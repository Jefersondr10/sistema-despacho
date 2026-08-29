-- Consultas direcionadas para historicos grandes.
--
-- A migration pode ser aplicada antes do frontend: as funcoes existentes nao
-- sao alteradas. O frontend novo tambem mantem fallback para o carregamento
-- legado enquanto esta migration ainda nao estiver disponivel.

create index concurrently if not exists idx_pacotes_user_ativos_bipado_em
  on public.pacotes (user_id, bipado_em desc, id desc)
  where status <> 'cancelado';

create index concurrently if not exists idx_pacotes_user_loja_ativos_bipado_em
  on public.pacotes (user_id, loja_id, bipado_em desc, id desc)
  where status <> 'cancelado';

create index concurrently if not exists idx_pacotes_user_marketplace_ativos_bipado_em
  on public.pacotes (user_id, marketplace_id, bipado_em desc, id desc)
  where status <> 'cancelado';

create index concurrently if not exists idx_movimentacoes_user_pacote_criada_em
  on public.movimentacoes (user_id, pacote_id, criada_em desc);

create or replace function public.listar_pacotes_paginados_v2(
  p_data_inicio date default null,
  p_data_fim date default null,
  p_loja_ids uuid[] default null,
  p_marketplace_ids uuid[] default null,
  p_transportadora_ids uuid[] default null,
  p_incluir_sem_transportadora boolean default true,
  p_filtrar_transportadora boolean default false,
  p_melhor_envio boolean default null,
  p_tipo_operacao text default null,
  p_busca text default null,
  p_codigo_lote text default null,
  p_cursor_bipado_em timestamptz default null,
  p_cursor_id uuid default null,
  p_snapshot_at timestamptz default null,
  p_incluir_metricas boolean default true,
  p_limit integer default 100
)
returns table(
  id uuid,
  codigo text,
  loja_id uuid,
  loja_nome text,
  marketplace_id uuid,
  marketplace_nome text,
  transportadora_id uuid,
  transportadora_nome text,
  sessao_id uuid,
  codigo_lote text,
  tipo_operacao text,
  melhor_envio boolean,
  status text,
  bipado_em timestamptz,
  total_count bigint,
  melhor_envio_count bigint,
  pendentes_count bigint,
  has_more boolean,
  snapshot_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select
      coalesce(p_snapshot_at, statement_timestamp()) as snapshot_at,
      least(greatest(coalesce(p_limit, 100), 1), 100) as page_limit
  ), filtrados as not materialized (
    select
      pacote.id,
      pacote.codigo,
      pacote.loja_id,
      loja.nome as loja_nome,
      pacote.marketplace_id,
      marketplace.nome as marketplace_nome,
      pacote.transportadora_id,
      transportadora.nome as transportadora_nome,
      pacote.sessao_id,
      sessao.codigo_lote,
      pacote.tipo_operacao::text as tipo_operacao,
      pacote.melhor_envio,
      pacote.status::text as status,
      pacote.bipado_em
    from public.pacotes as pacote
    join public.lojas as loja
      on loja.id = pacote.loja_id
     and loja.user_id = pacote.user_id
    join public.marketplaces as marketplace
      on marketplace.id = pacote.marketplace_id
     and marketplace.user_id = pacote.user_id
    left join public.transportadoras as transportadora
      on transportadora.id = pacote.transportadora_id
     and transportadora.user_id = pacote.user_id
    left join public.sessoes_bipagem as sessao
      on sessao.id = pacote.sessao_id
     and sessao.user_id = pacote.user_id
    where pacote.user_id = (select auth.uid())
      and pacote.status <> 'cancelado'
      and coalesce(pacote.finalizado_em, pacote.bipado_em) <= (
        select limite.snapshot_at from limites as limite
      )
      and (
        p_data_inicio is null
        or pacote.bipado_em >= (
          p_data_inicio::timestamp at time zone 'America/Sao_Paulo'
        )
      )
      and (
        p_data_fim is null
        or pacote.bipado_em < (
          (p_data_fim + 1)::timestamp at time zone 'America/Sao_Paulo'
        )
      )
      and (p_loja_ids is null or pacote.loja_id = any(p_loja_ids))
      and (
        p_marketplace_ids is null
        or pacote.marketplace_id = any(p_marketplace_ids)
      )
      and (
        not coalesce(p_filtrar_transportadora, false)
        or pacote.transportadora_id = any(
          coalesce(p_transportadora_ids, array[]::uuid[])
        )
        or (
          coalesce(p_incluir_sem_transportadora, false)
          and pacote.transportadora_id is null
        )
      )
      and (
        p_melhor_envio is null
        or pacote.melhor_envio = p_melhor_envio
      )
      and (
        p_tipo_operacao is null
        or pacote.tipo_operacao::text = p_tipo_operacao
      )
      and (
        nullif(public.normalizar_codigo_pacote(p_busca), '') is null
        or position(
          public.normalizar_codigo_pacote(p_busca)
          in public.normalizar_codigo_pacote(pacote.codigo)
        ) > 0
      )
      and (
        nullif(public.normalizar_codigo_pacote(p_codigo_lote), '') is null
        or position(
          public.normalizar_codigo_pacote(p_codigo_lote)
          in public.normalizar_codigo_pacote(
            coalesce(sessao.codigo_lote, sessao.id::text, '')
          )
        ) > 0
      )
  ), metricas as (
    select
      case when p_incluir_metricas then count(*) else null::bigint end
        as total_count,
      case when p_incluir_metricas then
        count(*) filter (where filtrado.melhor_envio)
      else null::bigint end as melhor_envio_count,
      case when p_incluir_metricas then
        count(*) filter (where filtrado.status <> 'finalizado')
      else null::bigint end as pendentes_count
    from filtrados as filtrado
    where p_incluir_metricas
  ), candidatos as materialized (
    select filtrado.*
    from filtrados as filtrado
    where (
      p_cursor_bipado_em is null
      and p_cursor_id is null
    ) or (
      p_cursor_bipado_em is not null
      and p_cursor_id is not null
      and (filtrado.bipado_em, filtrado.id) < (p_cursor_bipado_em, p_cursor_id)
    )
    order by filtrado.bipado_em desc, filtrado.id desc
    limit (select limite.page_limit + 1 from limites as limite)
  ), pagina as (
    select candidato.*
    from candidatos as candidato
    order by candidato.bipado_em desc, candidato.id desc
    limit (select limite.page_limit from limites as limite)
  )
  select
    pagina.id,
    pagina.codigo,
    pagina.loja_id,
    pagina.loja_nome,
    pagina.marketplace_id,
    pagina.marketplace_nome,
    pagina.transportadora_id,
    pagina.transportadora_nome,
    pagina.sessao_id,
    pagina.codigo_lote,
    pagina.tipo_operacao,
    pagina.melhor_envio,
    pagina.status,
    pagina.bipado_em,
    metrica.total_count,
    metrica.melhor_envio_count,
    metrica.pendentes_count,
    (select count(*) from candidatos) > limite.page_limit as has_more,
    limite.snapshot_at
  from pagina
  cross join metricas as metrica
  cross join limites as limite
  order by pagina.bipado_em desc, pagina.id desc;
$$;

create or replace function public.obter_dashboard_despacho(
  p_data_inicio date default null,
  p_data_fim date default null,
  p_loja_ids uuid[] default null,
  p_marketplace_ids uuid[] default null,
  p_transportadora_ids uuid[] default null,
  p_incluir_sem_transportadora boolean default true,
  p_filtrar_transportadora boolean default false,
  p_melhor_envio boolean default null,
  p_tipo_operacao text default null,
  p_busca text default null,
  p_codigo_lote text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with filtrados as materialized (
    select
      pacote.id,
      pacote.codigo,
      pacote.loja_id,
      loja.nome as loja_nome,
      pacote.marketplace_id,
      marketplace.nome as marketplace_nome,
      pacote.transportadora_id,
      transportadora.nome as transportadora_nome,
      pacote.sessao_id,
      sessao.codigo_lote,
      pacote.tipo_operacao::text as tipo_operacao,
      pacote.melhor_envio,
      pacote.status::text as status,
      pacote.bipado_em
    from public.pacotes as pacote
    join public.lojas as loja
      on loja.id = pacote.loja_id
     and loja.user_id = pacote.user_id
    join public.marketplaces as marketplace
      on marketplace.id = pacote.marketplace_id
     and marketplace.user_id = pacote.user_id
    left join public.transportadoras as transportadora
      on transportadora.id = pacote.transportadora_id
     and transportadora.user_id = pacote.user_id
    left join public.sessoes_bipagem as sessao
      on sessao.id = pacote.sessao_id
     and sessao.user_id = pacote.user_id
    where pacote.user_id = (select auth.uid())
      and pacote.status <> 'cancelado'
      and (
        p_data_inicio is null
        or pacote.bipado_em >= (
          p_data_inicio::timestamp at time zone 'America/Sao_Paulo'
        )
      )
      and (
        p_data_fim is null
        or pacote.bipado_em < (
          (p_data_fim + 1)::timestamp at time zone 'America/Sao_Paulo'
        )
      )
      and (p_loja_ids is null or pacote.loja_id = any(p_loja_ids))
      and (
        p_marketplace_ids is null
        or pacote.marketplace_id = any(p_marketplace_ids)
      )
      and (
        not coalesce(p_filtrar_transportadora, false)
        or pacote.transportadora_id = any(
          coalesce(p_transportadora_ids, array[]::uuid[])
        )
        or (
          coalesce(p_incluir_sem_transportadora, false)
          and pacote.transportadora_id is null
        )
      )
      and (
        p_melhor_envio is null
        or pacote.melhor_envio = p_melhor_envio
      )
      and (
        p_tipo_operacao is null
        or pacote.tipo_operacao::text = p_tipo_operacao
      )
      and (
        nullif(public.normalizar_codigo_pacote(p_busca), '') is null
        or position(
          public.normalizar_codigo_pacote(p_busca)
          in public.normalizar_codigo_pacote(pacote.codigo)
        ) > 0
      )
      and (
        nullif(public.normalizar_codigo_pacote(p_codigo_lote), '') is null
        or position(
          public.normalizar_codigo_pacote(p_codigo_lote)
          in public.normalizar_codigo_pacote(
            coalesce(sessao.codigo_lote, sessao.id::text, '')
          )
        ) > 0
      )
  ), resumo_lojas as (
    select
      concat_ws(
        '|',
        marketplace_id::text,
        tipo_operacao,
        melhor_envio::text,
        coalesce(
          case when melhor_envio then transportadora_id::text end,
          ''
        )
      ) as grupo_id,
      loja_id,
      loja_nome,
      count(*) as pacotes
    from filtrados
    group by
      marketplace_id,
      tipo_operacao,
      melhor_envio,
      case when melhor_envio then transportadora_id::text end,
      loja_id,
      loja_nome
  ), resumo_grupos as (
    select
      concat_ws(
        '|',
        marketplace_id::text,
        tipo_operacao,
        melhor_envio::text,
        coalesce(
          case when melhor_envio then transportadora_id::text end,
          ''
        )
      ) as grupo_id,
      marketplace_nome,
      tipo_operacao,
      melhor_envio,
      case when melhor_envio then transportadora_nome end as transportadora_nome,
      count(*) as pacotes
    from filtrados
    group by
      marketplace_id,
      marketplace_nome,
      tipo_operacao,
      melhor_envio,
      case when melhor_envio then transportadora_id::text end,
      case when melhor_envio then transportadora_nome end
    order by
      marketplace_nome,
      tipo_operacao,
      melhor_envio,
      transportadora_nome nulls first
  )
  select jsonb_build_object(
    'metricas', jsonb_build_object(
      'total', (select count(*) from filtrados),
      'melhorEnvio', (
        select count(*) from filtrados where melhor_envio
      ),
      'semTransportadora', (
        select count(*) from filtrados where transportadora_id is null
      ),
      'pending', (
        select count(*) from filtrados where status <> 'finalizado'
      ),
      'coletas', (
        select count(*) from filtrados where tipo_operacao = 'coleta'
      ),
      'postagens', (
        select count(*) from filtrados where tipo_operacao = 'postagem'
      )
    ),
    'lojas', coalesce((
      select jsonb_agg(
        jsonb_build_object('loja_id', loja_id, 'pacotes', pacotes)
        order by loja_id
      )
      from (
        select loja_id, count(*) as pacotes
        from filtrados
        group by loja_id
      ) as totais_loja
    ), '[]'::jsonb),
    'resumo', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', grupo.grupo_id,
          'marketplace', grupo.marketplace_nome,
          'tipo_operacao', grupo.tipo_operacao,
          'melhor_envio', grupo.melhor_envio,
          'transportadora', grupo.transportadora_nome,
          'packages', grupo.pacotes,
          'lojas', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'loja_id', por_loja.loja_id,
                'loja_nome', por_loja.loja_nome,
                'packages', por_loja.pacotes
              )
              order by por_loja.pacotes desc, por_loja.loja_nome
            )
            from resumo_lojas as por_loja
            where por_loja.grupo_id = grupo.grupo_id
          ), '[]'::jsonb)
        )
        order by
          grupo.marketplace_nome,
          grupo.tipo_operacao,
          grupo.melhor_envio,
          grupo.transportadora_nome nulls first
      )
      from resumo_grupos as grupo
    ), '[]'::jsonb),
    'recentes', coalesce((
      select jsonb_agg(to_jsonb(recente) order by recente.bipado_em desc, recente.id desc)
      from (
        select
          filtrado.id,
          filtrado.codigo,
          filtrado.loja_id,
          filtrado.loja_nome,
          filtrado.marketplace_id,
          filtrado.marketplace_nome,
          filtrado.transportadora_id,
          filtrado.transportadora_nome,
          filtrado.sessao_id,
          filtrado.codigo_lote,
          filtrado.tipo_operacao,
          filtrado.melhor_envio,
          filtrado.status,
          filtrado.bipado_em
        from filtrados as filtrado
        order by filtrado.bipado_em desc, filtrado.id desc
        limit 6
      ) as recente
    ), '[]'::jsonb),
    'movement_count', (
      select count(*)
      from (
        select movimentacao.id
        from public.movimentacoes as movimentacao
        where movimentacao.user_id = (select auth.uid())
          and exists (
            select 1
            from filtrados as filtrado
            where filtrado.id = movimentacao.pacote_id
          )
        order by movimentacao.criada_em desc
        limit 5
      ) as movimentos_recentes
    )
  );
$$;

revoke all on function public.listar_pacotes_paginados_v2(
  date, date, uuid[], uuid[], uuid[], boolean, boolean, boolean, text, text,
  text, timestamptz, uuid, timestamptz, boolean, integer
) from public, anon;
grant execute on function public.listar_pacotes_paginados_v2(
  date, date, uuid[], uuid[], uuid[], boolean, boolean, boolean, text, text,
  text, timestamptz, uuid, timestamptz, boolean, integer
) to authenticated;

revoke all on function public.obter_dashboard_despacho(
  date, date, uuid[], uuid[], uuid[], boolean, boolean, boolean, text, text,
  text
) from public, anon;
grant execute on function public.obter_dashboard_despacho(
  date, date, uuid[], uuid[], uuid[], boolean, boolean, boolean, text, text,
  text
) to authenticated;
