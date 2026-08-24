-- Impede que clientes antigos ou chamadas diretas gravem payloads inteiros de
-- QR, CEP ou PIX como se fossem o identificador de um pacote. O trigger atua
-- apenas quando o codigo e inserido ou alterado: registros legados continuam
-- podendo ser removidos, finalizados e ter a duplicidade corrigida.

alter table public.itens_sessao_bipagem
  drop constraint if exists itens_sessao_bipagem_codigo_rastreio_basico_check;

create or replace function public.validar_codigo_rastreio_item_bipagem()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_codigo_normalizado text := public.normalizar_codigo_pacote(new.codigo_normalizado);
begin
  if
    coalesce(char_length(v_codigo_normalizado), 0) not between 6 and 60
    or v_codigo_normalizado !~ '^[A-Z0-9._/-]+$'
    or v_codigo_normalizado ~ '^[0-9]{8}$'
    or v_codigo_normalizado ~ '^000201'
    or v_codigo_normalizado ~ 'BRGOVBCBPIX'
  then
    raise exception
      'Codigo nao reconhecido como rastreio. Leia apenas o codigo da remessa.';
  end if;

  return new;
end;
$$;

drop trigger if exists validar_codigo_rastreio_item_bipagem
  on public.itens_sessao_bipagem;

create trigger validar_codigo_rastreio_item_bipagem
  before insert or update of codigo, codigo_normalizado
  on public.itens_sessao_bipagem
  for each row
  execute function public.validar_codigo_rastreio_item_bipagem();

comment on function public.validar_codigo_rastreio_item_bipagem() is
  'Bloqueia novos CEPs, PIX e payloads compostos sem prender registros legados.';
