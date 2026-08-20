# Netin Server

Backend da Fase 2: API Fastify, PostgreSQL e broker Mosquitto para os dispositivos GLaDOS.

## Arquitetura

O backend usa módulos por funcionalidade, em vez de MVC clássico:

```text
src/modules/<feature>/
  <feature>.routes.ts       HTTP: parseia entrada e forma resposta
  <feature>.service.ts      regras de negócio
  <feature>.repository.ts   queries Drizzle
  <feature>.schemas.ts      contratos/validação Zod
src/db/                     cliente, schema Drizzle e migrador
```

Assim, rotas Fastify não conhecem SQL e a regra de negócio não depende de HTTP.
O primeiro módulo é `auth`; dispositivos, pareamento e status seguirão o mesmo
formato.

O esquema PostgreSQL é definido em `src/db/schema.ts` com Drizzle ORM. Migrações
SQL geradas em `drizzle/` são versionadas no Git. No desenvolvimento, altere o
esquema e execute `npm run db:generate`; revise o SQL resultante antes do commit.
Em produção o deploy executa apenas `npm run migrate`, nunca gera migrações.

## Estado atual

- `GET /health` está implementado e publicado em `https://glados-server.13997906387.xyz/health`.
- O broker Mosquitto de produção está em Compose separado, com autenticação e ACL.
- Autenticação por e-mail/senha, pareamento, status e sincronização MQTT estão implementados. Fotos podem ser normalizadas e armazenadas de forma privada; a entrega MQTT de mídia está preparada para a próxima integração do firmware.
- As credenciais MQTT individuais e revogáveis estão preparadas no servidor, mas dependem da ativação do Dynamic Security no Mosquitto. Veja `docs/mqtt-dynamic-security.md`.

## Desenvolvimento local

1. Copie `.env.example` para `.env`.
2. Inicie infraestrutura: `docker compose up -d`.
3. Instale dependências: `npm install`.
4. Execute API: `npm run dev`.
5. Verifique: `curl http://localhost:3000/health`.

Para aplicar migrações localmente depois do build, execute `npm run migrate`.

O Mosquitto de desenvolvimento permite conexões anônimas apenas na máquina local. Credenciais, ACLs e TLS serão configurados antes de qualquer exposição externa.

## Deploy na Raspberry Pi

O deploy usa a rede Docker externa `nginxnet`, o PostgreSQL já existente no host e o Cloudflare Tunnel já conectado ao Nginx.

1. Crie o banco/usuário `netin` no PostgreSQL existente e copie `.env.production.example` para `.env.production` com senhas fortes. A URL deve usar o hostname Docker `postgres`, por exemplo `postgresql://netin:SENHA@postgres:5432/netin`.
2. O Mosquitto usa Dynamic Security. Antes de subir o broker pela primeira vez, siga `docs/mqtt-dynamic-security.md` para inicializar o administrador, os papéis e as credenciais internas.
3. Clone este repositório em `/srv/netin-server` e mantenha `.env.production` e `secrets/` somente na Raspberry.
   Para entrega de mídia, inclua `PUBLIC_API_URL=https://glados-server.13997906387.xyz` e mantenha `MEDIA_STORAGE_PATH=/app/data/media`; o Compose preserva esse diretório no volume `netin_media_data`.
4. Adicione no `nginx.conf` as rotas abaixo e habilite proxy WebSocket com HTTP/1.1:

   ```nginx
   glados-server.13997906387.xyz  netin-server:3000;
   glados-mqtt.13997906387.xyz    mosquitto:9001;
   ```

   O nome resolvido no Nginx é o serviço Compose `mosquitto`; `netin-mosquitto` é apenas o nome do container.
5. Suba o broker uma única vez: `docker compose -f docker-compose.mosquitto.production.yml up -d`.
6. Execute a API: `docker compose -f docker-compose.production.yml up -d --build`.

Depois de configurar o GitHub Actions Runner, pushes na `main` executam testes e chamam `scripts/deploy-production.sh` na Raspberry. O script só aceita um checkout sem alterações locais (o `.env.production` local é a exceção), atualiza com `git pull --ff-only`, recria somente o container da API e valida `GET /health` dentro do container `netin-server`. O Mosquitto é gerenciado pelo Compose separado e não reinicia durante deploys da API.

O Cloudflare Tunnel já encaminha o hostname curinga para o Nginx. Portanto, não é preciso expor portas no roteador: o ESP32 se conectará por `wss://glados-mqtt.13997906387.xyz/mqtt`.

Os hosts públicos devem ter somente um nível antes do domínio (`glados-server`, `glados-mqtt` e `glados`). O certificado Universal SSL do Cloudflare não cobre nomes como `glados.server.13997906387.xyz`.

### Docker rootless e estado do Mosquitto

Nesta Raspberry, Docker roda em modo rootless. O estado do Dynamic Security fica
no volume `mosquitto-data`, em `/mosquitto/data/dynamic-security.json`; não o
apague ao recriar o contêiner. Valide após subir o broker:

```bash
docker compose -f docker-compose.mosquitto.production.yml logs mosquitto
```

## Autenticação HTTP

Depois de aplicar as migrações (`npm run migrate`), a API disponibiliza as rotas
abaixo. A sessão é um cookie `netin_session` `HttpOnly`, `Secure` em produção e
`SameSite=Lax`; a senha nunca é devolvida pela API.

| Método e rota | Corpo | Resultado |
| --- | --- | --- |
| `POST /auth/register` | `email`, `password` (8–128), `displayName` (1–24), `color` opcional | cria conta, abre sessão e retorna usuário; `409` para e-mail existente. |
| `POST /auth/login` | `email`, `password` | abre sessão e retorna usuário; `401` para credenciais inválidas. |
| `POST /auth/logout` | nenhum | revoga a sessão atual e limpa o cookie. |
| `GET /auth/me` | nenhum | retorna o usuário da sessão; `401` sem sessão válida. |

As chamadas da PWA devem usar `credentials: "include"`. O CORS de produção deve
continuar restrito a `https://glados.13997906387.xyz`.
