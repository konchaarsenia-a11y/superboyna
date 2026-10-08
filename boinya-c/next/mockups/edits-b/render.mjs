import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const imgDir = join(root, "img");
const appRoot = join(root, "../../..");

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function serve(cwd, port) {
  const child = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd,
    stdio: "ignore"
  });
  return child;
}

async function ready(url) {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (e) {}
    await wait(150);
  }
  throw new Error("server " + url);
}

function hookBody() {
  try { sessionStorage.setItem("superboyna_subs_unlocked_session", "1"); } catch (e) {}
  try { localStorage.removeItem("nx_access_v1"); } catch (e2) {}
  window.Telegram = window.Telegram || {};
  var scheme = "dark";
  try { scheme = new URLSearchParams(location.search).get("scheme") || "dark"; } catch (e3) {}
  window.Telegram.WebApp = {
    initData: "",
    initDataUnsafe: {},
    colorScheme: scheme,
    themeParams: {},
    ready() {},
    expand() {},
    onEvent() {},
    HapticFeedback: { impactOccurred() {} }
  };
  window.__NEXT_API_HOOK__ = function (params) {
    var a = String((params && params.action) || "");
    if (a === "getMyAccess") return { status: "success", role: "owner", name: "Арсений", telegramId: "1" };
    if (a === "listDeferred") {
      return { status: "success", items: [
        { id: "d1", status: "open", mode: "order", title: "На потом", client: "Рекс" },
        { id: "d2", status: "open", mode: "order", title: "Корм", client: "Луна" },
        { id: "d3", status: "open", mode: "remind", title: "Позвонить", client: "Нора" }
      ] };
    }
    if (a === "getWeekDayCounts") {
      return { status: "success", items: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье", "Будущая неделя"].map(function (day, i) {
        return { day: day, count: i === 6 ? 0 : 4, date: "30.09.2026" };
      }) };
    }
    if (a === "getMonthOverview") {
      return { status: "success", days: [
        { dateIso: "2026-09-29", count: 5, segments: { "ПП": 3, "БП": 2 } },
        { dateIso: "2026-09-30", count: 4, segments: { "ПП": 2, "БП": 1, "Р": 1 } },
        { dateIso: "2026-10-01", count: 6, segments: { "ПП": 4, "БП": 2 } },
        { dateIso: "2026-10-09", count: 12, segments: { "ПП": 6, "БП": 3, "Р": 2, "ПАРТНЁР": 1 } },
        { dateIso: "2026-10-29", count: 7, segments: { "ПП": 5, "БП": 2 } }
      ] };
    }
    if (a === "getWeekBannerState") return { status: "success", finished: false, pulled: true };
    if (a === "getViewCompare") {
      return {
        status: "success",
        day: "Среда",
        dateIso: "30.09.2026",
        week: [],
        month: [{
          name: "Рекс · Мира",
          segment: "ПП",
          address: "ул. Сурганова, 17",
          phone: "+375291112233",
          orderPrice: 43,
          basket: []
        }]
      };
    }
    if (a === "listSubscriptions") {
      return { status: "success", subscriptions: [
        { nick: "рекс", label: "Мира", sheet: "ПП", subId: "ПП-118", status: "активна", phone: "+375 29 100 20 01", address: "ул. Кальварийская, 21" },
        { nick: "bars", label: "Олег", sheet: "БП", subId: "БП-204", status: "БП2", phone: "+375 33 200 10 02", address: "проспект Победителей, 9" }
      ] };
    }
    if (a === "getSubscription") {
      return {
        status: "success",
        nick: "рекс",
        label: "Мира",
        sheet: "ПП",
        subId: "ПП-118",
        ppStatus: "активна",
        deliveries: "8",
        wishes: "мельче обычного",
        address: "ул. Кальварийская, 21, подъезд 2, этаж 4, кв. 18",
        phone: "+375 29 100 20 01",
        dogName: "Рекс",
        dogBreed: "лабрадор",
        dogWeight: "28",
        factCost: "43",
        statedCost: "43",
        basket: [],
        scheme: "LEGACY"
      };
    }
    if (a === "listAccess") {
      return { status: "success", people: [
        { telegramId: "10", name: "Гость", role: "pending" },
        { telegramId: "11", name: "Мария", role: "manager" },
        { telegramId: "12", name: "Илья", role: "cutter" },
        { telegramId: "13", name: "Олег", role: "courier" },
        { telegramId: "14", name: "Склад", role: "logistics" },
        { telegramId: "15", name: "Нина", role: "manager" },
        { telegramId: "16", name: "Павел", role: "all" }
      ] };
    }
    if (a === "listScheduledNotifications") return { status: "success", reminders: [], surveys: [], deficits: [] };
    if (a === "getCutting") {
      var day = (params && params.day) || "";
      return {
        status: "success",
        day: day,
        date: "30.09.2026",
        items: [
          { name: "Лёгкое", row: 4, dry: 800, raw: 1.1, unit: "г", laid: false, done: false },
          { name: "Сердце", row: 8, dry: 600, raw: 0.8, unit: "г", laid: true, done: false },
          { name: "Трахея", row: 12, dry: 10, raw: 10, unit: "шт", laid: false, done: false }
        ],
        session: { active: true, startedAt: Date.now() - 754000, day: day }
      };
    }
    if (a === "getCourier" || a === "getClients" || a === "getAssembly") {
      return { status: "success", day: "Среда", date: "30.09.2026", clients: [{
        name: "Рекс · Мира",
        segment: "ПП",
        address: "ул. Сурганова, 17",
        phone: "+375291112233",
        orderPrice: 43,
        assembled: false,
        basket: [{ name: "Лёгкое", val: 200, unit: "г" }]
      }] };
    }
    if (a === "getRetailPriceList") return { status: "success", items: [{ name: "Лёгкое", price: 12 }], delivery: { fee: 9, freeFrom: 80 } };
    if (a === "listPartners") return { status: "success", partners: [{ name: "Лапа", active: true }] };
    if (a === "listClientProfiles") return { status: "success", profiles: [] };
    if (a === "listBpIdle") return { status: "success", items: [] };
    return { status: "success", clients: [], items: [], rows: [], people: [], partners: [], subscriptions: [], days: [] };
  };
}

