import assert from "node:assert/strict";
import test from "node:test";
import {
  composeAddress_,
  deliveryType_,
  dogPair_,
  exactClientHits_,
  moveDecision_,
  orderFingerprint_,
  pairRole_,
  parseAddress_,
  pausePlan_,
  payLabel_,
  planPpPayMove_,
  planPublicIds_,
  publicIdPrefix_,
  stockDecision_,
  subFingerprint_,
  waitNote_
} from "./cabinet-link.js";

test("префикс берётся с листа, АФК не становится ПП", () => {
  assert.equal(publicIdPrefix_("ПП"), "ПП");
  assert.equal(publicIdPrefix_("АФК"), "АФК");
  assert.equal(publicIdPrefix_("БП"), "БП");
  assert.equal(publicIdPrefix_("Р"), "РЗ");
  assert.equal(publicIdPrefix_("РОЗНИЦА"), "РЗ");
  assert.equal(publicIdPrefix_("ПАРТНЁР"), "ПАРТ");
});

test("ID один раз и не меняется при смене листа", () => {
  const first = planPublicIds_(
    [
      { subId: "2", matchKey: "B", nick: "b", sheet: "БП" },
      { subId: "1", matchKey: "A", nick: "a", sheet: "ПП" }
    ],
    null
  );
  assert.equal(first.subscriptions.find((s) => s.subId === "1").publicId, "ПП01");
  assert.equal(first.subscriptions.find((s) => s.subId === "2").publicId, "БП01");
  assert.deepEqual(first.issued, { ПП: 1, РЗ: 0, БП: 1, АФК: 0, ПАРТ: 0 });
  const again = planPublicIds_(
    [
      { subId: "1", matchKey: "A2", nick: "a2", sheet: "АФК", publicId: "ПП01" },
      { subId: "3", matchKey: "C", nick: "c", sheet: "Р" }
    ],
    first.map
  );
  assert.equal(again.subscriptions.find((s) => s.subId === "1").publicId, "ПП01");
  assert.equal(again.subscriptions.find((s) => s.subId === "3").publicId, "РЗ01");
  assert.equal(again.issued.ПП, 0);
  assert.equal(again.issued.РЗ, 1);
});

test("поиск точный и не выбирает из нескольких", () => {
  const subs = [
    { subId: "1", nick: "anna", phone: "+375291112233", publicId: "ПП01" },
    { subId: "2", nick: "ann", phone: "+375291110000", publicId: "ПП02" }
  ];
  assert.equal(exactClientHits_(subs, { publicId: "пп01" }).status, "one");
  assert.equal(exactClientHits_(subs, { nick: "anna" }).hits[0].subId, "1");
  assert.equal(exactClientHits_(subs, { nick: "ann" }).hits[0].subId, "2");
  assert.equal(exactClientHits_(subs, { nick: "an" }).status, "none");
  assert.equal(exactClientHits_(subs, { phone: "291112233" }).hits[0].publicId, "ПП01");
  assert.equal(exactClientHits_(subs, { nick: "anna", publicId: "ПП02" }).status, "none");
  const many = exactClientHits_(
    [
      { subId: "1", nick: "same", phone: "291112233" },
      { subId: "2", nick: "same", phone: "291112233" }
    ],
    { nick: "same" }
  );
  assert.equal(many.status, "many");
});

