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

var workerPath = path.join(__dirname, "../boinya-c/proxy/worker.js");
var uiPath = path.join(__dirname, "../boinya-c/app.main.js");
var worker = fs.readFileSync(workerPath, "utf8");
var ui = fs.readFileSync(uiPath, "utf8");

assert(worker.indexOf("function weekSlotDateAction_") >= 0, "worker weekSlotDateAction_");
assert(worker.indexOf("function coerceDateIso_") >= 0, "worker coerceDateIso_");
assert(worker.indexOf("view-hide-mismatch-h1") >= 0, "deploy marker");
assert(worker.indexOf("repairMissingWeekFromGas") >= 0, "repair action");
assert(worker.indexOf("lookupClient_") >= 0, "lookup action");
assert(worker.indexOf("force_upsert_missing") >= 0, "heal force upsert missing");
assert(
  worker.indexOf("AND (day_name = '' OR day_name IS NULL) AND (match_key = ? OR lower(client) = ?) AND id != ?") >= 0,
  "calendar-only save does not delete week-slot rows"
);
assert(worker.indexOf("Do NOT drop slot members") >= 0 || worker.indexOf("same-week mismatch was stamped") >= 0, "getClients keeps slot members");

var saveDay = ui.indexOf("if (isEdit && dateOnWeek && resolvedDayName)");
var saveNick = ui.indexOf("if (isEdit && editClientSnap)");
var chunk = saveDay >= 0 && saveNick > saveDay ? ui.slice(saveDay, saveNick + 800) : "";
assert(chunk.indexOf("awaitPeopleDelete_") < 0 || chunk.indexOf("Предварительный deleteClient") >= 0, "no pre-delete on day change");
assert(ui.indexOf("var dayChanged = String(editDaySnap") < 0, "dayChanged delete removed");

if (process.exitCode) process.exit(process.exitCode);
console.log("all ok");
