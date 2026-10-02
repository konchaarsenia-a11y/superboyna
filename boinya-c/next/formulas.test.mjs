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

test("чистые перешедших и партнёры: себес §3, цена ПП один раз, БП перешедших не вычитается дважды", () => {
  const eco = F.formulaEconomy_([
    { ck: "A", name: "Аня", iso: "2026-10-01", src: "bp", delivered: true, S: 2, G: 0, P: 1, partner: "Точка", partnerPays: false },
    { ck: "A", iso: "2026-10-10", src: "pp", delivered: true, price: 20, S: 3, G: 0, P: 2, sig: "same", slot: 1, paid: "yes" },
    { ck: "A", iso: "2026-10-20", src: "pp", delivered: true, price: 20, S: 3, G: 0, P: 2, sig: "same", slot: 2, paid: "no" },
    { ck: "A", iso: "2026-09-15", src: "pp", delivered: true, price: 20, S: 3, G: 0, P: 2, sig: "same", slot: 1, paid: "yes" },
    { ck: "B", name: "Боря", iso: "2026-10-02", src: "bp", delivered: true, S: 1, G: 0, P: 0, partner: "Точка", partnerPays: true },
    { ck: "C", name: "Вера", iso: "2026-10-03", src: "retail", delivered: true, price: 10, S: 1, G: 100, P: 0, partner: "" },
    { ck: "C", iso: "2026-09-02", src: "bp", delivered: true, S: 1, G: 0, P: 0, partner: "Другая", partnerPays: false },
    { ck: "D", iso: "2026-10-04", src: "bp", delivered: false, S: 5, G: 0, P: 0, partner: "Точка" },
    { ck: "A", iso: "2026-10-11", src: "retail", delivered: true, price: 8, S: 0, G: 0, P: 0, missingBasket: true },
    { ck: "E", name: "Глеб", iso: "2026-10-01", src: "bp", delivered: true, S: 1, G: 0, P: 0, partner: "Плюс", partnerPays: false },
    { ck: "E", iso: "2026-10-08", src: "pp", delivered: true, price: 40, S: 2, G: 0, P: 0, sig: "e", slot: 1, paid: "yes" }
  ], {
    monthKey: "2026-10",
    converted: { A: "2026-10-05", C: "2026-09-01", E: "2026-10-02" }
  });
  eq(eco.bp.month.trials, 3, "бп месяца");
  eq(eco.bp.month.converted, 2, "перешли Аня и Глеб");
  eq(eco.bp.month.spent, 20.7, "наши БП Ани и Глеба");
  eq(eco.bp.month.covered, 9.4, "Боря закрыт точкой");
  eq(eco.bp.month.net, 3.6, "чистые октября");
  eq(eco.bp.month.outside, 0, "чужих БП в октябре нет");
  eq(eco.bp.month.payback, 3.6, "окупаемость месяца");
  eq(eco.bp.life.trials, 4, "все БП");
  eq(eco.bp.life.converted, 3, "Аня, Вера, Глеб");
  eq(eco.bp.life.spent, 30.1, "БП Ани, Веры и Глеба");
  eq(eco.bp.life.net, 1, "накоплено");
  eq(eco.bp.life.outside, 0, "БП перешедших внутри чистых");
  eq(eco.bp.life.payback, 1, "окупаемость всего");
  const tochkaM = eco.partners.month.find((p) => p.name === "Точка");
  const drugaM = eco.partners.month.find((p) => p.name === "Другая");
  const tochkaL = eco.partners.life.find((p) => p.name === "Точка");
  eq(tochkaM.trials, 2, "точка бп");
  eq(tochkaM.converted, 1, "точка переход");
  eq(tochkaM.spent, 11.3, "точка потрачено");
  eq(tochkaM.net, -13.3, "точка чистые октября");
  eq(tochkaM.payback, -13.3, "точка итог");
  eq(tochkaL.payback, -6.5, "точка за всё время, сентябрь ПП внутри");
  eq(drugaM.trials, 0, "у Другой в октябре нет БП");
  eq(drugaM.net, -3.3, "розница Веры в октябре");
  eq(drugaM.payback, -3.3, "итог Другой");
  const drugaL = eco.partners.life.find((p) => p.name === "Другая");
  eq(drugaL.trials, 1, "БП Веры за всё время");
  eq(drugaL.converted, 1, "Вера перешла");
  eq(drugaL.spent, 9.4, "себес её БП");
  eq(drugaL.net, -12.7, "накоплено Веры");
  eq(drugaL.payback, -12.7, "БП уже внутри чистых");
  const plus = eco.partners.month.find((p) => p.name === "Плюс");
  eq(plus.trials, 1, "плюс бп");
  eq(plus.converted, 1, "плюс переход");
  eq(plus.net, 20.2, "плюс чистые");
  eq(plus.payback, 20.2, "плюс прибыль");
  eq(eco.coverage.notDelivered, 1, "неотвезено");
  eq(eco.coverage.missingBasket, 1, "нет состава");
  assert.match(eco.note, /отвёз/);
  assert.match(eco.note, /Без состава 1/);
  assert.match(eco.attribution, /кто привёл/);
});

