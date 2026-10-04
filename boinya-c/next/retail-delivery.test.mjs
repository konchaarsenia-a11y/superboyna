import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const E = require("./order-engine.js");
const P = require("./price-logic.js");
const src = fs.readFileSync(path.join(here, "clients.js"), "utf8");
const sandbox = { window: {}, document: {}, addEventListener: function () {} };
sandbox.window = sandbox;
sandbox.BoinyaOrderEngine = E;
sandbox.BoinyaPrice = P;
vm.runInNewContext(src, sandbox, { filename: "clients.js" });
const choice = sandbox.BoinyaClients.retailCalcChoice_;

const small = [{ cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", value: 100 }];
const big = [{ cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", value: 1000 }];

test("по умолчанию сбор как в прайсе: ниже порога платно, выше бесплатно", () => {
  const low = choice(E, small, "");
  const high = choice(E, big, "");
  assert.equal(low.mode, "paid");
  assert.equal(low.delivery, 9);
  assert.equal(low.note, "+9 р");
  assert.equal(low.total, Math.round((low.goods + 9) * 100) / 100);
  assert.equal(high.mode, "free");
  assert.equal(high.delivery, 0);
  assert.equal(high.note, "доставка не считается");
  assert.equal(high.total, high.goods);
  assert.equal(low.note.includes("·"), false);
  assert.equal(high.note.includes("·"), false);
});

test("нажатие перекрывает правило и меняет итог", () => {
  const forcedFree = choice(E, small, "free");
  assert.equal(forcedFree.mode, "free");
  assert.equal(forcedFree.delivery, 0);
  assert.equal(forcedFree.total, forcedFree.goods);
  assert.equal(forcedFree.note, "доставка не считается");
  const forcedPaid = choice(E, big, "paid");
  assert.equal(forcedPaid.mode, "paid");
  assert.equal(forcedPaid.delivery, 9);
  assert.equal(forcedPaid.note, "+9 р");
  assert.equal(forcedPaid.total, Math.round((forcedPaid.goods + 9) * 100) / 100);
});

test("текст клиенту без строки доставки, итог из переключателя", () => {
  const paid = choice(E, small, "paid");
  const free = choice(E, small, "free");
  const msgPaid = P.composeRetailClientMessage(small, paid.total, "");
  const msgFree = P.composeRetailClientMessage(small, free.total, "");
  assert.doesNotMatch(msgPaid, /Доставка/);
  assert.doesNotMatch(msgFree, /Доставка/);
  assert.notEqual(msgPaid, msgFree);
  assert.match(src, /Платная доставка/);
  assert.match(src, /Без доставки/);
  assert.match(src, /price\.retailDelivery = ""/);
});
