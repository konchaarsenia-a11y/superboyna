import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(import.meta.url);
const engine = require("./order-engine.js");
const context = { BoinyaOrderEngine: engine };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(here, "ig-labels.js"), "utf8"), context);
const api = context.BoinyaOrderEngine;

function cost(sub, grams) {
  const row = api.retailLineCost("ИНДЕЙКА", sub, grams, "other", { main: "ИНДЕЙКА" });
  return Number(row && (row.cost != null ? row.cost : row.goods)) || 0;
}

test("новые заказы индейки: ломтики, кусочки, мелкие кусочки", () => {
  const fr = api.catalogFractionsForUi_("other", "ИНДЕЙКА").filter((f) => !/^крошк/i.test(String(f)));
  assert.deepEqual(fr, ["Ломтики", "Кусочки", "Мелкое"]);
  assert.equal(api.catalogFractionsForUi_("other", "ИНДЕЙКА").indexOf("Полоски"), -1);
  assert.equal(api.humanFraction("ИНДЕЙКА", "Ломтики"), "ломтики");
  assert.equal(api.humanFraction("ИНДЕЙКА", "Кусочки"), "кусочки");
  assert.equal(api.humanFraction("ИНДЕЙКА", "Мелкое"), "мелкие кусочки");
  assert.equal(cost("Ломтики", 100), 16);
  assert.equal(cost("Кусочки", 100), 17);
  assert.equal(cost("Мелкое", 100), 18);
});

test("старые полоски индейки читаются и не пропадают из каталога", () => {
  assert.equal(api.humanFraction("ИНДЕЙКА", "Полоски"), "полоски");
  assert.equal(cost("Полоски", 100), 17);
  const order = fs.readFileSync(path.join(here, "order-engine.js"), "utf8");
  assert.match(order, /"ИНДЕЙКА": \["Ломтики", "Полоски", "Мелкое"\]/);
  const worker = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
  const gs = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
  assert.match(worker, /"ИНДЕЙКА\|Полоски": 17/);
  assert.match(gs, /"ИНДЕЙКА\|Полоски": \{ per100: 17 \}/);
  assert.ok(api.catalogFractionsForUi_("other", "БАРАНЬЯ ПЕЧЕНЬ").indexOf("Полоски") >= 0);
});
