/**
 * Live контроль price-canon-v2: корзина + полный себес + 29 ПП.
 * Карточки не пишет. Нужны TELEGRAM_BOT_TOKEN + CLOUDFLARE_* (как compare).
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRICE_COST_SEED_1110_,
  catalogRowById_,
  displayKeyForSku_
} from "../boinya-c/proxy/price-canon-v2.js";

const root = dirname(fileURLToPath(import.meta.url));
const proxy = join(root, "..", "boinya-c", "proxy");
const outDir = process.env.PRICE_CANON_OUT || join(root, "..", "artifacts", "price-canon-v2");
const WORKER = "https://boinya-c.konchaarsenia.workers.dev/";
const OWNER_ID = Number(process.env.PP_AUDIT_TG_ID || "650923866");
const OWNER_NAME = process.env.PP_AUDIT_TG_NAME || "Арсений";

function parseWrangler(text) {
  const raw = String(text || "");
  const at = raw.search(/[\[{]/);
  if (at < 0) throw new Error("wrangler: нет json");
  return JSON.parse(raw.slice(at));
}
function d1(sql) {
  const run = spawnSync(
    "npx",
    ["--yes", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: proxy, encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 }
  );
  if (run.status !== 0) throw new Error((run.stderr || run.stdout || "d1").slice(-800));
  const parsed = parseWrangler((run.stdout || "") + "\n" + (run.stderr || ""));
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return (block && block.results) || [];
}
function payloadOf(rows) {
  if (!rows || !rows.length) return null;
  let p = rows[0].payload;
  if (typeof p === "string") p = JSON.parse(p);
  return p;
}
function signInitData(token, fields) {
  const keys = Object.keys(fields).sort();
  const dcs = keys.map((k) => k + "=" + fields[k]).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(dcs).digest("hex");
  const sp = new URLSearchParams();
  keys.forEach((k) => sp.append(k, fields[k]));
  sp.append("hash", hash);
  return sp.toString();
}
async function workerPost(body) {
  const res = await fetch(WORKER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { status: "error", message: "bad_json", raw: text.slice(0, 300) };
  }
}

const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
if (!token) {
  console.error("NO_TELEGRAM_BOT_TOKEN");
  process.exit(1);
}
const initData = signInitData(token, {
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id: OWNER_ID, first_name: OWNER_NAME })
});

mkdirSync(outDir, { recursive: true });

const meta = d1("SELECT key, value, updated_at FROM meta WHERE key LIKE 'price_canon%'");
const costsSnap = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'priceCostsPp'"));
const backup = d1(
  "SELECT cache_key, length(payload) as plen, updated_at FROM snap_cache WHERE cache_key = 'priceCanonBackup:2026-11-04'"
);
const verN = d1("SELECT COUNT(*) as n FROM raw_cost_ver");
const skuN = d1("SELECT COUNT(*) as n FROM price_sku");

const pieceKeys = [
  "UHO_G",
  "UHO_K",
  "KOLENI",
  "KOREN_S",
  "KOREN_M",
  "PEREPELKI",
  "AORTA",
  "ZHILA_PALK",
  "LOP_HRYASH",
  /* KOPYTO retired (SKU retire) — не в piece-check */
  "NOSY",
  "UTINYE_SHEI"
];
const liveCosts = (costsSnap && costsSnap.costs) || {};
const pieceCheck = pieceKeys.map((id) => {
  const row = liveCosts[id];
  return {
    skuId: id,
    unitPrice: row ? row.unitPrice : null,
    piece: row ? !!row.piece : null,
    zero: !(row && Number(row.unitPrice) > 0)
  };
});

const fullCosts = PRICE_COST_SEED_1110_.map((s) => {
  const cat = catalogRowById_(s.id);
  const live = liveCosts[s.id] || (cat ? liveCosts[displayKeyForSku_(cat)] : null);
  return {
    skuId: s.id,
    sku: cat ? displayKeyForSku_(cat) : s.id,
    seedCost: s.cost,
    liveCost: live ? Number(live.unitPrice) : null,
    piece: !!(cat && cat.piece),
    source: s.source
  };
});

const basket = [
  { name: "ЛЁГКОЕ", val: 100, sub: "мелкий кубик" },
  { name: "СЕРДЦЕ", val: 70, sub: "мелкие" },
  { name: "ПОЧКИ", val: 60, sub: "мелкие" },
  { name: "БЫЧИЙ КОРЕНЬ", val: 2, sub: "МАЛ", cat: "chew" }
];
const packs = { u1: 0, u2: 3, u3: 1, up4: 1 };

const calc = await workerPost({
  action: "calcPrice",
  mode: "pp",
  fullFact: 1,
  cutover: 1,
  initData,
  basket,
  coef: 2.6,
  deliveriesN: 1,
  scheme: "RAW26",
  forNew: 1,
  packCounts: packs,
  u2: 3,
  u3: 1,
  up4: 1
});

/* 29 ПП — reuse compare if already written, else compute */
let ppRows = [];
const comparePath = join(outDir, "pp-stated-vs-new.json");
try {
  const prev = JSON.parse(readFileSync(comparePath, "utf8"));
  if (prev && Array.isArray(prev.rows)) ppRows = prev.rows;
} catch (e) {}

