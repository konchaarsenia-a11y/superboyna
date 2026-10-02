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

  return {
    kopeck_: kopeck_,
    formulaParts_: formulaParts_,
    formulaRetail_: formulaRetail_,
    formulaSub_: formulaSub_,
    formulaMonth_: formulaMonth_
  };
});
