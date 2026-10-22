/* Фильтры партнёрок: заявки, точки, доступы. Сид сетей сюда не входит. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BoinyaPartnersLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function partnerSuggestStatusRu_(st) {
    var s = String(st || "новое");
    if (s === "просмотрено" || s === "в работе" || s === "отклонено" || s === "новое") return s;
    return "новое";
  }

  function partnerHubAccessGone_(row) {
    var st = String((row && row.status) || "active").toLowerCase();
    return st === "revoked" || st === "inactive" || st === "deleted";
  }

  function partnerPointHidden_(p) {
    if (!p) return true;
    var id = String(p.id || "");
    var nid = String(p.networkId || "");
    var low = (String(p.name || "") + " " + String(p.address || "")).toLowerCase();
    if (id === "pt_firedog_1" || nid === "net_firedog" || /firedog/.test(low)) return true;
    if (/маяковск/.test(low) || id === "pt_f7640014" || id === "pt_mtu4v0dsdy3o") {
      if (id !== "pt_varka_mayakovskogo_14") return true;
    }
    return false;
  }

  function partnerPointFace_(p) {
    p = p || {};
    var nm = p.name || p.id;
    var addr = p.address || "";
    var id = String(p.id);
    if (id === "pt_polotno_1") { nm = "polotno_an"; addr = "Чечота 11"; }
    if (id === "pt_indix_1") { nm = "indixvost"; addr = "Проспект победителей 73/1"; }
    if (id === "pt_varka_mayakovskogo_14") { nm = "Varka Маяковского 14"; addr = "Маяковского 14"; }
    return { name: nm, address: addr };
  }

  function partnerAccessOpen_(a) {
    if (!a || partnerHubAccessGone_(a)) return false;
    var role = String(a.role || "").toLowerCase();
    var name = String(a.name || "").trim();
    if (role === "owner") return false;
    if (name === "Владелец Good Boy" || /^владелец\b/i.test(name)) return false;
    return true;
  }

  function partnerMinskToday_(nowMs) {
    var t = new Date((nowMs == null ? Date.now() : nowMs) + 3 * 3600 * 1000);
    var y = t.getUTCFullYear();
    var m = String(t.getUTCMonth() + 1);
    var day = String(t.getUTCDate());
    return y + "-" + (m.length < 2 ? "0" + m : m) + "-" + (day.length < 2 ? "0" + day : day);
  }

  function partnerHubOrders_(items, opts) {
    var today = (opts && opts.today) || partnerMinskToday_();
    var list = (items || []).filter(function (it) {
      if (!it) return false;
      var pl = it.payload || {};
      var isPartner = String(it.mode || pl.mode || "").toLowerCase() === "partner" ||
        String(pl.orderType || "") === "partner";
      if (!isPartner) return false;
      var orderSt = String(pl.orderStatus || "new").toLowerCase();
      if (orderSt === "delivered" || orderSt === "cancelled" || orderSt === "canceled") return false;
      var rowSt = String(it.status || "open").toLowerCase();
      if (rowSt === "cancelled") return false;
      var date = String(pl.deliverDateIso || "").trim();
      // Прошедшая дата и закрытая заявка без будущей даты — не очередь. Строка в D1 остаётся.
      if (date && date < today) return false;
      if ((rowSt === "done" || rowSt === "cancelled") && (!date || date < today)) return false;
      return true;
    });
    var seenPo = Object.create(null);
    var seenFp = Object.create(null);
    return list.filter(function (it) {
      var pl = it.payload || {};
      var po = String(pl.partnerOrderId || "").trim();
      if (po) {
        if (seenPo[po]) return false;
        seenPo[po] = 1;
      }
      var fp = [String(pl.locationId || ""), String(pl.partnerTelegramId || ""),
        String((pl.basket || []).map(function (b) { return (b && b.id) + ":" + (b && b.qty); }).join(",")),
        String(pl.note || pl.partnerNote || "")].join("|");
      if (fp !== "|||") {
        if (seenFp[fp]) return false;
        seenFp[fp] = 1;
      }
      return true;
    });
  }

  function partnerPayload_(it) {
    var pl = it && it.payload;
    if (typeof pl === "string") {
      try { pl = JSON.parse(pl); } catch (ePl) { pl = null; }
    }
    return pl && typeof pl === "object" ? pl : {};
  }

  function partnerItem_(it) {
    var pl = partnerPayload_(it);
    var mode = String((it && it.mode) || pl.mode || "").toLowerCase();
    return mode === "partner" || String(pl.orderType || "") === "partner";
  }

  function partnerOrderNeedsDate_(it) {
    if (!partnerItem_(it)) return false;
    var pl = partnerPayload_(it);
    var st = String(pl.orderStatus || "new").toLowerCase();
    if (st === "delivered" || st === "cancelled" || st === "canceled") return false;
    var rowSt = String((it && it.status) || "").toLowerCase();
    if (rowSt === "cancelled") return false;
    return !/^\d{4}-\d{2}-\d{2}$/.test(String(pl.deliverDateIso || "").trim());
  }

  function partnerTaskOpen_(it) {
    if (!it) return false;
    if (partnerItem_(it) && !partnerOrderNeedsDate_(it)) {
      var pl = partnerPayload_(it);
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(pl.deliverDateIso || "").trim())) return false;
    }
    return String((it && it.status) || "open").toLowerCase() === "open";
  }

  function partnerOrderDayName_(iso) {
    try {
      var p = String(iso || "").split("-");
      if (p.length !== 3) return "";
      var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      var names = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
      return names[d.getDay()] || "";
    } catch (e) { return ""; }
  }

  return {
    partnerSuggestStatusRu_: partnerSuggestStatusRu_,
    partnerHubAccessGone_: partnerHubAccessGone_,
    partnerPointHidden_: partnerPointHidden_,
    partnerPointFace_: partnerPointFace_,
    partnerAccessOpen_: partnerAccessOpen_,
    partnerMinskToday_: partnerMinskToday_,
    partnerHubOrders_: partnerHubOrders_,
    partnerOrderNeedsDate_: partnerOrderNeedsDate_,
    partnerTaskOpen_: partnerTaskOpen_,
    partnerOrderDayName_: partnerOrderDayName_
  };
});
