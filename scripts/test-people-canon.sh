#!/usr/bin/env bash
# Live people-canon smoke via Worker (zzz_test only).
# Fast-confirm: accepted + pollPeopleWrite → sheetsVerified.
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

poll_until_sheets() {
  local wid="$1"
  local label="$2"
  python3 - <<PY
import json, urllib.request, time, sys
W = ${W@Q}
wid = ${wid@Q}
label = ${label@Q}
for i in range(45):
    time.sleep(1.1)
    raw = urllib.request.urlopen(
        W + "/?cutover=1&action=pollPeopleWrite&writeId=" + wid, timeout=15
    ).read().decode()
    p = json.loads(raw)
    print("poll", label, i, p.get("status"), p.get("sheetsVerified"), p.get("message"))
    if p.get("sheetsVerified") and p.get("status") == "success":
        print(label, "SHEETS OK")
        sys.exit(0)
    if p.get("status") == "error" and not p.get("pendingSheets"):
        print(label, "FAIL", p)
        sys.exit(3)
print(label, "TIMEOUT")
sys.exit(4)
PY
}

assert_people_write() {
  local raw="$1"
  local label="$2"
  python3 - <<PY
import json, sys
d = json.loads('''$(echo "$raw" | python3 -c 'import sys,json; print(json.dumps(json.load(sys.stdin)))')''')
print(label, {k: d.get(k) for k in ("status","sheetsVerified","optimistic","d1Verified","wrote","writeId","pendingSheets","message","action")})
assert d.get("optimistic") is not True, d
assert d.get("status") in ("success", "accepted"), d
assert d.get("d1Verified") is True or d.get("sheetsVerified") is True, d
if d.get("sheetsVerified") and d.get("status") == "success":
    print(label, "instant sheets OK")
    open("/tmp/pw_writeid","w").write("")
else:
    wid = d.get("writeId") or ""
    assert wid, d
    open("/tmp/pw_writeid","w").write(wid)
    print(label, "accepted, will poll", wid)
PY
  local wid
  wid="$(cat /tmp/pw_writeid)"
  if [[ -n "$wid" ]]; then
    poll_until_sheets "$wid" "$label"
  fi
}

echo "=== ping (expect sheets-confirm-bg) ==="
PING="$(json_get "action=ping")"
echo "$PING" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d); assert d.get("live") is True; pc=d.get("peopleCanon");
print("peopleCanon:", pc);
raise SystemExit(0 if pc in ("sheets-confirm-bg","sheets-first") else 2)'

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
t0=$(date +%s%3N)
SAVE="$(json_post "$SAVE_BODY")"
t1=$(date +%s%3N)
echo "save_http_ms=$((t1-t0))"
assert_people_write "$SAVE" "SAVE"

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
t0=$(date +%s%3N)
MOVE="$(json_post "$MOVE_BODY")"
t1=$(date +%s%3N)
echo "move_http_ms=$((t1-t0))"
assert_people_write "$MOVE" "MOVE"

sleep 1
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
t0=$(date +%s%3N)
DEL="$(json_post "$DEL_BODY")"
t1=$(date +%s%3N)
echo "delete_http_ms=$((t1-t0))"
assert_people_write "$DEL" "DELETE"

sleep 1
GC3="$(json_get "action=getClients&day=${VT_ENC}&force=1&_=${TS}3")"
echo "$GC3" | python3 -c 'import sys,json; d=json.load(sys.stdin); clients=d.get("clients") or [];
still=any("zzz_test" in (c.get("name") or c.get("client") or "").lower() for c in clients);
print("still on Вторник:", still); raise SystemExit(0 if not still else 5)'

echo
echo "=== calendar saveBooking → move → remove ==="
DATE1="2026-09-20"
DATE2="2026-09-21"
BOOK="$(json_post "$(python3 - <<PY
import json
print(json.dumps({
  "action": "saveBooking",
  "client": "$CLIENT",
  "day": "",
  "date": "$DATE1",
  "alsoSaveOrder": "0",
  "calendarOnly": "1",
  "address": "cal $TS",
  "note": "cal $TS",
  "basket": json.dumps([{"cat":"Мясо","main":"ГОВЯДИНА","sub":"Мелкое","value":20}]),
  "matchKey": "$CLIENT",
  "_": "${TS}b"
}, ensure_ascii=False))
PY
)")"
assert_people_write "$BOOK" "CAL_BOOK"

M2="$(json_post "$(python3 - <<PY
import json
print(json.dumps({
  "action":"moveClient","client":"$CLIENT","oldDay":"","newDay":"",
  "oldDate":"$DATE1","newDate":"$DATE2","calendarOnly":"1","dateOnly":"1",
  "cutRaw":"0","matchKey":"$CLIENT","_":"${TS}cm"
}, ensure_ascii=False))
PY
)")"
assert_people_write "$M2" "CAL_MOVE"

R2="$(json_post "$(python3 - <<PY
import json
print(json.dumps({
  "action":"removeCalendarClient","client":"$CLIENT","date":"$DATE2",
  "matchKey":"$CLIENT","_explicitDelete":"1","_userDelete":"1","_":"${TS}cr"
}, ensure_ascii=False))
PY
)")"
assert_people_write "$R2" "CAL_REMOVE"

echo
echo "ALL PEOPLE-CANON LIVE CHECKS PASSED"
