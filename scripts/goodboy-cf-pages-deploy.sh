#!/usr/bin/env bash
# Собрать статику goodboy/ и залить на Cloudflare Pages.
# Имя проекта: первое свободное из goodboy → goodboy-by → goodboy-minsk.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/goodboy"
DIST="$ROOT/.goodboy-pages-dist"
CANDIDATES=(goodboy goodboy-by goodboy-minsk)

rm -rf "$DIST"
mkdir -p "$DIST"

# Корень сайта = содержимое goodboy/ (относительные css/js/assets/data уже от корня).
# Не публикуем сниппеты, редирект-stubs и служебное.
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

list_json="$(npx --yes wrangler@4 pages project list --json 2>/dev/null || echo '[]')"
pick=""
for name in "${CANDIDATES[@]}"; do
  if python3 -c "
import json, sys
raw = sys.stdin.read() or '[]'
try:
    data = json.loads(raw)
except Exception:
    data = []
names = []
if isinstance(data, list):
    for p in data:
        if isinstance(p, dict):
            names.append(str(p.get('name') or ''))
        elif isinstance(p, str):
            names.append(p)
sys.exit(0 if '$name' in names else 1)
" <<<"$list_json"; then
    pick="$name"
    echo "Reuse existing Pages project: $pick"
    break
  fi
done

if [ -z "$pick" ]; then
  for name in "${CANDIDATES[@]}"; do
    echo "Trying create Pages project: $name"
    if npx --yes wrangler@4 pages project create "$name" --production-branch main; then
      pick="$name"
      break
    fi
    echo "Create failed for $name — next candidate"
  done
fi

if [ -z "$pick" ]; then
  echo "::error::No free Cloudflare Pages name among: ${CANDIDATES[*]}"
  exit 1
fi

echo "Deploying to project=$pick"
out="$(npx --yes wrangler@4 pages deploy "$DIST" --project-name "$pick" --branch main --commit-dirty=true 2>&1 | tee /dev/stderr)"
url="$(echo "$out" | sed -n 's/.*\(https:\/\/[a-zA-Z0-9.-]*\.pages\.dev\).*/\1/p' | tail -1)"
if [ -z "$url" ]; then
  url="https://${pick}.pages.dev"
fi
echo "GOODBOY_PAGES_URL=$url"
echo "GOODBOY_PAGES_PROJECT=$pick"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Goodboy Cloudflare Pages"
    echo "- project: \`$pick\`"
    echo "- url: $url"
  } >> "$GITHUB_STEP_SUMMARY"
fi
