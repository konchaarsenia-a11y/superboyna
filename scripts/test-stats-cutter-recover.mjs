#!/usr/bin/env node
/**
 * Contract: Нарезчик OFF → recover leaves PP costs and raises clean.
 * Нарезчик ON → recover stays in costs. Flat cutter staffCost is NOT added (canon 2026-09-12).
 * Mirrors applyStatsCutterRecoverSplit_ + handleGetStats costActual in Code.gs.
 */
const STATS_CUTTER_PRESET_ID_ = "cutter";
const STATS_CUTTER_PRESET_NAME_ = "Нарезчик";

function isStatsCutterActiveForMonth_(staffMonth) {
  const list = (staffMonth && staffMonth.staff) || [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s) continue;
    if (s.id === STATS_CUTTER_PRESET_ID_) return true;
    if (String(s.name || "").toLowerCase() === STATS_CUTTER_PRESET_NAME_.toLowerCase()) return true;
  }
  return false;
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

function monthFact(recover) {
  return {
    costActual: 200 + recover,
    costBySource: { pp: 120 + recover, retail: 80 },
    ppLightCost: recover,
    ppRecoverCost: recover
  };
}

function totals(month, staffCost) {
  const cost = Math.round(((Number(month.costActual) || 0) + staffCost) * 100) / 100;
  const turnover = 500;
  return {
    cost,
    clean: Math.round((turnover - cost) * 100) / 100,
    ppCost: Number(month.costBySource.pp) || 0,
    recover: Number(month.ppRecoverCost) || 0,
    recoverInClean: Number(month.ppRecoverInClean) || 0
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const recover = 31.23;
const staffOn = { staff: [{ id: "cutter", name: "Нарезчик", salary: 900 }], cost: 900, count: 1 };
const staffOff = { staff: [], cost: 0, count: 0 };

assert(isStatsCutterActiveForMonth_(staffOn) === true, "cutter ON detected");
assert(isStatsCutterActiveForMonth_(staffOff) === false, "empty staff → cutter OFF");
assert(isStatsCutterActiveForMonth_({ staff: [{ id: "other", name: "Курьер", salary: 400 }] }) === false, "other staff ≠ cutter");

const onMonth = applyStatsCutterRecoverSplit_(monthFact(recover), true);
const on = totals(onMonth, 0);
assert(onMonth.ppRecoverInClean === 0, "ON: recover stays in costs");
assert(on.ppCost === Math.round((120 + recover) * 100) / 100, "ON: costBySource.pp keeps recover");
assert(on.cost === Math.round((200 + recover) * 100) / 100, "ON: costActual = goods+recover, no flat ЗП");
assert(on.clean === Math.round((500 - on.cost) * 100) / 100, "ON: clean = turnover − cost");

const offMonth = applyStatsCutterRecoverSplit_(monthFact(recover), false);
const off = totals(offMonth, 0);
assert(off.recoverInClean === recover, "OFF: recover moved to clean");
assert(off.ppCost === 120, "OFF: costBySource.pp excludes recover");
assert(off.cost === 200, "OFF: costActual excludes recover and staff");
assert(off.clean === Math.round((500 - 200) * 100) / 100, "OFF: clean higher");
assert(Math.round((off.clean - on.clean) * 100) / 100 === recover, "OFF vs ON: clean up by recover only (no +900)");

const legacy = applyStatsCutterRecoverSplit_({
  costActual: 80,
  costBySource: { pp: 80 },
  ppLightCost: 11,
  ppRecoverCost: 11
}, false);
assert(legacy.ppRecoverInClean === 11, "LEGACY +11 light is recover analogue");
assert(legacy.costBySource.pp === 69, "LEGACY: 80−11");

console.log("OK stats-cutter-recover");
console.log(JSON.stringify({
  recover,
  on: { cost: on.cost, clean: on.clean, ppCost: on.ppCost, recoverInClean: on.recoverInClean, staffCost: 0 },
  off: { cost: off.cost, clean: off.clean, ppCost: off.ppCost, recoverInClean: off.recoverInClean, staffCost: 0 },
  cleanDeltaOffMinusOn: Math.round((off.clean - on.clean) * 100) / 100
}, null, 2));
