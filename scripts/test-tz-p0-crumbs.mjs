#!/usr/bin/env node
/**
 * TZ 2026-09-18: alias аортаа, крошки expand, полоски=1, varka cabinet no extra address,
 * ghost pay-ask not auto-created, noCut stamp.
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
const uiSrc = fs.readFileSync(path.join(root, "boinya-c/app.main.js"), "utf8");
const htmlSrc = fs.readFileSync(path.join(root, "boinya-c/app.html"), "utf8");
const varkaSrc = fs.readFileSync(path.join(root, "varka/app.html"), "utf8");
const gsSrc = fs.readFileSync(path.join(root, "Code.gs"), "utf8");

const wCtx = vm.createContext({
  Math, Number, String, isFinite, Object, Array, JSON
});
vm.runInContext(
  [
    extractFn(wSrc, "catalogAliasNameD1_"),
    extractFn(wSrc, "normalizeBasketItemAliasesD1_"),
    extractFn(wSrc, "normalizeBasketAliasesD1_"),
    extractFn(wSrc, "isCrumbBasketItemD1_"),
    extractFn(wSrc, "crumbKindRateD1_"),
    extractFn(wSrc, "expandCrumbsForCuttingD1_"),
    extractFn(wSrc, "applyNoCutNoteD1_"),
    extractFn(wSrc, "buildDeferredItemFromParams_")
  ].join("\n"),
  wCtx
);

assert(wCtx.catalogAliasNameD1_("Аортаа") === "АОРТА", "alias Аортаа");
assert(wCtx.catalogAliasNameD1_("АОРТАА") === "АОРТА", "alias АОРТАА");
assert(wCtx.catalogAliasNameD1_("аортааа") === "АОРТА", "alias triple а");
assert(wCtx.catalogAliasNameD1_("ухо ГА") === "УХО Г", "alias ухо ГА");
const aliased = wCtx.normalizeBasketAliasesD1_([{ name: "Аортаа", val: 1, cat: "chew" }]);
assert(aliased[0].name === "АОРТА", "basket write alias");

assert(wCtx.crumbKindRateD1_("veg") === 15, "crumb veg 15");
assert(wCtx.crumbKindRateD1_("meat") === 17, "crumb meat 17");
assert(wCtx.crumbKindRateD1_("hypo") === 20, "crumb hypo 20");

const expanded = wCtx.expandCrumbsForCuttingD1_([
  {
    cat: "crumb",
    crumbKind: "meat",
    name: "Крошка · мяс позиции",
    val: 100,
    sources: [{ name: "ЛЁГКОЕ", cat: "dressura" }, { name: "СЕРДЦЕ", cat: "dressura" }],
    ratio: [1, 1]
  }
]);
assert(expanded.length === 2, "cutting expands 2 sources, got " + expanded.length);
assert(!expanded.some((it) => String(it.cat) === "crumb"), "cutting has no crumb cat");
assert(expanded.every((it) => it.val === 50), "equal split 50/50");

const oneSrc = wCtx.expandCrumbsForCuttingD1_([
  { cat: "crumb", crumbKind: "veg", val: 80, sources: [{ name: "ЯБЛОКИ", cat: "veg" }], ratio: [1] }
]);
assert(oneSrc.length === 1 && oneSrc[0].name === "ЯБЛОКИ" && oneSrc[0].val === 80, "single source grams");

const noted = wCtx.applyNoCutNoteD1_("код 12", true);
assert(/\[НЕ РЕЗАТЬ\]/.test(noted) && /код 12/.test(noted), "noCut stamp");
assert(!/\[НЕ РЕЗАТЬ\]/.test(wCtx.applyNoCutNoteD1_(noted, false)), "noCut strip");

const remind = wCtx.buildDeferredItemFromParams_({ kind: "remind", client: "ПП оплата · 2026-09-18" });
assert(remind.mode === "remind", "kind→mode remind, got " + remind.mode);
assert(!/^ПП · ПП оплата/.test(remind.title), "no ПП ПП оплата title: " + remind.title);

assert(uiSrc.includes("openCrumbBuilder"), "UI crumb builder");
assert(uiSrc.includes("setPriceCompSlot"), "UI second composition price");
assert(uiSrc.includes("setSubCompSlot"), "UI second composition PP card");
assert(uiSrc.includes("без нарезки"), "UI noCut badge");
assert(!/action:\s*"saveDeferred"[\s\S]{0,80}ПП оплата/.test(uiSrc) ||
  !uiSrc.includes('client: "ПП оплата'), "ghost saveDeferred removed");
assert(!uiSrc.includes('client: "ПП оплата · "'), "no auto PP pay deferred");
assert(htmlSrc.includes("openProductSelector('crumb')"), "HTML crumbs under veggies order");
assert(htmlSrc.includes("openPriceProductSelector('crumb')"), "HTML crumbs price");
assert(htmlSrc.includes("openSubDetailProductSelector('crumb')"), "HTML crumbs sub");
assert(htmlSrc.includes('id="crumbBuilderHost"'), "crumbs host inside selectorCard");
assert(!htmlSrc.includes("crumbBuilderCard"), "no separate crumb overlay card");
assert(htmlSrc.includes("priceCompSlotRow"), "HTML price N=2 tabs");
assert(htmlSrc.includes("subCompSlotRow"), "HTML PP N=2 tabs");
assert(uiSrc.includes("timeoutMs: 35000") && uiSrc.includes("placeTransferTask"), "placeTransfer 35s");
assert(gsSrc.includes("loadCrmNudgeIndex_"), "nudge CRM index");
assert(/meta.kind === "retail" \|\| meta.segment === "Р"/.test(gsSrc), "nudge skip retail");

const goCab = extractFn(varkaSrc, "goCabinet");
assert(goCab.includes("isVarka"), "varka cabinet skips address for Varka");
assert(varkaSrc.includes('var APP_VER = "3.3.53"'), "varka APP_VER 3.3.53");

assert(uiSrc.includes('"ЛЁГКОЕ|Полоски": { per100: 10 }'), "UI полоски 10");
assert(gsSrc.includes('"ЛЁГКОЕ|Полоски": { per100: 10 }'), "GAS полоски 10");

console.log("tz-p0-crumbs OK");
