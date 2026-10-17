import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  applyWeekClosePlan_,
  planWeekCloseD1_,
  weekCloseBoardNicks_,
  weekCloseCalendarNicks_,
  weekCloseCanonNative_,
  weekCloseClientCounts_,
  weekCloseCountsEqual_,
  weekCloseNickDiff_
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
  assert.equal(byId["CAL:D:2026-10-26"].day, "");
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
