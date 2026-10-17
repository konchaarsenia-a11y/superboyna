import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const F = require("./formulas.js");
const prodSrc = fs.readFileSync(path.join(dir, "production.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(dir, "stats.js"), "utf8");

test("выплата курьера — те же 4 BYN, что дорога", () => {
  assert.equal(F.courierPayPer_, 4);
  assert.equal(F.formulaParts_({ N: 1 }).road, 4);
  assert.equal(F.formulaParts_({ N: 4 }).road, 16);
  assert.equal(F.formulaRetail_({ N: 4, S: 0, G: 0, P: 0, R: 0 }).road, 16);
  assert.equal(F.courierDayPay_(4), 16);
  assert.equal(F.courierDayPay_(0), 0);
  assert.equal(F.courierDayPay_(-3), 0);
  const cards = [
    { name: "a", delivered: true },
    { name: "b", delivered: true },
    { name: "c", delivered: true },
    { name: "d", delivered: true },
    { name: "e", delivered: false },
    { name: "f", delivered: false }
  ];
  assert.equal(F.courierDayPayOf_(cards), 16);
  assert.equal(F.courierDayPayOf_([{ delivered: true, twoDogs: true }]), 4);
});

test("экран курьера считает выплату и не ставит прочерк", () => {
  assert.doesNotMatch(prodSrc, /value:\s*"—",\s*label:\s*"Выплата"/);
  assert.match(prodSrc, /courierDayPayOf_/);
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    clearInterval,
    setInterval,
    document: { getElementById() { return null; }, addEventListener() {} },
    Object,
    Array,
    String,
    Number,
    Math,
    Date,
    JSON,
    isFinite,
    BoinyaFormulas: F,
    BoinyaShell: {
      esc: function (s) {
        return String(s == null ? "" : s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(prodSrc, sandbox, { filename: "production.js" });
  const cards = [
    { delivered: true },
    { delivered: true },
    { delivered: true },
    { delivered: true },
    { delivered: false },
    { delivered: false }
  ];
  const html = sandbox.BoinyaProduction.previewRoutePay_(cards);
  assert.match(html, /16 BYN/);
  assert.match(html, />4</);
  assert.match(html, />2</);
  assert.equal(html.includes(">—<"), false);
  assert.equal(sandbox.BoinyaProduction.previewRoutePay_(cards), html);
});

test("ПП2 не входит в сбор и не спрашивает оплату, выплата за карточку остаётся", () => {
  const L = require("./week-logic.js");
  const pp1 = { segment: "ПП", deliveriesN: 2, ppSlot: "1/2", orderPrice: 70, paid: "", delivered: true };
  const pp2 = {
    segment: "ПП",
    deliveriesN: 2,
    ppSlot: "2/2",
    deliverySlot: 2,
    orderPrice: 80,
    paid: "yes",
    siblingPaid: "no",
    delivered: true
  };
  const retail = { segment: "Р", orderPrice: 9, delivered: false };
  assert.equal(L.courierShouldAskPaid(pp2), false);
  assert.equal(L.courierShouldAskPaid(pp1), true);
  assert.equal(L.courierStopMoney(pp2), null);
  assert.equal(L.courierCollectSum([pp1, pp2, retail]), 79);
  assert.equal(F.courierDayPayOf_([pp1, pp2, retail]), 8);
});

test("статистика показывает ту же дорогу как выплату", () => {
  assert.match(statsSrc, /line\("Выплата", now \? moneyText\(now\.road\)/);
  assert.match(statsSrc, /4 BYN на каждую отвезено доставку/);
});
