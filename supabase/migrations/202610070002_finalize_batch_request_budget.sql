-- A finalizacao e atomica e executa validacoes/auditoria para cada pacote.
-- PostgREST >= 12.2 aplica este limite antes da chamada RPC (hoisted setting).
-- Mantem 8s nas demais requisicoes e o lock_timeout existente; nao remove RLS.
begin;
alter function public.finalizar_sessao_bipagem(uuid)
  set statement_timeout = '30s';
notify pgrst, 'reload schema';
commit;