test("сверка: меньше попадает в чистое, больше вычитается, коридор 5% и минимум 5", () => {
  const under = F.reconcile_(100, 80, true, "свет");
  eq(under.gap, 20, "меньше");
  assert.equal(under.state, "under");
  assert.match(under.text, /меньше заложенного/);
  assert.match(under.text, /\+20\.00 BYN в чистое/);
  const over = F.reconcile_(100, 130, true, "свет");
  eq(over.gap, -30, "больше");
  assert.equal(over.state, "over");
  assert.match(over.text, /перерасход 30\.00 BYN/);
  const near = F.reconcile_(100, 96, true, "свет");
  eq(near.gap, 0, "в пределах 5");
  assert.equal(near.state, "close");
  assert.equal(near.text, "");
  const wide = F.reconcile_(1000, 960, true, "свет");
  eq(wide.gap, 0, "5% от 1000");
  assert.equal(wide.state, "close");
  const empty = F.reconcile_(100, 0, false, "свет");
  eq(empty.gap, 0, "не введено не ноль");
  assert.equal(empty.state, "empty");
});

test("амортизация: доля дней, 12 месяцев если ремонта раньше не было", () => {
  const first = F.amortMonth_([{ date: "2026-01-01", amount: 365, object: "авто" }], "2026-10");
  eq(first.amount, 31, "октябрь доля");
  assert.equal(first.forward, true);
  assert.match(first.note, /12 месяцев/);
  const chain = F.amortMonth_([
    { date: "2026-01-01", amount: 50, object: "авто" },
    { date: "2026-04-11", amount: 100, object: "авто" }
  ], "2026-03");
  eq(chain.amount, 31, "март между ремонтами");
  assert.equal(chain.forward, false);
  const personal = F.amortMonth_([{ date: "2026-01-01", amount: 365, object: "авто", personal: true }], "2026-10");
  eq(personal.amount, 0, "личное не в проекте");
});

test("личное не входит в проект, налог 20% только с плюса, остаток доставки не задваивается", () => {
  const bucket = F.expenseBucket_([
    { date: "2026-10-02", amount: 10, category: "smm", personal: false },
    { date: "2026-10-03", amount: 99, category: "smm", personal: true },
    { date: "2026-10-04", amount: 40, category: "light", personal: false },
    { date: "2026-09-01", amount: 7, category: "tool", personal: false }
  ], "2026-10");
  eq(bucket.project.smm, 10, "только проект");
  eq(bucket.paid.light, 40, "свет");
  eq(bucket.project.tool, 0, "другой месяц");
  const close = F.formulaClose_({
    monthKey: "2026-10",
    revenue: 200,
    S: 10, G: 0, P: 0, N: 2,
    rows: [
      { date: "2026-10-02", amount: 10, category: "smm" },
      { date: "2026-10-02", amount: 50, category: "other", personal: true }
    ],
    repairs: []
  });
  eq(close.deliveryRest, 1.2, "0,60 на доставку");
  eq(close.rent, 900, "аренда по умолчанию");
  assert.equal(close.rentDefault, true);
  const again = F.formulaClose_({
    monthKey: "2026-10",
    revenue: 200,
    S: 10, G: 0, P: 0, N: 10,
    rows: [{ date: "2026-10-02", amount: 10, category: "smm" }]
  });
  eq(again.profit, F.kopeck_(close.profit - 8.4 * 8), "остаток доставки не прибавлен к прибыли");
  const rich = F.formulaClose_({
    monthKey: "2026-10",
    revenue: 2000,
    S: 10, G: 0, P: 0, N: 1,
    rows: [{ date: "2026-10-01", amount: 100, category: "rent" }]
  });
  assert.ok(rich.profit > 0);
  eq(rich.tax, F.kopeck_(rich.profit * 0.2), "налог");
  eq(rich.afterTax, F.kopeck_(rich.profit - rich.tax), "после налога");
  const loss = F.formulaClose_({ monthKey: "2026-10", revenue: 10, S: 10, G: 0, P: 0, N: 1, rows: [] });
  eq(loss.tax, 0, "с минуса налог 0");
  eq(loss.afterTax, loss.profit, "минус остаётся");
});

