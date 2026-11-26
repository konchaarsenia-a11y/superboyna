/**
 * Preview t602u-pack: RO ping + markers; mutate only preview D1 (template, miss park, cut finish);
 * compare courier list before/after notgot; UI shots: transfers, requisites btn, settings template.
 * PROD never called.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../boinya-c");
const PREV = process.env.PREVIEW_URL || "https://boinya-c-preview-eabc.konchaarsenia.workers.dev";
const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts";
const PORT = 8798;
const OWNER_TG = "650923866";

fs.mkdirSync(OUT, { recursive: true });

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/next.html";
  const fp = path.join(ROOT, u.replace(/^\//, ""));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("missing");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(fp), "Cache-Control": "no-store" });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

async function api(action, params = {}, initData) {
  const body = Object.assign({ action, cutover: 1 }, params);
  if (initData) body.initData = initData;
  const res = await fetch(PREV + "/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 CursorT602u/1.0"
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

const report = { ok: true, steps: [] };
function step(name, data) {
  report.steps.push(Object.assign({ name }, data || {}));
  console.log(JSON.stringify(Object.assign({ step: name }, data || {})));
}

const ping = await api("ping");
step("ping", {
  status: ping.status,
  deployMarker: ping.deployMarker || ping.marker || "",
  peopleCanon: ping.peopleCanon || ""
});
const markers = String(ping.deployMarker || "");
const need = [
  "ceh-move-nocut-h1",
  "ceh-cut-finish-h1",
  "courier-notgot-h1",
  "moves-info-h1",
  "courier-req-h1",
  "settings-req-h1",
  "tg-dates-msg-h1"
];
const missing = need.filter((m) => markers.indexOf(m) < 0);
if (missing.length) {
  step("markers_missing", { missing, markers });
  report.ok = false;
}

const mint = await api("previewMintInitData", { telegramId: OWNER_TG });
const init = mint.initData;
if (!init) {
  console.error("mint failed", mint);
  process.exit(1);
}

const tplBefore = await api("getPayRequisitesTemplate", {}, init);
const testTpl =
  "ТЕСТ t602u: к оплате {amount} BYN.\nРеквизиты: р/с PREVIEW-ONLY.\nНе слать клиентам.";
const saveTpl = await api(
  "savePayRequisitesTemplate",
  { telegramId: OWNER_TG, template: testTpl },
  init
);
const tplAfter = await api("getPayRequisitesTemplate", {}, init);
step("settings-req", {
  beforeLen: String((tplBefore && tplBefore.template) || "").length,
  save: saveTpl.status,
  afterHasAmount: /\{amount\}/i.test(String((tplAfter && tplAfter.template) || "")),
  afterPreview: String((tplAfter && tplAfter.template) || "").slice(0, 80)
});
if (saveTpl.status !== "success") report.ok = false;

/* restore previous template if it had content */
if (tplBefore && tplBefore.template && String(tplBefore.template) !== testTpl) {
  await api(
    "savePayRequisitesTemplate",
    { telegramId: OWNER_TG, template: tplBefore.template },
    init
  );
  step("settings-req-restore", { ok: true });
}

const days = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
let dayUsed = "Пятница";
let courBefore = null;
for (let i = 0; i < days.length; i++) {
  const c = await api("getCourier", { day: days[i], telegramId: OWNER_TG }, init);
  if (c && c.status === "success" && (c.clients || []).length) {
    dayUsed = days[i];
    courBefore = c;
    break;
  }
}
const clientsBefore = (courBefore && courBefore.clients) || [];
const pick =
  clientsBefore.find((c) => !c.delivered && Number(c.orderPrice || c.price || 0) > 0) ||
  clientsBefore.find((c) => !c.delivered) ||
  clientsBefore[0];
step("courier-before", {
  day: dayUsed,
  n: clientsBefore.length,
  pick: pick ? pick.name || pick.client : null
});

let missRes = null;
if (pick) {
  missRes = await api(
    "notifyMissedDelivery",
    {
      telegramId: OWNER_TG,
      client: pick.name || pick.client,
      day: dayUsed,
      date: courBefore.date || courBefore.dateIso || "",
      reason: "preview-t602u-notgot",
      segment: pick.segment || "",
      matchKey: pick.matchKey || "",
      basket: JSON.stringify(pick.basket || []),
      address: pick.address || "",
      phone: pick.phone || "",
      note: pick.note || "",
      orderPrice: pick.orderPrice != null ? pick.orderPrice : "",
      createdByName: "preview-t602u"
    },
    init
  );
}
const courAfter = await api("getCourier", { day: dayUsed, telegramId: OWNER_TG }, init);
const clientsAfter = (courAfter && courAfter.clients) || [];
const stillThere = pick
  ? clientsAfter.some((c) => {
      const a = String(c.name || c.client || "").toUpperCase();
      const b = String(pick.name || pick.client || "").toUpperCase();
      return a && b && a === b;
    })
  : false;
const deferred = await api(
  "listDeferred",
  { telegramId: OWNER_TG, status: "open", light: "1" },
  init
);
const xferHit = ((deferred && deferred.items) || []).find((it) => {
  const pl = typeof it.payload === "string" ? (() => { try { return JSON.parse(it.payload); } catch (e) { return {}; } })() : (it.payload || {});
  const nick = String(it.clientNick || pl.client || it.client || "").toUpperCase();
  const want = String((pick && (pick.name || pick.client)) || "").toUpperCase();
  return want && nick.indexOf(want.split(/\s/)[0]) >= 0 && /перенос|не получил/i.test(String(it.title || ""));
});
step("courier-notgot", {
  missStatus: missRes && missRes.status,
  stillInCourier: stillThere,
  inTransfers: !!xferHit,
  xferId: xferHit && xferHit.id
});
if (pick && stillThere) report.ok = false;

