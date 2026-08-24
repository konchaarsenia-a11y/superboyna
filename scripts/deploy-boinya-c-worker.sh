#!/usr/bin/env bash
# Deploy Бойня C Cloudflare Worker (needs CLOUDFLARE_API_TOKEN).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/boinya-c/proxy"
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Need CLOUDFLARE_API_TOKEN (or: gh workflow run boinya-c-worker.yml)" >&2
  exit 1
fi
npx wrangler@4 deploy
curl -fsSL --max-time 30 "https://boinya-c.konchaarsenia.workers.dev/?action=ping&cutover=1"
echo
echo "OK: https://boinya-c.konchaarsenia.workers.dev"
