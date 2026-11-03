import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { alignRetailItems, HEART_KEY, LIVER_KEY, parseFirstJson } from "./ig-price-align.mjs";
import { setRumenXs, RUMEN_KEY, RUMEN_PRICE } from "./rumen-xs-price.mjs";
import { setFracGrid, GRID } from "./frac-grid-price.mjs";

const engine = {
  prettyProductName(name) { return "PRETTY:" + name; },
  humanFraction(main, sub) { return "ORIG:" + sub; },
  catalogFractionsForUi_(cat, name) {
    if (name === "СЕРДЦЕ") return ["Ломтики", "Полоски", "Крупное", "Мелкое", "Очень мелкое", "Крошка"];
    if (name === "ИНДЕЙКА") return ["Ломтики", "Полоски", "Мелкое"];
    if (name === "РУБЕЦ Т") return ["Ломтики", "Полоски", "Крупное", "Среднее", "Мелкое", "Очень мелкое"];
    if (name === "ПОЧКИ") return ["Ломтики", "Мелкое", "Очень мелкое"];
    if (name === "БАРАНЬЕ ЛЁГКОЕ") return ["Ломтики", "Полоски", "Крупное", "Среднее", "Мелкое", "Очень мелкое"];
    if (name === "ЛЁГКОЕ") return ["Ломтики", "Полоски", "Крупное", "Среднее", "Мелкое", "Очень мелкое"];
    if (name === "ПЕЧЕНЬ" || name === "ВЫМЯ" || name === "СЕМЕННИКИ" || name === "МЯСНЫЕ ЛОМТИКИ") return ["Крошка"];
    return ["Ломтики"];
  },
  applyRetailPriceMapToUi_(items) { engine.saved = items; },
  retailLineCost() { return { cost: 12, per: 12, found: true }; },
  calcRetailBasketTotal(list) {
    return {
      goods: (list || []).length * 9,
      lines: [],
      freeFrom: 80,
      deliveryFee: 9,
      deliveriesN: 1,
      markup: 1,
      sheet: "t"
    };
  }
};

const context = { BoinyaOrderEngine: engine, console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL("../boinya-c/next/ig-labels.js", import.meta.url), "utf8"), context);
const api = context.BoinyaOrderEngine;
const ig = context.BoinyaIgLabels;

