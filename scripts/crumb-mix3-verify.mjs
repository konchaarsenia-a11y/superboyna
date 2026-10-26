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
  const out = {
    ok: ok,
    backup: backupState,
    before: before,
    after: after,
    stored: core(stored)
  };
  console.log(JSON.stringify(out));
  if (!ok) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith("crumb-mix3-verify.mjs")) main();
