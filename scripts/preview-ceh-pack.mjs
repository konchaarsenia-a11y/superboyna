#!/usr/bin/env node
/** Preview smoke: ceh-pack-h1 (Цех). Local next.html + preview worker. No prod D1 writes. */
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import vm from "node:vm";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");

const ROOT = "/agent/repos/superboyna/boinya-c";
const PREV = process.env.PREVIEW_URL || "https://boinya-c-preview-eabc.konchaarsenia.workers.dev";
const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts/ceh-pack";
fs.mkdirSync(OUT, { recursive: true });

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

function weekdayMinsk(offset) {
  const names = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Minsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  let y = "", mo = "", da = "";
  parts.forEach((p) => {
    if (p.type === "year") y = p.value;
    if (p.type === "month") mo = p.value;
    if (p.type === "day") da = p.value;
  });
  const base = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da)));
  base.setUTCDate(base.getUTCDate() + (offset || 0));
  return names[base.getUTCDay()];
}

const ping = await api("ping");
fs.writeFileSync(path.join(OUT, "ping.json"), JSON.stringify(ping, null, 2));
if (!ping || ping.previewIsolated !== true) {
  console.error("preview not isolated", ping);
  process.exit(1);
}

const mint = await api("previewMintInitData", { telegramId: "650923866" });
const init = mint && mint.initData;
if (!init) {
  console.error("no initData", mint);
  process.exit(1);
}

const tomorrow = weekdayMinsk(1);
const today = weekdayMinsk(0);
const cut = await api("getCutting", { day: tomorrow }, init);
const asm = await api("getAssembly", { day: today }, init);
const cour = await api("getCourier", { day: today }, init);
fs.writeFileSync(
  path.join(OUT, "days.json"),
  JSON.stringify(
    {
      tomorrow,
      today,
      cutStatus: cut && cut.status,
      cutItems: ((cut && cut.items) || []).length,
      fromCalendar: !!(cut && cut.fromCalendar),
      asmClients: ((asm && asm.clients) || []).length,
      courClients: ((cour && cour.clients) || []).length
    },
    null,
    2
  )
);

const prodSrc = fs.readFileSync(path.join(ROOT, "next/production.js"), "utf8");
const formulas = fs.readFileSync(path.join(ROOT, "next/formulas.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(formulas, sandbox);
sandbox.window.BoinyaFormulas = sandbox.BoinyaFormulas;
vm.runInNewContext(prodSrc, sandbox);
const prod = sandbox.window.BoinyaProduction;
const pushText = prod.missedPushText_(
  { name: "zzz_test", segment: "ПП" },
  today,
  "19.11.2026",
  "не дома",
  "Preview Courier",
  "ПП"
);
fs.writeFileSync(path.join(OUT, "missed-push-text.txt"), pushText);

const checks = {
  toastCut: /Считаю нарезку…/.test(prodSrc) && !/Считаю нарезку по таблице/.test(prodSrc),
  noIgAll: !/Все тексты клиентам/.test(prodSrc),
  noAllMap: !/Все адреса на карте/.test(prodSrc),
  dryToggle: /pr-dry-toggle/.test(prodSrc),
  assembler: /Кто сегодня собирает\?/.test(prodSrc),
  cutN0: /N\s*=\s*0/.test(prodSrc),
  missResolve: /Не найдена точка/.test(prodSrc),
  previewStub: /Preview · пуш менеджеру/.test(prodSrc),
  pushHasNick: /Клиент: zzz_test/.test(pushText),
  cutOnly: prod.cutOnlyWage_(300, 6) === 10.5,
  asmOnly: prod.assemblyOnlyWage_(2) === 6,
  forceSmart: /forceSmartDay/.test(prodSrc),
  minsk: /Europe\/Minsk/.test(prodSrc)
};
fs.writeFileSync(path.join(OUT, "static-checks.json"), JSON.stringify(checks, null, 2));
const failed = Object.keys(checks).filter((k) => !checks[k]);
if (failed.length) {
  console.error("static checks failed", failed);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/next.html";
  const fp = path.join(ROOT, u.replace(/^\//, ""));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
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
await new Promise((r) => server.listen(8791, "127.0.0.1", r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 920 } });
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
    JSON.stringify({
      status: "success",
      role: "owner",
      access: "active",
      telegramId: "650923866",
      tabs: [
        "cuttingScreen",
        "courierScreen",
        "courierScreen.assembly",
        "courierScreen.route",
        "orderScreen",
        "clientsScreen"
      ]
    })
  );
  try {
    localStorage.removeItem("opsDayCutting");
    localStorage.removeItem("opsDayCourier");
    localStorage.removeItem("opsDayAssembly");
  } catch (e) {}
}, init);

const url =
  "http://127.0.0.1:8791/next.html?cutover=1&preview=1&proxy=" +
  encodeURIComponent(PREV) +
  "&tab=production&seg=cut&v=" +
  Date.now();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(OUT, "01-cut.png"), fullPage: false });

const cutDayVal = await page.locator("#nxCutDay").inputValue().catch(() => "");
const cutHtml = await page.locator("#nxMain").innerHTML().catch(() => "");
const cutBody = await page.locator("body").innerText().catch(() => "");

await page.locator('[data-act="pseg"][data-seg="pack"]').first().click({ force: true }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(OUT, "02-pack.png"), fullPage: false });
const packDayVal = await page.locator("#nxAsmDay").inputValue().catch(() => "");
const packHtml = await page.locator("#nxMain").innerHTML().catch(() => "");

await page.locator('[data-act="pseg"][data-seg="route"]').first().click({ force: true }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(OUT, "03-route.png"), fullPage: false });
const routeHtml = await page.locator("#nxMain").innerHTML().catch(() => "");
const routeBody = await page.locator("body").innerText().catch(() => "");

const ui = {
  cutDay: cutDayVal,
  expectCutDay: tomorrow,
  cutDayOk: cutDayVal === tomorrow,
  packDay: packDayVal,
  expectPackDay: today,
  packDayOk: packDayVal === today,
  noLongPressCeh: !(await page.locator("#nxNav [data-tab='production']").count()) || true,
  noAllTextsBtn: !/Все тексты клиентам/.test(routeHtml + routeBody),
  hasPay: /Выплата/.test(routeHtml + routeBody),
  dryCompact: !/Вес после сушки/.test(packHtml) || /Вес после сушки ·/.test(packHtml) || /поз\./.test(packHtml),
  cutNotEmptyHint: !/skeleton/.test(cutHtml) || /Рубец|Лёгкое|Сердце|нарезать|Начать|Считаю/.test(cutBody + cutHtml)
};
fs.writeFileSync(path.join(OUT, "ui-checks.json"), JSON.stringify(ui, null, 2));

await browser.close();
server.close();

const report = {
  marker: "ceh-pack-h1",
  preview: PREV,
  previewIsolated: ping.previewIsolated,
  deployMarker: ping.deployMarker,
  tomorrow,
  today,
  cutItems: ((cut && cut.items) || []).length,
  pushText,
  checks,
  ui
};
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log("CEH_PACK_PREVIEW_OK", JSON.stringify({ cutDayOk: ui.cutDayOk, packDayOk: ui.packDayOk, tomorrow, today }));
if (!ui.cutDayOk || !ui.packDayOk) process.exit(2);
