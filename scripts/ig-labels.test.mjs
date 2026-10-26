import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { alignRetailItems, HEART_KEY, LIVER_KEY, parseFirstJson } from "./ig-price-align.mjs";

const engine = {
  prettyProductName(name) { return "PRETTY:" + name; },
  humanFraction(main, sub) { return "ORIG:" + sub; },
  catalogFractionsForUi_(cat, name) {
    if (name === "СЕРДЦЕ") return ["Ломтики", "Полоски", "Мелкое", "Очень мелкое"];
    if (name === "ИНДЕЙКА") return ["Ломтики", "Полоски", "Мелкое"];
    if (name === "РУБЕЦ Т") return ["Ломтики", "Полоски", "Среднее", "Мелкое"];
    if (name === "ПОЧКИ") return ["Ломтики", "Мелкое"];
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
assert.equal(api.prettyProductName("УХО Г"), "PRETTY:УХО Г");
assert.equal(ig.shownProductName("КРОШКА ЛЁГКОГО"), "");
assert.equal(api.humanFraction("БЫЧИЙ КОРЕНЬ", "ОГР"), "рогалик");
assert.equal(api.humanFraction("БЫЧИЙ КОРЕНЬ", "ОЧ МАЛ"), "ORIG:ОЧ МАЛ");
assert.equal(api.humanFraction("ТРАХЕЯ", "ОГР"), "ORIG:ОГР");
assert.equal(api.humanFraction("ТРАХЕЯ", "ПЛАСТ"), "ORIG:ПЛАСТ");
assert.equal(api.humanFraction("СТАНОВАЯ ЖИЛА", "СРЕД"), "половинка");
assert.equal(api.humanFraction("СТАНОВАЯ ЖИЛА", "БОЛ"), "целая");
assert.equal(api.humanFraction("СТАНОВАЯ ЖИЛА", "ПАЛК"), "палочка");
assert.equal(api.humanFraction("ЛЁГКОЕ", "Среднее"), "кубики");
assert.equal(api.humanFraction("ЛЁГКОЕ", "Мелкое"), "мелкие кубики");
assert.equal(api.humanFraction("ЛЁГКОЕ", "Целое"), "ломтики");
assert.equal(api.humanFraction("БАРАНЬЕ ЛЁГКОЕ", "Полоски"), "полоски");
assert.equal(api.humanFraction("СЕРДЦЕ", "Полоски"), "полоски");
assert.equal(api.humanFraction("СЕРДЦЕ", "Кусочки"), "кусочки");
assert.equal(api.humanFraction("РУБЕЦ Т", "Среднее"), "кусочки");
assert.equal(api.humanFraction("ПОЧКИ", "Ломтики"), "кусочки");
assert.equal(api.humanFraction("БАРАНЬЯ ПЕЧЕНЬ", "Полоски"), "кусочки");
assert.equal(api.humanFraction("БАРАНЬЯ ПЕЧЕНЬ", "Мелкое"), "мелкие кусочки");
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
assert.equal(api.retailLineCost("КРОШКА ЛЁГКОГО", "", 100).cost, 12);
assert.equal(api.retailLineCost("УХО К", "ПОЛОВИНКА", 1).per, 12);
const basket = api.calcRetailBasketTotal([
  { name: "ЛЁГКОЕ", sub: "Целое", val: 100 },
  { name: "СЕРДЦЕ", sub: "Кусочки", val: 100 },
  { name: "КРОШКА ЛЁГКОГО", sub: "", val: 20, cat: "crumb" }
]);
assert.equal(basket.goods, 9 + 9 + 13);
assert.ok(api.catalogFractionsForUi_("dressura", "СЕРДЦЕ").includes("Кусочки"));
assert.equal(api.catalogFractionsForUi_("dressura", "РУБЕЦ Т").includes("Кусочки"), false);
assert.equal(ig.relabelText("БЫЧИЙ КОРЕНЬ", "огромные"), "рогалик");
assert.equal(ig.relabelText("ТРАХЕЯ", "огромные"), "");
assert.equal(ig.relabelText("КРОШКА ЛЁГКОГО", "мелкое"), "");
const sizes = ig.relabelSizes("БЫЧИЙ КОРЕНЬ", [
  { text: "огромные", dry: 1 },
  { text: "рогалик", dry: 2 }
]);
assert.equal(sizes.length, 1);
assert.equal(sizes[0].text, "рогалик");
assert.equal(sizes[0].dry, 3);
ig.rememberPrices([{ key: HEART_KEY, price: 15 }]);
assert.equal(api.retailLineCost("СЕРДЦЕ", "Кусочки", 100).cost, 15);

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

const parsed = parseFirstJson("npm warn\n[{\"results\":[{\"n\":3}]}]\nextra");
assert.equal(parsed[0].results[0].n, 3);

console.log("ig-labels ok");
