#!/usr/bin/env node
/**
 * Заказы → вкладка «Доступы» (peopleScreen), не Партнёры→Люди #phAccessList.
 * setAccessRole шлёт targetId; deletePartner должен сразу снять строку;
 * savePartner — сразу в listPartners snap.
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
  let start = src.indexOf("async function " + name);
  if (start < 0) start = src.indexOf("function " + name);
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

const workerPath = path.join(__dirname, "..", "boinya-c", "proxy", "worker.js");
const uiPath = path.join(__dirname, "..", "boinya-c", "app.main.js");
const htmlPath = path.join(__dirname, "..", "boinya-c", "app.html");
const gsPath = path.join(__dirname, "..", "Code.gs");
const workerSrc = fs.readFileSync(workerPath, "utf8");
const uiSrc = fs.readFileSync(uiPath, "utf8");
const htmlSrc = fs.readFileSync(htmlPath, "utf8");
const gsSrc = fs.readFileSync(gsPath, "utf8");

if (htmlSrc.indexOf('id="peopleScreen"') < 0 || htmlSrc.indexOf('id="peopleContainer"') < 0) {
  fail("orders Access tab is #peopleScreen / #peopleContainer");
}
if (htmlSrc.indexOf('id="partnersContainer"') < 0 || htmlSrc.indexOf("savePartnerFromUi()") < 0) {
  fail("BP partners on Access tab must stay on peopleScreen");
}

if (!/params\.targetId \|\| params\.telegramId \|\| params\.id/.test(workerSrc)) {
  fail("mutateAccess_ must resolve targetId from UI setAccessRole");
}
if (!/function accessStatusFromRole_/.test(workerSrc)) {
  fail("denied role must set status=denied in D1");
}
if (workerSrc.indexOf('if (/^(savePartner|deletePartner)$/i.test(a))') < 0) {
  fail("cutover must D1-write savePartner/deletePartner before GAS");
}
if (!/function mutatePartners_/.test(workerSrc) || !/list\._deletedIds/.test(workerSrc)) {
  fail("deletePartner must tombstone ids so GAS list cannot resurrect");
}
if (workerSrc.indexOf("prevP._d1TouchedAt") < 0 || workerSrc.indexOf("payload._deletedIds") < 0) {
  fail("storeRead must protect listPartners snap after D1 touch");
}

const delGs = gsSrc.slice(gsSrc.indexOf("function handleDeletePartner"));
if (delGs.indexOf("deleteRow") < 0) {
  fail("GAS deletePartner must remove the row, not only active=no");
}
if (delGs.indexOf("soft-delete") >= 0) {
  fail("GAS deletePartner must not stay soft-delete (Удалить ≠ Выключить)");
}

const peopleUi = uiSrc.slice(uiSrc.indexOf("function paintPeopleList_"), uiSrc.indexOf("async function loadPeople"));
if (peopleUi.indexOf("revokeAccessUi_") < 0) {
  fail("Access cards must have ✕ revoke on peopleScreen");
}

const assignUi = uiSrc.slice(uiSrc.indexOf("async function assignRole"), uiSrc.indexOf("async function revokeAccessUi_"));
if (assignUi.indexOf("applyPeopleRoleLocal_") < 0 || assignUi.indexOf("applyPeopleRoleLocal_") > assignUi.indexOf("apiPost")) {
  fail("assignRole must optimistic-paint before mutate");
}
if (assignUi.indexOf("targetId: targetId") < 0) {
  fail("assignRole must send targetId (Worker D1 key)");
}
if (assignUi.indexOf("keepPaint") < 0) {
  fail("assignRole reload must keepPaint so list does not flash empty");
}

const saveUi = uiSrc.slice(uiSrc.indexOf("async function savePartnerFromUi"), uiSrc.indexOf("async function togglePartnerActive_"));
if (saveUi.indexOf("paintPartnersList_") < 0 || saveUi.indexOf("paintPartnersList_") > saveUi.indexOf("apiGet")) {
  fail("savePartner must optimistic-insert before mutate");
}

const delUi = uiSrc.slice(uiSrc.indexOf("async function deletePartnerUi_"), uiSrc.indexOf("window.savePartnerFromUi"));
if (delUi.indexOf("paintPartnersList_") < 0 || delUi.indexOf("paintPartnersList_") > delUi.indexOf("apiGet")) {
  fail("deletePartner must drop row before mutate");
}
if (delUi.indexOf("resD.status") < 0) {
  fail("deletePartner must check API status");
}

const snaps = Object.create(null);
const sandbox = {
  snaps: snaps,
  Date: Date,
  Math: Math,
  Object: Object,
  String: String,
  Array: Array,
  Number: Number,
  console: console
};
sandbox.getSnapRaw_ = async function (env, key) {
  return snaps[key] ? JSON.parse(JSON.stringify(snaps[key])) : null;
};
sandbox.putSnap_ = async function (env, key, val) {
  snaps[key] = JSON.parse(JSON.stringify(val));
};
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFn_(workerSrc, "accessStatusFromRole_"),
    extractFn_(workerSrc, "partnerRowPaysCost_"),
    extractFn_(workerSrc, "partnerRowActive_"),
    extractFn_(workerSrc, "partnerRowMatchId_"),
    extractFn_(workerSrc, "mutateAccess_"),
    extractFn_(workerSrc, "mutatePartners_")
  ].join("\n"),
  sandbox
);

async function main() {
  snaps.listAccess = {
    status: "success",
    people: [
      { telegramId: "111", name: "Owner", role: "owner", status: "active" },
      { telegramId: "222", name: "Courier", role: "courier", status: "active", username: "c_two" }
    ]
  };

  const denied = await sandbox.mutateAccess_(
    "setAccessRole",
    { targetId: "222", actorId: "111", telegramId: "111", role: "denied" },
    {}
  );
  if (!denied || denied.status !== "success") fail("setAccessRole targetId must succeed");
  const afterDeny = snaps.listAccess.people.find(function (p) {
    return String(p.telegramId) === "222";
  });
  if (!afterDeny || afterDeny.role !== "denied" || afterDeny.status !== "denied") {
    fail("revoke via targetId must set role+status denied, got " + JSON.stringify(afterDeny));
  }
  const owner = snaps.listAccess.people.find(function (p) {
    return String(p.telegramId) === "111";
  });
  if (!owner || owner.role !== "owner") {
    fail("actor telegramId must not overwrite owner row");
  }
  if (!Array.isArray(denied.people) || denied.people.length !== 2) {
    fail("setAccessRole must return people[] for immediate paint");
  }

  const granted = await sandbox.mutateAccess_(
    "setAccessRole",
    { targetId: "333", role: "manager", name: "New" },
    {}
  );
  if (!granted.people.some(function (p) { return String(p.telegramId) === "333" && p.role === "manager"; })) {
    fail("grant missing person via targetId must insert immediately");
  }

  snaps.listPartners = {
    status: "success",
    partners: [
      { id: "p_keep", name: "Keep", note: "", active: true, paysCost: false },
      { id: "p_gone", name: "Gone", note: "x", active: true, paysCost: false }
    ]
  };
  const del = await sandbox.mutatePartners_("deletePartner", { id: "p_gone", name: "Gone" }, {});
  if (!del.deleted || del.partners.some(function (p) { return p.id === "p_gone"; })) {
    fail("deletePartner must drop row from snap immediately");
  }
  if (!snaps.listPartners._deletedIds || snaps.listPartners._deletedIds.indexOf("p_gone") < 0) {
    fail("deletePartner must record _deletedIds");
  }
  if (!snaps.listPartners._d1TouchedAt) fail("deletePartner must stamp _d1TouchedAt");

  const add = await sandbox.mutatePartners_(
    "savePartner",
    { name: "Fresh", note: "bp", paysCost: "yes", active: "yes" },
    {}
  );
  if (!add.id || !add.partners.some(function (p) { return p.name === "Fresh" && p.paysCost === true; })) {
    fail("savePartner must insert named row with paysCost immediately");
  }
  if (!add.d1Verified) fail("savePartner must d1Verified");

  console.log("OK orders-access-tab");
  console.log("  peopleScreen setAccessRole targetId → denied");
  console.log("  savePartner/deletePartner D1 snap immediate + tombstone");
}

main().catch(function (e) {
  fail(String((e && e.stack) || e));
});
