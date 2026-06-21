# Diagnóstico do projeto

Análise somente leitura do projeto `C:\Users\jefer\projetos\sistema-despacho`.

Não alterei arquivos do sistema durante a análise original, não instalei dependências, não criei arquivos de código e não apaguei nada. Também não li o conteúdo da `.env.local` para não expor valores sensíveis.

Observação de estado Git no momento da análise:

```txt
M package.json
M package-lock.json
?? app/api/
?? lib/
?? supabase/
```

## Resumo geral

O **Sistema de Despacho** é uma aplicação Next.js para operação de bipagem, controle de pacotes, lotes/sessões, cancelamentos, relatórios e cadastros básicos.

O sistema hoje funciona principalmente com:

- Dados mockados em `app/_lib/mock-data.ts`.
- Persistência local via `localStorage` em `app/_lib/local-store.ts`.
- Estado React dentro das telas.
- Uma camada Supabase já criada em `lib/database.ts`, `lib/supabaseClient.ts`, `supabase/schema.sql` e `app/api/supabase-health/route.ts`, mas ainda não conectada às telas principais.

Ou seja: a integração com Supabase já foi parcialmente preparada, mas a UI operacional ainda usa mocks + localStorage.

## Estrutura encontrada

### Framework

```txt
Next.js 16.2.9
React 19.2.4
TypeScript
Tailwind CSS 4
```

O projeto usa App Router com pasta `app/`.

Existe instrução em `AGENTS.md` dizendo que esta versão do Next.js tem mudanças importantes e que, antes de escrever código, deve-se consultar a documentação local em `node_modules/next/dist/docs/`.

### Pastas principais

```txt
app/
app/_components/
app/_lib/
app/api/
lib/
supabase/
public/
node_modules/
```

### Onde ficam as telas/páginas

As páginas ficam em:

```txt
app/page.tsx
app/dashboard/page.tsx
app/bipagem/page.tsx
app/pacotes/page.tsx
app/pacotes-cancelados/page.tsx
app/relatorios/page.tsx
app/cadastros/page.tsx
```

Rotas atuais:

```txt
/                   -> redireciona para /dashboard
/dashboard          -> visão geral
/bipagem            -> bipagem, lotes e cancelamentos
/pacotes            -> lista de pacotes
/pacotes-cancelados -> histórico de cancelamentos
/relatorios         -> relatórios resumido/detalhado/PDF
/cadastros          -> lojas, marketplaces e transportadoras
/api/supabase-health -> teste simples de Supabase
```

### Onde ficam os componentes

Componentes compartilhados:

```txt
app/_components/ui.tsx
app/_components/navigation.tsx
app/_components/app-shell.tsx
app/_components/package-filters.tsx
```

Componentes de tela:

```txt
app/dashboard/dashboard-view.tsx
app/bipagem/bipagem-form.tsx
app/pacotes/pacotes-view.tsx
app/pacotes-cancelados/pacotes-cancelados-view.tsx
app/relatorios/relatorios-view.tsx
app/cadastros/cadastros-view.tsx
```

### Onde ficam os dados/mock/localStorage

Mocks e tipos principais:

```txt
app/_lib/mock-data.ts
```

Persistência local:

```txt
app/_lib/local-store.ts
```

Camada Supabase já iniciada:

```txt
lib/supabaseClient.ts
lib/database.ts
supabase/schema.sql
app/api/supabase-health/route.ts
```

### Onde ficam os tipos/interfaces

A maioria dos tipos atuais está em:

```txt
app/_lib/mock-data.ts
```

Exemplos:

- `Store`
- `Marketplace`
- `Carrier`
- `DispatchPackage`
- `DispatchBatch`
- `PackageMovement`
- `PackageCancellation`
- `PackageFilterValues`

Tipos Supabase ficam em:

```txt
lib/database.ts
```

Exemplos:

- `LojaRow`
- `MarketplaceRow`
- `TransportadoraRow`
- `SessaoBipagemRow`
- `PacoteRow`
- `MovimentacaoRow`
- `PacoteCanceladoRow`

## Funcionalidades existentes

