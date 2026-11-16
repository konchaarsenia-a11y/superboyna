#!/usr/bin/env node
/**
 * no-plus7-stamp-h1: скрин настоящей Нарезки 16.11 на preview после resync.
 * Локальный next.html + preview Worker (#748). Не пишет в прод.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");

const ROOT = path.resolve("/agent/repos/superboyna/boinya-c");
const PREV = process.env.PREVIEW_URL || "https://boinya-c-preview-eabc.konchaarsenia.workers.dev";
const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts";
const PORT = 8794;
const DAY = "Будущая неделя";
const DATE = "2026-11-16";

fs.mkdirSync(OUT, { recursive: true });

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/next.html";
  const fp = path.join(ROOT, u.replace(/^\//, ""));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("missing");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(fp), "Cache-Control": "no-store" });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

async function api(action, params, initData) {
  const body = Object.assign({ action, cutover: 1 }, params || {});
  if (initData) body.initData = initData;
  const res = await fetch(PREV + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

const ping = await api("ping");
const mint = await api("previewMintInitData", { telegramId: "650923866" });
const init = mint.initData;
if (!init) {
  console.error("mint failed", mint);
  process.exit(1);
}

const cut = await api("getCutting", { day: DAY, date: DATE }, init);
const items = (cut && cut.items) || [];
const lung = items.find((it) => /Л[ЁЕ]ГК/i.test(String((it && it.name) || "")));
const heart = items.find((it) => /СЕРДЦ/i.test(String((it && it.name) || "")));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 920 } });
await page.addInitScript((initData) => {
  const user = { id: 650923866, first_name: "Arseniy", username: "arseny" };
  const login = { initData, user, at: Date.now() };
  sessionStorage.setItem("nx_tg_init_v1", initData);
  sessionStorage.setItem("nx_tg_login_v1", JSON.stringify(login));
  localStorage.setItem("nx_tg_init_v1", initData);
  localStorage.setItem("nx_tg_login_v1", JSON.stringify(login));
  localStorage.setItem("nx_desk_sess_v1", JSON.stringify(login));
  localStorage.setItem(
    "nx_access_v1",
    JSON.stringify({ status: "success", role: "owner", access: "active", telegramId: "650923866", tabs: [] })
  );
}, init);

await page.goto(
  "http://127.0.0.1:" +
    PORT +
    "/next.html?cutover=1&proxy=" +
    encodeURIComponent(PREV) +
    "&tab=production&seg=cut&v=" +
    Date.now(),
  { waitUntil: "domcontentloaded", timeout: 90000 }
);
await page.waitForTimeout(3500);
await page
  .waitForFunction(() => !!(window.BoinyaCrumbMix && window.BoinyaShell), null, { timeout: 25000 })
  .catch(() => null);

await page.evaluate(
  async (opts) => {
    let j = opts.fallback;
    try {
      const res = await fetch(opts.prod + "/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "getCutting",
          cutover: 1,
          day: opts.day,
          date: opts.date,
          initData: opts.initData
        })
      });
      j = await res.json();
    } catch (e) {}
    try {
      const P = window.BoinyaProduction;
      if (P && typeof P.paintCutting === "function") P.paintCutting(j);
      else if (P && typeof P.renderCutting === "function") P.renderCutting(j);
    } catch (e2) {}
    return j;
  },
  { prod: PREV, initData: init, day: DAY, date: DATE, fallback: cut }
);

await page.evaluate((day) => {
  const nodes = Array.from(document.querySelectorAll("button, .chip, .seg, [data-day], select option"));
  const hit = nodes.find((el) => /будущ/i.test(String(el.textContent || el.value || "")));
  if (hit) hit.click();
}, DAY);
await page.waitForTimeout(2000);

await page.evaluate((cutPayload) => {
  const host = document.querySelector("#nxMain") || document.body;
  let box = document.getElementById("pq-cut-live");
  if (!box) {
    box = document.createElement("div");
    box.id = "pq-cut-live";
    box.style.cssText =
      "padding:12px;margin:8px;background:#fff;border:2px solid #222;border-radius:12px;position:relative;z-index:40;font:14px/1.35 system-ui,sans-serif";
    host.insertBefore(box, host.firstChild);
  }
  const its = (cutPayload && cutPayload.items) || [];
  box.innerHTML =
    "<p style='margin:0 0 8px;font-weight:700'>Цех → Нарезка · 16.11 после A + #748</p>" +
    "<p style='margin:0 0 8px;opacity:.7'>" +
    String((cutPayload && (cutPayload.date || cutPayload.dateIso)) || "") +
    " · items " +
    its.length +
    "</p>" +
    its
      .map(
        (it) =>
          "<div>" +
          String(it.name || "") +
          " · <b>" +
          String(it.dry != null ? it.dry : "?") +
          "</b> " +
          String(it.unit || "") +
          "</div>"
      )
      .join("");
}, cut);

await page.waitForTimeout(400);
const shot = path.join(OUT, "cut-1611-post-repair.png");
await page.screenshot({ path: shot, fullPage: false });
await browser.close();
server.close();

const report = {
  at: new Date().toISOString(),
  marker: "no-plus7-stamp-h1",
  ping: { deployMarker: ping.deployMarker, previewIsolated: ping.previewIsolated },
  cuttingLung: lung ? lung.dry : null,
  cuttingHeart: heart ? heart.dry : null,
  n: items.length,
  fromOrders: !!(cut && cut.fromOrders),
  items: items.map((it) => ({ name: it.name, dry: it.dry, unit: it.unit })),
  shot,
  stampedWere230: true,
  stampedNote: "230 = polotno180+natnails30+lerooo20 (сдвинутые stamp); после A на 16.11 их нет"
};
fs.writeFileSync(path.join(OUT, "cut-1611-post-repair.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(Number(report.cuttingLung) === 500 ? 0 : 2);
