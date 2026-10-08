/* Цифры статистики — те же ветки, что renderStatsDashboard_ / loadExpectedProfit / тариф ПП. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BoinyaStatsLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function statsMinskYmd_(now) {
    var d = now || new Date();
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Minsk",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(d);
      var y = "";
      var m = "";
      var day = "";
      var i;
      for (i = 0; i < parts.length; i++) {
        if (parts[i].type === "year") y = parts[i].value;
        if (parts[i].type === "month") m = parts[i].value;
        if (parts[i].type === "day") day = parts[i].value;
      }
      if (y && m && day) return { y: Number(y), m: Number(m), d: Number(day) };
    } catch (eM) {}
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  }

  function currentStatsMonthKey_(now) {
    var p = statsMinskYmd_(now);
    return p.y + "-" + (p.m < 10 ? "0" : "") + p.m;
  }

  function statsMonthLabelRu_(monthKey) {
    var mk = String(monthKey || "");
    var parts = mk.split("-");
    if (parts.length < 2) return mk || "—";
    var y = Number(parts[0]);
    var mo = Number(parts[1]);
    var names = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
    var name = names[mo - 1] || mk;
    return name.charAt(0).toUpperCase() + name.slice(1) + " " + y;
  }

  function shiftStatsMonthKey_(monthKey, delta, now) {
    var mk = String(monthKey || "");
    if (!/^\d{4}-\d{2}$/.test(mk)) mk = currentStatsMonthKey_(now);
    var parts = mk.split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1 + (Number(delta) || 0), 1);
    var nm = d.getMonth() + 1;
    var next = d.getFullYear() + "-" + (nm < 10 ? "0" : "") + nm;
    var cur = currentStatsMonthKey_(now);
    if (next > cur) return { ok: false, next: mk, toast: "Дальше текущего месяца нельзя" };
    var minD = now ? new Date(now.getTime()) : new Date();
    minD.setMonth(minD.getMonth() - 24);
    var minKey = minD.getFullYear() + "-" + ((minD.getMonth() + 1) < 10 ? "0" : "") + (minD.getMonth() + 1);
    if (next < minKey) return { ok: false, next: mk, toast: "Дальше назад нет" };
    return { ok: true, next: next, toast: "" };
  }

  function statsMonthBounds_(now) {
    var d = now || new Date();
    var y = d.getFullYear();
    var m = d.getMonth();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var lastDay = new Date(y, m + 1, 0).getDate();
    return {
      from: y + "-" + pad(m + 1) + "-01",
      to: y + "-" + pad(m + 1) + "-" + pad(lastDay)
    };
  }

  function statsPpSchemeOf_(src) {
    var sch = String((src && src.ppScheme) || "").toUpperCase();
    if (sch === "RAW26" || sch === "LEGACY" || sch === "MIXED") return sch;
    return "";
  }
  function statsPpDeliveryLabel_(src) {
    var sch = statsPpSchemeOf_(src);
    if (sch === "RAW26") return "Топливо доставок ПП (4×N, тариф 9 RAW26)";
    if (sch === "LEGACY") return "Топливо доставок ПП (4×N, тариф 6 LEGACY)";
    return "Топливо доставок ПП (4×N)";
  }
  function statsPpCostFootnote_(src) {
    var sch = statsPpSchemeOf_(src);
    if (sch === "RAW26") return "Затраты ПП: состав без наценки + recover (если нарезчик вкл) + топливо 4×N + пакеты. Фракции и (9−4)×N — в чистом. ";
    if (sch === "LEGACY") return "Затраты ПП: состав без наценки + 11 (если нарезчик вкл) + топливо 4×N + пакеты. Фракции и (6−4)×N — в чистом. ";
    return "Затраты ПП: состав без наценки + recover/11 (если нарезчик вкл) + топливо 4×N + пакеты. Фракции и остаток тарифа — в чистом. ";
  }
  function statsPpFeeEchoLine_(src) {
    var sch = statsPpSchemeOf_(src);
    if (sch === "RAW26") return "Тариф клиенту RAW26: recover 3.90/100г + доставка 9×N. В статистике затрат: топливо 4×N.";
    if (sch === "LEGACY") return "Тариф клиенту LEGACY: +11 + 6×N. В статистике затрат: топливо 4×N.";
    if (sch === "MIXED") return "Тариф смешанный: RAW26 recover 3.90+9×N / LEGACY +11+6×N. В статистике затрат: топливо 4×N.";
    return "";
  }

  function statsBarPct_(value, maxV) {
    var v = Number(value) || 0;
    var max = Math.max(Number(maxV) || 0, 1);
    return Math.max(2, Math.min(100, Math.round((v / max) * 100)));
  }

  function statsDelta_(d) {
    if (!d || d.prev == null) return null;
    var abs = Number(d.abs) || 0;
    return {
      abs: abs,
      sign: abs > 0 ? "+" : "",
      pct: d.pct != null ? d.pct : null,
      dir: abs > 0 ? "up" : (abs < 0 ? "down" : "flat")
    };
  }

  function statsClean_(turnover, cost) {
    return Math.round((Number(turnover) - Number(cost)) * 100) / 100;
  }

  function statsExpectedNumbers_(res) {
    res = res || {};
    var by = res.bySource || {};
    return {
      profit: res.profit != null ? res.profit : res.revenue || 0,
      clean: res.clean != null ? res.clean : statsClean_(res.revenue || 0, res.cost || 0),
      cost: res.cost || 0,
      deliveries: res.deliveries || 0,
      by: by,
      ppRevenue: res.ppRevenue != null ? res.ppRevenue : 0,
      ppRecoverInClean: Number(res.ppRecoverInClean) || 0,
      ppRecoverCost: Number(res.ppRecoverCost) || 0,
      ppPackagesCost: res.ppPackagesCost != null ? (Number(res.ppPackagesCost) || 0) : null,
      ppFractionInClean: Number(res.ppFractionInClean != null ? res.ppFractionInClean : 0) || 0,
      ppDeliveryFuel: Number(res.ppDeliveryFuelCost != null ? res.ppDeliveryFuelCost : res.ppDeliveryCost) || 0,
      ppDeliveryInClean: Number(res.ppDeliveryInClean) || 0,
      staffCost: res.staffCost != null ? Number(res.staffCost) : 0,
    feeLine: statsPpFeeEchoLine_(res)
  };
  }

  function statsExpectedRows_(res) {
    res = res || {};
    var n = statsExpectedNumbers_(res);
    var lines = [];
    lines.push({ label: "ПП выручка", value: n.ppRevenue + " BYN" });
    if (n.ppRecoverInClean > 0) lines.push({ label: "Recover в чистом", value: n.ppRecoverInClean + " BYN" });
    else if (n.ppRecoverCost > 0) lines.push({ label: "Recover ПП", value: n.ppRecoverCost + " BYN" });
    if (n.ppPackagesCost != null) lines.push({ label: "Пакеты", value: n.ppPackagesCost + " BYN" });
    if (n.ppFractionInClean > 0) lines.push({ label: "Фракции в чистом", value: n.ppFractionInClean + " BYN" });
    if (res.ppDeliveryCost != null || res.ppDeliveryFuelCost != null) {
      lines.push({ label: "Топливо доставок (4×N)", value: n.ppDeliveryFuel + " BYN" });
    }
    if (n.ppDeliveryInClean > 0) lines.push({ label: "Доставка в чистом", value: n.ppDeliveryInClean + " BYN" });
    if (n.staffCost > 0) lines.push({ label: "ЗП (не нарезчик)", value: n.staffCost + " BYN" });
    return {
      profit: n.profit,
      clean: n.clean,
      cost: n.cost,
      deliveries: n.deliveries,
      by: n.by,
      lines: lines,
      feeLine: n.feeLine
    };
  }

  function statsVisiblePartners_(list) {
    return (list || []).filter(function (p) {
      var n = String(p && p.name || "").trim();
      return n && n.indexOf("без партн") < 0;
    });
  }

  function statsCutter_(res) {
    res = res || {};
    var st = res.staff || {};
    var items = (st.items || (res.fact && res.fact.staff) || []).slice();
    var floor = st.floorMonth || (res.fact && res.fact.staffFloorMonth) || "2026-09";
    var cutter = st.cutter || res.cutter || null;
    if (!cutter) {
      var hitC = null;
      for (var i = 0; i < items.length; i++) {
        if (String(items[i].id || "") === "cutter" ||
            String(items[i].name || "").toLowerCase() === "нарезчик") {
          hitC = items[i];
          break;
        }
      }
      cutter = {
        id: "cutter",
        name: "Нарезчик",
        enabled: !!(hitC && (hitC.active !== false)),
        enabledForMonth: !!(res.fact && res.fact.cutter && res.fact.cutter.enabled),
        salary: hitC ? Number(hitC.salary) || 900 : 900,
        fromMonth: hitC ? hitC.fromMonth : floor,
        defaultSalary: 900
      };
      if (hitC && hitC.active === false) cutter.enabled = false;
      if (!hitC) cutter.enabled = false;
      else cutter.enabled = true;
    }
    var salShow = Number(cutter.salary) || Number(cutter.defaultSalary) || 900;
    var globalOn = !!cutter.enabled;
    var monthOn = (cutter.enabledForMonth != null)
      ? !!cutter.enabledForMonth
      : !!(res.fact && res.fact.cutter && res.fact.cutter.enabled);
    return {
      floor: floor,
      salary: salShow,
      globalOn: globalOn,
      monthOn: monthOn,
      fromMonth: cutter.fromMonth || floor
    };
  }

  function statsFacts_(res) {
    res = res || {};
    var pp = res.pp || {};
    var bp = res.bp || {};
    var m = res.month || {};
    var money = res.money || {};
    var fact = res.fact || {};
    var by = fact.bySource || m.bySource || {};
    var costBy = fact.costBySource || m.costBySource || {};
    var deliveries = fact.deliveries != null ? fact.deliveries : (m.deliveries != null ? m.deliveries : (res.deliveries || 0));
    var retail = fact.retail != null ? fact.retail : (money.retail != null ? money.retail : (m.retailRevenue || 0));
    var partnerOrd = fact.partner != null ? fact.partner : (money.partner != null ? money.partner : (m.partnerRevenue || 0));
    var ppActual = fact.ppRevenue != null ? fact.ppRevenue : (pp.actual != null ? pp.actual : (money.ppActual || 0));
    var calTurnover = fact.revenue != null ? fact.revenue : (money.turnover != null ? money.turnover : (Number(ppActual) + Number(retail) + Number(partnerOrd)));
    var costActual = fact.cost != null ? fact.cost : (money.cost || m.costActual || 0);
    var bpSpend = fact.bpCost != null ? fact.bpCost : (bp.spend != null ? bp.spend : (money.bpSpend || 0));
    var bpDeliv = fact.bpDeliveries != null ? fact.bpDeliveries : (bp.deliveries || 0);
    var converted = (bp.convertedToPp != null) ? bp.convertedToPp : 0;
    var productCost = fact.productCost != null ? fact.productCost : 0;
    var couponsCost = fact.couponsCost != null ? fact.couponsCost : 0;
    var retailCost = costBy.retail != null ? costBy.retail : 0;
    var ppBasketCost = fact.ppBasketCost != null ? fact.ppBasketCost : 0;
    var partnerCostApp = costBy.partner != null ? costBy.partner : 0;
    var ppLightCost = fact.ppLightCost != null ? fact.ppLightCost : 0;
    var ppRecoverCost = fact.ppRecoverCost != null ? Number(fact.ppRecoverCost) : Number(ppLightCost) || 0;
    var ppRecoverInClean = Number(fact.ppRecoverInClean) || 0;
    var cutterMonthOn = fact.cutter && fact.cutter.enabledForMonth != null
      ? !!fact.cutter.enabledForMonth
      : (fact.cutter ? !!fact.cutter.enabled : (ppRecoverInClean <= 0));
    var ppPackagesCost = fact.ppPackagesCost != null ? Number(fact.ppPackagesCost) : 0;
    var ppFractionCost = fact.ppFractionCost != null ? Number(fact.ppFractionCost) : 0;
    var ppFractionInClean = fact.ppFractionInClean != null ? Number(fact.ppFractionInClean) : ppFractionCost;
    var ppDeliveryCost = fact.ppDeliveryFuelCost != null ? fact.ppDeliveryFuelCost : (fact.ppDeliveryCost != null ? fact.ppDeliveryCost : 0);
    var ppDeliveryInClean = Number(fact.ppDeliveryInClean) || 0;
    var ppLightPeople = fact.ppLightPeople != null ? fact.ppLightPeople : 0;
    var ppDelivN = fact.ppDeliveries != null ? fact.ppDeliveries : (by.pp || 0);
    var profitFact = fact.profit != null ? fact.profit : calTurnover;
    var cleanFact = fact.clean != null ? fact.clean : statsClean_(calTurnover, costActual);
    var life = bp.life || {};
    var partners = statsVisiblePartners_(fact.byPartner || res.byPartner || []);
    var ppTurnover = (pp.turnover != null) ? pp.turnover : (money.ppTurnover || 0);
    var ppClean = (pp.clean != null) ? pp.clean : (money.ppClean || 0);
    var ppCost = (pp.cost != null) ? pp.cost : (money.ppCost || 0);
    var staffCost = fact.staffCost != null ? fact.staffCost : ((res.staff && res.staff.cost) || 0);
    var staffCount = fact.staffCount != null ? fact.staffCount : ((res.staff && res.staff.count) || 0);
    var charts = res.charts || {};
    var rawStages = charts.bpStages || [
      { label: "БП1", value: bp.bp1 || 0 },
      { label: "БП2", value: bp.bp2 || 0 },
      { label: "Финал", value: bp.final || 0 }
    ];
    var bpClients = 0;
    rawStages.forEach(function (s) { bpClients += Number(s && s.value) || 0; });
    if (!bpClients) {
      bpClients = (Number(bp.bp1) || 0) + (Number(bp.bp2) || 0) + (Number(bp.final) || 0);
    }
    var bpStages = [{ label: "БП", value: bpClients }];
    return {
      oldDeploy: !res.factCutoff,
      monthLabel: res.monthLabel || res.title || "Месяц",
      profitFact: profitFact,
      cleanFact: cleanFact,
      costActual: costActual,
      deliveries: deliveries,
      by: by,
      ppActual: ppActual,
      retail: retail,
      partnerOrd: partnerOrd,
      productCost: productCost,
      retailCost: retailCost,
      ppBasketCost: ppBasketCost,
      partnerCostApp: partnerCostApp,
      couponsCost: couponsCost,
      ppRecoverCost: ppRecoverCost,
      ppRecoverInClean: ppRecoverInClean,
      ppLightPeople: ppLightPeople,
      ppDeliveryCost: ppDeliveryCost,
      ppDelivN: ppDelivN,
      deliveryLabel: statsPpDeliveryLabel_(fact),
      ppPackagesCost: ppPackagesCost,
      bpSpend: bpSpend,
      bpDeliv: bpDeliv,
      staffCost: Number(staffCost) || 0,
      staffCount: staffCount,
      ppFractionInClean: ppFractionInClean,
      ppFractionCost: ppFractionCost,
      ppDeliveryInClean: ppDeliveryInClean,
      bpDelivInClean: Number(fact.bpDeliveryInClean) || 0,
      footnote: statsPpCostFootnote_(fact),
      cutterMonthOn: cutterMonthOn,
      feeLine: statsPpFeeEchoLine_(res),
      bpBasket: fact.bpBasketCost != null ? fact.bpBasketCost : (bp.basketCost || 0),
      bpDelivFee: fact.bpDeliveryCost != null ? fact.bpDeliveryCost : (bp.deliveryCost || 0),
      bpFeeEach: fact.bpDeliveryFeeEach != null ? fact.bpDeliveryFeeEach : (bp.deliveryFeeEach != null ? bp.deliveryFeeEach : 4),
      bpDelivCleanShow: Number(fact.bpDeliveryInClean != null ? fact.bpDeliveryInClean : bp.deliveryInClean) || 0,
      converted: converted,
      cac: bp.costPerConvert,
      life: life,
      partners: partners,
      ppTurnover: ppTurnover,
      ppClean: ppClean,
      ppCost: ppCost,
      bpTotal: bp.total || 0,
      bpStages: bpStages,
      compare: res.compare || {},
      moneyTurnover: money.turnover != null ? money.turnover : calTurnover,
      turnChart: charts.turnover || [],
      cutter: statsCutter_(res)
    };
  }

  function statsPad_(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function statsIso_(y, m, d) {
    return y + "-" + statsPad_(m) + "-" + statsPad_(d);
  }

  function statsMonthSpan_(monthKey, now) {
    var parts = String(monthKey || "").split("-");
    if (parts.length < 2) return null;
    var y = Number(parts[0]);
    var mo = Number(parts[1]);
    if (!y || mo < 1 || mo > 12) return null;
    var last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    var from = statsIso_(y, mo, 1);
    var to = statsIso_(y, mo, last);
    var today = statsMinskYmd_(now || new Date());
    var tIso = statsIso_(today.y, today.m, today.d);
    if (tIso.slice(0, 7) === String(monthKey) && tIso < to) to = tIso;
    return { from: from, to: to };
  }

  function statsPrevCalendarMonth_(monthKey, now) {
    var parts = String(monthKey || "").split("-");
    if (parts.length < 2) return null;
    var y = Number(parts[0]);
    var mo = Number(parts[1]);
    if (!y || mo < 1 || mo > 12) return null;
    var py = mo === 1 ? y - 1 : y;
    var pm = mo === 1 ? 12 : mo - 1;
    var lastPrev = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    var toDay = lastPrev;
    var today = statsMinskYmd_(now || new Date());
    var cur = today.y + "-" + statsPad_(today.m);
    if (String(monthKey) === cur) toDay = Math.min(today.d, lastPrev);
    return { from: statsIso_(py, pm, 1), to: statsIso_(py, pm, toDay), days: toDay };
  }

  function statsIsoAddDays_(iso, days) {
    var p = String(iso || "").split("-");
    if (p.length < 3) return "";
    var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    if (!isFinite(d.getTime())) return "";
    d.setUTCDate(d.getUTCDate() + (Number(days) || 0));
    return statsIso_(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  function statsInclusiveDays_(from, to) {
    var a = Date.parse(String(from) + "T00:00:00Z");
    var b = Date.parse(String(to) + "T00:00:00Z");
    if (!isFinite(a) || !isFinite(b) || b < a) return 0;
    return Math.round((b - a) / 86400000) + 1;
  }

  function statsPrevEqualPeriod_(from, to) {
    var days = statsInclusiveDays_(from, to);
    if (!(days > 0)) return null;
    var prevTo = statsIsoAddDays_(from, -1);
    var prevFrom = statsIsoAddDays_(prevTo, 1 - days);
    if (!prevFrom || !prevTo) return null;
    return { from: prevFrom, to: prevTo, days: days };
  }

  function statsFmtDay_(iso) {
    var p = String(iso || "").slice(0, 10).split("-");
    if (p.length < 3 || p[2].length < 1) return "";
    return p[2] + "." + p[1];
  }

  function statsPctDelta_(current, previous) {
    if (previous == null || previous === "" || !isFinite(Number(previous))) return null;
    var c = Number(current);
    var p = Number(previous);
    if (!isFinite(c) || p === 0) return null;
    var pct = Math.round(((c - p) / Math.abs(p)) * 100);
    var sign = pct > 0 ? "+" : (pct < 0 ? "−" : "");
    return { text: sign + String(Math.abs(pct)) + "%", dir: pct > 0 ? "up" : (pct < 0 ? "down" : "flat") };
  }

  function statsNum_(v) {
    if (v == null || v === "" || !isFinite(Number(v))) return null;
    return Number(v);
  }

  function statsHas_(obj, key) {
    return !!(obj && Object.prototype.hasOwnProperty.call(obj, key) && statsNum_(obj[key]) != null);
  }

  function statsSourceTrio_(revenue, cost) {
    var rev = statsNum_(revenue);
    var c = statsNum_(cost);
    if (rev == null) return { turnover: null, profit: null, clean: null };
    if (c == null) return { turnover: rev, profit: null, clean: null };
    var net = statsClean_(rev, c);
    return { turnover: rev, profit: net, clean: net };
  }

  function statsConvLine_(trials, converted) {
    if (trials == null || converted == null) return { text: "", pct: "", missing: true };
    var pct = Number(trials) > 0 ? Math.round((Number(converted) / Number(trials)) * 100) : null;
    return {
      text: "из " + trials + " перешли " + converted,
      pct: pct == null ? "" : (pct + "%"),
      missing: false
    };
  }

  function statsScreen_(res, prev) {
    res = res || {};
    var fact = res.fact || {};
    var flat = res.fact ? fact : res;
    var bp = res.bp || {};
    var life = bp.life || {};
    var costBy = flat.costBySource || {};
    var turnover = statsNum_(flat.revenue != null ? flat.revenue : res.revenue);
    var cost = statsNum_(flat.cost != null ? flat.cost : res.cost);
    var profit = (turnover != null && cost != null)
      ? statsClean_(turnover, cost)
      : statsNum_(flat.clean != null ? flat.clean : res.clean);
    var deliveries = statsNum_(flat.deliveries != null ? flat.deliveries : res.deliveries);
    var prevRev = prev ? statsNum_(prev.revenue) : null;
    var prevCost = prev ? statsNum_(prev.cost) : null;
    var prevProfit = (prevRev != null && prevCost != null) ? statsClean_(prevRev, prevCost) : (prev ? statsNum_(prev.clean) : null);
    var prevDel = prev ? statsNum_(prev.deliveries) : null;
    var ppCost = statsHas_(costBy, "pp") ? Number(costBy.pp) : null;
    var ppRev = statsNum_(flat.ppRevenue != null ? flat.ppRevenue : res.ppRevenue);
    var retailRev = statsNum_(flat.retail != null ? flat.retail : res.retail);
    var retailCost = statsHas_(costBy, "retail") ? Number(costBy.retail) : null;
    var fuelHas = statsHas_(flat, "ppDeliveryFuelCost") || statsHas_(flat, "ppDeliveryCost");
    var fuelVal = flat.ppDeliveryFuelCost != null ? flat.ppDeliveryFuelCost : flat.ppDeliveryCost;
    var rawHas = statsHas_(flat, "ppBasketCost") || statsHas_(costBy, "retail");
    var rawVal = 0;
    if (statsHas_(flat, "ppBasketCost")) rawVal += Number(flat.ppBasketCost) || 0;
    if (statsHas_(costBy, "retail")) rawVal += Number(costBy.retail) || 0;
    var bpHas = statsHas_(flat, "bpCost") || statsHas_(bp, "spend");
    var bpVal = flat.bpCost != null ? flat.bpCost : bp.spend;
    var recoverHas = statsHas_(flat, "ppRecoverCost");
    var otherHas = statsHas_(flat, "couponsCost") || statsHas_(flat, "ppPackagesCost") || statsHas_(flat, "staffCost");
    var otherSum = 0;
    if (statsHas_(flat, "couponsCost")) otherSum += Number(flat.couponsCost) || 0;
    if (statsHas_(flat, "ppPackagesCost")) otherSum += Number(flat.ppPackagesCost) || 0;
    if (statsHas_(flat, "staffCost")) otherSum += Number(flat.staffCost) || 0;
    var trialsMonth = statsNum_(flat.bpClients != null ? flat.bpClients : res.bpClients);
    var convMonth = statsNum_(bp.convertedToPp);
    var trialsLife = statsHas_(life, "trials") ? Number(life.trials) : null;
    var convLife = statsHas_(life, "converted") ? Number(life.converted) : null;
    function cell(label, value, delta) {
      return { label: label, value: value, missing: value == null, delta: delta || null };
    }
    function exp(label, has, value) {
      return { label: label, missing: !has, value: has ? Number(value) || 0 : null };
    }
    return {
      head: [
        cell("Оборот", turnover, statsPctDelta_(turnover, prevRev)),
        cell("Прибыль", profit, statsPctDelta_(profit, prevProfit)),
        cell("Себестоимость", cost, statsPctDelta_(cost, prevCost)),
        cell("Количество доставок", deliveries, statsPctDelta_(deliveries, prevDel))
      ],
      pp: statsSourceTrio_(ppRev, ppCost),
      retail: statsSourceTrio_(retailRev, retailCost),
      partnerTurnover: statsNum_(flat.partner != null ? flat.partner : res.partner),
      expenses: [
        exp("Топливо", fuelHas, fuelVal),
        exp("Сырьё", rawHas, rawVal),
        exp("БП", bpHas, bpVal),
        exp("Партнёры", statsHas_(costBy, "partner"), costBy.partner),
        exp("Рековер", recoverHas, flat.ppRecoverCost),
        exp("Свет", false, null),
        exp("Прочее", otherHas, otherSum)
      ],
      bpMonth: {
        conv: statsConvLine_(trialsMonth, convMonth),
        spent: bpHas ? Number(bpVal) || 0 : null,
        net: null,
        payback: null
      },
      bpLife: {
        conv: statsConvLine_(trialsLife, convLife),
        spent: statsHas_(life, "bpCostAll") ? Number(life.bpCostAll) : null,
        net: null,
        payback: null
      }
    };
  }

  return {
    currentStatsMonthKey_: currentStatsMonthKey_,
    statsMonthLabelRu_: statsMonthLabelRu_,
    shiftStatsMonthKey_: shiftStatsMonthKey_,
    statsMonthBounds_: statsMonthBounds_,
    statsMonthSpan_: statsMonthSpan_,
    statsPrevCalendarMonth_: statsPrevCalendarMonth_,
    statsPrevEqualPeriod_: statsPrevEqualPeriod_,
    statsFmtDay_: statsFmtDay_,
    statsPctDelta_: statsPctDelta_,
    statsScreen_: statsScreen_,
    statsPpSchemeOf_: statsPpSchemeOf_,
    statsPpDeliveryLabel_: statsPpDeliveryLabel_,
    statsPpCostFootnote_: statsPpCostFootnote_,
    statsPpFeeEchoLine_: statsPpFeeEchoLine_,
    statsConvLine_: statsConvLine_,
    statsBarPct_: statsBarPct_,
    statsDelta_: statsDelta_,
    statsClean_: statsClean_,
    statsExpectedNumbers_: statsExpectedNumbers_,
    statsExpectedRows_: statsExpectedRows_,
    statsVisiblePartners_: statsVisiblePartners_,
    statsCutter_: statsCutter_,
    statsFacts_: statsFacts_
  };
});
