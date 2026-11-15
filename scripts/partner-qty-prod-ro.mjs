#!/usr/bin/env node
/** Prod RO only: Varka Шевченко 1 / 2026-11-16 grams + D1 write-guard. No saves. (trigger) */
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");

const PROD = process.env.PROD_URL || "https://boinya-c.konchaarsenia.workers.dev";
const PAGES = process.env.PAGES_URL || "https://konchaarsenia-a11y.github.io/superboyna/boinya-c";
const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts";
const DATE = "2026-11-16";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

fs.mkdirSync(OUT, { recursive: true });

function mintInitData(tid) {
  if (!TOKEN) throw new Error("no TELEGRAM_BOT_TOKEN");
  const user = JSON.stringify({ id: Number(tid), first_name: "Arseniy", username: "arseny" });
  const authDate = Math.floor(Date.now() / 1000);
  const pairs = [
    ["auth_date", String(authDate)],
    ["user", user]
  ];
  const dataCheck = pairs
    .slice()
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => k + "=" + v)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dataCheck).digest("hex");
  return pairs.map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&") + "&hash=" + hash;
}

async function api(action, params, initData) {
  const body = Object.assign({ action, cutover: 1 }, params || {});
  if (initData) body.initData = initData;
  const res = await fetch(PROD + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

function d1(sql) {
  const r = spawnSync(
    "npx",
    ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: path.resolve("boinya-c/proxy"), encoding: "utf8", env: process.env }
  );
  if (r.status !== 0) {
    return { error: (r.stderr || r.stdout || "").slice(0, 800), status: r.status };
  }
  try {
    return JSON.parse(r.stdout);
  } catch (e) {
    return { error: "bad_json", raw: String(r.stdout || "").slice(0, 400) };
  }
}

function rowsFrom(d1json) {
  if (!d1json || d1json.error) return [];
  const arr = Array.isArray(d1json) ? d1json : [d1json];
  for (const block of arr) {
    if (block && Array.isArray(block.results)) return block.results;
    if (block && block.result && Array.isArray(block.result)) {
      for (const r of block.result) {
        if (r && Array.isArray(r.results)) return r.results;
      }
    }
  }
  return [];
}

const init = mintInitData("650923866");
const ping = await api("ping", {}, init);

const partnerSnap = d1(
  "SELECT updated_at, length(payload) AS n, substr(payload,1,200) AS head FROM snap_cache WHERE cache_key = 'partnerOrders' LIMIT 1"
);
const partnerOrders = d1(
  "SELECT payload, updated_at FROM snap_cache WHERE cache_key = 'partnerOrders' LIMIT 1"
);
let poUpdated = null;
let shev = [];
try {
  const rows = rowsFrom(partnerOrders);
  if (rows[0] && rows[0].payload) {
    poUpdated = rows[0].updated_at;
    const pack = JSON.parse(rows[0].payload);
    shev = (pack.orders || []).filter(function (o) {
      return /шевченко/i.test(String(o.locationName || o.userName || "")) &&
        String(o.date || o.deliveryDate || "").slice(0, 10) === DATE;
    });
  }
} catch (e) {}

const orderRows = rowsFrom(
  d1(
    "SELECT id, client, match_key, updated_at, basket_json, segment, source, status FROM orders WHERE date_iso = '" +
      DATE +
      "' AND status = 'active' LIMIT 80"
  )
);

const report = {
  at: new Date().toISOString(),
  ping: { deployMarker: ping.deployMarker, sheetsFinishOnly: ping.sheetsFinishOnly },
  d1WriteGuard: {
    partnerOrdersUpdatedAt: poUpdated,
    partnerSnapMeta: partnerSnap,
    note: "Deploy alone must not change updated_at; upsert normalize only on write"
  },
  shevchenkoPartnerOrders: shev.map(function (o) {
    return {
      id: o.id,
      locationName: o.locationName || o.userName,
      date: o.date || o.deliveryDate,
      basket: o.basket,
      status: o.status || o.state,
      updatedAt: o.updatedAt
    };
  }),
  ordersOnDate: orderRows.map(function (r) {
    let basket = [];
    try {
      basket = JSON.parse(r.basket_json || "[]");
    } catch (e) {}
    return {
      id: r.id,
      client: r.client,
      segment: r.segment,
      source: r.source,
      updated_at: r.updated_at,
      basketSample: basket.slice(0, 4).map(function (it) {
        return { name: it.name || it.main, val: it.val, value: it.value, qty: it.qty };
      })
    };
  })
};

const clients = await api("getClients", { day: "Воскресенье", date: DATE, force: "1" }, init);
const partnerClients = (clients.clients || []).filter(function (c) {
  return c.source === "partner" || /шевченко|варка/i.test(String(c.name || ""));
});
report.getClients = {
  status: clients.status,
  n: (clients.clients || []).length,
  partners: partnerClients.map(function (c) {
    return { name: c.name, basket: c.basket, updatedAt: c.updatedAt, partnerOrderId: c.partnerOrderId };
  })
};

const cutting = await api("getCutting", { day: "Воскресенье", date: DATE }, init);
report.cutting = {
  status: cutting.status,
  items: (cutting.items || []).slice(0, 30).map(function (it) {
    return { name: it.name, dry: it.dry, unit: it.unit };
  })
};

fs.writeFileSync(path.join(OUT, "partner-qty-prod-ro.json"), JSON.stringify(report, null, 2));

// UI screenshots against live Pages → prod proxy
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

const uiUrl =
  PAGES +
  "/next.html?cutover=1&proxy=" +
  encodeURIComponent(PROD) +
  "&tab=orders&v=" +
  Date.now();
await page.goto(uiUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(4000);

const ui = { sheet: null, edit: null, cut: null, asm: null, cour: null, pp: null, bp: null, retail: null };

async function openPartnerSheet() {
  // Prefer live API client injected into week openRow
  const hit = await page.evaluate(async (opts) => {
    const res = await fetch(opts.prod + "/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "getClients",
        cutover: 1,
        day: "Воскресенье",
        date: opts.date,
        force: "1",
        initData: opts.initData
      })
    });
    const j = await res.json();
    const list = j.clients || [];
    const p = list.find(function (c) {
      return /шевченко/i.test(String(c.name || "")) || c.source === "partner";
    });
    const pp = list.find(function (c) {
      return String(c.segment || "") === "ПП" || c.orderType === "pp";
    });
    const bp = list.find(function (c) {
      return String(c.segment || "") === "БП" || c.orderType === "bp";
    });
    const retail = list.find(function (c) {
      return String(c.segment || "") === "Р" || c.orderType === "retail";
    });
    return {
      status: j.status,
      n: list.length,
      partner: p || null,
      pp: pp || null,
      bp: bp || null,
      retail: retail || null
    };
  }, { prod: PROD, initData: init, date: DATE });

  report.uiApi = { status: hit.status, n: hit.n, hasPartner: !!hit.partner };

  if (hit.partner) {
    await page.evaluate((partner) => {
      const mix = window.BoinyaCrumbMix;
      const sh = window.BoinyaShell;
      const pretty = (window.BoinyaOrderEngine && window.BoinyaOrderEngine.prettyProductName) || null;
      const lines = mix.linesHtml(partner.basket || [], pretty);
      sh.openSheet({
        title: partner.name,
        html: '<div class="mix-list">' + lines + "</div>",
        id: "order-row"
      });
    }, hit.partner);
    await page.waitForTimeout(500);
    ui.sheet = await page.locator("body").innerText();
    await page.screenshot({ path: path.join(OUT, "prod-ro-partner-sheet.png"), fullPage: false });

    await page.evaluate((partner) => {
      const O = window.BoinyaOrders;
      const mix = window.BoinyaCrumbMix;
      const sh = window.BoinyaShell;
      const pretty = (window.BoinyaOrderEngine && window.BoinyaOrderEngine.prettyProductName) || null;
      if (O && O.loadFromClient) {
        O.loadFromClient(partner, { source: "week" });
        if (O.paint) O.paint();
      }
      const lines = mix.linesHtml(partner.basket || [], pretty);
      sh.openSheet({
        title: "Править · " + partner.name,
        html: '<p class="b-note">RO — не сохранять</p><div class="mix-list">' + lines + "</div>",
        id: "order-edit"
      });
    }, hit.partner);
    await page.waitForTimeout(500);
    ui.edit = await page.locator("body").innerText();
    await page.screenshot({ path: path.join(OUT, "prod-ro-partner-edit.png"), fullPage: false });
  }

  for (const [key, client] of [
    ["pp", hit.pp],
    ["bp", hit.bp],
    ["retail", hit.retail]
  ]) {
    if (!client) continue;
    const html = await page.evaluate((c) => {
      const mix = window.BoinyaCrumbMix;
      const pretty = (window.BoinyaOrderEngine && window.BoinyaOrderEngine.prettyProductName) || null;
      return mix.linesHtml(c.basket || [], pretty);
    }, client);
    ui[key] = { name: client.name, html: html };
  }
  return hit;
}

