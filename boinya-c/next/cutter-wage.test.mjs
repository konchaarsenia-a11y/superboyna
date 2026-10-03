import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ui = fs.readFileSync(path.resolve(here, "production.js"), "utf8");
const formulas = fs.readFileSync(path.resolve(here, "formulas.js"), "utf8");
const worker = fs.readFileSync(path.resolve(here, "../proxy/worker.js"), "utf8");
const gs = fs.readFileSync(path.resolve(here, "../../Code.gs"), "utf8");

const sandbox = { window: {} };
vm.runInNewContext(formulas, sandbox);
sandbox.window.BoinyaFormulas = sandbox.BoinyaFormulas;
vm.runInNewContext(ui, sandbox);
const prod = sandbox.window.BoinyaProduction;

test("кто режет спрашивается, пока на день никто не выбран", () => {
  assert.equal(prod.needCutterAsk_(null), true);
  assert.equal(prod.needCutterAsk_({ id: "", name: "" }), true);
  assert.equal(prod.needCutterAsk_({ id: "827", name: "Аня" }), false);
});

test("объёмы дня: граммы и штуки отдельно", () => {
  const vol = prod.cutVolumes_([
    { dry: 200, unit: "гр" },
    { dry: 4, unit: "шт" },
    { dry: 100, unit: "гр" }
  ]);
  assert.equal(vol.G, 300);
  assert.equal(vol.P, 4);
});

test("ЗП дня по канону и не в чистую прибыль", () => {
  assert.equal(prod.cutterWage_(300, 6, 2), 16.5);
  assert.equal(sandbox.BoinyaFormulas.formulaParts_({ G: 300, P: 6, N: 2 }).wage, 16.5);
  assert.ok(worker.includes("countsInProfit: false"));
  assert.ok(worker.includes("function listCuttingWages_"));
  assert.ok(worker.includes("CREATE TABLE IF NOT EXISTS cutting_day_wage"));
  assert.ok(gs.includes("function handleListCuttingWages"));
  assert.ok(gs.includes("ЗП_Нарезка"));
  assert.ok(ui.includes("Кто сегодня режет?"));
  const ask = ui.slice(ui.indexOf("title: \"Кто сегодня режет?\""));
  assert.equal(ask.slice(0, 500).includes("·"), false);
});
