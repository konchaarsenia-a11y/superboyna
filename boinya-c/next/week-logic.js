/* Чистые правила недели/задач/закрытия — те же ветки, что в app.main.js.
   Не считает цены: корзина и слот остаются в order-engine.js. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoinyaWeekLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var WEEK = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье", "Будущая неделя"];
  var FULL_FROM = 8;

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

  function ppSlotNumber(raw) {
    var m = String(raw == null ? "" : raw).match(/(\d+)/);
    var n = m ? Number(m[1]) : 0;
    return n >= 1 ? n : 0;
  }

  /* Следующий слот: явный и сохранённый на дату побеждают.
     Иначе чередование 1↔2 по последнему слоту, а не «число доставок + 1»
     (после ПП2 счётчик уже 1 и снова предлагал 2). */
  function suggestPpSlot(opts) {
    opts = opts || {};
    var deliveries = Number(opts.deliveriesN);
    if (!(deliveries >= 1)) deliveries = 0;
    var cap = deliveries >= 2 ? deliveries : 2;
    var forced = Number(opts.forced) || ppSlotNumber(opts.forcedLabel);
    var stored = Number(opts.stored) || 0;
    var last = Number(opts.lastSlot) || 0;
    var count = Number(opts.priorCount) || 0;
    if (deliveries === 1) return { slot: 1, ppSlot: "1", needManual: false };
    if (forced >= 1) {
      var fs = Math.min(forced, cap);
      return { slot: fs, ppSlot: fs + "/" + (deliveries >= 2 ? deliveries : cap), needManual: false };
    }
    if (stored >= 1) {
      var ss = Math.min(stored, cap);
      return { slot: ss, ppSlot: ss + "/" + (deliveries >= 2 ? deliveries : cap), needManual: false };
    }
    var suggested;
    if (last >= 2) suggested = 1;
    else if (last === 1) suggested = Math.min(cap, 2);
    else suggested = Math.min(cap, Math.max(1, count + 1));
    if (!(suggested >= 1)) suggested = 1;
    var denom = deliveries >= 2 ? deliveries : cap;
    return { slot: suggested, ppSlot: suggested + "/" + denom, needManual: !!opts.needManual };
  }

  function slotSaveParams(client, slot, date, day, calendarOnly) {
    client = client || {};
    var known = Number(client.deliveriesN);
    var n = known >= 1 ? known : 2;
    var useSlot = Number(slot) || 1;
    var label;
    if (known === 1) {
      useSlot = 1;
      label = "1";
    } else {
      label = useSlot + "/" + n;
    }
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
      deliverySlot: String(useSlot),
      ppSlot: label,
      deliveriesN: String(n),
      deliveryAfter: client.deliveryAfter || "",
      deliveryBefore: client.deliveryBefore || "",
      source: "pp",
      basket: JSON.stringify(client.basket || [])
    };
  }

  function countPpSlots(list) {
    var pp1 = 0;
    var pp2 = 0;
    (list || []).forEach(function (c) {
      if (!c) return;
      var ot = "";
      try { ot = resolveOrderType(c); } catch (e) {}
      var seg = String(c.segment || "");
      if (ot !== "pp" && seg !== "ПП" && seg !== "АФК") return;
      var n = ppSlotNumber(c.deliverySlot || c.ppSlot);
      if (n === 1) pp1++;
      else if (n === 2) pp2++;
    });
    return { pp1: pp1, pp2: pp2 };
  }

  function orderMoney_(c) {
    if (!c || c.orderPrice == null || c.orderPrice === "") return null;
    var v = Number(String(c.orderPrice).replace(/\s/g, "").replace(",", "."));
    if (!isFinite(v)) return null;
    return v;
  }

  function paidFlag_(c) {
    if (c && c.ppPaid === true) return "yes";
    var p = String(c && c.paid != null ? c.paid : "").toLowerCase();
    if (p === "yes" || p === "true" || p === "1") return "yes";
    if (p === "no" || p === "false" || p === "0") return "no";
    return "";
  }

  function isPpRow_(c) {
    var ot = "";
    try { ot = resolveOrderType(c); } catch (e) {}
    var seg = String((c && c.segment) || "");
    return ot === "pp" || seg === "ПП" || seg === "АФК";
  }

  function subKey_(c) {
    var who = (c && (c.matchKey || viewClientKey(c.name) || c.name)) || "";
    var iso = String((c && (c._sumDate || c.dateIso || c.date)) || "").slice(0, 10);
    var month = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(0, 7) : "";
    return String(who).toUpperCase() + "|" + month;
  }

  function paySlotOf_(c) {
    var s = courierPaySlot_(c);
    if (s >= 1) return s;
    return ppSlotNumber(c && (c.deliverySlot || c.ppSlot)) || 0;
  }

  /* Цена подписки один раз: только на слоте с paid=yes (ПП1 или ПП2).
     Если отметки ещё нет — на слоте 1 / без номера, где оплату ждут.
     ПП2 без paid=yes в сумму не входит, даже если это единственная доставка месяца.
     Явный paid=no в сумму не входит. Доставка при этом остаётся. */
  function attributePpRevenue(list) {
    var amount = {};
    var doubled = [];
    var groups = {};
    (list || []).forEach(function (c, i) {
      if (!c || !isPpRow_(c)) {
        var plain = orderMoney_(c);
        if (plain != null && plain > 0) amount[i] = plain;
        return;
      }
      var k = subKey_(c);
      if (!groups[k]) groups[k] = [];
      groups[k].push(i);
    });
    Object.keys(groups).forEach(function (k) {
      var idxs = groups[k];
      var priced = idxs.filter(function (i) {
        var m = orderMoney_(list[i]);
        return m != null && m > 0;
      });
      if (priced.length >= 2) {
        doubled.push({
          key: k,
          name: (list[idxs[0]] && list[idxs[0]].name) || "",
          slots: priced.map(function (i) { return ppSlotNumber(list[i].deliverySlot || list[i].ppSlot); }),
          prices: priced.map(function (i) { return orderMoney_(list[i]); })
        });
      }
      var yes = idxs.filter(function (i) { return paidFlag_(list[i]) === "yes"; });
      var open = idxs.filter(function (i) { return paidFlag_(list[i]) !== "no"; });
      function bySlot(a, b) {
        var as = paySlotOf_(list[a]) || 9;
        var bs = paySlotOf_(list[b]) || 9;
        if (as !== bs) return as - bs;
        var ai = String(list[a]._sumDate || list[a].dateIso || list[a].date || "");
        var bi = String(list[b]._sumDate || list[b].dateIso || list[b].date || "");
        return ai < bi ? -1 : ai > bi ? 1 : 0;
      }
      var poolSrc = yes.length ? yes : open.filter(function (i) { return paySlotOf_(list[i]) < 2; });
      var pool = poolSrc.slice().sort(bySlot);
      var chosen = pool.length ? pool[0] : -1;
      if (chosen < 0) return;
      var money = orderMoney_(list[chosen]);
      if (money != null && money > 0) amount[chosen] = money;
    });
    return { amount: amount, doubled: doubled };
  }

  /* На строке ПП показываем только ту цену, которая входит в сумму месяца. */
  function stampPpPay(list) {
    var attr = attributePpRevenue(list);
    (list || []).forEach(function (c, i) {
      if (!c) return;
      if (!isPpRow_(c)) {
        if (c._pay != null) delete c._pay;
        return;
      }
      c._pay = attr.amount[i] || 0;
    });
    return list;
  }

  function revenueSum(list, opts) {
    opts = opts || {};
    var only = String(opts.onlyDate || "").slice(0, 10);
    var attr = attributePpRevenue(list);
    var sum = 0;
    var seen = false;
    (list || []).forEach(function (c, i) {
      if (attr.amount[i] == null) return;
      if (only) {
        var iso = String((c && (c._sumDate || c.dateIso || c.date)) || "").slice(0, 10);
        if (iso && iso !== only) return;
      }
      sum += attr.amount[i];
      seen = true;
    });
    if (!seen) return null;
    return Math.round(sum * 100) / 100;
  }

  function fracPaySlot_(raw) {
    var s = String(raw == null ? "" : raw).trim();
    var m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!m) return 0;
    var n = Number(m[1]);
    return n >= 1 ? n : 0;
  }

  function loosePaySlot_(raw) {
    var s = String(raw == null ? "" : raw).trim();
    if (s === "1" || s === "2") return Number(s);
    var hint = s.match(/пп\s*([12])/i);
    return hint ? Number(hint[1]) : 0;
  }

  /* Слот этой доставки: дробь важнее, подпись «ПП 2» перекрывает залипшую «1». */
  function courierPaySlot_(c) {
    c = c || {};
    var fromFrac = fracPaySlot_(c.ppSlot) || fracPaySlot_(c.deliverySlot);
    if (fromFrac) return fromFrac;
    var hint = loosePaySlot_(c.ppHint) || loosePaySlot_(c.segment);
    var bare = loosePaySlot_(c.ppSlot) || loosePaySlot_(c.deliverySlot);
    if (hint === 2 && bare === 1) return 2;
    if (bare) return bare;
    if (hint) return hint;
    if (Number(c.deliveriesN) === 1) return 1;
    return 0;
  }

  /* Курьер сегодня: та же оплата, что в статистике (цена один раз, на слоте оплаты).
     Слот 2+ входит только если оплата отмечена на этой доставке.
     Пустой слот 2 — оплата на другом слоте, сумму не показываем.
     paid=no в сумму не входит. БП и партнёр курьеру не платят. Розница платит здесь. */
  function courierStopMoney(c) {
    if (!c) return null;
    var ot = "";
    try { ot = resolveOrderType(c); } catch (eOt) { ot = ""; }
    if (!ot && isPpRow_(c)) ot = "pp";
    if (ot === "bp" || ot === "partner") return null;
    var money = orderMoney_(c);
    if (money == null || !(money > 0)) return null;
    if (ot !== "pp") return money;
    var paid = paidFlag_(c);
    if (paid === "no") return null;
    var slot = courierPaySlot_(c);
    if (slot >= 2) return paid === "yes" ? money : null;
    return money;
  }

  function courierCollectSum(list) {
    var sum = 0;
    (list || []).forEach(function (c) {
      var m = courierStopMoney(c);
      if (m == null) return;
      sum += m;
    });
    return Math.round(sum * 100) / 100;
  }

  /* Почта: тег в примечании заказа или deliveryMethod euro/bel. */
  function courierMailMethod(c) {
    c = c || {};
    var method = String(c.deliveryMethod || "").trim().toLowerCase();
    if (method === "euro" || method === "bel" || method === "other") return method;
    var note = String(c.note || "");
    if (/\[ЕВРОПОЧТА\]/i.test(note)) return "euro";
    if (/\[БЕЛПОЧТА\]/i.test(note)) return "bel";
    if (/\[ПОЧТА\]/i.test(note)) return "other";
    return "";
  }

  function ownPaidFlag_(c) {
    var p = String(c && c.paid != null ? c.paid : "").toLowerCase();
    if (p === "yes" || p === "true" || p === "1") return "yes";
    if (p === "no" || p === "false" || p === "0") return "no";
    return "";
  }

  /* «Оплачено?» при «доставлено».
     Почта — нет. Одна доставка и ПП1 — да, пока на этой доставке не paid=yes.
     ПП2 — нет, только если на ПП1 уже paid=yes (siblingPaid).
     ПП1 «не оплачено» или отметки ещё нет — спрашивать.
     Розница спрашивает. БП и партнёр — нет. */
  function courierShouldAskPaid(c) {
    if (!c) return false;
    if (courierMailMethod(c)) return false;
    if (ownPaidFlag_(c) === "yes") return false;
    var ot = "";
    try { ot = resolveOrderType(c); } catch (eOt) { ot = ""; }
    if (!ot && isPpRow_(c)) ot = "pp";
    var seg = String(c.segment || "").trim().toUpperCase();
    var isRetail = ot === "retail" || seg === "Р" || seg === "РОЗНИЦА";
    var isPp = ot === "pp" || seg === "ПП" || seg === "АФК";
    if (isRetail && !isPp) return true;
    if (!isPp) return false;
    var n = Number(c.deliveriesN) || 0;
    var slot = courierPaySlot_(c);
    if (n >= 2 && slot >= 2) {
      var sib = c.siblingPaid == null ? "" : ownPaidFlag_({ paid: c.siblingPaid });
      if (sib === "yes") return false;
      return true;
    }
    if (c.ppPaid === true) return false;
    return true;
  }

  function mailTrackClientText(track) {
    return "Здравствуйте!\nОтправили ваш заказик\nВот трэк код для отслеживания: " + String(track || "").trim();
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

  function finishPlain(res) {
    var msg = (res && res.message) || "finish_failed";
    var map = {
      owner_only: "Только владелец может закрыть неделю.",
      auth_required: "Сессия Telegram не подтвердилась. Закройте мини-апп и откройте снова из бота.",
      need_confirm: "Нет подтверждения.",
      unknown_action: "Нужен деплой Code.gs с закрытием недели.",
      week_already_finished: "Неделя уже закрыта — повторно нельзя.",
      week_finish_busy: "Перенос уже идёт. Второй раз неделю не сдвинет.",
      week_finish_stale: "Прошлый перенос не подтвердился. Неделя не закрыта.",
      week_finish_schedule_failed: "Не удалось запустить перенос. Неделя не закрыта.",
      week_finish_timeout: "Перенос ещё идёт, проверьте позже. Кнопку не нажимайте.",
      week_finish_unknown: "Перенос ещё идёт, проверьте позже. Кнопку не нажимайте.",
      cutover_danger_blocked: "Закрытие заблокировано. Обновите мини-апп и повторите.",
      sandbox_no_prod_week: "Это песочница: боевая неделя не меняется. Откройте без sandbox.",
      gas_proxy_failed: "Сервер не дошёл до таблицы. Неделя не закрыта."
    };
    if (map[msg]) msg = map[msg];
    var tip = res && res.tip ? String(res.tip) : "";
    if (tip && msg.indexOf(tip) < 0) msg += "\n" + tip;
    return msg;
  }

  function finishPendingActive(stored, now) {
    return Number(stored || 0) > Number(now || 0);
  }

  function finishBannerState(opts) {
    opts = opts || {};
    var wk = String(opts.weekKey || "");
    var fetched = !!opts.fetched;
    var sheetMonday = String(opts.sheetMonday || "");
    var sheetAhead = !!(sheetMonday && wk && sheetMonday > wk);
    var serverFinished = !!opts.finished;
    var clearLocal = fetched && !serverFinished && !sheetAhead;
    var realClosed = fetched ? (sheetAhead || serverFinished) : false;
    var hideFin = clearLocal ? "" : String(opts.hideFin || "");
    return {
      clearLocal: clearLocal,
      realClosed: realClosed,
      showFinish: !realClosed && hideFin !== "1",
      showPull: realClosed && !opts.pulled && String(opts.hidePull || "") !== "1"
    };
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

  function recordsWord(n) {
    n = Math.abs(Math.trunc(Number(n) || 0));
    var m10 = n % 10;
    var m100 = n % 100;
    if (m100 >= 11 && m100 <= 14) return "записей";
    if (m10 === 1) return "запись";
    if (m10 >= 2 && m10 <= 4) return "записи";
    return "записей";
  }

  function dayLoadMark(count) {
    var n = Number(count);
    if (!isFinite(n) || n < 4) return "";
    if (n >= 8) return "bad";
    if (n >= 6) return "warn";
    return "ok";
  }

  function fullDayPrompt(count) {
    var n = Number(count);
    if (!isFinite(n) || n < FULL_FROM) return "";
    n = Math.trunc(n);
    return "На этот день уже " + n + " " + recordsWord(n) + " Добавить ещё?";
  }

  function countFromMonth(res, iso) {
    var want = String(iso || "").slice(0, 10);
    var days = (res && res.days) || [];
    for (var i = 0; i < days.length; i++) {
      var d = days[i] || {};
      var id = String(d.dateIso || d.date || "").slice(0, 10);
      if (id === want) return Number(d.count) || 0;
    }
    return 0;
  }

  function peopleCount(byDate) {
    var n = 0;
    if (!byDate || typeof byDate !== "object") return 0;
    Object.keys(byDate).forEach(function (k) {
      var list = byDate[k];
      if (Array.isArray(list)) n += list.length;
    });
    return n;
  }

  /* Пустой ответ месяца доверяем только если обзор месяца тоже пустой.
     Иначе D1 ещё не догнал бейджи и день нельзя показывать пустым. */
  function monthPeopleReady(pack, overview) {
    if (!pack || !pack.byDate || typeof pack.byDate !== "object") return false;
    if (pack.source === "d1-error" || pack.source === "nodb") return false;
    if (peopleCount(pack.byDate) > 0) return true;
    if (!overview || !Array.isArray(overview.days)) return false;
    var expect = 0;
    overview.days.forEach(function (d) { expect += Number(d && d.count) || 0; });
    return expect === 0;
  }

  function peopleForDate(pack, iso) {
    if (!pack || !pack.byDate) return [];
    var list = pack.byDate[String(iso || "").slice(0, 10)];
    return Array.isArray(list) ? list : [];
  }

  function resFromPeople(iso, list) {
    var people = Array.isArray(list) ? list : [];
    var dayName = "";
    for (var i = 0; i < people.length; i++) {
      if (people[i] && people[i].day) { dayName = String(people[i].day); break; }
    }
    var onWeek = !!dayName;
    return {
      status: "success",
      day: onWeek ? dayName : "",
      dateIso: String(iso || "").slice(0, 10),
      dateNotInWeek: !onWeek,
      week: onWeek ? people.slice() : [],
      month: onWeek ? [] : people.slice(),
      source: "month-people"
    };
  }

  /* Клик по дню: сразу список из уже загруженного месяца или кэша,
     иначе скелетон и один дозапрос. Не ждём сеть, чтобы перерисовать сетку. */
  function dayOpenPlan(opts) {
    opts = opts || {};
    var now = Number(opts.now) || 0;
    var ttl = Number(opts.ttl) > 0 ? Number(opts.ttl) : 30000;
    var staleTtl = Number(opts.staleTtl) > 0 ? Number(opts.staleTtl) : 300000;
    var date = String(opts.date || "").slice(0, 10);
    if (Array.isArray(opts.people)) {
      return {
        paint: "clients",
        source: "month",
        listLoading: false,
        fetch: "none",
        skeletonRows: 0,
        res: resFromPeople(date, opts.people)
      };
    }
    var hit = opts.cached;
    if (hit && hit.res && hit.res.status === "success") {
      var age = now - (Number(hit.at) || 0);
      if (age >= 0 && age < staleTtl) {
        return {
          paint: "clients",
          source: age < ttl ? "cache" : "stale",
          listLoading: false,
          fetch: age < ttl ? "none" : "background",
          skeletonRows: 0,
          res: hit.res
        };
      }
    }
    var n = Number(opts.overviewCount);
    if (!isFinite(n) || n < 0) n = 0;
    return {
      paint: "skeleton",
      source: "overview",
      listLoading: true,
      fetch: "now",
      skeletonRows: n > 0 ? Math.min(n, 8) : 3,
      res: null
    };
  }

  function isoDay(raw) {
    var s = String(raw || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return "";
    return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  }

  function rowKey(c) {
    if (!c) return "";
    return viewClientKey(c.matchKey || "") || viewClientKey(c.name || c.client || "");
  }

  function findRow(list, client) {
    var key = rowKey(client);
    if (!key || !list) return -1;
    for (var i = 0; i < list.length; i++) {
      if (rowKey(list[i]) === key) return i;
    }
    return -1;
  }

  function segLabel(c) {
    return orderTypeToSegment(resolveOrderType(c)) || String((c && c.segment) || "");
  }

  function asClient(raw, date) {
    raw = raw || {};
    var name = String(raw.name || raw.client || "").trim();
    var ot = resolveOrderType(raw);
    return {
      name: name,
      matchKey: String(raw.matchKey || "").trim(),
      address: raw.address || "",
      phone: raw.phone || "",
      note: raw.note || "",
      segment: segLabel(raw),
      source: raw.source || ot || "",
      orderType: ot,
      basket: Array.isArray(raw.basket) ? raw.basket : [],
      orderPrice: raw.orderPrice != null ? raw.orderPrice : "",
      ppSlot: raw.ppSlot || "",
      deliverySlot: raw.deliverySlot || "",
      day: raw.day || "",
      dateIso: date || ""
    };
  }

  function dayAt(overview, iso) {
    var days = (overview && overview.days) || [];
    for (var i = 0; i < days.length; i++) {
      var id = String(days[i].dateIso || days[i].date || "").slice(0, 10);
      if (id === iso) return days[i];
    }
    return null;
  }

  function bumpDay(overview, iso, delta, seg) {
    if (!overview) return;
    if (!Array.isArray(overview.days)) overview.days = [];
    var day = dayAt(overview, iso);
    if (!day && delta > 0) {
      day = { dateIso: iso, count: 0, segments: {} };
      overview.days.push(day);
    }
    if (!day) return;
    day.count = Math.max(0, (Number(day.count) || 0) + delta);
    if (!day.segments) day.segments = {};
    if (seg) {
      var n = (Number(day.segments[seg]) || 0) + delta;
      if (n > 0) day.segments[seg] = n;
      else delete day.segments[seg];
    }
    if (!(Number(day.count) > 0)) {
      overview.days = overview.days.filter(function (d) {
        return String(d.dateIso || d.date || "").slice(0, 10) !== iso;
      });
    }
  }

  function peopleList(store, iso, create) {
    var month = iso.slice(0, 7);
    var pack = store.people && store.people[month];
    if (!pack || !pack.byDate || typeof pack.byDate !== "object") return null;
    if (!Array.isArray(pack.byDate[iso])) {
      if (!create) return [];
      pack.byDate[iso] = [];
    }
    return pack.byDate[iso];
  }

  function pendingHas(store, iso, client, kind) {
    var key = rowKey(client);
    if (!key) return false;
    var list = store.pending || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p) continue;
      var d = kind === "remove" ? (p.op === "move" ? p.oldDate : p.date) : p.date;
      if (d !== iso) continue;
      if (kind === "remove" && p.op !== "remove" && p.op !== "move") continue;
      if (kind !== "remove" && p.op === "remove") continue;
      if (rowKey(p.client) === key || rowKey(p.oldClient) === key) return true;
    }
    return false;
  }

  function removeOn(store, iso, client) {
    if (!iso) return false;
    var month = iso.slice(0, 7);
    var list = peopleList(store, iso);
    var removed = null;
    if (list) {
      var idx = findRow(list, client);
      if (idx >= 0) {
        removed = list.splice(idx, 1)[0];
        var pack = store.people[month];
        if (!list.length) delete pack.byDate[iso];
        if (Number(pack.total) > 0) pack.total -= 1;
      } else return false;
    } else if (pendingHas(store, iso, client, "remove")) return false;
    var overview = store.overview && store.overview[month];
    if (overview) bumpDay(overview, iso, -1, segLabel(removed || client));
    return true;
  }

  function addOn(store, iso, client, known) {
    if (!iso) return false;
    var name = String((client && (client.name || client.client)) || "").trim();
    if (!name) return false;
    var month = iso.slice(0, 7);
    var row = asClient(client, iso);
    var list = peopleList(store, iso, true);
    var added = false;
    if (list) {
      var idx = findRow(list, row);
      if (idx >= 0) list[idx] = Object.assign({}, list[idx], row);
      else {
        list.push(row);
        var pack = store.people[month];
        pack.total = (Number(pack.total) || 0) + 1;
        added = true;
      }
    } else if (known || pendingHas(store, iso, row, "add")) added = false;
    else added = true;
    if (added) {
      var overview = store.overview && store.overview[month];
      if (overview) bumpDay(overview, iso, 1, segLabel(row));
    }
    return added;
  }

  /* Сразу после записи: день, бейдж и список месяца. Чужой снимок не создаём. */
  function applyMonthChange(store, change) {
    store = store || {};
    change = change || {};
    var op = String(change.op || "save");
    var months = {};
    function mark(iso) { if (iso && iso.length >= 7) months[iso.slice(0, 7)] = true; }
    if (op === "touch") {
      Object.keys(store.overview || {}).forEach(function (m) { months[m] = true; });
      Object.keys(store.people || {}).forEach(function (m) { months[m] = true; });
      var today = isoDay(change.date);
      if (!today) {
        var now = new Date();
        today = now.getFullYear() + "-" + ("0" + (now.getMonth() + 1)).slice(-2) + "-" + ("0" + now.getDate()).slice(-2);
      }
      mark(today);
      return { months: Object.keys(months), pending: null };
    }
    var date = isoDay(change.date);
    var oldDate = isoDay(change.oldDate);
    var client = asClient(change.client, date);
    var oldClient = change.oldClient ? asClient({ name: change.oldClient, matchKey: change.oldMatchKey || client.matchKey, segment: client.segment, orderType: client.orderType }, oldDate || date) : null;
    if (!client.name && oldClient) client = oldClient;
    if (op === "remove") {
      var cut = date || oldDate;
      removeOn(store, cut, oldClient || client);
      mark(cut);
      return { months: Object.keys(months), pending: { op: "remove", date: cut, client: oldClient || client } };
    }
    var moved = !!(oldDate && date && oldDate !== date);
    if (moved) removeOn(store, oldDate, oldClient || client);
    else if (oldClient && rowKey(oldClient) && rowKey(oldClient) !== rowKey(client)) removeOn(store, date, oldClient);
    if (date) addOn(store, date, client, !!change.known);
    mark(date);
    mark(oldDate);
    return {
      months: Object.keys(months),
      pending: { op: moved ? "move" : "save", date: date, oldDate: moved ? oldDate : "", client: client, oldClient: oldClient }
    };
  }

  function clonePack(v) {
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  function pendingHits(pack, p) {
    if (!p || !p.date || !pack || !pack.byDate) return false;
    var list = pack.byDate[p.date] || [];
    var has = findRow(list, p.client || p.oldClient) >= 0;
    if (p.op === "remove") return !has;
    if (p.op === "move" && p.oldDate && p.oldDate.slice(0, 7) === p.date.slice(0, 7)) {
      var oldList = pack.byDate[p.oldDate] || [];
      if (findRow(oldList, p.oldClient || p.client) >= 0) return false;
    }
    return has;
  }

  function mergePeoplePack(server, pendings) {
    if (!server || !server.byDate || typeof server.byDate !== "object") return { pack: null, pending: pendings || [] };
    if (server.source === "d1-error" || server.source === "nodb") return { pack: null, pending: pendings || [] };
    var pack = clonePack(server);
    var left = [];
    (pendings || []).forEach(function (p) {
      if (!p || !p.date) return;
      var dest = p.date.slice(0, 7);
      var src = p.oldDate ? p.oldDate.slice(0, 7) : "";
      var packMonth = String(pack.month || dest).slice(0, 7);
      if (pack.month && packMonth !== dest && packMonth !== src) {
        left.push(p);
        return;
      }
      var store = { overview: {}, people: {} };
      store.people[packMonth] = pack;
      if (packMonth === src && src && src !== dest) {
        var oldList = (pack.byDate && pack.byDate[p.oldDate]) || [];
        if (findRow(oldList, p.oldClient || p.client) >= 0) removeOn(store, p.oldDate, p.oldClient || p.client);
        left.push(p);
        return;
      }
      if (pendingHits(pack, p)) return;
      if (p.op === "remove") removeOn(store, p.date, p.client);
      else {
        if (src && src === dest) removeOn(store, p.oldDate, p.oldClient || p.client);
        addOn(store, p.date, p.client, false);
      }
      left.push(p);
    });
    return { pack: pack, pending: left };
  }

  function mergeOverview(local, server, pendings, month) {
    if (!server || !Array.isArray(server.days)) return local || null;
    var next = clonePack(server);
    if (!local || !Array.isArray(local.days)) return next;
    var localMap = {};
    local.days.forEach(function (d) {
      var iso = String(d.dateIso || d.date || "").slice(0, 10);
      if (iso) localMap[iso] = d;
    });
    var mode = {};
    (pendings || []).forEach(function (p) {
      if (!p) return;
      if (p.date && p.date.slice(0, 7) === month) mode[p.date] = p.op === "remove" ? "remove" : "add";
      if (p.oldDate && p.oldDate.slice(0, 7) === month) mode[p.oldDate] = "remove";
    });
    Object.keys(mode).forEach(function (iso) {
      var loc = localMap[iso];
      var srv = null;
      (next.days || []).forEach(function (d) {
        if (String(d.dateIso || d.date || "").slice(0, 10) === iso) srv = d;
      });
      var lc = loc ? Number(loc.count) || 0 : 0;
      var sc = srv ? Number(srv.count) || 0 : 0;
      if (mode[iso] === "add" && lc > sc && loc) {
        if (srv) {
          srv.count = lc;
          srv.segments = clonePack(loc.segments || {});
        } else {
          if (!Array.isArray(next.days)) next.days = [];
          next.days.push(clonePack(loc));
        }
      }
      if (mode[iso] === "remove" && sc > lc) {
        if (lc <= 0) {
          next.days = (next.days || []).filter(function (d) {
            return String(d.dateIso || d.date || "").slice(0, 10) !== iso;
          });
        } else if (srv && loc) {
          srv.count = lc;
          srv.segments = clonePack(loc.segments || {});
        }
      }
    });
    return next;
  }

  function countsFromPeople(overview, pack) {
    if (!overview || !pack || !pack.byDate || typeof pack.byDate !== "object") return overview || null;
    if (pack.source === "d1-error" || pack.source === "nodb") return overview;
    var next = clonePack(overview);
    if (!Array.isArray(next.days)) next.days = [];
    Object.keys(pack.byDate).forEach(function (iso) {
      var list = pack.byDate[iso];
      if (!Array.isArray(list)) return;
      var segs = {};
      list.forEach(function (c) {
        var s = segLabel(c);
        if (s) segs[s] = (segs[s] || 0) + 1;
      });
      var day = null;
      for (var i = 0; i < next.days.length; i++) {
        if (String(next.days[i].dateIso || next.days[i].date || "").slice(0, 10) === iso) day = next.days[i];
      }
      if (!list.length) {
        next.days = next.days.filter(function (d) {
          return String(d.dateIso || d.date || "").slice(0, 10) !== iso;
        });
        return;
      }
      if (!day) {
        day = { dateIso: iso, count: list.length, segments: segs };
        next.days.push(day);
      } else {
        day.count = list.length;
        day.segments = segs;
        day.dateIso = iso;
      }
    });
    var total = 0;
    next.days.forEach(function (d) { total += Number(d && d.count) || 0; });
    next.total = total;
    next.status = next.status || "success";
    return next;
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
    dayLoadMark: dayLoadMark,
    fullDayPrompt: fullDayPrompt,
    countFromMonth: countFromMonth,
    monthPeopleReady: monthPeopleReady,
    peopleForDate: peopleForDate,
    resFromPeople: resFromPeople,
    dayOpenPlan: dayOpenPlan,
    applyMonthChange: applyMonthChange,
    mergePeoplePack: mergePeoplePack,
    mergeOverview: mergeOverview,
    countsFromPeople: countsFromPeople,
    isoDay: isoDay,
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
    ppSlotNumber: ppSlotNumber,
    suggestPpSlot: suggestPpSlot,
    countPpSlots: countPpSlots,
    attributePpRevenue: attributePpRevenue,
    stampPpPay: stampPpPay,
    revenueSum: revenueSum,
    courierStopMoney: courierStopMoney,
    courierCollectSum: courierCollectSum,
    courierMailMethod: courierMailMethod,
    courierShouldAskPaid: courierShouldAskPaid,
    mailTrackClientText: mailTrackClientText,
    deferredMode: deferredMode,
    tasksSub: tasksSub,
    finishPlain: finishPlain,
    finishPendingActive: finishPendingActive,
    finishBannerState: finishBannerState,
    finishGuard: finishGuard,
    placeTransferParams: placeTransferParams,
    collectAccessTabs: collectAccessTabs,
    NOTIFY_KEYS: NOTIFY_KEYS,
    NOTIFY_DEFAULTS: NOTIFY_DEFAULTS,
    notifyOverride: notifyOverride,
    basketLine: basketLine
  };
});
