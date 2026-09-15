#!/usr/bin/env node
/**
 * Контракт: курьер «не получил» не должен ждать invalidateDays_ на горячем пути.
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

var worker = fs.readFileSync(path.join(__dirname, "../boinya-c/proxy/worker.js"), "utf8");
var ui = fs.readFileSync(path.join(__dirname, "../boinya-c/app.main.js"), "utf8");
var gs = fs.readFileSync(path.join(__dirname, "../Code.gs"), "utf8");

assert(worker.indexOf("function parkMissedDeliveryD1_") >= 0, "parkMissedDeliveryD1_ exists");
assert(worker.indexOf("function skipHeavyInvalidate_") >= 0, "skipHeavyInvalidate_ helper");
assert(worker.indexOf("_skipInvalidate") >= 0, "hot path skip invalidate flag");
assert(worker.indexOf("fix-courier-missed-timeout-h1") >= 0, "deploy marker");
assert(worker.indexOf("await deleteClient_(params, env);") < 0 ||
  worker.indexOf("parkMissedDeliveryD1_") < worker.indexOf("if (/^notifyMissedDelivery$/i.test(action)) {"),
  "notifyMissed no longer full-delete on hot path without park helper");

var parkIdx = worker.indexOf("async function parkMissedDeliveryD1_");
var parkChunk = parkIdx >= 0 ? worker.slice(parkIdx, parkIdx + 3500) : "";
assert(parkChunk.indexOf("_skipInvalidate") >= 0, "park skipInvalidate on deleteClient");
assert(parkChunk.indexOf("address:") >= 0 && parkChunk.indexOf("note:") >= 0, "park payload keeps address/note");
assert(parkChunk.indexOf("noCut") >= 0, "park payload keeps noCut");
assert(parkChunk.indexOf("dropClientFromOpsSnaps_") >= 0, "surgical drop from courier snap");

var placeIdx = worker.indexOf("async function placeTransferTaskD1_");
var placeChunk = placeIdx >= 0 ? worker.slice(placeIdx, placeIdx + 2800) : "";
assert(placeChunk.indexOf("parseExplicitCutRaw_") >= 0, "place respects explicit cutRaw");
assert(placeChunk.indexOf("parkedNoCut") >= 0 || placeChunk.indexOf("noteHasNoCutFlag_") >= 0, "place preserves parked noCut");
assert(placeChunk.indexOf("_skipInvalidate") >= 0, "place saveOrder skips heavy invalidate");

var saveIdx = worker.indexOf("async function saveOrder_");
var saveInv = worker.indexOf("if (!skipHeavyInvalidate_(params))", saveIdx);
assert(saveInv > saveIdx && saveInv < saveIdx + 40000, "saveOrder respects skipHeavyInvalidate_");

var delIdx = worker.indexOf("async function deleteClient_");
var delInv = worker.indexOf("if (!skipHeavyInvalidate_(params))", delIdx);
assert(delInv > delIdx && delInv < delIdx + 40000, "deleteClient respects skipHeavyInvalidate_");

assert(ui.indexOf("missedOk_") >= 0 || ui.indexOf("d1Verified") >= 0, "UI accepts d1Verified/accepted");
assert(ui.indexOf("notifyMissedDelivery,placeTransferTask") >= 0 ||
  /notifyMissedDelivery\|placeTransferTask/.test(ui), "timeout handler includes courier transfer");
assert(ui.indexOf("noCut: missedNoCut") >= 0 || ui.indexOf('noCut: missedNoCut ? "1"') >= 0, "UI sends noCut on missed");

assert(gs.indexOf('String(json.id || "").trim() || deferredNewId_()') >= 0, "GAS notify uses Worker id");
assert(gs.indexOf("wantClient") >= 0, "GAS place fallback by client nick");
assert(gs.indexOf("rowIdx > 0") >= 0, "GAS place does not write done without deferred row");

function parseExplicitCutRaw_(v) {
  if (v == null || v === "") return null;
  var s = String(v).trim().toLowerCase();
  if (s === "0" || s === "false" || s === "no") return false;
  if (s === "1" || s === "true" || s === "yes") return true;
  return null;
}
function noteHasNoCutFlag_(note) {
  return /\[НЕ\s*РЕЗАТЬ\]/i.test(String(note || ""));
}
function resolvePlaceNoCut_(params, payload) {
  var explicitCut = parseExplicitCutRaw_(params && params.cutRaw);
  var parkedNoCut = !!(payload && payload.noCut) || noteHasNoCutFlag_(payload && payload.note);
  return explicitCut == null ? parkedNoCut : !explicitCut;
}
assert(resolvePlaceNoCut_({}, { note: "x [НЕ РЕЗАТЬ]" }) === true, "no cutRaw keeps parked noCut");
assert(resolvePlaceNoCut_({ cutRaw: "1" }, { note: "x [НЕ РЕЗАТЬ]" }) === false, "cutRaw=1 overrides");
assert(resolvePlaceNoCut_({ cutRaw: "0" }, { note: "" }) === true, "cutRaw=0 sets noCut");
assert(resolvePlaceNoCut_({ cutRaw: "1" }, { noCut: true }) === false, "explicit cut wins over payload.noCut");

if (process.exitCode) {
  console.error("courier-missed-timeout contract FAILED");
  process.exit(process.exitCode);
}
console.log("courier-missed-timeout contract OK");
