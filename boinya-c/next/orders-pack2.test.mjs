/**
 * orders-pack2-h1 — CI по пунктам второй пачки «Заказы».
 * Один assert-блок на номер ТЗ + desktop session + закрепы ключевых функций.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pay = require("./order-payload.js");

const ordersSrc = fs.readFileSync(path.join(here, "orders.js"), "utf8");
const weekSrc = fs.readFileSync(path.join(here, "week.js"), "utf8");
const appSrc = fs.readFileSync(path.join(here, "app.js"), "utf8");
const apiSrc = fs.readFileSync(path.join(here, "api.js"), "utf8");
const peopleSrc = fs.readFileSync(path.join(here, "people.js"), "utf8");
const payloadSrc = fs.readFileSync(path.join(here, "order-payload.js"), "utf8");
const workerSrc = fs.readFileSync(path.join(here, "../proxy/worker.js"), "utf8");
const nextHtml = fs.readFileSync(path.join(here, "../next.html"), "utf8");

test("#14 Кто привёл: опция Инстаграм", () => {
  assert.match(ordersSrc, /orders-pack2: #14/);
  assert.match(ordersSrc, /value="Инстаграм"/);
  assert.match(ordersSrc, />Инстаграм<\/option>/);
});

test("#15 платная доставка +15", () => {
  assert.match(ordersSrc, /orders-pack2: #15/);
  assert.match(ordersSrc, /segBtn\("del15", "Да \+15"/);
  assert.match(ordersSrc, /id === "del15"/);
  assert.match(ordersSrc, /retailDeliveryFee = 15/);
});

test("#16 партнёр без карточки → partnerCalcPrice (Varka)", () => {
  assert.match(ordersSrc, /orders-pack2: #16/);
  assert.match(ordersSrc, /function syncPartnerPrice/);
  assert.match(ordersSrc, /action: "partnerCalcPrice"/);
  assert.match(ordersSrc, /partner-price-auto/);
  assert.match(workerSrc, /partnerQuoteTreatsByn_/);
});

test("#19 смена ника без delete+create", () => {
  assert.match(ordersSrc, /orders-pack2: #19/);
  assert.doesNotMatch(
    ordersSrc,
    /editOriginalClient[\s\S]{0,200}action: "deleteClient"/
  );
  assert.match(payloadSrc, /editClient: editClient/);
  assert.match(payloadSrc, /orders-pack2: #19/);
  // Worker: in-place rename planner, не soft-delete всех строк старого ника
  assert.match(workerSrc, /planOrderNickRenameKeep_/);
  assert.match(workerSrc, /orderNickRenameIsInPlace_/);
  assert.match(workerSrc, /orders-pack2 #19/);
  const eng = require("./order-engine.js");
  const book = pay.buildSaveBookingParams(
    {
      isEdit: true,
      editOriginalClient: "old_nick",
      editOriginalMatchKey: "OLD_NICK",
      editOriginalDay: "Понедельник",
      editOriginalDate: "2026-11-03",
      client: "new_nick",
      orderType: "pp",
      deliveryDate: "2026-11-03",
      baskets: { 1: [{ cat: "dressura", main: "СЕРДЦЕ", name: "СЕРДЦЕ", value: 50, sub: "Мелкое" }] },
      dogCount: 1,
      activeDog: 1,
      notes: [],
      address: "тест 1"
    },
    eng,
    "Понедельник"
  );
  assert.equal(book.client, "new_nick");
  assert.equal(book.editClient, "old_nick");
  assert.equal(book.matchKey, "OLD_NICK");
  assert.equal(book.isEdit, "1");
  assert.equal(book.action, "saveBooking");
});

test("#21 сводка за месяц: owner или monthSummaryScreen", () => {
  assert.match(weekSrc, /orders-pack2: #21/);
  assert.match(weekSrc, /function canSeeMonthSummary/);
  assert.match(weekSrc, /monthSummaryScreen/);
  assert.match(peopleSrc, /monthSummaryScreen", "Сводка за месяц"/);
  assert.match(workerSrc, /"monthSummaryScreen"/);
});

test("#23 перенос in-place UPDATE той же записи", () => {
  assert.match(workerSrc, /orders-pack2 #23/);
  assert.match(workerSrc, /planOrderMoveInPlace_/);
  assert.match(workerSrc, /orderMoveIsInPlace_/);
  assert.match(workerSrc, /UPDATE orders SET id = \?, date_iso = \?, day_name = \?/);
  assert.doesNotMatch(
    workerSrc,
    /fallback: если PK id нельзя сменить на занятый — upsert \+ soft-delete старого/
  );
});

test("#25 Неделя завершена + finishWeekScreen", () => {
  assert.match(weekSrc, /orders-pack2: #25/);
  assert.match(weekSrc, /Неделя завершена/);
  assert.match(weekSrc, /function canFinishWeek/);
  assert.match(weekSrc, /finishWeekScreen/);
  assert.match(peopleSrc, /finishWeekScreen", "Завершать неделю"/);
  assert.match(workerSrc, /finishFullWeek\[A-Za-z\]\*\|getFinishWeekStatus/);
  assert.match(workerSrc, /tabs: \["finishWeekScreen"\]/);
  assert.doesNotMatch(
    workerSrc.slice(workerSrc.indexOf("const AUTH_OWNER_RE"), workerSrc.indexOf("const AUTH_OWNER_RE") + 900),
    /finishFullWeek\[A-Za-z\]\*/
  );
});

