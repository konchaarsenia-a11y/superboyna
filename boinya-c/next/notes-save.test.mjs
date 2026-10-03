/**
 * Примечание заказа возвращается при повторном открытии,
 * черновик недели дописывает его в уже существующую строку.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const eng = require("./order-engine.js");

test("роли и разовый текст переживают строку листа", () => {
  const raw = eng.serializeOrderNotes([
    { text: "позвонить", roles: { mgr: true, cut: false, cour: false }, permanent: false, itemKey: "" },
    { text: "кубиком", roles: { mgr: false, cut: true, cour: true }, permanent: true, itemKey: "лёгкое" }
  ]);
  const back = eng.parseOrderNotes(raw);
  assert.equal(back.length, 2);
  assert.equal(back[0].text, "позвонить");
  assert.equal(back[0].roles.mgr, true);
  assert.equal(back[0].permanent, false);
  assert.equal(back[1].text, "кубиком");
  assert.equal(back[1].roles.cut, true);
  assert.equal(back[1].roles.cour, true);
  assert.equal(back[1].permanent, true);
  assert.equal(back[1].itemKey, "лёгкое");
});

test("простое примечание недели открывается как текст", () => {
  const back = eng.parseOrderNotes("не звонить в домофон");
  assert.equal(back.length, 1);
  assert.equal(back[0].text, "не звонить в домофон");
  assert.equal(back[0].roles.cour, true);
  assert.equal(eng.parseOrderNotes("").length, 0);
  assert.equal(eng.parseOrderNotes("[КУРЬЕР]").length, 0);
});

test("форма заказа читает note и кладёт его в снимок месяца", () => {
  const orders = fs.readFileSync(path.join(root, "boinya-c/next/orders.js"), "utf8");
  assert.match(orders, /parseOrderNotes\(client\.note\)/);
  assert.match(orders, /note: book\.note/);
  assert.match(orders, /function flushOrderNotes\(/);
});

test("клиенты и черновик недели не теряют примечание", () => {
  const clients = fs.readFileSync(path.join(root, "boinya-c/next/clients.js"), "utf8");
  const worker = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
  const gas = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
  const week = fs.readFileSync(path.join(root, "boinya-c/next/week-logic.js"), "utf8");
  assert.match(clients, /function flushClientNotes\(/);
  assert.match(clients, /enroll\.note = v/);
  assert.match(week, /note: c\.note \|\| ""/);
  assert.match(worker, /async function patchPulledNotes_/);
  assert.match(worker, /await patchPulledNotes_\(/);
  assert.match(gas, /writeBasketToDayColumn_\(ss, dayName, name, address, note, basket \|\| \[\], \{ overwriteMeta: true \}\)/);
});
