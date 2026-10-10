#!/usr/bin/env node
/**
 * Varka treats are a one-off PP RAW26 quote with PARTNER_VARKA_COEF = 2.2.
 * Subscription stays on PP_RAW26_COEF_DEFAULT_ = 2.6.
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
if (!/APP_VER = "3\.3\.63"/.test(varkaSrc)) fail("varka version must be 3.3.63");
if (!/Минимальный заказ — 200 г\. Система автоматически даёт скидку за объём: чем больше заказ, тем больше скидка и тем дешевле выходит каждые 100 г\./.test(varkaSrc)) {
  fail("varka must show the volume discount note");
}
if (!/Лакомства — /.test(varkaSrc) || !/Доставка — /.test(varkaSrc) || !/Итого — /.test(varkaSrc)) {
  fail("varka must split treats, delivery and total");
}
if (!/Минимум 200 г/.test(varkaSrc)) fail("varka submit button must explain the 200 g minimum");
if (!/treatOrderShort_/.test(varkaSrc)) fail("varka must block a short treat order");

const headers = extractBetween_(gasSrc, "var PARTNER_ORDER_HEADERS_ = [", "];");
if (!/"totalByn"\s*\]/.test(headers) && !/totalByn"\s*\n\]/.test(headers)) {
  if (!/,\s*"totalByn"/.test(headers)) fail("totalByn must be appended to PARTNER_ORDER_HEADERS_");
}
const headerNames = headers.match(/"([^"]+)"/g).map(function (s) { return s.slice(1, -1); });
if (headerNames[headerNames.length - 1] !== "totalByn") fail("totalByn must be the last Partner_Orders column");
if (headerNames.indexOf("note") !== headerNames.length - 2) fail("note must stay immediately before totalByn");

["vr_t_heart", "vr_t_lung", "Ломтики", "PARTNER_PP_PACK_ZERO_", "PARTNER_VARKA_COEF"].forEach(function (bit) {
  if (workerSrc.indexOf(bit) < 0 || gasSrc.indexOf(bit) < 0) fail("missing " + bit);
});
if (!/var PARTNER_VARKA_COEF = 2\.2;/.test(gasSrc)) fail("GAS PARTNER_VARKA_COEF must be 2.2");
if (!/const PARTNER_VARKA_COEF = 2\.2;/.test(workerSrc)) fail("Worker PARTNER_VARKA_COEF must be 2.2");
if (!/var PP_RAW26_COEF_DEFAULT_ = 2\.6;/.test(gasSrc)) fail("subscription coef must stay 2.6");
if (!/const PP_RAW26_COEF_DEFAULT_D1_ = 2\.6;/.test(workerSrc)) fail("D1 subscription coef must stay 2.6");
if (!/var PP_RAW26_RECOVER_100_ = 3\.30;/.test(gasSrc)) fail("subscription recover must stay 3.30");
if (!/var PP_RAW26_RECOVER_PIECE_ = 0\.80;/.test(gasSrc)) fail("subscription piece recover must stay 0.80");
if (!/var PP_RAW26_DELIVERY_PER_ = 7\.60;/.test(gasSrc)) fail("subscription delivery must stay 7.60");
if (!/const PP_RAW26_RECOVER_100_D1_ = 3\.3;/.test(workerSrc)) fail("D1 recover must stay 3.3");
if (!/const PP_RAW26_DELIVERY_PER_D1_ = 7\.6;/.test(workerSrc)) fail("D1 delivery must stay 7.6");
if (!/var PARTNER_VARKA_DELIVERY_BYN = 4;/.test(gasSrc)) fail("GAS Varka delivery must be 4");
if (!/const PARTNER_VARKA_DELIVERY_BYN = 4;/.test(workerSrc)) fail("Worker Varka delivery must be 4");
if (!/var PARTNER_VARKA_MIN_TREAT_GRAMS = 200;/.test(gasSrc)) fail("GAS min treat grams must be 200");
if (!/const PARTNER_VARKA_MIN_TREAT_GRAMS = 200;/.test(workerSrc)) fail("Worker min treat grams must be 200");

const gasQuote = extractFn_(gasSrc, "partnerQuoteTreatsByn_");
if (!/computePpFactFromCost_\(/.test(gasQuote)) fail("GAS quote must call computePpFactFromCost_");
if (!/"RAW26"/.test(gasQuote) || !/PARTNER_PP_PACK_ZERO_/.test(gasQuote)) {
  fail("GAS quote must be RAW26 with zero packs");
}
if (!/ppBasket,\s*1,\s*PARTNER_VARKA_COEF,/.test(gasQuote)) {
  fail("GAS quote must pass PARTNER_VARKA_COEF as coef");
}
if (/PP_RAW26_COEF_DEFAULT_/.test(gasQuote)) fail("GAS quote must not use the subscription coef");
if (!/clientDisplayPrice/.test(gasQuote)) fail("GAS quote must use the ruble client price");
if (!/partnerApplyVarkaDelivery_\(/.test(gasQuote)) fail("GAS quote must apply Varka delivery");
if (!/treatsByn: split\.treatsByn/.test(gasQuote)) fail("GAS quote must return treatsByn");
const gasCalc = extractFn_(gasSrc, "handleCalcPrice");
if (!/packOptCp/.test(gasCalc)) fail("handleCalcPrice must pass explicit packCounts into the fact");

const workerQuote = extractFn_(workerSrc, "partnerQuoteTreatsByn_");
if (!/calcPricePpD1_\(/.test(workerQuote)) fail("Worker quote must call calcPricePpD1_");
if (!/mode:\s*"pp"/.test(workerQuote)) fail("Worker quote mode must be pp");
if (!/fullFact:\s*"1"/.test(workerQuote)) fail("Worker quote must set fullFact=1");
if (!/scheme:\s*"RAW26"/.test(workerQuote)) fail("Worker quote scheme must be RAW26");
if (!/deliveriesN:\s*1/.test(workerQuote)) fail("Worker quote deliveriesN must be 1");
if (!/coef:\s*PARTNER_VARKA_COEF/.test(workerQuote)) fail("Worker quote must pass coef PARTNER_VARKA_COEF");
if (/PP_RAW26_COEF_DEFAULT_D1_/.test(workerQuote)) fail("Worker quote must not use the subscription coef");
if (!/packCounts:\s*PARTNER_PP_PACK_ZERO_/.test(workerQuote)) fail("Worker quote must pass zero packs");
if (!/clientDisplayPrice/.test(workerQuote)) fail("Worker quote must use the ruble client price");
if (!/partnerApplyVarkaDelivery_\(/.test(workerQuote)) fail("Worker quote must apply Varka delivery");
if (!/treatsByn: split\.treatsByn/.test(workerQuote)) fail("Worker quote must return treatsByn");

const gasSubmit = extractFn_(gasSrc, "handlePartnerSubmitOrder");
const workerSubmitStart = workerSrc.indexOf('if (/^partnerSubmitOrder$/i.test(a)) {');
const workerSubmit = workerSrc.slice(workerSubmitStart, workerSubmitStart + 8000);
if (gasSubmit.indexOf("partnerQuoteTreatsByn_") < 0) fail("GAS submit must reprice");
if (workerSubmit.indexOf("partnerQuoteTreatsByn_") < 0) fail("Worker submit must reprice");
if (gasSubmit.indexOf("partnerMinTreatReject_") < 0) fail("GAS submit must enforce the 200 g minimum");
if (workerSubmit.indexOf("partnerMinTreatReject_") < 0) fail("Worker submit must enforce the 200 g minimum");
if (/json\.totalByn|params\.totalByn/.test(gasSubmit + workerSubmit)) {
  fail("submit must not trust a client total");
}
if (gasSubmit.indexOf("order.totalByn") < 0) fail("GAS row must store totalByn");

if (workerSrc.indexOf('a === "partnerCalcPrice"') < 0) fail("partnerCalcPrice must be a read");
if (extractFn_(workerSrc, "isWriteAction_").indexOf('a === "partnerCalcPrice"') < 0) {
  fail("isWriteAction_ must treat partnerCalcPrice as read");
}
const workerPriceAction = workerSrc.slice(
  workerSrc.indexOf("if (/^partnerCalcPrice$/i.test(a)) {"),
  workerSrc.indexOf("if (/^partnerCalcPrice$/i.test(a)) {") + 900
);
if (workerPriceAction.indexOf("partnerQuoteTreatsByn_") < 0) {
  fail("partnerCalcPrice must quote through partnerQuoteTreatsByn_");
}
if (/calcPricePpD1_|PP_RAW26_COEF_DEFAULT_/.test(workerPriceAction)) {
  fail("partnerCalcPrice must not price with the subscription coef itself");
}
const gasPriceAction = extractFn_(gasSrc, "handlePartnerCalcPrice");
if (gasPriceAction.indexOf("partnerQuoteTreatsByn_") < 0) {
  fail("GAS partnerCalcPrice must quote through partnerQuoteTreatsByn_");
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

const minLine = (gasSrc.match(/var PARTNER_VARKA_MIN_TREAT_GRAMS = \d+;/) || [])[0];
if (!minLine) fail("min grams constant line missing");
const gramSrc =
  extractBetween_(gasSrc, "var PARTNER_TREAT_PP_MAP_", "function partnerMoney_") +
  minLine + "\n" +
  extractFn_(gasSrc, "partnerTreatGrams_") +
  "\n" +
  extractFn_(gasSrc, "partnerMinTreatReject_");
const boxG = {};
vm.createContext(boxG);
vm.runInContext(gramSrc, boxG);
if (boxG.partnerTreatGrams_([
  { id: "vr_t_heart", qty: 100 },
  { id: "vr_c_nfc", qty: 2 },
  { id: "vr_c_banner", qty: 1 }
]) !== 100) fail("nfc and banner must not add grams");
const short = boxG.partnerMinTreatReject_([{ id: "vr_t_lung", qty: 150 }]);
if (!short || short.message !== "min_treat_grams" || short.grams !== 150) fail("150 g must be rejected");
if (boxG.partnerMinTreatReject_([{ id: "vr_t_heart", qty: 200 }])) fail("200 g must pass");
if (boxG.partnerMinTreatReject_([{ id: "vr_t_heart", qty: 100 }, { id: "vr_t_lung", qty: 100 }])) {
  fail("100+100 must pass");
}
if (boxG.partnerMinTreatReject_([{ id: "vr_c_nfc", qty: 1 }, { id: "vr_c_banner", qty: 1 }])) {
  fail("nfc and banner without treats must pass");
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
