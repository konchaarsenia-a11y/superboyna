/**
 * Smoke: Подбор heuristics from boinya-c/app.main.js
 * Run: node scripts/test-price-pick.mjs
 */
import assert from "assert";
import fs from "fs";

const js = fs.readFileSync(new URL("../boinya-c/app.main.js", import.meta.url), "utf8");

function extract(name) {
  const re = new RegExp("function " + name + "\\([\\s\\S]*?\\n    \\}\\n");
  const m = js.match(re);
  if (!m) throw new Error("missing " + name);
  return m[0];
}

const catalog = {
  dressura: {
    items: ["ЛЁГКОЕ", "СЕРДЦЕ", "РУБЕЦ Т", "ПОЧКИ"],
    fractions: {
      "ЛЁГКОЕ": ["Ломтики", "Полоски", "Крупное", "Среднее", "Мелкое", "Очень мелкое"],
      "СЕРДЦЕ": ["Ломтики", "Полоски", "Мелкое"],
      "РУБЕЦ Т": ["Ломтики", "Полоски", "Среднее", "Мелкое"],
      "ПОЧКИ": ["Ломтики", "Мелкое"]
    }
  },
  chew: {
    items: ["УХО Г", "УХО К", "АОРТА", "БЫЧИЙ КОРЕНЬ", "ТРАХЕЯ"],
    fractions: {
      "УХО Г": ["ПОЛОВИНКА", "Обычное"],
      "УХО К": ["ПОЛОВИНКА", "Обычное"],
      "АОРТА": ["Обычная"],
      "БЫЧИЙ КОРЕНЬ": ["МАЛ", "СРЕД", "БОЛ"],
      "ТРАХЕЯ": ["МАЛ", "СРЕД", "БОЛ"]
    }
  },
  veg: { items: ["КАБАЧОК"], fractions: {} },
  other: { items: ["ПЕЧЕНЬ", "ИНДЕЙКА"], fractions: {} }
};

function buildIgKnownMap() {
  const known = {};
  Object.keys(catalog).forEach((k) => {
    (catalog[k].items || []).forEach((n) => {
      known[n.toUpperCase()] = { cat: k, name: n, fractions: ((catalog[k].fractions || {})[n] || []).slice() };
    });
  });
  return known;
}
function igAliasResolve(up) {
  const key = String(up || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
  if (key === "ЛЕГКОЕ") return "ЛЁГКОЕ";
  if (key === "РУБЕЦ") return "РУБЕЦ Т";
  return key;
}
function parseIgLinesToItems(raw) {
  const known = buildIgKnownMap();
  const added = [];
  String(raw || "").split(/\n/).forEach((line) => {
    const m = line.match(/^(.+?)\s*[—\-–:]\s*(\d+)\s*(г|гр|шт)?(?:\s*[\(（]([^\)）]+)[\)）])?/i);
    if (!m) return;
    let name = String(m[1]).toUpperCase().replace(/Ё/g, "Е").trim();
    name = igAliasResolve(name);
    const hit = known[name] || known[String(m[1]).toUpperCase()];
    if (!hit) return;
    let frac = m[4] || "";
    if (/средн/i.test(frac)) frac = hit.cat === "chew" ? "СРЕД" : "Среднее";
    if (/обычн/i.test(frac)) frac = (hit.fractions || []).find((f) => /Обычн/i.test(f)) || frac;
    added.push({ cat: hit.cat, main: hit.name, name: hit.name, sub: frac, value: Number(m[2]), val: Number(m[2]) });
  });
  return { items: added, noteBits: [] };
}

const code = [
  "pricePickNormUp_",
  "pricePickMatchMention_",
  "parseAnketSignals_",
  "pricePickDefaultFrac_",
  "pricePickDefaultStarter_",
  "pricePickItemFromSku_",
  "pricePickScaleItems_",
  "pricePickExcludeNames_",
  "pricePickBoostLiked_",
  "pricePickCloneItems_",
  "pricePickTargetScale_",
  "pricePickSwapForBp2_",
  "pricePickOrderSections_",
  "pricePickComposeForTarget_"
].map(extract).join("\n");

const fns = {};
new Function(
  "buildIgKnownMap",
  "igAliasResolve",
  "parseIgLinesToItems",
  "exports",
  "function priceModeKey(mode){var m=String(mode||'').toLowerCase();if(m==='retail')return 'retail';if(m==='bp1')return 'bp1';if(m==='bp2')return 'bp2';return 'pp';}\n" +
    code +
    ";\nexports.parseAnketSignals_=parseAnketSignals_;\nexports.pricePickComposeForTarget_=pricePickComposeForTarget_;"
)(buildIgKnownMap, igAliasResolve, parseIgLinesToItems, fns);

{
  const sig = fns.parseAnketSignals_(
    "1. Особенно понравился рубец и лёгкое, печень проигнорировал.\n2. Количества не хватило, было впритык.\n3. Удобнее мелкое. Обязательно бычий корень. Без курицы и рыбы. Вес 12 кг, бюджет 90."
  );
  assert.ok(sig.liked.includes("РУБЕЦ Т") || sig.liked.includes("ЛЁГКОЕ"), "liked: " + JSON.stringify(sig.liked));
  assert.ok(sig.disliked.includes("ПЕЧЕНЬ"), "disliked печень: " + JSON.stringify(sig.disliked));
  assert.ok(sig.must.includes("БЫЧИЙ КОРЕНЬ"), "must корень: " + JSON.stringify(sig.must));
  assert.ok(sig.disliked.includes("УХО К"), "exclude курица");
  assert.ok(sig.familyNotes.includes("рыба"));
  assert.equal(sig.qty, "low");
  assert.equal(sig.budgetByn, 90);
  assert.equal(sig.weightKg, 12);
  const bp1 = fns.pricePickComposeForTarget_(sig, "bp1");
  const bp2 = fns.pricePickComposeForTarget_(sig, "bp2");
  assert.equal(bp1.target, "bp1");
  assert.ok(bp1.items.some((it) => it.main === "БЫЧИЙ КОРЕНЬ"));
  assert.ok(!bp1.items.some((it) => it.main === "ПЕЧЕНЬ" || it.main === "УХО К"));
  const light1 = bp1.items.find((it) => it.main === "ЛЁГКОЕ");
  const light2 = bp2.items.find((it) => it.main === "ЛЁГКОЕ");
  if (light1 && light2) assert.ok(light2.value >= light1.value, "bp2 larger");
}

{
  const sig = fns.parseAnketSignals_("ЛЁГКОЕ — 100 г (среднее)\nУХО Г — 1 шт (обычное)\nРУБЕЦ Т — 80 г (среднее)");
  assert.equal(sig.lineItems.length, 3);
  const one = fns.pricePickComposeForTarget_(sig, "pp");
  const lung = one.items.find((it) => it.main === "ЛЁГКОЕ");
  assert.ok(lung && lung.value === 100, "explicit grams kept for итоговый");
}

{
  const sig = fns.parseAnketSignals_("Спасибо, всё ок, продолжаем.");
  const one = fns.pricePickComposeForTarget_(sig, "retail");
  assert.ok(one.items.length >= 4, "default starter");
  assert.ok(one.usedDefault);
}

console.log("test-price-pick: OK");
