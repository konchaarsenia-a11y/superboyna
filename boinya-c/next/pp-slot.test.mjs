import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("./week-logic.js");

test("после ПП2 следующая доставка — ПП1, не снова 2", function () {
  var s = L.suggestPpSlot({ deliveriesN: 2, lastSlot: 2, priorCount: 1 });
  assert.equal(s.slot, 1);
  assert.equal(s.ppSlot, "1/2");
});

test("после ПП1 следующая — ПП2", function () {
  var s = L.suggestPpSlot({ deliveriesN: 2, lastSlot: 1, priorCount: 1 });
  assert.equal(s.slot, 2);
  assert.equal(s.ppSlot, "2/2");
});

test("слот, уже записанный на дату, важнее счётчика", function () {
  var s = L.suggestPpSlot({ deliveriesN: 2, stored: 1, lastSlot: 2, priorCount: 1 });
  assert.equal(s.slot, 1);
});

test("N=1 всегда слот 1, без знаменателя 2", function () {
  var s = L.suggestPpSlot({ deliveriesN: 1, lastSlot: 2, priorCount: 3 });
  assert.equal(s.slot, 1);
  assert.equal(s.ppSlot, "1");
  var save = L.slotSaveParams({ name: "Анна", deliveriesN: 1 }, 2, "2026-10-02", "Пятница", false);
  assert.equal(save.ppSlot, "1");
  assert.equal(save.deliverySlot, "1");
});

test("номер слота из подписи", function () {
  assert.equal(L.ppSlotNumber("2/2"), 2);
  assert.equal(L.ppSlotNumber("1/2"), 1);
  assert.equal(L.ppSlotNumber(""), 0);
});

test("счётчики ПП1 и ПП2 не смешивают пустой слот", function () {
  var n = L.countPpSlots([
    { segment: "ПП", ppSlot: "1/2" },
    { segment: "ПП", ppSlot: "2/2" },
    { segment: "ПП", ppSlot: "" },
    { segment: "БП", ppSlot: "1/2" }
  ]);
  assert.deepEqual(n, { pp1: 1, pp2: 1 });
});

test("N=2 по-прежнему пишет 1/2", function () {
  var slot = L.slotSaveParams({ name: "Анна", deliveriesN: 2 }, 1, "2026-09-30", "Среда", false);
  assert.equal(slot.ppSlot, "1/2");
});

test("Вихрова: оплата на ПП1, цена ПП2 в сумму не входит", function () {
  var rows = [
    { name: "Вихрова", matchKey: "ВИХРОВА", segment: "ПП", ppSlot: "1/2", orderPrice: 70, paid: "yes", dateIso: "2026-10-02" },
    { name: "Вихрова", matchKey: "ВИХРОВА", segment: "ПП", ppSlot: "2/2", orderPrice: 70, paid: "", dateIso: "2026-10-16" }
  ];
  var got = L.attributePpRevenue(rows);
  assert.equal(got.doubled.length, 1);
  assert.equal(L.revenueSum(rows), 70);
  assert.equal(L.revenueSum(rows, { onlyDate: "2026-10-16" }), null);
});

test("karpusha 07.10: ПП2 без оплаты не входит в сумму месяца", function () {
  var rows = [
    { name: "karpusha_me", matchKey: "KARPUSHAME", segment: "ПП", ppSlot: "2/2", deliveriesN: 2, orderPrice: 120, paid: "", _sumDate: "2026-10-07" }
  ];
  assert.equal(L.revenueSum(rows), null);
  assert.equal(L.revenueSum(rows, { onlyDate: "2026-10-07" }), null);
  L.stampPpPay(rows);
  assert.equal(rows[0]._pay, 0);
});

