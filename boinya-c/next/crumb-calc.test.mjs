import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const engine = require("./order-engine.js");
const price = require("./price-logic.js");
const mix = require("./crumb-mix.js");
const ordersSrc = fs.readFileSync(path.join(here, "orders.js"), "utf8");
const clientsSrc = fs.readFileSync(path.join(here, "clients.js"), "utf8");

const sandbox = {
  document: {},
  addEventListener: function () {}
};
sandbox.window = sandbox;
sandbox.BoinyaOrderEngine = engine;
sandbox.BoinyaShell = { esc: function (s) { return String(s == null ? "" : s); } };
vm.runInNewContext(ordersSrc, sandbox, { filename: "orders.js" });
const api = sandbox.BoinyaOrders;

test("пул крошки содержит рубец и не содержит жевалки", () => {
  const pool = engine.crumbSourcePool_("meat").map(function (p) { return p.name; });
  assert.ok(pool.some(function (n) { return /РУБ/.test(n); }), pool.join(","));
  assert.ok(pool.indexOf("РУБЕЦ Т") >= 0);
  assert.equal(pool.some(function (n) { return engine.isChewProductName_(n); }), false);
  assert.equal(engine.catalogItemsForUi_("crumb").length, 0);
});

test("крошка рубца 100 г и микс попадают в состав и в текст", () => {
  const one = api.crumbItemFromDraft({ kind: "meat", sources: ["РУБЕЦ Т"], grams: [], qty: 100 });
  assert.equal(one.ok, true);
  assert.equal(one.item.cat, "crumb");
  assert.equal(one.item.sources[0].name, "РУБЕЦ Т");
  assert.equal(one.item.value, 100);
  assert.match(mix.plainLabel(one.item), /Крошка рубца — 100 г/);
  const msg = price.composeRetailClientMessage([one.item], 17, "");
  assert.match(msg, /Крошка рубца — 100 г/);
  assert.doesNotMatch(msg, /Доставка/);
  const quote = engine.calcRetailBasketTotal([one.item], { deliveriesN: 1 });
  assert.equal(quote.goods, 17);

  const draft = { kind: "meat", sources: ["ЛЁГКОЕ", "РУБЕЦ Т"], grams: ["60", "40"], qty: 100 };
  draft.qty = Math.max(10, api.gramStep_(draft.qty, -1));
  assert.deepEqual(draft.sources, ["ЛЁГКОЕ", "РУБЕЦ Т"]);
  const two = api.crumbItemFromDraft(draft);
  assert.equal(two.ok, true);
  assert.equal(two.item.value, 100);
  assert.match(mix.plainLabel(two.item), /Крошка микс — 100 г/);
  assert.match(mix.plainLabel(two.item), /лёгкое — 60 г/i);
  assert.match(mix.plainLabel(two.item), /рубец т — 40 г/i);

  const chew = api.crumbItemFromDraft({ kind: "meat", sources: ["ТРАХЕЯ"], qty: 100 });
  assert.equal(chew.ok, false);
  assert.match(chew.message, /Жевалки/);
});

test("расчёт зовёт конструктор крошки, а не пустой каталог", () => {
  assert.match(clientsSrc, /if \(cat === "crumb"\)/);
  assert.match(clientsSrc, /crumbBuilderHtml\(crumbDraft/);
  assert.match(clientsSrc, /crumbItemFromDraft\(crumbDraft\)/);
  assert.doesNotMatch(clientsSrc, /catalogItemsForUi_\("crumb"\)/);
  assert.match(ordersSrc, /function crumbHtml\(\) \{\s*return crumbBuilderHtml\(picker\);/);
  const html = api.crumbBuilderHtml(
    { kind: "meat", sources: ["РУБЕЦ Т"], grams: [], qty: 100 },
    { kind: "cl-ckind", src: "cl-csrc", add: "cl-csrc-add", del: "cl-csrc-del", gram: "cl-cgram", qty: "cl-cqty" }
  );
  assert.match(html, /Рубец Т/);
  assert.match(html, /data-act="cl-cqty"/);
  assert.doesNotMatch(html, /Пусто/);
});
