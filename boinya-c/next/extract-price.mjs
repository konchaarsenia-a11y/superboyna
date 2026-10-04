/**
 * Вырезает расчёт ПП, кап, оффер и подбор из boinya-c/app.main.js без правок исходника.
 * node boinya-c/next/extract-price.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "../app.main.js");
const require = createRequire(import.meta.url);

const FUNCS = [
  "pricePickCloneItems_",
  "pricePickDefaultFrac_",
  "pricePickDefaultStarter_",
  "pricePickNormUp_",
  "pricePickAliasText_",
  "pricePickRound5_",
  "pricePickMatchMention_",
  "parseAnketSignals_",
  "pricePickItemFromSku_",
  "pricePickScaleItems_",
  "pricePickExcludeNames_",
  "pricePickBoostLiked_",
  "pricePickTargetScale_",
  "pricePickSwapForBp2_",
  "pricePickOrderSections_",
  "pricePickBanned_",
  "pricePickPushSku_",
  "pricePickLungAnchor_",
  "pricePickOfferLines_",
  "pricePickCatalogLines_",
  "pricePickFlags_",
  "pricePickExampleScore_",
  "pricePickCanonExamples_",
  "pricePickReadStoredExamples_",
  "pricePickWriteStoredExamples_",
  "pricePickFindExample_",
  "pricePickFromExample_",
  "pricePickComposeForTarget_",
  "pricePickSkuTitle_",
  "pricePickParseBudgetSeg_",
  "pricePickParseBudget_",
  "pricePickDogProfile_",
  "pricePickJoinRu_",
  "pricePickAccRu_",
  "pricePickOfferText_",
  "pricePickMonthlyItems_",
  "pricePickEstimateMonthly_",
  "pricePickTrimKey_",
  "pricePickIsPieceItem_",
  "pricePickLocalMonthly_",
  "pricePickTrimStep_",
  "pricePickTrimToBudget_",
  "pricePickScaleForBudget_",
  "pricePickDropPriciest_",
  "pricePickFitBudget_",
  "pricePickItemsKey_",
  "pricePickRememberExample_",
  "pricePickSectionTitle_",
  "pricePickCatClass_",
  "statedTouchedFlag_",
  "ppOfferClientPrice_",
  "formatClientMessagePrice_",
  "ppClientDisplayPrice_",
  "clientMessagePriceText_",
  "ppSheetPrice_",
  "raw26ApiFactPrice_",
  "parsePpCoefFromWishes_",
  "stripPpCoefFromWishes_",
  "stampPpCoefIntoWishes_",
  "todayYmdLocal_",
  "defaultPpSchemeForNewLocal_",
  "normalizePpSchemeLocal_",
  "parsePpSchemeFromWishes_",
  "stripPpSchemeFromWishes_",
  "stampPpSchemeIntoWishes_",
  "stripPpMetaFromWishes_",
  "raw26OfferCleanByn_",
  "raw26RetailCapBase_",
  "applyRaw26RetailCapAlloc_",
  "capRaw26PriceToRetail_",
  "recoverBynFromBasketLocal_",
  "packagesBynFromUCountsLocal_",
  "packHintFromU_",
  "extractRawPpCost_",
  "recalcPpCostSum",
  "calcDressuraFractionMarkup",
  "crumbOfferGenitive_",
  "crumbClientMessageLine_",
  "priceUnitLabel",
  "formatPriceCompositionLine",
  "buildPriceCompositionBlocks",
  "buildPriceCompositionForMessage",
  "roundRub",
  "money2_",
  "formatClientRub_",
  "capOfferSubToDisplayedRetail_",
  "composePpClientMessage",
  "composeRetailClientMessage",
  "priceModeKey",
  "priceModeLabel_",
  "applyLocalPpFact_",
  "asmFormatOn",
  "asmIsLargeChewFrac",
  "asmPackGrams",
  "asmPackChews",
  "asmCraftBags",
  "buildAssemblyPacksLocal",
  "packCountsFromBasketLocal_",
  "syncPricePacksFromBasket_",
  "calcPricePacksByn",
  "pricePacksSummary"
];

function isRegexStart(src, i) {
  let j = i - 1;
  while (j >= 0 && /[\s]/.test(src[j])) j--;
  if (j < 0) return true;
  return /[(,=:[!&|?{};+\-*%~^]/.test(src[j]) || src.slice(Math.max(0, j - 5), j + 1).match(/(^|[^A-Za-z0-9_$])(return|case|throw|typeof|void|in|of)$/);
}

function endOfBlock(src, openIndex) {
  let i = openIndex;
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      i = src.indexOf("\n", i);
      if (i < 0) return src.length - 1;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      i = src.indexOf("*/", i + 2);
      if (i < 0) throw new Error("unclosed comment");
      i += 2;
      continue;
    }
    if (c === "'" || c === "\"" || c === "`") {
      const q = c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (q === "`" && src[i] === "$" && src[i + 1] === "{") {
          const inner = endOfBlock(src, i + 1);
          i = inner + 1;
          continue;
        }
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "/" && isRegexStart(src, i)) {
      i++;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "/") { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  throw new Error("unbalanced at " + openIndex);
}