test("неоплата ПП1 переносит сумму на ПП2 того же месяца один раз", function () {
  var rows = [
    { name: "Рекс", segment: "ПП", ppSlot: "1/2", orderPrice: 80, paid: "no", _sumDate: "2026-10-03" },
    { name: "Рекс", segment: "ПП", ppSlot: "2/2", orderPrice: 80, paid: "", _sumDate: "2026-10-17" }
  ];
  assert.equal(L.revenueSum(rows), 80);
  assert.equal(L.revenueSum(rows, { onlyDate: "2026-10-03" }), null);
  assert.equal(L.revenueSum(rows, { onlyDate: "2026-10-17" }), 80);
  L.stampPpPay(rows);
  assert.equal(rows[0]._pay, 0);
  assert.equal(rows[0]._payNote, "перенесено на доставку 2");
  assert.equal(rows[1]._pay, 80);
  var flagged = [
    { name: "Рекс", segment: "ПП", ppSlot: "1/2", orderPrice: 80, paid: "no", payMoved: "pp2", payMovedAmount: 80, _sumDate: "2026-10-03" },
    { name: "Рекс", segment: "ПП", ppSlot: "2/2", orderPrice: 80, payDue: 80, _sumDate: "2026-10-17" }
  ];
  assert.equal(L.revenueSum(flagged), 80);
  L.stampPpPay(flagged);
  assert.equal(flagged[0]._pay, 0);
  assert.equal(flagged[1]._pay, 80);
  var alone = [{ name: "Рекс", segment: "ПП", ppSlot: "1/2", orderPrice: 80, paid: "no", payMoved: "pp2", _sumDate: "2026-10-03" }];
  assert.equal(L.revenueSum(alone), null);
  L.stampPpPay(alone);
  assert.equal(alone[0]._pay, 0);
  assert.equal(alone[0]._payNote, "перенесено на доставку 2");
  var stay = [{ name: "Рекс", segment: "ПП", ppSlot: "1/2", orderPrice: 80, paid: "no", _sumDate: "2026-10-03" }];
  assert.equal(L.revenueSum(stay), 80);
});

test("оплата на ПП2: в сумму входит только эта доставка", function () {
  var rows = [
    { name: "Рекс", segment: "ПП", ppSlot: "1/2", orderPrice: 80, paid: "no", _sumDate: "2026-10-03" },
    { name: "Рекс", segment: "ПП", ppSlot: "2/2", orderPrice: 80, paid: "yes", _sumDate: "2026-10-17" }
  ];
  assert.equal(L.revenueSum(rows), 80);
  assert.equal(L.revenueSum(rows, { onlyDate: "2026-10-03" }), null);
  assert.equal(L.revenueSum(rows, { onlyDate: "2026-10-17" }), 80);
});

test("вторая ПП1 в том же месяце — свой цикл и своя сумма", function () {
  var rows = [
    { name: "Алина", matchKey: "ALINAGIDAYATHANOVA", segment: "ПП", ppSlot: "1/2", deliveriesN: 2, orderPrice: 140, paid: "", dateIso: "2026-10-02" },
    { name: "Алина", matchKey: "ALINAGIDAYATHANOVA", segment: "ПП", ppSlot: "2/2", deliveriesN: 2, orderPrice: 145, paid: "", dateIso: "2026-10-17" },
    { name: "Алина", matchKey: "ALINAGIDAYATHANOVA", segment: "ПП", ppSlot: "1/2", deliveriesN: 2, orderPrice: 145, paid: "", dateIso: "2026-10-30" }
  ];
  assert.equal(L.revenueSum(rows), 285);
  assert.equal(L.revenueSum(rows, { onlyDate: "2026-10-02" }), 140);
  assert.equal(L.revenueSum(rows, { onlyDate: "2026-10-17" }), null);
  assert.equal(L.revenueSum(rows, { onlyDate: "2026-10-30" }), 145);
  var attr = L.attributePpRevenue(rows);
  assert.equal(attr.doubled.length, 1);
  assert.deepEqual(attr.doubled[0].slots, [1, 2]);
  L.stampPpPay(rows);
  assert.equal(rows[0]._pay, 140);
  assert.equal(rows[1]._pay, 0);
  assert.equal(rows[2]._pay, 145);
});

test("БП с ценой 0 — известный ноль, пустая цена остаётся пустой", function () {
  var rows = [
    { name: "sashin.pushok", segment: "БП", orderType: "bp", orderPrice: "0", dateIso: "2026-10-19" }
  ];
  assert.equal(L.revenueSum(rows), 0);
  assert.equal(L.revenueSum(rows, { onlyDate: "2026-10-19" }), 0);
  assert.equal(L.revenueSum([], { onlyDate: "2026-10-19" }), null);
  assert.equal(
    L.revenueSum([{ segment: "БП", orderPrice: "", dateIso: "2026-10-19" }], { onlyDate: "2026-10-19" }),
    null
  );
});

test("цена ПП в форме сразу попадает в сумму заказа", function () {
  var src = fs.readFileSync(new URL("./orders.js", import.meta.url), "utf8");
  var fn = src.slice(src.indexOf("async function refreshPp"), src.indexOf("function orderVisible"));
  assert.match(fn, /patchMoney\(\)/);
});

test("без отметки оплаты цена подписки один раз, на меньшем слоте", function () {
  var rows = [
    { name: "Нора", segment: "ПП", ppSlot: "1/2", orderPrice: 50, dateIso: "2026-10-04" },
    { name: "Нора", segment: "ПП", ppSlot: "2/2", orderPrice: 50, dateIso: "2026-10-18" },
    { name: "Розница", segment: "Р", orderPrice: 9, dateIso: "2026-10-04" }
  ];
  assert.equal(L.revenueSum(rows), 59);
  assert.equal(L.attributePpRevenue(rows).doubled.length, 1);
});

