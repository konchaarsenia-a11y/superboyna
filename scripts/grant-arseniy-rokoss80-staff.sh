#!/usr/bin/env bash
# После Deploy Worker + Code.gs: Arseniy staff на Varka Рокоссовского 80.
# Actor — оставшийся canon-owner helper 827494606.
# Не PARTNER_MANUAL_ACCESS_*. Не 150Б.
#
#   TELEGRAM_ID=827494606 bash scripts/grant-arseniy-rokoss80-staff.sh
set -euo pipefail

WORKER_URL="${WORKER_URL:-https://boinya-c.konchaarsenia.workers.dev}"
GAS_URL="${GAS_URL:-https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec}"
TELEGRAM_ID="${TELEGRAM_ID:-827494606}"
UA="Mozilla/5.0 (compatible; SuperboynaAgent/1.0)"

echo "=== grant Arseniy staff pt_varka_rokoss_80 ==="
echo "worker: $WORKER_URL"
echo "actor (owner): $TELEGRAM_ID"
echo

echo "--- Worker partnerSaveAccess Arseniy staff Rokossovsky 80 ---"
curl -sS -A "$UA" --max-time 40 -G "$WORKER_URL" \
  --data-urlencode "action=partnerSaveAccess" \
  --data-urlencode "telegramId=${TELEGRAM_ID}" \
  --data-urlencode "actorUsername=one_more_person_228" \
  --data-urlencode "username=arseniyhotko" \
  --data-urlencode "targetTelegramId=650923866" \
  --data-urlencode "name=Арсений" \
  --data-urlencode "networkId=net_varka" \
  --data-urlencode "pointIds=[\"pt_varka_rokoss_80\"]" \
  --data-urlencode "role=staff" \
  --data-urlencode "status=active" \
  --data-urlencode "cutover=1" | python3 -m json.tool || true
echo

echo "--- GAS partnerSaveAccess Arseniy staff Rokossovsky 80 ---"
curl -sSL -A "$UA" --max-time 50 -G "$GAS_URL" \
  --data-urlencode "action=partnerSaveAccess" \
  --data-urlencode "telegramId=${TELEGRAM_ID}" \
  --data-urlencode "actorUsername=one_more_person_228" \
  --data-urlencode "username=arseniyhotko" \
  --data-urlencode "targetTelegramId=650923866" \
  --data-urlencode "name=Арсений" \
  --data-urlencode "networkId=net_varka" \
  --data-urlencode "pointIds=[\"pt_varka_rokoss_80\"]" \
  --data-urlencode "role=staff" \
  --data-urlencode "status=active" \
  --data-urlencode "callback=cb" | python3 -c '
import json,re,sys
raw=sys.stdin.read()
m=re.search(r"\((\{.*\})\)\s*$", raw, re.S)
print(m.group(1) if m else raw[:800])
'
echo

echo "--- partnerGetMe Arseniy (expect staff, only rokoss_80, not owner) ---"
curl -sS -A "$UA" --max-time 40 -G "$WORKER_URL" \
  --data-urlencode "action=partnerGetMe" \
  --data-urlencode "telegramId=650923866" \
  --data-urlencode "username=arseniyhotko" \
  --data-urlencode "cutover=1" | python3 -c '
import json,sys
j=json.load(sys.stdin)
pts=[{"id":p.get("id"),"name":p.get("name")} for p in (j.get("points") or [])]
print(json.dumps({
  "status": j.get("status"),
  "message": j.get("message"),
  "role": j.get("role"),
  "isOwner": j.get("isOwner"),
  "ownerMode": j.get("ownerMode"),
  "partnerOverride": j.get("partnerOverride"),
  "pointIds": j.get("pointIds"),
  "points": pts
}, ensure_ascii=False, indent=2))
ids=set(j.get("pointIds") or []) | {p.get("id") for p in (j.get("points") or [])}
if j.get("isOwner") or j.get("ownerMode") or j.get("role")=="owner":
    print("FAIL: still owner", file=sys.stderr)
    sys.exit(2)
if "pt_varka_rokoss_150b" in ids:
    print("FAIL: 150B must not be granted", file=sys.stderr)
    sys.exit(3)
if "pt_varka_rokoss_80" not in ids:
    print("WARN: rokoss_80 not in getMe yet (need Worker+GAS Deploy first)")
'
echo
echo "Done. Expect after Deploy: role=staff, only pt_varka_rokoss_80, ownerMode=false."
