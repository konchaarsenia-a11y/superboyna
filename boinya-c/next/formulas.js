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
      var ppFlat = [];
      var ppMonths = Object.keys(c.pp);
      var mi;
      for (mi = 0; mi < ppMonths.length; mi++) ppFlat = ppFlat.concat(c.pp[ppMonths[mi]]);
      var shares = formulaPpClientMonths_(ppFlat);
      var shareKeys = Object.keys(shares);
      for (mi = 0; mi < shareKeys.length; mi++) {
        var settled = shares[shareKeys[mi]];
        if (!(settled.N > 0)) continue;
        var piece = {
          S: settled.S, G: settled.G, P: settled.P, N: settled.N,
          revenue: settled.revenue, missingBasket: settled.missingBasket
        };
        if (convLife) {
          pushNet_(life, piece, null);
          if (pb) pushNet_(pb.life, piece, null);
        }
        if (convMonth && shareKeys[mi] === monthKey) {
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

  function isoDay_(iso) {
    return String(iso || "").slice(0, 10);
  }

  function daysBetweenIso_(a, b) {
    var pa = isoDay_(a).split("-");
    var pb = isoDay_(b).split("-");
    if (pa.length < 3 || pb.length < 3) return 0;
    var ua = Date.UTC(Number(pa[0]), Number(pa[1]) - 1, Number(pa[2]));
    var ub = Date.UTC(Number(pb[0]), Number(pb[1]) - 1, Number(pb[2]));
    return Math.round((ub - ua) / 86400000);
  }

  function addDaysIso_(iso, n) {
    var p = isoDay_(iso).split("-");
    var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    d.setUTCDate(d.getUTCDate() + (Number(n) || 0));
    var m = d.getUTCMonth() + 1;
    var day = d.getUTCDate();
    return d.getUTCFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  function monthBoundsIso_(mk) {
    var y = Number(String(mk).slice(0, 4));
    var m = Number(String(mk).slice(5, 7));
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: mk + "-01", to: mk + "-" + (last < 10 ? "0" : "") + last };
  }

  function ppSlot_(row) {
    return Number(row && row.slot) || 0;
  }

  function ppStartsCycle_(prev, row) {
    var slot = ppSlot_(row);
    var prevSlot = ppSlot_(prev);
    var gap = daysBetweenIso_(prev.iso, row.iso);
    if (slot === 1) return true;
    if (slot >= 1 && prevSlot >= 1 && slot < prevSlot) return true;
    if (gap >= 18) return true;
    return false;
  }

  function ppSplitCycles_(rows) {
    var list = (rows || []).slice().sort(function (a, b) {
      if (a.iso !== b.iso) return a.iso < b.iso ? -1 : 1;
      return ppSlot_(a) - ppSlot_(b);
    });
    var cycles = [];
    var cur = [];
    var prev = null;
    var i;
    for (i = 0; i < list.length; i++) {
      if (prev && ppStartsCycle_(prev, list[i])) {
        cycles.push(cur);
        cur = [];
      }
      cur.push(list[i]);
      prev = list[i];
    }
    if (cur.length) cycles.push(cur);
    return cycles;
  }

  function ppPayRow_(cycle) {
    var yes = [];
    var open = [];
    var i;
    for (i = 0; i < cycle.length; i++) {
      var row = cycle[i];
      if (row.missingBasket) continue;
      var paid = String(row.paid || "");
      if (paid === "yes") yes.push(row);
      else if (paid !== "no") {
        var slot = ppSlot_(row);
        if (slot >= 2) continue;
        if (slot === 0 && row !== cycle[0]) continue;
        open.push(row);
      }
    }
    var pool = (yes.length ? yes : open).slice().sort(function (a, b) {
      var as = ppSlot_(a) >= 1 ? ppSlot_(a) : 9;
      var bs = ppSlot_(b) >= 1 ? ppSlot_(b) : 9;
      if (as !== bs) return as - bs;
      return a.iso < b.iso ? -1 : 1;
    });
    return pool.length ? pool[0] : null;
  }

  function blankShare_() {
    return { revenue: 0, S: 0, G: 0, P: 0, N: 0, missingBasket: 0 };
  }

  function formulaPpClientMonths_(rows) {
    var cycles = ppSplitCycles_(rows || []);
    var by = {};
    function bucket(mk) {
      if (!by[mk]) by[mk] = blankShare_();
      return by[mk];
    }
    var ci;
    for (ci = 0; ci < cycles.length; ci++) {
      var cycle = cycles[ci];
      var pay = ppPayRow_(cycle);
      var seen = {};
      var ri;
      for (ri = 0; ri < cycle.length; ri++) {
        var row = cycle[ri];
        var mk = isoDay_(row.iso).slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(mk)) continue;
        if (row.missingBasket) {
          if (row.delivered) bucket(mk).missingBasket++;
          continue;
        }
        if (!row.delivered) continue;
        var b = bucket(mk);
        var sig = String(row.sig || "");
        if (!(sig && seen[sig])) {
          b.S = kopeck_(b.S + num_(row.S));
          b.G += num_(row.G);
          b.P += num_(row.P);
        }
        b.N += 1;
        if (sig) seen[sig] = true;
      }
      if (pay && pay.delivered && num_(pay.price) > 0) {
        bucket(isoDay_(pay.iso).slice(0, 7)).revenue = kopeck_(bucket(isoDay_(pay.iso).slice(0, 7)).revenue + num_(pay.price));
      }
    }
    return by;
  }

  function formulaRollup_(rows, opts) {
    opts = opts || {};
    var from = isoDay_(opts.fromIso);
    var to = isoDay_(opts.toIso);
    if (!from && !to && /^\d{4}-\d{2}$/.test(String(opts.monthKey || ""))) {
      var bounds = monthBoundsIso_(String(opts.monthKey));
      from = bounds.from;
      to = bounds.to;
    }
    var look = from ? addDaysIso_(from, -35) : "";
    var out = {
      ok: true,
      deliveredOnly: true,
      from: from,
      to: to,
      S: 0, G: 0, P: 0, N: 0,
      revenue: 0,
      ppRevenue: 0,
      retailRevenue: 0,
      pp: { S: 0, G: 0, P: 0, N: 0, revenue: 0 },
      retail: { S: 0, G: 0, P: 0, N: 0, revenue: 0 },
      bp: { S: 0, G: 0, P: 0, N: 0 },
      pending: { revenue: 0, N: 0, ppRevenue: 0, retailRevenue: 0 },
      skippedPartner: 0,
      missingBasket: 0,
      missingPrice: 0,
      wageSplit: false,
      wageNote: "В памяти доставок нет, кто нарезал каждую строку. Вся сумма за период у выбранного нарезчика-сборщика."
    };
    function inside(iso) {
      return (!from || iso >= from) && (!to || iso <= to);
    }
    function looked(iso) {
      return !!(look && iso >= look && from && iso < from);
    }
    function addU(bucket, S, G, P, n) {
      bucket.S = kopeck_(bucket.S + num_(S));
      bucket.G += num_(G);
      bucket.P += num_(P);
      bucket.N += num_(n);
    }
    var pp = {};
    var rest = [];
    var i;
    for (i = 0; i < (rows || []).length; i++) {
      var row = rows[i] || {};
      var iso = isoDay_(row.iso);
      var src = String(row.src || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
      if (src === "partner") {
        if (inside(iso)) out.skippedPartner++;
        continue;
      }
      if (src === "pp") {
        if (!inside(iso) && !looked(iso)) continue;
        var ck = String(row.ck || "");
        if (!ck) continue;
        if (!pp[ck]) pp[ck] = [];
        pp[ck].push(row);
        continue;
      }
      if (!inside(iso)) continue;
      if (src !== "retail" && src !== "bp") continue;
      rest.push(row);
    }
    for (i = 0; i < rest.length; i++) {
      var one = rest[i];
      var price = num_(one.price);
      if (one.missingBasket) {
        if (one.delivered) out.missingBasket++;
        else out.pending.N += 1;
        continue;
      }
      if (one.delivered) {
        addU(out, one.S, one.G, one.P, 1);
        if (String(one.src) === "bp") addU(out.bp, one.S, one.G, one.P, 1);
        else {
          addU(out.retail, one.S, one.G, one.P, 1);
          if (price > 0) {
            out.revenue = kopeck_(out.revenue + price);
            out.retailRevenue = kopeck_(out.retailRevenue + price);
            out.retail.revenue = kopeck_(out.retail.revenue + price);
          } else out.missingPrice++;
        }
      } else {
        out.pending.N += 1;
        if (price > 0 && String(one.src) !== "bp") {
          out.pending.revenue = kopeck_(out.pending.revenue + price);
          out.pending.retailRevenue = kopeck_(out.pending.retailRevenue + price);
        }
      }
    }
    var keys = Object.keys(pp);
    for (i = 0; i < keys.length; i++) {
      var cycles = ppSplitCycles_(pp[keys[i]]);
      var ci;
      for (ci = 0; ci < cycles.length; ci++) {
        var cycle = cycles[ci];
        var pay = ppPayRow_(cycle);
        var seen = {};
        var ri;
        for (ri = 0; ri < cycle.length; ri++) {
          var slotRow = cycle[ri];
          var slotIso = isoDay_(slotRow.iso);
          if (!inside(slotIso)) {
            if (slotRow.delivered && slotRow.sig) seen[String(slotRow.sig)] = true;
            continue;
          }
          if (slotRow.missingBasket) {
            if (slotRow.delivered) out.missingBasket++;
            else out.pending.N += 1;
            continue;
          }
          if (slotRow.delivered) {
            var sig = String(slotRow.sig || "");
            if (!(sig && seen[sig])) addU(out, slotRow.S, slotRow.G, slotRow.P, 0);
            if (!(sig && seen[sig])) addU(out.pp, slotRow.S, slotRow.G, slotRow.P, 0);
            addU(out, 0, 0, 0, 1);
            addU(out.pp, 0, 0, 0, 1);
            if (sig) seen[sig] = true;
          } else out.pending.N += 1;
        }
        if (!pay) continue;
        var payIso = isoDay_(pay.iso);
        var payPrice = num_(pay.price);
        if (!inside(payIso)) continue;
        if (pay.delivered && payPrice > 0) {
          out.revenue = kopeck_(out.revenue + payPrice);
          out.ppRevenue = kopeck_(out.ppRevenue + payPrice);
          out.pp.revenue = kopeck_(out.pp.revenue + payPrice);
        } else if (!pay.delivered && payPrice > 0) {
          out.pending.revenue = kopeck_(out.pending.revenue + payPrice);
          out.pending.ppRevenue = kopeck_(out.pending.ppRevenue + payPrice);
        } else if (pay.delivered && !(payPrice > 0)) out.missingPrice++;
      }
    }
    return out;
  }

  var TAX_RATE_ = 0.2;
  var DELIVERY_REST_ = 0.6;
  var RENT_DEFAULT_ = 900;

  function reconBand_(allowance) {
    var pct = kopeck_(Math.abs(num_(allowance)) * 0.05);
    return pct > 5 ? pct : 5;
  }

  function reconcile_(allowance, paid, entered, name) {
    var allow = kopeck_(allowance);
    if (!entered) {
      return { key: name || "", state: "empty", allowance: allow, paid: 0, gap: 0, text: "" };
    }
    var real = kopeck_(paid);
    var diff = kopeck_(allow - real);
    var band = reconBand_(allow);
    if (Math.abs(diff) <= band) {
      return { key: name || "", state: "close", allowance: allow, paid: real, gap: 0, text: "" };
    }
    var title = name || "статью";
    if (diff > 0) {
      return {
        key: name || "",
        state: "under",
        allowance: allow,
        paid: real,
        gap: diff,
        text: "На " + title + " потрачено меньше заложенного, +" + diff.toFixed(2) + " BYN в чистое"
      };
    }
    var over = kopeck_(Math.abs(diff));
    return {
      key: name || "",
      state: "over",
      allowance: allow,
      paid: real,
      gap: diff,
      text: "На " + title + " уходит больше, чем заложено: перерасход " + over.toFixed(2) + " BYN"
    };
  }

  function isoUtc_(iso) {
    var p = String(iso || "").slice(0, 10).split("-");
    if (p.length < 3) return NaN;
    return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function daysBetween_(a, b) {
    var n = Math.round((isoUtc_(b) - isoUtc_(a)) / 86400000);
    return isFinite(n) ? n : 0;
  }

  function pad2_(n) { return n < 10 ? "0" + n : String(n); }

  function addMonthsIso_(iso, months) {
    var p = String(iso || "").slice(0, 10).split("-");
    var y = Number(p[0]);
    var m0 = Number(p[1]) - 1 + months;
    var d = Number(p[2]);
    var dt = new Date(Date.UTC(y, m0, 1));
    var last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
    if (d > last) d = last;
    return dt.getUTCFullYear() + "-" + pad2_(dt.getUTCMonth() + 1) + "-" + pad2_(d);
  }

  function overlapDays_(start, end, from, to) {
    var a = start > from ? start : from;
    var b = end < to ? end : to;
    var n = daysBetween_(a, b);
    return n > 0 ? n : 0;
  }

  function amortMonth_(repairs, monthKey) {
    var mk = String(monthKey || "").slice(0, 7);
    var out = { amount: 0, forward: false, note: "" };
    if (!/^\d{4}-\d{2}$/.test(mk)) return out;
    var from = mk + "-01";
    var to = addMonthsIso_(from, 1);
    var groups = {};
    var i;
    for (i = 0; i < (repairs || []).length; i++) {
      var r = repairs[i] || {};
      if (r.personal) continue;
      var date = String(r.date || "").slice(0, 10);
      var amount = num_(r.amount);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(amount > 0)) continue;
      var obj = String(r.object || r.comment || "общее").trim().toLowerCase() || "общее";
      if (!groups[obj]) groups[obj] = [];
      groups[obj].push({ date: date, amount: amount });
    }
    var keys = Object.keys(groups);
    var sum = 0;
    var forward = false;
    for (i = 0; i < keys.length; i++) {
      var g = groups[keys[i]].sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
      var spans = [];
      if (g.length === 1) {
        spans.push({ start: g[0].date, end: addMonthsIso_(g[0].date, 12), amount: g[0].amount, forward: true });
      } else {
        var gi;
        for (gi = 1; gi < g.length; gi++) {
          spans.push({ start: g[gi - 1].date, end: g[gi].date, amount: g[gi].amount, forward: false });
        }
      }
      var si;
      for (si = 0; si < spans.length; si++) {
        var spanDays = daysBetween_(spans[si].start, spans[si].end);
        if (spanDays < 1) spanDays = 1;
        var hit = overlapDays_(spans[si].start, spans[si].end, from, to);
        if (!(hit > 0)) continue;
        sum += (spans[si].amount / spanDays) * hit;
        if (spans[si].forward) forward = true;
      }
    }
    out.amount = kopeck_(sum);
    out.forward = forward;
    if (forward) out.note = "Нет прошлого ремонта, сумма разложена на 12 месяцев вперёд";
    return out;
  }

  function expenseBucket_(rows, monthKey) {
    var mk = String(monthKey || "").slice(0, 7);
    var paid = { light: 0, raw: 0, pack: 0, wage: 0, fuel: 0, amort: 0 };
    var entered = { light: false, raw: false, pack: false, wage: false, fuel: false, amort: false };
    var project = { coupon: 0, tool: 0, smm: 0, other: 0 };
    var rent = 0;
    var rentEntered = false;
    var i;
    for (i = 0; i < (rows || []).length; i++) {
      var r = rows[i] || {};
      if (r.personal) continue;
      if (String(r.date || "").slice(0, 7) !== mk) continue;
      var amount = num_(r.amount);
      var cat = String(r.category || "");
      if (cat === "rent") {
        rent = kopeck_(rent + amount);
        rentEntered = true;
      } else if (Object.prototype.hasOwnProperty.call(paid, cat)) {
        paid[cat] = kopeck_(paid[cat] + amount);
        entered[cat] = true;
      } else if (Object.prototype.hasOwnProperty.call(project, cat)) {
        project[cat] = kopeck_(project[cat] + amount);
      }
    }
    return { paid: paid, entered: entered, project: project, rent: rent, rentEntered: rentEntered };
  }

  function formulaClose_(input) {
    input = input || {};
    var parts = formulaParts_(input);
    var revenue = kopeck_(input.revenue);
    var gross = kopeck_(revenue - parts.cost);
    var deliveryRest = kopeck_(DELIVERY_REST_ * parts.N);
    var bucket = input.bucket || expenseBucket_(input.rows, input.monthKey);
    var amort = input.amort || amortMonth_(input.repairs, input.monthKey);
    var rentEntered = !!bucket.rentEntered;
    var rent = rentEntered ? kopeck_(bucket.rent) : RENT_DEFAULT_;
    var spec = [
      ["light", "свет", parts.light],
      ["raw", "сырьё", parts.raw],
      ["pack", "пакеты", parts.pack],
      ["wage", "зарплаты", parts.wage],
      ["fuel", "заправки", parts.road],
      ["amort", "амортизацию", amort.amount]
    ];
    var recon = [];
    var gapSum = 0;
    var si;
    for (si = 0; si < spec.length; si++) {
      var key = spec[si][0];
      var row = reconcile_(spec[si][2], bucket.paid[key], bucket.entered[key], spec[si][1]);
      row.key = key;
      recon.push(row);
      if (key !== "amort") gapSum = kopeck_(gapSum + row.gap);
    }
    var amortRow = recon[recon.length - 1];
    var projectSum = kopeck_(bucket.project.coupon + bucket.project.tool + bucket.project.smm + bucket.project.other);
    var profit = kopeck_(gross - rent + gapSum - projectSum - amort.amount + amortRow.gap);
    var tax = profit > 0 ? kopeck_(profit * TAX_RATE_) : 0;
    var afterTax = kopeck_(profit - tax);
    return {
      revenue: revenue,
      gross: gross,
      cost: parts.cost,
      raw: parts.raw,
      cut: parts.cut,
      assembly: parts.assembly,
      light: parts.light,
      pack: parts.pack,
      road: parts.road,
      wage: parts.wage,
      N: parts.N,
      deliveryRest: deliveryRest,
      rent: rent,
      rentDefault: !rentEntered,
      recon: recon,
      project: bucket.project,
      projectSum: projectSum,
      amort: amort.amount,
      amortNote: amort.note,
      amortForward: amort.forward,
      profit: profit,
      taxRate: TAX_RATE_,
      tax: tax,
      afterTax: afterTax
    };
  }

  return {
    kopeck_: kopeck_,
    formulaParts_: formulaParts_,
    formulaRetail_: formulaRetail_,
    formulaSub_: formulaSub_,
    formulaMonth_: formulaMonth_,
    formulaEconomy_: formulaEconomy_,
    taxRate_: TAX_RATE_,
    reconcile_: reconcile_,
    amortMonth_: amortMonth_,
    expenseBucket_: expenseBucket_,
    formulaClose_: formulaClose_,
    formulaRollup_: formulaRollup_,
    formulaPpClientMonths_: formulaPpClientMonths_,
    monthBoundsIso_: monthBoundsIso_
  };
});
