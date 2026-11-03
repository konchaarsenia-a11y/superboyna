/**
 * ТОЛЬКО ЧТЕНИЕ. Куда ушли правки себеса после 09.10:
 * raw_cost_ver, raw_costs, snap_cache (*cost*), priceCostsPp zeroKeys,
 * listRawCosts, meta. Ничего не пишет.
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const proxy = join(root, "..", "boinya-c", "proxy");
const outDir = process.env.RAW_COST_HUNT_OUT || join(root, "..", "artifacts", "raw-cost-hunt");
const WORKER = "https://boinya-c.konchaarsenia.workers.dev/";
const OWNER_ID = Number(process.env.PP_AUDIT_TG_ID || "650923866");
const OWNER_NAME = process.env.PP_AUDIT_TG_NAME || "Арсений";

const FOCUS = [
  "БЫЧИЙ КОРЕНЬ",
  "СТАНОВАЯ ЖИЛА",
  "КОЛЕНИ",
  "НОСЫ",
  "ХРЯЩ",
  "ШЕИ",
  "ПЕРЕП",
  "ШТ"
];

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
  if (run.status !== 0) {
    throw new Error((run.stderr || run.stdout || "d1").slice(-1200));
  }
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
    return { status: "error", message: "bad_json", raw: text.slice(0, 400) };
  }
}

function focusHit(s) {
  const u = String(s || "").toUpperCase().replace(/Ё/g, "Е");
  return FOCUS.some((f) => u.includes(f));
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

const tables = d1(
  "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%cost%' OR name LIKE '%raw%' OR name LIKE '%price%' OR name='snap_cache' OR name='meta') ORDER BY name"
);

let rawCostVer = [];
let rawCostVerErr = null;
try {
  rawCostVer = d1(
    "SELECT id, sku, cost, shrink, effective_from AS effectiveFrom, created_at AS createdAt FROM raw_cost_ver ORDER BY effective_from, id"
  );
} catch (e) {
  rawCostVerErr = String(e && e.message ? e.message : e).slice(0, 400);
}

let rawCosts = [];
let rawCostsErr = null;
try {
  rawCosts = d1(
    "SELECT sku, price, yield, source, updated_at AS updatedAt FROM raw_costs ORDER BY updated_at DESC, sku"
  );
} catch (e) {
  rawCostsErr = String(e && e.message ? e.message : e).slice(0, 400);
}

const snapKeys = d1(
  "SELECT cache_key, updated_at, length(payload) AS n FROM snap_cache WHERE cache_key LIKE '%cost%' OR cache_key LIKE '%Cost%' OR cache_key LIKE '%price%' OR cache_key LIKE '%Price%' OR cache_key LIKE '%raw%' OR cache_key LIKE '%Raw%' OR cache_key IN ('listSubscriptions','warehouse','retailPrices','priceCostsPp') ORDER BY updated_at DESC"
);

let metaRows = [];
try {
  metaRows = d1(
    "SELECT key, substr(value,1,200) AS value, length(value) AS n FROM meta WHERE key LIKE '%cost%' OR key LIKE '%raw%' OR key LIKE '%price%' OR key LIKE '%sebes%' OR key LIKE '%stage_c%' ORDER BY key"
  );
} catch (eMeta) {
  metaRows = [{ error: String(eMeta && eMeta.message ? eMeta.message : eMeta).slice(0, 200) }];
}

const costsPayload = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'priceCostsPp'")) || {};
const costs = costsPayload.costs && typeof costsPayload.costs === "object" ? costsPayload.costs : {};
const zeroKeys = costsPayload.zeroKeys && typeof costsPayload.zeroKeys === "object" ? costsPayload.zeroKeys : {};

const costsFocus = {};
Object.keys(costs)
  .filter(focusHit)
  .sort()
  .forEach((k) => {
    const row = costs[k] || {};
    costsFocus[k] = {
      name: row.name || "",
      sub: row.sub || "",
      unitPrice: row.unitPrice != null ? row.unitPrice : row.per100,
      piece: !!row.piece
    };
  });

const zeroFocus = {};
Object.keys(zeroKeys)
  .filter(focusHit)
  .sort()
  .forEach((k) => {
    zeroFocus[k] = zeroKeys[k];
  });

const allZeroKeys = Object.keys(zeroKeys).sort();

const retailPayload = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'retailPrices'")) || {};
const retailFocus = (Array.isArray(retailPayload.items) ? retailPayload.items : [])
  .filter((it) => focusHit(it && (it.key || it.name || it.sku)))
  .map((it) => ({
    key: it.key || it.name || it.sku,
    price: it.price != null ? it.price : it.retail,
    unit: it.unit || "",
    updatedAt: it.updatedAt || it.updated_at || ""
  }));

let listRaw = await workerPost({ action: "listRawCosts", cutover: 1, initData });
const listItems =
  listRaw && listRaw.status === "success" && Array.isArray(listRaw.items) ? listRaw.items : [];
const listFocus = listItems
  .filter((it) => focusHit(it && it.sku))
  .map((it) => ({
    sku: it.sku,
    cost: it.cost,
    builtin: it.builtin,
    shrink: it.shrink,
    effectiveFrom: it.effectiveFrom,
    historyN: Array.isArray(it.history) ? it.history.length : 0,
    history: it.history || []
  }));

const versionsFromApi = listRaw && Array.isArray(listRaw.versions) ? listRaw.versions : [];

/* Любые sku с updated_at после 2026-10-09 в raw_costs */
const rawCostsAfter = rawCosts.filter((r) => String(r.updatedAt || "") > "2026-10-09");
const rawCostsKorZhil = rawCosts.filter((r) => /КОРЕН|ЖИЛ/i.test(String(r.sku || "")));

