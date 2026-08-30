# Sistema Despacho

Aplicação Next.js 16 para bipagem, lotes, pacotes, cancelamentos e relatórios. Cada login do Supabase Auth é uma conta independente: `user_id` separa contas e `loja_id` continua separando as lojas dentro da conta.

## Configuração local

Crie `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICAVEL
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SERVICE_ROLE
RESEND_API_KEY=SUA_CHAVE_RESEND
RELATORIOS_EMAIL_FROM=Sistema Despacho <despacho@seu-dominio.com>
RELATORIOS_EMAIL_REPLY_TO=
```

A aplicação usa somente a chave publicável no navegador. A
`SUPABASE_SERVICE_ROLE_KEY` é usada exclusivamente pelas rotas server-side para
consultar e marcar o estado interno de entrega das notificações. Nunca exponha
essa chave em variáveis `NEXT_PUBLIC_*`, logs ou respostas JSON.

```bash
npm install
npm run dev
```

## Supabase Auth

No painel do Supabase:

1. Em **Authentication > Providers > Email**, habilite e-mail/senha.
2. Mantenha a confirmação de e-mail habilitada. A API de feedback rejeita
   contas cujo endereço ainda não foi confirmado.
3. Em **Authentication > URL Configuration**, defina a Site URL e os Redirect URLs:
   - local: `http://localhost:3000/login`;
   - produção: `https://bipagem.SEU-DOMINIO-BASE/login`.
4. Crie a conta proprietária dos dados antigos em **Authentication > Users** e confirme o e-mail, se necessário.

A tela `/login` oferece entrada, criação de conta e recuperação de senha. A sessão é persistida e renovada pelo cliente oficial do Supabase. Rotas internas sem sessão são redirecionadas para `/login`; as APIs exigem `Authorization: Bearer <access_token>`.

## Instalação como aplicativo

O endereço de produção pode ser instalado como aplicativo no celular ou no
computador. O botão **Instalar aplicativo** usa a instalação nativa quando o
navegador oferece esse recurso e mostra o caminho manual nos demais casos.

- Android/Chrome: toque em **Instalar aplicativo** ou use a opção de instalação
  do menu do navegador.
- iPhone/iPad: abra no Safari e use **Compartilhar > Adicionar à Tela de Início**.

O aplicativo abre em `/dashboard`, oferece um atalho direto para `/bipagem` e
mantém a câmera disponível pelo HTTPS. Ele continua exigindo internet: páginas
autenticadas, respostas do Supabase e operações de bipagem não são armazenadas
para uso offline.

O componente `app/_components/whats-new-notice.tsx` mostra as novidades uma vez
por versão em cada aparelho, somente no Dashboard. Em toda publicação com mudança visível,
atualize `CURRENT_RELEASE_ID` e a lista `releaseItems`; assim o aviso reaparece
no próximo acesso sem depender do banco.

## Feedback e notificações por e-mail

O envio de feedback usa `POST /api/feedback` e exige uma sessão válida do
Supabase. O corpo JSON tem limite real de 16 KB e aceita somente categoria,
área, assunto, mensagem, página atual e uma chave UUID de idempotência criada
pelo cliente. O banco aplica novamente validação, isolamento e limite de
frequência pela RPC `submit_feedback`.

Cada notificação usa um identificador persistente criado no banco. Repetir a
mesma solicitação tenta novamente somente uma entrega pendente; solicitações já
marcadas como notificadas não voltam a chamar o provedor de e-mail.

Antes de publicar esse fluxo em um ambiente novo, aplique a migration
`supabase/migrations/202608290001_feedback_notification_recipients.sql`. Ela
cria o contexto de entrega e a marcação idempotente usados pela API.

As notificações de novos feedbacks são enviadas diretamente para
`jefersondr10@gmail.com`. O destinatário é definido exclusivamente no backend:
a tela de Feedback e o navegador nunca podem substituí-lo. A opção de gerenciar
destinatários e feedbacks não aparece mais na navegação; a rota administrativa
antiga redireciona para `/feedback`.
`RELATORIOS_EMAIL_FROM` e
`RESEND_API_KEY` também ficam exclusivamente no backend. O e-mail autenticado
do autor é usado como `reply_to`, permitindo responder diretamente pelo e-mail
recebido. As tabelas e snapshots históricos de notificação permanecem no banco
para preservar compatibilidade e idempotência, mas não escolhem o destinatário
dos novos feedbacks.

A rota histórica `PATCH /api/feedback/[id]` permanece protegida pela RPC
`review_feedback` para compatibilidade, mas não é mais exposta na interface. O
PATCH envia também `expectedUpdatedAt`, permitindo que o banco rejeite com HTTP
409 uma edição baseada em dados desatualizados.
Se o Resend estiver indisponível ou sem configuração, o feedback ou a revisão
continuam salvos; a resposta da API informa `notificationSent: false` sem expor
detalhes internos do provedor.

## Migration de isolamento e backfill

