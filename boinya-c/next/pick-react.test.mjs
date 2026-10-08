import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const P = require("./price-logic.js");
const eng = require("./order-engine.js");
const clients = fs.readFileSync(path.join(here, "clients.js"), "utf8");

const ANKETA = [
  "Имя: Барсик",
  "Порода: корги, вес 12 кг",
  "Любит лёгкое и рубец говяжий",
  "Не ест курицу",
  "Фракция мелкая",
  "Бюджет до 80 руб в месяц"
].join("\n");

test("алиас рубец доступен подбору", () => {
  assert.equal(typeof eng.igAliasResolve, "function");
  assert.equal(eng.igAliasResolve("РУБЕЦ"), "РУБЕЦ Т");
  assert.match(fs.readFileSync(path.join(here, "price-logic.js"), "utf8"), /var igAliasResolve = eng\.igAliasResolve/);
});

test("анкета с позициями собирается для каждого типа", async () => {
  const sig = P.parseAnketSignals_(ANKETA);
  assert.ok((sig.lineItems || []).length || (sig.liked || []).length || (sig.mentioned || []).length);
  for (const target of ["bp", "bp2", "retail", "pp"]) {
    const composed = P.pricePickComposeForTarget_(sig, target);
    assert.ok(composed && composed.items && composed.items.length, target);
    const text = P.pricePickOfferText_(sig, target, composed.items);
    assert.equal(typeof text, "string");
    assert.ok(text.length > 20, target);
    const fit = await P.pricePickFitBudget_({ items: composed.items, target: target, signals: sig });
    const items = (fit && fit.items) || composed.items;
    assert.ok(items.length, target + " fit");
    if (target === "bp" || target === "bp2") {
      assert.equal(text.indexOf("вторую"), -1);
      assert.equal(text.indexOf("БП2"), -1);
      assert.equal(P.priceModeKey(target), "bp1");
      assert.equal(P.priceModeLabel_(target), "БП");
    }
  }
});

test("кнопка Подобрать не молчит", () => {
  assert.match(clients, /Вставь текст анкеты/);
  assert.match(clients, /Не получилось подобрать/);
  assert.match(clients, /Подбираю…/);
  assert.match(clients, /b-btn--loading/);
  assert.match(clients, /id="cxPickOut"/);
  assert.match(clients, /getElementById\("cxAnketa"\)/);
  assert.match(clients, /scrollIntoView/);
  assert.match(clients, /catch \(e\) \{\s*sh\(\)\.toast\("Не получилось подобрать"\)/);
});