| Funcionalidade | Estado atual |
|---|---|
| Bipagem normal | Existe em `app/bipagem/bipagem-form.tsx`. O usuário seleciona loja, marketplace, coleta/postagem, Melhor Envio/transportadora e bipa o código. |
| Sessão/lote de bipagem | Existe. A sessão usa `activeBatchId`, `sessionStartedAt` e `sessionPackages`. O rascunho fica em `localStorage`. |
| Finalizar bipagem | Existe. Cria lote finalizado, grava pacotes como `Bipado` e cria movimentações de `Bipagem`. |
| Cancelar sessão | Existe. Cancela a sessão atual e descarta os pacotes ainda não finalizados. Não vira histórico de cancelamento. |
| Modo cancelar pacotes | Existe. Só entra nesse modo se não houver sessão aberta. Exige justificativa geral e permite justificativa individual. |
| Pacotes cancelados | Existe em `/pacotes-cancelados`. Lista cancelamentos vindos do mock + localStorage. |
| Histórico de lotes | Existe dentro da tela de bipagem. Mostra lotes finalizados e permite abrir um lote para ver pacotes. |
| Relatórios | Existe em `/relatorios`. Tem modo resumido, detalhado e tudo. Gera PDF via `window.print()`. |
| Cadastros de lojas | Existe em `/cadastros`. Adiciona e inativa lojas no localStorage. |
| Cadastros de marketplaces | Existe em `/cadastros`. Adiciona e inativa marketplaces no localStorage. |
| Cadastros de transportadoras | Existe em `/cadastros`. Adiciona e inativa transportadoras no localStorage. |
| Filtros de relatório | Existe via `PackageFilters`. |
| Seleção por loja | Existe na bipagem e nos filtros. |
| Separação Brasília/São Paulo | Existe por `loja_id`. Mocks iniciais têm `brasilia` e `sao-paulo`. |

### Regras atuais da bipagem

Arquivo principal:

```txt
app/bipagem/bipagem-form.tsx
```

Regras observadas:

- Loja é obrigatória.
- Marketplace é obrigatório.
- Tipo de operação é obrigatório:
  - `coleta`
  - `postagem`
- Código/rastreio é obrigatório.
- Se `melhorEnvio = true`, transportadora é obrigatória.
- Código é normalizado com `normalizeTrackingCode(code)`, removendo espaços e colocando em maiúsculo.
- Duplicidade é verificada contra:
  - pacotes já existentes;
  - pacotes da sessão atual.
- Se duplicado, não adiciona e mostra aviso.
- O lote só é salvo de verdade ao finalizar.
- Antes de finalizar, os pacotes ficam apenas na sessão atual e no rascunho local.
- Ao finalizar:
  - cria `DispatchBatch`;
  - cria pacotes com status `Bipado`;
  - cria movimentações do tipo `Bipagem`;
  - grava tudo no `localStorage`.

### Regras atuais de cancelamento

Há dois fluxos:

1. **Cancelar pacote dentro da sessão**
   - Remove o pacote da sessão atual.
   - Cria registro de cancelamento.
   - Cria movimentação de cancelamento.
   - Usa justificativa geral padrão: `Cancelamento realizado na sessão de bipagem.`

2. **Modo cancelar pacotes**
   - Ativado por botão.
   - Bloqueia a configuração de bipagem.
   - Exige justificativa geral.
   - Permite justificativa individual por pacote.
   - Procura o pacote ativo pelo código/rastreio.
   - Se não encontrar, avisa.
   - Se já estiver cancelado, avisa.
   - Se encontrar, adiciona em `pacotes_cancelados` local e cria movimentação.

## Onde os dados estão hoje

### Visão geral

| Entidade | Mock | Estado React | localStorage | sessionStorage | Supabase |
|---|---:|---:|---:|---:|---:|
| lojas | Sim | Sim | Sim | Não | Schema/funções existem, UI não usa |
| marketplaces | Sim | Sim | Sim | Não | Schema/funções existem, UI não usa |
| transportadoras | Sim | Sim | Sim | Não | Schema/funções existem, UI não usa |
| sessões/lotes | Sim | Sim | Sim | Não | Schema/funções existem, UI não usa |
| pacotes | Sim | Sim | Sim | Não | Schema/funções existem, UI não usa |
| movimentações | Sim | Sim | Sim | Não | Schema/funções existem, UI não usa |
| pacotes cancelados | Sim | Sim | Sim | Não | Schema/funções existem, UI não usa |

