import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import "./cut-frac.js";
import mix from "./crumb-mix.js";

function extractFn(src, name) {
  const re = new RegExp("function " + name + "\\s*\\(");
  const i = src.search(re);
  if (i < 0) throw new Error("missing " + name);
  let depth = 0;
  let started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") { depth++; started = true; }
    else if (src[j] === "}") {
      depth--;
      if (started && depth === 0) return src.slice(i, j + 1);
    }
  }
  throw new Error("unclosed " + name);
}

function text(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

test("live crumb fraction shows the parent, not kidneys", () => {
  const rumen = { cat: "dressura", name: "РУБЕЦ Т", sub: "Крошка", val: 100, unit: "гр", value: 100 };
  const kidney = { cat: "dressura", name: "ПОЧКИ", sub: "Крошка", val: 50, unit: "гр", value: 50 };
  const lung = { cat: "dressura", name: "ЛЁГКОЕ", sub: "Крошка", val: 80, unit: "гр", value: 80 };
  const sku = { cat: "other", name: "КРОШКА РУБЕЦ", sub: "", val: 100, unit: "гр", value: 100 };
  assert.match(text(mix.linesHtml([rumen, kidney, lung, sku])), /Крошка рубца — 100 г/);
  assert.match(text(mix.linesHtml([kidney])), /Крошка почек — 50 г/);
  assert.match(text(mix.linesHtml([lung])), /Крошка лёгкого — 80 г/);
  assert.match(text(mix.linesHtml([sku])), /Крошка рубца — 100 г/);
  assert.doesNotMatch(text(mix.linesHtml([rumen])), /почек/i);
  const summary = text(mix.dressuraSummaryHtml(mix.dressuraSummary([rumen, kidney, {
    cat: "dressura", name: "ЛЁГКОЕ", sub: "Среднее", val: 20, unit: "гр", value: 20
  }])));
  assert.match(summary, /Лёгкое среднее 20 г/);
  assert.doesNotMatch(summary, /Крошка|почек|рубца/i);
});

test("crumb mix stays a mix with plain source rows", () => {
  const row = {
    cat: "crumb",
    name: "крошка",
    main: "крошка",
    sub: "РУБЕЦ Т + ПОЧКИ",
    value: 150,
    val: 150,
    ratio: [100, 50],
    sources: [
      { name: "РУБЕЦ Т", main: "РУБЕЦ Т", val: 100, value: 100 },
      { name: "ПОЧКИ", main: "ПОЧКИ", val: 50, value: 50 }
    ]
  };
  const html = mix.linesHtml([row]);
  assert.match(html, /Крошка микс — 150 г/);
  assert.match(html, /рубец т — 100 г/);
  assert.match(html, /почки — 50 г/);
});

test("sheet write maps crumb source onto its sprinkle row", () => {
  const src = readFileSync(new URL("../../Code.gs", import.meta.url), "utf8");
  const ctx = createContext({});
  runInContext([
    extractFn(src, "crumbParentNameGs_"),
    extractFn(src, "sprinkleSkuFromOrder_"),
    extractFn(src, "expandCrumbSheetLines_")
  ].join("\n"), ctx);
  assert.equal(ctx.sprinkleSkuFromOrder_("КРОШКА", "РУБЕЦ Т"), "КРОШКА РУБЕЦ");
  assert.equal(ctx.sprinkleSkuFromOrder_("РУБЕЦ Т", "Крошка"), "КРОШКА РУБЕЦ");
  assert.equal(ctx.sprinkleSkuFromOrder_("ПОЧКИ", "Крошка"), "КРОШКА ПОЧЕК");
  assert.equal(ctx.sprinkleSkuFromOrder_("ЛЁГКОЕ", "Крошка"), "КРОШКА ЛЁГКОГО");
  assert.equal(ctx.sprinkleSkuFromOrder_("КРОШКА РУБЕЦ", ""), "КРОШКА РУБЕЦ");
  assert.equal(ctx.sprinkleSkuFromOrder_("РУБЕЦ Т", "Среднее"), "");
  assert.equal(ctx.sprinkleSkuFromOrder_("КРОШКА", "РУБЕЦ Т + ПОЧКИ"), "");
  const lines = ctx.expandCrumbSheetLines_([{
    cat: "crumb",
    name: "крошка",
    sub: "РУБЕЦ Т",
    value: 100,
    sources: [{ name: "РУБЕЦ Т", val: 100 }],
    ratio: [100]
  }]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].name, "РУБЕЦ Т");
  assert.equal(lines[0].sub, "Крошка");
  assert.equal(lines[0].val, 100);
  assert.equal(ctx.sprinkleSkuFromOrder_(lines[0].name.toUpperCase(), lines[0].sub), "КРОШКА РУБЕЦ");
});

test("courier slot and window from live client fields", () => {
  const src = readFileSync(new URL("./production.js", import.meta.url), "utf8");
  const ctx = createContext({
    window: {},
    document: { getElementById() { return null; } },
    localStorage: { getItem() { return ""; }, setItem() {} }
  });
  ctx.window = ctx;
  ctx.globalThis = ctx;
  runInContext(src, ctx);
  const slot = ctx.BoinyaProduction.slotLabel;
  const when = ctx.BoinyaProduction.windowLabel;
  assert.equal(slot({ segment: "ПП", ppSlot: "2", ppHint: "ПП 2", deliverySlot: 2 }), "ПП2");
  assert.equal(slot({ segment: "ПП", ppSlot: "2/2", deliverySlot: 2 }), "ПП2");
  assert.equal(slot({ segment: "ПП", ppSlot: "1", ppHint: "ПП 2", deliverySlot: 1 }), "ПП2");
  assert.equal(slot({ segment: "ПП", ppSlot: "", ppHint: "ПП 2", deliverySlot: 2 }), "ПП2");
  assert.equal(slot({ segment: "ПП", ppSlot: "1/2", ppHint: "ПП 1", deliverySlot: 1 }), "ПП1");
  assert.equal(slot({ segment: "ПП", ppSlot: "1", ppHint: "ПП 1" }), "ПП1");
  assert.equal(slot({ segment: "БП", ppSlot: "", ppHint: "" }), "БП");
  assert.equal(when({ deliveryAfter: "10:00", deliveryBefore: "14:30" }), "от 10:00 до 14:30");
  assert.equal(when({ deliveryAfter: "09:15:00", deliveryBefore: "" }), "от 09:15");
  assert.equal(when({ deliveryAfter: "", deliveryBefore: "18:00" }), "до 18:00");
  assert.equal(when({ deliveryAfter: "", deliveryBefore: "" }), "");
});
