/**
 * order-edit-row-actions-h1 — в «Правке заказа» есть Удалить и смена фракции.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ordersSrc = fs.readFileSync(path.join(here, "orders.js"), "utf8");
const nextHtml = fs.readFileSync(path.join(here, "../next.html"), "utf8");

test("basketRow: кнопки idel + ifrac (order-edit-row-actions-h1)", () => {
  assert.match(ordersSrc, /order-edit-row-actions-h1/);
  assert.match(ordersSrc, /data-act="idel"/);
  assert.match(ordersSrc, /data-act="ifrac"/);
  assert.match(ordersSrc, /aria-label="Удалить позицию"/);
  assert.match(ordersSrc, /function changeLineFrac_/);
  assert.match(ordersSrc, /act === "idel"/);
  assert.match(ordersSrc, /act === "ifrac"/);
  const rowFn = ordersSrc.slice(ordersSrc.indexOf("function basketRow"), ordersSrc.indexOf("function basketLines"));
  assert.match(rowFn, /data-act="idel"/);
  assert.match(rowFn, /data-act="ifrac"/);
  assert.match(rowFn, /data-act="step"/, "степпер граммов на месте");
});

test("cache VER bumped for phone SW", () => {
  assert.match(nextHtml, /var VER = "71125463"/);
});
