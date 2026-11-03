/**
 * После фикса: локальный next.html + корзина indixvost.
 * zero+fail → не травить 56; zero+mock → ~183 @3; 166+fail → 183 локально.
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
const PORT = 8772;
const baseCard = JSON.parse(fs.readFileSync(path.join(outDir, "indixvost-live.json"), "utf8"));
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
  cwd: root,
  stdio: "ignore"
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch("http://127.0.0.1:" + PORT + "/next.html")).ok) return;
    } catch (e) {}
    await wait(150);
  }
  throw new Error("server");
}

function hook(opts) {
  const CARD = Object.assign({}, opts.card, {
    statedCost: opts.statedCost,
    factCost: opts.statedCost,
    calcFactCost: opts.statedCost
  });
  const MODE = opts.mode;
  window.__LIVE_CARD__ = CARD;
  window.Telegram = {
    WebApp: {
      initData: "query_id=AA&user=" + encodeURIComponent(JSON.stringify({ id: 4242, first_name: "Арсений" })),
      initDataUnsafe: { user: { id: 4242, first_name: "Арсений" } },
      ready() {}, expand() {}, openLink() {}, version: "8.0"
    }
  };
  window.__PP_DIAG__ = { calcCalls: [] };
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    if (a === "getMyAccess" || a === "listAccess") {
      return { status: "success", role: "owner", name: "Арсений", people: [{ telegramId: "4242", name: "Арсений", role: "owner" }] };
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
          nick: CARD.nick, label: CARD.label, sheet: "ПП", status: "Дом",
          phone: CARD.phone || "", subId: CARD.subId, deliveries: CARD.deliveries,
          statedCost: CARD.statedCost, factCost: CARD.factCost, scheme: "RAW26",
          coef: String(CARD.coef || "2.6"), wishes: CARD.wishes, basket: CARD.basket,
          packCounts: CARD.packCounts
        }]
      };
    }
    if (a === "getSubscription") {
      return Object.assign({ status: "success", found: true }, CARD, {
        sheet: "ПП", scheme: "RAW26", ppScheme: "RAW26", coef: String(CARD.coef || "2.6")
      });
    }
    if (a === "calcPrice") {
      window.__PP_DIAG__.calcCalls.push({ coef: params.coef, mode: MODE });
      if (MODE === "fail") return { status: "error", message: "auth_required" };
      var coef = Number(params.coef) || 2.6;
      var raw = 42.51;
      var n = Number(params.deliveriesN) || 1;
      var packs = 9.2;
      var recover = 3.3 * 5 + 0.8 * 16;
      var frac = 10;
      var fact = Math.round((raw * coef + recover + 7.6 * n + packs + frac) * 100) / 100;
      return {
        status: "success", mode: "pp", scheme: "RAW26", cost: raw, rawCost: raw, markup: coef,
        total: Math.round(raw * coef * 100) / 100, factCost: fact, deliveriesN: n,
        deliveryByn: 7.6 * n, packagesByn: packs,
        /* Пустые lines → recalcPpCostSum берёт rawCost=42.51 (как у владельца → 183.63 @3). */
        lines: []
      };
    }
    if (a === "getRetailPriceList") return { status: "success", items: [], delivery: { fee: 9, freeFrom: 80 } };
    return { status: "success" };
  };
}

