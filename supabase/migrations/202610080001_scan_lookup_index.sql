-- Clientes ja abertos ainda fazem a consulta previa de duplicidade.
-- Usa a coluna gerada/indexada sem recalcular o historico inteiro sob RLS.
begin;
create or replace function public.buscar_pacote_ativo_global_normalizado(p_codigo text)
returns table(id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select pacote.id
  from public.pacotes as pacote
  where pacote.user_id = (select public.current_account_id())
    and pacote.codigo_normalizado = public.normalizar_codigo_pacote(p_codigo)
    and pacote.status <> 'cancelado'
  order by pacote.bipado_em, pacote.id
  limit 1;
$$;
notify pgrst, 'reload schema';
commit;
