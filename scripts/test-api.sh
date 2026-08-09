#!/usr/bin/env bash
# Smoke-check live Superboyna webhook (Linux / Cloud Agent).
# Usage: ./scripts/test-api.sh [day]
# Default day: Понедельник

set -euo pipefail

WEBHOOK="${WEBHOOK_URL:-https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec}"
DAY="${1:-Понедельник}"
DAY_ENC="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$DAY")"

echo "=== 1. Online check ==="
# Google Apps Script отвечает редиректом на script.googleusercontent.com
curl -fsSL --max-time 30 "$WEBHOOK" | head -c 500
echo
echo

echo "=== 2. getClients ($DAY) ==="
RESP="$(curl -fsSL --max-time 45 "${WEBHOOK}?action=getClients&day=${DAY_ENC}&callback=cb")"
python3 - <<'PY' "$RESP"
import json, re, sys
raw = sys.argv[1]
m = re.search(r"\((\{.*\})\)\s*$", raw, re.S)
if not m:
    print("FAIL: not JSONP")
    print(raw[:400])
    sys.exit(1)
data = json.loads(m.group(1))
print("status:", data.get("status"))
clients = data.get("clients") or []
print("clients:", len(clients))
for c in clients[:20]:
    name = c.get("name") or c.get("nick") or "?"
    print(f"  - {name}: orderCount={c.get('orderCount')} addr={c.get('address')!r} note={c.get('note')!r}")
PY

echo
echo "Done. Write/delete only via zzz_test."
