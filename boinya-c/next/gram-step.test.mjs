import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const src = fs.readFileSync(path.join(here, "orders.js"), "utf8");
const sandbox = {
  window: {},
  document: {},
  addEventListener: function () {}
};
sandbox.window = sandbox;
vm.runInNewContext(src, sandbox, { filename: "orders.js" });
const step = sandbox.BoinyaOrders.gramStep_;
const bump = sandbox.BoinyaOrders.gramBump_;
const parse = sandbox.BoinyaOrders.parseGramText_;
const P = require("./price-logic.js");

test("кнопки граммов шагают по 5, с 5 вниз в ноль", () => {
  assert.equal(step(0, 1), 5);
  assert.equal(step(5, -1), 0);
  assert.equal(step(5, 1), 10);
  assert.equal(step(7, 1), 10);
  assert.equal(step(7, -1), 5);
  assert.equal(step(1, 1), 5);
  assert.equal(step(1, -1), 0);
  assert.equal(step(100, -1), 95);
});

test("пустое поле не подставляет 200, плюс ставит 5", () => {
  assert.equal(bump("", 1), 5);
  assert.equal(bump(null, 1), 5);
  assert.equal(bump("", -1), "");
  assert.equal(bump(5, 1), 10);
  assert.equal(bump(5, -1), "");
  assert.equal(src.includes("qty: 200"), false);
});

test("ручной ввод хранит целое как написали", () => {
  assert.equal(parse("7").n, 7);
  assert.equal(parse("12").n, 12);
  assert.equal(parse("1").n, 1);
  assert.equal(parse(" 25 ").n, 25);
  assert.equal(parse("").empty, true);
  assert.equal(parse("0").zero, true);
  assert.equal(parse("1.5").bad, "frac");
  assert.equal(parse("1,5").bad, "frac");
  assert.equal(parse("7").n, 7);
});

test("поле граммов в подборе, строке и крошке, штуки без поля", () => {
  assert.match(src, /function gramQtyHtml/);
  assert.match(src, /inputmode="numeric"/);
  assert.match(src, /data-act="' \+ act \+ '-in"/);
  assert.match(src, /gramBump_\(picker\.qty, pickDir\)/);
  assert.match(src, /placeholder="г"/);
  assert.match(src, /picker\.cat === "chew" \? 1 : ""/);
  assert.match(src, /if \(next <= 0\) list\.splice\(i, 1\)/);
  assert.match(src, /it\.gramManual = true/);
  assert.match(src, /pieceQty_\(picker\.cat, picker\.name, unit\)/);
  assert.match(src, /b-step__val/);
  const clients = fs.readFileSync(path.join(here, "clients.js"), "utf8");
  assert.match(clients, /gramBump_\(crumbDraft\.qty, crumbDir\)/);
  assert.match(clients, /qty: ""/);
  assert.match(clients, /cl-gqty/);
  assert.match(clients, /cl-pick-g/);
  assert.match(clients, /parseGramText_/);
  assert.match(src, /gramQtyHtml\(a\.qty, draft\.qty, "г"/);
  const prod = fs.readFileSync(path.join(here, "production.js"), "utf8");
  assert.match(prod, /inputmode=\\"numeric\\" data-dry=/);
  assert.match(prod, /Только целые граммы/);
});

test("урезание бюджета не переписывает ручные граммы", () => {
  const scaled = P.pricePickScaleForBudget_([
    { cat: "dressura", main: "ЛЁГКОЕ", value: 7, val: 7, gramManual: true },
    { cat: "dressura", main: "СЕРДЦЕ", value: 40, val: 40 }
  ], 0.01);
  assert.equal(scaled[0].value, 7);
  assert.equal(scaled[0].val, 7);
  assert.equal(scaled[1].value, 5);
});
