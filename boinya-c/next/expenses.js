/* Расходы владельца. Журнал в D1, статистика только читает. */
(function (root) {
  "use strict";

  var CATS = [
    ["light", "Свет"],
    ["rent", "Аренда помещения"],
    ["raw", "Сырьё"],
    ["pack", "Пакеты/упаковка"],
    ["wage", "Зарплаты"],
    ["fuel", "Заправки"],
    ["amort", "Амортизация"],
    ["coupon", "Купоны"],
    ["tool", "Инструмент"],
    ["smm", "SMM"],
    ["other", "Прочее"]
  ];

  var access = null;
  var monthKey = "";
  var pack = null;
  var draft = blank();

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function statsLogic() { return root.BoinyaStatsLogic; }
  function esc(s) { return sh().esc(s); }

  function blank() {
    return { date: "", amount: "", category: "light", comment: "", object: "" };
  }

  function catName(id) {
    var i;
    for (i = 0; i < CATS.length; i++) if (CATS[i][0] === id) return CATS[i][1];
    return id || "Статья";
  }

  function bind(next) { access = next || null; }

  function ensureMonth() {
    if (!/^\d{4}-\d{2}$/.test(monthKey) && statsLogic()) monthKey = statsLogic().currentStatsMonthKey_();
    return monthKey;
  }

  function shiftMonth(delta) {
    var step = statsLogic().shiftStatsMonthKey_(ensureMonth(), delta, new Date());
    if (!step.ok) { sh().toast(step.toast); return; }
    monthKey = step.next;
    showInto();
  }

  async function pull(month, force) {
    try {
      return await api().apiGet({
        action: "listOwnerExpenses",
        month: month
      }, { timeoutMs: 20000, cacheTtlMs: force ? 0 : 60000 });
    } catch (e) { return null; }
  }

  function journalRow(row) {
    var who = row.actorName ? row.actorName : "владелец";
    var extra = row.personal ? " Личное" : "";
    var obj = row.object ? ", " + row.object : "";
    var comment = row.comment ? " " + row.comment : "";
    return '<div class="nx-line"><span>' + esc(row.date + " " + catName(row.category) + obj + comment + extra) +
      '</span><b class="nx-stat__num">' + esc(sh().money(row.amount)) + "</b></div>" +
      '<p class="b-note">Внёс ' + esc(who) +
      ' <button type="button" class="nx-link" data-act="ex-del" data-id="' + esc(row.id) + '">Удалить</button></p>';
  }

  function html() {
    var title = statsLogic().statsMonthLabelRu_(ensureMonth());
    var rows = (pack && pack.expenses) || [];
    var body = "";
    if (!rows.length) body = '<p class="b-note">За этот месяц записей нет</p>';
    else {
      var i;
      for (i = 0; i < rows.length; i++) body += journalRow(rows[i]);
    }
    return '<div class="nx-goals__slice">' +
      '<div class="nx-cut-head" style="justify-content:space-between">' +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ex-prev" aria-label="Предыдущий месяц">‹</button>' +
        '<b>' + esc(title) + "</b>" +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ex-next" aria-label="Следующий месяц">›</button>' +
      "</div>" +
      '<p class="b-note">Расходы проекта. Личное в статистику не идёт.</p>' +
      body +
      '<button type="button" class="nx-link" data-act="ex-add">Добавить расход</button>' +
      "</div>";
  }

  var lastHtml = "";
  var pullFlight = null;
  var pullFlightMonth = "";

  function paint() {
    var box = document.getElementById("expRoot");
    if (!box) return;
    var next = html();
    var month = ensureMonth();
    if (next === lastHtml && box.getAttribute("data-month") === month) return;
    var main = document.getElementById("nxMain");
    var y = main ? main.scrollTop : 0;
    box.innerHTML = next;
    box.setAttribute("data-month", month);
    lastHtml = next;
    if (main && y) main.scrollTop = y;
  }

  async function showInto(opts) {
    opts = opts || {};
    ensureMonth();
    var month = ensureMonth();
    var box = document.getElementById("expRoot");
    var same = box && box.getAttribute("data-month") === month && pack && !opts.force;
    if (box && !same && !pack) {
      box.innerHTML = '<p class="b-note">Считаю расходы…</p>';
      lastHtml = "";
    }
    if (pack && box && !opts.force) paint();
    if (pullFlight && pullFlightMonth === month && !opts.force) {
      await pullFlight;
    } else {
      pullFlightMonth = month;
      var job = (async function () {
        var got = await pull(month, !!opts.force);
        if (got) pack = got;
      })();
      pullFlight = job;
      try { await job; } finally {
        if (pullFlight === job) pullFlight = null;
      }
    }
    if (!document.getElementById("expRoot")) return;
    paint();
  }

  function sheetHtml() {
    var chips = CATS.map(function (c) {
      return '<button type="button" class="b-chip' + (draft.category === c[0] ? " b-chip--on" : "") + '" data-act="ex-cat" data-c="' + esc(c[0]) + '">' + esc(c[1]) + "</button>";
    }).join("");
    var object = draft.category === "amort"
      ? '<p class="b-lbl">Объект</p><label class="b-field"><input class="b-field__input" id="exObject" value="' + esc(draft.object) + '" placeholder="авто"></label>'
      : "";
    return '<p class="b-lbl" style="margin-top:0">Дата</p><label class="b-field"><input class="b-field__input" id="exDate" type="date" value="' + esc(draft.date) + '"></label>' +
      '<p class="b-lbl">Сумма</p><label class="b-field"><input class="b-field__input" id="exAmount" inputmode="decimal" value="' + esc(draft.amount) + '" placeholder="0,00"></label>' +
      '<p class="b-lbl">Категория</p><div class="b-pills">' + chips + "</div>" +
      object +
      '<p class="b-lbl">Комментарий</p><label class="b-field"><input class="b-field__input" id="exComment" value="' + esc(draft.comment) + '"></label>' +
      '<p class="b-note">С кармана проекта или личное?</p>' +
      '<div class="nx-actions" style="margin-top:8px">' +
        '<button type="button" class="b-btn b-btn--main" data-act="ex-save" data-personal="0">Карман проекта</button>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="ex-save" data-personal="1">Личное</button>' +
      "</div>";
  }

  function readDraft() {
    var d = document.getElementById("exDate");
    var a = document.getElementById("exAmount");
    var c = document.getElementById("exComment");
    var o = document.getElementById("exObject");
    if (d) draft.date = d.value;
    if (a) draft.amount = a.value;
    if (c) draft.comment = c.value;
    if (o) draft.object = o.value;
  }

  function openAdd() {
    var today = new Date();
    var m = today.getMonth() + 1;
    var day = today.getDate();
    draft = blank();
    draft.date = today.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
    sh().openSheet({ title: "Новый расход", id: "expense-add", html: sheetHtml() });
  }

  async function save(personal) {
    readDraft();
    var amount = String(draft.amount || "").replace(",", ".").trim();
    if (!draft.date || !(Number(amount) > 0)) {
      sh().toast("Нужны дата и сумма");
      return;
    }
    var prevPack = pack;
    var optimistic = {
      id: "tmp_" + Date.now(),
      date: draft.date,
      amount: amount,
      category: draft.category,
      comment: draft.comment || "",
      object: draft.object || "",
      personal: !!personal,
      actorName: (access && access.name) || ""
    };
    pack = Object.assign({}, pack || { expenses: [] }, {
      expenses: ((pack && pack.expenses) || []).concat([optimistic])
    });
    lastHtml = "";
    paint();
    var res = null;
    try {
      res = await api().apiPost({
        action: "saveOwnerExpense",
        date: draft.date,
        amount: amount,
        category: draft.category,
        comment: draft.comment || "",
        object: draft.object || "",
        personal: personal ? "1" : "0",
        actorName: (access && access.name) || ""
      });
    } catch (e) { res = null; }
    if (!res || res.status !== "success") {
      pack = prevPack;
      lastHtml = "";
      paint();
      sh().toast("Не закрепилось, вернул как было");
      return;
    }
    sh().closeAll();
    monthKey = draft.date.slice(0, 7);
    pack = res;
    lastHtml = "";
    showInto({ force: true });
    sh().toast(personal ? "Личное записано" : "Расход записан");
  }

  async function remove(id) {
    var ok = await sh().confirm({ title: "Удалить расход", text: "Убрать эту строку из журнала?", ok: "Удалить", danger: true });
    if (!ok) return;
    var prevPack = pack;
    if (pack && pack.expenses) {
      pack = Object.assign({}, pack, {
        expenses: pack.expenses.filter(function (row) { return String(row.id) !== String(id); })
      });
      lastHtml = "";
      paint();
    }
    var res = null;
    try { res = await api().apiPost({ action: "deleteOwnerExpense", id: id }); } catch (e) { res = null; }
    if (!res || res.status !== "success") {
      pack = prevPack;
      lastHtml = "";
      paint();
      sh().toast("Не закрепилось, вернул как было");
      return;
    }
    pack = res;
    paint();
  }

  function prevMonthKey(now) {
    var d = now || new Date();
    var y = d.getFullYear();
    var m = d.getMonth();
    if (m === 0) return (y - 1) + "-12";
    return y + "-" + (m < 10 ? "0" : "") + m;
  }

  var lightMonth = null;
  var lightAt = 0;

  function paintLightCard() {
    var box = document.getElementById("nxLightCard");
    if (!box) return;
    if (!lightMonth) {
      box.innerHTML = "";
      return;
    }
    var label = statsLogic().statsMonthLabelRu_(lightMonth);
    box.innerHTML = '<button type="button" class="b-card" data-act="ex-light-open" data-month="' + esc(lightMonth) + '" style="width:100%;text-align:left;margin:0 0 12px">' +
      "<b>Внести свет за " + esc(label) + "</b>" +
      '<p class="b-note" style="margin:6px 0 0">Нажмите, когда будет сумма</p></button>';
  }

  function openLight(month) {
    if (!month) return;
    var label = statsLogic().statsMonthLabelRu_(month);
    sh().openSheet({
      title: "Свет",
      id: "expense-light",
      html: '<p class="b-note">Сколько ушло на свет за ' + esc(label) + '?</p>' +
        '<label class="b-field"><input class="b-field__input" id="exLightAmount" inputmode="decimal" placeholder="Сумма"></label>' +
        '<button type="button" class="b-btn b-btn--main" style="margin-top:12px" data-act="ex-light" data-month="' + esc(month) + '">Записать в расходы</button>'
    });
  }

  async function refreshLightCard() {
    return;
  }

  async function remindLight() {
    return refreshLightCard();
  }

  async function saveLight(month) {
    var el = document.getElementById("exLightAmount");
    var amount = String((el && el.value) || "").replace(",", ".").trim();
    if (!(Number(amount) > 0)) { sh().toast("Нужна сумма"); return; }
    var date = month + "-28";
    try {
      var end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
      date = month + "-" + (end < 10 ? "0" : "") + end;
    } catch (eD) {}
    var res = null;
    try {
      res = await api().apiPost({
        action: "saveOwnerExpense",
        date: date,
        amount: amount,
        category: "light",
        comment: "Свет",
        personal: "0",
        actorName: (access && access.name) || ""
      });
    } catch (e) { res = null; }
    if (!res || res.status !== "success") { sh().toast("Не записалось"); return; }
    if (lightMonth === month) {
      lightMonth = "";
      lightAt = Date.now();
      paintLightCard();
    }
    sh().closeAll();
    sh().toast("Свет записан");
    if (monthKey === month && document.getElementById("expRoot")) {
      pack = res;
      paint();
    }
  }

  function onAct(act, node) {
    if (!act || act.indexOf("ex-") !== 0) return false;
    if (act === "ex-prev") { shiftMonth(-1); return true; }
    if (act === "ex-next") { shiftMonth(1); return true; }
    if (act === "ex-add") { openAdd(); return true; }
    if (act === "ex-cat") {
      readDraft();
      draft.category = node.getAttribute("data-c") || draft.category;
      sh().replaceTop({ title: "Новый расход", html: sheetHtml() });
      return true;
    }
    if (act === "ex-save") { save(node.getAttribute("data-personal") === "1"); return true; }
    if (act === "ex-del") { remove(node.getAttribute("data-id")); return true; }
    if (act === "ex-light-open") { openLight(node.getAttribute("data-month") || lightMonth || ""); return true; }
    if (act === "ex-light") { saveLight(node.getAttribute("data-month") || ""); return true; }
    return false;
  }

  function refreshQuiet() {
    if (!document.getElementById("expRoot")) return;
    var a = document.activeElement;
    var box = document.getElementById("expRoot");
    if (a && box.contains(a)) return;
    showInto({ force: true });
  }

  root.BoinyaExpenses = {
    bind: bind,
    showInto: showInto,
    refreshQuiet: refreshQuiet,
    onAct: onAct,
    remindLight: remindLight,
    refreshLightCard: refreshLightCard
  };
})(typeof window !== "undefined" ? window : globalThis);
