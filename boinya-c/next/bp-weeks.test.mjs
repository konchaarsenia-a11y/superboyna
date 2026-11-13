import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const W = require("./bp-weeks.js");
const F = require("./formulas.js");

test("t516u: по умолчанию 1 неделя, без БП2/ФИНАЛ", () => {
  assert.equal(W.weeksOf(undefined), 1);
  assert.equal(W.weeksOf(""), 1);
  assert.equal(W.weeksOf(2), 2);
  assert.equal(W.weeksOf("2"), 2);
  assert.equal(W.weeksOf(1), 1);
  assert.equal(W.parseWishes("просто текст").bpWeeks, 1);
  assert.equal(W.parseWishes("просто текст").bpWeeksSet, false);
  assert.equal(W.listLabel("БП2", ""), "БП");
  assert.equal(W.listLabel("БП1", "pp"), "БП, перешёл в ПП");
  assert.equal(W.listLabel("БП", "extend", "free"), "БП, вторая неделя");
  assert.equal(W.countsInBpList({ sheet: "БП", status: "БП" }), true);
  assert.equal(W.countsInBpList({ sheet: "БП", bpOutcome: "refuse" }), false);
  assert.equal(W.countsInBpList({ sheet: "ПП", status: "БП1" }), false);
  var card = W.newCardFields("cost");
  assert.equal(card.sheet, "БП");
  assert.equal(card.status, "БП");
  assert.equal(card.bpWeeks, "1");
  assert.equal(card.bpKind, "cost");
  assert.equal(card.skipPpRemind, true);
  assert.equal(card.surveyKind, "final");
});

test("тег недели, вида и исхода", () => {
  var stamped = W.stampWishes("любит лёгкое", { bpWeeks: 1, bpKind: "free" });
  assert.match(stamped, /\[BPW:1\]/);
  assert.match(stamped, /\[BPKIND:free\]/);
  assert.equal(W.parseWishes(stamped).bpWeeks, 1);
  assert.equal(W.parseWishes(stamped).bpKind, "free");
  var ext = W.stampWishes(stamped, { bpOutcome: "extend", bpWeeks: 2 });
  assert.match(ext, /\[BPOUT:extend\]/);
  assert.match(ext, /\[BPW:2\]/);
  assert.equal(W.statusLabel(2, "extend"), "вторая неделя");
  assert.equal(W.statusLabel(1, "pp"), "перешёл в ПП");
  assert.equal(W.statusLabel(1, "done"), "завершён");
  assert.equal(W.statusLabel(1, "refuse"), "отказ");
  assert.equal(W.strip(ext).indexOf("BPW"), -1);
});

test("цена продления и remindBody больше не создаёт задачу ПП", () => {
  var one = { S: 4.5, G: 200, P: 0 };
  var cost = F.formulaParts_(Object.assign({ N: 1 }, one)).cost;
  assert.equal(W.extendPrice(one, null, F.formulaParts_), Math.round(cost * 2 * 100) / 100);
  assert.equal(W.remindBody("Марго", "100"), null);
  var src = fs.readFileSync(path.join(here, "bp-weeks.js"), "utf8");
  assert.match(src, /BPKIND/);
  assert.match(src, /function remindBody/);
  assert.match(src, /return null/);
});

test("UI: вторая неделя, без Отметить контакт / Сохранить отв.", () => {
  var clients = fs.readFileSync(path.join(here, "clients.js"), "utf8");
  assert.match(clients, /cl-bp-week2/);
  assert.match(clients, /Вторая неделя/);
  assert.match(clients, /skipPpRemind/);
  assert.equal(clients.indexOf(">Отметить контакт<"), -1);
  assert.equal(clients.indexOf(">Сохранить отв.<"), -1);
  assert.match(clients, /cl-bp-done/);
  assert.match(clients, /ensureBpFromOrder/);
  assert.match(clients, /cl-sv-choice/);
  assert.match(clients, /applyBpSurveyChoice/);
  assert.match(clients, /archiveBucket/);
});

test("архив: 7д → Завершённые, 14д → отказ", () => {
  var now = Date.parse("2026-11-13T12:00:00Z");
  var recent = {
    sheet: "БП",
    bpOutcome: "done",
    bpDoneAt: new Date(now - 3 * 86400000).toISOString()
  };
  var archived = {
    sheet: "БП",
    bpOutcome: "done",
    bpDoneAt: new Date(now - 8 * 86400000).toISOString()
  };
  var refuseReady = {
    sheet: "БП",
    bpOutcome: "done",
    bpDoneAt: new Date(now - 15 * 86400000).toISOString()
  };
  assert.equal(W.archiveBucket(recent, now), "active");
  assert.equal(W.archiveBucket(archived, now), "done");
  assert.equal(W.shouldAutoRefuse(refuseReady, now), true);
  assert.equal(W.shouldAutoRefuse(archived, now), false);
  assert.deepEqual(W.surveyChoices("week1").map(function (c) { return c.id; }), ["pp", "week2", "refuse"]);
  assert.deepEqual(W.surveyChoices("week2").map(function (c) { return c.id; }), ["pp", "refuse"]);
});

test("карточка БП пишется в D1 на обоих путях", () => {
  var worker = fs.readFileSync(path.join(here, "../proxy/worker.js"), "utf8");
  assert.match(worker, /function rememberBpCardFromOrder_/);
  assert.match(worker, /ensureBpFromOrder/);
  assert.match(worker, /sheet: "БП"/);
  assert.match(worker, /bpToPpConversions/);
  assert.match(worker, /normalizeHeartWholeBasketD1_/);
  assert.match(worker, /stageNBpLifecycle_/);
  assert.match(worker, /applyBpSurveyChoiceD1_/);
  assert.match(worker, /svchoice:/);
});
