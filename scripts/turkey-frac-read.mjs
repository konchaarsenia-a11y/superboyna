/**
 * Снимок сумм до/после выбора фракций индейки.
 * Прайс не пишет и строки не удаляет.
 * node scripts/turkey-frac-read.mjs --apply
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFirstJson } from "./ig-price-align.mjs";
import { sumSubscriptions } from "./crumb-mix3-verify.mjs";

export const MONEY_KEY = "turkeyFracMoney:20261027";

const SEGMENT_SQL = [
  "SELECT IFNULL(segment, '') AS segment, COUNT(*) AS n,",
  " printf('%.2f', IFNULL(SUM(IFNULL(CAST(json_extract(meta_json, '$.orderPrice') AS REAL), 0)), 0)) AS orderSum",
  "FROM orders GROUP BY IFNULL(segment, '') ORDER BY segment"
].join(" ");

const TURKEY_KEYS = [
  "ИНДЕЙКА|Ломтики",
  "ИНДЕЙКА|Кусочки",
  "ИНДЕЙКА|Мелкое",
  "ИНДЕЙКА|Мелкие кусочки",
  "ИНДЕЙКА|Полоски"
];

function sqlStr(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function d1(sql) {
  const proxy = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../boinya-c/proxy");
  const r = spawnSync(
    "npx",
    ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: proxy, encoding: "utf8", env: process.env, maxBuffer: 32 * 1024 * 1024 }
  );
  if (r.status !== 0) {
    console.error((r.stderr || r.stdout || "").slice(0, 2000));
    process.exit(r.status || 1);
  }
  const data = parseFirstJson(r.stdout || "");
  const blocks = Array.isArray(data) ? data : [data];
  const rows = [];
  blocks.forEach((block) => {
    if (block && Array.isArray(block.results)) rows.push(...block.results);
  });
  return rows;
}

function payloadOf(row) {
  if (!row) return null;
  let payload = row.payload;
  if (typeof payload === "string") payload = JSON.parse(payload);
  return payload;
}

function money2(value) {
  const n = Number(value);
  return isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : "0.00";
}

function readMoney() {
  const subsRows = d1("SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'");
  if (!subsRows.length) {
    console.error("NO_SUBS_SNAP");
    process.exit(1);
  }
  const subs = sumSubscriptions(payloadOf(subsRows[0]));
  const by = (subs && subs.by) || {};
  const pp = by["пп"] || by["pp"] || { n: 0, stated: 0, fact: 0, mix3: 0 };
  return {
    segments: d1(SEGMENT_SQL).map((row) => ({
      segment: String((row && row.segment) || ""),
      n: Number(row && row.n) || 0,
      orderSum: String(row && row.orderSum != null ? row.orderSum : "0.00")
    })),
    ppCards: {
      n: Number(pp.n) || 0,
      stated: money2(pp.stated),
      fact: money2(pp.fact),
      mix3: Number(pp.mix3) || 0
    },
    subsN: Number(subs.n) || 0
  };
}

function turkeyOf(items) {
  const out = {};
  TURKEY_KEYS.forEach((key) => {
    const hit = (items || []).find((it) => it && it.key === key);
    out[key] = hit ? { price: Number(hit.price), kind: String(hit.kind || "") } : null;
  });
  return out;
}

function insertIfAbsent(key, payload) {
  const existing = d1("SELECT cache_key FROM snap_cache WHERE cache_key = " + sqlStr(key));
  if (existing.length) return "exists";
  d1(
    "INSERT INTO snap_cache (cache_key, payload, updated_at) SELECT " +
      sqlStr(key) + ", " + sqlStr(payload) + ", " + sqlStr(new Date().toISOString()) +
      " WHERE NOT EXISTS (SELECT 1 FROM snap_cache WHERE cache_key = " + sqlStr(key) + ")"
  );
  const check = d1("SELECT cache_key FROM snap_cache WHERE cache_key = " + sqlStr(key));
  if (!check.length) {
    console.error("NO_BACKUP " + key);
    process.exit(1);
  }
  return "inserted";
}

function main() {
  const before = readMoney();
  const snapRows = d1("SELECT payload FROM snap_cache WHERE cache_key = 'retailPrices'");
  const snap = payloadOf(snapRows[0]);
  const items = (snap && snap.items) || [];
  const turkeyBefore = turkeyOf(items);
  const moneyState = insertIfAbsent(
    MONEY_KEY,
    JSON.stringify(Object.assign({ at: new Date().toISOString(), turkey: turkeyBefore }, before))
  );
  const stored = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = " + sqlStr(MONEY_KEY))[0]) || {};
  const after = readMoney();
  const afterSnap = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'retailPrices'")[0]) || {};
  const turkeyAfter = turkeyOf(afterSnap.items);
  const sameRun = JSON.stringify(before) === JSON.stringify(after);
  const storedCore = {
    segments: stored.segments || [],
    ppCards: stored.ppCards || {},
    subsN: Number(stored.subsN) || 0
  };
  const stripsKept = JSON.stringify(turkeyBefore["ИНДЕЙКА|Полоски"]) === JSON.stringify(turkeyAfter["ИНДЕЙКА|Полоски"]);
  const pp = (after.segments || []).find((row) => row.segment === "ПП") || { n: 0, orderSum: "0.00" };
  const out = {
    ok: sameRun && JSON.stringify(before) === JSON.stringify(storedCore) && stripsKept,
    moneyBackup: moneyState,
    turkey: turkeyAfter,
    ordersN: after.segments.reduce((sum, row) => sum + row.n, 0),
    ordersSum: after.segments.reduce((sum, row) => sum + Number(row.orderSum), 0).toFixed(2),
    ppOrdersN: pp.n,
    ppOrdersSum: pp.orderSum,
    ppCards: after.ppCards
  };
  console.log(JSON.stringify(out));
  if (!out.ok) process.exit(1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain && process.argv.includes("--apply")) main();
