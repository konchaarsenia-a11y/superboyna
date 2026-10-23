import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planPublicIds_ } from "../boinya-c/proxy/cabinet-link.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const proxy = path.join(here, "..", "boinya-c", "proxy");
const outDir = process.env.GITHUB_WORKSPACE
  ? path.join(process.env.GITHUB_WORKSPACE, "artifacts", "public-id-assign")
  : path.join(here, "..", "artifacts", "public-id-assign");
fs.mkdirSync(outDir, { recursive: true });

const BACKUP = "publicIdBackup:2026-10-23";

function d1(sql, name) {
  const sqlPath = path.join(outDir, name + ".sql");
  fs.writeFileSync(sqlPath, sql);
  const cmd = ["npx", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json"];
  if (sql.length > 50000) cmd.push("--file", sqlPath);
  else cmd.push("--command", sql);
  const proc = spawnSync(cmd[0], cmd.slice(1), { cwd: proxy, encoding: "utf8" });
  const text = String(proc.stdout || "");
  fs.writeFileSync(path.join(outDir, name + ".json"), text);
  fs.writeFileSync(path.join(outDir, name + ".err"), String(proc.stderr || ""));
  if (proc.status !== 0 || !text.trim()) {
    throw new Error("wrangler " + name + " rc=" + proc.status + " " + text.slice(0, 300) + " " + String(proc.stderr || "").slice(-400));
  }
  let i = 0;
  while (i < text.length && text[i] !== "[" && text[i] !== "{") i += 1;
  const data = JSON.parse(text.slice(i));
  const block = Array.isArray(data) ? data[0] : data;
  return (block && block.results) || [];
}

function q(value) {
  return String(value == null ? "" : value).replace(/'/g, "''");
}

function printOf(rows, cols) {
  return rows
    .map(function (r) {
      return cols.map(function (c) { return String(r[c] == null ? "" : r[c]); }).join("|");
    })
    .sort()
    .join("\n");
}

const ordersBefore = d1("SELECT id, match_key, status, updated_at FROM orders ORDER BY id", "orders-before");
const subsBefore = d1("SELECT id, nick, sheet, status FROM subs ORDER BY id", "subs-before");
const snapRows = d1("SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'", "snap-before");
if (!snapRows.length || !snapRows[0].payload) throw new Error("no listSubscriptions");
const orderPrint = printOf(ordersBefore, ["id", "match_key", "status", "updated_at"]);
const subPrint = printOf(subsBefore, ["id", "nick", "sheet", "status"]);
fs.writeFileSync(path.join(outDir, "orders-before.txt"), orderPrint);
fs.writeFileSync(path.join(outDir, "subs-before.txt"), subPrint);

d1(
  "INSERT INTO snap_cache (cache_key, payload, updated_at) " +
    "SELECT '" + BACKUP + "', payload, updated_at FROM snap_cache WHERE cache_key = 'listSubscriptions' " +
    "ON CONFLICT(cache_key) DO NOTHING",
  "backup"
);

const list = JSON.parse(snapRows[0].payload);
const subs = list.subscriptions || list.items || [];
let map = { bySub: {}, byKey: {}, seq: {} };
try {
  const mapRows = d1("SELECT payload FROM snap_cache WHERE cache_key = 'clientPublicIds'", "map-before");
  if (mapRows[0] && mapRows[0].payload) map = JSON.parse(mapRows[0].payload);
} catch (eMap) {
  map = { bySub: {}, byKey: {}, seq: {} };
}
const planned = planPublicIds_(
  subs.map(function (s) {
    return {
      subId: String((s && (s.subId || s.id)) || ""),
      matchKey: String((s && (s.matchKey || s.match_key)) || ""),
      sheet: String((s && (s.sheet || s.segment)) || ""),
      nick: String((s && (s.nick || s.client)) || ""),
      publicId: String((s && s.publicId) || "")
    };
  }),
  map
);
const bySub = Object.create(null);
planned.subscriptions.forEach(function (s) {
  if (s.subId && s.publicId) bySub[s.subId] = s.publicId;
});
subs.forEach(function (s) {
  const id = String((s && (s.subId || s.id)) || "");
  if (id && bySub[id]) s.publicId = bySub[id];
});
list.subscriptions = subs;
const payload = JSON.stringify(list);
const now = new Date().toISOString();
d1(
  "UPDATE snap_cache SET payload = '" + q(payload) + "', updated_at = '" + now + "' WHERE cache_key = 'listSubscriptions'",
  "write-subs"
);
d1(
  "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES ('clientPublicIds', '" + q(JSON.stringify(planned.map)) + "', '" + now + "') " +
    "ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
  "write-map"
);

const ordersAfter = d1("SELECT id, match_key, status, updated_at FROM orders ORDER BY id", "orders-after");
const subsAfter = d1("SELECT id, nick, sheet, status FROM subs ORDER BY id", "subs-after");
const orderAfter = printOf(ordersAfter, ["id", "match_key", "status", "updated_at"]);
const subAfter = printOf(subsAfter, ["id", "nick", "sheet", "status"]);
if (orderAfter !== orderPrint || subAfter !== subPrint) {
  const back = d1("SELECT payload FROM snap_cache WHERE cache_key = '" + BACKUP + "'", "backup-read");
  if (back[0] && back[0].payload) {
    d1(
      "UPDATE snap_cache SET payload = '" + q(back[0].payload) + "' WHERE cache_key = 'listSubscriptions'",
      "restore"
    );
  }
  throw new Error("сверка не сошлась, список подписок возвращён");
}
const summary = { backup: BACKUP, issued: planned.issued, orders: ordersBefore.length, subs: subsBefore.length };
fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
