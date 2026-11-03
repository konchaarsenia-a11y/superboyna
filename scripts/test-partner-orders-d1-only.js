#!/usr/bin/env node
/**
 * Заявки, статусы, слоты, рассылка, подсказки и «Подключить точку» не пишут Sheets.
 * Новая заявка не затирает уже лежащие в partnerOrders.
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
  const mark = "function " + name + "(";
  const start = src.indexOf(mark);
  if (start < 0) fail("missing " + name);
  const from = src.slice(Math.max(0, start - 6), start) === "async " ? start - 6 : start;
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  fail("unclosed " + name);
}

const banned = [
  "partnerSubmitOrder",
  "partnerSetOrderStatus",
  "partnerSetOrderSlot",
  "partnerListMyOrders",
  "partnerVarkaBroadcast",
  "partnerSuggestPartner",
  "partnerListSuggestions",
  "partnerSetSuggestionStatus",
  "partnerAccessRequestUpsert",
  "partnerWipeOrderHistories"
];
banned.forEach(function (name) {
  const re = new RegExp("gasProxy_\\(\\s*[\"']" + name + "[\"']");
  if (re.test(worker)) fail("still calls GAS " + name);
});
["partnerListMyOrdersD1_", "partnerSuggestPartnerWorker_", "partnerSetSuggestionStatusWorker_", "partnerListSuggestionsWorker_", "partnerAccessRequestMirror_"].forEach(function (name) {
  if (extractFn(worker, name).indexOf("gasProxy_") >= 0) fail(name + " still calls GAS");
});
const cutAt = worker.indexOf("Заявки, слот, статус и рассылка");
const cut = worker.slice(cutAt, worker.indexOf("Goodboy GB_", cutAt));
if (cut.indexOf("gasProxy_") >= 0) fail("order cutover still mirrors to GAS");
if (cut.indexOf("partnerNotifyOrderFastWorker_") < 0) fail("submit must still notify");
if (cut.indexOf("partnerNotifyStatusFastWorker_") < 0) fail("status must still notify");
if (cut.indexOf("partnerNotifySlotFastWorker_") < 0) fail("slot must still notify");

const mem = {};
function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}
const sandbox = {
  console: console,
  mem: mem,
  getSnapRaw_: async function (env, key) {
    return mem[key] ? clone(mem[key]) : null;
  },
  putSnap_: async function (env, key, payload) {
    mem[key] = clone(payload);
  },
  stripRepairedTransfers_: function (items) {
    return items || [];
  },
  ensurePartnerAdminSnap_: async function () {
    return mem.partnerListAdmin;
  },
  partnerAdminSnapOk_: function (admin) {
    return !!(admin && admin.status === "success" && Array.isArray(admin.networks) && Array.isArray(admin.points));
  },
  partnerConsentRejectForPoint_: function () {
    return null;
  },
  partnerMinTreatReject_: function () {
    return null;
  },
  partnerQuoteTreatsByn_: async function () {
    return { status: "success", totalByn: 16, treatsByn: 12, deliveryByn: 4 };
  },
  sent: []
};
vm.createContext(sandbox);
vm.runInContext(
  extractFn(worker, "partnerNormUserWorker_") + "\n" +
    extractFn(worker, "partnerMoney_") + "\n" +
    extractFn(worker, "partnerUid_") + "\n" +
    extractFn(worker, "partnerDeferredIdWorker_") + "\n" +
    extractFn(worker, "partnerEnqueueDeferredD1Worker_") + "\n" +
    extractFn(worker, "mutatePartnerD1_") + "\n" +
    extractFn(worker, "partnerBasketLinesWorker_") + "\n" +
    extractFn(worker, "partnerNotifyOrderFastWorker_") + "\n" +
    extractFn(worker, "partnerNotifyStatusFastWorker_") + "\n",
  sandbox
);

mem.partnerListAdmin = {
  status: "success",
  networks: [{ id: "net_varka", name: "Varka" }],
  points: [{ id: "pt_varka_repina_4", networkId: "net_varka", name: "Varka Репина 4", active: true, paidConsent: "accepted" }],
  access: [{ username: "cafe", telegramId: "100", pointIds: ["pt_varka_repina_4"], status: "active", networkId: "net_varka" }],
  notifyRecipients: ["650923866"]
};
mem.partnerOrders = {
  status: "success",
  orders: [{ id: "po_old", locationId: "pt_varka_repina_4", status: "delivered", telegramId: "100" }],
  _d1TouchedAt: 1
};
mem.listDeferred = {
  status: "success",
  items: [{ id: "remind_1", mode: "remind", status: "open", payload: { mode: "remind" } }]
};

const env = { DB: true, PARTNER_BOT_TOKEN: "tok", TELEGRAM_BOT_TOKEN: "boinya" };
sandbox.isPartnerLiveTestUser_ = function () { return false; };
sandbox.isPartnerManualAccessUser_ = function () { return false; };
sandbox.isPartnerOwnerAllUser_ = function () { return false; };
sandbox.isPartnerCanonOwner_ = function () { return false; };
sandbox.isPartnerArseniy_ = function () { return false; };
sandbox.partnerIsExcludedPoint_ = function () { return false; };
sandbox.getPartnerBotTokenWorker_ = function () { return "tok"; };
sandbox.partnerPriceNote_ = function () { return ""; };
sandbox.notifyRecipientsWorker_ = async function () { return ["650923866"]; };
sandbox.appendNotifyGroup_ = async function (e, ids) { return ids; };
sandbox.telegramSendPartnerBot_ = async function (e, id, text) {
  sandbox.sent.push({ bot: "partner", id: String(id), text: String(text) });
  return { ok: true };
};
sandbox.telegramSendTextWorker_ = async function (e, id, text) {
  sandbox.sent.push({ bot: "boinya", id: String(id), text: String(text) });
  return { ok: true };
};

(async function () {
  const made = await sandbox.mutatePartnerD1_("partnerSubmitOrder", {
    telegramId: "100",
    username: "cafe",
    locationId: "pt_varka_repina_4",
    networkId: "net_varka",
    userName: "Кафе",
    basket: [{ id: "vr_t_heart", name: "Сердце", qty: 100, unit: "г" }]
  }, env);
  if (!made || made.status !== "success" || !made.order || !made.order.id) fail("submit " + JSON.stringify(made));
  if (made.fromGas) fail("submit must not come from GAS");
  const ids = (mem.partnerOrders.orders || []).map(function (o) { return o.id; });
  if (ids.indexOf("po_old") < 0) fail("existing order was dropped " + ids.join(","));
  if (ids.indexOf(made.order.id) < 0) fail("new order missing from snap");
  if (ids[0] !== made.order.id) fail("new order must be first");
  const deferred = mem.listDeferred.items || [];
  const keptRemind = deferred.some(function (it) { return it && it.id === "remind_1" && it.status === "open"; });
  if (!keptRemind) fail("non-partner deferred was dropped");
  const card = deferred.find(function (it) {
    return it && it.payload && it.payload.partnerOrderId === made.order.id && it.status === "open";
  });
  if (!card) fail("Boinya deferred card missing");

  const st = await sandbox.mutatePartnerD1_("partnerSetOrderStatus", {
    id: made.order.id,
    status: "in_transit"
  }, env);
  if (!st || st.status !== "success" || st.orderStatus !== "in_transit") fail("status " + JSON.stringify(st));
  const old = (mem.partnerOrders.orders || []).find(function (o) { return o.id === "po_old"; });
  if (!old || old.status !== "delivered") fail("old order status changed");
  const moved = (mem.partnerOrders.orders || []).find(function (o) { return o.id === made.order.id; });
  if (!moved || moved.status !== "in_transit") fail("new status not stored");

  const slot = await sandbox.mutatePartnerD1_("partnerSetOrderSlot", {
    partnerOrderId: made.order.id,
    deliverDateIso: "2026-10-23",
    deliverTimeFrom: "19:00",
    deliverTimeTo: "22:00"
  }, env);
  if (!slot || slot.status !== "success" || slot.deliverDateIso !== "2026-10-23") fail("slot " + JSON.stringify(slot));
  const afterSlot = (mem.listDeferred.items || []).find(function (it) {
    return it && it.payload && it.payload.partnerOrderId === made.order.id;
  });
  if (!afterSlot || afterSlot.status !== "open") fail("slot must keep the deferred card");
  if (!afterSlot.payload || afterSlot.payload.deliverDateIso !== "2026-10-23") fail("slot date missing on the card");
  if ((mem.partnerOrders.orders || []).some(function (o) { return o.id === "po_old"; }) === false) {
    fail("slot dropped the old order");
  }

  const quiet = await sandbox.partnerNotifyOrderFastWorker_({ id: "x", note: "ТЕСТ", userName: "ТЕСТ" }, env);
  if (!quiet || quiet.skipped !== "test") fail("test orders must not notify");
  if (sandbox.sent.length) fail("test notify sent");
  await sandbox.partnerNotifyOrderFastWorker_(made.order, env);
  const partnerPing = sandbox.sent.find(function (s) { return s.bot === "partner" && s.id === "100"; });
  const teamPing = sandbox.sent.find(function (s) { return s.bot === "boinya" && s.id === "650923866"; });
  if (!partnerPing || partnerPing.text.indexOf("Заявка отправлена") < 0) fail("partner notify missing");
  if (!teamPing || teamPing.text.indexOf("Новая заявка") < 0) fail("team notify missing");
  await sandbox.partnerNotifyStatusFastWorker_(Object.assign({}, made.order, { status: "in_transit" }), env, "in_transit");
  const transit = sandbox.sent.find(function (s) { return s.text.indexOf("Курьер уже в пути") >= 0; });
  if (!transit) fail("in_transit notify missing");

  const sug = {};
  sandbox.getSnapRaw_ = async function (e, key) { return sug[key] ? clone(sug[key]) : null; };
  sandbox.putSnap_ = async function (e, key, payload) { sug[key] = clone(payload); };
  vm.runInContext(
    extractFn(worker, "partnerSuggestClip_") + "\n" +
      extractFn(worker, "partnerSuggestTypeLabel_") + "\n" +
      extractFn(worker, "partnerSuggestNormalize_") + "\n" +
      extractFn(worker, "partnerSuggestNewCount_") + "\n" +
      extractFn(worker, "partnerSuggestionsUpsertSnap_") + "\n" +
      extractFn(worker, "partnerSuggestPartnerWorker_") + "\n" +
      extractFn(worker, "partnerSuggestStatusOk_") + "\n" +
      extractFn(worker, "partnerSetSuggestionStatusWorker_") + "\n",
    sandbox
  );
  sandbox.hasTelegramToken_ = function () { return true; };
  sandbox.partnerNotifySuggestionWorker_ = async function (row) {
    sandbox.sent.push({ bot: "suggest", id: row.id });
  };
  const saved = await sandbox.partnerSuggestPartnerWorker_({
    type: "second_project",
    name: "Кафе",
    cityAddress: "Минск",
    telegramId: "100",
    username: "cafe"
  }, env);
  if (!saved || saved.status !== "success" || saved.fromGas) fail("suggest " + JSON.stringify(saved));
  if (!sug.partnerSuggestions || sug.partnerSuggestions.suggestions.length !== 1) fail("suggest not stored");
  const marked = await sandbox.partnerSetSuggestionStatusWorker_({ id: saved.id, status: "просмотрено" }, env);
  if (!marked || marked.suggestionStatus !== "просмотрено") fail("suggest status " + JSON.stringify(marked));
  if (sug.partnerSuggestions.suggestions[0].status !== "просмотрено") fail("suggest status not in D1");

  console.log("OK partner orders are D1 only");
})().catch(function (e) {
  fail(e && e.stack ? e.stack : e);
});
