/**
 * Live: снимок → saveRawCost кг+усушка на future date → проверить cost.
 * Карточки не пишет. Нужен TELEGRAM_BOT_TOKEN.
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cost100FromKgShrink_ } from "../boinya-c/proxy/price-canon-v2.js";

const root = dirname(fileURLToPath(import.meta.url));
const proxy = join(root, "..", "boinya-c", "proxy");
const outDir = process.env.RAW_KG_OUT || join(root, "..", "artifacts", "raw-kg-shrink");
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

const costKg = 20;
const shrinkPct = 80;
const expect = cost100FromKgShrink_(costKg, shrinkPct);
const from = "2099-01-01"; /* future — не влияет на сегодняшний calc */

/* снимок до записи */
const beforeN = d1("SELECT COUNT(*) as n FROM raw_cost_ver");
const snapKey = "rawKgShrinkBackup:2026-11-04";
const pack = {
  at: new Date().toISOString(),
  n: beforeN[0] && beforeN[0].n,
  note: "before raw-kg-shrink live save ЛЁГКОЕ " + from
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

const res = await fetch(WORKER, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    action: "saveRawCost",
    cutover: 1,
    initData,
    sku: "ЛЁГКОЕ",
    costKg,
    shrinkPct,
    effectiveFrom: from
  })
});
const text = await res.text();
let json = null;
try {
  json = JSON.parse(text);
} catch (e) {
  console.error(text.slice(0, 400));
  process.exit(1);
}

const rows = d1(
  "SELECT sku, cost, cost_kg, shrink_pct, effective_from, source FROM raw_cost_ver WHERE effective_from = '2099-01-01' AND sku LIKE '%ЛЁГК%' ORDER BY id DESC LIMIT 3"
);

const report = {
  expect,
  save: json,
  d1: rows,
  backup: snapKey,
  beforeN: beforeN[0]
};
writeFileSync(join(outDir, "live.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (!json || json.status !== "success") process.exit(1);
if (Number(json.cost) !== Number(expect)) process.exit(2);
if (!(rows[0] && Number(rows[0].cost) === Number(expect) && Number(rows[0].cost_kg) === costKg)) process.exit(3);
