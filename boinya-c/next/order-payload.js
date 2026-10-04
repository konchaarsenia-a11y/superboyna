/* Сборка saveBooking в том же виде, что sendEntireOrder → bookParams
   (boinya-c/app.main.js, блок bookParams около строки 6094).
   Цифры и корзина считаются функциями из order-engine.js (копия app.main.js). */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoinyaOrderPayload = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function numOrNull(v) {
    if (v === "" || v == null) return null;
    var n = Number(String(v).replace(",", "."));
    return isNaN(n) ? null : n;
  }

  function permanentText(notes) {
    return (notes || []).filter(function (n) {
      return n && n.permanent && String(n.text || "").trim();
    }).map(function (n) { return String(n.text).trim(); }).join(" · ");
  }

  function couponsOf(state) {
    if (!state || state.orderType !== "partner" || !state.partnerCouponsEnabled) {
      return { couponsQty: 0, couponPrice: 0 };
    }
    var qty = Math.floor(Number(state.couponsQty) || 0);
    var pack = Number(state.couponPrice) || 0;
    if (qty < 0) qty = 0;
    if (pack < 0) pack = 0;
    pack = Math.round(pack * 100) / 100;
    return { couponsQty: qty, couponPrice: pack, couponsCost: pack };
  }

  function sourceOf(ot) {
    if (ot === "bp") return "bp";
    if (ot === "pp") return "pp";
    if (ot === "partner") return "partner";
    return "retail";
  }

  /** Цена как в sendEntireOrder: БП = 0, розница = поле или прайс, ПП/партнёр = поле или null. */
  function orderPriceOf(state, eng) {
    state = state || {};
    var ot = state.orderType || "pp";
    if (ot === "bp") return 0;
    if (ot === "retail") {
      var dog = Number(state.activeDog) === 2 ? 2 : 1;
      var list = (state.baskets && state.baskets[dog]) || state.basket || [];
      var local = eng.retailQuote(list, !!state.retailPaidDelivery);
      var pv = state.priceInput;
      if (pv !== "" && pv != null && !isNaN(Number(String(pv).replace(",", ".")))) {
        return Number(String(pv).replace(",", "."));
      }
      return local && local.total != null ? local.total : 0;
    }
    if (ot === "partner" || ot === "pp") return numOrNull(state.priceInput);
    return null;
  }

  function retailDisplayed(state, eng) {
    var dog = Number(state.activeDog) === 2 ? 2 : 1;
    var list = (state.baskets && state.baskets[dog]) || [];
    return eng.retailQuote(list, !!state.retailPaidDelivery);
  }

  function addressFull(state, eng) {
    var raw = String(state.address || "").trim();
    var street = eng.formatStreetHouse(raw) || raw;
    return street;
  }

  function composedAddress(state, eng) {
    return eng.composeDeliveryAddress(
      addressFull(state, eng),
      state.entrance,
      state.floor,
      state.flat
    );
  }

  function geoOf(state, eng) {
    if (state.geo && state.geo.lat != null && state.geo.lon != null) {
      return {
        lat: state.geo.lat,
        lon: state.geo.lon,
        yandexUrl: state.geo.yandexUrl || ""
      };
    }
    var parsed = eng.parseLatLonFromText_(String(state.address || ""));
    if (!parsed) return null;
    return {
      lat: parsed.lat,
      lon: parsed.lon,
      yandexUrl: "https://yandex.ru/maps/?pt=" + parsed.lon + "," + parsed.lat + "&z=17&l=map"
    };
  }

  /** Примечание как в sendEntireOrder: теги доставки спереди, тело [NOTE:…] следом. */
  function noteOf(state, eng) {
    var notes = state.notes || [];
    var noteBody = eng.serializeOrderNotes(notes);
    var outside = !!state.outsideMinsk;
    var method = state.deliveryMethod || null;
    var office = String(state.postOffice || "").trim();
    var clientNote = String(noteBody || "").trim();
    if (outside && method) {
      if (method === "euro" || method === "bel") {
        clientNote = eng.applyDeliveryTag(clientNote, method);
        clientNote = eng.applyOfficeTag(clientNote, office);
      } else {
        clientNote = eng.applyDeliveryTag(clientNote, method);
        clientNote = eng.stripOfficeTag(clientNote);
      }
    } else {
      clientNote = eng.stripDeliveryTags(clientNote);
      clientNote = eng.stripOfficeTag(clientNote);
    }
    clientNote = eng.stripGeoTags(clientNote);
    try {
      var wishGeo = (typeof globalThis !== "undefined" && globalThis.BoinyaWishesGeo) || null;
      if (wishGeo && wishGeo.peel) clientNote = wishGeo.peel(clientNote).text;
    } catch (eWishGeo) {}
    clientNote = String(clientNote || "").replace(/\[TEL:[^\]]+\]/gi, "").trim();
    var tagBits = [];
    String(clientNote || "").replace(/\[(ЕВРОПОЧТА|БЕЛПОЧТА|КУРЬЕР|ОТДЕЛЕНИЕ:[^\]]*|НЕ РЕЗАТЬ|РЕЗАТЬ)\]/gi, function (x) {
      tagBits.push(x);
      return "";
    });
    clientNote = (tagBits.join(" ") + (tagBits.length && noteBody ? " " : "") + noteBody).trim();
    clientNote = String(clientNote || "")
      .replace(/\[SEG:[^\]]*\]/gi, "")
      .replace(/\[ЦЕНА:[^\]]*\]/gi, "")
      .replace(/\[SUB:[^\]]*\]/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return { note: clientNote, noteBody: noteBody, permanentNote: permanentText(notes) };
  }

  function basketOf(state, eng) {
    eng.applyState(state);
    return eng.buildOrderSaveBasket_();
  }

  function slotOf(state, eng) {
    eng.applyState(state);
    return eng.currentPpSlotPayload_();
  }

  /**
   * Параметры запроса saveBooking. weekDay — уже разрешённый день недели
   * (resolveDayForDate), как weekDayToSave в старой форме.
   */
  function buildSaveBookingParams(state, eng, weekDay) {
    state = state || {};
    var ot = state.orderType || "pp";
    var price = orderPriceOf(state, eng);
    var packed = noteOf(state, eng);
    var coupons = couponsOf(state);
    var slot = slotOf(state, eng);
    var basket = basketOf(state, eng);
    var geo = geoOf(state, eng);
    var weekDayToSave = weekDay || "";
    var editClient = state.isEdit ? String(state.editOriginalClient || "") : "";
    var editDay = state.isEdit ? String(state.editOriginalDay || "") : "";
    var editDate = state.isEdit ? String(state.editOriginalDate || "") : "";
    var editKey = state.isEdit ? String(state.editOriginalMatchKey || "") : "";
    var noteCleared = !String(packed.noteBody || "").trim();
    var book = {
      action: "saveBooking",
      date: String(state.deliveryDate || ""),
      day: weekDayToSave || "",
      oldDay: editDay || "",
      oldDate: editDate || "",
      alsoSaveOrder: weekDayToSave ? "1" : "0",
      calendarOnly: weekDayToSave ? "0" : "1",
      client: String(state.client || "").trim(),
      editClient: editClient,
      originalClient: editClient,
      matchKey: editKey,
      address: composedAddress(state, eng),
      phone: String(state.phone || "").trim(),
      note: packed.note || "",
      permanentNote: packed.permanentNote || "",
      clearNote: noteCleared ? "1" : "",
      orderType: ot || "",
      segment: eng.orderTypeToSegment_(ot) || "",
      orderPrice: price != null ? String(price) : "",
      deliverySlot: slot.deliverySlot ? String(slot.deliverySlot) : "",
      ppSlot: slot.ppSlot || "",
      deliveriesN: slot.deliveriesN != null && slot.deliveriesN !== "" ? String(slot.deliveriesN) : "",
      deliveryAfter: String(state.deliveryAfter || ""),
      deliveryBefore: String(state.deliveryBefore || ""),
      ppPartner: ot === "bp" ? String(state.ppPartner || "").trim() : "",
      couponsQty: String(coupons.couponsQty || 0),
      couponPrice: String(coupons.couponPrice || 0),
      source: sourceOf(ot),
      basket: JSON.stringify(basket || [])
    };
    if (geo) book.geo = JSON.stringify(geo);
    if (state.survey) {
      try { book.survey = JSON.stringify(state.survey); } catch (eSv) {}
    }
    return book;
  }

  /**
   * Новый заказ розницы из расчёта. Тот же снимок, что у «На потом»,
   * без записи в лист и без карточки клиента.
   */
  function retailOrderSnapshot(calc, eng) {
    calc = calc || {};
    var baskets = calc.baskets || {};
    var dogCount = Number(calc.dogCount) >= 2 ? 2 : 1;
    var paid = calc.retailPaidDelivery === true || calc.retailDelivery === "paid";
    var state = {
      orderType: "retail",
      client: String(calc.client || "").trim(),
      baskets: {
        1: baskets[1] || baskets["1"] || [],
        2: dogCount >= 2 ? (baskets[2] || baskets["2"] || []) : []
      },
      dogCount: dogCount,
      activeDog: Number(calc.activeDog) === 2 && dogCount >= 2 ? 2 : 1,
      retailPaidDelivery: paid,
      notes: [],
      isEdit: false,
      priceInput: calc.priceInput != null ? String(calc.priceInput) : ""
    };
    var snap = buildDeferredSnapshot(state, eng);
    snap.orderType = "retail";
    snap.retailPaidDelivery = paid;
    snap.isEdit = false;
    snap.client = state.client;
    return snap;
  }

  function buildDeferredSnapshot(state, eng) {
    state = state || {};
    var coupons = couponsOf(state);
    var slot = slotOf(state, eng);
    return {
      mode: "order",
      orderType: state.orderType || "pp",
      client: String(state.client || "").trim(),
      phone: String(state.phone || "").trim(),
      address: String(state.address || "").trim(),
      entrance: String(state.entrance || "").trim(),
      floor: String(state.floor || "").trim(),
      flat: String(state.flat || "").trim(),
      deliveryDate: String(state.deliveryDate || "").trim(),
      deliveryAfter: String(state.deliveryAfter || "").trim(),
      deliveryBefore: String(state.deliveryBefore || "").trim(),
      day: String(state.day || "").trim(),
      orderPrice: String(state.priceInput == null ? "" : state.priceInput).trim(),
      ppPartner: String(state.ppPartner || "").trim(),
      noteRaw: eng.serializeOrderNotes(state.notes || []),
      notes: JSON.parse(JSON.stringify(state.notes || [])),
      baskets: {
        1: JSON.parse(JSON.stringify((state.baskets && state.baskets[1]) || [])),
        2: JSON.parse(JSON.stringify((state.baskets && state.baskets[2]) || []))
      },
      dogCount: Number(state.dogCount) >= 2 ? 2 : 1,
      activeDog: Number(state.activeDog) === 2 ? 2 : 1,
      deliveryMethod: state.deliveryMethod || null,
      postOffice: String(state.postOffice || "").trim(),
      geo: geoOf(state, eng),
      retailPaidDelivery: !!state.retailPaidDelivery,
      partnerCouponsEnabled: !!state.partnerCouponsEnabled,
      couponsQty: coupons.couponsQty || 0,
      couponPrice: coupons.couponPrice || 0,
      deliverySlot: slot.deliverySlot || "",
      ppSlot: slot.ppSlot || "",
      ppDeliverySlotManual: (state.ppSlotManual === 1 || state.ppSlotManual === 2) ? state.ppSlotManual : null,
      igPaste: String(state.igPaste || ""),
      isEdit: !!state.isEdit,
      editOriginalClient: state.editOriginalClient || "",
      editOriginalDay: state.editOriginalDay || "",
      editOriginalMatchKey: state.editOriginalMatchKey || ""
    };
  }

  function mergeClientProfiles(mem, clients) {
    var out = mem && typeof mem === "object" ? mem : {};
    (clients || []).forEach(function (c) {
      if (!c) return;
      var nick = String(c.nick || "").trim();
      if (!nick) return;
      var key = nick.toUpperCase();
      var prev = out[key] || {};
      var bask = c.basket;
      if (typeof bask === "string") {
        try { bask = JSON.parse(bask || "[]"); } catch (e) { bask = []; }
      }
      if (!Array.isArray(bask)) bask = [];
      out[key] = {
        nick: nick,
        address: c.address || prev.address || "",
        phone: c.phone || prev.phone || "",
        note: c.note || prev.note || "",
        basket: bask.length ? bask : (prev.basket || []),
        orderType: c.source || c.orderType || prev.orderType || "",
        ppPartner: c.ppPartner || prev.ppPartner || "",
        updatedAt: Date.now()
      };
    });
    return out;
  }

  function draftUseful(payload) {
    return formHasData(payload);
  }

  function warehouseAlertOpen(wh) {
    if (!wh) return false;
    if (Number(wh.count) > 0 || Number(wh.clientCount) > 0) return true;
    if (wh.totalDeficits && wh.totalDeficits.length) return true;
    if (wh.clientDeficits && wh.clientDeficits.length) return true;
    return false;
  }

  function formHasData(state) {
    if (!state) return false;
    if (String(state.client || "").trim()) return true;
    if (String(state.address || "").trim()) return true;
    if (String(state.entrance || "").trim()) return true;
    if (String(state.floor || "").trim()) return true;
    if (String(state.flat || "").trim()) return true;
    if (String(state.phone || "").trim()) return true;
    if (String(state.postOffice || "").trim()) return true;
    if (String(state.igPaste || "").trim()) return true;
    if (state.orderType !== "bp") {
      var pv = String(state.priceInput == null ? "" : state.priceInput).trim();
      if (pv && pv !== "0") return true;
    }
    var b1 = (state.baskets && state.baskets[1]) || [];
    var b2 = (state.baskets && state.baskets[2]) || [];
    if (b1.length || b2.length) return true;
    if ((state.notes || []).some(function (n) { return n && String(n.text || "").trim(); })) return true;
    return false;
  }

  return {
    orderPriceOf: orderPriceOf,
    retailDisplayed: retailDisplayed,
    couponsOf: couponsOf,
    noteOf: noteOf,
    basketOf: basketOf,
    slotOf: slotOf,
    geoOf: geoOf,
    composedAddress: composedAddress,
    addressFull: addressFull,
    buildSaveBookingParams: buildSaveBookingParams,
    buildDeferredSnapshot: buildDeferredSnapshot,
    retailOrderSnapshot: retailOrderSnapshot,
    formHasData: formHasData,
    mergeClientProfiles: mergeClientProfiles,
    draftUseful: draftUseful,
    warehouseAlertOpen: warehouseAlertOpen,
    sourceOf: sourceOf
  };
});
