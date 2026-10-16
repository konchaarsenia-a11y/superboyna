import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
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

const workerSrc = readFileSync(new URL("../proxy/worker.js", import.meta.url), "utf8");
const prodSrc = readFileSync(new URL("./production.js", import.meta.url), "utf8");

const workerNames = [
  "isCrumbBasketItemD1_",
  "cuttingAggKey_",
  "crumbFingerprint_",
  "crumbBelongsToCard_",
  "crumbsMissingFromCard_",
  "parseBoundItemNotes_",
  "noteCutKey_",
  "noteLineMatch_",
  "applyCuttingItemNotes_"
];
const worker = createContext({});
runInContext(workerNames.map((n) => extractFn(workerSrc, n)).join("\n"), worker);

const prod = createContext({ root: {} });
runInContext(
  ["noteNameKey_", "noteMatchesLine_", "parseBoundNotes_", "noteFor"].map((n) => extractFn(prodSrc, n)).join("\n"),
  prod
);

const CRUMB = {
  cat: "crumb",
  main: "крошка",
  name: "крошка",
  sub: "ЛЁГКОЕ + СЕРДЦЕ + РУБЕЦ Т + ПОЧКИ",
  value: 200,
  val: 200,
  crumbKind: "meat",
  sources: [
    { cat: "dressura", name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", sub: "" },
    { cat: "dressura", name: "СЕРДЦЕ", main: "СЕРДЦЕ", sub: "" },
    { cat: "dressura", name: "РУБЕЦ Т", main: "РУБЕЦ Т", sub: "" },
    { cat: "dressura", name: "ПОЧКИ", main: "ПОЧКИ", sub: "" }
  ],
  ratio: [50, 50, 50, 50]
};

const ASM = [
  { cat: "dressura", name: "ЛЁГКОЕ", sub: "Среднее", val: 100, unit: "гр" },
  { cat: "dressura", name: "СЕРДЦЕ", sub: "Целое", val: 20, unit: "гр" },
  { cat: "dressura", name: "РУБЕЦ Т", sub: "Среднее", val: 20, unit: "гр" },
  { cat: "chew", name: "ЛОП ХРЯЩ", val: 1, unit: "шт" }
];

const NOTE = "[NOTE:mgr,cut,cour|perm|ITEM:Лопаточный хрящ] Целый";

test("сборка добирает крошку из живого заказа и не дублирует её", () => {
  const missing = worker.crumbsMissingFromCard_({ basket: ASM, dogPart: 0 }, ASM.concat([CRUMB]));
  assert.equal(missing.length, 1);
  assert.equal(missing[0].val, 200);
  const again = worker.crumbsMissingFromCard_({ basket: ASM.concat([CRUMB]) }, ASM.concat([CRUMB]));
  assert.equal(again.length, 0);
  const dog2 = worker.crumbsMissingFromCard_(
    { basket: [], dogPart: 1 },
    [{ ...CRUMB, dog: 2 }]
  );
  assert.equal(dog2.length, 0);
});

test("крошка микс рисуется тем же linesHtml, примечание под хрящом", () => {
  const html = mix.linesHtml(ASM.concat([CRUMB]), null, function (g) {
    const hit = prod.parseBoundNotes_(NOTE).find((n) => prod.noteMatchesLine_(n.item, g.name || g.main, g.sub));
    return hit ? '<p class="b-note nx-item-note">прим.: ' + hit.text + "</p>" : "";
  });
  assert.match(html, /Крошка микс — 200 г/);
  assert.match(html, /лёгкое — 50 г/);
  assert.match(html, /сердце — 50 г/);
  assert.match(html, /рубец т — 50 г/);
  assert.match(html, /почки — 50 г/);
  assert.match(html, /Лоп Хрящ 1 шт/);
  const cart = html.indexOf("Лоп Хрящ 1 шт");
  const note = html.indexOf("прим.: Целый");
  assert.ok(cart >= 0 && note > cart);
  assert.equal(html.slice(0, cart).includes("прим.:"), false);
});

test("примечание к позиции не остаётся общим текстом курьера", () => {
  assert.equal(prod.noteFor(NOTE, "cour"), "");
  assert.equal(prod.noteFor(NOTE + " || [NOTE:cour|once] позвонить у двери", "cour"), "позвонить у двери");
  assert.equal(prod.noteMatchesLine_("Лопаточный хрящ", "ЛОП ХРЯЩ ШТ.", ""), true);
  assert.equal(prod.noteMatchesLine_("Лопаточный хрящ", "ЛЁГКОЕ", "Среднее"), false);
});

test("нарезка: примечание под хрящом и ник клиента", () => {
  const items = worker.applyCuttingItemNotes_(
    [{ name: "ЛОП ХРЯЩ шт.", dry: 1, unit: "шт" }, { name: "ЛЁГКОЕ", dry: 100, unit: "гр" }],
    [{ name: "Qwert_mor", note: NOTE, basket: ASM }]
  );
  const chew = JSON.parse(JSON.stringify(items[0].noteInfo));
  assert.equal(chew.groups[0].text, "Целый");
  assert.deepEqual(chew.groups[0].clients, ["Qwert_mor"]);
  assert.equal(chew.groups[0].qty, 1);
  assert.equal(items[1].noteInfo, undefined);
});
