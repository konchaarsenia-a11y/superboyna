import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const stats = require("./stats-logic.js");
const partners = require("./partners-logic.js");
const app = fs.readFileSync(path.resolve(here, "../app.main.js"), "utf8");
const statsFile = fs.readFileSync(path.resolve(here, "stats-logic.js"), "utf8");
const partnersUi = fs.readFileSync(path.resolve(here, "partners.js"), "utf8");

function body(name) {
  const at = app.indexOf("function " + name + "(");
  assert.ok(at >= 0, name);
  const start = app.indexOf("{", at);
  let i = start;
  let depth = 0;
  for (; i < app.length; i++) {
    if (app[i] === "{") depth++;
    else if (app[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return app.slice(start, i + 1);
}

function squash(s) {
  return s.replace(/\s+/g, "");
}

test("подписи месяца и тариф ПП скопированы из app.main.js", () => {
  ["statsMonthLabelRu_", "statsPpSchemeOf_", "statsPpDeliveryLabel_", "statsPpCostFootnote_", "statsPpFeeEchoLine_"].forEach((name) => {
    assert.ok(squash(statsFile).includes(squash(body(name))), "нет дословного " + name);
  });
});

test("месяц, границы и чистое", () => {
  assert.equal(stats.statsMonthLabelRu_("2026-09"), "Сентябрь 2026");
  const now = new Date(2026, 8, 27);
  assert.equal(stats.currentStatsMonthKey_(now), "2026-09");
  const blocked = stats.shiftStatsMonthKey_("2026-09", 1, now);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.toast, "Дальше текущего месяца нельзя");
  const back = stats.shiftStatsMonthKey_("2026-09", -1, now);
  assert.equal(back.ok, true);
  assert.equal(back.next, "2026-08");
  const far = stats.shiftStatsMonthKey_("2024-08", -1, now);
  assert.equal(far.ok, false);
  assert.equal(far.toast, "Дальше назад нет");
  assert.equal(stats.statsClean_(10.015, 0), 10.02);
  assert.equal(stats.statsBarPct_(1, 1000), 2);
  assert.equal(stats.statsBarPct_(50, 100), 50);
});

test("ожидаемая прибыль и нарезчик", () => {
  const raw = stats.statsExpectedNumbers_({ revenue: 80, cost: 30, ppScheme: "RAW26" });
  assert.equal(raw.profit, 80);
  assert.equal(raw.clean, 50);
  assert.match(raw.feeLine, /4×N/);
  assert.match(stats.statsPpDeliveryLabel_({ ppScheme: "RAW26" }), /4×N/);
  assert.match(stats.statsPpDeliveryLabel_({ ppScheme: "RAW26" }), /9/);
  const named = stats.statsExpectedNumbers_({ profit: 12, clean: 3, revenue: 99, cost: 1 });
  assert.equal(named.profit, 12);
  assert.equal(named.clean, 3);
  const cutter = stats.statsCutter_({});
  assert.equal(cutter.salary, 900);
  assert.equal(cutter.globalOn, false);
  assert.equal(cutter.floor, "2026-09");
  const facts = stats.statsFacts_({
    factCutoff: "x",
    fact: { revenue: 10, cost: 4, byPartner: [{ name: "Катя", profit: 1 }, { name: "без партнёра", profit: 9 }] }
  });
  assert.equal(facts.oldDeploy, false);
  assert.equal(facts.profitFact, 10);
  assert.equal(facts.cleanFact, 6);
  assert.deepEqual(facts.partners.map((p) => p.name), ["Катя"]);
  const old = stats.statsFacts_({ fact: { revenue: 1, cost: 1 } });
  assert.equal(old.oldDeploy, true);
  const otherMonth = { monthKey: "2026-08" };
  assert.notEqual(otherMonth.monthKey, "2026-09");
});

test("заявки, точки и доступы партнёров", () => {
  assert.equal(partners.partnerSuggestStatusRu_("нет такого"), "новое");
  assert.equal(partners.partnerSuggestStatusRu_("в работе"), "в работе");
  assert.equal(partners.partnerHubAccessGone_({ status: "revoked" }), true);
  assert.equal(partners.partnerAccessOpen_({ status: "active", role: "owner", name: "А" }), false);
  assert.equal(partners.partnerAccessOpen_({ status: "active", role: "partner", name: "Владелец Good Boy" }), false);
  assert.equal(partners.partnerAccessOpen_({ status: "active", role: "partner", name: "Оля" }), true);
  assert.equal(partners.partnerPointHidden_({ id: "pt_firedog_1", name: "X" }), true);
  assert.equal(partners.partnerPointHidden_({ id: "pt_f7640014", name: "Маяковского 3" }), true);
  assert.equal(partners.partnerPointHidden_({ id: "pt_varka_mayakovskogo_14", name: "Маяковского 14" }), false);
  const face = partners.partnerPointFace_({ id: "pt_polotno_1", name: "старое", address: "старый" });
  assert.equal(face.name, "polotno_an");
  assert.equal(face.address, "Чечота 11");
  const orders = partners.partnerHubOrders_([
    { id: "1", status: "open", mode: "partner", payload: { needsSlot: true, partnerOrderId: "po", locationId: "a", partnerTelegramId: "9", basket: [{ id: "x", qty: 1 }], note: "n" } },
    { id: "2", status: "open", mode: "partner", payload: { needsSlot: true, partnerOrderId: "po", locationId: "a", partnerTelegramId: "9", basket: [{ id: "x", qty: 1 }], note: "n" } },
    { id: "3", status: "open", payload: { orderType: "retail", needsSlot: true } },
    { id: "4", status: "done", mode: "partner", payload: { needsSlot: true, partnerOrderId: "other" } }
  ]);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].id, "1");
});

