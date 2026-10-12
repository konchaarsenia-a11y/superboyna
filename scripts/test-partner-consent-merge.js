#!/usr/bin/env node
/**
 * D1 paidConsent не затирается pending из Sheets при partnerMergeAdminKeepD1Access_.
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
const gas = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
const toml = fs.readFileSync(path.join(root, "boinya-c/proxy/wrangler.toml"), "utf8");

function fail(msg) {
  console.error("FAIL", msg);
  process.exit(1);
}

function extractFn(src, name) {
  const re = new RegExp("function\\s+" + name + "\\s*\\(");
  const m = re.exec(src);
  if (!m) fail("missing " + name);
  let i = src.indexOf("{", m.index);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      i = src.indexOf("\n", i);
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(m.index, i + 1);
    }
  }
  fail("unclosed " + name);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  extractFn(worker, "partnerMergeAdminKeepD1Access_") + "\n" +
  "globalThis.kept = partnerMergeAdminKeepD1Access_(\n" +
  "  { access: [{ id: 'pa1', status: 'revoked' }], _d1TouchedAt: 50, points: [\n" +
  "    { id: 'pt_varka_repina_4', name: 'old', paidConsent: 'accepted', paidConsentAt: 10 },\n" +
  "    { id: 'pt_varka_avia_17', name: 'old2', paidConsent: 'declined', paidConsentAt: 9 }\n" +
  "  ]},\n" +
  "  { status: 'success', access: [{ id: 'pa1', status: 'active' }], points: [\n" +
  "    { id: 'pt_varka_repina_4', name: 'Репина', address: 'Репина 4', paidConsent: 'pending' },\n" +
  "    { id: 'pt_varka_avia_17', name: 'Авиа', paidConsent: 'pending', paidConsentAt: 1 },\n" +
  "    { id: 'pt_nan_1', name: 'nan', paidConsent: 'pending' }\n" +
  "  ]}\n" +
  ");\n" +
  "globalThis.newer = partnerMergeAdminKeepD1Access_(\n" +
  "  { points: [{ id: 'pt_varka_repina_4', paidConsent: 'pending', paidConsentAt: 20 }] },\n" +
  "  { points: [{ id: 'pt_varka_repina_4', name: 'Репина', paidConsent: 'accepted', paidConsentAt: 5 }] }\n" +
  ");\n" +
  "globalThis.sheetsWin = partnerMergeAdminKeepD1Access_(\n" +
  "  { points: [{ id: 'pt_varka_repina_4', paidConsent: 'pending', paidConsentAt: 1 }] },\n" +
  "  { points: [{ id: 'pt_varka_repina_4', name: 'Репина', paidConsent: 'accepted', paidConsentAt: 8 }] }\n" +
  ");\n",
  sandbox
);

const kept = sandbox.kept;
if (!kept.access || kept.access[0].status !== "revoked") fail("D1 access must stay when _d1TouchedAt is set");
const heart = kept.points.filter(function (p) { return p.id === "pt_varka_repina_4"; })[0];
const lung = kept.points.filter(function (p) { return p.id === "pt_varka_avia_17"; })[0];
const nan = kept.points.filter(function (p) { return p.id === "pt_nan_1"; })[0];
if (!heart || heart.paidConsent !== "accepted" || heart.paidConsentAt !== 10) fail("accepted D1 consent must beat sheets pending");
if (heart.name !== "Репина" || heart.address !== "Репина 4") fail("non-consent fields stay from the sheet");
if (!lung || lung.paidConsent !== "declined" || lung.paidConsentAt !== 9) fail("declined D1 consent must beat sheets pending");
if (!nan || nan.paidConsent !== "pending") fail("point missing in D1 keeps the sheet consent");
const newer = sandbox.newer.points[0];
if (!newer || newer.paidConsent !== "pending" || newer.paidConsentAt !== 20) fail("newer D1 consent timestamp must win");
if (newer.name !== "Репина") fail("newer merge still keeps sheet name");
const sheetsWin = sandbox.sheetsWin.points[0];
if (!sheetsWin || sheetsWin.paidConsent !== "accepted" || sheetsWin.paidConsentAt !== 8) fail("newer sheet consent must win over older pending");

const hookAt = worker.indexOf("partnerBroadcastCallback");
if (hookAt < 0) fail("webhook must call partnerBroadcastCallback");
const hook = worker.slice(worker.indexOf("async function handleGoodboyTelegramWebhook_"), worker.indexOf("function partnerBasketLinesWorker_"));
if (hook.indexOf(".catch(function () { return null; })") >= 0) fail("callback mirror must not swallow the result");
if (hook.indexOf('console.log("partnerBroadcastCallback"') < 0) fail("callback result must be logged");
if (hook.indexOf('console.log("varka broadcast reply"') < 0) fail("thank-you sendMessage must be logged");
if (hook.indexOf('gasProxy_("partnerSetPointConsent"') < 0) fail("click must fall back to partnerSetPointConsent");
if (!/if \(_gasSecret\) clean\._wk = _gasSecret;/.test(worker)) fail("gasProxy_ must set the Worker marker");
const setFn = extractFn(gas, "partnerSetVarkaConsentForRecipient_");
if (setFn.indexOf("ensureSheetHeadersAppend_") < 0 || setFn.indexOf("setValue(consent)") < 0) {
  fail("GAS must create paidConsent column and write it");
}
if (!/\[observability\]\s*\nenabled = true/.test(toml)) fail("worker observability must be enabled");

console.log("OK partner consent merge");
