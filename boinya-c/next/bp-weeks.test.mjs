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
});

test("тег 1 недели и исход", () => {
  var stamped = W.stampWishes("любит лёгкое", { bpWeeks: 1 });
  assert.match(stamped, /\[BPW:1\]/);
  assert.equal(W.parseWishes(stamped).bpWeeks, 1);
  assert.equal(W.statusLabel(1, ""), "1 нед");
  var ext = W.stampWishes(stamped, { bpOutcome: "extend" });
  assert.match(ext, /\[BPOUT:extend\]/);
  assert.equal(W.statusLabel(1, "extend"), "продлён");
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
  assert.equal(body.title, "Предложить продление или переход на ПП: Марго");
  assert.equal(body.id, W.remindId("Марго"));
  var payload = JSON.parse(body.payload);
  assert.equal(payload.remindSilent, true);
  assert.equal(payload.remindSent, true);
  var src = fs.readFileSync(path.join(here, "bp-weeks.js"), "utf8");
  assert.equal(src.indexOf("себестоимость"), -1);
  assert.equal(src.indexOf("·"), -1);
});

test("заказ и карточка показывают тумблер и действия", () => {
  var orders = fs.readFileSync(path.join(here, "orders.js"), "utf8");
  var clients = fs.readFileSync(path.join(here, "clients.js"), "utf8");
  assert.match(orders, /1 неделя/);
  assert.match(orders, /2 недели/);
  assert.match(clients, /Цена за продление/);
  assert.match(clients, /cl-bp-extend/);
  assert.match(clients, /cl-bp-done/);
  assert.match(clients, /cl-bpw/);
});

test("Code.gs хранит bp weeks и не шлёт telegram на это напоминание", () => {
  var gs = fs.readFileSync(path.join(here, "../../Code.gs"), "utf8");
  assert.match(gs, /\[BPW:/);
  assert.match(gs, /function queueBpOneWeekRemind_/);
  assert.match(gs, /remindSilent/);
  var fn = gs.split("function queueBpOneWeekRemind_")[1].split("\nfunction ")[0];
  assert.equal(fn.indexOf("telegramSendText_"), -1);
  assert.match(gs, /payload\.remindSilent/);
  assert.match(gs, /oneWeek:/);
});
