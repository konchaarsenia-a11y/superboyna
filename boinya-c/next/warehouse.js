/* Склад: тот же экран, что в app.html. Новых полей прихода нет — только прежний дозакуп setWarehouseArrival. */
(function (root) {
  "use strict";

  var access = null;
  var view = "asOf";
  var cache = null;
  var whGen = 0;
  var prevGen = 0;
  var previewKey = "";
  var previewPromise = null;
  var previewHit = null;

  function sharedPreview(params, force) {
    var key = [view, params.asOf || "", params.dateFrom || "", params.dateTo || ""].join("|");
    if (!force && previewHit && previewHit.key === key && Date.now() - previewHit.at < 15000) {
      return Promise.resolve(previewHit.res);
    }
    if (!force && previewPromise && previewKey === key) return previewPromise;
    previewKey = key;
    var q = {
      action: "warehousePreview",
      asOf: params.asOf || "",
      dateFrom: params.dateFrom || "",
      dateTo: params.dateTo || ""
    };
    if (force) q._ = String(Date.now());
    previewPromise = api().apiGet(q, { timeoutMs: 45000, cacheTtlMs: force ? 0 : 15000 }).then(function (res) {
      previewHit = { key: key, res: res, at: Date.now() };
      previewPromise = null;
      return res;
    }, function (err) {
      previewPromise = null;
      throw err;
    });
    return previewPromise;
  }

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function logic() { return root.BoinyaWarehouseLogic; }
  function esc(s) { return sh().esc(s); }

  function tid() {
    var u = api().telegramUser() || {};
    return String((access && access.telegramId) || u.id || "");
  }

  function contextLine() {
    var L = logic();
    if (view === "weekStart") return "Неделя F+B";
    return L.formatWarehouseDayLabel_(L.warehouseTodayIso_());
  }

  function syncLabels() {
    var text = contextLine();
    var lab = document.getElementById("whDayLabel");
    if (lab) lab.textContent = text;
    var btn = document.getElementById("whViewWeekBtn");
    if (btn) btn.setAttribute("aria-pressed", view === "weekStart" ? "true" : "false");
  }

  function alive(id) {
    return !!document.getElementById(id);
  }

  function paintShell() {
    sh().dock("");
    sh().main(
      '<div class="b-card">' +
        '<div class="nx-cut-head" style="justify-content:space-between">' +
          '<div id="whDayLabel" style="font-weight:600">—</div>' +
          '<button type="button" class="b-btn b-btn--sec b-btn--sm" id="whViewWeekBtn" data-act="wh-week">неделя</button>' +
        "</div>" +
        '<div class="nx-actions" style="margin-top:12px">' +
          '<button type="button" class="b-btn b-btn--sec" data-act="wh-reload">Обновить</button>' +
          '<button type="button" class="b-btn b-btn--sec" data-act="wh-pos">Позиции</button>' +
          '<button type="button" class="b-btn b-btn--sec" data-act="wh-buy">Дозакуп</button>' +
          '<button type="button" class="b-btn b-btn--sec" data-act="wh-close">Закрыть дефициты</button>' +
        "</div>" +
      "</div>" +
      '<div id="warehousePreviewBox"></div>' +
      '<p class="b-lbl">Остатки</p>' +
      '<div id="warehouseContainer"><p class="b-note">Нажмите «Обновить»…</p></div>' +
      '<p class="b-lbl">Движения</p>' +
      '<div id="warehouseLedger"><p class="b-note">—</p></div>'
    );
    syncLabels();
  }

  function stockCard(it, shown) {
    var L = logic();
    var buy = it.buy ? ', <span style="color:var(--b-accent)">закупить</span>' : "";
    return '<article class="b-card" style="margin-bottom:8px">' +
      "<b>" + esc(it.name) + '</b> <span class="b-note">' + esc(it.unit) + "</span>" +
      '<div style="margin-top:6px"><b>' + esc(L.formatWhNum(shown)) + "</b>" + buy + "</div>" +
      '<div class="nx-pair" style="margin-top:8px">' +
        '<label class="b-field"><input class="b-field__input" type="number" id="arr_' + esc(it.row) + '" placeholder="дозакуп" inputmode="decimal"></label>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="wh-arr-save" data-row="' + esc(it.row) + '">Сохранить</button>' +
      "</div></article>";
  }

  function applyStock(html, ledHtml) {
    var box = document.getElementById("warehouseContainer");
    var led = document.getElementById("warehouseLedger");
    if (box) box.innerHTML = html;
    if (led) led.innerHTML = ledHtml;
  }

  async function loadWarehouse(opts) {
    opts = opts || {};
    var L = logic();
    if (opts.view) view = opts.view === "weekStart" ? "weekStart" : "asOf";
    syncLabels();
    var asOf = L.warehouseTodayIso_();
    var box = document.getElementById("warehouseContainer");
    var led = document.getElementById("warehouseLedger");
    if (!box) return;
    if (opts.soft && cache && cache.view === view && cache.asOf === asOf) {
      applyStock(cache.html, cache.led);
      return;
    }
    if (!opts.soft || !cache) box.innerHTML = '<p class="b-note">Загрузка…</p>';
    var mine = ++whGen;

    async function fetchOnce() {
      var q = { action: "getWarehouse", view: view };
      if (view === "asOf") q.asOf = asOf;
      if (opts.force) q._ = String(Date.now());
      return api().apiGet(q, { timeoutMs: 45000, cacheTtlMs: opts.force ? 0 : 15000 });
    }

    var res = null;
    var lastErr = null;
    var attempt;
    for (attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetchOnce();
        if (res && res.status === "success") break;
        lastErr = (res && (res.detail || res.message)) || "bad_status";
        res = null;
      } catch (e) {
        lastErr = e && e.message ? e.message : String(e);
        res = null;
      }
      if (attempt < 2) await new Promise(function (r) { setTimeout(r, 600 + attempt * 500); });
    }
    if (mine !== whGen || !alive("warehouseContainer")) return;

    if (!res || res.status !== "success") {
      if (cache && cache.html) {
        applyStock(cache.html, cache.led);
        try { sh().toast("Склад: показан кэш"); } catch (eT) {}
      } else if (box) {
        box.innerHTML = sh().errorBox({
          title: "Ошибка загрузки склада",
          text: lastErr ? String(lastErr).slice(0, 80) : "",
          act: "wh-retry"
        });
        if (led) led.innerHTML = '<p class="b-note">—</p>';
      }
      return;
    }

    try {
      var flags = L.warehouseGasFlags_(res);
      var byRow = Object.create(null);
      if (L.warehouseNeedsPreview_(view, flags)) {
        try {
          var prevQ = previewParams();
          var prev = await sharedPreview(prevQ, !!opts.force);
          ((prev && prev.plan) || []).forEach(function (p) {
            byRow[p.row] = p;
          });
        } catch (ePrev) {}
      }
      if (mine !== whGen || !alive("warehouseContainer")) return;
      var caption = view === "weekStart" ? "F+B" : L.formatWarehouseDayLabel_(asOf);
      var html = '<div class="b-note" style="margin-bottom:8px">' + esc(caption) + "</div>";
      html += (res.items || []).map(function (it) {
        var shown = L.shownWarehouseQty_(it, view, byRow[it.row], flags.gasAsOf);
        return stockCard(it, shown);
      }).join("") || '<p class="b-note">Пусто</p>';
      var ledHtml = (res.ledger || []).slice(0, 15).map(function (x) {
        return '<div class="nx-line">' + esc(String(x.type || "")) + ", " + esc(String(x.qty)) + " " + esc(String(x.unit || "")) + "</div>";
      }).join("") || '<p class="b-note">Лента пуста</p>';
      cache = { html: html, led: ledHtml, view: view, asOf: asOf };
      applyStock(html, ledHtml);
    } catch (eRender) {
      if (alive("warehouseContainer")) {
        document.getElementById("warehouseContainer").innerHTML = '<p class="b-note">Ошибка отрисовки склада</p>';
      }
    }
  }

  function previewParams() {
    var L = logic();
    var today = L.warehouseTodayIso_();
    var dates = L.warehouseDeficitDates_(view, today);
    var params = {
      action: "warehousePreview",
      force: "1",
      asOf: L.warehousePreviewAsOf_(view, today),
      _: String(Date.now())
    };
    if (dates.dateFrom) params.dateFrom = dates.dateFrom;
    if (dates.dateTo) params.dateTo = dates.dateTo;
    return params;
  }

  function previewRow(d) {
    var L = logic();
    var unit = d.unit || "кг";
    var short = (Number(d.deficit) || 0) > 0;
    var cls = short ? " nx-wh-row nx-wh-short" : " nx-wh-row";
    return '<div class="nx-wh-grid' + cls + '">' +
      "<div><b>" + esc(d.name || "") + "</b></div>" +
      "<div>" + esc(L.planWarehouseText_(d)) + "</div>" +
      "<div><b>" + esc(L.formatWhNum(d.needRaw != null ? d.needRaw : d.need)) + "</b> " + esc(unit) + "</div>" +
      "<div>" + esc(L.formatWhNum(d.available)) + " " + esc(unit) + "</div>" +
      "</div>";
  }

  async function loadWarehousePreview(opts) {
    opts = opts || {};
    var box = document.getElementById("warehousePreviewBox");
    if (!box) return;
    var L = logic();
    if (!opts.soft) box.innerHTML = '<p class="b-note">Считаю…</p>';
    var mine = ++prevGen;
    try {
      var res = await sharedPreview(previewParams(), !!opts.force);
      if (mine !== prevGen || !alive("warehousePreviewBox")) return;
      box = document.getElementById("warehousePreviewBox");
      if (!res || res.status !== "success") {
        if (box) box.innerHTML = '<p class="b-note">' + esc((res && res.message) || "Ошибка") + "</p>";
        return;
      }
      var defs = res.deficits || [];
      var rows = (res.withPlan && res.withPlan.length) ? res.withPlan : defs;
      var rowsHtml = "";
      if (!rows.length) {
        rowsHtml = '<div class="b-note" style="padding:10px 0">Нет плана или хватает.</div>';
      } else {
        rowsHtml = '<div class="nx-wh-grid nx-wh-head"><div>Позиция</div><div>План</div><div>Нужно</div><div>Есть</div></div>' +
          rows.map(previewRow).join("");
      }
      var today = L.warehouseTodayIso_();
      var dayLab = view === "weekStart" ? "неделя" : L.formatWarehouseDayLabel_(today);
      box.innerHTML = '<article class="b-card" style="margin-top:12px"><b>' + esc(dayLab) + "</b>" +
        (defs.length ? (', <span style="color:var(--b-bad)">−' + esc(String(defs.length)) + "</span>") : "") +
        rowsHtml + "</article>";
    } catch (e) {
      if (mine !== prevGen || !alive("warehousePreviewBox")) return;
      document.getElementById("warehousePreviewBox").innerHTML = '<p class="b-note">Ошибка preview</p>';
    }
  }

  async function saveArrival(row) {
    var el = document.getElementById("arr_" + row);
    var qty = Number(el && el.value) || 0;
    await api().apiPost({ action: "setWarehouseArrival", row: row, qty: qty, telegramId: tid() });
    sh().toast("Дозакуп сохранён");
    loadWarehouse({ force: 1 });
  }

  async function composeBuy() {
    sh().toast("Собираю сообщение…");
    try {
      var L = logic();
      var today = L.warehouseTodayIso_();
      var dates = L.warehouseDeficitDates_(view, today);
      var params = {
        action: "composeWarehouseBuyMessage",
        force: "1",
        asOf: L.warehousePreviewAsOf_(view, today),
        _: String(Date.now())
      };
      if (dates.dateFrom) params.dateFrom = dates.dateFrom;
      if (dates.dateTo) params.dateTo = dates.dateTo;
      var res = await api().apiGet(params, { timeoutMs: 45000, cacheTtlMs: 0 });
      var text = (res && res.text) ? String(res.text) : "";
      if (!text) {
        sh().toast("Пусто");
        return;
      }
      var copied = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          copied = true;
        }
      } catch (eClip) { copied = false; }
      if (copied) sh().toast("Скопировано, " + ((res && res.count) || 0) + " поз.");
      else await sh().alert({ title: "Дозакуп", text: text });
      try {
        if (root.BoinyaTasks && root.BoinyaTasks.refresh) await root.BoinyaTasks.refresh();
      } catch (eR) {}
    } catch (e) {
      sh().toast("Не собралось — Deploy Code.gs?");
    }
  }

  async function closeDeficits() {
    var ok = await sh().confirm({
      title: "Дефициты",
      text: "Закрыть ВСЕ открытые дефициты нарезки?\nTG перестанет спамить каждые 30 мин.",
      ok: "Закрыть"
    });
    if (!ok) return;
    var res = await api().apiGet({
      action: "closeAllOpenDeficits",
      telegramId: tid(),
      confirm: "1"
    }, { timeoutMs: 30000, cacheTtlMs: 0 });
    if (res && res.status === "success") sh().toast("Закрыто: " + (res.closed || 0));
    else await sh().alert({ title: "Склад", text: "Не вышло: " + ((res && res.message) || "Deploy Code.gs") });
  }

  function show() {
    paintShell();
    loadWarehouse({ soft: true });
    loadWarehousePreview({ soft: true });
  }

  function onAct(act, node) {
    if (act === "wh-week") {
      view = view === "weekStart" ? "asOf" : "weekStart";
      syncLabels();
      loadWarehouse({ force: 1, view: view });
      loadWarehousePreview({ force: 1 });
      return true;
    }
    if (act === "wh-reload" || act === "wh-retry") { loadWarehouse({ force: 1 }); return true; }
    if (act === "wh-pos") { loadWarehousePreview(); return true; }
    if (act === "wh-buy") { composeBuy(); return true; }
    if (act === "wh-close") { closeDeficits(); return true; }
    if (act === "wh-arr-save") { saveArrival(node.getAttribute("data-row")); return true; }
    return false;
  }

  root.BoinyaWarehouse = {
    bind: function (a) { access = a; },
    show: show,
    onAct: onAct,
    contextLine: contextLine
  };
})(typeof window !== "undefined" ? window : globalThis);
