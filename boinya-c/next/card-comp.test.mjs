import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientsSrc = fs.readFileSync(path.resolve(here, "clients.js"), "utf8");
const ordersSrc = fs.readFileSync(path.resolve(here, "orders.js"), "utf8");

function boot(card) {
  const paints = [];
  const basket = (card.basket || []).map(function (it) { return Object.assign({}, it); });
  const basket2 = (card.basket2 || []).map(function (it) { return Object.assign({}, it); });
  const sandbox = {
    window: {},
    document: {
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      activeElement: null
    }
  };
  sandbox.window.document = sandbox.document;
  sandbox.window.BoinyaShell = {
    esc: function (s) { return String(s == null ? "" : s); },
    main: function (html) { paints.push(String(html)); },
    dock: function () {},
    toast: function () {},
    hideToast: function () {},
    resetScroll: function () {},
    scrollTop: function () { return 0; },
    restoreScrollTo: function () {},
    skeleton: function () { return ""; },
    errorBox: function () { return ""; }
  };
  sandbox.window.BoinyaApi = {
    apiGet: function (params) {
      const action = String((params && params.action) || "");
      if (action === "getSubscription") {
        return Promise.resolve(Object.assign({}, card, { status: "success", found: true, basket: basket, basket2: basket2 }));
      }
      if (action === "listAccess") return Promise.resolve({ status: "success", people: [] });
      return Promise.resolve({ status: "success" });
    }
  };
  sandbox.window.BoinyaOrderEngine = {
    mapApiBasketToLocal: function (list) { return list || []; },
    unitForItem: function (cat) { return cat === "chew" ? "шт" : "гр"; },
    prettyProductName: function (name) { return String(name || ""); },
    catalogItemsForUi_: function () { return []; },
    catalogFractionsForUi_: function () { return []; }
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(here, "access.js"), "utf8"), sandbox, { filename: "access.js" });
  sandbox.window.BoinyaPrice = {
    parsePpSchemeFromWishes_: function () { return ""; },
    parsePpCoefFromWishes_: function () { return ""; },
    stripPpMetaFromWishes_: function (s) { return s || ""; }
  };
  sandbox.window.BoinyaOrders = {
    gramQtyHtml: function (act, value, unit) {
      return '<div class="b-step" data-act="' + act + '">' + value + " " + unit + "</div>";
    },
    parseGramText_: function (v) {
      const n = Number(v);
      return n >= 1 ? { n: n } : { empty: true };
    }
  };
  vm.runInNewContext(clientsSrc, sandbox, { filename: "clients.js" });
  return { C: sandbox.window.BoinyaClients, paints: paints, basket: basket, basket2: basket2 };
}

function node(attrs) {
  return {
    getAttribute: function (k) { return attrs[k] || ""; }
  };
}

test("в карточке весовая строка текстом, граммы на месте", async () => {
  const ctx = boot({
    nick: "morg",
    label: "Морж",
    subId: "1",
    sheet: "ПП",
    deliveries: "2",
    basket: [
      { cat: "dressura", main: "Лёгкое", sub: "Среднее", val: 400, value: 400 },
      { cat: "chew", main: "Ухо Г", sub: "Обычное", val: 4, value: 4 }
    ],
    basket2: [
      { cat: "dressura", main: "Рубец Т", sub: "Крупное", val: 200, value: 200 }
    ]
  });
  const ok = ctx.C.onAct("cl-open", node({ "data-nick": "morg", "data-sub": "1", "data-sheet": "ПП" }));
  assert.equal(ok, true);
  await new Promise(function (r) { setImmediate(r); });
  const html = ctx.paints[ctx.paints.length - 1];
  assert.ok(html.includes("Лёгкое · Среднее · 400 гр"));
  assert.ok(html.includes("Ухо Г · Обычное · 4 шт"));
  assert.equal(html.includes("b-step"), false);
  assert.equal(html.includes("cl-gqty"), false);
  assert.equal((html.match(/cl-del-line/g) || []).length, 2);
  assert.equal(ctx.basket[0].val, 400);
  assert.equal(ctx.basket[0].value, 400);
  assert.equal(ctx.basket[1].val, 4);
  ctx.C.onAct("cl-slot", node({ "data-n": "2" }));
  const slot2 = ctx.paints[ctx.paints.length - 1];
  assert.ok(slot2.includes("Рубец Т · Крупное · 200 гр"));
  assert.equal(slot2.includes("b-step"), false);
  assert.equal(slot2.includes("Лёгкое"), false);
  assert.equal(ctx.basket2[0].value, 200);
});

test("карточка БП тот же список без степпера", async () => {
  const ctx = boot({
    nick: "luna",
    label: "Луна",
    subId: "2",
    sheet: "БП",
    deliveries: "1",
    basket: [
      { cat: "dressura", main: "Сердце", sub: "Целое", val: 60, value: 60 }
    ]
  });
  ctx.C.onAct("cl-open", node({ "data-nick": "luna", "data-sub": "2", "data-sheet": "БП" }));
  await new Promise(function (r) { setImmediate(r); });
  const html = ctx.paints[ctx.paints.length - 1];
  assert.ok(html.includes("Сердце · Целое · 60 гр"));
  assert.equal(html.includes("b-step"), false);
  assert.equal(ctx.basket[0].value, 60);
});

test("добавление позиции и заказ не теряют ввод граммов", () => {
  assert.match(clientsSrc, /view === "card" \? "" : lineGramHtml_/);
  assert.match(clientsSrc, /text: pieceAsk \? "Штуки" : "Граммы"/);
  assert.match(clientsSrc, /data-act="cl-add"/);
  assert.match(ordersSrc, /gramQtyHtml\("step"/);
  const row = ordersSrc.slice(ordersSrc.indexOf("function basketRow"), ordersSrc.indexOf("function basketLines"));
  assert.match(row, /gramQtyHtml\("step"/);
});