test("диапазон показывает топливо только если сервер его прислал", () => {
  const bare = stats.statsExpectedRows_({
    profit: 80, clean: 50, cost: 30, deliveries: 4, revenue: 80,
    bySource: { pp: 2, bp: 1, retail: 1, partner: 0 }, ppRevenue: 70, ppScheme: "RAW26"
  });
  assert.equal(bare.lines.some((row) => row.label.indexOf("Топливо") >= 0), false);
  const fuel = stats.statsExpectedRows_({
    profit: 80, clean: 50, cost: 30, ppDeliveryFuelCost: 8, ppRevenue: 70, ppScheme: "RAW26"
  });
  assert.equal(fuel.lines.filter((row) => row.label === "Топливо доставок (4×N)")[0].value, "8 BYN");
});

test("экран статистики: полки по формулам, без старого мусора", () => {
  const ui = fs.readFileSync(path.resolve(here, "stats.js"), "utf8");
  ["Главное", "Откуда деньги", "Себестоимость", "Расходы месяца", "Зарплата", ">БП</p>", "Свет по формуле", "не введено", "Ожидается", "разовые заказы", "Расчёт по датам", "За всё время", "Чистые", "отвёз"].forEach((phrase) => {
    assert.ok(ui.includes(phrase), phrase);
  });
  ["Воронка БП", "Лист ПП", "ЗП / мес", "пробник бесплатный", "тумблер не врёт", "nx-tiles", "·"].forEach((phrase) => {
    assert.equal(ui.includes(phrase), false, phrase);
  });
  const order = ["Оборот", "Откуда деньги", "Себестоимость", "Расходы месяца", "Зарплата", ">БП</p>"];
  let at = -1;
  order.forEach((mark) => {
    const next = ui.indexOf(mark, at + 1);
    assert.ok(next > at, mark);
    at = next;
  });
  assert.match(ui, /nx-stat__num/);
  assert.equal(ui.includes("function headTile"), false);
});

test("сравнение равного периода и экран из четырёх блоков", () => {
  const prev = stats.statsPrevEqualPeriod_("2026-10-01", "2026-10-02");
  assert.deepEqual({ from: prev.from, to: prev.to, days: prev.days }, { from: "2026-09-29", to: "2026-09-30", days: 2 });
  assert.equal(stats.statsPctDelta_(10, 0), null);
  assert.equal(stats.statsPctDelta_(8, 10).text, "−20%");
  assert.equal(stats.statsPctDelta_(12, 10).text, "+20%");
  const screen = stats.statsScreen_({
    factCutoff: "2026-10-02",
    fact: {
      revenue: 100, cost: 40, deliveries: 10,
      ppRevenue: 80, retail: 20, partner: 5,
      costBySource: { pp: 30, retail: 10, partner: 0 },
      ppDeliveryFuelCost: 8,
      ppBasketCost: 12,
      bpCost: 6,
      ppRecoverCost: 4,
      couponsCost: 1,
      ppPackagesCost: 2,
      staffCost: 0,
      bpClients: 4
    },
    bp: {
      convertedToPp: 1,
      life: { trials: 10, converted: 3, bpCostAll: 40 }
    }
  }, { revenue: 80, cost: 50, deliveries: 8, clean: 30 });
  assert.deepEqual(screen.head.map((c) => c.label), ["Оборот", "Прибыль", "Себестоимость", "Количество доставок"]);
  assert.equal(screen.head[0].value, 100);
  assert.equal(screen.head[0].delta.text, "+25%");
  assert.equal(screen.head[1].value, 60);
  assert.equal(screen.head[1].delta.text, "+100%");
  assert.equal(screen.head[2].delta.text, "−20%");
  assert.equal(screen.pp.turnover, 80);
  assert.equal(screen.pp.profit, 50);
  assert.equal(screen.pp.clean, 50);
  assert.equal(screen.retail.clean, 10);
  assert.equal(screen.partnerTurnover, 5);
  assert.equal(screen.expenses.find((e) => e.label === "Свет").missing, true);
  assert.equal(screen.expenses.find((e) => e.label === "Топливо").value, 8);
  assert.equal(screen.expenses.find((e) => e.label === "Сырьё").value, 22);
  assert.equal(screen.expenses.find((e) => e.label === "Прочее").value, 3);
  assert.equal(screen.bpMonth.conv.text, "из 4 перешли 1");
  assert.equal(screen.bpMonth.conv.pct, "25%");
  assert.equal(screen.bpMonth.net, null);
  assert.equal(screen.bpMonth.payback, null);
  assert.equal(screen.bpLife.spent, 40);
  assert.equal(screen.bpLife.net, null);
  assert.equal(screen.bpLife.payback, null);
  const bare = stats.statsScreen_({ revenue: 10, cost: 4, deliveries: 1, ppRevenue: 10 }, null);
  assert.equal(bare.pp.turnover, 10);
  assert.equal(bare.pp.profit, null);
  assert.equal(bare.pp.clean, null);
  assert.equal(bare.expenses.find((e) => e.label === "Партнёры").missing, true);
  assert.equal(bare.expenses.find((e) => e.label === "Свет").missing, true);
  assert.equal(bare.head[1].value, 6);
});

test("в интерфейсе партнёров нет сида сетей", () => {
  assert.equal(partnersUi.includes("partnerHubSeedDefaults_"), false);
  assert.equal(partnersUi.includes("partnerSeedDefaults"), false);
  assert.equal(partnersUi.includes("Демо"), false);
  assert.match(partnersUi, /Пусто — «\+ Сеть»/);
  assert.match(partnersUi, /deliverTimeFrom: "19:00"/);
  assert.match(partnersUi, /deliverTimeTo: "22:00"/);
});
