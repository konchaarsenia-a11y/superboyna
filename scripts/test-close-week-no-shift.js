#!/usr/bin/env node
/**
 * Контракт close-week: указатель недели +7, date_iso не мигрирует 07.09 → 14.09.
 * Не вызывает live finishFullWeek.
 */
var fs = require("fs");
var path = require("path");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL  " + msg);
    process.exitCode = 1;
    return false;
  }
  console.log("ok    " + msg);
  return true;
}

function weekCloseScrubAction_(haveIso, wantIso) {
  var have = String(haveIso || "").trim();
  var want = String(wantIso || "").trim();
  if (!want) return "skip";
  if (!have) return "stamp_empty";
  if (have === want) return "keep";
  return "detach";
}

var workerPath = path.join(__dirname, "../boinya-c/proxy/worker.js");
var gsPath = path.join(__dirname, "../Code.gs");
var uiPath = path.join(__dirname, "../boinya-c/app.main.js");
var worker = fs.readFileSync(workerPath, "utf8");
var gs = fs.readFileSync(gsPath, "utf8");
var ui = fs.readFileSync(uiPath, "utf8");

assert(weekCloseScrubAction_("", "2026-09-14") === "stamp_empty", "empty iso → stamp slot");
assert(weekCloseScrubAction_("2026-09-14", "2026-09-14") === "keep", "same iso → keep");
assert(weekCloseScrubAction_("2026-09-07", "2026-09-14") === "detach", "07.09 vs 14.09 → detach");
assert(weekCloseScrubAction_("2026-09-08", "2026-09-14") === "detach", "other date → detach");
assert(weekCloseScrubAction_("2026-09-07", "") === "skip", "no wantIso → skip");
assert(weekCloseScrubAction_("2026-09-07", "2026-09-14") !== "remap", "never remap +7");

var extracted = worker.match(/function weekCloseScrubAction_\([\s\S]*?\n\}/);
assert(!!extracted, "worker exports weekCloseScrubAction_");
if (extracted) {
  /* eslint-disable no-eval */
  eval(extracted[0]);
  assert(weekCloseScrubAction_("2026-09-07", "2026-09-14") === "detach", "worker helper: 7→14 detach");
}

function coerceDateIso_(raw) {
  var s = String(raw || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  var iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : "";
}
function normalizeMatchKey_(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[._\s]+/g, "");
}
function weekSlotDateAction_(haveIso, wantIso, weekMap) {
  var have = coerceDateIso_(haveIso);
  var want = coerceDateIso_(wantIso);
  if (!want) return "skip";
  if (!have) return "stamp_empty";
  if (have === want) return "keep";
  if (weekMap && weekMap[have] && weekMap[want]) return "stamp_slot";
  return "detach";
}
function calendarOrderId_(matchKey, dateIso) {
  var mk = normalizeMatchKey_(matchKey);
  var iso = coerceDateIso_(dateIso);
  if (!mk || !iso) return "";
  return "CAL:" + mk + ":" + iso;
}
function shouldRebindOrderDate_(haveIso, wantIso) {
  var have = coerceDateIso_(haveIso);
  var want = coerceDateIso_(wantIso);
  if (!want) return false;
  if (!have) return true;
  return have === want;
}

var oldMap = {
  "2026-09-07": "Понедельник",
  "2026-09-08": "Вторник",
  "2026-09-09": "Среда"
};
var newMap = {
  "2026-09-14": "Понедельник",
  "2026-09-15": "Вторник",
  "2026-09-16": "Среда"
};
var sameWeekMap = {
  "2026-09-14": "Понедельник",
  "2026-09-15": "Вторник"
};
assert(weekSlotDateAction_("2026-09-07", "2026-09-14", newMap) === "detach", "new week map: 07 vs 14 → detach");
assert(weekSlotDateAction_("2026-09-07", "2026-09-14", oldMap) === "detach", "stale old map: 07 vs 14 → detach (not stamp)");
assert(weekSlotDateAction_("2026-09-14", "2026-09-15", sameWeekMap) === "stamp_slot", "same week Mon→Tue still stamps");
assert(weekSlotDateAction_("", "2026-09-14", newMap) === "stamp_empty", "empty iso still stamps slot");
assert(shouldRebindOrderDate_("2026-09-07", "2026-09-14") === false, "upsert must not rebind 07→14");
assert(shouldRebindOrderDate_("", "2026-09-14") === true, "empty date may take slot iso");
assert(shouldRebindOrderDate_("2026-09-14", "2026-09-14") === true, "same date rebind ok");
assert(calendarOrderId_("Ann", "2026-09-07") === "CAL:ann:2026-09-07", "calendar id from slot");