assert.equal(api.prettyProductName("УХО К"), "Ушко кролика");
assert.equal(api.prettyProductName("МЯСНЫЕ ЛОМТИКИ"), "Говядина");
assert.equal(api.prettyProductName("УХО Г"), "PRETTY:УХО Г");
assert.equal(ig.shownProductName("КРОШКА ЛЁГКОГО"), "");
assert.equal(api.humanFraction("БЫЧИЙ КОРЕНЬ", "ОГР"), "рогалик");
assert.equal(api.humanFraction("БЫЧИЙ КОРЕНЬ", "ОЧ МАЛ"), "ORIG:ОЧ МАЛ");
assert.equal(api.humanFraction("ТРАХЕЯ", "ОГР"), "ORIG:ОГР");
assert.equal(api.humanFraction("ТРАХЕЯ", "ПЛАСТ"), "ORIG:ПЛАСТ");
assert.equal(api.humanFraction("СТАНОВАЯ ЖИЛА", "СРЕД"), "половинка");
assert.equal(api.humanFraction("СТАНОВАЯ ЖИЛА", "БОЛ"), "целая");
assert.equal(api.humanFraction("СТАНОВАЯ ЖИЛА", "ПАЛК"), "палочка");
assert.equal(api.humanFraction("ЛЁГКОЕ", "Среднее"), "средний кубик");
assert.equal(api.humanFraction("ЛЁГКОЕ", "Мелкое"), "мелкий кубик");
assert.equal(api.humanFraction("ЛЁГКОЕ", "Крупное"), "крупный кубик");
assert.equal(api.humanFraction("ЛЁГКОЕ", "Очень мелкое"), "очень мелкий кубик");
assert.equal(api.humanFraction("ЛЁГКОЕ", "Целое"), "ломтики");
assert.equal(api.humanFraction("ЛЁГКОЕ", "Полоски"), "палочки");
assert.equal(api.humanFraction("БАРАНЬЕ ЛЁГКОЕ", "Полоски"), "палочки");
assert.equal(api.humanFraction("БАРАНЬЕ ЛЁГКОЕ", "Крупное"), "крупный кубик");
assert.equal(api.humanFraction("БАРАНЬЕ ЛЁГКОЕ", "Среднее"), "средний кубик");
assert.equal(api.humanFraction("БАРАНЬЕ ЛЁГКОЕ", "Мелкое"), "мелкий кубик");
assert.equal(api.humanFraction("БАРАНЬЕ ЛЁГКОЕ", "Очень мелкое"), "очень мелкий кубик");
assert.equal(api.humanFraction("СЕРДЦЕ", "Полоски"), "полоски");
assert.equal(api.humanFraction("СЕРДЦЕ", "Ломтики"), "ломтики");
assert.equal(api.humanFraction("СЕРДЦЕ", "Кусочки"), "кусочки");
assert.equal(api.humanFraction("СЕРДЦЕ", "Мелкое"), "мелкие кусочки");
assert.equal(api.humanFraction("СЕРДЦЕ", "Крупное"), "крупные кусочки");
assert.equal(api.humanFraction("СЕРДЦЕ", "Очень мелкое"), "очень мелкие кусочки");
assert.equal(api.humanFraction("РУБЕЦ Т", "Среднее"), "кусочки");
assert.equal(api.humanFraction("РУБЕЦ Т", "Крупное"), "крупные кусочки");
assert.equal(api.humanFraction("РУБЕЦ Т", "Ломтики"), "ломтики");
assert.equal(api.humanFraction("РУБЕЦ Т", "Полоски"), "полоски");
assert.equal(api.humanFraction("РУБЕЦ Т", "Мелкое"), "мелкие кусочки");
assert.equal(api.humanFraction("ПОЧКИ", "Ломтики"), "кусочки");
assert.equal(api.humanFraction("ПОЧКИ", "Очень мелкое"), "очень мелкие кусочки");
assert.equal(api.humanFraction("БАРАНЬЯ ПЕЧЕНЬ", "Полоски"), "кусочки");
assert.equal(api.humanFraction("БАРАНЬЯ ПЕЧЕНЬ", "Мелкое"), "мелкие кусочки");
assert.equal(api.humanFraction("БАРАНЬЯ ПЕЧЕНЬ", "Очень мелкое"), "ORIG:Очень мелкое");
assert.equal(api.humanFraction("ИНДЕЙКА", "Кусочки"), "кусочки");
assert.equal(api.humanFraction("ИНДЕЙКА", "Полоски"), "ORIG:Полоски");
assert.equal(api.humanFraction("ИНДЕЙКА", "Мелкое"), "мелкие кусочки");
assert.equal(api.humanFraction("ИНДЕЙКА", "Очень мелкое"), "ORIG:Очень мелкое");
assert.equal(api.humanFraction("УХО К", "ПОЛОВИНКА"), "половинка");
assert.equal(api.humanFraction("УХО К", "Обычное"), "целое");
assert.equal(api.humanFraction("УХО Г", "Обычное"), "целое");
assert.equal(api.humanFraction("КРОШКА ЛЁГКОГО", "20"), "ORIG:20");
assert.equal(api.retailLineCost("СЕРДЦЕ", "Полоски", 100).cost, 12);
assert.equal(api.retailLineCost("СЕРДЦЕ", "Кусочки", 100).cost, 13);
assert.equal(api.retailLineCost("РУБЕЦ Т", "Кусочки", 100).cost, 13);
assert.equal(api.retailLineCost("ПОЧКИ", "Кусочки", 100).cost, 11);
assert.equal(api.retailLineCost("БАРАНЬЯ ПЕЧЕНЬ", "Мелкое", 100).cost, 19);
assert.equal(api.retailLineCost("БАРАНЬЯ ПЕЧЕНЬ", "Полоски", 100).cost, 12);
assert.equal(api.humanFraction("РУБЕЦ Т", "Очень мелкое"), "очень мелкие кусочки");
assert.equal(api.retailLineCost("РУБЕЦ Т", "Очень мелкое", 100).cost, 15);
assert.equal(api.retailLineCost("РУБЕЦ Т", "Очень мелкое", 100).per, 15);
assert.equal(api.retailLineCost("РУБЕЦ Т", "ОЧ МЕЛК", 50).cost, 7.5);
assert.equal(api.retailLineCost("РУБЕЦ Т", "Мелкое", 100).cost, 12);
assert.equal(api.retailLineCost("КРОШКА ЛЁГКОГО", "", 100).cost, 12);
assert.equal(api.retailLineCost("УХО К", "ПОЛОВИНКА", 1).per, 12);
const basket = api.calcRetailBasketTotal([
  { name: "ЛЁГКОЕ", sub: "Целое", val: 100 },
  { name: "СЕРДЦЕ", sub: "Кусочки", val: 100 },
  { name: "КРОШКА ЛЁГКОГО", sub: "", val: 20, cat: "crumb" },
  { name: "РУБЕЦ Т", sub: "Очень мелкое", val: 100 }
]);
assert.equal(basket.goods, 9 + 9 + 13 + 15);
const heartPick = api.catalogFractionsForUi_("dressura", "СЕРДЦЕ");
assert.ok(heartPick.includes("Кусочки"));
assert.equal(heartPick.includes("Полоски"), false);
assert.equal(heartPick.includes("Крупное"), false);
assert.deepEqual(api.catalogFractionsForUi_("dressura", "РУБЕЦ Т"), ["Ломтики", "Среднее", "Мелкое", "Очень мелкое"]);
assert.deepEqual(api.catalogFractionsForUi_("dressura", "ПОЧКИ"), ["Ломтики", "Мелкое"]);
assert.equal(api.catalogFractionsForUi_("dressura", "БАРАНЬЕ ЛЁГКОЕ").includes("Очень мелкое"), false);
assert.deepEqual(api.catalogFractionsForUi_("other", "ПЕЧЕНЬ"), ["Кусочки", "Мелкое", "Крошка"]);
assert.deepEqual(api.catalogFractionsForUi_("other", "ИНДЕЙКА"), ["Ломтики", "Кусочки", "Мелкое"]);
assert.equal(api.retailLineCost("СЕРДЦЕ", "Очень мелкое", 100).cost, 15);
assert.equal(api.retailLineCost("БАРАНЬЕ ЛЁГКОЕ", "Среднее", 100).cost, 19);
assert.equal(api.retailLineCost("БАРАНЬЕ ЛЁГКОЕ", "Мелкое", 100).cost, 20);
assert.equal(api.retailLineCost("ЛЁГКОЕ", "Крупное", 100).cost, 11);
assert.equal(api.retailLineCost("ЛЁГКОЕ", "Среднее", 100).cost, 12);
assert.equal(api.retailLineCost("ЛЁГКОЕ", "Мелкое", 100).cost, 13);
assert.equal(api.retailLineCost("ЛЁГКОЕ", "Очень мелкое", 100).cost, 14);
assert.equal(api.retailLineCost("ПЕЧЕНЬ", "Кусочки", 100).cost, 11);
assert.equal(api.retailLineCost("ПЕЧЕНЬ", "Мелкое", 100).cost, 12);
assert.equal(api.retailLineCost("ВЫМЯ", "Кусочки", 100).cost, 10);
assert.equal(api.retailLineCost("ВЫМЯ", "Мелкое", 100).cost, 11);
assert.equal(api.retailLineCost("СЕМЕННИКИ", "Мелкое", 100).cost, 14);
assert.equal(api.retailLineCost("МЯСНЫЕ ЛОМТИКИ", "Кусочки", 100).cost, 16);
assert.equal(api.retailLineCost("МЯСНЫЕ ЛОМТИКИ", "Мелкое", 100).cost, 17);
assert.equal(api.retailLineCost("ИНДЕЙКА", "Мелкое", 100).cost, 12);
assert.equal(api.retailLineCost("КРОШКА МИКС", "Мелкое", 100).cost, 12);
assert.equal(ig.relabelText("БЫЧИЙ КОРЕНЬ", "огромные"), "рогалик");
assert.equal(ig.relabelText("ТРАХЕЯ", "огромные"), "");
assert.equal(ig.relabelText("КРОШКА ЛЁГКОГО", "мелкое"), "");
assert.equal(ig.relabelText("ЛЁГКОЕ", "кубики"), "средний кубик");
assert.equal(ig.relabelText("ЛЁГКОЕ", "среднее"), "средний кубик");
assert.equal(ig.relabelText("ЛЁГКОЕ", "мелкие кубики"), "мелкий кубик");
assert.equal(ig.relabelText("ЛЁГКОЕ", "очень мелкое"), "очень мелкий кубик");
assert.equal(ig.relabelText("БАРАНЬЕ ЛЁГКОЕ", "кубики"), "средний кубик");
assert.equal(ig.relabelText("БАРАНЬЕ ЛЁГКОЕ", "очень мелкое"), "очень мелкий кубик");
assert.equal(ig.relabelText("ЛЁГКОЕ", "полоски"), "палочки");
assert.equal(ig.relabelText("РУБЕЦ Т", "кусочки"), "кусочки");
assert.equal(ig.relabelText("РУБЕЦ Т", "среднее"), "кусочки");
assert.equal(ig.relabelText("РУБЕЦ Т", "средние кусочки"), "кусочки");
assert.equal(ig.relabelText("ПОЧКИ", "ломтики"), "кусочки");
assert.equal(ig.relabelText("СЕРДЦЕ", "очень мелкое"), "очень мелкие кусочки");
assert.equal(ig.relabelText("СЕРДЦЕ", "ломтики"), "ломтики");
assert.equal(ig.relabelText("ИНДЕЙКА", "кусочки"), "");
assert.equal(ig.relabelText("БАРАНЬЯ ПЕЧЕНЬ", "полоски"), "кусочки");
vm.runInContext(fs.readFileSync(new URL("../boinya-c/next/cut-frac.js", import.meta.url), "utf8"), context);
const cut = context.BoinyaCutFrac;
assert.equal(cut.phrase({ cat: "dressura", name: "ЛЁГКОЕ", sub: "Среднее" }), "средний кубик");
assert.equal(cut.phrase({ cat: "dressura", name: "ЛЁГКОЕ", sub: "Крупное" }), "крупный кубик");
assert.equal(cut.phrase({ cat: "dressura", name: "ЛЁГКОЕ", sub: "Очень мелкое" }), "очень мелкий кубик");
assert.equal(cut.phrase({ cat: "dressura", name: "ЛЁГКОЕ", sub: "Полоски" }), "палочки");
assert.equal(cut.phrase({ cat: "dressura", name: "СЕРДЦЕ", sub: "Полоски" }), "полоски");
assert.equal(cut.phrase({ cat: "dressura", name: "СЕРДЦЕ", sub: "Крупное" }), "крупные кусочки");
assert.equal(cut.phrase({ cat: "dressura", name: "СЕРДЦЕ", sub: "Кусочки" }), "кусочки");
assert.equal(cut.phrase({ cat: "dressura", name: "СЕРДЦЕ", sub: "Ломтики" }), "ломтики");
assert.equal(cut.phrase({ cat: "dressura", name: "РУБЕЦ Т", sub: "Очень мелкое" }), "очень мелкие кусочки");
assert.equal(cut.phrase({ cat: "dressura", name: "ПОЧКИ", sub: "Ломтики" }), "кусочки");
assert.equal(cut.phrase({ cat: "dressura", name: "ПОЧКИ", sub: "Очень мелкое" }), "очень мелкие кусочки");
assert.equal(cut.phrase({ cat: "dressura", name: "БАРАНЬЕ ЛЁГКОЕ", sub: "Среднее" }), "средний кубик");
assert.equal(cut.phrase({ cat: "dressura", name: "БАРАНЬЕ ЛЁГКОЕ", sub: "Очень мелкое" }), "очень мелкий кубик");
assert.equal(cut.phrase({ cat: "other", name: "ПЕЧЕНЬ", sub: "Кусочки" }), "кусочки");
assert.equal(cut.phrase({ cat: "other", name: "ПЕЧЕНЬ", sub: "Мелкое" }), "мелкие кусочки");
assert.equal(cut.phrase({ cat: "other", name: "МЯСНЫЕ ЛОМТИКИ", sub: "Мелкое" }), "мелкие кусочки");
assert.equal(cut.phrase({ cat: "other", name: "ИНДЕЙКА", sub: "Кусочки" }), "кусочки");
assert.equal(cut.phrase({ cat: "other", name: "БАРАНЬЯ ПЕЧЕНЬ", sub: "Полоски" }), "кусочки");
const sizes = ig.relabelSizes("БЫЧИЙ КОРЕНЬ", [
  { text: "огромные", dry: 1 },
  { text: "рогалик", dry: 2 }
]);
assert.equal(sizes.length, 1);
assert.equal(sizes[0].text, "рогалик");
assert.equal(sizes[0].dry, 3);
ig.rememberPrices([{ key: HEART_KEY, price: 15 }, { key: RUMEN_KEY, price: 18 }]);
assert.equal(api.retailLineCost("СЕРДЦЕ", "Кусочки", 100).cost, 15);
assert.equal(api.retailLineCost("РУБЕЦ Т", "Очень мелкое", 100).cost, 18);
ig.rememberPrices([]);
assert.equal(api.retailLineCost("РУБЕЦ Т", "Очень мелкое", 100).cost, 15);

