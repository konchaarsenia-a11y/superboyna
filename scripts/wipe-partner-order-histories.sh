#!/usr/bin/env bash
# One-shot: стереть ВСЕ истории партнёрских заявок (D1 partnerOrders + partner deferred + лист Partner_Orders).
#
# По умолчанию DRY-RUN (без confirm) — Worker/GAS ответят need_confirm, ничего не сотрут.
#
# Live (после merge + Worker Deploy + clasp-deploy Code.gs):
#   CONFIRM=WIPE_ALL TELEGRAM_ID=<owner_tid> bash scripts/wipe-partner-order-histories.sh
#
# Опции:
#   WORKER_URL   — https://boinya-c.konchaarsenia.workers.dev (default)
#   TELEGRAM_ID  — tid владельца Бойни (обязателен для live)
#   CONFIRM      — пусто = dry-run; WIPE_ALL = реально чистить
#   GAS_URL      — опционально сырой /exec, если Worker ещё не задеплоен
set -euo pipefail

WORKER_URL="${WORKER_URL:-https://boinya-c.konchaarsenia.workers.dev}"
TELEGRAM_ID="${TELEGRAM_ID:-}"
CONFIRM="${CONFIRM:-}"
GAS_URL="${GAS_URL:-}"

echo "=== wipe-partner-order-histories ==="
echo "worker: $WORKER_URL"
echo "telegramId: ${TELEGRAM_ID:-<empty>}"
if [ -z "$CONFIRM" ]; then
  echo "mode: DRY-RUN (set CONFIRM=WIPE_ALL to wipe)"
else
  echo "mode: LIVE confirm=$CONFIRM"
fi
echo

if [ -z "$TELEGRAM_ID" ]; then
  echo "WARN: TELEGRAM_ID пуст — Worker вернёт owner_only. Для live нужен tid владельца."
fi

BODY="$(python3 - <<PY
import json
print(json.dumps({
  "action": "partnerWipeOrderHistories",
  "telegramId": "$TELEGRAM_ID",
  "confirm": "$CONFIRM",
  "cutover": "1"
}))
PY
)"

echo "--- Worker POST ---"
curl -sS -X POST "$WORKER_URL" \
  -H "Content-Type: application/json" \
  --max-time 45 \
  --data "$BODY" | python3 -m json.tool || true
echo

if [ -n "$GAS_URL" ]; then
  echo "--- GAS GET (optional mirror) ---"
  Q="$(python3 - <<PY
import urllib.parse
print(urllib.parse.urlencode({
  "action": "partnerWipeOrderHistories",
  "telegramId": "$TELEGRAM_ID",
  "confirm": "$CONFIRM",
  "callback": "cb"
}))
PY
)"
  curl -sS --max-time 45 "${GAS_URL}?${Q}" | head -c 2000
  echo
fi

echo "Done."
echo "Ожидание live: status=success, wipedOrders ≥ 0, deferredRemoved/deferredCancelled."
echo "История в миниаппе и Партнёры→Заказы должны быть пусты; новые заявки после wipe снова пишутся."
