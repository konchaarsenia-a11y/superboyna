#!/usr/bin/env node
/**
 * Owner-only partner cabinet (Arseniy 650923866) + hide owner from granted users.
 * Helper 827494606 stays all-except-Varka (#266) + inspect loca (#268), not owner.
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

const workerPath = path.join(__dirname, "..", "boinya-c", "proxy", "worker.js");
const appPath = path.join(__dirname, "..", "varka", "app.html");
const gsPath = path.join(__dirname, "..", "Code.gs");
const workerSrc = fs.readFileSync(workerPath, "utf8");
const appSrc = fs.readFileSync(appPath, "utf8");
const gsSrc = fs.readFileSync(gsPath, "utf8");

if (!/PARTNER_CANON_OWNER_TIDS = \["650923866"\]/.test(workerSrc)) {
  fail("worker must pin canon owner tid 650923866");
}
if (!/PARTNER_CANON_OWNER_USERS = \["arseniyhotko"\]/.test(workerSrc)) {
  fail("worker must pin canon owner username");
}
if (!/function isPartnerCanonOwner_/.test(workerSrc) || !/function partnerCanonOwnerGetMe_/.test(workerSrc)) {
  fail("worker owner-cabinet helpers missing");
}
if (!/function partnerStripOwnerAccess_/.test(workerSrc) || !/function partnerDemoteFakeOwner_/.test(workerSrc)) {
  fail("worker must hide/demote owner for non-owners");
}
if (!/owner_hidden/.test(workerSrc)) {
  fail("partnerSaveAccess must reject owner identity");
}
if (!/PARTNER_MANUAL_ACCESS_EXCLUDE_NETS = \["net_varka"\]/.test(workerSrc)) {
  fail("do not drop helper exclude Varka (#266)");
}
if (!/PARTNER_INSPECT_LOCA_TIDS = \["827494606"\]/.test(workerSrc)) {
  fail("do not drop helper inspect loca (#268)");
}

if (!/CANON_OWNER_TIDS_\s*=\s*\[\s*"650923866"\s*\]/.test(appSrc)) {
  fail("varka/app.html must pin canon owner tid");
}
if (!/function isCanonOwnerUser_/.test(appSrc) || !/function isOwnerIdentityRow_/.test(appSrc)) {
  fail("varka UI owner-hide helpers missing");
}
if (!/Режим владельца/.test(appSrc)) {
  fail("varka cabinet must label owner mode");
}
if (!/function canUseOwnerUi_/.test(appSrc)) {
  fail("varka must gate owner-UI via canUseOwnerUi_");
}
if (!/id="grantStaffCard" style="display:none;"/.test(appSrc)) {
  fail("grant card must be hidden by default");
}
if (!/Выдать доступ может только владелец/.test(appSrc)) {
  fail("grant must be owner-only in UI");
}
if (/Выдать доступ может владелец или партнёр/.test(appSrc)) {
  fail("partners must not grant access");
}
if (!/canGrant = canUseOwnerUi_\(\)/.test(appSrc)) {
  fail("goCabinet must show grant only for canon owner");
}
if (!/Владельца в доступы не добавляем/.test(appSrc)) {
  fail("varka grant must refuse owner tid");
}

if (!/PARTNER_CANON_OWNER_TIDS_\s*=\s*\[\s*"650923866"\s*\]/.test(gsSrc)) {
  fail("Code.gs must pin canon owner tid");
}
if (!/function partnerIsCanonOwner_/.test(gsSrc) || !/function partnerAccessVisibleTo_/.test(gsSrc)) {
  fail("Code.gs owner-cabinet helpers missing");
}
if (!/owner_cabinet_all_points/.test(gsSrc) || !/ownerMode: true/.test(gsSrc)) {
  fail("Code.gs getMe must return ownerMode cabinet");
}
if (!/owner_hidden/.test(gsSrc)) {
  fail("Code.gs partnerSaveAccess must reject owner identity");
}
if (!/message: "owner_only"/.test(gsSrc) || !/partnerIsCanonOwner_\(actorUser, actor\)/.test(gsSrc)) {
  fail("Code.gs partnerSaveAccess must be canon-owner only");
}
if (!/message: "owner_only"/.test(workerSrc) ||
    !/isPartnerCanonOwner_/.test(workerSrc.slice(workerSrc.indexOf("if (/^partnerSaveAccess$/i.test(a))")))) {
  fail("worker partnerSaveAccess must reject non-owner");
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  [
    extractConstAssign_(workerSrc, "PARTNER_LIVE_TEST_ENABLED"),
    extractConstAssign_(workerSrc, "PARTNER_LIVE_TEST_USER"),
    extractConstAssign_(workerSrc, "PARTNER_LIVE_TEST_TID"),
    extractConstAssign_(workerSrc, "PARTNER_LIVE_TEST_IDX"),
    extractConstAssign_(workerSrc, "PARTNER_MANUAL_ACCESS_POINTS"),
    extractConstAssign_(workerSrc, "PARTNER_MANUAL_ACCESS_NET"),
    extractConstAssign_(workerSrc, "PARTNER_MANUAL_ACCESS_EXCLUDE_NETS"),
    extractConstAssign_(workerSrc, "PARTNER_INSPECT_LOCA_TIDS"),
    extractConstAssign_(workerSrc, "PARTNER_INSPECT_LOCA_USERS"),
    extractConstAssign_(workerSrc, "PARTNER_LIVE_TEST_QUEUE"),
    extractConstAssign_(workerSrc, "PARTNER_CATALOG_STATIC"),
    extractConstAssign_(workerSrc, "PARTNER_ARSENIY_POINTS"),
    extractConstAssign_(workerSrc, "PARTNER_CANON_OWNER_TIDS"),
    extractConstAssign_(workerSrc, "PARTNER_CANON_OWNER_USERS"),
    extractFn_(workerSrc, "partnerNormUserWorker_"),
    extractFn_(workerSrc, "isPartnerLiveTestUser_"),
    extractFn_(workerSrc, "isPartnerManualAccessUser_"),
    extractFn_(workerSrc, "isPartnerInspectLocaUser_"),
    extractFn_(workerSrc, "partnerInspectWantLoca_"),
    extractFn_(workerSrc, "isPartnerOwnerAllUser_"),
    extractFn_(workerSrc, "isPartnerCanonOwner_"),
    extractFn_(workerSrc, "partnerIsOwnerIdentity_"),
    extractFn_(workerSrc, "partnerStripOwnerAccess_"),
    extractFn_(workerSrc, "partnerAttachVisibleAccess_"),
    extractFn_(workerSrc, "partnerDemoteFakeOwner_"),
    extractFn_(workerSrc, "partnerManualAllowedPointId_"),
    extractFn_(workerSrc, "partnerExcludeNets_"),
    extractFn_(workerSrc, "partnerIsExcludedNet_"),
    extractFn_(workerSrc, "partnerIsExcludedPoint_"),
    extractFn_(workerSrc, "partnerOwnerAllOverrideKey_"),
    extractFn_(workerSrc, "partnerOwnerAllGetMe_"),
    extractFn_(workerSrc, "partnerCanonOwnerGetMe_"),
    extractFn_(workerSrc, "partnerBlockWrongPoint_"),
    extractFn_(workerSrc, "isPartnerArseniy_"),
    extractFn_(workerSrc, "partnerArseniyAllowedPointId_"),
    extractFn_(workerSrc, "partnerGuardOrRewrite_")
  ].join("\n"),
  sandbox
);

const helper = { username: "one_more_person_228", telegramId: "827494606" };
const owner = { username: "arseniyhotko", telegramId: "650923866" };
const staff = { username: "clinic_staff", telegramId: "111" };

if (sandbox.isPartnerCanonOwner_(helper)) fail("helper must not be canon owner");
if (!sandbox.isPartnerCanonOwner_(owner)) fail("Arseniy tid must be canon owner");
if (sandbox.isPartnerCanonOwner_(staff)) fail("granted staff must not be canon owner");
if (!sandbox.isPartnerOwnerAllUser_(helper)) fail("helper must keep owner-all-except override");
if (sandbox.isPartnerOwnerAllUser_(owner)) fail("canon owner must not use helper override");

const catalog = {
  status: "success",
  name: "Владелец Good Boy",
  role: "owner",
  isOwner: true,
  access: [
    { id: "pa_owner", username: "arseniyhotko", telegramId: "650923866", role: "owner", name: "Арсений", pointIds: ["pt_nan_1"], status: "active" },
    { id: "pa_help", username: "one_more_person_228", telegramId: "827494606", role: "partner", name: "Helper", pointIds: ["pt_nan_1", "pt_fundog_1"], status: "active" },
    { id: "pa_staff", username: "clinic_staff", telegramId: "111", role: "staff", name: "Сотрудник", pointIds: ["pt_nan_1"], status: "active" }
  ],
  networks: [
    { id: "net_varka", name: "Varka" },
    { id: "net_nan", name: "NaN clinic" },
    { id: "net_fundog", name: "Fundog" }
  ],
  points: [
    { id: "pt_varka_repina_4", networkId: "net_varka", name: "Varka Репина 4", active: true },
    { id: "pt_nan_1", networkId: "net_nan", name: "nan_animal_clinic", active: true },
    { id: "pt_fundog_1", networkId: "net_fundog", name: "Fundog", active: true }
  ]
};

const ownerMe = sandbox.partnerGuardOrRewrite_("partnerGetMe", owner, catalog);
if (!ownerMe.ownerMode || !ownerMe.isOwner || ownerMe.role !== "owner") {
  fail("owner getMe must be ownerMode cabinet, got " + JSON.stringify({
    ownerMode: ownerMe.ownerMode, isOwner: ownerMe.isOwner, role: ownerMe.role
  }));
}
const ownerPts = (ownerMe.points || []).map(function (p) { return p.id; });
if (ownerPts.indexOf("pt_varka_repina_4") < 0) fail("owner cabinet must include Varka");
if (ownerPts.indexOf("pt_nan_1") < 0 || ownerPts.indexOf("pt_fundog_1") < 0) {
  fail("owner cabinet missing active points");
}
if ((ownerMe.access || []).some(function (a) { return sandbox.partnerIsOwnerIdentity_(a); })) {
  fail("owner getMe access still lists owner identity");
}
if (!(ownerMe.access || []).some(function (a) { return a.telegramId === "111"; })) {
  fail("owner should still see granted staff in access");
}

const helperMe = sandbox.partnerGuardOrRewrite_("partnerGetMe", helper, catalog);
if (helperMe.isOwner || helperMe.ownerMode || helperMe.role === "owner") {
  fail("helper must not get owner cabinet: " + JSON.stringify({
    isOwner: helperMe.isOwner, ownerMode: helperMe.ownerMode, role: helperMe.role
  }));
}
if (helperMe.name === "Владелец Good Boy") fail("helper must not inherit owner display name");
const helperPts = (helperMe.points || []).map(function (p) { return p.id; });
if (helperPts.some(function (id) { return /^pt_varka_/.test(id); })) {
  fail("helper getMe leaked Varka (broke #266)");
}
if (helperPts.indexOf("pt_nan_1") < 0 || helperPts.indexOf("pt_fundog_1") < 0) {
  fail("helper lost allowed non-Varka points");
}
if (!helperMe.canPickInspectLoca) fail("helper must keep inspect loca (#268)");
if ((helperMe.access || []).length) {
  fail("helper must not receive access/owner-UI list");
}

const staffMe = sandbox.partnerDemoteFakeOwner_(staff, {
  status: "success",
  isOwner: true,
  ownerMode: true,
  role: "owner",
  name: "Владелец Good Boy",
  username: "clinic_staff"
});
if (staffMe.isOwner || staffMe.ownerMode || staffMe.role === "owner" || staffMe.name === "Владелец Good Boy") {
  fail("granted user must be demoted from fake owner");
}

const admin = sandbox.partnerGuardOrRewrite_("partnerListAdmin", helper, {
  status: "success",
  access: catalog.access
});
if ((admin.access || []).some(function (a) { return sandbox.partnerIsOwnerIdentity_(a); })) {
  fail("partnerListAdmin still returns owner to non-owner");
}
if (!(admin.access || []).some(function (a) { return a.telegramId === "111"; })) {
  fail("partnerListAdmin stripped too much");
}

const blockedHelperVarka = sandbox.partnerBlockWrongPoint_("partnerSubmitOrder", {
  username: "one_more_person_228",
  telegramId: "827494606",
  locationId: "pt_varka_repina_4",
  networkId: "net_varka"
});
if (!blockedHelperVarka || blockedHelperVarka.message !== "forbidden_point") {
  fail("helper submit Varka must stay forbidden_point");
}
const ownerVarka = sandbox.partnerBlockWrongPoint_("partnerSubmitOrder", {
  username: "arseniyhotko",
  telegramId: "650923866",
  locationId: "pt_varka_repina_4",
  networkId: "net_varka"
});
if (ownerVarka) fail("owner submit Varka must pass, got " + JSON.stringify(ownerVarka));

console.log("OK: owner cabinet + hide owner from granted");
console.log("  owner tid: 650923866 · Varka included · ownerMode");
console.log("  helper tid: 827494606 · no owner · Varka excluded · inspect loca");
