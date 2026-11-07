/**
 * t449u RO: picker UI label → stored sub; merge behavior; sub37 re-entry.
 * Requires ig-labels patch (as in next.html). No production write.
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

/** Как в браузере: ig-labels патчит BoinyaOrderEngine. */
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

/** Зеркало askQty: choice value = catalog key; label = humanFraction. */
function pickerOptions_(api, cat, name) {
  return visibleFracs_(api, cat, name).map(function (f) {
    return { value: f, label: api.humanFraction(name, f) || f };
  });
}

function pickByLabel_(opts, label) {
  const hits = opts.filter(function (o) {
    return String(o.label).toLowerCase() === String(label).toLowerCase();
  });
  return hits;
}

/** askQty: всегда push — без merge по cat/main/sub. */
function askQtyPush_(list, cat, name, sub, qty) {
  const next = list.slice();
  next.push({ cat: cat, main: name, name: name, sub: sub || "", val: qty, value: qty });
  return next;
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

const FRACS = { slices: 0, strips: 1, large: 1, medium: 2, small: 3, extraSmall: 4 };
const PACKS = { u1: 0, u2: 4, u3: 6, up4: 2 };

function quote(list, rawCost) {
  const loc = eng.mapApiBasketToLocal(
    list.map(function (it) {
      return {
        cat: it.cat,
        main: it.main || it.name,
        name: it.name || it.main,
        sub: it.sub || "",
        val: it.value != null ? it.value : it.val
      };
    })
  );
  const q = P.quotePp({
    scheme: "RAW26",
    coef: "2.3",
    deliveriesN: 2,
    costSum: rawCost,
    list: loc,
    packagesByn: P.packagesBynFromUCountsLocal_(PACKS),
    fracRates: FRACS
  });
  return Math.round(Number(q.total) * 100) / 100;
}

function invertRaw(list, fact) {
  const loc = eng.mapApiBasketToLocal(
    list.map(function (it) {
      return {
        cat: it.cat,
        main: it.main || it.name,
        name: it.name || it.main,
        sub: it.sub || "",
        val: it.value != null ? it.value : it.val
      };
    })
  );
  const recover = P.recoverBynFromBasketLocal_(loc) || 0;
  const frac = Number(P.calcDressuraFractionMarkup(loc, FRACS).total) || 0;
  const fixed = recover + 7.6 * 2 + P.packagesBynFromUCountsLocal_(PACKS) + frac;
  return Math.round(((Number(fact) - fixed) / 2.3) * 100) / 100;
}

test("UI label → stored value for 5 positions (ig-labels live)", function () {
  const api = loadUiEngine_();
  const table = [
    {
      cat: "chew",
      name: "УХО Г",
      stored: "Обычное",
      uiWant: "целое",
      canPreserve: true
    },
    {
      cat: "dressura",
      name: "СЕРДЦЕ",
      stored: "Целое",
      uiWant: "ломтики",
      canPreserve: false,
      reason: "Целое not in picker; label ломтики stores Ломтики"
    },
    {
      cat: "chew",
      name: "ТРАХЕЯ",
      stored: "СРЕД",
      uiWant: "средняя",
      canPreserve: true
    },
    {
      cat: "dressura",
      name: "ЛЁГКОЕ",
      stored: "Среднее",
      uiWant: "средний кубик",
      canPreserve: true
    },
    {
      cat: "dressura",
      name: "РУБЕЦ Т",
      stored: "Крупное",
      uiWant: "крупные кусочки",
      canPreserve: false,
      reason: "ig-labels hides Крупное for РУБЕЦ Т"
    }
  ];

  table.forEach(function (row) {
    const opts = pickerOptions_(api, row.cat, row.name);
    const display = api.humanFraction(row.name, row.stored) || row.stored;
    assert.equal(String(display).toLowerCase(), row.uiWant, row.name + " display");
    const inPicker = opts.some(function (o) {
      return o.value === row.stored;
    });
    assert.equal(inPicker, row.canPreserve, row.name + " inPicker");
    if (row.canPreserve) {
      const hits = pickByLabel_(opts, row.uiWant);
      assert.ok(hits.length >= 1, row.name + " label hit");
      assert.equal(hits[0].value, row.stored, row.name + " label→stored");
    } else {
      assert.equal(inPicker, false, row.reason);
      if (row.name === "СЕРДЦЕ") {
        const hits = pickByLabel_(opts, "ломтики");
        assert.equal(hits[0].value, "Ломтики");
        assert.notEqual(hits[0].value, "Целое");
      }
      if (row.name === "РУБЕЦ Т") {
        assert.ok(!opts.some(function (o) { return o.value === "Крупное"; }));
      }
    }
  });
});

test("askQty pushes duplicate rows — no merge by key", function () {
  let list = [];
  list = askQtyPush_(list, "chew", "УХО Г", "Обычное", 2);
  list = askQtyPush_(list, "chew", "УХО Г", "Обычное", 2);
  assert.equal(list.length, 2);
  assert.equal(qtyMap(list)["chew|УХО Г|ОБЫЧНОЕ"], 4);
});

test("save/reopen mapApiBasketToLocal keeps Целое / Крупное (no normalize)", function () {
  const round = eng.mapApiBasketToLocal([
    { cat: "dressura", main: "СЕРДЦЕ", name: "СЕРДЦЕ", sub: "Целое", val: 30 },
    { cat: "dressura", main: "РУБЕЦ Т", name: "РУБЕЦ Т", sub: "Крупное", val: 100 }
  ]);
  assert.equal(round[0].sub, "Целое");
  assert.equal(round[1].sub, "Крупное");
});

test("sub37 artificial: preserve exact keys → fact 145.43 stated 145; Ломтики≠Целое key", function () {
  const before = pack.beforeMonthly;
  const raw = invertRaw(before, 145.43);
  assert.equal(quote(before, raw), 145.43);

  // re-entry that CAN preserve (ear/trachea/lung) + keep heart/rumen from stored
  const preserved = before.map(function (it) {
    return {
      cat: it.cat,
      main: it.main || it.name,
      name: it.name || it.main,
      sub: it.sub || "",
      value: it.value != null ? it.value : it.val,
      val: it.value != null ? it.value : it.val
    };
  });
  assert.deepEqual(qtyMap(preserved), qtyMap(before));
  assert.equal(quote(preserved, raw), 145.43);

  // wrong picker for heart: Целое → Ломтики changes key (even if price size same)
  const wrongHeart = preserved.map(function (it) {
    if (/СЕРДЦ/i.test(it.main || it.name) && it.sub === "Целое") {
      return Object.assign({}, it, { sub: "Ломтики" });
    }
    return it;
  });
  assert.notDeepEqual(qtyMap(wrongHeart), qtyMap(before));
  assert.equal(qtyMap(wrongHeart)["dressura|СЕРДЦЕ|ЛОМТИКИ"], 60);
  assert.equal(qtyMap(wrongHeart)["dressura|СЕРДЦЕ|ЦЕЛОЕ"] || 0, 0);
  // markup size key same → fact may still 145.43, but stored meaning changed
  assert.equal(quote(wrongHeart, raw), 145.43);

  const stated = "145";
  assert.equal(stated, "145");
  assert.deepEqual(PACKS, { u1: 0, u2: 4, u3: 6, up4: 2 });
});

test("clients askQty is push-only; no Целое in СЕРДЦЕ catalog; ig hides РУБЕЦ Крупное", function () {
  const clients = readFileSync(join(here, "clients.js"), "utf8");
  assert.match(clients, /list\.push\(\{ cat: cat, main: name/);
  assert.doesNotMatch(clients, /merge.*basket|findIndex.*sub/);
  const ig = readFileSync(join(here, "ig-labels.js"), "utf8");
  assert.match(ig, /СЕРДЦЕ.*РУБЕЦ Т[\s\S]*КРУПНОЕ/);
  const engine = readFileSync(join(here, "order-engine.js"), "utf8");
  assert.match(engine, /"СЕРДЦЕ":\s*\["Ломтики"/);
  assert.doesNotMatch(engine, /"СЕРДЦЕ":\s*\[[^\]]*"Целое"/);
});
