import assert from "node:assert/strict";
import test from "node:test";
import { notifyDedupeIds_, notifyDmRoster_, notifyGroupChatOn_ } from "./notify-group.js";

test("group switch is off unless NOTIFY_GROUP_CHAT is on", function () {
  assert.equal(notifyGroupChatOn_(null), false);
  assert.equal(notifyGroupChatOn_({}), false);
  assert.equal(notifyGroupChatOn_({ NOTIFY_CHAT_ENABLED: "1" }), false);
  assert.equal(notifyGroupChatOn_({ NOTIFY_GROUP_CHAT: "on" }), true);
  assert.equal(notifyGroupChatOn_({ NOTIFY_GROUP_CHAT: "0" }), false);
});

test("ids are unique", function () {
  assert.deepEqual(notifyDedupeIds_(["1", "1", "", " 2 ", "2"]), ["1", "2"]);
});

test("roster names people who have not started", function () {
  const roster = notifyDmRoster_({
    ownerIds: ["1"],
    hubIds: [],
    started: { "1": true },
    people: [
      { telegramId: "1", name: "Арсений", role: "owner", status: "active" },
      { telegramId: "2", name: "Маша", username: "masha", role: "manager", status: "active" },
      { telegramId: "3", name: "Курьер", role: "courier", status: "active" },
      { telegramId: "4", name: "Петя", role: "cutter", status: "active" }
    ]
  });
  assert.deepEqual(roster.started.map(function (r) { return r.name; }), ["Арсений"]);
  assert.deepEqual(roster.missing.map(function (r) { return r.name; }), ["Маша (@masha)", "Петя"]);
});
