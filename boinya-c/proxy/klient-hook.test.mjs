import assert from "node:assert/strict";
import test from "node:test";
import {
  KLIENT_BOT_USERNAME,
  KLIENT_CABINET_URL,
  KLIENT_HOOK_PATH,
  klientBindPlan_,
  klientLoginPlan_,
  klientStartPack_
} from "./klient-hook.js";

test("start открывает кабинет кнопкой web_app", () => {
  const pack = klientStartPack_("Анна");
  assert.equal(pack.kind, "start");
  assert.match(pack.text, /Анна/);
  assert.equal(pack.markup.inline_keyboard[0][0].text, "Кабинет");
  assert.equal(pack.markup.inline_keyboard[0][0].web_app.url, KLIENT_CABINET_URL);
  assert.equal(KLIENT_HOOK_PATH, "/telegram/klient");
  assert.equal(KLIENT_BOT_USERNAME, "klientGB_bot");
});

test("уже привязанный telegram открывает кабинет", () => {
  const plan = klientBindPlan_({
    tid: "10001",
    username: "anna",
    users: [{ telegramId: "10001", username: "anna" }],
    crmExactCount: 0
  });
  assert.equal(plan.action, "open");
});

test("один кабинет без чужого telegram привязывается по нику", () => {
  const plan = klientBindPlan_({
    tid: "10001",
    username: "anna",
    users: [{ telegramId: "web_abc", username: "Anna" }],
    crmExactCount: 0
  });
  assert.equal(plan.action, "rebind");
  assert.equal(plan.fromId, "web_abc");
});

test("два кабинета или две подписки просят привычный вход", () => {
  const two = klientBindPlan_({
    tid: "10001",
    username: "anna",
    users: [
      { telegramId: "web_a", username: "anna" },
      { telegramId: "web_b", username: "anna" }
    ],
    crmExactCount: 0
  });
  assert.equal(two.action, "needLogin");
  assert.equal(two.reason, "ambiguous");
  const crm = klientBindPlan_({
    tid: "10001",
    username: "anna",
    users: [],
    crmExactCount: 2
  });
  assert.equal(crm.action, "needLogin");
});

test("ровно одна подписка без кабинета связывается сама", () => {
  const plan = klientBindPlan_({
    tid: "10001",
    username: "ollie",
    users: [],
    crmExactCount: 1
  });
  assert.equal(plan.action, "linkCrm");
});

test("вход по телефону один раз переносит найденный кабинет", () => {
  assert.equal(klientLoginPlan_({ freeCount: 1, foreignCount: 0, crmExactCount: 0 }).action, "rebind");
  assert.equal(klientLoginPlan_({ freeCount: 2, foreignCount: 0, crmExactCount: 0 }).action, "ambiguous");
  assert.equal(klientLoginPlan_({ freeCount: 0, foreignCount: 1, crmExactCount: 0 }).reason, "taken");
  assert.equal(klientLoginPlan_({ freeCount: 0, foreignCount: 0, crmExactCount: 0 }).action, "not_found");
});
