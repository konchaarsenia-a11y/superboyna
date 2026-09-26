#!/usr/bin/env node
/**
 * Contract: «Предложить партнёра».
 * Валидация одинакова в Worker и Code.gs.
 * Пуш менеджеру — бот Бойни (TELEGRAM), не @GOODBOY_LG.
 * Лист «Предложения_партнёров», блок в Партнёрах, форма в varka.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const workerSrc = fs.readFileSync(path.join(root, "boinya-c", "proxy", "worker.js"), "utf8");
const gasSrc = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
const varkaSrc = fs.readFileSync(path.join(root, "varka", "app.html"), "utf8");
const hubHtml = fs.readFileSync(path.join(root, "boinya-c", "app.html"), "utf8");
const hubJs = fs.readFileSync(path.join(root, "boinya-c", "app.main.js"), "utf8");

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

function loadPure_(src, label) {
  const names = [
    "partnerSuggestTypeLabel_",
    "partnerSuggestStatusOk_",
    "partnerSuggestClip_",
    "partnerSuggestAuthorLabel_",
    "partnerSuggestNotifyText_",
    "partnerSuggestNewCount_",
    "partnerSuggestNormalize_"
  ];
  const body = names.map(function (n) { return extractFn_(src, n); }).join("\n");
  try {
    return new Function(
      body +
        "\nreturn { partnerSuggestTypeLabel_, partnerSuggestStatusOk_, partnerSuggestNotifyText_, partnerSuggestNewCount_, partnerSuggestNormalize_ };"
    )();
  } catch (e) {
    fail(label + " pure helpers did not load: " + e.message);
  }
}

const gas = loadPure_(gasSrc, "Code.gs");
const worker = loadPure_(workerSrc, "worker");

const base = {
  id: "ps_test1",
  type: "second_project",
  name: "  Кафе Хвост  ",
  cityAddress: "Минск, Немига 5",
  contact: "+37529111",
  comment: "после 18",
  telegramId: "100",
  username: "@varka_two",
  userName: "Аня",
  locationId: "pt_varka_rokoss_80",
  locationName: "Varka Рокоссовского 80",
  networkId: "net_varka",
  networkName: "Varka"
};

function same(a, b, title) {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja !== jb) fail(title + "\n gas=" + ja + "\n worker=" + jb);
}

const cases = [
  { name: "empty", input: {}, want: { ok: false, message: "need_type" } },
  { name: "bad type", input: { type: "other", name: "A", cityAddress: "B", telegramId: "1" }, want: { ok: false, message: "need_type" } },
  { name: "need name", input: { type: "new_location", name: "   ", cityAddress: "Минск", telegramId: "1" }, want: { ok: false, message: "need_name" } },
  { name: "need place", input: { type: "same_network_point", name: "Точка", cityAddress: " ", telegramId: "1" }, want: { ok: false, message: "need_place" } },
  { name: "need user", input: { type: "second_project", name: "Кафе", cityAddress: "Минск" }, want: { ok: false, message: "need_user" } }
];

for (const c of cases) {
  const g = gas.partnerSuggestNormalize_(c.input);
  const w = worker.partnerSuggestNormalize_(c.input);
  same(g, w, c.name);
  if (g.ok !== c.want.ok || g.message !== c.want.message) {
    fail(c.name + " got " + JSON.stringify(g));
  }
  console.log("OK:", c.name);
}

const okG = gas.partnerSuggestNormalize_(base);
const okW = worker.partnerSuggestNormalize_(base);
same(okG, okW, "happy");
if (!okG.ok) fail("happy should pass");
if (okG.row.name !== "Кафе Хвост") fail("name not trimmed");
if (okG.row.authorNick !== "varka_two") fail("nick should drop @");
if (okG.row.status !== "новое") fail("default status");
if (okG.row.typeLabel !== "Мой второй проект") fail("type label");
if (okG.row.pointId !== "pt_varka_rokoss_80") fail("point id");
if (okG.row.pointName !== "Varka Рокоссовского 80") fail("point name");
if (okG.row.networkName !== "Varka") fail("network name");
console.log("OK: happy row");

const nickOnly = gas.partnerSuggestNormalize_({
  id: "ps_nick",
  type: "new_location",
  name: "Парк",
  cityAddress: "Брест, Советская 1",
  username: "bowwow"
});
if (!nickOnly.ok || nickOnly.row.authorTid) fail("username-only author");
if (nickOnly.row.typeLabel !== "Предложить новую локацию") fail("new_location label");
console.log("OK: username only");

const longName = "Я".repeat(200);
const clipped = worker.partnerSuggestNormalize_({
  id: "ps_long",
  type: "same_network_point",
  name: longName,
  cityAddress: "Город",
  telegramId: "9"
});
if (!clipped.ok || clipped.row.name.length !== 120) fail("name clip 120");
if (clipped.row.typeLabel !== "Новая точка той же сети под моим управлением") fail("same network label");
console.log("OK: clip + same_network label");

const text = gas.partnerSuggestNotifyText_(okG.row);
const wantText = "Новое предложение партнёра: Мой второй проект — Кафе Хвост, Минск, Немига 5, +37529111, от @varka_two";
if (text !== wantText) fail("notify text\n got " + text + "\n want " + wantText);
if (worker.partnerSuggestNotifyText_(okW.row) !== text) fail("worker notify text diverged");
const noContact = Object.assign({}, okG.row, { contact: "" });
if (!gas.partnerSuggestNotifyText_(noContact).includes("контакт не указан")) fail("empty contact slot");
console.log("OK: notify text");

const statuses = [
  ["новое", "новое"],
  ["NEW", "новое"],
  ["seen", "просмотрено"],
  ["in_progress", "в работе"],
  ["rejected", "отклонено"],
  ["отклонено", "отклонено"],
  ["нет", ""]
];
for (const pair of statuses) {
  const g = gas.partnerSuggestStatusOk_(pair[0]);
  const w = worker.partnerSuggestStatusOk_(pair[0]);
  if (g !== pair[1] || w !== pair[1]) fail("status " + pair[0] + " => " + g + "/" + w);
}
console.log("OK: statuses");

if (gas.partnerSuggestNewCount_([
  { status: "новое" },
  { status: "просмотрено" },
  { status: "новое" }
]) !== 2) fail("new count");
console.log("OK: new count");

if (!gasSrc.includes('var PARTNER_SUGGEST_SHEET_ = "Предложения_партнёров"')) {
  fail("sheet name missing");
}
if (!gasSrc.includes("function getPartnerSuggestionsSheet_")) fail("sheet getter missing");
if ((gasSrc.match(/action === "partnerSuggestPartner"/g) || []).length < 2) fail("GET+POST route suggest");
if ((gasSrc.match(/action === "partnerListSuggestions"/g) || []).length < 2) fail("GET+POST route list");
if ((gasSrc.match(/action === "partnerSetSuggestionStatus"/g) || []).length < 2) fail("GET+POST route status");

const gasNotify = extractFn_(gasSrc, "partnerNotifySuggestion_");
if (!/partnerTelegramSendMany_/.test(gasNotify)) fail("GAS notify must use Boinya partnerTelegramSendMany_");
if (/getPartnerBotToken_|PARTNER_BOT_TOKEN|GOODBOY_BOT_TOKEN/.test(gasNotify)) {
  fail("GAS suggest notify must not use partner bot");
}
const gasIds = extractFn_(gasSrc, "partnerSuggestNotifyIds_");
if (!/650923866/.test(gasIds) || !/getPartnerOrderNotifyIds_/.test(gasIds)) {
  fail("GAS notify ids must include Arseniy and order recipients");
}
const gasHandler = extractFn_(gasSrc, "handlePartnerSuggestPartner");
if (!/skipPartnerNotify/.test(gasHandler)) fail("GAS suggest must honor skipPartnerNotify");
if (!/appendRow/.test(gasHandler)) fail("GAS suggest must append sheet row");
if (!/partnerSuggestKnownActor_/.test(gasHandler)) fail("GAS suggest must check author access");
console.log("OK: Code.gs sheet + TG");

const runIds = new Function(
  extractFn_(gasSrc, "partnerSuggestNotifyIds_") +
    "\nfunction getPartnerOrderNotifyIds_(){ return ['111','650923866']; }" +
    "\nreturn partnerSuggestNotifyIds_();"
)();
if (runIds.join(",") !== "111,650923866") fail("dedupe Arseniy got " + runIds.join(","));
const sent = [];
new Function(
  extractFn_(gasSrc, "partnerSuggestNotifyText_") + "\n" +
    extractFn_(gasSrc, "partnerSuggestAuthorLabel_") + "\n" +
    extractFn_(gasSrc, "partnerSuggestTypeLabel_") + "\n" +
    extractFn_(gasSrc, "partnerSuggestNotifyIds_") + "\n" +
    extractFn_(gasSrc, "partnerNotifySuggestion_") + "\n" +
    "function getPartnerOrderNotifyIds_(){ return ['222']; }" +
    "\nfunction partnerTelegramSendMany_(ids, text){ sent.push({ ids: ids.slice(), text: text }); }" +
    "\nvar sent = [];" +
    "\npartnerNotifySuggestion_({ typeLabel:'Мой второй проект', name:'Кафе', cityAddress:'Минск', contact:'tg', authorNick:'anya' });" +
    "\nreturn sent;"
)();
// sent is inside the function — capture return
const sentOut = new Function(
  extractFn_(gasSrc, "partnerSuggestNotifyText_") + "\n" +
    extractFn_(gasSrc, "partnerSuggestAuthorLabel_") + "\n" +
    extractFn_(gasSrc, "partnerSuggestTypeLabel_") + "\n" +
    extractFn_(gasSrc, "partnerSuggestNotifyIds_") + "\n" +
    extractFn_(gasSrc, "partnerNotifySuggestion_") + "\n" +
    "function getPartnerOrderNotifyIds_(){ return ['222']; }" +
    "\nfunction partnerTelegramSendMany_(ids, text){ return { ids: ids.slice(), text: text }; }" +
    "\nvar box = [];" +
    "\nvar orig = partnerTelegramSendMany_;" +
    "\npartnerTelegramSendMany_ = function(ids, text){ box.push(orig(ids, text)); };" +
    "\npartnerNotifySuggestion_({ typeLabel:'Мой второй проект', name:'Кафе', cityAddress:'Минск', contact:'tg', authorNick:'anya' });" +
    "\nreturn box;"
)();
if (!sentOut.length || sentOut[0].ids.join(",") !== "222,650923866") {
  fail("GAS send ids " + JSON.stringify(sentOut));
}
if (!String(sentOut[0].text).startsWith("Новое предложение партнёра:")) fail("GAS send text");
console.log("OK: GAS send uses Boinya recipients + Arseniy");

const wNotify = extractFn_(workerSrc, "partnerNotifySuggestionWorker_");
if (!/telegramSendTextWorker_/.test(wNotify)) fail("Worker notify must use Boinya telegramSendTextWorker_");
if (/telegramSendPartnerBot_|getPartnerBotTokenWorker_|PARTNER_BOT_TOKEN|GOODBOY_BOT_TOKEN/.test(wNotify)) {
  fail("Worker suggest notify must not use partner bot");
}
const wIds = extractFn_(workerSrc, "partnerSuggestNotifyIdsWorker_");
if (!/PARTNER_ARSENIY_TID/.test(wIds) || !/notifyRecipients/.test(wIds)) {
  fail("Worker notify ids must include Arseniy and notifyRecipients");
}
const wSubmit = extractFn_(workerSrc, "partnerSuggestPartnerWorker_");
if (!/skipPartnerNotify/.test(wSubmit)) fail("Worker must pass skipPartnerNotify when it will send");
if (!/gasProxy_\(\s*"partnerSuggestPartner"/.test(wSubmit)) fail("Worker must write sheet via GAS");
if (!/partnerNotifySuggestionWorker_/.test(wSubmit)) fail("Worker must send TG after sheet success");
if (!/a === "partnerListSuggestions"/.test(workerSrc)) fail("list action must be a read");
if (!/partnerSuggestPartnerWorker_/.test(workerSrc) || !/partnerSetSuggestionStatusWorker_/.test(workerSrc)) {
  fail("write routes missing");
}
console.log("OK: Worker TG + routes");

const labels = [
  "Мой второй проект",
  "Новая точка той же сети под моим управлением",
  "Предложить новую локацию",
  "Предложить партнёра",
  "Предложение отправлено.",
  "id=\"suggestName\"",
  "id=\"suggestPlace\"",
  "partnerSuggestPartner"
];
for (const s of labels) {
  if (!varkaSrc.includes(s)) fail("varka missing " + s);
}
if (!/screenSuggest/.test(varkaSrc)) fail("varka screen missing");
console.log("OK: varka form");

if (!hubHtml.includes('id="phSuggestList"') || !hubHtml.includes('id="phSuggestBadge"')) {
  fail("partners hub markup missing");
}
if (!hubHtml.includes("Новые предложения")) fail("hub title missing");
if (!hubHtml.includes('id="phAccessList"') || !hubHtml.includes('id="phOrdersList"')) {
  fail("existing partners panels removed");
}
if (!/function paintPartnerSuggestions_/.test(hubJs)) fail("paint missing");
if (!/action:\s*"partnerListSuggestions"/.test(hubJs)) fail("list call missing");
if (!/action:\s*"partnerSetSuggestionStatus"/.test(hubJs)) fail("status call missing");
if (!/просмотрено/.test(hubJs) || !/в работе/.test(hubJs) || !/отклонено/.test(hubJs)) {
  fail("status buttons missing");
}
if (!/function partnerHubSaveAccess_/.test(hubJs) || !/function refreshPartnerOrdersTab_/.test(hubJs)) {
  fail("existing partners hub actions missing");
}
console.log("OK: manager partners block");

console.log("partner-suggest contract: all ok");
