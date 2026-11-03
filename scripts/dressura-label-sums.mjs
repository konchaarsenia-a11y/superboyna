/**
 * Сверка сумм заказов и ПП до и после переименования подписей фракций.
 * Пишет только snap dressuraLabelMoney:20261027, если его ещё нет.
 * Заказы, подписки и цены не обновляет.
 * node scripts/dressura-label-sums.mjs --apply
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFirstJson } from "./ig-price-align.mjs";
import { sumSubscriptions } from "./crumb-mix3-verify.mjs";

export const MONEY_KEY = "dressuraLabelMoney:20261027";

const SEGMENT_SQL = [
  "SELECT IFNULL(segment, '') AS segment, COUNT(*) AS n,",
  " printf('%.2f', IFNULL(SUM(IFNULL(CAST(json_extract(meta_json, '$.orderPrice') AS REAL), 0)), 0)) AS orderSum",
  "FROM orders GROUP BY IFNULL(segment, '') ORDER BY segment"
].join(" ");

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

function ppCardsOf(subs) {
  const by = (subs && subs.by) || {};
  const pp = by["пп"] || by["pp"] || { n: 0, stated: 0, fact: 0, clientPrice: 0, mix3: 0 };
  return {
    n: Number(pp.n) || 0,
    stated: money2(pp.stated),
    fact: money2(pp.fact),
    clientPrice: money2(pp.clientPrice),
    mix3: Number(pp.mix3) || 0
  };
}

function priceStamp(items) {
  return (items || [])
    .filter((it) => it && it.key)
    .map((it) => it.key + "=" + String(it.kind || "") + ":" + it.price)
    .sort()
    .join("|");
}

function readMoney() {
  const subsRows = d1("SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'");
  if (!subsRows.length) {
    console.error("NO_SUBS_SNAP");
    process.exit(1);
  }
  const subs = sumSubscriptions(payloadOf(subsRows[0]));
  const segments = d1(SEGMENT_SQL).map((row) => ({
    segment: String((row && row.segment) || ""),
    n: Number(row && row.n) || 0,
    orderSum: String(row && row.orderSum != null ? row.orderSum : "0.00")
  }));
  const snap = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'retailPrices'")[0]);
  const items = (snap && snap.items) || [];
  const rumen = items.find((it) => it && it.key === "РУБЕЦ Т|Очень мелкое");
  const heart = items.find((it) => it && it.key === "СЕРДЦЕ|Кусочки");
  return {
    segments: segments,
    ppCards: ppCardsOf(subs),
    subsN: Number(subs.n) || 0,
    priceItems: items.length,
    rumenPer100: rumen ? Number(rumen.price) : null,
    heartKusPer100: heart ? Number(heart.price) : null,
    priceStamp: priceStamp(items)
  };
}

function core(stamp) {
  return {
    segments: (stamp && stamp.segments) || [],
    ppCards: (stamp && stamp.ppCards) || {},
    subsN: Number(stamp && stamp.subsN) || 0,
    priceItems: Number(stamp && stamp.priceItems) || 0,
    rumenPer100: stamp && stamp.rumenPer100 != null ? Number(stamp.rumenPer100) : null,
    heartKusPer100: stamp && stamp.heartKusPer100 != null ? Number(stamp.heartKusPer100) : null,
    priceStamp: String((stamp && stamp.priceStamp) || "")
  };
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
  if (!process.argv.includes("--apply")) {
    console.error("pass --apply");
    process.exit(1);
  }
  const before = readMoney();
  const state = insertIfAbsent(MONEY_KEY, JSON.stringify(Object.assign({ at: new Date().toISOString() }, before)));
  const stored = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = " + sqlStr(MONEY_KEY))[0]) || {};
  const after = readMoney();
  const sameRun = JSON.stringify(core(before)) === JSON.stringify(core(after));
  const sameStored = JSON.stringify(core(before)) === JSON.stringify(core(stored));
  const ordersN = after.segments.reduce((sum, row) => sum + row.n, 0);
  const ordersSum = after.segments.reduce((sum, row) => sum + Number(row.orderSum), 0).toFixed(2);
  const pp = after.segments.find((row) => row.segment === "ПП") || { n: 0, orderSum: "0.00" };
  const out = {
    ok: sameRun && sameStored,
    moneyBackup: state,
    ordersN: ordersN,
    ordersSum: ordersSum,
    ppN: pp.n,
    ppSum: pp.orderSum,
    ppCards: after.ppCards,
    priceItems: after.priceItems,
    rumenPer100: after.rumenPer100,
    heartKusPer100: after.heartKusPer100,
    segments: after.segments.map((row) => ({ segment: row.segment, n: row.n, orderSum: row.orderSum }))
  };
  console.log(JSON.stringify(out));
  if (!out.ok) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith("dressura-label-sums.mjs")) main();
