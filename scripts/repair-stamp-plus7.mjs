#!/usr/bin/env node
/**
 * no-plus7-stamp-h1 emergency repair (Arseny «да» 16.11.2026):
 * Restore exactly 3 orders date_iso 2026-11-16 → 2026-11-09.
 * day_name / id unchanged. SELECT-only verify. No getClients.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts";
const MODE = String(process.env.REPAIR_MODE || "repair").toLowerCase(); // inspect | repair
const STAMP_AT = "2026-11-15T23:31:26";
const WANT_ISO = "2026-11-09";
const BAD_ISO = "2026-11-16";
const EXPECT_16 = ["Alinagidayathanova", "Qwert_mor", "anuta_22", "Варка"];
const HINT_IDS = [
  "Будущая неделя:LEROOO",
  "Будущая неделя:NATNAILSMINSK",
  "Будущая неделя:POLOTNOAN"
];
const HINT_CLIENTS = ["Lerooo_", "Lerooo", "Natnails_minsk", "polotno_an", "Natnails", "polotno"];

fs.mkdirSync(OUT, { recursive: true });

function d1(sql) {
  const r = spawnSync(
    "npx",
    ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: path.resolve("boinya-c/proxy"), encoding: "utf8", env: process.env }
  );
  if (r.status !== 0) {
    return { error: (r.stderr || r.stdout || "").slice(0, 1200), status: r.status };
  }
  try {
    return JSON.parse(r.stdout);
  } catch (e) {
    return { error: "bad_json", raw: String(r.stdout || "").slice(0, 600) };
  }
}

function rowsFrom(d1json) {
  if (!d1json || d1json.error) return [];
  const arr = Array.isArray(d1json) ? d1json : [d1json];
  for (const block of arr) {
    if (block && Array.isArray(block.results)) return block.results;
    if (block && block.result && Array.isArray(block.result)) {
      for (const r of block.result) {
        if (r && Array.isArray(r.results)) return r.results;
      }
    }
  }
  return [];
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// Discover stamped rows: exact ids OR stamp window + known clients on 16.11 with day_name Понедельник
const byHint = rowsFrom(
  d1(
    "SELECT id, client, match_key, day_name, date_iso, status, updated_at, segment, source, length(basket_json) AS blen FROM orders WHERE id IN (" +
      HINT_IDS.map((id) => "'" + esc(id) + "'").join(",") +
      ") ORDER BY id"
  )
);
const byStamp = rowsFrom(
  d1(
    "SELECT id, client, match_key, day_name, date_iso, status, updated_at, segment, source, length(basket_json) AS blen FROM orders WHERE status = 'active' AND date_iso = '2026-11-16' AND updated_at LIKE '2026-11-15T23:31%' ORDER BY client"
  )
);
const byClient = rowsFrom(
  d1(
    "SELECT id, client, match_key, day_name, date_iso, status, updated_at, segment, source, length(basket_json) AS blen FROM orders WHERE status = 'active' AND date_iso = '2026-11-16' AND day_name = 'Понедельник' AND (upper(client) LIKE '%LEROO%' OR upper(client) LIKE '%NATNAIL%' OR upper(client) LIKE '%POLOTNO%') ORDER BY client"
  )
);

function uniqRows(list) {
  const seen = Object.create(null);
  const out = [];
  (list || []).forEach(function (r) {
    if (!r || !r.id || seen[r.id]) return;
    seen[r.id] = 1;
    out.push(r);
  });
  return out;
}

let beforeRows = uniqRows([].concat(byHint, byStamp, byClient)).filter(function (r) {
  return (
    String(r.date_iso) === BAD_ISO &&
    String(r.updated_at || "").indexOf("2026-11-15T23:31") === 0 &&
    HINT_CLIENTS.some(function (h) {
      return String(r.client || "").toLowerCase().indexOf(String(h).toLowerCase()) >= 0 ||
        String(r.id || "").toUpperCase().indexOf(String(h).toUpperCase()) >= 0;
    })
  );
});
if (beforeRows.length !== 3 && byStamp.length === 3) {
  beforeRows = byStamp;
}
const IDS = beforeRows.map((r) => r.id);
const idList = IDS.map((id) => "'" + esc(id) + "'").join(",");

const on09 = rowsFrom(
  d1(
    "SELECT id, client, day_name, date_iso, status, updated_at FROM orders WHERE status = 'active' AND date_iso = '2026-11-09' ORDER BY client"
  )
);
const on16 = rowsFrom(
  d1(
    "SELECT id, client, day_name, date_iso, status, updated_at FROM orders WHERE status = 'active' AND date_iso = '2026-11-16' ORDER BY client"
  )
);

const snapMeta = rowsFrom(
  d1(
    "SELECT cache_key, updated_at, length(payload) AS n FROM snap_cache WHERE cache_key IN (" +
      "'cutting:Понедельник','assembly:Понедельник','courier:Понедельник'," +
      "'cutting:Будущая неделя','assembly:Будущая неделя','courier:Будущая неделя'," +
      "'weekDayCounts','partnerOrders'" +
      ") ORDER BY cache_key"
  )
);

const report = {
  at: new Date().toISOString(),
  mode: MODE,
  beforeRows,
  on09Before: on09,
  on16Before: on16,
  snapMetaBefore: snapMeta
};

const backupPath = path.join(OUT, "repair-stamp-plus7-backup.json");
const backupBody = JSON.stringify(
  {
    at: report.at,
    reason: "no-plus7-stamp-h1 restore date_iso for 3 rows stamped by partner-qty-prod-ro run 43775215279",
    stampAt: STAMP_AT,
    rows: beforeRows,
    on09: on09,
    on16: on16,
    snapMeta: snapMeta,
    rollbackSql: IDS.map(
      (id) =>
        "UPDATE orders SET date_iso = '" +
        BAD_ISO +
        "', updated_at = '" +
        STAMP_AT +
        ".034Z' WHERE id = '" +
        esc(id) +
        "' AND status = 'active';"
    )
  },
  null,
  2
);
fs.writeFileSync(backupPath, backupBody);
const backupSha = sha256(backupBody);
fs.writeFileSync(path.join(OUT, "repair-stamp-plus7-backup.sha256"), backupSha + "  repair-stamp-plus7-backup.json\n");
report.backup = { path: backupPath, sha256: backupSha, bytes: backupBody.length };

// Also store backup in snap_cache (prod) for owner rollback
if (MODE === "repair") {
  const snapKey = "repairBackup:no-plus7-stamp-h1:" + report.at.slice(0, 19).replace(/[:T]/g, "");
  const payload = backupBody.replace(/'/g, "''");
  // wrangler --command has length limits; use shorter marker + file is source of truth
  const short = JSON.stringify({
    marker: "no-plus7-stamp-h1",
    at: report.at,
    sha256: backupSha,
    ids: IDS,
    wantIso: WANT_ISO,
    note: "full backup in CI artifact repair-stamp-plus7-backup.json"
  }).replace(/'/g, "''");
  const put = d1(
    "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES ('" +
      esc(snapKey) +
      "', '" +
      short +
      "', '" +
      report.at +
      "') ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
  );
  report.snapBackup = { key: snapKey, result: put.error ? put : { ok: true } };
}

const stamped = beforeRows.filter(
  (r) => String(r.date_iso || "") === BAD_ISO && String(r.updated_at || "").indexOf("2026-11-15T23:31") === 0
);
const byIdOk = IDS.every((id) => beforeRows.some((r) => r.id === id));
report.precheck = {
  byIdOk,
  stampedN: stamped.length,
  stampedIds: stamped.map((r) => r.id),
  dayNames: beforeRows.map((r) => ({ id: r.id, day_name: r.day_name, date_iso: r.date_iso }))
};

if (MODE === "inspect") {
  fs.writeFileSync(path.join(OUT, "repair-stamp-plus7-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(byIdOk && stamped.length === 3 ? 0 : 2);
}

if (!byIdOk || stamped.length !== 3) {
  report.error = "precheck_failed_abort_write";
  fs.writeFileSync(path.join(OUT, "repair-stamp-plus7-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(3);
}

const now = new Date().toISOString();
const updates = [];
for (const id of IDS) {
  const sql =
    "UPDATE orders SET date_iso = '" +
    WANT_ISO +
    "', updated_at = '" +
    now +
    "' WHERE id = '" +
    esc(id) +
    "' AND status = 'active' AND date_iso = '" +
    BAD_ISO +
    "'";
  const res = d1(sql);
  updates.push({ id, sql, res: res.error ? res : rowsFrom(res).length >= 0 ? { ok: true, raw: res } : res });
}
report.updates = updates;
report.updatedAt = now;

// If Monday snaps were rewritten in the stamp window, drop them so next read rebuilds from fixed orders.
const snapTouches = (snapMeta || []).filter((s) => {
  const u = String(s.updated_at || "");
  return (
    u.indexOf("2026-11-15T23:3") === 0 &&
    /^(cutting|assembly|courier):Понедельник$/.test(String(s.cache_key || ""))
  );
});
report.snapTouchesInStampWindow = snapTouches;
if (snapTouches.length) {
  report.snapDeletes = [];
  for (const s of snapTouches) {
    const key = String(s.cache_key);
    const del = d1("DELETE FROM snap_cache WHERE cache_key = '" + esc(key) + "'");
    report.snapDeletes.push({ key, res: del.error ? del : { ok: true } });
  }
} else {
  report.snapDeletes = [];
  report.snapNote = "no Monday cutting/assembly/courier snap updated in stamp window — left untouched";
}

const afterRows = rowsFrom(
  d1(
    "SELECT id, client, match_key, day_name, date_iso, status, updated_at FROM orders WHERE id IN (" +
      idList +
      ") ORDER BY id"
  )
);
const on09After = rowsFrom(
  d1(
    "SELECT id, client, day_name, date_iso, updated_at FROM orders WHERE status = 'active' AND date_iso = '2026-11-09' ORDER BY client"
  )
);
const on16After = rowsFrom(
  d1(
    "SELECT id, client, day_name, date_iso, updated_at FROM orders WHERE status = 'active' AND date_iso = '2026-11-16' ORDER BY client"
  )
);

report.afterRows = afterRows;
report.on09After = on09After;
report.on16After = on16After;

const restored = afterRows.filter((r) => r.date_iso === WANT_ISO && IDS.indexOf(r.id) >= 0);
const stillBad = afterRows.filter((r) => r.date_iso === BAD_ISO);
const dayUnchanged = afterRows.every((r) => {
  const b = beforeRows.find((x) => x.id === r.id);
  return b && b.day_name === r.day_name;
});
const on16Clients = on16After.map((r) => String(r.client || ""));
const expectHit = EXPECT_16.every((frag) => on16Clients.some((c) => c.indexOf(frag) >= 0 || frag.indexOf(c) >= 0));
// Also allow Varka / Варка variants
const varkaOk = on16Clients.some((c) => /варк|varka|шевченко/i.test(c));
const threeBackOn09 = IDS.every((id) => on09After.some((r) => r.id === id && r.date_iso === WANT_ISO));
const stampedGoneFrom16 = IDS.every((id) => !on16After.some((r) => r.id === id));

report.verify = {
  restoredN: restored.length,
  stillBadN: stillBad.length,
  dayUnchanged,
  threeBackOn09,
  stampedGoneFrom16,
  on16N: on16After.length,
  on09N: on09After.length,
  on16Clients,
  expectHit,
  varkaOk,
  ok:
    restored.length === 3 &&
    stillBad.length === 0 &&
    dayUnchanged &&
    threeBackOn09 &&
    stampedGoneFrom16 &&
    on16After.length === 4 &&
    varkaOk
};

fs.writeFileSync(path.join(OUT, "repair-stamp-plus7-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ backup: report.backup, precheck: report.precheck, verify: report.verify, snapDeletes: report.snapDeletes }, null, 2));
process.exit(report.verify.ok ? 0 : 4);
