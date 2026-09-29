\set ON_ERROR_STOP on
-- Integração real, isolada em transação: não deixa lotes, pacotes ou auditorias.
begin;

select member.user_id::text as owner_id
from public.account_members as member
where member.role = 'owner'
  and member.status = 'active'
  and exists (select 1 from public.lojas where user_id = member.account_id and ativo)
  and exists (select 1 from public.marketplaces where user_id = member.account_id and ativo)
  and exists (select 1 from public.transportadoras where user_id = member.account_id and ativo)
order by member.created_at
limit 1
\gset

select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $test$
declare
  account uuid := public.current_account_id();
  store_id uuid;
  marketplace_id uuid;
  carrier_id uuid;
  carrier_name text;
  session public.sessoes_bipagem%rowtype;
  resumed public.sessoes_bipagem%rowtype;
  station uuid;
  selected_carrier uuid;
  better_shipping boolean;
  scan_prefix text := 'TBR' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS');
  scan_code text;
  dashboard jsonb;
  summary_count integer;
begin
  select id into strict store_id from public.lojas
    where user_id = account and ativo order by created_at limit 1;
  select id into strict marketplace_id from public.marketplaces
    where user_id = account and ativo order by created_at limit 1;
  select id, nome into strict carrier_id, carrier_name from public.transportadoras
    where user_id = account and ativo order by created_at limit 1;

  for variant in 1..3 loop
    better_shipping := variant = 3;
    selected_carrier := case when variant = 2 then null else carrier_id end;
    station := gen_random_uuid();
    scan_code := scan_prefix || variant::text;

    select * into strict session from public.iniciar_sessao_bipagem_independente(
      station, store_id, marketplace_id, 'postagem', better_shipping, selected_carrier, now()
    );
    if session.transportadora_id is distinct from selected_carrier
      or session.melhor_envio is distinct from better_shipping then
      raise exception 'A configuração da sessão não preservou a transportadora.';
    end if;

    -- Reabrir a sessão do mesmo aparelho deve preservar a configuração.
    select * into strict resumed from public.iniciar_sessao_bipagem_independente(
      station, store_id, marketplace_id, 'postagem', better_shipping, selected_carrier, now()
    );
    if resumed.id <> session.id or resumed.transportadora_id is distinct from selected_carrier then
      raise exception 'Retomar sessão perdeu a transportadora.';
    end if;

    perform public.adicionar_item_sessao_bipagem_v3(scan_code, session.id);
    perform public.finalizar_sessao_bipagem(session.id);

    if not exists (
      select 1 from public.pacotes
      where sessao_id = session.id and codigo = scan_code
        and transportadora_id is not distinct from selected_carrier
        and melhor_envio = better_shipping and status = 'finalizado'
    ) then
      raise exception 'Finalizar lote perdeu a transportadora ou falhou.';
    end if;
  end loop;

  dashboard := public.obter_dashboard_despacho(p_busca => scan_prefix);
  if (dashboard->'metricas'->>'total')::int <> 3
    or (dashboard->'metricas'->>'melhorEnvio')::int <> 1
    or (dashboard->'metricas'->>'semTransportadora')::int <> 1 then
    raise exception 'Métricas divergentes no dashboard: %', dashboard->'metricas';
  end if;
  if jsonb_array_length(dashboard->'resumo') <> 3 then
    raise exception 'Resumo misturou transportadora opcional com ausência de transportadora.';
  end if;
  select count(*) into summary_count
  from jsonb_array_elements(dashboard->'resumo') as item
  where item->>'transportadora' = carrier_name
    and (item->>'melhor_envio')::boolean = false
    and (item->>'packages')::int = 1;
  if summary_count <> 1 then
    raise exception 'Resumo omitiu transportadora quando Melhor Envio está desligado.';
  end if;

  dashboard := public.obter_dashboard_despacho(
    p_busca => scan_prefix, p_transportadora_ids => array[carrier_id],
    p_filtrar_transportadora => true, p_incluir_sem_transportadora => false,
    p_melhor_envio => false
  );
  if (dashboard->'metricas'->>'total')::int <> 1 then
    raise exception 'Filtro por transportadora sem Melhor Envio retornou resultado incorreto.';
  end if;

  -- A obrigação já existente continua válida quando Melhor Envio está ligado.
  begin
    perform public.iniciar_sessao_bipagem_independente(
      gen_random_uuid(), store_id, marketplace_id, 'postagem', true, null, now()
    );
    raise exception 'MISSING_REQUIRED_CARRIER';
  exception when others then
    if sqlerrm = 'MISSING_REQUIRED_CARRIER' or sqlerrm not ilike '%transportadora%' then
      raise;
    end if;
  end;
end;
$test$;

rollback;
select 'INDEPENDENT_CARRIER_RPC_OK' as result;
