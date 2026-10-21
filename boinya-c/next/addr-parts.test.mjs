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
const wSrc = fs.readFileSync(path.join(dir, "../proxy/worker.js"), "utf8");

function extractFn(src, name) {
  const marker = "function " + name + "(";
  const startFn = src.indexOf(marker);
  if (startFn < 0) throw new Error("missing function " + name);
  const brace = src.indexOf("{", startFn);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(startFn, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}

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

test("буквенный код подъезда и код домофона без слова отделяются", () => {
  const letter = pay.addressLossless("Октябрьская улица · 8 · п.К1202 · кв.40", eng);
  assert.equal(letter.ok, true, letter.reason);
  assert.equal(letter.parts.street, "Октябрьская улица · 8");
  assert.equal(letter.parts.entrance, "К1202");
  assert.equal(letter.parts.flat, "40");
  const code = pay.addressLossless("улица Космонавтов · 37 · п.5, к1441500 · эт.7 · кв.168", eng);
  assert.equal(code.ok, true, code.reason + " " + code.parts.street);
  assert.equal(code.parts.street, "улица Космонавтов · 37");
  assert.equal(code.parts.entrance, "5");
  assert.equal(code.parts.doorCode, "к1441500");
  assert.equal(code.parts.floor, "7");
  assert.equal(code.parts.flat, "168");
});

test("повтор и обрывок подъезда форма не раскладывает", () => {
  const dup = { address: "Корженевского 17 · п.4 · п.4", entrance: "", doorCode: "", floor: "", flat: "" };
  assert.equal(pay.absorbGluedAddress(dup, eng), false);
  assert.equal(dup.address, "Корженевского 17 · п.4 · п.4");
  assert.equal(dup.entrance, "");
  const state = { address: "Октябрьская улица · 8 · п.К1202 · кв.40", entrance: "", doorCode: "", floor: "", flat: "" };
  assert.equal(pay.absorbGluedAddress(state, eng), true);
  assert.equal(state.address, "Октябрьская улица · 8");
  assert.equal(state.entrance, "К1202");
  assert.equal(state.flat, "40");
  assert.equal(pay.absorbGluedAddress(state, eng), false);
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

test("опечатка в нике находится по второму handle в подписи карточки", () => {
  const ctx = vm.createContext({ Object, String, RegExp });
  const names = ["normalizeMatchKey_", "subscriptionNickKeys_", "subscriptionMatch_", "subscriptionSheetKey_", "sheetsEqual_"];
  vm.runInContext(names.map((n) => extractFn(wSrc, n)).join("\n"), ctx);
  const card = {
    sheet: "ПП",
    subId: "3",
    nick: "sunflower2175",
    label: "Тамара sunfkower2175 sunflower2175",
    address: "Октябрьская"
  };
  const keys = ctx.subscriptionNickKeys_(card);
  assert.ok(keys.includes("SUNFKOWER2175"));
  assert.ok(keys.includes("SUNFLOWER2175"));
  assert.equal(ctx.subscriptionMatch_(card, "SUNFKOWER2175", "ПП", ""), true);
  assert.equal(ctx.subscriptionMatch_(card, "DARYAVOLCHEK15", "ПП", ""), false);
});

test("закрытие недели из воркера не дописывает чужой понедельник", () => {
  const src = fs.readFileSync(path.join(dir, "../../scripts/week-close-finish.mjs"), "utf8");
  assert.match(src, /plan\.oldMonday \|\| ""\) !== "2026-10-12"/);
  assert.match(src, /not_target_week/);
});
