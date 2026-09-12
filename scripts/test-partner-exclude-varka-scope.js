#!/usr/bin/env node
/**
 * @one_more_person_228: owner-all except Varka.
 * getMe/list hide net_varka / pt_varka_*; submit on those ids is forbidden;
 * other nets (NaN/Fundog/BOW/…) stay allowed.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const workerPath = path.join(__dirname, "..", "boinya-c", "proxy", "worker.js");
const workerSrc = fs.readFileSync(workerPath, "utf8");

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

if (!/PARTNER_MANUAL_ACCESS_EXCLUDE_NETS/.test(workerSrc)) {
  fail("PARTNER_MANUAL_ACCESS_EXCLUDE_NETS missing");
}

const pointsAssign = extractConstAssign_(workerSrc, "PARTNER_MANUAL_ACCESS_POINTS");
if (!/PARTNER_MANUAL_ACCESS_POINTS = \[\]/.test(pointsAssign.replace(/\s+/g, " "))) {
  fail("PARTNER_MANUAL_ACCESS_POINTS must be empty (all-except, not allowlist)");
}

const excludeAssign = extractConstAssign_(workerSrc, "PARTNER_MANUAL_ACCESS_EXCLUDE_NETS");
if (!/net_varka/.test(excludeAssign)) {
  fail("PARTNER_MANUAL_ACCESS_EXCLUDE_NETS must include net_varka");
}

if (/manual_varka_only/.test(extractFn_(workerSrc, "partnerOwnerAllGetMe_"))) {
  fail("partnerOwnerAllGetMe_ still uses manual_varka_only");
}

const submitSlice = workerSrc.slice(
  workerSrc.indexOf("if (/^partnerSubmitOrder$/i.test(a))"),
  workerSrc.indexOf("if (/^partnerSubmitOrder$/i.test(a))") + 4500
);
if (!/partnerIsExcludedPoint_/.test(submitSlice)) {
  fail("partnerSubmitOrder must reject excluded points");
}

const blockFn = extractFn_(workerSrc, "partnerBlockWrongPoint_");
if (!/isPartnerOwnerAllUser_/.test(blockFn) || !/partnerIsExcludedPoint_/.test(blockFn)) {
  fail("partnerBlockWrongPoint_ must forbid owner-all excluded points");
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
    extractFn_(workerSrc, "partnerNormUserWorker_"),
    extractFn_(workerSrc, "isPartnerLiveTestUser_"),
    extractFn_(workerSrc, "isPartnerManualAccessUser_"),
    extractFn_(workerSrc, "isPartnerInspectLocaUser_"),
    extractFn_(workerSrc, "partnerInspectWantLoca_"),
    extractFn_(workerSrc, "isPartnerOwnerAllUser_"),
    extractFn_(workerSrc, "partnerManualAllowedPointId_"),
    extractFn_(workerSrc, "partnerExcludeNets_"),
    extractFn_(workerSrc, "partnerIsExcludedNet_"),
    extractFn_(workerSrc, "partnerIsExcludedPoint_"),
    extractFn_(workerSrc, "partnerOwnerAllOverrideKey_"),
    extractFn_(workerSrc, "partnerOwnerAllGetMe_"),
    extractFn_(workerSrc, "partnerBlockWrongPoint_"),
    extractFn_(workerSrc, "isPartnerArseniy_"),
    extractFn_(workerSrc, "partnerGuardOrRewrite_")
  ].join("\n"),
  sandbox
);

const tidParams = { username: "one_more_person_228", telegramId: "827494606" };
if (sandbox.isPartnerManualAccessUser_(tidParams)) {
  fail("manual allowlist must be off for this tid");
}
if (!sandbox.isPartnerOwnerAllUser_(tidParams)) {
  fail("tid must be owner-all (except nets)");
}
if (sandbox.isPartnerOwnerAllUser_({ username: "someone_else", telegramId: "1" })) {
  fail("other users must not get owner-all override");
}

const cases = [
  ["pt_varka_repina_4", "net_varka", true],
  ["pt_varka_mayakovskogo_14", "", true],
  ["pt_varka_brand_new_99", "net_varka", true],
  ["pt_nan_1", "net_nan", false],
  ["pt_fundog_1", "net_fundog", false],
  ["pt_polotno_1", "net_polotno", false],
  ["pt_indix_1", "net_indixvost", false],
  ["pt_bob_1", "net_bobwow", false],
  ["pt_future_clinic_2", "net_newpartner", false]
];
for (let i = 0; i < cases.length; i++) {
  const got = sandbox.partnerIsExcludedPoint_(cases[i][0], cases[i][1]);
  if (got !== cases[i][2]) {
    fail("exclude " + cases[i][0] + "/" + cases[i][1] + " got " + got + " want " + cases[i][2]);
  }
}

if (sandbox.partnerOwnerAllOverrideKey_() !== "owner_all_except_net_varka") {
  fail("override key want owner_all_except_net_varka got " + sandbox.partnerOwnerAllOverrideKey_());
}

const me = sandbox.partnerOwnerAllGetMe_({
  status: "success",
  networks: [
    { id: "net_varka", name: "Varka" },
    { id: "net_nan", name: "NaN clinic" },
    { id: "net_fundog", name: "Fundog" },
    { id: "net_polotno", name: "Polotno" },
    { id: "net_indixvost", name: "Indixvost" },
    { id: "net_bobwow", name: "BOW Wow Collar" }
  ],
  points: [
    { id: "pt_varka_repina_4", networkId: "net_varka", name: "Varka Репина 4", active: true },
    { id: "pt_varka_new_future", networkId: "net_varka", name: "Varka future", active: true },
    { id: "pt_nan_1", networkId: "net_nan", name: "nan_animal_clinic", address: "ул. Янковского, 34", active: true },
    { id: "pt_fundog_1", networkId: "net_fundog", name: "Fundog", active: true },
    { id: "pt_polotno_1", networkId: "net_polotno", name: "old", active: true },
    { id: "pt_indix_1", networkId: "net_indixvost", name: "old", active: true },
    { id: "pt_bob_1", networkId: "net_bobwow", name: "bow_wow_collar", active: true }
  ]
});

if (me.partnerOverride !== "owner_all_except_net_varka") {
  fail("getMe override " + me.partnerOverride);
}
const pointIds = (me.points || []).map(function (p) { return p.id; });
const netIds = (me.networks || []).map(function (n) { return n.id; });
if (pointIds.some(function (id) { return /^pt_varka_/.test(id); })) {
  fail("getMe still lists Varka points: " + pointIds.join(","));
}
if (netIds.indexOf("net_varka") >= 0) {
  fail("getMe still lists net_varka");
}
["pt_nan_1", "pt_fundog_1", "pt_polotno_1", "pt_indix_1", "pt_bob_1"].forEach(function (id) {
  if (pointIds.indexOf(id) < 0) fail("getMe missing allowed point " + id);
});
["net_nan", "net_fundog", "net_polotno", "net_indixvost", "net_bobwow"].forEach(function (id) {
  if (netIds.indexOf(id) < 0) fail("getMe missing allowed net " + id);
});
if (me.points.filter(function (p) { return p.id === "pt_polotno_1"; })[0].name !== "polotno_an") {
  fail("getMe should keep polotno rename");
}
if (!me.canPickInspectLoca) {
  fail("getMe must set canPickInspectLoca for inspect allowlist tid");
}

const blockedVarka = sandbox.partnerBlockWrongPoint_("partnerSubmitOrder", {
  username: "one_more_person_228",
  telegramId: "827494606",
  locationId: "pt_varka_repina_4",
  networkId: "net_varka"
});
if (!blockedVarka || blockedVarka.message !== "forbidden_point") {
  fail("submit Varka must be forbidden_point, got " + JSON.stringify(blockedVarka));
}

const blockedPrefix = sandbox.partnerBlockWrongPoint_("partnerSubmitOrder", {
  username: "one_more_person_228",
  telegramId: "827494606",
  locationId: "pt_varka_brand_new_99"
});
if (!blockedPrefix || blockedPrefix.message !== "forbidden_point") {
  fail("submit pt_varka_* without net must be forbidden");
}

const allowedNan = sandbox.partnerBlockWrongPoint_("partnerSubmitOrder", {
  username: "one_more_person_228",
  telegramId: "827494606",
  locationId: "pt_nan_1",
  networkId: "net_nan"
});
if (allowedNan) fail("submit NaN must pass block, got " + JSON.stringify(allowedNan));

const listed = sandbox.partnerGuardOrRewrite_("partnerListMyOrders", tidParams, {
  status: "success",
  orders: [
    { id: "a", locationId: "pt_varka_repina_4", networkId: "net_varka" },
    { id: "b", locationId: "pt_nan_1", networkId: "net_nan" },
    { id: "c", locationId: "pt_bob_1", networkId: "net_bobwow" }
  ]
});
const listedIds = (listed.orders || []).map(function (o) { return o.id; });
if (listedIds.indexOf("a") >= 0) fail("list still shows Varka order");
if (listedIds.indexOf("b") < 0 || listedIds.indexOf("c") < 0) {
  fail("list dropped allowed orders: " + listedIds.join(","));
}

if (!sandbox.isPartnerInspectLocaUser_(tidParams)) {
  fail("tid must be inspect-loca allowlist");
}
if (sandbox.isPartnerInspectLocaUser_({ username: "someone_else", telegramId: "1" })) {
  fail("other users must not get inspect-loca picker");
}
if (sandbox.partnerInspectWantLoca_({
  username: "one_more_person_228",
  telegramId: "827494606",
  locationId: "pt_varka_repina_4",
  networkId: "net_varka"
})) {
  fail("inspect want must not return Varka location");
}
if (sandbox.partnerInspectWantLoca_({
  username: "one_more_person_228",
  telegramId: "827494606",
  locationId: "pt_fundog_1",
  networkId: "net_fundog"
}) !== "pt_fundog_1") {
  fail("inspect want must keep allowed location");
}

const listedFundog = sandbox.partnerGuardOrRewrite_("partnerListMyOrders", {
  username: "one_more_person_228",
  telegramId: "827494606",
  locationId: "pt_fundog_1"
}, {
  status: "success",
  orders: [
    { id: "a", locationId: "pt_varka_repina_4", networkId: "net_varka" },
    { id: "b", locationId: "pt_nan_1", networkId: "net_nan" },
    { id: "c", locationId: "pt_fundog_1", networkId: "net_fundog" }
  ]
});
const fundogIds = (listedFundog.orders || []).map(function (o) { return o.id; });
if (fundogIds.join(",") !== "c") {
  fail("inspect locationId must keep only Fundog, got " + fundogIds.join(","));
}

const listedVarkaWant = sandbox.partnerGuardOrRewrite_("partnerListMyOrders", {
  username: "one_more_person_228",
  telegramId: "827494606",
  locationId: "pt_varka_repina_4",
  networkId: "net_varka"
}, {
  status: "success",
  orders: [
    { id: "a", locationId: "pt_varka_repina_4", networkId: "net_varka" },
    { id: "b", locationId: "pt_nan_1", networkId: "net_nan" }
  ]
});
if ((listedVarkaWant.orders || []).some(function (o) { return o.id === "a"; })) {
  fail("inspect Varka locationId must not leak Varka orders");
}

if (/PARTNER_BOT_TOKEN/.test(extractFn_(workerSrc, "partnerOwnerAllGetMe_"))) {
  fail("do not touch PARTNER_BOT_TOKEN from this change");
}

console.log("OK: owner-all except net_varka");
console.log("  points:", pointIds.join(", "));
console.log("  nets:", netIds.join(", "));
console.log("  override:", me.partnerOverride);
