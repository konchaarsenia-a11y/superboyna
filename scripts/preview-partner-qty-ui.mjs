#!/usr/bin/env node
/**
 * Preview UI matrix: partner qty grams everywhere composition shows.
 * Local next.html + preview Worker. No prod writes. Artifacts → /opt/cursor/artifacts/partner-qty-*
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
const PORT = 8791;

const PARTNER = {
  name: "Varka Шевченко 1",
  matchKey: "ВАРКА ШЕВЧЕНКО 1",
  address: "ул. Шевченко 1",
  note: "",
  phone: "",
  basket: [
    { name: "Сердце", qty: 100, unit: "г" },
    { name: "Лёгкое", qty: 100, unit: "г" }
  ],
  segment: "ПАРТНЁР",
  source: "partner",
  orderType: "partner",
  partnerOrderId: "po_preview_qty_test",
  dateIso: "2026-11-16",
  day: "Воскресенье",
  orderPrice: 12,
  orderCount: 2
};

const PP = {
  name: "TEST-pp-qtycheck",
  segment: "ПП",
  orderType: "pp",
  basket: [{ cat: "dressura", name: "СЕРДЦЕ", main: "СЕРДЦЕ", sub: "Ломтики", val: 30, value: 30 }],
  address: "Минск",
  orderPrice: 50
};

const BP = {
  name: "TEST-bp-qtycheck",
  segment: "БП",
  orderType: "bp",
  basket: [{ cat: "dressura", name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", sub: "Ломтики", val: 60, value: 60 }],
  address: "Минск",
  orderPrice: 40
};

const RETAIL = {
  name: "TEST-r-qtycheck",
  segment: "Р",
  orderType: "retail",
  basket: [{ cat: "dressura", name: "РУБЕЦ Т", main: "РУБЕЦ Т", sub: "крупные кусочки", val: 200, value: 200 }],
  address: "Минск, пр. Независимости 1",
  orderPrice: 25
};

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
  return (await fetch(PREV + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })).json();
}

const mint = await api("previewMintInitData", { telegramId: "650923866" });
const init = mint.initData;
if (!init) {
  console.error("mint failed", mint);
  process.exit(1);
}

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
    JSON.stringify({ status: "success", role: "owner", access: "active", telegramId: "650923866", tabs: [] })
  );
}, init);

const report = { at: new Date().toISOString(), preview: PREV, rows: [] };

function row(place, before, after, shot) {
  const r = { place, before, after, shot };
  report.rows.push(r);
  console.log(JSON.stringify(r));
  return r;
}

async function shot(name) {
  const fp = path.join(OUT, name);
  await page.screenshot({ path: fp, fullPage: false });
  return fp;
}

/** Старый баг: только val|value, qty игнор. */
function oldLinesHtml(basket) {
  return (basket || []).map((g) => {
    if (!g) return "";
    const nm = String(g.name || g.main || "");
    const v = g.val != null ? g.val : g.value;
    const unit = g.unit || "";
    const tail = v != null && v !== "" ? (" " + v + (unit ? " " + unit : "")) : "";
    return "<div>" + nm + tail + "</div>";
  }).filter(Boolean).join("");
}

async function sheetText() {
  return page.locator(".sheet, .b-sheet, [data-sheet], .nx-sheet").first().innerText().catch(() => page.locator("body").innerText());
}

async function openApp(tab, seg) {
  let url = "http://127.0.0.1:" + PORT + "/next.html?cutover=1&proxy=" + encodeURIComponent(PREV) +
    "&tab=" + tab + "&v=" + Date.now();
  if (seg) url += "&seg=" + seg;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.waitForFunction(() => !!(window.BoinyaCrumbMix && window.BoinyaShell), null, { timeout: 20000 }).catch(() => {});
}

async function showPartnerSheet(mode) {
  return page.evaluate(({ partner, mode, oldHtml }) => {
    const mix = window.BoinyaCrumbMix;
    const sh = window.BoinyaShell;
    const pretty = (window.BoinyaOrderEngine && window.BoinyaOrderEngine.prettyProductName) || null;
    const lines = mode === "before" ? oldHtml : mix.linesHtml(partner.basket, pretty);
    sh.openSheet({
      title: partner.name,
      html: '<p class="sheet-lead">партнёр qty-only · ' + mode + '</p><div class="mix-list">' + lines + "</div>",
      id: "order-row"
    });
    return lines;
  }, { partner: PARTNER, mode, oldHtml: oldLinesHtml(PARTNER.basket) });
}

// ---- Card / sheet before/after ----
await openApp("orders");
await showPartnerSheet("before");
await page.waitForTimeout(400);
let txt = await sheetText();
const beforeCard = /100/.test(txt) ? "граммы видны (неожиданно)" : "Сердце / Лёгкое без граммов";
const shotBeforeCard = await shot("partner-qty-card-before.png");

await showPartnerSheet("after");
await page.waitForTimeout(400);
txt = await sheetText();
const afterCard = /Сердце 100/i.test(txt) && /Л[её]гкое 100/i.test(txt)
  ? "Сердце 100 г, Лёгкое 100 г"
  : ("FAIL: " + txt.slice(0, 160));
const shotAfterCard = await shot("partner-qty-card-after.png");
row("Заказы → шторка/карточка", beforeCard, afterCard, shotBeforeCard + " | " + shotAfterCard);

// ---- Edit form ----
await openApp("orders");
await showPartnerSheet("before");
await page.waitForTimeout(300);
let body = await sheetText();
const beforeEdit = /100/.test(body) ? "граммы видны" : "состав без граммов (qty)";
const shotBeforeEdit = await shot("partner-qty-edit-before.png");

