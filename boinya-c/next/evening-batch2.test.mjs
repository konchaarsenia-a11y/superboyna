import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("./week-logic.js");

test("к сбору: ПП1 и розница входят, ПП2 без оплаты на этом слоте нет", () => {
  const list = [
    { name: "Рекс · Ник", segment: "ПП", ppSlot: "1/2", deliverySlot: 1, orderPrice: 70, paid: "" },
    { name: "Нора · Ник", segment: "ПП", ppSlot: "2/2", deliverySlot: 2, orderPrice: 80, paid: "" },
    { name: "Мира · Ник", segment: "ПП", ppSlot: "2/2", deliverySlot: 2, orderPrice: 55, paid: "yes" },
    { name: "Розница", segment: "Р", orderPrice: 9 },
    { name: "Проба", segment: "БП", orderPrice: 15 }
  ];
  assert.equal(L.courierStopMoney(list[0]), 70);
  assert.equal(L.courierStopMoney(list[1]), null);
  assert.equal(L.courierStopMoney(list[2]), 55);
  assert.equal(L.courierStopMoney(list[3]), 9);
  assert.equal(L.courierStopMoney(list[4]), null);
  assert.equal(L.courierCollectSum(list), 134);
});

test("залипшая 1 с подписью ПП 2 не входит в сбор", () => {
  const stuck = { segment: "ПП", ppSlot: "1", ppHint: "ПП 2", deliverySlot: 1, orderPrice: 40 };
  assert.equal(L.courierStopMoney(stuck), null);
  const real = { segment: "ПП", ppSlot: "1", ppHint: "ПП 1", orderPrice: 40 };
  assert.equal(L.courierStopMoney(real), 40);
});

test("N=1 платит на своём слоте, paid=no не входит", () => {
  assert.equal(L.courierStopMoney({ segment: "ПП", deliveriesN: 1, ppSlot: "1", orderPrice: 33 }), 33);
  assert.equal(L.courierStopMoney({ segment: "ПП", ppSlot: "1/2", orderPrice: 33, paid: "no" }), null);
  assert.equal(L.courierStopMoney({ segment: "ПП", ppSlot: "2/2", orderPrice: 33, paid: "no" }), null);
  assert.equal(L.courierStopMoney({ segment: "ПП", ppSlot: "", orderPrice: 21 }), 21);
});

test("пустой список к сбору — 0", () => {
  assert.equal(L.courierCollectSum([]), 0);
  assert.equal(L.courierCollectSum(null), 0);
});

test("нарезка не рисует формулу процентов", () => {
  const src = readFileSync(new URL("./production.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /nx-prog__line/);
  assert.doesNotMatch(src, /0,8×/);
  assert.match(src, /nx-prog__pct/);
});

test("карточка курьера: телефон у адреса, сумма под маршрутами, крупный Доставлен", () => {
  const src = readFileSync(new URL("./production.js", import.meta.url), "utf8");
  const build = src.indexOf('data-act="pr-build"');
  const collect = src.indexOf("К сбору сегодня");
  const tel = src.indexOf("nx-tel");
  const pack = src.indexOf("Состав набора");
  assert.ok(build > 0 && collect > build);
  assert.ok(tel > 0 && tel < pack);
  assert.match(src, /nx-check--lg/);
  assert.match(src, /> Доставлен</);
  assert.doesNotMatch(src, /> доставлен</);
});

test("Ещё открывается у простой роли, Цели остаются в меню", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /route\.tab !== "goals" && route\.tab !== "more"/);
  assert.match(app, /data-act="more-goals"/);
  assert.match(app, /Цели/);
});
