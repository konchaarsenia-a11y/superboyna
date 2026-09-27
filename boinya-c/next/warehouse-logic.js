/* Остаток, подпись дня и видимые строки прайса — те же правила, что в app.main.js. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BoinyaWarehouseLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function formatWhNum(n) {
    var x = Number(n);
    if (!isFinite(x)) return "0";
    return (Math.round(x * 100) / 100).toString();
  }

  function warehouseTodayIso_() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  function formatWarehouseDayLabel_(iso) {
    if (!iso) iso = warehouseTodayIso_();
    try {
      var d = new Date(String(iso) + "T00:00:00");
      if (isNaN(d.getTime())) return iso;
      var days = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
      var dd = d.getDate();
      var mm = d.getMonth() + 1;
      return days[d.getDay()] + " " + (dd < 10 ? "0" : "") + dd + "." + (mm < 10 ? "0" : "") + mm;
    } catch (e) {
      return iso;
    }
  }

  function mondayIsoFromIsoDate_(iso) {
    try {
      if (!iso) return "";
      var d = new Date(String(iso) + "T00:00:00");
      if (isNaN(d.getTime())) return "";
      var day = d.getDay();
      var diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      var y = d.getFullYear();
      var m = d.getMonth() + 1;
      var dd = d.getDate();
      return y + "-" + (m < 10 ? "0" : "") + m + "-" + (dd < 10 ? "0" : "") + dd;
    } catch (e) {
      return "";
    }
  }

  function warehouseGasFlags_(res) {
    var items = (res && res.items) || [];
    return {
      gasAsOf: !!(res && res.view === "asOf" && items.some(function (it) { return it && it.asOfStock != null; })),
      gasWeek: !!(res && res.view === "weekStart" && items.some(function (it) { return it && it.weekStart != null; }))
    };
  }

  function warehouseNeedsPreview_(view, flags) {
    flags = flags || {};
    return (view === "asOf" && !flags.gasAsOf) || (view === "weekStart" && !flags.gasWeek);
  }

  function shownWarehouseQty_(it, view, preview, gasAsOf) {
    it = it || {};
    var weekStart = it.weekStart != null ? Number(it.weekStart) : (Number(it.stock || 0) + Number(it.arrival || 0));
    if (preview && preview.stockStart != null) weekStart = Number(preview.stockStart);
    var shown = weekStart;
    if (view === "asOf") {
      shown = (it.asOfStock != null && gasAsOf) ? Number(it.asOfStock)
        : (preview && preview.available != null ? Number(preview.available) : weekStart);
    }
    return shown;
  }

  function planWarehouseText_(d) {
    d = d || {};
    if (d.piece) return formatWhNum(d.dryG || d.needRaw) + " шт";
    if (d.dryG != null) {
      return (Number(d.dryG) >= 1000)
        ? (formatWhNum(Number(d.dryG) / 1000) + " кг")
        : (formatWhNum(d.dryG) + " г");
    }
    return "—";
  }

  function warehouseDeficitDates_(view, today) {
    if (view === "weekStart") return { dateFrom: "", dateTo: "" };
    return { dateFrom: today, dateTo: today };
  }

  function warehousePreviewAsOf_(view, today) {
    return view === "weekStart" ? mondayIsoFromIsoDate_(today) : today;
  }

  function visibleRetailPriceItems_(items) {
    var list = (items || []).filter(function (it) { return it && it.key; });
    var fracBases = Object.create(null);
    list.forEach(function (it) {
      var i = String(it.key).indexOf("|");
      if (i > 0) fracBases[String(it.key).slice(0, i)] = true;
    });
    return list.filter(function (it) {
      var k = String(it.key);
      return k.indexOf("|") >= 0 || !fracBases[k];
    });
  }

  return {
    formatWhNum: formatWhNum,
    warehouseTodayIso_: warehouseTodayIso_,
    formatWarehouseDayLabel_: formatWarehouseDayLabel_,
    mondayIsoFromIsoDate_: mondayIsoFromIsoDate_,
    warehouseGasFlags_: warehouseGasFlags_,
    warehouseNeedsPreview_: warehouseNeedsPreview_,
    shownWarehouseQty_: shownWarehouseQty_,
    planWarehouseText_: planWarehouseText_,
    warehouseDeficitDates_: warehouseDeficitDates_,
    warehousePreviewAsOf_: warehousePreviewAsOf_,
    visibleRetailPriceItems_: visibleRetailPriceItems_
  };
});
