/**
 * t449u: picker can re-enter СЕРДЦЕ Целое / РУБЕЦ Крупное; artificial sub37
 * through picker→basket1/2→payload→reopen. No production write.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const eng = require("./order-engine.js");
const P = require("./price-logic.js");

const here = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(
  readFileSync(join(here, "fixtures/pp-n2-alina-copy.harness.json"), "utf8")
);

function loadUiEngine_() {
  const g = { BoinyaOrderEngine: eng, console };
  vm.runInNewContext(
    readFileSync(join(here, "ig-labels.js"), "utf8"),
    Object.assign(g, { globalThis: g })
  );
  return g.BoinyaOrderEngine;
}

function visibleFracs_(api, cat, name) {
  return (api.catalogFractionsForUi_(cat, name) || []).filter(function (f) {
    return !/^крошк/i.test(String(f).trim());
  });
}

function pickerOptions_(api, cat, name) {
  return visibleFracs_(api, cat, name).map(function (f) {
    return { value: f, label: api.humanFraction(name, f) || f };
  });
}

function pickStored_(api, cat, name, storedSub) {
  const opts = pickerOptions_(api, cat, name);
  const hit = opts.find(function (o) {
    return o.value === storedSub;
  });
  assert.ok(hit, name + " missing stored " + storedSub + " in " + JSON.stringify(opts));
  const sameLabel = opts.filter(function (o) {
    return String(o.label).toLowerCase() === String(hit.label).toLowerCase();
  });
  assert.equal(sameLabel.length, 1, name + " label must be unique: " + hit.label);
  return hit;
}

function askQtyPush_(list, cat, name, sub, qty) {
  const next = list.slice();
  next.push({
    cat: cat,
    main: name,
    name: name,
    sub: sub || "",
    val: qty,
    value: qty
  });
  return next;
}

function delLine_(list, i) {
  const next = list.slice();
  next.splice(i, 1);
  return next;
}

function itemKey(it) {
  const cat = String(it.cat || "").trim().toLowerCase();
  const main = String(it.main || it.name || "").trim().toUpperCase();
  const sub = String(it.sub || "").trim().toUpperCase();
  return cat + "|" + main + "|" + sub;
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

function isChew_(it) {
  const cat = String(it.cat || "").toLowerCase();
  if (cat === "chew" || cat === "chews") return true;
  if (cat === "dressura") return false;
  return /шт\.?|колен|ухо|шея|трахе/i.test(String(it.main || it.name || ""));
}

/** Staff split: chew ceil, dressura floor (same as pp-per-delivery). */
function splitMonthly_(monthly) {
  const delivery1 = [];
  const delivery2 = [];
  (monthly || []).forEach(function (it) {
    const v = Number(it.value != null ? it.value : it.val) || 0;
    if (v <= 0) return;
    const chew = isChew_(it);
    let q1 = chew ? Math.ceil(v / 2) : Math.floor(v / 2);
    if (q1 <= 0 && v > 0) q1 = v;
    const q2 = Math.max(0, v - q1);
    const base = {
      cat: it.cat,
      main: it.main || it.name,
      name: it.name || it.main,
      sub: it.sub || ""
    };
    if (q1 > 0) delivery1.push(Object.assign({}, base, { value: q1, val: q1 }));
    if (q2 > 0) delivery2.push(Object.assign({}, base, { value: q2, val: q2 }));
  });
  return { delivery1: delivery1, delivery2: delivery2 };
}

const FRACS = { slices: 0, strips: 1, large: 1, medium: 2, small: 3, extraSmall: 4 };
const PACKS = { u1: 0, u2: 4, u3: 6, up4: 2 };
const COEF = "2.3";
const STATED = "145";
const FACT = 145.43;

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

function catFor_(it) {
  if (it.cat) return it.cat;
  const n = String(it.main || it.name || "").toUpperCase();
  if (/УХО|ТРАХЕ|КОЛЕН|ШЕИ|ШТ/.test(n)) return "chew";
  return "dressura";
}

test("picker: сердце без Целое; РУБЕЦ Крупное на месте", function () {
  /* t516u-clients #7 */
  const api = loadUiEngine_();
  const heart = pickerOptions_(api, "dressura", "СЕРДЦЕ");
  assert.equal(heart.some(function (o) { return o.value === "Целое"; }), false);
  assert.ok(heart.some(function (o) { return o.value === "Ломтики"; }));
  const lom = heart.find(function (o) { return o.value === "Ломтики"; });
  assert.equal(lom.label, "ломтики");

  const rumen = pickerOptions_(api, "dressura", "РУБЕЦ Т");
  assert.ok(rumen.some(function (o) { return o.value === "Крупное"; }));
  assert.equal(
    rumen.find(function (o) { return o.value === "Крупное"; }).label,
    "крупные кусочки"
  );
});

