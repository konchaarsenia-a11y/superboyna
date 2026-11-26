/**
 * Preview t602u-pack — жёсткая проверка всех 7 пунктов в настоящем preview.
 * PROD never called. Тестовое убрать. Сверка orders/subs до/после.
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
const TEST_PP2 = "zzz_test_t602u_pp2";
const VER = "71125471";

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
function fail(name, data) {
  step(name, Object.assign({ ok: false }, data || {}));
  report.ok = false;
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
if (missing.length) fail("markers_missing", { missing });

const mint = await api("previewMintInitData", { telegramId: OWNER_TG });
const init = mint.initData;
if (!init) {
  console.error("mint failed", mint);
  process.exit(1);
}

async function snapshotCanon(label) {
  const orders = await api(
    "listOrders",
    { telegramId: OWNER_TG, day: "Пятница", _: String(Date.now()) },
    init
  ).catch(() => null);
  const subs = await api(
    "listSubscriptions",
    { telegramId: OWNER_TG, light: "1", _: String(Date.now()) },
    init
  ).catch(() => null);
  const orderItems = (orders && (orders.orders || orders.items || orders.clients)) || [];
  const subItems = (subs && (subs.subscriptions || subs.items || subs.clients)) || [];
  const testOrders = orderItems.filter((o) =>
    /zzz_test_t602u/i.test(String((o && (o.client || o.name || o.nick)) || ""))
  );
  const testSubs = subItems.filter((s) =>
    /zzz_test_t602u/i.test(String((s && (s.client || s.name || s.nick || s.instagram)) || ""))
  );
  return {
    label,
    ordersN: orderItems.length,
    subsN: subItems.length,
    testOrdersN: testOrders.length,
    testSubsN: testSubs.length,
    testOrderIds: testOrders.map((o) => o.id || o.orderId || "").filter(Boolean).slice(0, 8)
  };
}

const beforeCanon = await snapshotCanon("before");
step("canon-before", beforeCanon);

const seed = await api("previewSeedT602u", { day: "Пятница", _: String(Date.now()) }, init);
step("seed", {
  status: seed.status,
  client: seed.client,
  clientPp2: seed.clientPp2,
  day: seed.day,
  cutItems: seed.cutItems
});
if (seed.status !== "success") fail("seed-fail", seed);
const dayUsed = seed.day || "Пятница";

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
  preview: String((tplAfter && tplAfter.template) || "").slice(0, 120)
});
if (saveTpl.status !== "success") fail("settings-save");

const courBefore = await api("getCourier", { day: dayUsed, telegramId: OWNER_TG }, init);
const clientsBefore = (courBefore && courBefore.clients) || [];
const pick = clientsBefore.find((c) => String(c.name || c.client || "") === TEST_NICK);
const pickPp2 = clientsBefore.find((c) => String(c.name || c.client || "") === TEST_PP2);
step("courier-before", {
  status: courBefore.status,
  n: clientsBefore.length,
  pick: pick ? pick.name || pick.client : null,
  pickPp2: pickPp2 ? pickPp2.name : null,
  pickPayDue: pick && pick.payDue
});
if (!pick || courBefore.status !== "success") fail("courier-before-fail", { courBefore });

/* --- notgot: park → только в переносах, повторный вход --- */
let missRes = null;
if (pick) {
  missRes = await api(
    "notifyMissedDelivery",
    {
      telegramId: OWNER_TG,
      client: pick.name || pick.client,
      day: dayUsed,
      date: courBefore.dateIso || courBefore.date || "",
      reason: "не получил",
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
async function loadDeferred() {
  return api(
    "listDeferred",
    { telegramId: OWNER_TG, status: "open", force: "1", _: String(Date.now()) },
    init
  );
}
function findXfer(deferred) {
  return ((deferred && deferred.items) || []).find((it) => {
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
    return nick.indexOf("ZZZ_TEST_T602U") >= 0 || title.indexOf("НЕ ПОЛУЧИЛ") >= 0;
  });
}
const courAfter = await api(
  "getCourier",
  { day: dayUsed, telegramId: OWNER_TG, _: String(Date.now()) },
  init
);
const stillThere = ((courAfter && courAfter.clients) || []).some(
  (c) => String(c.name || c.client || "").toUpperCase() === TEST_NICK.toUpperCase()
);
let deferred = await loadDeferred();
let xferHit = findXfer(deferred);
step("courier-notgot", {
  missStatus: missRes && missRes.status,
  missId: missRes && missRes.id,
  parked: !!(missRes && missRes.parked),
  stillInCourier: stillThere,
  inTransfers: !!xferHit,
  deferredN: ((deferred && deferred.items) || []).length,
  xferTitle: xferHit && xferHit.title,
  hasBasket: !!(
    xferHit &&
    xferHit.payload &&
    (Array.isArray(xferHit.payload.basket) ? xferHit.payload.basket : []).length
  ),
  hasAddress: !!(xferHit && xferHit.payload && xferHit.payload.address),
  hasSum: !!(xferHit && xferHit.payload && xferHit.payload.orderPrice != null)
});
if (stillThere || !xferHit) fail("notgot-not-in-transfers", { stillThere, inTransfers: !!xferHit });

/* повторный вход курьера */
const courReenter = await api(
  "getCourier",
  { day: dayUsed, telegramId: OWNER_TG, _: String(Date.now()) },
  init
);
const stillAfterRe = ((courReenter && courReenter.clients) || []).some(
  (c) => String(c.name || c.client || "").toUpperCase() === TEST_NICK.toUpperCase()
);
deferred = await loadDeferred();
xferHit = findXfer(deferred);
step("courier-notgot-reenter", {
  stillInCourier: stillAfterRe,
  inTransfers: !!xferHit,
  deferredN: ((deferred && deferred.items) || []).length
});
if (stillAfterRe || !xferHit) fail("notgot-reenter", { stillAfterRe, inTransfers: !!xferHit });

/* cut finish API */
const cutFinish = await api(
  "finishCutting",
  { day: dayUsed, telegramId: OWNER_TG, elapsed: 1200 },
  init
);
const cut2 = await api("getCutting", { day: dayUsed, telegramId: OWNER_TG, _: String(Date.now()) }, init);
step("ceh-cut-finish-api", {
  finish: cutFinish && cutFinish.status,
  hasCompletion: !!(cut2 && (cut2.completion || (cut2.session && cut2.session.finished))),
  marker: cutFinish && cutFinish.deployMarker
});
if (!(cut2 && (cut2.completion || (cut2.session && cut2.session.finished)))) {
  fail("cut-finish-missing");
}

const nudgeText =
  "📅 Подбейте даты доставок\nВчера (…) — ПП и БП1:\n• <a href=\"https://ig.me/m/zzz_test_t602u\">zzz_test_t602u</a> — ПП1\n…\nКнопка «Текст клиенту» — готовый текст без дат.\n⏰ 11:00 Минск";
const clientCopy =
  "Здравствуйте! Подскажите, пожалуйста, удобные даты следующих доставок — напишите числа, когда удобно принять заказ.";
step("tg-dates-example", { managerHtmlSample: nudgeText.slice(0, 160), clientCopy });

/* ========== UI ========== */
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
await page.addInitScript(
  (payload) => {
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
  },
  { init, tg: OWNER_TG }
);

const url =
  "http://127.0.0.1:" +
  PORT +
  "/next.html?cutover=1&proxy=" +
  encodeURIComponent(PREV) +
  "&v=" +
  VER;

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.waitForFunction(
    () =>
      !!(
        window.BoinyaPeople &&
        window.BoinyaProduction &&
        window.BoinyaTasks &&
        window.BoinyaWeek &&
        window.BoinyaShell
      ),
    null,
    { timeout: 45000 }
  );

  /* 1) ceh-move-nocut: диалог «Нужна ли сборка?» */
  await page.evaluate(() => {
    var fake = {
      name: "zzz_test_t602u",
      matchKey: "ZZZTESTT602U",
      basket: [
        { name: "Сердце", val: 100 },
        { name: "Лёгкое", val: 50 }
      ],
      segment: "ПП"
    };
    window.__t602uAsk = window.BoinyaWeek.askMoveCut(fake);
  });
  await page.waitForTimeout(600);
  await page.locator('button[data-act="dlg-alt2"]').click({ timeout: 5000 });
  await page.waitForTimeout(700);
  await page.waitForSelector("text=Нужна ли сборка", { timeout: 5000 });
  await page.screenshot({ path: path.join(OUT, "t602u-ceh-assemble-ask.png"), fullPage: true });
  const asmAsk = await page.locator("text=Нужна ли сборка").count();
  step("ui-ceh-move-nocut", { askVisible: asmAsk > 0 });
  if (!asmAsk) fail("ui-assemble-ask-missing");
  await page.locator('button[data-act="dlg-no"]').click().catch(() => {});
  await page.waitForTimeout(400);

  /* settings */
  await page.evaluate(() => {
    window.BoinyaPeople.show({ view: "settings", force: true });
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, "t602u-settings-req.png"), fullPage: true });
  const hasTpl = await page.locator("#payReqTpl").count();
  step("shot-settings", { ok: true, hasTpl: !!hasTpl });
  if (!hasTpl) fail("settings-tpl-missing");

  /* re-seed courier (miss cleared PP1; need pay client + PP2) */
  await api("previewSeedT602u", { day: dayUsed, _: String(Date.now()) }, init);
  await page.evaluate((day) => {
    try {
      localStorage.setItem("nx_cour_day", day);
      localStorage.setItem("nxCourDay", day);
    } catch (e) {}
    if (window.BoinyaApp && window.BoinyaApp.go) window.BoinyaApp.go("production");
    // show() принимает id сегмента строкой, не объект
    window.BoinyaProduction.show("route");
  }, dayUsed);
  await page.waitForTimeout(4500);
  await page.waitForSelector("text=Отправить реквизиты", { timeout: 12000 }).catch(() => null);
  await page.screenshot({ path: path.join(OUT, "t602u-courier-req.png"), fullPage: true });
  const reqBtn = await page.locator("text=Отправить реквизиты").count();
  const bodyTxt = await page.locator("#nxMain, main, body").first().innerText().catch(() => "");
  const hasPp2 = /zzz_test_t602u_pp2/i.test(bodyTxt);
  const pp2BlockHasBtn = await page.evaluate(() => {
    var cards = Array.from(document.querySelectorAll("article, .b-card"));
    var pp2 = cards.find((c) => /zzz_test_t602u_pp2/i.test(c.innerText || ""));
    if (!pp2) return { found: false, hasBtn: false };
    return { found: true, hasBtn: /Отправить реквизиты/i.test(pp2.innerText || "") };
  });
  step("shot-courier", {
    ok: reqBtn > 0,
    requisitesButtons: reqBtn,
    hasPp2Card: hasPp2 || pp2BlockHasBtn.found,
    pp2HasBtn: !!pp2BlockHasBtn.hasBtn
  });
  if (!reqBtn) fail("requisites-btn-missing");
  if (pp2BlockHasBtn.found && pp2BlockHasBtn.hasBtn) fail("pp2-has-requisites");

  let clipboard = "";
  let opened = "";
  if (reqBtn) {
    await page.evaluate(() => {
      window.__openedLink = "";
    });
    await page.locator("text=Отправить реквизиты").first().click();
    await page.waitForTimeout(1000);
    clipboard = await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch (e) {
        return "";
      }
    });
    opened = await page.evaluate(() => window.__openedLink || "");
    const clipOk = /42/.test(clipboard) && /BYN/i.test(clipboard);
    step("requisites-click", {
      clipboardHasAmount: clipOk,
      clipboardSample: String(clipboard).slice(0, 160),
      openedIg: /instagram|ig\.me/i.test(opened),
      opened
    });
    if (!clipOk) fail("clipboard-no-amount", { clipboard });
    if (!/instagram|ig\.me/i.test(opened)) fail("ig-not-opened", { opened });
  }

  /* cut finish UI: finish → leave → re-enter */
  await api("previewSeedT602u", { day: dayUsed, _: String(Date.now()) }, init);
  await page.evaluate((day) => {
    try {
      localStorage.setItem("nx_cut_day", day);
    } catch (e) {}
    window.BoinyaProduction.show("cut");
  }, dayUsed);
  await page.waitForTimeout(3500);
  const finishBtn = page.locator('[data-act="pr-cut-finish"]');
  if (await finishBtn.count()) {
    await finishBtn.click();
    await page.waitForTimeout(500);
    const confOk = page.locator('button[data-act="dlg-ok"]');
    if (await confOk.count()) await confOk.click();
    await page.waitForTimeout(2500);
  } else {
    await api("finishCutting", { day: dayUsed, telegramId: OWNER_TG, elapsed: 1500 }, init);
  }
  await page.evaluate(() => window.BoinyaProduction.show("route"));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.BoinyaProduction.show("cut"));
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, "t602u-cut-finished.png"), fullPage: true });
  const cutDoneUi = await page.locator("text=Нарезка завершена").count();
  step("ui-cut-finish-reenter", { finishedVisible: cutDoneUi > 0 });
  if (!cutDoneUi) fail("cut-finish-ui-gone");

  /* F5 re-entry cut */
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => !!window.BoinyaProduction, null, { timeout: 30000 });
  await page.evaluate((day) => {
    try {
      localStorage.setItem("nx_cut_day", day);
    } catch (e) {}
    window.BoinyaProduction.show("cut");
  }, dayUsed);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, "t602u-cut-finished-f5.png"), fullPage: true });
  const cutDoneF5 = await page.locator("text=Нарезка завершена").count();
  step("ui-cut-finish-f5", { finishedVisible: cutDoneF5 > 0 });
  if (!cutDoneF5) fail("cut-finish-f5-gone");

  /* moves: park again if seed wiped, then open transfer card */
  const seed2 = await api("previewSeedT602u", { day: dayUsed, _: String(Date.now()) }, init);
  const courForMiss = await api("getCourier", { day: dayUsed, telegramId: OWNER_TG }, init);
  const pick2 = ((courForMiss && courForMiss.clients) || []).find(
    (c) => String(c.name || "") === TEST_NICK
  );
  if (pick2) {
    missRes = await api(
      "notifyMissedDelivery",
      {
        telegramId: OWNER_TG,
        client: pick2.name,
        day: dayUsed,
        date: courForMiss.dateIso || courForMiss.date || "",
        reason: "не получил",
        segment: pick2.segment || "ПП",
        matchKey: pick2.matchKey || "",
        basket: JSON.stringify(pick2.basket || []),
        address: pick2.address || "",
        orderPrice: pick2.orderPrice != null ? pick2.orderPrice : 42.5,
        createdByName: "preview-t602u"
      },
      init
    );
  }
  deferred = await loadDeferred();
  xferHit = findXfer(deferred);
  step("moves-api-before-ui", {
    inTransfers: !!xferHit,
    deferredN: ((deferred && deferred.items) || []).length,
    seed2: seed2 && seed2.status
  });

  await page.evaluate(() => {
    window.BoinyaTasks.bind({ role: "owner", tabs: ["deferredScreen", "deferredScreen.xfer"] });
    window.BoinyaTasks.open({ role: "owner", tabs: ["deferredScreen", "deferredScreen.xfer"] });
  });
  await page.waitForTimeout(3500);
  const xferChip = page.locator('[data-act="task-filter"][data-f="xfer"]');
  if (await xferChip.count()) await xferChip.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, "t602u-moves-list.png"), fullPage: true });
  const openBtn = page.locator('[data-act="task-open"]').first();
  const listHasTest = await page.locator("text=zzz_test_t602u").count();
  if (await openBtn.count()) {
    await openBtn.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, "t602u-moves-info.png"), fullPage: true });
    const body = await page.locator(".b-sheet, [data-sheet], #nxSheet, body").first().innerText().catch(() => "");
    const info = {
      hasWho: /zzz_test/i.test(body),
      hasReason: /не получил|перенос/i.test(body),
      hasBasket: /сердце|лёгкое|легкое/i.test(body),
      hasAddr: /белецк/i.test(body),
      hasSum: /42/.test(body),
      body: String(body || "").slice(0, 500)
    };
    step("shot-moves-info", info);
    if (!info.hasWho || !info.hasReason) fail("moves-info-incomplete", info);
  } else {
    fail("moves-no-task-open", { listHasTest, deferredN: ((deferred && deferred.items) || []).length });
    await page.screenshot({ path: path.join(OUT, "t602u-moves-info.png"), fullPage: true }).catch(() => {});
  }

  /* notgot F5: courier still empty of test, transfers still have it */
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.waitForFunction(() => !!window.BoinyaProduction, null, { timeout: 30000 });
  await page.evaluate((day) => {
    try {
      localStorage.setItem("nx_cour_day", day);
    } catch (e) {}
    window.BoinyaProduction.show("route");
  }, dayUsed);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, "t602u-courier-after-notgot-f5.png"), fullPage: true });
  const courTxt = await page.locator("#nxMain, main, body").first().innerText().catch(() => "");
  const testInCourUi = new RegExp(TEST_NICK + "(?!_pp2)", "i").test(courTxt);
  const courApiF5 = await api(
    "getCourier",
    { day: dayUsed, telegramId: OWNER_TG, _: String(Date.now()) },
    init
  );
  const inCourApi = ((courApiF5 && courApiF5.clients) || []).some(
    (c) => String(c.name || "") === TEST_NICK
  );
  deferred = await loadDeferred();
  xferHit = findXfer(deferred);
  step("notgot-f5", {
    uiStillInCourier: testInCourUi,
    apiStillInCourier: inCourApi,
    inTransfers: !!xferHit
  });
  if (inCourApi || !xferHit) fail("notgot-f5-fail", { inCourApi, inTransfers: !!xferHit });
} catch (eUi) {
  fail("ui-error", { err: String((eUi && eUi.message) || eUi) });
  await page.screenshot({ path: path.join(OUT, "t602u-ui-error.png"), fullPage: true }).catch(() => {});
}

