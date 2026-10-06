import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const P = require(path.join(path.dirname(fileURLToPath(import.meta.url)), "price-logic.js"));

const heart = [{ cat: "dressura", main: "СЕРДЦЕ", name: "СЕРДЦЕ", sub: "Ломтики", val: 100, value: 100 }];

test("пакеты из состава те же, что в сборке, и входят в цену", () => {
  const packs = P.recountPacks(heart);
  assert.equal(packs.counts.medium, 1);
  assert.equal(packs.counts.legs, 1);
  assert.equal(packs.byn, 1.96);
  const bare = P.quotePp({
    scheme: "RAW26", coef: 2.6, deliveriesN: 2, costSum: 5,
    list: heart, packagesByn: 0, fracTotal: 0
  });
  const full = P.quotePp({
    scheme: "RAW26", coef: 2.6, deliveriesN: 2, costSum: 5,
    list: heart, packagesByn: packs.byn, fracTotal: 0
  });
  assert.equal(full.fact.packagesBeforeCap, 1.96);
  assert.equal(Math.round((full.fact.factBeforeCap - bare.fact.factBeforeCap) * 100) / 100, 1.96);
  assert.ok(full.total <= full.fact.retailCapAt + 0.001);
  assert.ok(bare.total <= bare.fact.retailCapAt + 0.001);
  const moved = P.subscriptionOfferWithPacks_({
    fact: bare.total,
    factPacks: 0,
    packagesByn: packs.byn,
    quoteTotal: full.total,
    retailTotal: 400,
    scheme: "RAW26"
  });
  assert.equal(moved, Math.round((bare.total + packs.byn) * 100) / 100);
  const same = P.subscriptionOfferWithPacks_({
    fact: full.total,
    factPacks: packs.byn,
    packagesByn: packs.byn,
    quoteTotal: full.total,
    retailTotal: 400,
    scheme: "RAW26"
  });
  assert.equal(same, full.total);
  const bumped = P.subscriptionOfferWithPacks_({
    fact: full.total,
    factPacks: packs.byn,
    packagesByn: Math.round((packs.byn + 0.34) * 100) / 100,
    quoteTotal: full.total,
    retailTotal: 400,
    scheme: "RAW26"
  });
  assert.equal(bumped, Math.round((full.total + 0.34) * 100) / 100);
});

test("ориентир 157 без пакетов и 166 с доплатой 8,92, потолок 92% держится", () => {
  const withPacks = P.subscriptionOfferWithPacks_({
    fact: 157,
    factPacks: 0,
    packagesByn: 8.92,
    quoteTotal: 165.92,
    retailTotal: 200,
    scheme: "RAW26"
  });
  assert.equal(withPacks, 165.92);
  const msgOn = P.composePpClientMessage(heart, 2, "", 200, withPacks, "RAW26", {});
  const msgOff = P.composePpClientMessage(heart, 2, "", 200, 157, "RAW26", {});
  assert.match(msgOn, /166 рублей за месяц/);
  assert.match(msgOff, /157 рублей за месяц/);
  assert.equal(msgOn.includes("пакет"), false);
  assert.equal(msgOff.includes("пакет"), false);
  assert.equal(msgOn.includes("Доставка -"), false);
  const capped = P.subscriptionOfferWithPacks_({
    fact: 200,
    factPacks: 0,
    packagesByn: 9,
    quoteTotal: 209,
    retailTotal: 100,
    scheme: "RAW26"
  });
  assert.equal(capped, 92);
});

test("розница включает доплату за пакеты и не пишет её отдельной строкой", () => {
  assert.equal(P.retailTotalWithPacks_(80, 8.92), 88.92);
  assert.equal(P.retailTotalWithPacks_(157, 0), 157);
  const msg = P.composeRetailClientMessage(heart, 88.92, "");
  assert.match(msg, /89 рублей/);
  assert.equal(msg.includes("пакет"), false);
  assert.equal(msg.includes("Доставка"), false);
});