test("неоплата ПП1 переносится на ПП2 того же месяца", () => {
  const rows = [
    { id: "a", date: "2026-10-03", matchKey: "REX", client: "Рекс", segment: "ПП", ppSlot: "1/2", paid: "no", orderPrice: 140 },
    { id: "b", date: "2026-10-17", matchKey: "REX", client: "Рекс", segment: "ПП", ppSlot: "2/2", paid: "", orderPrice: 140 }
  ];
  const plan = planPpPayMove_(rows);
  assert.equal(plan.notify.length, 0);
  assert.equal(plan.patches.length, 2);
  const pp1 = plan.patches.find((p) => p.id === "a");
  const pp2 = plan.patches.find((p) => p.id === "b");
  assert.equal(pp1.set.payMoved, "pp2");
  assert.equal(pp1.set.payMovedAmount, 140);
  assert.equal(pp1.set.payMovedTo, "2026-10-17");
  assert.equal(pp2.set.payDue, 140);
  assert.equal(pp2.set.payFromDate, "2026-10-03");
  const again = planPpPayMove_([
    Object.assign({}, rows[0], pp1.set),
    Object.assign({}, rows[1], pp2.set)
  ]);
  assert.equal(again.patches.length, 0);
  const undone = planPpPayMove_([
    Object.assign({}, rows[0], pp1.set, { paid: "yes" }),
    Object.assign({}, rows[1], pp2.set)
  ]);
  assert.equal(undone.notify.length, 0);
  assert.ok(undone.patches.some((p) => p.id === "a" && p.clear.indexOf("payMoved") >= 0));
  assert.ok(undone.patches.some((p) => p.id === "b" && p.clear.indexOf("payDue") >= 0));
  const stay = planPpPayMove_([rows[0]]);
  assert.equal(stay.patches.length, 0);
  assert.equal(stay.notify.length, 1);
  assert.equal(stay.notify[0].amount, 140);
  const nextMonth = planPpPayMove_([
    rows[0],
    { id: "c", date: "2026-11-03", matchKey: "REX", client: "Рекс", segment: "ПП", ppSlot: "2/2", paid: "", orderPrice: 140 }
  ]);
  assert.equal(nextMonth.notify.length, 1);
  assert.equal(nextMonth.patches.filter((p) => p.set && p.set.payDue).length, 0);
  const labelMoved = payLabel_({ sheet: "ПП", slot: 1, deliveriesN: 2, paid: "no", orderPrice: 140, payMoved: "pp2" });
  assert.equal(labelMoved.text, "перенесено на доставку 2");
  const labelDue = payLabel_({ sheet: "ПП", slot: 2, deliveriesN: 2, paid: "", orderPrice: 140, payDue: 140 });
  assert.equal(labelDue.text, "к оплате на доставке 2: 140 BYN");
  assert.equal(payLabel_({ sheet: "ПП", slot: 1, deliveriesN: 2, paid: "no", orderPrice: 140 }).text, "Не оплачено. К оплате 140 BYN");
  assert.equal(payLabel_({ sheet: "ПП", slot: 2, deliveriesN: 2, paid: "", orderPrice: 140 }).role, "free");
  assert.equal(payLabel_({ sheet: "ПП", slot: 1, deliveriesN: 2, paid: "yes", orderPrice: 140 }).text, "Оплачено");
  assert.equal(pairRole_({ sheet: "ПП", slot: 1, deliveriesN: 2 }), "платная");
  assert.equal(pairRole_({ sheet: "ПП", slot: 2, deliveriesN: 2 }), "бесплатная");
  assert.equal(pairRole_({ sheet: "ПП", slot: 2, deliveriesN: 2, payDue: 140 }), "");
  assert.equal(deliveryType_({ sheet: "Р", slot: 1 }), "ДОМ");
  assert.equal(deliveryType_({ sheet: "БП" }), "БП");
  assert.equal(deliveryType_({ sheet: "ПП", ppSlot: "2/2", deliveriesN: 2 }), "ПП2");
  assert.equal(planPpPayMove_([{ id: "r", date: "2026-10-03", matchKey: "R", segment: "Р", slot: 1, paid: "no", orderPrice: 9 }]).patches.length, 0);
  const wide = planPpPayMove_([
    { id: "w1", date: "2026-10-01", matchKey: "REX", client: "Рекс", segment: "ПП", ppSlot: "1/2", paid: "no", orderPrice: 50 },
    { id: "w2", date: "2026-10-21", matchKey: "REX", client: "Рекс", segment: "ПП", ppSlot: "2/2", paid: "", orderPrice: 50 }
  ]);
  assert.equal(wide.notify.length, 0);
  assert.equal(wide.patches.find((p) => p.id === "w2").set.payDue, 50);
});

test("перенос в день доставки только просьба, за сутки применяется", () => {
  assert.equal(moveDecision_("2026-10-23", "2026-10-23", false).apply, false);
  assert.equal(moveDecision_("2026-10-23", "2026-10-23", false).clientText, "менеджер свяжется с вами");
  assert.equal(moveDecision_("2026-10-23", "2026-10-23", false).staff, "клиент просит перенести");
  assert.equal(moveDecision_("2026-10-22", "2026-10-23", false).apply, true);
  assert.equal(moveDecision_("2026-10-20", "2026-10-23", true).apply, false);
  assert.equal(moveDecision_("2026-10-20", "2026-10-23", true).reason, "confirm_only");
});

test("пауза снимает только будущий заказ", () => {
  const plan = pausePlan_("2026-10-23", [
    { id: "a", date: "2026-10-23", status: "active" },
    { id: "b", date: "2026-10-27", status: "active" },
    { id: "c", date: "2026-10-30", status: "deleted" }
  ]);
  assert.deepEqual(plan.deleteIds, ["b"]);
  assert.equal(plan.moveSheet, "АФК");
  assert.equal(pausePlan_("2026-10-23", [{ id: "a", date: "2026-10-20", status: "active" }]).hadFuture, false);
});

test("нет на складе только у новой позиции", () => {
  const stock = [{ name: "Лёгкое", dry_g: 10, raw_kg: 0 }];
  const ok = stockDecision_(["Лёгкое"], stock, []);
  assert.equal(ok.ok, true);
  const miss = stockDecision_(["Рубец"], stock, []);
  assert.equal(miss.ok, false);
  assert.match(miss.message, /Позиции сейчас нет/);
  assert.equal(stockDecision_(["Рубец"], stock, ["Рубец"]).ok, true);
  assert.match(waitNote_("как обычно", ["Рубец"]), /ждёт позицию Рубец/);
});

test("адрес как в заказе, код домофона отдельно", () => {
  const line = composeAddress_("Немига 5", "2", "3", "10");
  assert.equal(line, "Немига 5 · п.2 · эт.3 · кв.10");
  assert.deepEqual(parseAddress_(line), { street: "Немига 5", entrance: "2", floor: "3", flat: "10" });
});

test("собаки кабинета и заказа — одна пара", () => {
  const pair = dogPair_([{ name: "Бим", dog: 1 }], { 1: "Рекс", 2: "Лана" }, [{ name: "Тузик" }]);
  assert.equal(pair.dogNames[1], "Бим");
  assert.equal(pair.dogNames[2], "Лана");
  const fromPet = dogPair_([], null, [{ name: "Бим" }, { name: "Лана" }]);
  assert.equal(fromPet.dogs.length, 2);
});

test("отпечаток заказа не включает состав", () => {
  const a = orderFingerprint_([{ id: "1", match_key: "A", status: "active", updated_at: "t" }]);
  const b = orderFingerprint_([{ id: "1", match_key: "A", status: "active", updated_at: "t" }]);
  assert.equal(a, b);
  assert.notEqual(subFingerprint_([{ id: "1", nick: "a", sheet: "ПП", status: "" }]), subFingerprint_([{ id: "1", nick: "a", sheet: "АФК", status: "" }]));
});
