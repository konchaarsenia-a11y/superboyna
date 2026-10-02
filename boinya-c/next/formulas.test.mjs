import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const F = require("./formulas.js");

function eq(actual, expected, label) {
  assert.equal(actual, expected, label + " " + actual + " != " + expected);
}

test("8.1 розница, 2 корня, 1 доставка", () => {
  const r = F.formulaRetail_({ S: 3.82, G: 0, P: 2, N: 1, R: 24 });
  eq(r.raw, 3.82, "сырьё");
  eq(r.cut, 1, "зп нарезка");
  eq(r.assembly, 3, "зп сборка");
  eq(r.light, 0.6, "свет");
  eq(r.pack, 1.6, "упаковка");
  eq(r.road, 4, "дорога");
  eq(r.cost, 14.02, "себес");
  eq(r.price, 33, "цена");
  eq(r.margin, 18.98, "маржа");
});

test("8.2 розница, 200 г лёгкого, 1 доставка", () => {
  const r = F.formulaRetail_({ S: 4.5, G: 200, P: 0, N: 1, R: 22 });
  eq(r.raw, 4.5, "сырьё");
  eq(r.cut, 5, "зп нарезка");
  eq(r.assembly, 3, "зп сборка");
  eq(r.light, 1.6, "свет");
  eq(r.pack, 2.6, "упаковка");
  eq(r.road, 4, "дорога");
  eq(r.cost, 20.7, "себес");
  eq(r.price, 31, "цена");
  eq(r.margin, 10.3, "маржа");
});

test("8.3 подписка, 2 корня, 1 доставка", () => {
  const r = F.formulaSub_({ S: 3.82, G: 0, P: 2, N: 1, R: 24, F: 0 });
  eq(r.goods, 10.93, "товар");
  eq(r.price, 19.93, "цена");
  eq(r.cost, 14.02, "себес");
  eq(r.margin, 5.91, "маржа");
  eq(r.marginCheck, 5.91, "проверка");
  eq(r.ceiling, 0, "потолок");
});

test("8.4 подписка, 200 г лёгкого среднего, 1 доставка", () => {
  const r = F.formulaSub_({ S: 4.5, G: 200, P: 0, N: 1, R: 22, F: 4 });
  eq(r.goods, 19.5, "товар");
  eq(r.price, 32.5, "цена");
  eq(r.cost, 20.7, "себес");
  eq(r.margin, 11.8, "маржа");
  eq(r.marginCheck, 11.8, "проверка");
});

test("8.5 набор, подписка и розница, 1 и 4 доставки", () => {
  const base = { S: 15.84, G: 300, P: 6, R: 90, F: 4 };
  const sub1 = F.formulaSub_(Object.assign({ N: 1 }, base));
  eq(sub1.raw, 15.84, "сырьё");
  eq(sub1.cut, 10.5, "зп нарезка");
  eq(sub1.assembly, 3, "зп сборка");
  eq(sub1.light, 4.2, "свет");
  eq(sub1.pack, 3.8, "упаковка");
  eq(sub1.road, 4, "дорога");
  eq(sub1.cost, 41.34, "себес 1");
  eq(sub1.goods, 55.88, "товар");
  eq(sub1.price, 68.88, "цена пп 1");
  eq(sub1.margin, 27.54, "маржа пп 1");
  eq(sub1.marginCheck, 27.54, "проверка пп 1");
  eq(sub1.wage, 13.5, "зп 1");

  const ret1 = F.formulaRetail_(Object.assign({ N: 1 }, base));
  eq(ret1.delivery, 0, "доставка 0");
  eq(ret1.price, 90, "цена розница 1");
  eq(ret1.margin, 48.66, "маржа розница 1");
  eq(ret1.wage, 13.5, "зп розница 1");

  const sub4 = F.formulaSub_(Object.assign({ N: 4 }, base));
  eq(sub4.cost, 66.54, "себес 4");
  eq(sub4.price, 95.88, "цена пп 4");
  eq(sub4.margin, 29.34, "маржа пп 4");
  eq(sub4.marginCheck, 29.34, "проверка пп 4");
  eq(sub4.wage, 22.5, "зп 4");

  const ret4 = F.formulaRetail_(Object.assign({ N: 4 }, base));
  eq(ret4.delivery, 36, "доставка 36");
  eq(ret4.price, 126, "цена розница 4");
  eq(ret4.cost, 66.54, "себес розница 4");
  eq(ret4.margin, 59.46, "маржа розница 4");
  eq(ret4.wage, 22.5, "зп розница 4");
});

test("8.6 месяц: валовая маржа и прибыль", () => {
  const m = F.formulaMonth_({
    revenue: 18000,
    S: 4500,
    G: 90000,
    P: 1200,
    N: 300,
    rent: 900,
    lightBill: 1100,
    packBill: 1050,
    amort: 150,
    smm: 800,
    other: 100
  });
  eq(m.wage, 3750, "зп");
  eq(m.light, 1080, "свет");
  eq(m.pack, 1080, "упаковка");
  eq(m.road, 1200, "дорога");
  eq(m.gross, 6390, "валовая");
  eq(m.lightGap, 20, "свет разница");
  eq(m.packGap, -30, "пакеты разница");
  eq(m.profit, 4450, "прибыль");
});

test("пустые расходы месяца: аренда 900, остальное не введено и в прибыль как 0", () => {
  const m = F.formulaMonth_({ revenue: 100, S: 10, G: 0, P: 0, N: 1 });
  eq(m.rent, 900, "аренда");
  assert.equal(m.rentDefault, true);
  assert.equal(m.lightBill.entered, false);
  assert.equal(m.amort.entered, false);
  eq(m.lightGap, 0, "света нет");
  eq(m.profit, F.kopeck_(m.gross - 900), "прибыль");
});

test("код: формула только по отвезено, прежний слот оплаты на месте", () => {
  const gs = fs.readFileSync(path.resolve(here, "../../Code.gs"), "utf8");
  assert.match(gs, /function collectFormulaRollup_/);
  assert.match(gs, /function readDeliveredByDate_/);
  assert.match(gs, /function foldPpRevenueOnce_/);
  assert.match(gs, /только отвезено/);
  const worker = fs.readFileSync(path.resolve(here, "../proxy/worker.js"), "utf8");
  assert.match(worker, /CREATE TABLE IF NOT EXISTS stats_month_money/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS stats_role_assign/);
  assert.match(worker, /saveStatsMonthMoney/);
});
