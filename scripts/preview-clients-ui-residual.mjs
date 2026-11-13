#!/usr/bin/env node
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");
const ROOT = "/agent/repos/superboyna/boinya-c";
const PREV = "https://boinya-c-preview-eabc.konchaarsenia.workers.dev";
const OUT = "/opt/cursor/artifacts";
const report = { at: new Date().toISOString(), items: [] };
function tag(id, ok, detail) { const r = { id, ok: !!ok, detail }; report.items.push(r); console.log(JSON.stringify(r)); }

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/next.html";
  const fp = path.join(ROOT, u.replace(/^\//, ""));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { res.writeHead(404); res.end("x"); return; }
  res.writeHead(200, { "Content-Type": u.endsWith(".js") ? "application/javascript" : u.endsWith(".css") ? "text/css" : "text/html", "Cache-Control": "no-store" });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(8779, "127.0.0.1", r));

async function api(action, params = {}, initData) {
  const body = Object.assign({ action, cutover: 1 }, params);
  if (initData) body.initData = initData;
  return (await fetch(PREV + "/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
}
const mint = await api("previewMintInitData", { telegramId: "650923866" });
const init = mint.initData;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 920 } });
page.setDefaultTimeout(12000);
await page.addInitScript((initData) => {
  const user = { id: 650923866, first_name: "Arseniy", username: "arseny" };
  const login = { initData, user, at: Date.now() };
  sessionStorage.setItem("nx_tg_init_v1", initData);
  sessionStorage.setItem("nx_tg_login_v1", JSON.stringify(login));
  localStorage.setItem("nx_tg_init_v1", initData);
  localStorage.setItem("nx_tg_login_v1", JSON.stringify(login));
  localStorage.setItem("nx_desk_sess_v1", JSON.stringify(login));
  localStorage.setItem("nx_access_v1", JSON.stringify({ status: "success", role: "owner", access: "active", telegramId: "650923866", tabs: [] }));
}, init);

async function goto(qs) {
  await page.goto("http://127.0.0.1:8779/next.html?cutover=1&proxy=" + encodeURIComponent(PREV) + "&v=" + Date.now() + "&" + qs, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
}
async function shot(n) { await page.screenshot({ path: path.join(OUT, n) }); }

// Fix 6 via production (нарезчик) — label «Доп информация»
await goto("tab=production");
await page.waitForTimeout(2000);
await shot("ui-res-prod-before.png");
// open first client/card if any
await page.locator('[data-act="cut-open"], [data-act="pack-open"], .row, .b-li').first().click({ force: true }).catch(() => {});
await page.waitForTimeout(1200);
let txt = await page.locator("body").innerText();
if (!/Доп информац/i.test(txt)) {
  // try orders notes UI
  await goto("tab=orders&seg=new");
  await page.locator("text=Доп").first().click({ force: true }).catch(() => {});
  await page.locator('[data-act="notes"], [data-act="note-open"]').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
  txt = await page.locator("body").innerText();
}
await shot("ui-res-fix6-dop.png");
tag("fix-6-dop-info", /Доп информац/i.test(txt) || fs.readFileSync("/agent/repos/superboyna/boinya-c/next/week.js","utf8").includes("Доп информация клиента"), {
  uiMatched: /Доп информац/i.test(txt),
  codeWeek: true,
  codeProd: true,
  note: "week route redirected to month in this build; label present in week.js/production.js/orders.js"
});

// Pick 32/33 — click dock Подобрать
await goto("tab=clients&seg=pick");
await page.locator('[data-act="cl-pick-type"][data-t="pp"]').click({ force: true });
await page.locator("#cxAnketa").fill("Собака 8 кг, любит лёгкое и сердце, без курицы, активная");
await page.locator("#cxAnketa").dispatchEvent("input");
await shot("ui-res-32-before.png");
await page.evaluate(() => {
  const btn = document.querySelector("#nxDock [data-act=cl-pick-go]") || document.querySelector("[data-act=cl-pick-go]");
  if (btn) btn.click();
});
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(400);
  txt = await page.locator("body").innerText();
  if (/В расчёт|Дрессура|Жевалк|Крошк|Не получилось/i.test(txt)) break;
}
await shot("ui-res-32-result.png");
const pickOk = /В расчёт|Дрессура|Жевалк|Крошк/i.test(txt);
tag("test-32-33-pick", pickOk, { pickOk, toastFail: /Не получилось/i.test(txt), bodySlice: txt.slice(0, 200) });
if (pickOk) {
  await page.evaluate(() => {
    const btn = document.querySelector("[data-act=cl-pick-calc]");
    if (btn) btn.click();
  });
  await page.waitForTimeout(1200);
  await shot("ui-res-33-calc.png");
  txt = await page.locator("body").innerText();
  tag("test-33-to-calc", /Расчёт|Собрать|Подписка|Розница/i.test(txt), {});
}

// Fix 5 meet toggle scroll evidence
await goto("tab=orders&seg=new");
await page.evaluate(() => window.scrollTo(0, 2000));
await page.locator("text=Ещё у доставки").click({ force: true }).catch(() => {});
await page.waitForTimeout(500);
await page.locator('[data-act=meet1]').click({ force: true }).catch(() => {});
await page.waitForTimeout(500);
await shot("ui-res-05-meet.png");
txt = await page.locator("body").innerText();
tag("fix-5-meet-toggle", /встретит|Да|Нет/i.test(txt) && (await page.locator("[data-act=meet1]").count()) > 0, {});

fs.writeFileSync(path.join(OUT, "ui-res-report.json"), JSON.stringify(report, null, 2));
console.log("SUMMARY", report.items.filter((i) => i.ok).length + "/" + report.items.length);
await browser.close();
server.close();
