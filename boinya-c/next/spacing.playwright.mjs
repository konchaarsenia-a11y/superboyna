import { chromium } from "playwright";
import { spawn } from "node:child_process";

const port = 8802;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  cwd: new URL("..", import.meta.url).pathname,
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
    var as = "owner";
    try { as = new URLSearchParams(location.search).get("as") || "owner"; } catch (e) {}
    if (a === "getMyAccess") {
      if (as === "manager") return { status: "success", role: "manager", name: "Мария" };
      if (as === "cutter") return { status: "success", role: "cutter", name: "Илья" };
      if (as === "courier") return { status: "success", role: "courier", name: "Олег" };
      if (as === "logistics") return { status: "success", role: "logistics", name: "Склад" };
      if (as === "partner") return { status: "success", role: "partner", name: "Лапа" };
      if (as === "none") return { status: "success", role: "none", name: "" };
      if (as === "pending") return { status: "success", role: "pending", name: "Гость" };
      return { status: "success", role: "owner", name: "Арсений" };
    }
    var client = {
      name: "Рекс · Анна",
      segment: "ПП",
      address: "Сурганова 57Б",
      phone: "+375291112233",
      note: "",
      orderPrice: 43,
      assembled: true,
      basket: [
        { name: "Лёгкое", val: 200, unit: "г" },
        { name: "Крошка микс", val: 100, unit: "г", ratio: [1, 1], sources: [{ name: "ЛЁГКОЕ", sub: "ломтики" }, { name: "ПОЧКИ", sub: "мелкое" }] }
      ]
    };
    if (a === "getWeekDayCounts") {
      return { status: "success", items: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье", "Будущая неделя"].map(function (day, i) {
        return { day: day, count: i === 6 ? 0 : 3, date: "29.09.2026" };
      }) };
    }
    if (a === "getMonthOverview") {
      return { status: "success", days: [{ dateIso: "2026-09-30", count: 4, segments: { "ПП": 2, "БП": 1, "Р": 1 } }] };
    }
    if (a === "getClients" || a === "getCourier" || a === "getAssembly") {
      return { status: "success", day: "Вторник", date: "29.09.2026", clients: [client] };
    }
    if (a === "getCutting") {
      return { status: "success", day: "Вторник", rows: [{ name: "Лёгкое", plan: 400, cut: 0 }] };
    }
    if (a === "listAccess") {
      return { status: "success", people: [{ telegramId: "100", name: "Новый", role: "pending" }, { telegramId: "200", name: "Мария", role: "manager" }] };
    }
    if (a === "listDeferred") {
      return { status: "success", items: [{ id: "d1", status: "open", mode: "order", title: "На потом · Рекс", client: "Рекс" }] };
    }
    if (a === "listPartners") return { status: "success", partners: [{ name: "Лапа", active: true }] };
    if (a === "getWeekBannerState") return { status: "success", finished: false, pulled: true };
    if (a === "getRetailPriceList") return { status: "success", items: [{ name: "Лёгкое", price: 12 }], delivery: { fee: 9, freeFrom: 80 } };
    if (a === "listSubscriptions") return { status: "success", subscriptions: [] };
    if (a === "warehousePreview") return { status: "success", rows: [] };
    return { status: "success", clients: [], items: [], rows: [], people: [], partners: [], subscriptions: [] };
  };
}

function measure() {
  var MIN = 8;
  var sel = "button, .b-chip, .b-field, a.nx-link";
  function rootOf(el) {
    if (el.closest(".menu-pop")) return "menu";
    if (el.closest(".nx-sheet")) return "sheet";
    if (el.closest("#nxDock")) return "dock";
    if (el.closest("#nxNav")) return "nav";
    if (el.closest("#nxTop")) return "top";
    if (el.closest("#nxMain")) return "main";
    if (el.closest(".nx-gate")) return "gate";
    return "other";
  }
  function boxOf(el) {
    var r = el.getBoundingClientRect();
    var sc = el.closest("#nxMain, .nx-sheet__body");
    var dy = sc ? sc.scrollTop : 0;
    var dx = sc ? sc.scrollLeft : 0;
    return { left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy };
  }
  var nodes = Array.prototype.slice.call(document.querySelectorAll(sel)).filter(function (el) {
    if (el.closest("[hidden]")) return false;
    var st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    var r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  }).map(function (el) {
    return { el: el, box: boxOf(el), root: rootOf(el) };
  });
  function labelOf(el) {
    var t = (el.getAttribute("aria-label") || el.innerText || el.id || "").replace(/\s+/g, " ").trim();
    return t.slice(0, 36) || el.className.slice(0, 24);
  }
  var bad = [];
  var i, j;
  for (i = 0; i < nodes.length; i++) {
    for (j = i + 1; j < nodes.length; j++) {
      var A = nodes[i], B = nodes[j];
      if (A.root !== B.root) continue;
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      var a = A.box, b = B.box;
      var xGap = Math.max(a.left, b.left) - Math.min(a.right, b.right);
      var yGap = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
      var gap;
      if (xGap < 0 && yGap < 0) gap = Math.max(xGap, yGap);
      else if (xGap < 0) gap = yGap;
      else if (yGap < 0) gap = xGap;
      else gap = Math.hypot(xGap, yGap);
      if (gap < MIN - 0.6) bad.push("зазор " + gap.toFixed(1) + " «" + labelOf(A.el) + "» / «" + labelOf(B.el) + "»");
    }
    var el = nodes[i].el;
    if (el.closest(".b-field")) continue;
    if (el.scrollWidth > el.clientWidth + 4 || el.scrollHeight > el.clientHeight + 4) {
      bad.push("текст «" + labelOf(el) + "»");
    }
  }
  return bad;
}

