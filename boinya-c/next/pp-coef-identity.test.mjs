/**
 * Системный RO-прогон: смена coef не должна давать тождество P'=P.
 * Причина бага v71125444: S=(P−F)/M_new ⇒ quote(M_new)=P.
 */
import { createRequire } from "module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const eng = require("./order-engine.js");
const P = require("./price-logic.js");

const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });

const FRACS = { slices: 0, strips: 1, large: 1, medium: 2, small: 3, extraSmall: 4 };

function invert(stated, coef, list, packsByn, nDel) {
  const st = Number(String(stated).replace(",", "."));
  const m = Number(String(coef).replace(",", "."));
  if (!(st > 0) || !(m > 0)) return 0;
  const recover = P.recoverBynFromBasketLocal_(list) || 0;
  const frac = Number(P.calcDressuraFractionMarkup(list, FRACS).total) || 0;
  const fixed = recover + 7.6 * Math.max(1, Number(nDel) || 1) + packsByn + frac;
  const rest = st - fixed;
  if (!(rest > 0)) return 0;
  if (fixed > 0 && rest < fixed * 0.35) return 0;
  return Math.round((rest / m) * 100) / 100;
}

function quote(cost, coef, list, packsByn, nDel) {
  const q = P.quotePp({
    scheme: "RAW26",
    coef,
    deliveriesN: nDel,
    costSum: cost,
    list,
    packagesByn: packsByn,
    fracRates: FRACS
  });
  return {
    total: Math.round(Number(q.total) * 100) / 100,
    capped: !!(q.fact && q.fact.retailCapped),
    capAt: q.fact && q.fact.retailCapAt
  };
}

/** Как applyPpCoef после фикса: seed S со СТАРЫМ coef, затем quote с новым. */
function changeCoefFixed(stated, fromCoef, toCoef, list, packsByn, nDel, liveRaw) {
  const s = liveRaw > 0 ? liveRaw : invert(stated, fromCoef, list, packsByn, nDel);
  if (!(s > 0)) return { moved: false, reason: "no-raw", before: stated, after: stated, s: 0 };
  const after = quote(s, toCoef, list, packsByn, nDel);
  const beforeN = Number(stated);
  const moved = Math.abs(after.total - beforeN) > 0.05;
  return { moved, before: beforeN, after: after.total, s, capped: after.capped, reason: moved ? "ok" : (after.capped ? "retail-cap" : "stuck") };
}

/** Баг v71125444: seed S уже новым coef. */
function changeCoefBuggy(stated, fromCoef, toCoef, list, packsByn, nDel) {
  const s = invert(stated, toCoef, list, packsByn, nDel);
  const after = quote(s, toCoef, list, packsByn, nDel);
  return {
    moved: Math.abs(after.total - Number(stated)) > 0.05,
    before: Number(stated),
    after: after.total,
    s
  };
}

