import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shell = fs.readFileSync(path.join(here, "shell.js"), "utf8");
const clients = fs.readFileSync(path.join(here, "clients.js"), "utf8");

function sliceFn(src, name) {
  const start = src.indexOf("function " + name);
  if (start < 0) throw new Error("missing " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}

const revealDelta_ = new Function(
  sliceFn(shell, "revealDelta_") + "\nreturn revealDelta_;"
)();

test("поле над клавиатурой не уезжает под шапку", () => {
  assert.equal(revealDelta_(40, 84, 20, 400), 0);
  assert.equal(revealDelta_(360, 404, 20, 400), 16);
  assert.equal(revealDelta_(-40, 4, 80, 400) < 0, true);
  const back = revealDelta_(-40, 4, 80, 400);
  assert.equal(-40 - back >= 80 + 12 - 1, true);
});

test("шторка не добавляет высоту клавиатуры внутрь листа", () => {
  const lift = sliceFn(shell, "liftField");
  assert.match(lift, /inSheet/);
  assert.match(lift, /revealField/);
  assert.equal(lift.includes("scrollIntoView"), false);
});

test("удаление клиента сразу закрывает карточку и снимает его со списка", () => {
  const del = sliceFn(clients, "delCard");
  const paintAt = del.indexOf("paint()");
  const reloadAt = del.indexOf("loadSubs(true)");
  assert.ok(paintAt > 0 && reloadAt > paintAt);
  assert.match(del, /cardOpenGen\+\+/);
  assert.match(del, /view = "list"/);
  assert.match(del, /dropSub_\(card\)/);
  assert.match(clients, /if \(gen !== cardOpenGen\) return/);
  assert.match(clients, /withoutDropped_/);
});