function extractFunction(src, name) {
  const re = new RegExp("\\n    (?:async )?function " + name + "\\s*\\(");
  const m = re.exec(src);
  if (!m) throw new Error("нет функции " + name);
  const start = m.index + 1;
  const brace = src.indexOf("{", start);
  const end = endOfBlock(src, brace);
  return src.slice(start, end + 1);
}

function extractBetween(src, startRe, endRe) {
  const a = startRe.exec(src);
  if (!a) throw new Error("нет начала " + startRe);
  const b = endRe.exec(src.slice(a.index + a[0].length));
  if (!b) throw new Error("нет конца " + endRe);
  return src.slice(a.index + 1, a.index + a[0].length + b.index).replace(/\n    /g, "\n");
}

export function buildPriceSource(appSrc) {
  const consts = extractBetween(
    appSrc,
    /\n    var PP_SCHEME_CUTOFF_YMD = "2026-08-31";/,
    /\n    function todayYmdLocal_\(/
  );
  const pack = extractBetween(
    appSrc,
    /\n    var PRICE_PACK_UNIT = \{ small: 0\.34, medium: 0\.56, large: 0\.80, legs: 1\.40 \};/,
    /\n    var pricePackCounts/
  );
  const asmCaps = extractBetween(
    appSrc,
    /\n    var ASM_CAP_PRODUCT = /,
    /\n    function asmFormatOn/
  );
  const pickWeeks = extractBetween(
    appSrc,
    /\n    var PRICE_PICK_MONTH_WEEKS = 4;/,
    /\n    function pricePickMonthlyItems_/
  );
  const chunks = FUNCS.map((name) => extractFunction(appSrc, name));
  const body = chunks.join("\n\n");
  return `/* Бойня next — цены ПП, кап, оффер и подбор 1:1 из boinya-c/app.main.js.
   Не править вручную: node boinya-c/next/extract-price.mjs */
(function (root, factory) {
  var eng = (typeof module !== "undefined" && module.exports)
    ? require("./order-engine.js")
    : (root.BoinyaOrderEngine || {});
  var api = factory(eng);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoinyaPrice = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (eng) {
  "use strict";
  var calcRetailBasketTotal = eng.calcRetailBasketTotal;
  var retailLineCost = eng.retailLineCost;
  var unitForItem = eng.unitForItem;
  var isPieceSkuName = eng.isPieceSkuName;
  var buildIgKnownMap = eng.buildIgKnownMap;
  var igAliasResolve = eng.igAliasResolve;
  var serializeBasketItem_ = eng.serializeBasketItem_;
  var prettyProductName = eng.prettyProductName;
  var humanFraction = eng.humanFraction;
  var isCrumbBasketItemUi_ = eng.isCrumbBasketItemUi_;
  var crumbSourceNames_ = eng.crumbSourceNames_;
  var isChewProductName_ = eng.isChewProductName_;
  var isChewCrumbSource_ = eng.isChewCrumbSource_;
  var catalog = eng.catalog;
  var dressuraFractionSizeKey = eng.dressuraFractionSizeKey;
  var dressuraFractionPickRate = eng.dressuraFractionPickRate;
  var dressuraFractionRates = eng.dressuraFractionRates;
  var parseIgLinesToItems = eng.parseIgLinesToItems;

${consts}
${pack}
${pickWeeks}
${asmCaps}

  var pricePackCounts = { small: 0, medium: 0, large: 0, legs: 0 };
  var pricePacksManual = false;
  function isPricePpLikeMode_() { return String(priceMode || "pp") !== "retail"; }
  function allPriceItems() { return _list || []; }
  function renderPricePackCounters() {}
  var priceMode = "pp";
  var PRICE_PICK_EX_KEY_ = "boinya_c_pick_examples_v1";

  var priceDogCount = 1;
  var priceDogNames = { 1: "", 2: "" };
  var pricePpScheme = "RAW26";
  var _coef = 2.6;
  var _scheme = "RAW26";
  var _list = [];
  var _hint = "";
  var _lastPpCostFact = null;
  var _fracRates = { slices: 0, strips: 1, large: 1, medium: 2, small: 3, extraSmall: 4, whole: 0 };
  var fetchPpCalcPrice_ = async function () { return null; };

  function priceDogLabel_(n) {
    var name = String((priceDogNames && priceDogNames[n]) || "").trim();
    if (name) return name;
    return "Собака " + n;
  }
  function getPricePpCoef() { return _coef; }
  function getPriceFracRates() { return _fracRates; }
  function subDetailSchemeValue_() { return _scheme; }
  function subDetailBasketPayload_() { return _list; }
  function rememberPpCostFact_(fact) { _lastPpCostFact = fact; return fact; }
  function renderRaw26CleanPair_() { return ""; }
  function hideRaw26CleanPair_() {}
  function applySubDetailFact_(total, hint) { _hint = hint || ""; return total; }

  function useQuote(opts) {
    opts = opts || {};
    _scheme = opts.scheme || "RAW26";
    pricePpScheme = _scheme;
    _coef = Number(opts.coef) || (_scheme === "RAW26" ? PP_RAW26_COEF_DEFAULT : PP_LEGACY_COEF_DEFAULT);
    _list = opts.list || [];
    priceDogCount = Number(opts.dogCount) === 2 ? 2 : 1;
    priceDogNames = opts.dogNames || { 1: "", 2: "" };
    if (opts.fracRates) _fracRates = opts.fracRates;
  }

${body}

  function quotePp(opts) {
    useQuote(opts);
    var packs = opts.packagesByn;
    if (packs == null && opts.packCounts) packs = packagesBynFromUCountsLocal_(opts.packCounts);
    var frac = opts.fracTotal;
    if (frac == null) frac = calcDressuraFractionMarkup(opts.list || [], opts.fracRates || _fracRates).total;
    var total = applyLocalPpFact_(opts.costSum, _coef, opts.deliveriesN, packs || 0, frac || 0, opts.packHint || "", opts.list || []);
    return { total: total, fact: _lastPpCostFact, hint: _hint };
  }

  function offerMessage(opts) {
    useQuote(opts);
    var scheme = String(opts.scheme || _scheme || "").toUpperCase();
    if (scheme === "RETAIL" || opts.mode === "retail") {
      return composeRetailClientMessage(opts.list || [], opts.retailTotal, opts.note || "");
    }
    return composePpClientMessage(opts.list || [], opts.deliveriesN, opts.note || "", opts.retailTotal, opts.subTotal, scheme, opts);
  }

  function setFetchPpCalcPrice(fn) {
    fetchPpCalcPrice_ = fn || (async function () { return null; });
  }

  return {
    PP_SCHEME_CUTOFF_YMD: PP_SCHEME_CUTOFF_YMD,
    PP_RAW26_COEF_DEFAULT: PP_RAW26_COEF_DEFAULT,
    PP_RAW26_RECOVER_100: PP_RAW26_RECOVER_100,
    PP_RAW26_RECOVER_PIECE: PP_RAW26_RECOVER_PIECE,
    PP_RAW26_DELIVERY_PER: PP_RAW26_DELIVERY_PER,
    PP_RAW26_RETAIL_CAP: PP_RAW26_RETAIL_CAP,
    PP_RAW26_RETAIL_FREE_FROM: PP_RAW26_RETAIL_FREE_FROM,
    PP_LEGACY_COEF_DEFAULT: PP_LEGACY_COEF_DEFAULT,
    PP_LEGACY_FIXED: PP_LEGACY_FIXED,
    PP_LEGACY_DELIVERY_PER: PP_LEGACY_DELIVERY_PER,
    PRICE_PACK_UNIT: PRICE_PACK_UNIT,
    PRICE_PICK_MONTH_WEEKS: PRICE_PICK_MONTH_WEEKS,
    PRICE_PICK_MONTH_DELIVERIES: PRICE_PICK_MONTH_DELIVERIES,
    ppOfferClientPrice_: ppOfferClientPrice_,
    ppSheetPrice_: ppSheetPrice_,
    raw26ApiFactPrice_: raw26ApiFactPrice_,
    ppClientDisplayPrice_: ppClientDisplayPrice_,
    applyRaw26RetailCapAlloc_: applyRaw26RetailCapAlloc_,
    capRaw26PriceToRetail_: capRaw26PriceToRetail_,
    raw26RetailCapBase_: raw26RetailCapBase_,
    recoverBynFromBasketLocal_: recoverBynFromBasketLocal_,
    capOfferSubToDisplayedRetail_: capOfferSubToDisplayedRetail_,
    composePpClientMessage: composePpClientMessage,
    monthDeliveriesN_: monthDeliveriesN_,
    raw26ApiFactUsable_: raw26ApiFactUsable_,
    composeRetailClientMessage: composeRetailClientMessage,
    stampPpCoefIntoWishes_: stampPpCoefIntoWishes_,
    stampPpSchemeIntoWishes_: stampPpSchemeIntoWishes_,
    parsePpCoefFromWishes_: parsePpCoefFromWishes_,
    parsePpSchemeFromWishes_: parsePpSchemeFromWishes_,
    stripPpMetaFromWishes_: stripPpMetaFromWishes_,
    defaultPpSchemeForNewLocal_: defaultPpSchemeForNewLocal_,
    packagesBynFromUCountsLocal_: packagesBynFromUCountsLocal_,
    packHintFromU_: packHintFromU_,
    calcDressuraFractionMarkup: calcDressuraFractionMarkup,
    recalcPpCostSum: recalcPpCostSum,
    quotePp: quotePp,
    offerMessage: offerMessage,
    pricePickParseBudget_: pricePickParseBudget_,
    pricePickParseBudgetSeg_: pricePickParseBudgetSeg_,
    parseAnketSignals_: parseAnketSignals_,
    pricePickComposeForTarget_: pricePickComposeForTarget_,
    pricePickOfferText_: pricePickOfferText_,
    pricePickDogProfile_: pricePickDogProfile_,
    pricePickFitBudget_: pricePickFitBudget_,
    pricePickLocalMonthly_: pricePickLocalMonthly_,
    pricePickTrimStep_: pricePickTrimStep_,
    pricePickScaleForBudget_: pricePickScaleForBudget_,
    pricePickDefaultStarter_: pricePickDefaultStarter_,
    priceModeKey: priceModeKey,
    priceModeLabel_: priceModeLabel_,
    raw26OfferCleanByn_: raw26OfferCleanByn_,
    setFetchPpCalcPrice: setFetchPpCalcPrice,
    useQuote: useQuote,
    getPricePpCoef: getPricePpCoef,
    buildAssemblyPacksLocal: buildAssemblyPacksLocal,
    recountPacks: function (list) {
      _list = list || [];
      priceMode = "pp";
      syncPricePacksFromBasket_({ force: true });
      return {
        counts: {
          small: pricePackCounts.small || 0,
          medium: pricePackCounts.medium || 0,
          large: pricePackCounts.large || 0,
          legs: pricePackCounts.legs || 0
        },
        byn: calcPricePacksByn(),
        hint: pricePacksSummary()
      };
    }
  };
});
`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = fs.readFileSync(APP, "utf8");
  const out = buildPriceSource(src);
  const dest = path.join(here, "price-logic.js");
  fs.writeFileSync(dest, out);
  const g = globalThis;
  if (!g.window) g.window = g;
  if (!g.localStorage) {
    const mem = {};
    g.localStorage = {
      getItem(k) { return mem[k] == null ? null : mem[k]; },
      setItem(k, v) { mem[k] = String(v); },
      removeItem(k) { delete mem[k]; }
    };
  }
  const P = require(dest);
  const alloc = P.applyRaw26RetailCapAlloc_(40, 18, 0.56, 4, 50, 30);
  if (Math.abs(alloc.factCost - 50) > 0.001) throw new Error("cap " + JSON.stringify(alloc));
  const msg = P.composePpClientMessage(
    [{ cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", val: 200 }],
    2, "", 80, 70, "RAW26", {}
  );
  if (msg.indexOf("Ваш состав на месяц получается") < 0) throw new Error("offer");
  if (msg.indexOf("Готовы продолжать") < 0) throw new Error("offer end");
  const bud = P.pricePickParseBudget_("Бюджет\nдо 50 руб");
  if (!bud || bud.max !== 50) throw new Error("budget " + JSON.stringify(bud));
  console.log("price-logic.js", out.length, "cap", alloc.factCost, "budget", bud.kind);
}
