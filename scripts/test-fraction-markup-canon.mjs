#!/usr/bin/env node
/**
 * Canon 2026-09-15: ломтики=0 полоски=0 крупное=1 среднее=2 мелкое=3 очень мелкое=4
 * Extracts matchers from Code.gs / worker.js / app.main.js and checks rates + retail keys.
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

const CASES = [
  { sub: "Ломтики", rate: 0 },
  { sub: "ломтики", rate: 0 },
  { sub: "Целое", rate: 0 },
  { sub: "Полоски", rate: 0 },
  { sub: "кусочки", rate: 0 },
  { sub: "Крупное", rate: 1 },
  { sub: "Большое", rate: 1 },
  { sub: "Среднее", rate: 2 },
  { sub: "Мелкое", rate: 3 },
  { sub: "мелкие кусочки", rate: 3 },
  { sub: "Очень мелкое", rate: 4 },
  { sub: "Крошка", rate: 0, skip: true }
];

function runMarkupSuite(fn, label) {
  const log = [];
  for (const c of CASES) {
    const got = fn([line("ЛЁГКОЕ", c.sub, 100, "dressura")]);
    if (c.skip) {
      assert(got === 0, label + " крошка must stay 0 (untouched), got " + got);
      log.push(c.sub + " → skip/0");
      continue;
    }
    assert(got === c.rate, label + " " + c.sub + " 100г → " + c.rate + ", got " + got);
    log.push(c.sub + " → " + got);
  }
  const two = fn([line("ЛЁГКОЕ", "Полоски", 200, "dressura")]);
  assert(two === 0, label + " 200г полоски → 0, got " + two);
  const other = fn([line("БАРАНЬЯ ПЕЧЕНЬ", "Мелкое", 100, "other")]);
  assert(other === 3, label + " баранья печень мелкое (other) → 3, got " + other);
  const turkey = fn([line("ИНДЕЙКА", "Полоски", 100, "other")]);
  assert(turkey === 0, label + " индейка полоски → 0, got " + turkey);
  const chew = fn([line("ТРАХЕЯ", "СРЕД", 2, "chew")]);
  assert(chew === 0, label + " жевалка не в наценке, got " + chew);
  return log;
}

function assertRetailKey(lookupFn, name, sub, expectSub, label) {
  const meta = lookupFn(name, sub);
  const got = (meta && meta.sub) || "";
  assert(got === expectSub, label + " " + name + "|" + sub + " → " + expectSub + ", got " + got);
}

function assertRetailTable(priceSrc, label) {
  const expect = {
    '"ЛЁГКОЕ|Ломтики": { per100: 9 }': true,
    '"ЛЁГКОЕ|Полоски": { per100: 9 }': true,
    '"ЛЁГКОЕ|Крупное": { per100: 10 }': true,
    '"ЛЁГКОЕ|Среднее": { per100: 11 }': true,
    '"ЛЁГКОЕ|Мелкое": { per100: 12 }': true,
    '"ЛЁГКОЕ|Очень мелкое": { per100: 13 }': true,
    '"СЕРДЦЕ|Полоски": { per100: 12 }': true,
    '"СЕРДЦЕ|Мелкое": { per100: 15 }': true,
    '"ПОЧКИ|Мелкое": { per100: 14 }': true,
    '"РУБЕЦ Т|Полоски": { per100: 10 }': true,
    '"РУБЕЦ Т|Среднее": { per100: 12 }': true,
    '"БАРАНЬЕ ЛЁГКОЕ|Полоски": { per100: 16 }': true,
    '"БАРАНЬЕ ЛЁГКОЕ|Среднее": { per100: 18 }': true,
    '"ИНДЕЙКА|Полоски": { per100: 18 }': true,
    '"ИНДЕЙКА|Мелкое": { per100: 21 }': true,
    '"БАРАНЬЯ ПЕЧЕНЬ|Полоски": { per100: 16 }': true,
    '"БАРАНЬЯ ПЕЧЕНЬ|Мелкое": { per100: 19 }': true,
    '"КРОШКА ЛЁГКОГО": { per100: 11 }': true,
    '"КРОШКА ПОЧЕК": { per100: 11 }': true,
    '"КРОШКА РУБЕЦ": { per100: 12 }': true
  };
  for (const needle of Object.keys(expect)) {
    assert(priceSrc.includes(needle), label + " missing " + needle);
  }
  assert(!priceSrc.includes('"ЛЁГКОЕ|Полоски": { per100: 10 }'), label + " stale полоски 10");
  assert(!priceSrc.includes('"ЛЁГКОЕ|Среднее": { per100: 12 }'), label + " stale среднее 12");
}

/* ---------- Code.gs ---------- */
const gsSrc = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
const gsCtx = vm.createContext({
  Math: Math,
  Number: Number,
  String: String,
  isFinite: isFinite,
  Object: Object
});
vm.runInContext(
  [
    extractVarObject(gsSrc, "DRESSURA_FRAC_RATES_DEFAULT_"),
    extractFn(gsSrc, "dressuraFractionSizeKey_"),
    extractFn(gsSrc, "dressuraFractionPickRate_"),
    extractFn(gsSrc, "dressuraFractionRates_"),
    extractFn(gsSrc, "dressuraFractionMarkupFromBasket_"),
    extractFn(gsSrc, "retailNormalizeSub_"),
    extractFn(gsSrc, "retailNormalizeName_"),
    extractFn(gsSrc, "retailDefaultSub_"),
    extractFn(gsSrc, "retailLookupKeyGs_")
  ].join("\n"),
  gsCtx
);

