#!/usr/bin/env node
/**
 * Контракт: repair/reattach/move не затирают orderPrice в meta_json.
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

function parseMeta_(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
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

var ORDER_PRICE_META_KEYS_ = [
  "orderPrice",
  "statedCost",
  "factCost",
  "clientPrice",
  "couponPrice",
  "cost",
  "price",
  "total",
  "subTotal",
  "statedTouched"
];

function priceFieldHasValue_(v) {
  if (v == null || v === "") return false;
  if (typeof v === "number") return isFinite(v);
  var s = String(v).trim();
  if (!s || s === "null" || s === "undefined" || s === "[]" || s === "{}") return false;
  return true;
}

function mergeMetaJsonKeepPrices_(existingRaw, incomingRaw, params) {
  var ex = parseMeta_(existingRaw);
  var inc = parseMeta_(incomingRaw);
  var out = Object.assign({}, ex, inc);
  var keys = ORDER_PRICE_META_KEYS_;
  var allowAll = allowEmptyOverwrite_(params, "price");
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (allowAll || allowEmptyOverwrite_(params, k)) continue;
    if (!priceFieldHasValue_(inc[k]) && inc[k] !== 0 && priceFieldHasValue_(ex[k])) {
      out[k] = ex[k];
    } else if (!priceFieldHasValue_(inc[k]) && inc[k] !== 0 && ex[k] === 0) {
      out[k] = 0;
    }
  }
  return JSON.stringify(out);
}

var kept = JSON.parse(mergeMetaJsonKeepPrices_('{"orderPrice":88,"statedCost":90}', "{}", {}));
assert(kept.orderPrice === 88, "empty incoming meta keeps orderPrice");
assert(kept.statedCost === 90, "empty incoming meta keeps statedCost");

var zeroKept = JSON.parse(mergeMetaJsonKeepPrices_('{"orderPrice":0}', '{"ppSlot":"1"}', {}));
assert(zeroKept.orderPrice === 0, "orderPrice 0 is kept (BP)");

var incomingWins = JSON.parse(
  mergeMetaJsonKeepPrices_('{"orderPrice":88}', '{"orderPrice":114}', {})
);
assert(incomingWins.orderPrice === 114, "non-empty incoming orderPrice wins");

var factKept = JSON.parse(
  mergeMetaJsonKeepPrices_('{"factCost":72.3,"orderPrice":80}', '{"orderPrice":""}', {})
);
assert(factKept.factCost === 72.3, "empty incoming keeps factCost");
assert(factKept.orderPrice === 80, "empty string incoming keeps orderPrice");

var cleared = JSON.parse(
  mergeMetaJsonKeepPrices_('{"orderPrice":88}', '{"orderPrice":""}', { explicitClear: "1" })
);
assert(!priceFieldHasValue_(cleared.orderPrice), "explicitClear allows empty price");

var workerPath = path.join(__dirname, "../boinya-c/proxy/worker.js");
var worker = fs.readFileSync(workerPath, "utf8");

assert(worker.indexOf("function mergeMetaJsonKeepPrices_") >= 0, "worker has mergeMetaJsonKeepPrices_");
assert(worker.indexOf("function orderMetaJsonFromClient_") >= 0, "worker has orderMetaJsonFromClient_");
assert(worker.indexOf("function repairMissingOrderPrices_") >= 0, "worker has repair helper");
assert(worker.indexOf("repairMissingOrderPrices") >= 0, "repair action present");
assert(worker.indexOf("preserve-order-price-h1") >= 0, "deploy marker");
assert(worker.indexOf('meta_json: "{}"') < 0, "no upsert writes empty meta_json literal");
assert(worker.indexOf("never touch meta_json") >= 0, "restore date UPDATE documents keep-price");
assert(
  worker.indexOf("meta_json: orderMetaJsonFromClient_") >= 0,
  "reattach/upsertMissing copy prices from client"
);
assert(
  worker.indexOf("mergeMetaJsonKeepPrices_(\n      existing.meta_json") >= 0 ||
    worker.indexOf("mergeMetaJsonKeepPrices_(existing.meta_json") >= 0 ||
    /mergeMetaJsonKeepPrices_\(\s*existing\.meta_json/.test(worker),
  "row merge keeps existing meta prices"
);

var extracted = worker.match(/function mergeMetaJsonKeepPrices_\([\s\S]*?\n\}/);
assert(!!extracted, "extract mergeMetaJsonKeepPrices_ from worker");
if (extracted) {
  var priceFieldSrc = worker.match(/function priceFieldHasValue_\([\s\S]*?\n\}/);
  var parseSrc = worker.match(/function parseMeta_\([\s\S]*?\n\}/);
  var allowSrc = worker.match(/function allowEmptyOverwrite_\([\s\S]*?\n\}/);
  /* eslint-disable no-eval */
  eval(
    "var ORDER_PRICE_META_KEYS_ = " +
      JSON.stringify(ORDER_PRICE_META_KEYS_) +
      ";\n" +
      (parseSrc ? parseSrc[0] : "") +
      "\n" +
      (allowSrc ? allowSrc[0] : "") +
      "\n" +
      (priceFieldSrc ? priceFieldSrc[0] : "") +
      "\n" +
      extracted[0]
  );
  var live = JSON.parse(mergeMetaJsonKeepPrices_('{"orderPrice":70,"factCost":65}', "{}", {}));
  assert(live.orderPrice === 70 && live.factCost === 65, "worker helper: {} does not wipe prices");
}

console.log(process.exitCode ? "FAILED" : "all preserve-order-price contract checks passed");
