/**
 * Стенд партии A: скриншоты до/после и проверки пунктов 1–5, 8–11, 13–15, 17.
 * PHASE=before | after (по умолчанию after). Снимки: next/audit/shots/
 * Запуск из репозитория: node boinya-c/next/edits-a.playwright.mjs
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const phase = process.env.PHASE === "before" ? "before" : "after";
const root = new URL("..", import.meta.url).pathname;
const shotDir = join(dirname(fileURLToPath(import.meta.url)), "audit", "shots");
mkdirSync(shotDir, { recursive: true });
const port = 8817;
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
  window.__nxSwipes = 0;
  window.__nxSaved = [];
  window.Telegram = window.Telegram || {};
  var scheme = "dark";
  try { scheme = new URLSearchParams(location.search).get("scheme") || "dark"; } catch (e) {}
  var wa = {
    initData: "",
    initDataUnsafe: { user: { id: 650923866, first_name: "Арс" } },
    colorScheme: scheme,
    themeParams: {},
    viewportStableHeight: 844,
    ready() {},
    expand() {},
    disableVerticalSwipes() { window.__nxSwipes = (window.__nxSwipes || 0) + 1; },
    onEvent(name, fn) { window.__nxTgEvents = window.__nxTgEvents || {}; window.__nxTgEvents[name] = fn; },
    HapticFeedback: { impactOccurred() {} }
  };
  Object.defineProperty(window.Telegram, "WebApp", {
    configurable: true,
    get: function () { return wa; },
    set: function (v) {
      if (!v || v === wa) return;
      var orig = v.disableVerticalSwipes;
      v.disableVerticalSwipes = function () {
        window.__nxSwipes = (window.__nxSwipes || 0) + 1;
        if (typeof orig === "function") { try { orig.apply(v, arguments); } catch (e2) {} }
      };
      if (!v.expand) v.expand = function () {};
      if (!v.ready) v.ready = function () {};
      if (!v.viewportStableHeight) v.viewportStableHeight = 844;
      if (!v.initDataUnsafe || !v.initDataUnsafe.user) v.initDataUnsafe = { user: { id: 650923866, first_name: "Арс" } };
      var prevOn = v.onEvent;
      v.onEvent = function (name, fn) {
        window.__nxTgEvents = window.__nxTgEvents || {};
        window.__nxTgEvents[name] = fn;
        if (typeof prevOn === "function") { try { prevOn.call(v, name, fn); } catch (e3) {} }
      };
      wa = v;
    }
  });
  function later(ms, val) { return new Promise(function (r) { setTimeout(function () { r(val); }, ms); }); }
  function q() { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); } }
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    window.__nxCalls.push(a + (params && params.force ? ":force" : ""));
    var slow = q().get("slow") || "";
    var delay = 0;
    if (slow === "month" && a === "getViewCompare") delay = 4000;
    if (slow === "month" && a === "getMonthOverview") delay = 1000;
    if (slow === "clients" && a === "listSubscriptions") delay = Number(q().get("subMs") || 3000);
    if (slow === "clients" && a === "listAccess") delay = 8000;
    if (slow === "clients" && a === "listSubscriptions" && q().get("subFail") === "1" && !(window.__nxSubTries > 0)) {
      window.__nxSubTries = 1;
      return later(50, { status: "error", message: "timeout" });
    }
    var as = q().get("as") || "owner";
    var res = { status: "success" };
    if (a === "getMyAccess") {
      res = { status: "success", role: as === "manager" ? "manager" : "owner", name: "Арс", telegramId: "650923866" };
    } else if (a === "unlockSubs") {
      res = { status: "success", unlocked: true };
    } else if (a === "getWeekDayCounts") {
      res = { status: "success", items: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье", "Будущая неделя"].map(function (day, i) {
        return { day: day, count: i === 1 ? 4 : 2, date: "29.09.2026" };
      }) };
    } else if (a === "getMonthOverview") {
      var month = String((params && params.month) || "2026-09");
      var days = [];
      if (month === "2026-09") days.push({ dateIso: "2026-09-30", count: 4, segments: { "ПП": 2, "БП": 1, "Р": 1 } });
      if (month === "2026-10") days.push({ dateIso: "2026-10-29", count: 3, segments: { "ПП": 3 } });
      res = { status: "success", days: days };
    } else if (a === "getViewCompare") {
      res = {
        status: "success",
        day: "Вторник",
        dateIso: (params && params.date) || "2026-09-30",
        month: [{ name: "Мира", segment: "ПП", address: "ул Тестовая 1", phone: "", orderPrice: 40, basket: [{ name: "Лёгкое", val: 200, unit: "г" }] }],
        week: []
      };
    } else if (a === "getWeekBannerState") {
      res = { status: "success", finished: false, pulled: true };
    } else if (a === "getClients" || a === "getCourier") {
      res = { status: "success", day: "Вторник", date: "29.09.2026", clients: [{ name: "Мира", segment: "ПП", address: "ул Тестовая 1", assembled: false, delivered: false, basket: [{ name: "Лёгкое", val: 200, unit: "г" }] }] };
    } else if (a === "getAssembly") {
      var dog = function (name, part, mk) {
        return {
          name: name,
          matchKey: mk,
          ownerName: mk === "ANNA" ? "Анна" : "Борис",
          dogPart: part,
          address: mk === "ANNA" ? "ул Тестовая 1" : "ул Тестовая 2",
          assembled: false,
          printed: false,
          basket: [{ name: "ПОЧКИ", main: "ПОЧКИ", cat: "dressura", val: 100, value: 100, unit: "г" }]
        };
      };
      var heavy = {
        name: "Вера",
        matchKey: "VERA",
        ownerName: "Вера",
        address: "ул Тестовая 3",
        assembled: false,
        printed: false,
        basket: [{ name: "ПОЧКИ", main: "ПОЧКИ", cat: "dressura", val: 1200, value: 1200, unit: "г" }]
      };
      var crumbClient = {
        name: "Мира",
        matchKey: "MIRA",
        ownerName: "Мира",
        address: "ул Тестовая 1",
        assembled: false,
        printed: false,
        basket: [{
          cat: "crumb", main: "КРОШКА", name: "КРОШКА", value: 70, val: 70, unit: "г", ratio: [20, 50],
          sources: [
            { name: "ПОЧКИ", main: "ПОЧКИ", cat: "dressura", val: 20 },
            { name: "РУБЕЦ Т", main: "РУБЕЦ Т", cat: "dressura", val: 50 }
          ]
        }]
      };
      var clients = q().get("asm") === "heavy"
        ? [heavy]
        : (q().get("asm") === "crumb"
          ? [crumbClient]
          : [dog("Анна", 1, "ANNA"), dog("Анна · 2", 2, "ANNA"), dog("Борис", 1, "BORIS"), dog("Борис · 2", 2, "BORIS")]);
      res = { status: "success", day: "Вторник", dateIso: "2026-09-29", clients: clients };
    } else if (a === "getCutting") {
      var rows = [];
      for (var i = 1; i <= 8; i++) rows.push({ name: "Позиция " + i, plan: 100, dry: 100, raw: 0.5, unit: "гр", row: i, cut: 0, done: false, laid: false });
      res = { status: "success", day: "Вторник", rows: rows, items: rows };
    } else if (a === "listAccess") {
      res = { status: "success", people: [
        { telegramId: "100", name: "Новый", role: "pending" },
        { telegramId: "200", name: "Мария", role: "manager" },
        { telegramId: "300", name: "Илья", role: "cutter" }
      ] };
    } else if (a === "listSubscriptions") {
      res = { status: "success", subscriptions: [
        { nick: "mira_test", label: "Рекс", sheet: "ПП", subId: "s1", phone: "", status: "активна" },
        { nick: "luna_test", label: "Луна", sheet: "ПП", subId: "s2", phone: "", status: "" }
      ] };
    } else if (a === "getSubscription") {
      res = { status: "success", nick: "mira_test", label: "Рекс", sheet: "ПП", subId: "s1", phone: "", address: "ул Тестовая 1", ppStatus: "активна", basket: [] };
    } else if (a === "saveSubscription") {
      res = { status: "success" };
    } else if (a === "saveBooking" || a === "saveOrder") {
      window.__nxSaved.push(params);
      res = { status: "success", sheetsVerified: true };
    } else if (a === "saveDeferred") {
      res = { status: "success", id: "d-test", sent: true };
    } else if (a === "listDeferred") {
      res = { status: "success", items: [] };
    } else if (a === "getRetailPriceList") {
      res = { status: "success", items: [{ name: "Лёгкое", price: 12 }], delivery: { fee: 9, freeFrom: 80 } };
    } else if (a === "getStats" || a === "getExpectedProfit") {
      res = { status: "success", month: "2026-09", turnover: 10, clean: 4, spend: 6, deliveries: 2, by: { pp: 1, bp: 0, retail: 1, partner: 0 } };
    } else if (a === "listPartners") {
      res = { status: "success", partners: [{ name: "Лапа", active: true }] };
    } else if (a === "warehousePreview") {
      res = { status: "success", rows: [] };
    } else if (a === "suggestAddress") {
      res = { status: "success", results: [] };
    } else {
      res = { status: "success", clients: [], items: [], rows: [], people: [], partners: [], subscriptions: [] };
    }
    return delay ? later(delay, res) : res;
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
    deviceScaleFactor: 1,
    colorScheme: query.indexOf("scheme=light") >= 0 ? "light" : "dark"
  });
  await context.addInitScript(hookBody);
  const page = await context.newPage();
  page.on("pageerror", (err) => fails.push("pageerror " + err.message));
  const url = "http://127.0.0.1:" + port + "/next.html?" + query;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#nxMain, .nx-gate", { timeout: 10000 });
  await wait(250);
  return { context, page };
}

async function main() {
  await ready();
  const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome" });
  const tag = phase === "before" ? "before" : "after";

  // 1. черновик
  {
    const b = await boot(browser, "as=owner&tab=orders&seg=new&scheme=dark");
    await b.page.locator("#client").fill("mira_test");
    await b.page.locator("#address").fill("ул Тестовая 1");
    await b.page.getByRole("button", { name: "+ Позиция" }).click();
    await b.page.locator(".nx-sheet").getByRole("button", { name: /Носы/i }).click();
    await b.page.locator(".nx-sheet").getByRole("button", { name: "В состав" }).click();
    await b.page.waitForSelector("#nxLines .nx-line");
    await b.page.reload({ waitUntil: "domcontentloaded" });
    await b.page.waitForSelector("#client", { timeout: 10000 });
    await wait(400);
    const nick = await b.page.locator("#client").inputValue();
    const draft = await b.page.evaluate(() => localStorage.getItem("superboyna_order_form_draft_v1"));
    await shot(b.page, "edits-a-1-" + tag + "-a.png");
    if (phase === "before") check(!!nick && !!draft, "before: draft should survive reload");
    if (phase === "after") {
      check(!nick, "after reload nick empty, got " + nick);
      check(!draft, "after reload draft key still set");
    }
    await b.context.close();
  }

  // 2. клавиатура
  {
    const b = await boot(browser, "as=owner&tab=orders&seg=new&scheme=dark");
    await b.page.getByRole("button", { name: "Розница" }).click();
    await wait(200);
    const price = b.page.locator("#priceInput");
    await price.click();
    await b.page.setViewportSize({ width: 390, height: 500 });
    await wait(200);
    const dock = await b.page.evaluate(() => {
      const d = document.getElementById("nxDock");
      if (!d) return { hidden: true };
      const st = getComputedStyle(d);
      const r = d.getBoundingClientRect();
      return { hidden: d.hidden || st.display === "none", top: r.top, h: r.height };
    });
    await shot(b.page, "edits-a-2-" + tag + "-a.png");
    if (phase === "after") {
      check(dock.hidden || dock.top > 420, "dock should hide or stay at the bottom, top=" + dock.top);
    }
    await b.context.close();
  }

  // 3. точки в листе позиции
  async function shotAdd(scheme, suffix) {
    const b = await boot(browser, "as=owner&tab=orders&seg=new&scheme=" + scheme);
    await b.page.getByRole("button", { name: "+ Позиция" }).click();
    await b.page.locator(".nx-sheet").getByRole("button", { name: "Дрессура" }).click();
    await b.page.locator(".nx-sheet").getByRole("button", { name: /^Лёгкое/ }).click();
    await wait(150);
    await shot(b.page, "edits-a-3-" + tag + "-" + suffix + ".png");
    const text = await b.page.locator("body").innerText();
    if (phase === "after") check(text.indexOf("·") < 0, "middot on add sheet " + scheme);
    await b.context.close();
  }
  await shotAdd("dark", "a");
  await shotAdd("light", "b");

  // 4. прокрутка нарезки
  {
    const b = await boot(browser, "as=owner&tab=production&seg=cut&scheme=dark");
    await b.page.locator("[data-cut]").last().waitFor({ timeout: 8000 });
    const last = b.page.locator("[data-cut]").last();
    await last.scrollIntoViewIfNeeded();
    await wait(100);
    const beforeTop = await b.page.evaluate(() => document.getElementById("nxMain").scrollTop);
    await last.locator("label").filter({ hasText: "Нарезано" }).locator("input").check();
    await wait(200);
    const afterTop = await b.page.evaluate(() => document.getElementById("nxMain").scrollTop);
    await shot(b.page, "edits-a-4-" + tag + "-a.png");
    if (phase === "before") check(afterTop < 30, "before scroll jumped, top=" + afterTop);
    if (phase === "after") check(Math.abs(afterTop - beforeTop) <= 2, "scroll moved " + beforeTop + " -> " + afterTop);
    await b.context.close();
  }

  // 5. свайп
  {
    const b = await boot(browser, "as=owner&tab=more&view=people&scheme=dark");
    await b.page.getByText("Сотрудники").waitFor({ timeout: 8000 });
    await b.page.evaluate(() => { const m = document.getElementById("nxMain"); m.scrollTop = m.scrollHeight; });
    await wait(100);
    await shot(b.page, "edits-a-5-" + tag + "-a.png");
    const info = await b.page.evaluate(() => ({
      swipes: window.__nxSwipes || 0,
      html: getComputedStyle(document.documentElement).overscrollBehavior,
      main: getComputedStyle(document.querySelector(".nx-main")).overscrollBehavior
    }));
    console.log("swipes", JSON.stringify(info));
    if (phase === "after") {
      check(info.swipes > 0, "disableVerticalSwipes not called");
      check(info.html === "none", "html overscroll " + info.html);
      check(info.main === "contain", "main overscroll " + info.main);
    }
    await b.context.close();
  }

  // 8. чеклист крошки
  {
    const b = await boot(browser, "as=owner&tab=orders&seg=new&scheme=dark");
    await b.page.locator("#client").fill("mira_test");
    await b.page.getByRole("button", { name: "Ещё у доставки" }).click();
    await b.page.getByRole("button", { name: "Вставить чеклист" }).click();
    await b.page.locator("#igPaste").fill("крошка почки 20 рубец 50");
    await b.page.getByRole("button", { name: "В корзину" }).click();
    await wait(300);
    await shot(b.page, "edits-a-8-" + tag + "-a.png");
    const lines = await b.page.locator("#nxLines").innerText();
    console.log("checklist lines", lines.replace(/\s+/g, " "));
    if (phase === "after") {
      check(/микс/i.test(lines), "mix line missing: " + lines);
      check(!/крошка почек 50/i.test(lines), "old kidney crumb 50 still shown");
    }
    await b.context.close();
  }

  // 9. месяц
  {
    const b = await boot(browser, "as=owner&tab=orders&seg=month&scheme=dark&slow=month");
    await wait(1500);
    await shot(b.page, "edits-a-9-" + tag + "-a.png");
    const grid = await b.page.locator(".nx-cal").count();
    const callsAt = await b.page.evaluate(() => window.__nxCalls.slice());
    if (phase === "after") check(grid > 0, "month grid missing at 1.5s");
    if (phase === "before") check(grid === 0, "before grid should still be skeleton");
    if (phase === "after") {
      await b.page.evaluate(() => { window.__nxCalls = []; });
      const cell = b.page.locator(".nx-cal [data-act='wcal']").first();
      await cell.click();
      await wait(200);
      const afterTap = await b.page.evaluate(() => window.__nxCalls.slice());
      console.log("day tap calls", afterTap.join(","));
      check(afterTap.filter((c) => c.indexOf("getViewCompare") === 0).length === 1, "day tap compare " + afterTap);
      check(!afterTap.some((c) => c.indexOf("getMonthOverview") === 0 || c.indexOf("getWeekDayCounts") === 0 || c.indexOf("getWeekBannerState") === 0), "day tap extra " + afterTap);
      await b.page.evaluate(() => { window.__nxCalls = []; });
      await b.page.getByRole("button", { name: "Следующий месяц" }).click();
      await wait(200);
      const afterShift = await b.page.evaluate(() => window.__nxCalls.slice());
      console.log("shift calls", afterShift.join(","));
      check(afterShift.filter((c) => c.indexOf("getMonthOverview") === 0).length === 1, "shift overview " + afterShift);
      await wait(1200);
      await shot(b.page, "edits-a-9-shift-after-a.png");
    }
    console.log("month boot calls", callsAt.filter((c) => /getMonth|getView|getWeek/.test(c)).join(","));
    await b.context.close();
  }

  // 10. шапка
  async function shotHead(scheme, suffix) {
    const b = await boot(browser, "as=owner&tab=orders&seg=new&scheme=" + scheme);
    await b.page.locator("h1.b-top__title").waitFor();
    await shot(b.page, "edits-a-10-" + tag + "-" + suffix + ".png");
    const n = await b.page.locator(".b-top__sub").count();
    if (phase === "after") check(n === 0, "subtitle still present " + scheme);
    await b.context.close();
  }
  await shotHead("dark", "a");
  await shotHead("light", "b");
  if (phase === "after") {
    const b = await boot(browser, "as=owner&tab=production&seg=cut&scheme=dark");
    await b.page.locator("h1.b-top__title").waitFor();
    await shot(b.page, "edits-a-10-cut-after-a.png");
    await b.context.close();
  }

  // 11. дата
  {
    const b = await boot(browser, "as=owner&tab=orders&seg=new&scheme=dark");
    await b.page.locator(".daybox").click();
    await b.page.getByRole("button", { name: "Другая дата" }).click();
    await b.page.locator(".nx-sheet").waitFor();
    await wait(300);
    for (let i = 0; i < 3; i++) {
      const title = await b.page.locator(".nx-sheet").innerText();
      if (/октябрь/i.test(title)) break;
      await b.page.locator(".nx-sheet").getByRole("button", { name: "Следующий месяц" }).click();
      await wait(200);
    }
    await b.page.locator(".nx-sheet [data-iso='2026-10-29']").click();
    await wait(200);
    const box = await b.page.locator(".daybox").innerText();
    console.log("daybox", box.replace(/\s+/g, " "));
    await shot(b.page, "edits-a-11-" + tag + "-a.png");
    if (phase === "after") check(/29\.10/.test(box), "day box " + box);
    await b.context.close();
  }

  // 13. клиенты после карточки
  {
    const b = await boot(browser, "as=owner&tab=clients&seg=pp&scheme=dark");
    await b.page.locator("[data-nick='mira_test']").waitFor({ timeout: 8000 });
    await b.page.locator("[data-nick='mira_test']").click();
    await b.page.getByRole("button", { name: "Сохранить" }).waitFor({ timeout: 8000 });
    await b.page.getByRole("button", { name: "Сохранить" }).click();
    await wait(300);
    await b.page.getByRole("button", { name: "← К списку" }).click();
    await wait(300);
    const list = await b.page.locator("#nxMain").innerText();
    await shot(b.page, "edits-a-13-" + tag + "-a.png");
    if (phase === "before") check(/пусто/.test(list), "before list should be empty");
    if (phase === "after") check(/Рекс/.test(list) && !/В этом списке пусто/.test(list), "list after card: " + list.slice(0, 180));
    await b.context.close();
  }

  // 14. пакеты
  {
    const b = await boot(browser, "as=owner&tab=production&seg=pack&scheme=dark&asm=four");
    await b.page.getByText("крафт").first().waitFor({ timeout: 8000 });
    await shot(b.page, "edits-a-14-" + tag + "-a.png");
    const text = await b.page.locator("#nxMain").innerText();
    console.log("asm", text.replace(/\s+/g, " ").slice(0, 400));
    if (phase === "after") {
      const m = text.match(/(\d+)\s*\n\s*крафт/) || text.match(/(\d+)[\s\S]{0,12}крафт/);
      check(m && Number(m[1]) === 2, "craft count " + (m && m[1]) + " in " + text.slice(0, 240));
      check(!/Собака 2/.test(text), "unmarked rows counted as a second dog");
    }
    await b.context.close();
  }

  // 15. назад
  {
    const b = await boot(browser, "as=owner&tab=more&view=stats&scheme=dark");
    await b.page.getByText("Статистика").first().waitFor({ timeout: 8000 });
    await shot(b.page, "edits-a-15-" + tag + "-a.png");
    const back = await b.page.getByRole("button", { name: "← Ещё" }).count();
    if (phase === "after") {
      check(back > 0, "stats back missing");
      await b.page.getByRole("button", { name: "← Ещё" }).click();
      await b.page.getByRole("button", { name: "Доступы" }).waitFor();
    }
    await b.context.close();
  }
  if (phase === "after") {
    const b = await boot(browser, "as=owner&tab=production&seg=cut&scheme=dark");
    await b.page.getByRole("button", { name: "Начать нарезку" }).click();
    for (let i = 0; i < 12; i++) {
      const box = b.page.locator("[data-cut] input[data-act='pr-done']:not(:checked)").first();
      if (!(await box.count())) break;
      await box.click();
      await wait(40);
    }
    await wait(200);
    const finishBtn = b.page.getByRole("button", { name: "Завершить нарезку" });
    if ((await finishBtn.count()) && !(await b.page.locator(".nx-sheet").count())) await finishBtn.click();
    await wait(200);
    for (let i = 0; i < 12; i++) {
      const dlg = b.page.locator(".nx-sheet");
      if (!(await dlg.count())) break;
      const ok = dlg.getByRole("button", { name: /Да|Готово|Заготов|Завершить/ }).first();
      if (!(await ok.count())) break;
      await ok.click();
      await wait(150);
    }
    await wait(300);
    const more = b.page.getByRole("button", { name: "Подробнее" });
    if (await more.count()) {
      await more.click();
      await wait(200);
      await shot(b.page, "edits-a-15-cut-after-a.png");
      check(await b.page.getByRole("button", { name: "← Итог" }).count() > 0, "cut back missing");
    } else {
      await shot(b.page, "edits-a-15-cut-after-a.png");
      fails.push("cut detail button missing");
    }
    await b.context.close();
  }

  // 17. доступы без завершения недели
  {
    const b = await boot(browser, "as=owner&tab=more&view=people&scheme=dark");
    await b.page.getByText("Сотрудники").waitFor({ timeout: 8000 });
    await b.page.evaluate(() => { const m = document.getElementById("nxMain"); m.scrollTop = m.scrollHeight; });
    await wait(100);
    await shot(b.page, "edits-a-17-" + tag + "-a.png");
    const text = await b.page.locator("#nxMain").innerText();
    if (phase === "after") check(!/Завершить неделю/.test(text), "finish week still in people");
    if (phase === "before") check(/Завершить неделю/.test(text), "before should show finish week");
    await b.context.close();
  }

  // 3b сборка после
  if (phase === "after") {
    const b = await boot(browser, "as=owner&tab=production&seg=pack&scheme=dark&asm=heavy");
    await b.page.getByText(/почек|Почки|крафт/).first().waitFor({ timeout: 8000 });
    await shot(b.page, "edits-a-3-asm-after-a.png");
    await b.context.close();
    const mix = await boot(browser, "as=owner&tab=production&seg=pack&scheme=dark&asm=crumb");
    await shot(mix.page, "edits-a-8-asm-after-a.png");
    await mix.context.close();
  }

  await browser.close();
  server.kill("SIGTERM");
  if (fails.length) {
    console.log("FAILS\n" + fails.join("\n"));
    process.exit(1);
  }
  console.log("edits-a " + phase + " ok");
}

main().catch((e) => {
  console.error(e);
  try { server.kill("SIGTERM"); } catch (err) {}
  process.exit(1);
});
