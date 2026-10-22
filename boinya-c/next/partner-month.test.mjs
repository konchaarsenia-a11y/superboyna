import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const partners = require("./partners-logic.js");
const worker = fs.readFileSync(path.resolve(import.meta.dirname, "../proxy/worker.js"), "utf8");

test("очередь партнёров прячет прошедшие и оставляет будущую дату", () => {
  const items = [
    { id: "shev", status: "done", mode: "partner", payload: { deliverDateIso: "2026-10-27", orderStatus: "new", partnerOrderId: "po_shev", locationName: "Varka Шевченко 1" } },
    { id: "old", status: "done", mode: "partner", payload: { deliverDateIso: "2026-10-05", orderStatus: "new", partnerOrderId: "po_old", locationName: "Varka Голодеда 15" } },
    { id: "gone", status: "done", mode: "partner", payload: { deliverDateIso: "2026-10-27", orderStatus: "delivered", partnerOrderId: "po_gone" } },
    { id: "need", status: "open", mode: "partner", payload: { orderStatus: "new", partnerOrderId: "po_need" } }
  ];
  const left = partners.partnerHubOrders_(items, { today: "2026-10-22" });
  assert.deepEqual(left.map((it) => it.id), ["shev", "need"]);
});

test("дата уже есть — не задача и не тост «назначьте дату»", () => {
  const dated = { id: "shev", status: "done", mode: "partner", payload: { deliverDateIso: "2026-10-27", orderStatus: "new", needsSlot: false, partnerOrderId: "po_shev" } };
  const datedOpen = { id: "tsv", status: "open", mode: "partner", payload: { deliverDateIso: "2026-10-27", orderStatus: "new", needsSlot: true, partnerOrderId: "po_tsv" } };
  const need = { id: "need", status: "open", mode: "partner", payload: { orderStatus: "new", needsSlot: true, partnerOrderId: "po_need" } };
  const remind = { id: "rem", status: "open", mode: "remind", payload: { text: "позже" } };
  assert.equal(partners.partnerOrderNeedsDate_(dated), false);
  assert.equal(partners.partnerOrderNeedsDate_(datedOpen), false);
  assert.equal(partners.partnerOrderNeedsDate_(need), true);
  assert.equal(partners.partnerTaskOpen_(dated), false);
  assert.equal(partners.partnerTaskOpen_(datedOpen), false);
  assert.equal(partners.partnerTaskOpen_(need), true);
  assert.equal(partners.partnerTaskOpen_(remind), true);
  assert.equal(partners.partnerTaskOpen_({ id: "done", status: "done", mode: "remind", payload: {} }), false);
});

test("точки Варки не схлопываются в один handle", () => {
  function grab(name) {
    const start = worker.indexOf("function " + name + "(");
    assert.ok(start >= 0, name);
    let depth = 0;
    let seen = false;
    let i = start;
    for (; i < worker.length; i++) {
      const ch = worker[i];
      if (ch === "{") { depth++; seen = true; }
      else if (ch === "}") {
        depth--;
        if (seen && depth === 0) { i++; break; }
      }
    }
    return worker.slice(start, i);
  }
  const partnerPointKey_ = new Function(grab("partnerPointKey_") + "\nreturn partnerPointKey_;")();
  assert.equal(partnerPointKey_("Varka Цвирко 100"), "ВАРКА ЦВИРКО 100");
  assert.equal(partnerPointKey_("Варка Цвирко 100"), partnerPointKey_("Varka Цвирко 100"));
  assert.equal(partnerPointKey_("Varka Шевченко 1"), "ВАРКА ШЕВЧЕНКО 1");
  assert.notEqual(partnerPointKey_("Варка"), partnerPointKey_("Varka Шевченко 1"));
  assert.notEqual(partnerPointKey_("Varka Цвирко 100"), partnerPointKey_("Varka Шевченко 1"));
  const listed = grab("partnerOrderListed_");
  assert.equal(listed.includes("normalizeMatchKey_"), false);
  assert.match(listed, /partnerPointKey_/);
  const slot = worker.slice(worker.indexOf("Дата есть: карточка остаётся"), worker.indexOf("Дата есть: карточка остаётся") + 1400);
  assert.match(slot, /status: "done"/);
  assert.equal(slot.includes('status: "open"'), false);
  assert.match(worker, /function closeDatedPartnerDeferredItems_/);
});

test("месяц читает заявки с датой и не пишет их заново", () => {
  assert.match(worker, /function overlayPartnerDatesOnMonth_/);
  assert.match(worker, /function appendPartnerOrdersForDate_/);
  assert.match(worker, /return date >= today/);
  assert.match(worker, /partnerOrderIsClosed_/);
  const fn = worker.slice(worker.indexOf("async function overlayPartnerDatesOnMonth_"), worker.indexOf("async function appendPartnerOrdersForDate_"));
  assert.equal(fn.includes("DELETE"), false);
  assert.equal(fn.includes("INSERT"), false);
});
