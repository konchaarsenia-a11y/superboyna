/* Бойня next — расчёт заказа 1:1 из boinya-c/app.main.js.
   Не править вручную: node boinya-c/next/extract-engine.mjs
   Цифры и сериализация корзины те же, что в старой форме. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoinyaOrderEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var window = (typeof globalThis !== "undefined" && globalThis.window) ? globalThis.window : globalThis;
  var orderType = "pp";
  var basket = [];
  var orderBaskets = { 1: [], 2: [] };
  var orderActiveDog = 1;
  var orderDogCount = 1;
  var orderNotes = [];
  var ppDeliverySlotManual = null;
  var ppDeliveriesN = 0;
  var ppNeedManualSlot = false;
  var retailPaidDelivery = false;
  var retailPriceManual = false;

    var CRUMB_FRAC_LABEL_ = "Крошка";
    var CATALOG_CRUMB_PARENTS_ = {
      "КРОШКА ЛЁГКОГО": "ЛЁГКОЕ",
      "КРОШКА ПОЧЕК": "ПОЧКИ",
      "КРОШКА РУБЕЦ": "РУБЕЦ Т",
      "КРОШКА СЕРДЦА": "СЕРДЦЕ",
      "КРОШКА МИКС": ""
    };

    var CATALOG_CRUMB_PARENTS_ = {
      "КРОШКА ЛЁГКОГО": "ЛЁГКОЕ",
      "КРОШКА ПОЧЕК": "ПОЧКИ",
      "КРОШКА РУБЕЦ": "РУБЕЦ Т",
      "КРОШКА СЕРДЦА": "СЕРДЦЕ",
      "КРОШКА МИКС": ""
    };

    const catalog = {
      dressura: {
        title: "Дрессура",
        items: ["ЛЁГКОЕ", "СЕРДЦЕ", "РУБЕЦ Т", "БАРАНЬЕ ЛЁГКОЕ", "ПОЧКИ"],
        fractions: {
          "ЛЁГКОЕ": ["Ломтики", "Полоски", "Крупное", "Среднее", "Мелкое", "Очень мелкое"],
          "СЕРДЦЕ": ["Ломтики", "Полоски", "Мелкое", "Очень мелкое"],
          "РУБЕЦ Т": ["Ломтики", "Полоски", "Крупное", "Среднее", "Мелкое", "Очень мелкое"],
          "БАРАНЬЕ ЛЁГКОЕ": ["Ломтики", "Полоски", "Крупное", "Среднее", "Мелкое", "Очень мелкое"],
          "ПОЧКИ": ["Ломтики", "Мелкое", "Очень мелкое"]
        }
      },
      chew: {
        title: "Жевалки",
        items: ["БЫЧИЙ КОРЕНЬ", "ТРАХЕЯ", "АОРТА", "УХО Г", "УХО К", "НОСЫ шт.", "СТАНОВАЯ ЖИЛА", "КОЛЕНИ шт.", "ПЕРЕПЁЛКИ шт.", "ЛОП ХРЯЩ шт.", "УТИНЫЕ ШЕИ шт.", "ГУБЫ шт."],
        fractions: {
          "БЫЧИЙ КОРЕНЬ": ["ОЧ МАЛ", "МАЛ", "СРЕД", "БОЛ", "ОГР"],
          "ТРАХЕЯ": ["МАЛ", "ПЛАСТ", "СРЕД", "БОЛ", "ОГР"],
          "СТАНОВАЯ ЖИЛА": ["ПАЛК", "СРЕД", "БОЛ"],
          "УХО Г": ["ПОЛОВИНКА", "Обычное"],
          "УХО К": ["ПОЛОВИНКА", "Обычное"],
          "АОРТА": ["ПОЛОВИНКА", "Обычная"]
        }
      },
      other: {
        title: "Другое",
        items: ["ПЕЧЕНЬ", "БАРАНЬЯ ПЕЧЕНЬ", "ИНДЕЙКА", "КРОЛИК", "МЯСНЫЕ ЛОМТИКИ", "ВЫМЯ", "СЕМЕННИКИ"],
        fractions: {
          "ИНДЕЙКА": ["Ломтики", "Полоски", "Мелкое"],
          "БАРАНЬЯ ПЕЧЕНЬ": ["Ломтики", "Полоски", "Мелкое"]
        }
      },
      powder: {
        title: "Присыпки",
        items: [],
        fractions: {}
      },
      veg: {
        title: "Овощи/Фрукты",
        items: ["БАНАНЫ", "ЯБЛОКИ", "ГРУШЫ", "МОРКОВЬ", "ТЫКВА", "БАТАТ", "КАБАЧОК"],
        fractions: {}
      },
      crumb: {
        title: "Крошки",
        items: [],
        fractions: {}
      }
    };

    var RETAIL_REMOVED_NAMES = {
      "СВЕТЛЫЙ РУБЕЦ": 1,
      "КНИЖКА": 1,
      "ПИКАЛЬНОЕ МЯСО": 1,
      "КОПЫТО шт.": 1,
      "ГУБЫ шт.": 1,
      "КЛУБНИКА": 1,
      "СВЕКЛА": 1,
      "КРОШКА ЛЁГКОГО": 1,
      "КРОШКА ПОЧЕК": 1,
      "КРОШКА РУБЕЦ": 1
    };

    var PRICE_RETAIL_DELIVERY_BYN = 9;
    var PRICE_RETAIL_FREE_FROM = 80;

    var RETAIL_PRICE = {

      "ЛЁГКОЕ|Ломтики": { per100: 9 },
      "ЛЁГКОЕ|Целое": { per100: 9 },
      "ЛЁГКОЕ|Полоски": { per100: 10 },
      "ЛЁГКОЕ|Крупное": { per100: 10 },
      "ЛЁГКОЕ|Большое": { per100: 10 },
      "ЛЁГКОЕ|Среднее": { per100: 11 },
      "ЛЁГКОЕ|Мелкое": { per100: 12 },
      "ЛЁГКОЕ|Очень мелкое": { per100: 13 },
      "СЕРДЦЕ|Ломтики": { per100: 12 },
      "СЕРДЦЕ|Целое": { per100: 12 },
      "СЕРДЦЕ|Полоски": { per100: 13 },
      "СЕРДЦЕ|Мелкое": { per100: 15 },
      "СЕРДЦЕ|Очень мелкое": { per100: 16 },
      "ПОЧКИ|Ломтики": { per100: 11 },
      "ПОЧКИ|Целое": { per100: 11 },
      "ПОЧКИ|Мелкое": { per100: 14 },
      "ПОЧКИ|Очень мелкое": { per100: 15 },
      "РУБЕЦ Т|Ломтики": { per100: 10 },
      "РУБЕЦ Т|Целое": { per100: 10 },
      "РУБЕЦ Т|Полоски": { per100: 11 },
      "РУБЕЦ Т|Крупное": { per100: 11 },
      "РУБЕЦ Т|Большое": { per100: 11 },
      "РУБЕЦ Т|Среднее": { per100: 12 },
      "РУБЕЦ Т|Мелкое": { per100: 13 },
      "РУБЕЦ Т|Очень мелкое": { per100: 14 },
      "БАРАНЬЕ ЛЁГКОЕ|Ломтики": { per100: 16 },
      "БАРАНЬЕ ЛЁГКОЕ|Целое": { per100: 16 },
      "БАРАНЬЕ ЛЁГКОЕ|Полоски": { per100: 17 },
      "БАРАНЬЕ ЛЁГКОЕ|Крупное": { per100: 17 },
      "БАРАНЬЕ ЛЁГКОЕ|Большое": { per100: 17 },
      "БАРАНЬЕ ЛЁГКОЕ|Среднее": { per100: 18 },
      "БАРАНЬЕ ЛЁГКОЕ|Мелкое": { per100: 19 },
      "БАРАНЬЕ ЛЁГКОЕ|Очень мелкое": { per100: 20 },
      "ИНДЕЙКА": { per100: 18 },
      "ИНДЕЙКА|Ломтики": { per100: 18 },
      "ИНДЕЙКА|Полоски": { per100: 19 },
      "ИНДЕЙКА|Кусочки": { per100: 19 },
      "ИНДЕЙКА|Мелкое": { per100: 21 },
      "ИНДЕЙКА|Мелкие кусочки": { per100: 21 },
      "БАРАНЬЯ ПЕЧЕНЬ": { per100: 16 },
      "БАРАНЬЯ ПЕЧЕНЬ|Ломтики": { per100: 16 },
      "БАРАНЬЯ ПЕЧЕНЬ|Полоски": { per100: 17 },
      "БАРАНЬЯ ПЕЧЕНЬ|Мелкое": { per100: 19 },
      "ПЕЧЕНЬ": { per100: 11 },
      "ВЫМЯ": { per100: 10 },
      "СЕМЕННИКИ": { per100: 13 },
      "МЯСНЫЕ ЛОМТИКИ": { per100: 16 },
      "КРОШКА ЛЁГКОГО": { per100: 11 },
      "КРОШКА ПОЧЕК": { per100: 11 },
      "КРОШКА РУБЕЦ": { per100: 12 },
      "БЫЧИЙ КОРЕНЬ|ОЧ МАЛ": { perPiece: 6 },
      "БЫЧИЙ КОРЕНЬ|МАЛ": { perPiece: 7 },
      "БЫЧИЙ КОРЕНЬ|СРЕД": { perPiece: 12 },
      "БЫЧИЙ КОРЕНЬ|БОЛ": { perPiece: 20 },
      "БЫЧИЙ КОРЕНЬ|ОГР": { perPiece: 26 },
      "ТРАХЕЯ|МАЛ": { perPiece: 5 },
      "ТРАХЕЯ|СРЕД": { perPiece: 8 },
      "ТРАХЕЯ|БОЛ": { perPiece: 12 },
      "ТРАХЕЯ|ПЛАСТ": { perPiece: 8 },
      "ТРАХЕЯ|ОГР": { perPiece: 14 },
      "СТАНОВАЯ ЖИЛА|СРЕД": { perPiece: 5 },
      "СТАНОВАЯ ЖИЛА|БОЛ": { perPiece: 7 },
      "СТАНОВАЯ ЖИЛА|ПАЛК": { perPiece: 3 },
      "УХО Г|Обычное": { perPiece: 7 },
      "УХО Г|ПОЛОВИНКА": { perPiece: 5 },
      "УХО К|Обычное": { perPiece: 7 },
      "УХО К|ПОЛОВИНКА": { perPiece: 5 },
      "АОРТА|Обычная": { perPiece: 5 },
      "АОРТА|ПОЛОВИНКА": { perPiece: 3 },
      "КОЛЕНИ шт.": { perPiece: 7 },
      "НОСЫ шт.": { perPiece: 8 },
      "ЛОП ХРЯЩ шт.": { perPiece: 5 },
      "УТИНЫЕ ШЕИ шт.": { perPiece: 4 },
      "ПЕРЕПЁЛКИ шт.": { perPiece: 5 },
      "ТЫКВА": { per100: 14 },
      "БАТАТ": { per100: 15 },
      "ГРУШИ": { per100: 13 },
      "БАНАНЫ": { per100: 12 },
      "ЯБЛОКИ": { per100: 11 },
      "МОРКОВЬ": { per100: 11 }
      // без голых ключей ЛЁГКОЕ/АОРТА/… — только фракции (см. stripBareRetailParents_)
    };

    var RETAIL_PRICE_BUILTIN_ = {};
    Object.keys(RETAIL_PRICE).forEach(function (k) {
      RETAIL_PRICE_BUILTIN_[k] = Object.assign({}, RETAIL_PRICE[k]);
    });

    function isPieceSkuName(name) {
      var n = String(name || "");
      if (!n) return false;
      if (/шт/i.test(n)) return true;
      if (/ХРЯЩ|ЛОПАТ|ЛОП\s*ХРЯЩ/i.test(n)) return true;
      if (/КОЛЕН|КОПЫТ|НОСЫ|НОС\b|УХО|УШК|ШЕИ|ШЕЯ|ГУБЫ|ПЕРЕП[ЕЁ]?Л|АОРТ|ТРАХЕ|СТАНОВ|УТИН/i.test(n)) return true;
      if (/БЫЧ.*КОРЕН|КОРЕНЬ/i.test(n)) return true;
      return false;
    }

    function unitForItem(cat, main) {
      if (cat === "chew" || cat === "chews") return "шт";
      if (isPieceSkuName(main)) return "шт";
      return "гр";
    }

    function stripBareRetailParentsMap_(map) {
      map = map || {};
      var hasFrac = Object.create(null);
      Object.keys(map).forEach(function (k) {
        var i = String(k).indexOf("|");
        if (i > 0) hasFrac[String(k).slice(0, i)] = true;
      });
      var out = {};
      Object.keys(map).forEach(function (k) {
        if (String(k).indexOf("|") < 0 && hasFrac[k]) return;
        out[k] = map[k];
      });
      return out;
    }

    function retailDefaultSub_(name) {
      var n = String(name || "").toUpperCase().replace(/Ё/g, "Е");
      if (/АОРТ/.test(n)) return "Обычная";
      if (/УХО|УШК/.test(n)) return "Обычное";
      if (/БЫЧИЙ КОРЕН|ТРАХЕ|СТАНОВ/.test(n)) return "СРЕД";
      if (/БАРАНЬЯ\s*ПЕЧЕН/.test(n)) return "Ломтики";
      if (/БАРАНЬЕ\s*Л[ЕЁ]ГК/.test(n)) return "Ломтики";
      if (/^Л[ЕЁ]ГКОЕ$/.test(n) || n === "ЛЁГКОЕ") return "Ломтики";
      if (/СЕРДЦ/.test(n)) return "Ломтики";
      if (/ПОЧК/.test(n)) return "Мелкое";
      if (/^РУБЕЦ Т$/.test(n) || n === "РУБЕЦ Т") return "Ломтики";
      if (/ИНДЕЙ/.test(n)) return "Ломтики";
      return "";
    }

    function retailLookupKey_(name, sub) {
      var n = String(name || "").toUpperCase().trim().replace(/Ё/g, "Е").replace(/\s+/g, " ");
      var mapN = {
        "ЛЕГКОЕ": "ЛЁГКОЕ",
        "БАРАНЬЕ ЛЕГКОЕ": "БАРАНЬЕ ЛЁГКОЕ",
        "БАРАНЬЯ ПЕЧЕНЬ": "БАРАНЬЯ ПЕЧЕНЬ",
        "КРОШКА ЛЕГКОГО": "КРОШКА ЛЁГКОГО",
        "ПЕРЕПЕЛКИ ШТ.": "ПЕРЕПЁЛКИ шт.",
        "ПЕРЕПЕЛКИ ШТ": "ПЕРЕПЁЛКИ шт.",
        "КАБАЧКИ": "КАБАЧОК",
        "ГРУШЫ": "ГРУШИ",
        "РУБЕЦ С": "СВЕТЛЫЙ РУБЕЦ",
        "УТИНЫЕ ШЕИ": "УТИНЫЕ ШЕИ шт.",
        "УТИНЫЕ ШЕИ ШТ.": "УТИНЫЕ ШЕИ шт.",
        "УТИНЫЕ ШЕИ ШТ": "УТИНЫЕ ШЕИ шт."
      };
      if (mapN[n]) n = mapN[n];
      ["КОПЫТО шт.", "КОЛЕНИ шт.", "НОСЫ шт.", "ЛОП ХРЯЩ шт.", "УТИНЫЕ ШЕИ шт.", "ПЕРЕПЁЛКИ шт.", "ГУБЫ шт."].forEach(function (k) {
        if (n === k.toUpperCase().replace(/Ё/g, "Е") || n === k.toUpperCase().replace(/Ё/g, "Е").replace(/\s*ШТ\.?$/, "")) n = k;
      });
      if (n === "КРОШКА РУБЕЦ" || n.indexOf("КРОШКА РУБ") === 0) n = "КРОШКА РУБЕЦ";
      var s = String(sub || "").trim();
      var su = s.toUpperCase().replace(/Ё/g, "Е");
      if (/БЫЧИЙ КОРЕН|ТРАХЕ|СТАНОВ/.test(n)) {
        if (/ОЧЕНЬ\s*МАЛ|ОЧ\s*МАЛ/.test(su)) s = "ОЧ МАЛ";
        else if (/ОГРОМ|РОГАЛ|ОГР/.test(su)) s = "ОГР";
        else if (/БОЛЬШ|БОЛ/.test(su)) s = "БОЛ";
        else if (/ПАЛОЧ|ПАЛК/.test(su)) s = "ПАЛК";
        else if (/ПЛАСТ/.test(su)) s = "ПЛАСТ";
        else if (/СРЕД/.test(su)) s = "СРЕД";
        else if (/МАЛ/.test(su)) s = "МАЛ";
        else if (!s) s = retailDefaultSub_(n);
      } else if (/УХО|УШК/.test(n)) {
        s = /ПОЛОВИН/.test(su) ? "ПОЛОВИНКА" : "Обычное";
      } else if (/АОРТ/.test(n)) {
        s = /ПОЛОВИН/.test(su) ? "ПОЛОВИНКА" : "Обычная";
      } else if (s) {
        if (/^КРОШК/.test(su)) s = "Крошка";
        else if (/ОЧЕНЬ\s*МЕЛК|^ОЧ\s*МЕЛК/.test(su)) s = "Очень мелкое";
        else if (/МЕЛК[А-ЯA-Z]*\s*КУСОЧ|КУСОЧ[А-ЯA-Z]*\s*МЕЛК/.test(su)) s = "Мелкое";
        else if (/^ПОЛОСК/.test(su)) s = "Полоски";
        else if (/^КУСОЧК/.test(su)) s = "Полоски";
        else if (/^ЛОМТИК/.test(su) || su === "ЛОМТ") s = "Ломтики";
        else if (/^ЦЕЛ/.test(su)) s = "Ломтики";
        else if (/^КРУП/.test(su) || /^БОЛЬ/.test(su)) s = "Крупное";
        else if (/^СРЕД/.test(su) || (/КУБИК/.test(su) && !/МЕЛК|КРУП/.test(su))) s = "Среднее";
        else if (/^МЕЛК|^МАЛ/.test(su) && !/^ОЧ/.test(su)) s = "Мелкое";
      } else {
        s = retailDefaultSub_(n);
      }
      return { name: n, sub: s, key: n + (s ? "|" + s : "") };
    }

    function retailBasePer100_(n) {
      var keys = [n + "|Ломтики", n + "|Целое", n];
      for (var i = 0; i < keys.length; i++) {
        var info = RETAIL_PRICE[keys[i]];
        if (info && info.per100 != null && isFinite(Number(info.per100))) return Number(info.per100);
      }
      return null;
    }

    function retailAliasPriceKeys_(name, sub) {
      var keys = [];
      if (sub === "Ломтики") keys.push(name + "|Целое");
      if (sub === "Крупное") keys.push(name + "|Большое");
      if (sub === "Полоски") keys.push(name + "|Кусочки");
      if (sub === "Мелкое") keys.push(name + "|Мелкие кусочки");
      return keys;
    }

    function retailSkuLineCost_(name, sub, val, cat) {
      var meta = retailLookupKey_(name, sub);
      var info = RETAIL_PRICE[meta.key] || RETAIL_PRICE[meta.name];
      if (!info) {
        var aliases = retailAliasPriceKeys_(meta.name, meta.sub);
        for (var ai = 0; ai < aliases.length; ai++) {
          if (RETAIL_PRICE[aliases[ai]]) { info = RETAIL_PRICE[aliases[ai]]; break; }
        }
      }
      var v = Number(val) || 0;
      var chew = cat === "chew" || cat === "chews";
      if ((!info || info.per100 == null) && !chew) {
        var size = dressuraFractionSizeKey(meta.sub);
        var rate = size ? Number(dressuraFractionRates()[size]) : NaN;
        var base = retailBasePer100_(meta.name);
        if (size && isFinite(rate) && base != null) info = { per100: base + rate };
      }
      if (!info || v <= 0) return { cost: 0, per: 0, found: !!info };
      if (info.packs) {
        var g = Math.round(v);
        if (info.packs[g] != null) return { cost: info.packs[g], per: info.packs[g], found: true, pack: g };
        var p100 = info.packs[100] != null ? info.packs[100] : info.per100;
        var c = (p100 || 0) * (v / 100);
        return { cost: Math.round(c * 100) / 100, per: p100 || 0, found: true };
      }
      if (info.perPiece != null || cat === "chew" || /шт/i.test(meta.name)) {
        var pp = info.perPiece != null ? info.perPiece : 0;
        return { cost: Math.round(pp * v * 100) / 100, per: pp, found: true };
      }
      var p = info.per100 || 0;
      var cost = (v / 100) * p;
      return { cost: Math.round(cost * 100) / 100, per: p, found: true };
    }

    function isCrumbBasketItemUi_(item) {
      if (!item) return false;
      if (String(item.cat || "").toLowerCase() === "crumb" || item.crumbKind) return true;
      if (Array.isArray(item.sources) && item.sources.length > 0) return true;
      var nm = String(item.name || item.main || "").trim();
      return /^крошка$/i.test(nm) && !/шт/i.test(nm);
    }

    function isRetailCrumbItem_(it, cat, extra) {
      extra = extra || {};
      if (it && typeof isCrumbBasketItemUi_ === "function" && isCrumbBasketItemUi_(it)) return true;
      if (String(cat || "").toLowerCase() === "crumb" || extra.crumbKind) return true;
      if (extra.sources && extra.sources.length) return true;
      var name = String((it && (it.name || it.main)) || extra.name || "") || "";
      return /^крошка$/i.test(String(name || "").trim()) && !/шт/i.test(name);
    }

    function retailLineCost(name, sub, val, cat, extra) {
      extra = extra || {};
      var crumbIt = {
        name: name,
        main: extra.main || name,
        sub: sub,
        cat: cat,
        crumbKind: extra.crumbKind,
        sources: extra.sources,
        ratio: extra.ratio
      };
      if (isRetailCrumbItem_(crumbIt, cat, extra)) {
        var crumbCost = retailGoodsFromCrumbItemUi_(crumbIt, val);
        if (crumbCost > 0) {
          var cv = Number(val) || 0;
          return {
            cost: crumbCost,
            per: cv ? Math.round((crumbCost / (cv / 100)) * 100) / 100 : 0,
            found: true
          };
        }
      }
      return retailSkuLineCost_(name, sub, val, cat);
    }

    function crumbParentFromName_(name) {
      var n = String(name || "").trim().toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ");
      if (!n) return "";
      if (CATALOG_CRUMB_PARENTS_[n]) return CATALOG_CRUMB_PARENTS_[n];
      if (CATALOG_CRUMB_PARENTS_[String(name || "").trim()]) return CATALOG_CRUMB_PARENTS_[String(name || "").trim()];
      if (/^КРОШКА/.test(n)) {
        if (/ЛЕГК/.test(n)) return "ЛЁГКОЕ";
        if (/ПОЧ/.test(n)) return "ПОЧКИ";
        if (/РУБ/.test(n)) return "РУБЕЦ Т";
        if (/СЕРДЦ/.test(n)) return "СЕРДЦЕ";
      }
      return "";
    }

    function isCrumbFraction_(sub) {
      return /^КРОШК/i.test(String(sub || "").trim());
    }

    function calcRetailBasketTotal(list, opts) {
      opts = opts || {};
      var lines = [];
      var goods = 0;
      (list || []).forEach(function (it) {
        var name = it.name || it.main || "";
        var sub = it.sub || "";
        var val = it.val != null ? it.val : it.value;
        var r = retailLineCost(it.name || it.main, it.sub || "", val, it.cat, {
          crumbKind: it.crumbKind,
          sources: it.sources,
          ratio: it.ratio,
          main: it.main
        });
        goods += r.cost;
        lines.push({ name: name, sub: sub, val: Number(val) || 0, per100: r.per, cost: r.cost, found: r.found });
      });
      goods = Math.round(goods * 100) / 100;
      var deliveriesN = Math.max(1, Number(opts.deliveriesN) || 1);
      var applyDelivery = opts.applyDelivery !== false;
      var perDelivery = goods / deliveriesN;
      var deliveryTimes = 0;

      if (applyDelivery && goods > 0) {
        for (var di = 0; di < deliveriesN; di++) {
          if (perDelivery < PRICE_RETAIL_FREE_FROM) deliveryTimes++;
        }
      }
      var delivery = Math.round(deliveryTimes * PRICE_RETAIL_DELIVERY_BYN * 100) / 100;
      var total = Math.round((goods + delivery) * 100) / 100;
      return {
        total: total,
        goods: goods,
        delivery: delivery,
        deliveryTimes: deliveryTimes,
        perDelivery: Math.round(perDelivery * 100) / 100,
        deliveriesN: deliveriesN,
        freeFrom: PRICE_RETAIL_FREE_FROM,
        deliveryFee: PRICE_RETAIL_DELIVERY_BYN,
        lines: lines,
        markup: 1,
        sheet: "розница 2026-08-30"
      };
    }

    function fillMissingRetailFractionPrices_() {
      ["dressura", "other"].forEach(function (catKey) {
        var cat = catalog[catKey] || {};
        (cat.items || []).forEach(function (name) {
          var fracs = (cat.fractions && cat.fractions[name]) ? cat.fractions[name] : [];
          fracs.forEach(function (f) {
            var meta = retailLookupKey_(name, f);
            if (RETAIL_PRICE[meta.key]) return;
            var size = dressuraFractionSizeKey(meta.sub || f);
            var rate = size ? Number(dressuraFractionRates()[size]) : NaN;
            var base = retailBasePer100_(meta.name);
            if (size && isFinite(rate) && base != null) {
              RETAIL_PRICE[meta.key] = { per100: base + rate };
            }
          });
        });
      });
      var builtin = (typeof RETAIL_PRICE_BUILTIN_ !== "undefined" && RETAIL_PRICE_BUILTIN_) || {};
      Object.keys(builtin).forEach(function (k) {
        if (!RETAIL_PRICE[k]) RETAIL_PRICE[k] = Object.assign({}, builtin[k]);
      });
    }

    function applyRetailPriceMapToUi_(items, delivery) {
      var next = {};
      (items || []).forEach(function (it) {
        if (!it || !it.key) return;
        var kind = String(it.kind || "per100").toLowerCase();
        var price = Number(it.price);
        if (!isFinite(price) || price < 0) return;
        if (kind === "perpiece" || kind === "piece" || kind === "шт") next[it.key] = { perPiece: price };
        else if (kind === "pack" || kind === "packs") next[it.key] = { per100: price, packs: { 100: price } };
        else next[it.key] = { per100: price };
      });
      next = stripBareRetailParentsMap_(next);
      if (Object.keys(next).length) {
        Object.keys(RETAIL_PRICE).forEach(function (k) { delete RETAIL_PRICE[k]; });
        Object.keys(next).forEach(function (k) { RETAIL_PRICE[k] = next[k]; });
      }
      fillMissingRetailFractionPrices_();
      // УХО К зеркалит УХО Г, если сервер ещё без позиции
      ["Обычное", "ПОЛОВИНКА"].forEach(function (sub) {
        var gk = "УХО Г|" + sub;
        var kk = "УХО К|" + sub;
        if (RETAIL_PRICE[gk] && !RETAIL_PRICE[kk]) {
          RETAIL_PRICE[kk] = Object.assign({}, RETAIL_PRICE[gk]);
        }
      });
      if (delivery) {
        if (delivery.fee != null && isFinite(Number(delivery.fee))) PRICE_RETAIL_DELIVERY_BYN = Number(delivery.fee);
        if (delivery.freeFrom != null && isFinite(Number(delivery.freeFrom))) PRICE_RETAIL_FREE_FROM = Number(delivery.freeFrom);
      }
    }

    function catalogItemsForUi_(catKey) {
      if (catKey === "powder") return [];
      var cat = catalog[catKey] || {};
      var items = cat.items || [];
      if (orderType !== "retail") return items.slice();
      return items.filter(function (n) { return !RETAIL_REMOVED_NAMES[n]; });
    }

    function catalogNativeFractions_(catKey, name) {
      var cat = catalog[catKey] || {};
      return (cat.fractions && cat.fractions[name]) ? cat.fractions[name].slice() : [];
    }

    function catalogFracRequired_(catKey, name) {
      return catalogNativeFractions_(catKey, name).length > 0;
    }

    function catalogFractionsForUi_(catKey, name) {
      if (catKey === "powder" || !name) return [];
      var cat = catalog[catKey] || {};
      var fr = (cat.fractions && cat.fractions[name]) ? cat.fractions[name].slice() : [];
      // крошка — ко всему кроме жевалок; набор как в ПП/БП, не режем по ключам прайса
      if (catKey !== "chew" && fr.indexOf(CRUMB_FRAC_LABEL_) < 0) {
        fr.push(CRUMB_FRAC_LABEL_);
      }
      return fr;
    }

    function dressuraFractionSizeKey(sub) {
      var fu = String(sub || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
      if (!fu || /^КРОШК/.test(fu)) return "";
      if (/^ОЧЕНЬ\s*МЕЛК|^ОЧ\s*МЕЛК/.test(fu)) return "extraSmall";
      if (/^ЛОМТИК/.test(fu) || fu === "ЛОМТ") return "slices";
      if (/^ПОЛОСК/.test(fu) || fu === "ПОЛОСКИ") return "strips";
      if (/^ЦЕЛ/.test(fu)) return "slices";
      if (/^КРУП/.test(fu)) return "large";
      if (/^БОЛЬ/.test(fu) || fu === "БОЛ") return "large";
      if (/^СРЕД/.test(fu)) return "medium";
      if (/МЕЛК[А-ЯA-Z]*\s*КУСОЧ|КУСОЧ[А-ЯA-Z]*\s*МЕЛК/.test(fu)) return "small";
      if (/^КУСОЧК/.test(fu)) return "strips";
      if ((/^МЕЛК/.test(fu) || /^МАЛ/.test(fu)) && !/^ОЧ/.test(fu)) return "small";
      if (/КУБИК/.test(fu) && /МЕЛК/.test(fu)) return "small";
      if (/КУБИК/.test(fu) && /КРУП/.test(fu)) return "large";
      return "";
    }

    function dressuraFractionPickRate(rates, keys, def) {
      for (var i = 0; i < keys.length; i++) {
        if (rates && rates[keys[i]] != null && isFinite(Number(rates[keys[i]]))) return Number(rates[keys[i]]);
      }
      return def;
    }

    function dressuraFractionRates(rates) {
      rates = rates || {};
      return {
        slices: dressuraFractionPickRate(rates, ["slices", "lomtiki", "whole"], 0),
        strips: dressuraFractionPickRate(rates, ["strips", "poloski"], 1),
        large: dressuraFractionPickRate(rates, ["large", "krupnoe"], 1),
        medium: dressuraFractionPickRate(rates, ["medium", "srednee"], 2),
        small: dressuraFractionPickRate(rates, ["small", "melkoe"], 3),
        extraSmall: dressuraFractionPickRate(rates, ["extraSmall", "xs", "ochenMelkoe"], 4)
      };
    }

    function crumbKindCategoryLabel_(kind) {
      var k = String(kind || "").toLowerCase();
      if (k === "veg") return "дрессура овощи/фрукты";
      if (k === "meat") return "мясные";
      if (k === "hypo") return "гипоаллергенные";
      return "";
    }

    function crumbKindTitle_(kind) {
      return crumbKindCategoryLabel_(kind) || "крошка";
    }

    function isChewProductName_(name) {
      var n = String(name || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
      n = n.replace(/\s*ШТ\.?$/i, "").trim();
      if (!n) return false;
      if (/^(БЫЧИЙ КОРЕНЬ|ТРАХЕЯ|АОРТА|УХО Г|УХО К|НОСЫ|СТАНОВАЯ ЖИЛА|КОЛЕНИ|ПЕРЕПЕЛКИ|ЛОП ХРЯЩ|УТИНЫЕ ШЕИ|ГУБЫ|КОПЫТО)$/.test(n)) return true;
      if (/УХО|УШК|КОРЕН|ХРЯЩ|ЛОПАТ|КОПЫТ|АОРТ|ТРАХЕ|ПЕРЕПЕЛ|СТАНОВ|КОЛЕН/.test(n)) return true;
      if (/ГУБЫ|НОСЫ|ШЕИ|ШЕЯ/.test(n)) return true;
      if (/(^|[^А-ЯA-Z0-9])НОС([^А-ЯA-Z0-9]|$)/.test(n)) return true;
      return false;
    }

    function isChewCrumbSource_(src) {
      if (!src) return false;
      if (typeof src === "string") return isChewProductName_(src);
      var cat = String(src.cat || "").toLowerCase();
      if (cat === "chew" || cat === "chews") return true;
      return isChewProductName_(src.name || src.main || "");
    }

    function crumbSourceNames_(item) {
      if (!item) return [];
      var fromSrc = [];
      if (Array.isArray(item.sources) && item.sources.length) {
        fromSrc = item.sources.map(function (s) {
          if (isChewCrumbSource_(s)) return "";
          var raw = (s && (s.name || s.main)) || "";
          var named = "";
          try { named = catalogAliasNameUi_(raw); } catch (e0) {}
          return named || raw;
        }).filter(function (n) { return n && !isChewProductName_(n); });
      }
      if (fromSrc.length) return fromSrc;
      var sub = String(item.sub || "").trim();
      if (!sub || /^крошка\b/i.test(sub)) return [];
      var kindLabel = crumbKindCategoryLabel_(item.crumbKind);
      if (kindLabel && sub === kindLabel) return [];
      if (sub.indexOf("дрессура") === 0 || sub === "мясные" || sub.indexOf("гипо") === 0) return [];
      return sub.split(/\s*\+\s*/).map(function (part) {
        var p = String(part || "").trim();
        if (!p) return "";
        var named = "";
        try { named = catalogAliasNameUi_(p); } catch (e1) {}
        return named || p;
      }).filter(function (n) { return n && !isChewProductName_(n); });
    }

    function crumbSourcesLabel_(item, joiner) {
      return crumbSourceNames_(item).join(joiner != null ? joiner : " + ");
    }

    function crumbBasketDisplayMain_(item) {
      return crumbSourcesLabel_(item, " + ") || "крошка";
    }

    function crumbBasketSubLabel_(item) {
      return crumbKindCategoryLabel_(item && item.crumbKind) || "крошка";
    }

    function applyCrumbBasketNames_(row) {
      if (!row) return row;
      row.cat = "crumb";
      row.name = "крошка";
      row.main = "крошка";
      var src = crumbSourcesLabel_(row);
      if (src) row.sub = src;
      return row;
    }

    function crumbKindRateUi_(kind) {
      var k = String(kind || "").toLowerCase().replace(/ё/g, "е");
      if (k === "veg" || k === "veggie" || /овощ|фрукт/.test(k)) return 17;
      if (k === "meat" || /мяс/.test(k)) return 19;
      if (k === "hypo" || /гипо/.test(k)) return 22;
      return 0;
    }

    function crumbRetailKindOfNameUi_(name) {
      var n = String(name || "").toUpperCase().replace(/Ё/g, "Е");
      if (/КРОЛИК|ИНДЕЙК|БАРАН/.test(n)) return "hypo";
      if (/ТЫКВ|ЯБЛОК|ГРУШ|МОРКОВ|БАТАТ|БАНАН|КАБАЧ/.test(n)) return "veg";
      return "meat";
    }

    function retailGoodsFromCrumbItemUi_(it, val) {
      val = Number(val) || 0;
      if (val <= 0) return 0;
      var sources = it && it.sources;
      if (sources && sources.length) {
        var ratiosMix = it.ratio || [];
        var rsumMix = 0;
        var rmi;
        for (rmi = 0; rmi < sources.length; rmi++) rsumMix += Number(ratiosMix[rmi]) || 0;
        if (rsumMix <= 0) rsumMix = sources.length;
        var sumPg = 0;
        var sumG = 0;
        for (var smi = 0; smi < sources.length; smi++) {
          var srcM = sources[smi] || {};
          var gM = val * ((Number(ratiosMix[smi]) || 1) / rsumMix);
          var rateM = crumbKindRateUi_(crumbRetailKindOfNameUi_(srcM.name || srcM.main || ""));
          sumG += gM;
          sumPg += rateM * gM;
        }
        if (sumG > 0) {
          return Math.round((val / 100) * Math.ceil(sumPg / sumG) * 100) / 100;
        }
      }
      var crumbRate = crumbKindRateUi_((it && (it.crumbKind || it.sub || it.name || it.main)) || "");
      if (!(crumbRate > 0)) crumbRate = crumbKindRateUi_(crumbRetailKindOfNameUi_(it && (it.name || it.main)));
      if (crumbRate > 0) {
        return Math.round((val / 100) * crumbRate * 100) / 100;
      }
      sources = it && it.sources;
      if (sources && sources.length) {
        var ratios = it.ratio || [];
        var rsum = 0;
        for (var ri = 0; ri < sources.length; ri++) rsum += Number(ratios[ri]) || 0;
        if (rsum <= 0) rsum = sources.length;
        var sum = 0;
        for (var si = 0; si < sources.length; si++) {
          var src = sources[si] || {};
          var share = (Number(ratios[si]) || 1) / rsum;
          var rcS = retailSkuLineCost_(
            src.name || src.main,
            src.sub,
            val * share,
            src.cat || "dressura"
          );
          sum += Number(rcS.cost) || 0;
        }
        return Math.round(sum * 100) / 100;
      }
      var hint = String((it && (it.sub || it.name || it.main)) || "").trim();
      if (/рубец/i.test(hint)) {
        var rcPack = retailSkuLineCost_("КРОШКА РУБЕЦ", "", val, "other");
        if (rcPack && rcPack.found && Number(rcPack.cost) > 0) return Number(rcPack.cost) || 0;
        return Number(retailSkuLineCost_("РУБЕЦ Т", "", val, "dressura").cost) || 0;
      }
      if (/почк/i.test(hint)) {
        return Number(retailSkuLineCost_("КРОШКА ПОЧЕК", "", val, "other").cost) || 0;
      }
      if (/лёгк|легк/i.test(hint)) {
        return Number(retailSkuLineCost_("КРОШКА ЛЁГКОГО", "", val, "other").cost) || 0;
      }
      return 0;
    }

    function catalogAliasNameUi_(name) {
      var raw = String(name || "").trim();
      if (!raw) return "";
      try {
        var via = canonicalProductMain_(raw);
        if (via) return via;
      } catch (eAl) {}
      var n = raw.toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
      n = n.replace(/АОРТАА+/g, "АОРТА");
      if (/^АОРТАА+$/.test(n) || n === "АОРТА А") return "АОРТА";
      if (/^УХО\s*ГА+$/.test(n) || n === "УХОГА") return "УХО Г";
      return n === raw.toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim() ? raw : n;
    }

    function serializeBasketItem_(x, extra) {
      extra = extra || {};
      var main = catalogAliasNameUi_(x.main || x.name);
      var row = {
        cat: x.cat,
        main: main,
        name: main,
        sub: x.sub || "",
        value: x.value != null ? x.value : x.val,
        val: x.value != null ? x.value : x.val
      };
      if (extra.dog) row.dog = extra.dog;
      if (x.cat === "crumb" || x.crumbKind || (Array.isArray(x.sources) && x.sources.length)) {
        row.cat = "crumb";
        row.crumbKind = x.crumbKind || "";
        row.sources = [];
        row.ratio = [];
        var srcRatio = Array.isArray(x.ratio) ? x.ratio : null;
        (Array.isArray(x.sources) ? x.sources : []).forEach(function (s, i) {
          if (isChewCrumbSource_(s)) return;
          var sn = catalogAliasNameUi_(s && (s.name || s.main));
          if (!sn || isChewProductName_(sn)) return;
          row.sources.push({
            cat: (s && s.cat) || "",
            name: sn,
            main: sn,
            sub: (s && s.sub) || ""
          });
          if (srcRatio) row.ratio.push(srcRatio[i]);
        });
        applyCrumbBasketNames_(row);
      }
      if (row.cat !== "crumb") {
        var fracCode = String(x.frac || "").trim().toLowerCase();
        var fracCat = String(row.cat || "").toLowerCase();
        if ((fracCode === "s" || fracCode === "m" || fracCode === "l") &&
            (fracCat === "chew" || fracCat === "chews" || fracCat === "dressura")) row.frac = fracCode;
      }
      return row;
    }

    function igAliasResolve(up) {
      var key = String(up || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
      var aliases = {
        "РУБЕЦ": "РУБЕЦ Т",
        "РУБЕЦ ТЁРПЫЙ": "РУБЕЦ Т",
        "РУБЕЦ ТЕРПЫЙ": "РУБЕЦ Т",
        "ТЁРПЫЙ РУБЕЦ": "РУБЕЦ Т",
        "СВЕТЛЫЙ РУБЕЦ": "СВЕТЛЫЙ РУБЕЦ",
        "РУБЕЦ С": "СВЕТЛЫЙ РУБЕЦ",
        "КРОШКА РУБЦА": "РУБЕЦ Т",
        "КРОШКА РУБЕЦ": "РУБЕЦ Т",
        "КРОШКА ЛЕГКОГО": "ЛЁГКОЕ",
        "КРОШКА ЛЁГКОГО": "ЛЁГКОЕ",
        "КРОШКА ПОЧЕК": "ПОЧКИ",
        "КРОШКА СЕРДЦА": "СЕРДЦЕ",
        "КОРЕНЬ": "БЫЧИЙ КОРЕНЬ",
        "БЫЧИЙКОРЕНЬ": "БЫЧИЙ КОРЕНЬ",
        "БЫЧИЙ КОРЕНЬ": "БЫЧИЙ КОРЕНЬ",
        "ЛЕГКОЕ": "ЛЁГКОЕ",
        "ЛЁГКОЕ": "ЛЁГКОЕ",
        "БАРАНЬЕ ЛЕГКОЕ": "БАРАНЬЕ ЛЁГКОЕ",
        "БАРАНЬЕ ЛЁГКОЕ": "БАРАНЬЕ ЛЁГКОЕ",
        "УШКО": "УХО Г",
        "УШКО Г": "УХО Г",
        "УШКО ГОВЯЖЬЕ": "УХО Г",
        "УХО": "УХО Г",
        "УХО Г": "УХО Г",
        "УХО К": "УХО К",
        "УШКО К": "УХО К",
        "УХО КУР": "УХО К",
        "КУРИНОЕ УХО": "УХО К",
        "КАБАЧКИ": "КАБАЧОК",
        "КАБАЧОК": "КАБАЧОК",
        "ГРУШЫ": "ГРУШИ",
        "ГРУШИ": "ГРУШИ",
        "ГРУША": "ГРУШИ",
        "БАРАНЬЯ ПЕЧЕНЬ": "БАРАНЬЯ ПЕЧЕНЬ",
        "АОРТАА": "АОРТА",
        "АОРТА А": "АОРТА",
        "АОРТА": "АОРТА",
        "УХО ГА": "УХО Г",
        "УХОГА": "УХО Г",
        "ЛОПАТЧНЫЙ ХРЯЩ": "ЛОП ХРЯЩ ШТ.",
        "ЛОПАТОЧНЫЙ ХРЯЩ": "ЛОП ХРЯЩ ШТ.",
        "ЛОП ХРЯЩ": "ЛОП ХРЯЩ ШТ.",
        "ЛОП. ХРЯЩ": "ЛОП ХРЯЩ ШТ.",
        "ЛОП.ХРЯЩ": "ЛОП ХРЯЩ ШТ.",
        "ЛОПАТ. ХРЯЩ": "ЛОП ХРЯЩ ШТ.",
        "ЯБЛОКО": "ЯБЛОКИ",
        "ЯБЛОКИ": "ЯБЛОКИ",
        "ПЕЧЕНЬ": "ПЕЧЕНЬ",
        "ПОЧКИ": "ПОЧКИ",
        "СЕРДЦЕ": "СЕРДЦЕ",
        "БАНАН": "БАНАНЫ",
        "БАНАНЫ": "БАНАНЫ",
        "ТЫКВА": "ТЫКВА",
        "УТИНАЯ ШЕЯ": "УТИНЫЕ ШЕИ ШТ.",
        "ТРАХЕЯ": "ТРАХЕЯ",
        "ТРАХЕИ": "ТРАХЕЯ",
        "ТРАХЕЮ": "ТРАХЕЯ",
        "СТАНОВАЯ ЖИЛА": "СТАНОВАЯ ЖИЛА",
        "ИНДЕЙКА": "ИНДЕЙКА",
        "ЛОМТИКИ": "МЯСНЫЕ ЛОМТИКИ",
        "ЛОМТИК": "МЯСНЫЕ ЛОМТИКИ",
        "ЛОМТ": "МЯСНЫЕ ЛОМТИКИ",
        "МЯС ЛОМТИКИ": "МЯСНЫЕ ЛОМТИКИ",
        "МЯС. ЛОМТИКИ": "МЯСНЫЕ ЛОМТИКИ",
        "МЯСНЫЕ ЛОМТ": "МЯСНЫЕ ЛОМТИКИ",
        "МЯСН ЛОМТИКИ": "МЯСНЫЕ ЛОМТИКИ",
        "МЯСНЫЕ ЛОМТИКИ": "МЯСНЫЕ ЛОМТИКИ"
      };
      if (aliases[key]) return aliases[key];
      if (/^АОРТАА+$/.test(key) || key === "АОРТА А") return "АОРТА";
      if (/^УХО\s*ГА+$/.test(key) || key === "УХОГА") return "УХО Г";
      if (/^ЛОМТИК/.test(key) || key === "ЛОМТ") return "МЯСНЫЕ ЛОМТИКИ";
      if (/^МЯСН?\s*ЛОМТ/.test(key)) return "МЯСНЫЕ ЛОМТИКИ";
      return key;
    }

    function canonicalProductMain_(raw) {
      var up = String(raw || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
      if (!up) return "";
      return igAliasResolve(up);
    }

    function buildIgKnownMap() {
      if (window._igKnownMapCache) return window._igKnownMapCache;
      var known = {};
      Object.keys(catalog).forEach(function (k) {
        if (k === "powder") return;
        (catalog[k].items || []).forEach(function (n) {
          var fr = ((catalog[k].fractions || {})[n] || []).slice();
          if (k !== "chew" && fr.indexOf(CRUMB_FRAC_LABEL_) < 0) fr.push(CRUMB_FRAC_LABEL_);
          known[n.toUpperCase()] = { cat: k, name: n, fractions: fr };
        });
      });
      window._igKnownMapCache = known;
      return known;
    }

    function cleanChecklistLine_(line) {
      return String(line || "")
        .replace(/^[\s\uFEFF\u200B\u2060]+/, "")
        .replace(/^[\*•\-–—▪︎▸🔸✅✔️☑️👍🐾🦴🥩🍖🐶]+/u, "")
        .replace(/^\d+[\.\)\:]\s*/, "")
        .replace(/^[\s*•\-–—]+/, "")
        .trim();
    }

    function peelInlineChecklistFrac_(up) {
      var combo = up.match(/(?:(?:СРЕДН|СРЕДНЕВАТ|МЕЛК|МАЛЕНЬК|МАЛЮСЕНЬК|КРУПН|БОЛЬШ|ОЧЕНЬ|СУПЕР|ОЧ)[\p{L}\p{N}_]*|(?:КУБИК|КУСОЧК)[\p{L}\p{N}_]*)\s+(?:(?:КУБИК|КУСОЧК)[\p{L}\p{N}_]*|(?:СРЕДН|МЕЛК|МАЛЕНЬК|КРУПН|БОЛЬШ|СРЕД)[\p{L}\p{N}_]*)/u);
      if (combo) {
        return {
          frac: combo[0],
          name: up.replace(combo[0], "").replace(/\s+/g, " ").trim()
        };
      }
      return { frac: "", name: up };
    }

    function normalizeChecklistRaw_(raw) {
      var text = String(raw || "")
        .replace(/\u2028|\u2029/g, "\n")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/\t+/g, " ")
        .replace(/\s+([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-']{1,24}\s*:)/g, "\n$1");
      text = text.replace(/\s+(?=(?:дрессур[аы]?|жевалк[аи]?|фрукт[ы]?|овощ[и]?|присыпк?[аи]?)(?:\s|$))/gi, "\n");
      text = text.replace(/^(\s*)(дрессур[аы]?|жевалк[аи]?|фрукт[ы]?|овощ[и]?|присыпк?[аи]?)\s+(?=[A-Za-zА-Яа-яЁё])/i, "$1$2\n");
      text = text.split("\n").map(function (line) {
        var qtyHits = line.match(/[—\-–]\s*\d+(?:[.,]\d+)?\s*(?:г|гр|грамм|шт|кг)(?=\s|[\(,.;]|$|[x×х\*])/gi);
        if (!qtyHits || qtyHits.length < 2) return line;
        return line.replace(/\s+(?=[A-ZА-ЯЁ][\p{L}\p{N}_\-']*\s*[—\-–]\s*\d+(?:[.,]\d+)?\s*(?:г|гр|грамм|шт|кг)(?=\s|[\(,.;]|$))/gu, "\n");
      }).join("\n");
      return text;
    }

    function isBareCategoryHeader_(t) {
      var s = String(t || "").trim();
      if (/^(дрессур[аы]?|жевалк[аи]?|фрукт[ы]?|овощ[и]?|присыпк?[аи]?|заказ|итого|всего|состав|набор)\s*$/i.test(s)) return true;

      if (/^(овощ|фрукт)/i.test(s) && /(овощ|фрукт)/i.test(s)) return true;
      return false;
    }

    function parseIgLinesToItems(raw) {
      var IGNORE_LINE = /^(?:дрессур[аы]?|жевалк[аи]?|фрукт[ы]?|овощ[и]?|присыпк?[аи]?)\s*$|^(?:вс[её]\s*подход|спасибо|заменил|второй\s*заказ|итоговая|цена\s|стоимость|будет\s*ли|вам\s*будет|давайте\s*под|удобно\s*получить|доставк)/i;
      var IGNORE_HAS = /(рубл|цена\s*за|стоимость\s*этого|итоговая\s*стоимость|с\s*учётом\s*доставк|вс[её]\s*подходит)/i;
      var lines = String(normalizeChecklistRaw_(raw) || "").split(/\r?\n/).map(cleanChecklistLine_).filter(Boolean);
      var added = [];
      var noteBits = [];
      var known = buildIgKnownMap();
      function mapChewFrac(token) {
        var t = String(token || "").toUpperCase().replace(/Ё/g, "Е");

        if (/(СРЕДН\w*|СРЕДНЕВАТ\w*|СРЕД(?![А-ЯA-Z])|НОРМ(?![А-ЯA-Z])).{0,16}(КУБ|КУСОЧ)|(КУБ|КУСОЧ).{0,16}(СРЕДН|СРЕДНЕВАТ|СРЕД(?![А-ЯA-Z])|НОРМ)/.test(t)) return "СРЕД";
        if (/(ОЧ\s*МАЛ|ОЧЕНЬ\s*(?:МАЛ|МЕЛК)|СУПЕР\s*(?:МАЛ|МЕЛК)|МАЛЮСЕНЬК|МАХОНЬК|КРОШЕЧН|КРОХОТН|МИНИАТЮР|МАЛЕНЬК|МЕЛК|МИНИ(?![А-ЯA-Z])).{0,16}(КУБ|КУСОЧ)|(КУБ|КУСОЧ).{0,16}(ОЧ\s*МАЛ|ОЧЕНЬ|СУПЕР|МАЛЮСЕНЬК|МАХОНЬК|КРОШЕЧН|КРОХОТН|МИНИАТЮР|МАЛЕНЬК|МЕЛК|МИНИ)/.test(t)) return "МАЛ";
        if (/(БОЛЬШ|КРУПН|ЗДОРОВЕН|ОГРОМ|ГИГАНТ).{0,16}(КУБ|КУСОЧ)|(КУБ|КУСОЧ).{0,16}(БОЛЬШ|КРУПН|ЗДОРОВЕН|ОГРОМ|ГИГАНТ)/.test(t)) return "БОЛ";

        if (/ОЧ\s*МАЛ|ОЧЕНЬ\s*(МАЛ|МЕЛК)|СУПЕР\s*(МАЛ|МЕЛК)/.test(t)) return "ОЧ МАЛ";
        if (/ПОЛОВИН|ПОЛ\s*ШТ|1\/2/.test(t)) return "ПОЛОВИНКА";
        if (/ПАЛК|ПАЛОЧ/.test(t)) return "ПАЛК";
        if (/ПЛАСТ|ПЛАСТИН/.test(t)) return "ПЛАСТ";
        if (/ОГР|ОГРОМ|ГИГАНТ|РОГАЛИК/.test(t)) return "ОГР";
        if (/СРЕДН|СРЕДНЕВАТ|СРЕД(?![А-ЯA-Z])|НОРМ(?![А-ЯA-Z])/.test(t)) return "СРЕД";
        if (/БОЛЬШ|КРУПН|ЗДОРОВЕН|БОЛ([^А-ЯA-Z]|$)/.test(t)) return "БОЛ";

        if (/МАЛЮСЕНЬК|МАХОНЬК|КРОШЕЧН|КРОХОТН|МИНИАТЮР|МАЛЕНЬК|МЕЛК|МЕЛКО|МИНИ(?![А-ЯA-Z])|КУБИК/.test(t)) return "МАЛ";
        if (/(^|[^А-ЯA-Z])МАЛ([^А-ЯA-Z]|$)/.test(t)) return "МАЛ";
        if (/ЦЕЛ|ЦЕЛИКОМ|ОБЫЧН/.test(t)) return "Обычная";
        return "";
      }
      function mapDressFrac(token) {
        var t = String(token || "").toUpperCase().replace(/Ё/g, "Е");

        if (/КРОШК/.test(t)) return "Крошка";
        if (/ОЧЕНЬ\s*МЕЛК|ОЧ\s*МЕЛК/.test(t)) return "Очень мелкое";
        if (/МЕЛК\w*\s*КУСОЧ|КУСОЧ\w*\s*МЕЛК/.test(t)) return "Мелкое";
        if (/ЛОМТ/.test(t)) return "Ломтики";
        if (/ПОЛОСК|ПОЛОС(?![А-ЯA-Z])/.test(t)) return "Полоски";
        if (/КУСОЧК/.test(t)) return "Полоски";

        if (/(СРЕДН\w*|СРЕДНЕВАТ\w*|СРЕД(?![А-ЯA-Z])|НОРМ(?![А-ЯA-Z])).{0,16}(КУБ|КУСОЧ)|(КУБ|КУСОЧ).{0,16}(СРЕДН|СРЕДНЕВАТ|СРЕД(?![А-ЯA-Z])|НОРМ)/.test(t)) return "Среднее";
        if (/(МЕЛК|МАЛЕНЬК|МАЛЮСЕНЬК|МАХОНЬК|КРОШЕЧН|КРОХОТН|МИНИАТЮР|МИНИ(?![А-ЯA-Z])|ОЧЕНЬ\s*(?:МАЛ|МЕЛК)|СУПЕР\s*(?:МАЛ|МЕЛК)).{0,16}(КУБ|КУСОЧ)|(КУБ|КУСОЧ).{0,16}(МЕЛК|МАЛЕНЬК|МАЛЮСЕНЬК|МАХОНЬК|КРОШЕЧН|КРОХОТН|МИНИ|ОЧЕНЬ|СУПЕР)/.test(t)) return "Мелкое";
        if (/(КРУПН|БОЛЬШ|ЗДОРОВЕН|ОГРОМ|ГИГАНТ).{0,16}(КУБ|КУСОЧ)|(КУБ|КУСОЧ).{0,16}(КРУПН|БОЛЬШ|ЗДОРОВЕН|ОГРОМ|ГИГАНТ)/.test(t)) {
          return "Крупное";
        }
        if (/МАЛЮСЕНЬК|МАХОНЬК|КРОШЕЧН|КРОХОТН|МИНИАТЮР|МАЛЕНЬК|МЕЛК|МЕЛКО|МИНИ(?![А-ЯA-Z])/.test(t)) return "Мелкое";
        if (/СРЕДН|СРЕДНЕВАТ|СРЕД(?![А-ЯA-Z])|НОРМ(?![А-ЯA-Z])/.test(t)) return "Среднее";
        if (/КРУПН|ЗДОРОВЕНН|ОГРОМ|ГИГАНТ/.test(t)) return "Крупное";
        if (/БОЛЬШ|ЗДОРОВ(?![А-ЯA-Z])/.test(t)) return "Крупное";
        if (/ЦЕЛ|ЦЕЛИКОМ/.test(t)) return "Ломтики";

        if (/КУБИК/.test(t)) return "Мелкое";
        return "";
      }
      function matchKnown(upRaw) {
        var up = igAliasResolve(upRaw);
        var keys = Object.keys(known).sort(function (a, b) { return b.length - a.length; });
        for (var i = 0; i < keys.length; i++) {
          if (up === keys[i]) return known[keys[i]];
        }
        var best = null, bestLen = 0;
        for (var j = 0; j < keys.length; j++) {
          var k = keys[j];
          if (up.indexOf(k) >= 0 && k.length > bestLen) { best = known[k]; bestLen = k.length; }
          else if (up.length >= 5 && k.indexOf(up) >= 0 && up.length > bestLen) { best = known[k]; bestLen = up.length; }
        }
        return best;
      }
      lines.forEach(function (line) {
        line = line.replace(/^(?:дрессур[аы]?|жевалк[аи]?|фрукт[ы]?|овощ[и]?|присыпк?[аи]?)\s+/i, "");
        if (IGNORE_LINE.test(line) || IGNORE_HAS.test(line)) return;
        if (/^\d{1,2}([./-]\d{1,2})?\s*(июл|авг|сен|окт|ноя|дек|янв|фев|мар|апр|мая|июн)/i.test(line)) return;
        if (/доставк/i.test(line) && /(удобн|числ|вторник|понедельник|дата)/i.test(line)) return;

        var mult = 1;
        var multM = line.match(/\s*[x×х\*]\s*(\d+)\s*$/i);
        if (multM) {
          mult = Math.max(1, parseInt(multM[1], 10) || 1);
          line = line.slice(0, multM.index).trim();
        }
        line = line.replace(/(\d+(?:[.,]\d+)?)(г|гр|грамм|шт|кг)(?=\s|[\(,.;]|$|[x×х\*])/gi, "$1 $2");

        var m = line.match(/^(.+?)\s*[—\-–:]\s*(\d+(?:[.,]\d+)?)\s*(г|гр|грамм|шт|кг)?(?:\s*[\(（]([^\)）]+)[\)）])?(?:\s+(.+))?$/i) ||
                line.match(/^(\d+(?:[.,]\d+)?)\s*(г|гр|шт|кг)?\s+(.+)$/i);
        var namePart = "", val = 0, unit = "", paren = "", trailing = "";
        if (m) {
          if (m[3] && /г|шт|кг/i.test(String(m[2] || ""))) {
            val = parseFloat(String(m[1]).replace(",", ".")); unit = m[2] || ""; namePart = m[3];
          } else {
            namePart = m[1]; val = parseFloat(String(m[2]).replace(",", ".")); unit = m[3] || "";
            paren = m[4] || ""; trailing = m[5] || "";
          }
        } else {
          var m2 = line.match(/(.+?)\s+(\d+(?:[.,]\d+)?)\s*(г|гр|шт|кг)?(?:\s*[\(（]([^\)）]+)[\)）])?$/i);
          if (m2) {
            namePart = m2[1]; val = parseFloat(String(m2[2]).replace(",", ".")); unit = m2[3] || ""; paren = m2[4] || "";
          } else {
            var m3 = line.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(г|гр|грамм|шт|кг)\.?\s+(.+)$/i);
            if (!m3) return;
            namePart = m3[1]; val = parseFloat(String(m3[2]).replace(",", ".")); unit = m3[3] || ""; trailing = m3[4] || "";
          }
        }
        if (trailing && !paren) paren = trailing;
        namePart = String(namePart || "").replace(/[\(（][^\)）]+[\)）]/g, function (x) {
          if (!paren) paren = x.replace(/[\(\)（）]/g, "");
          return "";
        }).trim();
        if (!namePart || !(val > 0)) return;
        if (mult > 1) val = val * mult;

        if (/^(набор|состав|заказ|итого)/i.test(namePart)) return;
        namePart = String(namePart || "").replace(/^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-']{1,24}\s*:\s*/, "").trim();
        if (/кг/i.test(unit)) val = Math.round(val * 1000);

        var up = namePart.toUpperCase().replace(/\s+/g, " ").trim();
        var frac = "";
        var fracSrc = paren || "";
        var needFrac = false;
        var peeled = peelInlineChecklistFrac_(up);
        if (peeled.frac) {
          fracSrc = fracSrc || peeled.frac;
          up = peeled.name;
        }
        var fracHit = up.match(/((?:СРЕДН[\p{L}\p{N}_]*|СРЕДНЕВАТ[\p{L}\p{N}_]*|МЕЛК[\p{L}\p{N}_]*|МАЛЕНЬК[\p{L}\p{N}_]*|МАЛЮСЕНЬК[\p{L}\p{N}_]*|КРУПН[\p{L}\p{N}_]*|БОЛЬШ[\p{L}\p{N}_]*|ОЧЕНЬ\s*(?:МАЛ|МЕЛК)[\p{L}\p{N}_]*|СУПЕР\s*(?:МАЛ|МЕЛК)[\p{L}\p{N}_]*)\s+(?:КУБИК[\p{L}\p{N}_]*|КУСОЧК[\p{L}\p{N}_]*)|(?:КУБИК[\p{L}\p{N}_]*|КУСОЧК[\p{L}\p{N}_]*)\s+(?:СРЕДН[\p{L}\p{N}_]*|СРЕДНЕВАТ[\p{L}\p{N}_]*|МЕЛК[\p{L}\p{N}_]*|МАЛЕНЬК[\p{L}\p{N}_]*|КРУПН[\p{L}\p{N}_]*|БОЛЬШ[\p{L}\p{N}_]*)|ОЧ\s*МАЛ|ОЧЕНЬ\s*(?:МАЛ|МЕЛК)[\p{L}\p{N}_]*|СУПЕР\s*(?:МАЛ|МЕЛК)[\p{L}\p{N}_]*|МАЛЮСЕНЬК[\p{L}\p{N}_]*|МАХОНЬК[\p{L}\p{N}_]*|КРОШЕЧН[\p{L}\p{N}_]*|КРОХОТН[\p{L}\p{N}_]*|МИНИАТЮР[\p{L}\p{N}_]*|МАЛЕНЬК[\p{L}\p{N}_]*|МЕЛК[\p{L}\p{N}_]*|СРЕДНЕВАТ[\p{L}\p{N}_]*|СРЕДН[\p{L}\p{N}_]*|БОЛЬШ[\p{L}\p{N}_]*|КРУПН[\p{L}\p{N}_]*|ЗДОРОВЕНН[\p{L}\p{N}_]*|ОГРОМ[\p{L}\p{N}_]*|ГИГАНТ[\p{L}\p{N}_]*|ЦЕЛИКОМ|ЦЕЛ[\p{L}\p{N}_]*|ПОЛОВИН[\p{L}\p{N}_]*|ПАЛОЧ[\p{L}\p{N}_]*|ПАЛК|ПЛАСТИН[\p{L}\p{N}_]*|ПЛАСТ|КУБИК[\p{L}\p{N}_]*|КУСОЧК[\p{L}\p{N}_]*|ЛОМТ[\p{L}\p{N}_]*|ПОЛОСК[\p{L}\p{N}_]*|РОГАЛИК|СРЕД(?![\p{L}])|МАЛ(?![\p{L}])|БОЛ(?![\p{L}])|ОГР|МИНИ(?![\p{L}])|НОРМ(?![\p{L}]))/u);
        var protectMeatSlices = /МЯСН[\p{L}\p{N}_]*\s*ЛОМТ|^ЛОМТИК/u.test(up);
        if (fracHit && !protectMeatSlices) {
          fracSrc = fracSrc || fracHit[0];
          up = up.replace(fracHit[0], "").replace(/\s+/g, " ").trim();
        }
        up = igAliasResolve(up);
        var wasCrumbSku = /КРОШК/i.test(String(namePart || ""));
        var hit = matchKnown(up);
        if (!hit) {
          var canonTry = canonicalProductMain_(namePart.trim());
          if (canonTry && canonTry !== up) hit = matchKnown(canonTry);
        }
        if (!hit) {
          noteBits.push(namePart.trim() + " " + val + (unit || ""));
          var fallbackMain = canonicalProductMain_(namePart.trim()) || namePart.trim();
          added.push({ cat: "other", main: fallbackMain, name: fallbackMain, sub: "", value: val, val: val });
          return;
        }
        if (wasCrumbSku) {
          frac = CRUMB_FRAC_LABEL_;
          needFrac = false;
          fracSrc = fracSrc || "крошка";
        }
        if (fracSrc && !wasCrumbSku) {
          frac = hit.cat === "chew" ? mapChewFrac(fracSrc) : mapDressFrac(fracSrc);
          if (hit.cat === "chew" && !frac) frac = mapDressFrac(fracSrc);
          if (hit.cat === "dressura" && frac === "Большое" && hit.fractions.indexOf("Большое") < 0 && hit.fractions.indexOf("Крупное") >= 0) frac = "Крупное";

          if (hit.cat === "chew" && !frac && /СРЕДН|СРЕД/.test(String(fracSrc).toUpperCase())) frac = "СРЕД";
          if (hit.name === "АОРТА" && /ЦЕЛ/.test(String(fracSrc).toUpperCase())) frac = "Обычная";
          if (hit.name === "УХО Г" && /ПОЛОВИН/.test(String(fracSrc).toUpperCase())) frac = "ПОЛОВИНКА";
          if (hit.name === "УХО Г" && /ЦЕЛ|ОБЫЧН/.test(String(fracSrc).toUpperCase())) frac = "Обычное";
          if (hit.name === "УХО К" && /ПОЛОВИН/.test(String(fracSrc).toUpperCase())) frac = "ПОЛОВИНКА";
          if (hit.name === "УХО К" && /ЦЕЛ|ОБЫЧН/.test(String(fracSrc).toUpperCase())) frac = "Обычное";
        }
        if (hit.fractions && hit.fractions.length) {
          if (!frac) {

            needFrac = true;
            frac = "";
          } else if (hit.fractions.indexOf(frac) < 0) {

            var found = "";
            var wantF = String(frac).toUpperCase().replace(/\s+/g, " ").trim();
            for (var fi = 0; fi < hit.fractions.length; fi++) {
              var fu = String(hit.fractions[fi]).toUpperCase().replace(/\s+/g, " ").trim();
              if (fu === wantF) { found = hit.fractions[fi]; break; }
            }
            if (!found) {
              for (var fi2 = 0; fi2 < hit.fractions.length; fi2++) {
                var fu2 = String(hit.fractions[fi2]).toUpperCase().replace(/\s+/g, " ").trim();
                var fTokens = fu2.split(/\s+/);
                var wTokens = wantF.split(/\s+/);

                if (fTokens.length === wTokens.length && (fu2 === wantF ||
                    (wantF.length >= 3 && fu2.indexOf(wantF) === 0))) {
                  found = hit.fractions[fi2];
                  break;
                }
              }
            }
            if (found) frac = found;
            else {
              frac = "";
              needFrac = true;
            }
          }

          if (!needFrac && fracSrc) {
            var fsUp = String(fracSrc).toUpperCase().replace(/Ё/g, "Е");
            var hasSizeWord = /(СРЕДН|СРЕДНЕВАТ|СРЕД(?![А-ЯA-Z])|МЕЛК|МАЛЕНЬК|МАЛЮСЕНЬК|МАХОНЬК|КРОШЕЧН|КРОХОТН|МИНИАТЮР|КРУПН|БОЛЬШ|ЗДОРОВЕН|ОЧ\s*МАЛ|ОЧЕНЬ|СУПЕР|НОРМ(?![А-ЯA-Z])|ЦЕЛ|ПОЛОВИН|ПАЛК|ПАЛОЧ|ПЛАСТ|ОГР|ГИГАНТ|РОГАЛИК|(^|[^А-ЯA-Z])МАЛ([^А-ЯA-Z]|$)|БОЛ([^А-ЯA-Z]|$)|МИНИ(?![А-ЯA-Z]))/.test(fsUp);
            if (!hasSizeWord && /(КУБИК|КУСОЧК|ЛОМТ|ПОЛОСК)/.test(fsUp)) {
              needFrac = true;
            }
          }
        } else {
          frac = "";
        }
        var needPiece = false;
        var pieceHint = "";
        var pieceSku = hit.cat === "chew" || (typeof isPieceSkuName === "function" && isPieceSkuName(hit.name));
        if (pieceSku) {
          var unitLow = String(unit || "").toLowerCase().replace(/\./g, "");
          var gramUnit = /^(г|гр|грамм)$/i.test(unitLow);
          var pcsInLine = String(line || "").match(/(\d+)\s*шт/i);
          if (pcsInLine && gramUnit) {
            val = Math.max(1, parseInt(pcsInLine[1], 10) || 1);
          } else if ((gramUnit && val > 12) || (!unitLow && val > 20)) {
            needPiece = true;
            pieceHint = val + (gramUnit ? " г" : "");
            val = 0;
          }
        }
        added.push({
          cat: hit.cat,
          main: hit.name,
          name: hit.name,
          sub: frac,
          value: val,
          val: val,
          needFrac: !!needFrac,
          needPiece: !!needPiece,
          pieceHint: pieceHint,
          fractions: (hit.fractions || []).slice(),
          fracHint: fracSrc || ""
        });
      });
      return { items: added, noteBits: noteBits };
    }

    function prettyProductName(name) {
      var s = String(name || "").trim().replace(/\s+/g, " ");
      if (!s) return "";
      var u = s.toUpperCase();
      var special = {
        "ЛЁГКОЕ": "Лёгкое",
        "ЛЕГКОЕ": "Лёгкое",
        "БАРАНЬЕ ЛЁГКОЕ": "Баранье лёгкое",
        "БАРАНЬЕ ЛЕГКОЕ": "Баранье лёгкое",
        "РУБЕЦ Т": "Рубец Т",
        "БЫЧИЙ КОРЕНЬ": "Бычий корень",
        "СТАНОВАЯ ЖИЛА": "Становая жила",
        "УХО Г": "Ухо Г",
        "УХО К": "Ухо К",
        "НОСЫ ШТ.": "Носы",
        "КОЛЕНИ ШТ.": "Колени",
        "КОПЫТО ШТ.": "Копыто",
        "ПЕРЕПЁЛКИ ШТ.": "Перепёлки",
        "ПЕРЕПЕЛКИ ШТ.": "Перепёлки",
        "ЛОП ХРЯЩ ШТ.": "Лоп. хрящ",
        "УТИНЫЕ ШЕИ ШТ.": "Утиные шеи",
        "ГУБЫ ШТ.": "Губы",
        "СВЕТЛЫЙ РУБЕЦ": "Светлый рубец",
        "МЯСНЫЕ ЛОМТИКИ": "Мясные ломтики",
        "ПИКАЛЬНОЕ МЯСО": "Пикальное мясо",
        "БАРАНЬЯ ПЕЧЕНЬ": "Баранья печень",
        "КРОШКА РУБЕЦ": "Крошка рубец",
        "КРОШКА ЛЁГКОГО": "Крошка лёгкого",
        "КРОШКА ЛЕГКОГО": "Крошка лёгкого",
        "КРОШКА ПОЧЕК": "Крошка почек",
        "КРОШКА СЕРДЦА": "Крошка сердца",
        "КРОШКА МИКС": "Крошка микс"
      };
      if (special[u]) return special[u];
      var clean = s.replace(/\s*шт\.?$/i, "").trim();
      return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    }

    function humanFraction(main, sub) {
      var f = String(sub || "").trim();
      if (!f) return "";
      var m = String(main || "").toUpperCase();
      var fu = f.toUpperCase().replace(/\s+/g, " ");
      if (/ОЧЕНЬ\s*МЕЛК|^ОЧ\s*МЕЛК/.test(fu)) return "очень мелкое";
      if (/^ЛОМТ/.test(fu)) return "ломтики";
      if (/^ПОЛОСК/.test(fu)) return "полоски";
      if (/Л[ЁЕ]ГК/.test(m) && /^МЕЛК/.test(fu)) return "мелкий кубик";
      if (fu === "ПЛАСТ") return "пластинки";
      if (/ПОЛОВИН/.test(fu)) return "половинки";
      if (/ПАЛК/.test(fu)) return "палочки";
      if (/^ОЧ/.test(fu) || fu === "ОЧ МАЛ") return "очень маленькие";
      if (fu === "МАЛ" || fu === "ОЧ МАЛ") return "маленькие";
      if (fu === "СРЕД") return "средние";
      if (fu === "БОЛ") return "большие";
      if (fu === "ОГР") return "огромные";
      if (/^МЕЛК/.test(fu)) return "мелкое";
      if (/^СРЕД/.test(fu)) return "среднее";
      if (/^БОЛЬ|^КРУП/.test(fu)) return "крупное";
      if (/^ЦЕЛ/.test(fu)) return "целое";
      if (/ОБЫЧН/.test(fu)) return "";
      return f.toLowerCase();
    }

    function mapApiBasketToLocal(list) {
      return (list || []).map(function (x) {
        var main = catalogAliasNameUi_(x.main || x.name || "");
        var mainUp = String(main || "").toUpperCase().replace(/Ё/g, "Е");
        var cat = x.cat || "dressura";
        if (x.crumbKind || String(cat).toLowerCase() === "crumb" || (Array.isArray(x.sources) && x.sources.length)) {
          cat = "crumb";
        }
        if (/^ПОЧКИ$/.test(mainUp)) cat = "dressura";
        if (/^ГРУШ/.test(mainUp)) {
          main = "ГРУШЫ";
          cat = "veg";
        }
        var row = {
          id: Date.now() + Math.random(),
          cat: cat,
          main: main,
          name: x.name || x.main || main,
          sub: x.sub || "",
          value: x.val != null ? x.val : x.value,
          val: x.val != null ? x.val : x.value
        };
        if (cat === "crumb") {
          row.crumbKind = x.crumbKind || "";
          row.sources = [];
          row.ratio = [];
          var srcRatio = Array.isArray(x.ratio) ? x.ratio : null;
          (Array.isArray(x.sources) ? x.sources : []).forEach(function (s, i) {
            if (isChewCrumbSource_(s)) return;
            var sn = catalogAliasNameUi_(s && (s.name || s.main));
            if (!sn || isChewProductName_(sn)) return;
            row.sources.push({ cat: (s && s.cat) || "", name: sn, main: sn, sub: (s && s.sub) || "" });
            if (srcRatio) row.ratio.push(srcRatio[i]);
          });
          applyCrumbBasketNames_(row);
        } else {
          var fracCodeIn = String(x.frac || "").trim().toLowerCase();
          var fracCatIn = String(cat || "").toLowerCase();
          if ((fracCodeIn === "s" || fracCodeIn === "m" || fracCodeIn === "l") &&
              (fracCatIn === "chew" || fracCatIn === "chews" || fracCatIn === "dressura")) row.frac = fracCodeIn;
        }
        return row;
      }).filter(function (x) { return x.main && Number(x.value) > 0; });
    }

    function crumbSourcePool_(kind) {
      var keys = [];
      if (kind === "veg") keys = ["dressura", "veg"];
      else if (kind === "meat") keys = ["dressura", "other", "veg"];
      else if (kind === "hypo") keys = ["dressura", "other", "veg"];
      else keys = ["dressura", "other", "veg"];
      var out = [];
      var seen = {};
      keys.forEach(function (k) {
        var cat = catalog[k] || {};
        (cat.items || []).forEach(function (n) {
          var name = String(n || "").trim();
          if (!name || seen[name] || k === "chew" || k === "chews" || isChewProductName_(name)) return;
          seen[name] = true;
          out.push({ cat: k, name: name });
        });
      });
      return out;
    }

    function parseDeliveryAddress(raw) {
      var s = String(raw || "").trim();
      var entrance = "";
      var floor = "";
      var flat = "";
      if (!s) return { street: "", entrance: "", floor: "", flat: "" };

      function take(re) {
        var m = s.match(re);
        if (!m) return "";
        var val = String(m[1] || "").trim();
        s = (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length)).replace(/\s*[·|;,]\s*/g, " · ").replace(/\s{2,}/g, " ").trim();
        s = s.replace(/^[·|;,\s]+|[·|;,\s]+$/g, "").trim();
        return val;
      }

      entrance = take(/(?:^|[·|;,\s])(?:подъезд|под\.)\s*([0-9]+[а-яa-z]?)\b/i);
      if (!entrance) {
        entrance = take(/(?:^|[·|;,\s])п\.?\s*под\.?\s*([0-9]+[а-яa-z]?)\b/i);
      }
      if (!entrance) {

        entrance = take(/(?:^|[·|;,\s])п\.\s*([0-9]+[а-яa-z]?)\b/i);
      }
      if (!entrance) {

        entrance = take(/(?:^|[·|;,\s])п\s+([0-9]+[а-яa-z]?)\b/i);
      }
      floor = take(/(?:^|[·|;,\s])(?:этаж|эт\.)\s*([0-9]+[а-яa-z]?)\b/i);
      if (!floor) floor = take(/(?:^|[·|;,\s])эт\s+([0-9]+[а-яa-z]?)\b/i);
      if (!floor) floor = take(/(?:^|[·|;,\s])эт\.?\s*([0-9]+[а-яa-z]?)\b/i);

      flat = take(/(?:^|[·|;,\s])(?:квартира|кв\.?)\s*([0-9]+[а-яa-z\-\/]*)\b/i);
      if (!flat) flat = take(/(?:^|[·|;,\s])кв\s+([0-9]+[а-яa-z\-\/]*)\b/i);
      if (!flat) flat = take(/(?:^|[·|;,\s])([0-9]+[а-яa-z\-\/]*)\s*кв\.?\b/i);

      var dm = s.match(/(?:^|[·|;,\s])домофон\s*([^\s·|;,]{1,24})/i);
      if (dm) {
        var dval = String(dm[1] || "").trim();
        s = (s.slice(0, dm.index) + " " + s.slice(dm.index + dm[0].length)).replace(/\s{2,}/g, " ").trim();
        if (dval) entrance = entrance ? (entrance + ", домофон " + dval) : ("домофон " + dval);
      }

      var street = formatStreetHouse(s) || s.replace(/\s*[·|]\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
      return { street: street, entrance: entrance, floor: floor, flat: flat };
    }

    function composeDeliveryAddress(street, entrance, floor, flat) {
      var st = formatStreetHouse(street) || String(street || "").trim();
      var parts = [];
      if (st) parts.push(st);
      var ent = String(entrance || "").trim();
      var fl = String(floor || "").trim();
      var ft = String(flat || "").trim();
      if (ent) {
        if (/^(подъезд|п\.|домофон)/i.test(ent)) parts.push(ent);
        else parts.push("п." + ent);
      }
      if (fl) {
        if (/^(этаж|эт\.)/i.test(fl)) parts.push(fl);
        else parts.push("эт." + fl);
      }
      if (ft) {
        ft = ft.replace(/^(квартира|кв\.?)\s*/i, "").trim();
        if (/^(квартира|кв\.)/i.test(ft)) parts.push(ft);
        else parts.push("кв." + ft);
      }
      return parts.join(" · ");
    }

    function formatStreetHouse(full) {
      var s = String(full || "").trim();
      if (!s) return "";

      if (typeof parseLatLonFromText_ === "function" && parseLatLonFromText_(s)) {
        return s.replace(/\s+/g, " ");
      }

      s = s.replace(/^\d{5,6}\s*,?\s*/g, "");

      s = s.replace(/(^|[^0-9.,])(\d{5,6})\s*$/g, "$1").trim();
      s = s.replace(/[,\s]+$/g, "").trim();
      var parts = s.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
      function dropPart(p) {
        if (/^(беларусь|belarus|by|минск|minsk)$/i.test(p)) return true;
        if (/^\d{5,6}$/.test(p)) return true;
        if (/область|region|район|district|республик|сельсовет|микрорайон|^мкр\.?$/i.test(p)) return true;
        if (/^минская\b/i.test(p) || /^minsk\s+region/i.test(p)) return true;
        return false;
      }
      var keep = parts.filter(function (p) { return !dropPart(p); });
      if (!keep.length) keep = parts.slice(0, 2);
      var out = [];
      for (var i = 0; i < keep.length; i++) {
        out.push(keep[i]);

        if (out.length >= 2) break;
        if (out.length === 1 && /\d/.test(keep[i]) && /[а-яa-z]/i.test(keep[i])) break; // "ул. X 12"
      }
      var joined = out.join(", ") || s;

      joined = joined
        .replace(/(?:^|[·|;,\s])(?:квартира|кв\.?)\s*[0-9]+[а-яa-z\-\/]*/gi, " ")
        .replace(/(?:^|[·|;,\s])[0-9]+[а-яa-z\-\/]*\s*кв\.?\b/gi, " ")
        .replace(/(?:^|[·|;,\s])(?:этаж|эт\.?)\s*[0-9]+[а-яa-z]?/gi, " ")
        .replace(/\s{2,}/g, " ")
        .replace(/^[·|;,\s]+|[·|;,\s]+$/g, "")
        .trim();
      return joined || s;
    }

    function parseLatLonFromText_(text) {
      var s = String(text || "").trim();
      if (!s) return null;
      var ym = s.match(/[?&#]pt=([+-]?\d{1,3}(?:[.,]\d+)?)\s*,\s*([+-]?\d{1,3}(?:[.,]\d+)?)/i);
      if (ym) {
        var ya = Number(String(ym[1]).replace(",", "."));
        var yb = Number(String(ym[2]).replace(",", "."));
        if (isFinite(ya) && isFinite(yb)) return orderLatLonPair_(ya, yb);
      }
      s = s.replace(/^@+/, "").trim();

      var m = s.match(/^([+-]?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]+\s*([+-]?\d{1,3}(?:[.,]\d+)?)\s*$/);
      if (!m) return null;
      if (!/[.,]\d/.test(m[1]) && !/[.,]\d/.test(m[2])) return null;
      var x = Number(String(m[1]).replace(",", "."));
      var y = Number(String(m[2]).replace(",", "."));
      if (!isFinite(x) || !isFinite(y)) return null;
      return orderLatLonPair_(x, y);
    }

    function orderLatLonPair_(a, b) {

      if (a >= 50 && a <= 58 && b >= 22 && b <= 41) return { lat: a, lon: b };
      if (b >= 50 && b <= 58 && a >= 22 && a <= 41) return { lat: b, lon: a };
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lon: b };
      if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lon: a };
      return null;
    }

    function looksLikeOtherCity(addr) {
      return /(брест|гродн|гомел|витебск|могил[её]в|борисов|жодино|молодечн|баранович|пинск|орша|полоцк|лида|слоним|бобруйск|солигорск|слуцк|дзержинск|фанипол|смолевич|светлогорск|жлобин|речиц|новополоцк|мозыр|колодищ|голодищ|городищ|боровлян|жданович|ратомк|миханович|семков|прилук|крыжовк|хатежин|тарасов|раубич|озерц|щепич|заславл|логойск|руденск|мачулищ|сеница|копищ|юхновк|лесной|гай\b)/i.test(addr);
    }

    function haversineKm(a, b) {
      const R = 6371;
      const dLat = (b.lat - a.lat) * Math.PI / 180;
      const dLon = (b.lon - a.lon) * Math.PI / 180;
      const la1 = a.lat * Math.PI / 180;
      const la2 = b.lat * Math.PI / 180;
      const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * R * Math.asin(Math.sqrt(h));
    }

    function sanitizeNoteItemKey_(key) {
      return String(key || "").trim().replace(/[\[\]\|]/g, " ").replace(/\s+/g, " ").trim();
    }

    function serializeOrderNotes(list) {
      var parts = [];
      (list || []).forEach(function (n) {
        var t = String(n.text || "").trim();
        if (!t) return;
        var roles = [];
        if (n.roles && n.roles.mgr) roles.push("mgr");
        if (n.roles && n.roles.cut) roles.push("cut");
        if (n.roles && n.roles.cour) roles.push("cour");
        if (!roles.length) roles = ["cour"];
        var kind = n.permanent ? "perm" : "once";
        var item = sanitizeNoteItemKey_(n.itemKey);
        var tag = "[NOTE:" + roles.join(",") + "|" + kind + (item && roles.indexOf("cut") >= 0 ? ("|ITEM:" + item) : "") + "]";
        parts.push(tag + " " + t);
      });
      return parts.join(" || ");
    }

    function parseOrderNotes(raw) {
      var s = String(raw || "").trim();
      if (!s) return [];
      var blocks = [];
      var re = /\[NOTE:([^\|\]]+)\|(perm|once)(?:\|ITEM:([^\]]+))?\]\s*([^]*?)(?=\s*\|\|\s*\[NOTE:|$)/gi;
      var m;
      while ((m = re.exec(s))) {
        var rolesArr = String(m[1] || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
        var text = String(m[4] || "").trim();
        if (!text) continue;
        blocks.push({
          text: text,
          roles: {
            mgr: rolesArr.indexOf("mgr") >= 0,
            cut: rolesArr.indexOf("cut") >= 0,
            cour: rolesArr.indexOf("cour") >= 0
          },
          permanent: m[2] === "perm",
          itemKey: String(m[3] || "").trim()
        });
      }
      if (blocks.length) return blocks;
      var plain = s
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (!plain) return [];
      return [{
        text: plain,
        roles: { mgr: false, cut: false, cour: true },
        permanent: false,
        itemKey: ""
      }];
    }

    function stripDeliveryTags(note) {
      return String(note || "")
        .replace(/\[ЕВРОПОЧТА\]/gi, "")
        .replace(/\[БЕЛПОЧТА\]/gi, "")
        .replace(/\[КУРЬЕР\]/gi, "")
        .replace(/\[ОТДЕЛЕНИЕ:[^\]]*\]/gi, "")
        .replace(/\[TO:[^\]]+\]/gi, "")
        .replace(/\[NOTE:[^\]]+\]/gi, "")
        .replace(/\[TEL:[^\]]+\]/gi, "")
        .replace(/\[PAID:[^\]]+\]/gi, "")
        .replace(/\[ЦЕНА:[^\]]*\]/gi, "")
        .replace(/\[GEO:[^\]]+\]/gi, "")
        .replace(/\[YMAPS:[^\]]+\]/gi, "")
        .replace(/\[SEG:[^\]]*\]/gi, "")
        .replace(/\[SUB:[^\]]*\]/gi, "")
        .replace(/\[ПП[^\]]*\]/gi, "")
        .replace(/ПП\s*N\s*=\s*\d+[^\n[]*/gi, "")
        .replace(/\[НЕ РЕЗАТЬ\]/gi, "")
        .replace(/\[РЕЗАТЬ\]/gi, "")
        .replace(/\b[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT[^\n|]*/gi, "")
        .replace(/\([^)]*(?:Standard Time|Daylight|Europe\/)[^)]*\)/gi, "")
        .replace(/\|\|/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function stripOfficeTag(note) {
      return String(note || "")
        .replace(/\[ОТДЕЛЕНИЕ:[^\]]*\]/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function applyOfficeTag(note, officeAddr) {
      const clean = stripOfficeTag(note);
      const addr = String(officeAddr || "").trim();
      if (!addr) return clean;
      return (clean + " [ОТДЕЛЕНИЕ:" + addr.replace(/[\[\]]/g, "") + "]").trim();
    }

    function applyDeliveryTag(note, method) {
      const clean = stripDeliveryTags(note);
      const tag = method === "euro" ? "[ЕВРОПОЧТА]" : method === "bel" ? "[БЕЛПОЧТА]" : method === "courier" ? "[КУРЬЕР]" : "";
      return (tag + (clean ? " " + clean : "")).trim();
    }

    function peelServiceCoords_(text) {
      var G = (typeof globalThis !== "undefined" && globalThis.BoinyaWishesGeo) || null;
      if (G && G.peel) return G.peel(text);
      var s = String(text || "")
        .replace(/\[GEO:[^\]]+\]/gi, " ")
        .replace(/\[YMAPS:[^\]]+\]/gi, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      return { text: s, geo: null, geos: [] };
    }

    function stripGeoTags(note) {
      return peelServiceCoords_(note).text;
    }

    function orderTypeToSegment_(ot) {
      if (ot === "bp") return "БП";
      if (ot === "pp") return "ПП";
      if (ot === "retail") return "Р";
      if (ot === "partner") return "ПАРТНЁР";
      return "";
    }

    function segmentToOrderType_(seg) {
      var s = String(seg || "").trim().toUpperCase();
      if (!s) return "";
      if (s === "БП" || s === "BP") return "bp";
      if (s === "ПП" || s === "PP" || s === "АФК" || s === "AFK" || s === "SUBSCRIPTION") return "pp";
      if (s === "Р" || s === "R" || s === "RETAIL" || s === "РОЗНИЦА") return "retail";
      if (s.indexOf("ПАРТ") === 0 || s === "PARTNER" || s === "ВАРКА") return "partner";
      return "";
    }

    function scoreClientNick(nick, q) {
      var n = String(nick || "").toUpperCase().replace(/\s+/g, " ").trim();
      var qu = String(q || "").toUpperCase().replace(/\s+/g, " ").trim();
      if (!n || !qu) return 0;
      if (n === qu) return 100;

      var nCore = n.replace(/\bВАРКА\b/g, "").replace(/\s+/g, " ").trim();
      var qCore = qu.replace(/\bВАРКА\b/g, "").replace(/\s+/g, " ").trim();
      if (/\bВАРКА\b/.test(n) || /\bВАРКА\b/.test(qu)) {
        if (!qCore) {

          if (n.indexOf(qu) === 0) return 60;
          return n === qu ? 100 : 0;
        }
        if (nCore === qCore) return 98;
        if (nCore.indexOf(qCore) === 0) return 90;
        if (nCore.indexOf(qCore) >= 0) return 80;
        if (qCore.indexOf(nCore) >= 0 && nCore.length >= 3) return 75;
        return 0;
      }
      if (n.indexOf(qu) === 0) return 92;
      if (n.indexOf(qu) >= 0) return 78;
      var words = n.split(/[\s._\-@]+/).filter(Boolean);
      for (var i = 0; i < words.length; i++) {
        if (words[i].indexOf(qu) === 0) return 85;
        if (words[i].indexOf(qu) >= 0) return 70;
      }
      var n2 = n.replace(/[\s._\-@]/g, "");
      var q2 = qu.replace(/[\s._\-@]/g, "");
      if (n2.indexOf(q2) === 0) return 88;
      if (n2.indexOf(q2) >= 0) return 72;
      return 0;
    }

    function syncOrderBasketFromActive_() {
      orderBaskets[orderActiveDog] = (basket || []).slice();
    }

    function orderSaveUsesTwoDogs_() {
      var b1 = orderBaskets[1] || [];
      var b2 = orderBaskets[2] || [];
      return orderDogCount >= 2 && b1.length > 0 && b2.length > 0;
    }

    function buildOrderSaveBasket_() {
      syncOrderBasketFromActive_();
      var out = [];
      var twoDogs = orderSaveUsesTwoDogs_();
      if (!twoDogs) {
        var b1 = orderBaskets[1] || [];
        var b2 = orderBaskets[2] || [];
        var src = b1.length ? 1 : (b2.length ? 2 : (orderActiveDog || 1));
        (orderBaskets[src] || []).forEach(function (x) {
          out.push(serializeBasketItem_(x));
        });
        return out;
      }
      for (var d = 1; d <= 2; d++) {
        (orderBaskets[d] || []).forEach(function (x) {
          out.push(serializeBasketItem_(x, { dog: d }));
        });
      }
      return out;
    }

    function currentPpSlotPayload_() {
      if (orderType !== "pp") return { deliverySlot: "", ppSlot: "", deliveriesN: "" };
      var slot = ppDeliverySlotManual;
      var n = Number(ppDeliveriesN) || 0;
      // N=1: никогда не писать «1/2» / «2/2»
      if (n === 1) {
        return { deliverySlot: 1, ppSlot: "1", deliveriesN: 1 };
      }
      if (n >= 2) {
        if (!(slot >= 1) && !ppNeedManualSlot) slot = 1;
        if (!(slot >= 1)) return { deliverySlot: "", ppSlot: "", deliveriesN: n };
        return { deliverySlot: slot, ppSlot: slot + "/" + n, deliveriesN: n };
      }
      // N ещё неизвестен — не выдумывать знаменатель 2
      if (!(slot >= 1)) return { deliverySlot: "", ppSlot: "", deliveriesN: "" };
      return { deliverySlot: slot, ppSlot: String(slot), deliveriesN: "" };
    }

  function applyState(s) {
    s = s || {};
    orderType = s.orderType || "pp";
    orderDogCount = Number(s.dogCount) === 2 ? 2 : 1;
    orderActiveDog = Number(s.activeDog) === 2 ? 2 : 1;
    var b1 = (s.baskets && s.baskets[1]) ? s.baskets[1] : (s.basket || []);
    var b2 = (s.baskets && s.baskets[2]) ? s.baskets[2] : [];
    orderBaskets = { 1: b1.slice(), 2: b2.slice() };
    if (orderDogCount < 2) orderBaskets[2] = b2.slice();
    basket = (orderBaskets[orderActiveDog] || []).slice();
    orderNotes = Array.isArray(s.notes) ? s.notes : [];
    ppDeliverySlotManual = (s.ppSlotManual === 1 || s.ppSlotManual === 2) ? s.ppSlotManual : null;
    ppDeliveriesN = Number(s.deliveriesN) || 0;
    ppNeedManualSlot = !!s.needManualSlot;
    retailPaidDelivery = !!s.retailPaidDelivery;
    retailPriceManual = !!s.retailPriceManual;
    if (s.retailDeliveryFee != null && isFinite(Number(s.retailDeliveryFee))) PRICE_RETAIL_DELIVERY_BYN = Number(s.retailDeliveryFee);
    if (s.retailFreeFrom != null && isFinite(Number(s.retailFreeFrom))) PRICE_RETAIL_FREE_FROM = Number(s.retailFreeFrom);
  }

  function retailQuote(list, paid) {
    var local = calcRetailBasketTotal(list || [], { deliveriesN: 1, applyDelivery: false });
    if (paid && local.goods > 0) {
      local.delivery = PRICE_RETAIL_DELIVERY_BYN;
      local.deliveryTimes = 1;
      local.total = Math.round((local.goods + local.delivery) * 100) / 100;
      local.paidDeliveryForced = true;
    }
    return local;
  }

  return {
    applyState: applyState,
    retailQuote: retailQuote,
    catalog: catalog,
    calcRetailBasketTotal: calcRetailBasketTotal,
    applyRetailPriceMapToUi_: applyRetailPriceMapToUi_,
    retailLineCost: retailLineCost,
    buildOrderSaveBasket_: buildOrderSaveBasket_,
    serializeBasketItem_: serializeBasketItem_,
    serializeOrderNotes: serializeOrderNotes,
    parseOrderNotes: parseOrderNotes,
    composeDeliveryAddress: composeDeliveryAddress,
    formatStreetHouse: formatStreetHouse,
    parseDeliveryAddress: parseDeliveryAddress,
    parseLatLonFromText_: parseLatLonFromText_,
    orderTypeToSegment_: orderTypeToSegment_,
    currentPpSlotPayload_: currentPpSlotPayload_,
    applyDeliveryTag: applyDeliveryTag,
    applyOfficeTag: applyOfficeTag,
    stripDeliveryTags: stripDeliveryTags,
    stripOfficeTag: stripOfficeTag,
    stripGeoTags: stripGeoTags,
    looksLikeOtherCity: looksLikeOtherCity,
    haversineKm: haversineKm,
    parseIgLinesToItems: parseIgLinesToItems,
    mapApiBasketToLocal: mapApiBasketToLocal,
    catalogItemsForUi_: catalogItemsForUi_,
    catalogFractionsForUi_: catalogFractionsForUi_,
    catalogFracRequired_: catalogFracRequired_,
    unitForItem: unitForItem,
    prettyProductName: prettyProductName,
    humanFraction: humanFraction,
    crumbSourceNames_: crumbSourceNames_,
    isPieceSkuName: isPieceSkuName,
    buildIgKnownMap: buildIgKnownMap,
    igAliasResolve: igAliasResolve,
    dressuraFractionSizeKey: dressuraFractionSizeKey,
    dressuraFractionPickRate: dressuraFractionPickRate,
    dressuraFractionRates: dressuraFractionRates,
    crumbSourcePool_: crumbSourcePool_,
    isChewProductName_: isChewProductName_,
    isChewCrumbSource_: isChewCrumbSource_,
    scoreClientNick: scoreClientNick,
    isCrumbBasketItemUi_: isCrumbBasketItemUi_,
    crumbBasketDisplayMain_: crumbBasketDisplayMain_,
    crumbBasketSubLabel_: crumbBasketSubLabel_,
    PRICE_RETAIL_DELIVERY_BYN: function () { return PRICE_RETAIL_DELIVERY_BYN; },
    PRICE_RETAIL_FREE_FROM: function () { return PRICE_RETAIL_FREE_FROM; },
    MINSK_CENTER: { lat: 53.9023, lon: 27.5619 },
    MINSK_RADIUS_KM: 20
  };
});
