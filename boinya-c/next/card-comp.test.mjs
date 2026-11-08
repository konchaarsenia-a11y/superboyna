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
  const posts = [];
  const fields = {};
  const basket = (card.basket || []).map(function (it) { return Object.assign({}, it); });
  const basket2 = (card.basket2 || []).map(function (it) { return Object.assign({}, it); });
  const basketBp2 = (card.basketBp2 || []).map(function (it) { return Object.assign({}, it); });
  function calcPriceOk() {
    return {
      status: "success",
      mode: "pp",
      scheme: "RAW26",
      cost: 40,
      rawCost: 40,
      factCost: 120,
      lines: []
    };
  }
  const sandbox = {
    window: {},
    clearTimeout: clearTimeout,
    setTimeout: setTimeout,
    document: {
      getElementById: function (id) {
        if (!id) return null;
        if (!fields[id]) fields[id] = { id: id, value: "" };
        return fields[id];
      },
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
        return Promise.resolve(Object.assign({}, card, {
          status: "success",
          found: true,
          basket: basket,
          basket2: basket2,
          basketBp2: card.basketBp2 === undefined ? undefined : basketBp2
        }));
      }
      if (action === "calcPrice") return Promise.resolve(calcPriceOk());
      if (action === "listAccess") return Promise.resolve({ status: "success", people: [] });
      return Promise.resolve({ status: "success" });
    },
    apiPost: function (body) {
      posts.push(JSON.parse(JSON.stringify(body)));
      if (body && body.action === "calcPrice") return Promise.resolve(calcPriceOk());
      return Promise.resolve({ status: "success" });
    }
  };
  sandbox.window.BoinyaOrderEngine = {
    mapApiBasketToLocal: function (list) { return list || []; },
    serializeBasketItem_: function (it) { return it || {}; },
    unitForItem: function (cat) { return cat === "chew" ? "шт" : "гр"; },
    prettyProductName: function (name) { return String(name || ""); },
    catalogItemsForUi_: function () { return []; },
    catalogFractionsForUi_: function () { return []; },
    /* t454u stubs: keep existing slots; no throw in openCard paint path */
    parsePpManualDist_: function (raw) {
      return raw === true || raw === 1 || raw === "1";
    },
    inferPpManualDistribution_: function (opts) {
      opts = opts || {};
      if (opts.ppManualDist === true || opts.ppManualDist === "1" || opts.ppManualDist === 1) return true;
      var b2 = opts.basket2 || [];
      for (var i = 0; i < b2.length; i++) {
        if ((Number(b2[i].value != null ? b2[i].value : b2[i].val) || 0) > 0) return true;
      }
      return false;
    },
    materializePpAutoSplit_: function (opts) {
      opts = opts || {};
      return {
        ok: true,
        skipped: true,
        reason: "test-stub",
        delivery1: (opts.basket || []).slice(),
        delivery2: (opts.basket2 || []).slice(),
        ppManualDist: false
      };
    }
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(here, "access.js"), "utf8"), sandbox, { filename: "access.js" });
  sandbox.window.BoinyaPrice = {
    parsePpSchemeFromWishes_: function () { return card.scheme || "RAW26"; },
    parsePpCoefFromWishes_: function () {
      var c = card.coef != null ? Number(card.coef) : NaN;
      return isFinite(c) && c > 0 ? String(c) : null;
    },
    stripPpMetaFromWishes_: function (s) { return s || ""; },
    recoverBynFromBasketLocal_: function () { return 13.2; },
    packagesBynFromUCountsLocal_: function () { return 0; },
    calcDressuraFractionMarkup: function () { return { total: 0 }; },
    recalcPpCostSum: function (res) { return Number(res && res.cost) || 0; },
    quotePp: function (opts) {
      var cost = Number(opts.costSum) || 0;
      var coef = Number(opts.coef) || 2.6;
      var n = Number(opts.deliveriesN) || 1;
      var total = Math.round((cost * coef + 13.2 + 7.6 * n) * 100) / 100;
      return { total: total, fact: { rawCost: cost, factCost: total, retailCapped: false } };
    }
  };
  sandbox.window.BoinyaOrderEngine.calcRetailBasketTotal = function () {
    return { goods: 200, total: 200 };
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
  return {
    C: sandbox.window.BoinyaClients,
    paints: paints,
    posts: posts,
    fields: fields,
    basket: basket,
    basket2: basket2,
    basketBp2: basketBp2
  };
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

test("карточка БП не показывает второй состав и не затирает его при сохранении", async () => {
  const oldSecond = { cat: "dressura", main: "Почки", sub: "Мелкое", val: 30, value: 30 };
  const ctx = boot({
    nick: "luna",
    label: "Луна",
    subId: "2",
    sheet: "БП",
    deliveries: "1",
    ppStatus: "ОПРОС",
    basketBp1: [
      { cat: "dressura", main: "Сердце", sub: "Целое", val: 60, value: 60 }
    ],
    basketBp2: [oldSecond]
  });
  ctx.C.onAct("cl-open", node({ "data-nick": "luna", "data-sub": "2", "data-sheet": "БП" }));
  await new Promise(function (r) { setImmediate(r); });
  const html = ctx.paints[ctx.paints.length - 1];
  assert.ok(html.includes("Сердце · Целое · 60 гр"));
  assert.equal(html.includes("Почки"), false);
  assert.equal(html.includes("Ещё состав"), false);
  assert.equal(html.includes("БП2"), false);
  assert.match(html, /Статус<\/p><p class="b-note">БП<\/p>/);
  ctx.C.onAct("cl-del-line", node({ "data-i": "0" }));
  ctx.C.onAct("cl-save", node({}));
  await new Promise(function (r) { setImmediate(r); });
  assert.equal(ctx.posts.length, 1);
  const body = ctx.posts[0];
  assert.equal(body.basket.length, 0);
  assert.equal(body.basketBp2.length, 1);
  assert.equal(body.basketBp2[0].main, "Почки");
  assert.equal(body.basketBp2[0].value, 30);
  assert.equal(ctx.basketBp2[0].value, 30);
});

test("пустой второй состав не уходит в сохранение пустым массивом", async () => {
  const ctx = boot({
    nick: "rex",
    label: "Рекс",
    subId: "3",
    sheet: "БП",
    deliveries: "1",
    ppStatus: "БП1",
    basketBp1: [{ cat: "dressura", main: "Сердце", sub: "Целое", val: 60, value: 60 }]
  });
  ctx.C.onAct("cl-open", node({ "data-nick": "rex", "data-sub": "3", "data-sheet": "БП" }));
  await new Promise(function (r) { setImmediate(r); });
  ctx.C.onAct("cl-save", node({}));
  await new Promise(function (r) { setImmediate(r); });
  assert.equal(ctx.posts.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(ctx.posts[0], "basketBp2"), false);
});

test("coef на основной карточке ПП сразу меняет указанную", async () => {
  const ctx = boot({
    nick: "zzz_test",
    label: "zzz_test",
    subId: "s1",
    sheet: "ПП",
    deliveries: "2",
    statedCost: "145",
    calcFactCost: "145",
    scheme: "RAW26",
    coef: "2.6",
    wishes: "[COEF:2.6] [SCHEME:RAW26]",
    basket: [{ cat: "dressura", main: "Лёгкое", sub: "Среднее", val: 400, value: 400 }]
  });
  ctx.C.onAct("cl-open", node({ "data-nick": "zzz_test", "data-sub": "s1", "data-sheet": "ПП" }));
  await new Promise(function (r) { setImmediate(r); });
  const before = ctx.paints[ctx.paints.length - 1];
  assert.match(before, /data-act="cl-coef"/);
  assert.match(before, /id="cxCoef"/);
  assert.match(before, /id="cxStated"[^>]*value="145"/);
  assert.equal(before.includes("Глубокий редактор"), true);
  /* Без открытия deep — чип coef на просмотре карточки. */
  assert.equal(before.includes("Пересчитать цену"), false);
  ctx.C.onAct("cl-coef", node({ "data-v": "2.3" }));
  /* h6: без invert — ждём liveCalc; stated обновляет cxStated через paintCardPriceFields_. */
  await new Promise(function (r) { setTimeout(r, 450); });
  const after = ctx.paints[ctx.paints.length - 1];
  assert.match(after, /data-act="cl-coef"[^>]*data-v="2\.3"/);
  const stated = String((ctx.fields.cxStated && ctx.fields.cxStated.value) || "");
  assert.notEqual(stated, "145");
  assert.ok(Number(stated) > 0);
});

test("добавление позиции и заказ не теряют ввод граммов", () => {
  assert.match(clientsSrc, /view === "card" \? "" : lineGramHtml_/);
  assert.match(clientsSrc, /text: pieceAsk \? "Штуки" : "Граммы"/);
  assert.match(clientsSrc, /data-act="cl-add"/);
  assert.match(ordersSrc, /gramQtyHtml\("step"/);
  const row = ordersSrc.slice(ordersSrc.indexOf("function basketRow"), ordersSrc.indexOf("function basketLines"));
  assert.match(row, /gramQtyHtml\("step"/);
  assert.equal(clientsSrc.includes("Ещё состав"), false);
  assert.equal(clientsSrc.includes("bpStageSurveyKind_"), false);
  assert.equal(clientsSrc.includes("normalizeBpStage_"), false);
  assert.equal(ordersSrc.includes("function bpStage"), false);
  const price = fs.readFileSync(path.resolve(here, "price-logic.js"), "utf8");
  assert.equal(price.includes('target: "bp2"'), false);
  assert.equal(price.includes('target === "bp2"'), false);
  const stats = fs.readFileSync(path.resolve(here, "stats-logic.js"), "utf8");
  assert.equal(stats.includes('label: "БП2"'), false);
});
