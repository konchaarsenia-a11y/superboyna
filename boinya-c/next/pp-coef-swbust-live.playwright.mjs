/**
 * Live: menu URL с v=71125448 + симуляция старого SW v71125444.
 * type 3 → 183.63; restore 2.6/166.63 (mock save — D1 не пишем).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");
const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });

const MENU_URL =
  "https://konchaarsenia-a11y.github.io/superboyna/boinya-c/next.html?cutover=1&v=71125448";
const MENU_URL_BEFORE =
  "https://konchaarsenia-a11y.github.io/superboyna/boinya-c/next.html?cutover=1";
const baseCard = JSON.parse(fs.readFileSync(path.join(outDir, "indixvost-live.json"), "utf8"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function hook() {
  const CARD = Object.assign({}, window.__BASE__, {
    statedCost: "144.63",
    factCost: "144.63",
    calcFactCost: "144.63",
    coef: "3",
    wishes: "[COEF:3] [SCHEME:RAW26] [DOG:Лаки и Перси|без породы|27/16]",
    note: "[COEF:3] [SCHEME:RAW26]"
  });
  window.__SWLIVE__ = { card: CARD, saves: [] };
  window.Telegram = {
    WebApp: {
      initData: "query_id=AA&user=" + encodeURIComponent(JSON.stringify({ id: 650923866, first_name: "Арсений" })),
      initDataUnsafe: { user: { id: 650923866, first_name: "Арсений" } },
      ready() {}, expand() {}, openLink() {}, version: "8.0", platform: "ios"
    }
  };
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    var C = window.__SWLIVE__.card;
    if (a === "getMyAccess" || a === "listAccess") {
      return { status: "success", role: "owner", name: "Арсений", people: [{ telegramId: "650923866", name: "Арсений", role: "owner" }] };
    }
    if (a === "getWeekDayCounts") {
      return { status: "success", items: [{ day: "Среда", short: "Ср", count: 1, date: "30.09.2026" }] };
    }
    if (a === "listDeferred" || a === "listBpIdle") return { status: "success", items: [], idle: [] };
    if (a === "getWeekBannerState") return { status: "success", finished: false, pulled: false };
    if (a === "unlockSubs") return { status: "success", unlocked: true };
    if (a === "listSubscriptions") {
      return {
        status: "success",
        subscriptions: [{
          nick: C.nick, label: C.label, sheet: "ПП", status: "Дом",
          phone: C.phone || "", subId: C.subId, deliveries: C.deliveries,
          statedCost: C.statedCost, factCost: C.factCost, scheme: "RAW26",
          coef: String(C.coef || "3"), wishes: C.wishes, basket: C.basket,
          packCounts: C.packCounts
        }]
      };
    }
    if (a === "getSubscription") {
      return Object.assign({ status: "success", found: true }, C, {
        sheet: "ПП", scheme: "RAW26", ppScheme: "RAW26", coef: String(C.coef || "3")
      });
    }
    if (a === "saveSubscription" || a === "saveOrder") {
      window.__SWLIVE__.saves.push(Object.assign({}, params));
      if (params.statedCost != null) C.statedCost = params.statedCost;
      if (params.factCost != null) C.factCost = params.factCost;
      if (params.calcFactCost != null) C.calcFactCost = params.calcFactCost;
      if (params.wishes != null) {
        C.wishes = params.wishes;
        var m = String(params.wishes).match(/\[COEF:([0-9.]+)\]/i);
        if (m) C.coef = m[1];
      }
      return { status: "success", saved: true, nick: C.nick, subId: C.subId };
    }
    if (a === "calcPrice") {
      var coef = Number(params.coef) || 3;
      var raw = 42.51;
      var n = Number(params.deliveriesN) || 1;
      var packs = 9.2;
      var recover = 3.3 * 5 + 0.8 * 16;
      var frac = 10;
      var fact = Math.round((raw * coef + recover + 7.6 * n + packs + frac) * 100) / 100;
      return {
        status: "success", mode: "pp", scheme: "RAW26", cost: raw, rawCost: raw, markup: coef,
        total: Math.round(raw * coef * 100) / 100, factCost: fact, deliveriesN: n,
        deliveryByn: 7.6 * n, packagesByn: packs, lines: []
      };
    }
    if (a === "getRetailPriceList") return { status: "success", items: [], delivery: { fee: 9, freeFrom: 80 } };
    if (a === "getStats") return { status: "success", monthKey: "2026-11", pp: { expected: 0 } };
    return { status: "success" };
  };
}

async function read(page) {
  return page.evaluate(() => ({
    href: location.href,
    appVer: window.__BOINYA_APP_VER__ || null,
    badge: (document.getElementById("nxAppVer") || {}).textContent || null,
    stated: (document.getElementById("cxStated") || {}).value || null,
    fact: (document.getElementById("cxFact") || {}).value || null,
    coef: (document.getElementById("cxCoef") || {}).value || null,
    clientsSrc: (document.querySelector('script[src*="clients.js"]') || {}).src || null,
    htmlHas71125448: String(document.documentElement.innerHTML).indexOf("71125448") >= 0,
    swCaches: null
  }));
}

async function typeCoef(page, text) {
  const el = page.locator("#cxCoef");
  await el.scrollIntoViewIfNeeded();
  await el.click({ clickCount: 3 });
  await el.fill("");
  await el.pressSequentially(text, { delay: 40 });
  await el.evaluate((node) => {
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    node.blur();
  });
  await wait(1200);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  serviceWorkers: "allow"
});
await context.addInitScript((card) => { window.__BASE__ = card; }, baseCard);
await context.addInitScript(hook);

/* Seed: старый URL без ?v= + SW/localStorage v71125444 */
const seedPage = await context.newPage();
await seedPage.goto(MENU_URL_BEFORE, { waitUntil: "domcontentloaded", timeout: 60000 });
await wait(1500);
const seed = await seedPage.evaluate(async () => {
  try { localStorage.setItem("boinya_app_ver", "71125444"); } catch (e) {}
  try {
    sessionStorage.removeItem("boinya_ver_bust");
    sessionStorage.removeItem("boinya_sw_reloaded");
  } catch (e2) {}
  const origin = location.origin;
  const base = location.pathname.replace(/[^/]+$/, "");
  if (caches && caches.open) {
    const old = await caches.open("boinya-c-shell-v17-71125444");
    await old.put(
      new Request(origin + base + "next/clients.js?v=71125444"),
      new Response("/* stale */", { headers: { "Content-Type": "application/javascript" } })
    );
  }
  return {
    href: location.href,
    ver: window.__BOINYA_APP_VER__ || null,
    caches: caches && caches.keys ? await caches.keys() : []
  };
});
await seedPage.close();

