/* Ещё → Доступы. listAccess / setAccessRole / список запланированного — как в старом экране.
   Дерево вкладок сохраняется тем же setAccessTabs. «⏰» — только список, без переключателей. */
(function (root) {
  "use strict";

  var people = [];
  var sched = null;
  var timezones = ["Europe/Minsk"];
  var openId = "";

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
    texts: "Тексты / опросники", ai: "Подбор ИИ", route: "Маршрут / доставлено", assembly: "Сборка / печать",
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

  async function load() {
    var res = await api().apiGet({ action: "listAccess", telegramId: tid(), force: "1", _: String(Date.now()) }, { timeoutMs: 20000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") {
      people = [];
      return res;
    }
    people = res.people || [];
    if (Array.isArray(res.timezones) && res.timezones.length) timezones = res.timezones;
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
    sh().main(html);
  }

  async function show() {
    sh().dock("");
    sh().main(sh().skeleton(4));
    var res = await load();
    if (!res || res.status !== "success") {
      sh().main(sh().errorBox({ title: "Доступы", text: "Только владелец. Если это вы — нажмите «Повторить».", act: "p-reload" }));
      return;
    }
    paint();
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
    await load();
    paint();
  }

  function onAct(act, node) {
    if (act === "p-reload") { show(); return true; }
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
    await load();
    paint();
  }

  root.BoinyaPeople = { show: show, onAct: onAct };
})(window);
