# Deploy na VPS com Docker e Caddy

O Caddy é o único serviço que publica as portas `80` e `443` da VPS. O sistema
de bipagem e o futuro sistema fiscal ficam acessíveis somente pela rede Docker
compartilhada `edge`.

## 1. Preparação única

Instale o Docker Engine e o plugin Docker Compose no Ubuntu 24.04. Libere no
firewall apenas SSH e as portas web `80/tcp` e `443/tcp`. Depois, crie a rede
compartilhada:

```bash
docker network inspect edge
```

Se ela ainda não existir:

```bash
docker network create edge
```

## 2. Variáveis protegidas

Copie `deploy/bipagem.env.example` para um arquivo fora do repositório, com
permissão `600`, e preencha todos os campos. Faça o mesmo com
`deploy/gateway/gateway.env.example`. Em `BASE_DOMAIN`, informe somente o
domínio-base público, sem protocolo nem caminho. Os nomes padrão criam os
endereços `bipagem.<domínio-base>` e `nfe.<domínio-base>`; eles podem ser
alterados por `BIPAGEM_SUBDOMAIN` e `FISCAL_SUBDOMAIN`.

Durante a migração, mantenha `LEGACY_BIPAGEM_DOMAIN` e
`LEGACY_FISCAL_DOMAIN` com os endereços `sslip.io` atuais. O mesmo bloco do
Caddy atende o endereço novo e o temporário, permitindo validar e reverter o
corte sem indisponibilidade.

Exemplo de locais no servidor:

```text
/etc/sistema-despacho/bipagem.env
/etc/caddy-gateway/gateway.env
```

Nunca salve esses dois arquivos preenchidos no Git.

## 3. Iniciar a bipagem

Na raiz do repositório:

```bash
docker compose --env-file /etc/sistema-despacho/bipagem.env -f compose.yml up -d --build
```

O serviço `bipagem-web` expõe a porta `3000` apenas dentro da rede `edge`; ele
não abre nenhuma porta diretamente na VPS.

## 4. Iniciar o gateway HTTPS

```bash
docker compose --env-file /etc/caddy-gateway/gateway.env -f deploy/gateway/compose.yml up -d
```

O Caddy solicita e renova o certificado automaticamente quando o domínio já
aponta para a VPS e as portas `80` e `443` estão acessíveis.

Antes de recriar o gateway, crie no DNS dois registros `A` apontando para o
IPv4 da VPS:

```text
bipagem.<domínio-base>
nfe.<domínio-base>
```

No Supabase Auth, configure a Site URL e a Redirect URL de produção como
`https://bipagem.<domínio-base>/login`. A tela de login monta os retornos de
confirmação e recuperação pela origem atual, então não existe domínio fixo no
código da aplicação.

Para conferir o estado:

```bash
docker compose --env-file /etc/sistema-despacho/bipagem.env -f compose.yml ps
docker compose --env-file /etc/caddy-gateway/gateway.env -f deploy/gateway/compose.yml ps
```

## Atualizações

Depois de atualizar o código, reconstrua somente a aplicação:

```bash
docker compose --env-file /etc/sistema-despacho/bipagem.env -f compose.yml up -d --build
```

Os dados e certificados do Caddy ficam nos volumes `caddy_data` e
`caddy_config` e não são removidos nessa atualização.

## Sistema fiscal no mesmo domínio-base

O Compose do sistema fiscal deve conectar `fiscal-web` à mesma rede externa
`edge`, expor somente `8080` internamente e não publicar `80` ou `443`. O
gateway já publica os dois sistemas de forma isolada:

```text
bipagem.<domínio-base> -> bipagem-web:3000
nfe.<domínio-base>     -> fiscal-web:8080
```

Ao trocar o domínio-base, recrie apenas o gateway e ajuste `APP_URL` e
`NOTAS_DOMAIN` no ambiente do projeto fiscal para o endereço `nfe` definitivo.
Não inicie nginx, Traefik ou outro Caddy nas portas públicas.

## Observação sobre a variável do Caddy

No `deploy/gateway/Caddyfile`, `{$BASE_DOMAIN}`, `{$BIPAGEM_SUBDOMAIN}` e
`{$FISCAL_SUBDOMAIN}` são substituídas pelo próprio Caddy dentro do contêiner,
assim como `{$LEGACY_BIPAGEM_DOMAIN}` e `{$LEGACY_FISCAL_DOMAIN}`, que preservam
os endereços temporários durante a transição. Nenhuma delas é substituída pelo
Docker Compose. No arquivo inline do Docker Manager da Hostinger, os
endereços são montados pelo Compose durante o redeploy. Por isso, alterar as
variáveis exige recriar o gateway, e não apenas reiniciar o contêiner.
