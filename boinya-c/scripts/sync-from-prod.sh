#!/usr/bin/env bash
# Копирует корневой app.html → boinya-c/app.html с патчами C.
# Корневой app.html НЕ меняется.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/app.html"
DST="$ROOT/boinya-c/app.html"
ORIGIN='https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec'
VER='v7.11.149c3'

cp "$SRC" "$DST"
python3 - "$DST" "$ORIGIN" "$VER" <<'PY'
import re
import sys
from pathlib import Path

p = Path(sys.argv[1])
origin = sys.argv[2]
ver = sys.argv[3]
t = p.read_text(encoding="utf-8")

t = re.sub(r'var APP_VER = "v[^"]+";', f'var APP_VER = "{ver}";', t, count=1)
t = re.sub(
    r'window\.__BOINYA_APP_VERSION__ \|\| "v[^"]+"',
    f'window.__BOINYA_APP_VERSION__ || "{ver}"',
    t,
    count=1,
)

old = f'const GOOGLE_WEBHOOK_URL = "{origin}";'
new = (
    f'const GOOGLE_WEBHOOK_ORIGIN = "{origin}";\n'
    "    // Песочница C: опциональный Worker. По умолчанию — GAS (чтение).\n"
    "    const GOOGLE_WEBHOOK_URL = (window.__BOINYA_C_PROXY__ || window.__BOINYA_FAST_PROXY__ || GOOGLE_WEBHOOK_ORIGIN);"
)
if old in t:
    t = t.replace(old, new, 1)
elif "GOOGLE_WEBHOOK_ORIGIN" not in t and "BOINYA_C_PROXY" not in t:
    raise SystemExit("webhook const not found — sync manually")

t = t.replace("<title>Конвейер Бойня</title>", "<title>Бойня C · sandbox</title>", 1)

needle = '  <script src="https://telegram.org/js/telegram-web-app.js"></script>'
inject = '''  <script src="seed-inline.js"></script>
  <script src="bridge.js"></script>
  <script src="client/config.js"></script>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script>
    /* C badge — только копия, прод не трогаем */
    (function () {
      function mount() {
        if (document.getElementById("boinyaCBadge")) return;
        var b = document.createElement("div");
        b.id = "boinyaCBadge";
        b.textContent = "C · TURBO";
        b.title = "Песочница C TURBO — local-first. Запись выключена.";
        b.style.cssText = "position:fixed;top:6px;right:8px;z-index:99998;font:700 10px/1 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.06em;color:#06221f;background:#3dd6c6;padding:4px 7px;border-radius:4px;opacity:.9;pointer-events:none;";
        document.body.appendChild(b);
      }
      if (document.body) mount();
      else document.addEventListener("DOMContentLoaded", mount);
    })();
  </script>'''
head_chunk = t.split("telegram-web-app.js")[0][-500:]
if "bridge.js" not in head_chunk:
    if needle not in t:
        raise SystemExit("telegram script not found")
    t = t.replace(needle, inject, 1)

t = t.replace(
    'if (_hdrBoot) _hdrBoot.innerText = "Бойня-Конвейер " + APP_VERSION;',
    'if (_hdrBoot) _hdrBoot.innerText = "Бойня C " + APP_VERSION;',
    1,
)

hook = '''    function apiGet(params, opts) {
      opts = opts || {};
      if (!opts.__boinyaNoSnap && typeof window.__boinyaCTrySnap === "function") {
        var _cHit = window.__boinyaCTrySnap(params, opts);
        if (_cHit) return _cHit;
      }
'''
if "__boinyaCTrySnap" not in t:
    if "    function apiGet(params, opts) {\n      opts = opts || {};\n" not in t:
        raise SystemExit("apiGet not found")
    t = t.replace(
        "    function apiGet(params, opts) {\n      opts = opts || {};\n",
        hook,
        1,
    )

