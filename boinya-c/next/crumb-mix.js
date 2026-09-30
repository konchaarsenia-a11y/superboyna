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

  function sourcesOf(g) {
    var out = [];
    if (g && Array.isArray(g.sources)) {
      g.sources.forEach(function (s) {
        if (!s) return;
        var name = String(s.name || s.main || "").trim();
        if (name) out.push(s);
      });
    }
    return out;
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
    var n = String(name || "").toUpperCase().replace(/Ё/g, "Е");
    if (/БАРАН/.test(n) && /ЛЕГК/.test(n)) return "бараньего лёгкого";
    if (/ЛЕГК/.test(n)) return "лёгкого";
    if (/СЕРДЦ/.test(n)) return "сердца";
    if (/РУБ/.test(n)) return "рубца";
    if (/ПОЧ/.test(n)) return "почек";
    return String(name || "").toLowerCase();
  }

  function singleLabel(name, grams) {
    var bit = grams ? (" " + grams + " г") : "";
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

  function linesHtml(basket, pretty) {
    return (basket || []).map(function (g) {
      if (!g) return "";
      var src = sourcesOf(g);
      if (isCrumb(g) && src.length >= 2) {
        var total = Number(g.val != null ? g.val : g.value);
        var totalBit = isFinite(total) && total > 0 ? (", " + total + " " + (g.unit || "г")) : "";
        var parts = src.map(function (s, i) {
          var q = partQty(g, s, i, src.length);
          var label = titleOf(s.name || s.main, pretty);
          if (s.sub) label += ", " + titleOf(s.sub, pretty);
          if (q) label += ", " + q.qty + " " + (q.unit || "г");
          return '<div class="mix-part">' + esc(label) + "</div>";
        }).join("");
        return '<div class="mix"><div>Крошка микс' + esc(totalBit) + "</div>" + parts + "</div>";
      }
      if (isCrumb(g) && src.length === 1) {
        var q1 = partQty(g, src[0], 0, 1);
        var grams = q1 ? q1.qty : (g.val != null ? g.val : g.value);
        return "<div>" + esc(singleLabel(src[0].name || src[0].main, grams)) + "</div>";
      }
      if (isCrumb(g)) {
        var val = g.val != null ? g.val : g.value;
        var bit = val != null && val !== "" ? (" " + val + " г") : "";
        return "<div>" + esc("Крошка" + bit) + "</div>";
      }
      var nm = titleOf(g.name || g.main || "", pretty);
      var v = g.val != null ? g.val : g.value;
      var tail = v != null && v !== "" ? (" " + v + (g.unit ? " " + g.unit : "")) : "";
      return "<div>" + esc(nm + tail) + "</div>";
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
        src.forEach(function (s, i) {
          var q = partQty(g, s, i, src.length);
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
    singleLabel: singleLabel,
    organParts: organParts,
    isCrumb: isCrumb
  };
});
