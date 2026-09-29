/* Заказы → Неделя и Месяц. Запросы как loadClientsForDay / move / delete / pull в app.main.js. */
(function (root) {
  "use strict";

  var L = function () { return root.BoinyaWeekLogic; };
  var sh = function () { return root.BoinyaShell; };
  var api = function () { return root.BoinyaApi; };
  var ord = function () { return root.BoinyaOrders; };

  var view = {
    seg: "week",
    day: "Среда",
    date: "",
    resolvedDay: "",
    calendarOnly: false,
    weekClients: [],
    monthClients: [],
    counts: [],
    drafts: [],
    picked: {},
    selectOn: false,
    loading: false,
    error: "",
    banner: null,
    calCursor: "",
    role: "",
    notesOpen: {},
    fillIndex: -1
  };
  var finish = null;
  var segsFn = function () { return []; };

  function esc(s) { return sh().esc(s); }
  function logic() { return L(); }
  function tid() {
    try {
      var u = api().telegramUser();
      return String((u && u.id) || localStorage.getItem("superboyna_tg_id") || "");
    } catch (e) { return ""; }
  }

  function isoFromDmy(raw) {
    var s = String(raw || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return "";
    return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  }

  function shortDay(name) {
    var map = { Понедельник: "Пн", Вторник: "Вт", Среда: "Ср", Четверг: "Чт", Пятница: "Пт", Суббота: "Сб", Воскресенье: "Вс", "Будущая неделя": "Буд" };
    return map[name] || name;
  }

  function countOf(day) {
    var items = view.counts || [];
    for (var i = 0; i < items.length; i++) if (items[i] && items[i].day === day) return items[i];
    return null;
  }

  function dayStrip() {
    var html = '<div class="b-days">';
    logic().WEEK.forEach(function (name) {
      if (name === "Будущая неделя") return;
      var it = countOf(name);
      var num = it ? Number(it.count) : null;
      var cls = "b-day";
      if (view.day === name && view.seg === "week") cls += " b-day--on";
      if (num != null && num >= logic().FULL_FROM) cls += " b-day--full";
      var date = it && it.date ? String(it.date) : "";
      var numTxt = date ? String(parseInt(date, 10) || date.split(".")[0]) : "";
      var meta = num == null ? "" : String(num);
      html += '<button type="button" class="' + cls + '" data-act="wday" data-day="' + esc(name) + '">' +
        '<span class="b-day__w">' + esc(shortDay(name)) + "</span>" +
        '<span class="b-day__d">' + esc(numTxt || "·") + "</span>" +
        '<span class="b-day__meta"><span class="b-day__n">' + esc(meta) + "</span></span></button>";
    });
    html += "</div>";
    var fut = view.day === "Будущая неделя" ? " b-chip--on" : "";
    html += '<div class="b-row" style="margin-top:8px">' +
      '<button type="button" class="b-chip' + fut + '" data-act="wday" data-day="Будущая неделя">Будущая неделя</button></div>';
    if ((view.counts || []).some(function (it) { return Number(it && it.count) >= logic().FULL_FROM; })) {
      html += '<p class="b-note"><span style="color:var(--b-warn)">●</span> полный от ' + logic().FULL_FROM + "</p>";
    }
    return html;
  }

  function card(c, index, source) {
    var ot = logic().resolveOrderType(c);
    var seg = c.segment || logic().orderTypeToSegment(ot);
    var gaps = logic().clientGaps(c);
    var line = logic().basketLine(c);
    var sub = [c.address, c.phone].filter(Boolean).join(" · ");
    var badge = seg ? '<span class="b-chip" style="margin-left:8px">' + esc(seg) + "</span>" : "";
    var gap = gaps.length ? '<p class="b-note" style="color:var(--b-warn)">нет: ' + esc(gaps.join(", ")) + "</p>" : "";
    var noteKey = source + ":" + index;
    var noteHtml = "";
    if (c.note) {
      var opened = !!view.notesOpen[noteKey];
      noteHtml = '<button type="button" class="nx-link" data-act="wnote" data-k="' + esc(noteKey) + '">' + (opened ? "Свернуть" : "Раскрыть") + "</button>";
      if (opened) noteHtml += '<p class="b-note">' + esc(c.note) + "</p>";
    }
    var slot = "";
    if (ot === "pp") {
      var cur = Number(c.deliverySlot) || 0;
      slot = '<div class="b-row" style="margin-top:8px">' +
        '<button type="button" class="b-chip' + (cur === 1 ? " b-chip--on" : "") + '" data-act="wslot" data-i="' + index + '" data-src="' + source + '" data-slot="1">ПП 1</button>' +
        '<button type="button" class="b-chip' + (cur === 2 ? " b-chip--on" : "") + '" data-act="wslot" data-i="' + index + '" data-src="' + source + '" data-slot="2">ПП 2</button></div>';
    }
    var pick = "";
    if (view.selectOn && source === "week") {
      var on = view.picked[index] ? " b-chip--on" : "";
      pick = '<button type="button" class="b-chip' + on + '" data-act="wpick" data-i="' + index + '">' + (view.picked[index] ? "Выбран" : "Выбрать") + "</button>";
    }
    var stage = source === "month"
      ? '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="wstage" data-i="' + index + '">В черновик</button>'
      : "";
    return '<article class="b-card" style="margin-bottom:8px">' +
      '<p class="b-li__title" style="margin:0">' + esc(c.name || "Без имени") + badge + "</p>" +
      (sub ? '<p class="b-li__sub">' + esc(sub) + "</p>" : "") +
      (line ? '<p class="b-note">' + esc(line) + "</p>" : "") +
      gap + noteHtml + slot +
      '<div class="nx-actions" style="margin-top:8px">' + pick +
      '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="wedit" data-i="' + index + '" data-src="' + source + '">Править</button>' +
      '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="wmove" data-i="' + index + '" data-src="' + source + '">Перенести</button>' +
      '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="wdel" data-i="' + index + '" data-src="' + source + '">Удалить</button>' +
      stage + "</div></article>";
  }

  function banners() {
    var b = view.banner;
    if (!b || view.role !== "owner") return "";
    var html = "";
    if (b.showFinish) {
      html += '<div class="b-card" style="margin-bottom:12px"><p class="b-li__title" style="margin:0">Завершить неделю?</p>' +
        '<p class="b-note">Только владелец. Повторное нажатие, пока идёт закрытие, ничего не запускает.</p>' +
        '<div class="nx-actions" style="margin-top:8px">' +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="wfin-hide">Уже завершили — скрыть</button>' +
        '<button type="button" class="b-btn b-btn--main b-btn--sm" data-act="wfin"' + (finish && finish.busy() ? " disabled" : "") + ">Завершить неделю</button>" +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="wfin-later">Позже</button></div></div>';
    }
    if (b.showPull) {
      html += '<div class="b-card" style="margin-bottom:12px"><p class="b-li__title" style="margin:0">Подтянуть из месяца</p>' +
        '<div class="nx-actions" style="margin-top:8px">' +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="wpull">Подтянуть Пн–Вс</button>' +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="wpull-hide">Уже подтянули — скрыть</button></div></div>';
    }
    return html;
  }

  function monthCal() {
    var iso = view.calCursor || view.date || new Date().toISOString().slice(0, 10);
    var p = iso.split("-");
    var y = Number(p[0]);
    var m = Number(p[1]) - 1;
    var first = new Date(y, m, 1);
    var start = (first.getDay() + 6) % 7;
    var days = new Date(y, m + 1, 0).getDate();
    var names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    var html = '<div class="b-row" style="margin-bottom:8px"><button type="button" class="b-chip" data-act="wcal-shift" data-dir="-1">‹</button>' +
      '<span class="b-grow" style="text-align:center">' + esc(first.toLocaleString("ru-RU", { month: "long", year: "numeric" })) + "</span>" +
      '<button type="button" class="b-chip" data-act="wcal-shift" data-dir="1">›</button></div><div class="nx-cal">';
    names.forEach(function (n) { html += '<span class="b-note" style="text-align:center">' + n + "</span>"; });
    for (var i = 0; i < start; i++) html += "<span></span>";
    for (var d = 1; d <= days; d++) {
      var cur = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      var on = cur === view.date ? ' aria-pressed="true"' : "";
      html += '<button type="button" data-act="wcal" data-date="' + cur + '"' + on + ">" + d + "</button>";
    }
    html += "</div>";
    return html;
  }

  function weekOnScreen() {
    if (typeof root.__nxWeekVisible !== "function") return true;
    return !!root.__nxWeekVisible();
  }

  function paint() {
    if (!weekOnScreen()) return;
    var html = '<div id="nxSegs" class="b-seg" style="margin-bottom:16px"></div>';
    if (view.loading) html += sh().skeleton(4);
    else if (view.error) html += sh().errorBox({ title: "Не удалось загрузить заказы", text: view.error, act: "wretry" });
    else if (view.seg === "month") {
      html += monthCal();
      if (view.monthClients.length && !view.calendarOnly) {
        html += '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="wstage-all" style="margin-bottom:8px">Все в черновик</button>';
      }
      html += '<p class="b-lbl">День</p>';
      if (!view.monthClients.length && !view.weekClients.length) {
        html += sh().empty({ icon: "doc", title: "Заказов нет", text: view.date ? "На эту дату пусто." : "Выберите день.", action: "" });
      }
      view.monthClients.forEach(function (c, i) { html += card(c, i, "month"); });
      if (view.calendarOnly) view.weekClients.forEach(function (c, i) { html += card(c, i, "week"); });
    } else {
      html += banners();
      html += '<p class="b-lbl">День · заказов на день</p>' + dayStrip();
      html += '<div class="b-row" style="margin:8px 0"><button type="button" class="b-chip" data-act="wrefresh">Обновить</button>' +
        '<button type="button" class="b-chip" data-act="wselect">' + (view.selectOn ? "Снять выбор" : "Выбрать") + "</button></div>";
      html += '<p class="b-lbl">Неделя</p>';
      if (!view.weekClients.length) html += sh().empty({ icon: "doc", title: "Заказов нет", text: "На этот день список пуст.", action: '<button class="b-btn b-btn--sec" type="button" data-act="go-new">+ Новый заказ</button>' });
      view.weekClients.forEach(function (c, i) { html += card(c, i, "week"); });
      if (view.monthClients.length) {
        html += '<p class="b-lbl">Из месяца</p>';
        if (!view.calendarOnly) html += '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="wstage-all" style="margin-bottom:8px">Все в черновик</button>';
        view.monthClients.forEach(function (c, i) { html += card(c, i, "month"); });
      }
      if (view.drafts.length) {
        html += '<p class="b-lbl">Черновик переносов</p>';
        view.drafts.forEach(function (c, i) {
          html += '<div class="b-card" style="margin-bottom:8px"><p class="b-li__title" style="margin:0">' + esc(c.name) + "</p>" +
            '<p class="b-note">' + esc([c.segment || c.orderType, c.ppPartner, c.address, c.phone].filter(Boolean).join(" · ") || "дополните тип и адрес") + "</p>" +
            '<button type="button" class="nx-link" data-act="wfill" data-i="' + i + '">Дополнить</button> ' +
            '<button type="button" class="nx-link" data-act="wunstage" data-i="' + i + '">Вернуть</button></div>';
        });
      }
    }
    sh().main(html);
    dock();
    if (root.__nxAfterWeekPaint) root.__nxAfterWeekPaint();
  }

  function dock() {
    if (view.seg === "week" && view.drafts.length) {
      sh().dock('<div class="b-dock__act"><div class="b-sum"><span class="b-sum__k">Черновик переносов</span><span class="b-sum__v">' + view.drafts.length + "</span></div>" +
        '<div class="nx-actions"><button type="button" class="b-btn b-btn--sec" data-act="wdraft-clear">Отмена</button>' +
        '<button type="button" class="b-btn b-btn--main" data-act="wdraft-save">Применить переносы · ' + view.drafts.length + "</button></div></div>");
      return;
    }
    if (view.selectOn) {
      var n = Object.keys(view.picked).filter(function (k) { return view.picked[k]; }).length;
      sh().dock('<div class="b-dock__act"><div class="b-sum"><span class="b-sum__k">Выбрано</span><span class="b-sum__v">' + n + "</span></div>" +
        '<div class="nx-actions"><button type="button" class="b-btn b-btn--sec" data-act="wbatch-move">Перенести день</button>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="wbatch-del">Удалить</button></div></div>');
      return;
    }
    sh().dock("");
  }

  function clientAt(src, index) {
    var list = src === "month" ? view.monthClients : view.weekClients;
    return list[index] || null;
  }

  async function loadCounts() {
    var res = await api().apiGet({ action: "getWeekDayCounts" }, { timeoutMs: 20000, cacheTtlMs: 20000 });
    view.counts = (res && res.items) || [];
  }

  async function loadBanners() {
    if (view.role !== "owner") { view.banner = null; return; }
    var wk = logic().currentWeekKey();
    var hideFin = "";
    var hidePull = "";
    try {
      hideFin = localStorage.getItem("superboyna_finish_hide_" + wk) || "";
      hidePull = localStorage.getItem("superboyna_pull_hide_" + wk) || "";
    } catch (e) {}
    var st = null;
    try {
      st = await api().apiGet({ action: "getWeekBannerState", weekKey: wk }, { timeoutMs: 12000, cacheTtlMs: 30000 });
    } catch (e2) { st = null; }
    var fetched = !!(st && st.status === "success");
    var decided = logic().finishBannerState({
      weekKey: wk,
      fetched: fetched,
      finished: !!(st && st.finished),
      pulled: !!(st && st.pulled),
      sheetMonday: (st && (st.sheetMonday || st.mondayIso)) || "",
      hideFin: hideFin,
      hidePull: hidePull
    });
    if (decided.clearLocal) {
      try {
        localStorage.removeItem("superboyna_finish_real_" + wk);
        localStorage.removeItem("superboyna_finish_hide_" + wk);
        localStorage.removeItem("superboyna_finish_done_" + wk);
      } catch (e3) {}
    }
    view.banner = { showFinish: decided.showFinish, showPull: decided.showPull };
  }

  async function load(opts) {
    opts = opts || {};
    view.loading = true;
    view.error = "";
    paint();
    try {
      if (!view.counts.length || opts.force) await loadCounts();
      var compare = { action: "getViewCompare", force: "1", _: String(Date.now()) };
      if (view.seg === "month" && view.date && !view.day) compare.date = view.date;
      else if (view.day) compare.day = view.day;
      else if (view.date) compare.date = view.date;
      var res = await api().apiGet(compare, { timeoutMs: 18000, cacheTtlMs: 0 });
      var week = [];
      var month = [];
      if (res && res.status === "success") {
        week = Array.isArray(res.week) ? res.week : [];
        month = Array.isArray(res.month) ? res.month : [];
        view.resolvedDay = res.day || view.day || "";
        view.calendarOnly = !!(view.date && !res.day && res.dateNotInWeek);
        if (res.dateIso && !view.date) view.date = isoFromDmy(res.dateIso);
        if (!week.length && view.day && !view.calendarOnly) {
          var wr = await api().apiGet({ action: "getClients", day: view.resolvedDay || view.day, force: "1", _: String(Date.now()) }, { timeoutMs: 22000, cacheTtlMs: 0 });
          if (wr && wr.status === "success" && Array.isArray(wr.clients)) week = wr.clients;
        }
        if (view.date && (!month.length || view.calendarOnly)) {
          var cr = await api().apiGet({ action: "getClients", date: view.date, force: "1", _: String(Date.now()) }, { timeoutMs: 18000, cacheTtlMs: 0 });
          if (cr && cr.status === "success" && Array.isArray(cr.clients) && cr.clients.length) month = cr.clients;
        }
      } else {
        view.error = (res && res.message) || "Нет ответа";
      }
      view.weekClients = week;
      view.monthClients = month;
      await loadBanners();
    } catch (e) {
      view.error = (e && e.message) || "Нет связи";
    }
    view.loading = false;
    paint();
  }

  function openEdit(c, calendarOnly) {
    if (!c || !ord().loadFromClient) return;
    ord().loadFromClient(c, {
      day: view.calendarOnly || calendarOnly ? "" : (view.resolvedDay || view.day),
      date: view.date,
      calendarOnly: !!(view.calendarOnly || calendarOnly)
    });
    if (root.__nxOpenNew) root.__nxOpenNew();
  }

  async function moveOne(c) {
    if (!c) return;
    var picked = await sh().prompt({ title: "Перенести", text: "Дата ГГГГ-ММ-ДД", value: view.date || "", ok: "Дальше" });
    if (!picked) return;
    var target = await api().apiGet({ action: "resolveDayForDate", date: picked }, { timeoutMs: 15000, cacheTtlMs: 0 });
    if (!target || !target.newDate && !picked) { sh().toast("Не удалось определить дату"); return; }
    var newDate = (target && (target.newDate || target.date)) || picked;
    var newDay = (target && (target.dayName || target.day)) || "";
    var onWeek = target && (target.onWeek || target.dayName);
    var calendarOnly = !!(view.calendarOnly || !onWeek);
    var cut = "yes";
    if (!calendarOnly) {
      var ans = await sh().confirm({
        title: "Нарезка при переносе",
        text: "Нарезать сырьё на этого клиента в новом дне вместе со всеми?",
        ok: "Да, резать",
        alt: "Нет — только перенос",
        cancel: "Отмена"
      });
      if (!ans) return;
      cut = ans === "alt" ? "no" : "yes";
    }
    var ot = logic().resolveOrderType(c);
    var params = logic().moveParams({
      client: c.name,
      matchKey: c.matchKey || logic().viewClientKey(c.name),
      oldDay: view.calendarOnly ? "" : (view.resolvedDay || view.day),
      oldDate: view.date,
      newDay: newDay,
      newDate: newDate,
      calendarOnly: calendarOnly,
      cutRaw: cut,
      segment: c.segment || logic().orderTypeToSegment(ot),
      orderType: ot
    });
    var res = await api().apiGet(params, { timeoutMs: 35000, cacheTtlMs: 0 });
    confirmWrite(res, "перенесено");
    if (logic().writeAccepted(res)) load({ force: true });
  }

  async function delOne(c) {
    if (!c) return;
    var ok = await sh().confirm({
      title: "Удалить",
      text: view.calendarOnly
        ? "Убрать «" + c.name + "» из календаря на " + (view.date || "эту дату") + "?"
        : "Удалить «" + c.name + "» из этого дня?",
      ok: "Удалить",
      cancel: "Отмена"
    });
    if (!ok) return;
    var params = logic().deleteParams({
      client: c.name,
      matchKey: c.matchKey || logic().viewClientKey(c.name),
      day: view.resolvedDay || view.day,
      date: view.date,
      calendarOnly: view.calendarOnly
    });
    var res = await api().apiGet(params, { timeoutMs: 30000, cacheTtlMs: 0 });
    confirmWrite(res, "удалено");
    if (logic().writeAccepted(res)) load({ force: true });
  }

  async function setSlot(c, slot) {
    if (!c || !view.date) { sh().toast("Нет даты"); return; }
    var n = Math.max(2, Number(c.deliveriesN) || 2);
    var ok = await sh().confirm({ title: "Слот ПП", text: c.name + "\nПоставить ПП " + slot + "/" + n + "?", ok: "Поставить", cancel: "Отмена" });
    if (!ok) return;
    var params = logic().slotSaveParams(c, slot, view.date, view.resolvedDay || view.day, view.calendarOnly);
    var res = await api().apiPost(params);
    confirmWrite(res, "внесено");
    if (logic().writeAccepted(res)) {
      c.deliverySlot = slot;
      c.ppSlot = slot + "/" + n;
      paint();
    }
  }

  async function saveDrafts() {
    if (!view.drafts.length) { sh().toast("Черновик пуст"); return; }
    var noType = view.drafts.filter(function (c) { return !logic().resolveOrderType(c); });
    if (noType.length) { sh().toast("У " + noType.length + " нет типа заказа"); return; }
    view.drafts.forEach(function (c) {
      if (logic().resolveOrderType(c) === "bp" && !String(c.ppPartner || "").trim()) c.ppPartner = "Другое";
    });
    var ok = await sh().confirm({
      title: "Записать",
      text: "Записать в таблицу " + view.drafts.length + " чел. на «" + (view.day || view.date) + "»?",
      ok: "Сохранить",
      cancel: "Отмена"
    });
    if (!ok) return;
    var snap = view.drafts.slice();
    var payload = logic().pullPayload(snap, view.day, view.date);
    var res = await api().apiGet(payload, { timeoutMs: 60000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") {
      sh().toast((res && res.message) || "Не удалось");
      return;
    }
    view.drafts = [];
    var added = res.result && res.result.added;
    sh().toast("Добавлено: " + (added || 0));
    load({ force: true });
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function confirmWrite(res, done) {
    sh().toast(logic().peopleToast(res, done || "сохранено"));
    var writeId = res && String(res.writeId || "").trim();
    if (!res || !writeId || res.sheetsVerified) return;
    if (res.status === "error" && !res.pendingSheets && !res.pendingSheetsMirror) return;
    var d1 = !!(res.d1Verified || res.verified || res.peopleCanon === "d1-primary");
    var deadline = Date.now() + (d1 ? 12000 : 48000);
    (async function () {
      while (Date.now() < deadline) {
        await sleep(d1 ? 600 : 1100);
        var p = null;
        try {
          p = await api().apiGet({ action: "pollPeopleWrite", writeId: writeId, _: String(Date.now()) }, { timeoutMs: 15000, cacheTtlMs: 0 });
        } catch (e) { p = null; }
        if (p && p.sheetsVerified && (p.status === "success" || p.status === "accepted")) {
          sh().toast("Точно " + (done || "сохранено"));
          return;
        }
        if (p && p.status === "error" && !p.pendingSheets && !p.pendingSheetsMirror && !p.d1Verified) {
          sh().toast("Не закрепилось в Google-таблице" + (p.message ? (": " + p.message) : ""));
          return;
        }
      }
      sh().toast(d1 ? "D1 записано · лист может отставать" : "Ещё пишется в Google… проверь через минуту");
    })();
  }

  async function runFinish() {
    if (view.role !== "owner") { sh().toast("Закрыть неделю может только владелец"); return; }
    if (!finish) finish = logic().finishGuard();
    if (!finish.tryBegin()) { sh().toast("Закрытие уже запущено — подожди"); return; }
    var wk = logic().currentWeekKey();
    var pendingUntil = 0;
    try { pendingUntil = Number(localStorage.getItem("superboyna_finish_pending_" + wk) || 0); } catch (eP) {}
    if (logic().finishPendingActive(pendingUntil, Date.now())) {
      finish.end();
      await sh().alert({ text: "Перенос ещё идёт, проверьте позже. Второй раз неделю не сдвинет." });
      return;
    }
    try {
      if (localStorage.getItem("superboyna_finish_real_" + wk) === "1") {
        finish.end();
        await sh().alert({ text: "Эта неделя уже закрыта. Повторно нельзя." });
        return;
      }
    } catch (eLs) {}
    var ok = await sh().confirm({
      title: "Закрыть неделю",
      text: "Склад: остаток, даты +7, очистка заказов Пн–Пт, «Будущая неделя» станет понедельником. Отменить будет нельзя.",
      ok: "Продолжить",
      cancel: "Отмена"
    });
    if (!ok) { finish.end(); return; }
    var ok2 = await sh().confirm({ title: "Точно закрыть", text: "Точно закрыть неделю сейчас?", ok: "Закрыть", cancel: "Отмена" });
    if (!ok2) { finish.end(); return; }
    if (root.__BOINYA_C_CUTOVER__) {
      var ok3 = await sh().confirm({
        title: "Бойня C · LIVE",
        text: "Закрытие уйдёт в боевые Google Sheets. Это не песочница. Продолжить?",
        ok: "Продолжить",
        cancel: "Отмена"
      });
      if (!ok3) { finish.end(); return; }
    }
    var id = tid();
    if (!id) { sh().toast("Нет Telegram ID"); finish.end(); return; }
    sh().toast("Идёт перенос недели… не закрывайте");
    var payload = { action: "finishFullWeek", telegramId: id, confirm: "1", weekKey: wk };
    if (root.__BOINYA_C_CUTOVER__) payload.allowDanger = "1";
    var res = null;
    try {
      res = await api().apiGet(payload, { timeoutMs: 35000, cacheTtlMs: 0 });
    } catch (e1) {
      try { localStorage.setItem("superboyna_finish_pending_" + wk, String(Date.now() + 8 * 60 * 1000)); } catch (eMark) {}
      var peek = null;
      try {
        peek = await api().apiGet({ action: "getFinishWeekStatus", telegramId: id, _: String(Date.now()) }, { timeoutMs: 15000, cacheTtlMs: 0 });
      } catch (ePeek) {}
      if (peek && peek.status === "success" && peek.message === "week_closed") res = peek;
      else if (peek && /^(owner_only|auth_required|week_already_finished|week_finish_schedule_failed|week_finish_stale)$/.test(String(peek.message || ""))) {
        finish.end();
        await sh().alert({ text: "Не закрылось: " + logic().finishPlain(peek) + "\nМожно повторить." });
        return;
      } else res = { status: "accepted", message: "week_finish_started" };
    }
    var startMsg = res && res.message;
    if (res && res.status === "accepted" && (startMsg === "week_finish_started" || startMsg === "week_finish_busy" || startMsg === "week_finish_running")) {
      var deadline = Date.now() + 7.5 * 60 * 1000;
      var started = Date.now();
      var settled = false;
      while (Date.now() < deadline) {
        sh().toast("Идёт перенос недели… " + Math.round((Date.now() - started) / 1000) + " с");
        var last = null;
        try {
          last = await api().apiGet({ action: "getFinishWeekStatus", telegramId: id, _: String(Date.now()) }, { timeoutMs: 15000, cacheTtlMs: 0 });
        } catch (ePoll) { last = null; }
        if (last && last.status === "success" && last.message === "week_closed") { res = last; settled = true; break; }
        if (last && last.status === "error" && last.message && last.message !== "gas_proxy_failed") { res = last; settled = true; break; }
        await sleep(4000);
      }
      if (!settled) res = { status: "accepted", message: "week_finish_unknown" };
    }
    if (res && res.message === "week_finish_unknown") {
      try { localStorage.setItem("superboyna_finish_pending_" + wk, String(Date.now() + 8 * 60 * 1000)); } catch (eU) {}
      finish.end();
      await sh().alert({ text: "Перенос ещё идёт, проверьте позже. Кнопку не нажимайте. Если понедельник в заказе всё ещё прежний и прошло больше 8 минут — можно нажать ещё раз." });
      return;
    }
    if (!res || res.status !== "success" || res.message !== "week_closed") {
      var already = res && res.message === "week_already_finished";
      try {
        if (already) localStorage.setItem("superboyna_finish_real_" + wk, "1");
        else localStorage.removeItem("superboyna_finish_pending_" + wk);
      } catch (eClr) {}
      finish.end();
      await sh().alert({ text: already ? "Неделя уже закрыта — повторно нельзя." : ("Не закрылось: " + logic().finishPlain(res) + "\nМожно повторить.") });
      return;
    }
    try {
      localStorage.setItem("superboyna_finish_real_" + wk, "1");
      localStorage.setItem("superboyna_finish_done_" + wk, "1");
      localStorage.setItem("superboyna_week_pull_" + wk, "pulled");
      localStorage.setItem("superboyna_finish_hide_" + wk, "1");
      localStorage.removeItem("superboyna_finish_pending_" + wk);
    } catch (e2) {}
    var addedN = Number(res.materializeAdded != null ? res.materializeAdded : (res.materialize && res.materialize.totalAdded)) || 0;
    sh().toast("Неделя закрыта. Пн: " + (res.mondayDate || "ок") + (addedN ? (" · из месяца +" + addedN) : ""));
    try {
      await api().apiGet({ action: "setWeekBannerState", weekKey: wk, finished: "1", pulled: "1", telegramId: id, _: String(Date.now()) }, { timeoutMs: 15000, cacheTtlMs: 0 });
    } catch (e3) {}
    try {
      await api().apiGet({
        action: "forceWeekD1Resync",
        telegramId: id,
        confirm: "1",
        allowDanger: "1",
        restoreFromMonday: String(res.prevMondayIso || res.prevMondayDate || ""),
        restoreShifted: "1",
        _: String(Date.now())
      }, { timeoutMs: 180000, cacheTtlMs: 0 });
    } catch (eSync) {}
    finish.end();
    await sh().alert({
      text: "Неделя закрыта.\n\nНовый понедельник: " + (res.mondayDate || "—") +
        (addedN ? ("\nИз месяца дописано: +" + addedN) : "") +
        "\n\nЕсли экран ещё старый — закрой Mini App и открой снова."
    });
    if (weekOnScreen()) load({ force: true });
  }

  async function runPull() {
    var ok = await sh().confirm({ title: "Подтянуть из месяца", text: "Дописать на неделю тех, кто есть в месяце и ещё не в неделе?", ok: "Подтянуть", cancel: "Отмена" });
    if (!ok) return;
    sh().toast("Подтягиваю…");
    var wk = logic().currentWeekKey();
    var payload = { action: "materializeWeek", onlyMissing: "1", includeFuture: "1", dropExtras: "1", confirm: "1", weekKey: wk };
    if (root.__BOINYA_C_CUTOVER__) payload.allowDanger = "1";
    var res = await api().apiGet(payload, { timeoutMs: 180000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не вышло"); return; }
    var added = res.result ? (res.result.totalAdded || 0) : 0;
    sh().toast("Из месяца +" + added);
    if (weekOnScreen()) load({ force: true });
  }

  function onAct(act, node) {
    if (act === "wday") {
      view.seg = "week";
      view.day = node.getAttribute("data-day");
      var it = countOf(view.day);
      view.date = it && it.date ? isoFromDmy(it.date) : "";
      view.picked = {};
      load({ force: true });
      return true;
    }
    if (act === "wcal") {
      view.date = node.getAttribute("data-date");
      view.day = "";
      view.seg = "month";
      load({ force: true });
      return true;
    }
    if (act === "wcal-shift") {
      var base = view.calCursor || view.date || new Date().toISOString().slice(0, 10);
      var parts = base.split("-");
      var dt = new Date(Number(parts[0]), Number(parts[1]) - 1 + Number(node.getAttribute("data-dir") || 0), 1);
      view.calCursor = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-01";
      paint();
      return true;
    }
    if (act === "wrefresh" || act === "wretry") { load({ force: true }); return true; }
    if (act === "wselect") { view.selectOn = !view.selectOn; if (!view.selectOn) view.picked = {}; paint(); return true; }
    if (act === "wpick") {
      var i = Number(node.getAttribute("data-i"));
      view.picked[i] = !view.picked[i];
      paint();
      return true;
    }
    if (act === "wedit") { openEdit(clientAt(node.getAttribute("data-src"), Number(node.getAttribute("data-i")))); return true; }
    if (act === "wmove") { moveOne(clientAt(node.getAttribute("data-src"), Number(node.getAttribute("data-i")))); return true; }
    if (act === "wdel") { delOne(clientAt(node.getAttribute("data-src"), Number(node.getAttribute("data-i")))); return true; }
    if (act === "wslot") { setSlot(clientAt(node.getAttribute("data-src"), Number(node.getAttribute("data-i"))), Number(node.getAttribute("data-slot"))); return true; }
    if (act === "wnote") {
      var nk = node.getAttribute("data-k");
      view.notesOpen[nk] = !view.notesOpen[nk];
      paint();
      return true;
    }
    if (act === "wstage-all") {
      if (view.calendarOnly) { sh().toast("Дата вне недели — сначала выбери день недели"); return true; }
      var added = 0;
      view.monthClients.forEach(function (mc) {
        var key = mc.matchKey || logic().viewClientKey(mc.name);
        if (view.drafts.some(function (d) { return (d.matchKey || logic().viewClientKey(d.name)) === key; })) return;
        view.drafts.push({
          name: mc.name, matchKey: key, address: mc.address || "", phone: mc.phone || "", note: mc.note || "",
          segment: mc.segment || "", source: mc.source || "", orderType: mc.orderType || "",
          ppPartner: mc.ppPartner || "", ppSlot: mc.ppSlot || "", deliverySlot: mc.deliverySlot || "",
          basket: mc.basket || []
        });
        added++;
      });
      sh().toast(added ? ("В черновик: " + added) : "Уже в черновике");
      paint();
      return true;
    }
    if (act === "wfill") {
      view.fillIndex = Number(node.getAttribute("data-i"));
      var df = view.drafts[view.fillIndex];
      if (!df) return true;
      var types = [["ПП", "ПП"], ["БП", "БП"], ["Р", "Розница"], ["ПАРТНЁР", "Партнёр"]];
      var opts = types.map(function (t) {
        return '<option value="' + t[0] + '"' + (df.segment === t[0] ? " selected" : "") + ">" + t[1] + "</option>";
      }).join("");
      sh().openSheet({
        title: "Дополнить",
        html: '<label class="b-field"><span class="b-note">Тип</span><select class="b-field__input" id="nxFillType"><option value="">—</option>' + opts + "</select></label>" +
          '<label class="b-field" style="margin-top:8px"><span class="b-note">Партнёр</span><input class="b-field__input" id="nxFillPartner" value="' + esc(df.ppPartner || "") + '"></label>' +
          '<label class="b-field" style="margin-top:8px"><span class="b-note">Адрес</span><input class="b-field__input" id="nxFillAddr" value="' + esc(df.address || "") + '"></label>' +
          '<label class="b-field" style="margin-top:8px"><span class="b-note">Телефон</span><input class="b-field__input" id="nxFillPhone" value="' + esc(df.phone || "") + '"></label>' +
          '<label class="b-field" style="margin-top:8px"><span class="b-note">Примечание</span><input class="b-field__input" id="nxFillNote" value="' + esc(df.note || "") + '"></label>' +
          '<button type="button" class="b-btn b-btn--main" data-act="wfill-ok" style="margin-top:12px">Ок</button>'
      });
      return true;
    }
    if (act === "wfill-ok") {
      var row = view.drafts[view.fillIndex];
      if (row) {
        var typeEl = document.getElementById("nxFillType");
        var seg = typeEl ? typeEl.value : "";
        row.segment = seg;
        row.orderType = logic().segmentToOrderType(seg);
        var partnerEl = document.getElementById("nxFillPartner");
        var addrEl = document.getElementById("nxFillAddr");
        var phoneEl = document.getElementById("nxFillPhone");
        var noteEl = document.getElementById("nxFillNote");
        row.ppPartner = partnerEl ? partnerEl.value : row.ppPartner;
        row.address = addrEl ? addrEl.value : row.address;
        row.phone = phoneEl ? phoneEl.value : row.phone;
        row.note = noteEl ? noteEl.value : row.note;
      }
      sh().closeTop("ok");
      paint();
      return true;
    }
    if (act === "wstage") {
      var mc = view.monthClients[Number(node.getAttribute("data-i"))];
      if (!mc) return true;
      if (view.calendarOnly) { sh().toast("Дата вне недели — сначала выбери день недели"); return true; }
      var key = mc.matchKey || logic().viewClientKey(mc.name);
      if (view.drafts.some(function (d) { return (d.matchKey || logic().viewClientKey(d.name)) === key; })) {
        sh().toast("Уже в черновике");
        return true;
      }
      var staged = {
        name: mc.name, matchKey: key, address: mc.address || "", phone: mc.phone || "", note: mc.note || "",
        segment: mc.segment || "", source: mc.source || "", orderType: mc.orderType || "",
        ppPartner: mc.ppPartner || "", ppSlot: mc.ppSlot || "", deliverySlot: mc.deliverySlot || "",
        basket: mc.basket || []
      };
      view.drafts.push(staged);
      sh().toast("В черновик: " + mc.name);
      paint();
      return true;
    }
    if (act === "wunstage") { view.drafts.splice(Number(node.getAttribute("data-i")), 1); paint(); return true; }
    if (act === "wdraft-clear") { view.drafts = []; paint(); return true; }
    if (act === "wdraft-save") { saveDrafts(); return true; }
    if (act === "wfin") { runFinish(); return true; }
    if (act === "wfin-hide") {
      try { localStorage.setItem("superboyna_finish_hide_" + logic().currentWeekKey(), "1"); } catch (e) {}
      if (view.banner) view.banner.showFinish = false;
      paint();
      return true;
    }
    if (act === "wfin-later") { if (view.banner) view.banner.showFinish = false; paint(); return true; }
    if (act === "wpull") { runPull(); return true; }
    if (act === "wpull-hide") {
      try { localStorage.setItem("superboyna_pull_hide_" + logic().currentWeekKey(), "1"); } catch (e2) {}
      if (view.banner) view.banner.showPull = false;
      paint();
      return true;
    }
    if (act === "wbatch-del" || act === "wbatch-move") {
      var idxs = Object.keys(view.picked).filter(function (k) { return view.picked[k]; }).map(Number);
      if (!idxs.length) { sh().toast("Никого не выбрано"); return true; }
      if (act === "wbatch-del") {
        (async function () {
          for (var n = 0; n < idxs.length; n++) await delOne(view.weekClients[idxs[n]]);
          view.picked = {};
          view.selectOn = false;
        })();
      } else {
        (async function () {
          for (var n = 0; n < idxs.length; n++) await moveOne(view.weekClients[idxs[n]]);
          view.picked = {};
        })();
      }
      return true;
    }
    return false;
  }

  function show(seg, role) {
    view.seg = seg === "month" ? "month" : "week";
    view.role = role || view.role;
    if (!view.calCursor) view.calCursor = new Date().toISOString().slice(0, 8) + "01";
    if (view.seg === "week" && !view.day) view.day = "Среда";
    load({ force: !view.weekClients.length });
    paint();
  }

  root.BoinyaWeek = {
    show: show,
    paint: paint,
    onAct: onAct,
    confirmWrite: confirmWrite,
    setRole: function (role) { view.role = role || ""; },
    setDay: function (day) {
      if (!day) return;
      view.day = day;
      view.seg = "week";
    },
    segment: function () { return view.seg; },
    setSegs: function (fn) { segsFn = fn; },
    contextLine: function () {
      if (view.seg === "month") return view.date || "Месяц";
      var it = countOf(view.day);
      return (shortDay(view.day) || "") + (it && it.date ? " " + it.date : "") + (it ? " · " + it.count : "");
    }
  };
})(window);
