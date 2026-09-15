#!/usr/bin/env node
/**
 * Pure-function smoke for catalog aliases + без нарезки persist.
 * Extracts helpers from Code.gs (no Apps Script runtime).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "Code.gs"), "utf8");

function extractFn(name) {
  const re = new RegExp("function " + name + "\\s*\\(");
  const start = src.search(re);
  if (start < 0) throw new Error("missing " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}

const names = [
  "normalizeProductAlias_",
  "catalogAliasName_",
  "isCatalogTypoName_",
  "normalizeBasketItemAliases_",
  "normalizeBasketAliases_",
  "noteHasNoCut_",
  "stripCutTagsFromNote_",
  "isExplicitFlagToken_",
  "isFalseFlagToken_",
  "isTrueFlagToken_",
  "resolveNoCutFlag_",
  "applyNoCutToNote_",
  "stripTechFromNote_",
  "stripGeoTagsFromNote_"
];

// stripGeoTagsFromNote_ / stripTechFromNote_ may pull more deps; stub geo if missing.
let bundle = "";
if (!src.includes("function stripGeoTagsFromNote_")) {
  bundle += "function stripGeoTagsFromNote_(s){ return String(s||\"\"); }\n";
}
for (const n of names) {
  try {
    bundle += extractFn(n) + "\n";
  } catch (e) {
    if (n === "stripGeoTagsFromNote_") {
      bundle += "function stripGeoTagsFromNote_(s){ return String(s||\"\"); }\n";
    } else {
      throw e;
    }
  }
}

const fns = {};
const wrapped = bundle + ";\n" + names.map(function (n) {
  return "fns." + n + " = typeof " + n + "===\"function\" ? " + n + " : null;";
}).join("\n");
eval(wrapped);

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exitCode = 1;
  } else {
    console.log("ok  ", msg);
  }
}

const alias = fns.normalizeProductAlias_;
const catalog = fns.catalogAliasName_;
assert(alias("УХО ГА") === "УХО Г", "УХО ГА → УХО Г");
assert(alias("ухо га") === "УХО Г" || catalog("ухо га") === "УХО Г", "ухо га → УХО Г");
assert(catalog("ухо ГА") === "УХО Г", "catalog ухо ГА");
assert(catalog("Аортаа") === "АОРТА", "Аортаа → АОРТА");
assert(catalog("АОРТАА") === "АОРТА", "АОРТАА → АОРТА");
assert(catalog("Аорта") === "АОРТА", "Аорта stays");
assert(catalog("ухо Г") === "УХО Г", "ухо Г stays");
assert(catalog("лопаточный хрящ") === "ЛОП ХРЯЩ", "лопаточный хрящ → ЛОП ХРЯЩ");
assert(fns.isCatalogTypoName_("ухо ГА") === true, "typo flag ухо ГА");
assert(fns.isCatalogTypoName_("Аортаа") === true, "typo flag Аортаа");
assert(fns.isCatalogTypoName_("ухо Г") === false, "ухо Г not typo");

const basket = fns.normalizeBasketAliases_([
  { name: "Аортаа", sub: "ПОЛОВИНКА", val: 2, cat: "chew" },
  { name: "ухо ГА", sub: "Обычное", val: 1, cat: "chew" },
  { name: "АОРТА", sub: "ПОЛОВИНКА", val: 1, cat: "chew" }
]);
assert(basket.length === 2, "merge typo + canon aorta");
const ao = basket.find((it) => it.name === "АОРТА");
assert(ao && ao.val === 3, "аорта qty merged 2+1");
assert(basket.some((it) => it.name === "УХО Г"), "ухо ГА normalized in basket");

assert(fns.resolveNoCutFlag_({}, "[НЕ РЕЗАТЬ] код") === true, "preserve noCut from note");
assert(fns.resolveNoCutFlag_({}, "просто текст") === false, "no tag → cut");
assert(fns.resolveNoCutFlag_({ cutRaw: "1" }, "[НЕ РЕЗАТЬ]") === false, "explicit cutRaw=1 wins");
assert(fns.resolveNoCutFlag_({ cutRaw: "0" }, "") === true, "explicit cutRaw=0");
assert(fns.resolveNoCutFlag_({ noCut: true }, "") === true, "explicit noCut");
assert(fns.resolveNoCutFlag_({}, ["hello", "x [НЕ РЕЗАТЬ]"]) === true, "fallback array");
assert(fns.resolveNoCutFlag_({}, undefined) === false, "empty → cut (default)");

const kept = fns.applyNoCutToNote_("код домофон", true);
assert(/\[НЕ РЕЗАТЬ\]/i.test(kept) && /код домофон/i.test(kept), "apply keeps text + tag");
const cleared = fns.applyNoCutToNote_("код [НЕ РЕЗАТЬ]", false);
assert(!/\[НЕ РЕЗАТЬ\]/i.test(cleared) && /код/.test(cleared), "apply strips when cutting");

if (process.exitCode) {
  console.error("catalog-alias-nocut tests failed");
  process.exit(1);
}
console.log("catalog-alias-nocut OK");
