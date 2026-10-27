import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(import.meta.url);
const engine = require("./order-engine.js");
const scheme = require("./crumb-scheme.js");
scheme.install(engine);

function line(kind, grams, sources) {
  return {
    cat: "crumb",
    crumbKind: kind,
    name: "крошка",
    main: "крошка",
    value: grams,
    sources: (sources || ["ЛЁГКОЕ"]).map(function (name) {
      return { name: name, main: name, cat: "dressura" };
    }),
    ratio: (sources || ["ЛЁГКОЕ"]).map(function () { return grams; })
  };
}

test("три микса строго по весу, старая пачка не меняется", () => {
  assert.equal(scheme.mix3Goods(line("mix3:mix", 100), 100), 15);
  assert.equal(scheme.mix3Goods(line("mix3:mix", 50), 50), 7.5);
  assert.equal(scheme.mix3Goods(line("mix3:mix", 20), 20), 3);
  assert.equal(scheme.mix3Goods(line("mix3:meat", 100), 100), 20);
  assert.equal(scheme.mix3Goods(line("mix3:meat", 50), 50), 10);
  assert.equal(scheme.mix3Goods(line("mix3:meat", 20), 20), 4);
  assert.equal(scheme.mix3Goods(line("mix3:hypo", 100), 100), 25);
  assert.equal(scheme.mix3Goods(line("mix3:hypo", 50), 50), 12.5);
  assert.equal(scheme.mix3Goods(line("mix3:hypo", 20), 20), 5);
  assert.equal(scheme.mix3Goods(line("meat", 100), 100), null);
  assert.equal(scheme.mix4Goods(line("mix4:dress", 100), 100), 19);
  assert.equal(scheme.mix4Goods(line("mix4:dress", 50), 50), 9.5);
  assert.equal(scheme.mix4Goods(line("mix4:dress", 20), 20), 3.8);
  assert.equal(scheme.mix4Goods(line("mix4:veg", 100), 100), 17);
  assert.equal(scheme.mix4Goods(line("mix4:veg", 50), 50), 8.5);
  assert.equal(scheme.mix4Goods(line("mix4:veg", 20), 20), 3.4);
  assert.equal(scheme.mix4Goods(line("mix4:hypo", 100), 100), 22);
  assert.equal(scheme.mix4Goods(line("mix4:hypo", 50), 50), 11);
  assert.equal(scheme.mix4Goods(line("mix4:hypo", 20), 20), 4.4);
  assert.equal(scheme.mix4Goods(line("mix3:hypo", 100), 100), null);

  const fresh = line("mix3:mix", 100, ["ЛЁГКОЕ", "ЯБЛОКИ"]);
  const legacy = line("meat", 100, ["РУБЕЦ Т"]);
  const quote = engine.calcRetailBasketTotal([fresh, legacy], { applyDelivery: false });
  assert.equal(quote.goods, 27);

  const saved = engine.serializeBasketItem_(fresh);
  assert.equal(saved.crumbKind, "mix3:mix");
  const loaded = engine.mapApiBasketToLocal([saved])[0];
  assert.equal(loaded.crumbKind, "mix3:mix");
  assert.equal(engine.calcRetailBasketTotal([loaded], { applyDelivery: false }).goods, 15);
  const oldSaved = engine.serializeBasketItem_(legacy);
  assert.equal(oldSaved.crumbKind, "meat");
  assert.equal(engine.calcRetailBasketTotal([oldSaved], { applyDelivery: false }).goods, 12);

  const dress = line("mix4:dress", 100, ["ЛЁГКОЕ", "ПЕЧЕНЬ"]);
  const veg = line("mix4:veg", 50, ["ЯБЛОКИ"]);
  const hypo = line("mix4:hypo", 20, ["ИНДЕЙКА"]);
  const next = engine.calcRetailBasketTotal([dress, veg, hypo, fresh], { applyDelivery: false });
  assert.equal(next.goods, 19 + 8.5 + 4.4 + 15);
});

test("worker и Code.gs считают mix3, order-engine не переписан", () => {
  const worker = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
  const gs = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
  const order = fs.readFileSync(path.join(here, "order-engine.js"), "utf8");
  assert.match(worker, /mix3:\(mix\|meat\|hypo\)/);
  assert.match(gs, /mix3:\(mix\|meat\|hypo\)/);
  assert.match(worker, /mix4:\(dress\|veg\|hypo\)/);
  assert.match(gs, /mix4:\(dress\|veg\|hypo\)/);
  assert.match(worker, /kind === "hypo" \? 22 : \(kind === "veg" \? 17 : 19\)/);
  assert.match(gs, /kind === "hypo" \? 22 : \(kind === "veg" \? 17 : 19\)/);
  assert.match(worker, /mixKind === "hypo" \? 25 : \(mixKind === "meat" \? 20 : 15\)/);
  assert.match(gs, /mixKind === "hypo" \? 25 : \(mixKind === "meat" \? 20 : 15\)/);
  assert.match(worker, /crumbPackGoodsD1_/);
  assert.match(gs, /crumbPackGoodsGs_/);
  assert.doesNotMatch(order, /mix3:/);
  assert.doesNotMatch(order, /mix4:/);
});
