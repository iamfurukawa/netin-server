#!/usr/bin/env bash
set -euo pipefail

deploy_dir="${NETIN_SERVER_DIR:-/srv/netin-server}"

if [[ ! -d "$deploy_dir/.git" ]]; then
  echo "Repositorio de deploy ausente em $deploy_dir" >&2
  exit 1
fi

if [[ -n "$(git -C "$deploy_dir" status --porcelain)" ]]; then
  echo "O diretorio de deploy contem alteracoes locais; resolva-as antes do deploy." >&2
  exit 1
fi

if [[ ! -f "$deploy_dir/.env.production" ]]; then
  echo "Arquivo ausente: $deploy_dir/.env.production" >&2
  exit 1
fi

git -C "$deploy_dir" pull --ff-only origin main
cd "$deploy_dir"
docker compose -f docker-compose.production.yml up -d --build --remove-orphans

for attempt in {1..15}; do
  if curl --fail --silent --show-error http://localhost:3000/health >/dev/null; then
    echo "Deploy concluido e health check aprovado."
    exit 0
  fi
  sleep 2
done

echo "O container iniciou, mas o health check falhou." >&2
exit 1
