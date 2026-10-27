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
const context = { BoinyaOrderEngine: engine, console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(here, "ig-labels.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(here, "crumb-scheme.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(here, "price-logic.js"), "utf8"), context);
const api = context.BoinyaOrderEngine;
const price = context.BoinyaPrice;

function row(name, sub, val, cat, extra) {
  return Object.assign({ cat: cat || "dressura", main: name, name: name, sub: sub, val: val, value: val }, extra || {});
}

function lineOf(msg) {
  return msg.split("\n").find((l) => /г|шт/.test(l) && !/Цена|стоимость|достав/.test(l));
}

test("новые тексты называют позиции и фракции как прайс", () => {
  const retail = price.composeRetailClientMessage([
    row("ЛЁГКОЕ", "Крупное", 100),
    row("РУБЕЦ Т", "Среднее", 100),
    row("УХО Г", "Целое", 1, "chew"),
    row("УХО К", "Целое", 1, "chew"),
    row("МЯСНЫЕ ЛОМТИКИ", "Кусочки", 100, "other"),
    row("Крошка", "", 100, "crumb", { crumbKind: "mix4:dress" }),
    row("Крошка", "", 50, "crumb", { crumbKind: "mix4:veg" }),
    row("Крошка", "", 20, "crumb", { crumbKind: "mix4:hypo" })
  ], 21, "");
  assert.match(retail, /Лёгкое - 100 г \(крупный кубик\)/);
  assert.match(retail, /Рубец - 100 г \(кусочки\)/);
  assert.match(retail, /21 рубль/);
  assert.match(retail, /Ушко говяжье - 1 шт \(целое\)/);
  assert.match(retail, /Ушко кролика - 1 шт \(целое\)/);
  assert.match(retail, /Говядина - 100 г \(кусочки\)/);
  assert.match(retail, /Мясные \(дрессура\) — 100 г/);
  assert.match(retail, /Овощи\/фрукты — 50 г/);
  assert.match(retail, /Гипоаллергенные — 20 г/);
  assert.equal(/Крупное|Ухо К|Ухо Г|Рубец Т|Микс мясной/.test(retail), false);

  const pp = price.composePpClientMessage([
    row("ЛЁГКОЕ", "Полоски", 100),
    row("СЕРДЦЕ", "Мелкое", 100),
    row("РУБЕЦ Т", "Очень мелкое", 100)
  ], 2, "", 40, 36, "RAW26", {});
  assert.match(pp, /Лёгкое - 100 г \(палочки\)/);
  assert.match(pp, /Сердце - 100 г \(мелкие кусочки\)/);
  assert.match(pp, /Рубец - 100 г \(очень мелкие кусочки\)/);
  assert.match(pp, /40 рублей/);
  assert.match(pp, /36 рублей за месяц/);
  assert.equal(pp.includes("пакет"), false);

  const oldMix = lineOf(price.composeRetailClientMessage([
    row("Крошка", "", 100, "crumb", { crumbKind: "mix3:meat" })
  ], 20, ""));
  assert.equal(oldMix, "Микс мясной — 100 г");
  const oldTurkey = price.composeRetailClientMessage([
    row("ИНДЕЙКА", "Полоски", 100, "other")
  ], 17, "");
  assert.match(oldTurkey, /Индейка - 100 г \(полоски\)/);
});

test("подбор нового расчёта не пишет внутренние имена", () => {
  const text = price.pricePickOfferText_({ profile: { name: "Бима" } }, "retail", [
    row("ЛЁГКОЕ", "Крупное", 100),
    row("РУБЕЦ Т", "Среднее", 100),
    row("УХО Г", "Обычное", 1, "chew"),
    row("УХО К", "Половинка", 1, "chew"),
    row("Крошка", "мясной", 100, "crumb", { crumbKind: "mix4:dress" })
  ]);
  assert.match(text, /Лёгкое — 100 г \(крупный кубик\)/);
  assert.match(text, /Рубец — 100 г \(кусочки\)/);
  assert.match(text, /Ушко говяжье — 1 шт \(целое\)/);
  assert.match(text, /Ушко кролика — 1 шт \(половинка\)/);
  assert.match(text, /Мясные \(дрессура\) — 100 г/);
  assert.equal(/Крупное|Ухо К|Ухо Г|Рубец Т|Микс мясной/.test(text), false);
});

