#!/usr/bin/env node
/**
 * Закрытие недели 04.10.2026: дата слота не берётся «большинством» старых
 * date_iso, и scrub дубля на ту же дату не зовёт GAS delete.
 * На старом worker (большинство date_iso / delTomb+deleteClient) падает.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = process.env.WORKER_FILE || path.join(root, "boinya-c/proxy/worker.js");
const src = fs.readFileSync(workerPath, "utf8");

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

function fnBody(name) {
  const start = src.indexOf("async function " + name + "(");
  const start2 = start >= 0 ? start : src.indexOf("function " + name + "(");
  if (start2 < 0) return "";
  const brace = src.indexOf("{", start2);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start2, i + 1);
    }
  }
  return "";
}

assert(src.includes("async function weekSlotDatesFromSheetSnap_("), "есть weekSlotDatesFromSheetSnap_");
const helper = fnBody("weekSlotDatesFromSheetSnap_");
assert(helper.includes('getSnapRaw_(env, "weekDayCountsSheet")'), "helper читает weekDayCountsSheet");
assert(helper.includes("dmyToIso_("), "helper проверяет дату через dmyToIso_");

const rebuild = fnBody("rebuildWeekCounts_");
assert(rebuild.includes("const sheetDates = await weekSlotDatesFromSheetSnap_(env)"), "rebuild берёт даты листа");
assert(/let date = sheetDates\[d\] \|\| ["']{2}/.test(rebuild), "дата дня = sheetDates[d] или пусто");
const dateAssign = rebuild.indexOf("let date = sheetDates[d]");
const majority = rebuild.indexOf("GROUP BY date_iso ORDER BY n DESC");
assert(dateAssign >= 0 && majority > dateAssign, "большинство date_iso только после пустой даты листа");
assert(rebuild.includes("prevDates[d]"), "fallback на предыдущие counts остался");

const replace = fnBody("replaceDayOrdersFromClients_");
assert(replace.includes("const slotIsoOpt = coerceDateIso_(opts.slotIso)"), "replace принимает opts.slotIso");
assert(
  replace.includes('slotIsoOpt ? { iso: slotIsoOpt, date: isoToDmy_(slotIsoOpt) } : await dayDateInfo_(env, day)'),
  "slotIso подменяет dayDateInfo_"
);

const refresh = fnBody("cutoverRefreshAllWeekDays_");
assert(refresh.includes("liveSlotIso[String(itL.day)]") || refresh.includes("liveSlotIso["), "liveSlotIso из getWeekDayCounts");
assert(refresh.includes("dmyToIso_(itL.date)") || refresh.includes("dmyToIso_(it.date)"), "liveSlotIso через dmyToIso_");
assert(/slotIso:\s*liveSlotIso\[day\]\s*\|\|\s*["']{2}/.test(refresh), "slotIso уходит в replace с gasAuthoritative");

const scrub = fnBody("scrubWeekClientDupes_");
assert(scrub.includes("sameDateSurvivor: true"), "dropped.sameDateSurvivor");
assert(!scrub.includes("week_dupe_scrub"), "scrub не ставит delTomb week_dupe_scrub");
assert(!scrub.includes("delTomb:"), "scrub не пишет delTomb");
assert(refresh.includes("if (d.sameDateSurvivor) continue"), "GAS delete пропускает sameDateSurvivor");

const WEEK = [
  ["Понедельник", "28.09.2026", "2026-09-28", "05.10.2026", "2026-10-05"],
  ["Вторник", "29.09.2026", "2026-09-29", "06.10.2026", "2026-10-06"],
  ["Среда", "30.09.2026", "2026-09-30", "07.10.2026", "2026-10-07"],
  ["Четверг", "01.10.2026", "2026-10-01", "08.10.2026", "2026-10-08"],
  ["Пятница", "02.10.2026", "2026-10-02", "09.10.2026", "2026-10-09"],
  ["Суббота", "03.10.2026", "2026-10-03", "10.10.2026", "2026-10-10"],
  ["Воскресенье", "04.10.2026", "2026-10-04", "11.10.2026", "2026-10-11"],
  ["Будущая неделя", "05.10.2026", "2026-10-05", "12.10.2026", "2026-10-12"]
];

const NEW_PEOPLE = {
  Понедельник: ["newmon_a", "newmon_b"],
  Вторник: ["evgenia_In", "_ann22_"],
  Среда: ["polotno_an", "confettins97", "karpusha_me"],
  Четверг: ["thu_new"],
  Пятница: ["Наталья Фалютинская"],
  Суббота: ["sat_new"],
  Воскресенье: ["sun_new"],
  "Будущая неделя": ["future_new"]
};

let Database = null;
let dbKind = "";
try {
  const mod = await import("better-sqlite3");
  Database = mod.default || mod;
  dbKind = "better-sqlite3";
} catch (eSql) {
  try {
    const mod = await import("node:sqlite");
    Database = mod.DatabaseSync;
    dbKind = "node:sqlite";
  } catch (eNode) {
    Database = null;
  }
}

if (!Database) {
  console.log("skip  sim: нет better-sqlite3 и node:sqlite");
} else {
  console.log("sim   via " + dbKind);
  const db = new Database(":memory:");
  db.exec(fs.readFileSync(path.join(root, "boinya-c/proxy/schema.sql"), "utf8"));

  function d1() {
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

  const gasCalls = [];
  const sandbox = {};
  for (const k of Object.getOwnPropertyNames(globalThis)) {
    try {
      sandbox[k] = globalThis[k];
    } catch (eG) {}
  }
  sandbox.fetch = async (url, opts) => {
      opts = opts || {};
      const u = new URL(String(url));
      let action = u.searchParams.get("action") || "";
      let params = {};
      u.searchParams.forEach((v, k) => {
        params[k] = v;
      });
      if (opts.method === "POST" && opts.body) {
        try {
          const body = JSON.parse(String(opts.body));
          action = body.action || action;
          params = Object.assign(params, body);
        } catch (eBody) {}
      }
      gasCalls.push({
        action: action,
        method: opts.method || "GET",
        day: params.day || "",
        date: params.date || params.deliveryDate || "",
        client: params.client || ""
      });
      let payload = { status: "success" };
      if (action === "getWeekDayCounts") {
        payload.items = WEEK.map((w) => ({ day: w[0], date: w[3], short: "", count: 1 }));
      } else if (action === "getClients") {
        const names = NEW_PEOPLE[params.day] || [];
        payload.clients = names.map((name) => ({
          name: name,
          client: name,
          matchKey: name,
          address: "addr " + name,
          note: "n",
          phone: "",
          basket: [{ name: "ЛЁГКОЕ", val: 100 }],
          segment: "Р",
          orderPrice: 10
        }));
        if (params.day === "Понедельник") {
          payload.clients.push({
            name: "dupemon",
            client: "dupemon",
            matchKey: "dupemon",
            address: "addr dupemon",
            note: "n",
            basket: [{ name: "СЕРДЦЕ", val: 50 }],
            segment: "Р",
            orderPrice: 10
          });
        }
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
  const code = src.replace(/^export default /m, "const __workerExport = ");
  vm.runInContext(code, ctx, { filename: "worker.js" });
  const env = { DB: d1(), WEEK_D1_SYNC: "gas-authoritative", PEOPLE_CANON: "d1-primary" };

  function insert(row) {
    db.prepare(
      `INSERT INTO orders (id, date_iso, day_name, client, match_key, address, note, phone, basket_json, segment, source, status, updated_at, meta_json)
       VALUES (@id, @date_iso, @day_name, @client, @match_key, @address, @note, @phone, @basket_json, @segment, @source, @status, @updated_at, @meta_json)`
    ).run(
      Object.assign(
        {
          address: "addr",
          note: "old",
          phone: "",
          basket_json: "[]",
          segment: "Р",
          source: "sheet",
          status: "active",
          updated_at: "2026-09-20T10:00:00.000Z",
          meta_json: '{"orderPrice":10}'
        },
        row
      )
    );
  }

  for (const w of WEEK) {
    insert({
      id: w[0] + ":OLDHIST",
      date_iso: w[2],
      day_name: w[0],
      client: "oldhist_" + w[0],
      match_key: "OLDHIST" + w[0]
    });
  }
  for (const extra of ["oldtue_a", "oldtue_b"]) {
    insert({
      id: "Вторник:" + extra.toUpperCase(),
      date_iso: "2026-09-29",
      day_name: "Вторник",
      client: extra,
      match_key: extra.toUpperCase()
    });
  }
  for (const extra of ["oldwed_a", "oldwed_b"]) {
    insert({
      id: "Среда:" + extra.toUpperCase(),
      date_iso: "2026-09-30",
      day_name: "Среда",
      client: extra,
      match_key: extra.toUpperCase()
    });
  }
  for (const extra of ["oldfri_a", "oldfri_b"]) {
    insert({
      id: "Пятница:" + extra.toUpperCase(),
      date_iso: "2026-10-02",
      day_name: "Пятница",
      client: extra,
      match_key: extra.toUpperCase()
    });
  }
  insert({
    id: "Будущая неделя:DUPEMON",
    date_iso: "2026-10-05",
    day_name: "Будущая неделя",
    client: "dupemon",
    match_key: "DUPEMON",
    basket_json: '[{"name":"СЕРДЦЕ","val":50}]'
  });
  insert({
    id: "Понедельник:DUPEMON",
    date_iso: "2026-10-05",
    day_name: "Понедельник",
    client: "dupemon",
    match_key: "DUPEMON",
    basket_json: '[{"name":"СЕРДЦЕ","val":50}]'
  });
  insert({
    id: "extra:DUPEMON",
    date_iso: "2026-10-05",
    day_name: "Понедельник",
    client: "dupemon",
    match_key: "DUPEMON",
    basket_json: "[]"
  });

  const sheetItems = WEEK.map((w) => ({ day: w[0], date: w[3], count: 1 }));
  await ctx.putSnap_(env, "weekDayCountsSheet", { status: "success", items: sheetItems });
  await ctx.putSnap_(env, "weekDayCounts", {
    status: "success",
    items: WEEK.map((w) => ({ day: w[0], date: w[1], count: 3 }))
  });

  const rebuilt = await ctx.rebuildWeekCounts_(env);
  const tue = (rebuilt.items || []).find((it) => it.day === "Вторник");
  const wed = (rebuilt.items || []).find((it) => it.day === "Среда");
  const fri = (rebuilt.items || []).find((it) => it.day === "Пятница");
  assert(tue && tue.date === "06.10.2026", "Вт слот с листа 06.10, не большинство 29.09, got " + (tue && tue.date));
  assert(wed && wed.date === "07.10.2026", "Ср слот с листа 07.10, got " + (wed && wed.date));
  assert(fri && fri.date === "09.10.2026", "Пт слот с листа 09.10, got " + (fri && fri.date));

  await ctx.cutoverRefreshAllWeekDays_(env, { clearDayTombs: true, forceGasReplace: true });
  await ctx.restoreShiftedWeekClose_(env, "2026-09-28", { toMondayIso: "2026-10-05", refillCalendar: true });

  const rows = db.prepare("SELECT id, date_iso, day_name, client, match_key, status FROM orders").all();
  function activeOn(mk, iso) {
    return rows.filter((r) => r.status === "active" && r.match_key === mk && r.date_iso === iso);
  }
  const expectOne = [
    ["EVGENIAIN", "2026-10-06", "2026-09-29"],
    ["ANN22", "2026-10-06", "2026-09-29"],
    ["POLOTNOAN", "2026-10-07", "2026-09-30"],
    ["CONFETTINS97", "2026-10-07", "2026-09-30"],
    ["KARPUSHAME", "2026-10-07", "2026-09-30"],
    ["НАТАЛЬЯ ФАЛЮТИНСКАЯ", "2026-10-09", "2026-10-02"],
    ["DUPEMON", "2026-10-05", ""]
  ];
  for (const [mk, iso, oldIso] of expectOne) {
    const live = activeOn(mk, iso);
    assert(live.length === 1, mk + " ровно одна живая на " + iso + ", got " + live.length + " " + JSON.stringify(live));
    if (oldIso) {
      const back = activeOn(mk, oldIso);
      assert(back.length === 0, mk + " нет копии на " + oldIso + ", got " + JSON.stringify(back));
    }
  }
  const histTue = rows.filter((r) => r.status === "active" && r.date_iso === "2026-09-29" && r.match_key === "OLDTUE_A");
  const histMon = rows.filter((r) => r.status === "active" && r.date_iso === "2026-09-28" && String(r.match_key).includes("OLDHIST"));
  assert(histTue.length === 1, "история Вт 29.09 на месте");
  assert(histMon.length === 1, "история Пн 28.09 на месте");
  const dupesOn5 = rows.filter((r) => r.status === "active" && r.date_iso === "2026-10-05" && r.match_key === "DUPEMON");
  assert(dupesOn5.length === 1, "05.10 dupemon не сдвоен, got " + dupesOn5.length);

  const badGas = gasCalls.filter((c) => c.action === "deleteClient" || c.action === "removeCalendarClient");
  assert(badGas.length === 0, "нет GAS deleteClient/removeCalendarClient, got " + JSON.stringify(badGas));
  const tombs = db
    .prepare("SELECT cache_key FROM snap_cache WHERE cache_key LIKE 'delTomb:%' AND payload LIKE '%week_dupe_scrub%'")
    .all();
  assert(tombs.length === 0, "нет delTomb week_dupe_scrub");
}

if (failed) {
  console.error("week-close-stale-dates FAILED " + failed);
  process.exit(1);
}
console.log("week-close-stale-dates ok");
