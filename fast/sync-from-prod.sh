#!/usr/bin/env bash
# Обновить fast/app.html из корневого прода, сохранив FAST-патчи.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/app.html"
DST="$ROOT/fast/app.html"
ORIGIN='https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec'

cp "$SRC" "$DST"
python3 - "$DST" "$ORIGIN" <<'PY'
import sys, re
from pathlib import Path
p, origin = Path(sys.argv[1]), sys.argv[2]
t = p.read_text(encoding="utf-8")
# version
t = re.sub(r'var APP_VER = "v[^"]+";', 'var APP_VER = "v7.11.89f1";', t, count=1)
t = re.sub(
    r'window\.__BOINYA_APP_VERSION__ \|\| "v[^"]+"',
    'window.__BOINYA_APP_VERSION__ || "v7.11.89f1"',
    t,
    count=1,
)
old = f'const GOOGLE_WEBHOOK_URL = "{origin}";'
new = (
    f'const GOOGLE_WEBHOOK_ORIGIN = "{origin}";\n'
    '    // FAST edition: Cloudflare Worker edge-cache. Fallback = прямой GAS если прокси не задан.\n'
    '    const GOOGLE_WEBHOOK_URL = (window.__BOINYA_FAST_PROXY__ || GOOGLE_WEBHOOK_ORIGIN);'
)
if old not in t:
    # already patched or URL changed
    if "BOINYA_FAST_PROXY" not in t:
        raise SystemExit("webhook const not found — sync manually")
else:
    t = t.replace(old, new, 1)
t = t.replace("<title>Конвейер Бойня</title>", "<title>Бойня FAST</title>", 1)
needle = '  <script src="https://telegram.org/js/telegram-web-app.js"></script>'
inject = '''  <script src="config.js"></script>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script>
    /* FAST badge — только в копии, прод не трогаем */
    (function () {
      function mount() {
        if (document.getElementById("boinyaFastBadge")) return;
        var b = document.createElement("div");
        b.id = "boinyaFastBadge";
        b.textContent = "FAST";
        b.title = "Параллельная быстрая копия (edge proxy)";
        b.style.cssText = "position:fixed;top:6px;right:8px;z-index:99998;font:700 10px/1 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.06em;color:#0a0a0a;background:#30d158;padding:4px 7px;border-radius:4px;opacity:.85;pointer-events:none;";
        document.body.appendChild(b);
      }
      if (document.body) mount();
      else document.addEventListener("DOMContentLoaded", mount);
    })();
  </script>'''
if "config.js" not in t.split("telegram-web-app.js")[0][-200:]:
    if needle not in t:
        raise SystemExit("telegram script not found")
    t = t.replace(needle, inject, 1)
t = t.replace(
    'if (_hdrBoot) _hdrBoot.innerText = "Бойня-Конвейер " + APP_VERSION;',
    'if (_hdrBoot) _hdrBoot.innerText = "Бойня FAST " + APP_VERSION;',
    1,
)
p.write_text(t, encoding="utf-8")
print("synced", p)
PY
echo "OK: $DST (root app.html не менялся)"
