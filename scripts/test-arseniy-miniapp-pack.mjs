#!/usr/bin/env node
/**
 * Arseniy miniapp pack: crumbs accordion, notes once, tap debounce,
 * statedCost stable, PP packages +1.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ui = fs.readFileSync(path.join(root, "boinya-c/app.main.js"), "utf8");
const html = fs.readFileSync(path.join(root, "boinya-c/app.html"), "utf8");
const idx = fs.readFileSync(path.join(root, "boinya-c/index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
const gs = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
const tz = fs.readFileSync(path.join(root, "TZ.md"), "utf8");
const subPrice = fs.readFileSync(path.join(root, "artifacts/product-costs/SUBSCRIPTION-PRICE.md"), "utf8");

assert(html.includes("openProductSelector('crumb')"), "order crumbs = category accordion");
assert(html.includes("openPriceProductSelector('crumb')"), "price crumbs = category accordion");
assert(html.includes("openSubDetailProductSelector('crumb')"), "PP crumbs = category accordion");
assert(html.includes("btn-brown") && html.includes("onclick=\"openProductSelector('crumb')\""), "crumbs chip uses btn-brown");
assert(html.includes('id="selectorCard"') && html.includes('id="crumbBuilderHost"'), "crumb host lives inside selectorCard");
assert(html.includes('id="priceCrumbHost"') && html.includes('id="subCrumbHost"'), "price/sub crumb hosts in same selector cards");
assert(!html.includes("crumbBuilderCard"), "no separate #crumbBuilderCard");

assert(ui.includes("showCrumbInSelector_") && ui.includes('card: "selectorCard"'), "JS paints crumbs into #selectorCard");
assert(!/BYN\/100г/.test(ui.match(/function renderCrumbBuilder_[\s\S]*?\n    \}/)[0]), "kind buttons have no prices");
assert(ui.includes('label: "мясные"') && ui.includes('label: "гипоаллергенные"'), "kind labels only");
assert(ui.includes('(on ? "btn-green" : k.cls)'), "active kind stays green");
assert(/displayMain = isCrumb\s*\n\s*\? "крошка"/.test(ui) || ui.includes('? "крошка"'), "basket title is «крошка»");
assert(ui.includes('var title = "крошка" + (joined ? (" · " + joined + ratioBit) : "")'), "view lines = крошка + sources");

assert(ui.includes("function loadOrderNotesForNewOrder_"), "new-order notes filter");
assert(ui.includes("function permanentNotesRawOnly_"), "drop once notes for next order");
assert(ui.includes("loadOrderNotesForNewOrder_(m.note)"), "suggest applies permanent-only");
assert(ui.includes("loadOrderNotesForNewOrder_([res.wishes, res.note]"), "PP→order drops once notes");
assert(ui.includes("function applyCrumbBasketNames_") && ui.includes('row.name = "крошка"'), "stored crumb title is «крошка»");
assert(!/main: crumbKindTitle_\(kind\)/.test(ui), "add crumb no longer stores kind title as main");
assert(ui.includes('clearNote: noteCleared ? "1" : ""'), "save sends clearNote when empty");
assert(ui.includes("onclick=\"removeOrderNote(") && !ui.includes("orderNotes.length > 1 ? '<button type=\"button\" class=\"seg-btn\" onclick=\"removeOrderNote("), "delete ✕ always shown");

assert(ui.includes("var TAP_DEBOUNCE_MS = 140"), "tap debounce 140ms");
assert(ui.includes("var RESCUE_WAIT_MS = 90"), "click-rescue delayed 90ms");
assert(ui.includes("var HAPTIC_GAP_MS = 80"), "haptic gap 80ms");
assert(ui.includes("(now - _packBumpAt) < 140"), "pack bump extra debounce");

assert(ui.includes("var statedPrice") && ui.includes("res.statedCost"), "PP order price from stated");
assert(/function syncSubDetailStatedFromFact_[\s\S]{0,180}return factCost/.test(ui), "stated not synced from fact");
assert(/if \(!statedSave && factSave\)/.test(ui), "save PP seeds stated only if empty");
assert(!/RAW26 && !_subDetailStatedTouched && factSave/.test(ui), "save PP no longer overwrites stated from fact");
assert(!/fact\.statedCost = fact\.factCost/.test(worker), "worker calc does not overwrite stated");
assert(!/fact\.statedCost = fact\.factCost/.test(gs), "GAS calc does not overwrite stated");
assert(worker.includes("statedCost: statedCost"), "getPpFactCost D1 returns statedCost");
assert(gs.includes("out.statedCost = out.factCost"), "GAS getPpFactCost echoes sheet as stated");

assert(/v71115978/.test(html) && /v71115978/.test(ui) && /71115978/.test(idx), "Pages v71115978");
assert(gs.includes("function crumbKindRateGs_") && gs.includes("function ppLineFromBasketItemGs_"), "GAS mixer 15/17/20 helper");
assert(/arseniy-miniapp-pack-h1/.test(tz), "TZ marker");
assert(/15\/17\/20/.test(subPrice) && /крошка-миксер/i.test(subPrice), "RAW26 crumb pricing in canon");
assert(!/\/крошка\/i\.test\(name\)\) piece = true/.test(worker), "worker recover does not treat крошка as piece");
assert(!/\/крошка\/i\.test\(name\)\) piece = true/.test(gs), "GAS recover does not treat крошка as piece");
assert(worker.includes("function isGramCrumbLineD1_") && gs.includes("function isGramCrumbLineGs_"), "gram-crumb recover helpers");

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing " + name);
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
  throw new Error("unclosed " + name);
}

const wCtx = vm.createContext({ Math, Number, String, isFinite, Object, Array, JSON });
vm.runInContext(
  [
    "const PP_RAW26_RECOVER_100_D1_ = 3.9;",
    "const PP_RAW26_RECOVER_PIECE_D1_ = 0.5;",
    "function isPieceSkuNameD1_(name) { return /шт/i.test(String(name || \"\")); }",
    extractFn(worker, "isGramCrumbLineD1_"),
    extractFn(worker, "recoverBynFromPpLinesD1_"),
    extractFn(worker, "crumbKindRateD1_")
  ].join("\n"),
  wCtx
);
assert(wCtx.crumbKindRateD1_("veg") === 15 && wCtx.crumbKindRateD1_("meat") === 17 && wCtx.crumbKindRateD1_("hypo") === 20, "mixer rates 15/17/20");
const gramRec = wCtx.recoverBynFromPpLinesD1_([
  { cat: "crumb", crumbKind: "meat", name: "крошка · мясные", val: 100, piece: false }
]);
assert(gramRec === 3.9, "100g crumb recover is 3.90 not 50, got " + gramRec);
const pieceRec = wCtx.recoverBynFromPpLinesD1_([{ cat: "chew", name: "УХО Г", val: 2, piece: true }]);
assert(pieceRec === 1, "piece recover 0.50×2, got " + pieceRec);

const gCtx = vm.createContext({ Math, Number, String, isFinite, Object, Array, JSON });
vm.runInContext(
  [
    "function lookupPpCostInfoGs_() { return { unitPrice: 2.25, piece: true }; }",
    "function isPieceSkuName_(name) { return /шт/i.test(String(name || \"\")); }",
    extractFn(gs, "isGramCrumbLineGs_"),
    extractFn(gs, "crumbKindRateGs_"),
    extractFn(gs, "ppLineFromBasketItemGs_")
  ].join("\n"),
  gCtx
);
assert(gCtx.crumbKindRateGs_("veg") === 15 && gCtx.crumbKindRateGs_("meat") === 17 && gCtx.crumbKindRateGs_("hypo") === 20, "GAS mixer rates 15/17/20");
const mixLine = gCtx.ppLineFromBasketItemGs_({ cat: "crumb", crumbKind: "meat", name: "крошка", val: 100 }, {});
assert(mixLine && mixLine.piece === false && mixLine.unitPrice === 17 && mixLine.cost === 17, "GAS mixer 100g meat = 17 raw, not piece lookup, got " + JSON.stringify(mixLine));

console.log("arseniy-miniapp-pack OK");
