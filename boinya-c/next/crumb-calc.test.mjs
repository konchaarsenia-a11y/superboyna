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
const scheme = require("./crumb-scheme.js");
scheme.install(engine);
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
  const one = api.crumbItemFromDraft({ kind: "dress", sources: ["РУБЕЦ Т"], grams: [], qty: 100 });
  assert.equal(one.ok, true);
  assert.equal(one.item.cat, "crumb");
  assert.equal(one.item.crumbKind, "mix4:dress");
  assert.equal(one.item.sources[0].name, "РУБЕЦ Т");
  assert.equal(one.item.value, 100);
  assert.match(mix.plainLabel(one.item), /Мясные \(дрессура\) — 100 г/);
  assert.match(mix.plainLabel(one.item), /рубец т — 100 г/i);
  const msg = price.composeRetailClientMessage([one.item], 19, "");
  assert.match(msg, /Мясные \(дрессура\) — 100 г/);
  assert.doesNotMatch(msg, /Доставка/);
  const quote = engine.calcRetailBasketTotal([one.item], { deliveriesN: 1, applyDelivery: false });
  assert.equal(quote.goods, 19);

  const draft = { kind: "dress", sources: ["ЛЁГКОЕ", "РУБЕЦ Т"], grams: ["60", "40"], qty: 100 };
  draft.qty = Math.max(5, api.gramStep_(draft.qty, -1));
  assert.equal(draft.qty, 95);
  assert.deepEqual(draft.sources, ["ЛЁГКОЕ", "РУБЕЦ Т"]);
  const two = api.crumbItemFromDraft(draft);
  assert.equal(two.ok, true);
  assert.equal(two.item.value, 100);
  assert.equal(two.item.crumbKind, "mix4:dress");
  assert.match(mix.plainLabel(two.item), /Мясные \(дрессура\) — 100 г/);
  assert.match(mix.plainLabel(two.item), /лёгкое — 60 г/i);
  assert.match(mix.plainLabel(two.item), /рубец т — 40 г/i);
  const veg = api.crumbItemFromDraft({ kind: "veg", sources: ["ЯБЛОКИ"], grams: [], qty: 50 });
  assert.equal(veg.ok, true);
  assert.equal(veg.item.crumbKind, "mix4:veg");
  assert.equal(engine.calcRetailBasketTotal([veg.item], { applyDelivery: false }).goods, 8.5);
  const hypo = api.crumbItemFromDraft({ kind: "hypo", sources: ["ИНДЕЙКА"], grams: [], qty: 20 });
  assert.equal(hypo.ok, true);
  assert.equal(hypo.item.crumbKind, "mix4:hypo");
  assert.equal(engine.calcRetailBasketTotal([hypo.item], { applyDelivery: false }).goods, 4.4);
  const oldMix = {
    cat: "crumb",
    crumbKind: "mix3:mix",
    name: "крошка",
    main: "крошка",
    value: 100,
    sources: [{ name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", cat: "dressura" }],
    ratio: [100]
  };
  assert.match(mix.plainLabel(oldMix), /Микс — 100 г/);
  assert.equal(engine.calcRetailBasketTotal([oldMix], { applyDelivery: false }).goods, 15);

  const chew = api.crumbItemFromDraft({ kind: "mix", sources: ["ТРАХЕЯ"], qty: 100 });
  assert.equal(chew.ok, false);
  assert.match(chew.message, /Жевалки/);

  const legacy = {
    cat: "crumb",
    crumbKind: "meat",
    name: "крошка",
    main: "крошка",
    sub: "РУБЕЦ Т",
    value: 100,
    sources: [{ name: "РУБЕЦ Т", main: "РУБЕЦ Т", cat: "dressura" }],
    ratio: [100]
  };
  assert.match(mix.plainLabel(legacy), /Крошка рубца — 100 г/);
  assert.equal(engine.calcRetailBasketTotal([legacy], { applyDelivery: false }).goods, 12);
});

test("расчёт зовёт конструктор крошки, а не пустой каталог", () => {
  assert.match(clientsSrc, /if \(cat === "crumb"\)/);
  assert.match(clientsSrc, /crumbBuilderHtml\(crumbDraft/);
  assert.match(clientsSrc, /crumbItemFromDraft\(crumbDraft\)/);
  assert.doesNotMatch(clientsSrc, /catalogItemsForUi_\("crumb"\)/);
  assert.match(ordersSrc, /function crumbHtml\(\) \{\s*return crumbBuilderHtml\(picker\);/);
  const html = api.crumbBuilderHtml(
    { kind: "mix", sources: ["РУБЕЦ Т"], grams: [], qty: 100 },
    { kind: "cl-ckind", src: "cl-csrc", add: "cl-csrc-add", del: "cl-csrc-del", gram: "cl-cgram", qty: "cl-cqty" }
  );
  assert.match(html, /Мясные \(дрессура\)/);
  assert.match(html, /Овощи\/фрукты/);
  assert.match(html, /Гипоаллергенные/);
  assert.match(html, /Рубец Т/);
  assert.match(html, /19 BYN за 100 г, строго по весу/);
  assert.match(html, /data-act="cl-cqty-in"/);
  assert.doesNotMatch(html, /Микс мясной/);
  assert.doesNotMatch(html, /Пусто/);
  assert.match(html, /Печень/);
  assert.doesNotMatch(html, /Яблоки/);
  assert.doesNotMatch(html, /Индейка/);
  const vegHtml = api.crumbBuilderHtml({ kind: "veg", sources: [], grams: [], qty: 100 });
  assert.match(vegHtml, /Яблоки/);
  assert.match(vegHtml, /17 BYN за 100 г/);
  assert.doesNotMatch(vegHtml, /Рубец Т/);
  const hypoHtml = api.crumbBuilderHtml({ kind: "hypo", sources: [], grams: [], qty: 100 });
  assert.match(hypoHtml, /Индейка/);
  assert.match(hypoHtml, /22 BYN за 100 г/);
  assert.doesNotMatch(hypoHtml, /Рубец Т/);
  assert.doesNotMatch(hypoHtml, /Яблоки/);
});
