begin;

-- Uma chave de NF-e possui 44 caracteres. O ultimo e calculado por modulo 11
-- sobre os 43 anteriores, com pesos de 2 a 9 aplicados da direita para a
-- esquerda e valor ASCII - 48 para cada caractere. Para evitar colisao com
-- rastreios, tambem conferimos UF, mes, modelo, numero e tpEmis.
create or replace function public.eh_chave_nfe_valida(p_codigo text)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog, public
as $$
declare
  v_apresentacao text := btrim(p_codigo);
  v_codigo text;
  v_soma integer := 0;
  v_peso integer := 2;
  v_indice integer;
  v_resto integer;
  v_digito_verificador integer;
begin
  -- Aceita a chave compacta e a apresentacao visual separada por espacos,
  -- pontos, barras ou hifens. Letras pertencentes a chave sao preservadas.
  if v_apresentacao !~ '^[A-Za-z0-9[:space:]./-]+$' then
    return false;
  end if;

  v_codigo := upper(
    regexp_replace(v_apresentacao, '[[:space:]./-]', '', 'g')
  );
  if v_codigo !~ '^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$' then
    return false;
  end if;

  if
    v_codigo = repeat(substring(v_codigo from 1 for 1), 44)
    or substring(v_codigo from 1 for 2) not in (
      '11', '12', '13', '14', '15', '16', '17',
      '21', '22', '23', '24', '25', '26', '27', '28', '29',
      '31', '32', '33', '35',
      '41', '42', '43',
      '50', '51', '52', '53'
    )
    or substring(v_codigo from 5 for 2)::integer not between 1 and 12
    or substring(v_codigo from 21 for 2) not in ('55', '65')
    or substring(v_codigo from 26 for 9)::bigint = 0
    or substring(v_codigo from 35 for 1)::integer not between 1 and 9
  then
    return false;
  end if;

  for v_indice in reverse 43..1 loop
    v_soma := v_soma +
      (ascii(substring(v_codigo from v_indice for 1)) - 48) * v_peso;
    v_peso := case when v_peso = 9 then 2 else v_peso + 1 end;
  end loop;

  v_resto := v_soma % 11;
  v_digito_verificador := case
    when v_resto in (0, 1) then 0
    else 11 - v_resto
  end;

  return substring(v_codigo from 44 for 1)::integer =
    v_digito_verificador;
end;
$$;

comment on function public.eh_chave_nfe_valida(text) is
  'Reconhece chave numerica ou alfanumerica plausivel de NF-e/NFC-e e valida seu DV.';

-- O mesmo guard protege a RPC (que insere em itens_sessao_bipagem) e escritas
-- diretas nas duas tabelas. O trigger so dispara quando o codigo muda; assim,
-- chaves legadas ainda podem ser removidas, canceladas ou finalizadas.
create or replace function public.rejeitar_chave_nfe_como_rastreio()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_new jsonb := to_jsonb(new);
begin
  if not (
    coalesce(public.eh_chave_nfe_valida(new.codigo), false)
    or coalesce(
      public.eh_chave_nfe_valida(v_new ->> 'codigo_normalizado'),
      false
    )
  ) then
    return new;
  end if;

  -- Uma sessao aberta antes desta migration pode conter uma chave que a regra
  -- antiga aceitou. A finalizacao desse lote insere o pacote a partir do item
  -- ja existente; permitimos exclusivamente essa passagem. Depois que o guard
  -- entra em vigor, nenhum item novo de NF-e consegue satisfazer esta excecao.
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
        and item.codigo_normalizado =
          public.normalizar_codigo_pacote(new.codigo)
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

drop trigger if exists rejeitar_chave_nfe_item_bipagem
  on public.itens_sessao_bipagem;
create trigger rejeitar_chave_nfe_item_bipagem
  before insert or update of codigo, codigo_normalizado
  on public.itens_sessao_bipagem
  for each row
  execute function public.rejeitar_chave_nfe_como_rastreio();

drop trigger if exists rejeitar_chave_nfe_pacote
  on public.pacotes;
create trigger rejeitar_chave_nfe_pacote
  before insert or update of codigo
  on public.pacotes
  for each row
  execute function public.rejeitar_chave_nfe_como_rastreio();

-- Funcoes de trigger nao precisam ser expostas como RPC. O predicado booleano
-- permanece consultavel e nao acessa nenhuma tabela ou dado da conta.
revoke execute on function public.rejeitar_chave_nfe_como_rastreio()
from public, anon, authenticated;

commit;
