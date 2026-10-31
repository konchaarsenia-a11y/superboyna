#!/usr/bin/env bash
# Собрать статику goodboy/ и залить на Cloudflare Pages.
# Имя: goodboy/.cf-pages-project или первое свободное goodboy → goodboy-by → goodboy-minsk.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/goodboy"
DIST="$ROOT/.goodboy-pages-dist"
PIN_FILE="$SRC/.cf-pages-project"
CANDIDATES=(goodboy goodboy-by goodboy-minsk)

rm -rf "$DIST"
mkdir -p "$DIST"

# Корень сайта = содержимое goodboy/ (относительные css/js/assets/data уже от корня).
shopt -s dotglob nullglob
for item in "$SRC"/*; do
  base="$(basename "$item")"
  case "$base" in
    MIGRATE-BY.md|README.md|CODE_GS_GOODBOY.snippet.gs|redirects-from-pages|audit|scripts|.gitignore|.cf-pages-project|.htaccess)
      continue
      ;;
  esac
  cp -a "$item" "$DIST/"
done
shopt -u dotglob nullglob

echo "Dist files: $(find "$DIST" -type f | wc -l)"

project_names_json() {
  npx --yes wrangler@4 pages project list --json 2>/dev/null || echo '[]'
}

has_project() {
  local name="$1"
  local raw
  raw="$(project_names_json)"
  python3 -c "
import json, sys
name = sys.argv[1]
raw = sys.stdin.read() or '[]'
try:
    data = json.loads(raw)
except Exception:
    sys.exit(1)
names = []
if isinstance(data, list):
    for p in data:
        if isinstance(p, dict):
            names.append(str(p.get('name') or ''))
        elif isinstance(p, str):
            names.append(p)
elif isinstance(data, dict):
    for p in (data.get('result') or data.get('projects') or []):
        if isinstance(p, dict):
            names.append(str(p.get('name') or ''))
sys.exit(0 if name in names else 1)
" "$name" <<<"$raw"
}

pick=""
prod_host=""

if [ -f "$PIN_FILE" ]; then
  pin="$(tr -d '[:space:]' < "$PIN_FILE")"
  if [ -n "$pin" ]; then
    pick="$pin"
    echo "Pinned Pages project: $pick"
  fi
fi

if [ -z "$pick" ]; then
  for name in "${CANDIDATES[@]}"; do
    if has_project "$name"; then
      pick="$name"
      echo "Reuse existing Pages project: $pick"
      break
    fi
  done
fi

if [ -z "$pick" ]; then
  for name in "${CANDIDATES[@]}"; do
    echo "Trying create Pages project: $name"
    set +e
    create_out="$(npx --yes wrangler@4 pages project create "$name" --production-branch main 2>&1)"
    create_rc=$?
    set -e
    echo "$create_out"
    if echo "$create_out" | grep -q "Successfully created"; then
      pick="$name"
      prod_host="$(echo "$create_out" | sed -n 's/.*https:\/\/\([a-zA-Z0-9.-]*\.pages\.dev\).*/\1/p' | head -1)"
      break
    fi
    if echo "$create_out" | grep -qi "already exists"; then
      pick="$name"
      echo "Project already exists, reuse: $pick"
      break
    fi
    echo "Create failed for $name (rc=$create_rc) — next candidate"
  done
fi

if [ -z "$pick" ]; then
  echo "::error::No free Cloudflare Pages name among: ${CANDIDATES[*]}"
  exit 1
fi

# Небольшой retry: сразу после create список/деплой иногда не видит проект.
echo "Deploying to project=$pick"
deploy_out=""
deploy_rc=1
for attempt in 1 2 3 4 5; do
  set +e
  deploy_out="$(npx --yes wrangler@4 pages deploy "$DIST" --project-name "$pick" --branch main --commit-dirty=true 2>&1)"
  deploy_rc=$?
  set -e
  echo "$deploy_out"
  if [ "$deploy_rc" -eq 0 ]; then
    break
  fi
  echo "Deploy attempt $attempt failed — sleep and retry"
  sleep $((attempt * 3))
done
if [ "$deploy_rc" -ne 0 ]; then
  echo "::error::pages deploy failed for $pick"
  exit "$deploy_rc"
fi

if [ -z "$prod_host" ]; then
  prod_host="$(echo "$deploy_out" | sed -n 's/.*https:\/\/[a-f0-9]\{6,\}\.\([a-zA-Z0-9.-]*\.pages\.dev\).*/\1/p' | tail -1)"
fi
if [ -z "$prod_host" ]; then
  # Известный alias для проекта goodboy в этом аккаунте.
  if [ "$pick" = "goodboy" ]; then
    prod_host="goodboy-5s4.pages.dev"
  else
    prod_host="${pick}.pages.dev"
  fi
fi
url="https://${prod_host}"
echo "GOODBOY_PAGES_URL=$url"
echo "GOODBOY_PAGES_PROJECT=$pick"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Goodboy Cloudflare Pages"
    echo "- project: \`$pick\`"
    echo "- url: $url"
  } >> "$GITHUB_STEP_SUMMARY"
fi