const indix = eng.mapApiBasketToLocal([
  { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", val: 500 },
  { cat: "chew", main: "УХО Г", name: "УХО Г", sub: "Обычное", val: 2 },
  { cat: "chew", main: "БЫЧИЙ КОРЕНЬ", name: "БЫЧИЙ КОРЕНЬ", sub: "БОЛ", val: 6 },
  { cat: "chew", main: "ТРАХЕЯ", name: "ТРАХЕЯ", sub: "СРЕД", val: 4 },
  { cat: "chew", main: "СТАНОВАЯ ЖИЛА", name: "СТАНОВАЯ ЖИЛА", sub: "БОЛ", val: 4 }
]);
const indixPacks = P.packagesBynFromUCountsLocal_({ u1: 0, u2: 0, u3: 8, up4: 2 });

const fixtures = [
  {
    nick: "indixvost-145",
    list: indix,
    packs: indixPacks,
    n: 1,
    stated: 145,
    coef: 2.6,
    liveRaw: 0,
    expectAt3: 158.67
  },
  {
    nick: "indixvost-true",
    list: indix,
    packs: indixPacks,
    n: 1,
    stated: 166.63,
    coef: 2.6,
    liveRaw: 42.51,
    expectAt3: 183.63
  },
  {
    nick: "indixvost-zero-live",
    list: indix,
    packs: indixPacks,
    n: 1,
    stated: 0,
    coef: 2.6,
    liveRaw: 42.51,
    expectAt3: 183.63
  },
  {
    nick: "new-card",
    list: eng.mapApiBasketToLocal([
      { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", val: 500 }
    ]),
    packs: P.packagesBynFromUCountsLocal_({ u1: 2, u2: 1, u3: 0, up4: 0 }),
    n: 2,
    stated: 100,
    coef: 2.6,
    liveRaw: 0,
    expectAt3: null
  },
  {
    nick: "empty-basket",
    list: [],
    packs: 0,
    n: 1,
    stated: 145,
    coef: 2.6,
    liveRaw: 0,
    expectAt3: null,
    allowStuck: true
  },
  {
    nick: "stated-zero-no-live",
    list: indix,
    packs: indixPacks,
    n: 1,
    stated: 0,
    coef: 2.6,
    liveRaw: 0,
    expectAt3: null,
    allowStuck: true
  },
  {
    nick: "legacy-string-zero",
    list: indix,
    packs: indixPacks,
    n: 1,
    stated: "0",
    coef: 2.6,
    liveRaw: 42.51,
    expectAt3: 183.63
  }
];

/* Синтетические карточки: разные stated/coef, один состав. */
for (let i = 0; i < 40; i++) {
  const stated = 80 + i * 3;
  const coef = i % 2 === 0 ? 2.6 : 2.3;
  fixtures.push({
    nick: "synth-" + i,
    list: indix,
    packs: indixPacks,
    n: 1,
    stated,
    coef,
    liveRaw: 0,
    expectAt3: null
  });
}

const rows = [];
let brokenBuggy = 0;
let brokenFixed = 0;
let checked = 0;

for (const f of fixtures) {
  checked++;
  const buggy = f.list.length
    ? changeCoefBuggy(f.stated, f.coef, 3, f.list, f.packs, f.n)
    : { moved: false, before: Number(f.stated) || 0, after: Number(f.stated) || 0, s: 0 };
  const fixed = f.list.length
    ? changeCoefFixed(f.stated, f.coef, 3, f.list, f.packs, f.n, f.liveRaw)
    : { moved: false, reason: "empty", before: Number(f.stated) || 0, after: Number(f.stated) || 0, s: 0 };

  if (f.list.length && Number(f.stated) > 0 && !buggy.moved) brokenBuggy++;
  const shouldMove = f.list.length && (Number(f.stated) > 0 || f.liveRaw > 0) && !f.allowStuck;
  if (shouldMove && !fixed.moved && fixed.reason !== "retail-cap") brokenFixed++;

  if (f.expectAt3 != null && f.liveRaw > 0) {
    assert.ok(Math.abs(fixed.after - f.expectAt3) < 0.05, f.nick + " expect " + f.expectAt3 + " got " + fixed.after);
  }
  if (f.nick === "indixvost-145") {
    assert.ok(Math.abs(buggy.after - 145) < 0.05, "buggy must identity-freeze ~145");
    assert.ok(fixed.moved && Math.abs(fixed.after - 158.67) < 0.05, "fixed 145→3 → ~158.67");
  }

  rows.push({
    nick: f.nick,
    stated: f.stated,
    coef: f.coef,
    buggy,
    fixed
  });
}

const summary = {
  checked,
  identityFrozenBuggy: brokenBuggy,
  stillBrokenFixed: brokenFixed,
  indixTrueAt3: changeCoefFixed(166.63, 2.6, 3, indix, indixPacks, 1, 42.51),
  indixTrueAt26: quote(42.51, 2.6, indix, indixPacks, 1),
  indix145Buggy: changeCoefBuggy(145, 2.6, 3, indix, indixPacks, 1),
  indix145Fixed: changeCoefFixed(145, 2.6, 3, indix, indixPacks, 1, 0)
};

assert.equal(summary.stillBrokenFixed, 0, "fixed path must move price for all movable cards");
assert.ok(Math.abs(summary.indixTrueAt3.after - 183.63) < 0.05);
assert.ok(Math.abs(summary.indixTrueAt26.total - 166.63) < 0.05);
assert.ok(Math.abs(summary.indix145Buggy.after - 145) < 0.05);
assert.ok(Math.abs(summary.indix145Fixed.after - 158.67) < 0.05);

const out = path.join(outDir, "pp-coef-identity-ro.json");
fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log("RO OK", checked, "cards; buggy identity freezes:", brokenBuggy, "; fixed broken:", brokenFixed);
console.log("wrote", out);
