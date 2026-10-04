import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "shell.js");
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
const sh = sandbox.BoinyaShell;
const D = Date;

test("карточка: 05.10 в 14:30 без точки-разделителя", () => {
  const label = sh.formatRemindWhen(new D(2026, 9, 5, 14, 30, 0, 0));
  assert.equal(label, "05.10 в 14:30");
  assert.equal(label.includes("·"), false);
});

test("быстрые варианты считаются по часам телефона", () => {
  const now = new D(2026, 9, 4, 12, 15, 40, 0);
  assert.equal(sh.remindPresetAt("1h", now).getTime(), now.getTime() + 3600000);
  assert.equal(sh.remindPresetAt("3h", now).getTime(), now.getTime() + 3 * 3600000);
  const tom = sh.remindPresetAt("tomorrow10", now);
  assert.equal(tom.getDate(), 5);
  assert.equal(tom.getHours(), 10);
  assert.equal(tom.getMinutes(), 0);
  const today = sh.remindPresetAt("today", now);
  assert.equal(today.getDate(), 4);
  assert.equal(today.getHours(), 18);
  assert.equal(sh.remindPresetAt("nope", now), null);
});

test("прошедший момент не сохраняется", () => {
  const now = new D(2026, 9, 4, 19, 0, 0, 0);
  assert.equal(sh.remindInPast(new D(2026, 9, 4, 18, 0, 0, 0), now), true);
  assert.equal(sh.remindInPast(now, now), true);
  assert.equal(sh.remindInPast(new D(now.getTime() + 1000), now), false);
  assert.equal(sh.remindInPast(null, now), true);
});
