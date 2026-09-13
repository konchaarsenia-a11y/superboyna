#!/usr/bin/env node
/**
 * Контракт: непустые address/phone/состав не затираются пустыми
 * при sync/save/resync. Не бьёт live таблицу.
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

function parseBasket_(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      var j = JSON.parse(raw || "[]");
      return Array.isArray(j) ? j : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

function fieldHasSubstance_(v) {
  if (v == null) return false;
  if (Array.isArray(v)) {
    return v.some(function (it) {
      if (!it) return false;
      if (typeof it === "object") return !!(it.name || it.main || it.val || it.value);
      return String(it).trim() !== "";
    });
  }
  var s = String(v).trim();
  if (!s || s === "[]" || s === "{}") return false;
  return true;
}

function basketHasSubstance_(basketOrJson) {
  return fieldHasSubstance_(parseBasket_(basketOrJson));
}

function allowEmptyOverwrite_(params, field) {
  params = params || {};
  if (
    params.explicitClear === true ||
    params.explicitClear === 1 ||
    String(params.explicitClear || "") === "1" ||
    params.allowEmptyOverwrite === true ||
    String(params.allowEmptyOverwrite || "") === "1"
  ) {
    return true;
  }
  var clear = String(params.clearFields || params.clear || "").toLowerCase();
  if (clear) {
    var bits = clear.split(/[,|;]/);
    for (var i = 0; i < bits.length; i++) {
      if (String(bits[i] || "").trim() === String(field || "").toLowerCase()) return true;
    }
  }
  var key = "clear" + String(field || "").charAt(0).toUpperCase() + String(field || "").slice(1);
  if (params[key] === true || params[key] === 1 || String(params[key] || "") === "1") return true;
  return false;
}

function pickNonEmptyField_(incoming, existing, allowEmpty) {
  if (allowEmpty) return incoming != null ? incoming : existing || "";
  if (fieldHasSubstance_(incoming)) return incoming;
  if (fieldHasSubstance_(existing)) return existing;
  return incoming != null ? incoming : existing || "";
}

function clientPayloadSubstance_(c) {
  if (!c) return 0;
  var n = 0;
  if (fieldHasSubstance_(c.address)) n += 2;
  if (fieldHasSubstance_(c.phone)) n += 2;
  if (basketHasSubstance_(c.basket || c.basket_json)) n += 4;
  if (fieldHasSubstance_(c.note)) n += 1;
  if (fieldHasSubstance_(c.segment || c.source || c.orderType)) n += 1;
  return n;
}

function mergeKeepNonEmptyClient_(incoming, existing, params) {
  incoming = incoming || {};
  existing = existing || {};
  var out = Object.assign({}, existing, incoming);
  out.address = String(
    pickNonEmptyField_(incoming.address, existing.address, allowEmptyOverwrite_(params, "address")) || ""
  );
  out.phone = String(
    pickNonEmptyField_(incoming.phone, existing.phone, allowEmptyOverwrite_(params, "phone")) || ""
  );
  out.note = String(
    pickNonEmptyField_(incoming.note, existing.note, allowEmptyOverwrite_(params, "note")) || ""
  );
  var inB = incoming.basket != null ? incoming.basket : incoming.basket_json;
  var exB = existing.basket != null ? existing.basket : existing.basket_json;
  if (basketHasSubstance_(inB) || allowEmptyOverwrite_(params, "basket") || !basketHasSubstance_(exB)) {
    out.basket = parseBasket_(inB);
  } else {
    out.basket = parseBasket_(exB);
  }
  out.basket_json = JSON.stringify(out.basket || []);
  if (!String(incoming.segment || incoming.orderType || incoming.source || "").trim() &&
      String(existing.segment || existing.orderType || existing.source || "").trim()) {
    out.segment = existing.segment || existing.orderType || "";
    if (!out.source && existing.source) out.source = existing.source;
  }
  return out;
}

function decideDedupeWeekRows_(slotRow, calRow) {
  if (!slotRow && calRow) return { action: "reattach_calendar", drop: "" };
  if (slotRow && !calRow) return { action: "keep_slot", drop: "" };
  if (!slotRow && !calRow) return { action: "skip", drop: "" };
  var slotN = clientPayloadSubstance_(slotRow);
  var calN = clientPayloadSubstance_(calRow);
  if (calN > slotN) {
    return { action: "promote_calendar", drop: "slot_stub", slotN: slotN, calN: calN };
  }
  return { action: "merge_into_slot", drop: "calendar", slotN: slotN, calN: calN };
}

var full = {
  address: "Победителей 1",
  phone: "+375291112233",
  note: "домофон 12",
  basket: [{ name: "АОРТА", sub: "Обычная", val: 0.3 }],
  segment: "ПП"
};
var empty = { address: "", phone: "", note: "", basket: [], segment: "" };

assert(fieldHasSubstance_("Победителей 1"), "address has substance");
assert(!fieldHasSubstance_(""), "empty string no substance");
assert(!fieldHasSubstance_("[]"), "[] string no substance");
assert(basketHasSubstance_(full.basket), "basket has substance");
assert(!basketHasSubstance_([]), "empty basket no substance");
assert(!basketHasSubstance_("[]"), "empty json basket no substance");

var kept = mergeKeepNonEmptyClient_(empty, full, {});
assert(kept.address === full.address, "empty incoming keeps address");
assert(kept.phone === full.phone, "empty incoming keeps phone");
assert(kept.basket.length === 1 && kept.basket[0].name === "АОРТА", "empty incoming keeps basket");
assert(kept.note === full.note, "empty incoming keeps note");

var newer = mergeKeepNonEmptyClient_(
  { address: "Немига 5", phone: "", basket: [{ name: "ЛЁГКОЕ", val: 0.2 }] },
  full,
  {}
);
assert(newer.address === "Немига 5", "non-empty incoming address wins");
assert(newer.phone === full.phone, "empty incoming phone keeps old");
assert(newer.basket[0].name === "ЛЁГКОЕ", "non-empty incoming basket wins");

var cleared = mergeKeepNonEmptyClient_(empty, full, { explicitClear: "1" });
assert(cleared.address === "" && cleared.phone === "" && cleared.basket.length === 0, "explicitClear allows empty");

var onlyAddr = mergeKeepNonEmptyClient_({ address: "" }, full, { clearAddress: "1" });
assert(onlyAddr.address === "", "clearAddress empties address");
assert(onlyAddr.phone === full.phone, "clearAddress keeps phone");
assert(onlyAddr.basket.length === 1, "clearAddress keeps basket");

assert(clientPayloadSubstance_(full) > clientPayloadSubstance_(empty), "full scores higher than empty");

var snowySlot = {
  id: "Понедельник:snowygodness",
  day_name: "Понедельник",
  date_iso: "2026-09-14",
  client: "snowygodness",
  address: "",
  phone: "",
  note: "",
  basket: [],
  segment: ""
};
var snowyCal = {
  id: "cal:2026-09-14:snowygodness",
  day_name: "",
  date_iso: "2026-09-14",
  client: "snowygodness",
  address: "Калиновского 12",
  phone: "+375291112233",
  note: "",
  basket: [{ name: "АОРТА", sub: "Обычная", val: 0.4 }],
  segment: "ПП"
};
var snowyPlan = decideDedupeWeekRows_(snowySlot, snowyCal);
assert(snowyPlan.action === "promote_calendar", "snowygodness: empty Mon slot + full cal → promote calendar");
assert(snowyPlan.drop === "slot_stub", "snowygodness: drop empty slot stub, not the full calendar");
assert(decideDedupeWeekRows_(full, empty).action === "merge_into_slot", "full slot + empty cal → merge into slot");
assert(decideDedupeWeekRows_(full, empty).drop === "calendar", "full slot + empty cal → drop calendar only");
var mergedStub = mergeKeepNonEmptyClient_(empty, snowyCal, {});
assert(mergedStub.address === snowyCal.address && mergedStub.basket.length === 1, "empty stub cannot wipe snowygodness payload");

var workerPath = path.join(__dirname, "../boinya-c/proxy/worker.js");
var gsPath = path.join(__dirname, "../Code.gs");
var uiPath = path.join(__dirname, "../boinya-c/app.main.js");
var worker = fs.readFileSync(workerPath, "utf8");
var gs = fs.readFileSync(gsPath, "utf8");
var ui = fs.readFileSync(uiPath, "utf8");

assert(worker.indexOf("function mergeKeepNonEmptyClient_") >= 0, "worker has mergeKeepNonEmptyClient_");
assert(worker.indexOf("function mergeOrderRowsKeepNonEmpty_") >= 0, "worker has mergeOrderRowsKeepNonEmpty_");
assert(worker.indexOf("skipKeepNonEmpty") >= 0 || worker.indexOf("mergeOrderRowsKeepNonEmpty_") >= 0, "upsert uses keep-non-empty");
assert(worker.indexOf("repairWipedClientFields") >= 0, "repair action present");
assert(worker.indexOf("snowygodness-dedupe-h1") >= 0, "deploy marker");
assert(worker.indexOf("function decideDedupeWeekRows_") >= 0, "worker has decideDedupeWeekRows_");
assert(worker.indexOf("function applyDedupeWeekSlot_") >= 0, "worker applyDedupeWeekSlot_");
assert(worker.indexOf("promote_calendar") >= 0, "dedupe can promote full calendar");
assert(worker.indexOf("merge_weaker_than_cal") >= 0, "refuse delete if merge weaker than calendar");
assert(worker.indexOf("mergeKeepNonEmptyClient_(gasC") >= 0 || worker.indexOf("mergeKeepNonEmptyClient_(gasC,") >= 0, "resync merges GAS over D1");

assert(gs.indexOf("keepNonEmptySheetField_") >= 0 || gs.indexOf("incomingBasketHasItems") >= 0, "GAS keep-non-empty / skip empty clear");
assert(ui.indexOf("repairWipedClientFields") >= 0, "UI calls repair after resync");

console.log(process.exitCode ? "FAILED" : "all empty-overwrite contract checks passed");
