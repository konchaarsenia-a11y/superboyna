/**
 * t441u/t451u/t454u: auto N2 split + manual toggle; no repeated half; N1 whole.
 * Runtime handlers — без invertRaw-тождества.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePpDeliveriesN_,
  parsePpManualDist_,
  resolvePpPerDeliverySuggest_,
  splitQtyForPpSlot_,
  splitMonthlyBasketToTwoDeliveries_,
  materializePpAutoSplit_,
  inferPpManualDistribution_,
  ppMergeBasketsAsMonthly_,
  ppQtyMap_,
  ppBasketItemKey_
} from "./pp-per-delivery.js";

function qty(list, main, sub) {
  let n = 0;
  (list || []).forEach(function (it) {
    if (String(it.main || it.name) !== main) return;
    if (String(it.sub || "") !== String(sub || "")) return;
    n += Number(it.value != null ? it.value : it.val) || 0;
  });
  return n;
}

/** t452u owner: 300 лёгкого / 100 рубца / 150 почек → каждая 150/50/75 */
const t452Monthly = [
  { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", value: 300, val: 300 },
  { cat: "dressura", main: "РУБЕЦ Т", name: "РУБЕЦ Т", sub: "Крупное", value: 100, val: 100 },
  { cat: "dressura", main: "ПОЧКИ", name: "ПОЧКИ", sub: "Ломтики", value: 150, val: 150 }
];

test("parsePpDeliveriesN_ and manual flag", function () {
  assert.equal(parsePpDeliveriesN_("2"), 2);
  assert.equal(parsePpDeliveriesN_("1/2"), 2);
  assert.equal(parsePpManualDist_("1"), true);
  assert.equal(parsePpManualDist_("0"), false);
  assert.equal(parsePpManualDist_(undefined), false);
});

test("t452u: 300/100/150 → each delivery 150/50/75; sum preserved", function () {
  const split = splitMonthlyBasketToTwoDeliveries_(t452Monthly);
  assert.equal(split.ok, true);
  assert.equal(qty(split.delivery1, "ЛЁГКОЕ", "Среднее"), 150);
  assert.equal(qty(split.delivery2, "ЛЁГКОЕ", "Среднее"), 150);
  assert.equal(qty(split.delivery1, "РУБЕЦ Т", "Крупное"), 50);
  assert.equal(qty(split.delivery2, "РУБЕЦ Т", "Крупное"), 50);
  assert.equal(qty(split.delivery1, "ПОЧКИ", "Ломтики"), 75);
  assert.equal(qty(split.delivery2, "ПОЧКИ", "Ломтики"), 75);
  const merged = ppMergeBasketsAsMonthly_(split.delivery1, split.delivery2);
  assert.deepEqual(ppQtyMap_(merged), ppQtyMap_(t452Monthly));
});

test("t453u: N1 → 300/100/150 целиком, не half и не ПП2", function () {
  const r = resolvePpPerDeliverySuggest_({
    basket: t452Monthly,
    basket2: [{ cat: "dressura", main: "ЛЁГКОЕ", sub: "Среднее", value: 999 }],
    slot: 2,
    deliveriesN: 1
  });
  assert.equal(r.compositionSource, "n1-whole");
  assert.equal(r.slot, 1);
  assert.equal(qty(r.proposed, "ЛЁГКОЕ", "Среднее"), 300);
  assert.equal(qty(r.proposed, "РУБЕЦ Т", "Крупное"), 100);
  assert.equal(qty(r.proposed, "ПОЧКИ", "Ломтики"), 150);
  assert.equal((r.delivery2 || []).length, 0);
});

test("odd chew: 3 уха → 2+1; odd dressura 101 → 51+50 (первая больше)", function () {
  assert.equal(splitQtyForPpSlot_(3, true, 1), 2);
  assert.equal(splitQtyForPpSlot_(3, true, 2), 1);
  assert.equal(splitQtyForPpSlot_(101, false, 1), 51);
  assert.equal(splitQtyForPpSlot_(101, false, 2), 50);
  const odd = [
    { cat: "chew", main: "УХО Г", name: "УХО Г", sub: "Обычное", value: 3, val: 3 },
    { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", value: 200, val: 200 }
  ];
  const split = splitMonthlyBasketToTwoDeliveries_(odd);
  assert.equal(qty(split.delivery1, "УХО Г", "Обычное"), 2);
  assert.equal(qty(split.delivery2, "УХО Г", "Обычное"), 1);
  assert.equal(qty(split.delivery1, "ЛЁГКОЕ", "Среднее"), 100);
  assert.equal(qty(split.delivery2, "ЛЁГКОЕ", "Среднее"), 100);
});

test("N2 empty basket2: auto-split for order slots (not full monthly, not empty)", function () {
  const r1 = resolvePpPerDeliverySuggest_({
    basket: t452Monthly,
    basket2: [],
    slot: 1,
    deliveriesN: 2
  });
  const r2 = resolvePpPerDeliverySuggest_({
    basket: t452Monthly,
    basket2: [],
    slot: 2,
    deliveriesN: 2
  });
  assert.equal(r1.compositionSource, "n2-auto-split");
  assert.equal(qty(r1.proposed, "ЛЁГКОЕ", "Среднее"), 150);
  assert.equal(qty(r2.proposed, "ЛЁГКОЕ", "Среднее"), 150);
  assert.equal(qty(r1.proposed, "РУБЕЦ Т", "Крупное"), 50);
  assert.equal(qty(r2.proposed, "ПОЧКИ", "Ломтики"), 75);
});

test("saved split not halved again on suggest/repeat", function () {
  const split = splitMonthlyBasketToTwoDeliveries_(t452Monthly);
  const once = resolvePpPerDeliverySuggest_({
    basket: split.delivery1,
    basket2: split.delivery2,
    slot: 1,
    deliveriesN: 2
  });
  const again = resolvePpPerDeliverySuggest_({
    basket: once.proposed,
    basket2: split.delivery2,
    slot: 1,
    deliveriesN: 2
  });
  assert.equal(qty(once.proposed, "ЛЁГКОЕ", "Среднее"), 150);
  assert.equal(qty(again.proposed, "ЛЁГКОЕ", "Среднее"), 150);
  assert.notEqual(qty(again.proposed, "ЛЁГКОЕ", "Среднее"), 75);
});

test("manual unequal preserved; infer manual; order takes whole", function () {
  const d1 = [
    { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", value: 200, val: 200 },
    { cat: "dressura", main: "РУБЕЦ Т", name: "РУБЕЦ Т", sub: "Крупное", value: 80, val: 80 }
  ];
  const d2 = [
    { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", value: 100, val: 100 },
    { cat: "dressura", main: "РУБЕЦ Т", name: "РУБЕЦ Т", sub: "Крупное", value: 20, val: 20 }
  ];
  assert.equal(
    inferPpManualDistribution_({ deliveriesN: 2, basket: d1, basket2: d2, ppManualDist: "0" }),
    true
  );
  const r2 = resolvePpPerDeliverySuggest_({
    basket: d1,
    basket2: d2,
    slot: 2,
    deliveriesN: 2,
    ppManualDist: "1"
  });
  assert.equal(qty(r2.proposed, "ЛЁГКОЕ", "Среднее"), 100);
  assert.equal(qty(r2.proposed, "РУБЕЦ Т", "Крупное"), 20);
  assert.match(r2.compositionSource, /manual|per-delivery/);
});

test("manual→auto: sum preserved, equal auto slots", function () {
  const d1 = [
    { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", value: 200, val: 200 }
  ];
  const d2 = [
    { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", value: 100, val: 100 }
  ];
  const mat = materializePpAutoSplit_({
    deliveriesN: 2,
    basket: d1,
    basket2: d2,
    ppManualDist: "1",
    forceFromSum: true
  });
  assert.equal(mat.ok, true);
  assert.equal(qty(mat.delivery1, "ЛЁГКОЕ", "Среднее"), 150);
  assert.equal(qty(mat.delivery2, "ЛЁГКОЕ", "Среднее"), 150);
  assert.deepEqual(
    ppQtyMap_(ppMergeBasketsAsMonthly_(mat.delivery1, mat.delivery2)),
    ppQtyMap_(ppMergeBasketsAsMonthly_(d1, d2))
  );
});

test("materialize skips already-split auto (no re-divide)", function () {
  const split = splitMonthlyBasketToTwoDeliveries_(t452Monthly);
  const mat = materializePpAutoSplit_({
    deliveriesN: 2,
    basket: split.delivery1,
    basket2: split.delivery2,
    ppManualDist: "0"
  });
  assert.equal(mat.skipped, true);
  assert.equal(mat.reason, "already_split");
  assert.equal(qty(mat.delivery1, "ЛЁГКОЕ", "Среднее"), 150);
});

test("row metadata preserved through split (frac/sub)", function () {
  const monthly = [
    {
      cat: "dressura",
      main: "СЕРДЦЕ",
      name: "СЕРДЦЕ",
      sub: "Целое",
      frac: "",
      value: 60,
      val: 60,
      key: "dressura|СЕРДЦЕ|ЦЕЛОЕ"
    }
  ];
  const split = splitMonthlyBasketToTwoDeliveries_(monthly);
  assert.equal(split.delivery1[0].sub, "Целое");
  assert.equal(split.delivery2[0].sub, "Целое");
  assert.equal(split.delivery1[0].key, "dressura|СЕРДЦЕ|ЦЕЛОЕ");
  assert.equal(ppBasketItemKey_(split.delivery1[0]), "dressura|СЕРДЦЕ|ЦЕЛОЕ");
});
