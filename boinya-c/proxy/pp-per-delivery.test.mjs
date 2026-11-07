/**
 * t441u regression: per-delivery ПП1/ПП2 without half-split.
 * Mirrors UI mapping (proposedBasket → form → save as-is) on artificial data.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePpPerDeliverySuggest_, ppCloneBasket_ } from "./pp-per-delivery.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function qty(list, main, sub) {
  let n = 0;
  (list || []).forEach(function (it) {
    if (String(it.main || it.name) !== main) return;
    if (String(it.sub || "") !== String(sub || "")) return;
    n += Number(it.value != null ? it.value : it.val) || 0;
  });
  return n;
}

const d1 = [
  { cat: "dressura", main: "ЛЁГКОЕ", sub: "Среднее", value: 400 },
  { cat: "chew", main: "ТРАХЕЯ", sub: "СРЕД", value: 4 }
];
const d2 = [
  { cat: "dressura", main: "ЛЁГКОЕ", sub: "Среднее", value: 250 },
  { cat: "chew", main: "ТРАХЕЯ", sub: "СРЕД", value: 3 }
];
const odd = [
  { cat: "dressura", main: "СЕРДЦЕ", sub: "Ломтики", value: 101 },
  { cat: "chew", main: "УХО Г", sub: "Обычное", value: 1 }
];

test("N=1 keeps full basket, no basket2 needed", function () {
  const r = resolvePpPerDeliverySuggest_({ basket: d1, basket2: d2, slot: 1, deliveriesN: 1 });
  assert.equal(r.compositionSource, "n1-whole");
  assert.equal(qty(r.proposed, "ЛЁГКОЕ", "Среднее"), 400);
  assert.equal(qty(r.proposed, "ТРАХЕЯ", "СРЕД"), 4);
  assert.equal(r.needManualComposition, false);
});

test("ПП1 takes delivery1 whole (400+4), not half", function () {
  const r = resolvePpPerDeliverySuggest_({ basket: d1, basket2: d2, slot: 1, deliveriesN: 2 });
  assert.equal(r.compositionSource, "per-delivery");
  assert.equal(qty(r.proposed, "ЛЁГКОЕ", "Среднее"), 400);
  assert.equal(qty(r.proposed, "ТРАХЕЯ", "СРЕД"), 4);
  assert.equal(qty(r.remaining, "ЛЁГКОЕ", "Среднее"), 250);
  assert.equal(qty(r.remaining, "ТРАХЕЯ", "СРЕД"), 3);
  assert.equal(r.legacyNoBasket2, false);
});

test("ПП2 takes delivery2 whole (250+3), not remainder-half", function () {
  const r = resolvePpPerDeliverySuggest_({ basket: d1, basket2: d2, slot: 2, deliveriesN: 2 });
  assert.equal(r.compositionSource, "per-delivery");
  assert.equal(qty(r.proposed, "ЛЁГКОЕ", "Среднее"), 250);
  assert.equal(qty(r.proposed, "ТРАХЕЯ", "СРЕД"), 3);
  assert.equal((r.remaining || []).length, 0);
});

test("odd grams/pieces stay intact on both slots", function () {
  const r1 = resolvePpPerDeliverySuggest_({ basket: odd, basket2: d2, slot: 1, deliveriesN: 2 });
  const r2 = resolvePpPerDeliverySuggest_({ basket: d1, basket2: odd, slot: 2, deliveriesN: 2 });
  assert.equal(qty(r1.proposed, "СЕРДЦЕ", "Ломтики"), 101);
  assert.equal(qty(r1.proposed, "УХО Г", "Обычное"), 1);
  assert.equal(qty(r2.proposed, "СЕРДЦЕ", "Ломтики"), 101);
  assert.equal(qty(r2.proposed, "УХО Г", "Обычное"), 1);
});

test("repeat «Состав из ПП» does not 400→200→100", function () {
  const once = resolvePpPerDeliverySuggest_({ basket: d1, basket2: d2, slot: 1, deliveriesN: 2 });
  const again = resolvePpPerDeliverySuggest_({
    basket: once.proposed,
    basket2: d2,
    slot: 1,
    deliveriesN: 2
  });
  assert.equal(qty(once.proposed, "ЛЁГКОЕ", "Среднее"), 400);
  assert.equal(qty(again.proposed, "ЛЁГКОЕ", "Среднее"), 400);
  assert.notEqual(qty(again.proposed, "ЛЁГКОЕ", "Среднее"), 100);
  assert.notEqual(qty(again.proposed, "ЛЁГКОЕ", "Среднее"), 200);
});

test("legacy empty basket2: PP1 whole + flag, PP2 empty need manual", function () {
  const s1 = resolvePpPerDeliverySuggest_({ basket: d1, basket2: [], slot: 1, deliveriesN: 2 });
  assert.equal(s1.compositionSource, "legacy-slot1-whole");
  assert.equal(s1.legacyNoBasket2, true);
  assert.equal(qty(s1.proposed, "ЛЁГКОЕ", "Среднее"), 400);
  assert.equal((s1.remaining || []).length, 0);

  const s2 = resolvePpPerDeliverySuggest_({ basket: d1, basket2: null, slot: 2, deliveriesN: 2 });
  assert.equal(s2.compositionSource, "legacy-no-basket2");
  assert.equal(s2.needManualComposition, true);
  assert.equal((s2.proposed || []).length, 0);
});

test("UI mapping: proposed → form basket → save payload as-is (no second split)", function () {
  // как orders.js fromPp + save: form holds proposed; saveOrder stores that basket.
  function mapApiBasketToLocal(list) {
    return ppCloneBasket_(list);
  }
  function fromPpInsert(res) {
    var proposed = mapApiBasketToLocal(res.proposedBasket || []);
    if (!proposed.length) {
      if (res.needManualComposition || res.legacyNoBasket2) return { blocked: true, proposed: [] };
      proposed = mapApiBasketToLocal(res.monthlyBasket || res.remainingBasket || []);
    }
    return { blocked: false, proposed: proposed };
  }
  function saveOrderBasket(formBasket) {
    // saveOrder_ writes basket_json as given — no proposePpSlotBasket.
    return ppCloneBasket_(formBasket);
  }

  const suggest1 = resolvePpPerDeliverySuggest_({ basket: d1, basket2: d2, slot: 1, deliveriesN: 2 });
  const ui1 = fromPpInsert({
    proposedBasket: suggest1.proposed,
    monthlyBasket: suggest1.delivery1,
    remainingBasket: suggest1.remaining
  });
  assert.equal(ui1.blocked, false);
  const saved1 = saveOrderBasket(ui1.proposed);
  assert.equal(qty(saved1, "ЛЁГКОЕ", "Среднее"), 400);
  assert.equal(qty(saved1, "ТРАХЕЯ", "СРЕД"), 4);

  const suggest2 = resolvePpPerDeliverySuggest_({ basket: d1, basket2: d2, slot: 2, deliveriesN: 2 });
  const ui2 = fromPpInsert({
    proposedBasket: suggest2.proposed,
    monthlyBasket: suggest2.delivery1,
    remainingBasket: suggest2.remaining
  });
  const saved2 = saveOrderBasket(ui2.proposed);
  assert.equal(qty(saved2, "ЛЁГКОЕ", "Среднее"), 250);
  assert.equal(qty(saved2, "ТРАХЕЯ", "СРЕД"), 3);

  // reload form from saved order (edit) — same qtys
  assert.equal(qty(mapApiBasketToLocal(saved1), "ЛЁГКОЕ", "Среднее"), 400);
  assert.equal(qty(mapApiBasketToLocal(saved2), "ЛЁГКОЕ", "Среднее"), 250);

  const legacy2 = resolvePpPerDeliverySuggest_({ basket: d1, basket2: [], slot: 2, deliveriesN: 2 });
  const uiLegacy = fromPpInsert({
    proposedBasket: legacy2.proposed,
    monthlyBasket: legacy2.delivery1,
    needManualComposition: legacy2.needManualComposition,
    legacyNoBasket2: legacy2.legacyNoBasket2
  });
  assert.equal(uiLegacy.blocked, true);
  assert.equal(uiLegacy.proposed.length, 0);
});

test("worker wires resolvePpPerDeliverySuggest_ and drops half in getPpOrderSuggestD1_", function () {
  const worker = readFileSync(join(root, "boinya-c/proxy/worker.js"), "utf8");
  assert.match(worker, /resolvePpPerDeliverySuggest_/);
  assert.match(worker, /from "\.\/pp-per-delivery\.js"/);
  assert.match(worker, /legacyNoBasket2/);
  assert.match(worker, /needManualComposition/);
  assert.match(worker, /delivery1Basket/);
  assert.match(worker, /delivery2Basket/);
  // half path must not remain inside getPpOrderSuggestD1_ body after delivery1Src
  const start = worker.indexOf("async function getPpOrderSuggestD1_");
  assert.ok(start > 0);
  const next = worker.indexOf("\nasync function ", start + 10);
  const body = worker.slice(start, next > 0 ? next : start + 12000);
  assert.doesNotMatch(body, /proposePpSlotBasketD1_\(/);
});

test("orders.js refuses monthlyBasket fallback when needManualComposition", function () {
  const src = readFileSync(join(root, "boinya-c/next/orders.js"), "utf8");
  assert.match(src, /needManualComposition \|\| res\.legacyNoBasket2/);
});

test("Code.gs buildPpOrderSuggest_ uses per-delivery, not proposePpSlotBasket_ half", function () {
  const src = readFileSync(join(root, "Code.gs"), "utf8");
  const start = src.indexOf("function buildPpOrderSuggest_");
  assert.ok(start > 0);
  const next = src.indexOf("\nfunction ", start + 10);
  const body = src.slice(start, next > 0 ? next : start + 8000);
  assert.match(body, /t441u/);
  assert.match(body, /legacyNoBasket2/);
  assert.doesNotMatch(body, /proposePpSlotBasket_\(/);
});
