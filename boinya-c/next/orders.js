/* Заказы → Новый. Цифры и saveBooking — из order-engine.js и order-payload.js. */
(function (root) {
  "use strict";

  var FULL_FROM = 8;
  var monthMap = {};
  var MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  var MONTHS_FULL = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  var WEEK = [
    { day: "Понедельник", short: "Пн", off: false },
    { day: "Вторник", short: "Вт", off: false },
    { day: "Среда", short: "Ср", off: false },
    { day: "Четверг", short: "Чт", off: false },
    { day: "Пятница", short: "Пт", off: false },
    { day: "Суббота", short: "Сб", off: true },
    { day: "Воскресенье", short: "Вс", off: true }
  ];
  var TYPES = [
    { id: "pp", label: "ПП" },
    { id: "bp", label: "БП" },
    { id: "retail", label: "Розница" },
    { id: "partner", label: "Партнёр" }
  ];
  var CATS = [
    { id: "dressura", label: "Дрессура" },
    { id: "chew", label: "Жевалки" },
    { id: "other", label: "Другое" },
    { id: "veg", label: "Овощи/Фрукты" },
    { id: "crumb", label: "Крошки" }
  ];
  var MEM_KEY = "superboyna_client_memory_v1";
  var TG_KEY = "superboyna_tg_id";
  var DRAFT_KEY = "superboyna_order_form_draft_v1";

  var state = blank();
  var week = { items: [], error: "", loading: true, meta: null };
  var partners = [];
  var saving = false;
  var ppFact = null;
  var folds = { more: false, details: false, checklist: false };
  var picker = blankPicker();
  var suggest = [];
  var addrSuggest = [];
  var addrSeq = 0;
  var addrTimer = null;
  var priceTimer = null;
  var draftReady = false;
  var whCopy = "";

  function eng() { return root.BoinyaOrderEngine; }
  function pay() { return root.BoinyaOrderPayload; }
  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }

  function blank() {
    return {
      orderType: "pp",
      client: "",
      phone: "",
      address: "",
      entrance: "",
      floor: "",
      flat: "",
      deliveryDate: "",
      day: "",
      deliveryAfter: "",
      deliveryBefore: "",
      priceInput: "",
      retailPriceManual: false,
      retailPaidDelivery: false,
      ppPartner: "",
      partnerCouponsEnabled: false,
      couponsQty: "",
      couponPrice: "",
      baskets: { 1: [], 2: [] },
      dogCount: 1,
      activeDog: 1,
      dogNames: { 1: "", 2: "" },
      notes: [],
      deliveryMethod: null,
      postOffice: "",
      outsideMinsk: false,
      geo: null,
      ppSlotManual: null,
      deliveriesN: 0,
      needManualSlot: false,
      igPaste: "",
      isEdit: false,
      editOriginalClient: "",
      editOriginalDay: "",
      editOriginalDate: "",
      editOriginalMatchKey: "",
      survey: null,
      deferredId: "",
      bpWeeks: 1
    };
  }

  function blankPicker() {
    return { cat: "chew", q: "", name: "", sub: "", qty: 200, kind: "meat", sources: [], open: false };
  }

  function esc(s) { return sh().esc(s); }
  function money(n) { return sh().money(n); }

  function isoFromAny(raw) {
    var s = String(raw || "").trim();
    var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return "";
  }

  function pretty(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    var names = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    return names[dt.getDay()] + " " + Number(p[2]) + " " + MONTHS[Number(p[1]) - 1];
  }

  function ymdPlus(ymd, days) {
    var d;
    if (ymd && /^\d{4}-\d{2}-\d{2}/.test(ymd)) {
      var p = String(ymd).slice(0, 10).split("-");
      d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    } else d = new Date();
    d.setDate(d.getDate() + (Number(days) || 0));
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function bpStage(raw) {
    var u = String(raw || "").trim().toUpperCase();
    if (!u) return "БП1";
    if (/ФИНАЛ|FINAL|БП2_FINAL|БП2FINAL/.test(u)) return "ФИНАЛ";
    if (/БП1_SURVEY|БП1SURVEY|ОПРОС/.test(u)) return "БП2";
    if (/\bБП2\b/.test(u) || /^БП2/.test(u) || u.indexOf("БП2") >= 0) return "БП2";
    if (/ДУМА/.test(u)) return "ФИНАЛ";
    return "БП1";
  }

  function typeLabel(id) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i].label;
    return id;
  }

  function weekItem(day) {
    var items = week.items || [];
    for (var i = 0; i < items.length; i++) if (items[i] && items[i].day === day) return items[i];
    return null;
  }

  function weekSum() {
    var n = 0;
    WEEK.forEach(function (d) {
      var it = weekItem(d.day);
      var c = it ? Number(it.count) : 0;
      if (isFinite(c) && c > 0) n += c;
    });
    return n;
  }

  function contextLine() {
    var left = state.deliveryDate ? pretty(state.deliveryDate) : "Дата не выбрана";
    if (state.day === "Будущая неделя") left = "Будущая неделя";
    var n = weekSum();
    return left + (week.loading ? "" : ", " + n + " чел.");
  }

  function titleLine() {
    if (state.isEdit) return "Правка заказа";
    return "Заказы";
  }

  function loadMemory() {
    try { return JSON.parse(localStorage.getItem(MEM_KEY) || "{}") || {}; } catch (e) { return {}; }
  }

  function remember() {
    var nick = String(state.client || "").trim();
    if (!nick) return;
    var mem = loadMemory();
    var key = nick.toUpperCase();
    var prev = mem[key] || {};
    mem[key] = {
      nick: nick,
      address: state.address || prev.address || "",
      phone: state.phone || prev.phone || "",
      note: prev.note || "",
      basket: prev.basket || [],
      orderType: state.orderType,
      ppPartner: state.ppPartner || prev.ppPartner || "",
      updatedAt: Date.now()
    };
    try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch (e) {}
  }

  function persistDraft() {}

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  function restoreDraft() {
    if (draftReady || state.isEdit) { draftReady = true; return; }
    draftReady = true;
    clearDraft();
  }

  function syncProfiles() {
    api().apiGet({ action: "listClientProfiles" }, { timeoutMs: 20000, cacheTtlMs: 120000 }).then(function (res) {
      if (!res || res.status !== "success" || !res.clients) return;
      var mem = pay().mergeClientProfiles(loadMemory(), res.clients);
      try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch (e) {}
      if (String(state.client || "").trim()) scheduleSuggest();
    }).catch(function () {});
  }

  function telegramId() {
    var u = api().telegramUser() || {};
    if (u.id) return String(u.id);
    try { return String(localStorage.getItem(TG_KEY) || ""); } catch (e) { return ""; }
  }

  async function ensureTid() {
    var id = telegramId();
    if (id) return id;
    var entered = await sh().prompt({
      title: "Ваш Telegram ID",
      text: "Цифры из Telegram. Нужен, чтобы отложить заказ в задачи.",
      ok: "Запомнить"
    });
    if (entered == null) return "";
    id = String(entered).replace(/\D/g, "");
    if (!id) {
      sh().toast("Нужен Telegram ID");
      return "";
    }
    try { localStorage.setItem(TG_KEY, id); } catch (e) {}
    return id;
  }

  function syncRetail() {
    if (state.orderType !== "retail" || state.retailPriceManual) return;
    var q = pay().retailDisplayed(state, eng());
    state.priceInput = q && q.total != null ? String(q.total) : "";
  }

  function shownMoney() {
    if (state.orderType === "bp") return 0;
    var price = pay().orderPriceOf(state, eng());
    if (price == null) return 0;
    return price;
  }

  function positions() {
    var n = (state.baskets[1] || []).length;
    if (state.dogCount >= 2) n += (state.baskets[2] || []).length;
    return n;
  }

  function outside() {
    var e = eng();
    if (e.looksLikeOtherCity(state.address)) return true;
    var geo = pay().geoOf(state, e);
    if (geo && e.haversineKm(e.MINSK_CENTER, geo) > e.MINSK_RADIUS_KM) return true;
    return !!state.outsideMinsk;
  }

  function field(id, value, placeholder, extra) {
    return '<label class="b-field"><input class="b-field__input" id="' + id + '" data-k="' + id + '" value="' + esc(value || "") + '" placeholder="' + esc(placeholder || "") + '" ' + (extra || "") + "></label>";
  }

  function dayLoadCls(n, kind) {
    var L = root.BoinyaWeekLogic;
    var mark = L && L.dayLoadMark ? L.dayLoadMark(n) : "";
    if (!mark) return "";
    if (kind === "cell") return " cell--load-" + mark;
    return " nx-day-load--" + mark;
  }

  function dayMeta(dayName) {
    var it = weekItem(dayName);
    var num = it && isFinite(Number(it.count)) ? Number(it.count) : null;
    var dateIso = it ? isoFromAny(it.date) : "";
    var dom = dateIso ? Number(dateIso.slice(8, 10)) : "";
    var mon = dateIso ? MONTHS[Number(dateIso.slice(5, 7)) - 1] : "";
    return { num: num, dom: dom, mon: mon, iso: dateIso, full: num != null && num >= FULL_FROM };
  }

  function ddmmOf(iso) {
    var s = isoFromAny(iso) || "";
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return "";
    return s.slice(8, 10) + "." + s.slice(5, 7);
  }

  function weekdayFull(iso) {
    var s = isoFromAny(iso);
    if (!s) return "";
    var p = s.split("-");
    var names = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
    return names[new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay()] || "";
  }

  function posWord(n) {
    n = Math.abs(Number(n) || 0);
    var m10 = n % 10;
    var m100 = n % 100;
    if (m100 >= 11 && m100 <= 14) return "позиций";
    if (m10 === 1) return "позиция";
    if (m10 >= 2 && m10 <= 4) return "позиции";
    return "позиций";
  }

  function posLabel() {
    var n = positions();
    return "Итого " + n + " " + posWord(n);
  }

  function dayStrip() {
    var html = "";
    WEEK.forEach(function (d) {
      var m = dayMeta(d.day);
      var on = state.day === d.day ? ' aria-pressed="true"' : "";
      html += '<button type="button" class="sheet-act' + dayLoadCls(m.num) + '" data-act="day" data-day="' + esc(d.day) + '"' + on + ">" +
        "<span>" + esc(d.day) + (d.off ? " вых" : "") + "</span>" +
        '<span class="num">' + (m.num == null ? "" : esc(String(m.num))) + "</span></button>";
    });
    var fut = weekItem("Будущая неделя");
    var futN = fut && isFinite(Number(fut.count)) ? String(fut.count) : "";
    html += '<button type="button" class="sheet-act' + dayLoadCls(fut && fut.count) + '" data-act="future">Будущая неделя <span class="num">' + esc(futN) + "</span></button>";
    html += '<button type="button" class="sheet-act" data-act="cal">Другая дата</button>';
    html += '<p class="b-note">Полный день от ' + FULL_FROM + " человек</p>";
    return html;
  }

  function dayBox() {
    if (state.day === "Будущая неделя") {
      return '<p class="kicker">День</p><button type="button" class="daybox b-day b-day--on" data-act="open-days">' +
        '<span class="b-day__w">Будущая неделя</span></button>';
    }
    var m = state.day ? dayMeta(state.day) : { iso: "" };
    var iso = (state.day && m.iso) || isoFromAny(state.deliveryDate) || "";
    var label = state.day || weekdayFull(iso) || "";
    var dateBit = ddmmOf(iso);
    var left = dateBit ? '<span class="num">' + esc(dateBit) + "</span>" : '<span class="b-day__w">Выберите день</span>';
    var right = dateBit && label ? '<span class="b-day__w">' + esc(label) + "</span>" : "";
    return '<p class="kicker">День</p><button type="button" class="daybox b-day b-day--on" data-act="open-days">' +
      left + right + "</button>";
  }

  function numFullHint() {
    return (week.items || []).some(function (it) { return Number(it && it.count) >= FULL_FROM; });
  }

  function itemGroup(it) {
    var mix = root.BoinyaCrumbMix;
    if (mix && mix.isCrumb(it)) return "Крошка";
    var cat = String((it && it.cat) || "").toLowerCase();
    var name = String((it && (it.main || it.name)) || "");
    var e = eng();
    if (cat === "chew" || cat === "chews") return "Жевалки";
    if (e && e.isChewProductName_ && e.isChewProductName_(name)) return "Жевалки";
    return "Мясо";
  }

  function basketRow(it, i) {
    var unit = eng().unitForItem(it.cat, it.main);
    var mix = root.BoinyaCrumbMix;
    var crumb = mix && mix.isCrumb(it);
    var srcs = crumb ? (it.sources || []).filter(function (s) {
      if (!s || !(s.name || s.main)) return false;
      var e = eng();
      if (e && e.isChewCrumbSource_ && e.isChewCrumbSource_(s)) return false;
      return true;
    }) : [];
    var grams = it.value != null ? it.value : it.val;
    var name = eng().prettyProductName ? eng().prettyProductName(it.main || it.name) : (it.main || it.name);
    var sub = "";
    if (crumb && srcs.length >= 2) {
      name = "Крошка микс — " + grams + " г";
      sub = '<div class="mix-parts">' + srcs.map(function (s, si) {
        var q = mix.partQty(it, s, si, srcs.length);
        var label = String(eng().prettyProductName(s.name || s.main) || s.name || s.main || "").toLowerCase();
        return '<div class="mix-part">' + esc(label + (q ? " — " + q.qty + " г" : "")) + "</div>";
      }).join("") + "</div>";
    } else if (crumb && srcs.length === 1) {
      var q1 = mix.partQty(it, srcs[0], 0, 1);
      name = mix.singleLabel(srcs[0].name || srcs[0].main, q1 ? q1.qty : grams);
    } else if (crumb) {
      var parent = String(it.main || it.name || "").trim();
      if (parent && !/^крошка$/i.test(parent)) name = mix.singleLabel(parent, grams);
      else name = grams != null && grams !== "" ? ("Крошка — " + grams + " г") : "Крошка";
    } else if (it.sub) sub = esc(eng().humanFraction(it.main, it.sub));
    var price = "";
    if (state.orderType === "retail") {
      var c = eng().retailLineCost(it.main, it.sub, grams, it.cat, it);
      if (c && c.found) price = ", " + money(c.cost) + " BYN";
    }
    var subHtml = crumb && srcs.length >= 2 ? sub : ('<span class="b-sheet__sub">' + sub + esc(price) + "</span>");
    if (crumb && srcs.length >= 2 && price) subHtml += '<span class="b-sheet__sub">' + esc(price) + "</span>";
    return '<div class="nx-line"><div class="b-grow"><span class="b-sheet__name">' + esc(name) + "</span>" +
      subHtml + "</div>" +
      '<div class="b-step" role="group"><button class="b-step__btn" type="button" data-act="step" data-i="' + i + '" data-dir="-1" aria-label="Меньше">−</button>' +
      '<span class="b-step__val">' + esc(grams) + " " + esc(unit) + "</span>" +
      '<button class="b-step__btn" type="button" data-act="step" data-i="' + i + '" data-dir="1" aria-label="Больше">+</button></div></div>';
  }

  function basketLines() {
    var list = state.baskets[state.activeDog] || [];
    if (!list.length) return '<p class="b-note">Состав пуст. Добавьте позицию или вставьте чеклист.</p>';
    var buckets = { "Мясо": [], "Крошка": [], "Жевалки": [] };
    list.forEach(function (it, i) { buckets[itemGroup(it)].push({ it: it, i: i }); });
    return ["Мясо", "Крошка", "Жевалки"].map(function (title) {
      if (!buckets[title].length) return "";
      return '<div class="nx-grp">' + esc(title) + "</div>" + buckets[title].map(function (row) {
        return basketRow(row.it, row.i);
      }).join("");
    }).join("");
  }

  function typeExtras() {
    var html = "";
    if (state.orderType === "pp") {
      html += '<button type="button" class="nx-link" data-act="from-pp">Из подписки ПП</button>';
      html += '<p class="b-lbl">Слот ПП1 или ПП2</p><div class="nx-pp-toggle" role="group" aria-label="Слот ПП">' +
        segBtn("pp1", "ПП1", state.ppSlotManual === 1) +
        segBtn("pp2", "ПП2", state.ppSlotManual === 2) + "</div>";
      html += '<p class="b-lbl">Цена ПП, BYN</p>' + field("priceInput", state.priceInput, "из листа ПП", 'inputmode="decimal"');
      if (ppFact && (ppFact.factCost != null || ppFact.statedCost != null)) {
        var fact = ppFact.factCost != null ? ppFact.factCost : ppFact.statedCost;
        html += '<p class="b-note" style="margin-top:8px">по расчёту ' + esc(money(fact)) + "</p>";
      }
    }
    if (state.orderType === "bp") {
      html += '<p class="b-lbl">Кто привёл</p><label class="b-field"><select class="b-field__input" id="ppPartner" data-k="ppPartner">' +
        '<option value="">— выберите партнёра —</option>' +
        partners.map(function (p) {
          var name = p.name || p;
          return '<option value="' + esc(name) + '"' + (state.ppPartner === name ? " selected" : "") + ">" + esc(name) + "</option>";
        }).join("") +
        '<option value="Другое"' + (state.ppPartner === "Другое" ? " selected" : "") + ">Другое</option></select></label>";
    }
    if (state.orderType === "retail") {
      html += '<p class="b-lbl">Цена, BYN</p>' + field("priceInput", state.priceInput, "по прайсу", 'inputmode="decimal"');
      html += '<div class="b-row" style="margin-top:8px"><button type="button" class="nx-link" data-act="price-auto">По прайсу</button></div>';
      html += '<p class="b-lbl">Платная доставка</p><div class="b-seg">' +
        segBtn("del0", "Нет", !state.retailPaidDelivery) +
        segBtn("del1", "Да +" + money(eng().PRICE_RETAIL_DELIVERY_BYN()).replace(",00", "") , !!state.retailPaidDelivery) +
        "</div>";
    }
    if (state.orderType === "partner") {
      html += '<p class="b-lbl">Цена партнёра, BYN</p>' + field("priceInput", state.priceInput, "0", 'inputmode="decimal"');
      html += '<p class="b-lbl">Купоны</p><div class="b-seg">' +
        segBtn("cup0", "Нет", !state.partnerCouponsEnabled) +
        segBtn("cup1", "Да", !!state.partnerCouponsEnabled) + "</div>";
      if (state.partnerCouponsEnabled) {
        html += '<div class="nx-pair" style="margin-top:8px">' + field("couponsQty", state.couponsQty, "сколько", 'inputmode="numeric"') +
          field("couponPrice", state.couponPrice, "цена пачки", 'inputmode="decimal"') + "</div>";
      }
    }
    return html;
  }

  function segBtn(id, label, on) {
    return '<button type="button" class="b-seg__item' + (on ? " b-seg__item--on" : "") + '" data-act="seg" data-seg="' + id + '">' + esc(label) + "</button>";
  }

  function noteSummary() {
    var notes = (state.notes || []).filter(function (n) { return n && String(n.text || "").trim(); });
    if (!notes.length) return "Доп информация";
    return notes.map(function (n) {
      var who = [];
      if (n.roles && n.roles.cour) who.push("курьеру");
      if (n.roles && n.roles.mgr) who.push("менеджеру");
      if (n.roles && n.roles.cut) who.push("нарезчику");
      return (who.join(", ") || "без роли") + (n.permanent ? ", постоянное" : ", разовое");
    }).join(", ");
  }

  function view() {
    var html = "";
    if (week.error) html += sh().errorBox({ title: "Не удалось загрузить дни", text: week.error, act: "retry-days" });
    html += '<div class="b-seg" id="nxSegs"></div>';
    html += '<div class="tray" role="group" aria-label="Тип заказа">';
    TYPES.forEach(function (t) {
      html += '<button type="button" data-act="type" data-type="' + t.id + '" aria-pressed="' + (state.orderType === t.id ? "true" : "false") + '">' + esc(t.label) + "</button>";
    });
    html += "</div>";
    html += '<p class="kicker">Ник</p><label class="b-field">' +
      '<input class="b-field__input" id="client" data-k="client" value="' + esc(state.client) + '" placeholder="Ник" autocomplete="off"></label>';
    html += '<div id="nxSuggest"></div>';
    html += '<div id="nxExtras">' + typeExtras() + "</div>";
    if (week.loading && !(week.items || []).length) html += sh().skeleton(1);
    else html += dayBox();
    if (week.meta && week.meta.skew) {
      html += sh().errorBox({ title: "Даты недели уехали", text: week.meta.skew, act: "retry-days" });
    }
    html += '<p class="kicker">Адрес</p><div class="b-row" style="gap:8px"><div class="b-grow">' + field("address", state.address, "Улица и дом") +
      '</div><button class="b-ib" type="button" data-act="coords" aria-label="Координаты">' + sh().ico("cal", "b-ico b-ico--20") + "</button></div>";
    html += '<div id="nxAddr"></div>';
    html += '<p class="kicker">Состав</p>';
    html += '<div id="nxLines">' + basketLines() + "</div>";
    html += '<button class="b-btn b-btn--sec" type="button" data-act="add" style="margin-top:8px">+ Позиция</button>';
    html += '<button type="button" class="nx-link" data-act="fold-more">' + (folds.more ? "Скрыть доставку" : "Ещё у доставки") + "</button>";
    if (folds.more) {
      html += '<div class="b-row" style="margin-top:8px"><span class="b-grow b-note" style="margin:0">2 собаки</span><div class="b-seg" style="flex:none">' +
        segBtn("dog0", "Нет", state.dogCount < 2) + segBtn("dog1", "Да", state.dogCount >= 2) + "</div></div>";
      if (state.dogCount >= 2) {
        html += '<div class="b-seg" style="margin-top:8px">' + segBtn("ad1", "Собака 1", state.activeDog !== 2) + segBtn("ad2", "Собака 2", state.activeDog === 2) + "</div>";
        html += '<div class="nx-pair" style="margin-top:8px">' + field("dog1", state.dogNames[1], "кличка 1") + field("dog2", state.dogNames[2], "кличка 2") + "</div>";
      }
      html += '<p class="kicker">Телефон</p>' + field("phone", state.phone, "+375", 'inputmode="tel"');
      html += '<button type="button" class="nx-link" data-act="fold-details">' + (folds.details ? "Скрыть подъезд" : "Подъезд и детали") + "</button>";
      if (folds.details) {
        html += '<div class="nx-fold nx-pair">' + field("entrance", state.entrance, "подъезд") + field("floor", state.floor, "этаж") + field("flat", state.flat, "квартира") + "</div>";
      }
      html += '<p class="kicker">За Минском</p><div class="b-chips">' +
        chipMeth("euro", "Европочта") + chipMeth("bel", "Белпочта") + chipMeth("courier", "Курьер") + "</div>";
      if (state.deliveryMethod === "euro" || state.deliveryMethod === "bel") {
        html += '<div style="margin-top:8px">' + field("postOffice", state.postOffice, "Отделение почты") + "</div>";
      }
      html += '<p class="kicker">Время</p><div class="nx-pair">' +
        '<label class="b-field"><input class="b-field__input" id="deliveryAfter" data-k="deliveryAfter" type="time" value="' + esc(state.deliveryAfter) + '" aria-label="Не раньше"></label>' +
        '<label class="b-field"><input class="b-field__input" id="deliveryBefore" data-k="deliveryBefore" type="time" value="' + esc(state.deliveryBefore) + '" aria-label="Не позже"></label></div>';
      html += '<button type="button" class="nx-link" data-act="notes">' + esc(noteSummary()) + "</button>";
      html += '<button class="b-btn b-btn--sec" type="button" data-act="fold-ig">Вставить чеклист</button>';
      if (folds.checklist) {
        html += '<label class="b-field b-field--area" style="margin-top:8px"><textarea class="b-field__input" id="igPaste" data-k="igPaste" placeholder="Строки из Instagram">' + esc(state.igPaste) + "</textarea></label>";
        html += '<div class="nx-actions" style="margin-top:8px"><button class="b-btn b-btn--sec" type="button" data-act="ig-go">В корзину</button>' +
          '<button class="b-btn b-btn--sec" type="button" data-act="ig-clear">Очистить</button></div>';
      }
      if ((state.baskets[state.activeDog] || []).length) {
        html += '<button type="button" class="nx-link" data-act="clear-basket">Очистить состав</button>';
      }
    }
    if (state.isEdit && !state.deferredId) {
      html += '<button type="button" class="b-btn b-btn--sec" data-act="cancel-order" style="margin-top:16px">Отмена</button>';
    }
    return html;
  }

  function chipMeth(id, label) {
    var on = state.deliveryMethod === id ? " b-chip--on" : "";
    return '<button type="button" class="b-chip' + on + '" data-act="method" data-method="' + id + '">' + esc(label) + "</button>";
  }

  function dock() {
    var total = shownMoney();
    var label = state.orderType === "bp" ? "0,00 BYN" : money(total) + " BYN";
    return '<div class="b-dock__act"><div class="b-sum"><span class="b-sum__k">' + posLabel() + "</span>" +
      '<span class="b-sum__v" id="nxSum">' + esc(label) + "</span></div>" +
      '<div class="nx-actions"><button class="b-btn b-btn--sec" type="button" data-act="defer"' + (saving ? " disabled" : "") + ">На потом</button>" +
      '<button class="b-btn b-btn--main' + (saving ? " b-btn--loading" : "") + '" type="button" id="nxSave" data-act="save"' + (saving ? " disabled" : "") + ">" +
      (saving ? '<span class="b-spin"></span> Сохраняю…' : "Сохранить заказ") + "</button></div></div>";
  }

  function paintSegs(segs, current) {
    var box = document.getElementById("nxSegs");
    if (!box) return;
    box.innerHTML = (segs || []).map(function (s) {
      var on = s.id === current;
      return '<button type="button" class="b-seg__item' + (on ? " b-seg__item--on" : "") + '" data-act="oseg" data-seg="' + esc(s.id) + '" aria-pressed="' + (on ? "true" : "false") + '">' + esc(s.label) + "</button>";
    }).join("");
  }

  function pinOrderDock() {
    var d = document.getElementById("nxDock");
    var main = document.getElementById("nxMain");
    if (!d || d.hidden || !main) return;
    d.classList.add("nx-dock--order");
    var h = d.offsetHeight || 0;
    if (h > 0) {
      main.style.paddingBottom = h + "px";
      main.setAttribute("data-order-dock", "1");
    }
  }

  function paint() {
    restoreDraft();
    sh().main(view());
    sh().dock(dock());
    pinOrderDock();
    paintSuggest();
    paintAddr();
    if (root.__nxAfterOrderPaint) root.__nxAfterOrderPaint();
  }

  function patchLines() {
    var box = document.getElementById("nxLines");
    if (box) box.innerHTML = basketLines();
    var sum = document.getElementById("nxSum");
    if (sum) {
      var total = shownMoney();
      sum.textContent = state.orderType === "bp" ? "0,00 BYN" : money(total) + " BYN";
    }
    var k = document.querySelector(".b-sum__k");
    if (k) k.textContent = posLabel();
  }

  function paintAddr() {
    var box = document.getElementById("nxAddr");
    if (!box) return;
    if (!addrSuggest.length) { box.innerHTML = ""; return; }
    box.innerHTML = '<div class="nx-suggest">' + addrSuggest.map(function (s, i) {
      var title = s.title || s.address || "";
      return '<button type="button" data-act="pick-addr" data-i="' + i + '">' + esc(title) +
        (s.subtitle ? '<span class="b-note">, ' + esc(s.subtitle) + "</span>" : "") + "</button>";
    }).join("") + "</div>";
  }

  function scheduleAddress() {
    var q = String(state.address || "").trim();
    clearTimeout(addrTimer);
    if (q.length < 2 && !eng().parseLatLonFromText_(q)) {
      addrSuggest = [];
      paintAddr();
      return;
    }
    addrTimer = setTimeout(function () { fetchAddress(q); }, 280);
  }

  function fetchAddress(q) {
    var seq = ++addrSeq;
    var coords = eng().parseLatLonFromText_(q);
    var params = { action: "suggestAddress", text: q, _: String(Date.now()) };
    if (coords) {
      params.lat = coords.lat;
      params.lon = coords.lon;
    }
    api().apiGet(params, { timeoutMs: 12000, cacheTtlMs: 0 }).then(function (res) {
      if (seq !== addrSeq) return;
      var list = (res && res.results) || [];
      if (!list.length && coords) {
        list = [{
          title: coords.lat.toFixed(6) + ", " + coords.lon.toFixed(6),
          address: coords.lat.toFixed(6) + ", " + coords.lon.toFixed(6),
          lat: coords.lat,
          lon: coords.lon
        }];
      }
      addrSuggest = list.slice(0, 6);
      paintAddr();
    }).catch(function () {
      if (seq !== addrSeq) return;
      addrSuggest = [];
      paintAddr();
    });
  }

  function applyAddress(row) {
    if (!row) return;
    var text = row.address || row.title || "";
    state.address = text;
    if (row.lat != null && row.lon != null) {
      state.geo = {
        lat: Number(row.lat),
        lon: Number(row.lon),
        address: text,
        yandexUrl: row.yandexUrl || ("https://yandex.ru/maps/?pt=" + row.lon + "," + row.lat + "&z=17&l=map")
      };
      state.outsideMinsk = eng().haversineKm(eng().MINSK_CENTER, state.geo) > eng().MINSK_RADIUS_KM;
    }
    addrSuggest = [];
    persistDraft();
    paint();
  }

  function paintSuggest() {
    var box = document.getElementById("nxSuggest");
    if (!box) return;
    if (!suggest.length) { box.innerHTML = ""; return; }
    box.innerHTML = '<div class="nx-suggest">' + suggest.map(function (s, i) {
      return '<button type="button" data-act="pick-client" data-i="' + i + '">' + esc(s.nick) +
        (s.phone ? '<span class="b-note">, ' + esc(s.phone) + "</span>" : "") + "</button>";
    }).join("") + "</div>";
  }

  function readField(node) {
    var k = node.getAttribute("data-k");
    if (!k) return;
    if (k === "dog1") state.dogNames[1] = node.value;
    else if (k === "dog2") state.dogNames[2] = node.value;
    else if (k === "priceInput") {
      state.priceInput = node.value;
      if (state.orderType === "retail") state.retailPriceManual = true;
      patchLines();
    } else state[k] = node.value;
    if (k !== "pq" && k.indexOf("noteItem") !== 0) persistDraft();
    if (k === "client") scheduleSuggest();
    if (k === "address") scheduleAddress();
    if (k === "address" || k === "entrance" || k === "floor" || k === "flat") {
      var parsed = eng().parseDeliveryAddress(state.address);
      if (parsed && parsed.entrance && !state.entrance) state.entrance = parsed.entrance;
    }
  }

  function scheduleSuggest() {
    var q = String(state.client || "").trim();
    if (q.length < 1) { suggest = []; paintSuggest(); return; }
    var mem = loadMemory();
    var rows = Object.keys(mem).map(function (k) { return mem[k]; }).filter(function (p) {
      return p && p.nick && eng().scoreClientNick(p.nick, q) > 0;
    });
    rows.sort(function (a, b) { return eng().scoreClientNick(b.nick, q) - eng().scoreClientNick(a.nick, q); });
    suggest = rows.slice(0, 6);
    paintSuggest();
    clearTimeout(priceTimer);
    priceTimer = setTimeout(refreshPp, 400);
  }

  async function refreshPp() {
    if (state.orderType !== "pp") return;
    var nick = String(state.client || "").trim();
    if (nick.length < 2) { ppFact = null; return; }
    var res = await api().apiGet({
      action: "getPpFactCost",
      nick: nick,
      day: state.day || "",
      date: state.deliveryDate || ""
    }, { timeoutMs: 12000, cacheTtlMs: 15000 });
    if (!res || res.status !== "success") return;
    ppFact = res;
    state.deliveriesN = Number(res.deliveries) || 0;
    state.needManualSlot = !!(res.needManualSlot && state.deliveriesN >= 2);
    if (!(state.ppSlotManual === 1 || state.ppSlotManual === 2) && state.deliveriesN >= 2) {
      var suggested = Number(res.suggestedSlot || res.deliverySlot) || 1;
      if (suggested >= 1) state.ppSlotManual = suggested;
    }
    if (!state.priceInput && (res.statedCost != null || res.factCost != null)) {
      state.priceInput = String(res.statedCost != null ? res.statedCost : res.factCost);
    }
    var box = document.getElementById("nxExtras");
    if (box && !sh().sheetOpen()) box.innerHTML = typeExtras();
  }

  function orderVisible() {
    return !root.__nxOrderVisible || root.__nxOrderVisible();
  }

  async function loadDays() {
    var had = (week.items || []).length > 0;
    week.loading = !had;
    week.error = "";
    if (orderVisible() && !had) paint();
    var res = await api().apiGet({ action: "getWeekDayCounts" }, { timeoutMs: 18000, cacheTtlMs: 20000 });
    week.loading = false;
    if (!res || (res.status && res.status !== "success" && !res.items)) {
      week.error = (res && res.message) || "Нет связи с сервером. Данные от последней удачной загрузки ниже, если они были.";
      if (orderVisible()) paint();
      return;
    }
    week.items = res.items || [];
    week.meta = skewMeta(res);
    if (!state.deliveryDate) pickDefaultDay();
    if (orderVisible()) paint();
  }

  function skewMeta(res) {
    if (res && res.fromCalendar && res.sheetMonday) {
      return { skew: "Лист «Прием» стоит на " + res.sheetMonday + ". Счётчики сейчас с календаря " + (res.calendarMonday || "") + "." };
    }
    var mon = weekItem("Понедельник");
    if (!mon || !mon.date) return null;
    var iso = isoFromAny(mon.date);
    if (!iso) return null;
    var d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff >= -10 && diff <= 14) return null;
    return { skew: "На листе понедельник " + mon.date + ". Приём показывает эту дату." };
  }

  function pickDefaultDay() {
    var today = new Date();
    var iso = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    var hit = null;
    (week.items || []).forEach(function (it) {
      if (isoFromAny(it.date) === iso) hit = it;
    });
    if (!hit) {
      (week.items || []).some(function (it) {
        if (it && it.day && it.day !== "Будущая неделя" && it.date) { hit = it; return true; }
        return false;
      });
    }
    if (hit) selectDay(hit.day, true);
  }

  function selectDay(dayName, silent) {
    state.day = dayName;
    var hit = weekItem(dayName);
    var iso = hit ? isoFromAny(hit.date) : "";
    if (iso) state.deliveryDate = iso;
    if (!silent) {
      if (sh().sheetOpen()) sh().closeTop("ok");
      persistDraft();
      paint();
      sh().toast(iso ? (dayName + " " + ddmmOf(iso)) : dayName);
      refreshPp();
    }
  }

  function selectDate(iso) {
    state.deliveryDate = iso;
    var matched = "";
    (week.items || []).forEach(function (it) {
      if (isoFromAny(it.date) === iso) matched = it.day;
    });
    state.day = matched || "";
    persistDraft();
    paint();
    sh().toast(ddmmOf(iso) || iso);
  }

  async function setType(next) {
    if (next === state.orderType) return;
    if (pay().formHasData(state)) {
      var r = await sh().confirm({
        title: "Перенести данные в " + typeLabel(next) + "?",
        text: "В форме уже есть клиент, адрес и состав. Их можно перенести в заказ или начать с пустой формы.\n\nТап мимо листа — отмена. Форма не очищается.",
        ok: "Перенести",
        alt: "Начать с нуля",
        cancel: "Отмена — тип остаётся " + typeLabel(state.orderType)
      });
      if (r !== true && r !== "alt") return;
      if (r === "alt") {
        var date = state.deliveryDate;
        var day = state.day;
        state = blank();
        state.deliveryDate = date;
        state.day = day;
        clearDraft();
      }
    }
    state.orderType = next;
    if (next === "bp") state.priceInput = "0";
    if (next === "retail") syncRetail();
    ppFact = null;
    paint();
    if (next === "pp") refreshPp();
    if (next === "bp") loadPartners();
  }

  async function countForSave() {
    var day = state.day || "";
    var iso = isoFromAny(state.deliveryDate);
    if (day) {
      var it = weekItem(day);
      if (it) {
        var itIso = isoFromAny(it.date);
        if (day === "Будущая неделя" || !iso || !itIso || itIso === iso) {
          if (isFinite(Number(it.count))) return Number(it.count);
        }
      }
    }
    if (!iso) return 0;
    var key = iso.slice(0, 7);
    var res = monthMap[key];
    if (!res) {
      try {
        res = await api().apiGet({ action: "getMonthOverview", month: key }, { timeoutMs: 12000, cacheTtlMs: 20000 });
      } catch (e) { res = { days: [] }; }
      monthMap[key] = res || { days: [] };
    }
    var L = root.BoinyaWeekLogic;
    return L && L.countFromMonth ? L.countFromMonth(res, iso) : 0;
  }

  async function loadPartners() {
    var res = await api().apiGet({ action: "listPartners" }, { timeoutMs: 15000, cacheTtlMs: 60000 });
    var list = (res && (res.partners || res.items || res.list)) || [];
    partners = list.filter(function (p) { return !p || p.active !== false; });
    var box = document.getElementById("nxExtras");
    if (box && state.orderType === "bp" && !sh().sheetOpen()) box.innerHTML = typeExtras();
  }

  var calCursor = null;

  function monthDays(res, y, m) {
    var map = {};
    ((res && res.days) || []).forEach(function (d) {
      var iso = String(d.dateIso || d.date || "").slice(0, 10);
      if (iso) map[iso] = d;
    });
    return map;
  }

  function calCell(iso, d, hit) {
    var segs = (hit && hit.segments) || {};
    var n = hit && isFinite(Number(hit.count)) ? Number(hit.count) : 0;
    var dots = "";
    if (segs["ПП"]) dots += '<i class="dot dot-pp"></i>';
    if (segs["БП"]) dots += '<i class="dot dot-bp"></i>';
    if (segs["Р"]) dots += '<i class="dot dot-r"></i>';
    if (segs["ПАРТНЁР"]) dots += '<i class="dot dot-p"></i>';
    var cls = "cell";
    if (n > 0) cls += " cell--busy";
    cls += dayLoadCls(n, "cell");
    if (iso === state.deliveryDate) cls += " is-on";
    var label = d + " " + MONTHS_FULL[Number(iso.slice(5, 7)) - 1] + (n ? ", " + n + " чел." : ", никого");
    return '<button type="button" class="' + cls + '" data-act="cal-day" data-iso="' + iso + '" aria-label="' + esc(label) + '"' +
      (iso === state.deliveryDate ? ' aria-pressed="true"' : "") + ">" +
      '<span class="cell-date">' + d + "</span>" +
      (n ? '<span class="cell-count">' + n + "</span>" : "") +
      (dots ? '<span class="dots" aria-hidden="true">' + dots + "</span>" : "") + "</button>";
  }

  async function openCal() {
    var base = state.deliveryDate || new Date().toISOString().slice(0, 10);
    if (!calCursor) calCursor = { y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 };
    var y = calCursor.y;
    var m = calCursor.m;
    var key = y + "-" + String(m + 1).padStart(2, "0");
    function draw() {
    var by = monthDays(monthMap[key] || { days: [] }, y, m);
    function html() {
      var first = new Date(y, m, 1);
      var start = (first.getDay() + 6) % 7;
      var days = new Date(y, m + 1, 0).getDate();
      var cells = "";
      for (var i = 0; i < start; i++) cells += '<span class="cell cell--pad"></span>';
      var busy = 0;
      var people = 0;
      for (var d = 1; d <= days; d++) {
        var iso = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        var hit = by[iso];
        var n = hit && isFinite(Number(hit.count)) ? Number(hit.count) : 0;
        if (n > 0) { busy++; people += n; }
        cells += calCell(iso, d, hit);
      }
      return '<div class="b-row"><button class="b-btn b-btn--sec b-btn--sm" type="button" data-act="cal-shift" data-dir="-1" aria-label="Предыдущий месяц">‹</button>' +
        '<span class="b-grow" style="text-align:center;font-weight:600">' + esc(MONTHS_FULL[m] + " " + y) + "</span>" +
        '<button class="b-btn b-btn--sec b-btn--sm" type="button" data-act="cal-shift" data-dir="1" aria-label="Следующий месяц">›</button></div>' +
        '<div class="nx-cal grid" style="margin-top:12px">' + cells + "</div>" +
        '<p class="b-note" style="margin-top:12px">' + busy + " дн. с записями, всего " + people + " чел. Другая дата уходит в календарь, если день не в текущей неделе.</p>";
    }
    if (sh().sheetOpen()) sh().replaceTop({ title: "Другая дата", html: html() });
    else sh().openSheet({ title: "Другая дата", html: html(), id: "cal", onClose: function () { calCursor = null; } });
    }
    draw();
    if (monthMap[key]) return;
    api().apiGet({ action: "getMonthOverview", month: key }, { timeoutMs: 15000, cacheTtlMs: 20000 }).then(function (res) {
      monthMap[key] = res || { days: [] };
      if (calCursor && calCursor.y === y && calCursor.m === m && sh().sheetOpen()) draw();
    }).catch(function () { monthMap[key] = { days: [] }; });
  }

  function openNotes() {
    if (!state.notes.length) state.notes.push({ text: "", roles: { cour: true, mgr: false, cut: false }, permanent: false, itemKey: "" });
    function html() {
      return state.notes.map(function (n, i) {
        var r = n.roles || {};
        return '<div class="b-card" style="margin-bottom:8px;padding:12px">' +
          '<label class="b-field b-field--area"><span class="b-note">Доп информация</span><textarea class="b-field__input nx-extra-info" data-act="note-text" data-i="' + i + '">' + esc(n.text || "") + "</textarea></label>" +
          '<div class="b-chips" style="margin-top:8px">' +
          roleChip(i, "cour", "Курьеру", r.cour) + roleChip(i, "mgr", "Менеджеру", r.mgr) + roleChip(i, "cut", "Нарезчику", r.cut) +
          "</div><div class=\"b-seg\" style=\"margin-top:8px\">" +
          '<button type="button" class="b-seg__item' + (!n.permanent ? " b-seg__item--on" : "") + '" data-act="note-perm" data-i="' + i + '" data-p="0">Разовое</button>' +
          '<button type="button" class="b-seg__item' + (n.permanent ? " b-seg__item--on" : "") + '" data-act="note-perm" data-i="' + i + '" data-p="1">Постоянное</button></div>' +
          (r.cut ? '<div style="margin-top:8px">' + field("noteItem" + i, n.itemKey || "", "позиция для нарезчика") + "</div>" : "") +
          '<button type="button" class="nx-link" data-act="note-del" data-i="' + i + '" style="margin-top:8px">Убрать</button></div>';
      }).join("") + '<button class="b-btn b-btn--sec" type="button" data-act="note-add">Добавить ещё</button>' +
        '<button class="b-btn b-btn--main" type="button" data-act="note-done" style="margin-top:8px">Готово</button>';
    }
    picker._notes = html;
    sh().openSheet({ title: "Доп информация", html: html(), id: "notes" });
  }

  function roleChip(i, role, label, on) {
    return '<button type="button" class="b-chip' + (on ? " b-chip--on" : "") + '" data-act="note-role" data-i="' + i + '" data-role="' + role + '">' + esc(label) + "</button>";
  }

  async function ensurePriceExtras_() {
    var ex = root.BoinyaPriceExtras;
    if (!ex) return;
    if (!ex.ready_()) {
      try {
        var res = await api().apiGet({ action: "listPricePositions", _: String(Date.now()) }, { timeoutMs: 12000, cacheTtlMs: 0 });
        ex.remember_((res && res.status === "success" && res.positions) || []);
      } catch (eX) { ex.remember_([]); }
    }
    var price = null;
    try { price = await api().apiGet({ action: "getRetailPriceList" }, { timeoutMs: 12000, cacheTtlMs: 60000 }); } catch (eP) { price = null; }
    if (price && price.status === "success" && price.items && eng() && eng().applyRetailPriceMapToUi_) {
      eng().applyRetailPriceMapToUi_(ex.mergeRetailItems_(price.items, ex.list_()), price.delivery || null);
    }
    ex.installCatalog_(eng());
  }

  function extraUnit_(cat, name) {
    var ex = root.BoinyaPriceExtras;
    if (!ex) return "";
    return ex.unitFor_(cat, name) || "";
  }

  /** Граммы: шаг 5, минимум на строке 0 (строка снимается). Штуки сюда не попадают. */
  function gramStep_(qty, dir) {
    qty = Number(qty);
    if (!isFinite(qty)) qty = 0;
    dir = Number(dir) < 0 ? -1 : 1;
    if (dir > 0) return Math.ceil((qty + 1e-6) / 5) * 5;
    var down = Math.floor((qty - 1e-6) / 5) * 5;
    return down < 0 ? 0 : down;
  }

  function pieceQty_(cat, name, unit) {
    if (cat === "chew" || cat === "chews") return true;
    return unit === "шт";
  }

  async function openAdd() {
    await ensurePriceExtras_();
    eng().applyState(state);
    picker.open = true;
    sh().openSheet({
      title: "Добавить позицию",
      html: addHtml(),
      foot: addFoot(),
      id: "add",
      onClose: function () { picker.open = false; }
    });
  }

  function fractionsWithoutCrumb_(list) {
    return (list || []).filter(function (f) {
      return !/^крошк/i.test(String(f).trim());
    });
  }

  function addFoot() {
    var e = eng();
    var btn = "В состав";
    if (picker.cat !== "crumb" && picker.name && state.orderType === "retail") {
      var cost = e.retailLineCost(picker.name, picker.sub, picker.qty, picker.cat, { main: picker.name });
      if (cost && cost.found) btn += ", " + money(cost.cost) + " BYN";
    }
    return '<button class="b-btn b-btn--main" type="button" data-act="padd">' + esc(btn) + "</button>";
  }

  function foldQuery_(s) {
    return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  }

  function rankCatalogName(query, name) {
    var q = foldQuery_(query);
    if (!q) return 0;
    var n = foldQuery_(name);
    if (!n) return -1;
    if (n.indexOf(q) === 0) return 0;
    var parts = n.split(/[\s\-–—\/]+/);
    var i;
    for (i = 0; i < parts.length; i++) {
      if (parts[i] && parts[i].indexOf(q) === 0) return 1;
    }
    return -1;
  }

  function bestNameRank_(query, raw, pretty) {
    var a = rankCatalogName(query, pretty);
    var b = rankCatalogName(query, raw);
    if (a < 0) return b;
    if (b < 0) return a;
    return a < b ? a : b;
  }

  function catalogSearchRows(engine, query) {
    engine = engine || eng();
    if (!engine || !foldQuery_(query)) return [];
    var cats = ["dressura", "chew", "other", "veg"];
    var hits = [];
    cats.forEach(function (cat) {
      (engine.catalogItemsForUi_(cat) || []).forEach(function (name) {
        var pretty = engine.prettyProductName(name);
        var rank = bestNameRank_(query, name, pretty);
        if (rank < 0) return;
        hits.push({ cat: cat, name: name, pretty: pretty, rank: rank });
      });
    });
    hits.sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      var ap = foldQuery_(a.pretty);
      var bp = foldQuery_(b.pretty);
      if (ap < bp) return -1;
      if (ap > bp) return 1;
      return 0;
    });
    var rows = [];
    hits.forEach(function (hit) {
      var fr = fractionsWithoutCrumb_(engine.catalogFractionsForUi_(hit.cat, hit.name));
      if (!fr.length) {
        rows.push({ cat: hit.cat, name: hit.name, pretty: hit.pretty, frac: "", label: hit.pretty, rank: hit.rank });
        return;
      }
      fr.forEach(function (f) {
        var human = engine.humanFraction(hit.name, f) || String(f).toLowerCase();
        rows.push({
          cat: hit.cat,
          name: hit.name,
          pretty: hit.pretty,
          frac: f,
          label: hit.pretty + " " + human,
          rank: hit.rank
        });
      });
    });
    return rows;
  }

  function qtyHtml(e) {
    var unit = extraUnit_(picker.cat, picker.name) || e.unitForItem(picker.cat, picker.name);
    return '<p class="b-lbl">Количество</p><div class="b-step"><button class="b-step__btn" type="button" data-act="pqty" data-dir="-1">−</button>' +
      '<span class="b-step__val">' + esc(picker.qty) + " " + esc(unit) + "</span>" +
      '<button class="b-step__btn" type="button" data-act="pqty" data-dir="1">+</button></div>';
  }

  function browseListHtml(e) {
    var items = e.catalogItemsForUi_(picker.cat) || [];
    var body = items.map(function (name) {
      var on = picker.name === name ? " b-chip--on" : "";
      return '<button type="button" class="b-li' + on + '" data-act="pname" data-name="' + esc(name) + '"><span class="b-grow">' + esc(e.prettyProductName(name)) +
        '</span><span class="b-note">' + esc(extraUnit_(picker.cat, name) || e.unitForItem(picker.cat, name)) + "</span></button>";
    }).join("");
    if (picker.name) {
      var fr = fractionsWithoutCrumb_(e.catalogFractionsForUi_(picker.cat, picker.name));
      if (fr.length) {
        body += '<p class="b-lbl">' + esc(e.prettyProductName(picker.name)) + " фракция</p><div class=\"b-chips\">" +
          fr.map(function (f) {
            return '<button type="button" class="b-chip' + (picker.sub === f ? " b-chip--on" : "") + '" data-act="pfrac" data-frac="' + esc(f) + '">' + esc(e.humanFraction(picker.name, f)) + "</button>";
          }).join("") + "</div>";
      }
      body += qtyHtml(e);
    }
    return body;
  }

  function searchListHtml(e) {
    var rows = catalogSearchRows(e, picker.q);
    var html = rows.map(function (row) {
      var on = picker.cat === row.cat && picker.name === row.name && (picker.sub || "") === (row.frac || "");
      return '<button type="button" class="b-li' + (on ? " b-chip--on" : "") + '" data-act="phit" data-cat="' + esc(row.cat) + '" data-name="' + esc(row.name) + '" data-frac="' + esc(row.frac) + '"' + (on ? ' aria-pressed="true"' : "") + '><span class="b-grow">' + esc(row.label) + "</span></button>";
    }).join("");
    if (!html) html = '<p class="b-note">Ничего не найдено</p>';
    if (picker.name && rows.some(function (row) {
      return row.cat === picker.cat && row.name === picker.name && (row.frac || "") === (picker.sub || "");
    })) html += qtyHtml(e);
    return html;
  }

  function pickListHtml() {
    var e = eng();
    if (foldQuery_(picker.q)) return searchListHtml(e);
    return browseListHtml(e);
  }

  function patchPickList(keepScroll) {
    var list = document.getElementById("nxPickList");
    if (!list) return false;
    var body = list.closest(".nx-sheet__body");
    var top = body ? body.scrollTop : 0;
    list.innerHTML = pickListHtml();
    if (body) body.scrollTop = keepScroll ? top : 0;
    return true;
  }

  function patchPick() {
    if (!patchPickList(true)) { rebuildAdd(null); return; }
    var foot = document.querySelector(".nx-sheet__foot");
    if (foot) foot.innerHTML = addFoot();
  }

  function addHtml() {
    var chips = CATS.map(function (c) {
      return '<button type="button" class="b-chip' + (picker.cat === c.id ? " b-chip--on" : "") + '" data-act="pcat" data-cat="' + c.id + '">' + esc(c.label) + "</button>";
    }).join("");
    var body = picker.cat === "crumb" ? crumbHtml() : pickListHtml();
    return '<label class="b-field">' + sh().ico("search", "b-ico b-ico--20") +
      '<input class="b-field__input" id="pq" data-k="pq" value="' + esc(picker.q) + '" placeholder="Найти позицию" autocomplete="off"></label>' +
      '<div class="b-chips" style="margin-top:12px">' + chips + "</div>" +
      '<div class="b-list" id="nxPickList" style="margin-top:12px">' + body + "</div>";
  }

  function crumbActNames_(acts) {
    acts = acts || {};
    return {
      kind: acts.kind || "ckind",
      src: acts.src || "csrc",
      add: acts.add || "csrc-add",
      del: acts.del || "csrc-del",
      gram: acts.gram || "cgram",
      qty: acts.qty || "pqty"
    };
  }

  function crumbBuilderHtml(draft, acts) {
    var e = eng();
    var a = crumbActNames_(acts);
    draft = draft || {};
    if (!draft.sources) draft.sources = [];
    if (!draft.grams) draft.grams = [];
    if (!draft.kind) draft.kind = "meat";
    var kinds = [["meat", "мясные"], ["veg", "овощи"], ["hypo", "гипоаллергенные"]];
    var html = '<div class="b-chips">' + kinds.map(function (k) {
      return '<button type="button" class="b-chip' + (draft.kind === k[0] ? " b-chip--on" : "") + '" data-act="' + a.kind + '" data-kind="' + k[0] + '">' + esc(k[1]) + "</button>";
    }).join("") + "</div>";
    var pool = e.crumbSourcePool_(draft.kind);
    html += '<p class="b-lbl">Источники</p>';
    (draft.sources.length ? draft.sources : [""]).forEach(function (src, i) {
      html += '<label class="b-field" style="margin-top:8px"><select class="b-field__input" data-act="' + a.src + '" data-i="' + i + '"><option value="">— позиция —</option>' +
        pool.map(function (p) {
          return '<option value="' + esc(p.cat + "|" + p.name) + '"' + (src === p.name ? " selected" : "") + ">" + esc(e.prettyProductName(p.name)) + "</option>";
        }).join("") + "</select></label>";
    });
    html += '<div class="nx-actions" style="margin-top:8px"><button class="b-btn b-btn--sec b-btn--sm" type="button" data-act="' + a.add + '">+ ещё позицию</button>' +
      (draft.sources.length > 1 ? '<button class="b-btn b-btn--sec b-btn--sm" type="button" data-act="' + a.del + '">Убрать</button>' : "") + "</div>";
    var named = draft.sources.filter(Boolean);
    if (named.length >= 2) {
      html += '<p class="b-lbl">Граммы по источникам</p>';
      draft.sources.forEach(function (src, i) {
        if (!src) return;
        html += '<label class="b-field" style="margin-top:8px"><span class="b-note">' + esc(e.prettyProductName(src)) + ", г</span>" +
          '<input class="b-field__input" data-act="' + a.gram + '" data-i="' + i + '" inputmode="numeric" value="' + esc(draft.grams[i] || "") + '"></label>';
      });
    } else {
      html += '<p class="b-lbl">Граммы</p><div class="b-step"><button class="b-step__btn" type="button" data-act="' + a.qty + '" data-dir="-1">−</button>' +
        '<span class="b-step__val">' + esc(draft.qty) + " г</span>" +
        '<button class="b-step__btn" type="button" data-act="' + a.qty + '" data-dir="1">+</button></div>';
    }
    return html;
  }

  function crumbHtml() {
    return crumbBuilderHtml(picker);
  }

  function crumbItemFromDraft(draft) {
    var e = eng();
    draft = draft || {};
    var sources = [];
    var ratio = [];
    var sumG = 0;
    var droppedChew = false;
    var multi = (draft.sources || []).filter(Boolean).length >= 2;
    (draft.sources || []).forEach(function (name, i) {
      if (!name) return;
      var pool = e.crumbSourcePool_(draft.kind);
      var hit = null;
      pool.forEach(function (p) { if (p.name === name) hit = p; });
      var src = { cat: hit ? hit.cat : "", name: name, main: name, sub: "" };
      if ((e.isChewCrumbSource_ && e.isChewCrumbSource_(src)) || (e.isChewProductName_ && e.isChewProductName_(name))) {
        droppedChew = true;
        return;
      }
      var g = multi
        ? (Number(String((draft.grams && draft.grams[i]) || "").replace(",", ".")) || 0)
        : (Number(draft.qty) || 100);
      src.val = g;
      src.value = g;
      sources.push(src);
      ratio.push(g);
      sumG += g;
    });
    if (!sources.length) {
      return { ok: false, message: droppedChew ? "Жевалки в крошку не входят" : "Выберите источник крошки" };
    }
    if (multi && ratio.some(function (n) { return !(n > 0); })) {
      return { ok: false, message: "Укажите граммы каждого источника" };
    }
    return {
      ok: true,
      item: {
        cat: "crumb",
        main: "КРОШКА",
        crumbKind: draft.kind,
        sources: sources,
        ratio: ratio,
        value: sumG || draft.qty || 100,
        sub: ""
      }
    };
  }

  function pushItem(row) {
    var list = state.baskets[state.activeDog] || (state.baskets[state.activeDog] = []);
    list.push(row);
    syncRetail();
    persistDraft();
    paint();
  }

  function addFromPicker() {
    var e = eng();
    if (picker.cat === "crumb") {
      var built = crumbItemFromDraft(picker);
      if (!built.ok) { sh().toast(built.message); return; }
      pushItem(built.item);
      sh().closeTop("ok");
      return;
    }
    if (!picker.name) { sh().toast("Выберите позицию"); return; }
    if (e.catalogFracRequired_(picker.cat, picker.name) && !picker.sub) {
      sh().toast("Выберите фракцию");
      return;
    }
    var row = { cat: picker.cat, main: picker.name, name: picker.name, sub: picker.sub || "", value: picker.qty || 1 };
    var xu = extraUnit_(picker.cat, picker.name);
    if (xu) row.unit = xu;
    pushItem(row);
    sh().closeTop("ok");
  }

  async function fromPp() {
    if (state.orderType !== "pp") { sh().toast("Сначала тип заказа: ПП"); return; }
    if (String(state.client || "").trim().length < 2) { sh().toast("Укажи ник клиента ПП"); return; }
    if (state.deliveriesN >= 2 && !(state.ppSlotManual === 1 || state.ppSlotManual === 2)) {
      sh().toast("Сначала выбери ПП 1 или ПП 2");
      return;
    }
    eng().applyState(state);
    var slot = eng().currentPpSlotPayload_();
    var req = { action: "getPpOrderSuggest", nick: state.client, day: state.day || "", date: state.deliveryDate || "" };
    if (slot.deliverySlot) { req.deliverySlot = slot.deliverySlot; req.ppSlot = slot.ppSlot; }
    var res = await api().apiGet(req, { timeoutMs: 20000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast("Не удалось прочитать лист ПП"); return; }
    state.deliveriesN = Number(res.deliveriesN) || state.deliveriesN;
    if (res.needManualSlot && !(state.ppSlotManual >= 1)) { sh().toast("Выбери ПП 1 или ПП 2"); paint(); return; }
    if (res.address && !state.address) {
      var parsed = eng().parseDeliveryAddress(res.address);
      state.address = parsed.street || res.address;
      if (parsed.entrance) state.entrance = parsed.entrance;
      if (parsed.floor) state.floor = parsed.floor;
      if (parsed.flat) state.flat = parsed.flat;
    }
    if (res.phone && !state.phone) state.phone = res.phone;
    var proposed = eng().mapApiBasketToLocal(res.proposedBasket || []);
    if (!proposed.length) proposed = eng().mapApiBasketToLocal(res.monthlyBasket || res.remainingBasket || []);
    if (!proposed.length) { sh().toast("В листе ПП пустой состав"); return; }
    var ok = await sh().confirm({ title: "Состав из ПП", text: (res.hint || "Состав с листа ПП") + "\nВставить " + proposed.length + " поз.?", ok: "Вставить" });
    if (!ok) return;
    state.baskets[state.activeDog] = proposed;
    if (res.deliverySlot >= 1) state.ppSlotManual = Number(res.deliverySlot);
    syncRetail();
    paint();
    sh().toast(res.hint || ("Состав ПП, " + proposed.length + " поз."));
  }

  async function applyChecklist() {
    var mix = root.BoinyaCrumbMix;
    var crumb = mix ? mix.parseText(state.igPaste || "") : { items: [], rest: state.igPaste || "" };
    var parsed = eng().parseIgLinesToItems(crumb.rest || "");
    var items = (crumb.items || []).concat((parsed && parsed.items) || []);
    if (!items.length) { sh().toast("В чеклисте нет позиций"); return; }
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var fracs = fractionsWithoutCrumb_(it.fractions);
      if (it.needFrac && fracs.length) {
        var picked = await sh().choice({
          title: it.main,
          text: "Какая фракция?",
          options: fracs.map(function (f) { return { label: eng().humanFraction(it.main, f), value: f }; })
        });
        if (!picked) return;
        it.sub = picked;
      }
      if (it.needPiece || !(Number(it.value) > 0)) {
        var raw = await sh().prompt({ title: it.main, text: "Сколько?" + (it.pieceHint ? " Было: " + it.pieceHint : ""), value: "1" });
        if (raw == null) return;
        it.value = Number(String(raw).replace(",", ".")) || 1;
      }
      pushQuiet(it);
    }
    syncRetail();
    state.igPaste = "";
    folds.checklist = false;
    paint();
    sh().toast("В составе " + items.length + " поз.");
  }

  function pushQuiet(it) {
    state.baskets[state.activeDog].push({
      cat: it.cat, main: it.main, name: it.name || it.main, sub: it.sub || "", value: it.value, crumbKind: it.crumbKind, sources: it.sources, ratio: it.ratio
    });
  }

  async function resolveBp() {
    var clientName = String(state.client || "").trim();
    var res = null;
    try {
      sh().toast("Ищу в БП…");
      res = await api().apiGet({
        action: "getSubscription",
        nick: clientName,
        segment: "БП",
        sheet: "БП",
        _: String(Date.now())
      }, { timeoutMs: 22000, cacheTtlMs: 0 });
    } catch (e) {}
    var existing = res && res.status === "success" && (res.nick || res.label || res.rowIndex) ? res : null;
    async function ensureOwner(seed) {
      if (seed && seed.telegramId) return seed;
      var peopleRes = await api().apiGet({ action: "listReminderPeople", telegramId: telegramId() }, { timeoutMs: 12000, cacheTtlMs: 30000 });
      var people = (peopleRes && peopleRes.people) || [];
      var opts = [{ label: "Себе", value: "self" }].concat(people.map(function (p) {
        return { label: p.name || p.telegramId, value: String(p.telegramId || "") };
      }));
      var pick = await sh().choice({ title: "Ответственный", text: "Кто ведёт опросник?", options: opts });
      if (!pick) return null;
      if (pick === "self") return { telegramId: telegramId(), name: "" };
      var name = "";
      people.forEach(function (p) { if (String(p.telegramId) === pick) name = p.name || ""; });
      if (!pick) return null;
      return { telegramId: pick, name: name };
    }
    var due = ymdPlus(state.deliveryDate || "", 4);
    var fresh = root.BoinyaBpWeeks && root.BoinyaBpWeeks.newCardFields ? root.BoinyaBpWeeks.newCardFields() : {
      status: "БП1", stage: "БП1", surveyKind: "final", bpWeeks: "1"
    };
    if (!existing) {
      var createBp = await sh().confirm({
        title: "Карточка БП",
        text: "«" + clientName + "» ещё нет в БП\nСоздать карточку БП?\nОпросник — через 4 дня после получения",
        ok: "Создать"
      });
      if (!createBp) return null;
      var ownNew = await ensureOwner(null);
      if (!ownNew || !ownNew.telegramId) { sh().toast("Нужен ответственный менеджер"); return false; }
      return {
        createCard: true,
        needSurvey: true,
        status: fresh.status || "БП1",
        stage: fresh.stage || "БП1",
        surveyDate: due,
        surveyKind: fresh.surveyKind || "final",
        ownerTelegramId: ownNew.telegramId,
        ownerName: ownNew.name,
        subId: "",
        advance: "new",
        bpWeeks: "1"
      };
    }
    var storedOut = root.BoinyaBpWeeks ? root.BoinyaBpWeeks.outcomeOf(existing.bpOutcome) : "";
    if (storedOut === "done") { sh().toast("БП уже завершён"); return null; }
    if (storedOut === "pp") { sh().toast("Клиент уже переведён в ПП"); return null; }
    var keepStatus = existing.ppStatus || existing.status || existing.stage || "БП1";
    var seed = { telegramId: existing.ownerTelegramId || "", name: existing.ownerName || "" };
    var stay = await sh().confirm({
      title: "Карточка БП",
      text: "«" + clientName + "» уже в БП\nОбновить состав и опросник на " + due + "?",
      ok: "Обновить"
    });
    if (!stay) return null;
    var ownStay = await ensureOwner(seed);
    if (!ownStay || !ownStay.telegramId) return false;
    var refresh = {
      createCard: true,
      needSurvey: true,
      status: keepStatus,
      stage: keepStatus,
      surveyDate: due,
      surveyKind: "final",
      ownerTelegramId: ownStay.telegramId,
      ownerName: ownStay.name,
      subId: existing.subId || "",
      advance: "refresh"
    };
    if (existing.bpWeeksSet) refresh.bpWeeks = existing.bpWeeks;
    return refresh;
  }

  function saveMessage(res) {
    if (res && res.sheetsVerified) return { ok: true, exact: true, text: "Точно сохранено" };
    if (res && (res.status === "accepted" || res.accepted || res.pendingSheets || res.writeId)) {
      return { ok: true, exact: false, text: "Вношу… таблица допишет" };
    }
    if (res && res.status === "success" && res.sheetsVerified !== false && !res.timedOut && !res.networkFallback && !root.__BOINYA_C_CUTOVER__) {
      return { ok: true, exact: false, text: "Сохранено" };
    }
    if (res && res.status === "success") return { ok: true, exact: false, text: "Вношу… проверка таблицы ещё идёт" };
    var why = (res && (res.message || res.status)) || "нет ответа";
    return { ok: false, exact: false, text: "Не сохранилось: " + why };
  }

  async function cancelDelivery() {
    if (!state.isEdit || state.deferredId) return;
    var name = String(state.editOriginalClient || state.client || "").trim();
    var when = state.editOriginalDate || state.deliveryDate || "";
    if (!name) { sh().toast("Нет клиента"); return; }
    var ok = await sh().confirm({
      title: "Отмена",
      text: "Отменить доставку «" + name + "»" + (when ? (" на " + when) : "") + "?",
      ok: "Отменить",
      cancel: "Назад",
      danger: true
    });
    if (!ok) return;
    var logic = root.BoinyaWeekLogic;
    if (!logic || !logic.deleteParams) { sh().toast("Нечем отменить"); return; }
    var params = logic.deleteParams({
      client: name,
      matchKey: state.editOriginalMatchKey || "",
      day: state.editOriginalDay || state.day || "",
      date: when,
      calendarOnly: !state.editOriginalDay && !!when
    });
    var res = null;
    try {
      res = await api().apiGet(params, { timeoutMs: 30000, cacheTtlMs: 0 });
    } catch (e) {
      sh().toast("Не отменилось");
      return;
    }
    if (!logic.writeAccepted(res)) {
      sh().toast((res && (res.message || res.status)) || "Не отменилось");
      return;
    }
    clearDraft();
    var goneDate = when;
    var goneName = name;
    var goneKey = state.editOriginalMatchKey || "";
    state = blank();
    sh().toast(res && res.sheetsVerified ? "Точно отменено" : "Отменяю…");
    if (root.BoinyaWeek && root.BoinyaWeek.noteMonth) {
      root.BoinyaWeek.noteMonth({ op: "remove", date: goneDate, client: { name: goneName, matchKey: goneKey } });
    }
    if (root.__nxOpenWeek) root.__nxOpenWeek();
  }

  function flushOrderNotes() {
    var areas = document.querySelectorAll("textarea[data-act='note-text']");
    for (var i = 0; i < areas.length; i++) {
      var idx = Number(areas[i].getAttribute("data-i"));
      if (state.notes[idx]) state.notes[idx].text = areas[i].value;
    }
  }

  async function save() {
    if (saving) return;
    var clientName = String(state.client || "").trim();
    var street = eng().formatStreetHouse(state.address) || String(state.address || "").trim();
    state.address = street;
    if (!state.geo) {
      var manual = eng().parseLatLonFromText_(street);
      if (manual) state.geo = { lat: manual.lat, lon: manual.lon, yandexUrl: "https://yandex.ru/maps/?pt=" + manual.lon + "," + manual.lat + "&z=17&l=map" };
    }
    if (state.deliveryAfter && state.deliveryBefore && state.deliveryAfter >= state.deliveryBefore) {
      await sh().alert({ text: "«Не раньше» должно быть меньше «Не позже»" });
      return;
    }
    if (!clientName) { await sh().alert({ text: "Введите имя клиента" }); return; }
    if (!state.deliveryDate) { await sh().alert({ text: "Укажите дату доставки" }); return; }
    eng().applyState(state);
    if (!eng().buildOrderSaveBasket_().length) { await sh().alert({ text: "Корзина пуста" }); return; }
    if (state.orderType === "partner") {
      var price = pay().orderPriceOf(state, eng());
      if (!(price >= 0)) { await sh().alert({ text: "Укажите цену партнёра (BYN)" }); return; }
      if (state.partnerCouponsEnabled) {
        if (!(Number(state.couponsQty) > 0)) { await sh().alert({ text: "Укажите количество купонов (или выберите «Нет»)" }); return; }
        if (!(Number(state.couponPrice) > 0)) { await sh().alert({ text: "Укажите цену всей пачки купонов (BYN)" }); return; }
      }
    }
    if (state.orderType === "pp" && state.deliveriesN >= 2 && !(state.ppSlotManual === 1 || state.ppSlotManual === 2)) {
      await sh().alert({ text: "Укажи какая сейчас доставка: ПП 1 или ПП 2" });
      return;
    }
    if (state.orderType === "bp") {
      var peek = null;
      try {
        peek = await api().apiGet({ action: "getSubscription", nick: clientName, segment: "БП", sheet: "БП", _: String(Date.now()) }, { timeoutMs: 12000, cacheTtlMs: 0 });
      } catch (e) {}
      if (!state.ppPartner && peek && peek.found !== false && peek.ppPartner) {
        state.ppPartner = String(peek.ppPartner).trim();
      }
      if (!state.ppPartner) {
        var mem = loadMemory()[clientName.toUpperCase()];
        if (mem && mem.ppPartner) state.ppPartner = mem.ppPartner;
      }
      if (!state.ppPartner) {
        var lp = await api().apiGet({ action: "lookupBpPartner", nick: clientName, _: String(Date.now()) }, { timeoutMs: 10000, cacheTtlMs: 0 });
        if (lp && lp.status === "success" && lp.ppPartner) state.ppPartner = String(lp.ppPartner).trim();
      }
      if (!state.ppPartner) {
        await sh().alert({ text: "Для БП обязательно укажите партнёра (кто привёл). Или выберите «Другое»." });
        return;
      }
    }
    flushOrderNotes();
    var badNote = (state.notes || []).some(function (n) {
      if (!String(n.text || "").trim()) return false;
      var r = n.roles || {};
      return !(r.mgr || r.cut || r.cour);
    });
    if (badNote) { await sh().alert({ text: "У каждого примечания выберите роли (менеджер / нарезчик / курьер)." }); return; }
    state.outsideMinsk = outside();
    if (state.outsideMinsk && !state.deliveryMethod) {
      var picked = await sh().choice({
        title: "Доставка за Минском",
        text: "Адрес вне Минска или дальше 20 км. Как доставляем? Курьером физически не возим — обычно Европочта или Белпочта.",
        options: [
          { label: "Европочта", value: "euro" },
          { label: "Белпочта", value: "bel" },
          { label: "Всё же курьер", value: "courier" }
        ]
      });
      if (!picked) return;
      state.deliveryMethod = picked;
    }
    if (!state.outsideMinsk) state.deliveryMethod = null;
    if ((state.deliveryMethod === "euro" || state.deliveryMethod === "bel") && !String(state.postOffice || "").trim()) {
      folds.details = true;
      paint();
      await sh().alert({ text: "Укажите адрес отделения почты — куда повезут заказ." });
      return;
    }
    var sameSlot = false;
    if (state.isEdit) {
      var origIso = isoFromAny(state.editOriginalDate);
      var nextIso = isoFromAny(state.deliveryDate);
      if (origIso && nextIso) sameSlot = origIso === nextIso;
      else sameSlot = !!state.editOriginalDay && state.editOriginalDay === (state.day || "");
    }
    if (!sameSlot) {
      var fullN = await countForSave();
      var fullText = root.BoinyaWeekLogic && root.BoinyaWeekLogic.fullDayPrompt(fullN);
      if (fullText) {
        var addMore = await sh().confirm({ title: "Полный день", text: fullText, ok: "Добавить", cancel: "Отмена" });
        if (!addMore) return;
      }
    }
    var priceShow = pay().orderPriceOf(state, eng());
    var msg = (state.isEdit ? "Обновить заказ " : "Сохранить заказ ") + clientName + "?";
    if (state.orderType !== "bp" && priceShow != null && !isNaN(Number(priceShow))) msg += "\nЦена: " + Number(priceShow) + " BYN";
    var ok = await sh().confirm({ title: "Сохранить заказ", text: msg, ok: "Сохранить заказ" });
    if (!ok) return;
    state.survey = null;
    if (state.orderType === "bp") {
      var survey = await resolveBp();
      if (survey === false) return;
      state.survey = survey;
    }
    saving = true;
    paint();
    sh().loader({ title: "Сохраняю заказ…", step: "запись в лист" });
    var weekDay = state.day || "";
    if (!weekDay && state.deliveryDate) {
      var resolved = null;
      try {
        resolved = await api().apiGet({ action: "resolveDayForDate", date: state.deliveryDate }, { timeoutMs: 12000, cacheTtlMs: 60000 });
      } catch (e) {}
      if (resolved && resolved.onWeek && resolved.dayName) weekDay = resolved.dayName;
    }
    if (state.isEdit && state.editOriginalClient && String(state.editOriginalClient).trim().toUpperCase() !== clientName.toUpperCase()) {
      var del = await api().apiGet({
        action: "deleteClient",
        client: state.editOriginalClient,
        day: state.editOriginalDay || state.day || "",
        matchKey: state.editOriginalMatchKey || ""
      }, { timeoutMs: 20000, cacheTtlMs: 0 });
      if (!del || (del.status !== "success" && del.status !== "accepted" && !del.sheetsVerified && !del.alreadyGone)) {
        saving = false;
        sh().closeLoader();
        paint();
        await sh().alert({ text: "Не удалось убрать старую запись — сохранение отменено." });
        return;
      }
    }
    var book = pay().buildSaveBookingParams(state, eng(), weekDay);
    var savedSurvey = state.survey;
    var res = await api().apiPost(book);
    sh().closeLoader();
    var msgOut = saveMessage(res);
    saving = false;
    if (!msgOut.ok) { sh().toast(msgOut.text); paint(); return; }
    if (savedSurvey && root.BoinyaBpWeeks && savedSurvey.advance !== "refresh" && String(savedSurvey.status || "") !== "ФИНАЛ") {
      try { await api().apiPost(root.BoinyaBpWeeks.remindBody(clientName, savedSurvey.ownerTelegramId || telegramId())); } catch (eRm) {}
    }
    if (root.BoinyaWeek && root.BoinyaWeek.confirmWrite) root.BoinyaWeek.confirmWrite(res, "сохранено");
    else sh().toast(msgOut.text);
    var whClient = clientName;
    var whDay = weekDay || state.day || "";
    var whDate = state.deliveryDate || "";
    var whBasket = [];
    try { whBasket = eng().buildOrderSaveBasket_() || []; } catch (eWh) {}
    if (root.BoinyaWeek && root.BoinyaWeek.noteMonth) {
      root.BoinyaWeek.noteMonth({
        op: "save",
        date: whDate,
        oldDate: state.isEdit ? (state.editOriginalDate || "") : "",
        oldClient: state.isEdit ? (state.editOriginalClient || "") : "",
        oldMatchKey: state.isEdit ? (state.editOriginalMatchKey || "") : "",
        client: {
          name: whClient,
          matchKey: state.isEdit ? (state.editOriginalMatchKey || "") : "",
          address: street,
          phone: state.phone || "",
          orderType: state.orderType,
          orderPrice: priceShow,
          day: whDay,
          basket: whBasket,
          note: book.note || ""
        }
      });
    }
    remember();
    clearDraft();
    var keepDate = state.deliveryDate;
    var keepDay = state.day;
    state = blank();
    state.deliveryDate = keepDate;
    state.day = keepDay;
    ppFact = null;
    paint();
    warehouseAfterSave(whClient, whDay, whDate, whBasket);
  }

  function warehouseAfterSave(client, day, date, basket) {
    if (!client || !day) return;
    var params = {
      action: "checkOrderWarehouse",
      client: client,
      day: day,
      date: date || "",
      force: "1",
      _: String(Date.now())
    };
    if (basket && basket.length) {
      try { params.basket = JSON.stringify(basket); } catch (eB) {}
    }
    api().apiGet(params, { timeoutMs: 20000, cacheTtlMs: 0 }).then(function (res) {
      var wh = res && res.warehouseAlert;
      if (!pay().warehouseAlertOpen(wh)) return;
      showWarehouse(wh, client);
    }).catch(function () {});
  }

  function whRows(list, accent) {
    return (list || []).map(function (d) {
      return '<p style="margin:6px 0' + (accent ? ";color:var(--b-bad)" : "") + '"><b>' + esc(d.name || "") + "</b> −" +
        esc(d.deficit) + " " + esc(d.unit || "кг") +
        '<span class="b-note"> нужно ' + esc(d.needRaw) + ", есть " + esc(d.available) + "</span></p>";
    }).join("");
  }

  function showWarehouse(wh, name) {
    whCopy = String(wh.messageText || "");
    var clientDefs = wh.clientDeficits || [];
    var totalDefs = wh.totalDeficits || [];
    var html = '<p class="b-lbl">' + esc(name || "клиент") + "</p>" +
      (clientDefs.length ? whRows(clientDefs, true) : '<p class="b-note">По составу дефицита нет.</p>') +
      '<p class="b-lbl">Общий дефицит</p>' +
      (totalDefs.length ? whRows(totalDefs, false) : '<p class="b-note">Общего дефицита нет.</p>');
    var foot = '<div class="nx-actions"><button type="button" class="b-btn b-btn--main" data-act="wh-copy">Скопировать</button>' +
      '<button type="button" class="b-btn b-btn--sec" data-act="wh-share">Отправить</button>' +
      '<button type="button" class="b-btn b-btn--sec" data-act="wh-ok">OK</button></div>';
    sh().openSheet({ title: "Дефицит сырья", html: html, foot: foot, id: "wh" });
  }

  async function defer() {
    var tid = await ensureTid();
    if (!tid) return;
    eng().applyState(state);
    var nick = String(state.client || "").trim();
    var has = !!(eng().buildOrderSaveBasket_() || []).length;
    if (!nick && !has) { sh().toast("Укажи ник или корзину"); return; }
    var picked = await sh().pickRemindAt({
      title: "На потом",
      text: "Когда напомнить?",
      options: [
        { label: "Без напоминания", value: "none" },
        { label: "Сегодня 18:00", value: "today" },
        { label: "Завтра 10:00", value: "tomorrow" }
      ]
    });
    if (!picked) return;
    var whenDate = picked.none ? null : picked;
    var snap = pay().buildDeferredSnapshot(state, eng());
    var typeLab = { pp: "ПП", bp: "БП", retail: "Р", partner: "Партнёр" }[state.orderType] || "Заказ";
    var title = "Заказ, " + typeLab + (nick ? ", " + nick : "") + (state.deliveryDate ? ", " + ddmmOf(state.deliveryDate) : "");
    var id = state.deferredId || ("ord_" + Date.now().toString(36));
    var params = {
      action: "saveDeferred",
      telegramId: tid,
      id: id,
      mode: "order",
      title: title,
      clientNick: nick,
      payload: JSON.stringify(snap),
      _: String(Date.now())
    };
    if (whenDate) {
      params.remindAtMs = String(whenDate.getTime());
      params.remindAt = whenDate.toISOString();
    }
    var res;
    if (params.payload.length < 1400) res = await api().apiGet(params, { timeoutMs: 25000, cacheTtlMs: 0 });
    else {
      res = await api().apiPost({
        action: "saveDeferred",
        telegramId: tid,
        id: id,
        mode: "order",
        title: title,
        clientNick: nick,
        payload: snap,
        remindAtMs: params.remindAtMs || "",
        remindAt: params.remindAt || ""
      });
    }
    if (!res || (res.status !== "success" && res.status !== "sent" && res.status !== "accepted" && !res.sent_opaque)) {
      sh().toast("Не сохранилось: " + ((res && (res.message || res.status)) || "нет ответа"));
      return;
    }
    state.deferredId = (res && res.id) || id;
    sh().toast("Отложено");
  }

  function rebuildAdd(caret) {
    sh().replaceTop({ html: addHtml(), foot: addFoot() });
    if (caret == null) return;
    var again = document.getElementById("pq");
    if (!again) return;
    again.focus();
    try { again.setSelectionRange(caret, caret); } catch (ePq) {}
  }

  function onAct(act, node) {
    if (act === "input" || act === "change") {
      if (node && node.getAttribute && node.getAttribute("data-k")) readField(node);
      if (node && node.id === "pq") {
        picker.q = node.value;
        if (picker.cat !== "crumb") patchPickList(false);
      }
      if (node && node.getAttribute && node.getAttribute("data-act") === "note-text") {
        state.notes[Number(node.getAttribute("data-i"))].text = node.value;
      }
      if (node && node.getAttribute && node.getAttribute("data-act") === "csrc") {
        var idx = Number(node.getAttribute("data-i"));
        var parts = String(node.value || "").split("|");
        while (picker.sources.length <= idx) picker.sources.push("");
        picker.sources[idx] = parts[1] || "";
        rebuildAdd(null);
      }
      if (node && node.getAttribute && node.getAttribute("data-act") === "cgram") {
        var gi = Number(node.getAttribute("data-i"));
        if (!picker.grams) picker.grams = [];
        picker.grams[gi] = node.value;
      }
      if (node && node.id && node.id.indexOf("noteItem") === 0) {
        var ni = Number(node.id.replace("noteItem", ""));
        if (state.notes[ni]) state.notes[ni].itemKey = node.value;
      }
      return false;
    }
    if (act === "type") { setType(node.getAttribute("data-type")); return true; }
    if (act === "open-days") { sh().openSheet({ title: "День", html: dayStrip(), id: "days" }); return true; }
    if (act === "fold-more") { folds.more = !folds.more; paint(); return true; }
    if (act === "day") { selectDay(node.getAttribute("data-day")); return true; }
    if (act === "future") { selectDay("Будущая неделя"); return true; }
    if (act === "cal") { openCal(); return true; }
    if (act === "cal-shift") {
      var dir = Number(node.getAttribute("data-dir"));
      if (!calCursor) return true;
      calCursor.m += dir;
      if (calCursor.m < 0) { calCursor.m = 11; calCursor.y -= 1; }
      if (calCursor.m > 11) { calCursor.m = 0; calCursor.y += 1; }
      openCal();
      return true;
    }
    if (act === "cal-day") { sh().closeTop("ok"); selectDate(node.getAttribute("data-iso")); return true; }
    if (act === "seg") return onSeg(node.getAttribute("data-seg"));
    if (act === "fold-details") { folds.details = !folds.details; paint(); return true; }
    if (act === "fold-ig") { folds.checklist = !folds.checklist; paint(); return true; }
    if (act === "method") { state.deliveryMethod = node.getAttribute("data-method"); state.outsideMinsk = true; paint(); return true; }
    if (act === "coords") { askCoords(); return true; }
    if (act === "notes") { openNotes(); return true; }
    if (act === "note-role") {
      var n = state.notes[Number(node.getAttribute("data-i"))];
      var role = node.getAttribute("data-role");
      n.roles[role] = !n.roles[role];
      sh().replaceTop({ html: picker._notes() });
      return true;
    }
    if (act === "note-perm") {
      state.notes[Number(node.getAttribute("data-i"))].permanent = node.getAttribute("data-p") === "1";
      sh().replaceTop({ html: picker._notes() });
      return true;
    }
    if (act === "note-add") {
      state.notes.push({ text: "", roles: { cour: true, mgr: false, cut: false }, permanent: false, itemKey: "" });
      sh().replaceTop({ html: picker._notes() });
      return true;
    }
    if (act === "note-del") {
      state.notes.splice(Number(node.getAttribute("data-i")), 1);
      if (!state.notes.length) state.notes.push({ text: "", roles: { cour: true }, permanent: false, itemKey: "" });
      sh().replaceTop({ html: picker._notes() });
      return true;
    }
    if (act === "note-done") { flushOrderNotes(); sh().closeTop("ok"); paint(); return true; }
    if (act === "add") { openAdd(); return true; }
    if (act === "pcat") {
      picker.cat = node.getAttribute("data-cat");
      picker.name = "";
      picker.sub = "";
      picker.qty = picker.cat === "chew" ? 1 : 200;
      rebuildAdd(null);
      return true;
    }
    if (act === "pname") {
      picker.name = node.getAttribute("data-name");
      picker.sub = "";
      picker.qty = (extraUnit_(picker.cat, picker.name) || eng().unitForItem(picker.cat, picker.name)) === "шт" ? 1 : 200;
      patchPick();
      return true;
    }
    if (act === "phit") {
      var nextCat = node.getAttribute("data-cat") || picker.cat;
      var nextName = node.getAttribute("data-name") || "";
      var nextSub = node.getAttribute("data-frac") || "";
      var sameHit = picker.cat === nextCat && picker.name === nextName && (picker.sub || "") === nextSub;
      picker.cat = nextCat;
      picker.name = nextName;
      picker.sub = nextSub;
      if (!sameHit) {
        picker.qty = (extraUnit_(picker.cat, picker.name) || eng().unitForItem(picker.cat, picker.name)) === "шт" ? 1 : 200;
      }
      patchPick();
      return true;
    }
    if (act === "pfrac") { picker.sub = node.getAttribute("data-frac"); patchPick(); return true; }
    if (act === "pqty") {
      var pickUnit = picker.name ? (extraUnit_(picker.cat, picker.name) || eng().unitForItem(picker.cat, picker.name)) : "";
      var pickPiece = pieceQty_(picker.cat, picker.name, pickUnit);
      var pickDir = Number(node.getAttribute("data-dir"));
      var pickNext = pickPiece ? Number(picker.qty) + pickDir : gramStep_(picker.qty, pickDir);
      picker.qty = Math.max(pickPiece ? 1 : 5, pickNext);
      if (picker.cat === "crumb") rebuildAdd(null);
      else patchPick();
      return true;
    }
    if (act === "ckind") { picker.kind = node.getAttribute("data-kind"); picker.sources = []; picker.grams = []; rebuildAdd(null); return true; }
    if (act === "csrc-add") { picker.sources.push(""); if (!picker.grams) picker.grams = []; picker.grams.push(""); rebuildAdd(null); return true; }
    if (act === "csrc-del") { picker.sources.pop(); if (picker.grams) picker.grams.pop(); rebuildAdd(null); return true; }
    if (act === "padd") { addFromPicker(); return true; }
    if (act === "step") {
      var list = state.baskets[state.activeDog];
      var i = Number(node.getAttribute("data-i"));
      var it = list[i];
      if (!it) return true;
      var unit = it.unit || eng().unitForItem(it.cat, it.main);
      var linePiece = pieceQty_(it.cat, it.main, unit);
      var lineDir = Number(node.getAttribute("data-dir"));
      var curQty = Number(it.value != null ? it.value : it.val);
      var next = linePiece ? curQty + lineDir : gramStep_(curQty, lineDir);
      if (next <= 0) list.splice(i, 1);
      else it.value = next;
      syncRetail();
      patchLines();
      return true;
    }
    if (act === "clear-basket") { state.baskets[state.activeDog] = []; syncRetail(); paint(); return true; }
    if (act === "from-pp") { fromPp(); return true; }
    if (act === "ig-go") { applyChecklist(); return true; }
    if (act === "ig-clear") { state.igPaste = ""; paint(); return true; }
    if (act === "price-auto") { state.retailPriceManual = false; syncRetail(); paint(); return true; }
    if (act === "pick-addr") {
      applyAddress(addrSuggest[Number(node.getAttribute("data-i"))]);
      return true;
    }
    if (act === "wh-ok") { sh().closeTop("ok"); return true; }
    if (act === "wh-copy" || act === "wh-share") {
      var text = whCopy;
      if (act === "wh-share" && navigator.share) {
        navigator.share({ text: text, title: "Дефицит сырья" }).catch(function () {});
        return true;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { sh().toast("Скопировано"); }).catch(function () { sh().toast("Не скопировалось"); });
      } else sh().toast(text || "Не скопировалось");
      return true;
    }
    if (act === "pick-client") {
      var row = suggest[Number(node.getAttribute("data-i"))];
      if (!row) return true;
      state.client = row.nick;
      if (row.phone) state.phone = row.phone;
      if (row.address) {
        var p = eng().parseDeliveryAddress(row.address);
        state.address = p.street || row.address;
        if (p.entrance) state.entrance = p.entrance;
        if (p.floor) state.floor = p.floor;
        if (p.flat) state.flat = p.flat;
      }
      if (row.ppPartner && state.orderType === "bp") state.ppPartner = row.ppPartner;
      suggest = [];
      paint();
      refreshPp();
      return true;
    }
    if (act === "retry-days") { loadDays(); return true; }
    if (act === "cancel-order") { cancelDelivery(); return true; }
    if (act === "save") { save(); return true; }
    if (act === "defer") { defer(); return true; }
    if (act === "loader-hide") { sh().closeLoader(); return true; }
    return false;
  }

  function onSeg(id) {
    if (id === "dog0") { state.dogCount = 1; state.activeDog = 1; paint(); return true; }
    if (id === "dog1") {
      if (!String(state.client || "").trim()) { sh().toast("Сначала укажи имя / ник владельца"); return true; }
      state.client = String(state.client).replace(/\s*[·•#]\s*2\s*$/i, "").trim();
      state.dogCount = 2;
      state.activeDog = 1;
      paint();
      sh().toast("Хозяин один, переключай Собака 1 / 2 и сохрани один раз");
      return true;
    }
    if (id === "ad1") { state.activeDog = 1; paint(); return true; }
    if (id === "ad2") { state.dogCount = 2; state.activeDog = 2; paint(); return true; }
    if (id === "pp1") { state.ppSlotManual = 1; paint(); return true; }
    if (id === "pp2") { state.ppSlotManual = 2; paint(); return true; }
    if (id === "del0") { state.retailPaidDelivery = false; if (!state.retailPriceManual) syncRetail(); paint(); return true; }
    if (id === "del1") { state.retailPaidDelivery = true; if (!state.retailPriceManual) syncRetail(); paint(); return true; }
    if (id === "cup0") { state.partnerCouponsEnabled = false; paint(); return true; }
    if (id === "cup1") { state.partnerCouponsEnabled = true; paint(); return true; }
    return false;
  }

  async function askCoords() {
    var raw = await sh().prompt({
      title: "Координаты",
      text: "Широта, долгота (например 53.907861, 27.484504) или ссылка Яндекс с pt=",
      ok: "Поставить"
    });
    if (raw == null || !String(raw).trim()) return;
    var parsed = eng().parseLatLonFromText_(raw);
    if (!parsed) { sh().toast("Не разобрал координаты"); return; }
    state.geo = {
      lat: parsed.lat,
      lon: parsed.lon,
      yandexUrl: "https://yandex.ru/maps/?pt=" + parsed.lon + "," + parsed.lat + "&z=17&l=map"
    };
    state.outsideMinsk = eng().haversineKm(eng().MINSK_CENTER, state.geo) > eng().MINSK_RADIUS_KM;
    paint();
    sh().toast(state.outsideMinsk ? "Точка за Минском" : "Точка в Минске");
  }

  async function bootPrices() {
    var res = await api().apiGet({ action: "getRetailPriceList", telegramId: telegramId(), _: String(Date.now()) }, { timeoutMs: 20000, cacheTtlMs: 60000 });
    if (res && res.status === "success") {
      eng().applyRetailPriceMapToUi_(res.items || [], res.delivery || null);
      if (res.delivery) {
        state.retailDeliveryFee = res.delivery.fee;
        state.retailFreeFrom = res.delivery.freeFrom;
        eng().applyState(state);
      }
    }
  }

  function resetKeepDate() {
    var date = state.deliveryDate;
    var day = state.day;
    state = blank();
    state.deliveryDate = date;
    state.day = day;
  }

  function basketFromClient(g) {
    g = g || {};
    var e = eng();
    var name = String(g.name || g.main || "");
    var crumbish = !!(g.crumbKind || String(g.cat || "").toLowerCase() === "crumb" || (Array.isArray(g.sources) && g.sources.length) || /крошк/i.test(name));
    if (crumbish && e && e.mapApiBasketToLocal) {
      var mapped = e.mapApiBasketToLocal([g]);
      if (mapped && mapped[0]) {
        var row = mapped[0];
        row.dog = g.dog ? Number(g.dog) : 0;
        if (row.value == null) row.value = row.val;
        if (!row.sources || !row.sources.length) {
          var names = String(g.sub || "").split(/\s*\+\s*/).map(function (p) { return String(p || "").trim(); }).filter(function (p) {
            return p && !/^крошка$/i.test(p);
          });
          if (names.length) {
            var pool = e.crumbSourcePool_(row.crumbKind || "meat") || [];
            row.sources = names.map(function (n) {
              var hit = null;
              pool.forEach(function (p) {
                if (String(p.name || "").toUpperCase() === n.toUpperCase()) hit = p;
              });
              var canon = hit ? hit.name : n;
              return { cat: hit ? hit.cat : "", name: canon, main: canon, sub: "" };
            });
          }
        }
        var ratio = Array.isArray(row.ratio) ? row.ratio.slice() : (Array.isArray(g.ratio) ? g.ratio.slice() : []);
        (row.sources || []).forEach(function (s, i) {
          var own = Number(ratio[i]);
          if (!(own > 0)) {
            var raw = (g.sources || []).filter(function (r) {
              return String((r && (r.name || r.main)) || "").toUpperCase() === String(s.name || s.main || "").toUpperCase();
            })[0];
            own = Number(raw && (raw.val != null ? raw.val : raw.value));
          }
          if (own > 0) {
            s.val = own;
            s.value = own;
            ratio[i] = own;
          }
        });
        if (ratio.some(function (n) { return Number(n) > 0; })) row.ratio = ratio;
        if (row.frac != null) delete row.frac;
        return row;
      }
    }
    var plain = {
      cat: g.cat || "other",
      main: g.name || g.main,
      name: g.name || g.main,
      sub: g.sub || "",
      value: g.val != null ? g.val : g.value,
      dog: g.dog ? Number(g.dog) : 0,
      frac: g.frac || ""
    };
    if (root.BoinyaCutFrac) root.BoinyaCutFrac.keep(plain);
    else if (plain.frac != null) delete plain.frac;
    return plain;
  }

  function loadFromClient(client, meta) {
    client = client || {};
    meta = meta || {};
    var next = blank();
    var ot = "pp";
    try {
      if (root.BoinyaWeekLogic) ot = root.BoinyaWeekLogic.resolveOrderType(client) || "pp";
    } catch (eOt) {}
    next.orderType = ot;
    next.client = client.name || client.client || "";
    next.phone = client.phone || "";
    next.address = client.address || "";
    next.deliveryAfter = client.deliveryAfter || "";
    next.deliveryBefore = client.deliveryBefore || "";
    next.ppPartner = client.ppPartner || "";
    next.deliveryDate = meta.date || "";
    next.day = meta.day || "";
    next.isEdit = true;
    next.editOriginalClient = next.client;
    next.editOriginalDay = meta.calendarOnly ? "" : (meta.day || "");
    next.editOriginalDate = meta.date || "";
    next.editOriginalMatchKey = client.matchKey || "";
    next.deferredId = meta.deferredId || "";
    if (client.orderPrice != null && client.orderPrice !== "" && ot !== "bp") {
      next.priceInput = String(client.orderPrice);
      if (ot === "retail") next.retailPriceManual = true;
    }
    var slot = Number(client.deliverySlot) || 0;
    if (!slot && client.ppSlot) {
      var m = String(client.ppSlot).match(/(\d+)/);
      if (m) slot = Number(m[1]) || 0;
    }
    if (slot === 1 || slot === 2) next.ppSlotManual = slot;
    if (client.deliveriesN) next.deliveriesN = Number(client.deliveriesN) || 0;
    var basket = (client.basket || []).map(function (g) {
      return basketFromClient(g);
    });
    var has1 = basket.some(function (x) { return Number(x.dog) === 1; });
    var has2 = basket.some(function (x) { return Number(x.dog) === 2; });
    if (has1 && has2) {
      next.dogCount = 2;
      next.baskets[1] = basket.filter(function (x) { return Number(x.dog) !== 2; });
      next.baskets[2] = basket.filter(function (x) { return Number(x.dog) === 2; });
    } else {
      next.baskets[1] = basket;
    }
    if (Array.isArray(client.notes) && client.notes.length) next.notes = client.notes;
    else if (String(client.note || "").trim()) {
      try { next.notes = eng().parseOrderNotes(client.note) || []; } catch (eNote) { next.notes = []; }
    }
    if (client.geo) next.geo = client.geo;
    state = next;
    eng().applyState(state);
    paint();
  }

  function loadDeferred(payload, id) {
    payload = payload || {};
    if (payload.mode === "order" || payload.client || payload.baskets) {
      state = blank();
      state.orderType = payload.orderType || "pp";
      state.client = payload.client || "";
      state.phone = payload.phone || "";
      state.address = payload.address || "";
      state.entrance = payload.entrance || "";
      state.floor = payload.floor || "";
      state.flat = payload.flat || "";
      state.deliveryDate = payload.deliveryDate || "";
      state.day = payload.day || "";
      state.deliveryAfter = payload.deliveryAfter || "";
      state.deliveryBefore = payload.deliveryBefore || "";
      state.priceInput = payload.orderPrice || "";
      state.ppPartner = payload.ppPartner || "";
      state.notes = payload.notes || [];
      state.baskets = payload.baskets || { 1: [], 2: [] };
      state.dogCount = Number(payload.dogCount) >= 2 ? 2 : 1;
      state.activeDog = Number(payload.activeDog) === 2 ? 2 : 1;
      state.deliveryMethod = payload.deliveryMethod || null;
      state.postOffice = payload.postOffice || "";
      state.geo = payload.geo || null;
      state.retailPaidDelivery = !!payload.retailPaidDelivery;
      state.partnerCouponsEnabled = !!payload.partnerCouponsEnabled;
      state.couponsQty = payload.couponsQty || "";
      state.couponPrice = payload.couponPrice || "";
      state.ppSlotManual = payload.ppDeliverySlotManual || null;
      state.igPaste = payload.igPaste || "";
      state.deferredId = id || "";
      eng().applyState(state);
      paint();
      return;
    }
    loadFromClient({
      name: payload.client || payload.nick || "",
      phone: payload.phone || "",
      address: payload.address || "",
      basket: payload.basket || [],
      segment: payload.segment || "",
      orderType: payload.orderType || payload.mode || ""
    }, { deferredId: id || "", date: payload.deliveryDate || "", day: payload.day || "" });
  }

  root.BoinyaOrders = {
    FULL_FROM: FULL_FROM,
    paint: paint,
    paintSegs: paintSegs,
    loadDays: loadDays,
    bootPrices: bootPrices,
    loadPartners: loadPartners,
    onAct: onAct,
    contextLine: contextLine,
    titleLine: titleLine,
    getState: function () { return state; },
    setState: function (next) { state = next || blank(); },
    blank: blank,
    loadFromClient: loadFromClient,
    loadDeferred: loadDeferred,
    syncProfiles: syncProfiles,
    rankCatalogName: rankCatalogName,
    catalogSearchRows: catalogSearchRows,
    gramStep_: gramStep_,
    crumbBuilderHtml: crumbBuilderHtml,
    crumbItemFromDraft: crumbItemFromDraft,
    monthStore: function () { return { overview: monthMap, people: {} }; }
  };
  try {
    root.addEventListener("pagehide", persistDraft);
  } catch (eHide) {}
})(window);
