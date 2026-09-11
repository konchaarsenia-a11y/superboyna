#!/usr/bin/env node
/**
 * Locked PP N=2 accounting:
 * paid=yes / pays-now on slot 1 → full month revenue (max once) + full factCost (N=2, full basket)
 * immediately, do not wait for slot 2.
 * Slot 2 → delivery count only, no second revenue/cost.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PP_RAW26_RECOVER_100_ = 3.90;
const PP_RAW26_RECOVER_PIECE_ = 0.50;
const PP_RAW26_DELIVERY_PER_ = 9;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function ppClientPaysNowForStats_(ck, paid, monthCal) {
  const st = String(paid || "").toLowerCase();
  if (st === "no") return false;
  if (st === "yes") return true;
  const minSlot = Number((monthCal && monthCal.ppSlotByKey && monthCal.ppSlotByKey[ck]) || 0);
  if (minSlot >= 2) return false;
  return true;
}

function ppFactDeliveriesNForStats_(ck, monthCal, sheetEnt) {
  const sheetN = sheetEnt ? Number(sheetEnt.deliveriesN) || 0 : 0;
  if (sheetN >= 2) return sheetN;
  const nDel = Number((monthCal && monthCal.ppDeliveryCountByKey && monthCal.ppDeliveryCountByKey[ck]) || 0);
  return Math.max(1, nDel || 1);
}

function recoverBynFromPpLines_(lines) {
  let sum = 0;
  for (let i = 0; i < (lines || []).length; i++) {
    const L = lines[i] || {};
    const val = Number(L.val != null ? L.val : L.value) || 0;
    if (val <= 0) continue;
    let piece = !!L.piece;
    const cat = String(L.cat || "").toLowerCase();
    if (cat === "chew" || cat === "chews") piece = true;
    if (piece) sum += PP_RAW26_RECOVER_PIECE_ * val;
    else sum += PP_RAW26_RECOVER_100_ * (val / 100);
  }
  return Math.round(sum * 100) / 100;
}

function factCostRaw26_(raw, basket, n, packs) {
  const recover = recoverBynFromPpLines_(basket);
  return {
    recover,
    delivery: PP_RAW26_DELIVERY_PER_ * n,
    factCost: Math.round((raw + recover + PP_RAW26_DELIVERY_PER_ * n + (packs || 0)) * 100) / 100
  };
}

function listPpMoneyClientKeys_(delivered, paidByKey, monthCal) {
  const keys = [];
  for (const ck of Object.keys(delivered || {})) {
    const paid = String((paidByKey && paidByKey[ck]) || "");
    if (ppClientPaysNowForStats_(ck, paid, monthCal)) keys.push(ck);
  }
  return keys;
}

function sumFactCostForMoneyKeys_(delivered, paidByKey, monthCal, perClientCost) {
  const keys = listPpMoneyClientKeys_(delivered, paidByKey, monthCal);
  let cost = 0;
  let skipped = 0;
  for (const ck of Object.keys(delivered || {})) {
    if (keys.indexOf(ck) < 0) {
      skipped++;
      continue;
    }
    cost += perClientCost;
  }
  return { cost: Math.round(cost * 100) / 100, skipped, money: keys.length };
}

function collectPpActualOut_(ppStats, monthCal, paidByKey) {
  const out = { actual: 0, clientsCounted: 0 };
  const byKey = (ppStats && ppStats.byKey) || {};
  const priceByKey = (monthCal && monthCal.ppPriceByKey) || {};
  const delivered = (monthCal && monthCal.ppDeliveredKeys) || {};
  for (const ck of Object.keys(delivered)) {
    const st = String((paidByKey && paidByKey[ck]) || "").toLowerCase();
    if (st === "no") continue;
    if (!ppClientPaysNowForStats_(ck, st, monthCal)) continue;
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

const fullBasket = [
  { cat: "dressura", name: "ЛЕГКОЕ", val: 400 },
  { cat: "dressura", name: "РУБЕЦ", val: 150 },
  { cat: "chew", name: "УХО", val: 4, piece: true }
];
const slot1Half = [
  { cat: "dressura", name: "ЛЕГКОЕ", val: 200 },
  { cat: "dressura", name: "РУБЕЦ", val: 75 },
  { cat: "chew", name: "УХО", val: 2, piece: true }
];
const rawFull = 30.3;
const packs = 11.26;
const sheetEnt = { deliveriesN: 2, basket: fullBasket, packCounts: { u1: 0, u2: 0, u3: 0, up4: 0 } };

const slot1 = {
  ppDeliveredKeys: { A: true },
  ppSlotByKey: { A: 1 },
  ppMaxSlotByKey: { A: 1 },
  ppDeliveryCountByKey: { A: 1 },
  ppPriceByKey: { A: 120 },
  bySource: { pp: 1 }
};
const bothSlots = {
  ppDeliveredKeys: { A: true },
  ppSlotByKey: { A: 1 },
  ppMaxSlotByKey: { A: 2 },
  ppDeliveryCountByKey: { A: 2 },
  ppPriceByKey: { A: 120 },
  bySource: { pp: 2 }
};
const slot2Only = {
  ppDeliveredKeys: { A: true },
  ppSlotByKey: { A: 2 },
  ppMaxSlotByKey: { A: 2 },
  ppDeliveryCountByKey: { A: 1 },
  ppPriceByKey: { A: 120 },
  bySource: { pp: 1 }
};

assert(ppClientPaysNowForStats_("A", "yes", slot1) === true, "paid=yes on slot 1 → pays-now");
assert(ppClientPaysNowForStats_("A", "", slot1) === true, "slot 1 empty paid → pays-now (don't wait)");
assert(ppFactDeliveriesNForStats_("A", slot1, sheetEnt) === 2, "N=2 from sheet even if only slot 1 delivered");

const rev1 = collectPpActualOut_({ byKey: { A: { fact: 120 } } }, slot1, { A: "yes" });
const revBoth = collectPpActualOut_({ byKey: { A: { fact: 120 } } }, bothSlots, { A: "yes" });
assert(rev1.actual === 120, "slot 1 paid → full revenue once");
assert(revBoth.actual === 120, "slot 1+2 → still one max price, not 240");
assert(rev1.actual === revBoth.actual, "second delivery does not add revenue");

const cost1 = factCostRaw26_(rawFull, fullBasket, ppFactDeliveriesNForStats_("A", slot1, sheetEnt), packs);
const costBoth = factCostRaw26_(rawFull, fullBasket, ppFactDeliveriesNForStats_("A", bothSlots, sheetEnt), packs);
assert(cost1.delivery === 18, "9×N=2 immediately on first");
assert(cost1.factCost === costBoth.factCost, "slot 2 does not change factCost");
assert(cost1.recover === 23.45, "full-composition recover, not slot-1 half");

const halfWrong = factCostRaw26_(rawFull / 2, slot1Half, 1, packs);
assert(halfWrong.factCost < cost1.factCost, "waiting for slot 2 / half basket would undercount");

assert(ppClientPaysNowForStats_("A", "", slot2Only) === false, "slot 2 without paid=yes → no money");
const revSlot2 = collectPpActualOut_({ byKey: { A: { fact: 120 } } }, slot2Only, { A: "" });
assert(revSlot2.actual === 0, "slot 2 only: revenue 0 (counter-only)");
assert(slot2Only.bySource.pp === 1, "slot 2 still counts as a delivery");
assert(bothSlots.bySource.pp === 2, "two slots → deliveries 2");

assert(ppClientPaysNowForStats_("B", "", { ppSlotByKey: { B: 1 } }) === true, "N=1 empty paid still counts");
assert(ppClientPaysNowForStats_("B", "no", { ppSlotByKey: { B: 1 } }) === false, "explicit paid=no skipped");
assert(ppFactDeliveriesNForStats_("B", { ppDeliveryCountByKey: { B: 1 } }, { deliveriesN: 1 }) === 1, "N=1 stays 1");

const unpaidN2 = {
  ppDeliveredKeys: { U: true, V: true },
  ppSlotByKey: { U: 2, V: 1 },
  bySource: { pp: 3 }
};
const unpaidPaid = { U: "", V: "no" };
assert(listPpMoneyClientKeys_(unpaidN2.ppDeliveredKeys, unpaidPaid, unpaidN2).length === 0, "unpaid N≥2 not in money keys");
const unpaidCost = sumFactCostForMoneyKeys_(unpaidN2.ppDeliveredKeys, unpaidPaid, unpaidN2, cost1.factCost);
assert(unpaidCost.cost === 0, "unpaid dual-delivery must not enter costActual");
assert(unpaidCost.skipped === 2, "both unpaid N≥2 skipped in cost loop");
assert(unpaidN2.bySource.pp === 3, "delivery counters stay unfiltered");

const paidAndUnpaid = {
  ppDeliveredKeys: { A: true, U: true },
  ppSlotByKey: { A: 1, U: 2 }
};
const mixCost = sumFactCostForMoneyKeys_(paidAndUnpaid.ppDeliveredKeys, { A: "yes", U: "" }, paidAndUnpaid, cost1.factCost);
assert(mixCost.cost === cost1.factCost, "only paysNow client adds factCost");
assert(mixCost.skipped === 1, "slot 2 unpaid skipped");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gs = fs.readFileSync(path.join(__dirname, "../Code.gs"), "utf8");
assert(gs.indexOf("function ppClientPaysNowForStats_") >= 0, "Code.gs pays-now helper");
assert(gs.indexOf("function listPpMoneyClientKeys_") >= 0, "shared money-key list");
assert(gs.indexOf("function ppFactDeliveriesNForStats_") >= 0, "Code.gs N-from-sheet helper");
assert(gs.indexOf("ppClientCountsInStats_") < 0, "no unpaid-N2 over-gate");
assert(gs.indexOf("if (sheetN >= 2) return sheetN") >= 0, "sheet N≥2 used immediately");
assert(gs.indexOf("listPpMoneyClientKeys_(out.ppDeliveredKeys") >= 0, "cost loop uses money keys");
assert(gs.indexOf("listPpMoneyClientKeys_(delivered, cycleStore, monthCal)") >= 0, "revenue uses same money keys");

console.log("OK stats-pp-n2-once");
console.log(JSON.stringify({
  revenueSlot1: rev1.actual,
  revenueBothSlots: revBoth.actual,
  revenueSlot2Only: revSlot2.actual,
  nOnFirst: 2,
  factCostOnFirst: cost1.factCost,
  factCostAfterSlot2: costBoth.factCost,
  recoverFull: cost1.recover,
  deliveryByn: cost1.delivery,
  deliveriesIfBoth: bothSlots.bySource.pp,
  unpaidN2Cost: unpaidCost.cost,
  mixCost: mixCost.cost
}, null, 2));