async function runCase(browser, name, mode, statedCost) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
  });
  await context.addInitScript(hook, { card: baseCard, mode, statedCost });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:" + PORT + "/next.html?v=71125448&cutover=1", { waitUntil: "domcontentloaded" });
  await wait(800);
  await page.getByRole("button", { name: "Клиенты" }).click();
  await page.getByText(/indixvost|ДИАНА/i).first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /indixvost|ДИАНА/i }).first().click();
  await page.getByRole("button", { name: "Сохранить" }).waitFor({ timeout: 20000 });
  await page.waitForSelector("#cxStated", { timeout: 15000 });
  await page.locator("#cxCoef").scrollIntoViewIfNeeded();
  await wait(mode === "mock" ? 1800 : 700);

  async function snap(tag) {
    const data = await page.evaluate(() => ({
      stated: (document.getElementById("cxStated") || {}).value || null,
      fact: (document.getElementById("cxFact") || {}).value || null,
      coef: (document.getElementById("cxCoef") || {}).value || null,
      note: (document.getElementById("cxPriceCapNote") || {}).textContent || null
    }));
    await page.locator("#cxStated").scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(outDir, "pp-fix-" + name + "-" + tag + ".png"), fullPage: false });
    return data;
  }

  const before = await snap("before");
  await page.locator("#cxCoef").fill("3");
  await page.locator("#cxCoef").dispatchEvent("change");
  await wait(1800);
  const after3 = await snap("after-3");
  await page.locator('[data-act="cl-coef"][data-v="2.5"]').click();
  await wait(1200);
  const after25 = await snap("after-2.5");
  const diag = await page.evaluate(() => window.__PP_DIAG__ || null);
  await context.close();
  return { name, mode, statedCost, before, after3, after25, diag };
}

await ready();
const browser = await chromium.launch({ headless: true });
const cases = [];
try {
  cases.push(await runCase(browser, "zero-fail", "fail", "0"));
  cases.push(await runCase(browser, "zero-mock", "mock", "0"));
  cases.push(await runCase(browser, "166-fail", "fail", "166.63"));
  cases.push(await runCase(browser, "145-fail", "fail", "145"));
  cases.push(await runCase(browser, "166-mock", "mock", "166.63"));
} finally {
  await browser.close();
  try { server.kill("SIGTERM"); } catch (e) {}
}

const summary = cases.map((c) => ({
  name: c.name,
  before: c.before,
  after3: c.after3,
  after25: c.after25,
  moved: String(c.before.stated) !== String(c.after3.stated),
  recoverOnly: Number(c.after3.stated) > 40 && Number(c.after3.stated) < 70,
  approx183: Math.abs(Number(c.after3.stated) - 183.63) < 0.05,
  notIdentity145: Math.abs(Number(c.after3.stated) - 145) > 0.2
}));
fs.writeFileSync(path.join(outDir, "pp-coef-after-fix.json"), JSON.stringify({ summary, cases }, null, 2));
console.log(JSON.stringify(summary, null, 2));

let fail = false;
const zeroFail = summary.find((s) => s.name === "zero-fail");
const zeroMock = summary.find((s) => s.name === "zero-mock");
const s166 = summary.find((s) => s.name === "166-fail");
const s145 = summary.find((s) => s.name === "145-fail");
const s166m = summary.find((s) => s.name === "166-mock");
if (!zeroFail || zeroFail.recoverOnly) {
  console.error("FAIL zero-fail must not land on recover-only ~56");
  fail = true;
}
if (!zeroMock || !zeroMock.moved || zeroMock.recoverOnly || !(Number(zeroMock.after3.stated) > 150)) {
  console.error("FAIL zero-mock should move off 0 to real quote after quiet seed", zeroMock && zeroMock.after3);
  fail = true;
}
if (zeroMock && String(zeroMock.after3.stated) === String(zeroMock.after25.stated)) {
  console.error("FAIL zero-mock coef 3 vs 2.5 must differ", zeroMock);
  fail = true;
}
if (!s166 || !s166.approx183) {
  console.error("FAIL 166-fail should reach 183.63", s166 && s166.after3);
  fail = true;
}
if (!s145 || !s145.moved || !s145.notIdentity145) {
  console.error("FAIL 145-fail must leave 145 (no identity freeze)", s145 && s145.after3);
  fail = true;
}
if (!s166m || !s166m.approx183) {
  console.error("FAIL 166-mock should reach 183.63", s166m && s166m.after3);
  fail = true;
}
if (fail) process.exitCode = 2;
else console.error("AFTER-FIX OK");
