# Netin Server

Backend da Fase 2: API Fastify, PostgreSQL e broker Mosquitto para os dispositivos Netin.

## Desenvolvimento local

1. Copie `.env.example` para `.env`.
2. Inicie infraestrutura: `docker compose up -d`.
3. Instale dependências: `npm install`.
4. Execute API: `npm run dev`.
5. Verifique: `curl http://localhost:3000/health`.

O Mosquitto de desenvolvimento permite conexões anônimas apenas na máquina local. Credenciais, ACLs e TLS serão configurados antes de qualquer exposição externa.

## Deploy na Raspberry Pi

O deploy usa a rede Docker externa `nginxnet`, o PostgreSQL já existente no host e o Cloudflare Tunnel já conectado ao Nginx.

1. Crie o banco/usuário `netin` no PostgreSQL existente e copie `.env.production.example` para `.env.production` com senhas fortes.
2. Crie `secrets/mosquitto/passwordfile` e `secrets/mosquitto/aclfile`; esses arquivos não entram no Git.
3. Clone este repositório em `/srv/netin-server` e mantenha `.env.production` e `secrets/` somente na Raspberry.
4. Adicione no `nginx.conf` a rota `mqtt.netin.13997906387.xyz  mosquitto:9001;` e habilite proxy WebSocket com HTTP/1.1.
5. Suba o broker uma única vez: `docker compose -f docker-compose.mosquitto.production.yml up -d`.
6. Execute a API: `docker compose -f docker-compose.production.yml up -d --build`.

Depois de configurar o GitHub Actions Runner, pushes na `main` executam testes e chamam `scripts/deploy-production.sh` na Raspberry. O script só aceita um checkout sem alterações locais, atualiza com `git pull --ff-only`, recria somente o container da API e valida `GET /health`. O Mosquitto é gerenciado pelo Compose separado e não reinicia durante deploys da API.

O Cloudflare Tunnel já encaminha o hostname curinga para o Nginx. Portanto, não é preciso expor portas no roteador: o ESP32 se conecta por `wss://mqtt.netin.13997906387.xyz/mqtt`.
