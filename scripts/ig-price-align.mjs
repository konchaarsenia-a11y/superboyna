/**
 * Два ключа розницы под Instagram. Крошку, кабачок и заказы не трогает.
 * node scripts/ig-price-align.mjs --apply  — запись в D1 (только CI).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BACKUP_KEY = "retailPricesBackup:ig-align:20261026";
export const HEART_KEY = "СЕРДЦЕ|Кусочки";
export const LIVER_KEY = "БАРАНЬЯ ПЕЧЕНЬ|Мелкое";

const WANT = [
  { key: HEART_KEY, kind: "per100", price: 13 },
  { key: LIVER_KEY, kind: "per100", price: 19 }
];

export function alignRetailItems(items) {
  const before = items || [];
  const hadZucchini = before.some((it) => /КАБАЧ/.test(String((it && it.key) || "").toUpperCase()));
  const crumbsBefore = crumbStamp(before);
  const list = before.map((it) => Object.assign({}, it));
  const changed = [];
  WANT.forEach((w) => {
    const hit = list.find((it) => it && it.key === w.key);
    if (!hit) {
      list.push({ key: w.key, kind: w.kind, price: w.price });
      changed.push(w.key);
      return;
    }
    if (Number(hit.price) !== w.price || String(hit.kind || "") !== w.kind) {
      hit.price = w.price;
      hit.kind = w.kind;
      changed.push(w.key);
    }
  });
  const hasZucchini = list.some((it) => /КАБАЧ/.test(String((it && it.key) || "").toUpperCase()));
  if (hasZucchini !== hadZucchini) throw new Error("кабачок");
  const crumbsAfter = crumbStamp(list);
  if (crumbsBefore !== crumbsAfter) throw new Error("крошка");
  return { items: list, changed };
}

function crumbStamp(items) {
  return (items || [])
    .filter((it) => /КРОШК/.test(String((it && it.key) || "").toUpperCase()))
    .map((it) => it.key + "=" + it.kind + ":" + it.price)
    .sort()
    .join("|");
}

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

function payloadOf(row) {
  if (!row) return null;
  let payload = row.payload;
  if (typeof payload === "string") payload = JSON.parse(payload);
  return payload;
}

function main() {
  const ordersBefore = d1("SELECT COUNT(*) AS n FROM orders");
  const snapRows = d1("SELECT payload, updated_at FROM snap_cache WHERE cache_key = 'retailPrices'");
  const snap = payloadOf(snapRows[0]);
  if (!snap || !Array.isArray(snap.items)) {
    console.error("NO_RETAIL_SNAP");
    process.exit(1);
  }
  const backup = d1("SELECT cache_key FROM snap_cache WHERE cache_key = " + sqlStr(BACKUP_KEY));
  let backupState = "exists";
  if (!backup.length) {
    const raw = JSON.stringify(snap);
    const now = new Date().toISOString();
    d1(
      "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES (" +
        sqlStr(BACKUP_KEY) + ", " + sqlStr(raw) + ", " + sqlStr(now) + ")"
    );
    backupState = "inserted";
  }
  const aligned = alignRetailItems(snap.items);
  if (aligned.changed.length) {
    const next = Object.assign({}, snap, {
      items: aligned.items,
      cachedAt: new Date().toISOString(),
      igAlign: "20261026"
    });
    const raw = JSON.stringify(next);
    const now = new Date().toISOString();
    d1(
      "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES ('retailPrices', " +
        sqlStr(raw) + ", " + sqlStr(now) +
        ") ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
    );
  }
  const now = new Date().toISOString();
  WANT.forEach((w) => {
    d1(
      "INSERT INTO retail_prices (sku, price, source, updated_at) VALUES (" +
        sqlStr(w.key) + ", " + Number(w.price) + ", 'ig-align', " + sqlStr(now) +
        ") ON CONFLICT(sku) DO UPDATE SET price = excluded.price, source = excluded.source, updated_at = excluded.updated_at"
    );
  });
  const ordersAfter = d1("SELECT COUNT(*) AS n FROM orders");
  const check = d1(
    "SELECT payload FROM snap_cache WHERE cache_key = 'retailPrices'"
  );
  const live = payloadOf(check[0]);
  const heart = (live.items || []).find((it) => it.key === HEART_KEY);
  const liver = (live.items || []).find((it) => it.key === LIVER_KEY);
  const zucchini = (live.items || []).some((it) => /КАБАЧ/.test(String(it.key || "").toUpperCase()));
  console.log(JSON.stringify({
    ordersBefore: ordersBefore[0] && ordersBefore[0].n,
    ordersAfter: ordersAfter[0] && ordersAfter[0].n,
    backup: backupState,
    changed: aligned.changed,
    heart: heart && heart.price,
    liver: liver && liver.price,
    zucchini: zucchini,
    crumbsUntouched: true
  }));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain && process.argv.includes("--apply")) main();
