/* Цели: проценты задач и автозакрытие показателей.
   Цифры оборота и прихода — те же statsFacts_ / statsExpectedNumbers_ / statsClean_, что на экране статистики.
   Новая метрика добавляется одной записью в METRICS. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BoinyaGoalsLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var HORIZONS = [
    { id: "day", label: "День" },
    { id: "week", label: "Неделя" },
    { id: "month", label: "Месяц" },
    { id: "half", label: "Полгода" },
    { id: "year", label: "Год" }
  ];

  var PERIODS = HORIZONS.concat([{ id: "custom", label: "Свои даты" }]);

  function pad_(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function isoDate_(d) {
    return d.getFullYear() + "-" + pad_(d.getMonth() + 1) + "-" + pad_(d.getDate());
  }

  function atNoon_(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  }

  function periodBounds(period, now, customFrom, customTo) {
    var d = atNoon_(now ? new Date(now.getTime()) : new Date());
    if (period === "custom") {
      var from = String(customFrom || "").slice(0, 10);
      var to = String(customTo || "").slice(0, 10);
      var ok = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);
      if (ok && from > to) {
        var swap = from;
        from = to;
        to = swap;
      }
      return { from: from, to: to, ok: ok };
    }
    if (period === "day") {
      var day = isoDate_(d);
      return { from: day, to: day, ok: true };
    }
    if (period === "week") {
      var dayN = d.getDay();
      var mondayOffset = dayN === 0 ? -6 : 1 - dayN;
      var mon = new Date(d.getTime());
      mon.setDate(d.getDate() + mondayOffset);
      var sun = new Date(mon.getTime());
      sun.setDate(mon.getDate() + 6);
      return { from: isoDate_(mon), to: isoDate_(sun), ok: true };
    }
    if (period === "month") {
      var start = new Date(d.getFullYear(), d.getMonth(), 1, 12);
      var end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);
      return { from: isoDate_(start), to: isoDate_(end), ok: true };
    }
    if (period === "half") {
      var h = d.getMonth() < 6 ? 0 : 6;
      var hs = new Date(d.getFullYear(), h, 1, 12);
      var he = new Date(d.getFullYear(), h + 6, 0, 12);
      return { from: isoDate_(hs), to: isoDate_(he), ok: true };
    }
    if (period === "year") {
      return { from: d.getFullYear() + "-01-01", to: d.getFullYear() + "-12-31", ok: true };
    }
    return { from: "", to: "", ok: false };
  }

  function taskPct(tasks) {
    var list = tasks || [];
    var total = list.length;
    var done = 0;
    for (var i = 0; i < total; i++) {
      if (list[i] && list[i].done) done++;
    }
    return {
      done: done,
      total: total,
      pct: total ? Math.round((done / total) * 100) : 0
    };
  }

  function finite_(n) {
    var v = Number(n);
    return isFinite(v) ? v : null;
  }

  function monthish_(res) {
    return !!(res && (res.fact || res.money || res.pp));
  }

  function hasTurnover_(res) {
    if (!res) return false;
    if (res.fact && res.fact.revenue != null) return true;
    if (res.money && res.money.turnover != null) return true;
    if (!monthish_(res) && (res.revenue != null || res.profit != null)) return true;
    return false;
  }

  function hasCost_(res) {
    if (!res) return false;
    if (res.fact && res.fact.cost != null) return true;
    if (res.money && res.money.cost != null) return true;
    if (res.cost != null) return true;
    return false;
  }

  function turnoverRead_(snap, L) {
    var res = snap && snap.stats;
    if (!res || res.status === "error" || !L || !hasTurnover_(res)) return { ok: false };
    if (monthish_(res)) {
      var f = L.statsFacts_(res);
      var v = finite_(f.profitFact);
      return v == null ? { ok: false } : { ok: true, value: v };
    }
    var n = L.statsExpectedNumbers_(res);
    var e = finite_(n.profit);
    return e == null ? { ok: false } : { ok: true, value: e };
  }

  function incomeRead_(snap, L) {
    var res = snap && snap.stats;
    if (!res || res.status === "error" || !L || !hasTurnover_(res) || !hasCost_(res)) return { ok: false };
    if (monthish_(res)) {
      var f = L.statsFacts_(res);
      var v = finite_(f.cleanFact);
      return v == null ? { ok: false } : { ok: true, value: v };
    }
    var n = L.statsExpectedNumbers_(res);
    var e = finite_(n.clean);
    return e == null ? { ok: false } : { ok: true, value: e };
  }

  function ordersRead_(snap) {
    var res = snap && snap.stats;
    if (!res || res.status === "error") return { ok: false };
    var n = null;
    if (res.fact && res.fact.deliveries != null) n = res.fact.deliveries;
    else if (res.month && res.month.deliveries != null) n = res.month.deliveries;
    else if (res.deliveries != null) n = res.deliveries;
    var v = finite_(n);
    return v == null ? { ok: false } : { ok: true, value: v };
  }

  function kgRead_(snap) {
    var res = snap && snap.stats;
    if (!res || res.status === "error") return { ok: false };
    var fact = res.fact || {};
    var month = res.month || {};
    if (res.kg != null || fact.kg != null || fact.kgSold != null || month.kg != null) {
      var kg = res.kg != null ? res.kg : (fact.kg != null ? fact.kg : (fact.kgSold != null ? fact.kgSold : month.kg));
      var v = finite_(kg);
      return v == null ? { ok: false } : { ok: true, value: v };
    }
    var grams = res.grams != null ? res.grams : (fact.grams != null ? fact.grams : (fact.soldGrams != null ? fact.soldGrams : month.grams));
    var g = finite_(grams);
    if (g == null) return { ok: false };
    return { ok: true, value: Math.round((g / 1000) * 1000) / 1000 };
  }

  function ppRead_(snap) {
    var list = snap && snap.subscriptions;
    if (!Array.isArray(list)) return { ok: false };
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var s = list[i] || {};
      if (String(s.sheet || "") !== "ПП") continue;
      var nick = String(s.nick || s.label || "").trim();
      if (!nick) continue;
      if (/^себестоим/i.test(nick) || /^стоимость\s*100/i.test(nick)) continue;
      n++;
    }
    return { ok: true, value: n };
  }

  function dateIso_(raw) {
    var s = String(raw || "").trim();
    var dmy = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (dmy) return dmy[3] + "-" + dmy[2] + "-" + dmy[1];
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return "";
  }

  function newClientsRead_(snap) {
    var list = snap && snap.subscriptions;
    if (!Array.isArray(list)) return { ok: false };
    var from = String((snap && snap.from) || "");
    var to = String((snap && snap.to) || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { ok: false };
    var keys = ["createdAt", "enrolledAt", "since", "addedAt", "firstDate"];
    var saw = false;
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var s = list[i] || {};
      if (String(s.sheet || "") !== "ПП") continue;
      var raw = "";
      for (var k = 0; k < keys.length; k++) {
        if (s[keys[k]]) {
          raw = s[keys[k]];
          break;
        }
      }
      if (!raw) continue;
      saw = true;
      var iso = dateIso_(raw);
      if (iso && iso >= from && iso <= to) n++;
    }
    if (!saw) return { ok: false };
    return { ok: true, value: n };
  }

  var METRICS = [
    { id: "turnover", label: "Оборот", unit: "BYN", read: turnoverRead_ },
    { id: "income", label: "Приход", unit: "BYN", read: incomeRead_ },
    { id: "ppClients", label: "Клиенты ПП", unit: "", read: ppRead_ },
    { id: "newClients", label: "Новые клиенты", unit: "", read: newClientsRead_ },
    { id: "kg", label: "Кг продано", unit: "кг", read: kgRead_ },
    { id: "orders", label: "Заказы", unit: "", read: ordersRead_ }
  ];

  function metricById(id) {
    for (var i = 0; i < METRICS.length; i++) {
      if (METRICS[i].id === id) return METRICS[i];
    }
    return null;
  }

  function evaluateMetric(id, snap, target, statsLogic) {
    var def = metricById(id);
    var tgt = Number(target);
    if (!def) {
      return {
        id: String(id || ""),
        label: String(id || ""),
        unit: "",
        status: "nodata",
        current: null,
        target: tgt,
        pct: null,
        reached: false
      };
    }
    var reading = def.read(snap || {}, statsLogic);
    if (!reading || !reading.ok) {
      return {
        id: def.id,
        label: def.label,
        unit: def.unit,
        status: "nodata",
        current: null,
        target: tgt,
        pct: null,
        reached: false
      };
    }
    var current = reading.value;
    var pct = null;
    var reached = false;
    if (isFinite(tgt) && tgt > 0) {
      pct = Math.max(0, Math.min(100, Math.round((current / tgt) * 100)));
      reached = current >= tgt;
    }
    return {
      id: def.id,
      label: def.label,
      unit: def.unit,
      status: "ok",
      current: current,
      target: tgt,
      pct: pct,
      reached: reached
    };
  }

  function unavailableReport(snap, statsLogic) {
    var out = [];
    for (var i = 0; i < METRICS.length; i++) {
      var reading = METRICS[i].read(snap || {}, statsLogic);
      if (!reading || !reading.ok) out.push({ id: METRICS[i].id, label: METRICS[i].label });
    }
    return out;
  }

  function applyAutoComplete(goal, reading, todayIso) {
    if (!goal || goal.kind !== "metric") return { goal: goal, changed: false };
    if (goal.done) return { goal: goal, changed: false };
    if (!reading || reading.status !== "ok" || !reading.reached) return { goal: goal, changed: false };
    var doneAt = String(todayIso || "").slice(0, 10);
    return {
      changed: true,
      goal: Object.assign({}, goal, { done: true, doneAt: doneAt })
    };
  }

  return {
    HORIZONS: HORIZONS,
    PERIODS: PERIODS,
    METRICS: METRICS,
    periodBounds: periodBounds,
    taskPct: taskPct,
    metricById: metricById,
    evaluateMetric: evaluateMetric,
    unavailableReport: unavailableReport,
    applyAutoComplete: applyAutoComplete
  };
});
