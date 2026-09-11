#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/**
 * Contract after STATS_AUDIT_AFTER_252:
 * A1 expected PP revenue uses collectPpActualOut_ (not empty revenueBySource.pp)
 * A2 scheme from PP sheet wishes [SCHEME:RAW26], not calendar note
 * A3 recover/packages from month-level PP basket, not first-slot half
 * A4 export fields: onlyPast/clean/recover/staff/split
 * Expected applies same cutter-split + staff as month.
 */
const PP_RAW26_RECOVER_100_ = 3.90;
const PP_RAW26_RECOVER_PIECE_ = 0.50;
const PP_LEGACY_FIXED_ = 11;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function normalizePpScheme_(s) {
  const u = String(s || "").trim().toUpperCase();
  if (u === "RAW26" || u === "RAW" || u === "NEW" || u === "V2") return "RAW26";
  if (u === "LEGACY" || u === "OLD" || u === "V1") return "LEGACY";
  return "";
}

function parsePpSchemeFromWishes_(wishes) {
  const m = String(wishes || "").match(/\[SCHEME:([^\]]+)\]/i);
  if (!m) return "";
  return normalizePpScheme_(m[1]);
}

function resolvePpScheme_(opt) {
  opt = opt || {};
  const fromIn = normalizePpScheme_(opt.scheme);
  if (fromIn) return fromIn;
  const fromW = parsePpSchemeFromWishes_(opt.wishes);
  if (fromW) return fromW;
  if (opt.forNew) return "RAW26";
  return "LEGACY";
}

function resolvePpSchemeForStats_(ck, calendarScheme, ppByKey) {
  const ent = (ppByKey && ck) ? ppByKey[ck] : null;
  if (ent) {
    const sch = resolvePpScheme_({
      scheme: ent.scheme,
      wishes: ent.wishes || "",
      forNew: false
    });
    if (sch) return sch;
  }
  return calendarScheme || "LEGACY";
}

function monthBasketForPpStats_(calendarBasket, sheetEnt) {
  if (sheetEnt && sheetEnt.basket && sheetEnt.basket.length) return sheetEnt.basket;
  return calendarBasket || [];
}

function recoverBynFromPpLines_(lines) {
  let sum = 0;
  for (let i = 0; i < (lines || []).length; i++) {
    const L = lines[i] || {};
    const val = Number(L.val != null ? L.val : L.value) || 0;
    if (val <= 0) continue;
    let piece = !!L.piece;
    const cat = String(L.cat || "").toLowerCase();
    if (cat === "chew" || cat === "chews" || cat === "powder") piece = true;
    if (piece) sum += PP_RAW26_RECOVER_PIECE_ * val;
    else sum += PP_RAW26_RECOVER_100_ * (val / 100);
  }
  return Math.round(sum * 100) / 100;
}

function collectPpActualOut_(ppStats, monthCal) {
  const out = { actual: 0, clientsCounted: 0 };
  const byKey = (ppStats && ppStats.byKey) || {};
  const priceByKey = (monthCal && monthCal.ppPriceByKey) || {};
  const delivered = (monthCal && monthCal.ppDeliveredKeys) || {};
  for (const ck of Object.keys(delivered)) {
    const p = Number(priceByKey[ck]) || 0;
    const fact = byKey[ck] ? Number(byKey[ck].fact) || 0 : 0;
    const amt = p > 0 ? p : fact;
    if (!(amt > 0)) continue;
    out.actual += amt;
    out.clientsCounted++;
  }
  out.actual = Math.round(out.actual * 100) / 100;
  return out;
}

function applyStatsCutterRecoverSplit_(month, cutterOn) {
  month = month || {};
  const recover = Math.round((Number(month.ppRecoverCost != null ? month.ppRecoverCost : month.ppLightCost) || 0) * 100) / 100;
  month.ppRecoverCost = recover;
  month.ppRecoverInClean = 0;
  month.cutterEnabled = !!cutterOn;
  if (!cutterOn && recover > 0) {
    if (!month.costBySource) month.costBySource = {};
    const ppCost = Number(month.costBySource.pp) || 0;
    let nextPp = Math.round((ppCost - recover) * 100) / 100;
    if (nextPp < 0) nextPp = 0;
    month.costBySource.pp = nextPp;
    month.costActual = Math.round(((Number(month.costActual) || 0) - recover) * 100) / 100;
    if (month.costActual < 0) month.costActual = 0;
    month.ppRecoverInClean = recover;
  }
  return month;
}

