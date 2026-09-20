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
const deploy = fs.readFileSync(path.join(root, "DEPLOY.md"), "utf8");

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
  PP_RAW26_RETAIL_FREE_FROM_: 80,
  STATS_DELIVERY_FUEL_PER_: 4,
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
    extractFn(gsSrc, "isGramCrumbLineGs_"),
    extractFn(gsSrc, "recoverBynFromPpLines_"),
    extractFn(gsSrc, "ppOfferClientPrice_"),
    extractFn(gsSrc, "attachPpOfferClientPrice_"),
    extractFn(gsSrc, "raw26OfferCleanByn_"),
    extractFn(gsSrc, "raw26RetailCapBase_"),
    extractFn(gsSrc, "applyRaw26RetailCapAlloc_"),
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
  /function applyRaw26RetailCapAlloc_/.test(gsSrc) && /function applyRaw26RetailCapAllocD1_/.test(wSrc),
  "GS+worker allocate RAW26 cap cut (fractions first)"
);
assert(
  /function capRaw26PriceToRetail_/.test(uiSrc) &&
    /function raw26RetailCapBase_/.test(uiSrc) &&
    /function applyRaw26RetailCapAlloc_/.test(uiSrc),
  "UI has retail cap base + alloc + price helper"
);
assert(
  /crumbKindRateGs_\(it && \(it.crumbKind/.test(gsSrc) &&
    /crumbKindRateD1_\(\(it && \(it.crumbKind/.test(wSrc),
  "PP crumb retailGoods uses mixer 15/17/20 first (same as retail calcPrice)"
);
assert(
  /PP_RAW26_RETAIL_FREE_FROM_/.test(gsSrc) && /PP_RAW26_RETAIL_FREE_FROM_D1_/.test(wSrc),
  "free delivery threshold 80 switches +9×N in cap base"
);
assert(
  /cleanBeforeCap/.test(gsSrc) && /cleanAfterCap/.test(gsSrc) &&
    /cleanBeforeCap/.test(wSrc) && /cleanAfterCap/.test(uiSrc),
  "API+UI expose cleanBeforeCap / cleanAfterCap"
);
assert(
  /ppRetailCapFired_/.test(uiSrc) && /Чистыми <b>/.test(uiSrc) &&
    /function renderPpCostBreakdownHtml_/.test(uiSrc) &&
    /row\("Товар"/.test(uiSrc) && !/Товар до капа/.test(uiSrc),
  "UI: Товар label; Чистыми pair only when cap fired"
);
assert(
  /<td>Цена<\/td>/.test(uiSrc) && /<td>Фракции<\/td>/.test(uiSrc) && /<td>Товар<\/td>/.test(uiSrc) &&
    !/<td>Пакеты<\/td>/.test(uiSrc),
  "cap mini-table is Цена/Фракции/Товар, not packages"
);
assert(
  /PP_COST_BREAKDOWN_PIN/.test(gsSrc) && /PP_COST_BREAKDOWN_PIN/.test(wSrc) && /PP_COST_BREAKDOWN_PIN/.test(deploy),
  "PIN lives in Script Property / Worker secret, documented"
);
assert(
  /pin_not_configured/.test(gsSrc) && /pin_not_configured/.test(wSrc),
  "empty PIN secret does not unlock"
);
assert(
  /хаб \*\*после merge\*\*/.test(deploy) || /хаб после merge/.test(deploy),
  "DEPLOY says hub sets PIN after merge"
);
assert(
  /unlockPpCostBreakdown/.test(gsSrc) && /unlockPpCostBreakdownD1_/.test(wSrc),
  "unlock action on GS+worker"
);
assert(
  /canSeePpCostBreakdownBtn_/.test(uiSrc) && /APP_ROLE === "owner"/.test(uiSrc),
  "breakdown button is owner/all only"
);
assert(
  !/PP_COST_BREAKDOWN_PIN["']?\s*[:=]\s*["'][^"']+["']/.test(gsSrc + wSrc + uiSrc),
  "PIN value is not hardcoded"
);
assert(
  /computePpFactFromCost_\(rawPp, baskPp, nDel, 1, packOpt, schPp, baskPp, 0\)/.test(gsSrc),
  "stats passes retail=0 so cost is not client-capped"
);
assert(
  /schClamp === "RAW26"/.test(gsSrc) && /capFact/.test(gsSrc) && /calcIn/.test(gsSrc),
  "GAS saveSubscription RAW26 clamps stated to capped fact"
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
assert(factNew.statedSynced === false, "compute не пишет stated — это migrate/save");
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

/* ---------- финальный кап: полная цена ≤ 0.92 × (Σрозница строк + 9×N) ---------- */
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
const ritCapAt = Math.round((ritRetail + 9) * 0.92 * 100) / 100;
assert(ritCapAt === 40.66, "92% от 35.20+9 = 40.66");
assert(ritN1Cap.retailCapped === true, "финальный кап помечает retailCapped");
assert(ritN1Cap.fractionMarkup === 0, "Рит: фракции съели excess первым, got " + ritN1Cap.fractionMarkup);
assert(ritN1Cap.goodsByn === 50.33, "Рит: товар только до пола raw+recover 50.33, got " + ritN1Cap.goodsByn);
assert(ritN1Cap.deliveryByn === 9, "Рит: 9×N не режем");
assert(ritN1Cap.packagesByn === 0, "Рит: пакеты не трогаем");
assert(ritN1Cap.factCost === 59.33, "Рит: пол+9=59.33, пакеты/сырьё не режем под кап, got " + ritN1Cap.factCost);
assert(ritN1Cap.uncappedFloor === true, "пол+доставка > 40.66 → uncappedFloor");
assert(ritN1Cap.factCost > ritCapAt, "пол+9 может быть выше 0.92×capBase");
assert(ritN1Cap.factCost !== 40.66, "не форсировать цену под кап резкой пола");
assert(ritN1Cap.factCost !== 32.38, "не капать по товару без доставки (было 32.38)");

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
assert(baranCap.factCost === 112.24, "с_бараньим R=122≥80 → кап 0.92×122=112.24, got " + baranCap.factCost);
assert(baranCap.retailCapBase === 122, "с_бараньим база без +9, got " + baranCap.retailCapBase);
assert(baranCap.retailCapIncludesDelivery === false, "R>=80 → доставка не в базе капа");
assert(baranCap.factCost !== 120.52, "#335 ошибочно клал +9 при R>=80 → 120.52");

/* dasha_2135: товар 55, N=2 → база 73 → кап 67.16; excess с фракций */
const dashaRaw = 21.53846154;
const dashaOpen = gsCtx.computePpFactFromCost_(
  dashaRaw, [], 2, 2.6, emptyPacks, "RAW26", [], 0
);
assert(Math.abs(dashaOpen.factCost - 74) < 0.02, "dasha без фракций черновик ~74, got " + dashaOpen.factCost);
const dashaOldGoodsOnly = Math.round(55 * 0.92 * 100) / 100;
assert(dashaOldGoodsOnly === 50.6, "старый кап без доставки 50.60");
const dashaCap = gsCtx.computePpFactFromCost_(
  dashaRaw, [], 2, 2.6, emptyPacks, "RAW26", [], 55
);
assert(dashaCap.factCost === 67.16, "dasha N=2 кап 0.92×(55+18)=67.16, got " + dashaCap.factCost);
assert(dashaCap.factCost !== dashaOldGoodsOnly, "dasha не дробить до 50.60");
assert(dashaCap.deliveryByn === 18, "кап не режет 9×N, got " + dashaCap.deliveryByn);
assert(dashaCap.goodsBeforeCap > dashaCap.goodsByn || dashaCap.fractionBeforeCap >= dashaCap.fractionMarkup,
  "breakdown keeps pre-cap goods/fractions");
assert(dashaCap.retailCapBase === 73, "R=55<80 → retailCapBase 55+18=73, got " + dashaCap.retailCapBase);
assert(dashaCap.retailCapIncludesDelivery === true, "R<80 → +9×N в базе капа");
assert(dashaCap.capCutByn > 0, "capCutByn > 0");
assert(Math.abs(dashaOpen.factCost - dashaCap.factBeforeCap) < 0.02, "factBeforeCap = черновик");
assert(dashaCap.factAfterCap === 67.16, "factAfterCap = кап");
assert(
  Math.abs(dashaCap.cleanBeforeCap - dashaCap.cleanAfterCap - (dashaCap.factBeforeCap - dashaCap.factAfterCap)) < 0.02,
  "кап режет чистые на ту же величину, что и цену"
);
assert(
  Math.abs(dashaCap.cleanAfterCap - (67.16 - dashaRaw - 0 - 0 - 8)) < 0.05,
  "чистые после = цена − сырьё − recover − пакеты − 4×N, got " + dashaCap.cleanAfterCap
);
const dashaPackCap = gsCtx.computePpFactFromCost_(
  dashaRaw, [], 2, 2.6, { u1: 0, u2: 0, u3: 0, up4: 1 }, "RAW26", [], 55
);
assert(dashaPackCap.factCost === 67.16, "пакеты не в retail-базе: цена всё ещё 67.16, got " + dashaPackCap.factCost);
assert(dashaPackCap.packagesByn === 1.4, "пакеты никогда не режем капом, got " + dashaPackCap.packagesByn);
assert(dashaPackCap.goodsByn >= Math.round((dashaRaw + 0) * 100) / 100 - 0.01, "товар не ниже raw+recover");
const dashaMissing = gsCtx.computePpFactFromCost_(
  dashaRaw, [], 2, 2.6, emptyPacks, "RAW26", [], 0
);
assert(dashaMissing.retailCapped === false && Math.abs(dashaMissing.factCost - 74) < 0.02, "Σрозница 0 → без капа");

const dashaAlloc = gsCtx.applyRaw26RetailCapAlloc_(46, 18, 0, 11, 67.16, 20);
assert(dashaAlloc.factCost === 67.16, "dasha alloc цена 67.16, got " + dashaAlloc.factCost);
assert(Math.abs(dashaAlloc.fractionMarkup - 3.16) < 0.001, "фракции 11→3.16, got " + dashaAlloc.fractionMarkup);
assert(dashaAlloc.goods === 46, "товар не трогаем, got " + dashaAlloc.goods);
assert(dashaAlloc.delivery === 18, "доставку не трогаем");
assert(dashaAlloc.packagesByn === 0, "пакеты без изменений");
const goodsCut = gsCtx.applyRaw26RetailCapAlloc_(56, 18, 0, 0, 67.16, 21.54);
assert(goodsCut.factCost === 67.16, "без фракций режем товар: цена 67.16");
assert(goodsCut.delivery === 18, "без фракций доставку всё равно не режем");
assert(goodsCut.goods === 49.16, "товар 56→49.16, got " + goodsCut.goods);
const floorThenPack = gsCtx.applyRaw26RetailCapAlloc_(22, 18, 5, 0, 67.16, 22);
assert(floorThenPack.goods === 22, "товар на полу raw+recover");
assert(floorThenPack.delivery === 18, "доставку не режем даже после пола");
assert(floorThenPack.packagesByn === 5, "пакеты не нужны: 22+18+5=45 < 67.16");
const packAfterFloor = gsCtx.applyRaw26RetailCapAlloc_(22, 18, 40, 0, 67.16, 22);
assert(packAfterFloor.goods === 22 && packAfterFloor.delivery === 18, "пол товара + доставка живы");
assert(packAfterFloor.packagesByn === 40, "пакеты никогда не режем, got " + packAfterFloor.packagesByn);
assert(packAfterFloor.factCost === 80, "пол+пакеты+9×N = 80, не 67.16");
assert(packAfterFloor.uncappedFloor === true, "пол+пакеты+доставка > капа → uncappedFloor");

/* кап режет только фракции и наценку товара; сырьё/пакеты/доставка целы */
const onlyFracGoods = gsCtx.applyRaw26RetailCapAlloc_(80, 9, 5, 10, 50, 40);
assert(onlyFracGoods.fractionMarkup === 0, "фракции в ноль первым");
assert(onlyFracGoods.goods === 40, "товар до пола raw+recover, не ниже");
assert(onlyFracGoods.packagesByn === 5, "пакеты не трогаем");
assert(onlyFracGoods.delivery === 9, "9×N не трогаем");
assert(onlyFracGoods.factCost === 54, "40+9+5=54");
assert(onlyFracGoods.uncappedFloor === true, "54 > 50 → flag");
assert(onlyFracGoods.goods >= 40, "сырьё+recover не режем");

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
  PP_RAW26_RETAIL_FREE_FROM_D1_: 80,
  STATS_DELIVERY_FUEL_PER_D1_: 4,
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
    extractFn(wSrc, "isGramCrumbLineD1_"),
    extractFn(wSrc, "recoverBynFromPpLinesD1_"),
    extractFn(wSrc, "ppOfferClientPriceD1_"),
    extractFn(wSrc, "attachPpOfferClientPriceD1_"),
    extractFn(wSrc, "raw26OfferCleanBynD1_"),
    extractFn(wSrc, "raw26RetailCapBaseD1_"),
    extractFn(wSrc, "applyRaw26RetailCapAllocD1_"),
    extractFn(wSrc, "computePpFactFromCostD1_")
  ].join("\n"),
  wFactCtx
);
const wRit = wFactCtx.computePpFactFromCostD1_(
  raw, ritBasket, 1, 2.6, emptyPacks, "RAW26", ritLines, ritRetail
);
assert(wRit.factCost === 59.33, "worker Рит N=1 пол+9=59.33, не 40.66, got " + wRit.factCost);
assert(wRit.uncappedFloor === true && wRit.fractionMarkup === 0, "worker Рит: фракции 0, пол выше капа");
assert(wRit.packagesByn === 0 && wRit.deliveryByn === 9 && wRit.goodsByn === 50.33, "worker не режет пакеты/доставку/пол");
const wBaran = wFactCtx.computePpFactFromCostD1_(
  44.18, baranBasket, 1, 2.6, baranPacks, "RAW26", baranLines, 122
);
assert(wBaran.factCost === 112.24, "worker с_бараньим R>=80 кап 112.24, got " + wBaran.factCost);
assert(wBaran.retailCapBase === 122, "worker с_бараньим база 122 без +9");
const wOpen = wFactCtx.computePpFactFromCostD1_(
  44.18, baranBasket, 1, 2.6, baranPacks, "RAW26", baranLines, 0
);
assert(Math.abs(wOpen.factCost - 153.07) < 0.02, "worker retail=0 не капает, got " + wOpen.factCost);
const wDasha = wFactCtx.computePpFactFromCostD1_(
  dashaRaw, [], 2, 2.6, emptyPacks, "RAW26", [], 55
);
assert(wDasha.factCost === 67.16, "worker dasha N=2 кап 67.16, got " + wDasha.factCost);
assert(wDasha.deliveryByn === 18, "worker не режет доставку");
const wAlloc = wFactCtx.applyRaw26RetailCapAllocD1_(46, 18, 0, 11, 67.16, 20);
assert(Math.abs(wAlloc.fractionMarkup - 3.16) < 0.001, "worker фракции 11→3.16, got " + wAlloc.fractionMarkup);
assert(wAlloc.goods === 46 && wAlloc.delivery === 18, "worker товар/доставка без изменений");

const uiCapCtx = vm.createContext({
  Math: Math,
  Number: Number,
  String: String,
  isFinite: isFinite,
  PP_RAW26_RETAIL_CAP: 0.92,
  PP_RAW26_DELIVERY_PER: 9,
  PP_RAW26_RETAIL_FREE_FROM: 80,
  STATS_DELIVERY_FUEL_PER: 4
});
vm.runInContext(
  [
    extractFn(uiSrc, "raw26OfferCleanByn_"),
    extractFn(uiSrc, "raw26RetailCapBase_"),
    extractFn(uiSrc, "applyRaw26RetailCapAlloc_"),
    extractFn(uiSrc, "capRaw26PriceToRetail_")
  ].join("\n"),
  uiCapCtx
);
assert(uiCapCtx.capRaw26PriceToRetail_(126.29, 0, 1) === 126.29, "UI: розница 0 → не капать");
assert(uiCapCtx.raw26RetailCapBase_(55, 2) === 73, "UI: dasha база 55+18=73");
assert(uiCapCtx.capRaw26PriceToRetail_(74, 55, 2) === 67.16, "UI: dasha 74 → 67.16");
assert(uiCapCtx.capRaw26PriceToRetail_(126.29, 35.2, 1) === 40.66, "UI: 126.29 → 40.66");
assert(uiCapCtx.raw26RetailCapBase_(171.2, 1) === 171.2, "UI: R>=80 база без +9");
assert(uiCapCtx.raw26RetailCapBase_(80, 2) === 80, "UI: R=80 ровно — без +9");
assert(uiCapCtx.raw26RetailCapBase_(79.99, 1) === 88.99, "UI: R<80 → +9");
assert(uiCapCtx.capRaw26PriceToRetail_(153.07, 122, 1) === 112.24, "UI: R=122 → 0.92×122=112.24");
const uiAlloc = uiCapCtx.applyRaw26RetailCapAlloc_(46, 18, 0, 11, 67.16, 20);
assert(uiAlloc.factCost === 67.16 && Math.abs(uiAlloc.fractionMarkup - 3.16) < 0.001, "UI alloc: 11→3.16");
assert(uiAlloc.goods === 46 && uiAlloc.delivery === 18, "UI alloc не трогает товар/доставку");
assert(uiCapCtx.raw26OfferCleanByn_(75, 20, 5, 0, 2) === 42, "UI чистые: 75-20-5-0-8=42");
assert(uiCapCtx.raw26OfferCleanByn_(67.16, 20, 5, 0, 2) === 34.16, "UI чистые после капа 34.16");

/* ---------- convert-to-RAW26: stated = capped fact; +9×N only if R<80 ---------- */
function convertToRaw26Like_(fn, rawCost, basket, n, packs, lines, retailGoods) {
  const fact = fn(rawCost, basket, n, 2.6, packs, "RAW26", lines, retailGoods);
  const stated = fact.factCost;
  const r = Number(retailGoods);
  const base = r > 0
    ? Math.round((r + (r < 80 ? 9 * n : 0)) * 100) / 100
    : 0;
  const capAt = base > 0 ? Math.round(base * 0.92 * 100) / 100 : Infinity;
  const packWant = packs
    ? Math.round(((packs.u1 || 0) * 0.34 + (packs.u2 || 0) * 0.56 + (packs.u3 || 0) * 0.80 + (packs.up4 || 0) * 1.4) * 100) / 100
    : 0;
  assert(Math.abs((Number(fact.packagesByn) || 0) - packWant) < 0.001, "convert не режет пакеты");
  assert(fact.deliveryByn === 9 * n, "convert не режет 9×N");
  if (fact.uncappedFloor) {
    assert(stated > capAt, "uncappedFloor: fact = пол+пакеты+доставка > капа");
  } else if (capAt < Infinity) {
    assert(stated <= capAt + 0.001, "convert-to-RAW26 stated " + stated + " > cap " + capAt);
  }
  return { stated: stated, fact: fact, capAt: capAt, base: base };
}

const ritMurrBasket = [
  line("ЛЁГКОЕ", "Среднее", 320, "dressura"),
  line("СЕРДЦЕ", "Целое", 80, "dressura"),
  line("ПОЧКИ", "Целое", 40, "dressura"),
  { name: "БЫЧИЙ КОРЕНЬ", main: "БЫЧИЙ КОРЕНЬ", sub: "СРЕД", val: 8, value: 8, cat: "chew" },
  line("ЯБЛОКИ", "", 100, "veg"),
  {
    name: "крошка", main: "крошка", sub: "РУБЕЦ Т", val: 100, value: 100, cat: "crumb",
    crumbKind: "veg",
    sources: [{ cat: "dressura", name: "РУБЕЦ Т", main: "РУБЕЦ Т", sub: "" }],
    ratio: [1]
  }
];
const ritMurrLines = ritMurrBasket.map(function (it) {
  return {
    name: it.name, sub: it.sub, val: it.val,
    piece: it.cat === "chew", cat: it.cat, crumbKind: it.crumbKind
  };
});
const ritMurrPacks = { u1: 0, u2: 4, u3: 3, up4: 1 };
const ritMurrRetail = 171.2;
const ritMurrRaw = 49.6;
const convGs = convertToRaw26Like_(
  gsCtx.computePpFactFromCost_, ritMurrRaw, ritMurrBasket, 1, ritMurrPacks, ritMurrLines, ritMurrRetail
);
assert(gsCtx.raw26RetailCapBase_(171.2, 1) === 171.2, "(1) R>=80 → no +9 in base");
assert(gsCtx.raw26RetailCapBase_(80, 3) === 80, "(1) R=80 exactly → no +9");
assert(wFactCtx.raw26RetailCapBaseD1_(171.2, 2) === 171.2, "(1) worker R>=80 ignores N");
assert(gsCtx.raw26RetailCapBase_(55, 2) === 73, "(2) R<80 → +9×N");
assert(wFactCtx.raw26RetailCapBaseD1_(55, 2) === 73, "(2) worker R<80 → +9×N");
assert(convGs.base === 171.2, "(3) rit_murr capBase = retail R, not R+9");
assert(convGs.capAt === 157.5, "(3) rit_murr cap 0.92×171.20=157.50, got " + convGs.capAt);
assert(convGs.stated === 157.5, "(3) rit_murr convert stated 157.50, got " + convGs.stated);
assert(convGs.stated !== 161.18, "(3) #335 161.18 was wrong (always +9)");
assert(convGs.stated !== 152.9, "(3) hub 152.90 used source-crumb 166.20, not live retail 171.20");
assert(convGs.stated < ritMurrRetail, "rit_murr convert stated < retail goods");
assert(convGs.fact.uncappedFloor === false, "rit_murr пол+пакеты+9 < 157.50");
assert(convGs.fact.packagesByn === 6.04, "rit_murr пакеты не режем, got " + convGs.fact.packagesByn);
assert(convGs.fact.goodsByn + 0.001 >= ritMurrRaw + convGs.fact.recoverByn, "rit_murr товар ≥ сырьё+recover");
assert(convGs.fact.deliveryByn === 9, "rit_murr 9×N в цене");
const convW = convertToRaw26Like_(
  wFactCtx.computePpFactFromCostD1_, ritMurrRaw, ritMurrBasket, 1, ritMurrPacks, ritMurrLines, ritMurrRetail
);
assert(convW.stated === 157.5, "worker convert rit_murr stated 157.50, got " + convW.stated);

const overStated = 166;
assert(
  gsCtx.ppOfferClientPrice_("RAW26", convGs.fact.factCost, overStated, false) === 157.5,
  "оффер rit_murr: 166 stated ignored, client 157.50"
);

assert(
  /statedCost: applyStated \? fact\.factCost/.test(wSrc),
  "Worker migrate writes statedCost = capped fact"
);
assert(
  /statedTouched: applyStated \? 0/.test(wSrc),
  "Worker migrate clears statedTouched"
);
assert(
  /clampRaw26SubscriptionWriteD1_/.test(wSrc),
  "Worker save clamps RAW26 stated/fact to cap"
);
assert(
  /Number\(factCost\) > capFact/.test(gsSrc),
  "GAS save clamps RAW26 stated above cap"
);
assert(
  /uncappedFloor/.test(gsSrc) && /uncappedFloor/.test(wSrc) && /uncappedFloor/.test(uiSrc),
  "alloc flags uncappedFloor when floor+pkg+del > cap"
);
assert(
  !/cutG2/.test(gsSrc) && !/cutG2/.test(wSrc) && !/cutG2/.test(uiSrc),
  "no second goods cut below raw+recover"
);

console.log("ok pp-offer-client-price");
console.log("  Рит мурр before: stated 195 → client 195 (bug)");
console.log("  Рит мурр after:  fact " + factNew.factCost + " → client " + factNew.factCost +
  " (frac 6.4, retail=0 keeps draft)");
console.log("  Рит N=1 + розница 35.20: " + ritN1Open.factCost + " → " + ritN1Cap.factCost +
  " (пол+9=59.33, uncappedFloor; пакеты/сырьё не режем)");
console.log("  с_бараньим N=1: было " + baranOldInnerOnly + " → " + baranCap.factCost + " (R>=80, без +9)");
console.log("  dasha_2135 N=2: ~74 → " + dashaCap.factCost + " (R<80, 55+18)");
console.log("  rit_murr live: R=171.20 ≥80 → stated=fact " + convGs.stated + " (не 161.18 / не 152.90)");
console.log("  LEGACY stated 195 kept; крошка 0");
