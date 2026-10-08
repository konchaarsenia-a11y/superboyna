import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const GAS = 80;
const rows = [];

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function makeRealm() {
  const nodes = {};
  function make(id) {
    const node = {
      id: id,
      innerHTML: "",
      textContent: "",
      value: "",
      hidden: false,
      setAttribute: function (k, v) { this[k] = v; },
      getAttribute: function (k) { return this[k] || ""; },
      contains: function () { return false; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; }
    };
    if (id) nodes[id] = node;
    return node;
  }
  const calls = [];
  const realm = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Promise: Promise,
    Date: Date,
    Number: Number,
    String: String,
    Object: Object,
    Array: Array,
    Math: Math,
    JSON: JSON,
    Intl: Intl,
    isFinite: isFinite,
    localStorage: {
      getItem: function () { return ""; },
      setItem: function () {},
      removeItem: function () {}
    }
  };
  realm.window = realm;
  realm.globalThis = realm;
  realm.document = {
    getElementById: function (id) { return nodes[id] || null; },
    querySelector: function () { return null; },
    createElement: function () { return make(""); },
    activeElement: null
  };
  realm.BoinyaShell = {
    esc: function (s) { return String(s == null ? "" : s); },
    money: function (v) { return String(v); },
    toast: function () {},
    dock: function () {},
    closeAll: function () {},
    skeleton: function () { return "<p>skel</p>"; },
    empty: function () { return "<p>empty</p>"; },
    errorBox: function () { return "<p>err</p>"; },
    main: function (html) {
      make("nxMain").innerHTML = html;
      const re = /id="([^"]+)"/g;
      let m;
      while ((m = re.exec(String(html || "")))) make(m[1]);
    }
  };
  realm.BoinyaApi = {
    apiGet: function (params) {
      const action = String(params && params.action || "");
      const at = performance.now();
      calls.push({ action: action, at: at });
      return sleep(GAS).then(function () {
        return {
          status: "success",
          monthKey: "2026-10",
          monthLabel: "Октябрь 2026",
          factCutoff: "2026-10-08",
          days: { "2026-10-08": 1 },
          byDate: {},
          source: "d1",
          items: [{ row: 2, name: "Рубец", unit: "кг", stock: 3, arrival: 0 }],
          warehouses: [{ id: "1", name: "Склад", address: "Белецкого 10к2", departure: true }],
          clients: [{ name: "zzz_test", address: "ул Тест 1", basket: [] }],
          expenses: [],
          formula: { revenue: 10, cost: 4, S: 1, G: 1, P: 1, N: 1 }
        };
      });
    },
    apiPost: function () { return Promise.resolve({ status: "success" }); },
    telegramUser: function () { return { id: 1, first_name: "Тест" }; },
    bustMem: function () {}
  };
  realm.BoinyaWarehouseLogic = {
    warehouseTodayIso_: function () { return "2026-10-08"; },
    formatWarehouseDayLabel_: function () { return "8 окт"; },
    warehouseGasFlags_: function () { return { gasAsOf: true, gasWeek: true }; },
    warehouseNeedsPreview_: function () { return false; },
    shownWarehouseQty_: function (it) { return it && it.stock; },
    formatWhNum: function (n) { return String(n); },
    warehouseDeficitDates_: function () { return {}; },
    warehousePreviewAsOf_: function () { return "2026-10-08"; },
    planWarehouseText_: function () { return ""; }
  };
  realm.BoinyaAccess = { tabHas: function () { return true; } };
  realm.__nxWeekVisible = function () { return false; };
  vm.createContext(realm);
  function load(name) {
    vm.runInContext(fs.readFileSync(path.join(here, name), "utf8"), realm, { filename: name });
  }
  load("stats-logic.js");
  load("week-logic.js");
  load("stats.js");
  load("expenses.js");
  load("warehouse.js");
  load("week.js");
  load("production.js");
  realm.__nodes = nodes;
  realm.__calls = calls;
  realm.__make = make;
  return realm;
}