test("розница сердца 100 г без пакетов 21, подписка пакеты оставляет", () => {
  const heart = [row("СЕРДЦЕ", "Ломтики", 100)];
  const basket = api.calcRetailBasketTotal(heart, { deliveriesN: 1 });
  const packs = price.recountPacks(heart);
  assert.equal(basket.goods, 12);
  assert.equal(basket.delivery, 9);
  assert.equal(basket.total, 21);
  assert.equal(packs.byn, 1.96);
  assert.equal(price.retailTotalWithPacks_(basket.total, packs.byn), 22.96);
  assert.equal(price.retailOfferTotal_(basket.total), 21);
  const before = price.composeRetailClientMessage(heart, 22.96, "");
  const after = price.composeRetailClientMessage(heart, price.retailOfferTotal_(basket.total), "");
  assert.match(before, /23 рубля/);
  assert.match(after, /Сердце - 100 г \(ломтики\)/);
  assert.match(after, /21 рубль/);
  assert.equal(after.includes("21 рублей"), false);
  assert.equal(after.includes("пакет"), false);
  const bare = price.quotePp({
    scheme: "RAW26", coef: 2.6, deliveriesN: 2, costSum: 5,
    list: heart, packagesByn: 0, fracTotal: 0
  });
  const full = price.quotePp({
    scheme: "RAW26", coef: 2.6, deliveriesN: 2, costSum: 5,
    list: heart, packagesByn: packs.byn, fracTotal: 0
  });
  assert.equal(Math.round((full.fact.factBeforeCap - bare.fact.factBeforeCap) * 100) / 100, 1.96);
});

test("слово рубль склоняется по числу, Рубец на месте", () => {
  const word = price.rublesWord_;
  assert.equal(word(1), "рубль");
  assert.equal(word(21), "рубль");
  assert.equal(word(31), "рубль");
  assert.equal(word(101), "рубль");
  assert.equal(word(2), "рубля");
  assert.equal(word(4), "рубля");
  assert.equal(word(22), "рубля");
  assert.equal(word(23), "рубля");
  assert.equal(word(24), "рубля");
  assert.equal(word(0), "рублей");
  assert.equal(word(5), "рублей");
  assert.equal(word(11), "рублей");
  assert.equal(word(14), "рублей");
  assert.equal(word(20), "рублей");
  assert.equal(word(25), "рублей");
  assert.equal(word(111), "рублей");
  assert.equal(word(114), "рублей");
  assert.equal(word(22.96), "рубля");
  assert.equal(word(11.5), "рубля");
  assert.equal(word(101.01), "рубля");
  const msg21 = price.composeRetailClientMessage([row("РУБЕЦ Т", "Среднее", 100)], 21, "");
  const msg23 = price.composeRetailClientMessage([], 23, "");
  const msg25 = price.composeRetailClientMessage([], 25, "");
  assert.match(msg21, /Рубец - 100 г \(кусочки\)/);
  assert.match(msg21, /21 рубль/);
  assert.equal(/21 рубл[яей]/.test(msg21.replace("21 рубль", "")), false);
  assert.match(msg23, /23 рубля/);
  assert.match(msg25, /25 рублей/);
  assert.equal(msg21.includes("Рубец Т"), false);
});

test("счётчик пакетов остаётся только в подписке", () => {
  const src = fs.readFileSync(path.join(here, "clients.js"), "utf8");
  const paint = src.slice(src.indexOf("function paintCalc()"), src.indexOf("function paintPick()"));
  const retail = paint.slice(paint.indexOf('if (price.mode === "retail")'), paint.indexOf('if (price.mode !== "retail")'));
  const sub = paint.slice(paint.indexOf('if (price.mode !== "retail")'));
  assert.equal(retail.includes("Пакеты"), false);
  assert.equal(retail.includes("cl-repack"), false);
  assert.match(sub, /Пакеты/);
  assert.match(sub, /cl-repack/);
  const fn = src.slice(src.indexOf("function retailWithPacks_(list)"), src.indexOf("function keepEnrollFact_(sub)"));
  assert.match(fn, /retailOfferTotal_/);
  assert.equal(fn.includes("retailTotalWithPacks_"), false);
  assert.equal(fn.includes("packagesBynNow"), false);
  const offer = src.slice(src.indexOf("function offerFromCost_(list, cost, res)"), src.indexOf("async function buildPpOffer(list)"));
  assert.match(offer, /packagesBynNow\(\)/);
  assert.match(offer, /subscriptionOfferWithPacks_/);
});
