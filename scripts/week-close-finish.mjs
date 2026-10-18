/**
 * Доводит закрытие недели 12–18.10 в D1.
 * plan — только чтение. apply — снимок, day_name, сверка, откат при расхождении.
 * date_iso, status и подписки не меняются. Склад не пишется.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  planWeekCloseD1_,
  weekCloseCalendarNicks_,
  weekCloseClientCounts_,
  weekCloseCountsEqual_,
  weekCloseFinishAllowed_,
  weekCloseNickDiff_
} from "../boinya-c/proxy/week-close-d1.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const proxy = path.join(root, "boinya-c/proxy");
const outDir = path.join(root, "artifacts/week-close-finish");
const apply = process.env.WEEK_CLOSE_FINISH === "apply";

function sleep(sec) {
  spawnSync("sleep", [String(sec)]);
}

function rowsOf(text) {
  const raw = String(text || "");
  const start = raw.search(/[\[{]/);
  if (start < 0) throw new Error("no json: " + raw.slice(0, 400));
  const data = JSON.parse(raw.slice(start));
  const blocks = Array.isArray(data) ? data : [data];
  const rows = [];
  blocks.forEach(function (b) {
    if (b && Array.isArray(b.results)) rows.push.apply(rows, b.results);
  });
  return rows;
}

function d1(sql) {
  const r = spawnSync(
    "npx",
    ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: proxy, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: process.env }
  );
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || "d1").slice(0, 1500));
  }
  return rowsOf(r.stdout);
}

function d1File(file) {
  const r = spawnSync(
    "npx",
    ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--file", file],
    { cwd: proxy, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, env: process.env }
  );
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || "d1 file").slice(0, 1500));
  }
}

function sqlStr(value) {
  return "'" + String(value == null ? "" : value).replace(/'/g, "''") + "'";
}

function minskToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Minsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function mondayOf(iso) {
  const p = String(iso || "").split("-");
  const dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  const wd = dt.getUTCDay();
  const diff = wd === 0 ? -6 : 1 - wd;
  dt.setUTCDate(dt.getUTCDate() + diff);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function writeSql(name, lines) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, lines.join("\n"));
  return file;
}

function chunkList(list, size) {
  const out = [];
  const rows = list || [];
  const n = size > 0 ? size : 40;
  for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n));
  if (!out.length) out.push([]);
  return out;
}

function saveSnap(key, payload, now, fileName) {
  const body = JSON.stringify(payload);
  if (body.length > 50000) throw new Error("snap too big " + key + " " + body.length);
  d1File(writeSql(fileName, [
    "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES (" +
      sqlStr(key) + ", " + sqlStr(body) + ", " + sqlStr(now) +
      ") ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at;"
  ]));
}

function saveBackup(base, state, now) {
  const orderChunks = chunkList(state.orders, 40);
  const subChunks = chunkList(state.subs, 40);
  orderChunks.forEach(function (rows, i) {
    saveSnap(base + ":orders:" + i, { i: i, n: orderChunks.length, rows: rows }, now, "bak-o-" + i + ".sql");
  });
  subChunks.forEach(function (rows, i) {
    saveSnap(base + ":subs:" + i, { i: i, n: subChunks.length, rows: rows }, now, "bak-s-" + i + ".sql");
  });
  saveSnap(base, {
    at: now,
    oldMonday: state.planOld,
    newMonday: state.planNew,
    orderChunks: orderChunks.length,
    subChunks: subChunks.length,
    orders: orderChunks.reduce(function (n, rows) { return n + rows.length; }, 0),
    subs: subChunks.reduce(function (n, rows) { return n + rows.length; }, 0),
    slots: (state.counts && state.counts.items) || []
  }, now, "bak-meta.sql");
  const got = d1(
    "SELECT cache_key, length(payload) AS n FROM snap_cache WHERE cache_key = " + sqlStr(base) +
      " OR cache_key LIKE " + sqlStr(base + ":%")
  );
  const need = 1 + orderChunks.length + subChunks.length;
  if (got.length < need) throw new Error("backup short " + got.length + "/" + need);
  return { orderChunks: orderChunks.length, subChunks: subChunks.length, snaps: got.length };
}

function orderStable(row) {
  return [row.id, row.date_iso || "", row.status || "", row.match_key || "", row.client || ""].join("\t");
}

function subStable(row) {
  return [row.id, row.match_key || "", row.nick || "", row.status || "", row.sheet || "", row.n == null ? "" : row.n].join("\t");
}

function diffIds(before, after, stable) {
  const b = new Map();
  (before || []).forEach(function (row) {
    b.set(String(row.id), stable(row));
  });
  const a = new Map();
  (after || []).forEach(function (row) {
    a.set(String(row.id), stable(row));
  });
  const ids = [];
  b.forEach(function (val, id) {
    if (a.get(id) !== val) ids.push(id);
  });
  a.forEach(function (_val, id) {
    if (!b.has(id)) ids.push(id);
  });
  return ids;
}

function sashinRows(rows) {
  return (rows || [])
    .filter(function (row) {
      return String(row.client || "") === "sashin.pushok" && String(row.date_iso || "") === "2026-10-19";
    })
    .map(function (row) {
      return { id: row.id, date: row.date_iso, day: row.day_name, status: row.status };
    });
}

function loadState() {
  const orders = d1(
    "SELECT id, client, match_key, date_iso, ifnull(day_name,'') AS day_name, status FROM orders"
  );
  const subs = d1("SELECT id, match_key, nick, status, sheet, n FROM subs");
  const meta = d1(
    "SELECT key, value FROM meta WHERE key = 'stage_c_formula_ok' OR key LIKE 'week_finished:%' OR key LIKE 'WEEK_FINISHED_%'"
  );
  const snapRows = d1("SELECT payload FROM snap_cache WHERE cache_key = 'weekDayCounts'");
  let counts = { items: [] };
  if (snapRows[0] && snapRows[0].payload) counts = JSON.parse(snapRows[0].payload);
  const finished = Object.create(null);
  let stageCOk = false;
  meta.forEach(function (row) {
    if (!row || !row.key) return;
    if (row.key === "stage_c_formula_ok") stageCOk = String(row.value) === "1";
    else finished[row.key] = String(row.value || "");
  });
  return { orders: orders, subs: subs, counts: counts, finished: finished, stageCOk: stageCOk };
}

function publishPointer(plan, now) {
  const items = plan.counts || [];
  const total = items.reduce(function (sum, it) {
    return sum + (Number(it && it.count) || 0);
  }, 0);
  const countBody = {
    status: "success",
    items: items,
    total: total,
    fromD1: true,
    source: "d1-close",
    sandbox: false,
    datesFromSheet: false,
    weekCounts: "date-iso",
    closedFrom: plan.oldMonday
  };
  const map = Object.create(null);
  items.forEach(function (it) {
    if (it && it.dateIso && it.day) map[it.dateIso] = it.day;
  });
  const banner = {
    status: "success",
    finished: true,
    pulled: true,
    refused: false,
    weekKey: plan.oldMonday,
    action: "finishFullWeek",
    syncedAt: now,
    cutover: true,
    fromD1: true,
    sheets: false,
    weekCloseCanon: "d1-only"
  };
  const lines = [
    "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES (" +
      sqlStr("weekDayCounts") + ", " + sqlStr(JSON.stringify(countBody)) + ", " + sqlStr(now) +
      ") ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at;",
    "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES (" +
      sqlStr("dateToDay") + ", " + sqlStr(JSON.stringify({ map: map, source: "d1-close" })) + ", " + sqlStr(now) +
      ") ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at;",
    "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES (" +
      sqlStr("weekBanner") + ", " + sqlStr(JSON.stringify(banner)) + ", " + sqlStr(now) +
      ") ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at;",
    "INSERT INTO meta (key, value, updated_at) VALUES (" +
      sqlStr("week_close_retry:" + plan.oldMonday) + ", " + sqlStr(now) + ", " + sqlStr(now) +
      ") ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;"
  ];
  d1File(writeSql("pointer.sql", lines));
}

function resetFlags(plan, now) {
  const lines = [];
  (plan.counts || []).forEach(function (it) {
    if (!it || it.day === "Будущая неделя" || !it.dateIso) return;
    lines.push(
      "UPDATE deliveries SET delivered = 0, updated_at = " + sqlStr(now) + " WHERE date_iso = " + sqlStr(it.dateIso) + ";"
    );
    lines.push("DELETE FROM cutting_flags WHERE date_iso = " + sqlStr(it.dateIso) + ";");
  });
  (plan.counts || []).forEach(function (it) {
    const day = it && it.day;
    if (!day) return;
    ["assembly:", "courier:", "cutting:"].forEach(function (prefix) {
      lines.push("DELETE FROM snap_cache WHERE cache_key = " + sqlStr(prefix + day) + ";");
    });
  });
  if (lines.length) d1File(writeSql("flags.sql", lines));
}

function applyUpdates(updates, now) {
  const lines = [];
  updates.forEach(function (u) {
    lines.push(
      "UPDATE orders SET day_name = " + sqlStr(u.day) + ", updated_at = " + sqlStr(now) +
        " WHERE id = " + sqlStr(u.id) + " AND status = " + sqlStr(u.status) +
        " AND ifnull(day_name, '') = " + sqlStr(u.fromDay) + ";"
    );
  });
  for (let i = 0; i < lines.length; i += 25) {
    d1File(writeSql("upd-" + i + ".sql", lines.slice(i, i + 25)));
  }
}

function rollbackDays(before, after, now) {
  const byId = new Map();
  (after || []).forEach(function (row) {
    byId.set(String(row.id), row);
  });
  const lines = [];
  (before || []).forEach(function (row) {
    const cur = byId.get(String(row.id));
    if (!cur) return;
    if (String(cur.date_iso || "") !== String(row.date_iso || "")) return;
    if (String(cur.status || "") !== String(row.status || "")) return;
    if (String(cur.day_name || "") === String(row.day_name || "")) return;
    lines.push(
      "UPDATE orders SET day_name = " + sqlStr(row.day_name || "") + ", updated_at = " + sqlStr(now) +
        " WHERE id = " + sqlStr(row.id) + ";"
    );
  });
  for (let i = 0; i < lines.length; i += 25) {
    d1File(writeSql("rollback-" + i + ".sql", lines.slice(i, i + 25)));
  }
  return lines.length;
}

function mondayOfSnap(counts) {
  const items = (counts && counts.items) || [];
  for (let i = 0; i < items.length; i++) {
    if (items[i] && items[i].day === "Понедельник") return String(items[i].dateIso || items[i].date || "");
  }
  return "";
}

function main() {
  if (apply && process.env.GITHUB_REF && process.env.GITHUB_REF !== "refs/heads/main") {
    throw new Error("apply only on main");
  }
  fs.mkdirSync(outDir, { recursive: true });
  const today = minskToday();
  const state = loadState();
  const plan = planWeekCloseD1_({
    calendarMonday: mondayOf(today),
    todayIso: today,
    orders: state.orders,
    counts: state.counts,
    finished: state.finished,
    stageCOk: false,
    warehouseCanon: false
  });
  const byReason = Object.create(null);
  (plan.updates || []).forEach(function (u) {
    byReason[u.reason || ""] = (byReason[u.reason || ""] || 0) + 1;
  });
  const result = {
    mode: apply ? "apply" : "plan",
    today: today,
    calendarMonday: mondayOf(today),
    pointer: mondayOfSnap(state.counts),
    ok: false,
    message: plan.message || "",
    reason: plan.reason || "",
    retriedStuckLock: !!plan.retriedStuckLock,
    oldMonday: plan.oldMonday || "",
    newMonday: plan.newMonday || "",
    updates: (plan.updates || []).length,
    byReason: byReason,
    counts: plan.counts || [],
    warehouseApply: !!plan.warehouseApply,
    stageCOk: state.stageCOk,
    sashinBefore: sashinRows(state.orders),
    orderDiff: [],
    subDiff: [],
    nickDiff: []
  };
  if (!plan.ok) {
    const soft = plan.reason === "pointer_ahead" || plan.reason === "monday_lock";
    result.ok = soft;
    result.skipped = plan.reason || plan.message;
    fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
    if (!soft) throw new Error("plan " + (plan.reason || plan.message));
    console.log(JSON.stringify({ ok: true, skipped: result.skipped }));
    return;
  }
  const allowed = weekCloseFinishAllowed_(plan);
  if (!allowed.ok) {
    result.reason = allowed.reason;
    fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
    throw new Error("guard " + allowed.reason);
  }
  const expected = weekCloseCalendarNicks_(state.orders, plan.newMonday, plan.newEnd);
  const activeSashin = result.sashinBefore.filter(function (row) {
    return row.status === "active";
  });
  if (activeSashin.length !== 1) throw new Error("sashin 19.10 active " + activeSashin.length);
  const now = new Date().toISOString();
  const backupKey = "weekCloseRetry:" + plan.oldMonday + ":" + now.replace(/[:.]/g, "-");
  result.backup = backupKey;
  if (!apply) {
    result.ok = true;
    fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      ok: true,
      mode: "plan",
      updates: result.updates,
      byReason: byReason,
      newMonday: plan.newMonday,
      counts: (plan.counts || []).map(function (it) { return it.day + " " + it.count; })
    }));
    return;
  }
  const saved = saveBackup(backupKey, {
    orders: state.orders,
    subs: state.subs,
    counts: state.counts,
    planOld: plan.oldMonday,
    planNew: plan.newMonday
  }, now);
  result.backupSnaps = saved.snaps;
  applyUpdates(plan.updates || [], now);
  const mid = loadState();
  const orderDiff = diffIds(state.orders, mid.orders, orderStable);
  const subDiff = diffIds(state.subs, mid.subs, subStable);
  const nickDiff = weekCloseNickDiff_(expected, weekCloseCalendarNicks_(mid.orders, plan.newMonday, plan.newEnd));
  const clientDiff = weekCloseCountsEqual_(
    weekCloseClientCounts_(state.orders.map(function (row) {
      return { key: row.match_key || row.client || "", status: row.status };
    })),
    weekCloseClientCounts_(mid.orders.map(function (row) {
      return { key: row.match_key || row.client || "", status: row.status };
    }))
  );
  result.orderDiff = orderDiff;
  result.subDiff = subDiff;
  result.nickDiff = nickDiff.map(function (d) { return d.date; });
  result.clientDiff = clientDiff.map(function (d) { return d.key; });
  const sashinAfter = sashinRows(mid.orders);
  result.sashinAfter = sashinAfter;
  const sashinOk = sashinAfter.some(function (row) {
    return row.status === "active" && row.date === "2026-10-19" && row.day === "Понедельник";
  });
  if (orderDiff.length || subDiff.length || nickDiff.length || clientDiff.length || !sashinOk) {
    const n = rollbackDays(state.orders, mid.orders, now);
    result.ok = false;
    result.rolledBack = n;
    fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
    throw new Error("reconcile failed, rolled back " + n);
  }
  try {
    resetFlags(plan, now);
  } catch (eFlag) {
    result.flagError = String((eFlag && eFlag.message) || eFlag).slice(0, 300);
  }
  publishPointer(plan, now);
  for (let i = 0; i < 4; i++) {
    sleep(12);
    const again = d1("SELECT payload FROM snap_cache WHERE cache_key = 'weekDayCounts'");
    let body = {};
    try { body = JSON.parse((again[0] && again[0].payload) || "{}"); } catch (e) { body = {}; }
    const mon = ((body.items || []).find(function (it) { return it && it.day === "Понедельник"; }) || {});
    const iso = String(mon.dateIso || "");
    if (iso === plan.newMonday && body.weekCounts === "date-iso") break;
    publishPointer(plan, new Date().toISOString());
  }
  const finalState = loadState();
  result.sashinAfter = sashinRows(finalState.orders);
  result.pointerAfter = mondayOfSnap(finalState.counts);
  result.orderDiff = diffIds(state.orders, finalState.orders, orderStable);
  result.subDiff = diffIds(state.subs, finalState.subs, subStable);
  if (
    result.orderDiff.length ||
    result.subDiff.length ||
    (result.pointerAfter !== "2026-10-19" && result.pointerAfter !== "19.10.2026")
  ) {
    result.ok = false;
    fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
    throw new Error("final reconcile");
  }
  result.ok = true;
  result.warehouseApply = false;
  fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    ok: true,
    mode: "apply",
    backup: backupKey,
    updates: result.updates,
    byReason: byReason,
    pointerAfter: result.pointerAfter,
    sashin: result.sashinAfter
  }));
}

try {
  main();
} catch (e) {
  console.error(String((e && e.message) || e));
  process.exit(1);
}