function handleGetExpectedProfit_(cal, ppStats, staffCost, cutterOn) {
  const ppOut = collectPpActualOut_(ppStats, cal);
  const retail = Number(cal.retailRevenue) || 0;
  const partner = Number(cal.partnerRevenue) || 0;
  const stalePpRev = Number(cal.revenueBySource && cal.revenueBySource.pp) || 0;
  const ppRev = Number(ppOut.actual) || 0;
  const revenue = Math.round((ppRev + retail + partner) * 100) / 100;
  applyStatsCutterRecoverSplit_(cal, cutterOn);
  const cost = Math.round(((Number(cal.costActual) || 0) + staffCost) * 100) / 100;
  return {
    stalePpRev: stalePpRev,
    ppRevenue: ppRev,
    revenue: revenue,
    cost: cost,
    clean: Math.round((revenue - cost) * 100) / 100,
    recover: Number(cal.ppRecoverCost) || 0,
    recoverInClean: Number(cal.ppRecoverInClean) || 0
  };
}

function exportHeaderLines_(fact) {
  return [
    "# onlyPast\t" + (fact.onlyPast ? "1" : "0"),
    "# clean\t" + fact.clean,
    "# recover\t" + fact.recover,
    "# recoverInClean\t" + fact.recoverInClean,
    "# staffCost\t" + fact.staffCost,
    "# cutterEnabled\t" + (fact.cutterEnabled ? "1" : "0"),
    "# split\t" + (fact.cutterEnabled ? "recover_in_cost" : "recover_in_clean")
  ].join("\n");
}

function monthsInIsoRange_(fromIso, toIso) {
  const out = [];
  let a = String(fromIso || "").slice(0, 7);
  let b = String(toIso || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(a)) return out;
  if (!/^\d{4}-\d{2}$/.test(b)) b = a;
  if (a > b) { const t = a; a = b; b = t; }
  let y = Number(a.slice(0, 4));
  let m = Number(a.slice(5, 7));
  const ye = Number(b.slice(0, 4));
  const me = Number(b.slice(5, 7));
  while (y < ye || (y === ye && m <= me)) {
    out.push(y + "-" + (m < 10 ? "0" : "") + m);
    m++;
    if (m > 12) { m = 1; y++; }
    if (out.length > 24) break;
  }
  return out;
}

const monthBasket = [
  { cat: "dressura", name: "ЛЕГКОЕ", val: 400 },
  { cat: "dressura", name: "РУБЕЦ", val: 150 },
  { cat: "chew", name: "УХО", val: 4, piece: true }
];
const slot1Half = [
  { cat: "dressura", name: "ЛЕГКОЕ", val: 200 },
  { cat: "dressura", name: "РУБЕЦ", val: 75 },
  { cat: "chew", name: "УХО", val: 2, piece: true }
];

const recoverMonth = recoverBynFromPpLines_(monthBasket);
const recoverHalf = recoverBynFromPpLines_(slot1Half);
assert(recoverMonth === 23.45, "month recover 23.45, got " + recoverMonth);
assert(recoverHalf === 11.73, "half recover 11.73, got " + recoverHalf);
assert(recoverMonth > recoverHalf, "month recover > first-slot half");

const calNoteScheme = resolvePpScheme_({ wishes: "доставка с 10", forNew: false });
assert(calNoteScheme === "LEGACY", "calendar note without tag → LEGACY");
const sheetScheme = resolvePpSchemeForStats_("ALINA", "LEGACY", {
  ALINA: { wishes: "ок [SCHEME:RAW26]", scheme: "RAW26" }
});
assert(sheetScheme === "RAW26", "sheet wishes RAW26 wins over calendar LEGACY");
const noSheet = resolvePpSchemeForStats_("BOB", "LEGACY", {});
assert(noSheet === "LEGACY", "no sheet → calendar fallback");

const usedBasket = monthBasketForPpStats_(slot1Half, { basket: monthBasket });
assert(usedBasket === monthBasket, "prefer sheet month basket over slot half");
const mergedFallback = monthBasketForPpStats_(slot1Half, { basket: [] });
assert(mergedFallback === slot1Half, "no sheet basket → calendar");

const cal = {
  revenueBySource: { pp: 0, retail: 80, partner: 0 },
  retailRevenue: 80,
  partnerRevenue: 0,
  costActual: 200 + recoverMonth,
  costBySource: { pp: 120 + recoverMonth, retail: 80 },
  ppRecoverCost: recoverMonth,
  ppLightCost: recoverMonth,
  ppPriceByKey: { ALINA: 120 },
  ppDeliveredKeys: { ALINA: true }
};
const ppStats = { byKey: { ALINA: { fact: 120, wishes: "[SCHEME:RAW26]" } } };

