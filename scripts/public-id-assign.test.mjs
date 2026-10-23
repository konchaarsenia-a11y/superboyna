import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  SQL_BUDGET,
  assignmentMismatches_,
  copySnapSql_,
  idRowsSql_,
  jsonSetStatements_,
  mapPatchStatements_,
  mapSeedSql_,
  patchesForSubs_,
  prefixTotals_,
  restoreSnapSql_,
  wantPublicIds_
} from "./public-id-assign.mjs";

function dbWith(payload) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE snap_cache (cache_key TEXT PRIMARY KEY, payload TEXT, updated_at TEXT)");
  db.prepare("INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES ('listSubscriptions', ?, '')").run(payload);
  return db;
}

test("короткий json_set дописывает код и не тащит весь список в SQL", () => {
  const subs = [];
  for (let i = 0; i < 300; i++) subs.push({ subId: String(i), nick: "n".repeat(40), basket: "x".repeat(200) });
  const payload = JSON.stringify({ subscriptions: subs });
  assert.ok(payload.length > SQL_BUDGET);
  const db = dbWith(payload);
  const patches = patchesForSubs_(subs, { 0: "ПП01", 10: "БП01", 20: "АФК03" }, "subscriptions");
  assert.equal(patches.length, 3);
  const sqls = jsonSetStatements_("listSubscriptions", patches, 15);
  sqls.forEach(function (sql) {
    assert.ok(sql.length < 8000);
    assert.equal(sql.includes(payload.slice(0, 80)), false);
    db.exec(sql);
  });
  const back = JSON.parse(db.prepare("SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'").get().payload);
  assert.equal(back.subscriptions[0].publicId, "ПП01");
  assert.equal(back.subscriptions[10].publicId, "БП01");
  assert.equal(back.subscriptions[20].publicId, "АФК03");
  assert.equal(back.subscriptions[1].publicId, undefined);
  assert.equal(back.subscriptions[1].nick, subs[1].nick);
  assert.equal(back.subscriptions[1].basket, subs[1].basket);
});

test("уже выданный код не перезаписывается", () => {
  const subs = [{ subId: "7", publicId: "РЗ04" }];
  assert.equal(patchesForSubs_(subs, { 7: "РЗ04" }, "subscriptions").length, 0);
  assert.equal(patchesForSubs_(subs, { 7: "РЗ05" }, "subscriptions")[0].publicId, "РЗ05");
});

test("карта кодов пишется парами и копируется отдельным оператором", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE snap_cache (cache_key TEXT PRIMARY KEY, payload TEXT, updated_at TEXT)");
  const sqls = [mapSeedSql_("clientPublicIdsNext", "2026-10-23T00:00:00.000Z")].concat(
    mapPatchStatements_("clientPublicIdsNext", {
      bySub: { "1": "ПП01", "a\"b": "ПАРТ02", "o'brien": "РЗ09" },
      byKey: { "ник.1": "БП03" },
      seq: { ПП: 1, ПАРТ: 2, РЗ: 9, БП: 3 }
    }, 2)
  );
  sqls.forEach(function (sql) {
    assert.ok(sql.length < 4000);
    db.exec(sql);
  });
  db.exec(copySnapSql_("clientPublicIdsNext", "clientPublicIds"));
  const map = JSON.parse(db.prepare("SELECT payload FROM snap_cache WHERE cache_key = 'clientPublicIds'").get().payload);
  assert.equal(map.bySub["1"], "ПП01");
  assert.equal(map.bySub['a"b'], "ПАРТ02");
  assert.equal(map.bySub["o'brien"], "РЗ09");
  assert.equal(map.byKey["ник.1"], "БП03");
  assert.equal(map.seq["ПП"], 1);
  assert.equal(map.seq["ПАРТ"], 2);
});

test("восстановление копирует прежний список на сервере", () => {
  const db = dbWith(JSON.stringify({ subscriptions: [{ subId: "1", publicId: "ПП01" }] }));
  db.exec("INSERT INTO snap_cache (cache_key, payload, updated_at) SELECT 'publicIdBackup:run:t', payload, updated_at FROM snap_cache WHERE cache_key = 'listSubscriptions'");
  db.exec("UPDATE snap_cache SET payload = json_set(payload, '$.subscriptions[0].publicId', 'ПП99') WHERE cache_key = 'listSubscriptions'");
  db.exec(restoreSnapSql_("publicIdBackup:run:t", "listSubscriptions"));
  const back = JSON.parse(db.prepare("SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'").get().payload);
  assert.equal(back.subscriptions[0].publicId, "ПП01");
});

test("без subId одинаковые ник и лист не угадываются", () => {
  const subs = [
    { matchKey: "a", nick: "Аня", sheet: "ПП" },
    { matchKey: "a", nick: "Аня", sheet: "ПП" }
  ];
  const planned = [
    { matchKey: "a", nick: "Аня", sheet: "ПП", publicId: "ПП01" },
    { matchKey: "a", nick: "Аня", sheet: "ПП", publicId: "ПП02" }
  ];
  const want = wantPublicIds_(subs, planned);
  assert.deepEqual(want, ["", ""]);
  assert.equal(patchesForSubs_(subs, want, "subscriptions").length, 0);
  const unique = wantPublicIds_(
    [{ subId: "", matchKey: "b", nick: "Боря", sheet: "БП" }],
    [{ matchKey: "b", nick: "Боря", sheet: "БП", publicId: "БП01" }]
  );
  assert.deepEqual(unique, ["БП01"]);
});

test("сверка ловит чужой порядок и чужой код", () => {
  const subs = [{ subId: "1" }, { subId: "2" }];
  const remote = [
    { idx: 0, subId: "1", publicId: "ПП01" },
    { idx: 1, subId: "2", publicId: "ПП02" }
  ];
  assert.equal(assignmentMismatches_(remote, subs, { 1: "ПП01", 2: "ПП02" }).length, 0);
  assert.ok(assignmentMismatches_(remote, subs, { 1: "ПП01", 2: "ПП03" }).length > 0);
  assert.equal(prefixTotals_(remote).ПП, 2);
  const db = dbWith(JSON.stringify({ subscriptions: [{ subId: "1", publicId: "ПП01" }, { id: "2", publicId: "АФК01" }] }));
  const rows = db.prepare(idRowsSql_("subscriptions")).all();
  assert.equal(rows.length, 2);
  assert.equal(String(rows[1].id), "2");
  assert.equal(rows[1].publicId, "АФК01");
});
