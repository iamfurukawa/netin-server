#!/usr/bin/env bash
set -euo pipefail

deploy_dir="${NETIN_SERVER_DIR:-/srv/netin-server}"

if [[ ! -d "$deploy_dir/.git" ]]; then
  echo "Repositorio de deploy ausente em $deploy_dir" >&2
  exit 1
fi

local_changes="$(git -C "$deploy_dir" status --porcelain --untracked-files=all | grep -vE '^\?\? \.env\.production$' || true)"
if [[ -n "$local_changes" ]]; then
  echo "O diretorio de deploy contem alteracoes locais; resolva-as antes do deploy." >&2
  exit 1
fi

if [[ ! -f "$deploy_dir/.env.production" ]]; then
  echo "Arquivo ausente: $deploy_dir/.env.production" >&2
  exit 1
fi

git -C "$deploy_dir" pull --ff-only origin main
cd "$deploy_dir"
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml run --rm netin-server npm run migrate
docker compose -f docker-compose.production.yml up -d

for attempt in {1..15}; do
  if docker compose -f docker-compose.production.yml exec -T netin-server node -e '
    (async () => {
      const response = await fetch("http://127.0.0.1:3000/health");
      if (!response.ok) process.exit(1);
      const body = await response.json();
      if (body.status !== "ok") process.exit(1);
    })().catch(() => process.exit(1));
  '; then
    echo "Deploy concluido e health check do container aprovado."
    exit 0
  fi
  sleep 2
done

echo "O container iniciou, mas o health check falhou." >&2
exit 1
