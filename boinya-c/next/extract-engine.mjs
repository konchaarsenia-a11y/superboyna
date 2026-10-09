/**
 * Вырезает функции расчёта заказа из boinya-c/app.main.js без правок исходника.
 * Источник истины — app.main.js. Этот файл только читает его и собирает order-engine.js.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "../app.main.js");

const FUNCS = [
  "isPieceSkuName",
  "unitForItem",
  "stripBareRetailParentsMap_",
  "retailDefaultSub_",
  "retailLookupKey_",
  "retailBasePer100_",
  "retailAliasPriceKeys_",
  "retailSkuLineCost_",
  "isCrumbBasketItemUi_",
  "isRetailCrumbItem_",
  "retailLineCost",
  "crumbParentFromName_",
  "isCrumbFraction_",
  "calcRetailBasketTotal",
  "fillMissingRetailFractionPrices_",
  "applyRetailPriceMapToUi_",
  "catalogItemsForUi_",
  "catalogNativeFractions_",
  "catalogFracRequired_",
  "catalogFractionsForUi_",
  "dressuraFractionSizeKey",
  "dressuraFractionPickRate",
  "dressuraFractionRates",
  "crumbKindCategoryLabel_",
  "crumbKindTitle_",
  "isChewProductName_",
  "isChewCrumbSource_",
  "crumbSourceNames_",
  "crumbSourcesLabel_",
  "crumbBasketDisplayMain_",
  "crumbBasketSubLabel_",
  "applyCrumbBasketNames_",
  "crumbKindRateUi_",
  "crumbRetailKindOfNameUi_",
  "retailGoodsFromCrumbItemUi_",
  "catalogAliasNameUi_",
  "serializeBasketItem_",
  "igAliasResolve",
  "canonicalProductMain_",
  "buildIgKnownMap",
  "cleanChecklistLine_",
  "peelInlineChecklistFrac_",
  "normalizeChecklistRaw_",
  "isBareCategoryHeader_",
  "parseIgLinesToItems",
  "prettyProductName",
  "humanFraction",
  "mapApiBasketToLocal",
  "crumbSourcePool_",
  "parseDeliveryAddress",
  "composeDeliveryAddress",
  "formatStreetHouse",
  "parseLatLonFromText_",
  "orderLatLonPair_",
  "looksLikeOtherCity",
  "haversineKm",
  "sanitizeNoteItemKey_",
  "serializeOrderNotes",
  "parseOrderNotes",
  "stripDeliveryTags",
  "stripOfficeTag",
  "applyOfficeTag",
  "applyDeliveryTag",
  "peelServiceCoords_",
  "stripGeoTags",
  "orderTypeToSegment_",
  "segmentToOrderType_",
  "scoreClientNick",
  "syncOrderBasketFromActive_",
  "orderSaveUsesTwoDogs_",
  "buildOrderSaveBasket_",
  "currentPpSlotPayload_"
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
  const re = new RegExp("\\n    function " + name + "\\s*\\(");
  const m = re.exec(src);
  if (!m) throw new Error("нет функции " + name);
  const start = m.index + 1;
  const brace = src.indexOf("{", start);
  const end = endOfBlock(src, brace);
  return src.slice(start, end + 1);
}

function extractDecl(src, startRe) {
  const m = startRe.exec(src);
  if (!m) throw new Error("нет объявления " + startRe);
  const start = m.index + 1;
  const brace = src.indexOf("{", start);
  const end = endOfBlock(src, brace);
  let stop = end + 1;
  if (src[stop] === ";") stop++;
  return src.slice(start, stop);
}

export function buildEngineSource(appSrc) {
  const chunks = [];
  chunks.push(extractDecl(appSrc, /\n    var CRUMB_FRAC_LABEL_ = /));
  chunks.push(extractDecl(appSrc, /\n    var CATALOG_CRUMB_PARENTS_ = /));
  chunks.push(extractDecl(appSrc, /\n    const catalog = /));
  chunks.push(extractDecl(appSrc, /\n    var RETAIL_REMOVED_NAMES = /));
  chunks.push("    var PRICE_RETAIL_DELIVERY_BYN = 9;\n    var PRICE_RETAIL_FREE_FROM = 80;");
  chunks.push(extractDecl(appSrc, /\n    var RETAIL_PRICE = /));
  chunks.push(
    "    var RETAIL_PRICE_BUILTIN_ = {};\n" +
    "    Object.keys(RETAIL_PRICE).forEach(function (k) {\n" +
    "      RETAIL_PRICE_BUILTIN_[k] = Object.assign({}, RETAIL_PRICE[k]);\n" +
    "    });"
  );
  FUNCS.forEach(function (name) {
    chunks.push(extractFunction(appSrc, name));
  });

  const body = chunks.join("\n\n");
  return `/* Бойня next — расчёт заказа 1:1 из boinya-c/app.main.js.
   Не править вручную: node boinya-c/next/extract-engine.mjs
   Цифры и сериализация корзины те же, что в старой форме. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoinyaOrderEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var window = (typeof globalThis !== "undefined" && globalThis.window) ? globalThis.window : globalThis;
  var orderType = "pp";
  var basket = [];
  var orderBaskets = { 1: [], 2: [] };
  var orderActiveDog = 1;
  var orderDogCount = 1;
  var orderNotes = [];
  var ppDeliverySlotManual = null;
  var ppDeliveriesN = 0;
  var ppNeedManualSlot = false;
  var retailPaidDelivery = false;
  var retailPriceManual = false;

${body}

  function applyState(s) {
    s = s || {};
    orderType = s.orderType || "pp";
    orderDogCount = Number(s.dogCount) === 2 ? 2 : 1;
    orderActiveDog = Number(s.activeDog) === 2 ? 2 : 1;
    var b1 = (s.baskets && s.baskets[1]) ? s.baskets[1] : (s.basket || []);
    var b2 = (s.baskets && s.baskets[2]) ? s.baskets[2] : [];
    orderBaskets = { 1: b1.slice(), 2: b2.slice() };
    if (orderDogCount < 2) orderBaskets[2] = b2.slice();
    basket = (orderBaskets[orderActiveDog] || []).slice();
    orderNotes = Array.isArray(s.notes) ? s.notes : [];
    ppDeliverySlotManual = (s.ppSlotManual === 1 || s.ppSlotManual === 2) ? s.ppSlotManual : null;
    ppDeliveriesN = Number(s.deliveriesN) || 0;
    ppNeedManualSlot = !!s.needManualSlot;
    retailPaidDelivery = !!s.retailPaidDelivery;
    retailPriceManual = !!s.retailPriceManual;
    if (s.retailDeliveryFee != null && isFinite(Number(s.retailDeliveryFee))) PRICE_RETAIL_DELIVERY_BYN = Number(s.retailDeliveryFee);
    if (s.retailFreeFrom != null && isFinite(Number(s.retailFreeFrom))) PRICE_RETAIL_FREE_FROM = Number(s.retailFreeFrom);
  }

  function retailQuote(list, paid) {
    var local = calcRetailBasketTotal(list || [], { deliveriesN: 1, applyDelivery: false });
    if (paid && local.goods > 0) {
      local.delivery = PRICE_RETAIL_DELIVERY_BYN;
      local.deliveryTimes = 1;
      local.total = Math.round((local.goods + local.delivery) * 100) / 100;
      local.paidDeliveryForced = true;
    }
    return local;
  }

  return {
    applyState: applyState,
    retailQuote: retailQuote,
    catalog: catalog,
    calcRetailBasketTotal: calcRetailBasketTotal,
    applyRetailPriceMapToUi_: applyRetailPriceMapToUi_,
    retailLineCost: retailLineCost,
    buildOrderSaveBasket_: buildOrderSaveBasket_,
    serializeBasketItem_: serializeBasketItem_,
    serializeOrderNotes: serializeOrderNotes,
    parseOrderNotes: parseOrderNotes,
    composeDeliveryAddress: composeDeliveryAddress,
    formatStreetHouse: formatStreetHouse,
    parseDeliveryAddress: parseDeliveryAddress,
    parseLatLonFromText_: parseLatLonFromText_,
    orderTypeToSegment_: orderTypeToSegment_,
    currentPpSlotPayload_: currentPpSlotPayload_,
    applyDeliveryTag: applyDeliveryTag,
    applyOfficeTag: applyOfficeTag,
    stripDeliveryTags: stripDeliveryTags,
    stripOfficeTag: stripOfficeTag,
    stripGeoTags: stripGeoTags,
    looksLikeOtherCity: looksLikeOtherCity,
    haversineKm: haversineKm,
    parseIgLinesToItems: parseIgLinesToItems,
    mapApiBasketToLocal: mapApiBasketToLocal,
    catalogItemsForUi_: catalogItemsForUi_,
    catalogFractionsForUi_: catalogFractionsForUi_,
    catalogFracRequired_: catalogFracRequired_,
    unitForItem: unitForItem,
    prettyProductName: prettyProductName,
    humanFraction: humanFraction,
    crumbSourceNames_: crumbSourceNames_,
    isPieceSkuName: isPieceSkuName,
    buildIgKnownMap: buildIgKnownMap,
    igAliasResolve: igAliasResolve,
    dressuraFractionSizeKey: dressuraFractionSizeKey,
    dressuraFractionPickRate: dressuraFractionPickRate,
    dressuraFractionRates: dressuraFractionRates,
    crumbSourcePool_: crumbSourcePool_,
    isChewProductName_: isChewProductName_,
    isChewCrumbSource_: isChewCrumbSource_,
    scoreClientNick: scoreClientNick,
    isCrumbBasketItemUi_: isCrumbBasketItemUi_,
    crumbBasketDisplayMain_: crumbBasketDisplayMain_,
    crumbBasketSubLabel_: crumbBasketSubLabel_,
    PRICE_RETAIL_DELIVERY_BYN: function () { return PRICE_RETAIL_DELIVERY_BYN; },
    PRICE_RETAIL_FREE_FROM: function () { return PRICE_RETAIL_FREE_FROM; },
    MINSK_CENTER: { lat: 53.9023, lon: 27.5619 },
    MINSK_RADIUS_KM: 20
  };
});
`;
}

export function loadFreshEngine(appSrc) {
  const src = appSrc || fs.readFileSync(APP, "utf8");
  const code = buildEngineSource(src);
  const fn = new Function("module", "exports", "globalThis", code + "\nreturn module.exports;");
  const module = { exports: {} };
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  if (!g.window) g.window = g;
  return fn(module, module.exports, g);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = fs.readFileSync(APP, "utf8");
  const out = buildEngineSource(src);
  const dest = path.join(here, "order-engine.js");
  fs.writeFileSync(dest, out);
  const eng = loadFreshEngine(src);
  const q = eng.calcRetailBasketTotal([
    { name: "ЛЁГКОЕ", sub: "Ломтики", val: 200, cat: "dressura" },
    { name: "ТРАХЕЯ", sub: "СРЕД", val: 3, cat: "chew" }
  ], { deliveriesN: 1, applyDelivery: false });
  if (q.lines[0].cost !== 18 || q.lines[1].cost !== 24) {
    throw new Error("канон розницы не сошёлся: " + JSON.stringify(q));
  }
  console.log("order-engine.js", out.length, "bytes, retail", q.total);
}
