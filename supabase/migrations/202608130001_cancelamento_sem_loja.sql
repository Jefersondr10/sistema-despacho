-- Permite localizar um pacote finalizado sem pedir a loja antes da leitura e
-- finaliza um grupo de cancelamentos com uma justificativa geral unica.
-- As RPCs anteriores permanecem intactas para permitir rollout gradual.

begin;

create index if not exists idx_pacotes_user_codigo_finalizados
  on public.pacotes (
    user_id,
    public.normalizar_codigo_pacote(codigo)
  )
  where status = 'finalizado';

create or replace function public.buscar_pacotes_finalizados_normalizado(
  p_codigo text
)
returns table(id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select pacote.id
  from public.pacotes as pacote
  where pacote.user_id = (select auth.uid())
    and pacote.status = 'finalizado'
    and public.normalizar_codigo_pacote(pacote.codigo) =
      public.normalizar_codigo_pacote(p_codigo)
  order by pacote.loja_id, pacote.id;
$$;

create or replace function public.finalizar_cancelamentos_lote_v2(
  p_justificativa_geral text,
  p_cancelamentos jsonb
)
returns setof public.pacotes_cancelados
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := public.exigir_usuario_autenticado();
  v_item jsonb;
  v_pacote_id uuid;
  v_pacote public.pacotes%rowtype;
  v_cancelamento public.pacotes_cancelados%rowtype;
  v_cancelado_em timestamptz := now();
  v_justificativa_geral text := nullif(btrim(p_justificativa_geral), '');
  v_justificativa_individual text;
  v_justificativa_aplicada text;
begin
  if v_justificativa_geral is null then
    raise exception 'justificativa_geral obrigatoria para cancelamento.';
  end if;

  if jsonb_typeof(p_cancelamentos) <> 'array'
    or jsonb_array_length(p_cancelamentos) = 0 then
    raise exception 'Informe ao menos um pacote para cancelar.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_cancelamentos) as item(value)
    group by item.value->>'pacote_id'
    having count(*) > 1
  ) then
    raise exception 'Um pacote nao pode aparecer mais de uma vez no cancelamento.';
  end if;

  -- A ordenacao dos ids mantem uma ordem de locks estavel quando dois
  -- cancelamentos concorrentes incluem pacotes em comum.
  for v_item in
    select item.value
    from jsonb_array_elements(p_cancelamentos) as item(value)
    order by item.value->>'pacote_id'
  loop
    v_pacote_id := nullif(v_item->>'pacote_id', '')::uuid;
    v_justificativa_individual :=
      nullif(btrim(coalesce(v_item->>'justificativa_individual', '')), '');
    v_justificativa_aplicada :=
      coalesce(v_justificativa_individual, v_justificativa_geral);

    if v_pacote_id is null then
      raise exception 'pacote_id obrigatorio para cancelamento.';
    end if;

    select * into v_pacote
    from public.pacotes
    where id = v_pacote_id
      and user_id = v_user_id
    for update;

    if not found or v_pacote.loja_id is null then
      raise exception 'Pacote % com loja valida nao encontrado.', v_pacote_id;
    end if;
    if lower(btrim(v_pacote.status)) <> 'finalizado' then
      raise exception 'Pacote % nao esta finalizado ou ja foi cancelado.',
        v_pacote.codigo;
    end if;

    update public.pacotes
    set status = 'cancelado', cancelado_em = v_cancelado_em
    where id = v_pacote.id
      and user_id = v_user_id
      and loja_id = v_pacote.loja_id
      and status = 'finalizado';

    if not found then
      raise exception 'Pacote % foi alterado durante o cancelamento.',
        v_pacote.codigo;
    end if;

    insert into public.pacotes_cancelados (
      user_id,
      pacote_id,
      codigo_pacote,
      loja_id,
      marketplace_id,
      transportadora_id,
      sessao_id,
      tipo_operacao,
      melhor_envio,
      justificativa_geral,
      justificativa_individual,
      bipado_em,
      cancelado_em
    ) values (
      v_user_id,
      v_pacote.id,
      v_pacote.codigo,
      v_pacote.loja_id,
      v_pacote.marketplace_id,
      v_pacote.transportadora_id,
      v_pacote.sessao_id,
      v_pacote.tipo_operacao,
      v_pacote.melhor_envio,
      v_justificativa_geral,
      v_justificativa_individual,
      v_pacote.bipado_em,
      v_cancelado_em
    ) returning * into v_cancelamento;

    insert into public.movimentacoes (
      user_id,
      pacote_id,
      loja_id,
      sessao_id,
      tipo_movimentacao,
      descricao,
      criada_em
    ) values (
      v_user_id,
      v_pacote.id,
      v_pacote.loja_id,
      v_pacote.sessao_id,
      'Cancelamento',
      'Pacote ' || v_pacote.codigo || ' cancelado. Motivo: ' ||
        v_justificativa_aplicada,
      v_cancelado_em
    );

    return next v_cancelamento;
  end loop;

  return;
end;
$$;

revoke execute on function public.buscar_pacotes_finalizados_normalizado(text)
  from public, anon;
revoke execute on function public.finalizar_cancelamentos_lote_v2(text, jsonb)
  from public, anon;

grant execute on function public.buscar_pacotes_finalizados_normalizado(text)
  to authenticated;
grant execute on function public.finalizar_cancelamentos_lote_v2(text, jsonb)
  to authenticated;

commit;