const items = [
  { key: "КРОШКА ЛЁГКОГО", kind: "per100", price: 11 },
  { key: "УХО К|ПОЛОВИНКА", kind: "perPiece", price: 5 },
  { key: "УХО К|Обычное", kind: "perPiece", price: 7 },
  { key: "УХО Г|ПОЛОВИНКА", kind: "perPiece", price: 5 },
  { key: "СЕРДЦЕ|Полоски", kind: "per100", price: 12 }
];
const once = alignRetailItems(items);
assert.deepEqual(once.changed.sort(), [HEART_KEY, LIVER_KEY].sort());
assert.equal(once.items.find((it) => it.key === "КРОШКА ЛЁГКОГО").price, 11);
assert.equal(once.items.find((it) => it.key === "УХО К|Обычное").price, 7);
assert.equal(once.items.find((it) => it.key === "УХО Г|ПОЛОВИНКА").price, 5);
assert.equal(once.items.some((it) => /КАБАЧ/.test(it.key)), false);
const twice = alignRetailItems(once.items);
assert.equal(twice.changed.length, 0);
assert.equal(twice.items.find((it) => it.key === LIVER_KEY).price, 19);

const worker = fs.readFileSync(new URL("../boinya-c/proxy/worker.js", import.meta.url), "utf8");
const gas = fs.readFileSync(new URL("../Code.gs", import.meta.url), "utf8");
const engineSrc = fs.readFileSync(new URL("../boinya-c/next/order-engine.js", import.meta.url), "utf8");
assert.match(worker, /function igRetailAlignD1_/);
assert.match(worker, /Ушко кролика/);
assert.match(gas, /function igRetailAlignGs_/);
assert.match(gas, /Ушко кролика/);
assert.doesNotMatch(engineSrc, /Ушко кролика/);
assert.match(worker, /КРОШК\/i\.test\(String\(name \|\| ""\)\)/);
assert.match(gas, /"РУБЕЦ Т\|Очень мелкое": \{ per100: 15 \}/);
assert.match(gas, /"СЕРДЦЕ\|Очень мелкое": \{ per100: 16 \}/);
assert.match(engineSrc, /"РУБЕЦ Т\|Очень мелкое": \{ per100: 14 \}/);
assert.doesNotMatch(engineSrc, /"РУБЕЦ Т\|Очень мелкое": \{ per100: 15 \}/);
assert.doesNotMatch(engineSrc, /очень мелкий кубик/);
assert.doesNotMatch(engineSrc, /средние кусочки/);
assert.match(worker, /очень мелкий кубик/);
assert.match(worker, /очень мелкие кусочки/);
assert.match(gas, /очень мелкий кубик/);
assert.match(gas, /очень мелкие кусочки/);
const showcase = worker.slice(
  worker.indexOf("function applyRetailShowcasePatchD1_"),
  worker.indexOf("function retailItemsFromMapD1_")
);
assert.doesNotMatch(showcase, /Очень мелкое/);
const wsrc = worker.slice(worker.indexOf("function igNormD1_("), worker.indexOf("function retailLineCostD1_("));
const wctx = {};
vm.createContext(wctx);
vm.runInContext(wsrc, wctx);
assert.equal(wctx.igRetailAlignD1_(null, "РУБЕЦ Т", "Очень мелкое", 100).cost, 15);
assert.equal(wctx.igRetailAlignD1_(null, "РУБЕЦ Т", "ОЧ МЕЛК", 100).per, 15);
assert.equal(wctx.igRetailAlignD1_({ "РУБЕЦ Т|Очень мелкое": { per100: 18 } }, "РУБЕЦ Т", "Очень мелкое", 100).cost, 18);
assert.equal(wctx.igRetailAlignD1_(null, "РУБЕЦ Т", "Мелкое", 100), null);
assert.equal(wctx.igRetailAlignD1_(null, "РУБЕЦ Т", "Кусочки", 100).cost, 13);
assert.equal(wctx.igRetailAlignD1_(null, "КРОШКА РУБЕЦ", "Очень мелкое", 100), null);
assert.equal(wctx.igFractionWordD1_("ЛЁГКОЕ", "Среднее"), "средний кубик");
assert.equal(wctx.igFractionWordD1_("ЛЁГКОЕ", "Очень мелкое"), "очень мелкий кубик");
assert.equal(wctx.igFractionWordD1_("БАРАНЬЕ ЛЁГКОЕ", "Среднее"), "кубики");
assert.equal(wctx.igFractionWordD1_("БАРАНЬЕ ЛЁГКОЕ", "Очень мелкое"), "");
assert.equal(wctx.fracGridWordD1_("БАРАНЬЕ ЛЁГКОЕ", "Среднее"), "средний кубик");
assert.equal(wctx.fracGridWordD1_("БАРАНЬЕ ЛЁГКОЕ", "Очень мелкое"), "очень мелкий кубик");
assert.equal(wctx.fracGridWordD1_("ЛЁГКОЕ", "Полоски"), "палочки");
assert.equal(wctx.fracGridWordD1_("СЕРДЦЕ", "Кусочки"), "кусочки");
assert.equal(wctx.fracGridWordD1_("СЕРДЦЕ", "Полоски"), "полоски");
assert.equal(wctx.fracGridWordD1_("ПЕЧЕНЬ", "Мелкое"), "мелкие кусочки");
assert.equal(wctx.fracGridNameD1_("МЯСНЫЕ ЛОМТИКИ"), "Говядина");
assert.equal(wctx.fracGridPer100D1_("ПЕЧЕНЬ", "Кусочки", 100).cost, 11);
assert.equal(wctx.fracGridPer100D1_("КРОШКА ЛЁГКОГО", "Мелкое", 100), null);
assert.equal(wctx.fracGridPer100D1_("ИНДЕЙКА", "Мелкое", 100), null);
assert.equal(wctx.fracGridPer100D1_("ЛЁГКОЕ", "Крупное", 100).cost, 11);
assert.equal(wctx.fracGridPer100D1_("ЛЁГКОЕ", "Среднее", 100).cost, 12);
assert.equal(wctx.fracGridPer100D1_("ЛЁГКОЕ", "Мелкое", 100).cost, 13);
assert.equal(wctx.fracGridPer100D1_("ЛЁГКОЕ", "Очень мелкое", 100).cost, 14);
assert.equal(wctx.fracGridPer100D1_("БАРАНЬЕ ЛЁГКОЕ", "Крупное", 100).cost, 18);
assert.equal(wctx.fracGridPer100D1_("БАРАНЬЕ ЛЁГКОЕ", "Среднее", 100).cost, 19);
assert.equal(wctx.fracGridPer100D1_("БАРАНЬЕ ЛЁГКОЕ", "Мелкое", 100).cost, 20);
assert.equal(wctx.igFractionWordD1_("РУБЕЦ Т", "Очень мелкое"), "очень мелкие кусочки");
assert.equal(wctx.igFractionWordD1_("ИНДЕЙКА", "Кусочки"), "кусочки");
assert.equal(wctx.igFractionWordD1_("ПОЧКИ", "Ломтики"), "средние кусочки");
assert.equal(wctx.igRelabelTextD1_("ЛЁГКОЕ", "кубики"), "средний кубик");
assert.equal(wctx.igRelabelTextD1_("ИНДЕЙКА", "кусочки"), "");
const per = Number(gas.match(/"РУБЕЦ Т\|Очень мелкое": \{ per100: (\d+) \}/)[1]);
assert.equal(per, 15);
const gsrc = "function getRetailPriceLiveMap_(){return LIVE;}\nvar LIVE = {};\nvar RETAIL_PRICE_BYN_ = {\"РУБЕЦ Т|Очень мелкое\":{per100:" + per + "}};\n" +
  gas.slice(gas.indexOf("function igNormGs_("), gas.indexOf("function retailLineCost_("));
