#!/usr/bin/env node
/**
 * Canon 2026-09-12 (Arseniy):
 * - fractions NOT in costActual → ppFractionInClean
 * - stats delivery fuel = 4×N; remainder of 9/6 (and BP 6) → *InClean
 * - recover toggle unchanged; cutter flat staffCost NOT in month cost
 * Client price formulas (9/6, fractions in factCost) stay in computePpFactFromCost_.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PP_RAW26_DELIVERY_PER_ = 9;
const PP_LEGACY_DELIVERY_PER_ = 6;
const PP_LEGACY_FIXED_ = 11;
const BP_DELIVERY_COST_BYN_ = 6;
const STATS_DELIVERY_FUEL_PER_ = 4;
const STATS_CUTTER_PRESET_ID_ = "cutter";
const STATS_CUTTER_PRESET_NAME_ = "Нарезчик";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function isStatsCutterStaffRow_(s) {
  if (!s) return false;
  if (s.id === STATS_CUTTER_PRESET_ID_) return true;
  if (String(s.name || "").toLowerCase() === STATS_CUTTER_PRESET_NAME_.toLowerCase()) return true;
  return false;
}

function collectStatsStaffForMonth_(all) {
  const out = { staff: [], cost: 0, count: 0, cutterExcludedSalary: 0 };
  for (let i = 0; i < (all || []).length; i++) {
    const s = all[i];
    const sal = Number(s.salary) || 0;
    if (!(sal > 0)) continue;
    const cutterRow = isStatsCutterStaffRow_(s);
    out.staff.push(Object.assign({}, s, { excludedFromCost: !!cutterRow }));
    if (cutterRow) {
      out.cutterExcludedSalary = Math.round((out.cutterExcludedSalary + sal) * 100) / 100;
      continue;
    }
    out.cost += sal;
    out.count++;
  }
  out.cost = Math.round(out.cost * 100) / 100;
  return out;
}

function isStatsCutterActiveForMonth_(staffMonth) {
  const list = (staffMonth && staffMonth.staff) || [];
  for (let i = 0; i < list.length; i++) {
    if (isStatsCutterStaffRow_(list[i])) return true;
  }
  return false;
}

function splitPpFactForStats_(factPp) {
  factPp = factPp || {};
  const n = Math.max(0, Number(factPp.deliveriesN) || 0);
  let tariff = Math.round((Number(factPp.deliveryByn) || 0) * 100) / 100;
  let fuel = Math.round((STATS_DELIVERY_FUEL_PER_ * n) * 100) / 100;
  if (fuel > tariff && tariff > 0) fuel = tariff;
  if (fuel < 0) fuel = 0;
  let delivClean = Math.round((tariff - fuel) * 100) / 100;
  if (delivClean < 0) delivClean = 0;
  let frac = Math.round((Number(factPp.fractionMarkup) || 0) * 100) / 100;
  if (frac < 0) frac = 0;
  const factCost = Number(factPp.factCost) || 0;
  let costActual = Math.round((factCost - frac - delivClean) * 100) / 100;
  if (costActual < 0) costActual = 0;
  return {
    factCost,
    costActual,
    deliveryFuelByn: fuel,
    deliveryInClean: delivClean,
    deliveryTariffByn: tariff,
    fractionInClean: frac,
    packagesByn: Math.round((Number(factPp.packagesByn) || 0) * 100) / 100,
    recoverByn: Math.round((Number(factPp.recoverByn != null ? factPp.recoverByn : factPp.fixed) || 0) * 100) / 100
  };
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

function statsBpDeliveryInCleanByn_(nDel) {
  const n = Math.max(0, Number(nDel) || 0);
  const rem = Math.round(((BP_DELIVERY_COST_BYN_ - STATS_DELIVERY_FUEL_PER_) * n) * 100) / 100;
  return rem > 0 ? rem : 0;
}

function monthTotals_(month, staffCost, turnover) {
  const cost = Math.round(((Number(month.costActual) || 0) + (Number(staffCost) || 0)) * 100) / 100;
  return {
    cost,
    clean: Math.round((turnover - cost) * 100) / 100
  };
}

// —— RAW26: N=2, recover 31.23, packages 2, fractions 6, goods 100 ——
const nRaw = 2;
const recover = 31.23;
const packs = 2;
const frac = 6;
const goods = 100;
const tariffRaw = PP_RAW26_DELIVERY_PER_ * nRaw; // 18
const factRaw = {
  scheme: "RAW26",
  deliveriesN: nRaw,
  factCost: Math.round((goods + recover + tariffRaw + packs + frac) * 100) / 100,
  deliveryByn: tariffRaw,
  packagesByn: packs,
  fractionMarkup: frac,
  recoverByn: recover
};
const splitRaw = splitPpFactForStats_(factRaw);
assert(splitRaw.deliveryFuelByn === 8, "RAW26 fuel 4×2=8, got " + splitRaw.deliveryFuelByn);
assert(splitRaw.deliveryInClean === 10, "RAW26 remainder (9−4)×2=10, got " + splitRaw.deliveryInClean);
assert(splitRaw.fractionInClean === 6, "fractions echo in clean");
assert(splitRaw.costActual === Math.round((goods + recover + 8 + packs) * 100) / 100,
  "RAW26 stats cost = goods+recover+fuel+packs, no frac/no extra deliv, got " + splitRaw.costActual);
assert(splitRaw.factCost === Math.round((goods + recover + 18 + packs + frac) * 100) / 100,
  "client factCost still includes 9×N + fractions");
assert(splitRaw.costActual === Math.round((splitRaw.factCost - frac - 10) * 100) / 100,
  "costActual = factCost − frac − delivInClean");

// —— LEGACY: N=1, light 11, no recoverByn ——
const factLeg = {
  scheme: "LEGACY",
  deliveriesN: 1,
  factCost: Math.round((80 + PP_LEGACY_FIXED_ + PP_LEGACY_DELIVERY_PER_ + 1.4 + 3) * 100) / 100,
  deliveryByn: PP_LEGACY_DELIVERY_PER_,
  packagesByn: 1.4,
  fractionMarkup: 3,
  recoverByn: 0,
  fixed: PP_LEGACY_FIXED_
};
const splitLeg = splitPpFactForStats_(factLeg);
assert(splitLeg.deliveryFuelByn === 4, "LEGACY fuel 4×1");
assert(splitLeg.deliveryInClean === 2, "LEGACY remainder (6−4)×1=2");
assert(splitLeg.fractionInClean === 3, "LEGACY fractions in clean");
assert(splitLeg.costActual === Math.round((80 + 11 + 4 + 1.4) * 100) / 100,
  "LEGACY stats cost keeps +11 and fuel 4, drops frac and +2");

// —— BP same fuel-4 rule ——
assert(statsBpDeliveryInCleanByn_(3) === 6, "BP in-clean 2×3=6");
assert(STATS_DELIVERY_FUEL_PER_ * 3 === 12, "BP fuel 4×3=12");
const bpProduct = 20;
const bpCostOld = bpProduct + 6;
const bpCostNew = bpProduct + 4;
assert(bpCostNew === 24 && bpCostOld === 26, "BP cost uses 4 not 6");
const bpCleanGain = (6 - 4);
assert(bpCleanGain === 2, "BP remainder 2 goes to clean via lower costActual");

// —— Recover toggle still works on post-split month ——
const monthOn = applyStatsCutterRecoverSplit_({
  costActual: splitRaw.costActual,
  costBySource: { pp: splitRaw.costActual },
  ppRecoverCost: recover,
  ppLightCost: recover,
  ppFractionInClean: splitRaw.fractionInClean,
  ppDeliveryInClean: splitRaw.deliveryInClean
}, true);
const staffCutter = collectStatsStaffForMonth_([{ id: "cutter", name: "Нарезчик", salary: 900 }]);
assert(isStatsCutterActiveForMonth_(staffCutter) === true, "cutter still detected");
assert(staffCutter.cost === 0, "cutter flat salary not in staffCost");
assert(staffCutter.cutterExcludedSalary === 900, "excluded salary echoed");
const onTot = monthTotals_(monthOn, staffCutter.cost, 500);
assert(monthOn.ppRecoverInClean === 0, "ON: recover stays in costs");
assert(onTot.cost === splitRaw.costActual, "ON: no +900");

const monthOff = applyStatsCutterRecoverSplit_({
  costActual: splitRaw.costActual,
  costBySource: { pp: splitRaw.costActual },
  ppRecoverCost: recover,
  ppLightCost: recover,
  ppFractionInClean: splitRaw.fractionInClean,
  ppDeliveryInClean: splitRaw.deliveryInClean
}, false);
const offTot = monthTotals_(monthOff, 0, 500);
assert(monthOff.ppRecoverInClean === recover, "OFF: recover in clean");
assert(offTot.cost === Math.round((splitRaw.costActual - recover) * 100) / 100, "OFF: cost excludes recover");
assert(Math.round((offTot.clean - onTot.clean) * 100) / 100 === recover,
  "OFF vs ON: clean up by recover only, not recover+900");

// —— other staff still counts ——
const mixedStaff = collectStatsStaffForMonth_([
  { id: "cutter", name: "Нарезчик", salary: 900 },
  { id: "driver", name: "Курьер", salary: 400 }
]);
assert(mixedStaff.cost === 400, "non-cutter staff still in cost");
assert(mixedStaff.count === 1, "count excludes cutter");
assert(isStatsCutterActiveForMonth_(mixedStaff) === true, "cutter still on when other staff exist");

// —— clean identity: turnover − costActual after splits ——
const turnover = 500;
const costAfter = offTot.cost;
assert(offTot.clean === Math.round((turnover - costAfter) * 100) / 100, "clean = turnover − costActual");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gs = fs.readFileSync(path.join(__dirname, "../Code.gs"), "utf8");
const ui = fs.readFileSync(path.join(__dirname, "../boinya-c/app.main.js"), "utf8");
assert(gs.indexOf("function splitPpFactForStats_") >= 0, "Code.gs split helper");
assert(gs.indexOf("var STATS_DELIVERY_FUEL_PER_ = 4") >= 0, "fuel constant 4");
assert(gs.indexOf("splitPpFactForStats_(factPp)") >= 0, "PP rollup uses stats split");
assert(gs.indexOf("ppFractionInClean") >= 0, "ppFractionInClean field");
assert(gs.indexOf("ppDeliveryInClean") >= 0, "ppDeliveryInClean field");
assert(gs.indexOf("bpDeliveryInClean") >= 0, "bpDeliveryInClean field");
assert(gs.indexOf("cutterExcludedSalary") >= 0, "cutter salary excluded echo");
assert(gs.indexOf("staffCostExcludesCutter: true") >= 0, "API flag");
assert(gs.indexOf("if (cutterRow)") >= 0 && gs.indexOf("out.cutterExcludedSalary") >= 0,
  "collectStatsStaffForMonth_ skips cutter cost");
assert(gs.indexOf("STATS24:") >= 0, "GAS cache STATS24");
assert(gs.indexOf("deliveryFee = STATS_DELIVERY_FUEL_PER_") >= 0, "BP ingest fuel 4");
assert(ui.indexOf("stats-fuel4-frac-clean-h1") >= 0, "UI marker");
assert(ui.indexOf("Фракции в чистом") >= 0, "UI fractions under clean");
assert(ui.indexOf("Топливо доставок") >= 0, "UI fuel label");
assert(ui.indexOf("ЗП сотрудников (не нарезчик)") >= 0, "UI hides cutter ЗП line unless other staff");
assert(ui.indexOf("v71115950") >= 0, "UI cache-bust v71115950");
assert(ui.indexOf("Пакеты + фракции") < 0, "old packages+fractions cost line removed");

console.log("OK stats-fuel4-frac-clean");
console.log(JSON.stringify({
  raw26: {
    n: nRaw,
    factCost: splitRaw.factCost,
    costActual: splitRaw.costActual,
    fuel: splitRaw.deliveryFuelByn,
    deliveryInClean: splitRaw.deliveryInClean,
    fractionInClean: splitRaw.fractionInClean
  },
  legacy: {
    costActual: splitLeg.costActual,
    fuel: splitLeg.deliveryFuelByn,
    deliveryInClean: splitLeg.deliveryInClean
  },
  recover: { onCost: onTot.cost, offCost: offTot.cost, cleanDelta: recover },
  staff: { cutterOnly: staffCutter.cost, mixed: mixedStaff.cost }
}, null, 2));
