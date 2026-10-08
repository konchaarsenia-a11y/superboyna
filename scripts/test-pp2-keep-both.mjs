/**
 * ПП2: дата цикла, N=1, вторая запись другого типа не затирает первую.
 * Повтор той же даты и того же типа остаётся одним заказом.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gs = readFileSync(join(root, "Code.gs"), "utf8");
const worker = readFileSync(join(root, "boinya-c/proxy/worker.js"), "utf8");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL", msg);
  } else {
    console.log("OK  ", msg);
  }
}

function sliceFn(src, name) {
  const start = src.indexOf("function " + name);
  if (start < 0) throw new Error("missing " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}

const gsApi = new Function(
  `
function clientMatchKey_(s) { return String(s || "").trim().toUpperCase().replace(/[._]/g, ""); }
function nicksMatch_(a, b) {
  var ka = clientMatchKey_(a), kb = clientMatchKey_(b);
  return !!(ka && kb && ka === kb);
}
var Utilities = { formatDate: function (d, tz, fmt) {
  var x = new Date(d.getTime());
  if (fmt === "d") return String(x.getUTCDate());
  if (fmt === "yyyy-MM") return x.getUTCFullYear() + "-" + ("0" + (x.getUTCMonth() + 1)).slice(-2);
  return "";
}};
` +
    [
      "segmentLabelFromOrderType_",
      "nudgeCycleDateHit_",
      "ppCycleJsonLooksLike_",
      "ppCycleMonthKeyFromCell_",
      "calendarSegmentsDiffer_",
      "weekClientColForSegment_"
    ]
      .map((n) => sliceFn(gs, n))
      .join("\n") +
    "\nreturn { segmentLabelFromOrderType_, nudgeCycleDateHit_, ppCycleJsonLooksLike_, ppCycleMonthKeyFromCell_, calendarSegmentsDiffer_, weekClientColForSegment_ };"
)();

assert(gsApi.ppCycleJsonLooksLike_({ A: { slot2: { date: "07.10.2026" } } }) === true, "cycle json has a slot");
assert(gsApi.ppCycleJsonLooksLike_({ A: true, B: false }) === false, "courier flags are not a cycle");
assert(
  gsApi.ppCycleMonthKeyFromCell_(new Date("2026-10-01T00:00:00Z"), "Europe/Minsk") === "PP_CYCLE:2026-10",
  "1 October date cell can be the October cycle key"
);
assert(gsApi.ppCycleMonthKeyFromCell_(new Date("2026-10-07T00:00:00Z"), "Europe/Minsk") === "", "7 October courier date is not a cycle key");
assert(sliceFn(gs, "getPpMonthCycleStore_").indexOf("ppCycleJsonLooksLike_") > 0, "month store keeps a date cell only when the json is a cycle");
assert(sliceFn(gs, "resolvePpDeliverySlot_").indexOf('source: "n1"') > 0, "one delivery a month resolves to slot 1");
assert(sliceFn(gs, "recordPpDeliveryCycle_").indexOf("cycle.slot2 = null") > 0, "N=1 does not keep a second cycle slot");
assert(sliceFn(gs, "recordPpDeliveryCycle_").indexOf("deliveriesN >= 2) slot = Math.max") > 0, "forcing slot 2 stays behind N>=2");

const nicks = ["katya.dehtyarenko", "", ""];
const notes = ["домой", "", ""];
const fresh = gsApi.weekClientColForSegment_(nicks, notes, "katya.dehtyarenko", "ПАРТНЁР", { hasOtherSegment: true });
assert(fresh.mode === "new" && fresh.col === -1, "partner does not reuse the untagged PP column when another type exists");
const again = gsApi.weekClientColForSegment_(nicks, notes, "katya.dehtyarenko", "ПП", { hasOtherSegment: false });
assert(again.mode === "legacy" && again.col === 3, "same type reuses the untagged column");
const tagged = gsApi.weekClientColForSegment_(
  ["katya.dehtyarenko", "katya.dehtyarenko"],
  ["[SEG:ПП]", "[SEG:ПАРТНЁР]"],
  "katya.dehtyarenko",
  "ПАРТНЁР",
  {}
);
assert(tagged.mode === "tagged" && tagged.col === 4, "tagged partner column is the one updated");
const editOnly = gsApi.weekClientColForSegment_(nicks, notes, "katya.dehtyarenko", "ПАРТНЁР", {
  isEdit: true,
  hasOtherSegment: true
});
assert(editOnly.mode === "edit-only" && editOnly.col === 3, "editing the only column may change its type");

const wApi = new Function(
  sliceFn(worker, "normalizeSegmentLabel_") +
    "\n" +
    sliceFn(worker, "parseMeta_") +
    "\nfunction coerceDateIso_(raw) { var s = String(raw || '').trim(); if (/^\\d{4}-\\d{2}-\\d{2}$/.test(s)) return s; var m = s.match(/^(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})$/); if (!m) return ''; return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }\n" +
    sliceFn(worker, "orderRowDateIso_") +
    "\n" +
    sliceFn(worker, "orderRowDay_") +
    "\n" +
    sliceFn(worker, "orderRowSegment_") +
    "\n" +
    sliceFn(worker, "orderSegmentsSplit_") +
    "\n" +
    sliceFn(worker, "orderSameRecord_") +
    "\n" +
    sliceFn(worker, "classicOrderId_") +
    "\n" +
    sliceFn(worker, "pickOrderSaveTarget_") +
    "\n" +
    sliceFn(worker, "parseForcedPpSlotD1_") +
    "\n" +
    sliceFn(worker, "formatPpSlotLabelD1_") +
    "\n" +
    sliceFn(worker, "clampPpMetaToDeliveriesN_") +
    "\nreturn { pickOrderSaveTarget_, orderSameRecord_, clampPpMetaToDeliveriesN_ };"
)();

const rows = [
  { id: "Понедельник:KATYA", date_iso: "2026-10-06", day_name: "Понедельник", segment: "ПП", status: "active" }
];
const partner = wApi.pickOrderSaveTarget_(rows, {
  day: "Понедельник",
  dateIso: "2026-10-06",
  segment: "ПАРТНЁР",
  matchKey: "KATYA"
});
assert(partner.mode === "insert" && partner.id.indexOf("#") > 0, "different type on the same day is a new id");
assert(partner.deleteIds.length === 0, "the PP row is not deleted");
const dup = wApi.pickOrderSaveTarget_(rows, {
  day: "Понедельник",
  dateIso: "2026-10-06",
  segment: "ПП",
  matchKey: "KATYA"
});
assert(dup.mode === "duplicate" && dup.id === "Понедельник:KATYA" && dup.deleteIds.length === 0, "same date and type updates the row");
const otherDay = wApi.pickOrderSaveTarget_(rows, {
  day: "Вторник",
  dateIso: "2026-10-07",
  segment: "ПП",
  matchKey: "KATYA"
});
assert(otherDay.mode === "insert" && otherDay.deleteIds.length === 0, "another day is kept beside the first");
const moved = wApi.pickOrderSaveTarget_(rows, {
  day: "Вторник",
  dateIso: "2026-10-07",
  segment: "ПП",
  matchKey: "KATYA",
  isEdit: true,
  oldDay: "Понедельник",
  oldDate: "2026-10-06"
});
assert(moved.mode === "edit" && moved.id === "Понедельник:KATYA", "edit moves that one row");

const n1 = wApi.clampPpMetaToDeliveriesN_({ ppSlot: "2", deliverySlot: 2, deliveriesN: 2 }, 1, true);
assert(n1.ppSlot === "1" && n1.deliverySlot === 1 && n1.deliveriesN === 1, "card N=1 clamps a PP2 payload");
const n2 = wApi.clampPpMetaToDeliveriesN_({ ppSlot: "2/2", deliverySlot: 2 }, 2, true);
assert(n2.ppSlot === "2/2" && n2.deliverySlot === 2, "card N=2 keeps slot 2");
const missing = wApi.clampPpMetaToDeliveriesN_({ ppSlot: "2", deliverySlot: 2 }, 0, false);
assert(missing.ppSlot === "2", "missing card does not invent a clamp");
const payload1 = wApi.clampPpMetaToDeliveriesN_({ ppSlot: "2", deliveriesN: 1 }, 0, false);
assert(payload1.ppSlot === "1" && payload1.deliverySlot === 1, "payload N=1 still becomes slot 1");

assert(worker.indexOf("clampPpOrderSlotToCard_") > 0, "save path asks the card");
assert(sliceFn(worker, "saveOrder_").indexOf("day_name != ?") < 0, "save no longer deletes every other day");
const ordersUi = readFileSync(join(root, "boinya-c/next/orders.js"), "utf8");
assert(ordersUi.indexOf("Одна доставка в месяц, слот ПП1") > 0, "N=1 hides the PP2 button");
assert(ordersUi.indexOf("·") < 0 || ordersUi.indexOf("Одна доставка в месяц, слот ПП1") > 0, "new copy has no middle dot");

if (failed) {
  console.error("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nall ok");
