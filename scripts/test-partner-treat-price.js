#!/usr/bin/env node
/**
 * Varka treats are a one-off PP RAW26 quote.
 * Coupons / NFC / banner stay 0. Gram cap is gone.
 * Formula stays in computePpFactFromCost_ / calcPricePpD1_ — this file only checks the wiring.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const workerSrc = fs.readFileSync(path.join(root, "boinya-c", "proxy", "worker.js"), "utf8");
const gasSrc = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
const varkaSrc = fs.readFileSync(path.join(root, "varka", "app.html"), "utf8");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function extractFn_(src, name) {
  const start = src.indexOf("function " + name);
  if (start < 0) fail("fn " + name + " not found");
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  fail("could not extract " + name);
}

function extractBetween_(src, startNeedle, endNeedle) {
  const a = src.indexOf(startNeedle);
  const b = src.indexOf(endNeedle, a + startNeedle.length);
  if (a < 0 || b < 0) fail("block not found: " + startNeedle);
  return src.slice(a, b);
}

if (/MAX_ORDER_GRAMS/.test(workerSrc)) fail("Worker still has MAX_ORDER_GRAMS");
if (/MAX_ORDER_GRAMS/.test(gasSrc)) fail("Code.gs still has MAX_ORDER_GRAMS");
if (/MAX_ORDER_GRAMS/.test(varkaSrc)) fail("varka still has MAX_ORDER_GRAMS");
if (/partnerOrderGramsReject_/.test(workerSrc) || /partnerOrderGramsReject_/.test(gasSrc)) {
  fail("gram reject helper must be gone");
}
if (/Бесплатная заявка|бесплатно/.test(varkaSrc)) fail("varka still says the order is free");
if (!/id="orderTotalHint"/.test(varkaSrc)) fail("varka must show the sum under the order");
if (!/action:\s*"partnerCalcPrice"/.test(varkaSrc)) fail("varka must quote via partnerCalcPrice");
if (!/APP_VER = "3\.3\.61"/.test(varkaSrc)) fail("varka version must be 3.3.61");

const headers = extractBetween_(gasSrc, "var PARTNER_ORDER_HEADERS_ = [", "];");
if (!/"totalByn"\s*\]/.test(headers) && !/totalByn"\s*\n\]/.test(headers)) {
  if (!/,\s*"totalByn"/.test(headers)) fail("totalByn must be appended to PARTNER_ORDER_HEADERS_");
}
const headerNames = headers.match(/"([^"]+)"/g).map(function (s) { return s.slice(1, -1); });
if (headerNames[headerNames.length - 1] !== "totalByn") fail("totalByn must be the last Partner_Orders column");
if (headerNames.indexOf("note") !== headerNames.length - 2) fail("note must stay immediately before totalByn");

["vr_t_heart", "vr_t_lung", "Ломтики", "PARTNER_PP_PACK_ZERO_"].forEach(function (bit) {
  if (workerSrc.indexOf(bit) < 0 || gasSrc.indexOf(bit) < 0) fail("missing " + bit);
});

const gasQuote = extractFn_(gasSrc, "partnerQuoteTreatsByn_");
if (!/computePpFactFromCost_\(/.test(gasQuote)) fail("GAS quote must call computePpFactFromCost_");
if (!/"RAW26"/.test(gasQuote) || !/PARTNER_PP_PACK_ZERO_/.test(gasQuote)) {
  fail("GAS quote must be RAW26 with zero packs");
}
if (!/ppBasket,\s*1,/.test(gasQuote)) fail("GAS quote must pass deliveriesN=1");
if (!/clientPrice/.test(gasQuote)) fail("GAS quote must use clientPrice");
const gasCalc = extractFn_(gasSrc, "handleCalcPrice");
if (!/packOptCp/.test(gasCalc)) fail("handleCalcPrice must pass explicit packCounts into the fact");

const workerQuote = extractFn_(workerSrc, "partnerQuoteTreatsByn_");
if (!/calcPricePpD1_\(/.test(workerQuote)) fail("Worker quote must call calcPricePpD1_");
if (!/mode:\s*"pp"/.test(workerQuote)) fail("Worker quote mode must be pp");
if (!/fullFact:\s*"1"/.test(workerQuote)) fail("Worker quote must set fullFact=1");
if (!/scheme:\s*"RAW26"/.test(workerQuote)) fail("Worker quote scheme must be RAW26");
if (!/deliveriesN:\s*1/.test(workerQuote)) fail("Worker quote deliveriesN must be 1");
if (!/packCounts:\s*PARTNER_PP_PACK_ZERO_/.test(workerQuote)) fail("Worker quote must pass zero packs");
if (!/clientPrice/.test(workerQuote)) fail("Worker quote must use clientPrice");

const gasSubmit = extractFn_(gasSrc, "handlePartnerSubmitOrder");
const workerSubmitStart = workerSrc.indexOf('if (/^partnerSubmitOrder$/i.test(a)) {');
const workerSubmit = workerSrc.slice(workerSubmitStart, workerSubmitStart + 8000);
if (gasSubmit.indexOf("partnerQuoteTreatsByn_") < 0) fail("GAS submit must reprice");
if (workerSubmit.indexOf("partnerQuoteTreatsByn_") < 0) fail("Worker submit must reprice");
if (/json\.totalByn|params\.totalByn/.test(gasSubmit + workerSubmit)) {
  fail("submit must not trust a client total");
}
if (gasSubmit.indexOf("order.totalByn") < 0) fail("GAS row must store totalByn");

if (workerSrc.indexOf('a === "partnerCalcPrice"') < 0) fail("partnerCalcPrice must be a read");
if (extractFn_(workerSrc, "isWriteAction_").indexOf('a === "partnerCalcPrice"') < 0) {
  fail("isWriteAction_ must treat partnerCalcPrice as read");
}

const mapSrc =
  extractBetween_(gasSrc, "var PARTNER_TREAT_PP_MAP_", "function partnerMoney_") +
  extractFn_(gasSrc, "partnerTreatsToPpBasket_");
const box = { console: console };
vm.createContext(box);
vm.runInContext(mapSrc, box);
const mixed = box.partnerTreatsToPpBasket_([
  { id: "vr_t_heart", qty: 100, unit: "г" },
  { id: "vr_t_lung", qty: 50 },
  { id: "vr_c_nfc", qty: 1, type: "coupon" },
  { id: "vr_c_banner", qty: 1 },
  { id: "vr_c_piece", qty: 48 }
]);
if (mixed.length !== 2) fail("coupons must stay out of the PP basket, got " + mixed.length);
if (mixed[0].name !== "СЕРДЦЕ" || mixed[0].sub !== "Ломтики" || mixed[0].val !== 100) {
  fail("heart map " + JSON.stringify(mixed[0]));
}
if (mixed[1].name !== "ЛЁГКОЕ" || mixed[1].sub !== "Ломтики" || mixed[1].cat !== "dressura" || mixed[1].val !== 50) {
  fail("lung map " + JSON.stringify(mixed[1]));
}
if (box.partnerTreatsToPpBasket_([{ id: "vr_c_nfc", qty: 2 }]).length !== 0) {
  fail("nfc-only basket must quote as no treats");
}

const workerMap =
  extractBetween_(workerSrc, "const PARTNER_TREAT_PP_MAP_", "function partnerMoney_") +
  extractFn_(workerSrc, "partnerTreatsToPpBasket_");
const boxW = {};
vm.createContext(boxW);
vm.runInContext(workerMap, boxW);
const w = boxW.partnerTreatsToPpBasket_([{ id: "vr_t_heart", qty: 200 }, { id: "vr_c_piece", qty: 96 }]);
if (w.length !== 1 || w[0].name !== "СЕРДЦЕ" || w[0].sub !== "Ломтики" || w[0].val !== 200) {
  fail("worker heart map " + JSON.stringify(w));
}

console.log("OK partner treat price wiring");
