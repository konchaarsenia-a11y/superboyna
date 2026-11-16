/**
 * month-compose-once-h1 (правило 03.11):
 * N2 — один суммарный список в «Ваш состав на месяц…» (товар+фракция складываются).
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

function qtyByMain(list) {
  const m = Object.create(null);
  (list || []).forEach((it) => {
    m[it.main] = Number(it.value);
  });
  return m;
}

test("N1: состав один раз, basket2 игнор; формат с «доставок»", () => {
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
  /* строка была и до правки в composePpClientMessage для N1 и N2 */
  assert.match(msg, /Количество доставок в месяц - 1/);
  assert.match(msg, /^Ваш состав на месяц получается/);
});

test("N2 почти-копия слотов (скрин): суммарный один список", () => {
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

  const list = eng.monthComposeListForMessage_(b1, b2, 2);
  const q = qtyByMain(list);
  assert.equal(q["СЕРДЦЕ"], 100);
  assert.equal(q["ПОЧКИ"], 100);
  assert.equal(q["ЛЁГКОЕ"], 400);
  assert.equal(q["БЫЧИЙ КОРЕНЬ"], 2);
  assert.equal(q["ТРАХЕЯ"], 3);

  const after = P.composePpClientMessage(list, 2, "", 200, 160, "RAW26", {});
  assert.equal(countLine(after, /Сердце - 100 г/g), 1);
  assert.equal(countLine(after, /Почки - 100 г/g), 1);
  assert.equal(countLine(after, /Лёгкое - 400 г/g), 1);
  assert.equal(countLine(after, /Бычий корень - 2 шт/g), 1);
  assert.equal(countLine(after, /Трахея - 3 шт/g), 1);
  assert.equal(countLine(after, /Сердце - 50 г/g), 0);
  assert.match(after, /Количество доставок в месяц - 2/);
  assert.match(after, /^Ваш состав на месяц получается/);
});

test("N2 равные слоты: суммы = 2×", () => {
  const b1 = [row("СЕРДЦЕ", "Ломтики", 50), row("ЛЁГКОЕ", "Среднее", 200)];
  const b2 = [row("СЕРДЦЕ", "Ломтики", 50), row("ЛЁГКОЕ", "Среднее", 200)];
  const list = eng.monthComposeListForMessage_(b1, b2, 2);
  assert.equal(list.length, 2);
  assert.equal(Number(list[0].value), 100);
  assert.equal(Number(list[1].value), 400);
});

test("N2 разные слоты (auto-split половины): merge в месячный", () => {
  const monthly = [
    row("СЕРДЦЕ", "Ломтики", 100),
    row("ЛЁГКОЕ", "Среднее", 200),
    row("ТРАХЕЯ", "Большое", 3, "chew")
  ];
  const split = eng.splitMonthlyBasketToTwoDeliveries_(monthly);
  assert.equal(split.ok, true);
  assert.notDeepEqual(
    qtyByMain(split.delivery1),
    qtyByMain(split.delivery2),
    "нечёт жевалки → разные слоты"
  );
  const list = eng.monthComposeListForMessage_(split.delivery1, split.delivery2, 2);
  const q = qtyByMain(list);
  assert.equal(q["СЕРДЦЕ"], 100);
  assert.equal(q["ЛЁГКОЕ"], 200);
  assert.equal(q["ТРАХЕЯ"], 3);
  const msg = P.composePpClientMessage(list, 2, "", 200, 160, "RAW26", {});
  assert.equal(countLine(msg, /Сердце - 100 г/g), 1);
  assert.equal(countLine(msg, /Трахея - 3 шт/g), 1);
});

test("N1 и N2: одинаковый каркас сообщения (доставок была и раньше)", () => {
  const b1 = [row("СЕРДЦЕ", "Ломтики", 50)];
  const n1 = P.composePpClientMessage(eng.monthComposeListForMessage_(b1, [], 1), 1, "", 40, 36, "RAW26", {});
  const n2 = P.composePpClientMessage(
    eng.monthComposeListForMessage_(b1, [row("СЕРДЦЕ", "Ломтики", 50)], 2),
    2, "", 80, 70, "RAW26", {}
  );
  assert.match(n1, /^Ваш состав на месяц получается\n\n/);
  assert.match(n2, /^Ваш состав на месяц получается\n\n/);
  assert.match(n1, /Количество доставок в месяц - 1/);
  assert.match(n2, /Количество доставок в месяц - 2/);
  assert.match(n1, /Цена за этот состав в розницу/);
  assert.match(n2, /Цена за этот состав в розницу/);
  assert.equal(countLine(n2, /Сердце - 100 г/g), 1);
});
