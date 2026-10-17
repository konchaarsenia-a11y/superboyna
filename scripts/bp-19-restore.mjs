#!/usr/bin/env node
/**
 * Вернуть БП 19.10 и пустые дни 20–25.10 на доску.
 * Указатель остаётся на 19.10. Подписки и ПП2 не переписываются.
 * Перед записью кладёт текущие строки в snap_cache weekClosePreRestore:.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BACKUP_KEY = "weekCloseBackup:2026-10-12:2026-10-17T15-06-29-797Z";
const DAYS = [
  ["Понедельник", "Пн", "2026-10-19"],
  ["Вторник", "Вт", "2026-10-20"],
  ["Среда", "Ср", "2026-10-21"],
  ["Четверг", "Чт", "2026-10-22"],
  ["Пятница", "Пт", "2026-10-23"],
  ["Суббота", "Сб", "2026-10-24"],
  ["Воскресенье", "Вс", "2026-10-25"],
  ["Будущая неделя", "Буд", "2026-10-26"]
];
const WEEKDAY = {
  "2026-10-19": "Понедельник",
  "2026-10-20": "Вторник",
  "2026-10-21": "Среда",
  "2026-10-22": "Четверг",
  "2026-10-23": "Пятница",
  "2026-10-24": "Суббота",
  "2026-10-25": "Воскресенье"
};

function coerceIso(raw) {
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return "";
  return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
}

function countClients(orders) {
  const out = Object.create(null);
  (orders || []).forEach(function (o) {
    const k = String(o.key || o.match_key || o.client || "");
    if (!out[k]) out[k] = { active: 0, other: 0 };
    if (String(o.status) === "active") out[k].active += 1;
    else out[k].other += 1;
  });
  return out;
}

function countDiff(before, after) {
  const keys = Object.create(null);
  Object.keys(before || {}).forEach(function (k) { keys[k] = true; });
  Object.keys(after || {}).forEach(function (k) { keys[k] = true; });
  const diff = [];
  Object.keys(keys).sort().forEach(function (k) {
    const x = (before && before[k]) || { active: 0, other: 0 };
    const y = (after && after[k]) || { active: 0, other: 0 };
    if (x.active !== y.active || x.other !== y.other) diff.push({ key: k, before: x, after: y });
  });
  return diff;
}

function subKey(row) {
  return [row.match_key, row.nick, row.status, row.sheet, row.n].map(function (v) {
    return String(v == null ? "" : v);
  }).join("|");
}

function isPp2(row) {
  const seg = String(row.segment || "").trim().toUpperCase();
  const src = String(row.source || "").toLowerCase();
  const pp = seg === "ПП" || seg === "АФК" || seg === "PP" || src === "pp" || src === "subscription";
  if (!pp) return false;
  const slot = String(row.pp_slot == null ? "" : row.pp_slot).trim();
  const hint = String(row.pp_hint == null ? "" : row.pp_hint);
  const delivery = Number(row.delivery_slot) || 0;
  if (delivery >= 2) return true;
  if (/^2(\/|$)/.test(slot)) return true;
  if (/пп\s*2/i.test(hint) && !/^1(\/|$)/.test(slot)) return true;
  return false;
}

function assertRestoreMath() {
  const before = [
    { key: "A", status: "active" },
    { key: "A", status: "deleted" }
  ];
  const after = [
    { key: "A", status: "active" },
    { key: "A", status: "deleted" }
  ];
  if (countDiff(countClients(before), countClients(after)).length !== 0) {
    throw new Error("restore math");
  }
  if (!isPp2({ segment: "ПП", pp_slot: "2/2", delivery_slot: 2 })) throw new Error("pp2");
  if (isPp2({ segment: "ПП", pp_slot: "1/2", delivery_slot: 1 })) throw new Error("pp1");
  if (isPp2({ segment: "БП", pp_slot: "2/2" })) throw new Error("bp");
  if (coerceIso("12.10.2026") !== "2026-10-12") throw new Error("iso");
}

function q(s) {
  return String(s == null ? "" : s).replace(/'/g, "''");
}

function rowsOf(data) {
  const blocks = Array.isArray(data) ? data : [data];
  const out = [];
  blocks.forEach(function (b) {
    if (b && Array.isArray(b.results)) out.push.apply(out, b.results);
  });
  if (out.length && out[0] && Object.prototype.hasOwnProperty.call(out[0], "Total queries executed")) {
    throw new Error("wrangler вернул статистику, не строки");
  }
  return out;
}

function changesOf(data) {
  const blocks = Array.isArray(data) ? data : [data];
  let n = 0;
  blocks.forEach(function (b) {
    if (b && b.meta && b.meta.changes) n += Number(b.meta.changes) || 0;
  });
  return n;
}

function runSql(sql, name, dir, asFile) {
  const file = path.join(dir, name + ".sql");
  const cmd = ["npx", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json"];
  if (asFile) {
    fs.writeFileSync(file, sql, "utf8");
    cmd.push("--file", file);
  } else {
    cmd.push("--command", sql);
  }
  const out = path.join(dir, name + ".json");
  const res = spawnSync(
    "npx",
    cmd,
    { cwd: path.join(process.cwd(), "boinya-c/proxy"), encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 }
  );
  fs.writeFileSync(out, res.stdout || "", "utf8");
  if (res.status !== 0) {
    fs.writeFileSync(path.join(dir, name + ".err"), (res.stderr || "") + "\n" + (res.stdout || ""), "utf8");
    throw new Error(name + " failed");
  }
  const text = String(res.stdout || "");
  const start = text.search(/[\[{]/);
  if (start < 0) throw new Error(name + " no json");
  return JSON.parse(text.slice(start));
}

function main() {
  assertRestoreMath();
  const root = path.join(process.env.GITHUB_WORKSPACE || "/tmp", "artifacts/bp-19-restore");
  fs.mkdirSync(root, { recursive: true });
  const stamp = new Date().toISOString();
  const snapId = stamp.replace(/[:.]/g, "-");

  const ordersSql =
    "SELECT id, client, match_key, date_iso, day_name, status, segment, source, length(ifnull(basket_json,'')) AS basket_n, updated_at FROM orders";
  const ppSql =
    "SELECT id, client, match_key, date_iso, day_name, status, segment, source, updated_at, " +
    "length(ifnull(basket_json,'')) AS basket_n, " +
    "json_extract(meta_json, '$.ppSlot') AS pp_slot, " +
    "json_extract(meta_json, '$.deliverySlot') AS delivery_slot, " +
    "json_extract(meta_json, '$.ppHint') AS pp_hint, " +
    "json_extract(meta_json, '$.deliveriesN') AS deliveries_n, " +
    "json_extract(meta_json, '$.paid') AS paid, " +
    "json_extract(meta_json, '$.orderPrice') AS price " +
    "FROM orders WHERE status = 'active' AND (date_iso BETWEEN '2026-10-12' AND '2026-10-26' OR id = 'Будущая неделя:SASHINPUSHOK') " +
    "AND (segment IN ('ПП','АФК') OR lower(ifnull(source,'')) IN ('pp','subscription'))";
  const beforeOrders = rowsOf(runSql(ordersSql, "before-orders", root));
  const beforePp = rowsOf(runSql(ppSql, "before-pp", root));
  const beforeSubs = rowsOf(runSql("SELECT match_key, nick, status, sheet, n FROM subs", "before-subs", root));
  const slotRows = rowsOf(runSql(
    "SELECT cache_key, payload FROM snap_cache WHERE cache_key IN ('weekDayCounts','dateToDay') OR cache_key LIKE 'weekCloseBackup:2026-10-12%'",
    "before-snaps",
    root
  ));
  let backup = null;
  let backupKeySeen = "";
  let prevCounts = null;
  let prevMap = null;
  slotRows.forEach(function (r) {
    let payload = null;
    try { payload = JSON.parse(r.payload || "null"); } catch (e) { payload = null; }
    if (String(r.cache_key || "").indexOf("weekCloseBackup:2026-10-12") === 0) {
      if (!backup || String(r.cache_key) > String(backupKeySeen)) {
        backup = payload;
        backupKeySeen = r.cache_key;
      }
    }
    if (r.cache_key === "weekDayCounts") prevCounts = payload;
    if (r.cache_key === "dateToDay") prevMap = payload;
  });
  if (!backup || !Array.isArray(backup.orders)) throw new Error("backup missing");

  const slim = beforeOrders.map(function (o) {
    return {
      id: o.id,
      key: o.match_key,
      date: o.date_iso,
      day: o.day_name,
      status: o.status
    };
  });
  const chunkSize = 80;
  for (let i = 0; i < slim.length; i += chunkSize) {
    const part = {
      at: stamp,
      part: i / chunkSize,
      parts: Math.ceil(slim.length / chunkSize),
      orders: slim.slice(i, i + chunkSize)
    };
    if (i === 0) {
      part.slots = prevCounts;
      part.dateToDay = prevMap;
      part.subs = beforeSubs.length;
    }
    const key = "weekClosePreRestore:" + snapId + ":" + String(i / chunkSize);
    runSql(
      "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES ('" + q(key) + "', '" + q(JSON.stringify(part)) + "', '" + q(stamp) + "') " +
        "ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
      "pre-snap-" + String(i / chunkSize),
      root,
      true
    );
  }

  const pp2Before = beforePp.filter(isPp2).map(function (r) {
    return {
      id: r.id,
      client: r.client,
      date: r.date_iso,
      day: r.day_name,
      slot: r.pp_slot,
      delivery: r.delivery_slot,
      hint: r.pp_hint,
      paid: r.paid,
      price: r.price,
      basket: r.basket_n,
      updated: r.updated_at
    };
  });

  function pointerSql(items, label) {
    const body = {
      status: "success",
      items: items,
      total: items.reduce(function (s, it) { return s + (Number(it.count) || 0); }, 0),
      fromD1: true,
      source: "d1-restore-19",
      sandbox: false,
      datesFromSheet: false,
      closedFrom: "2026-10-12"
    };
    const map = Object.create(null);
    items.forEach(function (it) { map[it.dateIso] = it.day; });
    return (
      "UPDATE snap_cache SET payload = '" + q(JSON.stringify(body)) + "', updated_at = '" + q(stamp) + "' WHERE cache_key = 'weekDayCounts';\n" +
      "UPDATE snap_cache SET payload = '" + q(JSON.stringify({ map: map, source: "d1-restore-19" })) + "', updated_at = '" + q(stamp) + "' WHERE cache_key = 'dateToDay';\n"
    );
  }

  function revertPointer() {
    const sql = [];
    if (prevCounts) {
      sql.push("UPDATE snap_cache SET payload = '" + q(JSON.stringify(prevCounts)) + "', updated_at = '" + q(stamp) + "' WHERE cache_key = 'weekDayCounts'");
    }
    if (prevMap) {
      sql.push("UPDATE snap_cache SET payload = '" + q(JSON.stringify(prevMap)) + "', updated_at = '" + q(stamp) + "' WHERE cache_key = 'dateToDay'");
    }
    if (sql.length) runSql(sql.join(";\n") + ";\n", "revert-pointer", root, true);
  }

  let moved = false;
  try {

  const dayCase = Object.keys(WEEKDAY).map(function (iso) {
    return "WHEN '" + iso + "' THEN '" + WEEKDAY[iso] + "'";
  }).join(" ");
  runSql(
    "UPDATE orders SET id = 'Понедельник:SASHINPUSHOK', date_iso = '2026-10-19', day_name = 'Понедельник', updated_at = '" + q(stamp) + "' " +
      "WHERE id = 'Будущая неделя:SASHINPUSHOK' AND status = 'active' " +
      "AND NOT EXISTS (SELECT 1 FROM orders AS o2 WHERE o2.id = 'Понедельник:SASHINPUSHOK');\n" +
      "UPDATE orders SET date_iso = '2026-10-19', day_name = 'Понедельник', updated_at = '" + q(stamp) + "' " +
      "WHERE status = 'active' AND match_key = 'SASHINPUSHOK' AND date_iso IN ('2026-10-12','2026-10-19') " +
      "AND id IN ('Будущая неделя:SASHINPUSHOK','Понедельник:SASHINPUSHOK','CAL:SASHINPUSHOK:2026-10-12');\n" +
      "UPDATE orders SET day_name = CASE date_iso " + dayCase + " ELSE day_name END, updated_at = '" + q(stamp) + "' " +
      "WHERE status = 'active' AND date_iso BETWEEN '2026-10-19' AND '2026-10-25' AND ifnull(day_name,'') IN ('','Будущая неделя');\n",
    "restore-orders",
    root,
    true
  );
  moved = true;

  const afterOrders = rowsOf(runSql(ordersSql, "after-orders", root));
  const counts = Object.create(null);
  afterOrders.forEach(function (o) {
    if (String(o.status) !== "active") return;
    const day = String(o.day_name || "");
    counts[day] = (counts[day] || 0) + 1;
  });
  const items = DAYS.map(function (d) {
    const iso = d[2];
    return {
      day: d[0],
      short: d[1],
      date: iso.slice(8) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4),
      count: counts[d[0]] || 0,
      dateIso: iso
    };
  });
  runSql(pointerSql(items), "pointer-counts", root, true);

  const afterPp = rowsOf(runSql(ppSql, "after-pp", root));
  const afterSubs = rowsOf(runSql("SELECT match_key, nick, status, sheet, n FROM subs", "after-subs", root));
  const watch = rowsOf(runSql(
    "SELECT id, client, match_key, date_iso, day_name, status, length(ifnull(basket_json,'')) AS basket_n FROM orders " +
      "WHERE id IN ('CAL:SASHINPUSHOK:2026-10-15','imp:15.10.2026:SASHINPUSHOK','imp:14.10.2026:ВАРКА','imp:16.10.2026:MRBARNEYCORGI'," +
      "'Будущая неделя:SASHINPUSHOK','Понедельник:SASHINPUSHOK','CAL:SASHINPUSHOK:2026-10-12') " +
      "OR (status = 'active' AND match_key = 'SASHINPUSHOK')",
    "watch",
    root
  ));
  const pointer = rowsOf(runSql("SELECT payload FROM snap_cache WHERE cache_key = 'weekDayCounts'", "pointer", root));
  let monday = "";
  try {
    const body = JSON.parse((pointer[0] && pointer[0].payload) || "{}");
    const hit = (body.items || []).find(function (it) { return it && it.day === "Понедельник"; });
    monday = hit ? String(hit.date || "") : "";
  } catch (eP) { monday = ""; }

  const backupCounts = countClients((backup.orders || []).map(function (o) {
    return { key: o.match_key || o.client, status: o.status };
  }));
  const beforeCounts = countClients(beforeOrders.map(function (o) {
    return { key: o.match_key || o.client, status: o.status };
  }));
  const afterCounts = countClients(afterOrders.map(function (o) {
    return { key: o.match_key || o.client, status: o.status };
  }));
  const orderDiff = countDiff(beforeCounts, afterCounts);
  const backupGap = countDiff(backupCounts, afterCounts);
  const subBefore = beforeSubs.map(subKey).sort();
  const subBackup = (backup.subs || []).map(subKey).sort();
  const subAfter = afterSubs.map(subKey).sort();
  const sashin = afterOrders.filter(function (o) {
    return String(o.match_key) === "SASHINPUSHOK" && String(o.status) === "active";
  });
  const sashinOk = sashin.length === 1 && coerceIso(sashin[0].date_iso) === "2026-10-19" && sashin[0].day_name === "Понедельник" && Number(sashin[0].basket_n) === 251;
  const pp2After = afterPp.filter(isPp2);
  const ppTouched = [];
  const ppById = Object.create(null);
  pp2After.forEach(function (r) { ppById[r.id] = r; });
  pp2Before.forEach(function (r) {
    const now = ppById[r.id];
    const iso = coerceIso(r.date);
    const moneyOk = now && String(now.paid) === String(r.paid) && String(now.price) === String(r.price) && String(now.basket_n) === String(r.basket) && String(now.pp_slot) === String(r.slot) && String(now.date_iso) === String(r.date);
    let dayOk = now && String(now.day_name || "") === String(r.day || "");
    if (!dayOk && now && WEEKDAY[iso] && String(r.day || "") === "" && String(now.day_name || "") === WEEKDAY[iso]) dayOk = true;
    if (!moneyOk || !dayOk) ppTouched.push(r.id);
  });
  const deletedOk = watch.filter(function (r) {
    return r.id === "CAL:SASHINPUSHOK:2026-10-15" || r.id === "imp:15.10.2026:SASHINPUSHOK";
  }).every(function (r) { return r.status === "deleted"; });
  const archivedOk = watch.filter(function (r) {
    return r.id === "imp:14.10.2026:ВАРКА" || r.id === "imp:16.10.2026:MRBARNEYCORGI";
  }).every(function (r) { return r.status === "active" && String(r.day_name || "") === ""; });

  const board = {};
  afterOrders.forEach(function (o) {
    if (String(o.status) !== "active") return;
    const iso = coerceIso(o.date_iso);
    if (!WEEKDAY[iso]) return;
    if (!board[iso]) board[iso] = [];
    board[iso].push(String(o.client || "") + " [" + String(o.day_name || "") + "]");
  });
  Object.keys(board).forEach(function (iso) { board[iso].sort(); });

  const report = {
    snap: "weekClosePreRestore:" + snapId,
    monday: monday,
    sashin: sashin.map(function (o) {
      return { id: o.id, date: o.date_iso, day: o.day_name, status: o.status, basket: o.basket_n };
    }),
    sashinOk: sashinOk,
    mondayOk: monday === "19.10.2026",
    orderDiff: orderDiff,
    backupGap: backupGap,
    subsSame: subBefore.join("\n") === subAfter.join("\n"),
    subsMatchBackup: subBackup.join("\n") === subAfter.join("\n"),
    pp2: pp2Before.map(function (r) { return { client: r.client, date: r.date, day: r.day, slot: r.slot, paid: r.paid, price: r.price }; }),
    ppTouched: ppTouched,
    deletedOk: deletedOk,
    archivedOk: archivedOk,
    board: board
  };
  fs.writeFileSync(path.join(root, "report.json"), JSON.stringify(report, null, 2));
  const ok = report.sashinOk && report.mondayOk && report.orderDiff.length === 0 && report.subsSame && report.ppTouched.length === 0 && report.deletedOk && report.archivedOk;
  if (!ok) {
    const revert = [];
    const afterBy = Object.create(null);
    afterOrders.forEach(function (o) { afterBy[o.id] = o; });
    beforeOrders.forEach(function (b) {
      const now = afterBy[b.id];
      if (!now) return;
      if (String(now.date_iso) === String(b.date_iso) && String(now.day_name) === String(b.day_name) && String(now.status) === String(b.status) && String(now.id) === String(b.id)) return;
      revert.push(
        "UPDATE orders SET date_iso = '" + q(b.date_iso) + "', day_name = '" + q(b.day_name) + "', status = '" + q(b.status) + "', updated_at = '" + q(b.updated_at) + "' WHERE id = '" + q(b.id) + "'"
      );
    });
    if (sashin[0] && sashin[0].id === "Понедельник:SASHINPUSHOK" && !afterBy["Будущая неделя:SASHINPUSHOK"]) {
      revert.unshift(
        "UPDATE orders SET id = 'Будущая неделя:SASHINPUSHOK' WHERE id = 'Понедельник:SASHINPUSHOK' AND status = 'active'"
      );
    }
    if (prevCounts) {
      revert.push(
        "UPDATE snap_cache SET payload = '" + q(JSON.stringify(prevCounts)) + "', updated_at = '" + q(stamp) + "' WHERE cache_key = 'weekDayCounts'"
      );
    }
    if (prevMap) {
      revert.push(
        "UPDATE snap_cache SET payload = '" + q(JSON.stringify(prevMap)) + "', updated_at = '" + q(stamp) + "' WHERE cache_key = 'dateToDay'"
      );
    }
    if (revert.length) runSql(revert.join(";\n") + ";\n", "revert", root, true);
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    if (moved) {
      try {
        const nowRows = rowsOf(runSql(ordersSql, "catch-orders", root));
        const nowBy = Object.create(null);
        nowRows.forEach(function (o) { nowBy[o.id] = o; });
        const sql = [];
        if (nowBy["Понедельник:SASHINPUSHOK"] && !nowBy["Будущая неделя:SASHINPUSHOK"]) {
          sql.push("UPDATE orders SET id = 'Будущая неделя:SASHINPUSHOK' WHERE id = 'Понедельник:SASHINPUSHOK' AND status = 'active'");
        }
        beforeOrders.forEach(function (b) {
          const now = nowBy[b.id];
          if (!now) return;
          if (String(now.date_iso) === String(b.date_iso) && String(now.day_name) === String(b.day_name) && String(now.status) === String(b.status)) return;
          sql.push(
            "UPDATE orders SET date_iso = '" + q(b.date_iso) + "', day_name = '" + q(b.day_name) + "', status = '" + q(b.status) + "', updated_at = '" + q(b.updated_at) + "' WHERE id = '" + q(b.id) + "'"
          );
        });
        if (sql.length) runSql(sql.join(";\n") + ";\n", "catch-revert", root, true);
        revertPointer();
      } catch (eBack) {}
    }
    throw err;
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith("bp-19-restore.mjs");
if (isMain) main();
