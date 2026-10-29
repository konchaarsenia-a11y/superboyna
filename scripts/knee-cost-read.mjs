#!/usr/bin/env node
/** Read-only: себес колена в версиях и в кэше. Имена клиентов не печатает. */
import { execFileSync } from "node:child_process";

function sh(sql) {
  const raw = execFileSync(
    "npx",
    ["--yes", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: 40 * 1024 * 1024, env: process.env, cwd: "boinya-c/proxy" }
  );
  const data = JSON.parse(raw);
  const blocks = Array.isArray(data) ? data : [data];
  const rows = [];
  blocks.forEach(function (b) {
    if (b && Array.isArray(b.results)) rows.push.apply(rows, b.results);
  });
  return rows;
}

const vers = sh(
  "SELECT sku, cost, shrink, effective_from FROM raw_cost_ver WHERE upper(replace(sku,'ё','е')) LIKE '%КОЛЕН%' ORDER BY effective_from"
);
let snapKeys = [];
try {
  const snaps = sh("SELECT payload FROM snap_cache WHERE cache_key = 'priceCostsPp' LIMIT 1");
  const payload = snaps[0] ? JSON.parse(snaps[0].payload || "{}") : {};
  const costs = payload.costs || {};
  const zero = payload.zeroKeys || {};
  Object.keys(costs).forEach(function (k) {
    if (!/КОЛЕН/i.test(k) && !/КОЛЕН/i.test(String((costs[k] && costs[k].name) || ""))) return;
    const row = costs[k] || {};
    snapKeys.push({
      key: k,
      name: row.name || "",
      unit: row.unitPrice != null ? row.unitPrice : row.per100,
      piece: !!row.piece
    });
  });
  Object.keys(zero).forEach(function (k) {
    if (/КОЛЕН/i.test(k)) snapKeys.push({ key: k, zeroKey: true });
  });
} catch (e) {
  snapKeys = [{ error: "snap" }];
}
console.log(JSON.stringify({ versions: vers, snap: snapKeys }, null, 2));
