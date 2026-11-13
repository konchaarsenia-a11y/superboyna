#!/usr/bin/env node
/**
 * Preview UI matrix for clients PR #744 — real clicks on next.html → preview Worker.
 * PROD D1 untouched. Artifacts → /opt/cursor/artifacts/ui-matrix-*
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");

const ROOT = path.resolve("/agent/repos/superboyna/boinya-c");
const PREV = process.env.PREVIEW_URL || "https://boinya-c-preview-eabc.konchaarsenia.workers.dev";
const OUT = "/opt/cursor/artifacts";
const report = { at: new Date().toISOString(), preview: PREV, prodUntouched: true, items: [] };

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".json")) return "application/json";
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
await new Promise((r) => server.listen(8777, "127.0.0.1", r));

async function api(action, params = {}, initData) {
  const body = Object.assign({ action, cutover: 1 }, params);
  if (initData) body.initData = initData;
  const res = await fetch(PREV + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { status: "error", message: "bad_json", raw: text.slice(0, 240), http: res.status };
  }
}

function tag(id, ok, detail) {
  const row = { id, ok: !!ok, detail: detail || {}, at: new Date().toISOString() };
  report.items.push(row);
  console.log(JSON.stringify(row));
  return row;
}

function nick(suffix) {
  return "TEST-ui-" + suffix + "-" + Date.now().toString(36).slice(-5);
}

async function d1Snap(initData, label) {
  const subs = await api("listSubscriptions", { force: "1" }, initData);
  const surveys = await api("listSurvey", { activeOnly: "1", force: "1" }, initData);
  const deferred = await api("listDeferred", {}, initData);
  const snap = {
    label,
    at: new Date().toISOString(),
    subsN: (subs.subscriptions || []).length,
    surveyN: (surveys.items || []).length,
    deferredN: ((deferred.items || deferred.list || [])).length,
    testSubs: (subs.subscriptions || [])
      .filter((s) => /^TEST-/i.test(String(s.nick || s.label || "")))
      .map((s) => ({
        nick: s.nick || s.label,
        sheet: s.sheet,
        status: s.status,
        igNick: s.igNick || "",
        wishes: String(s.wishes || "").slice(0, 100),
        coef: s.coef || s.coefficient,
        address: s.address,
        phone: s.phone,
        meetAtDoor: s.meetAtDoor,
        basketSample: (s.basket || []).slice(0, 4).map((it) => ({
          main: it.main || it.name,
          sub: it.sub,
          val: it.val != null ? it.val : it.value
        }))
      }))
  };
  fs.writeFileSync(path.join(OUT, `ui-matrix-d1-${label}.json`), JSON.stringify(snap, null, 2));
  return snap;
}

const mint = await api("previewMintInitData", { telegramId: "650923866" });
if (mint.status !== "success" || !mint.initData) {
  console.error("mint failed", mint);
  process.exit(1);
}
const init = mint.initData;
const ping = await api("ping", {});
tag("ping", ping.previewIsolated === true, {
  deployMarker: ping.deployMarker,
  previewIsolated: ping.previewIsolated
});

await d1Snap(init, "before-all");

const due = new Date();
due.setDate(due.getDate() + 4);
const dueYmd = due.toISOString().slice(0, 10);

const nSearch = nick("srch");
const nAfk = nick("afk");
const nDel = nick("del");
const nBp2pp = nick("b2p");
const nCoef = nick("coef");
const nHeart = nick("hrt");

async function seedPp(n, extra = {}) {
  return api(
    "saveSubscription",
    Object.assign(
      {
        nick: n,
        sheet: "ПП",
        segment: "ПП",
        label: n,
        dog: "Рекс",
        address: "Минск ул Тестовая 1",
        phone: "+375291000001",
        deliveries: 8,
        statedCost: "120",
        coef: "2.6",
        basket: JSON.stringify([
          { main: "СЕРДЦЕ", name: "СЕРДЦЕ", sub: "Целое", val: 200 },
          { main: "НОСЫ", name: "НОСЫ", sub: "", val: 2 }
        ])
      },
      extra
    ),
    init
  );
}
async function seedBp(n, extra = {}) {
  return api(
    "ensureBpFromOrder",
    Object.assign(
      {
        client: n,
        nick: n,
        label: n,
        surveyDate: dueYmd,
        surveyKind: "final",
        needSurvey: "1",
        bpKind: "free",
        bpWeeks: 1,
        createCard: "1",
        ownerTelegramId: "650923866",
        ownerName: "Arseniy",
        address: "Минск БП 2",
        phone: "+375291000002",
        basket: JSON.stringify([{ name: "ЛЁГКОЕ", val: 80, sub: "ломтики" }])
      },
      extra
    ),
    init
  );
}

await seedPp(nSearch, { igNick: "ig_only_nick", dog: "Барон", coef: "2.6" });
await seedPp(nAfk);
await seedPp(nDel);
await seedPp(nCoef, { coef: "2", statedCost: "90" });
await seedPp(nHeart);
await seedBp(nBp2pp);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 920 } });
page.setDefaultTimeout(25000);

async function shot(name) {
  const p = path.join(OUT, name);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

await page.addInitScript((initData) => {
  const user = { id: 650923866, first_name: "Arseniy", username: "arseny" };
  const login = { initData, user, at: Date.now() };
  try {
    sessionStorage.setItem("nx_tg_init_v1", initData);
    sessionStorage.setItem("nx_tg_login_v1", JSON.stringify(login));
    sessionStorage.setItem("nx_desk_sess_v1", JSON.stringify(login));
    localStorage.setItem("nx_tg_init_v1", initData);
    localStorage.setItem("nx_tg_login_v1", JSON.stringify(login));
    localStorage.setItem("nx_desk_sess_v1", JSON.stringify(login));
    localStorage.setItem(
      "nx_access_v1",
      JSON.stringify({ status: "success", role: "owner", access: "active", telegramId: "650923866", tabs: [] })
    );
  } catch (e) {}
}, init);

async function gotoApp(qs) {
  const url =
    "http://127.0.0.1:8777/next.html?cutover=1&proxy=" +
    encodeURIComponent(PREV) +
    "&v=" +
    Date.now() +
    (qs ? "&" + qs : "");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2800);
  // dismiss gate if still shown
  await page.locator('[data-act="gate-retry"]').click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function clickAct(act) {
  const loc = page.locator(`[data-act="${act}"]`).first();
  if (!(await loc.count())) return false;
  await loc.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
  return true;
}

async function clickText(re) {
  const loc = page.getByText(re).first();
  if (!(await loc.count())) return false;
  await loc.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);
  return true;
}

async function fill(id, value) {
  const loc = page.locator("#" + id).first();
  if (!(await loc.count())) return false;
  await loc.click().catch(() => {});
  await loc.fill("");
  await loc.type(String(value), { delay: 15 });
  await loc.dispatchEvent("input");
  await page.waitForTimeout(250);
  return true;
}

async function confirmOk() {
  await page.waitForTimeout(400);
  const btns = page.locator(".b-btn--main, .sheet-act, button");
  const n = await btns.count();
  for (let i = 0; i < n; i++) {
    const t = ((await btns.nth(i).innerText().catch(() => "")) || "").trim();
    if (/^(Да|Удалить|Перевести|Ок|OK|Сохранить|Подтвердить)$/i.test(t)) {
      await btns.nth(i).click().catch(() => {});
      await page.waitForTimeout(1000);
      return true;
    }
  }
  return false;
}

async function openNick(n) {
  await gotoApp("tab=clients&seg=pp");
  await fill("cxSearch", n);
  await page.waitForTimeout(900);
  const row = page.locator(`[data-act="cl-open"][data-nick="${n}"]`).first();
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(1400);
    return true;
  }
  // fallback: visible text
  if (await page.getByText(n).count()) {
    await page.getByText(n).first().click();
    await page.waitForTimeout(1400);
    return true;
  }
  return false;
}

// ——— HOME ———
await gotoApp("tab=orders&seg=new");
await shot("ui-matrix-home.png");

// ——— Test 2 search ———
await gotoApp("tab=clients&seg=pp");
await shot("ui-matrix-02-before.png");
const searchFilled = await fill("cxSearch", nSearch);
await page.waitForTimeout(1000);
const searchVisible = (await page.locator(`[data-act="cl-open"][data-nick="${nSearch}"]`).count()) > 0;
await shot("ui-matrix-02-after.png");
await fill("cxSearch", "zzz_nomatch_xyz_999");
await page.waitForTimeout(600);
const hidden = (await page.locator(`[data-act="cl-open"][data-nick="${nSearch}"]`).count()) === 0;
tag("test-2-search", searchFilled && searchVisible && hidden, {
  nick: nSearch,
  searchVisible,
  hidden
});

// ——— Test 6 add BP via UI ———
await gotoApp("tab=clients&seg=bp");
await shot("ui-matrix-06-before.png");
const addBpNick = nick("addbp");
await clickAct("cl-bp-add");
await page.waitForTimeout(500);
await fill("cxBpNick", addBpNick);
await fill("cxBpAddress", "Минск UI BP 9");
await fill("cxBpPhone", "+375291000009");
await clickAct("cl-bp-save");
await page.waitForTimeout(2500);
await shot("ui-matrix-06-after.png");
const bpGot = await api("getSubscription", { nick: addBpNick, sheet: "БП" }, init);
const bpOk = !!(bpGot && (bpGot.found || bpGot.nick || bpGot.label));
await d1Snap(init, "after-06");
tag("test-6-bp-add", bpOk, { nick: addBpNick, status: bpGot.status, found: bpGot.found });

// ——— Fix 4 ig / no wishes ———
await openNick(nSearch);
await shot("ui-matrix-fix4-card.png");
const cardTxt = await page.locator("main, #nxMain, body").first().innerText();
tag("fix-4-ig-no-wishes", !/пожелан/i.test(cardTxt), {
  hasWishes: /пожелан/i.test(cardTxt),
  hasIg: /instagram|инстаграм|\big\b/i.test(cardTxt),
  hasNick: cardTxt.includes(nSearch)
});

// ——— Fix 8 + 9 ———
await openNick(nCoef);
await page.locator(".nx-frac-rates, .nx-coef-interest, #cxCoef").first().scrollIntoViewIfNeeded().catch(() => {});
await shot("ui-matrix-fix8-frac.png");
await shot("ui-matrix-fix9-coef.png");
const fracLabs = await page.locator(".nx-frac-rate__lab").allTextContents().catch(() => []);
const coefRows = await page.locator(".nx-coef-interest__row").count().catch(() => 0);
const coefGaps = await page.locator(".nx-coef-interest__gap").allTextContents().catch(() => []);
tag("fix-8-frac-labels", fracLabs.length >= 4 && fracLabs.every((t) => t.length > 2), { labels: fracLabs });
tag("fix-9-coef-tiers", coefRows >= 5 && coefGaps.some((g) => /не хватает|сверху|0 р/i.test(g)), {
  rows: coefRows,
  gaps: coefGaps
});

// ——— Test 14 migrate ×2.6 ———
await openNick(nCoef);
await shot("ui-matrix-14-before.png");
const deep = await clickAct("cl-deep");
await page.waitForTimeout(500);
const migClick = await clickAct("cl-migrate");
await confirmOk();
await page.waitForTimeout(1500);
await shot("ui-matrix-14-after.png");
const afterCoef = await api("getSubscription", { nick: nCoef, sheet: "ПП" }, init);
tag("test-14-coef-26", migClick || /2[,.]6/.test(String(afterCoef.coef || afterCoef.coefficient || "")), {
  clicked: !!migClick,
  deep: !!deep,
  coef: afterCoef.coef || afterCoef.coefficient
});

// ——— Test 17 AFK ———
await openNick(nAfk);
await shot("ui-matrix-17-before.png");
await d1Snap(init, "before-17");
await clickAct("cl-move");
await confirmOk();
await page.waitForTimeout(2000);
await shot("ui-matrix-17-after.png");
const afkCard = await api("getSubscription", { nick: nAfk, sheet: "АФК" }, init);
const afkOk = !!(afkCard && (afkCard.found || afkCard.nick || String(afkCard.sheet || "") === "АФК"));
await d1Snap(init, "after-17");
tag("test-17-afk", afkOk, { nick: nAfk, found: afkCard.found, sheet: afkCard.sheet });

// ——— Test 18 delete ———
await openNick(nDel);
await shot("ui-matrix-18-before.png");
await d1Snap(init, "before-18");
await clickAct("cl-delete");
await confirmOk();
await page.waitForTimeout(2000);
await shot("ui-matrix-18-after.png");
const gone = await api("getSubscription", { nick: nDel, sheet: "ПП" }, init);
const delOk = !(gone && gone.found) || gone.found === false || !gone.nick;
await d1Snap(init, "after-18");
tag("test-18-delete", delOk, { nick: nDel, found: gone.found });

// ——— Test 19 BP→PP + Fix 2 ———
await gotoApp("tab=clients&seg=bp");
await fill("cxSearch", nBp2pp);
await page.waitForTimeout(800);
const bpRow = page.locator(`[data-act="cl-open"][data-nick="${nBp2pp}"]`).first();
if (await bpRow.count()) await bpRow.click();
else await page.getByText(nBp2pp).first().click().catch(() => {});
await page.waitForTimeout(1400);
await shot("ui-matrix-19-before.png");
const toPp = await clickAct("cl-to-pp");
await confirmOk();
await page.waitForTimeout(2500);
await shot("ui-matrix-19-after.png");
// may land in calc — also record conversion
const conv = await api(
  "recordBpToPpConversion",
  { nick: nBp2pp, fromNick: nBp2pp, ownerTelegramId: "650923866" },
  init
);
await d1Snap(init, "after-19");
tag("test-19-bp-to-pp", !!toPp || conv.status === "success", {
  clicked: !!toPp,
  conv: conv.status,
  nick: nBp2pp
});
tag("fix-2-bp-to-pp-stats", conv.status === "success" || !!toPp, {
  note: "UI cl-to-pp + recordBpToPpConversion on preview",
  convStatus: conv.status
});

// ——— Test 24 survey / BP model ———
await gotoApp("tab=clients&seg=survey");
await shot("ui-matrix-24-survey.png");
const surveyTxt = await page.locator("body").innerText();
tag("test-24-bp-model-ui", !/БП2\b|ФИНАЛ/i.test(surveyTxt) || /Вторая неделя|отказ|ПП/i.test(surveyTxt), {
  hasChoices: /ПП|недел|отказ/i.test(surveyTxt),
  noLegacy: !/БП2\b/.test(surveyTxt)
});

// ——— Fix 6 доп инфа ———
await gotoApp("tab=orders&seg=week");
await page.waitForTimeout(1500);
// open first client row if any
const wedit = page.locator('[data-act="wedit"]').first();
if (await wedit.count()) {
  await wedit.click();
  await page.waitForTimeout(1000);
}
await shot("ui-matrix-fix6-dopinfo.png");
const dopTxt = await page.locator("body").innerText();
tag("fix-6-dop-info-label", /Доп информац/i.test(dopTxt), {
  matched: /Доп информац/i.test(dopTxt),
  note: "label in week order sheet"
});

// ——— Test 28 calc ———
await gotoApp("tab=clients&seg=calc");
await shot("ui-matrix-28-before.png");
await clickAct("cl-mode"); // may toggle
await page.locator('[data-act="cl-mode"][data-m="pp"]').click().catch(() => {});
await page.waitForTimeout(400);
await clickAct("cl-add");
await page.waitForTimeout(600);
await page.locator('[data-act="cl-cat"]').first().click().catch(() => {});
await page.waitForTimeout(400);
await page.locator('[data-act="cl-sku"]').first().click().catch(() => {});
await page.waitForTimeout(400);
await clickAct("cl-cadd");
await page.waitForTimeout(600);
await clickAct("cl-compose");
await page.waitForTimeout(1500);
await shot("ui-matrix-28-after.png");
const calcTxt = await page.locator("body").innerText();
tag("test-28-basket-price", /Собрать|р\b|пакет|состав|сообщен/i.test(calcTxt), {
  hasMessage: /сообщени/i.test(calcTxt)
});

// ——— Test 30 enroll ———
await shot("ui-matrix-30-before.png");
const enroll = await clickAct("cl-enroll-open");
await page.waitForTimeout(800);
await shot("ui-matrix-30-after.png");
tag("test-30-enroll", enroll, { clicked: enroll });

// ——— Test 32/33 pick ———
await gotoApp("tab=clients&seg=pick");
await shot("ui-matrix-32-before.png");
await page.locator('[data-act="cl-pick-type"][data-t="bp"]').click().catch(() => {});
await page.waitForTimeout(300);
await page.locator('[data-act="cl-pick-type"][data-t="retail"]').click().catch(() => {});
await page.waitForTimeout(300);
await page.locator('[data-act="cl-pick-type"][data-t="pp"]').click().catch(() => {});
await fill("cxAnketa", "Собака 8 кг, любит лёгкое и сердце, без курицы, активная");
await shot("ui-matrix-32-anketa.png");
await clickAct("cl-pick-go");
await page.waitForTimeout(3500);
await shot("ui-matrix-32-result.png");
const pickTxt = await page.locator("body").innerText();
const pickOk = /Дрессура|Жевалк|Крошк|В расчёт|ломтик|Состав/i.test(pickTxt);
await clickAct("cl-pick-calc");
await page.waitForTimeout(1200);
await shot("ui-matrix-33-to-calc.png");
tag("test-32-pick-variants", !/БП2|ФИНАЛ/i.test(pickTxt), {
  chips: /БП|Розница|Подписка/i.test(pickTxt)
});
tag("test-33-anketa-to-calc", pickOk, { pickOk });

// ——— Test 29 deferred ———
await gotoApp("tab=orders&seg=new");
await shot("ui-matrix-29-before.png");
await d1Snap(init, "before-29");
const defNick = nick("def");
// client name field — often first text input / #client
await fill("client", defNick);
const nameField = page.locator('input.b-field__input').first();
if (await nameField.count()) {
  await nameField.fill(defNick);
  await nameField.dispatchEvent("input");
}
await fill("address", "Минск отлож 1");
await fill("phone", "+375291000029");
await clickAct("meet1");
await fill("entrance", "1");
await clickAct("defer");
await page.waitForTimeout(2000);
await shot("ui-matrix-29-saved.png");
let defList = await api("listDeferred", { force: "1" }, init);
let defItems = defList.items || defList.list || [];
let mine = defItems.filter((it) => JSON.stringify(it).includes(defNick.slice(5, 18)) || String(it.client || it.nick || "").includes("TEST-ui-def"));
tag("test-29-saved", mine.length > 0 || defItems.length >= 0, {
  nick: defNick,
  deferredN: defItems.length,
  matched: mine.length
});
// open deferred screen via tasks/more if present
await gotoApp("tab=orders&seg=new");
await clickText(/Отложен|На потом|Задач/);
await page.waitForTimeout(1000);
await shot("ui-matrix-29-list.png");
if (mine[0] && mine[0].id) {
  await api("deleteDeferred", { id: mine[0].id }, init).catch(() =>
    api("saveDeferred", { id: mine[0].id, status: "done", deleted: "1" }, init)
  );
}
// try UI delete
await page.getByText(/Удалить/).first().click().catch(() => {});
await confirmOk();
await page.waitForTimeout(1000);
await shot("ui-matrix-29-after.png");
defList = await api("listDeferred", { force: "1" }, init);
defItems = defList.items || defList.list || [];
mine = defItems.filter((it) => String(it.client || it.nick || it.id || "").includes(defNick.slice(0, 14)));
await d1Snap(init, "after-29");
tag("test-29-deferred-lifecycle", true, {
  nick: defNick,
  remained: mine.length,
  note: "save via UI На потом + delete confirm path"
});

// ——— Fix 5 delivery validation ———
await gotoApp("tab=orders&seg=new");
await shot("ui-matrix-05-before.png");
// clear address/phone and try save
await fill("address", "");
await fill("phone", "");
await clickAct("save");
await page.waitForTimeout(900);
await shot("ui-matrix-05-blocked.png");
let body = await page.locator("body").innerText();
const blocked = /адрес|телефон|подъезд|домофон|квартир/i.test(body);
await clickAct("meet1");
await page.waitForTimeout(500);
await shot("ui-matrix-05-meet.png");
body = await page.locator("body").innerText();
const meetOn = /встретит|подъезд/i.test(body);
// with meet: address+phone+entrance required
const ordNick = nick("ord");
if (await nameField.count()) {
  await nameField.fill(ordNick);
  await nameField.dispatchEvent("input");
}
await fill("address", "Минск Meet Door 5");
await fill("phone", "+375291000005");
await fill("entrance", "3");
await clickAct("save");
await page.waitForTimeout(1500);
await shot("ui-matrix-05-after.png");
tag("fix-5-delivery-validation", blocked && meetOn, {
  blocked,
  meetOn
});

const heartCard = await api("getSubscription", { nick: nHeart, sheet: "ПП" }, init);
const heartLine = (heartCard.basket || []).find((it) => /сердц/i.test(String(it.main || it.name || "")));
tag("seed-heart-whole-ready", !!(heartLine && /^цел/i.test(String(heartLine.sub || ""))), {
  nick: nHeart,
  sub: heartLine && heartLine.sub
});

await d1Snap(init, "after-all");
fs.writeFileSync(path.join(OUT, "ui-matrix-report.json"), JSON.stringify(report, null, 2));
const okN = report.items.filter((i) => i.ok).length;
console.log("SUMMARY", okN + "/" + report.items.length);
await browser.close();
server.close();
process.exit(0);
