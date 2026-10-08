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
    listLoading: false,
    overviewLoading: false,
    error: "",
    banner: null,
    calCursor: "",
    overview: null,
    role: "",
    notesOpen: {},
    fillIndex: -1,
    skeletonRows: 3
  };
  var finish = null;
  var compareCache = {};
  var overviewCache = {};
  var parkedRefresh = {};
  var refreshAt = {};
  var monthPeopleCache = {};
  var peopleFlight = {};
  var peopleApplyGen = {};
  var compareGen = 0;
  var COMPARE_TTL = 30000;
  var STALE_TTL = 300000;
  var dirtyMonths = {};
  var pending = [];
  var refreshGen = {};
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
      var loadMark = logic().dayLoadMark ? logic().dayLoadMark(num) : "";
      if (loadMark) cls += " b-day--load-" + loadMark;
      var date = it && it.date ? String(it.date) : "";
      var numTxt = date ? String(parseInt(date, 10) || date.split(".")[0]) : "";
      var meta = num == null ? "" : String(num);
      html += '<button type="button" class="' + cls + '" data-act="wday" data-day="' + esc(name) + '">' +
        '<span class="b-day__w">' + esc(shortDay(name)) + "</span>" +
        '<span class="b-day__d">' + esc(numTxt || "") + "</span>" +
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

  function splitWho(c) {
    var raw = String((c && c.name) || "").trim();
    var parts = raw.split(/\s*[·•]\s*/);
    var dog = parts[0] || raw || "Без имени";
    var nick = (parts[1] || (c && (c.nick || c.ownerName)) || "").trim();
    return { dog: dog, nick: nick, letter: dog.slice(0, 1).toUpperCase() };
  }

  function pillOf(c) {
    var s = typeof c === "string" ? c : String((c && (c.segment || logic().orderTypeToSegment(logic().resolveOrderType(c)))) || "");
    var cls = "pill pill--p";
    if (s === "ПП" || s === "АФК") cls = "pill pill--ok";
    else if (s === "БП") cls = "pill pill--info";
    else if (s === "Р") cls = "pill pill--warn";
    var label = s === "ПАРТНЁР" ? "Партнёр" : s;
    if ((s === "ПП" || s === "АФК") && c && typeof c === "object") {
      var n = logic().ppSlotNumber(c.deliverySlot || c.ppSlot);
      if (n === 1 || n === 2) label = "ПП" + n;
    }
    return label ? '<span class="' + cls + '">' + esc(label) + "</span>" : "";
  }

  function rowBtn(c, index, source) {
    var who = splitWho(c);
    var price = "";
    if (c && c._pay != null && c._pay !== "") {
      if (Number(c._pay) > 0) price = String(c._pay).replace(".", ",") + " BYN";
    } else if (c.orderPrice != null && c.orderPrice !== "") {
      price = String(c.orderPrice).replace(".", ",") + " BYN";
    }
    var addr = [c.address, price].filter(Boolean).join(", ");
    return '<button type="button" class="row" data-act="wrow" data-i="' + index + '" data-src="' + source + '">' +
      '<span class="avatar" aria-hidden="true">' + esc(who.letter) + "</span>" +
      '<span class="who"><span class="name">' + esc(who.dog) + "</span>" +
      (who.nick ? '<span class="sub">' + esc(who.nick) + "</span>" : "") +
      (source === "sum" && c && c._sumDate ? '<span class="sub">' + esc(dayCaption(c._sumDate)) + "</span>" : "") +
      (addr ? '<span class="sub">' + esc(addr) + "</span>" : "") +
      "</span>" + pillOf(c) + "</button>";
  }

  function openRow(c, index, source) {
    if (!c) return;
    var who = splitWho(c);
    var mix = root.BoinyaCrumbMix;
    var lines = mix && mix.linesHtml ? mix.linesHtml(c.basket || c.items || []) : "";
    var otRow = logic().resolveOrderType(c);
    var slotNow = logic().ppSlotNumber(c.deliverySlot || c.ppSlot);
    var slotNote = "";
    var slotBtns = "";
    if (otRow === "pp" || String(c.segment || "") === "ПП") {
      slotNote = '<p class="b-note">' + (slotNow === 1 || slotNow === 2 ? ("Сейчас ПП" + slotNow) : "Слот ПП не отмечен") + "</p>";
      slotBtns =
        '<div class="nx-pp-toggle" role="group" aria-label="Слот ПП">' +
        '<button type="button" class="nx-pp-toggle__btn' + (slotNow === 1 ? " nx-pp-toggle__btn--on" : "") + '" data-act="wslot" data-slot="1" data-i="' + index + '" data-src="' + source + '">ПП1</button>' +
        '<button type="button" class="nx-pp-toggle__btn' + (slotNow === 2 ? " nx-pp-toggle__btn--on" : "") + '" data-act="wslot" data-slot="2" data-i="' + index + '" data-src="' + source + '">ПП2</button>' +
        "</div>";
    }
    var html = (who.nick ? '<p class="sheet-lead">' + esc(who.nick) + "</p>" : "") +
      slotNote +
      (lines ? '<div class="mix-list">' + lines + "</div>" : '<p class="b-note">Состав не указан</p>') +
      slotBtns +
      '<button type="button" class="b-btn b-btn--main" data-act="wedit" data-i="' + index + '" data-src="' + source + '" style="margin-top:12px">Править</button>' +
      '<button type="button" class="b-btn b-btn--sec" data-act="wmove" data-i="' + index + '" data-src="' + source + '" style="margin-top:8px">Перенести</button>';
    if (source === "month") {
      html += '<button type="button" class="sheet-act" data-act="wstage" data-i="' + index + '">В черновик</button>';
    }
    html += '<button type="button" class="sheet-act danger" data-act="wdel" data-i="' + index + '" data-src="' + source + '">Удалить</button>';
    sh().openSheet({ title: who.dog, html: html, id: "order-row" });
  }

  function banners() {
    var b = view.banner;
    if (!b || view.role !== "owner" || !b.showFinish) return "";
    return '<div class="banner"><span>Неделя ещё открыта</span>' +
      '<button type="button" class="linkish" data-act="wfin"' + (finish && finish.busy() ? " disabled" : "") + ">Завершить</button></div>";
  }

  function overviewMap() {
    var map = {};
    var days = (view.overview && view.overview.days) || [];
    days.forEach(function (d) {
      var iso = String(d.dateIso || d.date || "").slice(0, 10);
      if (iso) map[iso] = d;
    });
    return map;
  }

  function monthCal() {
    var iso = view.calCursor || view.date || new Date().toISOString().slice(0, 10);
    var p = iso.split("-");
    var y = Number(p[0]);
    var m = Number(p[1]) - 1;
    var first = new Date(y, m, 1);
    var start = (first.getDay() + 6) % 7;
    var days = new Date(y, m + 1, 0).getDate();
    var names = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
    var by = overviewMap();
    var monthNames = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
    var html = '<div class="cal-head b-row"><button type="button" class="b-ib" data-act="wcal-shift" data-dir="-1" aria-label="Предыдущий месяц">‹</button>' +
      '<h2 class="b-grow" style="text-align:center;margin:0;font-size:18px">' + esc(monthNames[m] + " " + y) + "</h2>" +
      '<button type="button" class="b-ib" data-act="wcal-shift" data-dir="1" aria-label="Следующий месяц">›</button></div>';
    html += '<div class="wd" aria-hidden="true">' + names.map(function (n) { return "<span>" + n + "</span>"; }).join("") + "</div>";
    html += '<div class="nx-cal grid" id="nxCalGrid">';
    for (var i = 0; i < start; i++) html += '<span class="cell cell--pad"></span>';
    for (var d = 1; d <= days; d++) {
      var cur = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      var hit = by[cur];
      var n = hit && isFinite(Number(hit.count)) ? Number(hit.count) : 0;
      var dots = "";
      var segs = (hit && hit.segments) || {};
      if (n && segs["ПП"]) dots += '<i class="dot dot-pp"></i>';
      if (n && segs["БП"]) dots += '<i class="dot dot-bp"></i>';
      if (n && segs["Р"]) dots += '<i class="dot dot-r"></i>';
      if (n && segs["ПАРТНЁР"]) dots += '<i class="dot dot-p"></i>';
      var loadMark = logic().dayLoadMark ? logic().dayLoadMark(n) : "";
      var cls = "cell" + (n ? " cell--busy" : "") + (loadMark ? " cell--load-" + loadMark : "") + (cur === view.date ? " is-on" : "");
      var label = d + " " + monthNames[m] + (n ? ", " + n + " чел." : ", никого") + (n >= logic().FULL_FROM ? ", полный день" : "");
      html += '<button type="button" class="' + cls + '" data-act="wcal" data-date="' + cur + '" aria-label="' + esc(label) + '"' +
        (cur === view.date ? ' aria-pressed="true"' : "") + ">" +
        '<span class="cell-date">' + d + "</span>" +
        (n ? '<span class="cell-count">' + n + "</span>" : "") +
        (dots ? '<span class="dots">' + dots + "</span>" : "") + "</button>";
    }
    html += "</div>";
    html += '<div class="legend"><span><i class="dot dot-pp"></i>ПП</span><span><i class="dot dot-bp"></i>БП</span><span><i class="dot dot-r"></i>розница</span><span><i class="dot dot-p"></i>партнёр</span>' +
      '<span class="nx-load-key nx-load-key--ok">от 4</span><span class="nx-load-key nx-load-key--warn">от 6</span><span class="nx-load-key nx-load-key--bad">от 8</span></div>';
    html += summaryHtml();
    return html;
  }

  function displayedMonth() {
    var iso = view.calCursor || view.date || new Date().toISOString().slice(0, 10);
    return String(iso).slice(0, 7);
  }

  function selectedInView() {
    var d = String(view.date || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && d.slice(0, 7) === displayedMonth();
  }

  function dayCaption(iso) {
    var names = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    var p = String(iso || "").split("-");
    if (p.length < 3) return "";
    return Number(p[2]) + " " + (names[Number(p[1]) - 1] || "");
  }

  function monthCaption(ym) {
    var names = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    var p = String(ym || "").split("-");
    if (p.length < 2) return "Месяц";
    return (names[Number(p[1]) - 1] || "Месяц") + " " + p[0];
  }

  function moneyText(n) {
    if (n == null) return "—";
    var s = String(Math.round(Number(n) * 100) / 100);
    return s.replace(".", ",");
  }

  function shownClients() {
    var list = (view.monthClients || []).slice();
    if (view.calendarOnly || !list.length) {
      (view.weekClients || []).forEach(function (c) { list.push(c); });
    }
    return list;
  }

  function flattenMonth(pack) {
    var out = [];
    if (!pack || !pack.byDate) return out;
    Object.keys(pack.byDate).sort().forEach(function (iso) {
      var rows = pack.byDate[iso];
      if (!Array.isArray(rows)) return;
      rows.forEach(function (c) {
        if (!c) return;
        var copy = {};
        Object.keys(c).forEach(function (k) { copy[k] = c[k]; });
        copy._sumDate = iso;
        out.push(copy);
      });
    });
    return out;
  }

  function overviewPeople(iso) {
    if (iso) return logic().countFromMonth(view.overview, iso);
    var n = 0;
    ((view.overview && view.overview.days) || []).forEach(function (d) { n += Number(d && d.count) || 0; });
    return n;
  }

  function summaryPeople() {
    var month = displayedMonth();
    var pack = monthPeopleCache[month];
    if (selectedInView()) {
      var shown = shownClients();
      if (shown.length) return shown;
      if (logic().monthPeopleReady(pack, view.overview)) return logic().peopleForDate(pack, view.date);
      return [];
    }
    if (logic().monthPeopleReady(pack, view.overview)) return flattenMonth(pack);
    return [];
  }

  function summaryMoney(dayOn) {
    var month = displayedMonth();
    var pack = monthPeopleCache[month];
    var all = logic().monthPeopleReady(pack, view.overview) ? flattenMonth(pack) : summaryPeople();
    return logic().revenueSum(all, { onlyDate: dayOn ? view.date : "" });
  }

  function summaryHtml() {
    var dayOn = selectedInView();
    var people = summaryPeople();
    var count = people.length;
    if (!count) count = overviewPeople(dayOn ? view.date : "");
    var title = dayOn ? dayCaption(view.date) : monthCaption(displayedMonth());
    return '<article class="b-card nx-calsum" id="nxCalSum">' +
      '<p class="b-lbl" style="margin-top:0">' + esc(title || "Месяц") + "</p>" +
      '<div class="nx-counters">' +
        '<div class="nx-count"><b>' + esc(String(count || 0)) + "</b><span>Люди</span></div>" +
        '<div class="nx-count"><b>' + esc(moneyText(summaryMoney(dayOn))) + "</b><span>Сумма, BYN</span></div>" +
      "</div>" +
      (function () {
        var slots = logic().countPpSlots(people);
        if (!people.length) return "";
        return '<div class="nx-counters" style="margin-top:8px">' +
          '<div class="nx-count"><b>' + esc(String(slots.pp1)) + "</b><span>ПП1</span></div>" +
          '<div class="nx-count"><b>' + esc(String(slots.pp2)) + "</b><span>ПП2</span></div>" +
          "</div>";
      })() +
      "</article>";
  }

  function weekOnScreen() {
    if (typeof root.__nxWeekVisible !== "function") return true;
    return !!root.__nxWeekVisible();
  }

  function monthRows() {
    var pack = monthPeopleCache[displayedMonth()];
    if (!logic().monthPeopleReady(pack, view.overview)) {
      return '<p class="b-note">Считаю месяц…</p>';
    }
    var list = flattenMonth(pack);
    logic().stampPpPay(list);
    view.summaryClients = list;
    if (!list.length) {
      return sh().empty({ icon: "doc", title: "Заказов нет", text: "В этом месяце пусто.", action: "" });
    }
    return '<p class="b-lbl">Клиенты</p>' + list.map(function (c, i) { return rowBtn(c, i, "sum"); }).join("");
  }

  function dayListHtml() {
    if (!selectedInView()) return monthRows();
    if (view.listLoading && !view.monthClients.length && !view.weekClients.length) {
      return sh().skeleton(view.skeletonRows || 3);
    }
    var rows = dayRows();
    if (!rows) return rows;
    return '<p class="b-lbl">Клиенты</p>' + rows;
  }

  function dayRows() {
    var html = "";
    var listed = false;
    var monthList = view.monthClients || [];
    var weekList = view.weekClients || [];
    logic().stampPpPay(monthList);
    if (view.calendarOnly || !monthList.length) logic().stampPpPay(weekList);
    monthList.forEach(function (c, i) { listed = true; html += rowBtn(c, i, "month"); });
    if (view.calendarOnly || !monthList.length) {
      weekList.forEach(function (c, i) { listed = true; html += rowBtn(c, i, "week"); });
    }
    if (!listed && !view.loading && !view.listLoading) {
      html += sh().empty({ icon: "doc", title: "Заказов нет", text: view.date ? "На эту дату пусто." : "Выберите день.", action: "" });
    }
    return html;
  }

  function paint() {
    if (!weekOnScreen()) return;
    var html = '<div id="nxSegs" class="b-seg" style="margin-bottom:16px"></div>';
    html += banners();
    if (view.loading && !view.overview && !view.monthClients.length && !view.weekClients.length) {
      html += sh().skeleton(4);
    } else if (view.error && !view.monthClients.length && !view.weekClients.length && !view.overview) {
      html += sh().errorBox({ title: "Не удалось загрузить заказы", text: view.error, act: "wretry" });
    } else {
      if (view.overviewLoading && !(view.overview && (view.overview.days || []).length)) {
        html += '<p class="b-note">Считаю месяц…</p>';
      }
      html += monthCal();
      html += '<div id="nxDayList">' + dayListHtml() + "</div>";
      if (view.drafts.length) {
        html += '<p class="b-lbl">Черновик переносов</p>';
        view.drafts.forEach(function (c, i) {
          var who = splitWho(c);
          html += '<div class="b-card" style="margin-bottom:8px"><p class="b-li__title" style="margin:0">' + esc(who.dog) + (who.nick ? " " + esc(who.nick) : "") + "</p>" +
            '<p class="b-note">' + esc([c.address, c.phone].filter(Boolean).join(", ") || "дополните адрес и телефон") + "</p>" +
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
        '<button type="button" class="b-btn b-btn--main" data-act="wdraft-save">Применить переносы, ' + view.drafts.length + "</button></div></div>");
      return;
    }
    if (view.selectOn) {
      var n = Object.keys(view.picked).filter(function (k) { return view.picked[k]; }).length;
      sh().dock('<div class="b-dock__act"><div class="b-sum"><span class="b-sum__k">Выбрано</span><span class="b-sum__v">' + n + "</span></div>" +
        '<div class="nx-actions"><button type="button" class="b-btn b-btn--sec" data-act="wbatch-move">Перенести день</button>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="wbatch-del">Удалить</button></div></div>');
      return;
    }
    sh().dock('<div class="b-dock__act"><button type="button" class="b-btn b-btn--main" data-act="go-new">Новый заказ</button></div>');
  }

  function paintFast() {
    if (patchDay()) return;
    paint();
  }

  function patchDay() {
    if (typeof document === "undefined") return false;
    var list = document.getElementById("nxDayList");
    var grid = document.getElementById("nxCalGrid");
    if (!list || !grid) return false;
    var nodes = grid.querySelectorAll("[data-act=wcal]");
    for (var i = 0; i < nodes.length; i++) {
      var on = nodes[i].getAttribute("data-date") === view.date;
      nodes[i].classList.toggle("is-on", on);
      if (on) nodes[i].setAttribute("aria-pressed", "true");
      else nodes[i].removeAttribute("aria-pressed");
    }
    list.innerHTML = dayListHtml();
    var sum = document.getElementById("nxCalSum");
    if (sum) {
      var fresh = monthCal();
      var holder = document.createElement("div");
      holder.innerHTML = fresh;
      var nextSum = holder.querySelector("#nxCalSum");
      if (nextSum) sum.innerHTML = nextSum.innerHTML;
    }
    dock();
    if (root.__nxAfterWeekPaint) root.__nxAfterWeekPaint();
    return true;
  }

  function clientAt(src, index) {
    var list = src === "month" ? view.monthClients : (src === "sum" ? (view.summaryClients || []) : view.weekClients);
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

  async function loadOverview(month) {
    var res = await api().apiGet({ action: "getMonthOverview", month: month }, { timeoutMs: 18000, cacheTtlMs: 20000 });
    if (res && (res.days || res.status === "success")) view.overview = res;
  }

  function compareKey() {
    return (view.date || "") + "|" + (view.day || "");
  }

  function applyCompare(res) {
    if (res && res.status === "success") {
      view.weekClients = Array.isArray(res.week) ? res.week : [];
      view.monthClients = Array.isArray(res.month) ? res.month : [];
      view.resolvedDay = res.day || view.day || "";
      view.calendarOnly = !!(view.date && !res.day && res.dateNotInWeek);
      if (res.dateIso && !view.date) view.date = isoFromDmy(res.dateIso);
      view.error = "";
    } else if (!view.monthClients.length && !view.weekClients.length) {
      view.error = (res && res.message) || "Нет ответа";
    }
  }

  function fetchCompare(opts) {
    opts = opts || {};
    var key = compareKey();
    var asked = view.date;
    var gen = ++compareGen;
    var hit = compareCache[key];
    if (!opts.background && !opts.force && hit && Date.now() - hit.at < COMPARE_TTL) {
      applyCompare(hit.res);
      view.listLoading = false;
      view.loading = false;
      paintFast();
      return Promise.resolve(hit.res);
    }
    if (!opts.background && !view.monthClients.length && !view.weekClients.length) {
      view.listLoading = true;
      paintFast();
    }
    var compare = { action: "getViewCompare" };
    if (opts.force) compare.force = "1";
    if (view.date) compare.date = view.date;
    else if (view.day) compare.day = view.day;
    return api().apiGet(compare, { timeoutMs: 18000, cacheTtlMs: opts.force ? 0 : 20000 }).then(function (res) {
      if (gen !== compareGen) return res;
      if (String(view.date || "") !== String(asked || "")) return res;
      compareCache[key] = { at: Date.now(), res: res };
      applyCompare(res);
      view.listLoading = false;
      view.loading = false;
      paintFast();
      return res;
    }).catch(function (e) {
      if (gen !== compareGen) return;
      view.listLoading = false;
      view.loading = false;
      if (!view.monthClients.length && !view.weekClients.length) view.error = (e && e.message) || "Нет связи";
      paintFast();
    });
  }

  function fetchMonthPeople(month, opts) {
    opts = opts || {};
    if (dirtyMonths[month]) opts.force = true;
    if (!opts.force && monthPeopleCache[month]) return Promise.resolve(monthPeopleCache[month]);
    if (!opts.force && peopleFlight[month]) return peopleFlight[month];
    var ticket = (peopleApplyGen[month] || 0) + 1;
    peopleApplyGen[month] = ticket;
    var gen = opts.gen || 0;
    var flight = api().apiGet(
      { action: "getCalendarMonthPeople", month: month },
      { timeoutMs: 12000, cacheTtlMs: opts.force ? 0 : 60000 }
    ).then(function (res) {
      if (peopleApplyGen[month] !== ticket) return monthPeopleCache[month] || null;
      if (gen && refreshGen[month] !== gen) return monthPeopleCache[month] || null;
      if (res && res.byDate && typeof res.byDate === "object" && res.source && res.source !== "d1-error" && res.source !== "nodb") {
        if (!res.month) res.month = month;
        absorbPeople(month, res);
        return monthPeopleCache[month];
      }
      return null;
    }).catch(function () {
      return null;
    }).then(function (res) {
      if (peopleFlight[month] === flight) delete peopleFlight[month];
      return res;
    });
    peopleFlight[month] = flight;
    return flight;
  }

  function openCalendarDay(iso) {
    view.date = String(iso || "").slice(0, 10);
    view.day = "";
    view.seg = "month";
    view.error = "";
    var month = view.date.slice(0, 7);
    var pack = monthPeopleCache[month];
    var people = null;
    if (logic().monthPeopleReady(pack, view.overview)) {
      var listed = logic().peopleForDate(pack, view.date);
      var expectN = logic().countFromMonth(view.overview, view.date);
      if (listed.length || !expectN) people = listed;
    }
    var plan = logic().dayOpenPlan({
      date: view.date,
      people: people,
      cached: compareCache[compareKey()],
      now: Date.now(),
      ttl: COMPARE_TTL,
      staleTtl: STALE_TTL,
      overviewCount: logic().countFromMonth(view.overview, view.date)
    });
    if (plan.res) applyCompare(plan.res);
    else {
      view.monthClients = [];
      view.weekClients = [];
    }
    view.listLoading = !!plan.listLoading;
    view.skeletonRows = plan.skeletonRows || 3;
    view.loading = false;
    paintFast();
    if (plan.fetch === "none") {
      compareGen++;
      return;
    }
    if (plan.fetch === "now" && peopleFlight[month] && !monthPeopleCache[month]) {
      var waitDate = view.date;
      peopleFlight[month].then(function () {
        if (view.date !== waitDate) return;
        openCalendarDay(waitDate);
      });
      return;
    }
    fetchCompare({ background: plan.fetch === "background" });
  }

  function fetchOverview(month, opts) {
    opts = opts || {};
    if (dirtyMonths[month]) opts.force = true;
    if (!opts.force && overviewCache[month]) {
      var cur = (view.calCursor || view.date || "").slice(0, 7);
      if (cur === month) view.overview = overviewCache[month];
      view.overviewLoading = false;
      view.loading = false;
      paint();
      return Promise.resolve(overviewCache[month]);
    }
    var quiet = !!opts.silent || (!!overviewCache[month] && !opts.loud);
    if (!quiet) view.overviewLoading = true;
    var q = { action: "getMonthOverview", month: month };
    if (opts.force) q.force = "1";
    return api().apiGet(q, { timeoutMs: 18000, cacheTtlMs: opts.force ? 0 : 20000 }).then(function (res) {
      if (res && (res.days || res.status === "success")) absorbOverview(month, res);
      if (!pendingFor(month).length) delete dirtyMonths[month];
      view.overviewLoading = false;
      view.loading = false;
      if (quiet && weekOnScreen()) paintMonthQuiet();
      else paint();
      var shown = (view.monthClients || []).length + (view.weekClients || []).length;
      var expectShown = logic().countFromMonth(view.overview, view.date);
      if (view.date && expectShown > 0 && !shown && !view.listLoading && (view.date || "").slice(0, 7) === month) {
        openCalendarDay(view.date);
      }
      return res;
    }).catch(function () {
      view.overviewLoading = false;
      view.loading = false;
      if (!quiet) paint();
    });
  }

  function monthStores() {
    var list = [{ overview: overviewCache, people: monthPeopleCache }];
    try {
      if (ord() && ord().monthStore) list.push(ord().monthStore());
    } catch (e) {}
    list.forEach(function (st) { st.pending = pending; });
    return list;
  }

  function personKnown(date, client) {
    var key = logic().isoDay(date);
    if (!key) return false;
    var pack = monthPeopleCache[key.slice(0, 7)];
    if (!pack || !pack.byDate || !Array.isArray(pack.byDate[key])) return false;
    var want = logic().viewClientKey((client && (client.matchKey || client.name || client.client)) || "");
    if (!want) return false;
    for (var i = 0; i < pack.byDate[key].length; i++) {
      var row = pack.byDate[key][i];
      if (logic().viewClientKey((row && (row.matchKey || row.name)) || "") === want) return true;
    }
    return false;
  }

  function publishOverview(month, res) {
    if (!month || !res) return;
    overviewCache[month] = res;
    try {
      var st = ord() && ord().monthStore && ord().monthStore();
      if (st && st.overview) st.overview[month] = res;
    } catch (e) {}
    if ((view.calCursor || view.date || "").slice(0, 7) === month) view.overview = res;
  }

  function pendingFor(month) {
    return pending.filter(function (p) {
      if (!p) return false;
      return (p.date && p.date.slice(0, 7) === month) || (p.oldDate && p.oldDate.slice(0, 7) === month);
    });
  }

  function pendingStamp(p) {
    var who = (p && p.client && (p.client.matchKey || p.client.name)) || "";
    return String(p && p.op) + "|" + String(p && p.date) + "|" + String(p && p.oldDate || "") + "|" + logic().viewClientKey(who);
  }

  function syncPeopleView() {
    var month = displayedMonth();
    if (overviewCache[month]) view.overview = overviewCache[month];
    var pack = monthPeopleCache[month];
    if (!view.date || !logic().monthPeopleReady(pack, view.overview)) return;
    var listed = logic().peopleForDate(pack, view.date);
    var cmp = logic().resFromPeople(view.date, listed);
    applyCompare(cmp);
    compareCache[compareKey()] = { at: Date.now(), res: cmp };
  }

  function paintMonthQuiet() {
    syncPeopleView();
    if (!weekOnScreen()) return;
    view.loading = false;
    view.overviewLoading = false;
    view.listLoading = false;
    var grid = typeof document !== "undefined" && document.getElementById("nxCalGrid");
    if (!grid) {
      paint();
      return;
    }
    var holder = document.createElement("div");
    holder.innerHTML = monthCal();
    var nextGrid = holder.querySelector("#nxCalGrid");
    if (nextGrid) grid.innerHTML = nextGrid.innerHTML;
    var sum = document.getElementById("nxCalSum");
    var nextSum = holder.querySelector("#nxCalSum");
    if (sum && nextSum) sum.innerHTML = nextSum.innerHTML;
    var list = document.getElementById("nxDayList");
    if (list) list.innerHTML = dayListHtml();
    dock();
    if (root.__nxAfterWeekPaint) root.__nxAfterWeekPaint();
  }

  function absorbPeople(month, pack) {
    var merged = logic().mergePeoplePack(pack, pendingFor(month));
    if (!merged.pack) return;
    monthPeopleCache[month] = merged.pack;
    var keep = {};
    (merged.pending || []).forEach(function (p) { keep[pendingStamp(p)] = 1; });
    pending = pending.filter(function (p) {
      var inMonth = (p.date && p.date.slice(0, 7) === month) || (p.oldDate && p.oldDate.slice(0, 7) === month);
      if (!inMonth) return true;
      return !!keep[pendingStamp(p)];
    });
    if (overviewCache[month]) publishOverview(month, logic().countsFromPeople(overviewCache[month], merged.pack));
  }

  function absorbOverview(month, res) {
    var merged = logic().mergeOverview(overviewCache[month], res, pendingFor(month), month);
    if (monthPeopleCache[month]) merged = logic().countsFromPeople(merged, monthPeopleCache[month]);
    if (merged) publishOverview(month, merged);
  }

  function silentRefreshMonth(month) {
    if (!month || !api()) return;
    delete parkedRefresh[month];
    var now = Date.now();
    if (refreshAt[month] && now - refreshAt[month] < 500) return;
    refreshAt[month] = now;
    var gen = (refreshGen[month] || 0) + 1;
    refreshGen[month] = gen;
    if (api().bustMem) api().bustMem(["getMonthOverview", "getCalendarMonthPeople", "getViewCompare", "getWeekDayCounts"]);
    api().apiGet({ action: "getMonthOverview", month: month, force: "1" }, { timeoutMs: 18000, cacheTtlMs: 0 }).then(function (res) {
      if (refreshGen[month] !== gen) return;
      if (res && (res.days || res.status === "success")) absorbOverview(month, res);
      if (!pendingFor(month).length) delete dirtyMonths[month];
      if (weekOnScreen() && displayedMonth() === month) paintMonthQuiet();
    }).catch(function () {});
    fetchMonthPeople(month, { force: true, gen: gen }).then(function () {
      if (refreshGen[month] !== gen) return;
      if (!pendingFor(month).length) delete dirtyMonths[month];
      if (weekOnScreen() && displayedMonth() === month) paintMonthQuiet();
    });
    loadCounts().catch(function () {});
  }

  function noteMonth(change) {
    var changes = Array.isArray(change) ? change : [change];
    var months = {};
    changes.forEach(function (ch) {
      if (!ch) return;
      if (ch.op !== "remove" && ch.op !== "touch") ch.known = personKnown(ch.date, ch.client);
      var got = null;
      monthStores().forEach(function (st) { got = logic().applyMonthChange(st, ch); });
      if (got && got.pending) pending.push(got.pending);
      (got && got.months || []).forEach(function (m) { months[m] = 1; });
    });
    var list = Object.keys(months);
    if (!list.length) {
      var shown = displayedMonth();
      if (shown) list = [shown];
    }
    list.forEach(function (m) { dirtyMonths[m] = true; });
    paintMonthQuiet();
    list.forEach(function (m) {
      if (!weekOnScreen()) {
        parkedRefresh[m] = true;
        return;
      }
      silentRefreshMonth(m);
    });
  }

  async function load(opts) {
    opts = opts || {};
    if (opts.force) {
      compareCache = {};
      peopleFlight = {};
    }
    var month = (view.calCursor || view.date || new Date().toISOString()).slice(0, 7);
    if (parkedRefresh[month]) {
      delete parkedRefresh[month];
      opts.force = true;
      opts.silent = true;
    }
    view.error = "";
    var ready = logic().monthPeopleReady(monthPeopleCache[month], view.overview);
    view.listLoading = !ready && !view.monthClients.length && !view.weekClients.length;
    if (!view.overview && !ready) view.loading = true;
    if (ready && view.date) openCalendarDay(view.date);
    else paint();
    loadCounts().catch(function () {});
    loadBanners().catch(function () {}).then(function () { if (weekOnScreen()) paint(); });
    fetchOverview(month, opts);
    fetchMonthPeople(month, opts).then(function (pack) {
      if (!weekOnScreen()) return;
      if ((view.calCursor || view.date || "").slice(0, 7) !== month) return;
      if (logic().monthPeopleReady(pack, view.overview)) {
        if (selectedInView()) openCalendarDay(view.date);
        else paintFast();
        return;
      }
      fetchCompare(opts);
    });
  }

  function openEdit(c, calendarOnly) {
    if (!c || !ord().loadFromClient) return;
    sh().closeAll();
    var when = selectedInView() ? view.date : String((c && (c._sumDate || c.dateIso || c.date)) || view.date || "").slice(0, 10);
    ord().loadFromClient(c, {
      day: view.calendarOnly || calendarOnly ? "" : (view.resolvedDay || view.day || (c && c.day) || ""),
      date: when,
      calendarOnly: !!(view.calendarOnly || calendarOnly || !selectedInView())
    });
    if (root.__nxOpenNew) root.__nxOpenNew();
  }

  async function moveOne(c) {
    if (!c) return;
    var picked = await sh().pickDate({
      title: "Перенести",
      lead: c.name || "",
      value: view.date || "",
      verb: "Перенести",
      loadMonth: function (key) {
        return api().apiGet({ action: "getMonthOverview", month: key }, { timeoutMs: 15000, cacheTtlMs: 20000 });
      }
    });
    if (!picked) return;
    var target = await api().apiGet({ action: "resolveDayForDate", date: picked }, { timeoutMs: 15000, cacheTtlMs: 0 });
    if (!target || !target.newDate && !picked) { sh().toast("Не удалось определить дату"); return; }
    var newDate = (target && (target.newDate || target.date)) || picked;
    var newDay = (target && (target.dayName || target.day)) || "";
    var sameDate = String(view.date || "").slice(0, 10) === String(newDate || "").slice(0, 10);
    if (!sameDate && !(await confirmFullDay(newDate))) return;
    var onWeek = target && (target.onWeek || target.dayName);
    var calendarOnly = !!(view.calendarOnly || !onWeek);
    var ans = await sh().confirm({
      title: "Нарезка при переносе",
      text: "Нарезать сырьё на этого клиента в новом дне вместе со всеми?",
      ok: "Да, резать",
      alt: "Нет — только перенос",
      cancel: "Отмена"
    });
    if (!ans) return;
    var cut = ans === "alt" ? "no" : "yes";
    var ot = logic().resolveOrderType(c);
    var params = logic().moveParams({
      client: c.name,
      matchKey: c.matchKey || logic().viewClientKey(c.name),
      oldDay: view.calendarOnly ? "" : (view.resolvedDay || view.day),
      oldDate: selectedInView() ? view.date : String((c && (c._sumDate || c.dateIso || c.date)) || view.date || "").slice(0, 10),
      newDay: newDay,
      newDate: newDate,
      calendarOnly: calendarOnly,
      cutRaw: cut,
      segment: c.segment || logic().orderTypeToSegment(ot),
      orderType: ot
    });
    var res = await api().apiGet(params, { timeoutMs: 35000, cacheTtlMs: 0 });
    var moveChange = {
      op: "move",
      date: newDate,
      oldDate: selectedInView() ? view.date : String((c && (c._sumDate || c.dateIso || c.date)) || view.date || "").slice(0, 10),
      client: {
        name: c.name,
        matchKey: c.matchKey || "",
        address: c.address || "",
        phone: c.phone || "",
        note: c.note || "",
        segment: c.segment || "",
        orderType: ot,
        basket: c.basket || [],
        orderPrice: c.orderPrice,
        ppSlot: c.ppSlot || "",
        day: newDay
      }
    };
    confirmWrite(res, "перенесено", moveChange);
    if (logic().writeAccepted(res)) noteMonth(moveChange);
  }

  async function delOne(c) {
    if (!c) return;
    var ok = await sh().confirm({
      title: "Удалить",
      text: view.calendarOnly
        ? "Убрать «" + c.name + "» из календаря на " + (view.date || "эту дату") + "?"
        : "Удалить «" + c.name + "» из этого дня?",
      ok: "Удалить",
      cancel: "Отмена",
      danger: true
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
    var delChange = {
      op: "remove",
      date: selectedInView() ? view.date : String((c && (c._sumDate || c.dateIso || c.date)) || view.date || "").slice(0, 10),
      client: c
    };
    confirmWrite(res, "удалено", delChange);
    if (logic().writeAccepted(res)) noteMonth(delChange);
  }

  async function setSlot(c, slot) {
    if (!c || !view.date) { sh().toast("Нет даты"); return; }
    var params = logic().slotSaveParams(c, slot, view.date, view.resolvedDay || view.day, view.calendarOnly);
    var ok = await sh().confirm({
      title: "Слот ПП",
      text: c.name + "\nПоставить ПП " + params.ppSlot + "?",
      ok: "Поставить",
      cancel: "Отмена"
    });
    if (!ok) return;
    var res = await api().apiPost(params);
    confirmWrite(res, "внесено");
    if (logic().writeAccepted(res)) {
      c.deliverySlot = Number(params.deliverySlot) || slot;
      c.ppSlot = params.ppSlot;
      c.deliveriesN = Number(params.deliveriesN) || c.deliveriesN;
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
    var nHere = 0;
    (view.counts || []).forEach(function (it) {
      if (it && view.day && it.day === view.day) nHere = Number(it.count) || 0;
    });
    if (!nHere && view.date) nHere = await countOnIso(view.date);
    var fullDraft = logic().fullDayPrompt(nHere);
    if (fullDraft) {
      var addDraft = await sh().confirm({ title: "Полный день", text: fullDraft, ok: "Добавить", cancel: "Отмена" });
      if (!addDraft) return;
    }
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
    noteMonth(snap.map(function (c) {
      return {
        op: "save",
        date: view.date,
        client: c
      };
    }));
  }

  async function countOnIso(iso) {
    var key = String(iso || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return 0;
    var res = null;
    try {
      res = await api().apiGet({ action: "getMonthOverview", month: key }, { timeoutMs: 12000, cacheTtlMs: 20000 });
    } catch (e) { res = null; }
    return logic().countFromMonth(res, iso);
  }

  async function confirmFullDay(iso) {
    var text = logic().fullDayPrompt(await countOnIso(iso));
    if (!text) return true;
    return !!(await sh().confirm({ title: "Полный день", text: text, ok: "Добавить", cancel: "Отмена" }));
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function reverseChange(ch) {
    if (!ch || ch.op === "touch") return null;
    var date = String(ch.date || "").slice(0, 10);
    var oldDate = String(ch.oldDate || "").slice(0, 10);
    var client = ch.client || {};
    if (ch.op === "remove") return { op: "save", date: date, client: client, known: true };
    if (ch.op === "move" || (oldDate && date && oldDate !== date)) {
      return { op: "move", date: oldDate, oldDate: date, client: client };
    }
    if (ch.op === "save" && ch.oldClient) {
      return {
        op: "save",
        date: date,
        client: {
          name: ch.oldClient,
          matchKey: ch.oldMatchKey || client.matchKey || "",
          segment: client.segment,
          orderType: client.orderType
        },
        oldClient: client.name || "",
        oldMatchKey: client.matchKey || ""
      };
    }
    if (ch.op === "save") return { op: "remove", date: date, client: client };
    return null;
  }

  function dropPendingLike(ch) {
    var date = String(ch.date || "").slice(0, 10);
    var oldDate = String(ch.oldDate || "").slice(0, 10);
    var name = logic().viewClientKey((ch.client && (ch.client.matchKey || ch.client.name)) || ch.oldClient || "");
    pending = pending.filter(function (p) {
      var who = logic().viewClientKey((p.client && (p.client.matchKey || p.client.name)) || "");
      if (name && who && who !== name) return true;
      var pd = String(p.date || "").slice(0, 10);
      var po = String(p.oldDate || "").slice(0, 10);
      if (date && pd !== date && po !== date && pd !== oldDate) return true;
      return false;
    });
  }

  function rollbackChanges(change) {
    var list = Array.isArray(change) ? change : [change];
    var months = {};
    list.forEach(function (ch) {
      if (!ch) return;
      dropPendingLike(ch);
      var rev = reverseChange(ch);
      if (rev) monthStores().forEach(function (st) { logic().applyMonthChange(st, rev); });
      if (ch.date) months[String(ch.date).slice(0, 7)] = 1;
      if (ch.oldDate) months[String(ch.oldDate).slice(0, 7)] = 1;
    });
    paintMonthQuiet();
    Object.keys(months).forEach(function (m) {
      if (m && m.length >= 7) silentRefreshMonth(m);
    });
    sh().toast("Не закрепилось, вернул как было");
  }

  function confirmWrite(res, done, change) {
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
          Object.keys(dirtyMonths).forEach(silentRefreshMonth);
          return;
        }
        if (p && p.status === "error" && !p.pendingSheets && !p.pendingSheetsMirror && !p.d1Verified) {
          if (change) rollbackChanges(change);
          else sh().toast("Не закрепилось, вернул как было");
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
      view.monthClients = [];
      view.weekClients = [];
      fetchCompare({ force: false });
      return true;
    }
    if (act === "wcal") {
      var picked = String(node.getAttribute("data-date") || "").slice(0, 10);
      if (selectedInView() && String(view.date).slice(0, 10) === picked) {
        view.date = "";
        view.day = "";
        view.resolvedDay = "";
        view.monthClients = [];
        view.weekClients = [];
        view.listLoading = false;
        view.loading = false;
        paintFast();
        return true;
      }
      openCalendarDay(picked);
      return true;
    }
    if (act === "wcal-shift") {
      var base = view.calCursor || view.date || new Date().toISOString().slice(0, 10);
      var parts = base.split("-");
      var dt = new Date(Number(parts[0]), Number(parts[1]) - 1 + Number(node.getAttribute("data-dir") || 0), 1);
      view.calCursor = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-01";
      var monthKey = view.calCursor.slice(0, 7);
      if (overviewCache[monthKey]) {
        view.overview = overviewCache[monthKey];
        view.overviewLoading = false;
        paint();
      } else {
        view.overview = { days: [] };
        view.overviewLoading = true;
        paint();
        fetchOverview(monthKey, {});
      }
      if (!monthPeopleCache[monthKey]) {
        fetchMonthPeople(monthKey, {}).then(function () {
          if ((view.calCursor || "").slice(0, 7) !== monthKey) return;
          if (weekOnScreen()) paintFast();
        });
      }
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
    if (act === "wrow") { openRow(clientAt(node.getAttribute("data-src"), Number(node.getAttribute("data-i"))), Number(node.getAttribute("data-i")), node.getAttribute("data-src")); return true; }
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
    view.seg = "month";
    view.role = role || view.role;
    if (!view.date) view.date = new Date().toISOString().slice(0, 10);
    if (!view.calCursor) view.calCursor = view.date.slice(0, 8) + "01";
    load();
  }

  root.BoinyaWeek = {
    show: show,
    paint: paint,
    onAct: onAct,
    confirmWrite: confirmWrite,
    confirmFullDay: confirmFullDay,
    noteMonth: noteMonth,
    setRole: function (role) { view.role = role || ""; },
    setDay: function (day) {
      if (!day) return;
      view.day = day;
      view.seg = "week";
    },
    segment: function () { return view.seg; },
    setSegs: function (fn) { segsFn = fn; },
    contextLine: function () {
      var n = (view.monthClients || []).length || (view.weekClients || []).length;
      if (!view.date) return n ? (n + " чел.") : "Месяц";
      var p = String(view.date).split("-");
      var months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
      var bit = (p.length === 3 ? (Number(p[2]) + " " + (months[Number(p[1]) - 1] || "")) : view.date);
      return bit + (n ? ", " + n + " чел." : "");
    }
  };
})(window);
