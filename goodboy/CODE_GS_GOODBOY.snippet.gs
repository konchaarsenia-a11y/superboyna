/* ========== Goodboy: пользователи / связки / питомцы / подписка ==========
 * ВЛИТЬ в конец Code.gs (после native auth). Не заменять весь файл.
 *
 * Пишет ТОЛЬКО в листы: GB_Пользователи, GB_Связки, GB_Питомцы.
 * CRM (ПП/АФК/БП/Контакты) и Календарь_Дат — только ЧТЕНИЕ.
 * Не трогает: Прием заказов, Нарезка, Доставки, Склад, Доступы, Брони.
 * Не путать GB_* с «Доступы» (сотрудники конвейера).
 */

var GB_USERS_SHEET_ = "GB_Пользователи";
var GB_LINKS_SHEET_ = "GB_Связки";
var GB_PETS_SHEET_ = "GB_Питомцы";
var GB_USERS_HEADERS_ = [
  "userId", "telegramId", "name", "username", "phone", "access", "createdAt", "lastLoginAt"
];
var GB_LINKS_HEADERS_ = [
  "userId", "telegramId", "matchKey", "clientNick", "subId", "segment",
  "status", "linkedAt", "verifyMethod", "phone"
];
var GB_PETS_HEADERS_ = [
  "id", "ownerTelegramId", "name", "breed", "weightKg", "ageYears",
  "sex", "allergies", "notes", "updatedAt"
];

var GB_ACTIONS_ = {
  gbEnsureSheets: 1,
  gbBootstrap: 1,
  gbMe: 1,
  gbRegister: 1,
  gbLogin: 1,
  gbLinkClient: 1,
  gbSavePet: 1,
  gbRequestOtp: 1,
  gbVerifyOtp: 1,
  gbAuthTelegram: 1
};

function gbParamsFromGet_(e) {
  var p = (e && e.parameter) || {};
  function dec(k) {
    if (p[k] == null || p[k] === "") return "";
    try { return decodeURIComponent(String(p[k])); } catch (err) { return String(p[k]); }
  }
  return {
    telegramId: String(p.telegramId || ""),
    userId: dec("userId"),
    name: dec("name"),
    username: dec("username") || dec("nick"),
    nick: dec("nick") || dec("username"),
    phone: dec("phone"),
    access: dec("access"),
    hasSubscription: p.hasSubscription,
    intent: dec("intent"),
    petJson: dec("petJson"),
    initData: dec("initData"),
    code: dec("code"),
    challengeId: dec("challengeId"),
    purpose: dec("purpose"),
    force: p.force || ""
  };
}

function isGoodboyAction_(action) {
  return !!(GB_ACTIONS_[String(action || "")]);
}

function dispatchGoodboyAction_(action, json, callback, fromPost) {
  json = json || {};
  action = String(action || "");
  if (!isGoodboyAction_(action)) {
    var unk0 = { status: "error", message: "unknown_gb_action", action: action };
    return fromPost ? jsonpText(callback, unk0) : jsonp(callback, unk0);
  }
  try {
    ensureGbSheets_();
  } catch (eSheets) {
    var badSheets = { status: "error", message: "gb_sheets_failed", detail: String(eSheets) };
    return fromPost ? jsonpText(callback, badSheets) : jsonp(callback, badSheets);
  }
  try {
    if (action === "gbEnsureSheets") return handleGbEnsureSheets_(json, callback, fromPost);
    if (action === "gbBootstrap") return handleGbBootstrap_(json, callback, fromPost);
    if (action === "gbMe") return handleGbMe_(json, callback, fromPost);
    if (action === "gbRegister") return handleGbRegister_(json, callback, fromPost);
    if (action === "gbLogin") return handleGbLogin_(json, callback, fromPost);
    if (action === "gbLinkClient") return handleGbLinkClient_(json, callback, fromPost);
    if (action === "gbSavePet") return handleGbSavePet_(json, callback, fromPost);
    if (action === "gbRequestOtp") return handleGbRequestOtp_(json, callback, fromPost);
    if (action === "gbVerifyOtp") return handleGbVerifyOtp_(json, callback, fromPost);
    if (action === "gbAuthTelegram") return handleGbAuthTelegram_(json, callback, fromPost);
  } catch (eRun) {
    var fail = { status: "error", message: "gb_error", detail: String(eRun) };
    return fromPost ? jsonpText(callback, fail) : jsonp(callback, fail);
  }
  var unk = { status: "error", message: "unknown_gb_action", action: action };
  return fromPost ? jsonpText(callback, unk) : jsonp(callback, unk);
}

/** Создаёт только GB_* — чужие листы не трогает. */
function ensureGbSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  getOrCreateSheet_(ss, GB_USERS_SHEET_, GB_USERS_HEADERS_);
  getOrCreateSheet_(ss, GB_LINKS_SHEET_, GB_LINKS_HEADERS_);
  getOrCreateSheet_(ss, GB_PETS_SHEET_, GB_PETS_HEADERS_);
  return { ok: true, sheets: [GB_USERS_SHEET_, GB_LINKS_SHEET_, GB_PETS_SHEET_] };
}

