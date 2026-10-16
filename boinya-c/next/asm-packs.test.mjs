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

test("courier: one order, two dogs, one price, two sections", () => {
  const card = {
    name: "strawberrycatmrrr",
    matchKey: "STRAWBERRYCATMRRR",
    address: "Ольшевского 71",
    orderPrice: 76,
    dogCount: 2,
    dogNames: { 1: "Барни", 2: "Патрик" },
    basket: [
      { name: "ЛЁГКОЕ", val: 20, dog: 1 },
      { name: "СЕРДЦЕ", val: 15, dog: 1 },
      { name: "ЛЁГКОЕ", val: 30, dog: 2 },
      { name: "ПОЧКИ", val: 15, dog: 2 }
    ]
  };
  const stops = packs.courierStops([card]);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].twoDogs, true);
  assert.equal(stops[0].orderPrice, 76);
  assert.equal(stops[0].dogSections.length, 2);
  assert.equal(stops[0].dogSections[0].title, "Собака 1 (Барни)");
  assert.equal(stops[0].dogSections[1].title, "Собака 2 (Патрик)");
  assert.deepEqual(stops[0].dogSections[0].basket.map((it) => it.name), ["ЛЁГКОЕ", "СЕРДЦЕ"]);
  assert.deepEqual(stops[0].dogSections[1].basket.map((it) => it.name), ["ЛЁГКОЕ", "ПОЧКИ"]);
  assert.equal(packs.courierDogLine(stops[0]), "2 собаки: Барни, Патрик, 2 пакета");
});

test("courier: dog parts on one nick collapse, price is not added", () => {
  const a = client({ name: "Анна", matchKey: "ANNA", owner: "Анна", dog: 1, dogCount: 2, itemDog: 1, address: "ул 1", grams: 100 });
  a.orderPrice = 40;
  a.dogName = "Барни";
  a.basket[0].name = "ЛЁГКОЕ";
  const b = client({ name: "Анна · 2", matchKey: "ANNA", owner: "Анна", dog: 2, dogCount: 2, itemDog: 2, address: "ул 1", grams: 80 });
  b.orderPrice = 40;
  b.dogName = "Патрик";
  b.basket[0].name = "ПОЧКИ";
  const stops = packs.courierStops([a, b]);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].orderPrice, 40);
  assert.notEqual(stops[0].orderPrice, 80);
  assert.equal(stops[0].dogSections[0].title, "Собака 1 (Барни)");
  assert.equal(stops[0].dogSections[1].title, "Собака 2 (Патрик)");
  assert.equal(stops[0].dogSections[0].basket[0].name, "ЛЁГКОЕ");
  assert.equal(stops[0].dogSections[1].basket[0].name, "ПОЧКИ");
  assert.equal(packs.courierDogLine(stops[0]), "2 собаки: Барни, Патрик, 2 пакета");
});

test("courier: same basket twice is one card without a second dog", () => {
  const a = client({ name: "mr.barney.corgi", matchKey: "MRBARNEYCORGI", address: "Бурдейного 45", grams: 20 });
  a.orderPrice = 30;
  const dup = client({ name: "mr.barney.corgi", matchKey: "MRBARNEYCORGI", address: "Бурдейного 45", grams: 20 });
  dup.orderPrice = 30;
  const stops = packs.courierStops([a, dup]);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].twoDogs, false);
  assert.equal(stops[0].dogSections, null);
  assert.equal(stops[0].orderPrice, 30);
  assert.equal(packs.courierDogLine(stops[0]), "");
});

test("courier: two different baskets, one nick, one price", () => {
  const a = client({ name: "two_merry_cockers", matchKey: "TWO", address: "Уборевича 102", grams: 30 });
  a.orderPrice = 40;
  const b = client({ name: "two_merry_cockers", matchKey: "TWO", address: "Уборевича 102", grams: 30 });
  b.orderPrice = 50;
  b.basket[0].name = "СЕРДЦЕ";
  const stops = packs.courierStops([a, b]);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].twoDogs, false);
  assert.equal(stops[0].dogSections, null);
  assert.equal(stops[0].orderPrice, 40);
  assert.notEqual(Number(stops[0].orderPrice), 90);
  assert.equal(packs.courierDogLine(stops[0]), "");
});

test("courier: sku twin with шт is one dog, one basket", () => {
  const a = client({ name: "patrick_beagleminsk", matchKey: "PATRICKBEAGLEMINSK", address: "ул 1", grams: 1 });
  a.orderPrice = 0;
  a.dogName = "Петрушка";
  a.basket[0].name = "УТИНЫЕ ШЕИ ШТ.";
  const b = client({ name: "patrick_beagleminsk", matchKey: "PATRICKBEAGLEMINSK", address: "ул 1", grams: 1 });
  b.import = "stage-b";
  b.dogName = "Петрушка";
  b.basket[0].name = "УТИНЫЕ ШЕИ";
  const stops = packs.courierStops([a, b]);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].twoDogs, false);
  assert.equal(stops[0].dogName, "Петрушка");
  assert.equal(stops[0].basket.length, 1);
  assert.equal(stops[0].basket[0].name, "УТИНЫЕ ШЕИ ШТ.");
  assert.equal(packs.courierDogLine(stops[0]), "");
});

test("courier: two different nicknames are two dogs", () => {
  const a = client({ name: "Анна", matchKey: "ANNA", owner: "Анна", address: "ул 1", grams: 20 });
  a.dogName = "Барни";
  a.orderPrice = 40;
  const b = client({ name: "Анна", matchKey: "ANNA", owner: "Анна", address: "ул 1", grams: 30 });
  b.dogName = "Патрик";
  b.orderPrice = 40;
  const stops = packs.courierStops([a, b]);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].twoDogs, true);
  assert.equal(stops[0].orderPrice, 40);
  assert.equal(packs.courierDogLine(stops[0]), "2 собаки: Барни, Патрик, 2 пакета");
});

test("courier: dog part suffix without a second dog is one card", () => {
  const a = client({ name: "Анна", matchKey: "ANNA", owner: "Анна", dog: 1, address: "ул 1", grams: 20 });
  const b = client({ name: "Анна · 2", matchKey: "ANNA", owner: "Анна", dog: 2, address: "ул 1", grams: 20 });
  const stops = packs.courierStops([a, b]);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].twoDogs, false);
  assert.equal(packs.courierDogLine(stops[0]), "");
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
