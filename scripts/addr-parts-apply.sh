#!/usr/bin/env bash
set -euo pipefail
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  unset CLOUDFLARE_ACCOUNT_ID
fi
bash "$(cd "$(dirname "$0")" && pwd)/addr-parts-read.sh"
OUT="${GITHUB_WORKSPACE}/artifacts/addr-parts"
TOKEN=$(openssl rand -hex 32)
echo "::add-mask::$TOKEN"
put_ok=0
for i in 1 2 3 4 5 6; do
  if printf '%s' "$TOKEN" | npx --yes wrangler@4 secret put ADDR_PARTS_ADMIN_TOKEN; then
    put_ok=1
    break
  fi
  echo "secret put не прошёл, попытка $i"
  sleep 20
done
test "$put_ok" = 1
post() {
  local mode="$1"
  local out="$2"
  local confirm="$3"
  local code="" attempt
  for attempt in 1 2 3 4 5 6 7 8; do
    code=$(curl -sS -o "$out" -w "%{http_code}" \
      -X POST "https://boinya-c.konchaarsenia.workers.dev/admin/addr-parts" \
      -H "Content-Type: application/json" \
      -H "X-Addr-Parts-Token: $TOKEN" \
      --data-binary @"$OUT/body-$mode.json" \
      --max-time 120 || true)
    echo "$mode HTTP $code attempt $attempt" >&2
    if [ "$code" = "200" ]; then
      printf '%s' "$code"
      return 0
    fi
    echo "body:" >&2
    head -c 180 "$out" >&2 || true
    echo >&2
    sleep 15
  done
  printf '%s' "$code"
}
python3 - "$OUT" <<'PY'
import json, sys
out = sys.argv[1]
rows = json.load(open(out + "/write.json", encoding="utf-8")).get("rows") or []
open(out + "/body-dry-run.json", "w", encoding="utf-8").write(json.dumps({"mode": "dry-run", "rows": rows}))
open(out + "/body-apply.json", "w", encoding="utf-8").write(json.dumps({
    "mode": "apply",
    "confirm": "addr-parts-2026-10-22",
    "rows": rows,
}))
print(json.dumps({"write": len(rows)}))
PY
dry_code=$(post dry-run "$OUT/dry.json" "")
python3 - "$OUT/dry.json" "$dry_code" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
print(json.dumps({"status": data.get("status"), "count": data.get("count"), "skipped": [r for r in (data.get("rows") or []) if r.get("skip")]}, ensure_ascii=False))
if sys.argv[2] != "200" or data.get("status") != "success":
    raise SystemExit("dry-run не сошёлся")
PY
apply_code=$(post apply "$OUT/apply.json" "addr-parts-2026-10-22")
python3 - "$OUT/apply.json" "$apply_code" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
print(json.dumps({
    "status": data.get("status"),
    "backup": data.get("backup"),
    "updated": data.get("updated"),
    "skipped": data.get("skipped"),
    "message": data.get("message"),
    "bad": data.get("bad"),
}, ensure_ascii=False))
if sys.argv[2] != "200" or data.get("status") != "success":
    raise SystemExit("apply не сошёлся")
PY
