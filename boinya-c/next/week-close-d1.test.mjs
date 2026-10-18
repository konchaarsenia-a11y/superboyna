import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {
  applyWeekClosePlan_,
  planWeekCloseD1_,
  weekCloseBoardNicks_,
  weekCloseCalendarNicks_,
  weekCloseCanonNative_,
  weekCloseClientCounts_,
  weekCloseCountsEqual_,
  weekCloseNickDiff_,
  weekCloseSlotAction_,
  weekCloseFinishAllowed_,
  weekSlotCountsFromOrders_
} from "../proxy/week-close-d1.js";

const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье", "Будущая неделя"];

function counts(mondayDates) {
  return {
    items: DAYS.map(function (day, i) {
      return { day: day, date: mondayDates[i], count: 0 };
    })
  };
}

test("флаг отката оставляет таблицу", function () {
  assert.equal(weekCloseCanonNative_("d1-sync"), true);
  assert.equal(weekCloseCanonNative_(""), true);
  assert.equal(weekCloseCanonNative_("sheets"), false);
  assert.equal(weekCloseCanonNative_("gas"), false);
  assert.equal(weekCloseCanonNative_("gas-async"), false);
  assert.equal(weekCloseCanonNative_("async"), false);
});

test("архив, будущая неделя и календарь без новых строк", function () {
  const orders = [
    { id: "Пн:A", client: "old", key: "OLD", date: "2026-10-12", day: "Понедельник", status: "active" },
    { id: "Будущая:B", client: "pushok", key: "PUSHOK", date: "2026-10-19", day: "Будущая неделя", status: "active" },
    { id: "CAL:C:2026-10-21", client: "wed", key: "WED", date: "2026-10-21", day: "", status: "active" },
    { id: "CAL:D:2026-10-26", client: "later", key: "LATER", date: "2026-10-26", day: "", status: "active" },
    { id: "Будущая:Z", client: "gone", key: "GONE", date: "2026-10-19", day: "Будущая неделя", status: "deleted" }
  ];
  const subs = [{ match_key: "OLD", nick: "old" }];
  const plan = planWeekCloseD1_({
    calendarMonday: "2026-10-12",
    todayIso: "2026-10-17",
    orders: orders,
    counts: counts(["12.10.2026", "13.10.2026", "14.10.2026", "15.10.2026", "16.10.2026", "17.10.2026", "18.10.2026", "19.10.2026"]),
    finished: {},
    stageCOk: false,
    warehouseCanon: true
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.mondayDate, "19.10.2026");
  assert.equal(plan.warehouseApply, false);
  assert.equal(plan.materializeAdded, 1);
  assert.equal(plan.futureMoved, 1);
  const after = applyWeekClosePlan_(orders, plan);
  assert.equal(after.length, orders.length);
  assert.deepEqual(weekCloseCountsEqual_(weekCloseClientCounts_(orders), weekCloseClientCounts_(after)), []);
  const byId = Object.fromEntries(after.map(function (o) { return [o.id, o]; }));
  assert.equal(byId["Пн:A"].day, "");
  assert.equal(byId["Пн:A"].date, "2026-10-12");
  assert.equal(byId["Пн:A"].status, "active");
  assert.equal(byId["Будущая:B"].day, "Понедельник");
  assert.equal(byId["Будущая:B"].date, "2026-10-19");
  assert.equal(byId["CAL:C:2026-10-21"].day, "Среда");
  assert.equal(byId["CAL:D:2026-10-26"].day, "Будущая неделя");
  const fut = plan.counts.find(function (it) { return it.day === "Будущая неделя"; });
  const mon = plan.counts.find(function (it) { return it.day === "Понедельник"; });
  assert.equal(fut.count, 1);
  assert.equal(fut.dateIso, "2026-10-26");
  assert.equal(mon.count, 1);
  assert.equal(mon.dateIso, "2026-10-19");
  assert.equal(byId["Будущая:Z"].day, "");
  assert.equal(byId["Будущая:Z"].status, "deleted");
  assert.deepEqual(weekCloseBoardNicks_(after, "2026-10-19")["2026-10-19"], ["pushok"]);
  assert.deepEqual(weekCloseBoardNicks_(after, "2026-10-19")["2026-10-21"], ["wed"]);
  assert.deepEqual(
    weekCloseNickDiff_(weekCloseCalendarNicks_(orders, "2026-10-19", "2026-10-25"), weekCloseBoardNicks_(after, "2026-10-19")),
    []
  );
  assert.equal(subs.length, 1);

  const again = planWeekCloseD1_({
    calendarMonday: "2026-10-12",
    todayIso: "2026-10-17",
    orders: after,
    counts: { items: plan.counts },
    finished: { "week_finished:2026-10-12": "1" },
    stageCOk: false,
    warehouseCanon: false
  });
  assert.equal(again.ok, false);
  assert.equal(again.message, "week_already_finished");
  assert.equal(again.updates, undefined);

  const monday = planWeekCloseD1_({
    calendarMonday: "2026-10-19",
    todayIso: "2026-10-19",
    orders: after,
    counts: { items: plan.counts },
    finished: { "week_finished:2026-10-12": "1" },
    stageCOk: true,
    warehouseCanon: true
  });
  assert.equal(monday.message, "week_already_finished");
  assert.equal(monday.reason, "monday_lock");
});

test("замок на той же неделе не останавливает повтор, указатель ещё 12.10", function () {
  const orders = [
    { id: "Понедельник:SASHINPUSHOK", client: "sashin.pushok", key: "SASHINPUSHOK", date: "2026-10-19", day: "Понедельник", status: "active" },
    { id: "old-mon", client: "old", key: "OLD", date: "2026-10-12", day: "Понедельник", status: "active" },
    { id: "CAL:LATER:2026-10-30", client: "later", key: "LATER", date: "2026-10-30", day: "", status: "active" }
  ];
  const plan = planWeekCloseD1_({
    calendarMonday: "2026-10-12",
    todayIso: "2026-10-18",
    orders: orders,
    counts: counts(["12.10.2026", "13.10.2026", "14.10.2026", "15.10.2026", "16.10.2026", "17.10.2026", "18.10.2026", "19.10.2026"]),
    finished: { "week_finished:2026-10-12": "1" },
    stageCOk: false,
    warehouseCanon: false
  });
  assert.equal(plan.ok, true, plan.message);
  assert.equal(plan.retriedStuckLock, true);
  assert.equal(plan.newMonday, "2026-10-19");
  assert.equal(plan.warehouseApply, false);
  assert.equal(weekCloseFinishAllowed_(plan).ok, true);
  const after = applyWeekClosePlan_(orders, plan);
  const byId = Object.fromEntries(after.map(function (o) { return [o.id, o]; }));
  assert.equal(byId["Понедельник:SASHINPUSHOK"].day, "Понедельник");
  assert.equal(byId["Понедельник:SASHINPUSHOK"].date, "2026-10-19");
  assert.equal(byId["old-mon"].day, "");
  assert.equal(byId["old-mon"].date, "2026-10-12");
  assert.equal(byId["CAL:LATER:2026-10-30"].day, "Будущая неделя");
  assert.equal(byId["CAL:LATER:2026-10-30"].date, "2026-10-30");
  const slot = weekSlotCountsFromOrders_(after, "2026-10-19");
  assert.equal(slot.find(function (it) { return it.day === "Понедельник"; }).count, 1);
  assert.equal(slot.find(function (it) { return it.day === "Будущая неделя"; }).count, 1);
  assert.deepEqual(weekCloseCountsEqual_(weekCloseClientCounts_(orders), weekCloseClientCounts_(after)), []);
});

test("повтор не создаёт вторую строку того же человека и даты", function () {
  const orders = [
    { id: "a", client: "one", key: "ONE", date: "2026-10-21", day: "", status: "active" },
    { id: "b", client: "one", key: "ONE", date: "2026-10-21", day: "", status: "active" }
  ];
  const plan = planWeekCloseD1_({
    calendarMonday: "2026-10-12",
    todayIso: "2026-10-17",
    orders: orders,
    counts: counts(["12.10.2026", "13.10.2026", "14.10.2026", "15.10.2026", "16.10.2026", "17.10.2026", "18.10.2026", "19.10.2026"]),
    finished: {},
    stageCOk: false,
    warehouseCanon: false
  });
  const after = applyWeekClosePlan_(orders, plan);
  const wed = after.filter(function (o) { return o.day === "Среда"; });
  assert.equal(wed.length, 1);
  assert.equal(after.length, 2);
});

test("позднюю дату слота не тянет назад", function () {
  const both = { "2026-10-12": "Понедельник", "2026-10-19": "Будущая неделя" };
  assert.equal(weekCloseSlotAction_("2026-10-19", "2026-10-12", both), "keep");
  assert.equal(weekCloseSlotAction_("19.10.2026", "12.10.2026", both), "keep");
  assert.equal(weekCloseSlotAction_("2026-10-14", "2026-10-15", { "2026-10-14": "Среда", "2026-10-15": "Четверг" }), "stamp_slot");
  assert.equal(weekCloseSlotAction_("2026-10-12", "2026-10-19", { "2026-10-19": "Понедельник" }), "detach");
  assert.equal(weekCloseSlotAction_("2026-10-19", "2026-10-19", both), "keep");
  assert.equal(weekCloseSlotAction_("", "2026-10-19", both), "stamp_empty");
});

test("закрытие пишет указатель до смены дней и откатывает состав", function () {
  const src = fs.readFileSync(new URL("../proxy/worker.js", import.meta.url), "utf8");
  const start = src.indexOf("async function closeWeekInD1_(");
  const end = src.indexOf("// deploy bump", start);
  const body = src.slice(start, end);
  const pointer = body.indexOf("publishWeekClosePointer_");
  const update = body.indexOf("UPDATE orders SET day_name");
  const check = body.indexOf("weekCloseNickDiff_");
  const lock = body.lastIndexOf('week_finished:"');
  assert.ok(pointer > 0 && pointer < update);
  assert.ok(update < check);
  assert.ok(check < lock);
  assert.ok(body.includes("rollbackWeekClose_"));
  assert.ok(body.includes("close_rolled_back"));
});

test("на месяце нет кнопки Новый заказ", async function () {
  const docks = [];
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    Object,
    Array,
    String,
    Number,
    Math,
    JSON,
    isFinite
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.BoinyaWeekLogic = {
    monthPeopleReady() { return false; },
    dayLoadMark() { return ""; },
    FULL_FROM: 8,
    countPpSlots() { return { pp1: 0, pp2: 0 }; },
    revenueSum() { return 0; },
    peopleForDate() { return []; },
    countFromMonth() { return 0; },
    stampPpPay() {},
    currentWeekKey() { return "2026-10-19"; },
    finishBannerState() { return {}; }
  };
  sandbox.BoinyaShell = {
    esc(s) { return String(s == null ? "" : s); },
    dock(html) { docks.push(String(html || "")); },
    main() {},
    skeleton() { return ""; },
    errorBox() { return ""; },
    empty() { return ""; }
  };
  sandbox.BoinyaApi = {
    apiGet() { return Promise.resolve({ status: "success", items: [], days: [] }); }
  };
  sandbox.BoinyaOrders = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL("./week.js", import.meta.url), "utf8"), sandbox, { filename: "week.js" });
  sandbox.BoinyaWeek.show("month", "");
  assert.ok(docks.length > 0);
  assert.equal(docks[docks.length - 1].includes("Новый заказ"), false);
  sandbox.BoinyaWeek.setDay("Понедельник");
  sandbox.BoinyaWeek.paint();
  assert.match(docks[docks.length - 1], /Новый заказ/);
});