const gsLog = runMarkupSuite(gsCtx.dressuraFractionMarkupFromBasket_, "Code.gs");
assertRetailKey(gsCtx.retailLookupKeyGs_, "ЛЁГКОЕ", "Ломтики", "Ломтики", "Code.gs lookup");
assertRetailKey(gsCtx.retailLookupKeyGs_, "ЛЁГКОЕ", "Целое", "Ломтики", "Code.gs lookup");
assertRetailKey(gsCtx.retailLookupKeyGs_, "ЛЁГКОЕ", "Полоски", "Полоски", "Code.gs lookup");
assertRetailKey(gsCtx.retailLookupKeyGs_, "ЛЁГКОЕ", "Большое", "Крупное", "Code.gs lookup");
assertRetailKey(gsCtx.retailLookupKeyGs_, "ИНДЕЙКА", "Кусочки", "Полоски", "Code.gs lookup");
assertRetailKey(gsCtx.retailLookupKeyGs_, "ИНДЕЙКА", "Мелкие кусочки", "Мелкое", "Code.gs lookup");
assertRetailKey(gsCtx.retailLookupKeyGs_, "БАРАНЬЯ ПЕЧЕНЬ", "ломтики", "Ломтики", "Code.gs lookup");
assert(/ЛОМТИКИ/.test(extractFn(gsSrc, "normalizeFraction")), "normalizeFraction keeps ЛОМТИКИ");
assert(/ПОЛОСКИ/.test(extractFn(gsSrc, "normalizeFraction")), "normalizeFraction keeps ПОЛОСКИ");
assert(/КУСОЧК/.test(extractFn(gsSrc, "normalizeFraction")), "normalizeFraction maps кусочки");
assert(gsSrc.includes("strips: 0"), "Code.gs strips default 0");
assert(gsSrc.includes("extraSmall: 4"), "Code.gs extraSmall default 4");

const priceObj = extractVarObject(gsSrc, "RETAIL_PRICE_BYN_");
assertRetailTable(priceObj, "Code.gs RETAIL_PRICE_BYN_");

