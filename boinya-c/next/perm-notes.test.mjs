/**
 * Постоянное примечание остаётся за клиентом.
 * Разовое живёт только в этом заказе.
 * Карточка, сборка и маршрут читают оба вида из строки заказа.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../..");
const eng = require("./order-engine.js");
const pay = require("./order-payload.js");

const perm = { text: "звонить за 30 минут", roles: { cour: true, mgr: false, cut: false }, permanent: true, itemKey: "" };
const once = { text: "сегодня без звонка", roles: { cour: true, mgr: true, cut: false }, permanent: false, itemKey: "" };
const item = { text: "кубиком", roles: { cour: false, mgr: false, cut: true }, permanent: true, itemKey: "лёгкое" };

function state(over) {
  return Object.assign({
    orderType: "pp",
    client: "Рекс",
    phone: "",
    address: "Сурганова 1",
    entrance: "",
    doorCode: "",
    floor: "",
    flat: "",
    deliveryDate: "2026-10-30",
    day: "Пятница",
    deliveryAfter: "",
    deliveryBefore: "",
    priceInput: "40",
    baskets: { 1: [{ cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", value: 100 }], 2: [] },
    dogCount: 1,
    activeDog: 1,
    dogNames: { 1: "", 2: "" },
    notes: [perm, once, item],
    notesLoaded: true,
    clearPermanent: false,
    deliveryMethod: null,
    postOffice: "",
    outsideMinsk: false,
    geo: null,
    ppSlotManual: 1,
    deliveriesN: 1,
    isEdit: false
  }, over || {});
}

test("постоянное уходит в карточку клиента, разовое остаётся в заказе", () => {
  const book = pay.buildSaveBookingParams(state(), eng, "Пятница");
  assert.match(book.note, /\[NOTE:cour\|perm\] звонить за 30 минут/);
  assert.match(book.note, /\[NOTE:mgr,cour\|once\] сегодня без звонка/);
  assert.match(book.note, /\[NOTE:cut\|perm\|ITEM:лёгкое\] кубиком/);
  assert.equal(book.permanentNote, "звонить за 30 минут · кубиком");
  assert.match(book.permanentNotesTagged, /звонить за 30 минут/);
  assert.match(book.permanentNotesTagged, /кубиком/);
  assert.doesNotMatch(book.permanentNotesTagged, /сегодня без звонка/);
  assert.equal(book.permanentNotesLoaded, "1");
  assert.equal(book.clearPermanentNotes, "");
});

test("разовое без постоянного не помечает карточку к очистке", () => {
  const book = pay.buildSaveBookingParams(state({
    orderType: "retail",
    notes: [once],
    notesLoaded: false,
    clearPermanent: false
  }), eng, "Пятница");
  assert.match(book.note, /\|once\]/);
  assert.equal(book.permanentNotesTagged, "");
  assert.equal(book.permanentNotesLoaded, "");
  assert.equal(book.clearPermanentNotes, "");
});

test("ПП и партнёр шлют тот же признак постоянного", () => {
  ["pp", "partner"].forEach(function (ot) {
    const book = pay.buildSaveBookingParams(state({ orderType: ot, clearPermanent: true }), eng, "Пятница");
    assert.match(book.permanentNotesTagged, /\|perm\]/);
    assert.equal(book.clearPermanentNotes, "1");
    assert.equal(book.orderType, ot);
  });
});

test("карточка показывает оба вида, сборка не дублирует примечание позиции", () => {
  const raw = eng.serializeOrderNotes([perm, once, item]);
  assert.equal(pay.cardNoteText(raw), "звонить за 30 минут, сегодня без звонка, кубиком");
  assert.equal(pay.headerNoteText(raw), "звонить за 30 минут, сегодня без звонка");
  assert.equal(pay.headerNoteText(raw, "cour"), "звонить за 30 минут, сегодня без звонка");
  assert.equal(pay.headerNoteText(raw, "cut"), "");
});

test("новое постоянное дополняет уже лежащее, не стирая его", () => {
  const prev = eng.serializeOrderNotes([perm]);
  const next = eng.serializeOrderNotes([{ text: "код 12", roles: { cour: true }, permanent: true, itemKey: "" }]);
  const merged = pay.mergePermanentTagged(prev, next, eng);
  assert.match(merged, /звонить за 30 минут/);
  assert.match(merged, /код 12/);
  const again = pay.mergePermanentTagged(merged, prev, eng);
  assert.equal(again.split("||").length, 2);
});

test("форма не теряет текст, когда отмечают постоянное", () => {
  const orders = fs.readFileSync(path.join(dir, "orders.js"), "utf8");
  const permAt = orders.indexOf('act === "note-perm"');
  assert.match(orders.slice(permAt, permAt + 160), /flushOrderNotes\(\)/);
  assert.match(orders, /getAttribute\("data-act"\) === "note-text"/);
  assert.match(orders, /pullPermanentNotes\(/);
  assert.match(orders, /action: "getClientPermanentNotes"/);
  const week = fs.readFileSync(path.join(dir, "week.js"), "utf8");
  const prod = fs.readFileSync(path.join(dir, "production.js"), "utf8");
  assert.match(week, /cardNoteText/);
  assert.match(prod, /headerNoteText/);
  assert.match(prod, /function noteFor\(note, role\)/);
  assert.match(prod, /\(perm\|once\)/);
});

test("запись постоянного в D1 не затирает заказ и не стирает пустым сохранением", () => {
  const worker = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
  assert.match(worker, /async function rememberClientPermanentNotes_/);
  assert.match(worker, /async function getClientPermanentNotesD1_/);
  assert.match(worker, /if \(!loaded && !tagged && !clear\) return;/);
  assert.match(worker, /await rememberClientPermanentNotes_\(env, matchKey, params\)/);
  const fn = worker.slice(worker.indexOf("async function rememberClientPermanentNotes_"), worker.indexOf("async function readClientPermanentNotes_"));
  assert.match(fn, /prev: prev && prev\.tagged/);
  assert.doesNotMatch(fn, /UPDATE orders/);
});
