import assert from "node:assert/strict";
import test from "node:test";
import { afkSamePerson_, duplicateSheetBlocked_, planAfkPpSplit_, ppCreateBlockedByAfk_ } from "./afk-guard.js";

const afk = { nick: "vi.minaeva_nails", label: "Вика vi.minaeva_nails", sheet: "АФК", subId: "sub-1" };

test("AFK holds the same instagram from a new PP card", function () {
  assert.equal(afkSamePerson_(afk, { nick: "@vi.minaeva_nails", sheet: "ПП" }), true);
  assert.equal(
    ppCreateBlockedByAfk_([afk], { nick: "vi.minaeva_nails", sheet: "ПП", segment: "ПП" }),
    true
  );
});

test("a different person and an explicit return are not blocked", function () {
  assert.equal(ppCreateBlockedByAfk_([afk], { nick: "other.dog", sheet: "ПП" }), false);
  assert.equal(ppCreateBlockedByAfk_([afk], { nick: "vi.minaeva_nails", sheet: "БП" }), false);
  assert.equal(
    ppCreateBlockedByAfk_([afk], { nick: "vi.minaeva_nails", sheet: "ПП", allowLeaveAfk: true }),
    false
  );
});

test("an AFK card does not come back while PP remains", function () {
  const pp = { nick: "_madmazelka_", sheet: "ПП", subId: "47", basket: [{ name: "ломтики" }] };
  assert.equal(duplicateSheetBlocked_([pp], { nick: "_madmazelka_", sheet: "АФК", subId: "47" }), true);
  assert.equal(duplicateSheetBlocked_([pp], { nick: "_madmazelka_", sheet: "ПП", subId: "47" }), false);
});

test("split keeps Minaeva on AFK and Madmazelka on PP", function () {
  const rows = [
    { nick: "vi.minaeva_nails", sheet: "АФК", subId: "45", basket: [{ name: "a" }, { name: "b" }] },
    { nick: "vi.minaeva_nails", sheet: "ПП", subId: "45", basket: [{ name: "a" }] },
    { nick: "_madmazelka_", sheet: "ПП", subId: "47", basket: [{ name: "pp" }] },
    { nick: "_madmazelka_", sheet: "АФК", subId: "47", basket: [{ name: "afk" }] },
    { nick: "other", sheet: "ПП", subId: "9", basket: [{ name: "z" }] }
  ];
  const plan = planAfkPpSplit_(rows);
  assert.equal(plan.ok, true);
  assert.equal(plan.rows.length, 3);
  const mina = plan.rows.filter(function (row) { return row.subId === "45"; });
  const mad = plan.rows.filter(function (row) { return row.subId === "47"; });
  assert.equal(mina.length, 1);
  assert.equal(mina[0].sheet, "АФК");
  assert.equal(mina[0].basket.length, 2);
  assert.equal(mad.length, 1);
  assert.equal(mad[0].sheet, "ПП");
  assert.equal(mad[0].basket[0].name, "pp");
});

test("two short pet wishes stay separate", function () {
  const a = { nick: "house", sheet: "АФК", wishes: "Рекс", subId: "a" };
  const b = { nick: "house", sheet: "ПП", wishes: "Луна", subId: "b" };
  assert.equal(afkSamePerson_(a, b), false);
  assert.equal(ppCreateBlockedByAfk_([a], b), false);
});