/* Открытие как кнопка меню ПОСЛЕ setChatMenuButton */
const page = await context.newPage();
await page.goto(MENU_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
let boot = null;
for (let i = 0; i < 25; i++) {
  await wait(500);
  boot = await read(page);
  boot.swCaches = await page.evaluate(async () => (caches && caches.keys) ? await caches.keys() : []);
  if (boot.appVer === "71125448" && /71125448/.test(String(boot.badge || ""))) break;
}
await page.screenshot({ path: path.join(outDir, "pp-live-menu-boot-ver.png"), fullPage: false });

await page.getByRole("button", { name: "Клиенты" }).click();
await page.getByRole("button", { name: /indixvost|ДИАНА/i }).first().click();
await page.waitForSelector("#cxStated", { timeout: 25000 });
await wait(1500);
const before = await read(page);
await page.locator("#cxStated").scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: path.join(outDir, "pp-live-menu-before-144.png"), fullPage: false });

await typeCoef(page, "3");
const after3 = await read(page);
await page.locator("#cxStated").scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: path.join(outDir, "pp-live-menu-after-3.png"), fullPage: false });

/* Вернуть 2.6 / 166.63 — не оставляем тестовое 183.63; save mock-only */
await typeCoef(page, "2,6");
const restored = await read(page);
await page.screenshot({ path: path.join(outDir, "pp-live-menu-restored-166.png"), fullPage: false });
await page.evaluate(() => {
  var C = window.__SWLIVE__ && window.__SWLIVE__.card;
  if (C) {
    C.statedCost = "166.63";
    C.factCost = "166.63";
    C.calcFactCost = "166.63";
    C.coef = "2.6";
    C.wishes = "[COEF:2.6] [SCHEME:RAW26] [DOG:Лаки и Перси|без породы|27/16]";
  }
});

const store = await page.evaluate(() => window.__SWLIVE__);
await browser.close();

const summary = {
  menuUrlBefore: MENU_URL_BEFORE,
  menuUrlAfter: MENU_URL,
  seed,
  boot,
  before,
  after3,
  restored,
  saves: (store && store.saves && store.saves.length) || 0,
  okVer: boot && boot.appVer === "71125448" && /71125448/.test(String(boot.badge || "")),
  okClients: /clients\.js\?v=71125448/.test(String(before.clientsSrc || "")),
  okNoStale: !(boot && boot.swCaches || []).some((k) => /71125444/.test(k)),
  ok3: Math.abs(Number(after3.stated) - 183.63) < 0.05,
  okRestored: Math.abs(Number(restored.stated) - 166.63) < 0.05,
  left144: Math.abs(Number(after3.stated) - 144.63) > 0.2
};
fs.writeFileSync(path.join(outDir, "pp-coef-swbust-live.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

let fail = false;
if (!summary.okVer) { console.error("FAIL live ver/badge", boot); fail = true; }
if (!summary.okClients) { console.error("FAIL clients.js ver", before); fail = true; }
if (!summary.okNoStale) { console.error("FAIL stale SW cache", boot && boot.swCaches); fail = true; }
if (!summary.ok3 || !summary.left144) { console.error("FAIL type 3→183.63", after3); fail = true; }
if (!summary.okRestored) { console.error("FAIL restore 166.63", restored); fail = true; }
if (fail) process.exitCode = 2;
else console.error("LIVE MENU SWBUST OK");
