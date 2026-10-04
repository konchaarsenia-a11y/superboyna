#!/usr/bin/env node
/**
 * getWeekSnapshot: один снимок недели, ретраи, fallback на посуточный resync.
 * Старый обход getWeekDayCounts + getClients остаётся, если action ещё не задеплоен.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerSrc = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
const gasSrc = fs.readFileSync(path.join(root, "Code.gs"), "utf8");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL  " + msg);
    return false;
  }
  console.log("ok    " + msg);
  return true;
}

function fnBody(src, name) {
  const startA = src.indexOf("async function " + name + "(");
  const start = startA >= 0 ? startA : src.indexOf("function " + name + "(");
  if (start < 0) return "";
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return "";
}

assert(gasSrc.includes('if (action === "getWeekSnapshot")'), "doGet и POST знают getWeekSnapshot");
assert((gasSrc.match(/action === "getWeekSnapshot"/g) || []).length >= 2, "хук и в doGet, и в handleApiAction");
const snapFn = fnBody(gasSrc, "handleGetWeekSnapshot");
assert(snapFn.includes("readSheetBlock_"), "снимок читает лист пачкой");
assert(!snapFn.includes(".getValue("), "handleGetWeekSnapshot без поклеточного getValue");
assert(snapFn.includes("snapshot_incomplete"), "пустая дата дня = невалидный снимок");
assert(!snapFn.includes("ensureManagerWeekendBlocks_"), "снимок не пишет блоки выходных");
const matrixFn = fnBody(gasSrc, "clientsFromBlockMatrix_");
assert(matrixFn.length > 0 && !matrixFn.includes("getRange") && !matrixFn.includes(".getValue("), "клиенты дня только из матрицы");
const readFn = fnBody(gasSrc, "readSheetBlock_");
assert(readFn.includes(".getValues()"), "readSheetBlock_ = один getValues");

const refresh = fnBody(workerSrc, "cutoverRefreshAllWeekDays_");
assert(refresh.includes("fetchWeekSnapshotRetry_"), "resync сначала пробует снимок");
assert(refresh.includes('gasProxy_("getWeekDayCounts"'), "fallback всё ещё зовёт getWeekDayCounts");
assert(refresh.includes('gasProxy_("getClients"'), "fallback всё ещё зовёт getClients");
assert(refresh.includes("snapshotDays"), "успешный снимок подменяет getClients");
assert(refresh.includes("liveSlotIso[String(itL.day)]"), "даты слота из items снимка или counts");
assert(refresh.includes("dmyToIso_(itL.date)"), "дата слота через dmyToIso_");
assert(/slotIso:\s*liveSlotIso\[day\]\s*\|\|\s*["']{2}/.test(refresh), "slotIso в replace");
assert(refresh.includes("if (d.sameDateSurvivor) continue"), "scrub #458: same-date без GAS delete");
assert(refresh.includes('path: resyncPath'), "возврат path");
assert(refresh.includes("weekResync path="), "лог пути");

const retry = fnBody(workerSrc, "fetchWeekSnapshotRetry_");
assert(retry.includes("[0, 400, 800]"), "три попытки, пауза 0/400/800");
assert(retry.includes("snapshotCall_"), "попытка с таймаутом");
const call = fnBody(workerSrc, "snapshotCall_");
assert(call.includes("35000") && call.includes("clearTimeout"), "таймаут 35с снимается");
const okFn = fnBody(workerSrc, "weekSnapshotPayloadOk_");
assert(okFn.includes('snap.status !== "success"'), "unknown_action и error не считаются снимком");
assert(okFn.includes("WEEK_DAYS"), "снимок обязан покрыть все дни недели");

const force = workerSrc.slice(
  workerSrc.indexOf('if (/^forceWeekD1Resync$/i.test(a))'),
  workerSrc.indexOf('if (/^repairShiftedWeekClose$/i.test(a))')
);
assert(force.includes("resync: resyncInfo"), "ответ forceWeekD1Resync содержит путь");
assert(force.includes("useGas: !snapPath"), "после снимка repair не ходит в GAS повторно");
assert(force.includes("delete resyncInfo.clientsByDay"), "ответ клиенту без корзин снимка");
assert(workerSrc.includes("pullClientFromMonth") || workerSrc.includes("pullClientsFromMonth"), "pull-from-month на месте");

const WEEK = [
  ["Понедельник", "05.10.2026"],
  ["Вторник", "06.10.2026"],
  ["Среда", "07.10.2026"],
  ["Четверг", "08.10.2026"],
  ["Пятница", "09.10.2026"],
  ["Суббота", "10.10.2026"],
  ["Воскресенье", "11.10.2026"],
  ["Будущая неделя", "12.10.2026"]
];

function clientRow(name) {
  return {
    name: name,
    client: name,
    matchKey: name,
    address: "addr " + name,
    note: "n",
    phone: "",
    basket: [{ name: "ЛЁГКОЕ", val: 100 }],
    segment: "Р",
    orderPrice: 10
  };
}

function goodSnapshot() {
  const days = WEEK.map(function (w) {
    const names = w[0] === "Понедельник" ? ["dupemon"] : ["p_" + w[0]];
    return {
      day: w[0],
      short: "",
      date: w[1],
      clients: names.map(clientRow)
    };
  });
  return {
    status: "success",
    source: "week-snapshot",
    days: days,
    items: days.map(function (d) {
      return { day: d.day, short: "", count: d.clients.length, date: d.date };
    }),
    total: days.length
  };
}

let Database = null;
try {
  const mod = await import("node:sqlite");
  Database = mod.DatabaseSync;
} catch (eNode) {
  try {
    const mod = await import("better-sqlite3");
    Database = mod.default || mod;
  } catch (eSql) {
    Database = null;
  }
}

if (!Database) {
  console.log("skip  sim: нет sqlite");
} else {
  function makeDb() {
    const db = new Database(":memory:");
    db.exec(fs.readFileSync(path.join(root, "boinya-c/proxy/schema.sql"), "utf8"));
    return db;
  }

  function d1(db) {
    return {
      prepare(sql) {
        const stmt = db.prepare(sql);
        function bound(args) {
          return {
            first: async () => stmt.get(...args) || null,
            all: async () => ({ results: stmt.all(...args) }),
            run: async () => stmt.run(...args)
          };
        }
        return Object.assign(bound([]), { bind: (...args) => bound(args) });
      }
    };
  }

  async function runMode(mode) {
    const gasCalls = [];
    const logs = [];
    let snapN = 0;
    const sandbox = {};
    for (const k of Object.getOwnPropertyNames(globalThis)) {
      try {
        sandbox[k] = globalThis[k];
      } catch (eG) {}
    }
    sandbox.console = {
      log: function () {
        logs.push(Array.prototype.join.call(arguments, " "));
      },
      error: function () {},
      warn: function () {}
    };
    sandbox.fetch = async (url) => {
      const u = new URL(String(url));
      const action = u.searchParams.get("action") || "";
      const day = u.searchParams.get("day") || "";
      gasCalls.push({ action: action, day: day });
      let payload = { status: "success" };
      if (action === "getWeekSnapshot") {
        snapN++;
        if (mode === "unknown") payload = { status: "unknown_action" };
        else if (mode === "retry" && snapN === 1) payload = { status: "error", message: "snapshot_incomplete" };
        else payload = goodSnapshot();
      } else if (action === "getWeekDayCounts") {
        payload.items = WEEK.map(function (w) {
          return { day: w[0], date: w[1], short: "", count: 1 };
        });
      } else if (action === "getClients") {
        const names = day === "Понедельник" ? ["dupemon"] : ["p_" + day];
        payload.clients = names.map(clientRow);
        payload.day = day;
        payload.date = (WEEK.find(function (w) { return w[0] === day; }) || [])[1] || "";
      } else if (action === "getCutting") {
        payload.items = [];
      } else if (action === "getViewCompare") {
        payload.month = [];
        payload.week = [];
      }
      return {
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify(payload)
      };
    };
    const ctx = vm.createContext(sandbox);
    vm.runInContext(workerSrc.replace(/^export default /m, "const __workerExport = "), ctx, {
      filename: "worker.js"
    });
    const db = makeDb();
    const env = { DB: d1(db), WEEK_D1_SYNC: "gas-authoritative", PEOPLE_CANON: "d1-primary" };
    db.prepare(
      `INSERT INTO orders (id, date_iso, day_name, client, match_key, address, note, phone, basket_json, segment, source, status, updated_at, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "Будущая неделя:DUPEMON",
      "2026-10-05",
      "Будущая неделя",
      "dupemon",
      "DUPEMON",
      "addr dupemon",
      "n",
      "",
      '[{"name":"СЕРДЦЕ","val":50}]',
      "Р",
      "sheet",
      "active",
      "2026-09-20T10:00:00.000Z",
      '{"orderPrice":10}'
    );
    db.prepare(
      `INSERT INTO orders (id, date_iso, day_name, client, match_key, address, note, phone, basket_json, segment, source, status, updated_at, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "Понедельник:DUPEMON",
      "2026-10-05",
      "Понедельник",
      "dupemon",
      "DUPEMON",
      "addr dupemon",
      "n",
      "",
      '[{"name":"СЕРДЦЕ","val":50}]',
      "Р",
      "sheet",
      "active",
      "2026-09-20T10:00:00.000Z",
      '{"orderPrice":10}'
    );
    const info = await ctx.cutoverRefreshAllWeekDays_(env, { clearDayTombs: true, forceGasReplace: true });
    const rows = db.prepare("SELECT id, date_iso, day_name, status, match_key FROM orders").all();
    return { gasCalls, logs, info, rows };
  }

  function brief(info) {
    return JSON.stringify({
      path: info && info.path,
      tries: info && info.tries,
      ms: info && info.ms
    });
  }

  const snap = await runMode("snapshot");
  assert(snap.info && snap.info.path === "snapshot" && snap.info.tries === 1, "путь snapshot tries=1, got " + brief(snap.info));
  assert(snap.logs.some(function (l) { return l.indexOf("weekResync path=snapshot ") === 0; }), "лог snapshot");
  assert(snap.gasCalls.filter(function (c) { return c.action === "getWeekSnapshot"; }).length === 1, "один getWeekSnapshot");
  assert(snap.gasCalls.filter(function (c) { return c.action === "getClients"; }).length === 0, "снимок не зовёт getClients");
  assert(snap.gasCalls.filter(function (c) { return c.action === "getWeekDayCounts"; }).length === 0, "снимок не зовёт getWeekDayCounts");
  assert(snap.gasCalls.filter(function (c) { return c.action === "deleteClient" || c.action === "removeCalendarClient"; }).length === 0, "same-date дубль без GAS delete");
  const live5 = snap.rows.filter(function (r) {
    return r.status === "active" && r.match_key === "DUPEMON" && r.date_iso === "2026-10-05";
  });
  assert(live5.length === 1, "dupemon одна живая на 05.10, got " + live5.length);

  const again = await runMode("retry");
  assert(again.info && again.info.path === "snapshot-retry 1" && again.info.tries === 2, "вторая попытка snapshot-retry 1, got " + brief(again.info));
  assert(again.gasCalls.filter(function (c) { return c.action === "getWeekSnapshot"; }).length === 2, "две попытки снимка");
  assert(again.gasCalls.filter(function (c) { return c.action === "getClients"; }).length === 0, "после ретрая getClients нет");

  const fb = await runMode("unknown");
  assert(fb.info && fb.info.path === "fallback-per-day" && fb.info.tries === 3, "unknown_action → fallback tries=3, got " + brief(fb.info));
  assert(fb.logs.some(function (l) { return l.indexOf("weekResync path=fallback-per-day") === 0; }), "лог fallback");
  assert(fb.gasCalls.filter(function (c) { return c.action === "getWeekSnapshot"; }).length === 3, "три неудачных снимка");
  assert(fb.gasCalls.filter(function (c) { return c.action === "getWeekDayCounts"; }).length === 1, "fallback один getWeekDayCounts");
  assert(fb.gasCalls.filter(function (c) { return c.action === "getClients"; }).length === 16, "fallback: 8 getClients дня + 8 в reattach");
  const liveFb = fb.rows.filter(function (r) {
    return r.status === "active" && r.match_key === "DUPEMON" && r.date_iso === "2026-10-05";
  });
  assert(liveFb.length === 1, "fallback тоже не двоит dupemon, got " + liveFb.length);
  assert(fb.gasCalls.filter(function (c) { return c.action === "deleteClient" || c.action === "removeCalendarClient"; }).length === 0, "fallback same-date без GAS delete");
}

if (failed) {
  console.error("week-snapshot-resync FAILED " + failed);
  process.exit(1);
}
console.log("week-snapshot-resync ok");