const pages = [
  ["owner-new", "as=owner&tab=orders&seg=new"],
  ["owner-month", "as=owner&tab=orders&seg=month"],
  ["owner-clients", "as=owner&tab=clients&seg=pp"],
  ["owner-calc", "as=owner&tab=clients&seg=calc"],
  ["owner-pick", "as=owner&tab=clients&seg=pick"],
  ["owner-cut", "as=owner&tab=production&seg=cut"],
  ["owner-pack", "as=owner&tab=production&seg=pack"],
  ["owner-route", "as=owner&tab=production&seg=route"],
  ["owner-wh", "as=owner&tab=warehouse"],
  ["owner-more", "as=owner&tab=more"],
  ["owner-people", "as=owner&view=people"],
  ["owner-templates", "as=owner&view=templates"],
  ["owner-price", "as=owner&view=price"],
  ["owner-stats", "as=owner&view=stats"],
  ["owner-partners", "as=owner&view=partners"],
  ["manager-orders", "as=manager&tab=orders&seg=new"],
  ["manager-calc", "as=manager&tab=clients&seg=calc"],
  ["cutter", "as=cutter"],
  ["courier", "as=courier"],
  ["logistics", "as=logistics"],
  ["partner", "as=partner"],
  ["gate-none", "as=none"],
  ["gate-pending", "as=pending"]
];

async function settle(page) {
  await page.waitForSelector("#nxMain, .nx-gate", { timeout: 10000 });
  await wait(200);
}

async function main() {
  await ready();
  const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome" });
  const fails = [];
  for (const width of [390, 360]) {
    for (const scheme of ["dark", "light"]) {
      const context = await browser.newContext({
        viewport: { width: width, height: 844 },
        deviceScaleFactor: 1,
        colorScheme: scheme
      });
      await context.addInitScript(hookBody);
      const page = await context.newPage();
      for (const [id, q] of pages) {
        const url = "http://127.0.0.1:" + port + "/next.html?" + q + "&scheme=" + scheme;
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await settle(page);
        const hit = await page.evaluate(measure);
        hit.forEach((line) => fails.push(width + " " + scheme + " " + id + ": " + line));
        const gated = await page.evaluate(() => {
          const g = document.getElementById("nxGate");
          return !!(g && !g.hidden && getComputedStyle(g).display !== "none");
        });
        if (!gated && id === "owner-new") {
          const day = page.locator(".daybox").first();
          if (await day.count()) {
            await day.click();
            await wait(200);
            const sheet = await page.evaluate(measure);
            sheet.forEach((line) => fails.push(width + " " + scheme + " owner-day-sheet: " + line));
            await page.keyboard.press("Escape");
            await wait(100);
          }
        }
        if (!gated && id === "owner-month") {
          const row = page.getByRole("button", { name: /Рекс/ }).first();
          if (await row.count()) {
            await row.click();
            await wait(200);
            const sheet = await page.evaluate(measure);
            sheet.forEach((line) => fails.push(width + " " + scheme + " owner-order-sheet: " + line));
            await page.keyboard.press("Escape");
          }
        }
        if (!gated) {
          const menu = page.getByRole("button", { name: "Меню" });
          if (await menu.count()) {
            await menu.click();
            await wait(150);
            const pop = await page.evaluate(measure);
            pop.forEach((line) => fails.push(width + " " + scheme + " " + id + "-menu: " + line));
            await page.keyboard.press("Escape");
            await wait(80);
          }
        }
      }
      await context.close();
    }
  }
  await browser.close();
  server.kill();
  const uniq = [];
  fails.forEach((line) => { if (uniq.indexOf(line) < 0) uniq.push(line); });
  if (uniq.length) {
    console.log(uniq.slice(0, 80).join("\n"));
    console.log("FAIL", uniq.length);
    process.exit(1);
  }
  console.log("ok spacing");
}

main().catch((err) => {
  console.error(err);
  try { server.kill(); } catch (e) {}
  process.exit(1);
});