### Chaves de localStorage

Arquivo:

```txt
app/_lib/local-store.ts
```

Chaves:

```txt
sistema-despacho-catalogs-v1
sistema-despacho-packages-v1
sistema-despacho-batches-v1
sistema-despacho-movements-v1
sistema-despacho-cancellations-v1
sistema-despacho-bipagem-draft-v1
```

### Detalhe por entidade

#### Lojas

Fonte inicial:

```txt
app/_lib/mock-data.ts -> stores
```

Persistência após alteração:

```txt
localStorage: sistema-despacho-catalogs-v1
```

Hook:

```txt
useCatalogs()
```

#### Marketplaces

Fonte inicial:

```txt
app/_lib/mock-data.ts -> marketplaces
```

Persistência após alteração:

```txt
localStorage: sistema-despacho-catalogs-v1
```

#### Transportadoras

Fonte inicial:

```txt
app/_lib/mock-data.ts -> carriers
```

Persistência após alteração:

```txt
localStorage: sistema-despacho-catalogs-v1
```

#### Sessões/lotes

Fonte inicial:

```txt
app/_lib/mock-data.ts -> dispatchBatches
```

Persistência de lotes finalizados:

```txt
localStorage: sistema-despacho-batches-v1
```

Rascunho de sessão aberta:

```txt
localStorage: sistema-despacho-bipagem-draft-v1
```

#### Pacotes

Fonte inicial:

```txt
app/_lib/mock-data.ts -> dispatchPackages
```

Persistência local:

```txt
localStorage: sistema-despacho-packages-v1
```

Pacotes da sessão ainda aberta ficam em estado React e também no rascunho:

```txt
sessionPackages
sistema-despacho-bipagem-draft-v1
```

#### Movimentações

Fonte inicial:

```txt
app/_lib/mock-data.ts -> dispatchMovements
```

Persistência local:

```txt
localStorage: sistema-despacho-movements-v1
```

#### Pacotes cancelados

Fonte inicial:

```txt
app/_lib/mock-data.ts -> dispatchCancellations
```

Persistência local:

```txt
localStorage: sistema-despacho-cancellations-v1
```

## Entidades e campos atuais

### Loja atual no frontend

Tipo:

```ts
Store
```

Campos:

```txt
id
name
document
city
status
```

Status:

```txt
Ativa
Inativa
```

No Supabase planejado:

```txt
id
nome
slug
ativo
created_at
```

Diferença importante:

- Frontend usa `name`, `document`, `city`, `status`.
- Supabase usa `nome`, `slug`, `ativo`.
- `document` e `city` não existem no schema atual.

### Marketplace atual no frontend

Tipo:

```ts
Marketplace
```

Campos:

```txt
id
name
code
status
```

Status:

```txt
Ativo
Em homologação
Inativo
```

No Supabase planejado:

```txt
id
nome
slug
ativo
created_at
```

Diferença importante:

- Frontend usa `name`, `code`, `status`.
- Supabase usa `nome`, `slug`, `ativo`.
- `code` não existe no schema atual.

### Transportadora atual no frontend

Tipo:

```ts
Carrier
```

Campos:

```txt
id
name
service
status
```

Status:

```txt
Ativa
Pendente
Inativa
```

No Supabase planejado:

```txt
id
nome
slug
ativo
created_at
```

Diferença importante:

- Frontend usa `service` e `status`.
- Supabase não tem `service`.
- Supabase usa boolean `ativo`.

### Sessão/lote de bipagem atual

Tipo:

```ts
DispatchBatch
```

Campos:

```txt
id
loja_id
marketplace
melhor_envio
transportadora
tipo_operacao
status
total_pacotes
criado_em
finalizado_em
```

Status:

```txt
aberta
finalizada
```

No Supabase planejado:

```txt
id
loja_id
marketplace_id
tipo_operacao
melhor_envio
transportadora_id
status
iniciada_em
finalizada_em
```

Diferenças importantes:

