\set ON_ERROR_STOP on
-- Executar como administrador em homologacao ou ambiente controlado.
-- Dados sinteticos e auditorias sao sempre revertidos ao final.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '1s';
select member.user_id::text as owner_id
from public.account_members member
where member.role = 'owner' and member.status = 'active' and member.selected
  and exists (select 1 from public.lojas where user_id = member.account_id and ativo)
  and exists (select 1 from public.marketplaces where user_id = member.account_id and ativo)
order by member.created_at limit 1
\gset
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $test$
declare
  account uuid := public.current_account_id();
  store_id uuid;
  market_id uuid;
  first_session public.sessoes_bipagem%rowtype;
  second_session public.sessoes_bipagem%rowtype;
  scan_code text := 'TBR' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS');
  result jsonb;
begin
  select id into strict store_id from public.lojas where user_id=account and ativo limit 1;
  select id into strict market_id from public.marketplaces where user_id=account and ativo limit 1;
  select * into strict first_session from public.iniciar_sessao_bipagem_independente(
    gen_random_uuid(), store_id, market_id, 'postagem', false, null, now());
  select * into strict second_session from public.iniciar_sessao_bipagem_independente(
    gen_random_uuid(), store_id, market_id, 'postagem', false, null, now());
  perform public.adicionar_item_sessao_bipagem_v3(lower(scan_code), first_session.id);
  begin
    perform public.adicionar_item_sessao_bipagem_v3(scan_code, second_session.id);
    raise exception 'EXPECTED_OPEN_DUPLICATE';
  exception when others then
    if sqlerrm not ilike '%duplicado%' then raise; end if;
  end;
  begin
    perform public.adicionar_item_sessao_bipagem_v3('35190830290856000160550010000000011000000010', second_session.id);
    raise exception 'EXPECTED_NFE_REJECTION';
  exception when others then
    if sqlerrm not ilike '%fiscal%' and sqlerrm not ilike '%NF-e%' then raise; end if;
  end;
  result := public.finalizar_sessao_bipagem(first_session.id);
  if (result->>'total_pacotes')::int <> 1 then raise exception 'TOTAL_INCORRETO'; end if;
  if not exists (select 1 from public.pacotes
    where sessao_id=first_session.id and codigo=scan_code and codigo_normalizado=scan_code
      and bipado_por=auth.uid() and finalizado_por=auth.uid() and status='finalizado') then
    raise exception 'NORMALIZACAO_OU_AUDITORIA_INCORRETA';
  end if;
  if (select count(*) from public.movimentacoes where sessao_id=first_session.id) <> 1 then
    raise exception 'MOVIMENTACAO_INCORRETA';
  end if;
  begin
    perform public.adicionar_item_sessao_bipagem_v3(lower(scan_code), second_session.id);
    raise exception 'EXPECTED_FINALIZED_DUPLICATE';
  exception when others then
    if sqlerrm not ilike '%duplicado%' then raise; end if;
  end;
end;
$test$;
rollback;
select 'FINALIZE_NORMALIZATION_DUPLICATES_NFE_AUDIT_OK' as result;
