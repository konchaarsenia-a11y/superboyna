/**
 * t448u UI-only: месячный fact = basket1+basket2 при N≥2; stated preserve.
 * Без per-delivery worker. Искусственная копия sub37.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const P = require("./price-logic.js");
const eng = require("./order-engine.js");

const here = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(
  readFileSync(join(here, "fixtures/pp-n2-alina-copy.harness.json"), "utf8")
);

const FRACS = { slices: 0, strips: 1, large: 1, medium: 2, small: 3, extraSmall: 4 };
const PACKS = { u1: 0, u2: 4, u3: 6, up4: 2 };
const COEF = "2.3";
const STATED = "145";
const FACT = 145.43;

function monthN(raw) {
  const n = Math.round(Number(String(raw == null ? "" : raw).replace(",", ".")) || 0);
  return n >= 1 ? n : 1;
}

/** Зеркало clients.js cardBasketList_ (t448u). */
function cardBasketListMirror_(card) {
  if (!card) return [];
  const n = monthN(card.deliveries || 1);
  const out = (card.basket || []).slice();
  if (n >= 2) {
    const b2 = card.basket2 || [];
    for (let i = 0; i < b2.length; i++) out.push(b2[i]);
  }
  return out;
}

/** Зеркало cardOverwriteStated_ default. */
function overwriteStatedDefault_(card, opts) {
  opts = opts || {};
  if (opts.overwriteStated === false) return false;
  if (opts.overwriteStated === true) return true;
  if (card && card.coefTouched) return true;
  const n = Number(String(card && card.statedCost != null ? card.statedCost : "").replace(",", "."));
  return !(isFinite(n) && n > 0);
}

function itemKey(it) {
  return (
    String(it.cat || "").toLowerCase() +
    "|" +
    String(it.main || it.name || "").toUpperCase() +
    "|" +
    String(it.sub || "").toUpperCase()
  );
}

function qtyMap(list) {
  const m = Object.create(null);
  (list || []).forEach(function (it) {
    const v = Number(it.value != null ? it.value : it.val) || 0;
    if (v <= 0) return;
    const k = itemKey(it);
    m[k] = (m[k] || 0) + v;
  });
  return m;
}

function mapsEqual(a, b) {
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  Object.keys(a).forEach(function (k) {
    assert.equal(a[k], b[k], k);
  });
}

function toLocal(list) {
  return eng.mapApiBasketToLocal(
    (list || []).map(function (it) {
      return {
        cat: it.cat,
        main: it.main || it.name,
        name: it.name || it.main,
        sub: it.sub || "",
        val: it.value != null ? it.value : it.val
      };
    })
  );
}

function quote(list, rawCost, nDel) {
  const q = P.quotePp({
    scheme: "RAW26",
    coef: COEF,
    deliveriesN: nDel,
    costSum: rawCost,
    list: toLocal(list),
    packagesByn: P.packagesBynFromUCountsLocal_(PACKS),
    fracRates: FRACS
  });
  return Math.round(Number(q.total) * 100) / 100;
}

function invertRaw(list, fact, nDel) {
  const loc = toLocal(list);
  const recover = P.recoverBynFromBasketLocal_(loc) || 0;
  const frac = Number(P.calcDressuraFractionMarkup(loc, FRACS).total) || 0;
  const fixed = recover + 7.6 * nDel + P.packagesBynFromUCountsLocal_(PACKS) + frac;
  return Math.round(((Number(fact) - fixed) / Number(COEF)) * 100) / 100;
}

test("legacy N2 empty basket2: monthly list == basket1 only", function () {
  const card = { deliveries: 2, basket: pack.beforeMonthly, basket2: [] };
  mapsEqual(qtyMap(cardBasketListMirror_(card)), qtyMap(pack.beforeMonthly));
});

test("N1 ignores stale basket2", function () {
  const card = {
    deliveries: 1,
    basket: pack.afterSplit.basket,
    basket2: pack.afterSplit.basket2
  };
  mapsEqual(qtyMap(cardBasketListMirror_(card)), qtyMap(pack.afterSplit.basket));
});

test("N2 split: fact 145.43 before=after; stated 145 frozen on save/reopen", function () {
  const raw = invertRaw(pack.beforeMonthly, FACT, 2);
  const before = {
    deliveries: 2,
    basket: pack.beforeMonthly,
    basket2: [],
    statedCost: STATED,
    coef: COEF,
    packCounts: PACKS,
    calcFactCost: ""
  };
  const after = {
    deliveries: 2,
    basket: pack.afterSplit.basket,
    basket2: pack.afterSplit.basket2,
    statedCost: STATED,
    coef: COEF,
    packCounts: PACKS,
    calcFactCost: "",
    priceDirty: true
  };
  const factBefore = quote(cardBasketListMirror_(before), raw, 2);
  const factAfter = quote(cardBasketListMirror_(after), raw, 2);
  assert.equal(factBefore, FACT);
  assert.equal(factAfter, FACT);
  assert.equal(quote(pack.afterSplit.basket, raw, 2), 111.87);

  // save refresh: overwriteStated false → stated stays
  assert.equal(overwriteStatedDefault_(after, { overwriteStated: false }), false);
  after.calcFactCost = String(factAfter);
  assert.equal(String(after.statedCost), STATED);

  // reopen: stated still 145, fact still monthly
  const reopened = {
    deliveries: 2,
    basket: after.basket,
    basket2: after.basket2,
    statedCost: after.statedCost,
    coef: after.coef,
    packCounts: after.packCounts
  };
  assert.equal(String(reopened.statedCost), STATED);
  assert.equal(quote(cardBasketListMirror_(reopened), raw, 2), FACT);
  assert.equal(overwriteStatedDefault_(reopened, {}), false);
});

test("clients.js source has t448u sum + stated preserve", function () {
  const src = readFileSync(join(here, "clients.js"), "utf8");
  assert.match(src, /function cardBasketList_/);
  assert.match(src, /t448u/);
  assert.match(src, /basket2/);
  assert.match(src, /function cardOverwriteStated_/);
  assert.match(src, /overwriteStated: false/);
  // default no longer forces overwriteStated:true on sync apply
  const start = src.indexOf("function scheduleCardPpRecalc_");
  const chunk = src.slice(start, start + 900);
  assert.doesNotMatch(chunk, /applyCardPpQuoteLocal_\(\{\s*overwriteStated:\s*true\s*\}\)/);
});