- Frontend salva `marketplace` como nome.
- Frontend salva `transportadora` como nome ou `null`.
- Supabase espera `marketplace_id` e `transportadora_id`.
- Frontend tem `total_pacotes`; Supabase não tem coluna para total, então precisa calcular por query ou adicionar coluna.
- Frontend usa `criado_em`; Supabase usa `iniciada_em`.

### Pacote atual

Tipo:

```ts
DispatchPackage
```

Campos:

```txt
id
lote_id
loja_id
codigo_rastreio
marketplace
melhor_envio
transportadora
tipo_operacao
status
data_hora_bipagem
criado_em
```

Status possíveis:

```txt
Pendente na sessão
Bipado
Em separação
Pronto para envio
Finalizado
Cancelado
```

No Supabase planejado:

```txt
id
codigo
loja_id
marketplace_id
transportadora_id
sessao_id
tipo_operacao
melhor_envio
status
bipado_em
finalizado_em
cancelado_em
```

Diferenças importantes:

- Frontend usa `codigo_rastreio`; Supabase usa `codigo`.
- Frontend usa `lote_id`; Supabase usa `sessao_id`.
- Frontend usa nomes de marketplace/transportadora; Supabase usa IDs.
- Frontend usa status em português com maiúsculas; Supabase usa default `bipado` minúsculo.
- Frontend tem `criado_em`; Supabase não tem `created_at` em `pacotes`.

### Movimentação atual

Tipo:

```ts
PackageMovement
```

Campos:

```txt
id
lote_id
loja_id
pacote_id
codigo_rastreio
marketplace
melhor_envio
transportadora
tipo_operacao
tipo_movimentacao
data_hora
criado_em
```

Tipos de movimentação:

```txt
Bipagem
Cancelamento
Conferência
Separação
Expedição
```

No Supabase planejado:

```txt
id
pacote_id
loja_id
sessao_id
tipo_movimentacao
descricao
criada_em
```

Diferenças importantes:

- Movimentação local guarda muitos dados duplicados do pacote.
- Supabase guarda menos dados e espera join com pacote/sessão.
- Para relatórios, será necessário fazer joins ou enriquecer a query.

### Cancelamento atual

Tipo:

```ts
PackageCancellation
```

Campos:

```txt
id
pacote_id
loja_id
loja_nome
sessao_id
codigo_pacote
marketplace
tipo_operacao
melhor_envio
transportadora
data_hora_bipagem
cancelado_em
justificativa_geral
justificativa_individual
criado_em
```

No Supabase planejado:

```txt
id
pacote_id
codigo_pacote
loja_id
marketplace_id
transportadora_id
sessao_id
tipo_operacao
melhor_envio
justificativa_geral
justificativa_individual
bipado_em
cancelado_em
```

Diferenças importantes:

- Frontend guarda `loja_nome`.
- Frontend guarda marketplace/transportadora como nome.
- Supabase guarda IDs.
- Frontend usa `data_hora_bipagem`; Supabase usa `bipado_em`.
- Frontend tem `criado_em`; Supabase não tem esse campo em `pacotes_cancelados`.

## Arquivos importantes para integração

### Arquivos de dados

```txt
app/_lib/mock-data.ts
```

Contém tipos, mocks, filtros, normalização, resumo e helpers. É o arquivo mais importante para entender o modelo atual.

```txt
app/_lib/local-store.ts
```

Contém todos os hooks que leem/escrevem `localStorage`.

```txt
lib/database.ts
```

Camada Supabase já iniciada com funções CRUD e tipos de linhas.

```txt
lib/supabaseClient.ts
```

Criação do cliente Supabase.

```txt
supabase/schema.sql
```

Schema SQL inicial.

### Arquivos de tela

```txt
app/dashboard/page.tsx
app/bipagem/page.tsx
app/pacotes/page.tsx
app/pacotes-cancelados/page.tsx
app/relatorios/page.tsx
app/cadastros/page.tsx
```

Esses arquivos ainda passam dados mockados para as views.

### Arquivos de componentes

```txt
app/_components/app-shell.tsx
app/_components/navigation.tsx
app/_components/ui.tsx
app/_components/package-filters.tsx
```

Importantes para layout, navegação, filtros e UI.

### Arquivos de filtros

```txt
app/_components/package-filters.tsx
app/_lib/mock-data.ts
```

Funções relevantes:

