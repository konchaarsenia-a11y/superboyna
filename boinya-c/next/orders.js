/* Заказы → Новый. Цифры и saveBooking — из order-engine.js и order-payload.js. */
(function (root) {
  "use strict";

  var FULL_FROM = 6;
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

  var state = blank();
  var week = { items: [], error: "", loading: true, meta: null };
  var partners = [];
  var saving = false;
  var ppFact = null;
  var folds = { details: false, checklist: false };
  var picker = blankPicker();
  var suggest = [];
  var priceTimer = null;

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
      deferredId: ""
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
    return left + (week.loading ? "" : " · " + n + " заказов на неделю");
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

  function dayStrip() {
    var html = '<div class="b-days">';
    WEEK.forEach(function (d) {
      var it = weekItem(d.day);
      var num = it && isFinite(Number(it.count)) ? Number(it.count) : null;
      var dateIso = it ? isoFromAny(it.date) : "";
      var dom = dateIso ? Number(dateIso.slice(8, 10)) : "";
      var cls = "b-day";
      if (d.off) cls += " b-day--off";
      if (state.day === d.day) cls += " b-day--on";
      if (num != null && num >= FULL_FROM) cls += " b-day--full";
      var meta = num == null ? "·" : String(num);
      html += '<button type="button" class="' + cls + '" data-act="day" data-day="' + esc(d.day) + '">' +
        '<span class="b-day__w">' + esc(d.short) + "</span>" +
        '<span class="b-day__d">' + esc(dom === "" ? "·" : String(dom)) + "</span>" +
        '<span class="b-day__meta"><span class="b-day__n">' + esc(meta) + "</span></span></button>";
    });
    html += "</div>";
    var futOn = state.day === "Будущая неделя" ? " b-chip--on" : "";
    html += '<div class="b-row" style="margin-top:8px">' +
      '<button type="button" class="b-chip' + futOn + '" data-act="future">Будущая неделя</button>' +
      '<span class="b-grow"></span>' +
      '<button type="button" class="b-ib" data-act="cal" aria-label="Другая дата">' + sh().ico("cal", "b-ico b-ico--20") + "</button></div>";
    if (numFullHint()) {
      html += '<p class="b-note" style="margin-top:8px"><span style="color:var(--b-warn)">●</span> полный от ' + FULL_FROM + "</p>";
    }
    return html;
  }

  function numFullHint() {
    return (week.items || []).some(function (it) { return Number(it && it.count) >= FULL_FROM; });
  }

  function basketLines() {
    var list = state.baskets[state.activeDog] || [];
    if (!list.length) return '<p class="b-note">Состав пуст. Добавьте позицию или вставьте чеклист.</p>';
    return list.map(function (it, i) {
      var unit = eng().unitForItem(it.cat, it.main);
      var name = eng().prettyProductName ? eng().prettyProductName(it.main || it.name) : (it.main || it.name);
      var sub = "";
      if (eng().isCrumbBasketItemUi_(it)) sub = eng().crumbBasketSubLabel_(it);
      else if (it.sub) sub = eng().humanFraction(it.main, it.sub);
      var price = "";
      if (state.orderType === "retail") {
        var c = eng().retailLineCost(it.main, it.sub, it.value != null ? it.value : it.val, it.cat, it);
        if (c && c.found) price = " · " + money(c.cost) + " BYN";
      }
      var val = (it.value != null ? it.value : it.val);
      return '<div class="nx-line"><div class="b-grow"><span class="b-sheet__name">' + esc(name) + "</span>" +
        '<span class="b-sheet__sub">' + esc(sub) + esc(price) + "</span></div>" +
        '<div class="b-step" role="group"><button class="b-step__btn" type="button" data-act="step" data-i="' + i + '" data-dir="-1" aria-label="Меньше">−</button>' +
        '<span class="b-step__val">' + esc(val) + " " + esc(unit) + "</span>" +
        '<button class="b-step__btn" type="button" data-act="step" data-i="' + i + '" data-dir="1" aria-label="Больше">+</button></div></div>';
    }).join("");
  }

  function typeExtras() {
    var html = "";
    if (state.orderType === "pp") {
      html += '<button type="button" class="nx-link" data-act="from-pp">Из подписки ПП</button>';
      if (Number(state.deliveriesN) >= 2) {
        html += '<p class="b-lbl">Слот доставки</p><div class="b-seg">' +
          segBtn("pp1", "ПП 1", state.ppSlotManual === 1) +
          segBtn("pp2", "ПП 2", state.ppSlotManual === 2) + "</div>";
      }
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
        segBtn("del1", "Да · +" + money(eng().PRICE_RETAIL_DELIVERY_BYN()).replace(",00", "") , !!state.retailPaidDelivery) +
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
    if (!notes.length) return "Примечание";
    return notes.map(function (n) {
      var who = [];
      if (n.roles && n.roles.cour) who.push("курьеру");
      if (n.roles && n.roles.mgr) who.push("менеджеру");
      if (n.roles && n.roles.cut) who.push("нарезчику");
      return (who.join(", ") || "без роли") + (n.permanent ? " · постоянное" : " · разовое");
    }).join(" · ");
  }

  function view() {
    var html = "";
    if (week.error) html += sh().errorBox({ title: "Не удалось загрузить дни", text: week.error, act: "retry-days" });
    html += '<div class="b-seg" style="margin-bottom:16px" id="nxSegs"></div>';
    html += '<p class="b-lbl">Тип</p><div class="b-chips">';
    TYPES.forEach(function (t) {
      html += '<button type="button" class="b-chip' + (state.orderType === t.id ? " b-chip--on" : "") + '" data-act="type" data-type="' + t.id + '">' + esc(t.label) + "</button>";
    });
    html += "</div>";
    html += '<p class="b-lbl">Клиент</p><label class="b-field">' + sh().ico("search", "b-ico b-ico--20") +
      '<input class="b-field__input" id="client" data-k="client" value="' + esc(state.client) + '" placeholder="Ник или имя" autocomplete="off"></label>';
    html += '<div id="nxSuggest"></div>';
    html += '<div class="b-row" style="margin-top:8px"><span class="b-grow b-note" style="margin:0">2 собаки</span><div class="b-seg" style="flex:none">' +
      segBtn("dog0", "Нет", state.dogCount < 2) + segBtn("dog1", "Да", state.dogCount >= 2) + "</div></div>";
    if (state.dogCount >= 2) {
      html += '<div class="b-seg" style="margin-top:8px">' + segBtn("ad1", "Собака 1", state.activeDog !== 2) + segBtn("ad2", "Собака 2", state.activeDog === 2) + "</div>";
      html += '<div class="nx-pair" style="margin-top:8px">' + field("dog1", state.dogNames[1], "кличка 1") + field("dog2", state.dogNames[2], "кличка 2") + "</div>";
    }
    html += '<p class="b-lbl">Телефон</p>' + field("phone", state.phone, "+375", 'inputmode="tel"');
    html += '<p class="b-lbl">Адрес</p><div class="b-row" style="gap:8px"><div class="b-grow">' + field("address", state.address, "Улица и дом") +
      '</div><button class="b-ib" type="button" data-act="coords" aria-label="Координаты">' + sh().ico("cal", "b-ico b-ico--20") + "</button></div>";
    html += '<button type="button" class="nx-link" data-act="fold-details" style="margin-top:8px">' + (folds.details ? "Скрыть подъезд" : "Подъезд и детали") + "</button>";
    if (folds.details) {
      html += '<div class="nx-fold nx-pair">' + field("entrance", state.entrance, "подъезд") + field("floor", state.floor, "этаж") + field("flat", state.flat, "квартира") + "</div>";
    }
    if (outside() || state.deliveryMethod) {
      html += '<p class="b-lbl">За Минском</p><div class="b-chips">' +
        chipMeth("euro", "Европочта") + chipMeth("bel", "Белпочта") + chipMeth("courier", "Курьер") + "</div>";
      if (state.deliveryMethod === "euro" || state.deliveryMethod === "bel") {
        html += '<div style="margin-top:8px">' + field("postOffice", state.postOffice, "Отделение почты") + "</div>";
      }
    }
    html += '<p class="b-lbl">День · заказов на день</p>';
    if (week.loading) html += sh().skeleton(1);
    else html += dayStrip();
    if (week.meta && week.meta.skew) {
      html += sh().errorBox({ title: "Даты недели уехали", text: week.meta.skew, act: "retry-days" });
    }
    html += '<div id="nxExtras">' + typeExtras() + "</div>";
    html += '<p class="b-lbl">Доставка</p><div class="nx-pair">' +
      '<label class="b-field"><input class="b-field__input" id="deliveryAfter" data-k="deliveryAfter" type="time" value="' + esc(state.deliveryAfter) + '" aria-label="Не раньше"></label>' +
      '<label class="b-field"><input class="b-field__input" id="deliveryBefore" data-k="deliveryBefore" type="time" value="' + esc(state.deliveryBefore) + '" aria-label="Не позже"></label></div>' +
      '<p class="b-note" style="margin-top:4px">Не раньше · не позже</p>';
    html += '<p class="b-lbl">Примечания</p><button type="button" class="b-li" data-act="notes" style="border:1px solid var(--b-line);border-radius:var(--b-r3);background:var(--b-surface)">' +
      '<span class="b-grow">' + esc(noteSummary()) + "</span></button>";
    html += '<p class="b-lbl">Состав</p>';
    html += '<div class="b-card" style="padding:0 16px"><div id="nxLines">' + basketLines() + "</div></div>";
    html += '<div class="nx-actions" style="margin-top:8px">' +
      '<button class="b-btn b-btn--dash" type="button" data-act="add">+ Позиция</button>' +
      '<button class="b-btn b-btn--dash" type="button" data-act="fold-ig">Вставить чеклист</button></div>';
    if (folds.checklist) {
      html += '<label class="b-field b-field--area" style="margin-top:8px"><textarea class="b-field__input" id="igPaste" data-k="igPaste" placeholder="Строки из Instagram">' + esc(state.igPaste) + "</textarea></label>";
      html += '<div class="nx-actions" style="margin-top:8px"><button class="b-btn b-btn--sec" type="button" data-act="ig-go">В корзину</button>' +
        '<button class="b-btn b-btn--sec" type="button" data-act="ig-clear">Очистить</button></div>';
    }
    if ((state.baskets[state.activeDog] || []).length) {
      html += '<button type="button" class="nx-link" data-act="clear-basket" style="margin-top:8px">Очистить состав</button>';
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
    return '<div class="b-dock__act"><div class="b-sum"><span class="b-sum__k">Итого · ' + positions() + " позиции</span>" +
      '<span class="b-sum__v" id="nxSum">' + esc(label) + "</span></div>" +
      '<div class="nx-actions"><button class="b-btn b-btn--sec" type="button" data-act="defer"' + (saving ? " disabled" : "") + ">На потом</button>" +
      '<button class="b-btn b-btn--main' + (saving ? " b-btn--loading" : "") + '" type="button" id="nxSave" data-act="save"' + (saving ? " disabled" : "") + ">" +
      (saving ? '<span class="b-spin"></span> Сохраняю…' : "Сохранить заказ") + "</button></div></div>";
  }

  function paintSegs(segs, current) {
    var box = document.getElementById("nxSegs");
    if (!box) return;
    box.innerHTML = (segs || []).map(function (s) {
      return '<button type="button" class="b-seg__item' + (s.id === current ? " b-seg__item--on" : "") + '" data-act="oseg" data-seg="' + esc(s.id) + '">' + esc(s.label) + "</button>";
    }).join("");
  }

  function paint() {
    sh().main(view());
    sh().dock(dock());
    paintSuggest();
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
    if (k) k.textContent = "Итого · " + positions() + " позиции";
  }

  function paintSuggest() {
    var box = document.getElementById("nxSuggest");
    if (!box) return;
    if (!suggest.length) { box.innerHTML = ""; return; }
    box.innerHTML = '<div class="nx-suggest">' + suggest.map(function (s, i) {
      return '<button type="button" data-act="pick-client" data-i="' + i + '">' + esc(s.nick) +
        (s.phone ? '<span class="b-note"> · ' + esc(s.phone) + "</span>" : "") + "</button>";
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
    if (k === "client") scheduleSuggest();
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
    week.loading = true;
    week.error = "";
    if (orderVisible()) paint();
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
      paint();
      sh().toast(dayName);
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
    paint();
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

  async function loadPartners() {
    var res = await api().apiGet({ action: "listPartners" }, { timeoutMs: 15000, cacheTtlMs: 60000 });
    var list = (res && (res.partners || res.items || res.list)) || [];
    partners = list.filter(function (p) { return !p || p.active !== false; });
    var box = document.getElementById("nxExtras");
    if (box && state.orderType === "bp" && !sh().sheetOpen()) box.innerHTML = typeExtras();
  }

  var calCursor = null;

  function openCal() {
    var base = state.deliveryDate || new Date().toISOString().slice(0, 10);
    if (!calCursor) calCursor = { y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 };
    var y = calCursor.y;
    var m = calCursor.m;
    function html() {
      var first = new Date(y, m, 1);
      var start = (first.getDay() + 6) % 7;
      var days = new Date(y, m + 1, 0).getDate();
      var cells = "";
      for (var i = 0; i < start; i++) cells += "<span></span>";
      for (var d = 1; d <= days; d++) {
        var iso = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        var on = iso === state.deliveryDate ? ' aria-pressed="true"' : "";
        cells += '<button type="button" data-act="cal-day" data-iso="' + iso + '"' + on + ">" + d + "</button>";
      }
      return '<div class="b-row"><button class="b-btn b-btn--sec b-btn--sm" type="button" data-act="cal-shift" data-dir="-1">‹</button>' +
        '<span class="b-grow" style="text-align:center;font-weight:600">' + esc(MONTHS_FULL[m] + " " + y) + "</span>" +
        '<button class="b-btn b-btn--sec b-btn--sm" type="button" data-act="cal-shift" data-dir="1">›</button></div>' +
        '<div class="nx-cal" style="margin-top:12px">' + cells + "</div>" +
        '<p class="b-note" style="margin-top:12px">Другая дата. Если день не в текущей неделе, заказ уйдёт в календарь.</p>';
    }
    if (sh().sheetOpen()) sh().replaceTop({ title: "Другая дата", html: html() });
    else sh().openSheet({ title: "Другая дата", html: html(), id: "cal", onClose: function () { calCursor = null; } });
  }

  function openNotes() {
    if (!state.notes.length) state.notes.push({ text: "", roles: { cour: true, mgr: false, cut: false }, permanent: false, itemKey: "" });
    function html() {
      return state.notes.map(function (n, i) {
        var r = n.roles || {};
        return '<div class="b-card" style="margin-bottom:8px;padding:12px">' +
          '<label class="b-field b-field--area"><textarea class="b-field__input" data-act="note-text" data-i="' + i + '">' + esc(n.text || "") + "</textarea></label>" +
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
    sh().openSheet({ title: "Примечание", html: html(), id: "notes" });
  }

  function roleChip(i, role, label, on) {
    return '<button type="button" class="b-chip' + (on ? " b-chip--on" : "") + '" data-act="note-role" data-i="' + i + '" data-role="' + role + '">' + esc(label) + "</button>";
  }

  function openAdd() {
    eng().applyState(state);
    picker.open = true;
    sh().openSheet({ title: "Добавить позицию", html: addHtml(), id: "add", onClose: function () { picker.open = false; } });
  }

  function addHtml() {
    var e = eng();
    var chips = CATS.map(function (c) {
      return '<button type="button" class="b-chip' + (picker.cat === c.id ? " b-chip--on" : "") + '" data-act="pcat" data-cat="' + c.id + '">' + esc(c.label) + "</button>";
    }).join("");
    var body = "";
    if (picker.cat === "crumb") body = crumbHtml();
    else {
      var items = e.catalogItemsForUi_(picker.cat).filter(function (name) {
        if (!picker.q) return true;
        return String(name).toUpperCase().indexOf(String(picker.q).toUpperCase()) >= 0;
      });
      body = items.map(function (name) {
        var on = picker.name === name ? " b-chip--on" : "";
        return '<button type="button" class="b-li" data-act="pname" data-name="' + esc(name) + '"><span class="b-grow">' + esc(e.prettyProductName(name)) +
          '</span><span class="b-note">' + esc(e.unitForItem(picker.cat, name)) + "</span></button>";
      }).join("");
      if (picker.name) {
        var fr = e.catalogFractionsForUi_(picker.cat, picker.name);
        if (fr.length) {
          body += '<p class="b-lbl">' + esc(e.prettyProductName(picker.name)) + " · фракция</p><div class=\"b-chips\">" +
            fr.map(function (f) {
              return '<button type="button" class="b-chip' + (picker.sub === f ? " b-chip--on" : "") + '" data-act="pfrac" data-frac="' + esc(f) + '">' + esc(e.humanFraction(picker.name, f)) + "</button>";
            }).join("") + "</div>";
        }
        var unit = e.unitForItem(picker.cat, picker.name);
        body += '<p class="b-lbl">Количество</p><div class="b-step"><button class="b-step__btn" type="button" data-act="pqty" data-dir="-1">−</button>' +
          '<span class="b-step__val">' + esc(picker.qty) + " " + esc(unit) + "</span>" +
          '<button class="b-step__btn" type="button" data-act="pqty" data-dir="1">+</button></div>';
      }
    }
    var btn = "В состав";
    if (picker.cat !== "crumb" && picker.name && state.orderType === "retail") {
      var cost = e.retailLineCost(picker.name, picker.sub, picker.qty, picker.cat, { main: picker.name });
      if (cost && cost.found) btn += " · " + money(cost.cost) + " BYN";
    }
    return '<label class="b-field">' + sh().ico("search", "b-ico b-ico--20") +
      '<input class="b-field__input" id="pq" data-k="pq" value="' + esc(picker.q) + '" placeholder="Найти позицию"></label>' +
      '<div class="b-chips" style="margin-top:12px">' + chips + "</div>" +
      '<div class="b-list" style="margin-top:12px">' + body + "</div>" +
      '<button class="b-btn b-btn--main" type="button" data-act="padd" style="margin-top:16px">' + esc(btn) + "</button>" +
      '<p class="b-note" style="margin-top:8px">Один и тот же лист в заказе. «Крошки» открывают конструктор: вид и источники.</p>';
  }

  function crumbHtml() {
    var e = eng();
    var kinds = [["meat", "мясные"], ["veg", "овощи"], ["hypo", "гипоаллергенные"]];
    var html = '<div class="b-chips">' + kinds.map(function (k) {
      return '<button type="button" class="b-chip' + (picker.kind === k[0] ? " b-chip--on" : "") + '" data-act="ckind" data-kind="' + k[0] + '">' + esc(k[1]) + "</button>";
    }).join("") + "</div>";
    var pool = e.crumbSourcePool_(picker.kind);
    html += '<p class="b-lbl">Источники</p>';
    (picker.sources.length ? picker.sources : [""]).forEach(function (src, i) {
      html += '<label class="b-field" style="margin-top:8px"><select class="b-field__input" data-act="csrc" data-i="' + i + '"><option value="">— позиция —</option>' +
        pool.map(function (p) {
          return '<option value="' + esc(p.cat + "|" + p.name) + '"' + (src === p.name ? " selected" : "") + ">" + esc(e.prettyProductName(p.name)) + "</option>";
        }).join("") + "</select></label>";
    });
    html += '<div class="nx-actions" style="margin-top:8px"><button class="b-btn b-btn--sec b-btn--sm" type="button" data-act="csrc-add">+ ещё позицию</button>' +
      (picker.sources.length > 1 ? '<button class="b-btn b-btn--sec b-btn--sm" type="button" data-act="csrc-del">Убрать</button>' : "") + "</div>";
    html += '<p class="b-lbl">Граммы</p><div class="b-step"><button class="b-step__btn" type="button" data-act="pqty" data-dir="-1">−</button>' +
      '<span class="b-step__val">' + esc(picker.qty) + " г</span>" +
      '<button class="b-step__btn" type="button" data-act="pqty" data-dir="1">+</button></div>';
    return html;
  }

  function pushItem(row) {
    var list = state.baskets[state.activeDog] || (state.baskets[state.activeDog] = []);
    list.push(row);
    syncRetail();
    paint();
  }

  function addFromPicker() {
    var e = eng();
    if (picker.cat === "crumb") {
      var sources = picker.sources.filter(Boolean).map(function (name) {
        var pool = e.crumbSourcePool_(picker.kind);
        var hit = null;
        pool.forEach(function (p) { if (p.name === name) hit = p; });
        return { cat: hit ? hit.cat : "", name: name, main: name, sub: "" };
      });
      if (!sources.length) { sh().toast("Выберите источник крошки"); return; }
      pushItem({ cat: "crumb", main: "КРОШКА", crumbKind: picker.kind, sources: sources, value: picker.qty || 100, sub: "" });
      sh().closeTop("ok");
      return;
    }
    if (!picker.name) { sh().toast("Выберите позицию"); return; }
    if (e.catalogFracRequired_(picker.cat, picker.name) && !picker.sub) {
      sh().toast("Выберите фракцию");
      return;
    }
    pushItem({ cat: picker.cat, main: picker.name, name: picker.name, sub: picker.sub || "", value: picker.qty || 1 });
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
    sh().toast(res.hint || ("Состав ПП · " + proposed.length + " поз."));
  }

  async function applyChecklist() {
    var parsed = eng().parseIgLinesToItems(state.igPaste || "");
    var items = (parsed && parsed.items) || [];
    if (!items.length) { sh().toast("В чеклисте нет позиций"); return; }
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.needFrac && it.fractions && it.fractions.length) {
        var picked = await sh().choice({
          title: it.main,
          text: "Какая фракция?",
          options: it.fractions.map(function (f) { return { label: eng().humanFraction(it.main, f), value: f }; })
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
      cat: it.cat, main: it.main, name: it.name || it.main, sub: it.sub || "", value: it.value, crumbKind: it.crumbKind, sources: it.sources
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
    if (!existing) {
      var createBp = await sh().confirm({
        title: "Карточка БП",
        text: "«" + clientName + "» ещё нет в БП.\nСоздать карточку БП1 (1-я доставка)?\nОпросник — через 4 дня после получения.",
        ok: "Создать"
      });
      if (!createBp) return null;
      var ownNew = await ensureOwner(null);
      if (!ownNew || !ownNew.telegramId) { sh().toast("Нужен ответственный менеджер"); return false; }
      return { createCard: true, needSurvey: true, status: "БП1", stage: "БП1", surveyDate: due, surveyKind: "bp2", ownerTelegramId: ownNew.telegramId, ownerName: ownNew.name, subId: "", advance: "new" };
    }
    var st = bpStage(existing.ppStatus || existing.status || existing.stage || "БП1");
    var seed = { telegramId: existing.ownerTelegramId || "", name: existing.ownerName || "" };
    if (st === "ФИНАЛ") {
      var upd = await sh().confirm({ title: "Финал БП", text: "«" + clientName + "» уже в Финале БП.\nОбновить состав 2-й доставки и дату финального опросника на " + due + "?", ok: "Обновить" });
      if (!upd) return null;
      var ownFin = await ensureOwner(seed);
      if (!ownFin || !ownFin.telegramId) return false;
      return { createCard: true, needSurvey: true, status: "ФИНАЛ", stage: "ФИНАЛ", surveyDate: due, surveyKind: "final", ownerTelegramId: ownFin.telegramId, ownerName: ownFin.name, subId: existing.subId || "", advance: "refresh_final" };
    }
    var go2 = await sh().confirm({ title: "Вторая доставка?", text: "«" + clientName + "» уже в БП (" + st + ").\nЭто 2-я доставка?\n→ Финал + финальный опросник на " + due + ".", ok: "Да, финал", alt: "Нет" });
    if (go2 === true) {
      var own2 = await ensureOwner(seed);
      if (!own2 || !own2.telegramId) return false;
      return { createCard: true, needSurvey: true, status: "ФИНАЛ", stage: "ФИНАЛ", surveyDate: due, surveyKind: "final", ownerTelegramId: own2.telegramId, ownerName: own2.name, subId: existing.subId || "", advance: "to_final" };
    }
    if (go2 === false) return null;
    var stay = await sh().confirm({ title: "Оставить этап", text: "Оставить этап " + st + " и обновить состав 1-й доставки?\nОпросник после 1-й → " + due + ".", ok: "Оставить" });
    if (!stay) return null;
    var own1 = await ensureOwner(seed);
    if (!own1 || !own1.telegramId) return false;
    return { createCard: true, needSurvey: true, status: st === "БП2" ? "БП2" : "БП1", stage: st === "БП2" ? "БП2" : "БП1", surveyDate: due, surveyKind: "bp2", ownerTelegramId: own1.telegramId, ownerName: own1.name, subId: existing.subId || "", advance: "refresh_first" };
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
      var known = peek && peek.status === "success" ? bpStage(peek.ppStatus || peek.status || peek.stage || "") : "";
      var later = known === "БП2" || known === "ФИНАЛ";
      if (!state.ppPartner) {
        var mem = loadMemory()[clientName.toUpperCase()];
        if (mem && mem.ppPartner) state.ppPartner = mem.ppPartner;
      }
      if (!state.ppPartner) {
        var lp = await api().apiGet({ action: "lookupBpPartner", nick: clientName, _: String(Date.now()) }, { timeoutMs: 10000, cacheTtlMs: 0 });
        if (lp && lp.status === "success" && lp.ppPartner) state.ppPartner = String(lp.ppPartner).trim();
      }
      if (!state.ppPartner && !later) {
        await sh().alert({ text: "Для БП обязательно укажите партнёра (кто привёл). Или выберите «Другое»." });
        return;
      }
    }
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
    var resolved = null;
    try {
      resolved = await api().apiGet({ action: "resolveDayForDate", date: state.deliveryDate }, { timeoutMs: 12000, cacheTtlMs: 60000 });
    } catch (e) {}
    var onWeek = !!(resolved && resolved.onWeek && resolved.dayName);
    var weekDay = "";
    if (onWeek && resolved.dayName) weekDay = resolved.dayName;
    else if (state.isEdit && state.editOriginalDay && onWeek) weekDay = state.editOriginalDay;
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
    var res = await api().apiPost(book);
    sh().closeLoader();
    var msgOut = saveMessage(res);
    saving = false;
    sh().toast(msgOut.text);
    if (!msgOut.ok) { paint(); return; }
    remember();
    var keepDate = state.deliveryDate;
    var keepDay = state.day;
    state = blank();
    state.deliveryDate = keepDate;
    state.day = keepDay;
    ppFact = null;
    paint();
  }

  async function defer() {
    var tid = await ensureTid();
    if (!tid) return;
    eng().applyState(state);
    var nick = String(state.client || "").trim();
    var has = !!(eng().buildOrderSaveBasket_() || []).length;
    if (!nick && !has) { sh().toast("Укажи ник или корзину"); return; }
    var when = await sh().choice({
      title: "На потом",
      text: "Когда напомнить?",
      options: [
        { label: "Без напоминания", value: "none" },
        { label: "Сегодня 18:00", value: "today" },
        { label: "Завтра 10:00", value: "tomorrow" }
      ]
    });
    if (!when) return;
    var whenDate = null;
    if (when === "today") { whenDate = new Date(); whenDate.setHours(18, 0, 0, 0); }
    if (when === "tomorrow") { whenDate = new Date(); whenDate.setDate(whenDate.getDate() + 1); whenDate.setHours(10, 0, 0, 0); }
    var snap = pay().buildDeferredSnapshot(state, eng());
    var typeLab = { pp: "ПП", bp: "БП", retail: "Р", partner: "Партнёр" }[state.orderType] || "Заказ";
    var title = "Заказ · " + typeLab + (nick ? " · " + nick : "") + (state.deliveryDate ? " · " + state.deliveryDate : "");
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

  function onAct(act, node) {
    if (act === "input" || act === "change") {
      if (node && node.getAttribute && node.getAttribute("data-k")) readField(node);
      if (node && node.id === "pq") { picker.q = node.value; sh().replaceTop({ html: addHtml() }); }
      if (node && node.getAttribute && node.getAttribute("data-act") === "note-text") {
        state.notes[Number(node.getAttribute("data-i"))].text = node.value;
      }
      if (node && node.getAttribute && node.getAttribute("data-act") === "csrc") {
        var idx = Number(node.getAttribute("data-i"));
        var parts = String(node.value || "").split("|");
        picker.sources[idx] = parts[1] || "";
      }
      if (node && node.id && node.id.indexOf("noteItem") === 0) {
        var ni = Number(node.id.replace("noteItem", ""));
        if (state.notes[ni]) state.notes[ni].itemKey = node.value;
      }
      return false;
    }
    if (act === "type") { setType(node.getAttribute("data-type")); return true; }
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
    if (act === "note-done") { sh().closeTop("ok"); paint(); return true; }
    if (act === "add") { openAdd(); return true; }
    if (act === "pcat") {
      picker.cat = node.getAttribute("data-cat");
      picker.name = "";
      picker.sub = "";
      picker.qty = picker.cat === "chew" ? 1 : 200;
      sh().replaceTop({ html: addHtml() });
      return true;
    }
    if (act === "pname") {
      picker.name = node.getAttribute("data-name");
      picker.sub = "";
      picker.qty = eng().unitForItem(picker.cat, picker.name) === "шт" ? 1 : 200;
      sh().replaceTop({ html: addHtml() });
      return true;
    }
    if (act === "pfrac") { picker.sub = node.getAttribute("data-frac"); sh().replaceTop({ html: addHtml() }); return true; }
    if (act === "pqty") {
      var step = (picker.cat === "chew" || (picker.name && eng().unitForItem(picker.cat, picker.name) === "шт")) ? 1 : 50;
      picker.qty = Math.max(step, Number(picker.qty) + Number(node.getAttribute("data-dir")) * step);
      sh().replaceTop({ html: addHtml() });
      return true;
    }
    if (act === "ckind") { picker.kind = node.getAttribute("data-kind"); picker.sources = []; sh().replaceTop({ html: addHtml() }); return true; }
    if (act === "csrc-add") { picker.sources.push(""); sh().replaceTop({ html: addHtml() }); return true; }
    if (act === "csrc-del") { picker.sources.pop(); sh().replaceTop({ html: addHtml() }); return true; }
    if (act === "padd") { addFromPicker(); return true; }
    if (act === "step") {
      var list = state.baskets[state.activeDog];
      var i = Number(node.getAttribute("data-i"));
      var it = list[i];
      if (!it) return true;
      var unit = eng().unitForItem(it.cat, it.main);
      var st = unit === "шт" ? 1 : 50;
      var next = Number(it.value != null ? it.value : it.val) + Number(node.getAttribute("data-dir")) * st;
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
      sh().toast("Хозяин один · переключай Собака 1 / 2 и сохрани один раз");
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
    blank: blank
  };
})(window);
