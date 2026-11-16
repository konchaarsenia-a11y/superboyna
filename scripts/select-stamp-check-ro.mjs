#!/usr/bin/env node
/** SELECT-only: check if stamp trio moved again to 16.11. No writes. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
function d1(sql) {
  const r = spawnSync(
    "npx",
    ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: path.resolve("boinya-c/proxy"), encoding: "utf8", env: process.env }
  );
  if (r.status !== 0) return { error: (r.stderr || r.stdout || "").slice(0, 800) };
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
    if (b && b.result) for (const r of b.result) if (r && Array.isArray(r.results)) return r.results;
  }
  return [];
}
const IDS = [
  "Будущая неделя:LEROOO",
  "Будущая неделя:NATNAILSMINSK",
  "Будущая неделя:POLOTNOAN"
];
const trio = rows(
  d1(
    "SELECT id, client, day_name, date_iso, status, updated_at FROM orders WHERE id IN (" +
      IDS.map((id) => "'" + id.replace(/'/g, "''") + "'").join(",") +
      ") ORDER BY id"
  )
);
const on16 = rows(
  d1(
    "SELECT id, client, day_name, date_iso, updated_at FROM orders WHERE status='active' AND date_iso='2026-11-16' ORDER BY client"
  )
);
const on09 = rows(
  d1(
    "SELECT id, client, day_name, date_iso, updated_at FROM orders WHERE status='active' AND date_iso='2026-11-09' AND id IN (" +
      IDS.map((id) => "'" + id.replace(/'/g, "''") + "'").join(",") +
      ") ORDER BY id"
  )
);
const report = {
  at: new Date().toISOString(),
  trio,
  on09N: on09.length,
  on16N: on16.length,
  on16Clients: on16.map((r) => r.client),
  restamped: trio.some((r) => r.date_iso === "2026-11-16"),
  ok:
    on16.length === 4 &&
    on09.length === 3 &&
    trio.every((r) => r.date_iso === "2026-11-09" && r.day_name === "Понедельник")
};
fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
fs.writeFileSync("/opt/cursor/artifacts/select-stamp-check-ro.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 2);
