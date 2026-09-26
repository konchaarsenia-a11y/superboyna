#!/usr/bin/env node
/**
 * Partner order gram cap: MAX_ORDER_GRAMS = 200 for every point.
 * Weight lines sum by qty (already grams). Piece lines (coupon/NFC/banner) do not count.
 * No шт→г conversion. Client unit cannot override the catalog.
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

function extractConstAssign_(src, name) {
  const needle = "const " + name + " =";
  const start = src.indexOf(needle);
  if (start < 0) fail("const " + name + " not found");
  let i = start + needle.length;
  while (i < src.length && /\s/.test(src[i])) i++;
  const open = src[i];
  if (open !== "[" && open !== "{") {
    const semi = src.indexOf(";", i);
    if (semi < 0) fail("const " + name + " has no terminator");
    return src.slice(start, semi + 1);
  }
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) {
      depth--;
      if (depth === 0) {
        const semi = src.indexOf(";", i);
        return src.slice(start, (semi >= 0 ? semi : i) + 1);
      }
    }
  }
  fail("const " + name + " unclosed");
}

if (!/const MAX_ORDER_GRAMS = 200;/.test(workerSrc)) fail("Worker MAX_ORDER_GRAMS must be 200");
if (!/var MAX_ORDER_GRAMS = 200;/.test(gasSrc)) fail("Code.gs MAX_ORDER_GRAMS must be 200");
if (!/var MAX_ORDER_GRAMS = 200;/.test(varkaSrc)) fail("varka MAX_ORDER_GRAMS must be 200");
if ((workerSrc.match(/MAX_ORDER_GRAMS\s*=/g) || []).length !== 1) {
  fail("Worker must define MAX_ORDER_GRAMS once");
}
if ((gasSrc.match(/MAX_ORDER_GRAMS\s*=/g) || []).length !== 1) {
  fail("Code.gs must define MAX_ORDER_GRAMS once");
}

const workerBox = {};
vm.createContext(workerBox);
vm.runInContext(
  [
    extractConstAssign_(workerSrc, "PARTNER_CATALOG_STATIC"),
    extractConstAssign_(workerSrc, "MAX_ORDER_GRAMS"),
    extractFn_(workerSrc, "partnerCatalogById_"),
    extractFn_(workerSrc, "partnerResolveLineMeta_"),
    extractFn_(workerSrc, "partnerLineWeightGrams_"),
    extractFn_(workerSrc, "partnerOrderWeightGrams_"),
    extractFn_(workerSrc, "partnerOrderGramsReject_")
  ].join("\n"),
  workerBox
);

const gasBox = {};
vm.createContext(gasBox);
vm.runInContext(
  [
    "var MAX_ORDER_GRAMS = 200;",
    extractFn_(gasSrc, "partnerCatalogStatic_"),
    extractFn_(gasSrc, "partnerCatalogById_"),
    extractFn_(gasSrc, "partnerResolveLineMeta_"),
    extractFn_(gasSrc, "partnerLineWeightGrams_"),
    extractFn_(gasSrc, "partnerOrderWeightGrams_"),
    extractFn_(gasSrc, "partnerOrderGramsReject_")
  ].join("\n"),
  gasBox
);

function expectOk_(box, label, basket, grams) {
  const got = box.partnerOrderWeightGrams_(basket);
  if (got !== grams) fail(label + " grams " + got + " !== " + grams);
  const rej = box.partnerOrderGramsReject_(basket);
  if (rej) fail(label + " must be accepted, got " + JSON.stringify(rej));
}

function expectOver_(box, label, basket, grams) {
  const got = box.partnerOrderWeightGrams_(basket);
  if (got !== grams) fail(label + " grams " + got + " !== " + grams);
  const rej = box.partnerOrderGramsReject_(basket);
  if (!rej || rej.status !== "error" || rej.code !== "max_order_grams") {
    fail(label + " must reject max_order_grams, got " + JSON.stringify(rej));
  }
  if (rej.message !== "Максимум 200 г на один заказ") fail(label + " message: " + rej.message);
  if (rej.maxGrams !== 200 || rej.grams !== grams) fail(label + " payload grams");
}

const cases = [
  function (box) {
    expectOk_(box, "100+100", [
      { id: "vr_t_heart", qty: 100, unit: "г" },
      { id: "vr_t_lung", qty: 100, unit: "г" }
    ], 200);
  },
  function (box) {
    expectOver_(box, "150+100", [
      { id: "vr_t_heart", qty: 150, unit: "г" },
      { id: "vr_t_lung", qty: 100, unit: "г" }
    ], 250);
  },
  function (box) {
    expectOver_(box, "250 alone", [{ id: "vr_t_heart", qty: 250, unit: "г" }], 250);
  },
  function (box) {
    expectOk_(box, "200 + pieces", [
      { id: "vr_t_lung", qty: 200, unit: "г" },
      { id: "vr_c_piece", qty: 120, unit: "шт" },
      { id: "vr_c_nfc", qty: 2, unit: "шт" },
      { id: "vr_c_banner", qty: 1, unit: "шт" }
    ], 200);
  },
  function (box) {
    expectOk_(box, "pieces only", [
      { id: "vr_c_piece", qty: 500, unit: "шт" },
      { id: "vr_c_nfc", qty: 2, unit: "шт" },
      { id: "vr_c_banner", qty: 1, unit: "шт" }
    ], 0);
  },
  function (box) {
    expectOver_(box, "spoof treat as pieces", [
      { id: "vr_t_heart", type: "coupon", qty: 250, unit: "шт" }
    ], 250);
  },
  function (box) {
    expectOk_(box, "spoof coupon as grams", [
      { id: "vr_c_piece", type: "treat", qty: 500, unit: "г" },
      { id: "vr_t_heart", qty: 50, unit: "г" }
    ], 50);
  },
  function (box) {
    expectOver_(box, "two heart lines", [
      { id: "vr_t_heart", qty: 150, unit: "г" },
      { id: "vr_t_heart", qty: 100, unit: "г" }
    ], 250);
  },
  function (box) {
    expectOver_(box, "201", [{ id: "vr_t_lung", qty: 201, unit: "г", type: "treat" }], 201);
  },
  function (box) {
    expectOk_(box, "unknown pieces", [{ id: "custom_piece", qty: 999, unit: "шт", type: "coupon" }], 0);
  },
  function (box) {
    expectOver_(box, "unknown grams", [{ id: "custom_gram", qty: 220, unit: "г" }], 220);
  }
];

["worker", "gas"].forEach(function (name) {
  const box = name === "worker" ? workerBox : gasBox;
  cases.forEach(function (fn) { fn(box); });
});

const submitStart = workerSrc.indexOf("if (/^partnerSubmitOrder$/i.test(a)) {");
const submitEnd = workerSrc.indexOf("if (/^partnerSetOrderStatus$/i.test(a))", submitStart);
if (submitStart < 0 || submitEnd < 0) fail("partnerSubmitOrder block not found");
const submitSlice = workerSrc.slice(submitStart, submitEnd);
const rejAt = submitSlice.indexOf("partnerOrderGramsReject_");
const snapAt = submitSlice.indexOf("putSnap_(");
if (rejAt < 0 || snapAt < 0 || rejAt > snapAt) {
  fail("Worker must reject overweight basket before putSnap_");
}

const gasFn = extractFn_(gasSrc, "handlePartnerSubmitOrder");
const gasRej = gasFn.indexOf("partnerOrderGramsReject_");
const gasWrite = gasFn.indexOf("appendRow(");
if (gasRej < 0 || gasWrite < 0 || gasRej > gasWrite) {
  fail("GAS must reject overweight basket before appendRow");
}

const partnerBlockStart = workerSrc.indexOf("Varka Partner_* — D1/snap правда → GAS зеркало");
const partnerBlockEnd = workerSrc.indexOf("Goodboy GB_* — D1/snap правда → GAS зеркало", partnerBlockStart);
if (partnerBlockStart < 0 || partnerBlockEnd < 0) fail("partner D1 router block not found");
const partnerRouter = workerSrc.slice(partnerBlockStart, partnerBlockEnd);
const routerAt = partnerRouter.indexOf('String(d1P.code || "") === "max_order_grams"');
const gasProxyAt = partnerRouter.indexOf("const gasP = gasProxy_(a, params, env, { write: true })");
if (routerAt < 0 || gasProxyAt < 0 || routerAt > gasProxyAt) {
  fail("Worker must return max_order_grams before gasProxy_");
}

if (!/Максимум \" \+ MAX_ORDER_GRAMS \+ \" г на один заказ/.test(varkaSrc)) {
  fail("varka hint must use MAX_ORDER_GRAMS");
}
if (!/осталось \" \+ left \+ \" г/.test(varkaSrc)) fail("varka must show grams left");
if (!/blockGramIncrease_/.test(varkaSrc)) fail("varka must block gram increase");
if (!/n <= 0 \|\| over/.test(varkaSrc)) fail("submit must be disabled when over the gram cap");
if (!/id="gramLimitHint"/.test(varkaSrc)) fail("gram hint element missing");
if (/шт\s*\*\s*\d+|gramsPer|perPiece|шт→г/.test(extractFn_(workerSrc, "partnerLineWeightGrams_"))) {
  fail("weight helper must not convert pieces to grams");
}

console.log("OK: partner order gram cap 200, pieces excluded, client unit ignored");
