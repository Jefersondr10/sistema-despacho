# Implantação do Sistema de Bipagem na Hostinger VPS

Esta implantação move somente a aplicação Next.js para a VPS. Nesta primeira etapa, banco de dados, autenticação, RLS e RPCs continuam no Supabase. Isso reduz o risco da migração e permite voltar ao ambiente anterior apenas alterando o DNS.

## VPS recomendada

- Hostinger KVM 2 ou superior
- Ubuntu 24.04 com Docker
- Região da América do Sul, quando disponível
- Backups diários habilitados
- Um subdomínio, por exemplo: `bipagem.seudominio.com.br`

## 1. Preparar a VPS

No hPanel, instale o modelo **Ubuntu 24.04 com Docker**. Cadastre uma chave SSH e mantenha abertas apenas as portas necessárias:

- `22/tcp`: SSH
- `80/tcp`: emissão e renovação do HTTPS
- `443/tcp` e `443/udp`: acesso ao sistema

Prefira autenticação por chave SSH. Depois de confirmar o acesso por chave, desative login SSH por senha.

## 2. Configurar DNS

Crie um registro `A` para o subdomínio apontando ao IPv4 público da VPS. Exemplo:

```text
Tipo: A
Nome: bipagem
Valor: IP_PUBLICO_DA_VPS
TTL: 300
```

Não desative a publicação atual antes dos testes.

## 3. Baixar o projeto

```bash
sudo mkdir -p /opt/origem
sudo chown "$USER":"$USER" /opt/origem
cd /opt/origem
git clone https://github.com/Jefersondr10/sistema-despacho.git bipagem
cd bipagem
```

Enquanto esta configuração ainda estiver em revisão, use a branch:

```bash
git checkout infra/hostinger-vps
```

## 4. Criar as variáveis de produção

```bash
cp deploy/hostinger/.env.production.example deploy/hostinger/.env.production
nano deploy/hostinger/.env.production
chmod 600 deploy/hostinger/.env.production
```

Preencha os valores atuais do Supabase e do Resend. Nunca envie esse arquivo ao GitHub.

Os valores `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` entram no build da aplicação. Ao alterá-los, reconstrua a imagem.

## 5. Validar e iniciar

```bash
docker compose \
  --env-file deploy/hostinger/.env.production \
  -f deploy/hostinger/compose.yml \
  config

docker compose \
  --env-file deploy/hostinger/.env.production \
  -f deploy/hostinger/compose.yml \
  up -d --build
```

Conferir estado e logs:

```bash
docker compose -f deploy/hostinger/compose.yml ps
docker compose -f deploy/hostinger/compose.yml logs --tail=200 bipagem
docker compose -f deploy/hostinger/compose.yml logs --tail=100 caddy
```

O Caddy obtém e renova o certificado HTTPS automaticamente depois que o domínio estiver apontando para a VPS.

## 6. Ajustar o Supabase Auth

No Supabase, adicione o novo endereço em **Authentication > URL Configuration**:

```text
https://bipagem.seudominio.com.br/login
```

Mantenha o endereço antigo durante a homologação.

## 7. Homologação obrigatória

Antes de trocar o domínio principal, teste:

1. login e recuperação de senha;
2. carregamento das lojas, marketplaces e transportadoras;
3. bipagem normal e tentativa duplicada;
4. dois aparelhos bipando simultaneamente;
5. finalização e reabertura de lote;
6. cancelamento com justificativa;
7. histórico, filtros e romaneio;
8. leitura pela câmera no celular;
9. feedback e envio de e-mail;
10. atualização da página sem perda da sessão.

## 8. Troca definitiva

Somente após a homologação:

1. crie um snapshot manual da VPS;
2. confirme que o backup do Supabase está disponível;
3. altere o DNS do domínio principal ou passe a usar o novo subdomínio;
4. mantenha a publicação anterior disponível por alguns dias;
5. monitore logs, CPU, RAM, disco e erros de autenticação.

Como os dados continuam no Supabase, o rollback consiste em apontar o DNS de volta ao ambiente anterior. Não há cópia divergente do banco.

## Atualização futura

```bash
cd /opt/origem/bipagem
git pull --ff-only
docker compose \
  --env-file deploy/hostinger/.env.production \
  -f deploy/hostinger/compose.yml \
  up -d --build --remove-orphans
```

## Estrutura para o sistema fiscal

A rede Docker `origem_web` foi nomeada explicitamente para permitir que o futuro sistema de notas fiscais use a mesma camada HTTPS, mantendo aplicação, banco e filas em contêineres separados. Os bancos dos dois sistemas não serão misturados.
