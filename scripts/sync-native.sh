#!/usr/bin/env bash
# Копирует веб → native/www без правок исходного app.html / Code.gs.
set -euo pipefail

export PATH="${HOME}/.local/node/bin:${PATH}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NATIVE="$ROOT/native"
WWW="$NATIVE/www"
OVERLAYS="$NATIVE/overlays"

if [[ ! -f "$ROOT/app.html" ]]; then
  echo "error: app.html not found in $ROOT" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node not found (expected ~/.local/node/bin)" >&2
  exit 1
fi

rm -rf "$WWW"
mkdir -p "$WWW/js" "$WWW/css" "$WWW/assets"

cp "$ROOT/app.html" "$WWW/index.html"
[[ -f "$ROOT/maps.html" ]] && cp "$ROOT/maps.html" "$WWW/maps.html"
[[ -f "$ROOT/yandex-route.html" ]] && cp "$ROOT/yandex-route.html" "$WWW/yandex-route.html"
[[ -d "$ROOT/assets" ]] && cp -R "$ROOT/assets/." "$WWW/assets/"
# Бренд Good Boy (натив): логотип + тема
[[ -d "$OVERLAYS/assets" ]] && cp -R "$OVERLAYS/assets/." "$WWW/assets/"
[[ -d "$OVERLAYS/css" ]] && cp -R "$OVERLAYS/css/." "$WWW/css/"
cp -R "$OVERLAYS/js/." "$WWW/js/"

ROOT="$ROOT" node <<'NODE'
const fs = require("fs");
const path = require("path");
const wwwIndex = path.join(process.env.ROOT, "native", "www", "index.html");
let html = fs.readFileSync(wwwIndex, "utf8");

const headBrand = [
  '<link rel="stylesheet" href="css/native-theme.css">',
  '<script src="js/telegram-shim.js"></script>',
  '<script src="js/boinya-native.js"></script>',
  '<script src="js/native-perf.js"></script>',
  '<script src="js/native-safearea.js"></script>',
  '<script src="js/native-touchfix.js"></script>',
  '<script src="js/native-resume.js"></script>',
  '<script src="js/native-manager-island.js"></script>',
  '<script src="js/native-brand.js"></script>'
].join("\n  ");
const tgCdn = '<script src="https://telegram.org/js/telegram-web-app.js"></script>';
if (html.includes(tgCdn)) {
  html = html.replace(tgCdn, headBrand);
} else if (!html.includes("js/telegram-shim.js")) {
  html = html.replace("<head>", "<head>\n  " + headBrand);
} else if (!html.includes("css/native-theme.css")) {
  html = html.replace("<head>", "<head>\n  <link rel=\"stylesheet\" href=\"css/native-theme.css\">");
}
if (!html.includes("js/native-brand.js")) {
  html = html.replace("</head>", "  <script src=\"js/native-brand.js\"></script>\n</head>");
}

// iOS: после long-press preventDefault на touchend глотает click → suppress* залипает
// и следующий тап по вкладке «съедается». В копии автосброс флага.
html = html.replace(
  /suppressOrderClick = true;/g,
  "suppressOrderClick = true; setTimeout(function(){ suppressOrderClick = false; }, 650);"
);
html = html.replace(
  /suppressCourierClick = true;/g,
  "suppressCourierClick = true; setTimeout(function(){ suppressCourierClick = false; }, 650);"
);

// Не блокировать synthetic click на iOS после long-press (хватает stopPropagation)
html = html.replace(
  /if \(suppressOrderClick && e\) \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*\}/g,
  "if (suppressOrderClick && e) { e.stopPropagation(); }"
);
html = html.replace(
  /if \(suppressCourierClick && e\) \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*\}/g,
  "if (suppressCourierClick && e) { e.stopPropagation(); }"
);

const tailScripts = [
  '<script src="js/native-safearea.js"></script>',
  '<script src="js/native-touchfix.js"></script>',
  '<script src="js/native-resume.js"></script>',
  '<script src="js/native-manager-island.js"></script>',
  '<script src="js/native-brand.js"></script>',
  '<script src="js/capacitor-entry.js"></script>'
].join("\n  ");

if (!html.includes("capacitor-entry.js")) {
  html = html.replace("</body>", "  " + tailScripts + "\n</body>");
} else {
  // ensure touchfix near end
  if (!html.includes("native-touchfix.js")) {
    html = html.replace(
      '<script src="js/capacitor-entry.js"></script>',
      '<script src="js/native-touchfix.js"></script>\n  <script src="js/capacitor-entry.js"></script>'
    );
  }
}

fs.writeFileSync(wwwIndex, html);
console.log("sync-native: injected shims + touch patches into", wwwIndex);
NODE

cat > "$WWW/js/capacitor-entry.js" <<'EOF'
try {
  if (window.Capacitor && window.Capacitor.Plugins) {
    var P = window.Capacitor.Plugins;
    if (P.StatusBar && P.StatusBar.setStyle) {
      P.StatusBar.setStyle({ style: "DARK" }).catch(function () {});
      if (P.StatusBar.setBackgroundColor) {
        P.StatusBar.setBackgroundColor({ color: "#0c0b0a" }).catch(function () {});
      }
    }
    if (P.SplashScreen && P.SplashScreen.hide) {
      P.SplashScreen.hide().catch(function () {});
    }
  }
} catch (e) {}
EOF

echo "sync-native: OK → $WWW"