const gctx = {};
vm.createContext(gctx);
vm.runInContext(gsrc, gctx);
gctx.LIVE = {};
assert.equal(gctx.igRetailAlignGs_("РУБЕЦ Т", "Очень мелкое", 100).cost, 15);
gctx.LIVE = { "РУБЕЦ Т|Очень мелкое": { per100: 20 } };
assert.equal(gctx.igRetailAlignGs_("РУБЕЦ Т", "Очень мелкое", 100).cost, 20);
gctx.LIVE = {};
assert.equal(gctx.igRetailAlignGs_("РУБЕЦ Т", "Мелкое", 100), null);
assert.equal(gctx.igFractionWordGs_("ПОЧКИ", "Ломтики"), "средние кусочки");
assert.equal(gctx.igFractionWordGs_("ЛЁГКОЕ", "Крупное"), "крупный кубик");
assert.equal(gctx.igFractionWordGs_("БАРАНЬЯ ПЕЧЕНЬ", "Полоски"), "кусочки");
assert.equal(gctx.igFractionWordGs_("ИНДЕЙКА", "Очень мелкое"), "");
assert.equal(gctx.igFractionWordGs_("СЕРДЦЕ", "Кусочки"), "средние кусочки");

const baseItems = [
  { key: "КРОШКА РУБЕЦ", kind: "per100", price: 12 },
  { key: "РУБЕЦ Т|Мелкое", kind: "per100", price: 14 },
  { key: "РУБЕЦ Т|Ломтики", kind: "per100", price: 12 },
  { key: "КАБАЧОК", kind: "per100", price: 0 }
];
const added = setRumenXs(baseItems);
assert.deepEqual(added.changed, [RUMEN_KEY]);
assert.equal(added.items.length, baseItems.length + 1);
assert.equal(added.items.find((it) => it.key === RUMEN_KEY).price, RUMEN_PRICE);
assert.equal(added.items.find((it) => it.key === "КРОШКА РУБЕЦ").price, 12);
assert.equal(added.items.find((it) => it.key === "РУБЕЦ Т|Мелкое").price, 14);
assert.equal(added.items.filter((it) => it.key === "КАБАЧОК").length, 1);
const again = setRumenXs(added.items);
assert.equal(again.changed.length, 0);
assert.equal(again.items.length, added.items.length);
const from14 = setRumenXs(baseItems.concat([{ key: RUMEN_KEY, kind: "per100", price: 14 }]));
assert.deepEqual(from14.changed, [RUMEN_KEY]);
assert.equal(from14.items.find((it) => it.key === RUMEN_KEY).price, 15);
assert.equal(from14.items.length, baseItems.length + 1);

