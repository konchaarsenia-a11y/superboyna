import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import cut from "./cut-frac.js";
import mix from "./crumb-mix.js";
import eng from "./order-engine.js";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../../fast/data");

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
    "toBool_",
    "isCuttingSheetRow_",
    "collapseCuttingAliasDups_"
  ];
  const ctx = createContext({ Math, Number, String, isFinite, Object, Array, JSON });
  runInContext(names.map((n) => extractFn(src, n)).join("\n"), ctx);
  return ctx;
}

function liveItems() {
  const items = [];
  for (const file of readdirSync(dataDir)) {
    if (!file.startsWith("clients-") || !file.endsWith(".json")) continue;
    const snap = JSON.parse(readFileSync(join(dataDir, file), "utf8"));
    for (const client of (snap.payload && snap.payload.clients) || []) {
      for (const it of client.basket || []) items.push(it);
    }
  }
  assert.ok(items.length > 20, "живой снимок fast/data пуст");
  return items;
}

function pick(items, cat, name, sub) {
  const it = items.find((x) => x.cat === cat && x.name === name && String(x.sub || "") === sub);
  assert.ok(it, "нет живой позиции " + cat + " " + name + " / " + sub);
  return it;
}

function line(it) {
  return mix.linesHtml([it], function (name) { return eng.prettyProductName(name); });
}

test("catalog word matches humanFraction", () => {
  const pairs = [
    ["СЕРДЦЕ", "Среднее"],
    ["ЛЁГКОЕ", "Мелкое"],
    ["ЛЁГКОЕ", "Среднее"],
    ["РУБЕЦ Т", "Крупное"],
    ["ПОЧКИ", "Целое"],
    ["ПОЧКИ", "Крошка"],
    ["СЕРДЦЕ", "Ломтики"],
    ["СЕРДЦЕ", "Полоски"],
    ["ТРАХЕЯ", "СРЕД"],
    ["ТРАХЕЯ", "МАЛ"],
    ["ТРАХЕЯ", "БОЛ"],
    ["АОРТА", "ПОЛОВИНКА"],
    ["ТРАХЕЯ", "ПЛАСТ"],
    ["СТАНОВАЯ ЖИЛА", "ПАЛК"],
    ["УХО Г", "Обычное"],
    ["АОРТА", "Обычная"]
  ];
  pairs.forEach(function (pair) {
    assert.equal(cut.catalogWord(pair[0], pair[1]), eng.humanFraction(pair[0], pair[1]));
  });
  assert.equal(cut.catalogWord("УХО Г", "Обычное"), "");
  assert.equal(cut.catalogWord("ЛЁГКОЕ", "Мелкое"), "мелкий кубик");
  assert.equal(cut.catalogWord("СЕРДЦЕ", "Среднее"), "среднее");
  assert.equal(cut.catalogWord("ТРАХЕЯ", "СРЕД"), "средние");
});

test("live getClients rows have sub and no frac", () => {
  const items = liveItems();
  assert.equal(items.some((it) => it.frac), false);
  const lung = pick(items, "dressura", "ЛЁГКОЕ", "Среднее");
  const trach = pick(items, "chew", "ТРАХЕЯ", "СРЕД");
  const meat = pick(items, "other", "ПЕЧЕНЬ", "");
  [lung, trach, meat].forEach(function (it) {
    assert.deepEqual(Object.keys(it).sort(), ["cat", "name", "sub", "unit", "val", "value"]);
    assert.equal(it.frac, undefined);
    assert.equal(it.main, undefined);
  });
  items.forEach(function (it) {
    assert.equal(cut.catalogWord(it.name, it.sub), eng.humanFraction(it.name, it.sub));
    if (it.cat === "other" || it.cat === "veg") assert.equal(cut.phrase(it), "");
    if (it.cat === "chew" || it.cat === "dressura") {
      assert.equal(cut.phrase(it), eng.humanFraction(it.name, it.sub));
    }
  });
});

