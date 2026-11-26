/**
 * t602u pack: ceh-move-nocut / cut-finish / courier-notgot / moves-info /
 * courier-req / settings-req / tg-dates-msg.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const L = require("./week-logic.js");
const worker = fs.readFileSync(path.join(dir, "../proxy/worker.js"), "utf8");
const weekUi = fs.readFileSync(path.join(dir, "week.js"), "utf8");
const prodUi = fs.readFileSync(path.join(dir, "production.js"), "utf8");
const tasksUi = fs.readFileSync(path.join(dir, "tasks.js"), "utf8");
const peopleUi = fs.readFileSync(path.join(dir, "people.js"), "utf8");
const nextHtml = fs.readFileSync(path.join(dir, "../next.html"), "utf8");
const swJs = fs.readFileSync(path.join(dir, "../sw.js"), "utf8");

test("ceh-move-nocut-h1: без нарезки → вопрос сборки, skipAssemble из ответа", () => {
  const needAsm = L.moveCutPlan({ cutMode: "none", skipAssemble: false, assemble: "1" });
  assert.equal(needAsm.noCut, "1");
  assert.equal(needAsm.skipAssemble, "0");
  assert.equal(needAsm.assemble, "1");
  assert.equal(needAsm.cutMode, "none");
  const noAsm = L.moveCutPlan({ cutMode: "none", skipAssemble: true });
  assert.equal(noAsm.skipAssemble, "1");
  assert.equal(noAsm.assemble, "0");
  const emptyPartial = L.moveCutPlan({ cutMode: "partial", cutItemKeys: "" });
  assert.equal(emptyPartial.skipAssemble, "1");
  assert.equal(emptyPartial.noCut, "1");
  assert.match(weekUi, /ceh-move-nocut-h1/);
  assert.match(weekUi, /Нужна ли сборка\?/);
  assert.match(weekUi, /alt2[\s\S]*Нужна ли сборка/);
  assert.match(worker, /ceh-move-nocut-h1/);
  assert.match(worker, /Нужна ли сборка/);
});

test("ceh-cut-finish-h1: finishCutting пишет completion в D1 сразу", () => {
  assert.match(worker, /deployMarker: "ceh-cut-finish-h1"/);
  const mark = worker.indexOf('deployMarker: "ceh-cut-finish-h1"');
  assert.ok(mark > 0);
  const chunk = worker.slice(Math.max(0, mark - 2500), mark + 200);
  assert.match(chunk, /completionOut\s*=/);
  assert.match(chunk, /cut\.completion\s*=\s*completionOut/);
  assert.match(chunk, /putSnap_\(env,\s*"cutting:"/);
  assert.match(prodUi, /ceh-cut-finish-h1/);
  assert.match(prodUi, /session\.finished/);
  const reb = worker.indexOf("async function rebuildCuttingDay_");
  assert.ok(reb > 0);
  assert.match(worker.slice(reb, reb + 2500), /keepFinished/);
});

test("courier-notgot-h1: openMissedParked + clear tombstone при park", () => {
  assert.match(worker, /function openMissedParkedAliasSet_/);
  assert.match(worker, /function clientInAliasSet_/);
  assert.match(worker, /courier-notgot-h1/);
  assert.match(worker, /clearDeferredCancelTombstone_/);
  assert.match(worker, /missedSet = await openMissedParkedAliasSet_/);
  assert.match(prodUi, /Снят с дня · только в Переносах/);
  const park = worker.indexOf("async function parkMissedDeliveryD1_");
  assert.ok(park > 0);
  const parkChunk = worker.slice(park, park + 6500);
  assert.match(parkChunk, /clearDeferredCancelTombstone_/);
  assert.match(parkChunk, /deployMarker: "courier-notgot-h1"/);
  const ens = worker.indexOf("async function ensureCourierDay_");
  assert.ok(ens > 0);
  assert.match(worker.slice(ens, ens + 1800), /missedSeed|openMissedParkedAliasSet_/);
});

test("moves-info-h1: карточка переноса с составом/причиной/суммой", () => {
  assert.match(tasksUi, /moves-info-h1/);
  assert.match(tasksUi, /function xferInfoHtml/);
  assert.match(tasksUi, /Откуда \/ причина/);
  assert.match(tasksUi, /Исходная дата/);
  assert.match(tasksUi, /Состав/);
  assert.match(worker, /orderPrice/);
});

test("courier-req-h1 / settings-req-h1: шаблон {amount} + IG + UI; ПП2 без кнопки", () => {
  assert.equal(typeof L.defaultPayRequisitesTemplate, "function");
  assert.equal(typeof L.fillPayRequisitesTemplate, "function");
  assert.equal(typeof L.igDmUrl, "function");
  assert.equal(typeof L.courierShowRequisites, "function");
  const tpl = L.defaultPayRequisitesTemplate();
  assert.match(tpl, /\{amount\}/);
  const filled = L.fillPayRequisitesTemplate("К оплате {amount} BYN", 42.5);
  assert.match(filled, /42,5/);
  assert.equal(L.igDmUrl("@foo_bar"), "https://ig.me/m/foo_bar");
  assert.equal(
    L.courierShowRequisites({ delivered: false, orderPrice: 10, segment: "ПП", ppSlot: 1, payDue: 10, ppPaid: false }),
    true
  );
  assert.equal(
    L.courierShowRequisites({ delivered: false, orderPrice: 10, segment: "ПП", ppSlot: 2, payDue: 10 }),
    false
  );
  assert.equal(L.courierShowRequisites({ delivered: true, orderPrice: 10, payDue: 10 }), false);
  assert.match(prodUi, /courier-req-h1/);
  assert.match(prodUi, /pr-pay-req/);
  assert.match(prodUi, /Отправить реквизиты/);
  assert.match(prodUi, /sendPayRequisites/);
  assert.match(peopleUi, /settings-req-h1/);
  assert.match(peopleUi, /pay-req-save/);
  assert.match(peopleUi, /payReqTpl/);
  assert.match(worker, /function getPayRequisitesTemplate_/);
  assert.match(worker, /function savePayRequisitesTemplate_/);
  assert.match(worker, /payRequisitesTemplate/);
  assert.match(worker, /deployMarker: "settings-req-h1"/);
});

test("tg-dates-msg-h1: IG HTML-ссылки + текст клиенту без дат", () => {
  assert.equal(typeof L.nudgeClientDatesText, "function");
  const clientTxt = L.nudgeClientDatesText();
  assert.match(clientTxt, /удобные даты/);
  assert.equal(/\d{1,2}\.\d{1,2}/.test(clientTxt), false);
  assert.match(worker, /tg-dates-msg-h1/);
  assert.match(worker, /function stageNNickLink_/);
  assert.match(worker, /function stageNClientDatesText_/);
  assert.match(worker, /nudgecopy:1/);
  assert.match(worker, /parse_mode:\s*"HTML"/);
  assert.match(worker, /callback_data: "nudgecopy:1"/);
  assert.match(worker, /function stageNIgHref_/);
  assert.match(worker, /ig\.me\/m\//);
  assert.match(worker, /<a href="/);
});

test("t602u deployMarker + VER 71125476", () => {
  assert.match(
    worker,
    /deployMarker: "ceh-move-nocut-h1\|ceh-cut-finish-h1\|courier-notgot-h1\|moves-info-h1\|courier-req-h1\|settings-req-h1\|tg-dates-msg-h1"/
  );
  assert.match(nextHtml, /71125476/);
  assert.match(swJs, /71125476/);
  assert.match(worker, /function previewSeedT602u_/);
  assert.match(worker, /previewSeedT602u/);
  assert.match(worker, /clearDeferredCancelTombstone_/);
});
