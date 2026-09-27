import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("./week-logic.js");

const tree = {
  clientsScreen: ["month", "week"],
  deferredScreen: ["xfer", "buy", "orders", "pp", "remind"]
};

test("полный день с 6, неделя как в старом списке", () => {
  assert.equal(L.FULL_FROM, 6);
  assert.deepEqual(L.WEEK.slice(0, 3), ["Понедельник", "Вторник", "Среда"]);
  assert.equal(L.WEEK[L.WEEK.length - 1], "Будущая неделя");
});

test("ключ недели — понедельник, воскресенье относится к той же неделе", () => {
  assert.equal(L.currentWeekKey(new Date(2026, 8, 27)), "2026-09-21");
  assert.equal(L.currentWeekKey(new Date(2026, 8, 21)), "2026-09-21");
  assert.equal(L.currentWeekKey(new Date(2026, 8, 23)), "2026-09-21");
});

test("тип заказа из сегмента и пометки, как resolveOrderType", () => {
  assert.equal(L.resolveOrderType({ segment: "БП" }), "bp");
  assert.equal(L.resolveOrderType({ note: "[SEG:Р]" }), "retail");
  assert.equal(L.resolveOrderType({ source: "partner" }), "partner");
  assert.equal(L.orderTypeToSegment("pp"), "ПП");
  assert.equal(L.segmentToOrderType("ПАРТНЁР"), "partner");
});

test("пропуски карточки: тип, адрес, телефон, корзина, партнёр БП", () => {
  assert.deepEqual(L.clientGaps({ name: "a" }), ["type", "address", "phone", "basket"]);
  assert.deepEqual(L.clientGaps({
    segment: "БП", address: "ул", phone: "1", basket: [{}]
  }), ["partner"]);
});

test("тост people-write: точно только после таблицы", () => {
  assert.equal(L.peopleToast({ status: "accepted", pendingSheets: true, writeId: "w" }, "сохранено"), "Вношу…");
  assert.equal(L.peopleToast({ status: "success", sheetsVerified: true }, "удалено"), "Точно удалено");
  assert.equal(L.peopleToast({ status: "error", message: "нет" }, "сохранено"), "нет");
  assert.equal(L.writeAccepted({ status: "accepted", writeId: "w" }), true);
  assert.equal(L.writeAccepted({ status: "error" }), false);
});

test("moveClient: нарезка и календарь", () => {
  var cut = L.moveParams({ client: "Анна", oldDay: "Среда", newDay: "Четверг", newDate: "2026-10-01", cutRaw: "yes", orderType: "pp", segment: "ПП" });
  assert.equal(cut.action, "moveClient");
  assert.equal(cut.cutRaw, "1");
  assert.equal(cut.noCut, "0");
  assert.equal(cut.dateOnly, "0");
  var same = L.moveParams({ client: "Анна", oldDay: "Среда", newDay: "Среда", oldDate: "2026-09-30", newDate: "2026-10-07", cutRaw: "no" });
  assert.equal(same.dateOnly, "1");
  assert.equal(same.cutRaw, "0");
  assert.equal(same.noCut, "1");
  var cal = L.moveParams({ client: "Анна", calendarOnly: true, newDay: "Среда", newDate: "2026-11-01" });
  assert.equal(cal.newDay, "");
  assert.equal(cal.calendarOnly, "1");
});

test("deleteClient и removeCalendarClient", () => {
  var del = L.deleteParams({ client: "Анна", day: "Среда", date: "2026-09-30", matchKey: "ANNA" });
  assert.equal(del.action, "deleteClient");
  assert.equal(del._explicitDelete, "1");
  assert.equal(del._userDelete, "1");
  var off = L.deleteParams({ client: "Анна", date: "2026-11-01", calendarOnly: true, matchKey: "ANNA" });
  assert.equal(off.action, "removeCalendarClient");
  assert.equal(off.day, undefined);
});

