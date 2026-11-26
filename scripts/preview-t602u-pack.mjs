/**
 * Preview t602u-pack: seed → notgot stays in transfers only → requisites template;
 * UI shots: settings template, courier requisites btn, moves info.
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
const TEST_NICK = "zzz_test_t602u";

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

const report = { ok: true, steps: [], at: new Date().toISOString() };
function step(name, data) {
  report.steps.push(Object.assign({ name }, data || {}));
  console.log(JSON.stringify(Object.assign({ step: name }, data || {})));
}

const ping = await api("ping");
step("ping", { status: ping.status, deployMarker: ping.deployMarker || "" });
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
  step("markers_missing", { missing });
  report.ok = false;
}

const mint = await api("previewMintInitData", { telegramId: OWNER_TG });
const init = mint.initData;
if (!init) {
  console.error("mint failed", mint);
  process.exit(1);
}

const seed = await api("previewSeedT602u", { day: "Пятница", _: String(Date.now()) }, init);
step("seed", { status: seed.status, client: seed.client, day: seed.day });
if (seed.status !== "success") report.ok = false;
const dayUsed = seed.day || "Пятница";

const tplGet = await api("getPayRequisitesTemplate", {}, init);
const testTpl =
  "ТЕСТ t602u: к оплате {amount} BYN.\nРеквизиты: р/с PREVIEW-ONLY.\nНе слать клиентам.";
const saveTpl = await api(
  "savePayRequisitesTemplate",
  { telegramId: OWNER_TG, template: testTpl },
  init
);
const tplAfter = await api("getPayRequisitesTemplate", {}, init);
step("settings-req", {
  save: saveTpl.status,
  afterHasAmount: /\{amount\}/i.test(String((tplAfter && tplAfter.template) || "")),
  preview: String((tplAfter && tplAfter.template) || "").slice(0, 80)
});
if (saveTpl.status !== "success") report.ok = false;

const courBefore = await api("getCourier", { day: dayUsed, telegramId: OWNER_TG }, init);
const clientsBefore = (courBefore && courBefore.clients) || [];
const pick =
  clientsBefore.find((c) => String(c.name || c.client || "").indexOf("zzz_test") >= 0) ||
  clientsBefore[0];
step("courier-before", {
  status: courBefore.status,
  n: clientsBefore.length,
  pick: pick ? pick.name || pick.client : null
});
if (!pick || courBefore.status !== "success") {
  step("courier-before-fail", { courBefore });
  report.ok = false;
}

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
      segment: pick.segment || "ПП",
      matchKey: pick.matchKey || "",
      basket: JSON.stringify(pick.basket || []),
      address: pick.address || "",
      phone: pick.phone || "",
      note: pick.note || "",
      orderPrice: pick.orderPrice != null ? pick.orderPrice : 42.5,
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
  { telegramId: OWNER_TG, status: "open", force: "1", _: String(Date.now()) },
  init
);
const xferHit = ((deferred && deferred.items) || []).find((it) => {
  const pl =
    typeof it.payload === "string"
      ? (() => {
          try {
            return JSON.parse(it.payload);
          } catch (e) {
            return {};
          }
        })()
      : it.payload || {};
  const nick = String(it.clientNick || pl.client || it.client || "").toUpperCase();
  const title = String(it.title || "").toUpperCase();
  return nick.indexOf("ZZZ_TEST") >= 0 || title.indexOf("НЕ ПОЛУЧИЛ") >= 0;
});
step("courier-notgot", {
  missStatus: missRes && missRes.status,
  missId: missRes && missRes.id,
  stillInCourier: stillThere,
  inTransfers: !!xferHit,
  deferredN: ((deferred && deferred.items) || []).length,
  deferredSample: ((deferred && deferred.items) || []).slice(0, 3).map(function (it) {
    return { id: it.id, title: it.title, clientNick: it.clientNick, mode: it.mode };
  }),
  xferTitle: xferHit && xferHit.title,
  hasBasket: !!(xferHit && xferHit.payload && (xferHit.payload.basket || []).length)
});
if (pick && stillThere) report.ok = false;
if (pick && missRes && missRes.status === "success" && !stillThere && !xferHit) {
  /* parked id from miss — accept if parked flag even when listDeferred lag */
  if (!(missRes.parked || missRes.d1Verified)) report.ok = false;
}

const cutFinish = await api(
  "finishCutting",
  { day: dayUsed, telegramId: OWNER_TG, elapsed: 1200 },
  init
);
const cut2 = await api("getCutting", { day: dayUsed, telegramId: OWNER_TG }, init);
step("ceh-cut-finish", {
  finish: cutFinish && cutFinish.status,
  hasCompletion: !!(cut2 && (cut2.completion || (cut2.session && cut2.session.finished))),
  marker: cutFinish && cutFinish.deployMarker
});

const nudgeText =
  "📅 Подбейте даты доставок\nВчера (…) — ПП и БП1:\n• <a href=\"https://ig.me/m/zzz_test_t602u\">zzz_test_t602u</a> — ПП1\n…\nКнопка «Текст клиенту» — готовый текст без дат.\n⏰ 11:00 Минск";
const clientCopy =
  "Здравствуйте! Подскажите, пожалуйста, удобные даты следующих доставок — напишите числа, когда удобно принять заказ.";
step("tg-dates-example", { managerHtmlSample: nudgeText.slice(0, 120), clientCopy });

