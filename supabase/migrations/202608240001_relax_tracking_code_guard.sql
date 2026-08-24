-- A classificacao do rastreio passa a orientar a interface, sem impedir que
-- codigos operacionais desconhecidos sejam salvos. Mantemos apenas a garantia
-- estrutural de que o item possui um codigo nao vazio apos a normalizacao.

drop trigger if exists validar_codigo_rastreio_item_bipagem
  on public.itens_sessao_bipagem;

drop function if exists public.validar_codigo_rastreio_item_bipagem();

alter table public.itens_sessao_bipagem
  drop constraint if exists itens_sessao_bipagem_codigo_rastreio_basico_check;

alter table public.itens_sessao_bipagem
  drop constraint if exists itens_sessao_bipagem_codigo_nao_vazio_check;

alter table public.itens_sessao_bipagem
  add constraint itens_sessao_bipagem_codigo_nao_vazio_check
  check (
    public.normalizar_codigo_pacote(codigo) <> ''
    and public.normalizar_codigo_pacote(codigo_normalizado) <> ''
  ) not valid;

comment on constraint itens_sessao_bipagem_codigo_nao_vazio_check
  on public.itens_sessao_bipagem is
  'Aceita qualquer formato de codigo, rejeitando apenas valores vazios.';
