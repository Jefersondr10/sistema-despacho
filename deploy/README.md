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
`deploy/gateway/gateway.env.example`. Em `BIPAGEM_DOMAIN`, informe somente o
domínio público, sem caminho, depois de apontar o DNS para a VPS.

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

## Adicionar o sistema fiscal depois

O Compose do sistema fiscal deve conectar `fiscal-web` à mesma rede externa
`edge`, expor somente `8080` internamente e não publicar `80` ou `443`. Adicione
`FISCAL_DOMAIN` ao ambiente do Caddy e acrescente ao `Caddyfile`:

```caddyfile
{$FISCAL_DOMAIN} {
  encode zstd gzip
  reverse_proxy fiscal-web:8080
}
```

Então recrie apenas o gateway. Não inicie nginx, Traefik ou outro Caddy nas
portas públicas.

## Observação sobre a variável do Caddy

`{$BIPAGEM_DOMAIN}` é substituída pelo próprio Caddy dentro do contêiner, não
pelo Docker Compose. Por isso, uma validação direta do `Caddyfile` fora do
Compose precisa receber essa variável; pelo fluxo acima ela é fornecida pelo
arquivo `gateway.env`.
