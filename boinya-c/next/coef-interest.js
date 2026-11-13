/* t516u-clients #9: градация выгоды у коэффициента (вариант 2).
   Месяц целиком: оборот = одна цена подписки; доставка N раз в себесе.
   Себес от коэффа не зависит. Аренду из «Целей» не делим. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BoinyaCoefInterest = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TIERS = [
    { id: "high", label: "высокий интерес", pct: 40 },
    { id: "good", label: "интересно", pct: 30 },
    { id: "meh", label: "без интереса", pct: 15 },
    { id: "bad", label: "невыгодно", pct: 0 },
    { id: "loss", label: "убыточно", pct: null }
  ];

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  /** Полная переменная себестоимость месяца: сырьё+recover+бензин+сборщик+пакеты+себес фракций.
   *  «В чистое» 0.60×N в цене, не в себесе интереса. */
  function monthVariableCost_(fact) {
    fact = fact || {};
    var raw = Number(fact.rawCost) || 0;
    var recover = Number(fact.recoverByn) || 0;
    var n = Math.max(1, Number(fact.deliveriesN) || 1);
    var gas = Number(fact.gasByn);
    if (!isFinite(gas)) gas = 4 * n;
    var assembly = Number(fact.assemblyByn);
    if (!isFinite(assembly)) assembly = 3 * n;
    var packs = Number(fact.packagesByn) || 0;
    var fracCost = Number(fact.fracCostByn != null ? fact.fracCostByn : fact.fracCost) || 0;
    return round2(raw + recover + gas + assembly + packs + fracCost);
  }

  function pickTier_(pct) {
    if (!(isFinite(pct))) return "meh";
    if (pct < 0) return "loss";
    if (pct < 15) return "bad";
    if (pct < 30) return "meh";
    if (pct < 40) return "good";
    return "high";
  }

  /**
   * @param {number} turnover месячный оборот (одна цена подписки)
   * @param {number|object} costOrFact себес или fact из quotePp
   */
  function analyze(turnover, costOrFact) {
    var turn = round2(turnover);
    var cost =
      costOrFact != null && typeof costOrFact === "object"
        ? monthVariableCost_(costOrFact)
        : round2(costOrFact);
    var clean = round2(turn - cost);
    var pct = turn > 0 ? round2((clean / turn) * 100) : (clean < 0 ? -100 : 0);
    var current = pickTier_(pct);
    var goalRub = round2(turn * 0.3);
    var rows = TIERS.map(function (t) {
      var need = t.pct == null ? 0 : round2(turn * (t.pct / 100));
      var delta = t.id === "loss" ? clean : round2(clean - need);
      var gapLabel;
      if (t.id === "loss") {
        gapLabel = clean < 0 ? ("в минусе " + Math.abs(clean) + " р") : "не в минусе";
      } else if (delta >= 0) {
        gapLabel = "сверху " + delta + " р";
      } else {
        gapLabel = "не хватает " + Math.abs(delta) + " р";
      }
      return {
        id: t.id,
        label: t.label,
        pct: t.pct,
        needRub: need,
        delta: delta,
        gapLabel: gapLabel,
        current: t.id === current
      };
    });
    return {
      turnover: turn,
      cost: cost,
      clean: clean,
      pct: pct,
      goalRub: goalRub,
      current: current,
      tiers: rows
    };
  }

  function html(turnover, costOrFact, escFn) {
    var esc = typeof escFn === "function" ? escFn : function (s) { return String(s == null ? "" : s); };
    var a = analyze(turnover, costOrFact);
    if (!(a.turnover > 0) && !(a.cost > 0)) return "";
    var out = '<div class="nx-coef-interest" data-tier="' + esc(a.current) + '">';
    out += '<p class="b-lbl">Выгода за месяц</p>';
    out +=
      '<p class="b-note">Чистыми ' +
      esc(String(a.clean)) +
      " р (" +
      esc(String(a.pct)) +
      "%). Цель 30% = " +
      esc(String(a.goalRub)) +
      " р. Себес от коэффа не зависит.</p>";
    out += '<ul class="nx-coef-interest__list">';
    a.tiers.forEach(function (t) {
      out +=
        '<li class="nx-coef-interest__row' +
        (t.current ? " nx-coef-interest__row--on" : "") +
        '"><span class="nx-coef-interest__name">' +
        esc(t.label) +
        (t.pct != null ? " ≥" + t.pct + "%" : " &lt;0") +
        '</span><span class="nx-coef-interest__gap">' +
        esc(t.gapLabel) +
        "</span></li>";
    });
    out += "</ul></div>";
    return out;
  }

  return {
    TIERS: TIERS,
    monthVariableCost_: monthVariableCost_,
    analyze: analyze,
    html: html
  };
});