test("слот ПП и черновик месяца", () => {
  var slot = L.slotSaveParams({ name: "Анна", deliveriesN: 2, basket: [{ name: "Лёгкое", val: 100 }] }, 1, "2026-09-30", "Среда", false);
  assert.equal(slot.action, "saveBooking");
  assert.equal(slot.ppSlot, "1/2");
  assert.equal(slot.segment, "ПП");
  assert.equal(slot.alsoSaveOrder, "1");
  var off = L.slotSaveParams({ name: "Анна" }, 2, "2026-11-02", "Понедельник", true);
  assert.equal(off.calendarOnly, "1");
  assert.equal(off.day, "");
  var pull = L.pullPayload([{ name: "Анна", segment: "ПП", basket: [] }], "Среда", "");
  assert.equal(pull.action, "pullClientsFromMonth");
  assert.equal(pull.day, "Среда");
  assert.equal(JSON.parse(pull.clients)[0].client, "Анна");
});

test("перенос из задач — placeTransferTask", () => {
  var p = L.placeTransferParams({ id: "t1", client: "Анна", newDate: "2026-10-01", newDay: "Четверг", cutRaw: "no", segment: "ПП" });
  assert.equal(p.action, "placeTransferTask");
  assert.equal(p.cutRaw, "0");
  assert.equal(p.noCut, "1");
  assert.equal(p.newDay, "Четверг");
});

test("разделы задач", () => {
  assert.equal(L.tasksSub({ mode: "transfer" }), "xfer");
  assert.equal(L.tasksSub({ title: "Перенос Анна" }), "xfer");
  assert.equal(L.tasksSub({ mode: "partner" }), "orders");
  assert.equal(L.tasksSub({ mode: "buy" }), "buy");
  assert.equal(L.tasksSub({ mode: "remind" }), "remind");
  assert.equal(L.tasksSub({ mode: "bp_idle" }), "pp");
  assert.equal(L.tasksSub({}), "pp");
});

test("закрытие недели не стартует второй раз", () => {
  var g = L.finishGuard();
  assert.equal(g.tryBegin(), true);
  assert.equal(g.busy(), true);
  assert.equal(g.tryBegin(), false);
  g.end();
  assert.equal(g.tryBegin(), true);
});

test("вкладки доступов: все дети схлопываются в родителя", () => {
  var boxes = [
    { tab: "orderScreen", checked: true },
    { tab: "deferredScreen.xfer", parent: "deferredScreen", checked: true },
    { tab: "deferredScreen.buy", parent: "deferredScreen", checked: true },
    { tab: "deferredScreen.orders", parent: "deferredScreen", checked: true },
    { tab: "deferredScreen.pp", parent: "deferredScreen", checked: true },
    { tab: "deferredScreen.remind", parent: "deferredScreen", checked: true },
    { tab: "clientsScreen.month", parent: "clientsScreen", checked: true },
    { tab: "clientsScreen.week", parent: "clientsScreen", checked: false }
  ];
  assert.deepEqual(L.collectAccessTabs(tree, boxes), ["orderScreen", "clientsScreen.month", "deferredScreen"]);
  var none = boxes.map(function (b) {
    return b.parent === "deferredScreen" ? Object.assign({}, b, { checked: false }) : b;
  });
  var collapsed = L.collectAccessTabs(tree, none);
  assert.ok(collapsed.indexOf("deferredScreen.none") >= 0);
  assert.equal(collapsed.indexOf("deferredScreen"), -1);
});

test("уведомления: только отличие от роли", () => {
  var defs = L.NOTIFY_DEFAULTS.manager;
  assert.equal(L.notifyOverride(defs, defs), "");
  assert.equal(L.notifyOverride(defs, defs.concat(["access_req"])), "+access_req");
  assert.equal(L.notifyOverride(defs, defs.filter(function (k) { return k !== "survey"; })), "-survey");
});
