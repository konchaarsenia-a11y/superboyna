import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

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

function fx() {
  const src = readFileSync(new URL("../proxy/worker.js", import.meta.url), "utf8");
  const builtinStart = src.indexOf("const RAW_COST_BUILTIN_");
  const builtinEnd = src.indexOf("async function ensureRawCostTable_");
  const names = [
    "retailNormalizeNameD1_",
    "isPieceSkuNameD1_",
    "ppCostUnitD1_",
    "ppCostFractionAliasesD1_",
    "ppCostNameVariantsD1_",
    "rawCostBuiltinInfoD1_",
    "rawCostBuiltinGramD1_",
    "meatFracParentCostD1_",
    "lookupPpCostInfoD1_",
    "isGramCrumbLineD1_",
    "buildPpLinesFromCostsD1_"
  ];
  const ctx = createContext({ Object, Number, String, Math, isFinite, Array });
  runInContext(src.slice(builtinStart, builtinEnd) + "\n" + names.map((n) => extractFn(src, n)).join("\n"), ctx);
  return ctx;
}

test("колени шт. берут 1.17 из справочника, даже если имя ЗАГЛАВНЫМИ и кэш нуля", () => {
  const api = fx();
  const bare = api.lookupPpCostInfoD1_({}, "КОЛЕНИ ШТ.", "", null);
  assert.equal(bare.unitPrice, 1.17);
  assert.equal(bare.piece, true);
  const poisoned = api.lookupPpCostInfoD1_({}, "КОЛЕНИ ШТ.", "", { "КОЛЕНИ ШТ.": 1 });
  assert.equal(poisoned.unitPrice, 1.17);
  const live = api.lookupPpCostInfoD1_(
    { "КОЛЕНИ шт.": { name: "КОЛЕНИ шт.", unitPrice: 2.4, per100: 2.4, piece: true } },
    "КОЛЕНИ ШТ.",
    "",
    { "КОЛЕНИ ШТ.": 1 }
  );
  assert.equal(live.unitPrice, 2.4);
  const lines = api.buildPpLinesFromCostsD1_(
    [{ cat: "chew", name: "КОЛЕНИ ШТ.", main: "КОЛЕНИ ШТ.", val: 1, value: 1 }],
    {},
    {}
  );
  assert.equal(lines.rawCost, 1.17);
  assert.equal(lines.missing, 0);
  const goods = Math.round((1.17 * 2.6 + 0.8) * 100) / 100;
  const packs = Math.round((1 * 0.34 + 1 * 1.4) * 100) / 100;
  const fact = Math.round((goods + 7.6 + packs) * 100) / 100;
  assert.equal(packs, 1.74);
  assert.equal(fact, 13.18);
  const cap = Math.round((7 + 9) * 0.92 * 100) / 100;
  assert.equal(cap, 14.72);
  assert.ok(fact <= cap);
});
