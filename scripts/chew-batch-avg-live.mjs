/**
 * Live: снимок → 2 партии жевалок → себес каждой + средняя → cleanup.
 * Карточки/цены клиентов не пишет. Нужен TELEGRAM_BOT_TOKEN.
 * chew-batch-avg marker.
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  costPieceFromBatch_,
  weightedAvgPieceCost_
} from "../boinya-c/proxy/price-canon-v2.js";

const root = dirname(fileURLToPath(import.meta.url));
const proxy = join(root, "..", "boinya-c", "proxy");
const outDir = process.env.CHEW_BATCH_OUT || join(root, "..", "artifacts", "chew-batch-avg");
const WORKER = "https://boinya-c.konchaarsenia.workers.dev/";
const OWNER_ID = Number(process.env.PP_AUDIT_TG_ID || "650923866");
const OWNER_NAME = process.env.PP_AUDIT_TG_NAME || "Арсений";
const SKU = "КОЛЕНИ";
const SKU_ID = "KOLENI";
const BATCH_DATE = "2099-02-01"; /* future — не путаем с живыми партиями */

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

/* chew-batch-avg: схема до записи (снимок). */
d1(
  "CREATE TABLE IF NOT EXISTS raw_piece_batch (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, sku_id TEXT NOT NULL, sku TEXT NOT NULL DEFAULT '', " +
    "batch_date TEXT NOT NULL, cost_kg REAL NOT NULL, weight_kg REAL NOT NULL, pieces REAL NOT NULL, " +
    "cost_piece REAL NOT NULL, created_at TEXT NOT NULL, actor_tg TEXT, source TEXT)"
);

/* удалить прошлый LEGKOE 2099 и тестовые партии на BATCH_DATE */
try {
  d1("DELETE FROM raw_cost_ver WHERE effective_from = '2099-01-01' AND sku LIKE '%ЛЁГКОЕ%'");
} catch (eDel) {}
try {
  d1("DELETE FROM raw_cost_ver WHERE effective_from = '2099-01-01' AND sku LIKE '%ЛЕГКОЕ%'");
} catch (eDel2) {}
try {
  d1("DELETE FROM raw_piece_batch WHERE batch_date = '" + BATCH_DATE + "' AND sku_id = '" + SKU_ID + "'");
} catch (eDel3) {}

const beforeN = d1("SELECT COUNT(*) as n FROM raw_piece_batch");
const snapKey = "chewBatchAvgBackup:2026-11-04";
const pack = {
  at: new Date().toISOString(),
  n: beforeN[0] && beforeN[0].n,
  note: "before chew-batch-avg live 2 batches " + SKU_ID + " " + BATCH_DATE
};
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

/* партия A: 10 BYN/кг × 2 кг / 20 шт = 1.0; партия B: 20 × 1.5 / 30 = 1.0 → wait use unequal for avg demo */
const A = { costKg: 10, weightKg: 2, pieces: 20 }; /* cost 1.0 */
const B = { costKg: 30, weightKg: 1, pieces: 10 }; /* cost 3.0 */
const expectA = costPieceFromBatch_(A.costKg, A.weightKg, A.pieces);
const expectB = costPieceFromBatch_(B.costKg, B.weightKg, B.pieces);
const expectAvg = weightedAvgPieceCost_([
  { pieces: A.pieces, costPiece: expectA },
  { pieces: B.pieces, costPiece: expectB }
]);

async function saveBatch(body) {
  const res = await fetch(WORKER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      Object.assign(
        {
          action: "savePieceBatch",
          cutover: 1,
          initData,
          sku: SKU,
          skuId: SKU_ID,
          batchDate: BATCH_DATE
        },
        body
      )
    )
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { parseError: text.slice(0, 400) };
  }
  return json;
}

const save1 = await saveBatch(A);
const save2 = await saveBatch(B);

let rows = [];
try {
  rows = d1(
    "SELECT id, sku_id, cost_kg, weight_kg, pieces, cost_piece, batch_date FROM raw_piece_batch " +
      "WHERE batch_date = '" +
      BATCH_DATE +
      "' AND sku_id = '" +
      SKU_ID +
      "' ORDER BY id ASC"
  );
} catch (eSel) {
  rows = [{ error: String(eSel && eSel.message) }];
}

const ids = rows.map((r) => r.id).filter((x) => x > 0);

/* cleanup тестовых партий после проверки */
let deleted = [];
for (const id of ids) {
  const delRes = await fetch(WORKER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "deletePieceBatch",
      cutover: 1,
      initData,
      id
    })
  });
  let dj = null;
  try {
    dj = JSON.parse(await delRes.text());
  } catch (eD) {
    dj = { parseError: true };
  }
  deleted.push(dj);
}

/* повторно подчистить LEGKOE 2099 на всякий */
try {
  d1("DELETE FROM raw_cost_ver WHERE effective_from = '2099-01-01'");
} catch (eClean) {}

const left = d1(
  "SELECT COUNT(*) as n FROM raw_piece_batch WHERE batch_date = '" + BATCH_DATE + "' AND sku_id = '" + SKU_ID + "'"
);

const report = {
  expect: { A: expectA, B: expectB, avg: expectAvg },
  save1,
  save2,
  d1: rows,
  deleted,
  left: left[0],
  backup: snapKey,
  beforeN: beforeN[0]
};
writeFileSync(join(outDir, "live.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (!save1 || save1.status !== "success") process.exit(1);
if (!save2 || save2.status !== "success") process.exit(2);
if (Number(save1.costPiece) !== Number(expectA)) process.exit(3);
if (Number(save2.costPiece) !== Number(expectB)) process.exit(4);
if (Number(save2.batchAvg) !== Number(expectAvg)) process.exit(5);
if (!(rows.length >= 2)) process.exit(6);
if (!(left[0] && Number(left[0].n) === 0)) process.exit(7);