```txt
createDefaultPackageFilters
filterPackages
filterCancellations
getDateRangeFromFilters
describeDateFilter
normalizeTrackingCode
```

### Arquivos de relatórios

```txt
app/relatorios/relatorios-view.tsx
app/_lib/mock-data.ts
```

Funções relevantes:

```txt
getReportSummary
filterPackages
describeDateFilter
formatPackageDate
```

### Arquivos de cadastros

```txt
app/cadastros/cadastros-view.tsx
app/_lib/local-store.ts
lib/database.ts
```

Funções locais atuais:

```txt
addStore
addMarketplace
addCarrier
removeStore
removeMarketplace
removeCarrier
```

Funções Supabase já existentes:

```txt
getLojas
createLoja
updateLoja
inativarLoja
excluirLoja
getMarketplaces
createMarketplace
updateMarketplace
inativarMarketplace
excluirMarketplace
getTransportadoras
createTransportadora
updateTransportadora
inativarTransportadora
excluirTransportadora
```

### Arquivos de bipagem

```txt
app/bipagem/bipagem-form.tsx
app/_lib/local-store.ts
app/_lib/mock-data.ts
lib/database.ts
```

Funções locais importantes:

```txt
addFinishedBatch
addPackageCancellations
updatePackageCancellation
```

Funções Supabase já existentes:

```txt
createSessaoBipagem
createPacote
createMovimentacao
finalizarSessao
cancelarPacotes
```

## Dependências

### Dependências principais

Do `package.json`:

```json
{
  "@supabase/supabase-js": "^2.108.2",
  "next": "16.2.9",
  "react": "19.2.4",
  "react-dom": "19.2.4"
}
```

### Dev dependencies

```json
{
  "@tailwindcss/postcss": "^4",
  "@types/node": "^20",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  "eslint": "^9",
  "eslint-config-next": "16.2.9",
  "tailwindcss": "^4",
  "typescript": "^5"
}
```

### Supabase

`@supabase/supabase-js` já está instalado.

### ORM/biblioteca de banco

Não encontrei ORM.

Não há Prisma, Drizzle, Kysely ou similar.

### Dependência desnecessária ou suspeita

Não encontrei dependência claramente suspeita.

Pontos de atenção:

- `@supabase/supabase-js` já está instalado, mas a UI ainda não usa de fato a camada Supabase.
- Não existe script de teste.
- O README ainda é o padrão do `create-next-app`.
- `package.json` e `package-lock.json` estão modificados no Git.
- O projeto usa Node local `v24.16.0`; os tipos instalados são `@types/node ^20`, o que geralmente não impede funcionamento, mas é bom padronizar versão de Node do projeto depois.

## Riscos encontrados

### 1. UI ainda acoplada a mock + localStorage

As páginas importam diretamente mocks de:

```txt
app/_lib/mock-data.ts
```

E usam hooks de:

```txt
app/_lib/local-store.ts
```

Isso significa que trocar para Supabase não é só trocar uma função: será necessário criar uma camada de serviços/hook intermediária.

### 2. Supabase já existe, mas não está ligado às telas

`lib/database.ts` tem várias funções, mas as telas principais não chamam essas funções. A única rota que usa Supabase hoje é:

```txt
app/api/supabase-health/route.ts
```

### 3. Mismatch entre nomes locais e colunas Supabase

Exemplos:

```txt
codigo_rastreio -> codigo
lote_id -> sessao_id
marketplace -> marketplace_id
transportadora -> transportadora_id
data_hora_bipagem -> bipado_em
criado_em -> iniciada_em/criada_em
status "Bipado" -> status "bipado"
```

Esse é um dos maiores pontos de risco.

### 4. Uso de nomes em vez de IDs

No frontend atual:

- `marketplace` é string com nome.
- `transportadora` é string com nome.
- relatórios e filtros trabalham com nomes.

No Supabase planejado:

- `marketplace_id` é UUID.
- `transportadora_id` é UUID.

Será necessário mapear nomes para IDs e ajustar filtros.

### 5. IDs locais incompatíveis com UUID

Localmente vários IDs são strings como:

```txt
pkg-001
lote-bsb-amazon-hoje
can-001
mov-1-a
```

