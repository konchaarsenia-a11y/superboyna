/**
 * Партия 3: статистика сентября и «Добавить позицию».
 * Снимки: next/audit/shots/ev3-*.png
 * Запуск: node boinya-c/next/ev3.playwright.mjs
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const shotDir = join(dirname(fileURLToPath(import.meta.url)), "audit", "shots");
mkdirSync(shotDir, { recursive: true });
const port = 8823;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  cwd: root,
  stdio: "ignore"
});

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:" + port + "/next.html");
      if (res.ok) return;
    } catch (e) {}
    await wait(150);
  }
  throw new Error("server");
}

function hookBody() {
  window.__nxCalls = [];
  window.__nxPositions = [];
  try { sessionStorage.setItem("nx_light_asked_v1", "1"); } catch (e) {}
  window.Telegram = window.Telegram || {};
  var wa = {
    initData: "hook",
    initDataUnsafe: { user: { id: 650923866, first_name: "Арс" } },
    colorScheme: "dark",
    themeParams: {},
    viewportStableHeight: 844,
    ready() {},
    expand() {},
    disableVerticalSwipes() {},
    onEvent() {},
    HapticFeedback: { impactOccurred() {} }
  };
  Object.defineProperty(window.Telegram, "WebApp", {
    configurable: true,
    get: function () { return wa; },
    set: function (v) {
      if (!v || v === wa) return;
      if (!v.expand) v.expand = function () {};
      if (!v.ready) v.ready = function () {};
      if (!v.initData) v.initData = "hook";
      if (!v.initDataUnsafe || !v.initDataUnsafe.user) v.initDataUnsafe = { user: { id: 650923866, first_name: "Арс" } };
      wa = v;
    }
  });
  function formula(rev, pp, rt, n, missB, missP) {
    return {
      ok: true,
      revenue: rev,
      S: 80, G: 2400, P: 12, N: n,
      ppRevenue: pp,
      retailRevenue: rt,
      missingBasket: missB || 0,
      missingPrice: missP || 0,
      pending: { revenue: 90, N: 1 },
      wageNote: "Вся сумма за период у выбранного нарезчика-сборщика."
    };
  }
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    window.__nxCalls.push(a);
    if (a === "getMyAccess") {
      return { status: "success", role: "owner", name: "Арс", telegramId: "650923866" };
    }
    if (a === "getStats" || a === "getExpectedProfit") {
      var month = String((params && params.month) || "");
      var from = String((params && (params.dateFrom || params.fromDate)) || "");
      var sept = month === "2026-09" || from.indexOf("2026-09") === 0;
      var aug = from.indexOf("2026-08") === 0;
      var roll = sept ? formula(4200, 3100, 1100, 48, 2, 1)
        : aug ? formula(3800, 2900, 900, 44, 0, 0)
        : formula(900, 700, 200, 8, 0, 0);
      return {
        status: "success",
        monthKey: month || (from ? from.slice(0, 7) : ""),
        monthLabel: sept ? "сентябрь 2026" : "",
        factCutoff: "2026-10-02",
        formula: roll
      };
    }
    if (a === "getStatsMonthSetup") {
      return { status: "success", cutter: { name: "Илья" }, courier: { name: "Мария" } };
    }
    if (a === "listOwnerExpenses") return { status: "success", expenses: [], amort: [] };
    if (a === "getRetailPriceList") {
      return { status: "success", items: [{ key: "ЛЁГКОЕ", kind: "per100", price: 12 }], delivery: { fee: 9, freeFrom: 80 } };
    }
    if (a === "listPricePositions") {
      return { status: "success", positions: window.__nxPositions.slice() };
    }
    if (a === "addPricePosition") {
      var pos = {
        name: params.name,
        cat: params.cat,
        fractions: params.fractions || [],
        price: params.price,
        unit: params.unit
      };
      window.__nxPositions.push(pos);
      return { status: "success", position: pos, d1Verified: true };
    }
    return { status: "success", clients: [], items: [], rows: [], people: [], partners: [], subscriptions: [], days: [] };
  };
}

const fails = [];
function check(cond, msg) { if (!cond) fails.push(msg); }

async function shot(page, name) {
  const file = join(shotDir, name);
  await page.screenshot({ path: file });
  console.log("shot", name);
}

async function boot(browser, query, viewport) {
  const context = await browser.newContext({
    viewport: viewport || { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "dark"
  });
  await context.addInitScript(hookBody);
  const page = await context.newPage();
  page.on("pageerror", (err) => fails.push("pageerror " + err.message));
  await page.goto("http://127.0.0.1:" + port + "/next.html?" + query, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#nxMain", { timeout: 10000 });
  await wait(400);
  return { context, page };
}

async function openSeptember(page) {
  await page.getByText("Статистика").first().waitFor({ timeout: 8000 });
  for (let i = 0; i < 8; i++) {
    const label = await page.locator("#statsMonthLabel").innerText();
    if (/сент/i.test(label)) return label;
    await page.getByRole("button", { name: "Предыдущий месяц" }).click();
    await wait(250);
  }
  return await page.locator("#statsMonthLabel").innerText();
}

async function main() {
  await ready();
  const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome" });

  {
    const b = await boot(browser, "as=owner&view=stats");
    const label = await openSeptember(b.page);
    await b.page.getByText("Сравнение с 01.08–31.08").waitFor({ timeout: 8000 });
    await b.page.getByText("Оборот").first().waitFor({ timeout: 4000 });
    const text = await b.page.locator("#statsContainer").innerText();
    check(label.indexOf("сент") >= 0, "month label " + label);
    check(text.indexOf("Сравнение с 01.08–31.08") >= 0, "compare caption missing: " + text.slice(0, 240));
    check(text.indexOf("к 02.08") < 0, "old equal-length caption still shown");
    check(text.indexOf("Проценты справа") >= 0, "percent note missing");
    check(text.indexOf("отвёз") >= 0, "delivered note missing");
    check(text.indexOf("Без состава") >= 0, "missing basket line");
    check(text.indexOf("%") >= 0, "no percent delta");
    check(text.indexOf("·") < 0, "middle dot in stats");
    await shot(b.page, "ev3-stats-sep.png");
    await b.context.close();
  }

  {
    const b = await boot(browser, "as=owner&view=stats", { width: 360, height: 740 });
    await openSeptember(b.page);
    await b.page.getByText("Сравнение с 01.08–31.08").waitFor({ timeout: 8000 });
    await shot(b.page, "ev3-stats-sep-360.png");
    await b.context.close();
  }

  {
    const b = await boot(browser, "as=owner&view=price");
    await b.page.getByRole("button", { name: "Добавить позицию" }).waitFor({ timeout: 8000 });
    await b.page.getByText("Добавленные позиции").waitFor({ timeout: 8000 });
    await shot(b.page, "ev3-price.png");
    await b.page.getByRole("button", { name: "Добавить позицию" }).click();
    await b.page.locator("#rpNewName").waitFor({ timeout: 4000 });
    await b.page.locator("#rpNewName").fill("Уши");
    await b.page.locator(".nx-sheet").getByRole("button", { name: "Жевалки" }).click();
    await b.page.locator("#rpNewPrice").fill("3");
    await b.page.locator(".nx-sheet").getByRole("button", { name: "шт", exact: true }).click();
    await wait(200);
    const sheet = await b.page.locator(".nx-sheet").innerText();
    check(sheet.indexOf("·") < 0, "middle dot in add sheet");
    await shot(b.page, "ev3-price-add.png");
    await b.page.locator(".nx-sheet").getByRole("button", { name: "Добавить", exact: true }).click();
    await b.page.getByText("УШИ").waitFor({ timeout: 4000 });
    await shot(b.page, "ev3-price-added.png");
    await b.page.locator("#nxNav").getByRole("button", { name: "Заказы" }).click();
    await b.page.getByRole("button", { name: "+ Позиция" }).waitFor({ timeout: 8000 });
    await b.page.getByRole("button", { name: "+ Позиция" }).click();
    await b.page.locator("#pq").waitFor({ timeout: 4000 });
    await b.page.locator(".nx-sheet").getByRole("button", { name: "Жевалки" }).click();
    await b.page.locator("#pq").fill("УШИ");
    await b.page.locator(".nx-sheet").getByRole("button", { name: /уши/i }).waitFor({ timeout: 4000 });
    const picker = await b.page.locator(".nx-sheet").innerText();
    check(/уши/i.test(picker), "picker missing extra position");
    await shot(b.page, "ev3-picker.png");
    await b.context.close();
  }

  {
    const b = await boot(browser, "as=owner&view=price", { width: 360, height: 740 });
    await b.page.getByRole("button", { name: "Добавить позицию" }).click();
    await b.page.locator("#rpNewName").waitFor({ timeout: 4000 });
    await b.page.locator("#rpNewName").fill("Утка");
    await b.page.locator(".nx-sheet").getByRole("button", { name: "Другое" }).click();
    await b.page.locator("#rpNewFractions").fill("Среднее, Мелкое");
    await b.page.locator("#rpNewPrice").fill("14");
    await shot(b.page, "ev3-price-add-360.png");
    await b.context.close();
  }

  await browser.close();
  server.kill();
  if (fails.length) {
    console.error(fails.join("\n"));
    process.exit(1);
  }
  console.log("ev3 ok");
}

main().catch((err) => {
  console.error(err);
  try { server.kill(); } catch (e) {}
  process.exit(1);
});