test("assembly shows live sub for dressura and chew", () => {
  const items = liveItems();
  const lung = pick(items, "dressura", "ЛЁГКОЕ", "Среднее");
  const lungFine = pick(items, "dressura", "ЛЁГКОЕ", "Мелкое");
  const rumen = pick(items, "dressura", "РУБЕЦ Т", "Среднее");
  const heart = pick(items, "dressura", "СЕРДЦЕ", "Мелкое");
  const kidney = pick(items, "dressura", "ПОЧКИ", "Крошка");
  const trach = pick(items, "chew", "ТРАХЕЯ", "СРЕД");
  const rootChew = pick(items, "chew", "БЫЧИЙ КОРЕНЬ", "БОЛ");
  const ear = pick(items, "chew", "УХО Г", "Обычное");
  const knees = pick(items, "chew", "КОЛЕНИ", "");
  const meat = pick(items, "other", "ПЕЧЕНЬ", "");
  const html = [lung, lungFine, rumen, heart, kidney, trach, rootChew, ear, knees, meat].map(line).join("");
  assert.match(html, new RegExp("Лёгкое " + lung.val + " г среднее"));
  assert.match(html, new RegExp("Лёгкое " + lungFine.val + " г мелкий кубик"));
  assert.match(html, new RegExp("Рубец Т " + rumen.val + " г среднее"));
  assert.match(html, new RegExp("Сердце " + heart.val + " г мелкое"));
  assert.match(html, new RegExp("Почки " + kidney.val + " г крошка"));
  assert.match(html, new RegExp("Трахея " + trach.val + " шт средние"));
  assert.match(html, new RegExp("Бычий корень " + rootChew.val + " шт большие"));
  assert.match(html, new RegExp("Ухо Г " + ear.val + " шт"));
  assert.doesNotMatch(line(ear), /обычн/i);
  assert.match(html, new RegExp("Колени " + knees.val + " шт"));
  assert.doesNotMatch(line(knees), /средн|мелк|крупн/i);
  assert.match(line(meat), new RegExp("Печень " + meat.val + " гр"));
  assert.doesNotMatch(line(meat), /средн|мелк|крупн/);
  assert.doesNotMatch(html, /·/);

  const sheetHeart = { cat: "dressura", name: "СЕРДЦЕ", sub: "Среднее", val: 200, unit: "гр" };
  assert.match(line(sheetHeart), /Сердце 200 г среднее/);
  const d1Heart = { cat: "dressura", main: "СЕРДЦЕ", name: "СЕРДЦЕ", sub: "Среднее", value: 200, val: 200 };
  assert.match(line(d1Heart), /Сердце 200 г среднее/);
  const slash = { cat: "dressura", name: "СЕРДЦЕ / Среднее", val: 200, unit: "гр" };
  assert.equal(cut.phrase(slash), "среднее");
  assert.match(line(slash), /200 г среднее/);
  const embedded = { cat: "chew", name: "ТРАХЕЯ СРЕД шт.", val: 2, unit: "шт" };
  assert.match(line(embedded), /Трахея сред 2 шт средние/i);
  const crumb = {
    cat: "crumb", name: "крошка", val: 80, unit: "гр", sub: "Среднее",
    sources: [{ name: "ЛЁГКОЕ", main: "ЛЁГКОЕ" }], ratio: [80]
  };
  assert.match(line(crumb), /Крошка лёгкого/);
  assert.doesNotMatch(line(crumb), /средн/);
  const withFrac = { cat: "chew", name: "ТРАХЕЯ", sub: "СРЕД", val: 2, unit: "шт", frac: "s" };
  assert.equal(cut.phrase(withFrac), "средние мелкая");
});

test("keep does not invent frac and drops it from meat", () => {
  const old = { cat: "dressura", name: "СЕРДЦЕ", sub: "Среднее", val: 200, unit: "гр" };
  cut.keep(old);
  assert.equal(old.frac, undefined);
  assert.equal(old.sub, "Среднее");
  const meat = { cat: "other", name: "ПЕЧЕНЬ", frac: "s", sub: "" };
  cut.keep(meat);
  assert.equal(meat.frac, undefined);
});

