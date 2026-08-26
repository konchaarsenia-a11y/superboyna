#!/usr/bin/env bash
# Live test: calendar move preserves client payload (zzz_test only)
set -euo pipefail

WORKER="${WORKER_URL:-https://boinya-c.konchaarsenia.workers.dev}"
OLD_DATE="${OLD_DATE:-2026-09-07}"
NEW_DATE="${NEW_DATE:-2026-09-10}"
CLIENT="zzz_test"
BASKET='[{"name":"Говядина","sub":"","val":500}]'

api_post() {
  curl -fsSL --max-time 90 -X POST "${WORKER}/?cutover=1" \
    -H 'Content-Type: application/json' \
    -d "$1"
}

api_get() {
  local qs="$1"
  curl -fsSL --max-time 90 "${WORKER}/?cutover=1&${qs}"
}

echo "=== saveBooking $CLIENT on $OLD_DATE ==="
api_post "$(python3 - <<PY
import json
print(json.dumps({
  "action": "saveBooking",
  "client": "$CLIENT",
  "date": "$OLD_DATE",
  "calendarOnly": "1",
  "address": "ул. Тестовая 7",
  "phone": "+79990001122",
  "note": "move-payload-test",
  "basket": json.loads('$BASKET'),
  "alsoSaveOrder": "0"
}))
PY
)" | python3 -m json.tool | head -30

echo "=== poll write if needed ==="
sleep 2

echo "=== getViewCompare old $OLD_DATE ==="
api_get "action=getViewCompare&date=${OLD_DATE}" | python3 - <<'PY'
import json, sys
d = json.load(sys.stdin)
clients = (d.get("month") or d.get("week") or [])
for c in clients:
    if "zzz_test" in str(c.get("name","")).lower():
        print("FOUND:", json.dumps({
            "name": c.get("name"),
            "address": c.get("address"),
            "phone": c.get("phone"),
            "note": c.get("note"),
            "basket": c.get("basket"),
        }, ensure_ascii=False))
        break
else:
    print("zzz_test not on old date:", len(clients), "clients")
PY

echo "=== moveClient $OLD_DATE -> $NEW_DATE ==="
api_get "action=moveClient&client=${CLIENT}&oldDate=${OLD_DATE}&newDate=${NEW_DATE}&calendarOnly=1&cutRaw=0&matchKey=${CLIENT}" | python3 -m json.tool | head -25

echo "=== wait sheets job ==="
sleep 4

echo "=== getViewCompare new $NEW_DATE ==="
api_get "action=getViewCompare&date=${NEW_DATE}" | python3 - <<'PY'
import json, sys
d = json.load(sys.stdin)
clients = (d.get("month") or d.get("week") or [])
ok = False
for c in clients:
    if "zzz_test" in str(c.get("name","")).lower():
        addr = c.get("address") or ""
        phone = c.get("phone") or ""
        basket = c.get("basket") or []
        print("FOUND:", json.dumps({
            "name": c.get("name"),
            "address": addr,
            "phone": phone,
            "note": c.get("note"),
            "basket": basket,
        }, ensure_ascii=False))
        if addr and phone and basket:
            ok = True
            print("PASS: payload preserved")
        else:
            print("FAIL: missing fields addr=%r phone=%r basket=%s" % (addr, phone, len(basket)))
        break
else:
    print("FAIL: zzz_test not on new date")
    sys.exit(1)
if not ok:
    sys.exit(1)
PY

echo "=== cleanup delete on $NEW_DATE ==="
api_get "action=deleteClient&client=${CLIENT}&date=${NEW_DATE}&calendarOnly=1&matchKey=${CLIENT}" | python3 -m json.tool | head -10
sleep 2
echo "DONE"
