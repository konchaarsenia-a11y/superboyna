/**
 * partner-remove-h1: soft-delete точки, confirm-текст, счёт будущих, без hard-delete.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const partners = require("./partners-logic.js");
const worker = fs.readFileSync(path.resolve(import.meta.dirname, "../proxy/worker.js"), "utf8");
const partnersUi = fs.readFileSync(path.resolve(import.meta.dirname, "partners.js"), "utf8");

test("partner-remove-h1: soft-gone скрывает точку из списка", () => {
  const live = { id: "pt_varka_test", name: "Varka Тест", active: true };
  const gone = { id: "pt_varka_test", name: "Varka Тест", active: false };
  assert.equal(partners.partnerPointSoftGone_(live), false);
  assert.equal(partners.partnerPointSoftGone_(gone), true);
  assert.equal(partners.partnerPointListVisible_(live), true);
  assert.equal(partners.partnerPointListVisible_(gone), false);
});

test("partner-remove-h1: confirm текст с именем и числом будущих", () => {
  const bare = partners.partnerRemoveConfirmText_("Varka Цвирко 100", { futureActive: 0 });
  assert.match(bare, /Varka Цвирко 100/);
  assert.match(bare, /Убрать партнёра/);
  assert.equal(/будущих/.test(bare), false);
  const warn = partners.partnerRemoveConfirmText_("Varka Шевченко 1", { futureActive: 3 });
  assert.match(warn, /Varka Шевченко 1/);
  assert.match(warn, /3 будущих активных/);
  assert.match(warn, /не трогаем/);
});

test("partner-remove-h1: счёт будущих заявок/подписок без закрытых и прошлых", () => {
  const point = { id: "pt_varka_cvirko_100", name: "Varka Цвирко 100" };
  const pack = {
    orders: [
      { id: "o1", status: "new", locationId: "pt_varka_cvirko_100", deliverDateIso: "2026-12-01" },
      { id: "o2", status: "new", locationName: "Varka Цвирко 100", deliverDateIso: "2026-10-01" },
      { id: "o3", status: "cancelled", locationId: "pt_varka_cvirko_100", deliverDateIso: "2026-12-10" },
      { id: "o4", status: "new", locationName: "Varka Шевченко 1", deliverDateIso: "2026-12-01" },
      { id: "o5", status: "new", locationId: "pt_varka_cvirko_100" }
    ],
    subscriptions: [
      { nick: "a", status: "БП1", ppPartner: "Varka · Varka Цвирко 100" },
      { nick: "b", status: "архив", ppPartner: "Varka Цвирко 100" },
      { nick: "c", status: "ПП", ppPartner: "Varka Шевченко 1" }
    ]
  };
  const n = partners.partnerPointFutureActives_(point, pack, { today: "2026-11-20" });
  assert.equal(n.futureOrders, 2);
  assert.equal(n.futureSubs, 1);
  assert.equal(n.futureActive, 3);
});

test("partner-remove-h1: Worker soft-delete + dry, без notify", () => {
  assert.match(worker, /partner-remove-h1/);
  assert.match(worker, /function partnerPointFutureActivesCount_/);
  assert.match(worker, /function previewSeedPartnerRemove_/);
  assert.match(worker, /deployMarker: "partner-remove-h1"/);
  const delStart = worker.indexOf("if (/^partnerDeletePoint$/i.test(a))");
  assert.ok(delStart > 0);
  const delChunk = worker.slice(delStart, delStart + 2200);
  assert.match(delChunk, /partnerCanWriteAccess_/);
  assert.match(delChunk, /dry/);
  assert.match(delChunk, /active:\s*false/);
  assert.match(delChunk, /notified:\s*false/);
  assert.match(delChunk, /soft:\s*true/);
  assert.equal(/sendTelegram|partnerTelegramSend/.test(delChunk), false);
  const mutStart = worker.indexOf('if (action === "deletePartner")');
  assert.ok(mutStart > 0);
  const mutChunk = worker.slice(mutStart, mutStart + 1200);
  assert.match(mutChunk, /active:\s*false/);
  assert.match(mutChunk, /soft:\s*true/);
  assert.equal(/arr\.filter\(function \(p\) \{\s*const hit/.test(mutChunk), false);
});

test("partner-remove-h1: UI Убрать + confirm", () => {
  assert.match(partnersUi, /partner-remove-h1/);
  assert.match(partnersUi, /data-act="ph-pt-del"[^>]*>Убрать/);
  assert.match(partnersUi, /partnerRemoveConfirmText_/);
  assert.match(partnersUi, /dry:\s*"1"/);
  assert.match(partnersUi, /canManagePartners/);
});
