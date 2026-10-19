import test from "node:test";
import assert from "node:assert/strict";
import {
  alexianaHitText_,
  alexianaMoveDecision_,
  groupAlexiana_
} from "./alexiana-find.js";

test("ищет кириллицу, латиницу и точку, не Александру", function () {
  assert.equal(alexianaHitText_("Алексиана"), true);
  assert.equal(alexianaHitText_("alexiana"), true);
  assert.equal(alexianaHitText_("Aleksi.anna"), true);
  assert.equal(alexianaHitText_("алексианна"), true);
  assert.equal(alexianaHitText_("Александра"), false);
  assert.equal(alexianaHitText_("vi.minaeva_nails"), false);
  assert.equal(alexianaHitText_(""), false);
});

test("разные ники не склеиваются", function () {
  const groups = groupAlexiana_([
    { kind: "card", nick: "alexiana", label: "Алексиана", sheet: "ПП", subId: "10" },
    { kind: "card", nick: "Aleksi.anna", label: "Aleksi.anna", sheet: "БП", subId: "11" }
  ]);
  assert.equal(groups.length, 2);
  assert.equal(alexianaMoveDecision_(groups).action, "list");
});

test("одна карточка ПП — перенос", function () {
  const groups = groupAlexiana_([
    { kind: "card", nick: "alexiana", label: "Алексиана", sheet: "ПП", subId: "10" },
    { kind: "subs", nick: "alexiana", label: "Алексиана", sheet: "pp", id: "10" }
  ]);
  assert.equal(groups.length, 1);
  const decision = alexianaMoveDecision_(groups);
  assert.equal(decision.action, "move");
  assert.equal(decision.card.subId, "10");
});

test("уже в АФК или только БП — не пишем", function () {
  const afk = groupAlexiana_([
    { kind: "card", nick: "alexiana", sheet: "АФК", subId: "10" }
  ]);
  assert.equal(alexianaMoveDecision_(afk).action, "list");
  const bp = groupAlexiana_([
    { kind: "card", nick: "Aleksi.anna", sheet: "БП", subId: "11" }
  ]);
  assert.equal(alexianaMoveDecision_(bp).action, "list");
  assert.equal(alexianaMoveDecision_([]).action, "none");
});
