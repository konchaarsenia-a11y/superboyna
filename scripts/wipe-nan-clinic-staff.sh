#!/usr/bin/env bash
# Снять leftover / staff с точки nan clinic (pt_nan_1).
# Owner tid 650923866. Не трогает Arseniy / helper #281.
#
#   TELEGRAM_ID=650923866 bash scripts/wipe-nan-clinic-staff.sh
set -euo pipefail

WORKER_URL="${WORKER_URL:-https://boinya-c.konchaarsenia.workers.dev}"
GAS_URL="${GAS_URL:-https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec}"
TELEGRAM_ID="${TELEGRAM_ID:-650923866}"
UA="Mozilla/5.0 (compatible; SuperboynaAgent/1.0)"

echo "=== wipe nan clinic staff / leftover ==="
echo "worker: $WORKER_URL"
echo "actor: $TELEGRAM_ID"
echo

echo "--- before: partnerListAdmin access touching nan ---"
curl -sS -A "$UA" --max-time 40 \
  "${WORKER_URL}?action=partnerListAdmin&telegramId=${TELEGRAM_ID}&username=arseniyhotko&cutover=1" \
  | python3 -c '
import json,sys
j=json.load(sys.stdin)
for a in j.get("access") or []:
    pids=a.get("pointIds") or []
    if "pt_nan_1" in pids or a.get("networkId")=="net_nan" or a.get("username")=="nan_animal_clinic":
        print(json.dumps({k:a.get(k) for k in ("id","username","telegramId","name","role","status","networkId","pointIds")}, ensure_ascii=False))
'

echo
echo "--- Worker partnerRevokeAccess id=pa_nan_animal_clinic ---"
curl -sS -A "$UA" --max-time 40 -G "$WORKER_URL" \
  --data-urlencode "action=partnerRevokeAccess" \
  --data-urlencode "telegramId=${TELEGRAM_ID}" \
  --data-urlencode "id=pa_nan_animal_clinic" \
  --data-urlencode "cutover=1" | python3 -m json.tool || true
echo

echo "--- GAS partnerRevokeAccess id=pa_nan_animal_clinic ---"
curl -sSL -A "$UA" --max-time 50 -G "$GAS_URL" \
  --data-urlencode "action=partnerRevokeAccess" \
  --data-urlencode "telegramId=${TELEGRAM_ID}" \
  --data-urlencode "id=pa_nan_animal_clinic" \
  --data-urlencode "callback=cb" | python3 -c '
import json,re,sys
raw=sys.stdin.read()
m=re.search(r"\((\{.*\})\)\s*$", raw, re.S)
print(m.group(1) if m else raw[:800])
'
echo
echo "Done. Owner/helper не отзывались. После merge: Worker + clasp V35 прячут leftover и режут staff на pt_nan_1."
