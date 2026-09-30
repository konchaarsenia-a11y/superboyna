import test from "node:test";
import assert from "node:assert/strict";
import progress from "./cut-progress.js";

function row(dry, unit, laid, done) {
  return { dry: dry, unit: unit, laid: !!laid, done: !!done };
}

test("1 240 из 2 000 г и 14 из 20 шт — 62, 70 и общая 66", () => {
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
  assert.equal(r.gramsDone, 1240);
  assert.equal(r.gramsAll, 2000);
  assert.equal(r.piecesDone, 14);
  assert.equal(r.piecesAll, 20);
  assert.equal(r.grams, 62);
  assert.equal(r.pieces, 70);
  assert.equal(r.total, 66);
  assert.equal(r.line, "1 240 из 2 000 г, 14 из 20 шт.");
});

test("почти всё: 2 000 из 2 000 г и 18 из 20 шт — 100, 90 и общая 95", () => {
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
  assert.equal(r.grams, 100);
  assert.equal(r.pieces, 90);
  assert.equal(r.total, 95);
  assert.equal(r.line, "2 000 из 2 000 г, 18 из 20 шт.");
});

test("ноль, если ничего не отмечено", () => {
  const r = progress.summarize([
    row(800, "г", false, false),
    row(10, "шт", false, false)
  ]);
  assert.equal(r.total, 0);
  assert.equal(r.grams, 0);
  assert.equal(r.pieces, 0);
  assert.equal(r.line, "0 из 800 г, 0 из 10 шт.");
});

test("только граммы: общая равна доле граммов", () => {
  const r = progress.summarize([row(1000, "г", true, false)]);
  assert.equal(r.grams, 50);
  assert.equal(r.pieces, null);
  assert.equal(r.total, 50);
  assert.equal(r.line, "500 из 1 000 г");
});

test("только штуки: общая равна доле штук", () => {
  const r = progress.summarize([row(20, "шт", false, true)]);
  assert.equal(r.grams, null);
  assert.equal(r.pieces, 100);
  assert.equal(r.total, 100);
});

test("«Нарезано» даёт весь вес, даже если «Выложено» тоже стоит", () => {
  const r = progress.summarize([row(400, "г", true, true)]);
  assert.equal(r.gramsDone, 400);
  assert.equal(r.total, 100);
});

test("пустой список — 0", () => {
  const r = progress.summarize([]);
  assert.equal(r.total, 0);
  assert.equal(r.grams, null);
  assert.equal(r.pieces, null);
  assert.equal(r.line, "0");
});

test("среднее считается по уже округлённым процентам", () => {
  const r = progress.summarize([
    row(3, "г", false, true),
    row(3, "шт", true, false)
  ]);
  assert.equal(r.grams, 100);
  assert.equal(r.pieces, 50);
  assert.equal(r.total, 75);
});
