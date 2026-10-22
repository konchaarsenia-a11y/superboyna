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

test("месяц читает заявки с датой и не пишет их заново", () => {
  assert.match(worker, /function overlayPartnerDatesOnMonth_/);
  assert.match(worker, /function appendPartnerOrdersForDate_/);
  assert.match(worker, /return date >= today/);
  assert.match(worker, /partnerOrderIsClosed_/);
  const fn = worker.slice(worker.indexOf("async function overlayPartnerDatesOnMonth_"), worker.indexOf("async function appendPartnerOrdersForDate_"));
  assert.equal(fn.includes("DELETE"), false);
  assert.equal(fn.includes("INSERT"), false);
});
