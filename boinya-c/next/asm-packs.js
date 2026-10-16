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

  /* «2 собаки» — только слот 2 в заказе или две разные клички.
     dogCount/twoDogs, суффикс « · 2» и второй снимок того же заказа сами по себе не отметка. */
  function rowMarked(c) {
    return groupIsTwoDogs(c ? [c] : []);
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

  function dogSlot(c) {
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
    var n = nicksOf(c);
    if (n[2] && !n[1]) return 2;
    return 1;
  }

  function asOneDog(rows) {
    var host = preferRow(rows);
    var base = Object.assign({}, host);
    var owner = String(base.ownerName || base.name || "")
      .replace(/\s*[·•#]\s*\d+\s*$/i, "")
      .trim();
    if (owner) {
      base.ownerName = owner;
      base.name = owner;
    }
    var nick = "";
    (rows || []).forEach(function (r) {
      var n = nicksOf(r);
      if (!nick && n[1]) nick = n[1];
    });
    base.dogPart = 0;
    base.dogName = nick;
    base.dogNames = { 1: nick, 2: "" };
    base.dogCount = 1;
    base.twoDogs = false;
    base.dogSections = null;
    base.basket = oneBasket(rows);
    if (nick) base.displayName = owner ? (owner + ", " + nick) : nick;
    else if (owner) base.displayName = owner;
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
      if (!groupIsTwoDogs(rows)) {
        out.push(asOneDog(rows));
        return;
      }
      var bySlot = {};
      var slots = [];
      rows.forEach(function (c) {
        var sk = String(dogSlot(c));
        if (!bySlot[sk]) {
          bySlot[sk] = [];
          slots.push(sk);
        }
        bySlot[sk].push(c);
      });
      if (slots.length < 2) {
        var byNick = {};
        var nickOrder = [];
        rows.forEach(function (c) {
          var n = nicksOf(c);
          var part = Number(c.dogPart) || 0;
          var pick = (part === 2 ? n[2] : n[1]) || n[1] || n[2] || "";
          var sk = pick.toUpperCase() || "_";
          if (!byNick[sk]) {
            byNick[sk] = [];
            nickOrder.push(sk);
          }
          byNick[sk].push(c);
        });
        if (nickOrder.length >= 2) {
          nickOrder.forEach(function (sk, idx) {
            var rs = byNick[sk];
            var base = rs.length === 1 ? Object.assign({}, rs[0]) : asOneDog(rs);
            base.dogPart = idx === 0 ? 1 : 2;
            base.dogCount = 2;
            base.twoDogs = true;
            var nn = nicksOf(rs[0]);
            base.dogName = (base.dogPart === 2 ? (nn[2] || nn[1]) : (nn[1] || nn[2])) || base.dogName || "";
            out.push(base);
          });
          return;
        }
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

  function copyOf(src) {
    var dst = {};
    var k;
    for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) dst[k] = src[k];
    return dst;
  }

  function dogNick(c, part) {
    c = c || {};
    var names = c.dogNames;
    var n = "";
    if (names && typeof names === "object") n = String(names[part] || names[String(part)] || "").trim();
    if (!n && Number(c.dogPart) === Number(part)) n = String(c.dogName || "").trim();
    if (n === "Собака " + part) n = "";
    return n;
  }

  function dogTitle(part, nick) {
    var n = String(nick || "").trim();
    if (!n || n === "Собака " + part) return "Собака " + part;
    return "Собака " + part + " (" + n + ")";
  }

  function splitBasket(basket) {
    var d1 = [];
    var d2 = [];
    (basket || []).forEach(function (it) {
      if (!it) return;
      if (Number(it.dog) === 2) d2.push(it);
      else d1.push(it);
    });
    return { dog1: d1, dog2: d2 };
  }

  function basketHasDog2(c) {
    return ((c && c.basket) || []).some(function (it) { return Number(it && it.dog) === 2; });
  }

  function nicksOf(c) {
    var a = dogNick(c, 1);
    var b = dogNick(c, 2);
    var part = Number(c && c.dogPart) || 0;
    if (!a && part !== 2) a = String((c && c.dogName) || "").trim();
    if (!b && part === 2) b = String((c && c.dogName) || "").trim();
    if (a === "Собака 1" || a === "Собака 2") a = "";
    if (b === "Собака 1" || b === "Собака 2") b = "";
    return { 1: a, 2: b };
  }

  /* Две разные собаки: в корзине есть dog:2, либо клички на карточках не совпадают. */
  function groupIsTwoDogs(rows) {
    var seen = {};
    var count = 0;
    var i;
    for (i = 0; i < (rows || []).length; i++) {
      var c = rows[i];
      if (basketHasDog2(c)) return true;
      var n = nicksOf(c);
      if (n[1] && n[2] && n[1].toUpperCase() !== n[2].toUpperCase()) return true;
      var part = Number(c && c.dogPart) || 0;
      var pick = part === 2 ? (n[2] || "") : (n[1] || "");
      if (!pick) continue;
      var key = pick.toUpperCase();
      if (!seen[key]) {
        seen[key] = 1;
        count++;
      }
    }
    return count >= 2;
  }

  function normSku(it) {
    return String((it && (it.name || it.main)) || "")
      .toUpperCase()
      .replace(/Ё/g, "Е")
      .replace(/\s*ШТ\.?\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function basketNearDup(a, b) {
    function keys(basket) {
      var m = {};
      (basket || []).forEach(function (it) {
        if (!it) return;
        var val = it.val != null ? it.val : it.value;
        m[normSku(it) + "~" + String(val)] = 1;
      });
      return m;
    }
    var A = keys(a);
    var B = keys(b);
    var ak = Object.keys(A);
    var bk = Object.keys(B);
    if (!ak.length || !bk.length) return true;
    var inter = 0;
    ak.forEach(function (k) { if (B[k]) inter++; });
    var uni = ak.length + bk.length - inter;
    return uni > 0 && inter / uni >= 0.6;
  }

  function preferRow(rows) {
    var i;
    for (i = 0; i < (rows || []).length; i++) {
      if (rows[i] && !rows[i].import) return rows[i];
    }
    return (rows && rows[0]) || {};
  }

  function oneBasket(rows) {
    rows = rows || [];
    if (rows.length <= 1) return (rows[0] && rows[0].basket) || [];
    var near = true;
    var i;
    for (i = 1; i < rows.length; i++) {
      if (!basketNearDup(rows[0].basket, rows[i].basket)) near = false;
    }
    if (!near) return mergeBaskets(rows);
    return (preferRow(rows).basket) || [];
  }

  function asOneStop(rows) {
    var keep = copyOf(preferRow(rows));
    var nick = "";
    (rows || []).forEach(function (r) {
      var n = nicksOf(r);
      if (!nick && n[1]) nick = n[1];
    });
    keep.basket = oneBasket(rows);
    keep.twoDogs = false;
    keep.dogCount = 1;
    keep.dogSections = null;
    keep.dogPart = 0;
    keep.dogName = nick;
    keep.dogNames = { 1: nick, 2: "" };
    keep._members = rows;
    keep.delivered = rows.every(function (r) { return !!r.delivered; });
    var price = firstPrice(rows);
    if (price != null) keep.orderPrice = price;
    var owner = String(keep.ownerName || keep.name || "").replace(/\s*[·•#]\s*\d+\s*$/i, "").trim();
    if (owner) {
      keep.ownerName = owner;
      keep.name = owner;
    }
    if (nick) keep.displayName = owner ? (owner + ", " + nick) : nick;
    return keep;
  }

  function rowIsTwo(c) {
    return groupIsTwoDogs(c ? [c] : []);
  }

  function stopKey(c) {
    var mk = String((c && c.matchKey) || "").trim().toUpperCase();
    if (mk) return "m:" + mk;
    var name = String((c && (c.ownerName || c.name)) || "")
      .replace(/\s*[·•#]\s*\d+\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    return "n:" + name + "|" + String((c && c.address) || "").trim().toUpperCase();
  }

  function basketSig(basket) {
    return (basket || []).map(function (it) {
      if (!it) return "";
      var val = it.val != null ? it.val : it.value;
      return [it.name || it.main || "", val, it.unit || "", it.sub || ""].join("~");
    }).join("|");
  }

  function tagDog(items, part) {
    return (items || []).map(function (it) {
      var copy = copyOf(it);
      if (Number(copy.dog) !== 1 && Number(copy.dog) !== 2) copy.dog = part;
      return copy;
    });
  }

  function firstPrice(rows) {
    var i;
    for (i = 0; i < rows.length; i++) {
      var raw = rows[i] && rows[i].orderPrice;
      var n = Number(raw);
      if (raw != null && raw !== "" && isFinite(n) && n > 0) return raw;
    }
    return null;
  }

  function applyTwo(base, names, b1, b2, members) {
    var basket1 = tagDog(b1, 1);
    var basket2 = tagDog(b2, 2);
    base.twoDogs = true;
    base.dogCount = 2;
    base.dogNames = { 1: names[1] || "", 2: names[2] || "" };
    base.dogSections = [
      { part: 1, title: dogTitle(1, names[1]), basket: basket1 },
      { part: 2, title: dogTitle(2, names[2]), basket: basket2 }
    ];
    base.packages = 2;
    base.basket = basket1.concat(basket2);
    base.name = String(base.ownerName || base.name || "").replace(/\s*[·•#]\s*\d+\s*$/i, "").trim() || base.name;
    if (members && members.length) {
      base._members = members;
      base.delivered = members.every(function (r) { return !!r.delivered; });
      var price = firstPrice(members);
      if (price != null) base.orderPrice = price;
    }
    return base;
  }

  function namesFrom(rows) {
    var names = { 1: "", 2: "" };
    var loose = [];
    (rows || []).forEach(function (r) {
      var n = nicksOf(r);
      var p = Number(r.dogPart) || 0;
      if (p === 2) names[2] = names[2] || n[2] || n[1];
      else if (p === 1) names[1] = names[1] || n[1] || n[2];
      else loose.push(n[1] || n[2] || "");
      if (n[1] && !names[1]) names[1] = n[1];
      if (n[2] && !names[2]) names[2] = n[2];
    });
    loose.forEach(function (n) {
      if (!n) return;
      if (!names[1]) names[1] = n;
      else if (!names[2] && n.toUpperCase() !== String(names[1]).toUpperCase()) names[2] = n;
    });
    return names;
  }

  /* Курьер: один адрес = одна карточка. Две собаки — две секции состава, цена одна. */
  function courierStops(list) {
    var order = [];
    var map = {};
    (list || []).forEach(function (c) {
      if (!c) return;
      var k = stopKey(c);
      if (!map[k]) {
        map[k] = [];
        order.push(k);
      }
      map[k].push(c);
    });
    return order.map(function (k) {
      var rows = map[k];
      if (!groupIsTwoDogs(rows)) return asOneStop(rows);
      if (rows.length === 1) {
        var one = copyOf(rows[0]);
        var parts = splitBasket(one.basket);
        var names = { 1: dogNick(one, 1), 2: dogNick(one, 2) };
        if (!parts.dog2.length) {
          one.twoDogs = true;
          one.dogCount = 2;
          one.packages = 2;
          one.dogNames = names;
          one.dogSections = null;
          return one;
        }
        return applyTwo(one, names, parts.dog1, parts.dog2, null);
      }
      var namesMany = namesFrom(rows);
      var byPart = { 1: [], 2: [] };
      var loose = [];
      rows.forEach(function (r) {
        var p = Number(r.dogPart) || 0;
        if (p === 1 || p === 2) byPart[p].push(r);
        else loose.push(r);
      });
      if (byPart[1].length || byPart[2].length) {
        var b1 = [];
        var b2 = [];
        byPart[1].forEach(function (r) {
          var sp = splitBasket(r.basket);
          b1 = b1.concat(sp.dog2.length ? sp.dog1 : (r.basket || []));
        });
        byPart[2].forEach(function (r) {
          var sp2 = splitBasket(r.basket);
          b2 = b2.concat(sp2.dog2.length ? sp2.dog2 : (r.basket || []));
        });
        loose.forEach(function (r) {
          var sp3 = splitBasket(r.basket);
          if (sp3.dog2.length) {
            b1 = b1.concat(sp3.dog1);
            b2 = b2.concat(sp3.dog2);
          }
        });
        return applyTwo(copyOf(rows[0]), namesMany, b1, b2, rows);
      }
      var host = null;
      rows.forEach(function (r) {
        if (!host && splitBasket(r.basket).dog2.length) host = r;
      });
      if (host) {
        var mixed = splitBasket(host.basket);
        namesMany[1] = namesMany[1] || dogNick(host, 1);
        namesMany[2] = namesMany[2] || dogNick(host, 2);
        return applyTwo(copyOf(host), namesMany, mixed.dog1, mixed.dog2, rows);
      }
      var take = rows.slice(0, 2);
      return applyTwo(copyOf(take[0]), namesMany, take[0].basket || [], (take[1] && take[1].basket) || [], rows);
    });
  }

  function courierDogLine(c) {
    if (!c || !c.twoDogs) return "";
    var names = [];
    var dn = c.dogNames || {};
    [1, 2].forEach(function (part) {
      var n = String(dn[part] || dn[String(part)] || "").trim();
      if (n && n !== "Собака " + part) names.push(n);
    });
    return (names.length ? ("2 собаки: " + names.join(", ")) : "2 собаки") + ", 2 пакета";
  }

  return {
    dedupe: dedupe,
    ownerKey: ownerKey,
    craftCount: craftCount,
    collapse: collapse,
    rowMarked: rowMarked,
    tally: tally,
    normDate: normDate,
    courierStops: courierStops,
    courierDogLine: courierDogLine
  };
});
