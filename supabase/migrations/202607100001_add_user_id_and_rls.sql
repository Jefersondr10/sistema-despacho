-- Corrige definitivamente user_id/RLS em tabelas pertencentes ao usuario.
--
-- Esta migration e idempotente: adiciona user_id, preenche dados antigos com
-- o primeiro usuario do Supabase Auth, torna user_id obrigatorio quando seguro
-- e aplica RLS por usuario.

create extension if not exists pgcrypto;

alter table if exists public.lojas
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.marketplaces
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.transportadoras
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.relatorio_destinatarios
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.relatorio_envios
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.sessoes_bipagem
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.itens_sessao_bipagem
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.pacotes
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.movimentacoes
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.pacotes_cancelados
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.lotes
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.lote_pacotes
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.pacotes_lote
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.relatorios
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.historico
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'lojas',
    'marketplaces',
    'transportadoras',
    'relatorio_destinatarios',
    'relatorio_envios',
    'sessoes_bipagem',
    'itens_sessao_bipagem',
    'pacotes',
    'movimentacoes',
    'pacotes_cancelados',
    'lotes',
    'lote_pacotes',
    'pacotes_lote',
    'relatorios',
    'historico'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format(
        'alter table public.%I alter column user_id set default auth.uid()',
        v_table
      );
    end if;
  end loop;
end;
$$;

do $$
declare
  v_table text;
  v_owner uuid;
  v_has_null boolean;
