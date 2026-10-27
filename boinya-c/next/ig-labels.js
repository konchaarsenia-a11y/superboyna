/* Подписи фракций как в прайсе Instagram. Внутренние ключи заказов не меняет. */
(function (root) {
  "use strict";

  function norm(s) {
    return String(s || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
  }

  function product(main) {
    var n = norm(main);
    if (!n || /КРОШК/.test(n)) return "";
    if (/БАРАНЬ/.test(n) && /ПЕЧЕН/.test(n)) return "liver-lamb";
    if (/БАРАНЬ/.test(n) && /ЛЕГК/.test(n)) return "lung-lamb";
    if (/ЛЕГК/.test(n)) return "lung";
    if (/СЕРДЦ/.test(n)) return "heart";
    if (/РУБЕЦ/.test(n)) return "rumen";
    if (/ПОЧК/.test(n)) return "kidney";
    if (/ИНДЕЙ/.test(n)) return "turkey";
    if (/БЫЧИЙ КОРЕН/.test(n)) return "root";
    if (/ТРАХЕ/.test(n)) return "trachea";
    if (/СТАНОВ/.test(n)) return "sinew";
    if (/УХО/.test(n)) return "ear";
    if (/АОРТ/.test(n)) return "aorta";
    return "";
  }

  function verySmall(fu) {
    return /ОЧЕНЬ\s*МЕЛК|^ОЧ\s*МЕЛК/.test(fu);
  }

  function igFractionWord(main, sub) {
    var p = product(main);
    var fu = norm(sub);
    if (!p || !fu) return "";
    if (p === "root") {
      if (fu === "МАЛ") return "маленький";
      if (fu === "СРЕД") return "средний";
      if (fu === "БОЛ") return "большой";
      if (fu === "ОГР") return "рогалик";
      return "";
    }
    if (p === "trachea") {
      if (fu === "МАЛ") return "маленькая";
      if (fu === "СРЕД") return "средняя";
      if (fu === "БОЛ") return "большая";
      return "";
    }
    if (p === "sinew") {
      if (/ПАЛК|ПАЛОЧ/.test(fu)) return "палочка";
      if (fu === "СРЕД" || /ПОЛОВИН/.test(fu)) return "половинка";
      if (fu === "БОЛ" || /^ЦЕЛ/.test(fu)) return "целая";
      return "";
    }
    if (p === "ear" || p === "aorta") {
      if (/ПОЛОВИН/.test(fu)) return "половинка";
      if (/ОБЫЧН/.test(fu) || /^ЦЕЛ/.test(fu)) return "целое";
      return "";
    }
    if (p === "lung") {
      if (verySmall(fu)) return "очень мелкий кубик";
      if (/^ЛОМТ/.test(fu) || /^ЦЕЛ/.test(fu)) return "ломтики";
      if (/^ПОЛОСК/.test(fu)) return "полоски";
      if (/^КРУП/.test(fu) || /^БОЛЬ/.test(fu)) return "крупный кубик";
      if (/^СРЕД/.test(fu) || (/КУБИК/.test(fu) && !/МЕЛК/.test(fu))) return "средний кубик";
      if (/^МЕЛК/.test(fu) || (/КУБИК/.test(fu) && /МЕЛК/.test(fu))) return "мелкий кубик";
      return "";
    }
    if (p === "lung-lamb") {
      if (verySmall(fu)) return "";
      if (/^ЛОМТ/.test(fu) || /^ЦЕЛ/.test(fu)) return "ломтики";
      if (/^ПОЛОСК/.test(fu)) return "полоски";
      if (/^СРЕД/.test(fu) || (/КУБИК/.test(fu) && !/МЕЛК/.test(fu))) return "кубики";
      if (/^МЕЛК/.test(fu) || (/КУБИК/.test(fu) && /МЕЛК/.test(fu))) return "мелкие кубики";
      return "";
    }
    if (p === "heart" || p === "rumen" || p === "kidney") {
      if (verySmall(fu)) return "очень мелкие кусочки";
      if (/^КУСОЧК/.test(fu) && !/МЕЛК/.test(fu)) return "средние кусочки";
      if (/МЕЛК/.test(fu) && /КУСОЧ/.test(fu)) return "мелкие кусочки";
      if (/^КРУП/.test(fu) || /^БОЛЬ/.test(fu)) return "крупные кусочки";
      if (/^ЛОМТ/.test(fu) || /^ЦЕЛ/.test(fu)) return p === "kidney" ? "средние кусочки" : "ломтики";
      if (/^ПОЛОСК/.test(fu)) return "полоски";
      if (/^СРЕД/.test(fu) && p === "rumen") return "средние кусочки";
      if (/^МЕЛК/.test(fu)) return "мелкие кусочки";
      return "";
    }
    if (p === "turkey" || p === "liver-lamb") {
      if (verySmall(fu)) return "";
      if (/^КУСОЧК/.test(fu) && !/МЕЛК/.test(fu)) return "кусочки";
      if (/МЕЛК/.test(fu) && /КУСОЧ/.test(fu)) return "мелкие кусочки";
      if (/^ЛОМТ/.test(fu) || /^ЦЕЛ/.test(fu)) return "ломтики";
      if (/^ПОЛОСК/.test(fu)) {
        if (p === "liver-lamb") return "кусочки";
        if (p === "turkey") return "";
        return "полоски";
      }
      if (/^МЕЛК/.test(fu)) return "мелкие кусочки";
      return "";
    }
    return "";
  }

  function relabelText(main, text) {
    var p = product(main);
    var t = String(text || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
    if (!p || !t) return "";
    if (p === "root") {
      if (t === "огромные" || t === "огромный") return "рогалик";
      if (t === "маленькие" || t === "маленький") return "маленький";
      if (t === "средние" || t === "средний") return "средний";
      if (t === "большие" || t === "большой") return "большой";
    }
    if (p === "trachea") {
      if (t === "маленькие" || t === "маленькая") return "маленькая";
      if (t === "средние" || t === "средняя") return "средняя";
      if (t === "большие" || t === "большая") return "большая";
    }
    if (p === "sinew") {
      if (t === "палочки" || t === "палочка") return "палочка";
      if (t === "средние" || t === "средняя") return "половинка";
      if (t === "большие" || t === "большая") return "целая";
    }
    if (p === "ear" || p === "aorta") {
      if (t === "половинки" || t === "половинка") return "половинка";
    }
    if (p === "lung") {
      if (t === "очень мелкое" || t === "очень мелкий кубик") return "очень мелкий кубик";
      if (t === "целое" || t === "ломтики") return "ломтики";
      if (t === "полоски") return "полоски";
      if (t === "крупное" || t === "крупный кубик") return "крупный кубик";
      if (t === "среднее" || t === "кубики" || t === "средний кубик") return "средний кубик";
      if (t === "мелкое" || t === "мелкий кубик" || t === "мелкие кубики") return "мелкий кубик";
    }
    if (p === "lung-lamb") {
      if (t === "целое" || t === "ломтики") return "ломтики";
      if (t === "среднее" || t === "кубики") return "кубики";
      if (t === "мелкое" || t === "мелкий кубик" || t === "мелкие кубики") return "мелкие кубики";
    }
    if (p === "heart" || p === "rumen" || p === "kidney") {
      if (t === "очень мелкое" || t === "очень мелкие кусочки") return "очень мелкие кусочки";
      if (t === "крупное" || t === "крупные кусочки") return "крупные кусочки";
      if (t === "кусочки" || t === "средние кусочки") return "средние кусочки";
      if (p === "rumen" && t === "среднее") return "средние кусочки";
      if (t === "мелкое" || t === "мелкие кусочки") return "мелкие кусочки";
      if (p === "kidney" && (t === "ломтики" || t === "целое")) return "средние кусочки";
      if ((p === "heart" || p === "rumen") && (t === "ломтики" || t === "целое")) return "ломтики";
      if (t === "полоски") return "полоски";
    }
    if (p === "liver-lamb" && t === "полоски") return "кусочки";
    if ((p === "turkey" || p === "liver-lamb") &&
        (t === "мелкое" || t === "мелкие кусочки")) return "мелкие кусочки";
    return "";
  }

  function relabelSizes(main, sizes) {
    var out = [];
    var index = Object.create(null);
    (sizes || []).forEach(function (s) {
      if (!s) return;
      var next = relabelText(main, s.text || s.label || "");
      var copy = {};
      var k;
      for (k in s) if (Object.prototype.hasOwnProperty.call(s, k)) copy[k] = s[k];
      if (next) {
        if (s.text || !s.label) copy.text = next;
        if (s.label) copy.label = next;
      }
      var key = String(copy.text || copy.label || "");
      if (key && index[key] != null) {
        var prev = out[index[key]];
        prev.dry = Math.round(((Number(prev.dry) || 0) + (Number(copy.dry) || 0)) * 100) / 100;
        return;
      }
      if (key) index[key] = out.length;
      out.push(copy);
    });
    return out;
  }

  function isPlainKusochki(sub) {
    var fu = norm(sub);
    return /^КУСОЧК/.test(fu) && !/МЕЛК/.test(fu);
  }

  function isCrumbLine(name, sub) {
    return /КРОШК/.test(norm(name)) || /КРОШК/.test(norm(sub));
  }

  function kusochkiSpec(main, sub) {
    if (isCrumbLine(main, sub)) return null;
    if (!isPlainKusochki(sub)) return null;
    var p = product(main);
    if (p === "heart") return { key: "СЕРДЦЕ|Кусочки", fallback: 13 };
    if (p === "rumen") return { key: "РУБЕЦ Т|Среднее", fallback: 13 };
    if (p === "kidney") return { key: "ПОЧКИ|Целое", fallback: 11 };
    return null;
  }

  function alignSpec(main, sub) {
    var spec = kusochkiSpec(main, sub);
    if (spec) return spec;
    if (isCrumbLine(main, sub)) return null;
    var fu = norm(sub);
    if (product(main) === "liver-lamb" && !verySmall(fu) && /^МЕЛК/.test(fu) && !/КУБИК/.test(fu)) {
      return { key: "БАРАНЬЯ ПЕЧЕНЬ|Мелкое", fallback: 19 };
    }
    if (product(main) === "rumen" && verySmall(fu)) {
      return { key: "РУБЕЦ Т|Очень мелкое", fallback: 15 };
    }
    return null;
  }

  function priceFromItems(items, key, fallback) {
    var i;
    for (i = 0; i < (items || []).length; i++) {
      var it = items[i];
      if (it && it.key === key && it.price != null && isFinite(Number(it.price))) return Number(it.price);
    }
    return fallback;
  }

  var savedItems = [];

  function kusochkiCost(name, sub, val) {
    var spec = alignSpec(name, sub);
    if (!spec) return null;
    var per = priceFromItems(savedItems, spec.key, spec.fallback);
    var v = Number(val) || 0;
    if (!(v > 0)) return { cost: 0, per: per, found: true };
    return { cost: Math.round((v / 100) * per * 100) / 100, per: per, found: true };
  }

  function rememberPrices(items) {
    savedItems = items || [];
  }

  function shownProductName(name) {
    var n = norm(name);
    if (n === "УХО К" || n === "УШКО К") return "Ушко кролика";
    return "";
  }

  var api = root.BoinyaOrderEngine;
  if (api) {
    if (typeof api.prettyProductName === "function") {
      var origPretty = api.prettyProductName;
      api.prettyProductName = function (name) {
        var shown = shownProductName(name);
        if (shown) return shown;
        return origPretty.apply(this, arguments);
      };
    }
    if (typeof api.humanFraction === "function") {
      var origWord = api.humanFraction;
      api.humanFraction = function (main, sub) {
        var word = igFractionWord(main, sub);
        if (word) return word;
        return origWord.apply(this, arguments);
      };
    }
    if (typeof api.catalogFractionsForUi_ === "function") {
      var origFr = api.catalogFractionsForUi_;
      api.catalogFractionsForUi_ = function (cat, name) {
        var fr = (origFr.apply(this, arguments) || []).slice();
        var n = norm(name);
        if (n === "СЕРДЦЕ" || n === "ИНДЕЙКА") {
          if (fr.indexOf("Кусочки") < 0) {
            var at = fr.indexOf("Полоски");
            fr.splice(at >= 0 ? at + 1 : fr.length, 0, "Кусочки");
          }
        }
        return fr;
      };
    }
    if (typeof api.applyRetailPriceMapToUi_ === "function") {
      var origApply = api.applyRetailPriceMapToUi_;
      api.applyRetailPriceMapToUi_ = function (items, delivery) {
        rememberPrices(items);
        return origApply.apply(this, arguments);
      };
    }
    if (typeof api.retailLineCost === "function") {
      var origLine = api.retailLineCost;
      api.retailLineCost = function (name, sub, val, cat, extra) {
        var hit = kusochkiCost(name, sub, val);
        if (hit) return hit;
        return origLine.apply(this, arguments);
      };
    }
    if (typeof api.calcRetailBasketTotal === "function") {
      var origCalc = api.calcRetailBasketTotal;
      api.calcRetailBasketTotal = function (list, opts) {
        opts = opts || {};
        var plain = [];
        var extraCost = 0;
        var extraLines = [];
        (list || []).forEach(function (it) {
          var name = (it && (it.name || it.main)) || "";
          var sub = (it && it.sub) || "";
          var val = it && it.val != null ? it.val : it && it.value;
          if (isCrumbLine(name, sub) || String((it && it.cat) || "") === "crumb") {
            plain.push(it);
            return;
          }
          var hit = kusochkiCost(name, sub, val);
          if (!hit) {
            plain.push(it);
            return;
          }
          extraCost += hit.cost;
          extraLines.push({
            name: name,
            sub: sub,
            val: Number(val) || 0,
            per100: hit.per,
            cost: hit.cost,
            found: true
          });
        });
        var base = origCalc.call(this, plain, opts) || {};
        var goods = Math.round(((Number(base.goods) || 0) + extraCost) * 100) / 100;
        var deliveriesN = Math.max(1, Number(opts.deliveriesN) || base.deliveriesN || 1);
        var applyDelivery = opts.applyDelivery !== false;
        var perDelivery = deliveriesN ? goods / deliveriesN : goods;
        var freeFrom = Number(base.freeFrom);
        var fee = Number(base.deliveryFee);
        var times = 0;
        var i;
        if (applyDelivery && goods > 0) {
          for (i = 0; i < deliveriesN; i++) if (perDelivery < freeFrom) times++;
        }
        var delivery = Math.round(times * fee * 100) / 100;
        return {
          total: Math.round((goods + delivery) * 100) / 100,
          goods: goods,
          delivery: delivery,
          deliveryTimes: times,
          perDelivery: Math.round(perDelivery * 100) / 100,
          deliveriesN: deliveriesN,
          freeFrom: freeFrom,
          deliveryFee: fee,
          lines: (base.lines || []).concat(extraLines),
          markup: base.markup,
          sheet: base.sheet
        };
      };
    }
  }

  root.BoinyaIgLabels = {
    shownProductName: shownProductName,
    igFractionWord: igFractionWord,
    relabelText: relabelText,
    relabelSizes: relabelSizes,
    kusochkiCost: kusochkiCost,
    rememberPrices: rememberPrices
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
