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
  chew: { items: ["УХО Г", "АОРТА"], fractions: { "УХО Г": ["ПОЛОВИНКА", "Обычное"], "АОРТА": ["Обычная"] } },
  veg: { items: ["КАБАЧОК"], fractions: {} },
  other: { items: ["ПЕЧЕНЬ"], fractions: {} }
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
  "buildPickSuggestions_"
].map(extract).join("\n");

const fns = {};
// eslint-disable-next-line no-new-func
new Function(
  "buildIgKnownMap",
  "igAliasResolve",
  "parseIgLinesToItems",
  "exports",
  code +
    ";\nexports.parseAnketSignals_=parseAnketSignals_;\nexports.buildPickSuggestions_=buildPickSuggestions_;"
)(buildIgKnownMap, igAliasResolve, parseIgLinesToItems, fns);

{
  const sig = fns.parseAnketSignals_(
    "1. Особенно понравился рубец и лёгкое, печень проигнорировал.\n2. Количества не хватило, было впритык.\n3. Удобнее мелкое."
  );
  assert.ok(sig.liked.includes("РУБЕЦ Т") || sig.liked.includes("ЛЁГКОЕ"), "liked: " + JSON.stringify(sig.liked));
  assert.ok(sig.disliked.includes("ПЕЧЕНЬ"), "disliked печень: " + JSON.stringify(sig.disliked));
  assert.equal(sig.qty, "low");
  assert.ok(/мелк/i.test(sig.fracPref));
  const sug = fns.buildPickSuggestions_(sig);
  assert.ok(sug.slots.bp1[1].length >= 2);
  assert.ok(!sug.slots.pp[1].some((it) => it.main === "ПЕЧЕНЬ"));
  const lightBp1 = sug.slots.bp1[1].find((it) => it.main === "ЛЁГКОЕ");
  const lightPp = sug.slots.pp[1].find((it) => it.main === "ЛЁГКОЕ");
  if (lightBp1 && lightPp) assert.ok(lightBp1.value <= lightPp.value);
}

{
  const sig = fns.parseAnketSignals_("ЛЁГКОЕ — 100 г (среднее)\nУХО Г — 1 шт (обычное)\nРУБЕЦ Т — 80 г (среднее)");
  assert.equal(sig.lineItems.length, 3);
  const sug = fns.buildPickSuggestions_(sig);
  assert.equal(sug.slots.retail[1].length, 3);
}

{
  const sig = fns.parseAnketSignals_("Спасибо, всё ок, продолжаем.");
  const sug = fns.buildPickSuggestions_(sig);
  assert.ok(sug.slots.pp[1].length >= 4, "default starter");
}

console.log("test-price-pick: OK");
