/* Цели. Личные задачи и блок «Общие», показатели с деньгами только у владельца.
   Хранение: D1 через listGoals / saveGoal / deleteGoal (worker), не лист заказов.
   TODO: Помощник по целям — AI helper, не реализован. Экрана нет. */
(function (root) {
  "use strict";

  var access = null;
  var horizon = "day";
  var goals = [];
  var loaded = false;
  var loadError = "";
  var factsReady = false;
  var subscriptions = null;
  var statsCache = Object.create(null);
  var gen = 0;
  var saving = false;
  var draft = blankDraft();
  var filter = "all";
  var staff = [];
  var taskTitle = "";
  var taskPick = "me";
  var taskOwner = "";
  var ASSIGN_ROLES = { owner: 1, manager: 1, all: 1, cutter: 1, courier: 1, logistics: 1 };

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function logic() { return root.BoinyaGoalsLogic; }
  function statsLogic() { return root.BoinyaStatsLogic; }
  function esc(s) { return sh().esc(s); }

  function blankDraft() {
    return { metricId: "turnover", target: "", period: "month", dateFrom: "", dateTo: "" };
  }

  function bind(next) {
    access = next || null;
  }

  function ensureCss() {
    if (document.getElementById("nxGoalsCss")) return;
    var s = document.createElement("style");
    s.id = "nxGoalsCss";
    s.textContent = [
      ".nx-goals__hero{padding:4px 0 8px}",
      ".nx-goals__num{margin:0;text-align:center;font-family:var(--b-display);font-size:var(--b-f28);font-weight:600;line-height:1.1;color:#FF6A1A}",
      ".nx-goals__num--quiet{color:var(--b-text-3);font-family:var(--b-font);font-size:var(--b-f20);font-weight:600}",
      ".nx-goals__cap{margin:4px 0 0;text-align:center;font-size:var(--b-f12);font-weight:500;color:var(--b-text-2)}",
      ".nx-goals__bar{height:6px;border-radius:6px;background:var(--b-surface-2);overflow:hidden;margin:12px 0 0}",
      ".nx-goals__bar>span{display:block;height:100%;background:#FF6A1A}",
      ".nx-goals__row{display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 12px}",
      ".nx-goals__row+.nx-goals__row{border-top:1px solid var(--b-line)}",
      ".nx-goals__text{flex:1;min-width:0;background:transparent;border:0;color:var(--b-text);font:inherit;text-align:left;padding:0;cursor:pointer}",
      ".nx-goals__text--done{color:var(--b-text-3);text-decoration:line-through}",
      ".nx-goals__side{display:flex;gap:8px;flex:none}",
      ".nx-goals__link{background:transparent;border:0;color:var(--b-text-2);font:inherit;font-size:var(--b-f12);padding:8px 0;cursor:pointer}",
      ".nx-goals .b-check--on{background:#FF6A1A;border-color:#FF6A1A;color:#0d0d0f}",
      ".nx-goals__stack{display:flex;flex-direction:column;gap:12px}",
      ".nx-goals__group{margin-top:8px}",
      ".nx-goals__filters{margin:0 0 12px}",
      ".nx-goals .b-lbl{margin-top:20px}"
    ].join("");
    document.head.appendChild(s);
  }

  function isOwner() {
    return !!(access && access.role === "owner");
  }

  function myId() {
    return String((access && access.telegramId) || "");
  }

  function canOpen() {
    if (!access) return false;
    var role = access.role;
    if (role === "partner" || role === "none" || role === "pending" || role === "denied") return false;
    return true;
  }

  function isPersonal(t) {
    return !!(t && t.scope === "person" && t.ownerTgId);
  }

  function tasksOf(id) {
    return goals.filter(function (g) {
      return g && g.kind === "task" && g.horizon === id;
    });
  }

  function byScope(list, mode, tid) {
    return list.filter(function (t) {
      if (mode === "shared") return !isPersonal(t);
      if (mode === "person") return isPersonal(t) && String(t.ownerTgId) === String(tid || "");
      return true;
    });
  }

  function visibleToMe(list) {
    return list.filter(function (t) {
      if (!isPersonal(t)) return true;
      if (isOwner()) return true;
      return String(t.ownerTgId) === myId();
    });
  }

  function shownTasks(list) {
    var base = visibleToMe(list);
    if (!isOwner() || filter === "all") return base;
    if (filter === "shared") return byScope(base, "shared");
    return byScope(base, "person", filter);
  }

  function personLabel(tid) {
    if (String(tid || "") === myId()) return "Мои";
    var i;
    for (i = 0; i < staff.length; i++) {
      if (String(staff[i].telegramId) === String(tid)) return staff[i].name || "Сотрудник";
    }
    return "Сотрудник";
  }

  function boundsFor(goal, now) {
    var L = logic();
    return L.periodBounds(goal.period, now || new Date(), goal.dateFrom, goal.dateTo);
  }

  function snapFor(bounds) {
    var key = bounds && bounds.ok ? bounds.from + "|" + bounds.to : "";
    return {
      stats: key ? statsCache[key] : null,
      subscriptions: subscriptions,
      from: bounds ? bounds.from : "",
      to: bounds ? bounds.to : ""
    };
  }

  function readingFor(goal) {
    var bounds = boundsFor(goal);
    return logic().evaluateMetric(goal.metricId, snapFor(bounds), goal.target, statsLogic());
  }

  function fmtNum(metricId, n) {
    if (n == null || !isFinite(Number(n))) return "";
    if (metricId === "turnover" || metricId === "income") return sh().money(n);
    if (metricId === "kg") {
      var kg = Math.round(Number(n) * 10) / 10;
      return String(kg).replace(".", ",");
    }
    return String(Math.round(Number(n)));
  }

  function fmtDate(iso) {
    var p = String(iso || "").slice(0, 10).split("-");
    if (p.length < 3 || p[0].length !== 4) return "";
    return p[2] + "." + p[1] + "." + p[0];
  }

  function periodLabel(goal) {
    var L = logic();
    if (goal.period === "custom") {
      var a = fmtDate(goal.dateFrom);
      var b = fmtDate(goal.dateTo);
      if (a && b) return "с " + a + " по " + b;
    }
    for (var i = 0; i < L.PERIODS.length; i++) {
      if (L.PERIODS[i].id === goal.period) return L.PERIODS[i].label;
    }
    return "";
  }

  function checkSvg() {
    return '<svg class="b-ico b-ico--18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';
  }

  function segBar() {
    var L = logic();
    var extra = isOwner()
      ? '<button type="button" class="b-seg__item' + (horizon === "spend" ? " b-seg__item--on" : "") + '" data-act="gl-horizon" data-h="spend">Расходы</button>'
      : "";
    return '<div class="b-seg" style="margin-bottom:16px">' + L.HORIZONS.map(function (h) {
      return '<button type="button" class="b-seg__item' + (h.id === horizon ? " b-seg__item--on" : "") + '" data-act="gl-horizon" data-h="' + h.id + '">' + esc(h.label) + "</button>";
    }).join("") + extra + "</div>";
  }

  function taskRow(t) {
    var done = !!t.done;
    return '<div class="nx-goals__row">' +
      '<button type="button" class="b-check' + (done ? " b-check--on" : "") + '" data-act="gl-check" data-id="' + esc(t.id) + '" aria-pressed="' + (done ? "true" : "false") + '" aria-label="' + (done ? "Снять отметку" : "Отметить") + '">' +
      (done ? checkSvg() : "") + "</button>" +
      '<button type="button" class="nx-goals__text' + (done ? " nx-goals__text--done" : "") + '" data-act="gl-edit" data-id="' + esc(t.id) + '">' + esc(t.title) + "</button>" +
      '<button type="button" class="nx-goals__link" data-act="gl-del" data-id="' + esc(t.id) + '">Удалить</button>' +
      "</div>";
  }

  function rowsHtml(list) {
    if (!list.length) return '<div class="b-list"><p class="b-note" style="padding:12px 16px">Задач нет</p></div>';
    return '<div class="b-list">' + list.map(taskRow).join("") + "</div>";
  }

  function block(title, list, keep) {
    if (!list.length && !keep) return "";
    return '<section class="nx-goals__group"><p class="b-lbl">' + esc(title) + "</p>" + rowsHtml(list) + "</section>";
  }

  function heroHtml(list) {
    var pct = logic().taskPct(list);
    var cap = pct.total ? (pct.done + " из " + pct.total) : "нет задач";
    return '<article class="b-card"><div class="nx-goals__hero">' +
      '<p class="nx-goals__num">' + pct.pct + "%</p>" +
      '<p class="nx-goals__cap">выполнено, ' + esc(cap) + "</p>" +
      '<div class="nx-goals__bar" aria-hidden="true"><span style="width:' + pct.pct + '%"></span></div>' +
      "</div></article>";
  }

  function filterBar() {
    if (!isOwner()) return "";
    function chip(id, label) {
      var on = filter === id;
      return '<button type="button" class="b-chip' + (on ? " b-chip--on" : "") + '" data-act="gl-filter" data-f="' + esc(id) + '">' + esc(label) + "</button>";
    }
    var html = chip("all", "Все") + chip("shared", "Общие") + chip(myId() || "mine", "Мои");
    var seen = {};
    if (myId()) seen[myId()] = 1;
    seen.all = 1;
    seen.shared = 1;
    staff.forEach(function (p) {
      var id = String(p.telegramId || "");
      if (!id || seen[id]) return;
      seen[id] = 1;
      html += chip(id, p.name || "Сотрудник");
    });
    goals.forEach(function (g) {
      if (!isPersonal(g) || seen[g.ownerTgId]) return;
      seen[g.ownerTgId] = 1;
      html += chip(String(g.ownerTgId), personLabel(g.ownerTgId));
    });
    return '<div class="b-pills nx-goals__filters">' + html + "</div>";
  }

  function taskBlock() {
    var all = tasksOf(horizon);
    var shown = shownTasks(all);
    var html = heroHtml(shown);
    if (!isOwner()) {
      html += block("Общие", byScope(all, "shared"), true);
      html += block("Мои", byScope(all, "person", myId()), true);
    } else if (filter === "shared") {
      html += block("Общие", byScope(all, "shared"), true);
    } else if (filter !== "all") {
      html += block(personLabel(filter), byScope(all, "person", filter), true);
    } else {
      html += block("Общие", byScope(all, "shared"), true);
      html += block("Мои", byScope(all, "person", myId()), true);
      var seen = {};
      if (myId()) seen[myId()] = 1;
      var ids = [];
      all.forEach(function (t) {
        if (!isPersonal(t) || seen[t.ownerTgId]) return;
        seen[t.ownerTgId] = 1;
        ids.push(String(t.ownerTgId));
      });
      ids.forEach(function (id) {
        html += block(personLabel(id), byScope(all, "person", id), true);
      });
    }
    html += '<button type="button" class="b-btn b-btn--main" style="margin-top:16px" data-act="gl-add-task">Добавить задачу</button>';
    return html;
  }

  function metricCard(goal) {
    var reading = factsReady ? readingFor(goal) : null;
    var label = (reading && reading.label) || goal.title || goal.metricId;
    var unit = reading && reading.unit ? (" " + reading.unit) : "";
    var num = "Считаю";
    var quiet = true;
    var cap = "цель " + fmtNum(goal.metricId, goal.target) + unit;
    var bar = 0;
    var doneLine = "";
    if (factsReady && reading) {
      if (reading.status !== "ok") {
        num = "нет данных";
        cap = periodLabel(goal) ? (cap + ", " + periodLabel(goal)) : cap;
      } else {
        quiet = false;
        num = fmtNum(goal.metricId, reading.current) + unit;
        var pct = reading.pct == null ? 0 : reading.pct;
        bar = pct;
        cap = fmtNum(goal.metricId, reading.current) + " из " + fmtNum(goal.metricId, goal.target) + unit + ", " + pct + "%";
        if (periodLabel(goal)) cap += ", " + periodLabel(goal);
      }
    }
    if (goal.done && goal.doneAt) doneLine = '<p class="nx-goals__cap">Закрыта ' + esc(fmtDate(goal.doneAt)) + "</p>";
    else if (goal.done) doneLine = '<p class="nx-goals__cap">Закрыта</p>';
    return '<article class="b-card" data-goal="' + esc(goal.id) + '">' +
      '<p class="nx-goals__cap">' + esc(label) + "</p>" +
      '<p class="nx-goals__num' + (quiet ? " nx-goals__num--quiet" : "") + '">' + esc(num) + "</p>" +
      '<p class="nx-goals__cap">' + esc(cap) + "</p>" +
      '<div class="nx-goals__bar" aria-hidden="true"><span style="width:' + bar + '%"></span></div>' +
      doneLine +
      '<button type="button" class="nx-goals__link" data-act="gl-del" data-id="' + esc(goal.id) + '">Удалить</button>' +
      "</article>";
  }

  function reportBlock() {
    if (!isOwner() || !factsReady) return "";
    var month = logic().periodBounds("month", new Date());
    var missing = logic().unavailableReport(snapFor(month), statsLogic());
    if (!missing.length) return "";
    return '<section class="nx-goals__group"><p class="b-lbl">Нет данных</p><div class="b-list">' +
      missing.map(function (m) {
        return '<div class="nx-goals__row"><span class="nx-goals__text" style="cursor:default">' + esc(m.label) + '</span><span class="b-note">нет данных</span></div>';
      }).join("") + "</div></section>";
  }

  function metricBlock() {
    if (!isOwner()) return "";
    var list = goals.filter(function (g) { return g && g.kind === "metric"; });
    var html = '<section class="nx-goals__group"><p class="b-lbl">Показатели</p>';
    if (!list.length) html += '<p class="b-note">Показателей пока нет</p>';
    else html += '<div class="nx-goals__stack">' + list.map(metricCard).join("") + "</div>";
    html += '<button type="button" class="b-btn b-btn--sec" style="margin-top:12px" data-act="gl-add-metric">Добавить показатель</button></section>';
    return html;
  }

  function paint() {
    ensureCss();
    sh().dock("");
    if (horizon === "spend" && isOwner()) {
      sh().main('<div class="nx-goals" id="goalsRoot">' + segBar() + '<div id="expRoot"></div></div>');
      if (root.BoinyaExpenses) {
        root.BoinyaExpenses.bind(access);
        root.BoinyaExpenses.showInto();
      }
      return;
    }
    if (!loaded && !loadError) {
      sh().main('<div class="nx-goals" id="goalsRoot">' + segBar() + sh().skeleton(4) + "</div>");
      return;
    }
    if (loadError && !goals.length) {
      sh().main('<div class="nx-goals" id="goalsRoot">' + segBar() +
        sh().errorBox({ title: "Не удалось загрузить цели", text: loadError, act: "gl-retry" }) + "</div>");
      return;
    }
    sh().main('<div class="nx-goals" id="goalsRoot">' + segBar() + filterBar() + taskBlock() + metricBlock() + reportBlock() + "</div>");
  }

  function findGoal(id) {
    for (var i = 0; i < goals.length; i++) {
      if (goals[i].id === id) return goals[i];
    }
    return null;
  }

  function replaceLocal(goal) {
    if (!goal) return;
    for (var i = 0; i < goals.length; i++) {
      if (goals[i].id === goal.id) {
        goals[i] = goal;
        return;
      }
    }
    goals.push(goal);
  }

  async function persist(goal) {
    var res = await api().apiPost({
      action: "saveGoal",
      id: goal.id,
      kind: goal.kind,
      horizon: goal.horizon || "",
      title: goal.title || "",
      done: goal.done ? "1" : "0",
      doneAt: goal.doneAt || "",
      metricId: goal.metricId || "",
      target: goal.target == null ? "" : String(goal.target),
      period: goal.period || "",
      dateFrom: goal.dateFrom || "",
      dateTo: goal.dateTo || "",
      scope: goal.kind === "metric" ? "" : (goal.scope || "shared"),
      ownerTgId: goal.kind === "metric" ? "" : (goal.ownerTgId || "")
    });
    if (!res || res.status !== "success" || !res.goal) return null;
    return res.goal;
  }

  async function loadStaff() {
    staff = [];
    if (!isOwner()) return;
    var res = null;
    try {
      res = await api().apiGet({ action: "listAccess", _: String(Date.now()) }, { timeoutMs: 15000, cacheTtlMs: 0 });
    } catch (e) {
      res = null;
    }
    var people = res && Array.isArray(res.people) ? res.people : [];
    people.forEach(function (p) {
      var role = String((p && p.role) || "").toLowerCase();
      var id = String((p && p.telegramId) || "");
      if (!id || id === myId() || !ASSIGN_ROLES[role]) return;
      staff.push({ telegramId: id, name: String(p.name || "Сотрудник"), role: role });
    });
  }

  async function load(ticket) {
    loadError = "";
    var staffJob = loadStaff();
    var res = null;
    try {
      res = await api().apiGet({ action: "listGoals", _: String(Date.now()) }, { timeoutMs: 20000, cacheTtlMs: 0 });
    } catch (e) {
      res = null;
    }
    await staffJob;
    if (ticket !== gen) return;
    if (!res || res.status !== "success" || !Array.isArray(res.goals)) {
      loadError = (res && res.message) || "Нет связи с сервером";
      loaded = true;
      paint();
      return;
    }
    goals = res.goals;
    loaded = true;
    factsReady = false;
    paint();
    await loadFacts(ticket);
  }

  async function loadFacts(ticket) {
    if (!isOwner()) return;
    var periods = Object.create(null);
    var month = logic().periodBounds("month", new Date());
    periods[month.from + "|" + month.to] = month;
    goals.forEach(function (g) {
      if (!g || g.kind !== "metric") return;
      var b = boundsFor(g);
      if (b.ok) periods[b.from + "|" + b.to] = b;
    });
    var subsRes = null;
    try {
      subsRes = await api().apiGet({ action: "listSubscriptions", sheet: "ПП", _: String(Date.now()) }, { timeoutMs: 25000, cacheTtlMs: 0 });
    } catch (eS) {
      subsRes = null;
    }
    if (ticket !== gen) return;
    subscriptions = subsRes && subsRes.status === "success" && Array.isArray(subsRes.subscriptions) ? subsRes.subscriptions : null;
    var keys = Object.keys(periods);
    var nextCache = Object.create(null);
    for (var i = 0; i < keys.length; i++) {
      var b = periods[keys[i]];
      var statsRes = null;
      try {
        statsRes = await api().apiGet({
          action: "getStats",
          mode: "expected",
          dateFrom: b.from,
          dateTo: b.to,
          force: "1",
          _: String(Date.now())
        }, { timeoutMs: 45000, cacheTtlMs: 0 });
      } catch (eSt) {
        statsRes = null;
      }
      if (ticket !== gen) return;
      nextCache[keys[i]] = statsRes && statsRes.status === "success" ? statsRes : null;
    }
    statsCache = nextCache;
    factsReady = true;
    var today = logic().periodBounds("day", new Date()).from;
    var pending = [];
    goals.forEach(function (g, idx) {
      if (!g || g.kind !== "metric" || g.done) return;
      var next = logic().applyAutoComplete(g, readingFor(g), today);
      if (!next.changed) return;
      goals[idx] = next.goal;
      pending.push(next.goal);
    });
    paint();
    var closed = 0;
    for (var p = 0; p < pending.length; p++) {
      var saved = await persist(pending[p]);
      if (ticket !== gen) return;
      if (saved) {
        replaceLocal(saved);
        closed++;
      }
    }
    if (closed) {
      paint();
      sh().toast(closed > 1 ? "Цели закрыты" : "Цель закрыта");
    }
  }

  function show() {
    if (!canOpen()) return;
    filter = "all";
    ensureCss();
    var ticket = ++gen;
    loaded = false;
    factsReady = false;
    loadError = "";
    paint();
    load(ticket);
  }

  function readDraftDom() {
    var t = document.getElementById("glTarget");
    if (t) draft.target = t.value;
    var f = document.getElementById("glFrom");
    var to = document.getElementById("glTo");
    if (f) draft.dateFrom = f.value;
    if (to) draft.dateTo = to.value;
  }

  function metricSheetHtml() {
    var L = logic();
    var chips = L.METRICS.map(function (m) {
      return '<button type="button" class="b-chip' + (draft.metricId === m.id ? " b-chip--on" : "") + '" data-act="gl-pick" data-m="' + m.id + '">' + esc(m.label) + "</button>";
    }).join("");
    var periods = L.PERIODS.map(function (p) {
      return '<button type="button" class="b-chip' + (draft.period === p.id ? " b-chip--on" : "") + '" data-act="gl-period" data-p="' + p.id + '">' + esc(p.label) + "</button>";
    }).join("");
    var dates = "";
    if (draft.period === "custom") {
      dates = '<div class="nx-pair" style="margin-top:8px">' +
        '<label class="b-field"><input class="b-field__input" id="glFrom" type="date" value="' + esc(draft.dateFrom) + '"></label>' +
        '<label class="b-field"><input class="b-field__input" id="glTo" type="date" value="' + esc(draft.dateTo) + '"></label>' +
        "</div>";
    }
    return '<p class="b-lbl" style="margin-top:0">Показатель</p><div class="b-pills">' + chips + "</div>" +
      '<p class="b-lbl">Цель</p>' +
      '<label class="b-field"><input class="b-field__input" id="glTarget" inputmode="decimal" value="' + esc(draft.target) + '" placeholder="Число"></label>' +
      '<p class="b-lbl">Период</p><div class="b-pills">' + periods + "</div>" +
      dates +
      '<button type="button" class="b-btn b-btn--main" style="margin-top:16px" data-act="gl-metric-save">Создать</button>';
  }

  function openMetric() {
    draft = blankDraft();
    sh().openSheet({ title: "Новый показатель", html: metricSheetHtml() });
  }

  function refreshMetricSheet() {
    sh().replaceTop({ title: "Новый показатель", html: metricSheetHtml() });
  }

  function readTaskTitle() {
    var el = document.getElementById("glTaskTitle");
    if (el) taskTitle = el.value;
  }

  function scopeChip(id, label, on, ownerId) {
    return '<button type="button" class="b-chip' + (on ? " b-chip--on" : "") + '" data-act="gl-scope" data-s="' + esc(id) + '"' +
      (ownerId ? ' data-id="' + esc(ownerId) + '"' : "") + ">" + esc(label) + "</button>";
  }

  function taskSheetHtml() {
    var chips = scopeChip("me", "Мне", taskPick === "me", "") +
      scopeChip("shared", "Общая", taskPick === "shared", "");
    if (isOwner()) {
      staff.forEach(function (p) {
        var on = taskPick === "person" && taskOwner === p.telegramId;
        chips += scopeChip("person", p.name || "Сотрудник", on, p.telegramId);
      });
    }
    return '<p class="b-lbl" style="margin-top:0">Задача</p>' +
      '<label class="b-field"><input class="b-field__input" id="glTaskTitle" value="' + esc(taskTitle) + '" placeholder="Что сделать"></label>' +
      '<p class="b-lbl">Кому</p><div class="b-pills">' + chips + "</div>" +
      '<button type="button" class="b-btn b-btn--main" style="margin-top:16px" data-act="gl-task-save">Добавить</button>';
  }

  function openTask() {
    taskTitle = "";
    taskPick = "me";
    taskOwner = "";
    sh().openSheet({ title: "Новая задача", html: taskSheetHtml() });
  }

  function refreshTaskSheet() {
    sh().replaceTop({ title: "Новая задача", html: taskSheetHtml() });
  }

  async function saveTask() {
    readTaskTitle();
    var title = String(taskTitle || "").trim();
    if (!title) {
      sh().toast("Напишите задачу");
      return;
    }
    if (taskPick === "person" && !taskOwner) {
      sh().toast("Выберите сотрудника");
      return;
    }
    if (saving) return;
    saving = true;
    var scope = "shared";
    var ownerTgId = "";
    if (taskPick === "me") {
      scope = "person";
      ownerTgId = myId();
    } else if (taskPick === "person") {
      scope = "person";
      ownerTgId = taskOwner;
    }
    var goal = {
      id: "g" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      kind: "task",
      horizon: horizon,
      title: title.slice(0, 240),
      done: false,
      doneAt: "",
      scope: scope,
      ownerTgId: ownerTgId
    };
    var saved = await persist(goal);
    saving = false;
    if (!saved) {
      sh().toast("Не удалось сохранить");
      return;
    }
    sh().closeTop("ok");
    replaceLocal(saved);
    paint();
    sh().toast("Задача добавлена");
  }

  async function saveMetric() {
    readDraftDom();
    var def = logic().metricById(draft.metricId);
    if (!def) return;
    var raw = String(draft.target || "").replace(",", ".").trim();
    var target = Number(raw);
    if (!(target > 0)) {
      sh().toast("Укажите цель больше нуля");
      return;
    }
    var bounds = logic().periodBounds(draft.period, new Date(), draft.dateFrom, draft.dateTo);
    if (!bounds.ok) {
      sh().toast("Укажите даты");
      return;
    }
    if (saving) return;
    saving = true;
    var goal = {
      id: "g" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      kind: "metric",
      title: def.label,
      metricId: def.id,
      target: target,
      period: draft.period,
      dateFrom: bounds.from,
      dateTo: bounds.to,
      done: false,
      doneAt: ""
    };
    var saved = await persist(goal);
    saving = false;
    if (!saved) {
      sh().toast("Не удалось сохранить");
      return;
    }
    sh().closeTop("ok");
    replaceLocal(saved);
    factsReady = false;
    paint();
    var ticket = gen;
    await loadFacts(ticket);
  }

  async function toggleTask(id) {
    var goal = findGoal(id);
    if (!goal || goal.kind !== "task" || saving) return;
    var today = logic().periodBounds("day", new Date()).from;
    var next = Object.assign({}, goal, {
      done: !goal.done,
      doneAt: goal.done ? "" : today
    });
    saving = true;
    var saved = await persist(next);
    saving = false;
    if (!saved) {
      sh().toast("Не удалось сохранить");
      return;
    }
    replaceLocal(saved);
    paint();
  }

  async function editTask(id) {
    var goal = findGoal(id);
    if (!goal || goal.kind !== "task") return;
    var text = await sh().prompt({
      title: "Текст задачи",
      text: "Новая формулировка",
      ok: "Сохранить",
      value: goal.title
    });
    if (text == null) return;
    var title = String(text).trim();
    if (!title || title === goal.title) return;
    if (saving) return;
    saving = true;
    var saved = await persist(Object.assign({}, goal, { title: title.slice(0, 240) }));
    saving = false;
    if (!saved) {
      sh().toast("Не удалось сохранить");
      return;
    }
    replaceLocal(saved);
    paint();
  }

  async function removeGoal(id) {
    var goal = findGoal(id);
    if (!goal) return;
    var ok = await sh().confirm({
      title: "Удалить",
      text: goal.kind === "task" ? "Удалить эту задачу?" : "Удалить этот показатель?",
      ok: "Удалить",
      danger: true
    });
    if (!ok) return;
    var res = await api().apiPost({ action: "deleteGoal", id: id });
    if (!res || res.status !== "success") {
      sh().toast("Не удалось удалить");
      return;
    }
    goals = goals.filter(function (g) { return g.id !== id; });
    paint();
    sh().toast("Удалено");
  }

  function onAct(act, node) {
    if (!act || act.indexOf("gl-") !== 0) return false;
    if (act === "gl-horizon") {
      horizon = node.getAttribute("data-h") || "day";
      sh().resetScroll();
      paint();
      return true;
    }
    if (act === "gl-retry") {
      show();
      return true;
    }
    if (act === "gl-add-task") {
      openTask();
      return true;
    }
    if (act === "gl-filter") {
      filter = node.getAttribute("data-f") || "all";
      sh().resetScroll();
      paint();
      return true;
    }
    if (act === "gl-scope") {
      readTaskTitle();
      taskPick = node.getAttribute("data-s") || "me";
      taskOwner = node.getAttribute("data-id") || "";
      refreshTaskSheet();
      return true;
    }
    if (act === "gl-task-save") {
      saveTask();
      return true;
    }
    if (act === "gl-add-metric") {
      openMetric();
      return true;
    }
    if (act === "gl-pick") {
      readDraftDom();
      draft.metricId = node.getAttribute("data-m") || draft.metricId;
      refreshMetricSheet();
      return true;
    }
    if (act === "gl-period") {
      readDraftDom();
      draft.period = node.getAttribute("data-p") || draft.period;
      refreshMetricSheet();
      return true;
    }
    if (act === "gl-metric-save") {
      saveMetric();
      return true;
    }
    if (act === "gl-check") {
      toggleTask(node.getAttribute("data-id"));
      return true;
    }
    if (act === "gl-edit") {
      editTask(node.getAttribute("data-id"));
      return true;
    }
    if (act === "gl-del") {
      removeGoal(node.getAttribute("data-id"));
      return true;
    }
    return false;
  }

  root.BoinyaGoals = {
    bind: bind,
    show: show,
    onAct: onAct
  };
})(window);
