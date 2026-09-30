import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

function extractFn(src, name) {
  const re = new RegExp("function " + name + "\\s*\\(");
  const i = src.search(re);
  if (i < 0) throw new Error("missing " + name);
  let depth = 0;
  let started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") { depth++; started = true; }
    else if (src[j] === "}") {
      depth--;
      if (started && depth === 0) return src.slice(i, j + 1);
    }
  }
  throw new Error("unclosed " + name);
}

const src = readFileSync(new URL("../proxy/worker.js", import.meta.url), "utf8");
const ctx = createContext({});
runInContext([extractFn(src, "fallbackWarehouse_"), extractFn(src, "shapeWarehouses_")].join("\n"), ctx);

test("запись складов только у владельца, список — у сотрудников", () => {
  const start = src.indexOf("const AUTH_OWNER_RE");
  const end = src.indexOf("const AUTH_TABS_ORDERS");
  const block = src.slice(start, end);
  assert.match(block, /saveWarehouse\|deleteWarehouse\|setDepartureWarehouse/);
  assert.doesNotMatch(block, /listWarehouses/);
  assert.match(src, /CREATE TABLE IF NOT EXISTS warehouses/);
  assert.match(src, /Белецкого 10к2/);
  assert.equal(src.indexOf("boinya-c/next.html"), -1);
});

test("пустой список отдаёт запасную точку", () => {
  const res = ctx.shapeWarehouses_([]);
  assert.equal(res.status, "success");
  assert.equal(res.warehouses.length, 0);
  assert.equal(res.departure.address, "Белецкого 10к2");
  assert.equal(res.departure.name, "Склад");
  assert.equal(res.departure.fallback, true);
  assert.equal(res.departureId, "beletskogo");
});

test("выезд — отмеченная строка, выключенные скрыты", () => {
  const res = ctx.shapeWarehouses_([
    { id: "a", name: "Север", address: "ул. Притыцкого, 62", active: 1, is_departure: 0, created_at: "1" },
    { id: "old", name: "Старый", address: "скрыт", active: 0, is_departure: 1, created_at: "0" },
    { id: "b", name: "Юг", address: "ул. Чижевских, 8", active: 1, is_departure: 1, created_at: "2" }
  ]);
  assert.equal(res.warehouses.length, 2);
  assert.equal(res.departure.id, "b");
  assert.equal(res.departureId, "b");
  assert.equal(res.warehouses[0].departure, false);
});

test("если флага нет, выездом становится первая активная", () => {
  const res = ctx.shapeWarehouses_([
    { id: "a", name: "Север", address: "А", active: 1, is_departure: 0 },
    { id: "b", name: "Юг", address: "Б", active: 1, is_departure: 0 }
  ]);
  assert.equal(res.departure.id, "a");
  assert.equal(res.warehouses[0].departure, true);
});

test("удаление переносит флаг на самую старую живую строку", () => {
  const fn = extractFn(src, "deleteWarehouse_");
  assert.match(fn, /active = 0/);
  assert.match(fn, /ORDER BY created_at ASC/);
  assert.match(fn, /is_departure = 1/);
  const save = extractFn(src, "saveWarehouse_");
  assert.match(save, /name\.length > 80/);
  assert.match(save, /address\.length > 240/);
  assert.match(extractFn(src, "ensureWarehouses_"), /beletskogo/);
});
