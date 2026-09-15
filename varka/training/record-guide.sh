#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HTML="$ROOT/varka/training/partner-guide.html"
OUT_DIR="$ROOT/varka/training"
ART_DIR="/opt/cursor/artifacts"
mkdir -p "$OUT_DIR" "$ART_DIR" /tmp/varka-train
DISPLAY_NUM=92
export DISPLAY=":${DISPLAY_NUM}"

pkill -f "Xvfb :${DISPLAY_NUM}" 2>/dev/null || true
pkill -f "google-chrome.*partner-guide" 2>/dev/null || true
sleep 0.4

Xvfb ":${DISPLAY_NUM}" -screen 0 1080x1920x24 -ac -nolisten tcp >/tmp/varka-train/xvfb.log 2>&1 &
XVFB_PID=$!
sleep 0.8
xsetroot -solid "#090a0f" 2>/dev/null || true

OUT_RAW="/tmp/varka-train/raw.mkv"
OUT_MP4="$OUT_DIR/partner-guide.mp4"
OUT_ART="$ART_DIR/varka-partner-guide.mp4"

ffmpeg -y -nostdin \
  -f x11grab -video_size 1080x1920 -framerate 30 -i ":${DISPLAY_NUM}.0" \
  -t 40 \
  -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 17 \
  "$OUT_RAW" >/tmp/varka-train/ffmpeg.log 2>&1 &
FF_PID=$!
sleep 0.7

google-chrome \
  --window-size=1080,1920 \
  --window-position=0,0 \
  --force-device-scale-factor=1 \
  --disable-gpu \
  --disable-dev-shm-usage \
  --no-first-run \
  --no-default-browser-check \
  --disable-translate \
  --disable-features=TranslateUI,Translate \
  --lang=ru-RU \
  --accept-lang=ru-RU,ru \
  --autoplay-policy=no-user-gesture-required \
  --user-data-dir=/tmp/varka-train/chrome-profile3 \
  --app="file://${HTML}?autostart=1" \
  >/tmp/varka-train/chrome.log 2>&1 &
CHROME_PID=$!

wait "$FF_PID" || true

ffmpeg -y -nostdin -i "$OUT_RAW" \
  -ss 0.5 -t 36 \
  -vf "fps=30,format=yuv420p" \
  -c:v libx264 -preset medium -crf 17 -movflags +faststart \
  -an "$OUT_MP4" >/tmp/varka-train/ffmpeg2.log 2>&1

cp -f "$OUT_MP4" "$OUT_ART"
ls -lh "$OUT_MP4" "$OUT_ART"
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT_MP4"

kill "$CHROME_PID" 2>/dev/null || true
kill "$XVFB_PID" 2>/dev/null || true
pkill -f "Xvfb :${DISPLAY_NUM}" 2>/dev/null || true
echo DONE
