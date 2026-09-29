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

  function partnerHubOrders_(items) {
    var list = (items || []).filter(function (it) {
      if (!it || String(it.status || "open").toLowerCase() === "done") return false;
      var pl = it.payload || {};
      var isPartner = String(it.mode || pl.mode || "").toLowerCase() === "partner" ||
        String(pl.orderType || "") === "partner";
      if (!isPartner) return false;
      return !!(pl.needsSlot || !String(pl.deliverDateIso || "").trim());
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
    partnerHubOrders_: partnerHubOrders_,
    partnerOrderDayName_: partnerOrderDayName_
  };
});
