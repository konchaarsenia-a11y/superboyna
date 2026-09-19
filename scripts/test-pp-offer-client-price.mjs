#!/usr/bin/env node
/**
 * RAW26 offer: client price = calc fact, not inflated stated.
 * Рит мурр: 320г среднее → фракция 6.4; stated 195 не уходит клиенту.
 * LEGACY stated не ломаем. Крошку не трогаем.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing function " + name);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}

function extractVarObject(src, name) {
  const start = src.indexOf("var " + name + " = {");
  const alt = start < 0 ? src.indexOf("const " + name + " = {") : start;
  const at = start >= 0 ? start : alt;
  if (at < 0) throw new Error("missing object " + name);
  const brace = src.indexOf("{", at);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(at, i + 1) + ";";
    }
  }
  throw new Error("unclosed object " + name);
}

function line(name, sub, val, cat) {
  return { name: name, main: name, sub: sub, val: val, value: val, cat: cat };
}

const gsSrc = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
const uiSrc = fs.readFileSync(path.join(root, "boinya-c/app.main.js"), "utf8");
const wSrc = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");

const gsCtx = vm.createContext({
  Math: Math,
  Number: Number,
  String: String,
  isFinite: isFinite,
  Object: Object,
  PP_RAW26_COEF_DEFAULT_: 2.6,
  PP_RAW26_RECOVER_100_: 3.9,
  PP_RAW26_RECOVER_PIECE_: 0.5,
  PP_RAW26_DELIVERY_PER_: 9,
  PP_RAW26_RETAIL_CAP_: 0.92,
  PP_LEGACY_COEF_DEFAULT_: 2.3,
  PP_LEGACY_FIXED_: 11,
  PP_LEGACY_DELIVERY_PER_: 6,
  isPieceSkuName_: function () { return false; }
});
vm.runInContext(
  [
    extractVarObject(gsSrc, "DRESSURA_FRAC_RATES_DEFAULT_"),
    extractFn(gsSrc, "dressuraFractionSizeKey_"),
    extractFn(gsSrc, "dressuraFractionPickRate_"),
    extractFn(gsSrc, "dressuraFractionRates_"),
    extractFn(gsSrc, "dressuraFractionMarkupFromBasket_"),
    extractFn(gsSrc, "packagesBynFromUCounts_"),
    extractFn(gsSrc, "normalizePpScheme_"),
    extractFn(gsSrc, "recoverBynFromPpLines_"),
    extractFn(gsSrc, "ppOfferClientPrice_"),
    extractFn(gsSrc, "attachPpOfferClientPrice_"),
    extractFn(gsSrc, "computePpFactFromCost_")
  ].join("\n"),
  gsCtx
);

const uiCtx = vm.createContext({
  Math: Math,
  Number: Number,
  String: String,
  isFinite: isFinite,
  Object: Object
});
vm.runInContext(extractFn(uiSrc, "ppOfferClientPrice_"), uiCtx);

const wCtx = vm.createContext({
  Math: Math,
  Number: Number,
  String: String,
  isFinite: isFinite,
  Object: Object
});
vm.runInContext(extractFn(wSrc, "ppOfferClientPriceD1_"), wCtx);

/* ---------- stated vs fact ---------- */
const STATED_195 = 195;
const FACT_OLD = 138.5;

function checkPicker(fn, label) {
  const raw26 = fn("RAW26", FACT_OLD, STATED_195, false);
  assert(raw26 === FACT_OLD, label + " RAW26 client = fact " + FACT_OLD + ", got " + raw26);
  const promo = fn("RAW26", FACT_OLD, 120, true);
  assert(promo === 120, label + " RAW26 touched stated 120, got " + promo);
  const legacy = fn("LEGACY", 100, STATED_195, false);
  assert(legacy === STATED_195, label + " LEGACY keeps stated 195, got " + legacy);
  const legacyEmpty = fn("LEGACY", 100, "", false);
  assert(legacyEmpty === 100, label + " LEGACY empty stated → fact, got " + legacyEmpty);
}

checkPicker(gsCtx.ppOfferClientPrice_, "Code.gs");
checkPicker(uiCtx.ppOfferClientPrice_, "app.main.js");
checkPicker(wCtx.ppOfferClientPriceD1_, "worker");

