import assert from "node:assert/strict";
import test from "node:test";
import { afkSamePerson_, ppCreateBlockedByAfk_ } from "./afk-guard.js";

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

test("two short pet wishes stay separate", function () {
  const a = { nick: "house", sheet: "АФК", wishes: "Рекс", subId: "a" };
  const b = { nick: "house", sheet: "ПП", wishes: "Луна", subId: "b" };
  assert.equal(afkSamePerson_(a, b), false);
  assert.equal(ppCreateBlockedByAfk_([a], b), false);
});
