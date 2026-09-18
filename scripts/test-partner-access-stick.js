#!/usr/bin/env node
/**
 * Grant/revoke from Boinya «Партнёры» must drive partnerGetMe.
 * Arseniy 650923866 is staff, not canon-owner. Helper 827494606 demoted — cannot grant.
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

if (workerSrc.indexOf("PARTNER_CANON_OWNER_TIDS = [\"650923866\"") >= 0) {
  fail("do not re-add Arseniy to PARTNER_CANON_OWNER_TIDS");
}
if (/PARTNER_CANON_OWNER_TIDS_\s*=\s*\[[^\]]*650923866/.test(gsSrc)) {
  fail("do not re-add Arseniy to PARTNER_CANON_OWNER_TIDS_");
}
if (!/function partnerBuildGetMeFromAdmin_/.test(workerSrc)) {
  fail("worker must build getMe from D1 access");
}
if (!/fromD1Access/.test(workerSrc)) {
  fail("worker getMe must mark fromD1Access");
}
if (!/partnerMergeAdminKeepD1Access_/.test(workerSrc) || !/putPartnerAdminFromGas_/.test(workerSrc)) {
  fail("worker must not let GAS listAdmin clobber D1 access");
}
if (!/partnerWriteMeSnapsForRow_/.test(workerSrc) || !/partnerInvalidateMeSnaps_/.test(workerSrc) || !/partnerSyncMeSnapsForPerson_/.test(workerSrc)) {
  fail("grant/revoke must DELETE then rewrite partnerMe snaps");
}
if (!/function partnerExpandPersonFromAccess_/.test(workerSrc) || !/function partnerRevokeIndexesForPerson_/.test(workerSrc)) {
  fail("revoke must expand dual username/tid identity rows");
}
if (!/partnerSyncSameRolePointIds_/.test(workerSrc)) {
  fail("grant must sync pointIds onto same-role identity aliases");
}
const saveSlice = workerSrc.slice(workerSrc.indexOf("if (/^partnerSaveAccess$/i.test(a))"));
if (saveSlice.indexOf("partnerSyncMeSnapsForPerson_") < 0 || saveSlice.indexOf("partnerSyncSameRolePointIds_") < 0) {
  fail("partnerSaveAccess must sync aliases and clear partnerMe cache");
}
const revokeSlice = workerSrc.slice(workerSrc.indexOf("if (/^partnerRevokeAccess$/i.test(a))"));
if (revokeSlice.indexOf("partnerRevokeIndexesForPerson_") < 0 || revokeSlice.indexOf("partnerSyncMeSnapsForPerson_") < 0) {
  fail("partnerRevokeAccess must revoke all identity aliases and clear partnerMe cache");
}
if (!/gb_partner_me_v5/.test(appSrc)) {
  fail("varka must bust demoted-owner me cache (v5)");
}
if (!/partnerFindAccessHitIndex_/.test(workerSrc)) {
  fail("saveAccess must match by role, not smash staff");
}
if (!/partnerOverride === "owner_cabinet_all_points"/.test(appSrc)) {
  fail("varka loadMeCache_ must drop leftover owner-all cache");
}
if (!/function partnerFindActiveAccess_/.test(gsSrc) || !/matches\.length === 1/.test(gsSrc)) {
  fail("GAS getMe must union active access rows");
}
if (!/isBoynaOwner/.test(gsSrc) || !/partnerIsCanonOwner_\(actorUser, actor\)/.test(gsSrc)) {
  fail("GAS saveAccess must allow Boinya owner or canon owner");
}
if (!/partnerIsCanonOwner_\(actorUser, actor\)/.test(gsSrc.slice(gsSrc.indexOf("function handlePartnerRevokeAccess")))) {
  fail("GAS revoke must accept partner canon owner (helper), not only Boinya owner");
}
if (!/function partnerExpandPersonFromAccess_/.test(gsSrc) || gsSrc.slice(gsSrc.indexOf("function handlePartnerRevokeAccess")).indexOf("partnerExpandPersonFromAccess_") < 0) {
  fail("GAS revoke must expand dual identity rows");
}
const uiSrc = fs.readFileSync(path.join(__dirname, "..", "boinya-c", "app.main.js"), "utf8");
if (!/targetTelegramId: String\(row.telegramId/.test(uiSrc) || !/partnerHubRevokeAccess_/.test(uiSrc)) {
  fail("Boinya UI revoke must send target username+telegramId, not only id");
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
    extractFn_(workerSrc, "partnerAccessStatus_"),
    extractFn_(workerSrc, "partnerAccessRowMatchesUser_"),
    extractFn_(workerSrc, "partnerCanWriteAccess_"),
    extractFn_(workerSrc, "partnerAddPersonIdentity_"),
    extractFn_(workerSrc, "partnerAccessRowMatchesPerson_"),
    extractFn_(workerSrc, "partnerExpandPersonFromAccess_"),
    extractFn_(workerSrc, "partnerMeSnapKeysForPerson_"),
    extractFn_(workerSrc, "partnerSyncSameRolePointIds_"),
    extractFn_(workerSrc, "partnerRevokeIndexesForPerson_"),
    extractFn_(workerSrc, "partnerFindAccessHitIndex_"),
    extractFn_(workerSrc, "partnerActiveAccessRowsForUser_"),
    extractFn_(workerSrc, "partnerPendingAccessRowForUser_"),
    extractFn_(workerSrc, "partnerUnionPointIds_"),
    extractFn_(workerSrc, "partnerPickActivePoint_"),
    extractFn_(workerSrc, "partnerBuildGetMeFromAdmin_"),
    extractFn_(workerSrc, "partnerMergeAdminKeepD1Access_"),
    extractFn_(workerSrc, "partnerStripOwnerAccess_"),
    extractFn_(workerSrc, "partnerStaffAccessOnly_"),
    extractFn_(workerSrc, "partnerAttachVisibleAccess_"),
    extractFn_(workerSrc, "partnerDemoteFakeOwner_"),
    extractFn_(workerSrc, "partnerExcludeNets_"),
    extractFn_(workerSrc, "partnerIsExcludedNet_"),
    extractFn_(workerSrc, "partnerIsExcludedPoint_"),
    extractFn_(workerSrc, "partnerOwnerAllOverrideKey_"),
    extractFn_(workerSrc, "partnerOwnerAllGetMe_"),
    extractFn_(workerSrc, "partnerCanonOwnerGetMe_"),
    extractFn_(workerSrc, "isPartnerArseniy_"),
    extractFn_(workerSrc, "partnerGuardOrRewrite_")
  ].join("\n"),
  sandbox
);

const arseniy = { username: "arseniyhotko", telegramId: "650923866" };
const helper = { username: "one_more_person_228", telegramId: "827494606" };
const stranger = { username: "clinic_staff", telegramId: "111", actorUsername: "clinic_staff" };

if (sandbox.isPartnerCanonOwner_(arseniy)) fail("Arseniy must not be canon owner");
if (!sandbox.partnerCanWriteAccess_({ telegramId: "650923866" })) {
  fail("Boinya operator Arseniy must be able to grant/revoke Access");
}
if (sandbox.partnerCanWriteAccess_({ telegramId: "827494606", actorUsername: "one_more_person_228" })) {
  fail("demoted helper must not grant Access");
}
if (sandbox.partnerCanWriteAccess_(stranger)) {
  fail("random staff must not grant Access");
}
if (sandbox.partnerIsOwnerIdentity_({ telegramId: "650923866", username: "arseniyhotko", role: "staff" })) {
  fail("owner_hidden must not fire on Arseniy staff row");
}

const admin = {
  status: "success",
  catalog: [],
  networks: [
    { id: "net_varka", name: "Varka", active: true },
    { id: "net_nan", name: "NaN clinic", active: true }
  ],
  points: [
    { id: "pt_varka_rokoss_80", networkId: "net_varka", name: "Varka Рокоссовского 80", address: "Рокоссовского 80", active: true },
    { id: "pt_varka_shevchenko_1", networkId: "net_varka", name: "Varka Шевченко 1", address: "Шевченко 1", active: true },
    { id: "pt_nan_1", networkId: "net_nan", name: "nan_animal_clinic", active: true }
  ],
  access: [
    {
      id: "pa_arseniy_staff",
      username: "arseniyhotko",
      telegramId: "650923866",
      name: "Арсений",
      role: "staff",
      status: "active",
      networkId: "net_varka",
      pointIds: ["pt_varka_rokoss_80"]
    },
    {
      id: "pa_arseniy_shev",
      username: "arseniyhotko",
      telegramId: "650923866",
      name: "Арсений",
      role: "partner",
      status: "active",
      networkId: "net_varka",
      pointIds: ["pt_varka_shevchenko_1"]
    }
  ]
};

function idsOf_(me) {
  const set = {};
  (me.pointIds || []).forEach(function (id) { set[id] = true; });
  (me.points || []).forEach(function (p) { if (p && p.id) set[p.id] = true; });
  return set;
}

const granted = sandbox.partnerBuildGetMeFromAdmin_(admin, arseniy);
const grantedIds = idsOf_(granted);
if (!granted.allowed || !grantedIds["pt_varka_shevchenko_1"]) {
  fail("grant must show Шевченко 1 in getMe, got " + JSON.stringify(granted.pointIds));
}
if (!grantedIds["pt_varka_rokoss_80"]) {
  fail("staff rokoss_80 must stay when partner row is also active");
}
if (granted.ownerMode || granted.isOwner || granted.role === "owner") {
  fail("Arseniy getMe from access must not be owner");
}
if (granted.partnerOverride === "owner_cabinet_all_points") {
  fail("access getMe must not set owner_cabinet_all_points");
}

const revokedAdmin = JSON.parse(JSON.stringify(admin));
revokedAdmin.access[1].status = "revoked";
const afterRevoke = sandbox.partnerBuildGetMeFromAdmin_(revokedAdmin, arseniy);
const afterIds = idsOf_(afterRevoke);
if (afterIds["pt_varka_shevchenko_1"]) {
  fail("revoke must drop Шевченко 1 from getMe immediately");
}
if (!afterIds["pt_varka_rokoss_80"] || !afterRevoke.allowed) {
  fail("revoke of partner row must keep staff rokoss_80");
}

const staleOwnerSnap = {
  status: "success",
  allowed: true,
  ownerMode: true,
  isOwner: true,
  role: "owner",
  partnerOverride: "owner_cabinet_all_points",
  pointIds: ["pt_varka_rokoss_80", "pt_varka_shevchenko_1", "pt_nan_1"],
  points: admin.points
};
const demoted = sandbox.partnerGuardOrRewrite_("partnerGetMe", arseniy, staleOwnerSnap);
if (demoted.ownerMode || demoted.isOwner) {
  fail("stale owner snap must be demoted");
}
const rebuilt = sandbox.partnerGuardOrRewrite_(
  "partnerGetMe",
  arseniy,
  sandbox.partnerBuildGetMeFromAdmin_(revokedAdmin, arseniy)
);
const rebuiltIds = idsOf_(rebuilt);
if (rebuiltIds["pt_varka_shevchenko_1"] || rebuiltIds["pt_nan_1"]) {
  fail("D1 access must win over stale owner-all snap points");
}

const smash = sandbox.partnerFindAccessHitIndex_(admin.access, {
  username: "arseniyhotko",
  telegramId: "650923866",
  role: "partner"
});
if (smash !== 1) {
  fail("partner grant must hit partner row, not staff, got " + smash);
}
const staffHit = sandbox.partnerFindAccessHitIndex_(admin.access, {
  username: "arseniyhotko",
  telegramId: "650923866",
  role: "staff"
});
if (staffHit !== 0) fail("staff edit must hit staff row, got " + staffHit);

const mergedGas = sandbox.partnerMergeAdminKeepD1Access_(
  { access: revokedAdmin.access, _d1TouchedAt: Date.now() },
  { status: "success", access: admin.access, networks: admin.networks }
);
if ((mergedGas.access || []).some(function (r) {
  return r.id === "pa_arseniy_shev" && String(r.status) === "active";
})) {
  fail("GAS listAdmin must not resurrect revoked D1 access");
}

const helperAdmin = Object.assign({}, admin, {
  access: (admin.access || []).concat([{
    id: "pa_help",
    username: "one_more_person_228",
    telegramId: "827494606",
    name: "Helper",
    role: "partner",
    status: "active",
    networkId: "net_nan",
    pointIds: ["pt_nan_1"]
  }])
});
const helperFromAccess = sandbox.partnerBuildGetMeFromAdmin_(helperAdmin, helper);
const helperMe = sandbox.partnerGuardOrRewrite_("partnerGetMe", helper, helperFromAccess);
if (helperMe.ownerMode || helperMe.isOwner || helperMe.role === "owner") {
  fail("helper must not keep owner after demote");
}
if (helperMe.partnerOverride === "owner_cabinet_all_points" ||
    (helperMe.partnerOverride && String(helperMe.partnerOverride).indexOf("owner_all") === 0)) {
  fail("helper must not keep owner-all leftover, got " + helperMe.partnerOverride);
}
const helperIds = idsOf_(helperMe);
if (!helperIds["pt_nan_1"]) fail("helper Access pt_nan_1 missing");
if (helperIds["pt_varka_rokoss_80"] || helperIds["pt_varka_shevchenko_1"]) {
  fail("helper must not get all-points leftover, got " + JSON.stringify(helperMe.pointIds));
}
if (sandbox.isPartnerOwnerAllUser_(helper)) fail("helper must not match isPartnerOwnerAllUser_");

const dualAdmin = {
  status: "success",
  catalog: [],
  networks: admin.networks,
  points: admin.points,
  access: [
    {
      id: "pa_arseniy_staff",
      username: "arseniyhotko",
      telegramId: "650923866",
      name: "Арсений",
      role: "staff",
      status: "active",
      networkId: "net_varka",
      pointIds: ["pt_varka_rokoss_80"]
    },
    {
      id: "pa_arseniyhotko",
      username: "arseniyhotko",
      telegramId: "",
      name: "Арсений",
      role: "partner",
      status: "active",
      networkId: "net_varka",
      pointIds: ["pt_varka_shevchenko_1"]
    },
    {
      id: "pa_650923866",
      username: "",
      telegramId: "650923866",
      name: "Арсений",
      role: "partner",
      status: "active",
      networkId: "net_varka",
      pointIds: ["pt_varka_shevchenko_1"]
    },
    {
      id: "pa_cfblk",
      username: "cfblk",
      telegramId: "999",
      name: "Shevchenko clinic",
      role: "partner",
      status: "active",
      networkId: "net_varka",
      pointIds: ["pt_varka_shevchenko_1"]
    }
  ]
};

const dualPerson = sandbox.partnerExpandPersonFromAccess_(dualAdmin.access, { id: "pa_arseniyhotko" });
if ((dualPerson.tids || []).indexOf("650923866") < 0 || (dualPerson.users || []).indexOf("arseniyhotko") < 0) {
  fail("expand from pa_arseniyhotko must pick tid 650923866 and username arseniyhotko");
}
const snapKeys = sandbox.partnerMeSnapKeysForPerson_(dualPerson);
if (snapKeys.indexOf("partnerMe:650923866") < 0 || snapKeys.indexOf("partnerMe:arseniyhotko") < 0) {
  fail("must invalidate partnerMe:<tid> and partnerMe:<username>, got " + JSON.stringify(snapKeys));
}
const plan = sandbox.partnerRevokeIndexesForPerson_(dualAdmin.access, { id: "pa_arseniyhotko" });
const revokedIds = plan.indexes.map(function (i) { return dualAdmin.access[i].id; }).sort();
if (revokedIds.join(",") !== "pa_650923866,pa_arseniyhotko") {
  fail("revoke must touch both alias rows, not staff/cfblk, got " + revokedIds.join(","));
}
if (plan.indexes.some(function (i) { return dualAdmin.access[i].id === "pa_cfblk"; })) {
  fail("do not touch pa_cfblk when revoking Arseniy");
}
if (plan.indexes.some(function (i) { return dualAdmin.access[i].id === "pa_arseniy_staff"; })) {
  fail("revoke partner aliases must keep Arseniy staff rokoss_80");
}

const afterDual = JSON.parse(JSON.stringify(dualAdmin));
plan.indexes.forEach(function (i) { afterDual.access[i].status = "revoked"; });
const afterDualMe = sandbox.partnerBuildGetMeFromAdmin_(afterDual, arseniy);
const afterDualIds = idsOf_(afterDualMe);
if (afterDualIds["pt_varka_shevchenko_1"]) {
  fail("after dual-row revoke getMe must drop Шевченко 1");
}
if (!afterDualIds["pt_varka_rokoss_80"]) {
  fail("after dual-row revoke staff rokoss_80 must remain");
}

const grantSync = JSON.parse(JSON.stringify(dualAdmin));
sandbox.partnerSyncSameRolePointIds_(
  grantSync.access,
  sandbox.partnerExpandPersonFromAccess_(grantSync.access, { id: "pa_arseniyhotko", username: "arseniyhotko", telegramId: "650923866" }),
  "partner",
  ["pt_varka_rokoss_80"],
  "active"
);
const userKeyed = grantSync.access.filter(function (r) { return r.id === "pa_arseniyhotko"; })[0];
const tidKeyed = grantSync.access.filter(function (r) { return r.id === "pa_650923866"; })[0];
const cfblk = grantSync.access.filter(function (r) { return r.id === "pa_cfblk"; })[0];
const staffRow = grantSync.access.filter(function (r) { return r.id === "pa_arseniy_staff"; })[0];
if ((userKeyed.pointIds || []).join() !== "pt_varka_rokoss_80" || (tidKeyed.pointIds || []).join() !== "pt_varka_rokoss_80") {
  fail("grant rewrite must copy pointIds onto both identity aliases");
}
if ((cfblk.pointIds || []).join() !== "pt_varka_shevchenko_1") {
  fail("grant rewrite must not change pa_cfblk");
}
if ((staffRow.pointIds || []).join() !== "pt_varka_rokoss_80" || staffRow.status !== "active") {
  fail("grant rewrite must not smash staff row");
}

if (sandbox.partnerAccessRowMatchesUser_({ id: "pa_650923866", username: "", telegramId: "" }, arseniy) !== true) {
  fail("getMe must match tid-keyed pa_<tid> even if telegramId field empty");
}

console.log("OK: partner access stick");
console.log("  grant → getMe sees point; revoke → getMe loses point");
console.log("  dual pa_user+pa_tid revoked; partnerMe tid+username keys; pa_cfblk untouched");
console.log("  staff rokoss_80 kept; Arseniy not canon owner; helper owner_hidden intact");