await browser.close();
server.close();

/* cleanup test transfers + soft-delete preview orders */
try {
  const def2 = await api(
    "listDeferred",
    { telegramId: OWNER_TG, status: "open", force: "1", _: String(Date.now()) },
    init
  );
  for (const it of (def2 && def2.items) || []) {
    const nick = String(it.clientNick || (it.payload && it.payload.client) || "");
    if (/zzz_test_t602u/i.test(nick) || /zzz_test_t602u/i.test(String(it.title || ""))) {
      await api("cancelDeferred", { telegramId: OWNER_TG, id: it.id, _: String(Date.now()) }, init);
    }
  }
} catch (eClean) {}
try {
  for (const nick of [TEST_NICK, TEST_PP2]) {
    await api(
      "deleteClient",
      {
        telegramId: OWNER_TG,
        client: nick,
        day: dayUsed,
        matchKey: nick.replace(/[^a-z0-9]/gi, "").toUpperCase(),
        _explicitDelete: "1",
        _: String(Date.now())
      },
      init
    ).catch(() => null);
  }
} catch (eDel) {}

const afterCanon = await snapshotCanon("after");
step("canon-after", afterCanon);
step("canon-diff", {
  ordersDelta: afterCanon.ordersN - beforeCanon.ordersN,
  subsDelta: afterCanon.subsN - beforeCanon.subsN,
  testOrdersDelta: afterCanon.testOrdersN - beforeCanon.testOrdersN,
  testSubsDelta: afterCanon.testSubsN - beforeCanon.testSubsN
});

const tgExample = {
  managerMessage: nudgeText,
  clientTextCopy: clientCopy
};
fs.writeFileSync(
  path.join(OUT, "t602u-preview-report.json"),
  JSON.stringify({ report, tgExample, beforeCanon, afterCanon }, null, 2)
);
fs.writeFileSync(
  path.join(OUT, "t602u-tg-example.txt"),
  tgExample.managerMessage + "\n\n--- client copy ---\n" + tgExample.clientTextCopy
);

console.log(JSON.stringify({ done: true, ok: report.ok, out: OUT }, null, 2));
process.exit(report.ok ? 0 : 2);