const parsed = parseFirstJson("npm warn\n[{\"results\":[{\"n\":3}]}]\nextra");
assert.equal(parsed[0].results[0].n, 3);

const gridBase = [
  { key: "КРОШКА РУБЕЦ", kind: "per100", price: 12 },
  { key: "РУБЕЦ Т|Очень мелкое", kind: "per100", price: 15 },
  { key: "УХО К|ПОЛОВИНКА", kind: "perPiece", price: 5 },
  { key: "СЕРДЦЕ|Очень мелкое", kind: "per100", price: 16 },
  { key: "КАБАЧОК", kind: "per100", price: 0 }
];
const gridded = setFracGrid(gridBase);
assert.equal(gridded.items.length, gridBase.length + Object.keys(GRID).length - 1);
assert.equal(gridded.items.find((it) => it.key === "СЕРДЦЕ|Очень мелкое").price, 15);
assert.equal(gridded.items.find((it) => it.key === "КРОШКА РУБЕЦ").price, 12);
assert.equal(gridded.items.find((it) => it.key === "РУБЕЦ Т|Очень мелкое").price, 15);
assert.equal(gridded.items.find((it) => it.key === "УХО К|ПОЛОВИНКА").price, 5);
assert.equal(gridded.items.filter((it) => it.key === "КАБАЧОК").length, 1);
assert.equal(setFracGrid(gridded.items).changed.length, 0);

