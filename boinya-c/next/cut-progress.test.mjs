import test from "node:test";
import assert from "node:assert/strict";
import progress from "./cut-progress.js";

function row(dry, unit, laid, done) {
  return { dry: dry, unit: unit, laid: !!laid, done: !!done };
}

test("нарезано 45% и выложено 87% дают итог 53%", () => {
  const items = [
    row(800, "г", true, true),
    row(600, "г", true, false),
    row(280, "г", true, false),
    row(320, "г", false, false),
    row(10, "шт", true, true),
    row(8, "шт", true, false),
    row(2, "шт", false, false)
  ];
  const r = progress.summarize(items);
  assert.equal(r.cut, 45);
  assert.equal(r.laid, 87);
  assert.equal(r.total, 53);
  assert.equal(r.grams, null);
  assert.equal(r.pieces, null);
  assert.equal(r.line, "нарезано 45% + выложено 87% = 0,8×45 + 0,2×87 = 53%");
  assert.doesNotMatch(r.line, /г|шт/);
});

test("почти всё: 95% нарезки и 95% выкладки — итог 95%", () => {
  const items = [
    row(800, "гр", true, true),
    row(600, "гр", true, true),
    row(280, "гр", true, true),
    row(320, "гр", true, true),
    row(10, "шт.", true, true),
    row(8, "шт.", true, true),
    row(2, "шт.", false, false)
  ];
  const r = progress.summarize(items);
  assert.equal(r.cut, 95);
  assert.equal(r.laid, 95);
  assert.equal(r.total, 95);
});

test("ноль, если ничего не отмечено", () => {
  const r = progress.summarize([
    row(800, "г", false, false),
    row(10, "шт", false, false)
  ]);
  assert.equal(r.total, 0);
  assert.equal(r.cut, 0);
  assert.equal(r.laid, 0);
});

test("только выложено: 20% итога", () => {
  const r = progress.summarize([row(1000, "г", true, false)]);
  assert.equal(r.cut, 0);
  assert.equal(r.laid, 100);
  assert.equal(r.total, 20);
});

test("только нарезано: 80% итога", () => {
  const r = progress.summarize([row(20, "шт", false, true)]);
  assert.equal(r.cut, 100);
  assert.equal(r.laid, 0);
  assert.equal(r.total, 80);
});

test("оба флага дают 100%", () => {
  const r = progress.summarize([row(400, "г", true, true)]);
  assert.equal(r.cut, 100);
  assert.equal(r.laid, 100);
  assert.equal(r.total, 100);
});

test("пустой список — 0", () => {
  const r = progress.summarize([]);
  assert.equal(r.total, 0);
  assert.equal(r.line, "нарезано 0% + выложено 0% = 0,8×0 + 0,2×0 = 0%");
});

test("этапы усредняются по уже округлённым процентам, итог 80/20", () => {
  const r = progress.summarize([
    row(3, "г", false, true),
    row(3, "шт", true, false)
  ]);
  assert.equal(r.cut, 50);
  assert.equal(r.laid, 50);
  assert.equal(r.total, 50);
});