const staleRev = Number(cal.revenueBySource.pp) || 0;
assert(staleRev === 0, "bug baseline: revenueBySource.pp is 0");

const expectedOff = handleGetExpectedProfit_(Object.assign({}, cal, {
  costActual: 200 + recoverMonth,
  costBySource: { pp: 120 + recoverMonth, retail: 80 }
}), ppStats, 0, false);
assert(expectedOff.ppRevenue === 120, "expected PP from collectPpActualOut_ = 120");
assert(expectedOff.revenue === 200, "expected revenue = 120+80");
assert(expectedOff.recoverInClean === recoverMonth, "OFF: recover in clean");
assert(expectedOff.cost === 200, "OFF: cost excludes recover and staff");
assert(expectedOff.clean === 0, "OFF clean = 200-200");

const expectedOn = handleGetExpectedProfit_(Object.assign({}, cal, {
  costActual: 200 + recoverMonth,
  costBySource: { pp: 120 + recoverMonth, retail: 80 }
}), ppStats, 900, true);
assert(expectedOn.ppRevenue === 120, "ON still counts PP");
assert(expectedOn.recoverInClean === 0, "ON: recover stays in cost");
assert(expectedOn.cost === Math.round((200 + recoverMonth + 900) * 100) / 100, "ON: goods+recover+staff");
assert(expectedOn.clean === Math.round((200 - expectedOn.cost) * 100) / 100, "ON clean");

const tsv = exportHeaderLines_({
  onlyPast: true,
  clean: expectedOff.clean,
  recover: recoverMonth,
  recoverInClean: recoverMonth,
  staffCost: 0,
  cutterEnabled: false
});
assert(tsv.indexOf("# onlyPast\t1") >= 0, "export onlyPast");
assert(tsv.indexOf("# clean\t") >= 0, "export clean");
assert(tsv.indexOf("# recover\t") >= 0, "export recover");
assert(tsv.indexOf("# staffCost\t0") >= 0, "export staff");
assert(tsv.indexOf("# split\trecover_in_clean") >= 0, "export split");

assert(JSON.stringify(monthsInIsoRange_("2026-08-01", "2026-09-15")) === JSON.stringify(["2026-08", "2026-09"]), "range months");

const lightLegacy = resolvePpSchemeForStats_("OLD", "LEGACY", { OLD: { wishes: "" } });
assert(lightLegacy === "LEGACY", "empty wishes → LEGACY (+11 light, not 3.90/100g)");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gs = fs.readFileSync(path.join(__dirname, "../Code.gs"), "utf8");
const ui = fs.readFileSync(path.join(__dirname, "../boinya-c/app.main.js"), "utf8");
assert(gs.indexOf("function resolvePpSchemeForStats_") >= 0, "Code.gs has resolvePpSchemeForStats_");
assert(gs.indexOf("function monthBasketForPpStats_") >= 0, "Code.gs has monthBasketForPpStats_");
assert(gs.indexOf("collectPpActualOut_(ss, fromIso.slice(0, 7), pp, stats") >= 0, "expected uses collectPpActualOut_");
assert(gs.indexOf("revenueBySource.pp) || 0") < 0 || gs.indexOf("var ppRev = Number(ppOut.actual)") >= 0, "expected ppRev from ppOut");
assert(gs.indexOf("# recoverInClean\\t") >= 0 || gs.indexOf("# recoverInClean\t") >= 0, "export recoverInClean");
assert(gs.indexOf("свет 11р/чел") < 0, "stale expected note removed");
assert(ui.indexOf("Пакеты + фракции") >= 0, "UI packages line");
assert(ui.indexOf("Затраты БП перешедших") >= 0, "UI converted-only BP cost label");
assert(ui.indexOf("statsBpFunnelCard") >= 0, "UI BP funnel");
assert(ui.indexOf("enabledForMonth") >= 0, "UI cutter month vs toggle");
assert(ui.indexOf("exportStatsMonth") >= 0, "UI export wired");
assert(gs.indexOf("function ppClientPaysNowForStats_") >= 0, "N=2 pays-now helper");

console.log("OK stats-expected-pp");
console.log(JSON.stringify({
  recoverMonth,
  recoverHalf,
  sheetScheme,
  expectedOff: { ppRevenue: expectedOff.ppRevenue, revenue: expectedOff.revenue, cost: expectedOff.cost, clean: expectedOff.clean, recoverInClean: expectedOff.recoverInClean },
  expectedOn: { cost: expectedOn.cost, clean: expectedOn.clean, staffCost: 900 },
  stalePpWouldBe: staleRev
}, null, 2));
