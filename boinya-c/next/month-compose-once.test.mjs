/**
 * month-compose-once-h1 (правило 03.11):
 * N2 — один состав в «Ваш состав на месяц…», не basket∥basket2.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const eng = require("./order-engine.js");
const context = { BoinyaOrderEngine: eng, console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(here, "ig-labels.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(here, "crumb-scheme.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(here, "price-logic.js"), "utf8"), context);
const P = context.BoinyaPrice;

function row(name, sub, val, cat) {
  return {
    cat: cat || "dressura",
    main: name,
    name: name,
    sub: sub || "",
    val: val,
    value: val
  };
}

/** Зеркало бага clients.js до фикса: concat basket+basket2. */
function buggyComposeList_(basket, basket2, n) {
  return (basket || []).concat(n >= 2 ? (basket2 || []) : []);
}

function countLine(msg, re) {
  return (msg.match(re) || []).length;
}

test("N1: состав один раз, basket2 игнор", () => {
  const b1 = [
    row("СЕРДЦЕ", "Ломтики", 50),
    row("ПОЧКИ", "Кусочки", 50),
    row("ЛЁГКОЕ", "Среднее", 200)
  ];
  const b2 = [row("СЕРДЦЕ", "Ломтики", 99)];
  const list = eng.monthComposeListForMessage_(b1, b2, 1);
  assert.equal(list.length, 3);
  assert.equal(Number(list[0].value), 50);
  const msg = P.composePpClientMessage(list, 1, "", 100, 80, "RAW26", {});
  assert.equal(countLine(msg, /Сердце - 50 г/g), 1);
  assert.match(msg, /Количество доставок в месяц - 1/);
});

test("N2 полная копия / почти-копия слотов: один состав (как на скрине)", () => {
  const b1 = [
    row("СЕРДЦЕ", "Ломтики", 50),
    row("ПОЧКИ", "Кусочки", 50),
    row("ЛЁГКОЕ", "Среднее", 200),
    row("БЫЧИЙ КОРЕНЬ", "Среднее", 1, "chew"),
    row("ТРАХЕЯ", "Большое", 2, "chew")
  ];
  const b2 = [
    row("СЕРДЦЕ", "Ломтики", 50),
    row("ПОЧКИ", "Кусочки", 50),
    row("ЛЁГКОЕ", "Среднее", 200),
    row("БЫЧИЙ КОРЕНЬ", "Среднее", 1, "chew"),
    row("ТРАХЕЯ", "Большое", 1, "chew")
  ];
  const beforeList = buggyComposeList_(b1, b2, 2);
  const before = P.composePpClientMessage(beforeList, 2, "", 200, 160, "RAW26", {});
  assert.equal(countLine(before, /Сердце - 50 г/g), 2, "до фикса сердце дважды");
  assert.equal(countLine(before, /Лёгкое - 200 г/g), 2);

  const list = eng.monthComposeListForMessage_(b1, b2, 2, {});
  const after = P.composePpClientMessage(list, 2, "", 200, 160, "RAW26", {});
  assert.equal(countLine(after, /Сердце - 50 г/g), 1);
  assert.equal(countLine(after, /Почки - 50 г/g), 1);
  assert.equal(countLine(after, /Лёгкое - 200 г/g), 1);
  assert.equal(countLine(after, /Бычий корень - 1 шт/g), 1);
  assert.equal(countLine(after, /Трахея - 2 шт/g), 1);
  assert.equal(countLine(after, /Трахея - 1 шт/g), 0, "второй слот не дописываем");
  assert.equal(countLine(after, /Сердце - 100 г/g), 0, "не суммируем копии в 100");
  assert.match(after, /Количество доставок в месяц - 2/);
  assert.match(after, /^Ваш состав на месяц получается/);
});

test("N2 одинаковые слоты: не удваивать граммы", () => {
  const b1 = [row("СЕРДЦЕ", "Ломтики", 50), row("ЛЁГКОЕ", "Среднее", 200)];
  const b2 = [row("СЕРДЦЕ", "Ломтики", 50), row("ЛЁГКОЕ", "Среднее", 200)];
  const list = eng.monthComposeListForMessage_(b1, b2, 2, {});
  assert.equal(list.length, 2);
  assert.equal(Number(list[0].value), 50);
  assert.equal(Number(list[1].value), 200);
});

test("N2 auto-split половины: состав = слот1 (доставка × N)", () => {
  const monthly = [
    row("СЕРДЦЕ", "Ломтики", 100),
    row("ЛЁГКОЕ", "Среднее", 200),
    row("ТРАХЕЯ", "Большое", 3, "chew")
  ];
  const split = eng.splitMonthlyBasketToTwoDeliveries_(monthly);
  assert.equal(split.ok, true);
  const list = eng.monthComposeListForMessage_(split.delivery1, split.delivery2, 2, {});
  assert.deepEqual(
    list.map((it) => [it.main, Number(it.value)]),
    split.delivery1.map((it) => [it.main, Number(it.value)])
  );
  const msg = P.composePpClientMessage(list, 2, "", 200, 160, "RAW26", {});
  assert.equal(countLine(msg, /Сердце - 50 г/g), 1);
  assert.equal(countLine(msg, /Сердце - 100 г/g), 0);
});

test("N2 ручное разное: merge один раз без дубль-строк", () => {
  const b1 = [row("СЕРДЦЕ", "Ломтики", 50), row("ТРАХЕЯ", "Большое", 2, "chew")];
  const b2 = [row("ПОЧКИ", "Кусочки", 80), row("ТРАХЕЯ", "Большое", 1, "chew")];
  const list = eng.monthComposeListForMessage_(b1, b2, 2, { ppManualDist: true });
  const byMain = Object.create(null);
  list.forEach((it) => {
    byMain[it.main] = Number(it.value);
  });
  assert.equal(byMain["СЕРДЦЕ"], 50);
  assert.equal(byMain["ПОЧКИ"], 80);
  assert.equal(byMain["ТРАХЕЯ"], 3);
  const msg = P.composePpClientMessage(list, 2, "", 200, 160, "RAW26", {});
  assert.equal(countLine(msg, /Трахея -/g), 1);
});
