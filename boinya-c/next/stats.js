/* Статистика владельца: getStats / exportStats / setStatsCutterEnabled, цифры из stats-logic.js. */
(function (root) {
  "use strict";

  var access = null;
  var monthKey = "";
  var cache = Object.create(null);

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function L() { return root.BoinyaStatsLogic; }
  function esc(s) { return sh().esc(s); }

  function tid() {
    var u = api().telegramUser() || {};
    return String((access && access.telegramId) || u.id || "");
  }

  function ensureMonth() {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) monthKey = L().currentStatsMonthKey_();
    return monthKey;
  }

  function line(label, value) {
    return '<div class="nx-line"><span class="b-note">' + esc(label) + "</span><b>" + esc(String(value)) + "</b></div>";
  }

  function tile(label, value) {
    return '<div class="b-card"><span class="b-note">' + esc(label) + '</span><b style="font-size:var(--b-f20)">' + esc(String(value)) + "</b></div>";
  }

  function bar(label, value, max) {
    var pct = L().statsBarPct_(value, max);
    return '<div style="margin:8px 0"><div class="nx-line" style="border:0;padding:0 0 4px"><span>' + esc(label) + "</span><b>" + esc(String(value)) + '</b></div>' +
      '<div class="nx-bar"><span style="width:' + pct + '%"></span></div></div>';
  }

  function deltaHtml(d) {
    var x = L().statsDelta_(d);
    if (!x) return "";
    var color = x.dir === "up" ? "var(--b-ok)" : (x.dir === "down" ? "var(--b-bad)" : "var(--b-text-3)");
    var pct = x.pct != null ? (" (" + x.sign + x.pct + "%)") : "";
    return ' <span style="color:' + color + ';font-size:var(--b-f12)">' + esc(x.sign + x.abs + pct) + "</span>";
  }

  function render(res) {
    var f = L().statsFacts_(res);
    var html = "";
    if (f.oldDeploy) {
      html += '<article class="b-card" style="margin-bottom:12px;border-color:var(--b-warn)"><b style="color:var(--b-warn)">Старый Deploy Code.gs</b>' +
        '<p class="b-note">Вставь актуальный Code.gs → Deploy → New version.</p></article>';
    }
    html += '<article class="b-card"><p class="b-lbl" style="margin-top:0">' + esc(f.monthLabel) + "</p>" +
      '<p class="b-note">Оборот = ПП + розница + партнёр. <b>БП в оборот не входит</b> (пробник бесплатный).</p>' +
      '<div class="nx-tiles">' +
      tile("Прибыль (=оборот)", f.profitFact) +
      tile("Чистое", f.cleanFact) +
      tile("Затраты", f.costActual) +
      tile("Доставок", f.deliveries) +
      "</div>" +
      '<p class="b-note">ПП ' + esc(f.by.pp || 0) + " · БП " + esc(f.by.bp || 0) + " дост. (0 BYN) · розница " +
      esc(f.by.retail || 0) + " · партнёр-заказ " + esc(f.by.partner || 0) +
      ((f.by.other || 0) ? (" · прочее " + esc(f.by.other)) : "") + "</p></article>";

    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl">Откуда деньги</p>' +
      line("ПП", f.ppActual + " BYN") +
      line("Розница", f.retail + " BYN") +
      line("Заказы «Партнёр»", f.partnerOrd + " BYN") +
      line("БП", "0 BYN · бесплатно") +
      '<p class="b-note">Деньги с БП появляются только после перехода в ПП — блок «БП» ниже.</p></article>';

    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl">Затраты</p>' +
      line("Продукция всего", f.productCost + " BYN") +
      line("· розница (состав)", f.retailCost + " BYN") +
      line("· ПП (состав)", f.ppBasketCost + " BYN") +
      line("· партнёр-заказ", f.partnerCostApp + " BYN") +
      line("Купоны", f.couponsCost + " BYN");
    if (f.ppRecoverCost > 0 && f.ppRecoverInClean <= 0) {
      html += line("Recover ПП (свет+нарезка+дойпак)", f.ppRecoverCost + " BYN · " + f.ppLightPeople + " чел");
    }
    html += line(f.deliveryLabel, f.ppDeliveryCost + " BYN · " + f.ppDelivN) +
      line("Пакеты", f.ppPackagesCost + " BYN") +
      line("БП (состав + топливо 4р)", f.bpSpend + " BYN · " + f.bpDeliv + " дост.");
    if (f.staffCost > 0) html += line("ЗП сотрудников (не нарезчик)", f.staffCost + " BYN · " + f.staffCount + " чел.");
    html += line("Всего", f.costActual + " BYN");
    html += '<p class="b-note" style="color:var(--b-warn)">В чистом (не в затратах)</p>';
    if (f.ppRecoverInClean > 0) html += line("Recover в чистом", f.ppRecoverInClean + " BYN · " + f.ppLightPeople + " чел");
    if (f.ppFractionInClean > 0 || f.ppFractionCost > 0) html += line("Фракции в чистом", (f.ppFractionInClean || f.ppFractionCost) + " BYN");
    if (f.ppDeliveryInClean > 0) html += line("Доставка в чистом (тариф − 4)×N", f.ppDeliveryInClean + " BYN · " + f.ppDelivN);
    if (f.bpDelivInClean > 0) html += line("БП доставка в чистом (2р × N)", f.bpDelivInClean + " BYN · " + f.bpDeliv);
    html += '<p class="b-note">' + esc(f.footnote) +
      (f.cutterMonthOn ? "Этот месяц: нарезчик вкл — recover в затратах." : "Этот месяц: нарезчик как OFF — recover в чистом, не в затратах.") +
      " БП: состав + топливо 4р. Плоская ЗП нарезчика не в затратах.</p></article>";

    var c = f.cutter;
    html += '<article class="b-card" id="statsStaffCard" style="margin-top:12px"><p class="b-lbl">Нарезчик</p>' +
      '<p class="b-note">Зарплата нарезчика — recover (3.90/100г + 0.50/шт). Плоская ЗП не в затратах. Вкл → recover в затратах. Выкл → recover в чистом. Август 2026 и раньше — как OFF (пол ' + esc(c.floor) + ").</p>" +
      '<div class="nx-tiles"><div class="b-card"><span class="b-note">Тумблер</span><b>' + (c.globalOn ? "Включён" : "Выключен") + "</b></div>" +
      '<div class="b-card"><span class="b-note">Этот месяц ' + esc(ensureMonth()) + "</span><b>" +
      (c.monthOn ? "В затратах: recover" : "Как OFF · recover в чистом") + "</b></div></div>";
    if (c.globalOn && !c.monthOn) {
      html += '<p class="b-note" style="color:var(--b-warn)">Месяц раньше «с» ' + esc(c.fromMonth) + " или до пола " + esc(c.floor) + " — тумблер не врёт, в цифрах месяца нарезчик выкл.</p>";
    }
    if (c.globalOn) {
      html += '<p class="b-note">Плоская ЗП · ' + esc(String(c.salary)) + " BYN/мес · не в затратах</p>" +
        '<p class="b-note">с ' + esc(c.fromMonth) + " · канон 12.09: ЗП = recover</p>";
    } else {
      html += '<p class="b-note">Тумблер выключен — recover ПП в чистом (не в затратах). Плоская ЗП не используется.</p>';
    }
    html += '<label class="b-field" style="margin-top:8px"><span class="b-note">ЗП / мес (BYN)</span><input class="b-field__input" type="number" id="statsCutterSalary" step="0.01" min="0" inputmode="decimal" value="' + esc(String(c.salary)) + '"></label>' +
      '<div class="nx-actions" style="margin-top:8px">';
    if (c.globalOn) {
      html += '<button type="button" class="b-btn b-btn--main" data-act="st-cutter-on">Обновить ЗП</button>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="st-cutter-off">Выключить</button>';
    } else {
      html += '<button type="button" class="b-btn b-btn--main" data-act="st-cutter-on">Включить нарезчика</button>';
    }
    html += "</div></article>";

    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl">БП</p>' +
      '<p class="b-note">Пробник <b>не даёт оборот</b>. Считаем только затраты и переходы в ПП.</p>' +
      line("Оборот с доставок БП", "0 BYN") +
      line("Доставок БП", f.bpDeliv) +
      line("Затраты месяца", f.bpSpend + " BYN") +
      line("· состав", f.bpBasket + " BYN") +
      line("· топливо (" + f.bpFeeEach + "р × " + f.bpDeliv + ")", f.bpDelivFee + " BYN");
    if (f.bpDelivCleanShow > 0) html += line("· доставка в чистом (2р × " + f.bpDeliv + ")", f.bpDelivCleanShow + " BYN");
    html += line("Переходов в ПП (месяц)", f.converted) +
      line("CAC (затраты ÷ переходы)", f.cac != null ? (f.cac + " BYN") : "—") +
      '<p class="b-note">За всё время · деньги после перехода в ПП</p>' +
      line("Перешло", (f.life.converted || 0)) +
      line("Затраты БП перешедших", (f.life.bpCost || 0) + " BYN") +
      line("Выручка ПП с них", (f.life.ppRevenue || 0) + " BYN") +
      line("Выхлоп (выручка − затраты БП перешедших)", (f.life.profit || 0) + " BYN") +
      '<p class="b-note">Только БП тех, кто стал ПП. Оплаты подписки после конверсии (не цена пробника). Себест ПП в «Чистом» — без наценки 2.3/2.6.</p>' +
      "</article>";

    html += '<article class="b-card" id="statsPartnersCard" style="margin-top:12px"><p class="b-lbl">Партнёры</p>' +
      '<p class="b-note">БП от партнёра → сколько стало ПП. Прибыль = выручка ПП − затрата БП (если платит себест — затрата 0).</p>';
    if (!f.partners.length) {
      html += '<p class="b-note">Пока пусто</p><p class="b-note">Добавь партнёров и указывай при заказе БП</p><button type="button" class="b-btn b-btn--sec" data-act="st-partners">Открыть список партнёров</button>';
    } else {
      html += f.partners.map(function (p) {
        var good = Number(p.profit) || 0;
        return '<div class="b-card" style="margin-top:8px"><b>' + esc(p.name) + "</b>" +
          (p.paysCost ? ' <span class="b-note">платит себест</span>' : "") +
          line("БП пришло", (p.bpClients != null) ? p.bpClients : (p.deliveries || 0)) +
          line("Стало ПП", (p.convertedToPp != null) ? p.convertedToPp : 0) +
          line("Выручка ПП", (p.ppRevenue != null) ? p.ppRevenue : (p.revenue || 0)) +
          line("Затраты БП", p.paysCost ? "0 (платит)" : ((p.cost != null) ? p.cost : 0)) +
          line("Прибыль", good + " BYN") + "</div>";
      }).join("") + '<button type="button" class="b-btn b-btn--sec" style="margin-top:8px" data-act="st-partners">Управлять партнёрами</button>';
    }
    html += "</article>";

    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl">Лист ПП (снимок)</p>' +
      line("Оборот листа", f.ppTurnover) +
      line("Себест листа", f.ppCost) +
      line("Выхлоп листа", f.ppClean) +
      '<p class="b-note">Не факт доставок — статичный лист подписок.</p></article>';

    var stageMax = 1;
    f.bpStages.forEach(function (s) { if ((Number(s.value) || 0) > stageMax) stageMax = Number(s.value) || 0; });
    html += '<article class="b-card" id="statsBpFunnelCard" style="margin-top:12px"><p class="b-lbl">Воронка БП (CRM)</p>' +
      '<p class="b-note">Живые карточки на листе БП — не деньги месяца.</p>' +
      line("Всего на листе", f.bpTotal) +
      f.bpStages.map(function (s) { return bar(s.label, s.value, stageMax); }).join("") +
      "</article>";

    var cmp = f.compare || {};
    if (cmp.prevMonthKey) {
      html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl">С прошлым месяцем · ' + esc(cmp.prevMonthKey) + "</p>" +
        '<div class="nx-line"><span class="b-note">Оборот</span><b>' + esc(f.moneyTurnover) + deltaHtml(cmp.calTurnover) + "</b></div>" +
        '<div class="nx-line"><span class="b-note">ПП вышло</span><b>' + esc(f.ppActual) + deltaHtml(cmp.ppActual) + "</b></div>" +
        '<div class="nx-line"><span class="b-note">Розница</span><b>' + esc(f.retail) + deltaHtml(cmp.retail) + "</b></div>" +
        '<div class="nx-line"><span class="b-note">Доставок</span><b>' + esc(f.deliveries) + deltaHtml(cmp.deliveries) + "</b></div>" +
        '<div class="nx-line"><span class="b-note">БП затраты</span><b>' + esc(f.bpSpend) + deltaHtml(cmp.bpSpend) + "</b></div>" +
        '<div class="nx-line"><span class="b-note">Переходов</span><b>' + esc(f.converted) + deltaHtml(cmp.bpConverted) + "</b></div></article>";
    }
    if (f.turnChart.length) {
      var turnMax = 1;
      f.turnChart.forEach(function (s) { if ((Number(s.value) || 0) > turnMax) turnMax = Number(s.value) || 0; });
      html += '<article class="b-card" id="statsTurnoverChartCard" style="margin-top:12px"><p class="b-lbl">Оборот по источникам</p>' +
        f.turnChart.map(function (s) { return bar(s.label, s.value, turnMax); }).join("") + "</article>";
    }
    return html;
  }

  function shell() {
    var bounds = L().statsMonthBounds_();
    sh().dock("");
    sh().main(
      '<article class="b-card">' +
        '<p class="b-lbl" style="margin-top:0">Статистика</p>' +
        '<p class="b-note">Факт за выбранный месяц · даты ≤ сегодня</p>' +
        '<div class="nx-cut-head" style="justify-content:space-between">' +
          '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="st-prev" aria-label="Предыдущий месяц">‹</button>' +
          '<b id="statsMonthLabel">' + esc(L().statsMonthLabelRu_(ensureMonth())) + "</b>" +
          '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="st-next" aria-label="Следующий месяц">›</button>' +
        "</div>" +
        '<div class="nx-actions" style="margin-top:12px">' +
          '<button type="button" class="b-btn b-btn--sec" data-act="st-reload">Обновить</button>' +
          '<button type="button" class="b-btn b-btn--sec" data-act="st-export">Экспорт TSV</button>' +
        "</div></article>" +
      '<div id="statsContainer"><p class="b-note">—</p></div>' +
      '<article class="b-card" style="margin-top:12px"><p class="b-lbl">Диапазон дат</p>' +
        '<p class="b-note">Включая будущие записи. Прибыль = оборот, чистое = оборот − затраты.</p>' +
        '<div class="nx-pair">' +
          '<div><p class="b-note">С</p><label class="b-field"><input class="b-field__input" type="date" id="statsExpectFrom" value="' + esc(bounds.from) + '"></label></div>' +
          '<div><p class="b-note">По</p><label class="b-field"><input class="b-field__input" type="date" id="statsExpectTo" value="' + esc(bounds.to) + '"></label></div>' +
        "</div>" +
        '<button type="button" class="b-btn b-btn--main" style="margin-top:12px" data-act="st-range">Посчитать</button>' +
        '<div id="statsExpectBox"></div></article>'
    );
  }

  function applyRes(res) {
    var box = document.getElementById("statsContainer");
    if (!box || !res || res.status !== "success") return false;
    if (!res.factCutoff) res._oldDeploy = true;
    var resMonth = String(res.monthKey || "").trim();
    if (resMonth && /^\d{4}-\d{2}$/.test(resMonth) && resMonth !== ensureMonth()) return false;
    var html = render(res);
    cache[ensureMonth()] = html;
    if (res.monthLabel) {
      var lab = document.getElementById("statsMonthLabel");
      if (lab) lab.textContent = res.monthLabel;
    }
    box.innerHTML = html;
    return true;
  }

  async function load(opts) {
    opts = opts || {};
    var box = document.getElementById("statsContainer");
    if (!box) return;
    var key = ensureMonth();
    var lab = document.getElementById("statsMonthLabel");
    if (lab && !opts.keepLabel) lab.textContent = L().statsMonthLabelRu_(key);
    var has = !!cache[key];
    if (!opts.force && has) {
      box.innerHTML = cache[key];
      return;
    }
    if (!has) box.innerHTML = '<p class="b-note">Считаю ' + esc(key) + "…</p>";
    try {
      var q = { action: "getStats", period: "month", month: key };
      if (opts.force) { q.force = "1"; q._ = String(Date.now()); }
      var res = await api().apiGet(q, { timeoutMs: opts.force ? 90000 : 20000, cacheTtlMs: opts.force ? 0 : 120000 });
      if (!document.getElementById("statsContainer")) return;
      if (!applyRes(res)) {
        if (!has) document.getElementById("statsContainer").innerHTML = '<p class="b-note">Статистика не ответила. Нужен Deploy Code.gs.</p>';
      }
    } catch (e) {
      if (!has && document.getElementById("statsContainer")) {
        document.getElementById("statsContainer").innerHTML = '<p class="b-note">Нет данных / нужен деплой бэкенда</p>';
      }
    }
  }

  function shift(delta) {
    var step = L().shiftStatsMonthKey_(ensureMonth(), delta, new Date());
    if (!step.ok) { sh().toast(step.toast); return; }
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
        } else sh().toast("Нет TSV — нужен Deploy Code.gs");
      } else sh().toast("Экспорт не вышел — Deploy Code.gs");
    } catch (e) { sh().toast("Ошибка экспорта"); }
  }

  async function range() {
    var box = document.getElementById("statsExpectBox");
    if (!box) return;
    var from = (document.getElementById("statsExpectFrom") || {}).value || "";
    var to = (document.getElementById("statsExpectTo") || {}).value || "";
    if (!from || !to) { box.innerHTML = '<p class="b-note">Укажите даты «с» и «по»</p>'; return; }
    box.innerHTML = '<p class="b-note">Считаю диапазон…</p>';
    var res = null;
    try {
      res = await api().apiGet({ action: "getStats", mode: "expected", dateFrom: from, dateTo: to, force: "1", _: String(Date.now()) }, { timeoutMs: 45000, cacheTtlMs: 0 });
    } catch (e1) { res = null; }
    if (!res || res.status !== "success") {
      try {
        res = await api().apiGet({ action: "getExpectedProfit", fromDate: from, toDate: to, _: String(Date.now()) }, { timeoutMs: 45000, cacheTtlMs: 0 });
      } catch (e2) { res = null; }
    }
    if (!document.getElementById("statsExpectBox")) return;
    box = document.getElementById("statsExpectBox");
    if (!res || res.status !== "success") {
      var fail = (res && res.message) || "Не удалось посчитать";
      if (fail === "unknown_action" || !res || res.status === "unknown_action") {
        fail = "Нужен Deploy Code.gs: вставь актуальный Code.gs → Deploy → New version. Без этого нет расчёта диапазона и фильтра «только прошедшие».";
      }
      box.innerHTML = '<p class="b-note">' + esc(fail) + "</p>";
      return;
    }
    var n = L().statsExpectedRows_(res);
    var by = n.by;
    box.innerHTML = '<div class="nx-tiles" style="margin-top:12px">' +
      tile("Прибыль (=оборот)", n.profit) + tile("Чистое", n.clean) +
      tile("Затраты", n.cost) + tile("Доставок", n.deliveries) + "</div>" +
      '<p class="b-note">' + esc(res.from) + " → " + esc(res.to) + "</p>" +
      '<p class="b-note">ПП ' + esc(by.pp || 0) + " · БП " + esc(by.bp || 0) + " · розница " + esc(by.retail || 0) + " · партнёр-заказ " + esc(by.partner || 0) + "</p>" +
      n.lines.map(function (row) { return line(row.label, row.value); }).join("") +
      (n.feeLine ? '<p class="b-note">' + esc(n.feeLine) + "</p>" : "");
  }

  async function cutter(enabled) {
    var salEl = document.getElementById("statsCutterSalary");
    var salary = salEl ? Number(salEl.value) : NaN;
    sh().toast(enabled ? "Включаю нарезчика…" : "Выключаю…");
    try {
      var body = { action: "setStatsCutterEnabled", enabled: enabled ? "1" : "0", telegramId: tid(), fromMonth: ensureMonth() };
      if (isFinite(salary) && salary >= 0) body.salary = salary;
      var res = await api().apiPost(body);
      if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не сохранилось — Deploy Code.gs"); return; }
      sh().toast(enabled ? ("Нарезчик включён · " + (res.salary != null ? res.salary : "") + " BYN") : "Нарезчик выключен");
      cache = Object.create(null);
      load({ force: true, keepLabel: true });
    } catch (e) { sh().toast("Ошибка"); }
  }

  function show() {
    shell();
    load({});
  }

  function onAct(act) {
    if (act === "st-prev") { shift(-1); return true; }
    if (act === "st-next") { shift(1); return true; }
    if (act === "st-reload") { load({ force: true }); return true; }
    if (act === "st-export") { exportTsv(); return true; }
    if (act === "st-range") { range(); return true; }
    if (act === "st-cutter-on") { cutter(true); return true; }
    if (act === "st-cutter-off") { cutter(false); return true; }
    if (act === "st-partners") {
      if (root.__nxOpenPartners) root.__nxOpenPartners("bp");
      return true;
    }
    return false;
  }

  root.BoinyaStats = {
    bind: function (a) { access = a; },
    show: show,
    onAct: onAct
  };
})(typeof window !== "undefined" ? window : globalThis);
