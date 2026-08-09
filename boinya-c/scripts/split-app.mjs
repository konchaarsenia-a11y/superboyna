#!/usr/bin/env node
/**
 * Выносит огромный inline <script> из app.html → app.main.js (defer).
 * HTML/CSS начинают рисоваться, пока JS качается параллельно.
 * Только песочница boinya-c/.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "..");
const appPath = path.join(dir, "app.html");
const outJs = path.join(dir, "app.main.js");

let html = fs.readFileSync(appPath, "utf8");

// уже разделено?
if (html.includes('src="app.main.js"') || html.includes("src='app.main.js'")) {
  console.log("already split");
  process.exit(0);
}

const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let best = null;
let m;
while ((m = re.exec(html))) {
  const attrs = m[1] || "";
  if (/\bsrc\s*=/i.test(attrs)) continue;
  const body = m[2] || "";
  if (!best || body.length > best.body.length) {
    best = { start: m.index, end: m.index + m[0].length, body, full: m[0] };
  }
}

if (!best || best.body.length < 50000) {
  console.error("big inline script not found", best && best.body.length);
  process.exit(1);
}

// лёгкая чистка JS: убрать /* */ комментарии вне строк — только простые блочные в начале строк
let js = best.body;
js = js.replace(/^\s*\/\*[\s\S]*?\*\/\s*$/gm, "\n");
js = js.replace(/\n[ \t]*\/\/(?![^\n]*['"`]).*$/gm, "\n");
js = js.replace(/\n{3,}/g, "\n\n");

fs.writeFileSync(outJs, js);
const verMatch = html.match(/var APP_VER = "(v[^"]+)"/);
const ver = verMatch ? verMatch[1].replace(/\D/g, "") : String(Date.now());
const tag = `<script src="app.main.js?v=${ver}" defer></script>`;
html = html.slice(0, best.start) + tag + html.slice(best.end);

// preload в head — параллельная загрузка
if (!html.includes('rel="preload" href="app.main.js')) {
  html = html.replace(
    "</title>",
    `</title>\n  <link rel="preload" href="app.main.js?v=${ver}" as="script">`
  );
}

fs.writeFileSync(appPath, html);
console.log(
  "split OK: app.html",
  fs.statSync(appPath).size,
  "app.main.js",
  fs.statSync(outJs).size,
  "saved inline",
  best.body.length
);
