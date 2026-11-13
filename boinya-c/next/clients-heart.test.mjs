import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ui = fs.readFileSync(path.resolve(here, "clients.js"), "utf8");
const sandbox = {
  window: {},
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }
};
vm.runInNewContext(ui, sandbox);
const C = sandbox.window.BoinyaClients;

test("normalizeHeartWhole_: только сердце, жевалки не трогаем", () => {
  const list = [
    { cat: "dressura", main: "СЕРДЦЕ", sub: "Целое", val: 30 },
    { cat: "chew", main: "УХО Г", sub: "Целое", val: 1 },
    { cat: "dressura", main: "СЕРДЦЕ", sub: "Ломтики", val: 10 }
  ];
  assert.equal(C.normalizeHeartWhole_(list), true);
  assert.equal(list[0].sub, "Ломтики");
  assert.equal(list[1].sub, "Целое");
  assert.equal(list[2].sub, "Ломтики");
});