test("месяц ставит _pay до отрисовки строки", function () {
  var src = fs.readFileSync(new URL("./week.js", import.meta.url), "utf8");
  assert.match(src, /stampPpPay\(list\)/);
  assert.match(src, /stampPpPay\(monthList\)/);
  assert.match(src, /c\._pay/);
});

test("в правке заказа с месяца есть Отмена через deleteParams", function () {
  var src = fs.readFileSync(new URL("./orders.js", import.meta.url), "utf8");
  assert.match(src, /data-act="cancel-order"/);
  assert.match(src, /deleteParams\(/);
  assert.match(src, /Отменить доставку/);
});

test("воркер чередует слот и не держит мёртвую ветку count<=0", function () {
  var src = fs.readFileSync(new URL("../proxy/worker.js", import.meta.url), "utf8");
  assert.match(src, /function suggestPpDeliverySlotD1_/);
  assert.match(src, /if \(last >= 2\) suggested = 1/);
  assert.doesNotMatch(src, /prior\.count <= 0/);
  assert.match(src, /suggestPpDeliverySlotD1_\(\{/);
});

test("ПП1 оплачено — на ПП2 оплату не спрашиваем", function () {
  assert.equal(L.courierShouldAskPaid({
    segment: "ПП", deliveriesN: 2, ppSlot: "2/2", siblingPaid: "yes", paid: ""
  }), false);
  assert.equal(L.courierShouldAskPaid({
    segment: "ПП", deliveriesN: 2, ppSlot: "1/2", paid: ""
  }), true);
});

test("ПП2 не спрашивает оплату: она входит в первую доставку", function () {
  assert.equal(L.courierShouldAskPaid({
    segment: "ПП", deliveriesN: 2, ppSlot: "2/2", siblingPaid: "no"
  }), false);
  assert.equal(L.courierShouldAskPaid({
    segment: "ПП", deliveriesN: 2, ppSlot: "2/2", siblingPaid: ""
  }), false);
  assert.equal(L.courierShouldAskPaid({
    segment: "ПП", deliveriesN: 2, deliverySlot: 2, paid: ""
  }), false);
  assert.equal(L.courierStopMoney({
    segment: "ПП", deliveriesN: 2, ppSlot: "2/2", orderPrice: 80, paid: "yes"
  }), null);
  assert.equal(L.courierStopMoney({
    segment: "ПП", deliveriesN: 2, ppSlot: "2/2", orderPrice: 80, paid: ""
  }), null);
});

test("одна доставка ПП и розница спрашивают, БП нет, своя оплата закрывает вопрос", function () {
  assert.equal(L.courierShouldAskPaid({ segment: "ПП", deliveriesN: 1, ppSlot: "1" }), true);
  assert.equal(L.courierShouldAskPaid({ segment: "Р", source: "retail" }), true);
  assert.equal(L.courierShouldAskPaid({ segment: "БП", source: "bp" }), false);
  assert.equal(L.courierShouldAskPaid({ segment: "ПП", deliveriesN: 2, ppSlot: "2/2", paid: "yes", siblingPaid: "no" }), false);
});

test("почта не спрашивает оплату, обычный курьер спрашивает", function () {
  assert.equal(L.courierMailMethod({ note: "подъезд 2 [ЕВРОПОЧТА]" }), "euro");
  assert.equal(L.courierMailMethod({ deliveryMethod: "bel" }), "bel");
  assert.equal(L.courierMailMethod({ note: "европочта в тексте без тега" }), "");
  assert.equal(L.courierMailMethod({ note: "[КУРЬЕР]" }), "");
  assert.equal(L.courierMailMethod({ note: "[ПОЧТА] [ДРУГОЕ:сдэк]" }), "other");
  assert.equal(L.courierShouldAskPaid({
    segment: "Р", source: "retail", note: "[ПОЧТА]", paid: ""
  }), false);
  assert.equal(L.courierShouldAskPaid({
    segment: "ПП", deliveriesN: 1, note: "[БЕЛПОЧТА]", paid: ""
  }), false);
  assert.equal(L.courierShouldAskPaid({
    segment: "ПП", deliveriesN: 1, note: "[КУРЬЕР]", paid: ""
  }), true);
});

test("текст трека клиенту", function () {
  assert.equal(
    L.mailTrackClientText("BY123"),
    "Здравствуйте!\nОтправили ваш заказик\nВот трэк код для отслеживания: BY123"
  );
});
