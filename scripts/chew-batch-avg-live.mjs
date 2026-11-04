/**
 * Live chew-pcs-kg: цена/кг + шт/кг → себес/шт; партия не меняет pcs_per_kg.
 * Cleanup тестов + 2099. Карточки/цены клиентов не пишет.
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  costPieceFromKgPcs_,
  costPieceFromBatch_,
  pcsPerKgFromBatch_
} from "../boinya-c/proxy/price-canon-v2.js";

const root = dirname(fileURLToPath(import.meta.url));
const proxy = join(root, "..", "boinya-c", "proxy");
const outDir = process.env.CHEW_BATCH_OUT || join(root, "..", "artifacts", "chew-batch-avg");
const WORKER = "https://boinya-c.konchaarsenia.workers.dev/";
const OWNER_ID = Number(process.env.PP_AUDIT_TG_ID || "650923866");
const OWNER_NAME = process.env.PP_AUDIT_TG_NAME || "Арсений";
const SKU = "КОЛЕНИ";
const SKU_ID = "KOLENI";
const BATCH_DATE = "2099-02-01";
const MANUAL_FROM = "2099-03-01";
const COST_KG = 45;
const PCS_PER_KG = 20;
const EXPECT_COST = costPieceFromKgPcs_(COST_KG, PCS_PER_KG); /* 2.25 */

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
    { cwd: proxy, encoding: "utf8", env: process.env, maxBuffer: 32 * 1024 * 1024 }
  );
  if (run.status !== 0) throw new Error((run.stderr || run.stdout || "d1").slice(-800));
  const parsed = parseWrangler((run.stdout || "") + "\n" + (run.stderr || ""));
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return (block && block.results) || [];
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

const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
if (!token) {
  console.error("NO_TELEGRAM_BOT_TOKEN");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

d1(
  "CREATE TABLE IF NOT EXISTS raw_piece_batch (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, sku_id TEXT NOT NULL, sku TEXT NOT NULL DEFAULT '', " +
    "batch_date TEXT NOT NULL, cost_kg REAL NOT NULL, weight_kg REAL NOT NULL, pieces REAL NOT NULL, " +
    "cost_piece REAL NOT NULL, created_at TEXT NOT NULL, actor_tg TEXT, source TEXT)"
);
try {
  d1("ALTER TABLE raw_cost_ver ADD COLUMN pcs_per_kg REAL");
} catch (ePcs) {}

try {
  d1("DELETE FROM raw_cost_ver WHERE effective_from LIKE '2099-%'");
} catch (eDel) {}
try {
  d1("DELETE FROM raw_piece_batch WHERE batch_date = '" + BATCH_DATE + "' AND sku_id = '" + SKU_ID + "'");
} catch (eDel3) {}

const beforeVer = d1(
  "SELECT cost, cost_kg, pcs_per_kg, effective_from FROM raw_cost_ver WHERE sku_id = '" +
    SKU_ID +
    "' OR sku LIKE '%КОЛЕНИ%' ORDER BY effective_from DESC, id DESC LIMIT 3"
);
const snapKey = "chewPcsKgBackup:2026-11-04";
const pack = { at: new Date().toISOString(), beforeVer, note: "before chew-pcs-kg live " + SKU_ID };
d1(
  "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES ('" +
    snapKey +
    "', '" +
    JSON.stringify(pack).replace(/'/g, "''") +
    "', '" +
    pack.at +
    "') ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
);

const initData = signInitData(token, {
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id: OWNER_ID, first_name: OWNER_NAME })
});

async function post(body) {
  const res = await fetch(WORKER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ cutover: 1, initData }, body))
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { parseError: text.slice(0, 400) };
  }
}

/* 1) ручной ввод цена/кг + шт/кг → себес/шт */
const saveManual = await post({
  action: "saveRawCost",
  sku: SKU,
  skuId: SKU_ID,
  costKg: COST_KG,
  pcsPerKg: PCS_PER_KG,
  effectiveFrom: MANUAL_FROM
});

