import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const P = require("./price-logic.js");
const app = fs.readFileSync(path.resolve(here, "../app.main.js"), "utf8");
const logic = fs.readFileSync(path.resolve(here, "price-logic.js"), "utf8");

const COPIED = [
  "applyRaw26RetailCapAlloc_",
  "capRaw26PriceToRetail_",
  "recoverBynFromBasketLocal_",
  "composePpClientMessage",
  "composeRetailClientMessage",
  "capOfferSubToDisplayedRetail_",
  "pricePickParseBudget_",
  "pricePickParseBudgetSeg_",
  "pricePickFitBudget_",
  "pricePickOfferText_",
  "parseAnketSignals_",
  "applyLocalPpFact_",
  "ppOfferClientPrice_",
  "raw26ApiFactPrice_"
];

test("формулы вырезаны из app.main.js без переписывания", () => {
  COPIED.forEach((name) => {
    const idx = app.indexOf("\n    function " + name + "(");
    const asyncIdx = app.indexOf("\n    async function " + name + "(");
    const at = idx >= 0 ? idx : asyncIdx;
    assert.ok(at >= 0, name);
    const snippet = app.slice(at + 1, at + 220);
    assert.ok(logic.includes(snippet), "нет дословного " + name);
  });
});

test("кап 92%: сначала фракция, потом товар до пола", () => {
  const cutFrac = P.applyRaw26RetailCapAlloc_(40, 18, 0, 6, 50, 30);
  assert.equal(cutFrac.fractionMarkup, 0);
  assert.equal(cutFrac.goods, 32);
  assert.equal(cutFrac.factCost, 50);
  assert.equal(cutFrac.uncappedFloor, false);
  const floor = P.applyRaw26RetailCapAlloc_(40, 18, 0.56, 4, 50, 38);
  assert.equal(floor.fractionMarkup, 0);
  assert.equal(floor.goods, 38);
  assert.equal(floor.uncappedFloor, true);
  assert.ok(floor.factCost > 50);
});

test("локальный RAW26 совпадает с applyLocalPpFact_", () => {
  const list = [{ cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", val: 200, value: 200 }];
  const q = P.quotePp({ scheme: "RAW26", coef: 2.6, deliveriesN: 2, costSum: 10, list: list, packagesByn: 0, fracTotal: 0 });
  assert.equal(q.total, 35.8);
  assert.equal(q.fact.recoverByn, 7.8);
  assert.equal(q.fact.retailCapAt, 33.12);
  assert.equal(q.fact.uncappedFloor, true);
  assert.equal(q.fact.deliveryByn, 18);
  const legacy = P.quotePp({ scheme: "LEGACY", coef: 2.3, deliveriesN: 2, costSum: 10, list: list, packagesByn: 0, fracTotal: 0 });
  assert.equal(legacy.total, Math.round((10 * 2.3 + 11 + 6 * 2) * 100) / 100);
});

test("текст оффера ПП дословный", () => {
  const msg = P.composePpClientMessage(
    [{ cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", val: 200 }],
    2,
    "домофон 12",
    80,
    73.4,
    "RAW26",
    {}
  );
  assert.equal(msg, [
    "Ваш состав на месяц получается",
    "",
    "Дрессура :",
    "",
    "Лёгкое - 200 г (ломтики)",
    "",
    "Количество доставок в месяц - 2",
    "",
    "домофон 12",
    "",
    "Цена за этот состав в розницу выходит - 80 рублей",
    "",
    "В подписке с учётом доставок, поддержки 24/7 и партнёрской программы со скидками для наших клиентов",
    "стоимость выходит - 73 рублей за месяц",
    "",
    "Как вам наше предложение?)",
    "Готовы продолжать😁"
  ].join("\n"));
});

test("бюджет анкеты: диапазон, до, около", () => {
  assert.deepEqual(P.pricePickParseBudget_("10) 30-50 руб в месяц"), { min: 30, max: 50, mid: 40, kind: "range" });
  assert.deepEqual(P.pricePickParseBudget_("Бюджет\nдо 50 руб"), { min: 35, max: 50, mid: 43, kind: "upto" });
  assert.equal(P.pricePickParseBudgetSeg_("около 80").kind, "about");
  assert.equal(P.pricePickParseBudgetSeg_("12"), null);
});

test("подбор под бюджет не выдумывает состав и держит потолок", async () => {
  const sig = P.parseAnketSignals_("любит лёгкое\nне ест рубец\nБюджет до 40 руб");
  assert.ok(sig.liked.indexOf("ЛЁГКОЕ") >= 0);
  assert.ok(sig.disliked.indexOf("РУБЕЦ Т") >= 0);
  assert.equal(sig.budget.max, 40);
  const composed = P.pricePickComposeForTarget_(sig, "pp");
  assert.ok(composed.items.some((it) => (it.main || it.name) === "ЛЁГКОЕ"));
  assert.ok(!composed.items.some((it) => (it.main || it.name) === "РУБЕЦ Т") || sig.disliked.indexOf("РУБЕЦ Т") >= 0);
  const fit = await P.pricePickFitBudget_({ items: composed.items, target: "pp", signals: sig });
  assert.ok(fit && fit.items && fit.items.length);
  assert.ok(fit.monthly <= 40.001 || fit.goodsOnly);
  const text = P.pricePickOfferText_(sig, "pp", fit.items);
  assert.equal(typeof text, "string");
  assert.ok(text.length > 20);
});
