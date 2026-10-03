import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const P = require(path.join(path.dirname(fileURLToPath(import.meta.url)), "price-logic.js"));

test("база капа товара равна R при любом N", () => {
  assert.equal(P.raw26RetailCapBase_(100, 1), 100);
  assert.equal(P.raw26RetailCapBase_(100, 4), 100);
  assert.equal(P.raw26RetailCapBase_(55, 2), 55);
  assert.equal(P.raw26RetailCapBase_(79.99, 1), 79.99);
  assert.equal(P.raw26RetailCapBase_(0, 2), 0);
});

test("капнутая корзина R≥80 дорожает ровно на 9 за доставку", () => {
  const cap = Math.round(100 * 0.92 * 100) / 100;
  const row = (n) => P.applyRaw26RetailCapAlloc_(100, 9 * n, 1.4, 8, cap, 40);
  const n1 = row(1);
  const n2 = row(2);
  const n4 = row(4);
  assert.equal(n1.goods, 92);
  assert.equal(n1.fractionMarkup, 8);
  assert.equal(n1.packagesByn, 1.4);
  assert.equal(n1.factCost, 110.4);
  assert.equal(n2.factCost, 119.4);
  assert.equal(n4.factCost, 137.4);
  assert.equal(Math.round((n2.factCost - n1.factCost) * 100) / 100, 9);
  assert.equal(Math.round((n4.factCost - n2.factCost) * 100) / 100, 18);
});

test("некапнутая корзина не меняется от нового капа", () => {
  const open = P.applyRaw26RetailCapAlloc_(50, 18, 0, 3, 92, 20);
  assert.equal(open.retailCapped, false);
  assert.equal(open.goods, 50);
  assert.equal(open.fractionMarkup, 3);
  assert.equal(open.factCost, 71);
});

test("пол товара выше капа держит F и 9×N", () => {
  const floor = P.applyRaw26RetailCapAlloc_(80, 9, 1.4, 4, 50, 60);
  assert.equal(floor.goods, 60);
  assert.equal(floor.uncappedFloor, true);
  assert.equal(floor.fractionMarkup, 4);
  assert.equal(floor.factCost, 74.4);
});

test("quotePp: лишняя доставка +9, LEGACY без изменений", () => {
  const list = [{ cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", val: 200, value: 200 }];
  const q = (n) => P.quotePp({
    scheme: "RAW26", coef: 2.6, deliveriesN: n, costSum: 10, list: list, packagesByn: 0, fracTotal: 0
  });
  const n1 = q(1);
  const n2 = q(2);
  const n4 = q(4);
  assert.equal(n2.total, 35.8);
  assert.equal(n1.fact.deliveryByn, 9);
  assert.equal(n2.fact.deliveryByn, 18);
  assert.equal(n4.fact.deliveryByn, 36);
  assert.equal(Math.round((n2.total - n1.total) * 100) / 100, 9);
  assert.equal(Math.round((n4.total - n2.total) * 100) / 100, 18);
  assert.equal(P.monthDeliveriesN_("2"), 2);
  assert.equal(P.monthDeliveriesN_("2/мес"), 2);
  assert.equal(P.monthDeliveriesN_("1/2"), 2);
  assert.equal(P.monthDeliveriesN_("ПП 1/2"), 2);
  assert.equal(P.quotePp({
    scheme: "RAW26", coef: 2.6, deliveriesN: "1/2", costSum: 10, list: list, packagesByn: 0, fracTotal: 0
  }).fact.deliveryByn, 18);
  assert.equal(P.quotePp({
    scheme: "RAW26", coef: 2.6, deliveriesN: "2/мес", costSum: 10, list: list, packagesByn: 0, fracTotal: 0
  }).fact.deliveryByn, 18);
  assert.equal(P.raw26ApiFactUsable_({ factCost: 100, deliveriesN: 1, deliveryByn: 9, scheme: "RAW26" }, 2), false);
  assert.equal(P.raw26ApiFactUsable_({ factCost: 100, deliveriesN: 2, deliveryByn: 18, scheme: "RAW26" }, 2), true);
  assert.equal(n2.fact.fractionMarkup, 0);
  const legacy = P.quotePp({
    scheme: "LEGACY", coef: 2.3, deliveriesN: 2, costSum: 10, list: list, packagesByn: 0, fracTotal: 0
  });
  assert.equal(legacy.total, Math.round((10 * 2.3 + 11 + 12) * 100) / 100);
});

test("текст оффера больше не срезает цену до 92% розницы", () => {
  assert.equal(P.capOfferSubToDisplayedRetail_(178.94, 171.2), 178.94);
  const msg = P.composePpClientMessage([], 2, "", 171.2, 178.94, "RAW26", {});
  assert.doesNotMatch(msg, /Доставка -/);
  assert.match(msg, /стоимость выходит - 179 рублей/);
});
