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

test("граммы: шаг 5 в обе стороны, с 5 вниз в ноль", () => {
  assert.equal(step(0, 1), 5);
  assert.equal(step(5, -1), 0);
  assert.equal(step(5, 1), 10);
  assert.equal(step(10, -1), 5);
  assert.equal(step(10, 1), 15);
  assert.equal(step(15, -1), 10);
  assert.equal(step(15, 1), 20);
  assert.equal(step(20, 1), 25);
  assert.equal(step(25, -1), 20);
  assert.equal(step(45, 1), 50);
  assert.equal(step(50, -1), 45);
  assert.equal(step(50, 1), 55);
  assert.equal(step(100, 1), 105);
  assert.equal(step(100, -1), 95);
});

test("граммы вне сетки шагают к соседним 5 г", () => {
  assert.equal(step(75, -1), 70);
  assert.equal(step(75, 1), 80);
  assert.equal(step(55, -1), 50);
  assert.equal(step(55, 1), 60);
  assert.equal(step(7, 1), 10);
  assert.equal(step(7, -1), 5);
});

test("подбор не уходит ниже 5, строка состава с 5 снимается", () => {
  assert.match(src, /gramStep_\(picker\.qty, pickDir\)/);
  assert.match(src, /Math\.max\(pickPiece \? 1 : 5, pickNext\)/);
  assert.match(src, /if \(next <= 0\) list\.splice\(i, 1\)/);
  assert.match(src, /data-act="pqty"/);
  const clients = fs.readFileSync(path.join(here, "clients.js"), "utf8");
  assert.match(clients, /Math\.max\(5, crumbNext\)/);
});
