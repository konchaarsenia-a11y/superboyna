import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const logic = require("./warehouse-logic.js");
const app = fs.readFileSync(path.resolve(here, "../app.main.js"), "utf8");
const file = fs.readFileSync(path.resolve(here, "warehouse-logic.js"), "utf8");

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

test("числа и даты склада скопированы из app.main.js", () => {
  ["formatWhNum", "warehouseTodayIso_", "formatWarehouseDayLabel_", "mondayIsoFromIsoDate_"].forEach((name) => {
    assert.ok(squash(file).includes(squash(body(name))), "нет дословного " + name);
  });
});

test("понедельник от воскресенья и подпись дня", () => {
  assert.equal(logic.mondayIsoFromIsoDate_("2026-09-27"), "2026-09-21");
  assert.equal(logic.mondayIsoFromIsoDate_("2026-09-28"), "2026-09-28");
  assert.equal(logic.formatWarehouseDayLabel_("2026-09-27"), "Вс 27.09");
  assert.equal(logic.formatWhNum("1.256"), "1.26");
  assert.equal(logic.formatWhNum("нет"), "0");
});

test("показанный остаток как в loadWarehouse", () => {
  const it = { row: 4, stock: 2, arrival: 1, weekStart: 9, asOfStock: 4 };
  assert.equal(logic.shownWarehouseQty_(it, "weekStart", null, false), 9);
  assert.equal(logic.shownWarehouseQty_(it, "asOf", null, true), 4);
  assert.equal(logic.shownWarehouseQty_(it, "asOf", { available: 1.5, stockStart: 8 }, false), 1.5);
  assert.equal(logic.shownWarehouseQty_({ stock: 2, arrival: 0.5 }, "weekStart", { stockStart: 3 }, false), 3);
  assert.equal(logic.shownWarehouseQty_({ stock: 2, arrival: 0.5 }, "asOf", null, false), 2.5);
  const flags = logic.warehouseGasFlags_({ view: "asOf", items: [{ asOfStock: 1 }] });
  assert.equal(flags.gasAsOf, true);
  assert.equal(logic.warehouseNeedsPreview_("asOf", flags), false);
  assert.equal(logic.warehouseNeedsPreview_("weekStart", { gasWeek: false }), true);
});

test("текст плана и фильтр голой цены", () => {
  assert.equal(logic.planWarehouseText_({ piece: true, dryG: 4, needRaw: 9 }), "4 шт");
  assert.equal(logic.planWarehouseText_({ dryG: 500 }), "500 г");
  assert.equal(logic.planWarehouseText_({ dryG: 1500 }), "1.5 кг");
  assert.equal(logic.planWarehouseText_({}), "—");
  assert.equal(logic.warehouseDeficitDates_("weekStart", "2026-09-27").dateFrom, "");
  assert.equal(logic.warehouseDeficitDates_("asOf", "2026-09-27").dateFrom, "2026-09-27");
  assert.equal(logic.warehousePreviewAsOf_("weekStart", "2026-09-27"), "2026-09-21");
  const rows = logic.visibleRetailPriceItems_([
    { key: "АОРТА", price: 1 },
    { key: "АОРТА|Обычная", price: 12 },
    { key: "ТРАХЕЯ", price: 3 },
    { key: "" }
  ]);
  assert.deepEqual(rows.map((r) => r.key), ["АОРТА|Обычная", "ТРАХЕЯ"]);
});
