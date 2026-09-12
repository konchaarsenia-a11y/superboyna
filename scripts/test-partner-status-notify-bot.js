#!/usr/bin/env node
/**
 * Partner status notify: GOODBOY/PARTNER bot only; never Boinya TELEGRAM token;
 * status push targets only order.telegramId (not notifyRecipients).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const workerPath = path.join(__dirname, "..", "boinya-c", "proxy", "worker.js");
const gasPath = path.join(__dirname, "..", "Code.gs");
const workerSrc = fs.readFileSync(workerPath, "utf8");
const gasSrc = fs.readFileSync(gasPath, "utf8");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function extractFn_(src, name) {
  const start = src.indexOf("function " + name);
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

// --- source guards ---
const tokenFn = extractFn_(workerSrc, "getPartnerBotTokenWorker_");
if (/TELEGRAM_BOT_TOKEN|TELEGRAM_TOKEN/.test(tokenFn)) {
  fail("getPartnerBotTokenWorker_ still falls back to TELEGRAM/Boinya token");
}
if (!/PARTNER_BOT_TOKEN/.test(tokenFn) || !/GOODBOY_BOT_TOKEN/.test(tokenFn)) {
  fail("getPartnerBotTokenWorker_ must read PARTNER_BOT_TOKEN or GOODBOY_BOT_TOKEN");
}

const gasTokenFn = extractFn_(gasSrc, "getPartnerBotToken_");
if (/getTelegramToken_/.test(gasTokenFn)) {
  fail("getPartnerBotToken_ still falls back to getTelegramToken_()");
}
if (/TELEGRAM_BOT_TOKEN/.test(gasTokenFn)) {
  fail("getPartnerBotToken_ still mentions TELEGRAM_BOT_TOKEN");
}

if (!/partnerNotifyStatusFastWorker_/.test(workerSrc)) {
  fail("partnerNotifyStatusFastWorker_ missing in worker.js");
}

const statusNotifyBlock = workerSrc.match(
  /partnerSetOrderStatus[\s\S]{0,400}skipPartnerNotify:\s*"1"/
);
if (!statusNotifyBlock) {
  fail("partnerSetOrderStatus D1 success must pass skipPartnerNotify:1 to GAS");
}

if (!/skipSt[\s\S]{0,80}skipPartnerNotify/.test(gasSrc) &&
    !/skipPartnerNotify[\s\S]{0,200}in_transit/.test(
      extractFn_(gasSrc, "handlePartnerSetOrderStatus")
    )) {
  fail("handlePartnerSetOrderStatus must respect skipPartnerNotify");
}

const statusHandler = extractFn_(gasSrc, "handlePartnerSetOrderStatus");
if (!/skipPartnerNotify/.test(statusHandler)) {
  fail("handlePartnerSetOrderStatus missing skipPartnerNotify");
}

// --- runtime: token helper ---
const getPartnerBotTokenWorker_ = new Function(
  extractFn_(workerSrc, "getPartnerBotTokenWorker_") +
    "\nreturn getPartnerBotTokenWorker_;"
)();

const tokenCases = [
  {
    name: "Boinya TELEGRAM_BOT_TOKEN alone → empty",
    env: { TELEGRAM_BOT_TOKEN: "boinya-secret", TELEGRAM_TOKEN: "also-boinya" },
    want: ""
  },
  {
    name: "PARTNER_BOT_TOKEN wins over Boinya",
    env: { PARTNER_BOT_TOKEN: "partner-secret", TELEGRAM_BOT_TOKEN: "boinya-secret" },
    want: "partner-secret"
  },
  {
    name: "GOODBOY_BOT_TOKEN wins over Boinya",
    env: { GOODBOY_BOT_TOKEN: "goodboy-secret", TELEGRAM_BOT_TOKEN: "boinya-secret" },
    want: "goodboy-secret"
  },
  {
    name: "PARTNER preferred over GOODBOY",
    env: { PARTNER_BOT_TOKEN: "partner-secret", GOODBOY_BOT_TOKEN: "goodboy-secret" },
    want: "partner-secret"
  },
  {
    name: "empty env → empty",
    env: {},
    want: ""
  }
];

for (const c of tokenCases) {
  const got = getPartnerBotTokenWorker_(c.env);
  if (got !== c.want) fail(c.name + " got " + JSON.stringify(got) + " want " + JSON.stringify(c.want));
  if (got && /boinya/i.test(got)) fail(c.name + " leaked Boinya token");
  console.log("OK:", c.name);
}

// --- runtime: status notify targets only order.telegramId ---
const sent = [];
global.fetch = async function (url, opts) {
  sent.push({ url: String(url), body: JSON.parse(opts.body) });
  return { json: async function () { return { ok: true }; } };
};

const helpersSrc =
  extractFn_(workerSrc, "getPartnerBotTokenWorker_") +
  "\n" +
  extractFn_(workerSrc, "telegramSendPartnerBot_") +
  "\n" +
  extractFn_(workerSrc, "partnerBasketLinesWorker_") +
  "\n" +
  extractFn_(workerSrc, "partnerNotifyStatusFastWorker_");
const partnerNotifyStatusFastWorker_ = new Function(
  helpersSrc + "\nreturn partnerNotifyStatusFastWorker_;"
)();

const order = {
  id: "po_test_1",
  telegramId: "111222333",
  locationName: "Varka · Репина 4",
  deliverDateLabel: "понедельник, 14.09",
  deliverTimeLabel: "с 12:00 до 22:00",
  basket: [{ name: "Сердце", qty: 100, unit: "г" }]
};
const env = {
  PARTNER_BOT_TOKEN: "partner-secret",
  TELEGRAM_BOT_TOKEN: "boinya-secret",
  notifyRecipients: [{ telegramId: "999888777" }]
};

async function runNotify() {
  sent.length = 0;
  await partnerNotifyStatusFastWorker_(order, env, "in_transit");
  if (sent.length !== 1) fail("in_transit: expected 1 send, got " + sent.length);
  if (sent[0].body.chat_id !== "111222333") {
    fail("in_transit: chat_id " + sent[0].body.chat_id + " must be order.telegramId");
  }
  if (sent[0].url.indexOf("partner-secret") < 0) fail("in_transit: must use PARTNER_BOT_TOKEN");
  if (sent[0].url.indexOf("boinya-secret") >= 0) fail("in_transit: used Boinya TELEGRAM_BOT_TOKEN");
  if (!/в пути/i.test(sent[0].body.text)) fail("in_transit: wrong copy");
  console.log("OK: in_transit → only tid 111222333 via partner bot");

  sent.length = 0;
  await partnerNotifyStatusFastWorker_(order, env, "delivered");
  if (sent.length !== 1) fail("delivered: expected 1 send, got " + sent.length);
  if (sent[0].body.chat_id !== "111222333") fail("delivered: wrong chat_id");
  if (sent[0].url.indexOf("boinya-secret") >= 0) fail("delivered: used Boinya token");
  if (!/Доставлено/.test(sent[0].body.text)) fail("delivered: wrong copy");
  console.log("OK: delivered → only tid 111222333 via partner bot");

  sent.length = 0;
  await partnerNotifyStatusFastWorker_(order, env, "scheduled");
  if (sent.length !== 1) fail("scheduled: expected 1 send, got " + sent.length);
  if (sent[0].body.chat_id !== "111222333") fail("scheduled: wrong chat_id");
  if (!/Дата доставки назначена/.test(sent[0].body.text)) fail("scheduled: wrong copy");
  console.log("OK: scheduled → only tid 111222333 via partner bot");

  sent.length = 0;
  await partnerNotifyStatusFastWorker_(order, env, "received");
  if (sent.length !== 1) fail("received: expected 1 send, got " + sent.length);
  if (sent[0].body.chat_id !== "111222333") fail("received: wrong chat_id");
  if (!/Заявка отправлена/.test(sent[0].body.text)) fail("received: wrong copy");
  console.log("OK: received → only tid 111222333 via partner bot");

  sent.length = 0;
  await partnerNotifyStatusFastWorker_(
    order,
    { TELEGRAM_BOT_TOKEN: "boinya-secret" },
    "in_transit"
  );
  if (sent.length !== 0) fail("no partner token: must skip send, got " + sent.length);
  console.log("OK: missing PARTNER/GOODBOY token → skip (no Boinya fallback)");

  sent.length = 0;
  await partnerNotifyStatusFastWorker_(
    Object.assign({}, order, { telegramId: "" }),
    env,
    "in_transit"
  );
  if (sent.length !== 0) fail("empty telegramId: must skip send");
  console.log("OK: empty order.telegramId → skip");
}

runNotify()
  .then(function () {
    console.log("All partner status notify bot cases passed.");
  })
  .catch(function (e) {
    fail(e && e.stack ? e.stack : String(e));
  });
