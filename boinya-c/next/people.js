/* Ещё → Доступы. listAccess / setAccessRole / список запланированного — как в старом экране.
   Дерево вкладок сохраняется тем же setAccessTabs. «⏰» — только список, без переключателей. */
(function (root) {
  "use strict";

  var people = [];
  var sched = null;
  var timezones = ["Europe/Minsk"];
  var openId = "";
  var warehouses = [];
  var whDeparture = null;
  var whSuggest = [];
  var whAddrTimer = 0;
  var whAddrSeq = 0;

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
    if (!people.length) {
      sh().main(sh().empty({ icon: "doc", title: "Список пуст", text: "Доступы видит владелец.", action: '<button class="b-btn b-btn--sec" type="button" data-act="p-reload">Обновить список</button>' }));
      return;
    }
    var pending = people.filter(function (p) { return String(p.role) === "pending" || String(p.role) === "none"; });
    var rest = people.filter(function (p) { return pending.indexOf(p) < 0; });
    var html = '<button type="button" class="nx-link" data-act="more-back">← Ещё</button>';
    html += '<button type="button" class="b-btn b-btn--sec" data-act="p-reload">Обновить список</button>';
    html += '<p class="b-lbl">Заявки</p>';
    if (!pending.length) html += '<p class="b-note">Заявок нет.</p>';
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
    html += '<p class="b-lbl">Сотрудники</p><div class="b-list">';
    rest.forEach(function (p) {
      html += '<button type="button" class="b-li" data-act="p-open" data-id="' + esc(p.telegramId) + '"><span class="b-li__body">' +
        '<span class="b-li__title">' + esc(p.name || p.telegramId) + "</span>" +
        '<span class="b-li__sub">' + esc(RU[p.role] || p.role || "") + '</span></span><span class="b-li__chev">›</span></button>';
    });
    html += "</div>";
    html += warehousesHtml();
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
      html += '<article class="nx-depot"><div class="nx-depot__body"><p class="b-li__title" style="margin:0">' + esc(w.name) +
        (dep ? ' <span class="b-pill b-pill--ok">выезд</span>' : "") +
        '</p><p class="b-note">' + esc(w.address) + "</p></div>";
      if (!dep) html += '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="wh-dep" data-id="' + esc(w.id) + '">Выезд</button>';
      html += '<button type="button" class="b-btn b-btn--danger b-btn--sm" data-act="wh-del" data-id="' + esc(w.id) + '">Удалить</button></article>';
    });
    html += '<button type="button" class="b-btn b-btn--sec" data-act="wh-add">+ Склад</button>';
    html += '<p class="b-note">точка выезда курьера: название и адрес, остатки склада не делятся</p>';
    return html;
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

  function openNewWarehouse() {
    whSuggest = [];
    sh().openSheet({
      title: "Новый склад",
      html: '<p class="b-lbl">Название</p><label class="b-field"><input class="b-field__input" id="whName" autocomplete="off"></label>' +
        '<p class="b-lbl">Адрес</p><label class="b-field"><input class="b-field__input" id="whAddr" autocomplete="off"></label>' +
        '<div id="whSuggest"></div>',
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
    if (!name || !address) { sh().toast("Укажите название и адрес"); return; }
    var res = await api().apiPost({ action: "saveWarehouse", name: name, address: address, telegramId: tid() });
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

  async function show(opts) {
    opts = opts || {};
    var force = !!opts.force;
    var gen = ++showGen;
    sh().dock("");
    var painted = false;
    if (!force) {
      var cached = readScreenCache();
      if (cached) {
        people = cached.people;
        if (cached.timezones && cached.timezones.length) timezones = cached.timezones;
        warehouses = cached.warehouses || [];
        whDeparture = cached.departure || whDeparture;
        paint();
        painted = true;
      }
    }
    if (!painted) sh().main(sh().skeleton(6));
    var packed = null;
    try {
      packed = await Promise.all([fetchAccess(force), loadWarehouses(force)]);
    } catch (e) {
      packed = [null, null];
    }
    if (gen !== showGen) return;
    var got = packed[0];
    var res = got && got.res ? got.res : got;
    var background = !!(got && got.background);
    if (force) background = false;
    if (!applyPeople(res)) {
      if (!painted) {
        sh().main(sh().errorBox({ title: "Доступы", text: "Только владелец. Если это вы — нажмите «Повторить».", act: "p-reload" }));
      } else sh().toast("Список не обновился");
      return;
    }
    writeScreenCache();
    paint();
    if (!background) return;
    api().apiGet({ action: "listAccess", telegramId: tid() }, { timeoutMs: 20000, cacheTtlMs: 60000 }).then(function (full) {
      if (gen !== showGen || !applyPeople(full)) return;
      writeScreenCache();
      paint();
    }).catch(function () {});
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

  function onAct(act, node) {
    if (act === "input") {
      if (node && node.id === "whAddr") { scheduleWhAddr(node.value); return true; }
      return false;
    }
    if (act === "p-reload") { show({ force: true }); return true; }
    if (act === "wh-add") { openNewWarehouse(); return true; }
    if (act === "wh-save") { saveWarehouse(); return true; }
    if (act === "wh-del") { openDeleteWarehouse(node.getAttribute("data-id")); return true; }
    if (act === "wh-del-yes") { deleteWarehouse(node.getAttribute("data-id")); return true; }
    if (act === "wh-dep") { setDeparture(node.getAttribute("data-id")); return true; }
    if (act === "wh-pick") {
      var row = whSuggest[Number(node.getAttribute("data-i"))];
      var inp = document.getElementById("whAddr");
      if (row && inp) inp.value = row.address || row.title || "";
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

  root.BoinyaPeople = { show: show, onAct: onAct };
})(window);
