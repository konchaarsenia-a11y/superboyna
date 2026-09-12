#!/usr/bin/env node
/**
 * Unit-check: partner order.status must not pick up GAS envelope status ("success").
 * Extracts resolvePartnerOrderStatusFromLive_ from boinya-c/proxy/worker.js.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const workerPath = path.join(__dirname, "..", "boinya-c", "proxy", "worker.js");
const src = fs.readFileSync(workerPath, "utf8");

if (/live\.status\s*\|\|\s*params\.status/.test(src)) {
  console.error("FAIL: worker.js still has live.status || params.status");
  process.exit(1);
}

const d1Ret = src.match(
  /return \{\s*status:\s*"success",\s*id:\s*oid,\s*orderStatus:\s*st,/
);
if (!d1Ret) {
  console.error("FAIL: D1 partnerSetOrderStatus return missing orderStatus (duplicate status key?)");
  process.exit(1);
}

function extractFn_(name) {
  const start = src.indexOf("function " + name);
  if (start < 0) {
    console.error("FAIL: helper " + name + " not found");
    process.exit(1);
  }
  let i = src.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) {
    console.error("FAIL: could not extract " + name);
    process.exit(1);
  }
  return src.slice(start, end);
}

const helpersSrc =
  extractFn_("resolvePartnerOrderStatusFromLive_") +
  "\n" +
  extractFn_("partnerBusinessStatusRank_") +
  "\n" +
  extractFn_("partnerMergeListedOrder_");
const helpers = new Function(
  helpersSrc + "\nreturn { resolvePartnerOrderStatusFromLive_, partnerMergeListedOrder_ };"
)();
const resolvePartnerOrderStatusFromLive_ = helpers.resolvePartnerOrderStatusFromLive_;
const partnerMergeListedOrder_ = helpers.partnerMergeListedOrder_;

function mergeSnap(prev, live, params) {
  const next = live.order ? Object.assign({}, prev, live.order) : Object.assign({}, prev);
  const st = resolvePartnerOrderStatusFromLive_(live, params, prev.status);
  if (st) next.status = st;
  return next;
}

const cases = [
  {
    name: "GAS envelope only (no live.order) → orderStatus",
    prev: { id: "po_1", status: "new" },
    live: { status: "success", id: "po_1", orderStatus: "cancelled" },
    params: { status: "cancelled" },
    want: "cancelled"
  },
  {
    name: "GAS envelope only → delivered via params.orderStatus",
    prev: { id: "po_1", status: "in_transit" },
    live: { status: "success", id: "po_1" },
    params: { orderStatus: "delivered", status: "delivered" },
    want: "delivered"
  },
  {
    name: "live.order exists but status leaked envelope",
    prev: { id: "po_1", status: "new" },
    live: { status: "success", id: "po_1", order: { id: "po_1", status: "success" }, orderStatus: "in_transit" },
    params: { status: "in_transit" },
    want: "in_transit"
  },
  {
    name: "live.order with real status, no orderStatus field",
    prev: { id: "po_1", status: "new" },
    live: { status: "success", order: { id: "po_1", status: "delivered" } },
    params: {},
    want: "delivered"
  },
  {
    name: "canceled → cancelled",
    prev: { id: "po_1", status: "new" },
    live: { status: "success", id: "po_1", orderStatus: "canceled" },
    params: {},
    want: "cancelled"
  },
  {
    name: "envelope-only keeps previous order status",
    prev: { id: "po_1", status: "in_transit" },
    live: { status: "success", id: "po_1" },
    params: {},
    want: "in_transit"
  },
  {
    name: "old bug: live.status || params.status would write success",
    prev: { id: "po_1", status: "new" },
    live: { status: "success", id: "po_1", orderStatus: "cancelled" },
    params: { status: "cancelled" },
    want: "cancelled",
    oldWouldBe: "success"
  }
];

let failed = 0;
for (const c of cases) {
  const got = mergeSnap(c.prev, c.live, c.params).status;
  const oldBug = c.live.status || c.params.status;
  const ok = got === c.want;
  if (c.oldWouldBe && oldBug !== c.oldWouldBe) {
    console.error("WARN: old-bug sentinel changed", c.name, oldBug);
  }
  if (!ok) {
    failed++;
    console.error("FAIL:", c.name, "got", got, "want", c.want);
  } else {
    console.log("OK:", c.name, "→", got);
  }
}

const listCases = [
  {
    name: "list merge: D1 delivered not wiped by stale GAS new",
    d1: { id: "po_1", status: "delivered" },
    gas: { id: "po_1", status: "new" },
    want: "delivered"
  },
  {
    name: "list merge: D1 in_transit not wiped by missing GAS status",
    d1: { id: "po_1", status: "in_transit" },
    gas: { id: "po_1" },
    want: "in_transit"
  },
  {
    name: "list merge: D1 not wiped by GAS envelope success",
    d1: { id: "po_1", status: "delivered" },
    gas: { id: "po_1", status: "success" },
    want: "delivered"
  },
  {
    name: "list merge: GAS delivered upgrades D1 new",
    d1: { id: "po_1", status: "new" },
    gas: { id: "po_1", status: "delivered" },
    want: "delivered"
  }
];

for (const c of listCases) {
  const got = partnerMergeListedOrder_(c.d1, c.gas).status;
  if (got !== c.want) {
    failed++;
    console.error("FAIL:", c.name, "got", got, "want", c.want);
  } else {
    console.log("OK:", c.name, "→", got);
  }
}

if (failed) {
  console.error("Failed:", failed);
  process.exit(1);
}
console.log("All", cases.length + listCases.length, "partner order status merge cases passed.");