test("сентябрь: граница месяца, отвёз, пустой слот, слот 2, без состава", () => {
  const rows = [
    { ck: "M", iso: "2026-08-25", src: "pp", slot: 0, paid: "", price: 195, delivered: true, S: 10, G: 360, P: 2, sig: "marg" },
    { ck: "M", iso: "2026-09-08", src: "pp", slot: 0, paid: "", price: 195, delivered: true, S: 10, G: 360, P: 2, sig: "marg" },
    { ck: "A", iso: "2026-08-20", src: "pp", slot: 1, paid: "yes", price: 88, delivered: true, S: 8, G: 400, P: 6, sig: "maria" },
    { ck: "A", iso: "2026-09-03", src: "pp", slot: 2, paid: "no", price: 88, delivered: true, S: 8, G: 400, P: 6, sig: "maria" },
    { ck: "A", iso: "2026-09-17", src: "pp", slot: 1, paid: "yes", price: 90, delivered: true, S: 9, G: 200, P: 1, sig: "maria2" },
    { ck: "N", iso: "2026-09-28", src: "retail", price: 0, delivered: true, S: 2, G: 120, P: 0 },
    { ck: "OLD", iso: "2026-09-10", src: "retail", delivered: true, price: 40, missingBasket: true, S: 0, G: 0, P: 0 },
    { ck: "WAIT", iso: "2026-09-30", src: "retail", delivered: false, price: 13, S: 1, G: 50, P: 0 },
    { ck: "OCT", iso: "2026-10-01", src: "pp", slot: 1, paid: "yes", price: 140, delivered: true, S: 7, G: 100, P: 1, sig: "oct" },
    { ck: "P", iso: "2026-09-05", src: "partner", delivered: true, price: 0, S: 1, G: 0, P: 0 }
  ];
  const s = F.formulaRollup_(rows, { monthKey: "2026-09" });
  eq(s.ppRevenue, 90, "пп один раз на новом слоте 1");
  eq(s.retailRevenue, 0, "розница без цены");
  eq(s.revenue, 90, "оборот");
  eq(s.N, 4, "четыре отвезено");
  eq(s.S, 11, "состав цикла не удвоен");
  eq(s.pp.N, 3, "пп доставки");
  eq(s.pp.S, 9, "сырьё пп");
  eq(s.missingBasket, 1, "без состава");
  eq(s.missingPrice, 1, "без цены");
  eq(s.pending.N, 1, "без отвёз");
  eq(s.pending.revenue, 13, "ожидается");
  eq(s.skippedPartner, 1, "партнёр");
  assert.equal(s.from, "2026-09-01");
  assert.equal(s.to, "2026-09-30");
  const aug = F.formulaRollup_(rows, { monthKey: "2026-08" });
  eq(aug.ppRevenue, 195 + 88, "август забирает первую оплату");
  eq(aug.N, 2, "две августовские");
});

test("код: формула только по отвезено, прежний слот оплаты на месте", () => {
  const gs = fs.readFileSync(path.resolve(here, "../../Code.gs"), "utf8");
  assert.match(gs, /function collectFormulaRollup_/);
  assert.match(gs, /function formulaRollupRows_/);
  assert.match(gs, /gap >= 18/);
  assert.match(gs, /missingBasket/);
  assert.match(gs, /function handleAddPricePosition/);
  assert.match(gs, /function collectFormulaEconomy_/);
  assert.match(gs, /function readDeliveredByDate_/);
  assert.match(gs, /function foldPpRevenueOnce_/);
  assert.match(gs, /только отвезено/);
  assert.match(gs, /ppPartner/);
  assert.match(gs, /formulaEconomy/);
  const worker = fs.readFileSync(path.resolve(here, "../proxy/worker.js"), "utf8");
  assert.match(gs, /STATS27:/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS stats_month_money/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS stats_role_assign/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS owner_expenses/);
  assert.match(worker, /saveStatsMonthMoney/);
  const formulas = fs.readFileSync(path.resolve(here, "formulas.js"), "utf8");
  assert.match(formulas, /function formulaClose_/);
  assert.match(formulas, /TAX_RATE_ = 0\.2/);
});
