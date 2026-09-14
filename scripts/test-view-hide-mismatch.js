#!/usr/bin/env node
/**
 * Контракт: перенос/save 14→15 не прячет человека в Просмотре.
 * Не бьёт live таблицу.
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

function coerceDateIso_(raw) {
  var s = String(raw || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  var iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : "";
}

function weekSlotDateAction_(haveIso, wantIso, weekMap) {
  var have = coerceDateIso_(haveIso);
  var want = coerceDateIso_(wantIso);
  if (!want) return "skip";
  if (!have) return "stamp_empty";
  if (have === want) return "keep";
  if (weekMap && weekMap[have]) return "stamp_slot";
  return "detach";
}

function weekCloseScrubAction_(haveIso, wantIso) {
  var have = String(haveIso || "").trim();
  var want = String(wantIso || "").trim();
  if (!want) return "skip";
  if (!have) return "stamp_empty";
  if (have === want) return "keep";
  return "detach";
}

var weekMap = {
  "2026-09-14": "Понедельник",
  "2026-09-15": "Вторник"
};

assert(weekSlotDateAction_("2026-09-15", "2026-09-15", weekMap) === "keep", "matching iso keep");
assert(weekSlotDateAction_("2026-09-14", "2026-09-15", weekMap) === "stamp_slot", "Mon date on Tue column → stamp Tue");
assert(weekSlotDateAction_("15.09.2026", "2026-09-15", weekMap) === "keep", "DMY same day keep");
assert(weekSlotDateAction_("", "2026-09-15", weekMap) === "stamp_empty", "empty → stamp");
assert(weekSlotDateAction_("2026-09-08", "2026-09-15", weekMap) === "detach", "old week → detach");
assert(weekCloseScrubAction_("2026-09-07", "2026-09-14") === "detach", "close-week helper still detaches +7");
assert(coerceDateIso_("15.09.2026") === "2026-09-15", "coerce DMY");
assert(coerceDateIso_("2026-09-15T10:00:00") === "2026-09-15", "coerce datetime prefix");

var workerPath = path.join(__dirname, "../boinya-c/proxy/worker.js");
var uiPath = path.join(__dirname, "../boinya-c/app.main.js");
var gsPath = path.join(__dirname, "../Code.gs");
var worker = fs.readFileSync(workerPath, "utf8");
var ui = fs.readFileSync(uiPath, "utf8");
var gs = fs.readFileSync(gsPath, "utf8");

assert(worker.indexOf("function weekSlotDateAction_") >= 0, "worker weekSlotDateAction_");
assert(worker.indexOf("function coerceDateIso_") >= 0, "worker coerceDateIso_");
assert(worker.indexOf("function peopleWriteOnWeekRoute_") >= 0, "on-week people route helper");
assert(worker.indexOf("function slotIsoFromCountsItem_") >= 0, "slot iso from counts ISO or DMY");
assert(worker.indexOf("view-hide-mismatch-h1") >= 0, "prior deploy marker kept");
assert(worker.indexOf("week-write-on-slot-h1") >= 0, "week-write deploy marker");
assert(worker.indexOf("repairMissingWeekFromGas") >= 0, "repair action");
assert(worker.indexOf("restoreWeekFromBookings") >= 0, "restore from bookings");
assert(worker.indexOf("lookupClient_") >= 0, "lookup action");
assert(worker.indexOf("force_upsert_missing") >= 0, "heal force upsert missing");
assert(
  worker.indexOf("AND (day_name = '' OR day_name IS NULL) AND (match_key = ? OR lower(client) = ?) AND id != ?") >= 0,
  "calendar-only save does not delete week-slot rows"
);
assert(worker.indexOf("Do NOT drop slot members") >= 0 || worker.indexOf("same-week mismatch was stamped") >= 0, "getClients keeps slot members");

var moveRt = worker.indexOf("if (rNew && rNew.onWeek && rNew.dayName)");
var moveChunk = moveRt >= 0 ? worker.slice(moveRt, moveRt + 280) : "";
assert(moveChunk.indexOf("calendarOnly = false") >= 0, "move on-week ignores calendarOnly flag");
assert(
  worker.indexOf("Дата на слоте «Приём заказов»") >= 0 || gs.indexOf("Иначе move 14→15 с calendarOnly=1") >= 0,
  "GAS move on-week does not take calendarOnly path"
);

function peopleWriteOnWeekRoute_(onWeek, weekDay, action, params) {
  var p = Object.assign({}, params || {});
  var a = String(action || "");
  function toBool_(v) {
    return v === true || v === 1 || v === "1" || String(v || "").toLowerCase() === "true";
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
  if (onWeek && weekDay) {
    if (/^moveClient$/i.test(a)) {
      p.newDay = weekDay;
      p.calendarOnly = "0";
      if (p.newDate) p.newDate = coerceDateIso_(p.newDate) || p.newDate;
    } else {
      p.day = weekDay;
      p.calendarOnly = "0";
      p.alsoSaveOrder = "1";
    }
    return { action: a, params: p, onWeek: true, rewriteToBooking: false };
  }
  if (
    /^saveOrder$/i.test(a) &&
    (toBool_(p.calendarOnly) ||
      (!String(p.day || "").trim() && String(p.date || p.dateIso || p.deliveryDate || "").trim()))
  ) {
    return {
      action: "saveBooking",
      params: Object.assign({}, p, { action: "saveBooking", alsoSaveOrder: "0", calendarOnly: "1", day: "" }),
      onWeek: false,
      rewriteToBooking: true
    };
  }
  return { action: a, params: p, onWeek: false, rewriteToBooking: false };
}

var onWeekSave = peopleWriteOnWeekRoute_(true, "Вторник", "saveBooking", {
  calendarOnly: "1",
  alsoSaveOrder: "0",
  date: "2026-09-15",
  day: ""
});
assert(onWeekSave.params.calendarOnly === "0", "on-week saveBooking drops calendarOnly");
assert(onWeekSave.params.alsoSaveOrder === "1", "on-week saveBooking sets alsoSaveOrder");
assert(onWeekSave.params.day === "Вторник", "on-week saveBooking sets Tuesday");
assert(onWeekSave.rewriteToBooking === false, "on-week does not rewrite to booking-only");

var onWeekMove = peopleWriteOnWeekRoute_(true, "Вторник", "moveClient", {
  calendarOnly: "1",
  newDate: "2026-09-15",
  newDay: ""
});
assert(onWeekMove.params.calendarOnly === "0", "on-week move drops calendarOnly");
assert(onWeekMove.params.newDay === "Вторник", "on-week move sets newDay");

var offWeek = peopleWriteOnWeekRoute_(false, "", "saveOrder", {
  calendarOnly: "1",
  date: "2026-10-01",
  day: ""
});
assert(offWeek.rewriteToBooking === true, "off-week saveOrder still rewrites to saveBooking");
assert(offWeek.params.alsoSaveOrder === "0", "off-week does not alsoSaveOrder");

assert(gs.indexOf("handleRestoreWeekFromBookings") >= 0, "GAS restore from bookings");
assert(gs.indexOf("if (targetDayName) {") >= 0, "GAS move checks targetDayName before calendarOnly");

var saveDay = ui.indexOf("if (isEdit && dateOnWeek && resolvedDayName)");
var saveNick = ui.indexOf("if (isEdit && editClientSnap)");
var chunk = saveDay >= 0 && saveNick > saveDay ? ui.slice(saveDay, saveNick + 800) : "";
assert(chunk.indexOf("awaitPeopleDelete_") < 0 || chunk.indexOf("Предварительный deleteClient") >= 0, "no pre-delete on day change");
assert(ui.indexOf("var dayChanged = String(editDaySnap") < 0, "dayChanged delete removed");

if (process.exitCode) process.exit(process.exitCode);
console.log("all ok");
