import assert from "node:assert/strict";
import test from "node:test";
import {
  BOINYA_MINI_URL,
  botAccessAsk_,
  botCallbackKind_,
  botGroupMemberAction_,
  botInboundMedia_,
  botProbeFrom_,
  botPrivateChatOk_,
  botStartCommand_,
  botStartPack_
} from "./bot-hook.js";

test("start opens the mini app", function () {
  const pack = botStartPack_({ name: "Аня", tid: "650923866", isOwner: true });
  assert.equal(pack.kind, "owner");
  assert.equal(pack.markup.inline_keyboard[0][0].text, "Открыть Бойню");
  assert.equal(pack.markup.inline_keyboard[0][0].web_app.url, BOINYA_MINI_URL);
  assert.match(pack.text, /владелец/);
});

test("unknown start asks for access and still has the mini app", function () {
  const pack = botStartPack_({ name: "", tid: "111222333" });
  assert.equal(pack.kind, "none");
  const rows = pack.markup.inline_keyboard;
  assert.equal(rows[0][0].web_app.url, BOINYA_MINI_URL);
  assert.equal(rows[1][0].callback_data, "access_req");
});

test("pending repeats the request", function () {
  const pack = botStartPack_({ tid: "111222333", role: "pending", status: "pending" });
  assert.equal(pack.kind, "pending");
  assert.equal(pack.markup.inline_keyboard[1][0].callback_data, "access_req");
});

test("courier start has no access button", function () {
  const pack = botStartPack_({ tid: "111222333", role: "courier", status: "active" });
  assert.equal(pack.kind, "role");
  assert.equal(pack.markup.inline_keyboard.length, 1);
  assert.match(pack.text, /курьер/);
});

test("group membership", function () {
  assert.deepEqual(
    botGroupMemberAction_({
      my_chat_member: {
        chat: { id: -100123, type: "supergroup" },
        new_chat_member: { status: "administrator" }
      }
    }),
    { action: "save", chatId: "-100123" }
  );
  assert.equal(
    botGroupMemberAction_({
      my_chat_member: {
        chat: { id: -100123, type: "group" },
        new_chat_member: { status: "kicked" }
      }
    }).action,
    "clear"
  );
  assert.equal(
    botGroupMemberAction_({
      my_chat_member: {
        chat: { id: 5, type: "private" },
        new_chat_member: { status: "member" }
      }
    }).action,
    "ignore"
  );
});

test("callback kinds leave the partner button alone", function () {
  assert.equal(botCallbackKind_("access_req"), "access_req");
  assert.equal(botCallbackKind_("costpub"), "costpub");
  assert.equal(botCallbackKind_("svsent:abc"), "svsent");
  assert.equal(botCallbackKind_("mtrack:tok"), "mtrack");
  assert.equal(botCallbackKind_("ppafk:tok"), "ppafk");
  assert.equal(botCallbackKind_("defdone:d1"), "defdone");
  assert.equal(botCallbackKind_("vrc:paid"), "vrc");
  assert.equal(botCallbackKind_("nope"), "");
});

test("commands and probe", function () {
  assert.deepEqual(botStartCommand_("/start gbi_abc"), { payload: "gbi_abc" });
  assert.equal(botStartCommand_("привет"), null);
  assert.equal(botAccessAsk_("Запросить доступ"), true);
  assert.equal(botAccessAsk_("/request"), true);
  assert.equal(botInboundMedia_({ photo: [{}] }), true);
  assert.equal(botInboundMedia_({ text: "/start" }), false);
  assert.equal(botProbeFrom_({ id: 999000111, username: "tokencheck" }), true);
  assert.equal(botProbeFrom_({ id: 650923866, username: "tokencheck" }), false);
  assert.equal(botPrivateChatOk_({ id: 111222333, type: "private" }, { id: 111222333 }), true);
  assert.equal(botPrivateChatOk_({ id: 1, type: "private" }, { id: 1 }), false);
});
