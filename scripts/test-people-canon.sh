#!/usr/bin/env bash
# Live people-canon smoke via Worker (zzz_test only).
# Usage: bash scripts/test-people-canon.sh
set -euo pipefail

W="${WORKER_URL:-https://boinya-c.konchaarsenia.workers.dev}"
CLIENT="zzz_test"
DAY="${1:-Понедельник}"
TS="$(date +%s)"

json_get() {
  local qs="$1"
  curl -fsSL --max-time 60 "${W}/?cutover=1&${qs}"
}

json_post() {
  local body="$1"
  curl -fsSL --max-time 90 -X POST "${W}/?cutover=1" \
    -H "Content-Type: text/plain;charset=UTF-8" \
    --data-binary "$body"
}

echo "=== ping (expect peopleCanon=sheets-first) ==="
PING="$(json_get "action=ping")"
echo "$PING" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d); assert d.get("live") is True; pc=d.get("peopleCanon");
print("peopleCanon:", pc);
raise SystemExit(0 if pc=="sheets-first" else 2)'

echo
echo "=== saveOrder $CLIENT → $DAY ==="
BASKET='[{"cat":"Мясо","main":"ГОВЯДИНА","sub":"Мелкое","value":50}]'
SAVE_BODY="$(python3 - <<PY
import json
print(json.dumps({
  "action": "saveOrder",
  "client": "$CLIENT",
  "day": "$DAY",
  "address": "test addr $TS",
  "note": "canon $TS",
  "basket": json.dumps($BASKET),
  "matchKey": "$CLIENT",
  "_": "$TS"
}, ensure_ascii=False))
PY
)"
SAVE="$(json_post "$SAVE_BODY")"
echo "$SAVE" | python3 -c 'import sys,json; d=json.load(sys.stdin); print({k:d.get(k) for k in ("status","sheetsVerified","optimistic","d1Verified","wrote","message","action")});
assert d.get("status")=="success", d
assert d.get("sheetsVerified") is True, d
assert d.get("optimistic") is not True, d
print("SAVE OK")'

echo
echo "=== getClients verify present ==="
DAY_ENC="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$DAY")"
GC="$(json_get "action=getClients&day=${DAY_ENC}&force=1&_=${TS}")"
echo "$GC" | python3 -c 'import sys,json; d=json.load(sys.stdin); clients=d.get("clients") or [];
names=[(c.get("name") or c.get("client") or "") for c in clients];
ok=any("zzz_test" in n.lower() for n in names);
print("clients", len(clients), "zzz_test" if ok else "MISSING");
raise SystemExit(0 if ok else 3)'

echo
echo "=== moveClient $DAY → Вторник ==="
MOVE_BODY="$(python3 - <<PY
import json
print(json.dumps({
  "action": "moveClient",
  "client": "$CLIENT",
  "oldDay": "$DAY",
  "newDay": "Вторник",
  "cutRaw": "0",
  "matchKey": "$CLIENT",
  "_": "${TS}m"
}, ensure_ascii=False))
PY
)"
MOVE="$(json_post "$MOVE_BODY")"
echo "$MOVE" | python3 -c 'import sys,json; d=json.load(sys.stdin); print({k:d.get(k) for k in ("status","sheetsVerified","optimistic","d1Verified","message","from","to","newDay")});
assert d.get("status")=="success", d
assert d.get("sheetsVerified") is True, d
print("MOVE OK")'

sleep 2
VT_ENC="$(python3 -c "import urllib.parse; print(urllib.parse.quote(\"Вторник\"))")"
GC2="$(json_get "action=getClients&day=${VT_ENC}&force=1&_=${TS}2")"
echo "$GC2" | python3 -c 'import sys,json; d=json.load(sys.stdin); clients=d.get("clients") or [];
ok=any("zzz_test" in (c.get("name") or c.get("client") or "").lower() for c in clients);
print("on Вторник:", ok); raise SystemExit(0 if ok else 4)'

echo
echo "=== deleteClient Вторник ==="
DEL_BODY="$(python3 - <<PY
import json
print(json.dumps({
  "action": "deleteClient",
  "client": "$CLIENT",
  "day": "Вторник",
  "matchKey": "$CLIENT",
  "_explicitDelete": "1",
  "_userDelete": "1",
  "_": "${TS}d"
}, ensure_ascii=False))
PY
)"
DEL="$(json_post "$DEL_BODY")"
echo "$DEL" | python3 -c 'import sys,json; d=json.load(sys.stdin); print({k:d.get(k) for k in ("status","sheetsVerified","optimistic","d1Verified","wrote","alreadyGone","message")});
assert d.get("status")=="success", d
assert d.get("sheetsVerified") is True or d.get("alreadyGone"), d
print("DELETE OK")'

sleep 2
GC3="$(json_get "action=getClients&day=${VT_ENC}&force=1&_=${TS}3")"
echo "$GC3" | python3 -c 'import sys,json; d=json.load(sys.stdin); clients=d.get("clients") or [];
still=any("zzz_test" in (c.get("name") or c.get("client") or "").lower() for c in clients);
print("still on Вторник:", still); raise SystemExit(0 if not still else 5)'

echo
echo "ALL PEOPLE-CANON LIVE CHECKS PASSED"