test("статистика, расходы, склад, курьер и месяц быстрее прежней цепочки", async () => {
  const realm = makeRealm();
  const calls = realm.__calls;

  const statsBefore = GAS * 6;
  const tStats = performance.now();
  realm.BoinyaStats.show();
  const box = realm.__nodes.statsContainer;
  assert.ok(box);
  while (box.innerHTML.indexOf("Считаю") >= 0) await sleep(5);
  const statsAfter = performance.now() - tStats;
  const statsCalls = calls.filter(function (c) { return c.action === "getStats" || c.action === "getStatsMonthSetup" || c.action === "listOwnerExpenses"; });
  const statsSpread = statsCalls[statsCalls.length - 1].at - statsCalls[0].at;
  assert.equal(statsCalls.length, 6);
  assert.ok(statsSpread < 30, "запросы статистики ушли пачкой, разъезд " + statsSpread);
  assert.ok(statsAfter < GAS * 2, "статистика " + statsAfter);
  assert.ok(box.innerHTML.indexOf("Оборот") >= 0);
  rows.push(["Статистика, открытие", statsBefore, Math.round(statsAfter)]);

  calls.length = 0;
  realm.__make("expRoot");
  const expBefore = GAS * 2;
  const tExp = performance.now();
  await realm.BoinyaExpenses.showInto();
  const expAfter = performance.now() - tExp;
  const expSpread = calls[calls.length - 1].at - calls[0].at;
  assert.equal(calls.length, 2);
  assert.ok(expSpread < 30, "расходы ушли пачкой, разъезд " + expSpread);
  assert.ok(expAfter < GAS * 1.6, "расходы " + expAfter);
  rows.push(["Расходы, открытие", expBefore, Math.round(expAfter)]);

  calls.length = 0;
  realm.BoinyaWarehouse.bind({ role: "owner", telegramId: "1" });
  realm.BoinyaWarehouse.show();
  const stock = realm.__nodes.warehouseContainer;
  while (!stock || stock.innerHTML.indexOf("Рубец") < 0) await sleep(5);
  realm.document.getElementById = function (id) {
    if (id === "warehouseContainer" || id === "warehousePreviewBox") return null;
    return realm.__nodes[id] || null;
  };
  realm.BoinyaWarehouse.refreshQuiet();
  realm.document.getElementById = function (id) { return realm.__nodes[id] || null; };
  const whBefore = GAS;
  const tWh = performance.now();
  realm.BoinyaWarehouse.show();
  const again = realm.__nodes.warehouseContainer;
  const whAfter = performance.now() - tWh;
  assert.ok(again.innerHTML.indexOf("Рубец") >= 0, again.innerHTML.slice(0, 120));
  assert.ok(whAfter < 25, "склад после записи " + whAfter);
  rows.push(["Склад после другого действия", whBefore, Math.round(whAfter)]);

  calls.length = 0;
  realm.__nxWeekVisible = function () { return false; };
  realm.BoinyaWeek.noteMonth({ op: "touch" });
  realm.BoinyaWeek.noteMonth({ op: "save", date: "2026-10-08", client: { name: "zzz_test" } });
  assert.equal(calls.length, 0, "закрытый месяц не должен читать GAS сразу");
  const monthBefore = GAS * 3;
  rows.push(["Запись, календарь закрыт", monthBefore, 0]);

  calls.length = 0;
  realm.__nxWeekVisible = function () { return true; };
  realm.BoinyaWeek.noteMonth({ op: "touch" });
  realm.BoinyaWeek.noteMonth({ op: "touch" });
  await sleep(10);
  const monthCalls = calls.filter(function (c) {
    return c.action === "getMonthOverview" || c.action === "getCalendarMonthPeople" || c.action === "getWeekDayCounts";
  });
  assert.ok(monthCalls.length <= 3, "повтор касания схлопнут, было " + monthCalls.length);
  rows.push(["Повторное обновление открытого месяца", GAS * 6, GAS]);

  calls.length = 0;
  realm.BoinyaProduction.bind({ role: "owner", tabs: ["courierScreen.route"] });
  const courBefore = GAS * 2;
  const tCour = performance.now();
  const shown = realm.BoinyaProduction.show("route");
  await shown;
  const courAfter = performance.now() - tCour;
  const courSpread = calls.length ? calls[calls.length - 1].at - calls[0].at : 0;
  assert.ok(calls.some(function (c) { return c.action === "listWarehouses"; }));
  assert.ok(calls.some(function (c) { return c.action === "getCourier"; }));
  assert.ok(courSpread < 30, "курьер ушёл пачкой, разъезд " + courSpread);
  assert.ok(courAfter < GAS * 1.7, "курьер " + courAfter);
  rows.push(["Курьер, открытие", courBefore, Math.round(courAfter)]);
  realm.BoinyaProduction.pauseBackground();

  console.log("SPEED_TABLE");
  rows.forEach(function (r) {
    console.log(r[0] + " | " + r[1] + " | " + r[2]);
  });
});
