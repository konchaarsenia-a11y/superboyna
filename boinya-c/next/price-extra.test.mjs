import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const extra = require("./price-extra.js");

test("позиция: название, категория, фракции, цена, единица", () => {
  const bad = extra.normalizePricePosition_({ name: "А", cat: "dressura", price: 10, unit: "гр" });
  assert.equal(bad.ok, false);
  const ok = extra.normalizePricePosition_({
    name: "  утка  ",
    cat: "other",
    fractions: "Полоски, полоски, Мелкое",
    price: "12,5",
    unit: "гр"
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.position.name, "УТКА");
  assert.deepEqual(ok.position.fractions, ["Полоски", "Мелкое"]);
  assert.equal(ok.position.price, 12.5);
  assert.equal(ok.position.unit, "гр");
  assert.equal(ok.position.catLabel, "Другое");
  const piece = extra.normalizePricePosition_({ name: "РОГА", cat: "chew", price: 4, unit: "гр" });
  assert.equal(piece.position.unit, "шт");
});

test("добавление не затирает чужие ключи прайса", () => {
  const base = [{ key: "ЛЁГКОЕ|Среднее", kind: "per100", price: 11 }];
  const pos = extra.normalizePricePosition_({
    name: "УТКА", cat: "other", fractions: "Полоски", price: 12, unit: "гр"
  }).position;
  const merged = extra.mergeRetailItems_(base, [pos]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].key, "ЛЁГКОЕ|Среднее");
  assert.equal(merged[1].key, "УТКА|Полоски");
  assert.equal(merged[1].kind, "per100");
  const again = extra.mergeRetailItems_(merged, [pos]);
  assert.equal(again.length, 2);
});

test("каталог заказа получает имя и фракции", () => {
  const pos = extra.normalizePricePosition_({
    name: "УТКА", cat: "other", fractions: "Полоски", price: 12, unit: "гр"
  }).position;
  extra.remember_([pos]);
  const catalog = { other: { items: ["ПЕЧЕНЬ"], fractions: {} }, chew: { items: [], fractions: {} } };
  extra.installCatalog_({ catalog: catalog });
  assert.deepEqual(catalog.other.items, ["ПЕЧЕНЬ", "УТКА"]);
  assert.deepEqual(catalog.other.fractions["УТКА"], ["Полоски"]);
  assert.equal(extra.unitFor_("other", "УТКА"), "гр");
  assert.deepEqual(extra.namesFor_("other"), ["УТКА"]);
});

test("воркер и экран только добавляют позицию", () => {
  const worker = fs.readFileSync(path.resolve(here, "../proxy/worker.js"), "utf8");
  const ui = fs.readFileSync(path.resolve(here, "retail-admin.js"), "utf8");
  const orders = fs.readFileSync(path.resolve(here, "orders.js"), "utf8");
  assert.match(worker, /CREATE TABLE IF NOT EXISTS price_positions/);
  assert.match(worker, /INSERT INTO price_positions/);
  assert.match(worker, /owner_only/);
  assert.match(ui, /Добавить позицию/);
  assert.match(ui, /addPricePosition/);
  assert.match(orders, /listPricePositions/);
  assert.equal(ui.includes("·"), false);
});
