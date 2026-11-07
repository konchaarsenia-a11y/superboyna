/**
 * t446u: искусственная копия alinagidayathanova составов — PR723 suggest/slots.
 * Без production write. Доказывает контракт ПП1/ПП2 после split; не monthly economics UI.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolvePpPerDeliverySuggest_,
  splitMonthlyBasketToTwoDeliveries_,
  ppBasketItemKey_,
  ppCloneBasket_
} from "./pp-per-delivery.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const packPath = join(here, "fixtures/pp-n2-alina-copy.harness.json");

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

test("artificial alina copy: staff split 1+2 = monthly", function () {
  const pack = JSON.parse(readFileSync(packPath, "utf8"));
  assert.equal(pack.nick, "zzz_test_pp_n2_alina_copy");
  const split = splitMonthlyBasketToTwoDeliveries_(pack.beforeMonthly);
  assert.equal(split.ok, true);
  // half ≠ monthly: only sum of slots must match
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

test("PR723 suggest: after split, ПП1/ПП2 whole baskets; manual slot 1↔2", function () {
  const pack = JSON.parse(readFileSync(packPath, "utf8"));
  const b1 = pack.afterSplit.basket;
  const b2 = pack.afterSplit.basket2;
  const s1 = resolvePpPerDeliverySuggest_({ basket: b1, basket2: b2, slot: 1, deliveriesN: 2 });
  const s2 = resolvePpPerDeliverySuggest_({ basket: b1, basket2: b2, slot: 2, deliveriesN: 2 });
  assert.equal(s1.compositionSource, "per-delivery");
  assert.equal(s2.compositionSource, "per-delivery");
  assert.equal(s1.legacyNoBasket2, false);
  assert.equal(s2.slot, 2);
  mapsEqual(qtyMap(s1.proposed), qtyMap(b1));
  mapsEqual(qtyMap(s2.proposed), qtyMap(b2));
  // form→save as-is (no second half)
  const saved1 = ppCloneBasket_(s1.proposed);
  const saved2 = ppCloneBasket_(s2.proposed);
  mapsEqual(qtyMap(saved1), qtyMap(b1));
  mapsEqual(qtyMap(saved2), qtyMap(b2));
});

test("N=1 never invents PP2 from stale basket2 on artificial copy", function () {
  const pack = JSON.parse(readFileSync(packPath, "utf8"));
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

test("docs: clients.js cardBasketList_ is basket1-only (economics blocker)", function () {
  const src = readFileSync(join(root, "boinya-c/next/clients.js"), "utf8");
  assert.match(src, /function cardBasketList_/);
  assert.match(src, /себес одной доставки/);
  const start = src.indexOf("function cardBasketList_");
  const body = src.slice(start, start + 250);
  assert.match(body, /card\.basket/);
  assert.doesNotMatch(body, /basket2/);
});
