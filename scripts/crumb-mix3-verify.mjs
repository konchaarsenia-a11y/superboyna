/**
 * Сверка сумм заказов и ПП до/после схемы крошек.
 * Пишет только snap crumbMix3Backup:20261026, если его ещё нет.
 * Заказы, подписки и цены не обновляет.
 * node scripts/crumb-mix3-verify.mjs --apply
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BACKUP_KEY = "crumbMix3Backup:20261026";
export const MONEY_KEY = "crumbMix3MoneyBackup:20261026";

const SEGMENT_SQL = [
  "SELECT IFNULL(segment, '') AS segment, COUNT(*) AS n,",
  " printf('%.2f', IFNULL(SUM(IFNULL(CAST(json_extract(meta_json, '$.orderPrice') AS REAL), 0)), 0)) AS orderSum,",
  " printf('%.2f', IFNULL(SUM(IFNULL(CAST(json_extract(meta_json, '$.statedCost') AS REAL), 0)), 0)) AS statedSum,",
  " printf('%.2f', IFNULL(SUM(IFNULL(CAST(json_extract(meta_json, '$.factCost') AS REAL), 0)), 0)) AS factSum",
  "FROM orders GROUP BY IFNULL(segment, '') ORDER BY segment"
].join(" ");

const SUMS_SQL = [
  "SELECT",
  " (SELECT COUNT(*) FROM orders) AS ordersN,",
  " printf('%.2f', IFNULL(SUM(CASE",
  "   WHEN meta_json IS NULL OR meta_json = '' THEN 0",
  "   ELSE IFNULL(CAST(json_extract(meta_json, '$.orderPrice') AS REAL), 0)",
  " END), 0)) AS ordersSum,",
  " (SELECT COUNT(*) FROM subs WHERE UPPER(TRIM(sheet)) = 'ПП') AS ppN,",
  " (SELECT printf('%.2f', SUM(IFNULL(price, 0))) FROM subs WHERE UPPER(TRIM(sheet)) = 'ПП') AS ppSum,",
  " (SELECT COUNT(*) FROM subs) AS subsN,",
  " (SELECT printf('%.2f', SUM(IFNULL(price, 0))) FROM subs) AS subsSum,",
  " (SELECT COUNT(*) FROM orders WHERE instr(IFNULL(basket_json, ''), 'mix3:') > 0) AS ordersMix3,",
  " (SELECT COUNT(*) FROM subs WHERE instr(IFNULL(basket_json, ''), 'mix3:') > 0) AS subsMix3",
  "FROM orders"
].join(" ");

const SHEETS_SQL = [
  "SELECT TRIM(sheet) AS sheet, COUNT(*) AS n,",
  " printf('%.2f', IFNULL(SUM(IFNULL(price, 0)), 0)) AS total",
  "FROM subs GROUP BY TRIM(sheet) ORDER BY sheet"
].join(" ");

function sqlStr(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

export function parseFirstJson(raw) {
  const at = String(raw || "").search(/[\[{]/);
  if (at < 0) throw new Error(String(raw || "").slice(0, 300) || "empty d1 output");
  const slice = raw.slice(at);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < slice.length; i++) {
    const c = slice[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === "\"") inStr = false;
      continue;
    }
    if (c === "\"") inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return JSON.parse(slice.slice(0, i + 1));
    }
  }
  return JSON.parse(slice);
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

function sheetsOf(rows) {
  return (rows || []).map((row) => ({
    sheet: String((row && row.sheet) || ""),
    n: Number(row && row.n) || 0,
    total: String(row && row.total != null ? row.total : "0.00")
  }));
}

function stamp(row, sheets) {
  const src = row || {};
  return {
    ordersN: Number(src.ordersN) || 0,
    ordersSum: String(src.ordersSum == null ? "0.00" : src.ordersSum),
    ppN: Number(src.ppN) || 0,
    ppSum: String(src.ppSum == null ? "0.00" : src.ppSum),
    subsN: Number(src.subsN) || 0,
    subsSum: String(src.subsSum == null ? "0.00" : src.subsSum),
    ordersMix3: Number(src.ordersMix3) || 0,
    subsMix3: Number(src.subsMix3) || 0,
    sheets: sheetsOf(sheets)
  };
}

function core(row) {
  const s = row && row.ordersN != null && Array.isArray(row.sheets) ? row : stamp(row, row && row.sheets);
  return {
    ordersN: s.ordersN,
    ordersSum: s.ordersSum,
    ppN: s.ppN,
    ppSum: s.ppSum,
    subsN: s.subsN,
    subsSum: s.subsSum,
    ordersMix3: s.ordersMix3,
    subsMix3: s.subsMix3,
    sheets: s.sheets || []
  };
}

function same(a, b) {
  return JSON.stringify(core(a)) === JSON.stringify(core(b));
}

function num(value) {
  const n = Number(String(value == null ? "" : value).replace(",", "."));
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function addMoney(bucket, row) {
  bucket.stated = Math.round((bucket.stated + num(row && row.statedCost)) * 100) / 100;
  bucket.fact = Math.round((bucket.fact + num(row && row.factCost)) * 100) / 100;
  bucket.price = Math.round((bucket.price + num(row && row.price)) * 100) / 100;
  bucket.orderPrice = Math.round((bucket.orderPrice + num(row && row.orderPrice)) * 100) / 100;
  bucket.clientPrice = Math.round((bucket.clientPrice + num(row && row.clientPrice)) * 100) / 100;
}

function emptyBucket() {
  return { n: 0, stated: 0, fact: 0, price: 0, orderPrice: 0, clientPrice: 0, mix3: 0 };
}

function countMix3(list) {
  let n = 0;
  (Array.isArray(list) ? list : []).forEach((line) => {
    if (line && /^mix3:/i.test(String(line.crumbKind || ""))) n++;
  });
  return n;
}

export function sumSubscriptions(payload) {
  const arr = (payload && (payload.subscriptions || payload.items || payload.list)) || [];
  const by = {};
  arr.forEach((it) => {
    const sheet = String((it && (it.sheet || it.segment)) || "").trim().toLowerCase() || "?";
    if (!by[sheet]) by[sheet] = emptyBucket();
    by[sheet].n++;
    addMoney(by[sheet], it);
    by[sheet].mix3 += countMix3(it && it.basket) + countMix3(it && it.basket2) + countMix3(it && it.monthlyBasket) + countMix3(it && it.basketBp1);
  });
  const ordered = {};
  Object.keys(by).sort().forEach((key) => { ordered[key] = by[key]; });
  return { n: arr.length, by: ordered };
}

function moneyStamp(segments, subs) {
  return {
    segments: (segments || []).map((row) => ({
      segment: String((row && row.segment) || ""),
      n: Number(row && row.n) || 0,
      orderSum: String(row && row.orderSum != null ? row.orderSum : "0.00"),
      statedSum: String(row && row.statedSum != null ? row.statedSum : "0.00"),
      factSum: String(row && row.factSum != null ? row.factSum : "0.00")
    })),
    subs: subs
  };
}

function main() {
  if (!process.argv.includes("--apply")) {
    console.error("pass --apply");
    process.exit(1);
  }
  const before = stamp(d1(SUMS_SQL)[0], d1(SHEETS_SQL));
  const existing = d1("SELECT payload FROM snap_cache WHERE cache_key = " + sqlStr(BACKUP_KEY));
  let backupState = "exists";
  if (!existing.length) {
    const payload = JSON.stringify(Object.assign({ at: new Date().toISOString() }, before));
    d1(
      "INSERT INTO snap_cache (cache_key, payload, updated_at) SELECT " +
        sqlStr(BACKUP_KEY) + ", " + sqlStr(payload) + ", " + sqlStr(new Date().toISOString()) +
        " WHERE NOT EXISTS (SELECT 1 FROM snap_cache WHERE cache_key = " + sqlStr(BACKUP_KEY) + ")"
    );
    backupState = "inserted";
  }
  const storedRows = d1("SELECT payload FROM snap_cache WHERE cache_key = " + sqlStr(BACKUP_KEY));
  if (!storedRows.length) {
    console.error("NO_BACKUP");
    process.exit(1);
  }
  let stored = storedRows[0].payload;
  if (typeof stored === "string") stored = JSON.parse(stored);
  const after = stamp(d1(SUMS_SQL)[0], d1(SHEETS_SQL));
  const ok = same(before, after) && same(before, stored);
  const subsRows = d1("SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'");
  if (!subsRows.length) {
    console.error("NO_SUBS_SNAP");
    process.exit(1);
  }
  let subsPayload = subsRows[0] && subsRows[0].payload;
  if (typeof subsPayload === "string") subsPayload = JSON.parse(subsPayload);
  const moneyBefore = moneyStamp(d1(SEGMENT_SQL), sumSubscriptions(subsPayload));
  const moneyExisting = d1("SELECT payload FROM snap_cache WHERE cache_key = " + sqlStr(MONEY_KEY));
  let moneyState = "exists";
  if (!moneyExisting.length) {
    d1(
      "INSERT INTO snap_cache (cache_key, payload, updated_at) SELECT " +
        sqlStr(MONEY_KEY) + ", " + sqlStr(JSON.stringify(Object.assign({ at: new Date().toISOString() }, moneyBefore))) +
        ", " + sqlStr(new Date().toISOString()) +
        " WHERE NOT EXISTS (SELECT 1 FROM snap_cache WHERE cache_key = " + sqlStr(MONEY_KEY) + ")"
    );
    moneyState = "inserted";
  }
  const moneyStoredRows = d1("SELECT payload FROM snap_cache WHERE cache_key = " + sqlStr(MONEY_KEY));
  if (!moneyStoredRows.length) {
    console.error("NO_MONEY_BACKUP");
    process.exit(1);
  }
  let moneyStored = moneyStoredRows[0].payload;
  if (typeof moneyStored === "string") moneyStored = JSON.parse(moneyStored);
  const moneyAfter = moneyStamp(d1(SEGMENT_SQL), sumSubscriptions(subsPayload));
  const moneyOk = JSON.stringify(moneyBefore) === JSON.stringify(moneyAfter) &&
    JSON.stringify(moneyBefore.segments) === JSON.stringify(moneyStored.segments) &&
    JSON.stringify(moneyBefore.subs) === JSON.stringify(moneyStored.subs);
  const out = {
    ok: ok && moneyOk,
    backup: backupState,
    moneyBackup: moneyState,
    before: before,
    after: after,
    stored: core(stored),
    money: moneyBefore
  };
  console.log(JSON.stringify(out));
  if (!ok || !moneyOk) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith("crumb-mix3-verify.mjs")) main();
