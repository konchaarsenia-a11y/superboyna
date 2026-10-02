/* Добавленные владельцем позиции прайса. Каталог заказа читает тот же список. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BoinyaPriceExtras = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CATS = {
    dressura: "Дрессура",
    chew: "Жевалки",
    other: "Другое",
    veg: "Овощи/Фрукты"
  };

  var list = [];
  var ready = false;

  function normName_(raw) {
    return String(raw || "").replace(/ё/g, "е").replace(/Ё/g, "Е").replace(/\s+/g, " ").trim().toUpperCase();
  }

  function normFractions_(raw) {
    var src = raw;
    if (typeof raw === "string") src = raw.split(/[,;]+/);
    var out = [];
    var seen = {};
    var i;
    for (i = 0; i < (src || []).length; i++) {
      var one = String(src[i] || "").replace(/\s+/g, " ").trim();
      if (!one) continue;
      var key = one.toUpperCase();
      if (seen[key]) continue;
      seen[key] = true;
      out.push(one);
    }
    return out;
  }

  function normUnit_(raw) {
    var u = String(raw || "").toLowerCase().replace(/\./g, "").trim();
    if (u === "шт" || u === "штук" || u === "штука" || u === "piece" || u === "perpiece") return "шт";
    if (u === "гр" || u === "г" || u === "грамм" || u === "per100") return "гр";
    return "";
  }

  function normalizePricePosition_(input) {
    input = input || {};
    var name = normName_(input.name);
    var cat = String(input.cat || input.category || "").toLowerCase().trim();
    var fractions = normFractions_(input.fractions != null ? input.fractions : input.fraction);
    var unit = normUnit_(input.unit);
    var price = Number(String(input.price != null ? input.price : "").replace(",", "."));
    if (!name || name.length < 2) return { ok: false, message: "Укажите название" };
    if (name.length > 40) return { ok: false, message: "Название длиннее 40 знаков" };
    if (!CATS[cat]) return { ok: false, message: "Выберите категорию" };
    if (!unit) return { ok: false, message: "Выберите единицу: гр или шт" };
    if (!isFinite(price) || price <= 0) return { ok: false, message: "Укажите цену" };
    if (cat === "chew" && unit !== "шт") unit = "шт";
    if (cat === "veg" && unit !== "гр") unit = "гр";
    return {
      ok: true,
      position: {
        name: name,
        cat: cat,
        catLabel: CATS[cat],
        fractions: fractions,
        price: Math.round(price * 100) / 100,
        unit: unit
      }
    };
  }

  function priceKeys_(pos) {
    var fr = pos.fractions || [];
    if (!fr.length) return [pos.name];
    return fr.map(function (f) { return pos.name + "|" + f; });
  }

  function retailItemsFor_(pos) {
    var kind = pos.unit === "шт" ? "perPiece" : "per100";
    return priceKeys_(pos).map(function (key) {
      return { key: key, kind: kind, price: pos.price, extra: true };
    });
  }

  function mergeRetailItems_(base, positions) {
    var out = (base || []).slice();
    var have = {};
    var i;
    for (i = 0; i < out.length; i++) if (out[i] && out[i].key) have[out[i].key] = true;
    for (i = 0; i < (positions || []).length; i++) {
      var rows = retailItemsFor_(positions[i]);
      var r;
      for (r = 0; r < rows.length; r++) {
        if (have[rows[r].key]) continue;
        have[rows[r].key] = true;
        out.push(rows[r]);
      }
    }
    return out;
  }

  function remember_(positions) {
    list = (positions || []).slice();
    ready = true;
    return list;
  }

  function installCatalog_(eng) {
    if (!eng || !eng.catalog) return;
    var i;
    for (i = 0; i < list.length; i++) {
      var pos = list[i];
      var cat = eng.catalog[pos.cat];
      if (!cat || !cat.items) continue;
      if (cat.items.indexOf(pos.name) < 0) cat.items.push(pos.name);
      if (!cat.fractions) cat.fractions = {};
      if (pos.fractions && pos.fractions.length) cat.fractions[pos.name] = pos.fractions.slice();
    }
  }

  function find_(name) {
    var want = normName_(name);
    var i;
    for (i = 0; i < list.length; i++) if (list[i].name === want) return list[i];
    return null;
  }

  function unitFor_(cat, name) {
    var pos = find_(name);
    if (!pos || pos.cat !== cat) return "";
    return pos.unit;
  }

  function fractionsFor_(cat, name) {
    var pos = find_(name);
    if (!pos || pos.cat !== cat || !(pos.fractions && pos.fractions.length)) return null;
    return pos.fractions.slice();
  }

  function namesFor_(cat) {
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) if (list[i].cat === cat) out.push(list[i].name);
    return out;
  }

  return {
    CATS: CATS,
    normalizePricePosition_: normalizePricePosition_,
    mergeRetailItems_: mergeRetailItems_,
    retailItemsFor_: retailItemsFor_,
    remember_: remember_,
    installCatalog_: installCatalog_,
    unitFor_: unitFor_,
    fractionsFor_: fractionsFor_,
    namesFor_: namesFor_,
    list_: function () { return list.slice(); },
    ready_: function () { return ready; }
  };
});
