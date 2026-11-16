#!/usr/bin/env node
/**
 * no-plus7-stamp-h2 (Arseny «да» 16.11 17:38): restore date_iso for 3 rows
 * restamped by partner-qty-prod-ro after revert #750 (updated_at 2026-11-16T16:15:19Z).
 * ONLY updates date_iso on those 3 ids. No other D1 writes except backup snap_cache.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const IDS = [
  "Будущая неделя:LEROOO",
  "Будущая неделя:NATNAILSMINSK",
  "Будущая неделя:POLOTNOAN"
];
const GOOD_ISO = "2026-11-09";
const BAD_ISO = "2026-11-16";
const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts";
const MODE = String(process.env.REPAIR_MODE || "repair"); // inspect | repair

fs.mkdirSync(OUT, { recursive: true });

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
    return { error: "bad_json", raw: (r.stdout || "").slice(0, 400) };
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

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

const idList = IDS.map((id) => "'" + esc(id) + "'").join(",");
const report = { at: new Date().toISOString(), mode: MODE, marker: "no-plus7-stamp-h2" };

report.beforeRows = rows(
  d1(
    "SELECT id, client, match_key, day_name, date_iso, status, updated_at, segment, source, length(basket_json) AS blen FROM orders WHERE id IN (" +
      idList +
      ") ORDER BY id"
  )
);
report.on09Before = rows(
  d1(
    "SELECT id, client, day_name, date_iso, status, updated_at FROM orders WHERE status='active' AND date_iso='" +
      GOOD_ISO +
      "' AND id IN (" +
      idList +
      ") ORDER BY id"
  )
);
report.on16Before = rows(
  d1(
    "SELECT id, client, day_name, date_iso, status, updated_at FROM orders WHERE status='active' AND date_iso='" +
      BAD_ISO +
      "' ORDER BY client"
  )
);

const backupBody = JSON.stringify(
  {
    at: report.at,
    reason: "no-plus7-stamp-h2 restore after restamp by partner-qty-prod-ro run 43905336951",
    stampAt: "2026-11-16T16:15:19.045Z",
    rows: report.beforeRows,
    on16: report.on16Before,
    rollbackSql: IDS.map(
      (id) =>
        "UPDATE orders SET date_iso = '" +
        BAD_ISO +
        "', updated_at = '2026-11-16T16:15:19.045Z' WHERE id = '" +
        esc(id) +
        "' AND status = 'active';"
    )
  },
  null,
  2
);
const backupPath = path.join(OUT, "repair-stamp-plus7-again-backup.json");
fs.writeFileSync(backupPath, backupBody);
const backupSha = sha256(backupBody);
fs.writeFileSync(path.join(OUT, "repair-stamp-plus7-again-backup.sha256"), backupSha + "  repair-stamp-plus7-again-backup.json\n");
report.backup = { path: backupPath, sha256: backupSha, bytes: backupBody.length };

report.precheck = {
  stampedN: report.beforeRows.filter((r) => r.date_iso === BAD_ISO && r.status === "active").length,
  dayNamesOk: report.beforeRows.every((r) => r.day_name === "Понедельник"),
  stampedIds: report.beforeRows.filter((r) => r.date_iso === BAD_ISO).map((r) => r.id)
};

if (MODE === "inspect") {
  fs.writeFileSync(path.join(OUT, "repair-stamp-plus7-again-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.precheck.stampedN === 3 && report.precheck.dayNamesOk ? 0 : 2);
}

if (report.precheck.stampedN !== 3 || !report.precheck.dayNamesOk) {
  report.error = "precheck_failed";
  fs.writeFileSync(path.join(OUT, "repair-stamp-plus7-again-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

// Backup into snap_cache (short marker; full file is source of truth)
const snapKey = "repairBackup:no-plus7-stamp-h2:" + report.at.slice(0, 19).replace(/[:T]/g, "");
const short = JSON.stringify({
  marker: "no-plus7-stamp-h2",
  at: report.at,
  sha256: backupSha,
  ids: IDS,
  goodIso: GOOD_ISO,
  badIso: BAD_ISO
}).replace(/'/g, "''");
report.snapBackup = {
  key: snapKey,
  result: d1(
    "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES ('" +
      esc(snapKey) +
      "','" +
      short +
      "','" +
      esc(report.at) +
      "') ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at"
  )
};

const updatedAt = new Date().toISOString();
report.updates = [];
for (const id of IDS) {
  const sql =
    "UPDATE orders SET date_iso = '" +
    GOOD_ISO +
    "', updated_at = '" +
    esc(updatedAt) +
    "' WHERE id = '" +
    esc(id) +
    "' AND status = 'active' AND date_iso = '" +
    BAD_ISO +
    "'";
  const res = d1(sql);
  report.updates.push({ id, sql, res });
}
report.updatedAt = updatedAt;

report.afterRows = rows(
  d1(
    "SELECT id, client, match_key, day_name, date_iso, status, updated_at FROM orders WHERE id IN (" +
      idList +
      ") ORDER BY id"
  )
);
report.on09After = rows(
  d1(
    "SELECT id, client, day_name, date_iso, updated_at FROM orders WHERE status='active' AND date_iso='" +
      GOOD_ISO +
      "' AND id IN (" +
      idList +
      ") ORDER BY id"
  )
);
report.on16After = rows(
  d1(
    "SELECT id, client, day_name, date_iso, updated_at FROM orders WHERE status='active' AND date_iso='" +
      BAD_ISO +
      "' ORDER BY client"
  )
);

const expect16 = ["Alinagidayathanova", "Qwert_mor", "anuta_22", "Варка"];
const on16Clients = report.on16After.map((r) => r.client);
report.verify = {
  restoredN: report.afterRows.filter((r) => r.date_iso === GOOD_ISO).length,
  stillBadN: report.afterRows.filter((r) => r.date_iso === BAD_ISO).length,
  dayUnchanged: report.afterRows.every((r) => r.day_name === "Понедельник"),
  threeBackOn09: report.on09After.length === 3,
  stampedGoneFrom16: !report.on16After.some((r) => IDS.includes(r.id)),
  on16N: report.on16After.length,
  on09N: report.on09After.length,
  on16Clients,
  expectHit: expect16.every((c) => on16Clients.includes(c)),
  varkaOk: on16Clients.some((c) => /варка/i.test(c)),
  ok: false
};
report.verify.ok =
  report.verify.restoredN === 3 &&
  report.verify.stillBadN === 0 &&
  report.verify.dayUnchanged &&
  report.verify.threeBackOn09 &&
  report.verify.stampedGoneFrom16 &&
  report.verify.on16N === 4 &&
  report.verify.expectHit &&
  report.verify.varkaOk;

fs.writeFileSync(path.join(OUT, "repair-stamp-plus7-again-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.verify.ok ? 0 : 2);