function simulateCloseWeekKeepDates_(rows, wantIso, weekMap) {
  return (rows || []).map(function (row) {
    var act = weekSlotDateAction_(row.date_iso, wantIso, weekMap);
    if (act === "detach") {
      return {
        id: calendarOrderId_(row.match_key, row.date_iso),
        date_iso: row.date_iso,
        day_name: "",
        match_key: row.match_key
      };
    }
    if (act === "stamp_slot" || act === "stamp_empty") {
      return Object.assign({}, row, { date_iso: wantIso });
    }
    return row;
  });
}
var afterClose = simulateCloseWeekKeepDates_(
  [{ id: "Понедельник:ann", date_iso: "2026-09-07", day_name: "Понедельник", match_key: "ann" }],
  "2026-09-14",
  newMap
);
assert(afterClose[0].date_iso === "2026-09-07", "close-week keeps original date_iso");
assert(afterClose[0].day_name === "", "close-week detaches day_name");
assert(afterClose[0].id === "CAL:ann:2026-09-07", "close-week frees Понедельник:ann id");
var afterStale = simulateCloseWeekKeepDates_(
  [{ id: "Понедельник:ann", date_iso: "2026-09-07", day_name: "Понедельник", match_key: "ann" }],
  "2026-09-14",
  oldMap
);
assert(afterStale[0].date_iso === "2026-09-07", "stale weekMap still keeps 07.09 (no +7 stamp)");

var slotFn = worker.match(/function weekSlotDateAction_\([\s\S]*?\n\}/);
assert(!!slotFn, "worker exports weekSlotDateAction_");
if (slotFn) {
  eval(slotFn[0]);
  assert(weekSlotDateAction_("2026-09-07", "2026-09-14", newMap) === "detach", "worker: new map 7→14 detach");
  assert(weekSlotDateAction_("2026-09-07", "2026-09-14", oldMap) === "detach", "worker: stale map 7→14 detach");
  assert(weekSlotDateAction_("2026-09-14", "2026-09-15", sameWeekMap) === "stamp_slot", "worker: intra-week stamp");
}
var rebindFn = worker.match(/function shouldRebindOrderDate_\([\s\S]*?\n\}/);
assert(!!rebindFn, "worker exports shouldRebindOrderDate_");
if (rebindFn) {
  eval(rebindFn[0]);
  assert(shouldRebindOrderDate_("2026-09-07", "2026-09-14") === false, "worker: no rebind +7");
}
var calFn = worker.match(/function calendarOrderId_\([\s\S]*?\n\}/);
assert(!!calFn, "worker exports calendarOrderId_");
if (calFn) {
  eval(calFn[0]);
  assert(calendarOrderId_("Ann", "2026-09-07") === "CAL:ann:2026-09-07", "worker calendar id");
}

var scrubStart = worker.indexOf("async function scrubMismatchedDayOrders_");
var scrubEnd = worker.indexOf("async function scrubAllDayDateMismatches_");
var scrubBody = scrubStart >= 0 && scrubEnd > scrubStart ? worker.slice(scrubStart, scrubEnd) : "";
assert(scrubBody.indexOf("weekSlotDateAction_") >= 0, "scrub uses weekSlotDateAction_");
assert(scrubBody.indexOf("act === \"detach\"") >= 0 || scrubBody.indexOf("act === 'detach'") >= 0, "scrub detach branch");
assert(scrubBody.indexOf("stamp_slot") >= 0, "same-week slot stamps date_iso");
assert(scrubBody.indexOf("detachWeekSlotRowKeepDate_") >= 0, "scrub rekeys slot id on detach");
assert(
  /UPDATE orders SET date_iso = \?, updated_at = \? WHERE id = \?/.test(scrubBody) &&
    scrubBody.indexOf("stamp_empty") >= 0,
  "date_iso UPDATE for empty/same-week stamp"
);
assert(worker.indexOf("weekMap[have] && weekMap[want]") >= 0, "stamp only when both dates on current week");
assert(worker.indexOf("async function detachWeekSlotRowKeepDate_") >= 0, "detach rekey helper");
assert(worker.indexOf("close-week-no-shift-h2") >= 0, "deploy marker h2");
assert(worker.indexOf("shouldRebindOrderDate_") >= 0, "upsert date-rebind guard");
var missStart = worker.indexOf("async function upsertMissingClientsFromGas_");
var missEnd = worker.indexOf("async function countActiveOrdersForDay_");
var missBody = missStart >= 0 && missEnd > missStart ? worker.slice(missStart, missEnd) : "";
assert(missBody.indexOf("shouldRebindOrderDate_") >= 0, "upsertMissing refuses foreign date_iso");
assert(missBody.indexOf("detachWeekSlotRowKeepDate_") >= 0, "upsertMissing detaches leftover slot");
var findAny = missBody.indexOf("exists = await findActiveOrderByMatch_");
var afterAny = findAny >= 0 ? missBody.slice(findAny) : "";
assert(afterAny.indexOf("continue;") >= 0, "upsertMissing skips clone when already active on other date");
assert(
  !/haveIso2[\s\S]{0,120}exists = null/.test(afterAny),
  "upsertMissing must not null-out and INSERT Future clone"
);
var repStart = worker.indexOf("async function replaceDayOrdersFromClients_");
var repSlice = repStart >= 0 ? worker.slice(repStart, worker.indexOf("async function cutoverRefreshAllWeekDays_")) : "";
assert(repSlice.indexOf("scrubMismatchedDayOrders_") >= 0, "replaceDay detaches leftovers before upsert");
assert(repSlice.indexOf("shouldRebindOrderDate_") >= 0, "replaceDay will not stamp leftover Day:mk date");

