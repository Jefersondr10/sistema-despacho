-- Sistema de Despacho - schema inicial para Supabase
-- Execute este arquivo no SQL Editor do Supabase.
-- Nesta fase ha login via Supabase Auth, sem tabela manual de usuarios, perfis ou RLS.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists marketplaces (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists transportadoras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table lojas add column if not exists updated_at timestamptz;
alter table marketplaces add column if not exists updated_at timestamptz;
alter table transportadoras add column if not exists updated_at timestamptz;

create table if not exists sessoes_bipagem (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id),
  marketplace_id uuid not null references marketplaces(id),
  tipo_operacao text not null check (tipo_operacao in ('coleta', 'postagem')),
  melhor_envio boolean not null default false,
  transportadora_id uuid references transportadoras(id),
  status text not null default 'aberta',
  iniciada_em timestamp with time zone not null default now(),
  finalizada_em timestamp with time zone
);

create table if not exists pacotes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  loja_id uuid not null references lojas(id),
  marketplace_id uuid not null references marketplaces(id),
  transportadora_id uuid references transportadoras(id),
  sessao_id uuid references sessoes_bipagem(id),
  tipo_operacao text not null check (tipo_operacao in ('coleta', 'postagem')),
  melhor_envio boolean not null default false,
  status text not null default 'bipado',
  bipado_em timestamp with time zone not null default now(),
  finalizado_em timestamp with time zone,
  cancelado_em timestamp with time zone
);

create table if not exists movimentacoes (
  id uuid primary key default gen_random_uuid(),
  pacote_id uuid references pacotes(id),
  loja_id uuid not null references lojas(id),
  sessao_id uuid references sessoes_bipagem(id),
  tipo_movimentacao text not null,
  descricao text,
  criada_em timestamp with time zone not null default now()
);

create table if not exists pacotes_cancelados (
  id uuid primary key default gen_random_uuid(),
  pacote_id uuid references pacotes(id),
  codigo_pacote text not null,
  loja_id uuid not null references lojas(id),
  marketplace_id uuid references marketplaces(id),
  transportadora_id uuid references transportadoras(id),
  sessao_id uuid references sessoes_bipagem(id),
  tipo_operacao text check (
    tipo_operacao is null or tipo_operacao in ('coleta', 'postagem')
  ),
  melhor_envio boolean,
  justificativa_geral text,
  justificativa_individual text,
  bipado_em timestamp with time zone,
  cancelado_em timestamp with time zone not null default now()
);

create index if not exists idx_sessoes_bipagem_loja_id
  on sessoes_bipagem (loja_id);

create index if not exists idx_sessoes_bipagem_marketplace_id
  on sessoes_bipagem (marketplace_id);

create index if not exists idx_pacotes_loja_id
  on pacotes (loja_id);

create index if not exists idx_pacotes_marketplace_id
  on pacotes (marketplace_id);

create index if not exists idx_pacotes_sessao_id
  on pacotes (sessao_id);

drop index if exists idx_pacotes_codigo_normalizado;

create unique index if not exists idx_pacotes_codigo_normalizado_ativos
  on pacotes (upper(regexp_replace(codigo, '\s+', '', 'g')))
  where status <> 'cancelado';

create index if not exists idx_movimentacoes_loja_id
  on movimentacoes (loja_id);

create index if not exists idx_movimentacoes_pacote_id
  on movimentacoes (pacote_id);

create index if not exists idx_pacotes_cancelados_loja_id
  on pacotes_cancelados (loja_id);

create index if not exists idx_pacotes_cancelados_pacote_id
  on pacotes_cancelados (pacote_id);

drop trigger if exists set_lojas_updated_at on lojas;
create trigger set_lojas_updated_at
  before update on lojas
  for each row
  execute function set_updated_at();

drop trigger if exists set_marketplaces_updated_at on marketplaces;
create trigger set_marketplaces_updated_at
  before update on marketplaces
  for each row
  execute function set_updated_at();

drop trigger if exists set_transportadoras_updated_at on transportadoras;
create trigger set_transportadoras_updated_at
  before update on transportadoras
  for each row
  execute function set_updated_at();

insert into lojas (nome, slug)
values
  ('Brasília', 'brasilia'),
  ('São Paulo', 'sao-paulo')
on conflict (slug) do nothing;

insert into marketplaces (nome, slug)
values
  ('Amazon', 'amazon'),
  ('Shopee', 'shopee'),
  ('Mercado Livre', 'mercado-livre'),
  ('TikTok Shop', 'tiktok-shop'),
  ('OLX', 'olx')
on conflict (slug) do nothing;

insert into transportadoras (nome, slug)
values
  ('Correios', 'correios'),
  ('Jadlog', 'jadlog'),
  ('Loggi', 'loggi'),
  ('Azul Cargo', 'azul-cargo')
on conflict (slug) do nothing;

alter table lojas disable row level security;
alter table marketplaces disable row level security;
alter table transportadoras disable row level security;
alter table sessoes_bipagem disable row level security;
alter table pacotes disable row level security;
alter table movimentacoes disable row level security;
alter table pacotes_cancelados disable row level security;
