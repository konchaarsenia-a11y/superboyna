/* Статистика владельца: четыре блока, getStats только на чтение. */
(function (root) {
  "use strict";

  var access = null;
  var monthKey = "";
  var view = { mode: "month", from: "", to: "" };
  var cache = Object.create(null);

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function L() { return root.BoinyaStatsLogic; }
  function esc(s) { return sh().esc(s); }

  function ensureMonth() {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) monthKey = L().currentStatsMonthKey_();
    return monthKey;
  }

  function cacheKey() {
    if (view.mode === "range") return "r:" + view.from + ":" + view.to;
    return "m:" + ensureMonth();
  }

  function moneyText(v) {
    if (v == null || v === "") return "нет данных";
    return sh().money(v) + " BYN";
  }

  function countText(v) {
    if (v == null || v === "") return "нет данных";
    return String(v);
  }

  function line(label, value) {
    return '<div class="nx-line"><span class="b-note">' + esc(label) + '</span><b class="nx-stat__num">' + esc(String(value)) + "</b></div>";
  }

  function headTile(cell, asMoney) {
    var val = cell.missing ? "нет данных" : (asMoney ? moneyText(cell.value) : countText(cell.value));
    var delta = "";
    if (cell.delta && cell.delta.text) {
      delta = '<div class="nx-stat__delta nx-stat__delta--' + esc(cell.delta.dir || "flat") + '">' + esc(cell.delta.text) + "</div>";
    }
    return '<div class="b-card"><span class="b-note">' + esc(cell.label) + '</span><b class="nx-stat__num">' + esc(val) + "</b>" + delta + "</div>";
  }

  function trio(title, note, block) {
    block = block || {};
    return '<p class="b-lbl">' + esc(title) + "</p>" +
      (note ? '<p class="b-note">' + esc(note) + "</p>" : "") +
      line("Оборот", moneyText(block.turnover)) +
      line("Прибыль", moneyText(block.profit)) +
      line("Чистые", moneyText(block.clean));
  }

  function convText(conv) {
    conv = conv || {};
    if (conv.missing || !conv.text) return "нет данных";
    return conv.pct ? (conv.text + ", " + conv.pct) : conv.text;
  }

  function bpBlock(title, block) {
    block = block || {};
    return '<p class="b-lbl">' + esc(title) + "</p>" +
      line("Переход в ПП", convText(block.conv)) +
      line("Потрачено на БП", moneyText(block.spent)) +
      line("Чистые с перешедших", moneyText(block.net)) +
      line("Окупаемость", moneyText(block.payback));
  }

  function renderScreen(screen, meta) {
    screen = screen || {};
    meta = meta || {};
    var head = screen.head || [];
    var html = '<div class="nx-stats">';
    if (meta.stale) {
      html += '<article class="b-card" style="margin-bottom:12px"><p class="b-note">Бэкенд без среза факта, цифры могут быть старыми.</p></article>';
    }
    html += '<article class="b-card"><p class="b-lbl" style="margin-top:0">' + esc(meta.title || "Период") + "</p>";
    if (meta.compare) html += '<p class="b-note">' + esc(meta.compare) + "</p>";
    html += '<div class="nx-tiles">' +
      headTile(head[0] || { label: "Оборот", missing: true }, true) +
      headTile(head[1] || { label: "Прибыль", missing: true }, true) +
      headTile(head[2] || { label: "Себестоимость", missing: true }, true) +
      headTile(head[3] || { label: "Количество доставок", missing: true }, false) +
      "</div>";
    if (screen.partnerTurnover > 0) {
      html += '<p class="b-note">Партнёрские заказы в обороте, ' + esc(sh().money(screen.partnerTurnover)) + " BYN</p>";
    }
    html += "</article>";

    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl" style="margin-top:0">Откуда деньги</p>' +
      trio("ПП", "цена один раз, на слоте с оплатой", screen.pp) +
      trio("Розница", "разовые заказы", screen.retail) +
      "</article>";

    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl" style="margin-top:0">Расходы</p>' +
      (screen.expenses || []).map(function (row) {
        return line(row.label, row.missing ? "нет данных" : moneyText(row.value));
      }).join("") +
      "</article>";

    var monthTitle = meta.bpTitle || "Этот месяц";
    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl" style="margin-top:0">БП</p>' +
      '<p class="b-note">бесплатная проба</p>' +
      bpBlock(monthTitle, screen.bpMonth) +
      bpBlock("За всё время", screen.bpLife) +
      "</article></div>";
    return html;
  }

  function periodTitle() {
    if (view.mode === "range" && view.from && view.to) {
      return L().statsFmtDay_(view.from) + "–" + L().statsFmtDay_(view.to);
    }
    return L().statsMonthLabelRu_(ensureMonth());
  }

  function shell() {
    sh().dock('<button type="button" class="b-btn b-btn--main" data-act="st-range-open">Расчёт по датам</button>');
    sh().main(
      '<button type="button" class="nx-link" data-act="more-back">← Ещё</button>' +
      '<article class="b-card">' +
        '<p class="b-lbl" style="margin-top:0">Статистика</p>' +
        '<p class="b-note">Четыре блока за выбранный период</p>' +
        '<div class="nx-cut-head" style="justify-content:space-between">' +
          '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="st-prev" aria-label="Предыдущий месяц">‹</button>' +
          '<b id="statsMonthLabel">' + esc(periodTitle()) + "</b>" +
          '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="st-next" aria-label="Следующий месяц">›</button>' +
        "</div>" +
        '<div class="nx-actions" style="margin-top:12px">' +
          '<button type="button" class="b-btn b-btn--sec" data-act="st-reload">Обновить</button>' +
          '<button type="button" class="b-btn b-btn--sec" data-act="st-export">Экспорт TSV</button>' +
        "</div></article>" +
      '<div id="statsContainer"><p class="b-note">—</p></div>'
    );
  }

  function openRange() {
    var bounds = L().statsMonthBounds_();
    var from = view.mode === "range" && view.from ? view.from : bounds.from;
    var to = view.mode === "range" && view.to ? view.to : bounds.to;
    sh().openSheet({
      title: "Расчёт по датам",
      id: "stats-range",
      html: '<p class="b-note">Период любой длины, включая будущие записи. На экране те же четыре блока и сравнение с прошлым отрезком такой же длины.</p>' +
        '<div class="nx-pair">' +
          '<div><p class="b-note">С</p><label class="b-field"><input class="b-field__input" type="date" id="statsExpectFrom" value="' + esc(from) + '"></label></div>' +
          '<div><p class="b-note">По</p><label class="b-field"><input class="b-field__input" type="date" id="statsExpectTo" value="' + esc(to) + '"></label></div>' +
        "</div>" +
        '<div id="statsExpectBox"></div>',
      foot: '<button type="button" class="b-btn b-btn--main" data-act="st-range">Посчитать</button>'
    });
  }

  function prevPack(res) {
    if (!res || res.status !== "success") return null;
    var flat = res.fact || res;
    return {
      revenue: flat.revenue != null ? flat.revenue : res.revenue,
      cost: flat.cost != null ? flat.cost : res.cost,
      deliveries: flat.deliveries != null ? flat.deliveries : res.deliveries,
      clean: flat.clean != null ? flat.clean : res.clean
    };
  }

  function compareCaption(win) {
    if (!win) return "";
    var a = L().statsFmtDay_(win.from);
    var b = L().statsFmtDay_(win.to);
    if (!a || !b) return "";
    return "к " + a + "–" + b;
  }

  function paint(periodRes, prev, meta) {
    var box = document.getElementById("statsContainer");
    if (!box) return;
    var screen = L().statsScreen_(periodRes, prev);
    if (meta.bpSource && meta.bpSource !== periodRes) {
      var bpScreen = L().statsScreen_(meta.bpSource, null);
      screen.bpMonth = bpScreen.bpMonth;
      screen.bpLife = bpScreen.bpLife;
    }
    var html = renderScreen(screen, meta);
    cache[cacheKey()] = html;
    var lab = document.getElementById("statsMonthLabel");
    if (lab) lab.textContent = meta.title || periodTitle();
    box.innerHTML = html;
  }

  async function pullExpected(from, to) {
    var res = null;
    try {
      res = await api().apiGet({
        action: "getStats",
        mode: "expected",
        dateFrom: from,
        dateTo: to,
        force: "1",
        _: String(Date.now())
      }, { timeoutMs: 45000, cacheTtlMs: 0 });
    } catch (e1) { res = null; }
    if (res && res.status === "success") return res;
    try {
      res = await api().apiGet({
        action: "getExpectedProfit",
        fromDate: from,
        toDate: to,
        _: String(Date.now())
      }, { timeoutMs: 45000, cacheTtlMs: 0 });
    } catch (e2) { res = null; }
    return (res && res.status === "success") ? res : null;
  }

  async function pullMonth(key, force) {
    var q = { action: "getStats", period: "month", month: key };
    if (force) { q.force = "1"; q._ = String(Date.now()); }
    try {
      return await api().apiGet(q, { timeoutMs: force ? 90000 : 20000, cacheTtlMs: force ? 0 : 120000 });
    } catch (e) { return null; }
  }

  async function load(opts) {
    opts = opts || {};
    var box = document.getElementById("statsContainer");
    if (!box) return;
    var key = cacheKey();
    var lab = document.getElementById("statsMonthLabel");
    if (lab) lab.textContent = periodTitle();
    if (!opts.force && cache[key]) {
      box.innerHTML = cache[key];
      return;
    }
    if (view.mode === "range") {
      box.innerHTML = '<p class="b-note">Считаю ' + esc(view.from) + "–" + esc(view.to) + "…</p>";
      var ranged = await pullExpected(view.from, view.to);
      if (!document.getElementById("statsContainer")) return;
      if (!ranged) {
        document.getElementById("statsContainer").innerHTML = '<p class="b-note">Не удалось посчитать период.</p>';
        return;
      }
      var rangePrev = L().statsPrevEqualPeriod_(view.from, view.to);
      var rangePrevRes = rangePrev ? await pullExpected(rangePrev.from, rangePrev.to) : null;
      var monthNow = await pullMonth(L().currentStatsMonthKey_(), !!opts.force);
      if (!document.getElementById("statsContainer")) return;
      paint(ranged, prevPack(rangePrevRes), {
        title: L().statsFmtDay_(view.from) + "–" + L().statsFmtDay_(view.to),
        compare: rangePrevRes ? compareCaption(rangePrev) : "",
        bpSource: (monthNow && monthNow.status === "success") ? monthNow : null,
        bpTitle: "Этот месяц"
      });
      return;
    }
    var mk = ensureMonth();
    if (!cache[key]) box.innerHTML = '<p class="b-note">Считаю ' + esc(mk) + "…</p>";
    var res = await pullMonth(mk, !!opts.force);
    if (!document.getElementById("statsContainer")) return;
    if (!res || res.status !== "success") {
      if (!cache[key]) document.getElementById("statsContainer").innerHTML = '<p class="b-note">Нет данных</p>';
      return;
    }
    var resMonth = String(res.monthKey || "").trim();
    if (resMonth && /^\d{4}-\d{2}$/.test(resMonth) && resMonth !== mk) {
      if (!cache[key]) document.getElementById("statsContainer").innerHTML = '<p class="b-note">Нет данных</p>';
      return;
    }
    var span = L().statsMonthSpan_(mk, new Date());
    var prevWin = span ? L().statsPrevEqualPeriod_(span.from, span.to) : null;
    var prevRes = prevWin ? await pullExpected(prevWin.from, prevWin.to) : null;
    if (!document.getElementById("statsContainer")) return;
    if (view.mode !== "month" || ensureMonth() !== mk) return;
    paint(res, prevPack(prevRes), {
      title: res.monthLabel || L().statsMonthLabelRu_(mk),
      compare: prevRes ? compareCaption(prevWin) : "",
      bpTitle: mk === L().currentStatsMonthKey_() ? "Этот месяц" : (res.monthLabel || L().statsMonthLabelRu_(mk)),
      stale: !res.factCutoff
    });
  }

  function shift(delta) {
    var step = L().shiftStatsMonthKey_(ensureMonth(), delta, new Date());
    if (!step.ok) { sh().toast(step.toast); return; }
    view = { mode: "month", from: "", to: "" };
    monthKey = step.next;
    load({ force: true });
  }

  async function exportTsv() {
    try {
      var res = await api().apiGet({
        action: "exportStats",
        format: "accountant",
        month: ensureMonth(),
        onlyPast: "1",
        force: "1",
        _: String(Date.now())
      }, { timeoutMs: 45000, cacheTtlMs: 0 });
      if (res && res.status === "success") {
        sh().toast(res.message || "Экспорт готов");
        if (res.tsv) {
          var copied = false;
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(res.tsv);
              copied = true;
            }
          } catch (e2) { copied = false; }
          sh().toast(copied ? "TSV скопирован" : "Нет буфера");
          if (!copied) await sh().alert({ title: "TSV", text: String(res.tsv).slice(0, 800) });
        } else sh().toast("Нет TSV");
      } else sh().toast("Экспорт не вышел");
    } catch (e) { sh().toast("Ошибка экспорта"); }
  }

  async function range() {
    var box = document.getElementById("statsExpectBox");
    var from = (document.getElementById("statsExpectFrom") || {}).value || "";
    var to = (document.getElementById("statsExpectTo") || {}).value || "";
    if (!from || !to || to < from) {
      if (box) box.innerHTML = '<p class="b-note">Укажите даты с и по</p>';
      return;
    }
    view = { mode: "range", from: from, to: to };
    sh().closeAll();
    load({ force: true });
  }

  function show() {
    shell();
    load({});
  }

  function onAct(act) {
    if (act === "st-prev") { shift(-1); return true; }
    if (act === "st-next") { shift(1); return true; }
    if (act === "st-reload") { cache = Object.create(null); load({ force: true }); return true; }
    if (act === "st-export") { exportTsv(); return true; }
    if (act === "st-range-open") { openRange(); return true; }
    if (act === "st-range") { range(); return true; }
    return false;
  }

  root.BoinyaStats = {
    bind: function (a) { access = a; },
    show: show,
    onAct: onAct
  };
})(typeof window !== "undefined" ? window : globalThis);