api_post = "    function apiPost(payload) {\n"
guard = '''    function apiPost(payload) {
      try {
        if (typeof window.__boinyaCGuardWrite === "function") {
          var _bw = window.__boinyaCGuardWrite(payload || {});
          if (_bw) return _bw;
        }
      } catch (eBw) {}
'''
idx = t.find(api_post)
if idx >= 0 and "__boinyaCGuardWrite" not in t[idx : idx + 280]:
    t = t.replace(api_post, guard, 1)
    print("apiPost guarded")

# TURBO: не prefetch в GAS на старте
old_boot = """    function bootIdleWork_() {
      try { registerMeAsCourier(); } catch (e) {}
      try {
        if (document.getElementById("departHourCol") && !window._timeWheelsBuilt) {
          buildTimeWheels();
          window._timeWheelsBuilt = true;
        }
      } catch (eW) {}
      // prefetch горячих данных — вкладки открываются из кэша
      try {
        var dayEl = document.getElementById("day");
        var dayName = dayEl && dayEl.value ? String(dayEl.value) : "";
        if (dayName) {
          apiGet({ action: "getClients", day: dayName }, { retries: 0 }).catch(function () {});
          apiGet({ action: "getWeekDayCounts" }, { retries: 0 }).catch(function () {});
        }
        apiGet({ action: "getWeekBannerState" }, { retries: 0 }).catch(function () {});
        if (APP_ROLE === "cutter" || APP_ROLE === "owner" || APP_ROLE === "all") {
          var cutDay = (document.getElementById("cuttingDay") || {}).value || dayName;
          if (cutDay) apiGet({ action: "getCutting", day: cutDay }, { retries: 0 }).catch(function () {});
        }
      } catch (ePf) {}
    }
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(bootIdleWork_, { timeout: 1800 });
    } else {
      setTimeout(bootIdleWork_, 800);
    }"""
new_boot = """    function bootIdleWork_() {
      try { registerMeAsCourier(); } catch (e) {}
      try {
        if (document.getElementById("departHourCol") && !window._timeWheelsBuilt) {
          buildTimeWheels();
          window._timeWheelsBuilt = true;
        }
      } catch (eW) {}
      if (window.__BOINYA_C_TURBO__) return;
      try {
        var dayEl = document.getElementById("day");
        var dayName = dayEl && dayEl.value ? String(dayEl.value) : "";
        if (dayName) {
          apiGet({ action: "getClients", day: dayName }, { retries: 0 }).catch(function () {});
          apiGet({ action: "getWeekDayCounts" }, { retries: 0 }).catch(function () {});
        }
        apiGet({ action: "getWeekBannerState" }, { retries: 0 }).catch(function () {});
        if (APP_ROLE === "cutter" || APP_ROLE === "owner" || APP_ROLE === "all") {
          var cutDay = (document.getElementById("cuttingDay") || {}).value || dayName;
          if (cutDay) apiGet({ action: "getCutting", day: cutDay }, { retries: 0 }).catch(function () {});
        }
      } catch (ePf) {}
    }
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(bootIdleWork_, { timeout: window.__BOINYA_C_TURBO__ ? 8000 : 1800 });
    } else {
      setTimeout(bootIdleWork_, window.__BOINYA_C_TURBO__ ? 5000 : 800);
    }"""
if old_boot in t:
    t = t.replace(old_boot, new_boot, 1)
    print("bootIdle TURBO patched")
elif "__BOINYA_C_TURBO__" in t and "bootIdleWork_" in t:
    print("bootIdle already turbo")
else:
    print("WARN: bootIdle pattern miss")

p.write_text(t, encoding="utf-8")
print("synced", p, "ver", ver)
PY

# Вынести JS + лёгкий seed (первая загрузка)
node "$ROOT/boinya-c/scripts/split-app.mjs"
node "$ROOT/boinya-c/scripts/build-seed-inline.mjs"
echo "OK: $DST (root app.html не менялся; app.main.js + lite seed)"
