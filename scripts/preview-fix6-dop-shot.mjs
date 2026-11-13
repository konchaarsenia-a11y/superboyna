#!/usr/bin/env node
/**
 * Fix 6: real UI — Цех→Курьер with «Доп информация» on order that has a note.
 * Auth stub matches preview-fix2-three.mjs. Preview only.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");
const ROOT = "/agent/repos/superboyna/boinya-c";
const PREV = process.env.PREVIEW_URL || "https://boinya-c-preview-eabc.konchaarsenia.workers.dev";
const OUT = "/opt/cursor/artifacts";

async function api(action, params = {}, initData) {
  const body = Object.assign({ action, cutover: 1 }, params);
  if (initData) body.initData = initData;
  const res = await fetch(PREV + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

const mint = await api("previewMintInitData", { telegramId: "650923866" });
if (mint.status !== "success") throw new Error("mint failed");
const init = mint.initData;

const ymd = "2026-11-14";
const dayName = "Суббота";
let clients = (await api("getClients", { day: dayName, date: ymd }, init)).clients || [];
let nick = (clients[0] && (clients[0].nick || clients[0].name || clients[0].client)) || "";
let note = (clients[0] && clients[0].note) || "";
if (!nick || !String(note).trim()) {
  nick = "TEST-dop-" + Date.now().toString(36).slice(-5);
  note = "Доп: звонить за 15 мин (fix6)";
  await api(
    "saveOrder",
    {
      client: nick,
      nick,
      label: nick,
      date: ymd,
      day: ymd,
      address: "Минск, тест доп инфы",
      phone: "+375291000066",
      note,
      basket: JSON.stringify([{ name: "ЛЁГКОЕ", val: 40, sub: "ломтики" }]),
      ownerTelegramId: "650923866",
      orderType: "pp",
      segment: "ПП"
    },
    init
  );
  clients = (await api("getClients", { day: dayName, date: ymd, force: "1" }, init)).clients || [];
  nick = clients[0] && (clients[0].nick || clients[0].name);
  note = clients[0] && clients[0].note;
}
console.log("target", nick, note);

const cour = await api("getCourier", { day: dayName, date: ymd }, init);
console.log("courier api n=", (cour.clients || []).length, "note=", (cour.clients && cour.clients[0] && cour.clients[0].note) || "");

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/next.html";
  const fp = path.join(ROOT, u.replace(/^\//, ""));
  if (!fp.startsWith(ROOT) || !fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("x");
    return;
  }
  const ct = u.endsWith(".js")
    ? "application/javascript"
    : u.endsWith(".css")
      ? "text/css"
      : "text/html; charset=utf-8";
  res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-store" });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(8781, "127.0.0.1", r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 920 } });
page.setDefaultTimeout(20000);
await page.addInitScript((initData) => {
  const user = { id: 650923866, first_name: "Arseniy", username: "arseny" };
  const login = { initData, user, at: Date.now() };
  sessionStorage.setItem("nx_tg_init_v1", initData);
  sessionStorage.setItem("nx_tg_login_v1", JSON.stringify(login));
  localStorage.setItem("nx_tg_init_v1", initData);
  localStorage.setItem("nx_tg_login_v1", JSON.stringify(login));
  localStorage.setItem("nx_desk_sess_v1", JSON.stringify(login));
  localStorage.setItem(
    "nx_access_v1",
    JSON.stringify({ status: "success", role: "owner", access: "active", telegramId: "650923866", tabs: [] })
  );
  // Prefer Saturday for courier/assembly day
  try {
    localStorage.setItem("opsDayCourier", "Суббота");
    localStorage.setItem("opsDayAssembly", "Суббота");
    localStorage.setItem("opsDayCutting", "Суббота");
  } catch (e) {}
}, init);

async function goto(qs) {
  await page.goto(
    "http://127.0.0.1:8781/next.html?cutover=1&proxy=" + encodeURIComponent(PREV) + "&v=" + Date.now() + "&" + qs,
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );
  await page.waitForTimeout(3200);
}
async function shot(n) {
  const p = path.join(OUT, n);
  await page.screenshot({ path: p, fullPage: false });
  console.log("shot", n);
  return p;
}
function hasLabel(t) {
  return /Доп информац/i.test(t) && (/звонить|Доп:/i.test(t) || t.includes(String(note).slice(0, 8)));
}

await goto("tab=production");
await shot("fix6-nav-ceh.png");
let t = await page.locator("body").innerText();
if (/Войти через Telegram/i.test(t)) {
  console.log("AUTH FAIL still on login");
  fs.writeFileSync(path.join(OUT, "fix6-dop-report.json"), JSON.stringify({ ok: false, reason: "auth" }, null, 2));
  await browser.close();
  server.close();
  process.exit(1);
}

// Курьер segment
await page.locator('[data-act="pseg"][data-seg="route"], button:has-text("Курьер")').first().click({ force: true }).catch(() => {});
await page.waitForTimeout(1500);

// Set day select to Суббота
const daySet = await page.evaluate(() => {
  const sels = Array.from(document.querySelectorAll("select.b-field__input, select"));
  for (const sel of sels) {
    const opts = Array.from(sel.options || []);
    const hit = opts.find((o) => /Суббот/i.test(o.value || "") || /Суббот/i.test(o.text || ""));
    if (hit) {
      sel.value = hit.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      return hit.value;
    }
  }
  return null;
});
console.log("daySet", daySet);
await page.waitForTimeout(2800);
await shot("fix6-courier-sat.png");

t = await page.locator("body").innerText();
let ok = hasLabel(t);
console.log("courier", ok, (t.match(/Доп информац[^\n]*/i) || [])[0] || "none", t.includes(nick) ? "hasNick" : "noNick");

if (ok) {
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll(".b-lbl, .nx-extra-info, p")).find((n) =>
      /Доп информац/i.test(n.textContent || "")
    );
    if (el) el.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(300);
  await shot("fix6-dop-info-courier.png");
  await shot("fix2-fix6-dop.png");
}

// Fallback: month calendar → 14 → open row
if (!ok) {
  await goto("tab=orders&seg=month");
  await page.locator('button:has-text("Месяц"), [data-seg="month"]').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll("[data-act=wcal], [data-date]"));
    const hit = cells.find((n) => (n.getAttribute("data-date") || "") === "2026-11-14");
    if (hit) hit.click();
  });
  await page.waitForTimeout(2200);
  await shot("fix6-month-14.png");
  await page.evaluate((nick) => {
    const rows = Array.from(document.querySelectorAll("button.row, button[data-act=wrow], button"));
    const hit = rows.find((n) => (n.textContent || "").includes(nick));
    if (hit) hit.click();
  }, nick);
  await page.waitForTimeout(1200);
  t = await page.locator("body").innerText();
  ok = hasLabel(t);
  console.log("week card", ok, (t.match(/Доп информац[^\n]*/i) || [])[0] || "none");
  await shot("fix6-dop-info-week-card.png");
  if (ok) await shot("fix2-fix6-dop.png");
}

fs.writeFileSync(
  path.join(OUT, "fix6-dop-report.json"),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      nick,
      note,
      labelVisible: ok,
      snippet: t
        .split("\n")
        .filter((l) => /Доп|звонить|TEST-dop|Курьер|Состав|Минск/i.test(l))
        .slice(0, 25)
    },
    null,
    2
  )
);

await browser.close();
server.close();
console.log(ok ? "OK fix6" : "FAIL fix6");
process.exit(ok ? 0 : 1);