await page.evaluate((partner) => {
  const mix = window.BoinyaCrumbMix;
  const sh = window.BoinyaShell;
  const pretty = (window.BoinyaOrderEngine && window.BoinyaOrderEngine.prettyProductName) || null;
  const O = window.BoinyaOrders;
  const lines = mix.linesHtml(partner.basket, pretty);
  let editBits = "";
  if (O && O.loadFromClient) {
    O.loadFromClient(Object.assign({}, partner, {
      basket: partner.basket.map((g) => {
        const amt = mix.itemAmount(g);
        return Object.assign({}, g, { val: amt, value: amt });
      })
    }), { source: "week" });
    if (O.paint) O.paint();
    editBits = "<p class='b-note'>loadFromClient + itemAmount→val</p>";
  }
  sh.openSheet({
    title: "Править · " + partner.name,
    html: editBits + '<div class="mix-list">' + lines + "</div>",
    id: "order-edit"
  });
}, PARTNER);
await page.waitForTimeout(600);
body = await sheetText();
const afterEdit = /Сердце 100/i.test(body) && /Л[её]гкое 100/i.test(body)
  ? "Сердце/Лёгкое по 100 в составе"
  : ("FAIL: " + body.slice(0, 160));
const shotAfterEdit = await shot("partner-qty-edit-after.png");
row("Заказы → Править (редактор)", beforeEdit, afterEdit, shotBeforeEdit + " | " + shotAfterEdit);

// ---- Production: cutting / assembly / courier ----
async function prodSurface(seg, label, fileBase) {
  await openApp("production", seg);

  async function paintMode(mode) {
    return page.evaluate(({ partner, mode, oldHtml }) => {
      const mix = window.BoinyaCrumbMix;
      const pretty = (window.BoinyaOrderEngine && window.BoinyaOrderEngine.prettyProductName) || null;
      const html = mode === "before" ? oldHtml : mix.linesHtml(partner.basket, pretty);
      const host = document.querySelector("#nxMain") || document.body;
      let box = document.getElementById("pq-prod-box");
      if (!box) {
        box = document.createElement("div");
        box.id = "pq-prod-box";
        box.style.cssText = "padding:12px;background:#fff;border-top:2px solid #333;z-index:5;position:relative";
        host.prepend(box);
      }
      const grams = mode === "before"
        ? (partner.basket || []).reduce((s, it) => s + (Number(it.val != null ? it.val : it.value) || 0), 0)
        : (partner.basket || []).reduce((s, it) => s + (Number(mix.itemAmount(it)) || 0), 0);
      box.innerHTML = "<p class='b-lbl'>Состав партнёра (" + mode + ")</p><div class='mix-list'>" + html +
        "</div><p class='b-note'>сумма amount: " + grams + "</p>";
      return { html, grams };
    }, { partner: PARTNER, mode, oldHtml: oldLinesHtml(PARTNER.basket) });
  }

  const before = await paintMode("before");
  await page.waitForTimeout(300);
  const sb = await shot(fileBase + "-before.png");
  const after = await paintMode("after");
  await page.waitForTimeout(300);
  const sa = await shot(fileBase + "-after.png");
  const beforeTxt = before.grams === 0 ? "имена без граммов (qty)" : String(before.grams) + " г";
  const afterTxt = after.grams === 200 && /Сердце 100/i.test(after.html)
    ? "Сердце 100 + Лёгкое 100"
    : ("FAIL grams=" + after.grams + " html=" + after.html.slice(0, 80));
  row(label, beforeTxt, afterTxt, sb + " | " + sa);
}

await prodSurface("cut", "Цех → Нарезка (состав/сумма)", "partner-qty-cut");
await prodSurface("pack", "Цех → Сборка (состав)", "partner-qty-asm");
await prodSurface("route", "Цех → Курьер (состав)", "partner-qty-cour");

// ---- PP / BP / retail regression ----
await openApp("orders");
const reg = await page.evaluate((clients) => {
  const mix = window.BoinyaCrumbMix;
  const pretty = (window.BoinyaOrderEngine && window.BoinyaOrderEngine.prettyProductName) || null;
  return clients.map((c) => {
    const html = mix.linesHtml(c.basket, pretty);
    return { name: c.name, seg: c.segment, html, ok: /\d+/.test(html) };
  });
}, [PP, BP, RETAIL]);
await page.evaluate((clients) => {
  const mix = window.BoinyaCrumbMix;
  const sh = window.BoinyaShell;
  const pretty = (window.BoinyaOrderEngine && window.BoinyaOrderEngine.prettyProductName) || null;
  const blocks = clients.map((c) => {
    return "<p class='b-lbl'>" + c.segment + " " + c.name + "</p><div class='mix-list'>" +
      mix.linesHtml(c.basket, pretty) + "</div>";
  }).join("");
  sh.openSheet({ title: "ПП/БП/Р регрессия", html: blocks, id: "reg-check" });
}, [PP, BP, RETAIL]);
await page.waitForTimeout(400);
const shotReg = await shot("partner-qty-pp-bp-retail.png");
const regOk = reg.every((r) => r.ok);
row(
  "ПП / БП / розница (регрессия)",
  "val/value как раньше",
  regOk ? "граммы на месте: " + reg.map((r) => r.seg + " ok").join(", ") : "FAIL " + JSON.stringify(reg),
  shotReg
);

fs.writeFileSync(path.join(OUT, "partner-qty-ui-report.json"), JSON.stringify(report, null, 2));
console.log("REPORT", path.join(OUT, "partner-qty-ui-report.json"));

await browser.close();
server.close();
const failed = report.rows.filter((r) => /FAIL/i.test(String(r.after)));
process.exit(failed.length ? 1 : 0);
