// Только чтение D1. Ничего не пишет и не шлёт.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { alexianaHitRow_, alexianaMoveDecision_, alexianaSheet_, groupAlexiana_ } from "../boinya-c/proxy/alexiana-find.js";

const root = dirname(fileURLToPath(import.meta.url));
const proxy = join(root, "..", "boinya-c", "proxy");
const outDir = process.env.ALEXIANA_OUT || join(root, "..", "artifacts", "alexiana-find");

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
  if (run.status !== 0) throw new Error((run.stderr || run.stdout || "d1").slice(-500));
  const parsed = parseWrangler((run.stdout || "") + "\n" + (run.stderr || ""));
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return (block && block.results) || [];
}

function pub(row) {
  return {
    kind: row.kind,
    nick: row.nick || "",
    label: row.label || "",
    client: row.client || "",
    match_key: row.match_key || "",
    sheet: alexianaSheet_(row) || row.sheet || "",
    subId: String(row.subId || row.id || ""),
    status: row.status || "",
    n: row.n == null ? "" : row.n
  };
}

const cards = d1(
  "SELECT json_extract(j.value, '$.nick') AS nick, json_extract(j.value, '$.label') AS label, " +
    "json_extract(j.value, '$.sheet') AS sheet, json_extract(j.value, '$.segment') AS segment, " +
    "json_extract(j.value, '$.subId') AS subId, json_extract(j.value, '$.status') AS status " +
    "FROM snap_cache, json_each(snap_cache.payload, '$.subscriptions') AS j " +
    "WHERE cache_key = 'listSubscriptions'"
).map(function (row) {
  return Object.assign({ kind: "card" }, row);
});

const subs = d1(
  "SELECT id, match_key, nick, label, sheet, status, n FROM subs"
).map(function (row) {
  return Object.assign({ kind: "subs" }, row);
});

const clients = d1(
  "SELECT id, match_key, nick, label FROM clients"
).map(function (row) {
  return Object.assign({ kind: "client", subId: "" }, row);
});

const orders = d1(
  "SELECT id, client, match_key, date_iso, day_name, status, segment, source FROM orders " +
    "WHERE lower(ifnull(client,'')) LIKE '%alexian%' OR lower(ifnull(client,'')) LIKE '%aleksian%' " +
    "OR upper(ifnull(match_key,'')) LIKE '%ALEXIAN%' OR upper(ifnull(match_key,'')) LIKE '%ALEKSIAN%' " +
    "OR ifnull(client,'') LIKE '%лексиан%' OR ifnull(client,'') LIKE '%Лексиан%'"
);

const pool = cards.concat(subs, clients);
const groups = groupAlexiana_(pool);
const decision = alexianaMoveDecision_(groups);
const today = "2026-10-20";
const publicGroups = groups.map(function (group) {
  const members = group.members.map(pub);
  const keys = Object.create(null);
  members.forEach(function (row) {
    if (row.match_key) keys[String(row.match_key).toUpperCase()] = true;
    const nick = String(row.nick || row.client || "").trim().toLowerCase();
    if (nick) keys[nick] = true;
  });
  const future = orders.filter(function (row) {
    if (!alexianaHitRow_(row)) return false;
    const key = String(row.match_key || "").toUpperCase();
    const nick = String(row.client || "").trim().toLowerCase();
    if (!keys[key] && !keys[nick]) return false;
    return String(row.date_iso || "") >= today && String(row.status || "") === "active";
  }).map(function (row) {
    return {
      id: row.id,
      client: row.client,
      date_iso: row.date_iso,
      day_name: row.day_name || "",
      segment: row.segment || "",
      source: row.source || ""
    };
  });
  return { members: members, futureOrders: future };
});

const report = {
  readAt: new Date().toISOString(),
  action: decision.action,
  groups: publicGroups.length,
  people: publicGroups,
  ordersTouched: false,
  note: "Штатный перенос «В АФК» карточку двигает и заказы не удаляет."
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ action: report.action, groups: report.groups, people: publicGroups.map(function (g) {
  return {
    members: g.members.map(function (m) { return m.kind + " " + (m.nick || m.label) + " " + m.sheet + " " + m.subId; }),
    future: g.futureOrders.map(function (o) { return o.date_iso + " " + o.id; })
  };
}) }));
