import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const server = spawn("python3", ["-m", "http.server", "8773", "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:8773/next.html");
      if (res.ok) return;
    } catch (e) {}
    await wait(150);
  }
  throw new Error("server");
}

function hook() {
  window.Telegram = {
    WebApp: {
      initData: "query_id=test&user=" + encodeURIComponent(JSON.stringify({ id: 4242, first_name: "Арсений" })),
      initDataUnsafe: { user: { id: 4242, first_name: "Арсений" } },
      ready() {}, expand() {}, openLink() {}
    }
  };
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    var role = "owner";
    if (location.search.indexOf("as=logistics") >= 0) role = "logistics";
    if (location.search.indexOf("as=manager") >= 0) role = "manager";
    if (a === "getMyAccess") return { status: "success", role: role, name: "Арсений", telegramId: "4242" };
    if (a === "getWeekDayCounts") return { status: "success", items: [] };
    if (a === "listDeferred") return { status: "success", items: [] };
    if (a === "getWeekBannerState") return { status: "success", finished: true, pulled: true };
    if (a === "getWarehouse") {
      if (location.search.indexOf("wh=fail") >= 0 && !params._) return { status: "error", message: "нет связи" };
      if (params.view === "weekStart") {
        return { status: "success", view: "weekStart", items: [
          { row: 4, name: "ЛЁГКОЕ", unit: "кг", weekStart: 3.5, stock: 2, arrival: 1.5, buy: true }
        ], ledger: [{ type: "приход", qty: 1.5, unit: "кг" }] };
      }
      return { status: "success", view: "asOf", items: [
        { row: 4, name: "ЛЁГКОЕ", unit: "кг", asOfStock: 1.25, stock: 2, arrival: 0, weekStart: 2, buy: false }
      ], ledger: [{ type: "приход", qty: 1, unit: "кг" }] };
    }
    if (a === "warehousePreview") return { status: "success", deficits: [{ name: "ТЫКВА" }], withPlan: [
      { name: "ТЫКВА", unit: "кг", deficit: 0.4, dryG: 500, needRaw: 1.2, available: 0.8 },
      { name: "ТРАХЕЯ", unit: "шт", deficit: 0, piece: true, dryG: 4, needRaw: 4, available: 6 }
    ], plan: [] };
    if (a === "composeWarehouseBuyMessage") return { status: "success", text: "Дозакуп: ТЫКВА 0.4", count: 1 };
    if (a === "closeAllOpenDeficits") return { status: "success", closed: 2 };
    if (a === "setWarehouseArrival") return { status: "success" };
    if (a === "getRetailPriceList") return { status: "success", delivery: { fee: 9, freeFrom: 80 }, items: [
      { key: "АОРТА", kind: "per100", price: 1 },
      { key: "АОРТА|Обычная", kind: "per100", price: 12.5 },
      { key: "ТРАХЕЯ", kind: "perPiece", price: 3 }
    ] };
    if (a === "saveRetailPrices") return { status: "success", saved: (params.items || []).length, items: params.items, delivery: params.delivery };
    return { status: "success" };
  };
}

async function shot(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log("saved", file);
}

async function overflow(page, label) {
  const box = await page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const bad = [];
    document.querySelectorAll("body *").forEach((el) => {
      if (el.closest && el.closest(".b-seg")) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      if (r.right > cw + 1) bad.push(String(el.className || el.tagName).slice(0, 80) + " @" + Math.round(r.right));
    });
    return { sw: document.documentElement.scrollWidth, cw: cw, bad: bad.slice(0, 8) };
  });
  if (box.sw > box.cw + 1 || box.bad.length) throw new Error(label + " overflow " + JSON.stringify(box));
  console.log("fit", label);
}

