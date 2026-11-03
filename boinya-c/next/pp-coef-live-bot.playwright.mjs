/**
 * Живой путь: URL кнопки бота (BOINYA_MINI_URL) на GitHub Pages.
 * Карточка indixvost: уже [COEF:3]+145 → retap 3 → 183.63 → save → reopen 183.63.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");
const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });

const BOT_URL =
  "https://konchaarsenia-a11y.github.io/superboyna/boinya-c/next.html?cutover=1&v=71125447";
const baseCard = JSON.parse(fs.readFileSync(path.join(outDir, "indixvost-live.json"), "utf8"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function hook() {
  const CARD = Object.assign({}, window.__BASE_CARD__, {
    statedCost: "145",
    factCost: "145",
    calcFactCost: "145",
    coef: "3",
    wishes: "[COEF:3] [SCHEME:RAW26] [DOG:Лаки и Перси|без породы|27/16]",
    note: "[COEF:3] [SCHEME:RAW26]"
  });
  window.__LIVE_STORE__ = { card: CARD, saves: [] };
  window.Telegram = {
    WebApp: {
      initData: "query_id=AA&user=" + encodeURIComponent(JSON.stringify({ id: 650923866, first_name: "Арсений" })),
      initDataUnsafe: { user: { id: 650923866, first_name: "Арсений" } },
      ready() {}, expand() {}, openLink() {}, version: "8.0", platform: "ios"
    }
  };
  window.__PP_LIVE__ = { calcCalls: [], href: location.href, scripts: [] };
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    var C = window.__LIVE_STORE__.card;
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
      window.__LIVE_STORE__.saves.push(Object.assign({}, params));
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
      window.__PP_LIVE__.calcCalls.push({ coef: params.coef });
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

async function prices(page) {
  return page.evaluate(() => ({
    href: location.href,
    stated: (document.getElementById("cxStated") || {}).value || null,
    fact: (document.getElementById("cxFact") || {}).value || null,
    coef: (document.getElementById("cxCoef") || {}).value || null,
    clientsVer: (document.querySelector('script[src*="clients.js"]') || {}).src || null,
    hasH5: !!(window.__BOINYA_HAS_H5__),
    markerProbe: (function () {
      try {
        return String(document.documentElement.innerHTML).indexOf("71125447") >= 0;
      } catch (e) { return false; }
    })()
  }));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
});
await context.addInitScript((card) => { window.__BASE_CARD__ = card; }, baseCard);
await context.addInitScript(hook);

/* Перехват clients.js — убедиться, что грузится live 71125447 с h5 */
await context.route("**/next/clients.js*", async (route) => {
  const res = await route.fetch();
  const body = await res.text();
  const injected =
    "window.__BOINYA_HAS_H5__=" + (body.indexOf("pp-card-price-recalc-h5") >= 0) +
    ";window.__BOINYA_CLIENTS_LEN__=" + body.length + ";" + body;
  await route.fulfill({
    status: res.status(),
    headers: { ...res.headers(), "content-type": "application/javascript" },
    body: injected
  });
});

const page = await context.newPage();
await page.goto(BOT_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await wait(2000);

const boot = await page.evaluate(() => ({
  href: location.href,
  hasH5: !!window.__BOINYA_HAS_H5__,
  clientsLen: window.__BOINYA_CLIENTS_LEN__ || 0,
  scriptSrc: (document.querySelector('script[src*="clients.js"]') || {}).src || null
}));

await page.getByRole("button", { name: "Клиенты" }).click({ timeout: 30000 });
await page.getByText(/indixvost|ДИАНА/i).first().waitFor({ timeout: 30000 });
await page.getByRole("button", { name: /indixvost|ДИАНА/i }).first().click();
await page.waitForSelector("#cxStated", { timeout: 20000 });
await page.locator("#cxCoef").scrollIntoViewIfNeeded();
await wait(2000);

const before = await prices(page);
await page.locator("#cxStated").scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: path.join(outDir, "pp-live-bot-before-145.png"), fullPage: false });

/* Повторный тап чипа 3 при уже coef=3 */
const chip3 = page.locator('[data-act="cl-coef"][data-v="3"]');
if (await chip3.count()) await chip3.click();
else {
  await page.locator("#cxCoef").fill("3");
  await page.locator("#cxCoef").dispatchEvent("change");
}
await wait(2500);
const afterTap = await prices(page);
await page.locator("#cxStated").scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: path.join(outDir, "pp-live-bot-after-retap3.png"), fullPage: false });

await page.getByRole("button", { name: "Сохранить" }).click();
await wait(1500);
await page.locator('[data-act="cl-back"]').click().catch(async () => {
  await page.getByText(/К списку/i).click();
});
await wait(800);
await page.getByRole("button", { name: /indixvost|ДИАНА/i }).first().click();
await page.waitForSelector("#cxStated", { timeout: 20000 });
await page.locator("#cxCoef").scrollIntoViewIfNeeded();
await wait(1500);
const afterReopen = await prices(page);
await page.locator("#cxStated").scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: path.join(outDir, "pp-live-bot-reopen-183.png"), fullPage: false });

const store = await page.evaluate(() => ({
  saves: (window.__LIVE_STORE__ && window.__LIVE_STORE__.saves) || [],
  card: window.__LIVE_STORE__ && {
    stated: window.__LIVE_STORE__.card.statedCost,
    coef: window.__LIVE_STORE__.card.coef,
    wishes: window.__LIVE_STORE__.card.wishes
  },
  calcCalls: (window.__PP_LIVE__ && window.__PP_LIVE__.calcCalls) || []
}));

await browser.close();

const summary = {
  botUrl: BOT_URL,
  boot,
  before,
  afterTap,
  afterReopen,
  store,
  left145: Math.abs(Number(afterTap.stated) - 145) > 0.2,
  approx183: Math.abs(Number(afterTap.stated) - 183.63) < 0.05,
  reopen183: Math.abs(Number(afterReopen.stated) - 183.63) < 0.05,
  liveH5: !!boot.hasH5,
  liveVer: /71125447/.test(String(boot.scriptSrc || "")) || /71125447/.test(String(boot.href || ""))
};
fs.writeFileSync(path.join(outDir, "pp-live-bot-path.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

let fail = false;
if (!summary.liveH5 || !summary.liveVer) {
  console.error("FAIL live bot URL did not load v71125447/h5", boot);
  fail = true;
}
if (!summary.left145 || !summary.approx183) {
  console.error("FAIL retap 3 must leave 145 → 183.63", afterTap);
  fail = true;
}
if (!summary.reopen183) {
  console.error("FAIL reopen must show 183.63", afterReopen);
  fail = true;
}
if (fail) process.exitCode = 2;
else console.error("LIVE BOT PATH OK");
