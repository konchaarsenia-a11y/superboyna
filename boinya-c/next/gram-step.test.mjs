import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "orders.js"), "utf8");
const sandbox = {
  window: {},
  document: {},
  addEventListener: function () {}
};
sandbox.window = sandbox;
vm.runInNewContext(src, sandbox, { filename: "orders.js" });
const step = sandbox.BoinyaOrders.gramStep_;

test("граммы: ниже 50 шаг 10, с 50 шаг 50", () => {
  assert.equal(step(50, -1), 40);
  assert.equal(step(40, -1), 30);
  assert.equal(step(30, -1), 20);
  assert.equal(step(20, -1), 10);
  assert.equal(step(10, -1), 0);
  assert.equal(step(10, 1), 20);
  assert.equal(step(20, 1), 30);
  assert.equal(step(30, 1), 40);
  assert.equal(step(40, 1), 50);
  assert.equal(step(50, 1), 100);
  assert.equal(step(100, 1), 150);
  assert.equal(step(150, -1), 100);
  assert.equal(step(100, -1), 50);
});

test("граммы вне сетки шагают к соседнему делению", () => {
  assert.equal(step(75, -1), 50);
  assert.equal(step(75, 1), 100);
  assert.equal(step(15, -1), 10);
  assert.equal(step(15, 1), 20);
  assert.equal(step(55, -1), 50);
  assert.equal(step(55, 1), 100);
  assert.equal(step(5, 1), 10);
});

test("подбор не уходит ниже 10, строка состава с 10 снимается", () => {
  assert.match(src, /gramStep_\(picker\.qty, pickDir\)/);
  assert.match(src, /Math\.max\(pickPiece \? 1 : 10, pickNext\)/);
  assert.match(src, /if \(next <= 0\) list\.splice\(i, 1\)/);
  assert.match(src, /data-act="pqty"/);
});
