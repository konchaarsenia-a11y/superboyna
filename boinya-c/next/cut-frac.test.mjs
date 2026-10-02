import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import cut from "./cut-frac.js";
import mix from "./crumb-mix.js";
import eng from "./order-engine.js";

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
    "isChewCrumbSourceD1_"
  ];
  const ctx = createContext({});
  runInContext(names.map((n) => extractFn(src, n)).join("\n"), ctx);
  return ctx;
}

test("size applies to chew and dressura only", () => {
  assert.equal(cut.applies({ cat: "chew", name: "ТРАХЕЯ" }), true);
  assert.equal(cut.applies({ cat: "dressura", name: "СЕРДЦЕ" }), true);
  assert.equal(cut.applies({ cat: "other", name: "ПЕЧЕНЬ" }), false);
  assert.equal(cut.applies({ cat: "veg", name: "ЯБЛОКИ" }), false);
  assert.equal(cut.applies({ cat: "crumb", name: "крошка", sources: [{ name: "ЛЁГКОЕ" }] }), false);
  assert.equal(cut.applies({ name: "ТРАХЕЯ" }), true);
  assert.equal(cut.label("s"), "мелкая");
  assert.equal(cut.label("m"), "средняя");
  assert.equal(cut.label("l"), "крупная");
  assert.equal(cut.label(""), "");
  assert.equal(cut.label("ломтики"), "");
});

test("old line without frac has no word, new line defaults to medium", () => {
  const old = { cat: "dressura", name: "СЕРДЦЕ", value: 200 };
  cut.keep(old);
  assert.equal(old.frac, undefined);
  const fresh = { cat: "chew", name: "ТРАХЕЯ", value: 2 };
  cut.stampNew(fresh);
  assert.equal(fresh.frac, "m");
  const meat = { cat: "other", name: "ПЕЧЕНЬ", frac: "s" };
  cut.stampNew(meat);
  assert.equal(meat.frac, undefined);
});

test("assembly text names dressura and chew, skips meat and crumb", () => {
  const html = mix.linesHtml([
    { cat: "dressura", name: "СЕРДЦЕ", main: "СЕРДЦЕ", value: 200, frac: "s" },
    { cat: "chew", name: "ТРАХЕЯ", main: "ТРАХЕЯ", value: 2, frac: "m" },
    { cat: "other", name: "ПЕЧЕНЬ", main: "ПЕЧЕНЬ", value: 150, frac: "l" },
    { cat: "crumb", name: "крошка", main: "крошка", value: 100, frac: "s", sources: [{ name: "ЛЁГКОЕ", main: "ЛЁГКОЕ" }], ratio: [100] }
  ], function (name) {
    return String(name || "").toLowerCase().replace(/(^|\s)(\S)/g, function (_, sp, ch) { return sp + ch.toUpperCase(); });
  });
  assert.match(html, /Сердце 200 г мелкая/);
  assert.match(html, /Трахея 2 шт средняя/);
  assert.match(html, /Печень 150/);
  assert.doesNotMatch(html, /Печень 150 г крупная/);
  assert.match(html, /Крошка лёгкого/);
  assert.doesNotMatch(html, /Крошка лёгкого — 100 г мелкая/);
  assert.doesNotMatch(html, /·/);
});

test("serialize and map keep frac on chew and dressura", () => {
  const chew = eng.serializeBasketItem_({ cat: "chew", main: "ТРАХЕЯ", name: "ТРАХЕЯ", sub: "СРЕД", value: 2, frac: "l" });
  assert.equal(chew.frac, "l");
  assert.equal(chew.sub, "СРЕД");
  const dress = eng.serializeBasketItem_({ cat: "dressura", main: "СЕРДЦЕ", name: "СЕРДЦЕ", sub: "Среднее", value: 200, frac: "s" });
  assert.equal(dress.frac, "s");
  const meat = eng.serializeBasketItem_({ cat: "other", main: "ПЕЧЕНЬ", name: "ПЕЧЕНЬ", value: 150, frac: "m" });
  assert.equal(meat.frac, undefined);
  const crumb = eng.serializeBasketItem_({
    cat: "crumb", main: "крошка", value: 100, frac: "s",
    sources: [{ cat: "dressura", name: "ЛЁГКОЕ", main: "ЛЁГКОЕ" }], ratio: [100]
  });
  assert.equal(crumb.frac, undefined);
  const back = eng.mapApiBasketToLocal([chew, dress, { cat: "dressura", main: "СЕРДЦЕ", name: "СЕРДЦЕ", value: 50 }]);
  assert.equal(back[0].frac, "l");
  assert.equal(back[1].frac, "s");
  assert.equal(back[2].frac, undefined);
});

test("cutting shows chew sizes only and does not split the row", () => {
  const fx = cuttingFixture();
  const items = fx.cuttingItemsFromPeople_([{
    basket: [
      { cat: "chew", name: "ТРАХЕЯ", main: "ТРАХЕЯ", value: 1, val: 1, frac: "s" },
      { cat: "chew", name: "ТРАХЕЯ", main: "ТРАХЕЯ", value: 2, val: 2, frac: "m" },
      { cat: "chew", name: "ТРАХЕЯ", main: "ТРАХЕЯ", value: 4, val: 4 },
      { cat: "dressura", name: "СЕРДЦЕ", main: "СЕРДЦЕ", value: 200, val: 200, frac: "l" },
      { cat: "other", name: "ПЕЧЕНЬ", main: "ПЕЧЕНЬ", value: 100, val: 100, frac: "s" },
      { cat: "crumb", name: "крошка", main: "крошка", value: 80, val: 80, frac: "m", sources: [{ cat: "dressura", name: "ЛЁГКОЕ", main: "ЛЁГКОЕ" }], ratio: [80] }
    ]
  }], []);
  const trach = items.filter((it) => /ТРАХЕ/.test(it.name));
  assert.equal(trach.length, 1);
  assert.equal(trach[0].dry, 7);
  assert.deepEqual(JSON.parse(JSON.stringify(trach[0].sizes)), [{ frac: "s", dry: 1 }, { frac: "m", dry: 2 }]);
  assert.equal(cut.sizesText(trach[0].sizes, trach[0].unit), "мелкая 1 шт средняя 2 шт");
  const heart = items.find((it) => /СЕРДЦ/.test(it.name));
  assert.ok(heart);
  assert.equal(heart.sizes, undefined);
  assert.equal(heart.dry, 200);
  const liver = items.find((it) => /ПЕЧЕН/.test(it.name));
  assert.equal(liver.sizes, undefined);
  const lung = items.find((it) => /ЛЕГК|ЛЁГК/.test(it.name));
  assert.ok(lung);
  assert.equal(lung.sizes, undefined);
  assert.equal(lung.dry, 80);
});
