#!/usr/bin/env node
/**
 * partnerListAdmin живёт только в D1.
 * Пустой снап не пересобирается из Sheets и не сбрасывает paidConsent.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");

function fail(msg) {
  console.error("FAIL", msg);
  process.exit(1);
}

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) fail("missing " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  fail("unclosed " + name);
}

if (/gasProxy_\(\s*"partnerListAdmin"/.test(worker)) fail("worker must not rebuild partnerListAdmin from GAS");
const ensure = extractFn(worker, "ensurePartnerAdminSnap_");
if (ensure.indexOf("gasProxy_") >= 0 || ensure.indexOf("putSnap_") >= 0) {
  fail("missing snap must not call Sheets or write a replacement");
}
const listFn = extractFn(worker, "partnerListAdminD1_");
if (listFn.indexOf("gasProxy_") >= 0) fail("partnerListAdmin read must stay on D1");
const putGas = extractFn(worker, "putPartnerAdminFromGas_");
if (putGas.indexOf("putSnap_") >= 0) fail("GAS admin payload must not be stored");
const migAt = worker.indexOf("if (/^partnerMigrateVarkaConsent$/i.test(a))");
const mig = worker.slice(migAt, worker.indexOf("if (/^partnerSetPointConsent$/i.test(a))", migAt));
if (/paidConsent:\s*"pending"/.test(mig)) fail("migrate must not downgrade consent to pending");
const textSend = extractFn(worker, "telegramSendTextWorker_");
const partnerSend = extractFn(worker, "telegramSendPartnerBot_");
["ok:", "error_code:", "description:"].forEach(function (bit) {
  if (textSend.indexOf(bit) < 0) fail("telegramSendTextWorker_ must log " + bit);
  if (partnerSend.indexOf(bit) < 0) fail("telegramSendPartnerBot_ must log " + bit);
});
const hook = extractFn(worker, "handleGoodboyTelegramWebhook_");
if (hook.indexOf("admin = admin ||") >= 0) fail("missing admin snap must not become an empty catalog");
if (hook.indexOf("partnerAdminSnapOk_") < 0) fail("webhook must refuse to write a missing admin snap");

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  extractFn(worker, "partnerNormalizeConsent_") + "\n" +
  extractFn(worker, "partnerBroadcastChoiceNorm_") + "\n" +
  extractFn(worker, "partnerAdminSnapOk_") + "\n" +
  extractFn(worker, "partnerAdminSheetsRebuildPlan_") + "\n" +
  extractFn(worker, "partnerPointsWithBroadcastConsent_") + "\n" +
  "globalThis.missing = partnerAdminSheetsRebuildPlan_(null);\n" +
  "globalThis.broken = partnerAdminSheetsRebuildPlan_({ status: 'error', points: [{ id: 'pt_varka_1', paidConsent: 'accepted' }] });\n" +
  "globalThis.valid = partnerAdminSheetsRebuildPlan_({ status: 'success', networks: [], points: [] });\n" +
  "var kept = [{ id: 'pt_varka_repina_4', paidConsent: 'accepted', paidConsentAt: 10 }, { id: 'pt_varka_avia_17', paidConsent: 'declined', paidConsentAt: 9 }];\n" +
  "globalThis.noRows = partnerPointsWithBroadcastConsent_(kept, null);\n" +
  "globalThis.emptyRows = partnerPointsWithBroadcastConsent_(kept, []);\n" +
  "globalThis.fromReply = partnerPointsWithBroadcastConsent_(\n" +
  "  [{ id: 'pt_varka_mayakovskogo_14', paidConsent: 'pending', paidConsentAt: 1 }],\n" +
  "  [{ pointId: 'pt_varka_mayakovskogo_14', choice: 'paid', createdAt: '2026-10-14T14:00:00Z', broadcastId: 'varka-paid-2026-10' }]\n" +
  ");\n",
  sandbox
);

if (sandbox.missing.write !== false || sandbox.missing.consentsReset !== false || sandbox.missing.reason !== "snap_missing") {
  fail("missing snap must refuse rebuild " + JSON.stringify(sandbox.missing));
}
if (sandbox.broken.write !== false || sandbox.broken.consentsReset !== false) {
  fail("invalid snap must refuse rebuild");
}
if (sandbox.valid.write !== false || sandbox.valid.reason !== "sheets_rebuild_disabled") {
  fail("valid snap still must not be rebuilt from sheets");
}
if (sandbox.noRows[0].paidConsent !== "accepted" || sandbox.noRows[1].paidConsent !== "declined") {
  fail("missing replies must not reset consents");
}
if (sandbox.emptyRows[0].paidConsent !== "accepted" || sandbox.emptyRows[1].paidConsentAt !== 9) {
  fail("empty replies must not reset consents");
}
if (sandbox.fromReply[0].paidConsent !== "accepted") fail("broadcast reply is the consent source");

console.log("OK partner admin is D1 only");