/* ---------- Worker ---------- */
const wSrc = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
const wCtx = vm.createContext({
  Math: Math,
  Number: Number,
  String: String,
  isFinite: isFinite,
  Object: Object
});
vm.runInContext(
  [
    extractVarObject(wSrc, "DRESSURA_FRAC_RATES_DEFAULT_D1_").replace(/^const /, "var "),
    extractFn(wSrc, "dressuraFractionSizeKeyD1_"),
    extractFn(wSrc, "dressuraFractionPickRateD1_"),
    extractFn(wSrc, "dressuraFractionRatesD1_"),
    extractFn(wSrc, "dressuraFractionMarkupFromBasketD1_"),
    extractFn(wSrc, "retailNormalizeSubD1_"),
    extractFn(wSrc, "retailDefaultSubD1_"),
    extractFn(wSrc, "retailNormalizeNameD1_"),
    extractFn(wSrc, "retailLookupKeyD1_")
  ].join("\n"),
  wCtx
);
const wLog = runMarkupSuite(wCtx.dressuraFractionMarkupFromBasketD1_, "worker");
assertRetailKey(wCtx.retailLookupKeyD1_, "ЛЁГКОЕ", "Очень мелкое", "Очень мелкое", "worker lookup");
assertRetailKey(wCtx.retailLookupKeyD1_, "ЛЁГКОЕ", "полоски", "Полоски", "worker lookup");
assertRetailKey(wCtx.retailLookupKeyD1_, "СЕРДЦЕ", "целое", "Ломтики", "worker lookup");
assert(wSrc.includes("strips: 0"), "worker strips default 0");
assert(wSrc.includes("extraSmall: 4"), "worker extraSmall default 4");

/* ---------- Mini App ---------- */
const uiSrc = fs.readFileSync(path.join(root, "boinya-c/app.main.js"), "utf8");
assert(uiSrc.includes('"ЛЁГКОЕ": ["Ломтики", "Полоски", "Крупное", "Среднее", "Мелкое", "Очень мелкое"]'), "catalog лёгкое");
assert(uiSrc.includes('"БАРАНЬЕ ЛЁГКОЕ": ["Ломтики", "Полоски", "Крупное", "Среднее", "Мелкое", "Очень мелкое"]'), "catalog баранье");
assert(uiSrc.includes('"БАРАНЬЯ ПЕЧЕНЬ": ["Ломтики", "Полоски", "Мелкое"]'), "catalog баранья печень");
assert(uiSrc.includes('"ИНДЕЙКА": ["Ломтики", "Полоски", "Мелкое"]'), "catalog индейка");
assert(!/"ЛЁГКОЕ": \[[^\]]*Целое/.test(uiSrc), "лёгкое без целое");
assert(uiSrc.includes('"ЛЁГКОЕ|Ломтики"'), "UI RETAIL_PRICE ломтики");
assertRetailTable(extractVarObject(uiSrc, "RETAIL_PRICE"), "app.main.js RETAIL_PRICE");

const uiCtx = vm.createContext({
  Math: Math,
  Number: Number,
  String: String,
  isFinite: isFinite,
  Object: Object,
  document: { getElementById: function () { return null; } },
  prettyProductName: function (n) { return n; },
  humanFraction: function (m, s) { return s; }
});
vm.runInContext(
  [
    extractFn(uiSrc, "dressuraFractionSizeKey"),
    extractFn(uiSrc, "dressuraFractionPickRate"),
    extractFn(uiSrc, "dressuraFractionRates"),
    extractFn(uiSrc, "calcDressuraFractionMarkup"),
    extractFn(uiSrc, "retailLookupKey_")
  ].join("\n"),
  uiCtx
);
const uiLog = runMarkupSuite(function (basket) {
  return uiCtx.calcDressuraFractionMarkup(basket, {}).total;
}, "app.main.js");
assertRetailKey(uiCtx.retailLookupKey_, "ЛЁГКОЕ", "Ломтики", "Ломтики", "UI lookup");
assertRetailKey(uiCtx.retailLookupKey_, "ЛЁГКОЕ", "Полоски", "Полоски", "UI lookup");
assertRetailKey(uiCtx.retailLookupKey_, "ЛЁГКОЕ", "Очень мелкое", "Очень мелкое", "UI lookup");
assertRetailKey(uiCtx.retailLookupKey_, "ИНДЕЙКА", "Кусочки", "Полоски", "UI lookup");

assert(!/orderType !== "retail"/.test(extractFn(uiSrc, "catalogFractionsForUi_")),
  "catalogFractionsForUi_ must not filter by retail price keys");
assert(uiSrc.includes("fillMissingRetailFractionPrices_"), "live-прайс дописывает недостающие ключи");