test("serialize still keeps an existing frac", () => {
  const chew = eng.serializeBasketItem_({ cat: "chew", main: "ТРАХЕЯ", name: "ТРАХЕЯ", sub: "СРЕД", value: 2, frac: "l" });
  assert.equal(chew.frac, "l");
  assert.equal(chew.sub, "СРЕД");
  const meat = eng.serializeBasketItem_({ cat: "other", main: "ПЕЧЕНЬ", name: "ПЕЧЕНЬ", value: 150, frac: "m" });
  assert.equal(meat.frac, undefined);
});

test("cutting note uses live chew sub only", () => {
  const items = liveItems();
  const trach = pick(items, "chew", "ТРАХЕЯ", "СРЕД");
  const bol = pick(items, "chew", "ТРАХЕЯ", "БОЛ");
  const heart = pick(items, "dressura", "СЕРДЦЕ", "Мелкое");
  const lung = pick(items, "dressura", "ЛЁГКОЕ", "Среднее");
  const meat = pick(items, "other", "ПЕЧЕНЬ", "");
  const fx = cuttingFixture();
  const rows = fx.cuttingItemsFromPeople_([{
    basket: [trach, bol, heart, lung, meat, {
      cat: "crumb", name: "крошка", value: 80, val: 80, sub: "Мелкое",
      sources: [{ cat: "dressura", name: "ЛЁГКОЕ", main: "ЛЁГКОЕ" }], ratio: [80]
    }]
  }], []);
  const sred = rows.filter((it) => /ТРАХЕ/.test(it.name) && /СРЕД/.test(it.name));
  assert.equal(sred.length, 1);
  assert.equal(sred[0].dry, trach.val);
  assert.deepEqual(JSON.parse(JSON.stringify(sred[0].sizes)), [{ text: "средние", dry: trach.val }]);
  assert.equal(cut.sizesText(sred[0].sizes, sred[0].unit), "средние " + trach.val + " шт");
  const big = rows.find((it) => /ТРАХЕ/.test(it.name) && /БОЛ/.test(it.name));
  assert.ok(big);
  assert.deepEqual(JSON.parse(JSON.stringify(big.sizes)), [{ text: "большие", dry: bol.val }]);
  const heartRow = rows.find((it) => /СЕРДЦ/.test(it.name));
  assert.ok(heartRow);
  assert.equal(heartRow.sizes, undefined);
  const lungRow = rows.find((it) => /ЛЕГК|ЛЁГК/.test(it.name) && !/БАРАН/.test(it.name));
  assert.ok(lungRow);
  assert.equal(lungRow.sizes, undefined);
  const liver = rows.find((it) => /ПЕЧЕН/.test(it.name));
  assert.equal(liver.sizes, undefined);

  const legacy = fx.cuttingItemsFromPeople_([{
    basket: [
      { cat: "chew", name: "ТРАХЕЯ", main: "ТРАХЕЯ", value: 1, val: 1, frac: "s" },
      { cat: "chew", name: "ТРАХЕЯ", main: "ТРАХЕЯ", value: 2, val: 2, frac: "m" },
      { cat: "chew", name: "ТРАХЕЯ", main: "ТРАХЕЯ", value: 4, val: 4 },
      { cat: "dressura", name: "СЕРДЦЕ", main: "СЕРДЦЕ", value: 200, val: 200, sub: "Среднее", frac: "l" }
    ]
  }], []);
  const one = legacy.filter((it) => /ТРАХЕ/.test(it.name));
  assert.equal(one.length, 1);
  assert.equal(one[0].dry, 7);
  assert.deepEqual(JSON.parse(JSON.stringify(one[0].sizes)), [
    { text: "мелкая", dry: 1 },
    { text: "средняя", dry: 2 }
  ]);
  assert.equal(legacy.find((it) => /СЕРДЦ/.test(it.name)).sizes, undefined);

  const merged = fx.collapseCuttingAliasDups_([
    { name: "ТРАХЕЯ СРЕД шт.", dry: 2, raw: 2, unit: "шт", sizes: [{ text: "средние", dry: 2 }] },
    { name: "ТРАХЕЯ СРЕД шт.", dry: 3, raw: 3, unit: "шт", sizes: [{ text: "средние", dry: 1 }, { frac: "s", dry: 2 }] }
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].dry, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(merged[0].sizes)), [
    { text: "мелкая", dry: 2 },
    { text: "средние", dry: 3 }
  ]);
});

