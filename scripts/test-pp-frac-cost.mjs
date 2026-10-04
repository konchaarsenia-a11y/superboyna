#!/usr/bin/env node
/**
 * viihrova: тыква 20 г = 108,89; кабачки (себест. 0) = 106,11.
 * СРЕД/БОЛ листа получают override Среднее/Большое. Нулевая строка кэш не затирает.
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
  let start = src.indexOf("async function " + name + "(");
  if (start < 0) start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing function " + name);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}

function extractVarObject(src, name) {
  const start = src.indexOf("var " + name + " = {");
  if (start < 0) throw new Error("missing object " + name);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1) + ";";
    }
  }
  throw new Error("unclosed object " + name);
}

const gsSrc = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
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
  PP_RAW26_RETAIL_FREE_FROM_: 80,
  STATS_DELIVERY_FUEL_PER_: 4,
  PP_LEGACY_COEF_DEFAULT_: 2.3,
  PP_LEGACY_FIXED_: 11,
  PP_LEGACY_DELIVERY_PER_: 6,
  isPieceSkuName_: function () { return false; }
});
vm.runInContext(
  [
    extractVarObject(gsSrc, "PP_RAW_COST_OVERRIDE_BYN_"),
    extractVarObject(gsSrc, "DRESSURA_FRAC_RATES_DEFAULT_"),
    extractFn(gsSrc, "ppCostFractionAliases_"),
    extractFn(gsSrc, "writePpRawCost_"),
    extractFn(gsSrc, "applyPpRawCostOverrides_"),
    extractFn(gsSrc, "lookupPpCostInfoGs_"),
    extractFn(gsSrc, "crumbKindRateGs_"),
    extractFn(gsSrc, "isGramCrumbLineGs_"),
    extractFn(gsSrc, "ppLineFromBasketItemGs_"),
    extractFn(gsSrc, "dressuraFractionSizeKey_"),
    extractFn(gsSrc, "dressuraFractionPickRate_"),
    extractFn(gsSrc, "dressuraFractionRates_"),
    extractFn(gsSrc, "dressuraFractionMarkupFromBasket_"),
    extractFn(gsSrc, "packagesBynFromUCounts_"),
    extractFn(gsSrc, "normalizePpScheme_"),
    extractFn(gsSrc, "recoverBynFromPpLines_"),
    extractFn(gsSrc, "ppOfferClientPrice_"),
    extractFn(gsSrc, "formatClientMessagePrice_"),
    extractFn(gsSrc, "statedTouchedFlag_"),
    extractFn(gsSrc, "ppClientDisplayPrice_"),
    extractFn(gsSrc, "applyClientPricePlaceholders_"),
    extractFn(gsSrc, "attachPpOfferClientPrice_"),
    extractFn(gsSrc, "raw26OfferCleanByn_"),
    extractFn(gsSrc, "raw26RetailCapBase_"),
    extractFn(gsSrc, "applyRaw26RetailCapAlloc_"),
    extractFn(gsSrc, "monthDeliveriesN_"),
    extractFn(gsSrc, "computePpFactFromCost_")
  ].join("\n"),
  gsCtx
);

function sheetRow(name, sub, price, piece) {
  return {
    name: name,
    sub: sub,
    per100: price,
    unitPrice: price,
    grams: !piece,
    piece: !!piece,
    cat: piece ? "chew" : ""
  };
}

const sheet = {
  "БЫЧИЙ КОРЕНЬ / СРЕД": sheetRow("БЫЧИЙ КОРЕНЬ", "СРЕД", 2.5, true),
  "БЫЧИЙ КОРЕНЬ / БОЛ": sheetRow("БЫЧИЙ КОРЕНЬ", "БОЛ", 4, true),
  "ТРАХЕЯ / СРЕД": sheetRow("ТРАХЕЯ", "СРЕД", 1.2, true),
  "ТРАХЕЯ / БОЛ": sheetRow("ТРАХЕЯ", "БОЛ", 3.5, true),
  "СТАНОВАЯ ЖИЛА / СРЕД": sheetRow("СТАНОВАЯ ЖИЛА", "СРЕД", 0.5, true),
  "СТАНОВАЯ ЖИЛА / БОЛ": sheetRow("СТАНОВАЯ ЖИЛА", "БОЛ", 1, true)
};
gsCtx.applyPpRawCostOverrides_(sheet);

function unit(key) {
  return sheet[key] && sheet[key].unitPrice;
}

assert(unit("БЫЧИЙ КОРЕНЬ / СРЕД") === 1.91, "корень СРЕД " + unit("БЫЧИЙ КОРЕНЬ / СРЕД"));
assert(unit("БЫЧИЙ КОРЕНЬ / БОЛ") === 3.83, "корень БОЛ " + unit("БЫЧИЙ КОРЕНЬ / БОЛ"));
assert(unit("ТРАХЕЯ / СРЕД") === 0.88, "трахея СРЕД " + unit("ТРАХЕЯ / СРЕД"));
assert(unit("ТРАХЕЯ / БОЛ") === 1.75, "трахея БОЛ " + unit("ТРАХЕЯ / БОЛ"));
assert(unit("СТАНОВАЯ ЖИЛА / СРЕД") === 0.38, "жила СРЕД " + unit("СТАНОВАЯ ЖИЛА / СРЕД"));
assert(unit("СТАНОВАЯ ЖИЛА / БОЛ") === 0.75, "жила БОЛ " + unit("СТАНОВАЯ ЖИЛА / БОЛ"));
assert(gsCtx.PP_RAW_COST_OVERRIDE_BYN_["ТРАХЕЯ / Большое"].v === 1.75, "override трахеи не менялся");
assert(gsCtx.PP_RAW_COST_OVERRIDE_BYN_["БЫЧИЙ КОРЕНЬ / Среднее"].v === 1.91, "override корня не менялся");
assert(gsCtx.PP_RAW_COST_OVERRIDE_BYN_["ТРАХЕЯ / ОГР"].v === 3.5, "ОГР трахеи не менялся");
assert(gsCtx.PP_RAW_COST_OVERRIDE_BYN_["ТЫКВА"].v === 5.33, "тыква 5.33");

function viihBasket(veg) {
  return [
    { name: "ЛЁГКОЕ", sub: "Ломтики", val: 300, cat: "dressura" },
    { name: "СЕРДЦЕ", sub: "Мелкое", val: 100, cat: "dressura" },
    { name: "ПОЧКИ", sub: "Мелкое", val: 100, cat: "dressura" },
    { name: "БЫЧИЙ КОРЕНЬ", sub: "СРЕД", val: 2, cat: "chew" },
    { name: "ТРАХЕЯ", sub: "БОЛ", val: 3, cat: "chew" },
    { name: veg, sub: "", val: 20, cat: "veg" }
  ];
}

function clientPrice(veg) {
  const basket = viihBasket(veg);
  const lines = [];
  let raw = 0;
  for (let i = 0; i < basket.length; i++) {
    const line = gsCtx.ppLineFromBasketItemGs_(basket[i], sheet);
    if (!line) continue;
    raw += line.cost;
    lines.push(line);
  }
  raw = Math.round(raw * 100) / 100;
  const fact = gsCtx.computePpFactFromCost_(
    raw,
    basket,
    2,
    2.6,
    { u1: 0, u2: 0, u3: 0, up4: 0 },
    "RAW26",
    lines,
    0
  );
  return fact.clientPrice;
}

const pumpkin = clientPrice("ТЫКВА");
const zucchini = clientPrice("КАБАЧКИ");
assert(pumpkin === 108.89, "тыква 108.89, got " + pumpkin);
assert(zucchini === 106.11, "кабачки 106.11, got " + zucchini);

const snaps = {};
const wCtx = vm.createContext({
  Math: Math,
  Number: Number,
  String: String,
  isFinite: isFinite,
  Object: Object,
  Array: Array,
  getSnapRaw_: async function (_env, key) {
    return snaps[key] || null;
  },
  putSnap_: async function (_env, key, payload) {
    snaps[key] = payload;
  }
});
vm.runInContext(
  [
    extractFn(wSrc, "ppCostFractionAliasesD1_"),
    extractFn(wSrc, "ppCostUnitD1_"),
    "const PP_COST_CANON_D1_ = \"frac-alias-1\";",
    extractFn(wSrc, "lookupPpCostInfoD1_"),
    extractFn(wSrc, "isCrumbBasketItemD1_"),
    extractFn(wSrc, "crumbKindRateD1_"),
    extractFn(wSrc, "isPieceSkuNameD1_"),
    extractFn(wSrc, "buildPpLinesFromCostsD1_"),
    extractFn(wSrc, "mergePriceCostsPpFromLinesD1_")
  ].join("\n"),
  wCtx
);

const costs = {
  "БЫЧИЙ КОРЕНЬ / СРЕД": { name: "БЫЧИЙ КОРЕНЬ", sub: "СРЕД", unitPrice: 1.91, piece: true },
  "ТРАХЕЯ / БОЛ": { name: "ТРАХЕЯ", sub: "БОЛ", unitPrice: 1.75, piece: true },
  "КАБАЧКИ": { name: "КАБАЧКИ", sub: "", unitPrice: 0, piece: false }
};
const zBasket = viihBasket("КАБАЧКИ").slice(3);
const withZero = wCtx.buildPpLinesFromCostsD1_(zBasket, costs, { zeroKnown: true });
assert(withZero.missing === 0, "кабачки с нулём не missing, got " + withZero.missing);
const legacy = wCtx.buildPpLinesFromCostsD1_(zBasket, costs, {});
assert(legacy.missing > 0, "без флага нуль по-прежнему missing для карточек");

snaps.priceCostsPp = {
  status: "success",
  ppCostCanon: "frac-alias-1",
  costs: {
    "ТРАХЕЯ / БОЛ": { name: "ТРАХЕЯ", sub: "БОЛ", unitPrice: 1.75, piece: true }
  },
  zeroKeys: {}
};
await wCtx.mergePriceCostsPpFromLinesD1_(
  { DB: {} },
  [
    { name: "КАБАЧКИ", unitPrice: 0, per100: 0, piece: false },
    { name: "ТРАХЕЯ", sub: "БОЛ", unitPrice: 0, piece: true },
    { name: "БЫЧИЙ КОРЕНЬ", sub: "СРЕД", unitPrice: 1.91, piece: true }
  ],
  "frac-alias-1"
);
const saved = snaps.priceCostsPp;
assert(saved.costs["ТРАХЕЯ / БОЛ"].unitPrice === 1.75, "ноль не затёр трахею");
assert(!saved.costs["КАБАЧКИ"], "ноль кабачков не записан в costs");
assert(saved.zeroKeys["КАБАЧКИ"] === 1, "кабачки отмечены как известный ноль");
assert(saved.costs["БЫЧИЙ КОРЕНЬ / СРЕД"].unitPrice === 1.91, "корень записан");
assert(saved.ppCostCanon === "frac-alias-1", "канон кэша");

const poisoned = {
  "ТРАХЕЯ / СРЕД": { name: "ТРАХЕЯ", sub: "СРЕД", unitPrice: 1.75, piece: true },
  "БЫЧИЙ КОРЕНЬ / СРЕД": { name: "БЫЧИЙ КОРЕНЬ", sub: "СРЕД", unitPrice: 2.5, piece: true },
  "СТАНОВАЯ ЖИЛА / СРЕД": { name: "СТАНОВАЯ ЖИЛА", sub: "СРЕД", unitPrice: 2.5, piece: true },
  "СТАНОВАЯ ЖИЛА / БОЛ": { name: "СТАНОВАЯ ЖИЛА", sub: "БОЛ", unitPrice: 4, piece: true },
  "ТРАХЕЯ / БОЛ": { name: "ТРАХЕЯ", sub: "БОЛ", unitPrice: 3.5, piece: true }
};
snaps.priceCostsPp = {
  status: "success",
  costs: poisoned,
  zeroKeys: { "КАБАЧКИ": 1, "ТРАХЕЯ / СРЕД": 1 }
};
await wCtx.mergePriceCostsPpFromLinesD1_(
  { DB: {} },
  [{ name: "ТРАХЕЯ", sub: "БОЛ", unitPrice: 1.75, piece: true }],
  "frac-alias-1"
);
const wiped = snaps.priceCostsPp;
assert(wiped.ppCostCanon === "frac-alias-1", "переход ставит canon");
assert(Object.keys(wiped.costs).join(",") === "ТРАХЕЯ / БОЛ", "после перехода только свежая строка, got " + Object.keys(wiped.costs).join(","));
assert(wiped.costs["ТРАХЕЯ / БОЛ"].unitPrice === 1.75, "свежая трахея БОЛ");
assert(!wiped.costs["ТРАХЕЯ / СРЕД"], "отравленная ТРАХЕЯ / СРЕД сброшена");
assert(!wiped.costs["БЫЧИЙ КОРЕНЬ / СРЕД"], "отравленный корень сброшен");
assert(!wiped.costs["СТАНОВАЯ ЖИЛА / СРЕД"] && !wiped.costs["СТАНОВАЯ ЖИЛА / БОЛ"], "становая сброшена");
assert(Object.keys(wiped.zeroKeys).length === 0, "старые zeroKeys не переживают переход");

await wCtx.mergePriceCostsPpFromLinesD1_(
  { DB: {} },
  [{ name: "БЫЧИЙ КОРЕНЬ", sub: "СРЕД", unitPrice: 1.91, piece: true }],
  "frac-alias-1"
);
const appended = snaps.priceCostsPp;
assert(appended.costs["ТРАХЕЯ / БОЛ"].unitPrice === 1.75, "второй merge того же canon не стирает");
assert(appended.costs["БЫЧИЙ КОРЕНЬ / СРЕД"].unitPrice === 1.91, "второй merge дописывает корень");
assert(!appended.costs["СТАНОВАЯ ЖИЛА / СРЕД"], "старая становая не вернулась");

const missingSred = wCtx.buildPpLinesFromCostsD1_(
  [{ name: "ТРАХЕЯ", sub: "СРЕД", val: 1, cat: "chew" }],
  appended.costs,
  {}
);
assert(missingSred.missing > 0, "нет точного ключа → missing, не цена БОЛ");
assert(!(missingSred.lines[0] && missingSred.lines[0].unitPrice > 0), "чужая фракция не подставляется");

const missingZila = wCtx.buildPpLinesFromCostsD1_(
  [{ name: "СТАНОВАЯ ЖИЛА", sub: "СРЕД", val: 1, cat: "chew" }],
  appended.costs,
  { zeroKnown: true, zeroKeys: appended.zeroKeys }
);
assert(missingZila.missing > 0, "дырявый кэш даже с zeroKnown даёт missing → GAS");

const aliasHit = wCtx.buildPpLinesFromCostsD1_(
  [{ name: "ТРАХЕЯ", sub: "СРЕД", val: 1, cat: "chew" }],
  { "ТРАХЕЯ / Среднее": { name: "ТРАХЕЯ", sub: "Среднее", unitPrice: 0.88, piece: true } },
  {}
);
assert(aliasHit.missing === 0 && aliasHit.lines[0].unitPrice === 0.88, "алиас СРЕД=Среднее ещё находится");

const uho = wCtx.lookupPpCostInfoD1_(
  { "УХО Г / Обычное": { name: "УХО Г", sub: "Обычное", unitPrice: 1.1, piece: true } },
  "УХО К",
  "Обычное",
  {}
);
assert(uho && uho.unitPrice === 1.1, "УХО К по-прежнему берёт УХО Г");

snaps.priceCostsPp = {
  status: "success",
  costs: {
    "ТРАХЕЯ / СРЕД": { name: "ТРАХЕЯ", sub: "СРЕД", unitPrice: 1.75, piece: true }
  },
  zeroKeys: {}
};
await wCtx.mergePriceCostsPpFromLinesD1_(
  { DB: {} },
  [{ name: "ТРАХЕЯ", sub: "БОЛ", unitPrice: 1.75, piece: true }],
  ""
);
assert(snaps.priceCostsPp.costs["ТРАХЕЯ / СРЕД"], "ответ без canon старые ключи не стирает");

console.log("pp-frac-cost ok", pumpkin, zucchini);
