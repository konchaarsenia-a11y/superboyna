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
      .replace(/\[(?:ФИО|ДОМ|ИНДЕКС|ГОРОД|РАЙОН|ОБЛАСТЬ|ДРУГОЕ):[^\]]*\]/gi, "")
      .replace(/\[ПОЧТА\]/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (state.mailOn && (state.deliveryMethod === "euro" || state.deliveryMethod === "bel" || state.deliveryMethod === "other")) {
      clientNote = String(clientNote || "")
        .replace(/\[ЕВРОПОЧТА\]/gi, "")
        .replace(/\[БЕЛПОЧТА\]/gi, "")
        .replace(/\[ОТДЕЛЕНИЕ:[^\]]*\]/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      clientNote = mailTags_(state) + (clientNote ? " " + clientNote : "");
    }
    return { note: clientNote, noteBody: noteBody, permanentNote: permanentText(notes) };
  }

  function mailBit_(label, value) {
    var v = String(value || "").replace(/[\[\]]/g, " ").replace(/\s+/g, " ").trim();
    if (!v) return "";
    return "[" + label + ":" + v + "]";
  }

  function mailTags_(state) {
    state = state || {};
    var method = state.deliveryMethod;
    var bits = [];
    if (method === "euro") {
      bits.push("[ЕВРОПОЧТА]");
      bits.push(mailBit_("ФИО", state.mailFio));
      bits.push(mailBit_("ОТДЕЛЕНИЕ", state.postOffice));
      bits.push(mailBit_("TEL", state.mailPhone));
    } else if (method === "bel") {
      bits.push("[БЕЛПОЧТА]");
      bits.push(mailBit_("ФИО", state.mailFio));
      bits.push(mailBit_("TEL", state.mailPhone));
      bits.push(mailBit_("ДОМ", state.mailHome));
      bits.push(mailBit_("ИНДЕКС", state.mailIndex));
      bits.push(mailBit_("ГОРОД", state.mailCity));
      bits.push(mailBit_("РАЙОН", state.mailDistrict));
      bits.push(mailBit_("ОБЛАСТЬ", state.mailRegion));
    } else if (method === "other") {
      bits.push("[ПОЧТА]");
      bits.push(mailBit_("ДРУГОЕ", state.mailOther));
    }
    return bits.filter(Boolean).join(" ");
  }

  function mailFromNote_(note) {
    var s = String(note || "");
    var out = { mailOn: false, deliveryMethod: null };
    function grab(label) {
      var m = s.match(new RegExp("\\[" + label + ":([^\\]]*)\\]", "i"));
      return m ? String(m[1] || "").trim() : "";
    }
    if (/\[ЕВРОПОЧТА\]/i.test(s)) {
      out.mailOn = true;
      out.deliveryMethod = "euro";
      out.mailFio = grab("ФИО");
      out.postOffice = grab("ОТДЕЛЕНИЕ");
      out.mailPhone = grab("TEL");
    } else if (/\[БЕЛПОЧТА\]/i.test(s)) {
      out.mailOn = true;
      out.deliveryMethod = "bel";
      out.mailFio = grab("ФИО");
      out.mailPhone = grab("TEL");
      out.mailHome = grab("ДОМ");
      out.mailIndex = grab("ИНДЕКС");
      out.mailCity = grab("ГОРОД");
      out.mailDistrict = grab("РАЙОН");
      out.mailRegion = grab("ОБЛАСТЬ");
    } else if (/\[ПОЧТА\]/i.test(s)) {
      out.mailOn = true;
      out.deliveryMethod = "other";
      out.mailOther = grab("ДРУГОЕ");
    }
    return out;
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
      address: addressFull(state, eng),
      entrance: String(state.entrance || "").trim(),
      doorCode: String(state.doorCode || "").trim(),
      floor: String(state.floor || "").trim(),
      flat: String(state.flat || "").trim(),
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
    var dog1 = String((state.dogNames && state.dogNames[1]) || "").trim();
    var dog2 = String((state.dogNames && state.dogNames[2]) || "").trim();
    if (dog1 || dog2) book.dogNames = JSON.stringify({ 1: dog1, 2: dog2 });
    if (Number(state.dogCount) >= 2) book.dogCount = "2";
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
      doorCode: String(state.doorCode || "").trim(),
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
      mailOn: !!state.mailOn,
      mailFio: String(state.mailFio || "").trim(),
      mailPhone: String(state.mailPhone || "").trim(),
      mailHome: String(state.mailHome || "").trim(),
      mailIndex: String(state.mailIndex || "").trim(),
      mailCity: String(state.mailCity || "").trim(),
      mailDistrict: String(state.mailDistrict || "").trim(),
      mailRegion: String(state.mailRegion || "").trim(),
      mailOther: String(state.mailOther || "").trim(),
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

  function splitDoor_(entrance) {
    var s = String(entrance || "").trim();
    var m = s.match(/домофон\s*([^\s,;·|]{1,24})/i);
    if (!m) return { entrance: s, doorCode: "" };
    var door = String(m[1] || "").replace(/[.,;]+$/g, "").trim();
    var rest = (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length))
      .replace(/[,\s·|]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    return { entrance: rest, doorCode: door };
  }

  function addressParts(client, eng) {
    client = client || {};
    var street = String(client.address || "").trim();
    var entrance = String(client.entrance || "").trim();
    var doorCode = String(client.doorCode || "").trim();
    var floor = String(client.floor || "").trim();
    var flat = String(client.flat || "").trim();
    if (!entrance && !doorCode && !floor && !flat && street && eng && eng.parseDeliveryAddress) {
      var parsed = eng.parseDeliveryAddress(street);
      var door = splitDoor_(parsed && parsed.entrance);
      street = String((parsed && parsed.street) || street).trim();
      entrance = door.entrance;
      doorCode = door.doorCode;
      floor = String((parsed && parsed.floor) || "").trim();
      flat = String((parsed && parsed.flat) || "").trim();
    } else if (entrance && !doorCode) {
      var doorOnly = splitDoor_(entrance);
      entrance = doorOnly.entrance;
      doorCode = doorOnly.doorCode;
    }
    var loose = peelLooseMarkers_(street);
    var takeEntrance = !!(loose.entrance && (!entrance || entrance === loose.entrance));
    var takeDoor = !!(loose.doorCode && (!doorCode || doorCode === loose.doorCode));
    var dropped = (loose.entrance && !takeEntrance) || (loose.doorCode && !takeDoor);
    if (!dropped) {
      street = loose.street;
      if (takeEntrance) entrance = loose.entrance;
      if (takeDoor) doorCode = loose.doorCode;
    }
    return { street: street, entrance: entrance, doorCode: doorCode, floor: floor, flat: flat };
  }

  function tidyStreet_(s) {
    return String(s || "")
      .replace(/[ \t]*[·|;,]+[ \t]*/g, " · ")
      .replace(/(?:\s*·\s*){2,}/g, " · ")
      .replace(/^(?:\s*·\s*)+|(?:\s*·\s*)+$/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function peelLooseMarkers_(street) {
    var s = String(street || "");
    var entrance = "";
    var doorCode = "";
    function cut(re) {
      var m = s.match(re);
      if (!m) return "";
      var val = String(m[1] || "").trim();
      s = s.slice(0, m.index) + " " + s.slice(m.index + m[0].length);
      return val;
    }
    entrance = cut(/(?:^|[·|;,\s])п\.\s*([0-9]*[A-Za-zА-Яа-яЁё][0-9A-Za-zА-Яа-яЁё]{0,14})/);
    doorCode = cut(/(?:^|[·|;,\s])код\s+([^\s·|;,]{1,16})/i);
    if (!doorCode) doorCode = cut(/(?:^|[·|;,\s])([кКkK]\d{4,})\b/);
    return { street: tidyStreet_(s), entrance: entrance, doorCode: doorCode };
  }

  function showAddress(client, eng) {
    var p = addressParts(client, eng);
    var bits = [];
    if (p.street) bits.push(p.street);
    if (p.entrance) bits.push(/^(подъезд|п\.)/i.test(p.entrance) ? p.entrance : ("п." + p.entrance));
    if (p.doorCode) bits.push(/^домофон/i.test(p.doorCode) ? p.doorCode : ("домофон " + p.doorCode));
    if (p.floor) bits.push(/^(этаж|эт\.)/i.test(p.floor) ? p.floor : ("эт." + p.floor));
    if (p.flat) {
      var ft = String(p.flat).replace(/^(квартира|кв\.?)\s*/i, "").trim();
      if (ft) bits.push("кв." + ft);
    }
    return bits.join(" · ");
  }

  function mapStreet(client, eng) {
    return addressParts(client, eng).street;
  }

  function addressCompact_(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/подъезд/g, "п.")
      .replace(/этаж/g, "эт.")
      .replace(/квартира/g, "кв.")
      .replace(/[·|,;/]+/g, " ")
      .replace(/\s+/g, "")
      .replace(/\./g, "");
  }

  function addressCompactBare_(s) {
    return addressCompact_(String(s || "").replace(/домофон/gi, ""));
  }

  function addressResidue_(street) {
    return /подъезд|домофон|этаж|эт\.|кв\.|п\.|(?:^|[\s,·])[кk]\d{4,}/i.test(String(street || ""));
  }

  function addressLossless(raw, eng) {
    var source = String(raw || "").trim();
    var empty = addressParts({ address: "" }, eng);
    if (!source) return { ok: false, reason: "empty", parts: empty, shown: "" };
    var parts = addressParts({ address: source }, eng);
    var shown = showAddress({
      address: parts.street,
      entrance: parts.entrance,
      doorCode: parts.doorCode,
      floor: parts.floor,
      flat: parts.flat
    }, eng);
    var same = addressCompact_(shown) === addressCompact_(source) ||
      addressCompactBare_(shown) === addressCompactBare_(source);
    var residue = addressResidue_(parts.street);
    var moved = !!(parts.entrance || parts.doorCode || parts.floor || parts.flat);
    var reason = !moved ? "plain" : (residue ? "residue" : (same ? "ok" : "diff"));
    return { ok: same && !residue && moved, reason: reason, parts: parts, shown: shown };
  }

  function absorbGluedAddress(state, eng) {
    state = state || {};
    var raw = String(state.address || "").trim();
    if (!raw) return false;
    var split = addressLossless(raw, eng);
    if (!split.ok) return false;
    var p = split.parts;
    function agrees(cur, next) {
      cur = String(cur || "").trim();
      next = String(next || "").trim();
      return !cur || !next || cur === next;
    }
    if (!agrees(state.entrance, p.entrance) || !agrees(state.doorCode, p.doorCode) ||
      !agrees(state.floor, p.floor) || !agrees(state.flat, p.flat)) return false;
    if (p.entrance) state.entrance = p.entrance;
    if (p.doorCode) state.doorCode = p.doorCode;
    if (p.floor) state.floor = p.floor;
    if (p.flat) state.flat = p.flat;
    if (p.street) state.address = p.street;
    return state.address !== raw;
  }

  function fillEmptyContact(state, card, eng) {
    state = state || {};
    card = card || {};
    var changed = false;
    var addr = String(card.address || "").trim();
    var emptyAddr = !String(state.address || "").trim() &&
      !String(state.entrance || "").trim() &&
      !String(state.floor || "").trim() &&
      !String(state.flat || "").trim() &&
      !String(state.doorCode || "").trim();
    if (addr && emptyAddr) {
      state.address = addr;
      absorbGluedAddress(state, eng);
      changed = true;
    } else if (
      addr &&
      String(state.address || "").trim() &&
      !String(state.entrance || "").trim() &&
      !String(state.floor || "").trim() &&
      !String(state.flat || "").trim() &&
      !String(state.doorCode || "").trim()
    ) {
      var cardParts = addressParts({ address: addr }, eng);
      var mine = addressCompact_(state.address);
      var theirs = addressCompact_(cardParts.street);
      if (mine && theirs && (mine === theirs || theirs.indexOf(mine) === 0 || mine.indexOf(theirs) === 0)) {
        if (cardParts.entrance) { state.entrance = cardParts.entrance; changed = true; }
        if (cardParts.doorCode) { state.doorCode = cardParts.doorCode; changed = true; }
        if (cardParts.floor) { state.floor = cardParts.floor; changed = true; }
        if (cardParts.flat) { state.flat = cardParts.flat; changed = true; }
      }
    }
    if (card.phone && !String(state.phone || "").trim()) {
      state.phone = String(card.phone).trim();
      changed = true;
    }
    state.dogNames = state.dogNames || { 1: "", 2: "" };
    if (card.dogName && !String(state.dogNames[1] || "").trim()) {
      state.dogNames[1] = String(card.dogName).trim();
      changed = true;
    }
    if (card.dogName2 && !String(state.dogNames[2] || "").trim()) {
      state.dogNames[2] = String(card.dogName2).trim();
      changed = true;
    }
    return changed;
  }

  function formHasData(state) {
    if (!state) return false;
    if (String(state.client || "").trim()) return true;
    if (String(state.address || "").trim()) return true;
    if (String(state.entrance || "").trim()) return true;
    if (String(state.doorCode || "").trim()) return true;
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
    mailFromNote_: mailFromNote_,
    mailTags_: mailTags_,
    basketOf: basketOf,
    slotOf: slotOf,
    geoOf: geoOf,
    composedAddress: composedAddress,
    addressFull: addressFull,
    addressParts: addressParts,
    showAddress: showAddress,
    mapStreet: mapStreet,
    addressLossless: addressLossless,
    absorbGluedAddress: absorbGluedAddress,
    fillEmptyContact: fillEmptyContact,
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
