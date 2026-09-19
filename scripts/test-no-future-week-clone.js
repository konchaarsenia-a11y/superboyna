#!/usr/bin/env node
/**
 * Контракт: не клонировать людей текущей недели на Future/+7.
 * Не бьёт live таблицу и не вызывает finishFullWeek.
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

function decideFutureWeekDupe_(onSourceWeek, onGasFuture, onGasCalendar) {
  if (!onSourceWeek) return "keep";
  if (onGasFuture || onGasCalendar) return "keep";
  return "drop";
}

assert(
  decideFutureWeekDupe_(true, false, false) === "drop",
  "Mon 21 person copied to 28 → drop"
);
assert(
  decideFutureWeekDupe_(false, false, false) === "keep",
  "Ba2ra / Maria only on 28 → keep"
);
assert(
  decideFutureWeekDupe_(false, true, false) === "keep",
  "GAS Future person not on 21 week → keep"
);
assert(
  decideFutureWeekDupe_(true, true, false) === "keep",
  "same person on 21 and GAS Future → keep genuine"
);
assert(
  decideFutureWeekDupe_(true, false, true) === "keep",
  "same person on 21 and GAS calendar 28 → keep genuine"
);

var workerPath = path.join(__dirname, "../boinya-c/proxy/worker.js");
var gsPath = path.join(__dirname, "../Code.gs");
var worker = fs.readFileSync(workerPath, "utf8");
var gs = fs.readFileSync(gsPath, "utf8");

var extracted = worker.match(/function decideFutureWeekDupe_\([\s\S]*?\n\}/);
assert(!!extracted, "worker exports decideFutureWeekDupe_");
if (extracted) {
  /* eslint-disable no-eval */
  eval(extracted[0]);
  assert(decideFutureWeekDupe_(true, false, false) === "drop", "worker helper: clone → drop");
  assert(decideFutureWeekDupe_(false, false, false) === "keep", "worker helper: genuine → keep");
}

var missStart = worker.indexOf("async function upsertMissingClientsFromGas_");
var missEnd = worker.indexOf("async function countActiveOrdersForDay_");
var missBody = missStart >= 0 && missEnd > missStart ? worker.slice(missStart, missEnd) : "";
assert(!!missBody, "upsertMissing body present");
var findAny = missBody.indexOf("exists = await findActiveOrderByMatch_");
var afterAny = findAny >= 0 ? missBody.slice(findAny) : "";
assert(afterAny.indexOf("continue;") >= 0, "no INSERT clone after findActiveOrderByMatch_");
assert(
  !/haveIso2[\s\S]{0,160}exists = null/.test(afterAny),
  "must not exists=null then INSERT Future:MK"
);

assert(worker.indexOf("repairFutureWeekDupes") >= 0, "owner repair action");
assert(worker.indexOf("async function repairFutureWeekDupes_") >= 0, "repair helper");
assert(worker.indexOf("no-future-week-clone-h1") >= 0, "deploy marker");
assert(worker.indexOf("preserve-order-price-h1") >= 0, "price preserve marker kept");
assert(worker.indexOf("finishFullWeekProduction") === -1, "worker does not call finishFullWeek");
var delStart = worker.indexOf("async function deleteClient_");
var delBody = delStart >= 0 ? worker.slice(delStart, delStart + 3500) : "";
assert(
  delBody.indexOf("if (!homeRow && !strictDay && !calendarOnly && !day)") >= 0,
  "deleteClient does not pull other week slots via findActiveOrderByMatch when day is set"
);

var matStart = gs.indexOf("function materializeDeliveryDate_");
var matEnd = gs.indexOf("function ensureFutureWeekForDate_");
var mat = matStart >= 0 && matEnd > matStart ? gs.slice(matStart, matEnd) : "";
assert(mat.indexOf("fromCurrentWeek") >= 0, "GAS Future materialize skips current-week people");
assert(mat.indexOf("Будущая неделя") >= 0, "GAS guard scoped to Future sheet");

if (process.exitCode) {
  console.error("test-no-future-week-clone FAILED");
  process.exit(process.exitCode);
}
console.log("test-no-future-week-clone OK");
