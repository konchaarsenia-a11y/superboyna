import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const shotDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "audit/shots");
const artifactDir = "/opt/cursor/artifacts";
fs.mkdirSync(shotDir, { recursive: true });
fs.mkdirSync(artifactDir, { recursive: true });
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const server = spawn("python3", ["-m", "http.server", "8766", "--bind", "127.0.0.1"], {
  cwd: root,
  stdio: "ignore"
});

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

const hook = () => {
  window.Telegram = {
    WebApp: {
      initData: "query_id=test&user=" + encodeURIComponent(JSON.stringify({ id: 4242, first_name: "Арсений" })),
      initDataUnsafe: { user: { id: 4242, first_name: "Арсений" } },
      ready() {},
      expand() {},
      colorScheme: "dark"
    }
  };
  window.__GOALS_DB__ = [
    { id: "d1", kind: "task", horizon: "day", title: "Сверить нарезку", done: true, doneAt: "2026-10-02", metricId: "", target: null, period: "", dateFrom: "", dateTo: "", createdAt: "2026-10-01T10:00:00.000Z" },
    { id: "d2", kind: "task", horizon: "day", title: "Позвонить поставщику", done: false, doneAt: "", metricId: "", target: null, period: "", dateFrom: "", dateTo: "", createdAt: "2026-10-01T11:00:00.000Z" },
    { id: "w1", kind: "task", horizon: "week", title: "Закрыть дефицит лёгкого", done: true, doneAt: "2026-10-01", metricId: "", target: null, period: "", dateFrom: "", dateTo: "", createdAt: "2026-09-28T10:00:00.000Z" },
    { id: "w2", kind: "task", horizon: "week", title: "Проверить маршруты", done: false, doneAt: "", metricId: "", target: null, period: "", dateFrom: "", dateTo: "", createdAt: "2026-09-28T11:00:00.000Z" },
    { id: "w3", kind: "task", horizon: "week", title: "Собрать остатки", done: false, doneAt: "", metricId: "", target: null, period: "", dateFrom: "", dateTo: "", createdAt: "2026-09-29T11:00:00.000Z" },
    { id: "w4", kind: "task", horizon: "week", title: "Обновить прайс", done: false, doneAt: "", metricId: "", target: null, period: "", dateFrom: "", dateTo: "", createdAt: "2026-09-30T11:00:00.000Z" },
    { id: "m1", kind: "task", horizon: "month", title: "Свести октябрь", done: true, doneAt: "2026-10-02", metricId: "", target: null, period: "", dateFrom: "", dateTo: "", createdAt: "2026-10-01T08:00:00.000Z" },
    { id: "y1", kind: "task", horizon: "year", title: "Удержать оборот", done: false, doneAt: "", metricId: "", target: null, period: "", dateFrom: "", dateTo: "", createdAt: "2026-01-02T08:00:00.000Z" },
    { id: "met1", kind: "metric", horizon: "", title: "Оборот", done: false, doneAt: "", metricId: "turnover", target: 100, period: "month", dateFrom: "2026-10-01", dateTo: "2026-10-31", createdAt: "2026-10-01T09:00:00.000Z" }
  ];
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    if (a === "getMyAccess") return { status: "success", role: "owner", name: "Арсений" };
    if (a === "listDeferred") return { status: "success", items: [] };
    if (a === "listGoals") return { status: "success", goals: window.__GOALS_DB__.slice(), notify: "off" };
    if (a === "saveGoal") {
      var goal = {
        id: params.id,
        kind: params.kind,
        horizon: params.horizon || "",
        title: params.title || "",
        done: params.done === "1" || params.done === 1 || params.done === true,
        doneAt: params.doneAt || "",
        metricId: params.metricId || "",
        target: params.target === "" || params.target == null ? null : Number(params.target),
        period: params.period || "",
        dateFrom: params.dateFrom || "",
        dateTo: params.dateTo || "",
        createdAt: new Date().toISOString()
      };
      var list = window.__GOALS_DB__;
      var at = -1;
      for (var i = 0; i < list.length; i++) if (list[i].id === goal.id) at = i;
      if (at >= 0) list[at] = Object.assign({}, list[at], goal);
      else list.push(goal);
      return { status: "success", goal: at >= 0 ? list[at] : goal, notify: { sent: false, reason: "disabled" } };
    }
    if (a === "deleteGoal") {
      window.__GOALS_DB__ = window.__GOALS_DB__.filter(function (g) { return g.id !== params.id; });
      return { status: "success", id: params.id };
    }
    if (a === "getStats") {
      return { status: "success", revenue: 180, cost: 50, deliveries: 7, profit: 180, clean: 130 };
    }
    if (a === "listSubscriptions") {
      return {
        status: "success",
        subscriptions: [
          { nick: "рекс", sheet: "ПП" },
          { nick: "барсик", sheet: "ПП" },
          { nick: "пробник", sheet: "БП" }
        ]
      };
    }
    return { status: "success" };
  };
};

