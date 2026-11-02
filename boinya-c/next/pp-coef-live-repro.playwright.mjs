/**
 * Живое воспроизведение: next.html?v=71125443 + карточка indixvost.
 * A) mock calcPrice  B) pass-thru worker (auth fail)  C/D) stated>0 + pass-thru (local seed)
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");

const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
const LIVE = "https://konchaarsenia-a11y.github.io/superboyna/boinya-c/next.html?v=71125443&cutover=1";
const baseCard = JSON.parse(fs.readFileSync(path.join(outDir, "indixvost-live.json"), "utf8"));

function hook() {
  const CARD = window.__LIVE_CARD__;
  const MODE = window.__REPRO_MODE__;
  window.Telegram = {
    WebApp: {
      initData: "query_id=AA&user=" + encodeURIComponent(JSON.stringify({ id: 4242, first_name: "Арсений" })),
      initDataUnsafe: { user: { id: 4242, first_name: "Арсений" } },
      ready() {}, expand() {}, openLink() {}, version: "8.0"
    }
  };
  window.__BOINYA_C_CUTOVER__ = "1";
  window.__PP_DIAG__ = { calcCalls: [], calcResults: [], api: [], passThru: 0 };
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    window.__PP_DIAG__.api.push(a);
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
          nick: CARD.nick, label: CARD.label, sheet: "ПП", status: CARD.status || "Дом",
          phone: CARD.phone || "", subId: CARD.subId, deliveries: CARD.deliveries,
          statedCost: CARD.statedCost, factCost: CARD.factCost, scheme: "RAW26", coef: String(CARD.coef || "2.6"),
          wishes: CARD.wishes, basket: CARD.basket, packCounts: CARD.packCounts
        }]
      };
    }
    if (a === "getSubscription") {
      return Object.assign({ status: "success", found: true }, CARD, {
        sheet: "ПП", scheme: "RAW26", ppScheme: "RAW26",
        coef: String(CARD.coef || "2.6"),
        statedCost: CARD.statedCost, factCost: CARD.factCost,
        calcFactCost: CARD.calcFactCost || CARD.factCost || CARD.statedCost
      });
    }
    if (a === "calcPrice") {
      window.__PP_DIAG__.calcCalls.push({ coef: params.coef, deliveriesN: params.deliveriesN, mode: MODE });
      if (MODE === "mock-calc") {
        var coef = Number(params.coef) || 2.6;
        var raw = 42.51;
        var n = Number(params.deliveriesN) || 1;
        var packs = 9.2;
        var recover = 3.3 * 5 + 0.8 * 16;
        var fact = Math.round((raw * coef + recover + 7.6 * n + packs) * 100) / 100;
        var out = {
          status: "success", mode: "pp", scheme: "RAW26", cost: raw, rawCost: raw, markup: coef,
          total: Math.round(raw * coef * 100) / 100,
          factCost: fact, deliveriesN: n, deliveryByn: 7.6 * n, packagesByn: packs,
          lines: [
            { name: "ЛЁГКОЕ", sub: "Среднее", val: 500, unitPrice: 2.25, per100: 2.25 },
            { name: "УХО Г", sub: "Обычное", val: 2, unitPrice: 2.5, piece: true },
            { name: "БЫЧИЙ КОРЕНЬ", sub: "БОЛ", val: 6, unitPrice: 2.2, piece: true },
            { name: "ТРАХЕЯ", sub: "СРЕД", val: 4, unitPrice: 1.8, piece: true },
            { name: "СТАНОВАЯ ЖИЛА", sub: "БОЛ", val: 4, unitPrice: 1.9, piece: true }
          ]
        };
        window.__PP_DIAG__.calcResults.push({ ok: true, fact: fact, cost: raw });
        return out;
      }
      window.__PP_DIAG__.passThru++;
      return undefined;
    }
    if (a === "getRetailPriceList") return { status: "success", items: [], delivery: { fee: 9, freeFrom: 80 } };
    if (a === "listSurvey") return { status: "success", items: [] };
    if (a === "saveSubscription" || a === "updateSubscription") {
      window.__PP_DIAG__.saved = params;
      return { status: "success", saved: true };
    }
    return { status: "success" };
  };
}

async function runCase(browser, name, card, mode) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
  });
  await context.addInitScript((c) => { window.__LIVE_CARD__ = c; }, card);
  await context.addInitScript((m) => { window.__REPRO_MODE__ = m; }, mode);
  await context.addInitScript(hook);
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(m.type() + ": " + m.text()));
  page.on("pageerror", (e) => logs.push("pageerror: " + String(e)));

  const net = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (/clients\.js|price-logic\.js|workers\.dev|next\.html/.test(u)) {
      let bodyHint = "";
      try {
        if (/workers\.dev/.test(u)) bodyHint = (await res.text()).slice(0, 200);
      } catch (e) {}
      net.push({ url: u.slice(0, 140), status: res.status(), ver: (u.match(/[?&]v=([^&]+)/) || [])[1] || "", bodyHint });
    }
  });

  await page.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);

  const swInfo = await page.evaluate(async () => {
    const regs = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistrations() : [];
    return {
      sw: regs.map((r) => ({ scope: r.scope, scriptURL: r.active && r.active.scriptURL })),
      scripts: [...document.scripts].map((s) => s.src).filter((s) => /clients|price-logic|config/.test(s)),
      loc: location.href
    };
  });

  await page.getByRole("button", { name: "Клиенты" }).click();
  await page.getByText(/indixvost|ДИАНА/i).first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /indixvost|ДИАНА/i }).first().click();
  await page.getByRole("button", { name: "Сохранить" }).waitFor({ timeout: 20000 });
  await page.waitForSelector("#cxStated", { timeout: 15000 });
  await page.waitForSelector("#cxCoef", { timeout: 10000 });
  await page.locator("#cxCoef").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  async function snap(tag) {
    const data = await page.evaluate(() => {
      const st = document.getElementById("cxStated");
      const fact = document.getElementById("cxFact");
      const coef = document.getElementById("cxCoef");
      const note = document.getElementById("cxPriceCapNote");
      return {
        stated: st ? st.value : null,
        fact: fact ? fact.value : null,
        coef: coef ? coef.value : null,
        note: note ? note.textContent : null,
        hasCoefChips: !!document.querySelector('[data-act="cl-coef"]')
      };
    });
    await page.locator("#cxStated").scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(outDir, "pp-coef-" + name + "-" + tag + ".png"), fullPage: false });
    return data;
  }

  const before = await snap("before");

  const chip26 = page.locator('[data-act="cl-coef"][data-v="2.6"]');
  if (await chip26.count()) {
    await chip26.click();
    await page.waitForTimeout(1200);
  }
  const at26 = await snap("chip-2.6");

  await page.locator("#cxCoef").fill("3");
  await page.locator("#cxCoef").dispatchEvent("input");
  await page.waitForTimeout(300);
  const afterSoft = await snap("soft-3");
  await page.locator("#cxCoef").dispatchEvent("change");
  await page.waitForTimeout(2500);
  const afterChange = await snap("change-3");

  const chip25 = page.locator('[data-act="cl-coef"][data-v="2.5"]');
  if (await chip25.count()) {
    await chip25.click();
    await page.waitForTimeout(1200);
  }
  const at25 = await snap("chip-2.5");
  await page.locator("#cxCoef").fill("3");
  await page.locator("#cxCoef").dispatchEvent("change");
  await page.waitForTimeout(2500);
  const afterFinal = await snap("final-3");

  const diag = await page.evaluate(() => window.__PP_DIAG__ || null);
  await context.close();
  return {
    name, mode, liveUrl: LIVE,
    card: { nick: card.nick, statedCost: card.statedCost, factCost: card.factCost, coef: card.coef },
    swInfo, net: net.slice(0, 40),
    before, at26, afterSoft, afterChange, at25, afterFinal, diag,
    logs: logs.filter((l) => /error|auth|calc|pp|coef/i.test(l)).slice(0, 40)
  };
}

const browser = await chromium.launch({ headless: true });
const cases = [];
cases.push(await runCase(browser, "A-zero-mock", Object.assign({}, baseCard), "mock-calc"));
cases.push(await runCase(browser, "B-zero-passthru", Object.assign({}, baseCard), "pass-calc"));
cases.push(await runCase(browser, "C-145-passthru", Object.assign({}, baseCard, { statedCost: "145", factCost: "145" }), "pass-calc"));
cases.push(await runCase(browser, "D-166-passthru", Object.assign({}, baseCard, { statedCost: "166.63", factCost: "166.63" }), "pass-calc"));
await browser.close();

const summary = {
  liveUrl: LIVE,
  expected: { at26: 166.63, at3: 183.63 },
  cases: cases.map((c) => ({
    name: c.name,
    mode: c.mode,
    before: c.before,
    at26: c.at26,
    afterChange: c.afterChange,
    at25: c.at25,
    afterFinal: c.afterFinal,
    calcCalls: (c.diag && c.diag.calcCalls) || [],
    calcResults: (c.diag && c.diag.calcResults) || [],
    passThru: c.diag && c.diag.passThru,
    authBodies: (c.net || []).filter((n) => /auth_required|calcPrice|workers/.test(JSON.stringify(n))).slice(0, 6),
    scripts: c.swInfo && c.swInfo.scripts,
    changed: String(c.before.stated) !== String(c.afterFinal.stated) || String(c.before.fact) !== String(c.afterFinal.fact)
  }))
};
fs.writeFileSync(path.join(outDir, "pp-coef-live-repro.json"), JSON.stringify({ summary, cases }, null, 2));
console.log(JSON.stringify(summary, null, 2));
const stuck = summary.cases.filter((c) => !c.changed);
if (stuck.length) {
  console.error("REPRO CONFIRMED stuck:", stuck.map((s) => s.name).join(", "));
  process.exitCode = 2;
} else {
  console.error("All cases moved — check magnitudes vs expected");
}
