# Hospedar na escola

Para usar o CodeArena fora da sua máquina, com HTTPS e sem perder dados, rode a imagem Docker com o Caddy na frente.
O Caddy emite e renova o certificado sozinho e repassa a conexão em tempo real (Socket.IO).

## O que você precisa

- Um servidor com **Docker** e **Docker Compose** (uma VPS pequena ou um computador da escola sempre ligado).
- Um **domínio** apontando para o IP do servidor (registro `A`), por exemplo `codearena.suaescola.edu.br`.
- As portas **80 e 443** liberadas para a internet (o Caddy usa a 80 para validar o certificado).

Sem domínio ou sem poder abrir portas? Veja [Sem domínio próprio](#sem-dominio-proprio).

## Subindo

```bash
git clone https://github.com/Gabrielll04/CodeArena.git
cd CodeArena
CODEARENA_DOMAIN=codearena.suaescola.edu.br docker compose up -d --build
```

Em um ou dois minutos, `https://codearena.suaescola.edu.br/teacher` abre a área do professor. Os alunos entram por
`https://codearena.suaescola.edu.br/join`.

Para não digitar o domínio toda vez, crie um arquivo `.env` ao lado do `docker-compose.yml`:

```bash
CODEARENA_DOMAIN=codearena.suaescola.edu.br
```

## Onde ficam os dados

Packs criados pelos professores e o histórico de sessões ficam no volume `codearena-data` (pasta `/data` dentro do
contêiner). Ele sobrevive a reinícios e atualizações da imagem. Nunca rode `docker compose down -v`: o `-v` apaga os
volumes.

## Atualizando

```bash
git pull
docker compose up -d --build
```

Ao receber o sinal de parada, o servidor encerra as sessões em andamento e grava tudo no histórico antes de sair.
Se o processo morrer de repente (falta de energia, travamento), a sessão é recuperada no próximo início, marcada como
**Interrompida** no Histórico.

## Backup

Copie o volume de dados para um arquivo compactado. Rode como tarefa diária (cron) e guarde o arquivo fora do servidor:

```bash
docker run --rm -v codearena_codearena-data:/data:ro -v "$PWD":/backup busybox \
  tar czf /backup/codearena-$(date +%F).tar.gz -C /data .
```

O nome do volume leva o nome da pasta do projeto na frente (`codearena_`). Confira com `docker volume ls`.

## Logs

```bash
docker compose logs -f codearena
```

O servidor escreve um log em JSON por linha. O Compose guarda até 5 arquivos de 10 MB por serviço, então o disco não
enche.

## Alertas

- **Servidor fora do ar:** cadastre `https://seu-dominio/api/health` num monitor gratuito (UptimeRobot, Better Stack e
  similares) para receber e-mail ou mensagem quando ele parar de responder com `{"status":"ok"}`.
- **Contêiner travado:** a imagem tem `HEALTHCHECK` na mesma rota; `docker compose ps` mostra `unhealthy` quando ela
  falha, e o `restart: unless-stopped` sobe o serviço de novo depois de uma queda.

## Sem domínio próprio

- **Cloudflare Tunnel:** expõe o servidor com HTTPS sem abrir portas no roteador. Rode só o serviço `codearena`
  (`docker compose up -d codearena`) e aponte o túnel para `http://localhost:3000` (publique a porta com
  `ports: ["127.0.0.1:3000:3000"]` no serviço).
- **Só na rede da escola:** `docker run -d -p 3000:3000 -v codearena-data:/data $(docker build -q .)` e os alunos
  entram por `http://IP-do-servidor:3000`. Sem HTTPS, use apenas em rede local.

## Plugins

A imagem usa os plugins de `codearena.config.json`. Para mudar a lista, rode `pnpm codearena plugins add <pacote>` no
repositório antes do `docker compose up -d --build`, como em [Plugins e packs](./plugins-e-packs.md).
