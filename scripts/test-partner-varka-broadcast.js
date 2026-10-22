#!/usr/bin/env node
/**
 * Рассылка Varka и флаг paidConsent. Живую отправку не вызывает.
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const root = path.join(__dirname, "..");
const gas = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
const worker = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
const varka = fs.readFileSync(path.join(root, "varka/app.html"), "utf8");
const hub = fs.readFileSync(path.join(root, "boinya-c/app.main.js"), "utf8");

function fail(msg) {
  console.error("FAIL", msg);
  process.exit(1);
}

const TEXT = "Здравствуйте! Когда начинали, договорились о бесплатном сотрудничестве — спасибо, что были с нами на этом этапе 🙌";
const BTN_PAID = "Продолжаем на платной основе";
const BTN_NO = "Спасибо, но в таком случае не актуально";
const REPLY_PAID = "Спасибо, что остаётесь с нами и цените наше качество! Цены в партнёрке будут считаться автоматически и показываться под итоговым заказом.";
const REPLY_NO = "Спасибо за сотрудничество. Точку отключили от партнёрки — если захотите вернуться, напишите нам.";
const PENDING = "Условия сотрудничества обновились. Ответьте на сообщение в боте @GOODBOY_LG, чтобы продолжить";
const DECLINED = "Точка отключена от партнёрки. Если захотите вернуться, напишите нам.";

[gas, worker].forEach(function (src, i) {
  const name = i === 0 ? "Code.gs" : "worker.js";
  [TEXT, BTN_PAID, BTN_NO, REPLY_PAID, REPLY_NO].forEach(function (bit) {
    if (src.indexOf(bit) < 0) fail(name + " missing broadcast copy");
    if (bit.indexOf("·") >= 0) fail("broadcast copy has a middot");
  });
  if (src.indexOf("Ответы_рассылки") < 0 && i === 0) fail("sheet name missing");
  if (src.indexOf("partnerBroadcastReplies") < 0 && i === 1) fail("D1 reply snap missing");
  if (src.indexOf("SEND_VARKA") < 0) fail(name + " live confirm missing");
  if (src.indexOf("partnerConsentRejectForPoint_") < 0) fail(name + " consent gate missing");
});

if (gas.indexOf('getSheetByName("Ответы_рассылки")') < 0) fail("reply sheet getter");
if (worker.indexOf('pathname === "/telegram/goodboy"') < 0) fail("goodboy webhook route");
if (worker.indexOf('message: "webhook_only"') < 0) fail("callback must not be a public action");
if (varka.indexOf(PENDING) < 0 || varka.indexOf(DECLINED) < 0) fail("mini app consent copy");
if (varka.indexOf("paidConsent: p.paidConsent") < 0) fail("mini app must keep paidConsent on the point");
if (varka.indexOf("consent_pending") < 0 || varka.indexOf("consent_declined") < 0) fail("mini app server errors");
if (hub.indexOf("partnerHubSetConsent_") < 0 || hub.indexOf("partnerSetPointConsent") < 0) fail("hub consent control");
if (gas.indexOf("function handlePartnerSubmitOrder") < 0) fail("submit missing");
const submitGas = gas.slice(gas.indexOf("function handlePartnerSubmitOrder"), gas.indexOf("function handlePartnerListMyOrders"));
if (submitGas.indexOf("partnerConsentRejectForPoint_") < 0) fail("GAS submit must reject consent");
const submitAt = worker.indexOf("if (/^partnerSubmitOrder$/i.test(a)) {");
const submitW = worker.slice(submitAt, submitAt + 8000);
if (submitW.indexOf("partnerConsentRejectForPoint_") < 0) fail("Worker submit must reject consent");

function extractFn(src, name) {
  const re = new RegExp("function\\s+" + name + "\\s*\\(");
  const m = re.exec(src);
  if (!m) fail("missing " + name);
  let i = src.indexOf("{", m.index);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
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
  [
    extractFn(gas, "partnerNormalizeConsent_"),
    extractFn(gas, "partnerPointIsVarka_"),
    extractFn(gas, "partnerEffectiveConsent_"),
    extractFn(gas, "partnerConsentRejectForPoint_"),
    extractFn(gas, "partnerVarkaBroadcastRecipients_")
  ].join("\n") + "\n" +
  "globalThis.pack = partnerVarkaBroadcastRecipients_([" +
  "  { status: 'active', role: 'partner', telegramId: '10001', username: 'owner_a', name: 'Анна', pointIds: ['pt_varka_repina_4'] }," +
  "  { status: 'active', role: 'staff', telegramId: '650923866', username: 'arseniyhotko', name: 'Арсений', pointIds: ['pt_varka_rokoss_80'] }," +
  "  { status: 'active', role: 'partner', telegramId: '', username: 'no_tid', name: 'Без id', pointIds: ['pt_varka_avia_17'] }," +
  "  { status: 'active', role: 'partner', telegramId: '20002', username: 'nan', name: 'NaN', pointIds: ['pt_nan_1'] }," +
  "  { status: 'revoked', role: 'partner', telegramId: '30003', username: 'old', name: 'Старый', pointIds: ['pt_varka_skrip_1'] }" +
  "], [" +
  "  { id: 'pt_varka_repina_4', networkId: 'net_varka', name: 'Репина', active: true }," +
  "  { id: 'pt_varka_rokoss_80', networkId: 'net_varka', name: 'Рокосс', active: true }," +
  "  { id: 'pt_varka_avia_17', networkId: 'net_varka', name: 'Авиа', active: true }," +
  "  { id: 'pt_nan_1', networkId: 'net_nan', name: 'nan', active: true }," +
  "  { id: 'pt_varka_skrip_1', networkId: 'net_varka', name: 'Скрип', active: true }" +
  "]);\n" +
  "globalThis.empty = partnerVarkaBroadcastRecipients_([], [" +
  "  { id: 'pt_varka_repina_4', networkId: 'net_varka', active: true }" +
  "]);\n" +
  "globalThis.pending = partnerConsentRejectForPoint_({ id: 'pt_varka_repina_4', networkId: 'net_varka' });\n" +
  "globalThis.explicitPending = partnerConsentRejectForPoint_({ id: 'pt_varka_repina_4', networkId: 'net_varka', paidConsent: 'pending' });\n" +
  "globalThis.okNan = partnerConsentRejectForPoint_({ id: 'pt_nan_1', networkId: 'net_nan' });\n" +
  "globalThis.declined = partnerConsentRejectForPoint_({ id: 'pt_varka_repina_4', networkId: 'net_varka', paidConsent: 'declined' });\n" +
  "globalThis.accepted = partnerConsentRejectForPoint_({ id: 'pt_varka_repina_4', networkId: 'net_varka', paidConsent: 'accepted' });\n",
  sandbox
);

if (sandbox.empty.recipients.length !== 0) fail("seed-like empty access must be 0 recipients, got " + sandbox.empty.recipients.length);
if (sandbox.pack.recipients.length !== 1) fail("only the varka owner with telegram id, got " + sandbox.pack.recipients.length);
if (sandbox.pack.recipients[0].telegramId !== "10001") fail("wrong recipient");
if (sandbox.pack.skipped.length !== 1) fail("owner without telegram id must be skipped");
if (sandbox.pending) fail("empty varka consent must stay open until migration");
if (!sandbox.explicitPending || sandbox.explicitPending.message !== "consent_pending") fail("explicit pending still blocks");
if (sandbox.okNan) fail("other networks must stay open");
if (!sandbox.declined || sandbox.declined.message !== "consent_declined") fail("declined");
if (sandbox.accepted) fail("accepted must pass");

const saveGas = gas.slice(gas.indexOf("function handlePartnerSavePoint"), gas.indexOf("function handlePartnerDeletePoint"));
if (saveGas.indexOf('consent = "pending"') >= 0) fail("GAS save point must not auto-write pending");
const saveWAt = worker.indexOf("if (/^partnerSavePoint$/i.test(a))");
const saveW = worker.slice(saveWAt, saveWAt + 1800);
if (saveW.indexOf('consent = "pending"') >= 0) fail("Worker save point must not auto-write pending");

const gateAt = worker.indexOf("X-Varka-Admin-Key");
if (gateAt < 0) fail("admin key header");
const gate = worker.slice(gateAt - 420, gateAt + 120);
if (!/partnerMigrateVarkaConsent\|partnerVarkaBroadcast/.test(gate)) fail("admin key must allow migrate and broadcast");
if (/partnerSetPointConsent|partnerSubmitOrder|partnerSavePoint/.test(gate)) fail("admin key must not cover other actions");
if (worker.indexOf("env.VARKA_ADMIN_KEY") < 0) fail("VARKA_ADMIN_KEY");
if (worker.indexOf("function stampVarkaAdminOwner_") < 0) fail("owner stamp for GAS");
const stamp = extractFn(worker, "stampVarkaAdminOwner_");
if (stamp.indexOf('_actorRole = "owner"') < 0 || stamp.indexOf("_actorTid") < 0) fail("stamp must set owner actor for Worker→GAS");

const hookAt = worker.indexOf("async function handleGoodboyTelegramWebhook_");
const hook = worker.slice(hookAt, hookAt + 700);
if (hook.indexOf("env.GOODBOY_WEBHOOK_SECRET") < 0) fail("webhook secret name");
if (hook.indexOf("env.WORKER_SHARED_SECRET") >= 0) fail("webhook must not use WORKER_SHARED_SECRET");
const tok = extractFn(worker, "getPartnerBotTokenWorker_");
if (tok.indexOf("PARTNER_BOT_TOKEN") < 0) fail("partner bot token");

const bcastAt = worker.indexOf("if (/^partnerVarkaBroadcast$/i.test(a))");
const bcast = worker.slice(bcastAt, worker.indexOf("if (/^partnerMigrateVarkaConsent$/i.test(a))", bcastAt));
if (bcast.indexOf("SEND_VARKA") < 0) fail("live still needs confirm");
if (bcast.indexOf("errors: failed") < 0) fail("broadcast response errors");

const pointFn = varka.slice(varka.indexOf("function pointConsent_"), varka.indexOf("function consentMessage_"));
if (pointFn.indexOf('return "accepted"') < 0) fail("mini app empty consent is accepted");

const nodeCrypto = require("crypto");
const secretBox = {
  TextEncoder: TextEncoder,
  crypto: {
    subtle: {
      timingSafeEqual: function (a, b) {
        if (a.byteLength !== b.byteLength) throw new Error("length");
        return nodeCrypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
      }
    }
  }
};
vm.createContext(secretBox);
vm.runInContext(
  extractFn(worker, "varkaSecretEq_") + "\n" +
  extractFn(worker, "varkaAdminKeyHeaderOk_") + "\n" +
  "globalThis.emptySecret = varkaAdminKeyHeaderOk_('x', {});\n" +
  "globalThis.blankSecret = varkaAdminKeyHeaderOk_('x', { VARKA_ADMIN_KEY: '  ' });\n" +
  "globalThis.bad = varkaAdminKeyHeaderOk_('nope', { VARKA_ADMIN_KEY: 'morning-key' });\n" +
  "globalThis.short = varkaAdminKeyHeaderOk_('morning-ke', { VARKA_ADMIN_KEY: 'morning-key' });\n" +
  "globalThis.ok = varkaAdminKeyHeaderOk_('morning-key', { VARKA_ADMIN_KEY: 'morning-key' });\n" +
  "globalThis.trimmed = varkaAdminKeyHeaderOk_(' morning-key ', { VARKA_ADMIN_KEY: 'morning-key' });\n",
  secretBox
);
if (secretBox.emptySecret || secretBox.blankSecret) fail("empty VARKA_ADMIN_KEY must not authorize");
if (secretBox.bad || secretBox.short) fail("wrong admin key must fail");
if (!secretBox.ok || !secretBox.trimmed) fail("matching admin key must pass");

console.log("OK varka broadcast wiring, dry-run seed recipients", sandbox.empty.recipients.length);