Na bipagem nova, IDs são gerados com:

```txt
prefix-Date.now-random
```

No Supabase, IDs são UUID.

Se houver migração de dados locais antigos, será necessário mapear IDs antigos ou permitir IDs textuais. O schema atual usa UUID.

### 6. Status não padronizados

Frontend usa status em português e capitalizados:

```txt
Pendente na sessão
Bipado
Em separação
Pronto para envio
Finalizado
Cancelado
```

Supabase usa default minúsculo:

```txt
bipado
aberta
finalizada
cancelado
```

É necessário criar mapa oficial de status.

### 7. Cancelamento local não atualiza pacote local diretamente

O sistema local remove pacotes ativos usando a lista de cancelamentos:

```txt
getActivePackages(packages, cancellations)
```

No Supabase, a função `cancelarPacotes` já atualiza `pacotes.status = cancelado`, além de inserir em `pacotes_cancelados`. Essa diferença pode causar comportamento diferente se a UI não for adaptada com cuidado.

### 8. Sessão aberta fica em localStorage separado

A sessão em andamento fica em:

```txt
sistema-despacho-bipagem-draft-v1
```

Isso não existe no schema Supabase. Será preciso decidir:

- sessão em andamento continua local até finalizar;
- ou sessão aberta passa a existir no Supabase;
- ou um modelo híbrido.

### 9. Schema sem RLS/autenticação

O próprio `supabase/schema.sql` diz:

```txt
Nesta fase nao ha login, usuarios, perfis ou RLS.
```

E no final desativa RLS nas tabelas.

Como o app usa chave pública no frontend, isso é risco de segurança quando for para produção. Para uso interno controlado pode ser aceitável temporariamente, mas precisa ser decisão consciente.

### 10. Falta de transação atômica

Operações como finalizar sessão e cancelar pacotes envolvem múltiplas escritas:

- sessão
- pacotes
- movimentações
- cancelamentos

Com Supabase JS direto, se uma parte falhar, pode ficar dado parcial. Idealmente algumas operações deveriam virar RPC SQL.

### 11. Relatórios dependem de dados já enriquecidos

Hoje `DispatchPackage` carrega:

- nome do marketplace
- nome da transportadora
- loja via helper
- tipo de operação
- melhor envio

No banco, isso exigirá joins com lojas, marketplaces e transportadoras.

### 12. Dados locais usam dedupe global por rastreio

O localStorage deduplica pacotes por `codigo_rastreio` normalizado. O schema também cria índice único global:

```sql
idx_pacotes_codigo_normalizado
```

Isso impede o mesmo código em qualquer loja/sessão. Se essa for a regra desejada, ok. Se a regra for por loja ou por período, precisa alterar.

### 13. Campos existentes no frontend ausentes no schema

Exemplos:

- `Store.document`
- `Store.city`
- `Marketplace.code`
- `Carrier.service`
- `DispatchBatch.total_pacotes`
- `DispatchPackage.criado_em`
- `PackageCancellation.loja_nome`
- `PackageCancellation.criado_em`

Pode ser intencional, mas precisa validar antes de migrar.

### 14. Encoding/acentuação

Na leitura dos arquivos apareceram textos como:

```txt
BrasÃ­lia
SÃ£o Paulo
RelatÃ³rios
SessÃ£o
```

Pode ser apenas renderização do terminal, mas pode ser arquivo com acentuação quebrada. Recomendo confirmar visualmente no navegador antes de iniciar a integração.

## Plano recomendado para integrar com Supabase

### Etapa 0 — Congelar diagnóstico e decidir regra de dados

Antes de codar:

- Confirmar se o Supabase será sem login mesmo.
- Confirmar se RLS ficará desativado temporariamente.
- Confirmar se código/rastreio deve ser único globalmente.
- Confirmar se sessão aberta deve existir no banco ou só ao finalizar.
- Confirmar se dados locais atuais precisam ser migrados ou podem ser descartados.

### Etapa 1 — Validar cliente Supabase

Já existem:

```txt
lib/supabaseClient.ts
app/api/supabase-health/route.ts
```

Próximo ajuste futuro:

- Criar `.env.example`.
- Padronizar variáveis:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Testar `/api/supabase-health`.
- Decidir se a health route fica ou se será removida depois.

