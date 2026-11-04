/**
 * Диагностика «Идёт обработка…» (без правок продукта).
 * Локальный next + route worker с задержками → живой trackStart/busy.
 * Кеш nx_access_v1 — чтобы пройти gate с фейковым initData.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");
const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8773;
const card = JSON.parse(fs.readFileSync(path.join(outDir, "indixvost-live.json"), "utf8"));
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
  cwd: root, stdio: "ignore"
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch("http://127.0.0.1:" + PORT + "/next.html")).ok) return; } catch (e) {}
    await wait(150);
  }
  throw new Error("server");
}

function jsonp(url, obj) {
  const cb = (url.match(/[?&]callback=([^&]+)/) || [])[1] || "nxcb";
  return decodeURIComponent(cb) + "(" + JSON.stringify(obj) + ");";
}

function actionOf(url, postData) {
  const m = url.match(/[?&]action=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  try {
    const j = JSON.parse(postData || "{}");
    if (j && j.action) return String(j.action);
  } catch (e) {}
  return "";
}

const DELAY = {
  getMyAccess: 600,
  listAccess: 500,
  getWeekDayCounts: 800,
  listDeferred: 400,
  listBpIdle: 400,
  getWeekBannerState: 300,
  unlockSubs: 200,
  listSubscriptions: 4500,
  getSubscription: 2500,
  calcPrice: 5500,
  getStats: 4500,
  getCutting: 6000,
  getAssembly: 4000,
  getCourier: 4000,
  listWarehouses: 900,
  getRetailPriceList: 700,
  listSurvey: 400
};

function respond(action) {
  if (action === "getMyAccess" || action === "listAccess") {
    return { status: "success", role: "owner", name: "Арсений", people: [{ telegramId: "4242", name: "Арсений", role: "owner" }] };
  }
  if (action === "getWeekDayCounts") {
    return { status: "success", items: [{ day: "Среда", short: "Ср", count: 1, date: "30.09.2026" }] };
  }
  if (action === "listDeferred" || action === "listBpIdle") return { status: "success", items: [], idle: [] };
  if (action === "getWeekBannerState") return { status: "success", finished: false, pulled: false };
  if (action === "unlockSubs") return { status: "success", unlocked: true };
  if (action === "startDesktopAuth") return { status: "success", desktopAuth: "ok", botUsername: "boyniaGB_bot", token: "x" };
  if (action === "listSubscriptions") {
    return {
      status: "success",
      subscriptions: [{
        nick: card.nick, label: card.label, sheet: "ПП", status: "Дом",
        phone: card.phone || "", subId: card.subId, deliveries: card.deliveries,
        statedCost: card.statedCost, factCost: card.factCost, scheme: "RAW26",
        coef: "2.6", wishes: card.wishes, basket: card.basket, packCounts: card.packCounts
      }]
    };
  }
  if (action === "getSubscription") {
    return Object.assign({ status: "success", found: true }, card, {
      sheet: "ПП", scheme: "RAW26", ppScheme: "RAW26", coef: "2.6"
    });
  }
  if (action === "calcPrice") {
    return {
      status: "success", mode: "pp", scheme: "RAW26", cost: 42.51, rawCost: 42.51,
      factCost: 166.63, markup: 2.6,
      lines: [
        { name: "ЛЁГКОЕ", sub: "Среднее", val: 500, unitPrice: 2.25, per100: 2.25 },
        { name: "УХО Г", sub: "Обычное", val: 2, unitPrice: 2.5, piece: true },
        { name: "БЫЧИЙ КОРЕНЬ", sub: "БОЛ", val: 6, unitPrice: 2.2, piece: true },
        { name: "ТРАХЕЯ", sub: "СРЕД", val: 4, unitPrice: 1.8, piece: true },
        { name: "СТАНОВАЯ ЖИЛА", sub: "БОЛ", val: 4, unitPrice: 1.9, piece: true }
      ]
    };
  }
  if (action === "getStats") {
    return { status: "success", monthKey: "2026-11", pp: { expected: 1000, cost: 400, clean: 600 }, money: {} };
  }
  if (action === "getCutting" || action === "getAssembly" || action === "getCourier") {
    return { status: "success", items: [], clients: [], day: "Среда", date: "30.09.2026" };
  }
  if (action === "listWarehouses") return { status: "success", items: [] };
  if (action === "getRetailPriceList") return { status: "success", items: [], delivery: { fee: 9, freeFrom: 80 } };
  if (action === "listSurvey") return { status: "success", items: [] };
  return { status: "success" };
}

await ready();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
});
await context.addInitScript(() => {
  window.Telegram = {
    WebApp: {
      initData: "query_id=AA&user=" + encodeURIComponent(JSON.stringify({ id: 4242, first_name: "Арсений" })),
      initDataUnsafe: { user: { id: 4242, first_name: "Арсений" } },
      ready() {}, expand() {}, openLink() {}, version: "8.0"
    }
  };
  window.__BOINYA_C_CUTOVER__ = "1";
  try {
    localStorage.setItem("nx_access_v1", JSON.stringify({
      role: "owner", name: "Арсений", telegramId: "4242",
      people: [{ telegramId: "4242", name: "Арсений", role: "owner" }]
    }));
    localStorage.setItem("boinya_c_cutover", "1");
  } catch (e) {}
});

const apiLog = [];
await context.route(/boinya-c\.konchaarsenia\.workers\.dev|script\.google\.com\/macros/, async (route) => {
  const req = route.request();
  const url = req.url();
  const action = actionOf(url, req.postData());
  const delay = DELAY[action] != null ? DELAY[action] : 150;
  const t0 = Date.now();
  apiLog.push({ phase: "start", action, t: t0, delay });
  await wait(delay);
  const body = respond(action);
  apiLog.push({ phase: "end", action, t: Date.now(), ms: Date.now() - t0, status: body.status });
  const isJsonp = /[?&]callback=/.test(url);
  await route.fulfill({
    status: 200,
    contentType: isJsonp ? "application/javascript" : "application/json",
    body: isJsonp ? jsonp(url, body) : JSON.stringify(body)
  });
});

const page = await context.newPage();
const busyTrail = [];
async function sample(tag) {
  const s = await page.evaluate((tag) => {
    const bar = document.getElementById("nxBusy");
    const toast = document.getElementById("nxToast");
    const nav = [...document.querySelectorAll("#nxNav button, [data-tab], .b-tab__item")].map((b) => (b.textContent || "").trim()).filter(Boolean).slice(0, 8);
    return {
      tag,
      busy: !!(bar && !bar.hidden),
      busyText: bar && !bar.hidden ? (bar.textContent || "").replace(/\s+/g, " ").trim() : "",
      toast: toast && !toast.hidden ? (toast.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120) : "",
      notes: [...document.querySelectorAll(".b-note")].map((n) => (n.textContent || "").trim())
        .filter((t) => /Загруз|Счита|Открыв|Обраб|скелет/i.test(t)).slice(0, 6),
      spins: document.querySelectorAll(".b-spin, .b-btn--loading, .b-loader, .b-skeleton").length,
      nav
    };
  }, tag);
  busyTrail.push(Object.assign({ at: Date.now() }, s));
  return s;
}

const t0 = Date.now();
await page.goto("http://127.0.0.1:" + PORT + "/next.html?v=71125444&cutover=1", { waitUntil: "domcontentloaded" });
await wait(2000);
await sample("boot");
await page.screenshot({ path: path.join(outDir, "busy-diag-boot.png"), fullPage: false });

const clientsBtn = page.getByRole("button", { name: "Клиенты" });
if (!(await clientsBtn.count())) {
  // fallback: any nav containing Клиенты
  await page.locator("text=Клиенты").first().click({ timeout: 10000 });
} else {
  await clientsBtn.click();
}
const n0 = apiLog.filter((x) => x.phase === "start").length;
for (let i = 0; i < 14; i++) { await wait(500); await sample("clients-" + i); }
await page.getByText(/indixvost|ДИАНА/i).first().waitFor({ timeout: 35000 });
await sample("list-ready");
await page.screenshot({ path: path.join(outDir, "busy-diag-clients.png"), fullPage: false });

const n1 = apiLog.filter((x) => x.phase === "start").length;
await page.getByRole("button", { name: /indixvost|ДИАНА/i }).first().click();
for (let i = 0; i < 18; i++) { await wait(500); await sample("card-" + i); }
await page.getByRole("button", { name: "Сохранить" }).waitFor({ timeout: 35000 }).catch(() => {});
await sample("card-ready");
await page.screenshot({ path: path.join(outDir, "busy-diag-card.png"), fullPage: false });

const n2 = apiLog.filter((x) => x.phase === "start").length;
await page.getByRole("button", { name: "Цех" }).click();
for (let i = 0; i < 16; i++) { await wait(500); await sample("ceh-" + i); }
await page.screenshot({ path: path.join(outDir, "busy-diag-ceh.png"), fullPage: false });

const n3 = apiLog.filter((x) => x.phase === "start").length;
await page.getByRole("button", { name: "Заказы" }).click();
for (let i = 0; i < 10; i++) { await wait(500); await sample("orders-" + i); }

await browser.close();
try { server.kill("SIGTERM"); } catch (e) {}

const starts = apiLog.filter((x) => x.phase === "start");
const byAction = {};
starts.forEach((a) => { byAction[a.action] = (byAction[a.action] || 0) + 1; });
let overlap = 0, maxOverlap = 0, overlapMs = 0, overlapStarted = 0;
apiLog.forEach((e) => {
  if (e.phase === "start") {
    if (overlap === 0) overlapStarted = e.t;
    overlap++;
    if (overlap > maxOverlap) maxOverlap = overlap;
  } else {
    overlap = Math.max(0, overlap - 1);
    if (overlap === 0 && overlapStarted) overlapMs = Math.max(overlapMs, e.t - overlapStarted);
  }
});
const busyOn = busyTrail.filter((b) => b.busy);

const report = {
  mode: "local v71125444 + delayed worker route (real api trackStart)",
  totalMs: Date.now() - t0,
  requestStarts: starts.length,
  byAction,
  maxOverlap,
  longestBusyWindowMsHint: overlapMs,
  phases: {
    bootToClientsClicks: n0,
    clientsTab: n1 - n0,
    openPpCard: n2 - n1,
    cehTab: n3 - n2,
    ordersTab: starts.length - n3
  },
  busyVisibleCount: busyOn.length,
  firstBusy: busyOn[0] || null,
  busySamples: busyOn.slice(0, 15),
  notableTrail: busyTrail.filter((b) => b.busy || b.toast || b.spins > 2 || (b.notes && b.notes.length)),
  slowEnds: apiLog.filter((x) => x.phase === "end" && x.ms >= 2000).map((x) => ({ action: x.action, ms: x.ms })),
  code: {
    text: "Идёт обработка…",
    ui: "boinya-c/next/shell.js → busy() / #nxBusy",
    trigger: "boinya-c/next/api.js trackStart/trackEnd — бар через 8с при busyN>0 на любом apiGet/apiPost",
    thresholdMs: 8000,
    polls: [
      "production.js startCourAsmPoll: getAssembly каждые 12с на вкладке Курьер",
      "production.js warm(): getCutting+getAssembly+getCourier при входе в Цех",
      "app.js watchTelegram: initData poll 400мс ×20 (только без hook)",
      "clients.js seedCardRawFromLiveQuiet_: calcPrice при открытии ПП (ветка v71125444)"
    ]
  },
  delaysUsedMs: DELAY
};
fs.writeFileSync(path.join(outDir, "busy-diag.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
