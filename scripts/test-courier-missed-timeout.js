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
assert(
  worker.indexOf("heal-flamant-transfer-h1") >= 0 ||
    worker.indexOf("tz-p0-crumbs-h1") >= 0,
  "deploy marker heal-flamant"
);
assert(worker.indexOf("function stampDeferredSheetId_") >= 0, "stamp GAS df_* onto D1 sheetId");
assert(worker.indexOf("function enrichTransferPayloadFromOrders_") >= 0, "enrich thin transfer from orders");
assert(worker.indexOf("function healStuckTransfers_") >= 0, "owner healStuckTransfers");
assert(worker.indexOf("payload.sheetId") >= 0 || worker.indexOf("p.sheetId") >= 0, "sheetId alias on payload");
assert(worker.indexOf("не ходим в GAS getTransferTask") >= 0, "getTransferTask does not hang on GAS");
assert(worker.indexOf("placed: false") >= 0, "heal does not auto-place");
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
var placeEnd = worker.indexOf("\nasync function delSnap_", placeIdx);
var placeChunk = placeIdx >= 0 ? worker.slice(placeIdx, placeEnd > placeIdx ? placeEnd : placeIdx + 8000) : "";
assert(placeChunk.indexOf("parseExplicitCutRaw_") >= 0, "place respects explicit cutRaw");
assert(placeChunk.indexOf("parkedNoCut") >= 0 || placeChunk.indexOf("noteHasNoCutFlag_") >= 0, "place preserves parked noCut");
assert(placeChunk.indexOf("relocateTransferDelivery_") >= 0, "place relocates one delivery");
assert(placeChunk.indexOf("_skipInvalidate") >= 0, "place skips heavy invalidate");
assert(placeChunk.indexOf("saveOrder_(") < 0, "place does not sweep other days via saveOrder_");
var repIdx = worker.indexOf("async function repairParkedTransfersFromOrders_");
var repEnd = worker.indexOf("\nfunction stripRepairedTransfers_", repIdx);
var repBody = repIdx >= 0 ? worker.slice(repIdx, repEnd > repIdx ? repEnd : repIdx + 2000) : "";
assert(repBody.indexOf("autoClosedActive") < 0, "repair does not auto-close open transfers");
assert(worker.indexOf("function transferItemPlaceable_") >= 0, "false auto-close still placeable");
assert(worker.indexOf("function transferSourceIdsToDelete_") >= 0, "only source id is deleted");
assert(worker.indexOf("function transferPlaceMetaJson_") >= 0, "place copies source meta prices");

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
assert(gs.indexOf("payload.d1Id") >= 0 || gs.indexOf("d1Id: /^xfer_/") >= 0, "GAS notify stores d1Id");
assert(gs.indexOf("includeWeekCounts") >= 0, "GAS getTransferTask skips week counts by default");

assert(ui.indexOf("client: clientName") >= 0, "UI place sends client nick");

function deferredItemIdAliases_(it) {
  var ids = [];
  function push(v) {
    var s = String(v || "").trim();
    if (s && ids.indexOf(s) < 0) ids.push(s);
  }
  push(it && it.id);
  var p = (it && it.payload) || {};
  push(p.sheetId);
  push(p.gasId);
  push(p.d1Id);
  return ids;
}
assert(
  deferredItemIdAliases_({ id: "xfer_1", payload: { sheetId: "df_2" } }).indexOf("df_2") >= 0,
  "find by sheetId alias"
);
assert(
  deferredItemIdAliases_({ id: "xfer_1", payload: { sheetId: "df_2" } }).indexOf("xfer_1") >= 0,
  "find by D1 id"
);

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

function transferItemPlaceable_(it) {
  if (!it) return false;
  var st = String(it.status || "open").toLowerCase();
  if (!st || st === "open") return true;
  if (it.autoClosedActive && !it.placed) return true;
  return false;
}
assert(transferItemPlaceable_({ status: "open" }) === true, "open transfer is placeable");
assert(
  transferItemPlaceable_({ status: "done", autoClosedActive: true, placed: false }) === true,
  "false auto-close is still placeable"
);
assert(transferItemPlaceable_({ status: "done", placed: true }) === false, "really placed stays closed");

function transferSourceIdsToDelete_(sourceId, targetId) {
  var s = String(sourceId || "").trim();
  var t = String(targetId || "").trim();
  if (!s || s === t) return [];
  return [s];
}
assert(
  transferSourceIdsToDelete_("Понедельник:ZZZ", "Вторник:ZZZ").join() === "Понедельник:ZZZ",
  "delete only the source delivery id"
);
assert(transferSourceIdsToDelete_("Вторник:ZZZ", "Вторник:ZZZ").length === 0, "same slot id is not deleted");
assert(transferSourceIdsToDelete_("CAL:ZZZ:2026-09-20", "Среда:ZZZ").indexOf("CAL:ZZZ:2026-09-30") < 0, "other calendar row is not in the delete list");

function transferPlaceMetaJson_(existingRaw, patch) {
  var ex = {};
  var inc = patch || {};
  try { ex = JSON.parse(existingRaw || "{}"); } catch (e) { ex = {}; }
  var out = {};
  var k;
  for (k in ex) if (Object.prototype.hasOwnProperty.call(ex, k)) out[k] = ex[k];
  for (k in inc) if (Object.prototype.hasOwnProperty.call(inc, k)) out[k] = inc[k];
  ["orderPrice", "statedCost", "factCost", "clientPrice"].forEach(function (key) {
    var incomingEmpty = inc[key] == null || inc[key] === "";
    var existingHas = ex[key] != null && ex[key] !== "";
    if (incomingEmpty && existingHas) out[key] = ex[key];
  });
  return out;
}
var kept = transferPlaceMetaJson_('{"orderPrice":42,"statedCost":10,"factCost":7}', { noCut: true });
assert(kept.orderPrice === 42 && kept.statedCost === 10 && kept.factCost === 7, "relocate keeps source prices");
assert(kept.noCut === true, "relocate still applies noCut patch");

if (process.exitCode) {
  console.error("courier-missed-timeout contract FAILED");
  process.exit(process.exitCode);
}
console.log("courier-missed-timeout contract OK");
