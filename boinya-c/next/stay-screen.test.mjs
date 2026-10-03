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
const appSrc = fs.readFileSync(path.join(dir, "app.js"), "utf8");
const prodSrc = fs.readFileSync(path.join(dir, "production.js"), "utf8");
const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");

function bootBody() {
  const i = appSrc.indexOf("async function boot(");
  const j = appSrc.indexOf("function start(", i);
  return appSrc.slice(i, j);
}

test("повторный доступ не назначает вкладку заново", () => {
  const boot = bootBody();
  assert.equal(boot.includes("route.tab ="), false);
  assert.match(boot, /settleRoute\(\)/);
  assert.match(boot, /paintSameOrRender\(\)/);
  assert.match(appSrc, /var routeLocked = false/);
  assert.match(appSrc, /if \(!routeLocked\)/);
  assert.match(appSrc, /if \(shownKey && shownKey === routeKey\(\)\) paintChrome\(\)/);
});

test("координаты точки: 53.9, 27.56 и отказ мусора", () => {
  const ok = eng.parseLatLonFromText_("53.9, 27.56");
  assert.equal(ok.lat, 53.9);
  assert.equal(ok.lon, 27.56);
  assert.equal(eng.parseLatLonFromText_("27.56, 53.9").lat, 53.9);
  assert.equal(eng.parseLatLonFromText_("нет"), null);
  assert.equal(eng.parseLatLonFromText_("1, 2"), null);
});

test("курьер: стикер типа, излишек за второй кнопкой, состав без полос", () => {
  assert.match(prodSrc, /function clientTypeLabel/);
  assert.match(prodSrc, /pr-surplus-open/);
  assert.match(prodSrc, /Этаж и квартира/);
  assert.match(prodSrc, /\/\^ПП\/\.test\(slot\)/);
  assert.doesNotMatch(prodSrc, /Этаж и квартира не указаны/);
  const rowStart = prodSrc.indexOf("function paintCutRow");
  const rowEnd = prodSrc.indexOf("function paintCut(", rowStart);
  const row = prodSrc.slice(rowStart, rowEnd);
  assert.doesNotMatch(row, /<span class="b-note">Излишек<\/span>/);
  assert.match(css, /\.nx-pack-grp \{[^}]*text-align: center/s);
  assert.match(css, /\.nx-pack-grp > div \+ div,\s*\.nx-pack-grp > \.mix \{[^}]*border-top: 0/s);
  assert.match(css, /\.nx-type \{/);
});

test("стикер типа клиента: ПП, БП, розница, партнёр", () => {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    clearInterval,
    setInterval,
    document: { getElementById() { return null; }, addEventListener() {} },
    Object,
    Array,
    String,
    Number,
    Math,
    Date,
    JSON,
    isFinite
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(prodSrc, sandbox, { filename: "production.js" });
  const label = sandbox.BoinyaProduction.clientTypeLabel;
  assert.equal(label({ segment: "pp" }), "ПП");
  assert.equal(label({ segment: "bp" }), "БП");
  assert.equal(label({ segment: "retail" }), "розница");
  assert.equal(label({ segment: "partner" }), "партнёр");
  assert.equal(label({ segment: "", ppSlot: "1" }), "ПП");
});
