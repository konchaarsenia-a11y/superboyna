import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

function extractFn(src, name) {
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

function extractConstObject(src, name) {
  const re = new RegExp("const\\s+" + name + "\\s*=");
  const i = src.search(re);
  if (i < 0) throw new Error("missing const " + name);
  let depth = 0;
  let started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") {
      depth++;
      started = true;
    } else if (src[j] === "}") {
      depth--;
      if (started && depth === 0) {
        const end = src.indexOf(";", j);
        return src.slice(i, end + 1);
      }
    }
  }
  throw new Error("unclosed const " + name);
}

function loadPartnerFns() {
  const src = readFileSync(new URL("../proxy/worker.js", import.meta.url), "utf8");
  const parts = [
    extractConstObject(src, "PARTNER_TREAT_PP_MAP_"),
    extractFn(src, "partnerTreatMapForLine_"),
    extractFn(src, "partnerTreatsToPpBasket_"),
    extractFn(src, "basketItemAmountRawD1_"),
    extractFn(src, "basketItemAmountD1_"),
    extractFn(src, "normalizeBasketItemAmountD1_"),
    extractFn(src, "normalizeBasketAmountsD1_"),
    extractFn(src, "partnerBasketForClients_")
  ];
  const ctx = createContext({ console });
  runInContext(parts.join("\n"), ctx);
  return ctx;
}

test("partnerBasketForClients_ maps qty to val/value", () => {
  const ctx = loadPartnerFns();
  const mapped = ctx.partnerBasketForClients_([
    { id: "vr_t_heart", name: "Сердце", qty: 100, unit: "г" },
    { id: "vr_t_lung", name: "Лёгкое", qty: 100, unit: "г" }
  ]);
  assert.equal(mapped.length, 2);
  assert.equal(mapped[0].name, "СЕРДЦЕ");
  assert.equal(mapped[0].val, 100);
  assert.equal(mapped[0].value, 100);
  assert.equal(mapped[0].sub, "Ломтики");
  assert.equal(mapped[1].name, "ЛЁГКОЕ");
  assert.equal(mapped[1].val, 100);
});

test("partnerBasketForClients_ id-less name still gets grams", () => {
  const ctx = loadPartnerFns();
  const mapped = ctx.partnerBasketForClients_([
    { name: "Сердце", qty: 100, unit: "г" },
    { name: "Лёгкое", qty: 80, unit: "г" }
  ]);
  assert.equal(mapped.length, 2);
  assert.equal(mapped[0].val, 100);
  assert.equal(mapped[1].val, 80);
  assert.ok(/СЕРДЦ/i.test(mapped[0].name));
});

test("basketItemAmountD1_ reads qty", () => {
  const ctx = loadPartnerFns();
  assert.equal(ctx.basketItemAmountD1_({ qty: 100 }), 100);
  assert.equal(ctx.basketItemAmountD1_({ val: 30, value: 30 }), 30);
  assert.equal(ctx.basketItemAmountD1_({ value: 40 }), 40);
});
