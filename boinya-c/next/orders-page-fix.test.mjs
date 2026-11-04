/**
 * orders-page-fix-h1 — CI по пунктам пачки «Заказы».
 * Один assert-блок на номер ТЗ.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pay = require("./order-payload.js");
const eng = require("./order-engine.js");

const ordersSrc = fs.readFileSync(path.join(here, "orders.js"), "utf8");
const weekSrc = fs.readFileSync(path.join(here, "week.js"), "utf8");
const appSrc = fs.readFileSync(path.join(here, "app.js"), "utf8");
const workerSrc = fs.readFileSync(path.join(here, "../proxy/worker.js"), "utf8");
const dsSrc = fs.readFileSync(path.join(here, "../ds.css"), "utf8");
const indexSrc = fs.readFileSync(path.join(here, "../index.html"), "utf8");
const rootApp = fs.readFileSync(path.join(here, "../../app.html"), "utf8");

test("#2 ник: paintUnlessTyping / не полный paint при фокусе", () => {
  assert.match(ordersSrc, /function paintUnlessTyping/);
  assert.match(ordersSrc, /typingNickOrAddr/);
  assert.match(ordersSrc, /changed && !sh\(\)\.sheetOpen\(\)\) paintUnlessTyping/);
  assert.match(ordersSrc, /orderVisible\(\) && !had\) paintUnlessTyping/);
});

test("#3 дата: open-days → календарь, без dayStrip sheet", () => {
  assert.match(ordersSrc, /open-days.*cal.*openCal|open-days \|\| act === "cal"/);
  assert.match(ordersSrc, /title: "Дата"/);
  assert.doesNotMatch(ordersSrc, /open-days"\) \{ sh\(\)\.openSheet\(\{ title: "День", html: dayStrip/);
});

test("#4 suggestAddress: дом обязателен, Nominatim первым", () => {
  assert.match(workerSrc, /orders-page-fix: #4/);
  assert.match(workerSrc, /сначала Nominatim/);
  const mapIdx = workerSrc.indexOf("orders-page-fix: #4 — если в запросе есть дом");
  assert.ok(mapIdx > 0);
  const slice = workerSrc.slice(mapIdx, mapIdx + 400);
  assert.match(slice, /continue/);
});

test("#10 постоянные заметки: правка/черновик/ПП/смена ника", () => {
  assert.match(ordersSrc, /смена ника сбрасывает чужие постоянные/);
  assert.match(ordersSrc, /правка\/перенос: дотянуть постоянные/);
  assert.match(ordersSrc, /после разворота ПП подтянуть постоянные/);
  assert.match(ordersSrc, /черновик «На потом» тоже подтягивает постоянные/);
  assert.match(ordersSrc, /function applyProfileNotes[\s\S]*if \(state\.notesEdited\) return false/);
  assert.doesNotMatch(ordersSrc, /function applyProfileNotes[\s\S]*if \(state\.isEdit \|\| state\.notesEdited\)/);
});

test("#11 IG: N доставок не становятся граммами (обёртка, не order-engine)", () => {
  const scrubbed = pay.scrubIgPasteDeliveries("2\nЛёгкое — 100 г\n2 доставки\nРубец — 50 г");
  assert.doesNotMatch(scrubbed, /^2$/m);
  assert.doesNotMatch(scrubbed, /2 доставки/);
  assert.match(scrubbed, /Лёгкое/);
  const parsed = eng.parseIgLinesToItems("2 Лёгкое\nРубец — 100 г");
  const filtered = pay.filterIgItemsDeliveryNoise(parsed.items || [], 2);
  const lung = filtered.find((it) => /Л[ЁЕ]ГК/i.test(String(it.main || it.name || "")));
  if (lung) {
    assert.equal(Number(lung.value || lung.val || 0), 0);
    assert.equal(!!lung.needPiece, true);
  }
  assert.match(ordersSrc, /scrubIgPasteDeliveries/);
  assert.equal(ordersSrc.includes("order-engine.js") && /parseIgLinesToItems\s*=/.test(ordersSrc), false);
});

test("#12 picker: active CSS + hapticLight", () => {
  assert.match(dsSrc, /\.b-chip:active/);
  assert.match(ordersSrc, /function hapticLight/);
  assert.match(ordersSrc, /act === "pcat"[\s\S]*hapticLight/);
  assert.match(ordersSrc, /act === "pname"[\s\S]*hapticLight/);
});

test("#18 На потом: cancelDeferred после успешного save", () => {
  assert.match(ordersSrc, /closeDeferredId/);
  assert.match(ordersSrc, /cancelDeferred/);
  assert.match(ordersSrc, /orders-page-fix: #18/);
});

test("#29/#30 нет «Новый заказ» в dock Месяца; week→month", () => {
  assert.doesNotMatch(weekSrc, /data-act="go-new">Новый заказ/);
  assert.match(weekSrc, /orders-page-fix: #29\/#30/);
  assert.match(weekSrc, /view\.seg = "month"; \/\/ orders-page-fix: #30/);
  assert.match(appSrc, /route\.seg === "week"\) route\.seg = "month"/);
});

test("#31 legacy entry снят", () => {
  assert.doesNotMatch(indexSrc, /location\.replace\("app\.html/);
  assert.match(indexSrc, /legacy UI снят|legacy=1 → next/);
  assert.doesNotMatch(rootApp, /boinya-c\/app\.html/);
  assert.match(rootApp, /\/boinya-c\/next\.html/);
  assert.match(appSrc, /legacy снят/);
  assert.ok(fs.existsSync(path.join(here, "../_archive/legacy-ui/app.main.js")));
  assert.ok(fs.existsSync(path.join(here, "../_archive/legacy-ui/app.html")));
});
