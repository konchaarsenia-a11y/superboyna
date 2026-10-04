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
const note = "домофон 12";

function retailOf(deliveriesN) {
  return eng.calcRetailBasketTotal(list, { deliveriesN: deliveriesN });
}

function quoteOf(coef, costSum, packagesByn) {
  return P.quotePp({
    scheme: "RAW26",
    coef: coef,
    deliveriesN: 2,
    costSum: costSum,
    list: list,
    packagesByn: packagesByn,
    fracRates: fracs,
    note: note
  });
}

/** Цена и текст как в compose на main e78a2738: факт сервера, иначе quote с пакетами, затем кап RAW26. */
function mainOffer(coef, costSum, fact, packagesByn) {
  const quote = quoteOf(coef, costSum, packagesByn);
  const retail = retailOf(2);
  let sub = fact > 0 ? fact : quote.total;
  sub = P.capOfferSubToDisplayedRetail_(sub, retail.total) || sub;
  const message = P.offerMessage({
    scheme: "RAW26",
    mode: "pp",
    list: list,
    deliveriesN: 2,
    note: note,
    retailTotal: retail.total,
    subTotal: sub,
    dogCount: 1,
    dogNames: { 1: "", 2: "" }
  });
  return { sub: sub, message: message };
}

/** Как buildPpOffer: пакеты внутри quote, затем потолок 92% показанной розницы. */
function nextOffer(coef, costSum, fact, packagesByn, factPacks) {
  const quote = quoteOf(coef, costSum, packagesByn);
  const retail = retailOf(2);
  let sub = fact > 0 ? fact : quote.total;
  if (fact > 0 && packagesByn && !(Number(factPacks) > 0.001)) {
    sub = Math.round((sub + packagesByn) * 100) / 100;
  }
  sub = P.capOfferSubToDisplayedRetail_(sub, retail.total) || sub;
  const messageOpts = {
    scheme: "RAW26",
    mode: "pp",
    list: list,
    deliveriesN: 2,
    note: note,
    retailTotal: retail.total,
    subTotal: sub,
    dogCount: 1,
    dogNames: { 1: "", 2: "" }
  };
  return { sub: sub, message: P.offerMessage(messageOpts), cap: Math.round(retail.total * 0.92 * 100) / 100 };
}

test("без пакетов цена и текст совпадают с main для коэффициентов RAW26", () => {
  const costSum = 2.12;
  const facts = [0, 40];
  for (const coef of [2.0, 2.3, 2.5, 2.6]) {
    for (const fact of facts) {
      const old = mainOffer(coef, costSum, fact, 0);
      const now = nextOffer(coef, costSum, fact, 0);
      assert.equal(now.sub, old.sub, "coef " + coef + " fact " + fact);
      assert.equal(now.message, old.message, "coef " + coef + " fact " + fact);
    }
  }
});

test("пакеты внутри потолка 92% показанной розницы", () => {
  const costSum = 2.12;
  const packagesByn = Math.round(8 * P.PRICE_PACK_UNIT.small * 100) / 100;
  assert.equal(packagesByn, 2.72);
  const retail = retailOf(2);
  const cap = Math.round(retail.total * 0.92 * 100) / 100;
  const bare = nextOffer(2.6, costSum, 0, 0);
  const withPacks = nextOffer(2.6, costSum, 0, packagesByn);
  assert.ok(bare.sub <= cap + 0.001);
  assert.ok(withPacks.sub <= cap + 0.001);
  const shown = withPacks.message.match(/стоимость выходит - (\S+)/)[1];
  assert.equal(shown, String(Math.round(withPacks.sub)));
  assert.ok(Number(shown) <= Math.round(cap));
});

test("расчёт подписки читает пакеты после капа и обновляет текст на месте", () => {
  const calc = clients.slice(clients.indexOf("function paintCalc"), clients.indexOf("function paintPick"));
  const offer = clients.slice(clients.indexOf("async function buildPpOffer"), clients.indexOf("var ppMsgTimer"));
  assert.equal((calc.match(/cl-manual/g) || []).length, 1);
  assert.match(calc, /if \(price\.mode === "retail"\) \{[^}]*cl-manual/);
  assert.match(calc, /id="cxMsg"/);
  assert.match(clients, /setTimeout\(function \(\) \{ refreshLiveMessage\(\); \}, 250\)/);
  assert.match(offer, /packagesByn: packagesByn/);
  assert.match(offer, /var sub = fact > 0 \? fact : quote\.total/);
  assert.match(offer, /if \(price\.scheme === "RAW26"\) sub = P\(\)\.capOfferSubToDisplayedRetail_\(sub, retail\.total\) \|\| sub/);
  assert.doesNotMatch(offer, /messageOpts\.asEntered = true/);
});
