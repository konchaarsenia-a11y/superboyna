/* Чистые правила недели/задач/закрытия — те же ветки, что в app.main.js.
   Не считает цены: корзина и слот остаются в order-engine.js. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoinyaWeekLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var WEEK = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье", "Будущая неделя"];
  var FULL_FROM = 6;

  function segmentToOrderType(seg) {
    var s = String(seg || "").trim().toUpperCase();
    if (!s) return "";
    if (s === "БП" || s === "BP") return "bp";
    if (s === "ПП" || s === "PP" || s === "АФК" || s === "AFK" || s === "SUBSCRIPTION") return "pp";
    if (s === "Р" || s === "R" || s === "RETAIL" || s === "РОЗНИЦА") return "retail";
    if (s.indexOf("ПАРТ") === 0 || s === "PARTNER" || s === "ВАРКА") return "partner";
    return "";
  }

  function orderTypeToSegment(ot) {
    if (ot === "bp") return "БП";
    if (ot === "pp") return "ПП";
    if (ot === "retail") return "Р";
    if (ot === "partner") return "ПАРТНЁР";
    return "";
  }

  function resolveOrderType(client) {
    client = client || {};
    var fromSeg = segmentToOrderType(client.segment);
    if (fromSeg) return fromSeg;
    var note = String(client.note || "");
    var segTag = note.match(/\[SEG:([^\]]+)\]/i);
    if (segTag) {
      var t0 = segmentToOrderType(segTag[1]);
      if (t0) return t0;
    }
    var src = String(client.source || client.orderType || "").toLowerCase();
    if (src === "bp" || src === "бп") return "bp";
    if (src === "pp" || src === "пп" || src === "subscription" || src === "afk") return "pp";
    if (src === "partner" || src === "партнёр" || src === "партнер") return "partner";
    if (src === "retail" || src === "розница") return "retail";
    if (/\[лист\s*БП\]/i.test(note) || /\bБП\s*[12]\b/i.test(note)) return "bp";
    if (/\[лист\s*ПП\]/i.test(note) || /ПП\s*N\s*=/i.test(note)) return "pp";
    if (/\bВАРКА\b/i.test(client.name || "") || /\bВАРКА\b/i.test(note)) return "partner";
    return "";
  }

  function viewClientKey(raw) {
    var s = String(raw || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    var at = s.match(/@([A-Za-z0-9._]{2,})/);
    var handle = "";
    if (at) handle = at[1];
    else {
      s = s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s*\b(АФК|ПП|БП|Р)\b\s*/gi, " ").replace(/\s+/g, " ").trim();
      var parts = s.split(/\s+/);
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i].replace(/^[.,;:]+|[.,;:]+$/g, "");
        if (/^[A-Za-z0-9._]{3,}$/.test(p) && /[A-Za-z]/.test(p)) { handle = p; break; }
      }
    }
    if (handle) return handle.toUpperCase().replace(/[._]/g, "");
    return s.toUpperCase().replace(/Ё/g, "Е");
  }

  function clientGaps(client) {
    var gaps = [];
    if (!resolveOrderType(client) && !String(client.segment || "").trim()) gaps.push("type");
    if (!String(client.address || "").trim()) gaps.push("address");
    if (!String(client.phone || "").trim() && !/(\+?\d[\d\s()-]{6,})/.test(String(client.note || ""))) gaps.push("phone");
    var basketLen = (client.basket && client.basket.length) || Number(client.basketCount) || Number(client.orderCount) || 0;
    if (!basketLen) gaps.push("basket");
    var ot = resolveOrderType(client);
    var segU = String(client.segment || "").toUpperCase();
    if ((ot === "bp" || segU === "БП" || segU === "BP") && !String(client.ppPartner || "").trim()) gaps.push("partner");
    return gaps;
  }

  function currentWeekKey(now) {
    var d = now ? new Date(now) : new Date();
    var day = d.getDay();
    var diff = (day === 0 ? -6 : 1 - day);
    var mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    return mon.getFullYear() + "-" + pad(mon.getMonth() + 1) + "-" + pad(mon.getDate());
  }

  function peopleToast(res, done) {
    if (!res || typeof res !== "object") return "Не вышло";
    if (res.status === "error" && !res.pendingSheets && !res.writeId) return String(res.message || "Не вышло");
    if (res.sheetsVerified) return "Точно " + (done || "сохранено");
    if (res.status === "accepted" || res.pendingSheets || res.writeId || res.status === "success" || res.d1Verified || res.sent_opaque) {
      return "Вношу…";
    }
    return String(res.message || "Не вышло");
  }

  function writeAccepted(res) {
    if (!res || typeof res !== "object") return false;
    if (res.status === "error" && !res.pendingSheets && !res.writeId) return false;
    return !!(res.status === "success" || res.status === "accepted" || res.writeId || res.sheetsVerified || res.pendingSheets || res.sent_opaque || res.d1Verified);
  }

  function moveParams(opts) {
    opts = opts || {};
    var calendarOnly = !!opts.calendarOnly;
    var newDay = calendarOnly ? "" : (opts.newDay || "");
    var oldDay = opts.oldDay || "";
    var dateOnly = !!(!calendarOnly && newDay && oldDay && newDay === oldDay);
    var cutRaw = opts.cutRaw === "no" || opts.cutRaw === "0" ? "0" : "1";
    var params = {
      action: "moveClient",
      client: String(opts.client || ""),
      oldDay: oldDay,
      newDay: newDay,
      oldDate: opts.oldDate || "",
      newDate: opts.newDate || "",
      dateOnly: dateOnly ? "1" : "0",
      calendarOnly: calendarOnly ? "1" : "0",
      cutRaw: cutRaw,
      noCut: cutRaw === "1" ? "0" : "1",
      matchKey: opts.matchKey || ""
    };
    if (opts.segment) params.segment = opts.segment;
    if (opts.orderType) {
      params.orderType = opts.orderType;
      params.source = opts.orderType;
    }
    return params;
  }

  function deleteParams(opts) {
    opts = opts || {};
    if (opts.calendarOnly && opts.date) {
      return {
        action: "removeCalendarClient",
        client: opts.client,
        date: opts.date,
        matchKey: opts.matchKey || "",
        _explicitDelete: "1",
        _userDelete: "1"
      };
    }
    var params = {
      action: "deleteClient",
      client: opts.client,
      day: opts.day || "",
      _explicitDelete: "1",
      _userDelete: "1"
    };
    if (opts.date) params.date = opts.date;
    if (opts.matchKey) params.matchKey = opts.matchKey;
    return params;
  }

  function pullPayload(drafts, day, date) {
    var payload = {
      action: "pullClientsFromMonth",
      clients: JSON.stringify((drafts || []).map(function (c) {
        return {
          client: c.name,
          address: c.address || "",
          phone: c.phone || "",
          note: c.note || "",
          segment: c.segment || "",
          ppPartner: c.ppPartner || "",
          ppSlot: c.ppSlot || "",
          deliverySlot: c.deliverySlot || "",
          basket: c.basket && c.basket.length ? c.basket : null
        };
      }))
    };
    if (day) payload.day = day;
    else payload.date = date || "";
    return payload;
  }

  function slotSaveParams(client, slot, date, day, calendarOnly) {
    var n = Math.max(2, Number(client.deliveriesN) || 2);
    var weekDay = calendarOnly ? "" : (day || "");
    return {
      action: "saveBooking",
      date: date,
      oldDate: date,
      day: weekDay,
      alsoSaveOrder: weekDay ? "1" : "0",
      calendarOnly: weekDay ? "0" : "1",
      client: client.name,
      editClient: client.name,
      originalClient: client.name,
      matchKey: client.matchKey || viewClientKey(client.name) || "",
      address: client.address || "",
      phone: client.phone || "",
      note: client.note || "",
      orderType: "pp",
      segment: "ПП",
      orderPrice: client.orderPrice != null ? String(client.orderPrice) : "",
      deliverySlot: String(slot),
      ppSlot: slot + "/" + n,
      deliveriesN: String(n),
      deliveryAfter: client.deliveryAfter || "",
      deliveryBefore: client.deliveryBefore || "",
      source: "pp",
      basket: JSON.stringify(client.basket || [])
    };
  }

  function deferredMode(it) {
    var m = String((it && it.mode) || "").trim().toLowerCase();
    if (m) return m;
    m = String((it && it.payload && it.payload.mode) || "").trim().toLowerCase();
    if (m) return m;
    if (/^перенос/i.test(String((it && it.title) || ""))) return "transfer";
    return "pp";
  }

  function tasksSub(it) {
    var m = deferredMode(it);
    if (m === "transfer") return "xfer";
    if (m === "buy") return "buy";
    if (m === "order" || m === "partner") return "orders";
    if (m === "remind") return "remind";
    return "pp";
  }

  function finishGuard() {
    var inflight = false;
    return {
      tryBegin: function () {
        if (inflight) return false;
        inflight = true;
        return true;
      },
      end: function () { inflight = false; },
      busy: function () { return inflight; }
    };
  }

  function placeTransferParams(opts) {
    opts = opts || {};
    var cutRaw = opts.cutRaw === "no" || opts.cutRaw === "0" ? "0" : "1";
    return {
      action: "placeTransferTask",
      telegramId: opts.telegramId || "",
      id: opts.id || "",
      client: opts.client || "",
      matchKey: opts.matchKey || "",
      address: opts.address || "",
      phone: opts.phone || "",
      note: opts.note || "",
      segment: opts.segment || "",
      newDate: opts.newDate || "",
      newDay: opts.newDay || "",
      cutRaw: cutRaw,
      noCut: cutRaw === "1" ? "0" : "1"
    };
  }

  function collectAccessTabs(tree, boxes) {
    var tabs = [];
    var kidsOn = {};
    (boxes || []).forEach(function (cb) {
      if (cb.parent) {
        if (!kidsOn[cb.parent]) kidsOn[cb.parent] = [];
        if (cb.checked) kidsOn[cb.parent].push(cb.tab);
      } else if (cb.checked && cb.tab) tabs.push(cb.tab);
    });
    Object.keys(tree || {}).forEach(function (par) {
      if (!kidsOn[par]) return;
      var on = kidsOn[par];
      if (on.length === tree[par].length) tabs.push(par);
      else if (on.length) tabs = tabs.concat(on);
      else if (par === "deferredScreen") tabs.push("deferredScreen.none");
    });
    return tabs;
  }

  var NOTIFY_KEYS = ["wh_buy", "cut_deficit", "out_next", "cut_increase", "date_nudge", "missed_delivery", "week_done", "access_req", "survey", "partner_order", "partner_suggest", "gb_lead"];
  var NOTIFY_DEFAULTS = {
    owner: NOTIFY_KEYS.slice(),
    manager: ["wh_buy", "date_nudge", "missed_delivery", "week_done", "survey"],
    cutter: ["cut_deficit", "out_next", "cut_increase"],
    logistics: ["wh_buy", "cut_deficit", "out_next"],
    courier: [],
    all: ["wh_buy", "date_nudge", "missed_delivery", "week_done", "survey", "cut_deficit", "out_next", "cut_increase"]
  };

  function notifyOverride(defaults, checked) {
    var parts = [];
    NOTIFY_KEYS.forEach(function (k) {
      var byRole = (defaults || []).indexOf(k) >= 0;
      var on = (checked || []).indexOf(k) >= 0;
      if (on && !byRole) parts.push("+" + k);
      if (!on && byRole) parts.push("-" + k);
    });
    return parts.join(",");
  }

  function basketLine(c) {
    var list = (c && c.basket) || [];
    if (!list.length) {
      var n = Number(c && (c.basketCount || c.orderCount)) || 0;
      return n ? (n + " поз.") : "";
    }
    return list.slice(0, 3).map(function (g) {
      var name = g.name || g.main || "";
      var val = g.val != null ? g.val : g.value;
      return name + (val != null && val !== "" ? " " + val : "");
    }).join(" · ");
  }

  return {
    WEEK: WEEK,
    FULL_FROM: FULL_FROM,
    segmentToOrderType: segmentToOrderType,
    orderTypeToSegment: orderTypeToSegment,
    resolveOrderType: resolveOrderType,
    viewClientKey: viewClientKey,
    clientGaps: clientGaps,
    currentWeekKey: currentWeekKey,
    peopleToast: peopleToast,
    writeAccepted: writeAccepted,
    moveParams: moveParams,
    deleteParams: deleteParams,
    pullPayload: pullPayload,
    slotSaveParams: slotSaveParams,
    deferredMode: deferredMode,
    tasksSub: tasksSub,
    finishGuard: finishGuard,
    placeTransferParams: placeTransferParams,
    collectAccessTabs: collectAccessTabs,
    NOTIFY_KEYS: NOTIFY_KEYS,
    NOTIFY_DEFAULTS: NOTIFY_DEFAULTS,
    notifyOverride: notifyOverride,
    basketLine: basketLine
  };
});
