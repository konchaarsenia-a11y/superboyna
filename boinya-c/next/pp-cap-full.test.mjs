import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const P = require(path.join(here, "price-logic.js"));
const eng = require(path.join(here, "order-engine.js"));

const rit = [
  { cat: "dressura", name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", sub: "Среднее", val: 320, value: 320 },
  { cat: "dressura", name: "СЕРДЦЕ", main: "СЕРДЦЕ", sub: "Целое", val: 80, value: 80 },
  { cat: "dressura", name: "ПОЧКИ", main: "ПОЧКИ", sub: "Целое", val: 40, value: 40 },
  { cat: "chew", name: "БЫЧИЙ КОРЕНЬ", main: "БЫЧИЙ КОРЕНЬ", sub: "СРЕД", val: 8, value: 8 },
  { cat: "veg", name: "ЯБЛОКИ", main: "ЯБЛОКИ", sub: "", val: 100, value: 100 },
  {
    cat: "crumb", name: "крошка", main: "крошка", sub: "РУБЕЦ Т", val: 100, value: 100,
    crumbKind: "veg",
    sources: [{ cat: "dressura", name: "РУБЕЦ Т", main: "РУБЕЦ Т", sub: "" }],
    ratio: [1]
  }
];

test("rit_murr: R 171,20, цена не выше 157,50, доставка в факте 9", () => {
  const retail = eng.calcRetailBasketTotal(rit, { deliveriesN: 1 });
  assert.equal(retail.total, 171.2);
  const q = P.quotePp({
    scheme: "RAW26",
    coef: 2.6,
    deliveriesN: 1,
    costSum: 49.6,
    list: rit,
    packagesByn: 6.04,
    fracTotal: 6.4
  });
  assert.ok(q.total <= 157.5, "price " + q.total);
  assert.equal(q.total, 157.5);
  assert.equal(q.fact.deliveryByn, 9);
  assert.equal(q.fact.packagesByn, 6.04);
  assert.equal(q.fact.fractionMarkup, 6.4);
  assert.equal(q.fact.uncappedFloor, false);
  assert.ok(q.fact.goodsByn > 157.5, "товар не урезан до капа, got " + q.fact.goodsByn);
  const msg = P.composePpClientMessage(rit, 1, "", retail.total, q.total, "RAW26");
  assert.match(msg, /в розницу выходит - 171 рублей/);
  assert.match(msg, /стоимость выходит - 158 рублей/);
});

test("1000 г лёгкое среднее: R 110, цена не выше 101,20", () => {
  const list = [{ cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", val: 1000, value: 1000 }];
  const retail = eng.calcRetailBasketTotal(list, { deliveriesN: 1 });
  assert.equal(retail.goods, 110);
  assert.equal(retail.delivery, 0);
  assert.equal(retail.total, 110);
  const q = P.quotePp({
    scheme: "RAW26",
    coef: 2.6,
    deliveriesN: 1,
    costSum: 22.5,
    list: list,
    packagesByn: 0
  });
  assert.ok(q.total <= 101.2, "price " + q.total);
  assert.equal(q.total, 101.2);
  assert.equal(q.fact.deliveryByn, 9);
  assert.equal(q.fact.goodsByn, q.fact.goodsBeforeCap);
  const msg = P.composePpClientMessage(list, 1, "", retail.total, q.total, "RAW26");
  assert.match(msg, /в розницу выходит - 110 рублей/);
  assert.match(msg, /стоимость выходит - 101 рублей/);
});
