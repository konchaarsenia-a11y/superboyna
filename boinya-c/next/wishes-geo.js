/* Служебные координаты не живут в пожеланиях. marker wishes-geo-h1 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BoinyaWishesGeo = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function num(v) {
    var n = Number(String(v == null ? "" : v).replace(",", "."));
    return isFinite(n) ? n : NaN;
  }

  function inBy(lat, lon) {
    return lat >= 51.2 && lat <= 56.3 && lon >= 23.1 && lon <= 32.9;
  }

  function mapUrl(lat, lon) {
    return "https://yandex.ru/maps/?pt=" + lon + "," + lat + "&z=17&l=map";
  }

  function asGeo(lat, lon, yandexUrl) {
    if (!isFinite(lat) || !isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return {
      lat: lat,
      lon: lon,
      yandexUrl: yandexUrl || mapUrl(lat, lon)
    };
  }

  /** Явный тег: lat,lon. Если пара перевёрнута и так ложится на Беларусь, разворачиваем. */
  function takeTagged(a, b) {
    if (inBy(b, a) && !inBy(a, b)) return asGeo(b, a);
    return asGeo(a, b);
  }

  function takeLoose(a, b) {
    if (inBy(a, b)) return asGeo(a, b);
    if (inBy(b, a)) return asGeo(b, a);
    return null;
  }

  function tidy(s) {
    return String(s || "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function geoFromYandexUrl(url) {
    var m = String(url || "").match(/[?&#]pt=([+-]?\d+(?:[.,]\d+)?)\s*,\s*([+-]?\d+(?:[.,]\d+)?)/i);
    if (!m) return null;
    return takeTagged(num(m[2]), num(m[1]));
  }

  /**
   * Снимает только служебные координаты: [GEO:], [YMAPS:], ссылку Яндекс с pt=
   * и отдельную пару десятичных в bbox Беларуси (4+ знака). Текст сотрудника остаётся.
   * [COEF:] [SCHEME:] [DOG:] и прочие теги карточки не трогает.
   */
  function peel(text) {
    var geos = [];
    var s = String(text || "");
    s = s.replace(/\[GEO:\s*([+-]?\d+(?:[.,]\d+)?)\s*,\s*([+-]?\d+(?:[.,]\d+)?)\s*\]/gi, function (_m, a, b) {
      var g = takeTagged(num(a), num(b));
      if (g) geos.push(g);
      return " ";
    });
    s = s.replace(/\[YMAPS:\s*(https?:\/\/[^\]]+)\]/gi, function (_m, url) {
      var g = geoFromYandexUrl(url);
      if (g) geos.push(g);
      return " ";
    });
    s = s.replace(/https?:\/\/(?:www\.)?(?:yandex\.(?:ru|by|com)|maps\.yandex\.\w+)\/\S*?[?&#]pt=[+-]?\d+(?:[.,]\d+)?\s*,\s*[+-]?\d+(?:[.,]\d+)?\S*/gi, function (url) {
      var g = geoFromYandexUrl(url);
      if (g) geos.push(g);
      return " ";
    });
    s = s.replace(/(^|[^\d.])([+-]?\d{2}\.\d{4,})\s*[,;]\s*([+-]?\d{2}\.\d{4,})(?![.\d])/g, function (m, pre, a, b) {
      var g = takeLoose(num(a), num(b));
      if (!g) return m;
      geos.push(g);
      return pre + " ";
    });
    return { text: tidy(s), geo: geos[0] || null, geos: geos };
  }

  return {
    peel: peel,
    inBy: inBy,
    mapUrl: mapUrl
  };
});
