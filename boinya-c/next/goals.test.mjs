import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const goals = require("./goals-logic.js");
const stats = require("./stats-logic.js");
const ui = fs.readFileSync(path.resolve(here, "goals.js"), "utf8");
const worker = fs.readFileSync(path.resolve(here, "../proxy/worker.js"), "utf8");

function extractFn(src, name) {
  const re = new RegExp("function " + name + "\\s*\\(");
  const i = src.search(re);
  assert.ok(i >= 0, "missing " + name);
  let depth = 0;
  let started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") {
      depth++;
      started = true;
    } else if (src[j] === "}") {
      depth--;
      if (started && depth === 0) return src.slice(i, j + 1);
    }
  }
  throw new Error("unclosed " + name);
}

const now = new Date(2026, 9, 2, 12, 0, 0);

test("процент задач: done/total, пустой список 0", () => {
  assert.deepEqual(goals.taskPct([]), { done: 0, total: 0, pct: 0 });
  assert.deepEqual(goals.taskPct([{ done: true }, { done: false }, { done: false }, { done: false }]), {
    done: 1,
    total: 4,
    pct: 25
  });
  assert.equal(goals.taskPct([{ done: true }, { done: false }, { done: false }]).pct, 33);
  assert.equal(goals.taskPct([{ done: true }, { done: true }]).pct, 100);
});

test("границы периодов от 2 октября 2026", () => {
  assert.deepEqual(goals.periodBounds("day", now), { from: "2026-10-02", to: "2026-10-02", ok: true });
  assert.deepEqual(goals.periodBounds("week", now), { from: "2026-09-28", to: "2026-10-04", ok: true });
  assert.deepEqual(goals.periodBounds("month", now), { from: "2026-10-01", to: "2026-10-31", ok: true });
  assert.deepEqual(goals.periodBounds("half", now), { from: "2026-07-01", to: "2026-12-31", ok: true });
  assert.deepEqual(goals.periodBounds("year", now), { from: "2026-01-01", to: "2026-12-31", ok: true });
  const custom = goals.periodBounds("custom", now, "2026-10-10", "2026-10-01");
  assert.equal(custom.from, "2026-10-01");
  assert.equal(custom.to, "2026-10-10");
});

test("оборот и приход берутся из statsFacts_ и statsExpectedNumbers_", () => {
  const month = {
    status: "success",
    fact: { revenue: 180, cost: 50, deliveries: 7 },
    money: { turnover: 180, cost: 50 }
  };
  const facts = stats.statsFacts_(month);
  const turn = goals.evaluateMetric("turnover", { stats: month }, 100, stats);
  const income = goals.evaluateMetric("income", { stats: month }, 100, stats);
  assert.equal(turn.status, "ok");
  assert.equal(turn.current, facts.profitFact);
  assert.equal(turn.current, 180);
  assert.equal(turn.pct, 100);
  assert.equal(turn.reached, true);
  assert.equal(income.current, facts.cleanFact);
  assert.equal(income.current, stats.statsClean_(180, 50));
  assert.equal(income.reached, true);
  const bare = { status: "success", fact: { revenue: 80 }, money: { turnover: 80 } };
  assert.equal(goals.evaluateMetric("income", { stats: bare }, 10, stats).status, "nodata");
  const range = { status: "success", revenue: 80, cost: 30, deliveries: 4 };
  const expected = stats.statsExpectedNumbers_(range);
  const rangeTurn = goals.evaluateMetric("turnover", { stats: range }, 100, stats);
  const rangeIncome = goals.evaluateMetric("income", { stats: range }, 40, stats);
  assert.equal(rangeTurn.current, expected.profit);
  assert.equal(rangeIncome.current, expected.clean);
  assert.equal(rangeIncome.current, stats.statsClean_(80, 30));
  assert.equal(rangeIncome.reached, true);
  assert.equal(goals.evaluateMetric("orders", { stats: range }, 10, stats).current, 4);
});