begin
  select id
    into v_owner
  from auth.users
  order by created_at asc nulls last, id
  limit 1;

  foreach v_table in array array[
    'lojas',
    'marketplaces',
    'transportadoras',
    'relatorio_destinatarios',
    'relatorio_envios',
    'sessoes_bipagem',
    'itens_sessao_bipagem',
    'pacotes',
    'movimentacoes',
    'pacotes_cancelados',
    'lotes',
    'lote_pacotes',
    'pacotes_lote',
    'relatorios',
    'historico'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      if v_owner is not null then
        execute format(
          'update public.%I set user_id = $1 where user_id is null',
          v_table
        )
        using v_owner;
      else
        raise notice 'Nenhum usuario em auth.users; public.% nao teve backfill de user_id.', v_table;
      end if;

      execute format(
        'select exists (select 1 from public.%I where user_id is null)',
        v_table
      )
      into v_has_null;

      if not v_has_null then
        execute format(
          'alter table public.%I alter column user_id set not null',
          v_table
        );
      else
        raise notice 'public.% ainda possui user_id nulo; coluna mantida nullable para revisao manual.', v_table;
      end if;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_table text;
  v_constraint text;
begin
  foreach v_table in array array[
    'lojas',
    'marketplaces',
    'transportadoras',
    'relatorio_destinatarios',
    'relatorio_envios',
    'sessoes_bipagem',
    'itens_sessao_bipagem',
    'pacotes',
    'movimentacoes',
    'pacotes_cancelados',
    'lotes',
    'lote_pacotes',
    'pacotes_lote',
    'relatorios',
    'historico'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      v_constraint := v_table || '_user_id_fkey';

      if not exists (
        select 1
        from pg_constraint
        where conname = v_constraint
          and conrelid = format('public.%I', v_table)::regclass
      ) then
        execute format(
          'alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade',
          v_table,
          v_constraint
        );
      end if;
    end if;
  end loop;
end;
$$;

alter table if exists public.lojas drop constraint if exists lojas_slug_key;
alter table if exists public.marketplaces drop constraint if exists marketplaces_slug_key;
alter table if exists public.transportadoras drop constraint if exists transportadoras_slug_key;
alter table if exists public.relatorio_destinatarios drop constraint if exists relatorio_destinatarios_email_key;
alter table if exists public.sessoes_bipagem drop constraint if exists sessoes_bipagem_codigo_lote_key;

drop index if exists public.idx_pacotes_codigo_normalizado_ativos;
drop index if exists public.idx_relatorio_destinatarios_email_lower;
drop index if exists public.idx_sessoes_bipagem_codigo_lote;

create unique index if not exists idx_lojas_user_slug
  on public.lojas (user_id, slug)
  where user_id is not null;

create unique index if not exists idx_marketplaces_user_slug
  on public.marketplaces (user_id, slug)
  where user_id is not null;

create unique index if not exists idx_transportadoras_user_slug
  on public.transportadoras (user_id, slug)
  where user_id is not null;

create unique index if not exists idx_relatorio_destinatarios_user_email_lower
  on public.relatorio_destinatarios (user_id, lower(email))
  where user_id is not null;

create unique index if not exists idx_pacotes_user_loja_codigo_ativos
  on public.pacotes (
    user_id,
    loja_id,
    public.normalizar_codigo_pacote(codigo)
  )
  where status <> 'cancelado'
    and user_id is not null;

create unique index if not exists idx_sessoes_bipagem_user_codigo_lote
  on public.sessoes_bipagem (user_id, codigo_lote)
  where codigo_lote is not null
    and user_id is not null;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'lojas',
    'marketplaces',
    'transportadoras',
    'relatorio_destinatarios',
    'relatorio_envios',
    'sessoes_bipagem',
    'itens_sessao_bipagem',
    'pacotes',
    'movimentacoes',
    'pacotes_cancelados',
    'lotes',
    'lote_pacotes',
    'pacotes_lote',
    'relatorios',
    'historico'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format(
        'create index if not exists %I on public.%I (user_id)',
        'idx_' || v_table || '_user_id',
        v_table
      );
    end if;
  end loop;
end;
$$;

create index if not exists idx_itens_sessao_bipagem_user_sessao_ordem
  on public.itens_sessao_bipagem (user_id, sessao_id, ordem desc);
create index if not exists idx_pacotes_user_loja_id
  on public.pacotes (user_id, loja_id);

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'lojas',
    'marketplaces',
    'transportadoras',
    'relatorio_destinatarios',
    'relatorio_envios',
    'sessoes_bipagem',
    'itens_sessao_bipagem',
    'pacotes',
    'movimentacoes',
    'pacotes_cancelados',
    'lotes',
    'lote_pacotes',
    'pacotes_lote',
    'relatorios',
    'historico'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('alter table public.%I enable row level security', v_table);

      execute format('drop policy if exists %I on public.%I', v_table || '_select_own', v_table);
      execute format('drop policy if exists %I on public.%I', v_table || '_insert_own', v_table);
      execute format('drop policy if exists %I on public.%I', v_table || '_update_own', v_table);
      execute format('drop policy if exists %I on public.%I', v_table || '_delete_own', v_table);
      execute format('drop policy if exists %I on public.%I', 'Users can select own ' || v_table, v_table);
      execute format('drop policy if exists %I on public.%I', 'Users can insert own ' || v_table, v_table);
      execute format('drop policy if exists %I on public.%I', 'Users can update own ' || v_table, v_table);
      execute format('drop policy if exists %I on public.%I', 'Users can delete own ' || v_table, v_table);

      execute format(
        'create policy %I on public.%I for select to authenticated using (user_id = auth.uid())',
        v_table || '_select_own',
        v_table
      );
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())',
        v_table || '_insert_own',
        v_table
      );
      execute format(
        'create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
        v_table || '_update_own',
        v_table
      );
      execute format(
        'create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())',
        v_table || '_delete_own',
        v_table
      );
    end if;
  end loop;
end;
$$;

revoke execute on function public.exigir_usuario_autenticado() from public, anon;
revoke execute on function public.adicionar_item_sessao_bipagem(text, uuid) from public, anon;
revoke execute on function public.remover_item_sessao_bipagem(uuid, text) from public, anon;
revoke execute on function public.finalizar_sessao_bipagem(uuid) from public, anon;
revoke execute on function public.cancelar_sessao_bipagem(uuid) from public, anon;
revoke execute on function public.finalizar_cancelamentos_lote(jsonb) from public, anon;

grant execute on function public.exigir_usuario_autenticado() to authenticated;
grant execute on function public.adicionar_item_sessao_bipagem(text, uuid) to authenticated;
grant execute on function public.remover_item_sessao_bipagem(uuid, text) to authenticated;
grant execute on function public.finalizar_sessao_bipagem(uuid) to authenticated;
grant execute on function public.cancelar_sessao_bipagem(uuid) to authenticated;
grant execute on function public.finalizar_cancelamentos_lote(jsonb) to authenticated;
