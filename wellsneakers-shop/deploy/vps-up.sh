#!/usr/bin/env bash
# Поднять стек на VPS. Запускать из любого места: bash deploy/vps-up.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Нет .env — скопируй .env.example и заполни (см. DEPLOY.md)."
  exit 1
fi

if grep -q '^ALLOW_DEV_STAFF=1' .env; then
  echo "WARN: ALLOW_DEV_STAFF=1 — на проде должно быть 0."
fi

docker compose up -d --build
docker compose ps
echo "--- health ---"
curl -sS --fail http://127.0.0.1:8080/api/health
echo
echo "OK. Дальше: системный nginx + certbot (DEPLOY.md §7)."
