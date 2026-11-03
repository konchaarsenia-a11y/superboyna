/**
 * Путь владельца: вход как у Telegram (index / app / next?cutover=1 БЕЗ ручного ?v=),
 * Клиенты → карточка indixvost (лёгое500/ухо2/корень6/трахея4/жила4, u3×8 up4×2),
 * уже [COEF:3]+указанная 145 → тап чипа 3 → цена должна уйти с 145 → ~183.63;
 * сохранить → закрыть → открыть снова → 183 на всех полях.
 * marker pp-card-price-recalc-h5
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
const PORT = 8776;
const baseCard = JSON.parse(fs.readFileSync(path.join(outDir, "indixvost-live.json"), "utf8"));

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
  cwd: root,
  stdio: "ignore"
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch("http://127.0.0.1:" + PORT + "/index.html")).ok) return;
    } catch (e) {}
    await wait(150);
  }
  throw new Error("server");
}

function hook(opts) {
  const store = {
    card: Object.assign({}, opts.card, {
      statedCost: opts.statedCost,
      factCost: opts.statedCost,
      calcFactCost: opts.statedCost,
      coef: opts.coef,
      wishes: opts.wishes,
      note: opts.wishes
    }),
    saves: []
  };
  window.__ENTRY_STORE__ = store;
  window.Telegram = {
    WebApp: {
      initData: "query_id=AA&user=" + encodeURIComponent(JSON.stringify({ id: 650923866, first_name: "Арсений" })),
      initDataUnsafe: { user: { id: 650923866, first_name: "Арсений" } },
      ready() {}, expand() {}, openLink() {}, version: "8.0",
      platform: "ios"
    }
  };
  window.__PP_DIAG__ = { calcCalls: [], opens: [], entry: opts.entry };
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    var CARD = store.card;
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
          nick: CARD.nick, label: CARD.label, sheet: "ПП", status: "Дом",
          phone: CARD.phone || "", subId: CARD.subId, deliveries: CARD.deliveries,
          statedCost: CARD.statedCost, factCost: CARD.factCost, scheme: "RAW26",
          coef: String(CARD.coef || "3"), wishes: CARD.wishes, basket: CARD.basket,
          packCounts: CARD.packCounts
        }]
      };
    }
    if (a === "getSubscription") {
      window.__PP_DIAG__.opens.push({ stated: CARD.statedCost, coef: CARD.coef, t: Date.now() });
      return Object.assign({ status: "success", found: true }, CARD, {
        sheet: "ПП", scheme: "RAW26", ppScheme: "RAW26", coef: String(CARD.coef || "3")
      });
    }
    if (a === "saveSubscription" || a === "saveOrder") {
      store.saves.push(Object.assign({}, params));
      if (params.statedCost != null) CARD.statedCost = params.statedCost;
      if (params.factCost != null) CARD.factCost = params.factCost;
      if (params.calcFactCost != null) CARD.calcFactCost = params.calcFactCost;
      if (params.wishes != null) {
        CARD.wishes = params.wishes;
        var m = String(params.wishes).match(/\[COEF:([0-9.]+)\]/i);
        if (m) CARD.coef = m[1];
      }
      return { status: "success", saved: true, nick: CARD.nick, subId: CARD.subId };
    }
    if (a === "calcPrice") {
      window.__PP_DIAG__.calcCalls.push({ coef: params.coef });
      if (opts.mode === "fail") return { status: "error", message: "auth_required" };
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

async function readPrices(page) {
  return page.evaluate(() => {
    var listPrice = null;
    var chips = Array.from(document.querySelectorAll(".b-chip--on")).map(function (n) { return n.textContent; });
    var stated = (document.getElementById("cxStated") || {}).value || null;
    var fact = (document.getElementById("cxFact") || {}).value || null;
    var coef = (document.getElementById("cxCoef") || {}).value || null;
    var note = (document.getElementById("cxPriceCapNote") || {}).textContent || null;
    var head = (document.querySelector(".nx-head b, .nx-title, h1") || {}).textContent || null;
    var bodyText = document.body ? document.body.innerText : "";
    var moneyHits = (bodyText.match(/\b1[45][0-9](?:[.,]\d+)?\b|\b183(?:[.,]\d+)?\b/g) || []).slice(0, 20);
    return { stated, fact, coef, note, chips, head, moneyHits, href: location.href };
  });
}

async function runEntry(browser, entryPath, mode) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
  });
  const wishes = "[COEF:3] [SCHEME:RAW26] [DOG:Лаки и Перси|без породы|27/16]";
  await context.addInitScript(hook, {
    card: baseCard,
    statedCost: "145",
    coef: "3",
    wishes,
    mode,
    entry: entryPath
  });
  const page = await context.newPage();
  /* НЕ добавляем ?v= вручную — как кнопка бота / Menu без cache-bust, либо index/app redirect. */
  await page.goto("http://127.0.0.1:" + PORT + entryPath, { waitUntil: "domcontentloaded", timeout: 30000 });
  await wait(1200);
  const hrefAfter = page.url();
  await page.getByRole("button", { name: "Клиенты" }).click({ timeout: 20000 });
  await page.getByText(/indixvost|ДИАНА/i).first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /indixvost|ДИАНА/i }).first().click();
  await page.getByRole("button", { name: "Сохранить" }).waitFor({ timeout: 20000 });
  await page.waitForSelector("#cxStated", { timeout: 15000 });
  await page.locator("#cxCoef").scrollIntoViewIfNeeded();
  await wait(mode === "mock" ? 2000 : 900);

  const before = await readPrices(page);
  await page.screenshot({ path: path.join(outDir, "pp-entry-" + mode + "-before.png"), fullPage: false });

  /* Тап чипа 3 при уже coef=3 — путь владельца «нихуя не поменялось». */
  const chip3 = page.locator('[data-act="cl-coef"][data-v="3"]');
  if (await chip3.count()) await chip3.click();
  else {
    await page.locator("#cxCoef").fill("3");
    await page.locator("#cxCoef").dispatchEvent("change");
  }
  await wait(2200);
  const afterTap = await readPrices(page);
  await page.screenshot({ path: path.join(outDir, "pp-entry-" + mode + "-after-tap3.png"), fullPage: false });

  await page.getByRole("button", { name: "Сохранить" }).click();
  await wait(1500);
  await page.getByRole("button", { name: /Назад|Клиенты|←/i }).first().click().catch(async () => {
    await page.locator('[data-act="cl-back"]').click();
  });
  await wait(800);
  await page.getByRole("button", { name: /indixvost|ДИАНА/i }).first().click();
  await page.waitForSelector("#cxStated", { timeout: 15000 });
  await page.locator("#cxCoef").scrollIntoViewIfNeeded();
  await wait(1500);
  const afterReopen = await readPrices(page);
  await page.locator("#cxStated").scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: path.join(outDir, "pp-entry-" + mode + "-reopen.png"), fullPage: false });

  /* Список: цена в строке */
  await page.locator('[data-act="cl-back"]').click().catch(() => {});
  await wait(600);
  const listSnap = await page.evaluate(() => {
    var t = document.body ? document.body.innerText : "";
    return { has183: /183/.test(t), has145: /\b145\b/.test(t), href: location.href };
  });
  await page.screenshot({ path: path.join(outDir, "pp-entry-" + mode + "-list.png"), fullPage: false });

  const diag = await page.evaluate(() => ({
    diag: window.__PP_DIAG__,
    store: window.__ENTRY_STORE__ ? {
      stated: window.__ENTRY_STORE__.card.statedCost,
      coef: window.__ENTRY_STORE__.card.coef,
      wishes: window.__ENTRY_STORE__.card.wishes,
      saves: (window.__ENTRY_STORE__.saves || []).length
    } : null
  }));
  await context.close();
  return { entryPath, hrefAfter, mode, before, afterTap, afterReopen, listSnap, diag };
}

