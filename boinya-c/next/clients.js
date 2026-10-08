/* Клиенты: подписки, карточка, расчёт и подбор. Запросы и формулы — как в app.main.js. */
(function (root) {
  "use strict";

  var access = null;
  var seg = "pp";
  var view = "list";
  var subs = [];
  var subsLoading = false;
  var subsError = "";
  var listScroll = 0;
  var surveys = [];
  var surveysLoading = false;
  var people = [];
  var search = "";
  var editMode = false;
  var picked = {};
  var card = null;
  var deep = false;
  var showBpForm = false;
  var showSurveyForm = false;
  var enroll = null;
  var editingId = "";
  var price = blankPrice();
  var crumbDraft = null;
  var pick = { type: "pp", anketa: "", result: null, text: "", busy: false };
  var focusNick = "";

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function ax() { return root.BoinyaAccess; }
  function P() { return root.BoinyaPrice; }
  function eng() { return root.BoinyaOrderEngine; }
  function esc(s) { return sh().esc(s); }

  function blankPrice() {
    return {
      mode: "pp",
      baskets: { 1: [], 2: [] },
      dogCount: 1,
      activeDog: 1,
      dogNames: { 1: "", 2: "" },
      deliveriesN: 2,
      coef: 2.6,
      scheme: "RAW26",
      packs: { small: 0, medium: 0, large: 0, legs: 0 },
      packsManual: false,
      note: "",
      message: "",
      stated: "",
      statedTouched: false,
      fact: "",
      slot: 1,
      fracs: { slices: 0, strips: 1, large: 1, medium: 2, small: 3, extraSmall: 4 },
      ig: "",
      manualOpen: false,
      retailDelivery: ""
    };
  }

  function rubShort_(n) {
    var x = Math.round(Number(n) * 100) / 100;
    if (!isFinite(x)) x = 0;
    return x.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
  }

  /** Розница: пустой override следует правилу прайса, «paid»/«free» его перекрывают. */
  function retailCalcChoice_(engine, list, override) {
    var auto = engine.calcRetailBasketTotal(list || [], { deliveriesN: 1 });
    var mode = override === "paid" || override === "free" ? override : (auto.delivery > 0 ? "paid" : "free");
    var quote = engine.retailQuote ? engine.retailQuote(list || [], mode === "paid") : auto;
    var note = mode === "paid" && quote.delivery > 0
      ? ("+" + rubShort_(quote.delivery) + " р")
      : "доставка не считается";
    return {
      mode: mode,
      total: quote.total,
      goods: quote.goods,
      delivery: quote.delivery,
      note: note
    };
  }

  function blankCard() {
    return {
      nick: "", label: "", subId: "", sheet: "ПП", deliveries: "2", status: "",
      wishes: "", address: "", phone: "", basket: [], basket2: [],
      factCost: "", statedCost: "", calcFactCost: "", statedTouched: false,
      coef: "2.6", scheme: "RAW26", dogName: "", dogBreed: "", dogWeight: "",
      packCounts: { u1: 0, u2: 0, u3: 0, up4: 0 },
      surveyBp2Due: "", surveyFinalDue: "", ownerTelegramId: "", ownerName: "",
      basketBp1: [], basketBp2: [], bpTab: 1, slot: 1, econ: null,
      bpWeeks: "", bpWeeksSet: false, bpOutcome: "", extendPrice: null
    };
  }

  function canSubs() {
    return ax().tabHas(access, "subsScreen") || ax().tabHas(access, "subDetailScreen");
  }
  function canCalc() { return ax().tabHas(access, "priceScreen.calc"); }
  function canPick() {
    return ax().tabHas(access, "priceScreen.pick") && ax().tabHas(access, "templatesScreen.ai");
  }

  function segs(acc) {
    var prev = access;
    if (acc) access = acc;
    var list = [];
    if (canSubs()) {
      list.push({ id: "pp", label: "ПП" }, { id: "afk", label: "АФК" }, { id: "bp", label: "БП" }, { id: "survey", label: "Опросник" });
    }
    access = prev || access;
    if (acc) access = acc;
    return list;
  }

  function sheetOf(id) {
    if (id === "afk") return "АФК";
    if (id === "bp") return "БП";
    return "ПП";
  }

  function W() { return root.BoinyaBpWeeks; }

  function geoLib_() { return root.BoinyaWishesGeo; }

  function staffWishes_(raw) {
    var base = W() ? W().strip(P().stripPpMetaFromWishes_(raw || "")) : P().stripPpMetaFromWishes_(raw || "");
    var G = geoLib_();
    if (!G || !G.peel) return base;
    return G.peel(base).text;
  }

  function serviceGeoOf_(raw, extra) {
    if (extra && extra.lat != null && extra.lon != null) {
      return { lat: Number(extra.lat), lon: Number(extra.lon), yandexUrl: extra.yandexUrl || "" };
    }
    var G = geoLib_();
    if (!G || !G.peel) return null;
    return G.peel(raw || "").geo;
  }

  function tid() {
    try {
      var u = api().telegramUser();
      return String((u && u.id) || "");
    } catch (e) { return ""; }
  }

  function ymdPlusDaysLocal_(ymd, days) {
    var d;
    if (ymd && /^\d{4}-\d{2}-\d{2}/.test(ymd)) {
      var p = String(ymd).slice(0, 10).split("-");
      d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    } else d = new Date();
    d.setDate(d.getDate() + (Number(days) || 0));
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function normalizeBpStage_(raw) {
    var u = String(raw || "").trim().toUpperCase();
    if (!u) return "БП1";
    if (/ФИНАЛ|FINAL|БП2_FINAL|БП2FINAL/.test(u)) return "ФИНАЛ";
    if (/БП1_SURVEY|БП1SURVEY|ОПРОС/.test(u)) return "БП2";
    if (/\bБП2\b/.test(u) || /^БП2/.test(u) || u.indexOf("БП2") >= 0) return "БП2";
    if (/ДУМА/.test(u)) return "ФИНАЛ";
    return "БП1";
  }

  function bpStageSurveyKind_(stage) {
    var st = normalizeBpStage_(stage);
    if (st === "ФИНАЛ") return "final";
    return "bp2";
  }

  function isRetailMarkedSub_(s) {
    if (!s) return false;
    var segm = String(s.segment || "").trim().toUpperCase();
    var sheet = String(s.sheet || "").trim().toUpperCase();
    var st = String(s.status || s.ppStatus || s.stage || "").trim().toUpperCase();
    if (segm === "Р" || segm === "R" || segm === "РОЗНИЦА" || segm === "RETAIL") return true;
    if (sheet === "Р" || sheet === "R" || sheet === "РОЗНИЦА" || sheet === "RETAIL") return true;
    if (st === "Р" || st === "R" || /^РОЗНИЦ/.test(st) || st === "RETAIL") return true;
    return false;
  }

  function igHandleFromSubNick_(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    var m = s.match(/@([A-Za-z0-9._]{2,30})/);
    if (m) return m[1];
    var bare = s.replace(/^@+/, "").trim();
    if (/^[A-Za-z0-9._]{2,30}$/.test(bare) && /[A-Za-z]/.test(bare)) return bare;
    var tokens = s.split(/[\s|/·•,()]+/).filter(Boolean);
    var i;
    for (i = 0; i < tokens.length; i++) {
      var t = String(tokens[i] || "").replace(/^@+/, "");
      if (/^[A-Za-z0-9._]{2,30}$/.test(t) && /[A-Za-z]/.test(t)) return t;
    }
    return "";
  }

  function groupBpSubscriptions_(list) {
    var byNick = Object.create(null);
    var order = [];
    (list || []).forEach(function (s) {
      var nick = String(s.nick || s.label || "").trim();
      var ig = igHandleFromSubNick_(s.nick) || igHandleFromSubNick_(s.label);
      var key = String(ig || nick).toUpperCase().replace(/[._]/g, "") || ("#" + (s.subId || Math.random()));
      if (!byNick[key]) {
        byNick[key] = Object.assign({}, s, {
          basketBp1: s.basketBp1 || ((/БП1/.test(String(s.status || ""))) ? (s.basket || []) : []),
          basketBp2: s.basketBp2 || ((/БП2/.test(String(s.status || ""))) ? (s.basket || []) : [])
        });
        order.push(key);
      } else {
        var cur = byNick[key];
        var st = String(s.status || "");
        if (/БП1/.test(st) && (s.basket || s.basketBp1)) cur.basketBp1 = s.basketBp1 || s.basket || cur.basketBp1;
        if (/БП2/.test(st) && (s.basket || s.basketBp2)) cur.basketBp2 = s.basketBp2 || s.basket || cur.basketBp2;
        if (s.surveyBp2Due) cur.surveyBp2Due = s.surveyBp2Due;
        if (s.surveyFinalDue) cur.surveyFinalDue = s.surveyFinalDue;
        if (s.ownerTelegramId) cur.ownerTelegramId = s.ownerTelegramId;
        if (s.ownerName) cur.ownerName = s.ownerName;
        if (Number(s.bpWeeks) === 1) cur.bpWeeks = 1;
        if (s.bpOutcome) cur.bpOutcome = s.bpOutcome;
        if (s.wishes) cur.wishes = (cur.wishes ? cur.wishes + "\n" : "") + s.wishes;
        var rankIn = /ФИНАЛ/i.test(st) ? 3 : (/БП2/.test(st) ? 2 : (/БП1/.test(st) ? 1 : 0));
        var rankCur = /ФИНАЛ/i.test(String(cur.status || "")) ? 3 : (/БП2/.test(String(cur.status || "")) ? 2 : (/БП1/.test(String(cur.status || "")) ? 1 : 0));
        if (rankIn > rankCur) cur.status = st;
        else if (st && !cur.status) cur.status = st;
      }
    });
    return order.map(function (k) { return byNick[k]; });
  }

  function monthN(raw) {
    return P() && P().monthDeliveriesN_ ? P().monthDeliveriesN_(raw) : Math.max(1, Number(raw) || 1);
  }

  function delivLine(raw) {
    var n = monthN(raw);
    return "Доставка 9×" + n + " = " + (9 * n) + " р";
  }

  function paintDelivLine(raw) {
    var line = document.getElementById("cxDelivLine");
    if (line) line.textContent = delivLine(raw);
  }

  function field(id, value, placeholder, extra) {
    return '<label class="b-field"><input class="b-field__input" id="' + id + '" data-k="' + id + '" value="' + esc(value || "") + '" placeholder="' + esc(placeholder || "") + '" ' + (extra || "") + "></label>";
  }

  function area(id, value, placeholder) {
    return '<label class="b-field b-field--area"><textarea class="b-field__input" id="' + id + '" data-k="' + id + '" placeholder="' + esc(placeholder || "") + '">' + esc(value || "") + "</textarea></label>";
  }

  function segBar() {
    var items = segs(access);
    if (!items.length) return "";
    return '<div class="b-seg" style="margin-bottom:16px">' + items.map(function (s) {
      return '<button type="button" class="b-seg__item' + (s.id === seg ? " b-seg__item--on" : "") + '" data-act="cseg" data-seg="' + s.id + '">' + esc(s.label) + "</button>";
    }).join("") + "</div>";
  }

  function actions(html) {
    return '<div class="nx-actions" style="margin-top:12px">' + html + "</div>";
  }

  function activeBasket() {
    if (view === "card" && card) {
      if (card.sheet === "БП") return card.bpTab === 2 ? card.basketBp2 : card.basketBp1;
      if (Number(card.deliveries) >= 2 && card.slot === 2) return card.basket2;
      return card.basket;
    }
    return price.baskets[price.activeDog] || [];
  }

  function setActiveBasket(list) {
    if (view === "card" && card) {
      if (card.sheet === "БП") {
        if (card.bpTab === 2) card.basketBp2 = list;
        else card.basketBp1 = list;
      } else if (Number(card.deliveries) >= 2 && card.slot === 2) card.basket2 = list;
      else card.basket = list;
      return;
    }
    price.baskets[price.activeDog] = list;
  }

  function lineUnit(it) {
    var name = it.main || it.name || "";
    if (eng() && eng().unitForItem) return eng().unitForItem(it.cat, name);
    return it.cat === "chew" ? "шт" : "гр";
  }

  function lineTitle(it) {
    var raw = it.main || it.name || "";
    var name = (eng() && eng().prettyProductName) ? eng().prettyProductName(raw) : raw;
    var sub = String(it.sub || "").trim();
    return name + (sub ? " · " + sub : "");
  }

  function linePiece_(it) {
    var unit = lineUnit(it);
    return it.cat === "chew" || it.cat === "chews" || unit === "шт";
  }

  function lineGramHtml_(it, i, act) {
    if (linePiece_(it) || !root.BoinyaOrders || !root.BoinyaOrders.gramQtyHtml) return "";
    var mix = root.BoinyaCrumbMix;
    var srcs = (it.sources || []).filter(function (s) { return s && (s.name || s.main); });
    if (mix && mix.isCrumb(it) && srcs.length >= 2) return "";
    var val = it.val != null ? it.val : it.value;
    return root.BoinyaOrders.gramQtyHtml(act, val, lineUnit(it), ' data-i="' + i + '"');
  }

  function lineHtml(it, i) {
    var val = it.val != null ? it.val : it.value;
    var mix = root.BoinyaCrumbMix;
    var body;
    var grams = view === "card" ? "" : lineGramHtml_(it, i, "cl-gqty");
    if (mix && mix.isCrumb(it) && mix.rowHtml) {
      body = '<div class="b-grow">' + mix.rowHtml(it, function (name) {
        return (eng() && eng().prettyProductName) ? eng().prettyProductName(name) : name;
      }) + "</div>";
    } else if (grams) {
      body = '<span class="b-grow">' + esc(lineTitle(it)) + "</span>";
    } else {
      body = '<span class="b-grow">' + esc(lineTitle(it) + " · " + (val || 0) + " " + lineUnit(it)) + "</span>";
    }
    return '<div class="b-row" style="margin-top:6px">' + body + grams +
      '<button type="button" class="b-chip" data-act="cl-del-line" data-i="' + i + '">Удалить</button></div>';
  }

  function basketBlock() {
    var list = activeBasket();
    var html = '<p class="b-lbl">Состав</p>';
    if (!list.length) html += '<p class="b-note">Пока пусто.</p>';
    else html += list.map(lineHtml).join("");
    html += actions(
      '<button type="button" class="b-btn b-btn--sec" data-act="cl-add">+ Позиция</button>' +
      '<button type="button" class="b-btn b-btn--sec" data-act="cl-clear">Очистить</button>'
    );
    return html;
  }

  async function loadPeople() {
    if (people.length) return;
    try {
      var res = await api().apiGet({ action: "listAccess" }, { timeoutMs: 15000, cacheTtlMs: 60000 });
      people = (res && (res.people || res.items)) || [];
    } catch (e) { people = []; }
  }

  function ownerOptions(selected) {
    var html = '<option value="">— выберите —</option>';
    people.forEach(function (p) {
      var id = String(p.telegramId || "");
      if (!id) return;
      var name = p.name || id;
      html += '<option value="' + esc(id) + '"' + (id === String(selected || "") ? " selected" : "") + ">" + esc(name) + "</option>";
    });
    return html;
  }

  function sheetKey_(s) {
    var sh = String((s && (s.sheet || s.segment)) || "").trim().toUpperCase();
    if (sh === "BP") return "БП";
    return sh;
  }

  function filteredSubs() {
    var q = String(search || "").trim().toLowerCase();
    var sheet = sheetOf(seg);
    var rows = subs.filter(function (s) { return sheetKey_(s) === sheet; });
    if (sheet === "БП") {
      rows = rows.filter(function (s) { return !isRetailMarkedSub_(s); });
      rows = groupBpSubscriptions_(rows);
    }
    if (q) {
      rows = rows.filter(function (s) {
        return String(s.nick || "").toLowerCase().indexOf(q) >= 0 || String(s.label || "").toLowerCase().indexOf(q) >= 0;
      });
    }
    return rows;
  }

  async function loadSubs(force, attempt) {
    subsLoading = true;
    subsError = "";
    var params = { action: "listSubscriptions" };
    if (force) { params.force = "1"; params._ = String(Date.now()); }
    try {
      var res = await api().apiGet(params, { timeoutMs: force ? 28000 : 22000, cacheTtlMs: force ? 0 : 30000 });
      if (!res || res.status !== "success") throw new Error((res && (res.message || res.detail)) || "CRM не ответила");
      subs = Array.isArray(res.subscriptions) ? res.subscriptions : [];
      subsLoading = false;
      subsError = "";
    } catch (e) {
      if (!force && !attempt) return loadSubs(false, 1);
      subsLoading = false;
      subsError = (e && e.message) || "Не удалось загрузить";
      if (!subs.length && force) sh().toast(subsError);
    }
  }

  async function loadSurveys() {
    surveysLoading = true;
    try {
      var res = await api().apiGet({ action: "listSurvey", activeOnly: "1" }, { timeoutMs: 45000, cacheTtlMs: 0 });
      surveys = (res && res.items) || [];
    } finally {
      surveysLoading = false;
    }
  }

  function paintList() {
    var rows = filteredSubs();
    var html = segBar();
    html += ppTotalsHtml();
    html += '<div class="b-row" style="margin-bottom:8px">' +
      '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="cl-refresh">Обновить</button>' +
      '<span class="b-note" style="margin:0">' + rows.length + "</span></div>";
    html += field("cxSearch", search, "Поиск по нику");
    if (seg === "bp") {
      html += actions(
        '<button type="button" class="b-btn b-btn--sec" data-act="cl-bp-add">+ Клиент БП</button>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="cl-edit-mode">' + (editMode ? "Готово" : "Редактировать") + "</button>"
      );
      if (editMode) {
        html += '<button type="button" class="b-btn b-btn--sec" data-act="cl-del-picked" style="margin-top:8px">Удалить выбранных</button>';
      }
      if (showBpForm) html += bpForm();
    }
    if (subsLoading && !subs.length) html += sh().skeleton(4);
    else if (subsError && !subs.length) html += sh().errorBox({ title: "Не удалось загрузить", text: subsError, act: "cl-refresh" });
    else if (!rows.length) html += '<p class="b-note">В этом списке пусто.</p>';
    html += '<div class="b-list">';
    rows.forEach(function (s, i) {
      var key = String(s.subId || s.nick || i);
      var mark = editMode
        ? '<button type="button" class="b-chip' + (picked[key] ? " b-chip--on" : "") + '" data-act="cl-pick" data-key="' + esc(key) + '">' + (picked[key] ? "Выбран" : "Выбрать") + "</button>"
        : "";
      var who = String(s.label || s.nick || "Без ника").split(/\s*[·•]\s*/);
      var dog = who[0] || s.nick || "Без ника";
      var nick = who[1] || "";
      html += '<button type="button" class="row" data-act="cl-open" data-nick="' + esc(s.nick || "") + '" data-sub="' + esc(s.subId || "") + '" data-sheet="' + esc(s.sheet || sheetOf(seg)) + '">' +
        '<span class="avatar" aria-hidden="true">' + esc(String(dog).slice(0, 1).toUpperCase()) + "</span>" +
        '<span class="who"><span class="name">' + esc(dog) + "</span>" +
        (nick ? '<span class="sub">' + esc(nick) + "</span>" : "") +
        (s.phone ? '<span class="sub">' + esc(s.phone) + "</span>" : "") +
        "</span>" +
        (function () {
          var pill = "";
          if (seg === "bp" && W() && W().listLabel) pill = W().listLabel(s.status, s.bpOutcome);
          else if (seg === "bp") pill = "БП";
          else pill = s.status || "";
          return pill ? '<span class="pill pill--ok">' + esc(pill) + "</span>" : "";
        })() +
        mark + "</button>";
    });
    html += "</div>";
    if (showBpForm) {
      sh().dock('<div class="nx-actions"><button type="button" class="b-btn b-btn--sec" data-act="cl-bp-cancel">Отмена</button>' +
        '<button type="button" class="b-btn b-btn--main" data-act="cl-bp-save">Сохранить</button></div>');
    } else sh().dock("");
    sh().main(html);
    if (focusNick) {
      var btn = document.querySelector('[data-act="cl-open"][data-nick="' + focusNick.replace(/"/g, "") + '"]');
      if (btn) { focusNick = ""; btn.click(); }
    }
  }

  function bpForm() {
    return '<article class="b-card" style="margin-top:12px">' +
      '<p class="b-lbl">Новый клиент БП</p>' +
      field("cxBpNick", "", "Ник") +
      '<p class="b-lbl">Дата опросника</p>' + field("cxBpDate", ymdPlusDaysLocal_("", 4), "", 'type="date"') +
      '<p class="b-lbl">Менеджер</p><label class="b-field"><select class="b-field__input" id="cxBpOwner" data-k="cxBpOwner">' + ownerOptions("") + "</select></label>" +
      field("cxBpAddress", "", "Адрес") +
      field("cxBpPhone", "", "Телефон") +
      area("cxBpWishes", "", "Пожелания") +
      "</article>";
  }

  function paintSurvey() {
    var rows = surveys.slice();
    var html = segBar();
    html += actions(
      '<button type="button" class="b-btn b-btn--sec" data-act="cl-sv-add">+ Опросник</button>' +
      '<button type="button" class="b-btn b-btn--sec" data-act="cl-edit-mode">' + (editMode ? "Готово" : "Удалить выбранных") + "</button>"
    );
    if (editMode) html += '<button type="button" class="b-btn b-btn--sec" data-act="cl-sv-del" style="margin-top:8px">Удалить выбранных</button>';
    if (showSurveyForm) {
      html += '<article class="b-card" style="margin-top:12px"><p class="b-lbl">Новый опросник</p>' +
        field("cxSvNick", "", "Ник") +
        '<p class="b-note">После БП</p>' +
        field("cxSvDue", ymdPlusDaysLocal_("", 4), "", 'type="date"') +
        '<label class="b-field"><select class="b-field__input" id="cxSvOwner" data-k="cxSvOwner">' + ownerOptions("") + "</select></label>" +
        "</article>";
    }
    rows.forEach(function (it, i) {
      var id = String(it.id || i);
      html += '<article class="b-card" style="margin-top:8px">' +
        (editMode ? '<button type="button" class="b-chip' + (picked[id] ? " b-chip--on" : "") + '" data-act="cl-pick" data-key="' + esc(id) + '">' + (picked[id] ? "Выбран" : "Выбрать") + "</button>" : "") +
        '<p class="b-li__title" style="margin:8px 0 0">' + esc(it.nick || "Без ника") + "</p>" +
        '<p class="b-note">' + esc("После БП " + (it.dueDate || "") + " " + (it.status || "")) + "</p>" +
        '<label class="b-field"><select class="b-field__input" id="svOwn' + i + '" data-k="svOwn' + i + '" data-i="' + i + '">' + ownerOptions(it.ownerTelegramId) + "</select></label>" +
        actions(
          '<button type="button" class="b-btn b-btn--sec" data-act="cl-sv-owner" data-i="' + i + '">Сохранить отв.</button>' +
          '<button type="button" class="b-btn b-btn--sec" data-act="cl-sv-st" data-i="' + i + '" data-st="sent">Отправлено</button>' +
          '<button type="button" class="b-btn b-btn--sec" data-act="cl-sv-st" data-i="' + i + '" data-st="done">Готово</button>' +
          '<button type="button" class="b-btn b-btn--sec" data-act="cl-sv-st" data-i="' + i + '" data-st="cancelled">Отмена</button>'
        ) + "</article>";
    });
    if (surveysLoading && !rows.length) html += sh().skeleton(3);
    else if (!rows.length) html += '<p class="b-note">Опросников нет.</p>';
    if (showSurveyForm) {
      sh().dock('<div class="nx-actions"><button type="button" class="b-btn b-btn--sec" data-act="cl-sv-cancel">Отмена</button>' +
        '<button type="button" class="b-btn b-btn--main" data-act="cl-sv-save">Сохранить</button></div>');
    } else sh().dock("");
    sh().main(html);
  }

  function packsHtml(prefix, counts, keys) {
    var html = '<div class="b-row">';
    keys.forEach(function (k) {
      html += '<label class="b-field b-grow"><span class="b-note">' + esc(k[1]) + '</span><input class="b-field__input" data-k="' + prefix + k[0] + '" value="' + esc(counts[k[0]] || 0) + '" inputmode="numeric"></label>';
    });
    html += "</div>";
    return html;
  }

  function fracHtml(prefix, fr) {
    var keys = [["slices", "Ломтики"], ["strips", "Полоски"], ["large", "Крупное"], ["medium", "Среднее"], ["small", "Мелкое"], ["extraSmall", "Очень мелкое"]];
    return packsHtml(prefix, fr, keys);
  }

  function groupBox(title, inner) {
    return '<section class="nx-group"><h2>' + esc(title) + "</h2>" + inner + "</section>";
  }

  function splitAddr(raw) {
    var parsed = eng() && eng().parseDeliveryAddress ? eng().parseDeliveryAddress(raw || "") : null;
    return {
      street: (parsed && parsed.street) || raw || "",
      entrance: (parsed && parsed.entrance) || "",
      floor: (parsed && parsed.floor) || "",
      flat: (parsed && parsed.flat) || ""
    };
  }

  function joinAddr() {
    if (!card) return;
    if (eng() && eng().composeDeliveryAddress) {
      card.address = eng().composeDeliveryAddress(card.addrStreet, card.addrEntrance, card.addrFloor, card.addrFlat);
    } else {
      card.address = [card.addrStreet, card.addrEntrance, card.addrFloor, card.addrFlat].filter(Boolean).join(", ");
    }
  }

  function ppListTotals_(list) {
    var seen = {};
    var turnover = 0;
    var cost = 0;
    var costKnown = false;
    var n = 0;
    (list || []).forEach(function (s) {
      if (String((s && s.sheet) || "") !== "ПП") return;
      var id = String((s && s.subId) || "").trim();
      var key = id ? ("id:" + id.toUpperCase()) : ("row:" + String((s && s.rowIndex) || "") + "|" + String((s && s.nick) || "").toUpperCase());
      if (seen[key]) return;
      seen[key] = true;
      n++;
      var turn = Number(s.turnover);
      if (!isFinite(turn)) turn = 0;
      turnover += turn;
      if (s.cost != null && s.cost !== "") {
        costKnown = true;
        cost += Number(s.cost) || 0;
      }
    });
    turnover = Math.round(turnover * 100) / 100;
    cost = costKnown ? Math.round(cost * 100) / 100 : null;
    return {
      clients: n,
      turnover: turnover,
      cost: cost,
      income: cost == null ? null : Math.round((turnover - cost) * 100) / 100
    };
  }

  var ppMoney = null;
  var ppMoneyState = "";

  function moneyFixed(v) {
    if (v == null) return "нет данных";
    return sh().money(v) + " BYN";
  }

  function finiteMoney_(v) {
    if (v == null || v === "" || !isFinite(Number(v))) return null;
    return Number(v);
  }

  /** Оборот листа ПП: ожидаемая цена подписки один раз (getStats.pp.expected).
   *  Не fact.ppRevenue и не statsScreen_().pp.turnover: то уже отвезено в этом месяце. */
  function ppMoneyFromStats_(res) {
    res = res || {};
    var pp = res.pp || {};
    var money = res.money || {};
    var turn = finiteMoney_(pp.expected);
    if (turn == null) turn = finiteMoney_(money.ppExpected);
    if (turn == null) turn = finiteMoney_(money.sheetTurnover);
    if (turn == null) turn = finiteMoney_(pp.turnover);
    if (turn == null) turn = finiteMoney_(money.ppTurnover);
    if (turn == null) return null;
    var cost = finiteMoney_(pp.cost);
    if (cost == null) cost = finiteMoney_(money.ppCost);
    var income = finiteMoney_(pp.clean);
    if (income == null) income = finiteMoney_(money.ppClean);
    if (income == null && cost != null) income = Math.round((turn - cost) * 100) / 100;
    return {
      turnover: turn,
      income: income,
      cost: cost,
      month: String(res.monthKey || "")
    };
  }

  async function loadPpMoney() {
    var lib = root.BoinyaStatsLogic;
    if (!lib || !lib.currentStatsMonthKey_) return;
    var mk = lib.currentStatsMonthKey_();
    if (ppMoney && ppMoney.month === mk && ppMoneyState === "ok") return;
    ppMoneyState = "load";
    try {
      var res = await api().apiGet(
        { action: "getStats", period: "month", month: mk },
        { timeoutMs: 28000, cacheTtlMs: 20000 }
      );
      if (!res || res.status !== "success") throw new Error("stats");
      var got = String(res.monthKey || "");
      if (got && got !== mk) throw new Error("month");
      ppMoney = ppMoneyFromStats_(res);
      ppMoneyState = ppMoney ? "ok" : "err";
    } catch (e) {
      ppMoney = null;
      ppMoneyState = "err";
    }
  }

  function ppTotalsHtml() {
    if (seg !== "pp") return "";
    var all = (subs || []).filter(function (s) { return String(s.sheet || "") === "ПП"; });
    if (!all.length && ppMoneyState !== "ok") return "";
    var fromStats = (ppMoneyState === "ok" && ppMoney && ppMoney.turnover != null) ? ppMoney : null;
    var fromList = all.length ? ppListTotals_(all) : null;
    var t = fromStats || ((ppMoneyState === "err" || ppMoneyState === "ok") ? fromList : null);
    var turn = t ? t.turnover : null;
    var income = t ? t.income : null;
    var cost = t ? t.cost : null;
    var wait = !t && ppMoneyState !== "ok" && ppMoneyState !== "err";
    return '<div class="nx-counters nx-pp-totals" style="margin:8px 0 12px">' +
      '<div class="nx-count"><b>' + esc(wait ? "…" : moneyFixed(turn)) + "</b><span>Оборот</span></div>" +
      '<div class="nx-count"><b>' + esc(wait ? "…" : moneyFixed(income)) + "</b><span>Приход</span></div>" +
      '<div class="nx-count"><b>' + esc(wait ? "…" : moneyFixed(cost)) + "</b><span>Себес</span></div>" +
      "</div>" +
      '<p class="b-note">Цена один раз. Если оплата отмечена, она на слоте ПП1 или ПП2. Пока оплаты нет, оборот — сумма цен подписок.</p>';
  }

  function paintCard() {
    var c = card;
    var html = segBar();
    html += '<button type="button" class="nx-link" data-act="cl-back">← К списку</button>';
    var clientFields = '<p class="b-lbl">Имя</p>' + field("cxLabel", c.label, "Имя") +
      '<p class="b-lbl">Ник</p>' + field("cxNick", c.nick, "Ник") +
      '<p class="b-lbl">Телефон</p>' + field("cxPhone", c.phone, "Телефон") +
      '<p class="b-lbl">Адрес</p>' + field("cxAddress", c.addrStreet, "Адрес") +
      '<p class="b-lbl">Подъезд</p>' + field("cxEnt", c.addrEntrance, "Подъезд") +
      '<p class="b-lbl">Этаж</p>' + field("cxFl", c.addrFloor, "Этаж") +
      '<p class="b-lbl">Квартира</p>' + field("cxApt", c.addrFlat, "Квартира");
    if (c.sheet === "БП") {
      clientFields += '<p class="b-lbl">Менеджер</p><label class="b-field"><select class="b-field__input" id="cxOwner" data-k="cxOwner">' + ownerOptions(c.ownerTelegramId) + "</select></label>";
    }
    html += groupBox("Клиент", clientFields);
    html += groupBox("Собака",
      '<p class="b-lbl">Кличка</p>' + field("cxDog", c.dogName, "Кличка") +
      '<p class="b-lbl">Порода</p>' + field("cxBreed", c.dogBreed, "Порода") +
      '<p class="b-lbl">Вес, кг</p>' + field("cxWeight", c.dogWeight, "кг"));
    var subFields = '<p class="b-lbl">Лист</p><p class="b-note">' + esc(c.sheet || "ПП") + "</p>" +
      (c.sheet === "БП"
        ? '<p class="b-lbl">Статус</p><p class="b-note">БП</p>'
        : '<p class="b-lbl">Статус</p>' + field("cxStatus", c.status, "Статус")) +
      '<p class="b-lbl">Доставок</p>' + field("cxN", c.deliveries, "1", 'inputmode="numeric"') +
      (c.sheet === "ПП" ? '<p class="b-note" id="cxDelivLine">' + esc(delivLine(c.deliveries)) + "</p>" : "") +
      '<p class="b-lbl">ID</p>' + field("cxSubId", c.subId, "ID");
    if (c.sheet === "БП") {
      var wkLab = W() ? W().statusLabel(c.bpWeeks, c.bpOutcome) : "";
      if (wkLab) subFields += '<p class="b-lbl">Итог</p><p class="b-note">' + esc(wkLab) + "</p>";
      subFields += '<p class="b-lbl">Опросник</p>' + field("cxSv2", c.surveyBp2Due, "", 'type="date"') +
        '<p class="b-lbl">Дата опросника</p>' + field("cxSvF", c.surveyFinalDue, "", 'type="date"');
    }
    subFields += '<p class="b-lbl">Пожелания</p>' + area("cxWishes", c.wishes, "Пожелания");
    html += groupBox("Подписка", subFields);
    var priceBits = "";
    if (c.sheet === "ПП" || c.sheet === "АФК") {
      if (Number(c.deliveries) >= 2) {
        priceBits += '<p class="b-lbl">Состав доставки</p><div class="b-seg">' +
          '<button type="button" class="b-seg__item' + (c.slot === 1 ? " b-seg__item--on" : "") + '" data-act="cl-slot" data-n="1">Доставка 1</button>' +
          '<button type="button" class="b-seg__item' + (c.slot === 2 ? " b-seg__item--on" : "") + '" data-act="cl-slot" data-n="2">Доставка 2</button></div>';
      }
    }
    if (c.sheet === "БП" && c.basketBp2 && c.basketBp2.length) {
      priceBits += '<p class="b-lbl">Состав</p><div class="b-seg">' +
        '<button type="button" class="b-seg__item' + (c.bpTab !== 2 ? " b-seg__item--on" : "") + '" data-act="cl-bptab" data-n="1">Состав</button>' +
        '<button type="button" class="b-seg__item' + (c.bpTab === 2 ? " b-seg__item--on" : "") + '" data-act="cl-bptab" data-n="2">Ещё состав</button></div>';
    }
    priceBits += basketBlock();
    if (c.sheet === "ПП") {
      priceBits += '<p class="b-lbl">Факт (расчёт)</p>' + field("cxFact", c.calcFactCost || c.factCost, "факт", "readonly");
      priceBits += '<p class="b-lbl">Указанная стоимость</p>' + field("cxStated", c.statedCost, "указанная");
      priceBits += '<p class="b-note">' + esc(c.scheme === "RAW26" ? "схема сырьё×2.6" : "старая схема ×2.3+11+6N") + "</p>";
      if (access && access.role === "owner") {
        priceBits += '<button type="button" class="b-btn b-btn--sec" data-act="cl-econ" style="margin-top:8px">Экономика</button>';
      }
      if (c.scheme !== "RAW26") {
        priceBits += '<button type="button" class="b-btn b-btn--sec" data-act="cl-migrate" style="margin-top:8px">Перевести на новую схему (сырьё×2.6)</button>';
      }
    }
    priceBits += '<button type="button" class="b-btn b-btn--sec" data-act="cl-deep" style="margin-top:8px">' + (deep ? "Свернуть" : "Глубокий редактор") + "</button>";
    html += groupBox("Состав и цена", priceBits);
    if (deep) html += deepHtml();
    var move = "";
    if (c.sheet === "ПП") move = '<button type="button" class="b-btn b-btn--sec" data-act="cl-move" data-to="АФК">Перенести в АФК</button>';
    if (c.sheet === "АФК") move = '<button type="button" class="b-btn b-btn--sec" data-act="cl-move" data-to="ПП">Вернуть в ПП</button>';
    html += actions(
      '<button type="button" class="b-btn b-btn--sec" data-act="cl-msg">Сообщение клиенту</button>' +
      move +
      '<button type="button" class="b-btn b-btn--sec" data-act="cl-delete">Удалить</button>'
    );
    if (c.sheet === "БП") {
      var closed = W() && (W().outcomeOf(c.bpOutcome) === "done" || W().outcomeOf(c.bpOutcome) === "pp");
      var bpActs = '<button type="button" class="b-btn b-btn--main" data-act="cl-to-pp">Переход → расчёт ПП</button>';
      if (!closed) bpActs += '<button type="button" class="b-btn b-btn--sec" data-act="cl-bp-done">Завершён</button>';
      bpActs += '<button type="button" class="b-btn b-btn--sec" data-act="cl-touch">Отметить контакт</button>';
      html += actions(bpActs);
    }
    sh().dock('<button type="button" class="b-btn b-btn--main" data-act="cl-save">Сохранить</button>');
    sh().main(html);
  }

  function deepHtml() {
    var coef = view === "card" ? card.coef : price.coef;
    var html = '<article class="b-card" style="margin-top:8px"><p class="b-lbl">Коэффициент</p><div class="b-row">';
    ["2.0", "2.3", "2.5", "2.6"].forEach(function (v) {
      html += '<button type="button" class="b-chip' + (String(coef) === v ? " b-chip--on" : "") + '" data-act="cl-coef" data-v="' + v + '">' + v + "</button>";
    });
    html += "</div>";
    html += '<p class="b-lbl">Пакеты У1–УП4</p>';
    var pc = (view === "card" ? card.packCounts : null) || { u1: price.packs.small, u2: price.packs.medium, u3: price.packs.large, up4: price.packs.legs };
    html += packsHtml("cxU", pc, [["u1", "У1"], ["u2", "У2"], ["u3", "У3"], ["up4", "УП4"]]);
    html += '<p class="b-lbl">Наценка фракций</p>' + fracHtml("cxF", view === "card" ? (card.fracs || price.fracs) : price.fracs);
    html += actions(
      '<button type="button" class="b-btn b-btn--sec" data-act="cl-recalc">Пересчитать цену</button>' +
      '<button type="button" class="b-btn b-btn--sec" data-act="cl-manual">Ручной ввод</button>' +
      '<button type="button" class="b-btn b-btn--sec" data-act="cl-clear">Очистить</button>' +
      '<button type="button" class="b-btn b-btn--sec" data-act="cl-deep">Свернуть</button>'
    );
    html += "</article>";
    return html;
  }

  function paintCalc() {
    if (!price.packsManual) syncAutoPacks_();
    var html = '<button type="button" class="nx-link" data-act="price-back">← Назад</button>';
    if (enroll && price.mode !== "retail") {
      html += '<article class="b-card" id="enrollCard"><p class="b-lbl">Внести в ПП</p>' +
        field("cxEnName", enroll.displayName, "Имя") +
        field("cxEnNick", enroll.nick, "Ник") +
        area("cxEnNote", enroll.note, "Примечание") +
        field("cxEnAddr", enroll.address, "Адрес") +
        field("cxEnPhone", enroll.phone, "Телефон") +
        field("cxEnN", enroll.deliveriesN, "N", 'inputmode="numeric"') +
        field("cxEnFact", enroll.fact, "Факт", 'inputmode="decimal"') +
        '<button type="button" class="b-btn b-btn--sec" data-act="cl-enroll-cancel" style="margin-top:8px">Отмена</button>' +
        "</article>";
    }
    html += '<p class="b-lbl">Режим</p><div class="b-seg">' +
      '<button type="button" class="b-seg__item' + (price.mode === "pp" ? " b-seg__item--on" : "") + '" data-act="cl-mode" data-m="pp">Подписка</button>' +
      '<button type="button" class="b-seg__item' + (price.mode === "retail" ? " b-seg__item--on" : "") + '" data-act="cl-mode" data-m="retail">Розница</button></div>';
    if (price.mode === "retail") {
      var retailNow = retailCalcChoice_(eng(), allItems(), price.retailDelivery);
      html += '<p class="b-lbl">Доставка</p><div class="b-seg">' +
        '<button type="button" class="b-seg__item' + (retailNow.mode === "paid" ? " b-seg__item--on" : "") + '" data-act="cl-rdel" data-v="paid">Платная доставка</button>' +
        '<button type="button" class="b-seg__item' + (retailNow.mode === "free" ? " b-seg__item--on" : "") + '" data-act="cl-rdel" data-v="free">Без доставки</button></div>' +
        '<p class="b-note">' + esc(retailNow.note) + "</p>";
    }
    html += '<p class="b-lbl">Собаки</p><div class="b-seg">' +
      '<button type="button" class="b-seg__item' + (price.dogCount === 1 ? " b-seg__item--on" : "") + '" data-act="cl-dogs" data-n="1">1</button>' +
      '<button type="button" class="b-seg__item' + (price.dogCount === 2 ? " b-seg__item--on" : "") + '" data-act="cl-dogs" data-n="2">2</button></div>';
    if (price.dogCount === 2) {
      html += '<div class="b-seg" style="margin-top:8px">' +
        '<button type="button" class="b-seg__item' + (price.activeDog === 1 ? " b-seg__item--on" : "") + '" data-act="cl-dog" data-n="1">' + esc(price.dogNames[1] || "Собака 1") + "</button>" +
        '<button type="button" class="b-seg__item' + (price.activeDog === 2 ? " b-seg__item--on" : "") + '" data-act="cl-dog" data-n="2">' + esc(price.dogNames[2] || "Собака 2") + "</button></div>";
    }
    html += field("cxDogName", price.dogNames[price.activeDog] || "", "Кличка");
    if (price.mode !== "retail") {
      html += '<p class="b-lbl">N доставок</p>' + field("cxDelN", price.deliveriesN, "2", 'inputmode="numeric"');
      html += '<p class="b-note" id="cxDelivLine">' + esc(delivLine(price.deliveriesN)) + "</p>";
      if (Number(price.deliveriesN) >= 2) {
        html += '<p class="b-lbl">Слот</p><div class="b-seg">' +
          '<button type="button" class="b-seg__item' + (price.slot === 1 ? " b-seg__item--on" : "") + '" data-act="cl-pslot" data-n="1">1</button>' +
          '<button type="button" class="b-seg__item' + (price.slot === 2 ? " b-seg__item--on" : "") + '" data-act="cl-pslot" data-n="2">2</button></div>';
      }
      html += '<p class="b-lbl">Коэффициент</p><div class="b-row">';
      ["2.0", "2.3", "2.5", "2.6"].forEach(function (v) {
        html += '<button type="button" class="b-chip' + (String(price.coef) === v ? " b-chip--on" : "") + '" data-act="cl-coef" data-v="' + v + '">' + v + "</button>";
      });
      html += "</div>";
      html += '<p class="b-lbl">Наценка фракций</p>' + fracHtml("cxF", price.fracs);
    }
    html += '<p class="b-lbl">Пакеты <span class="b-note" data-pack-byn>' + esc(rubShort_(packagesBynNow())) + " р в цене</span></p>" + packsHtml("cxP", price.packs, [["small", "мал"], ["medium", "ср"], ["large", "бол"], ["legs", "ножк"]]);
    html += '<button type="button" class="b-btn b-btn--sec" data-act="cl-repack" style="margin-top:8px">Пересчитать пакеты</button>';
    html += '<p class="b-lbl">Примечание для клиента</p>' + area("cxNote", price.note, "Примечание");
    html += basketBlock();
    html += '<p class="b-lbl">Чеклист Instagram</p>' + area("cxIg", price.ig, "Вставь список из Direct");
    html += actions('<button type="button" class="b-btn b-btn--sec" data-act="cl-ig">В состав</button><button type="button" class="b-btn b-btn--sec" data-act="cl-ig-clear">Очистить</button>');
    if (price.mode === "retail") {
      html += '<button type="button" class="b-btn b-btn--sec" data-act="cl-manual" style="margin-top:8px">Ручной ввод</button>';
    }
    if (price.message) {
      html += '<article class="b-card" id="cxMsg" style="margin-top:12px;white-space:pre-wrap">' + esc(price.message) + "</article>";
      html += '<button type="button" class="b-btn b-btn--sec" id="cxMsgCopy" data-act="cl-copy" style="margin-top:8px">Копировать сообщение</button>';
    }
    var tailEnroll = price.mode === "retail"
      ? '<button type="button" class="b-btn b-btn--sec" data-act="cl-order-open">Внести заказ</button>'
      : '<button type="button" class="b-btn b-btn--sec" data-act="cl-enroll-open">Внести в ПП</button>';
    html += '<div id="cxCalcTail">' + actions(
      '<button type="button" class="b-btn b-btn--sec" data-act="cl-defer">В отложенное</button>' +
      tailEnroll
    ) + "</div>";
    if (enroll && price.mode !== "retail") {
      sh().dock('<div class="nx-actions"><button type="button" class="b-btn b-btn--sec" data-act="cl-compose">Собрать сообщение</button>' +
        '<button type="button" class="b-btn b-btn--main" data-act="cl-enroll-go">Внести в лист ПП</button></div>');
    } else sh().dock('<button type="button" class="b-btn b-btn--main" data-act="cl-compose">Собрать сообщение</button>');
    sh().main(html);
  }

  function paintPick() {
    var html = '<button type="button" class="nx-link" data-act="price-back">← Назад</button>';
    html += '<p class="b-lbl">Тип</p><div class="b-row">';
    [["bp", "БП"], ["retail", "Розница"], ["pp", "Подписка"]].forEach(function (p) {
      var pickOn = pick.type === p[0] || (p[0] === "bp" && (pick.type === "bp1" || pick.type === "bp2"));
      html += '<button type="button" class="b-chip' + (pickOn ? " b-chip--on" : "") + '" data-act="cl-pick-type" data-t="' + p[0] + '">' + p[1] + "</button>";
    });
    html += "</div>";
    html += '<p class="b-lbl">Анкета</p>' + area("cxAnketa", pick.anketa, "Текст анкеты");
    html += '<button type="button" class="b-btn b-btn--sec" data-act="cl-pick-clear" style="margin-top:8px">Очистить</button>';
    if (pick.result && pick.result.items) {
      html += '<div id="cxPickOut">';
      var lastCat = "";
      pick.result.items.forEach(function (it, i) {
        var cat = it.cat === "dressura" ? "Дрессура" : (it.cat === "chew" ? "Жевалки" : (it.cat === "veg" ? "Овощи-Фрукты" : (it.cat === "crumb" ? "Крошки" : "Другое")));
        if (cat !== lastCat) {
          html += '<p class="b-lbl">' + esc(cat) + "</p>";
          lastCat = cat;
        }
        var val = it.val != null ? it.val : it.value;
        var sub = String(it.sub || "").trim();
        var pickGrams = lineGramHtml_(it, i, "cl-pick-g");
        html += '<div class="b-row" style="margin-top:6px"><span class="b-grow"><span class="b-li__title">' + esc(it.main || it.name || "") + "</span>" +
          (sub ? '<span class="b-li__sub">' + esc(sub) + "</span>" : "") +
          (pickGrams ? "" : '<span class="b-li__sub">' + esc(String(val == null ? "" : val) + " " + lineUnit(it)) + "</span>") +
          "</span>" + pickGrams +
          '<button type="button" class="b-chip" data-act="cl-pick-del" data-i="' + i + '">Удалить</button></div>';
      });
      if (pick.text) html += '<article class="b-card" style="margin-top:12px;white-space:pre-wrap">' + esc(pick.text) + "</article>";
      html += actions(
        '<button type="button" class="b-btn b-btn--sec" data-act="cl-pick-calc">В расчёт</button>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="cl-pick-again">Подобрать ещё</button>'
      );
      html += "</div>";
    }
    sh().dock(pick.busy
      ? '<button type="button" class="b-btn b-btn--main b-btn--loading" data-act="cl-pick-go" disabled><span class="b-spin"></span> Подбираю…</button>'
      : '<button type="button" class="b-btn b-btn--main" data-act="cl-pick-go">Подобрать</button>');
    sh().main(html);
  }

  function paint() {
    if (view === "card" && card) { paintCard(); return; }
    if (seg === "survey") { paintSurvey(); return; }
    if (seg === "calc") { paintCalc(); return; }
    if (seg === "pick") { paintPick(); return; }
    paintList();
  }

  async function show(nextSeg) {
    var tool = nextSeg === "calc" || nextSeg === "pick";
    var items = segs(access);
    if (!tool && !items.some(function (s) { return s.id === nextSeg; })) nextSeg = (items[0] && items[0].id) || "pp";
    if (nextSeg !== seg) { view = "list"; card = null; }
    seg = nextSeg;
    if ((seg === "pp" || seg === "afk" || seg === "bp") && canSubs() && view === "list" && !subs.length) subsLoading = true;
    if (seg === "survey" && canSubs() && !surveys.length) surveysLoading = true;
    paint();
    if ((seg === "pp" || seg === "afk" || seg === "bp") && canSubs() && view === "list") {
      loadPeople().catch(function () {});
      if (seg === "pp") {
        loadPpMoney().then(function () {
          if (view === "list" && seg === "pp") paint();
        });
      }
      loadSubs(false).then(function () {
        if (view === "list" && (seg === "pp" || seg === "afk" || seg === "bp")) paint();
      });
    }
    if (seg === "survey" && canSubs()) {
      try { await loadPeople(); await loadSurveys(); } catch (e) {}
      paint();
    }
  }

  function readNode(node) {
    if (!node || !node.getAttribute) return false;
    var k = node.getAttribute("data-k") || "";
    if (!k) return false;
    var v = node.value;
    if (k === "cxSearch") { search = v; return true; }
    if (!card && view !== "card" && seg !== "calc" && seg !== "pick") return k.indexOf("cx") === 0;
    if (k === "cxLabel" && card) card.label = v;
    if (k === "cxNick" && card) card.nick = v;
    if (k === "cxDog" && card) card.dogName = v;
    if (k === "cxBreed" && card) card.dogBreed = v;
    if (k === "cxWeight" && card) card.dogWeight = v;
    if (k === "cxSubId" && card) card.subId = v;
    if (k === "cxN" && card) { card.deliveries = v; paintDelivLine(v); }
    if (k === "cxStatus" && card) card.status = v;
    if (k === "cxWishes" && card) card.wishes = v;
    if (k === "cxAddress" && card) { card.addrStreet = v; joinAddr(); }
    if (k === "cxEnt" && card) { card.addrEntrance = v; joinAddr(); }
    if (k === "cxFl" && card) { card.addrFloor = v; joinAddr(); }
    if (k === "cxApt" && card) { card.addrFlat = v; joinAddr(); }
    if (k === "cxPhone" && card) card.phone = v;
    if (k === "cxStated" && card) { card.statedCost = v; card.statedTouched = true; }
    if (k === "cxSv2" && card) card.surveyBp2Due = v;
    if (k === "cxSvF" && card) card.surveyFinalDue = v;
    if (k === "cxOwner" && card) card.ownerTelegramId = v;
    if (k === "cxDogName") price.dogNames[price.activeDog] = v;
    if (k === "cxDelN") { price.deliveriesN = monthN(v); paintDelivLine(v); schedulePpMessage(); }
    if (k === "cxNote") {
      var prevNote = price.note;
      price.note = v;
      if (enroll && String(enroll.note || "") === String(prevNote || "")) {
        enroll.note = v;
        var enMirror = document.getElementById("cxEnNote");
        if (enMirror && enMirror !== node) enMirror.value = v;
      }
      schedulePpMessage();
    }
    if (k === "cxIg") price.ig = v;
    if (k === "cxAnketa") pick.anketa = v;
    if (k === "cxEnName" && enroll) enroll.displayName = v;
    if (k === "cxEnNick" && enroll) enroll.nick = v;
    if (k === "cxEnNote" && enroll) {
      var prevEn = enroll.note;
      enroll.note = v;
      if (String(price.note || "") === String(prevEn || "")) {
        price.note = v;
        var cxMirror = document.getElementById("cxNote");
        if (cxMirror && cxMirror !== node) cxMirror.value = v;
      }
    }
    if (k === "cxEnAddr" && enroll) enroll.address = v;
    if (k === "cxEnPhone" && enroll) enroll.phone = v;
    if (k === "cxEnN" && enroll) enroll.deliveriesN = v;
    if (k === "cxEnFact" && enroll) enroll.fact = v;
    if (k.indexOf("cxP") === 0) {
      price.packs[k.slice(3)] = Number(v) || 0;
      price.packsManual = true;
      schedulePpMessage();
    }
    if (k.indexOf("cxF") === 0) {
      var fk = k.slice(3);
      price.fracs[fk] = Number(v);
      if (card) { card.fracs = card.fracs || Object.assign({}, price.fracs); card.fracs[fk] = Number(v); }
      schedulePpMessage();
    }
    if (k.indexOf("cxU") === 0 && card) card.packCounts[k.slice(3)] = Number(v) || 0;
    return k.indexOf("cx") === 0 || k.indexOf("svOwn") === 0;
  }

  function allItems() {
    var a = (price.baskets[1] || []).map(function (it) { var c = Object.assign({}, it); c.dog = 1; return c; });
    if (price.dogCount >= 2) {
      (price.baskets[2] || []).forEach(function (it) { var c = Object.assign({}, it); c.dog = 2; a.push(c); });
    }
    return a;
  }

  function fracRates() {
    return {
      slices: Number(price.fracs.slices) || 0,
      strips: Number(price.fracs.strips),
      large: Number(price.fracs.large),
      medium: Number(price.fracs.medium),
      small: Number(price.fracs.small),
      extraSmall: Number(price.fracs.extraSmall),
      whole: Number(price.fracs.slices) || 0
    };
  }

  async function liveCalc(list, extra) {
    extra = extra || {};
    var slim = list.map(function (it) { return eng().serializeBasketItem_(it); });
    var scheme = extra.scheme || price.scheme || P().defaultPpSchemeForNewLocal_();
    var coef = extra.coef != null ? extra.coef : price.coef;
    var deliveriesN = monthN(extra.deliveriesN != null && extra.deliveriesN !== "" ? extra.deliveriesN : price.deliveriesN);
    var forNew = extra.forNew !== 0;
    var payload = {
      action: "calcPrice",
      mode: extra.mode || (price.mode === "retail" ? "retail" : "pp"),
      basket: slim,
      deliveriesN: deliveriesN,
      coef: coef,
      fullFact: 1,
      forNew: forNew ? 1 : 0
    };
    if (scheme) payload.scheme = scheme;
    var packCounts = packCountsForApi_();
    payload.packCounts = JSON.stringify(packCounts);
    var res = null;
    try { res = await api().apiPost(payload); } catch (e) { res = null; }
    if (!res || res.status !== "success" || res.empty) {
      try {
        res = await api().apiGet({
          action: "calcPrice",
          mode: payload.mode,
          basket: JSON.stringify(slim),
          deliveriesN: String(deliveriesN),
          coef: String(coef),
          fullFact: "1",
          forNew: forNew ? "1" : "0",
          scheme: scheme || "",
          packCounts: payload.packCounts,
          _: String(Date.now())
        }, { timeoutMs: 25000, cacheTtlMs: 0 });
      } catch (e2) { res = null; }
    }
    if (!res || res.status !== "success" || res.empty) return null;
    return res;
  }

  function packagesBynNow() {
    var units = P().PRICE_PACK_UNIT || {};
    var sum = 0;
    ["small", "medium", "large", "legs"].forEach(function (k) {
      sum += (Number(price.packs[k]) || 0) * (Number(units[k]) || 0);
    });
    return Math.round(sum * 100) / 100;
  }

  function packCountsForApi_() {
    return {
      u1: Number(price.packs.small) || 0,
      u2: Number(price.packs.medium) || 0,
      u3: Number(price.packs.large) || 0,
      up4: Number(price.packs.legs) || 0
    };
  }

  function syncAutoPacks_() {
    if (price.packsManual) return false;
    var rec = P().recountPacks(allItems());
    var next = (rec && rec.counts) || {};
    var prev = price.packs || {};
    var same = ["small", "medium", "large", "legs"].every(function (k) {
      return (Number(prev[k]) || 0) === (Number(next[k]) || 0);
    });
    price.packs = {
      small: Number(next.small) || 0,
      medium: Number(next.medium) || 0,
      large: Number(next.large) || 0,
      legs: Number(next.legs) || 0
    };
    return !same;
  }

  function paintPackInputs_() {
    if (price.packsManual) return;
    ["small", "medium", "large", "legs"].forEach(function (k) {
      var el = document.querySelector('[data-k="cxP' + k + '"]');
      if (!el || document.activeElement === el) return;
      var next = String(price.packs[k] || 0);
      if (el.value !== next) el.value = next;
    });
    var note = document.querySelector("[data-pack-byn]");
    if (note) note.textContent = rubShort_(packagesBynNow()) + " р в цене";
  }

  function retailWithPacks_(list) {
    if (!price.packsManual) syncAutoPacks_();
    var local = retailCalcChoice_(eng(), list, price.retailDelivery);
    var packs = packagesBynNow();
    return {
      mode: local.mode,
      goods: local.goods,
      delivery: local.delivery,
      packagesByn: packs,
      note: local.note,
      total: P().retailTotalWithPacks_(local.total, packs)
    };
  }

  function keepEnrollFact_(sub) {
    if (!enroll) return;
    var prev = price.fact;
    var cur = enroll.fact;
    var same = cur === "" || cur == null || String(cur) === String(prev) || (Number(cur) === Number(prev) && String(prev) !== "");
    if (!same) return;
    enroll.fact = sub;
    var el = document.getElementById("cxEnFact");
    if (el && document.activeElement !== el) el.value = sub === "" || sub == null ? "" : String(sub);
  }

  function basketCostKey_(list) {
    return (list || []).map(function (it) {
      return [it.cat || "", it.main || it.name || "", it.sub || "", it.val != null ? it.val : it.value, it.dog || ""].join("|");
    }).join(";");
  }

  function offerFromCost_(list, cost, res) {
    var nOffer = monthN(price.deliveriesN);
    var packagesByn = packagesBynNow();
    var quote = P().quotePp({
      scheme: price.scheme,
      coef: price.coef,
      deliveriesN: nOffer,
      costSum: cost,
      list: list,
      packagesByn: packagesByn,
      dogCount: price.dogCount,
      dogNames: price.dogNames,
      fracRates: fracRates(),
      note: price.note
    });
    var retail = eng().calcRetailBasketTotal(list, { deliveriesN: nOffer });
    var apiOk = !res || price.scheme !== "RAW26" || (P().raw26ApiFactUsable_ && P().raw26ApiFactUsable_(res, nOffer));
    var fact = apiOk && res ? P().raw26ApiFactPrice_(res) : 0;
    var factPacks = res && res.packagesByn != null && res.packagesByn !== "" ? res.packagesByn : null;
    var sub = P().subscriptionOfferWithPacks_({
      fact: fact,
      factPacks: factPacks,
      packagesByn: packagesByn,
      quoteTotal: quote.total,
      retailTotal: retail.total,
      scheme: price.scheme
    });
    var message = P().offerMessage({
      scheme: price.scheme,
      mode: "pp",
      list: list,
      deliveriesN: nOffer,
      note: price.note,
      retailTotal: retail.total,
      subTotal: sub,
      dogCount: price.dogCount,
      dogNames: price.dogNames
    });
    return { sub: sub, message: message, packagesByn: packagesByn, cost: cost, fact: fact };
  }

  async function buildPpOffer(list) {
    if (!price.packsManual) syncAutoPacks_();
    var nOffer = monthN(price.deliveriesN);
    price.deliveriesN = nOffer;
    var res = await liveCalc(list, { scheme: price.scheme, coef: price.coef, deliveriesN: nOffer, forNew: 1 });
    var cost = res ? P().recalcPpCostSum(res, list) : (Number(price._cost) || 0);
    if (cost > 0) {
      price._cost = cost;
      price._costKey = basketCostKey_(list);
    }
    return offerFromCost_(list, cost, res);
  }

  var ppMsgTimer = 0;
  var ppMsgSeq = 0;

  function schedulePpMessage() {
    if (seg !== "calc") return;
    clearTimeout(ppMsgTimer);
    ppMsgTimer = setTimeout(function () { refreshLiveMessage(); }, 250);
  }

  function paintMessage(text) {
    var box = document.getElementById("cxMsg");
    if (box) {
      box.textContent = text;
      return;
    }
    var main = document.getElementById("nxMain");
    if (!main) return;
    var art = document.createElement("article");
    art.className = "b-card";
    art.id = "cxMsg";
    art.style.marginTop = "12px";
    art.style.whiteSpace = "pre-wrap";
    art.textContent = text;
    var tail = document.getElementById("cxCalcTail");
    if (tail && tail.parentNode) tail.parentNode.insertBefore(art, tail);
    else main.appendChild(art);
    if (!document.getElementById("cxMsgCopy")) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "b-btn b-btn--sec";
      btn.id = "cxMsgCopy";
      btn.setAttribute("data-act", "cl-copy");
      btn.style.marginTop = "8px";
      btn.textContent = "Копировать сообщение";
      art.insertAdjacentElement("afterend", btn);
    }
  }

  async function refreshLiveMessage() {
    if (seg !== "calc") return;
    var list = allItems();
    if (!list.length) return;
    var seq = ++ppMsgSeq;
    if (!price.packsManual) syncAutoPacks_();
    paintPackInputs_();
    if (price.mode === "retail") {
      var local = retailWithPacks_(list);
      if (seq !== ppMsgSeq || seg !== "calc" || price.mode !== "retail") return;
      price.fact = local.total;
      price.message = P().composeRetailClientMessage(list, local.total, price.note);
      paintMessage(price.message);
      return;
    }
    if (Number(price._cost) > 0 && price._costKey === basketCostKey_(list)) {
      var quick = offerFromCost_(list, Number(price._cost), null);
      if (seq === ppMsgSeq && seg === "calc" && price.mode !== "retail") {
        keepEnrollFact_(quick.sub);
        price.fact = quick.sub;
        price.message = quick.message;
        paintMessage(quick.message);
      }
    }
    var built = await buildPpOffer(list);
    if (seq !== ppMsgSeq || seg !== "calc" || price.mode === "retail") return;
    if (!(built.cost > 0) && !(built.fact > 0) && !(built.packagesByn > 0)) return;
    keepEnrollFact_(built.sub);
    price.fact = built.sub;
    price.message = built.message;
    paintMessage(built.message);
  }

  async function compose() {
    var list = allItems();
    if (!list.length) { sh().toast("Сначала набери состав"); return; }
    if (price.mode === "retail") {
      var local = retailWithPacks_(list);
      price.fact = local.total;
      price.message = P().composeRetailClientMessage(list, local.total, price.note);
      paint();
      return;
    }
    clearTimeout(ppMsgTimer);
    ppMsgSeq++;
    sh().toast("Считаю…");
    var built = await buildPpOffer(list);
    keepEnrollFact_(built.sub);
    price.fact = built.sub;
    price.message = built.message;
    paint();
  }

  function openAdd() {
    crumbDraft = null;
    var cats = [
      ["dressura", "Дрессура"],
      ["chew", "Жевалки"],
      ["veg", "Овощи"],
      ["other", "Другое"],
      ["crumb", "Присыпки"]
    ];
    var html = '<div class="b-row" style="margin-bottom:8px">';
    cats.forEach(function (c) {
      html += '<button type="button" class="b-chip" data-act="cl-cat" data-cat="' + c[0] + '">' + c[1] + "</button>";
    });
    html += "</div><div id=\"clPicker\"></div>";
    sh().openSheet({ title: "Ручной ввод", html: html });
  }

  function markAddCat(cat) {
    var nodes = document.querySelectorAll("[data-act='cl-cat']");
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-cat") === cat) nodes[i].classList.add("b-chip--on");
      else nodes[i].classList.remove("b-chip--on");
    }
  }

  function renderCrumbPicker() {
    var box = document.getElementById("clPicker");
    if (!box || !crumbDraft) return;
    var html = root.BoinyaOrders.crumbBuilderHtml(crumbDraft, {
      kind: "cl-ckind",
      src: "cl-csrc",
      add: "cl-csrc-add",
      del: "cl-csrc-del",
      gram: "cl-cgram",
      qty: "cl-cqty"
    });
    html += '<button class="b-btn b-btn--main" type="button" data-act="cl-cadd" style="margin-top:12px">В состав</button>';
    box.innerHTML = html;
  }

  function pickerCat(cat) {
    markAddCat(cat);
    if (cat === "crumb") {
      crumbDraft = { kind: "meat", sources: [], grams: [], qty: "" };
      renderCrumbPicker();
      return;
    }
    crumbDraft = null;
    var names = eng().catalogItemsForUi_(cat) || [];
    var html = names.map(function (n) {
      return '<button type="button" class="b-li" data-act="cl-sku" data-cat="' + esc(cat) + '" data-name="' + esc(n) + '"><span class="b-li__title">' + esc(eng().prettyProductName(n)) + "</span></button>";
    }).join("");
    var box = document.getElementById("clPicker");
    if (box) box.innerHTML = html || '<p class="b-note">Пусто</p>';
  }

  function addCrumbFromDraft() {
    if (!crumbDraft || !root.BoinyaOrders) return;
    var built = root.BoinyaOrders.crumbItemFromDraft(crumbDraft);
    if (!built.ok) { sh().toast(built.message); return; }
    var list = activeBasket().slice();
    list.push(built.item);
    setActiveBasket(list);
    crumbDraft = null;
    sh().closeTop("ok");
    paint();
    schedulePpMessage();
  }

  async function openCard(nick, subId, sheet) {
    sh().toast("Открываю…");
    try {
    var res = await api().apiGet({
      action: "getSubscription",
      nick: nick || "",
      subId: subId || "",
      segment: sheet,
      sheet: sheet,
      force: "1",
      _: String(Date.now())
    }, { timeoutMs: 22000, cacheTtlMs: 0 });
    if (!res || res.status !== "success" || res.found === false) { sh().toast((res && res.message) || "Не открылось"); return; }
    card = blankCard();
    Object.keys(card).forEach(function (k) {
      if (k === "status") return;
      if (res[k] != null && res[k] !== "") card[k] = res[k];
    });
    card.status = res.ppStatus || res.stage || "";
    card.sheet = (Number(res.rowIndex) > 0 && res.sheet) ? res.sheet : (sheet || res.sheet || "ПП");
    card.nick = res.nick || nick || "";
    card.label = res.label || res.nick || nick || "";
    card.subId = res.subId || subId || "";
    card.basket = eng().mapApiBasketToLocal(res.basket || []);
    card.basket2 = eng().mapApiBasketToLocal(res.basket2 || []);
    card.basketBp1 = eng().mapApiBasketToLocal(res.basketBp1 || []);
    card.basketBp2 = eng().mapApiBasketToLocal(res.basketBp2 || []);
    if (card.sheet === "БП" || String(sheet || "") === "БП") {
      if (!card.basketBp1.length && card.basket.length) card.basketBp1 = card.basket.slice();
    }
    card.scheme = P().parsePpSchemeFromWishes_(res.wishes || "") || res.ppScheme || res.scheme || (card.sheet === "ПП" ? "LEGACY" : "");
    var coef = P().parsePpCoefFromWishes_(res.wishes || "");
    card.serviceGeo = serviceGeoOf_(res.wishes || "", res.serviceGeo);
    if (coef) card.coef = String(coef);
    var parsedBp = W() ? W().parseWishes(res.wishes || "") : null;
    card.wishes = staffWishes_(res.wishes || "");
    if (parsedBp && parsedBp.bpWeeksSet) {
      card.bpWeeks = parsedBp.bpWeeks;
      card.bpWeeksSet = true;
      if (!card.bpOutcome && parsedBp.bpOutcome) card.bpOutcome = parsedBp.bpOutcome;
    }
    if (res.bpWeeksSet === true || res.bpWeeksSet === "1" || res.bpWeeksSet === 1) {
      card.bpWeeksSet = true;
      if (res.bpWeeks != null && res.bpWeeks !== "") card.bpWeeks = res.bpWeeks;
    } else if (!card.bpWeeksSet && res.bpWeeks != null && res.bpWeeks !== "") {
      card.bpWeeks = res.bpWeeks;
    }
    if (res.bpOutcome != null) card.bpOutcome = res.bpOutcome;
    if (res.extendPrice != null && res.extendPrice !== "") card.extendPrice = res.extendPrice;
    var addr = splitAddr(card.address || "");
    card.addrStreet = addr.street;
    card.addrEntrance = addr.entrance;
    card.addrFloor = addr.floor;
    card.addrFlat = addr.flat;
    card.statedCost = res.statedCost != null ? res.statedCost : (res.factCost || "");
    card.calcFactCost = res.calcFactCost || res.factCost || "";
    card.fracs = Object.assign({}, price.fracs);
    if (!card.packCounts) card.packCounts = { u1: 0, u2: 0, u3: 0, up4: 0 };
    view = "card";
    deep = false;
    sh().resetScroll();
    sh().hideToast();
    paint();
    loadPeople().then(function () { if (view === "card" && card) paint(); });
    } catch (eCard) {
      sh().toast((eCard && eCard.message) || "Не открылось");
    }
  }

  function flushClientNotes() {
    var wishesEl = document.getElementById("cxWishes");
    if (wishesEl && card) card.wishes = wishesEl.value;
    var noteEl = document.getElementById("cxNote");
    if (noteEl) price.note = noteEl.value;
    var enEl = document.getElementById("cxEnNote");
    if (enEl && enroll) enroll.note = enEl.value;
    if (enroll && !String(enroll.note || "").trim() && String(price.note || "").trim()) enroll.note = price.note;
  }

  async function saveCard() {
    flushClientNotes();
    if (!card) return;
    var wishes = staffWishes_(card.wishes || "");
    if (card.sheet === "ПП") {
      wishes = P().stampPpCoefIntoWishes_(wishes, card.coef);
      if (card.scheme === "RAW26" || P().parsePpSchemeFromWishes_(wishes)) wishes = P().stampPpSchemeIntoWishes_(wishes, card.scheme);
    }
    var ownerName = "";
    people.forEach(function (p) { if (String(p.telegramId) === String(card.ownerTelegramId)) ownerName = p.name || ""; });
    var body = {
      action: "saveSubscription",
      nick: card.nick || card.label,
      label: card.label || card.nick,
      subId: card.subId || "",
      sheet: card.sheet,
      segment: card.sheet,
      deliveries: card.deliveries || "",
      ppStatus: card.status || "",
      wishes: wishes,
      address: card.address || "",
      phone: card.phone || "",
      note: wishes,
      geo: card.serviceGeo || null,
      factCost: card.sheet === "ПП" ? (card.statedCost || "") : (card.factCost || ""),
      statedCost: card.sheet === "ПП" ? (card.statedCost || "") : "",
      calcFactCost: card.sheet === "ПП" ? (card.calcFactCost || card.statedCost || "") : "",
      statedTouched: card.statedTouched ? "1" : "0",
      basket: card.sheet === "БП" ? (card.bpTab === 2 ? card.basketBp2 : card.basketBp1) : card.basket,
      basket2: Number(card.deliveries) >= 2 ? card.basket2 : undefined,
      coef: card.sheet === "ПП" ? String(card.coef || "") : "",
      scheme: card.sheet === "ПП" ? (card.scheme || "") : "",
      dogName: card.dogName || "",
      dogBreed: card.dogBreed || "",
      dogWeight: card.dogWeight || "",
      packCounts: card.sheet === "ПП" ? card.packCounts : null
    };
    if (card.sheet === "БП") {
      body.surveyBp2Due = card.surveyBp2Due || "";
      body.surveyFinalDue = card.surveyFinalDue || "";
      body.ownerTelegramId = card.ownerTelegramId || "";
      body.ownerName = ownerName;
      body.basketBp1 = card.basketBp1;
      body.basketBp2 = card.basketBp2;
      if (card.bpWeeksSet) body.bpWeeks = String(card.bpWeeks);
      body.bpOutcome = card.bpOutcome || "";
    }
    var res = await api().apiPost(body);
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "ошибка записи"); return false; }
    sh().toast("Сохранено");
    subs.forEach(function (s) {
      var same = (card.subId && String(s.subId) === String(card.subId)) || String(s.nick || "") === String(card.nick || "");
      if (!same) return;
      s.label = card.label || s.label;
      s.nick = card.nick || s.nick;
      s.phone = card.phone || s.phone;
      s.address = card.address || s.address;
      s.status = card.status || s.status;
    });
    loadSubs(true).then(function () {
      if (view === "list") paint();
    });
    return true;
  }

  async function enrollGo() {
    flushClientNotes();
    if (!enroll) return;
    var nick = String(enroll.nick || "").replace(/^@+/, "").trim();
    if (!nick) { sh().toast("Укажи ник Instagram"); return; }
    if (price.mode === "retail") { sh().toast("Для внесения в ПП нужен режим «Подписка»"); return; }
    var items = allItems();
    if (!items.length) { sh().toast("Состав пуст"); return; }
    var ok = await sh().confirm({ title: "В лист ПП", text: "Внести " + nick + (enroll.displayName ? " (" + enroll.displayName + ")" : "") + " в лист ПП?", ok: "Внести", cancel: "Отмена" });
    if (!ok) return;
    var built = await buildPpOffer(items);
    if (built && (built.sub > 0 || built.packagesByn > 0)) price.fact = built.sub;
    var scheme = price.scheme || P().defaultPpSchemeForNewLocal_();
    var wishes = P().stampPpSchemeIntoWishes_(P().stampPpCoefIntoWishes_(staffWishes_(enroll.note || ""), price.coef), scheme);
    var fact = enroll.fact;
    if (scheme === "RAW26" && price.fact) fact = price.fact;
    var body = {
      action: "enrollDeferredToPp",
      telegramId: tid(),
      clientNick: nick,
      displayName: enroll.displayName || "",
      deliveriesN: Number(enroll.deliveriesN) || Number(price.deliveriesN) || 1,
      wishes: wishes,
      note: wishes,
      scheme: scheme,
      coef: String(price.coef),
      address: enroll.address || "",
      phone: enroll.phone || "",
      factCost: fact,
      statedTouched: "0",
      packCounts: packCountsForApi_(),
      basket: items,
      basket2: (Number(enroll.deliveriesN) >= 2 ? (price.baskets[2] || []) : undefined)
    };
    if (enroll.id) body.id = enroll.id;
    var res = await api().apiPost(body);
    if (!res || res.status !== "success") {
      sh().toast("Не внеслось в ПП: " + ((res && (res.message || res.detail)) || "ошибка"));
      return;
    }
    sh().toast(enroll.id ? "Отправлено в ПП" : "Внесено в ПП: " + nick);
    if (root.BoinyaWeek && root.BoinyaWeek.noteMonth) root.BoinyaWeek.noteMonth({ op: "touch" });
    enroll = null;
    editingId = "";
    seg = "pp";
    view = "list";
    try { await loadSubs(true); } catch (e) {}
    paint();
  }

  function applyPayload(pl) {
    pl = pl || {};
    price = blankPrice();
    price.mode = (P().priceModeKey(pl.mode) === "retail") ? "retail" : "pp";
    price.baskets[1] = (pl.baskets && (pl.baskets[1] || pl.baskets["1"])) || pl.basket || [];
    price.baskets[2] = (pl.baskets && (pl.baskets[2] || pl.baskets["2"])) || [];
    price.dogCount = pl.dogCount === 2 ? 2 : 1;
    price.activeDog = pl.activeDog === 2 ? 2 : 1;
    price.dogNames = { 1: (pl.dogNames && pl.dogNames[1]) || "", 2: (pl.dogNames && pl.dogNames[2]) || "" };
    price.deliveriesN = pl.deliveriesN || 2;
    price.coef = pl.coef || 2.6;
    price.scheme = pl.scheme || P().defaultPpSchemeForNewLocal_();
    price.note = pl.note || "";
    price.message = pl.lastMessage || "";
    if (pl.packCounts) {
      price.packs.small = pl.packCounts.small || pl.packCounts.u1 || 0;
      price.packs.medium = pl.packCounts.medium || pl.packCounts.u2 || 0;
      price.packs.large = pl.packCounts.large || pl.packCounts.u3 || 0;
      price.packs.legs = pl.packCounts.legs || pl.packCounts.up4 || 0;
      var savedPacks = (Number(price.packs.small) || 0) + (Number(price.packs.medium) || 0) + (Number(price.packs.large) || 0) + (Number(price.packs.legs) || 0);
      price.packsManual = pl.packsManual != null ? !!pl.packsManual : savedPacks > 0;
    }
    if (pl.fracRates) price.fracs = Object.assign(price.fracs, pl.fracRates);
  }

  function armEnroll(item) {
    var pl = (item && item.payload) || {};
    applyPayload(pl);
    enroll = {
      id: item && item.id || "",
      displayName: pl.displayName || pl.clientName || "",
      nick: (item && item.clientNick) || pl.clientNick || "",
      note: pl.note || "",
      address: pl.address || "",
      phone: pl.phone || "",
      deliveriesN: pl.deliveriesN || price.deliveriesN || 1,
      fact: pl.subTotal != null ? Math.round(Number(pl.subTotal) * 100) / 100 : ""
    };
    view = "list";
    seg = "calc";
  }

  function armEdit(item) {
    applyPayload((item && item.payload) || {});
    editingId = (item && item.id) || "";
    enroll = null;
    view = "list";
    seg = "calc";
  }

  async function migrateRaw() {
    if (!card || card.sheet !== "ПП") { sh().toast("Только для ПП"); return; }
    var nick = String(card.nick || card.label || "").trim();
    if (!nick && !card.subId) { sh().toast("Нет ника"); return; }
    var ok = await sh().confirm({
      title: "Новая схема",
      text: "Перевести на схему сырьё×2.6 + recover + 9×N?\n\nУказанная цена на карточке пересчитается.\nУже стоящие доставки в календаре не меняются.",
      ok: "Перевести",
      cancel: "Отмена"
    });
    if (!ok) return;
    sh().toast("Перевожу…");
    var res = null;
    try {
      res = await api().apiGet({
        action: "migratePpToRaw26Scheme",
        nick: nick || card.label || "",
        subId: card.subId || "",
        telegramId: tid(),
        applyStated: "1",
        _: String(Date.now())
      }, { timeoutMs: 28000, cacheTtlMs: 0 });
    } catch (e) { res = null; }
    if (!res || res.status !== "success") {
      sh().toast((res && res.message) || "Не удалось — нужен Deploy Code.gs");
      return;
    }
    sh().toast("Схема обновлена");
    openCard(card.nick || nick, card.subId, card.sheet);
  }

  function writeLineGrams_(it, n) {
    it.value = n;
    it.val = n;
    it.gramManual = true;
    if (it.sources && it.sources.length === 1) {
      it.sources[0].val = n;
      it.sources[0].value = n;
      if (it.ratio && it.ratio.length) it.ratio[0] = n;
    }
  }

  function applyClientGrams_(node, commit) {
    var kind = node.getAttribute("data-act");
    var i = Number(node.getAttribute("data-i"));
    var it = kind === "cl-pick-g-in"
      ? (pick.result && pick.result.items ? pick.result.items[i] : null)
      : (activeBasket() || [])[i];
    if (!it) return;
    var parsed = root.BoinyaOrders.parseGramText_(node.value);
    if (parsed.n) {
      writeLineGrams_(it, parsed.n);
      if (kind === "cl-gqty-in" && seg === "calc") schedulePpMessage();
    } else if (commit) {
      sh().toast(parsed.bad === "frac" ? "Только целые граммы" : "Нужны граммы");
      node.value = String(it.val != null ? it.val : (it.value || ""));
    }
  }

  function stepClientGrams_(act, node) {
    var i = Number(node.getAttribute("data-i"));
    var fromPick = act === "cl-pick-g";
    var list = fromPick ? (pick.result && pick.result.items) : activeBasket();
    var it = list && list[i];
    if (!it) return;
    var cur = Number(it.value != null ? it.value : it.val);
    var next = root.BoinyaOrders.gramStep_(cur, Number(node.getAttribute("data-dir")));
    if (next <= 0) {
      list.splice(i, 1);
      if (!fromPick) setActiveBasket(list.slice());
    } else writeLineGrams_(it, next);
    if (fromPick) paintPick();
    else {
      paint();
      if (seg === "calc") schedulePpMessage();
    }
  }

  function onAct(act, node) {
    if (act === "input" || act === "change") {
      if (crumbDraft && node && node.getAttribute) {
        var crumbAct = node.getAttribute("data-act");
        if (crumbAct === "cl-csrc") {
          var idx = Number(node.getAttribute("data-i"));
          var parts = String(node.value || "").split("|");
          while (crumbDraft.sources.length <= idx) crumbDraft.sources.push("");
          crumbDraft.sources[idx] = parts[1] || "";
          renderCrumbPicker();
          return true;
        }
        if (crumbAct === "cl-cgram") {
          var gi = Number(node.getAttribute("data-i"));
          if (!crumbDraft.grams) crumbDraft.grams = [];
          var mixParsed = root.BoinyaOrders.parseGramText_(node.value);
          if (mixParsed.n) crumbDraft.grams[gi] = String(mixParsed.n);
          else if (mixParsed.empty) crumbDraft.grams[gi] = "";
          else if (act === "change") {
            sh().toast(mixParsed.bad === "frac" ? "Только целые граммы" : "Нужны граммы");
            node.value = crumbDraft.grams[gi] || "";
          }
          return true;
        }
        if (crumbAct === "cl-cqty-in") {
          var qtyParsed = root.BoinyaOrders.parseGramText_(node.value);
          if (qtyParsed.n) crumbDraft.qty = qtyParsed.n;
          else if (qtyParsed.empty) {
            crumbDraft.qty = "";
            if (act === "change") sh().toast("Нужны граммы");
          } else if (act === "change") {
            sh().toast(qtyParsed.bad === "frac" ? "Только целые граммы" : "Нужны граммы");
            node.value = crumbDraft.qty == null || crumbDraft.qty === "" ? "" : String(crumbDraft.qty);
          }
          return true;
        }
      }
      if (node && node.getAttribute && (node.getAttribute("data-act") === "cl-gqty-in" || node.getAttribute("data-act") === "cl-pick-g-in")) {
        applyClientGrams_(node, act === "change");
        return true;
      }
      return readNode(node);
    }
    if (!node || String(act || "").indexOf("cl-") !== 0 && act !== "cseg") {
      if (act !== "cl-open") return false;
    }
    if (act === "cseg") return false;
    if (act === "cl-refresh") {
      ppMoney = null;
      ppMoneyState = "";
      if (seg === "pp") loadPpMoney().then(function () { if (view === "list" && seg === "pp") paint(); });
      loadSubs(true).then(paint);
      return true;
    }
    if (act === "cl-bp-add") { showBpForm = true; loadPeople().then(paint); return true; }
    if (act === "cl-bp-done") { doneBp(); return true; }
    if (act === "cl-bp-cancel") { showBpForm = false; paint(); return true; }
    if (act === "cl-bp-save") { saveBp(); return true; }
    if (act === "cl-edit-mode") { editMode = !editMode; if (!editMode) picked = {}; paint(); return true; }
    if (act === "cl-pick") {
      var key = node.getAttribute("data-key");
      picked[key] = !picked[key];
      paint();
      return true;
    }
    if (act === "cl-del-picked") { delPicked(); return true; }
    if (act === "cl-open") {
      if (editMode) return true;
      listScroll = sh().scrollTop();
      openCard(node.getAttribute("data-nick"), node.getAttribute("data-sub"), node.getAttribute("data-sheet"));
      return true;
    }
    if (act === "cl-back") {
      view = "list";
      card = null;
      deep = false;
      sh().restoreScrollTo(listScroll);
      if (!subs.length) {
        subsLoading = true;
        paint();
        loadSubs(false).then(function () { if (view === "list") { sh().restoreScrollTo(listScroll); paint(); } });
      } else paint();
      return true;
    }
    if (act === "cl-slot") { if (card) card.slot = Number(node.getAttribute("data-n")) || 1; paint(); return true; }
    if (act === "cl-bptab") { if (card) card.bpTab = Number(node.getAttribute("data-n")) === 2 ? 2 : 1; paint(); return true; }
    if (act === "cl-deep") { deep = !deep; paint(); return true; }
    if (act === "cl-coef") {
      var cv = node.getAttribute("data-v");
      price.coef = cv;
      price.scheme = cv === "2.6" ? "RAW26" : price.scheme;
      if (card) { card.coef = cv; if (cv === "2.6") card.scheme = "RAW26"; }
      paint();
      schedulePpMessage();
      return true;
    }
    if (act === "cl-migrate") { migrateRaw(); return true; }
    if (act === "cl-add" || act === "cl-manual") { openAdd(); return true; }
    if (act === "cl-cat") { pickerCat(node.getAttribute("data-cat")); return true; }
    if (act === "cl-ckind") {
      if (!crumbDraft) return true;
      crumbDraft.kind = node.getAttribute("data-kind") || "meat";
      crumbDraft.sources = [];
      crumbDraft.grams = [];
      renderCrumbPicker();
      return true;
    }
    if (act === "cl-csrc-add") {
      if (!crumbDraft) return true;
      crumbDraft.sources.push("");
      if (!crumbDraft.grams) crumbDraft.grams = [];
      crumbDraft.grams.push("");
      renderCrumbPicker();
      return true;
    }
    if (act === "cl-csrc-del") {
      if (!crumbDraft) return true;
      crumbDraft.sources.pop();
      if (crumbDraft.grams) crumbDraft.grams.pop();
      renderCrumbPicker();
      return true;
    }
    if (act === "cl-cqty-in" || act === "cl-gqty-in" || act === "cl-pick-g-in") return true;
    if (act === "cl-cqty") {
      if (!crumbDraft || !node.getAttribute("data-dir")) return true;
      var crumbDir = Number(node.getAttribute("data-dir"));
      crumbDraft.qty = root.BoinyaOrders.gramBump_(crumbDraft.qty, crumbDir);
      renderCrumbPicker();
      return true;
    }
    if (act === "cl-gqty" || act === "cl-pick-g") {
      if (!node.getAttribute("data-dir")) return true;
      stepClientGrams_(act, node);
      return true;
    }
    if (act === "cl-cadd") { addCrumbFromDraft(); return true; }
    if (act === "cl-sku") { askQty(node.getAttribute("data-cat"), node.getAttribute("data-name")); return true; }
    if (act === "cl-del-line") {
      var list = activeBasket().slice();
      list.splice(Number(node.getAttribute("data-i")), 1);
      setActiveBasket(list);
      paint();
      schedulePpMessage();
      return true;
    }
    if (act === "cl-clear") {
      setActiveBasket([]);
      if (seg === "calc" && view !== "card") {
        price.retailDelivery = "";
        price.message = "";
      }
      paint();
      return true;
    }
    if (act === "cl-save") { saveCard(); return true; }
    if (act === "cl-delete") { delCard(); return true; }
    if (act === "cl-move") { moveCard(node.getAttribute("data-to")); return true; }
    if (act === "cl-msg") { clientMessage(); return true; }
    if (act === "cl-econ") { econ(); return true; }
    if (act === "cl-recalc") { recalcCard(); return true; }
    if (act === "cl-to-pp") { toPp(); return true; }
    if (act === "cl-touch") { touchBp(); return true; }
    if (act === "cl-mode") {
      var nextMode = node.getAttribute("data-m") === "retail" ? "retail" : "pp";
      if (nextMode !== price.mode) price.retailDelivery = "";
      price.mode = nextMode;
      paint();
      schedulePpMessage();
      return true;
    }
    if (act === "cl-rdel") {
      price.retailDelivery = node.getAttribute("data-v") === "paid" ? "paid" : "free";
      var retailList = allItems();
      if (retailList.length) {
        var retailPick = retailWithPacks_(retailList);
        price.fact = retailPick.total;
        price.message = P().composeRetailClientMessage(retailList, retailPick.total, price.note);
      }
      paint();
      return true;
    }
    if (act === "cl-dogs") { price.dogCount = Number(node.getAttribute("data-n")) === 2 ? 2 : 1; if (price.dogCount < 2) price.activeDog = 1; paint(); schedulePpMessage(); return true; }
    if (act === "cl-dog") { price.activeDog = Number(node.getAttribute("data-n")) === 2 ? 2 : 1; paint(); schedulePpMessage(); return true; }
    if (act === "cl-pslot") { price.slot = Number(node.getAttribute("data-n")) || 1; paint(); schedulePpMessage(); return true; }
    if (act === "cl-repack") {
      var rec = P().recountPacks(allItems());
      price.packs = rec.counts;
      price.packsManual = false;
      sh().toast("Пакеты пересчитаны из состава");
      paint();
      schedulePpMessage();
      return true;
    }
    if (act === "cl-ig") { applyIg(); return true; }
    if (act === "cl-ig-clear") { price.ig = ""; paint(); return true; }
    if (act === "cl-compose") { compose(); return true; }
    if (act === "cl-copy") { copyMsg(price.message || pick.text); return true; }
    if (act === "cl-defer") { deferCalc(); return true; }
    if (act === "cl-order-open") { openRetailOrder(); return true; }
    if (act === "cl-enroll-open") {
      if (price.mode === "retail") { openRetailOrder(); return true; }
      enroll = enroll || { id: "", displayName: "", nick: "", note: price.note, address: "", phone: "", deliveriesN: price.deliveriesN, fact: price.fact || "" };
      paint();
      return true;
    }
    if (act === "cl-enroll-cancel") { enroll = null; paint(); return true; }
    if (act === "cl-enroll-go") { enrollGo(); return true; }
    if (act === "cl-sv-add") { showSurveyForm = true; loadPeople().then(paint); return true; }
    if (act === "cl-sv-cancel") { showSurveyForm = false; paint(); return true; }
    if (act === "cl-sv-save") { saveSurvey(); return true; }
    if (act === "cl-sv-st") { surveyStatus(Number(node.getAttribute("data-i")), node.getAttribute("data-st")); return true; }
    if (act === "cl-sv-owner") { surveyOwner(Number(node.getAttribute("data-i"))); return true; }
    if (act === "cl-sv-del") { delSurveys(); return true; }
    if (act === "cl-pick-type") { pick.type = node.getAttribute("data-t"); paint(); return true; }
    if (act === "cl-pick-clear") { pick.anketa = ""; pick.result = null; pick.text = ""; paint(); return true; }
    if (act === "cl-pick-go" || act === "cl-pick-again") { runPick(); return true; }
    if (act === "cl-pick-del") {
      if (pick.result) pick.result.items.splice(Number(node.getAttribute("data-i")), 1);
      paint();
      return true;
    }
    if (act === "cl-pick-calc") { pickIntoCalc(); return true; }
    return false;
  }

  async function saveBp() {
    var nick = (document.getElementById("cxBpNick") || {}).value || "";
    nick = String(nick).trim();
    if (!nick) { sh().toast("Укажи ник"); return; }
    var fresh = W() && W().newCardFields ? W().newCardFields() : { status: "БП1", surveyKind: "final", bpWeeks: "1" };
    var ownerId = (document.getElementById("cxBpOwner") || {}).value || "";
    if (!ownerId) { sh().toast("Выбери ответственного менеджера"); return; }
    var ownerName = "";
    people.forEach(function (p) { if (String(p.telegramId) === String(ownerId)) ownerName = p.name || ""; });
    var surveyDate = (document.getElementById("cxBpDate") || {}).value || ymdPlusDaysLocal_("", 4);
    var wishes = staffWishes_((document.getElementById("cxBpWishes") || {}).value || "");
    var address = (document.getElementById("cxBpAddress") || {}).value || "";
    var phone = (document.getElementById("cxBpPhone") || {}).value || "";
    var payload = {
      action: "ensureBpFromOrder",
      nick: nick,
      label: nick,
      createCard: "1",
      needSurvey: "1",
      status: fresh.status || "БП1",
      ppStatus: fresh.ppStatus || fresh.status || "БП1",
      stage: fresh.stage || "БП1",
      sheet: "БП",
      segment: "БП",
      surveyDate: surveyDate,
      surveyKind: fresh.surveyKind || "final",
      wishes: wishes,
      address: address,
      phone: phone,
      ownerTelegramId: ownerId,
      ownerName: ownerName,
      basket: "[]",
      bpWeeks: "1"
    };
    var res = await api().apiGet(payload, { timeoutMs: 60000, cacheTtlMs: 0 });
    if (!res || (res.status !== "success" && res.status !== "accepted")) { sh().toast("Не создалось: " + ((res && res.message) || "нет ответа")); return; }
    if (W()) {
      try { await api().apiPost(W().remindBody(nick, ownerId)); } catch (eRm) {}
    }
    subs = subs.filter(function (s) {
      return !(sheetKey_(s) === "БП" && String(s.nick || "").trim().toUpperCase() === nick.toUpperCase());
    });
    subs.unshift({
      nick: nick,
      label: nick,
      sheet: "БП",
      segment: "БП",
      status: "БП1",
      bpWeeks: 1,
      bpWeeksSet: true,
      phone: phone,
      address: address,
      wishes: wishes,
      ownerTelegramId: ownerId,
      ownerName: ownerName,
      surveyFinalDue: surveyDate
    });
    sh().toast("Клиент БП сохранён");
    showBpForm = false;
    paint();
    loadSubs(true).then(function () { if (view === "list" && seg === "bp") paint(); });
  }

  async function delPicked() {
    var keys = Object.keys(picked).filter(function (k) { return picked[k]; });
    if (!keys.length) { sh().toast("Никого не выбрано"); return; }
    var ok = await sh().confirm({ title: "Удалить", text: "Удалить выбранных (" + keys.length + ")?", ok: "Удалить", cancel: "Отмена" });
    if (!ok) return;
    var rows = filteredSubs().filter(function (s, i) { return picked[String(s.subId || s.nick || i)]; });
    var res = await api().apiGet({
      action: "deleteSubscriptionBatch",
      sheet: "БП",
      segment: "БП",
      items: JSON.stringify(rows.map(function (s) { return { nick: s.nick, subId: s.subId, label: s.label }; })),
      _: String(Date.now())
    }, { timeoutMs: 90000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не удалилось"); return; }
    sh().toast("Удалено");
    picked = {};
    editMode = false;
    await loadSubs(true);
    paint();
  }

  function fractionsWithoutCrumb_(list) {
    return (list || []).filter(function (f) {
      return !/^крошк/i.test(String(f).trim());
    });
  }

  async function askQty(cat, name) {
    var fracs = fractionsWithoutCrumb_(eng().catalogFractionsForUi_(cat, name) || []);
    var sub = "";
    if (fracs.length) {
      sub = await sh().choice({ title: name, text: "Фракция", options: fracs.map(function (f) { return { value: f, label: f }; }) });
      if (sub == null) return;
    }
    var pieceAsk = cat === "chew";
    var qty = await sh().prompt({ title: eng().prettyProductName(name), text: pieceAsk ? "Штуки" : "Граммы", value: pieceAsk ? "1" : "100", ok: "В состав" });
    if (qty == null || !String(qty).trim()) return;
    var qtyN = 0;
    if (pieceAsk) {
      qtyN = Math.round(Number(String(qty).replace(",", ".")));
      if (!(qtyN >= 1)) { sh().toast("Нужны штуки"); return; }
    } else {
      var gramAsk = root.BoinyaOrders.parseGramText_(qty);
      if (!gramAsk.n) { sh().toast(gramAsk.bad === "frac" ? "Только целые граммы" : "Нужны граммы"); return; }
      qtyN = gramAsk.n;
    }
    var list = activeBasket().slice();
    list.push({ cat: cat, main: name, name: name, sub: sub || "", val: qtyN, value: qtyN, gramManual: !pieceAsk });
    setActiveBasket(list);
    sh().closeTop("ok");
    paint();
    schedulePpMessage();
  }

  async function delCard() {
    if (!card) return;
    var ok = await sh().confirm({ title: "Удалить", text: "Удалить «" + (card.label || card.nick) + "» из " + card.sheet + "?\nСтрока в CRM будет удалена.", ok: "Удалить", cancel: "Отмена" });
    if (!ok) return;
    var res = await api().apiGet({
      action: "deleteSubscription",
      nick: card.nick || "",
      label: card.label || card.nick || "",
      subId: card.subId || "",
      sheet: card.sheet,
      segment: card.sheet,
      _: String(Date.now())
    }, { timeoutMs: 25000, cacheTtlMs: 0 });
    if (!res || (res.status !== "success" && res.status !== "deleted")) { sh().toast((res && res.message) || "Не удалилось"); return; }
    sh().toast("Удалено");
    view = "list";
    card = null;
    await loadSubs(true);
    paint();
  }

  async function moveCard(to) {
    if (!card) return;
    var ok = await sh().confirm({
      title: to === "АФК" ? "В АФК" : "В ПП",
      text: to === "АФК" ? ("Перенести «" + (card.label || card.nick) + "» в АФК?") : ("Вернуть «" + (card.label || card.nick) + "» в ПП?"),
      ok: "Перенести",
      cancel: "Отмена"
    });
    if (!ok) return;
    var res = await api().apiGet({
      action: "moveSubscription",
      nick: card.nick || "",
      label: card.label || card.nick || "",
      subId: card.subId || "",
      fromSheet: card.sheet,
      toSheet: to,
      sheet: card.sheet,
      _: String(Date.now())
    }, { timeoutMs: 45000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не перенеслось"); return; }
    sh().toast("Готово → " + to);
    card.sheet = to;
    seg = to === "АФК" ? "afk" : "pp";
    await loadSubs(true);
    paint();
  }

  async function clientMessage() {
    if (!card) return;
    var nCard = monthN((document.getElementById("cxN") || {}).value || card.deliveries);
    card.deliveries = nCard;
    var list = (card.basket || []).concat(nCard >= 2 ? (card.basket2 || []) : []);
    var retail = eng().calcRetailBasketTotal(list, { deliveriesN: nCard });
    var sub = Number(String(card.statedCost || card.calcFactCost || "").replace(",", ".")) || 0;
    var msg = P().composePpClientMessage(list, nCard, card.wishes, retail.total, sub, card.scheme || "RAW26", { statedTouched: card.statedTouched });
    sh().openSheet({
      title: "Сообщение клиенту",
      html: '<article class="b-card" style="white-space:pre-wrap">' + esc(msg) + "</article>" +
        '<button type="button" class="b-btn b-btn--main" data-act="cl-copy" style="margin-top:8px">Копировать сообщение</button>'
    });
    price.message = msg;
  }

  async function copyMsg(text) {
    if (!text) { sh().toast("Сначала собери сообщение"); return; }
    try { if (navigator.clipboard) await navigator.clipboard.writeText(text); } catch (e) {}
    sh().toast("Скопировано");
  }

  async function econ() {
    if (!card) return;
    var nCard = monthN((document.getElementById("cxN") || {}).value || card.deliveries);
    card.deliveries = nCard;
    var list = card.basket || [];
    var res = await liveCalc(list, { scheme: card.scheme, coef: card.coef, deliveriesN: nCard, forNew: 0 });
    var cost = res ? P().recalcPpCostSum(res, list) : 0;
    var pc = card.packCounts || {};
    var packagesByn = P().packagesBynFromUCountsLocal_(pc);
    var q = P().quotePp({ scheme: card.scheme || "RAW26", coef: card.coef, deliveriesN: nCard, costSum: cost, list: list, packagesByn: packagesByn, fracRates: card.fracs || fracRates() });
    card.calcFactCost = q.total;
    card.econ = q.fact;
    var f = q.fact || {};
    sh().openSheet({
      title: "Экономика",
      html: '<p class="b-note">себест ' + esc(f.rawCost) + " · recover " + esc(f.recoverByn) + " · доставка " + esc(f.deliveryByn) + " · факт " + esc(f.factCost) + (f.retailCapped ? " · cap " + esc(f.retailCapAt) : "") + (f.cleanAfterCap != null ? " · чистыми " + esc(f.cleanBeforeCap) + " → " + esc(f.cleanAfterCap) : "") + "</p>"
    });
    paint();
  }

  async function recalcCard() {
    if (view === "card") return econ();
    return compose();
  }

  async function markBpOutcome(outcome, title, text, toast) {
    if (!card) return;
    var ok = await sh().confirm({ title: title, text: text, ok: title, cancel: "Отмена" });
    if (!ok) return;
    card.bpOutcome = outcome;
    var saved = await saveCard();
    if (saved) sh().toast(toast);
  }

  async function doneBp() {
    if (!card) return;
    await markBpOutcome("done", "Завершён", "Завершить БП? Новых доставок по этой карточке не будет", "БП завершён");
  }

  async function toPp() {
    if (!card) return;
    var ok = await sh().confirm({ title: "БП → ПП", text: "Перевести «" + (card.label || card.nick) + "» с БП в ПП?\nПопадёт в статистику «стало ПП», затем откроется расчёт.", ok: "Перевести", cancel: "Отмена" });
    if (!ok) return;
    if (card.sheet === "БП") {
      card.bpOutcome = "pp";
      try {
        await api().apiPost({
          action: "saveSubscription",
          nick: card.nick || card.label,
          label: card.label || card.nick,
          subId: card.subId || "",
          sheet: "БП",
          segment: "БП",
          ppStatus: card.status || "БП1",
          wishes: card.wishes || "",
          bpOutcome: "pp",
          ownerTelegramId: card.ownerTelegramId || "",
          surveyBp2Due: card.surveyBp2Due || "",
          surveyFinalDue: card.surveyFinalDue || ""
        });
      } catch (eOut) {}
    }
    var res = await api().apiGet({
      action: "moveSubscription",
      nick: card.nick || "",
      label: card.label || card.nick || "",
      subId: card.subId || "",
      fromSheet: "БП",
      toSheet: "ПП",
      sheet: "БП",
      _: String(Date.now())
    }, { timeoutMs: 45000, cacheTtlMs: 0 });
    try {
      await api().apiGet({
        action: "recordBpToPpConversion",
        nick: card.label || card.nick,
        label: card.label || card.nick,
        subId: (res && res.subId) || card.subId || "",
        telegramId: tid(),
        _: String(Date.now())
      }, { timeoutMs: 20000, cacheTtlMs: 0 });
    } catch (e) {}
    sh().toast(res && res.status === "success" ? "В ПП · учтено в статистике БП→ПП" : "Переход записан в статистику · открой расчёт");
    price = blankPrice();
    price.baskets[1] = (card.basketBp2 && card.basketBp2.length) ? card.basketBp2.slice() : (card.basketBp1 || []).slice();
    price.note = card.wishes || "";
    enroll = { id: "", displayName: card.label || "", nick: card.nick || "", note: card.wishes || "", address: card.address || "", phone: card.phone || "", deliveriesN: card.deliveries || 2, fact: "" };
    view = "list";
    card = null;
    seg = "calc";
    if (root.__nxPriceView) root.__nxPriceView("calc");
    else if (root.__nxSetSeg) root.__nxSetSeg("clients", "calc");
    paint();
  }

  async function touchBp() {
    if (!card || !card.nick) { sh().toast("Нет ника"); return; }
    try {
      await api().apiGet({ action: "markBpTouch", nick: card.nick, sheet: "БП", _: String(Date.now()) }, { timeoutMs: 15000, cacheTtlMs: 0 });
      sh().toast("Контакт отмечен");
    } catch (e) { sh().toast("Не вышло — Deploy Code.gs"); }
  }

  function applyIg() {
    var parsed = eng().parseIgLinesToItems(price.ig || "");
    var items = parsed && (parsed.items || parsed.list || parsed);
    if (!Array.isArray(items) || !items.length) { sh().toast("Не распознал"); return; }
    var list = activeBasket().slice();
    items.forEach(function (it) { list.push(it); });
    setActiveBasket(list);
    sh().toast("В состав: " + items.length);
    paint();
    schedulePpMessage();
  }

  function openRetailOrder() {
    flushClientNotes();
    var nickEl = document.getElementById("cxEnNick");
    var nick = nickEl ? String(nickEl.value || "").trim() : "";
    if (!nick && enroll) nick = String(enroll.nick || "").replace(/^@+/, "").trim();
    var priced = retailWithPacks_(allItems());
    var paid = priced.mode === "paid";
    var payload = root.BoinyaOrderPayload;
    var orders = root.BoinyaOrders;
    if (!payload || !payload.retailOrderSnapshot || !orders || !orders.loadDeferred) return;
    var activeDog = Number(price.dogCount) >= 2 && Number(price.activeDog) === 2 ? 2 : 1;
    var priceInput = priced.total > 0 && (price.baskets[activeDog] || []).length ? String(priced.total) : "";
    var snap = payload.retailOrderSnapshot({
      client: nick,
      baskets: price.baskets,
      dogCount: price.dogCount,
      activeDog: price.activeDog,
      retailPaidDelivery: paid,
      priceInput: priceInput
    }, eng());
    orders.loadDeferred(snap, "");
    if (root.__nxOpenNew) root.__nxOpenNew();
  }

  async function deferCalc() {
    flushClientNotes();
    var list = allItems();
    if (!list.length) { sh().toast("Сначала набери состав"); return; }
    var nick = await sh().prompt({ title: "Ник клиента", text: "Можно пусто", ok: "Дальше" });
    if (nick === null) return;
    var id = editingId || ("def_" + Date.now().toString(36));
    var retail = price.mode === "retail"
      ? retailWithPacks_(list)
      : eng().calcRetailBasketTotal(list, { deliveriesN: price.deliveriesN });
    var payload = {
      mode: price.mode,
      baskets: { 1: price.baskets[1], 2: price.baskets[2] },
      dogCount: price.dogCount,
      activeDog: price.activeDog,
      dogNames: price.dogNames,
      packCounts: price.packs,
      packsManual: !!price.packsManual,
      note: price.note,
      lastMessage: price.message,
      deliveriesN: price.deliveriesN,
      coef: price.coef,
      scheme: price.scheme,
      fracRates: fracRates(),
      subTotal: price.fact || null,
      retailTotal: retail.total
    };
    var title = P().priceModeLabel_(price.mode) + (nick ? " · " + nick : "");
    var res = await api().apiPost({
      action: "saveDeferred",
      telegramId: tid(),
      id: id,
      mode: price.mode,
      title: title,
      clientNick: String(nick || "").trim(),
      payload: payload
    });
    if (!res || (res.status !== "success" && res.status !== "accepted")) { sh().toast((res && res.message) || "Не сохранилось"); return; }
    editingId = "";
    sh().toast("В задачах");
  }

  async function saveSurvey() {
    var nick = String((document.getElementById("cxSvNick") || {}).value || "").trim();
    if (!nick) { sh().toast("Укажи ник"); return; }
    var kind = "final";
    var due = String((document.getElementById("cxSvDue") || {}).value || ymdPlusDaysLocal_("", 4)).slice(0, 10);
    var ownerId = (document.getElementById("cxSvOwner") || {}).value || "";
    var ownerName = "";
    people.forEach(function (p) { if (String(p.telegramId) === String(ownerId)) ownerName = p.name || ""; });
    var res = await api().apiGet({
      action: "saveSurvey",
      nick: nick,
      kind: kind,
      dueDate: due,
      stage: "БП",
      status: "planned",
      templateId: "survey_final",
      ownerTelegramId: ownerId,
      ownerName: ownerName,
      _: String(Date.now())
    }, { timeoutMs: 45000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast("Не сохранилось: " + ((res && res.message) || "Deploy")); return; }
    sh().toast("Опросник на " + due);
    showSurveyForm = false;
    await loadSurveys();
    paint();
  }

  function surveyByIndex(i) { return surveys.filter(surveyVisible)[i]; }
  function surveyVisible() { return true; }

  async function surveyStatus(i, status) {
    var it = surveyByIndex(i);
    if (!it) return;
    var ownEl = document.getElementById("svOwn" + i);
    var ownerId = ownEl ? ownEl.value : (it.ownerTelegramId || "");
    var ownerName = it.ownerName || "";
    people.forEach(function (p) { if (String(p.telegramId) === String(ownerId)) ownerName = p.name || ownerName; });
    var res = await api().apiGet({
      action: "saveSurvey",
      id: it.id || "",
      nick: it.nick || "",
      kind: it.kind || "final",
      dueDate: String(it.dueDate || "").slice(0, 10),
      stage: it.stage || "",
      status: status,
      templateId: it.templateId || (String(it.kind || "").indexOf("final") >= 0 ? "survey_final" : "survey_bp2"),
      ownerTelegramId: ownerId,
      ownerName: ownerName,
      _: String(Date.now())
    }, { timeoutMs: 45000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast("Не вышло: " + ((res && res.message) || "Deploy")); return; }
    sh().toast(status === "sent" ? "Отправлено — напоминания выкл." : (status === "done" ? "Готово" : "Отменено"));
    await loadSurveys();
    paint();
  }

  async function surveyOwner(i) {
    var it = surveyByIndex(i);
    if (!it) return;
    var ownEl = document.getElementById("svOwn" + i);
    var ownerId = ownEl ? ownEl.value : "";
    if (!ownerId) { sh().toast("Выбери ответственного"); return; }
    var ownerName = "";
    people.forEach(function (p) { if (String(p.telegramId) === String(ownerId)) ownerName = p.name || ""; });
    var res = await api().apiGet({
      action: "saveSurvey",
      id: it.id || "",
      nick: it.nick || "",
      kind: it.kind || "final",
      dueDate: String(it.dueDate || "").slice(0, 10),
      stage: it.stage || "",
      status: it.status || "planned",
      templateId: it.templateId || "",
      ownerTelegramId: ownerId,
      ownerName: ownerName,
      _: String(Date.now())
    }, { timeoutMs: 45000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не сохранилось"); return; }
    sh().toast("Ответственный сохранён");
  }

  async function delSurveys() {
    var ids = Object.keys(picked).filter(function (k) { return picked[k]; });
    if (!ids.length) { sh().toast("Никого не выбрано"); return; }
    for (var i = 0; i < ids.length; i++) {
      await api().apiGet({ action: "deleteSurvey", id: ids[i], _: String(Date.now()) }, { timeoutMs: 20000, cacheTtlMs: 0 });
    }
    picked = {};
    editMode = false;
    sh().toast("Удалено");
    await loadSurveys();
    paint();
  }

  function revealPick() {
    var box = document.getElementById("cxPickOut");
    if (!box) return;
    try { box.scrollIntoView({ block: "start" }); }
    catch (e) { box.scrollIntoView(); }
  }

  async function runPick() {
    if (pick.busy) return;
    var areaEl = document.getElementById("cxAnketa");
    if (areaEl && typeof areaEl.value === "string") pick.anketa = areaEl.value;
    if (!String(pick.anketa || "").trim()) {
      sh().toast("Вставь текст анкеты");
      return;
    }
    pick.busy = true;
    paint();
    await new Promise(function (r) { setTimeout(r, 0); });
    try {
      var sig = P().parseAnketSignals_(pick.anketa || "");
      var target = pick.type === "retail" ? "retail" : ((pick.type === "bp" || pick.type === "bp1" || pick.type === "bp2") ? "bp" : "pp");
      var composed = P().pricePickComposeForTarget_(sig, target);
      var fit = null;
      try { fit = await P().pricePickFitBudget_({ items: composed.items, target: target, signals: sig }); } catch (eFit) { fit = null; }
      var items = (fit && fit.items) || composed.items || [];
      pick.result = { items: items, signals: sig, monthly: fit && fit.monthly };
      pick.text = P().pricePickOfferText_(sig, target, items);
    } catch (e) {
      sh().toast("Не получилось подобрать");
    }
    pick.busy = false;
    paint();
    revealPick();
  }

  function pickIntoCalc() {
    if (!pick.result) return;
    price = blankPrice();
    price.mode = pick.type === "retail" ? "retail" : "pp";
    price.baskets[1] = pick.result.items.slice();
    price.note = "";
    price.message = pick.text || "";
    seg = "calc";
    if (root.__nxPriceView) root.__nxPriceView("calc");
    else if (root.__nxSetSeg) root.__nxSetSeg("clients", "calc");
    paint();
  }

  function bind(acc) { access = acc; }
  function setSearch(q) { search = q || ""; focusNick = q || ""; }
  function currentSeg() { return seg; }

  function refreshQuiet() {
    if (view === "card" || view === "calc" || view === "pick") return;
    var a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT")) return;
    if (!document.querySelector("[data-act='cseg']") && !document.querySelector("[data-act='cl-refresh']")) return;
    var job = seg === "survey" ? loadSurveys() : loadSubs(true);
    Promise.resolve(job).then(function () {
      if (view === "list") paint();
    }).catch(function () {});
  }

  root.BoinyaClients = {
    bind: bind,
    show: show,
    onAct: onAct,
    refreshQuiet: refreshQuiet,
    segs: segs,
    armEnroll: armEnroll,
    armEdit: armEdit,
    setSearch: setSearch,
    currentSeg: currentSeg,
    ppListTotals_: ppListTotals_,
    ppMoneyFromStats_: ppMoneyFromStats_,
    retailCalcChoice_: retailCalcChoice_
  };
})(window);
