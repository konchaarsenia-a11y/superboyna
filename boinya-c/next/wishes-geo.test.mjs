import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const G = require("./wishes-geo.js");
const root = path.join(here, "..");

test("служебные координаты снимаются, текст сотрудника остаётся", () => {
  const tagged = G.peel("не солить [GEO:53.9023,27.5618] [YMAPS:https://yandex.ru/maps/?pt=27.5618,53.9023&z=17]");
  assert.equal(tagged.text, "не солить");
  assert.ok(tagged.geo);
  assert.ok(Math.abs(tagged.geo.lat - 53.9023) < 0.0001);
  assert.ok(Math.abs(tagged.geo.lon - 27.5618) < 0.0001);

  const loose = G.peel("оставить у двери\n53.902300, 27.561800");
  assert.equal(loose.text, "оставить у двери");
  assert.ok(loose.geo && G.inBy(loose.geo.lat, loose.geo.lon));

  const swapped = G.peel("27.561800, 53.902300");
  assert.equal(swapped.text, "");
  assert.ok(Math.abs(swapped.geo.lat - 53.9023) < 0.0001);

  const link = G.peel("см https://yandex.ru/maps/?pt=27.484504,53.907861&z=17&l=map");
  assert.equal(link.text, "см");
  assert.ok(Math.abs(link.geo.lat - 53.907861) < 0.00001);
});

test("коэффициент, схема и обычный текст не считаются координатами", () => {
  const meta = "[COEF:2.60] [SCHEME:RAW26] любит рубец";
  const peeled = G.peel(meta);
  assert.equal(peeled.text, meta);
  assert.equal(peeled.geo, null);
  assert.equal(G.peel("вес 12.5 кг, квартплата 15").text, "вес 12.5 кг, квартплата 15");
  assert.equal(G.peel("кв 15, домофон 1234").geo, null);
  assert.equal(G.peel("Минск, Независимости 10").geo, null);
  assert.equal(G.peel("[DOG:Барсик|корги|12]").text, "[DOG:Барсик|корги|12]");
});

test("карточка и заказ не пишут координаты обратно в пожелания", () => {
  const clients = fs.readFileSync(path.join(here, "clients.js"), "utf8");
  const payload = fs.readFileSync(path.join(here, "order-payload.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.main.js"), "utf8");
  const gs = fs.readFileSync(path.join(root, "..", "Code.gs"), "utf8");
  const worker = fs.readFileSync(path.join(root, "proxy", "worker.js"), "utf8");
  assert.match(clients, /BoinyaWishesGeo/);
  assert.match(clients, /staffWishes_/);
  assert.match(payload, /BoinyaWishesGeo/);
  assert.match(app, /function applyGeoTags\(note, geo\) \{\s*return stripGeoTags\(note\);/);
  assert.match(app, /wishesForStaffField_/);
  assert.match(gs, /function peelServiceCoords_/);
  assert.match(gs, /function handleStripCoordsFromWishes/);
  assert.match(gs, /upsertClientGeo_\(ss, "CARD"/);
  assert.match(worker, /function peelServiceCoords_/);
  assert.match(worker, /client_service_geo/);
  assert.match(worker, /stripCoordsFromWishes/);
  assert.match(worker, /peelServiceCoords_\(noteRaw\)/);
  assert.match(worker, /attachStoredServiceGeo_/);
  assert.match(worker, /patched\.serviceGeo = peeledWish\.geo/);
  assert.match(worker, /merged\.wishes = peeledDetail\.text/);
  assert.match(app, /peelServiceCoords_\(note\)/);
  assert.match(gs, /peeledEnrollWish/);
  assert.doesNotMatch(app, /\[GEO:" \+ geo\.lat/);
});
