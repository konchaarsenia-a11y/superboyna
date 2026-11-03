/* Чтение: грязная сумма календаря и чистая как в статистике. Заказы не пишет. */
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const week = require("../boinya-c/next/week-logic.js");
const formulas = require("../boinya-c/next/formulas.js");

function rowsOf(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  const blocks = Array.isArray(data) ? data : [data];
  const out = [];
  blocks.forEach(function (b) {
    if (b && Array.isArray(b.results)) out.push.apply(out, b.results);
  });
  return out;
}

function extractFn(src, name) {
  const key = "function " + name;
  let from = 0;
  while (from < src.length) {
    const at = src.indexOf(key, from);
    if (at < 0) throw new Error("нет функции " + name);
    const prev = at > 0 ? src[at - 1] : "";
    if (prev && /[A-Za-z0-9_]/.test(prev)) {
      from = at + key.length;
      continue;
    }
    const brace = src.indexOf("{", at);
    let i = brace;
    let depth = 0;
    let quote = "";
    while (i < src.length) {
      const ch = src[i];
      if (quote) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === quote) quote = "";
        i++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { quote = ch; i++; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return src.slice(at, i + 1);
      }
      i++;
    }
    throw new Error("не закрыта " + name);
  }
  throw new Error("нет функции " + name);
}

