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
  const netSrc = ["partnerPointKey_", "partnerAddressKey_", "partnerNetworkOnly_", "partnerNetworkRowDup_"].map(grab).join("\n");
  const net = new Function(netSrc + "\nreturn { only: partnerNetworkOnly_, dup: partnerNetworkRowDup_ };")();
  assert.equal(net.only("Варка"), true);
  assert.equal(net.only("Varka Цвирко 100"), false);
  assert.equal(net.dup({ name: "Варка", address: "Цвирко 100" }, { locationName: "Varka Цвирко 100", address: "Цвирко 100" }), true);
  assert.equal(net.dup({ name: "Varka Шевченко 1", address: "Шевченко 1" }, { locationName: "Varka Цвирко 100" }), false);
  assert.match(worker, /skipped: "partner_point_shown"/);
  const pickSrc = ["partnerOrderIsClosed_", "partnerOrderDate_", "partnerPointKey_", "partnerDeleteTargets_"].map(grab).join("\n");
  const pick = new Function(pickSrc + "\nreturn partnerDeleteTargets_;")();
  const sample = [
    { id: "po_mvjkin1kgthq", status: "new", deliverDateIso: "2026-10-27", locationName: "Varka Цвирко 100" },
    { id: "po_mvjgt71nlc44", status: "new", deliverDateIso: "2026-10-27", locationName: "Varka Шевченко 1" },
    { id: "other", status: "new", deliverDateIso: "2026-10-27", locationName: "Varka Голодеда 15" },
    { id: "gone", status: "cancelled", deliverDateIso: "2026-10-27", locationName: "Varka Цвирко 100" }
  ];
  assert.deepEqual(pick(sample, "Varka Цвирко 100", "2026-10-27", "").map(function (o) { return o.id; }), ["po_mvjkin1kgthq"]);
  assert.deepEqual(pick(sample, "Varka Шевченко 1", "2026-10-28", "po_mvjgt71nlc44").map(function (o) { return o.id; }), ["po_mvjgt71nlc44"]);
  assert.equal(pick(sample, "Варка", "2026-10-27", "").length, 0);
  assert.equal(pick(sample, "zzz_test", "2026-10-27", "").length, 0);
  assert.match(worker, /function cancelPartnerOrdersForPeopleDelete_/);
  assert.match(worker, /function partnerPointCoveredByOpenOrder_/);
  assert.match(worker, /calendarOnly && dateIso && !partnerHit/);
});

test("две точки Варки на одну дату не делят ключ", () => {
  // varka-point-key-h1: живая строка 27.10 была CAL:ВАРКА:2026-10-27, адрес «Шевченко 1».
  function grabUntil(name, next) {
    const start = worker.indexOf("function " + name + "(");
    assert.ok(start >= 0, name);
    const end = worker.indexOf("function " + next + "(", start + 1);
    assert.ok(end > start, next);
    return worker.slice(start, end);
  }
  const src = [
    grabUntil("normalizeMatchKey_", "matchKeyAliases_"),
    grabUntil("partnerPointKey_", "partnerOrderSaveKey_"),
    grabUntil("partnerOrderSaveKey_", "partnerSaveSibling_"),
    grabUntil("partnerSaveSibling_", "partnerAddressKey_"),
    "function segmentFromOrderParams_(params) { params = params || {}; const ot = String(params.orderType || params.segment || '').toLowerCase(); if (ot === 'partner' || ot.indexOf('парт') === 0) return 'ПАРТНЁР'; return ''; }"
  ].join("\n");
  const api = new Function(src + "\nreturn { norm: normalizeMatchKey_, key: partnerOrderSaveKey_, sib: partnerSaveSibling_ };")();
  assert.equal(api.norm("Varka Цвирко 100"), "VARKA");
  assert.equal(api.norm("Varka Шевченко 1"), "VARKA");
  assert.equal(api.norm("Варка Цвирко"), "ВАРКА ЦВИРКО");
  const tsv = api.key("Varka Цвирко 100", { orderType: "partner", address: "Цвирко 100" });
  const shev = api.key("Varka Шевченко 1", { orderType: "partner", address: "Шевченко 1" });
  assert.equal(tsv, "ВАРКА ЦВИРКО 100");
  assert.equal(shev, "ВАРКА ШЕВЧЕНКО 1");
  assert.notEqual(tsv, shev);
  assert.equal(api.key("Варка", { orderType: "partner", address: "Цвирко 1" }), "ВАРКА ЦВИРКО 1");
  assert.equal(api.key("Варка", { orderType: "partner", address: "Шевченко 1" }), "ВАРКА ШЕВЧЕНКО 1");
  assert.equal(api.key("Варка", { orderType: "partner" }), "ВАРКА");
  assert.equal(api.key("ЕВГЕНИЯ es_furman", { orderType: "pp" }), "");
  const rows = [
    { id: "Вторник:VARKA", client: "Varka Цвирко 100", match_key: "VARKA", address: "Цвирко 100", segment: "ПАРТНЁР", date_iso: "2026-10-27" },
    { id: "Вторник:ВАРКА ШЕВЧЕНКО 1", client: "Varka Шевченко 1", match_key: "ВАРКА ШЕВЧЕНКО 1", address: "Шевченко 1", segment: "ПАРТНЁР", date_iso: "2026-10-27" }
  ];
  const kept = rows.filter((row) => api.sib(row, "Varka Цвирко 100", "Цвирко 100", tsv));
  assert.deepEqual(kept.map((row) => row.id), ["Вторник:VARKA"]);
  const bare = [
    { id: "a", client: "Варка", match_key: "ВАРКА", address: "Цвирко 1", segment: "ПАРТНЁР" },
    { id: "b", client: "Варка", match_key: "ВАРКА", address: "Шевченко 1", segment: "ПАРТНЁР" }
  ];
  const one = bare.filter((row) => api.sib(row, "Варка", "Шевченко 1", "ВАРКА ШЕВЧЕНКО 1"));
  assert.deepEqual(one.map((row) => row.id), ["b"]);
  const logic = require("./week-logic.js");
  assert.equal(logic.viewClientKey("Varka Цвирко 100"), "ВАРКА ЦВИРКО 100");
  assert.equal(logic.viewClientKey("Varka Шевченко 1"), "ВАРКА ШЕВЧЕНКО 1");
  assert.notEqual(logic.viewClientKey("Varka Цвирко"), logic.viewClientKey("Varka Шевченко"));
  assert.equal(logic.viewClientKey("Варка"), "ВАРКА");
  assert.equal(logic.viewClientKey("ЕВГЕНИЯ es_furman"), "ESFURMAN");
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