assert(
  /statedTouched/.test(uiSrc) && /calcFactCost/.test(uiSrc),
  "UI save sends statedTouched + calcFactCost"
);
assert(
  /capAt > 0 && factCost > capAt/.test(gsSrc) && /capAt > 0 && factCost > capAt/.test(wSrc),
  "GS+worker apply final RAW26 cap on full factCost"
);
assert(
  /function capRaw26PriceToRetail_/.test(uiSrc),
  "UI has capRaw26PriceToRetail_"
);
assert(
  /computePpFactFromCost_\(rawPp, baskPp, nDel, 1, packOpt, schPp, baskPp, 0\)/.test(gsSrc),
  "stats passes retail=0 so cost is not client-capped"
);
assert(
  /schemeForPrice === "RAW26"/.test(gsSrc) && /calcIn/.test(gsSrc),
  "GAS saveSubscription RAW26 prefers calc fact"
);
assert(
  !/subTotal = \(isFinite\(stated\).*stated/.test(uiSrc),
  "card client message must not prefer stated blindly"
);

/* ---------- Рит мурр: 320г среднее ---------- */
const ritBasket = [line("ЛЁГКОЕ", "Среднее", 320, "dressura")];
const fracNew = gsCtx.dressuraFractionMarkupFromBasket_(ritBasket);
assert(Math.abs(fracNew - 6.4) < 0.001, "Рит мурр 320г среднее → фракция 6.4, got " + fracNew);

const crumb = gsCtx.dressuraFractionMarkupFromBasket_([
  line("КРОШКА МИКС", "Крошка", 80, "dressura")
]);
assert(crumb === 0, "крошка markup stays 0, got " + crumb);

const ritLines = [{
  name: "ЛЁГКОЕ", sub: "Среднее", val: 320, piece: false, cat: "dressura"
}];
/* old fact 138.5 with frac 9.6 → raw ≈ 37.85; new frac 6.4 → ~135.3 */
const raw = 37.85;
const emptyPacks = { u1: 0, u2: 0, u3: 0, up4: 0 };
const factNew = gsCtx.computePpFactFromCost_(
  raw, ritBasket, 2, 2.6, emptyPacks, "RAW26", ritLines, 0
);
assert(factNew.scheme === "RAW26", "scheme RAW26");
assert(factNew.fractionMarkup === 6.4, "fact fractionMarkup 6.4, got " + factNew.fractionMarkup);
assert(factNew.clientPrice === factNew.factCost, "RAW26 clientPrice synced to fact");
assert(factNew.statedSynced === true, "RAW26 statedSynced");
assert(factNew.statedCost === factNew.factCost, "RAW26 statedCost=fact");
assert(
  factNew.factCost >= 130 && factNew.factCost < 140,
  "Рит мурр fact after new rates in 130s, got " + factNew.factCost
);
assert(
  Math.abs(factNew.factCost - (FACT_OLD - (9.6 - 6.4))) < 0.2,
  "new fact ≈ old 138.5 − 3.2, got " + factNew.factCost
);
assert(
  gsCtx.ppOfferClientPrice_("RAW26", factNew.factCost, STATED_195, false) === factNew.factCost,
  "оффер Рит мурр: 195 stated ignored, client gets " + factNew.factCost
);

const legacyFact = gsCtx.computePpFactFromCost_(
  raw, ritBasket, 2, 2.3, emptyPacks, "LEGACY", ritLines, 0
);
assert(legacyFact.scheme === "LEGACY", "LEGACY scheme untouched");
assert(
  gsCtx.ppOfferClientPrice_("LEGACY", legacyFact.factCost, STATED_195, false) === STATED_195,
  "LEGACY client still stated 195"
);

const retailMedium = 9 + 2;
assert(retailMedium === 11, "розница среднее = база 9 + ставка 2 = 11");

/* ---------- финальный кап: полная цена ≤ 0.92 × Σрозница строк ---------- */
const ritRetail = Math.round((320 / 100) * retailMedium * 100) / 100;
assert(ritRetail === 35.2, "Рит мурр 320г × 11 = 35.20 розницы строк");
const ritN1Open = gsCtx.computePpFactFromCost_(
  raw, ritBasket, 1, 2.6, emptyPacks, "RAW26", ritLines, 0
);
assert(ritN1Open.factCost > ritRetail, "без Σрозница кап не выдумывать: " + ritN1Open.factCost + " > 35.20");
assert(ritN1Open.retailCapped === false, "retail=0 → retailCapped false");
const ritN1Cap = gsCtx.computePpFactFromCost_(
  raw, ritBasket, 1, 2.6, emptyPacks, "RAW26", ritLines, ritRetail
);
const ritCapAt = Math.round(ritRetail * 0.92 * 100) / 100;
assert(ritCapAt === 32.38, "92% от 35.20 = 32.38");
assert(ritN1Cap.factCost === ritCapAt, "Рит N=1 после капа 32.38, got " + ritN1Cap.factCost);
assert(ritN1Cap.factCost < ritRetail, "ПП всегда ниже розницы состава");
assert(ritN1Cap.retailCapped === true, "финальный кап помечает retailCapped");

const baranRecover = 27.80;
const baranGrams = Math.round((baranRecover / 3.9) * 100 * 10000) / 10000;
const baranLines = [{ name: "DOC", val: baranGrams, piece: false, cat: "dressura" }];
const baranBasket = [{ name: "DOC", val: baranGrams, cat: "dressura" }];
const baranPacks = { u1: 0, u2: 0, u3: 0, up4: 1 };
const baranOpen = gsCtx.computePpFactFromCost_(
  44.18, baranBasket, 1, 2.6, baranPacks, "RAW26", baranLines, 0
);
assert(Math.abs(baranOpen.factCost - 153.07) < 0.02, "с_бараньим retail=0 → черновик 153.07, got " + baranOpen.factCost);
const baranOldInnerOnly = 122.64;
assert(baranOldInnerOnly > 122, "до фикса кап только на товар: 122.64 > розница 122");
const baranCap = gsCtx.computePpFactFromCost_(
  44.18, baranBasket, 1, 2.6, baranPacks, "RAW26", baranLines, 122
);
assert(baranCap.factCost === 112.24, "с_бараньим после капа 0.92×122=112.24, got " + baranCap.factCost);

const wFactCtx = vm.createContext({
  Math: Math,
  Number: Number,
  String: String,
  isFinite: isFinite,
  Object: Object,
  PP_RAW26_COEF_DEFAULT_D1_: 2.6,
  PP_RAW26_RECOVER_100_D1_: 3.9,
  PP_RAW26_RECOVER_PIECE_D1_: 0.5,
  PP_RAW26_DELIVERY_PER_D1_: 9,
  PP_RAW26_RETAIL_CAP_D1_: 0.92,
  PP_LEGACY_COEF_DEFAULT_D1_: 2.3,
  PP_LEGACY_FIXED_D1_: 11,
  PP_LEGACY_DELIVERY_PER_D1_: 6,
  isPieceSkuNameD1_: function () { return false; }
});
vm.runInContext(
  [
    extractVarObject(wSrc, "DRESSURA_FRAC_RATES_DEFAULT_D1_").replace(/^const /, "var "),
    extractFn(wSrc, "dressuraFractionSizeKeyD1_"),
    extractFn(wSrc, "dressuraFractionPickRateD1_"),
    extractFn(wSrc, "dressuraFractionRatesD1_"),
    extractFn(wSrc, "dressuraFractionMarkupFromBasketD1_"),
    extractFn(wSrc, "packagesBynFromUCountsD1_"),
    extractFn(wSrc, "normalizePpSchemeD1_"),
    extractFn(wSrc, "recoverBynFromPpLinesD1_"),
    extractFn(wSrc, "ppOfferClientPriceD1_"),
    extractFn(wSrc, "attachPpOfferClientPriceD1_"),
    extractFn(wSrc, "computePpFactFromCostD1_")
  ].join("\n"),
  wFactCtx
);
const wRit = wFactCtx.computePpFactFromCostD1_(
  raw, ritBasket, 1, 2.6, emptyPacks, "RAW26", ritLines, ritRetail
);
assert(wRit.factCost === 32.38, "worker Рит N=1 кап 32.38, got " + wRit.factCost);
const wBaran = wFactCtx.computePpFactFromCostD1_(
  44.18, baranBasket, 1, 2.6, baranPacks, "RAW26", baranLines, 122
);
assert(wBaran.factCost === 112.24, "worker с_бараньим кап 112.24, got " + wBaran.factCost);
const wOpen = wFactCtx.computePpFactFromCostD1_(
  44.18, baranBasket, 1, 2.6, baranPacks, "RAW26", baranLines, 0
);
assert(Math.abs(wOpen.factCost - 153.07) < 0.02, "worker retail=0 не капает, got " + wOpen.factCost);

const uiCapCtx = vm.createContext({
  Math: Math,
  Number: Number,
  String: String,
  isFinite: isFinite,
  PP_RAW26_RETAIL_CAP: 0.92
});
vm.runInContext(extractFn(uiSrc, "capRaw26PriceToRetail_"), uiCapCtx);
assert(uiCapCtx.capRaw26PriceToRetail_(126.29, 0) === 126.29, "UI: розница 0 → не капать");
assert(uiCapCtx.capRaw26PriceToRetail_(126.29, 35.2) === 32.38, "UI: 126.29 → 32.38");
assert(uiCapCtx.capRaw26PriceToRetail_(122.64, 122) === 112.24, "UI: 122.64 → 112.24");

console.log("ok pp-offer-client-price");
console.log("  Рит мурр before: stated 195 → client 195 (bug)");
console.log("  Рит мурр after:  fact " + factNew.factCost + " → client " + factNew.factCost +
  " (frac 6.4, retail=0 keeps draft)");
console.log("  Рит N=1 + розница 35.20: " + ritN1Open.factCost + " → " + ritN1Cap.factCost + " (92%)");
console.log("  с_бараньим N=1: было " + baranOldInnerOnly + " (кап только товар) → " + baranCap.factCost);
console.log("  LEGACY stated 195 kept; крошка 0");