test("desktop: долгоживущая сессия ds1", () => {
  assert.match(workerSrc, /signDesktopSession_/);
  assert.match(workerSrc, /verifyDesktopSession_/);
  assert.match(workerSrc, /DESKTOP_SESSION_TTL_SEC_/);
  assert.match(apiSrc, /nx_desk_sess_v1/);
  assert.match(apiSrc, /rememberDesktopSession/);
  assert.match(apiSrc, /desktopSession/);
  assert.match(appSrc, /rememberDesktopSession/);
});

test("cache bump present", () => {
  assert.match(nextHtml, /v=7112545\d/);
});

/* —— закрепы функций страницы «Заказы» (не ломать следующими правками) —— */

test("lock: типы заказа ПП/БП/Розница/Партнёр", () => {
  assert.match(ordersSrc, /id: "pp"/);
  assert.match(ordersSrc, /id: "bp"/);
  assert.match(ordersSrc, /id: "retail"/);
  assert.match(ordersSrc, /id: "partner"/);
});

test("lock: ник + suggest + адрес + дата-календарь", () => {
  assert.match(ordersSrc, /id="client"/);
  assert.match(ordersSrc, /scheduleSuggest/);
  assert.match(ordersSrc, /scheduleAddress/);
  assert.match(ordersSrc, /function openCal|act === "cal"/);
  assert.match(ordersSrc, /paintUnlessTyping/);
});

test("lock: заметки постоянные + IG scrub + haptic picker", () => {
  assert.match(ordersSrc, /pullPermanentNotes/);
  assert.match(ordersSrc, /scrubIgPasteDeliveries/);
  assert.match(ordersSrc, /hapticLight/);
});

test("lock: На потом + cancelDeferred", () => {
  assert.match(ordersSrc, /saveDeferred/);
  assert.match(ordersSrc, /cancelDeferred/);
  assert.match(ordersSrc, /closeDeferredId/);
});

test("lock: Месяц — календарь, перенос moveClient, удаление", () => {
  assert.match(weekSrc, /function monthCal|monthCal\(/);
  assert.match(weekSrc, /moveParams/);
  assert.match(weekSrc, /deleteParams/);
  assert.match(weekSrc, /data-act="wmove"/);
  assert.match(weekSrc, /async function moveOne/);
  // drop-move-pull: #23 — draft-stage убран
  assert.doesNotMatch(weekSrc, /data-act="wstage"/);
  assert.doesNotMatch(weekSrc, /data-act="wdraft-save"/);
});

test("lock: баннер недели без регресса #27 finish", () => {
  assert.match(weekSrc, /data-act="wfin"/);
  assert.match(weekSrc, /Неделя ещё открыта/);
});

test("lock: #26 materialize UI убран", () => {
  // drop-move-pull: #26
  assert.doesNotMatch(appSrc, /data-act="wpull"/);
  assert.doesNotMatch(weekSrc, /action: "materializeWeek"/);
  assert.doesNotMatch(weekSrc, /async function runPull/);
});

test("lock: нет «Новый заказ» в dock Месяца; legacy снят", () => {
  assert.doesNotMatch(weekSrc, /data-act="go-new">Новый заказ/);
  assert.match(appSrc, /legacy снят|без ссылки на legacy/);
});
