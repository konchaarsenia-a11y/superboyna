import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const server = spawn("python3", ["-m", "http.server", "8765", "--bind", "127.0.0.1"], {
  cwd: root,
  stdio: "ignore"
});

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:8765/next.html");
      if (res.ok) return;
    } catch (e) {}
    await wait(150);
  }
  throw new Error("server");
}

const hook = () => {
  window.Telegram = {
    WebApp: {
      initData: "query_id=test&user=" + encodeURIComponent(JSON.stringify({ id: 4242, first_name: "Арсений" })),
      initDataUnsafe: { user: { id: 4242, first_name: "Арсений" } },
      ready() {},
      expand() {}
    }
  };
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    var as = "owner";
    try { as = new URLSearchParams(location.search).get("as") || "owner"; } catch (e) {}
    if (a === "getMyAccess") {
      if (as === "manager") {
        return {
          status: "success",
          role: "manager",
          name: "Мария",
          tabs: ["orderScreen", "subsScreen", "cuttingScreen", "warehouseScreen", "templatesScreen", "clientsScreen", "deferredScreen"]
        };
      }
      return { status: "success", role: "owner", name: "Арсений" };
    }
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
          { day: "Воскресенье", short: "Вс", count: 0, date: "04.10.2026" },
          { day: "Будущая неделя", short: "Буд", count: 2, date: "05.10.2026" }
        ]
      };
    }
    if (a === "listDeferred") {
      return {
        status: "success",
        items: [
          { id: "d1", status: "open", mode: "order", title: "На потом · Рекс", client: "Рекс", payload: { mode: "order", client: "Рекс", orderType: "pp", baskets: { 1: [], 2: [] } } },
          { id: "d2", status: "open", mode: "transfer", title: "Перенос · Анна", clientNick: "Анна", payload: { client: "Анна", day: "Среда", reason: "не был дома", segment: "ПП" } },
          { id: "d3", status: "open", mode: "buy", title: "Дозакуп · Лёгкое", payload: { name: "Лёгкое", needRaw: 2, available: 0 } },
          { id: "d4", status: "open", mode: "remind", title: "Позвонить Рексу", remindAt: "завтра 10:00" }
        ]
      };
    }
    if (a === "listBpIdle") return { status: "success", idle: [{ nick: "Барс", note: "нет контакта 8 дней" }] };
    if (a === "getWeekBannerState") return { status: "success", finished: false, pulled: false };
    if (a === "getViewCompare" || a === "getClients") {
      var sample = {
        name: "Рекс · Анна",
        segment: "ПП",
        address: "Сурганова 57Б",
        phone: "+375 29 111-22-33",
        note: "домофон 12",
        deliverySlot: 1,
        deliveriesN: 2,
        orderPrice: 43,
        basket: [{ name: "Лёгкое", val: 200, cat: "dressura" }]
      };
      if (a === "getClients") return { status: "success", clients: [sample] };
      if (params && params.date && !params.day) {
        return { status: "success", week: [], month: [sample], dateIso: params.date, day: "Среда" };
      }
      return { status: "success", week: [sample], month: [], day: (params && params.day) || "Среда", dateIso: "30.09.2026" };
    }
    if (a === "listAccess") {
      return {
        status: "success",
        people: [
          { telegramId: "100", name: "Новый человек", role: "pending" },
          { telegramId: "200", name: "Мария", role: "manager", timezone: "Europe/Minsk", tabs: ["orderScreen", "clientsScreen", "deferredScreen"] }
        ],
        timezones: ["Europe/Minsk", "Europe/Moscow"]
      };
    }
    if (a === "listScheduledNotifications") {
      return {
        status: "success",
        reminders: [{ toTid: "200", at: "28.09 10:00", title: "Позвонить", client: "Рекс" }],
        surveys: [{ respTid: "200", due: "29.09", kind: "БП2", nick: "Рекс" }],
        deficits: [{ nextAt: "30.09", item: "Лёгкое", day: "Среда" }]
      };
    }
    if (a === "getPpFactCost") {
      return { status: "success", factCost: 41.8, statedCost: 43, deliveries: 2, suggestedSlot: 1, needManualSlot: true };
    }
    if (a === "getRetailPriceList") return { status: "success", items: [], delivery: { fee: 9, freeFrom: 80 } };
    if (a === "listPartners") return { status: "success", partners: [{ name: "Лапа", active: true }] };
    if (a === "resolveDayForDate") return { status: "success", onWeek: true, dayName: "Среда" };
    if (a === "saveBooking") return { status: "accepted", pendingSheets: true, writeId: "t1", sheetsVerified: false };
    if (a === "getPpOrderSuggest") {
      return {
        status: "success",
        deliveriesN: 2,
        proposedBasket: [{ cat: "dressura", main: "ЛЁГКОЕ", sub: "Ломтики", value: 200 }]
      };
    }
    return { status: "success" };
  };
};

