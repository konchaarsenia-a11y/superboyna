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

test("воркер чередует слот и не держит мёртвую ветку count<=0", function () {
  var src = fs.readFileSync(new URL("../proxy/worker.js", import.meta.url), "utf8");
  assert.match(src, /function suggestPpDeliverySlotD1_/);
  assert.match(src, /if \(last >= 2\) suggested = 1/);
  assert.doesNotMatch(src, /prior\.count <= 0/);
  assert.match(src, /suggestPpDeliverySlotD1_\(\{/);
});
