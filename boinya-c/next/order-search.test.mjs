import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const eng = require("./order-engine.js");
const ordersSrc = fs.readFileSync(path.join(dir, "orders.js"), "utf8");
const appCss = fs.readFileSync(path.join(dir, "app.css"), "utf8");

const sandbox = { console, setTimeout, clearTimeout };
sandbox.window = sandbox;
sandbox.addEventListener = function () {};
vm.createContext(sandbox);
vm.runInContext(ordersSrc, sandbox, { filename: "orders.js" });
const orders = sandbox.BoinyaOrders;

const LUNG_FR = ["Ломтики", "Полоски", "Крупное", "Среднее", "Мелкое", "Очень мелкое"];

test("поиск лёг: префикс Лёгкое выше бараньего, все фракции, ё=е", () => {
  const rows = orders.catalogSearchRows(eng, "лёг").map((r) => ({
    name: String(r.name),
    frac: String(r.frac),
    label: String(r.label),
    rank: Number(r.rank)
  }));
  const lung = rows.filter((r) => r.name === "ЛЁГКОЕ");
  const sheep = rows.filter((r) => r.name === "БАРАНЬЕ ЛЁГКОЕ");
  assert.equal(lung.map((r) => r.frac).join("|"), LUNG_FR.join("|"));
  assert.equal(sheep.map((r) => r.frac).join("|"), LUNG_FR.join("|"));
  assert.ok(rows.findIndex((r) => r.name === "ЛЁГКОЕ") < rows.findIndex((r) => r.name === "БАРАНЬЕ ЛЁГКОЕ"));
  assert.equal(lung.every((r) => r.rank === 0), true);
  assert.equal(sheep.every((r) => r.rank === 1), true);
  assert.equal(lung[0].label, "Лёгкое ломтики");
  assert.match(lung.find((r) => r.frac === "Мелкое").label, /Лёгкое мелкий кубик/);
  rows.forEach((r) => assert.equal(r.label.includes("·"), false));
  assert.equal(orders.rankCatalogName("ЛЕГ", "Лёгкое"), 0);
  assert.equal(orders.rankCatalogName("лёг", "легкое"), 0);
  assert.equal(orders.rankCatalogName("лёг", "Баранье лёгкое"), 1);
  assert.equal(orders.rankCatalogName("куб", "Лёгкое"), -1);
  assert.equal(orders.rankCatalogName("гко", "Лёгкое"), -1);
  assert.equal(orders.catalogSearchRows(eng, "   ").length, 0);
});

test("поиск позиций без задержки и плашка заказа компактная", () => {
  assert.match(ordersSrc, /node\.id === "pq"/);
  assert.match(ordersSrc, /patchPickList\(false\)/);
  assert.doesNotMatch(ordersSrc, /debounce|setTimeout\(\s*function\s*\(\)\s*\{[^}]*picker\.q/);
  assert.match(ordersSrc, /data-act="defer"/);
  assert.match(ordersSrc, /data-act="save"/);
  assert.match(ordersSrc, /id="nxSum"/);
  assert.match(ordersSrc, /pinOrderDock/);
  assert.match(appCss, /#nxDock\.nx-dock--order/);
  assert.match(appCss, /font-size:\s*var\(--b-f12\)/);
  assert.match(appCss, /flex-wrap:\s*nowrap/);
  assert.doesNotMatch(ordersSrc, /Лёгкое ·|позиций ·/);
});
