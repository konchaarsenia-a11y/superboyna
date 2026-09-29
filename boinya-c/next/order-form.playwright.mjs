import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const server = spawn("python3", ["-m", "http.server", "8788", "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:8788/next.html");
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
      ready() {}, expand() {}
    }
  };
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    if (a === "getMyAccess") return { status: "success", role: "owner", name: "Арсений", telegramId: "4242" };
    if (a === "getWeekDayCounts") {
      return {
        status: "success",
        items: [
          { day: "Понедельник", count: 2, date: "28.09.2026" },
          { day: "Вторник", count: 9, date: "29.09.2026" },
          { day: "Среда", count: 4, date: "30.09.2026" },
          { day: "Четверг", count: 1, date: "01.10.2026" },
          { day: "Пятница", count: 0, date: "02.10.2026" },
          { day: "Суббота", count: 0, date: "03.10.2026" },
          { day: "Воскресенье", count: 0, date: "04.10.2026" }
        ]
      };
    }
    if (a === "getWeekBannerState") return { status: "success", finished: false, pulled: false };
    if (a === "listDeferred") return { status: "success", items: [] };
    if (a === "listClientProfiles") {
      return {
        status: "success",
        clients: [{ nick: "Рекс", address: "Сурганова 57", phone: "+375291112233", basket: [] }]
      };
    }
    if (a === "suggestAddress") {
      return {
        status: "success",
        results: [{ title: "Сурганова, 57", subtitle: "Минск", address: "Сурганова, 57", lat: 53.92, lon: 27.58 }]
      };
    }
    if (a === "getRetailPriceList") return { status: "success", items: [], delivery: { fee: 9, freeFrom: 80 } };
    if (a === "listPartners") return { status: "success", partners: [] };
    return { status: "success" };
  };
}

const browser = await chromium.launch({ headless: true });
try {
  await ready();
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
  await page.addInitScript(hook);
  await page.addInitScript(() => {
    localStorage.setItem("superboyna_order_form_draft_v1", JSON.stringify({
      orderType: "pp",
      client: "Черновик",
      phone: "+37529",
      address: "",
      baskets: { 1: [{ cat: "chew", main: "ТРАХЕЯ", name: "ТРАХЕЯ", sub: "", value: 1 }], 2: [] },
      dogCount: 1,
      activeDog: 1,
      dogNames: { 1: "", 2: "" },
      notes: [],
      day: "Среда",
      deliveryDate: "2026-09-30"
    }));
  });
  await page.goto("http://127.0.0.1:8788/next.html?tab=orders&seg=new", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Сохранить заказ" }).waitFor({ timeout: 10000 });
  const client = page.locator("#client");
  await client.waitFor();
  const restored = await client.inputValue();
  if (restored !== "Черновик") throw new Error("draft not restored: " + restored);
  const dock = page.locator("#nxDock");
  const dockBox = await dock.boundingBox();
  const nav = page.locator("#nxNav");
  const navBox = await nav.boundingBox();
  if (!dockBox || !navBox) throw new Error("dock or nav missing");
  if (dockBox.y + dockBox.height > navBox.y + 2) throw new Error("dock is not above the nav");
  if (navBox.y + navBox.height < 760) throw new Error("nav not pinned to the bottom");
  await client.fill("Ре");
  await page.locator("#nxSuggest", { hasText: "Рекс" }).waitFor({ timeout: 8000 });
  await page.locator("#address").fill("Сур");
  await page.locator("#nxAddr", { hasText: "Сурганова, 57" }).waitFor({ timeout: 8000 });
  await page.screenshot({ path: path.join(outDir, "next-order-dock.png") });
  const dateInputs = await page.locator("#nxMain input[type='date']").count();
  if (dateInputs) throw new Error("second date field on the order form");
  await page.locator(".daybox").click();
  await page.getByRole("button", { name: "Другая дата" }).waitFor();
  await page.keyboard.press("Escape");
  await page.locator("#client").fill("");
  await page.getByRole("button", { name: "+ Позиция" }).click();
  const pq = page.locator("#pq");
  await pq.waitFor();
  await pq.fill("тра");
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  if (focused !== "pq") throw new Error("search lost focus: " + focused);
  await page.screenshot({ path: path.join(outDir, "next-order-search.png") });
  console.log("ok order form");
} finally {
  await browser.close();
  server.kill();
}
