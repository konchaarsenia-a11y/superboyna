/* t747 basket-canon: одно чтение/нормализация граммов для ПП/БП/Р/партнёров/будущих типов.
 * Канон Бойни: val + value. Varka (@GOODBOY_LG) на проводе пишет qty — см. VAROK.md.
 * Неизвестный ключ количества не молчит нулём: warn + _amountWarn. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoinyaBasketAmount = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ALT_KEYS = ["grams", "amount", "quantity", "count", "n"];

  function logWarn_(g, info) {
    try {
      var name = g && (g.name || g.main || g.id) || "?";
      var msg = "[basket-amount] " + name + " " + (info && info.warn ? info.warn : "unknown");
      if (typeof console !== "undefined" && console.warn) console.warn(msg, info || {});
    } catch (e) {}
  }

  function rawPick(g) {
    if (!g || typeof g !== "object") return { raw: null, key: null, warn: null };
    if (g.val != null && g.val !== "") return { raw: g.val, key: "val", warn: null };
    if (g.value != null && g.value !== "") return { raw: g.value, key: "value", warn: null };
    if (g.qty != null && g.qty !== "") return { raw: g.qty, key: "qty", warn: null };
    var i;
    for (i = 0; i < ALT_KEYS.length; i++) {
      var k = ALT_KEYS[i];
      if (g[k] != null && g[k] !== "") {
        return { raw: g[k], key: k, warn: "alt_key:" + k };
      }
    }
    return { raw: null, key: null, warn: null };
  }

  /** Сырое количество (как в данных). null если поля нет. */
  function itemAmount(g) {
    var p = rawPick(g);
    if (p.warn) logWarn_(g, p);
    return p.raw;
  }

  function itemAmountNumber(g) {
    var n = Number(itemAmount(g));
    return isFinite(n) ? n : 0;
  }

  /**
   * Канон: всегда val + value. qty/альтернативы сохраняем, не стираем.
   * Нечисловое ненулевое поле → warn, val/value не выдумываем.
   */
  function normalizeItem(g) {
    if (!g || typeof g !== "object") return g;
    var p = rawPick(g);
    if (p.raw == null || p.raw === "") return g;
    var n = Number(p.raw);
    if (!isFinite(n)) {
      logWarn_(g, { warn: "non_numeric:" + (p.key || "?"), raw: p.raw });
      var bad = Object.assign({}, g);
      bad._amountWarn = "non_numeric:" + (p.key || "?");
      return bad;
    }
    var out = Object.assign({}, g);
    out.val = n;
    out.value = n;
    if (p.warn) {
      out._amountWarn = p.warn;
      logWarn_(g, p);
    }
    return out;
  }

  function normalizeBasket(basket) {
    if (!Array.isArray(basket)) return [];
    return basket.map(normalizeItem);
  }

  /** Позиция с количеством > 0 должна оставлять это число в HTML/тексте экрана. */
  function displayShowsAmount(g, htmlOrText) {
    var n = itemAmountNumber(g);
    if (!(n > 0)) return true;
    var s = String(htmlOrText || "");
    if (!s) return false;
    if (s.indexOf(String(n)) >= 0) return true;
    var rounded = Math.round(n);
    if (rounded !== n && s.indexOf(String(rounded)) >= 0) return true;
    return false;
  }

  function assertBasketDisplay(basket, linesHtml, label) {
    var html = String(linesHtml || "");
    var bad = [];
    (basket || []).forEach(function (g, i) {
      if (!displayShowsAmount(g, html)) {
        bad.push({
          i: i,
          name: (g && (g.name || g.main)) || "",
          amount: itemAmount(g),
          label: label || ""
        });
      }
    });
    return bad;
  }

  return {
    itemAmount: itemAmount,
    itemAmountNumber: itemAmountNumber,
    normalizeItem: normalizeItem,
    normalizeBasket: normalizeBasket,
    displayShowsAmount: displayShowsAmount,
    assertBasketDisplay: assertBasketDisplay,
    rawPick: rawPick
  };
});
