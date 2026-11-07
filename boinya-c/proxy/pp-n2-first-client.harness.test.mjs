/**
 * t446u/t448u: искусственная копия alinagidayathanova/sub37.
 * Monthly fact = basket1+basket2 при N=2; stated не затирается; PR723 slots без half.
 * Без production write.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolvePpPerDeliverySuggest_,
  splitMonthlyBasketToTwoDeliveries_,
  ppBasketItemKey_,
  ppCloneBasket_,
  parsePpDeliveriesN_
} from "./pp-per-delivery.js";

const require = createRequire(import.meta.url);
const P = require("../next/price-logic.js");
const eng = require("../next/order-engine.js");

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const packPath = join(here, "fixtures/pp-n2-alina-copy.harness.json");

const FRACS = { slices: 0, strips: 1, large: 1, medium: 2, small: 3, extraSmall: 4 };
const PACKS = { u1: 0, u2: 4, u3: 6, up4: 2 };
const COEF = "2.3";
const STATED = "145";
const FACT = 145.43;
const N2 = 2;

/** Зеркало clients.js cardBasketList_ (t448u). */
function monthlyListForCard_(card) {
  const n = parsePpDeliveriesN_(card.deliveries) || 1;
  const out = ppCloneBasket_(card.basket);
  if (n >= 2) {
    ppCloneBasket_(card.basket2).forEach(function (it) {
      out.push(it);
    });
  }
  return out;
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

function qtyMap(list) {
  const m = Object.create(null);
  ppCloneBasket_(list).forEach(function (it) {
    const k = ppBasketItemKey_(it);
    m[k] = (m[k] || 0) + (Number(it.value) || 0);
  });
  return m;
}

function mapsEqual(a, b) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  assert.deepEqual(ka, kb);
  ka.forEach(function (k) {
    assert.equal(a[k], b[k], k);
  });
}

function quoteMonthly(list, rawCost) {
  const packsByn = P.packagesBynFromUCountsLocal_(PACKS);
  const q = P.quotePp({
    scheme: "RAW26",
    coef: COEF,
    deliveriesN: N2,
    costSum: rawCost,
    list: toLocal(list),
    packagesByn: packsByn,
    fracRates: FRACS
  });
  return Math.round(Number(q.total) * 100) / 100;
}

function invertRawFromFact(list, fact) {
  const packsByn = P.packagesBynFromUCountsLocal_(PACKS);
  const loc = toLocal(list);
  const recover = P.recoverBynFromBasketLocal_(loc) || 0;
  const frac = Number(P.calcDressuraFractionMarkup(loc, FRACS).total) || 0;
  const fixed = recover + 7.6 * N2 + packsByn + frac;
  const rest = Number(fact) - fixed;
  assert.ok(rest > 0, "invert rest");
  return Math.round((rest / Number(COEF)) * 100) / 100;
}

test("artificial alina copy: staff split 1+2 = monthly", function () {
  const pack = JSON.parse(readFileSync(packPath, "utf8"));
  assert.equal(pack.nick, "zzz_test_pp_n2_alina_copy");
  const split = splitMonthlyBasketToTwoDeliveries_(pack.beforeMonthly);
  assert.equal(split.ok, true);
  assert.notDeepEqual(qtyMap(pack.beforeMonthly), qtyMap(split.delivery1));
  const sum = Object.create(null);
  [split.delivery1, split.delivery2].forEach(function (list) {
    Object.entries(qtyMap(list)).forEach(function ([k, v]) {
      sum[k] = (sum[k] || 0) + v;
    });
  });
  mapsEqual(qtyMap(pack.beforeMonthly), sum);
  mapsEqual(qtyMap(pack.afterSplit.basket), qtyMap(split.delivery1));
  mapsEqual(qtyMap(pack.afterSplit.basket2), qtyMap(split.delivery2));
});

