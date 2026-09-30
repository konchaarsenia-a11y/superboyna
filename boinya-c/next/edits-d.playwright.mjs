/** Снимки «после» партии D, 390×844. Снимки «до» уже лежат рядом. */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = "/workspace/boinya-c";
const shotDir = join(root, "next", "audit", "shots");
mkdirSync(shotDir, { recursive: true });
const port = 8931;
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
  window.Telegram = window.Telegram || {};
  var scheme = "dark";
  var tgOn = false;
  try {
    var qs = new URLSearchParams(location.search);
    scheme = qs.get("scheme") || "dark";
    tgOn = qs.get("tg") === "1";
  } catch (e) {}
  var wa = {
    initData: tgOn ? "query_id=test" : "",
    initDataUnsafe: { user: { id: 650923866, first_name: "Арс" } },
    colorScheme: scheme,
    platform: tgOn ? "ios" : "unknown",
    themeParams: {},
    viewportStableHeight: 844,
    ready() {},
    expand() {},
    disableVerticalSwipes() {},
    onEvent() {},
    HapticFeedback: { impactOccurred() {} },
    openLink() {}
  };
  Object.defineProperty(window.Telegram, "WebApp", {
    configurable: true,
    get: function () { return wa; },
    set: function (v) {
      if (!v || v === wa) return;
      if (!v.expand) v.expand = function () {};
      if (!v.ready) v.ready = function () {};
      if (!v.colorScheme) v.colorScheme = scheme;
      if (!v.initDataUnsafe || !v.initDataUnsafe.user) v.initDataUnsafe = { user: { id: 650923866, first_name: "Арс" } };
      if (tgOn) {
        v.initData = "query_id=test";
        v.platform = "ios";
      }
      wa = v;
    }
  });
  var days = [
    ["Понедельник", "2026-09-28", 3],
    ["Вторник", "2026-09-29", 5],
    ["Среда", "2026-09-30", 9],
    ["Четверг", "2026-10-01", 2],
    ["Пятница", "2026-10-02", 4],
    ["Суббота", "2026-10-03", 1],
    ["Воскресенье", "2026-10-04", 0]
  ];
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    var delay = 0;
    if (a === "listAccess") delay = 900;
    if (a === "listAccessFast") delay = 80;
    if (a === "listWarehouses") delay = 500;
    function pack(res) {
      if (!delay) return res;
      return new Promise(function (ok) { setTimeout(function () { ok(res); }, delay); });
    }
    var res = { status: "success" };
    if (a === "getMyAccess") {
      res = { status: "success", role: "owner", name: "Арс", telegramId: "650923866" };
    } else if (a === "unlockSubs") {
      res = { status: "success", unlocked: true };
    } else if (a === "getWeekDayCounts") {
      res = {
        status: "success",
        items: days.map(function (d) { return { day: d[0], date: d[1], count: d[2] }; })
      };
    } else if (a === "getMonthOverview") {
      res = {
        status: "success",
        days: [
          { dateIso: "2026-09-30", count: 9, segments: { "ПП": 5, "БП": 2, "Р": 1, "ПАРТНЁР": 1 } },
          { dateIso: "2026-10-01", count: 12, segments: { "ПП": 8, "БП": 4 } },
          { dateIso: "2026-09-28", count: 3, segments: { "ПП": 3 } }
        ]
      };
    } else if (a === "getWeekBannerState") {
      res = { status: "success", finished: false, pulled: true };
    } else if (a === "getCourier" || a === "getViewCompare" || a === "getClients") {
      var client = {
        name: "Рекс · Мира",
        segment: "ПП",
        address: "ул. Кальварийская, 21, п.2, эт.4, кв.18",
        phone: "+375291002001",
        orderPrice: 42,
        assembled: false,
        delivered: false,
        basket: [
          { name: "Лёгкое", val: 200, unit: "г" },
          { name: "Крошка микс", val: 150, unit: "г", cat: "crumb", sources: [{ name: "Рубец", unit: "г" }, { name: "Трахея", unit: "г" }] }
        ]
      };
      res = { status: "success", day: "Среда", date: "30.09.2026", dateIso: "2026-09-30", clients: [client], month: [client], week: [client] };
    } else if (a === "getAssembly") {
      res = { status: "success", clients: [{ name: "Рекс · Мира", assembled: false }] };
    } else if (a === "listAccess" || a === "listAccessFast") {
      res = {
        status: "success",
        fast: a === "listAccessFast",
        people: [
          { telegramId: "100", name: "Гость", role: "pending" },
          { telegramId: "200", name: "Мария", role: "manager" },
          { telegramId: "300", name: "Илья", role: "cutter" }
        ],
        timezones: ["Europe/Minsk"]
      };
    } else if (a === "listWarehouses") {
      var south = { id: "south", name: "Юг", address: "ул. Чижевских, 8", departure: true };
      res = { status: "success", warehouses: [south], departure: south };
    } else if (a === "getCutting") {
      res = {
        status: "success",
        day: "Среда",
        items: [
          { name: "Лёгкое", plan: 2000, dry: 2000, unit: "г", laid: true, done: false, row: "Лёгкое" },
          { name: "Уши", plan: 8, dry: 8, unit: "шт", laid: false, done: true, row: "Уши" }
        ]
      };
    } else if (a === "listDeferred" || a === "listPartners" || a === "partnerListAdmin" || a === "partnerListSuggestions") {
      res = { status: "success", items: [], networks: [], points: [], access: [], partners: [] };
    } else if (a === "warehousePreview" || a === "getRetailPriceList") {
      res = { status: "success", rows: [], items: [], delivery: { fee: 9, freeFrom: 80 } };
    } else {
      res = { status: "success", clients: [], items: [], rows: [], people: [] };
    }
    return pack(res);
  };
}