async function shot(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log("saved", file);
}

async function main() {
  await ready();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2
  });
  await context.addInitScript(hook);

  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("pageerror", err.message));
  await page.goto("http://127.0.0.1:8765/next.html?as=owner", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Сохранить заказ" }).waitFor({ timeout: 10000 });
  await page.waitForSelector(".b-day", { timeout: 8000 });
  await page.locator(".b-badge").waitFor({ timeout: 8000 });
  const navOwner = await page.locator("#nxNav").getAttribute("data-nav-count");
  if (navOwner !== "6") throw new Error("owner nav " + navOwner);
  await page.locator("#nxMain").evaluate((el) => { el.scrollTop = 0; });
  await page.getByRole("heading", { name: "Заказы" }).waitFor();
  await shot(page, "next-orders-new-top.png");

  await page.locator("#client").fill("Рекс · Анна");
  await page.getByRole("button", { name: "Ещё у доставки" }).click();
  await page.locator("#phone").fill("+375 29 111-22-33");
  await page.locator("#address").fill("Сурганова 57Б");
  await page.locator(".daybox").click();
  await page.locator(".nx-sheet").getByRole("button", { name: "Среда" }).click();
  await page.getByRole("button", { name: "+ Позиция" }).click();
  await page.getByRole("button", { name: "Дрессура" }).click();
  await page.getByRole("button", { name: /Лёгкое|ЛЁГКОЕ/i }).first().click();
  await page.getByRole("button", { name: "ломтики" }).click();
  await page.getByRole("button", { name: "В состав" }).click();
  await page.getByRole("heading", { name: "Заказы" }).waitFor();

  await page.locator("#nxMain").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await wait(200);
  await shot(page, "next-orders-new-bottom.png");
  const hash = (name) => crypto.createHash("sha256").update(fs.readFileSync(path.join(outDir, name))).digest("hex");
  if (hash("next-orders-new-top.png") === hash("next-orders-new-bottom.png")) {
    throw new Error("top and bottom screenshots are identical");
  }

  await page.locator("#nxMain").evaluate((el) => { el.scrollTop = 0; });
  await page.locator(".daybox").click();
  await page.getByRole("button", { name: "Пятница" }).click();
  await page.locator("#nxToast").waitFor();
  await page.locator("#nxMain").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const toastBox = await page.evaluate(() => {
    const t = document.getElementById("nxToast").getBoundingClientRect();
    const d = document.getElementById("nxDock").getBoundingClientRect();
    const top = document.getElementById("nxTop").getBoundingClientRect();
    return {
      toastTop: t.top,
      toastBottom: t.bottom,
      headerBottom: top.bottom,
      dockTop: d.top,
      dockHidden: document.getElementById("nxDock").hidden
    };
  });
  if (toastBox.dockHidden) throw new Error("dock hidden");
  if (toastBox.toastTop < toastBox.headerBottom - 2) throw new Error("toast overlaps header " + JSON.stringify(toastBox));
  if (toastBox.toastBottom > toastBox.dockTop) throw new Error("toast overlaps dock " + JSON.stringify(toastBox));
  await shot(page, "next-toast.png");

  await page.locator("#nxMain").evaluate((el) => { el.scrollTop = 0; });
  await page.getByRole("button", { name: "БП", exact: true }).click();
  await page.getByRole("heading", { name: /Перенести данные/ }).waitFor();
  await shot(page, "next-type-sheet.png");
  await page.getByRole("button", { name: "Закрыть" }).click();

  await page.getByRole("button", { name: "+ Позиция" }).click();
  await page.getByRole("heading", { name: "Добавить позицию" }).waitFor();
  await page.getByRole("button", { name: "Жевалки" }).click();
  await page.getByRole("button", { name: /Трахея|ТРАХЕЯ/ }).first().click();
  await shot(page, "next-add-item.png");
  await page.getByRole("button", { name: "Закрыть" }).click();
  await shot(page, "next-nav-owner.png");

  const manager = await context.newPage();
  await manager.goto("http://127.0.0.1:8765/next.html?as=manager", { waitUntil: "domcontentloaded" });
  await manager.getByRole("button", { name: "Сохранить заказ" }).waitFor({ timeout: 10000 });
  const navM = await manager.locator("#nxNav").getAttribute("data-nav-count");
  if (navM !== "6") throw new Error("manager nav " + navM);
  await shot(manager, "next-nav-manager.png");

  const states = await context.newPage();
  await states.goto("http://127.0.0.1:8765/next.html?as=owner&shot=states", { waitUntil: "domcontentloaded" });
  await states.getByText("Заказов нет").waitFor({ timeout: 8000 });
  await states.getByText("Идёт обработка").waitFor();
  await shot(states, "next-states.png");

  await page.getByRole("button", { name: "Задачи" }).click();
  await page.getByRole("heading", { name: /Задачи/ }).waitFor();
  await page.getByText("На потом, Рекс").waitFor();
  await shot(page, "next-tasks.png");
  await page.getByRole("button", { name: /Перенос, Анна/ }).click();
  await page.getByRole("button", { name: "Перенести" }).waitFor();
  await shot(page, "next-task-move.png");
  await page.keyboard.press("Escape");

  const week = await context.newPage();
  await week.goto("http://127.0.0.1:8765/next.html?as=owner&tab=orders&seg=week", { waitUntil: "domcontentloaded" });
  await week.getByText("Рекс").first().waitFor({ timeout: 10000 });
  await week.getByRole("button", { name: "Завершить" }).waitFor();
  await shot(week, "next-orders-week.png");
  await week.getByRole("button", { name: "Месяц", exact: true }).click();
  await week.locator(".nx-cal").waitFor();
  await week.locator(".nx-cal button[data-date]").nth(10).click();
  await week.getByText("Рекс").first().waitFor();
  await shot(week, "next-orders-month.png");
  await week.getByRole("button", { name: /Рекс/ }).first().click();
  await week.getByRole("button", { name: "Править" }).click();
  await week.getByRole("heading", { name: "Правка заказа" }).waitFor();
  await week.locator("#client").waitFor();
  await shot(week, "next-order-edit.png");

  const access = await context.newPage();
  await access.goto("http://127.0.0.1:8765/next.html?as=owner&tab=more&view=people", { waitUntil: "domcontentloaded" });
  await access.getByText("Новый человек").waitFor({ timeout: 10000 });
  if (await access.getByRole("button", { name: "Завершить неделю" }).count()) throw new Error("week finish should stay off the access screen");
  await shot(access, "next-access.png");
  await access.getByRole("button", { name: /Мария/ }).click();
  await access.getByText("Запланированные").waitFor();
  await access.getByText("Позвонить").waitFor();
  await shot(access, "next-access-person.png");

  const names = [
    "next-orders-new-top.png",
    "next-orders-new-bottom.png",
    "next-toast.png",
    "next-tasks.png",
    "next-task-move.png",
    "next-orders-week.png",
    "next-orders-month.png",
    "next-order-edit.png",
    "next-access.png",
    "next-access-person.png"
  ];
  const hashes = names.map((n) => hash(n));
  const uniq = new Set(hashes);
  if (uniq.size !== hashes.length) throw new Error("duplicate screenshots " + names.filter((n, i) => hashes.indexOf(hashes[i]) !== i).join(","));

  await browser.close();
  server.kill("SIGTERM");
}

main().catch((err) => {
  console.error(err);
  try { server.kill("SIGTERM"); } catch (e) {}
  process.exit(1);
});
