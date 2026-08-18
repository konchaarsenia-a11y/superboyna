/**
 * Quick harness for parseIgLinesToItems — run: node boinya-c/scripts/test-checklist-parse.mjs
 */
import { readFileSync } from "fs";
import { createContext, runInContext } from "vm";

const src = readFileSync(new URL("../app.main.js", import.meta.url), "utf8");

// Extract catalog + functions between buildIgKnownMap and end of parseIgLinesToItems
const start = src.indexOf("function buildIgKnownMap()");
const end = src.indexOf("async function parseIgChecklistIntoPrice()", start);
const chunk = src.slice(start, end);

const ctx = createContext({
  window: { _igKnownMapCache: null },
  priceDogCount: 1,
  priceActiveDog: 1,
  priceDogNames: { 1: "", 2: "" },
  priceBaskets: { 1: [], 2: [] },
});
runInContext(`
  ${src.match(/const catalog = \{[\s\S]*?\n    \};/)[0]}
  ${chunk}
`, ctx);

const { parseIgLinesToItems, normalizeChecklistRaw_, splitPriceChecklistByDogs_ } = ctx;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const orderBlankSectionSample = `Дрессура
Лёгкое — 200 г (средний кубик)
Рубец — 100 г (мелкое)

Жевалки
Бычий корень — 150 г (мал)
Ушко — 1 шт (половинка)`;

const orderSections = splitPriceChecklistByDogs_(orderBlankSectionSample, { forOrder: true });
assert(orderSections.length === 1, "order: category sections must stay 1 dog, got " + orderSections.length);

const priceSections = splitPriceChecklistByDogs_(orderBlankSectionSample);
assert(priceSections.length === 1, "price: same text without dog markers stays 1 section");

const twoDogNamed = `Рекс: Лёгкое — 200 г
Пэни: Рубец — 100 г`;
const orderNamed = splitPriceChecklistByDogs_(twoDogNamed, { forOrder: true });
assert(orderNamed.length === 2, "order: named markers split 2 dogs");

const nickFalsePositive = `Буся
Лёгкое — 200 г
Рубец — 100 г

Марк
Печень — 150 г`;
const orderNick = splitPriceChecklistByDogs_(nickFalsePositive, { forOrder: true });
assert(orderNick.length === 1, "order: dog nicknames without colon must not split");
const priceNick = splitPriceChecklistByDogs_(nickFalsePositive);
assert(priceNick.length === 2, "price: nicknames may split when set in расчёт");

console.log("split order/price checks OK");

const samples = [
  {
    name: "classic dash",
    raw: `Дрессура
Лёгкое — 200 г (средний кубик)
Рубец — 100 г (мелкое)
Жевалки
Бычий корень — 150 г (мал)
Ушко — 1 шт (половинка)`,
  },
  {
    name: "no dash name first",
    raw: `Лёгкое 200 г средний кубик
Рубец 100г мелкое
Бычий корень 150г`,
  },
  {
    name: "colon format",
    raw: `Лёгкое: 200 г (средний кубик)
Корень: 150 г`,
  },
  {
    name: "x multiplier",
    raw: `Лёгкое — 200 г x2
Трахея — 100 г (средняя)`,
  },
  {
    name: "ig one line paste",
    raw: `Дрессура Лёгкое — 200 г (средний кубик) Рубец — 100 г (мелкое) Жевалки Бычий корень — 150 г`,
  },
  {
    name: "tab separated",
    raw: `Лёгкое\t200 г\tсредний кубик
Рубец\t100 г`,
  },
  {
    name: "bullet emoji",
    raw: `• Лёгкое — 200 г (средний кубик)
🔸 Рубец — 100 г`,
  },
  {
    name: "100г glued",
    raw: `Лёгкое — 200г (средний кубик)
Бычий корень 150г (мал)`,
  },
  {
    name: "two dogs inline",
    raw: `Рекс: Лёгкое — 200 г Пэни: Рубец — 100 г`,
  },
  {
    name: "price lines mixed",
    raw: `Лёгкое — 200 г
Итоговая стоимость 45 рублей
Бычий корень — 150 г`,
  },
  {
    name: "baranie legkoe alias",
    raw: `Баранье лёгкое — 300 г (среднее)
Лопаточный хрящ — 2 шт`,
  },
  {
    name: "fraction in name not paren",
    raw: `Лёгкое средний кубик — 200 г
Трахея средняя — 100 г`,
  },
  {
    name: "multiply sign",
    raw: `Лёгкое — 200 г × 2
Печень — 100 г * 3`,
  },
  {
    name: "numbered list",
    raw: `1. Лёгкое — 200 г
2) Рубец — 100 г`,
  },
];

for (const s of samples) {
  const norm = normalizeChecklistRaw_(s.raw);
  const parsed = parseIgLinesToItems(norm);
  const items = parsed.items.map((it) => ({
    name: it.name,
    val: it.val,
    sub: it.sub,
    cat: it.cat,
    needFrac: it.needFrac,
    other: it.cat === "other",
  }));
  const sections = splitPriceChecklistByDogs_(s.raw);
  console.log("\n===", s.name, "===");
  console.log("items:", items.length, items);
  if (parsed.noteBits.length) console.log("unknown:", parsed.noteBits);
  console.log("sections:", sections.map((x) => ({ dog: x.dog, name: x.name, lines: (x.text || "").split("\n").length })));
}
