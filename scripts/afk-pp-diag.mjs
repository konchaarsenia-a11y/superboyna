// Только чтение D1. Ничего не пишет и не шлёт.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const proxy = join(root, "..", "boinya-c", "proxy");
const outDir = process.env.AFK_DIAG_OUT || join(root, "..", "artifacts", "afk-pp-diag");

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
  if (run.status !== 0) {
    throw new Error((run.stderr || run.stdout || "d1").slice(-500));
  }
  const parsed = parseWrangler((run.stdout || "") + "\n" + (run.stderr || ""));
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return (block && block.results) || [];
}

function igOf(raw) {
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const at = s.match(/@([A-Za-z0-9._]{2,})/);
  if (at) return at[1].toLowerCase();
  s = s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const parts = s.split(/\s+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].replace(/^[.,;:]+|[.,;:]+$/g, "");
    if (/^[A-Za-z0-9._]{3,}$/.test(p) && /[A-Za-z]/.test(p)) return p.toLowerCase();
  }
  return "";
}

function sheetOf(row) {
  const s = String((row && (row.sheet || row.segment)) || "").trim().toUpperCase();
  if (s === "AFK" || s === "АФК") return "АФК";
  if (s === "PP" || s === "ПП" || s === "SUBSCRIPTION") return "ПП";
  if (s === "BP" || s === "БП") return "БП";
  return s;
}

function sameIdentity(a, b) {
  const iga = igOf(a.nick) || igOf(a.label);
  const igb = igOf(b.nick) || igOf(b.label);
  if (iga && igb) return iga === igb;
  if (iga || igb) return false;
  const ka = String(a.nick || a.label || "").replace(/\s+/g, "").toUpperCase();
  const kb = String(b.nick || b.label || "").replace(/\s+/g, "").toUpperCase();
  return !!(ka && kb && ka === kb);
}

function stamp(ms) {
  const n = Number(ms);
  if (!n) return "";
  return new Date(n).toISOString();
}

const snapMeta = d1(
  "SELECT cache_key, updated_at, length(payload) AS n FROM snap_cache WHERE cache_key IN ('listSubscriptions','subDeleteTombstones')"
);
const cards = d1(
  "SELECT json_extract(j.value, '$.nick') AS nick, json_extract(j.value, '$.label') AS label, " +
    "json_extract(j.value, '$.sheet') AS sheet, json_extract(j.value, '$.segment') AS segment, " +
    "json_extract(j.value, '$.subId') AS subId, json_extract(j.value, '$.status') AS status, " +
    "json_extract(j.value, '$.stage') AS stage, json_extract(j.value, '$._savedAt') AS savedAt, " +
    "json_extract(j.value, '$._listMergedAt') AS mergedAt, json_extract(j.value, '$.deliveries') AS deliveries, " +
    "json_array_length(json_extract(j.value, '$.basket')) AS basketN " +
    "FROM snap_cache, json_each(snap_cache.payload, '$.subscriptions') AS j " +
    "WHERE cache_key = 'listSubscriptions'"
);

const needle = /minaeva/i;
const mina = cards.filter(function (row) {
  return needle.test(String(row.nick || "")) || needle.test(String(row.label || ""));
}).map(function (row) {
  return {
    nick: row.nick,
    label: row.label,
    sheet: sheetOf(row),
    segment: row.segment || "",
    subId: row.subId || "",
    status: row.status || "",
    stage: row.stage || "",
    savedAt: stamp(row.savedAt),
    mergedAt: stamp(row.mergedAt),
    deliveries: row.deliveries,
    basketN: row.basketN
  };
});

const both = [];
const seen = Object.create(null);
for (let i = 0; i < cards.length; i++) {
  for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i];
    const b = cards[j];
    if (sheetOf(a) === sheetOf(b)) continue;
    const sheets = [sheetOf(a), sheetOf(b)].sort().join("+");
    if (sheets.indexOf("АФК") < 0 || sheets.indexOf("ПП") < 0) continue;
    if (!sameIdentity(a, b)) continue;
    const key = (igOf(a.nick) || igOf(a.label) || String(a.nick || "")).toLowerCase();
    if (!key || seen[key]) continue;
    seen[key] = true;
    both.push({
      key: key,
      a: { sheet: sheetOf(a), nick: a.nick, label: a.label, subId: a.subId || "", savedAt: stamp(a.savedAt), mergedAt: stamp(a.mergedAt), status: a.status || "" },
      b: { sheet: sheetOf(b), nick: b.nick, label: b.label, subId: b.subId || "", savedAt: stamp(b.savedAt), mergedAt: stamp(b.mergedAt), status: b.status || "" }
    });
  }
}

const subs = d1(
  "SELECT id, client_id, match_key, nick, label, sheet, status, n, updated_at FROM subs " +
    "WHERE lower(nick) LIKE '%minaeva%' OR lower(label) LIKE '%minaeva%' OR upper(match_key) LIKE '%MINAEVA%'"
);
const clients = d1(
  "SELECT id, match_key, nick, label, updated_at FROM clients " +
    "WHERE lower(nick) LIKE '%minaeva%' OR lower(label) LIKE '%minaeva%' OR upper(match_key) LIKE '%MINAEVA%'"
);
const orders = d1(
  "SELECT id, date_iso, day_name, client, match_key, segment, source, status, updated_at FROM orders " +
    "WHERE lower(client) LIKE '%minaeva%' OR upper(match_key) LIKE '%MINAEVA%' ORDER BY date_iso, updated_at"
);
const tombsRaw = d1("SELECT payload FROM snap_cache WHERE cache_key = 'subDeleteTombstones'");
let tombs = [];
try {
  const bag = JSON.parse((tombsRaw[0] && tombsRaw[0].payload) || "{}");
  tombs = (bag.items || []).filter(function (it) {
    return needle.test(String(it.nick || "")) || needle.test(String(it.mk || ""));
  }).map(function (it) {
    return { nick: it.nick, mk: it.mk, sheet: it.sheet, subId: it.subId || "", at: stamp(it.at), ttl: it.ttl };
  });
} catch (eT) {
  tombs = [];
}

const otherSubs = d1(
  "SELECT match_key, nick, sheet, status, updated_at, id FROM subs " +
    "WHERE status != 'deleted' AND sheet IN ('pp','afk')"
);
const subBoth = [];
const byKey = Object.create(null);
otherSubs.forEach(function (row) {
  const k = String(row.match_key || "").toUpperCase();
  if (!k) return;
  if (!byKey[k]) byKey[k] = [];
  byKey[k].push(row);
});
Object.keys(byKey).forEach(function (k) {
  const rows = byKey[k];
  const sheets = {};
  rows.forEach(function (r) { sheets[r.sheet] = true; });
  if (sheets.pp && sheets.afk) {
    subBoth.push({
      match_key: k,
      rows: rows.map(function (r) {
        return { id: r.id, nick: r.nick, sheet: r.sheet, status: r.status, updated_at: r.updated_at };
      })
    });
  }
});

const report = {
  at: new Date().toISOString(),
  snapMeta: snapMeta,
  mina: mina,
  minaSubs: subs,
  minaClients: clients,
  minaOrders: orders,
  minaTombs: tombs,
  bothSheets: both,
  subsBoth: subBoth
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify({
  at: report.at,
  mina: mina.length,
  orders: orders.length,
  bothSheets: both.length,
  subsBoth: subBoth.length
}) + "\n");
