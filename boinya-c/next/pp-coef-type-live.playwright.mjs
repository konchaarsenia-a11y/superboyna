/**
 * Live bot URL: ввод в поле #cxCoef (не чип) на indixvost.
 * 144.63@[COEF:3] → type 3 → 183.63 → type 2,6 → 166.63 → save → reopen.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");
const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
const BOT_URL =
  "https://konchaarsenia-a11y.github.io/superboyna/boinya-c/next.html?cutover=1&v=71125448";
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
  window.__TYPE_LIVE__ = { card: CARD, saves: [] };
  window.Telegram = {
    WebApp: {
      initData: "query_id=AA&user=" + encodeURIComponent(JSON.stringify({ id: 650923866, first_name: "Арсений" })),
      initDataUnsafe: { user: { id: 650923866, first_name: "Арсений" } },
      ready() {}, expand() {}, openLink() {}, version: "8.0", platform: "ios"
    }
  };
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    var C = window.__TYPE_LIVE__.card;
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
      window.__TYPE_LIVE__.saves.push(Object.assign({}, params));
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
    stated: (document.getElementById("cxStated") || {}).value || null,
    fact: (document.getElementById("cxFact") || {}).value || null,
    coef: (document.getElementById("cxCoef") || {}).value || null,
    h6: !!window.__BOINYA_HAS_H6__,
    script: (document.querySelector('script[src*="clients.js"]') || {}).src || null
  }));
}

async function typeCoef(page, text) {
  const el = page.locator("#cxCoef");
  await el.scrollIntoViewIfNeeded();
  await el.click({ clickCount: 3 });
  await el.fill("");
  await el.pressSequentially(text, { delay: 50 });
  await el.evaluate((node) => {
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    node.blur();
  });
  await wait(1000);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
});
await context.addInitScript((card) => { window.__BASE__ = card; }, baseCard);
await context.addInitScript(hook);
await context.route("**/next/clients.js*", async (route) => {
  const res = await route.fetch();
  const body = await res.text();
  const injected = "window.__BOINYA_HAS_H6__=" + (body.indexOf("pp-card-price-recalc-h6") >= 0) + ";" + body;
  await route.fulfill({
    status: res.status(),
    headers: { ...res.headers(), "content-type": "application/javascript" },
    body: injected
  });
});

const page = await context.newPage();
await page.goto(BOT_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await wait(2000);
await page.getByRole("button", { name: "Клиенты" }).click({ timeout: 30000 });
await page.getByRole("button", { name: /indixvost|ДИАНА/i }).first().click();
await page.waitForSelector("#cxStated", { timeout: 20000 });
await wait(1500);

const before = await read(page);
await page.locator("#cxStated").scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: path.join(outDir, "pp-live-type-before-144.png"), fullPage: false });

await typeCoef(page, "3");
const after3 = await read(page);
await page.locator("#cxStated").scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: path.join(outDir, "pp-live-type-after-3.png"), fullPage: false });

await typeCoef(page, "2,6");
const after26 = await read(page);
await page.locator("#cxStated").scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: path.join(outDir, "pp-live-type-after-2comma6.png"), fullPage: false });

await page.getByRole("button", { name: "Сохранить" }).click();
await wait(1200);
await page.locator('[data-act="cl-back"]').click().catch(() => {});
await wait(600);
await page.getByRole("button", { name: /indixvost|ДИАНА/i }).first().click();
await page.waitForSelector("#cxStated", { timeout: 20000 });
await page.locator("#cxCoef").scrollIntoViewIfNeeded();
await wait(1200);
const reopen = await read(page);
await page.locator("#cxStated").scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: path.join(outDir, "pp-live-type-reopen-166.png"), fullPage: false });

await browser.close();

const summary = {
  botUrl: BOT_URL,
  before,
  after3,
  after26,
  reopen,
  ok3: Math.abs(Number(after3.stated) - 183.63) < 0.05,
  ok26: Math.abs(Number(after26.stated) - 166.63) < 0.05,
  okReopen: Math.abs(Number(reopen.stated) - 166.63) < 0.05,
  liveH6: !!(after3.h6 || before.h6),
  liveVer: /71125448/.test(String(before.script || before.href || ""))
};
fs.writeFileSync(path.join(outDir, "pp-coef-type-live.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
let fail = false;
if (!summary.liveH6 || !summary.liveVer) { console.error("FAIL live version/h6", before); fail = true; }
if (!summary.ok3) { console.error("FAIL type 3", after3); fail = true; }
if (!summary.ok26) { console.error("FAIL type 2,6", after26); fail = true; }
if (!summary.okReopen) { console.error("FAIL reopen", reopen); fail = true; }
if (fail) process.exitCode = 2;
else console.error("LIVE TYPE-FIELD OK");
