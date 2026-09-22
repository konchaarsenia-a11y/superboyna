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
    items: ["УХО Г", "УХО К", "АОРТА", "БЫЧИЙ КОРЕНЬ", "ТРАХЕЯ", "ЛОП ХРЯЩ шт.", "СТАНОВАЯ ЖИЛА", "НОСЫ шт.", "ПЕРЕПЁЛКИ шт.", "УТИНЫЕ ШЕИ шт.", "КОЛЕНИ шт."],
    fractions: {
      "УХО Г": ["ПОЛОВИНКА", "Обычное"],
      "УХО К": ["ПОЛОВИНКА", "Обычное"],
      "АОРТА": ["ПОЛОВИНКА", "Обычная"],
      "БЫЧИЙ КОРЕНЬ": ["МАЛ", "СРЕД", "БОЛ"],
      "ТРАХЕЯ": ["МАЛ", "СРЕД", "БОЛ"],
      "СТАНОВАЯ ЖИЛА": ["ПАЛК", "СРЕД", "БОЛ"]
    }
  },
  veg: { items: ["КАБАЧОК", "ТЫКВА", "БАТАТ", "ЯБЛОКИ", "МОРКОВЬ", "БАНАНЫ"], fractions: {} },
  other: { items: ["ПЕЧЕНЬ", "ИНДЕЙКА", "ВЫМЯ", "СЕМЕННИКИ"], fractions: {} }
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
  "pricePickAliasText_",
  "pricePickRound5_",
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
  "pricePickBanned_",
  "pricePickPushSku_",
  "pricePickLungAnchor_",
  "pricePickOfferLines_",
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

function grams(payload, name) {
  const it = payload.items.find((x) => x.main === name);
  return it ? it.value : 0;
}

{
  const jay = fns.parseAnketSignals_(
    "Венгерская выжла, 6 лет, 35 кг. Давали лёгкое, бычий пенис. Не понравилась трахея. Аллергия на рыбу. Нужно лёгкое. Бюджет 50–80. Мелкие кубики."
  );
  assert.equal(jay.budgetByn, 65);
  assert.equal(jay.weightKg, 35);
  assert.ok(jay.disliked.includes("ТРАХЕЯ"), "jay hate trachea " + JSON.stringify(jay.disliked));
  assert.ok(jay.familyNotes.includes("рыба"));
  assert.ok(jay.tried.includes("БЫЧИЙ КОРЕНЬ"), "penis alias " + JSON.stringify(jay.tried));
  assert.ok(!jay.disliked.includes("ПЕЧЕНЬ"));
  const bp1 = fns.pricePickComposeForTarget_(jay, "bp1");
  const bp2 = fns.pricePickComposeForTarget_(jay, "bp2");
  assert.equal(grams(bp1, "ЛЁГКОЕ"), 40);
  assert.equal(grams(bp1, "СЕРДЦЕ"), 15);
  assert.equal(grams(bp1, "РУБЕЦ Т"), 10);
  assert.equal(grams(bp1, "ТЫКВА"), 5);
  assert.equal(grams(bp1, "БАТАТ"), 5);
  assert.ok(bp1.items.some((it) => it.main === "ЛОП ХРЯЩ шт."));
  assert.ok(bp1.items.some((it) => it.main === "АОРТА"));
  assert.ok(!bp1.items.some((it) => it.main === "ТРАХЕЯ" || it.main === "БЫЧИЙ КОРЕНЬ"));
  assert.ok(bp1.items.find((it) => it.main === "ЛЁГКОЕ").sub === "Мелкое");
  assert.ok(grams(bp2, "ЛЁГКОЕ") >= 50 && grams(bp2, "ЛЁГКОЕ") <= 65);
  assert.equal(grams(bp2, "ПОЧКИ"), 15);
  assert.ok(bp2.items.some((it) => it.main === "БЫЧИЙ КОРЕНЬ"));
  assert.ok(!bp2.items.some((it) => it.main === "ТРАХЕЯ" || it.main === "ПЕРЕПЁЛКИ шт."));
  assert.equal(grams(bp2, "ТЫКВА"), 10);
  assert.equal(grams(bp2, "БАНАНЫ"), 10);
}

