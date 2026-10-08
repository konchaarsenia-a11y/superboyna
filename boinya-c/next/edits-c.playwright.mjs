/**
 * Скриншоты пакета C, 390×844, темы A (dark) и B (light).
 * Запуск из репозитория: node boinya-c/next/edits-c.playwright.mjs
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
      if (!v.colorScheme) v.colorScheme = scheme;
      if (!v.initDataUnsafe || !v.initDataUnsafe.user) v.initDataUnsafe = { user: { id: 650923866, first_name: "Арс" } };
      wa = v;
    }
  });
  function q() { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); } }
  function cutItems(kind) {
    function gram(name, dry, laid, done) {
      return { name: name, plan: dry, dry: dry, unit: "г", laid: laid, done: done, row: name };
    }
    function pcs(name, n, laid, done) {
      return { name: name, plan: n, dry: n, unit: "шт", laid: laid, done: done, row: name };
    }
    if (kind === "66") {
      return [
        gram("Лёгкое", 480, false, true),
        gram("Рубец", 1520, true, false),
        pcs("Уши", 8, false, true),
        pcs("Носы", 12, true, false)
      ];
    }
    if (kind === "95") {
      return [
        gram("Лёгкое", 2000, false, true),
        pcs("Уши", 16, false, true),
        pcs("Носы", 4, true, false)
      ];
    }
    return [gram("Лёгкое", 2000, false, false), pcs("Трахея", 20, false, false)];
  }
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    var res = { status: "success" };
    if (a === "getMyAccess") {
      res = { status: "success", role: "owner", name: "Арс", telegramId: "650923866" };
    } else if (a === "unlockSubs") {
      res = { status: "success", unlocked: true };
    } else if (a === "getWeekDayCounts") {
      res = { status: "success", items: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"].map(function (day, i) {
        return { day: day, count: i === 2 ? 4 : 1, date: "30.09.2026" };
      }) };
    } else if (a === "getMonthOverview") {
      res = { status: "success", days: [{ dateIso: "2026-09-30", count: 4, segments: { "ПП": 2, "БП": 1, "Р": 1 } }, { dateIso: "2026-10-06", count: 3, segments: { "ПП": 3 } }] };
    } else if (a === "getViewCompare" || a === "getClients" || a === "getCourier") {
      var client = { name: "Мира", segment: "ПП", address: "ул. Кальварийская, 21", phone: "+375 29 100 20 01", orderPrice: 40, basket: [{ name: "Лёгкое", val: 200, unit: "г" }], assembled: false, delivered: false };
      res = { status: "success", day: "Среда", date: "30.09.2026", dateIso: "2026-09-30", clients: [client], month: [client], week: [] };
    } else if (a === "getWeekBannerState") {
      res = { status: "success", finished: false, pulled: true };
    } else if (a === "listSubscriptions") {
      res = { status: "success", subscriptions: [
        { nick: "mira", label: "Мира", sheet: "ПП", subId: "s1", phone: "+375 29 100 20 01", status: "активна" },
        { nick: "oleg", label: "Олег", sheet: "БП", subId: "s2", phone: "+375 33 200 10 02", status: "БП2" }
      ] };
    } else if (a === "getSubscription") {
      var bp = String((params && (params.sheet || params.segment)) || "") === "БП" || (params && params.nick) === "oleg";
      res = bp ? {
        status: "success", nick: "oleg", label: "Олег", sheet: "БП", subId: "БП-204", phone: "+375 33 200 10 02",
        address: "проспект Победителей, 9 · п.1 · эт.6 · кв.42",
        dogName: "Барс", dogBreed: "овчарка", dogWeight: "32",
        ppStatus: "БП2", deliveries: "4", wishes: "без печени",
        surveyBp2Due: "2026-11-12", surveyFinalDue: "2026-12-03",
        ownerTelegramId: "200", ownerName: "Мария", basket: []
      } : {
        status: "success", nick: "mira", label: "Мира", sheet: "ПП", subId: "ПП-118", phone: "+375 29 100 20 01",
        address: "ул. Кальварийская, 21 · п.2 · эт.4 · кв.18",
        dogName: "Рекс", dogBreed: "лабрадор", dogWeight: "28",
        ppStatus: "активна", deliveries: "8", wishes: "мельче обычного", basket: []
      };
    } else if (a === "listAccess") {
      res = { status: "success", people: [
        { telegramId: "100", name: "Гость", role: "pending" },
        { telegramId: "200", name: "Мария", role: "manager" },
        { telegramId: "300", name: "Илья", role: "cutter" }
      ] };
    } else if (a === "listWarehouses") {
      var south = { id: "south", name: "Юг", address: "ул. Чижевских, 8", departure: true };
      var north = { id: "north", name: "Север", address: "ул. Притыцкого, 62", departure: false };
      res = { status: "success", warehouses: [north, south], departure: south, departureId: "south" };
    } else if (a === "saveWarehouse" || a === "deleteWarehouse" || a === "setDepartureWarehouse") {
      res = { status: "success", warehouses: [], departure: { id: "beletskogo", name: "Склад", address: "Белецкого 10к2", departure: true } };
    } else if (a === "suggestAddress") {
      res = { status: "success", results: [{ title: "ул. Немига, 5", address: "ул. Немига, 5" }, { title: "ул. Немига, 12", address: "ул. Немига, 12" }] };
    } else if (a === "getCutting") {
      var items = cutItems(q().get("cut") || "66");
      res = { status: "success", day: "Среда", items: items, rows: items, session: { active: true, startedAt: Date.now() - 90000 } };
    } else if (a === "listDeferred") {
      res = { status: "success", items: [
        { id: "p1", status: "open", mode: "partner", title: "Заявка · Лапа", client: "Лапа", payload: { mode: "partner", needsSlot: true, partnerOrderId: "po1", orderStatus: "new", locationName: "Лапа" } },
        { id: "p2", status: "open", mode: "partner", title: "Лапа, повтор", payload: { mode: "partner", partnerOrderId: "po2", orderStatus: "new", deliverDateIso: "2026-10-06", locationName: "Лапа" } }
      ] };
    } else if (a === "partnerListAdmin") {
      res = { status: "success", networks: [], points: [], access: [] };
    } else if (a === "partnerListSuggestions") {
      res = { status: "success", items: [] };
    } else if (a === "listPartners") {
      res = { status: "success", partners: [] };
    } else if (a === "warehousePreview") {
      res = { status: "success", rows: [] };
    } else if (a === "getRetailPriceList") {
      res = { status: "success", items: [], delivery: { fee: 9, freeFrom: 80 } };
    } else {
      res = { status: "success", clients: [], items: [], rows: [], people: [], partners: [], subscriptions: [] };
    }
    return res;
  };
}

const fails = [];
function check(cond, msg) { if (!cond) fails.push(msg); }

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
  page.on("pageerror", (err) => fails.push("pageerror " + err.message));
  await page.goto("http://127.0.0.1:" + port + "/next.html?" + query, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#nxMain, .nx-gate", { timeout: 10000 });
  await wait(300);
  return { context, page };
}

async function main() {
  await ready();
  const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome" });
  const themes = [["dark", "a"], ["light", "b"]];

  for (const pair of themes) {
    const scheme = pair[0];
    const sfx = pair[1];
    const q = "as=owner&scheme=" + scheme;

    {
      const b = await boot(browser, q + "&tab=clients&seg=pp");
      await b.page.getByRole("button", { name: "Расчёт и подбор" }).waitFor();
      const segs = await b.page.locator(".b-seg").innerText();
      check(!/Расчёт/.test(segs) && !/Подбор/.test(segs), "segs still have tools " + segs);
      await shot(b.page, "edits-c-6-clients-" + sfx + ".png");
      await b.page.getByRole("button", { name: "Расчёт и подбор" }).click();
      await b.page.getByRole("heading", { name: "Расчёт и подбор" }).waitFor();
      await shot(b.page, "edits-c-6-sheet-" + sfx + ".png");
      await b.page.getByRole("button", { name: "Расчёт", exact: true }).click();
      await b.page.getByRole("button", { name: "Собрать сообщение" }).waitFor();
      await b.page.getByRole("button", { name: "← Назад" }).waitFor();
      await shot(b.page, "edits-c-6-calc-" + sfx + ".png");
      await b.context.close();
    }
    {
      const b = await boot(browser, q + "&tab=clients&seg=pick");
      await b.page.getByRole("button", { name: "Подобрать" }).waitFor();
      await b.page.getByRole("button", { name: "← Назад" }).waitFor();
      await shot(b.page, "edits-c-6-pick-" + sfx + ".png");
      await b.context.close();
    }
    {
      const b = await boot(browser, q + "&tab=more");
      await b.page.getByRole("button", { name: "Доступы" }).waitFor();
      const more = await b.page.locator("#nxMain").innerText();
      check(more.indexOf("Подбор") < 0, "more still has pick");
      await shot(b.page, "edits-c-6-more-" + sfx + ".png");
      await b.context.close();
    }
    {
      const b = await boot(browser, q + "&tab=orders&seg=new");
      await b.page.getByRole("button", { name: "Сохранить заказ" }).waitFor();
      await shot(b.page, "edits-c-6-orders-" + sfx + ".png");
      await b.context.close();
    }
    {
      const b = await boot(browser, q + "&tab=production&seg=cut&cut=0");
      await b.page.getByText("идёт нарезка").waitFor({ timeout: 8000 });
      await shot(b.page, "edits-c-6-shop-" + sfx + ".png");
      await b.context.close();
    }
    {
      const b = await boot(browser, q + "&tab=warehouse");
      await b.page.getByRole("button", { name: "Расчёт и подбор" }).waitFor();
      await shot(b.page, "edits-c-6-wh-" + sfx + ".png");
      await b.context.close();
    }
    {
      const b = await boot(browser, q + "&tab=orders&seg=month");
      await b.page.getByRole("button", { name: /4 чел/ }).click();
      await b.page.getByRole("button", { name: /Мира/ }).click();
      await b.page.getByRole("button", { name: "Править" }).click();
      await b.page.getByRole("button", { name: "Сохранить заказ" }).waitFor();
      const title = await b.page.locator(".b-top__title").innerText();
      check(title.trim() === "Правка заказа", "title " + title);
      const btn = await b.page.locator(".b-top .b-ib").first().boundingBox();
      check(btn && btn.width >= 43, "header button " + JSON.stringify(btn));
      await shot(b.page, "edits-c-6-title-" + sfx + ".png");
      await b.context.close();
    }

    {
      const b = await boot(browser, q + "&tab=clients&seg=pp");
      await b.page.getByRole("button", { name: /Мира/ }).click();
      await b.page.getByRole("button", { name: "Сохранить" }).waitFor();
      await b.page.locator("#cxEnt").waitFor();
      const ent = await b.page.locator("#cxEnt").inputValue();
      check(ent === "2", "entrance " + ent);
      await shot(b.page, "edits-c-7-pp-" + sfx + ".png");
      await b.page.getByRole("button", { name: "БП", exact: true }).click();
      await b.page.getByRole("button", { name: /Олег/ }).click();
      await b.page.locator("#cxSv2").waitFor();
      await shot(b.page, "edits-c-7-bp-" + sfx + ".png");
      await b.context.close();
    }

    {
      const b = await boot(browser, q + "&tab=orders&seg=month");
      await b.page.getByRole("button", { name: /4 чел/ }).click();
      await b.page.getByRole("button", { name: /Мира/ }).click();
      await b.page.getByRole("button", { name: "Перенести" }).click();
      await b.page.getByRole("button", { name: /Перенести на / }).waitFor();
      await shot(b.page, "edits-c-12-move-" + sfx + ".png");
      await b.context.close();
    }
    {
      const b = await boot(browser, q + "&tab=orders&seg=new");
      await b.page.getByRole("button", { name: "Задачи" }).click();
      await b.page.getByRole("button", { name: /Заявка, Лапа/ }).click();
      await b.page.getByRole("button", { name: "Назначить дату" }).click();
      await b.page.getByRole("button", { name: /Назначить на / }).waitFor();
      await shot(b.page, "edits-c-12-tasks-" + sfx + ".png");
      await b.context.close();
    }
    {
      const b = await boot(browser, q + "&tab=more&view=partners");
      await b.page.getByRole("button", { name: "Назначить дату" }).first().click();
      await b.page.getByRole("button", { name: /Назначить на / }).waitFor();
      await shot(b.page, "edits-c-12-partner-" + sfx + ".png");
      await b.context.close();
    }

    {
      const b = await boot(browser, q + "&tab=more&view=people");
      await b.page.getByText("Склады").waitFor({ timeout: 8000 });
      await b.page.getByText("ул. Чижевских, 8").waitFor();
      await shot(b.page, "edits-c-16-access-" + sfx + ".png");
      await b.page.getByRole("button", { name: "+ Склад" }).click();
      await b.page.getByRole("heading", { name: "Новый склад" }).waitFor();
      await b.page.locator("#whAddr").fill("ул. Немига");
      await b.page.getByRole("button", { name: "ул. Немига, 5" }).waitFor();
      await shot(b.page, "edits-c-16-new-" + sfx + ".png");
      await b.context.close();
    }
    {
      const b = await boot(browser, q + "&tab=production&seg=route");
      await b.page.getByText("Точка выезда").waitFor({ timeout: 8000 });
      await b.page.getByText("ул. Чижевских, 8").waitFor();
      const depotInput = await b.page.locator("#nxDepot").count();
      check(depotInput === 0, "courier still has depot input");
      await shot(b.page, "edits-c-16-route-" + sfx + ".png");
      await b.context.close();
    }

    for (const cut of [["0", "0"], ["66", "66"], ["95", "95"]]) {
      const b = await boot(browser, q + "&tab=production&seg=cut&cut=" + cut[0]);
      await b.page.locator(".nx-prog").waitFor({ timeout: 8000 });
      const text = await b.page.locator(".nx-prog").innerText();
      if (cut[0] === "66") {
        check(text.indexOf("66%") >= 0 && text.indexOf("62%") >= 0 && text.indexOf("70%") >= 0, "strip 66 " + text);
        check(text.indexOf("1 240 из 2 000 г") >= 0, "grams line " + text);
        check(text.indexOf("14 из 20 шт.") >= 0, "pcs line " + text);
      }
      if (cut[0] === "95") check(text.indexOf("95%") >= 0 && text.indexOf("100%") >= 0, "strip 95 " + text);
      if (cut[0] === "0") check(text.indexOf("0%") >= 0, "strip 0 " + text);
      await shot(b.page, "edits-c-18-" + cut[1] + "-" + sfx + ".png");
      await b.context.close();
    }
  }

  await browser.close();
  server.kill();
  if (fails.length) {
    console.error(fails.join("\n"));
    process.exit(1);
  }
  console.log("edits-c ok");
}

main().catch((e) => {
  console.error(e);
  try { server.kill(); } catch (e2) {}
  process.exit(1);
});
