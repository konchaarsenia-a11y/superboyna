import test from "node:test";
import assert from "node:assert/strict";
import price from "./price-logic.js";
import packs from "./asm-packs.js";

function line(name, grams) {
  return { name: name, main: name, cat: "dressura", val: grams, value: grams, unit: "г" };
}

function client(opts) {
  const item = line(opts.sku || "ПОЧКИ", opts.grams);
  if (opts.itemDog) item.dog = opts.itemDog;
  return {
    name: opts.name,
    matchKey: opts.matchKey,
    ownerName: opts.owner || opts.name,
    dogPart: opts.dog,
    dogCount: opts.dogCount,
    twoDogs: opts.twoDogs,
    address: opts.address,
    dateIso: opts.dateIso || "",
    assembled: false,
    basket: [item]
  };
}

function tally(list, dateIso) {
  return packs.tally(list, function (c) {
    return price.buildAssemblyPacksLocal(c.basket, null);
  }, dateIso || "");
}

test("two clients, one with two dogs: craft 2", () => {
  const res = tally([
    client({ name: "Анна", matchKey: "ANNA", owner: "Анна", dog: 1, dogCount: 2, itemDog: 1, address: "ул Тестовая 1", grams: 100 }),
    client({ name: "Анна · 2", matchKey: "ANNA", owner: "Анна", dog: 2, dogCount: 2, itemDog: 2, address: "ул Тестовая 1", grams: 100 }),
    client({ name: "Борис", matchKey: "BORIS", owner: "Борис", dog: 1, address: "ул Тестовая 2", grams: 100 })
  ]);
  assert.equal(res.totals["крафт"], 2);
  assert.notEqual(res.totals["крафт"], 3);
  assert.notEqual(res.totals["крафт"], 4);
  assert.equal(res.rows.length, 3);
});

test("client without the mark, two assembly rows: 1 dog, 1 craft", () => {
  const res = tally([
    client({ name: "Анна", matchKey: "ANNA", owner: "Анна", dog: 1, address: "ул Тестовая 1", grams: 100 }),
    client({ name: "Анна · 2", matchKey: "ANNA", owner: "Анна", dog: 2, address: "ул Тестовая 1", grams: 100 })
  ]);
  assert.equal(res.rows.length, 1);
  assert.equal(Number(res.rows[0].client.dogPart) || 0, 0);
  assert.equal(res.rows[0].client.dogCount, 1);
  assert.equal(res.totals["крафт"], 1);
  assert.notEqual(res.totals["крафт"], 2);
});

test("marked 2 dogs: 2 dogs, 1 craft", () => {
  const res = tally([
    client({ name: "Анна", matchKey: "ANNA", owner: "Анна", dog: 1, dogCount: 2, itemDog: 1, address: "ул Тестовая 1", grams: 100 }),
    client({ name: "Анна · 2", matchKey: "ANNA", owner: "Анна", dog: 2, dogCount: 2, itemDog: 2, address: "ул Тестовая 1", grams: 100 })
  ]);
  assert.equal(res.rows.length, 2);
  assert.equal(res.totals["крафт"], 1);
  assert.notEqual(res.totals["крафт"], 2);
});

test("1.2 kg is 5 large bags and craft 2", () => {
  const one = client({ name: "Вера", matchKey: "VERA", address: "ул Тестовая 3", grams: 1200 });
  const packsOne = price.buildAssemblyPacksLocal(one.basket, null);
  const large = packsOne.filter((p) => p.counterKey === "большой").reduce((s, p) => s + p.bags, 0);
  assert.equal(large, 5);
  const res = tally([one]);
  assert.equal(res.totals["крафт"], 2);
});

test("duplicate row does not double craft", () => {
  const a = client({ name: "Анна", matchKey: "ANNA", dog: 1, address: "ул Тестовая 1", grams: 100 });
  const dup = client({ name: "Анна", matchKey: "ANNA", dog: 1, address: "ул Тестовая 1", grams: 100 });
  const res = tally([a, dup]);
  assert.equal(res.rows.length, 1);
  assert.equal(res.totals["крафт"], 1);
});

test("row from another day is dropped", () => {
  const res = tally([
    client({ name: "Анна", matchKey: "ANNA", address: "ул Тестовая 1", grams: 100, dateIso: "2026-09-29" }),
    client({ name: "Борис", matchKey: "BORIS", address: "ул Тестовая 2", grams: 100, dateIso: "2026-09-30" })
  ], "2026-09-29");
  assert.equal(res.rows.length, 1);
  assert.equal(res.totals["крафт"], 1);
});
