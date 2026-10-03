import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const P = require("./price-logic.js");
const eng = require("./order-engine.js");
const clients = fs.readFileSync(path.join(here, "clients.js"), "utf8");

const list = [{ cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", val: 50, value: 50 }];
const fracs = { slices: 0, strips: 1, large: 1, medium: 2, small: 3, extraSmall: 4 };
const line = eng.retailLineCost("ЛЁГКОЕ", "Среднее", 50, "dressura", {});
const costSum = Math.round((line.cost / 2.6) * 100) / 100;

function quote(packagesByn) {
  return P.quotePp({
    scheme: "RAW26",
    coef: 2.6,
    deliveriesN: 2,
    costSum: costSum,
    list: list,
    packagesByn: packagesByn,
    fracRates: fracs
  });
}

function offerLine(sub) {
  const retail = eng.calcRetailBasketTotal(list, { deliveriesN: 2 });
  const msg = P.offerMessage({
    scheme: "RAW26",
    mode: "pp",
    list: list,
    deliveriesN: 2,
    retailTotal: retail.total,
    subTotal: sub,
    asEntered: true
  });
  const m = msg.match(/стоимость выходит - (\S+)/);
  return m ? m[1] : "";
}

test("пакеты меняют итог подписки по прайсу пакетов", () => {
  const none = quote(0);
  const fourSmall = quote(4 * P.PRICE_PACK_UNIT.small);
  assert.equal(Math.round(4 * P.PRICE_PACK_UNIT.small * 100) / 100, 1.36);
  assert.ok(fourSmall.total > none.total + 0.5, none.total + " → " + fourSmall.total);
  assert.notEqual(offerLine(none.total), offerLine(fourSmall.total));
});

test("расчёт подписки читает пакеты в цену и обновляет текст на месте", () => {
  const calc = clients.slice(clients.indexOf("function paintCalc"), clients.indexOf("function paintPick"));
  assert.equal((calc.match(/cl-manual/g) || []).length, 1);
  assert.match(calc, /if \(price\.mode === "retail"\) \{[^}]*cl-manual/);
  assert.match(calc, /id="cxMsg"/);
  assert.match(clients, /setTimeout\(function \(\) \{ refreshLiveMessage\(\); \}, 250\)/);
  assert.match(clients, /var sub = Number\(quote\.total\)/);
  assert.match(clients, /asEntered: true/);
  assert.match(clients, /packagesBynNow/);
  assert.match(clients, /PRICE_PACK_UNIT/);
  assert.doesNotMatch(clients, /fact > 0 \? fact : quote\.total/);
});