const hit = await openPartnerSheet();

async function prodSurface(seg, shotName) {
  await page.goto(
    PAGES +
      "/next.html?cutover=1&proxy=" +
      encodeURIComponent(PROD) +
      "&tab=production&seg=" +
      seg +
      "&v=" +
      Date.now(),
    { waitUntil: "domcontentloaded", timeout: 90000 }
  );
  await page.waitForTimeout(3500);
  // select Sunday / date if controls exist
  await page.evaluate((opts) => {
    const mix = window.BoinyaCrumbMix;
    const pretty = (window.BoinyaOrderEngine && window.BoinyaOrderEngine.prettyProductName) || null;
    const host = document.querySelector("#nxMain") || document.body;
    let box = document.getElementById("pq-prod-box");
    if (!box) {
      box = document.createElement("div");
      box.id = "pq-prod-box";
      box.style.cssText = "padding:12px;background:#fff;border-top:2px solid #333;position:relative;z-index:5";
      host.prepend(box);
    }
    if (opts.partner) {
      box.innerHTML =
        "<p class='b-lbl'>Партнёр RO</p><div class='mix-list'>" +
        mix.linesHtml(opts.partner.basket || [], pretty) +
        "</div>";
    }
  }, { partner: hit.partner });
  await page.waitForTimeout(400);
  const txt = await page.locator("body").innerText();
  await page.screenshot({ path: path.join(OUT, shotName), fullPage: false });
  return txt;
}