/* cut finish persist smoke on same day if cutting exists */
const cut1 = await api("getCutting", { day: dayUsed, telegramId: OWNER_TG }, init);
let cutFinish = null;
if (cut1 && cut1.status === "success") {
  cutFinish = await api(
    "finishCutting",
    { day: dayUsed, telegramId: OWNER_TG, elapsed: 1000 },
    init
  );
  const cut2 = await api("getCutting", { day: dayUsed, telegramId: OWNER_TG }, init);
  step("ceh-cut-finish", {
    finish: cutFinish && cutFinish.status,
    hasCompletion: !!(cut2 && (cut2.completion || (cut2.session && cut2.session.finished))),
    marker: cutFinish && cutFinish.deployMarker
  });
}

const nudgeDry = await api("stageNNudge", { dry: "1", slot: "11" }, init).catch(() => null);
const nudgeAlt = nudgeDry || (await api("stageNCron", { dry: "1", kind: "date_nudge" }, init).catch(() => null));
step("tg-dates-preview", {
  status: nudgeAlt && nudgeAlt.status,
  hasClientText: !!(nudgeAlt && (nudgeAlt.clientText || (nudgeAlt.slots && nudgeAlt.slots[0] && nudgeAlt.slots[0].clientText))),
  sample: nudgeAlt && nudgeAlt.slots && nudgeAlt.slots[0]
    ? String(nudgeAlt.slots[0].textHtml || nudgeAlt.slots[0].text || "").slice(0, 200)
    : ""
});

/* UI screenshots against local next.html + preview API */
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ["clipboard-read", "clipboard-write"]
});
await context.addInitScript((payload) => {
  window.Telegram = {
    WebApp: {
      initData: payload.init,
      initDataUnsafe: { user: { id: Number(payload.tg), first_name: "Preview", username: "preview_t602u" } },
      ready() {},
      expand() {},
      themeParams: {},
      platform: "android",
      openLink(url) { window.__openedLink = url; }
    }
  };
  localStorage.setItem("superboyna_tg_id", payload.tg);
  window.__BOINYA_FORCE_API__ = payload.api;
}, { init, tg: OWNER_TG, api: PREV });

const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("PAGE_ERR", msg.text());
});
await page.goto("http://127.0.0.1:" + PORT + "/next.html?cutover=1&v=71125470", {
  waitUntil: "domcontentloaded",
  timeout: 60000
});
await page.waitForTimeout(2500);

/* Settings: requisites template */
try {
  await page.evaluate(() => {
    if (window.BoinyaPeople && window.BoinyaPeople.show) {
      window.BoinyaPeople.show({ view: "settings", force: true });
    }
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "t602u-settings-req.png"), fullPage: true });
  step("shot-settings", { ok: true });
} catch (eSet) {
  step("shot-settings", { ok: false, err: String(eSet && eSet.message) });
}

/* Courier route for requisites button */
try {
  await page.evaluate((day) => {
    if (window.BoinyaProduction && window.BoinyaProduction.show) {
      window.BoinyaProduction.show({ seg: "route", day: day, force: true });
    }
  }, dayUsed);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, "t602u-courier-req.png"), fullPage: true });
  const hasBtn = await page.locator("text=Отправить реквизиты").count();
  step("shot-courier", { ok: true, requisitesButtons: hasBtn });
} catch (eCour) {
  step("shot-courier", { ok: false, err: String(eCour && eCour.message) });
}

/* Transfers sheet */
try {
  await page.evaluate(() => {
    if (window.BoinyaTasks && window.BoinyaTasks.open) {
      const acc = window.__nxAccess || { role: "owner", tabs: ["deferredScreen"] };
      window.BoinyaTasks.open(acc);
    }
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, "t602u-moves-list.png"), fullPage: true });
  const openBtn = page.locator('[data-act="task-open"]').first();
  if (await openBtn.count()) {
    await openBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, "t602u-moves-info.png"), fullPage: true });
  }
  step("shot-moves", { ok: true });
} catch (eMv) {
  step("shot-moves", { ok: false, err: String(eMv && eMv.message) });
}

await browser.close();
server.close();

const tgExample = {
  managerMessage:
    "📅 Подбейте даты доставок\nВчера (…) с галочкой «доставлен» — ПП и БП1:\n\nПП (n):\n• <a href=\"https://ig.me/m/nick\">nick</a> — ПП1\n…\nКнопка «Текст клиенту» — готовый текст без дат.\n⏰ 11:00 Минск",
  clientTextCopy:
    "Здравствуйте! Подскажите, пожалуйста, удобные даты следующих доставок — напишите числа, когда удобно принять заказ."
};
fs.writeFileSync(path.join(OUT, "t602u-preview-report.json"), JSON.stringify({ report, tgExample }, null, 2));
fs.writeFileSync(path.join(OUT, "t602u-tg-example.txt"), tgExample.managerMessage + "\n\n--- client copy ---\n" + tgExample.clientTextCopy);

console.log(JSON.stringify({ done: true, ok: report.ok, out: OUT }, null, 2));
process.exit(report.ok ? 0 : 2);