function handleGbEnsureSheets_(json, callback, fromPost) {
  var res = ensureGbSheets_();
  var ok = { status: "success", sheets: res.sheets };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function gbPartnersList_() {
  return [{
    id: "varok",
    slug: "varok",
    name: "VARKA",
    blurb: "12 кофеен в Минске — лакомства Бойни уже на витрине",
    locationsCount: 12
  }];
}

function handleGbBootstrap_(json, callback, fromPost) {
  var ok = {
    status: "success",
    demo: false,
    message: "live ok",
    partners: gbPartnersList_(),
    sheets: [GB_USERS_SHEET_, GB_LINKS_SHEET_, GB_PETS_SHEET_]
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function gbPhoneDigits_(phone) {
  var d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 12 && d.indexOf("375") === 0) return d;
  if (d.length === 11 && d.charAt(0) === "8") return "375" + d.slice(1);
  if (d.length === 9) return "375" + d;
  return d;
}

function gbPhonesMatch_(a, b) {
  var da = gbPhoneDigits_(a);
  var db = gbPhoneDigits_(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 9 && db.length >= 9 && da.slice(-9) === db.slice(-9)) return true;
  return false;
}

function gbUid_(prefix) {
  return String(prefix || "gb") + "_" + Utilities.getUuid().replace(/-/g, "").slice(0, 10);
}

function gbNowIso_() {
  return Utilities.formatDate(new Date(), "Europe/Minsk", "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function gbSheetRows_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return { sh: sh, headers: [], rows: [] };
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var rows = [];
  for (var r = 1; r < data.length; r++) {
    var obj = { _row: r + 1 };
    for (var c = 0; c < headers.length; c++) {
      obj[String(headers[c] || "")] = data[r][c];
    }
    rows.push(obj);
  }
  return { sh: sh, headers: headers, rows: rows };
}

function gbFindUserByTelegram_(telegramId) {
  var id = String(telegramId || "").trim();
  if (!id) return null;
  var pack = gbSheetRows_(GB_USERS_SHEET_);
  for (var i = 0; i < pack.rows.length; i++) {
    if (String(pack.rows[i].telegramId || "") === id) return pack.rows[i];
  }
  return null;
}

function gbFindUserByPhoneOrNick_(phone, nick) {
  var pack = gbSheetRows_(GB_USERS_SHEET_);
  var wantNick = String(nick || "").trim().replace(/^@/, "").toLowerCase();
  for (var i = 0; i < pack.rows.length; i++) {
    var row = pack.rows[i];
    if (phone && gbPhonesMatch_(row.phone, phone)) return row;
    if (wantNick) {
      var un = String(row.username || "").trim().replace(/^@/, "").toLowerCase();
      if (un && un === wantNick) return row;
    }
  }
  return null;
}

function gbUpsertUser_(opts) {
  opts = opts || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getOrCreateSheet_(ss, GB_USERS_SHEET_, GB_USERS_HEADERS_);
  var telegramId = String(opts.telegramId || "").trim();
  if (!telegramId) telegramId = gbUid_("web");
  var existing = gbFindUserByTelegram_(telegramId);
  var now = gbNowIso_();
  var userId = existing ? String(existing.userId || "") : "";
  if (!userId) userId = "u_" + telegramId;
  var name = String(opts.name != null ? opts.name : (existing && existing.name) || "").trim();
  var username = String(opts.username != null ? opts.username : (existing && existing.username) || "").trim().replace(/^@/, "");
  var phone = String(opts.phone != null ? opts.phone : (existing && existing.phone) || "").trim();
  var access = String(opts.access != null ? opts.access : (existing && existing.access) || "limited").trim() || "limited";
  var createdAt = existing ? String(existing.createdAt || now) : now;
  var vals = [userId, telegramId, name, username, phone, access, createdAt, now];
  if (existing && existing._row) {
    sh.getRange(existing._row, 1, 1, GB_USERS_HEADERS_.length).setValues([vals]);
  } else {
    sh.appendRow(vals);
  }
  return {
    id: userId,
    userId: userId,
    telegramId: telegramId,
    name: name,
    username: username,
    phone: phone,
    access: access,
    createdAt: createdAt,
    lastLoginAt: now
  };
}

function gbFindLinkByTelegram_(telegramId) {
  var id = String(telegramId || "").trim();
  if (!id) return null;
  var pack = gbSheetRows_(GB_LINKS_SHEET_);
  for (var i = 0; i < pack.rows.length; i++) {
    if (String(pack.rows[i].telegramId || "") === id) return pack.rows[i];
  }
  return null;
}

function gbUpsertLink_(opts) {
  opts = opts || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getOrCreateSheet_(ss, GB_LINKS_SHEET_, GB_LINKS_HEADERS_);
  var telegramId = String(opts.telegramId || "").trim();
  if (!telegramId) return null;
  var existing = gbFindLinkByTelegram_(telegramId);
  var now = gbNowIso_();
  var userId = String(opts.userId || (existing && existing.userId) || ("u_" + telegramId));
  var vals = [
    userId,
    telegramId,
    String(opts.matchKey || ""),
    String(opts.clientNick || ""),
    String(opts.subId || ""),
    String(opts.segment || ""),
    String(opts.status || "linked"),
    existing ? String(existing.linkedAt || now) : now,
    String(opts.verifyMethod || ""),
    String(opts.phone || "")
  ];
  if (existing && existing._row) {
    sh.getRange(existing._row, 1, 1, GB_LINKS_HEADERS_.length).setValues([vals]);
  } else {
    sh.appendRow(vals);
  }
  return {
    status: String(opts.status || "linked"),
    clientNick: String(opts.clientNick || ""),
    matchKey: String(opts.matchKey || ""),
    subId: String(opts.subId || ""),
    segment: String(opts.segment || ""),
    phone: String(opts.phone || ""),
    verifyMethod: String(opts.verifyMethod || ""),
    linkedAt: existing ? String(existing.linkedAt || now) : now
  };
}

function gbPetsFor_(telegramId) {
  var id = String(telegramId || "").trim();
  var out = [];
  if (!id) return out;
  var pack = gbSheetRows_(GB_PETS_SHEET_);
  for (var i = 0; i < pack.rows.length; i++) {
    if (String(pack.rows[i].ownerTelegramId || "") !== id) continue;
    out.push({
      id: String(pack.rows[i].id || ""),
      ownerTelegramId: id,
      name: String(pack.rows[i].name || ""),
      breed: String(pack.rows[i].breed || ""),
      weightKg: Number(pack.rows[i].weightKg) || 0,
      ageYears: Number(pack.rows[i].ageYears) || 0,
      sex: String(pack.rows[i].sex || ""),
      allergies: String(pack.rows[i].allergies || ""),
      notes: String(pack.rows[i].notes || ""),
      updatedAt: String(pack.rows[i].updatedAt || "")
    });
  }
  return out;
}

function gbSavePetRow_(telegramId, pet) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getOrCreateSheet_(ss, GB_PETS_SHEET_, GB_PETS_HEADERS_);
  var tg = String(telegramId || "").trim();
  var id = String((pet && pet.id) || "").trim() || gbUid_("pet");
  var name = String((pet && pet.name) || "").trim();
  if (!name) return { ok: false, message: "Укажите кличку" };
  var pack = gbSheetRows_(GB_PETS_SHEET_);
  var existing = null;
  for (var i = 0; i < pack.rows.length; i++) {
    if (String(pack.rows[i].id || "") === id) {
      existing = pack.rows[i];
      break;
    }
  }
  var now = gbNowIso_();
  var row = {
    id: id,
    ownerTelegramId: tg,
    name: name,
    breed: String((pet && pet.breed) || "").trim(),
    weightKg: Number(pet && pet.weightKg) || 0,
    ageYears: Number(pet && pet.ageYears) || 0,
    sex: String((pet && pet.sex) || ""),
    allergies: String((pet && pet.allergies) || "").trim(),
    notes: String((pet && pet.notes) || "").trim(),
    updatedAt: now
  };
  var vals = [
    row.id, row.ownerTelegramId, row.name, row.breed, row.weightKg,
    row.ageYears, row.sex, row.allergies, row.notes, row.updatedAt
  ];
  if (existing && existing._row) {
    sh.getRange(existing._row, 1, 1, GB_PETS_HEADERS_.length).setValues([vals]);
  } else {
    sh.appendRow(vals);
  }
  return { ok: true, pet: row };
}

/** Только чтение CRM. Ничего не пишет в ПП/АФК/БП/Контакты. */
function gbFindCrmSubscriber_(nick, phone) {
  var crmSs = null;
  try { crmSs = getCrmSpreadsheet_(); } catch (e) { crmSs = null; }
  if (!crmSs) {
    try { crmSs = SpreadsheetApp.getActiveSpreadsheet(); } catch (e2) { return null; }
  }
  var nickClean = String(nick || "").trim().replace(/^@/, "");
  var phoneClean = String(phone || "").trim();
  var hits = [];

  function pushHit(cellNick, sheetName, subId, statusCell, wishes) {
    var display = displayClientNick_(cellNick) || extractInstagramNick_(cellNick) || String(cellNick || "").trim();
    if (!display) return;
    hits.push({
      clientNick: display,
      label: String(cellNick || "").replace(/\s+/g, " ").trim(),
      matchKey: clientMatchKey_(cellNick),
      subId: sanitizeSubId_(subId),
      segment: sheetName,
      statusCell: String(statusCell || ""),
      wishes: String(wishes || "")
    });
  }

  try {
    if (nickClean) {
      var sheets = ["ПП", "АФК", "БП"];
      for (var s = 0; s < sheets.length; s++) {
        var data = null;
        try {
          data = getCrmSheetValuesFast_(crmSs, sheets[s]) || readCrmSheetLiveNarrow_(crmSs, sheets[s], 5);
        } catch (eR) { data = null; }
        if (!data || data.length < 3) continue;
        for (var r = 2; r < data.length; r++) {
          var cell = String(data[r][0] || "");
          if (!cell.trim()) continue;
          if (!nicksMatch_(cell, nickClean) && !nicksMatch_(cell, "@" + nickClean)) continue;
          pushHit(cell, sheets[s], data[r][1], data[r][3], data[r][4]);
        }
      }
    }
  } catch (eNick) {}

  try {
    if (phoneClean && !hits.length) {
      var contacts = null;
      try {
        contacts = getCrmSheetValuesFast_(crmSs, "Контакты") || readCrmSheetLiveNarrow_(crmSs, "Контакты", 8);
      } catch (eC) { contacts = null; }
      if (contacts && contacts.length >= 2) {
        for (var c = 1; c < contacts.length; c++) {
          var cPhone = String(contacts[c][4] || contacts[c][2] || "");
          if (!gbPhonesMatch_(cPhone, phoneClean)) continue;
          var cNick = String(contacts[c][0] || "").trim();
          if (!cNick) continue;
          var found = { basket: [], subId: "", wishes: "", sheet: "" };
          try { found = findSubscriberBasket_(crmSs, cNick, "ПП"); } catch (eF) {}
          pushHit(cNick, (found && found.sheet) || "", found && found.subId, "", found && found.wishes);
        }
      }
      try {
        var shCl = getClientsProfilesSheet_();
        var cld = shCl.getDataRange().getValues();
        for (var cr = 1; cr < cld.length; cr++) {
          if (!gbPhonesMatch_(cld[cr][2], phoneClean)) continue;
          var cn = String(cld[cr][0] || "").trim();
          if (!cn) continue;
          var already = false;
          for (var hi = 0; hi < hits.length; hi++) {
            if (nicksMatch_(hits[hi].clientNick, cn)) { already = true; break; }
          }
          if (already) continue;
          var f2 = { sheet: "", subId: "", wishes: "" };
          try { f2 = findSubscriberBasket_(crmSs, cn, "ПП"); } catch (eF2) {}
          pushHit(cn, (f2 && f2.sheet) || "", f2 && f2.subId, "", f2 && f2.wishes);
        }
      } catch (eCl) {}
    }
  } catch (ePhone) {}

  if (!hits.length) return null;
  var rank = { "ПП": 3, "АФК": 2, "БП": 1, "": 0 };
  hits.sort(function (a, b) {
    return (rank[b.segment] || 0) - (rank[a.segment] || 0);
  });
  var keys = {};
  for (var k = 0; k < hits.length; k++) {
    if (hits[k].matchKey) keys[hits[k].matchKey] = true;
  }
  var keyCount = 0;
  for (var kk in keys) {
    if (keys.hasOwnProperty(kk)) keyCount++;
  }
  if (keyCount > 1) {
    return { ambiguous: true, candidates: hits.slice(0, 5) };
  }
  return { ambiguous: false, hit: hits[0], candidates: hits.slice(0, 5) };
}

/** Лёгкое чтение следующей/текущей доставки: свой проход по Календарь_Дат, без мутаций. */
function gbNextDelivery_(matchKey, clientNick) {
  var mk = String(matchKey || "").trim();
  var nick = String(clientNick || "").trim();
  if (!mk && !nick) return null;
  var tz = "Europe/Minsk";
  try {
    tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || tz;
  } catch (eTz) {}
  var today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var bestFuture = null;
  var bestFutureIso = "";
  var bestToday = null;
  var recentDelivered = null;
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Календарь_Дат");
    if (!sh || sh.getLastRow() < 2) return null;
    // A date, B dateIso, C client, D matchKey, E segment, F address, L status — только чтение
    var last = Math.min(sh.getLastRow(), 5000);
    var data = sh.getRange(2, 1, last, 12).getValues();
    for (var i = 0; i < data.length; i++) {
      var client = String(data[i][2] || "").trim();
      if (!client) continue;
      var st = String(data[i][11] || "").toLowerCase().trim();
      if (st === "cancelled") continue;
      var rowMk = String(data[i][3] || "");
      var same = false;
      if (mk && rowMk && rowMk === mk) same = true;
      else if (nick && nicksMatch_(client, nick)) same = true;
      if (!same) continue;
      var iso = String(data[i][1] || "").trim();
      if (!iso) {
        try {
          var bd = parseFlexibleDate_(data[i][0], tz);
          if (bd) iso = isoDateKey_(bd, tz);
        } catch (eD) {}
      }
      if (!iso) continue;
      var rowObj = {
        dateIso: iso,
        address: String(data[i][5] || ""),
        phone: String(data[i][6] || ""),
        segment: String(data[i][4] || ""),
        calStatus: st || "planned",
        date: data[i][0]
      };
      if (iso === today) bestToday = rowObj;
      if (iso < today && (st === "delivered" || st === "done" || st === "получен")) {
        if (!recentDelivered || iso > recentDelivered.dateIso) recentDelivered = rowObj;
      }
      if (iso >= today) {
        if (!bestFutureIso || iso < bestFutureIso) {
          bestFutureIso = iso;
          bestFuture = rowObj;
        }
      }
    }
  } catch (eCal) {
    return null;
  }
  var best = bestFuture || bestToday || null;
  if (!best) {
    if (recentDelivered) {
      return {
        nextDate: "",
        nextDateLabel: "",
        address: recentDelivered.address || "",
        phone: recentDelivered.phone || "",
        basket: [],
        segment: recentDelivered.segment || "",
        subId: "",
        calStatus: recentDelivered.calStatus || "delivered",
        daysUntil: null,
        recentDelivered: true
      };
    }
    return null;
  }
  var label = best.dateIso;
  var daysUntil = null;
  try {
    var d = parseFlexibleDate_(best.dateIso || best.date, tz);
    if (d) label = Utilities.formatDate(d, tz, "d MMMM");
    var t0 = Utilities.parseDate(today, tz, "yyyy-MM-dd").getTime();
    var t1 = Utilities.parseDate(best.dateIso, tz, "yyyy-MM-dd").getTime();
    daysUntil = Math.round((t1 - t0) / 86400000);
  } catch (eL) {}
  return {
    nextDate: best.dateIso,
    nextDateLabel: label || best.dateIso,
    address: best.address || "",
    phone: best.phone || "",
    basket: [],
    segment: best.segment || "",
    subId: "",
    calStatus: best.calStatus || "planned",
    daysUntil: daysUntil,
    recentDelivered: false
  };
}

/** Клиентские стадии подписки (тексты для кабинета Goodboy). */
function gbClientStageCatalog_() {
  return {
    unlinked: {
      id: "unlinked",
      badge: "не привязана",
      title: "Привяжите заказ",
      text: "Укажите телефон или Instagram-ник из Бойни — покажем дату и состав.",
      progress: 8
    },
    waiting_stock: {
      id: "waiting_stock",
      badge: "ждём",
      title: "Ждём, пока питомец сократит запасы лакомств",
      text: "Пока доедаете текущий набор — новый не торопим. Когда пора готовить, статус обновится.",
      progress: 22
    },
    scheduled: {
      id: "scheduled",
      badge: "в плане",
      title: "Доставка уже в календаре",
      text: "Дата зафиксирована. Скоро начнём заготовку лакомств.",
      progress: 38
    },
    preparing: {
      id: "preparing",
      badge: "готовим",
      title: "Заготавливаем новые лакомства",
      text: "Сушим и комплектуем набор под вашего питомца.",
      progress: 55
    },
    packing: {
      id: "packing",
      badge: "собираем",
      title: "Собираем ваш набор",
      text: "Упаковываем позиции и готовим к передаче курьеру.",
      progress: 72
    },
    on_the_way: {
      id: "on_the_way",
      badge: "в пути",
      title: "Набор уже в пути",
      text: "Сегодня день доставки — курьер везёт набор по адресу.",
      progress: 88
    },
    delivered: {
      id: "delivered",
      badge: "получен",
      title: "Набор у вас",
      text: "Приятного аппетита питомцу. Следующий цикл начнём вовремя.",
      progress: 100
    },
    trial: {
      id: "trial",
      badge: "пробный",
      title: "Пробный период",
      text: "Идёт тестовый набор. После него можно перейти на постоянную подписку.",
      progress: 40
    },
    paused: {
      id: "paused",
      badge: "пауза",
      title: "Подписка на паузе",
      text: "Доставки временно не планируем. Напишите нам, когда возобновить.",
      progress: 15
    }
  };
}

function gbResolveClientStage_(opts) {
  opts = opts || {};
  var cat = gbClientStageCatalog_();
  var linked = !!opts.linked;
  var segment = String(opts.segment || "").toUpperCase();
  var calStatus = String(opts.calStatus || "").toLowerCase().trim();
  var daysUntil = opts.daysUntil;
  var recentDelivered = !!opts.recentDelivered;
  var subStatus = String(opts.subStatus || "");
  var isTrial = segment === "БП" || segment === "BP" || subStatus === "trial";

  function withTrial(stage) {
    var out = {};
    for (var k in stage) {
      if (stage.hasOwnProperty(k)) out[k] = stage[k];
    }
    out.isTrial = !!isTrial;
    out.trialLabel = isTrial ? "пробный" : "";
    return out;
  }

  if (!linked) return withTrial(cat.unlinked);
  if (subStatus === "paused") return withTrial(cat.paused);

  if (calStatus === "delivered" || calStatus === "done" || calStatus === "получен" || recentDelivered) {
    if (daysUntil == null || daysUntil <= 0 || recentDelivered) return withTrial(cat.delivered);
  }
  if (/ship|transit|courier|delivering|в\s*пути|едет/.test(calStatus)) return withTrial(cat.on_the_way);
  if (/assembl|packed|сбор|готов к/.test(calStatus)) return withTrial(cat.packing);

  if (daysUntil == null || daysUntil === "" || isNaN(Number(daysUntil))) {
    return withTrial(cat.waiting_stock);
  }
  daysUntil = Number(daysUntil);
  // «В пути» только в день доставки
  if (daysUntil === 0) return withTrial(cat.on_the_way);
  if (daysUntil < 0) return withTrial(cat.on_the_way);
  if (daysUntil <= 3) return withTrial(cat.packing);
  if (daysUntil <= 9) return withTrial(cat.preparing);
  if (daysUntil <= 16) return withTrial(cat.scheduled);
  return withTrial(cat.waiting_stock);
}

/** Подставить кличку в тексты стадии. */
function gbPersonalizeStage_(stage, petName) {
  stage = stage || {};
  var out = {};
  for (var k in stage) {
    if (stage.hasOwnProperty(k)) out[k] = stage[k];
  }
  var pet = String(petName || "").trim();
  if (!pet) pet = "питомец";
  if (out.id === "waiting_stock") {
    out.title = "Ждём, пока " + pet + " сократит запасы лакомств";
    out.text = "Пока " + pet + " доедает текущий набор — новый не торопим. Когда пора готовить, статус обновится.";
  } else if (out.id === "preparing") {
    out.text = "Сушим и комплектуем набор под " + (pet === "питомец" ? "вашего питомца" : pet) + ".";
  } else if (out.id === "delivered") {
    out.text = pet === "питомец"
      ? "Приятного аппетита питомцу. Следующий цикл начнём вовремя."
      : ("Приятного аппетита, " + pet + "! Следующий цикл начнём вовремя.");
  }
  return out;
}

function gbSubscriptionPayload_(linkRow, crmHit, petName) {
  var segment = String((linkRow && linkRow.segment) || (crmHit && crmHit.segment) || "").toUpperCase();
  var status = "unlinked";
  if (segment === "ПП" || segment === "PP" || segment === "АФК" || segment === "AFK") status = "active";
  else if (segment === "БП" || segment === "BP") status = "trial";
  else if (linkRow && String(linkRow.status || "") === "linked" && segment) status = "active";
  else if (linkRow && String(linkRow.status || "") === "linked") status = "linked";

  var clientNick = String((linkRow && linkRow.clientNick) || (crmHit && crmHit.clientNick) || "");
  var matchKey = String((linkRow && linkRow.matchKey) || (crmHit && crmHit.matchKey) || "");
  var subId = String((linkRow && linkRow.subId) || (crmHit && crmHit.subId) || "");
  var next = null;
  try { next = gbNextDelivery_(matchKey, clientNick); } catch (eN) { next = null; }
  var basket = [];
  var address = (next && next.address) || "";
  var wishes = "";

  if (clientNick) {
    try {
      var crmSs = getCrmSpreadsheet_();
      var found = findSubscriberBasket_(crmSs, clientNick, segment || "ПП");
      if (found) {
        if (found.basket && found.basket.length) basket = found.basket;
        if (!subId && found.subId) subId = found.subId;
        wishes = found.wishes || "";
        if (!segment && found.sheet) segment = found.sheet;
      }
      var contact = lookupContactAddress_(crmSs, clientNick);
      if (!address && contact.address) address = contact.address;
    } catch (eCrm) {}
  }

  var nextDateLabel = "Привяжите подписку";
  if (status === "active" || status === "trial" || status === "linked") {
    nextDateLabel = (next && next.nextDateLabel) || "Дата появится, когда пора готовить набор";
  }

  var linked = !!(linkRow && String(linkRow.status || "") === "linked");
  var stage = gbResolveClientStage_({
    linked: linked,
    segment: segment,
    subStatus: status,
    calStatus: (next && next.calStatus) || "",
    daysUntil: next ? next.daysUntil : null,
    recentDelivered: !!(next && next.recentDelivered)
  });
  stage = gbPersonalizeStage_(stage, petName);

  return {
    status: status,
    segment: segment,
    isTrial: !!stage.isTrial,
    trialLabel: stage.trialLabel || "",
    nextDate: (next && next.nextDate) || "",
    nextDateLabel: nextDateLabel,
    daysUntil: next && next.daysUntil != null ? next.daysUntil : null,
    calStatus: (next && next.calStatus) || "",
    address: address,
    basket: basket,
    subId: subId,
    clientNick: clientNick,
    matchKey: matchKey,
    wishes: wishes,
    petName: String(petName || "").trim(),
    stage: stage,
    stageId: stage.id,
    stageBadge: stage.badge,
    stageTitle: stage.title,
    stageText: stage.text,
    stageProgress: stage.progress
  };
}

function gbPrivilegeFor_(subscription) {
  var seg = String((subscription && subscription.segment) || "").toUpperCase();
  var st = String((subscription && subscription.status) || "");
  var hasPp = (st === "active") && (seg === "ПП" || seg === "PP" || seg === "АФК" || seg === "AFK");
  var codeSeed = String((subscription && (subscription.matchKey || subscription.clientNick || subscription.subId)) || "GB");
  return {
    partnerSlug: "varok",
    eligible: hasPp,
    reason: hasPp ? "ok" : "need_pp",
    title: "Скидка партнёров",
    offerText: hasPp
      ? "Для активных подписчиков ПП"
      : "Скидки открываются с активной подпиской ПП",
    code: hasPp ? ("GB-" + codeSeed.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase()) : "",
    codeLabel: hasPp ? "Покажите код партнёру" : "",
    validUntil: hasPp ? "сегодня" : "",
    howTo: [
      "Откройте карточку скидки в Goodboy",
      "Покажите код партнёру",
      "Скидка только для активной подписки ПП"
    ],
    locations: []
  };
}

function gbAccessFromSubscription_(subscription, fallback) {
  var st = String((subscription && subscription.status) || "");
  if (st === "active" || st === "trial" || st === "linked") return "full";
  return fallback || "limited";
}

function gbLinkPublic_(linkRow, subscription) {
  if (!linkRow || String(linkRow.status || "") !== "linked") {
    return {
      matchKey: "",
      clientNick: "",
      status: "unlinked",
      segment: "",
      subId: ""
    };
  }
  return {
    status: "linked",
    clientNick: String(linkRow.clientNick || (subscription && subscription.clientNick) || ""),
    matchKey: String(linkRow.matchKey || (subscription && subscription.matchKey) || ""),
    segment: String(linkRow.segment || (subscription && subscription.segment) || ""),
    subId: String(linkRow.subId || (subscription && subscription.subId) || ""),
    phone: String(linkRow.phone || ""),
    nextDate: (subscription && subscription.nextDate) || "",
    nextDateLabel: (subscription && subscription.nextDateLabel) || "",
    address: (subscription && subscription.address) || "",
    basket: (subscription && subscription.basket) || []
  };
}

function gbBuildMePayload_(user, opts) {
  opts = opts || {};
  var pets = gbPetsFor_(user.telegramId);
  var petName = "";
  if (pets && pets.length) {
    var wantId = String(opts.activePetId || "");
    for (var pi = 0; pi < pets.length; pi++) {
      if (wantId && String(pets[pi].id) === wantId) {
        petName = String(pets[pi].name || "").trim();
        break;
      }
    }
    if (!petName) petName = String(pets[0].name || "").trim();
  }
  var linkRow = gbFindLinkByTelegram_(user.telegramId);
  var subscription = gbSubscriptionPayload_(linkRow, null, petName);
  if (linkRow && String(linkRow.status || "") === "linked" && !subscription.segment && linkRow.clientNick) {
    try {
      var refresh = gbFindCrmSubscriber_(linkRow.clientNick, linkRow.phone || user.phone);
      if (refresh && refresh.hit) {
        linkRow = gbUpsertLink_({
          userId: user.userId || user.id,
          telegramId: user.telegramId,
          matchKey: refresh.hit.matchKey,
          clientNick: refresh.hit.clientNick,
          subId: refresh.hit.subId,
          segment: refresh.hit.segment,
          status: "linked",
          verifyMethod: "refresh",
          phone: user.phone || ""
        });
        subscription = gbSubscriptionPayload_(linkRow, refresh.hit, petName);
      }
    } catch (eRef) {}
  }
  var access = gbAccessFromSubscription_(subscription, user.access || "limited");
  if (opts.forceAccess) access = opts.forceAccess;
  try {
    if (String(user.access || "") !== access) {
      user = gbUpsertUser_({
        telegramId: user.telegramId,
        name: user.name,
        username: user.username,
        phone: user.phone,
        access: access
      });
    }
  } catch (eAcc) {}
  var link = gbLinkPublic_(linkRow, subscription);
  return {
    status: "success",
    demo: false,
    user: {
      id: user.userId || user.id,
      userId: user.userId || user.id,
      telegramId: user.telegramId,
      name: user.name,
      username: user.username,
      phone: user.phone,
      access: access,
      hasSubscription: access === "full",
      createdAt: user.createdAt
    },
    pets: pets,
    activePetId: pets[0] ? pets[0].id : null,
    link: link,
    subscription: subscription,
    partners: gbPartnersList_(),
    privilege: gbPrivilegeFor_(subscription)
  };
}

function handleGbMe_(json, callback, fromPost) {
  var telegramId = String((json && json.telegramId) || "").trim();
  if (!telegramId) {
    var bad = { status: "error", message: "need_telegramId" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var user = gbUpsertUser_({
    telegramId: telegramId,
    name: (json && json.name) || "",
    username: (json && (json.username || json.nick)) || "",
    phone: (json && json.phone) || "",
    access: (json && json.access) || undefined
  });
  var payload = gbBuildMePayload_(user);
  return fromPost ? jsonpText(callback, payload) : jsonp(callback, payload);
}

function handleGbRegister_(json, callback, fromPost) {
  var name = String((json && json.name) || "").trim();
  var phone = String((json && json.phone) || "").trim();
  var nick = String((json && (json.nick || json.username)) || "").trim().replace(/^@/, "");
  var hasSub = json && (json.hasSubscription === true || json.hasSubscription === "true" || json.hasSubscription === "1" || json.hasSubscription === "yes");
  if (!name) {
    var badName = { status: "error", message: "Укажите имя" };
    return fromPost ? jsonpText(callback, badName) : jsonp(callback, badName);
  }
  if (!phone || gbPhoneDigits_(phone).length < 9) {
    var badPhone = { status: "error", message: "Укажите телефон" };
    return fromPost ? jsonpText(callback, badPhone) : jsonp(callback, badPhone);
  }
  var telegramId = String((json && json.telegramId) || "").trim() || gbUid_("web");
  var user = gbUpsertUser_({
    telegramId: telegramId,
    name: name,
    username: nick,
    phone: phone,
    access: hasSub ? "full" : "limited"
  });
  var needsLink = !!hasSub;
  if (hasSub) {
    try {
      var found = gbFindCrmSubscriber_(nick, phone);
      if (found && found.hit && !found.ambiguous) {
        gbUpsertLink_({
          userId: user.userId,
          telegramId: user.telegramId,
          matchKey: found.hit.matchKey,
          clientNick: found.hit.clientNick,
          subId: found.hit.subId,
          segment: found.hit.segment,
          status: "linked",
          verifyMethod: nick ? "nick" : "phone",
          phone: phone
        });
        needsLink = !found.hit.segment;
        user = gbUpsertUser_({
          telegramId: user.telegramId,
          name: name,
          username: nick,
          phone: phone,
          access: found.hit.segment ? "full" : "limited"
        });
      }
    } catch (eReg) {}
  }
  var payload = gbBuildMePayload_(user);
  payload.needsLink = needsLink && !(payload.link && payload.link.status === "linked" && payload.link.segment);
  payload.registered = true;
  return fromPost ? jsonpText(callback, payload) : jsonp(callback, payload);
}

function handleGbLogin_(json, callback, fromPost) {
  var phone = String((json && json.phone) || "").trim();
  var nick = String((json && (json.nick || json.username)) || "").trim().replace(/^@/, "");
  if (!phone && !nick) {
    var bad = { status: "error", message: "Укажите телефон или ник" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var telegramId = String((json && json.telegramId) || "").trim();
  var existing = null;
  if (telegramId) existing = gbFindUserByTelegram_(telegramId);
  if (!existing) existing = gbFindUserByPhoneOrNick_(phone, nick);

  var found = null;
  try { found = gbFindCrmSubscriber_(nick, phone); } catch (eFind) { found = null; }
  if (found && found.ambiguous) {
    var amb = {
      status: "error",
      message: "Несколько совпадений — напишите в поддержку или укажите Instagram-ник",
      code: "ambiguous",
      candidates: (found.candidates || []).map(function (c) {
        return { clientNick: c.clientNick, segment: c.segment };
      })
    };
    return fromPost ? jsonpText(callback, amb) : jsonp(callback, amb);
  }

  if (!existing && !(found && found.hit)) {
    var miss = { status: "error", message: "Подписка не найдена. Проверьте телефон/ник или зарегистрируйтесь.", code: "not_found" };
    return fromPost ? jsonpText(callback, miss) : jsonp(callback, miss);
  }

  if (!telegramId) {
    telegramId = existing ? String(existing.telegramId || "") : gbUid_("login");
  }
  var name = (found && found.hit && found.hit.clientNick) ||
    (existing && existing.name) ||
    nick ||
    "Подписчик";
  var user = gbUpsertUser_({
    telegramId: telegramId,
    name: name,
    username: nick || (existing && existing.username) || "",
    phone: phone || (existing && existing.phone) || "",
    access: "full"
  });

  var needsLink = true;
  if (found && found.hit) {
    gbUpsertLink_({
      userId: user.userId,
      telegramId: user.telegramId,
      matchKey: found.hit.matchKey,
      clientNick: found.hit.clientNick,
      subId: found.hit.subId,
      segment: found.hit.segment,
      status: "linked",
      verifyMethod: nick ? "nick" : "phone",
      phone: phone
    });
    needsLink = !found.hit.segment;
  }

  var payload = gbBuildMePayload_(user);
  payload.needsLink = needsLink && !(payload.link && payload.link.status === "linked");
  payload.loggedIn = true;
  return fromPost ? jsonpText(callback, payload) : jsonp(callback, payload);
}

function handleGbLinkClient_(json, callback, fromPost) {
  var telegramId = String((json && json.telegramId) || "").trim();
  if (!telegramId) {
    var badId = { status: "error", message: "need_telegramId" };
    return fromPost ? jsonpText(callback, badId) : jsonp(callback, badId);
  }
  var phone = String((json && json.phone) || "").trim();
  var nick = String((json && (json.nick || json.username)) || "").trim().replace(/^@/, "");
  if (!phone && !nick) {
    var bad = { status: "error", message: "Укажите телефон или ник" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }

  var user = gbUpsertUser_({
    telegramId: telegramId,
    phone: phone || undefined,
    username: nick || undefined,
    name: (json && json.name) || undefined
  });

  var found = null;
  try { found = gbFindCrmSubscriber_(nick, phone); } catch (eL) { found = null; }
  if (found && found.ambiguous) {
    var amb = {
      status: "error",
      message: "Несколько совпадений — уточните Instagram-ник",
      code: "ambiguous",
      candidates: (found.candidates || []).map(function (c) {
        return { clientNick: c.clientNick, segment: c.segment };
      })
    };
    return fromPost ? jsonpText(callback, amb) : jsonp(callback, amb);
  }
  if (!found || !found.hit) {
    var miss = { status: "error", message: "Клиент не найден в подписках", code: "not_found" };
    return fromPost ? jsonpText(callback, miss) : jsonp(callback, miss);
  }

  var link = gbUpsertLink_({
    userId: user.userId,
    telegramId: user.telegramId,
    matchKey: found.hit.matchKey,
    clientNick: found.hit.clientNick,
    subId: found.hit.subId,
    segment: found.hit.segment,
    status: "linked",
    verifyMethod: nick ? "nick" : "phone",
    phone: phone
  });
  user = gbUpsertUser_({
    telegramId: user.telegramId,
    name: user.name || found.hit.clientNick,
    username: nick || user.username,
    phone: phone || user.phone,
    access: found.hit.segment ? "full" : "limited"
  });

  var payload = gbBuildMePayload_(user);
  payload.link = gbLinkPublic_(link, payload.subscription);
  return fromPost ? jsonpText(callback, payload) : jsonp(callback, payload);
}

function handleGbSavePet_(json, callback, fromPost) {
  var telegramId = String((json && json.telegramId) || "").trim();
  if (!telegramId) {
    var badId = { status: "error", message: "need_telegramId" };
    return fromPost ? jsonpText(callback, badId) : jsonp(callback, badId);
  }
  var pet = null;
  if (json && json.pet && typeof json.pet === "object") pet = json.pet;
  else if (json && json.petJson) {
    try { pet = JSON.parse(String(json.petJson)); } catch (eJ) { pet = null; }
  }
  if (!pet) {
    var badPet = { status: "error", message: "bad_pet_json" };
    return fromPost ? jsonpText(callback, badPet) : jsonp(callback, badPet);
  }
  gbUpsertUser_({ telegramId: telegramId });
  var saved = gbSavePetRow_(telegramId, pet);
  if (!saved.ok) {
    var fail = { status: "error", message: saved.message || "save_failed" };
    return fromPost ? jsonpText(callback, fail) : jsonp(callback, fail);
  }
  var ok = { status: "success", demo: false, pet: saved.pet };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/** —— Goodboy OTP / Telegram auth (клиенты, не Доступы) —— */

function gbOtpCacheKey_(challengeId) {
  return "gb_otp_ch_" + String(challengeId || "").trim();
}

function gbPutOtpChallenge_(challengeId, data, ttlSec) {
  try {
    CacheService.getScriptCache().put(
      gbOtpCacheKey_(challengeId),
      JSON.stringify(data || {}),
      Math.max(60, ttlSec || 600)
    );
  } catch (e) {}
}

function gbGetOtpChallenge_(challengeId) {
  try {
    var raw = CacheService.getScriptCache().get(gbOtpCacheKey_(challengeId)) || "";
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function gbIsRealTelegramId_(id) {
  return /^\d{5,15}$/.test(String(id || "").trim());
}

function gbMakeOtpCode_() {
  var n = Math.floor(Math.random() * 1000000);
  var s = String(n);
  while (s.length < 6) s = "0" + s;
  return s;
}

function gbBotDeepLink_(payload) {
  var u = "";
  try { u = String(getTelegramBotUsername_() || "").replace(/^@/, ""); } catch (e) { u = ""; }
  if (!u) return "";
  return "https://t.me/" + u + "?start=" + encodeURIComponent(payload);
}

function gbSendOtpToTelegram_(telegramId, code) {
  if (!gbIsRealTelegramId_(telegramId)) return { ok: false, reason: "bad_tg" };
  try {
    var res = telegramSendText_(
      telegramId,
      "🔐 GOOD BOY · код входа: " + code + "\n\nДействует 10 минут. Никому не пересылайте."
    );
    return { ok: !!(res && res.ok !== false), raw: res };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

function gbBindOtpChallengeFromTelegram_(challengeId, from, chatId, name) {
  var id = String(challengeId || "").trim();
  if (!id) {
    telegramSendText_(chatId, "Ссылка устарела. Запросите новый код на сайте GOOD BOY.");
    return;
  }
  var ch = gbGetOtpChallenge_(id);
  if (!ch || !ch.code) {
    telegramSendText_(chatId, "Код уже недействителен. Запросите новый на сайте / в кабинете.");
    return;
  }
  ch.telegramId = String((from && from.id) || chatId || "");
  ch.tgName = String(name || "");
  ch.tgUsername = String((from && from.username) || "");
  ch.boundAt = gbNowIso_();
  gbPutOtpChallenge_(id, ch, 600);
  try {
    gbUpsertUser_({
      telegramId: ch.telegramId,
      name: ch.tgName || ch.name || "",
      username: ch.tgUsername || ch.nick || "",
      phone: ch.phone || "",
      access: "limited"
    });
  } catch (eU) {}
  telegramSendText_(
    chatId,
    "✅ Telegram привязан к входу GOOD BOY.\n\nВаш код: " + ch.code + "\n\nВернитесь на сайт и введите его."
  );
}

function handleGbRequestOtp_(json, callback, fromPost) {
  var phone = String((json && json.phone) || "").trim();
  var nick = String((json && (json.nick || json.username)) || "").trim().replace(/^@/, "");
  var purpose = String((json && json.purpose) || "login").toLowerCase();
  var hasSub = json && (json.hasSubscription === true || json.hasSubscription === "true" || json.hasSubscription === "1" || json.hasSubscription === "yes");
  var name = String((json && json.name) || "").trim();
  var telegramId = String((json && json.telegramId) || "").trim();

  if (purpose === "register") {
    if (!name) {
      var badN = { status: "error", message: "Укажите имя" };
      return fromPost ? jsonpText(callback, badN) : jsonp(callback, badN);
    }
    if (!phone || gbPhoneDigits_(phone).length < 9) {
      var badP = { status: "error", message: "Укажите телефон" };
      return fromPost ? jsonpText(callback, badP) : jsonp(callback, badP);
    }
  } else {
    if (!phone && !nick) {
      var bad = { status: "error", message: "Укажите телефон или ник" };
      return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
    }
  }

  var found = null;
  var needCrm = purpose !== "register" || hasSub;
  if (needCrm) {
    try { found = gbFindCrmSubscriber_(nick, phone); } catch (eF) { found = null; }
    if (found && found.ambiguous) {
      var amb = {
        status: "error",
        message: "Несколько совпадений — уточните Instagram-ник",
        code: "ambiguous"
      };
      return fromPost ? jsonpText(callback, amb) : jsonp(callback, amb);
    }
    if (needCrm && purpose !== "register" && !(found && found.hit)) {
      var miss = { status: "error", message: "Подписка не найдена. Проверьте телефон/ник.", code: "not_found" };
      return fromPost ? jsonpText(callback, miss) : jsonp(callback, miss);
    }
    if (purpose === "register" && hasSub && !(found && found.hit)) {
      var miss2 = { status: "error", message: "Подписка не найдена — проверьте данные или выберите «без подписки».", code: "not_found" };
      return fromPost ? jsonpText(callback, miss2) : jsonp(callback, miss2);
    }
  }

  // если TG id не передан — попробуем найти существующего пользователя по телефону
  if (!gbIsRealTelegramId_(telegramId) && phone) {
    try {
      var ex = gbFindUserByPhoneOrNick_(phone, nick);
      if (ex && gbIsRealTelegramId_(ex.telegramId)) telegramId = String(ex.telegramId);
    } catch (eEx) {}
  }

  var challengeId = Utilities.getUuid().replace(/-/g, "").slice(0, 12);
  var code = gbMakeOtpCode_();
  var ch = {
    code: code,
    phone: phone,
    nick: nick,
    name: name,
    purpose: purpose,
    hasSubscription: !!hasSub,
    telegramId: gbIsRealTelegramId_(telegramId) ? telegramId : "",
    matchKey: found && found.hit ? found.hit.matchKey : "",
    clientNick: found && found.hit ? found.hit.clientNick : "",
    segment: found && found.hit ? found.hit.segment : "",
    subId: found && found.hit ? found.hit.subId : "",
    attempts: 0,
    createdAt: gbNowIso_()
  };
  gbPutOtpChallenge_(challengeId, ch, 600);

  var delivery = "bot_link";
  var sent = false;
  if (gbIsRealTelegramId_(ch.telegramId)) {
    var sendRes = gbSendOtpToTelegram_(ch.telegramId, code);
    sent = !!sendRes.ok;
    if (sent) delivery = "telegram";
  }
  var botUser = "";
  try { botUser = String(getTelegramBotUsername_() || "").replace(/^@/, ""); } catch (eB) {}
  var botLink = gbBotDeepLink_("gbotp_" + challengeId);

  var ok = {
    status: "success",
    challengeId: challengeId,
    delivery: delivery,
    sent: sent,
    botUsername: botUser,
    botLink: botLink,
    expiresInSec: 600,
    message: sent
      ? "Код отправлен в Telegram"
      : "Откройте бота по ссылке — пришлём код входа"
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleGbVerifyOtp_(json, callback, fromPost) {
  var challengeId = String((json && json.challengeId) || "").trim();
  var code = String((json && json.code) || "").replace(/\D/g, "");
  if (!challengeId || code.length < 4) {
    var bad = { status: "error", message: "Введите код из Telegram" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var ch = gbGetOtpChallenge_(challengeId);
  if (!ch || !ch.code) {
    var exp = { status: "error", message: "Код устарел — запросите новый", code: "expired" };
    return fromPost ? jsonpText(callback, exp) : jsonp(callback, exp);
  }
  ch.attempts = Number(ch.attempts || 0) + 1;
  if (ch.attempts > 8) {
    try { CacheService.getScriptCache().remove(gbOtpCacheKey_(challengeId)); } catch (eR) {}
    var locked = { status: "error", message: "Слишком много попыток — запросите новый код", code: "locked" };
    return fromPost ? jsonpText(callback, locked) : jsonp(callback, locked);
  }
  if (String(ch.code) !== code) {
    gbPutOtpChallenge_(challengeId, ch, 600);
    var wrong = { status: "error", message: "Неверный код", code: "bad_code" };
    return fromPost ? jsonpText(callback, wrong) : jsonp(callback, wrong);
  }
  if (!gbIsRealTelegramId_(ch.telegramId)) {
    var needTg = {
      status: "error",
      message: "Сначала откройте бота по ссылке — привяжем Telegram",
      code: "need_telegram",
      botLink: gbBotDeepLink_("gbotp_" + challengeId)
    };
    return fromPost ? jsonpText(callback, needTg) : jsonp(callback, needTg);
  }

  try { CacheService.getScriptCache().remove(gbOtpCacheKey_(challengeId)); } catch (eRm) {}

  var wantFull = ch.purpose === "login" || !!ch.hasSubscription;
  var user = gbUpsertUser_({
    telegramId: ch.telegramId,
    name: ch.name || ch.tgName || ch.clientNick || ch.nick || "Друг",
    username: ch.nick || ch.tgUsername || "",
    phone: ch.phone || "",
    access: wantFull ? "full" : "limited"
  });

  if (wantFull && (ch.clientNick || ch.matchKey || ch.phone || ch.nick)) {
    var found = null;
    try { found = gbFindCrmSubscriber_(ch.nick || ch.clientNick, ch.phone); } catch (eF) {}
    if (found && found.hit) {
      gbUpsertLink_({
        userId: user.userId,
        telegramId: user.telegramId,
        matchKey: found.hit.matchKey,
        clientNick: found.hit.clientNick,
        subId: found.hit.subId,
        segment: found.hit.segment,
        status: "linked",
        verifyMethod: "otp",
        phone: ch.phone || ""
      });
      user = gbUpsertUser_({
        telegramId: user.telegramId,
        name: user.name,
        username: user.username,
        phone: user.phone,
        access: found.hit.segment ? "full" : "limited"
      });
    }
  }

  var payload = gbBuildMePayload_(user);
  payload.verified = true;
  payload.auth = "otp";
  return fromPost ? jsonpText(callback, payload) : jsonp(callback, payload);
}

function handleGbAuthTelegram_(json, callback, fromPost) {
  var init = validateInitDataSoft_(json && json.initData || "");
  var token = "";
  try { token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN") || ""; } catch (eT) {}
  if (token && init && init.soft === false && !init.ok) {
    var badSig = { status: "error", message: "Не удалось проверить Telegram. Откройте кабинет из бота.", code: "bad_init" };
    return fromPost ? jsonpText(callback, badSig) : jsonp(callback, badSig);
  }
  var tgUser = (init && init.user) || {};
  var telegramId = String((json && json.telegramId) || tgUser.id || "").trim();
  if (!gbIsRealTelegramId_(telegramId)) {
    var badId = { status: "error", message: "Откройте кабинет через Telegram", code: "need_telegram" };
    return fromPost ? jsonpText(callback, badId) : jsonp(callback, badId);
  }
  var name = String((json && json.name) || [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || "").trim();
  var username = String((json && (json.username || json.nick)) || tgUser.username || "").trim();
  var user = gbUpsertUser_({
    telegramId: telegramId,
    name: name || "Друг",
    username: username,
    phone: (json && json.phone) || "",
    access: undefined
  });
  var payload = gbBuildMePayload_(user);
  payload.auth = "telegram";
  payload.initOk = !!(init && init.ok);
  return fromPost ? jsonpText(callback, payload) : jsonp(callback, payload);
}
