#!/usr/bin/env node
/**
 * Inspect-loca picker only for @one_more_person_228 / tid 827494606.
 * Varka stays excluded. Other partners do not get the picker.
 */
"use strict";

const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

const appPath = path.join(__dirname, "..", "varka", "app.html");
const workerPath = path.join(__dirname, "..", "boinya-c", "proxy", "worker.js");
const appSrc = fs.readFileSync(appPath, "utf8");
const workerSrc = fs.readFileSync(workerPath, "utf8");

if (!/INSPECT_LOCA_TIDS_\s*=\s*\[\s*"827494606"\s*\]/.test(appSrc)) {
  fail("varka/app.html must allowlist tid 827494606");
}
if (!/INSPECT_LOCA_USERS_\s*=\s*\[\s*"one_more_person_228"\s*\]/.test(appSrc)) {
  fail("varka/app.html must allowlist @one_more_person_228");
}
if (!/id="inspectLocaCard"/.test(appSrc) || !/id="inspectLocaSelect"/.test(appSrc)) {
  fail("cabinet inspect select missing");
}
if (!/id="inspectLocaChip"/.test(appSrc) || !/id="inspectLocaOrdersSelect"/.test(appSrc)) {
  fail("order/history inspect UI missing");
}
if (!/gb_inspect_loca_v1/.test(appSrc)) {
  fail("localStorage key gb_inspect_loca_v1 missing");
}
if (!/function isInspectLocaUser_/.test(appSrc) || !/function goInspectLoca/.test(appSrc)) {
  fail("inspect helpers missing in app.html");
}
if (!/isVarkaInspectBlocked_/.test(appSrc) || !/pt_varka_/.test(appSrc)) {
  fail("UI must keep blocking Varka in inspect picker");
}
if (/INSPECT_LOCA_TIDS_\s*=\s*\[\s*\]/.test(appSrc)) {
  fail("inspect allowlist must not be empty");
}

// Picker is gated by allowlist, not «any partner with many points».
if (/assignedPointsList_\(\)[\s\S]{0,180}inspectLocaCard/.test(appSrc)) {
  fail("do not show inspect picker to every multi-point partner");
}

if (!/PARTNER_INSPECT_LOCA_TIDS = \["827494606"\]/.test(workerSrc)) {
  fail("worker allowlist tid missing");
}
if (!/function isPartnerInspectLocaUser_/.test(workerSrc)) {
  fail("worker isPartnerInspectLocaUser_ missing");
}
if (!/canPickInspectLoca/.test(workerSrc)) {
  fail("worker getMe must expose canPickInspectLoca");
}
if (!/partnerInspectWantLoca_/.test(workerSrc)) {
  fail("worker locationId inspect filter missing");
}
if (!/PARTNER_MANUAL_ACCESS_EXCLUDE_NETS = \["net_varka"\]/.test(workerSrc)) {
  fail("do not drop exclude Varka");
}

console.log("OK: inspect-loca allowlist + UI + Varka still closed");
console.log("  tid: 827494606");
console.log("  user: one_more_person_228");
console.log("  persist: gb_inspect_loca_v1");
