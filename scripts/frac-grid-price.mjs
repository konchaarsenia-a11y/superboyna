/**
 * Новая сетка фракций только в прайсе новых заказов.
 * Перед записью кладёт копию снимка и сумм, если их ещё нет.
 * Заказы и подписки не переписывает. Чужие ключи и крошки не меняет.
 * node scripts/frac-grid-price.mjs --apply
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFirstJson } from "./ig-price-align.mjs";
import { sumSubscriptions } from "./crumb-mix3-verify.mjs";

export const BACKUP_KEY = "retailPricesBackup:frac-grid:20261027";
export const MONEY_KEY = "fracGridMoney:20261031";
export const GRID = {
  "СЕРДЦЕ|Очень мелкое": 15,
  "БАРАНЬЕ ЛЁГКОЕ|Среднее": 19,
  "БАРАНЬЕ ЛЁГКОЕ|Мелкое": 20,
  "ПЕЧЕНЬ|Кусочки": 11,
  "ПЕЧЕНЬ|Мелкое": 12,
  "ВЫМЯ|Кусочки": 10,
  "ВЫМЯ|Мелкое": 11,
  "СЕМЕННИКИ|Кусочки": 13,
  "СЕМЕННИКИ|Мелкое": 14,
  "МЯСНЫЕ ЛОМТИКИ|Кусочки": 16,
  "МЯСНЫЕ ЛОМТИКИ|Мелкое": 17
};

const SEGMENT_SQL = [
  "SELECT IFNULL(segment, '') AS segment, COUNT(*) AS n,",
  " printf('%.2f', IFNULL(SUM(IFNULL(CAST(json_extract(meta_json, '$.orderPrice') AS REAL), 0)), 0)) AS orderSum",
  "FROM orders GROUP BY IFNULL(segment, '') ORDER BY segment"
].join(" ");

function sqlStr(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function crumbStamp(items) {
  return (items || [])
    .filter((it) => /КРОШК/.test(String((it && it.key) || "").toUpperCase()))
    .map((it) => it.key + "=" + it.kind + ":" + it.price)
    .sort()
    .join("|");
}

function otherStamp(items) {
  return (items || [])
    .filter((it) => it && !Object.prototype.hasOwnProperty.call(GRID, it.key))
    .map((it) => it.key + "=" + it.kind + ":" + it.price)
    .sort()
    .join("|");
}

export function setFracGrid(items) {
  const before = items || [];
  const hadZucchini = before.some((it) => /КАБАЧ/.test(String((it && it.key) || "").toUpperCase()));
  const crumbsBefore = crumbStamp(before);
  const othersBefore = otherStamp(before);
  const list = before.map((it) => Object.assign({}, it));
  const changed = [];
  Object.keys(GRID).forEach((key) => {
    const hit = list.find((it) => it && it.key === key);
    if (!hit) {
      list.push({ key: key, kind: "per100", price: GRID[key] });
      changed.push(key);
    } else if (Number(hit.price) !== GRID[key] || String(hit.kind || "") !== "per100") {
      hit.price = GRID[key];
      hit.kind = "per100";
      changed.push(key);
    }
  });
  if (list.length < before.length) throw new Error("delete");
  const hasZucchini = list.some((it) => /КАБАЧ/.test(String((it && it.key) || "").toUpperCase()));
  if (hasZucchini !== hadZucchini) throw new Error("кабачок");
  if (crumbStamp(list) !== crumbsBefore) throw new Error("крошка");
  if (otherStamp(list) !== othersBefore) throw new Error("чужой ключ");
  Object.keys(GRID).forEach((key) => {
    const live = list.find((it) => it && it.key === key);
    if (!live || Number(live.price) !== GRID[key] || live.kind !== "per100") throw new Error("цена " + key);
  });
  return { items: list, changed };
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

function moneyStamp(segments, subsPayload) {
  const subs = sumSubscriptions(subsPayload);
  return {
    segments: (segments || []).map((row) => ({
      segment: String((row && row.segment) || ""),
      n: Number(row && row.n) || 0,
      orderSum: String(row && row.orderSum != null ? row.orderSum : "0.00")
    })),
    ppCards: ppCardsOf(subs),
    subsN: Number(subs.n) || 0
  };
}

function readMoney() {
  const subsRows = d1("SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'");
  if (!subsRows.length) {
    console.error("NO_SUBS_SNAP");
    process.exit(1);
  }
  return moneyStamp(d1(SEGMENT_SQL), payloadOf(subsRows[0]));
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
  const moneyBefore = readMoney();
  const snapRows = d1("SELECT payload FROM snap_cache WHERE cache_key = 'retailPrices'");
  const snap = payloadOf(snapRows[0]);
  if (!snap || !Array.isArray(snap.items)) {
    console.error("NO_RETAIL_SNAP");
    process.exit(1);
  }
  const aligned = setFracGrid(snap.items);
  const backupState = insertIfAbsent(BACKUP_KEY, JSON.stringify(snap));
  const moneyState = insertIfAbsent(MONEY_KEY, JSON.stringify(Object.assign({ at: new Date().toISOString() }, moneyBefore)));
  const storedRows = d1("SELECT payload FROM snap_cache WHERE cache_key = " + sqlStr(MONEY_KEY));
  const stored = payloadOf(storedRows[0]) || {};
  if (aligned.changed.length) {
    const next = Object.assign({}, snap, {
      items: aligned.items,
      cachedAt: new Date().toISOString(),
      fracGrid: "20261027"
    });
    const now = new Date().toISOString();
    d1(
      "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES ('retailPrices', " +
        sqlStr(JSON.stringify(next)) + ", " + sqlStr(now) +
        ") ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
    );
  }
  const now = new Date().toISOString();
  Object.keys(GRID).forEach((key) => {
    d1(
      "INSERT INTO retail_prices (sku, price, source, updated_at) VALUES (" +
        sqlStr(key) + ", " + GRID[key] + ", 'frac-grid', " + sqlStr(now) +
        ") ON CONFLICT(sku) DO UPDATE SET price = excluded.price, source = excluded.source, updated_at = excluded.updated_at"
    );
  });
  const live = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'retailPrices'")[0]);
  const moneyAfter = readMoney();
  const sameRun = JSON.stringify(moneyBefore) === JSON.stringify(moneyAfter);
  const storedCore = {
    segments: stored.segments || [],
    ppCards: stored.ppCards || {},
    subsN: Number(stored.subsN) || 0
  };
  const sameStored = JSON.stringify(moneyBefore) === JSON.stringify(storedCore);
  const priceOk = Object.keys(GRID).every((key) => {
    const row = (live.items || []).find((it) => it && it.key === key);
    return !!(row && Number(row.price) === GRID[key] && row.kind === "per100");
  });
  const kept = (live.items || []).length >= snap.items.length &&
    crumbStamp(live.items) === crumbStamp(snap.items) &&
    otherStamp(live.items) === otherStamp(snap.items);
  const pp = (moneyAfter.segments || []).find((row) => row.segment === "ПП") || { n: 0, orderSum: "0.00" };
  const out = {
    ok: priceOk && kept && sameRun && sameStored,
    backup: backupState,
    moneyBackup: moneyState,
    changed: aligned.changed,
    itemsBefore: snap.items.length,
    itemsAfter: (live.items || []).length,
    ordersN: moneyAfter.segments.reduce((sum, row) => sum + row.n, 0),
    ordersSum: moneyAfter.segments.reduce((sum, row) => sum + Number(row.orderSum), 0).toFixed(2),
    ppOrdersN: pp.n,
    ppOrdersSum: pp.orderSum,
    ppCards: moneyAfter.ppCards,
    sameRun: sameRun,
    sameStored: sameStored
  };
  console.log(JSON.stringify(out));
  if (!out.ok) process.exit(1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain && process.argv.includes("--apply")) main();