await ready();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  /* Три входа как у Telegram: корень, app.html (BotFather), next без ?v= (кнопка бота до bump). */
  results.push(await runEntry(browser, "/index.html", "mock"));
  results.push(await runEntry(browser, "/app.html", "mock"));
  results.push(await runEntry(browser, "/next.html?cutover=1", "mock"));
} finally {
  await browser.close();
  try { server.kill("SIGTERM"); } catch (e) {}
}

/* fail mode: quiet live тоже fail — цена может остаться 145; отдельный кейс не валим ship. */
const shipCases = results.filter((r) => r.mode === "mock");
const summary = shipCases.map((r) => ({
  entry: r.entryPath,
  hrefAfter: r.hrefAfter,
  before: r.before,
  afterTap: r.afterTap,
  afterReopen: r.afterReopen,
  listSnap: r.listSnap,
  left145: Math.abs(Number(r.afterTap.stated) - 145) > 0.2,
  approx183: Math.abs(Number(r.afterTap.stated) - 183.63) < 0.05,
  reopen183: Math.abs(Number(r.afterReopen.stated) - 183.63) < 0.05,
  saves: r.diag && r.diag.store && r.diag.store.saves
}));
fs.writeFileSync(path.join(outDir, "pp-coef-entry-path.json"), JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));

let fail = false;
for (const s of summary) {
  if (!s.left145 || !s.approx183) {
    console.error("FAIL entry tap3 must leave 145 → ~183", s.entry, s.afterTap);
    fail = true;
  }
  if (!s.reopen183) {
    console.error("FAIL reopen must show ~183", s.entry, s.afterReopen);
    fail = true;
  }
}
if (fail) process.exitCode = 2;
else console.error("ENTRY-PATH OK", summary.length, "entries");
