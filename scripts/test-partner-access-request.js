#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function extractFn_(src, name) {
  const start = src.indexOf("function " + name);
  if (start < 0) fail("missing " + name);
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
  if (end < 0) fail("unclosed " + name);
  return src.slice(start, end);
}

const worker = fs.readFileSync(path.join(__dirname, "../boinya-c/proxy/worker.js"), "utf8");
const src = extractFn_(worker, "partnerAccessRequestGate_");
const gate = vm.runInNewContext(src + "\npartnerAccessRequestGate_;");
const day = "2026-10-12T10:00:00.000Z";
const rows = [
  { id: "a", telegramId: "1", createdAt: "2026-10-12T01:00:00.000Z", status: "rejected" },
  { id: "b", telegramId: "1", createdAt: "2026-10-12T02:00:00.000Z", status: "rejected" },
  { id: "c", telegramId: "2", createdAt: "2026-10-11T02:00:00.000Z", status: "new" }
];
const open = gate(rows.concat([{ id: "d", telegramId: "1", createdAt: day, status: "new" }]), "1", day);
if (!open.open || open.open.id !== "d") fail("open request must dedupe");
const almost = gate(rows, "1", day);
if (almost.today !== 2 || almost.limited) fail("two today is still allowed");
const full = gate(rows.concat([{ id: "e", telegramId: "1", createdAt: day, status: "approved" }]), "1", day);
if (!full.limited || full.open) fail("third closed request of the day blocks");
const other = gate(rows, "9", day);
if (other.today !== 0 || other.limited || other.open) fail("other tid is free");

const partners = fs.readFileSync(path.join(__dirname, "../boinya-c/next/partners.js"), "utf8");
if (/Платит себестоимость/.test(partners)) fail("pays-cost label must leave the partners UI");
if (!/Запросы на подключение/.test(partners)) fail("orders tab must list access requests");
if (!/ph-card-save/.test(partners)) fail("point card save missing");
const orders = fs.readFileSync(path.join(__dirname, "../boinya-c/next/orders.js"), "utf8");
if (!/partnerListAdmin/.test(orders)) fail("BP source must come from points");
const varka = fs.readFileSync(path.join(__dirname, "../varka/app.html"), "utf8");
if (!/Подключить точку/.test(varka) || !/partnerAccessRequestCreate/.test(varka)) fail("varka request form missing");
if (!/Чтобы подключить свою точку/.test(worker)) fail("bot /start copy missing");
if (!/partner_access_request/.test(worker)) fail("notify key missing");

console.log("OK: access request gate, two-tab hub, no pays-cost UI");
