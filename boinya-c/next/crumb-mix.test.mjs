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
    "cuttingItemsFromPeople_",
    "isChewProductNameD1_",
    "isChewCrumbSourceD1_",
    "normalizeBasketItemAliasesD1_"
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
  assert.match(html, /Крошка микс — 70 г/);
  assert.match(html, /почки — 20 г/);
  assert.match(html, /рубец т — 50 г/);
  assert.match(html, /mix-parts/);
  assert.doesNotMatch(html, /крошка почек 50/i);
  assert.doesNotMatch(html, /Крошка микс,/);
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
  assert.match(html, /Крошка рубца — 50 г/);
  assert.doesNotMatch(html, /Крошка 50(?! )/);
});

test("genitive for every allowed crumb source", () => {
  assert.equal(mix.genitive("ЛЁГКОЕ"), "лёгкого");
  assert.equal(mix.genitive("СЕРДЦЕ"), "сердца");
  assert.equal(mix.genitive("РУБЕЦ Т"), "рубца");
  assert.equal(mix.genitive("ПОЧКИ"), "почек");
  assert.equal(mix.genitive("БАРАНЬЕ ЛЁГКОЕ"), "бараньего лёгкого");
  assert.equal(mix.genitive("ПЕЧЕНЬ"), "печени");
  assert.equal(mix.genitive("БАРАНЬЯ ПЕЧЕНЬ"), "бараньей печени");
  assert.equal(mix.genitive("ИНДЕЙКА"), "индейки");
  assert.equal(mix.genitive("МЯСНЫЕ ЛОМТИКИ"), "мясных ломтиков");
  assert.equal(mix.genitive("ВЫМЯ"), "вымени");
  assert.equal(mix.genitive("ЯБЛОКИ"), "яблок");
  assert.equal(mix.genitive("БАНАНЫ"), "бананов");
  assert.equal(mix.genitive("ГРУШИ"), "груш");
  assert.equal(mix.genitive("МОРКОВЬ"), "моркови");
  assert.equal(mix.genitive("ТЫКВА"), "тыквы");
  assert.equal(mix.genitive("БАТАТ"), "батата");
  assert.equal(mix.genitive("КАБАЧОК"), "кабачка");
  assert.equal(mix.singleLabel("ЯБЛОКИ", 100), "Крошка яблок — 100 г");
});

test("chew is dropped from crumb sources on save and read", () => {
  const row = {
    cat: "crumb",
    main: "КРОШКА",
    crumbKind: "meat",
    value: 100,
    val: 100,
    ratio: [50, 50],
    sources: [
      { cat: "dressura", name: "ЛЁГКОЕ", main: "ЛЁГКОЕ" },
      { cat: "chew", name: "ТРАХЕЯ", main: "ТРАХЕЯ" }
    ]
  };
  const saved = eng.serializeBasketItem_(row);
  assert.deepEqual(saved.sources.map((s) => s.name), ["ЛЁГКОЕ"]);
  assert.deepEqual(saved.ratio, [50]);
  const local = eng.mapApiBasketToLocal([row]);
  assert.deepEqual(local[0].sources.map((s) => s.name), ["ЛЁГКОЕ"]);
  assert.deepEqual(local[0].ratio, [50]);
  const pool = eng.crumbSourcePool_("meat").map((p) => p.name);
  assert.equal(pool.includes("ТРАХЕЯ"), false);
  assert.equal(pool.includes("УХО Г"), false);
  assert.equal(pool.includes("ЛЁГКОЕ"), true);
  assert.equal(eng.isChewProductName_("КОПЫТО шт."), true);
  assert.equal(eng.isChewProductName_("ПЕЧЕНЬ"), false);
});

test("worker drops a chew source before cutting", () => {
  const fx = cuttingFixture();
  const basket = [{
    cat: "crumb",
    name: "КРОШКА",
    main: "КРОШКА",
    val: 100,
    value: 100,
    ratio: [50, 50],
    sources: [
      { cat: "dressura", name: "ЛЁГКОЕ", main: "ЛЁГКОЕ" },
      { cat: "chew", name: "ТРАХЕЯ", main: "ТРАХЕЯ", sub: "МАЛ" }
    ]
  }];
  const normalized = fx.normalizeBasketItemAliasesD1_(JSON.parse(JSON.stringify(basket[0])));
  assert.equal(normalized.sources.length, 1);
  assert.match(normalized.sources[0].name, /Л[ЕЁ]ГКОЕ/);
  assert.equal(normalized.ratio.length, 1);
  assert.equal(Number(normalized.ratio[0]), 50);
  const cut = fx.cuttingItemsFromPeople_([{ basket: basket }], []);
  const names = cut.map((it) => it.name).join(",");
  assert.match(names, /ЛЁГКОЕ|ЛЕГКОЕ/);
  assert.doesNotMatch(names, /ТРАХЕ/);
  const lung = cut.find((it) => /ЛЕГК|ЛЁГК/.test(it.name));
  assert.equal(lung.dry, 50);
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
