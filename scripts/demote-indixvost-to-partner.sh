#!/usr/bin/env bash
# Indixvost: убрать staff (все точки), оставить партнёра только pt_indix_1.
# Actor — канон-owner helper 827494606.
#
#   TELEGRAM_ID=827494606 bash scripts/demote-indixvost-to-partner.sh
set -euo pipefail

WORKER_URL="${WORKER_URL:-https://boinya-c.konchaarsenia.workers.dev}"
GAS_URL="${GAS_URL:-https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec}"
TELEGRAM_ID="${TELEGRAM_ID:-827494606}"
UA="Mozilla/5.0 (compatible; SuperboynaAgent/1.0)"

INDIX_TID="737330196"
PARTNER_ID="pa_kovalyovadiana"
STAFF_ID="pa_737330196"

echo "=== demote Indixvost staff → partner (pt_indix_1 only) ==="
echo "worker: $WORKER_URL"
echo "actor: $TELEGRAM_ID"
echo

echo "--- before ---"
curl -sS -A "$UA" --max-time 40 -G "$WORKER_URL" \
  --data-urlencode "action=partnerGetMe" \
  --data-urlencode "telegramId=${INDIX_TID}" \
  --data-urlencode "cutover=1" \
  | python3 -c 'import json,sys; j=json.load(sys.stdin); print("role", j.get("role"), "n_points", len(j.get("points") or []), "ids", j.get("pointIds"))'

echo
echo "--- Worker: partnerSaveAccess partner pt_indix_1 ---"
curl -sS -A "$UA" --max-time 40 -G "$WORKER_URL" \
  --data-urlencode "action=partnerSaveAccess" \
  --data-urlencode "telegramId=${TELEGRAM_ID}" \
  --data-urlencode "actorUsername=one_more_person_228" \
  --data-urlencode "id=${PARTNER_ID}" \
  --data-urlencode "targetTelegramId=${INDIX_TID}" \
  --data-urlencode "username=indixvost" \
  --data-urlencode "name=Indixvost" \
  --data-urlencode "networkId=net_indixvost" \
  --data-urlencode 'pointIds=["pt_indix_1"]' \
  --data-urlencode "role=partner" \
  --data-urlencode "status=active" \
  --data-urlencode "cutover=1" | python3 -m json.tool

echo
echo "--- Worker: revoke leftover staff ${STAFF_ID} ---"
curl -sS -A "$UA" --max-time 40 -G "$WORKER_URL" \
  --data-urlencode "action=partnerRevokeAccess" \
  --data-urlencode "telegramId=${TELEGRAM_ID}" \
  --data-urlencode "actorUsername=one_more_person_228" \
  --data-urlencode "id=${STAFF_ID}" \
  --data-urlencode "cutover=1" | python3 -m json.tool || true

echo
echo "--- Worker: force staff row revoked ---"
curl -sS -A "$UA" --max-time 40 -G "$WORKER_URL" \
  --data-urlencode "action=partnerSaveAccess" \
  --data-urlencode "telegramId=${TELEGRAM_ID}" \
  --data-urlencode "actorUsername=one_more_person_228" \
  --data-urlencode "id=${STAFF_ID}" \
  --data-urlencode "targetTelegramId=${INDIX_TID}" \
  --data-urlencode "name=Indixvost" \
  --data-urlencode "networkId=net_indixvost" \
  --data-urlencode 'pointIds=[]' \
  --data-urlencode "role=staff" \
  --data-urlencode "status=revoked" \
  --data-urlencode "cutover=1" | python3 -m json.tool || true

echo
echo "--- GAS mirror partner ---"
curl -sSL -A "$UA" --max-time 50 -G "$GAS_URL" \
  --data-urlencode "action=partnerSaveAccess" \
  --data-urlencode "telegramId=${TELEGRAM_ID}" \
  --data-urlencode "actorUsername=one_more_person_228" \
  --data-urlencode "id=${PARTNER_ID}" \
  --data-urlencode "targetTelegramId=${INDIX_TID}" \
  --data-urlencode "username=indixvost" \
  --data-urlencode "name=Indixvost" \
  --data-urlencode "networkId=net_indixvost" \
  --data-urlencode 'pointIds=["pt_indix_1"]' \
  --data-urlencode "role=partner" \
  --data-urlencode "status=active" \
  --data-urlencode "callback=cb" | python3 -c '
import re,sys
raw=sys.stdin.read()
m=re.search(r"\((\{.*\})\)\s*$", raw, re.S)
print(m.group(1) if m else raw[:500])
'

echo
echo "--- GAS revoke staff ---"
curl -sSL -A "$UA" --max-time 50 -G "$GAS_URL" \
  --data-urlencode "action=partnerRevokeAccess" \
  --data-urlencode "telegramId=${TELEGRAM_ID}" \
  --data-urlencode "id=${STAFF_ID}" \
  --data-urlencode "callback=cb" | python3 -c '
import re,sys
raw=sys.stdin.read()
m=re.search(r"\((\{.*\})\)\s*$", raw, re.S)
print(m.group(1) if m else raw[:500])
'

echo
echo "--- after getMe ---"
curl -sS -A "$UA" --max-time 40 -G "$WORKER_URL" \
  --data-urlencode "action=partnerGetMe" \
  --data-urlencode "telegramId=${INDIX_TID}" \
  --data-urlencode "cutover=1" \
  | python3 -c '
import json,sys
j=json.load(sys.stdin)
print("role", j.get("role"), "n_points", len(j.get("points") or []), "ids", j.get("pointIds"), "name", j.get("name"))
if j.get("role") != "partner" or j.get("pointIds") != ["pt_indix_1"]:
    raise SystemExit("FAIL: expected partner with only pt_indix_1")
print("OK")
'