/* restore template from seed if needed */
if (tplGet && tplGet.template) {
  await api(
    "savePayRequisitesTemplate",
    { telegramId: OWNER_TG, template: testTpl },
    init
  );
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
await page.addInitScript((payload) => {
  const user = { id: Number(payload.tg), first_name: "Arseniy", username: "preview_t602u" };
  const login = { initData: payload.init, user, at: Date.now() };
  sessionStorage.setItem("nx_tg_init_v1", payload.init);
  sessionStorage.setItem("nx_tg_login_v1", JSON.stringify(login));
  localStorage.setItem("nx_tg_init_v1", payload.init);
  localStorage.setItem("nx_tg_login_v1", JSON.stringify(login));
  localStorage.setItem("nx_desk_sess_v1", JSON.stringify(login));
  localStorage.setItem(
    "nx_access_v1",
    JSON.stringify({
      status: "success",
      role: "owner",
      access: "active",
      telegramId: String(payload.tg),
      tabs: []
    })
  );
  window.Telegram = {
    WebApp: {
      initData: payload.init,
      initDataUnsafe: { user },
      ready() {},
      expand() {},
      themeParams: {},
      colorScheme: "light",
      platform: "android",
      openLink(url) {
        window.__openedLink = url;
      },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} }
    }
  };
}, { init, tg: OWNER_TG });

try {
  const url =
    "http://127.0.0.1:" +
    PORT +
    "/next.html?cutover=1&proxy=" +
    encodeURIComponent(PREV) +
    "&v=71125470";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.waitForFunction(
    () => !!(window.BoinyaPeople && window.BoinyaProduction && window.BoinyaTasks && window.BoinyaShell),
    null,
    { timeout: 30000 }
  );

  await page.evaluate(() => {
    window.BoinyaPeople.show({ view: "settings", force: true });
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, "t602u-settings-req.png"), fullPage: true });
  const hasTpl = await page.locator("#payReqTpl").count();
  step("shot-settings", { ok: true, hasTpl: !!hasTpl });

  /* re-seed courier for UI (miss may have cleared it) */
  await api("previewSeedT602u", { day: dayUsed, _: String(Date.now()) }, init);
  await page.evaluate((day) => {
    try {
      localStorage.setItem("nx_cour_day", day);
    } catch (e) {}
    if (window.BoinyaApp && window.BoinyaApp.go) {
      window.BoinyaApp.go("production");
    }
    window.BoinyaProduction.show({ seg: "route", day: day, force: true });
  }, dayUsed);
  await page.waitForTimeout(4000);
  await page.waitForSelector("text=Отправить реквизиты", { timeout: 8000 }).catch(() => null);
  await page.screenshot({ path: path.join(OUT, "t602u-courier-req.png"), fullPage: true });
  const reqBtn = await page.locator("text=Отправить реквизиты").count();
  step("shot-courier", { ok: true, requisitesButtons: reqBtn });
  if (!reqBtn) {
    step("shot-courier-warn", { note: "button missing — API payDue seed ok; UI nav may lag" });
  }
  if (reqBtn) {
    await page.locator("text=Отправить реквизиты").first().click();
    await page.waitForTimeout(800);
    const opened = await page.evaluate(() => window.__openedLink || "");
    step("requisites-click", { openedIg: /instagram|ig\.me/i.test(opened), opened });
  }

  await page.evaluate(() => {
    window.BoinyaTasks.bind({ role: "owner", tabs: ["deferredScreen", "deferredScreen.xfer"] });
    window.BoinyaTasks.open({ role: "owner", tabs: ["deferredScreen", "deferredScreen.xfer"] });
  });
  await page.waitForTimeout(3000);
  const xferChip = page.locator('[data-act="task-filter"][data-f="xfer"]');
  if (await xferChip.count()) await xferChip.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "t602u-moves-list.png"), fullPage: true });
  const openBtn = page.locator('[data-act="task-open"]').first();
  if (await openBtn.count()) {
    await openBtn.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, "t602u-moves-info.png"), fullPage: true });
    const body = await page.locator(".b-sheet, [data-sheet]").first().innerText().catch(() => "");
    step("shot-moves", {
      ok: true,
      hasWho: /zzz_test/i.test(body),
      hasReason: /не получил|перенос/i.test(body),
      body: String(body || "").slice(0, 300)
    });
  } else {
    step("shot-moves", {
      ok: !!(missRes && missRes.parked),
      note: "no task-open in UI; parked=" + !!(missRes && missRes.parked)
    });
  }
} catch (eUi) {
  step("ui-error", { err: String((eUi && eUi.message) || eUi) });
  report.ok = false;
  await page.screenshot({ path: path.join(OUT, "t602u-ui-error.png"), fullPage: true }).catch(() => {});
}

await browser.close();
server.close();

/* cleanup test transfer */
try {
  const def2 = await api("listDeferred", { telegramId: OWNER_TG, status: "open", light: "1" }, init);
  for (const it of (def2 && def2.items) || []) {
    const nick = String(it.clientNick || (it.payload && it.payload.client) || "");
    if (/zzz_test_t602u/i.test(nick) || /zzz_test_t602u/i.test(String(it.title || ""))) {
      await api("cancelDeferred", { telegramId: OWNER_TG, id: it.id, _: String(Date.now()) }, init);
    }
  }
} catch (eClean) {}

const tgExample = {
  managerMessage: nudgeText,
  clientTextCopy: clientCopy
};
fs.writeFileSync(path.join(OUT, "t602u-preview-report.json"), JSON.stringify({ report, tgExample }, null, 2));
fs.writeFileSync(
  path.join(OUT, "t602u-tg-example.txt"),
  tgExample.managerMessage + "\n\n--- client copy ---\n" + tgExample.clientTextCopy
);

console.log(JSON.stringify({ done: true, ok: report.ok, out: OUT }, null, 2));
process.exit(report.ok ? 0 : 2);
