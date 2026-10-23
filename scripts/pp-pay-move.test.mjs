import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  backupSql_,
  noticeText_,
  payMoveSql_,
  planFromRows_,
  printOf_,
  restorePaySql_
} from "./pp-pay-move.mjs";

test("перенос пишет только пометки и второй прогон пустой", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE orders (id TEXT PRIMARY KEY, date_iso TEXT, match_key TEXT, client TEXT, segment TEXT, status TEXT, updated_at TEXT, address TEXT, basket_json TEXT, meta_json TEXT)"
  );
  const meta = JSON.stringify({ ppSlot: "1/2", paid: "no", orderPrice: 140, basket: "keep" });
  const meta2 = JSON.stringify({ ppSlot: "2/2", paid: "", orderPrice: 140 });
  db.prepare("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?)").run(
    "a", "2026-10-03", "REX", "Рекс", "ПП", "active", "t0", "addr", "[1]", meta
  );
  db.prepare("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?)").run(
    "b", "2026-10-17", "REX", "Рекс", "ПП", "active", "t0", "addr", "[1]", meta2
  );
  const rows = [
    { id: "a", date_iso: "2026-10-03", match_key: "REX", client: "Рекс", segment: "ПП", ppSlot: "1/2", paid: "no", orderPrice: 140 },
    { id: "b", date_iso: "2026-10-17", match_key: "REX", client: "Рекс", segment: "ПП", ppSlot: "2/2", paid: "", orderPrice: 140 }
  ];
  const plan = planFromRows_(rows);
  assert.equal(plan.notify.length, 0);
  plan.patches.forEach(function (p) {
    const sql = payMoveSql_(p.id, p.set, p.clear);
    assert.doesNotMatch(sql, /orderPrice|updated_at|basket_json/);
    db.exec(sql);
  });
  const a = JSON.parse(db.prepare("SELECT meta_json AS m, updated_at AS u FROM orders WHERE id = 'a'").get().m);
  const bRow = db.prepare("SELECT meta_json AS m, updated_at AS u, address AS ad FROM orders WHERE id = 'b'").get();
  const b = JSON.parse(bRow.m);
  assert.equal(a.payMoved, "pp2");
  assert.equal(a.orderPrice, 140);
  assert.equal(a.paid, "no");
  assert.equal(a.basket, "keep");
  assert.equal(b.payDue, 140);
  assert.equal(b.orderPrice, 140);
  assert.equal(bRow.u, "t0");
  assert.equal(bRow.ad, "addr");
  const again = planFromRows_([
    Object.assign({}, rows[0], { payMoved: a.payMoved, payMovedAmount: a.payMovedAmount, payMovedTo: a.payMovedTo }),
    Object.assign({}, rows[1], { payDue: b.payDue, payFromDate: b.payFromDate })
  ]);
  assert.equal(again.patches.length, 0);
  db.exec(restorePaySql_("a", rows[0]));
  db.exec(restorePaySql_("b", rows[1]));
  const back = JSON.parse(db.prepare("SELECT meta_json AS m FROM orders WHERE id = 'b'").get().m);
  assert.equal(back.payDue, undefined);
  assert.equal(back.orderPrice, 140);
  const stay = planFromRows_([rows[0]]);
  assert.equal(stay.notify.length, 1);
  assert.match(noticeText_(stay.notify), /Рекс 2026-10-03 140 BYN/);
  assert.match(backupSql_(), /ppPayMoveBackup:2026-10-23/);
  assert.match(backupSql_(), /ON CONFLICT\(cache_key\) DO NOTHING/);
  const finger = printOf_(
    [{ id: "a", price: 140, paid: "no", updated_at: "t0" }],
    ["id", "price", "paid", "updated_at"]
  );
  assert.equal(finger, "a|140|no|t0");
});
