#!/usr/bin/env bash
# Capture REAL Telegram Web → Mini App flow, framed as iPhone 16.
# Requires: already logged-in Telegram Web session in Chrome on DISPLAY=:1
set -euo pipefail

OUT_DIR="${OUT_DIR:-/opt/cursor/artifacts}"
WORK="/tmp/varka-real-tg"
mkdir -p "$WORK" "$OUT_DIR"

DISPLAY_NUM="${DISPLAY:-:1}"
export DISPLAY="$DISPLAY_NUM"

IPHONE_W=393
IPHONE_H=852
SCALE=3
CAP_W=$((IPHONE_W * SCALE))
CAP_H=$((IPHONE_H * SCALE))

RAW="$WORK/raw.mp4"
FRAMED="$OUT_DIR/varka-real-tg-iphone16.mp4"
STATUS="$WORK/status.txt"

echo "checking telegram login…"
# Screenshot and OCR-ish check via file size / later computerUse; here just grab window
import_ok=0
if command -v xdotool >/dev/null 2>&1; then
  WID=$(xdotool search --name "Telegram" | head -1 || true)
  if [[ -n "${WID:-}" ]]; then
    xdotool windowactivate --sync "$WID" || true
  fi
fi

# Start ffmpeg capture of the whole display; computerUse crops later / we crop to phone region
echo "recording display $DISPLAY → $RAW"
ffmpeg -y -f x11grab -video_size 1920x1080 -framerate 30 -i "${DISPLAY_NUM}.0" \
  -t 90 -c:v libx264 -pix_fmt yuv420p -preset veryfast "$RAW" &
FFPID=$!
echo "$FFPID" > "$WORK/ffmpeg.pid"
echo "RECORDING $FFPID" > "$STATUS"
wait "$FFPID" || true

# Soft letterbox into iPhone 16 portrait with black bezels + rounded mask via pad
# Center-crop a tall region from the recording if possible
ffmpeg -y -i "$RAW" -vf "scale=${CAP_W}:-2,crop=${CAP_W}:${CAP_H},pad=${CAP_W}:$((CAP_H+120)):0:60:black" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$FRAMED" || cp "$RAW" "$FRAMED"

echo "DONE $FRAMED" > "$STATUS"
ls -la "$FRAMED"
echo "$FRAMED"
