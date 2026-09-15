#!/usr/bin/env node
/**
 * Inspect-loca picker: helper 827494606 / @one_more_person_228 снят.
 * Owner-кабинет (#281) остаётся. Allowlist пустой. UI-код picker жив.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function extractFn_(src, name) {
  let start = src.indexOf("function " + name);
  if (start < 0) fail("helper " + name + " not found");
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
  if (end < 0) fail("could not extract " + name);
  return src.slice(start, end);
}

function extractConstAssign_(src, name) {
  const needle = "const " + name + " =";
  const start = src.indexOf(needle);
  if (start < 0) fail("const " + name + " not found");
  let i = start + needle.length;
  while (i < src.length && /\s/.test(src[i])) i++;
  const open = src[i];
  if (open !== "[" && open !== "{") {
    const semi = src.indexOf(";", i);
    if (semi < 0) fail("const " + name + " has no terminator");
    return src.slice(start, semi + 1);
  }
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) {
      depth--;
      if (depth === 0) {
        const semi = src.indexOf(";", i);
        return src.slice(start, (semi >= 0 ? semi : i) + 1);
      }
    }
  }
  fail("const " + name + " unclosed");
}

const appPath = path.join(__dirname, "..", "varka", "app.html");
const workerPath = path.join(__dirname, "..", "boinya-c", "proxy", "worker.js");
const appSrc = fs.readFileSync(appPath, "utf8");
const workerSrc = fs.readFileSync(workerPath, "utf8");

if (!/INSPECT_LOCA_TIDS_\s*=\s*\[\s*\]/.test(appSrc)) {
  fail("varka/app.html inspect tid allowlist must be empty");
}
if (!/INSPECT_LOCA_USERS_\s*=\s*\[\s*\]/.test(appSrc)) {
  fail("varka/app.html inspect user allowlist must be empty");
}
if (/INSPECT_LOCA_TIDS_\s*=\s*\[[^\]]*827494606/.test(appSrc)) {
  fail("helper tid must not stay on UI inspect allowlist");
}
if (/INSPECT_LOCA_USERS_\s*=\s*\[[^\]]*one_more_person_228/.test(appSrc)) {
  fail("helper username must not stay on UI inspect allowlist");
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
if (!/CANON_OWNER_TIDS_\s*=\s*\[[^\]]*650923866[^\]]*827494606[^\]]*\]/.test(appSrc)) {
  fail("do not drop helper from owner cabinet allowlist");
}

if (!/PARTNER_INSPECT_LOCA_TIDS = \[\]/.test(workerSrc)) {
  fail("worker inspect tid allowlist must be empty");
}
if (!/PARTNER_INSPECT_LOCA_USERS = \[\]/.test(workerSrc)) {
  fail("worker inspect user allowlist must be empty");
}
if (/PARTNER_INSPECT_LOCA_TIDS = \["827494606"\]/.test(workerSrc)) {
  fail("helper tid must not stay on worker inspect allowlist");
}
if (/PARTNER_INSPECT_LOCA_USERS = \["one_more_person_228"\]/.test(workerSrc)) {
  fail("helper username must not stay on worker inspect allowlist");
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
if (!/PARTNER_CANON_OWNER_TIDS = \["650923866", "827494606"\]/.test(workerSrc)) {
  fail("do not drop helper from canon owner tids");
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  [
    extractConstAssign_(workerSrc, "PARTNER_INSPECT_LOCA_TIDS"),
    extractConstAssign_(workerSrc, "PARTNER_INSPECT_LOCA_USERS"),
    extractConstAssign_(workerSrc, "PARTNER_CANON_OWNER_TIDS"),
    extractConstAssign_(workerSrc, "PARTNER_CANON_OWNER_USERS"),
    extractConstAssign_(workerSrc, "PARTNER_MANUAL_ACCESS_EXCLUDE_NETS"),
    extractConstAssign_(workerSrc, "PARTNER_LIVE_TEST_ENABLED"),
    extractConstAssign_(workerSrc, "PARTNER_LIVE_TEST_USER"),
    extractConstAssign_(workerSrc, "PARTNER_LIVE_TEST_TID"),
    extractConstAssign_(workerSrc, "PARTNER_MANUAL_ACCESS_POINTS"),
    extractConstAssign_(workerSrc, "PARTNER_ARSENIY_USER"),
    extractConstAssign_(workerSrc, "PARTNER_ARSENIY_TID"),
    extractConstAssign_(workerSrc, "PARTNER_CATALOG_STATIC"),
    extractConstAssign_(workerSrc, "PARTNER_LIVE_TEST_QUEUE"),
    extractFn_(workerSrc, "partnerNormUserWorker_"),
    extractFn_(workerSrc, "isPartnerInspectLocaUser_"),
    extractFn_(workerSrc, "partnerInspectWantLoca_"),
    extractFn_(workerSrc, "isPartnerCanonOwner_"),
    extractFn_(workerSrc, "partnerCanonOwnerGetMe_")
  ].join("\n"),
  sandbox
);

const helper = { username: "one_more_person_228", telegramId: "827494606" };
const owner = { username: "arseniyhotko", telegramId: "650923866" };

if (sandbox.isPartnerInspectLocaUser_(helper)) {
  fail("helper must not get inspect-loca picker");
}
if (sandbox.isPartnerInspectLocaUser_(owner)) {
  fail("canon owner must not get inspect-loca picker via allowlist");
}
if (!sandbox.isPartnerCanonOwner_(helper) || !sandbox.isPartnerCanonOwner_(owner)) {
  fail("owner cabinet allowlist must keep helper + Arseniy");
}

const helperMe = sandbox.partnerCanonOwnerGetMe_({
  status: "success",
  name: "Helper",
  username: "one_more_person_228",
  telegramId: "827494606",
  networks: [{ id: "net_nan", name: "NaN clinic" }, { id: "net_varka", name: "Varka" }],
  points: [
    { id: "pt_nan_1", networkId: "net_nan", name: "nan_animal_clinic", active: true },
    { id: "pt_varka_repina_4", networkId: "net_varka", name: "Varka Репина 4", active: true }
  ]
}, helper);
if (helperMe.canPickInspectLoca) {
  fail("helper getMe.canPickInspectLoca must be false");
}
if (!helperMe.ownerMode || !helperMe.isOwner) {
  fail("helper owner cabinet must stay");
}

const ownerMe = sandbox.partnerCanonOwnerGetMe_({
  status: "success",
  name: "Арсений",
  username: "arseniyhotko",
  telegramId: "650923866",
  networks: [{ id: "net_varka", name: "Varka" }],
  points: [{ id: "pt_varka_repina_4", networkId: "net_varka", name: "Varka Репина 4", active: true }]
}, owner);
if (ownerMe.canPickInspectLoca) {
  fail("owner getMe.canPickInspectLoca must stay false (no inspect picker)");
}
if (!ownerMe.ownerMode || !ownerMe.isOwner) {
  fail("Arseniy owner UI must stay true");
}

console.log("OK: inspect-loca allowlist empty; helper picker off; owner cabinet stays");
console.log("  helper canPickInspectLoca:", helperMe.canPickInspectLoca);
console.log("  helper ownerMode:", helperMe.ownerMode);
console.log("  Arseniy ownerMode:", ownerMe.ownerMode);
