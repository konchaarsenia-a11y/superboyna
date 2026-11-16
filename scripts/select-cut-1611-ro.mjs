#!/usr/bin/env node
/** SELECT-only: 16.11 cutting grams from orders + snap_cache. No writes. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function d1(sql) {
  const r = spawnSync(
    "npx",
    ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: path.resolve("boinya-c/proxy"), encoding: "utf8", env: process.env }
  );
  if (r.status !== 0) return { error: (r.stderr || r.stdout || "").slice(0, 1200) };
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { error: "bad_json", raw: (r.stdout || "").slice(0, 400) };
  }
}
function rows(j) {
  if (!j || j.error) return [];
  const arr = Array.isArray(j) ? j : [j];
  for (const b of arr) {
    if (b && Array.isArray(b.results)) return b.results;
    if (b && b.result)
      for (const r of b.result) if (r && Array.isArray(r.results)) return r.results;
  }
  return [];
}

function amt(it) {
  const n = Number(it && (it.val != null ? it.val : it.value != null ? it.value : it.qty));
  return Number.isFinite(n) ? n : 0;
}
function isLung(n) {
  return /Л[ЁЕ]ГК/i.test(String(n || ""));
}
function isHeart(n) {
  return /СЕРДЦ/i.test(String(n || ""));
}
function isRumen(n) {
  return /РУБЕЦ/i.test(String(n || ""));
}

const orders = rows(
  d1(
    "SELECT id, client, day_name, date_iso, status, source, segment, basket_json FROM orders WHERE status='active' AND date_iso='2026-11-16' ORDER BY client"
  )
);

let lung = 0,
  heart = 0,
  rumen = 0;
let lungNoPartner = 0,
  heartNoPartner = 0,
  rumenNoPartner = 0;
const clients = [];
for (const o of orders) {
  let basket = [];
  try {
    basket = JSON.parse(o.basket_json || "[]") || [];
  } catch {
    basket = [];
  }
  const partner = String(o.source || "") === "partner" || /варка|varka/i.test(String(o.client || ""));
  let cl = 0,
    ch = 0,
    cr = 0;
  for (const it of basket) {
    const name = it && (it.name || it.main || "");
    const a = amt(it);
    if (isLung(name)) {
      lung += a;
      cl += a;
      if (!partner) lungNoPartner += a;
    }
    if (isHeart(name)) {
      heart += a;
      ch += a;
      if (!partner) heartNoPartner += a;
    }
    if (isRumen(name)) {
      rumen += a;
      cr += a;
      if (!partner) rumenNoPartner += a;
    }
  }
  clients.push({
    client: o.client,
    source: o.source,
    partner,
    lung: cl,
    heart: ch,
    rumen: cr
  });
}

const snapRows = rows(
  d1(
    "SELECT cache_key, substr(payload,1,8000) AS payload, updated_at FROM snap_cache WHERE cache_key='cutting:Будущая неделя' LIMIT 1"
  )
);
let snap = null;
if (snapRows[0] && snapRows[0].payload) {
  try {
    const p = JSON.parse(snapRows[0].payload);
    const items = p.items || [];
    const dry = (re) => {
      const it = items.find((i) => re.test(String((i && i.name) || "")));
      return it ? it.dry : null;
    };
    snap = {
      updated_at: snapRows[0].updated_at,
      fromOrders: !!p.fromOrders,
      previewStale: !!p.previewStaleWithoutPartner,
      lung: dry(/Л[ЁЕ]ГК/i),
      heart: dry(/СЕРДЦ/i),
      rumen: dry(/РУБЕЦ/i),
      n: items.length
    };
  } catch {
    snap = { error: "bad_snap_json" };
  }
}

const report = {
  at: new Date().toISOString(),
  ordersN: orders.length,
  clients,
  fromOrders: { lung, heart, rumen },
  fromOrdersNoPartner: { lung: lungNoPartner, heart: heartNoPartner, rumen: rumenNoPartner },
  snap,
  // Live baskets already include Варка 100/100 → gate 500/121/70. Snap lung 400 = stale without partner lung.
  expectWithPartner: { lung: 500, heart: 121, rumen: 70 },
  expectPeopleOnly: { lung: lungNoPartner, heart: heartNoPartner, rumen: rumenNoPartner },
  okOrders: orders.length === 4,
  okLiveWithPartner: lung === 500 && heart === 121 && rumen === 70,
  okSnapWithPartner: !!(snap && snap.lung === 500 && snap.heart === 121 && snap.rumen === 70),
  snapStaleMissingPartnerLung: !!(snap && snap.lung === 400 && lung === 500)
};

const outDir = process.env.OUT_DIR || "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "select-cut-1611-ro.json"), JSON.stringify(report, null, 2));
try {
  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  fs.writeFileSync("/opt/cursor/artifacts/select-cut-1611-ro.json", JSON.stringify(report, null, 2));
} catch (eArt) {}
console.log(JSON.stringify(report, null, 2));
// ok if orders=4 and live sums match people+partner; snap may lag until first getCutting
process.exit(report.okOrders && report.okLiveWithPartner ? 0 : 2);
