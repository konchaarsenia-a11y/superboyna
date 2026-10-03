import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ui = fs.readFileSync(path.resolve(here, "clients.js"), "utf8");
const gs = fs.readFileSync(path.resolve(here, "../../Code.gs"), "utf8");

const statsSrc = fs.readFileSync(path.resolve(here, "stats-logic.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(statsSrc, sandbox);
sandbox.window.BoinyaStatsLogic = sandbox.BoinyaStatsLogic;
vm.runInNewContext(ui, sandbox);
const totals = sandbox.window.BoinyaClients.ppListTotals_;
const fromStats = sandbox.window.BoinyaClients.ppMoneyFromStats_;

test("итог ПП: цена один раз на клиента, слоты не умножают", () => {
  const sum = totals([
    { sheet: "ПП", subId: "a", nick: "ann", deliveries: 2, turnover: 120, cost: 40 },
    { sheet: "ПП", subId: "a", nick: "ann", deliveries: 2, turnover: 120, cost: 40 },
    { sheet: "ПП", subId: "b", nick: "bob", deliveries: 2, turnover: 80, cost: 30 },
    { sheet: "БП", subId: "c", nick: "bp", deliveries: 1, turnover: 999, cost: 999 }
  ]);
  assert.equal(sum.clients, 2);
  assert.equal(sum.turnover, 200);
  assert.equal(sum.cost, 70);
  assert.equal(sum.income, 130);
});

test("себес без ячейки не выдумывается", () => {
  const sum = totals([
    { sheet: "ПП", subId: "a", turnover: 50, cost: null },
    { sheet: "ПП", rowIndex: 4, nick: "x", turnover: 10, cost: "" }
  ]);
  assert.equal(sum.turnover, 60);
  assert.equal(sum.cost, null);
  assert.equal(sum.income, null);
});

test("счётчики карточки убраны, итог стоит над списком ПП", () => {
  assert.equal(ui.includes("cardMetricRow"), false);
  assert.equal(ui.includes("refreshCardMetrics"), false);
  assert.ok(ui.includes("цена один раз на слоте с оплатой"));
  assert.equal(ui.includes("Все клиенты ПП, цена один раз"), false);
  assert.ok(ui.includes("function ppTotalsHtml"));
  const listAt = ui.indexOf("function paintList");
  const cardAt = ui.indexOf("function paintCard");
  assert.ok(ui.indexOf("ppTotalsHtml()", listAt) > listAt);
  assert.ok(ui.indexOf("ppTotalsHtml()", listAt) < cardAt);
  assert.equal(ui.slice(cardAt, cardAt + 800).includes(">Оборот<"), false);
});

test("сводка ПП равна статистике, а не сумме колонок листа", () => {
  const sheet = totals([
    { sheet: "ПП", subId: "a", turnover: 100, cost: 40 },
    { sheet: "ПП", subId: "b", turnover: 55, cost: 20 }
  ]);
  assert.equal(sheet.turnover, 155);
  const snap = fromStats({
    status: "success",
    monthKey: "2026-10",
    fact: {
      ppRevenue: 2480,
      revenue: 3000,
      cost: 1400,
      costBySource: { pp: 910 }
    }
  });
  assert.equal(snap.turnover, 2480);
  assert.equal(snap.cost, 910);
  assert.equal(snap.income, 1570);
  assert.notEqual(snap.turnover, sheet.turnover);
});

test("лист ПП отдаёт цену строки, не умножая слоты", () => {
  assert.ok(gs.includes("function ppListMoney_"));
  assert.ok(gs.includes("число слотов (колонка доставок) не множитель"));
  const at = gs.indexOf("function ppListMoney_(");
  const body = gs.slice(at, gs.indexOf("function collectPpMoneyStats_", at));
  assert.equal(body.includes("deliveries"), false);
  assert.ok(gs.includes("ppListMoney_(data[r], moneyCols)"));
});
