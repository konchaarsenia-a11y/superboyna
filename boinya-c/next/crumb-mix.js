/* Разбор строки чеклиста с крошкой и показ граммов источников. UMD, без order-engine. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoinyaCrumbMix = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var WORDS = [
    { re: /баран(?:ье|ьего|ьему|ья|ьей)?\s+л[её]гк(?:ое|ого|ом)?/i, name: "БАРАНЬЕ ЛЁГКОЕ", kind: "meat", cat: "dressura" },
    { re: /л[её]гк(?:ое|ого|ом)?/i, name: "ЛЁГКОЕ", kind: "meat", cat: "dressura" },
    { re: /сердц(?:е|а|ем)?/i, name: "СЕРДЦЕ", kind: "meat", cat: "dressura" },
    { re: /руб(?:ец|ца|цом|цу)(?:\s*т)?/i, name: "РУБЕЦ Т", kind: "meat", cat: "dressura" },
    { re: /поч(?:ки|ек|ка|ку|кой)/i, name: "ПОЧКИ", kind: "meat", cat: "dressura" },
    { re: /яблок(?:и|о|а)?/i, name: "ЯБЛОКИ", kind: "veg", cat: "veg" },
    { re: /тыкв(?:а|ы|у)?/i, name: "ТЫКВА", kind: "veg", cat: "veg" },
    { re: /морков(?:ь|и)?/i, name: "МОРКОВЬ", kind: "veg", cat: "veg" },
    { re: /банан(?:ы|а)?/i, name: "БАНАНЫ", kind: "veg", cat: "veg" },
    { re: /груш(?:а|и|ы)?/i, name: "ГРУШИ", kind: "veg", cat: "veg" },
    { re: /батат(?:а)?/i, name: "БАТАТ", kind: "veg", cat: "veg" },
    { re: /кабач(?:ок|ка)?/i, name: "КАБАЧОК", kind: "veg", cat: "veg" }
  ];

  function earliest(text) {
    var best = null;
    var i;
    for (i = 0; i < WORDS.length; i++) {
      var m = text.match(WORDS[i].re);
      if (!m) continue;
      if (!best || m.index < best.index) best = { index: m.index, len: m[0].length, w: WORDS[i] };
    }
    return best;
  }

  function parseLine(line) {
    var raw = String(line || "");
    if (!/крошк/i.test(raw)) return null;
    var hypo = /гипо/i.test(raw);
    var work = raw;
    var found = [];
    var guard = 0;
    while (work && guard++ < 8) {
      var hit = earliest(work);
      if (!hit) break;
      var after = work.slice(hit.index + hit.len);
      var next = earliest(after);
      var head = next ? after.slice(0, next.index) : after;
      var num = head.match(/(\d+(?:[.,]\d+)?)/);
      if (!num) {
        work = after;
        continue;
      }
      var grams = Number(String(num[1]).replace(",", "."));
      if (!(grams > 0)) {
        work = after;
        continue;
      }
      found.push({ name: hit.w.name, kind: hit.w.kind, cat: hit.w.cat, grams: grams });
      work = next ? after.slice(next.index) : "";
    }
    if (!found.length) return null;
    var tier = mix4TierFromSources_(found, hypo);
    var ratio = found.map(function (f) { return f.grams; });
    var value = 0;
    ratio.forEach(function (n) { value += n; });
    return {
      cat: "crumb",
      main: "КРОШКА",
      name: "КРОШКА",
      sub: "",
      crumbKind: "mix4:" + tier,
      value: value,
      ratio: ratio.slice(),
      sources: found.map(function (f) {
        return { cat: f.cat, name: f.name, main: f.name, sub: "", val: f.grams, value: f.grams };
      })
    };
  }

  function parseText(text) {
    var items = [];
    var rest = [];
    String(text || "").split(/\r?\n/).forEach(function (line) {
      if (!String(line).trim()) return;
      var row = parseLine(line);
      if (row) items.push(row);
      else rest.push(line);
    });
    return { items: items, rest: rest.join("\n") };
  }

  function ratioIndexOf(g, src, fallback) {
    if (src && src._ix != null) return src._ix;
    var list = (g && g.sources) || [];
    var i;
    for (i = 0; i < list.length; i++) if (list[i] === src) return i;
    return fallback;
  }

  /* Остаток грамма отдаём тем, у кого больше дробная часть. Сумма = заказанный вес долей. */
  function apportionGrams(exacts) {
    var n = exacts.length;
    var floors = [];
    var used = 0;
    var target = 0;
    var i;
    for (i = 0; i < n; i++) {
      var x = Number(exacts[i]) || 0;
      if (x < 0) x = 0;
      target += x;
      floors.push(Math.floor(x));
      used += floors[i];
    }
    target = Math.round(target);
    var rem = target - used;
    var order = [];
    for (i = 0; i < n; i++) order.push({ i: i, f: (Number(exacts[i]) || 0) - floors[i] });
    order.sort(function (a, b) { return b.f - a.f || a.i - b.i; });
    var k;
    for (k = 0; k < rem && k < order.length; k++) floors[order[k].i] += 1;
    return floors;
  }

  function componentQtyList(g, sources) {
    var list = sources || [];
    var n = list.length;
    var total = Math.round(Number(g && (g.val != null ? g.val : g.value)) || 0);
    if (!(total > 0) || !n) return list.map(function () { return 0; });
    var own = [];
    var ownSum = 0;
    var ownAll = true;
    var i;
    for (i = 0; i < n; i++) {
      var v = Number(list[i] && (list[i].val != null ? list[i].val : list[i].value));
      if (isFinite(v) && v > 0) {
        var r = Math.round(v);
        own.push(r);
        ownSum += r;
      } else {
        ownAll = false;
        own.push(0);
      }
    }
    if (ownAll && ownSum === total) return own;
    var ratio = Array.isArray(g && g.ratio) ? g.ratio : [];
    var full = 0;
    for (i = 0; i < ratio.length; i++) full += Number(ratio[i]) || 0;
    if (full > 0) {
      var exacts = list.map(function (s, idx) {
        var ix = ratioIndexOf(g, s, idx);
        return total * ((Number(ratio[ix]) || 0) / full);
      });
      var sumExact = 0;
      exacts.forEach(function (x) { sumExact += x; });
      if (sumExact > 0) return apportionGrams(exacts);
    }
    var even = [];
    for (i = 0; i < n; i++) even.push(total / n);
    return apportionGrams(even);
  }

  function partQty(g, src, index) {
    var list = sourcesOf(g);
    var use = list.length ? list : [src];
    var at = index || 0;
    if (list.length) {
      var found = -1;
      var i;
      for (i = 0; i < list.length; i++) if (list[i] === src) found = i;
      if (found >= 0) at = found;
      else if (at >= list.length) at = 0;
    }
    var qty = componentQtyList(g, use);
    var q = qty[at] || 0;
    if (!(q > 0)) return null;
    return { qty: q, unit: (src && src.unit) || (g && g.unit) || "г" };
  }

  function isChewName(name) {
    var n = String(name || "");
    if (/трахе|аорт|ухо|ушк|корен|хрящ|копыт|носы|шеи|шея|губы|лопат|перепел|станов|колен/i.test(n)) return true;
    if (/(^|[^а-яёa-z0-9])нос([^а-яёa-z0-9]|$)/i.test(n)) return true;
    return false;
  }

  function isChewSource(s) {
    if (!s) return false;
    var cat = String(s.cat || "").toLowerCase();
    if (cat === "chew" || cat === "chews") return true;
    return isChewName(s.name || s.main || "");
  }

  function isTierOrFractionSub(sub) {
    var t = String(sub || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
    if (!t || t === "крошка") return true;
    if (t.indexOf("+") >= 0) return false;
    if (/^(микс|мясные|гипоаллерген|овощи|фрукты|дрессура)\b/.test(t)) return true;
    if (/мясные \(дрессура\)|овощи\/фрукты|микс мясной|микс гипо/.test(t)) return true;
    if (/^(очень мелкое|мелкое|среднее|крупное|целое|ломтики|полоски|кусочки|кубики|мелкий кубик|очень мелкий кубик|крупный кубик|средний кубик|мелкие кусочки|очень мелкие кусочки|средние кусочки|крупные кусочки|пластинки|половинки|палочки)$/.test(t)) return true;
    return false;
  }

  function sourcesOf(g) {
    var out = [];
    if (g && Array.isArray(g.sources)) {
      g.sources.forEach(function (s, i) {
        if (s == null || s === "") return;
        if (typeof s === "string") {
          var sn = String(s).trim();
          if (!sn || isChewName(sn)) return;
          out.push({ name: sn, main: sn, _ix: i });
          return;
        }
        if (isChewSource(s)) return;
        var name = String(s.name || s.main || "").trim();
        if (!name || isChewName(name)) return;
        out.push(s);
      });
    }
    if (out.length) return out;
    var hadSources = g && Array.isArray(g.sources) && g.sources.length;
    if (hadSources) return out;
    var sub = String((g && g.sub) || "").trim();
    if (!sub || isTierOrFractionSub(sub)) return out;
    var parts = sub.indexOf("+") >= 0 ? sub.split(/\s*\+\s*/) : [sub];
    parts.forEach(function (p, i) {
      var bit = String(p || "").trim();
      if (!bit || isTierOrFractionSub(bit) || isChewName(bit)) return;
      out.push({ name: bit, main: bit, _ix: i });
    });
    return out;
  }

  function sourcePos(g, s) {
    var list = (g && g.sources) || [];
    var i;
    for (i = 0; i < list.length; i++) if (list[i] === s) return i;
    return 0;
  }

  function sourceCount(g) {
    var n = (g && g.sources && g.sources.length) || 0;
    return n || sourcesOf(g).length;
  }

  function isCrumb(g) {
    if (!g) return false;
    if (String(g.cat || "").toLowerCase() === "crumb" || g.crumbKind) return true;
    if (sourcesOf(g).length) return true;
    if (/^крошк/i.test(String(g.sub || "").trim())) return true;
    return /крошк/i.test(String(g.name || g.main || ""));
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function genitive(name) {
    var n = String(name || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
    n = n.replace(/^КРОШКА\s+/, "").replace(/\s*ШТ\.?$/, "").trim();
    if (/БАРАН/.test(n) && /ЛЕГК/.test(n)) return "бараньего лёгкого";
    if (/БАРАН/.test(n) && /ПЕЧЕН/.test(n)) return "бараньей печени";
    if (/ЛЕГК/.test(n)) return "лёгкого";
    if (/СЕРДЦ/.test(n)) return "сердца";
    if (/РУБ/.test(n)) return "рубца";
    if (/ПОЧ/.test(n)) return "почек";
    if (/ПЕЧЕН/.test(n)) return "печени";
    if (/ИНДЕЙ/.test(n)) return "индейки";
    if (/ВЫМ/.test(n)) return "вымени";
    if (/СЕМЕН/.test(n)) return "семенников";
    if (/МЯСН/.test(n) && /ЛОМТ/.test(n)) return "мясных ломтиков";
    if (/БАНАН/.test(n)) return "бананов";
    if (/ЯБЛОК/.test(n)) return "яблок";
    if (/ГРУШ/.test(n)) return "груш";
    if (/МОРКОВ/.test(n)) return "моркови";
    if (/ТЫКВ/.test(n)) return "тыквы";
    if (/БАТАТ/.test(n)) return "батата";
    if (/КАБАЧ/.test(n)) return "кабачка";
    return String(name || "").toLowerCase();
  }

  function singleLabel(name, grams) {
    var bit = grams ? (" — " + grams + " г") : "";
    return "Крошка " + genitive(name) + bit;
  }

  function titleOf(name, pretty) {
    if (pretty) {
      try {
        var p = pretty(name);
        if (p) return p;
      } catch (e) {}
    }
    return String(name || "").toLowerCase().replace(/(^|\s)(\S)/g, function (_, sp, ch) { return sp + ch.toUpperCase(); });
  }

  function nominative(name, pretty) {
    return String(titleOf(name, pretty) || name || "").toLowerCase();
  }

  function groupOf(g) {
    if (isCrumb(g)) return "Крошка";
    var cat = String((g && g.cat) || "").toLowerCase();
    var name = String((g && (g.name || g.main)) || "");
    if (cat === "chew" || cat === "chews") return "Жевалки";
    if (/трахе|аорт|ухо|ушк|корен|хрящ|копыт|носы|шеи|шея|губы|лопат|перепел|станов|колен/i.test(name)) return "Жевалки";
    if (/(^|[^а-яёa-z0-9])нос([^а-яёa-z0-9]|$)/i.test(name)) return "Жевалки";
    return "Мясо";
  }

  function mix3KindOf(g) {
    var raw = String((g && g.crumbKind) || "");
    var m = /^mix3:(mix|meat|hypo)$/i.exec(raw);
    if (m) return m[1].toLowerCase();
    if (g && g.crumbScheme === "mix3") {
      var k = raw.toLowerCase();
      if (k === "meat" || k === "hypo" || k === "mix") return k;
      return "mix";
    }
    return "";
  }

  function mix3Title(kind) {
    if (kind === "hypo") return "Микс гипоаллергенный";
    if (kind === "meat") return "Микс мясной";
    return "Микс";
  }

  function mix4KindOf(g) {
    var m = /^mix4:(dress|veg|hypo)$/i.exec(String((g && g.crumbKind) || ""));
    return m ? m[1].toLowerCase() : "";
  }

  function mix4Title(kind) {
    if (kind === "hypo") return "Гипоаллергенные";
    if (kind === "veg") return "Овощи/фрукты";
    return "Мясные (дрессура)";
  }

  function mix4TierFromSources_(found, hypo) {
    if (hypo) return "hypo";
    var sawVeg = false;
    var sawDress = false;
    var sawHypo = false;
    (found || []).forEach(function (f) {
      var n = String(f.name || "").toUpperCase().replace(/Ё/g, "Е");
      if (/ТЫКВ|ЯБЛОК|ГРУШ|МОРКОВ|БАТАТ|БАНАН|КАБАЧ/.test(n)) {
        sawVeg = true;
        return;
      }
      if (n === "ЛЕГКОЕ" || n === "СЕРДЦЕ" || n === "РУБЕЦ Т" || n === "БАРАНЬЕ ЛЕГКОЕ" || n === "ПОЧКИ") {
        sawDress = true;
        return;
      }
      if (/КРОЛИК|ИНДЕЙК|БАРАН/.test(n)) {
        sawHypo = true;
        return;
      }
      sawDress = true;
    });
    if (sawHypo && !sawDress) return "hypo";
    if (!sawDress && sawVeg) return "veg";
    return "dress";
  }

  function mix3TierFromSources_(found, hypo, meatWord) {
    if (hypo) return "hypo";
    if (meatWord) return "meat";
    var tier = "";
    (found || []).forEach(function (f) {
      if (tier) return;
      var n = String(f.name || "").toUpperCase().replace(/Ё/g, "Е");
      if (/ТЫКВ|ЯБЛОК|ГРУШ|МОРКОВ|БАТАТ|БАНАН|КАБАЧ/.test(n)) return;
      if (n === "ЛЕГКОЕ" || n === "СЕРДЦЕ" || n === "РУБЕЦ Т" || n === "БАРАНЬЕ ЛЕГКОЕ" || n === "ПОЧКИ") {
        tier = "mix";
        return;
      }
      if (/КРОЛИК|ИНДЕЙК|БАРАН/.test(n)) {
        tier = "hypo";
        return;
      }
      tier = "meat";
    });
    return tier || "mix";
  }

  function lineHtml(g, pretty) {
    if (!g) return "";
    var src = sourcesOf(g);
    var kind4 = mix4KindOf(g);
    var schemeKind = kind4 || mix3KindOf(g);
    if (isCrumb(g) && schemeKind && src.length) {
      var totalM = Number(g.val != null ? g.val : g.value);
      var headM = kind4 ? mix4Title(kind4) : mix3Title(schemeKind);
      if (isFinite(totalM) && totalM > 0) headM += " — " + totalM + " " + (g.unit || "г");
      var qtyM = componentQtyList(g, src);
      var partsM = src.map(function (s, si) {
        var label = nominative(s.name || s.main, pretty);
        var text = qtyM[si] > 0 ? (label + " — " + qtyM[si] + " г") : label;
        return '<div class="mix-part">' + esc(text) + "</div>";
      }).join("");
      return '<div class="mix"><div class="mix-title">' + esc(headM) + '</div><div class="mix-parts">' + partsM + "</div></div>";
    }
    if (isCrumb(g) && src.length >= 2) {
      var total = Number(g.val != null ? g.val : g.value);
      var head = "Крошка микс";
      if (isFinite(total) && total > 0) head += " — " + total + " " + (g.unit || "г");
      var qtyMix = componentQtyList(g, src);
      var parts = src.map(function (s, si) {
        var label = nominative(s.name || s.main, pretty);
        var text = qtyMix[si] > 0 ? (label + " — " + qtyMix[si] + " г") : label;
        return '<div class="mix-part">' + esc(text) + "</div>";
      }).join("");
      return '<div class="mix"><div class="mix-title">' + esc(head) + '</div><div class="mix-parts">' + parts + "</div></div>";
    }
    if (isCrumb(g) && src.length === 1) {
      var oneQty = componentQtyList(g, src);
      var grams = oneQty[0] > 0 ? oneQty[0] : (g.val != null ? g.val : g.value);
      return "<div>" + esc(singleLabel(src[0].name || src[0].main, grams)) + "</div>";
    }
    if (isCrumb(g) && schemeKind) {
      var totalTier = Number(g.val != null ? g.val : g.value);
      var headTier = kind4 ? mix4Title(kind4) : mix3Title(schemeKind);
      if (isFinite(totalTier) && totalTier > 0) headTier += " — " + totalTier + " " + (g.unit || "г");
      return "<div>" + esc(headTier) + "</div>";
    }
    if (isCrumb(g)) {
      var val = g.val != null ? g.val : g.value;
      var parent = String(g.name || g.main || "").trim();
      if (parent && !/^крошка$/i.test(parent)) return "<div>" + esc(singleLabel(parent, val)) + "</div>";
      var bit = val != null && val !== "" ? (" — " + val + " г") : "";
      return "<div>" + esc("Крошка" + bit) + "</div>";
    }
    var nm = titleOf(g.name || g.main || "", pretty);
    var v = g.val != null ? g.val : g.value;
    var unit = g.unit || "";
    var word = "";
    var cut = typeof globalThis !== "undefined" ? globalThis.BoinyaCutFrac : null;
    if (cut && cut.applies(g)) {
      word = cut.phrase ? cut.phrase(g) : cut.label(g.frac);
      if (word && (!unit || unit === "гр")) unit = cut.defaultUnit(g);
    }
    var tail = v != null && v !== "" ? (" " + v + (unit ? " " + unit : "")) : "";
    if (word) tail += " " + word;
    return "<div>" + esc(nm + tail) + "</div>";
  }

  function linesHtml(basket, pretty, noteOf) {
    var order = ["Мясо", "Крошка", "Жевалки"];
    var buckets = { "Мясо": [], "Крошка": [], "Жевалки": [] };
    (basket || []).forEach(function (g) {
      if (!g) return;
      buckets[groupOf(g)].push(g);
    });
    return order.map(function (title) {
      var rows = buckets[title].map(function (g) {
        var extra = "";
        if (typeof noteOf === "function") {
          try { extra = noteOf(g) || ""; } catch (eNote) { extra = ""; }
        }
        return lineHtml(g, pretty) + extra;
      }).filter(Boolean);
      if (!rows.length) return "";
      return '<section class="nx-pack-grp"><div class="nx-grp">' + esc(title) + "</div>" + rows.join("") + "</section>";
    }).filter(Boolean).join("");
  }

  function organKey(name) {
    var n = String(name || "").toLowerCase().replace(/ё/g, "е");
    if (/баран/.test(n)) return "";
    if (/легк/.test(n)) return "light";
    if (/сердц/.test(n)) return "heart";
    if (/почк/.test(n)) return "kidney";
    if (/рубц|рубец/.test(n)) return "rumen";
    return "";
  }

  var WORD_RANK = {
    "очень мелкое": 1,
    "мелкое": 2,
    "мелкий кубик": 3,
    "среднее": 4,
    "крупное": 5,
    "целое": 6,
    "ломтики": 7,
    "полоски": 8,
    "кусочки": 9,
    "кубики": 4,
    "мелкие кубики": 3,
    "средний кубик": 4,
    "крупный кубик": 5,
    "очень мелкий кубик": 1,
    "мелкие кусочки": 2,
    "средние кусочки": 9,
    "крупные кусочки": 5,
    "очень мелкие кусочки": 1,
    "крошка": 10
  };

  function posRank(title) {
    var n = String(title || "").toUpperCase().replace(/Ё/g, "Е");
    if (/БАРАН/.test(n)) return 50;
    if (/ЛЕГК/.test(n)) return 10;
    if (/СЕРДЦ/.test(n)) return 20;
    if (/ПОЧ/.test(n)) return 30;
    if (/РУБ/.test(n)) return 40;
    return 60;
  }

  function wordRank(word) {
    if (!word) return 1000;
    if (WORD_RANK[word] != null) return WORD_RANK[word];
    return 500;
  }

  function gramsText(n) {
    var x = Math.round(Number(n) * 10) / 10;
    if (!(x > 0)) return "0";
    if (Math.abs(x - Math.round(x)) < 0.05) return String(Math.round(x));
    return String(x);
  }

  /* Итог сборки: каждая позиция дрессуры отдельно по sub (то же слово, что в строке заказа). */
  function dressuraSummary(basket, pretty) {
    var cut = typeof globalThis !== "undefined" ? globalThis.BoinyaCutFrac : null;
    var groups = [];
    var index = Object.create(null);
    function add(name, grams, word) {
      var title = "";
      if (pretty) {
        try { title = pretty(name) || ""; } catch (e) { title = ""; }
      }
      if (!title) title = titleOf(name, null);
      var key = String(title || "").toLowerCase();
      if (!key) return;
      if (!index[key]) {
        index[key] = { title: title, parts: [] };
        groups.push(index[key]);
      }
      var row = null;
      var i;
      for (i = 0; i < index[key].parts.length; i++) {
        if (index[key].parts[i].word === word) row = index[key].parts[i];
      }
      if (!row) {
        row = { word: word, grams: 0 };
        index[key].parts.push(row);
      }
      row.grams += grams;
    }
    (basket || []).forEach(function (it) {
      if (!it || isCrumb(it)) return;
      var cat = String(it.cat || "").toLowerCase();
      if (cat === "chew" || cat === "chews" || cat === "other" || cat === "veg" || cat === "crumb") return;
      var name = it.name || it.main || "";
      if (cat !== "dressura" && !organKey(name)) return;
      var grams = Number(it.val != null ? it.val : it.value) || 0;
      if (!(grams > 0)) return;
      var word = "";
      if (cut && cut.phrase && cut.applies(it)) word = cut.phrase(it);
      add(name, grams, word || "");
    });
    groups.sort(function (a, b) {
      var d = posRank(a.title) - posRank(b.title);
      if (d) return d;
      return String(a.title).localeCompare(String(b.title), "ru");
    });
    groups.forEach(function (g) {
      g.parts.sort(function (a, b) {
        var d = wordRank(a.word) - wordRank(b.word);
        if (d) return d;
        return String(a.word).localeCompare(String(b.word), "ru");
      });
    });
    return groups;
  }

  function dressuraSummaryHtml(groups) {
    if (!groups || !groups.length) return "";
    return '<div class="nx-orgs">' + groups.map(function (g) {
      return (g.parts || []).map(function (p) {
        var label = p.word ? (g.title + " " + p.word) : g.title;
        return '<div class="nx-org"><span>' + esc(label) + "</span><b>" + esc(gramsText(p.grams)) + " г</b></div>";
      }).join("");
    }).join("") + "</div>";
  }

  function organParts(basket) {
    var out = [];
    (basket || []).forEach(function (g) {
      if (!g) return;
      var src = sourcesOf(g);
      if (isCrumb(g) && src.length) {
        var qtys = componentQtyList(g, src);
        src.forEach(function (s, si) {
          var key = organKey(s.name || s.main);
          if (!key || !(qtys[si] > 0)) return;
          out.push({ key: key, grams: qtys[si], sub: s.sub || "крошка", name: s.name || s.main });
        });
        return;
      }
      var v = Number(g.val != null ? g.val : g.value) || 0;
      var key2 = organKey(g.name || g.main);
      if (!key2 || !(v > 0)) return;
      out.push({ key: key2, grams: v, sub: g.sub || "—", name: g.name || g.main });
    });
    return out;
  }

  return {
    parseLine: parseLine,
    parseText: parseText,
    partQty: partQty,
    linesHtml: linesHtml,
    rowHtml: lineHtml,
    singleLabel: singleLabel,
    mix3KindOf: mix3KindOf,
    mix3Title: mix3Title,
    plainLabel: function (g) {
      var html = lineHtml(g);
      return String(html || "").replace(/<[^>]+>/g, "");
    },
    genitive: genitive,
    organParts: organParts,
    dressuraSummary: dressuraSummary,
    dressuraSummaryHtml: dressuraSummaryHtml,
    isCrumb: isCrumb
  };
});
