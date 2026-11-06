import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  orderMoveIsInPlace_,
  orderNickRenameIsInPlace_,
  planOrderMoveInPlace_,
  planOrderNickRenameKeep_
} from "./order-row-canon.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const worker = fs.readFileSync(path.join(root, "worker.js"), "utf8");

test("#19 rename keeps same row id, no soft-delete of target", () => {
  const rows = [
    {
      id: "CAL:ZZZ_OLD:2027-06-15",
      date_iso: "2027-06-15",
      day_name: "",
      client: "zzz_old",
      match_key: "ZZZ_OLD",
      segment: "Р",
      status: "active"
    }
  ];
  const plan = planOrderNickRenameKeep_(rows, {
    editClient: "zzz_old",
    editMatchKey: "ZZZ_OLD",
    client: "zzz_new",
    dateIso: "2027-06-15",
    segment: "Р"
  });
  assert.equal(plan.rename, true);
  assert.equal(plan.keepId, "CAL:ZZZ_OLD:2027-06-15");
  assert.equal(plan.newMatchKey, "ZZZ_NEW");
  assert.equal(orderNickRenameIsInPlace_(plan), true);
  assert.equal(plan.softDeleteIds.indexOf(plan.keepId), -1);
});

test("#19 duplicate on slot soft-deletes only the extra id", () => {
  const rows = [
    {
      id: "CAL:ZZZ_OLD:2027-06-15",
      date_iso: "2027-06-15",
      client: "zzz_old",
      match_key: "ZZZ_OLD",
      segment: "Р",
      status: "active"
    },
    {
      id: "CAL:ZZZ_OLD:2027-06-15#ALT",
      date_iso: "2027-06-15",
      client: "zzz_old",
      match_key: "ZZZ_OLD",
      segment: "Р",
      status: "active"
    }
  ];
  const plan = planOrderNickRenameKeep_(rows, {
    editClient: "zzz_old",
    client: "zzz_new",
    dateIso: "2027-06-15",
    segment: "Р"
  });
  assert.equal(plan.keepId, "CAL:ZZZ_OLD:2027-06-15");
  assert.deepEqual(plan.softDeleteIds, ["CAL:ZZZ_OLD:2027-06-15#ALT"]);
  assert.equal(orderNickRenameIsInPlace_(plan), true);
});

test("#23 move plans in-place UPDATE of the same source row", () => {
  const row = {
    id: "CAL:ZZZ_NEW:2027-06-15",
    date_iso: "2027-06-15",
    match_key: "ZZZ_NEW",
    client: "zzz_new",
    status: "active"
  };
  const plan = planOrderMoveInPlace_(row, {
    matchKey: "ZZZ_NEW",
    newDate: "2027-06-22"
  });
  assert.equal(orderMoveIsInPlace_(plan), true);
  assert.equal(plan.sourceId, "CAL:ZZZ_NEW:2027-06-15");
  assert.equal(plan.targetId, "CAL:ZZZ_NEW:2027-06-22");
  assert.equal(plan.sameRow, true);
  assert.deepEqual(plan.softDeleteClashIds, []);
});

test("#23 clash soft-deletes only the occupant, not the source", () => {
  const row = { id: "Пн:ZZZ", match_key: "ZZZ", client: "zzz", date_iso: "2026-11-09" };
  const plan = planOrderMoveInPlace_(row, {
    matchKey: "ZZZ",
    newDay: "Вт",
    newDate: "2026-11-10",
    occupants: [{ id: "Вт:ZZZ", status: "active" }]
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.sourceId, "Пн:ZZZ");
  assert.deepEqual(plan.softDeleteClashIds, ["Вт:ZZZ"]);
  assert.equal(plan.softDeleteClashIds.indexOf(plan.sourceId), -1);
});

test("worker wires #19/#23 in-place planners", () => {
  assert.match(worker, /from "\.\/order-row-canon\.js"/);
  assert.match(worker, /planOrderNickRenameKeep_/);
  assert.match(worker, /orderNickRenameIsInPlace_/);
  assert.match(worker, /planOrderMoveInPlace_/);
  assert.match(worker, /orderMoveIsInPlace_/);
  assert.match(worker, /orders-pack2 #19/);
  assert.match(worker, /orders-pack2 #23/);
  assert.doesNotMatch(
    worker,
    /fallback: если PK id нельзя сменить на занятый — upsert \+ soft-delete старого/
  );
  const ren = worker.indexOf("orders-pack2 #19");
  const block = worker.slice(ren, ren + 2200);
  assert.doesNotMatch(block, /UPDATE orders SET status = 'deleted'[\s\S]{0,120}editClient/);
  assert.match(block, /planOrderNickRenameKeep_/);
});
