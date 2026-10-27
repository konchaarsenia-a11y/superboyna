import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const engine = require("./order-engine.js");
const context = { BoinyaOrderEngine: engine, console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(here, "ig-labels.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(here, "crumb-scheme.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(here, "price-logic.js"), "utf8"), context);
const api = context.BoinyaOrderEngine;
const price = context.BoinyaPrice;

function words(cat, name) {
  return api.catalogFractionsForUi_(cat, name)
    .filter((f) => !/^крошк/i.test(String(f)))
    .map((f) => api.humanFraction(name, f) || f);
}

function goods(list) {
  return api.calcRetailBasketTotal(list, { applyDelivery: false, deliveriesN: 1 }).goods;
}

function row(name, sub, val, cat) {
  return { cat: cat || "dressura", main: name, name: name, sub: sub, val: val, value: val };
}

test("расчёт предлагает те же фракции, что заказ", () => {
  assert.deepEqual(words("dressura", "ЛЁГКОЕ"), ["ломтики", "палочки", "крупный кубик", "средний кубик", "мелкий кубик", "очень мелкий кубик"]);
  assert.deepEqual(words("dressura", "СЕРДЦЕ"), ["ломтики", "кусочки", "мелкие кусочки", "очень мелкие кусочки"]);
  assert.deepEqual(words("dressura", "РУБЕЦ Т"), ["ломтики", "кусочки", "мелкие кусочки", "очень мелкие кусочки"]);
  assert.deepEqual(words("dressura", "ПОЧКИ"), ["кусочки", "мелкие кусочки"]);
  assert.deepEqual(words("other", "ИНДЕЙКА"), ["ломтики", "кусочки", "мелкие кусочки"]);
  assert.equal(api.catalogFractionsForUi_("other", "ИНДЕЙКА").indexOf("Полоски"), -1);
  const clients = fs.readFileSync(path.join(here, "clients.js"), "utf8");
  assert.match(clients, /label: eng\(\)\.humanFraction\(name, f\) \|\| f/);
  assert.doesNotMatch(clients, /label: f/);
});

test("новый расчёт считает сетку, крошку и индейку", () => {
  assert.equal(goods([row("ЛЁГКОЕ", "Ломтики", 100)]), 9);
  assert.equal(goods([row("ЛЁГКОЕ", "Полоски", 100)]), 10);
  assert.equal(goods([row("ЛЁГКОЕ", "Среднее", 100)]), 11);
  assert.equal(goods([row("СЕРДЦЕ", "Кусочки", 100)]), 13);
  assert.equal(goods([row("СЕРДЦЕ", "Очень мелкое", 100)]), 15);
  assert.equal(goods([row("РУБЕЦ Т", "Очень мелкое", 100)]), 15);
  assert.equal(goods([row("БАРАНЬЕ ЛЁГКОЕ", "Среднее", 100)]), 18);
  assert.equal(goods([row("БАРАНЬЕ ЛЁГКОЕ", "Мелкое", 100)]), 19);
  assert.equal(goods([row("ПЕЧЕНЬ", "Кусочки", 100, "other")]), 11);
  assert.equal(goods([row("МЯСНЫЕ ЛОМТИКИ", "Мелкое", 100, "other")]), 17);
  assert.equal(goods([row("ИНДЕЙКА", "Ломтики", 100, "other")]), 16);
  assert.equal(goods([row("ИНДЕЙКА", "Кусочки", 100, "other")]), 17);
  assert.equal(goods([row("ИНДЕЙКА", "Мелкое", 100, "other")]), 18);
  assert.equal(goods([row("ИНДЕЙКА", "Полоски", 100, "other")]), 17);
  assert.equal(goods([{ cat: "crumb", name: "Крошка", main: "Крошка", val: 100, value: 100, crumbKind: "mix4:dress" }]), 19);
  assert.equal(goods([{ cat: "crumb", name: "Крошка", main: "Крошка", val: 50, value: 50, crumbKind: "mix4:veg" }]), 8.5);
  assert.equal(goods([{ cat: "crumb", name: "Крошка", main: "Крошка", val: 20, value: 20, crumbKind: "mix4:hypo" }]), 4.4);
  assert.equal(goods([{ cat: "crumb", name: "Крошка", main: "Крошка", val: 100, value: 100, crumbKind: "mix3:mix" }]), 15);
});

test("чеклист нового расчёта не оставляет скрытые фракции", () => {
  const sig = price.parseAnketSignals_("Индейка 100 г кусочки\nЛёгкое 100 г полоски\nСердце 100 г полоски\nРубец 100 г крупное");
  const list = price.pricePickComposeForTarget_(sig, "retail").items;
  function subOf(name) {
    const hit = list.find((it) => String(it.main || it.name) === name);
    assert.ok(hit, name);
    return hit.sub;
  }
  assert.equal(subOf("ИНДЕЙКА"), "Кусочки");
  assert.equal(subOf("ЛЁГКОЕ"), "Полоски");
  assert.equal(subOf("СЕРДЦЕ"), "Кусочки");
  assert.equal(subOf("РУБЕЦ Т"), "Среднее");
  assert.equal(goods(list.filter((it) => it.main === "ИНДЕЙКА")), 17);
  assert.equal(goods(list.filter((it) => it.main === "ЛЁГКОЕ")), 10);
  assert.equal(api.humanFraction("ИНДЕЙКА", "Полоски"), "полоски");
});
