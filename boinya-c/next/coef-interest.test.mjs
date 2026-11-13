import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("./coef-interest.js");

test("вариант 2: ступени и разницы в рублях, месяц не ×N", () => {
  // оборот 70, себес 56 → чистыми 14 (20%) = без интереса
  const a = C.analyze(70, 56);
  assert.equal(a.clean, 14);
  assert.equal(a.pct, 20);
  assert.equal(a.current, "meh");
  assert.equal(a.goalRub, 21);
  const byId = Object.fromEntries(a.tiers.map((t) => [t.id, t]));
  assert.match(byId.high.gapLabel, /не хватает 14/);
  assert.match(byId.good.gapLabel, /не хватает 7/);
  assert.match(byId.meh.gapLabel, /сверху 3/);
  assert.match(byId.bad.gapLabel, /сверху 14/);
  assert.match(byId.loss.gapLabel, /не в минусе/);
  assert.equal(byId.meh.current, true);
});

test("себес из fact: бензин+сборщик N раз, без 0.60×N", () => {
  const cost = C.monthVariableCost_({
    rawCost: 25,
    recoverByn: 15,
    deliveriesN: 2,
    packagesByn: 2,
    fracCostByn: 1
  });
  // 25+15+8+6+2+1 = 57
  assert.equal(cost, 57);
});

test("убыточно ниже нуля", () => {
  const a = C.analyze(50, 60);
  assert.equal(a.current, "loss");
  assert.match(a.tiers.find((t) => t.id === "loss").gapLabel, /в минусе 10/);
});

test("html показывает все пять ступеней", () => {
  const h = C.html(70, 56, (s) => String(s));
  assert.match(h, /высокий интерес/);
  assert.match(h, /интересно/);
  assert.match(h, /без интереса/);
  assert.match(h, /невыгодно/);
  assert.match(h, /убыточно/);
  assert.match(h, /nx-coef-interest__row--on/);
});
