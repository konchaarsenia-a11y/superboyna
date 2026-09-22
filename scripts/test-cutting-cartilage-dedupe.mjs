#!/usr/bin/env node
/**
 * Лопаточный хрящ в нарезке: одно имя, штуки суммируются.
 * Фракции жевалок и ключи ухо ГА / аорта не схлопываются этим ключом.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing function " + name);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}

const wSrc = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
const names = [
  "toBool_",
  "catalogAliasNameD1_",
  "isCrumbBasketItemD1_",
  "expandCrumbsForCuttingD1_",
  "isPieceSku_",
  "chewSubToken_",
  "crumbParentFromBasketName_",
  "cuttingNameFromBasketItem_",
  "cutNameKey_",
  "cutFuzzyKey_",
  "cuttingAggKey_",
  "cuttingListHasAliasDup_",
  "isCuttingSheetRow_",
  "collapseCuttingAliasDups_",
  "normalizeCuttingItemFlags_",
  "normalizeCuttingItems_",
  "findPrevCuttingByName_",
  "mergeCuttingFlags_",
  "overlayCuttingKeepFlags_",
  "cuttingItemsFromPeople_"
];
const ctx = vm.createContext({ Math, Number, String, isFinite, Object, Array, JSON });
vm.runInContext(names.map((n) => extractFn(wSrc, n)).join("\n"), ctx);

const agg = ctx.cuttingAggKey_;
assert(agg("ЛОП ХРЯЩ") === "ЛОП ХРЯЩ", "лоп хрящ");
assert(agg("ЛОП ХРЯЩ ШТ.") === "ЛОП ХРЯЩ", "лоп хрящ шт");
assert(agg("ЛОП ХРЯЩ шт.") === "ЛОП ХРЯЩ", "лоп хрящ шт mixed");
assert(agg("лопаточный хрящ") === "ЛОП ХРЯЩ", "лопаточный хрящ");
assert(agg("лопаточные хрящи") === "ЛОП ХРЯЩ", "лопаточные хрящи");
assert(agg("лопаточных хрящей") === "ЛОП ХРЯЩ", "лопаточных хрящей");
assert(agg("хрящи лопаточные") === "ЛОП ХРЯЩ", "хрящи лопаточные");
assert(agg("ЛОП. ХРЯЩ") === "ЛОП ХРЯЩ", "лоп. хрящ");
assert(agg("УХО ГА") === "УХО ГА", "ухо ГА key stays; alias is catalogAliasNameD1_");
assert(ctx.catalogAliasNameD1_("ухо ГА") === "УХО Г", "ухо ГА alias canon");
assert(ctx.catalogAliasNameD1_("Аортаа") === "АОРТА", "аортаа alias canon");
assert(agg("АОРТАА") === "АОРТАА", "аортаа cutting key not rewritten here");
assert(agg("АОРТА") !== agg("АОРТА ПОЛОВИНКА"), "аорта vs половинка");
assert(agg("УХО Г") !== agg("УХО Г ПОЛОВИНКА"), "ухо vs половинка");
assert(agg("УХО Г") !== agg("УХО К"), "ухо Г vs ухо К");
assert(agg("ТРАХЕЯ ПЛАСТ шт.") !== agg("ТРАХЕЯ СРЕД шт."), "трахея фракции");
assert(agg("ТРАХЕЯ ПЛАСТ") !== agg("ТРАХЕЯ СРЕД"), "трахея без шт");
assert(agg("ЛЁГКОЕ") === "ЛЁГКОЕ", "лёгкое прежний ключ");
assert(agg("КОЛЕНИ") !== agg("КОЛЕНИ ШТ."), "колени и колени шт. не склеиваем");

function chew(name, val) {
  return { cat: "chew", name: name, main: name, sub: "", val: val, value: val, unit: "шт" };
}
function grams(name, val, sub) {
  return { cat: "dressura", name: name, main: name, sub: sub || "", val: val, value: val, unit: "гр" };
}

const wed = ctx.cuttingItemsFromPeople_(
  [
    { name: "karpusha_me", basket: [chew("ЛОП ХРЯЩ ШТ.", 2), grams("ЛЁГКОЕ", 100, "Среднее")] },
    { name: "si_i_ann", basket: [chew("лопаточные хрящи", 3), grams("ЛЁГКОЕ", 50, "Мелкое")] },
    {
      name: "vi.minaeva_nails",
      noCut: true,
      note: "[НЕ РЕЗАТЬ]",
      basket: [chew("ЛОП ХРЯЩ ШТ.", 2)]
    }
  ],
  [{ name: "ЛЁГКОЕ", coef: 0.2 }]
);
const hry = wed.filter((it) => /ХРЯЩ/i.test(it.name));
assert(hry.length === 1, "среда: одна строка хряща, got " + hry.length + " " + JSON.stringify(hry));
assert(hry[0].name === "ЛОП ХРЯЩ шт.", "канон имени листа");
assert(hry[0].dry === 5, "2+3, без НЕ РЕЗАТЬ, got " + hry[0].dry);
assert(hry[0].unit === "шт", "хрящ штуки");
const lung = wed.filter((it) => it.name === "ЛЁГКОЕ");
assert(lung.length === 1 && lung[0].dry === 150, "лёгкое 100+50 одной строкой");
assert(lung[0].unit === "гр", "лёгкое граммы");

const mixed = ctx.cuttingItemsFromPeople_([
  {
    name: "a",
    basket: [
      chew("лопаточный хрящ", 1),
      chew("лопаточных хрящей", 2),
      chew("ЛОП ХРЯЩ", 1),
      chew("ЛОП. ХРЯЩ шт.", 1),
      chew("ТРАХЕЯ ПЛАСТ шт.", 4),
      chew("ТРАХЕЯ СРЕД шт.", 2),
      chew("УХО Г", 1),
      chew("УХО Г ПОЛОВИНКА шт.", 3),
      chew("УХО К", 1),
      chew("АОРТА", 1),
      chew("АОРТА ПОЛОВИНКА шт.", 2),
      chew("АОРТАА", 1)
    ]
  }
]);
function named(re) {
  return mixed.filter((it) => re.test(it.name));
}
assert(named(/ХРЯЩ/i).length === 1 && named(/ХРЯЩ/i)[0].dry === 5, "четыре написания хряща = 5");
const tr = mixed.filter((it) => /ТРАХЕЯ/.test(it.name));
assert(tr.length === 2, "трахея пласт и сред отдельно, got " + tr.map((it) => it.name).join("|"));
assert(tr.reduce((s, it) => s + it.dry, 0) === 6, "трахея 4+2 не слились в одну сумму-строку");
assert(named(/УХО Г/).length === 2, "ухо Г и половинка");
assert(named(/УХО К/).length === 1 && named(/УХО К/)[0].dry === 1, "ухо К отдельно");
const aorta = mixed.filter((it) => /АОРТ/.test(it.name));
assert(aorta.length === 3, "аорта, половинка и АОРТАА не склеиваем в этом ключе, got " + aorta.map((it) => it.name).join("|"));

const fresh = [{ name: "ЛОП ХРЯЩ шт.", dry: 5, unit: "шт", laid: false, done: false, outNext: false }];
const prevTwins = [
  { name: "ЛОП ХРЯЩ", dry: 5, laid: true, done: false, outNext: false },
  { name: "ЛОП ХРЯЩ ШТ.", dry: 5, laid: false, done: true, outNext: false }
];
const over = ctx.overlayCuttingKeepFlags_(fresh, prevTwins, true, true);
const overH = over.filter((it) => /ХРЯЩ/i.test(it.name));
assert(overH.length === 1, "overlay не клонирует хрящ, got " + overH.length);
assert(overH[0].dry === 5, "overlay не складывает клон 5+5");
assert(overH[0].laid === true && overH[0].done === true, "флаги обеих старых строк OR");

const knees = ctx.overlayCuttingKeepFlags_(
  [
    { name: "КОЛЕНИ", dry: 2, laid: false, done: false, outNext: false },
    { name: "КОЛЕНИ ШТ.", dry: 4, laid: false, done: false, outNext: false },
    { name: "ЛЁГКОЕ", dry: 80, laid: false, done: false, outNext: false }
  ],
  [
    { name: "КОЛЕНИ", dry: 2, laid: true, done: false, outNext: false },
    { name: "КОЛЕНИ ШТ.", dry: 4, laid: false, done: false, outNext: false }
  ],
  true,
  true
);
assert(knees.length === 3, "колени / колени шт. / лёгкое остаются тремя, got " + knees.length);
assert(knees.find((it) => it.name === "КОЛЕНИ").dry === 2, "колени 2");
assert(knees.find((it) => it.name === "КОЛЕНИ ШТ.").dry === 4, "колени шт. 4");

const healed = ctx.collapseCuttingAliasDups_([
  { name: "ЛОП ХРЯЩ ШТ.", dry: 5, raw: 5, unit: "шт", row: 24, laid: false, done: false },
  { name: "ЛОП ХРЯЩ ШТ.", dry: 5, raw: 5, unit: "шт", row: 24, laid: true, done: false }
]);
assert(healed.length === 1 && healed[0].dry === 5, "snap-клон 5+5 → одна строка 5");
assert(healed[0].laid === true, "галочка клона сохраняется");
assert(ctx.cuttingListHasAliasDup_(prevTwins) === true, "детектор дубля");
assert(ctx.cuttingListHasAliasDup_(healed) === false, "после склейки дубля нет");

const split = ctx.collapseCuttingAliasDups_([
  { name: "лопаточный хрящ", dry: 2, raw: 2, unit: "шт" },
  { name: "ЛОП ХРЯЩ ШТ.", dry: 3, raw: 3, unit: "шт" }
]);
assert(split.length === 1 && split[0].dry === 5, "разный dry двух написаний суммируется");

const flagOverlay = ctx.overlayCuttingKeepFlags_(
  [
    { name: "ЛЁГКОЕ", done: true, laid: true, outNext: false },
    { name: "НОВАЯ", done: true, laid: true, outNext: true }
  ],
  [{ name: "ЛЁГКОЕ", done: false, laid: true, outNext: false }],
  true,
  true
);
const light = flagOverlay.find((it) => it.name === "ЛЁГКОЕ");
const neu = flagOverlay.find((it) => it.name === "НОВАЯ");
assert(light && light.laid === true && light.done === false, "флаг laid со snap, done с GAS не накатываем");
assert(neu && neu.done === false && neu.laid === false, "новая позиция без TRUE с GAS");
assert(flagOverlay.length === 2, "лёгкое и новая, без клона");

console.log("ok cutting cartilage dedupe");
