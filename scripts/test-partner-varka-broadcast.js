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
const submitAt = worker.indexOf("if (/^partnerSubmitOrder$/i.test(a))");
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
  "globalThis.okNan = partnerConsentRejectForPoint_({ id: 'pt_nan_1', networkId: 'net_nan' });\n" +
  "globalThis.declined = partnerConsentRejectForPoint_({ id: 'pt_varka_repina_4', networkId: 'net_varka', paidConsent: 'declined' });\n" +
  "globalThis.accepted = partnerConsentRejectForPoint_({ id: 'pt_varka_repina_4', networkId: 'net_varka', paidConsent: 'accepted' });\n",
  sandbox
);

if (sandbox.empty.recipients.length !== 0) fail("seed-like empty access must be 0 recipients, got " + sandbox.empty.recipients.length);
if (sandbox.pack.recipients.length !== 1) fail("only the varka owner with telegram id, got " + sandbox.pack.recipients.length);
if (sandbox.pack.recipients[0].telegramId !== "10001") fail("wrong recipient");
if (sandbox.pack.skipped.length !== 1) fail("owner without telegram id must be skipped");
if (!sandbox.pending || sandbox.pending.message !== "consent_pending") fail("empty varka consent is pending");
if (sandbox.okNan) fail("other networks must stay open");
if (!sandbox.declined || sandbox.declined.message !== "consent_declined") fail("declined");
if (sandbox.accepted) fail("accepted must pass");

console.log("OK varka broadcast wiring, dry-run seed recipients", sandbox.empty.recipients.length);
