import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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
      return { status: "success", items: [{ status: "open" }, { status: "open" }, { status: "open" }] };
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

  await page.locator("#client").fill("Рекс · Анна");
  await page.locator("#phone").fill("+375 29 111-22-33");
  await page.locator("#address").fill("Сурганова 57Б");
  await page.getByRole("button", { name: "Ср" }).click();
  await page.getByRole("button", { name: "+ Позиция" }).click();
  await page.getByRole("button", { name: "Дрессура" }).click();
  await page.getByRole("button", { name: /Лёгкое|ЛЁГКОЕ/i }).first().click();
  await page.getByRole("button", { name: "ломтики" }).click();
  await page.getByRole("button", { name: "В состав" }).click();
  await page.getByRole("heading", { name: "Заказы" }).waitFor();
  await shot(page, "next-orders-new-top.png");

  await page.locator("#nxMain").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await wait(200);
  await shot(page, "next-orders-new-bottom.png");

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
  if (navM !== "5") throw new Error("manager nav " + navM);
  await shot(manager, "next-nav-manager.png");

  const states = await context.newPage();
  await states.goto("http://127.0.0.1:8765/next.html?as=owner&shot=states", { waitUntil: "domcontentloaded" });
  await states.getByText("Заказов нет").waitFor({ timeout: 8000 });
  await states.getByText("Идёт обработка").waitFor();
  await shot(states, "next-states.png");

  await browser.close();
  server.kill("SIGTERM");
}

main().catch((err) => {
  console.error(err);
  try { server.kill("SIGTERM"); } catch (e) {}
  process.exit(1);
});
