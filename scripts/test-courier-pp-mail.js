#!/usr/bin/env node
/**
 * Курьер: ПП2 смотрит оплату ПП1; почта — трек без вопроса об оплате.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

let failed = 0;
function ok(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  } else {
    console.log("  ok", msg);
  }
}

function extractFn_(src, name) {
  let start = src.indexOf("async function " + name + "(");
  if (start < 0) start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("fn " + name + " not found");
  let i = src.indexOf("{", src.indexOf(")", start));
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unterminated " + name);
}

const ROOT = path.join(__dirname, "..");
const workerSrc = fs.readFileSync(path.join(ROOT, "boinya-c/proxy/worker.js"), "utf8");
const gsSrc = fs.readFileSync(path.join(ROOT, "Code.gs"), "utf8");
const prodSrc = fs.readFileSync(path.join(ROOT, "boinya-c/next/production.js"), "utf8");
const shellSrc = fs.readFileSync(path.join(ROOT, "boinya-c/next/shell.js"), "utf8");

const names = [
  "normPaidFlagD1_",
  "courierMailMethodD1_",
  "courierSlotNumD1_",
  "courierAskPaidDecision_",
  "pickSiblingPpPaid_",
  "mailTrackClientTextD1_",
  "mailPayRemindAtMs_"
];
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(names.map(function (n) { return extractFn_(workerSrc, n); }).join("\n"), sandbox);

const ask = sandbox.courierAskPaidDecision_;
const mail = sandbox.courierMailMethodD1_;
const pick = sandbox.pickSiblingPpPaid_;
const text = sandbox.mailTrackClientTextD1_;
const remind = sandbox.mailPayRemindAtMs_;

ok(ask({ segment: "ПП", deliveriesN: 2, deliverySlot: 2, siblingPaid: "yes", paid: "" }) === false, "ПП1 yes → ПП2 без вопроса");
ok(ask({ segment: "ПП", deliveriesN: 2, ppSlot: "2/2", siblingPaid: "no" }) === true, "ПП1 no → ПП2 спрашивает");
ok(ask({ segment: "ПП", deliveriesN: 2, ppSlot: "2/2", siblingPaid: "" }) === true, "ПП1 пусто → ПП2 спрашивает");
ok(ask({ segment: "ПП", deliveriesN: 1, ppSlot: "1" }) === true, "одна доставка спрашивает");
ok(ask({ segment: "Р", source: "retail" }) === true, "розница спрашивает");
ok(ask({ segment: "БП", source: "bp" }) === false, "БП не спрашивает");
ok(ask({ segment: "ПАРТНЁР", source: "partner" }) === false, "партнёр не спрашивает");
ok(ask({ segment: "ПП", deliveriesN: 2, ppSlot: "2/2", siblingPaid: "yes", ppPaid: true }) === false, "sibling yes не требует ppPaid");
ok(ask({ segment: "ПП", deliveriesN: 2, ppSlot: "1/2", paid: "" }) === true, "ПП1 без отметки спрашивает");
ok(ask({ segment: "ПП", note: "[ЕВРОПОЧТА]", deliveriesN: 1 }) === false, "европочта без вопроса");
ok(ask({ segment: "ПП", deliveryMethod: "bel", deliveriesN: 2, ppSlot: "1/2" }) === false, "белпочта без вопроса");
ok(ask({ segment: "ПП", note: "[КУРЬЕР]", deliveriesN: 1 }) === true, "курьер спрашивает");
ok(mail({ note: "дом [ЕВРОПОЧТА]" }) === "euro", "тег европочты");
ok(mail({ note: "написал европочта без скобок" }) === "", "свободный текст не почта");
ok(mail({ deliveryMethod: "courier" }) === "", "метод courier не почта");

const sib = pick([
  { date_iso: "2026-10-02", slot: 1, paid: "yes" },
  { date_iso: "2026-10-16", slot: 2, paid: "no" },
  { date_iso: "2026-10-16", slot: 1, paid: "no" }
], "2026-10-16");
ok(sib === "yes", "sibling берёт ПП1 другой даты, не слот 2 и не этот день");
ok(pick([{ date_iso: "2026-10-02", slot: 1, paid: "no" }], "2026-10-16") === "no", "sibling no");
ok(pick([{ date_iso: "2026-10-16", slot: 1, paid: "yes" }], "2026-10-16") === "", "тот же день не sibling");

const now = 1_700_000_000_000;
ok(remind(now) === now + 2 * 24 * 60 * 60 * 1000, "напоминание +2 дня");
ok(
  text("BY999") === "Здравствуйте!\nОтправили ваш заказик\nВот трэк код для отслеживания: BY999",
  "текст клиенту"
);

ok(/courierShouldAskPaid\(client\)/.test(prodSrc), "курьер зовёт courierShouldAskPaid");
ok(/askTrackCode\(/.test(prodSrc), "почта открывает askTrackCode");
ok(/body\.phone = client\.phone/.test(prodSrc), "телефон уходит в setDelivered");
ok(/mtrack:/.test(workerSrc), "кнопка mtrack в воркере");
ok(workerSrc.indexOf(text("TRACK")) >= 0 || /Отправили ваш заказик/.test(workerSrc), "текст трека в воркере");
ok(/fulfillMailTrack/.test(workerSrc), "fulfillMailTrack");
ok(/mailPayRemindAtMs_/.test(workerSrc), "напоминание +2 дня в воркере");
ok(/skipAck:\s*"1"/.test(workerSrc), "без немедленного «напоминание поставлено»");
ok(/\^mtrack:/.test(gsSrc), "Code.gs ловит mtrack");
ok(/function handleMailTrackCallback_/.test(gsSrc), "колбэк трека в Code.gs");
ok(/payloadObj\.skipAck/.test(gsSrc), "saveDeferred умеет skipAck");
ok(/track-photo/.test(shellSrc) && /track-paste/.test(shellSrc) && /BarcodeDetector/.test(shellSrc), "поле, буфер и фото");

if (failed) {
  console.error("failed", failed);
  process.exit(1);
}
console.log("courier pp/mail ok");
