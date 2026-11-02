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
const PORT = 8771;
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
  cwd: root,
  stdio: "ignore"
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:" + PORT + "/next.html");
      if (res.ok) return;
    } catch (e) {}
    await wait(150);
  }
  throw new Error("server");
}

function hook(failCalc) {
  window.__PP_FAIL_CALC__ = !!failCalc;
  window.Telegram = {
    WebApp: {
      initData: "query_id=test&user=" + encodeURIComponent(JSON.stringify({ id: 4242, first_name: "Арсений" })),
      initDataUnsafe: { user: { id: 4242, first_name: "Арсений" } },
      ready() {},
      expand() {},
      openLink() {}
    }
  };
  var calcCalls = [];
  window.__PP_RECALC_PROBE__ = { calcCalls: calcCalls };
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    if (a === "getMyAccess") return { status: "success", role: "owner", name: "Арсений" };
    if (a === "getWeekDayCounts") {
      return {
        status: "success",
        items: [
          { day: "Понедельник", short: "Пн", count: 9, date: "28.09.2026" },
          { day: "Вторник", short: "Вт", count: 12, date: "29.09.2026" },
          { day: "Среда", short: "Ср", count: 7, date: "30.09.2026" },
          { day: "Четверг", short: "Чт", count: 3, date: "01.10.2026" },
          { day: "Пятница", short: "Пт", count: 5, date: "02.10.2026" },
          { day: "Суббота", short: "Сб", count: 1, date: "03.10.2026" },
          { day: "Воскресенье", short: "Вс", count: 0, date: "04.10.2026" }
        ]
      };
    }
    if (a === "listDeferred") return { status: "success", items: [] };
    if (a === "listBpIdle") return { status: "success", idle: [] };
    if (a === "getWeekBannerState") return { status: "success", finished: false, pulled: false };
    if (a === "getClients" || a === "getViewCompare") {
      var sample = {
        name: "zzz_test",
        segment: "ПП",
        address: "Тест 1",
        phone: "+375 29 000-00-00",
        note: "",
        deliverySlot: 1,
        deliveriesN: 2,
        orderPrice: 145,
        basket: [{ name: "ЛЁГКОЕ", val: 900, cat: "dressura", sub: "Ломтики" }]
      };
      if (a === "getClients") return { status: "success", clients: [sample] };
      return { status: "success", week: [sample], month: [sample], day: "Среда", dateIso: "30.09.2026" };
    }
    if (a === "unlockSubs") return { status: "success", unlocked: true };
    if (a === "listSubscriptions") {
      return {
        status: "success",
        subscriptions: [
          {
            nick: "zzz_test",
            label: "zzz_test",
            sheet: "ПП",
            status: "активна",
            phone: "+375 29 000-00-00",
            subId: "s-zzz",
            deliveries: 2,
            statedCost: "145",
            factCost: "145",
            scheme: "RAW26",
            coef: "2.6",
            wishes: "[COEF:2.6] [SCHEME:RAW26]",
            basket: [{ cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", val: 900 }]
          }
        ]
      };
    }
    if (a === "getSubscription") {
      return {
        status: "success",
        found: true,
        nick: "zzz_test",
        label: "zzz_test",
        sheet: "ПП",
        subId: "s-zzz",
        deliveries: 2,
        ppStatus: "активна",
        wishes: "[COEF:2.6] [SCHEME:RAW26]",
        address: "Тест 1",
        phone: "+375 29 000-00-00",
        dogName: "Тест",
        statedCost: "145",
        factCost: "145",
        calcFactCost: "145",
        scheme: "RAW26",
        ppScheme: "RAW26",
        coef: "2.6",
        basket: [{ cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", val: 900 }],
        basket2: [],
        packCounts: { u1: 2, u2: 1, u3: 0, up4: 0 }
      };
    }
    if (a === "listSurvey") return { status: "success", items: [] };
    if (a === "listAccess") {
      return { status: "success", people: [{ telegramId: "4242", name: "Арсений", role: "owner" }] };
    }
    if (a === "calcPrice") {
      calcCalls.push({
        coef: params.coef,
        deliveriesN: params.deliveriesN,
        packCounts: params.packCounts,
        fail: !!window.__PP_FAIL_CALC__
      });
      if (window.__PP_FAIL_CALC__) return { status: "error", message: "auth_required" };
      var coef = Number(params.coef) || 2.6;
      var raw = 48.5;
      return {
        status: "success",
        mode: "pp",
        scheme: "RAW26",
        cost: raw,
        rawCost: raw,
        markup: coef,
        total: Math.round(raw * coef * 100) / 100,
        lines: [{ name: "ЛЁГКОЕ", sub: "Ломтики", val: 900, unitPrice: 5.3889, per100: 5.3889 }],
        factCost: Math.round((raw * coef + 3.3 * 9 + 7.6 * 2) * 100) / 100,
        deliveriesN: Number(params.deliveriesN) || 2,
        deliveryByn: 7.6 * (Number(params.deliveriesN) || 2)
      };
    }
    if (a === "getRetailPriceList") return { status: "success", items: [], delivery: { fee: 9, freeFrom: 80 } };
    if (a === "saveSubscription" || a === "updateSubscription") {
      window.__PP_RECALC_PROBE__.saved = params;
      return { status: "success", saved: true };
    }
    return { status: "success" };
  };
}

async function openPpCard(page) {
  await page.getByRole("button", { name: "Клиенты" }).click();
  await page.getByText("zzz_test").first().waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /zzz_test/ }).first().click();
  await page.getByRole("button", { name: "Сохранить" }).waitFor({ timeout: 15000 });
  await page.waitForSelector("#cxStated", { timeout: 10000 });
  /* Coef на основной карточке — без «Глубокого редактора». */
  await page.waitForSelector('[data-act="cl-coef"]', { timeout: 10000 });
  const deepVisible = await page.getByRole("button", { name: "Глубокий редактор" }).count();
  if (!deepVisible) throw new Error("expected collapsed deep editor on main card");
}

async function runCase(name, failCalc) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(hook, failCalc);
  const page = await context.newPage();
  const logs = [];
  page.on("console", (msg) => logs.push(msg.type() + ": " + msg.text()));
  page.on("pageerror", (err) => logs.push("pageerror: " + String(err)));
  await page.goto("http://127.0.0.1:" + PORT + "/next.html?as=owner&tab=clients&seg=pp", {
    waitUntil: "domcontentloaded"
  });
  await wait(600);
  await openPpCard(page);

  const before = await page.locator("#cxStated").inputValue();
  await page.locator('[data-act="cl-coef"][data-v="2.3"]').click();
  /* Локальный quote должен обновить цену сразу (до ответа calcPrice). */
  await wait(80);
  const afterCoefQuick = await page.locator("#cxStated").inputValue();
  await wait(1400);
  const afterCoef = await page.locator("#cxStated").inputValue();
  const coefInput = await page.locator("#cxCoef").inputValue();
  const capNote = await page.locator("#cxPriceCapNote").innerText().catch(() => "");

  let afterPacks = afterCoef;
  if (await page.locator('input[data-k="cxUu1"]').count()) {
    await page.locator('input[data-k="cxUu1"]').fill("8");
    await page.locator('input[data-k="cxUu1"]').dispatchEvent("change");
    await wait(1400);
    afterPacks = await page.locator("#cxStated").inputValue();
  }

  const gramCount = await page.locator('[data-act="cl-gqty-in"]').count();
  let afterGrams = afterPacks;
  if (gramCount) {
    await page.locator('[data-act="cl-gqty-in"]').first().fill("1200");
    await page.locator('[data-act="cl-gqty-in"]').first().dispatchEvent("change");
    await wait(1400);
    afterGrams = await page.locator("#cxStated").inputValue();
  }

  await page.locator("#cxCoef").fill("3");
  await page.locator("#cxCoef").dispatchEvent("change");
  await wait(1400);
  const afterManual = await page.locator("#cxStated").inputValue();

  const probe = await page.evaluate(() => window.__PP_RECALC_PROBE__ || null);
  await page.screenshot({ path: path.join(outDir, "pp-recalc-" + name + ".png"), fullPage: true });
  await browser.close();

  return {
    name,
    failCalc: !!failCalc,
    before,
    afterCoefQuick,
    afterCoef,
    afterPacks,
    afterGrams,
    afterManual,
    coefInput,
    capNote,
    coefChangedQuick: before !== afterCoefQuick,
    coefChanged: before !== afterCoef,
    packsChanged: afterCoef !== afterPacks,
    gramsUi: gramCount > 0,
    gramsChanged: afterPacks !== afterGrams,
    manualChanged: afterPacks !== afterManual,
    calcCalls: (probe && probe.calcCalls) || [],
    logs: logs.filter((l) => /error|pp|price|recalc/i.test(l)).slice(0, 40)
  };
}

await ready();
const results = [];
try {
  results.push(await runCase("calc-ok", false));
  results.push(await runCase("calc-fail", true));
} finally {
  try {
    server.kill("SIGTERM");
  } catch (e) {}
}

const out = path.join(outDir, "pp-card-recalc-repro.json");
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
if (!results[0] || !results[0].coefChangedQuick) {
  console.error("FAIL: coef chip did not change stated immediately (local quote)");
  process.exitCode = 2;
}
if (!results[0] || !results[0].gramsUi) {
  console.error("FAIL: gram steppers missing on PP card");
  process.exitCode = 2;
}
