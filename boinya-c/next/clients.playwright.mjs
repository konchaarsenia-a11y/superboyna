import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const server = spawn("python3", ["-m", "http.server", "8766", "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:8766/next.html");
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
    if (a === "getMyAccess") return { status: "success", role: "owner", name: "Арсений" };
    if (a === "getWeekDayCounts") {
      return { status: "success", items: [
        { day: "Понедельник", short: "Пн", count: 9, date: "28.09.2026" },
        { day: "Вторник", short: "Вт", count: 12, date: "29.09.2026" },
        { day: "Среда", short: "Ср", count: 7, date: "30.09.2026" },
        { day: "Четверг", short: "Чт", count: 3, date: "01.10.2026" },
        { day: "Пятница", short: "Пт", count: 5, date: "02.10.2026" },
        { day: "Суббота", short: "Сб", count: 1, date: "03.10.2026" },
        { day: "Воскресенье", short: "Вс", count: 0, date: "04.10.2026" }
      ] };
    }
    if (a === "listDeferred") {
      return { status: "success", items: [
        { id: "p1", status: "open", mode: "partner", title: "Заявка · Лапа", client: "Лапа", payload: { mode: "partner", needsSlot: true, partnerOrderId: "po1", orderStatus: "new" } },
        { id: "d5", status: "open", mode: "pp", title: "Расчёт · Рекс", clientNick: "reks", payload: { mode: "pp", clientNick: "reks", displayName: "Рекс", deliveriesN: 2, subTotal: 70, note: "домофон", baskets: { 1: [{ cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", val: 200 }] } } }
      ] };
    }
    if (a === "listBpIdle") return { status: "success", idle: [] };
    if (a === "getWeekBannerState") return { status: "success", finished: false, pulled: false };
    if (a === "getClients" || a === "getViewCompare") {
      var sample = { name: "Рекс · Анна", segment: "ПП", address: "Сурганова 57Б", phone: "+375 29 111-22-33", note: "домофон 12", deliverySlot: 1, deliveriesN: 2, orderPrice: 43, basket: [{ name: "Лёгкое", val: 200, cat: "dressura" }] };
      if (a === "getClients") return { status: "success", clients: [sample] };
      return { status: "success", week: [sample], month: [sample], day: "Среда", dateIso: "30.09.2026" };
    }
    if (a === "unlockSubs") return { status: "success", unlocked: true };
    if (a === "listSubscriptions") {
      return { status: "success", subscriptions: [
        { nick: "reks", label: "Рекс · Анна", sheet: "ПП", status: "активна", phone: "+375 29 111-22-33", subId: "s1", deliveries: 2 },
        { nick: "bars", label: "Барс", sheet: "АФК", status: "пауза", subId: "s2" },
        { nick: "luna", label: "Луна", sheet: "БП", status: "БП1", subId: "s3", phone: "+375 29 000-00-01" },
        { nick: "nora", label: "Нора", sheet: "БП", status: "ФИНАЛ", subId: "s4" }
      ] };
    }
    if (a === "getSubscription") {
      return {
        status: "success", nick: params.nick || "reks", label: "Рекс · Анна", sheet: params.sheet || "ПП",
        subId: "s1", deliveries: 2, ppStatus: "активна", wishes: "домофон 12", address: "Сурганова 57Б",
        phone: "+375 29 111-22-33", dogName: "Рекс", dogBreed: "корги", dogWeight: "12",
        statedCost: "70", factCost: "68.4", scheme: "RAW26", coef: "2.6",
        basket: [{ cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", val: 200 }],
        basket2: [{ cat: "chew", main: "ТРАХЕЯ", name: "ТРАХЕЯ", sub: "СРЕД", val: 1 }]
      };
    }
    if (a === "listSurvey") {
      return { status: "success", items: [
        { id: "sv1", nick: "luna", kind: "bp2", dueDate: "2026-10-02", status: "planned", ownerName: "Мария" }
      ] };
    }
    if (a === "listAccess") return { status: "success", people: [{ telegramId: "200", name: "Мария", role: "manager" }] };
    if (a === "calcPrice") return { status: "success", cost: 10, factCost: 70, lines: [{ name: "ЛЁГКОЕ", sub: "Ломтики", val: 200, unitPrice: 5 }] };
    if (a === "getPpFactCost") return { status: "success", factCost: 41.8, statedCost: 43, deliveries: 2 };
    if (a === "getRetailPriceList") return { status: "success", items: [], delivery: { fee: 9, freeFrom: 80 } };
    if (a === "partnerSetOrderSlot") return { status: "success", deliverDateLabel: params.deliverDateIso };
    if (a === "enrollDeferredToPp") return { status: "success" };
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
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      if (r.right > cw + 1) {
        bad.push((el.className && el.className.baseVal !== undefined ? "" : String(el.className || el.tagName)).slice(0, 60) + " @" + Math.round(r.right));
      }
    });
    return { sw: document.documentElement.scrollWidth, cw: cw, bad: bad.slice(0, 8) };
  });
  if (box.sw > box.cw + 1 || box.bad.length) {
    throw new Error(label + " overflow " + JSON.stringify(box));
  }
  console.log("fit", label, box.cw);
}

async function main() {
  await ready();
  const browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  async function openAt(width) {
    const context = await browser.newContext({ viewport: { width: width, height: 844 }, deviceScaleFactor: 2 });
    await context.addInitScript(hook);
    const page = await context.newPage();
    page.on("pageerror", (err) => pageErrors.push(width + " " + err.message));
    await page.goto("http://127.0.0.1:8766/next.html?as=owner", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Сохранить заказ" }).waitFor({ timeout: 10000 });
    return { context, page };
  }

  const a = await openAt(360);
  await overflow(a.page, "orders-new-360");
  const day = a.page.locator(".b-day--on").first();
  const contrast = await day.evaluate((el) => {
    const w = el.querySelector(".b-day__w");
    const cs = getComputedStyle(el);
    const tw = getComputedStyle(w);
    return { bg: cs.backgroundColor, color: tw.color, text: el.innerText };
  });
  console.log("day", JSON.stringify(contrast));
  if (!contrast.text || !contrast.text.trim()) throw new Error("empty selected day");
  if (contrast.bg === contrast.color) throw new Error("day contrast " + JSON.stringify(contrast));
  await a.page.getByRole("button", { name: "Месяц", exact: true }).click();
  await a.page.getByRole("button", { name: "Завершить" }).waitFor();
  await overflow(a.page, "week-360");
  const finish = await a.page.getByRole("button", { name: "Завершить" }).boundingBox();
  const banner = await a.page.locator(".banner").first().boundingBox();
  if (finish && banner && finish.x + finish.width > banner.x + banner.width + 2) {
    throw new Error("finish button outside banner " + JSON.stringify({ finish, banner }));
  }
  if (a.pageErrors) {}
  await shot(a.page, "next-week-360.png");
  await a.page.getByRole("button", { name: "Месяц", exact: true }).click();
  await a.page.locator(".nx-cal").waitFor();
  await overflow(a.page, "month-360");
  await a.page.getByRole("button", { name: "Клиенты" }).click();
  await a.page.getByText("Подписки").waitFor();
  await overflow(a.page, "gate-360");
  await shot(a.page, "next-clients-gate.png");
  await a.page.locator("#cxPass").fill("1");
  await a.page.getByRole("button", { name: "Открыть" }).click();
  await a.page.getByText("Рекс").first().waitFor();
  await overflow(a.page, "list-360");
  await shot(a.page, "next-clients-list.png");
  await a.page.getByRole("button", { name: /Рекс/ }).click();
  await a.page.getByRole("button", { name: "Сохранить" }).waitFor();
  await overflow(a.page, "card-360");
  await shot(a.page, "next-clients-card.png");
  await a.page.getByRole("button", { name: "Глубокий редактор" }).click();
  await a.page.getByRole("button", { name: "Пересчитать цену" }).scrollIntoViewIfNeeded();
  await overflow(a.page, "deep-360");
  await shot(a.page, "next-clients-deep.png");
  await a.page.getByRole("button", { name: "Расчёт" }).click();
  await a.page.getByRole("button", { name: "Собрать сообщение" }).waitFor();
  await overflow(a.page, "calc-360");
  await shot(a.page, "next-clients-calc.png");
  await a.page.getByRole("button", { name: "Подбор" }).click();
  await a.page.getByRole("button", { name: "Подобрать" }).waitFor();
  await overflow(a.page, "pick-360");
  await shot(a.page, "next-clients-pick.png");
  await a.page.locator("#cxAnketa").fill("любит лёгкое\nБюджет до 40 руб");
  await a.page.getByRole("button", { name: "Подобрать" }).click();
  await a.page.getByRole("button", { name: "В расчёт" }).waitFor();
  await overflow(a.page, "pick-result-360");
  await shot(a.page, "next-clients-pick-result.png");
  await a.page.getByRole("button", { name: "БП", exact: true }).click();
  await a.page.getByText("Луна").waitFor();
  await overflow(a.page, "bp-360");
  await shot(a.page, "next-clients-bp.png");
  await a.page.getByRole("button", { name: "+ Клиент БП" }).click();
  await a.page.getByText("Новый клиент БП").waitFor();
  await overflow(a.page, "bp-form-360");
  await shot(a.page, "next-clients-bp-form.png");
  await a.page.getByRole("button", { name: "Опросник" }).click();
  await a.page.getByText("luna").waitFor();
  await overflow(a.page, "survey-360");
  await shot(a.page, "next-clients-survey.png");
  await a.page.getByRole("button", { name: "Задачи" }).click();
  await a.page.getByText("Заявка · Лапа").waitFor();
  await a.page.getByRole("button", { name: /Заявка/ }).click();
  await a.page.getByRole("button", { name: "Назначить дату" }).waitFor();
  await overflow(a.page, "slot-360");
  await shot(a.page, "next-task-slot.png");
  await a.page.getByRole("button", { name: "Назначить дату" }).click();
  await a.page.locator("#nxPrompt").fill("2026-10-05");
  await a.page.getByRole("button", { name: "Назначить", exact: true }).click();
  await a.page.getByText("Дата назначена").waitFor();
  await a.page.getByRole("button", { name: /Расчёт · Рекс/ }).click();
  await a.page.getByRole("button", { name: "Внести", exact: true }).click();
  await a.page.locator("#enrollCard").waitFor();
  await overflow(a.page, "enroll-360");
  await shot(a.page, "next-clients-enroll.png");
  await a.page.getByRole("button", { name: "Внести в лист ПП" }).click();
  await a.page.getByRole("button", { name: "Внести", exact: true }).click();
  await a.page.getByText("Отправлено в ПП").waitFor();
  await a.page.getByRole("button", { name: "АФК", exact: true }).click();
  await a.page.getByText("Барс").waitFor();
  await overflow(a.page, "afk-360");
  await a.page.getByRole("button", { name: "Цех" }).click();
  await overflow(a.page, "prod-360");
  await a.page.getByRole("button", { name: "Склад" }).click();
  await overflow(a.page, "wh-360");
  await a.page.getByRole("button", { name: "Ещё" }).click();
  await a.page.getByRole("button", { name: "Цели" }).click();
  await overflow(a.page, "goals-360");
  await a.page.getByRole("button", { name: "Ещё" }).click();
  await a.page.getByText("Доступы").waitFor();
  await overflow(a.page, "more-360");
  await a.page.getByRole("button", { name: "Доступы" }).click();
  await a.page.getByText("Мария").waitFor();
  await overflow(a.page, "people-360");
  await a.page.getByRole("button", { name: /Мария/ }).click();
  await a.page.getByRole("button", { name: "Сохранить" }).waitFor();
  await overflow(a.page, "person-360");
  await a.context.close();

  const b = await openAt(390);
  await overflow(b.page, "orders-390");
  await b.page.getByRole("button", { name: "Месяц", exact: true }).click();
  await b.page.getByRole("button", { name: "Завершить" }).waitFor();
  await overflow(b.page, "week-390");
  await b.page.getByRole("button", { name: "Клиенты" }).click();
  await b.page.locator("#cxPass").fill("1");
  await b.page.getByRole("button", { name: "Открыть" }).click();
  await b.page.getByText("Рекс").first().waitFor();
  await overflow(b.page, "list-390");
  await b.page.getByRole("button", { name: "Расчёт" }).click();
  await overflow(b.page, "calc-390");
  await b.page.getByRole("button", { name: "Цех" }).click();
  await overflow(b.page, "prod-390");
  const lbl = await b.page.locator(".b-nav__lbl").nth(2).innerText();
  if (lbl.trim() !== "Цех") throw new Error("nav label " + lbl);
  const fit = await b.page.locator(".b-nav__lbl").nth(2).evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  if (fit.sw > fit.cw + 1) throw new Error("nav clipped " + JSON.stringify(fit));
  await b.page.getByRole("button", { name: "Заказы" }).click();
  await b.page.getByRole("button", { name: "Месяц", exact: true }).click();
  await b.page.locator(".nx-cal").waitFor();
  await overflow(b.page, "month-390");
  await b.page.getByRole("button", { name: "Склад" }).click();
  await overflow(b.page, "wh-390");
  await b.page.getByRole("button", { name: "Ещё" }).click();
  await b.page.getByRole("button", { name: "Цели" }).click();
  await overflow(b.page, "goals-390");
  await b.page.getByRole("button", { name: "Ещё" }).click();
  await overflow(b.page, "more-390");
  await b.page.getByRole("button", { name: "Задачи" }).click();
  await b.page.getByText("Заявка · Лапа").waitFor();
  await overflow(b.page, "tasks-390");
  await b.context.close();
  const c = await openAt(360);
  await c.page.goto("http://127.0.0.1:8766/next.html?as=owner&shot=states", { waitUntil: "domcontentloaded" });
  await c.page.getByText("Заказов нет").waitFor();
  await overflow(c.page, "states-360");
  await c.context.close();

  const names = [
    "next-week-360.png", "next-clients-gate.png", "next-clients-list.png", "next-clients-card.png",
    "next-clients-deep.png", "next-clients-calc.png", "next-clients-pick.png", "next-clients-pick-result.png",
    "next-clients-bp.png", "next-clients-bp-form.png", "next-clients-survey.png", "next-task-slot.png",
    "next-clients-enroll.png"
  ];
  const hashes = names.map((n) => crypto.createHash("sha256").update(fs.readFileSync(path.join(outDir, n))).digest("hex"));
  if (new Set(hashes).size !== hashes.length) throw new Error("duplicate shots");
  if (pageErrors.length) throw new Error(pageErrors.join("\n"));
  await browser.close();
  server.kill("SIGTERM");
  console.log("ok");
}

main().catch((err) => {
  console.error(err);
  try { server.kill("SIGTERM"); } catch (e) {}
  process.exit(1);
});
