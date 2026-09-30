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

  /* Явная отметка «2 собаки»: dogCount/twoDogs или позиция с dog:2.
     Суффикс « · 2» в имени и dogPart сами по себе не отметка:
     их ставит сборка (Worker splitBasketByDogWorker_ / Code.gs splitBasketByDog_). */
  function rowMarked(c) {
    if (!c) return false;
    if (Number(c.dogCount) === 2 || Number(c.dogs) === 2 || c.twoDogs === true) return true;
    var basket = c.basket || [];
    var i;
    for (i = 0; i < basket.length; i++) {
      if (Number(basket[i] && basket[i].dog) === 2) return true;
    }
    return false;
  }

  function lineKey(it) {
    it = it || {};
    var val = it.val != null ? it.val : it.value;
    return [it.name || it.main || "", it.sub || "", val, it.dog || ""].join("|");
  }

  function mergeBaskets(rows) {
    var seen = {};
    var out = [];
    (rows || []).forEach(function (c) {
      (c.basket || []).forEach(function (it) {
        var k = lineKey(it);
        if (seen[k]) return;
        seen[k] = true;
        out.push(it);
      });
    });
    return out;
  }

  function dogSlot(c, index) {
    var part = Number(c && c.dogPart) || 0;
    if (part === 2) return 2;
    if (part === 1) return 1;
    var basket = (c && c.basket) || [];
    var i;
    for (i = 0; i < basket.length; i++) {
      var d = Number(basket[i] && basket[i].dog) || 0;
      if (d === 2) return 2;
      if (d === 1) return 1;
    }
    return index > 0 ? 2 : 1;
  }

  function asOneDog(rows) {
    var base = Object.assign({}, rows[0]);
    var owner = String(base.ownerName || base.name || "")
      .replace(/\s*[·•#]\s*\d+\s*$/i, "")
      .trim();
    if (owner) {
      base.ownerName = owner;
      base.name = owner;
      base.displayName = owner;
    }
    base.dogPart = 0;
    base.dogName = "";
    base.dogCount = 1;
    base.twoDogs = false;
    base.basket = mergeBaskets(rows);
    base.assembled = rows.every(function (r) { return !!r.assembled; });
    return base;
  }

  function collapse(clients, dateIso) {
    var list = dedupe(clients, dateIso);
    var groups = {};
    var order = [];
    list.forEach(function (c) {
      var k = ownerKey(c);
      if (!groups[k]) {
        groups[k] = [];
        order.push(k);
      }
      groups[k].push(c);
    });
    var out = [];
    order.forEach(function (k) {
      var rows = groups[k];
      if (!rows.some(rowMarked)) {
        out.push(asOneDog(rows));
        return;
      }
      var bySlot = {};
      var slots = [];
      rows.forEach(function (c, index) {
        var sk = String(dogSlot(c, index));
        if (!bySlot[sk]) {
          bySlot[sk] = [];
          slots.push(sk);
        }
        bySlot[sk].push(c);
      });
      if (slots.length < 2) {
        out.push(asOneDog(rows));
        return;
      }
      slots.forEach(function (sk) {
        var rs = bySlot[sk];
        var base = rs.length === 1 ? Object.assign({}, rs[0]) : asOneDog(rs);
        base.dogPart = Number(sk);
        base.dogCount = 2;
        base.twoDogs = true;
        out.push(base);
      });
    });
    return out;
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
    var list = collapse(clients, dateIso);
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
    collapse: collapse,
    rowMarked: rowMarked,
    tally: tally,
    normDate: normDate
  };
});