async function shot(page, name) {
  await page.screenshot({ path: join(shotDir, name) });
  console.log("shot", name);
}

async function boot(browser, query) {
  const light = query.indexOf("scheme=light") >= 0;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    colorScheme: light ? "light" : "dark"
  });
  await context.addInitScript(hookBody);
  const page = await context.newPage();
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) => route.abort());
  await page.goto("http://127.0.0.1:" + port + "/next.html?" + query, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#nxMain", { timeout: 10000 });
  await wait(400);
  return { context, page };
}

const fails = [];
function check(cond, msg) { if (!cond) fails.push(msg); }

async function main() {
  await ready();
  const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome" });
  const themes = [["dark", "a"], ["light", "b"]];
  const log = ["access-before-ms 1824"];
  const only = process.env.ONLY || "";

  if (only !== "phone") for (const pair of themes) {
    const b = await boot(browser, "as=owner&scheme=" + pair[0]);
    await b.page.locator(".daybox").waitFor();
    await b.page.locator(".daybox .num", { hasText: "30.09" }).waitFor();
    const box = (await b.page.locator(".daybox").innerText()).replace(/\s+/g, " ");
    check(/30\.09/.test(box) && /Среда/.test(box), "daybox " + pair[1] + " " + box);
    check(!/чел/.test(box), "daybox still has people count " + box);
    await shot(b.page, "edits-d-1-after-" + pair[1] + ".png");
    await b.context.close();
  }

  if (only !== "phone") {
    const b = await boot(browser, "as=owner&scheme=dark&tab=orders&seg=month");
    await b.page.locator(".cell").first().waitFor({ timeout: 8000 });
    await b.page.getByText("от 8 человек").waitFor();
    const sep = b.page.locator(".cell.is-full");
    const sepN = await sep.count();
    check(sepN >= 1, "september full cells " + sepN);
    const label30 = await b.page.locator('[data-date="2026-09-30"]').getAttribute("aria-label");
    check(/полный день/.test(label30 || ""), "30 not full " + label30);
    await shot(b.page, "edits-d-2-after-a.png");
    await b.page.getByRole("button", { name: "Следующий месяц" }).click();
    await b.page.getByRole("heading", { name: "октябрь 2026" }).waitFor();
    const label1 = await b.page.locator('[data-date="2026-10-01"]').getAttribute("aria-label");
    check(/полный день/.test(label1 || ""), "1 oct not full " + label1);
    await b.context.close();
  }

  if (only !== "phone") {
    const b = await boot(browser, "as=owner&scheme=dark&tab=production&seg=cut");
    await b.page.getByRole("checkbox", { name: "Выложено" }).first().waitFor({ timeout: 8000 });
    const cut = await b.page.locator("#nxMain").innerText();
    check(!/половину веса/.test(cut), "cut note still visible");
    check(/Выложено/.test(cut) && /Нарезано/.test(cut), "cut checks missing");
    await shot(b.page, "edits-d-3-after-a.png");
    await b.context.close();
  }

  if (only !== "phone") {
    const b = await boot(browser, "as=owner&scheme=dark");
    await b.page.getByRole("button", { name: "Ещё", exact: true }).click();
    await b.page.getByRole("button", { name: "Доступы" }).waitFor();
    const t0 = Date.now();
    await b.page.getByRole("button", { name: "Доступы" }).click();
    await b.page.getByText("Мария").waitFor({ timeout: 15000 });
    const cold = Date.now() - t0;
    log.push("access-after-cold-ms " + cold);
    console.log("access-after-cold-ms", cold);
    check(cold < 1400, "cold access still sequential " + cold);
    await shot(b.page, "edits-d-4-after-a.png");
    await b.page.getByRole("button", { name: /Ещё/ }).first().click();
    await b.page.getByRole("button", { name: "Доступы" }).waitFor();
    const t1 = Date.now();
    await b.page.getByRole("button", { name: "Доступы" }).click();
    await b.page.getByText("Мария").waitFor({ timeout: 5000 });
    const warm = Date.now() - t1;
    log.push("access-after-warm-ms " + warm);
    console.log("access-after-warm-ms", warm);
    check(warm < 400, "warm access not from cache " + warm);
    await b.context.close();
  }

  if (only !== "phone") for (const pair of themes) {
    const b = await boot(browser, "as=owner&scheme=" + pair[0] + "&tab=production&seg=route");
    await b.page.getByRole("button", { name: "Курьер", exact: true }).waitFor();
    const tel = b.page.locator("a.nx-tel");
    await tel.waitFor({ timeout: 8000 });
    const href = await tel.getAttribute("href");
    check(/^tel:\+375291002001$/.test(href || ""), "tel href " + href);
    await shot(b.page, "edits-d-5-after-" + pair[1] + ".png");
    await b.context.close();
  }

  {
    const b = await boot(browser, "as=owner&scheme=dark&tab=production&seg=route&tg=1");
    await b.page.locator("a.nx-tel").waitFor({ timeout: 8000 });
    await b.page.evaluate(() => {
      window.open = function () { return null; };
    });
    await b.page.locator("a.nx-tel").click();
    await b.page.getByText("Номер скопирован").waitFor({ timeout: 3000 });
    await shot(b.page, "edits-d-6-after-a.png");
    await b.context.close();
  }

  writeFileSync("/opt/cursor/artifacts/access-timing.txt", log.join("\n") + "\n");
  await browser.close();
  server.kill();
  if (fails.length) {
    console.error(fails.join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  server.kill();
  process.exit(1);
});