async function main() {
  await ready();
  const browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  async function open(url) {
    const context = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await context.addInitScript(hook);
    const page = await context.newPage();
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    return { context, page };
  }

  const prod = await open("http://127.0.0.1:8773/next.html?tab=production");
  await prod.page.locator("h1.b-top__title", { hasText: "Цех" }).waitFor();
  const title = prod.page.locator("h1.b-top__title");
  const titleText = (await title.innerText()).trim();
  if (titleText !== "Цех") throw new Error("title " + titleText);
  const fitted = await title.evaluate((el) => ({
    sw: el.scrollWidth,
    cw: el.clientWidth,
    size: getComputedStyle(el).fontSize
  }));
  if (fitted.sw > fitted.cw + 1) throw new Error("title clipped " + JSON.stringify(fitted));
  const navLbl = prod.page.locator(".b-nav__lbl", { hasText: "Цех" });
  const navFit = await navLbl.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, text: el.innerText }));
  if (navFit.sw > navFit.cw + 1) throw new Error("nav clipped " + JSON.stringify(navFit));
  if ((await navLbl.innerText()).trim() !== "Цех") throw new Error("nav text changed");
  await overflow(prod.page, "header");
  await shot(prod.page, "next-header-title.png");
  console.log("title-fit", JSON.stringify(fitted));

  const wh = await open("http://127.0.0.1:8773/next.html?tab=warehouse");
  await wh.page.getByText("ЛЁГКОЕ").waitFor();
  await wh.page.getByText("1.25").waitFor();
  const body = await wh.page.locator(".nx-main").innerText();
  if (!/Обновить/.test(body) || !/Позиции/.test(body) || !/Дозакуп/.test(body) || !/Закрыть дефициты/.test(body)) throw new Error("actions");
  if (!/приход/.test(body)) throw new Error("ledger");
  if (/Остатки[\s\S]*Дозакуп[\s\S]*Движения/.test(body) && /Склад пока в старой/.test(body)) throw new Error("stub");
  await wh.page.getByText("ТЫКВА").waitFor();
  await overflow(wh.page, "warehouse");
  await shot(wh.page, "next-warehouse.png");

  await wh.page.locator("#arr_4").fill("2");
  await wh.page.getByRole("button", { name: "Сохранить" }).click();
  await wh.page.getByText("Дозакуп сохранён").waitFor();
  await shot(wh.page, "next-warehouse-save.png");

  await wh.page.getByRole("button", { name: "Дозакуп", exact: true }).click();
  await wh.page.getByText(/Скопировано · 1/).waitFor();

  await wh.page.getByRole("button", { name: "неделя" }).click();
  await wh.page.locator("#whDayLabel", { hasText: "Неделя F+B" }).waitFor();
  await wh.page.getByText("3.5").waitFor();
  await wh.page.getByText("закупить").waitFor();
  await overflow(wh.page, "week");
  await shot(wh.page, "next-warehouse-week.png");

  await wh.page.getByRole("button", { name: "Закрыть дефициты" }).click();
  await wh.page.locator(".b-btn--main", { hasText: "Закрыть" }).click();
  await wh.page.getByText("Закрыто: 2").waitFor();

  const fail = await open("http://127.0.0.1:8773/next.html?tab=warehouse&wh=fail");
  await fail.page.getByRole("button", { name: "Повторить" }).waitFor({ timeout: 8000 });
  const err = await fail.page.locator(".nx-main").innerText();
  if (!/Ошибка загрузки склада/.test(err) || !/нет связи/.test(err)) throw new Error("retry " + err);
  await overflow(fail.page, "retry");
  await shot(fail.page, "next-warehouse-retry.png");
  await fail.page.getByRole("button", { name: "Повторить" }).click();
  await fail.page.getByText("ЛЁГКОЕ").waitFor();

  const price = await open("http://127.0.0.1:8773/next.html?tab=more");
  await price.page.getByRole("button", { name: "Прайс" }).click();
  await price.page.locator('input[data-rp-key="АОРТА|Обычная"]').waitFor();
  const bare = await price.page.locator('input[data-rp-key="АОРТА"]').count();
  if (bare !== 0) throw new Error("bare aorta shown");
  const fee = await price.page.locator("#retailPriceFeeInput").inputValue();
  const free = await price.page.locator("#retailPriceFreeFromInput").inputValue();
  if (fee !== "9" || free !== "80") throw new Error("delivery " + fee + " " + free);
  const status = await price.page.locator("#retailPriceAdminStatus").innerText();
  if (!/2 позиций/.test(status)) throw new Error("status " + status);
  await overflow(price.page, "price");
  await shot(price.page, "next-price.png");
  await price.page.getByRole("button", { name: "Сохранить" }).click();
  await price.page.getByText(/Прайс сохранён · 2/).waitFor();
  await shot(price.page, "next-price-saved.png");

  const logi = await open("http://127.0.0.1:8773/next.html?as=logistics");
  await logi.page.getByText("ЛЁГКОЕ").waitFor();
  const navCount = await logi.page.locator(".b-nav__item").count();
  const navHidden = await logi.page.locator("#nxNav").getAttribute("hidden");
  if (navCount !== 0 || navHidden === null) throw new Error("logistics nav " + navCount + " " + navHidden);
  const logTitle = (await logi.page.locator("h1.b-top__title").innerText()).trim();
  if (logTitle !== "Склад") throw new Error("logistics title " + logTitle);
  await overflow(logi.page, "logistics");
  await shot(logi.page, "next-warehouse-logistics.png");

  const mgr = await open("http://127.0.0.1:8773/next.html?tab=more&as=manager");
  await mgr.page.getByText("Партнёры").waitFor();
  if (await mgr.page.getByRole("button", { name: "Прайс" }).count()) throw new Error("manager sees price");
  const tabs = await mgr.page.locator(".b-nav__lbl").allInnerTexts();
  if (tabs.join("|") !== "Заказы|Расчёт|Ещё") throw new Error("manager nav " + tabs.join("|"));

  if (pageErrors.length) throw new Error(pageErrors.join("\n"));
  await browser.close();
  server.kill();
  console.log("ok");
}

main().catch((err) => {
  console.error(err);
  try { server.kill(); } catch (e) {}
  process.exit(1);
});