const report = {
  at: new Date().toISOString(),
  tables,
  raw_cost_ver: {
    count: rawCostVer.length,
    error: rawCostVerErr,
    rows: rawCostVer
  },
  raw_costs: {
    count: rawCosts.length,
    error: rawCostsErr,
    after_2026_10_09: rawCostsAfter,
    koren_zhila: rawCostsKorZhil,
    all: rawCosts
  },
  snap_cache_keys: snapKeys,
  meta: metaRows,
  priceCostsPp: {
    updatedAtHint: costsPayload.updatedAt || costsPayload.cachedAt || costsPayload._d1TouchedAt || null,
    ppCostCanon: costsPayload.ppCostCanon || null,
    costsN: Object.keys(costs).length,
    zeroKeysN: allZeroKeys.length,
    allZeroKeys,
    costsFocus,
    zeroFocus
  },
  retailFocus,
  listRawCosts: {
    status: listRaw && listRaw.status,
    message: listRaw && listRaw.message,
    versionsN: versionsFromApi.length,
    versions: versionsFromApi,
    focus: listFocus,
    itemsN: listItems.length,
    /* полная карта sku→cost из карточки «Себес сырья» */
    allItems: listItems.map((it) => ({
      sku: it.sku,
      cost: it.cost,
      builtin: it.builtin,
      effectiveFrom: it.effectiveFrom,
      historyN: Array.isArray(it.history) ? it.history.length : 0
    }))
  },
  verdictHints: {
    raw_cost_ver_empty: rawCostVer.length === 0,
    saveRawCost_writes: "raw_cost_ver + stageCNoteRaw_→raw_costs",
    calcPrice_reads: "priceCostsPp → overlayRawCostsD1_(raw_cost_ver) → lookupPpCostInfoD1_ → RAW_COST_BUILTIN_",
    calcPrice_does_not_read: "raw_costs table (stage C mirror only)"
  }
};

writeFileSync(join(outDir, "raw-cost-hunt.json"), JSON.stringify(report, null, 2));

const md = [];
md.push("# raw-cost hunt (RO)");
md.push("");
md.push("at: " + report.at);
md.push("");
md.push("## raw_cost_ver: **" + report.raw_cost_ver.count + "** строк");
if (rawCostVerErr) md.push("error: " + rawCostVerErr);
md.push("");
md.push("## raw_costs: **" + report.raw_costs.count + "** строк, после 09.10: **" + rawCostsAfter.length + "**");
rawCostsKorZhil.forEach((r) => {
  md.push("- " + r.sku + " price=" + r.price + " updated=" + r.updatedAt + " source=" + r.source);
});
md.push("");
md.push("## listRawCosts versionsN=" + report.listRawCosts.versionsN);
listFocus.forEach((it) => {
  md.push(
    "- " +
      it.sku +
      " cost=" +
      it.cost +
      " builtin=" +
      it.builtin +
      " from=" +
      it.effectiveFrom +
      " hist=" +
      it.historyN
  );
});
md.push("");
md.push("## priceCostsPp zeroKeys (" + allZeroKeys.length + ")");
allZeroKeys.forEach((k) => md.push("- " + k));
md.push("");
md.push("## priceCostsPp focus");
Object.keys(costsFocus).forEach((k) => {
  const r = costsFocus[k];
  md.push("- " + k + " unit=" + r.unitPrice + " piece=" + (r.piece ? 1 : 0));
});
md.push("");
md.push("## snap keys");
snapKeys.forEach((r) => md.push("- " + r.cache_key + " @ " + r.updated_at + " n=" + r.n));

writeFileSync(join(outDir, "raw-cost-hunt.md"), md.join("\n") + "\n");
console.log(JSON.stringify({ wrote: outDir, raw_cost_ver: rawCostVer.length, raw_costs: rawCosts.length, zeroKeys: allZeroKeys.length }, null, 2));
