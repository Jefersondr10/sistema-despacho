# Sistema Despacho

Aplicação Next.js 16 para bipagem, lotes, pacotes, cancelamentos e relatórios. Cada login do Supabase Auth é uma conta independente: `user_id` separa contas e `loja_id` continua separando as lojas dentro da conta.

## Configuração local

Crie `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICAVEL
RESEND_API_KEY=SUA_CHAVE_RESEND
RESEND_FROM_EMAIL=Sistema Despacho <despacho@seu-dominio.com>
```

A aplicação usa somente a chave publicável no navegador. Nunca exponha `service_role` em variáveis `NEXT_PUBLIC_*`.

```bash
npm install
npm run dev
```

## Supabase Auth

No painel do Supabase:

1. Em **Authentication > Providers > Email**, habilite e-mail/senha.
2. Decida se novos e-mails precisam de confirmação.
3. Em **Authentication > URL Configuration**, defina a Site URL e os Redirect URLs:
   - local: `http://localhost:3000/login`;
   - produção: `https://SEU-DOMINIO/login`.
4. Crie a conta proprietária dos dados antigos em **Authentication > Users** e confirme o e-mail, se necessário.

A tela `/login` oferece entrada, criação de conta e recuperação de senha. A sessão é persistida e renovada pelo cliente oficial do Supabase. Rotas internas sem sessão são redirecionadas para `/login`; as APIs exigem `Authorization: Bearer <access_token>`.

## Migration de isolamento e backfill

A correção está exclusivamente em `supabase/migrations/202607170001_multi_tenant_accounts.sql`. Não altere nem execute novamente migrations antigas de `user_id` para corrigir o banco.

Antes de aplicar a migration nova:

1. Faça backup do banco.
2. Garanta que a migration `202607160001_remove_user_isolation.sql` já esteja registrada no histórico do ambiente atual.
3. Crie a conta proprietária no Supabase Auth.
4. Abra a migration nova e substitua exatamente `OWNER_EMAIL_AQUI` pelo e-mail dessa conta.
5. Revise o diff e só então aplique pelo fluxo de migrations do ambiente.

O núcleo do backfill executado dentro da transação é:

```sql
select id
into v_owner_id
from auth.users
where lower(email) = lower(btrim(v_owner_email));

-- Repetido para cada tabela operacional:
update public.lojas
set user_id = v_owner_id
where user_id is null;
```

Se o placeholder não for substituído, se o e-mail não existir ou se restar qualquer linha sem dono, a migration lança uma exceção e a transação inteira é revertida. Ela nunca escolhe o primeiro usuário automaticamente e não apaga registros.

Depois do backfill, a migration:

- torna `user_id` obrigatório, com default `auth.uid()` e FK para `auth.users(id) on delete cascade`;
- substitui FKs simples por FKs compostas `(id, user_id)`, impedindo relações entre contas;
- cria índices únicos por conta para slugs, destinatários, lotes e códigos de pacote por loja;
- habilita RLS nas dez tabelas e cria políticas separadas de SELECT, INSERT, UPDATE e DELETE;
- remove acesso operacional de `anon` e libera tabelas/RPCs somente para `authenticated`;
- recria RPCs de bipagem como `SECURITY INVOKER`, validando `auth.uid()` e `loja_id`.

Não faça deploy nem aplique a migration sem antes trocar e conferir o e-mail do backfill.

## Testes

Os testes unitários e estruturais não acessam o Supabase:

```bash
npm run lint
npm test
npm run build
```

O teste de integração com duas contas é ignorado até que um ambiente de teste, já migrado, seja configurado:

```env
SUPABASE_MULTI_TENANT_TEST_URL=https://SEU-PROJETO-DE-TESTE.supabase.co
SUPABASE_MULTI_TENANT_TEST_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICAVEL_DE_TESTE
SUPABASE_TEST_USER_A_EMAIL=conta-a@exemplo.com
SUPABASE_TEST_USER_A_PASSWORD=senha-da-conta-a
SUPABASE_TEST_USER_B_EMAIL=conta-b@exemplo.com
SUPABASE_TEST_USER_B_PASSWORD=senha-da-conta-b
```

Ao rodar `npm test`, esse teste cria lojas Brasília e marketplaces Amazon com o mesmo slug nas duas contas, bipa `TESTE-A` nas duas e verifica SELECT, UPDATE, DELETE, referência cruzada e RPC cruzada. Os registros criados pelo teste são removidos ao final. Use somente contas e projeto dedicados a testes.

## Modelo de segurança

```text
Conta autenticada (auth.users / user_id)
└── Lojas da conta (loja_id)
    ├── Sessões e itens de bipagem
    ├── Pacotes e movimentações
    └── Cancelamentos
```

Os filtros explícitos do TypeScript reduzem consultas acidentais, mas não são a fronteira de segurança. O isolamento contra chamadas manuais à API é garantido por RLS, pelas políticas `user_id = auth.uid()` e pelas FKs compostas do banco.
