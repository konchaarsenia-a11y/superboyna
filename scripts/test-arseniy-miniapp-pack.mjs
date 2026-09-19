#!/usr/bin/env node
/**
 * Arseniy miniapp pack: crumbs accordion, notes once, tap debounce,
 * statedCost stable, PP packages +1.
 */
import fs from "node:fs";
import path from "node:path";
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
assert(!/id="crumbBuilderCard"[^>]*position:fixed/.test(html), "crumb card is in-flow, not overlay");
assert(/id="crumbBuilderCard"[^>]*margin-top:10px/.test(html), "crumb card sits like selectorCard");

assert(ui.includes("openProductSelector") && ui.includes('catKey === "crumb"'), "JS routes crumb to builder");
assert(!/BYN\/100г/.test(ui.match(/function renderCrumbBuilder_[\s\S]*?\n    \}/)[0]), "kind buttons have no prices");
assert(ui.includes('label: "мясные"') && ui.includes('label: "гипоаллергенные"'), "kind labels only");
assert(ui.includes("btn-green") && ui.includes("btn-orange") && ui.includes("btn-purple"), "kind chips colored");
assert(ui.includes('return src ? ("крошка · " + src) : "крошка"'), "basket title = крошка + sources");
assert(ui.includes('title = joined ? ("крошка · " + joined + ratioBit) : "крошка"'), "view lines = крошка + sources");

assert(ui.includes("function loadOrderNotesForNewOrder_"), "new-order notes filter");
assert(ui.includes("function permanentNotesRawOnly_"), "drop once notes for next order");
assert(ui.includes("loadOrderNotesForNewOrder_(m.note)"), "suggest applies permanent-only");
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

assert(/v71115976/.test(html) && /v71115976/.test(ui) && /71115976/.test(idx), "Pages v71115976");
assert(/arseniy-miniapp-pack-h1/.test(tz), "TZ marker");
assert(/15\/17\/20/.test(subPrice) && /крошка-миксер/i.test(subPrice), "RAW26 crumb pricing in canon");

console.log("arseniy-miniapp-pack OK");