const EXPECT_FR = {
  "ЛЁГКОЕ": ["Ломтики", "Полоски", "Крупное", "Среднее", "Мелкое", "Очень мелкое", "Крошка"],
  "СЕРДЦЕ": ["Ломтики", "Полоски", "Мелкое", "Очень мелкое", "Крошка"],
  "РУБЕЦ Т": ["Ломтики", "Полоски", "Крупное", "Среднее", "Мелкое", "Очень мелкое", "Крошка"],
  "БАРАНЬЕ ЛЁГКОЕ": ["Ломтики", "Полоски", "Крупное", "Среднее", "Мелкое", "Очень мелкое", "Крошка"],
  "ПОЧКИ": ["Ломтики", "Мелкое", "Очень мелкое", "Крошка"],
  "ИНДЕЙКА": ["Ломтики", "Полоски", "Мелкое", "Крошка"],
  "БАРАНЬЯ ПЕЧЕНЬ": ["Ломтики", "Полоски", "Мелкое", "Крошка"],
  "ПЕЧЕНЬ": ["Крошка"],
  "ВЫМЯ": ["Крошка"],
  "СЕМЕННИКИ": ["Крошка"],
  "МЯСНЫЕ ЛОМТИКИ": ["Крошка"]
};

const retailUiCtx = vm.createContext({
  Math: Math,
  Number: Number,
  String: String,
  isFinite: isFinite,
  Object: Object,
  orderType: "retail"
});
vm.runInContext(
  [
    'var CRUMB_FRAC_LABEL_ = "Крошка";',
    extractVarObject(uiSrc, "catalog").replace(/^const /, "var "),
    extractFn(uiSrc, "catalogFractionsForUi_"),
    extractVarObject(uiSrc, "RETAIL_PRICE"),
    "var RETAIL_PRICE_BUILTIN_ = {}; Object.keys(RETAIL_PRICE).forEach(function (k) { RETAIL_PRICE_BUILTIN_[k] = Object.assign({}, RETAIL_PRICE[k]); });",
    extractFn(uiSrc, "retailLookupKey_"),
    extractFn(uiSrc, "retailDefaultSub_"),
    extractFn(uiSrc, "retailBasePer100_"),
    extractFn(uiSrc, "retailAliasPriceKeys_"),
    extractFn(uiSrc, "dressuraFractionSizeKey"),
    extractFn(uiSrc, "dressuraFractionPickRate"),
    extractFn(uiSrc, "dressuraFractionRates"),
    extractFn(uiSrc, "retailLineCost"),
    extractFn(uiSrc, "stripBareRetailParentsMap_"),
    extractFn(uiSrc, "fillMissingRetailFractionPrices_"),
    extractFn(uiSrc, "applyRetailPriceMapToUi_")
  ].join("\n"),
  retailUiCtx
);

const staleLight = {
  "ЛЁГКОЕ|Среднее": { per100: 11 },
  "ЛЁГКОЕ|Мелкое": { per100: 12 },
  "ЛЁГКОЕ|Целое": { per100: 9 }
};
Object.keys(retailUiCtx.RETAIL_PRICE).forEach(function (k) { delete retailUiCtx.RETAIL_PRICE[k]; });
Object.keys(staleLight).forEach(function (k) { retailUiCtx.RETAIL_PRICE[k] = staleLight[k]; });

const lightFr = retailUiCtx.catalogFractionsForUi_("dressura", "ЛЁГКОЕ");
assert(JSON.stringify(lightFr) === JSON.stringify(EXPECT_FR["ЛЁГКОЕ"]),
  "retail ЛЁГКОЕ fractions, got " + JSON.stringify(lightFr));

for (const [name, want] of Object.entries(EXPECT_FR)) {
  const cat = ["ИНДЕЙКА", "БАРАНЬЯ ПЕЧЕНЬ", "ПЕЧЕНЬ", "ВЫМЯ", "СЕМЕННИКИ", "МЯСНЫЕ ЛОМТИКИ"].indexOf(name) >= 0
    ? "other" : "dressura";
  const got = retailUiCtx.catalogFractionsForUi_(cat, name);
  assert(JSON.stringify(got) === JSON.stringify(want),
    "retail " + name + " → " + want.join("/") + ", got " + got.join("/"));
}

