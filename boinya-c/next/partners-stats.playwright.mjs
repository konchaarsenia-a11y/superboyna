import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const server = spawn("python3", ["-m", "http.server", "8775", "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:8775/next.html");
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
    if (location.search.indexOf("as=cutter") >= 0) role = "cutter";
    if (a === "getMyAccess") return { status: "success", role: role, name: "Арсений", telegramId: "4242" };
    if (a === "getWeekDayCounts") return { status: "success", items: [] };
    if (a === "getWeekBannerState") return { status: "success", finished: true, pulled: true };
    if (a === "listDeferred") return { status: "success", items: [
      { id: "d1", status: "open", mode: "partner", title: "Полотно", payload: { needsSlot: true, partnerOrderId: "po1", locationName: "Полотно", orderType: "partner", basket: [{ id: "lung", name: "Лёгкое", qty: 200 }], note: "до двери" } }
    ] };
    if (a === "getStats" && params.mode === "expected") {
      return { status: "success", profit: 80, clean: 50, cost: 30, deliveries: 4, revenue: 80, from: params.dateFrom, to: params.dateTo, bySource: { pp: 2, bp: 1, retail: 1, partner: 0 }, ppScheme: "RAW26", ppRevenue: 70 };
    }
    if (a === "getStats") {
      return {
        status: "success",
        monthKey: params.month || "2026-09",
        monthLabel: params.month === "2026-08" ? "Август 2026" : "Сентябрь 2026",
        factCutoff: "2026-09-27",
        fact: {
          revenue: 100, profit: 100, cost: 40, clean: 60, deliveries: 3,
          ppRevenue: 70, retail: 20, partner: 10,
          bySource: { pp: 2, bp: 1, retail: 1, partner: 0 },
          ppScheme: "RAW26", ppRecoverInClean: 3, ppDeliveryFuelCost: 8, ppDeliveries: 2,
          byPartner: [{ name: "Катя", profit: 12, bpClients: 2, convertedToPp: 1, ppRevenue: 40, cost: 8 }]
        },
        pp: { turnover: 500, cost: 200, clean: 300 },
        bp: { deliveries: 1, spend: 12, total: 4, bp1: 2, bp2: 1, final: 1, convertedToPp: 1 },
        money: { turnover: 100 },
        charts: { turnover: [{ label: "ПП", value: 70 }, { label: "Розница", value: 20 }] },
        staff: { items: [] }
      };
    }
    if (a === "exportStats") return { status: "success", message: "Экспорт готов", tsv: "месяц\t100" };
    if (a === "setStatsCutterEnabled") return { status: "success", salary: 900 };
    if (a === "partnerListSuggestions") return { status: "success", suggestions: [
      { id: "s1", status: "новое", typeLabel: "Точка", name: "Новый двор", cityAddress: "Минск", authorName: "Оля" }
    ] };
    if (a === "partnerListAdmin") return {
      status: "success",
      miniAppUrl: "https://konchaarsenia-a11y.github.io/superboyna/varka/",
      networks: [],
      points: [],
      access: [],
      notifyCandidates: [{ telegramId: "7", name: "Оля", username: "olya", role: "manager" }],
      notifyRecipients: []
    };
    if (a === "listPartners") return { status: "success", partners: [{ id: "p1", name: "Катя", note: "двор", paysCost: true, active: true }] };
    if (a === "getWarehouse") return { status: "success", view: "asOf", items: [], ledger: [] };
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

async function longPress(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await wait(560);
  await page.mouse.up();
  await wait(80);
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
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await wait(400);
    return { context, page };
  }

  const prod = await open("http://127.0.0.1:8775/next.html?tab=production");
  await prod.page.locator("h1.b-top__title", { hasText: "Цех" }).waitFor();
  const title = prod.page.locator("h1.b-top__title");
  if ((await title.innerText()).trim() !== "Цех") throw new Error("title");
  const fitted = await title.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, size: getComputedStyle(el).fontSize }));
  if (fitted.sw > fitted.cw + 1) throw new Error("title clipped " + JSON.stringify(fitted));
  const navLbl = prod.page.locator(".b-nav__lbl", { hasText: "Цех" });
  const navFit = await navLbl.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  if (!navFit) throw new Error("nav clipped");
  if (await prod.page.locator(".b-top__sub").count()) throw new Error("subtitle still present");
  await overflow(prod.page, "header");
  await shot(prod.page, "next-header-live.png");

  await longPress(prod.page, prod.page.locator("#nxNav [data-tab='production']"));
  const prodSheet = prod.page.locator(".b-sheet");
  await prodSheet.getByRole("button", { name: "Маршрут" }).waitFor();
  await prodSheet.getByRole("button", { name: "Сборка" }).waitFor();
  if ((await prod.page.locator("h1.b-top__title").innerText()).trim() !== "Цех") throw new Error("prod press navigated");
  await overflow(prod.page, "prod-flyout");
  await shot(prod.page, "next-flyout-production.png");
  await prod.context.close();

  const wh = await open("http://127.0.0.1:8775/next.html?tab=warehouse");
  await wh.page.locator("h1.b-top__title", { hasText: "Склад" }).waitFor();
  await longPress(wh.page, wh.page.locator("#nxNav [data-tab='orders']"));
  const orderSheet = wh.page.locator(".b-sheet");
  await orderSheet.getByRole("button", { name: "Статистика" }).waitFor();
  await orderSheet.getByRole("button", { name: "Просмотр" }).waitFor();
  if ((await wh.page.locator("h1.b-top__title").innerText()).trim() !== "Склад") throw new Error("order press navigated");
  await shot(wh.page, "next-flyout-orders.png");
  await orderSheet.getByRole("button", { name: "Статистика" }).click();
  await wh.page.locator("#statsMonthLabel", { hasText: "Сентябрь 2026" }).waitFor();
  await wh.context.close();

  const stats = await open("http://127.0.0.1:8775/next.html?tab=more&view=stats");
  await stats.page.locator("#statsContainer", { hasText: "Нарезчик" }).waitFor();
  const statsText = await stats.page.locator("#nxMain").evaluate((el) => el.textContent);
  ["Прибыль", "Чистое", "Нарезчик", "Посчитать", "Воронка БП", "Лист ПП"].forEach((w) => {
    if (statsText.indexOf(w) < 0) throw new Error("stats missing " + w);
  });
  if (statsText.indexOf("Старый Deploy") >= 0) throw new Error("old deploy banner");
  await overflow(stats.page, "stats");
  await shot(stats.page, "next-stats.png");
  await stats.page.getByRole("button", { name: "Следующий месяц" }).click();
  await stats.page.locator(".b-toast", { hasText: "Дальше текущего месяца нельзя" }).waitFor();
  await stats.page.getByRole("button", { name: "Предыдущий месяц" }).click();
  await stats.page.locator("#statsMonthLabel", { hasText: "Август 2026" }).waitFor();
  await shot(stats.page, "next-stats-prev.png");
  await stats.page.getByRole("button", { name: "Экспорт TSV" }).click();
  await stats.page.locator(".b-toast", { hasText: "TSV скопирован" }).waitFor();
  await stats.page.getByRole("button", { name: "Посчитать" }).click();
  await stats.page.locator("#statsExpectBox", { hasText: "80" }).waitFor();
  await stats.page.getByRole("button", { name: "Управлять партнёрами" }).click();
  await stats.page.locator("#nxMain", { hasText: "Катя" }).waitFor();
  await stats.context.close();

  const part = await open("http://127.0.0.1:8775/next.html?tab=more&view=partners");
  await part.page.locator("#partnerHubOpenLink", { hasText: "Мини-апп" }).waitFor();
  const href = await part.page.locator("#partnerHubOpenLink").getAttribute("href");
  if (href.indexOf("/varka/") < 0) throw new Error("mini " + href);
  await part.page.locator("#nxMain", { hasText: "Новый двор" }).waitFor();
  await part.page.locator("#nxMain", { hasText: "Полотно" }).waitFor();
  await part.page.locator(".b-toast", { hasText: "назначьте дату" }).waitFor();
  const demo = await part.page.getByRole("button", { name: "Демо" }).count();
  if (demo) throw new Error("demo button");
  await overflow(part.page, "partners-orders");
  await shot(part.page, "next-partners-orders.png");
  await part.page.getByRole("button", { name: "Сети" }).click();
  await part.page.locator("#nxMain", { hasText: "Пусто — «+ Сеть»" }).waitFor();
  if (await part.page.getByRole("button", { name: "Демо" }).count()) throw new Error("demo on nets");
  await shot(part.page, "next-partners-nets.png");
  await part.page.getByRole("button", { name: "БП", exact: true }).click();
  await part.page.locator("#nxMain", { hasText: "платит себест" }).waitFor();
  await overflow(part.page, "partners-bp");
  await shot(part.page, "next-partners-bp.png");
  await part.context.close();

  const mgr = await open("http://127.0.0.1:8775/next.html?tab=more&as=manager");
  await mgr.page.locator(".b-li__title", { hasText: "Партнёры" }).waitFor();
  if (await mgr.page.locator(".b-li__title", { hasText: "Статистика" }).count()) throw new Error("manager stats");
  const nav = await mgr.page.locator(".b-nav__lbl").allInnerTexts();
  if (nav.join("|") !== "Заказы|Расчёт|Ещё") throw new Error("manager nav " + nav.join("|"));
  await shot(mgr.page, "next-manager-more.png");
  await mgr.context.close();

  const cut = await open("http://127.0.0.1:8775/next.html?as=cutter");
  await cut.page.locator("h1.b-top__title").waitFor();
  if (await cut.page.locator("#nxNav:not([hidden])").count()) throw new Error("cutter nav");
  await cut.context.close();

  if (pageErrors.length) throw new Error(pageErrors.join("\n"));
  await browser.close();
  server.kill();
  console.log("ok");
}

main().catch((err) => {
  console.error(err);
  server.kill();
  process.exit(1);
});
