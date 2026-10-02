import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("./week-logic.js");

const tree = {
  clientsScreen: ["month", "week"],
  deferredScreen: ["xfer", "buy", "orders", "pp", "remind"]
};

test("баннер закрытия не верит локальной пометке, если сервер говорит что неделя открыта", () => {
  const open = L.finishBannerState({
    weekKey: "2026-09-21",
    fetched: true,
    finished: false,
    sheetMonday: "2026-09-21",
    hideFin: "1"
  });
  assert.equal(open.clearLocal, true);
  assert.equal(open.realClosed, false);
  assert.equal(open.showFinish, true);
  const ahead = L.finishBannerState({
    weekKey: "2026-09-21",
    fetched: true,
    finished: false,
    sheetMonday: "2026-09-28"
  });
  assert.equal(ahead.realClosed, true);
  assert.equal(ahead.showFinish, false);
  assert.equal(L.finishPlain({ message: "week_finish_started" }), "week_finish_started");
  assert.match(L.finishPlain({ message: "week_finish_unknown" }), /Кнопку не нажимайте/);
  assert.equal(L.finishPendingActive(Date.now() + 1000, Date.now()), true);
  assert.equal(L.finishPendingActive(Date.now() - 1000, Date.now()), false);
});

test("день календаря открывается из кэша или ростера месяца, иначе скелетон", () => {
  var cache = { "2026-10-15|": { at: 1000, res: { status: "success", month: [{ name: "Мира" }], week: [] } } };
  var cached = L.planCalendarDayOpen({
    key: "2026-10-15|",
    iso: "2026-10-15",
    compareCache: cache,
    now: 2000,
    ttl: 30000
  });
  assert.equal(cached.mode, "cache");
  assert.equal(cached.fetchCompare, false);
  var roster = L.planCalendarDayOpen({
    key: "2026-10-16|",
    iso: "2026-10-16",
    compareCache: cache,
    rosterByDate: { "2026-10-16": [{ name: "Рекс" }, { name: "Луна" }] },
    now: 2000
  });
  assert.equal(roster.mode, "roster");
  assert.equal(roster.fetchCompare, true);
  assert.equal(roster.soft, true);
  assert.equal(roster.clients.length, 2);
  var cold = L.planCalendarDayOpen({
    key: "2026-10-17|",
    iso: "2026-10-17",
    compareCache: {},
    rosterByDate: {},
    overviewByDate: { "2026-10-17": { count: 8 } },
    now: 2000
  });
  assert.equal(cold.mode, "skeleton");
  assert.equal(cold.fetchCompare, true);
  assert.equal(cold.skeleton, 8);
  var stale = L.planCalendarDayOpen({
    key: "2026-10-15|",
    iso: "2026-10-15",
    compareCache: cache,
    rosterByDate: { "2026-10-15": [{ name: "Рекс" }] },
    now: 1000 + 30001
  });
  assert.equal(stale.mode, "roster");
});

test("полный день с 8, неделя как в старом списке", () => {
  assert.equal(L.FULL_FROM, 8);
  assert.equal(L.fullDayPrompt(7), "");
  assert.equal(L.fullDayPrompt(8), "На этот день уже 8 записей Добавить ещё?");
  assert.equal(L.fullDayPrompt(21), "На этот день уже 21 запись Добавить ещё?");
  assert.equal(L.fullDayPrompt(22), "На этот день уже 22 записи Добавить ещё?");
  assert.equal(L.countFromMonth({ days: [{ dateIso: "2026-09-30", count: 9 }] }, "2026-09-30"), 9);
  assert.equal(L.countFromMonth({ days: [] }, "2026-09-30"), 0);
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
