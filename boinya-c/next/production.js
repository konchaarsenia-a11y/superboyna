/* Производство: нарезка, сборка, маршрут. Запросы и порядок маршрута — как в app.main.js. */
(function (root) {
  "use strict";

  var access = null;
  var seg = "cut";
  var cutItems = [];
  var cutDate = "";
  var cutDone = null;
  var cutDetail = false;
  var cutSession = { active: false, startedAt: 0, day: "", timer: null, poll: null };
  var cutFlags = Object.create(null);
  var asm = null;
  var asmDaySeen = "";
  var asmDetail = false;
  var asmFlags = Object.create(null);
  var packOn = { "маленький": true, "средний": true, "большой": true, "целое": true, "крафт": true };
  var cour = [];
  var courDetail = false;
  var courOpen = Object.create(null);
  var courFlags = Object.create(null);
  var courAsmPoll = null;
  var courAsmBusy = false;
  var planHtml = "";
  var depotAddr = "Белецкого 10к2";
  var depotName = "Склад";
  var depotId = "";
  var warehouses = [];
  var couriersN = 1;

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function ax() { return root.BoinyaAccess; }
  function rt() { return root.BoinyaRoute; }
  function price() { return root.BoinyaPrice; }
  function eng() { return root.BoinyaOrderEngine; }
  function maps() { return root.CourierMaps; }
  function esc(s) { return sh().esc(s); }

  function prettyName(raw) {
    var n = String(raw || "").trim();
    if (!n) return "";
    var e = eng();
    if (e && e.prettyProductName) {
      try { return e.prettyProductName(n) || n; } catch (err) {}
    }
    return n;
  }

  function crumbSourcesOf(g) {
    var out = [];
    if (g && Array.isArray(g.sources)) {
      g.sources.forEach(function (s) {
        var name = "";
        var val = null;
        var unit = "";
        var sub = "";
        if (typeof s === "string") name = s;
        else if (s) {
          name = s.name || s.main || "";
          val = s.val != null ? s.val : (s.value != null ? s.value : null);
          unit = s.unit || "";
          sub = s.sub || "";
        }
        name = String(name || "").trim();
        if (!name) return;
        out.push({ name: name, val: val, unit: unit, sub: sub });
      });
    }
    if (out.length) return out;
    var sub = String((g && g.sub) || "").trim();
    if (sub.indexOf("+") >= 0) {
      sub.split(/\s*\+\s*/).forEach(function (part) {
        var p = String(part || "").trim();
        if (p && !/^крошка$/i.test(p)) out.push({ name: p, val: null, unit: "", sub: "" });
      });
    }
    return out;
  }

  function isCrumbMix(g) {
    var name = String((g && (g.name || g.main)) || "");
    if (/крошк\w*\s*микс/i.test(name)) return true;
    return crumbSourcesOf(g).length >= 2;
  }

  function mixPartQty(g, src, index, count) {
    var own = Number(src.val);
    if (isFinite(own) && own > 0) {
      return { qty: own, unit: src.unit || "г" };
    }
    var ratio = Array.isArray(g.ratio) ? g.ratio : [];
    var sumR = 0;
    var i;
    for (i = 0; i < count; i++) sumR += Number(ratio[i]) || 0;
    if (!(sumR > 0)) return null;
    var grams = Number(g.val != null ? g.val : g.value) || 0;
    if (!(grams > 0)) return null;
    var part = (Number(ratio[index]) || 0) / sumR;
    if (!(part > 0)) return null;
    var q = Math.round(grams * part);
    if (q <= 0) q = 1;
    return { qty: q, unit: src.unit || g.unit || "г" };
  }

  function basketLinesHtml(basket) {
    var mix = root.BoinyaCrumbMix;
    if (mix && mix.linesHtml) return mix.linesHtml(basket, prettyName);
    return (basket || []).map(function (g) {
      if (!g) return "";
      var nm = prettyName(g.name || g.main || "");
      var val = g.val != null ? g.val : g.value;
      var unit = g.unit || "";
      var word = "";
      var cut = root.BoinyaCutFrac;
      if (cut && cut.applies(g)) {
        word = cut.phrase ? cut.phrase(g) : cut.label(g.frac);
        if (word && (!unit || unit === "гр")) unit = cut.defaultUnit(g);
      }
      var bit = val != null && val !== "" ? (" " + val + (unit ? " " + unit : "")) : "";
      if (word) bit += " " + word;
      return "<div>" + esc(nm + bit) + "</div>";
    }).filter(Boolean).join("");
  }

  function days() {
    var w = root.BoinyaWeek && root.BoinyaWeek.WEEK;
    return w || ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье", "Будущая неделя"];
  }

  function weekday(offset) {
    var names = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
    var d = new Date();
    d.setDate(d.getDate() + (offset || 0));
    return names[d.getDay()];
  }

  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function dayOf(kind) {
    if (kind === "cut") return lsGet("opsDayCutting") || weekday(1);
    return lsGet("opsDayCourier") || lsGet("opsDayAssembly") || weekday(0);
  }

  function rememberDay(kind, day) {
    if (!day) return;
    if (kind === "cut") lsSet("opsDayCutting", day);
    else {
      lsSet("opsDayCourier", day);
      lsSet("opsDayAssembly", day);
    }
  }

  function segItems() {
    var list = [];
    if (!access) return list;
    if (ax().tabHas(access, "cuttingScreen")) list.push({ id: "cut", label: "Нарезка" });
    if (ax().tabHas(access, "courierScreen.assembly")) list.push({ id: "pack", label: "Сборка" });
    if (ax().tabHas(access, "courierScreen.route")) list.push({ id: "route", label: "Курьер" });
    return list;
  }

  function segBar() {
    var items = segItems();
    if (items.length < 2) return "";
    return '<div class="b-seg" style="margin-bottom:16px">' + items.map(function (s) {
      return '<button type="button" class="b-seg__item' + (s.id === seg ? " b-seg__item--on" : "") + '" data-act="pseg" data-seg="' + s.id + '">' + esc(s.label) + "</button>";
    }).join("") + "</div>";
  }

  function dayField(id, value) {
    var opts = days().map(function (d) {
      return '<option value="' + esc(d) + '"' + (d === value ? " selected" : "") + ">" + esc(d) + "</option>";
    }).join("");
    return '<label class="b-field"><span class="b-note">День</span><select class="b-field__input" id="' + id + '">' + opts + "</select></label>";
  }

  function flagOn(v) {
    return v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";
  }

  function cutKey(it) {
    var row = Number(it && it.row);
    if (row) return "r" + row;
    return "n" + String(it && it.name || "");
  }

  function formatElapsed(ms) {
    var totalSec = Math.max(0, Math.min(Math.floor(Number(ms) / 1000) || 0, 12 * 3600));
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function cutCounters() {
    var toCut = 0, laidOnly = 0, both = 0;
    cutItems.forEach(function (it) {
      if (it.done && it.laid) both++;
      else if (it.laid && !it.done) laidOnly++;
      if (!it.done) toCut++;
    });
    return { toCut: toCut, laidOnly: laidOnly, both: both };
  }

  function sortCut() {
    cutItems.sort(function (a, b) {
      function rank(it) {
        if (it.done && it.laid) return 3;
        if (it.done) return 2;
        if (it.laid) return 1;
        return 0;
      }
      var d = rank(a) - rank(b);
      if (d) return d;
      return (a.row || 0) - (b.row || 0);
    });
  }

  function applyCutLocal(items) {
    var now = Date.now();
    items.forEach(function (it) {
      var o = cutFlags[cutKey(it)];
      if (!o) return;
      if (now - (o.ts || 0) > 1800000) { delete cutFlags[cutKey(it)]; return; }
      if (o.laid !== undefined) it.laid = !!o.laid;
      if (o.done !== undefined) it.done = !!o.done;
      if (o.outNext !== undefined) it.outNext = !!o.outNext;
      if (o.surplus !== undefined) it.surplus = o.surplus;
    });
  }

  function rememberCut(it, patch) {
    var k = cutKey(it);
    var o = cutFlags[k] || { ts: Date.now() };
    o.ts = Date.now();
    if (patch.laid !== undefined) o.laid = !!patch.laid;
    if (patch.done !== undefined) o.done = !!patch.done;
    if (patch.outNext !== undefined) o.outNext = !!patch.outNext;
    if (patch.surplus !== undefined) o.surplus = patch.surplus;
    cutFlags[k] = o;
  }

  function cutNote(item) {
    var info = item && item.noteInfo;
    if (!info || !info.noted || !info.groups || !info.groups.length) return "";
    var unit = item.unit === "шт" ? "шт" : "гр";
    var total = Number(item.dry) || 0;
    var noted = Math.min(Number(info.noted) || 0, total);
    var plain = Math.max(0, total - noted);
    var html = '<p class="b-note">';
    if (plain > 0 && noted > 0) html += "Обычных: " + plain + " " + unit + " · с примечанием: " + noted + " " + unit;
    else if (noted > 0) html += "Все с примечанием: " + noted + " " + unit;
    html += info.groups.map(function (g) {
      var who = (g.clients || []).slice(0, 3).join(", ");
      return "<br>" + esc(String(g.qty)) + " " + unit + " — «" + esc(g.text || "") + "»" + (who ? " · " + esc(who) : "");
    }).join("");
    return html + "</p>";
  }

  function cutSizesNote(item) {
    var cut = root.BoinyaCutFrac;
    if (!cut || !item || !item.sizes) return "";
    var text = cut.sizesText(item.sizes, item.unit);
    if (!text) return "";
    return '<p class="b-note">' + esc(text) + "</p>";
  }

  function paintCutRow(it, readonly) {
    var key = cutKey(it);
    var dry = it.unit === "шт" ? (it.dry + " шт") : (it.dry + " гр сухого");
    var raw = it.unit === "шт" ? (it.raw + " шт") : (Number(it.raw).toFixed(2) + " кг сырого");
    var cls = "b-card";
    if (it.done && it.laid) cls += " nx-dim";
    var html = '<article class="' + cls + '" style="margin-top:12px" data-cut="' + esc(key) + '">';
    html += '<div class="nx-cut-head"><button type="button" class="b-chip' + (it.outNext ? " b-chip--on" : "") + '" data-act="pr-bang" data-k="' + esc(key) + '"' + (readonly ? " disabled" : "") + '>!</button>';
    html += '<p class="b-li__title" style="margin:0">' + esc(it.name || "") + "</p></div>";
    html += '<p class="b-note">Нужно: ' + esc(String(dry)) + "<br>Сырьё: " + esc(String(raw)) + (Number(it.surplus) ? ", излишек " + esc(String(it.surplus)) : "") + "</p>";
    html += cutNote(it);
    html += cutSizesNote(it);
    if (!readonly) {
      html += '<button type="button" class="b-btn nx-cut-btn ' + (it.laid ? "b-btn--main" : "b-btn--sec") + '" data-act="pr-laid" data-key="' + esc(key) + '">Выложено</button>';
      html += '<button type="button" class="b-btn nx-cut-btn ' + (it.done ? "b-btn--main" : "b-btn--sec") + '" data-act="pr-done" data-key="' + esc(key) + '">Нарезано</button>';
      html += '<label class="b-field" style="margin-top:8px"><span class="b-note">Излишек</span><input class="b-field__input" id="surplus_' + esc(key) + '" inputmode="decimal" value="' + esc(String(it.surplus || 0)) + '"></label>';
      html += '<button type="button" class="b-btn b-btn--sec" data-act="pr-surplus" data-k="' + esc(key) + '" style="margin-top:8px">Сохранить излишек</button>';
    } else {
      var badges = [];
      if (it.laid) badges.push("выложено");
      if (it.done) badges.push("нарезано");
      if (it.outNext) badges.push("нет на след.");
      if (badges.length) html += '<p class="b-note">' + esc(badges.join(", ")) + "</p>";
    }
    return html + "</article>";
  }

  function paintCut() {
    var day = dayOf("cut");
    var html = segBar() + dayField("nxCutDay", day);
    if (cutDone && !cutDetail) {
      html += '<article class="b-card" style="margin-top:12px"><p class="b-li__title" style="margin:0">Нарезка завершена</p>' +
        '<p class="b-note">Позиций: ' + esc(String(cutDone.count || cutItems.length || 0)) + "<br>Время: " + esc(formatElapsed(cutDone.elapsedMs || 0)) + "</p>" +
        '<p class="b-note">День закрыт</p>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="pr-cut-more">Подробнее</button></article>';
      sh().dock("");
      sh().main(html);
      return;
    }
    var c = cutCounters();
    html += '<div class="nx-stats">' +
      '<div class="b-card"><b>' + c.toCut + '</b><span class="b-note">осталось нарезать</span></div>' +
      '<div class="b-card"><b>' + c.laidOnly + '</b><span class="b-note">выложено, не нарезано</span></div>' +
      '<div class="b-card"><b>' + c.both + '</b><span class="b-note">выложено и нарезано</span></div></div>';
    if (cutSession.active) {
      html += '<article class="b-card" style="margin-top:12px"><p class="b-li__title" id="nxCutTimer" style="margin:0">' + esc(formatElapsed(Date.now() - cutSession.startedAt)) + '</p><p class="b-note">идёт нарезка</p></article>';
    } else if (cutItems.length) {
      html += '<button type="button" class="b-btn b-btn--main" data-act="pr-cut-start" style="margin-top:12px">Начать нарезку</button>';
    }
    html += cutProgressHtml();
    if (cutDone && cutDetail) html += '<button type="button" class="nx-link" data-act="pr-cut-back">← Итог</button><p class="b-note">Просмотр</p>';
    if (!cutItems.length && !cutDone) html += '<p class="b-note">На этот день резать нечего — или день ещё считается.</p>';
    cutItems.forEach(function (it) { html += paintCutRow(it, !!cutDone); });
    if (cutSession.active && !cutDone) {
      html += '<button type="button" class="b-btn b-btn--main" data-act="pr-cut-finish" style="margin-top:12px">Завершить нарезку</button>';
    }
    sh().dock("");
    sh().main(html);
    tickCut();
  }

  function cutProgressHtml() {
    var lib = root.BoinyaCutProgress;
    if (!lib || !cutItems.length) return "";
    var r = lib.summarize(cutItems);
    var html = '<div class="nx-prog">';
    html += '<div class="nx-bar" role="img" aria-label="' + r.total + ' процентов"><span style="width:' + r.total + '%"></span></div>';
    html += '<p class="nx-prog__pct">' + r.total + "%</p>";
    html += '<p class="nx-prog__line">' + esc(r.line) + "</p>";
    html += "</div>";
    return html;
  }

  function tickCut() {
    if (cutSession.timer) clearInterval(cutSession.timer);
    cutSession.timer = null;
    if (!cutSession.active || seg !== "cut") return;
    cutSession.timer = setInterval(function () {
      var el = document.getElementById("nxCutTimer");
      if (!el || !cutSession.active) return;
      el.textContent = formatElapsed(Date.now() - cutSession.startedAt);
    }, 1000);
  }

  function currentDay(id, kind) {
    var el = document.getElementById(id);
    var day = el && el.value;
    if (day) rememberDay(kind, day);
    return day || dayOf(kind);
  }

  async function loadCut() {
    var day = currentDay("nxCutDay", "cut");
    if (!cutItems.length && !cutDone) sh().main(segBar() + dayField("nxCutDay", day) + sh().skeleton(3));
    var res = null;
    try {
      res = await api().apiGet({ action: "getCutting", day: day }, { timeoutMs: 28000, cacheTtlMs: 8000 });
    } catch (e) {
      sh().toast("Не обновилось");
      paintCut();
      return;
    }
    if (res && res.fromCalendar && !res.fromGas && !res.fromOrders) {
      sh().toast("Считаю нарезку по таблице…");
      return;
    }
    cutDate = (res && res.date) || cutDate;
    if (res && res.completion) {
      cutDone = res.completion;
      cutItems = ((res.items && res.items.length) ? res.items : (cutDone.items || [])).slice();
      cutSession.active = false;
      paintCut();
      return;
    }
    cutDone = null;
    var items = (res && res.items) || [];
    items.forEach(function (it) {
      it.laid = flagOn(it.laid);
      it.done = flagOn(it.done);
      it.outNext = flagOn(it.outNext);
    });
    applyCutLocal(items);
    cutItems = items;
    sortCut();
    var session = (res && res.session) || {};
    var active = !!session.active && (!session.day || String(session.day) === String(day));
    var started = Number(session.startedAt) || 0;
    if (active && (!started || Date.now() - started > 12 * 3600 * 1000)) started = Date.now();
    cutSession.active = active;
    cutSession.startedAt = active ? started : 0;
    cutSession.day = active ? day : "";
    paintCut();
  }

  function findCut(key) {
    for (var i = 0; i < cutItems.length; i++) if (cutKey(cutItems[i]) === key) return cutItems[i];
    return null;
  }

  async function persistCut(it, patch) {
    var day = currentDay("nxCutDay", "cut");
    if (!day || !it) return false;
    rememberCut(it, patch);
    var params = { action: "updateCutting", day: day, row: String(it.row || ""), _: String(Date.now()) };
    if (it.name) params.name = it.name;
    if (patch.laid !== undefined) params.laid = patch.laid ? "true" : "false";
    if (patch.done !== undefined) params.done = patch.done ? "true" : "false";
    if (patch.outNext !== undefined) params.outNext = patch.outNext ? "true" : "false";
    if (patch.surplus !== undefined) params.surplus = String(patch.surplus);
    var ok = false;
    try {
      var res = await api().apiGet(params, { timeoutMs: 22000, cacheTtlMs: 0 });
      if (res && (res.status === "success" || res.optimistic || res.wrote)) ok = true;
    } catch (eGet) {}
    if (!ok) {
      try {
        var body = { action: "updateCutting", day: day, row: Number(it.row) || it.row, name: it.name || "" };
        if (patch.laid !== undefined) body.laid = !!patch.laid;
        if (patch.done !== undefined) body.done = !!patch.done;
        if (patch.outNext !== undefined) body.outNext = !!patch.outNext;
        if (patch.surplus !== undefined) body.surplus = patch.surplus;
        var post = await api().apiPost(body);
        if (post && post.status !== "error") ok = true;
      } catch (ePost) {}
    }
    if (!ok) sh().toast("Галочка не сохранилась — нажми ещё раз");
    return ok;
  }

  async function startCut() {
    var day = currentDay("nxCutDay", "cut");
    if (!day) { sh().toast("Сначала выберите день"); return; }
    if (!cutItems.length) { sh().toast("Нечего резать"); return; }
    var startedAt = Date.now();
    try {
      var res = await api().apiGet({ action: "startCuttingSession", day: day, startedAt: startedAt }, { timeoutMs: 20000, cacheTtlMs: 0 });
      var session = (res && res.session) || { active: true, startedAt: startedAt };
      cutSession.startedAt = Number(session.startedAt) || startedAt;
    } catch (e) {
      cutSession.startedAt = startedAt;
    }
    cutSession.active = true;
    cutSession.day = day;
    sh().toast("Нарезка началась — видно всем");
    paintCut();
  }

  async function finishCut() {
    var day = currentDay("nxCutDay", "cut");
    if (!day) { sh().toast("Выберите день"); return; }
    if (!cutSession.active) { sh().toast("Сначала нажмите «Начать нарезку»."); return; }
    var pending = cutItems.filter(function (x) { return !x.done; });
    var ready = [];
    var missing = [];
    if (pending.length) {
      for (var i = 0; i < pending.length; i++) {
        var it = pending[i];
        var ans = await sh().choice({
          title: "Позиция: " + it.name,
          text: "Есть в наличии и заготовлена?",
          options: [
            { label: "Да, заготовлена", value: "ready" },
            { label: "Нет в наличии", value: "missing" },
            { label: "Отмена", value: "cancel" }
          ]
        });
        if (ans == null || ans === "cancel") { sh().toast("Отменено"); return; }
        if (ans === "ready") ready.push({ row: it.row, name: it.name });
        else missing.push({ row: it.row, name: it.name });
      }
    } else {
      var ok = await sh().confirm({ title: "Завершить нарезку", text: "Все позиции уже отмечены. Завершить нарезку?", ok: "Завершить" });
      if (!ok) return;
    }
    ready.forEach(function (r) {
      cutItems.forEach(function (x) {
        if ((r.name && String(x.name) === String(r.name)) || Number(x.row) === Number(r.row)) {
          x.done = true;
          x.laid = true;
        }
      });
    });
    var flags = rt().cuttingFlags(cutItems);
    var readyRows = ready.map(function (r) { return r.row; }).join(",");
    var miss = rt().missingEnc(missing);
    var elapsed = cutSession.startedAt ? (Date.now() - cutSession.startedAt) : 0;
    sh().toast("Завершаю…");
    var res = null;
    try {
      res = await api().apiGet({
        action: "finishCutting", day: day, elapsed: elapsed, flags: flags, readyRows: readyRows, missing: miss
      }, { timeoutMs: 45000, cacheTtlMs: 0 });
    } catch (e1) {}
    if (!res || res.status !== "success") {
      var ticket = "f" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
      try {
        await api().apiPost({
          action: "prepareFinishCutting",
          ticket: ticket,
          day: day,
          ready: ready,
          missing: missing,
          items: cutItems.map(function (it) {
            return { row: it.row, done: !!it.done, laid: !!it.laid, outNext: !!it.outNext, surplus: Number(it.surplus) || 0 };
          }),
          elapsed: elapsed
        });
      } catch (ePrep) {}
      await new Promise(function (r) { setTimeout(r, 500); });
      try {
        res = await api().apiGet({ action: "finishCutting", ticket: ticket, day: day, elapsed: elapsed, flags: flags }, { timeoutMs: 30000, cacheTtlMs: 0 });
      } catch (e2) {}
    }
    if (!res || res.status !== "success") {
      sh().toast("Не удалось сохранить завершение нарезки");
      return;
    }
    cutSession.active = false;
    cutDone = res.completion || {
      day: day,
      elapsedMs: elapsed,
      count: cutItems.length,
      items: cutItems.slice()
    };
    cutDetail = false;
    if (missing.length) sh().toast("Дефицит отмечен");
    else sh().toast("Нарезка завершена за " + formatElapsed(elapsed));
    paintCut();
  }

  function dressuraBlock(clients) {
    var mix = root.BoinyaCrumbMix;
    if (!mix || !mix.dressuraSummary || !mix.dressuraSummaryHtml) return "";
    var basket = [];
    (clients || []).forEach(function (c) {
      (c && c.basket || []).forEach(function (it) { basket.push(it); });
    });
    var html = mix.dressuraSummaryHtml(mix.dressuraSummary(basket, prettyName));
    if (!html) return "";
    return '<p class="b-lbl">Дрессура</p>' + html;
  }

  function basketForPacks(basket, printed) {
    if (!printed) return basket || [];
    return (basket || []).filter(function (it) {
      var name = String((it && (it.name || it.main)) || "");
      var cat = String((it && it.cat) || "").toLowerCase();
      if (cat === "chew" || cat === "chews") return false;
      if (eng() && eng().isPieceSkuName && eng().isPieceSkuName(name)) return false;
      return true;
    });
  }

  function localPacks(basket, printed) {
    var fn = price() && price().buildAssemblyPacksLocal;
    if (!fn) return [];
    return fn(basketForPacks(basket, printed), packOn) || [];
  }

  function asmTitle(c) {
    if (c.dogPart && c.dogName) {
      var owner = c.ownerName || String(c.name || "").replace(/\s*[·•#]\s*2\s*$/i, "").trim();
      return owner + ", " + c.dogName;
    }
    if (Number(c.dogPart) === 1) return (c.ownerName || c.name) + ", Собака 1";
    if (Number(c.dogPart) === 2) return (c.ownerName || c.name) + ", Собака 2";
    return c.displayName || c.name || "";
  }

  function paintAsm() {
    var day = dayOf("pack");
    var html = segBar() + dayField("nxAsmDay", day);
    html += '<button type="button" class="b-btn b-btn--sec" data-act="pr-asm-reload" style="margin-top:8px">Посчитать пакеты</button>';
    var res = asm;
    if (!res || !(res.clients || []).length) {
      html += '<p class="b-note">Нет клиентов на сборку.</p>';
      sh().main(html);
      return;
    }
    var clients = (res.clients || []).slice().sort(function (a, b) {
      var d = (a.assembled ? 1 : 0) - (b.assembled ? 1 : 0);
      if (d) return d;
      return String(a.name || "").localeCompare(String(b.name || ""), "ru");
    });
    var dateIso = res.dateIso || res.date || "";
    var packsApi = root.BoinyaAsmPacks;
    if (packsApi && packsApi.collapse) clients = packsApi.collapse(clients, dateIso);
    else if (packsApi) clients = packsApi.dedupe(clients, dateIso);
    var pending = clients.filter(function (c) { return !c.assembled; });
    var order = ["маленький", "средний", "большой", "целое", "крафт"];
    var tallied = packsApi ? packsApi.tally(pending, function (c) { return localPacks(c.basket, c.printed); }, dateIso) : null;
    var totals = {};
    order.forEach(function (k) { totals[k] = tallied ? (tallied.totals[k] || 0) : 0; });
    if (!tallied) {
      pending.forEach(function (c) {
        localPacks(c.basket, c.printed).forEach(function (p) {
          var k = p.counterKey;
          if (!k || k === "крафт") return;
          totals[k] = (totals[k] || 0) + (Number(p.bags) || 0);
        });
      });
    }
    var tallyRows = tallied ? tallied.rows : [];
    function rowKeyOf(c) {
      if (!packsApi || !c) return "";
      return packsApi.ownerKey(c) + "#" + String(Number(c.dogPart) || 0) + "#" + String(c.name || "").toUpperCase();
    }
    function rowOf(c) {
      var i;
      var want = rowKeyOf(c);
      for (i = 0; i < tallyRows.length; i++) {
        if (tallyRows[i].client === c) return tallyRows[i];
        if (want && rowKeyOf(tallyRows[i].client) === want) return tallyRows[i];
      }
      return null;
    }
    var enabledTotal = 0;
    order.forEach(function (k) { if (packOn[k] !== false) enabledTotal += totals[k] || 0; });
    var doneN = clients.filter(function (c) { return c.assembled; }).length;
    if (asmDetail) html += '<button type="button" class="nx-link" data-act="pr-asm-back">← Итог</button>';
    if (doneN === clients.length && clients.length && !asmDetail) {
      html += '<article class="b-card" style="margin-top:12px"><p class="b-li__title" style="margin:0">Сборка завершена</p>' +
        '<p class="b-note">Клиентов: ' + clients.length + ", пакетов: " + enabledTotal + "</p>" +
        '<p class="b-note">Все собраны</p>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="pr-asm-more">Подробнее</button></article>';
      sh().main(html);
      return;
    }
    html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl">Форматы пакетов</p><div class="nx-counters">';
    order.forEach(function (k) {
      if (!(totals[k] > 0) && packOn[k] !== false) return;
      html += '<button type="button" class="nx-count' + (packOn[k] === false ? " nx-dim" : "") + '" data-act="pr-pack" data-k="' + esc(k) + '"><b>' + (totals[k] || 0) + "</b><span>" + esc(k) + "</span></button>";
    });
    html += "</div>";
    html += '<p class="b-note">Итого пакетов: ' + enabledTotal + ", собрано " + doneN + " / " + clients.length + "</p>";
    html += dressuraBlock(pending);
    html += "</article>";
    clients.forEach(function (c) {
      var row = rowOf(c);
      var by = {};
      if (row) {
        Object.keys(row.by || {}).forEach(function (k) {
          if (packOn[k] === false) return;
          by[k] = row.by[k];
        });
      } else {
        localPacks(c.basket, c.printed).forEach(function (p) {
          if (packOn[p.counterKey] === false || p.counterKey === "крафт") return;
          by[p.counterKey] = (by[p.counterKey] || 0) + (Number(p.bags) || 0);
        });
      }
      var bags = 0;
      Object.keys(by).forEach(function (k) { bags += Number(by[k]) || 0; });
      var summary = order.filter(function (k) { return by[k] > 0; }).map(function (k) { return by[k] + " " + k; }).join(", ") || "—";
      var lines = basketLinesHtml(c.basket);
      lines = lines ? '<div class="b-note mix-list">' + lines + "</div>" : '<p class="b-note">Пустой состав</p>';
      html += '<article class="b-card' + (c.assembled ? " nx-dim" : "") + '" style="margin-top:12px">' +
        '<label class="nx-check"><input type="checkbox" data-act="pr-asm" data-name="' + esc(c.name || "") + '"' + (c.assembled ? " checked" : "") + "> " +
        esc(asmTitle(c)) + ", " + bags + " пак. " +
        '<span class="plaque ' + (c.assembled ? "plaque--gold" : "plaque--bad") + '">' + (c.assembled ? "собран" : "не собран") + "</span>" +
        (c.printed ? ", пропечатано" : "") + "</label>" +
        '<label class="nx-check" style="margin-top:8px"><input type="checkbox" data-act="pr-print" data-name="' + esc(c.name || "") + '"' + (c.printed ? " checked" : "") + '> Пропечатано <span class="b-note">(без лакомств)</span></label>' +
        lines +
        '<p class="b-note">Пакеты: ' + esc(summary) + (c.printed ? ", без лакомств" : "") + "</p></article>";
    });
    sh().main(html);
  }

  async function loadAsm(force) {
    var day = currentDay("nxAsmDay", "pack");
    if (asmDaySeen && asmDaySeen !== day) asm = null;
    asmDaySeen = day;
    if (force) asmDetail = false;
    if (!asm) sh().main(segBar() + dayField("nxAsmDay", day) + sh().skeleton(3));
    var res = null;
    try {
      var req = { action: "getAssembly", day: day };
      if (force) req.force = "1";
      res = await api().apiGet(req, { timeoutMs: 22000, cacheTtlMs: force ? 0 : 15000 });
    } catch (e) {
      sh().toast("Ошибка сети");
      paintAsm();
      return;
    }
    if (!res || res.status !== "success") {
      asm = { clients: [] };
      paintAsm();
      return;
    }
    (res.clients || []).forEach(function (c) {
      var o = asmFlags[String(c.name || "").toUpperCase()];
      if (!o) return;
      if (Date.now() - (o.ts || 0) > 1800000) return;
      if (o.assembled !== undefined) c.assembled = !!o.assembled;
      if (o.printed !== undefined) c.printed = !!o.printed;
    });
    asm = res;
    paintAsm();
  }

  function findAsm(name) {
    var list = (asm && asm.clients) || [];
    for (var i = 0; i < list.length; i++) if (String(list[i].name || "") === String(name || "")) return list[i];
    return null;
  }

  async function setAsmFlag(name, patch) {
    var c = findAsm(name);
    var day = currentDay("nxAsmDay", "pack");
    if (!c || !day) return;
    var key = String(c.name || "").toUpperCase();
    var prev = { assembled: !!c.assembled, printed: !!c.printed };
    if (patch.assembled !== undefined) c.assembled = !!patch.assembled;
    if (patch.printed !== undefined) c.printed = !!patch.printed;
    if (patch.assembled === false) asmDetail = true;
    asmFlags[key] = { assembled: c.assembled, printed: c.printed, ts: Date.now() };
    paintAsm();
    try { overlayCour(cour, (asm && asm.clients) || []); } catch (eOv) {}
    try {
      var body = patch.printed !== undefined
        ? { action: "setPrinted", day: day, client: c.name, printed: !!c.printed }
        : { action: "setAssembled", day: day, client: c.name, matchKey: c.matchKey || "", dogPart: c.dogPart || "", assembled: !!c.assembled };
      var res = await api().apiPost(body);
      if (!res || (res.status !== "success" && res.status !== "sent_opaque")) throw new Error("save");
      if (patch.printed !== undefined) sh().toast(c.printed ? ("Пропечатано без лакомств: " + c.name) : ("Печать сброшена: " + c.name));
      else sh().toast(c.assembled ? ("Собран: " + (c.dogName || c.name)) : ("Снято: " + (c.dogName || c.name)));
    } catch (e) {
      c.assembled = prev.assembled;
      c.printed = prev.printed;
      asmFlags[key] = { assembled: c.assembled, printed: c.printed, ts: Date.now() };
      try { overlayCour(cour, (asm && asm.clients) || []); } catch (eOv2) {}
      sh().toast("Не удалось сохранить");
      paintAsm();
    }
  }

  function asmDogs(list, dateIso) {
    var api = root.BoinyaAsmPacks;
    if (api && api.collapse) return api.collapse(list || [], dateIso || "");
    return list || [];
  }

  function overlayCour(list, asmClients) {
    var lib = root.BoinyaCourierAsm;
    if (!lib || !list) return list;
    lib.apply(list, asmDogs(asmClients), { localFlags: asmFlags });
    return list;
  }

  function courBadge(c) {
    var lib = root.BoinyaCourierAsm;
    if (lib) return lib.badgeText(c);
    return c && c.assembled ? "собран" : "не собран";
  }

  function stopCourAsmPoll() {
    if (courAsmPoll) {
      clearInterval(courAsmPoll);
      courAsmPoll = null;
    }
  }

  function startCourAsmPoll() {
    if (courAsmPoll) return;
    courAsmPoll = setInterval(function () {
      if (seg !== "route" || (typeof document !== "undefined" && document.hidden)) return;
      refreshCourAsm();
    }, 12000);
  }

  async function refreshCourAsm() {
    if (courAsmBusy || seg !== "route") return;
    var day = (cour && cour._day) || currentDay("nxCourDay", "route");
    if (!day || !cour || !cour.length) return;
    var lib = root.BoinyaCourierAsm;
    if (!lib) return;
    courAsmBusy = true;
    try {
      var res = await api().apiGet(
        { action: "getAssembly", day: day },
        { timeoutMs: 7000, cacheTtlMs: 8000 }
      );
      if (seg !== "route" || !res || res.status !== "success" || !Array.isArray(res.clients)) return;
      if (String(cour._day || "") !== String(day)) return;
      var before = lib.sig(cour);
      overlayCour(cour, asmDogs(res.clients, res.dateIso || res.date || ""));
      if (lib.sig(cour) === before) return;
      readDepot();
      paintRoute();
    } catch (eR) {}
    finally { courAsmBusy = false; }
  }

  function telHref(phone) {
    var raw = String(phone || "").replace(/[^\d+]/g, "");
    if (!raw) return "";
    var d = raw.replace(/\D/g, "");
    if (!d) return "";
    if (d.indexOf("375") === 0) return "tel:+" + d;
    if (d.indexOf("80") === 0) return "tel:+375" + d.slice(2);
    if (d.length === 9) return "tel:+375" + d;
    return "tel:+" + d;
  }

  function inTelegram() {
    var tg = root.Telegram && root.Telegram.WebApp;
    if (!tg) return false;
    if (String(tg.initData || "")) return true;
    var platform = String(tg.platform || "");
    return !!platform && platform !== "unknown";
  }

  function copyPhone(text) {
    var s = String(text || "");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(s).catch(function () { fallbackCopy(s); });
    }
    fallbackCopy(s);
    return Promise.resolve();
  }

  function fallbackCopy(s) {
    try {
      var ta = document.createElement("textarea");
      ta.value = s;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    } catch (e) {}
  }

  function dialPhone(raw, ev) {
    var href = telHref(raw);
    if (!href) return;
    if (!inTelegram()) return;
    if (ev && ev.preventDefault) ev.preventDefault();
    var opened = null;
    try { opened = window.open(href, "_blank"); } catch (e) { opened = null; }
    if (opened) return;
    copyPhone(String(raw || "").trim());
    sh().toast("Номер скопирован");
  }

  function phoneOf(c) {
    var s = String((c && c.phone) || "");
    if (s) return s;
    var note = String((c && c.note) || "");
    var mTel = note.match(/\[TEL:([^\]]+)\]/i);
    if (mTel) return mTel[1].trim();
    var m = note.match(/(\+?375[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})/);
    return m ? m[1].replace(/\s+/g, "") : "";
  }

  function noteFor(note, role) {
    var raw = String(note || "");
    var bits = [];
    var re = /\[NOTE:([^\|\]]+)\|(perm|once)(?:\|ITEM:([^\]]+))?\]\s*([^]*?)(?=\s*\|\|\s*\[NOTE:|$)/gi;
    var m;
    var any = false;
    while ((m = re.exec(raw))) {
      any = true;
      var roles = String(m[1] || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
      if (roles.indexOf(role) < 0) continue;
      var t = String(m[4] || "").replace(/\[TEL:[^\]]+\]/gi, "").trim();
      if (t) bits.push(t);
    }
    if (any) return bits.join(", ");
    return raw.replace(/\[[^\]]+\]/g, " ").replace(/\+?375[\d\s\-]{9,}/g, "").replace(/\s{2,}/g, " ").trim();
  }

  function publicAddr(raw) {
    var p = eng() && eng().parseDeliveryAddress ? eng().parseDeliveryAddress(raw) : null;
    if (!p) return String(raw || "").trim();
    var street = p.street || String(raw || "").trim();
    if (p.entrance) street += (street ? ", " : "") + "п." + p.entrance;
    return street;
  }

  function privateAddr(raw) {
    var p = eng() && eng().parseDeliveryAddress ? eng().parseDeliveryAddress(raw) : null;
    if (!p) return "";
    var bits = [];
    if (p.floor) bits.push("этаж " + p.floor);
    if (p.flat) bits.push("кв. " + p.flat);
    return bits.join(", ");
  }

  function fracSlot(raw) {
    var s = String(raw == null ? "" : raw).trim();
    var frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (frac && (frac[1] === "1" || frac[1] === "2")) return frac[1];
    return "";
  }

  function looseSlot(raw) {
    var s = String(raw == null ? "" : raw).trim();
    if (s === "1" || s === "2") return s;
    var hint = s.match(/пп\s*([12])/i);
    return hint ? hint[1] : "";
  }

  function slotLabel(c) {
    var frac = fracSlot(c && c.ppSlot) || fracSlot(c && c.deliverySlot);
    if (frac) return "ПП" + frac;
    var hint = looseSlot(c && c.ppHint) || looseSlot(c && c.segment);
    var bare = looseSlot(c && c.ppSlot) || looseSlot(c && c.deliverySlot);
    if (hint === "2" && bare === "1") return "ПП2";
    var n = bare || hint;
    if (n === "1" || n === "2") return "ПП" + n;
    var seg = String((c && c.segment) || "");
    if (/пп/i.test(seg)) return "ПП";
    return seg;
  }

  function hm(raw) {
    var s = String(raw || "").trim();
    var m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return "";
    var h = m[1];
    if (h.length === 1) h = "0" + h;
    return h + ":" + m[2];
  }

  function windowLabel(c) {
    var a = hm(c && c.deliveryAfter);
    var b = hm(c && c.deliveryBefore);
    if (a && b) return "от " + a + " до " + b;
    if (a) return "от " + a;
    if (b) return "до " + b;
    return "";
  }

  function counterRow(pairs) {
    return '<div class="nx-counters">' + pairs.map(function (p) {
      return '<div class="nx-count"><b>' + esc(p.value) + "</b><span>" + esc(p.label) + "</span></div>";
    }).join("") + "</div>";
  }

  function paintRoute() {
    var day = dayOf("route");
    var html = segBar() + dayField("nxCourDay", day);
    html += '<div class="nx-actions" style="margin-top:8px"><button type="button" class="b-btn b-btn--sec" data-act="pr-cour-reload">Обновить список</button></div>';
    html += '<p class="b-lbl">Точка выезда</p><article class="b-card nx-depot"><p class="b-li__title" style="margin:0">' + esc(depotName || "Склад") + '</p><p class="b-note">' + esc(depotAddr || "Белецкого 10к2") + '</p>' +
      '<button type="button" class="b-btn b-btn--sec" data-act="pr-dep-open" style="margin-top:8px">Сменить точку</button></article>';
    html += '<div class="nx-actions" style="margin-top:8px">' +
      '<button type="button" class="b-btn ' + (couriersN === 1 ? "b-btn--main" : "b-btn--sec") + '" data-act="pr-cn" data-n="1">Курьеров 1</button>' +
      '<button type="button" class="b-btn ' + (couriersN === 2 ? "b-btn--main" : "b-btn--sec") + '" data-act="pr-cn" data-n="2">Курьеров 2</button></div>';
    html += '<div class="nx-actions"><button type="button" class="b-btn b-btn--main" data-act="pr-build">Собрать маршруты</button></div>';
    html += '<div id="nxPlan">' + (planHtml || "") + "</div>";
    var list = cour || [];
    var doneCount = list.filter(function (c) { return c.delivered; }).length;
    var leftCount = list.length - doneCount;
    html += counterRow([
      { value: "—", label: "Выплата" },
      { value: String(doneCount), label: "Доставлено" },
      { value: String(leftCount), label: "Осталось" }
    ]);
    var allDone = list.length && list.every(function (c) { return c.delivered; });
    if (courDetail) html += '<button type="button" class="nx-link" data-act="pr-cour-back">← Итог</button>';
    if (allDone && !courDetail) {
      html += '<article class="b-card" style="margin-top:12px"><p class="b-li__title" style="margin:0">Доставки завершены</p>' +
        '<p class="b-note">Все галочки проставлены</p>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="pr-cour-more">Подробнее</button></article>';
      sh().main(html);
      return;
    }
    if (!list.length) html += '<p class="b-note">Нет клиентов на день</p>';
    list.forEach(function (c, idx) {
      var addr = publicAddr(c.address || "");
      var priv = privateAddr(c.address || "");
      var note = noteFor(c.note || "", "cour");
      var tel = phoneOf(c);
      var who = String(c.name || "").split(/\s*[·•]\s*/);
      var dog = who[0] || "";
      var nick = who[1] || who[0] || c.name || "Клиент";
      var slot = slotLabel(c);
      var when = windowLabel(c);
      var price = c.orderPrice != null && c.orderPrice !== "" ? (String(c.orderPrice) + " BYN") : "";
      var accent = [slot, price].filter(Boolean).join(", ");
      var basket = basketLinesHtml(c.basket);
      html += '<article class="b-card' + (c.delivered ? " nx-dim" : "") + '" style="margin-top:12px">' +
        '<div class="nx-nickbox">' + esc(nick) + "</div>" +
        (who[1] && dog ? '<p class="b-note" style="margin:6px 0 0">' + esc(dog) + "</p>" : "") +
        '<p class="nx-addr">' + esc(addr || "Адрес не указан") + "</p>" +
        '<p class="b-note">' + esc(priv || "Этаж и квартира не указаны") + "</p>" +
        (note ? '<p class="b-note">' + esc(note) + "</p>" : "") +
        (when ? '<p class="nx-accent">' + esc(when) + "</p>" : "") +
        (accent ? '<p class="nx-accent">' + esc(accent) + "</p>" : "") +
        '<section class="nx-pack-grp"><div class="nx-grp">Состав набора</div>' +
        (basket || '<p class="b-note">Состав не указан</p>') + "</section>" +
        '<label class="nx-check"><input type="checkbox" data-act="pr-del" data-i="' + idx + '"' + (c.delivered ? " checked" : "") + "> доставлен</label>" +
        (addr ? '<button type="button" class="b-btn b-btn--sec" data-act="pr-map" data-i="' + idx + '" style="margin-top:8px">Карта</button>' : "") +
        (tel ? '<p class="b-note"><a class="nx-tel" href="' + esc(telHref(tel)) + '" data-act="pr-tel" data-phone="' + esc(tel) + '">' + esc(tel) + "</a></p>" : '<p class="b-note">нет телефона</p>') +
        (!c.delivered ? '<button type="button" class="b-btn b-btn--sec" data-act="pr-miss" data-i="' + idx + '" style="margin-top:8px">Не получил</button>' : "") +
        "</article>";
    });
    sh().main(html);
  }

  async function loadCour(force) {
    await loadDeparture();
    var day = currentDay("nxCourDay", "route");
    if (force) courDetail = false;
    var regJob = registerCourier();
    var res = null;
    var asmRes = null;
    try {
      var pair = await Promise.all([
        api().apiGet({ action: "getCourier", day: day }, { timeoutMs: 22000, cacheTtlMs: force ? 0 : 15000 }),
        api().apiGet({ action: "getAssembly", day: day }, { timeoutMs: 8000, cacheTtlMs: force ? 0 : 8000 }).catch(function () { return null; })
      ]);
      res = pair[0];
      asmRes = pair[1];
    } catch (e) {
      sh().toast("Ошибка сети");
      paintRoute();
      return;
    }
    if (!res || res.status !== "success" || !(res.clients || []).length) {
      cour = [];
      paintRoute();
      return;
    }
    var list = res.clients.slice();
    list.forEach(function (c) {
      var o = courFlags[String(c.name || "").trim().toUpperCase()];
      if (o && Date.now() - o.ts < 1800000) c.delivered = !!o.delivered;
    });
    var asmClients = [];
    if (asmRes && asmRes.status === "success" && Array.isArray(asmRes.clients)) asmClients = asmRes.clients;
    try { await regJob; } catch (eReg) {}
    if (!asmClients.length && asm && String(asm.day || "") === String(day) && Array.isArray(asm.clients)) {
      asmClients = asm.clients;
    }
    overlayCour(list, asmClients);
    list.sort(function (a, b) {
      var d = (a.delivered ? 1 : 0) - (b.delivered ? 1 : 0);
      if (d) return d;
      return String(a.name || "").localeCompare(String(b.name || ""), "ru");
    });
    list._date = res.date || day;
    list._day = day;
    cour = list;
    paintRoute();
    registerCourier();
    startCourAsmPoll();
  }

  async function registerCourier() {
    if (!access || access.role !== "courier") return;
    var u = api().telegramUser && api().telegramUser();
    if (!u || !u.id) return;
    var dayKey = new Date().getFullYear() + "-" + (new Date().getMonth() + 1) + "-" + new Date().getDate();
    if (lsGet("superboyna_courier_reg") === String(u.id) + "|" + dayKey) return;
    try {
      await api().apiPost({
        action: "registerCourier",
        telegramId: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim(),
        username: u.username || ""
      });
      lsSet("superboyna_courier_reg", String(u.id) + "|" + dayKey);
    } catch (e) {}
  }

  function applyDeparture(res) {
    var list = (res && res.warehouses) || [];
    if (list.length) warehouses = list;
    var dep = res && res.departure;
    if (!dep) {
      for (var i = 0; i < warehouses.length; i++) if (warehouses[i] && warehouses[i].departure) dep = warehouses[i];
    }
    if (dep && dep.address) {
      depotAddr = String(dep.address);
      depotName = String(dep.name || "Склад");
      depotId = dep.id != null ? String(dep.id) : depotId;
      return;
    }
    depotAddr = "Белецкого 10к2";
    depotName = "Склад";
  }

  function openDepot() {
    if (!warehouses.length) {
      sh().toast("Список точек пуст. Их добавляет владелец в Доступах");
      return;
    }
    var html = warehouses.map(function (w) {
      var on = String(w.id) === String(depotId) || (!depotId && w.departure);
      return '<button type="button" class="b-btn ' + (on ? "b-btn--main" : "b-btn--sec") + '" data-act="pr-dep" data-id="' + esc(w.id) + '" style="margin-top:8px">' +
        esc((w.name || "Точка") + (w.address ? ", " + w.address : "")) + "</button>";
    }).join("");
    sh().openSheet({ title: "Точка выезда", html: html });
  }

  async function setDepot(id) {
    var u = api().telegramUser && api().telegramUser();
    var res = null;
    try {
      res = await api().apiPost({ action: "setDepartureWarehouse", id: id, telegramId: u && u.id });
    } catch (eDep) { res = null; }
    if (!res || res.status !== "success") { sh().toast("Не сменилось"); return; }
    applyDeparture(res);
    sh().closeTop("ok");
    sh().toast("Точка выезда обновлена");
    paintRoute();
  }

  async function loadDeparture() {
    try {
      var res = await api().apiGet({ action: "listWarehouses", _: String(Date.now()) }, { timeoutMs: 12000, cacheTtlMs: 15000 });
      applyDeparture(res);
    } catch (eDep) {}
  }

  function readDepot() {
    var h = document.getElementById("nxDepH");
    var m = document.getElementById("nxDepM");
    if (rt()) rt().setDepart(h ? h.value : 14, m ? m.value : 0);
    if (rt()) rt().setCourierCount(couriersN);
    return depotAddr || "Белецкого 10к2";
  }

  async function buildPlan() {
    readDepot();
    var withAddr = (cour || []).filter(function (c) { return String(c.address || "").trim() && !c.delivered; });
    var skipped = (cour || []).filter(function (c) { return String(c.address || "").trim() && c.delivered; });
    if (!withAddr.length) {
      sh().toast(skipped.length ? "Все клиенты с адресом уже доставлены" : "Нет адресов на этот день");
      return;
    }
    planHtml = '<p class="b-note">Считаю точки…</p>';
    paintRoute();
    var route = rt();
    var depotGeo = await route.geocodeAddress(route.normalizeAddressForMaps(depotAddr), true);
    route.state.depot = depotGeo || { lat: route.MINSK_CENTER.lat, lon: route.MINSK_CENTER.lon };
    var stops = [];
    for (var i = 0; i < withAddr.length; i++) {
      var c = withAddr[i];
      planHtml = '<p class="b-note">Точка ' + (i + 1) + "/" + withAddr.length + "…</p>";
      var box = document.getElementById("nxPlan");
      if (box) box.innerHTML = planHtml;
      var method = route.parseDeliveryMethod(c.note || "");
      var lat = null, lon = null, address = "";
      if (method === "euro" || method === "bel") {
        var officeAddr = route.parseOfficeAddress(c.note || "");
        if (officeAddr) {
          address = officeAddr;
          var og = await route.geocodeAddress(route.normalizeAddressForMaps(officeAddr), true);
          if (og) { lat = og.lat; lon = og.lon; }
        } else {
          var office = await route.nearestPostOffice(method, route.state.depot);
          address = office.address;
          lat = office.lat;
          lon = office.lon;
        }
      } else {
        address = route.normalizeAddressForMaps(c.address || "");
        var saved = c.geo || route.parseGeoFromNote(c.note || "");
        if (maps() && maps().savedGeoUsable && maps().savedGeoUsable(saved, c.address || "")) {
          lat = Number(saved.lat);
          lon = Number(saved.lon);
        } else {
          var geo = await route.geocodeAddress(address, true);
          if (geo) { lat = geo.lat; lon = geo.lon; }
        }
      }
      stops.push({
        name: c.name,
        address: address,
        clientAddress: c.address || "",
        delivery: method || "courier",
        deliveryLabel: method === "euro" ? "Европочта" : (method === "bel" ? "Белпочта" : null),
        lat: lat,
        lon: lon,
        deliveryAfter: c.deliveryAfter || "",
        deliveryBefore: c.deliveryBefore || "",
        clientIndex: (cour || []).indexOf(c)
      });
    }
    planHtml = '<p class="b-note">Считаю порядок…</p>';
    await route.refreshDriveMatrix(route.state.depot, stops);
    route.autoSplitStops(stops);
    planHtml = renderPlan();
    paintRoute();
    var t0 = route.estimateRouteMinutes(route.state.depot, route.state.routes[0] || []);
    var t1 = route.estimateRouteMinutes(route.state.depot, route.state.routes[1] || []);
    var wall = couriersN === 2 ? Math.max(t0, t1) : t0;
    sh().toast("Готово · " + route.formatMinutes(wall));
  }

  function renderPlan() {
    var route = rt();
    var depot = route.state.depot || route.MINSK_CENTER;
    var count = couriersN;
    var html = "";
    var total = 0;
    for (var r = 0; r < count; r++) {
      var stops = route.state.routes[r] || [];
      var mins = route.estimateRouteMinutes(depot, stops);
      if (mins > total) total = mins;
      html += '<article class="b-card" style="margin-top:12px"><p class="b-li__title" style="margin:0">Курьер ' + (r + 1) + " · " + stops.length + " точ.</p>";
      html += '<p class="b-note">ориентир ' + esc(route.formatMinutes(mins)) + "</p>";
      stops.forEach(function (s, i) {
        var stopAsm = "";
        var courHit = null;
        for (var ci = 0; ci < (cour || []).length; ci++) {
          if (cour[ci] && (cour[ci].name === s.name || (s.clientIndex === ci))) { courHit = cour[ci]; break; }
        }
        if (courHit) stopAsm = " · " + courBadge(courHit);
        html += '<p style="margin:8px 0 0"><b>' + (i + 1) + ". " + esc(s.name) + esc(stopAsm) + "</b><br>" + esc(s.address || "") + "</p>";
        if (s.deliveryLabel) html += '<p class="b-note">' + esc(s.deliveryLabel) + (s.clientAddress ? " → " + esc(s.clientAddress) : "") + "</p>";
        html += '<button type="button" class="b-btn b-btn--sec" data-act="pr-ig" data-r="' + r + '" data-i="' + i + '">Копировать через N мин</button>';
        if (count === 2) html += '<button type="button" class="b-btn b-btn--sec" data-act="pr-move" data-r="' + r + '" data-i="' + i + '">→ ' + ((r === 0 ? 1 : 0) + 1) + "</button>";
      });
      html += '<div class="nx-actions" style="margin-top:8px">' +
        '<button type="button" class="b-btn b-btn--main" data-act="pr-ymap" data-r="' + r + '">Карты · порядок · курьер ' + (r + 1) + "</button>" +
        '<button type="button" class="b-btn b-btn--sec" data-act="pr-send" data-r="' + r + '">Отправить курьеру ' + (r + 1) + " в Telegram</button>" +
        '<button type="button" class="b-btn b-btn--sec" data-act="pr-ig-all" data-r="' + r + '">Все тексты клиентам</button></div></article>';
    }
    html = '<p class="b-note">Ориентир ' + esc(route.formatMinutes(total)) + "</p>" + html;
    return html;
  }

  function pointsOf(routeIndex) {
    var route = rt();
    var stops = route.state.routes[routeIndex] || [];
    var depot = route.state.depot;
    var points = [];
    if (depot && depot.lat != null) points.push({ lat: Number(depot.lat), lon: Number(depot.lon) });
    else points.push({ address: depotAddr });
    stops.forEach(function (s) {
      if (s.lat != null && s.lon != null) points.push({ lat: Number(s.lat), lon: Number(s.lon), address: s.address || "" });
      else if (s.address) points.push({ address: s.address });
    });
    return points;
  }

  function shareText(routeIndex) {
    var route = rt();
    var stops = route.state.routes[routeIndex] || [];
    var mins = route.estimateRouteMinutes(route.state.depot, stops);
    var t = "Маршрут курьера · " + stops.length + " точек\n";
    t += "Выезд: " + route.normalizeAddressForMaps(depotAddr) + "\n";
    t += "Ориентир по длине: " + route.formatMinutes(mins) + " (точнее смотри Яндекс)\n";
    t += "Порядок зафиксирован. В Яндексе НЕ жми Оптимизировать.\n\n";
    stops.forEach(function (s, i) {
      t += (i + 1) + ". " + s.name;
      if (s.deliveryLabel) t += " (" + s.deliveryLabel + ")";
      t += "\n" + (s.address || "") + "\n\n";
    });
    var url = maps() && maps().buildYandexRouteUrl ? maps().buildYandexRouteUrl(pointsOf(routeIndex)) : "";
    if (url) t += "Яндекс.Карты:\n" + url;
    return t.trim();
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    return false;
  }

  function openLink(url) {
    var tg = root.Telegram && root.Telegram.WebApp;
    try {
      if (tg && typeof tg.openLink === "function") {
        tg.openLink(url, { try_instant_view: false });
        return;
      }
    } catch (e) {}
    window.open(url, "_blank", "noopener");
  }

  async function sendRoute(routeIndex) {
    var text = shareText(routeIndex);
    if (!text || !(rt().state.routes[routeIndex] || []).length) {
      sh().toast("Сначала соберите маршруты");
      return;
    }
    var res = null;
    try { res = await api().apiGet({ action: "getCouriers" }, { timeoutMs: 20000, cacheTtlMs: 0 }); } catch (e) {}
    var couriers = (res && res.couriers) || [];
    if (!couriers.length) {
      sh().toast("Пока никого в списке. Пусть курьер напишет боту /start");
      return;
    }
    var picked = await sh().choice({
      title: "Кому отправить маршрут",
      text: "Бот пришлёт маршрут в личку.",
      options: couriers.map(function (c, i) {
        return { label: (c.name || c.username || ("id " + c.id)), value: String(i) };
      }).concat([{ label: "Закрыть", value: "cancel" }])
    });
    if (picked == null || picked === "cancel") return;
    var c = couriers[Number(picked)];
    if (!c) return;
    var id = String(c.id || "").trim();
    var ticket = "r" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
    try { await api().apiPost({ action: "prepareCourierRoute", ticket: ticket, text: text }); } catch (ePrep) {}
    await new Promise(function (r) { setTimeout(r, 350); });
    var sendRes = null;
    try {
      sendRes = await api().apiGet({ action: "sendCourierRoute", telegramId: id, ticket: ticket }, { timeoutMs: 20000, cacheTtlMs: 0 });
    } catch (eSend) {}
    if (!sendRes || sendRes.status !== "success") {
      var shortText = text.length > 850 ? (text.slice(0, 850) + "\n…") : text;
      try {
        sendRes = await api().apiGet({ action: "sendCourierRoute", telegramId: id, text: shortText }, { timeoutMs: 20000, cacheTtlMs: 0 });
      } catch (eShort) {}
    }
    if (sendRes && sendRes.status === "success") sh().toast("Отправлено: " + (c.name || id));
    else sh().toast("Не дошло: " + ((sendRes && sendRes.message) || "ошибка"));
  }

  async function toggleDelivered(index, delivered) {
    var day = currentDay("nxCourDay", "route");
    var client = cour[index];
    if (!client) return;
    var paidAnswer = null;
    var segPay = String(client.segment || "").trim().toUpperCase();
    var ask = segPay === "ПП" || segPay === "Р" || segPay === "РОЗНИЦА" || client.askPaid;
    if (delivered && ask && String(client.paid || "").toLowerCase() !== "yes" && !client.ppPaid) {
      var picked = await sh().choice({
        title: "Оплата",
        text: "Клиент " + client.name + ". Оплачено?",
        options: [
          { label: "Да, оплачено", value: "yes" },
          { label: "Нет", value: "no" },
          { label: "Отмена", value: "cancel" }
        ]
      });
      if (!picked || picked === "cancel") { paintRoute(); return; }
      paidAnswer = picked;
    }
    client.delivered = !!delivered;
    if (paidAnswer) client.paid = paidAnswer;
    courFlags[String(client.name || "").trim().toUpperCase()] = { delivered: !!delivered, ts: Date.now() };
    if (!delivered) courDetail = true;
    paintRoute();
    try {
      var body = { action: "setDelivered", day: day, client: client.name, delivered: !!delivered };
      if (paidAnswer) body.paid = paidAnswer;
      if (client.matchKey) body.matchKey = client.matchKey;
      var delRes = await api().apiPost(body);
      if (!delRes || (delRes.status !== "success" && delRes.status !== "sent_opaque")) throw new Error("save");
    } catch (e) {
      client.delivered = !delivered;
      courFlags[String(client.name || "").trim().toUpperCase()] = { delivered: !delivered, ts: Date.now() };
      sh().toast("Не удалось сохранить галочку");
      paintRoute();
    }
  }

  async function missed(index) {
    var client = cour[index];
    var day = currentDay("nxCourDay", "route");
    if (!client || client.delivered) { sh().toast("Уже отмечен доставленным"); return; }
    var reason = await sh().choice({
      title: "Не получил · " + client.name,
      text: "Коротко: почему не вручили? Менеджер получит задачу на перенос.",
      options: [
        { label: "Не открыл / не дома", value: "не дома" },
        { label: "Перенос по просьбе", value: "просил перенос" },
        { label: "Другое", value: "другое" },
        { label: "Отмена", value: "cancel" }
      ]
    });
    if (!reason || reason === "cancel") return;
    if (reason === "другое") {
      var custom = await sh().prompt({ title: "Причина", text: "например: звонок не берёт", ok: "Отправить" });
      if (custom == null) return;
      reason = String(custom || "").trim() || "другое";
    }
    var u = api().telegramUser() || {};
    var tid = String(u.id || "");
    if (!tid) { sh().toast("Нужен Telegram ID"); return; }
    var body = {
      action: "notifyMissedDelivery",
      telegramId: tid,
      client: client.name,
      day: day,
      date: cour._date || "",
      reason: reason,
      segment: client.segment || "",
      matchKey: client.matchKey || "",
      basket: client.basket || [],
      address: client.address || "",
      phone: client.phone || "",
      note: client.note || "",
      createdByName: [u.first_name, u.last_name].filter(Boolean).join(" ")
    };
    function ok(r) {
      return !!(r && (r.status === "success" || r.status === "accepted" || r.status === "sent_opaque" || r.d1Verified || r.parked));
    }
    var res = null;
    try {
      res = await api().apiGet(Object.assign({}, body, { basket: JSON.stringify(client.basket || []), _: String(Date.now()) }), { timeoutMs: 12000, cacheTtlMs: 0 });
    } catch (eGet) {}
    if (!ok(res)) {
      try { res = await api().apiPost(body); } catch (ePost) {}
    }
    if (!ok(res)) { sh().toast("Не удалось: " + ((res && res.message) || "ошибка")); return; }
    cour.splice(index, 1);
    sh().toast("Снят с дня · только в Переносах");
    paintRoute();
  }

  async function openMap(index) {
    var c = cour[index];
    if (!c) return;
    var route = rt();
    var saved = c.geo || route.parseGeoFromNote(c.note || "");
    var point = { address: c.address || "" };
    if (saved && saved.lat != null) point = { lat: Number(saved.lat), lon: Number(saved.lon), address: c.address || "" };
    else {
      var geo = await route.geocodeAddress(route.normalizeAddressForMaps(c.address || ""), true);
      if (geo) point = { lat: geo.lat, lon: geo.lon, address: c.address || "" };
    }
    var url = maps() && maps().buildYandexPointUrl ? maps().buildYandexPointUrl(point) : "";
    if (url) openLink(url);
  }

  async function allMap() {
    readDepot();
    var list = maps() && maps().collectDayMapClients ? maps().collectDayMapClients(cour) : [];
    if (!list.length) { sh().toast("Нет адресов"); return; }
    var route = rt();
    var depotGeo = route.state.depot;
    if (!depotGeo || depotGeo.lat == null) {
      depotGeo = await route.geocodeAddress(route.normalizeAddressForMaps(depotAddr), true);
      route.state.depot = depotGeo || { lat: route.MINSK_CENTER.lat, lon: route.MINSK_CENTER.lon };
    }
    var points = [{ lat: route.state.depot.lat, lon: route.state.depot.lon }];
    list.forEach(function (c) {
      if (c.geo && c.geo.lat != null) points.push({ lat: Number(c.geo.lat), lon: Number(c.geo.lon), address: c.address });
      else points.push({ address: c.address });
    });
    var chunks = maps().splitRouteChunks ? maps().splitRouteChunks(points) : [points];
    var url = maps().buildYandexRouteUrl(chunks[0] || points);
    openLink(url);
    if (chunks.length > 1) sh().toast("Адресов много — открыт первый кусок, всего " + chunks.length);
  }

  function paint() {
    sh().dock("");
    if (seg === "pack") return paintAsm();
    if (seg === "route") return paintRoute();
    paintCut();
  }

  async function show(next) {
    var items = segItems();
    if (!items.some(function (s) { return s.id === next; })) next = (items[0] && items[0].id) || "cut";
    seg = next;
    if (seg !== "cut" && cutSession.timer) { clearInterval(cutSession.timer); cutSession.timer = null; }
    if (next !== "route") stopCourAsmPoll();
    paint();
    if (seg === "cut") await loadCut();
    else if (seg === "pack") await loadAsm(false);
    else await loadCour(false);
  }

  function onAct(act, node, ev) {
    if (act === "change") {
      var id = node && node.id;
      if (id === "nxCutDay") { cutDone = null; cutDetail = false; loadCut(); return true; }
      if (id === "nxAsmDay") { asm = null; asmDaySeen = ""; loadAsm(true); return true; }
      if (id === "nxCourDay") { planHtml = ""; loadCour(true); return true; }
      if (id === "nxDepH" || id === "nxDepM") { readDepot(); return true; }
      if (node && node.getAttribute && node.getAttribute("data-act") === "pr-laid") {
        var itL = findCut(node.getAttribute("data-key"));
        if (!itL) return true;
        var prevL = !!itL.laid;
        itL.laid = !!node.checked;
        sortCut();
        paintCut();
        persistCut(itL, { laid: !!itL.laid }).then(function (ok) {
          if (!ok) { itL.laid = prevL; paintCut(); }
        });
        return true;
      }
      if (node && node.getAttribute && node.getAttribute("data-act") === "pr-done") {
        var itD = findCut(node.getAttribute("data-key"));
        if (!itD) return true;
        var prevD = !!itD.done;
        itD.done = !!node.checked;
        sortCut();
        paintCut();
        persistCut(itD, { done: !!itD.done }).then(function (ok) {
          if (!ok) { itD.done = prevD; paintCut(); return; }
          if (itD.done && cutSession.active && cutItems.every(function (x) { return x.done; })) {
            sh().confirm({ title: "Нарезка", text: "Все позиции отмечены. Завершить нарезку?", ok: "Завершить" }).then(function (go) {
              if (go) finishCut();
            });
          }
        });
        return true;
      }
      if (node && node.getAttribute && node.getAttribute("data-act") === "pr-asm") {
        setAsmFlag(node.getAttribute("data-name"), { assembled: !!node.checked });
        return true;
      }
      if (node && node.getAttribute && node.getAttribute("data-act") === "pr-del") {
        toggleDelivered(Number(node.getAttribute("data-i")), !!node.checked);
        return true;
      }
      return false;
    }
    if (!act || String(act).indexOf("pr-") !== 0) return false;
    if (act === "pr-laid" || act === "pr-done") {
      var flag = act === "pr-laid" ? "laid" : "done";
      var itF = findCut(node.getAttribute("data-key"));
      if (!itF) return true;
      var prevF = !!itF[flag];
      itF[flag] = !prevF;
      sortCut();
      paintCut();
      var patch = {};
      patch[flag] = !!itF[flag];
      persistCut(itF, patch).then(function (ok) {
        if (!ok) { itF[flag] = prevF; paintCut(); return; }
        if (flag === "done" && itF.done && cutSession.active && cutItems.every(function (x) { return x.done; })) {
          sh().confirm({ title: "Нарезка", text: "Все позиции отмечены. Завершить нарезку?", ok: "Завершить" }).then(function (go) {
            if (go) finishCut();
          });
        }
      });
      return true;
    }
    if (act === "pr-dep-open") { openDepot(); return true; }
    if (act === "pr-dep") { setDepot(node.getAttribute("data-id")); return true; }
    if (act === "pr-cut-start") { startCut(); return true; }
    if (act === "pr-cut-finish") { finishCut(); return true; }
    if (act === "pr-cut-more") { cutDetail = true; paintCut(); return true; }
    if (act === "pr-cut-back") { cutDetail = false; paintCut(); return true; }
    if (act === "pr-bang") {
      var it = findCut(node.getAttribute("data-k"));
      if (!it) return true;
      var next = !it.outNext;
      sh().confirm({
        title: it.name,
        text: next ? "Пометить: на эту нарезку хватает, на следующую — уже нет?" : "Снять пометку дефицита на следующую нарезку?",
        ok: "Да"
      }).then(function (ok) {
        if (!ok) return;
        var prev = !!it.outNext;
        it.outNext = next;
        paintCut();
        persistCut(it, { outNext: next }).then(function (saved) {
          if (!saved) { it.outNext = prev; paintCut(); }
          else sh().toast(next ? "Помечено: нет на следующую" : "Пометка снята");
        });
      });
      return true;
    }
    if (act === "pr-surplus") {
      var key = node.getAttribute("data-k");
      var row = findCut(key);
      var el = document.getElementById("surplus_" + key);
      var surplus = Number(el && el.value) || 0;
      var prevSurplus = row ? row.surplus : 0;
      if (row) row.surplus = surplus;
      paintCut();
      persistCut(row || { row: key }, { surplus: surplus }).then(function (ok) {
        if (ok) sh().toast("Излишек сохранён");
        else if (row) { row.surplus = prevSurplus; paintCut(); }
      });
      return true;
    }
    if (act === "pr-asm-reload") { loadAsm(true); return true; }
    if (act === "pr-asm-more") { asmDetail = true; paintAsm(); return true; }
    if (act === "pr-asm-back") { asmDetail = false; paintAsm(); return true; }
    if (act === "pr-pack") {
      var k = node.getAttribute("data-k");
      packOn[k] = packOn[k] === false;
      paintAsm();
      return true;
    }
    if (act === "pr-print") {
      var name = node.getAttribute("data-name");
      var client = findAsm(name);
      setAsmFlag(name, { printed: !(client && client.printed) });
      return true;
    }
    if (act === "pr-cour-reload") { planHtml = ""; loadCour(true); return true; }
    if (act === "pr-cour-more") { courDetail = true; paintRoute(); return true; }
    if (act === "pr-cour-back") { courDetail = false; paintRoute(); return true; }
    if (act === "pr-cn") { couriersN = node.getAttribute("data-n") === "2" ? 2 : 1; readDepot(); paintRoute(); return true; }
    if (act === "pr-build") { buildPlan(); return true; }
    if (act === "pr-allmap") { allMap(); return true; }
    if (act === "pr-open") { var i = Number(node.getAttribute("data-i")); courOpen[i] = !courOpen[i]; paintRoute(); return true; }
    if (act === "pr-tel") { dialPhone(node.getAttribute("data-phone") || "", ev); return true; }
    if (act === "pr-map") { openMap(Number(node.getAttribute("data-i"))); return true; }
    if (act === "pr-miss") { missed(Number(node.getAttribute("data-i"))); return true; }
    if (act === "pr-ymap") {
      var url = maps() && maps().buildYandexRouteUrl ? maps().buildYandexRouteUrl(pointsOf(Number(node.getAttribute("data-r")))) : "";
      if (url) openLink(url);
      return true;
    }
    if (act === "pr-send") { sendRoute(Number(node.getAttribute("data-r"))); return true; }
    if (act === "pr-ig") {
      var r = Number(node.getAttribute("data-r"));
      var si = Number(node.getAttribute("data-i"));
      var stops = rt().state.routes[r] || [];
      var text = rt().igMessageForStop(rt().state.depot, stops, si);
      copyText(text).then(function (ok) { sh().toast(ok ? "Скопировано" : text); });
      return true;
    }
    if (act === "pr-ig-all") {
      var rr = Number(node.getAttribute("data-r"));
      var all = (rt().state.routes[rr] || []).map(function (s, i) {
        return s.name + ":\n" + rt().igMessageForStop(rt().state.depot, rt().state.routes[rr], i);
      }).join("\n\n---\n\n");
      copyText(all).then(function (ok) { sh().toast(ok ? "Тексты скопированы" : "Пусто"); });
      return true;
    }
    if (act === "pr-move") {
      var from = Number(node.getAttribute("data-r"));
      var idx = Number(node.getAttribute("data-i"));
      rt().moveStopBetweenRoutes(from, idx, from === 0 ? 1 : 0);
      planHtml = renderPlan();
      paintRoute();
      return true;
    }
    return false;
  }

  root.BoinyaProduction = {
    bind: function (a) { access = a; },
    show: show,
    onAct: onAct,
    seg: function () { return seg; },
    slotLabel: slotLabel,
    windowLabel: windowLabel
  };
})(typeof window !== "undefined" ? window : globalThis);