A correção está exclusivamente em `supabase/migrations/202607170001_multi_tenant_accounts.sql`. Não altere nem execute novamente migrations antigas de `user_id` para corrigir o banco.

Antes de aplicar a migration nova:

1. Faça backup do banco.
2. Garanta que a migration `202607160001_remove_user_isolation.sql` já esteja registrada no histórico do ambiente atual.
3. Crie a conta proprietária no Supabase Auth.
4. Abra a migration nova e confira se `v_owner_email` corresponde exatamente ao e-mail dessa conta.
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

Se o e-mail configurado não existir ou se restar qualquer linha sem dono, a migration lança uma exceção e a transação inteira é revertida. Ela nunca escolhe o primeiro usuário automaticamente e não apaga registros.

Depois do backfill, a migration:

- torna `user_id` obrigatório, com default `auth.uid()` e FK para `auth.users(id) on delete cascade`;
- substitui FKs simples por FKs compostas `(id, user_id)`, impedindo relações entre contas;
- cria índices únicos por conta para slugs, destinatários, lotes e códigos de pacote por loja;
- habilita RLS nas dez tabelas e cria políticas separadas de SELECT, INSERT, UPDATE e DELETE;
- remove acesso operacional de `anon` e libera tabelas/RPCs somente para `authenticated`;
- recria RPCs de bipagem como `SECURITY INVOKER`, validando `auth.uid()` e `loja_id`.

Não faça deploy nem aplique a migration sem antes trocar e conferir o e-mail do backfill.

## Migration de desempenho da bipagem

Depois que a migration de isolamento estiver aplicada, execute
`supabase/migrations/202608120001_bipagem_performance.sql` para ativar a busca
normalizada, os índices dos caminhos quentes e as RPCs incrementais da bipagem.
Ela não altera dados existentes e mantém as RPCs antigas durante a transição.

Aplique em um período de menor movimento, pois a criação inicial dos índices
pode bloquear gravações brevemente. A ordem recomendada é:

1. aplicar `202608120001_bipagem_performance.sql` no Supabase;
2. publicar a nova versão da aplicação;
3. confirmar uma bipagem nova, uma duplicada, uma remoção e a finalização do lote.

As RPCs antigas permanecem disponíveis durante a transição. O frontend possui
fallback temporário caso uma publicação automática anteceda a migration, mas o
ganho completo de banco só passa a valer depois que ela for aplicada.

## Migration do cancelamento sem seleção prévia de loja

Depois da migration de desempenho, aplique
`supabase/migrations/202608130001_cancelamento_sem_loja.sql`. Ela adiciona uma
busca direcionada por rastreio em todas as lojas da conta e a RPC atômica de
cancelamento com uma justificativa geral única. A busca continua isolada por
`auth.uid()` e, se o mesmo código estiver finalizado em lojas diferentes, o
frontend exige uma escolha explícita mostrando loja e marketplace.

O frontend possui fallback temporário para evitar uma tela quebrada durante a
publicação, mas dados legados formatados de outra maneira só ficam cobertos pela
busca normalizada nova. Por isso, use esta ordem:

1. fazer backup e aplicar `202608130001_cancelamento_sem_loja.sql`;
2. publicar a aplicação;
3. testar um código único, um código repetido entre lojas e um lote com motivo
   geral mais uma justificativa individual;
4. confirmar no histórico que todos receberam o motivo geral e que o motivo
   individual, quando preenchido, é o texto específico exibido para o pacote.

A migration não altera nem cancela dados existentes. A transação inteira é
revertida se qualquer pacote não pertencer à conta, não estiver finalizado ou
for alterado concorrentemente.

O índice é criado dentro da transação e pode bloquear gravações brevemente em
uma tabela grande. Aplique a migration em horário de menor movimento.

## Migration de lotes simultâneos por aparelho

Depois das migrations anteriores, aplique
`supabase/migrations/202608230001_independent_bipagem_sessions.sql` para que
cada aparelho ou perfil de navegador mantenha o próprio lote aberto. Dois
aparelhos podem bipar simultaneamente a mesma loja e marketplace sem misturar
as listas. Os lotes continuam separados para histórico e auditoria, enquanto o
romaneio do período consolida os pacotes por loja e marketplace. Um rastreio que
já esteja em outro lote aberto da mesma loja é rejeitado como duplicado.

Aplique esta migration antes do frontend, em uma janela sem bipagens ativas:

1. confirme que não há sessão aberta em `sessoes_bipagem`;
2. aplique `202608230001_independent_bipagem_sessions.sql` no Supabase;
3. publique a aplicação e force a atualização das abas antigas;
4. faça um teste com dois aparelhos usando o mesmo login, loja e marketplace;
5. confirme que foram criados dois lotes independentes e que os pacotes aparecem
   juntos no romaneio da combinação loja + marketplace.

A estação representa o aparelho ou perfil do navegador, não uma aba. Duas abas
do mesmo perfil compartilham o lote para permitir recarregar a página sem perder
a bipagem. O isolamento de segurança continua sendo o `user_id` da conta.

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
