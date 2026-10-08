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

test("без тега срок 2 недели", () => {
  assert.equal(W.weeksOf(undefined), 2);
  assert.equal(W.weeksOf(""), 2);
  assert.equal(W.weeksOf(2), 2);
  assert.equal(W.weeksOf("2"), 2);
  assert.equal(W.weeksOf(3), 2);
  assert.equal(W.weeksOf(1), 1);
  assert.equal(W.parseWishes("просто текст").bpWeeks, 2);
  assert.equal(W.parseWishes("просто текст").bpWeeksSet, false);
  assert.equal(W.statusLabel(2, ""), "");
  assert.equal(W.statusLabel(undefined, ""), "");
  assert.equal(W.statusLabel(1, ""), "");
  assert.equal(W.listLabel("БП2", ""), "БП");
  assert.equal(W.listLabel("БП1", "pp"), "БП, перешёл в ПП");
  assert.equal(W.countsInBpList({ sheet: "БП", status: "БП2" }), true);
  assert.equal(W.countsInBpList({ sheet: "BP", status: "ФИНАЛ" }), true);
  assert.equal(W.countsInBpList({ sheet: "ПП", status: "БП1" }), false);
  var card = W.newCardFields();
  assert.equal(card.sheet, "БП");
  assert.equal(card.status, "БП1");
  assert.equal(card.bpWeeks, "1");
  assert.equal(card.surveyKind, "final");
});

test("тег 1 недели и исход", () => {
  var stamped = W.stampWishes("любит лёгкое", { bpWeeks: 1 });
  assert.match(stamped, /\[BPW:1\]/);
  assert.equal(W.parseWishes(stamped).bpWeeks, 1);
  var ext = W.stampWishes(stamped, { bpOutcome: "extend" });
  assert.match(ext, /\[BPOUT:extend\]/);
  assert.equal(W.statusLabel(1, "extend"), "");
  assert.equal(W.statusLabel(1, "pp"), "перешёл в ПП");
  assert.equal(W.statusLabel(1, "done"), "завершён");
  assert.equal(W.strip(ext).indexOf("BPW"), -1);
  assert.match(W.stampWishes("текст", { bpWeeks: 2 }), /\[BPW:2\]/);
});

test("цена за продление это две недели по формуле, подпись без запретного слова", () => {
  var one = { S: 4.5, G: 200, P: 0 };
  var cost = F.formulaParts_(Object.assign({ N: 1 }, one)).cost;
  assert.equal(W.extendPrice(one, null, F.formulaParts_), Math.round(cost * 2 * 100) / 100);
  var other = { S: 3.82, G: 0, P: 2 };
  var a = F.formulaParts_(Object.assign({ N: 1 }, one)).cost;
  var b = F.formulaParts_(Object.assign({ N: 1 }, other)).cost;
  assert.equal(W.extendPrice(one, other, F.formulaParts_), Math.round((a + b) * 100) / 100);
  var body = W.remindBody("Марго", "100");
  assert.equal(body.silent, "1");
  assert.equal(body.mode, "remind");
  assert.equal(body.title, "Предложить переход на ПП: Марго");
  assert.equal(body.id, W.remindId("Марго"));
  var payload = JSON.parse(body.payload);
  assert.equal(payload.remindSilent, true);
  assert.equal(payload.remindSent, true);
  var src = fs.readFileSync(path.join(here, "bp-weeks.js"), "utf8");
  assert.equal(src.indexOf("себестоимость"), -1);
  assert.equal(src.indexOf("·"), -1);
});

test("заказ и карточка без второй недели БП", () => {
  var orders = fs.readFileSync(path.join(here, "orders.js"), "utf8");
  var clients = fs.readFileSync(path.join(here, "clients.js"), "utf8");
  var stats = fs.readFileSync(path.join(here, "stats.js"), "utf8");
  assert.equal(orders.indexOf("1 неделя"), -1);
  assert.equal(orders.indexOf("2 недели"), -1);
  assert.equal(orders.indexOf("Вторая доставка"), -1);
  assert.match(orders, /surveyKind: "final"/);
  assert.match(orders, /bpWeeks: "1"/);
  assert.equal(clients.indexOf("Цена за продление"), -1);
  assert.equal(clients.indexOf("cl-bp-extend"), -1);
  assert.equal(clients.indexOf("Состав БП2"), -1);
  assert.equal(clients.indexOf(">БП2<"), -1);
  assert.match(clients, /Клиент БП/);
  assert.match(clients, /cl-bp-done/);
  assert.match(clients, /ensureBpFromOrder/);
  assert.equal(stats.indexOf("1 нед"), -1);
  assert.equal(stats.indexOf("Продлён"), -1);
  assert.match(stats, /Клиенты БП/);
});

test("карточка БП пишется в D1 на обоих путях", () => {
  var worker = fs.readFileSync(path.join(here, "../proxy/worker.js"), "utf8");
  assert.match(worker, /function rememberBpCardFromOrder_/);
  assert.match(worker, /rememberBpCardFromOrder_\(jobParams, env\)/);
  assert.match(worker, /ensureBpFromOrder/);
  assert.match(worker, /sheet: "БП"/);
  var fn = worker.split("async function rememberBpCardFromOrder_")[1].split("\nasync function ")[0];
  assert.match(fn, /bpWeeks/);
  assert.match(fn, /surveyKind/);
  assert.equal(fn.indexOf("delete "), -1);
});

test("Code.gs хранит bp weeks и не шлёт telegram на это напоминание", () => {
  var gs = fs.readFileSync(path.join(here, "../../Code.gs"), "utf8");
  assert.match(gs, /\[BPW:/);
  assert.match(gs, /function queueBpOneWeekRemind_/);
  assert.match(gs, /remindSilent/);
  var fn = gs.split("function queueBpOneWeekRemind_")[1].split("\nfunction ")[0];
  assert.equal(fn.indexOf("telegramSendText_"), -1);
  assert.match(fn, /Предложить переход на ПП/);
  assert.equal(fn.indexOf("Предложить продление"), -1);
  assert.match(gs, /payload\.remindSilent/);
  assert.match(gs, /oneWeek:/);
});