function extractConst(src, name) {
  const key = "const " + name + " = ";
  const at = src.indexOf(key);
  if (at < 0) throw new Error("нет const " + name);
  let i = at + key.length;
  let depth = 0;
  let quote = "";
  let started = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") { i++; continue; }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "[" || ch === "{") { depth++; started = true; }
    else if (ch === "]" || ch === "}") depth--;
    else if (ch === ";" && started && depth === 0) return src.slice(at, i + 1);
  }
  throw new Error("не закрыт const " + name);
}

function loadApi() {
  const src = fs.readFileSync(new URL("../boinya-c/proxy/worker.js", import.meta.url), "utf8");
  const names = [
    "isChewProductNameD1_",
    "isChewCrumbSourceD1_",
    "catalogAliasNameD1_",
    "normalizeBasketItemAliasesD1_",
    "normalizeBasketAliasesD1_",
    "parseBasket_",
    "normalizeMatchKey_",
    "matchKeyAliases_",
    "parseMeta_",
    "normalizeSegmentLabel_",
    "sourceFromSegment_",
    "priceFieldHasValue_",
    "extractOrderPriceFromNoteD1_",
    "crumbParentNameD1_",
    "isGramCrumbLineD1_",
    "isPieceSkuNameD1_",
    "ppCostFractionAliasesD1_",
    "ppCostUnitD1_",
    "rawCostBuiltinGramD1_",
    "overlayRawCostsD1_",
    "lookupPpCostInfoD1_",
    "crumbRawCostD1_",
    "buildPpLinesFromCostsD1_",
    "statsBasketSigD1_",
    "statsUnitsD1_",
    "statsOrderPriceD1_",
    "statsSrcD1_",
    "statsDeliveredHitD1_",
    "parseForcedPpSlotD1_",
    "normPaidFlagD1_",
    "statsKopeckD1_",
    "statsIsoDayD1_",
    "statsAddDaysD1_",
    "statsMonthBoundsD1_",
    "statsDaysBetweenD1_",
    "statsPpSlotD1_",
    "statsPpStartsCycleD1_",
    "statsPpSplitCyclesD1_",
    "statsPpRowCopyD1_",
    "statsPpMovedCarrierD1_",
    "statsPpPayRowD1_",
    "statsPpMonthCarrierD1_",
    "statsFormulaPartsD1_",
    "statsFormulaRollupD1_",
    "statsFormulaByDayD1_"
  ];
  const code = [extractConst(src, "RAW_COST_BUILTIN_")].concat(names.map(function (n) { return extractFn(src, n); })).join("\n");
  const sandbox = {
    Math: Math, Number: Number, String: String, Object: Object, Array: Array,
    isFinite: isFinite, Date: Date, JSON: JSON, RegExp: RegExp
  };
  vm.createContext(sandbox);
  vm.runInContext(code + "\nthis.api = { parseBasket_: parseBasket_, normalizeSegmentLabel_: normalizeSegmentLabel_, statsOrderPriceD1_: statsOrderPriceD1_, statsSrcD1_: statsSrcD1_, statsUnitsD1_: statsUnitsD1_, statsDeliveredHitD1_: statsDeliveredHitD1_, parseForcedPpSlotD1_: parseForcedPpSlotD1_, normPaidFlagD1_: normPaidFlagD1_, normalizeMatchKey_: normalizeMatchKey_, matchKeyAliases_: matchKeyAliases_, overlayRawCostsD1_: overlayRawCostsD1_, statsFormulaByDayD1_: statsFormulaByDayD1_, statsMonthBoundsD1_: statsMonthBoundsD1_ };", sandbox);
  return sandbox.api;
}

function buildEvents(api, orders, flags, costs) {
  const flagMap = Object.create(null);
  flags.forEach(function (fr) {
    const iso = String(fr.date_iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    api.matchKeyAliases_(fr.match_key).forEach(function (k) { flagMap[iso + "|" + k] = true; });
  });
  const byKey = Object.create(null);
  orders.forEach(function (row) {
    const st = String(row.status || "").toLowerCase();
    if (st === "cancelled" || st === "deleted") return;
    const iso = String(row.date_iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    const meta = {
      orderPrice: row.price,
      clientPrice: row.client_price,
      statedCost: row.stated,
      paid: row.paid,
      ppPaid: row.pp_paid,
      ppSlot: row.pp_slot,
      deliverySlot: row.delivery_slot,
      deliveriesN: row.deliveries_n,
      orderType: row.order_type,
      segment: row.segment,
      source: row.source,
      mailTrack: row.mail_track,
      track: row.track,
      payDue: row.pay_due,
      payMoved: row.pay_moved,
      ppHint: row.pp_hint
    };
    const basket = api.parseBasket_(row.basket_json);
    let price = api.statsOrderPriceD1_(meta, row.price_tag || "");
    const src = api.statsSrcD1_(row, meta, price);
    if (!src) return;
    if (src === "bp") price = 0;
    const ck = api.normalizeMatchKey_(row.match_key || row.client);
    if (!ck) return;
    const track = String(meta.mailTrack || meta.track || "").trim();
    const delivered = api.statsDeliveredHitD1_(flagMap, iso, row.match_key) || api.statsDeliveredHitD1_(flagMap, iso, row.client) || !!track;
    const units = api.statsUnitsD1_(basket, costs);
    const ev = {
      ck: ck,
      iso: iso,
      src: src,
      delivered: delivered,
      viaMail: !!track,
      price: price,
      S: units.S,
      G: units.G,
      P: units.P,
      sig: units.sig,
      missingBasket: units.missingBasket,
      slot: src === "pp" ? api.parseForcedPpSlotD1_(meta.ppSlot || meta.deliverySlot, meta.deliveriesN) || 0 : 0,
      paid: src === "pp" ? api.normPaidFlagD1_(meta.paid != null && meta.paid !== "" ? meta.paid : meta.ppPaid) : "",
      payDue: Number(meta.payDue) || 0,
      payMoved: String(meta.payMoved || ""),
      basketN: basket.length
    };
    const dedupe = iso + "|" + ck;
    const prev = byKey[dedupe];
    if (!prev) { byKey[dedupe] = ev; return; }
    const keep = ev.basketN > prev.basketN || (ev.basketN === prev.basketN && ev.price > prev.price) ? ev : prev;
    const other = keep === ev ? prev : ev;
    keep.delivered = !!(keep.delivered || other.delivered);
    keep.viaMail = !!(keep.viaMail || other.viaMail);
    if (!(keep.price > 0) && other.price > 0) keep.price = other.price;
    if (!keep.slot && other.slot) keep.slot = other.slot;
    if (keep.paid !== "yes" && other.paid === "yes") keep.paid = "yes";
    if (!(Number(keep.payDue) > 0) && Number(other.payDue) > 0) keep.payDue = other.payDue;
    if (!keep.payMoved && other.payMoved) keep.payMoved = other.payMoved;
    if (keep.missingBasket && !other.missingBasket) {
      keep.S = other.S; keep.G = other.G; keep.P = other.P; keep.sig = other.sig; keep.missingBasket = false;
    }
    byKey[dedupe] = keep;
  });
  return Object.keys(byKey).map(function (k) { return byKey[k]; });
}

function dirtyOf(api, orders, iso) {
  const month = iso.slice(0, 7);
  const list = [];
  orders.forEach(function (row) {
    if (String(row.status || "").toLowerCase() !== "active") return;
    const date = String(row.date_iso || "").slice(0, 10);
    if (date.slice(0, 7) !== month) return;
    list.push({
      name: row.client,
      matchKey: row.match_key,
      segment: api.normalizeSegmentLabel_(row.segment || row.order_type || ""),
      source: row.source || "",
      orderPrice: row.price,
      paid: row.paid,
      ppPaid: row.pp_paid,
      ppSlot: row.pp_slot,
      deliverySlot: row.delivery_slot,
      deliveriesN: row.deliveries_n,
      payDue: row.pay_due,
      payMoved: row.pay_moved,
      ppHint: row.pp_hint,
      _sumDate: date,
      dateIso: date
    });
  });
  const map = week.dayRevenueMap(list);
  return {
    dirty: Object.prototype.hasOwnProperty.call(map, iso) ? map[iso] : 0,
    monthDirty: week.revenueSum(list)
  };
}

function minskToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Minsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function pointKey(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/\bVARKA\b/g, "ВАРКА");
}

function planList(api, orders, partnerOrders, costs, versions, today) {
  const month = "2026-10";
  const list = [];
  orders.forEach(function (row) {
    if (String(row.status || "").toLowerCase() !== "active") return;
    const date = String(row.date_iso || "").slice(0, 10);
    if (date.slice(0, 7) !== month) return;
    const basket = api.parseBasket_(row.basket_json);
    const priced = api.overlayRawCostsD1_(costs, versions, date);
    const units = api.statsUnitsD1_(basket, priced);
    list.push({
      name: row.client,
      matchKey: row.match_key,
      segment: api.normalizeSegmentLabel_(row.segment || row.order_type || ""),
      source: row.source || "",
      orderPrice: row.price,
      paid: row.paid,
      ppPaid: row.pp_paid,
      ppSlot: row.pp_slot,
      deliverySlot: row.delivery_slot,
      deliveriesN: row.deliveries_n,
      payDue: row.pay_due,
      payMoved: row.pay_moved,
      ppHint: row.pp_hint,
      _sumDate: date,
      dateIso: date,
      costS: units.S,
      costG: units.G,
      costP: units.P,
      costReady: true
    });
  });
  (partnerOrders || []).forEach(function (order) {
    const st = String((order && (order.status || order.orderStatus)) || "").toLowerCase();
    if (st === "delivered" || st === "cancelled" || st === "canceled") return;
    const date = String((order && order.deliverDateIso) || "").slice(0, 10);
    if (date.slice(0, 7) !== month || date < today) return;
    const name = String((order.locationName || order.userName) || "Партнёр").trim() || "Партнёр";
    const key = pointKey(name);
    const sameDay = list.some(function (c) {
      return c.dateIso === date && (pointKey(c.name) === key || (order.id && String(c.note || "").indexOf(order.id) >= 0));
    });
    if (sameDay) return;
    const basket = Array.isArray(order.basket) ? order.basket : [];
    const priced = api.overlayRawCostsD1_(costs, versions, date);
    const units = api.statsUnitsD1_(basket, priced);
    const price = order.totalByn != null && order.totalByn !== "" ? order.totalByn : "";
    list.push({
      name: name,
      matchKey: key,
      segment: "ПАРТНЁР",
      source: "partner",
      orderPrice: price,
      _sumDate: date,
      dateIso: date,
      costS: units.S,
      costG: units.G,
      costP: units.P,
      costReady: true
    });
  });
  return list;
}

function pairOf(plan, iso) {
  const dirty = week.revenueSum(plan.list, { onlyDate: iso });
  const slot = plan.map[iso];
  if (!slot) return { dirty: dirty == null ? 0 : dirty, clean: null, N: 0 };
  const made = formulas.formulaMonth_({
    revenue: slot.revenue,
    S: slot.S,
    G: slot.G,
    P: slot.P,
    N: slot.N
  });
  return { dirty: slot.revenue, clean: made.gross, cost: made.cost, N: slot.N };
}

function main() {
  const api = loadApi();
  if (process.argv.indexOf("--self-check") >= 0) {
    const units = api.statsUnitsD1_([{ name: "ЛЁГКОЕ", sub: "Крупное", val: 100 }], {});
    if (!(units.S >= 0)) throw new Error("units");
    process.stdout.write("self-check ok\n");
    return;
  }
  const dir = process.argv[2];
  if (!dir) throw new Error("нужна папка с json");
  const orders = rowsOf(fs.readFileSync(dir + "/orders.json", "utf8"));
  const flags = rowsOf(fs.readFileSync(dir + "/deliveries.json", "utf8"));
  const costRows = rowsOf(fs.readFileSync(dir + "/costs.json", "utf8"));
  const verRows = rowsOf(fs.readFileSync(dir + "/versions.json", "utf8"));
  let partnerOrders = [];
  try {
    const partnerRows = rowsOf(fs.readFileSync(dir + "/partners.json", "utf8"));
    if (partnerRows[0] && partnerRows[0].payload) {
      const snap = JSON.parse(partnerRows[0].payload);
      partnerOrders = (snap && snap.orders) || [];
    }
  } catch (ePartner) {
    partnerOrders = [];
  }
  let rawCosts = {};
  if (costRows[0] && costRows[0].payload) {
    const snap = JSON.parse(costRows[0].payload);
    rawCosts = (snap && snap.costs) || {};
  }
  const costs = api.overlayRawCostsD1_(rawCosts, verRows, "2026-10-26");
  const events = buildEvents(api, orders, flags, costs);
  const byDay = api.statsFormulaByDayD1_(events, "2026-10-01", "2026-10-31");
  const day = byDay["2026-10-26"] || { revenue: 0, cost: 0, clean: 0, N: 0 };
  const dirty = dirtyOf(api, orders, "2026-10-26");
  const today = minskToday();
  const list = planList(api, orders, partnerOrders, rawCosts, verRows, today);
  const map = week.dayPlanUnits(list);
  if (!map) throw new Error("себес не собрался");
  const dates = ["2026-10-26", "2026-10-27", "2026-10-28"];
  const days = {};
  dates.forEach(function (iso) {
    days[iso] = pairOf({ list: list, map: map }, iso);
    days[iso].statsClean = (byDay[iso] && byDay[iso].clean) || 0;
  });
  const summary = {
    date: "2026-10-26",
    dirty: dirty.dirty,
    clean: day.clean,
    revenue: day.revenue,
    cost: day.cost,
    N: day.N,
    monthDirty: dirty.monthDirty,
    orders: orders.length,
    events: events.length,
    today: today,
    days: days
  };
  fs.writeFileSync(dir + "/summary.json", JSON.stringify(summary, null, 2));
  process.stdout.write(JSON.stringify(summary) + "\n");
}

main();
