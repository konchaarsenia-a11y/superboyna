/**
 * t441u/t442u regression: per-delivery ПП1/ПП2 without half-split;
 * N=1 = only first delivery; stale basket2 must not create PP2.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePpDeliveriesN_,
  resolvePpPerDeliverySuggest_,
  ppCloneBasket_,
  splitQtyForPpSlot_,
  splitMonthlyBasketToTwoDeliveries_,
  classifyPpCardForN2Split_,
  ppBasketItemKey_
} from "./pp-per-delivery.js";

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

test("parsePpDeliveriesN_ accepts string 1/2 and slash forms", function () {
  assert.equal(parsePpDeliveriesN_(1), 1);
  assert.equal(parsePpDeliveriesN_("1"), 1);
  assert.equal(parsePpDeliveriesN_("2"), 2);
  assert.equal(parsePpDeliveriesN_("2/мес"), 2);
  assert.equal(parsePpDeliveriesN_("1/2"), 2);
  assert.equal(parsePpDeliveriesN_(""), 0);
  assert.equal(parsePpDeliveriesN_(null), 0);
});

test("N=1 keeps full basket; ignores stale basket2; forces slot1", function () {
  const r = resolvePpPerDeliverySuggest_({
    basket: d1,
    basket2: d2,
    slot: 2,
    deliveriesN: "1"
  });
  assert.equal(r.deliveriesN, 1);
  assert.equal(r.slot, 1);
  assert.equal(r.compositionSource, "n1-whole");
  assert.equal(qty(r.proposed, "ЛЁГКОЕ", "Среднее"), 400);
  assert.equal(qty(r.proposed, "ТРАХЕЯ", "СРЕД"), 4);
  assert.equal((r.delivery2 || []).length, 0);
  assert.equal(r.legacyNoBasket2, false);
  assert.equal(r.needManualComposition, false);
});

test("N=1 without basket2 is still N=1 (not legacy N=2)", function () {
  const r = resolvePpPerDeliverySuggest_({
    basket: d1,
    basket2: [],
    slot: 1,
    deliveriesN: 1
  });
  assert.equal(r.compositionSource, "n1-whole");
  assert.equal(r.legacyNoBasket2, false);
  assert.equal(qty(r.proposed, "ЛЁГКОЕ", "Среднее"), 400);
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
  const r = resolvePpPerDeliverySuggest_({ basket: d1, basket2: d2, slot: 2, deliveriesN: "2" });
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

test("N=2 empty basket2: PP1 whole + flag, PP2 empty need manual (not N=1)", function () {
  const s1 = resolvePpPerDeliverySuggest_({ basket: d1, basket2: [], slot: 1, deliveriesN: 2 });
  assert.equal(s1.compositionSource, "n2-legacy-no-basket2-slot1");
  assert.equal(s1.legacyNoBasket2, true);
  assert.equal(qty(s1.proposed, "ЛЁГКОЕ", "Среднее"), 400);
  assert.equal((s1.remaining || []).length, 0);
  assert.match(String(s1.hint), /N=2 legacy/);

  const s2 = resolvePpPerDeliverySuggest_({ basket: d1, basket2: null, slot: 2, deliveriesN: 2 });
  assert.equal(s2.compositionSource, "n2-legacy-no-basket2-slot2");
  assert.equal(s2.needManualComposition, true);
  assert.equal((s2.proposed || []).length, 0);
  assert.match(String(s2.hint), /не N=1/);
});

test("artificial 2→1: stale basket2 dropped, only delivery1", function () {
  // запись была N=2 с basket2; канон стал N=1 — не планируем ПП2.
  const was2 = resolvePpPerDeliverySuggest_({
    basket: d1,
    basket2: d2,
    slot: 2,
    deliveriesN: 2
  });
  assert.equal(qty(was2.proposed, "ЛЁГКОЕ", "Среднее"), 250);

  const now1 = resolvePpPerDeliverySuggest_({
    basket: d1,
    basket2: d2,
    slot: 2,
    deliveriesN: "1"
  });
  assert.equal(now1.deliveriesN, 1);
  assert.equal(now1.slot, 1);
  assert.equal(now1.compositionSource, "n1-whole");
  assert.equal(qty(now1.proposed, "ЛЁГКОЕ", "Среднее"), 400);
  assert.equal((now1.delivery2 || []).length, 0);
  assert.notEqual(now1.compositionSource, was2.compositionSource);
});

test("UI mapping: proposed → form basket → save payload as-is (no second split)", function () {
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

  assert.equal(qty(mapApiBasketToLocal(saved1), "ЛЁГКОЕ", "Среднее"), 400);
  assert.equal(qty(mapApiBasketToLocal(saved2), "ЛЁГКОЕ", "Среднее"), 250);

  // N=1 UI path: even with stale basket2 in suggest input, save only delivery1
  const n1 = resolvePpPerDeliverySuggest_({ basket: d1, basket2: d2, slot: 2, deliveriesN: "1" });
  const uiN1 = fromPpInsert({
    proposedBasket: n1.proposed,
    monthlyBasket: n1.delivery1,
    needManualComposition: n1.needManualComposition,
    legacyNoBasket2: n1.legacyNoBasket2
  });
  assert.equal(uiN1.blocked, false);
  assert.equal(qty(saveOrderBasket(uiN1.proposed), "ЛЁГКОЕ", "Среднее"), 400);

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

test("worker wires parsePpDeliveriesN_ + N=1 ignore basket2", function () {
  const worker = readFileSync(join(root, "boinya-c/proxy/worker.js"), "utf8");
  assert.match(worker, /parsePpDeliveriesN_/);
  assert.match(worker, /resolvePpPerDeliverySuggest_/);
  assert.match(worker, /from "\.\/pp-per-delivery\.js"/);
  assert.match(worker, /legacyNoBasket2/);
  assert.match(worker, /needManualComposition/);
  const start = worker.indexOf("async function getPpOrderSuggestD1_");
  assert.ok(start > 0);
  const next = worker.indexOf("\nasync function ", start + 10);
  const body = worker.slice(start, next > 0 ? next : start + 16000);
  assert.doesNotMatch(body, /proposePpSlotBasketD1_\(/);
  assert.match(body, /t442u/);
  assert.match(body, /deliveriesN >= 2/);
});

test("orders.js N=1 parse + no PP2 toggle / force slot1 on fromPp", function () {
  const src = readFileSync(join(root, "boinya-c/next/orders.js"), "utf8");
  assert.match(src, /parseDeliveriesN_/);
  assert.match(src, /applyDeliveriesN_/);
  assert.match(src, /t442u/);
  assert.match(src, /needManualComposition \|\| res\.legacyNoBasket2/);
  assert.match(src, /nUi === 1/);
});

test("order-engine forces N=1 slot payload", function () {
  const src = readFileSync(join(root, "boinya-c/next/order-engine.js"), "utf8");
  assert.match(src, /parseDeliveriesNEngine_/);
  assert.match(src, /ppDeliveriesN === 1/);
  assert.match(src, /deliverySlot: 1, ppSlot: "1", deliveriesN: 1/);
});

test("Code.gs buildPpOrderSuggest_ N=1 ignore basket2 / parsePpDeliveriesN_", function () {
  const src = readFileSync(join(root, "Code.gs"), "utf8");
  assert.match(src, /function parsePpDeliveriesN_/);
  const start = src.indexOf("function buildPpOrderSuggest_");
  assert.ok(start > 0);
  const next = src.indexOf("\nfunction ", start + 10);
  const body = src.slice(start, next > 0 ? next : start + 9000);
  assert.match(body, /t442u/);
  assert.match(body, /legacyNoBasket2/);
  assert.doesNotMatch(body, /proposePpSlotBasket_\(/);
  assert.match(body, /deliveriesN >= 2/);
});

test("t444u staff split: dressura floor / chew ceil; 1+2 = monthly", function () {
  assert.equal(splitQtyForPpSlot_(5, false, 1), 2);
  assert.equal(splitQtyForPpSlot_(5, false, 2), 3);
  assert.equal(splitQtyForPpSlot_(5, true, 1), 3);
  assert.equal(splitQtyForPpSlot_(5, true, 2), 2);
  assert.equal(splitQtyForPpSlot_(1, false, 1), 1);
  assert.equal(splitQtyForPpSlot_(1, false, 2), 0);

  const monthly = [
    { cat: "dressura", main: "ЛЁГКОЕ", sub: "Среднее", value: 401 },
    { cat: "chew", main: "ТРАХЕЯ", sub: "СРЕД", value: 5 }
  ];
  const split = splitMonthlyBasketToTwoDeliveries_(monthly);
  assert.equal(split.ok, true);
  assert.equal(qty(split.delivery1, "ЛЁГКОЕ", "Среднее"), 200);
  assert.equal(qty(split.delivery2, "ЛЁГКОЕ", "Среднее"), 201);
  assert.equal(qty(split.delivery1, "ТРАХЕЯ", "СРЕД"), 3);
  assert.equal(qty(split.delivery2, "ТРАХЕЯ", "СРЕД"), 2);
  assert.equal(
    qty(split.delivery1, "ЛЁГКОЕ", "Среднее") + qty(split.delivery2, "ЛЁГКОЕ", "Среднее"),
    401
  );
  assert.equal(qty(split.delivery1, "ТРАХЕЯ", "СРЕД") + qty(split.delivery2, "ТРАХЕЯ", "СРЕД"), 5);
});

test("t444u classify: migrate N=2 empty basket2; skip N=1; already; ambiguous", function () {
  const monthly = [
    { cat: "dressura", main: "СЕРДЦЕ", sub: "Ломтики", value: 100 },
    { cat: "chew", main: "УХО Г", sub: "Обычное", value: 2 }
  ];
  const m = classifyPpCardForN2Split_({
    sheet: "ПП",
    deliveries: "2",
    basket: monthly,
    basket2: []
  });
  assert.equal(m.kind, "migrate");
  assert.equal(qty(m.delivery1, "СЕРДЦЕ", "Ломтики") + qty(m.delivery2, "СЕРДЦЕ", "Ломтики"), 100);

  assert.equal(
    classifyPpCardForN2Split_({ sheet: "ПП", deliveries: "1", basket: monthly, basket2: [] }).kind,
    "skip_n1"
  );
  assert.equal(
    classifyPpCardForN2Split_({
      sheet: "ПП",
      deliveries: 2,
      basket: monthly,
      basket2: [{ cat: "dressura", main: "СЕРДЦЕ", sub: "Ломтики", value: 50 }]
    }).kind,
    "already"
  );
  assert.equal(
    classifyPpCardForN2Split_({ sheet: "ПП", deliveries: "2", basket: [], basket2: [] }).kind,
    "ambiguous"
  );
  assert.equal(
    classifyPpCardForN2Split_({ sheet: "ПП", deliveries: "3", basket: monthly }).kind,
    "ambiguous"
  );
});

test("t444u after staff split, suggest takes whole baskets; manual slot still free", function () {
  const monthly = d1.concat([{ cat: "chew", main: "УХО Г", sub: "Обычное", value: 1 }]);
  const split = splitMonthlyBasketToTwoDeliveries_(monthly);
  assert.equal(split.ok, true);
  const s1 = resolvePpPerDeliverySuggest_({
    basket: split.delivery1,
    basket2: split.delivery2,
    slot: 1,
    deliveriesN: 2
  });
  const s2 = resolvePpPerDeliverySuggest_({
    basket: split.delivery1,
    basket2: split.delivery2,
    slot: 2,
    deliveriesN: 2
  });
  assert.equal(s1.compositionSource, "per-delivery");
  assert.equal(s2.compositionSource, "per-delivery");
  assert.equal(s1.legacyNoBasket2, false);
  assert.deepEqual(
    s1.proposed.map(function (x) {
      return ppBasketItemKey_(x) + "=" + x.value;
    }),
    split.delivery1.map(function (x) {
      return ppBasketItemKey_(x) + "=" + x.value;
    })
  );
  // ручной выбор слота 2 не запрещён автоопределением
  assert.equal(s2.slot, 2);
  assert.equal(s2.needManualComposition, false);
});

test("worker has no /admin/pp-n2-split surface (staff saveSubscription only)", function () {
  const worker = readFileSync(join(root, "boinya-c/proxy/worker.js"), "utf8");
  assert.doesNotMatch(worker, /\/admin\/pp-n2-split/);
  assert.doesNotMatch(worker, /ppN2BasketSplitAdmin_/);
  assert.doesNotMatch(worker, /PP_N2_SPLIT_ADMIN_TOKEN/);
});
