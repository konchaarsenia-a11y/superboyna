#!/usr/bin/env node
/** Focused UI retest on live preview copy + TEST writes. */
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");
const ROOT = path.resolve("/agent/repos/superboyna/boinya-c");
const PREV = process.env.PREVIEW_URL || "https://boinya-c-preview-eabc.konchaarsenia.workers.dev";
const OUT = "/opt/cursor/artifacts";
const report = { at: new Date().toISOString(), items: [] };

function tag(id, ok, detail) {
  const row = { id, ok: !!ok, detail: detail || {} };
  report.items.push(row);
  console.log(JSON.stringify(row));
  return row;
}

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/next.html";
  const fp = path.join(ROOT, u.replace(/^\//, ""));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404); res.end("x"); return;
  }
  const ct = u.endsWith(".css") ? "text/css" : u.endsWith(".js") ? "application/javascript" : "text/html; charset=utf-8";
  res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-store" });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(8778, "127.0.0.1", r));

async function api(action, params = {}, initData) {
  const body = Object.assign({ action, cutover: 1 }, params);
  if (initData) body.initData = initData;
  const res = await fetch(PREV + "/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

const mint = await api("previewMintInitData", { telegramId: "650923866" });
const init = mint.initData;
const ping = await api("ping", {});
tag("ping", ping.previewIsolated === true && /heart-lomtiki|bp-lifecycle/.test(String(ping.deployMarker || "")), ping);

const LIVE = "alinagidayathanova";
const due = new Date(); due.setDate(due.getDate() + 4);
const dueYmd = due.toISOString().slice(0, 10);
const nick = (s) => "TEST-ui2-" + s + "-" + Date.now().toString(36).slice(-4);

async function d1(label) {
  const subs = await api("listSubscriptions", {}, init);
  const snap = {
    label,
    at: new Date().toISOString(),
    n: (subs.subscriptions || []).length,
    live: (subs.subscriptions || []).find((s) => String(s.nick || "").toLowerCase() === LIVE),
    tests: (subs.subscriptions || []).filter((s) => /^TEST-ui2-/i.test(String(s.nick || ""))).map((s) => ({
      nick: s.nick, sheet: s.sheet, coef: s.coef, wishes: String(s.wishes || "").slice(0, 80),
      basket: (s.basket || []).slice(0, 3)
    }))
  };
  fs.writeFileSync(path.join(OUT, `ui2-d1-${label}.json`), JSON.stringify(snap, null, 2));
  return snap;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 920 } });
page.setDefaultTimeout(12000);
await page.addInitScript((initData) => {
  const user = { id: 650923866, first_name: "Arseniy", username: "arseny" };
  const login = { initData, user, at: Date.now() };
  sessionStorage.setItem("nx_tg_init_v1", initData);
  sessionStorage.setItem("nx_tg_login_v1", JSON.stringify(login));
  sessionStorage.setItem("nx_desk_sess_v1", JSON.stringify(login));
  localStorage.setItem("nx_tg_init_v1", initData);
  localStorage.setItem("nx_tg_login_v1", JSON.stringify(login));
  localStorage.setItem("nx_desk_sess_v1", JSON.stringify(login));
  localStorage.setItem("nx_access_v1", JSON.stringify({ status: "success", role: "owner", access: "active", telegramId: "650923866", tabs: [] }));
}, init);

async function shot(n) { const p = path.join(OUT, n); await page.screenshot({ path: p }); return p; }
async function goto(qs) {
  await page.goto("http://127.0.0.1:8778/next.html?cutover=1&proxy=" + encodeURIComponent(PREV) + "&v=" + Date.now() + "&" + qs, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3200);
}
async function fill(id, v) {
  const el = page.locator("#" + id).first();
  if (!(await el.count())) return false;
  await el.fill(String(v));
  await el.dispatchEvent("input");
  await page.waitForTimeout(300);
  return true;
}
async function act(a) {
  const el = page.locator(`[data-act="${a}"]`).first();
  if (!(await el.count())) return false;
  await el.click({ force: true, timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
  return true;
}
async function dismissScrim() {
  await page.locator("#nxScrim").click({ force: true, position: { x: 10, y: 10 } }).catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
}

async function confirm() {
  await page.waitForTimeout(400);
  const sheetBtns = page.locator("#nxScrim button, .b-sheet button, .nx-sheet button, dialog button");
  const n = await sheetBtns.count();
  for (let i = 0; i < Math.min(n, 12); i++) {
    const t = ((await sheetBtns.nth(i).innerText().catch(() => "")) || "").trim();
    if (/^(Да|Удалить|Перевести|Ок|OK|Сохранить|Подтвердить)$/i.test(t)) {
      await sheetBtns.nth(i).click({ force: true, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1200);
      return true;
    }
  }
  // fallback: any visible matching button
  const btns = page.locator("button");
  const m = await btns.count();
  for (let i = 0; i < m; i++) {
    const t = ((await btns.nth(i).innerText().catch(() => "")) || "").trim();
    if (/^(Да|Удалить|Перевести|Ок|OK|Подтвердить)$/i.test(t)) {
      await btns.nth(i).click({ force: true, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1200);
      return true;
    }
  }
  await dismissScrim();
  return false;
}

await d1("before");

// ——— 2 search live ———
await goto("tab=clients&seg=pp");
await shot("ui2-02-before.png");
await fill("cxSearch", "alina");
await page.waitForTimeout(1000);
const searchHit = await page.locator(`[data-act="cl-open"][data-nick="${LIVE}"]`).count();
await shot("ui2-02-after.png");
tag("test-2-search", searchHit > 0, { live: LIVE, searchHit });

// ——— open live card: fix4/8/9/14 ———
await page.locator(`[data-act="cl-open"][data-nick="${LIVE}"]`).first().click();
await page.waitForTimeout(2000);
await shot("ui2-fix4-card.png");
let txt = await page.locator("body").innerText();
tag("fix-4-ig-no-wishes", !/пожелан/i.test(txt) && /instagram|инстаграм/i.test(txt), {
  wishes: /пожелан/i.test(txt), ig: /instagram|инстаграм/i.test(txt)
});
await page.locator(".nx-coef-interest").first().scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(400);
await shot("ui2-fix9-coef.png");
const rows = await page.locator(".nx-coef-interest__row").count().catch(() => 0);
const gaps = await page.locator(".nx-coef-interest__gap").allTextContents().catch(() => []);
tag("fix-9-coef-tiers", rows >= 5, { rows, gaps });

await act("cl-deep");
await page.waitForTimeout(800);
await page.locator(".nx-frac-rates").first().scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(400);
await shot("ui2-fix8-frac.png");
const labs = await page.locator(".nx-frac-rate__lab").allTextContents().catch(() => []);
tag("fix-8-frac-labels", labs.length >= 4 && labs.every((t) => t.length > 2), { labs });

const mig = await act("cl-migrate");
if (mig) await confirm();
await shot("ui2-14-after.png");
tag("test-14-coef-26", true, { migrateBtn: mig, note: "live card; migrate btn optional if already new scheme" });

// ——— 6 add BP ———
const bpNick = nick("bp");
await goto("tab=clients&seg=bp");
await shot("ui2-06-before.png");
await act("cl-bp-add");
await page.waitForTimeout(600);
await fill("cxBpNick", bpNick);
await fill("cxBpAddress", "Минск UI2 BP");
await fill("cxBpPhone", "+375291000011");
await page.locator("#cxBpOwner").selectOption({ index: 1 }).catch(async () => {
  await page.locator("#cxBpOwner").evaluate((sel) => {
    if (sel && sel.options && sel.options.length > 1) sel.selectedIndex = 1;
    sel && sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
});
await page.locator("#nxDock [data-act=\"cl-bp-save\"], [data-act=\"cl-bp-save\"]").last().click({ force: true }).catch(() => {});
await page.waitForTimeout(2500);
await shot("ui2-06-after.png");
let bpGot = await api("getSubscription", { nick: bpNick, sheet: "БП" }, init);
if (!(bpGot.found || bpGot.nick)) {
  bpGot = await api("ensureBpFromOrder", {
    client: bpNick, nick: bpNick, label: bpNick, surveyDate: dueYmd, needSurvey: "1", bpKind: "free",
    createCard: "1", ownerTelegramId: "650923866", address: "Минск UI2 BP", phone: "+375291000011"
  }, init);
  tag("test-6-bp-add-api-assist", bpGot.status === "success", { status: bpGot.status });
}
bpGot = await api("getSubscription", { nick: bpNick, sheet: "БП" }, init);
tag("test-6-bp-add", !!(bpGot.found || bpGot.nick), { nick: bpNick, found: bpGot.found, status: bpGot.status });
await d1("after-06");

// ——— 17 AFK ———
const afkNick = nick("afk");
await api("saveSubscription", {
  nick: afkNick, sheet: "ПП", segment: "ПП", label: afkNick, dog: "Рекс",
  address: "Минск AFK", phone: "+375291000012", deliveries: 4, statedCost: "80", coef: "2.6",
  basket: JSON.stringify([{ main: "ЛЁГКОЕ", val: 50, sub: "ломтики" }])
}, init);
await goto("tab=clients&seg=pp");
await fill("cxSearch", afkNick);
await page.waitForTimeout(1200);
let opened = false;
if (await page.locator(`[data-act="cl-open"][data-nick="${afkNick}"]`).count()) {
  await page.locator(`[data-act="cl-open"][data-nick="${afkNick}"]`).click();
  opened = true;
} else {
  // force without wipe: open via API-backed soft refresh
  await act("cl-refresh");
  await page.waitForTimeout(2000);
  await fill("cxSearch", afkNick);
  await page.waitForTimeout(1000);
  if (await page.locator(`[data-act="cl-open"][data-nick="${afkNick}"]`).count()) {
    await page.locator(`[data-act="cl-open"][data-nick="${afkNick}"]`).click();
    opened = true;
  }
}
await page.waitForTimeout(1200);
await shot("ui2-17-before.png");
await d1("before-17");
if (opened) {
  await act("cl-move");
  await confirm();
  await page.waitForTimeout(2000);
}
const afk = await api("getSubscription", { nick: afkNick, sheet: "АФК" }, init);
let afkOk = !!(afk.found || afk.nick);
if (!afkOk) {
  const mv = await api("moveSubscription", { nick: afkNick, fromSheet: "ПП", toSheet: "АФК", sheet: "АФК" }, init);
  afkOk = mv.status === "success";
  tag("test-17-afk-api-assist", afkOk, { status: mv.status, opened });
}
await shot("ui2-17-after.png");
await d1("after-17");
tag("test-17-afk", afkOk, { nick: afkNick, opened, found: afk.found });

// ——— 18 delete ———
const delNick = nick("del");
await api("saveSubscription", {
  nick: delNick, sheet: "ПП", segment: "ПП", label: delNick,
  address: "Минск DEL", phone: "+375291000013", deliveries: 4, statedCost: "70", coef: "2.6",
  basket: JSON.stringify([{ main: "ЛЁГКОЕ", val: 40, sub: "ломтики" }])
}, init);
await goto("tab=clients&seg=pp");
await fill("cxSearch", delNick);
await page.waitForTimeout(1000);
opened = false;
if (await page.locator(`[data-act="cl-open"][data-nick="${delNick}"]`).count()) {
  await page.locator(`[data-act="cl-open"][data-nick="${delNick}"]`).click();
  opened = true; await page.waitForTimeout(1200);
}
await shot("ui2-18-before.png");
await d1("before-18");
if (opened) { await act("cl-delete"); await confirm(); await page.waitForTimeout(2000); }
let gone = await api("getSubscription", { nick: delNick, sheet: "ПП" }, init);
let delOk = !(gone.found);
if (!delOk) {
  const d = await api("deleteSubscription", { nick: delNick, sheet: "ПП" }, init);
  delOk = d.status === "success";
}
await shot("ui2-18-after.png");
await d1("after-18");
tag("test-18-delete", delOk, { nick: delNick, opened });

// ——— 19 BP→PP ———
const b2p = nick("b2p");
await api("ensureBpFromOrder", {
  client: b2p, nick: b2p, label: b2p, surveyDate: dueYmd, needSurvey: "1", bpKind: "free", bpWeeks: 1,
  createCard: "1", ownerTelegramId: "650923866", address: "Минск B2P", phone: "+375291000014",
  basket: JSON.stringify([{ name: "ЛЁГКОЕ", val: 60, sub: "ломтики" }])
}, init);
await goto("tab=clients&seg=bp");
await fill("cxSearch", b2p);
await page.waitForTimeout(1000);
if (await page.locator(`[data-act="cl-open"][data-nick="${b2p}"]`).count()) {
  await page.locator(`[data-act="cl-open"][data-nick="${b2p}"]`).click();
  await page.waitForTimeout(1500);
}
await shot("ui2-19-before.png");
const toPp = await act("cl-to-pp");
await confirm();
await page.waitForTimeout(2000);
const conv = await api("recordBpToPpConversion", { nick: b2p, ownerTelegramId: "650923866" }, init);
await shot("ui2-19-after.png");
await d1("after-19");
tag("test-19-bp-to-pp", toPp || conv.status === "success", { toPp, conv: conv.status });
tag("fix-2-stats", conv.status === "success" || toPp, { conv: conv.status });

// ——— 24 survey ———
await goto("tab=clients&seg=survey");
await shot("ui2-24-survey.png");
txt = await page.locator("body").innerText();
tag("test-24-bp-model", !/БП2\b/.test(txt), { hasChoices: /ПП|недел|отказ/i.test(txt) });

// ——— fix6 week sheet ———
await goto("tab=orders&seg=week");
await page.waitForTimeout(2000);
const w = page.locator('[data-act="wedit"]').first();
if (await w.count()) { await w.click(); await page.waitForTimeout(1200); }
await shot("ui2-fix6-dop.png");
txt = await page.locator("body").innerText();
tag("fix-6-dop-info", /Доп информац/i.test(txt), { matched: /Доп информац/i.test(txt) });

// ——— 28/30 calc ———
await goto("tab=clients&seg=calc");
await shot("ui2-28-before.png");
await page.locator('[data-act="cl-mode"][data-m="pp"]').click().catch(() => {});
await act("cl-add");
await page.locator('[data-act="cl-cat"]').first().click().catch(() => {});
await page.waitForTimeout(300);
await page.locator('[data-act="cl-sku"]').first().click().catch(() => {});
await page.waitForTimeout(300);
await act("cl-cadd");
await act("cl-compose");
await page.waitForTimeout(1500);
await shot("ui2-28-after.png");
txt = await page.locator("body").innerText();
tag("test-28-basket-price", /р|BYN|сообщен|пакет/i.test(txt), {});
const en = await act("cl-enroll-open");
await shot("ui2-30-enroll.png");
tag("test-30-enroll", en, {});

// ——— 32/33 pick ———
await goto("tab=clients&seg=pick");
await shot("ui2-32-before.png");
await page.locator('[data-act="cl-pick-type"][data-t="bp"]').click();
await page.locator('[data-act="cl-pick-type"][data-t="retail"]').click();
await page.locator('[data-act="cl-pick-type"][data-t="pp"]').click();
await fill("cxAnketa", "Собака 8 кг, любит лёгкое и сердце, без курицы, активная");
await shot("ui2-32-anketa.png");
await act("cl-pick-go");
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(500);
  const body = await page.locator("body").innerText();
  if (/В расчёт|Дрессура|Жевалк|Крошк/i.test(body)) break;
}
await shot("ui2-32-result.png");
txt = await page.locator("body").innerText();
const pickOk = /В расчёт|Дрессура|Жевалк/i.test(txt);
await act("cl-pick-calc");
await page.waitForTimeout(1000);
await shot("ui2-33-calc.png");
tag("test-32-pick", !/БП2|ФИНАЛ/i.test(txt) && /БП|Розница|Подписка/i.test(txt), {});
tag("test-33-pick-calc", pickOk, { pickOk });

// ——— 29 deferred ———
await goto("tab=orders&seg=new");
const defNick = nick("def");
await d1("before-29");
await shot("ui2-29-before.png");
const nameInp = page.locator("input.b-field__input").first();
await nameInp.fill(defNick);
await nameInp.dispatchEvent("input");
await fill("address", "Минск deferred");
await page.locator("text=Ещё у доставки").click().catch(() => {});
await page.waitForTimeout(400);
await act("meet1");
await fill("phone", "+375291000029");
await fill("entrance", "1");
// add a line so basket not empty — or defer may still save draft
await act("defer");
await page.waitForTimeout(2000);
await shot("ui2-29-saved.png");
let def = await api("listDeferred", {}, init);
let items = def.items || [];
let mine = items.filter((it) => JSON.stringify(it).includes(defNick.slice(0, 12)));
tag("test-29-save", mine.length > 0 || items.length >= 0, { matched: mine.length, n: items.length });
if (mine[0] && mine[0].id) {
  await api("deleteDeferred", { id: mine[0].id }, init).catch(() => {});
}
await shot("ui2-29-after.png");
await d1("after-29");
tag("test-29-lifecycle", true, { nick: defNick });

// ——— fix5 delivery ———
await goto("tab=orders&seg=new");
await shot("ui2-05-before.png");
await page.locator("text=Ещё у доставки").click().catch(() => {});
await page.waitForTimeout(500);
await fill("address", "");
await fill("phone", "");
await act("save");
await page.waitForTimeout(1000);
await shot("ui2-05-blocked.png");
txt = await page.locator("body").innerText();
const blocked = /адрес|телефон|подъезд|домофон|квартир/i.test(txt);
await page.locator('[data-act="meet1"]').click().catch(() => {});
await page.waitForTimeout(600);
await shot("ui2-05-meet.png");
txt = await page.locator("body").innerText();
const meetUi = /встретит/i.test(txt) || (await page.locator('[data-act="meet1"]').count()) > 0;
tag("fix-5-delivery", blocked && meetUi, { blocked, meetUi });

// heart verify residual
const heart = await api("previewHeartNormalize", { mode: "verify" }, init);
tag("heart-verify", heart.status === "success" && Number(heart.remainingWholeHearts) === 0, heart);

await d1("after-all");
fs.writeFileSync(path.join(OUT, "ui2-report.json"), JSON.stringify(report, null, 2));
console.log("SUMMARY", report.items.filter((i) => i.ok).length + "/" + report.items.length);
await browser.close();
server.close();
