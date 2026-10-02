/* Итог нарезки только в процентах.
   Нарезано — 80% результата, выложено — 20%.
   Доля этапа: среднее целых процентов по граммам и по штукам, если есть оба. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoinyaCutProgress = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function amount(it) {
    var n = Number(it && it.dry);
    if (!isFinite(n)) n = Number(it && it.plan);
    if (!isFinite(n) || n < 0) n = 0;
    return n;
  }

  function isPiece(it) {
    return /шт/i.test(String((it && it.unit) || ""));
  }

  function roundPct(done, all) {
    if (!all) return null;
    return Math.round((done / all) * 100);
  }

  function groupThousands(n) {
    var x = Math.round(Number(n) || 0);
    return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function stageShare(items, flag) {
    var gramsAll = 0;
    var gramsGot = 0;
    var piecesAll = 0;
    var piecesGot = 0;
    (items || []).forEach(function (it) {
      var qty = amount(it);
      var on = !!(it && it[flag]);
      if (isPiece(it)) {
        piecesAll += qty;
        if (on) piecesGot += qty;
      } else {
        gramsAll += qty;
        if (on) gramsGot += qty;
      }
    });
    var grams = roundPct(gramsGot, gramsAll);
    var pieces = roundPct(piecesGot, piecesAll);
    var pct = 0;
    if (grams != null && pieces != null) pct = Math.round((grams + pieces) / 2);
    else if (grams != null) pct = grams;
    else if (pieces != null) pct = pieces;
    return { pct: pct, grams: grams, pieces: pieces };
  }

  function summarize(items) {
    var cut = stageShare(items, "done");
    var laid = stageShare(items, "laid");
    var total = Math.round(0.8 * cut.pct + 0.2 * laid.pct);
    var line = "нарезано " + cut.pct + "% + выложено " + laid.pct + "% = 0,8×" + cut.pct + " + 0,2×" + laid.pct + " = " + total + "%";
    return {
      total: total,
      cut: cut.pct,
      laid: laid.pct,
      grams: null,
      pieces: null,
      line: line
    };
  }

  return { summarize: summarize, roundPct: roundPct, groupThousands: groupThousands };
});
