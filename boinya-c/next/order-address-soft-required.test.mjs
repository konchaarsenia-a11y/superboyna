/**
 * order-address-soft-required-h1 — подъезд/код/этаж/квартира не блокируют save.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ordersSrc = fs.readFileSync(path.join(here, "orders.js"), "utf8");

const saveFn = ordersSrc.slice(
  ordersSrc.indexOf("async function save()"),
  ordersSrc.indexOf("function warehouseAfterSave")
);

test("save: soft address missing, no hard return (order-address-soft-required-h1)", () => {
  assert.match(saveFn, /order-address-soft-required-h1/);
  assert.match(saveFn, /addrSoftMissing/);
  assert.match(saveFn, /Не заполнено:.*сохраним так/);
  assert.match(saveFn, /Не заполнено:.*— сохранено/);
  /* старый hard-block убран */
  assert.doesNotMatch(saveFn, /Заполните подъезд, код домофона, этаж и квартиру/);
  assert.doesNotMatch(saveFn, /await sh\(\)\.alert\(\{ text: "Укажите подъезд" \}\);\s*return;/);
  /* street/phone по-прежнему блокируют */
  assert.match(saveFn, /Укажите адрес доставки/);
  assert.match(saveFn, /Укажите телефон/);
});
