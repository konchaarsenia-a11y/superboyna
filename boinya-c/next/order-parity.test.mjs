import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const eng = require("./order-engine.js");
const pay = require("./order-payload.js");
const weekLogic = require("./week-logic.js");

function loadBrowser(file) {
  const sandbox = { window: {}, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(dir, file), "utf8"), sandbox);
  return sandbox;
}

const lung = { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", value: 200 };
const trachea = { cat: "chew", main: "ТРАХЕЯ", name: "ТРАХЕЯ", sub: "СРЕД", value: 3 };

function base(over) {
  return Object.assign({
    orderType: "pp",
    client: "Рекс · Анна",
    phone: "+375 29 111-22-33",
    address: "Сурганова 57Б",
    entrance: "2",
    floor: "5",
    flat: "12",
    deliveryDate: "2026-09-30",
    day: "Среда",
    deliveryAfter: "10:00",
    deliveryBefore: "14:00",
    priceInput: "43",
    retailPriceManual: false,
    retailPaidDelivery: false,
    ppPartner: "",
    partnerCouponsEnabled: false,
    couponsQty: "",
    couponPrice: "",
    baskets: { 1: [Object.assign({}, lung)], 2: [] },
    dogCount: 1,
    activeDog: 1,
    dogNames: { 1: "", 2: "" },
    notes: [{ text: "звонить за 30 минут", roles: { cour: true, mgr: false, cut: false }, permanent: true, itemKey: "" }],
    deliveryMethod: null,
    postOffice: "",
    outsideMinsk: false,
    geo: null,
    ppSlotManual: null,
    deliveriesN: 0,
    needManualSlot: false,
    igPaste: "",
    isEdit: false,
    editOriginalClient: "",
    editOriginalDay: "",
    editOriginalDate: "",
    editOriginalMatchKey: "",
    survey: null
  }, over || {});
}

test("розница: лёгкое 200 г + трахея 3 шт = 42, с доставкой 51", () => {
  const list = [lung, trachea];
  const quote = eng.retailQuote(list, false);
  assert.equal(quote.goods, 42);
  assert.equal(quote.total, 42);
  const paid = eng.retailQuote(list, true);
  assert.equal(paid.delivery, 9);
  assert.equal(paid.total, 51);
  const line = eng.retailLineCost(lung.main, lung.sub, lung.value, lung.cat, lung);
  assert.equal(line.cost, 18);
  assert.equal(eng.retailLineCost(trachea.main, trachea.sub, trachea.value, trachea.cat, trachea).cost, 24);
});

test("saveBooking розницы совпадает с полями старой формы", () => {
  const state = base({
    orderType: "retail",
    priceInput: "",
    retailPaidDelivery: false,
    baskets: { 1: [lung, trachea], 2: [] },
    notes: []
  });
  const book = pay.buildSaveBookingParams(state, eng, "Среда");
  assert.equal(book.action, "saveBooking");
  assert.equal(book.orderType, "retail");
  assert.equal(book.segment, "Р");
  assert.equal(book.source, "retail");
  assert.equal(book.orderPrice, "42");
  assert.equal(book.client, "Рекс · Анна");
  assert.equal(book.date, "2026-09-30");
  assert.equal(book.day, "Среда");
  assert.equal(book.alsoSaveOrder, "1");
  assert.equal(book.calendarOnly, "0");
  assert.equal(book.address, eng.composeDeliveryAddress("Сурганова 57Б", "2", "5", "12"));
  assert.equal(book.phone, "+375 29 111-22-33");
  assert.equal(book.deliveryAfter, "10:00");
  assert.equal(book.deliveryBefore, "14:00");
  assert.equal(book.ppPartner, "");
  const basket = JSON.parse(book.basket);
  assert.equal(basket.length, 2);
  assert.equal(basket[0].main, "ЛЁГКОЕ");
  assert.equal(basket[0].sub, "Ломтики");
  assert.equal(Number(basket[0].value), 200);
  assert.equal(basket[1].main, "ТРАХЕЯ");
  assert.equal(Number(basket[1].value), 3);
  assert.equal(basket[0].dog, undefined);
});

test("saveBooking ПП: цена из поля, слот 2/2", () => {
  const state = base({
    orderType: "pp",
    priceInput: "43",
    ppSlotManual: 2,
    deliveriesN: 2,
    needManualSlot: true
  });
  const book = pay.buildSaveBookingParams(state, eng, "Среда");
  assert.equal(book.orderPrice, "43");
  assert.equal(book.segment, "ПП");
  assert.equal(book.source, "pp");
  assert.equal(book.ppSlot, "2/2");
  assert.equal(book.deliverySlot, "2");
  assert.equal(book.deliveriesN, "2");
  assert.match(book.note, /\[NOTE:cour\|perm\] звонить за 30 минут/);
  assert.equal(book.permanentNote, "звонить за 30 минут");
});

test("saveBooking БП: цена 0 и партнёр", () => {
  const state = base({ orderType: "bp", priceInput: "99", ppPartner: "Лапа", notes: [] });
  const book = pay.buildSaveBookingParams(state, eng, "");
  assert.equal(book.orderPrice, "0");
  assert.equal(book.segment, "БП");
  assert.equal(book.source, "bp");
  assert.equal(book.ppPartner, "Лапа");
  assert.equal(book.day, "");
  assert.equal(book.alsoSaveOrder, "0");
  assert.equal(book.calendarOnly, "1");
});

test("две собаки попадают в корзину с полем dog", () => {
  const state = base({
    orderType: "retail",
    priceInput: "",
    dogCount: 2,
    activeDog: 1,
    baskets: {
      1: [lung],
      2: [trachea]
    },
    notes: []
  });
  const book = pay.buildSaveBookingParams(state, eng, "Среда");
  const basket = JSON.parse(book.basket);
  assert.equal(basket.length, 2);
  assert.equal(basket[0].dog, 1);
  assert.equal(basket[1].dog, 2);
  assert.equal(book.orderPrice, "18");
});

test("за Минском: тег Европочты и отделение в примечании", () => {
  const state = base({
    address: "Борисов, ул. Ленина 1",
    entrance: "",
    floor: "",
    flat: "",
    deliveryMethod: "euro",
    postOffice: "Борисов 3",
    outsideMinsk: true,
    notes: [{ text: "хрупкое", roles: { cour: true }, permanent: false, itemKey: "" }]
  });
  const packed = pay.noteOf(state, eng);
  assert.match(packed.note, /\[ЕВРОПОЧТА\]/);
  assert.match(packed.note, /\[ОТДЕЛЕНИЕ:Борисов 3\]/);
  assert.match(packed.note, /хрупкое/);
});

test("полный день — от 8 заказов", () => {
  const src = fs.readFileSync(path.join(dir, "orders.js"), "utf8");
  assert.match(src, /var FULL_FROM = 8/);
  assert.doesNotMatch(src, /num >= 12/);
  assert.match(src, /fullDayPrompt/);
});

test("панель: у владельца 5 вкладок, Цели только в Ещё, партнёр без Целей", () => {
  const box = loadBrowser("access.js");
  const A = box.BoinyaAccess;
  const owner = A.normalize({ status: "success", role: "owner" });
  assert.equal(A.navItems(owner).length, 5);
  assert.equal(JSON.stringify(A.navItems(owner).map((x) => x.id)), JSON.stringify(["orders", "clients", "production", "warehouse", "more"]));
  assert.equal(A.navItems(owner).some((x) => x.id === "goals"), false);
  const managerFull = A.normalize({
    status: "success",
    role: "manager",
    tabs: ["orderScreen", "subsScreen", "cuttingScreen", "warehouseScreen", "templatesScreen", "clientsScreen", "deferredScreen"]
  });
  assert.equal(A.navItems(managerFull).length, 5);
  assert.equal(JSON.stringify(A.navItems(managerFull).map((x) => x.id)), JSON.stringify(["orders", "clients", "production", "warehouse", "more"]));
  const managerPreset = A.normalize({ status: "success", role: "manager" });
  const ids = JSON.stringify(A.navItems(managerPreset).map((x) => x.id));
  assert.equal(ids, JSON.stringify(["orders", "clients", "more"]));
  assert.equal(A.canUseTasks(managerPreset), true);
  const cutter = A.normalize({ status: "success", role: "cutter" });
  assert.equal(A.isSimple(cutter), true);
  assert.equal(JSON.stringify(A.navItems(cutter).map((x) => x.id)), JSON.stringify(["production", "more"]));
  const noTasks = A.normalize({
    status: "success",
    role: "manager",
    tabs: ["orderScreen", "deferredScreen.none"]
  });
  assert.equal(A.canUseTasks(noTasks), false);
  const courier = A.normalize({ status: "success", role: "courier" });
  const logistics = A.normalize({ status: "success", role: "logistics" });
  assert.equal(A.isSimple(courier), true);
  assert.equal(A.isSimple(logistics), true);
  assert.equal(JSON.stringify(A.navItems(courier).map((x) => x.id)), JSON.stringify(["production", "more"]));
  assert.equal(JSON.stringify(A.navItems(logistics).map((x) => x.id)), JSON.stringify(["warehouse", "more"]));
  const partner = A.normalize({ status: "success", role: "partner" });
  assert.equal(A.navItems(partner).some((x) => x.id === "goals"), false);
  assert.equal(A.tabHas(managerPreset, "cuttingScreen"), false);
  assert.equal(A.tabHas(managerPreset, "warehouseScreen"), false);
  assert.equal(A.tabHas(managerPreset, "statsScreen"), false);
  assert.equal(A.tabHas(managerPreset, "peopleScreen"), false);
  assert.equal(A.tabHas(managerPreset, "subsScreen"), false);
  assert.equal(A.tabHas(cutter, "cuttingScreen"), true);
  assert.equal(A.tabHas(courier, "courierScreen"), true);
  assert.equal(A.tabHas(logistics, "warehouseScreen"), true);
  assert.equal(A.ROLE_TABS.manager.join("|"), "orderScreen|clientsScreen|priceScreen|deferredScreen|templatesScreen|partnerHubScreen");
  assert.equal(A.ROLE_TABS.cutter.join("|"), "cuttingScreen|deferredScreen");
  assert.equal(A.ROLE_TABS.courier.join("|"), "courierScreen|deferredScreen");
  assert.equal(A.ROLE_TABS.logistics.join("|"), "warehouseScreen|deferredScreen");
  assert.equal(A.SIMPLE.logistics, "Склад");
  assert.equal(weekLogic.NOTIFY_DEFAULTS.manager.join("|"), "wh_buy|date_nudge|missed_delivery|week_done|survey");
  assert.equal(weekLogic.NOTIFY_DEFAULTS.cutter.join("|"), "cut_deficit|out_next|cut_increase");
  assert.equal(weekLogic.NOTIFY_DEFAULTS.logistics.join("|"), "wh_buy|cut_deficit|out_next");
  assert.equal(weekLogic.NOTIFY_DEFAULTS.courier.join("|"), "");
});

test("профили, черновик заказа и дефицит после сохранения", () => {
  const mem = pay.mergeClientProfiles({}, [
    { nick: "Рекс", address: "Сурганова 1", phone: "+37529", basket: "[{\"name\":\"ЛЁГКОЕ\"}]", source: "pp" }
  ]);
  assert.equal(mem.РЕКС.address, "Сурганова 1");
  assert.equal(mem.РЕКС.basket[0].name, "ЛЁГКОЕ");
  assert.equal(pay.draftUseful({ client: "", address: "", baskets: { 1: [], 2: [] }, notes: [] }), false);
  assert.equal(pay.draftUseful({ client: "Рекс", baskets: { 1: [], 2: [] }, notes: [] }), true);
  assert.equal(pay.warehouseAlertOpen(null), false);
  assert.equal(pay.warehouseAlertOpen({ count: 0, clientDeficits: [], totalDeficits: [] }), false);
  assert.equal(pay.warehouseAlertOpen({ clientDeficits: [{ name: "Лёгкое", deficit: 1 }] }), true);
  const orders = fs.readFileSync(path.join(dir, "orders.js"), "utf8");
  assert.match(orders, /listClientProfiles/);
  assert.match(orders, /suggestAddress/);
  assert.match(orders, /checkOrderWarehouse/);
  assert.match(orders, /superboyna_order_form_draft_v1/);
  assert.doesNotMatch(orders, /Или дата/);
  assert.doesNotMatch(orders, /type="date"/);
  const shell = fs.readFileSync(path.join(dir, "shell.js"), "utf8");
  assert.match(shell, />= 650/);
  assert.match(shell, /UI разблокирован/);
});
