#!/usr/bin/env node
/* Статус сборки на заказе курьера: matchKey, две собаки, локальная галочка. Без сети и D1. */
"use strict";

var assert = require("assert");
var path = require("path");

require(path.join(__dirname, "..", "boinya-c", "courier-asm.js"));
var asm = global.BoinyaCourierAsm;
assert.ok(asm && typeof asm.apply === "function");

var now = 1_700_000_000_000;

function cour(extra) {
  return Object.assign({ name: "Муха", matchKey: "муха", assembled: false }, extra || {});
}

function card(extra) {
  return Object.assign({
    name: "Муха",
    ownerName: "Муха",
    matchKey: "муха",
    assembled: false,
    dogPart: 0
  }, extra || {});
}

// getCourier врёт «не собран», сборка уже отметила заказ
var one = [cour()];
asm.apply(one, [card({ assembled: true })], { now: now });
assert.strictEqual(one[0].assembled, true);
assert.strictEqual(asm.badgeText(one[0]), "собран");
assert.strictEqual(asm.badgeKind(one[0]), "yes");

// две собаки: собрана только одна
var dogs = [cour()];
asm.apply(dogs, [
  card({ name: "Муха", dogPart: 1, assembled: true }),
  card({ name: "Муха · 2", ownerName: "Муха", dogPart: 2, assembled: false })
], { now: now });
assert.strictEqual(dogs[0].assembled, false);
assert.strictEqual(dogs[0].assembledPartial, true);
assert.strictEqual(asm.badgeText(dogs[0]), "собран 1/2");

// обе собаки собраны
var both = [cour()];
asm.apply(both, [
  card({ name: "Муха", dogPart: 1, assembled: true }),
  card({ name: "Муха · 2", ownerName: "Муха", dogPart: 2, assembled: true })
], { now: now });
assert.strictEqual(both[0].assembled, true);
assert.strictEqual(both[0].assembledPartial, false);
assert.strictEqual(asm.badgeText(both[0]), "собран");

// чужой matchKey не прилипает, даже если имя похоже
var other = [cour({ name: "Муха", matchKey: "муха" })];
asm.apply(other, [card({ name: "Муха", matchKey: "другая", assembled: true })], { now: now });
assert.strictEqual(other[0].assembled, false);
assert.strictEqual(other[0].assembledFromAssembly, false);

// без matchKey у курьера — по имени владельца, включая «· 2»
var byName = [cour({ matchKey: "" })];
asm.apply(byName, [
  card({ name: "Муха · 2", ownerName: "Муха", matchKey: "муха", dogPart: 2, assembled: true })
], { now: now });
assert.strictEqual(byName[0].assembled, true);

// локальная галочка этого телефона перекрывает ещё не доехавший снимок
var local = [cour()];
var flags = { "МУХА": { assembled: true, ts: now - 1000 } };
asm.apply(local, [card({ assembled: false })], { now: now, localFlags: flags });
assert.strictEqual(local[0].assembled, true);

// протухшая локальная галочка не держит статус
var stale = [cour()];
asm.apply(stale, [card({ assembled: false })], {
  now: now,
  localFlags: { "МУХА": { assembled: true, ts: now - 1800001 } }
});
assert.strictEqual(stale[0].assembled, false);

// пустой ответ сборки не затирает флаг, который уже был на курьере
var keep = [cour({ assembled: true })];
asm.apply(keep, [], { now: now });
assert.strictEqual(keep[0].assembled, true);
assert.strictEqual(asm.badgeText(keep[0]), "собран");

var sigA = asm.sig(both);
var sigB = asm.sig(dogs);
assert.notStrictEqual(sigA, sigB);
assert.strictEqual(asm.sig(both), asm.sig(both));

console.log("test-courier-asm: ok");
