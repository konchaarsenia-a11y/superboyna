#!/usr/bin/env node
/** SELECT-only prod gates: 16.11/09.11 counts + dupes this/next week. No writes. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function d1(sql) {
  const r = spawnSync(
    "npx",
    ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: path.resolve("boinya-c/proxy"), encoding: "utf8", env: process.env }
  );
  if (r.status !== 0) return { error: (r.stderr || r.stdout || "").slice(0, 1200) };
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { error: "bad_json" };
  }
}
function rows(j) {
  if (!j || j.error) return [];
  const arr = Array.isArray(j) ? j : [j];
  for (const b of arr) {
    if (b && Array.isArray(b.results)) return b.results;
    if (b && b.result)
      for (const r of b.result) if (r && Array.isArray(r.results)) return r.results;
  }
  return [];
}

const TRIO = [
  "Будущая неделя:LEROOO",
  "Будущая неделя:NATNAILSMINSK",
  "Будущая неделя:POLOTNOAN"
];

const on16 = rows(
  d1(
    "SELECT id, client, day_name, date_iso, status, source FROM orders WHERE status='active' AND date_iso='2026-11-16' ORDER BY client"
  )
);
const on09 = rows(
  d1(
    "SELECT id, client, day_name, date_iso, status FROM orders WHERE status='active' AND date_iso='2026-11-09' AND id IN (" +
      TRIO.map((id) => "'" + id.replace(/'/g, "''") + "'").join(",") +
      ") ORDER BY id"
  )
);
// this week Mon 10.11–Sun 16.11; next Mon 17.11–Sun 23.11
const week = rows(
  d1(
    "SELECT id, client, match_key, date_iso, day_name, status, source FROM orders WHERE status='active' AND date_iso>='2026-11-10' AND date_iso<='2026-11-23' ORDER BY date_iso, client"
  )
);

const byDateKey = new Map();
const dupes = [];
for (const o of week) {
  const mk = String(o.match_key || o.client || o.id || "").toUpperCase();
  const key = String(o.date_iso) + "|" + mk;
  if (byDateKey.has(key)) {
    dupes.push({ key, a: byDateKey.get(key).id, b: o.id, date_iso: o.date_iso, client: o.client });
  } else {
    byDateKey.set(key, o);
  }
}

const report = {
  at: new Date().toISOString(),
  on16N: on16.length,
  on16Clients: on16.map((r) => r.client),
  on09N: on09.length,
  on09Clients: on09.map((r) => r.client),
  weekN: week.length,
  dupes,
  ok:
    on16.length === 4 &&
    on09.length === 3 &&
    on09.every((r) => r.date_iso === "2026-11-09") &&
    dupes.length === 0
};

const outDir = process.env.OUT_DIR || "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "select-prod-ro.json"), JSON.stringify(report, null, 2));
try {
  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  fs.writeFileSync("/opt/cursor/artifacts/select-prod-ro.json", JSON.stringify(report, null, 2));
} catch (e) {}
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 2);
