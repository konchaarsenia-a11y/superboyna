import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const route = require("./route-logic.js");
const cards = require("./card-copy.js");
const templates = require("./templates.js");
const app = fs.readFileSync(path.resolve(here, "../app.main.js"), "utf8");
const logic = fs.readFileSync(path.resolve(here, "route-logic.js"), "utf8");

const COPIED = [
  "haversineKm",
  "driveMinutesBetween",
  "nearestNeighborOrder",
  "twoOptImprove",
  "optimizeRouteOrder",
  "estimateRouteMinutes",
  "approxMinutesForClient",
  "splitGeographic2_",
  "autoSplitStops",
  "geocodeAddress"
];

test("порядок маршрута вырезан из app.main.js", () => {
  COPIED.forEach((name) => {
    const idx = app.indexOf("\n    function " + name + "(");
    const asyncIdx = app.indexOf("\n    async function " + name + "(");
    const at = idx >= 0 ? idx : asyncIdx;
    assert.ok(at >= 0, name);
    const snippet = app.slice(at + 1, at + 180);
    assert.ok(logic.includes(snippet), "нет дословного " + name);
  });
});

test("минуты клиенту и флаги нарезки как в старом коде", () => {
  assert.equal(route.approxMinutesForClient(7), 5);
  assert.equal(route.approxMinutesForClient(12), 10);
  assert.equal(route.approxMinutesForClient(13), 15);
  const depot = { lat: 53.9, lon: 27.56 };
  const stops = [
    { lat: 53.91, lon: 27.58 },
    { lat: 53.88, lon: 27.5 }
  ];
  const msg = route.igMessageForStop(depot, stops, 0);
  assert.match(msg, /^Здравствуйте! Буду примерно через \d+ мин\.$/);
  assert.equal(
    route.cuttingFlags([{ row: 12, laid: true, done: false, outNext: true, surplus: 2 }]),
    "12,1,0,1,2"
  );
  assert.equal(route.missingEnc([{ row: 4, name: "ТЫКВА|x" }]), "4~ТЫКВА x");
  assert.equal(route.parseDeliveryMethod("заказ [ЕВРОПОЧТА]"), "euro");
  assert.equal(route.parseOfficeAddress("a [ОТДЕЛЕНИЕ:Минск, ул. Мележа, 5]"), "Минск, ул. Мележа, 5");
});

test("порядок двух точек не выдуман: ближняя к складу первая при равных окнах", () => {
  route.state.matrix = null;
  route.setDepart(14, 0);
  const depot = { lat: 53.9023, lon: 27.5619 };
  const near = { name: "близко", lat: 53.91, lon: 27.57 };
  const far = { name: "далеко", lat: 53.95, lon: 27.7 };
  const ordered = route.optimizeRouteOrder(depot, [far, near]);
  assert.equal(ordered[0].name, "близко");
  assert.equal(ordered[1].name, "далеко");
});

test("карточки лакомств совпадают с PRODUCT_CARD_INFO", () => {
  const blockAt = app.indexOf("var PRODUCT_CARD_INFO");
  const lung = app.slice(blockAt, blockAt + 500);
  assert.ok(lung.includes("Сушёное говяжье лёгкое"));
  assert.ok(cards.info["ЛЁГКОЕ"].startsWith("Сушёное говяжье лёгкое"));
  assert.equal(Object.keys(cards.info).length, 36);
  assert.match(cards.notes["ТРАХЕЯ"], /травмоопасно/);
  assert.equal(templates.blurb("ЛЁГКОЕ"), cards.info["ЛЁГКОЕ"]);
  assert.match(templates.noteOf("трахея говяжья"), /травмоопасно/);
  const text = templates.cardText("ЛЁГКОЕ", "Дрессура", ["Ломтики", "Полоски"]);
  assert.ok(text.startsWith("ЛЁГКОЕ\nКатегория: Дрессура\nФракции/размеры: Ломтики, Полоски\n\n"));
  assert.ok(text.endsWith(cards.info["ЛЁГКОЕ"]));
});

test("пропечатка пакетов зовёт существующий setPrinted", () => {
  const prod = fs.readFileSync(path.resolve(here, "production.js"), "utf8");
  assert.ok(prod.includes('action: "setPrinted"'));
  assert.ok(prod.includes("Пропечатка пакетов"));
  assert.ok(prod.includes('action: "setAssembled"'));
  assert.ok(prod.includes('action: "updateCutting"'));
  assert.ok(prod.includes('action: "finishCutting"'));
  assert.ok(prod.includes('action: "notifyMissedDelivery"'));
  assert.ok(prod.includes('action: "sendCourierRoute"'));
  assert.equal(prod.includes("window.print"), false);
});
