/**
 * t454u: UI order-engine handlers — auto N2 / manual / N1; no invertRaw.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const eng = require("./order-engine.js");
const here = dirname(fileURLToPath(import.meta.url));

function qty(list, main, sub) {
  let n = 0;
  (list || []).forEach(function (it) {
    if (String(it.main || it.name) !== main) return;
    if (String(it.sub || "") !== String(sub || "")) return;
    n += Number(it.value != null ? it.value : it.val) || 0;
  });
  return n;
}

const t452 = [
  { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", value: 300, val: 300 },
  { cat: "dressura", main: "РУБЕЦ Т", name: "РУБЕЦ Т", sub: "Крупное", value: 100, val: 100 },
  { cat: "dressura", main: "ПОЧКИ", name: "ПОЧКИ", sub: "Ломтики", value: 150, val: 150 }
];

test("t452u UI split 300/100/150 → 150/50/75 each", function () {
  const split = eng.splitMonthlyBasketToTwoDeliveries_(t452);
  assert.equal(split.ok, true);
  assert.equal(qty(split.delivery1, "ЛЁГКОЕ", "Среднее"), 150);
  assert.equal(qty(split.delivery2, "РУБЕЦ Т", "Крупное"), 50);
  assert.equal(qty(split.delivery1, "ПОЧКИ", "Ломтики"), 75);
});

test("t453u N1 suggest whole month", function () {
  const r = eng.resolvePpPerDeliverySuggest_({
    basket: t452,
    basket2: [{ cat: "dressura", main: "ЛЁГКОЕ", sub: "Среднее", value: 1 }],
    slot: 2,
    deliveriesN: 1
  });
  assert.equal(r.compositionSource, "n1-whole");
  assert.equal(qty(r.proposed, "ЛЁГКОЕ", "Среднее"), 300);
  assert.equal((r.delivery2 || []).length, 0);
});

test("save payload after auto: basket+basket2 sum = monthly; suggest no re-half", function () {
  const split = eng.splitMonthlyBasketToTwoDeliveries_(t452);
  const payload = {
    basket: split.delivery1,
    basket2: split.delivery2,
    deliveries: 2,
    ppManualDist: "0"
  };
  const s1 = eng.resolvePpPerDeliverySuggest_({
    basket: payload.basket,
    basket2: payload.basket2,
    slot: 1,
    deliveriesN: 2,
    ppManualDist: payload.ppManualDist
  });
  const s2 = eng.resolvePpPerDeliverySuggest_({
    basket: payload.basket,
    basket2: payload.basket2,
    slot: 2,
    deliveriesN: 2,
    ppManualDist: payload.ppManualDist
  });
  assert.equal(qty(s1.proposed, "ЛЁГКОЕ", "Среднее"), 150);
  assert.equal(qty(s2.proposed, "ЛЁГКОЕ", "Среднее"), 150);
  const again = eng.resolvePpPerDeliverySuggest_({
    basket: s1.proposed,
    basket2: payload.basket2,
    slot: 1,
    deliveriesN: 2
  });
  assert.equal(qty(again.proposed, "ЛЁГКОЕ", "Среднее"), 150);
});

test("clients.js has manual toggle + materialize helpers", function () {
  const src = readFileSync(join(here, "clients.js"), "utf8");
  assert.match(src, /Ручное распределение/);
  assert.match(src, /cl-manual-dist/);
  assert.match(src, /cardMaterializeAutoSplit_/);
  assert.match(src, /ppManualDist/);
  assert.match(src, /forceFromSum/);
});

test("odd 3 ears → 2/1 via UI engine", function () {
  const monthly = [
    { cat: "chew", main: "УХО Г", name: "УХО Г", sub: "Обычное", value: 3, val: 3 },
    { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", value: 200, val: 200 }
  ];
  const split = eng.splitMonthlyBasketToTwoDeliveries_(monthly);
  assert.equal(qty(split.delivery1, "УХО Г", "Обычное"), 2);
  assert.equal(qty(split.delivery2, "УХО Г", "Обычное"), 1);
});