async function shot(page, name) {
  const file = path.join(shotDir, name);
  await page.screenshot({ path: file, fullPage: false });
  fs.copyFileSync(file, path.join(artifactDir, name));
  console.log("saved", file);
}

async function main() {
  await ready();
  const launchOpts = { headless: true };
  if (process.env.CHROME_PATH) launchOpts.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "dark"
  });
  await context.addInitScript(hook);
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("pageerror", err.message));
  await page.goto("http://127.0.0.1:8766/next.html?as=owner&tab=goals&scheme=dark", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Цели" }).waitFor({ timeout: 10000 });
  await page.getByText("Закрыта", { exact: false }).first().waitFor({ timeout: 10000 });
  const nav = await page.locator("#nxNav").getAttribute("data-nav-count");
  if (nav !== "6") throw new Error("owner nav " + nav);
  const helpBtns = page.locator('#nxTop button[aria-label="Справка"]');
  if (await helpBtns.count() !== 1) throw new Error("help count " + await helpBtns.count());
  if (await helpBtns.getAttribute("data-act") !== "guide") throw new Error("help act " + await helpBtns.getAttribute("data-act"));
  const headerActs = await page.locator("#nxTop button").evaluateAll((els) => els.map((el) => el.getAttribute("data-act")));
  if (headerActs.indexOf("menu") >= 0 || headerActs.indexOf("help") >= 0) throw new Error("old header " + headerActs.join(","));
  await helpBtns.click();
  await page.getByRole("heading", { name: "Справка" }).waitFor();
  const guide = await page.locator("#nxScrim").innerText();
  if (!guide.includes("Как пользоваться") || !guide.includes("Раздел")) throw new Error("guide " + guide);
  await page.getByRole("button", { name: "Как пользоваться" }).click();
  await page.getByText("блок Общие").waitFor();
  await page.locator("[data-act='sheet-close']").click();
  await page.getByRole("heading", { name: "Справка" }).waitFor();
  await page.locator("[data-act='sheet-close']").click();
  await page.locator("#nxScrim").waitFor({ state: "hidden" });
  await page.locator('#nxNav [data-tab="more"]').click();
  await page.getByRole("heading", { name: "Ещё" }).waitFor();
  if (await page.locator('#nxTop button[aria-label="Справка"]').count() !== 1) throw new Error("help left the header");
  await page.locator('#nxNav [data-tab="goals"]').click();
  await page.getByRole("heading", { name: "Цели" }).waitFor();
  await page.getByText("Сверить нарезку").waitFor();
  const dayText = await page.locator("#nxMain").innerText();
  if (dayText.includes("·")) throw new Error("middle dot in goals");
  if (!dayText.includes("50%")) throw new Error("day percent " + dayText);
  if (!dayText.includes("1 из 2")) throw new Error("day fraction " + dayText);

  await shot(page, "goals-day.png");
  await page.getByRole("button", { name: "Неделя", exact: true }).click();
  await page.getByText("Проверить маршруты").waitFor();
  await shot(page, "goals-week.png");
  await page.getByRole("button", { name: "Месяц", exact: true }).click();
  await page.getByText("Свести октябрь").waitFor();
  await shot(page, "goals-month.png");
  await page.getByRole("button", { name: "Полгода", exact: true }).click();
  await page.getByText("Задач нет").first().waitFor();
  await shot(page, "goals-half.png");
  await page.getByRole("button", { name: "Год", exact: true }).click();
  await page.getByText("Удержать оборот").waitFor();
  await shot(page, "goals-year.png");

  await page.getByRole("button", { name: "Добавить показатель" }).click();
  await page.getByRole("heading", { name: "Новый показатель" }).waitFor();
  const sheet = page.locator("#nxScrim");
  await sheet.getByRole("button", { name: "Приход", exact: true }).click();
  await page.locator("#glTarget").fill("100");
  await sheet.getByRole("button", { name: "Неделя", exact: true }).click();
  const targetVal = await page.locator("#glTarget").inputValue();
  if (targetVal !== "100") throw new Error("target input " + targetVal);
  await shot(page, "goals-metric-create.png");
  await page.getByRole("button", { name: "Создать" }).click();
  await page.getByText("Закрыта", { exact: false }).first().waitFor({ timeout: 10000 });
  const income = page.locator("[data-goal]").filter({ hasText: "Приход" });
  await income.getByText("Закрыта").waitFor({ timeout: 10000 });
  const incomeText = await income.innerText();
  if (!incomeText.includes("130,00")) throw new Error("income text " + incomeText);
  if (!incomeText.includes("Закрыта")) throw new Error("income not closed " + incomeText);
  const mainText = await page.locator("#nxMain").innerText();
  if (mainText.includes("Считаю")) throw new Error("still loading " + mainText);
  await page.locator("#nxMain").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await shot(page, "goals-metric-done.png");

  await browser.close();
  server.kill();
}

main().catch((err) => {
  console.error(err);
  server.kill();
  process.exit(1);
});