test("показатель закрывается сам, когда текущее не меньше цели", () => {
  const snap = {
    stats: { status: "success", revenue: 120, cost: 20, deliveries: 3 },
    subscriptions: [
      { nick: "рекс", sheet: "ПП" },
      { nick: "барсик", sheet: "ПП" },
      { nick: "новичок", sheet: "БП" },
      { nick: "", sheet: "ПП" }
    ]
  };
  const reading = goals.evaluateMetric("turnover", snap, 100, stats);
  assert.equal(reading.reached, true);
  assert.equal(reading.pct, 100);
  const open = { id: "g1", kind: "metric", metricId: "turnover", target: 100, done: false, doneAt: "" };
  const closed = goals.applyAutoComplete(open, reading, "2026-10-02");
  assert.equal(closed.changed, true);
  assert.equal(closed.goal.done, true);
  assert.equal(closed.goal.doneAt, "2026-10-02");
  const again = goals.applyAutoComplete(closed.goal, reading, "2026-10-03");
  assert.equal(again.changed, false);
  assert.equal(again.goal.doneAt, "2026-10-02");
  const short = goals.evaluateMetric("turnover", snap, 200, stats);
  assert.equal(short.reached, false);
  assert.equal(short.pct, 60);
  assert.equal(goals.applyAutoComplete(open, short, "2026-10-02").changed, false);
  const missing = goals.evaluateMetric("kg", snap, 5, stats);
  assert.equal(missing.status, "nodata");
  assert.equal(goals.applyAutoComplete(Object.assign({}, open, { metricId: "kg" }), missing, "2026-10-02").changed, false);
  assert.equal(goals.evaluateMetric("ppClients", snap, 2, stats).current, 2);
  assert.equal(goals.evaluateMetric("ppClients", snap, 2, stats).reached, true);
  assert.equal(goals.evaluateMetric("orders", snap, 3, stats).reached, true);
});

test("новые клиенты и кг: нет данных, пока в ответе нет поля", () => {
  const month = goals.periodBounds("month", now);
  const snap = {
    stats: { status: "success", fact: { revenue: 10, cost: 4, deliveries: 1 }, money: { turnover: 10, cost: 4 } },
    subscriptions: [{ nick: "рекс", sheet: "ПП" }, { nick: "анна", sheet: "ПП", createdAt: "2026-10-02" }],
    from: month.from,
    to: month.to
  };
  const withoutDates = {
    stats: snap.stats,
    subscriptions: [{ nick: "рекс", sheet: "ПП" }],
    from: month.from,
    to: month.to
  };
  assert.equal(goals.evaluateMetric("newClients", withoutDates, 1, stats).status, "nodata");
  assert.equal(goals.evaluateMetric("kg", snap, 1, stats).status, "nodata");
  const dated = goals.evaluateMetric("newClients", snap, 1, stats);
  assert.equal(dated.status, "ok");
  assert.equal(dated.current, 1);
  assert.equal(dated.reached, true);
  const grams = goals.evaluateMetric("kg", { stats: { status: "success", fact: { grams: 2500, revenue: 1, cost: 1 } } }, 3, stats);
  assert.equal(grams.current, 2.5);
  const labels = goals.unavailableReport(withoutDates, stats).map((m) => m.id);
  assert.deepEqual(labels, ["newClients", "kg"]);
});

test("экран без точки-разделителя, помощник только в TODO", () => {
  assert.equal(ui.includes("·"), false);
  assert.match(ui, /TODO: Помощник по целям/);
  assert.equal(ui.includes("Помощник по целям</"), false);
  assert.match(ui, /нет данных/);
});

