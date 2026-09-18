#!/usr/bin/env node
/**
 * Owner cabinet: helper 827494606 only.
 * Arseniy 650923866 is staff (not canon-owner). Helper keeps ownerMode + all points.
 * Staff / granted users stay demoted. Inspect loca у helper снят.
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

const workerTids = extractConstAssign_(workerSrc, "PARTNER_CANON_OWNER_TIDS");
const workerUsers = extractConstAssign_(workerSrc, "PARTNER_CANON_OWNER_USERS");
if (workerTids.indexOf("827494606") < 0) {
  fail("worker must keep helper as canon owner tid");
}
if (workerTids.indexOf("650923866") >= 0) {
  fail("worker must drop Arseniy from canon owner tids");
}
if (workerUsers.indexOf("one_more_person_228") < 0) {
  fail("worker must keep helper as canon owner username");
}
if (workerUsers.indexOf("arseniyhotko") >= 0) {
  fail("worker must drop Arseniy from canon owner usernames");
}
if (!/function isPartnerCanonOwner_/.test(workerSrc) || !/function partnerCanonOwnerGetMe_/.test(workerSrc)) {
  fail("worker owner-cabinet helpers missing");
}
if (!/function partnerStripOwnerAccess_/.test(workerSrc) || !/function partnerDemoteFakeOwner_/.test(workerSrc)) {
  fail("worker must hide/demote owner for non-owners");
}
if (!/function partnerIsClosedAccess_/.test(workerSrc) || !/function partnerStaffAccessOnly_/.test(workerSrc)) {
  fail("worker must hide revoked leftover and keep staff-only owner access");
}
if (/nan_staff_forbidden/.test(workerSrc)) {
  fail("worker must not block grant on pt_nan_1 / nan partner");
}
if (!/owner_hidden/.test(workerSrc)) {
  fail("partnerSaveAccess must reject owner identity");
}
if (!/isPartnerCanonOwner_\(params\)\) return false/.test(workerSrc)) {
  fail("isPartnerOwnerAllUser_ must skip canon owner (owner beats exclude)");
}
if (!/PARTNER_INSPECT_LOCA_TIDS = \[\]/.test(workerSrc)) {
  fail("helper inspect loca allowlist must be empty");
}
if (/PARTNER_ARSENIY/.test(extractFn_(workerSrc, "partnerEnsureManualAccess_"))) {
  fail("partnerEnsureManualAccess_ must not auto-revoke Arseniy Access");
}
if (/PARTNER_ARSENIY/.test(extractFn_(workerSrc, "partnerEnsureLiveTestAccess_"))) {
  fail("partnerEnsureLiveTestAccess_ must not auto-revoke Arseniy Access");
}

if (!/CANON_OWNER_TIDS_\s*=\s*\[[^\]]*827494606[^\]]*\]/.test(appSrc)) {
  fail("varka/app.html must keep helper as canon owner tid");
}
if (/CANON_OWNER_TIDS_\s*=\s*\[[^\]]*650923866/.test(appSrc)) {
  fail("varka/app.html must drop Arseniy from canon owner tids");
}
if (!/CANON_OWNER_USERS_\s*=\s*\[[^\]]*one_more_person_228[^\]]*\]/.test(appSrc)) {
  fail("varka/app.html must keep helper as canon owner username");
}
if (/CANON_OWNER_USERS_\s*=\s*\[[^\]]*arseniyhotko/.test(appSrc)) {
  fail("varka/app.html must drop Arseniy from canon owner usernames");
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
if (!/APP_VER = "3.3.54"/.test(appSrc)) {
  fail("varka APP_VER must be 3.3.54");
}
if (/На nan clinic staff не выдаём/.test(appSrc)) {
  fail("varka grant must allow pt_nan_1 like any other point");
}
var staffListSrc = appSrc.slice(appSrc.indexOf("function renderStaffList_"));
if (!/st === "inactive" \|\| st === "revoked"/.test(staffListSrc)) {
  fail("renderStaffList_ must hide revoked leftover");
}
if (!/!== "staff"/.test(staffListSrc)) {
  fail("renderStaffList_ must not draw partner as staff");
}

if (!/PARTNER_CANON_OWNER_TIDS_\s*=\s*\[[^\]]*827494606[^\]]*\]/.test(gsSrc)) {
  fail("Code.gs must keep helper as canon owner tid");
}
if (/PARTNER_CANON_OWNER_TIDS_\s*=\s*\[[^\]]*650923866/.test(gsSrc)) {
  fail("Code.gs must drop Arseniy from canon owner tids");
}
if (!/PARTNER_CANON_OWNER_USERS_\s*=\s*\[[^\]]*one_more_person_228[^\]]*\]/.test(gsSrc)) {
  fail("Code.gs must keep helper as canon owner username");
}
if (/PARTNER_CANON_OWNER_USERS_\s*=\s*\[[^\]]*arseniyhotko/.test(gsSrc)) {
  fail("Code.gs must drop Arseniy from canon owner usernames");
}
if (!/function partnerIsCanonOwner_/.test(gsSrc) || !/function partnerAccessVisibleTo_/.test(gsSrc)) {
  fail("Code.gs owner-cabinet helpers missing");
}
if (!/function partnerMigrateProdV36_/.test(gsSrc)) {
  fail("Code.gs must restore nan partner access (V36)");
}
if (/nan_staff_forbidden/.test(gsSrc)) {
  fail("Code.gs must not block grant on pt_nan_1 / nan partner");
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
    !/partnerCanWriteAccess_/.test(workerSrc.slice(workerSrc.indexOf("if (/^partnerSaveAccess$/i.test(a))")))) {
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
    extractConstAssign_(workerSrc, "PARTNER_ARSENIY_USER"),
    extractConstAssign_(workerSrc, "PARTNER_ARSENIY_TID"),
    extractConstAssign_(workerSrc, "PARTNER_ARSENIY_POINTS"),
    extractConstAssign_(workerSrc, "PARTNER_CANON_OWNER_TIDS"),
    extractConstAssign_(workerSrc, "PARTNER_CANON_OWNER_USERS"),
    extractFn_(workerSrc, "partnerNormUserWorker_"),
    extractFn_(workerSrc, "isPartnerLiveTestUser_"),
    extractFn_(workerSrc, "isPartnerManualAccessUser_"),
    extractFn_(workerSrc, "isPartnerInspectLocaUser_"),
    extractFn_(workerSrc, "partnerInspectWantLoca_"),
    extractFn_(workerSrc, "isPartnerCanonOwner_"),
    extractFn_(workerSrc, "isPartnerOwnerAllUser_"),
    extractFn_(workerSrc, "partnerIsOwnerIdentity_"),
    extractFn_(workerSrc, "partnerIsClosedAccess_"),
    extractFn_(workerSrc, "partnerStripOwnerAccess_"),
    extractFn_(workerSrc, "partnerStaffAccessOnly_"),
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
const arseniy = { username: "arseniyhotko", telegramId: "650923866" };
const staff = { username: "clinic_staff", telegramId: "111" };

if (!sandbox.isPartnerCanonOwner_(helper)) fail("helper tid must be canon owner");
if (!sandbox.isPartnerCanonOwner_({ telegramId: "827494606" })) fail("helper tid-only must be canon owner");
if (!sandbox.isPartnerCanonOwner_({ username: "one_more_person_228" })) fail("helper username must be canon owner");
if (sandbox.isPartnerCanonOwner_(arseniy)) fail("Arseniy must not stay canon owner");
if (sandbox.isPartnerCanonOwner_({ telegramId: "650923866" })) fail("Arseniy tid-only must not be canon owner");
if (sandbox.isPartnerCanonOwner_({ username: "arseniyhotko" })) fail("Arseniy username must not be canon owner");
if (sandbox.isPartnerCanonOwner_(staff)) fail("granted staff must not be canon owner");
if (sandbox.isPartnerOwnerAllUser_(helper)) fail("canon owner must not use helper exclude override");
if (sandbox.isPartnerOwnerAllUser_(arseniy)) fail("Arseniy must not use helper exclude override");
if (sandbox.partnerIsOwnerIdentity_({ telegramId: "650923866", username: "arseniyhotko", role: "staff" })) {
  fail("Arseniy staff row must not be treated as owner identity");
}

const catalog = {
  status: "success",
  name: "Владелец Good Boy",
  role: "owner",
  isOwner: true,
  access: [
    { id: "pa_arseniy", username: "arseniyhotko", telegramId: "650923866", role: "staff", name: "Арсений", pointIds: ["pt_varka_rokoss_80"], status: "active" },
    { id: "pa_help", username: "one_more_person_228", telegramId: "827494606", role: "partner", name: "Helper", pointIds: ["pt_nan_1", "pt_fundog_1"], status: "active" },
    { id: "pa_staff", username: "clinic_staff", telegramId: "111", role: "staff", name: "Сотрудник", pointIds: ["pt_fundog_1"], status: "active" },
    { id: "pa_nan_animal_clinic", username: "nan_animal_clinic", telegramId: "", role: "partner", name: "NaN clinic", pointIds: ["pt_nan_1"], status: "active" },
    { id: "pa_nan_staff", username: "nan_staff", telegramId: "222", role: "staff", name: "NaN staff", pointIds: ["pt_nan_1"], status: "active" },
    { id: "pa_revoked_staff", username: "old_staff", telegramId: "333", role: "staff", name: "Revoked", pointIds: ["pt_fundog_1"], status: "revoked" }
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

function assertOwnerCabinet_(who, me, expectUser, expectTid) {
  if (!me.ownerMode || !me.isOwner || me.role !== "owner") {
    fail(who + " getMe must be ownerMode cabinet, got " + JSON.stringify({
      ownerMode: me.ownerMode, isOwner: me.isOwner, role: me.role
    }));
  }
  if (me.partnerOverride !== "owner_cabinet_all_points") {
    fail(who + " override want owner_cabinet_all_points got " + me.partnerOverride);
  }
  const pts = (me.points || []).map(function (p) { return p.id; });
  if (pts.indexOf("pt_varka_repina_4") < 0) fail(who + " cabinet must include Varka");
  if (pts.indexOf("pt_nan_1") < 0 || pts.indexOf("pt_fundog_1") < 0) {
    fail(who + " cabinet missing active points");
  }
  if ((me.access || []).some(function (a) { return sandbox.partnerIsOwnerIdentity_(a); })) {
    fail(who + " getMe access still lists owner identity");
  }
  if ((me.access || []).some(function (a) {
    return a.username === "nan_animal_clinic" || a.id === "pa_nan_animal_clinic";
  })) {
    fail(who + " getMe must not draw nan partner as staff");
  }
  if ((me.access || []).some(function (a) { return a.telegramId === "333"; })) {
    fail(who + " getMe must hide revoked leftover");
  }
  if (!(me.access || []).some(function (a) { return a.telegramId === "222"; })) {
    fail(who + " getMe must keep staff granted on pt_nan_1");
  }
  if (!(me.access || []).some(function (a) { return a.telegramId === "111"; })) {
    fail(who + " should still see granted staff in access");
  }
  if (String(me.username || "") !== expectUser) {
    fail(who + " username leaked/wrong: " + me.username);
  }
  if (String(me.telegramId || "") !== expectTid) {
    fail(who + " telegramId leaked/wrong: " + me.telegramId);
  }
}

const helperMe = sandbox.partnerGuardOrRewrite_("partnerGetMe", helper, catalog);
assertOwnerCabinet_("helper", helperMe, "one_more_person_228", "827494606");
if (helperMe.name === "Арсений") fail("helper must not inherit Arseniy display name");
if (!(helperMe.access || []).some(function (a) { return a.telegramId === "650923866" && a.role === "staff"; })) {
  fail("helper owner access must list Arseniy as staff");
}

const arseniyMe = sandbox.partnerGuardOrRewrite_("partnerGetMe", arseniy, {
  status: "success",
  name: "Арсений",
  username: "arseniyhotko",
  telegramId: "650923866",
  role: "staff",
  isStaff: true,
  isOwner: true,
  ownerMode: true,
  points: [{ id: "pt_varka_rokoss_80", networkId: "net_varka", name: "Varka Рокоссовского 80", active: true }],
  access: catalog.access
});
if (arseniyMe.ownerMode || arseniyMe.isOwner || arseniyMe.role === "owner") {
  fail("Arseniy getMe must not be owner cabinet, got " + JSON.stringify({
    ownerMode: arseniyMe.ownerMode, isOwner: arseniyMe.isOwner, role: arseniyMe.role
  }));
}
if (arseniyMe.partnerOverride === "owner_cabinet_all_points") {
  fail("Arseniy must not keep owner_cabinet_all_points override");
}
if (arseniyMe.role !== "staff") fail("Arseniy getMe role want staff got " + arseniyMe.role);

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

const admin = sandbox.partnerGuardOrRewrite_("partnerListAdmin", staff, {
  status: "success",
  access: catalog.access
});
if ((admin.access || []).some(function (a) { return sandbox.partnerIsOwnerIdentity_(a); })) {
  fail("partnerListAdmin still returns owner to non-owner");
}
if (!(admin.access || []).some(function (a) { return a.username === "nan_animal_clinic"; })) {
  fail("partnerListAdmin must keep active nan partner");
}
if (!(admin.access || []).some(function (a) { return a.telegramId === "222"; })) {
  fail("partnerListAdmin must keep staff on pt_nan_1");
}
if ((admin.access || []).some(function (a) { return a.telegramId === "333"; })) {
  fail("partnerListAdmin must hide revoked leftover");
}
if (!(admin.access || []).some(function (a) { return a.telegramId === "111"; })) {
  fail("partnerListAdmin stripped too much");
}

const helperVarka = sandbox.partnerBlockWrongPoint_("partnerSubmitOrder", {
  username: "one_more_person_228",
  telegramId: "827494606",
  locationId: "pt_varka_repina_4",
  networkId: "net_varka"
});
if (helperVarka) fail("helper owner submit Varka must pass, got " + JSON.stringify(helperVarka));

const arseniyOtherVarka = sandbox.partnerBlockWrongPoint_("partnerSubmitOrder", {
  username: "arseniyhotko",
  telegramId: "650923866",
  locationId: "pt_varka_repina_4",
  networkId: "net_varka"
});
if (arseniyOtherVarka) fail("Arseniy submit without PARTNER_ARSENIY override must pass to GAS, got " + JSON.stringify(arseniyOtherVarka));

const helperOrders = sandbox.partnerGuardOrRewrite_("partnerListMyOrders", helper, {
  status: "success",
  orders: [
    { id: "a", locationId: "pt_varka_repina_4", networkId: "net_varka" },
    { id: "b", locationId: "pt_nan_1", networkId: "net_nan" }
  ]
});
const helperOrderIds = (helperOrders.orders || []).map(function (o) { return o.id; });
if (helperOrderIds.indexOf("a") < 0) fail("helper owner list must include Varka orders");
if (helperOrderIds.indexOf("b") < 0) fail("helper owner list dropped allowed orders");

if (sandbox.isPartnerInspectLocaUser_(helper)) fail("helper must not keep inspect loca picker");
if (helperMe.canPickInspectLoca) fail("helper getMe.canPickInspectLoca must be false");
if (sandbox.isPartnerInspectLocaUser_(arseniy)) fail("Arseniy must not get inspect loca picker");

console.log("OK: owner cabinet helper only; Arseniy staff not owner");
console.log("  helper tid: 827494606 · full owner · Varka included · ownerMode");
console.log("  Arseniy tid: 650923866 · not canon owner · staff via Access");