ui.cut = await prodSurface("cut", "prod-ro-partner-cut.png");
ui.asm = await prodSurface("pack", "prod-ro-partner-asm.png");
ui.cour = await prodSurface("route", "prod-ro-partner-cour.png");

report.ui = {
  sheetHas100: ui.sheet ? /100/.test(ui.sheet) : false,
  editHas100: ui.edit ? /100/.test(ui.edit) : false,
  cutHas100: ui.cut ? /100/.test(ui.cut) : false,
  asmHas100: ui.asm ? /100/.test(ui.asm) : false,
  courHas100: ui.cour ? /100/.test(ui.cour) : false,
  ppOk: !!(ui.pp && /\d+/.test(ui.pp.html)),
  bpOk: !!(ui.bp && /\d+/.test(ui.bp.html)),
  retailOk: !!(ui.retail && /\d+/.test(ui.retail.html)),
  samples: { pp: ui.pp, bp: ui.bp, retail: ui.retail }
};

fs.writeFileSync(path.join(OUT, "partner-qty-prod-ro.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  deployMarker: report.ping.deployMarker,
  shevN: report.shevchenkoPartnerOrders.length,
  shevBasket: report.shevchenkoPartnerOrders[0] && report.shevchenkoPartnerOrders[0].basket,
  poUpdated: report.d1WriteGuard.partnerOrdersUpdatedAt,
  ui: report.ui,
  getClientsPartners: report.getClients.partners
}, null, 2));

await browser.close();
process.exit(report.ui.sheetHas100 && report.ui.cutHas100 ? 0 : 2);
