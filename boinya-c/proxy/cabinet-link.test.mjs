import assert from "node:assert/strict";
import test from "node:test";
import {
  composeAddress_,
  deliveryType_,
  dogPair_,
  cabinetTestLink_,
  cabinetTestMatch_,
  cabinetTestView_,
  gbMergeTestClient_,
  gbStripTestClient_,
  planGbTestClient_,
  clientCabinetView_,
  clientLookup_,
  exactClientHits_,
  leadClientReply_,
  leadMatch_,
  leadStaffText_,
  nextLeadId_,
  parseDogs_,
  registerPlan_,
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

test("клиент ищет по телефону или нику и не видит код", () => {
  const subs = [
    { subId: "1", nick: "anna", phone: "+375291112233", publicId: "ПП01" },
    { subId: "2", nick: "ann", phone: "+375291110000", publicId: "ПП02" }
  ];
  assert.equal(clientLookup_(subs, { publicId: "ПП01" }).status, "empty");
  assert.equal(clientLookup_(subs, { phone: "291112233", nick: "anna" }).status, "one");
  assert.equal(clientLookup_(subs, { phone: "291112233", nick: "ann" }).status, "many");
  assert.equal(clientLookup_(subs, { nick: "missing" }).status, "none");
  const dogs = parseDogs_([
    { name: "Бим", breed: "корги", weight: "12", allergies: "курица" },
    { name: "", breed: "такса" },
    { name: "Лада", breed: "такса", weightKg: "8", allergies: "" }
  ]);
  assert.equal(dogs.length, 2);
  assert.equal(dogs[1].weight, "8");
  assert.equal(registerPlan_({ status: "one" }, dogs).action, "bind");
  assert.equal(registerPlan_({ status: "many" }, dogs).action, "clarify");
  assert.equal(registerPlan_({ status: "none" }, dogs).action, "lead");
  assert.equal(registerPlan_({ status: "none" }, []).action, "error");
  const lead = { phone: "+375291112233", nick: "newdog", publicId: "НК01" };
  assert.equal(leadMatch_([lead], { nick: "@newdog" }).publicId, "НК01");
  assert.equal(leadMatch_([lead], { phone: "291110000" }), null);
  assert.equal(nextLeadId_(0).publicId, "НК01");
  assert.equal(nextLeadId_(21).seq, 22);
  const reply = leadClientReply_("register");
  assert.equal(reply.message, "Заявка принята, менеджер свяжется с вами");
  assert.equal(reply.showTry, true);
  assert.equal(Object.prototype.hasOwnProperty.call(reply, "publicId"), false);
  assert.equal(leadClientReply_("try").message, "Заявка принята");
  assert.match(leadStaffText_({ publicId: "НК03", name: "Анна", phone: "+375", nick: "anna", kind: "try", dogs: dogs.slice(0, 1) }), /НК03/);
  const view = clientCabinetView_({
    publicId: "ПП01",
    nick: "anna",
    link: { publicId: "ПП01", clientNick: "anna" },
    subscription: { publicId: "ПП01", segment: "ПП" }
  });
  assert.equal(view.publicId, undefined);
  assert.equal(view.link.publicId, undefined);
  assert.equal(view.subscription.publicId, undefined);
  assert.equal(view.nick, "anna");
  assert.equal(view.link.clientNick, "anna");
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

test("тестовый кабинет находится только по точному нику", () => {
  const pack = {
    users: [
      { userId: "u_arseniy_test", telegramId: "650923866", username: "arseniyhotko", name: "Арсений Хотько", phone: "", test: true },
      { userId: "u_real", telegramId: "111", username: "arseniyhotko_real", phone: "+375291110000" }
    ],
    links: [
      { userId: "u_arseniy_test", telegramId: "650923866", matchKey: "TEST:ARSENIY", test: true, status: "linked" },
      { userId: "u_real", telegramId: "111", matchKey: "REAL", status: "linked" }
    ]
  };
  assert.equal(cabinetTestMatch_(pack, { nick: "@arseniyhotko" }).hits[0].user.userId, "u_arseniy_test");
  assert.equal(cabinetTestMatch_(pack, { nick: "arseniy" }).status, "none");
  assert.equal(cabinetTestMatch_(pack, { nick: "arseniyhotko_real" }).status, "none");
  assert.equal(cabinetTestMatch_(pack, { nick: "arseniyhotko", phone: "+375291112233" }).status, "one");
  assert.equal(cabinetTestMatch_(pack, { phone: "+375291110000" }).status, "none");
  assert.equal(cabinetTestMatch_(pack, {}).status, "empty");
  assert.equal(cabinetTestLink_(pack.links[0]), true);
  assert.equal(cabinetTestLink_(pack.links[1]), false);
});

test("тестовая доставка видна в кабинете и не берётся из заказа", () => {
  const view = cabinetTestView_({
    today: "2026-10-26",
    tid: "650923866",
    user: { userId: "u_arseniy_test", telegramId: "650923866", username: "arseniyhotko", name: "Арсений Хотько", phone: "+375000000000" },
    pets: [{ id: "pet_arseniy_test", ownerTelegramId: "650923866", name: "Тест", breed: "тест", weightKg: 1 }],
    link: {
      userId: "u_arseniy_test",
      telegramId: "650923866",
      matchKey: "TEST:ARSENIY",
      clientNick: "Арсений Хотько",
      test: true,
      address: "Тест, не маршрут",
      deliveries: [
        { id: "old", date: "2026-10-01", lines: [{ name: "Старое", grams: 1 }] },
        { id: "test_arseniy_del_2026-11-02", date: "2026-11-02", day: "Понедельник", lines: [{ name: "Тестовая позиция", grams: 100, unit: "г" }], address: "Тест, не маршрут" }
      ]
    }
  });
  assert.equal(view.linked, true);
  assert.equal(view.test, true);
  assert.equal(view.sheet, "ТЕСТ");
  assert.equal(view.phone, "");
  assert.equal(view.user.phone, "");
  assert.equal(view.publicId, undefined);
  assert.equal(view.link.publicId, undefined);
  assert.equal(view.dogs.length, 1);
  assert.equal(view.dogs[0].name, "Тест");
  assert.equal(view.deliveries.length, 1);
  assert.equal(view.deliveries[0].date, "2026-11-02");
  assert.equal(view.deliveries[0].type, "ТЕСТ");
  assert.equal(view.deliveries[0].nearest, true);
  assert.equal(view.deliveries[0].payText, "");
  assert.equal(view.address.line, "Тест, не маршрут");
});

test("план теста не трогает чужие строки и не пишет телефон", () => {
  const other = { userId: "u_other", telegramId: "111", username: "real_client", phone: "+375291110000", name: "Анна" };
  const otherLink = { userId: "u_other", telegramId: "111", matchKey: "REAL", status: "linked", phone: "+375291110000" };
  const otherPet = { id: "pet_other", ownerTelegramId: "111", name: "Рекс" };
  const plan = planGbTestClient_({ users: [other], links: [otherLink], pets: [otherPet] }, { now: "2026-10-26T00:00:00.000Z" });
  assert.equal(plan.action, "write");
  assert.equal(plan.loginNick, "arseniyhotko");
  assert.equal(plan.userId, "u_arseniy_test");
  assert.equal(plan.users.length, 2);
  assert.deepEqual(plan.users[0], other);
  assert.equal(plan.users[1].phone, "");
  assert.equal(plan.users[1].test, true);
  assert.deepEqual(plan.links[0], otherLink);
  assert.equal(plan.links[1].matchKey, "TEST:ARSENIY");
  assert.equal(plan.pets[1].name, "Тест");
  assert.equal(plan.links[1].deliveries[0].date, "2026-11-02");
  const again = planGbTestClient_({ users: plan.users, links: plan.links, pets: plan.pets }, { now: "2026-10-26T00:00:00.000Z" });
  assert.equal(again.reason, "update");
  assert.equal(again.users.length, 2);
  assert.equal(planGbTestClient_({
    users: [{ userId: "u_real", telegramId: "650923866", username: "arseniyhotko", phone: "+375291110000" }]
  }, {}).reason, "tid_real");
  const fallback = planGbTestClient_({ users: [], links: [], pets: [] }, { arseniyhotko: 1 });
  assert.equal(fallback.loginNick, "arseniyhotko_test");
  assert.equal(plan.extra.user.phone, "");
  assert.equal(plan.extra.link.deliveries[0].date, "2026-11-02");
  const merged = gbMergeTestClient_({ users: [other], links: [otherLink], pets: [otherPet] }, plan.extra);
  assert.equal(merged.users.length, 2);
  assert.deepEqual(merged.users[0], other);
  const twice = gbMergeTestClient_(merged, plan.extra);
  assert.equal(twice.users.length, 2);
  const blocked = gbMergeTestClient_({
    users: [{ userId: "u_real", telegramId: "650923866", username: "arseniyhotko" }],
    links: [],
    pets: []
  }, plan.extra);
  assert.equal(blocked.users.length, 1);
  const stripped = gbStripTestClient_(twice);
  assert.deepEqual(stripped.users, [other]);
  assert.deepEqual(stripped.links, [otherLink]);
  assert.deepEqual(stripped.pets, [otherPet]);
});

test("отпечаток заказа не включает состав", () => {
  const a = orderFingerprint_([{ id: "1", match_key: "A", status: "active", updated_at: "t" }]);
  const b = orderFingerprint_([{ id: "1", match_key: "A", status: "active", updated_at: "t" }]);
  assert.equal(a, b);
  assert.notEqual(subFingerprint_([{ id: "1", nick: "a", sheet: "ПП", status: "" }]), subFingerprint_([{ id: "1", nick: "a", sheet: "АФК", status: "" }]));
});
