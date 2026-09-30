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
    var kind = hypo ? "hypo" : (found.every(function (f) { return f.kind === "veg"; }) ? "veg" : "meat");
    var ratio = found.map(function (f) { return f.grams; });
    var value = 0;
    ratio.forEach(function (n) { value += n; });
    return {
      cat: "crumb",
      main: "КРОШКА",
      name: "КРОШКА",
      sub: "",
      crumbKind: kind,
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

  function partQty(g, src, index, count) {
    var own = Number(src && (src.val != null ? src.val : src.value));
    if (isFinite(own) && own > 0) return { qty: own, unit: (src && src.unit) || "г" };
    var ratio = Array.isArray(g.ratio) ? g.ratio : [];
    var sumR = 0;
    var i;
    for (i = 0; i < count; i++) sumR += Number(ratio[i]) || 0;
    if (!(sumR > 0)) return null;
    var grams = Number(g.val != null ? g.val : g.value) || 0;
    if (!(grams > 0)) return null;
    var part = (Number(ratio[index]) || 0) / sumR;
    if (!(part > 0)) return null;
    var q = Math.round(grams * part);
    if (q <= 0) q = 1;
    return { qty: q, unit: (src && src.unit) || g.unit || "г" };
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

  function sourcesOf(g) {
    var out = [];
    if (g && Array.isArray(g.sources)) {
      g.sources.forEach(function (s) {
        if (!s || isChewSource(s)) return;
        var name = String(s.name || s.main || "").trim();
        if (!name || isChewName(name)) return;
        out.push(s);
      });
    }
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

  function lineHtml(g, pretty) {
    if (!g) return "";
    var src = sourcesOf(g);
    if (isCrumb(g) && src.length >= 2) {
      var total = Number(g.val != null ? g.val : g.value);
      var head = "Крошка микс";
      if (isFinite(total) && total > 0) head += " — " + total + " " + (g.unit || "г");
      var parts = src.map(function (s) {
        var q = partQty(g, s, sourcePos(g, s), sourceCount(g));
        var label = nominative(s.name || s.main, pretty);
        var text = q ? (label + " — " + q.qty + " " + (q.unit || "г")) : label;
        return '<div class="mix-part">' + esc(text) + "</div>";
      }).join("");
      return '<div class="mix"><div class="mix-title">' + esc(head) + '</div><div class="mix-parts">' + parts + "</div></div>";
    }
    if (isCrumb(g) && src.length === 1) {
      var q1 = partQty(g, src[0], sourcePos(g, src[0]), sourceCount(g));
      var grams = q1 ? q1.qty : (g.val != null ? g.val : g.value);
      return "<div>" + esc(singleLabel(src[0].name || src[0].main, grams)) + "</div>";
    }
    if (isCrumb(g)) {
      var val = g.val != null ? g.val : g.value;
      var bit = val != null && val !== "" ? (" — " + val + " г") : "";
      return "<div>" + esc("Крошка" + bit) + "</div>";
    }
    var nm = titleOf(g.name || g.main || "", pretty);
    var v = g.val != null ? g.val : g.value;
    var tail = v != null && v !== "" ? (" " + v + (g.unit ? " " + g.unit : "")) : "";
    return "<div>" + esc(nm + tail) + "</div>";
  }

  function linesHtml(basket, pretty) {
    var order = ["Мясо", "Крошка", "Жевалки"];
    var buckets = { "Мясо": [], "Крошка": [], "Жевалки": [] };
    (basket || []).forEach(function (g) {
      if (!g) return;
      buckets[groupOf(g)].push(g);
    });
    return order.map(function (title) {
      var rows = buckets[title].map(function (g) { return lineHtml(g, pretty); }).filter(Boolean);
      if (!rows.length) return "";
      return '<div class="nx-grp">' + esc(title) + "</div>" + rows.join("");
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

  function organParts(basket) {
    var out = [];
    (basket || []).forEach(function (g) {
      if (!g) return;
      var src = sourcesOf(g);
      if (isCrumb(g) && src.length) {
        src.forEach(function (s) {
          var q = partQty(g, s, sourcePos(g, s), sourceCount(g));
          var key = organKey(s.name || s.main);
          if (!key || !q) return;
          out.push({ key: key, grams: q.qty, sub: s.sub || "крошка", name: s.name || s.main });
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
    genitive: genitive,
    organParts: organParts,
    isCrumb: isCrumb
  };
});
