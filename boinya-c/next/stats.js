/* Статистика владельца: полки по формулам, getStats только на чтение. */
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
    return '<div class="nx-line"><span>' + esc(label) + '</span><b class="nx-stat__num">' + esc(String(value)) + "</b></div>";
  }

  function shelfMoney(label, amount, prevAmount, wait) {
    var known = amount != null && amount !== "" && isFinite(Number(amount));
    var val = known ? moneyText(amount) : "нет данных";
    var d = known && prevAmount != null && isFinite(Number(prevAmount)) ? L().statsPctDelta_(amount, prevAmount) : null;
    var delta = d && d.text ? ' <span class="nx-stat__delta nx-stat__delta--' + esc(d.dir || "flat") + '">' + esc(d.text) + "</span>" : "";
    return '<div class="nx-line' + (wait ? " nx-line--wait" : "") + '"><span>' + esc(label) + '</span><b class="nx-stat__num">' + esc(val) + delta + "</b></div>";
  }

  function shelfCount(label, amount, prevAmount, wait) {
    var known = amount != null && amount !== "" && isFinite(Number(amount));
    var val = known ? String(amount) : "нет данных";
    var d = known && prevAmount != null && isFinite(Number(prevAmount)) ? L().statsPctDelta_(amount, prevAmount) : null;
    var delta = d && d.text ? ' <span class="nx-stat__delta nx-stat__delta--' + esc(d.dir || "flat") + '">' + esc(d.text) + "</span>" : "";
    return '<div class="nx-line' + (wait ? " nx-line--wait" : "") + '"><span>' + esc(label) + '</span><b class="nx-stat__num">' + esc(val) + delta + "</b></div>";
  }

  function closeOf(roll, pack, monthKey) {
    if (!roll || roll.ok === false || roll.revenue == null || !formulas() || !formulas().formulaClose_) return null;
    return formulas().formulaClose_({
      monthKey: monthKey || "",
      revenue: roll.revenue,
      S: roll.S, G: roll.G, P: roll.P, N: roll.N,
      rows: (pack && pack.expenses) || [],
      repairs: (pack && pack.amort) || []
    });
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
      line("БП без перехода", moneyText(block.outside)) +
      line("Окупаемость", moneyText(block.payback));
  }

  function economyOf(res) {
    var raw = res && res.formulaEconomy;
    if (!raw || raw.ok === false) return null;
    if (raw.rows && formulas() && formulas().formulaEconomy_) {
      try {
        return formulas().formulaEconomy_(raw.rows, {
          monthKey: raw.monthKey || "",
          converted: raw.converted || {}
        });
      } catch (eE) { return null; }
    }
    if (raw.bp) return raw;
    return null;
  }

  function fromEconomy(block) {
    if (!block) return null;
    return {
      conv: L().statsConvLine_(block.trials, block.converted),
      spent: block.spent,
      net: block.net,
      outside: block.outside,
      payback: block.payback,
      covered: block.covered,
      paysCost: !!block.paysCost,
      name: block.name || ""
    };
  }

  function formulas() { return root.BoinyaFormulas; }

  function monthOf(roll, setup) {
    roll = roll || {};
    setup = setup || {};
    if (!formulas() || roll.ok === false || roll.revenue == null) return null;
    return formulas().formulaMonth_({
      revenue: roll.revenue,
      S: roll.S, G: roll.G, P: roll.P, N: roll.N,
      rent: setup.rentEntered ? setup.rent : "",
      lightBill: setup.lightBill,
      packBill: setup.packBill,
      amort: setup.amort,
      smm: setup.smm,
      other: setup.other
    });
  }

  function renderScreen(periodRes, prevRes, meta) {
    periodRes = periodRes || {};
    meta = meta || {};
    var roll = periodRes.formula || null;
    var prevRoll = prevRes && prevRes.formula ? prevRes.formula : null;
    var now = monthOf(roll, meta.setup);
    var before = monthOf(prevRoll, meta.prevSetup);
    var closed = closeOf(roll, meta.expenses, meta.billMonth);
    var beforeClose = closeOf(prevRoll, meta.prevExpenses, meta.prevBillMonth);
    var legacy = L().statsScreen_(periodRes, null);
    if (meta.bpSource && meta.bpSource !== periodRes) {
      var bpScreen = L().statsScreen_(meta.bpSource, null);
      legacy.bpMonth = bpScreen.bpMonth;
      legacy.bpLife = bpScreen.bpLife;
    }
    var html = '<div class="nx-statpage">';
    if (meta.stale) {
      html += '<article class="b-card" style="margin-bottom:12px"><p class="b-note">Бэкенд без среза факта, цифры могут быть старыми.</p></article>';
    }
    html += '<article class="b-card"><p class="b-lbl" style="margin-top:0">Главное</p>';
    if (meta.compare) html += '<p class="b-note">' + esc(meta.compare) + "</p>";
    html += '<p class="b-note">Проценты справа показывают, насколько сумма отличается от этого отрезка</p>';
    html += '<p class="b-note">В оборот входят только доставки с отметкой «отвёз»</p>';
    if (!now) {
      html += line("Оборот", "нет данных") + line("Прибыль", "нет данных") + line("Себестоимость", "нет данных") + line("Доставки", "нет данных");
    } else {
      html += shelfMoney("Оборот", now.revenue, before ? before.revenue : null);
      html += shelfMoney("Прибыль", closed ? closed.afterTax : now.profit, beforeClose ? beforeClose.afterTax : (before ? before.profit : null));
      html += shelfMoney("Себестоимость", now.cost, before ? before.cost : null);
      html += shelfCount("Доставки", now.N, before ? before.N : null);
      if (roll && Number(roll.missingBasket) > 0) {
        html += line("Без состава", String(roll.missingBasket) + ", цена в обороте");
      }
      if (roll && Number(roll.missingPrice) > 0) {
        html += line("Без цены", String(roll.missingPrice) + " не в обороте");
      }
      if (roll.pending && (Number(roll.pending.revenue) > 0 || Number(roll.pending.N) > 0)) {
        html += shelfMoney("Ожидается", roll.pending.revenue, null, true);
        html += shelfCount("Ожидается доставок", roll.pending.N, null, true);
      }
    }
    html += "</article>";

    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl" style="margin-top:0">Откуда деньги</p>';
    if (!roll || roll.ok === false) {
      html += line("ПП", "нет данных") + line("Розница", "нет данных");
    } else {
      html += '<p class="b-note">ПП, цена один раз на слоте с оплатой, и только если эта доставка отвезена</p>';
      html += shelfMoney("ПП", roll.ppRevenue, prevRoll ? prevRoll.ppRevenue : null);
      html += '<p class="b-note">Розница, разовые заказы</p>';
      html += shelfMoney("Розница", roll.retailRevenue, prevRoll ? prevRoll.retailRevenue : null);
      var bigger = "нет данных";
      var ppR = Number(roll.ppRevenue) || 0;
      var rtR = Number(roll.retailRevenue) || 0;
      if (ppR > rtR) bigger = "ПП";
      else if (rtR > ppR) bigger = "Розница";
      else if (ppR > 0 || rtR > 0) bigger = "Поровну";
      html += line("Что больше принесло", bigger);
    }
    html += "</article>";

    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl" style="margin-top:0">Себестоимость</p>';
    if (!now) html += line("Сырьё", "нет данных");
    else {
      html += line("Сырьё", moneyText(now.raw));
      html += line("ЗП нарезка", moneyText(now.cut));
      html += line("ЗП сборка", moneyText(now.assembly));
      html += line("Свет по формуле", moneyText(now.light));
      html += line("Упаковка", moneyText(now.pack));
      html += line("Дорога", moneyText(now.road));
      html += line("Валовая маржа", moneyText(now.gross));
    }
    html += "</article>";

    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl" style="margin-top:0">Расходы месяца</p>';
    html += '<p class="b-note">Статистика ничего не вводит. Суммы приходят со страницы «Расходы» во вкладке «Цели». Пустая статья значит не введено и в чистое не входит.</p>';
    if (meta.rangeBills) html += '<p class="b-note">Суммы за месяц целиком, диапазон дат их не делит.</p>';
    if (!closed) {
      html += line("Аренда", "нет данных");
    } else {
      html += line("Аренда", moneyText(closed.rent) + (closed.rentDefault ? " по умолчанию" : ""));
      if (closed.project.coupon > 0) html += line("Купоны", moneyText(closed.project.coupon));
      if (closed.project.tool > 0) html += line("Инструмент", moneyText(closed.project.tool));
      if (closed.project.smm > 0) html += line("SMM", moneyText(closed.project.smm));
      else html += line("SMM", "не введено");
      if (closed.project.other > 0) html += line("Прочее", moneyText(closed.project.other));
      html += line("Амортизация", moneyText(closed.amort));
      if (closed.amortNote) html += '<p class="b-note">' + esc(closed.amortNote) + "</p>";
      html += line("Остаток доставки в чистое", moneyText(closed.deliveryRest));
      html += '<p class="b-note">0,60 на доставку уже внутри валовой маржи, второй раз не прибавляется.</p>';
      html += line("Налог 20%", moneyText(closed.tax));
      html += line("Прибыль после налога", moneyText(closed.afterTax));
    }
    html += "</article>";
    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl" style="margin-top:0">Сверка с расходами</p>';
    if (!closed) html += line("Сверка", "нет данных");
    else {
      var shownRecon = 0;
      var ri;
      for (ri = 0; ri < closed.recon.length; ri++) {
        if (!closed.recon[ri].text) continue;
        shownRecon++;
        html += '<p class="b-note">' + esc(closed.recon[ri].text) + "</p>";
      }
      if (!shownRecon) html += '<p class="b-note">Расхождения нет, либо оплата не введена.</p>';
    }
    html += "</article>";

    var setup = meta.setup || {};
    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl" style="margin-top:0">Зарплата</p>';
    var cutterName = setup.cutter && setup.cutter.name ? setup.cutter.name : "не выбран";
    var courierName = setup.courier && setup.courier.name ? setup.courier.name : "не выбран";
    html += line("Нарезчик-сборщик", cutterName);
    html += line("ЗП за период", now ? moneyText(now.wage) : "нет данных");
    html += '<p class="b-note">ЗП уже внутри себестоимости. В прибыль второй раз не входит.</p>';
    html += '<p class="b-note">' + esc((roll && roll.wageNote) || "В памяти доставок нет, кто нарезал каждую строку. Вся сумма за период у выбранного нарезчика-сборщика.") + "</p>";
    html += line("Курьер", courierName);
    html += '<p class="b-note">Отдельной ЗП курьера в формуле нет. Дорога 4 BYN на доставку уже в себестоимости.</p>';
    html += "</article>";

    var econ = economyOf(meta.bpSource) || economyOf(periodRes);
    var monthTitle = meta.bpTitle || "Этот месяц";
    var monthBp = econ ? fromEconomy(econ.bp && econ.bp.month) : null;
    var lifeBp = econ ? fromEconomy(econ.bp && econ.bp.life) : null;
    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl" style="margin-top:0">БП</p>' +
      '<p class="b-note">бесплатная проба</p>' +
      '<p class="b-note">Чистые = выручка минус себестоимость всех отвезено доставок перешедшего, за месяц и за всё время. Окупаемость = чистые минус БП тех, кто не перешёл.</p>' +
      bpBlock(monthTitle, monthBp || legacy.bpMonth) +
      bpBlock("За всё время", lifeBp || legacy.bpLife);
    var bpInfo = periodRes.bp || {};
    var weekMarked = (Number(bpInfo.oneWeek) || 0) + (Number(bpInfo.extended) || 0) + (Number(bpInfo.toPp) || 0) + (Number(bpInfo.doneWeek) || 0);
    if (weekMarked > 0) {
      html += line("1 нед", String(bpInfo.oneWeek || 0));
      html += line("Продлён", String(bpInfo.extended || 0));
      html += line("Перешёл в ПП", String(bpInfo.toPp || 0));
      html += line("Завершён", String(bpInfo.doneWeek || 0));
    }
    if (econ && econ.note) html += '<p class="b-note">' + esc(econ.note) + "</p>";
    else html += '<p class="b-note">Чистые и окупаемость появятся, когда бэкенд пришлёт состав доставок. Пока их нет, это не ноль.</p>';
    html += "</article>";

    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl" style="margin-top:0">Партнёры</p>';
    html += '<p class="b-note">' + esc((econ && econ.attribution) || "Партнёр точки берётся из поля партнёра на строке БП, кто привёл.") + "</p>";
    html += partnerShelf(monthTitle, econ && econ.partners ? econ.partners.month : null);
    html += partnerShelf("За всё время", econ && econ.partners ? econ.partners.life : null);
    if (econ && econ.coverage && econ.coverage.bpWithoutPartner > 0) {
      html += '<p class="b-note">БП без имени партнёра: ' + esc(String(econ.coverage.bpWithoutPartner)) + "</p>";
    }
    html += "</article></div>";
    return html;
  }

  function partnerShelf(title, list) {
    var html = '<p class="b-lbl">' + esc(title) + "</p>";
    if (!list) return html + line("Точки", "нет данных");
    if (!list.length) return html + line("Точки", "нет данных");
    var i;
    for (i = 0; i < list.length; i++) {
      var p = fromEconomy(list[i]) || {};
      html += line(p.name || "Точка", convText(p.conv));
      html += line("Потрачено", moneyText(p.spent));
      html += line("Чистые с перешедших", moneyText(p.net));
      html += line(Number(p.payback) < 0 ? "Убыток" : "Прибыль", moneyText(p.payback));
      if (p.paysCost && Number(p.covered) > 0) html += line("Закрыла точка", moneyText(p.covered));
    }
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
        '<p class="b-note">Деньги только после отметки «отвёз»</p>' +
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
      html: '<p class="b-note">Период любой длины, включая будущие записи. На экране те же полки и сравнение с прошлым отрезком такой же длины.</p>' +
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
    return "Сравнение с " + a + "–" + b;
  }

  function paint(periodRes, prev, meta) {
    var box = document.getElementById("statsContainer");
    if (!box) return;
    var html = renderScreen(periodRes, prev, meta);
    cache[cacheKey()] = html;
    var lab = document.getElementById("statsMonthLabel");
    if (lab) lab.textContent = meta.title || periodTitle();
    box.innerHTML = html;
  }

  async function pullExpenses(month) {
    if (!/^\d{4}-\d{2}$/.test(String(month || ""))) return null;
    try {
      return await api().apiGet({
        action: "listOwnerExpenses",
        month: month,
        _: String(Date.now())
      }, { timeoutMs: 15000, cacheTtlMs: 0 });
    } catch (eE) { return null; }
  }

  async function pullSetup(month) {
    if (!/^\d{4}-\d{2}$/.test(String(month || ""))) return null;
    try {
      return await api().apiGet({
        action: "getStatsMonthSetup",
        month: month,
        _: String(Date.now())
      }, { timeoutMs: 15000, cacheTtlMs: 0 });
    } catch (eS) { return null; }
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
      var rangeBill = String(view.to || "").slice(0, 7);
      var rangeSetup = await pullSetup(rangeBill);
      var rangePrevSetup = rangePrev ? await pullSetup(String(rangePrev.to || "").slice(0, 7)) : null;
      var rangeExp = await pullExpenses(rangeBill);
      var rangePrevExp = rangePrev ? await pullExpenses(String(rangePrev.to || "").slice(0, 7)) : null;
      if (!document.getElementById("statsContainer")) return;
      paint(ranged, rangePrevRes, {
        title: L().statsFmtDay_(view.from) + "–" + L().statsFmtDay_(view.to),
        compare: rangePrevRes ? compareCaption(rangePrev) : "",
        bpSource: (monthNow && monthNow.status === "success") ? monthNow : null,
        bpTitle: "Этот месяц",
        setup: rangeSetup,
        prevSetup: rangePrevSetup,
        billMonth: rangeBill,
        prevBillMonth: rangePrev ? String(rangePrev.to || "").slice(0, 7) : "",
        expenses: rangeExp,
        prevExpenses: rangePrevExp,
        rangeBills: true
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
    var prevWin = L().statsPrevCalendarMonth_(mk, new Date());
    var prevRes = prevWin ? await pullExpected(prevWin.from, prevWin.to) : null;
    var setup = await pullSetup(mk);
    var prevSetup = prevWin ? await pullSetup(String(prevWin.to || "").slice(0, 7)) : null;
    var exp = await pullExpenses(mk);
    var prevExp = prevWin ? await pullExpenses(String(prevWin.to || "").slice(0, 7)) : null;
    if (!document.getElementById("statsContainer")) return;
    if (view.mode !== "month" || ensureMonth() !== mk) return;
    paint(res, prevRes, {
      title: res.monthLabel || L().statsMonthLabelRu_(mk),
      compare: prevRes ? compareCaption(prevWin) : "",
      bpTitle: mk === L().currentStatsMonthKey_() ? "Этот месяц" : (res.monthLabel || L().statsMonthLabelRu_(mk)),
      stale: !res.factCutoff,
      setup: setup,
      prevSetup: prevSetup,
      billMonth: mk,
      prevBillMonth: prevWin ? String(prevWin.to || "").slice(0, 7) : "",
      expenses: exp,
      prevExpenses: prevExp
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
    onAct: onAct,
    preview: renderScreen
  };
})(typeof window !== "undefined" ? window : globalThis);
