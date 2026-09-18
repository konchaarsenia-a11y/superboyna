#!/usr/bin/env bash
# Вернуть партнёра nan clinic (pa_nan_animal_clinic) в active.
# Actor — owner Бойни (Arseniy 650923866). Helper 827494606 больше не canon-owner.
#
#   TELEGRAM_ID=650923866 bash scripts/restore-nan-partner.sh
set -euo pipefail

WORKER_URL="${WORKER_URL:-https://boinya-c.konchaarsenia.workers.dev}"
GAS_URL="${GAS_URL:-https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec}"
TELEGRAM_ID="${TELEGRAM_ID:-650923866}"
UA="Mozilla/5.0 (compatible; SuperboynaAgent/1.0)"

echo "=== restore nan clinic partner ==="
echo "worker: $WORKER_URL"
echo "actor: $TELEGRAM_ID"
echo

echo "--- before: partnerListAdmin nan rows ---"
curl -sS -A "$UA" --max-time 40 \
  "${WORKER_URL}?action=partnerListAdmin&telegramId=${TELEGRAM_ID}&username=one_more_person_228&cutover=1" \
  | python3 -c '
import json,sys
j=json.load(sys.stdin)
print("status", j.get("status"), "n_access", len(j.get("access") or []))
for a in j.get("access") or []:
    pids=a.get("pointIds") or []
    if "pt_nan_1" in pids or a.get("networkId")=="net_nan" or a.get("username")=="nan_animal_clinic" or a.get("id")=="pa_nan_animal_clinic":
        print(json.dumps({k:a.get(k) for k in ("id","username","telegramId","name","role","status","networkId","pointIds")}, ensure_ascii=False))
'

echo
echo "--- Worker partnerSaveAccess id=pa_nan_animal_clinic role=partner active ---"
curl -sS -A "$UA" --max-time 40 -G "$WORKER_URL" \
  --data-urlencode "action=partnerSaveAccess" \
  --data-urlencode "telegramId=${TELEGRAM_ID}" \
  --data-urlencode "id=pa_nan_animal_clinic" \
  --data-urlencode "username=nan_animal_clinic" \
  --data-urlencode "name=NaN clinic" \
  --data-urlencode "networkId=net_nan" \
  --data-urlencode "pointIds=[\"pt_nan_1\"]" \
  --data-urlencode "role=partner" \
  --data-urlencode "status=active" \
  --data-urlencode "cutover=1" | python3 -m json.tool || true
echo

echo "--- GAS partnerSaveAccess id=pa_nan_animal_clinic role=partner active ---"
curl -sSL -A "$UA" --max-time 50 -G "$GAS_URL" \
  --data-urlencode "action=partnerSaveAccess" \
  --data-urlencode "telegramId=${TELEGRAM_ID}" \
  --data-urlencode "id=pa_nan_animal_clinic" \
  --data-urlencode "username=nan_animal_clinic" \
  --data-urlencode "name=NaN clinic" \
  --data-urlencode "networkId=net_nan" \
  --data-urlencode "pointIds=[\"pt_nan_1\"]" \
  --data-urlencode "role=partner" \
  --data-urlencode "status=active" \
  --data-urlencode "callback=cb" | python3 -c '
import json,re,sys
raw=sys.stdin.read()
m=re.search(r"\((\{.*\})\)\s*$", raw, re.S)
print(m.group(1) if m else raw[:800])
'
echo

echo "--- after: partnerListAdmin nan rows ---"
curl -sS -A "$UA" --max-time 40 \
  "${WORKER_URL}?action=partnerListAdmin&telegramId=${TELEGRAM_ID}&username=one_more_person_228&cutover=1" \
  | python3 -c '
import json,sys
j=json.load(sys.stdin)
found=False
for a in j.get("access") or []:
    if a.get("id")=="pa_nan_animal_clinic" or a.get("username")=="nan_animal_clinic":
        found=True
        print(json.dumps({k:a.get(k) for k in ("id","username","telegramId","name","role","status","networkId","pointIds")}, ensure_ascii=False))
if not found:
    print("WARN: nan partner not in listAdmin (Worker may still hide leftover until deploy)")
'

echo
echo "--- grant probe staff on pt_nan_1 then revoke (expect not nan_staff_forbidden) ---"
PROBE=$(curl -sS -A "$UA" --max-time 40 -G "$WORKER_URL" \
  --data-urlencode "action=partnerSaveAccess" \
  --data-urlencode "telegramId=${TELEGRAM_ID}" \
  --data-urlencode "id=pa_zzz_nan_grant_probe" \
  --data-urlencode "username=zzz_nan_grant_probe" \
  --data-urlencode "name=zzz nan grant probe" \
  --data-urlencode "networkId=net_nan" \
  --data-urlencode "pointIds=[\"pt_nan_1\"]" \
  --data-urlencode "role=staff" \
  --data-urlencode "status=pending" \
  --data-urlencode "cutover=1")
echo "$PROBE" | python3 -c '
import json,sys
j=json.load(sys.stdin)
print(json.dumps({k:j.get(k) for k in ("status","message","id","role","pointIds","accessStatus")}, ensure_ascii=False))
if j.get("message")=="nan_staff_forbidden":
    sys.exit(2)
'
echo "--- revoke probe pa_zzz_nan_grant_probe ---"
curl -sS -A "$UA" --max-time 40 -G "$WORKER_URL" \
  --data-urlencode "action=partnerRevokeAccess" \
  --data-urlencode "telegramId=${TELEGRAM_ID}" \
  --data-urlencode "id=pa_zzz_nan_grant_probe" \
  --data-urlencode "cutover=1" | python3 -m json.tool || true
echo
echo "Done. Helper owner не трогали. Arseniy staff Rokossovsky 80 не трогали."
