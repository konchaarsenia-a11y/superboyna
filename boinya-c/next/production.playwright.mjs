import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const server = spawn("python3", ["-m", "http.server", "8771", "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:8771/next.html");
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
    if (location.search.indexOf("as=cutter") >= 0) role = "cutter";
    if (location.search.indexOf("as=courier") >= 0) role = "courier";
    if (a === "getMyAccess") return { status: "success", role: role, name: "Арсений", tabs: role === "owner" ? undefined : undefined };
    if (a === "getWeekDayCounts") return { status: "success", items: [] };
    if (a === "listDeferred") return { status: "success", items: [] };
    if (a === "getWeekBannerState") return { status: "success", finished: true, pulled: true };
    if (a === "unlockSubs") return { status: "success", unlocked: true };
    if (a === "listSubscriptions") return { status: "success", subscriptions: [] };
    if (a === "listTemplates") return { status: "success", templates: [
      { id: "t1", kind: "text", title: "Знакомство", body: "Спасибо за ответы! Очень рады знакомству" }
    ] };
    if (a === "getCutting") return { status: "success", day: params.day, date: "28.09.2026", items: [
      { row: 4, name: "ЛЁГКОЕ", dry: 400, raw: 1.2, unit: "гр", laid: false, done: false, surplus: 0 },
      { row: 8, name: "ТЫКВА", dry: 80, raw: 0.2, unit: "гр", laid: true, done: false, surplus: 0 }
    ] };
    if (a === "startCuttingSession") return { status: "success", session: { active: true, day: params.day, startedAt: Date.now() } };
    if (a === "updateCutting") return { status: "success" };
    var basket = [
      { name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", sub: "Среднее", val: 200, cat: "dressura", unit: "гр" },
      { name: "ТЫКВА", main: "ТЫКВА", sub: "", val: 40, cat: "veg", unit: "гр" },
      { name: "ТРАХЕЯ", main: "ТРАХЕЯ", sub: "СРЕД", val: 2, cat: "chew", unit: "шт" }
    ];
    if (a === "getAssembly") return { status: "success", day: params.day, clients: [
      { name: "Рекс · Анна", address: "Сурганова 57Б", basket: basket, assembled: false, printed: false }
    ] };
    if (a === "setPrinted" || a === "setAssembled") return { status: "success" };
    if (a === "getCourier") return { status: "success", day: params.day, date: "28.09.2026", clients: [
      { name: "Рекс · Анна", address: "Сурганова 57, кв 12, этаж 3", phone: "+375291112233", note: "[NOTE:cour|once] домофон 12", assembled: true, delivered: false, geo: { lat: 53.93, lon: 27.59 }, basket: basket, segment: "ПП" }
    ] };
    if (a === "setDelivered") return { status: "success" };
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
      if (r.right > cw + 1) {
        bad.push(String(el.className || el.tagName).slice(0, 60) + " @" + Math.round(r.right));
      }
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
    await context.addInitScript(hook);
    const page = await context.newPage();
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return { context, page };
  }

  const a = await open("http://127.0.0.1:8771/next.html?as=owner");
  await a.page.getByRole("button", { name: "Клиенты" }).click();
  await a.page.locator("#cxPass").fill("1");
  await a.page.getByRole("button", { name: "Открыть" }).click();
  await a.page.getByRole("button", { name: "Подбор" }).waitFor();
  const segs = await a.page.locator(".b-seg").innerText();
  if (!/Опросник/.test(segs) || !/Расчёт/.test(segs) || !/Подбор/.test(segs)) throw new Error("segs " + segs);
  const sub = await a.page.locator(".b-top__sub").innerText();
  if (/старой версии/.test(sub)) throw new Error("stub sub " + sub);
  await overflow(a.page, "clients-segs");
  await shot(a.page, "next-clients-segs.png");
  await a.page.getByRole("button", { name: "Подбор" }).click();
  await a.page.locator("#cxAnketa").fill("любит лёгкое\nБюджет до 40 руб");
  await a.page.getByRole("button", { name: "Подобрать" }).click();
  await a.page.getByText(/гр/).first().waitFor();
  const pick = await a.page.locator(".nx-main").innerText();
  if (/·\s*·/.test(pick)) throw new Error("double dot " + pick);
  if (!/гр/.test(pick)) throw new Error("no grams");
  const pickSub = await a.page.locator("body").innerText();
  if (/Этот раздел пока в старой версии/.test(pickSub)) throw new Error("pick stub header");
  await overflow(a.page, "pick");
  await shot(a.page, "next-pick-grams.png");

  await a.page.getByRole("button", { name: "Ещё", exact: true }).click();
  await a.page.getByRole("button", { name: "Шаблоны" }).click();
  await a.page.getByText("Знакомство").waitFor();
  await overflow(a.page, "tpl");
  await shot(a.page, "next-templates.png");
  await a.page.getByRole("button", { name: /Карточка лакомств/ }).click();
  await a.page.getByRole("button", { name: /Дрессура/ }).click();
  await a.page.locator('[data-name="ЛЁГКОЕ"]').click();
  await a.page.getByRole("button", { name: "Копировать" }).waitFor();
  await overflow(a.page, "card");
  await shot(a.page, "next-treat-card.png");

  await a.page.getByRole("button", { name: "Цех" }).click();
  await a.page.getByRole("button", { name: "Начать нарезку" }).waitFor();
  const prodSub = await a.page.locator("body").innerText();
  if (/Этот раздел пока в старой версии/.test(prodSub)) throw new Error("prod stub");
  if (!/ЛЁГКОЕ/.test(prodSub) || !/Выложено/.test(prodSub)) throw new Error("cut body");
  await overflow(a.page, "cut");
  await shot(a.page, "next-cutting.png");
  await a.page.getByRole("button", { name: "Сборка" }).click();
  await a.page.getByRole("checkbox", { name: /Пропечатано/ }).waitFor();
  await overflow(a.page, "asm");
  await shot(a.page, "next-assembly.png");
  await a.page.getByRole("button", { name: "Маршрут" }).click();
  await a.page.getByText("Рекс").first().waitFor();
  await a.page.getByRole("button", { name: "Собрать маршруты" }).click();
  await a.page.getByText(/Курьер 1/).waitFor({ timeout: 20000 });
  await overflow(a.page, "route");
  await shot(a.page, "next-route.png");
  await a.context.close();

  const b = await open("http://127.0.0.1:8771/next.html?as=cutter");
  await b.page.getByRole("button", { name: "Начать нарезку" }).waitFor();
  const nav = await b.page.locator(".b-nav__item").count();
  const navHidden = await b.page.locator("#nxNav").getAttribute("hidden");
  if (nav || navHidden == null) throw new Error("cutter has nav " + nav);
  await overflow(b.page, "cutter");
  await shot(b.page, "next-cutter-nonav.png");
  await b.context.close();

  const c = await open("http://127.0.0.1:8771/next.html?as=courier");
  await c.page.getByRole("button", { name: "Собрать маршруты" }).waitFor();
  const navC = await c.page.locator(".b-nav__item").count();
  const navCHidden = await c.page.locator("#nxNav").getAttribute("hidden");
  if (navC || navCHidden == null) throw new Error("courier has nav " + navC);
  const courText = await c.page.locator("body").innerText();
  if (!/Сборка/.test(courText) || !/Маршрут/.test(courText)) throw new Error("courier segs " + courText.slice(0, 200));
  await overflow(c.page, "courier");
  await shot(c.page, "next-courier-nonav.png");
  await c.context.close();

  const names = [
    "next-clients-segs.png", "next-pick-grams.png", "next-templates.png", "next-treat-card.png",
    "next-cutting.png", "next-assembly.png", "next-route.png", "next-cutter-nonav.png", "next-courier-nonav.png"
  ];
  const hashes = names.map((n) => crypto.createHash("sha256").update(fs.readFileSync(path.join(outDir, n))).digest("hex"));
  if (new Set(hashes).size !== hashes.length) throw new Error("duplicate shots");
  if (pageErrors.length) throw new Error(pageErrors.join("\n"));
  await browser.close();
  server.kill("SIGTERM");
  console.log("ok", names.length);
}

main().catch((err) => {
  console.error(err);
  try { server.kill("SIGTERM"); } catch (e) {}
  process.exit(1);
});