async function shootMockups(browser) {
  const port = 8821;
  const server = serve(root, port);
  try {
    await ready("http://127.0.0.1:" + port + "/index.html");
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await wait(400);
    const audit = await page.evaluate(() => {
      var clipped = [];
      var dots = [];
      var periods = [];
      document.querySelectorAll("article.phone").forEach(function (el) {
        var h = el.querySelector("h1");
        if (h && h.scrollWidth > h.clientWidth + 1) clipped.push(el.id + " " + h.textContent);
        var text = el.innerText || "";
        if (text.indexOf("·") >= 0 || text.indexOf("•") >= 0) dots.push(el.id);
        var cleaned = text.replace(/ул\./g, "").replace(/кв\./g, "").replace(/шт\./g, "").replace(/чел\./g, "").replace(/дн\./g, "").replace(/г\./g, "").replace(/\d\.\d/g, "");
        if (cleaned.indexOf(".") >= 0) periods.push(el.id);
      });
      var icons = [];
      document.querySelectorAll("article.phone .icon-btn").forEach(function (b) {
        var r = b.getBoundingClientRect();
        if (Math.abs(r.width - 44) > 1.2 || Math.abs(r.height - 44) > 1.2) icons.push(b.closest("article").id + " " + Math.round(r.width) + "x" + Math.round(r.height));
      });
      var chrome = [];
      document.querySelectorAll("article.phone").forEach(function (el) {
        var top = el.querySelector(".top");
        var tabs = el.querySelector(".tabs");
        if (top && Math.abs(top.getBoundingClientRect().height - 56) > 1.2) chrome.push(el.id + " top " + Math.round(top.getBoundingClientRect().height));
        if (tabs && Math.abs(tabs.getBoundingClientRect().height - 62) > 1.2) chrome.push(el.id + " tabs " + Math.round(tabs.getBoundingClientRect().height));
      });
      return { clipped: clipped, dots: dots, periods: periods, icons: icons.slice(0, 12), iconsN: icons.length, chrome: chrome.slice(0, 12) };
    });
    console.log("audit", JSON.stringify(audit));
    if (audit.dots.length || audit.periods.length || audit.clipped.length || audit.iconsN || audit.chrome.length) {
      throw new Error("mockup audit failed");
    }
    const ids = await page.$$eval("article.phone", (els) => els.map((e) => e.id));
    for (const id of ids) {
      const loc = page.locator("#" + id);
      await loc.scrollIntoViewIfNeeded();
      const box = await loc.boundingBox();
      await page.screenshot({
        path: join(imgDir, id + ".png"),
        clip: { x: Math.round(box.x), y: Math.round(box.y), width: 390, height: 844 }
      });
    }
    await page.locator("#sheet-a").screenshot({ path: join(imgDir, "sheet-a.png") });
    await page.locator("#sheet-b").screenshot({ path: join(imgDir, "sheet-b.png") });
    console.log("mockups", ids.length);
    await page.close();
  } finally {
    server.kill();
  }
}