{
  const twix = fns.parseAnketSignals_(
    "Беспородная, 9 мес, 11 кг. Любит лёгкое и трахею. Аллергия на курицу. Бюджет 50-80."
  );
  assert.equal(twix.puppy, false);
  assert.ok(twix.liked.includes("ТРАХЕЯ"));
  assert.ok(twix.disliked.includes("УХО К"));
  const bp1 = fns.pricePickComposeForTarget_(twix, "bp1");
  const bp2 = fns.pricePickComposeForTarget_(twix, "bp2");
  assert.equal(grams(bp1, "ЛЁГКОЕ"), 50);
  assert.equal(grams(bp1, "СЕРДЦЕ"), 20);
  assert.equal(grams(bp1, "ТРАХЕЯ"), 1);
  assert.ok(!bp1.items.some((it) => it.main === "УХО К" || it.main === "ПЕРЕПЁЛКИ шт."));
  assert.ok(grams(bp2, "ЛЁГКОЕ") >= 70 && grams(bp2, "ЛЁГКОЕ") <= 80);
}

{
  const ched = fns.parseAnketSignals_(
    "Такса, 8.3 кг. Любит бычий корень, лёгкое, вымя, уши кролика. Не любит рубец и печенье. Исключить курицу. Не рубец и птица. Нужны бычий корень и лёгкое. Расход ~10–12 малых бычьих корней + ~700 г лёгкого. Бюджет >120 BYN."
  );
  assert.equal(ched.budgetByn, 130);
  assert.equal(ched.monthlyLungG, 700);
  assert.equal(ched.rootPcs, 11);
  assert.equal(ched.rootFrac, "МАЛ");
  assert.ok(ched.must.includes("БЫЧИЙ КОРЕНЬ") && ched.must.includes("ЛЁГКОЕ"));
  assert.ok(ched.disliked.includes("РУБЕЦ Т"));
  assert.ok(!ched.disliked.includes("ПЕЧЕНЬ"), "печенье не печень");
  assert.ok(!ched.liked.includes("УХО Г"), "кроличьи уши не УХО Г " + JSON.stringify(ched.liked));
  assert.ok(ched.disliked.includes("УХО К") && ched.disliked.includes("ПЕРЕПЁЛКИ ШТ."));
  const bp2 = fns.pricePickComposeForTarget_(ched, "bp2");
  assert.equal(grams(bp2, "ЛЁГКОЕ"), 70);
  assert.equal(grams(bp2, "СЕРДЦЕ"), 20);
  assert.equal(grams(bp2, "ПОЧКИ"), 20);
  assert.equal(grams(bp2, "ВЫМЯ"), 10);
  const root = bp2.items.find((it) => it.main === "БЫЧИЙ КОРЕНЬ");
  assert.ok(root && root.value === 1 && root.sub === "МАЛ");
  assert.ok(!bp2.items.some((it) => it.main === "РУБЕЦ Т" || it.main === "УХО К" || it.main === "ПЕРЕПЁЛКИ шт."));
  const pp = fns.pricePickComposeForTarget_(ched, "pp");
  assert.equal(grams(pp, "ЛЁГКОЕ"), 350);
  const rootPp = pp.items.find((it) => it.main === "БЫЧИЙ КОРЕНЬ");
  assert.ok(rootPp && rootPp.value === 8 && rootPp.sub === "МАЛ");
}

{
  const lun = fns.parseAnketSignals_("Лунтик щенок, 6 мес. Ломтики убрали.");
  assert.equal(lun.puppy, true);
  assert.equal(lun.qty, "high");
  const bp1 = fns.pricePickComposeForTarget_(lun, "bp1");
  const bp2 = fns.pricePickComposeForTarget_(lun, "bp2");
  assert.equal(grams(bp1, "ЛЁГКОЕ"), 15);
  assert.equal(grams(bp1, "СЕРДЦЕ"), 10);
  assert.equal(grams(bp1, "ТРАХЕЯ"), 2);
  assert.equal(grams(bp1, "СТАНОВАЯ ЖИЛА"), 2);
  assert.equal(grams(bp1, "ЯБЛОКИ"), 5);
  assert.equal(grams(bp1, "ТЫКВА"), 5);
  assert.equal(grams(bp1, "РУБЕЦ Т"), 0);
  assert.equal(grams(bp2, "ЛЁГКОЕ"), 10);
  assert.equal(grams(bp2, "СЕРДЦЕ"), 0);
}

{
  const sig = fns.parseAnketSignals_("Расход 300 г лёгкого. 2 доставки. Бюджет 84 BYN. Бычий корень 4.");
  assert.equal(sig.monthlyLungG, 300);
  assert.equal(sig.deliveriesN, 2);
  assert.equal(sig.rootPcs, 4);
  const ret = fns.pricePickComposeForTarget_(sig, "retail");
  assert.equal(grams(ret, "ЛЁГКОЕ"), 300);
  assert.equal(grams(ret, "БЫЧИЙ КОРЕНЬ"), 4);
}

console.log("test-price-pick: OK");