assert(worker.indexOf("restoreShiftedWeekClose_") >= 0, "repair helper present");
assert(worker.indexOf("repairShiftedWeekClose") >= 0, "repair action present");
assert(worker.indexOf("repairMissingOrderPrices") >= 0, "price refill after repair");
assert(worker.indexOf("reattachWeekSlotDayNames_") >= 0, "reattach helper present");
assert(worker.indexOf("repairDetachedWeekSlots") >= 0, "reattach action present");
assert(worker.indexOf("decideWeekSlotCalendarRow_") >= 0, "reattach decision helper");
assert(worker.indexOf("close-week-no-shift-h2") >= 0, "deploy marker");
assert(worker.indexOf("day_name = '' OR day_name IS NULL") >= 0, "getClients includes detached date_iso rows");

var finStart = gs.indexOf("function finishFullWeekProduction");
var finEnd = gs.indexOf("function actorIsOwner_");
var fin = finStart >= 0 && finEnd > finStart ? gs.slice(finStart, finEnd) : "";
assert(fin.indexOf("prevMondayIso") >= 0, "GAS returns prevMondayIso");
assert(fin.indexOf("calendarUnchanged") >= 0, "GAS flags calendar unchanged");
assert(fin.indexOf("Календарь_Дат") === -1 || fin.indexOf("НЕ сдвигаем") >= 0, "finish does not rewrite calendar dates");

assert(ui.indexOf("restoreFromMonday") >= 0, "UI finish asks Worker restore");
assert(ui.indexOf("restoreShifted") >= 0, "UI resync restores shifted rows");
assert(ui.indexOf("repairDetachedWeekSlots") >= 0, "UI resync reattaches detached slots");

function decideRestoreRow_(row, gasMks, newIso) {
  if (!row || row.date_iso !== newIso) return "skip";
  if (row.match_key && gasMks[row.match_key]) return "keep";
  return "restore";
}
assert(
  decideRestoreRow_({ date_iso: "2026-09-14", match_key: "ann" }, {}, "2026-09-14") === "restore",
  "D1 +7 not on GAS → restore to 07.09"
);
assert(
  decideRestoreRow_({ date_iso: "2026-09-14", match_key: "ann" }, { ann: true }, "2026-09-14") === "keep",
  "D1 +7 also on GAS Monday → keep (Future/materialize)"
);
assert(
  decideRestoreRow_({ date_iso: "2026-09-14", match_key: "ann" }, {}, "2026-09-21") === "skip",
  "other new week → skip"
);

function decideWeekSlotCalendarRow_(row, wantIso, day, gasMks, hasSlotRow) {
  if (!row) return "skip";
  var iso = String(row.date_iso || "");
  var dn = String(row.day_name || "");
  var mk = String(row.match_key || "").trim();
  if (!wantIso || iso !== wantIso) return "skip";
  if (dn === day) return "keep_slot";
  if (dn) return "skip";
  if (hasSlotRow) return "dedupe_calendar";
  if (mk && gasMks && gasMks[mk]) return "reattach";
  return "keep_calendar";
}
assert(
  decideWeekSlotCalendarRow_(
    { date_iso: "2026-09-16", day_name: "", match_key: "viihrova" },
    "2026-09-16",
    "Среда",
    { viihrova: true },
    false
  ) === "reattach",
  "detached Wed on GAS → reattach"
);
assert(
  decideWeekSlotCalendarRow_(
    { date_iso: "2026-09-16", day_name: "", match_key: "viihrova" },
    "2026-09-16",
    "Среда",
    { viihrova: true },
    true
  ) === "dedupe_calendar",
  "detached duplicate of slot row → dedupe"
);
assert(
  decideWeekSlotCalendarRow_(
    { date_iso: "2026-09-16", day_name: "Среда", match_key: "katya" },
    "2026-09-16",
    "Среда",
    { katya: true },
    true
  ) === "keep_slot",
  "already on Wednesday → keep"
);
assert(
  decideWeekSlotCalendarRow_(
    { date_iso: "2026-09-07", day_name: "", match_key: "old" },
    "2026-09-16",
    "Среда",
    { old: true },
    false
  ) === "skip",
  "old-week date_iso → skip (do not steal history)"
);

if (process.exitCode) {
  console.error("\nclose-week-no-shift: FAILED");
  process.exit(1);
}
console.log("\nclose-week-no-shift: ALL PASS");
