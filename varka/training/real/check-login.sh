#!/usr/bin/env bash
# Poll Telegram Web login state via screenshot + simple pixel/text heuristics.
# Exits 0 if chat list likely visible; 1 if still on QR login.
set -euo pipefail
export DISPLAY="${DISPLAY:-:1}"
SHOT="/tmp/varka-real-tg/login-check.png"
mkdir -p /tmp/varka-real-tg
import -window root "$SHOT" 2>/dev/null || scrot "$SHOT" 2>/dev/null || \
  ffmpeg -y -f x11grab -video_size 1920x1080 -i "${DISPLAY}.0" -frames:v 1 -update 1 "$SHOT" >/dev/null 2>&1

# If tesseract available, OCR; else grep file via strings is useless on png.
if command -v tesseract >/dev/null 2>&1; then
  TXT=$(tesseract "$SHOT" stdout 2>/dev/null || true)
  echo "$TXT" | head -20
  if echo "$TXT" | grep -qiE 'Log in by QR|Scan with Telegram'; then
    echo "NEED_USER_LOGIN=1"
    exit 1
  fi
  if echo "$TXT" | grep -qiE 'Saved Messages|Archived|Chats|GOODBOY|Varka|Menu'; then
    echo "LOGIN_STATUS=logged_in"
    exit 0
  fi
fi

# Fallback: file exists → unknown, treat as need login unless marker set
if [[ -f /tmp/varka-real-tg/LOGGED_IN ]]; then
  echo "LOGIN_STATUS=logged_in (marker)"
  exit 0
fi
echo "NEED_USER_LOGIN=1 (unknown/ocr missing)"
exit 1
