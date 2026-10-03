import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
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

test("подсветка дня: от 4 зелёный, от 6 оранжевый, от 8 красный", () => {
  assert.equal(L.dayLoadMark(0), "");
  assert.equal(L.dayLoadMark(3), "");
  assert.equal(L.dayLoadMark(4), "ok");
  assert.equal(L.dayLoadMark(5), "ok");
  assert.equal(L.dayLoadMark(6), "warn");
  assert.equal(L.dayLoadMark(7), "warn");
  assert.equal(L.dayLoadMark(8), "bad");
  assert.equal(L.dayLoadMark(12), "bad");
});

test("слот ПП тумблером, доп информация крупнее, плашка 14px", () => {
  const orders = fs.readFileSync(path.join(dir, "orders.js"), "utf8");
  const week = fs.readFileSync(path.join(dir, "week.js"), "utf8");
  const prod = fs.readFileSync(path.join(dir, "production.js"), "utf8");
  const shell = fs.readFileSync(path.join(dir, "shell.js"), "utf8");
  const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
  assert.match(orders, /nx-pp-toggle/);
  assert.match(orders, /data-act="seg" data-seg="pp1"|segBtn\("pp1"/);
  assert.match(week, /data-act="wslot"/);
  assert.match(week, /nx-pp-toggle/);
  assert.match(orders, /Доп информация/);
  assert.match(orders, /nx-extra-info/);
  assert.match(prod, /Доп информация/);
  assert.match(prod, /nx-extra-info/);
  assert.match(shell, /dayLoadMark/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /#nxDock\.nx-dock--order \.b-sum__k[\s\S]*font-size:\s*var\(--b-f14\)/);
  assert.doesNotMatch(orders, /Доп · информация|ПП1 · ПП2/);
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

test("открытие дня: месяц и кэш без сети, иначе скелетон", () => {
  const people = Array.from({ length: 8 }, (_, i) => ({ name: "c" + i, segment: "ПП" }));
  const ready = L.dayOpenPlan({ date: "2026-10-02", people: people, now: 1000, overviewCount: 8 });
  assert.equal(ready.fetch, "none");
  assert.equal(ready.paint, "clients");
  assert.equal(ready.res.month.length, 8);
  const cached = L.dayOpenPlan({
    date: "2026-10-02",
    cached: { at: 1000, res: { status: "success", month: people, week: [] } },
    now: 5000,
    ttl: 30000
  });
  assert.equal(cached.fetch, "none");
  assert.equal(cached.source, "cache");
  const stale = L.dayOpenPlan({
    date: "2026-10-02",
    cached: { at: 0, res: { status: "success", month: people, week: [] } },
    now: 60000,
    ttl: 30000,
    staleTtl: 300000
  });
  assert.equal(stale.fetch, "background");
  assert.equal(stale.paint, "clients");
  const cold = L.dayOpenPlan({ date: "2026-10-03", now: 1, overviewCount: 8 });
  assert.equal(cold.paint, "skeleton");
  assert.equal(cold.fetch, "now");
  assert.equal(cold.skeletonRows, 8);
  const pack = { source: "d1", byDate: { "2026-10-02": people } };
  assert.equal(L.monthPeopleReady(pack, null), true);
  assert.equal(L.monthPeopleReady({ source: "d1", byDate: {} }, null), false);
  assert.equal(L.monthPeopleReady({ source: "d1", byDate: {} }, { days: [] }), true);
  assert.equal(L.monthPeopleReady({ source: "d1-error", byDate: {} }, { days: [] }), false);
});

test("уведомления: только отличие от роли", () => {
  var defs = L.NOTIFY_DEFAULTS.manager;
  assert.equal(L.notifyOverride(defs, defs), "");
  assert.equal(L.notifyOverride(defs, defs.concat(["access_req"])), "+access_req");
  assert.equal(L.notifyOverride(defs, defs.filter(function (k) { return k !== "survey"; })), "-survey");
});
