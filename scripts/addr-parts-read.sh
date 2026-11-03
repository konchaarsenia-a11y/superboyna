#!/usr/bin/env bash
set -euo pipefail
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  unset CLOUDFLARE_ACCOUNT_ID
fi
OUT="${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}/artifacts/addr-parts"
mkdir -p "$OUT"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

run() {
  local name="$1"
  local sql="$2"
  npx --yes wrangler@4 d1 execute boinya-c --remote --json --command "$sql" > "$OUT/$name.json"
}

run glued "SELECT id, client, match_key, date_iso, day_name, status, address FROM orders WHERE address LIKE '%подъезд%' OR address LIKE '%домофон%' OR address LIKE '%этаж%' OR address LIKE '%эт.%' OR address LIKE '%кв.%' OR address LIKE '%кв %' OR address LIKE '%п.%' OR instr(address, ' · ') > 0"
run recent "SELECT client, match_key, date_iso, segment, source FROM orders WHERE status = 'active' AND (date_iso >= '2026-10-01' OR date_iso LIKE '%.10.2026' OR date_iso LIKE '%.11.2026')"
run subs "SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'"
run clients "SELECT match_key, nick, label, CASE WHEN length(trim(ifnull(address,'')))>0 THEN 1 ELSE 0 END AS has_addr, CASE WHEN length(trim(ifnull(phone,'')))>0 THEN 1 ELSE 0 END AS has_phone, CASE WHEN ifnull(dogs_json,'') NOT IN ('','[]') THEN 1 ELSE 0 END AS has_dog FROM clients"
node "$ROOT/scripts/addr-parts-plan.mjs" "$OUT"
python3 - "$OUT/plan.json" <<'PY'
import json, sys
plan = json.load(open(sys.argv[1], encoding="utf-8"))
def brief(rows):
    return [{
        "client": r.get("client"),
        "date": r.get("date"),
        "before": r.get("before"),
        "after": r.get("shown") or r.get("street"),
        "reason": r.get("reason"),
    } for r in rows]
print(json.dumps({
    "future": brief(plan.get("future") or []),
    "past": brief(plan.get("past") or []),
    "skip": brief([r for r in (plan.get("skip") or []) if r.get("reason") not in ("plain", "empty")]),
    "dupes": plan.get("dupes") or [],
    "misses": plan.get("misses") or [],
}, ensure_ascii=False, indent=2))
PY
