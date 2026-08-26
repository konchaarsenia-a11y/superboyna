#!/usr/bin/env bash
# Smoke Goodboy gb* API (после Deploy Code.gs).
# Не трогает реальных клиентов: только тестовый telegramId / zzz_test nick.
set -euo pipefail
WEBHOOK_URL="${WEBHOOK_URL:-https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec}"
TG="gb_test_zzz_$(date +%s | tail -c 5)"

jsonp_get() {
  local action="$1"; shift
  local qs="action=${action}"
  local a
  for a in "$@"; do qs="${qs}&${a}"; done
  local cb="cb$$"
  local url="${WEBHOOK_URL}?${qs}&callback=${cb}"
  local body
  body=$(curl -fsSL --max-time 45 "$url" || true)
  if [[ -z "$body" ]]; then
    echo "FAIL $action: empty"
    return 1
  fi
  # JSONP → JSON
  local json
  json=$(printf '%s' "$body" | sed -E "s/^${cb}\\(//; s/\\);?[[:space:]]*$//")
  echo "$json" | head -c 400
  echo
  if echo "$json" | grep -q '"status":"success"\|"status":"ok"'; then
    echo "OK $action"
    return 0
  fi
  if echo "$json" | grep -q 'unknown_action'; then
    echo "NEED_DEPLOY $action (unknown_action — вставьте Code.gs и New deployment)"
    return 2
  fi
  echo "FAIL $action"
  return 1
}

echo "Webhook: $WEBHOOK_URL"
echo "Test telegramId: $TG"
echo "---"
jsonp_get gbEnsureSheets || true
jsonp_get gbBootstrap || true
jsonp_get gbMe "telegramId=${TG}" "name=Test" "username=zzz_test" || true
jsonp_get gbLinkClient "telegramId=${TG}" "nick=zzz_test" || true
echo "--- done"