### Etapa 2 — Revisar schema SQL

Arquivo:

```txt
supabase/schema.sql
```

Antes de usar em produção, revisar:

- Campos ausentes.
- Status como enum/check.
- Índice único de pacotes.
- `created_at`/`updated_at`.
- RLS.
- Tabelas de relacionamento.
- Joins necessários para relatórios.

Sugestões de ajuste:

- Adicionar `created_at` em `pacotes`.
- Adicionar `created_at` em `pacotes_cancelados`.
- Considerar `updated_at`.
- Considerar `total_pacotes` ou calcular sempre.
- Considerar `document/city` em lojas, se ainda forem úteis.
- Considerar `code` em marketplaces.
- Considerar `service` em transportadoras.

### Etapa 3 — Criar camada de serviços para a UI

Hoje a UI usa:

```txt
useCatalogs
useStoredPackages
usePackageCancellations
useStoredMovements
useDispatchStorage
```

Criar uma abstração que permita trocar a fonte:

```txt
localStorage -> Supabase
```

Sem reescrever todas as telas de uma vez.

Exemplo conceitual:

```txt
app/_lib/dispatch-service.ts
app/_lib/catalog-service.ts
```

Ou adaptar `local-store.ts` para virar uma camada de storage com implementações.

### Etapa 4 — Migrar cadastros primeiro

Começar por:

- lojas
- marketplaces
- transportadoras

Motivo:

- São entidades menores.
- São base para bipagem e relatórios.
- A UI já tem tela simples.

Cuidados:

- Converter `status` local para `ativo`.
- Converter `name` para `nome`.
- Gerar/usar `slug`.
- Decidir se exclusão continuará sendo inativação.

### Etapa 5 — Migrar leitura de pacotes e relatórios em modo somente leitura

Antes de gravar bipagem no banco, fazer as telas lerem do Supabase:

- `/dashboard`
- `/pacotes`
- `/relatorios`
- `/pacotes-cancelados`

Isso força resolver joins e mapping sem mexer ainda no fluxo mais sensível de bipagem.

### Etapa 6 — Migrar bipagem/finalização

Manter comportamento atual:

- pacotes ficam em sessão local enquanto o lote está aberto;
- ao finalizar, grava no Supabase.

Ou mudar para:

- cria sessão `aberta` no Supabase no primeiro bip;
- grava cada pacote ao bipar;
- finalizar atualiza sessão e pacotes.

Recomendação mais segura para começar:

- manter rascunho local durante a sessão;
- gravar no Supabase somente ao finalizar;
- depois evoluir para sessão aberta online.

### Etapa 7 — Migrar cancelamentos

A operação de cancelamento deve ser atômica:

- inserir em `pacotes_cancelados`;
- atualizar pacote para `cancelado`;
- inserir movimentação.

Idealmente criar RPC SQL para evitar gravação parcial.

### Etapa 8 — Migrar histórico de lotes

Histórico deve vir de:

```txt
sessoes_bipagem
pacotes
movimentacoes
```

Com joins para:

```txt
lojas
marketplaces
transportadoras
```

### Etapa 9 — Migrar relatórios

Adaptar filtros para trabalhar com IDs:

- `loja_id`
- `marketplace_id`
- `transportadora_id`
- `tipo_operacao`
- `melhor_envio`
- intervalo de datas

Depois decidir se filtros serão client-side ou query no banco.

Para poucos dados, client-side funciona. Para muitos dados, filtrar no Supabase.

### Etapa 10 — Remover ou isolar dados locais antigos

Depois que Supabase estiver estável:

- manter `localStorage` apenas para rascunho da sessão aberta;
- ou remover tudo;
- ou criar botão de limpeza/migração.

Não remover antes de validar produção.

## Próximo passo sugerido

O próximo passo mais seguro é **não mexer ainda na bipagem**. Primeiro, validar o Supabase com o schema atual e ligar somente os **cadastros** ao banco, porque lojas, marketplaces e transportadoras são a base de todo o restante e têm menor risco operacional.

Depois disso, criar uma camada de serviço para substituir `local-store.ts` aos poucos, mantendo a UI funcionando enquanto cada módulo migra para Supabase.
