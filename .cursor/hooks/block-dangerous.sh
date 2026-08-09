#!/usr/bin/env bash
# beforeShellExecution: block week-close and mass-destructive git on live Superboyna.
set -euo pipefail
input="$(cat)"
cmd="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("command",""))' <<<"$input")"

deny() {
  python3 -c 'import json,sys; print(json.dumps({"permission":"deny","user_message":sys.argv[1]}))' "$1"
  exit 0
}

# Never close the production week from an agent shell without explicit owner OK in chat.
if echo "$cmd" | grep -Eqi 'finishFullWeekProduction'; then
  deny "Blocked: finishFullWeekProduction — нужен явный ОК владельца «можно закрыть неделю»."
fi

# Guard against wiping the repo.
if echo "$cmd" | grep -Eqi '(^|[;&|[:space:]])rm[[:space:]]+(-[a-zA-Z]*f[a-zA-Z]*[[:space:]]+|.*)--no-preserve-root|rm[[:space:]]+-rf[[:space:]]+/($|[[:space:]])'; then
  deny "Blocked: destructive rm of root/filesystem."
fi

python3 -c 'import json; print(json.dumps({"permission":"allow"}))'
