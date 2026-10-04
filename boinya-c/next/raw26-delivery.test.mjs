import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const P = require(path.join(path.dirname(fileURLToPath(import.meta.url)), "price-logic.js"));

test("база капа — показанная розница, с доставкой прайса если R/N < 80", () => {
  assert.equal(P.raw26RetailCapBase_(100, 1), 100);
  assert.equal(P.raw26RetailCapBase_(100, 4), 136);
  assert.equal(P.raw26RetailCapBase_(55, 2), 73);
  assert.equal(P.raw26RetailCapBase_(79.99, 1), 88.99);
  assert.equal(P.raw26RetailCapBase_(80, 1), 80);
  assert.equal(P.raw26RetailCapBase_(80, 2), 98);
  assert.equal(P.raw26RetailCapBase_(171.2, 1), 171.2);
  assert.equal(P.raw26RetailCapBase_(0, 2), 0);
});

test("потолок режет всю сумму, компонент 9×N не сжимается", () => {
  const cap = Math.round(100 * 0.92 * 100) / 100;
  const row = (n) => P.applyRaw26RetailCapAlloc_(100, 9 * n, 1.4, 8, cap, 40);
  const n1 = row(1);
  const n4 = row(4);
  assert.equal(n1.goods, 100);
  assert.equal(n1.delivery, 9);
  assert.equal(n1.fractionMarkup, 8);
  assert.equal(n1.packagesByn, 1.4);
  assert.equal(n1.factCost, 92);
  assert.equal(n1.uncappedFloor, false);
  assert.equal(n4.delivery, 36);
  assert.equal(n4.goods, 100);
  assert.equal(n4.factCost, 92);
});

test("некапнутая корзина не меняется от нового капа", () => {
  const open = P.applyRaw26RetailCapAlloc_(50, 18, 0, 3, 92, 20);
  assert.equal(open.retailCapped, false);
  assert.equal(open.goods, 50);
  assert.equal(open.fractionMarkup, 3);
  assert.equal(open.factCost, 71);
});

test("пол товара больше не поднимает цену над потолком", () => {
  const floor = P.applyRaw26RetailCapAlloc_(80, 9, 1.4, 4, 50, 60);
  assert.equal(floor.goods, 80);
  assert.equal(floor.delivery, 9);
  assert.equal(floor.packagesByn, 1.4);
  assert.equal(floor.fractionMarkup, 4);
  assert.equal(floor.uncappedFloor, false);
  assert.equal(floor.factCost, 50);
});

test("quotePp: лишняя доставка +9, LEGACY без изменений", () => {
  const list = [{ cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", val: 200, value: 200 }];
  const q = (n) => P.quotePp({
    scheme: "RAW26", coef: 2.6, deliveriesN: n, costSum: 10, list: list, packagesByn: 0, fracTotal: 0
  });
  const n1 = q(1);
  const n2 = q(2);
  const n4 = q(4);
  assert.equal(n1.fact.deliveryByn, 9);
  assert.equal(n2.fact.deliveryByn, 18);
  assert.equal(n4.fact.deliveryByn, 36);
  assert.ok(n1.total <= n1.fact.retailCapAt + 0.001, "N=1 не выше потолка");
  assert.ok(n2.total <= n2.fact.retailCapAt + 0.001, "N=2 не выше потолка");
  assert.ok(n4.total <= n4.fact.retailCapAt + 0.001, "N=4 не выше потолка");
  assert.equal(n2.fact.goodsByn, n1.fact.goodsByn, "товар не режется капом");
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

test("текст оффера не показывает цену выше 92% розницы", () => {
  assert.equal(P.capOfferSubToDisplayedRetail_(178.94, 171.2), 157.5);
  const msg = P.composePpClientMessage([], 1, "", 171.2, 178.94, "RAW26", {});
  assert.doesNotMatch(msg, /Доставка -/);
  assert.match(msg, /в розницу выходит - 171 рублей/);
  assert.match(msg, /стоимость выходит - 158 рублей/);
});