const listAfterManual = await post({ action: "listRawCosts" });
const kneeManual = ((listAfterManual && listAfterManual.items) || []).find(
  (it) => it.skuId === SKU_ID || it.sku === SKU
);

/* 2) партия с другим факт шт/кг — pcsPerKg ручной не должен измениться */
const A = { costKg: 30, weightKg: 1, pieces: 5 }; /* факт 5 шт/кг, себес партии 6 */
const expectBatch = costPieceFromBatch_(A.costKg, A.weightKg, A.pieces);
const expectFactPcs = pcsPerKgFromBatch_(A.weightKg, A.pieces);
const saveBatch = await post({
  action: "savePieceBatch",
  sku: SKU,
  skuId: SKU_ID,
  batchDate: BATCH_DATE,
  ...A
});

const listAfterBatch = await post({ action: "listRawCosts" });
const kneeBatch = ((listAfterBatch && listAfterBatch.items) || []).find(
  (it) => it.skuId === SKU_ID || it.sku === SKU
);

const pcsUnchanged =
  kneeBatch &&
  Number(kneeBatch.pcsPerKg) === Number(PCS_PER_KG) &&
  Number(kneeBatch.cost) === Number(EXPECT_COST) &&
  Number(kneeBatch.calcCost) === Number(EXPECT_COST) &&
  Number(kneeBatch.batchPcsPerKg) === Number(expectFactPcs) &&
  Number(kneeBatch.pcsPerKg) !== Number(expectFactPcs);

const rows = d1(
  "SELECT id FROM raw_piece_batch WHERE batch_date = '" + BATCH_DATE + "' AND sku_id = '" + SKU_ID + "'"
);
const deleted = [];
for (const r of rows) {
  deleted.push(await post({ action: "deletePieceBatch", id: r.id }));
}
try {
  d1("DELETE FROM raw_cost_ver WHERE effective_from LIKE '2099-%'");
} catch (eClean) {}

const leftBat = d1(
  "SELECT COUNT(*) as n FROM raw_piece_batch WHERE batch_date = '" + BATCH_DATE + "' AND sku_id = '" + SKU_ID + "'"
);
const leftVer = d1("SELECT COUNT(*) as n FROM raw_cost_ver WHERE effective_from LIKE '2099-%'");

const report = {
  expect: { cost: EXPECT_COST, costKg: COST_KG, pcsPerKg: PCS_PER_KG, batchCost: expectBatch, factPcs: expectFactPcs },
  saveManual,
  kneeManual: kneeManual && {
    cost: kneeManual.cost,
    costKg: kneeManual.costKg,
    pcsPerKg: kneeManual.pcsPerKg,
    calcCost: kneeManual.calcCost
  },
  saveBatch,
  kneeBatch: kneeBatch && {
    cost: kneeBatch.cost,
    pcsPerKg: kneeBatch.pcsPerKg,
    calcCost: kneeBatch.calcCost,
    batchAvg: kneeBatch.batchAvg,
    batchPcsPerKg: kneeBatch.batchPcsPerKg,
    lastBatchCost: kneeBatch.lastBatchCost
  },
  pcsUnchanged,
  deleted,
  leftBat: leftBat[0],
  leftVer: leftVer[0],
  backup: snapKey
};
writeFileSync(join(outDir, "live.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (!saveManual || saveManual.status !== "success") process.exit(1);
if (Number(saveManual.cost) !== Number(EXPECT_COST)) process.exit(2);
if (!(saveManual.fromPcsKg || Number(saveManual.pcsPerKg) === PCS_PER_KG)) process.exit(3);
if (!saveBatch || saveBatch.status !== "success") process.exit(4);
if (!pcsUnchanged) process.exit(5);
if (!(leftBat[0] && Number(leftBat[0].n) === 0)) process.exit(6);
if (!(leftVer[0] && Number(leftVer[0].n) === 0)) process.exit(7);
