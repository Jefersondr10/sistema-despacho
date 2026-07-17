-- Cadastro de destinatarios e historico de envio de relatorios por e-mail.

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

create table if not exists relatorio_destinatarios (
  id uuid primary key default gen_random_uuid(),
  nome text,
  email text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists idx_relatorio_destinatarios_email_lower
  on relatorio_destinatarios (lower(email));

drop trigger if exists set_relatorio_destinatarios_updated_at on relatorio_destinatarios;
create trigger set_relatorio_destinatarios_updated_at
  before update on relatorio_destinatarios
  for each row
  execute function set_updated_at();

create table if not exists relatorio_envios (
  id uuid primary key default gen_random_uuid(),
  destinatarios jsonb not null,
  assunto text not null,
  filtros jsonb not null default '{}'::jsonb,
  status text not null check (status in ('sucesso', 'erro')),
  erro text,
  enviado_em timestamptz not null default now()
);

create index if not exists idx_relatorio_envios_enviado_em
  on relatorio_envios (enviado_em desc);
