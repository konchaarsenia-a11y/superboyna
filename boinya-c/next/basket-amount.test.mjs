import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import amount from "./basket-amount.js";
import mix from "./crumb-mix.js";

/** t747: защита — ненулевое количество не должно пропадать с экрана. */
const FIXTURES = {
  pp: [{ cat: "dressura", name: "СЕРДЦЕ", main: "СЕРДЦЕ", sub: "Ломтики", val: 30, value: 30 }],
  bp: [{ cat: "dressura", name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", sub: "Ломтики", val: 60, value: 60 }],
  retail: [{ cat: "dressura", name: "РУБЕЦ Т", main: "РУБЕЦ Т", sub: "крупные кусочки", val: 200, value: 200 }],
  partner_qty: [
    { id: "vr_t_heart", name: "Сердце", qty: 100, unit: "г" },
    { id: "vr_t_lung", name: "Лёгкое", qty: 100, unit: "г" }
  ],
  partner_idless: [
    { name: "Сердце", qty: 100, unit: "г" },
    { name: "Лёгкое", qty: 80, unit: "г" }
  ]
};

test("canon: qty and val both resolve; normalize sets val+value", () => {
  assert.equal(amount.itemAmount({ qty: 100 }), 100);
  assert.equal(amount.itemAmount({ val: 30, value: 30 }), 30);
  const n = amount.normalizeItem({ name: "Сердце", qty: 100, unit: "г" });
  assert.equal(n.val, 100);
  assert.equal(n.value, 100);
  assert.equal(n.qty, 100);
});

test("canon: unknown amount key warns and still reads", () => {
  const warns = [];
  const orig = console.warn;
  console.warn = function () {
    warns.push(Array.from(arguments).join(" "));
  };
  try {
    const n = amount.normalizeItem({ name: "X", grams: 50 });
    assert.equal(n.val, 50);
    assert.equal(n.value, 50);
    assert.match(String(n._amountWarn || ""), /alt_key:grams/);
    assert.ok(warns.length >= 1);
  } finally {
    console.warn = orig;
  }
});

test("guard: linesHtml shows amount for every order type (incl Varka qty)", () => {
  Object.keys(FIXTURES).forEach(function (kind) {
    const basket = FIXTURES[kind];
    const html = mix.linesHtml(basket);
    const bad = amount.assertBasketDisplay(basket, html, kind);
    assert.equal(bad.length, 0, kind + " missing grams on screen: " + JSON.stringify(bad) + " html=" + html);
  });
});

test("guard: zero amount may stay empty; positive must not", () => {
  const empty = [{ name: "Сердце", qty: 0, unit: "г" }];
  assert.equal(amount.assertBasketDisplay(empty, mix.linesHtml(empty), "zero").length, 0);
  const brokenHtml = "<div>Сердце</div><div>Лёгкое</div>";
  const bad = amount.assertBasketDisplay(FIXTURES.partner_qty, brokenHtml, "broken");
  assert.ok(bad.length >= 1, "must fail when HTML drops grams");
});

test("worker mirror matches front canon for qty", () => {
  const src = readFileSync(new URL("../proxy/worker.js", import.meta.url), "utf8");
  function extractFn(name) {
    const re = new RegExp("function " + name + "\\s*\\(");
    const i = src.search(re);
    if (i < 0) throw new Error("missing " + name);
    let depth = 0;
    let started = false;
    for (let j = i; j < src.length; j++) {
      if (src[j] === "{") {
        depth++;
        started = true;
      } else if (src[j] === "}") {
        depth--;
        if (started && depth === 0) return src.slice(i, j + 1);
      }
    }
    throw new Error("unclosed " + name);
  }
  const ctx = createContext({ console });
  runInContext(
    [
      extractFn("basketItemAmountRawD1_"),
      extractFn("basketItemAmountD1_"),
      extractFn("normalizeBasketItemAmountD1_"),
      extractFn("normalizeBasketAmountsD1_")
    ].join("\n"),
    ctx
  );
  const row = ctx.normalizeBasketItemAmountD1_({ name: "Сердце", qty: 100, unit: "г" });
  assert.equal(row.val, 100);
  assert.equal(row.value, 100);
  assert.equal(ctx.basketItemAmountD1_({ qty: 100 }), 100);
  assert.equal(ctx.basketItemAmountD1_({ val: 30 }), 30);
  const front = amount.normalizeItem({ name: "Сердце", qty: 100, unit: "г" });
  assert.equal(front.val, row.val);
});
