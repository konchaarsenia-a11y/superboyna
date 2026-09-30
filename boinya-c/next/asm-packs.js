/* Крафт на доставку, а не на каждую запись сборки. Форматы пакетов не меняет. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoinyaAsmPacks = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normDate(s) {
    s = String(s || "").trim();
    if (!s) return "";
    var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return "";
  }

  function dateOk(c, dateIso) {
    var want = normDate(dateIso);
    var got = normDate(c && (c.dateIso || c.date));
    if (!want || !got) return true;
    return want === got;
  }

  function ownerKey(c) {
    c = c || {};
    var name = String(c.ownerName || c.name || "")
      .replace(/\s*[·•#]\s*\d+\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    var addr = String(c.address || "").trim().toUpperCase();
    var mk = String(c.matchKey || "").trim().toUpperCase();
    if (mk) return "mk:" + mk + "|" + addr;
    return "nm:" + name + "|" + addr;
  }

  function rowKey(c) {
    var dog = c && c.dogPart != null ? c.dogPart : (c && c.dog != null ? c.dog : "");
    return ownerKey(c) + "#" + String(dog) + "#" + String((c && c.name) || "").trim().toUpperCase();
  }

  function dedupe(clients, dateIso) {
    var seen = {};
    var out = [];
    (clients || []).forEach(function (c) {
      if (!c || !dateOk(c, dateIso)) return;
      var k = rowKey(c);
      if (seen[k]) return;
      seen[k] = true;
      out.push(c);
    });
    return out;
  }

  function craftCount(small, med, large) {
    small = Number(small) || 0;
    med = Number(med) || 0;
    large = Number(large) || 0;
    if (small + med + large <= 0) return 0;
    var fill = large / 4 + med / 7 + small / 35;
    return Math.max(1, Math.ceil(fill - 1e-12));
  }

  function tally(clients, packFn, dateIso) {
    var list = dedupe(clients, dateIso);
    var groups = {};
    var order = [];
    var totals = { "маленький": 0, "средний": 0, "большой": 0, "целое": 0, "крафт": 0 };
    var rows = list.map(function (c) {
      var packs = (packFn && packFn(c)) || [];
      var by = {};
      packs.forEach(function (p) {
        if (!p || !p.counterKey || p.counterKey === "крафт") return;
        var n = Number(p.bags) || 0;
        if (!(n > 0)) return;
        by[p.counterKey] = (by[p.counterKey] || 0) + n;
        totals[p.counterKey] = (totals[p.counterKey] || 0) + n;
      });
      var k = ownerKey(c);
      if (!groups[k]) {
        groups[k] = { key: k, small: 0, med: 0, large: 0, craft: 0 };
        order.push(k);
      }
      groups[k].small += by["маленький"] || 0;
      groups[k].med += by["средний"] || 0;
      groups[k].large += (by["большой"] || 0) + (by["целое"] || 0);
      return { client: c, by: by, craft: 0 };
    });
    order.forEach(function (k) {
      var g = groups[k];
      g.craft = craftCount(g.small, g.med, g.large);
      totals["крафт"] += g.craft;
      var i;
      for (i = 0; i < rows.length; i++) {
        if (ownerKey(rows[i].client) === k) {
          rows[i].craft = g.craft;
          if (g.craft > 0) rows[i].by["крафт"] = g.craft;
          break;
        }
      }
    });
    return { totals: totals, rows: rows, groups: groups };
  }

  return {
    dedupe: dedupe,
    ownerKey: ownerKey,
    craftCount: craftCount,
    tally: tally,
    normDate: normDate
  };
});
