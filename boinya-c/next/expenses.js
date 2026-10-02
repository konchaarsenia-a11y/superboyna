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
  var roll = null;
  var draft = blank();

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function formulas() { return root.BoinyaFormulas; }
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

  async function pull(month) {
    try {
      return await api().apiGet({
        action: "listOwnerExpenses",
        month: month,
        _: String(Date.now())
      }, { timeoutMs: 20000, cacheTtlMs: 0 });
    } catch (e) { return null; }
  }

  async function pullRoll(month) {
    try {
      return await api().apiGet({
        action: "getStats",
        period: "month",
        month: month
      }, { timeoutMs: 20000, cacheTtlMs: 120000 });
    } catch (e2) { return null; }
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
    var recon = "";
    var closed = null;
    if (formulas() && roll && roll.formula && roll.formula.revenue != null) {
      closed = formulas().formulaClose_({
        monthKey: ensureMonth(),
        revenue: roll.formula.revenue,
        S: roll.formula.S, G: roll.formula.G, P: roll.formula.P, N: roll.formula.N,
        rows: rows,
        repairs: (pack && pack.amort) || []
      });
    }
    if (!closed) recon = '<p class="b-note">Заложенное по формуле пока нет данных</p>';
    else {
      var n = 0;
      var ri;
      for (ri = 0; ri < closed.recon.length; ri++) {
        var item = closed.recon[ri];
        var label = catName(item.key);
        if (item.state === "empty") {
          recon += '<div class="nx-line"><span>' + esc(label) + '</span><b class="nx-stat__num">не введено</b></div>';
        } else if (!item.text) {
          recon += '<div class="nx-line"><span>' + esc(label) + '</span><b class="nx-stat__num">сходится</b></div>';
        } else {
          n++;
          recon += '<p class="b-note">' + esc(label + ". " + item.text) + "</p>";
        }
      }
      if (closed.amortNote) recon += '<p class="b-note">' + esc(closed.amortNote) + "</p>";
      if (!n) recon += '<p class="b-note">Сильных расхождений нет</p>';
    }
    return '<article class="b-card"><p class="b-lbl" style="margin-top:0">Расходы</p>' +
      '<p class="b-note">Журнал владельца. Личное в проект не идёт.</p>' +
      '<div class="nx-cut-head" style="justify-content:space-between">' +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ex-prev" aria-label="Предыдущий месяц">‹</button>' +
        '<b>' + esc(title) + "</b>" +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ex-next" aria-label="Следующий месяц">›</button>' +
      "</div>" +
      '<button type="button" class="b-btn b-btn--main" style="margin-top:12px" data-act="ex-add">Добавить расход</button>' +
      "</article>" +
      '<article class="b-card" style="margin-top:12px"><p class="b-lbl" style="margin-top:0">Журнал</p>' + body + "</article>" +
      '<article class="b-card" style="margin-top:12px"><p class="b-lbl" style="margin-top:0">Сверка с себесом</p>' + recon + "</article>";
  }

  function paint() {
    var box = document.getElementById("expRoot");
    if (!box) return;
    box.innerHTML = html();
  }

  async function showInto() {
    ensureMonth();
    var box = document.getElementById("expRoot");
    if (box) box.innerHTML = '<p class="b-note">Считаю расходы…</p>';
    pack = await pull(ensureMonth());
    roll = await pullRoll(ensureMonth());
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
    sh().toast("Сохраняю…");
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
      sh().toast("Не записалось");
      return;
    }
    sh().closeAll();
    monthKey = draft.date.slice(0, 7);
    pack = res;
    showInto();
    sh().toast(personal ? "Личное записано" : "Расход записан");
  }

  async function remove(id) {
    var ok = await sh().confirm({ title: "Удалить расход", text: "Убрать эту строку из журнала?", ok: "Удалить", danger: true });
    if (!ok) return;
    var res = null;
    try { res = await api().apiPost({ action: "deleteOwnerExpense", id: id }); } catch (e) { res = null; }
    if (!res || res.status !== "success") { sh().toast("Не удалилось"); return; }
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

  async function remindLight() {
    if (!access || access.role !== "owner") return;
    try { if (sessionStorage.getItem("nx_light_asked_v1") === "1") return; } catch (eS) {}
    var month = prevMonthKey(new Date());
    var res = await pull(month);
    var rows = (res && res.expenses) || [];
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].category === "light" && !rows[i].personal) return;
    }
    try { sessionStorage.setItem("nx_light_asked_v1", "1"); } catch (e2) {}
    var label = statsLogic().statsMonthLabelRu_(month);
    sh().openSheet({
      title: "Свет",
      id: "expense-light",
      html: '<p class="b-note">Сколько ушло на свет за ' + esc(label) + '?</p>' +
        '<label class="b-field"><input class="b-field__input" id="exLightAmount" inputmode="decimal" placeholder="Сумма"></label>' +
        '<button type="button" class="b-btn b-btn--main" style="margin-top:12px" data-act="ex-light" data-month="' + esc(month) + '">Записать в расходы</button>'
    });
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
    if (act === "ex-light") { saveLight(node.getAttribute("data-month") || ""); return true; }
    return false;
  }

  root.BoinyaExpenses = {
    bind: bind,
    showInto: showInto,
    onAct: onAct,
    remindLight: remindLight
  };
})(typeof window !== "undefined" ? window : globalThis);