test("уведомление Telegram выключено, пока GOALS_TG_NOTIFY не равен 1", () => {
  const ctx = createContext({});
  runInContext(
    [extractFn(worker, "goalsNotifyEnabled_"), extractFn(worker, "goalsShouldNotify_")].join("\n"),
    ctx
  );
  assert.equal(ctx.goalsNotifyEnabled_({}), false);
  assert.equal(ctx.goalsNotifyEnabled_({ GOALS_TG_NOTIFY: "0" }), false);
  assert.equal(ctx.goalsNotifyEnabled_({ GOALS_TG_NOTIFY: "off" }), false);
  assert.equal(ctx.goalsNotifyEnabled_({ GOALS_TG_NOTIFY: "1" }), true);
  assert.equal(ctx.goalsShouldNotify_({}, "metric", true, false), false);
  assert.equal(ctx.goalsShouldNotify_({ GOALS_TG_NOTIFY: "1" }, "metric", true, false), true);
  assert.equal(ctx.goalsShouldNotify_({ GOALS_TG_NOTIFY: "1" }, "task", true, false), false);
  assert.equal(ctx.goalsShouldNotify_({ GOALS_TG_NOTIFY: "1" }, "metric", true, true), false);
  const hook = extractFn(worker, "maybeNotifyGoalDone_");
  const flagAt = hook.indexOf("goalsNotifyEnabled_");
  const sendAt = hook.indexOf("telegramSendTextWorker_");
  assert.ok(flagAt >= 0 && sendAt > flagAt);
  assert.equal(hook.includes("PRIMA_ZAGAR_BOT_TOKEN"), false);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS goals/);
  const authStart = worker.indexOf("const AUTH_OWNER_RE");
  const authEnd = worker.indexOf("const AUTH_TABS_ORDERS");
  const auth = worker.slice(authStart, authEnd);
  assert.doesNotMatch(auth, /listGoals\|saveGoal\|deleteGoal/);
  assert.match(worker, /GOALS_TG_NOTIFY/);
  const ensure = extractFn(worker, "ensureGoals_");
  assert.match(ensure, /ALTER TABLE goals ADD COLUMN scope TEXT NOT NULL DEFAULT ''/);
  assert.match(ensure, /ALTER TABLE goals ADD COLUMN owner_tg_id TEXT NOT NULL DEFAULT ''/);
  assert.match(ensure, /catch \(eScope\)/);
  assert.match(ensure, /catch \(eOwner\)/);
  const schema = fs.readFileSync(path.resolve(here, "../proxy/schema.sql"), "utf8");
  assert.match(schema, /scope TEXT NOT NULL DEFAULT ''/);
  assert.match(schema, /owner_tg_id TEXT NOT NULL DEFAULT ''/);
});

test("задачи личные и общие, показатели только владельцу", () => {
  const ctx = createContext({});
  runInContext(
    [
      extractFn(worker, "goalScopeOf_"),
      extractFn(worker, "goalActorOwner_"),
      extractFn(worker, "goalActorTid_"),
      extractFn(worker, "goalRowVisible_"),
      extractFn(worker, "goalAssign_")
    ].join("\n"),
    ctx
  );
  const owner = { isOwner: true, tid: "1", role: "owner" };
  const maria = { isOwner: false, tid: "200", role: "manager" };
  const courier = { isOwner: false, tid: "300", role: "courier" };
  assert.equal(ctx.goalScopeOf_({ kind: "task", scope: "", owner_tg_id: "" }).scope, "shared");
  assert.equal(ctx.goalRowVisible_({ kind: "task", scope: "", owner_tg_id: "" }, courier), true);
  const mine = { kind: "task", scope: "person", owner_tg_id: "200" };
  assert.equal(ctx.goalRowVisible_(mine, maria), true);
  assert.equal(ctx.goalRowVisible_(mine, courier), false);
  assert.equal(ctx.goalRowVisible_(mine, owner), true);
  assert.equal(ctx.goalRowVisible_({ kind: "metric", scope: "", owner_tg_id: "" }, maria), false);
  assert.equal(ctx.goalRowVisible_({ kind: "metric", scope: "", owner_tg_id: "" }, owner), true);
  const shared = ctx.goalAssign_({ scope: "shared" }, null, maria, "task");
  assert.equal(shared.ok, true);
  assert.equal(shared.scope, "");
  assert.equal(shared.ownerTgId, "");
  assert.equal(ctx.goalAssign_({ scope: "person", ownerTgId: "1" }, null, maria, "task").ok, false);
  assert.equal(ctx.goalAssign_({ scope: "me" }, null, maria, "task").ownerTgId, "200");
  assert.equal(ctx.goalAssign_({}, mine, maria, "task").scope, "person");
  assert.equal(ctx.goalAssign_({}, mine, maria, "task").ownerTgId, "200");
  assert.equal(ctx.goalAssign_({ kind: "metric" }, null, maria, "metric").ok, false);
  assert.equal(ctx.goalAssign_({ scope: "person", ownerTgId: "300" }, null, owner, "task").ok, true);
  assert.equal(ctx.goalAssign_({ scope: "person", ownerTgId: "300" }, null, owner, "task").ownerTgId, "300");
  assert.match(ui, /Общие/);
  assert.match(ui, /Общая/);
  assert.match(ui, /scopeChip\("me", "Мне"/);
  assert.match(ui, /gl-scope/);
  assert.equal(ui.includes("·"), false);
  assert.match(ui, /if \(!isOwner\(\)\) return ""/);
});