test("browser instructions map: 5 fracs", function () {
  const api = loadUiEngine_();
  [
    ["chew", "УХО Г", "Обычное", "целое"],
    ["dressura", "СЕРДЦЕ", "Ломтики", "ломтики"],
    ["chew", "ТРАХЕЯ", "СРЕД", "средняя"],
    ["dressura", "ЛЁГКОЕ", "Среднее", "средний кубик"],
    ["dressura", "РУБЕЦ Т", "Крупное", "крупные кусочки"]
  ].forEach(function (row) {
    const hit = pickStored_(api, row[0], row[1], row[2]);
    assert.equal(hit.label, row[3]);
  });
});

test("askQty push duplicates; delete+re-add single row", function () {
  const api = loadUiEngine_();
  const hit = pickStored_(api, "chew", "УХО Г", "Обычное");
  let list = [];
  list = askQtyPush_(list, "chew", "УХО Г", hit.value, 2);
  list = askQtyPush_(list, "chew", "УХО Г", hit.value, 2);
  assert.equal(list.length, 2);
  list = delLine_(list, 0);
  list = delLine_(list, 0);
  list = askQtyPush_(list, "chew", "УХО Г", hit.value, 2);
  assert.equal(list.length, 1);
  assert.equal(qtyMap(list)["chew|УХО Г|ОБЫЧНОЕ"], 2);
});

test("full artificial sub37: picker→split→payload→reopen; N2 econ; odd knee", function () {
  const api = loadUiEngine_();
  const monthly = pack.beforeMonthly;
  const raw = invertRaw(monthly, FACT, 2);
  assert.equal(quote(monthly, raw, 2), FACT);

  let rebuilt = [];
  monthly.forEach(function (it) {
    const cat = catFor_(it);
    const name = it.main || it.name;
    let stored = it.sub || "";
    /* t516u-clients #7: живое Целое у сердца читаем как Ломтики. */
    if (/сердц/i.test(name) && /^цел/i.test(stored)) stored = "Ломтики";
    const qty = Number(it.value != null ? it.value : it.val) || 0;
    if (stored) {
      const hit = pickStored_(api, cat, name, stored);
      rebuilt = askQtyPush_(rebuilt, cat, name, hit.value, qty);
    } else {
      rebuilt = askQtyPush_(rebuilt, cat, name, "", qty);
    }
  });
  const expectedMap = qtyMap(monthly);
  Object.keys(expectedMap).forEach(function (k) {
    if (/СЕРДЦЕ\|ЦЕЛОЕ/i.test(k)) {
      expectedMap[k.replace(/ЦЕЛОЕ/i, "ЛОМТИКИ")] = expectedMap[k];
      delete expectedMap[k];
    }
  });
  mapsEqual(qtyMap(rebuilt), expectedMap);

  const split = splitMonthly_(rebuilt);
  const kKnee = "chew|КОЛЕНИ ШТ.|";
  assert.equal(qtyMap(split.delivery1)[kKnee], 1);
  assert.equal(qtyMap(split.delivery2)[kKnee] || 0, 0);

  const sum = Object.create(null);
  [split.delivery1, split.delivery2].forEach(function (list) {
    Object.entries(qtyMap(list)).forEach(function ([k, v]) {
      sum[k] = (sum[k] || 0) + v;
    });
  });
  mapsEqual(sum, expectedMap);

  const payload = {
    action: "saveSubscription",
    sheet: "ПП",
    deliveries: 2,
    statedCost: STATED,
    calcFactCost: String(FACT),
    coef: COEF,
    packCounts: PACKS,
    basket: split.delivery1,
    basket2: split.delivery2
  };
  assert.equal(payload.statedCost, "145");
  assert.deepEqual(payload.packCounts, { u1: 0, u2: 4, u3: 6, up4: 2 });

  const re1 = eng.mapApiBasketToLocal(payload.basket);
  const re2 = eng.mapApiBasketToLocal(payload.basket2);
  mapsEqual(qtyMap(re1.concat(re2)), expectedMap);
  assert.ok(re1.concat(re2).some(function (it) {
    return /СЕРДЦ/i.test(it.main || it.name) && /ломт/i.test(String(it.sub || ""));
  }));
  assert.ok(re1.concat(re2).some(function (it) {
    return /РУБЕЦ/i.test(it.main || it.name) && it.sub === "Крупное";
  }));
  assert.equal(quote(re1.concat(re2), raw, 2), FACT);

  // N1: only basket1 — stale2 ignored by monthly list rule
  const n1only = re1.slice();
  assert.ok(n1only.length > 0);
  assert.notDeepEqual(qtyMap(n1only), qtyMap(re1.concat(re2)));
});

test("сердце Целое больше не в picker", function () {
  const api = loadUiEngine_();
  const heart = pickerOptions_(api, "dressura", "СЕРДЦЕ");
  assert.equal(heart.some(function (o) { return /^цел/i.test(o.value); }), false);
  const lom = pickStored_(api, "dressura", "СЕРДЦЕ", "Ломтики");
  assert.equal(lom.label, "ломтики");
});
