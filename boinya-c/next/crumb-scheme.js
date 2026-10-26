/* Новая крошка только для строк mix3. Старые без метки остаются на пачках order-engine. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoinyaCrumbScheme = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function mix3KindOf(it) {
    if (!it) return "";
    var raw = String(it.crumbKind || "");
    var m = /^mix3:(mix|meat|hypo)$/i.exec(raw);
    if (m) return m[1].toLowerCase();
    if (String(it.crumbScheme || "") === "mix3") {
      var k = raw.toLowerCase();
      if (k === "meat" || k === "hypo" || k === "mix") return k;
      return "mix";
    }
    return "";
  }

  function mix3Rate(kind) {
    if (kind === "hypo") return 25;
    if (kind === "meat") return 20;
    if (kind === "mix") return 15;
    return 0;
  }

  function mix3Goods(it, grams) {
    var kind = mix3KindOf(it);
    var rate = mix3Rate(kind);
    if (!(rate > 0)) return null;
    var g = Number(grams);
    if (!isFinite(g) || !(g > 0)) return 0;
    return Math.round(g * rate * 100) / 10000;
  }

  function install(engine) {
    if (!engine || engine.__crumbMix3 || typeof engine.calcRetailBasketTotal !== "function") return engine;
    var origCalc = engine.calcRetailBasketTotal;
    engine.calcRetailBasketTotal = function (list, opts) {
      opts = opts || {};
      var plain = [];
      var extraCost = 0;
      var extraLines = [];
      (list || []).forEach(function (it) {
        var kind = mix3KindOf(it);
        if (!kind) {
          plain.push(it);
          return;
        }
        var val = it && it.val != null ? it.val : it && it.value;
        var cost = mix3Goods(it, val);
        if (cost == null) {
          plain.push(it);
          return;
        }
        extraCost += cost;
        extraLines.push({
          name: (it && (it.name || it.main)) || "крошка",
          sub: (it && it.sub) || "",
          val: Number(val) || 0,
          per100: mix3Rate(kind),
          cost: cost,
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
    engine.__crumbMix3 = true;
    return engine;
  }

  var eng = typeof globalThis !== "undefined" ? globalThis.BoinyaOrderEngine : null;
  if (eng) install(eng);

  return {
    mix3KindOf: mix3KindOf,
    mix3Rate: mix3Rate,
    mix3Goods: mix3Goods,
    install: install
  };
});
