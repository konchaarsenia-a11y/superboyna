/* Формулы владельца 2026-10-02. Канон: boinya-c/docs/FORMULAS_2026-10-02.md */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BoinyaFormulas = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function kopeck_(n) {
    var x = Number(n);
    if (!isFinite(x)) return 0;
    return Math.round((x + Number.EPSILON) * 100) / 100;
  }

  function num_(v) {
    var x = Number(v);
    return isFinite(x) ? x : 0;
  }

  function formulaParts_(input) {
    input = input || {};
    var S = num_(input.S);
    var G = num_(input.G);
    var P = num_(input.P);
    var N = num_(input.N);
    var g = G / 100;
    var raw = kopeck_(S);
    var cut = kopeck_(2.5 * g + 0.5 * P);
    var assembly = kopeck_(3 * N);
    var light = kopeck_(0.8 * g + 0.3 * P);
    var pack = kopeck_(0.6 * g + 0.1 * P + 1.4 * N);
    var road = kopeck_(4 * N);
    var cost = kopeck_(raw + cut + assembly + light + pack + road);
    var wage = kopeck_(cut + assembly);
    return {
      S: raw, G: G, P: P, N: N,
      raw: raw, cut: cut, assembly: assembly, light: light, pack: pack, road: road,
      cost: cost, wage: wage
    };
  }

  function formulaRetail_(input) {
    input = input || {};
    var parts = formulaParts_(input);
    var R = num_(input.R);
    var per = parts.N > 0 ? R / parts.N : R;
    var delivery = per < 80 ? kopeck_(9 * parts.N) : 0;
    var price = kopeck_(R + delivery);
    var margin = kopeck_(price - parts.cost);
    return {
      S: parts.S, G: parts.G, P: parts.P, N: parts.N,
      raw: parts.raw, cut: parts.cut, assembly: parts.assembly,
      light: parts.light, pack: parts.pack, road: parts.road,
      cost: parts.cost, wage: parts.wage,
      R: kopeck_(R), delivery: delivery, price: price, margin: margin
    };
  }

  function formulaSub_(input) {
    input = input || {};
    var parts = formulaParts_(input);
    var R = num_(input.R);
    var F = num_(input.F);
    var g = parts.G / 100;
    var goodsRaw = kopeck_(kopeck_(parts.S * 2.6) + kopeck_(3.9 * g) + kopeck_(0.5 * parts.P));
    var cap = kopeck_(0.92 * R);
    var ceiling = goodsRaw > cap ? kopeck_(goodsRaw - cap) : 0;
    var goods = goodsRaw > cap ? cap : goodsRaw;
    var price = kopeck_(goods + kopeck_(9 * parts.N) + F);
    var margin = kopeck_(price - parts.cost);
    var marginCheck = kopeck_(kopeck_(1.6 * parts.S) - kopeck_(0.4 * parts.P) + kopeck_(0.6 * parts.N) + F - ceiling);
    return {
      S: parts.S, G: parts.G, P: parts.P, N: parts.N,
      raw: parts.raw, cut: parts.cut, assembly: parts.assembly,
      light: parts.light, pack: parts.pack, road: parts.road,
      cost: parts.cost, wage: parts.wage,
      R: kopeck_(R), F: kopeck_(F),
      goods: goods, goodsRaw: goodsRaw, cap: cap, ceiling: ceiling,
      price: price, margin: margin, marginCheck: marginCheck
    };
  }

  function bill_(v) {
    if (v == null || v === "") return { value: 0, entered: false };
    var n = Number(v);
    if (!isFinite(n)) return { value: 0, entered: false };
    return { value: kopeck_(n), entered: true };
  }

  function formulaMonth_(input) {
    input = input || {};
    var parts = formulaParts_(input);
    var revenue = kopeck_(input.revenue);
    var gross = kopeck_(revenue - parts.cost);
    var rentEntered = !(input.rent == null || input.rent === "");
    var rent = rentEntered ? kopeck_(input.rent) : 900;
    var lightBill = bill_(input.lightBill);
    var packBill = bill_(input.packBill);
    var amort = bill_(input.amort);
    var smm = bill_(input.smm);
    var other = bill_(input.other);
    var lightGap = lightBill.entered ? kopeck_(lightBill.value - parts.light) : 0;
    var packGap = packBill.entered ? kopeck_(packBill.value - parts.pack) : 0;
    var profit = kopeck_(gross - rent - lightGap - packGap - amort.value - smm.value - other.value);
    return {
      S: parts.S, G: parts.G, P: parts.P, N: parts.N,
      raw: parts.raw, cut: parts.cut, assembly: parts.assembly,
      light: parts.light, pack: parts.pack, road: parts.road,
      cost: parts.cost, wage: parts.wage,
      revenue: revenue, gross: gross,
      rent: rent, rentDefault: !rentEntered,
      lightBill: lightBill, packBill: packBill, amort: amort, smm: smm, other: other,
      lightGap: lightGap, packGap: packGap, profit: profit
    };
  }

  function monthLastIso_(mk) {
    if (!/^\d{4}-\d{2}$/.test(String(mk || ""))) return "";
    var y = Number(mk.slice(0, 4));
    var m = Number(mk.slice(5, 7));
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return mk + "-" + (last < 10 ? "0" : "") + last;
  }

  function blankAgg_() {
    return { revenue: 0, S: 0, G: 0, P: 0, N: 0, missingBasket: 0 };
  }

  function addUnits_(agg, S, G, P, n, missing) {
    agg.S = kopeck_(agg.S + num_(S));
    agg.G += num_(G);
    agg.P += num_(P);
    agg.N += num_(n);
    if (missing) agg.missingBasket += missing;
  }

  function ymdOf_(converted, ck) {
    if (!converted || !Object.prototype.hasOwnProperty.call(converted, ck)) return null;
    var v = converted[ck];
    if (v == null || v === false) return null;
    var s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return "";
  }

  function settlePp_(list) {
    var yes = [];
    var open = [];
    var gi;
    for (gi = 0; gi < list.length; gi++) {
      if (list[gi].paid === "yes") yes.push(list[gi]);
      else if (list[gi].paid !== "no") open.push(list[gi]);
    }
    var pool = (yes.length ? yes : open).slice().sort(function (x, y) {
      var xs = x.slot >= 1 ? x.slot : 9;
      var ys = y.slot >= 1 ? y.slot : 9;
      if (xs !== ys) return xs - ys;
      return String(x.iso) < String(y.iso) ? -1 : 1;
    });
    var pay = pool.length ? pool[0] : null;
    var got = [];
    for (gi = 0; gi < list.length; gi++) if (list[gi].delivered) got.push(list[gi]);
    var out = { revenue: 0, S: 0, G: 0, P: 0, N: got.length, missingBasket: 0 };
    if (!got.length) return out;
    var sig = got[0].sig;
    var same = !!sig;
    for (gi = 1; gi < got.length; gi++) {
      if (!got[gi].sig || got[gi].sig !== sig) same = false;
    }
    if (same) {
      out.S = got[0].S;
      out.G = got[0].G;
      out.P = got[0].P;
      if (got[0].missingBasket) out.missingBasket = got.length;
    } else {
      for (gi = 0; gi < got.length; gi++) {
        out.S = kopeck_(out.S + got[gi].S);
        out.G += got[gi].G;
        out.P += got[gi].P;
        if (got[gi].missingBasket) out.missingBasket++;
      }
    }
    if (pay && pay.delivered && pay.price > 0) out.revenue = pay.price;
    return out;
  }

  function freshBucket_() {
    return {
      trials: {},
      converted: {},
      spent: blankAgg_(),
      net: blankAgg_(),
      bpInNet: blankAgg_(),
      covered: blankAgg_()
    };
  }

  function finishBucket_(bucket) {
    var netCost = formulaParts_(bucket.net).cost;
    var net = kopeck_(bucket.net.revenue - netCost);
    var spent = formulaParts_(bucket.spent).cost;
    var inNet = formulaParts_(bucket.bpInNet).cost;
    var outside = kopeck_(spent - inNet);
    return {
      trials: Object.keys(bucket.trials).length,
      converted: Object.keys(bucket.converted).length,
      spent: spent,
      net: net,
      outside: outside,
      payback: kopeck_(net - outside),
      covered: formulaParts_(bucket.covered).cost,
      missingBasket: bucket.net.missingBasket
    };
  }

  function bucketAlive_(bucket) {
    return Object.keys(bucket.trials).length > 0 ||
      bucket.spent.N > 0 || bucket.net.N > 0 || bucket.covered.N > 0 || bucket.net.revenue > 0;
  }

  var ECONOMY_ATTR_ = "Партнёр точки берётся из поля партнёра на строке БП, кто привёл. На ПП и розницу имя не копируется: клиент остаётся у партнёра первой БП. Если имён несколько, остаётся самое раннее. Заказы типа «Партнёр» в блок не входят.";

  /**
   * Чистые перешедших и партнёры.
   * rows: {ck,name,iso,src,delivered,price,S,G,P,sig,missingBasket,slot,paid,partner,partnerPays}
   * opts.converted: ck -> YYYY-MM-DD, или "" если перешёл, но даты нет.
   * Чистые = выручка − себес §3 по всем отвезено доставкам перешедшего, включая его БП.
   * Окупаемость = чистые − себес БП тех, кто не вошёл в чистые. БП перешедших второй раз не вычитается.
   */
  function formulaEconomy_(rows, opts) {
    rows = rows || [];
    opts = opts || {};
    var monthKey = String(opts.monthKey || "").slice(0, 7);
    var monthLast = monthLastIso_(monthKey);
    var converted = opts.converted || {};
    var coverage = {
      rows: rows.length,
      delivered: 0,
      notDelivered: 0,
      missingBasket: 0,
      mixedPartner: 0,
      bpWithoutPartner: 0,
      convertDateUnknown: 0
    };
    var clients = {};
    function ensure_(ck, name) {
      if (!clients[ck]) {
        clients[ck] = {
          ck: ck, name: name || ck, partner: "", partnerIso: "", partnerPays: false, mixed: false,
          pp: {}, retail: [], bp: []
        };
      } else if (name && clients[ck].name === clients[ck].ck) clients[ck].name = name;
      return clients[ck];
    }
    var i;
    for (i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      var ck = String(row.ck || "").trim();
      var src = String(row.src || "");
      var iso = String(row.iso || "").slice(0, 10);
      if (!ck || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
      if (src !== "pp" && src !== "retail" && src !== "bp") continue;
      var cl = ensure_(ck, row.name);
      if (row.delivered) coverage.delivered++;
      else coverage.notDelivered++;
      if (row.delivered && row.missingBasket) coverage.missingBasket++;
      if (src === "bp") {
        var pname = String(row.partner || "").trim();
        if (pname) {
          if (!cl.partner) {
            cl.partner = pname;
            cl.partnerIso = iso;
            cl.partnerPays = !!row.partnerPays;
          } else if (cl.partner.toLowerCase() !== pname.toLowerCase()) {
            if (iso < cl.partnerIso) {
              cl.partner = pname;
              cl.partnerIso = iso;
              cl.partnerPays = !!row.partnerPays;
            }
            if (!cl.mixed) {
              cl.mixed = true;
              coverage.mixedPartner++;
            }
          }
        }
        cl.bp.push({
          iso: iso, delivered: !!row.delivered,
          S: num_(row.S), G: num_(row.G), P: num_(row.P),
          missingBasket: !!row.missingBasket, partnerPays: !!row.partnerPays
        });
      } else if (src === "pp") {
        var mk = iso.slice(0, 7);
        if (!cl.pp[mk]) cl.pp[mk] = [];
        cl.pp[mk].push({
          iso: iso, slot: Number(row.slot) || 0, price: num_(row.price),
          delivered: !!row.delivered, paid: String(row.paid || ""),
          S: num_(row.S), G: num_(row.G), P: num_(row.P),
          sig: String(row.sig || ""), missingBasket: !!row.missingBasket
        });
      } else {
        cl.retail.push({
          iso: iso, delivered: !!row.delivered, price: num_(row.price),
          S: num_(row.S), G: num_(row.G), P: num_(row.P), missingBasket: !!row.missingBasket
        });
      }
    }

    function addBp_(bucket, row) {
      var dest = row.partnerPays ? bucket.covered : bucket.spent;
      addUnits_(dest, row.S, row.G, row.P, 1, row.missingBasket ? 1 : 0);
    }
    function pushNet_(bucket, piece, bpPiece) {
      addUnits_(bucket.net, piece.S, piece.G, piece.P, piece.N, piece.missingBasket || 0);
      bucket.net.revenue = kopeck_(bucket.net.revenue + num_(piece.revenue));
      if (bpPiece) addUnits_(bucket.bpInNet, bpPiece.S, bpPiece.G, bpPiece.P, bpPiece.N, bpPiece.missingBasket || 0);
    }

    var life = freshBucket_();
    var month = freshBucket_();
    var partners = {};
    function partnerBucket_(name) {
      var key = String(name || "").toLowerCase();
      if (!partners[key]) {
        partners[key] = { name: name, paysCost: false, life: freshBucket_(), month: freshBucket_() };
      }
      return partners[key];
    }
    var noPartner = {};
    var keys = Object.keys(clients);
    for (i = 0; i < keys.length; i++) {
      var c = clients[keys[i]];
      var ymd = ymdOf_(converted, c.ck);
      var convLife = ymd != null;
      var convMonth = !!(monthKey && convLife && (ymd === "" || ymd <= monthLast));
      if (ymd === "") coverage.convertDateUnknown++;
      var pb = c.partner ? partnerBucket_(c.partner) : null;
      if (pb && c.partnerPays) pb.paysCost = true;
      var hadBp = false;
      var hadBpMonth = false;
      var bi;
      for (bi = 0; bi < c.bp.length; bi++) {
        var b = c.bp[bi];
        if (!b.delivered) continue;
        hadBp = true;
        var inMonth = !!(monthKey && b.iso.slice(0, 7) === monthKey);
        if (inMonth) hadBpMonth = true;
        addBp_(life, b);
        if (inMonth) addBp_(month, b);
        if (pb) {
          addBp_(pb.life, b);
          if (inMonth) addBp_(pb.month, b);
        }
      }
      if (hadBp && !c.partner) noPartner[c.ck] = true;
      if (hadBp) life.trials[c.ck] = true;
      if (hadBp && convLife) life.converted[c.ck] = true;
      if (hadBpMonth) month.trials[c.ck] = true;
      if (hadBpMonth && convMonth) month.converted[c.ck] = true;
      if (pb && hadBp) pb.life.trials[c.ck] = true;
      if (pb && hadBp && convLife) pb.life.converted[c.ck] = true;
      if (pb && hadBpMonth) pb.month.trials[c.ck] = true;
      if (pb && hadBpMonth && convMonth) pb.month.converted[c.ck] = true;
      if (!convLife && !convMonth) continue;
      var months = Object.keys(c.pp);
      var mi;
      for (mi = 0; mi < months.length; mi++) {
        var settled = settlePp_(c.pp[months[mi]]);
        if (!(settled.N > 0)) continue;
        var piece = {
          S: settled.S, G: settled.G, P: settled.P, N: settled.N,
          revenue: settled.revenue, missingBasket: settled.missingBasket
        };
        if (convLife) {
          pushNet_(life, piece, null);
          if (pb) pushNet_(pb.life, piece, null);
        }
        if (convMonth && months[mi] === monthKey) {
          pushNet_(month, piece, null);
          if (pb) pushNet_(pb.month, piece, null);
        }
      }
      var ri;
      for (ri = 0; ri < c.retail.length; ri++) {
        var rt = c.retail[ri];
        if (!rt.delivered) continue;
        var rp = { S: rt.S, G: rt.G, P: rt.P, N: 1, revenue: rt.price, missingBasket: rt.missingBasket ? 1 : 0 };
        if (convLife) {
          pushNet_(life, rp, null);
          if (pb) pushNet_(pb.life, rp, null);
        }
        if (convMonth && monthKey && rt.iso.slice(0, 7) === monthKey) {
          pushNet_(month, rp, null);
          if (pb) pushNet_(pb.month, rp, null);
        }
      }
      for (bi = 0; bi < c.bp.length; bi++) {
        var br = c.bp[bi];
        if (!br.delivered || br.partnerPays) continue;
        var bpPiece = { S: br.S, G: br.G, P: br.P, N: 1, revenue: 0, missingBasket: br.missingBasket ? 1 : 0 };
        if (convLife) {
          pushNet_(life, bpPiece, bpPiece);
          if (pb) pushNet_(pb.life, bpPiece, bpPiece);
        }
        if (convMonth && monthKey && br.iso.slice(0, 7) === monthKey) {
          pushNet_(month, bpPiece, bpPiece);
          if (pb) pushNet_(pb.month, bpPiece, bpPiece);
        }
      }
    }
    coverage.bpWithoutPartner = Object.keys(noPartner).length;
    var note = "В чистые входят только доставки с отметкой «отвёз».";
    if (coverage.missingBasket > 0) {
      note += " Без состава " + coverage.missingBasket + ": сырьё и граммы по ним нули, доставка и цена остаются.";
    }
    if (coverage.notDelivered > 0) note += " Без отметки «отвёз», не в деньгах: " + coverage.notDelivered + ".";
    if (coverage.convertDateUnknown > 0) note += " Без даты перехода: " + coverage.convertDateUnknown + ", они в месяце и за всё время.";
    if (coverage.mixedPartner > 0) note += " Несколько партнёров у клиента: " + coverage.mixedPartner + ", оставлено раннее имя.";
    var listLife = [];
    var listMonth = [];
    var pkeys = Object.keys(partners);
    for (i = 0; i < pkeys.length; i++) {
      var p = partners[pkeys[i]];
      if (bucketAlive_(p.life)) listLife.push(Object.assign({ name: p.name, paysCost: !!p.paysCost }, finishBucket_(p.life)));
      if (monthKey && bucketAlive_(p.month)) listMonth.push(Object.assign({ name: p.name, paysCost: !!p.paysCost }, finishBucket_(p.month)));
    }
    function byPay_(a, b) { return (b.payback || 0) - (a.payback || 0); }
    listLife.sort(byPay_);
    listMonth.sort(byPay_);
    return {
      ok: true,
      monthKey: monthKey,
      attribution: ECONOMY_ATTR_,
      coverage: coverage,
      note: note,
      bp: { month: finishBucket_(month), life: finishBucket_(life) },
      partners: { month: listMonth, life: listLife }
    };
  }

  return {
    kopeck_: kopeck_,
    formulaParts_: formulaParts_,
    formulaRetail_: formulaRetail_,
    formulaSub_: formulaSub_,
    formulaMonth_: formulaMonth_,
    formulaEconomy_: formulaEconomy_
  };
});
