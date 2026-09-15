#!/usr/bin/env node
/**
 * Карта курьера: полный адрес + bias BY/Минск, все стопы дня, split длинного URL.
 * Не бьёт live таблицу.
 */
var fs = require("fs");
var path = require("path");
var CM = require("../boinya-c/courier-maps.js");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL  " + msg);
    process.exitCode = 1;
    return false;
  }
  console.log("ok    " + msg);
  return true;
}

var messy = "улица Академика Карского, 15 · п.Под 2 · эт.6 · кв.94";
var parsed = CM.parseStreetHouse(messy);
assert(parsed.house === "15", "п.Под 2 не становится домом: house=" + parsed.house);
assert(/карского/i.test(parsed.street) && !/,\s*п$/i.test(parsed.street), "улица Карского без хвоста п: " + parsed.street);

var q = CM.geocodeQueryForMaps(messy);
assert(/^Беларусь,\s*Минск,/i.test(q), "bias Беларусь, Минск: " + q);
assert(!/под/i.test(q), "без подъезда в геокод-запросе: " + q);
assert(!/кв/i.test(q), "без квартиры в геокод-запросе: " + q);
assert(/15/.test(q), "дом 15 в запросе: " + q);

var borisov = CM.geocodeQueryForMaps("Борисов, ул. Гагарина 8");
assert(/Беларусь/i.test(borisov) && /Борисов/i.test(borisov), "другой город + Беларусь: " + borisov);
assert(!/Минск/i.test(borisov), "Борисов не форсирует Минск: " + borisov);

var rtext = CM.pointToYandexRtext({
  lat: 53.9140778,
  lon: 27.4429222,
  address: "Минск, улица Матусевича, 67",
  name: "daidabra"
});
assert(rtext === "53.9140778,27.4429222", "rtext = координаты, не текст и не ник: " + rtext);

var noGeo = CM.pointToYandexRtext({ address: "Матусевича 67", name: "daidabra" });
assert(/^Беларусь, Минск,/.test(noGeo) && /Матусевича/.test(noGeo), "fallback текст с bias: " + noGeo);
assert(noGeo.indexOf("daidabra") < 0, "ник не идёт в геокод");

var clients = [
  { name: "a", address: "Карского 15", delivered: true },
  { name: "b", address: "Матусевича 67", delivered: false },
  { name: "c", address: "   ", delivered: false },
  { name: "d", address: "", delivered: false },
  { name: "e" }
];
var day = CM.collectDayMapClients(clients);
assert(day.length === 2, "все с непустым address, включая delivered: " + day.length);
assert(day.some(function (c) { return c.delivered; }), "доставленный не отфильтрован");
assert(day.every(function (c) { return c.address.trim(); }), "пустые адреса отброшены");

var coords = [];
for (var i = 0; i < 16; i++) {
  coords.push({ lat: 53.9 + i * 0.001, lon: 27.5 + i * 0.001, address: "стоп " + i, label: "c" + i });
}
var coordUrl = CM.buildYandexRouteUrl(coords);
assert(coordUrl.length < CM.YANDEX_URL_SOFT_MAX, "16 координат влезают в URL: " + coordUrl.length);
var coordChunks = CM.splitRouteChunks(coords);
assert(coordChunks.length === 1, "16 координат — одна часть, не truncate: " + coordChunks.length);
assert(coordChunks[0].length === 16, "все 16 стопов в части: " + coordChunks[0].length);

var longText = [];
for (var j = 0; j < 15; j++) {
  longText.push({
    address: "улица Академика Купревича дом " + (10 + j) + " корпус 2",
    label: "клиент_" + j
  });
}
var longUrl = CM.buildYandexRouteUrl(longText);
assert(longUrl.length > CM.YANDEX_URL_SOFT_MAX, "15 кириллических адресов длиннее лимита: " + longUrl.length);
var textChunks = CM.splitRouteChunks(longText);
assert(textChunks.length >= 2, "длинный URL режется на части: " + textChunks.length);
var covered = 0;
textChunks.forEach(function (ch) {
  assert(CM.buildYandexRouteUrl(ch).length <= CM.YANDEX_URL_SOFT_MAX + 80, "часть не длиннее лимита: " + CM.buildYandexRouteUrl(ch).length);
  covered += ch.length;
});
assert(covered >= 15, "после split покрыты все стопы (с overlap): " + covered);

var ui = fs.readFileSync(path.join(__dirname, "../boinya-c/app.main.js"), "utf8");
var html = fs.readFileSync(path.join(__dirname, "../boinya-c/app.html"), "utf8");
assert(ui.indexOf("courier-maps-by-h1") >= 0, "marker в app.main.js");
assert(html.indexOf("openYandexMaps()") >= 0, "кнопка все адреса дня");
assert(html.indexOf("courier-maps.js") >= 0, "подключён courier-maps.js");
assert(ui.indexOf("if (!method && outside) method = \"euro\"") < 0, "карта/маршрут не подменяет дом Европочтой из-за кривого геокода");
assert(ui.indexOf("openCourierClientMap_") >= 0, "карта на карточке клиента");
assert(ui.indexOf("limit=5&countrycodes=by&accept-language=ru") >= 0, "Nominatim BY + ru + limit>1");

if (process.exitCode) {
  console.error("courier-maps tests failed");
  process.exit(1);
}
console.log("courier-maps tests passed");