test("кнопка не зовёт таблицу и не пересинхронизирует лист", function () {
  const src = fs.readFileSync(new URL("./week.js", import.meta.url), "utf8");
  const start = src.indexOf("async function runFinish");
  const end = src.indexOf("async function runPull");
  const body = src.slice(start, end);
  assert.equal(body.includes("Google Sheets"), false);
  assert.equal(body.includes("Бойня C · LIVE"), false);
  assert.equal(body.includes("Точно закрыть неделю сейчас?"), true);
  assert.ok(body.includes('res.weekCloseCanon === "d1-only"'));
  assert.ok(body.indexOf("forceWeekD1Resync") > body.indexOf("d1Only"));
});

test("живая копия: заказы, подписки и 19–25.10", function () {
  const path = process.env.WEEK_CLOSE_BRIEF || "/tmp/week-close-live/week-close-brief/brief.json";
  if (!fs.existsSync(path)) return;
  const brief = JSON.parse(fs.readFileSync(path, "utf8"));
  const orders = brief.orders;
  const plan = planWeekCloseD1_({
    calendarMonday: "2026-10-12",
    todayIso: "2026-10-17",
    orders: orders,
    counts: brief.snaps.weekDayCounts,
    finished: {},
    stageCOk: false,
    warehouseCanon: false
  });
  assert.equal(plan.ok, true, plan.message);
  const after = applyWeekClosePlan_(orders, plan);
  const orderDiff = weekCloseCountsEqual_(weekCloseClientCounts_(orders), weekCloseClientCounts_(after));
  assert.deepEqual(orderDiff, []);
  const nickDiff = weekCloseNickDiff_(
    weekCloseCalendarNicks_(orders, "2026-10-19", "2026-10-25"),
    weekCloseBoardNicks_(after, plan.newMonday)
  );
  assert.deepEqual(nickDiff, []);
  assert.equal(plan.newMonday, "2026-10-19");
  assert.equal(plan.warehouseApply, false);
  const again = planWeekCloseD1_({
    calendarMonday: "2026-10-12",
    todayIso: "2026-10-17",
    orders: after,
    counts: { items: plan.counts },
    finished: { "week_finished:2026-10-12": "1" },
    stageCOk: false,
    warehouseCanon: false
  });
  assert.equal(again.message, "week_already_finished");
});