const real = { console };
real.globalThis = real;
vm.createContext(real);
vm.runInContext(fs.readFileSync(new URL("../boinya-c/next/order-engine.js", import.meta.url), "utf8"), real);
vm.runInContext(fs.readFileSync(new URL("../boinya-c/next/ig-labels.js", import.meta.url), "utf8"), real);
vm.runInContext(fs.readFileSync(new URL("../boinya-c/next/cut-frac.js", import.meta.url), "utf8"), real);
const live = real.BoinyaOrderEngine;
function offer(cat, name) {
  const fr = Array.from(live.catalogFractionsForUi_(cat, name) || []);
  return fr
    .filter((f) => !/^крошк/i.test(String(f)))
    .map((f) => String(live.humanFraction(name, f)) + " " + live.retailLineCost(name, f, 100).per);
}
assert.deepEqual(offer("dressura", "ЛЁГКОЕ"), ["ломтики 9", "палочки 10", "крупный кубик 11", "средний кубик 12", "мелкий кубик 13", "очень мелкий кубик 14"]);
assert.deepEqual(offer("dressura", "СЕРДЦЕ"), ["ломтики 12", "кусочки 13", "мелкие кусочки 14", "очень мелкие кусочки 15"]);
assert.deepEqual(offer("dressura", "РУБЕЦ Т"), ["ломтики 12", "кусочки 13", "мелкие кусочки 14", "очень мелкие кусочки 15"]);
assert.deepEqual(offer("dressura", "ПОЧКИ"), ["кусочки 11", "мелкие кусочки 12"]);
assert.equal(String(live.prettyProductName("МЯСНЫЕ ЛОМТИКИ")), "Говядина");
assert.deepEqual(offer("other", "ПЕЧЕНЬ"), ["кусочки 11", "мелкие кусочки 12"]);
assert.deepEqual(offer("other", "ВЫМЯ"), ["кусочки 10", "мелкие кусочки 11"]);
assert.deepEqual(offer("other", "СЕМЕННИКИ"), ["кусочки 13", "мелкие кусочки 14"]);
assert.deepEqual(offer("other", "МЯСНЫЕ ЛОМТИКИ"), ["кусочки 16", "мелкие кусочки 17"]);
assert.deepEqual(offer("other", "ИНДЕЙКА"), ["ломтики 16", "кусочки 17", "мелкие кусочки 18"]);
assert.equal(live.retailLineCost("ИНДЕЙКА", "Полоски", 100).per, 17);
assert.deepEqual(offer("dressura", "БАРАНЬЕ ЛЁГКОЕ"), ["ломтики 16", "палочки 17", "крупный кубик 18", "средний кубик 19", "мелкий кубик 20"]);
assert.deepEqual(offer("other", "БАРАНЬЯ ПЕЧЕНЬ"), ["ломтики 17", "кусочки 18", "мелкие кусочки 19"]);
assert.equal(offer("other", "КРОЛИК").length, 0);
assert.equal(real.BoinyaCutFrac.phrase({ cat: "dressura", name: "СЕРДЦЕ", sub: "Полоски" }), "полоски");
assert.equal(real.BoinyaCutFrac.phrase({ cat: "dressura", name: "ПОЧКИ", sub: "Очень мелкое" }), "очень мелкие кусочки");
assert.equal(real.BoinyaCutFrac.phrase({ cat: "other", name: "ВЫМЯ", sub: "Мелкое" }), "мелкие кусочки");
assert.doesNotMatch(engineSrc, /Говядина/);
assert.match(worker, /function applyFracGridPatchD1_/);
assert.match(worker, /function meatFracParentCostD1_/);
assert.match(gas, /function applyFracGridPatchGs_/);

console.log("ig-labels ok");
