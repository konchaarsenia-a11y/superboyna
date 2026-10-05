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

test("ПП2 без отметки не забирает цену у отказа на ПП1", function () {
  var rows = [
    { name: "Рекс", segment: "ПП", ppSlot: "1/2", orderPrice: 80, paid: "no", _sumDate: "2026-10-03" },
    { name: "Рекс", segment: "ПП", ppSlot: "2/2", orderPrice: 80, paid: "", _sumDate: "2026-10-17" }
  ];
  assert.equal(L.revenueSum(rows), null);
  assert.equal(L.revenueSum(rows, { onlyDate: "2026-10-17" }), null);
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