async function shotApp(page, file) {
  await page.screenshot({ path: join(imgDir, file), fullPage: false });
}

async function shootCurrent(browser) {
  const port = 8822;
  const server = serve(appRoot, port);
  try {
    await ready("http://127.0.0.1:" + port + "/next.html");
    for (const scheme of ["dark", "light"]) {
      const theme = scheme === "dark" ? "a" : "b";
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        colorScheme: scheme
      });
      await context.addInitScript(hookBody);
      const page = await context.newPage();
      const base = "http://127.0.0.1:" + port + "/next.html";

      await page.goto(base + "?as=owner&tab=clients&seg=pp&scheme=" + scheme, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("text=Расчёт", { timeout: 15000 });
      await page.evaluate(() => {
        var seg = document.querySelector(".b-seg");
        if (seg) seg.scrollLeft = seg.scrollWidth;
      });
      await wait(250);
      await shotApp(page, "edits-b-6-current-" + theme + ".png");

      await page.goto(base + "?as=owner&tab=more&scheme=" + scheme, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("text=Подбор", { timeout: 15000 });
      await wait(200);
      await shotApp(page, "edits-b-6-current-more-" + theme + ".png");

      await page.goto(base + "?as=owner&tab=clients&seg=pp&scheme=" + scheme, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-act=cl-open]", { timeout: 15000 });
      await page.locator("[data-act=cl-open]").first().click();
      await page.waitForSelector("#cxAddress", { timeout: 15000 });
      await wait(200);
      await shotApp(page, "edits-b-7-current-" + theme + ".png");
      await page.evaluate(() => {
        var el = document.getElementById("cxAddress");
        var sc = document.getElementById("nxMain");
        if (el && sc) sc.scrollTop = Math.max(0, el.offsetTop - 12);
      });
      await wait(150);
      await shotApp(page, "edits-b-7-current-2-" + theme + ".png");

      await page.goto(base + "?as=owner&tab=orders&seg=month&scheme=" + scheme, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-act=wrow]", { timeout: 15000 });
      await page.locator("[data-act=wrow]").first().click();
      await page.waitForSelector("text=Перенести", { timeout: 10000 });
      await page.locator("[data-act=wmove]").click();
      await page.waitForSelector("#nxPrompt", { timeout: 10000 });
      await wait(200);
      await shotApp(page, "edits-b-12-current-" + theme + ".png");

      await page.goto(base + "?as=owner&tab=orders&seg=new&scheme=" + scheme, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-act=open-days]", { timeout: 15000 });
      await page.locator("[data-act=open-days]").click();
      await page.waitForSelector("[data-act=cal]", { timeout: 10000 });
      await page.locator("[data-act=cal]").click();
      await page.waitForSelector("text=Другая дата", { timeout: 10000 });
      await wait(300);
      await shotApp(page, "edits-b-12-current-cal-" + theme + ".png");

      await page.goto(base + "?as=owner&view=people&scheme=" + scheme, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("text=Завершить неделю", { timeout: 15000 });
      await page.evaluate(() => {
        var sc = document.getElementById("nxMain");
        if (sc) sc.scrollTop = sc.scrollHeight;
      });
      await wait(200);
      await shotApp(page, "edits-b-16-current-" + theme + ".png");

      await page.goto(base + "?as=owner&tab=production&seg=route&scheme=" + scheme, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("text=Белецкого", { timeout: 15000 });
      await wait(200);
      await shotApp(page, "edits-b-16-current-route-" + theme + ".png");

      await page.goto(base + "?as=owner&tab=production&seg=cut&scheme=" + scheme, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#nxCutTimer", { timeout: 15000 });
      await wait(200);
      await shotApp(page, "edits-b-18-current-" + theme + ".png");

      await context.close();
      console.log("current", theme);
    }
  } finally {
    server.kill();
  }
}

async function main() {
  await mkdir(imgDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  try {
    await shootMockups(browser);
    await shootCurrent(browser);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
