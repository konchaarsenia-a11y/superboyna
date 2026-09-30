/* Полоса нарезки: «Выложено» — половина веса, «Нарезано» — весь вес.
   Доля по граммам и по штукам, общая — среднее двух целых процентов, если есть оба. */
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

  function creditFactor(it) {
    if (it && it.done) return 1;
    if (it && it.laid) return 0.5;
    return 0;
  }

  function roundPct(done, all) {
    if (!all) return null;
    return Math.round((done / all) * 100);
  }

  function groupThousands(n) {
    var x = Math.round(Number(n) || 0);
    return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function summarize(items) {
    var gramsAll = 0;
    var gramsDone = 0;
    var piecesAll = 0;
    var piecesDone = 0;
    (items || []).forEach(function (it) {
      var qty = amount(it);
      var got = qty * creditFactor(it);
      if (isPiece(it)) {
        piecesAll += qty;
        piecesDone += got;
      } else {
        gramsAll += qty;
        gramsDone += got;
      }
    });
    var grams = roundPct(gramsDone, gramsAll);
    var pieces = roundPct(piecesDone, piecesAll);
    var total = 0;
    if (grams != null && pieces != null) total = Math.round((grams + pieces) / 2);
    else if (grams != null) total = grams;
    else if (pieces != null) total = pieces;
    var bits = [];
    if (gramsAll) bits.push(groupThousands(gramsDone) + " из " + groupThousands(gramsAll) + " г");
    if (piecesAll) bits.push(groupThousands(piecesDone) + " из " + groupThousands(piecesAll) + " шт.");
    return {
      total: total,
      grams: grams,
      pieces: pieces,
      gramsDone: gramsDone,
      gramsAll: gramsAll,
      piecesDone: piecesDone,
      piecesAll: piecesAll,
      line: bits.join(", ") || "0"
    };
  }

  return { summarize: summarize, roundPct: roundPct, groupThousands: groupThousands };
});