test("assembly dressura total splits live sub, chew has no such total", () => {
  const items = liveItems();
  assert.equal(items.some((it) => it.frac), false);
  const pretty = function (name) { return eng.prettyProductName(name); };
  function sum(name, sub) {
    return items.filter(function (it) {
      return it.cat === "dressura" && it.name === name && String(it.sub || "") === sub;
    }).reduce(function (n, it) { return n + Number(it.val || 0); }, 0);
  }
  const lungFine = sum("ЛЁГКОЕ", "Мелкое");
  const lungMid = sum("ЛЁГКОЕ", "Среднее");
  const lungBig = sum("ЛЁГКОЕ", "Большое");
  const heartFine = sum("СЕРДЦЕ", "Мелкое");
  const sheep = sum("БАРАНЬЕ ЛЁГКОЕ", "Мелкое");
  assert.ok(lungFine > 0 && lungMid > 0 && lungBig > 0 && heartFine > 0 && sheep > 0);
  const html = mix.dressuraSummaryHtml(mix.dressuraSummary(items, pretty));
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, new RegExp("Лёгкое мелкий кубик " + lungFine + " г"));
  assert.match(text, new RegExp("Лёгкое среднее " + lungMid + " г"));
  assert.match(text, new RegExp("Лёгкое крупное " + lungBig + " г"));
  assert.match(text, new RegExp("Сердце мелкое " + heartFine + " г"));
  assert.match(text, new RegExp("Баранье лёгкое мелкий кубик " + sheep + " г"));
  const lung = text.slice(text.indexOf("Лёгкое"), text.indexOf("Сердце"));
  assert.ok(lung.indexOf("мелкий кубик") < lung.indexOf("среднее"));
  assert.ok(lung.indexOf("среднее") < lung.indexOf("крупное"));
  assert.doesNotMatch(text, /Трахея|Печень|Яблоки|·/);
  const plain = { cat: "dressura", name: "ПОЧКИ", sub: "Обычное", val: 40, unit: "гр", value: 40 };
  const one = mix.dressuraSummaryHtml(mix.dressuraSummary([plain], pretty));
  assert.match(one, /<span>Почки<\/span><b>40 г<\/b>/);
  assert.doesNotMatch(one, /обычн/i);
  const chew = pick(items, "chew", "ТРАХЕЯ", "СРЕД");
  const meat = pick(items, "other", "ПЕЧЕНЬ", "");
  const mixed = mix.dressuraSummaryHtml(mix.dressuraSummary([chew, meat, plain], pretty));
  assert.doesNotMatch(mixed, /Трахея|Печень/);
  const a = { cat: "dressura", name: "ЛЁГКОЕ", sub: "Среднее", val: 100, unit: "гр", value: 100 };
  const b = { cat: "dressura", name: "ЛЁГКОЕ", sub: "Среднее", val: 50, unit: "гр", value: 50 };
  const c = { cat: "dressura", name: "ЛЁГКОЕ", sub: "", val: 20, unit: "гр", value: 20 };
  const summed = mix.dressuraSummaryHtml(mix.dressuraSummary([a, b, c], pretty)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(summed, /Лёгкое среднее 150 г/);
  assert.match(summed, /Лёгкое 20 г/);
  const prod = readFileSync(new URL("./production.js", import.meta.url), "utf8");
  assert.match(prod, /dressuraSummaryHtml/);
  assert.doesNotMatch(prod, /organs\[k\]\.total/);
  assert.doesNotMatch(prod, /Жевалки<\/p><div class="nx-counters"/);
});
