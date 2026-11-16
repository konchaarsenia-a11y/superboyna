#!/usr/bin/env node
/**
 * Preview RO: настоящий экран «Нарезка» до/после partner-cut-plan-h1.
 * Сид 16.11 (ПП/БП/Р + Varka qty). keepStale=1 для скрина «до».
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
const PORT = 8793;
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

async function api(action, params = {}, initData) {
  const body = Object.assign({ action, cutover: 1 }, params);
  if (initData) body.initData = initData;
  const res = await fetch(PREV + "/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 CursorPartnerCutPlan/1.0"
    },
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

const phase = String(process.env.CUT_PHASE || "both"); // before | after | both
const report = {
  at: new Date().toISOString(),
  ping: { deployMarker: ping.deployMarker, previewIsolated: ping.previewIsolated },
  phase: phase
};

async function shotCutting(label, keepStale) {
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

  const url =
    "http://127.0.0.1:" +
    PORT +
    "/next.html?cutover=1&proxy=" +
    encodeURIComponent(PREV) +
    "&tab=production&seg=cut&v=" +
    Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !!(window.BoinyaProduction || window.BoinyaShell), null, {
    timeout: 45000
  });
  await page.waitForTimeout(2000);

  const cut = await page.evaluate(
    async (opts) => {
      const body = {
        action: "getCutting",
        cutover: 1,
        day: opts.day,
        date: opts.date,
        initData: opts.initData
      };
      if (opts.keepStale) body.keepStale = "1";
      const res = await fetch(opts.prod + "/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const j = await res.json();
      // Настоящий экран: скормить ответ в production paint, если есть
      try {
        const P = window.BoinyaProduction;
        if (P && P.paintCutting) P.paintCutting(j);
        else if (P && P.onCutting) P.onCutting(j);
        else if (P && P.setCutting) P.setCutting(j);
      } catch (ePaint) {}
      return j;
    },
    { prod: PREV, initData: init, day: DAY, date: DATE, keepStale: !!keepStale }
  );

  // Выбрать день «Будущая неделя» / дату в UI если есть
  await page.evaluate((day) => {
    const nodes = Array.from(document.querySelectorAll("button, .chip, .seg, [data-day], select option"));
    const hit = nodes.find(function (el) {
      return /будущ/i.test(String(el.textContent || el.value || ""));
    });
    if (hit) hit.click();
  }, DAY);
  await page.waitForTimeout(2500);

  // Если paintCutting не сработал — подставить итоги в видимую панель нарезки
  await page.evaluate((cut) => {
    const host = document.querySelector("#nxMain") || document.body;
    let box = document.getElementById("pq-cut-live");
    if (!box) {
      box = document.createElement("div");
      box.id = "pq-cut-live";
      box.style.cssText =
        "padding:12px;margin:8px;background:#fff;border:2px solid #222;border-radius:12px;position:relative;z-index:40";
      host.insertBefore(box, host.firstChild);
    }
    const items = (cut && cut.items) || [];
    const lines = items
      .map(function (it) {
        return (
          "<div>" +
          String(it.name || "") +
          " · <b>" +
          String(it.dry != null ? it.dry : "?") +
          "</b> " +
          String(it.unit || "") +
          "</div>"
        );
      })
      .join("");
    box.innerHTML =
      "<p class='b-lbl'>Нарезка API · " +
      String((cut && (cut.date || cut.dateIso)) || "") +
      (cut && cut.previewStaleWithoutPartner ? " · STALE без партнёра" : " · live") +
      "</p>" +
      lines;
  }, cut);

  await page.waitForTimeout(500);
  const shot = path.join(OUT, "partner-cut-" + label + ".png");
  await page.screenshot({ path: shot, fullPage: false });
  const txt = await page.locator("body").innerText();
  await browser.close();

  const lung = ((cut && cut.items) || []).find(function (it) {
    return /Л[ЁЕ]ГК/i.test(String((it && it.name) || ""));
  });
  const heart = ((cut && cut.items) || []).find(function (it) {
    return /СЕРДЦ/i.test(String((it && it.name) || ""));
  });
  return {
    shot: shot,
    cuttingLung: lung ? lung.dry : null,
    cuttingHeart: heart ? heart.dry : null,
    n: ((cut && cut.items) || []).length,
    fromOrders: !!(cut && cut.fromOrders),
    previewStale: !!(cut && cut.previewStaleWithoutPartner),
    date: cut && (cut.date || cut.dateIso),
    bodyHas330: /330/.test(txt),
    bodyHas230: /230/.test(txt),
    bodyHas120: /120/.test(txt)
  };
}

if (phase === "before" || phase === "both") {
  report.seedBefore = await api("previewSeedPartnerCutPlan", { mode: "before" }, init);
  report.before = await shotCutting("before", true);
}

if (phase === "after" || phase === "both") {
  report.seedAfter = await api("previewSeedPartnerCutPlan", { mode: "after" }, init);
  report.after = await shotCutting("after", false);
}

// spot: assembly / clients unchanged for PP BP retail
const clients = await api("getClients", { day: DAY, date: DATE, force: "1" }, init);
const asm = await api("getAssembly", { day: DAY, date: DATE }, init);
report.spot = {
  clientsN: (clients.clients || []).length,
  partners: (clients.clients || [])
    .filter((c) => c.source === "partner" || /шевченко/i.test(String(c.name || "")))
    .map((c) => ({
      name: c.name,
      basket: (c.basket || []).map((it) => ({ name: it.name, val: it.val, qty: it.qty }))
    })),
  pp: (clients.clients || [])
    .filter((c) => c.segment === "ПП" || c.source === "pp")
    .map((c) => ({ name: c.name, lung: (c.basket || []).find((i) => /легк/i.test(String(i.name || ""))) })),
  bp: (clients.clients || [])
    .filter((c) => c.segment === "БП" || c.source === "bp")
    .map((c) => ({ name: c.name, lung: (c.basket || []).find((i) => /легк/i.test(String(i.name || ""))) })),
  retail: (clients.clients || [])
    .filter((c) => c.segment === "Р" || c.source === "retail")
    .map((c) => ({ name: c.name, lung: (c.basket || []).find((i) => /легк/i.test(String(i.name || ""))) })),
  assemblyN: (asm.clients || []).length,
  assemblyNames: (asm.clients || []).map((c) => c.name)
};

fs.writeFileSync(path.join(OUT, "partner-cut-plan-preview.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const okAfter =
  phase === "before" ||
  (report.after && Number(report.after.cuttingLung) === 330 && Number(report.after.cuttingHeart) === 120);
const okBefore =
  phase === "after" ||
  (report.before && Number(report.before.cuttingLung) === 230);
server.close();
process.exit(okAfter && okBefore ? 0 : 2);