const chewFr = retailUiCtx.catalogFractionsForUi_("chew", "БЫЧИЙ КОРЕНЬ");
assert(chewFr.indexOf("Крошка") < 0, "жевалки без крошки");
assert(chewFr.indexOf("ОЧ МАЛ") >= 0 && chewFr.indexOf("ОГР") >= 0, "корень полный набор");

retailUiCtx.applyRetailPriceMapToUi_([
  { key: "ЛЁГКОЕ|Среднее", kind: "per100", price: 11 },
  { key: "ЛЁГКОЕ|Мелкое", kind: "per100", price: 12 },
  { key: "ЛЁГКОЕ|Целое", kind: "per100", price: 9 }
], null);
assert(retailUiCtx.RETAIL_PRICE["ЛЁГКОЕ|Ломтики"] && retailUiCtx.RETAIL_PRICE["ЛЁГКОЕ|Ломтики"].per100 === 9,
  "fill ломтики = base 9");
assert(retailUiCtx.RETAIL_PRICE["ЛЁГКОЕ|Полоски"] && retailUiCtx.RETAIL_PRICE["ЛЁГКОЕ|Полоски"].per100 === 9,
  "fill полоски = 9");
assert(retailUiCtx.RETAIL_PRICE["ЛЁГКОЕ|Крупное"] && retailUiCtx.RETAIL_PRICE["ЛЁГКОЕ|Крупное"].per100 === 10,
  "fill крупное = 10");
assert(retailUiCtx.RETAIL_PRICE["ЛЁГКОЕ|Очень мелкое"] && retailUiCtx.RETAIL_PRICE["ЛЁГКОЕ|Очень мелкое"].per100 === 13,
  "fill очень мелкое = 13");
assert(retailUiCtx.RETAIL_PRICE["КРОШКА ЛЁГКОГО"] && retailUiCtx.RETAIL_PRICE["КРОШКА ЛЁГКОГО"].per100 === 11,
  "крошка лёгкого untouched 11");

const priceSlices = retailUiCtx.retailLineCost("ЛЁГКОЕ", "Ломтики", 100, "dressura");
assert(priceSlices.found && priceSlices.cost === 9, "retail ломтики 100г = 9, got " + JSON.stringify(priceSlices));
const priceStrips = retailUiCtx.retailLineCost("ЛЁГКОЕ", "Полоски", 100, "dressura");
assert(priceStrips.found && priceStrips.cost === 9, "retail полоски 100г = 9, got " + JSON.stringify(priceStrips));
const priceMed = retailUiCtx.retailLineCost("ЛЁГКОЕ", "Среднее", 100, "dressura");
assert(priceMed.found && priceMed.cost === 11, "retail среднее 100г = 11, got " + JSON.stringify(priceMed));
const priceXs = retailUiCtx.retailLineCost("ЛЁГКОЕ", "Очень мелкое", 100, "dressura");
assert(priceXs.found && priceXs.cost === 13, "retail очень мелкое 100г = 13, got " + JSON.stringify(priceXs));

const htmlSrc = fs.readFileSync(path.join(root, "boinya-c/app.html"), "utf8");
assert(/id="priceFracStrips" value="0"/.test(htmlSrc), "HTML priceFracStrips default 0");
assert(/id="priceFracLarge" value="1"/.test(htmlSrc), "HTML priceFracLarge default 1");
assert(/id="priceFracMedium" value="2"/.test(htmlSrc), "HTML priceFracMedium default 2");
assert(/id="priceFracSmall" value="3"/.test(htmlSrc), "HTML priceFracSmall default 3");
assert(/id="priceFracExtraSmall" value="4"/.test(htmlSrc), "HTML priceFracExtraSmall default 4");
assert(/id="subDetailFracStrips" value="0"/.test(htmlSrc), "HTML subDetailFracStrips default 0");

const retailList = Object.entries(EXPECT_FR).map(function ([name, fr]) {
  return name + ": " + fr.join(", ");
});

console.log("fraction-markup-canon OK");
console.log("100г ставки:", gsLog.join(" · "));
console.log("layers: Code.gs / worker / app.main.js match");
console.log("лёгкое среднее: retail 11 / PP markup 2");
console.log("retail UI fractions:");
retailList.forEach(function (line) { console.log("  " + line); });
