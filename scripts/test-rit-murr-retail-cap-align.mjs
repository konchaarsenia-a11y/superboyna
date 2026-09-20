#!/usr/bin/env node
/**
 * rit_murr: card message dropped crumbKind → retail 156.20 / sub 157.50 (156 vs 158).
 * Worker R=171.20, cap 157.50. UI must keep mixer 15 and show sub ≤ 0.92×R.
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

const uiSrc = fs.readFileSync(path.join(root, "boinya-c/app.main.js"), "utf8");
const wSrc = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");

assert(/v71115989/.test(uiSrc), "APP_VERSION v71115989");
assert(/function ppSheetPrice_/.test(uiSrc) && /function raw26ApiFactPrice_/.test(uiSrc), "UI ignores stale calcFactCost");
assert(/function subscriptionNickKeys_/.test(wSrc) && /function sanitizeRaw26CalcFactCost_/.test(wSrc), "Worker nick aliases + sanitize calcFact");
assert(
  /subDetailBasketPayload_\(\)/.test(uiSrc) &&
    !/cat: x\.cat \|\| "other"/.test(uiSrc.match(/function buildSubDetailClientMessageText_[\s\S]{0,400}/)[0]),
  "card message keeps full crumb payload (no remap that drops crumbKind)"
);
assert(
  /function retailGoodsFromCrumbItemUi_/.test(uiSrc) &&
    /function capOfferSubToDisplayedRetail_/.test(uiSrc),
  "UI has crumb retail helper + offer cap"
);
assert(
  /function crumbKindRateUi_/.test(uiSrc) && /овощ\|фрукт/.test(uiSrc) && /veggie/.test(uiSrc),
  "UI mixer rates match Worker (veg/овощ/фрукт)"
);

const ctx = vm.createContext({
  Math,
  Number,
  String,
  isFinite,
  Object,
  Array,
  RETAIL_PRICE: {
    "ЛЁГКОЕ|Среднее": { per100: 11 },
    "СЕРДЦЕ|Целое": { per100: 12 },
    "ПОЧКИ|Целое": { per100: 11 },
    "БЫЧИЙ КОРЕНЬ|СРЕД": { perPiece: 12 },
    "ЯБЛОКИ": { per100: 11 },
    "КРОШКА РУБЕЦ": { per100: 12 },
    "РУБЕЦ Т|Целое": { per100: 10 },
    "РУБЕЦ Т": { per100: 10 }
  },
  PRICE_RETAIL_FREE_FROM: 80,
  PRICE_RETAIL_DELIVERY_BYN: 9,
  PP_RAW26_RETAIL_CAP: 0.92,
  priceDogCount: 1,
  retailLookupKey_: function (name, sub) {
    name = String(name || "").trim();
    sub = String(sub || "").trim();
    return { name: name, sub: sub, key: sub ? name + "|" + sub : name };
  },
  retailAliasPriceKeys_: function () { return []; },
  dressuraFractionSizeKey: function () { return ""; },
  dressuraFractionRates: function () { return {}; },
  retailBasePer100_: function () { return null; },
  isCrumbBasketItemUi_: function (it) {
    return !!(it && (String(it.cat || "").toLowerCase() === "crumb" || it.crumbKind || (it.sources && it.sources.length)));
  },
  buildPriceCompositionForMessage: function () { return "СОСТАВ"; }
});

vm.runInContext(
  [
    extractFn(uiSrc, "crumbKindRateUi_"),
    extractFn(uiSrc, "retailGoodsFromCrumbItemUi_"),
    extractFn(uiSrc, "retailSkuLineCost_"),
    extractFn(uiSrc, "isRetailCrumbItem_"),
    extractFn(uiSrc, "retailLineCost"),
    extractFn(uiSrc, "calcRetailBasketTotal"),
    extractFn(uiSrc, "money2_"),
    extractFn(uiSrc, "formatClientRub_"),
    extractFn(uiSrc, "capOfferSubToDisplayedRetail_"),
    extractFn(uiSrc, "composePpClientMessage"),
    extractFn(uiSrc, "ppSheetPrice_"),
    extractFn(uiSrc, "raw26ApiFactPrice_"),
    extractFn(uiSrc, "ppOfferClientPrice_")
  ].join("\n"),
  ctx
);

assert(ctx.crumbKindRateUi_("veg") === 15, "veg 15");
assert(ctx.crumbKindRateUi_("дрессура овощи/фрукты") === 15, "label овощи → 15");
assert(ctx.crumbKindRateUi_("meat") === 17, "meat 17");
assert(ctx.crumbKindRateD1_ === undefined, "no worker fn leak");

const wCtx = vm.createContext({ Math, Number, String, isFinite, Object, Array });
vm.runInContext(
  [
    extractFn(wSrc, "normalizeMatchKey_"),
    extractFn(wSrc, "subscriptionSheetKey_"),
    extractFn(wSrc, "subscriptionNickKeys_"),
    extractFn(wSrc, "subscriptionMatch_"),
    extractFn(wSrc, "sanitizeRaw26CalcFactCost_"),
    extractFn(wSrc, "crumbKindRateD1_")
  ].join("\n"),
  wCtx
);
assert(wCtx.crumbKindRateD1_("veg") === ctx.crumbKindRateUi_("veg"), "UI/Worker veg");
assert(wCtx.crumbKindRateD1_("овощи") === ctx.crumbKindRateUi_("овощи"), "UI/Worker овощи");

const rit = [
  { cat: "dressura", name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", sub: "Среднее", val: 320 },
  { cat: "dressura", name: "СЕРДЦЕ", main: "СЕРДЦЕ", sub: "Целое", val: 80 },
  { cat: "dressura", name: "ПОЧКИ", main: "ПОЧКИ", sub: "Целое", val: 40 },
  { cat: "chew", name: "БЫЧИЙ КОРЕНЬ", main: "БЫЧИЙ КОРЕНЬ", sub: "СРЕД", val: 8 },
  { cat: "veg", name: "ЯБЛОКИ", main: "ЯБЛОКИ", sub: "", val: 100 },
  {
    cat: "crumb",
    name: "крошка",
    main: "крошка",
    sub: "РУБЕЦ Т",
    val: 100,
    crumbKind: "veg",
    sources: [{ cat: "dressura", name: "РУБЕЦ Т", main: "РУБЕЦ Т", sub: "" }],
    ratio: [1]
  }
];

const full = ctx.calcRetailBasketTotal(rit, { deliveriesN: 1 });
assert(full.goods === 171.2, "full basket R=171.20, got " + full.goods);
assert(full.delivery === 0, "R≥80 → retail delivery 0");
assert(full.total === 171.2, "retail total = goods");

const stripped = rit.map(function (x) {
  return {
    cat: x.cat || "other",
    main: x.main || x.name,
    name: x.name || x.main,
    sub: x.sub || "",
    val: x.val
  };
});
const oldBug = ctx.calcRetailBasketTotal(stripped, { deliveriesN: 1 });
assert(
  Math.abs(oldBug.goods - 156.2) < 0.011 || oldBug.goods === 168.2 || oldBug.goods === 171.2,
  "stripped payload must not crash; got " + oldBug.goods
);
// After fallback (cat=crumb + sub РУБЕЦ Т → КРОШКА РУБЕЦ 12) R=168.20, not 0-cost 156.20
assert(oldBug.goods >= 168.2 - 0.01, "crumb fallback ≥168.20 (not 156.20 zero), got " + oldBug.goods);

const crumbOnly = ctx.retailGoodsFromCrumbItemUi_(rit[5], 100);
assert(crumbOnly === 15, "veg mixer 100g = 15, got " + crumbOnly);

const noKind = ctx.retailGoodsFromCrumbItemUi_(
  { cat: "crumb", name: "крошка", sub: "РУБЕЦ Т", sources: [{ name: "РУБЕЦ Т" }], ratio: [1] },
  100
);
assert(noKind === 10, "no crumbKind → source РУБЕЦ Т=10, got " + noKind);

assert(ctx.capOfferSubToDisplayedRetail_(157.5, 171.2) === 157.5, "157.50 ≤ 0.92×171.20");
assert(ctx.capOfferSubToDisplayedRetail_(157.5, 156.2) === 143.7, "clamp 157.50 to 0.92×156.20=143.70, got " + ctx.capOfferSubToDisplayedRetail_(157.5, 156.2));
assert(ctx.capOfferSubToDisplayedRetail_(158, 156) === 143.52, "integer 158 vs 156 → 143.52");

const msgOk = ctx.composePpClientMessage(rit, 1, "", 171.2, 157.5, "RAW26");
assert(/171\.20/.test(msgOk), "message shows 171.20 retail");
assert(/157\.50/.test(msgOk), "message shows 157.50 sub");
assert(!/\b156\b/.test(msgOk), "message must not show 156");
assert(!/\b158\b/.test(msgOk), "message must not show 158");

const msgClamp = ctx.composePpClientMessage(rit, 1, "", 156.2, 157.5, "RAW26");
assert(/143\.70/.test(msgClamp), "if R=156.20, displayed sub ≤ 143.70");
assert(!/157\.50/.test(msgClamp), "must not keep 157.50 above 0.92×156.20");

const legacyKeep = ctx.composePpClientMessage(rit, 1, "", 171.2, 195, "LEGACY");
assert(/195/.test(legacyKeep), "LEGACY stated not 92%-capped");

assert(ctx.ppSheetPrice_({ statedCost: 157.5, factCost: 157.5, calcFactCost: 161.18 }) === 157.5, "ppSheetPrice ignores 161.18");
assert(ctx.raw26ApiFactPrice_({ factCost: 157.5, clientPrice: 161.18, calcFactCost: 161.18 }) === 157.5, "API fact wins over stale clientPrice");
assert(ctx.ppOfferClientPrice_("RAW26", 157.5, 157.5, false) === 157.5, "offer uses fact 157.50");

const rita = { nick: "РИТА", label: "РИТА", sheet: "ПП", subId: "24", scheme: "RAW26", factCost: 157.5, calcFactCost: 161.18 };
const kafa = { nick: "kafetafreya", label: "kafetafreya", sheet: "ПП", subId: "24", scheme: "RAW26", factCost: 200 };
assert(wCtx.subscriptionMatch_(rita, wCtx.normalizeMatchKey_("РИТА"), "ПП", "") === true, "match РИТА by nick");
assert(wCtx.subscriptionMatch_(rita, wCtx.normalizeMatchKey_("rit_murr"), "ПП", "24") === false, "rit_murr+subId does not hit РИТА until rekey/label");
assert(wCtx.subscriptionMatch_(kafa, wCtx.normalizeMatchKey_("rit_murr"), "ПП", "24") === false, "subId 24 alone must not steal kafetafreya");
assert(wCtx.subscriptionMatch_(rita, wCtx.normalizeMatchKey_("РИТА"), "ПП", "24") === true, "РИТА+subId 24 ok");
wCtx.sanitizeRaw26CalcFactCost_(rita);
assert(rita.calcFactCost === 157.5, "sanitize 161.18 → 157.50, got " + rita.calcFactCost);

const rekey = { nick: "rit_murr", label: "РИТА", sheet: "ПП", subId: "24" };
assert(wCtx.subscriptionMatch_(rekey, wCtx.normalizeMatchKey_("rit_murr"), "ПП", "") === true, "rekeyed nick rit_murr");
assert(wCtx.subscriptionMatch_(rekey, wCtx.normalizeMatchKey_("РИТА"), "ПП", "") === true, "label РИТА still matches");

console.log("ok rit_murr retail/cap align: R=171.20 sub=157.50; 156/158/161.18 explained");
