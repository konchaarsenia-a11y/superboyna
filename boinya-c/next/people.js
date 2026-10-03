/* Ещё → Доступы. listAccess / setAccessRole / список запланированного — как в старом экране.
   Дерево вкладок сохраняется тем же setAccessTabs. «⏰» — только список, без переключателей. */
(function (root) {
  "use strict";

  var people = [];
  var sched = null;
  var timezones = ["Europe/Minsk"];
  var openId = "";
  var warehouses = [];
  var roleSetup = null;
  var whDeparture = null;
  var whSuggest = [];
  var whAddrTimer = 0;
  var whAddrSeq = 0;
  var screen = "staff";
  var wageKnown = false;
  var wageAmount = null;
  var wageSeq = 0;
  var roleSeq = 0;
  var cutPrep = { day: "", lines: [], tried: false };
  var whMsg = "";
  var DAY_NAMES = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function L() { return root.BoinyaWeekLogic; }
  function esc(s) { return sh().esc(s); }
  function tid() {
    try {
      var u = api().telegramUser();
      return String((u && u.id) || "");
    } catch (e) { return ""; }
  }

  var ROLES = ["owner", "manager", "all", "cutter", "courier", "logistics", "pending", "denied", "none"];
  var RU = { owner: "владелец", manager: "менеджер", all: "все рабочие", cutter: "нарезчик", courier: "курьер", logistics: "склад", pending: "ожидание", denied: "закрыт", none: "нет доступа" };
  var APPROVE_ROLES = ["manager", "cutter", "courier", "logistics", "all"];
  var FALLBACK_TZ = ["Europe/Minsk", "Europe/Moscow", "Europe/Kaliningrad", "Europe/Kiev", "Europe/Warsaw", "Europe/Berlin", "Asia/Yekaterinburg", "Asia/Novosibirsk", "Asia/Vladivostok", "UTC"];
  var ROOTS = [
    ["orderScreen", "Заказы (приём)"],
    ["clientsScreen", "Заказы ▸ Просмотр"],
    ["priceScreen", "Заказы ▸ Расчёт"],
    ["deferredScreen", "Задачи ☰ / Отложенное"],
    ["templatesScreen", "Заказы ▸ Шаблоны"],
    ["subsScreen", "Заказы ▸ Подписки"],
    ["subDetailScreen", "Карточка подписки"],
    ["cuttingScreen", "Нарезка"],
    ["courierScreen", "Курьер"],
    ["warehouseScreen", "Склад"],
    ["partnerHubScreen", "Партнёры"],
    ["statsScreen", "Статистика (деньги)"],
    ["retailPriceScreen", "Прайс (правка)"]
  ];
  var CHILD_RU = {
    month: "Месяц", week: "Неделя", calc: "Расчёт", pick: "Подбор",
    xfer: "Переносы", buy: "Дозакуп", orders: "Заказы / «На потом»", pp: "ПП/БП (отложенные расчёты)", remind: "Напоминалки",
    texts: "Тексты / опросники", ai: "Подбор ИИ", route: "Курьер / доставлено", assembly: "Сборка / печать",
    people: "Люди", points: "Точки", nets: "Сети", notify: "Пуши"
  };
  var NOTIFY_RU = {
    wh_buy: "Дозакуп / дефицит сырья",
    cut_deficit: "Дефицит нарезки",
    out_next: "Заканчивается запас",
    cut_increase: "Срочное увеличение объёма нарезки",
    date_nudge: "«Подбейте даты»",
    missed_delivery: "Не получил доставку",
    week_done: "Неделя завершена",
    access_req: "Запрос доступа",
    survey: "Опросники БП2 / ПП",
    partner_order: "Новая заявка партнёра",
    partner_suggest: "Предложение партнёра",
    gb_lead: "Заявка GOOD BOY с сайта"
  };
  var sheetFlags = { tabs: false, tabsReset: false, notify: false, notifyReset: false };
  var showGen = 0;
  var CACHE_KEY = "nx-access-screen-v1";

  function readScreenCache() {
    try {
      var raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!raw || !Array.isArray(raw.people) || !raw.people.length) return null;
      return raw;
    } catch (e) { return null; }
  }

  function writeScreenCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        people: people,
        timezones: timezones,
        warehouses: warehouses,
        departure: whDeparture,
        at: Date.now()
      }));
    } catch (e) {}
  }

  function applyPeople(res) {
    if (!res || res.status !== "success" || !Array.isArray(res.people)) return false;
    people = res.people;
    if (Array.isArray(res.timezones) && res.timezones.length) timezones = res.timezones;
    return true;
  }

  async function fetchAccess(force) {
    if (force) {
      return api().apiGet(
        { action: "listAccess", telegramId: tid(), force: "1", _: String(Date.now()) },
        { timeoutMs: 20000, cacheTtlMs: 0 }
      );
    }
    var fast = null;
    try {
      fast = await api().apiGet(
        { action: "listAccessFast", telegramId: tid() },
        { timeoutMs: 2500, cacheTtlMs: 45000 }
      );
    } catch (e) { fast = null; }
    if (fast && fast.status === "success" && fast.fast === true && Array.isArray(fast.people)) {
      return { res: fast, background: true };
    }
    var full = null;
    try {
      full = await api().apiGet(
        { action: "listAccess", telegramId: tid() },
        { timeoutMs: 20000, cacheTtlMs: 45000 }
      );
    } catch (e2) { full = null; }
    return { res: full, background: false };
  }

  async function load(opts) {
    opts = opts || {};
    var packed = opts.force ? { res: await fetchAccess(true), background: false } : await fetchAccess(false);
    var res = packed && packed.res ? packed.res : packed;
    if (packed && packed.res) res = packed.res;
    if (!res || res.status !== "success") {
      if (!opts.keep) people = [];
      return res;
    }
    applyPeople(res);
    return res;
  }

  async function loadSched() {
    sched = await api().apiGet({ action: "listScheduledNotifications", telegramId: tid(), _: String(Date.now()) }, { timeoutMs: 30000, cacheTtlMs: 0 });
    return sched;
  }

  function schedLines(p) {
    if (!sched) return '<p class="b-note">Загрузка…</p>';
    if (sched.status !== "success") return '<p class="b-note">Не загрузилось</p>';
    var id = String(p.telegramId || "");
    var rows = [];
    (sched.reminders || []).forEach(function (r) {
      if (String(r.toTid) !== id && String(r.fromTid) !== id) return;
      rows.push("⏰ " + (r.at || "") + " · " + (r.title || "Напоминание") + (r.client ? " · " + r.client : ""));
    });
    (sched.surveys || []).forEach(function (s) {
      if (String(s.respTid) !== id) return;
      rows.push("📋 " + (s.due || "") + " · опросник " + (s.kind || "") + " · " + (s.nick || ""));
    });
    (sched.deficits || []).forEach(function (d) {
      rows.push("⚠️ " + (d.nextAt || "") + " · дефицит: " + (d.item || "") + " (" + (d.day || "") + ")");
    });
    if (!rows.length) return '<p class="b-note">Для этого человека сейчас ничего не запланировано.</p>';
    return rows.map(function (t) { return '<p class="b-note" style="color:var(--b-text)">' + esc(t) + "</p>"; }).join("");
  }

  function paint() {
    rememberWhMsg();
    if (screen === "settings") { paintSettings(); return; }
    paintStaff();
  }

  function backHtml() {
    return '<button type="button" class="nx-link" data-act="more-back">← Ещё</button>';
  }

  function paintSettings() {
    sh().main(backHtml() + warehousesHtml());
  }

  function personWage(p) {
    if (!wageKnown) return "нет данных";
    var cutterId = roleSetup && roleSetup.cutter && roleSetup.cutter.tgId;
    if (cutterId && String(p.telegramId) === String(cutterId)) return sh().money(wageAmount) + " BYN";
    return sh().money(0) + " BYN";
  }

  function paintStaff() {
    var pending = people.filter(function (p) { return String(p.role) === "pending" || String(p.role) === "none"; });
    var rest = people.filter(function (p) { return pending.indexOf(p) < 0; });
    var html = backHtml();
    html += '<button type="button" class="b-btn b-btn--sec" data-act="p-reload">Обновить список</button>';
    html += '<p class="b-lbl">Заявки</p>';
    if (!people.length) html += '<p class="b-note">Список пуст. Доступы видит владелец.</p>';
    else if (!pending.length) html += '<p class="b-note">Заявок нет.</p>';
    pending.forEach(function (p) {
      var opts = APPROVE_ROLES.map(function (r) {
        return '<option value="' + r + '"' + (r === "manager" ? " selected" : "") + ">" + esc(RU[r]) + "</option>";
      }).join("");
      html += '<article class="b-card" style="margin-bottom:8px"><p class="b-li__title" style="margin:0">' + esc(p.name || p.telegramId) + "</p>" +
        '<p class="b-note">' + esc(p.telegramId) + "</p>" +
        '<label class="b-field"><span class="b-note">Роль</span><select class="b-field__input">' + opts + "</select></label>" +
        '<div class="nx-actions"><button type="button" class="b-btn b-btn--main b-btn--sm" data-act="p-approve" data-id="' + esc(p.telegramId) + '">Одобрить</button>' +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="p-deny" data-id="' + esc(p.telegramId) + '">Отклонить</button></div></article>';
    });
    html += '<p class="b-lbl">Сотрудники</p>';
    if (!rest.length) html += '<p class="b-note">Сотрудников нет.</p>';
    else {
      html += '<div class="b-list">';
      rest.forEach(function (p) {
        html += '<button type="button" class="b-li" data-act="p-open" data-id="' + esc(p.telegramId) + '"><span class="b-li__body">' +
          '<span class="b-li__title">' + esc(p.name || p.telegramId) + "</span>" +
          '<span class="b-li__sub">' + esc((RU[p.role] || p.role || "") + " " + personWage(p)) + '</span></span><span class="b-li__chev">›</span></button>';
      });
      html += "</div>";
    }
    html += rolesHtml();
    html += whMsgHtml();
    sh().main(html);
  }

  function whById(id) {
    for (var i = 0; i < warehouses.length; i++) if (String(warehouses[i].id) === String(id)) return warehouses[i];
    return null;
  }

  function warehousesHtml() {
    var html = '<p class="b-lbl">Склады</p>';
    if (!warehouses.length) html += '<p class="b-note">Складов пока нет, курьер видит Белецкого 10к2</p>';
    warehouses.forEach(function (w) {
      var dep = !!(w.departure || (whDeparture && String(whDeparture.id) === String(w.id)));
      var geo = (w.lat != null && w.lon != null) ? formatDepotCoords(w.lat, w.lon) : "";
      html += '<article class="nx-depot"><div class="nx-depot__body"><p class="b-li__title" style="margin:0">' + esc(w.name) +
        (dep ? ' <span class="b-pill b-pill--ok">выезд</span>' : "") +
        '</p><p class="b-note">' + esc(w.address) + (geo ? "<br>" + esc(geo) : "") + "</p></div>";
      if (!dep) html += '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="wh-dep" data-id="' + esc(w.id) + '">Выезд</button>';
      html += '<button type="button" class="b-btn b-btn--danger b-btn--sm" data-act="wh-del" data-id="' + esc(w.id) + '">Удалить</button></article>';
    });
    html += '<button type="button" class="b-btn b-btn--sec" data-act="wh-add">+ Склад</button>';
    html += '<p class="b-note">точка выезда курьера: название и адрес, остатки склада не делятся</p>';
    return html;
  }

  function currentMonthKey() {
    var d = new Date();
    var m = d.getMonth() + 1;
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m;
  }

  function rolesHtml() {
    var s = roleSetup || {};
    var month = s.month || currentMonthKey();
    function opts(selected) {
      var html = '<option value="">не выбран</option>';
      people.forEach(function (p) {
        if (!p || !p.telegramId) return;
        var role = String(p.role || "");
        if (role === "denied" || role === "pending" || role === "none") return;
        var id = String(p.telegramId);
        html += '<option value="' + esc(id) + '"' + (id === String(selected || "") ? " selected" : "") + ">" + esc(p.name || id) + "</option>";
      });
      return html;
    }
    var cutter = s.cutter && s.cutter.tgId ? s.cutter.tgId : "";
    var courier = s.courier && s.courier.tgId ? s.courier.tgId : "";
    var wageText = wageKnown ? (sh().money(wageAmount) + " BYN") : "нет данных";
    return '<p class="b-lbl">Зарплата на производстве</p><article class="b-card">' +
      '<p class="b-note">Кто режет и собирает, и кто курьер. Месяц сразу показывает назначения и сумму.</p>' +
      '<p class="b-lbl">Месяц</p><label class="b-field"><input class="b-field__input" id="nxRoleMonth" type="month" value="' + esc(month) + '"></label>' +
      '<p class="b-lbl">Нарезчик-сборщик</p><label class="b-field"><select class="b-field__input" id="nxRoleCutter">' + opts(cutter) + "</select></label>" +
      '<p class="b-lbl">Курьер</p><label class="b-field"><select class="b-field__input" id="nxRoleCourier">' + opts(courier) + "</select></label>" +
      '<p class="b-lbl">ЗП за месяц</p><p class="b-note" id="nxWageSum" style="color:var(--b-text)">' + esc(wageText) + "</p>" +
      '<p class="b-note">Отдельной ЗП курьера в формуле нет. Сумма месяца у нарезчика-сборщика.</p>' +
      '<div class="nx-actions" style="margin-top:8px"><button type="button" class="b-btn b-btn--main" data-act="p-roles">Сохранить</button></div></article>';
  }

  function rememberWhMsg() {
    var ta = document.getElementById("nxWhMsg");
    if (ta) whMsg = String(ta.value || "");
  }

  function prepLine(it) {
    var name = String((it && it.name) || "").trim();
    if (!name) return "";
    if (it.unit === "шт") {
      var n = it.raw != null ? it.raw : it.dry;
      return name + ": " + String(n) + " шт";
    }
    var kg = Number(it.raw);
    if (!isFinite(kg)) return "";
    return name + ": " + sh().money(kg) + " кг";
  }

  async function loadWage(month) {
    month = month || currentMonthKey();
    var seq = ++wageSeq;
    wageKnown = false;
    wageAmount = null;
    var res = null;
    try {
      res = await api().apiGet({
        action: "getStats",
        period: "month",
        month: month,
        _: String(Date.now())
      }, { timeoutMs: 20000, cacheTtlMs: 0 });
    } catch (eWage) { res = null; }
    if (seq !== wageSeq) return;
    var roll = res && (res.formula || (res.fact && res.fact.formula));
    var F = root.BoinyaFormulas;
    if (!res || res.status !== "success" || !roll || roll.ok === false || !F || !F.formulaParts_) return;
    var parts = F.formulaParts_({ S: roll.S, G: roll.G, P: roll.P, N: roll.N });
    wageAmount = parts ? parts.wage : null;
    wageKnown = wageAmount != null && isFinite(Number(wageAmount));
  }

  async function loadCutPrep() {
    var start = new Date().getDay();
    var i;
    for (i = 0; i < 8; i++) {
      var day = DAY_NAMES[(start + i) % 7];
      var res = null;
      try {
        res = await api().apiGet({ action: "getCutting", day: day, _: String(Date.now()) }, { timeoutMs: 12000, cacheTtlMs: 0 });
      } catch (eCut) { res = null; }
      var lines = [];
      ((res && res.items) || []).forEach(function (it) {
        var line = prepLine(it);
        if (line) lines.push(line);
      });
      if (lines.length) {
        cutPrep = { day: day, lines: lines, tried: true };
        return;
      }
    }
    cutPrep = { day: "", lines: [], tried: true };
  }

  function whMsgHtml() {
    var html = '<p class="b-lbl">Сообщение складу</p><article class="b-card">';
    html += '<p class="b-note">Что подготовить к ближайшей нарезке. Уходит задачей роли склада, без Telegram.</p>';
    if (!cutPrep.tried) html += '<p class="b-note">Считаю ближайшую нарезку…</p>';
    else if (!cutPrep.lines.length) html += '<p class="b-note">На ближайшие дни нарезки нет</p>';
    else {
      html += '<p class="b-note">Ближайшая нарезка ' + esc(cutPrep.day) + "</p>";
      cutPrep.lines.forEach(function (line) {
        html += '<p class="b-note" style="color:var(--b-text)">' + esc(line) + "</p>";
      });
    }
    html += '<p class="b-lbl">Комментарий</p><label class="b-field"><textarea class="b-field__input" id="nxWhMsg" rows="3">' + esc(whMsg) + "</textarea></label>";
    html += '<button type="button" class="b-btn b-btn--main" data-act="p-wh-send" style="margin-top:8px">Отправить складу</button></article>';
    return html;
  }

  async function sendWhMsg() {
    rememberWhMsg();
    if (!cutPrep.lines.length) { sh().toast("На ближайшие дни нарезки нет"); return; }
    var body = cutPrep.lines.join("\n");
    var comment = String(whMsg || "").trim();
    if (comment) body += "\n" + comment;
    var title = "Складу: " + cutPrep.day;
    var res = null;
    try {
      res = await api().apiPost({
        action: "saveDeferred",
        telegramId: tid(),
        id: "whmsg_" + Date.now().toString(36),
        mode: "remind",
        title: title,
        status: "open",
        payload: JSON.stringify({ mode: "remind", forRole: "logistics", title: title, text: body })
      });
    } catch (eSend) { res = null; }
    sh().toast(res && res.status === "success" ? "Складу отправлено" : "Не отправилось");
  }

  async function loadRoles(month) {
    month = month || currentMonthKey();
    var seq = ++roleSeq;
    var res = null;
    try {
      res = await api().apiGet({ action: "getStatsMonthSetup", month: month, _: String(Date.now()) }, { timeoutMs: 12000, cacheTtlMs: 0 });
    } catch (eRole) { res = null; }
    if (seq !== roleSeq) return;
    if (!res || res.status !== "success") res = { month: month, cutter: {}, courier: {} };
    roleSetup = res;
    roleSetup.month = month;
  }

  async function saveRoles() {
    var monthEl = document.getElementById("nxRoleMonth");
    var month = monthEl && monthEl.value ? monthEl.value : currentMonthKey();
    var cutter = document.getElementById("nxRoleCutter");
    var courier = document.getElementById("nxRoleCourier");
    function nameOf(sel) {
      if (!sel || !sel.value) return "";
      var opt = sel.options[sel.selectedIndex];
      return opt ? String(opt.text || "") : "";
    }
    var res = null;
    try {
      res = await api().apiGet({
        action: "saveStatsRoles",
        month: month,
        cutterTgId: cutter ? cutter.value : "",
        cutterName: nameOf(cutter),
        courierTgId: courier ? courier.value : "",
        courierName: nameOf(courier),
        _: String(Date.now())
      }, { timeoutMs: 15000, cacheTtlMs: 0 });
    } catch (eSave) { res = null; }
    if (res && res.status === "success") {
      roleSetup = res;
      roleSetup.month = month;
      sh().toast("Роли записаны");
      paint();
    } else sh().toast("Не записалось");
  }

  async function loadWarehouses(force) {
    try {
      var params = { action: "listWarehouses" };
      if (force) params._ = String(Date.now());
      var res = await api().apiGet(params, { timeoutMs: 12000, cacheTtlMs: force ? 0 : 45000 });
      warehouses = (res && res.warehouses) || [];
      whDeparture = (res && res.departure) || null;
    } catch (e) {
      if (warehouses.length) return;
      warehouses = [];
      whDeparture = { id: "beletskogo", name: "Склад", address: "Белецкого 10к2", departure: true, fallback: true };
    }
  }

  function paintWhSuggest() {
    var box = document.getElementById("whSuggest");
    if (!box) return;
    if (!whSuggest.length) { box.innerHTML = ""; return; }
    box.innerHTML = '<div class="nx-suggest">' + whSuggest.map(function (s, i) {
      return '<button type="button" data-act="wh-pick" data-i="' + i + '">' + esc(s.address || s.title || "") + "</button>";
    }).join("") + "</div>";
  }

  function scheduleWhAddr(q) {
    clearTimeout(whAddrTimer);
    q = String(q || "").trim();
    if (q.length < 2) { whSuggest = []; paintWhSuggest(); return; }
    whAddrTimer = setTimeout(function () { fetchWhAddr(q); }, 280);
  }

  function fetchWhAddr(q) {
    var seq = ++whAddrSeq;
    api().apiGet({ action: "suggestAddress", text: q, _: String(Date.now()) }, { timeoutMs: 12000, cacheTtlMs: 0 }).then(function (res) {
      if (seq !== whAddrSeq) return;
      whSuggest = ((res && res.results) || []).slice(0, 6);
      paintWhSuggest();
    }).catch(function () {
      if (seq !== whAddrSeq) return;
      whSuggest = [];
      paintWhSuggest();
    });
  }

  function parseDepotCoords(raw) {
    var eng = root.BoinyaOrderEngine;
    if (eng && eng.parseLatLonFromText_) return eng.parseLatLonFromText_(raw);
    return null;
  }

  function formatDepotCoords(lat, lon) {
    var a = Number(lat);
    var b = Number(lon);
    if (!isFinite(a) || !isFinite(b)) return "";
    return (Math.round(a * 1e6) / 1e6) + ", " + (Math.round(b * 1e6) / 1e6);
  }

  function openNewWarehouse() {
    whSuggest = [];
    sh().openSheet({
      title: "Новый склад",
      html: '<p class="b-lbl">Название</p><label class="b-field"><input class="b-field__input" id="whName" autocomplete="off"></label>' +
        '<p class="b-lbl">Адрес</p><label class="b-field"><input class="b-field__input" id="whAddr" autocomplete="off" placeholder="Улица и дом"></label>' +
        '<div id="whSuggest"></div>' +
        '<p class="b-note">Подсказки появятся, когда начнёте вводить адрес</p>' +
        '<p class="b-lbl">Координаты</p><label class="b-field"><input class="b-field__input" id="whCoords" autocomplete="off" inputmode="decimal" placeholder="53.9, 27.56"></label>' +
        '<p class="b-note">Обязательно. Широта и долгота через запятую, маршрут строится от них</p>',
      foot: '<button type="button" class="b-btn b-btn--main" data-act="wh-save">Сохранить</button>'
    });
  }

  function openDeleteWarehouse(id) {
    var w = whById(id);
    if (!w) return;
    sh().openSheet({
      title: "Удалить склад",
      html: '<p class="b-li__title" style="margin:0">' + esc(w.name) + "</p>" +
        '<p class="b-note">' + esc(w.address) + "</p>" +
        '<p class="b-note">старые маршруты сохранят этот адрес</p>',
      foot: '<div class="nx-actions"><button type="button" class="b-btn b-btn--danger" data-act="wh-del-yes" data-id="' + esc(w.id) + '">Удалить</button>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="sheet-close">Отмена</button></div>'
    });
  }

  async function saveWarehouse() {
    var nameEl = document.getElementById("whName");
    var addrEl = document.getElementById("whAddr");
    var name = nameEl ? String(nameEl.value || "").trim() : "";
    var address = addrEl ? String(addrEl.value || "").trim() : "";
    var coordsEl = document.getElementById("whCoords");
    var coords = parseDepotCoords(coordsEl ? coordsEl.value : "");
    if (!name || !address) { sh().toast("Укажите название и адрес"); return; }
    if (!coords) { sh().toast("Координаты: широта, долгота, например 53.9, 27.56"); return; }
    var res = await api().apiPost({ action: "saveWarehouse", name: name, address: address, lat: coords.lat, lon: coords.lon, telegramId: tid() });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не сохранилось"); return; }
    warehouses = res.warehouses || [];
    whDeparture = res.departure || null;
    sh().closeTop("ok");
    sh().toast("Склад сохранён");
    paint();
  }

  async function deleteWarehouse(id) {
    var res = await api().apiPost({ action: "deleteWarehouse", id: id, telegramId: tid() });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не удалилось"); return; }
    warehouses = res.warehouses || [];
    whDeparture = res.departure || null;
    sh().closeTop("ok");
    sh().toast("Склад удалён");
    paint();
  }

  async function setDeparture(id) {
    var res = await api().apiPost({ action: "setDepartureWarehouse", id: id, telegramId: tid() });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не сохранилась точка"); return; }
    warehouses = res.warehouses || [];
    whDeparture = res.departure || null;
    sh().toast("Точка выезда обновлена");
    paint();
  }

  function pickScreen(opts) {
    var view = opts && opts.view;
    if (view === "settings") screen = "settings";
    else if (view === "staff" || view === "people") screen = "staff";
  }

  async function showSettings(force, gen) {
    sh().dock("");
    if (!warehouses.length) sh().main(sh().skeleton(4));
    else paintSettings();
    try { await loadWarehouses(force); } catch (eWh) {}
    if (gen !== showGen) return;
    paintSettings();
  }

  async function showStaff(force, gen) {
    sh().dock("");
    var painted = false;
    if (!force) {
      var cached = readScreenCache();
      if (cached) {
        people = cached.people;
        if (cached.timezones && cached.timezones.length) timezones = cached.timezones;
        warehouses = cached.warehouses || [];
        whDeparture = cached.departure || whDeparture;
        paintStaff();
        painted = true;
      }
    }
    if (!painted) sh().main(sh().skeleton(6));
    var packed = null;
    try { packed = await fetchAccess(force); } catch (e) { packed = null; }
    if (gen !== showGen) return;
    var res = packed && packed.res ? packed.res : packed;
    var background = !!(packed && packed.background);
    if (force) background = false;
    if (!applyPeople(res)) {
      if (!painted) {
        sh().main(backHtml() + sh().errorBox({ title: "Сотрудники", text: "Только владелец. Если это вы — нажмите «Повторить».", act: "p-reload" }));
      } else sh().toast("Список не обновился");
      return;
    }
    writeScreenCache();
    var month = (roleSetup && roleSetup.month) || currentMonthKey();
    try { await loadRoles(month); } catch (eRoles) {}
    try { await loadWage(month); } catch (eWage) {}
    if (gen !== showGen) return;
    paintStaff();
    var prepGen = gen;
    loadCutPrep().then(function () {
      if (prepGen !== showGen || screen !== "staff") return;
      rememberWhMsg();
      paintStaff();
    }).catch(function () {});
    if (!background) return;
    api().apiGet({ action: "listAccess", telegramId: tid() }, { timeoutMs: 20000, cacheTtlMs: 60000 }).then(function (full) {
      if (gen !== showGen || screen !== "staff" || !applyPeople(full)) return;
      writeScreenCache();
      rememberWhMsg();
      paintStaff();
    }).catch(function () {});
  }

  async function show(opts) {
    opts = opts || {};
    pickScreen(opts);
    var gen = ++showGen;
    if (screen === "settings") return showSettings(!!opts.force, gen);
    return showStaff(!!opts.force, gen);
  }

  function personById(id) {
    for (var i = 0; i < people.length; i++) if (String(people[i].telegramId) === String(id)) return people[i];
    return null;
  }

  function zones() {
    return timezones && timezones.length ? timezones : FALLBACK_TZ;
  }

  function tabTreeHtml(p) {
    var ax = root.BoinyaAccess;
    var tree = ax.TAB_TREE;
    var tabs = Array.isArray(p.tabs) ? p.tabs : (ax.ROLE_TABS[p.role] || []);
    var html = "";
    ROOTS.forEach(function (pair) {
      var id = pair[0];
      var kids = tree[id];
      if (!kids) {
        var on = ax.tabsInclude(tabs, id);
        html += '<label class="b-note" style="display:flex;gap:8px;margin:0 0 6px"><input type="checkbox" data-act="p-tab" data-tab="' + id + '"' + (on ? " checked" : "") + "> " + esc(pair[1]) + "</label>";
        return;
      }
      var onKids = kids.filter(function (k) { return ax.tabsInclude(tabs, id + "." + k); });
      var all = onKids.length === kids.length;
      var some = onKids.length > 0 && !all;
      html += '<label class="b-note" style="display:flex;gap:8px;margin:8px 0 6px"><input type="checkbox" data-act="p-tab-parent" data-tparent="' + id + '"' + (all ? " checked" : "") + (some ? ' data-indet="1"' : "") + "> " + esc(pair[1]) + (some ? " · частично" : "") + "</label>";
      kids.forEach(function (k) {
        var on = onKids.indexOf(k) >= 0;
        html += '<label class="b-note" style="display:flex;gap:8px;margin:0 0 6px 16px"><input type="checkbox" data-act="p-tab" data-tab="' + id + "." + k + '" data-tkid="' + id + '"' + (on ? " checked" : "") + "> " + esc(CHILD_RU[k] || k) + "</label>";
      });
    });
    return html;
  }

  function notifyHtml(p) {
    var defs = (p.notifyDefaults && p.notifyDefaults.length) ? p.notifyDefaults : (L().NOTIFY_DEFAULTS[p.role] || []);
    var eff = p.notifyEffective;
    if (!eff) {
      var over = String(p.notify || "");
      eff = L().NOTIFY_KEYS.filter(function (k) {
        var on = defs.indexOf(k) >= 0;
        if (over.indexOf("+" + k) >= 0) on = true;
        if (over.indexOf("-" + k) >= 0) on = false;
        return on;
      });
    }
    return L().NOTIFY_KEYS.map(function (k) {
      var on = eff.indexOf(k) >= 0;
      return '<label class="b-note" style="display:flex;gap:8px;margin:0 0 6px"><input type="checkbox" data-act="p-notify" data-nkey="' + k + '"' + (on ? " checked" : "") + "> " + esc(NOTIFY_RU[k] || k) + "</label>";
    }).join("");
  }

  function markDirty() {
    var el = document.getElementById("nxDirty");
    if (el) el.hidden = false;
  }

  function readBoxes(sel) {
    var out = [];
    document.querySelectorAll(sel).forEach(function (cb) {
      out.push({
        tab: cb.getAttribute("data-tab") || "",
        parent: cb.getAttribute("data-tkid") || "",
        checked: !!cb.checked,
        key: cb.getAttribute("data-nkey") || ""
      });
    });
    return out;
  }

  async function openPerson(id) {
    var p = personById(id);
    if (!p) return;
    openId = String(id);
    sheetFlags = { tabs: false, tabsReset: false, notify: false, notifyReset: false };
    function formHtml(person) {
      var opts = ROLES.map(function (r) {
        return '<option value="' + r + '"' + (person.role === r ? " selected" : "") + ">" + esc(RU[r] || r) + "</option>";
      }).join("");
      var tz = person.timezone || "Europe/Minsk";
      var tzOpts = zones().map(function (z) {
        return '<option value="' + esc(z) + '"' + (z === tz ? " selected" : "") + ">" + esc(z) + "</option>";
      }).join("");
      if (zones().indexOf(tz) < 0) tzOpts = '<option value="' + esc(tz) + '" selected>' + esc(tz) + "</option>" + tzOpts;
      return '<button type="button" class="nx-link" data-act="sheet-close">← К списку</button>' +
        '<p class="b-note" id="nxDirty" hidden style="color:var(--b-warn)">Есть несохранённые изменения. В таблицу попадёт только после «Сохранить».</p>' +
        '<label class="b-field"><span class="b-note">Роль</span><select class="b-field__input" id="nxRole" data-act="p-touch">' + opts + "</select></label>" +
        '<label class="b-field" style="margin-top:8px"><span class="b-note">Часовой пояс</span><select class="b-field__input" id="nxTz" data-act="p-touch">' + tzOpts + "</select></label>" +
        '<p class="b-lbl">Вкладки</p>' + tabTreeHtml(person) +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="p-tabs-reset">Сбросить вкладки к роли</button>' +
        '<p class="b-lbl">Уведомления</p>' + notifyHtml(person) +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="p-notify-reset">Уведомления как у роли</button>' +
        '<p class="b-lbl">⏰ Запланированные</p>' + schedLines(person);
    }
    var foot = '<button type="button" class="b-btn b-btn--main" data-act="p-save">Сохранить</button>' +
      '<button type="button" class="b-btn b-btn--sec" data-act="p-cancel" style="margin-top:8px">Отмена</button>' +
      '<button type="button" class="b-btn b-btn--sec" data-act="p-deny" data-id="' + esc(id) + '" style="margin-top:8px">Закрыть доступ</button>';
    sh().openSheet({ title: p.name || id, html: formHtml(p), foot: foot });
    try { await loadSched(); } catch (e) { sched = { status: "error" }; }
    p = personById(id) || p;
    sh().replaceTop({ title: p.name || "Человек", html: formHtml(p), foot: foot });
    document.querySelectorAll("[data-indet='1']").forEach(function (el) { el.indeterminate = true; });
  }

  function applyRoleTabs(role) {
    var ax = root.BoinyaAccess;
    var tabs = (ax.ROLE_TABS[role] || []).slice();
    document.querySelectorAll("[data-tab],[data-tparent]").forEach(function (cb) {
      var tab = cb.getAttribute("data-tab");
      var par = cb.getAttribute("data-tparent");
      if (tab) cb.checked = ax.tabsInclude(tabs, tab);
      if (par) {
        var kids = ax.TAB_TREE[par] || [];
        var on = kids.filter(function (k) { return ax.tabsInclude(tabs, par + "." + k); });
        cb.checked = kids.length && on.length === kids.length;
        cb.indeterminate = on.length > 0 && on.length < kids.length;
      }
    });
  }

  async function setRole(id, role, timezone) {
    var res = await api().apiPost({
      action: "setAccessRole",
      actorId: tid(),
      telegramId: tid(),
      targetId: id,
      role: role,
      timezone: timezone || ""
    });
    sh().toast(res && res.status === "success" ? "Роль сохранена" : ((res && res.message) || "Не сохранилось"));
    await load({ force: true });
    paint();
  }

  function monthPicked(node) {
    if (!node || node.id !== "nxRoleMonth") return false;
    var month = String(node.value || "");
    if (!/^\d{4}-\d{2}$/.test(month)) return true;
    if (roleSetup && roleSetup.month === month && wageKnown) return true;
    rememberWhMsg();
    Promise.all([loadRoles(month), loadWage(month)]).then(function () {
      if (screen !== "staff") return;
      paintStaff();
    });
    return true;
  }

  function onAct(act, node) {
    if (act === "input") {
      if (node && node.id === "whAddr") { scheduleWhAddr(node.value); return true; }
      if (node && node.id === "nxWhMsg") { whMsg = String(node.value || ""); return true; }
      if (monthPicked(node)) return true;
      return false;
    }
    if (act === "change") {
      if (monthPicked(node)) return true;
      return false;
    }
    if (act === "p-reload") { show({ force: true }); return true; }
    if (act === "p-roles-load") {
      var monthEl = document.getElementById("nxRoleMonth");
      var month = monthEl && monthEl.value ? monthEl.value : currentMonthKey();
      rememberWhMsg();
      Promise.all([loadRoles(month), loadWage(month)]).then(function () { if (screen === "staff") paintStaff(); });
      return true;
    }
    if (act === "p-wh-send") { sendWhMsg(); return true; }
    if (act === "p-roles") { saveRoles(); return true; }
    if (act === "wh-add") { openNewWarehouse(); return true; }
    if (act === "wh-save") { saveWarehouse(); return true; }
    if (act === "wh-del") { openDeleteWarehouse(node.getAttribute("data-id")); return true; }
    if (act === "wh-del-yes") { deleteWarehouse(node.getAttribute("data-id")); return true; }
    if (act === "wh-dep") { setDeparture(node.getAttribute("data-id")); return true; }
    if (act === "wh-pick") {
      var row = whSuggest[Number(node.getAttribute("data-i"))];
      var inp = document.getElementById("whAddr");
      if (row && inp) inp.value = row.address || row.title || "";
      if (row && row.lat != null && row.lon != null) {
        var geoInp = document.getElementById("whCoords");
        if (geoInp && !String(geoInp.value || "").trim()) geoInp.value = formatDepotCoords(row.lat, row.lon);
      }
      whSuggest = [];
      paintWhSuggest();
      return true;
    }
    if (act === "p-open") { openPerson(node.getAttribute("data-id")); return true; }
    if (act === "p-approve") {
      var card = node.closest("article");
      var sel = card ? card.querySelector("select") : null;
      setRole(node.getAttribute("data-id"), sel ? sel.value : "manager", "Europe/Minsk");
      return true;
    }
    if (act === "p-deny") {
      var id = node.getAttribute("data-id") || openId;
      setRole(id, "denied", "");
      sh().closeTop("ok");
      return true;
    }
    if (act === "p-touch" || act === "p-tab" || act === "p-notify") {
      if (act === "p-tab") sheetFlags.tabs = true;
      if (act === "p-notify") sheetFlags.notify = true;
      markDirty();
      return true;
    }
    if (act === "p-tab-parent") {
      var par = node.getAttribute("data-tparent");
      var on = !!node.checked;
      node.indeterminate = false;
      document.querySelectorAll('input[data-tkid="' + par + '"]').forEach(function (cb) { cb.checked = on; });
      sheetFlags.tabs = true;
      sheetFlags.tabsReset = false;
      markDirty();
      return true;
    }
    if (act === "p-tabs-reset") {
      var roleNow = document.getElementById("nxRole");
      applyRoleTabs(roleNow ? roleNow.value : "manager");
      sheetFlags.tabs = true;
      sheetFlags.tabsReset = true;
      markDirty();
      return true;
    }
    if (act === "p-notify-reset") {
      var p0 = personById(openId) || {};
      var roleEl0 = document.getElementById("nxRole");
      var role0 = roleEl0 ? roleEl0.value : p0.role;
      var defs = L().NOTIFY_DEFAULTS[role0] || [];
      document.querySelectorAll("[data-nkey]").forEach(function (cb) {
        cb.checked = defs.indexOf(cb.getAttribute("data-nkey")) >= 0;
      });
      sheetFlags.notify = true;
      sheetFlags.notifyReset = true;
      markDirty();
      return true;
    }
    if (act === "p-cancel") { sh().closeTop("ok"); sh().toast("Изменения отменены"); return true; }
    if (act === "p-save") { savePerson(); return true; }
    if (act === "p-resync") {
      api().apiGet({ action: "forceWeekD1Resync", telegramId: tid(), confirm: "1", allowDanger: "1", _: String(Date.now()) }, { timeoutMs: 180000, cacheTtlMs: 0 }).then(function (res) {
        sh().toast(L().peopleToast(res, "синхронизировано"));
      });
      return true;
    }
    return false;
  }

  async function savePerson() {
    var p = personById(openId);
    if (!p) return;
    var roleEl = document.getElementById("nxRole");
    var tzEl = document.getElementById("nxTz");
    var role = roleEl ? roleEl.value : p.role;
    var tz = tzEl ? tzEl.value : (p.timezone || "Europe/Minsk");
    var errs = [];
    if (role !== String(p.role || "")) {
      var r1 = await api().apiPost({ action: "setAccessRole", actorId: tid(), telegramId: tid(), targetId: openId, role: role, timezone: tz });
      if (!r1 || r1.status !== "success") errs.push("роль");
    } else if (tz !== (p.timezone || "Europe/Minsk")) {
      var r2 = await api().apiPost({ action: "setAccessTimezone", actorId: tid(), targetId: openId, timezone: tz });
      if (!r2 || r2.status !== "success") errs.push("пояс");
    }
    if (sheetFlags.tabs) {
      var tabs = "";
      if (!sheetFlags.tabsReset) {
        var boxes = readBoxes("input[data-tab]");
        tabs = L().collectAccessTabs(root.BoinyaAccess.TAB_TREE, boxes).join(",");
      }
      var r3 = await api().apiPost({ action: "setAccessTabs", actorId: tid(), targetId: openId, tabs: tabs });
      if (!r3 || r3.status !== "success") errs.push("вкладки");
    }
    if (sheetFlags.notify) {
      var body = { action: "setAccessNotify", actorId: tid(), targetId: openId };
      if (sheetFlags.notifyReset) body.reset = "1";
      else {
        var defs = (p.notifyDefaults && p.notifyDefaults.length && role === p.role) ? p.notifyDefaults : (L().NOTIFY_DEFAULTS[role] || []);
        var checked = readBoxes("[data-nkey]").filter(function (b) { return b.checked; }).map(function (b) { return b.key; });
        body.notify = L().notifyOverride(defs, checked);
      }
      var r4 = await api().apiPost(body);
      if (!r4 || r4.status !== "success") errs.push("уведомления");
    }
    sh().toast(errs.length ? ("Не всё сохранилось: " + errs.join(", ")) : "Сохранено");
    sh().closeTop("ok");
    await load({ force: true });
    paint();
  }

  root.BoinyaPeople = { show: show, onAct: onAct, parseDepotCoords: parseDepotCoords };
})(window);