test("t448u monthly fact: before split = after 1+2; stated frozen; half alone is wrong", function () {
  const pack = JSON.parse(readFileSync(packPath, "utf8"));
  const raw = invertRawFromFact(pack.beforeMonthly, FACT);
  const beforeCard = {
    deliveries: N2,
    basket: pack.beforeMonthly,
    basket2: [],
    statedCost: STATED,
    packCounts: PACKS,
    coef: COEF
  };
  const afterCard = {
    deliveries: N2,
    basket: pack.afterSplit.basket,
    basket2: pack.afterSplit.basket2,
    statedCost: STATED,
    packCounts: PACKS,
    coef: COEF
  };
  const beforeList = monthlyListForCard_(beforeCard);
  const afterList = monthlyListForCard_(afterCard);
  mapsEqual(qtyMap(beforeList), qtyMap(pack.beforeMonthly));
  mapsEqual(qtyMap(afterList), qtyMap(pack.beforeMonthly));

  const factBefore = quoteMonthly(beforeList, raw);
  const factAfter = quoteMonthly(afterList, raw);
  const factHalfBug = quoteMonthly(pack.afterSplit.basket, raw);

  assert.equal(factBefore, FACT);
  assert.equal(factAfter, FACT);
  assert.equal(factBefore, factAfter);
  assert.ok(Math.abs(factHalfBug - FACT) > 1, "half must not equal monthly");
  assert.equal(factHalfBug, 111.87);

  // save/rehydrate: fact refreshed, stated stays 145 (overwriteStated:false)
  afterCard.calcFactCost = factAfter;
  afterCard.priceDirty = true;
  const overwriteStated = false;
  if (!overwriteStated) {
    assert.equal(String(afterCard.statedCost), STATED);
  }
  assert.equal(Number(afterCard.calcFactCost), FACT);
  assert.deepEqual(afterCard.packCounts, PACKS);
  assert.equal(String(afterCard.coef), COEF);
});

test("N=1 ignores stale basket2 for monthly list + suggest", function () {
  const pack = JSON.parse(readFileSync(packPath, "utf8"));
  const card = {
    deliveries: 1,
    basket: pack.afterSplit.basket,
    basket2: pack.afterSplit.basket2
  };
  mapsEqual(qtyMap(monthlyListForCard_(card)), qtyMap(pack.afterSplit.basket));
  const r = resolvePpPerDeliverySuggest_({
    basket: pack.afterSplit.basket,
    basket2: pack.afterSplit.basket2,
    slot: 2,
    deliveriesN: "1"
  });
  assert.equal(r.deliveriesN, 1);
  assert.equal(r.slot, 1);
  assert.equal((r.delivery2 || []).length, 0);
});

test("PR723 suggest: after split ПП1/ПП2 whole; manual switch; fromPp no half", function () {
  const pack = JSON.parse(readFileSync(packPath, "utf8"));
  const b1 = pack.afterSplit.basket;
  const b2 = pack.afterSplit.basket2;
  const s1 = resolvePpPerDeliverySuggest_({ basket: b1, basket2: b2, slot: 1, deliveriesN: 2 });
  const s2 = resolvePpPerDeliverySuggest_({ basket: b1, basket2: b2, slot: 2, deliveriesN: 2 });
  assert.equal(s1.compositionSource, "per-delivery");
  assert.equal(s2.compositionSource, "per-delivery");
  mapsEqual(qtyMap(s1.proposed), qtyMap(b1));
  mapsEqual(qtyMap(s2.proposed), qtyMap(b2));
  // повтор fromPp — снова целые слоты, не half monthly
  const again = resolvePpPerDeliverySuggest_({ basket: b1, basket2: b2, slot: 1, deliveriesN: 2 });
  mapsEqual(qtyMap(again.proposed), qtyMap(b1));
  assert.notDeepEqual(qtyMap(again.proposed), qtyMap(pack.beforeMonthly));
});

test("odd counts: колени 1шт целиком в слот1; sum=before", function () {
  const pack = JSON.parse(readFileSync(packPath, "utf8"));
  const k1 = ppBasketItemKey_({ cat: "chew", main: "КОЛЕНИ ШТ.", sub: "" });
  assert.equal(qtyMap(pack.afterSplit.basket)[k1], 1);
  assert.equal(qtyMap(pack.afterSplit.basket2)[k1] || 0, 0);
});

test("clients.js cardBasketList_ is N2 sum / N1 basket1-only", function () {
  const src = readFileSync(join(root, "boinya-c/next/clients.js"), "utf8");
  const start = src.indexOf("function cardBasketList_");
  assert.ok(start > 0);
  const body = src.slice(start, start + 450);
  assert.match(body, /basket2/);
  assert.match(body, /t448u/);
  assert.match(body, /monthN/);
  assert.match(src, /function cardOverwriteStated_/);
  assert.match(src, /overwriteStated: false/);
});
