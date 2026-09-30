import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import mix from "./crumb-mix.js";
import eng from "./order-engine.js";
import pay from "./order-payload.js";

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

function cuttingFixture() {
  const src = readFileSync(new URL("../proxy/worker.js", import.meta.url), "utf8");
  const names = [
    "catalogAliasNameD1_",
    "isCrumbBasketItemD1_",
    "expandCrumbsForCuttingD1_",
    "isPieceSku_",
    "chewSubToken_",
    "crumbParentFromBasketName_",
    "cuttingNameFromBasketItem_",
    "cuttingAggKey_",
    "cuttingItemsFromPeople_"
  ];
  const ctx = createContext({});
  runInContext(names.map((n) => extractFn(src, n)).join("\n"), ctx);
  return ctx;
}

function savedBasket(line) {
  const item = mix.parseLine(line);
  const local = eng.mapApiBasketToLocal([item]);
  const state = {
    orderType: "pp",
    baskets: { 1: local, 2: [] },
    activeDog: 1,
    dogCount: 1,
    notes: []
  };
  return pay.basketOf(state, eng);
}

function cutOf(basket) {
  const fx = cuttingFixture();
  return fx.cuttingItemsFromPeople_([{ basket: basket }], []);
}

test("checklist mix: kidneys 20 and rumen 50", () => {
  const item = mix.parseLine("крошка почки 20 рубец 50");
  assert.equal(item.cat, "crumb");
  assert.deepEqual(item.sources.map((s) => s.name), ["ПОЧКИ", "РУБЕЦ Т"]);
  assert.deepEqual(item.ratio, [20, 50]);
  assert.equal(item.value, 70);
});

test("other crumb spellings", () => {
  const a = mix.parseLine("крошка микс: почки 20 г, рубец 50 г");
  assert.deepEqual(a.ratio, [20, 50]);
  const b = mix.parseLine("крошка почек 20 + рубца 50");
  assert.deepEqual(b.sources.map((s) => s.name), ["ПОЧКИ", "РУБЕЦ Т"]);
  assert.equal(b.value, 70);
  const c = mix.parseLine("рубец крошка 50");
  assert.equal(c.sources.length, 1);
  assert.equal(c.sources[0].name, "РУБЕЦ Т");
  assert.deepEqual(c.ratio, [50]);
  assert.equal(c.value, 50);
});

test("ratio survives mapApiBasketToLocal and basketOf", () => {
  const basket = savedBasket("крошка почки 20 рубец 50");
  assert.equal(basket.length, 1);
  assert.equal(basket[0].cat, "crumb");
  assert.deepEqual(basket[0].ratio, [20, 50]);
});

test("cutting splits 20 and 50", () => {
  const items = cutOf(savedBasket("крошка почки 20 рубец 50"));
  const kidney = items.find((it) => /ПОЧКИ/.test(it.name));
  const rumen = items.find((it) => /РУБЕЦ/.test(it.name));
  assert.ok(kidney, items.map((it) => it.name).join(","));
  assert.ok(rumen);
  assert.equal(kidney.dry, 20);
  assert.equal(rumen.dry, 50);
});

test("assembly lines name both sources", () => {
  const html = mix.linesHtml(savedBasket("крошка почки 20 рубец 50"));
  assert.match(html, /Крошка микс, 70 г/);
  assert.match(html, /Почки, 20 г/);
  assert.match(html, /Рубец Т, 50 г/);
  assert.doesNotMatch(html, /крошка почек 50/i);
});

test("single crumb shows the source", () => {
  const row = {
    cat: "crumb",
    main: "КРОШКА",
    crumbKind: "meat",
    sources: [{ name: "РУБЕЦ Т", main: "РУБЕЦ Т", cat: "dressura", val: 50 }],
    ratio: [50],
    value: 50
  };
  const html = mix.linesHtml([row]);
  assert.match(html, /Крошка рубца 50 г/);
  assert.doesNotMatch(html, /Крошка 50(?! )/);
});

test("one source still cuts as kidneys 20", () => {
  const items = cutOf(savedBasket("крошка почек 20"));
  const kidney = items.find((it) => /ПОЧКИ/.test(it.name));
  assert.ok(kidney);
  assert.equal(kidney.dry, 20);
  assert.equal(items.length, 1);
});

test("lung slices are not a crumb", () => {
  assert.equal(mix.parseLine("Лёгкое 200 г ломтики"), null);
  const parsed = eng.parseIgLinesToItems("Лёгкое 200 г ломтики");
  const items = (parsed && parsed.items) || [];
  assert.equal(items.length, 1);
  assert.match(String(items[0].main || ""), /ЛЁГКОЕ|ЛЕГКОЕ/);
  assert.equal(Number(items[0].value), 200);
});
