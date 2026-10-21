import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const eng = require("./order-engine.js");
const pay = require("./order-payload.js");

test("saveBooking хранит улицу отдельно от подъезда", () => {
  const book = pay.buildSaveBookingParams({
    orderType: "pp",
    client: "Рекс",
    address: "Сурганова 57Б",
    entrance: "2",
    doorCode: "12К",
    floor: "5",
    flat: "12",
    deliveryDate: "2026-10-24",
    baskets: { 1: [{ cat: "chew", main: "ТРАХЕЯ", name: "ТРАХЕЯ", sub: "", value: 1 }], 2: [] },
    notes: [],
    dogNames: { 1: "Рекс", 2: "" },
    dogCount: 1
  }, eng, "Пятница");
  assert.equal(book.address, "Сурганова 57Б");
  assert.equal(book.entrance, "2");
  assert.equal(book.doorCode, "12К");
  assert.equal(book.floor, "5");
  assert.equal(book.flat, "12");
  assert.equal(book.dogNames, JSON.stringify({ 1: "Рекс", 2: "" }));
  assert.equal(pay.showAddress({
    address: book.address,
    entrance: book.entrance,
    doorCode: book.doorCode,
    floor: book.floor,
    flat: book.flat
  }, eng), "Сурганова 57Б · п.2 · домофон 12К · эт.5 · кв.12");
});

test("склеенный адрес делится без потери и повтор не двоит", () => {
  const raw = "Сурганова 57Б · п.2 · домофон 12К · эт.5 · кв.12";
  const split = pay.addressLossless(raw, eng);
  assert.equal(split.ok, true, split.reason);
  assert.equal(split.parts.street, "Сурганова 57Б");
  assert.equal(split.parts.entrance, "2");
  assert.equal(split.parts.doorCode, "12К");
  assert.equal(split.parts.floor, "5");
  assert.equal(split.parts.flat, "12");
  const again = pay.addressLossless(split.shown, eng);
  assert.equal(again.ok, true);
  assert.equal(again.parts.street, split.parts.street);
  assert.equal(again.parts.doorCode, split.parts.doorCode);
});

test("повтор подъезда в строке не считается безопасным", () => {
  const raw = "Сурганова 57Б · п.2 · эт.5 · кв.12 · п.2 · эт.5 · кв.12";
  const split = pay.addressLossless(raw, eng);
  assert.equal(split.ok, false);
});

test("улица без подъезда не переписывается", () => {
  const split = pay.addressLossless("Сурганова 57Б", eng);
  assert.equal(split.ok, false);
  assert.equal(split.reason, "plain");
});

test("пустые поля заказа добираются из карточки, заполненные нет", () => {
  const state = { address: "", entrance: "", doorCode: "", floor: "", flat: "", phone: "111", dogNames: { 1: "", 2: "" } };
  const filled = pay.fillEmptyContact(state, {
    address: "Немига 5, подъезд 3, домофон 9, этаж 2, квартира 8",
    phone: "222",
    dogName: "Бим"
  }, eng);
  assert.equal(filled, true);
  assert.equal(state.phone, "111");
  assert.equal(state.entrance, "3");
  assert.equal(state.doorCode, "9");
  assert.equal(state.floor, "2");
  assert.equal(state.flat, "8");
  assert.equal(state.dogNames[1], "Бим");
  assert.doesNotMatch(state.address, /подъезд|домофон|этаж|кв/);
});

test("закрытие недели из воркера не дописывает чужой понедельник", () => {
  const src = fs.readFileSync(path.join(dir, "../../scripts/week-close-finish.mjs"), "utf8");
  assert.match(src, /plan\.oldMonday \|\| ""\) !== "2026-10-12"/);
  assert.match(src, /not_target_week/);
});