if (!ppRows.length) {
  const subsPayload = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'"));
  const list = (subsPayload && (subsPayload.subscriptions || subsPayload.list || subsPayload.items)) || [];
  const active = list.filter((s) => {
    const sheet = String((s && (s.sheet || s.segment)) || "").toUpperCase();
    if (sheet !== "ПП" && sheet !== "PP") return false;
    const st = String((s && s.status) || "").toLowerCase();
    if (st === "deleted" || st === "afk" || st === "афк") return false;
    return true;
  });
  for (const s of active) {
    const nick = String(s.nick || s.label || s.name || "").trim();
    const b = s.basket || s.items || [];
    const stated = Number(s.statedCost != null ? s.statedCost : s.stated) || 0;
    const coef = Number(s.coef) || 2.6;
    const n = Number(s.deliveriesN != null ? s.deliveriesN : s.deliveries) || 1;
    const pc = s.packCounts || s.packs || {};
    let c = null;
    try {
      c = await workerPost({
        action: "calcPrice",
        mode: "pp",
        fullFact: 1,
        cutover: 1,
        initData,
        basket: b,
        coef,
        deliveriesN: n,
        scheme: "RAW26",
        forNew: 1,
        packCounts: pc,
        u1: pc.u1,
        u2: pc.u2,
        u3: pc.u3,
        up4: pc.up4
      });
    } catch (e) {
      c = { status: "error", message: String(e) };
    }
    const newPrice =
      c && c.status === "success" && !c.costIncomplete
        ? Number(c.clientPrice != null ? c.clientPrice : c.factCost != null ? c.factCost : c.total)
        : null;
    ppRows.push({
      nick,
      subId: s.subId || s.id || "",
      coef,
      stated,
      newCalc: newPrice,
      diff: newPrice != null ? Math.round((stated - newPrice) * 100) / 100 : null,
      costIncomplete: !!(c && c.costIncomplete),
      missing: (c && c.missing) || 0,
      S: c && c.rawCost != null ? c.rawCost : c && c.cost,
      priceCanon: (c && c.priceCanon) || ""
    });
  }
  writeFileSync(join(outDir, "pp-stated-vs-new.json"), JSON.stringify({ at: new Date().toISOString(), n: ppRows.length, rows: ppRows }, null, 2));
  writeFileSync(
    join(outDir, "pp-stated-vs-new.csv"),
    ["ник,subId,coef,указанная,новый_calc,diff,incomplete,missing,S,canon"]
      .concat(
        ppRows.map((r) =>
          [r.nick, r.subId, r.coef, r.stated, r.newCalc ?? "", r.diff ?? "", r.costIncomplete ? 1 : 0, r.missing, r.S ?? "", r.priceCanon].join(",")
        )
      )
      .join("\n") + "\n"
  );
}

const report = {
  at: new Date().toISOString(),
  pagesVer: "71125449",
  marker: "price-canon-v2-h1",
  meta,
  backup,
  verN: verN[0],
  skuN: skuN[0],
  priceCanonV2: !!(costsSnap && costsSnap.priceCanonV2),
  ppCostCanon: costsSnap && costsSnap.ppCostCanon,
  zeroKeysN: costsSnap && costsSnap.zeroKeys ? Object.keys(costsSnap.zeroKeys).length : null,
  pieceCheck,
  pieceZeros: pieceCheck.filter((p) => p.zero),
  fullCosts,
  controlBasket: basket,
  controlPacks: packs,
  controlCoef: 2.6,
  controlN: 1,
  calc
};

writeFileSync(join(outDir, "control-report.json"), JSON.stringify(report, null, 2));
writeFileSync(join(outDir, "full-costs.json"), JSON.stringify(fullCosts, null, 2));
writeFileSync(
  join(outDir, "control-basket.md"),
  [
    "# Control basket (live calcPrice)",
    "",
    "- ЛЁГКОЕ 100г мелкий кубик",
    "- СЕРДЦЕ 70г мелкие",
    "- ПОЧКИ 60г мелкие",
    "- БЫЧИЙ КОРЕНЬ МАЛ 2шт",
    "- u2=3 u3=1 up4=1 N=1 coef=2.6",
    "",
    "```json",
    JSON.stringify(
      {
        status: calc && calc.status,
        priceCanon: calc && calc.priceCanon,
        costIncomplete: calc && calc.costIncomplete,
        rawCost: calc && calc.rawCost,
        recoverByn: calc && calc.recoverByn,
        packagesByn: calc && calc.packagesByn,
        deliveryByn: calc && calc.deliveryByn,
        fractionMarkup: calc && calc.fractionMarkup,
        coef: calc && calc.coef,
        goodsByn: calc && calc.goodsByn,
        factCost: calc && calc.factCost,
        clientPrice: calc && calc.clientPrice,
        retailCapped: calc && calc.retailCapped,
        lines: calc && calc.lines
      },
      null,
      2
    ),
    "```",
    "",
    "## Piece zeros",
    pieceCheck.filter((p) => p.zero).length
      ? pieceCheck
          .filter((p) => p.zero)
          .map((p) => `- ${p.skuId}`)
          .join("\n")
      : "none",
    ""
  ].join("\n")
);

console.log(
  JSON.stringify(
    {
      wrote: outDir,
      meta,
      pieceZeros: pieceCheck.filter((p) => p.zero).length,
      calcStatus: calc && calc.status,
      priceCanon: calc && calc.priceCanon,
      rawCost: calc && calc.rawCost,
      factCost: calc && calc.factCost,
      clientPrice: calc && calc.clientPrice,
      ppN: ppRows.length
    },
    null,
    2
  )
);
if (!calc || calc.status !== "success") process.exit(1);
if (pieceCheck.some((p) => p.zero)) process.exit(2);
