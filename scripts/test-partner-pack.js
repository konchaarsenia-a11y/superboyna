#!/usr/bin/env node
/**
 * Partner pack 3.3.45: slot 19:00–22:00, wipe action guards, coupon qty no-custom,
 * treats off for polotno/indix/bow, nan banner, points list names-only.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const workerSrc = fs.readFileSync(path.join(root, "boinya-c", "proxy", "worker.js"), "utf8");
const gasSrc = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
const varkaSrc = fs.readFileSync(path.join(root, "varka", "app.html"), "utf8");
const varokSrc = fs.readFileSync(path.join(root, "VAROK.md"), "utf8");
const boinyaMain = fs.readFileSync(path.join(root, "boinya-c", "app.main.js"), "utf8");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function extractFn_(src, name) {
  let start = src.indexOf("function " + name);
  if (start < 0) start = src.indexOf("async function " + name);
  if (start < 0) fail("fn " + name + " not found");
  let i = src.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
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

// --- slot 19:00 ---
const slotW = extractFn_(workerSrc, "partnerDefaultSlotWorker_");
if (!/timeFrom:\s*"19:00"/.test(slotW) || !/timeLabel:\s*"19:00–22:00"/.test(slotW)) {
  fail("partnerDefaultSlotWorker_ must default 19:00–22:00");
}
if (/timeFrom:\s*"12:00"/.test(slotW) || /12:00–22:00/.test(slotW)) {
  fail("partnerDefaultSlotWorker_ still has 12:00");
}

const slotG = extractFn_(gasSrc, "partnerDefaultSlot_");
if (!/timeFrom:\s*"19:00"/.test(slotG) || !/с 19:00 до 22:00/.test(slotG)) {
  fail("partnerDefaultSlot_ must default с 19:00 до 22:00");
}

if (!/deliverTimeFrom:\s*"19:00"/.test(boinyaMain)) {
  fail("Boinya partnerAssignSlotUi_ must send deliverTimeFrom 19:00");
}

if (!/params\.deliverTimeFrom\) \|\| "19:00"/.test(workerSrc)) {
  fail("partnerSetOrderSlot Worker default timeFrom must be 19:00");
}

if (!/19:00–22:00/.test(varokSrc)) fail("VAROK.md must document 19:00–22:00");

// --- wipe ---
if (!/partnerWipeOrderHistories/.test(workerSrc)) fail("Worker missing partnerWipeOrderHistories");
if (!/handlePartnerWipeOrderHistories/.test(gasSrc)) fail("GAS missing handlePartnerWipeOrderHistories");
if (!/confirmWipe !== "WIPE_ALL"/.test(workerSrc) && !/confirmWipe !== "WIPE_ALL"/.test(extractFn_(workerSrc, "mutatePartnerD1_"))) {
  fail("Worker wipe must require confirm=WIPE_ALL");
}
if (!/confirmWipe !== "WIPE_ALL"/.test(extractFn_(gasSrc, "handlePartnerWipeOrderHistories"))) {
  fail("GAS wipe must require confirm=WIPE_ALL");
}
if (!/actorIsOwnerRetail_/.test(workerSrc) || !/partnerWipeOrderHistories[\s\S]{0,400}ownerOkWipe/.test(workerSrc)) {
  fail("Worker wipe must check owner");
}
if (!/partnerRequireOwner_/.test(extractFn_(gasSrc, "handlePartnerWipeOrderHistories"))) {
  fail("GAS wipe must require owner");
}
if (!/_wipeEmpty/.test(workerSrc)) fail("Worker wipe must set _wipeEmpty to block GAS resurrect");

const wipeScript = fs.readFileSync(path.join(root, "scripts", "wipe-partner-order-histories.sh"), "utf8");
if (!/CONFIRM=WIPE_ALL/.test(wipeScript) || !/partnerWipeOrderHistories/.test(wipeScript)) {
  fail("wipe script missing action or confirm docs");
}

// --- varka UI ---
if (!/APP_VER = "3.3.45"/.test(varkaSrc)) fail("varka APP_VER must be 3.3.45");
if (!/vr_c_piece: \{ presets: \[48, 73, 96, 120\], unit: "шт", custom: false \}/.test(varkaSrc)) {
  fail("coupon qty must be presets-only (custom: false)");
}
if (!/hasTreats: false/.test(varkaSrc)) fail("polotno/indix/bow must set hasTreats: false");
["net_polotno", "net_indixvost", "net_bobwow"].forEach(function (nid) {
  const block = varkaSrc.match(new RegExp(nid + ": \\{[\\s\\S]*?\\n    \\}"));
  if (!block || !/hasTreats:\s*false/.test(block[0])) fail(nid + " missing hasTreats: false");
});
if (!/net_nan:[\s\S]{0,180}hasBanner:\s*false/.test(varkaSrc)) fail("net_nan banner must stay off (deferred)");
if (/net_nan:[\s\S]{0,180}hasBanner:\s*true/.test(varkaSrc)) fail("net_nan must not enable hasBanner in this PR");
if (!/<div class="title">Баннер<\/div>/.test(varkaSrc)) fail("banner card must show title Баннер");
if (/addr && addr !== title/.test(varkaSrc)) fail("points list still renders address under name");
if (!/networkHasTreats_/.test(varkaSrc)) fail("missing networkHasTreats_");

console.log("OK: partner pack slot 19:00, wipe guards, varka 3.3.45 UI rules");
