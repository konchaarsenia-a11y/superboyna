import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const formulas = require("./formulas.js");
const week = require("./week-logic.js");

function extractFn(src, name) {
  const key = "function " + name;
  let from = 0;
  while (from < src.length) {
    const at = src.indexOf(key, from);
    if (at < 0) throw new Error("нет функции " + name);
    const prev = at > 0 ? src[at - 1] : "";
    if (prev && /[A-Za-z0-9_]/.test(prev)) {
      from = at + key.length;
      continue;
    }
    const brace = src.indexOf("{", at);
    let i = brace;
    let depth = 0;
    let quote = "";
    while (i < src.length) {
      const ch = src[i];
      if (quote) {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === quote) quote = "";
        i++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        i++;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return src.slice(at, i + 1);
      }
      i++;
    }
    throw new Error("не закрыта " + name);
  }
  throw new Error("нет функции " + name);
}

function workerDayApi() {
  const src = fs.readFileSync(new URL("../proxy/worker.js", import.meta.url), "utf8");
  const names = [
    "statsKopeckD1_",
    "statsIsoDayD1_",
    "statsAddDaysD1_",
    "statsDaysBetweenD1_",
    "statsPpSlotD1_",
    "statsPpStartsCycleD1_",
    "statsPpSplitCyclesD1_",
    "statsPpRowCopyD1_",
    "statsPpMovedCarrierD1_",
    "statsPpPayRowD1_",
    "statsPpMonthCarrierD1_",
    "statsFormulaPartsD1_",
    "statsFormulaByDayD1_",
    "statsFormulaRollupD1_"
  ];
  const code = names.map(function (name) { return extractFn(src, name); }).join("\n");
  const sandbox = { Math: Math, Number: Number, String: String, Object: Object, isFinite: isFinite, Date: Date };
  vm.createContext(sandbox);
  vm.runInContext(code + "\nthis.api = { statsFormulaByDayD1_: statsFormulaByDayD1_, statsFormulaPartsD1_: statsFormulaPartsD1_ };", sandbox);
  return sandbox.api;
}

const retail = {
  ck: "A",
  iso: "2026-10-26",
  src: "retail",
  delivered: true,
  viaMail: false,
  price: 100,
  S: 10,
  G: 100,
  P: 0,
  sig: "x",
  missingBasket: false,
  slot: 0,
  paid: ""
};

test("чистые дня = выручка минус себес, как formulaMonth", function () {
  const day = formulas.formulaDayMap_([retail], "2026-10-26", "2026-10-26")["2026-10-26"];
  const month = formulas.formulaMonth_({ revenue: day.revenue, S: day.S, G: day.G, P: day.P, N: day.N });
  assert.equal(day.revenue, 100);
  assert.equal(day.cost, 20.9);
  assert.equal(day.clean, 79.1);
  assert.equal(day.clean, month.gross);
});

test("воркер и формула статистики дают одну чистую", function () {
  const api = workerDayApi();
  const fromFormula = formulas.formulaDayMap_([retail], "2026-10-26", "2026-10-26")["2026-10-26"];
  const fromWorker = api.statsFormulaByDayD1_([retail], "2026-10-26", "2026-10-26")["2026-10-26"];
  assert.equal(fromWorker.revenue, fromFormula.revenue);
  assert.equal(fromWorker.cost, fromFormula.cost);
  assert.equal(fromWorker.clean, fromFormula.clean);
  const parts = api.statsFormulaPartsD1_(fromFormula);
  assert.equal(parts.clean, formulas.formulaMonth_({
    revenue: fromFormula.revenue,
    S: fromFormula.S,
    G: fromFormula.G,
    P: fromFormula.P,
    N: fromFormula.N
  }).gross);
});

test("неотвезено не входит в чистую выручку", function () {
  const row = Object.assign({}, retail, { delivered: false });
  const day = formulas.formulaDayMap_([row], "2026-10-26", "2026-10-26")["2026-10-26"];
  assert.equal(day.revenue, 0);
  assert.equal(day.clean, 0);
  assert.ok(day.N === 0);
});

test("БП отвезено: выручка 0, себес в чистых", function () {
  const row = Object.assign({}, retail, { src: "bp", price: 80 });
  const day = formulas.formulaDayMap_([row], "2026-10-26", "2026-10-26")["2026-10-26"];
  assert.equal(day.revenue, 0);
  assert.equal(day.clean, -20.9);
});

test("грязная сумма дня совпадает с revenueSum", function () {
  const list = [
    { name: "a", segment: "Р", orderPrice: "40", _sumDate: "2026-10-26" },
    { name: "b", segment: "Р", orderPrice: "15,5", _sumDate: "2026-10-26" },
    { name: "c", segment: "БП", orderPrice: "0", _sumDate: "2026-10-27" }
  ];
  const map = week.dayRevenueMap(list);
  assert.equal(map["2026-10-26"], 55.5);
  assert.equal(map["2026-10-27"], 0);
  assert.equal(week.revenueSum(list, { onlyDate: "2026-10-26" }), 55.5);
  assert.equal(week.revenueSum(list), 55.5);
});

test("ячейка дня без сумм, в прежнем счётчике суммы текст грязная/чистая", function () {
  const html = fs.readFileSync(new URL("./week.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./theme.css", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("./app.css", import.meta.url), "utf8");
  const cell = html.slice(html.indexOf("function monthCal"), html.indexOf("function displayedMonth"));
  const moneyFn = html.slice(html.indexOf("function summaryMoneyHtml"), html.indexOf("function summaryHtml"));
  const summary = html.slice(html.indexOf("function summaryHtml"), html.indexOf("function weekOnScreen"));
  assert.equal(cell.includes("cell-sums"), false);
  assert.equal(cell.includes("cell-dirty"), false);
  assert.equal(cell.includes("cell-clean"), false);
  assert.match(cell, /cell-count/);
  assert.equal(css.includes(".cell-sums"), false);
  assert.equal(app.includes("button.cell"), false);
  assert.equal(html.includes("nx-day-money"), false);
  assert.equal(app.includes(".nx-day-money"), false);
  assert.equal(app.includes(".nx-calsum .nx-count b"), false);
  assert.equal(moneyFn.includes("<p"), false);
  assert.match(moneyFn, /<div class="nx-count"><b/);
  assert.match(moneyFn, /moneyText\(summaryMoney\(true\)\) \+ "\/" \+ moneyText\(clean\)/);
  assert.match(moneyFn, /style="color:#fff"/);
  assert.match(summary, /<div class="nx-counters">/);
  assert.match(summary, /summaryMoneyHtml\(dayOn\)/);
  assert.equal(summary.includes("nx-day-money"), false);
  assert.equal(html.includes("Чистые, BYN"), false);
  const worker = fs.readFileSync(new URL("../proxy/worker.js", import.meta.url), "utf8");
  assert.match(worker, /dayMoneyReady/);
  assert.match(worker, /rolled\.byDay = statsFormulaByDayD1_/);
});
