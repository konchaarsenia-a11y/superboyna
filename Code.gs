/**
 * Бойня-Конвейер — Google Apps Script
 * Источник правды в репозитории: Code.gs
 * После правок: вставить сюда → Deploy → New version
 *
 * Секреты: PropertiesService
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   YANDEX_MAPS_API_KEY — НЕ обязателен (платный). Подсказки адресов работают бесплатно (Photon/OSM).
 * Один раз: выполнить setupSecrets() из редактора (заполнить значения внутри и запустить),
 * либо Project Settings → Script properties.
 */

var DAY_BLOCKS = {
  "ПОНЕДЕЛЬНИК": { nick: 3, start: 4, end: 59, addr: 60, note: 61, sheet: "manager" },
  "ВТОРНИК": { nick: 64, start: 65, end: 120, addr: 121, note: 122, sheet: "manager" },
  "СРЕДА": { nick: 125, start: 126, end: 181, addr: 182, note: 183, sheet: "manager" },
  "ЧЕТВЕРГ": { nick: 186, start: 187, end: 242, addr: 243, note: 244, sheet: "manager" },
  "ПЯТНИЦА": { nick: 247, start: 248, end: 303, addr: 304, note: 305, sheet: "manager" },
  "СУББОТА": { nick: 308, start: 309, end: 364, addr: 365, note: 366, sheet: "manager" },
  "ВОСКРЕСЕНЬЕ": { nick: 369, start: 370, end: 425, addr: 426, note: 427, sheet: "manager" },
  "БУДУЩАЯ НЕДЕЛЯ": { nick: 3, start: 4, end: 59, addr: 60, note: 61, sheet: "future" }
};

var MANAGER_DATE_CELLS = {
  0: "A1", 1: "A62", 2: "A123", 3: "A184", 4: "A245",
  5: "A306", 6: "A367"
};

var MANAGER_DAY_NAMES_ = [
  "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"
];

/**
 * Устройство блока дня на «Прием заказов» (шаг 61 от Пн):
 *   A{date}     — дата (=A1+N для Вт…Вс)
 *   A{date+1}   — название дня
 *   A{date+2}   — «ИМЯ КЛИЕНТА» (ники C–Q)
 *   A{date+3}…  — товары (как A4:A59)
 *   B{товар}    — =SUM(C:Q) по строке
 *   R{блок}     — остаток сырья со склада с учётом прошлых дней (цепочка Пн→…→Вс)
 *   addr/note   — две строки после товаров
 *
 * Сб: A306…A366 (date+5). Вс: A367…A427 (date+6).
 * force — переустановить подписи и формулы B/дат/R.
 */
function ensureManagerWeekendBlocks_(ss, opts) {
  opts = opts || {};
  var force = !!(opts.force === true || opts.force === "1" || opts.force === 1);
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var manager = ss.getSheetByName("Прием заказов");
  if (!manager) return { ok: false };
  var needRows = 427;
  try {
    if (manager.getMaxRows() < needRows) {
      manager.insertRowsAfter(manager.getMaxRows(), needRows - manager.getMaxRows());
    }
  } catch (eRows) {}

  var sat = installManagerDayBlockFromMonday_(manager, {
    dateRow: 306,
    dayOffset: 5,
    dayTitle: "Суббота",
    force: force
  });
  var sun = installManagerDayBlockFromMonday_(manager, {
    dateRow: 367,
    dayOffset: 6,
    dayTitle: "Воскресенье",
    force: force
  });
  // Колонка R: остаток склада — цепочка от предыдущего дня (Пт→Сб→Вс)
  var rSat = installManagerStockColR_(manager, 245, 306, force);
  var rSun = installManagerStockColR_(manager, 306, 367, force);
  if (sat) sat.colR = rSat;
  if (sun) sun.colR = rSun;
  return { ok: true, saturday: sat, sunday: sun };
}

/**
 * Сдвиг локальных A1-ссылок на строки (R190→R251, C248:Q251→C309:Q312).
 * Ссылки других листов ('Склад'!$D$2 и т.п.) не трогаем.
 */
function shiftLocalA1Rows_(formula, delta) {
  var f = String(formula || "");
  var d = Number(delta) || 0;
  if (!f || !d) return f;
  var ext = [];
  // только §N§ — без букв, иначе A1-regex съест T0 внутри SHEET0
  f = f.replace(/((?:'[^']+'|[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9 ]*))!(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)/gi, function (m) {
    ext.push(m);
    return "\u00A7" + (ext.length - 1) + "\u00A7";
  });
  f = f.replace(/(\$?[A-Z]{1,3}\$?)(\d+)/gi, function (_, col, row) {
    return col + (parseInt(row, 10) + d);
  });
  f = f.replace(/\u00A7(\d+)\u00A7/g, function (_, i) {
    return ext[Number(i)];
  });
  return f;
}

/**
 * Скопировать колонку R блока (61 строка: дата…примечание) с prevDateRow → toDateRow.
 * На живом листе ссылки абсолютные ($R$190, $C$248:$Q$251) — после copyTo
 * обязательно сдвигаем строки на (to−prev), иначе Сб/Вс = копия пятницы.
 */
function installManagerStockColR_(manager, prevDateRow, toDateRow, force) {
  prevDateRow = Number(prevDateRow) || 0;
  toDateRow = Number(toDateRow) || 0;
  if (prevDateRow < 1 || toDateRow < 1) return { ok: false };
  var delta = toDateRow - prevDateRow;
  var prevProd = prevDateRow + 3;
  var toProd = toDateRow + 3;
  var prevF = String(manager.getRange(prevProd, 18).getFormula() || "").trim();
  var toF = String(manager.getRange(toProd, 18).getFormula() || "").trim();
  var toV = manager.getRange(toProd, 18).getValue();
  var emptyTo = !toF && (toV === "" || toV == null);
  if (!force && !emptyTo) return { ok: true, skipped: true, reason: "already_filled" };
  if (!prevF) {
    for (var i = 0; i < 56 && !prevF; i++) {
      prevF = String(manager.getRange(prevProd + i, 18).getFormula() || "").trim();
    }
  }
  if (!prevF) {
    return { ok: false, reason: "prev_no_formula", prevDateRow: prevDateRow, toDateRow: toDateRow };
  }
  try {
    manager.getRange(prevDateRow, 18, 61, 1).copyTo(manager.getRange(toDateRow, 18), { contentsOnly: false });
  } catch (eCopy) {
    return { ok: false, reason: String(eCopy), prevDateRow: prevDateRow, toDateRow: toDateRow };
  }
  var shifted = 0;
  if (delta) {
    for (var rr = 0; rr < 61; rr++) {
      var cell = manager.getRange(toDateRow + rr, 18);
      var raw = String(cell.getFormula() || "").trim();
      if (!raw) continue;
      var next = shiftLocalA1Rows_(raw, delta);
      if (next && next !== raw) {
        cell.setFormula(next);
        shifted++;
      }
    }
  }
  return {
    ok: true,
    from: "R" + prevDateRow + ":R" + (prevDateRow + 60),
    to: "R" + toDateRow,
    delta: delta,
    shifted: shifted,
    sample: String(manager.getRange(toProd, 18).getFormula() || "")
  };
}

/**
 * Поставить один блок дня по образцу понедельника (подписи A + суммы B + дата =A1+N).
 * Не копирует заказы C–Q.
 */
function installManagerDayBlockFromMonday_(manager, cfg) {
  var dateRow = Number(cfg.dateRow) || 0;
  var dayOffset = Number(cfg.dayOffset) || 0;
  var title = String(cfg.dayTitle || "");
  var force = !!cfg.force;
  if (dateRow < 2) return { ok: false };
  var titleRow = dateRow + 1;
  var nickRow = dateRow + 2;
  var prodStart = dateRow + 3;
  var prodEnd = prodStart + 55;
  var out = { dateRow: dateRow, title: title, nickRow: nickRow, prodStart: prodStart, prodEnd: prodEnd };

  // убрать старый баг: название дня в B{nick}
  try {
    if (String(manager.getRange(nickRow, 2).getValue() || "").trim() === title) {
      manager.getRange(nickRow, 2).clearContent();
    }
  } catch (eClr) {}

  manager.getRange(titleRow, 1).setValue(title);

  var nickVal = String(manager.getRange(nickRow, 1).getValue() || "").trim();
  var firstProd = String(manager.getRange(prodStart, 1).getValue() || "").trim();
  var misaligned = /л[её]гк/i.test(nickVal) || (!nickVal && firstProd);
  var needLabels = force || misaligned || !firstProd;
  if (needLabels) {
    // A3:A61 → nick…note (59 строк): ИМЯ + товары + адрес + примечание
    manager.getRange(3, 1, 59, 1).copyTo(manager.getRange(nickRow, 1), { contentsOnly: true });
  }

  // B: итог по клиентам строки =SUM(C:Q) — как на Пн
  var needB = force || !String(manager.getRange(prodStart, 2).getFormula() || "").trim();
  if (needB) {
    var monB = String(manager.getRange("B4").getFormula() || "").trim();
    if (monB) {
      manager.getRange("B4:B59").copyTo(manager.getRange(prodStart, 2), { contentsOnly: false });
    } else {
      var formulas = [];
      for (var r = prodStart; r <= prodEnd; r++) {
        formulas.push(["=SUM(C" + r + ":Q" + r + ")"]);
      }
      manager.getRange(prodStart, 2, 56, 1).setFormulas(formulas);
    }
  }

  // Дата от понедельника: =A1+N (Вт=+1 … Вс=+6)
  var dateCell = manager.getRange(dateRow, 1);
  var existingF = String(dateCell.getFormula() || "").trim();
  if (force || !existingF || !dateCell.getValue()) {
    dateCell.setFormula("=A1+" + dayOffset);
  }
  out.dateFormula = String(dateCell.getFormula() || "");
  out.bFormulaSample = String(manager.getRange(prodStart, 2).getFormula() || "");
  out.labels = needLabels;
  out.ok = true;
  return out;
}

/**
 * Один раз из редактора: формулы дат Пн→Вс + блоки Сб/Вс как у Пн.
 * Вт–Пт даты тоже =A1+1…+4 (если ещё не формулы).
 */
function setupWeekendDayFormulas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var manager = ss.getSheetByName("Прием заказов");
  if (!manager) {
    Logger.log("no Прием заказов");
    return { ok: false };
  }
  var dayOffsets = [
    { cell: "A62", n: 1 },
    { cell: "A123", n: 2 },
    { cell: "A184", n: 3 },
    { cell: "A245", n: 4 },
    { cell: "A306", n: 5 },
    { cell: "A367", n: 6 }
  ];
  for (var i = 0; i < dayOffsets.length; i++) {
    manager.getRange(dayOffsets[i].cell).setFormula("=A1+" + dayOffsets[i].n);
  }
  // подписи дней Вт–Пт (если пусто)
  var titles = [
    { row: 2, name: "Понедельник" },
    { row: 63, name: "Вторник" },
    { row: 124, name: "Среда" },
    { row: 185, name: "Четверг" },
    { row: 246, name: "Пятница" },
    { row: 307, name: "Суббота" },
    { row: 368, name: "Воскресенье" }
  ];
  for (var t = 0; t < titles.length; t++) {
    var cell = manager.getRange(titles[t].row, 1);
    if (!String(cell.getValue() || "").trim()) cell.setValue(titles[t].name);
  }
  // B на Пн, если вдруг нет формул
  if (!String(manager.getRange("B4").getFormula() || "").trim()) {
    var monF = [];
    for (var r = 4; r <= 59; r++) monF.push(["=SUM(C" + r + ":Q" + r + ")"]);
    manager.getRange(4, 2, 56, 1).setFormulas(monF);
  }
  // скопировать B-формулы Пн → Вт…Пт (если пусто)
  var bStarts = [65, 126, 187, 248];
  for (var b = 0; b < bStarts.length; b++) {
    var bs = bStarts[b];
    if (!String(manager.getRange(bs, 2).getFormula() || "").trim()) {
      manager.getRange("B4:B59").copyTo(manager.getRange(bs, 2), { contentsOnly: false });
    }
  }
  var week = ensureManagerWeekendBlocks_(ss, { force: true });
  // колонка R ещё раз явно (на случай пустого Пт)
  var rFix = {
    sat: installManagerStockColR_(manager, 245, 306, true),
    sun: installManagerStockColR_(manager, 306, 367, true)
  };
  var whFix = setupWarehouseWeekendRemainCols_(true);
  var snap = inspectManagerFormulas_(ss);
  Logger.log(JSON.stringify({ week: week, rFix: rFix, whFix: whFix, snap: snap }));
  return { ok: true, week: week, rFix: rFix, warehouse: whFix, snap: snap };
}

/** Снимок формул дат/B для отладки (и action inspectManagerFormulas). */
function inspectManagerFormulas_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var manager = ss.getSheetByName("Прием заказов");
  var cutting = ss.getSheetByName("Нарезка");
  var wh = ss.getSheetByName("Склад");
  if (!manager) return { ok: false };
  function cellInfo_(a1) {
    var c = manager.getRange(a1);
    return { a1: a1, formula: String(c.getFormula() || ""), value: String(c.getDisplayValue() || "") };
  }
  var dates = ["A1", "A62", "A123", "A184", "A245", "A306", "A367"].map(cellInfo_);
  var sums = ["B4", "B65", "B126", "B187", "B248", "B309", "B370"].map(cellInfo_);
  var stockR = ["R4", "R65", "R126", "R187", "R248", "R309", "R370"].map(cellInfo_);
  var titles = ["A2", "A63", "A124", "A185", "A246", "A307", "A368"].map(cellInfo_);
  var cutD = null;
  var whG = null;
  try {
    if (cutting) {
      cutD = {
        formula: String(cutting.getRange("D3").getFormula() || ""),
        value: String(cutting.getRange("D3").getDisplayValue() || "")
      };
    }
  } catch (eC) {}
  try {
    if (wh) {
      whG = {
        formula: String(wh.getRange("G2").getFormula() || ""),
        value: String(wh.getRange("G2").getDisplayValue() || "")
      };
    }
  } catch (eW) {}
  var whLM = null;
  try {
    if (wh) {
      whLM = {
        L1: String(wh.getRange("L1").getDisplayValue() || ""),
        M1: String(wh.getRange("M1").getDisplayValue() || ""),
        L2: { formula: String(wh.getRange("L2").getFormula() || ""), value: String(wh.getRange("L2").getDisplayValue() || "") },
        M2: { formula: String(wh.getRange("M2").getFormula() || ""), value: String(wh.getRange("M2").getDisplayValue() || "") },
        K2: { formula: String(wh.getRange("K2").getFormula() || ""), value: String(wh.getRange("K2").getDisplayValue() || "") }
      };
    }
  } catch (eLM) {}
  return {
    ok: true,
    pattern: "date=A1+N; B=SUM(C:Q); R=остаток цепочкой (+61 абс.refs); Склад L/M от Пт K без copyTo",
    dates: dates,
    titles: titles,
    rowSums: sums,
    stockColR: stockR,
    cuttingD3: cutD,
    warehouseG2: whG,
    warehouseWeekend: whLM,
    affects: [
      "recalculateCuttingForDate_ (Нарезка!B из C:Q блока дня)",
      "finishFullWeekProduction (расход склада по всем блокам Пн–Вс)",
      "getClients / move / materialize / weekDayCounts",
      "Нарезка!D — свои формулы от B и Склад!D",
      "Прием заказов!R — остаток по дням",
      "Склад G–K Остаток Пн–Пт; L–M Сб/Вс цепочка K→L→M (без сброса на F)"
    ]
  };
}

function handleInspectManagerFormulas(json, callback, fromPost) {
  var out = inspectManagerFormulas_(SpreadsheetApp.getActiveSpreadsheet());
  out.status = out.ok ? "success" : "error";
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}

function handleSetupWeekendFormulas(json, callback, fromPost) {
  var tid = String((json && json.telegramId) || "").trim();
  if (tid && !actorIsOwner_(tid)) {
    var forbid = { status: "error", message: "owner_only" };
    return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
  }
  var result = setupWeekendDayFormulas();
  result.status = result.ok ? "success" : "error";
  return fromPost ? jsonpText(callback, result) : jsonp(callback, result);
}

/**
 * Живые «Остаток Пн…Пт» на Складе считают расход через
 * SUM('Прием заказов'!C{a}:Q{b}) / (D{row}*1000), а не через колонку R.
 * Сб/Вс: сдвиг строк (+61/+122 от Пт) и жёсткая цепочка K→L→M
 * (без сброса на ревизию F — неделя технически до воскресенья).
 * Нельзя copyTo вправо: уедут D→E (#DIV/0!), C:Q→D:R, F→G.
 *
 * opt.chainOnly — старт только от prevCol (для L/M); иначе IF(F>0;F;prev) как Пн–Пт.
 */
function rewriteWarehouseDayRemainFormula_(srcFormula, whRow, deltaPriem, prevColLetter, opt) {
  opt = opt || {};
  var chainOnly = !!opt.chainOnly;
  var f = String(srcFormula || "").trim();
  var row = Number(whRow) || 0;
  var delta = Number(deltaPriem) || 0;
  var prev = String(prevColLetter || "").toUpperCase();
  if (!f || !row || !prev) return "";
  if (delta) {
    f = f.replace(/(['']?Прием\s*заказов['']?\s*!)([^!;\)]*)/gi, function (_, pref, body) {
      return pref + String(body).replace(/(\$?[A-Z]{1,3}\$?)(\d+)/gi, function (__ , col, rnum) {
        return col + (parseInt(rnum, 10) + delta);
      });
    });
  }
  // IF(F2>0; F2; J2) → для Сб/Вс просто K2 / L2; для Пн–Пт оставляем IF(F;F;prev)
  var reIf = new RegExp(
    "IF\\(\\s*[A-Z]+" + row + "\\s*>\\s*0\\s*[;,]\\s*[A-Z]+" + row + "\\s*[;,]\\s*[A-Z]+" + row + "\\s*\\)",
    "i"
  );
  if (chainOnly) {
    f = f.replace(reIf, prev + row);
    // уже переписанные L/M вида =K2 - MAX(...) — подменить стартовый столбец
    if (!reIf.test(String(srcFormula || ""))) {
      f = f.replace(new RegExp("^(\\s*=\\s*)[A-Z]+" + row + "(\\s*-)", "i"), "$1" + prev + row + "$2");
    }
  } else {
    f = f.replace(reIf, "IF(F" + row + ">0; F" + row + "; " + prev + row + ")");
  }
  // страховка: коэф всегда D{row}, вычитание излишка E{row}
  f = f.replace(new RegExp("/\\s*\\(\\s*[A-Z]+" + row + "\\s*\\*\\s*1000\\s*\\)", "gi"), "/ (D" + row + " * 1000)");
  f = f.replace(
    new RegExp("([;,]\\s*0\\s*\\)\\s*-\\s*)[A-Z]+" + row + "(\\s*\\))", "i"),
    "$1E" + row + "$2"
  );
  return f;
}

/**
 * На «Склад»: колонки L/M = Остаток Сб / Остаток Вс.
 * Цепочка: … → K(Пт) → L(Сб) → M(Вс), без IF(F>0;F;…) на выходных.
 */
function setupWarehouseWeekendRemainCols_(optForce) {
  var force = optForce !== false;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wh = ss.getSheetByName("Склад");
  if (!wh) return { ok: false, message: "no_warehouse" };
  try {
    if (wh.getMaxColumns() < 13) wh.insertColumnsAfter(wh.getMaxColumns(), 13 - wh.getMaxColumns());
  } catch (eCol) {}
  wh.getRange("L1").setValue("Остаток Сб");
  wh.getRange("M1").setValue("Остаток Вс");
  var last = Math.min(60, Math.max(2, wh.getLastRow()));
  var installed = 0;
  var skipped = 0;
  var cleared = 0;
  var samples = [];
  var chainOpt = { chainOnly: true };
  for (var r = 2; r <= last; r++) {
    var name = String(wh.getRange(r, 1).getValue() || "").trim();
    if (!name) { skipped++; continue; }
    var gF = String(wh.getRange(r, 7).getFormula() || "").trim();
    var kF = String(wh.getRange(r, 11).getFormula() || "").trim();
    var lCell = wh.getRange(r, 12);
    var mCell = wh.getRange(r, 13);
    var oldL = String(lCell.getFormula() || "").trim();
    var oldM = String(mCell.getFormula() || "").trim();
    if (!force && oldL && oldM && !/IF\s*\(\s*F\d+\s*>\s*0/i.test(oldL + oldM)) {
      // уже цепочка без сброса на F — не трогаем
      skipped++;
      continue;
    }
    var satF = "";
    var sunF = "";
    var mode = "";
    if (kF && /Прием\s*заказов/i.test(kF)) {
      satF = rewriteWarehouseDayRemainFormula_(kF, r, 61, "K", chainOpt);
      sunF = rewriteWarehouseDayRemainFormula_(kF, r, 122, "L", chainOpt);
      mode = "from_fri_K_chain";
    } else if (gF && /Прием\s*заказов/i.test(gF)) {
      satF = rewriteWarehouseDayRemainFormula_(gF, r, 305, "K", chainOpt);
      sunF = rewriteWarehouseDayRemainFormula_(gF, r, 366, "L", chainOpt);
      mode = "from_mon_G_chain";
    } else {
      // шт / строки без дневных SUM — не копируем вправо (ломает D/E → #DIV/0!)
      if (force && (oldL || oldM) && (/#DIV\/0!|#REF!|#VALUE!/i.test(String(lCell.getDisplayValue() || "")) ||
          /#DIV\/0!|#REF!|#VALUE!/i.test(String(mCell.getDisplayValue() || "")) ||
          /Прием\s*заказов/i.test(oldL + oldM))) {
        try { lCell.clearContent(); mCell.clearContent(); cleared++; } catch (eClr) {}
      }
      skipped++;
      continue;
    }
    if (!satF || !sunF) { skipped++; continue; }
    lCell.setFormula(satF);
    mCell.setFormula(sunF);
    installed++;
    if (samples.length < 8) {
      samples.push({ row: r, name: name, mode: mode, k: kF, l: satF, m: sunF });
    }
  }
  return {
    ok: true,
    installed: installed,
    skipped: skipped,
    cleared: cleared,
    samples: samples,
    headers: { L1: "Остаток Сб", M1: "Остаток Вс" },
    chain: "K→L→M"
  };
}

/** Явный запуск из редактора: только колонки Сб/Вс на Складе. */
function setupWarehouseWeekendCols() {
  var out = setupWarehouseWeekendRemainCols_(true);
  Logger.log(JSON.stringify(out));
  return out;
}

/** Заполнить токены и выполнить ОДИН раз, затем очистить литералы из кода или оставить пустыми. */
function setupSecrets() {
  var props = PropertiesService.getScriptProperties();
  // Вставьте свои значения перед первым запуском, затем можно удалить строки setProperty:
  // props.setProperty("TELEGRAM_BOT_TOKEN", "ВАШ_ТОКЕН");
  // props.setProperty("TELEGRAM_CHAT_ID", "ВАШ_CHAT_ID");
  Logger.log("Properties keys: " + JSON.stringify(props.getKeys()));
}

function getDayBlock(dayName) {
  var key = String(dayName || "").trim().toUpperCase();
  return DAY_BLOCKS[key] || null;
}

function getTargetSheet(ss, block) {
  if (!block) return null;
  if (block.sheet === "future") return ss.getSheetByName("Будущая неделя");
  return ss.getSheetByName("Прием заказов");
}

function jsonp(callback, obj) {
  var cb = callback || "callback";
  return ContentService.createTextOutput(cb + "(" + JSON.stringify(obj) + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/** Кэш на время одного запроса + короткий ScriptCache между вызовами */
var _memoCrmSheets_ = {};
var _memoCalendarRows_ = null;
var _memoPpPartnerIndex_ = null;
var _memoClientsData_ = {};

function cacheGetJson_(key) {
  try {
    var raw = CacheService.getScriptCache().get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function cachePutJson_(key, obj, ttlSec) {
  try {
    var s = JSON.stringify(obj);
    if (s.length > 90000) return false;
    CacheService.getScriptCache().put(key, s, Math.max(5, ttlSec || 30));
    return true;
  } catch (e) {
    return false;
  }
}

function bustClientsCache_() {
  try {
    var cache = CacheService.getScriptCache();
    var days = ["ПОНЕДЕЛЬНИК", "ВТОРНИК", "СРЕДА", "ЧЕТВЕРГ", "ПЯТНИЦА", "СУББОТА", "ВОСКРЕСЕНЬЕ", "БУДУЩАЯ НЕДЕЛЯ"];
    for (var i = 0; i < days.length; i++) {
      cache.remove("GC:" + days[i]);
      cache.remove("COUR:" + days[i]);
      cache.remove("CUT:" + days[i]);
      cache.remove("ASM:" + days[i]);
    }
  } catch (e) {}
  _memoClientsData_ = {};
  _memoCalendarRows_ = null;
  _memoPpPartnerIndex_ = null;
}

function bustCuttingCache_(dayName) {
  try {
    CacheService.getScriptCache().remove("CUT:" + String(dayName || "").toUpperCase());
  } catch (e) {}
}

/** Индекс ppPartner по matchKey — один проход календаря на запрос (вместо N×readAll). */
function getPpPartnerIndex_(ss) {
  if (_memoPpPartnerIndex_) return _memoPpPartnerIndex_;
  var idx = {};
  var all = [];
  try { all = readAllCalendarRows_(); } catch (e) { all = []; }
  for (var i = 0; i < all.length; i++) {
    var p = String(all[i].ppPartner || "").trim();
    if (!p) continue;
    var mk = all[i].matchKey || clientMatchKey_(all[i].client) || "";
    var cu = String(all[i].client || "").toUpperCase();
    var d = null;
    try {
      d = parseFlexibleDate_(all[i].date) || parseFlexibleDate_(all[i].dateIso);
    } catch (eD) {}
    var t = d && d.getTime ? d.getTime() : i;
    function put(k) {
      if (!k) return;
      var prev = idx[k];
      if (!prev || t >= prev.t) idx[k] = { p: p, t: t };
    }
    put(mk);
    put(cu);
  }
  var out = Object.create(null);
  Object.keys(idx).forEach(function (k) { out[k] = idx[k].p; });
  _memoPpPartnerIndex_ = out;
  return out;
}

function bustDeferredCache_(telegramId) {
  try {
    var cache = CacheService.getScriptCache();
    var tid = String(telegramId || "").trim();
    if (!tid) return;
    var statuses = ["open", "all", "cancelled", "enrolled"];
    for (var i = 0; i < statuses.length; i++) {
      cache.remove("DEF:" + tid + ":" + statuses[i]);
      cache.remove("DEF:" + tid + ":" + statuses[i] + ":L");
      cache.remove("DEF:" + tid + ":" + statuses[i] + ":T2");
      cache.remove("DEF:" + tid + ":" + statuses[i] + ":L:T2");
    }
  } catch (e) {}
}

function getCrmSheetValuesFast_(crmSs, sheetName) {
  var sid = "";
  try { sid = crmSs.getId(); } catch (eId) { sid = "x"; }
  var memoKey = sid + ":" + sheetName;
  if (_memoCrmSheets_[memoKey]) return _memoCrmSheets_[memoKey];
  var cacheKey = "CRM:" + String(sid).slice(-10) + ":" + sheetName;
  var hit = cacheGetJson_(cacheKey);
  if (hit && hit.length) {
    _memoCrmSheets_[memoKey] = hit;
    return hit;
  }
  var sh = findSheetByBaseName_(crmSs, sheetName);
  if (!sh || sh.getLastRow() < 2) {
    _memoCrmSheets_[memoKey] = null;
    return null;
  }
  var data = sh.getDataRange().getValues();
  _memoCrmSheets_[memoKey] = data;
  cachePutJson_(cacheKey, data, 60);
  return data;
}

function jsonpText(callback, obj) {
  var cb = callback || "callback";
  return ContentService.createTextOutput(cb + "(" + JSON.stringify(obj) + ")").setMimeType(ContentService.MimeType.TEXT);
}

function formatSheetDate(val, tz) {
  if (!val && val !== 0) return "";
  tz = tz || SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, tz, "dd.MM.yyyy");
  }
  var d = parseFlexibleDate_(val, tz);
  if (d) return Utilities.formatDate(d, tz, "dd.MM.yyyy");
  return String(val).trim();
}

function getCuttingItemMap_() {
  var rawMap = {
    "3": "4,5,6,7", "4": "8,9", "5": "10,11", "6": "12,13,14,15",
    "7": "16", "8": "17", "9": "18", "10": "19", "11": "20",
    "12": "21,22,23", "13": "24", "14": "25", "15": "26", "16": "27",
    "17": "28", "18": "29", "19": "30", "20": "31", "21": "32",
    "22": "33", "23": "34", "24": "35", "25": "36", "26": "37",
    "27": "38", "28": "39", "29": "40", "30": "41", "31": "42",
    "32": "43", "33": "44", "34": "45", "35": "46", "36": "47",
    "37": "48", "38": "49", "39": "50", "40": "51", "41": "52",
    "42": "53", "43": "54", "44": "55", "45": "56", "46": "57",
    "47": "58", "48": "59"
  };
  var itemMap = {};
  for (var key in rawMap) itemMap[key] = rawMap[key].split(",").map(Number);
  return itemMap;
}

function getDayDate_(ss, dayName) {
  var block = getDayBlock(dayName);
  if (!block) return null;
  var sheet = getTargetSheet(ss, block);
  if (!sheet) return null;
  if (block.sheet === "future") return sheet.getRange("A1").getValue();
  var index = Math.floor((block.start - 4) / 61);
  return sheet.getRange(MANAGER_DATE_CELLS[index]).getValue();
}

function findMemoryRow_(memorySheet, dateText, tz) {
  if (!memorySheet || memorySheet.getLastRow() < 1) return 0;
  var dates = memorySheet.getRange(1, 1, memorySheet.getLastRow(), 1).getValues();
  for (var i = 0; i < dates.length; i++) {
    if (formatSheetDate(dates[i][0], tz) === dateText) return i + 1;
  }
  return 0;
}

function getMemoryJson_(memorySheet, dateText, tz) {
  var row = findMemoryRow_(memorySheet, dateText, tz);
  if (!row) return null;
  try {
    return JSON.parse(memorySheet.getRange(row, 2).getValue());
  } catch (err) {
    return null;
  }
}

function saveMemoryJson_(memorySheet, dateText, value, tz) {
  if (!memorySheet) return;
  var row = findMemoryRow_(memorySheet, dateText, tz);
  if (row) memorySheet.getRange(row, 2).setValue(JSON.stringify(value));
  else memorySheet.appendRow([dateText, JSON.stringify(value)]);
}

/**
 * Жевалки / штучные SKU — даже без «шт» в названии (Склад!A17 = «БЫЧИЙ КОРЕНЬ»).
 * КНИЖКА — граммы, не сюда.
 */
function isPieceSkuName_(name) {
  var n = String(name || "");
  if (!n) return false;
  if (/шт/i.test(n)) return true;
  if (/ХРЯЩ|ЛОПАТ|ЛОП\s*ХРЯЩ/i.test(n)) return true;
  if (/КОЛЕН|КОПЫТ|НОСЫ|НОС\b|УХО|УШК|ШЕИ|ШЕЯ|ГУБЫ|ПЕРЕП[ЕЁ]?Л|АОРТ|ТРАХЕ|СТАНОВ|УТИН/i.test(n)) return true;
  if (/БЫЧ.*КОРЕН|КОРЕНЬ/i.test(n)) return true;
  return false;
}

/** Нарезка A3:A48 → Склад A2:A35 (фракции жевалок схлопываются в одну строку склада). */
function getWarehouseRowForCuttingRow_(cRow) {
  var MAP = {
    3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9, 11: 10,
    12: 11, 13: 12, 14: 13, 15: 14,
    16: 15, 17: 15, // УХО + ПОЛОВИНКА → УХО Г
    18: 16, // КОЛЕНИ
    19: 17, 20: 17, 21: 17, 22: 17, 23: 17, // БЫЧИЙ КОРЕНЬ
    24: 18, // ЛОП ХРЯЩ
    25: 19, 26: 19, 27: 19, 28: 19, 29: 19, // ТРАХЕЯ
    30: 20, // КОПЫТО
    31: 21, 32: 21, 33: 21, // СТАНОВАЯ ЖИЛА
    34: 22, 35: 22, // АОРТА
    36: 23, // УТИНЫЕ ШЕИ
    37: 24, // ГУБЫ
    38: 25, // НОСЫ
    39: 26, 40: 27, 41: 28, 42: 29,
    43: 30, 44: 31, 45: 32, 46: 33, 47: 34, 48: 35
  };
  var w = MAP[cRow];
  return w != null ? w : 0;
}

/** Склад: шт-строки = ряд 10 (перепёлки) и 15–25, либо имя жевалки. */
function isPieceWarehouseRow_(row, name) {
  var r = Number(row) || 0;
  if (r === 10 || (r >= 15 && r <= 25)) return true;
  return isPieceSkuName_(name);
}

/**
 * Жевалки с градацией: учётные шт склада, база = БОЛЬШОЙ (=1),
 * как в формулах Склад (становая: ПАЛК*0.25 + СРЕД*0.5 + БОЛ*1).
 * 1 ОГР = 2 БОЛ = 4 СРЕД = 8 МАЛ = 16 ОЧ МАЛ.
 */
function isGradedChewName_(name) {
  var u = String(name || "").toUpperCase().replace(/Ё/g, "Е");
  return /КОРЕН|ТРАХЕ|СТАНОВ|АОРТ|\bУХО\b|УХО\s*Г/.test(u);
}

function chewFractionStockFactor_(nameOrSub) {
  var u = String(nameOrSub || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
  if (!u) return 1;
  if (/ПОЛОВИН/.test(u)) return 0.5;
  if (/ОЧ\s*МАЛ|ОЧЕНЬ\s*(МАЛ|МЕЛК)|СУПЕР\s*(МАЛ|МЕЛК)/.test(u)) return 0.125;
  if (/ОГР|ОГРОМ|ГИГАНТ|РОГАЛ/.test(u)) return 2;
  if (/БОЛ|БОЛЬШ/.test(u)) return 1;
  if (/ПАЛК|ПАЛОЧ/.test(u)) return 0.25;
  if (/ПЛАСТ/.test(u)) return 0.5;
  if (/СРЕД/.test(u)) return 0.5;
  if (/(^|[^А-ЯA-Z0-9])МАЛ([^А-ЯA-Z0-9]|$)|МЕЛК/.test(u)) return 0.25;
  // целая аорта / ухо без фракции = 1
  return 1;
}

function chewStockFactorForCuttingName_(cutName) {
  if (!isGradedChewName_(cutName)) return 1;
  return chewFractionStockFactor_(cutName);
}

function chewStockFactorForBasketItem_(item) {
  var name = String((item && (item.name || item.main)) || "");
  if (!isGradedChewName_(name)) return 1;
  var sub = String((item && item.sub) || "");
  return chewFractionStockFactor_(sub || name);
}

function recalculateCuttingForDate_(ss, dateText) {
  var cutting = ss.getSheetByName("Нарезка");
  var manager = ss.getSheetByName("Прием заказов");
  var future = ss.getSheetByName("Будущая неделя");
  var tz = ss.getSpreadsheetTimeZone();
  var itemMap = getCuttingItemMap_();
  var totals = [];
  var sourceSheet = null;
  var offset = 0;
  var dayName = "";
  var block = null;

  if (future && formatSheetDate(future.getRange("A1").getValue(), tz) === dateText) {
    sourceSheet = future;
    dayName = "Будущая неделя";
    block = getDayBlock(dayName);
  } else if (manager) {
    for (var i = 0; i < MANAGER_DAY_NAMES_.length; i++) {
      if (formatSheetDate(manager.getRange(MANAGER_DATE_CELLS[i]).getValue(), tz) === dateText) {
        sourceSheet = manager;
        offset = i * 61;
        dayName = MANAGER_DAY_NAMES_[i];
        block = getDayBlock(dayName);
        break;
      }
    }
  }

  // 61+ строк: примечание «Будущей» на row 61 — раньше matrix=60 и skip [НЕ РЕЗАТЬ] не работал
  var matrixRows = sourceSheet === future ? 61 : 427;
  var matrix = sourceSheet ? sourceSheet.getRange(1, 3, matrixRows, 15).getValues() : null;
  var skipCols = noCutSkipColsForBlock_(sourceSheet, block);
  if (matrix && block && !Object.keys(skipCols).length) {
    var noteRowIdx = block.note - 1;
    if (noteRowIdx >= 0 && noteRowIdx < matrix.length) {
      for (var sc = 0; sc < 15; sc++) {
        if (/\[НЕ\s*РЕЗАТЬ\]/i.test(String(matrix[noteRowIdx][sc] || ""))) skipCols[sc] = true;
      }
    }
  }
  for (var cRow = 3; cRow <= 48; cRow++) {
    var total = 0;
    var rows = itemMap[cRow];
    if (matrix && rows) {
      for (var r = 0; r < rows.length; r++) {
        var rowIndex = rows[r] + offset - 1;
        if (rowIndex < 0 || rowIndex >= matrix.length) continue;
        for (var col = 0; col < 15; col++) {
          if (skipCols[col]) continue;
          total += Number(matrix[rowIndex][col]) || 0;
        }
      }
    }
    totals.push([total]);
  }
  if (cutting) cutting.getRange("B3:B48").setValues(totals);
  return totals;
}

/** Колонки C–Q (0..14) с [НЕ РЕЗАТЬ] в примечании блока дня. */
function noCutSkipColsForBlock_(sheet, block) {
  var skip = {};
  if (!sheet || !block) return skip;
  try {
    var notes = sheet.getRange(block.note, 3, 1, 15).getValues()[0] || [];
    for (var sc = 0; sc < 15; sc++) {
      if (/\[НЕ\s*РЕЗАТЬ\]/i.test(String(notes[sc] || ""))) skip[sc] = true;
    }
  } catch (eN) {}
  return skip;
}

function asBool_(v) {
  if (v === true || v === 1) return true;
  var s = String(v == null ? "" : v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "да" || s === "✓" || s === "✔";
}

function restoreCuttingState_(cutting, memorySheet, dateText, tz) {
  cutting.getRange("C3:C60").clearContent();
  cutting.getRange("E3:E60").setValue(false);
  cutting.getRange("F3:F60").setValue(false);
  cutting.getRange("G3:G60").setValue(false);
  var saved = getMemoryJson_(memorySheet, dateText, tz);
  if (!saved || !saved.length) return;
  var surplus = [];
  var laid = [];
  var done = [];
  var outNext = [];
  for (var i = 0; i < 58; i++) {
    var row = saved[i] || [];
    surplus.push([row[0] === undefined || row[0] === null ? "" : row[0]]);
    // формат: [surplus, _, laid, done, outNext]; старый done всегда в [3]
    laid.push([asBool_(row[2])]);
    done.push([asBool_(row[3])]);
    outNext.push([asBool_(row[4])]);
  }
  cutting.getRange("C3:C60").setValues(surplus);
  cutting.getRange("E3:E60").setValues(laid);
  cutting.getRange("F3:F60").setValues(done);
  cutting.getRange("G3:G60").setValues(outNext);
}

function saveCuttingState_(cutting, memorySheet, dateText, tz) {
  if (!cutting || !memorySheet || !dateText) return;
  try { SpreadsheetApp.flush(); } catch (eFl) {}
  var c = cutting.getRange("C3:C60").getValues();
  var e = cutting.getRange("E3:E60").getValues();
  var f = cutting.getRange("F3:F60").getValues();
  var g = cutting.getRange("G3:G60").getValues();
  var packed = [];
  for (var i = 0; i < 58; i++) {
    packed.push([
      c[i][0],
      "",
      asBool_(e[i][0]),
      asBool_(f[i][0]),
      asBool_(g[i][0])
    ]);
  }
  saveMemoryJson_(memorySheet, dateText, packed, tz);
}

// ===================== onEdit: Нарезка дата =====================

function onEdit(e) {
  var ss = e.source;
  var sheet = ss.getActiveSheet();
  var range = e.range;
  if (sheet.getName() !== "Нарезка" || range.getA1Notation() !== "A1") return;

  var sheetMemory = getMemoryCuttingSheet_();
  var tz = ss.getSpreadsheetTimeZone();
  var oldDateText = e.oldValue ? formatSheetDate(e.oldValue, tz) : "";
  var newDateText = range.getValue() ? formatSheetDate(range.getValue(), tz) : "";
  if (oldDateText) saveCuttingState_(sheet, sheetMemory, oldDateText, tz);
  restoreCuttingState_(sheet, sheetMemory, newDateText, tz);
  recalculateCuttingForDate_(ss, newDateText);
}

// ===================== Завершить неделю =====================

function finishFullWeekProduction(optSs, optOpts) {
  var opts = optOpts || {};
  var silent = !!opts.silent;
  var ss = optSs || SpreadsheetApp.getActiveSpreadsheet();
  var sheetCourier = ss.getSheetByName("Доставки");
  var sheetManager = ss.getSheetByName("Прием заказов");
  var sheetWarehouse = ss.getSheetByName("Склад");
  var sheetFuture = ss.getSheetByName("Будущая неделя");
  var sheetCutting = ss.getSheetByName("Нарезка");
  var tz = ss.getSpreadsheetTimeZone();

  if (!sheetCourier || !sheetManager || !sheetWarehouse || !sheetCutting) {
    var errSheets = { status: "error", message: "missing_sheets" };
    if (!silent) {
      try { Browser.msgBox("❌ Ошибка листов!"); } catch (e0) {}
    }
    return errSheets;
  }

  var dateVal = sheetCourier.getRange("A1").getValue();
  if (!dateVal) {
    var errDate = { status: "error", message: "missing_date" };
    if (!silent) {
      try { Browser.msgBox("❌ Ошибка даты!"); } catch (e1) {}
    }
    return errDate;
  }

  var today = dateVal instanceof Date ? dateVal : new Date();
  try { ensureManagerWeekendBlocks_(ss); } catch (eWk) {}
  var weekDaysGeo = [
    { start: 4, end: 59 },
    { start: 65, end: 120 },
    { start: 126, end: 181 },
    { start: 187, end: 242 },
    { start: 248, end: 303 },
    { start: 309, end: 364 },
    { start: 370, end: 425 }
  ];

  // Итоги недели — вкладка «Статистика» (getStats / Календарь_Дат / CRM).
  // Лист «Архив» больше не пишем и не создаём.

  var rawMap = {
    "3": "4,5,6,7",
    "4": "8,9",
    "5": "10,11",
    "6": "12,13,14,15",
    "7": "16",
    "8": "17",
    "9": "18",
    "10": "19",
    "11": "20",
    "12": "21,22,23",
    "13": "24",
    "14": "25",
    "15": "26",
    "16": "27",
    "17": "28",
    "18": "29",
    "19": "30",
    "20": "31",
    "21": "32",
    "22": "33",
    "23": "34",
    "24": "35",
    "25": "36",
    "26": "37",
    "27": "38",
    "28": "39",
    "29": "40",
    "30": "41",
    "31": "42",
    "32": "43",
    "33": "44",
    "34": "45",
    "35": "46",
    "36": "47",
    "37": "48",
    "38": "49",
    "39": "50",
    "40": "51",
    "41": "52",
    "42": "53",
    "43": "54",
    "44": "55",
    "45": "56",
    "46": "57",
    "47": "58",
    "48": "59"
  };
  var itemMap = {};
  for (var key in rawMap) {
    itemMap[key] = rawMap[key].split(",").map(Number);
  }

  var cuttingSurplusValues = sheetCutting.getRange("C3:C60").getValues();
  // один read матрицы на все дни + skip [НЕ РЕЗАТЬ]
  var fullManagerMatrix = sheetManager.getRange(1, 3, 427, 15).getValues();
  var noCutByDayOffset = {};
  for (var nd = 0; nd < weekDaysGeo.length; nd++) {
    var dayBlk = getDayBlock(weekDaysGeo[nd].name || weekDaysGeo[nd].day);
    if (!dayBlk) {
      // weekDaysGeo may use .start only — resolve by start row
      var st = Number(weekDaysGeo[nd].start) || 4;
      var di = Math.floor((st - 4) / 61);
      dayBlk = getDayBlock(MANAGER_DAY_NAMES_[di]);
    }
    noCutByDayOffset[weekDaysGeo[nd].start] = noCutSkipColsForBlock_(sheetManager, dayBlk);
  }
  for (var cRow = 3; cRow <= 48; cRow++) {
    var rowsToSum = itemMap[cRow.toString()];
    if (rowsToSum) {
      var wRow = getWarehouseRowForCuttingRow_(cRow);
      if (!wRow) continue;
      var totalGramsWeek = 0;
      weekDaysGeo.forEach(function (day) {
        var dayOffset = day.start - 4;
        var skipCols = noCutByDayOffset[day.start] || {};
        rowsToSum.forEach(function (rNum) {
          var targetRowIdx = rNum + dayOffset - 1;
          if (targetRowIdx < 0 || targetRowIdx >= fullManagerMatrix.length) return;
          for (var colM = 0; colM < 15; colM++) {
            if (skipCols[colM]) continue;
            totalGramsWeek += Number(fullManagerMatrix[targetRowIdx][colM]) || 0;
          }
        });
      });
      if (wRow <= 35 && wRow !== 10 && (wRow < 15 || wRow > 25)) {
        var dryPlanKg = totalGramsWeek / 1000;
        var currentLiveCoef = sheetWarehouse.getRange("D" + wRow).getValue() || 0.2;
        var cuttingSurplusKg = Number(cuttingSurplusValues[cRow - 3][0]) || 0;
        var totalRawSpentKg = dryPlanKg / currentLiveCoef + cuttingSurplusKg;
        var currentArrival = Number(sheetWarehouse.getRange("B" + wRow).getValue()) || 0;
        var currentRevision = Number(sheetWarehouse.getRange("F" + wRow).getValue()) || 0;
        sheetWarehouse.getRange("F" + wRow).setValue(Math.max(0, currentRevision + currentArrival - totalRawSpentKg));
        sheetWarehouse.getRange("B" + wRow).setValue(0);
      }
    }
  }

  // шт-остаток: неделя до Вс → в F берём Остаток Вс (M), не Пт (K)
  var pieceStockValues = sheetWarehouse.getRange("M15:M25").getValues();
  sheetWarehouse.getRange("F15:F25").setValues(pieceStockValues);
  sheetWarehouse.getRange("B15:B25").setValue(0);

  // Даты Вт–Вс = формулы =A1+N → двигаем только понедельник (+7)
  var mondayCell = sheetManager.getRange("A1");
  var oldManagerDate = mondayCell.getValue();
  if (oldManagerDate instanceof Date && !isNaN(oldManagerDate.getTime())) {
    var nextManagerDate = new Date(oldManagerDate);
    nextManagerDate.setDate(nextManagerDate.getDate() + 7);
    mondayCell.setValue(Utilities.formatDate(nextManagerDate, tz, "dd.MM.yyyy"));
  }
  // если на Вт–Вс стоят значения без формулы — тоже +7 (старый режим)
  for (var k = 1; k < MANAGER_DAY_NAMES_.length; k++) {
    var cellRef = MANAGER_DATE_CELLS[k];
    var cell = sheetManager.getRange(cellRef);
    var fml = String(cell.getFormula() || "").trim();
    if (fml && /A1/i.test(fml)) continue;
    var oldD = cell.getValue();
    if (oldD instanceof Date && !isNaN(oldD.getTime())) {
      var nextD = new Date(oldD);
      nextD.setDate(nextD.getDate() + 7);
      cell.setValue(Utilities.formatDate(nextD, tz, "dd.MM.yyyy"));
    }
  }

  var nextCourierDate = new Date(today);
  nextCourierDate.setDate(nextCourierDate.getDate() + 7);
  sheetCourier.getRange("A1").setValue(Utilities.formatDate(nextCourierDate, tz, "dd.MM.yyyy"));

  // Очистка всех блоков Пн–Вс: ники + товары + адрес + примечание
  Object.keys(DAY_BLOCKS).forEach(function (dayKey) {
    var b = DAY_BLOCKS[dayKey];
    if (b.sheet !== "manager") return;
    sheetManager.getRange(b.nick, 3, 1, 15).clearContent();
    sheetManager.getRange(b.start, 3, b.end - b.start + 1, 15).clearContent();
    sheetManager.getRange(b.addr, 3, 1, 15).clearContent();
    sheetManager.getRange(b.note, 3, 1, 15).clearContent();
  });

  // Перенос с «Будущей недели» включая адрес и примечание (C3:Q61)
  if (sheetFuture) {
    var futureData = sheetFuture.getRange("C3:Q61").getValues();
    sheetManager.getRange("C3:Q61").setValues(futureData);
    sheetFuture.getRange("C3:Q61").clearContent();
  }

  sheetCourier.getRange("C2:Q2").setValue(false);
  ["B4", "B8", "B10", "B12", "B21"].forEach(function (cell) {
    sheetCourier.getRange(cell).setValue("");
  });

  sheetCutting.getRange("F3:F60").setValue(false);
  sheetCutting.getRange("C3:C60").clearContent();
  sheetCutting.getRange("G3:G60").setValue(false);

  var newMondayDate = sheetManager.getRange("A1").getValue();
  sheetCutting.getRange("A1").setValue(newMondayDate);

  // Новая неделя: сразу записать людей из месяца/броней/CRM на лист (Пн–Вс + Будущая)
  var materializeInfo = null;
  try {
    SpreadsheetApp.flush();
    materializeInfo = materializeCurrentWeek_(ss, { onlyMissing: true, includeFuture: true });
  } catch (eMat) {
    materializeInfo = { ok: false, message: String(eMat), totalAdded: 0 };
  }

  var sheetMemory = getMemoryCuttingSheet_();
  if (sheetMemory && sheetMemory.getLastRow() > 0) {
    sheetMemory.getRange(1, 1, sheetMemory.getLastRow(), 2).clearContent();
  }
  var sheetMemCourier2 = getMemoryCourierSheet_();
  if (sheetMemCourier2 && sheetMemCourier2.getLastRow() > 0) {
    sheetMemCourier2.getRange(1, 1, sheetMemCourier2.getLastRow(), 2).clearContent();
  }

  try {
    sendTelegramSnabNotification();
  } catch (eSnab) {}
  if (!silent) {
    try { Browser.msgBox("🎉 СМЕНА ЗАКРЫТА!"); } catch (eOk) {}
  }
  return {
    status: "success",
    message: "week_closed",
    mondayDate: String(newMondayDate || ""),
    courierDate: Utilities.formatDate(nextCourierDate, tz, "dd.MM.yyyy"),
    materialize: materializeInfo,
    materializeAdded: materializeInfo ? (Number(materializeInfo.totalAdded) || 0) : 0
  };
}

function actorIsOwner_(telegramId) {
  var tid = String(telegramId || "").trim();
  if (!tid) return false;
  if (isOwnerId_(tid)) return true;
  var row = findAccessById_(tid);
  return !!(row && String(row.role || "").toLowerCase() === "owner" && String(row.status || "").toLowerCase() !== "denied");
}

function handleFinishFullWeek(json, callback, fromPost) {
  json = json || {};
  var tid = String(json.telegramId || "").trim();
  var confirm = String(json.confirm || "").trim();
  if (confirm !== "1" && confirm !== "true" && json.confirm !== true) {
    var need = { status: "error", message: "need_confirm" };
    return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
  }
  if (!actorIsOwner_(tid)) {
    var forbid = { status: "error", message: "owner_only" };
    return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result = finishFullWeekProduction(ss, { silent: true });
    try { bustClientsCache_(); } catch (eB) {}
    if (!result || result.status !== "success") {
      var bad = result || { status: "error", message: "finish_failed" };
      return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
    }
    try {
      var wkFin = normalizeWeekBannerKey_(String(json.weekKey || "").trim() || currentWeekKeyServer_());
      writeWeekBannerState_(wkFin, {
        finished: true,
        finishedAt: new Date().toISOString(),
        refused: false,
        pulled: true,
        by: tid
      });
      result.weekKey = wkFin;
      result.banner = readWeekBannerState_(wkFin);
    } catch (eW) {}
    try { notifyWeekFinished_(tid, result.weekKey || currentWeekKeyServer_(), result); } catch (eN) {}
    return fromPost ? jsonpText(callback, result) : jsonp(callback, result);
  } catch (err) {
    var fail = { status: "error", message: String(err) };
    return fromPost ? jsonpText(callback, fail) : jsonp(callback, fail);
  }
}

function weekBannerPropsKey_(weekKey) {
  return "week_banner_" + String(weekKey || "").trim();
}

/** Canon for banners: YYYY-MM-DD. Also accepts dd.MM.yyyy (legacy dateKey_). */
function normalizeWeekBannerKey_(weekKey) {
  var raw = String(weekKey || "").trim();
  if (!raw) return currentWeekKeyServer_();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  var m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    var dd = ("0" + m[1]).slice(-2);
    var mm = ("0" + m[2]).slice(-2);
    return m[3] + "-" + mm + "-" + dd;
  }
  return raw;
}

function readWeekBannerState_(weekKey) {
  var wk = normalizeWeekBannerKey_(weekKey);
  var props = null;
  try { props = PropertiesService.getScriptProperties(); } catch (e0) {}
  var raw = "";
  try { if (props) raw = props.getProperty(weekBannerPropsKey_(wk)) || ""; } catch (e) {}
  // migrate legacy key written as dd.MM.yyyy
  if (!raw && props) {
    try {
      var parts = wk.split("-");
      if (parts.length === 3) {
        var legacy = parts[2] + "." + parts[1] + "." + parts[0];
        raw = props.getProperty(weekBannerPropsKey_(legacy)) || "";
        if (raw) {
          try { props.setProperty(weekBannerPropsKey_(wk), raw); } catch (eMig) {}
          try { props.deleteProperty(weekBannerPropsKey_(legacy)); } catch (eDel) {}
        }
      }
    } catch (eL) {}
  }
  var st = { weekKey: wk, finished: false, pulled: false, refused: false, finishedAt: "", pulledAt: "", refusedAt: "", by: "" };
  if (!raw) return st;
  try {
    var o = JSON.parse(raw);
    if (o && typeof o === "object") {
      st.finished = !!o.finished;
      st.pulled = !!o.pulled;
      st.refused = !!o.refused;
      st.finishedAt = String(o.finishedAt || "");
      st.pulledAt = String(o.pulledAt || "");
      st.refusedAt = String(o.refusedAt || "");
      st.by = String(o.by || "");
    }
  } catch (e2) {}
  return st;
}

function writeWeekBannerState_(weekKey, patch) {
  var wk = normalizeWeekBannerKey_(weekKey);
  var st = readWeekBannerState_(wk);
  patch = patch || {};
  if (patch.finished != null) st.finished = !!patch.finished;
  if (patch.pulled != null) st.pulled = !!patch.pulled;
  if (patch.refused != null) st.refused = !!patch.refused;
  if (patch.finishedAt != null) st.finishedAt = String(patch.finishedAt || "");
  if (patch.pulledAt != null) st.pulledAt = String(patch.pulledAt || "");
  if (patch.refusedAt != null) st.refusedAt = String(patch.refusedAt || "");
  if (patch.by != null) st.by = String(patch.by || "");
  st.weekKey = wk;
  try {
    PropertiesService.getScriptProperties().setProperty(weekBannerPropsKey_(wk), JSON.stringify(st));
  } catch (e) {}
  return st;
}

/** weekKey = YYYY-MM-DD понедельника (как на клиенте). */
function currentWeekKeyServer_(optDate) {
  var d = optDate instanceof Date && !isNaN(optDate.getTime()) ? new Date(optDate.getTime()) : new Date();
  var day = d.getDay();
  var diff = (day === 0 ? -6 : 1 - day);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return Utilities.formatDate(d, "Europe/Minsk", "yyyy-MM-dd");
}

function handleGetWeekBannerState(json, callback, fromPost) {
  var wk = normalizeWeekBannerKey_((json && json.weekKey) || "");
  var st = readWeekBannerState_(wk);
  // не авто-ставить pulled по finished: ложный dismiss («Позже»/«Уже завершили»)
  // + suggestPull=false прятал и закрытие, и подтягивание на вс
  var ok = { status: "success", weekKey: wk, finished: st.finished, pulled: st.pulled, refused: st.refused, finishedAt: st.finishedAt, pulledAt: st.pulledAt, by: st.by };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function weekBannerFlagOn_(v) {
  return v === true || v === "1" || v === 1 || v === "true";
}
function weekBannerFlagOff_(v) {
  return v === false || v === "0" || v === 0 || v === "false" || v === "";
}

function handleSetWeekBannerState(json, callback, fromPost) {
  var wk = normalizeWeekBannerKey_((json && json.weekKey) || "");
  var patch = {};
  var now = new Date().toISOString();
  var tid = String((json && json.telegramId) || "").trim();
  if (weekBannerFlagOn_(json.finished)) {
    patch.finished = true;
    patch.finishedAt = now;
    patch.refused = false;
    if (tid) patch.by = tid;
  } else if (json.finished != null && weekBannerFlagOff_(json.finished)) {
    // сброс ложного «закрыли» (кнопка «Позже» / устаревший localStorage)
    patch.finished = false;
    patch.finishedAt = "";
  }
  if (weekBannerFlagOn_(json.pulled)) {
    patch.pulled = true;
    patch.pulledAt = now;
    if (tid) patch.by = tid;
  } else if (json.pulled != null && weekBannerFlagOff_(json.pulled)) {
    patch.pulled = false;
    patch.pulledAt = "";
  }
  if (weekBannerFlagOn_(json.refused)) {
    patch.refused = true;
    patch.refusedAt = now;
  } else if (json.refused != null && weekBannerFlagOff_(json.refused)) {
    patch.refused = false;
    patch.refusedAt = "";
  }
  var st = writeWeekBannerState_(wk, patch);
  var ok = { status: "success", weekKey: wk, finished: st.finished, pulled: st.pulled, refused: st.refused };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}


// ===================== HTTP API =====================

function doPost(e) {
  var callback = (e.parameter && e.parameter.callback) || "jsonp_callback";
  try {
    var json = JSON.parse(e.postData.contents);
    // Входящие апдейты Telegram (если webhook смотрит на этот же URL)
    if (json && (json.message || json.callback_query || json.edited_message || json.update_id != null)) {
      try {
        handleTelegramUpdate_(json);
      } catch (eTgPost) {
        try { Logger.log("tg doPost: " + eTgPost); } catch (eL) {}
      }
      // всегда быстро «ok», иначе Telegram ретраит update и сыплет сообщениями
      return ContentService.createTextOutput("ok");
    }
    return handleApiAction(json, callback, true);
  } catch (err) {
    return jsonpText(callback, { status: "error", message: String(err) });
  }
}

function doGet(e) {
  var callback = e.parameter.callback || "callback";
  if (!e.parameter.action) {
    return ContentService.createTextOutput('{"status":"online","msg":"Бэкенд Жив"}').setMimeType(ContentService.MimeType.TEXT);
  }

  var action = e.parameter.action;
  var payload = {
    action: action,
    day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "",
    client: e.parameter.client ? decodeURIComponent(e.parameter.client) : "",
    oldDay: e.parameter.oldDay ? decodeURIComponent(e.parameter.oldDay) : "",
    newDay: e.parameter.newDay ? decodeURIComponent(e.parameter.newDay) : "",
    date: e.parameter.date ? decodeURIComponent(e.parameter.date) : "",
    deliveryDate: e.parameter.deliveryDate ? decodeURIComponent(e.parameter.deliveryDate) : ""
  };

  // getClients — только чтение
  if (action === "getClients") {
    return handleGetClients(
      payload.day,
      callback,
      e.parameter.date ? decodeURIComponent(e.parameter.date) : ""
    );
  }
  if (action === "getWeekDayCounts") {
    return handleGetWeekDayCounts({}, callback, false);
  }
  if (action === "inspectManagerFormulas") {
    return handleInspectManagerFormulas({}, callback, false);
  }
  if (action === "setupWeekendFormulas") {
    return handleSetupWeekendFormulas({
      telegramId: e.parameter.telegramId || ""
    }, callback, false);
  }
  if (action === "getMonthOverview") {
    return handleGetMonthOverview({
      month: e.parameter.month ? decodeURIComponent(e.parameter.month) : ""
    }, callback, false);
  }
  if (action === "getCutting") {
    return handleGetCutting(payload.day, callback);
  }
  if (action === "updateCutting") {
    return handleUpdateCutting(SpreadsheetApp.getActiveSpreadsheet(), {
      day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "",
      row: e.parameter.row,
      done: e.parameter.done,
      laid: e.parameter.laid,
      surplus: e.parameter.surplus,
      outNext: e.parameter.outNext
    }, callback, false);
  }
  if (action === "startCuttingSession") {
    return handleStartCuttingSession({
      day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "",
      startedAt: e.parameter.startedAt || ""
    }, callback, false);
  }
  if (action === "stopCuttingSession") {
    return handleStopCuttingSession({ day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "" }, callback, false);
  }
  if (action === "finishCutting") {
    return handleFinishCutting(SpreadsheetApp.getActiveSpreadsheet(), {
      day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "",
      ticket: e.parameter.ticket || "",
      elapsed: e.parameter.elapsed || "",
      flags: e.parameter.flags ? decodeURIComponent(e.parameter.flags) : "",
      readyRows: e.parameter.readyRows || "",
      missing: e.parameter.missing ? decodeURIComponent(e.parameter.missing) : ""
    }, callback, false);
  }
  if (action === "setupTelegramWebhook") {
    return handleSetupTelegramWebhook(callback, false);
  }
  if (action === "getCourier") {
    return handleGetCourier(payload.day, callback);
  }
  if (action === "getCouriers") {
    return handleGetCouriers(callback, false);
  }
  if (action === "suggestAddress") {
    return handleSuggestAddress({
      text: e.parameter.text ? decodeURIComponent(e.parameter.text) : "",
      q: e.parameter.q ? decodeURIComponent(e.parameter.q) : ""
    }, callback, false);
  }
  if (action === "sendCourierRoute") {
    return handleSendCourierRoute({
      telegramId: e.parameter.telegramId || e.parameter.chatId || e.parameter.id || "",
      text: e.parameter.text ? decodeURIComponent(e.parameter.text) : "",
      ticket: e.parameter.ticket || ""
    }, callback, false);
  }
  if (action === "telegramStatus") {
    return handleTelegramStatus(callback, false);
  }
  if (action === "listBookings") {
    return handleListBookings({
      date: e.parameter.date ? decodeURIComponent(e.parameter.date) : "",
      from: e.parameter.from ? decodeURIComponent(e.parameter.from) : "",
      to: e.parameter.to ? decodeURIComponent(e.parameter.to) : ""
    }, callback, false);
  }
  if (action === "ensureDayMaterialized") {
    return handleEnsureDayMaterialized({
      date: e.parameter.date ? decodeURIComponent(e.parameter.date) : "",
      deliveryDate: e.parameter.deliveryDate ? decodeURIComponent(e.parameter.deliveryDate) : "",
      day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "",
      onlyMissing: e.parameter.onlyMissing
    }, callback, false);
  }
  if (action === "getViewCompare") {
    return handleGetViewCompare({
      day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "",
      date: e.parameter.date ? decodeURIComponent(e.parameter.date) : "",
      deliveryDate: e.parameter.deliveryDate ? decodeURIComponent(e.parameter.deliveryDate) : ""
    }, callback, false);
  }
  if (action === "pullClientFromMonth") {
    return handlePullClientFromMonth({
      day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "",
      date: e.parameter.date ? decodeURIComponent(e.parameter.date) : "",
      deliveryDate: e.parameter.deliveryDate ? decodeURIComponent(e.parameter.deliveryDate) : "",
      client: e.parameter.client ? decodeURIComponent(e.parameter.client) : "",
      address: e.parameter.address ? decodeURIComponent(e.parameter.address) : "",
      phone: e.parameter.phone ? decodeURIComponent(e.parameter.phone) : "",
      note: e.parameter.note ? decodeURIComponent(e.parameter.note) : "",
      clients: e.parameter.clients ? decodeURIComponent(e.parameter.clients) : ""
    }, callback, false);
  }
  if (action === "pullClientsFromMonth") {
    return handlePullClientsFromMonth({
      day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "",
      date: e.parameter.date ? decodeURIComponent(e.parameter.date) : "",
      deliveryDate: e.parameter.deliveryDate ? decodeURIComponent(e.parameter.deliveryDate) : "",
      clients: e.parameter.clients ? decodeURIComponent(e.parameter.clients) : ""
    }, callback, false);
  }
  if (action === "materializeWeek") {
    return handleMaterializeWeek({
      onlyMissing: e.parameter.onlyMissing,
      includeFuture: e.parameter.includeFuture,
      weekKey: e.parameter.weekKey ? decodeURIComponent(e.parameter.weekKey) : ""
    }, callback, false);
  }
  if (action === "weekPullStatus") {
    return handleWeekPullStatus({}, callback, false);
  }
  if (action === "resolveDayForDate") {
    return handleResolveDayForDate({
      date: e.parameter.date ? decodeURIComponent(e.parameter.date) : "",
      deliveryDate: e.parameter.deliveryDate ? decodeURIComponent(e.parameter.deliveryDate) : ""
    }, callback, false);
  }
  if (action === "migrateCalendar") {
    return handleMigrateCalendar({
      full: e.parameter.full || "",
      months: e.parameter.months || "",
      year: e.parameter.year || ""
    }, callback, false);
  }
  if (action === "removeCalendarClient") {
    return handleRemoveCalendarClient({
      date: e.parameter.date ? decodeURIComponent(e.parameter.date) : "",
      client: e.parameter.client ? decodeURIComponent(e.parameter.client) : "",
      matchKey: e.parameter.matchKey ? decodeURIComponent(e.parameter.matchKey) : ""
    }, callback, false);
  }
  if (action === "getStats") {
    return handleGetStats({
      period: e.parameter.period || "month",
      month: e.parameter.month || e.parameter.monthKey || "",
      force: e.parameter.force || "",
      mode: e.parameter.mode || "",
      expected: e.parameter.expected || "",
      from: e.parameter.from || e.parameter.fromDate || e.parameter.dateFrom || "",
      to: e.parameter.to || e.parameter.toDate || e.parameter.dateTo || ""
    }, callback, false);
  }
  if (action === "getExpectedProfit") {
    return handleGetExpectedProfit({
      from: e.parameter.from || e.parameter.fromDate || e.parameter.dateFrom || "",
      to: e.parameter.to || e.parameter.toDate || e.parameter.dateTo || ""
    }, callback, false);
  }
  if (action === "exportStats") {
    return handleExportStats({
      format: e.parameter.format || "accountant"
    }, callback, false);
  }
  if (action === "listSurvey") {
    return handleListSurvey({
      status: e.parameter.status ? decodeURIComponent(e.parameter.status) : "",
      kind: e.parameter.kind ? decodeURIComponent(e.parameter.kind) : "",
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : (e.parameter.client ? decodeURIComponent(e.parameter.client) : ""),
      sheet: e.parameter.sheet ? decodeURIComponent(e.parameter.sheet) : "",
      segment: e.parameter.segment ? decodeURIComponent(e.parameter.segment) : "",
      activeOnly: e.parameter.activeOnly,
      includeOld: e.parameter.includeOld,
      purge: e.parameter.purge
    }, callback, false);
  }
  if (action === "repairSurveys") {
    return handleRepairSurveys({
      telegramId: e.parameter.telegramId || e.parameter.chatId || ""
    }, callback, false);
  }
  if (action === "saveSurvey") {
    return handleSaveSurvey({
      id: e.parameter.id || "",
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : (e.parameter.client ? decodeURIComponent(e.parameter.client) : ""),
      stage: e.parameter.stage ? decodeURIComponent(e.parameter.stage) : "",
      kind: e.parameter.kind || e.parameter.surveyKind || "bp2",
      dueDate: e.parameter.dueDate || e.parameter.surveyDate || "",
      sentAt: e.parameter.sentAt || "",
      status: e.parameter.status || "planned",
      templateId: e.parameter.templateId || "",
      answer: e.parameter.answer ? decodeURIComponent(e.parameter.answer) : "",
      note: e.parameter.note ? decodeURIComponent(e.parameter.note) : "",
      linkedSubId: e.parameter.linkedSubId || e.parameter.subId || "",
      ownerTelegramId: e.parameter.ownerTelegramId || e.parameter.respTelegramId || "",
      ownerName: e.parameter.ownerName ? decodeURIComponent(e.parameter.ownerName) : (e.parameter.respName ? decodeURIComponent(e.parameter.respName) : "")
    }, callback, false);
  }
  if (action === "deleteSurvey") {
    return handleDeleteSurvey({
      id: e.parameter.id || "",
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : "",
      kind: e.parameter.kind || "",
      status: "cancelled"
    }, callback, false);
  }
  if (action === "deleteSurveyBatch") {
    return handleDeleteSurveyBatch({
      ids: e.parameter.ids ? decodeURIComponent(e.parameter.ids) : "",
      nicks: e.parameter.nicks ? decodeURIComponent(e.parameter.nicks) : "",
      id: e.parameter.id || "",
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : ""
    }, callback, false);
  }
  if (action === "forceSurveyRemind") {
    return handleForceSurveyRemind({
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : (e.parameter.client ? decodeURIComponent(e.parameter.client) : "")
    }, callback, false);
  }
  if (action === "getPpFactCost") {
    return handleGetPpFactCost({
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : "",
      client: e.parameter.client ? decodeURIComponent(e.parameter.client) : "",
      day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "",
      date: e.parameter.date ? decodeURIComponent(e.parameter.date) : ""
    }, callback, false);
  }
  if (action === "getPpOrderSuggest") {
    return handleGetPpOrderSuggest({
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : "",
      client: e.parameter.client ? decodeURIComponent(e.parameter.client) : "",
      day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "",
      date: e.parameter.date ? decodeURIComponent(e.parameter.date) : "",
      deliverySlot: e.parameter.deliverySlot || e.parameter.slot || "",
      ppSlot: e.parameter.ppSlot ? decodeURIComponent(e.parameter.ppSlot) : ""
    }, callback, false);
  }
  if (action === "setupBookingTriggers") {
    return handleSetupBookingTriggers(callback, false);
  }
  if (action === "setupDeliveryDatesNudgeTriggers") {
    return handleSetupDeliveryDatesNudgeTriggers(callback, false);
  }
  if (action === "testDeliveryDatesNudge") {
    return handleTestDeliveryDatesNudge(callback, false);
  }
  if (action === "getMyAccess") {
    return handleGetMyAccess({
      telegramId: e.parameter.telegramId || "",
      name: e.parameter.name ? decodeURIComponent(e.parameter.name) : "",
      username: e.parameter.username ? decodeURIComponent(e.parameter.username) : "",
      initData: e.parameter.initData ? decodeURIComponent(e.parameter.initData) : ""
    }, callback, false);
  }
  if (action === "getNativeLinkInfo") {
    return handleGetNativeLinkInfo(callback, false);
  }
  if (action === "pollNativeAuth") {
    return handlePollNativeAuth({
      token: e.parameter.token ? decodeURIComponent(e.parameter.token) : ""
    }, callback, false);
  }
  if (action === "listAccess") {
    return handleListAccess({ telegramId: e.parameter.telegramId || "" }, callback, false);
  }
  if (action === "listPartners") {
    return handleListPartners({
      all: e.parameter.all || "",
      telegramId: e.parameter.telegramId || ""
    }, callback, false);
  }
  if (action === "savePartner") {
    return handleSavePartner({
      id: e.parameter.id || "",
      name: e.parameter.name ? decodeURIComponent(e.parameter.name) : "",
      note: e.parameter.note ? decodeURIComponent(e.parameter.note) : "",
      active: e.parameter.active
    }, callback, false);
  }
  if (action === "deletePartner") {
    return handleDeletePartner({
      id: e.parameter.id || "",
      name: e.parameter.name ? decodeURIComponent(e.parameter.name) : ""
    }, callback, false);
  }
  if (action === "partnerListAdmin") {
    return handlePartnerListAdmin({ telegramId: e.parameter.telegramId || "" }, callback, false);
  }
  if (action === "partnerGetMe") {
    return handlePartnerGetMe({
      username: e.parameter.username ? decodeURIComponent(e.parameter.username) : "",
      telegramId: e.parameter.telegramId || "",
      initData: e.parameter.initData ? decodeURIComponent(e.parameter.initData) : ""
    }, callback, false);
  }
  if (action === "partnerSaveNetwork") {
    return handlePartnerSaveNetwork({
      telegramId: e.parameter.telegramId || "",
      id: e.parameter.id || "",
      name: e.parameter.name ? decodeURIComponent(e.parameter.name) : "",
      logo: e.parameter.logo ? decodeURIComponent(e.parameter.logo) : "",
      active: e.parameter.active
    }, callback, false);
  }
  if (action === "partnerSavePoint") {
    return handlePartnerSavePoint({
      telegramId: e.parameter.telegramId || "",
      id: e.parameter.id || "",
      networkId: e.parameter.networkId || "",
      name: e.parameter.name ? decodeURIComponent(e.parameter.name) : "",
      address: e.parameter.address ? decodeURIComponent(e.parameter.address) : "",
      active: e.parameter.active
    }, callback, false);
  }
  if (action === "partnerSaveAccess") {
    return handlePartnerSaveAccess({
      telegramId: e.parameter.telegramId || "",
      id: e.parameter.id || "",
      username: e.parameter.username ? decodeURIComponent(e.parameter.username) : "",
      targetTelegramId: e.parameter.targetTelegramId || e.parameter.staffTelegramId || "",
      name: e.parameter.name ? decodeURIComponent(e.parameter.name) : "",
      networkId: e.parameter.networkId || "",
      pointIds: e.parameter.pointIds ? decodeURIComponent(e.parameter.pointIds) : "",
      role: e.parameter.role || "partner",
      status: e.parameter.status || "active",
      actorRole: e.parameter.actorRole || ""
    }, callback, false);
  }
  if (action === "partnerRevokeAccess") {
    return handlePartnerRevokeAccess({
      telegramId: e.parameter.telegramId || "",
      id: e.parameter.id || "",
      username: e.parameter.username ? decodeURIComponent(e.parameter.username) : ""
    }, callback, false);
  }
  if (action === "partnerSeedDefaults") {
    return handlePartnerSeedDefaults({ telegramId: e.parameter.telegramId || "", force: e.parameter.force || "" }, callback, false);
  }
  if (action === "partnerSetNotifyRecipients") {
    return handlePartnerSetNotifyRecipients({
      telegramId: e.parameter.telegramId || "",
      recipients: e.parameter.recipients ? decodeURIComponent(e.parameter.recipients) : "[]"
    }, callback, false);
  }
  if (action === "partnerSubmitOrder") {
    return handlePartnerSubmitOrder({
      telegramId: e.parameter.telegramId || "",
      username: e.parameter.username ? decodeURIComponent(e.parameter.username) : "",
      userName: e.parameter.userName ? decodeURIComponent(e.parameter.userName) : "",
      locationId: e.parameter.locationId || "",
      locationName: e.parameter.locationName ? decodeURIComponent(e.parameter.locationName) : "",
      networkId: e.parameter.networkId || "",
      basket: e.parameter.basket ? decodeURIComponent(e.parameter.basket) : (e.parameter.basketJson ? decodeURIComponent(e.parameter.basketJson) : "[]")
    }, callback, false);
  }
  if (action === "partnerListMyOrders") {
    return handlePartnerListMyOrders({
      telegramId: e.parameter.telegramId || "",
      username: e.parameter.username ? decodeURIComponent(e.parameter.username) : ""
    }, callback, false);
  }
  if (action === "setAccessTimezone") {
    return handleSetAccessTimezone({
      actorId: e.parameter.actorId || e.parameter.telegramId || "",
      targetId: e.parameter.targetId || "",
      timezone: e.parameter.timezone ? decodeURIComponent(e.parameter.timezone) : ""
    }, callback, false);
  }
  if (action === "listReminderPeople") {
    return handleListReminderPeople_({ telegramId: e.parameter.telegramId || "" }, callback, false);
  }
  if (action === "getWarehouse") {
    return handleGetWarehouse({}, callback, false);
  }
  if (action === "applyWarehouseRevision") {
    var itemsG = e.parameter.items ? decodeURIComponent(e.parameter.items) : "[]";
    return handleApplyWarehouseRevision({ items: itemsG, note: e.parameter.note || "" }, callback, false);
  }
  if (action === "warehousePreview") {
    return handleWarehousePreview({
      dateFrom: e.parameter.dateFrom || "",
      dateTo: e.parameter.dateTo || "",
      force: e.parameter.force || ""
    }, callback, false);
  }
  if (action === "composeWarehouseBuyMessage") {
    return handleComposeWarehouseBuyMessage({
      force: e.parameter.force || "",
      refresh: e.parameter.refresh || "",
      dateFrom: e.parameter.dateFrom || "",
      dateTo: e.parameter.dateTo || ""
    }, callback, false);
  }
  if (action === "lookupBpPartner") {
    return handleLookupBpPartner({ nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : "" }, callback, false);
  }
  if (action === "listSubscriptions") {
    return handleListSubscriptions({
      sheet: e.parameter.sheet ? decodeURIComponent(e.parameter.sheet) : "",
      segment: e.parameter.segment ? decodeURIComponent(e.parameter.segment) : "",
      repairIds: e.parameter.repairIds || ""
    }, callback, false);
  }
  if (action === "repairSubscriptionIds") {
    return handleRepairSubscriptionIds({
      sheet: e.parameter.sheet ? decodeURIComponent(e.parameter.sheet) : "",
      segment: e.parameter.segment ? decodeURIComponent(e.parameter.segment) : ""
    }, callback, false);
  }
  if (action === "getSubscription") {
    return handleGetSubscription({
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : "",
      subId: e.parameter.subId ? decodeURIComponent(e.parameter.subId) : "",
      segment: e.parameter.segment ? decodeURIComponent(e.parameter.segment) : ""
    }, callback, false);
  }
  if (action === "saveSubscription") {
    return handleSaveSubscription({
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : "",
      label: e.parameter.label ? decodeURIComponent(e.parameter.label) : "",
      subId: e.parameter.subId ? decodeURIComponent(e.parameter.subId) : "",
      sheet: e.parameter.sheet ? decodeURIComponent(e.parameter.sheet) : "",
      segment: e.parameter.segment ? decodeURIComponent(e.parameter.segment) : "",
      deliveries: e.parameter.deliveries,
      ppStatus: e.parameter.ppStatus ? decodeURIComponent(e.parameter.ppStatus) : "",
      wishes: e.parameter.wishes ? decodeURIComponent(e.parameter.wishes) : "",
      address: e.parameter.address ? decodeURIComponent(e.parameter.address) : "",
      phone: e.parameter.phone ? decodeURIComponent(e.parameter.phone) : "",
      note: e.parameter.note ? decodeURIComponent(e.parameter.note) : "",
      factCost: e.parameter.factCost || "",
      statedCost: e.parameter.statedCost || ""
    }, callback, false);
  }
  
  if (action === "closeAllOpenDeficits") {
    return handleCloseAllOpenDeficits({
      telegramId: e.parameter.telegramId || e.parameter.chatId || e.parameter.id || ""
    }, callback, false);
  }
  if (action === "ensureBpFromOrder") {
    return handleEnsureBpFromOrder({
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : (e.parameter.client ? decodeURIComponent(e.parameter.client) : ""),
      basket: (function () {
        try {
          return e.parameter.basket ? JSON.parse(decodeURIComponent(e.parameter.basket)) : [];
        } catch (eBp) {
          return [];
        }
      })(),
      createCard: e.parameter.createCard,
      surveyDate: e.parameter.surveyDate || "",
      surveyKind: e.parameter.surveyKind || "bp2",
      needSurvey: e.parameter.needSurvey || "",
      compositionDate: e.parameter.compositionDate || e.parameter.deliveryDate || e.parameter.date || "",
      wishes: e.parameter.wishes ? decodeURIComponent(e.parameter.wishes) : "",
      subId: e.parameter.subId || "",
      status: e.parameter.status || e.parameter.stage || "",
      deliveriesN: e.parameter.deliveriesN || e.parameter.deliveries || 1,
      address: e.parameter.address ? decodeURIComponent(e.parameter.address) : "",
      phone: e.parameter.phone ? decodeURIComponent(e.parameter.phone) : "",
      displayName: e.parameter.displayName ? decodeURIComponent(e.parameter.displayName) : "",
      note: e.parameter.note ? decodeURIComponent(e.parameter.note) : "",
      ownerTelegramId: e.parameter.ownerTelegramId || e.parameter.respTelegramId || "",
      ownerName: e.parameter.ownerName ? decodeURIComponent(e.parameter.ownerName) : (e.parameter.respName ? decodeURIComponent(e.parameter.respName) : "")
    }, callback, false);
  }
  if (action === "listBpIdle") {
    return handleListBpIdle({
      days: e.parameter.days || 7
    }, callback, false);
  }

  if (action === "listTemplates") {
    return handleListTemplates({
      kind: e.parameter.kind ? decodeURIComponent(e.parameter.kind) : ""
    }, callback, false);
  }
  if (action === "saveTemplate") {
    var tplTitle = String(e.parameter.title || "");
    var tplBody = String(e.parameter.body || "");
    // GAS уже URL-decode'ит e.parameter — повторный decodeURIComponent ломает текст с «%»
    try {
      if (e.parameter.titleB64) {
        tplTitle = Utilities.newBlob(Utilities.base64Decode(String(e.parameter.titleB64))).getDataAsString("UTF-8");
      }
    } catch (eTb) {}
    try {
      if (e.parameter.bodyB64) {
        tplBody = Utilities.newBlob(Utilities.base64Decode(String(e.parameter.bodyB64))).getDataAsString("UTF-8");
      }
    } catch (eBb) {}
    return handleSaveTemplate({
      id: String(e.parameter.id || ""),
      kind: String(e.parameter.kind || ""),
      title: tplTitle,
      body: tplBody,
      telegramId: String(e.parameter.telegramId || e.parameter.chatId || "")
    }, callback, false);
  }
  if (action === "deleteTemplate") {
    return handleDeleteTemplate({
      id: String(e.parameter.id || ""),
      telegramId: String(e.parameter.telegramId || e.parameter.chatId || "")
    }, callback, false);
  }
  if (action === "syncSurveyTemplates") {
    return handleSyncSurveyTemplates({
      telegramId: e.parameter.telegramId || e.parameter.chatId || ""
    }, callback, false);
  }

  if (action === "moveSubscription") {
    return handleMoveSubscription({
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : "",
      subId: e.parameter.subId ? decodeURIComponent(e.parameter.subId) : "",
      fromSheet: e.parameter.fromSheet ? decodeURIComponent(e.parameter.fromSheet) : "",
      toSheet: e.parameter.toSheet ? decodeURIComponent(e.parameter.toSheet) : "",
      sheet: e.parameter.sheet ? decodeURIComponent(e.parameter.sheet) : ""
    }, callback, false);
  }
  if (action === "deleteSubscription") {
    return handleDeleteSubscription({
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : "",
      subId: e.parameter.subId ? decodeURIComponent(e.parameter.subId) : "",
      sheet: e.parameter.sheet ? decodeURIComponent(e.parameter.sheet) : "",
      segment: e.parameter.segment ? decodeURIComponent(e.parameter.segment) : ""
    }, callback, false);
  }
  if (action === "deleteSubscriptionBatch") {
    var batchItems = [];
    try {
      if (e.parameter.items) batchItems = JSON.parse(e.parameter.items);
    } catch (eBi) {
      try { batchItems = JSON.parse(decodeURIComponent(e.parameter.items || "[]")); } catch (eBi2) { batchItems = []; }
    }
    return handleDeleteSubscriptionBatch({
      items: batchItems,
      sheet: e.parameter.sheet || "",
      segment: e.parameter.segment || ""
    }, callback, false);
  }
  if (action === "getAssembly") {
    return handleGetAssembly({
      day: e.parameter.day ? decodeURIComponent(e.parameter.day) : ""
    }, callback, false);
  }
  if (action === "findClientMatch") {
    return handleFindClientMatch({
      q: e.parameter.q ? decodeURIComponent(e.parameter.q) : "",
      client: e.parameter.client ? decodeURIComponent(e.parameter.client) : ""
    }, callback, false);
  }
  if (action === "listClientProfiles") {
    return handleListClientProfiles({}, callback, false);
  }
  if (action === "crmInventory") {
    return handleCrmInventory({}, callback, false);
  }
  if (action === "seedCrmClients") {
    return handleSeedCrmClients({}, callback, false);
  }
  if (action === "calcPrice") {
    return handleCalcPrice({
      mode: e.parameter.mode || "subscription",
      basket: e.parameter.basket ? JSON.parse(decodeURIComponent(e.parameter.basket)) : [],
      deliveriesN: e.parameter.deliveriesN || e.parameter.deliveries || "",
      fullFact: e.parameter.fullFact || "",
      coef: e.parameter.coef || e.parameter.markup || "",
      markup: e.parameter.markup || e.parameter.coef || ""
    }, callback, false);
  }
  if (action === "calcPpFact") {
    return handleCalcPpFact({
      basket: e.parameter.basket ? JSON.parse(decodeURIComponent(e.parameter.basket)) : [],
      deliveriesN: e.parameter.deliveriesN || e.parameter.deliveries || "1",
      coef: e.parameter.coef || e.parameter.markup || "",
      packCounts: e.parameter.packCounts ? JSON.parse(decodeURIComponent(e.parameter.packCounts)) : null
    }, callback, false);
  }
  if (action === "listDeferred") {
    return handleDeferredAction_("listDeferred", {
      telegramId: e.parameter.telegramId ? decodeURIComponent(e.parameter.telegramId) : "",
      status: e.parameter.status ? decodeURIComponent(e.parameter.status) : "open",
      light: e.parameter.light || "1"
    }, callback, false);
  }
  if (action === "notifyMissedDelivery") {
    return handleDeferredAction_("notifyMissedDelivery", {
      telegramId: e.parameter.telegramId ? decodeURIComponent(e.parameter.telegramId) : "",
      client: e.parameter.client ? decodeURIComponent(e.parameter.client) : "",
      day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "",
      date: e.parameter.date ? decodeURIComponent(e.parameter.date) : "",
      reason: e.parameter.reason ? decodeURIComponent(e.parameter.reason) : "",
      segment: e.parameter.segment ? decodeURIComponent(e.parameter.segment) : "",
      matchKey: e.parameter.matchKey ? decodeURIComponent(e.parameter.matchKey) : "",
      basket: e.parameter.basket ? decodeURIComponent(e.parameter.basket) : "",
      createdByName: e.parameter.createdByName ? decodeURIComponent(e.parameter.createdByName) : ""
    }, callback, false);
  }
  if (action === "getTransferTask") {
    return handleDeferredAction_("getTransferTask", {
      telegramId: e.parameter.telegramId ? decodeURIComponent(e.parameter.telegramId) : "",
      id: e.parameter.id ? decodeURIComponent(e.parameter.id) : ""
    }, callback, false);
  }
  if (action === "saveDeferred") {
    var defPayload = {};
    try {
      defPayload = e.parameter.payload ? JSON.parse(decodeURIComponent(e.parameter.payload)) : {};
    } catch (eDefP) { defPayload = {}; }
    return handleDeferredAction_("saveDeferred", {
      telegramId: e.parameter.telegramId ? decodeURIComponent(e.parameter.telegramId) : "",
      id: e.parameter.id ? decodeURIComponent(e.parameter.id) : "",
      mode: e.parameter.mode ? decodeURIComponent(e.parameter.mode) : "pp",
      title: e.parameter.title ? decodeURIComponent(e.parameter.title) : "",
      clientNick: e.parameter.clientNick ? decodeURIComponent(e.parameter.clientNick) : "",
      remindAt: e.parameter.remindAt ? decodeURIComponent(e.parameter.remindAt) : "",
      remindAtMs: e.parameter.remindAtMs || "",
      targetTelegramId: e.parameter.targetTelegramId ? decodeURIComponent(e.parameter.targetTelegramId) : "",
      targetName: e.parameter.targetName ? decodeURIComponent(e.parameter.targetName) : "",
      createdByName: e.parameter.createdByName ? decodeURIComponent(e.parameter.createdByName) : "",
      payload: defPayload
    }, callback, false);
  }
  if (action === "cancelDeferred") {
    return handleDeferredAction_("cancelDeferred", {
      telegramId: e.parameter.telegramId ? decodeURIComponent(e.parameter.telegramId) : "",
      id: e.parameter.id ? decodeURIComponent(e.parameter.id) : "",
      status: "cancelled"
    }, callback, false);
  }
  if (action === "setDeferredReminder") {
    return handleDeferredAction_("setDeferredReminder", {
      telegramId: e.parameter.telegramId ? decodeURIComponent(e.parameter.telegramId) : "",
      id: e.parameter.id ? decodeURIComponent(e.parameter.id) : "",
      remindAt: e.parameter.remindAt ? decodeURIComponent(e.parameter.remindAt) : "",
      remindAtMs: e.parameter.remindAtMs || ""
    }, callback, false);
  }

  // delete / move / saveOrder / saveBooking — и через GET (JSONP из mini-app; POST в Telegram часто молчит)
  if (action === "deleteClient" || action === "moveClient") {
    payload.cutRaw = e.parameter.cutRaw;
    payload.matchKey = e.parameter.matchKey ? decodeURIComponent(e.parameter.matchKey) : "";
    payload.oldDate = e.parameter.oldDate ? decodeURIComponent(e.parameter.oldDate) : "";
    payload.newDate = e.parameter.newDate ? decodeURIComponent(e.parameter.newDate) : "";
    payload.dateOnly = e.parameter.dateOnly || "";
    payload.calendarOnly = e.parameter.calendarOnly || "";
    return handleApiAction(payload, callback, false);
  }
  if (action === "saveOrder") {
    var basketOrd = [];
    try {
      basketOrd = e.parameter.basket ? JSON.parse(decodeURIComponent(e.parameter.basket)) : [];
    } catch (eBo) { basketOrd = []; }
    var geoOrd = null;
    try {
      geoOrd = e.parameter.geo ? JSON.parse(decodeURIComponent(e.parameter.geo)) : null;
    } catch (eGo) { geoOrd = null; }
    var surveyOrd = null;
    try {
      surveyOrd = e.parameter.survey ? JSON.parse(decodeURIComponent(e.parameter.survey)) : null;
    } catch (eSu) { surveyOrd = null; }
    return handleSaveOrder(SpreadsheetApp.getActiveSpreadsheet(), {
      day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "",
      date: e.parameter.date ? decodeURIComponent(e.parameter.date) : "",
      deliveryDate: e.parameter.deliveryDate ? decodeURIComponent(e.parameter.deliveryDate) : "",
      client: e.parameter.client ? decodeURIComponent(e.parameter.client) : "",
      address: e.parameter.address ? decodeURIComponent(e.parameter.address) : "",
      phone: e.parameter.phone ? decodeURIComponent(e.parameter.phone) : "",
      note: e.parameter.note ? decodeURIComponent(e.parameter.note) : "",
      permanentNote: e.parameter.permanentNote ? decodeURIComponent(e.parameter.permanentNote) : "",
      orderType: e.parameter.orderType ? decodeURIComponent(e.parameter.orderType) : "",
      orderPrice: e.parameter.orderPrice,
      deliverySlot: e.parameter.deliverySlot || e.parameter.slot || "",
      ppSlot: e.parameter.ppSlot ? decodeURIComponent(e.parameter.ppSlot) : "",
      deliveryAfter: e.parameter.deliveryAfter || "",
      deliveryBefore: e.parameter.deliveryBefore || "",
      ppPartner: e.parameter.ppPartner ? decodeURIComponent(e.parameter.ppPartner) : "",
      couponsQty: e.parameter.couponsQty || 0,
      couponPrice: e.parameter.couponPrice || 0,
      basket: basketOrd,
      geo: geoOrd,
      survey: surveyOrd,
      editClient: e.parameter.editClient ? decodeURIComponent(e.parameter.editClient) : "",
      originalClient: e.parameter.originalClient ? decodeURIComponent(e.parameter.originalClient) : "",
      matchKey: e.parameter.matchKey ? decodeURIComponent(e.parameter.matchKey) : ""
    }, callback, false);
  }
  if (action === "saveBooking") {
    var basketBk = [];
    try {
      basketBk = e.parameter.basket ? JSON.parse(decodeURIComponent(e.parameter.basket)) : [];
    } catch (eBb) { basketBk = []; }
    var geoBk = null;
    try {
      geoBk = e.parameter.geo ? JSON.parse(decodeURIComponent(e.parameter.geo)) : null;
    } catch (eGb) { geoBk = null; }
    return handleSaveBooking(SpreadsheetApp.getActiveSpreadsheet(), {
      date: e.parameter.date ? decodeURIComponent(e.parameter.date) : "",
      deliveryDate: e.parameter.deliveryDate ? decodeURIComponent(e.parameter.deliveryDate) : "",
      day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "",
      client: e.parameter.client ? decodeURIComponent(e.parameter.client) : "",
      address: e.parameter.address ? decodeURIComponent(e.parameter.address) : "",
      phone: e.parameter.phone ? decodeURIComponent(e.parameter.phone) : "",
      note: e.parameter.note ? decodeURIComponent(e.parameter.note) : "",
      permanentNote: e.parameter.permanentNote ? decodeURIComponent(e.parameter.permanentNote) : "",
      orderType: e.parameter.orderType ? decodeURIComponent(e.parameter.orderType) : "",
      orderPrice: e.parameter.orderPrice,
      deliverySlot: e.parameter.deliverySlot || e.parameter.slot || "",
      ppSlot: e.parameter.ppSlot ? decodeURIComponent(e.parameter.ppSlot) : "",
      deliveryAfter: e.parameter.deliveryAfter || "",
      deliveryBefore: e.parameter.deliveryBefore || "",
      ppPartner: e.parameter.ppPartner ? decodeURIComponent(e.parameter.ppPartner) : "",
      couponsQty: e.parameter.couponsQty || 0,
      couponPrice: e.parameter.couponPrice || 0,
      source: e.parameter.source ? decodeURIComponent(e.parameter.source) : "",
      alsoSaveOrder: e.parameter.alsoSaveOrder,
      basket: basketBk,
      geo: geoBk,
      subId: e.parameter.subId ? decodeURIComponent(e.parameter.subId) : "",
      survey: (function () {
        try {
          return e.parameter.survey ? JSON.parse(decodeURIComponent(e.parameter.survey)) : null;
        } catch (eSv) { return null; }
      })(),
      editClient: e.parameter.editClient ? decodeURIComponent(e.parameter.editClient) : "",
      originalClient: e.parameter.originalClient ? decodeURIComponent(e.parameter.originalClient) : "",
      matchKey: e.parameter.matchKey ? decodeURIComponent(e.parameter.matchKey) : ""
    }, callback, false);
  }

  if (action === "finishFullWeek") {
    return handleFinishFullWeek({
      telegramId: e.parameter.telegramId || "",
      confirm: e.parameter.confirm || "",
      weekKey: e.parameter.weekKey ? decodeURIComponent(e.parameter.weekKey) : ""
    }, callback, false);
  }
  if (action === "getWeekBannerState") {
    return handleGetWeekBannerState({
      weekKey: e.parameter.weekKey ? decodeURIComponent(e.parameter.weekKey) : ""
    }, callback, false);
  }
  if (action === "setWeekBannerState") {
    return handleSetWeekBannerState({
      weekKey: e.parameter.weekKey ? decodeURIComponent(e.parameter.weekKey) : "",
      finished: e.parameter.finished,
      pulled: e.parameter.pulled,
      refused: e.parameter.refused,
      telegramId: e.parameter.telegramId || ""
    }, callback, false);
  }

  return jsonp(callback, { status: "unknown_action" });
}

function handleApiAction(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var action = json.action;

  if (action === "deleteClient") {
    return handleDeleteClient(ss, json, callback);
  }
  if (action === "moveClient") {
    // для move: day в doPost = newDay; в GET передаём newDay отдельно
    if (!json.day && json.newDay) json.day = json.newDay;
    return handleMoveClient(ss, json, callback);
  }
  if (action === "saveOrder") {
    return handleSaveOrder(ss, json, callback, fromPost);
  }
  if (action === "getWeekDayCounts") {
    return handleGetWeekDayCounts(json, callback, fromPost);
  }
  if (action === "inspectManagerFormulas") {
    return handleInspectManagerFormulas(json, callback, fromPost);
  }
  if (action === "setupWeekendFormulas") {
    return handleSetupWeekendFormulas(json, callback, fromPost);
  }
  if (action === "getMonthOverview") {
    return handleGetMonthOverview(json, callback, fromPost);
  }
  if (action === "saveBooking") {
    return handleSaveBooking(ss, json, callback, fromPost);
  }
  if (action === "listBookings") {
    return handleListBookings(json, callback, fromPost);
  }
  if (action === "ensureDayMaterialized") {
    return handleEnsureDayMaterialized(json, callback, fromPost);
  }
  if (action === "getViewCompare") {
    return handleGetViewCompare(json, callback, fromPost);
  }
  if (action === "pullClientFromMonth") {
    return handlePullClientFromMonth(json, callback, fromPost);
  }
  if (action === "pullClientsFromMonth") {
    return handlePullClientsFromMonth(json, callback, fromPost);
  }
  if (action === "materializeWeek") {
    return handleMaterializeWeek(json, callback, fromPost);
  }
  if (action === "weekPullStatus") {
    return handleWeekPullStatus(json, callback, fromPost);
  }
  if (action === "resolveDayForDate") {
    return handleResolveDayForDate(json, callback, fromPost);
  }
  if (action === "migrateCalendar") {
    return handleMigrateCalendar(json, callback, fromPost);
  }
  if (action === "removeCalendarClient") {
    return handleRemoveCalendarClient(json, callback, fromPost);
  }
  if (action === "setupBookingTriggers") {
    return handleSetupBookingTriggers(callback, fromPost);
  }
  if (action === "setupDeliveryDatesNudgeTriggers") {
    return handleSetupDeliveryDatesNudgeTriggers(callback, fromPost);
  }
  if (action === "testDeliveryDatesNudge") {
    return handleTestDeliveryDatesNudge(callback, fromPost);
  }
  if (action === "updateCutting") {
    return handleUpdateCutting(ss, json, callback, fromPost);
  }
  if (action === "setDelivered") {
    return handleSetDelivered(ss, json, callback);
  }
  if (action === "setAssembled") {
    return handleSetAssembled(ss, json, callback);
  }
  if (action === "setPrinted") {
    return handleSetPrinted(ss, json, callback);
  }
  if (action === "registerCourier") {
    return handleRegisterCourier(json, callback, fromPost);
  }
  if (action === "getCouriers") {
    return handleGetCouriers(callback, fromPost);
  }
  if (action === "sendCourierRoute") {
    return handleSendCourierRoute(json, callback, fromPost);
  }
  if (action === "prepareCourierRoute") {
    return handlePrepareCourierRoute(json, callback, fromPost);
  }
  if (action === "suggestAddress") {
    return handleSuggestAddress(json, callback, fromPost);
  }
  if (action === "telegramStatus") {
    return handleTelegramStatus(callback, fromPost);
  }
  if (action === "finishFullWeek") {
    return handleFinishFullWeek(json, callback, fromPost);
  }
  if (action === "getWeekBannerState") {
    return handleGetWeekBannerState(json, callback, fromPost);
  }
  if (action === "setWeekBannerState") {
    return handleSetWeekBannerState(json, callback, fromPost);
  }
  if (action === "finishCutting") {
    return handleFinishCutting(ss, json, callback, fromPost);
  }
  if (action === "prepareFinishCutting") {
    return handlePrepareFinishCutting(json, callback, fromPost);
  }
  if (action === "setupTelegramWebhook") {
    return handleSetupTelegramWebhook(callback, fromPost);
  }
  if (action === "registerCuttingDeficit") {
    return handleRegisterCuttingDeficit(ss, json, callback, fromPost);
  }
  if (action === "startCuttingSession") {
    return handleStartCuttingSession(json, callback, fromPost);
  }
  if (action === "stopCuttingSession") {
    return handleStopCuttingSession(json, callback, fromPost);
  }
  if (action === "getMyAccess") {
    return handleGetMyAccess(json, callback, fromPost);
  }
  if (action === "getNativeLinkInfo") {
    return handleGetNativeLinkInfo(callback, fromPost);
  }
  if (action === "pollNativeAuth") {
    return handlePollNativeAuth(json, callback, fromPost);
  }
  if (action === "requestAccess") {
    return handleRequestAccess(json, callback, fromPost);
  }
  if (action === "listAccess") {
    return handleListAccess(json, callback, fromPost);
  }
  if (action === "listPartners") {
    return handleListPartners(json, callback, fromPost);
  }
  if (action === "savePartner") {
    return handleSavePartner(json, callback, fromPost);
  }
  if (action === "deletePartner") {
    return handleDeletePartner(json, callback, fromPost);
  }
  if (action === "partnerListAdmin") {
    return handlePartnerListAdmin(json, callback, fromPost);
  }
  if (action === "partnerGetMe") {
    return handlePartnerGetMe(json, callback, fromPost);
  }
  if (action === "partnerSaveNetwork") {
    return handlePartnerSaveNetwork(json, callback, fromPost);
  }
  if (action === "partnerSavePoint") {
    return handlePartnerSavePoint(json, callback, fromPost);
  }
  if (action === "partnerSaveAccess") {
    return handlePartnerSaveAccess(json, callback, fromPost);
  }
  if (action === "partnerRevokeAccess") {
    return handlePartnerRevokeAccess(json, callback, fromPost);
  }
  if (action === "partnerSeedDefaults") {
    return handlePartnerSeedDefaults(json, callback, fromPost);
  }
  if (action === "partnerSetNotifyRecipients") {
    return handlePartnerSetNotifyRecipients(json, callback, fromPost);
  }
  if (action === "partnerSubmitOrder") {
    return handlePartnerSubmitOrder(json, callback, fromPost);
  }
  if (action === "partnerListMyOrders") {
    return handlePartnerListMyOrders(json, callback, fromPost);
  }
  if (action === "listReminderPeople") {
    return handleListReminderPeople_(json, callback, fromPost);
  }
  if (action === "setAccessRole") {
    return handleSetAccessRole(json, callback, fromPost);
  }
  if (action === "setAccessTimezone") {
    return handleSetAccessTimezone(json, callback, fromPost);
  }
  if (action === "getWarehouse") {
    return handleGetWarehouse(json, callback, fromPost);
  }
  if (action === "setWarehouseArrival") {
    return handleSetWarehouseArrival(json, callback, fromPost);
  }
  if (action === "applyWarehouseRevision") {
    return handleApplyWarehouseRevision(json, callback, fromPost);
  }
  if (action === "warehousePreview") {
    return handleWarehousePreview(json, callback, fromPost);
  }
  if (action === "composeWarehouseBuyMessage") {
    return handleComposeWarehouseBuyMessage(json, callback, fromPost);
  }
  if (action === "lookupBpPartner") {
    return handleLookupBpPartner(json, callback, fromPost);
  }
  if (action === "listSubscriptions") {
    return handleListSubscriptions(json, callback, fromPost);
  }
  if (action === "repairSubscriptionIds") {
    return handleRepairSubscriptionIds(json, callback, fromPost);
  }
  if (action === "getSubscription") {
    return handleGetSubscription(json, callback, fromPost);
  }
  if (action === "saveSubscription") {
    return handleSaveSubscription(json, callback, fromPost);
  }

  if (action === "closeAllOpenDeficits") {
    return handleCloseAllOpenDeficits(json, callback, fromPost);
  }
  if (action === "ensureBpFromOrder") {
    return handleEnsureBpFromOrder(json, callback, fromPost);
  }
  if (action === "listBpIdle") {
    return handleListBpIdle(json, callback, fromPost);
  }

  if (action === "listTemplates") {
    return handleListTemplates(json, callback, fromPost);
  }
  if (action === "saveTemplate") {
    return handleSaveTemplate(json, callback, fromPost);
  }
  if (action === "deleteTemplate") {
    return handleDeleteTemplate(json, callback, fromPost);
  }
  if (action === "syncSurveyTemplates") {
    return handleSyncSurveyTemplates(json, callback, fromPost);
  }
  if (action === "moveSubscription") {
    return handleMoveSubscription(json, callback, fromPost);
  }
  if (action === "deleteSubscription") {
    return handleDeleteSubscription(json, callback, fromPost);
  }
  if (action === "deleteSubscriptionBatch") {
    return handleDeleteSubscriptionBatch(json, callback, fromPost);
  }
  if (action === "pushSubscriptionToDay") {
    return handlePushSubscriptionToDay(json, callback, fromPost);
  }
  if (action === "calcPrice") {
    return handleCalcPrice(json, callback, fromPost);
  }
  if (action === "calcPpFact") {
    return handleCalcPpFact(json, callback, fromPost);
  }
  if (action === "getAssembly") {
    return handleGetAssembly(json, callback, fromPost);
  }
  if (action === "findClientMatch") {
    return handleFindClientMatch(json, callback, fromPost);
  }
  if (action === "listClientProfiles") {
    return handleListClientProfiles(json, callback, fromPost);
  }
  if (action === "crmInventory") {
    return handleCrmInventory(json, callback, fromPost);
  }
  if (action === "seedCrmClients") {
    return handleSeedCrmClients(json, callback, fromPost);
  }
  if (action === "logEvent") {
    return handleLogEvent(json, callback, fromPost);
  }
  if (action === "reportBug") {
    return handleReportBug(json, callback, fromPost);
  }
  if (action === "getStats") {
    return handleGetStats(json, callback, fromPost);
  }
  if (action === "getExpectedProfit") {
    return handleGetExpectedProfit(json, callback, fromPost);
  }
  if (action === "exportStats") {
    return handleExportStats(json, callback, fromPost);
  }
  if (action === "listSurvey") {
    return handleListSurvey(json, callback, fromPost);
  }
  if (action === "repairSurveys") {
    return handleRepairSurveys(json, callback, fromPost);
  }
  if (action === "saveSurvey") {
    return handleSaveSurvey(json, callback, fromPost);
  }
  if (action === "deleteSurvey") {
    return handleDeleteSurvey(json, callback, fromPost);
  }
  if (action === "deleteSurveyBatch") {
    return handleDeleteSurveyBatch(json, callback, fromPost);
  }
  if (action === "forceSurveyRemind") {
    return handleForceSurveyRemind(json, callback, fromPost);
  }
  if (action === "getPpFactCost") {
    return handleGetPpFactCost(json, callback, fromPost);
  }
  if (action === "getPpOrderSuggest") {
    return handleGetPpOrderSuggest(json, callback, fromPost);
  }
  if (action === "listDeferred" || action === "saveDeferred" || action === "updateDeferred" ||
      action === "cancelDeferred" || action === "enrollDeferredToPp" || action === "setDeferredReminder" ||
      action === "notifyMissedDelivery" || action === "getTransferTask") {
    return handleDeferredAction_(action, json, callback, fromPost);
  }
  return fromPost ? jsonpText(callback, { status: "unknown_action" }) : jsonp(callback, { status: "unknown_action" });
}

function handleGetCutting(dayName, callback) {
  var cutKey = "CUT:" + String(dayName || "").toUpperCase();
  try {
    var cutCached = cacheGetJson_(cutKey);
    if (cutCached && cutCached.status === "success") return jsonp(callback, cutCached);
  } catch (eCutC) {}
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cutting = ss.getSheetByName("Нарезка");
  var warehouse = ss.getSheetByName("Склад");
  var memory = getMemoryCuttingSheet_();
  var dateValue = getDayDate_(ss, dayName);
  var tz = ss.getSpreadsheetTimeZone();
  if (!cutting || !dateValue) return jsonp(callback, { status: "bad_day", items: [], session: getCuttingSession_() });

  var dateText = formatSheetDate(dateValue, tz);
  var isActiveDate = formatSheetDate(cutting.getRange("A1").getValue(), tz) === dateText;
  var totals = recalculateCuttingForDate_(ss, dateText);
  var names = cutting.getRange("A3:A48").getValues();
  var plans = cutting.getRange("D3:D48").getValues();
  // Активная дата на листе → live E/F/G + сразу снимок в Память_Нарезки (flush внутри save),
  // чтобы смена дня не восстановила устаревший false и не сбросила «выложено».
  // Другой день → только память. Без OR live||mem — иначе нельзя снять галочку.
  var activeState = null;
  var savedState = null;
  if (isActiveDate) {
    try { SpreadsheetApp.flush(); } catch (eFl0) {}
    activeState = cutting.getRange("C3:G48").getValues();
    try { saveCuttingState_(cutting, memory, dateText, tz); } catch (eSave) {}
  } else {
    savedState = getMemoryJson_(memory, dateText, tz);
  }
  var rowNotes = collectCuttingRowNotes_(ss, dayName);
  // один batch коэффициентов склада вместо N×getRange("D"+wRow)
  var whCoefByRow = {};
  try {
    if (warehouse) {
      var lastWh = Math.min(90, Math.max(2, warehouse.getLastRow()));
      var nWh = lastWh - 1;
      if (nWh >= 1) {
        var coefVals = warehouse.getRange(2, 4, nWh, 1).getValues();
        for (var wi = 0; wi < coefVals.length; wi++) {
          whCoefByRow[wi + 2] = Number(coefVals[wi][0]) || 0;
        }
      }
    }
  } catch (eWh) { whCoefByRow = {}; }
  var items = [];

  for (var i = 0; i < 46; i++) {
    var dry = Number(totals[i][0]) || 0;
    if (dry <= 0) continue;
    var name = names[i][0] == null ? "" : String(names[i][0]).trim();
    var row = i + 3;
    var piece = isPieceSkuName_(name);
    var state = activeState
      ? activeState[i]
      : (savedState && savedState[i] ? savedState[i] : []);
    // active C3:G = [C,D,E,F,G] → laid=E[2], done=F[3], outNext=G[4]
    // memory packed = [surplus,"",laid,done,outNext] — те же индексы 0,2,3,4
    var surplus = Number(state[0]) || 0;
    var laid = asBool_(state[2]);
    var done = asBool_(state[3]);
    var outNext = asBool_(state[4]);
    var raw;
    if (piece) {
      raw = dry;
    } else if (isActiveDate && plans[i][0] !== "" && !isNaN(Number(plans[i][0]))) {
      raw = Number(plans[i][0]);
    } else {
      var wRow = getWarehouseRowForCuttingRow_(row);
      var coef = Number(whCoefByRow[wRow]) || 0;
      if (!coef) coef = 0.2;
      raw = (dry / 1000) / coef;
    }
    var noteInfo = rowNotes[String(row)] || null;
    items.push({
      row: row,
      name: name,
      dry: dry,
      unit: piece ? "шт" : "гр",
      raw: raw,
      surplus: surplus,
      done: done,
      laid: laid,
      outNext: outNext,
      noteInfo: noteInfo
    });
  }
  var payload = {
    status: "success",
    date: dateText,
    day: dayName,
    items: items,
    session: getCuttingSession_(),
    completion: getCuttingCompletion_(dateText),
    cutterNotes: collectDayRoleNotes_(ss, dayName, "cut"),
    transferOnly: collectTransferOnlyCutting_(ss, dayName)
  };
  try { cachePutJson_(cutKey, payload, 15); } catch (eCutP) {}
  return jsonp(callback, payload);
}

/** Клиенты с [НЕ РЕЗАТЬ] — объёмы для блока «напилено под перенос». */
function collectTransferOnlyCutting_(ss, dayName) {
  var data = getClientsData_(ss, dayName);
  if (data.status !== "success") return { clients: [], lines: [] };
  var map = {};
  var clients = [];
  (data.clients || []).forEach(function (c) {
    if (!c.noCut) return;
    clients.push(c.name);
    (c.basket || []).forEach(function (it) {
      var name = String(it.name || "").trim();
      var sub = String(it.sub || "").trim();
      var val = Number(it.val) || 0;
      if (!name || val <= 0) return;
      var key = name + (sub ? " / " + sub : "");
      map[key] = (map[key] || 0) + val;
    });
  });
  var lines = [];
  for (var k in map) {
    if (map.hasOwnProperty(k)) lines.push({ label: k, val: map[k] });
  }
  return { clients: clients, lines: lines };
}

function getCuttingSession_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty("CUTTING_SESSION");
    if (!raw) return { active: false, day: "", startedAt: 0 };
    var obj = JSON.parse(raw);
    return {
      active: !!obj.active,
      day: String(obj.day || ""),
      startedAt: Number(obj.startedAt) || 0
    };
  } catch (e) {
    return { active: false, day: "", startedAt: 0 };
  }
}

function handleStartCuttingSession(json, callback, fromPost) {
  var day = String(json.day || "").trim();
  if (!day) {
    var bad = { status: "error", message: "need_day" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var startedAt = Number(json.startedAt) || Date.now();
  var existing = getCuttingSession_();
  // если уже идёт на этот день — не сбрасываем таймер
  if (existing.active && String(existing.day) === day && existing.startedAt) {
    startedAt = existing.startedAt;
  }
  PropertiesService.getScriptProperties().setProperty("CUTTING_SESSION", JSON.stringify({
    active: true,
    day: day,
    startedAt: startedAt
  }));
  var ok = { status: "success", session: getCuttingSession_() };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleStopCuttingSession(json, callback, fromPost) {
  var day = String(json.day || "").trim();
  var existing = getCuttingSession_();
  var elapsed = 0;
  if (existing.active && existing.startedAt) {
    elapsed = Date.now() - existing.startedAt;
  }
  if (!day || !existing.day || String(existing.day) === day || !existing.active) {
    PropertiesService.getScriptProperties().setProperty("CUTTING_SESSION", JSON.stringify({
      active: false,
      day: "",
      startedAt: 0
    }));
  }
  var ok = { status: "success", elapsed: elapsed, session: getCuttingSession_() };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleUpdateCutting(ss, json, callback, fromPost) {
  if (fromPost === undefined) fromPost = true;
  var lock = LockService.getDocumentLock();
  try {
    lock.waitLock(20000);
  } catch (eLock) {
    var busy = { status: "error", message: "busy_retry" };
    return fromPost ? jsonpText(callback, busy) : jsonp(callback, busy);
  }
  try {
    var cutting = ss.getSheetByName("Нарезка");
    var memory = getMemoryCuttingSheet_();
    var tz = ss.getSpreadsheetTimeZone();
    var row = Number(json.row);
    var dateValue = getDayDate_(ss, json.day);
    if (!cutting || !dateValue || row < 3 || row > 48 || row % 1 !== 0) {
      var bad = { status: "bad_request" };
      return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
    }

    var oldDate = formatSheetDate(cutting.getRange("A1").getValue(), tz);
    var dateText = formatSheetDate(dateValue, tz);

    // Важно: НЕ делать restore на каждый клик — иначе параллельные галочки затираются.
    // Restore только при смене даты на листе «Нарезка».
    if (oldDate !== dateText) {
      if (oldDate) saveCuttingState_(cutting, memory, oldDate, tz);
      cutting.getRange("A1").setValue(dateValue);
      restoreCuttingState_(cutting, memory, dateText, tz);
      recalculateCuttingForDate_(ss, dateText);
    }
    // галочки/излишек — без пересчёта плана: иначе lock busy_retry и клики «не берутся»

    if (json.surplus !== undefined && json.surplus !== null && json.surplus !== "") {
      cutting.getRange("C" + row).setValue(Number(json.surplus) || 0);
    }
    if (json.done !== undefined && json.done !== null && json.done !== "") {
      cutting.getRange("F" + row).setValue(asBool_(json.done));
    }
    if (json.laid !== undefined && json.laid !== null && json.laid !== "") {
      cutting.getRange("E" + row).setValue(asBool_(json.laid));
    }
    if (json.outNext !== undefined && json.outNext !== null && json.outNext !== "") {
      var outNext = asBool_(json.outNext);
      cutting.getRange("G" + row).setValue(outNext);
      if (outNext) {
        try {
          notifyOutNextStock_({
            day: json.day,
            name: cutting.getRange("A" + row).getValue(),
            row: row
          });
        } catch (eOut) {}
      }
    }
    try { SpreadsheetApp.flush(); } catch (eFl1) {}
    saveCuttingState_(cutting, memory, dateText, tz);
    try { bustCuttingCache_(json.day); } catch (eBc) {}
    var ok = { status: "success", row: row, done: asBool_(cutting.getRange("F" + row).getValue()), laid: asBool_(cutting.getRange("E" + row).getValue()), outNext: asBool_(cutting.getRange("G" + row).getValue()) };
    return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

/** На листе «Доставки» ники клиентов в строке 3, галочки в строке 2. Столбец C часто «итого» — ищем ник по имени. */
function findCourierClientCol_(courierSheet, clientName) {
  if (!courierSheet) return -1;
  var nicks = courierSheet.getRange(3, 3, 1, 16).getValues()[0];
  for (var i = 0; i < nicks.length; i++) {
    var nick = String(nicks[i] || "").trim();
    if (!nick) continue;
    var up = nick.toUpperCase();
    if (up === "ИТОГО НА ДЕНЬ" || up === "ИТОГО" || up === "ФАКТ СНЯТОЕ") continue;
    if (nicksMatch_(nick, clientName)) return i + 3; // 1-based column
  }
  return -1;
}

function memFlagEntry_(memFlags, clientName) {
  if (!memFlags || typeof memFlags !== "object") return null;
  if (Object.prototype.toString.call(memFlags) === "[object Array]") return null;
  var mk = clientMatchKey_(clientName) || String(clientName || "").toUpperCase();
  var e = memFlags[mk] || memFlags[String(clientName || "").toUpperCase()];
  if (e && typeof e === "object") return e;
  return null;
}

function handleGetCourier(dayName, callback) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var courier = ss.getSheetByName("Доставки");
  var memory = getMemoryCourierSheet_();
  var tz = ss.getSpreadsheetTimeZone();
  var dateValue = getDayDate_(ss, dayName);
  var cacheKey = "COUR:" + String(dayName || "").toUpperCase();
  var cached = cacheGetJson_(cacheKey);
  if (cached && cached.status === "success") return jsonp(callback, cached);

  var clientData = getClientsData_(ss, dayName);
  if (!dateValue || clientData.status !== "success") {
    return jsonp(callback, { status: "bad_day", clients: [] });
  }
  var dateText = formatSheetDate(dateValue, tz);
  var memFlags = getMemoryJson_(memory, dateText, tz) || {};
  var sheetActive = courier && formatSheetDate(courier.getRange("A1").getValue(), tz) === dateText;

  // один read ников/галочек вместо N×getRange
  var courierNicks = [];
  var courierDone = [];
  if (sheetActive) {
    try {
      courierNicks = courier.getRange(3, 3, 1, 16).getValues()[0] || [];
      courierDone = courier.getRange(2, 3, 1, 16).getValues()[0] || [];
    } catch (eR) {}
  }
  function courierColFor_(name) {
    for (var i = 0; i < courierNicks.length; i++) {
      var nick = String(courierNicks[i] || "").trim();
      if (!nick) continue;
      var up = nick.toUpperCase();
      if (up === "ИТОГО НА ДЕНЬ" || up === "ИТОГО" || up === "ФАКТ СНЯТОЕ") continue;
      if (nicksMatch_(nick, name)) return i;
    }
    return -1;
  }

  var clients = [];
  for (var i = 0; i < clientData.clients.length; i++) {
    var client = clientData.clients[i];
    var delivered = false;
    var ci = courierColFor_(client.name);
    var courierCol = ci >= 0 ? ci + 3 : -1;
    if (sheetActive && ci >= 0) {
      delivered = courierDone[ci] === true;
    } else if (memFlags && typeof memFlags === "object") {
      if (Object.prototype.toString.call(memFlags) === "[object Array]") {
        delivered = memFlags[client.col] === true;
      } else {
        delivered = normalizeMemDelivered_(memFlagEntry_(memFlags, client.name)) ||
          normalizeMemDelivered_(memFlags[clientMatchKey_(client.name)]) ||
          normalizeMemDelivered_(memFlags[String(client.name).toUpperCase()]);
      }
    }
    var memE = memFlagEntry_(memFlags, client.name);
    var assembled = !!(memE && memE.assembled);

    var deliveriesN = 0;
    var paidCycle = null;
    var deliverySlot = 0;
    var ppHint = "";
    var askPaid = false;
    var segU = String(client.segment || "").trim().toUpperCase();
    var srcL = String(client.source || "").trim().toLowerCase();
    // слот/бейдж ПП только для заказа типа ПП (не БП/розница/партнёр)
    var isPpOrder = (segU === "ПП" || segU === "PP" || segU === "АФК" || srcL === "pp" || srcL === "subscription");
    if (segU === "БП" || segU === "BP" || segU === "Р" || segU === "RETAIL" || segU.indexOf("ПАРТ") === 0 ||
        srcL === "bp" || srcL === "retail" || srcL === "partner") {
      isPpOrder = false;
    }
    if (isPpOrder) {
      try {
        deliveriesN = lookupPpDeliveries_(client.name) || 0;
      } catch (eN) {}
      deliverySlot = 1;
      // тяжёлый resolve только для реальных ПП
      if (deliveriesN >= 1) {
        try {
          var resolved = resolvePpDeliverySlot_(ss, client.name, dateValue, tz, delivered, {
            ppSlot: client.ppSlot || ""
          });
          deliveriesN = resolved.deliveriesN || deliveriesN;
          deliverySlot = resolved.slot || 1;
          // если в заказе уже стоит слот — он побеждает (и для бейджа, и для оплаты)
          var forcedCour = parseForcedPpSlot_(client.ppSlot, deliveriesN);
          if (forcedCour >= 1) deliverySlot = forcedCour;
          var cycle = resolved.cycle;
          if (cycle && cycle.paid) paidCycle = cycle.paid;
          if (!paidCycle) {
            var wKey = weekPaidKey_(dateValue, tz);
            var wStore = getWeekPaidStore_(memory, wKey, tz);
            var mkPaid = clientMatchKey_(client.name) || String(client.name).toUpperCase();
            var pe = wStore[mkPaid] || wStore[String(client.name).toUpperCase()];
            if (pe && typeof pe === "object") paidCycle = pe.paid || null;
            else if (typeof pe === "string") paidCycle = pe;
          }
          if (deliveriesN >= 2) {
            ppHint = "ПП " + deliverySlot + "/" + deliveriesN + (deliverySlot >= 2 ? " · остаток" : "");
          } else if (deliveriesN === 1) {
            ppHint = "ПП N=1";
          }
          // N=2: спросить оплату на 1-й; на 2-й — только если на 1-й сказали «нет» или ещё не фиксировали
          if (deliveriesN >= 2) {
            if (paidCycle === "yes") askPaid = false;
            else if (deliverySlot <= 1) askPaid = true;
            else askPaid = (paidCycle === "no" || !paidCycle);
          }
        } catch (ePaid) {}
      }
      if (!ppHint && client.ppHint) ppHint = String(client.ppHint || "");
    }
    var ppSlotOut = "";
    if (isPpOrder) {
      ppSlotOut = formatPpSlotLabel_(deliverySlot, deliveriesN);
      if (!ppSlotOut) {
        var rawSlot = String(client.ppSlot || "").trim();
        // не тащить Date.toString() («Sun Feb 01…») в бейдж
        if (rawSlot && !/GMT|[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}/.test(rawSlot) &&
            parseForcedPpSlot_(rawSlot, deliveriesN || 2) >= 1) {
          ppSlotOut = rawSlot;
        }
      }
      if (!ppHint && ppSlotOut) ppHint = "ПП " + ppSlotOut;
      if (ppHint && /GMT|[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}/.test(ppHint)) ppHint = "";
    }
    clients.push({
      name: client.name,
      address: client.address,
      note: client.note,
      phone: client.phone || "",
      geo: client.geo || null,
      basket: client.basket,
      dogCount: client.dogCount || (basketHasDogSplit_(client.basket) ? 2 : 1),
      delivered: delivered,
      assembled: assembled,
      col: client.col,
      courierCol: courierCol,
      deliveriesN: isPpOrder ? deliveriesN : 0,
      paid: paidCycle,
      deliverySlot: isPpOrder ? deliverySlot : 0,
      ppSlot: ppSlotOut,
      ppHint: ppHint,
      orderPrice: client.orderPrice != null ? client.orderPrice : "",
      segment: client.segment || "",
      source: client.source || "",
      deliveryAfter: client.deliveryAfter || "",
      deliveryBefore: client.deliveryBefore || "",
      ppPartner: client.ppPartner || "",
      couponsQty: client.couponsQty || 0,
      couponPrice: client.couponPrice || 0,
      askPaid: !!(isPpOrder && askPaid && !delivered)
    });
  }
  var out = { status: "success", day: dayName, date: dateText, clients: clients };
  cachePutJson_(cacheKey, out, 60);
  return jsonp(callback, out);
}

function handleSetDelivered(ss, json, callback) {
  var block = getDayBlock(json.day);
  var targetSheet = getTargetSheet(ss, block);
  var courier = ss.getSheetByName("Доставки");
  var memory = getMemoryCourierSheet_();
  var tz = ss.getSpreadsheetTimeZone();
  var dateValue = getDayDate_(ss, json.day);
  if (!block || !targetSheet || !dateValue) return jsonpText(callback, { status: "bad_day" });

  var want = String(json.client || "").trim();
  var nicks = targetSheet.getRange(block.nick, 3, 1, 15).getValues()[0];
  var mgrIdx = -1;
  for (var i = 0; i < nicks.length; i++) {
    if (nicksMatch_(nicks[i], want)) {
      mgrIdx = i;
      break;
    }
  }
  if (mgrIdx < 0) return jsonpText(callback, { status: "client_not_found" });

  var dateText = formatSheetDate(dateValue, tz);
  var delivered = json.delivered === true || String(json.delivered).toLowerCase() === "true";
  var courierCol = findCourierClientCol_(courier, json.client);
  var paidRaw = json.paid != null ? String(json.paid).toLowerCase() : "";
  var paidVal = (paidRaw === "yes" || paidRaw === "true" || paidRaw === "1") ? "yes"
    : (paidRaw === "no" || paidRaw === "false" || paidRaw === "0") ? "no" : "";
  var memKey = clientMatchKey_(want) || normalizeClientKey_(want);

  if (courier && formatSheetDate(courier.getRange("A1").getValue(), tz) === dateText && courierCol > 0) {
    courier.getRange(2, courierCol).setValue(delivered);
  }
  if (!memory) memory = getMemoryCourierSheet_() || ss.insertSheet("Память_Доставок");
  var values = getMemoryJson_(memory, dateText, tz);
  if (!values || Object.prototype.toString.call(values) === "[object Array]") {
    values = {};
  }
  var prevMem = memFlagEntry_(values, want) || values[memKey] || {};
  if (typeof prevMem !== "object" || prevMem === null) prevMem = {};
  values[memKey] = {
    delivered: delivered,
    paid: paidVal || prevMem.paid || null,
    assembled: !!prevMem.assembled,
    printed: !!prevMem.printed
  };
  saveMemoryJson_(memory, dateText, values, tz);
  try { CacheService.getScriptCache().remove("COUR:" + String(json.day || "").toUpperCase()); } catch (eC) {}

  if (paidVal) {
    var wKey = weekPaidKey_(dateValue, tz);
    var wStore = getWeekPaidStore_(memory, wKey, tz);
    wStore[memKey] = { paid: paidVal, updated: dateText };
    saveMemoryJson_(memory, wKey, wStore, tz);
  }
  // Месячный цикл ПП: слот 1/2 + снимок состава + оплата
  if (delivered) {
    try {
      recordPpDeliveryCycle_(ss, json.day, json.client, dateValue, tz, paidVal || null);
    } catch (eCycle) {}
  }
  return jsonpText(callback, { status: "success", paid: paidVal || null });
}

function handleSetAssembled(ss, json, callback) {
  var memory = getMemoryCourierSheet_();
  var tz = ss.getSpreadsheetTimeZone();
  var dayName = String(json.day || "").trim();
  var dateValue = getDayDate_(ss, dayName);
  if (!dateValue) return jsonpText(callback, { status: "bad_day" });
  var want = String(json.client || "").trim();
  if (!want) return jsonpText(callback, { status: "no_client" });
  var assembled = json.assembled === true || String(json.assembled).toLowerCase() === "true";
  var dateText = formatSheetDate(dateValue, tz);
  var memKey = clientMatchKey_(want) || normalizeClientKey_(want);
  if (!memory) memory = getMemoryCourierSheet_() || ss.insertSheet("Память_Доставок");
  var values = getMemoryJson_(memory, dateText, tz);
  if (!values || Object.prototype.toString.call(values) === "[object Array]") values = {};
  var prevMem = memFlagEntry_(values, want) || values[memKey] || {};
  if (typeof prevMem !== "object" || prevMem === null) prevMem = {};
  values[memKey] = {
    delivered: !!prevMem.delivered,
    paid: prevMem.paid || null,
    assembled: assembled,
    printed: !!prevMem.printed
  };
  saveMemoryJson_(memory, dateText, values, tz);
  try {
    CacheService.getScriptCache().remove("COUR:" + String(dayName || "").toUpperCase());
    CacheService.getScriptCache().remove("ASM:" + String(dayName || "").toUpperCase());
  } catch (eC) {}
  return jsonpText(callback, { status: "success", assembled: assembled });
}

/** Галочка «пропечатано» — пакеты без лакомств (жевалки); хранится в Память_Доставок. */
function handleSetPrinted(ss, json, callback) {
  var memory = getMemoryCourierSheet_();
  var tz = ss.getSpreadsheetTimeZone();
  var dayName = String(json.day || "").trim();
  var dateValue = getDayDate_(ss, dayName);
  if (!dateValue) return jsonpText(callback, { status: "bad_day" });
  var want = String(json.client || "").trim();
  if (!want) return jsonpText(callback, { status: "no_client" });
  var printed = json.printed === true || String(json.printed).toLowerCase() === "true";
  var dateText = formatSheetDate(dateValue, tz);
  var memKey = clientMatchKey_(want) || normalizeClientKey_(want);
  if (!memory) memory = getMemoryCourierSheet_() || ss.insertSheet("Память_Доставок");
  var values = getMemoryJson_(memory, dateText, tz);
  if (!values || Object.prototype.toString.call(values) === "[object Array]") values = {};
  var prevMem = memFlagEntry_(values, want) || values[memKey] || {};
  if (typeof prevMem !== "object" || prevMem === null) prevMem = {};
  values[memKey] = {
    delivered: !!prevMem.delivered,
    paid: prevMem.paid || null,
    assembled: !!prevMem.assembled,
    printed: printed
  };
  saveMemoryJson_(memory, dateText, values, tz);
  try {
    CacheService.getScriptCache().remove("COUR:" + String(dayName || "").toUpperCase());
    CacheService.getScriptCache().remove("ASM:" + String(dayName || "").toUpperCase());
  } catch (eC) {}
  return jsonpText(callback, { status: "success", printed: printed });
}

/** Нормализация ника для поиска: пробелы, ё/е, невидимые символы. */
function normalizeClientKey_(s) {
  return String(s || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .replace(/Ё/g, "Е");
}

/**
 * Instagram/латиница из строки. Не обрезает кириллическое имя —
 * для отображения используй raw/display, для сравнения — clientMatchKey_.
 */
function extractInstagramNick_(raw) {
  var s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  var at = s.match(/@([A-Za-z0-9._]{2,})/);
  if (at) return at[1];
  // убрать хвосты сегмента/мусор в скобках
  s = s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  var parts = s.split(/\s+/);
  for (var i = parts.length - 1; i >= 0; i--) {
    var p = parts[i].replace(/^[.,;:]+|[.,;:]+$/g, "");
    if (/^[A-Za-z0-9._]{3,}$/.test(p) && /[A-Za-z]/.test(p)) return p;
  }
  return "";
}

/** Ключ личности клиента: @handle / латиница, иначе полное имя.
 *  Две собаки одного инста (Veta.foto Дэни / Veta.foto Пэни) — разные ключи.
 */
function clientMatchKey_(raw) {
  var ex = extractInstagramNick_(raw);
  var display = String(raw || "").replace(/\s+/g, " ").trim();
  var base = ex || display.replace(/\s*\b(АФК|ПП|БП|Р)\b\s*/gi, " ").replace(/\s+/g, " ").trim();
  // kinolog.vica ≡ Kinolog_vica — точки/подчёркивания в handle не различаем
  var key = normalizeClientKey_(base);
  if (ex || /^[A-Z0-9._]+$/i.test(base)) key = key.replace(/[._]/g, "");
  if (ex && display) {
    var esc = String(ex).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Кличка собаки только ПОСЛЕ handle: «veta.foto Дэни».
    // «ЕВГЕНИЯ es_furman» — ФИО перед handle, не кличка.
    var mAfter = display.match(new RegExp("@?" + esc + "\\s+(.+)$", "i"));
    var dog = mAfter ? String(mAfter[1] || "").trim() : "";
    dog = dog.replace(/\s*\b(АФК|ПП|БП|Р)\b\s*/gi, " ").replace(/\s+/g, " ").trim();
    if (dog && dog.length <= 24 &&
        !/доставк|напис|уточн|втор(ая|ой)|через|европочт/i.test(dog) &&
        /[а-яА-ЯёЁA-Za-z0-9]/.test(dog)) {
      key = key + "|" + normalizeClientKey_(dog).replace(/[._\s]+/g, "");
    }
  }
  return key;
}

function nicksMatch_(a, b) {
  var ka = clientMatchKey_(a);
  var kb = clientMatchKey_(b);
  if (ka && kb && ka === kb) return true;
  var ia = extractInstagramNick_(a);
  var ib = extractInstagramNick_(b);
  if (ia && ib) {
    var ha = normalizeClientKey_(ia).replace(/[._]/g, "");
    var hb = normalizeClientKey_(ib).replace(/[._]/g, "");
    if (ha && ha === hb) {
      // Оба с кличкой собаки — только точное равенство ключей (уже выше).
      // Если у одной стороны нет суффикса — тот же человек (ПП «ИМЯ nick» ↔ nick).
      if (ka.indexOf("|") < 0 || kb.indexOf("|") < 0) return true;
    }
  }
  var na = normalizeClientKey_(a);
  var nb = normalizeClientKey_(b);
  return !!(na && nb && na === nb);
}

/** Ник для записи в лист/бронь: полная первая строка, не обрезанный handle. */
function displayClientNick_(raw) {
  var s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/\s*\b(АФК|ПП|БП|Р)\b\s*$/i, "").trim();
  s = s.replace(/\s{2,}/g, " ");
  return s || extractInstagramNick_(raw) || String(raw || "").trim();
}

/** Пометить брони клиента на дату (или все даты дня) как cancelled. */
function cancelBookingsForClient_(ss, clientName, deliveryDate) {
  var tz = ss.getSpreadsheetTimeZone();
  if (!String(clientName || "").trim()) return { cancelled: 0 };
  var dateStr = deliveryDate ? dateKey_(deliveryDate, tz) : "";
  var sh = getBookingsSheet_();
  var all = readAllBookings_();
  var n = 0;
  for (var i = 0; i < all.length; i++) {
    var b = all[i];
    if (String(b.status) === "cancelled") continue;
    if (!nicksMatch_(b.client, clientName)) continue;
    if (dateStr) {
      var bd = parseFlexibleDate_(b.date, tz);
      if (!bd || dateKey_(bd, tz) !== dateStr) continue;
    }
    sh.getRange(b.rowIndex, 9).setValue("cancelled");
    sh.getRange(b.rowIndex, 11).setValue(new Date());
    n++;
  }
  return { cancelled: n };
}

/** Отменить строки Календарь_Дат на дату (все матчи ника / matchKey). */
function cancelCalendarClientOnDate_(ss, clientName, deliveryDate, matchKeyOpt) {
  var tz = ss.getSpreadsheetTimeZone();
  var client = String(clientName || "").trim();
  if (!deliveryDate || !client) return { removed: 0 };
  var matchKey = String(matchKeyOpt || "").trim() || clientMatchKey_(client);
  var all = readAllCalendarRows_();
  var want = dateKey_(deliveryDate, tz);
  var removed = 0;
  var sh = getCalendarSheet_();
  for (var i = all.length - 1; i >= 0; i--) {
    var st = String(all[i].status || "").toLowerCase();
    if (st === "cancelled") continue;
    var bd = parseFlexibleDate_(all[i].date, tz) || parseFlexibleDate_(all[i].dateIso, tz);
    if (!bd || dateKey_(bd, tz) !== want) continue;
    var same = (matchKey && all[i].matchKey === matchKey) || nicksMatch_(all[i].client, client);
    if (!same) continue;
    sh.getRange(all[i].rowIndex, 12).setValue("cancelled");
    sh.getRange(all[i].rowIndex, 14).setValue(new Date());
    removed++;
  }
  return { removed: removed };
}

/** Ключи клиентов, уже отменённых в календаре на дату — чтобы seed из CRM их не воскрешал. */
function cancelledCalendarKeysForDate_(ss, deliveryDate) {
  var tz = ss.getSpreadsheetTimeZone();
  var want = dateKey_(deliveryDate, tz);
  var all = readAllCalendarRows_();
  var keys = {};
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].status || "").toLowerCase() !== "cancelled") continue;
    var bd = parseFlexibleDate_(all[i].date, tz) || parseFlexibleDate_(all[i].dateIso, tz);
    if (!bd || dateKey_(bd, tz) !== want) continue;
    var mk = all[i].matchKey || clientMatchKey_(all[i].client) || "";
    if (mk) keys[mk] = true;
    var ig = extractInstagramNick_(all[i].client);
    if (ig) keys[normalizeClientKey_(ig).replace(/[._]/g, "")] = true;
  }
  return keys;
}

function isCancelledCalendarKey_(keys, client, matchKeyOpt) {
  keys = keys || {};
  var mk = String(matchKeyOpt || "").trim() || clientMatchKey_(client) || "";
  if (mk && keys[mk]) return true;
  var ig = extractInstagramNick_(client);
  if (ig) {
    var ik = normalizeClientKey_(ig).replace(/[._]/g, "");
    if (ik && keys[ik]) return true;
  }
  return false;
}

function handleDeleteClient(ss, json, callback) {
  var tz = ss.getSpreadsheetTimeZone();
  var dayName = String(json.day || "").trim();
  var deliveryDate = parseFlexibleDate_(json.date || json.deliveryDate, tz);
  if (!dayName && deliveryDate) {
    dayName = findDayNameForDate_(ss, deliveryDate) || "";
  }
  if (!deliveryDate && dayName) {
    try {
      var rawD = getDayDate_(ss, dayName);
      deliveryDate = parseFlexibleDate_(rawD, tz);
    } catch (eD) {}
  }

  var clearedWeek = false;
  var clearedCols = 0;
  var block = getDayBlock(dayName);
  var clientRaw = String(json.client || "").trim();
  if (block && clientRaw) {
    var targetSheet = getTargetSheet(ss, block);
    if (targetSheet) {
      var nicksRowValues = targetSheet.getRange(block.nick, 3, 1, 15).getValues()[0];
      // все столбцы с этим ником (дубликаты тоже) — через nicksMatch_
      for (var i = 0; i < 15; i++) {
        if (!String(nicksRowValues[i] || "").trim()) continue;
        if (!nicksMatch_(nicksRowValues[i], clientRaw)) continue;
        var targetCol = i + 3;
        targetSheet.getRange(block.nick, targetCol).setValue("");
        targetSheet.getRange(block.start, targetCol, block.note - block.start + 1, 1).clearContent();
        clearedWeek = true;
        clearedCols++;
      }
    }
  }

  var bookRes = { cancelled: 0 };
  var calRes = { removed: 0 };
  try {
    // только на дату дня — не трогаем брони других дат того же ника
    if (deliveryDate) {
      bookRes = cancelBookingsForClient_(ss, clientRaw, deliveryDate);
      calRes = cancelCalendarClientOnDate_(ss, clientRaw, deliveryDate, json.matchKey || "");
    }
  } catch (eBook) {}

  // курьерская галочка на дату дня — убрать ник/флаг, если есть
  try {
    var courier = ss.getSheetByName("Доставки");
    if (courier && deliveryDate) {
      var dateText = formatSheetDate(deliveryDate, tz);
      if (formatSheetDate(courier.getRange("A1").getValue(), tz) === dateText) {
        var cCol = findCourierClientCol_(courier, clientRaw);
        if (cCol > 0) {
          courier.getRange(2, cCol).setValue(false);
          courier.getRange(3, cCol).setValue("");
        }
      }
    }
  } catch (eCour) {}

  if (clearedWeek) {
    try { checkLiveDeficitAndNotify(); } catch (eDef) {}
  }

  if (clearedWeek || (bookRes && bookRes.cancelled > 0) || (calRes && calRes.removed > 0)) {
    bustClientsCache_();
    return jsonp(callback, {
      status: "success",
      clearedWeek: clearedWeek,
      clearedCols: clearedCols,
      cancelledBookings: bookRes.cancelled || 0,
      cancelledCalendar: calRes.removed || 0,
      day: dayName || ""
    });
  }
  // уже нет ни в неделе, ни в бронях — не ошибка (повторное удаление / рассинхрон UI)
  bustClientsCache_();
  return jsonp(callback, {
    status: "success",
    alreadyGone: true,
    day: dayName || ""
  });
}

function clearClientColumnFromDay_(ss, dayName, client, matchKeyOpt) {
  var block = getDayBlock(dayName);
  if (!block || !client) return 0;
  var sh = getTargetSheet(ss, block);
  if (!sh) return 0;
  var wantKey = String(matchKeyOpt || "").trim() || clientMatchKey_(client) || "";
  var nicks = sh.getRange(block.nick, 3, 1, 15).getValues()[0];
  var cleared = 0;
  for (var i = 0; i < 15; i++) {
    var nick = nicks[i];
    if (!String(nick || "").trim()) continue;
    var hit = nicksMatch_(nick, client);
    if (!hit && wantKey) hit = clientMatchKey_(nick) === wantKey;
    if (!hit) continue;
    var col = i + 3;
    sh.getRange(block.nick, col).setValue("");
    sh.getRange(block.start, col, block.note - block.start + 1, 1).clearContent();
    cleared++;
  }
  return cleared;
}

/** Убрать человека со всех блоков недели (Пн–Вс + Будущая), кроме keepDay (если задан). */
function clearClientFromWeekSheets_(ss, client, matchKeyOpt, keepDay) {
  var days = MANAGER_DAY_NAMES_.concat(["Будущая неделя"]);
  var keep = String(keepDay || "").trim();
  var total = 0;
  for (var i = 0; i < days.length; i++) {
    if (keep && days[i] === keep) continue;
    total += clearClientColumnFromDay_(ss, days[i], client, matchKeyOpt);
  }
  return total;
}

/**
 * На «Будущей» не должны висеть люди, чья дата в календаре ≠ A1 «Будущей»
 * (типичный баг: перенос «дальше будущей» писал колонку на лист).
 * Тяжёлый (весь Календарь_Дат) — не чаще раза в 10 мин, иначе таймауты в мини-аппе.
 */
function scrubFutureWeekOrphans_(ss, opts) {
  opts = opts || {};
  var force = !!(opts.force === true || opts.force === "1" || opts.force === 1);
  if (!force) {
    try {
      if (CacheService.getScriptCache().get("SCRUB_FUT_V1") === "1") {
        return { removed: 0, skipped: true };
      }
    } catch (eSkip) {}
  }
  var future = ss.getSheetByName("Будущая неделя");
  if (!future) return { removed: 0 };
  var tz = ss.getSpreadsheetTimeZone();
  var futDate = parseFlexibleDate_(future.getRange("A1").getValue(), tz);
  var futKey = futDate ? dateKey_(futDate, tz) : "";
  var block = getDayBlock("Будущая неделя");
  if (!block) return { removed: 0 };
  var nicks = future.getRange(block.nick, 3, 1, 15).getValues()[0];
  var removed = 0;
  var allCal = [];
  try { allCal = readAllCalendarRows_(); } catch (eC) { allCal = []; }
  for (var i = 0; i < 15; i++) {
    var nick = String(nicks[i] || "").trim();
    if (!nick) continue;
    var mk = clientMatchKey_(nick);
    var dates = [];
    for (var c = 0; c < allCal.length; c++) {
      var st = String(allCal[c].status || "").toLowerCase();
      if (st === "cancelled") continue;
      if (!nicksMatch_(allCal[c].client, nick) &&
          !(mk && allCal[c].matchKey && allCal[c].matchKey === mk)) continue;
      var bd = parseFlexibleDate_(allCal[c].date, tz) || parseFlexibleDate_(allCal[c].dateIso, tz);
      if (bd) dates.push(dateKey_(bd, tz));
    }
    if (!dates.length) continue;
    var onFut = futKey && dates.indexOf(futKey) >= 0;
    if (onFut) continue;
    // есть дата(ы) в календаре, но не A1 «Будущей» — колонка-сирота
    future.getRange(block.nick, i + 3).setValue("");
    future.getRange(block.start, i + 3, block.note - block.start + 1, 1).clearContent();
    removed++;
  }
  if (removed) {
    try { bustClientsCache_(); } catch (eB) {}
  }
  try { CacheService.getScriptCache().put("SCRUB_FUT_V1", "1", 600); } catch (ePut) {}
  return { removed: removed };
}

function handleMoveClient(ss, json, callback) {
  var srcBlock = getDayBlock(json.oldDay);
  var tz = ss.getSpreadsheetTimeZone();
  var clientName = String(json.client || "").trim();
  var matchKey = String(json.matchKey || "").trim();
  var oldDate = parseFlexibleDate_(json.oldDate || json.fromDate, tz) ||
    (srcBlock ? parseFlexibleDate_(getDayDate_(ss, json.oldDay), tz) : null);
  var newDate = parseFlexibleDate_(json.newDate || json.date || json.toDate, tz);

  // целевой день ТОЛЬКО если дата реально стоит на листе (Пн–Пт / A1 Будущей)
  var targetDayName = "";
  if (newDate) {
    targetDayName = findDayNameForDate_(ss, newDate) || "";
  } else {
    targetDayName = String(json.newDay || json.day || "").trim();
    if (targetDayName) newDate = parseFlexibleDate_(getDayDate_(ss, targetDayName), tz);
  }

  var calendarOnly = !!(json.calendarOnly === true || json.calendarOnly === "1" || json.calendarOnly === 1) ||
    !!(newDate && !targetDayName);
  var dateOnly = !!(json.dateOnly === true || json.dateOnly === "1" || json.dateOnly === 1);

  // дата дальше «Будущей» / вне недели — убрать с листа, оставить только календарь/бронь/CRM
  if (calendarOnly) {
    if (!clientName) return jsonp(callback, { status: "no_client" });
    if (!newDate) return jsonp(callback, { status: "need_date" });
    var cleared = 0;
    if (srcBlock) cleared += clearClientColumnFromDay_(ss, json.oldDay, clientName, matchKey);
    // на всякий случай снять и с «Будущей» / других дней
    cleared += clearClientFromWeekSheets_(ss, clientName, matchKey, "");
    var noteCal = "";
    var dateSyncCal = { calendar: 0, bookings: 0, crm: 0 };
    try {
      if (oldDate && newDate && dateKey_(oldDate, tz) !== dateKey_(newDate, tz)) {
        dateSyncCal = moveClientDeliveryDateEverywhere_(ss, clientName, oldDate, newDate, {
          matchKey: matchKey,
          note: noteCal,
          dayName: ""
        });
      } else if (newDate) {
        try {
          upsertCalendarEntry_(ss, {
            date: newDate,
            client: clientName,
            matchKey: matchKey,
            dayName: "",
            status: "planned"
          });
          dateSyncCal.calendar = 1;
        } catch (eUp) {}
      }
    } catch (eSyncCal) {
      dateSyncCal.error = String(eSyncCal);
    }
    try { scrubFutureWeekOrphans_(ss, { force: true }); } catch (eScrub) {}
    bustClientsCache_();
    try { clearCrmSheetCache_(); } catch (eC0) {}
    return jsonp(callback, {
      status: "success",
      calendarOnly: true,
      clearedCols: cleared,
      calendarMoved: dateSyncCal.calendar || 0,
      bookingsMoved: dateSyncCal.bookings || 0,
      crmMoved: dateSyncCal.crm || 0,
      surveysMoved: dateSyncCal.surveys || 0,
      dateSync: dateSyncCal
    });
  }

  var dstBlock = getDayBlock(targetDayName);
  if (!srcBlock || !dstBlock) return jsonp(callback, { status: "bad_day" });

  // тот же блок дня, но дата сменилась на другую, всё ещё на листе (A1 Будущей = newDate)
  if (dateOnly || String(json.oldDay || "").trim() === targetDayName) {
    if (!oldDate || !newDate) return jsonp(callback, { status: "need_date" });
    if (dateKey_(oldDate, tz) === dateKey_(newDate, tz)) {
      return jsonp(callback, { status: "same_date" });
    }
    // если целевая дата уже не этот блок — calendarOnly выше; здесь блок совпал
    var noteOnly = "";
    try {
      var shOnly = getTargetSheet(ss, srcBlock);
      var wantOnly = clientName.toUpperCase();
      var nicksOnly = shOnly.getRange(srcBlock.nick, 3, 1, 15).getValues()[0];
      for (var io = 0; io < 15; io++) {
        if (String(nicksOnly[io] || "").trim().toUpperCase() === wantOnly ||
            nicksMatch_(nicksOnly[io], clientName)) {
          noteOnly = String(shOnly.getRange(srcBlock.note, io + 3).getValue() || "");
          break;
        }
      }
    } catch (eNote) {}
    var dateSyncOnly = { calendar: 0, bookings: 0, crm: 0 };
    try {
      dateSyncOnly = moveClientDeliveryDateEverywhere_(ss, clientName, oldDate, newDate, {
        matchKey: matchKey,
        note: noteOnly,
        dayName: targetDayName
      });
    } catch (eSyncOnly) {
      dateSyncOnly.error = String(eSyncOnly);
    }
    bustClientsCache_();
    try { clearCrmSheetCache_(); } catch (eC1) {}
    return jsonp(callback, {
      status: "success",
      dateOnly: true,
      calendarMoved: dateSyncOnly.calendar || 0,
      bookingsMoved: dateSyncOnly.bookings || 0,
      crmMoved: dateSyncOnly.crm || 0,
      surveysMoved: dateSyncOnly.surveys || 0,
      dateSync: dateSyncOnly
    });
  }

  var sourceSheet = getTargetSheet(ss, srcBlock);
  var targetSheet = getTargetSheet(ss, dstBlock);
  if (!sourceSheet || !targetSheet) return jsonp(callback, { status: "error" });

  var want = clientName.toUpperCase();
  var oldClientCol = -1;
  var srcNicks = sourceSheet.getRange(srcBlock.nick, 3, 1, 15).getValues()[0];
  for (var i = 0; i < 15; i++) {
    var sNick = srcNicks[i] ? srcNicks[i].toString().trim().toUpperCase() : "";
    if (sNick === want) {
      oldClientCol = i + 3;
      break;
    }
  }
  if (oldClientCol === -1) {
    for (var i2 = 0; i2 < 15; i2++) {
      if (nicksMatch_(srcNicks[i2], clientName) ||
          (matchKey && clientMatchKey_(srcNicks[i2]) === matchKey)) {
        oldClientCol = i2 + 3;
        break;
      }
    }
  }
  if (oldClientCol === -1) return jsonp(callback, { status: "src_client_not_found" });

  var oldMeatValues = sourceSheet.getRange(srcBlock.start, oldClientCol, srcBlock.end - srcBlock.start + 1, 1).getValues();
  var oldAddressValue = sourceSheet.getRange(srcBlock.addr, oldClientCol).getValue();
  var oldNoteValue = sourceSheet.getRange(srcBlock.note, oldClientCol).getValue();
  var noteStr = String(oldNoteValue || "");
  noteStr = noteStr.replace(/\s*\[НЕ РЕЗАТЬ\]/gi, "").replace(/\s*\[РЕЗАТЬ\]/gi, "").trim();
  var cutRaw = !(json.cutRaw === false || json.cutRaw === "0" || json.cutRaw === 0 || json.cutRaw === "false");
  if (!cutRaw) noteStr = (noteStr ? noteStr + " " : "") + "[НЕ РЕЗАТЬ]";
  else noteStr = (noteStr ? noteStr + " " : "") + "[РЕЗАТЬ]";

  var newClientCol = -1;
  var tgtNicks = targetSheet.getRange(dstBlock.nick, 3, 1, 15).getValues()[0];
  for (var j = 0; j < 15; j++) {
    var tNick = tgtNicks[j] ? tgtNicks[j].toString().trim().toUpperCase() : "";
    if (tNick === want || nicksMatch_(tgtNicks[j], clientName) ||
        (matchKey && clientMatchKey_(tgtNicks[j]) === matchKey)) {
      newClientCol = j + 3;
      break;
    }
  }
  if (newClientCol === -1) {
    for (var colIdx = 3; colIdx <= 17; colIdx++) {
      if (targetSheet.getRange(dstBlock.nick, colIdx).getValue().toString().trim() === "") {
        newClientCol = colIdx;
        targetSheet.getRange(dstBlock.nick, newClientCol).setValue(clientName);
        break;
      }
    }
  }
  if (newClientCol === -1) return jsonp(callback, { status: "no_free_columns" });

  targetSheet.getRange(dstBlock.start, newClientCol, dstBlock.end - dstBlock.start + 1, 1).setValues(oldMeatValues);
  targetSheet.getRange(dstBlock.addr, newClientCol).setValue(oldAddressValue);
  targetSheet.getRange(dstBlock.note, newClientCol).setValue(noteStr);

  sourceSheet.getRange(srcBlock.nick, oldClientCol).setValue("");
  sourceSheet.getRange(srcBlock.start, oldClientCol, srcBlock.note - srcBlock.start + 1, 1).clearContent();
  // если дубликат остался на другом дне (часто «Будущая») — убрать
  try { clearClientFromWeekSheets_(ss, clientName, matchKey, targetDayName); } catch (eClrDup) {}

  var dateSync = { calendar: 0, bookings: 0, crm: 0 };
  try {
    if (oldDate && newDate) {
      dateSync = moveClientDeliveryDateEverywhere_(ss, clientName, oldDate, newDate, {
        matchKey: matchKey,
        address: oldAddressValue,
        note: noteStr,
        dayName: targetDayName
      });
    }
  } catch (eSync) {
    dateSync.error = String(eSync);
  }

  try { scrubFutureWeekOrphans_(ss, { force: true }); } catch (eScrub2) {}
  try { CacheService.getScriptCache().remove("WH_PLAN_V2"); } catch (eWhC) {}
  checkLiveDeficitAndNotify();
  var whAlertMove = null;
  try {
    var packMove = computeWarehouseWeekPlan_(ss);
    if (packMove && packMove.deficits && packMove.deficits.length) {
      whAlertMove = {
        count: packMove.deficits.length,
        top: packMove.deficits.slice(0, 5).map(function (d) {
          return d.name + " −" + d.deficit + (d.unit || "кг");
        })
      };
    }
  } catch (eWhM) {}
  bustClientsCache_();
  try { clearCrmSheetCache_(); } catch (eC) {}
  return jsonp(callback, {
    status: "success",
    cutRaw: cutRaw,
    newDay: targetDayName,
    calendarMoved: dateSync.calendar || 0,
    bookingsMoved: dateSync.bookings || 0,
    crmMoved: dateSync.crm || 0,
    surveysMoved: dateSync.surveys || 0,
    dateSync: dateSync,
    warehouseAlert: whAlertMove
  });
}

/**
 * Перенос человека на другую дату доставки во всех таблицах даты:
 * Календарь_Дат, Брони_Заказов, CRM-месяц (Июль/Август…), открытые опросники (+meta БП).
 */
function moveClientDeliveryDateEverywhere_(ss, client, oldDate, newDate, opts) {
  opts = opts || {};
  var out = { calendar: 0, bookings: 0, crm: 0, surveys: 0, surveyDeltaDays: 0, bpMeta: 0, createdCalendar: false };
  if (!ss || !client || !oldDate || !newDate) return out;
  var tz = ss.getSpreadsheetTimeZone();
  var oldKey = dateKey_(oldDate, tz);
  var newKey = dateKey_(newDate, tz);
  if (!oldKey || !newKey) return out;

  try { out.calendar = moveCalendarClientDate_(ss, client, oldDate, newDate, opts); } catch (e1) {}
  try { out.bookings = moveBookingsClientDate_(ss, client, oldDate, newDate, opts); } catch (e2) {}
  try {
    var crmSs = getCrmSpreadsheet_();
    out.crm = moveCrmMonthClientCell_(crmSs, client, oldDate, newDate, opts.matchKey || "");
  } catch (e3) {}

  // если в Календарь_Дат не было строки на старой дате — создаём на новой (чтобы месяц не «терял» человека)
  if (!(out.calendar > 0) && oldKey !== newKey) {
    try {
      upsertCalendarEntry_(ss, {
        date: newDate,
        client: client,
        matchKey: opts.matchKey || clientMatchKey_(client),
        address: opts.address || "",
        note: opts.note || "",
        dayName: opts.dayName || findDayNameForDate_(ss, newDate) || "",
        source: "move",
        status: "planned"
      });
      out.createdCalendar = true;
      out.calendar = 1;
    } catch (e4) {}
  }

  // опросники: dueDate сдвигается на тот же Δ дней, что и доставка (+ теги в карточке БП)
  if (oldKey !== newKey) {
    try {
      var crmSv = getCrmSpreadsheet_();
      var sv = shiftOpenSurveysOnDeliveryMove_(crmSv, client, oldDate, newDate, opts);
      out.surveys = (sv && sv.shifted) || 0;
      out.surveyDeltaDays = (sv && sv.deltaDays) || 0;
      out.bpMeta = (sv && sv.bpMeta) || 0;
    } catch (eSv) {
      out.surveyError = String(eSv);
    }
  }
  return out;
}

function moveCalendarClientDate_(ss, client, oldDate, newDate, opts) {
  opts = opts || {};
  var tz = ss.getSpreadsheetTimeZone();
  var oldWant = dateKey_(oldDate, tz);
  var newStr = dateKey_(newDate, tz);
  var newIso = isoDateKey_(newDate, tz);
  if (oldWant === newStr) return 0;
  var dayName = String(opts.dayName || "").trim() || findDayNameForDate_(ss, newDate) || "";
  var matchKey = String(opts.matchKey || "").trim() || clientMatchKey_(client);
  var all = readAllCalendarRows_();
  var sh = getCalendarSheet_();
  var moved = 0;
  for (var i = 0; i < all.length; i++) {
    var st = String(all[i].status || "").toLowerCase();
    if (st === "cancelled") continue;
    var bd = parseFlexibleDate_(all[i].date, tz) || parseFlexibleDate_(all[i].dateIso, tz);
    if (!bd || dateKey_(bd, tz) !== oldWant) continue;
    var same = false;
    if (matchKey && all[i].matchKey && all[i].matchKey === matchKey) same = true;
    if (!same && nicksMatch_(all[i].client, client)) same = true;
    if (!same) continue;
    sh.getRange(all[i].rowIndex, 1).setValue(newStr);
    sh.getRange(all[i].rowIndex, 2).setValue(newIso);
    sh.getRange(all[i].rowIndex, 13).setValue(dayName);
    sh.getRange(all[i].rowIndex, 14).setValue(new Date());
    if (opts.address != null && opts.address !== "") {
      sh.getRange(all[i].rowIndex, 6).setValue(opts.address);
    }
    if (opts.note != null && String(opts.note) !== "") {
      sh.getRange(all[i].rowIndex, 8).setValue(opts.note);
    }
    moved++;
  }
  return moved;
}

function moveBookingsClientDate_(ss, client, oldDate, newDate, opts) {
  opts = opts || {};
  var tz = ss.getSpreadsheetTimeZone();
  var oldWant = dateKey_(oldDate, tz);
  var newStr = dateKey_(newDate, tz);
  if (oldWant === newStr) return 0;
  var dayName = String(opts.dayName || "").trim() || findDayNameForDate_(ss, newDate) || "";
  var sh = getBookingsSheet_();
  var all = readAllBookings_();
  var moved = 0;
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].status) === "cancelled") continue;
    if (!nicksMatch_(all[i].client, client)) continue;
    var bd = parseFlexibleDate_(all[i].date, tz);
    if (!bd || dateKey_(bd, tz) !== oldWant) continue;
    sh.getRange(all[i].rowIndex, 2).setValue(newStr);
    sh.getRange(all[i].rowIndex, 10).setValue(dayName);
    sh.getRange(all[i].rowIndex, 11).setValue(new Date());
    moved++;
  }
  return moved;
}

/** Найти ячейку человека в CRM-месяце на дату. */
function findCrmMonthClientCell_(sh, deliveryDate, client, matchKeyOpt) {
  if (!sh || !deliveryDate || !client) return null;
  var dayNum = deliveryDate.getDate();
  var lastCol = Math.max(1, sh.getLastColumn());
  var lastRow = Math.max(1, sh.getLastRow());
  if (lastRow < 2) return null;
  var data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var blocks = findCrmMonthDayBlocks_(data);
  var matchKey = String(matchKeyOpt || "").trim() || clientMatchKey_(client);
  for (var b = 0; b < blocks.length; b++) {
    var bl = blocks[b];
    var col = bl.dayToCol[dayNum] != null ? bl.dayToCol[dayNum] : bl.dayToCol[String(dayNum)];
    if (col == null) continue;
    for (var r = bl.dataStart; r <= bl.dataEnd; r++) {
      var raw = (data[r] || [])[col];
      var parsed = parseCrmCalendarCell_(raw);
      if (!parsed) continue;
      var same = (matchKey && parsed.matchKey === matchKey) || nicksMatch_(parsed.client, client);
      if (!same) continue;
      return {
        row: r + 1,
        col: col + 1,
        text: raw,
        parsed: parsed,
        sheet: sh.getName()
      };
    }
  }
  return null;
}

/** Первая пустая ячейка в колонке дня CRM-месяца. */
function findCrmMonthEmptyCell_(sh, deliveryDate) {
  if (!sh || !deliveryDate) return null;
  var dayNum = deliveryDate.getDate();
  var lastCol = Math.max(1, sh.getLastColumn());
  var lastRow = Math.max(1, sh.getLastRow());
  if (lastRow < 2) return null;
  var data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var blocks = findCrmMonthDayBlocks_(data);
  for (var b = 0; b < blocks.length; b++) {
    var bl = blocks[b];
    var col = bl.dayToCol[dayNum] != null ? bl.dayToCol[dayNum] : bl.dayToCol[String(dayNum)];
    if (col == null) continue;
    for (var r = bl.dataStart; r <= bl.dataEnd; r++) {
      if (!String((data[r] || [])[col] || "").trim()) {
        return { row: r + 1, col: col + 1, sheet: sh.getName() };
      }
    }
    // нет пустой — дописать в конец блока
    var appendRow = bl.dataEnd + 2;
    return { row: appendRow, col: col + 1, sheet: sh.getName() };
  }
  return null;
}

/** Перенести ячейку человека на листе месяца CRM (Июль/Август…) со старого дня на новый. */
function moveCrmMonthClientCell_(crmSs, client, oldDate, newDate, matchKeyOpt) {
  if (!crmSs || !client || !oldDate || !newDate) return 0;
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  if (dateKey_(oldDate, tz) === dateKey_(newDate, tz)) return 0;
  var oldSh = resolveCrmMonthSheet_(crmSs, oldDate);
  if (!oldSh) return 0;
  var found = findCrmMonthClientCell_(oldSh, oldDate, client, matchKeyOpt);
  if (!found) return 0;
  var newSh = resolveCrmMonthSheet_(crmSs, newDate) || oldSh;
  var slot = findCrmMonthEmptyCell_(newSh, newDate);
  if (!slot) return 0;
  // не затирать сам себя при том же листе/ячейке
  if (newSh.getSheetId() === oldSh.getSheetId() && slot.row === found.row && slot.col === found.col) {
    return 0;
  }
  newSh.getRange(slot.row, slot.col).setValue(found.text);
  oldSh.getRange(found.row, found.col).clearContent();
  return 1;
}

/**
 * Куда реально писать заказ:
 * — дата совпала с Пн–Пт / A1 «Будущей» → этот день
 * — дата дальше (не совпала) → "" (только бронь/календарь, НЕ лист недели)
 * — без даты: клиент уже на «Будущей» → туда; иначе dayHint
 */
function clientNickOnDay_(ss, dayName, client) {
  if (!dayName || !client) return false;
  try {
    var data = getClientsData_(ss, dayName);
    for (var i = 0; i < (data.clients || []).length; i++) {
      if (nicksMatch_(data.clients[i].name, client)) return true;
    }
  } catch (e) {}
  // пустой тест мог быть вычищен getClientsData_ — смотрим ник в листе напрямую
  try {
    var block = getDayBlock(dayName);
    var sh = block && getTargetSheet(ss, block);
    if (!sh) return false;
    var nicks = sh.getRange(block.nick, 3, 1, 15).getValues()[0];
    for (var j = 0; j < 15; j++) {
      if (nicksMatch_(nicks[j], client)) return true;
    }
  } catch (e2) {}
  return false;
}

function resolveDayForOrderWrite_(ss, json) {
  json = json || {};
  var tz = ss.getSpreadsheetTimeZone();
  var client = String(json.client || "").trim();
  var dayHint = String(json.day || "").trim();
  var d = parseFlexibleDate_(json.date || json.deliveryDate, tz);

  if (d) {
    var byDate = findDayNameForDate_(ss, d);
    if (byDate) return byDate;
    // дата дальше текущей Пн–Пт и A1 «Будущей» — только бронь/календарь, НЕ лист недели
    return "";
  }

  // человек уже стоит на Будущей — состав сюда, даже если UI подставил «Вторник»
  if (client && clientNickOnDay_(ss, "Будущая неделя", client)) {
    return "Будущая неделя";
  }

  if (dayHint === "Будущая неделя") return "Будущая неделя";

  if (dayHint && getDayBlock(dayHint)) return dayHint;
  return dayHint || "";
}

/**
 * Сохранение заказа с учётом фракции (sub).
 * orderItem: { name|main, sub, val|value, cat }
 */
function handleSaveOrder(ss, json, callback, fromPost) {
  if (fromPost === undefined) fromPost = true;
  // "internal" — вложенный вызов из saveBooking: без HTTP-ответа, только объект результата
  var silent = fromPost === "internal" || fromPost === "silent";
  var reply = function (obj) {
    if (silent) return obj;
    return fromPost ? jsonpText(callback, obj) : jsonp(callback, obj);
  };
  json = json || {};
  var dayHintOrig = String(json.day || "").trim();
  var tzSo = ss.getSpreadsheetTimeZone();
  var dateGiven = !!parseFlexibleDate_(json.date || json.deliveryDate, tzSo);
  var writeDay = resolveDayForOrderWrite_(ss, json);
  // дата задана, но не Пн–Пт / A1 «Будущей» — не писать по dayHint (иначе двойная запись на «Будущую»/чужой день)
  if (dateGiven && !writeDay) {
    return reply({ status: "beyond_week", day: "", message: "date_not_on_week_sheet" });
  }
  if (writeDay) json.day = writeDay;
  var block = getDayBlock(json.day);
  if (!block) return reply({ status: "bad_day", day: json.day || "" });
  var targetSheet = getTargetSheet(ss, block);
  if (!targetSheet) return reply({ status: "error" });
  if (!String(json.client || "").trim()) return reply({ status: "no_client" });

  var clientCol = -1;
  var mgrNicks = targetSheet.getRange(block.nick, 3, 1, 15).getValues()[0];
  var editClient = String(json.editClient || json.originalClient || "").trim();
  var wantMatchKey = String(json.matchKey || "").trim();
  // 1) правка: колонка по matchKey / старому нику
  if (wantMatchKey || editClient) {
    for (var ie = 0; ie < 15; ie++) {
      var nickE = mgrNicks[ie];
      if (!nickE) continue;
      if (wantMatchKey && clientMatchKey_(nickE) === wantMatchKey) {
        clientCol = ie + 3;
        break;
      }
      if (editClient && nicksMatch_(nickE, editClient)) {
        clientCol = ie + 3;
        break;
      }
    }
  }
  // 2) обычный матч по текущему нику
  if (clientCol === -1) {
    for (var i = 0; i < 15; i++) {
      if (nicksMatch_(mgrNicks[i], json.client)) {
        clientCol = i + 3;
        break;
      }
    }
  }
  // 3) новая колонка — только если не правка (нет editClient/matchKey)
  if (clientCol === -1 && !(editClient || wantMatchKey)) {
    for (var colIdx = 3; colIdx <= 17; colIdx++) {
      if (String(targetSheet.getRange(block.nick, colIdx).getValue() || "").trim() === "") {
        clientCol = colIdx;
        targetSheet.getRange(block.nick, clientCol).setValue(String(json.client || "").trim());
        break;
      }
    }
  }
  // правка: ник мог смениться — обновим ячейку ника в найденной колонке
  if (clientCol !== -1 && (editClient || wantMatchKey)) {
    var nickWant = String(json.client || "").trim();
    if (nickWant) targetSheet.getRange(block.nick, clientCol).setValue(nickWant);
  }
  if (clientCol === -1) return reply({ status: "no_free_columns" });

  // очистка товаров + адрес + примечание
  targetSheet.getRange(block.start, clientCol, block.note - block.start + 1, 1).clearContent();
  // ник мог быть затронут только ниже start — вернём на всякий
  var nickNow = String(targetSheet.getRange(block.nick, clientCol).getValue() || "").trim();
  if (!nickNow) targetSheet.getRange(block.nick, clientCol).setValue(String(json.client || "").trim());

  if (json.address) targetSheet.getRange(block.addr, clientCol).setValue(json.address);
  // note = только текст менеджера; тип/цена/слот — в Календарь_Дат / Брони
  var cleanNote = stripTechFromNote_(String(json.note || ""));
  var otSave = String(json.orderType || json.source || "").trim().toLowerCase();
  var segSave = segmentLabelFromOrderType_(otSave);
  if (!segSave) segSave = extractSegmentFromNote_(String(json.note || ""));
  var op = json.orderPrice;
  var orderPriceSave = "";
  if (segSave !== "БП" && op != null && op !== "" && !isNaN(Number(op))) {
    orderPriceSave = Number(op);
  } else {
    var legacyPrice = extractOrderPriceFromNote_(String(json.note || ""));
    if (segSave !== "БП" && legacyPrice !== "") orderPriceSave = legacyPrice;
  }
  var phoneSave = String(json.phone || "").trim();
  if (!phoneSave) phoneSave = extractPhoneFromNote_(String(json.note || ""));
  var explicitPpSlot = !!(
    String(json.ppSlot || "").trim() ||
    (json.deliverySlot != null && json.deliverySlot !== "") ||
    (json.slot != null && json.slot !== "")
  );
  var ppSlotSave = String(json.ppSlot || "").trim();
  if (!ppSlotSave && (json.deliverySlot != null && json.deliverySlot !== "" || json.slot)) {
    var forcedSave = parseForcedPpSlot_(json.deliverySlot != null ? json.deliverySlot : json.slot, 2);
    if (forcedSave >= 1) {
      var dnSave = 2;
      try { dnSave = lookupPpDeliveries_(json.client) || 2; } catch (eDnS) {}
      ppSlotSave = formatPpSlotLabel_(forcedSave, Math.max(dnSave, 2));
    }
  }
  if (!ppSlotSave && segSave === "ПП") {
    try {
      var dayDatePp = getDayDate_(ss, json.day) || parseFlexibleDate_(json.date, ss.getSpreadsheetTimeZone());
      if (dayDatePp) {
        var resolvedPp = resolvePpDeliverySlot_(ss, json.client, dayDatePp, ss.getSpreadsheetTimeZone(), false);
        ppSlotSave = formatPpSlotLabel_(resolvedPp.slot, resolvedPp.deliveriesN);
      }
    } catch (ePpSlot) {}
  }
  if (cleanNote) targetSheet.getRange(block.note, clientCol).setValue(cleanNote);
  else targetSheet.getRange(block.note, clientCol).clearContent();

  var geo = json.geo || null;
  if (typeof geo === "string" && geo) {
    try { geo = JSON.parse(geo); } catch (eG) { geo = null; }
  }
  if (geo && geo.lat != null && geo.lon != null) {
    upsertClientGeo_(ss, json.day, json.client, geo.lat, geo.lon, geo.yandexUrl || "");
  } else {
    clearClientGeo_(ss, json.day, json.client);
  }

  var itemsInSheet = targetSheet.getRange(block.start, 1, block.end - block.start + 1, 1).getValues();
  var basketRaw = normalizeBasketArg_(json.basket);
  // 2 собаки: на лист недели — суммы по позициям; dog-метки сохраняются в Календарь_Дат basketJson
  var basket = mergeBasketQtyForSheet_(basketRaw);

  var wrote = 0;
  var missed = [];
  basket.forEach(function (orderItem) {
    var rawName = String(orderItem.name || orderItem.main || "").trim();
    var rawSub = String(orderItem.sub || "").trim();
    var inputVal = Number(orderItem.val != null ? orderItem.val : orderItem.value) || 0;
    if (!rawName || inputVal <= 0) return;

    var targetRowOffset = findSheetRowForItem(itemsInSheet, rawName, rawSub);
    if (targetRowOffset >= 0) {
      targetSheet.getRange(block.start + targetRowOffset, clientCol).setValue(inputVal);
      wrote++;
    } else {
      missed.push(rawName + (rawSub ? (" / " + rawSub) : ""));
    }
  });

  try {
    var perm = String(json.permanentNote || "").trim();
    var profileNote = perm || ""; // постоянные — в Клиенты/Контакты; разовые не затирают профиль пустым
    var src = String(json.orderType || json.source || "saveOrder");
    upsertClientProfile_(ss, json.client, json.address, phoneSave || extractPhoneFromNote_(cleanNote), profileNote, src, basket);
  } catch (eProf) {}

  try {
    var dayDateCal = getDayDate_(ss, json.day) || parseFlexibleDate_(json.date, ss.getSpreadsheetTimeZone());
    if (dayDateCal) {
      upsertCalendarEntry_(ss, {
        date: dayDateCal,
        client: String(json.client || "").trim(),
        segment: segSave,
        address: json.address || "",
        phone: phoneSave,
        note: cleanNote,
        // dog:1/2 — в календарь целиком; на лист недели уже ушёл merge без dog
        basket: basketRaw,
        subId: json.subId || "",
        source: otSave || "manual",
        dayName: json.day || "",
        orderPrice: orderPriceSave,
        ppSlot: ppSlotSave,
        deliveryAfter: normalizeTimeHm_(json.deliveryAfter),
        deliveryBefore: normalizeTimeHm_(json.deliveryBefore),
        ppPartner: String(json.ppPartner || "").trim(),
        couponsQty: normalizeCouponsQty_(json.couponsQty),
        couponPrice: normalizeCouponUnitPrice_(json.couponPrice),
        status: "planned",
        legacyRef: "week:" + String(json.day || "")
      });
    }
  } catch (eCalSave) {}

  try { ensureBpAndSurveyFromOrder_(json); } catch (eBp) {}
  // явный ПП 1/2 от менеджера → якорь (один раз на клиента)
  if (explicitPpSlot && segSave === "ПП" && ppSlotSave) {
    try {
      var dnAnch = lookupPpDeliveries_(json.client);
      var slotAnch = parseForcedPpSlot_(ppSlotSave, dnAnch >= 2 ? dnAnch : 2);
      if (dnAnch >= 2 && slotAnch >= 1) {
        var dayDateAnch = getDayDate_(ss, json.day) || parseFlexibleDate_(json.date, ss.getSpreadsheetTimeZone());
        markPpSlotAnchor_(ss, json.client, slotAnch, dayDateAnch);
      }
    } catch (eAnch) {}
  }
  bustClientsCache_();
  try {
    var dayU = String(json.day || "").toUpperCase();
    CacheService.getScriptCache().remove("ASM:" + dayU);
    CacheService.getScriptCache().remove("COUR:" + dayU);
  } catch (eAsm) {}
  // после записи в неделю — пересчитать дефицит, задачи «Дозакуп», TG СРОЧНО (с антиспамом)
  var whAlert = null;
  try {
    CacheService.getScriptCache().remove("WH_PLAN_V2");
    checkLiveDeficitAndNotify();
    var packWh = computeWarehouseWeekPlan_(ss);
    if (packWh && packWh.deficits && packWh.deficits.length) {
      whAlert = {
        count: packWh.deficits.length,
        top: packWh.deficits.slice(0, 5).map(function (d) {
          return d.name + " −" + d.deficit + (d.unit || "кг");
        })
      };
    }
  } catch (eWh) {}
  return reply({
    status: "success",
    wrote: wrote,
    basketLen: basket.length,
    dogSplit: basketHasDogSplit_(basketRaw),
    missed: missed.slice(0, 8),
    day: json.day,
    client: String(json.client || "").trim(),
    segment: segSave,
    orderPrice: orderPriceSave,
    ppSlot: ppSlotSave,
    deliveryAfter: normalizeTimeHm_(json.deliveryAfter),
    deliveryBefore: normalizeTimeHm_(json.deliveryBefore),
    redirected: !!(writeDay && dayHintOrig && writeDay !== dayHintOrig),
    warehouseAlert: whAlert
  });
}

/** Сопоставление позиции мини-аппа со строкой листа (с фракцией). */
function findSheetRowForItem(itemsInSheet, rawName, rawSub) {
  var nameU = normalizeProductAlias_(String(rawName || "").toUpperCase().replace(/\s*ШТ\.?/g, "").trim());
  if (nameU.indexOf(" / ") > -1) {
    var parts = nameU.split(" / ");
    nameU = parts[0].trim();
    if (!rawSub) rawSub = parts[1] ? parts[1].trim() : "";
  }

  var subNorm = normalizeFraction(rawSub);
  var bestIdx = -1;
  var bestScore = -1;

  for (var r = 0; r < itemsInSheet.length; r++) {
    var sheetRaw = itemsInSheet[r][0];
    if (!sheetRaw) continue;
    // на листе бывают двойные пробелы («УТИНЫЕ  ШЕИ  шт.»)
    var sheetFull = sheetRaw.toString().trim().toUpperCase().replace(/\s+/g, " ");
    if (sheetFull === "" || sheetFull.indexOf("#") > -1) continue;

    var sheetBase = sheetFull;
    var sheetFrac = "";
    if (sheetFull.indexOf(" / ") > -1) {
      var sp = sheetFull.split(" / ");
      sheetBase = sp[0].trim();
      sheetFrac = normalizeFraction(sp[1] || "");
    } else {
      sheetFrac = extractEmbeddedFraction(sheetFull);
      sheetBase = sheetFull
        .replace(/\s*ШТ\.?/g, "")
        .replace(/\s*ОЧ МАЛ/g, "")
        .replace(/\s*ПОЛОВИНКО?\w*/g, "")
        .replace(/\s*ПОЛОВИНКА/g, "")
        .replace(/\s*ОБЫЧН\w*/g, "")
        .replace(/\s*ПАЛК/g, "")
        .replace(/\s*ПЛАСТ/g, "")
        .replace(/\s*ОГР/g, "")
        .replace(/\s*МАЛ/g, "")
        .replace(/\s*СРЕД/g, "")
        .replace(/\s*БОЛ/g, "")
        .replace(/\s*КРУПНОЕ/g, "")
        .trim();
    }
    sheetBase = normalizeProductAlias_(sheetBase);

    // строго: не матчить «БАРАНЬЕ ЛЁГКОЕ» ↔ «ЛЁГКОЕ» через indexOf внутри строки
    if (!productBasesMatch_(nameU, sheetBase) && !productBasesMatch_(nameU, sheetFull.split(" / ")[0])) {
      continue;
    }

    // уши/аорта без слова фракции на листе = «Обычное»/«Обычная»
    if (!sheetFrac) {
      var baseU = String(sheetBase || "").toUpperCase().replace(/Ё/g, "Е");
      if (/УХО|УШК/.test(baseU)) sheetFrac = "Обычное";
      else if (/АОРТ/.test(baseU)) sheetFrac = "Обычная";
    }

    var score = 1;
    if (subNorm) {
      if (sheetFrac && sheetFrac === subNorm) score = 10;
      // разная фракция на строке — не матчить через indexOf («МАЛ» ⊂ «ОЧ МАЛ»)
      else if (sheetFrac && sheetFrac !== subNorm) score = 0;
      else if (!sheetFrac && sheetFull.indexOf(subNorm) > -1) score = 8;
      else if (!sheetFrac && /ПОЛОВИН/.test(sheetFull) && subNorm === "ПОЛОВИНКА") score = 9;
      else if (!sheetFrac) score = 2;
      else score = 0;
    } else {
      if (!sheetFrac) score = 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = r;
    }
  }
  return bestScore > 0 ? bestIdx : -1;
}

/**
 * Имена продуктов: точное совпадение или префикс до пробела/слэша.
 * Запрещает «ЛЁГКОЕ» ⊂ «БАРАНЬЕ ЛЁГКОЕ».
 */
function productBasesMatch_(a, b) {
  var x = String(a || "").trim().toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ");
  var y = String(b || "").trim().toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ");
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.indexOf(y) === 0) {
    var cx = x.charAt(y.length);
    return !cx || cx === " " || cx === "/";
  }
  if (y.indexOf(x) === 0) {
    var cy = y.charAt(x.length);
    return !cy || cy === " " || cy === "/";
  }
  return false;
}

/** Опечатки / варианты написания в таблице */
function normalizeProductAlias_(nameU) {
  var n = String(nameU || "").trim().replace(/\s+/g, " ");
  var aliases = {
    "ГРУШЫ": "ГРУШИ",
    "ГРУША": "ГРУШИ",
    "ГРУШ": "ГРУШИ",
    "ЯБЛОКО": "ЯБЛОКИ",
    "ЯБЛОК": "ЯБЛОКИ",
    "БАНАН": "БАНАНЫ",
    "МОРКОВКА": "МОРКОВЬ",
    "МОРКОВИ": "МОРКОВЬ",
    "РУБЕЦ": "РУБЕЦ Т",
    "КОРЕНЬ": "БЫЧИЙ КОРЕНЬ",
    "БЫЧИЙКОРЕНЬ": "БЫЧИЙ КОРЕНЬ",
    "ЛЕГКОЕ": "ЛЁГКОЕ",
    "БАРАНЬЕ ЛЕГКОЕ": "БАРАНЬЕ ЛЁГКОЕ",
    "БАРАНЬЕЛЕГКОЕ": "БАРАНЬЕ ЛЁГКОЕ",
    "БАРАНЬЕЛЁГКОЕ": "БАРАНЬЕ ЛЁГКОЕ",
    "УХО": "УХО Г",
    "УШИ": "УХО Г",
    "УШКИ": "УХО Г",
    "УХО ГОВ": "УХО Г",
    "ГОВЯЖЬЕ УХО": "УХО Г",
    "ГОВЯЖЬИ УШИ": "УХО Г",
    "УТИНЫЕШЕИ": "УТИНЫЕ ШЕИ",
    "УТИНАЯ ШЕЯ": "УТИНЫЕ ШЕИ",
    "УТИНАЯШЕЯ": "УТИНЫЕ ШЕИ"
  };
  if (aliases[n]) return aliases[n];
  var n2 = n.replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
  if (aliases[n2]) return aliases[n2];
  if (/^БАРАНЬ?Е?\s*ЛЕГК/.test(n2)) return "БАРАНЬЕ ЛЁГКОЕ";
  if (n2 === "ЛЕГКОЕ") return "ЛЁГКОЕ";
  if (/^УТИН/.test(n2) && /ШЕ/.test(n2)) return "УТИНЫЕ ШЕИ";
  return n2;
}

function normalizeFraction(s) {
  if (!s) return "";
  var u = String(s).trim().toUpperCase().replace(/\s+/g, " ").replace(/Ё/g, "Е");
  // сначала «очень мелкое» — иначе «МАЛ» внутри «ОЧ МАЛ» перехватит
  if (u === "ОЧ МАЛ" || u === "ОЧЕНЬ МЕЛКОЕ" || /ОЧ\s*МАЛ|ОЧЕНЬ\s*(МАЛ|МЕЛК)|СУПЕР\s*(МАЛ|МЕЛК)/.test(u)) return "ОЧ МАЛ";
  if (u === "МЕЛКОЕ" || u === "МАЛ" || u === "МАЛЕНЬКИЙ" || u === "МАЛЕНЬКОЕ" || u === "МЕЛКИЙ" || u === "МЕЛКАЯ") return "МАЛ";
  if (u === "СРЕДНЕЕ" || u === "СРЕД" || u === "СРЕДНИЙ") return "СРЕД";
  if (u === "БОЛЬШОЕ" || u === "БОЛ" || u === "БОЛЬШОЙ") return "БОЛ";
  if (u === "КРУПНОЕ") return "КРУПНОЕ";
  if (u === "ЦЕЛОЕ" || u === "ЦЕЛ") return "ЦЕЛОЕ";
  // лист: «ПОЛОВИНКО» / «ПОЛОВИНКИ» — тот же тип, что каталог «ПОЛОВИНКА»
  if (/^ПОЛОВИН/.test(u) || u.indexOf("ПОЛОВИН") === 0) return "ПОЛОВИНКА";
  if (u === "ПАЛК") return "ПАЛК";
  if (u === "ПЛАСТ") return "ПЛАСТ";
  if (u === "ОГР") return "ОГР";
  // уши/аорта: «Обычное» — реальная фракция, не пустая (иначе пишется в строку без типа)
  if (u === "ОБЫЧНОЕ" || u === "ОБЫЧН" || u === "ЦЕЛЫЕ" || u === "ЦЕЛОЕ УХО") return "Обычное";
  if (u === "ОБЫЧНАЯ") return "Обычная";
  return u;
}

function extractEmbeddedFraction(sheetFull) {
  var u = String(sheetFull || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ");
  if (!u) return "";
  // «ОЧ МАЛ» раньше «МАЛ» — иначе МАЛ перехватит кусок
  if (u.indexOf("ОЧ МАЛ") > -1 || /ОЧЕНЬ\s*(МАЛ|МЕЛК)|СУПЕР\s*(МАЛ|МЕЛК)/.test(u)) return "ОЧ МАЛ";
  if (/ПОЛОВИН/.test(u)) return "ПОЛОВИНКА";
  if (u.indexOf("ПАЛК") > -1) return "ПАЛК";
  if (u.indexOf("ПЛАСТ") > -1) return "ПЛАСТ";
  if (u.indexOf("ОГР") > -1) return "ОГР";
  // \b в JS не работает с кириллицей — граница по не-буквам
  if (/(^|[^А-ЯA-Z0-9])МАЛ([^А-ЯA-Z0-9]|$)/.test(u) || u.indexOf(" МЕЛКОЕ") > -1 || /МЕЛК/.test(u)) return "МАЛ";
  if (u.indexOf("СРЕД") > -1) return "СРЕД";
  // БОЛЬШ… или отдельное БОЛ (не кусок чужого слова)
  if (/БОЛЬШ/.test(u) || /(^|[^А-ЯA-Z0-9])БОЛ([^А-ЯA-Z0-9]|$)/.test(u)) return "БОЛ";
  if (u.indexOf("КРУПН") > -1) return "КРУПНОЕ";
  if (u.indexOf("ЦЕЛ") > -1) return "ЦЕЛОЕ";
  if (/ОБЫЧН/.test(u)) {
    if (/АОРТ/.test(u)) return "Обычная";
    return "Обычное";
  }
  return "";
}

function isCountableClientNick_(nameClean) {
  var t = String(nameClean || "").trim();
  // короткие ники вроде «A» / «Я» — валидны; режем только пустое и мусор
  if (!t || t === "0") return false;
  var up = t.toUpperCase();
  if (up === "ИТОГО НА ДЕНЬ" || up === "ИТОГО" || up === "ФАКТ СНЯТОЕ") return false;
  return true;
}

/** Сколько людей в ник-ряду дня (без корзин — быстро). */
function countClientsOnDayNickRow_(ss, dayName) {
  var block = getDayBlock(dayName);
  if (!block) return { day: dayName, count: 0, date: "" };
  var targetSheet = getTargetSheet(ss, block);
  if (!targetSheet) return { day: dayName, count: 0, date: "" };
  var nickRow = block.nick;
  var totalSheetCols = targetSheet.getLastColumn();
  var colsToRead = totalSheetCols >= 3 ? Math.min(totalSheetCols - 2, 15) : 1;
  var nicks = [];
  try {
    nicks = targetSheet.getRange(nickRow, 3, 1, colsToRead).getValues()[0] || [];
  } catch (eR) { nicks = []; }
  var n = 0;
  for (var i = 0; i < nicks.length; i++) {
    if (isCountableClientNick_(nicks[i])) n++;
  }
  var dateStr = "";
  try {
    var tz = ss.getSpreadsheetTimeZone() || "Europe/Minsk";
    var raw = getDayDate_(ss, dayName);
    var d = parseFlexibleDate_(raw, tz);
    if (d) dateStr = dateKey_(d, tz);
  } catch (eD) {}
  return { day: dayName, count: n, date: dateStr };
}

/** 6 счётчиков: Пн–Пт + Будущая неделя. */
/** Обзор месяца: даты + кол-во людей + микс сегментов (Календарь_Дат). */
function handleGetMonthOverview(json, callback, fromPost) {
  if (fromPost === undefined) fromPost = true;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var monthStr = String((json && (json.month || json.ym)) || "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthStr)) {
    monthStr = Utilities.formatDate(new Date(), tz, "yyyy-MM");
  }
  var force = !!(json && (json.force === "1" || json.force === 1 || json.force === true));
  var cacheKey = "MOV:" + monthStr;
  if (!force) {
    try {
      var cached = cacheGetJson_(cacheKey);
      if (cached && cached.status === "success") {
        return fromPost ? jsonpText(callback, cached) : jsonp(callback, cached);
      }
    } catch (eC) {}
  }
  var all = [];
  try { all = readAllCalendarRows_(); } catch (e0) { all = []; }
  var byDate = {};
  for (var i = 0; i < all.length; i++) {
    var row = all[i];
    var st = String(row.status || "").toLowerCase();
    if (st === "cancelled") continue;
    var iso = String(row.dateIso || "").trim();
    if (!iso || iso.indexOf("-") < 0) {
      var d = parseFlexibleDate_(row.date, tz) || parseFlexibleDate_(row.dateIso, tz);
      if (d) iso = isoDateKey_(d, tz);
    }
    if (!iso || iso.indexOf(monthStr) !== 0) continue;
    if (!byDate[iso]) {
      byDate[iso] = {
        dateIso: iso,
        count: 0,
        segments: { "ПП": 0, "БП": 0, "Р": 0, "ПАРТНЁР": 0, other: 0 }
      };
    }
    byDate[iso].count++;
    var seg = String(row.segment || "").trim().toUpperCase();
    if (seg === "ПП" || seg === "PP" || seg === "АФК" || seg === "AFK") byDate[iso].segments["ПП"]++;
    else if (seg === "БП" || seg === "BP") byDate[iso].segments["БП"]++;
    else if (seg === "Р" || seg === "R" || seg === "RETAIL" || seg === "РОЗНИЦА") byDate[iso].segments["Р"]++;
    else if (seg.indexOf("ПАРТ") === 0 || seg === "PARTNER" || seg === "ВАРКА") byDate[iso].segments["ПАРТНЁР"]++;
    else byDate[iso].segments.other++;
  }
  var daysOut = Object.keys(byDate).sort().map(function (k) { return byDate[k]; });
  var total = 0;
  for (var t = 0; t < daysOut.length; t++) total += Number(daysOut[t].count) || 0;
  var ok = { status: "success", month: monthStr, days: daysOut, total: total };
  try { cachePutJson_(cacheKey, ok, 45); } catch (ePut) {}
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleGetWeekDayCounts(json, callback, fromPost) {
  // 8 счётчиков: Пн–Вс + Будущая
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var days = [
    { day: "Понедельник", short: "Пн" },
    { day: "Вторник", short: "Вт" },
    { day: "Среда", short: "Ср" },
    { day: "Четверг", short: "Чт" },
    { day: "Пятница", short: "Пт" },
    { day: "Суббота", short: "Сб" },
    { day: "Воскресенье", short: "Вс" },
    { day: "Будущая неделя", short: "Буд" }
  ];
  try { ensureManagerWeekendBlocks_(ss); } catch (eEns) {}
  var cacheKey = "WDC:v2";
  try {
    if (!(json && (json.force === "1" || json.force === 1 || json.force === true))) {
      var cached = cacheGetJson_(cacheKey);
      if (cached && cached.status === "success") {
        return fromPost ? jsonpText(callback, cached) : jsonp(callback, cached);
      }
    }
  } catch (eC) {}

  var items = [];
  var total = 0;
  for (var i = 0; i < days.length; i++) {
    var row = countClientsOnDayNickRow_(ss, days[i].day);
    items.push({
      day: days[i].day,
      short: days[i].short,
      count: row.count || 0,
      date: row.date || ""
    });
    total += Number(row.count) || 0;
  }
  var ok = { status: "success", items: items, total: total };
  try { cachePutJson_(cacheKey, ok, 20); } catch (ePut) {}
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleGetClients(dayName, callback, dateStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var resolvedDay = String(dayName || "").trim();
  var deliveryDate = null;
  try { ensureManagerWeekendBlocks_(ss); } catch (eEnsG) {}
  // scrub сирот — только на move / редкий getViewCompare (кэш), не на каждый getClients

  // Дата — главный ключ. Если она НЕ стоит в ячейках недели — не подсовываем чужой блок дня.
  if (dateStr) {
    deliveryDate = parseFlexibleDate_(dateStr, tz);
    if (deliveryDate) {
      var byDate = findDayNameForDate_(ss, deliveryDate);
      if (byDate) {
        resolvedDay = byDate;
      } else {
        var listOnly = clientsFromBookings_(ss, deliveryDate);
        return jsonp(callback, {
          status: "success",
          day: "",
          date: dateKey_(deliveryDate, tz),
          fromBookings: true,
          dateNotInWeek: true,
          clients: listOnly
        });
      }
    }
  }

  if (resolvedDay) {
    var cacheKey = "GC:" + String(resolvedDay || "").toUpperCase();
    // кэш только для чистого day-запроса без даты
    if (!dateStr) {
      var cached = cacheGetJson_(cacheKey);
      if (cached && cached.status) return jsonp(callback, cached);
    }
    var data = getClientsData_(ss, resolvedDay);
    for (var i = 0; i < data.clients.length; i++) delete data.clients[i].col;
    data.day = resolvedDay;
    if (!deliveryDate) {
      var rawDayDate = getDayDate_(ss, resolvedDay);
      deliveryDate = parseFlexibleDate_(rawDayDate, tz);
    }
    data.date = deliveryDate ? dateKey_(deliveryDate, tz) : "";
    // брони на дату дня — только если блок пуст
    if (deliveryDate && (!data.clients || !data.clients.length)) {
      var fromBookings = clientsFromBookings_(ss, deliveryDate);
      if (fromBookings.length) {
        data.status = "success";
        data.clients = fromBookings;
        data.fromBookings = true;
      }
    }
    if (!dateStr && data.status === "success") cachePutJson_(cacheKey, data, 75);
    return jsonp(callback, data);
  }

  if (deliveryDate) {
    var list = clientsFromBookings_(ss, deliveryDate);
    return jsonp(callback, {
      status: "success",
      day: "",
      date: dateKey_(deliveryDate, tz),
      fromBookings: true,
      clients: list
    });
  }
  return jsonp(callback, { status: "bad_day", clients: [] });
}

function clientsFromBookings_(ss, deliveryDate) {
  var tz = ss.getSpreadsheetTimeZone();
  var dateStr = dateKey_(deliveryDate, tz);
  var all = readAllBookings_();
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var b = all[i];
    if (String(b.status) === "cancelled") continue;
    var bd = parseFlexibleDate_(b.date, tz);
    if (!bd || dateKey_(bd, tz) !== dateStr) continue;
    out.push({
      name: b.client,
      address: b.address || "",
      note: b.note || "",
      phone: extractPhoneFromNote_(b.note || ""),
      basket: b.basket || [],
      orderCount: (b.basket || []).length,
      geo: null,
      status: b.status
    });
  }
  return out;
}

function isTestClientNick_(name) {
  var s = String(name || "").trim();
  if (!s) return false;
  // только явный тест — не трогаем живых ников
  return /^zzz[_-]?test\b/i.test(s) || /^zzz_test\b/i.test(s);
}

/** Удалить пустые тестовые столбцы с блока дня (zzz_test без состава). */
function purgeEmptyTestColumnsOnDay_(ss, dayName) {
  var block = getDayBlock(dayName);
  if (!block) return 0;
  var sh = getTargetSheet(ss, block);
  if (!sh) return 0;
  var nicks = sh.getRange(block.nick, 3, 1, 15).getValues()[0];
  var cleared = 0;
  for (var i = 0; i < 15; i++) {
    var nick = String(nicks[i] || "").trim();
    if (!isTestClientNick_(nick)) continue;
    var col = i + 3;
    var hasQty = false;
    try {
      var vals = sh.getRange(block.start, col, block.end - block.start + 1, 1).getValues();
      for (var r = 0; r < vals.length; r++) {
        if (Number(vals[r][0]) > 0) { hasQty = true; break; }
      }
    } catch (eQ) {}
    if (hasQty) continue;
    sh.getRange(block.nick, col).setValue("");
    sh.getRange(block.start, col, block.note - block.start + 1, 1).clearContent();
    cleared++;
  }
  return cleared;
}

function getClientsData_(ss, dayName) {
  var memoKey = String(dayName || "").toUpperCase();
  if (memoKey && _memoClientsData_[memoKey]) return _memoClientsData_[memoKey];
  var block = getDayBlock(dayName);
  if (!block) return { status: "bad_day", clients: [] };
  var targetSheet = getTargetSheet(ss, block);
  if (!targetSheet) return { status: "error", clients: [] };

  // purge тестовых колонок — не на каждый getClients (тормозит все экраны)
  // try { purgeEmptyTestColumnsOnDay_(ss, dayName); } catch (ePurge) {}

  var nickRow = block.nick;
  var startRow = block.start;
  var endRow = block.end;
  var addressRow = block.addr;
  var noteRow = block.note;

  var totalSheetCols = targetSheet.getLastColumn();
  var totalSheetRows = targetSheet.getLastRow();
  var colsToRead = totalSheetCols >= 3 ? Math.min(totalSheetCols - 2, 15) : 1;

  var nicksMatrix = targetSheet.getRange(nickRow, 3, 1, colsToRead).getValues();
  var itemsNamesColumn = targetSheet.getRange(startRow, 1, endRow - startRow + 1, 1).getValues();
  var allOrdersMatrix = targetSheet.getRange(startRow, 3, endRow - startRow + 1, colsToRead).getValues();
  var addressesMatrix = totalSheetRows >= addressRow ? targetSheet.getRange(addressRow, 3, 1, colsToRead).getValues() : null;
  var notesMatrix = totalSheetRows >= noteRow ? targetSheet.getRange(noteRow, 3, 1, colsToRead).getValues() : null;
  var geoIndex = buildDayGeoIndex_(dayName);
  var phoneIndex = {};
  try { phoneIndex = buildClientPhoneIndex_(ss); } catch (ePhIdx) { phoneIndex = {}; }
  var calByKey = {};
  try {
    var dayDateForCal = getDayDate_(ss, dayName);
    if (dayDateForCal) {
      var calRows = readCalendarForDate_(ss, dayDateForCal);
      for (var ci = 0; ci < calRows.length; ci++) {
        var ck = calRows[ci].matchKey || clientMatchKey_(calRows[ci].client) || "";
        if (ck) calByKey[ck] = calRows[ci];
        var cu = String(calRows[ci].client || "").toUpperCase();
        if (cu) calByKey[cu] = calRows[ci];
      }
    }
  } catch (eCalIdx) {}
  var ppIdx = {};
  try { ppIdx = getPpPartnerIndex_(ss); } catch (ePp) { ppIdx = {}; }

  var clientsDataList = [];
  if (nicksMatrix && nicksMatrix.length > 0) {
    var rowArray = nicksMatrix[0];
    for (var colIdx = 0; colIdx < rowArray.length; colIdx++) {
      var nameClean = rowArray[colIdx] ? rowArray[colIdx].toString().trim() : "";
      var checkUpper = nameClean.toUpperCase();
      if (
        nameClean !== "" &&
        nameClean !== "0" &&
        checkUpper !== "0" &&
        checkUpper !== "ИТОГО НА ДЕНЬ" &&
        checkUpper !== "ИТОГО" &&
        checkUpper !== "ФАКТ СНЯТОЕ" &&
        isCountableClientNick_(nameClean)
      ) {
        var clientBasket = [];
        var totalItemsInOrder = 0;

        for (var rIdx = 0; rIdx < allOrdersMatrix.length; rIdx++) {
          var rawCell = allOrdersMatrix[rIdx][colIdx];
          var cellValue = 0;
          if (rawCell !== null && rawCell !== undefined && typeof rawCell !== "object") {
            cellValue = Number(rawCell) || 0;
          }
          var currentItemName =
            itemsNamesColumn[rIdx] && itemsNamesColumn[rIdx][0] != null
              ? itemsNamesColumn[rIdx][0].toString().trim()
              : "";
          if (currentItemName === "" || currentItemName.indexOf("#") > -1) continue;

          if (cellValue > 0) {
            totalItemsInOrder++;
            var parsed = parseSheetItemName(currentItemName, rIdx);
            clientBasket.push({
              cat: parsed.cat,
              name: parsed.name,
              sub: parsed.sub,
              val: cellValue,
              unit: parsed.unit
            });
          }
        }

        // пустой тест не показываем в неделе
        if (isTestClientNick_(nameClean) && totalItemsInOrder === 0) continue;

        var rawAddr = addressesMatrix && addressesMatrix[0] ? addressesMatrix[0][colIdx] : "";
        var rawNote = notesMatrix && notesMatrix[0] ? notesMatrix[0][colIdx] : "";
        var noteRaw = rawNote != null ? String(rawNote).trim() : "";
        var legacyGeo = parseGeoTagsFromNote_(noteRaw);
        if (legacyGeo) noteRaw = stripGeoTagsFromNote_(noteRaw);
        var geoObj = geoIndex[nameClean.toUpperCase()] || legacyGeo || null;
        var phone = "";
        var pk = clientMatchKey_(nameClean) || nameClean.toUpperCase();
        phone = (pk && phoneIndex[pk]) || phoneIndex[nameClean.toUpperCase()] || "";
        if (!phone) {
          var telM = noteRaw.match(/\[TEL:([^\]]+)\]/i);
          if (telM) phone = String(telM[1] || "").trim();
        }
        if (!phone) {
          var phM = noteRaw.match(/(\+?375[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})/);
          if (phM) phone = phM[1].replace(/\s+/g, "");
        }
        var calHit = (pk && calByKey[pk]) || calByKey[nameClean.toUpperCase()] || null;
        var segFromNote = extractSegmentFromNote_(noteRaw) || (calHit && calHit.segment) || "";
        var orderPriceOut = (calHit && calHit.orderPrice !== "" && calHit.orderPrice != null)
          ? calHit.orderPrice
          : extractOrderPriceFromNote_(noteRaw);
        var ppSlotOut = (calHit && calHit.ppSlot) || "";
        var noteStr = stripTechFromNote_(noteRaw);
        var noCutFlag = /\[НЕ\s*РЕЗАТЬ\]/i.test(noteRaw);
        var srcFromSeg = "";
        if (segFromNote === "БП" || segFromNote === "BP") srcFromSeg = "bp";
        else if (segFromNote === "ПП" || segFromNote === "PP" || segFromNote === "АФК") srcFromSeg = "pp";
        else if (segFromNote.indexOf("ПАРТ") === 0) srcFromSeg = "partner";
        else if (segFromNote === "Р" || segFromNote === "RETAIL") srcFromSeg = "retail";
        if (calHit && calHit.phone && !phone) phone = calHit.phone;
        var basketOut = clientBasket;
        var dogCountOut = 1;
        if (calHit && calHit.basket && basketHasDogSplit_(calHit.basket)) {
          basketOut = calHit.basket;
          dogCountOut = 2;
        }
        clientsDataList.push({
          name: nameClean,
          orderCount: totalItemsInOrder,
          address: rawAddr != null ? String(rawAddr).trim() : "",
          note: noteStr,
          phone: phone,
          geo: geoObj || null,
          basket: basketOut,
          dogCount: dogCountOut,
          col: colIdx,
          segment: segFromNote,
          source: srcFromSeg,
          orderPrice: orderPriceOut,
          ppSlot: ppSlotOut,
          ppHint: ppSlotOut ? ("ПП " + ppSlotOut) : "",
          deliveryAfter: (calHit && calHit.deliveryAfter) || "",
          deliveryBefore: (calHit && calHit.deliveryBefore) || "",
          matchKey: pk || "",
          ppPartner: (calHit && calHit.ppPartner) || (pk && ppIdx[pk]) || ppIdx[nameClean.toUpperCase()] || "",
          couponsQty: (calHit && calHit.couponsQty) || 0,
          couponPrice: (calHit && calHit.couponPrice) || 0,
          noCut: noCutFlag
        });
      }
    }
  }
  // дедуп по matchKey — иначе дубли колонок (тест/оболочки) наслаиваются в UI
  var deduped = [];
  var seenKeys = {};
  for (var di = 0; di < clientsDataList.length; di++) {
    var cl = clientsDataList[di];
    var mk = clientMatchKey_(cl.name);
    if (!mk) {
      deduped.push(cl);
      continue;
    }
    if (!seenKeys.hasOwnProperty(mk)) {
      seenKeys[mk] = deduped.length;
      deduped.push(cl);
      continue;
    }
    var prev = deduped[seenKeys[mk]];
    var prevLen = (prev.basket || []).length;
    var nextLen = (cl.basket || []).length;
    // пустую оболочку не предпочитаем полной
    if (nextLen > prevLen || (nextLen === prevLen && String(cl.name).length > String(prev.name).length)) {
      deduped[seenKeys[mk]] = cl;
    }
  }
  var result = { status: "success", clients: deduped };
  if (memoKey) _memoClientsData_[memoKey] = result;
  return result;
}

/** Единый разбор имени строки листа → name/sub/cat/unit для mini-app. */
function parseSheetItemName(currentItemName, rIdx) {
  var rawName = String(currentItemName || "").replace(/\s+/g, " ").trim();
  var upper = rawName.toUpperCase();
  var cat = "other";
  var unit = "гр";

  // Ориентиры по строкам понедельничного блока (индекс 0 = строка 4)
  // 0–11 дрессура-подобные с « / »; жевалки со шт.; и т.д.
  if (rawName.indexOf("шт.") > -1 || rawName.indexOf("ШТ") > -1) {
    unit = "шт";
  }

  var vegList = ["БАНАНЫ", "ЯБЛОКИ", "ГРУШИ", "ГРУШЫ", "МОРКОВЬ", "ТЫКВА", "БАТАТ"];
  if (upper.indexOf("КРОШКА") > -1) {
    cat = "powder";
    unit = "гр";
  } else if (vegList.indexOf(upper) > -1 || vegList.some(function (v) { return upper === v; })) {
    cat = "veg";
    unit = "гр";
  } else if (
    upper.indexOf("ЛЁГКОЕ") === 0 ||
    upper.indexOf("ЛЕГКОЕ") === 0 ||
    upper.indexOf("СЕРДЦЕ") === 0 ||
    upper.indexOf("ПОЧКИ") === 0 ||
    upper.indexOf("РУБЕЦ Т") === 0 ||
    upper.indexOf("БАРАНЬЕ") === 0
  ) {
    if (rawName.indexOf(" / ") > -1) {
      cat = "dressura";
      unit = "гр";
    } else {
      // без « / » (сводка Нарезки) — всё равно граммы, не жевалка
      cat = "dressura";
      unit = "гр";
    }
  } else if (
    upper.indexOf("БЫЧИЙ") > -1 ||
    upper.indexOf("ТРАХЕЯ") > -1 ||
    upper.indexOf("АОРТА") > -1 ||
    upper.indexOf("УХО") > -1 ||
    upper.indexOf("НОСЫ") > -1 ||
    upper.indexOf("СТАНОВАЯ") > -1 ||
    upper.indexOf("КОЛЕНИ") > -1 ||
    upper.indexOf("КОПЫТО") > -1 ||
    upper.indexOf("ПЕРЕПЁЛКИ") > -1 ||
    upper.indexOf("ПЕРЕПЕЛКИ") > -1 ||
    upper.indexOf("ЛОП") > -1 ||
    upper.indexOf("ХРЯЩ") > -1 ||
    upper.indexOf("УТИНЫЕ") > -1 ||
    upper.indexOf("УТИН") > -1 ||
    upper.indexOf("ГУБЫ") > -1
  ) {
    cat = "chew";
    unit = "шт";
  }
  if (isPieceSkuName_(rawName) || isPieceSkuName_(upper)) {
    unit = "шт";
    if (cat === "other") cat = "chew";
  }

  var cleanNameOnly = rawName;
  var frac = "";

  if (rawName.indexOf(" / ") > -1) {
    var splitIdx = rawName.indexOf(" / ");
    cleanNameOnly = rawName.substring(0, splitIdx).trim();
    var subText = rawName.substring(splitIdx + 3).trim();
    // дрессура: оставляем Мелкое/Среднее/… как в листе; жевалки — нормализуем
    if (/^(Мелкое|Среднее|Большое|Крупное|Целое)$/i.test(subText)) frac = subText;
    else frac = normalizeFraction(subText) || subText;
  } else {
    frac = extractEmbeddedFraction(upper);
    cleanNameOnly = rawName
      .replace(/\s*шт\.?/gi, "")
      .replace(/\s*ШТ\.?/g, "")
      .replace(/\s*ОЧ МАЛ/gi, "")
      .replace(/\s*ПОЛОВИНКО?\w*/gi, "")
      .replace(/\s*ПОЛОВИНКА/gi, "")
      .replace(/\s*ОБЫЧН\w*/gi, "")
      .replace(/\s*ПАЛК/gi, "")
      .replace(/\s*ПЛАСТ/gi, "")
      .replace(/\s*ОГР/gi, "")
      .replace(/\s*МАЛ/gi, "")
      .replace(/\s*СРЕД/gi, "")
      .replace(/\s*БОЛ/gi, "")
      .replace(/\s*КРУПНОЕ/gi, "")
      .replace(/\s*ЦЕЛОЕ/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // уши/аорта: строка «УХО Г шт.» без слова фракции = обычные (иначе в Просмотре только категория)
  if (!frac) {
    var baseChk = String(cleanNameOnly || "").toUpperCase().replace(/Ё/g, "Е");
    if (/УХО|УШК/.test(baseChk) || /УХО|УШК/.test(upper)) {
      frac = /ПОЛОВИН/.test(upper) ? "ПОЛОВИНКА" : "Обычное";
    } else if (/АОРТ/.test(baseChk) || /АОРТ/.test(upper)) {
      frac = /ПОЛОВИН/.test(upper) ? "ПОЛОВИНКА" : "Обычная";
    }
  }

  cleanNameOnly = normalizeProductAlias_(String(cleanNameOnly || "").replace(/\s+/g, " ").trim());
  return { cat: cat, name: cleanNameOnly, sub: frac, unit: unit };
}

// ===================== Telegram =====================

function checkLiveDeficitAndNotify() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pack = computeWarehouseWeekPlan_(ss);
    if (!pack || !pack.ok) return;
    try { syncWarehouseBuyDeferred_(ss, pack.deficits || []); } catch (eSync) {}
    if (!(pack.deficits && pack.deficits.length)) return;
    notifyWarehouseBuyUrgent_(pack, "СРОЧНО · дефицит сырья по плану недели");
  } catch (e) {
    Logger.log("checkLiveDeficitAndNotify: " + String(e));
  }
}

function sendTelegramSnabNotification() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pack = computeWarehouseWeekPlan_(ss);
    if (!pack || !pack.ok) return;
    try { syncWarehouseBuyDeferred_(ss, pack.deficits || []); } catch (eSync) {}
    notifyWarehouseBuyUrgent_(pack, "План снабжения / дозакуп");
  } catch (e) {
    Logger.log("sendTelegramSnabNotification: " + String(e));
  }
}

/** Текст заказа дозакупа: нужно сырья / есть (план сухого — для ясности). */
function composeWarehouseBuyMessage_(pack) {
  pack = pack || {};
  var defs = pack.deficits || [];
  var lines = [];
  lines.push("🛒 Дозакуп сырья");
  var rangeLab = "";
  if (pack.dateFrom || pack.dateTo) {
    rangeLab = String(pack.dateFrom || "…") + " — " + String(pack.dateTo || "…");
  } else if (pack.rangeLabel) {
    rangeLab = String(pack.rangeLabel);
  }
  if (rangeLab) {
    lines.push("Период: " + rangeLab);
  } else {
    lines.push("Под план выбранных дат:");
  }
  lines.push("«Нужно» = сырьё (сухое ÷ коэф усушки), не граммы с заказа.");
  lines.push("");
  if (!defs.length) {
    lines.push("Нехватки нет (остаток покрывает план).");
    return lines.join("\n");
  }
  for (var i = 0; i < defs.length; i++) {
    var d = defs[i];
    var unit = d.unit || "кг";
    var line = "· " + d.name + " — нужно " + d.needRaw + " " + unit + ", есть " + d.available + " " + unit;
    if (!d.piece && d.dryG > 0) {
      line += " (план " + (d.dryG >= 1000 ? (round2_(d.dryG / 1000) + " кг") : (round2_(d.dryG) + " г")) + " сухого)";
    }
    lines.push(line);
  }
  lines.push("");
  lines.push("Бойня-Конвейер · склад");
  return lines.join("\n");
}

function notifyWarehouseBuyUrgent_(pack, header) {
  var defs = (pack && pack.deficits) || [];
  if (!defs.length) return;
  // антиспам: один пуш на набор SKU раз в 45 мин
  var sig = defs.map(function (d) { return String(d.row) + ":" + String(d.deficit); }).join("|");
  var props = PropertiesService.getScriptProperties();
  try {
    var prev = String(props.getProperty("WH_BUY_NUDGE_SIG") || "");
    var at = Number(props.getProperty("WH_BUY_NUDGE_AT") || 0) || 0;
    if (prev === sig && (Date.now() - at) < 45 * 60 * 1000) return;
    props.setProperty("WH_BUY_NUDGE_SIG", sig);
    props.setProperty("WH_BUY_NUDGE_AT", String(Date.now()));
  } catch (eP) {}

  var text = "🚨 " + String(header || "СРОЧНО · дефицит сырья") + "\n\n" + composeWarehouseBuyMessage_(pack);
  var ids = [];
  try {
    var staff = listActiveStaffIdsForRoles_(["owner", "manager", "logistics", "all"]);
    ids = staff || [];
  } catch (eS) {}
  try {
    var owners = getOwnerTelegramIds_();
    for (var o = 0; o < owners.length; o++) {
      if (ids.indexOf(String(owners[o])) < 0) ids.push(String(owners[o]));
    }
  } catch (eO) {}
  if (!ids.length) {
    try {
      var chat = PropertiesService.getScriptProperties().getProperty("TELEGRAM_CHAT_ID");
      if (chat) ids.push(String(chat).trim());
    } catch (eC) {}
  }
  for (var i = 0; i < ids.length; i++) {
    try { telegramSendText_(ids[i], text); } catch (eT) {}
  }
}

function listActiveStaffIdsForRoles_(roles) {
  var want = {};
  for (var i = 0; i < (roles || []).length; i++) want[String(roles[i] || "").toLowerCase()] = true;
  var ids = [];
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Доступы");
    if (!sh || sh.getLastRow() < 2) return ids;
    var data = sh.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      var id = String(data[r][0] || "").trim();
      var role = String(data[r][3] || "").toLowerCase();
      var status = String(data[r][4] || "").toLowerCase();
      if (!id) continue;
      if (status && status !== "active") continue;
      if (want[role] || want["all"]) {
        if (ids.indexOf(id) < 0) ids.push(id);
      }
    }
  } catch (e) {}
  return ids;
}

/** Задачи mode=buy в «Отложенное» — видно менеджерам во вкладке Дозакуп. */
function syncWarehouseBuyDeferred_(ss, deficits) {
  var sh = deferredSheet_();
  var data = sh.getDataRange().getValues();
  var ownerTid = "";
  try {
    var owners = getOwnerTelegramIds_();
    ownerTid = owners && owners[0] ? String(owners[0]) : "";
  } catch (eO) {}
  if (!ownerTid) ownerTid = "warehouse";

  var openByRow = {};
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][3] || "").toLowerCase() !== "buy") continue;
    var st = String(data[r][6] || "open").toLowerCase();
    var payload = {};
    try { payload = JSON.parse(String(data[r][7] || "{}")); } catch (e) { payload = {}; }
    var row = Number(payload.row) || 0;
    if (row >= 2) openByRow[row] = { sheetRow: r + 1, status: st, id: String(data[r][0] || "") };
  }

  var alive = {};
  for (var i = 0; i < (deficits || []).length; i++) {
    var d = deficits[i];
    var wRow = Number(d.row) || 0;
    if (!(wRow >= 2) || !(d.deficit > 0)) continue;
    alive[wRow] = true;
    var title = "СРОЧНО · дозакуп · " + String(d.name || "");
    var payloadObj = {
      mode: "buy",
      row: wRow,
      name: d.name,
      needRaw: d.needRaw,
      available: d.available,
      deficit: d.deficit,
      unit: d.unit || "кг",
      byDay: d.byDay || [],
      urgent: true
    };
    var payloadStr = JSON.stringify(payloadObj);
    if (openByRow[wRow] && openByRow[wRow].sheetRow) {
      var sr = openByRow[wRow].sheetRow;
      sh.getRange(sr, 4, 1, 5).setValues([["buy", title, String(d.name || ""), "open", payloadStr]]);
      sh.getRange(sr, 9).setValue(new Date());
    } else {
      sh.appendRow([
        deferredNewId_(),
        new Date(),
        ownerTid,
        "buy",
        title,
        String(d.name || ""),
        "open",
        payloadStr,
        new Date()
      ]);
    }
  }
  // закрыть то, чего больше нет в дефиците
  for (var rowKey in openByRow) {
    if (!openByRow.hasOwnProperty(rowKey)) continue;
    if (alive[rowKey]) continue;
    if (openByRow[rowKey].status !== "open") continue;
    try {
      sh.getRange(openByRow[rowKey].sheetRow, 7).setValue("done");
      sh.getRange(openByRow[rowKey].sheetRow, 9).setValue(new Date());
    } catch (eCl) {}
  }
  try { CacheService.getScriptCache().remove("DEF:"); } catch (eC) {}
  // сбросить кэши listDeferred (префиксы разные — чистим через bump)
  try {
    PropertiesService.getScriptProperties().setProperty("DEF_CACHE_BUMP", String(Date.now()));
  } catch (eB) {}
}

/** Менеджер-строка Пн (4–59) → строка Нарезки (3–48). */
function reverseManagerRowToCutting_() {
  var itemMap = getCuttingItemMap_();
  var rev = {};
  for (var cKey in itemMap) {
    var rows = itemMap[cKey];
    for (var i = 0; i < rows.length; i++) rev[String(rows[i])] = Number(cKey);
  }
  return rev;
}

function buildWarehouseNameIndex_(matrix) {
  var byNorm = {};
  for (var i = 0; i < matrix.length; i++) {
    var name = String(matrix[i][0] || "").trim();
    if (!name) continue;
    var row = i + 2;
    var u = normalizeProductAlias_(name.toUpperCase().replace(/\s+/g, " ").trim());
    if (u && byNorm[u] == null) byNorm[u] = row;
    var u2 = u.replace(/\s*ШТ\.?/g, "").trim();
    if (u2 && byNorm[u2] == null) byNorm[u2] = row;
  }
  return byNorm;
}

function warehouseRowFromBasketItem_(item, itemsInSheet, revMap, byNorm) {
  var name = String((item && (item.name || item.main)) || "").trim();
  var sub = String((item && item.sub) || "").trim();
  if (!name) return 0;
  if (itemsInSheet && itemsInSheet.length) {
    try {
      var idx = findSheetRowForItem(itemsInSheet, name, sub);
      if (idx >= 0) {
        var monRow = idx + 4;
        var cRow = (revMap && revMap[String(monRow)]) || 0;
        if (cRow) {
          var w = getWarehouseRowForCuttingRow_(cRow);
          if (w) return w;
        }
      }
    } catch (eF) {}
  }
  var u = normalizeProductAlias_(name.toUpperCase().replace(/\s+/g, " ").trim());
  if (byNorm && byNorm[u]) return byNorm[u];
  var u2 = u.replace(/\s*ШТ\.?/g, "").trim();
  if (byNorm && byNorm[u2]) return byNorm[u2];
  if (byNorm && u2.length >= 4) {
    for (var k in byNorm) {
      if (String(k).length < 3) continue;
      if (k.indexOf(u2) === 0 || u2.indexOf(k) === 0) return byNorm[k];
    }
  }
  return 0;
}

function basketItemDryQty_(item) {
  var val = Number(item && (item.val != null ? item.val : (item.value != null ? item.value : item.qty))) || 0;
  return val > 0 ? val : 0;
}

function weekdayShortRu_(d) {
  var names = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  try { return names[d.getDay()] || ""; } catch (e) { return ""; }
}

/**
 * План склада: без дат — остаток текущей недели с «Приём»;
 * с датами — любые дни: лист недели/будущей где есть + иначе Календарь_Дат.
 */
function computeWarehouseWeekPlan_(ss, opts) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  opts = opts || {};
  var wh = ss.getSheetByName("Склад");
  var sheetManager = ss.getSheetByName("Прием заказов");
  var sheetCutting = ss.getSheetByName("Нарезка");
  if (!wh || !sheetManager) return { ok: false, message: "no_warehouse" };

  var dateFrom = parseFlexibleDate_(opts.dateFrom || opts.from || "");
  var dateTo = parseFlexibleDate_(opts.dateTo || opts.to || "");
  if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
    var swap = dateFrom;
    dateFrom = dateTo;
    dateTo = swap;
  }
  var filterOn = !!(dateFrom || dateTo);
  var cacheKey = "WH_PLAN_V6" + (filterOn
    ? (":" + (dateFrom ? isoDateKey_(dateFrom) : "") + ":" + (dateTo ? isoDateKey_(dateTo) : ""))
    : "");

  if (!(opts.force || opts.refresh || opts.noCache)) {
    try {
      var cached = CacheService.getScriptCache().get(cacheKey);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed && parsed.ok) return parsed;
      }
    } catch (eCache) {}
  }

  var tz = ss.getSpreadsheetTimeZone();
  var itemMap = getCuttingItemMap_();
  var revMap = reverseManagerRowToCutting_();
  var weekDaysGeo = [
    { start: 4, name: "Пн" },
    { start: 65, name: "Вт" },
    { start: 126, name: "Ср" },
    { start: 187, name: "Чт" },
    { start: 248, name: "Пт" },
    { start: 309, name: "Сб" },
    { start: 370, name: "Вс" }
  ];
  try {
    for (var di = 0; di < MANAGER_DAY_NAMES_.length && di < weekDaysGeo.length; di++) {
      var dv = sheetManager.getRange(MANAGER_DATE_CELLS[di]).getValue();
      var ds = formatSheetDate(dv, tz);
      var dObj = parseFlexibleDate_(dv, tz) || parseFlexibleDate_(ds, tz);
      if (ds) weekDaysGeo[di].date = ds;
      if (dObj) weekDaysGeo[di].dateIso = isoDateKey_(dObj, tz);
      weekDaysGeo[di].label = (weekDaysGeo[di].name || "") + (ds ? (" " + ds) : "");
      weekDaysGeo[di].ts = dObj ? dObj.getTime() : 0;
      weekDaysGeo[di].source = "priem";
    }
  } catch (eD) {}

  // «Будущая неделя» — как ещё один день листа (если дата попадает в фильтр / без фильтра не в «остаток недели»)
  var futureDay = null;
  try {
    var futSh = ss.getSheetByName("Будущая неделя");
    if (futSh) {
      var fv = futSh.getRange("A1").getValue();
      var fObj = parseFlexibleDate_(fv, tz);
      if (fObj) {
        var fds = formatSheetDate(fv, tz);
        futureDay = {
          start: 4,
          name: "Буд",
          date: fds || "",
          dateIso: isoDateKey_(fObj, tz),
          label: "Буд" + (fds ? (" " + fds) : ""),
          ts: fObj.getTime(),
          source: "future",
          sheet: futSh
        };
      }
    }
  } catch (eFut) {}

  function dayInRange_(day) {
    if (!filterOn) return true;
    if (!day || !day.ts) return false;
    if (dateFrom && day.ts < dateFrom.getTime()) return false;
    if (dateTo && day.ts > dateTo.getTime()) return false;
    return true;
  }

  var todayTs = 0;
  try {
    var todayIso = isoDateKey_(new Date(), tz);
    var todayD = parseFlexibleDate_(todayIso, tz);
    if (todayD) todayTs = todayD.getTime();
  } catch (eToday) {}

  function dayIsPast_(day) {
    return !!(todayTs && day && day.ts && day.ts < todayTs);
  }

  // need / prior по дням листа «Приём» (F ещё не списан за прошедшие дни этой недели)
  var needDaysIdx = {};
  var priorDaysIdx = {};
  var anyFutureInRange = false;
  for (var fd = 0; fd < weekDaysGeo.length; fd++) {
    var dayF = weekDaysGeo[fd];
    if (!dayInRange_(dayF)) {
      if (filterOn && dateFrom && dayF.ts && dayF.ts < dateFrom.getTime()) {
        priorDaysIdx[fd] = true;
      } else if (!filterOn && dayIsPast_(dayF)) {
        priorDaysIdx[fd] = true;
      }
      continue;
    }
    if (dayIsPast_(dayF)) {
      if (filterOn) needDaysIdx[fd] = true;
      else priorDaysIdx[fd] = true;
    } else {
      anyFutureInRange = true;
      needDaysIdx[fd] = true;
    }
  }
  if (filterOn && !anyFutureInRange) {
    for (var pd = 0; pd < weekDaysGeo.length; pd++) {
      if (dayInRange_(weekDaysGeo[pd])) {
        needDaysIdx[pd] = true;
        delete priorDaysIdx[pd];
      }
    }
  }

  var sheetIsoCovered = {};
  for (var ci = 0; ci < weekDaysGeo.length; ci++) {
    if (weekDaysGeo[ci].dateIso) sheetIsoCovered[weekDaysGeo[ci].dateIso] = true;
  }
  if (futureDay && futureDay.dateIso) sheetIsoCovered[futureDay.dateIso] = true;

  var fullManagerMatrix = sheetManager.getRange(1, 3, 427, 15).getValues();
  var noCutByDayOffset = {};
  for (var nd = 0; nd < weekDaysGeo.length; nd++) {
    var dayBlk = getDayBlock(MANAGER_DAY_NAMES_[nd]);
    noCutByDayOffset[weekDaysGeo[nd].start] = noCutSkipColsForBlock_(sheetManager, dayBlk);
  }

  var cuttingSurplusValues = [];
  var cutNames = [];
  try {
    if (sheetCutting) {
      cuttingSurplusValues = sheetCutting.getRange("C3:C48").getValues();
      cutNames = sheetCutting.getRange("A3:A48").getValues();
    }
  } catch (eC) {}

  var byWh = {};
  function ensureWh_(wRow) {
    if (!byWh[wRow]) byWh[wRow] = { dryG: 0, priorDryG: 0, byDay: {}, surplusKg: 0 };
    return byWh[wRow];
  }

  for (var cRow = 3; cRow <= 48; cRow++) {
    var rowsToSum = itemMap[String(cRow)];
    if (!rowsToSum) continue;
    var wRow = getWarehouseRowForCuttingRow_(cRow);
    if (!wRow) continue;
    ensureWh_(wRow);
    var cutName = "";
    try { cutName = String((cutNames[cRow - 3] && cutNames[cRow - 3][0]) || ""); } catch (eN) {}
    var sizeFactor = chewStockFactorForCuttingName_(cutName);
    if (!filterOn || Object.keys(needDaysIdx).length >= 5) {
      try {
        if (cuttingSurplusValues && cuttingSurplusValues[cRow - 3]) {
          byWh[wRow].surplusKg += (Number(cuttingSurplusValues[cRow - 3][0]) || 0) * sizeFactor;
        }
      } catch (eS) {}
    }
    for (var d = 0; d < weekDaysGeo.length; d++) {
      var day = weekDaysGeo[d];
      var dayOffset = day.start - 4;
      var skipCols = noCutByDayOffset[day.start] || {};
      var dayG = 0;
      for (var ri = 0; ri < rowsToSum.length; ri++) {
        var targetRowIdx = rowsToSum[ri] + dayOffset - 1;
        if (targetRowIdx < 0 || targetRowIdx >= fullManagerMatrix.length) continue;
        for (var colM = 0; colM < 15; colM++) {
          if (skipCols[colM]) continue;
          dayG += Number(fullManagerMatrix[targetRowIdx][colM]) || 0;
        }
      }
      if (!(dayG > 0)) continue;
      dayG = dayG * sizeFactor;
      var isoKey = day.dateIso || ("idx:" + d);
      byWh[wRow].byDay[isoKey] = (byWh[wRow].byDay[isoKey] || 0) + dayG;
      if (needDaysIdx[d]) byWh[wRow].dryG += dayG;
      if (priorDaysIdx[d]) byWh[wRow].priorDryG += dayG;
    }
  }

  // Будущая неделя (только при явном диапазоне дат, если дата в диапазоне)
  var futureInNeed = false;
  if (filterOn && futureDay && dayInRange_(futureDay) && futureDay.sheet) {
    futureInNeed = true;
    try {
      var futMatrix = futureDay.sheet.getRange(1, 3, 59, 15).getValues();
      var futBlk = getDayBlock("Будущая неделя");
      var futSkip = noCutSkipColsForBlock_(futureDay.sheet, futBlk) || {};
      for (var cRowF = 3; cRowF <= 48; cRowF++) {
        var rowsF = itemMap[String(cRowF)];
        if (!rowsF) continue;
        var wRowF = getWarehouseRowForCuttingRow_(cRowF);
        if (!wRowF) continue;
        ensureWh_(wRowF);
        var cutNameF = "";
        try { cutNameF = String((cutNames[cRowF - 3] && cutNames[cRowF - 3][0]) || ""); } catch (eNF) {}
        var sizeFactorF = chewStockFactorForCuttingName_(cutNameF);
        var dayGF = 0;
        for (var riF = 0; riF < rowsF.length; riF++) {
          var tIdxF = rowsF[riF] - 1;
          if (tIdxF < 0 || tIdxF >= futMatrix.length) continue;
          for (var colF = 0; colF < 15; colF++) {
            if (futSkip[colF]) continue;
            dayGF += Number(futMatrix[tIdxF][colF]) || 0;
          }
        }
        if (!(dayGF > 0)) continue;
        dayGF = dayGF * sizeFactorF;
        var fIso = futureDay.dateIso;
        byWh[wRowF].byDay[fIso] = (byWh[wRowF].byDay[fIso] || 0) + dayGF;
        byWh[wRowF].dryG += dayGF;
      }
    } catch (eFutSum) {}
  }

  // Любые даты вне листов недели — из Календарь_Дат (канон)
  var calendarDaysByIso = {};
  var lastWh = Math.min(50, Math.max(2, wh.getLastRow()));
  var matrix = wh.getRange(2, 1, lastWh - 1, 13).getValues();
  var byNorm = buildWarehouseNameIndex_(matrix);
  var itemsInSheet = [];
  try { itemsInSheet = sheetManager.getRange(4, 1, 59, 1).getValues(); } catch (eItems) { itemsInSheet = []; }

  if (filterOn) {
    try {
      var calRows = readAllCalendarRows_();
      for (var cr = 0; cr < calRows.length; cr++) {
        var rec = calRows[cr];
        var st = String(rec.status || "").toLowerCase();
        if (st === "cancelled") continue;
        var dCal = parseFlexibleDate_(rec.date, tz) || parseFlexibleDate_(rec.dateIso, tz);
        if (!dCal) continue;
        var tsCal = dCal.getTime();
        if (dateFrom && tsCal < dateFrom.getTime()) continue;
        if (dateTo && tsCal > dateTo.getTime()) continue;
        var isoCal = isoDateKey_(dCal, tz);
        // дни уже на «Приём»/Будущей — только лист, без двойного счёта из календаря
        if (sheetIsoCovered[isoCal]) continue;
        var noteCal = String(rec.note || "") + " " + String(rec.basketJson || "");
        if (/\[\s*НЕ\s*РЕЗАТЬ\s*\]/i.test(noteCal)) continue;
        if (!calendarDaysByIso[isoCal]) {
          var dsCal = formatSheetDate(dCal, tz) || isoCal;
          calendarDaysByIso[isoCal] = {
            name: weekdayShortRu_(dCal),
            date: dsCal,
            dateIso: isoCal,
            label: weekdayShortRu_(dCal) + " " + dsCal,
            ts: tsCal,
            source: "calendar",
            inNeed: true,
            past: !!(todayTs && tsCal < todayTs)
          };
        }
        var basket = rec.basket || [];
        for (var bi = 0; bi < basket.length; bi++) {
          var it = basket[bi] || {};
          var g = basketItemDryQty_(it);
          if (!(g > 0)) continue;
          g = g * chewStockFactorForBasketItem_(it);
          var wRowC = warehouseRowFromBasketItem_(it, itemsInSheet, revMap, byNorm);
          if (!wRowC) continue;
          ensureWh_(wRowC);
          byWh[wRowC].byDay[isoCal] = (byWh[wRowC].byDay[isoCal] || 0) + g;
          byWh[wRowC].dryG += g;
        }
      }
    } catch (eCal) {}
  }

  var deficits = [];
  var plan = [];
  var daysForByDay = [];
  for (var dj0 = 0; dj0 < weekDaysGeo.length; dj0++) {
    daysForByDay.push({
      key: weekDaysGeo[dj0].dateIso || ("idx:" + dj0),
      label: weekDaysGeo[dj0].label || weekDaysGeo[dj0].name,
      date: weekDaysGeo[dj0].date || "",
      dateIso: weekDaysGeo[dj0].dateIso || "",
      past: !!priorDaysIdx[dj0],
      inNeed: !!needDaysIdx[dj0]
    });
  }
  if (futureInNeed && futureDay) {
    daysForByDay.push({
      key: futureDay.dateIso,
      label: futureDay.label,
      date: futureDay.date || "",
      dateIso: futureDay.dateIso || "",
      past: false,
      inNeed: true
    });
  }
  for (var cIso in calendarDaysByIso) {
    var cd = calendarDaysByIso[cIso];
    daysForByDay.push({
      key: cIso,
      label: cd.label,
      date: cd.date || "",
      dateIso: cIso,
      past: !!cd.past,
      inNeed: true
    });
  }

  for (var i = 0; i < matrix.length; i++) {
    var name = String(matrix[i][0] || "").trim();
    if (!name) continue;
    var row = i + 2;
    var piece = isPieceWarehouseRow_(row, name);
    var gradedChew = isGradedChewName_(name);
    var f = Number(matrix[i][5]) || 0;
    var b = Number(matrix[i][1]) || 0;
    var mVal = Number(matrix[i][12]) || 0;
    var coef = Number(matrix[i][3]) || (piece ? 1 : 0.2);
    if (!(coef > 0)) coef = piece ? 1 : 0.2;
    var agg = byWh[row] || { dryG: 0, priorDryG: 0, byDay: {}, surplusKg: 0 };
    var needRaw = 0;
    var priorRaw = 0;
    var stockStart = 0;
    var unit = "кг";
    var dryG = agg.dryG || 0;
    var priorDryG = agg.priorDryG || 0;
    if (piece) {
      unit = gradedChew ? "усл.шт" : "шт";
      needRaw = dryG + (agg.surplusKg || 0);
      priorRaw = priorDryG;
      // F — ревизия на неделю; M при F>0 в формулах часто = F − только день, не накопительный остаток
      stockStart = f + b;
    } else {
      needRaw = (dryG / 1000) / coef + (agg.surplusKg || 0);
      priorRaw = (priorDryG / 1000) / coef;
      stockStart = f + b;
    }
    var available = Math.max(0, stockStart - priorRaw);
    var deficit = Math.max(0, needRaw - available);
    var byDay = [];
    for (var dj = 0; dj < daysForByDay.length; dj++) {
      var metaD = daysForByDay[dj];
      if (!metaD.inNeed && !metaD.past) continue;
      var gDay = agg.byDay[metaD.key] || 0;
      if (gDay <= 0) continue;
      var dayNeed = piece ? gDay : ((gDay / 1000) / coef);
      byDay.push({
        day: metaD.label,
        date: metaD.date || "",
        dateIso: metaD.dateIso || "",
        dryG: round2_(gDay),
        needRaw: round2_(dayNeed),
        past: !!metaD.past,
        inNeed: !!metaD.inNeed
      });
    }
    var item = {
      row: row,
      name: name,
      unit: unit,
      piece: !!piece,
      gradedChew: !!gradedChew,
      coef: round2_(coef),
      dryG: round2_(dryG),
      dryKg: piece ? null : round2_(dryG / 1000),
      stock: round2_(f),
      arrival: round2_(b),
      stockStart: round2_(stockStart),
      priorRaw: round2_(priorRaw),
      available: round2_(available),
      needRaw: round2_(needRaw),
      deficit: round2_(deficit),
      byDay: byDay
    };
    plan.push(item);
    if (needRaw > 0 && deficit >= (piece ? (gradedChew ? 0.2 : 0.5) : 0.05)) deficits.push(item);
  }
  deficits.sort(function (a, b) { return (b.deficit || 0) - (a.deficit || 0); });

  var buyList = [];
  try {
    for (var j = 0; j < matrix.length; j++) {
      if (matrix[j][6]) buyList.push({ row: j + 2, name: String(matrix[j][0] || "") });
    }
  } catch (e2) {}

  var daysMeta = weekDaysGeo.map(function (x, idx) {
    return {
      name: x.name,
      date: x.date || "",
      dateIso: x.dateIso || "",
      label: x.label || x.name,
      inRange: dayInRange_(x),
      inNeed: !!needDaysIdx[idx],
      past: !!priorDaysIdx[idx],
      source: "priem"
    };
  });
  if (futureInNeed && futureDay) {
    daysMeta.push({
      name: futureDay.name,
      date: futureDay.date || "",
      dateIso: futureDay.dateIso || "",
      label: futureDay.label,
      inRange: true,
      inNeed: true,
      past: false,
      source: "future"
    });
  }
  for (var cIso2 in calendarDaysByIso) {
    var cdm = calendarDaysByIso[cIso2];
    daysMeta.push({
      name: cdm.name,
      date: cdm.date || "",
      dateIso: cIso2,
      label: cdm.label,
      inRange: true,
      inNeed: true,
      past: !!cdm.past,
      source: "calendar"
    });
  }
  daysMeta.sort(function (a, b) {
    var ta = a.dateIso || "";
    var tb = b.dateIso || "";
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });

  var activeDays = daysMeta.filter(function (x) { return x.inNeed || (x.inRange && !x.past); });

  var rangeLabel = "";
  if (filterOn) {
    rangeLabel = (dateFrom ? isoDateKey_(dateFrom, tz) : "…") + " — " + (dateTo ? isoDateKey_(dateTo, tz) : "…");
  } else if (daysMeta.length) {
    var needMeta = daysMeta.filter(function (x) { return x.inNeed; });
    var firstD = (needMeta[0] && (needMeta[0].dateIso || needMeta[0].date)) || daysMeta[0].dateIso || daysMeta[0].date;
    var lastD = (needMeta.length && (needMeta[needMeta.length - 1].dateIso || needMeta[needMeta.length - 1].date)) ||
      daysMeta[daysMeta.length - 1].dateIso || daysMeta[daysMeta.length - 1].date;
    if (firstD || lastD) rangeLabel = String(firstD || "…") + " — " + String(lastD || "…");
  }

  var withPlan = plan.filter(function (p) { return (p.needRaw || 0) > 0 || (p.dryG || 0) > 0; });
  withPlan.sort(function (a, b) { return (b.deficit || 0) - (a.deficit || 0); });

  var out = {
    ok: true,
    deficits: deficits,
    plan: plan,
    withPlan: withPlan,
    buyList: buyList,
    days: daysMeta,
    activeDays: activeDays.map(function (x) {
      return { name: x.name, date: x.date || "", dateIso: x.dateIso || "", label: x.label || x.name, source: x.source || "" };
    }),
    dateFrom: dateFrom ? isoDateKey_(dateFrom, tz) : "",
    dateTo: dateTo ? isoDateKey_(dateTo, tz) : "",
    rangeLabel: rangeLabel,
    source: filterOn ? "calendar+sheets" : "week",
    note: (filterOn
      ? "Нужно = сырьё (сухое÷коэф). План: дни текущей/будущей недели с листа, остальные даты — из Календарь_Дат. Есть = F+B минус прошедшие дни текущей недели."
      : "Нужно = сырьё (сухое÷коэф). План = граммы с «Приём» (остаток недели с сегодня). Есть = F+B минус уже прошедшие дни недели.") +
      " Жевалки с размером (корень/трахея/жила/аорта/ухо): учётные шт как на Складе, база БОЛЬШОЙ=1 — ОГР=2, БОЛ=1, СРЕД=0.5, МАЛ=0.25, ОЧ МАЛ=0.125 (1 огромный = 4 средних)."
  };
  try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(out), 45); } catch (ePut) {}
  return out;
}

function sendTelegramSnabNotificationInternal(headerText) {
  // совместимость со старым вызовом
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pack = computeWarehouseWeekPlan_(ss);
    notifyWarehouseBuyUrgent_(pack, String(headerText || "").replace(/\*/g, "") || "СРОЧНО · склад");
  } catch (e) {}
}

function getTelegramToken_() {
  return PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN") || "";
}

function telegramSendText_(chatId, text) {
  var token = getTelegramToken_();
  var id = chatId != null ? String(chatId).trim() : "";
  if (!token) return { ok: false, error: "no_token_or_chat", message: "no_token", description: "Нет TELEGRAM_BOT_TOKEN в Script Properties" };
  if (!id) return { ok: false, error: "no_token_or_chat", message: "no_chat", description: "Пустой chat id курьера" };
  var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: id,
      text: String(text || "").slice(0, 3500),
      disable_web_page_preview: false
    }),
    muteHttpExceptions: true
  });
  try {
    return JSON.parse(res.getContentText());
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function getCouriersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Курьеры_ТГ");
  if (!sh) {
    sh = ss.insertSheet("Курьеры_ТГ");
    sh.getRange(1, 1, 1, 4).setValues([["chatId", "name", "username", "updatedAt"]]);
    sh.hideSheet();
  }
  return sh;
}

function upsertCourier_(chatId, name, username) {
  if (!chatId) return;
  var sh = getCouriersSheet_();
  var data = sh.getDataRange().getValues();
  var idStr = String(chatId);
  var now = new Date();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === idStr) {
      sh.getRange(i + 1, 2, 1, 3).setValues([[
        name || data[i][1] || "",
        username || data[i][2] || "",
        now
      ]]);
      return;
    }
  }
  sh.appendRow([idStr, name || "", username || "", now]);
}

/** Telegram шлёт один update повторно, если /exec долго не отвечает — без дедупа спам сообщений. */
function telegramUpdateAlreadySeen_(update) {
  if (!update || update.update_id == null || update.update_id === "") return false;
  var key = "tg_uid_" + String(update.update_id);
  try {
    var c = CacheService.getScriptCache();
    if (c.get(key)) return true;
    c.put(key, "1", 900);
  } catch (e) {}
  return false;
}

function shouldSkipStartGreeting_(chatId) {
  var id = String(chatId || "").trim();
  if (!id) return false;
  try {
    var c = CacheService.getScriptCache();
    if (c.get("tg_start_once_" + id)) return true;
    if (c.get("tg_start_busy_" + id)) return true;
  } catch (e0) {}
  try {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty("tg_start_ts_" + id);
    if (raw) {
      var ts = Number(raw) || 0;
      if (ts > 0 && (Date.now() - ts) < 86400000) return true;
    }
  } catch (e1) {}
  return false;
}

function markStartGreetingSent_(chatId) {
  var id = String(chatId || "").trim();
  if (!id) return;
  try {
    var c = CacheService.getScriptCache();
    c.put("tg_start_once_" + id, "1", 86400);
    c.put("tg_start_busy_" + id, "1", 60);
  } catch (e0) {}
  try {
    PropertiesService.getScriptProperties().setProperty("tg_start_ts_" + id, String(Date.now()));
  } catch (e1) {}
}

function handleTelegramUpdate_(update) {
  try {
    // сначала дедуп: ретраи Telegram не должны снова слать приветствие
    if (telegramUpdateAlreadySeen_(update)) return;

    if (update && update.callback_query) {
      var cq0 = update.callback_query;
      var cqData = String((cq0 && cq0.data) || "");
      if (cqData === "access_req") {
        handleAccessRequestCallback_(cq0);
        return;
      }
      if (/^svsent:/i.test(cqData)) {
        handleSurveySentCallback_(cq0);
        return;
      }
      if (/^ppafk:/i.test(cqData)) {
        handlePpAfkCallback_(cq0);
        return;
      }
      handleDeficitCallback_(cq0);
      return;
    }
    var msg = update.message || update.edited_message;
    if (!msg || !msg.chat) return;
    var chat = msg.chat;
    if (chat.type !== "private") return;
    var from = msg.from || {};
    var name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
    var text = String(msg.text || "");
    var isEdit = !update.message && !!update.edited_message;

    // /start и /start@BotName и /start payload
    var startMatch = text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?/i);
    if (startMatch && !isEdit) {
      var payload = String(startMatch[1] || "");
      // Вход из нативного GBI: /start gbi_<token>
      if (/^gbi_/i.test(payload)) {
        var linkToken = payload.replace(/^gbi_/i, "");
        if (linkToken) {
          // gbi_ тоже не спамить на ретраях того же /start
          if (shouldSkipStartGreeting_(chat.id)) {
            try { upsertCourier_(chat.id, name, from.username || ""); } catch (eUpG) {}
            return;
          }
          markStartGreetingSent_(chat.id);
          try {
            CacheService.getScriptCache().put(
              "native_auth_" + linkToken,
              JSON.stringify({
                telegramId: String(from.id),
                name: name,
                username: String(from.username || "")
              }),
              600
            );
          } catch (eCache) {}
          telegramSendText_(
            chat.id,
            "✅ GBI: Telegram подключён.\n" +
              "Имя: " + (name || "—") + "\n" +
              "ID: " + from.id + "\n\n" +
              "Вернись в приложение — вход подтянется сам."
          );
          try {
            var tid = String(from.id);
            var existing = null;
            try { existing = findAccessById_(tid); } catch (eFind) {}
            var role = "pending";
            var status = "pending";
            if (isOwnerId_(tid)) {
              role = "owner";
              status = "active";
            } else if (existing && existing.role) {
              role = existing.role;
              status = existing.status || "active";
            }
            upsertAccessRow_(tid, name, from.username || "", role, status);
          } catch (eAcc) {}
          try { upsertCourier_(chat.id, name, from.username || ""); } catch (eUpG2) {}
          return;
        }
      }
      // Обычный /start — одно приветствие на 24ч (+ защита от ретраев webhook)
      var startLock = null;
      try {
        startLock = LockService.getScriptLock();
        startLock.waitLock(8000);
      } catch (eLk) { startLock = null; }
      try {
        if (shouldSkipStartGreeting_(chat.id)) {
          try { upsertCourier_(chat.id, name, from.username || ""); } catch (eUp0) {}
          return;
        }
        markStartGreetingSent_(chat.id);
      } finally {
        try { if (startLock) startLock.releaseLock(); } catch (eRel) {}
      }
      var greet;
      try {
        greet = buildStartGreeting_(from, name);
      } catch (eGreet) {
        greet = {
          kind: "fallback",
          text: "Привет" + (name ? ", " + name : "") + "!\nID: " + (from.id || "—") +
            "\nНе удалось проверить доступ. Напиши: Запросить доступ"
        };
      }
      if (!greet || !greet.text) {
        greet = { text: "Привет! ID: " + (from.id || "—") };
      }
      var sent = null;
      try {
        if (greet.markup) sent = telegramSendMarkup_(chat.id, greet.text, greet.markup);
      } catch (eMk) { sent = null; }
      if (!sent || sent.ok === false) {
        try { telegramSendText_(chat.id, greet.text); } catch (eTx) {}
      }
      try { upsertCourier_(chat.id, name, from.username || ""); } catch (eUp) {}
      return;
    }

    try { upsertCourier_(chat.id, name, from.username || ""); } catch (eUp2) {}

    // текстовый запрос доступа
    if (!isEdit && /^(запросить\s+доступ|\/request(?:@\w+)?)$/i.test(text.trim())) {
      try {
        processAccessRequestFromUser_(from, name, chat.id, null);
      } catch (eReq) {
        try { telegramSendText_(chat.id, "Не удалось отправить запрос. Попробуй ещё раз."); } catch (eTx2) {}
      }
      return;
    }
  } catch (eTg) {
    // не слать «Ошибка бота на /start» на каждый ретрай — это и есть спам
    try { Logger.log("handleTelegramUpdate_ err: " + eTg); } catch (eLog) {}
  }
}

function roleLabelRu_(role) {
  var map = {
    owner: "владелец",
    manager: "менеджер",
    cutter: "нарезчик",
    courier: "курьер",
    logistics: "логистика / склад",
    all: "полный доступ",
    pending: "ожидает одобрения",
    denied: "отказано",
    none: "нет доступа"
  };
  var key = String(role || "").toLowerCase();
  return map[key] || (key || "неизвестно");
}

/** Ответ на /start: роль по ID или предложение запросить доступ. Без записи в таблицу. */
function buildStartGreeting_(from, name) {
  var tid = String((from && from.id) || "").trim();
  var hello = "Привет" + (name ? ", " + name : "") + "!";
  if (!tid) {
    return { kind: "noid", text: hello + "\nНе удалось прочитать Telegram ID." };
  }
  var isOwner = false;
  try { isOwner = isOwnerId_(tid); } catch (eOwn) { isOwner = false; }
  if (isOwner) {
    return {
      kind: "owner",
      text: hello + "\nТвоя роль: " + roleLabelRu_("owner") + ".\nID: " + tid +
        "\nОткрывай мини-приложение Бойня-Конвейер."
    };
  }
  var row = null;
  try { row = findAccessById_(tid); } catch (eFind) { row = null; }
  if (row) {
    var role = String(row.role || "").toLowerCase();
    var status = String(row.status || "").toLowerCase();
    if (status === "denied" || role === "denied") {
      return {
        kind: "denied",
        text: hello + "\nДоступ закрыт.\nID: " + tid + "\nЕсли это ошибка — напиши владельцу."
      };
    }
    if (status === "pending" || role === "pending") {
      return {
        kind: "pending",
        text: hello + "\nЗапрос уже есть — ждём одобрения владельцем.\nID: " + tid,
        markup: { inline_keyboard: [[{ text: "Повторить запрос", callback_data: "access_req" }]] }
      };
    }
    if (status === "active" || role === "owner" || role === "manager" || role === "cutter" ||
        role === "courier" || role === "logistics" || role === "all") {
      var extra = role === "courier"
        ? "\nКогда сменщик пришлёт маршрут — придёт сюда."
        : "\nОткрывай мини-приложение Бойня-Конвейер.";
      return {
        kind: "role_" + role,
        text: hello + "\nТвоя роль: " + roleLabelRu_(role) + ".\nID: " + tid + extra
      };
    }
  }
  return {
    kind: "none",
    text: hello + "\nТебя ещё нет в доступах Бойни.\nID: " + tid +
      "\nНажми кнопку — отправим запрос владельцу.",
    markup: { inline_keyboard: [[{ text: "Запросить доступ", callback_data: "access_req" }]] }
  };
}

function collectStaffTelegramIds_(roles) {
  roles = roles || ["owner", "manager", "all"];
  var want = {};
  for (var w = 0; w < roles.length; w++) want[String(roles[w]).toLowerCase()] = true;
  var ids = {};
  try {
    var owners = getOwnerTelegramIds_();
    for (var i = 0; i < owners.length; i++) {
      if (owners[i]) ids[String(owners[i]).trim()] = true;
    }
  } catch (eO) {}
  try {
    var rows = readAccessRows_();
    for (var r = 0; r < rows.length; r++) {
      var role = String(rows[r].role || "").toLowerCase();
      var st = String(rows[r].status || "").toLowerCase();
      if (st === "denied") continue;
      if (!want[role]) continue;
      var id = String(rows[r].telegramId || "").trim();
      if (id) ids[id] = true;
    }
  } catch (eR) {}
  return Object.keys(ids);
}

/** Уведомить остальных owner/manager: неделю уже закрыли — баннер завершения не показывать. */
function notifyWeekFinished_(actorTid, weekKey, result) {
  var by = String(actorTid || "").trim();
  var who = by || "владелец";
  try {
    var row = findAccessById_(by);
    if (row) {
      var nm = String(row.name || "").trim();
      var un = String(row.username || "").trim();
      who = (nm || ("@" + un) || by);
      if (nm && un) who = nm + " @" + un;
      if (by) who = who + " (" + by + ")";
    }
  } catch (eWho) {}
  var text =
    "✅ Неделя завершена\n" +
    "Кто: " + who + "\n" +
    "Ключ недели: " + String(weekKey || "") + "\n" +
    "Новый Пн: " + String((result && result.mondayDate) || "") + "\n\n" +
    "Кнопка «Завершить неделю» у всех скрыта.\n" +
    "Дальше общий шаг — «Подтянуть из месяца».";
  var ids = collectStaffTelegramIds_(["owner", "manager", "all"]);
  for (var i = 0; i < ids.length; i++) {
    if (by && String(ids[i]) === by) continue;
    try { telegramSendText_(ids[i], text); } catch (e1) {}
  }
  try {
    var chat = PropertiesService.getScriptProperties().getProperty("TELEGRAM_CHAT_ID");
    if (chat && String(chat).trim() && String(chat).trim() !== by) {
      try { telegramSendText_(chat, text); } catch (e2) {}
    }
  } catch (e3) {}
}

function notifyOwnersAccessRequest_(telegramId, name, username) {
  var text = "Запрос доступа в Бойню\nID: " + telegramId +
    "\nИмя: " + (name || "") +
    "\n@" + (username || "") +
    "\nНазначьте роль во вкладке Люди.";
  try {
    var owners = getOwnerTelegramIds_();
    for (var i = 0; i < owners.length; i++) {
      try { telegramSendText_(owners[i], text); } catch (e) {}
    }
    var chat = PropertiesService.getScriptProperties().getProperty("TELEGRAM_CHAT_ID");
    if (chat) try { telegramSendText_(chat, text); } catch (e2) {}
  } catch (e3) {}
}

function processAccessRequestFromUser_(from, name, chatId, callbackId) {
  var tid = String((from && from.id) || "").trim();
  var username = (from && from.username) || "";
  if (!tid) {
    if (callbackId) telegramAnswerCallback_(callbackId, "Нет ID");
    return;
  }
  if (isOwnerId_(tid)) {
    upsertAccessRow_(tid, name, username, "owner", "active");
    if (callbackId) telegramAnswerCallback_(callbackId, "Вы владелец");
    telegramSendText_(chatId, "Ты владелец — доступ уже есть.");
    return;
  }
  var existing = findAccessById_(tid);
  if (existing && existing.status === "active" && existing.role !== "pending" && existing.role !== "denied") {
    if (callbackId) telegramAnswerCallback_(callbackId, "Уже есть доступ");
    telegramSendText_(chatId, "Доступ уже есть.\nРоль: " + roleLabelRu_(existing.role) + ".\nID: " + tid);
    return;
  }
  try {
    var c = CacheService.getScriptCache();
    if (c.get("access_req_" + tid)) {
      if (callbackId) telegramAnswerCallback_(callbackId, "Уже отправляли недавно");
      else telegramSendText_(chatId, "Запрос недавно уже отправляли — подожди пару минут.");
      return;
    }
    c.put("access_req_" + tid, "1", 300);
  } catch (eLim) {}
  upsertAccessRow_(tid, name, username, "pending", "pending");
  notifyOwnersAccessRequest_(tid, name, username);
  if (callbackId) telegramAnswerCallback_(callbackId, "Запрос отправлен");
  telegramSendText_(chatId, "Запрос отправлен владельцу. Жди назначения роли.\nID: " + tid);
}

function handleAccessRequestCallback_(cq) {
  if (!cq) return;
  var from = cq.from || {};
  var name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  var chatId = cq.message && cq.message.chat ? cq.message.chat.id : from.id;
  processAccessRequestFromUser_(from, name, chatId, cq.id);
}

function handleRegisterCourier(json, callback, fromPost) {
  var chatId = json.telegramId || json.chatId || json.id;
  var name = json.name || "";
  var username = json.username || "";
  if (!chatId) {
    var body = { status: "error", message: "no_telegram_id" };
    return fromPost ? jsonpText(callback, body) : jsonp(callback, body);
  }
  upsertCourier_(chatId, name, username);
  var ok = { status: "success" };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleGetCouriers(callback, fromPost) {
  var sh = getCouriersSheet_();
  var data = sh.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var id = data[i][0];
    if (id === "" || id == null) continue;
    list.push({
      id: String(id),
      name: data[i][1] != null ? String(data[i][1]) : "",
      username: data[i][2] != null ? String(data[i][2]) : ""
    });
  }
  var body = { status: "success", couriers: list };
  return fromPost ? jsonpText(callback, body) : jsonp(callback, body);
}

function handleSendCourierRoute(json, callback, fromPost) {
  var chatId = json.telegramId || json.chatId || json.id;
  var text = json.text || "";
  // Длинный текст — через ticket в CacheService (POST prepare → GET send)
  if (json.ticket) {
    try {
      var cached = CacheService.getScriptCache().get("route_" + String(json.ticket));
      if (cached) text = cached;
    } catch (e) {}
  }
  if (!chatId) {
    var noChat = { status: "error", message: "no_chat", description: "Пустой chat id курьера" };
    return fromPost ? jsonpText(callback, noChat) : jsonp(callback, noChat);
  }
  if (!text) {
    var noText = { status: "error", message: "need_id_and_text", description: "Нет текста маршрута (ticket не найден — подождите и повторите)" };
    return fromPost ? jsonpText(callback, noText) : jsonp(callback, noText);
  }
  var result = telegramSendText_(chatId, text);
  var body = result && result.ok
    ? { status: "success" }
    : {
        status: "error",
        message: (result && (result.description || result.message || result.error)) || "send_failed",
        raw: result
      };
  return fromPost ? jsonpText(callback, body) : jsonp(callback, body);
}

function handlePrepareCourierRoute(json, callback, fromPost) {
  var text = String(json.text || "");
  if (!text) {
    var bad = { status: "error", message: "empty_text" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var ticket = json.ticket ? String(json.ticket).replace(/[^a-zA-Z0-9_:-]/g, "").slice(0, 64) : "";
  if (!ticket) ticket = String(Date.now()) + "_" + String(Math.floor(Math.random() * 1e6));
  try {
    CacheService.getScriptCache().put("route_" + ticket, text.slice(0, 90000), 300);
  } catch (e) {
    var err = { status: "error", message: "cache_failed" };
    return fromPost ? jsonpText(callback, err) : jsonp(callback, err);
  }
  var ok = { status: "success", ticket: ticket };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleTelegramStatus(callback, fromPost) {
  var body = {
    status: "success",
    hasToken: !!getTelegramToken_()
  };
  return fromPost ? jsonpText(callback, body) : jsonp(callback, body);
}

/**
 * Подсказки адресов — Nominatim (BY) + Photon.
 * Photon: lang=ru больше не поддерживается → lang=default.
 */
function handleSuggestAddress(json, callback, fromPost) {
  var text = String(json.text || json.q || "").trim();
  var body;
  if (text.length < 2 && json.lat == null) {
    body = { status: "success", results: [], source: "empty" };
    return fromPost ? jsonpText(callback, body) : jsonp(callback, body);
  }
  var results = [];
  var source = "none";

  // опционально: поиск по координатам (не вместо обычного — только если похоже на lat/lon)
  var coords = null;
  if (json.lat != null && json.lon != null) {
    var la = Number(json.lat);
    var lo = Number(json.lon);
    if (isFinite(la) && isFinite(lo)) coords = { lat: la, lon: lo };
  }
  if (!coords) coords = parseLatLonFromTextGs_(text);
  if (coords) {
    try {
      results = nominatimReverse_(coords.lat, coords.lon);
      if (results.length) source = "nominatim_reverse";
    } catch (eR) {
      Logger.log("nominatim reverse err: " + eR);
    }
    body = { status: "success", results: results, source: source, coords: coords };
    return fromPost ? jsonpText(callback, body) : jsonp(callback, body);
  }

  // Nominatim для Беларуси обычно точнее улиц Минска (+ structured street+house)
  try {
    results = nominatimSuggest_(text);
    if (results.length) source = "nominatim";
  } catch (e2) {
    Logger.log("nominatim suggest err: " + e2);
  }
  var wantHouse = !!parseSearchStreetHouseGs_(text).house;
  if (!results.length || (wantHouse && !suggestHasWantedHouseGs_(results, text))) {
    try {
      var photon = photonSuggest_(text);
      results = mergeSuggestResultsGs_(results, photon);
      if (photon.length && source === "none") source = "photon";
      else if (photon.length && source === "nominatim") source = "nominatim+photon";
    } catch (e0) {
      Logger.log("photon suggest err: " + e0);
    }
  }
  if (!results.length) {
    var key = PropertiesService.getScriptProperties().getProperty("YANDEX_MAPS_API_KEY") || "";
    if (key) {
      try {
        results = yandexGeocodeSuggest_(text, key);
        if (results.length) source = "yandex";
      } catch (e1) {
        Logger.log("yandex suggest err: " + e1);
      }
    }
  }
  results = finalizeAddressSuggestsGs_(rankAddressSuggestsGs_(results, text), text);
  body = { status: "success", results: results, source: source };
  return fromPost ? jsonpText(callback, body) : jsonp(callback, body);
}

function parseLatLonFromTextGs_(text) {
  var s = String(text || "").trim();
  if (!s) return null;
  var ym = s.match(/[?&#]pt=([+-]?\d{1,3}(?:[.,]\d+)?)\s*,\s*([+-]?\d{1,3}(?:[.,]\d+)?)/i);
  if (ym) {
    var ya = Number(String(ym[1]).replace(",", "."));
    var yb = Number(String(ym[2]).replace(",", "."));
    if (isFinite(ya) && isFinite(yb)) return orderLatLonPairGs_(ya, yb);
  }
  s = s.replace(/^@+/, "").trim();
  var m = s.match(/^([+-]?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]+\s*([+-]?\d{1,3}(?:[.,]\d+)?)\s*$/);
  if (!m) return null;
  if (!/[.,]\d/.test(m[1]) && !/[.,]\d/.test(m[2])) return null;
  var x = Number(String(m[1]).replace(",", "."));
  var y = Number(String(m[2]).replace(",", "."));
  if (!isFinite(x) || !isFinite(y)) return null;
  return orderLatLonPairGs_(x, y);
}

function orderLatLonPairGs_(a, b) {
  if (a >= 50 && a <= 58 && b >= 22 && b <= 41) return { lat: a, lon: b };
  if (b >= 50 && b <= 58 && a >= 22 && a <= 41) return { lat: b, lon: a };
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lon: b };
  if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lon: a };
  return null;
}

function nominatimReverse_(lat, lon) {
  var url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=ru&lat=" +
    encodeURIComponent(lat) + "&lon=" + encodeURIComponent(lon);
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { "User-Agent": "superboyna-courier/1.0" }
  });
  if (res.getResponseCode() >= 400) return [];
  var row = JSON.parse(res.getContentText());
  if (!row) return [];
  var ad = row.address || {};
  var street = String(ad.road || ad.pedestrian || ad.street || ad.avenue || "").trim();
  var house = String(ad.house_number || "").trim();
  var title = "";
  if (street && house) title = street + ", " + house;
  else if (street) title = street;
  else title = String(row.display_name || "").split(",").slice(0, 2).join(", ").trim();
  title = String(title || "").replace(/,\s*(Беларусь|Belarus|Минск|Minsk|Мінск).*$/i, "").trim();
  if (!title) title = Number(lat).toFixed(6) + ", " + Number(lon).toFixed(6);
  return [{
    title: title,
    subtitle: "",
    address: title,
    lat: Number(lat),
    lon: Number(lon),
    yandexUrl: "https://yandex.ru/maps/?pt=" + lon + "," + lat + "&z=17&l=map",
    fromCoords: true
  }];
}

function stripAddressDetailsForSearchGs_(text) {
  var raw0 = String(text || "").trim().replace(/\s+/g, " ");
  if (!raw0) return "";
  return raw0
    .replace(/(?:^|[·|;,\s])(?:подъезд|под\.|п\.)\s*[0-9]+[а-яa-z]?/gi, " ")
    .replace(/(?:^|[·|;,\s])(?:этаж|эт\.?)\s*[0-9]+[а-яa-z]?/gi, " ")
    .replace(/(?:^|[·|;,\s])(?:квартира|кв\.?)\s*[0-9]+[а-яa-z\-\/]*/gi, " ")
    .replace(/(?:^|[·|;,\s])[0-9]+[а-яa-z\-\/]*\s*кв\.?\b/gi, " ")
    .replace(/(?:^|[·|;,\s])домофон\s*[^\s·|;,]{1,24}/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim() || raw0;
}

function looksLikeOtherCityGs_(addr) {
  return /(брест|гродн|гомел|витебск|могил[её]в|борисов|жодино|молодечн|баранович|пинск|орша|полоцк|лида|слоним|бобруйск|солигорск|слуцк|дзержинск|фанипол|смолевич|светлогорск|жлобин|речиц|новополоцк|мозыр|колодищ|голодищ|городищ|боровлян|жданович|ратомк|миханович|семков|прилук|крыжовк|хатежин|тарасов|раубич|озерц|щепич|заславл|логойск|руденск|мачулищ|сеница|копищ|юхновк|лесной|гай\b)/i.test(String(addr || ""));
}

function detectSearchLocalityGs_(text) {
  var s = String(text || "");
  var m = s.match(/(колодищ\w*|голодищ\w*|городищ\w*|боровлян\w*|жданович\w*|фанипол\w*|дзержинск\w*|смолевич\w*|ратомк\w*|миханович\w*|семков\w*|прилук\w*|крыжовк\w*|хатежин\w*|тарасов\w*|раубич\w*|озерц\w*|щепич\w*|заславл\w*|логойск\w*|руденск\w*|мачулищ\w*|сениц\w*|копищ\w*|юхновк\w*|лесной|боровляны|брест\w*|гродн\w*|гомел\w*|витебск\w*|могил[её]в\w*|борисов\w*|жодино|молодечн\w*|баранович\w*|пинск\w*|орша|полоцк\w*|лида|слоним\w*|бобруйск\w*|солигорск\w*|слуцк\w*)/i);
  if (!m) return "";
  var loc = String(m[0] || "");
  if (/^голодищ/i.test(loc)) loc = loc.replace(/^голодищ/i, "Колодищ");
  return loc;
}

function normalizeLocalityTypoGs_(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/голодищ/g, "колодищ")
    .replace(/гродищ/g, "городищ");
}

function greaterMinskNominatimViewboxGs_() {
  return "27.15,54.15,28.05,53.65";
}

function inGreaterMinskRegionGs_(lat, lon) {
  lat = Number(lat);
  lon = Number(lon);
  return lat >= 53.65 && lat <= 54.15 && lon >= 27.15 && lon <= 28.05;
}

function inBelarusBboxGs_(lat, lon) {
  lat = Number(lat);
  lon = Number(lon);
  return lat >= 51.2 && lat <= 56.3 && lon >= 23.1 && lon <= 32.9;
}

function addressGeoAllowedGs_(lat, lon, text) {
  if (looksLikeOtherCityGs_(text) || detectSearchLocalityGs_(text)) {
    return inBelarusBboxGs_(lat, lon);
  }
  return inGreaterMinskRegionGs_(lat, lon);
}

function localityLabelFromOsmGs_(ad) {
  if (!ad) return "";
  var loc = String(ad.village || ad.hamlet || ad.town || ad.suburb || ad.municipality || "").trim();
  if (!loc && ad.city && !/^(минск|minsk|м[іи]нск)$/i.test(String(ad.city))) {
    loc = String(ad.city).trim();
  }
  if (/^(минск|minsk|м[іи]нск)$/i.test(loc)) return "";
  return loc;
}

function buildAddressSuggestTitleGs_(street, house, locality) {
  var st = String(street || "").trim();
  var h = String(house || "").trim();
  var loc = String(locality || "").trim();
  if (/^(минск|minsk|м[іи]нск)$/i.test(loc)) loc = "";
  var core = "";
  if (st && h) core = st + ", " + h;
  else if (st) core = st;
  else if (loc && h) core = loc + ", " + h;
  else if (h) core = h;
  else core = loc;
  if (loc && core && core.toLowerCase().indexOf(loc.toLowerCase()) < 0) core = loc + ", " + core;
  else if (!core) core = loc;
  return String(core || "").replace(/,\s*(Беларусь|Belarus|Минск|Minsk|Мінск).*$/i, "").trim() || core;
}

function minskNominatimViewboxGs_() {
  return greaterMinskNominatimViewboxGs_();
}

function inMinskBboxGs_(lat, lon) {
  return inGreaterMinskRegionGs_(lat, lon);
}

function streetNameMatchesQueryGs_(resultTitle, queryText) {
  var want = parseSearchStreetHouseGs_(queryText);
  function norm(s) {
    return normalizeLocalityTypoGs_(String(s || "")
      .toUpperCase()
      .replace(/Ё/g, "Е")
      .replace(/\bУЛ\.?\b/g, " ")
      .replace(/\bУЛИЦ[АЫ]\b/g, " ")
      .replace(/\bПР\.?-?\s*Т\.?\b/g, " ")
      .replace(/\bПРОСПЕКТ(Е|А|У)?\b/g, " ")
      .replace(/\bПР\.?\b/g, " ")
      .replace(/\bПЕР\.?\b/g, " ")
      .replace(/\bПЕРЕУЛОК\b/g, " ")
      .replace(/\bМИНСК\b/g, " ")
      .replace(/\bБЕЛАРУСЬ\b/g, " ")
      .replace(/[.,«»"']/g, " ")
      .replace(/\s+/g, " ")
      .trim());
  }
  var qStreet = norm(want.street || queryText);
  var aStreet = norm(resultTitle);
  if (!qStreet || !aStreet) return true;
  var loc = detectSearchLocalityGs_(queryText);
  if (loc) {
    var locN = norm(loc);
    var prefLoc = locN.slice(0, Math.min(6, locN.length));
    if (prefLoc.length >= 4 && aStreet.indexOf(prefLoc) >= 0) return true;
  }
  var qWords = qStreet.split(" ").filter(function (w) {
    return w.length >= 4 && !/^\d/.test(w);
  });
  if (!qWords.length) return true;
  qWords.sort(function (a, b) { return b.length - a.length; });
  var main = qWords[0];
  if (aStreet.indexOf(main) >= 0) return true;
  var pref = main.slice(0, Math.min(6, main.length));
  if (pref.length >= 5 && aStreet.indexOf(pref) >= 0) return true;
  return false;
}

function suggestDedupeKeyGs_(it) {
  var title = String((it && (it.address || it.title)) || "").trim();
  title = String(title || "").replace(/,\s*(Беларусь|Belarus|Минск|Minsk|Мінск).*$/i, "").trim();
  var p = parseSearchStreetHouseGs_(title);
  var house = normalizeHouseKeyGs_((it && it.house) || p.house || "");
  if (house) {
    return String(p.street || title).toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim() + "#" + house;
  }
  if (it && it.lat != null && it.lon != null) {
    return Number(it.lat).toFixed(4) + "," + Number(it.lon).toFixed(4);
  }
  return title.toLowerCase();
}

function suggestKindBonusGs_(it) {
  var k = String((it && (it.kind || it.addresstype || it.category)) || "").toLowerCase();
  if (/house|building|residential|apartments|yes/.test(k)) return 28;
  if (/shop|amenity|leisure|office|tourism|clinic/.test(k)) return 6;
  if (/road|highway|street|pedestrian/.test(k)) return -20;
  return 0;
}

function finalizeAddressSuggestsGs_(list, q) {
  var wantH = normalizeHouseKeyGs_(parseSearchStreetHouseGs_(q).house);
  var byKey = {};
  var order = [];
  for (var i = 0; i < (list || []).length; i++) {
    var it = list[i];
    if (!it) continue;
    if (!streetNameMatchesQueryGs_(it.address || it.title || "", q)) continue;
    var key = suggestDedupeKeyGs_(it);
    if (!key) continue;
    if (!byKey[key]) {
      byKey[key] = it;
      order.push(key);
      continue;
    }
    if (suggestKindBonusGs_(it) > suggestKindBonusGs_(byKey[key])) byKey[key] = it;
  }
  var merged = [];
  for (var oi = 0; oi < order.length; oi++) merged.push(byKey[order[oi]]);
  merged.sort(function (a, b) {
    return (scoreSuggestItemGs_(b, q) + suggestKindBonusGs_(b)) - (scoreSuggestItemGs_(a, q) + suggestKindBonusGs_(a));
  });
  if (wantH) {
    var withH = [];
    var onlySt = [];
    for (var j = 0; j < merged.length; j++) {
      var got = normalizeHouseKeyGs_((merged[j] && merged[j].house) || houseFromSuggestTitleGs_((merged[j].address || merged[j].title) || ""));
      if (got) withH.push(merged[j]);
      else onlySt.push(merged[j]);
    }
    merged = withH.concat(onlySt.slice(0, withH.length ? 2 : 6));
  }
  return merged.slice(0, 8);
}

function normalizeHouseKeyGs_(h) {
  return String(h || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, "")
    .replace(/корп\.?|корпус/gi, "к")
    .replace(/стр\.?|строение/gi, "с")
    .replace(/[k]/g, "к");
}

/** Улица + номер дома из строки поиска. */
function parseSearchStreetHouseGs_(text) {
  var raw0 = String(text || "").trim().replace(/\s+/g, " ");
  if (!raw0) return { street: "", house: "", raw: "" };
  var s = stripAddressDetailsForSearchGs_(raw0) || raw0;
  var house = "";
  var street = s;
  var m = s.match(/^(.*?)(?:,\s*|\s+)(?:д\.?|дом)\s*([0-9]+[а-яa-z]?(?:\s*[\/кk]\s*[0-9]+[а-яa-z]?)?)\s*$/i);
  if (m && /[а-яa-z]/i.test(m[1])) {
    street = String(m[1] || "").trim().replace(/[,\s]+$/g, "");
    house = String(m[2] || "").replace(/\s+/g, "").replace(/[k]/gi, "к");
    return { street: street, house: house, raw: s };
  }
  m = s.match(/^(.*?)(?:,\s*|\s+)([0-9]+[а-яa-z]?(?:\s*[\/кk]\s*[0-9]+[а-яa-z]?)?)\s*$/i);
  if (m) {
    var st = String(m[1] || "").trim().replace(/[,\s]+$/g, "");
    var hn = String(m[2] || "").replace(/\s+/g, "").replace(/[k]/gi, "к");
    if (st && /[а-яa-z]/i.test(st) && !/^\d{5,6}$/.test(hn)) {
      street = st;
      house = hn;
    }
  }
  return { street: street, house: house, raw: s };
}

function houseFromSuggestTitleGs_(title) {
  return parseSearchStreetHouseGs_(title).house || "";
}

function scoreAddressGs_(addr, q) {
  function norm(s) {
    return String(s || "")
      .toUpperCase()
      .replace(/Ё/g, "Е")
      .replace(/\bУЛ\.?\b/g, " ")
      .replace(/\bУЛИЦ[АЫ]\b/g, " ")
      .replace(/\bПР\.?-?\s*Т\.?\b/g, " ")
      .replace(/\bПРОСПЕКТ(Е|А|У)?\b/g, " ")
      .replace(/\bПР\.?\b/g, " ")
      .replace(/\bПЕР\.?\b/g, " ")
      .replace(/\bПЕРЕУЛОК\b/g, " ")
      .replace(/\bМИНСК\b/g, " ")
      .replace(/\bБЕЛАРУСЬ\b/g, " ")
      .replace(/[.,«»"']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  var a = norm(addr);
  var qu = norm(q);
  if (!a || !qu) return 0;
  if (a === qu) return 100;
  if (a.indexOf(qu) === 0) return 94;
  if (a.indexOf(qu) >= 0) return 86;
  var qWords = qu.split(" ").filter(function (w) { return w.length >= 2 || /^\d/.test(w); });
  if (!qWords.length) return 0;
  var hit = 0;
  for (var i = 0; i < qWords.length; i++) {
    var w = qWords[i];
    if (a.indexOf(w) >= 0) { hit++; continue; }
    var parts = a.split(" ");
    var pref = false;
    for (var j = 0; j < parts.length; j++) {
      if (parts[j].indexOf(w) === 0 || w.indexOf(parts[j]) === 0) { pref = true; break; }
    }
    if (pref) hit += 0.7;
  }
  var ratio = hit / qWords.length;
  if (ratio >= 1) return 80;
  if (ratio >= 0.7) return 68;
  if (ratio >= 0.5 && qWords.length >= 2) return 52;
  return 0;
}

function scoreSuggestItemGs_(it, q) {
  var title = String((it && (it.address || it.title)) || "");
  var base = scoreAddressGs_(title, q);
  var wantH = normalizeHouseKeyGs_(parseSearchStreetHouseGs_(q).house);
  if (!wantH) return base;
  var gotH = normalizeHouseKeyGs_((it && it.house) || houseFromSuggestTitleGs_(title));
  if (gotH && gotH === wantH) return base + 45;
  if (gotH && (gotH.indexOf(wantH) === 0 || wantH.indexOf(gotH) === 0)) return base + 30;
  if (gotH) return base + 8;
  return base - 40;
}

function rankAddressSuggestsGs_(list, q) {
  var arr = (list || []).slice();
  arr.sort(function (a, b) {
    return scoreSuggestItemGs_(b, q) - scoreSuggestItemGs_(a, q);
  });
  var wantH = normalizeHouseKeyGs_(parseSearchStreetHouseGs_(q).house);
  if (!wantH) return arr.slice(0, 10);
  var withH = [];
  var onlySt = [];
  for (var i = 0; i < arr.length; i++) {
    var it = arr[i];
    var got = normalizeHouseKeyGs_((it && it.house) || houseFromSuggestTitleGs_((it && (it.address || it.title)) || ""));
    if (got) withH.push(it);
    else onlySt.push(it);
  }
  return (withH.length ? withH.concat(onlySt) : arr).slice(0, 10);
}

function suggestHasWantedHouseGs_(list, q) {
  var wantH = normalizeHouseKeyGs_(parseSearchStreetHouseGs_(q).house);
  if (!wantH) return true;
  for (var i = 0; i < (list || []).length; i++) {
    var it = list[i];
    var got = normalizeHouseKeyGs_((it && it.house) || houseFromSuggestTitleGs_((it && (it.address || it.title)) || ""));
    if (got && (got === wantH || got.indexOf(wantH) === 0 || wantH.indexOf(got) === 0)) return true;
  }
  return false;
}

function mergeSuggestResultsGs_() {
  var seen = {};
  var out = [];
  for (var ai = 0; ai < arguments.length; ai++) {
    var arr = arguments[ai] || [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (!it) continue;
      var title = String(it.address || it.title || "").trim();
      if (!title) continue;
      title = String(title || "").replace(/,\s*(Беларусь|Belarus|Минск|Minsk|Мінск).*$/i, "").trim();
      var house = String(it.house || houseFromSuggestTitleGs_(title) || "").trim();
      var item = {
        title: title,
        subtitle: String(it.subtitle || ""),
        address: title,
        house: house,
        kind: String(it.kind || it.addresstype || it.category || ""),
        lat: it.lat,
        lon: it.lon,
        yandexUrl: it.yandexUrl || ("https://yandex.ru/maps/?pt=" + it.lon + "," + it.lat + "&z=17&l=map")
      };
      var key = suggestDedupeKeyGs_(item);
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(item);
    }
  }
  return out;
}

function expandAddressQueriesGs_(text) {
  var raw0 = String(text || "").trim().replace(/\s+/g, " ");
  if (!raw0) return [];
  raw0 = raw0.replace(/голодищ/gi, "Колодищ").replace(/гродищ/gi, "Городищ");
  var raw = stripAddressDetailsForSearchGs_(raw0) || raw0;
  var parsed = parseSearchStreetHouseGs_(raw);
  var streetOnly = parsed.house ? parsed.street : raw;
  var bare = streetOnly.replace(/^(ул\.?|улица|пр\.?-?\s*т\.?|проспект|пер\.?|переулок|бул\.?|бульвар)\s+/i, "").trim();
  var locWant = detectSearchLocalityGs_(raw);
  var isLocalityQuery = !!(locWant && bare && normalizeLocalityTypoGs_(bare).indexOf(normalizeLocalityTypoGs_(locWant).slice(0, 5)) >= 0);
  var withType = bare;
  if (isLocalityQuery) {
    withType = streetOnly;
  } else if (/^(ул\.?|улица|пр\.?-?\s*т\.?|проспект|пер\.?|переулок)/i.test(streetOnly)) {
    withType = streetOnly.replace(/^ул\.?\s+/i, "улица ").replace(/^пр\.?-?\s*т\.?\s+/i, "проспект ").replace(/^пр\.?\s+/i, "проспект ");
  } else {
    withType = "улица " + bare;
  }
  var out = isLocalityQuery ? [raw, streetOnly, bare] : [raw, streetOnly, bare, withType];
  if (raw0 !== raw) out.unshift(raw0);
  if (parsed.house) {
    var h = parsed.house;
    out.push(streetOnly + ", " + h);
    out.push(streetOnly + " " + h);
    out.push(bare + ", " + h);
    if (!isLocalityQuery) {
      out.push(withType + ", " + h);
      out.push(withType + " " + h);
      out.push(withType + ", д." + h);
    }
    out.push(streetOnly + ", д." + h);
  }
  if (locWant) {
    out.push(locWant + ", Минский район");
    out.push(locWant + ", Беларусь");
    out.push("аг. " + locWant);
    if (parsed.house) out.push(locWant + ", " + parsed.house);
  } else if (!/минск|беларусь|брест|гродн|гомел|витебск|могил/i.test(raw)) {
    out.push(raw + ", Минск");
    out.push("Минск, " + raw);
    if (parsed.house) {
      out.push("Минск, " + withType + ", " + parsed.house);
      out.push(withType + ", " + parsed.house + ", Минск");
    } else {
      out.push(bare + ", Минск");
      out.push("Минск, " + withType);
    }
  }
  var seen = {};
  var uniq = [];
  for (var i = 0; i < out.length; i++) {
    var q = String(out[i] || "").trim();
    var k = q.toLowerCase();
    if (!k || seen[k]) continue;
    seen[k] = true;
    uniq.push(q);
  }
  return uniq.slice(0, 12);
}

/** Бесплатный геокодер Photon (OSM) */
function photonSuggest_(text) {
  var queries = expandAddressQueriesGs_(text);
  if (!queries.length) return [];
  var out = [];
  var seen = {};
  var wantHouse = !!parseSearchStreetHouseGs_(text).house;
  var locWant = detectSearchLocalityGs_(text);
  var otherOk = !!(looksLikeOtherCityGs_(text) || locWant);
  for (var qi = 0; qi < Math.min(queries.length, wantHouse || locWant ? 7 : 4); qi++) {
    var q = queries[qi];
    if (locWant) {
      if (!/беларусь/i.test(q)) q = q + ", Беларусь";
    } else if (!/минск|беларусь|брест|гродн|гомел|витебск|могил/i.test(q)) {
      q = q + ", Минск";
    }
    var url = "https://photon.komoot.io/api/?limit=12&lang=default&lat=53.9&lon=27.56&q=" +
      encodeURIComponent(q);
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() >= 400) continue;
    var data = JSON.parse(res.getContentText());
    var features = (data && data.features) || [];
    for (var i = 0; i < features.length; i++) {
      var f = features[i] || {};
      var geom = f.geometry || {};
      var coords = geom.coordinates || [];
      if (coords.length < 2) continue;
      var lon = Number(coords[0]);
      var lat = Number(coords[1]);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      if (!addressGeoAllowedGs_(lat, lon, text)) continue;
      var p = f.properties || {};
      var street = String(p.street || "").trim();
      var house = String(p.housenumber || "").trim();
      if (!street && p.name && (String(p.osm_key || "") === "highway" || String(p.type || "") === "street" || !house)) {
        street = String(p.name || "").trim();
      }
      var locality = "";
      if (p.city && !/^(минск|minsk|м[іи]нск)$/i.test(String(p.city))) locality = String(p.city);
      else if (p.locality) locality = String(p.locality);
      else if (p.name && /village|hamlet|town|suburb/i.test(String(p.type || p.osm_value || ""))) locality = String(p.name);
      var title = buildAddressSuggestTitleGs_(street, house, locality);
      if (!title && p.name) title = String(p.name);
      title = String(title || "").replace(/,\s*(Беларусь|Belarus|Минск|Minsk|Минская область|Мінск).*$/i, "").trim();
      if (!title) continue;
      if (!streetNameMatchesQueryGs_(title, text)) continue;
      var item = {
        title: title,
        subtitle: "",
        address: title,
        house: house,
        kind: String(p.type || p.osm_value || ""),
        lat: lat,
        lon: lon,
        yandexUrl: "https://yandex.ru/maps/?pt=" + lon + "," + lat + "&z=17&l=map"
      };
      var keyDup = suggestDedupeKeyGs_(item);
      if (seen[keyDup]) continue;
      seen[keyDup] = true;
      out.push(item);
    }
    if (wantHouse) {
      if (suggestHasWantedHouseGs_(out, text) && out.length >= 1) break;
    } else if (out.length >= 5) {
      break;
    }
  }
  return out;
}

function yandexGeocodeSuggest_(text, key) {
  var q = text;
  var locWant = detectSearchLocalityGs_(text);
  if (locWant) {
    if (!/беларусь/i.test(text)) q = text + ", Беларусь";
  } else if (!/минск|беларусь|брест|гродн|гомел|витебск|могил/i.test(text)) {
    q = "Минск, " + text;
  }
  var url = "https://geocode-maps.yandex.ru/1.x/?apikey=" + encodeURIComponent(key) +
    "&format=json&lang=ru_RU&results=7&geocode=" + encodeURIComponent(q);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() >= 400) return [];
  var data = JSON.parse(res.getContentText());
  var members = ((((data || {}).response || {}).GeoObjectCollection || {}).featureMember) || [];
  var out = [];
  for (var i = 0; i < members.length; i++) {
    var geo = (members[i] || {}).GeoObject || {};
    var meta = ((geo.metaDataProperty || {}).GeocoderMetaData) || {};
    var pos = String((geo.Point || {}).pos || "").trim().split(/\s+/);
    if (pos.length < 2) continue;
    var lon = Number(pos[0]);
    var lat = Number(pos[1]);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    if (!addressGeoAllowedGs_(lat, lon, text)) continue;
    var title = String(geo.name || meta.text || "").trim();
    var subtitle = String(geo.description || "").trim();
    var label = subtitle ? (title + ", " + subtitle) : (meta.text || title);
    out.push({
      title: title,
      subtitle: subtitle,
      address: label,
      lat: lat,
      lon: lon,
      yandexUrl: "https://yandex.ru/maps/?pt=" + lon + "," + lat + "&z=17&l=map"
    });
  }
  return out;
}

function nominatimPushRowsGs_(data, text, seen, out) {
  var locWant = detectSearchLocalityGs_(text);
  for (var i = 0; i < (data || []).length; i++) {
    var row = data[i];
    var lat = Number(row.lat);
    var lon = Number(row.lon);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    if (!addressGeoAllowedGs_(lat, lon, text)) continue;
    var ad = row.address || {};
    var street = String(ad.road || ad.pedestrian || ad.street || ad.avenue || "").trim();
    var house = String(ad.house_number || "").trim();
    var locality = localityLabelFromOsmGs_(ad);
    var title = buildAddressSuggestTitleGs_(street, house, locality);
    if (!title) {
      title = String(row.display_name || "").split(",").slice(0, 2).join(", ").trim();
    }
    title = String(title || "").replace(/,\s*(Беларусь|Belarus|Минск|Minsk|Мінск).*$/i, "").trim();
    if (!title) continue;
    if (!streetNameMatchesQueryGs_(title, text)) continue;
    var item = {
      title: title,
      subtitle: "",
      address: title,
      house: house,
      kind: String(row.addresstype || row.category || row.type || ""),
      lat: lat,
      lon: lon,
      yandexUrl: "https://yandex.ru/maps/?pt=" + lon + "," + lat + "&z=17&l=map"
    };
    var keyDup = suggestDedupeKeyGs_(item);
    if (seen[keyDup]) continue;
    seen[keyDup] = true;
    out.push(item);
  }
}

function nominatimStructuredSuggestGs_(street, house, city) {
  if (!street || !house) return [];
  var streetParam = String(house).trim() + " " + String(street).trim();
  var cityName = String(city || "Минск").trim() || "Минск";
  var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=by&accept-language=ru" +
    "&street=" + encodeURIComponent(streetParam) +
    "&city=" + encodeURIComponent(cityName);
  if (!detectSearchLocalityGs_(cityName) && !looksLikeOtherCityGs_(cityName)) {
    url += "&viewbox=" + encodeURIComponent(greaterMinskNominatimViewboxGs_());
  }
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { "User-Agent": "superboyna-courier/1.0" }
  });
  if (res.getResponseCode() >= 400) return [];
  return JSON.parse(res.getContentText()) || [];
}

function nominatimSuggest_(text) {
  var queries = expandAddressQueriesGs_(text);
  if (!queries.length) return [];
  var out = [];
  var seen = {};
  var parsed = parseSearchStreetHouseGs_(text);
  var wantHouse = !!parsed.house;
  var locWant = detectSearchLocalityGs_(text);
  var otherOk = !!(looksLikeOtherCityGs_(text) || locWant);
  if (wantHouse && parsed.street) {
    var stVariants = [parsed.street];
    var bareSt = parsed.street
      .replace(/^(ул\.?|улица|пр\.?-?\s*т\.?|проспект|пер\.?|переулок|бул\.?|бульвар)\s+/i, "")
      .trim();
    if (bareSt && bareSt !== parsed.street) stVariants.push(bareSt);
    if (!/^(ул\.?|улица)/i.test(parsed.street) && !locWant) stVariants.push("улица " + bareSt);
    var cityForStruct = locWant || "Минск";
    for (var si = 0; si < stVariants.length; si++) {
      try {
        nominatimPushRowsGs_(nominatimStructuredSuggestGs_(stVariants[si], parsed.house, cityForStruct), text, seen, out);
      } catch (eSt) {}
      if (suggestHasWantedHouseGs_(out, text)) break;
    }
  }
  for (var qi = 0; qi < Math.min(queries.length, wantHouse || locWant ? 7 : 4); qi++) {
    var q = queries[qi];
    if (locWant) {
      if (!/беларусь/i.test(q)) q = q + ", Беларусь";
    } else if (!/минск|беларусь|брест|гродн|гомел|витебск|могил/i.test(q)) {
      q = "Минск, " + q;
    }
    var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=by&accept-language=ru&q=" +
      encodeURIComponent(q);
    if (!otherOk) {
      url += "&viewbox=" + encodeURIComponent(greaterMinskNominatimViewboxGs_());
    }
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { "User-Agent": "superboyna-courier/1.0" }
    });
    if (res.getResponseCode() >= 400) continue;
    var data = JSON.parse(res.getContentText());
    nominatimPushRowsGs_(data, text, seen, out);
    if (wantHouse) {
      if (suggestHasWantedHouseGs_(out, text) && out.length >= 1) break;
    } else if (out.length >= 5) {
      break;
    }
  }
  return out;
}

/* ========== GEO вне примечания ========== */

function stripGeoTagsFromNote_(note) {
  return String(note || "")
    .replace(/\[GEO:[^\]]+\]/gi, "")
    .replace(/\[YMAPS:[^\]]+\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Аудитория примечания: [TO:mgr,cut,cour]. Без тега — менеджеру и курьеру (как раньше). */
function parseNoteAudience_(note) {
  var m = String(note || "").match(/\[TO:([^\]]+)\]/i);
  if (!m) return ["mgr", "cour"];
  var roles = String(m[1] || "").toLowerCase().split(/[,;\s]+/).filter(function (r) {
    return r === "mgr" || r === "cut" || r === "cour";
  });
  return roles.length ? roles : ["mgr", "cour"];
}

function stripNoteAudienceTag_(note) {
  return String(note || "")
    .replace(/\[TO:[^\]]+\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function noteVisibleForRole_(note, role) {
  var raw = String(note || "");
  if (/\[NOTE:/i.test(raw)) {
    var re = /\[NOTE:([^|\]]+)\|(perm|once)(?:\|ITEM:[^\]]+)?\]/gi;
    var m;
    var any = false;
    while ((m = re.exec(raw))) {
      any = true;
      var rolesArr = String(m[1] || "").toLowerCase().split(/[,;\s]+/);
      for (var j = 0; j < rolesArr.length; j++) {
        if (rolesArr[j] === role) return true;
      }
    }
    if (any) return false;
  }
  var roles = parseNoteAudience_(note);
  for (var i = 0; i < roles.length; i++) {
    if (roles[i] === role) return true;
  }
  return false;
}

function cleanNoteText_(note) {
  return stripNoteAudienceTag_(stripGeoTagsFromNote_(String(note || "")
    .replace(/\[ЕВРОПОЧТА\]/gi, "")
    .replace(/\[БЕЛПОЧТА\]/gi, "")
    .replace(/\[КУРЬЕР\]/gi, "")
    .replace(/\[ОТДЕЛЕНИЕ:[^\]]*\]/gi, "")
    .replace(/\[NOTE:[^\]]+\]/gi, "")
    .replace(/\[TEL:[^\]]+\]/gi, "")
    .replace(/\[PAID:[^\]]+\]/gi, "")
    .replace(/\+?375[\d\s\-]{9,}/g, "")
  )).replace(/\s*\|\|\s*/g, " · ").replace(/\s{2,}/g, " ").trim();
}

/** Разобрать блоки [NOTE:roles|once|perm|ITEM:…] */
function parseNoteBlocks_(note) {
  var raw = String(note || "");
  var out = [];
  var re = /\[NOTE:([^\|\]]+)\|(perm|once)(?:\|ITEM:([^\]]+))?\]\s*([\s\S]*?)(?=\s*\|\|\s*\[NOTE:|$)/gi;
  var m;
  while ((m = re.exec(raw))) {
    var rolesArr = String(m[1] || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
    out.push({
      roles: rolesArr,
      kind: String(m[2] || "once").toLowerCase(),
      item: String(m[3] || "").trim(),
      text: String(m[4] || "").replace(/\[TEL:[^\]]+\]/gi, "").replace(/\+?375[\d\s\-]{9,}/g, "").trim()
    });
  }
  return out;
}

function noteBlockHasRole_(block, role) {
  var roles = (block && block.roles) || [];
  for (var i = 0; i < roles.length; i++) {
    if (roles[i] === role) return true;
  }
  return false;
}

function noteItemMatchesProduct_(itemKey, productName, productSub) {
  var key = String(itemKey || "").trim();
  if (!key) return true;
  var parts = key.split("/");
  var wantName = String(parts[0] || "").trim().toUpperCase().replace(/\s+/g, " ");
  var wantSub = String(parts[1] || "").trim().toUpperCase().replace(/\s+/g, " ");
  var name = String(productName || "").trim().toUpperCase().replace(/\s+/g, " ");
  var sub = String(productSub || "").trim().toUpperCase().replace(/\s+/g, " ");
  var nameOk = false;
  try {
    var a = typeof normalizeProductAlias_ === "function" ? normalizeProductAlias_(name) : name;
    var b = typeof normalizeProductAlias_ === "function" ? normalizeProductAlias_(wantName) : wantName;
    nameOk = a === b || name.indexOf(wantName) >= 0 || wantName.indexOf(name) >= 0;
  } catch (eN) {
    nameOk = name.indexOf(wantName) >= 0 || wantName.indexOf(name) >= 0 || name === wantName;
  }
  if (!nameOk) return false;
  if (wantSub) {
    if (!sub) return false;
    if (sub.indexOf(wantSub) < 0 && wantSub.indexOf(sub) < 0 && sub !== wantSub) return false;
  }
  return true;
}

/** Текст примечания только для роли (поддержка [NOTE:roles|once|perm|ITEM]). */
function noteTextForRole_(note, role) {
  var raw = String(note || "");
  if (/\[NOTE:/i.test(raw)) {
    var bits = [];
    var blocks = parseNoteBlocks_(raw);
    for (var i = 0; i < blocks.length; i++) {
      if (!noteBlockHasRole_(blocks[i], role)) continue;
      var t = String(blocks[i].text || "").trim();
      if (!t) continue;
      if (blocks[i].item) bits.push("[" + blocks[i].item + "] " + t);
      else bits.push(t);
    }
    return bits.join(" · ");
  }
  if (!noteVisibleForRole_(raw, role)) return "";
  var t2 = cleanNoteText_(raw);
  if (role === "cut") {
    t2 = t2.replace(/\[TEL:[^\]]+\]/gi, "").replace(/\+?375[\d\s\-]{9,}/g, "").replace(/\s{2,}/g, " ").trim();
  }
  return t2;
}

function collectDayRoleNotes_(ss, dayName, role) {
  var data = getClientsData_(ss, dayName);
  var out = [];
  var clients = (data && data.clients) || [];
  for (var i = 0; i < clients.length; i++) {
    var raw = clients[i].note || "";
    if (!noteVisibleForRole_(raw, role)) continue;
    var blocks = parseNoteBlocks_(raw);
    if (blocks.length) {
      for (var b = 0; b < blocks.length; b++) {
        if (!noteBlockHasRole_(blocks[b], role)) continue;
        if (!blocks[b].text) continue;
        out.push({
          client: clients[i].name || "",
          text: blocks[b].text,
          item: blocks[b].item || ""
        });
      }
      continue;
    }
    var text = noteTextForRole_(raw, role);
    if (!text) continue;
    out.push({ client: clients[i].name || "", text: text, item: "" });
  }
  return out;
}

/** monday-row (4..59) → cutting row (3..48) */
function getProductRowToCuttingRowMap_() {
  var itemMap = getCuttingItemMap_();
  var rev = {};
  for (var cRow in itemMap) {
    if (!itemMap.hasOwnProperty(cRow)) continue;
    var rows = itemMap[cRow];
    for (var i = 0; i < rows.length; i++) rev[rows[i]] = Number(cRow);
  }
  return rev;
}

/**
 * Для каждой позиции нарезки: сколько объёма от клиентов с примечанием нарезчику.
 * Пример: всего 10 шт, у клиента 3 + «толстые» → noted=3, groups=[{text, qty, clients}].
 * Если в NOTE есть ITEM:название[/фракция] — привязка только к этой позиции.
 */
function collectCuttingRowNotes_(ss, dayName) {
  var block = getDayBlock(dayName);
  if (!block) return {};
  var sheet = getTargetSheet(ss, block);
  if (!sheet) return {};
  var nickRow = block.nick;
  var startRow = block.start;
  var endRow = block.end;
  var noteRow = block.note;
  var totalCols = sheet.getLastColumn();
  var cols = totalCols >= 3 ? Math.min(totalCols - 2, 15) : 1;
  if (sheet.getLastRow() < noteRow) return {};

  var nicks = sheet.getRange(nickRow, 3, 1, cols).getValues()[0];
  var notes = sheet.getRange(noteRow, 3, 1, cols).getValues()[0];
  var orders = sheet.getRange(startRow, 3, endRow - startRow + 1, cols).getValues();
  var itemNames = sheet.getRange(startRow, 1, endRow - startRow + 1, 1).getValues();
  var rev = getProductRowToCuttingRowMap_();
  var byRow = {};

  for (var col = 0; col < cols; col++) {
    var nick = nicks[col] != null ? String(nicks[col]).trim() : "";
    if (!nick || nick.length <= 1) continue;
    var upper = nick.toUpperCase();
    if (upper === "ИТОГО НА ДЕНЬ" || upper === "ИТОГО" || upper === "ФАКТ СНЯТОЕ") continue;
    var rawNote = notes[col] != null ? String(notes[col]).trim() : "";
    if (!noteVisibleForRole_(rawNote, "cut")) continue;

    var cutBlocks = [];
    var parsedBlocks = parseNoteBlocks_(rawNote);
    if (parsedBlocks.length) {
      for (var bi = 0; bi < parsedBlocks.length; bi++) {
        if (!noteBlockHasRole_(parsedBlocks[bi], "cut")) continue;
        if (!parsedBlocks[bi].text) continue;
        cutBlocks.push(parsedBlocks[bi]);
      }
    } else {
      var legacyText = noteTextForRole_(rawNote, "cut");
      if (legacyText) cutBlocks.push({ roles: ["cut"], kind: "once", item: "", text: legacyText });
    }
    if (!cutBlocks.length) continue;

    for (var rIdx = 0; rIdx < orders.length; rIdx++) {
      var val = Number(orders[rIdx][col]) || 0;
      if (val <= 0) continue;
      var mondayRow = 4 + rIdx;
      var cutRow = rev[mondayRow];
      if (!cutRow) continue;
      var rawName = itemNames[rIdx] && itemNames[rIdx][0] != null ? String(itemNames[rIdx][0]).trim() : "";
      if (!rawName || rawName.indexOf("#") > -1) continue;
      var parsedItem = parseSheetItemName(rawName, mondayRow);
      var matchedTexts = [];
      for (var ci = 0; ci < cutBlocks.length; ci++) {
        if (!noteItemMatchesProduct_(cutBlocks[ci].item, parsedItem.name || rawName, parsedItem.sub || "")) continue;
        matchedTexts.push(cutBlocks[ci].text);
      }
      if (!matchedTexts.length) continue;
      var key = String(cutRow);
      if (!byRow[key]) byRow[key] = [];
      byRow[key].push({ client: nick, text: matchedTexts.join(" · "), qty: val });
    }
  }

  var out = {};
  for (var cr in byRow) {
    if (!byRow.hasOwnProperty(cr)) continue;
    var list = byRow[cr];
    var groupsMap = {};
    var noted = 0;
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      noted += n.qty;
      var gk = n.text;
      if (!groupsMap[gk]) groupsMap[gk] = { text: n.text, qty: 0, clients: [] };
      groupsMap[gk].qty += n.qty;
      if (groupsMap[gk].clients.indexOf(n.client) < 0) groupsMap[gk].clients.push(n.client);
    }
    var groups = [];
    for (var g in groupsMap) {
      if (groupsMap.hasOwnProperty(g)) groups.push(groupsMap[g]);
    }
    out[cr] = { noted: noted, groups: groups };
  }
  return out;
}

function parseGeoTagsFromNote_(note) {
  var m = String(note || "").match(/\[GEO:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/i);
  if (!m) return null;
  var y = String(note || "").match(/\[YMAPS:(https:\/\/[^\]]+)\]/i);
  return {
    lat: Number(m[1]),
    lon: Number(m[2]),
    yandexUrl: y ? y[1] : ("https://yandex.ru/maps/?pt=" + m[2] + "," + m[1] + "&z=17&l=map")
  };
}

/** Книга «данных» мини-аппа: гео, память нарезки/доставок, итоги. Чистовик = active (склад, люди, неделя). */
function getDataSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty("DATA_SPREADSHEET_ID");
  if (id) {
    try { return SpreadsheetApp.openById(String(id).trim()); } catch (e) {}
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getGeoSheet_() {
  var ss = getDataSpreadsheet_();
  var sh = findSheetByBaseName_(ss, "Гео_Клиентов");
  if (!sh) {
    sh = ss.insertSheet("Гео_Клиентов");
    sh.getRange(1, 1, 1, 5).setValues([["day", "client", "lat", "lon", "yandexUrl"]]);
  }
  return sh;
}

function upsertClientGeo_(ss, dayName, clientName, lat, lon, yandexUrl) {
  var sh = getGeoSheet_();
  var day = String(dayName || "").trim().toUpperCase();
  var client = String(clientName || "").trim().toUpperCase();
  if (!day || !client) return;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim().toUpperCase() === day &&
        String(data[i][1] || "").trim().toUpperCase() === client) {
      sh.getRange(i + 1, 3, 1, 3).setValues([[Number(lat), Number(lon), yandexUrl || ""]]);
      return;
    }
  }
  sh.appendRow([dayName, clientName, Number(lat), Number(lon), yandexUrl || ""]);
}

function clearClientGeo_(ss, dayName, clientName) {
  var sh = getGeoSheet_();
  if (!sh) return;
  var day = String(dayName || "").trim().toUpperCase();
  var client = String(clientName || "").trim().toUpperCase();
  var data = sh.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0] || "").trim().toUpperCase() === day &&
        String(data[i][1] || "").trim().toUpperCase() === client) {
      sh.deleteRow(i + 1);
    }
  }
}

function getClientGeo_(ss, dayName, clientName) {
  var sh = getGeoSheet_();
  if (!sh) return null;
  var day = String(dayName || "").trim().toUpperCase();
  var client = String(clientName || "").trim().toUpperCase();
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim().toUpperCase() === day &&
        String(data[i][1] || "").trim().toUpperCase() === client) {
      var lat = Number(data[i][2]);
      var lon = Number(data[i][3]);
      if (!isFinite(lat) || !isFinite(lon)) return null;
      return {
        lat: lat,
        lon: lon,
        yandexUrl: data[i][4] ? String(data[i][4]) : ("https://yandex.ru/maps/?pt=" + lon + "," + lat + "&z=17&l=map")
      };
    }
  }
  return null;
}

/** Индекс geo дня: один read на getClients вместо N */
function buildDayGeoIndex_(dayName) {
  var out = {};
  try {
    var sh = getGeoSheet_();
    if (!sh || sh.getLastRow() < 2) return out;
    var day = String(dayName || "").trim().toUpperCase();
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || "").trim().toUpperCase() !== day) continue;
      var client = String(data[i][1] || "").trim().toUpperCase();
      if (!client) continue;
      var lat = Number(data[i][2]);
      var lon = Number(data[i][3]);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      out[client] = {
        lat: lat,
        lon: lon,
        yandexUrl: data[i][4] ? String(data[i][4]) : ("https://yandex.ru/maps/?pt=" + lon + "," + lat + "&z=17&l=map")
      };
    }
  } catch (e) {}
  return out;
}

/* ========== Дефицит нарезки + пуши ========== */

function getDeficitSheet_() {
  var ss = getDataSpreadsheet_();
  var sh = findSheetByBaseName_(ss, "Дефицит_Нарезки");
  if (!sh) {
    sh = ss.insertSheet("Дефицит_Нарезки");
    sh.getRange(1, 1, 1, 8).setValues([[
      "id", "day", "item", "row", "status", "created", "notifyFrom", "lastNotify"
    ]]);
  }
  return sh;
}

function ensureDeficitTrigger_() {
  // 30min tickCuttingDeficit_ also runs tickBpSurveyReminders_ (survey due dates).
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "tickCuttingDeficit_") return;
  }
  ScriptApp.newTrigger("tickCuttingDeficit_").timeBased().everyMinutes(30).create();
}

function nextMorningDate_(tz) {
  var now = new Date();
  var today = Utilities.formatDate(now, tz || "Europe/Minsk", "yyyy-MM-dd");
  var parts = today.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + 1, 8, 0, 0);
}

function newDeficitId_() {
  // Короткий текстовый id — Sheets не превратит в число / scientific notation
  return "d" + Utilities.getUuid().replace(/-/g, "").slice(0, 12);
}

function normalizeDeficitId_(v) {
  return String(v == null ? "" : v).replace(/^\uFEFF/, "").trim();
}

function isOpenDeficitStatus_(status) {
  var s = String(status || "").trim().toLowerCase();
  return s === "open" || s === "открыт";
}

/** Если после Deploy URL /exec сменился — кнопки в Telegram молчат. Подтягиваем webhook сами. */
function ensureTelegramWebhookUrl_() {
  var token = getTelegramToken_();
  if (!token) return;
  var url = "";
  try { url = ScriptApp.getService().getUrl(); } catch (e) { return; }
  if (!url) return;
  try {
    var infoRes = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getWebhookInfo", {
      muteHttpExceptions: true
    });
    var info = JSON.parse(infoRes.getContentText());
    var current = info && info.result ? String(info.result.url || "") : "";
    if (current === url) return;
    UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/setWebhook", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ url: url, allowed_updates: ["message", "callback_query"] }),
      muteHttpExceptions: true
    });
  } catch (e2) {}
}

function handleRegisterCuttingDeficit(ss, json, callback, fromPost) {
  var day = String(json.day || "").trim();
  var items = json.items || [];
  if (!day || !items.length) {
    var bad = { status: "error", message: "need_day_and_items" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var sh = getDeficitSheet_();
  var tz = ss.getSpreadsheetTimeZone() || "Europe/Minsk";
  var notifyFrom = nextMorningDate_(tz);
  var now = new Date();
  var immediate = json.immediate !== false; // по умолчанию сразу + утром
  try { ensureTelegramWebhookUrl_(); } catch (eWh) {}
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var id = newDeficitId_();
    var itemName = String(it.name || "");
    var itemRow = Number(it.row) || 0;
    // Не плодим дубли: если уже есть open по дню+строке/имени — обновляем, не append
    var existing = findOpenDeficitRow_(sh, day, itemRow, itemName);
    var rowVals = [id, day, itemName, itemRow, "open", now, notifyFrom, ""];
    if (existing > 0) {
      sh.getRange(existing, 1, 1, 8).setValues([rowVals]);
      sh.getRange(existing, 1).setNumberFormat("@");
    } else {
      sh.appendRow(rowVals);
      sh.getRange(sh.getLastRow(), 1).setNumberFormat("@");
    }
    if (immediate) {
      try {
        sendDeficitPushForRow_(rowVals);
        sh.getRange(existing > 0 ? existing : sh.getLastRow(), 8).setValue(now);
      } catch (ePush) {}
    }
  }
  SpreadsheetApp.flush();
  ensureDeficitTrigger_();
  var ok = { status: "success", count: items.length };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function findOpenDeficitRow_(sh, day, rowNum, itemName) {
  var data = sh.getDataRange().getValues();
  var wantDay = String(day || "").trim().toUpperCase();
  var wantName = String(itemName || "").trim().toUpperCase();
  var wantRow = Number(rowNum) || 0;
  for (var i = 1; i < data.length; i++) {
    if (!isOpenDeficitStatus_(data[i][4])) continue;
    if (String(data[i][1] || "").trim().toUpperCase() !== wantDay) continue;
    var r = Number(data[i][3]) || 0;
    var n = String(data[i][2] || "").trim().toUpperCase();
    if (wantRow >= 3 && r === wantRow) return i + 1;
    if (wantName && n === wantName) return i + 1;
  }
  return 0;
}

function parseCuttingFlags_(flagsStr) {
  var out = [];
  var parts = String(flagsStr || "").split("|");
  for (var i = 0; i < parts.length; i++) {
    var p = String(parts[i] || "").trim();
    if (!p) continue;
    var bits = p.split(",");
    var row = Number(bits[0]);
    if (!(row >= 3 && row <= 48)) continue;
    out.push({
      row: row,
      laid: bits[1] === "1" || bits[1] === "true",
      done: bits[2] === "1" || bits[2] === "true",
      outNext: bits[3] === "1" || bits[3] === "true",
      surplus: Number(bits[4]) || 0
    });
  }
  return out;
}

function parseMissingParam_(missingStr) {
  if (Object.prototype.toString.call(missingStr) === "[object Array]") return missingStr;
  var out = [];
  var parts = String(missingStr || "").split("|");
  for (var i = 0; i < parts.length; i++) {
    var p = String(parts[i] || "").trim();
    if (!p) continue;
    var tilde = p.indexOf("~");
    if (tilde < 0) {
      var rowOnly = Number(p);
      if (rowOnly >= 3) out.push({ row: rowOnly, name: "" });
      continue;
    }
    out.push({
      row: Number(p.slice(0, tilde)) || 0,
      name: p.slice(tilde + 1)
    });
  }
  return out;
}

function parseReadyRows_(ready, readyRowsStr) {
  if (ready && ready.length) return ready;
  var out = [];
  var parts = String(readyRowsStr || "").split(",");
  for (var i = 0; i < parts.length; i++) {
    var row = Number(String(parts[i] || "").trim());
    if (row >= 3 && row <= 48) out.push({ row: row });
  }
  return out;
}

function handleFinishCutting(ss, json, callback, fromPost) {
  // ticket (POST cache) — запасной путь; основной — flags в GET
  if (json.ticket) {
    try {
      var cached = CacheService.getScriptCache().get("finish_" + String(json.ticket));
      if (cached) {
        var cachedObj = JSON.parse(cached);
        for (var k in cachedObj) {
          if (json[k] === undefined || json[k] === "" || json[k] === null) json[k] = cachedObj[k];
        }
        if (!json.items && cachedObj.items) json.items = cachedObj.items;
        if (!json.ready && cachedObj.ready) json.ready = cachedObj.ready;
        if ((!json.missing || !json.missing.length) && cachedObj.missing) json.missing = cachedObj.missing;
      }
    } catch (eCache) {}
  }
  var day = String(json.day || "").trim();
  var ready = parseReadyRows_(json.ready, json.readyRows);
  var missing = parseMissingParam_(json.missing);
  var snapshot = json.items && json.items.length ? json.items : parseCuttingFlags_(json.flags);
  var elapsed = Number(json.elapsed) || 0;
  if (!day) {
    var bad = { status: "error", message: "need_day" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }

  var lock = LockService.getDocumentLock();
  try {
    lock.waitLock(30000);
  } catch (eLock) {
    var busy = { status: "error", message: "busy_retry" };
    return fromPost ? jsonpText(callback, busy) : jsonp(callback, busy);
  }

  try {
    var cutting = ss.getSheetByName("Нарезка");
    var memory = getMemoryCuttingSheet_();
    var tz = ss.getSpreadsheetTimeZone();
    var dateValue = getDayDate_(ss, day);
    if (!cutting || !dateValue) {
      var badDay = { status: "error", message: "bad_day" };
      return fromPost ? jsonpText(callback, badDay) : jsonp(callback, badDay);
    }
    var dateText = formatSheetDate(dateValue, tz);
    var oldDate = formatSheetDate(cutting.getRange("A1").getValue(), tz);
    if (oldDate !== dateText) {
      if (oldDate) saveCuttingState_(cutting, memory, oldDate, tz);
      cutting.getRange("A1").setValue(dateValue);
      restoreCuttingState_(cutting, memory, dateText, tz);
    }
    recalculateCuttingForDate_(ss, dateText);

    // Снимок галочек с клиента — главный источник правды (выложено/нарезано)
    var i;
    if (snapshot.length) {
      for (i = 0; i < snapshot.length; i++) {
        var it = snapshot[i] || {};
        var r = Number(it.row);
        if (!(r >= 3 && r <= 48)) continue;
        if (it.surplus !== undefined && it.surplus !== null && it.surplus !== "") {
          cutting.getRange("C" + r).setValue(Number(it.surplus) || 0);
        }
        if (it.laid !== undefined) cutting.getRange("E" + r).setValue(asBool_(it.laid));
        if (it.done !== undefined) cutting.getRange("F" + r).setValue(asBool_(it.done));
        if (it.outNext !== undefined) cutting.getRange("G" + r).setValue(asBool_(it.outNext));
      }
    }
    for (i = 0; i < ready.length; i++) {
      var rr = Number(ready[i].row);
      if (rr >= 3 && rr <= 48) {
        cutting.getRange("E" + rr).setValue(true);
        cutting.getRange("F" + rr).setValue(true);
      }
    }
    SpreadsheetApp.flush();
    saveCuttingState_(cutting, memory, dateText, tz);
    SpreadsheetApp.flush();

    var names = cutting.getRange("A3:A48").getValues();
    var stateEG = cutting.getRange("C3:G48").getValues();
    var totals = recalculateCuttingForDate_(ss, dateText);
    var summaryItems = [];
    for (i = 0; i < 46; i++) {
      var dry = Number(totals[i][0]) || 0;
      if (dry <= 0) continue;
      var rowNum = i + 3;
      var st = stateEG[i] || [];
      summaryItems.push({
        row: rowNum,
        name: names[i][0] == null ? "" : String(names[i][0]).trim(),
        dry: dry,
        unit: isPieceSkuName_(String(names[i][0] || "")) ? "шт" : "гр",
        done: asBool_(st[3]),
        laid: asBool_(st[2]),
        outNext: asBool_(st[4]),
        surplus: Number(st[0]) || 0
      });
    }
    saveCuttingCompletion_({
      day: day,
      dateText: dateText,
      elapsedMs: elapsed,
      finishedAt: new Date().toISOString(),
      count: summaryItems.length
    });

    if (missing.length) {
      handleRegisterCuttingDeficit(ss, { day: day, items: missing, immediate: true }, "cb", true);
    }

    PropertiesService.getScriptProperties().setProperty("CUTTING_SESSION", JSON.stringify({
      active: false, day: "", startedAt: 0
    }));

    var ok = {
      status: "success",
      ready: ready.length,
      missing: missing.length,
      savedFlags: snapshot.length,
      completion: getCuttingCompletion_(dateText),
      session: getCuttingSession_()
    };
    return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

function handlePrepareFinishCutting(json, callback, fromPost) {
  var ticket = json.ticket ? String(json.ticket).replace(/[^a-zA-Z0-9_:-]/g, "").slice(0, 64) : "";
  if (!ticket) ticket = "f" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
  try {
    var raw = JSON.stringify(json);
    if (raw.length > 95000) {
      // ужимаем: без имён в snapshot
      var lean = {
        day: json.day,
        ready: json.ready || [],
        missing: json.missing || [],
        elapsed: json.elapsed || 0,
        items: (json.items || []).map(function (it) {
          return {
            row: it.row,
            done: !!it.done,
            laid: !!it.laid,
            outNext: !!it.outNext,
            surplus: Number(it.surplus) || 0
          };
        })
      };
      raw = JSON.stringify(lean);
    }
    CacheService.getScriptCache().put("finish_" + ticket, raw, 300);
  } catch (e) {
    var err = { status: "error", message: "cache_failed" };
    return fromPost ? jsonpText(callback, err) : jsonp(callback, err);
  }
  var ok = { status: "success", ticket: ticket };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function getCuttingCompletionSheet_() {
  var ss = getDataSpreadsheet_();
  var sh = findSheetByBaseName_(ss, "Итоги_Нарезки");
  if (!sh) {
    sh = ss.insertSheet("Итоги_Нарезки");
    sh.getRange(1, 1, 1, 3).setValues([["date", "day", "json"]]);
  }
  return sh;
}

function getMemoryCuttingSheet_() {
  var ss = getDataSpreadsheet_();
  var sh = findSheetByBaseName_(ss, "Память_Нарезки");
  if (!sh) {
    sh = ss.insertSheet("Память_Нарезки");
  }
  return sh;
}

function getMemoryCourierSheet_() {
  var ss = getDataSpreadsheet_();
  var sh = findSheetByBaseName_(ss, "Память_Доставок");
  if (!sh) {
    sh = ss.insertSheet("Память_Доставок");
  }
  return sh;
}

function saveCuttingCompletion_(info) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var sh = getCuttingCompletionSheet_();
  var dateText = String(info.dateText || "");
  var payloadObj = {
    day: String(info.day || ""),
    dateText: dateText,
    elapsedMs: Number(info.elapsedMs) || 0,
    finishedAt: info.finishedAt || new Date().toISOString(),
    count: Number(info.count) || 0
  };
  var payload = JSON.stringify(payloadObj);
  try {
    PropertiesService.getScriptProperties().setProperty("CUT_DONE_" + dateText.replace(/\./g, "_"), payload);
  } catch (eProp) {}
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (formatSheetDate(data[i][0], tz) === dateText) {
      sh.getRange(i + 1, 2, 1, 2).setValues([[payloadObj.day, payload]]);
      return;
    }
  }
  sh.appendRow([dateText, payloadObj.day, payload]);
}

function getCuttingCompletion_(dateText) {
  var want = String(dateText || "");
  if (!want) return null;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = ss.getSpreadsheetTimeZone();
    var sh = getCuttingCompletionSheet_();
    if (sh && sh.getLastRow() > 1) {
      var data = sh.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (formatSheetDate(data[i][0], tz) === want) {
          try {
            var obj = JSON.parse(String(data[i][2] || ""));
            if (obj && !obj.count && obj.items && obj.items.length) obj.count = obj.items.length;
            if (obj && (obj.count || obj.elapsedMs)) return obj;
          } catch (e) {}
        }
      }
    }
  } catch (e2) {}
  try {
    var raw = PropertiesService.getScriptProperties().getProperty("CUT_DONE_" + want.replace(/\./g, "_"));
    if (raw) {
      var cached = JSON.parse(raw);
      if (cached && (cached.count || cached.elapsedMs)) return cached;
    }
  } catch (e3) {}
  return null;
}

function handleSetupTelegramWebhook(callback, fromPost) {
  var token = getTelegramToken_();
  if (!token) {
    var no = { status: "error", message: "no_token", description: "Нет TELEGRAM_BOT_TOKEN" };
    return fromPost ? jsonpText(callback, no) : jsonp(callback, no);
  }
  var url = "";
  try { url = ScriptApp.getService().getUrl(); } catch (e) {}
  if (!url) {
    var noUrl = { status: "error", message: "no_webapp_url", description: "Сначала Deploy веб-приложения" };
    return fromPost ? jsonpText(callback, noUrl) : jsonp(callback, noUrl);
  }
  var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/setWebhook", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ url: url, allowed_updates: ["message", "callback_query"] }),
    muteHttpExceptions: true
  });
  var body;
  try { body = JSON.parse(res.getContentText()); } catch (e2) { body = { ok: false, description: String(e2) }; }
  var out = { status: body.ok ? "success" : "error", webhook: url, raw: body };
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}

/** Один раз из редактора: выполнить setupTelegramWebhookManual() после Deploy */
function setupTelegramWebhookManual() {
  var r = handleSetupTelegramWebhook("cb", true);
  Logger.log(r.getContent());
}

function listBotParticipants_() {
  var ids = {};
  try {
    var sh = getCouriersSheet_();
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var id = data[i][0];
      if (id !== "" && id != null) ids[String(id)] = true;
    }
  } catch (e0) {}
  try {
    var chat = PropertiesService.getScriptProperties().getProperty("TELEGRAM_CHAT_ID");
    if (chat) ids[String(chat)] = true;
  } catch (e1) {}
  return Object.keys(ids);
}

function telegramSendMarkup_(chatId, text, replyMarkup) {
  var token = getTelegramToken_();
  if (!token || !chatId) return { ok: false, error: "no_token_or_chat" };
  var payload = {
    chat_id: String(chatId),
    text: String(text || "").slice(0, 3500),
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  try { return JSON.parse(res.getContentText()); } catch (e) { return { ok: false, error: String(e) }; }
}

function telegramAnswerCallback_(callbackId, text) {
  var token = getTelegramToken_();
  if (!token || !callbackId) return;
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/answerCallbackQuery", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      callback_query_id: callbackId,
      text: String(text || "Ок").slice(0, 180),
      show_alert: false
    }),
    muteHttpExceptions: true
  });
}

function telegramEditDeficitDone_(cq, day, item) {
  if (!cq || !cq.message || !cq.message.chat) return;
  var token = getTelegramToken_();
  if (!token) return;
  var chatId = cq.message.chat.id;
  var messageId = cq.message.message_id;
  var doneText = "✅ Куплено и заготовлено\n" + day + " · " + item;
  try {
    var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/editMessageText", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: doneText,
        reply_markup: { inline_keyboard: [] }
      }),
      muteHttpExceptions: true
    });
    var body = {};
    try { body = JSON.parse(res.getContentText()); } catch (eP) {}
    if (body && body.ok) return;
  } catch (eEdit) {}
  // fallback: хотя бы снять кнопку
  try {
    UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/editMessageReplyMarkup", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] }
      }),
      muteHttpExceptions: true
    });
  } catch (eMk) {}
}

function parseDeficitDate_(v) {
  if (v == null || v === "") return null;
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) return v;
  var d = new Date(v);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function sendDeficitPushForRow_(rowValues) {
  var id = normalizeDeficitId_(rowValues[0]);
  if (!id) return;
  var day = String(rowValues[1] || "");
  var item = String(rowValues[2] || "");
  var text = "⚠️ Дефицит нарезки\nДень: " + day + "\nПозиция: " + item +
    "\n\nНужно купить и заготовить. Когда готово — нажми кнопку ниже.";
  var markup = {
    inline_keyboard: [[{ text: "✅ Куплено и заготовлено", callback_data: "defdone:" + id }]]
  };
  var participants = listBotParticipants_();
  for (var i = 0; i < participants.length; i++) {
    telegramSendMarkup_(participants[i], text, markup);
  }
}

function notifyOutNextStock_(info) {
  var day = String((info && info.day) || "");
  var item = String((info && info.name) || "");
  var text = "❗ Заканчивается запас\nДень: " + day + "\nПозиция: " + item +
    "\n\nНа текущую нарезку хватает, на следующую — уже нет. Закупите заранее.";
  var participants = listBotParticipants_();
  for (var i = 0; i < participants.length; i++) {
    telegramSendMarkup_(participants[i], text, null);
  }
}

function tickCuttingDeficit_() {
  try { ensureTelegramWebhookUrl_(); } catch (eWh) {}
  try { ensureDeliveryDatesNudgeTriggers_(); } catch (eNudgeTr) {}
  try { tickDeliveryDatesNudge_(); } catch (eNudge) {}
  try { tickBpSurveyReminders_(); } catch (eSurvey) {}
  var sh = getDeficitSheet_();
  var data = sh.getDataRange().getValues();
  var now = new Date();
  for (var i = 1; i < data.length; i++) {
    if (!isOpenDeficitStatus_(data[i][4])) continue;
    var notifyFrom = parseDeficitDate_(data[i][6]);
    if (notifyFrom && now.getTime() < notifyFrom.getTime()) continue;
    var last = parseDeficitDate_(data[i][7]);
    if (last && (now.getTime() - last.getTime()) < 29 * 60 * 1000) continue;
    // Старые строки без текстового id — перевыпустить короткий id, иначе кнопка может не матчиться
    var repaired = false;
    var id = normalizeDeficitId_(data[i][0]);
    if (!id || !/^d[a-f0-9]{8,}$/i.test(id)) {
      id = newDeficitId_();
      sh.getRange(i + 1, 1).setNumberFormat("@").setValue(id);
      data[i][0] = id;
      repaired = true;
    }
    if (repaired) { sh.getRange(i + 1, 8).setValue(now); continue; } // не спамить в тот же тик
    if (!isOpenDeficitStatus_(data[i][4])) continue;
    sendDeficitPushForRow_(data[i]);
    sh.getRange(i + 1, 8).setValue(now);
  }
  SpreadsheetApp.flush();
}

/** Все активные сотрудники из «Доступы» (+ OWNER_TELEGRAM_IDS). */
function collectAllActiveStaffTelegramIds_() {
  var ids = {};
  try {
    var owners = getOwnerTelegramIds_();
    for (var i = 0; i < owners.length; i++) {
      if (owners[i]) ids[String(owners[i]).trim()] = true;
    }
  } catch (eO) {}
  try {
    var rows = readAccessRows_();
    var okRoles = {
      owner: true, manager: true, cutter: true, courier: true, logistics: true, all: true
    };
    for (var r = 0; r < rows.length; r++) {
      var role = String(rows[r].role || "").toLowerCase();
      var st = String(rows[r].status || "").toLowerCase();
      if (st === "denied" || st === "pending" || role === "pending" || role === "denied") continue;
      if (!(st === "active" || !st || role === "owner")) continue;
      if (!okRoles[role]) continue;
      var id = String(rows[r].telegramId || "").trim();
      if (id) ids[id] = true;
    }
  } catch (eR) {}
  return Object.keys(ids);
}

/**
 * Напоминание «подбить даты» — 11:00 и 19:00 Europe/Minsk.
 * Список = вчера доставленные (галочка) ПП + БП1; у ПП кнопка «В АФК».
 */
function tickDeliveryDatesNudge_() {
  var tz = "Europe/Minsk";
  var now = new Date();
  var hour = Number(Utilities.formatDate(now, tz, "H"));
  var ymd = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  var slot = "";
  if (hour === 11) slot = "11";
  else if (hour === 19) slot = "19";
  else return { skipped: true, reason: "not_slot", hour: hour };

  var props = PropertiesService.getScriptProperties();
  var key = "DATE_NUDGE_" + ymd + "_" + slot;
  try {
    if (props.getProperty(key) === "1") {
      return { skipped: true, reason: "already", slot: slot, ymd: ymd };
    }
  } catch (eK) {}

  var sent = sendDeliveryDatesNudge_(slot);
  try { props.setProperty(key, "1"); } catch (eS) {}
  try { pruneOldDeliveryDatesNudgeKeys_(props, ymd); } catch (eP) {}
  return { ok: true, slot: slot, ymd: ymd, sent: sent };
}

function pruneOldDeliveryDatesNudgeKeys_(props, keepYmd) {
  if (!props) return;
  var all = props.getProperties() || {};
  var keys = Object.keys(all);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.indexOf("DATE_NUDGE_") !== 0) continue;
    if (keepYmd && k.indexOf("DATE_NUDGE_" + keepYmd) === 0) continue;
    try { props.deleteProperty(k); } catch (eD) {}
  }
}

function miniAppPublicUrl_() {
  try {
    var u = PropertiesService.getScriptProperties().getProperty("MINI_APP_URL");
    if (u && String(u).trim()) return String(u).trim().replace(/\/$/, "");
  } catch (e) {}
  return "https://konchaarsenia-a11y.github.io/superboyna/app.html";
}

/** Вчерашние доставленные: только ПП (любые) и БП1. */
function listYesterdayDeliveredForNudge_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var tz = "Europe/Minsk";
  var now = new Date();
  var yday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  var dateText = formatSheetDate(yday, tz);
  var dateIso = Utilities.formatDate(yday, tz, "yyyy-MM-dd");
  var memory = getMemoryCourierSheet_();
  var mem = memory ? getMemoryJson_(memory, dateText, tz) : null;
  var deliveredNames = [];
  var seen = {};

  function addName_(n) {
    n = String(n || "").trim();
    if (!n) return;
    if (/^(PP_CYCLE:|WEEK_PAID:|PP_SLOT_ANCHOR)/i.test(n)) return;
    var k = clientMatchKey_(n) || n.toUpperCase();
    if (seen[k]) return;
    seen[k] = true;
    deliveredNames.push(n);
  }

  if (mem && typeof mem === "object" && Object.prototype.toString.call(mem) !== "[object Array]") {
    for (var mk in mem) {
      if (!Object.prototype.hasOwnProperty.call(mem, mk)) continue;
      if (/^(PP_CYCLE:|WEEK_PAID:|PP_SLOT_ANCHOR)/i.test(mk)) continue;
      if (!normalizeMemDelivered_(mem[mk])) continue;
      var ent = mem[mk];
      var label = (ent && typeof ent === "object" && ent.client) ? ent.client : mk;
      // ключ часто matchKey — подтянуть ник из календаря
      addName_(label);
    }
  }

  // лист «Доставки», если A1 = вчера
  try {
    var courier = ss.getSheetByName("Доставки");
    if (courier && formatSheetDate(courier.getRange("A1").getValue(), tz) === dateText) {
      var nicks = courier.getRange(3, 3, 1, 16).getValues()[0] || [];
      var flags = courier.getRange(2, 3, 1, 16).getValues()[0] || [];
      for (var i = 0; i < nicks.length; i++) {
        if (flags[i] === true) addName_(nicks[i]);
      }
    }
  } catch (eCour) {}

  // обогатить имена из Календарь_Дат на вчера (matchKey → display)
  try {
    var cal = readCalendarForDate_(ss, yday) || [];
    var byKey = {};
    for (var c = 0; c < cal.length; c++) {
      var ck = cal[c].matchKey || clientMatchKey_(cal[c].client) || "";
      if (ck) byKey[ck] = cal[c];
    }
    var resolved = [];
    var seen2 = {};
    for (var d = 0; d < deliveredNames.length; d++) {
      var raw = deliveredNames[d];
      var rk = clientMatchKey_(raw) || String(raw).toUpperCase();
      var hit = byKey[rk];
      var display = hit ? (displayClientNick_(hit.client) || hit.client) : raw;
      var k2 = clientMatchKey_(display) || display.toUpperCase();
      if (seen2[k2]) continue;
      seen2[k2] = true;
      resolved.push({
        name: display,
        matchKey: k2,
        segment: hit ? String(hit.segment || "").trim() : "",
        basket: hit && hit.basket ? hit.basket : [],
        address: hit ? (hit.address || "") : "",
        ppSlot: hit ? (hit.ppSlot || "") : ""
      });
    }
    deliveredNames = resolved;
  } catch (eCal) {
    deliveredNames = deliveredNames.map(function (n) {
      return { name: n, matchKey: clientMatchKey_(n) || String(n).toUpperCase(), segment: "", basket: [], address: "", ppSlot: "" };
    });
  }

  var pp = [];
  var bp1 = [];
  for (var r = 0; r < deliveredNames.length; r++) {
    var row = deliveredNames[r];
    var meta = classifyDeliveredClientForNudge_(ss, row);
    if (meta.kind === "pp") pp.push(meta);
    else if (meta.kind === "bp1") bp1.push(meta);
  }
  return {
    dateText: dateText,
    dateIso: dateIso,
    pp: pp,
    bp1: bp1,
    total: pp.length + bp1.length
  };
}

function classifyDeliveredClientForNudge_(ss, row) {
  var name = String(row.name || "").trim();
  var seg = String(row.segment || "").trim().toUpperCase();
  var stage = "";
  var kind = "";

  // CRM: есть в ПП / АФК / БП
  try {
    var crmSs = getCrmSpreadsheet_();
    var foundPp = findSubscriberBasket_(crmSs, name, "ПП");
    if (foundPp && String(foundPp.sheet || "") === "ПП") {
      kind = "pp";
      seg = "ПП";
    } else {
      var foundAfk = findSubscriberBasket_(crmSs, name, "АФК");
      if (foundAfk && String(foundAfk.sheet || "") === "АФК") {
        kind = "";
        seg = "АФК";
      } else {
        var bpSh = findSheetByBaseName_(crmSs, "БП");
        if (bpSh) {
          var idx = findSubscriptionRowIndex_(bpSh, name, "");
          if (idx >= 0) {
            seg = "БП";
            stage = normalizeBpStage_(String(bpSh.getRange(idx + 1, 4).getValue() || "БП1"));
            if (stage === "БП1") kind = "bp1";
          }
        }
      }
    }
  } catch (eCrm) {}

  if (!kind) {
    if (seg === "ПП" || seg === "PP") kind = "pp";
    else if (seg === "БП" || seg === "BP") {
      if (!stage) stage = "БП1";
      if (normalizeBpStage_(stage) === "БП1") kind = "bp1";
    }
  }

  return {
    kind: kind,
    name: name,
    matchKey: row.matchKey || clientMatchKey_(name) || "",
    segment: seg || (kind === "pp" ? "ПП" : (kind === "bp1" ? "БП" : "")),
    stage: stage,
    basket: row.basket || [],
    address: row.address || "",
    ppSlot: row.ppSlot || ""
  };
}

function sendDeliveryDatesNudge_(slot) {
  var when = String(slot || "") === "19" ? "19:00" : "11:00";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pack = listYesterdayDeliveredForNudge_(ss);
  var lines = [];
  lines.push("📅 Подбейте даты доставок");
  lines.push("Вчера (" + pack.dateText + ") с галочкой «доставлен» — ПП и БП1:");
  lines.push("");
  if (!pack.total) {
    lines.push("Нет таких клиентов за вчера.");
  } else {
    if (pack.pp.length) {
      lines.push("ПП (" + pack.pp.length + "):");
      for (var i = 0; i < pack.pp.length; i++) {
        lines.push("· " + pack.pp[i].name + (pack.pp[i].ppSlot ? (" · " + pack.pp[i].ppSlot) : ""));
      }
      lines.push("");
    }
    if (pack.bp1.length) {
      lines.push("БП1 (" + pack.bp1.length + "):");
      for (var j = 0; j < pack.bp1.length; j++) {
        lines.push("· " + pack.bp1[j].name);
      }
      lines.push("");
    }
  }
  lines.push("Сверьте следующие даты в Просмотр.");
  lines.push("У ПП — кнопка «В АФК», если клиент хочет перерыв.");
  lines.push("⏰ " + when + " · Минск");
  var text = lines.join("\n");

  // кнопки АФК — по одному ряду на клиента (лимит TG ~100)
  var keyboard = [];
  var maxBtn = Math.min(pack.pp.length, 24);
  for (var b = 0; b < maxBtn; b++) {
    var tok = storePpAfkToken_(pack.pp[b]);
    if (!tok) continue;
    keyboard.push([{
      text: "⏸ В АФК · " + String(pack.pp[b].name || "").slice(0, 28),
      callback_data: ("ppafk:" + tok).slice(0, 64)
    }]);
  }
  var markup = keyboard.length ? { inline_keyboard: keyboard } : null;

  var ids = collectStaffTelegramIds_(["owner", "manager", "all"]);
  // владельцы всегда
  try {
    var owners = getOwnerTelegramIds_();
    for (var o = 0; o < owners.length; o++) {
      if (owners[o] && ids.indexOf(String(owners[o])) < 0) ids.push(String(owners[o]));
    }
  } catch (eO) {}

  var ok = 0;
  var fail = 0;
  for (var n = 0; n < ids.length; n++) {
    try {
      var res = markup
        ? telegramSendMarkup_(ids[n], text, markup)
        : telegramSendText_(ids[n], text);
      if (res && res.ok) ok++;
      else fail++;
    } catch (e) { fail++; }
  }
  try {
    var chat = PropertiesService.getScriptProperties().getProperty("TELEGRAM_CHAT_ID");
    if (chat && String(chat).trim()) {
      try {
        if (markup) telegramSendMarkup_(String(chat).trim(), text, markup);
        else telegramSendText_(String(chat).trim(), text);
      } catch (eC) {}
    }
  } catch (eChat) {}
  return {
    recipients: ids.length,
    ok: ok,
    fail: fail,
    pp: pack.pp.length,
    bp1: pack.bp1.length,
    dateText: pack.dateText
  };
}

function storePpAfkToken_(clientRow) {
  try {
    var tok = Utilities.getUuid().replace(/-/g, "").slice(0, 10);
    CacheService.getScriptCache().put(
      "ppafk_" + tok,
      JSON.stringify({
        client: clientRow.name,
        matchKey: clientRow.matchKey || "",
        at: Date.now()
      }),
      172800
    );
    return tok;
  } catch (e) {
    return "";
  }
}

function handlePpAfkCallback_(cq) {
  var data = String((cq && cq.data) || "");
  var m = data.match(/^ppafk:(.+)$/i);
  var callbackId = cq && cq.id;
  if (!m) {
    if (callbackId) telegramAnswerCallback_(callbackId, "Неверная кнопка");
    return;
  }
  var tok = String(m[1] || "").trim();
  var raw = "";
  try { raw = CacheService.getScriptCache().get("ppafk_" + tok) || ""; } catch (eC) {}
  if (!raw) {
    if (callbackId) telegramAnswerCallback_(callbackId, "Кнопка устарела — открой мини-апп");
    return;
  }
  var info = {};
  try { info = JSON.parse(raw); } catch (eJ) { info = {}; }
  var nick = String(info.client || "").trim();
  if (!nick) {
    if (callbackId) telegramAnswerCallback_(callbackId, "Нет клиента");
    return;
  }
  var moved = null;
  try {
    moved = moveSubscriptionSheetsOnly_(nick, "ПП", "АФК");
  } catch (eM) {
    if (callbackId) telegramAnswerCallback_(callbackId, "Ошибка: " + String(eM).slice(0, 80));
    return;
  }
  if (!moved || moved.status !== "success") {
    var msg = (moved && moved.message) || "не удалось";
    if (callbackId) telegramAnswerCallback_(callbackId, "Не вышло: " + msg);
    return;
  }
  if (callbackId) telegramAnswerCallback_(callbackId, "В АФК: " + nick);
  try {
    if (cq.message && cq.message.chat) {
      var token = getTelegramToken_();
      if (token) {
        UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/editMessageReplyMarkup", {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify({
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            reply_markup: { inline_keyboard: [] }
          }),
          muteHttpExceptions: true
        });
      }
    }
  } catch (eEdit) {}
  try {
    telegramSendText_(
      cq.message.chat.id,
      "✅ " + nick + " → лист АФК (пауза).\nСледующие даты в календаре сверь вручную."
    );
  } catch (eTx) {}
}

/** Перенос строки подписки между CRM-листами без HTTP-обёртки. */
function moveSubscriptionSheetsOnly_(nick, fromSheet, toSheet) {
  var crmSs = getCrmSpreadsheet_();
  var fromSh = findSheetByBaseName_(crmSs, fromSheet);
  var toSh = findSheetByBaseName_(crmSs, toSheet);
  if (!fromSh || !toSh) return { status: "error", message: "sheet_missing" };
  var rowIdx = findSubscriptionRowIndex_(fromSh, nick, "");
  if (rowIdx < 0) {
    // уже в АФК?
    var already = findSubscriptionRowIndex_(toSh, nick, "");
    if (already >= 0) return { status: "success", message: "already_on_target", nick: nick };
    return { status: "error", message: "not_found" };
  }
  var colsFrom = Math.max(fromSh.getLastColumn(), 1);
  var vals = fromSh.getRange(rowIdx + 1, 1, 1, colsFrom).getValues()[0];
  var movedLabel = String(vals[0] || nick || "").trim();
  vals[1] = nextSubscriptionIdForSheet_(toSh);
  var insertRow = findEmptySubscriptionRow_(toSh);
  writeSubscriptionRowValues_(toSh, insertRow, vals);
  fromSh.deleteRow(rowIdx + 1);
  try {
    clearCrmSheetCache_(fromSheet);
    clearCrmSheetCache_(toSheet);
    clearCrmSheetCache_();
  } catch (eC) {}
  return {
    status: "success",
    nick: extractInstagramNick_(movedLabel) || displayClientNick_(movedLabel) || nick,
    fromSheet: fromSheet,
    toSheet: toSheet,
    row: insertRow
  };
}

/** Триггеры: ежедневно около 11:00 и 19:00 (слот проверяем по Минску). */
function ensureDeliveryDatesNudgeTriggers_() {
  var props = PropertiesService.getScriptProperties();
  var ver = "";
  try { ver = String(props.getProperty("DATE_NUDGE_TRIG_V") || ""); } catch (eV) {}
  var triggers = ScriptApp.getProjectTriggers();
  var ours = [];
  var i;
  for (i = 0; i < triggers.length; i++) {
    var fn = "";
    try { fn = triggers[i].getHandlerFunction(); } catch (eFn) { continue; }
    if (fn === "tickDeliveryDatesNudge_" ||
        fn === "tickDeliveryDatesNudgeMorning_" ||
        fn === "tickDeliveryDatesNudgeEvening_") {
      ours.push(triggers[i]);
    }
  }
  // v3: отдельные handler-функции (стабильнее в редакторе / квотах)
  if (ours.length === 2 && ver === "11-19-v3") {
    return { ok: true, already: true, ver: ver, count: ours.length };
  }
  for (i = 0; i < ours.length; i++) {
    try { ScriptApp.deleteTrigger(ours[i]); } catch (eDel) {}
  }
  // nearMinute(0) — ближе к :00; TZ проекта должна быть Europe/Minsk (Файл → Настройки проекта)
  try {
    ScriptApp.newTrigger("tickDeliveryDatesNudgeMorning_")
      .timeBased()
      .atHour(11)
      .nearMinute(0)
      .everyDays(1)
      .create();
  } catch (eM) {
    return { ok: false, created: false, step: "morning", error: String(eM) };
  }
  try {
    ScriptApp.newTrigger("tickDeliveryDatesNudgeEvening_")
      .timeBased()
      .atHour(19)
      .nearMinute(0)
      .everyDays(1)
      .create();
  } catch (eE) {
    return { ok: false, created: false, step: "evening", error: String(eE) };
  }
  try { props.setProperty("DATE_NUDGE_TRIG_V", "11-19-v3"); } catch (eS) {}
  return { ok: true, created: true, ver: "11-19-v3", triggers: ["11:00", "19:00"] };
}

/** Обёртки для триггеров (не вызывать вручную — только clock). */
function tickDeliveryDatesNudgeMorning_() {
  return tickDeliveryDatesNudge_();
}
function tickDeliveryDatesNudgeEvening_() {
  return tickDeliveryDatesNudge_();
}

function handleSetupDeliveryDatesNudgeTriggers(callback, fromPost) {
  var r;
  try {
    r = ensureDeliveryDatesNudgeTriggers_();
  } catch (e) {
    var err = { status: "error", message: String(e), detail: (e && e.stack) ? String(e.stack).slice(0, 400) : "" };
    return fromPost ? jsonpText(callback, err) : jsonp(callback, err);
  }
  var ok = {
    status: "success",
    trigger: "tickDeliveryDatesNudge_@11+19 Europe/Minsk",
    result: r
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/**
 * Запуск из редактора (Run).
 * Не через ContentService/jsonpText — в IDE это часто даёт «Неизвестная ошибка».
 * Не return, не Browser.msgBox. Смотреть: Выполнения → Журнал.
 */
function setupDeliveryDatesNudgeTriggersManual() {
  try {
    var r = ensureDeliveryDatesNudgeTriggers_();
    Logger.log("setupDeliveryDatesNudgeTriggersManual OK " + JSON.stringify(r));
  } catch (e) {
    Logger.log("setupDeliveryDatesNudgeTriggersManual ERR " + String(e));
    try { Logger.log(String(e && e.stack || "")); } catch (e2) {}
  }
}

/** Диагностика IDE: если и это красное — проблема не в nudge, а в проекте/вставке. */
function pingEditorOk() {
  Logger.log("pingEditorOk " + new Date().toISOString());
}

/**
 * Тест пуша из редактора. Смотреть Журнал выполнения.
 */
function testDeliveryDatesNudgeNow() {
  try {
    try {
      var props = PropertiesService.getScriptProperties();
      var ymd = Utilities.formatDate(new Date(), "Europe/Minsk", "yyyy-MM-dd");
      props.deleteProperty("DATE_NUDGE_" + ymd + "_11");
      props.deleteProperty("DATE_NUDGE_" + ymd + "_19");
      props.deleteProperty("DATE_NUDGE_" + ymd + "_test");
    } catch (eClr) {}
    var sent = sendDeliveryDatesNudge_("11");
    Logger.log("testDeliveryDatesNudgeNow OK " + JSON.stringify(sent));
  } catch (e) {
    Logger.log("testDeliveryDatesNudgeNow ERR " + String(e));
    try { Logger.log(String(e && e.stack || "")); } catch (e2) {}
  }
}

/** HTTP: тот же тест пуша (для агента / отладки). */
function handleTestDeliveryDatesNudge(callback, fromPost) {
  var out;
  try {
    var props = PropertiesService.getScriptProperties();
    var ymd = Utilities.formatDate(new Date(), "Europe/Minsk", "yyyy-MM-dd");
    try {
      props.deleteProperty("DATE_NUDGE_" + ymd + "_11");
      props.deleteProperty("DATE_NUDGE_" + ymd + "_19");
    } catch (eClr) {}
    var sent = sendDeliveryDatesNudge_("11");
    out = { status: "success", result: sent, ymd: ymd };
  } catch (e) {
    out = { status: "error", message: String(e) };
  }
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}

function closeDeficitRowsById_(sh, id) {
  var rows = sh.getDataRange().getValues();
  var want = String(normalizeDeficitId_(id) || "").trim().toLowerCase();
  var closed = [];
  function rowIdNorm_(v) {
    return String(normalizeDeficitId_(v) || "").trim().toLowerCase();
  }
  for (var i = 1; i < rows.length; i++) {
    if (rowIdNorm_(rows[i][0]) !== want) continue;
    if (!isOpenDeficitStatus_(rows[i][4]) && String(rows[i][4] || "").trim().toLowerCase() === "closed") {
      closed.push({
        rowIndex: i + 1,
        day: String(rows[i][1] || ""),
        item: String(rows[i][2] || ""),
        rowNum: Number(rows[i][3]) || 0,
        already: true
      });
      continue;
    }
    sh.getRange(i + 1, 5).setValue("closed");
    sh.getRange(i + 1, 8).setValue(new Date());
    closed.push({
      rowIndex: i + 1,
      day: String(rows[i][1] || ""),
      item: String(rows[i][2] || ""),
      rowNum: Number(rows[i][3]) || 0,
      already: false
    });
  }
  return closed;
}

/** Закрыть все open с тем же днём+позицией (дубли от повторных finishCutting). */
function closeSiblingOpenDeficits_(sh, day, item, rowNum) {
  var rows = sh.getDataRange().getValues();
  var wantDay = String(day || "").trim().toUpperCase();
  var wantItem = String(item || "").trim().toUpperCase();
  var wantRow = Number(rowNum) || 0;
  for (var i = 1; i < rows.length; i++) {
    if (!isOpenDeficitStatus_(rows[i][4])) continue;
    if (String(rows[i][1] || "").trim().toUpperCase() !== wantDay) continue;
    var r = Number(rows[i][3]) || 0;
    var n = String(rows[i][2] || "").trim().toUpperCase();
    var same = (wantRow >= 3 && r === wantRow) || (wantItem && n === wantItem);
    if (!same) continue;
    sh.getRange(i + 1, 5).setValue("closed");
    sh.getRange(i + 1, 8).setValue(new Date());
  }
}

function markCuttingDoneLight_(day, rowNum) {
  if (!(rowNum >= 3 && rowNum <= 48)) return;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var cutting = ss.getSheetByName("Нарезка");
    if (!cutting) return;
    var dateValue = getDayDate_(ss, day);
    if (!dateValue) return;
    var tz = ss.getSpreadsheetTimeZone();
    var dateText = formatSheetDate(dateValue, tz);
    var cur = formatSheetDate(cutting.getRange("A1").getValue(), tz);
    // Только если на листе уже нужный день — не делаем тяжёлый restore под колбэк
    if (cur === dateText) {
      cutting.getRange("E" + rowNum).setValue(true);
      cutting.getRange("F" + rowNum).setValue(true);
      try {
        var memory = getMemoryCuttingSheet_();
        saveCuttingState_(cutting, memory, dateText, tz);
      } catch (eMem) {}
    }
  } catch (eLight) {}
}

function handleDeficitCallback_(cq) {
  var data = String((cq && cq.data) || "");
  var m = data.match(/^defdone:(.+)$/);
  if (!m) {
    telegramAnswerCallback_(cq && cq.id, "Неизвестная кнопка");
    return;
  }
  var id = normalizeDeficitId_(m[1]);
  var answerText = "Ок";
  var sh = getDeficitSheet_();
  var closed = closeDeficitRowsById_(sh, id);
  var hit = closed.length ? closed[0] : null;

  if (!hit) {
    // forceCloseFromMessage: закрыть sibling по тексту сообщения + всегда answer
    var fallbackDay = "";
    var fallbackItem = "";
    try {
      var msgText = String((cq.message && cq.message.text) || "");
      var dayM = msgText.match(/День:\s*(.+)/i);
      var itemM = msgText.match(/Позиция:\s*(.+)/i);
      if (dayM) fallbackDay = String(dayM[1] || "").trim().split("\n")[0].trim();
      if (itemM) fallbackItem = String(itemM[1] || "").trim().split("\n")[0].trim();
    } catch (eFb) {}
    if (fallbackDay || fallbackItem) {
      try { closeSiblingOpenDeficits_(sh, fallbackDay || "", fallbackItem || "", 0); } catch (eSib) {}
      SpreadsheetApp.flush();
      telegramEditDeficitDone_(cq, fallbackDay || "—", fallbackItem || "закрыто");
      answerText = fallbackItem ? ("Закрыто: " + fallbackItem) : "Закрыто по сообщению";
    } else {
      telegramEditDeficitDone_(cq, "—", "Нет дефицита или уже закрыт");
      answerText = "Нет дефицита или уже закрыт";
    }
    telegramAnswerCallback_(cq.id, answerText);
    return;
  }


  // Сначала закрываем статус и снимаем кнопку — без тяжёлого updateCutting (он мог вешать колбэк)
  closeSiblingOpenDeficits_(sh, hit.day, hit.item, hit.rowNum);
  SpreadsheetApp.flush();
  telegramEditDeficitDone_(cq, hit.day, hit.item);
  telegramAnswerCallback_(cq.id, "Куплено и заготовлено: " + hit.item);
  markCuttingDoneLight_(hit.day, hit.rowNum);
  try {
    if (cq.from) {
      upsertCourier_(cq.from.id, [cq.from.first_name, cq.from.last_name].filter(Boolean).join(" "), cq.from.username || "");
    }
  } catch (e2) {}
}

/** Пометить опросник отправленным — дальше напоминания не шлём. */
function markSurveySentById_(surveyId) {
  surveyId = String(surveyId || "").trim();
  if (!surveyId) return null;
  var crmSs = getCrmSpreadsheet_();
  var sh = ensureSurveySheet_(crmSs);
  if (!sh || sh.getLastRow() < 2) return null;
  var data = sh.getDataRange().getValues();
  var tz = Session.getScriptTimeZone() || "Europe/Minsk";
  var now = new Date();
  var sentAt = Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm");
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0] || "").trim() !== surveyId) continue;
    var obj = surveyRowToObj_(data[r], r + 1);
    writeSurveyRowCells_(sh, r + 1, [
      obj.id,
      obj.nick,
      obj.stage,
      obj.kind,
      obj.dueDate,
      sentAt,
      "sent",
      obj.templateId,
      obj.answer,
      obj.note,
      obj.linkedSubId,
      now
    ]);
    obj.status = "sent";
    obj.sentAt = sentAt;
    try { clearBpSurveyMetaAfterClose_(crmSs, obj.nick, obj.kind); } catch (eMeta) {}
    try { cancelOpenSurveyDuplicatesExceptId_(sh, obj.nick, obj.kind, obj.id); } catch (eDup0) {}
    try { clearCrmSheetCache_("Опросник"); } catch (eC) {}
    return obj;
  }
  return null;
}

function telegramEditSurveySent_(cq, nick) {
  if (!cq || !cq.message || !cq.message.chat) return;
  var token = getTelegramToken_();
  if (!token) return;
  var chatId = cq.message.chat.id;
  var messageId = cq.message.message_id;
  var prev = String((cq.message && cq.message.text) || "");
  var doneText = "✅ Отправлено" + (nick ? (" · " + nick) : "") + "\nНапоминания выключены.\n\n" + prev;
  doneText = doneText.slice(0, 3500);
  try {
    UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/editMessageText", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: doneText,
        reply_markup: { inline_keyboard: [] }
      }),
      muteHttpExceptions: true
    });
  } catch (eEdit) {
    try {
      UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/editMessageReplyMarkup", {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] }
        }),
        muteHttpExceptions: true
      });
    } catch (eMk) {}
  }
}

function handleSurveySentCallback_(cq) {
  var data = String((cq && cq.data) || "");
  var m = data.match(/^svsent:(.+)$/i);
  if (!m) {
    telegramAnswerCallback_(cq && cq.id, "Неизвестная кнопка");
    return;
  }
  var id = String(m[1] || "").trim();
  var hit = null;
  try { hit = markSurveySentById_(id); } catch (eM) { hit = null; }
  if (!hit) {
    // уже закрыт / нет строки — не маскируем под успех
    telegramAnswerCallback_(cq && cq.id, "Уже отмечено или не найдено");
    try {
      if (cq && cq.message && cq.message.reply_markup) {
        telegramEditSurveySent_(cq, "");
      }
    } catch (e0) {}
    return;
  }
  telegramEditSurveySent_(cq, hit.nick || "");
  telegramAnswerCallback_(cq.id, "Отправлено — напоминания выкл.");
  try {
    if (cq.from) {
      upsertCourier_(cq.from.id, [cq.from.first_name, cq.from.last_name].filter(Boolean).join(" "), cq.from.username || "");
    }
  } catch (e2) {}
}



/* ========== Брони заказов (дата) + материализация D-1 ========== */

var BOOKINGS_HEADERS_ = [
  "id", "date", "client", "subId", "address", "note", "basketJson",
  "source", "status", "dayName", "updatedAt", "pulledAt",
  "segment", "phone", "orderPrice", "ppSlot",
  "deliveryAfter", "deliveryBefore", "ppPartner",
  "couponsQty", "couponPrice"
];

function getBookingsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Брони_Заказов");
  if (!sh) {
    sh = ss.insertSheet("Брони_Заказов");
    sh.getRange(1, 1, 1, BOOKINGS_HEADERS_.length).setValues([BOOKINGS_HEADERS_]);
    sh.setFrozenRows(1);
  } else {
    ensureSheetHeadersAppend_(sh, BOOKINGS_HEADERS_);
  }
  return sh;
}

/* ========== Календарь_Дат — плоский список для мини-аппа (Просмотр / запись) ========== */

var CALENDAR_HEADERS_ = [
  "date", "dateIso", "client", "matchKey", "segment",
  "address", "phone", "note", "basketJson", "subId",
  "source", "status", "dayName", "updatedAt", "pulledAt", "legacyRef",
  "orderPrice", "ppSlot",
  "deliveryAfter", "deliveryBefore", "ppPartner",
  "couponsQty", "couponPrice"
];

function getCalendarSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getOrCreateSheet_(ss, "Календарь_Дат", CALENDAR_HEADERS_);
  ensureSheetHeadersAppend_(sh, CALENDAR_HEADERS_);
  return sh;
}

/** Нормализация времени окна: "9:30" / "09:30" → "09:30", иначе "". */
function normalizeTimeHm_(v) {
  var s = String(v == null ? "" : v).trim();
  if (!s) return "";
  var m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  var h = Number(m[1]);
  var mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return "";
  return (h < 10 ? "0" : "") + h + ":" + (mi < 10 ? "0" : "") + mi;
}

function readAllCalendarRows_() {
  if (_memoCalendarRows_) return _memoCalendarRows_;
  var sh = getCalendarSheet_();
  var data = sh.getDataRange().getValues();
  if (data.length < 2) {
    _memoCalendarRows_ = [];
    return _memoCalendarRows_;
  }
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var client = String(data[r][2] || "").trim();
    if (!client) continue;
    var basket = [];
    try { basket = JSON.parse(String(data[r][8] || "[]")); } catch (e) { basket = []; }
    var rawNote = String(data[r][7] || "");
    var orderPrice = data[r][16];
    if (orderPrice == null || orderPrice === "") orderPrice = extractOrderPriceFromNote_(rawNote);
    else if (!isNaN(Number(orderPrice))) orderPrice = Number(orderPrice);
    else orderPrice = "";
    out.push({
      rowIndex: r + 1,
      date: data[r][0],
      dateIso: String(data[r][1] || ""),
      client: client,
      matchKey: String(data[r][3] || "") || clientMatchKey_(client),
      segment: String(data[r][4] || "") || extractSegmentFromNote_(rawNote),
      address: String(data[r][5] || ""),
      phone: String(data[r][6] || ""),
      note: stripTechFromNote_(rawNote),
      basket: Array.isArray(basket) ? basket : [],
      basketJson: String(data[r][8] || ""),
      subId: String(data[r][9] || "") || extractSubIdFromNote_(rawNote),
      source: String(data[r][10] || ""),
      status: String(data[r][11] || "planned"),
      dayName: String(data[r][12] || ""),
      updatedAt: data[r][13],
      pulledAt: data[r][14],
      legacyRef: String(data[r][15] || ""),
      orderPrice: orderPrice,
      ppSlot: String(data[r][17] != null ? data[r][17] : "").trim(),
      deliveryAfter: normalizeTimeHm_(data[r][18]),
      deliveryBefore: normalizeTimeHm_(data[r][19]),
      ppPartner: String(data[r][20] != null ? data[r][20] : "").trim(),
      couponsQty: normalizeCouponsQty_(data[r][21]),
      couponPrice: normalizeCouponUnitPrice_(data[r][22])
    });
  }
  _memoCalendarRows_ = out;
  return out;
}

function upsertCalendarEntry_(ss, opts) {
  opts = opts || {};
  var tz = ss.getSpreadsheetTimeZone();
  var deliveryDate = opts.date instanceof Date ? opts.date : parseFlexibleDate_(opts.date || opts.dateIso, tz);
  var client = String(opts.client || "").trim();
  if (!deliveryDate || !client) return null;
  var dateStr = dateKey_(deliveryDate, tz);
  var dateIso = isoDateKey_(deliveryDate, tz);
  var matchKey = String(opts.matchKey || "").trim() || clientMatchKey_(client);
  var status = String(opts.status || "planned").trim() || "planned";
  var sh = getCalendarSheet_();
  var all = readAllCalendarRows_();
  var existing = null;
  for (var i = 0; i < all.length; i++) {
    var bd = parseFlexibleDate_(all[i].date, tz) || parseFlexibleDate_(all[i].dateIso, tz);
    if (!bd || dateKey_(bd, tz) !== dateStr) continue;
    var st = String(all[i].status || "").toLowerCase();
    if (st === "cancelled") continue;
    if (matchKey && all[i].matchKey === matchKey) { existing = all[i]; break; }
    // старые строки без суффикса собаки: матч только если display совпадает
    if (nicksMatch_(all[i].client, client)) {
      var dOld = normalizeClientKey_(displayClientNick_(all[i].client) || all[i].client);
      var dNew = normalizeClientKey_(displayClientNick_(client) || client);
      if (dOld === dNew) { existing = all[i]; break; }
    }
  }
  var basket = opts.basket;
  if (!basket && opts.basketJson) {
    try { basket = JSON.parse(String(opts.basketJson)); } catch (eB) { basket = []; }
  }
  if (!Array.isArray(basket)) basket = existing ? (existing.basket || []) : [];
  var now = new Date();
  var noteHuman = stripTechFromNote_(opts.note != null ? opts.note : (existing && existing.note) || "");
  var seg = String(opts.segment != null ? opts.segment : (existing && existing.segment) || "").trim();
  if (!seg) seg = extractSegmentFromNote_(String(opts.note || ""));
  var priceVal = opts.orderPrice;
  if (priceVal == null || priceVal === "") {
    priceVal = existing ? existing.orderPrice : "";
  }
  if ((priceVal == null || priceVal === "") && opts.note) {
    priceVal = extractOrderPriceFromNote_(opts.note);
  }
  if (priceVal !== "" && priceVal != null && !isNaN(Number(priceVal))) priceVal = Number(priceVal);
  else priceVal = "";
  var ppSlot = String(opts.ppSlot != null ? opts.ppSlot : (existing && existing.ppSlot) || "").trim();
  var afterT = normalizeTimeHm_(opts.deliveryAfter != null ? opts.deliveryAfter : (existing && existing.deliveryAfter) || "");
  var beforeT = normalizeTimeHm_(opts.deliveryBefore != null ? opts.deliveryBefore : (existing && existing.deliveryBefore) || "");
  var ppPartner = String(opts.ppPartner != null ? opts.ppPartner : (existing && existing.ppPartner) || "").trim();
  var couponsQty = opts.couponsQty != null
    ? normalizeCouponsQty_(opts.couponsQty)
    : normalizeCouponsQty_(existing && existing.couponsQty);
  var couponPrice = opts.couponPrice != null
    ? normalizeCouponUnitPrice_(opts.couponPrice)
    : normalizeCouponUnitPrice_(existing && existing.couponPrice);
  var rowVals = [
    dateStr,
    dateIso,
    client,
    matchKey,
    seg,
    String(opts.address != null ? opts.address : (existing && existing.address) || ""),
    String(opts.phone != null ? opts.phone : (existing && existing.phone) || ""),
    noteHuman,
    JSON.stringify(basket),
    String(opts.subId != null ? opts.subId : (existing && existing.subId) || "") || extractSubIdFromNote_(String(opts.note || "")),
    String(opts.source != null ? opts.source : (existing && existing.source) || "manual"),
    status,
    String(opts.dayName != null ? opts.dayName : (existing && existing.dayName) || findDayNameForDate_(ss, deliveryDate) || ""),
    now,
    opts.pulledAt != null ? opts.pulledAt : (existing && existing.pulledAt) || "",
    String(opts.legacyRef != null ? opts.legacyRef : (existing && existing.legacyRef) || ""),
    priceVal,
    ppSlot,
    afterT,
    beforeT,
    ppPartner,
    couponsQty,
    couponPrice
  ];
  if (existing) {
    sh.getRange(existing.rowIndex, 1, 1, CALENDAR_HEADERS_.length).setValues([rowVals]);
    return { updated: true, row: existing.rowIndex, date: dateStr, dateIso: dateIso, client: client };
  }
  sh.appendRow(rowVals);
  return { created: true, date: dateStr, dateIso: dateIso, client: client };
}

function readCalendarForDate_(ss, deliveryDate) {
  var tz = ss.getSpreadsheetTimeZone();
  var want = dateKey_(deliveryDate, tz);
  var wantIso = isoDateKey_(deliveryDate, tz);
  var all = readAllCalendarRows_();
  var out = [];
  var seen = {};
  for (var i = 0; i < all.length; i++) {
    var st = String(all[i].status || "").toLowerCase();
    if (st === "cancelled") continue;
    var bd = parseFlexibleDate_(all[i].date, tz) || parseFlexibleDate_(all[i].dateIso, tz);
    var keyD = bd ? dateKey_(bd, tz) : String(all[i].date || "");
    var iso = String(all[i].dateIso || "");
    if (keyD !== want && iso !== wantIso) continue;
    var mk = clientMatchKey_(all[i].client) || all[i].matchKey || "";
    if (mk && seen[mk]) continue;
    if (mk) seen[mk] = true;
    // обновим matchKey в ответе на актуальный (две собаки)
    all[i].matchKey = mk || all[i].matchKey;
    out.push(all[i]);
  }
  return out;
}

/** Подтянуть в Календарь_Дат CRM-месяц + брони на дату (если в календаре пусто или force). */
function seedCalendarForDate_(ss, deliveryDate, opts) {
  opts = opts || {};
  var tz = ss.getSpreadsheetTimeZone();
  var existing = readCalendarForDate_(ss, deliveryDate);
  if (existing.length && !opts.force) return { seeded: 0, existing: existing.length, from: "calendar" };

  // Не воскрешать тех, кого уже убрали (status=cancelled) на эту дату
  var cancelledKeys = cancelledCalendarKeysForDate_(ss, deliveryDate);
  // Если все записи на дату cancelled и не force — не заливать CRM заново
  if (!existing.length && Object.keys(cancelledKeys).length && !opts.force && !opts.allowReseedCancelled) {
    return { seeded: 0, existing: 0, from: "cancelled_guard", skippedCancelled: Object.keys(cancelledKeys).length };
  }

  var added = 0;
  // 1) из Брони_Заказов
  try {
    var bookings = readAllBookings_();
    var want = dateKey_(deliveryDate, tz);
    for (var b = 0; b < bookings.length; b++) {
      var bd = parseFlexibleDate_(bookings[b].date, tz);
      if (!bd || dateKey_(bd, tz) !== want) continue;
      if (String(bookings[b].status) === "cancelled") continue;
      if (isCancelledCalendarKey_(cancelledKeys, bookings[b].client)) continue;
      upsertCalendarEntry_(ss, {
        date: deliveryDate,
        client: bookings[b].client,
        address: bookings[b].address,
        note: bookings[b].note,
        phone: extractPhoneFromNote_(bookings[b].note || ""),
        basket: bookings[b].basket,
        subId: bookings[b].subId,
        source: bookings[b].source || "booking",
        status: bookings[b].status || "planned",
        dayName: bookings[b].dayName || "",
        pulledAt: bookings[b].pulledAt || "",
        legacyRef: "booking:" + bookings[b].id
      });
      added++;
    }
  } catch (eB) {}

  // 2) из CRM-месяца (сетка)
  try {
    var crmSs = getCrmSpreadsheet_();
    var crmClients = readCrmClientsForDate_(crmSs, deliveryDate);
    var shName = "";
    try {
      var msh = resolveCrmMonthSheet_(crmSs, deliveryDate);
      shName = msh ? msh.getName() : "";
    } catch (eN) {}
    for (var i = 0; i < crmClients.length; i++) {
      var cc = crmClients[i];
      if (isCancelledCalendarKey_(cancelledKeys, cc.client, cc.matchKey)) continue;
      var basket = [];
      try {
        var filled = fillSubscriptionBasketForDate_(ss, crmSs, cc.client, cc.segment, deliveryDate);
        basket = filled.basket || [];
      } catch (eF) {}
      upsertCalendarEntry_(ss, {
        date: deliveryDate,
        client: displayClientNick_(cc.client) || cc.client,
        matchKey: cc.matchKey,
        segment: cc.segment || "",
        address: cc.address || "",
        phone: cc.phone || "",
        note: cc.note || "",
        basket: basket,
        source: "crm",
        status: "planned",
        legacyRef: shName ? (shName + ":" + deliveryDate.getDate()) : "crm"
      });
      added++;
    }
  } catch (eC) {}

  return { seeded: added, existing: readCalendarForDate_(ss, deliveryDate).length, from: "seed" };
}

/**
 * Миграция → Календарь_Дат.
 * json.months: "7,8" / "июль,август" (1–12) — по умолчанию июль+август текущего года.
 * json.full=1 — все 12 месяцев. json.skipBookings=1 — только CRM.
 */
function handleMigrateCalendar(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  getCalendarSheet_();
  var stats = { bookings: 0, crmDays: 0, crmPeople: 0, sheets: [], errors: [] };
  json = json || {};
  if (!(json.skipBookings === true || json.skipBookings === "1" || json.skipBookings === 1)) {
    try {
      var bookings = readAllBookings_();
      for (var i = 0; i < bookings.length; i++) {
        if (String(bookings[i].status) === "cancelled") continue;
        var bd = parseFlexibleDate_(bookings[i].date, tz);
        if (!bd) continue;
        upsertCalendarEntry_(ss, {
          date: bd,
          client: bookings[i].client,
          address: bookings[i].address,
          note: bookings[i].note,
          phone: extractPhoneFromNote_(bookings[i].note || ""),
          basket: bookings[i].basket,
          subId: bookings[i].subId,
          source: bookings[i].source || "booking",
          status: bookings[i].status || "planned",
          dayName: bookings[i].dayName || "",
          pulledAt: bookings[i].pulledAt || "",
          legacyRef: "booking:" + bookings[i].id
        });
        stats.bookings++;
      }
    } catch (e1) {
      stats.errors.push("bookings:" + String(e1));
    }
  }
  try {
    var crmSs = getCrmSpreadsheet_();
    var now = new Date();
    var year = Number(json.year) || now.getFullYear();
    var months = [];
    if (json.full === true || json.full === "1" || json.full === 1) {
      for (var m = 0; m < 12; m++) months.push(m);
    } else if (json.months != null && String(json.months).trim() !== "") {
      var parts = String(json.months).split(/[,;|\s]+/);
      for (var pi = 0; pi < parts.length; pi++) {
        var p = String(parts[pi] || "").trim().toLowerCase().replace(/ё/g, "е");
        if (!p) continue;
        var num = Number(p);
        if (isFinite(num) && num >= 1 && num <= 12) {
          months.push(num - 1);
          continue;
        }
        for (var miName = 0; miName < CRM_MONTH_NAMES_RU_.length; miName++) {
          if (CRM_MONTH_NAMES_RU_[miName].toLowerCase().replace(/ё/g, "е") === p) {
            months.push(miName);
            break;
          }
        }
      }
    } else {
      // по умолчанию: июль + август (рабочие CRM-календари)
      months = [6, 7];
    }
    var seenM = {};
    for (var mi = 0; mi < months.length; mi++) {
      var monthIdx = months[mi];
      if (monthIdx < 0 || monthIdx > 11 || seenM[monthIdx]) continue;
      seenM[monthIdx] = true;
      var probe = new Date(year, monthIdx, 15);
      var sh = resolveCrmMonthSheet_(crmSs, probe);
      var bulk = migrateCrmMonthSheetBulk_(ss, crmSs, sh, year, monthIdx);
      stats.sheets.push(bulk);
      stats.crmDays += bulk.days || 0;
      stats.crmPeople += bulk.people || 0;
    }
  } catch (e2) {
    stats.errors.push("crm:" + String(e2));
  }
  var ok = { status: "success", sheet: "Календарь_Дат", stats: stats };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/** Убрать человека с даты в Календарь_Дат (+ отменить бронь). Неделю не трогает. */
function handleRemoveCalendarClient(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var deliveryDate = parseFlexibleDate_((json && (json.date || json.deliveryDate)) || "", tz);
  var client = String((json && (json.client || json.nick || json.name)) || "").trim();
  if (!deliveryDate || !client) {
    var bad = { status: "error", message: "need_date_and_client" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var matchKey = String((json && json.matchKey) || "").trim() || clientMatchKey_(client);
  var calRes = cancelCalendarClientOnDate_(ss, client, deliveryDate, matchKey);
  try { cancelBookingsForClient_(ss, client, deliveryDate); } catch (eB) {}
  try { bustClientsCache_(); } catch (eC) {}
  var out = {
    status: calRes.removed ? "success" : "error",
    message: calRes.removed ? "removed" : "not_found",
    removed: calRes.removed || 0,
    date: dateKey_(deliveryDate, tz),
    client: client
  };
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}

function parseFlexibleDate_(val, tz) {
  if (!val) return null;
  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) {
    return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  }
  var s = String(val).trim();
  var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  var m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
  var d = new Date(s);
  if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return null;
}

function dateKey_(d, tz) {
  if (!d) return "";
  return Utilities.formatDate(d, tz || SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "dd.MM.yyyy");
}

function isoDateKey_(d, tz) {
  if (!d) return "";
  return Utilities.formatDate(d, tz || SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "yyyy-MM-dd");
}

function findDayNameForDate_(ss, deliveryDate) {
  var tz = ss.getSpreadsheetTimeZone();
  var want = dateKey_(deliveryDate, tz);
  var manager = ss.getSheetByName("Прием заказов");
  if (!manager) return null;
  var names = MANAGER_DAY_NAMES_;
  for (var i = 0; i < names.length; i++) {
    var cell = manager.getRange(MANAGER_DATE_CELLS[i]).getValue();
    if (formatSheetDate(cell, tz) === want) return names[i];
  }
  var future = ss.getSheetByName("Будущая неделя");
  if (future && formatSheetDate(future.getRange("A1").getValue(), tz) === want) {
    return "Будущая неделя";
  }
  return null;
}

function addDaysDate_(d, n) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** Окно «поздно»: меньше 12ч до конца дня подготовки D−1 (= с 12:00 D−1 и далее). */
function isLateChangeForDelivery_(deliveryDate, now) {
  // конец дня подготовки = полночь начала дня доставки D
  var prepDayEnd = addDaysDate_(deliveryDate, 0);
  var windowStart = new Date(prepDayEnd.getTime() - 12 * 60 * 60 * 1000);
  return now.getTime() >= windowStart.getTime();
}

function basketTotalsMap_(basket) {
  var map = {};
  (basket || []).forEach(function (it) {
    var name = String(it.name || it.main || "").trim();
    var sub = String(it.sub || "").trim();
    var val = Number(it.val != null ? it.val : it.value) || 0;
    if (!name || val <= 0) return;
    var key = name + (sub ? " / " + sub : "");
    map[key] = (map[key] || 0) + val;
  });
  return map;
}

function diffBasketIncrease_(oldBasket, newBasket) {
  var a = basketTotalsMap_(oldBasket);
  var b = basketTotalsMap_(newBasket);
  var lines = [];
  for (var k in b) {
    if (!b.hasOwnProperty(k)) continue;
    var prev = a[k] || 0;
    var next = b[k] || 0;
    if (next > prev) {
      var unit = isPieceSkuName_(k) || /шт/i.test(k) ? "шт" : "г";
      lines.push("+" + (next - prev) + " " + unit + " · " + k);
    }
  }
  return lines;
}

function readAllBookings_() {
  var sh = getBookingsSheet_();
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[1] && !row[2]) continue;
    var basket = [];
    try { basket = JSON.parse(String(row[6] || "[]")); } catch (e) { basket = []; }
    var rawNote = String(row[5] || "");
    var orderPrice = row[14];
    if (orderPrice == null || orderPrice === "") orderPrice = extractOrderPriceFromNote_(rawNote);
    else if (!isNaN(Number(orderPrice))) orderPrice = Number(orderPrice);
    else orderPrice = "";
    out.push({
      rowIndex: i + 1,
      id: String(row[0] || ""),
      date: row[1],
      client: String(row[2] || ""),
      subId: String(row[3] || "") || extractSubIdFromNote_(rawNote),
      address: String(row[4] || ""),
      note: stripTechFromNote_(rawNote),
      basket: basket,
      source: String(row[7] || "retail"),
      status: String(row[8] || "planned"),
      dayName: String(row[9] || ""),
      updatedAt: row[10],
      pulledAt: row[11],
      segment: String(row[12] || "") || extractSegmentFromNote_(rawNote),
      phone: String(row[13] || ""),
      orderPrice: orderPrice,
      ppSlot: String(row[15] != null ? row[15] : "").trim(),
      deliveryAfter: normalizeTimeHm_(row[16]),
      deliveryBefore: normalizeTimeHm_(row[17]),
      ppPartner: String(row[18] != null ? row[18] : "").trim(),
      couponsQty: normalizeCouponsQty_(row[19]),
      couponPrice: normalizeCouponUnitPrice_(row[20])
    });
  }
  return out;
}

function handleListBookings(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var fromD = parseFlexibleDate_(json.from || json.date, tz);
  var toD = parseFlexibleDate_(json.to || json.date, tz);
  var all = readAllBookings_();
  var list = all.filter(function (b) {
    var bd = parseFlexibleDate_(b.date, tz);
    if (!bd) return false;
    if (fromD && bd < fromD) return false;
    if (toD && bd > toD) return false;
    return true;
  }).map(function (b) {
    return {
      id: b.id,
      date: dateKey_(parseFlexibleDate_(b.date, tz), tz),
      dateIso: isoDateKey_(parseFlexibleDate_(b.date, tz), tz),
      client: b.client,
      subId: b.subId,
      address: b.address,
      note: b.note,
      basket: b.basket,
      source: b.source,
      status: b.status,
      dayName: b.dayName,
      segment: b.segment || "",
      phone: b.phone || "",
      orderPrice: b.orderPrice !== "" && b.orderPrice != null ? b.orderPrice : "",
      ppSlot: b.ppSlot || ""
    };
  });
  var ok = { status: "success", bookings: list };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function normalizeBasketArg_(basket) {
  if (basket == null || basket === "") return [];
  if (typeof basket === "string") {
    try { basket = JSON.parse(basket); } catch (e) { return []; }
  }
  if (!Array.isArray(basket)) return [];
  return basket.filter(function (it) {
    if (!it || typeof it !== "object") return false;
    var n = String(it.name || it.main || "").trim();
    var v = Number(it.val != null ? it.val : it.value) || 0;
    return !!(n && v > 0);
  });
}

/** Суммирует одинаковые позиции (для колонки недели); dog-метки отбрасывает. */
function mergeBasketQtyForSheet_(basket) {
  var map = {};
  var order = [];
  (basket || []).forEach(function (it) {
    var name = String(it.name || it.main || "").trim();
    var sub = String(it.sub || "").trim();
    var val = Number(it.val != null ? it.val : it.value) || 0;
    if (!name || val <= 0) return;
    var key = name.toUpperCase() + "|" + sub.toUpperCase();
    if (!map[key]) {
      map[key] = {
        cat: it.cat || "",
        main: name,
        name: name,
        sub: sub,
        val: 0,
        value: 0,
        unit: it.unit || ""
      };
      order.push(key);
    }
    map[key].val += val;
    map[key].value = map[key].val;
  });
  return order.map(function (k) { return map[k]; });
}

function basketHasDogSplit_(basket) {
  var has1 = false, has2 = false;
  (basket || []).forEach(function (it) {
    var d = Number(it.dog) || 0;
    if (d === 1) has1 = true;
    if (d === 2) has2 = true;
  });
  return has1 && has2;
}

function splitBasketByDog_(basket) {
  var d1 = [], d2 = [], rest = [];
  (basket || []).forEach(function (it) {
    var d = Number(it.dog) || 0;
    if (d === 2) d2.push(it);
    else if (d === 1) d1.push(it);
    else rest.push(it);
  });
  if (!d2.length) return null;
  if (rest.length) d1 = d1.concat(rest);
  return { dog1: d1, dog2: d2 };
}

function handleSaveBooking(ss, json, callback, fromPost) {
  if (fromPost === undefined) fromPost = true;
  var tz = ss.getSpreadsheetTimeZone();
  var deliveryDate = parseFlexibleDate_(json.date || json.deliveryDate, tz);
  var client = String(json.client || "").trim();
  if (!deliveryDate || !client) {
    var bad = { status: "error", message: "need_date_and_client" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var basket = normalizeBasketArg_(json.basket);
  var note = stripTechFromNote_(json.note || "");
  var segSave = segmentLabelFromOrderType_(json.orderType || json.source) ||
    String(json.segment || "").trim().toUpperCase() ||
    extractSegmentFromNote_(String(json.note || ""));
  var orderPriceSave = "";
  if (segSave !== "БП" && json.orderPrice != null && json.orderPrice !== "" && !isNaN(Number(json.orderPrice))) {
    orderPriceSave = Number(json.orderPrice);
  } else {
    var lp = extractOrderPriceFromNote_(String(json.note || ""));
    if (segSave !== "БП" && lp !== "") orderPriceSave = lp;
  }
  var phoneSave = String(json.phone || "").trim() || extractPhoneFromNote_(String(json.note || ""));
  var subIdSave = String(json.subId || "").trim() || extractSubIdFromNote_(String(json.note || ""));
  var ppSlotSave = String(json.ppSlot || "").trim();
  if (!ppSlotSave && (json.deliverySlot != null && json.deliverySlot !== "" || json.slot)) {
    var forcedBk = parseForcedPpSlot_(json.deliverySlot != null ? json.deliverySlot : json.slot, 2);
    if (forcedBk >= 1) {
      var dnBk = 2;
      try { dnBk = lookupPpDeliveries_(client) || 2; } catch (eDnB) {}
      ppSlotSave = formatPpSlotLabel_(forcedBk, Math.max(dnBk, 2));
    }
  }
  if (!ppSlotSave && (segSave === "ПП" || String(json.source || "").toLowerCase().indexOf("sub") >= 0)) {
    try {
      var resolvedB = resolvePpDeliverySlot_(ss, client, deliveryDate, tz, false);
      ppSlotSave = formatPpSlotLabel_(resolvedB.slot, resolvedB.deliveriesN);
    } catch (eSlotB) {}
  }
  var dayName = findDayNameForDate_(ss, deliveryDate) || "";
  var sh = getBookingsSheet_();
  var all = readAllBookings_();
  var dateStr = dateKey_(deliveryDate, tz);
  var existing = null;
  for (var i = 0; i < all.length; i++) {
    var bd = parseFlexibleDate_(all[i].date, tz);
    if (bd && dateKey_(bd, tz) === dateStr &&
        nicksMatch_(all[i].client, client) &&
        String(all[i].status) !== "cancelled") {
      existing = all[i];
      break;
    }
  }

  var oldBasket = existing ? existing.basket : [];
  var wasPulled = existing && String(existing.status) === "pulled";
  var id = existing ? existing.id : ("b" + Date.now() + "_" + Math.floor(Math.random() * 1e5));
  var now = new Date();
  if (!subIdSave && existing) subIdSave = existing.subId || "";
  if (!ppSlotSave && existing) ppSlotSave = existing.ppSlot || "";
  if (!segSave && existing) segSave = existing.segment || "";
  if (orderPriceSave === "" && existing && existing.orderPrice !== "") orderPriceSave = existing.orderPrice;
  var afterSave = normalizeTimeHm_(json.deliveryAfter != null ? json.deliveryAfter : (existing && existing.deliveryAfter) || "");
  var beforeSave = normalizeTimeHm_(json.deliveryBefore != null ? json.deliveryBefore : (existing && existing.deliveryBefore) || "");
  var ppPartnerSave = String(json.ppPartner != null ? json.ppPartner : (existing && existing.ppPartner) || "").trim();
  var couponsQtySave = json.couponsQty != null
    ? normalizeCouponsQty_(json.couponsQty)
    : normalizeCouponsQty_(existing && existing.couponsQty);
  var couponPriceSave = json.couponPrice != null
    ? normalizeCouponUnitPrice_(json.couponPrice)
    : normalizeCouponUnitPrice_(existing && existing.couponPrice);
  var rowVals = [
    id, dateStr, client,
    subIdSave,
    String(json.address != null ? json.address : (existing && existing.address) || ""),
    note, JSON.stringify(basket),
    String(json.source || (existing && existing.source) || "retail"),
    wasPulled ? "pulled" : "planned",
    dayName, now,
    wasPulled ? (existing.pulledAt || "") : "",
    segSave,
    phoneSave || (existing && existing.phone) || "",
    orderPriceSave,
    ppSlotSave,
    afterSave,
    beforeSave,
    ppPartnerSave,
    couponsQtySave,
    couponPriceSave
  ];

  if (existing) {
    sh.getRange(existing.rowIndex, 1, 1, BOOKINGS_HEADERS_.length).setValues([rowVals]);
  } else {
    sh.appendRow(rowVals);
  }

  try {
    upsertCalendarEntry_(ss, {
      date: deliveryDate,
      client: client,
      segment: segSave,
      address: json.address != null ? json.address : (existing && existing.address) || "",
      phone: phoneSave || (existing && existing.phone) || "",
      note: note,
      basket: basket,
      subId: subIdSave,
      source: String(json.orderType || json.source || (existing && existing.source) || "retail").trim().toLowerCase() || "retail",
      status: wasPulled ? "pulled" : "planned",
      dayName: dayName,
      pulledAt: wasPulled ? (existing.pulledAt || "") : "",
      legacyRef: "booking:" + id,
      orderPrice: orderPriceSave,
      ppSlot: ppSlotSave,
      deliveryAfter: afterSave,
      deliveryBefore: beforeSave,
      ppPartner: ppPartnerSave,
      couponsQty: couponsQtySave,
      couponPrice: couponPriceSave
    });
  } catch (eCal) {}

  try {
    upsertClientProfile_(ss, client, json.address, phoneSave || extractPhoneFromNote_(note), note, json.source || "retail");
  } catch (eProf2) {}

  var materializeResult = null;
  var notifyLines = [];
  var prepDay = addDaysDate_(deliveryDate, -1);
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today.getTime() >= prepDay.getTime()) {
    materializeResult = materializeDeliveryDate_(ss, deliveryDate, { forceClient: client, skipCrm: true });
    notifyLines = diffBasketIncrease_(oldBasket, basket);
    if (notifyLines.length && isLateChangeForDelivery_(deliveryDate, now)) {
      notifyCuttersVolumeIncrease_(deliveryDate, client, notifyLines);
    }
    if (json.geo && json.geo.lat != null && dayName) {
      try {
        upsertClientGeo_(ss, dayName, client, json.geo.lat, json.geo.lon, json.geo.yandexUrl || "");
      } catch (eGeo) {}
    }
  }

  // Дата = Пн–Вс / A1 «Будущей» → всегда колонка на листе (даже без состава).
  // Дальше недели — только бронь + календарь.
  var matchedDay = findDayNameForDate_(ss, deliveryDate) || "";
  var targetDay = matchedDay;
  var alsoWeek = json.alsoSaveOrder === true || json.alsoSaveOrder === "1" || json.alsoSaveOrder === 1 || json.alsoSaveOrder === "true";
  var shouldWriteWeek = !!matchedDay;
  var weekWrite = null;
  if (shouldWriteWeek && targetDay) {
    try {
      // полный путь saveOrder — надёжнее, чем только writeBasket (silent: без второго HTTP-ответа)
      var soRes = handleSaveOrder(ss, {
        day: targetDay,
        date: deliveryDate,
        client: client,
        address: json.address != null ? json.address : (existing && existing.address) || "",
        phone: json.phone || "",
        note: note,
        basket: basket,
        geo: json.geo || null,
        orderPrice: json.orderPrice,
        orderType: json.orderType || json.source || "",
        permanentNote: json.permanentNote || "",
        ppSlot: ppSlotSave || json.ppSlot || "",
        deliverySlot: json.deliverySlot != null ? json.deliverySlot : json.slot,
        survey: json.survey || null,
        deliveryAfter: afterSave,
        deliveryBefore: beforeSave,
        ppPartner: ppPartnerSave,
        couponsQty: couponsQtySave,
        couponPrice: couponPriceSave,
        editClient: json.editClient || json.originalClient || "",
        originalClient: json.originalClient || json.editClient || "",
        matchKey: json.matchKey || ""
      }, null, "internal");
      if (soRes && soRes.status === "success") {
        weekWrite = {
          ok: true,
          day: targetDay,
          wrote: Number(soRes.wrote || 0),
          missed: soRes.missed || []
        };
      } else if (soRes && soRes.status) {
        weekWrite = { ok: false, day: targetDay, status: soRes.status, message: soRes.message || "" };
      } else {
        weekWrite = { ok: true, day: targetDay };
      }
    } catch (eSaveW) {
      try {
        weekWrite = writeBasketToDayColumn_(ss, targetDay, client,
          json.address != null ? json.address : (existing && existing.address) || "",
          note, basket, { overwriteMeta: true });
      } catch (eSaveW2) {}
    }
  }

  var ok = {
    status: "success",
    bookingId: id,
    date: dateStr,
    dayName: dayName || targetDay || "",
    weekWritten: !!(weekWrite && weekWrite.ok),
    wrote: weekWrite && weekWrite.wrote != null ? Number(weekWrite.wrote) : null,
    missed: (weekWrite && weekWrite.missed) || [],
    materialized: !!(materializeResult && materializeResult.ok),
    lateNotify: notifyLines.length > 0 && isLateChangeForDelivery_(deliveryDate, now),
    delta: notifyLines
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function writeBasketToDayColumn_(ss, dayName, client, address, note, basket, opts) {
  opts = opts || {};
  var block = getDayBlock(dayName);
  if (!block) return { ok: false, message: "bad_day" };
  var targetSheet = getTargetSheet(ss, block);
  if (!targetSheet) return { ok: false, message: "no_sheet" };
  var displayNick = displayClientNick_(client) || String(client || "").trim();
  if (!displayNick) return { ok: false, message: "no_client" };

  var clientCol = -1;
  var mgrNicks = targetSheet.getRange(block.nick, 3, 1, 15).getValues()[0];
  for (var i = 0; i < 15; i++) {
    if (nicksMatch_(mgrNicks[i], displayNick) || nicksMatch_(mgrNicks[i], client)) {
      clientCol = i + 3;
      break;
    }
  }
  var created = false;
  if (clientCol === -1) {
    for (var colIdx = 3; colIdx <= 17; colIdx++) {
      if (String(targetSheet.getRange(block.nick, colIdx).getValue() || "").trim() === "") {
        clientCol = colIdx;
        targetSheet.getRange(block.nick, clientCol).setValue(displayNick);
        created = true;
        break;
      }
    }
  }
  if (clientCol === -1) return { ok: false, message: "no_free_columns" };

  // уже стоящий ник — не переименовывать в короткий handle
  if (!created) {
    var curNick = String(targetSheet.getRange(block.nick, clientCol).getValue() || "").trim();
    if (!curNick) targetSheet.getRange(block.nick, clientCol).setValue(displayNick);
    else if (displayNick.length > curNick.length && nicksMatch_(curNick, displayNick)) {
      // если из месяца пришло более полное имя — обновим
      targetSheet.getRange(block.nick, clientCol).setValue(displayNick);
    }
  }

  var hasQty = false;
  try {
    var qtyVals = targetSheet.getRange(block.start, clientCol, block.end - block.start + 1, 1).getValues();
    for (var q = 0; q < qtyVals.length; q++) {
      if (Number(qtyVals[q][0]) > 0) { hasQty = true; break; }
    }
  } catch (eQty) {}

  // 2 собаки: на лист — суммы qty; dog-метки остаются в календаре/брони
  var basketItems = mergeBasketQtyForSheet_(basket || []);

  // Пустая бронь + в дне уже есть состав → только адрес/телефон/note, состав НЕ трогаем
  if (!basketItems.length && hasQty && !opts.forceClear) {
    try {
      var curAddr = String(targetSheet.getRange(block.addr, clientCol).getValue() || "").trim();
      if (address && !curAddr) targetSheet.getRange(block.addr, clientCol).setValue(address);
      else if (address && opts.overwriteMeta) targetSheet.getRange(block.addr, clientCol).setValue(address);
      var cleanNote = stripTechFromNote_(note || "");
      var curNote = String(targetSheet.getRange(block.note, clientCol).getValue() || "").trim();
      if (cleanNote && !curNote) targetSheet.getRange(block.note, clientCol).setValue(cleanNote);
      else if (cleanNote && opts.overwriteMeta) targetSheet.getRange(block.note, clientCol).setValue(cleanNote);
    } catch (eMeta) {}
    return { ok: true, col: clientCol, preserved: true, created: created };
  }

  // Пустая бронь + пустой день → оболочка (ник/адрес/note), без clear продуктов
  if (!basketItems.length && !hasQty) {
    if (address) targetSheet.getRange(block.addr, clientCol).setValue(address);
    var shellNote = stripTechFromNote_(note || "");
    if (shellNote) targetSheet.getRange(block.note, clientCol).setValue(shellNote);
    return { ok: true, col: clientCol, shell: true, created: created };
  }

  // Есть состав в броне — пишем (не затираем чужой день при onlyMissing+уже есть qty)
  if (basketItems.length && hasQty && opts.skipIfHasQty) {
    return { ok: true, col: clientCol, skipped: true, created: false };
  }

  targetSheet.getRange(block.start, clientCol, block.note - block.start + 1, 1).clearContent();
  // ник мог стереться clear'ом — вернуть
  targetSheet.getRange(block.nick, clientCol).setValue(
    String(targetSheet.getRange(block.nick, clientCol).getValue() || "").trim() || displayNick
  );
  // clearContent выше чистит от start до note включительно — nick выше start, OK.
  // Но addr/note внутри диапазона — пишем заново:
  if (address) targetSheet.getRange(block.addr, clientCol).setValue(address);
  var cleanNote2 = stripTechFromNote_(note || "");
  if (cleanNote2) targetSheet.getRange(block.note, clientCol).setValue(cleanNote2);

  var itemsInSheet = targetSheet.getRange(block.start, 1, block.end - block.start + 1, 1).getValues();
  basketItems.forEach(function (orderItem) {
    var rawName = String(orderItem.name || orderItem.main || "").trim();
    var rawSub = String(orderItem.sub || "").trim();
    var inputVal = Number(orderItem.val != null ? orderItem.val : orderItem.value) || 0;
    if (!rawName || inputVal <= 0) return;
    var targetRowOffset = findSheetRowForItem(itemsInSheet, rawName, rawSub);
    if (targetRowOffset >= 0) {
      targetSheet.getRange(block.start + targetRowOffset, clientCol).setValue(inputVal);
    }
  });
  return { ok: true, col: clientCol, created: created, wrote: basketItems.length };
}

function materializeDeliveryDate_(ss, deliveryDate, opts) {
  opts = opts || {};
  var tz = ss.getSpreadsheetTimeZone();
  var crmSync = null;
  if (!opts.skipCrm) {
    try { crmSync = syncCrmIntoBookings_(ss, deliveryDate); } catch (eCrm) {
      crmSync = { ok: false, message: String(eCrm) };
    }
  }
  var dayName = findDayNameForDate_(ss, deliveryDate);
  if (!dayName) {
    return { ok: false, message: "date_not_in_week", date: dateKey_(deliveryDate, tz), crm: crmSync };
  }
  var dateStr = dateKey_(deliveryDate, tz);
  var all = readAllBookings_();
  var sh = getBookingsSheet_();
  var done = 0;
  var updated = 0;
  var preserved = 0;
  var forceClient = opts.forceClient ? String(opts.forceClient).trim() : "";
  var onlyMissing = !!(opts.onlyMissing === true || opts.onlyMissing === "1" || opts.onlyMissing === 1 || opts.onlyMissing === "true");
  var alreadyInWeek = {};
  if (onlyMissing) {
    try {
      var weekData = getClientsData_(ss, dayName);
      (weekData.clients || []).forEach(function (cl) {
        var k = clientMatchKey_(cl.name);
        if (k) {
          alreadyInWeek[k] = {
            name: cl.name,
            basketLen: (cl.basket || []).length,
            col: cl.col
          };
        }
      });
    } catch (eMiss) {}
  }

  for (var i = 0; i < all.length; i++) {
    var b = all[i];
    if (String(b.status) === "cancelled") continue;
    var bd = parseFlexibleDate_(b.date, tz);
    if (!bd || dateKey_(bd, tz) !== dateStr) continue;
    if (forceClient && !nicksMatch_(b.client, forceClient)) continue;

    var idKey = clientMatchKey_(b.client);
    var existingDay = idKey ? alreadyInWeek[idKey] : null;
    var bookingBasketLen = (b.basket || []).length;

    // already on day: не плодим дубли; пустую броню не накатываем поверх состава
    if (onlyMissing && existingDay) {
      if (bookingBasketLen && !(existingDay.basketLen > 0)) {
        var fillRes = writeBasketToDayColumn_(ss, dayName, existingDay.name || b.client, b.address, b.note, b.basket, {
          skipIfHasQty: true
        });
        if (fillRes.ok && !fillRes.skipped) {
          done++;
          sh.getRange(b.rowIndex, 9).setValue("pulled");
          sh.getRange(b.rowIndex, 10).setValue(dayName);
          sh.getRange(b.rowIndex, 12).setValue(new Date());
          alreadyInWeek[idKey] = {
            name: existingDay.name || b.client,
            basketLen: bookingBasketLen,
            col: fillRes.col
          };
        }
      } else {
        // подтянуть только контакты, состав сохранить
        var metaRes = writeBasketToDayColumn_(ss, dayName, existingDay.name || b.client, b.address, b.note, [], {});
        if (metaRes.ok) preserved++;
        sh.getRange(b.rowIndex, 9).setValue("pulled");
        sh.getRange(b.rowIndex, 10).setValue(dayName);
        sh.getRange(b.rowIndex, 12).setValue(new Date());
      }
      continue;
    }

    var res = writeBasketToDayColumn_(ss, dayName, b.client, b.address, b.note, b.basket, {
      skipIfHasQty: onlyMissing
    });
    if (res.ok && !res.skipped) {
      done++;
      if (res.preserved || res.shell) preserved++;
      if (String(b.status) === "pulled") updated++;
      sh.getRange(b.rowIndex, 9).setValue("pulled");
      sh.getRange(b.rowIndex, 10).setValue(dayName);
      sh.getRange(b.rowIndex, 12).setValue(new Date());
      if (idKey) {
        alreadyInWeek[idKey] = {
          name: b.client,
          basketLen: bookingBasketLen || (res.preserved ? 1 : 0),
          col: res.col
        };
      }
    }
  }
  return {
    ok: true,
    dayName: dayName,
    date: dateStr,
    count: done,
    updated: updated,
    preserved: preserved,
    onlyMissing: onlyMissing,
    crm: crmSync
  };
}

/**
 * Дата вне Пн–Пт текущей недели → слот «Будущая неделя».
 * write=true: проставить A1 на эту дату (перед переносом людей).
 */
function ensureFutureWeekForDate_(ss, deliveryDate, write) {
  if (!deliveryDate) return null;
  var future = ss.getSheetByName("Будущая неделя");
  if (!future) return null;
  var tz = ss.getSpreadsheetTimeZone();
  var want = dateKey_(deliveryDate, tz);
  var cur = parseFlexibleDate_(future.getRange("A1").getValue(), tz);
  var matches = !!(cur && dateKey_(cur, tz) === want);
  if (write && !matches) {
    future.getRange("A1").setValue(deliveryDate);
    matches = true;
  }
  return {
    day: "Будущая неделя",
    date: deliveryDate,
    dateNotInWeek: true,
    futureSlot: true,
    futureDateMatches: matches
  };
}

function resolveViewDeliveryDate_(ss, json) {
  var tz = ss.getSpreadsheetTimeZone();
  var dayHint = String((json && json.day) || "").trim();
  var deliveryDate = parseFlexibleDate_((json && (json.deliveryDate || json.date)) || "", tz);
  var writeFuture = !!(json && (json.ensureFuture === true || json.ensureFuture === "1" || json.ensureFuture === 1 ||
    json.writeFuture === true || json.writeFuture === "1"));
  if (deliveryDate) {
    var byDate = findDayNameForDate_(ss, deliveryDate);
    if (byDate) {
      return {
        date: deliveryDate,
        day: byDate,
        dateNotInWeek: byDate === "Будущая неделя",
        futureSlot: byDate === "Будущая неделя",
        futureDateMatches: byDate === "Будущая неделя" ? true : undefined
      };
    }
    if (dayHint && dayHint !== "Будущая неделя") {
      var d2 = parseFlexibleDate_(getDayDate_(ss, dayHint), tz);
      if (d2) return { date: d2, day: dayHint, dateNotInWeek: false };
    }
    // вне текущей недели — всегда цель «Будущая неделя» (не «нет такого дня»)
    var fut = ensureFutureWeekForDate_(ss, deliveryDate, writeFuture);
    if (fut) return fut;
    return { date: deliveryDate, day: "", dateNotInWeek: true };
  }
  if (dayHint) {
    var d3 = parseFlexibleDate_(getDayDate_(ss, dayHint), tz);
    return { date: d3, day: dayHint, dateNotInWeek: dayHint === "Будущая неделя" };
  }
  return null;
}

/**
 * Дата уже на листе недели (Пн–Вс / Будущая), а человек только в календаре —
 * дописать колонку, чтобы Просмотр · Неделя не был пустым.
 */
function syncOnWeekCalendarToSheet_(ss, deliveryDate, dayName) {
  if (!ss || !deliveryDate || !dayName) return { added: 0 };
  var added = 0;
  try {
    var mat = materializeDeliveryDate_(ss, deliveryDate, { onlyMissing: true });
    if (mat && (mat.count || mat.done)) added += Number(mat.count || mat.done) || 0;
  } catch (eMat) {}
  try {
    var onWeek = {};
    var weekData = getClientsData_(ss, dayName);
    (weekData.clients || []).forEach(function (cl) {
      var k = clientMatchKey_(cl.name);
      if (k) onWeek[k] = true;
      var nu = String(cl.name || "").trim().toUpperCase();
      if (nu) onWeek[nu] = true;
    });
    var cal = readCalendarForDate_(ss, deliveryDate);
    var missing = [];
    for (var i = 0; i < cal.length; i++) {
      var cc = cal[i];
      if (String(cc.status || "").toLowerCase() === "cancelled") continue;
      var key = cc.matchKey || clientMatchKey_(cc.client);
      var display = displayClientNick_(cc.client) || String(cc.client || "").trim();
      if (!display) continue;
      var du = display.toUpperCase();
      if ((key && onWeek[key]) || (du && onWeek[du])) continue;
      missing.push({
        client: display,
        address: cc.address || "",
        phone: cc.phone || "",
        note: cc.note || "",
        basket: Array.isArray(cc.basket) ? cc.basket : [],
        segment: cc.segment || "",
        ppPartner: cc.ppPartner || ""
      });
    }
    if (missing.length) {
      var pull = pullCrmClientsToDay_(ss, deliveryDate, dayName, missing);
      added += Number(pull && pull.added) || 0;
      // если pull не насчитал — всё равно дописать оболочки напрямую
      if (!(pull && pull.added)) {
        for (var m = 0; m < missing.length; m++) {
          try {
            var w = writeBasketToDayColumn_(ss, dayName, missing[m].client,
              missing[m].address, missing[m].note, missing[m].basket || [], { overwriteMeta: true });
            if (w && w.ok && !w.skipped) {
              added++;
              try {
                upsertCalendarEntry_(ss, {
                  date: deliveryDate,
                  client: missing[m].client,
                  matchKey: clientMatchKey_(missing[m].client),
                  address: missing[m].address,
                  note: missing[m].note,
                  basket: missing[m].basket || [],
                  status: "pulled",
                  source: "sync"
                });
              } catch (eUp) {}
            }
          } catch (eW) {}
        }
      }
    }
  } catch (ePull) {}
  if (added) {
    try { bustClientsCache_(); } catch (eB) {}
    try { CacheService.getScriptCache().remove("WDC:v2"); } catch (eW) {}
  }
  return { added: added };
}

/** Просмотр: кто уже на неделе + кто в календаре месяца ещё не перенесён. */
function handleGetViewCompare(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  try { scrubFutureWeekOrphans_(ss); } catch (eScrubV) {}
  var resolved = resolveViewDeliveryDate_(ss, json || {});
  if (!resolved || (!resolved.day && !resolved.date)) {
    var need = { status: "error", message: "need_day_or_date", week: [], month: [] };
    return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
  }

  var week = [];
  var already = {};
  // «Будущая неделя» с другой датой в A1 — не показывать чужих людей слева
  var showWeek = !!resolved.day;
  if (resolved.futureSlot && resolved.futureDateMatches === false) showWeek = false;
  // дата на листе → сироты календаря сразу на колонку недели
  var syncedOrphans = null;
  if (showWeek && resolved.date && resolved.day) {
    try { syncedOrphans = syncOnWeekCalendarToSheet_(ss, resolved.date, resolved.day); } catch (eSync) {}
  }
  if (showWeek) {
    var data = getClientsData_(ss, resolved.day);
    (data.clients || []).forEach(function (c) {
      var name = String(c.name || "").trim();
      if (!name) return;
      var k = clientMatchKey_(name);
      if (k) already[k] = true;
      week.push({
        name: name,
        address: c.address || "",
        note: c.note || "",
        phone: c.phone || extractPhoneFromNote_(c.note || ""),
        basket: c.basket || [],
        orderCount: c.orderCount != null ? c.orderCount : ((c.basket || []).length),
        segment: c.segment || "",
        source: c.source || "",
        deliveryAfter: c.deliveryAfter || "",
        deliveryBefore: c.deliveryBefore || "",
        ppPartner: c.ppPartner || "",
        orderPrice: c.orderPrice != null ? c.orderPrice : "",
        ppSlot: c.ppSlot || "",
        ppHint: c.ppHint || "",
        matchKey: c.matchKey || k || "",
        dogCount: c.dogCount || 1
      });
    });
  }

  var month = [];
  var monthSheet = "";
  var calendarSeed = null;
  if (resolved.date) {
    try {
      getCalendarSheet_();
      calendarSeed = seedCalendarForDate_(ss, resolved.date, { force: false });
      var calClients = readCalendarForDate_(ss, resolved.date);
      monthSheet = "Календарь_Дат";
      // если календарь пуст — последний шанс CRM напрямую (не воскрешая cancelled)
      if (!calClients.length) {
        try {
          var cancelledGuard = cancelledCalendarKeysForDate_(ss, resolved.date);
          if (!Object.keys(cancelledGuard).length) {
            var crmSs0 = getCrmSpreadsheet_();
            var sh0 = resolveCrmMonthSheet_(crmSs0, resolved.date);
            monthSheet = sh0 ? sh0.getName() : "Календарь_Дат";
            var crmDirect = readCrmClientsForDate_(crmSs0, resolved.date);
            for (var cd = 0; cd < crmDirect.length; cd++) {
              if (isCancelledCalendarKey_(cancelledGuard, crmDirect[cd].client, crmDirect[cd].matchKey)) continue;
              upsertCalendarEntry_(ss, {
                date: resolved.date,
                client: displayClientNick_(crmDirect[cd].client) || crmDirect[cd].client,
                matchKey: crmDirect[cd].matchKey,
                segment: crmDirect[cd].segment || "",
                address: crmDirect[cd].address || "",
                phone: crmDirect[cd].phone || "",
                note: crmDirect[cd].note || "",
                source: "crm",
                status: "planned"
              });
            }
            calClients = readCalendarForDate_(ss, resolved.date);
          }
        } catch (eDirect) {}
      }
      for (var i = 0; i < calClients.length; i++) {
        var cc = calClients[i];
        var key = cc.matchKey || clientMatchKey_(cc.client);
        // на неделе уже есть — не дублируем справа
        if (key && already[key]) continue;
        // ложный pulled (пометили, а на лист не попал) — снова показываем справа
        var display = displayClientNick_(cc.client) || String(cc.client || "");
        var gaps = [];
        if (!String(cc.address || "").trim()) gaps.push("address");
        if (!String(cc.phone || "").trim() && !extractPhoneFromNote_(cc.note || "")) gaps.push("phone");
        // В Просмотре не тянем состав из ПП на каждый клик — это тормозит.
        // Состав подставится при «Сохранить переносы» / materialize.
        var basketCount = (cc.basket || []).length;
        if (!basketCount) gaps.push("basket");
        month.push({
          name: display,
          matchKey: key || "",
          segment: cc.segment || "",
          note: cc.note || "",
          address: cc.address || "",
          phone: cc.phone || extractPhoneFromNote_(cc.note || ""),
          basket: Array.isArray(cc.basket) ? cc.basket : [],
          basketCount: basketCount,
          basketHint: "",
          gaps: gaps,
          source: cc.source || "",
          ppPartner: cc.ppPartner || "",
          deliveryAfter: cc.deliveryAfter || "",
          deliveryBefore: cc.deliveryBefore || "",
          orderPrice: cc.orderPrice != null ? cc.orderPrice : "",
          ppSlot: cc.ppSlot || "",
          dogCount: basketHasDogSplit_(cc.basket) ? 2 : 1
        });
      }
    } catch (eM) {
      monthSheet = "";
      month = [];
    }
  }

  var ok = {
    status: "success",
    // если «Будущая» на другой дате — day пустой, чтобы UI не подтянул чужих через getClients
    day: showWeek ? (resolved.day || "") : "",
    targetDay: resolved.day || "",
    date: resolved.date ? dateKey_(resolved.date, tz) : "",
    dateIso: resolved.date ? isoDateKey_(resolved.date, tz) : "",
    dateNotInWeek: !!resolved.dateNotInWeek,
    futureSlot: !!resolved.futureSlot,
    futureDateMatches: resolved.futureDateMatches,
    monthSheet: monthSheet,
    calendar: true,
    calendarSeed: calendarSeed,
    week: week,
    month: month,
    weekCount: week.length,
    monthCount: month.length,
    syncedOrphans: syncedOrphans ? (Number(syncedOrphans.added) || 0) : 0
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/** Один клиент из календаря месяца → блок дня на «Прием заказов». */
function handlePullClientFromMonth(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var client = String((json && (json.client || json.nick)) || "").trim();
  if (!client) {
    var bad = { status: "error", message: "need_client" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var resolved = resolveViewDeliveryDate_(ss, json || {});
  // перенос: дату вне недели кладём на «Будущая неделя»
  if (resolved && resolved.date && (!resolved.day || resolved.futureSlot)) {
    var ensured = ensureFutureWeekForDate_(ss, resolved.date, true);
    if (ensured) resolved = ensured;
  }
  if (!resolved || !resolved.date || !resolved.day) {
    var no = {
      status: "error",
      message: (resolved && resolved.dateNotInWeek && !resolved.day) ? "date_not_in_week" : "need_day_or_date"
    };
    return fromPost ? jsonpText(callback, no) : jsonp(callback, no);
  }
  var pull = pullCrmClientsToDay_(ss, resolved.date, resolved.day, [{
    client: client,
    address: (json && json.address) || "",
    phone: (json && json.phone) || "",
    note: (json && json.note) || "",
    basket: (json && json.basket) || null
  }]);
  try { bustClientsCache_(); } catch (eB) {}
  var one = (pull.items && pull.items[0]) || {};
  var out = {
    status: pull.ok ? "success" : "error",
    outcome: one.outcome || pull.message || "",
    result: {
      ok: pull.ok,
      count: pull.added || 0,
      dayName: resolved.day,
      date: dateKey_(resolved.date, tz),
      outcome: one.outcome || "",
      detail: one.detail || "",
      items: pull.items || []
    },
    crm: pull.crm || null,
    day: resolved.day,
    date: dateKey_(resolved.date, tz),
    client: client
  };
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}

/** Пачка клиентов из месяца → день (черновик «Сохранить» в Просмотре). */
function handlePullClientsFromMonth(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var list = [];
  if (json && Array.isArray(json.clients)) list = json.clients;
  else if (json && typeof json.clients === "string") {
    try { list = JSON.parse(json.clients); } catch (eJ) { list = []; }
  }
  if (!list.length && json && (json.client || json.nick)) {
    list = [{ client: json.client || json.nick }];
  }
  if (!list.length) {
    var bad = { status: "error", message: "need_clients" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var normalized = [];
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    if (typeof it === "string") normalized.push({ client: String(it).trim() });
    else if (it && (it.client || it.name || it.nick)) {
      normalized.push({
        client: String(it.client || it.name || it.nick || "").trim(),
        address: it.address || "",
        phone: it.phone || "",
        note: it.note || "",
        basket: it.basket || null,
        segment: it.segment || "",
        ppPartner: it.ppPartner || "",
        ppSlot: it.ppSlot || "",
        deliverySlot: it.deliverySlot != null ? it.deliverySlot : ""
      });
    }
  }
  normalized = normalized.filter(function (x) { return x.client; });
  if (!normalized.length) {
    var bad2 = { status: "error", message: "need_clients" };
    return fromPost ? jsonpText(callback, bad2) : jsonp(callback, bad2);
  }
  var resolved = resolveViewDeliveryDate_(ss, json || {});
  if (resolved && resolved.date && (!resolved.day || resolved.futureSlot)) {
    var ensured2 = ensureFutureWeekForDate_(ss, resolved.date, true);
    if (ensured2) resolved = ensured2;
  }
  if (!resolved || !resolved.date || !resolved.day) {
    var no = {
      status: "error",
      message: (resolved && resolved.dateNotInWeek && !resolved.day) ? "date_not_in_week" : "need_day_or_date"
    };
    return fromPost ? jsonpText(callback, no) : jsonp(callback, no);
  }
  var pull = pullCrmClientsToDay_(ss, resolved.date, resolved.day, normalized);
  try { bustClientsCache_(); } catch (eB) {}
  var out = {
    status: pull.ok ? "success" : "error",
    result: pull,
    day: resolved.day,
    date: dateKey_(resolved.date, tz)
  };
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}

/**
 * Надёжный перенос: CRM → бронь (с revive cancelled) → день.
 * Если бронь не сматчилась — пишет напрямую из календаря месяца.
 */
function pullCrmClientsToDay_(ss, deliveryDate, dayName, clients) {
  var tz = ss.getSpreadsheetTimeZone();
  var dateStr = dateKey_(deliveryDate, tz);
  var crmSync = null;
  var forceNames = clients.map(function (c) { return c.client; });
  try {
    crmSync = syncCrmIntoBookings_(ss, deliveryDate, {
      forceClients: forceNames,
      reviveCancelled: true
    });
  } catch (eS) {
    crmSync = { ok: false, detail: String(eS) };
  }

  var weekKeys = {};
  try {
    var weekData = getClientsData_(ss, dayName);
    (weekData.clients || []).forEach(function (cl) {
      var k = clientMatchKey_(cl.name);
      if (k) weekKeys[k] = { name: cl.name, basketLen: (cl.basket || []).length };
    });
  } catch (eW) {}

  var items = [];
  var added = 0;
  var already = 0;
  var failed = 0;
  var crmSs = null;
  try { crmSs = getCrmSpreadsheet_(); } catch (eC) {}

  for (var i = 0; i < clients.length; i++) {
    var req = clients[i];
    var name = String(req.client || "").trim();
    var key = clientMatchKey_(name);
    var onWeek = key && weekKeys[key] ? weekKeys[key] : null;
    var earlyPpSlot = String(req.ppSlot || "").trim();
    if (!earlyPpSlot && req.deliverySlot != null && req.deliverySlot !== "") {
      var forcedEarly = parseForcedPpSlot_(req.deliverySlot, 2);
      if (forcedEarly >= 1) {
        var dnEarly = 2;
        try { dnEarly = lookupPpDeliveries_(name) || 2; } catch (eDnE) {}
        earlyPpSlot = formatPpSlotLabel_(forcedEarly, Math.max(dnEarly, 2));
      }
    }
    if (earlyPpSlot) req.ppSlot = earlyPpSlot;

    if (onWeek) {
      // уже на неделе (даже пустая оболочка) — НЕ открывать новый столбец
      var wroteMeta = false;
      if (req.address || req.phone || req.note || (req.basket && req.basket.length)) {
        writeBasketToDayColumn_(ss, dayName, onWeek.name || name, req.address, mergePullNote_(req), req.basket || [], {
          overwriteMeta: false
        });
        wroteMeta = true;
      }
      already++;
      items.push({ client: name, outcome: "already_on_week", detail: onWeek.name });
      // pulled только если реально есть состав/данные на неделе — иначе человек пропадёт из месяца
      if (wroteMeta || (onWeek.basketLen || 0) > 0) {
        try {
          upsertCalendarEntry_(ss, {
            date: deliveryDate,
            client: onWeek.name || name,
            matchKey: key,
            status: "pulled",
            source: "pull",
            ppPartner: String(req.ppPartner || "").trim(),
            ppSlot: String(req.ppSlot || "").trim(),
            segment: String(req.segment || "").trim()
          });
        } catch (eCalA) {}
        try { markPullPpSlotAnchor_(ss, name, req.ppSlot, deliveryDate); } catch (eMkA) {}
      }
      continue;
    }

    var basket = Array.isArray(req.basket) ? req.basket : null;
    var address = String(req.address || "").trim();
    var note = mergePullNote_(req);
    var segment = String(req.segment || "").trim();

    if ((!basket || !basket.length) && crmSs) {
      try {
        var crmList = readCrmClientsForDate_(crmSs, deliveryDate);
        var hit = null;
        for (var c = 0; c < crmList.length; c++) {
          if (nicksMatch_(crmList[c].client, name) || clientMatchKey_(crmList[c].client) === key) {
            hit = crmList[c];
            break;
          }
        }
        if (hit) {
          if (!address) address = hit.address || "";
          if (!segment) segment = hit.segment || "";
          if (!String(req.phone || "").trim() && hit.phone) {
            note = mergePullNote_({
              phone: hit.phone,
              note: [req.note, hit.note].filter(Boolean).join("; "),
              segment: segment
            });
          } else if (hit.note && (!req.note || String(req.note).indexOf(hit.note) < 0)) {
            note = mergePullNote_({
              phone: req.phone || hit.phone,
              note: [req.note, hit.note].filter(Boolean).join("; "),
              segment: segment
            });
          }
          var segFill = segment || hit.segment || "";
          if ((!basket || !basket.length) && segFill) {
            var filled = fillSubscriptionBasketForDate_(ss, crmSs, hit.client, segFill, deliveryDate);
            basket = filled.basket || [];
            // hint/слот — не в note; уйдут в Календарь при upsert ниже
            if (filled.ppSlot && !String(req.ppSlot || "").trim()) req.ppSlot = filled.ppSlot;
            if (filled.subId) req.subId = filled.subId;
          }
        }
      } catch (eFill) {}
    }

    // 1) через materialize (брони)
    var mat = materializeDeliveryDate_(ss, deliveryDate, {
      forceClient: name,
      onlyMissing: true,
      skipCrm: true
    });
    if (mat && mat.count > 0) {
      added += mat.count;
      if (key) weekKeys[key] = { name: name, basketLen: (basket && basket.length) || 1 };
      items.push({ client: name, outcome: "added", detail: "booking", count: mat.count });
      try {
        upsertCalendarEntry_(ss, {
          date: deliveryDate,
          client: name,
          matchKey: key,
          address: address,
          note: note,
          basket: basket || [],
          status: "pulled",
          source: "pull",
          ppPartner: String(req.ppPartner || "").trim(),
          ppSlot: String(req.ppSlot || "").trim(),
          segment: segment || ""
        });
      } catch (eCalM) {}
      try { markPullPpSlotAnchor_(ss, name, req.ppSlot, deliveryDate); } catch (eMkM) {}
      continue;
    }

    // 2) напрямую в столбец дня
    var write = writeBasketToDayColumn_(ss, dayName, name, address, note, basket || [], {
      skipIfHasQty: false
    });
    if (write && write.ok && !write.skipped) {
      added++;
      if (key) weekKeys[key] = { name: name, basketLen: (basket && basket.length) || (write.shell ? 0 : 1) };
      items.push({
        client: name,
        outcome: write.shell ? "shell" : (write.created ? "added" : "updated"),
        detail: write.shell ? "no_basket" : "direct",
        col: write.col
      });
      try {
        upsertCalendarEntry_(ss, {
          date: deliveryDate,
          client: name,
          matchKey: key,
          address: address,
          note: note,
          basket: basket || [],
          status: "pulled",
          source: "pull",
          ppPartner: String(req.ppPartner || "").trim(),
          ppSlot: String(req.ppSlot || "").trim(),
          segment: segment || ""
        });
      } catch (eCalW) {}
      try { markPullPpSlotAnchor_(ss, name, req.ppSlot, deliveryDate); } catch (eMkW) {}
      continue;
    }

    failed++;
    items.push({
      client: name,
      outcome: (write && write.message === "no_free_columns") ? "no_free_columns" : "not_found",
      detail: (write && write.message) || (mat && mat.message) || "no_booking_or_crm"
    });
  }

  return {
    ok: failed === 0 || added > 0,
    date: dateStr,
    dayName: dayName,
    added: added,
    already: already,
    failed: failed,
    count: added,
    items: items,
    crm: crmSync
  };
}

function mergePullNote_(req) {
  req = req || {};
  // только человеческий текст — SEG/TEL/hint не в note
  return stripTechFromNote_(req.note || "");
}

/** Явный слот при переносе с календаря → якорь ПП 1/2. */
function markPullPpSlotAnchor_(ss, clientName, ppSlotLabel, dateValue) {
  var label = String(ppSlotLabel || "").trim();
  if (!clientName || !label) return;
  var dn = lookupPpDeliveries_(clientName);
  if (!(dn >= 2)) return;
  var slot = parseForcedPpSlot_(label, dn);
  if (!(slot >= 1)) return;
  markPpSlotAnchor_(ss, clientName, slot, dateValue);
}

function handleEnsureDayMaterialized(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var dayHint = String(json.day || "").trim();
  var deliveryDate = parseFlexibleDate_(json.deliveryDate || json.date, tz);
  // Если переданы и дата, и день — сверяем. Несовпадение / дата не в неделе → день из листа.
  if (deliveryDate) {
    var byDate = findDayNameForDate_(ss, deliveryDate);
    if (byDate) {
      if (dayHint && byDate !== dayHint) {
        // явный день важнее «залетевшей» даты
        var dayDate = getDayDate_(ss, dayHint);
        var parsedDayDate = parseFlexibleDate_(dayDate, tz);
        if (parsedDayDate) deliveryDate = parsedDayDate;
      }
    } else if (dayHint) {
      var d2 = parseFlexibleDate_(getDayDate_(ss, dayHint), tz);
      if (d2) deliveryDate = d2;
      else {
        var badDate = { status: "error", result: { ok: false, message: "date_not_in_week", date: dateKey_(deliveryDate, tz) } };
        return fromPost ? jsonpText(callback, badDate) : jsonp(callback, badDate);
      }
    } else {
      var badDate2 = { status: "error", result: { ok: false, message: "date_not_in_week", date: dateKey_(deliveryDate, tz) } };
      return fromPost ? jsonpText(callback, badDate2) : jsonp(callback, badDate2);
    }
  } else if (dayHint) {
    deliveryDate = getDayDate_(ss, dayHint);
    if (deliveryDate && !(deliveryDate instanceof Date)) {
      deliveryDate = parseFlexibleDate_(deliveryDate, tz);
    }
  }
  if (!deliveryDate) {
    var need = { status: "error", result: { ok: false, message: "need_day_or_date" } };
    return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
  }
  var onlyMissing = !(json.onlyMissing === false || json.onlyMissing === "0" || json.onlyMissing === 0 || json.onlyMissing === "false");
  var result = materializeDeliveryDate_(ss, deliveryDate, { onlyMissing: onlyMissing });
  try { bustClientsCache_(); } catch (eB) {}
  var out = { status: result.ok ? "success" : "error", result: result };
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}

/** Даты Пн–Вс текущей операционной недели из «Прием заказов». */
function getWeekDayDates_(ss) {
  var tz = ss.getSpreadsheetTimeZone();
  var manager = ss.getSheetByName("Прием заказов");
  var names = MANAGER_DAY_NAMES_;
  var out = [];
  if (!manager) return out;
  try { ensureManagerWeekendBlocks_(ss); } catch (eE) {}
  for (var i = 0; i < names.length; i++) {
    var raw = manager.getRange(MANAGER_DATE_CELLS[i]).getValue();
    var d = parseFlexibleDate_(raw, tz);
    out.push({
      day: names[i],
      date: d ? dateKey_(d, tz) : "",
      dateObj: d || null
    });
  }
  return out;
}

function materializeCurrentWeek_(ss, opts) {
  opts = opts || {};
  var onlyMissing = !(opts.onlyMissing === false || opts.onlyMissing === "0" || opts.onlyMissing === 0 || opts.onlyMissing === "false");
  var days = getWeekDayDates_(ss);
  var results = [];
  var total = 0;
  var weekKey = "";
  for (var i = 0; i < days.length; i++) {
    if (!weekKey && days[i].date) weekKey = days[i].date;
    if (!days[i].dateObj) {
      results.push({ day: days[i].day, ok: false, message: "no_date" });
      continue;
    }
    var r = materializeDeliveryDate_(ss, days[i].dateObj, { onlyMissing: onlyMissing });
    total += Number(r.count) || 0;
    results.push(r);
  }
  if (opts.includeFuture === true || opts.includeFuture === "1" || opts.includeFuture === "true") {
    var future = ss.getSheetByName("Будущая неделя");
    if (future) {
      var tz = ss.getSpreadsheetTimeZone();
      var fd = parseFlexibleDate_(future.getRange("A1").getValue(), tz);
      if (fd) {
        var fr = materializeDeliveryDate_(ss, fd, { onlyMissing: onlyMissing });
        total += Number(fr.count) || 0;
        results.push(fr);
      }
    }
  }
  var isoWeek = currentWeekKeyServer_();
  return { ok: true, weekKey: isoWeek, weekKeyLegacy: weekKey, totalAdded: total, onlyMissing: onlyMissing, days: results };
}

function handleMaterializeWeek(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = materializeCurrentWeek_(ss, json || {});
  var out = { status: "success", result: result };
  try {
    var wkM = normalizeWeekBannerKey_((json && json.weekKey) || "") || currentWeekKeyServer_();
    writeWeekBannerState_(wkM, { pulled: true, pulledAt: new Date().toISOString(), finished: true });
    if (result) result.weekKey = wkM;
  } catch (eM) {}
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}

function handleResolveDayForDate(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var d = parseFlexibleDate_(json.date || json.deliveryDate, tz);
  var dayName = d ? (findDayNameForDate_(ss, d) || "") : "";
  var beyondWeek = !!(d && !dayName);
  // НЕ подставлять «Будущая неделя» для дат дальше A1 — иначе двойная запись (календарь + чужой лист)
  var out = {
    status: "success",
    date: d ? dateKey_(d, tz) : "",
    dayName: dayName,
    onWeek: !!dayName,
    futureTarget: false,
    beyondWeek: beyondWeek
  };
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}

function weekPullSnapshot_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var days = getWeekDayDates_(ss);
  var crmSs = null;
  try { crmSs = getCrmSpreadsheet_(); } catch (e) {}
  var weekKey = "";
  var list = [];
  var monthPeople = 0;
  var weekPeople = 0;
  var missingEstimate = 0;
  for (var i = 0; i < days.length; i++) {
    if (!weekKey && days[i].date) weekKey = days[i].date;
    var inWeek = 0;
    try {
      var wd = getClientsData_(ss, days[i].day);
      inWeek = (wd.clients || []).length;
    } catch (e2) {}
    weekPeople += inWeek;
    var inMonth = 0;
    if (crmSs && days[i].dateObj) {
      try { inMonth = readCrmClientsForDate_(crmSs, days[i].dateObj).length; } catch (e3) {}
    }
    monthPeople += inMonth;
    var miss = Math.max(0, inMonth - inWeek);
    missingEstimate += miss;
    list.push({
      day: days[i].day,
      date: days[i].date,
      inWeek: inWeek,
      inMonth: inMonth,
      maybeMissing: miss
    });
  }
  // Посуточный maybeMissing часто > 0 даже когда итоги равны (люди на других днях / CRM≠лист).
  // Баннер «Подтянуть» — только если неделя пустая или по сумме в месяце явно больше, чем на неделе.
  var suggestPull = !!(weekKey && monthPeople > 0 && (weekPeople === 0 || weekPeople < monthPeople));
  return {
    weekKey: currentWeekKeyServer_(),
    weekKeyLegacy: weekKey,
    days: list,
    weekPeople: weekPeople,
    monthPeople: monthPeople,
    maybeMissing: missingEstimate,
    suggestPull: suggestPull
  };
}

function handleWeekPullStatus(json, callback, fromPost) {
  var snap = weekPullSnapshot_();
  var ok = {
    status: "success",
    weekKey: snap.weekKey,
    days: snap.days,
    weekPeople: snap.weekPeople,
    monthPeople: snap.monthPeople,
    maybeMissing: snap.maybeMissing,
    suggestPull: snap.suggestPull
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function notifyCuttersVolumeIncrease_(deliveryDate, client, lines) {
  if (!lines || !lines.length) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var text =
    "WARNING late cut volume increase\n" +
    "Delivery: " + dateKey_(deliveryDate, tz) + "\n" +
    "Client: " + client + "\n\n" +
    lines.join("\n") +
    "\n\nChange within 12h before prep-day end.";
  // Russian header for cutters:
  text =
    "Срочно: увеличение объёма нарезки\n" +
    "Доставка: " + dateKey_(deliveryDate, tz) + "\n" +
    "Клиент: " + client + "\n\n" +
    lines.join("\n") +
    "\n\nПравка менее чем за 12ч до конца дня подготовки.";
  var ids = getCutterNotifyChatIds_();
  for (var i = 0; i < ids.length; i++) {
    try { telegramSendText_(ids[i], text); } catch (e) {}
  }
  var chat = PropertiesService.getScriptProperties().getProperty("TELEGRAM_CHAT_ID");
  if (chat) {
    try { telegramSendText_(chat, text); } catch (e2) {}
  }
}

function getCutterNotifyChatIds_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("CUTTER_TELEGRAM_IDS") || "";
  var ids = raw.split(/[,;\s]+/).map(function (s) { return String(s || "").trim(); }).filter(Boolean);
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Доступы");
    if (sh && sh.getLastRow() > 1) {
      var data = sh.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var role = String(data[i][3] || "").toLowerCase();
        var status = String(data[i][4] || "").toLowerCase();
        if ((role === "cutter" || role === "owner") && (status === "active" || !status)) {
          var id = String(data[i][0] || "").trim();
          if (id && ids.indexOf(id) < 0) ids.push(id);
        }
      }
    }
  } catch (e) {}
  return ids;
}

function morningMaterializeTomorrow() {
  var now = new Date();
  var tomorrow = addDaysDate_(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = materializeDeliveryDate_(ss, tomorrow, {});
  Logger.log(JSON.stringify(result));
  return result;
}

function handleSetupBookingTriggers(callback, fromPost) {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "morningMaterializeTomorrow") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("morningMaterializeTomorrow").timeBased().atHour(7).everyDays(1).create();
  var nudge = null;
  try { nudge = ensureDeliveryDatesNudgeTriggers_(); } catch (eN) { nudge = { ok: false, error: String(eN) }; }
  var ok = {
    status: "success",
    trigger: "morningMaterializeTomorrow@07:00",
    deliveryDatesNudge: nudge
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function setupBookingTriggersManual() {
  handleSetupBookingTriggers("cb", true);
}

/* ========== CRM календарь месяца → Брони_Заказов ========== */

var CRM_SPREADSHEET_ID_DEFAULT_ = "12caHgzEa2f8DkpQilwKCddxrLXVmI0-CBX1Qa-9fWng";
var CRM_MONTH_NAMES_RU_ = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

/**
 * Лист по каноническому имени или «Имя (копия)» — после Copy-to spreadsheet Google так называет вкладки.
 */
function sheetLooksLikeCrmSubs_(sh) {
  if (!sh || sh.getLastRow() < 1) return false;
  try {
    var h = String(sh.getRange(1, 1).getValue() || "").toUpperCase().replace(/ё/g, "Е");
    if (/ЛЮДИ|ЛАКОМ|ПОДПИС|НИК/.test(h)) return true;
    var h2 = String(sh.getRange(1, 2).getValue() || "").toUpperCase();
    if (/ID|ПОДПИС/.test(h2)) return true;
  } catch (eH) {}
  return false;
}

function findSheetByBaseName_(ss, baseName) {
  if (!ss || !baseName) return null;
  var candidates = [];
  var exact = ss.getSheetByName(baseName);
  if (exact) candidates.push(exact);
  var copyRu = ss.getSheetByName(baseName + " (копия)");
  if (copyRu) candidates.push(copyRu);
  var copyEn = ss.getSheetByName(baseName + " (copy)");
  if (copyEn) candidates.push(copyEn);
  var want = String(baseName).toUpperCase().replace(/ё/g, "Е");
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = String(sheets[i].getName() || "").toUpperCase().replace(/ё/g, "Е");
    if (n === want || n === want + " (КОПИЯ)" || n === want + " (COPY)") {
      if (candidates.indexOf(sheets[i]) < 0) candidates.push(sheets[i]);
    }
  }
  var crmNames = { "ПП": 1, "АФК": 1, "БП": 1, "Контакты": 1, "Опросник": 1 };
  if (crmNames[String(baseName)] && candidates.length > 1) {
    for (var c = 0; c < candidates.length; c++) {
      if (sheetLooksLikeCrmSubs_(candidates[c])) return candidates[c];
    }
  }
  if (candidates.length) if (crmNames[baseName] && candidates.length > 1) {
    var best = null;
    var bestCols = -1;
    var bestArea = -1;
    var k;
    var anyCrm = false;
    var crmBest = null;
    var crmBestCols = -1;
    var crmBestArea = -1;
    for (k = 0; k < candidates.length; k++) {
      var shCand = candidates[k];
      var cols = 0;
      var rows = 0;
      try { cols = Number(shCand.getLastColumn()) || 0; } catch (eCols) { cols = 0; }
      try { rows = Number(shCand.getLastRow()) || 0; } catch (eRows) { rows = 0; }
      var area = rows * cols;
      var looksCrm = false;
      try { looksCrm = !!sheetLooksLikeCrmSubs_(shCand); } catch (eLook) { looksCrm = false; }
      if (looksCrm) {
        anyCrm = true;
        if (cols > crmBestCols || (cols === crmBestCols && area > crmBestArea)) {
          crmBestCols = cols;
          crmBestArea = area;
          crmBest = shCand;
        }
      }
      if (cols > bestCols || (cols === bestCols && area > bestArea)) {
        bestCols = cols;
        bestArea = area;
        best = shCand;
      }
    }
    if (anyCrm && crmBest) return crmBest;
    if (best) return best;
  }
  return candidates[0];
  return null;
}

function hasLocalCrmSheets_(ss) {
  return !!(findSheetByBaseName_(ss, "Контакты") || findSheetByBaseName_(ss, "ПП") ||
    findSheetByBaseName_(ss, "АФК") || findSheetByBaseName_(ss, "БП") ||
    findSheetByBaseName_(ss, "Июль") || findSheetByBaseName_(ss, "Январь") ||
    findSheetByBaseName_(ss, "Август"));
}

/**
 * Один раз в Script Editor: убрать суффикс « (копия)» у CRM-листов в чистовике
 * (только если канонического имени ещё нет — ничего не затирает).
 */
function renameCrmCopiesToCanonical() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var bases = ["Контакты", "ПП", "АФК", "БП", "Опросник"].concat(CRM_MONTH_NAMES_RU_);
  var renamed = [];
  var skipped = [];
  for (var i = 0; i < bases.length; i++) {
    var base = bases[i];
    var copy = ss.getSheetByName(base + " (копия)") || ss.getSheetByName(base + " (copy)");
    if (!copy) continue;
    if (ss.getSheetByName(base)) {
      skipped.push(base + " (копия) — канон уже есть");
      continue;
    }
    copy.setName(base);
    renamed.push(base);
  }
  var msg = "renamed=" + renamed.join(", ") + (skipped.length ? "; skipped=" + skipped.join("; ") : "");
  Logger.log(msg);
  return msg;
}

function getCrmSpreadsheetId_() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty("CRM_SPREADSHEET_ID") || CRM_SPREADSHEET_ID_DEFAULT_;
}

function getCrmSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Чистовик: CRM здесь (в т.ч. листы «… (копия)» после переноса)
  if (hasLocalCrmSheets_(ss)) return ss;
  var forceExternal = PropertiesService.getScriptProperties().getProperty("CRM_FORCE_EXTERNAL");
  if (forceExternal === "1" || forceExternal === "true") {
    return SpreadsheetApp.openById(getCrmSpreadsheetId_());
  }
  // старая книга — только если в чистовике CRM нет
  try {
    return SpreadsheetApp.openById(getCrmSpreadsheetId_());
  } catch (e) {
    return ss;
  }
}

var CLIENTS_HEADERS_ = ["nick", "address", "phone", "note", "updatedAt", "source", "lastBasket"];

function getClientsProfilesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Клиенты");
  if (!sh) {
    sh = ss.insertSheet("Клиенты");
    sh.getRange(1, 1, 1, CLIENTS_HEADERS_.length).setValues([CLIENTS_HEADERS_]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function upsertClientProfile_(ss, nick, address, phone, note, source, lastBasket) {
  nick = String(nick || "").trim();
  if (!nick) return;
  var sh = getClientsProfilesSheet_();
  ensureClientsBasketCol_(sh);
  var data = sh.getDataRange().getValues();
  var want = nick.toUpperCase();
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim().toUpperCase() === want) {
      rowIdx = i + 1;
      break;
    }
  }
  var cleanNote = String(note || "")
    .replace(/\[TEL:[^\]]+\]/gi, "")
    .replace(/\[GEO:[^\]]+\]/gi, "")
    .replace(/\[YMAPS:[^\]]+\]/gi, "")
    .replace(/\[НЕ РЕЗАТЬ\]/gi, "")
    .replace(/\[РЕЗАТЬ\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  var basketJson = "";
  if (lastBasket && Object.prototype.toString.call(lastBasket) === "[object Array]" && lastBasket.length) {
    try { basketJson = JSON.stringify(lastBasket); } catch (eB) { basketJson = ""; }
  } else if (rowIdx > 0) {
    basketJson = String(data[rowIdx - 1][6] || "");
  }
  var vals = [
    nick,
    String(address != null ? address : (rowIdx > 0 ? data[rowIdx - 1][1] : "") || ""),
    String(phone != null ? phone : (rowIdx > 0 ? data[rowIdx - 1][2] : "") || ""),
    cleanNote || (rowIdx > 0 ? String(data[rowIdx - 1][3] || "") : ""),
    new Date(),
    String(source || "retail"),
    basketJson
  ];
  if (rowIdx > 0) {
    if (!vals[1]) vals[1] = String(data[rowIdx - 1][1] || "");
    if (!vals[2]) vals[2] = String(data[rowIdx - 1][2] || "");
    if (!vals[3]) vals[3] = String(data[rowIdx - 1][3] || "");
    if (!vals[6]) vals[6] = String(data[rowIdx - 1][6] || "");
    sh.getRange(rowIdx, 1, 1, CLIENTS_HEADERS_.length).setValues([vals]);
  } else {
    sh.appendRow(vals);
  }
}

function ensureClientsBasketCol_(sh) {
  try {
    var h = String(sh.getRange(1, 7).getValue() || "").trim();
    if (h.toLowerCase().indexOf("basket") < 0 && h.toLowerCase().indexOf("состав") < 0) {
      sh.getRange(1, 7).setValue("lastBasket");
    }
  } catch (e) {}
}

function extractPhoneFromNote_(note) {
  var s = String(note || "");
  var mTel = s.match(/\[TEL:([^\]]+)\]/i);
  if (mTel) return String(mTel[1] || "").trim();
  var m = s.match(/(\+?375[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})/);
  return m ? m[1].replace(/\s+/g, "") : "";
}

function applyTelTag_(note, phone) {
  // устарело: телефон только в поле phone / «Клиенты» — тег [TEL:] из примечания убираем
  return String(note || "").replace(/\[TEL:[^\]]+\]/gi, "").replace(/\s{2,}/g, " ").trim();
}

/** Техтеги и авто-хинты ПП — не в ячейку note / не в UI «примечание». */
function stripTechFromNote_(note) {
  return stripGeoTagsFromNote_(String(note || "")
    .replace(/\[TEL:[^\]]+\]/gi, "")
    .replace(/\[SEG:[^\]]*\]/gi, "")
    .replace(/\[ЦЕНА:[^\]]*\]/gi, "")
    .replace(/\[SUB:[^\]]*\]/gi, "")
    .replace(/\[PAID:[^\]]*\]/gi, "")
    .replace(/\[ПП[^\]]*\]/gi, "")
    .replace(/ПП\s*N\s*=\s*\d+[^\n|[]*/gi, "")
    .replace(/ПП:\s*состав[^\n|[]*/gi, "")
  ).replace(/\s*\|\|\s*/g, " || ").replace(/\s{2,}/g, " ").trim();
}

function extractOrderPriceFromNote_(note) {
  var m = String(note || "").match(/\[ЦЕНА:\s*([0-9]+(?:[.,][0-9]+)?)\s*BYN?\]/i);
  if (!m) return "";
  var n = Number(String(m[1]).replace(",", "."));
  return isNaN(n) ? "" : n;
}

function extractSegmentFromNote_(note) {
  var m = String(note || "").match(/\[SEG:([^\]]+)\]/i);
  return m ? String(m[1] || "").trim().toUpperCase() : "";
}

function extractSubIdFromNote_(note) {
  var m = String(note || "").match(/\[SUB:([^\]]+)\]/i);
  return m ? String(m[1] || "").trim() : "";
}

/** bp|pp|retail|partner → метка сегмента для колонки. */
function segmentLabelFromOrderType_(ot) {
  ot = String(ot || "").trim().toLowerCase();
  if (ot === "bp" || ot === "бп") return "БП";
  if (ot === "pp" || ot === "пп" || ot === "subscription" || ot === "afk") return "ПП";
  if (ot === "partner" || ot.indexOf("парт") === 0) return "ПАРТНЁР";
  if (ot === "retail" || ot === "розница") return "Р";
  return "";
}

function formatPpSlotLabel_(slot, deliveriesN) {
  slot = Number(slot) || 0;
  deliveriesN = Number(deliveriesN) || 0;
  // без N с листа ПП — не выдумывать «1» (иначе у всех в Курьере бейдж ПП 1)
  if (deliveriesN < 1) return "";
  if (deliveriesN >= 2 && slot >= 1) return String(slot) + "/" + deliveriesN;
  if (deliveriesN === 1) return "1";
  return slot >= 1 ? String(slot) : "";
}

/** Разбор ручного слота: 1 | 2 | "1/2" → номер слота. */
function parseForcedPpSlot_(raw, deliveriesN) {
  if (raw == null || raw === "") return 0;
  var s = String(raw).trim();
  var m = s.match(/(\d+)\s*\/\s*\d+/);
  if (m) {
    var a = Number(m[1]) || 0;
    if (a >= 1) return Math.min(a, Math.max(1, Number(deliveriesN) || 2));
  }
  var n = Number(s.replace(/[^\d]/g, ""));
  if (n >= 1) return Math.min(n, Math.max(1, Number(deliveriesN) || 2));
  return 0;
}

/** Дописать недостающие заголовки в конец строки 1 (данные не сдвигаем). */
function ensureSheetHeadersAppend_(sh, headers) {
  if (!sh || !headers || !headers.length) return;
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var cur = sh.getRange(1, 1, 1, Math.max(lastCol, headers.length)).getValues()[0];
  var needWrite = false;
  for (var i = 0; i < headers.length; i++) {
    if (String(cur[i] || "").trim() !== headers[i]) {
      needWrite = true;
      break;
    }
  }
  if (needWrite) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  try { sh.setFrozenRows(1); } catch (eF) {}
}

function lookupClientProfilePhone_(ss, nick) {
  nick = String(nick || "").trim();
  if (!nick) return "";
  try {
    var sh = getClientsProfilesSheet_();
    var data = sh.getDataRange().getValues();
    var wantKey = clientMatchKey_(nick) || nick.toUpperCase();
    var wantU = nick.toUpperCase();
    for (var i = 1; i < data.length; i++) {
      var n = String(data[i][0] || "").trim();
      if (!n) continue;
      if (n.toUpperCase() === wantU || nicksMatch_(n, nick) ||
          (wantKey && clientMatchKey_(n) === wantKey)) {
        return String(data[i][2] || "").trim();
      }
    }
  } catch (e) {}
  return "";
}

function buildClientPhoneIndex_(ss) {
  try {
    if (_memoPhoneIndex_ && _memoPhoneIndexSs_ === ss) return _memoPhoneIndex_;
  } catch (e0) {}
  var idx = {};
  try {
    var sh = getClientsProfilesSheet_();
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var n = String(data[i][0] || "").trim();
      var ph = String(data[i][2] || "").trim();
      if (!n || !ph) continue;
      var k = clientMatchKey_(n) || n.toUpperCase();
      if (k) idx[k] = ph;
      idx[n.toUpperCase()] = ph;
    }
  } catch (e) {}
  _memoPhoneIndex_ = idx;
  try { _memoPhoneIndexSs_ = ss; } catch (e1) {}
  return idx;
}
var _memoPhoneIndex_ = null;
var _memoPhoneIndexSs_ = null;

function handleFindClientMatch(json, callback, fromPost) {
  // быстрый поиск только по листу «Клиенты» (без обхода недели/CRM)
  var q = String(json.q || json.client || json.nick || "").trim();
  if (q.length < 1) {
    var empty = { status: "success", match: null, matches: [] };
    return fromPost ? jsonpText(callback, empty) : jsonp(callback, empty);
  }
  var qU = q.toUpperCase().replace(/\s+/g, " ");
  var matches = [];
  try {
    var sh = getClientsProfilesSheet_();
    ensureClientsBasketCol_(sh);
    var data = sh.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      var nick = String(data[r][0] || "").trim();
      if (!nick) continue;
      var nU = nick.toUpperCase().replace(/\s+/g, " ");
      var score = 0;
      if (nU === qU) score = 100;
      else if (nU.indexOf(qU) === 0) score = 92;
      else if (nU.indexOf(qU) >= 0) score = 78;
      else {
        var words = nU.split(/[\s._\-@]+/);
        for (var w = 0; w < words.length; w++) {
          if (words[w].indexOf(qU) === 0) { score = 85; break; }
          if (words[w].indexOf(qU) >= 0) { score = Math.max(score, 70); }
        }
      }
      if (score <= 0 && qU.length >= 2) {
        var qi = 0;
        for (var j = 0; j < nU.length && qi < qU.length; j++) {
          if (nU.charAt(j) === qU.charAt(qi)) qi++;
        }
        if (qi === qU.length) score = 55;
      }
      if (score > 0) {
        var bask = [];
        try { bask = JSON.parse(String(data[r][6] || "[]")); } catch (eB) { bask = []; }
        matches.push({
          nick: nick,
          address: String(data[r][1] || ""),
          phone: String(data[r][2] || ""),
          note: String(data[r][3] || ""),
          source: String(data[r][5] || "Клиенты"),
          basket: bask,
          score: score
        });
      }
    }
  } catch (e1) {}
  matches.sort(function (a, b) { return b.score - a.score; });
  var best = matches.length ? matches[0] : null;
  if (best) {
    best = {
      nick: best.nick,
      address: best.address || "",
      phone: best.phone || "",
      note: String(best.note || "").replace(/\[TEL:[^\]]+\]/gi, "").replace(/\[GEO:[^\]]+\]/gi, "").replace(/\[YMAPS:[^\]]+\]/gi, "").trim(),
      source: best.source,
      basket: best.basket || []
    };
  }
  var ok = {
    status: "success",
    match: best,
    matches: matches.slice(0, 8).map(function (m) {
      return { nick: m.nick, address: m.address, phone: m.phone, note: m.note, source: m.source, basket: m.basket || [] };
    })
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleListClientProfiles(json, callback, fromPost) {
  var out = [];
  try {
    var sh = getClientsProfilesSheet_();
    ensureClientsBasketCol_(sh);
    var data = sh.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      var nick = String(data[r][0] || "").trim();
      if (!nick) continue;
      var bask = [];
      try { bask = JSON.parse(String(data[r][6] || "[]")); } catch (e) { bask = []; }
      out.push({
        nick: nick,
        address: String(data[r][1] || ""),
        phone: String(data[r][2] || ""),
        note: String(data[r][3] || ""),
        source: String(data[r][5] || ""),
        basket: bask
      });
    }
  } catch (e2) {}
  var ok = { status: "success", clients: out };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function parseCrmCalendarCell_(text) {
  var lines = String(text || "").split(/\r?\n/).map(function (x) {
    return String(x || "").trim();
  }).filter(function (x) { return x; });
  if (!lines.length) return null;
  if (/^\d+$/.test(lines[0]) && lines.length === 1) return null;
  var startIdx = 0;
  var nickLine = lines[0];
  // «варка» / «только» / «написать» — метка партнёра, не ник; ник на следующей строке
  if (/^(варка|только|написать)\b/i.test(nickLine)) {
    if (lines.length < 2) return null;
    startIdx = 1;
    nickLine = lines[1];
  }
  var extracted = extractInstagramNick_(nickLine);
  var display = displayClientNick_(nickLine);
  if ((!display || display.length < 2) && extracted) display = extracted;
  if (!display || display.length < 2) return null;
  if (/^(варка|только|написать)$/i.test(display) && lines.length > startIdx + 1) {
    nickLine = lines[startIdx + 1];
    extracted = extractInstagramNick_(nickLine);
    display = displayClientNick_(nickLine) || extracted;
    startIdx++;
  }
  // партнёры с припиской «варка» — полное имя строки
  if (/\bварка\b/i.test(nickLine) && display !== nickLine) {
    display = displayClientNick_(nickLine) || nickLine;
  }
  var segment = "";
  var address = "";
  var phone = "";
  var noteBits = [];
  if (/^варка\b/i.test(lines[0])) noteBits.push("варка");
  for (var i = startIdx + 1; i < lines.length; i++) {
    var ln = lines[i];
    var segM = ln.match(/\b(АФК|ПП|БП|Р|ПАРТН[ЁЕ]?Р|PARTNER|РОЗНИЦА)\b/i);
    if (segM && !segment) {
      segment = segM[1].toUpperCase();
      if (segment.indexOf("ПАРТ") === 0 || segment === "PARTNER") segment = "ПАРТНЁР";
      if (segment === "РОЗНИЦА") segment = "Р";
      var rest = ln.replace(/\b(АФК|ПП|БП|Р|ПАРТН[ЁЕ]?Р|PARTNER|РОЗНИЦА)\b/i, "").trim();
      if (rest) noteBits.push(rest);
      continue;
    }
    if (/^\+?\d[\d\s\-()]{6,}/.test(ln) || (/^\d{9,}$/.test(ln.replace(/\D/g, "")) && ln.replace(/\D/g, "").length >= 9)) {
      phone = ln;
      continue;
    }
    if (!address && /[а-яА-Яa-zA-Z]/.test(ln) && !/^\d+\s*$/.test(ln)) {
      address = ln;
      continue;
    }
    noteBits.push(ln);
  }
  // варка / партнёр — отдельный тип; без метки сегмента НЕ угадываем ПП
  if (!segment && (/варка/i.test(lines[0]) || /партн/i.test(noteBits.join(" ")))) {
    segment = "ПАРТНЁР";
  }
  return {
    client: display,
    // важно: ключ от полного display (Veta.foto Дэни ≠ Veta.foto Пэни), не от голого @handle
    matchKey: clientMatchKey_(display || nickLine),
    address: address,
    phone: phone,
    segment: segment,
    note: noteBits.join("; ")
  };
}

/** Строка-шапка дней: много чисел 1–31 и почти нет ников. */
function isCrmDayHeaderRow_(rowVals) {
  var dayHits = 0;
  var nickHits = 0;
  for (var c = 0; c < rowVals.length; c++) {
    var raw = rowVals[c];
    var s = String(raw == null ? "" : raw).trim();
    if (!s) continue;
    var dn = headerDayNumber_(raw);
    // чистый номер дня (не «28 июля» длинной строкой с адресом)
    if (isFinite(dn) && dn >= 1 && dn <= 31 && s.length <= 5 && !/\n/.test(s)) {
      dayHits++;
      continue;
    }
    if (parseCrmCalendarCell_(raw)) nickHits++;
  }
  return dayHits >= 3 && dayHits >= nickHits;
}

/**
 * Блоки календаря месяца: шапка дней + строки людей до следующей шапки.
 * На «Июль (копия)» бывает 2 блока: сверху 1/3/6… и ниже 2/7/9…/28/30.
 */
function findCrmMonthDayBlocks_(data) {
  var headerRows = [];
  for (var r = 0; r < data.length; r++) {
    if (isCrmDayHeaderRow_(data[r])) headerRows.push(r);
  }
  if (!headerRows.length && data.length) {
    var anyDay = false;
    for (var c0 = 0; c0 < data[0].length; c0++) {
      var d0 = headerDayNumber_(data[0][c0]);
      if (isFinite(d0) && d0 >= 1 && d0 <= 31) { anyDay = true; break; }
    }
    if (anyDay) headerRows = [0];
  }
  var blocks = [];
  for (var i = 0; i < headerRows.length; i++) {
    var hr = headerRows[i];
    var dataEnd = (i + 1 < headerRows.length) ? (headerRows[i + 1] - 1) : (data.length - 1);
    var dayToCol = {};
    var row = data[hr] || [];
    for (var c = 0; c < row.length; c++) {
      var dn = headerDayNumber_(row[c]);
      var s = String(row[c] == null ? "" : row[c]).trim();
      if (isFinite(dn) && dn >= 1 && dn <= 31 && s.length <= 5) dayToCol[dn] = c;
    }
    blocks.push({
      headerRow: hr,
      dataStart: hr + 1,
      dataEnd: dataEnd,
      dayToCol: dayToCol
    });
  }
  return blocks;
}

/** Сколько «живых» ячеек-ников на листе месяца (все блоки дней). */
function scoreCrmMonthSheet_(sh) {
  if (!sh) return -1;
  try {
    var lastCol = Math.max(1, sh.getLastColumn());
    var lastRow = Math.max(1, sh.getLastRow());
    if (lastRow < 2 || lastCol < 1) return 0;
    var data = sh.getRange(1, 1, lastRow, lastCol).getValues();
    var blocks = findCrmMonthDayBlocks_(data);
    var nicks = 0;
    for (var b = 0; b < blocks.length; b++) {
      var bl = blocks[b];
      for (var day in bl.dayToCol) {
        if (!bl.dayToCol.hasOwnProperty(day)) continue;
        var col = bl.dayToCol[day];
        for (var r = bl.dataStart; r <= bl.dataEnd; r++) {
          if (parseCrmCalendarCell_((data[r] || [])[col])) nicks++;
        }
      }
    }
    return nicks;
  } catch (e) {
    return 0;
  }
}

/**
 * Лист месяца: предпочитаем тот, где реально стоят люди.
 * Важно: «Июль» может быть битым/пустым, а «Июль (копия)» — рабочим календарём.
 */
function resolveCrmMonthSheet_(crmSs, deliveryDate) {
  if (!crmSs || !deliveryDate) return null;
  var monthName = CRM_MONTH_NAMES_RU_[deliveryDate.getMonth()];
  var year = deliveryDate.getFullYear();
  var wantBase = monthName.toUpperCase().replace(/ё/g, "Е");
  var yearShort = String(year).slice(-2);
  var sheets = crmSs.getSheets();
  var pool = [];
  for (var s = 0; s < sheets.length; s++) {
    var title = String(sheets[s].getName() || "").trim();
    var tU = title.toUpperCase().replace(/ё/g, "Е");
    var tCore = tU.replace(/\s*\(КОПИЯ\)\s*$/, "").replace(/\s*\(COPY\)\s*$/, "").trim();
    if (tCore === wantBase) {
      pool.push(sheets[s]);
      continue;
    }
    if (tCore.indexOf(wantBase) !== 0) continue;
    if (tCore.indexOf(String(year)) >= 0 || tCore.indexOf(yearShort) >= 0 || tCore === wantBase) {
      pool.push(sheets[s]);
    }
  }
  if (!pool.length) {
    return findSheetByBaseName_(crmSs, monthName);
  }
  var best = pool[0];
  var bestScore = scoreCrmMonthSheet_(best);
  for (var p = 1; p < pool.length; p++) {
    var sc = scoreCrmMonthSheet_(pool[p]);
    if (sc > bestScore) {
      best = pool[p];
      bestScore = sc;
    }
  }
  return best;
}

/** Быстрый перенос одного CRM-месяца → Календарь_Дат (все блоки дней). */
function migrateCrmMonthSheetBulk_(ss, crmSs, sh, year, monthIdx) {
  if (!sh) return { sheet: "", people: 0, days: 0 };
  var lastCol = Math.max(1, sh.getLastColumn());
  var lastRow = Math.max(1, sh.getLastRow());
  if (lastRow < 2) return { sheet: sh.getName(), people: 0, days: 0 };
  var data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var blocks = findCrmMonthDayBlocks_(data);
  var people = 0;
  var daysHit = {};
  for (var b = 0; b < blocks.length; b++) {
    var bl = blocks[b];
    for (var dayStr in bl.dayToCol) {
      if (!bl.dayToCol.hasOwnProperty(dayStr)) continue;
      var dn = Number(dayStr);
      var col = bl.dayToCol[dayStr];
      var d = new Date(year, monthIdx, dn);
      if (d.getMonth() !== monthIdx) continue;
      for (var r = bl.dataStart; r <= bl.dataEnd; r++) {
        var parsed = parseCrmCalendarCell_((data[r] || [])[col]);
        if (!parsed) continue;
        upsertCalendarEntry_(ss, {
          date: d,
          client: displayClientNick_(parsed.client) || parsed.client,
          matchKey: parsed.matchKey,
          segment: parsed.segment || "",
          address: parsed.address || "",
          phone: parsed.phone || "",
          note: parsed.note || "",
          basket: [],
          source: "crm",
          status: "planned",
          legacyRef: sh.getName() + ":b" + bl.headerRow + ":" + dn
        });
        people++;
        daysHit[dn] = true;
      }
    }
  }
  return { sheet: sh.getName(), people: people, days: Object.keys(daysHit).length, blocks: blocks.length };
}

function headerDayNumber_(hv) {
  if (hv instanceof Date) return hv.getDate();
  if (typeof hv === "number" && isFinite(hv)) return Math.round(hv);
  var s = String(hv || "").trim();
  if (!s) return NaN;
  var m = s.match(/^(\d{1,2})([./-]|$)/);
  if (m) return Number(m[1]);
  var n = Number(s);
  return isFinite(n) ? Math.round(n) : NaN;
}

function readCrmClientsForDate_(crmSs, deliveryDate) {
  var sh = resolveCrmMonthSheet_(crmSs, deliveryDate);
  if (!sh) return [];
  var dayNum = deliveryDate.getDate();
  var lastCol = Math.max(1, sh.getLastColumn());
  var lastRow = Math.max(1, sh.getLastRow());
  if (lastRow < 2) return [];
  var data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var blocks = findCrmMonthDayBlocks_(data);
  var out = [];
  var seen = {};
  for (var b = 0; b < blocks.length; b++) {
    var bl = blocks[b];
    if (!bl.dayToCol.hasOwnProperty(dayNum) && !bl.dayToCol.hasOwnProperty(String(dayNum))) continue;
    var col = bl.dayToCol[dayNum] != null ? bl.dayToCol[dayNum] : bl.dayToCol[String(dayNum)];
    for (var r = bl.dataStart; r <= bl.dataEnd; r++) {
      var parsed = parseCrmCalendarCell_((data[r] || [])[col]);
      if (!parsed) continue;
      var key = parsed.matchKey || clientMatchKey_(parsed.client);
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(parsed);
    }
  }
  return out;
}

/**
 * Инвентаризация CRM в чистовике: месяцы, дни, счётчики — без изменения данных.
 */
function handleCrmInventory(json, callback, fromPost) {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  var crmSs;
  try { crmSs = getCrmSpreadsheet_(); } catch (e) {
    var bad = { status: "error", message: "crm_open_failed", detail: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var local = crmSs.getId() === active.getId();
  var sheetNames = crmSs.getSheets().map(function (s) { return s.getName(); });
  var months = [];
  for (var m = 0; m < CRM_MONTH_NAMES_RU_.length; m++) {
    var base = CRM_MONTH_NAMES_RU_[m];
    var matched = sheetNames.filter(function (n) {
      var u = String(n).toUpperCase().replace(/ё/g, "Е");
      var b = base.toUpperCase().replace(/ё/g, "Е");
      return u === b || u.indexOf(b) === 0;
    });
    matched.forEach(function (name) {
      var sh = crmSs.getSheetByName(name);
      if (!sh) return;
      var lastCol = Math.max(1, sh.getLastColumn());
      var lastRow = Math.max(1, sh.getLastRow());
      var dataInv = (lastRow >= 1 && lastCol >= 1) ? sh.getRange(1, 1, lastRow, lastCol).getValues() : [];
      var blocksInv = findCrmMonthDayBlocks_(dataInv);
      var days = [];
      var daysSeen = {};
      var cellsWithNick = 0;
      for (var bi = 0; bi < blocksInv.length; bi++) {
        var blI = blocksInv[bi];
        for (var dayKey in blI.dayToCol) {
          if (!blI.dayToCol.hasOwnProperty(dayKey)) continue;
          var dnI = Number(dayKey);
          if (!daysSeen[dnI]) { daysSeen[dnI] = true; days.push(dnI); }
          var colI = blI.dayToCol[dayKey];
          for (var rI = blI.dataStart; rI <= blI.dataEnd; rI++) {
            if (parseCrmCalendarCell_((dataInv[rI] || [])[colI])) cellsWithNick++;
          }
        }
      }
      days.sort(function (a, b) { return a - b; });
      months.push({
        sheet: name,
        month: base,
        days: days,
        lastRow: lastRow,
        nickCells: cellsWithNick
      });
    });
  }
  function countSheet(name, startRow) {
    var sh = findSheetByBaseName_(crmSs, name);
    if (!sh || sh.getLastRow() < startRow) return 0;
    var data = sh.getDataRange().getValues();
    var n = 0;
    for (var i = startRow - 1; i < data.length; i++) {
      if (String(data[i][0] || "").trim()) n++;
    }
    return n;
  }
  var ok = {
    status: "success",
    local: local,
    spreadsheetId: crmSs.getId(),
    hasContacts: !!findSheetByBaseName_(crmSs, "Контакты"),
    hasPP: !!findSheetByBaseName_(crmSs, "ПП"),
    hasAFK: !!findSheetByBaseName_(crmSs, "АФК"),
    hasBP: !!findSheetByBaseName_(crmSs, "БП"),
    contactsRows: countSheet("Контакты", 2),
    ppRows: countSheet("ПП", 3),
    afkRows: countSheet("АФК", 3),
    bpRows: countSheet("БП", 3),
    clientsProfiles: Math.max(0, getClientsProfilesSheet_().getLastRow() - 1),
    months: months,
    note: "Даты в месяцах: заголовок колонки = число дня; год = из даты доставки. Листы «… (копия)» тоже читаются."
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/**
 * Заливает всех из Контакты + ПП/АФК/БП + календари месяцев в лист «Клиенты».
 * Только upsert: пустые поля не затирают уже заполненные; никого не удаляет.
 */
function seedCrmClientsIntoProfiles_() {
  var crmSs = getCrmSpreadsheet_();
  var stats = {
    fromContacts: 0,
    fromSubs: 0,
    fromMonths: 0,
    profilesBefore: Math.max(0, getClientsProfilesSheet_().getLastRow() - 1),
    profilesAfter: 0
  };

  var contacts = findSheetByBaseName_(crmSs, "Контакты");
  if (contacts && contacts.getLastRow() > 1) {
    var cdata = contacts.getDataRange().getValues();
    for (var c = 1; c < cdata.length; c++) {
      var nick = extractInstagramNick_(cdata[c][0]);
      if (!nick) continue;
      upsertClientProfile_(SpreadsheetApp.getActiveSpreadsheet(), nick, cdata[c][3], cdata[c][4], cdata[c][6], "Контакты");
      stats.fromContacts++;
    }
  }

  ["ПП", "АФК", "БП"].forEach(function (sheetName) {
    var sh = findSheetByBaseName_(crmSs, sheetName);
    if (!sh || sh.getLastRow() < 3) return;
    var data = sh.getDataRange().getValues();
    for (var r = 2; r < data.length; r++) {
      var nick2 = extractInstagramNick_(data[r][0]);
      if (!nick2) continue;
      var wishes = String(data[r][4] || "").trim();
      upsertClientProfile_(SpreadsheetApp.getActiveSpreadsheet(), nick2, "", "", wishes, sheetName);
      stats.fromSubs++;
    }
  });

  var sheets = crmSs.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var title = String(sheets[s].getName() || "");
    var tU = title.toUpperCase().replace(/ё/g, "Е");
    var isMonth = false;
    for (var m = 0; m < CRM_MONTH_NAMES_RU_.length; m++) {
      var b = CRM_MONTH_NAMES_RU_[m].toUpperCase().replace(/ё/g, "Е");
      if (tU === b || tU.indexOf(b) === 0) { isMonth = true; break; }
    }
    if (!isMonth) continue;
    var shM = sheets[s];
    var lastCol = Math.max(1, shM.getLastColumn());
    var lastRow = Math.max(1, shM.getLastRow());
    if (lastRow < 2) continue;
    var headers = shM.getRange(1, 1, 1, lastCol).getValues()[0];
    for (var col = 0; col < headers.length; col++) {
      var dn = headerDayNumber_(headers[col]);
      if (!isFinite(dn) || dn < 1 || dn > 31) continue;
      var vals = shM.getRange(2, col + 1, lastRow, col + 1).getValues();
      for (var rr = 0; rr < vals.length; rr++) {
        var parsed = parseCrmCalendarCell_(vals[rr][0]);
        if (!parsed) continue;
        upsertClientProfile_(
          SpreadsheetApp.getActiveSpreadsheet(),
          parsed.client,
          parsed.address,
          parsed.phone,
          parsed.note,
          "календарь:" + title
        );
        stats.fromMonths++;
      }
    }
  }

  stats.profilesAfter = Math.max(0, getClientsProfilesSheet_().getLastRow() - 1);
  return stats;
}

function handleSeedCrmClients(json, callback, fromPost) {
  var stats;
  try {
    stats = seedCrmClientsIntoProfiles_();
  } catch (e) {
    var bad = { status: "error", message: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var ok = { status: "success", seeded: true, stats: stats };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function mapCrmHeaderToItem_(header) {
  var h = String(header || "").replace(/\s+/g, " ").trim().toUpperCase().replace(/Ё/g, "Е");
  if (!h) return null;
  if (/^(ЛЮДИ|ID|КОЛИЧ|СТАТУС|ПОЖЕЛАН|ЗАМЕТК)/.test(h)) return null;
  if (/СЕБЕСТОИМ|СТОИМОСТ|СУММА|ЦЕНА|ИТОГ|СКИДК|ВЫХЛОП|ФАКТ|КАРМАН|ФРАК|ГРЯЗН|^У[123]$|^УП4$|^С[123]$/.test(h)) return null;

  // --- присыпки ---
  if (/КРОШК/.test(h)) {
    if (/Л[ЕЁ]?ГК|ЛЕГК/.test(h)) return { name: "КРОШКА ЛЁГКОГО", sub: "", cat: "powder", grams: true };
    if (/ПОЧ/.test(h)) return { name: "КРОШКА ПОЧЕК", sub: "", cat: "powder", grams: true };
    if (/СЕРДЦ/.test(h)) return { name: "КРОШКА СЕРДЦА", sub: "", cat: "powder", grams: true };
    if (/РУБ/.test(h)) return { name: "КРОШКА РУБЕЦ", sub: "", cat: "powder", grams: true };
    if (/МИКС/.test(h)) return { name: "КРОШКА МИКС", sub: "", cat: "powder", grams: true };
    return { name: "КРОШКА МИКС", sub: "", cat: "powder", grams: true };
  }

  // --- жевалки с фракциями (до общих шт.) ---
  if (/БЫЧ.*КОРЕН|КОРЕНЬ.*БЫЧ|^БЫЧИЙ КОРЕН/.test(h)) {
    var rootSub = "";
    if (/ОЧЕНЬ\s*МАЛ|ОЧ\s*МАЛ|СУПЕР\s*МАЛ/.test(h)) rootSub = "ОЧ МАЛ";
    else if (/ОГРОМ|РОГАЛ|ОГР/.test(h)) rootSub = "ОГР";
    else if (/БОЛЬШ|БОЛ/.test(h)) rootSub = "БОЛ";
    else if (/СРЕДН|СРЕД/.test(h)) rootSub = "СРЕД";
    else if (/МАЛЕНЬК|МАЛ/.test(h)) rootSub = "МАЛ";
    return { name: "БЫЧИЙ КОРЕНЬ", sub: rootSub, cat: "chew", grams: false };
  }
  if (/ТРАХЕ/.test(h)) {
    var trSub = "";
    if (/ПЛАСТ|ПЛАСТИН/.test(h)) trSub = "ПЛАСТ";
    else if (/ОГРОМ|ОГР/.test(h)) trSub = "ОГР";
    else if (/БОЛЬШ|БОЛ/.test(h)) trSub = "БОЛ";
    else if (/СРЕДН|СРЕД/.test(h)) trSub = "СРЕД";
    else if (/МАЛЕНЬК|МАЛ/.test(h)) trSub = "МАЛ";
    return { name: "ТРАХЕЯ", sub: trSub, cat: "chew", grams: false };
  }
  if (/СТАНОВ/.test(h)) {
    var stSub = "СРЕД";
    if (/ПАЛОЧ|ПАЛК/.test(h)) stSub = "ПАЛК";
    else if (/БОЛЬШ|БОЛ|ЦЕЛ/.test(h) && !/СРЕД/.test(h)) stSub = "БОЛ";
    else if (/СРЕДН|СРЕД|ПОЛОВИН/.test(h)) stSub = "СРЕД";
    return { name: "СТАНОВАЯ ЖИЛА", sub: stSub, cat: "chew", grams: false };
  }
  if (/УХО|УШК/.test(h)) {
    var earSub = /ПОЛОВИН/.test(h) ? "ПОЛОВИНКА" : "Обычное";
    return { name: "УХО Г", sub: earSub, cat: "chew", grams: false };
  }
  if (/АОРТ/.test(h)) {
    var aoSub = /ПОЛОВИН/.test(h) ? "ПОЛОВИНКА" : "Обычная";
    return { name: "АОРТА", sub: aoSub, cat: "chew", grams: false };
  }
  if (/КОЛЕН/.test(h)) return { name: "КОЛЕНИ шт.", sub: "", cat: "chew", grams: false };
  if (/КОПЫТ/.test(h)) return { name: "КОПЫТО шт.", sub: "", cat: "chew", grams: false };
  if (/НОСЫ|(^|[^А-ЯA-Z0-9])НОС([^А-ЯA-Z0-9]|$)/.test(h)) return { name: "НОСЫ шт.", sub: "", cat: "chew", grams: false };
  if (/ЛОП.*ХРЯЩ|ХРЯЩ.*ЛОП|ЛОПАТ/.test(h)) return { name: "ЛОП ХРЯЩ шт.", sub: "", cat: "chew", grams: false };
  if (/УТИН.*ШЕ|ШЕИ\s*УТ|УТИНЫЕ/.test(h)) return { name: "УТИНЫЕ ШЕИ шт.", sub: "", cat: "chew", grams: false };
  if (/ПЕРЕП[ЕЁ]Л|ПЕРЕПЕЛ/.test(h)) return { name: "ПЕРЕПЁЛКИ шт.", sub: "", cat: "chew", grams: false };
  if (/(^|[^А-ЯA-Z0-9])ГУБ/.test(h)) return { name: "ГУБЫ шт.", sub: "", cat: "chew", grams: false };

  // --- дрессура / баранье ---
  function dressSub_(hh) {
    if (/МЕЛК/.test(hh)) return "Мелкое";
    if (/СРЕД/.test(hh)) return "Среднее";
    if (/КРУПН/.test(hh)) return "Крупное";
    if (/БОЛЬШ|ПОЛОСК/.test(hh)) return "Большое";
    if (/ЦЕЛ|ЛОМТ/.test(hh)) return "Целое";
    return "";
  }

  if (/БАРАНЬ?Я\s*ПЕЧЕН/.test(h)) {
    return { name: "БАРАНЬЯ ПЕЧЕНЬ", sub: dressSub_(h) || "", cat: "other", grams: true };
  }
  if (/БАРАНЬ?Е?\s*Л[ЕЁ]?ГК|БАРАНЬЕ ЛЕГК/.test(h)) {
    return { name: "БАРАНЬЕ ЛЁГКОЕ", sub: dressSub_(h) || "Среднее", cat: "dressura", grams: true };
  }
  if (/ЛЕГК/.test(h) && !/КРОШК|БАРАН/.test(h)) {
    return { name: "ЛЁГКОЕ", sub: dressSub_(h) || "Среднее", cat: "dressura", grams: true };
  }
  if (/СЕРДЦ/.test(h)) {
    return { name: "СЕРДЦЕ", sub: dressSub_(h) || (/ЦЕЛ|ЛОМТ/.test(h) ? "Целое" : "Мелкое"), cat: "dressura", grams: true };
  }
  if (/ПОЧК/.test(h)) {
    return { name: "ПОЧКИ", sub: dressSub_(h) || (/ЦЕЛ/.test(h) ? "Целое" : "Мелкое"), cat: "dressura", grams: true };
  }
  if (/РУБЕЦ\s*С\b|СВЕТЛ.*РУБ|РУБЕЦ\s*СВЕТ/.test(h) || h === "РУБЕЦ С") {
    return { name: "СВЕТЛЫЙ РУБЕЦ", sub: "", cat: "other", grams: true };
  }
  if (/РУБЕЦ/.test(h)) {
    var rs = dressSub_(h);
    if (/КРУПН/.test(h)) rs = "Крупное";
    return { name: "РУБЕЦ Т", sub: rs || "Среднее", cat: "dressura", grams: true };
  }

  // --- другое мясо ---
  if (/ПЕЧЕН/.test(h)) return { name: "ПЕЧЕНЬ", sub: "", cat: "other", grams: true };
  if (/ИНДЕЙК/.test(h)) {
    var is = dressSub_(h);
    return { name: "ИНДЕЙКА", sub: is, cat: "other", grams: true };
  }
  if (/МЯСН.*ЛОМТ|ЛОМТИК/.test(h)) return { name: "МЯСНЫЕ ЛОМТИКИ", sub: "", cat: "other", grams: true };
  if (/ВЫМЯ/.test(h)) return { name: "ВЫМЯ", sub: "", cat: "other", grams: true };
  if (/СЕМЕН/.test(h)) return { name: "СЕМЕННИКИ", sub: "", cat: "other", grams: true };
  if (/ПИКАЛЬН/.test(h)) return { name: "ПИКАЛЬНОЕ МЯСО", sub: "", cat: "other", grams: true };
  if (/КНИЖК/.test(h)) return { name: "КНИЖКА", sub: "", cat: "other", grams: true };

  // --- овощи/фрукты ---
  if (/БАНАН/.test(h)) return { name: "БАНАНЫ", sub: "", cat: "veg", grams: true };
  if (/ЯБЛОК/.test(h)) return { name: "ЯБЛОКИ", sub: "", cat: "veg", grams: true };
  if (/ГРУШ/.test(h)) return { name: "ГРУШИ", sub: "", cat: "veg", grams: true };
  if (/КЛУБНИК/.test(h)) return { name: "КЛУБНИКА", sub: "", cat: "veg", grams: true };
  if (/МОРКОВ/.test(h)) return { name: "МОРКОВЬ", sub: "", cat: "veg", grams: true };
  if (/КАБАЧ/.test(h)) return { name: "КАБАЧОК", sub: "", cat: "veg", grams: true };
  if (/ТЫКВ/.test(h)) return { name: "ТЫКВА", sub: "", cat: "veg", grams: true };
  if (/СВЕКЛ/.test(h)) return { name: "СВЕКЛА", sub: "", cat: "veg", grams: true };
  if (/БАТАТ/.test(h)) return { name: "БАТАТ", sub: "", cat: "veg", grams: true };

  return null;
}

function basketFromSubscriberRow_(headers, row) {
  var basket = [];
  for (var c = 6; c < headers.length && c < row.length; c++) {
    var map = mapCrmHeaderToItem_(headers[c]);
    if (!map) continue;
    var raw = row[c];
    if (raw === "" || raw == null) continue;
    var num = Number(String(raw).replace(",", "."));
    if (!num || num <= 0) continue;
    // ТЗ: сыпучее 1 = 100г. Целое ≥20 уже в граммах (не трогаем).
    var val;
    if (map.grams) {
      if (num >= 20 && Math.abs(num - Math.round(num)) < 1e-9) val = Math.round(num);
      else val = Math.round(num * 100);
    } else {
      val = Math.round(num);
    }
    if (val <= 0) continue;
    basket.push({
      cat: map.cat,
      main: map.name,
      name: map.name,
      sub: map.sub,
      value: val,
      val: val
    });
  }
  return basket;
}

function findSubscriberBasket_(crmSs, nick, preferredSegment) {
  var sheets = [];
  var seg = String(preferredSegment || "").toUpperCase();
  if (seg === "АФК" || seg === "AFK") sheets = ["АФК", "ПП", "БП"];
  else if (seg === "БП" || seg === "BP") sheets = ["БП", "ПП", "АФК"];
  else sheets = ["ПП", "АФК", "БП"];

  var wantKey = clientMatchKey_(nick);
  if (!wantKey) return { basket: [], subId: "", wishes: "", sheet: "" };
  for (var s = 0; s < sheets.length; s++) {
    var data = getCrmSheetValuesFast_(crmSs, sheets[s]);
    if (!data || data.length < 3) continue;
    var headers = data[0];
    var best = null;
    for (var r = 2; r < data.length; r++) {
      var cell = String(data[r][0] || "");
      if (!cell.trim()) continue;
      if (!nicksMatch_(cell, nick)) continue;
      var basket = basketFromSubscriberRow_(headers, data[r]);
      var subId = String(data[r][1] || "").trim();
      var wishes = String(data[r][4] || "").trim();
      var cand = { basket: basket, subId: subId, wishes: wishes, sheet: sheets[s] };
      if (clientMatchKey_(cell) === wantKey) return cand;
      if (!best) best = cand;
    }
    if (best) return best;
  }
  return { basket: [], subId: "", wishes: "", sheet: "" };
}

function lookupContactAddress_(crmSs, nick) {
  var data = getCrmSheetValuesFast_(crmSs, "Контакты");
  if (!data || data.length < 2) return { address: "", note: "", phone: "" };
  for (var r = 1; r < data.length; r++) {
    var cell = String(data[r][0] || "");
    if (!nicksMatch_(cell, nick)) continue;
    return {
      address: String(data[r][3] || data[r][1] || "").trim(),
      phone: String(data[r][4] || data[r][2] || "").trim(),
      note: String(data[r][6] || data[r][3] || "").trim()
    };
  }
  return { address: "", note: "", phone: "" };
}

/**
 * Подтягивает клиентов из CRM-календаря месяца в Брони_Заказов.
 * Не затирает розничные брони (source=retail) и не пустые правки менеджера.
 */
function syncCrmIntoBookings_(ss, deliveryDate, opts) {
  opts = opts || {};
  var forceNames = (opts.forceClients || []).map(function (n) { return String(n || "").trim(); }).filter(Boolean);
  var forceOnly = forceNames.length > 0;
  function isForced_(name) {
    if (!forceOnly) return false;
    for (var fi = 0; fi < forceNames.length; fi++) {
      if (nicksMatch_(name, forceNames[fi])) return true;
    }
    return false;
  }
  var reviveCancelled = opts.reviveCancelled === true || forceOnly;
  var crmSs;
  try { crmSs = getCrmSpreadsheet_(); } catch (eOpen) {
    return { ok: false, message: "crm_open_failed", detail: String(eOpen) };
  }
  var tz = ss.getSpreadsheetTimeZone();
  var dateStr = dateKey_(deliveryDate, tz);
  var clients = readCrmClientsForDate_(crmSs, deliveryDate);
  var sh = getBookingsSheet_();
  var all = readAllBookings_();
  var added = 0;
  var skipped = 0;
  var revived = 0;

  for (var i = 0; i < clients.length; i++) {
    var c = clients[i];
    var forced = isForced_(c.client);
    if (forceOnly && !forced) continue;
    var existing = null;
    var cancelledRow = null;
    for (var j = 0; j < all.length; j++) {
      var bd = parseFlexibleDate_(all[j].date, tz);
      if (!bd || dateKey_(bd, tz) !== dateStr) continue;
      if (!nicksMatch_(all[j].client, c.client)) continue;
      if (String(all[j].status) === "cancelled") {
        cancelledRow = all[j];
        continue;
      }
      existing = all[j];
      break;
    }
    // удалили вручную — не возвращать из CRM, кроме явного force/revive
    if (cancelledRow && !existing && !(reviveCancelled && forced)) {
      skipped++;
      continue;
    }
    if (cancelledRow && !existing && reviveCancelled && forced) {
      existing = cancelledRow;
      revived++;
    }
    if (existing && String(existing.source) === "retail" && !forced) {
      skipped++;
      continue;
    }
    if (existing && existing.basket && existing.basket.length && !forced) {
      skipped++;
      continue;
    }

    // Автосостав: ПП с учётом N и слота доставки; АФК/БП — полный ряд с листа
    var contact = lookupContactAddress_(crmSs, c.client);
    var address = c.address || contact.address || "";
    var phone = c.phone || contact.phone || "";
    var filled = fillSubscriptionBasketForDate_(ss, crmSs, c.client, c.segment, deliveryDate);
    var subId = filled.subId || "";
    var basket = filled.basket || [];
    var noteParts = [];
    if (c.note) noteParts.push(String(c.note));
    if (contact.note) noteParts.push(String(contact.note));
    var note = stripTechFromNote_(noteParts.filter(Boolean).join(" "));
    var ppSlot = filled.ppSlot || "";
    if (!ppSlot && filled.hint) {
      var hm = String(filled.hint).match(/(\d+)\s*\/\s*(\d+)/);
      if (hm) ppSlot = hm[1] + "/" + hm[2];
    }
    var now = new Date();
    var id = existing ? existing.id : ("crm" + Date.now() + "_" + Math.floor(Math.random() * 1e5));
    var clientName = displayClientNick_(c.client);
    if (existing && existing.client && String(existing.client).trim().length >= clientName.length) {
      clientName = String(existing.client).trim();
    }
    var rowVals = [
      id, dateStr, clientName, subId || "", address, note,
      JSON.stringify(basket), "subscription",
      "planned",
      existing ? existing.dayName : "", now,
      existing ? (existing.pulledAt || "") : "",
      String(c.segment || "").trim(),
      phone,
      "",
      ppSlot
    ];
    if (existing) {
      sh.getRange(existing.rowIndex, 1, 1, BOOKINGS_HEADERS_.length).setValues([rowVals]);
    } else {
      sh.appendRow(rowVals);
      added++;
    }
    try {
      upsertCalendarEntry_(ss, {
        date: deliveryDate,
        client: clientName,
        segment: c.segment || "",
        address: address,
        phone: phone,
        note: note,
        basket: basket,
        subId: subId || "",
        source: "subscription",
        status: "planned",
        ppSlot: ppSlot,
        legacyRef: "crm:" + id
      });
    } catch (eCalCrm) {}
  }
  return {
    ok: true,
    date: dateStr,
    fromCalendar: clients.length,
    added: added,
    skipped: skipped,
    revived: revived
  };
}

/**
 * Состав для брони на дату: ПП → доля слота (N=1 целиком / N=2 половина или остаток);
 * АФК/БП → полный состав с листа подписки.
 */
function fillSubscriptionBasketForDate_(ss, crmSs, client, segment, deliveryDate) {
  var seg = String(segment || "").toUpperCase();
  // розница / партнёр / неизвестный тип — состав не угадываем с листов ПП/АФК/БП
  if (!seg || seg === "Р" || seg === "R" || seg === "RETAIL" || seg === "РОЗНИЦА" ||
      seg.indexOf("ПАРТ") === 0 || seg === "PARTNER" || seg === "ВАРКА") {
    return { basket: [], subId: "", hint: "" };
  }
  var tz = ss.getSpreadsheetTimeZone() || "Europe/Minsk";
  var dateStr = deliveryDate ? dateKey_(deliveryDate, tz) : "";

  if (seg === "ПП" || seg === "PP") {
    try {
      var sug = buildPpOrderSuggest_(ss, client, "", dateStr);
      if (sug && sug.proposedBasket && sug.proposedBasket.length) {
        return {
          basket: sug.proposedBasket,
          subId: sug.subId || "",
          hint: sug.hint || "",
          ppSlot: formatPpSlotLabel_(sug.deliverySlot, sug.deliveriesN),
          deliveriesN: sug.deliveriesN || 0,
          deliverySlot: sug.deliverySlot || 1
        };
      }
      if (sug && sug.deliveriesN >= 1) {
        return { basket: sug.monthlyBasket || [], subId: sug.subId || "", hint: sug.hint || "",
          ppSlot: formatPpSlotLabel_(sug.deliverySlot, sug.deliveriesN),
          deliveriesN: sug.deliveriesN || 0, deliverySlot: sug.deliverySlot || 1 };
      }
    } catch (ePp) {}
  }

  try {
    var found = findSubscriberBasket_(crmSs || getCrmSpreadsheet_(), client, seg);
    return {
      basket: clonePpBasket_(found.basket || []),
      subId: found.subId || "",
      hint: found.sheet ? ("[лист " + found.sheet + "]") : ""
    };
  } catch (e2) {
    return { basket: [], subId: "", hint: "" };
  }
}

/* ========== v7.6: Доступы / Склад / Подписки / Цена / Сборка ========== */

var ACCESS_HEADERS_ = ["telegramId", "name", "username", "role", "status", "requestedAt", "note", "timezone"];
var ACCESS_DEFAULT_TZ_ = "Europe/Minsk";
var ACCESS_TZ_OPTIONS_ = [
  "Europe/Minsk",
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Europe/Kiev",
  "Europe/Warsaw",
  "Europe/Berlin",
  "Asia/Yekaterinburg",
  "Asia/Novosibirsk",
  "Asia/Vladivostok",
  "UTC"
];
var PRICE_SPREADSHEET_ID_DEFAULT_ = "1c3iETyh_eOGcL0_zsGapzliVEfhQk5fQqbg8aAGAgI0";
var OWNER_IDS_FALLBACK_ = []; // задайте OWNER_TELEGRAM_IDS в Script Properties

function getAccessSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Доступы");
  if (!sh) {
    sh = ss.insertSheet("Доступы");
    sh.getRange(1, 1, 1, ACCESS_HEADERS_.length).setValues([ACCESS_HEADERS_]);
    sh.setFrozenRows(1);
  } else {
    try { ensureAccessSheetSchema_(sh); } catch (eSch) {}
  }
  return sh;
}

function ensureAccessSheetSchema_(sh) {
  if (!sh) return;
  var lastCol = Math.max(8, sh.getLastColumn() || 1);
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  if (String(headers[7] || "").toLowerCase().indexOf("time") < 0) {
    sh.getRange(1, 8).setValue("timezone");
  }
}

function normalizePersonTimezone_(tz) {
  var raw = String(tz || "").trim();
  if (!raw) return ACCESS_DEFAULT_TZ_;
  try {
    Utilities.formatDate(new Date(), raw, "HH");
    return raw;
  } catch (e) {
    return ACCESS_DEFAULT_TZ_;
  }
}

/** Локальные части даты в TZ сотрудника. */
function localPartsInTz_(date, tz) {
  tz = normalizePersonTimezone_(tz);
  var d = date || new Date();
  return {
    ymd: Utilities.formatDate(d, tz, "yyyy-MM-dd"),
    hour: Number(Utilities.formatDate(d, tz, "H")),
    minute: Number(Utilities.formatDate(d, tz, "m")),
    slot: Utilities.formatDate(d, tz, "yyyy-MM-dd'T'HH") +
      (Number(Utilities.formatDate(d, tz, "m")) < 30 ? ":00" : ":30")
  };
}

/** Окно уведомлений: с 9:00 до 21:00 по локальному времени сотрудника. */
function isPersonNotifyWindow_(date, tz) {
  var p = localPartsInTz_(date, tz);
  return p.hour >= 9 && p.hour < 21;
}

function timezoneOfAccessId_(telegramId) {
  var row = findAccessById_(telegramId);
  if (row && row.timezone) return normalizePersonTimezone_(row.timezone);
  return ACCESS_DEFAULT_TZ_;
}

function getOwnerTelegramIds_() {
  try {
    var cachedOwners = CacheService.getScriptCache().get("owner_ids_v1");
    if (cachedOwners) return JSON.parse(cachedOwners);
  } catch (eC0) {}
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("OWNER_TELEGRAM_IDS") || "";
  var ids = raw.split(/[,;\s]+/).map(function (s) { return String(s || "").trim(); }).filter(Boolean);
  for (var i = 0; i < OWNER_IDS_FALLBACK_.length; i++) {
    if (ids.indexOf(String(OWNER_IDS_FALLBACK_[i])) < 0) ids.push(String(OWNER_IDS_FALLBACK_[i]));
  }
  try { CacheService.getScriptCache().put("owner_ids_v1", JSON.stringify(ids), 300); } catch (eC1) {}
  return ids;
}

function isOwnerId_(telegramId) {
  var id = String(telegramId || "").trim();
  if (!id) return false;
  return getOwnerTelegramIds_().indexOf(id) >= 0;
}

/** Soft HMAC: если есть bot token + initData — проверяем; иначе не блокируем (dev / GitHub Pages). */
function validateInitDataSoft_(initData) {
  var raw = String(initData || "");
  if (!raw) return { ok: true, soft: true, user: null };
  var token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN") || "";
  if (!token) return { ok: true, soft: true, user: parseInitDataUser_(raw) };
  try {
    var params = {};
    raw.split("&").forEach(function (pair) {
      var i = pair.indexOf("=");
      if (i < 0) return;
      params[decodeURIComponent(pair.substring(0, i))] = decodeURIComponent(pair.substring(i + 1).replace(/\+/g, " "));
    });
    var hash = params.hash || "";
    delete params.hash;
    var keys = Object.keys(params).sort();
    var dataCheck = keys.map(function (k) { return k + "=" + params[k]; }).join("\n");
    var secretKey = Utilities.computeHmacSha256Signature("WebAppData", token);
    var calc = Utilities.computeHmacSha256Signature(dataCheck, secretKey);
    var calcHex = calc.map(function (b) {
      var v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? "0" + v : v;
    }).join("");
    var ok = calcHex === String(hash).toLowerCase();
    return { ok: ok, soft: false, user: parseInitDataUser_(raw) };
  } catch (e) {
    return { ok: true, soft: true, user: parseInitDataUser_(raw) };
  }
}

function parseInitDataUser_(initData) {
  try {
    var m = String(initData || "").match(/(?:^|&)user=([^&]+)/);
    if (!m) return null;
    return JSON.parse(decodeURIComponent(m[1]));
  } catch (e) {
    return null;
  }
}

function readAccessRows_() {
  var sh = getAccessSheet_();
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0] && !data[i][1]) continue;
    out.push({
      rowIndex: i + 1,
      telegramId: String(data[i][0] || "").trim(),
      name: String(data[i][1] || ""),
      username: String(data[i][2] || ""),
      role: String(data[i][3] || "pending").toLowerCase(),
      status: String(data[i][4] || "pending").toLowerCase(),
      requestedAt: data[i][5],
      note: String(data[i][6] || ""),
      timezone: normalizePersonTimezone_(data[i][7] || "")
    });
  }
  return out;
}

function findAccessById_(telegramId) {
  var id = String(telegramId || "").trim();
  if (!id) return null;
  try {
    var cached = CacheService.getScriptCache().get("acc_row_" + id);
    if (cached === "__none__") return null;
    if (cached) return JSON.parse(cached);
  } catch (eC) {}

  var sh = getAccessSheet_();
  var last = sh.getLastRow();
  if (last < 2) {
    try { CacheService.getScriptCache().put("acc_row_" + id, "__none__", 90); } catch (eN0) {}
    return null;
  }
  // только колонка ID — быстрее, чем весь лист
  var idCol = sh.getRange(2, 1, last - 1, 1).getValues();
  var rowIndex = -1;
  for (var i = 0; i < idCol.length; i++) {
    if (String(idCol[i][0] || "").trim() === id) {
      rowIndex = i + 2;
      break;
    }
  }
  if (rowIndex < 0) {
    try { CacheService.getScriptCache().put("acc_row_" + id, "__none__", 90); } catch (eN1) {}
    return null;
  }
  var data = sh.getRange(rowIndex, 1, 1, 8).getValues()[0];
  var row = {
    rowIndex: rowIndex,
    telegramId: String(data[0] || "").trim(),
    name: String(data[1] || ""),
    username: String(data[2] || ""),
    role: String(data[3] || "pending").toLowerCase(),
    status: String(data[4] || "pending").toLowerCase(),
    requestedAt: data[5],
    note: String(data[6] || ""),
    timezone: normalizePersonTimezone_(data[7] || "")
  };
  try { CacheService.getScriptCache().put("acc_row_" + id, JSON.stringify(row), 180); } catch (eP) {}
  return row;
}

function roleTabsFor_(role) {
  var r = String(role || "").toLowerCase();
  if (r === "owner") return ["orderScreen", "clientsScreen", "cuttingScreen", "courierScreen", "warehouseScreen", "subsScreen", "priceScreen", "deferredScreen", "peopleScreen"];
  if (r === "manager") return ["orderScreen", "clientsScreen", "subsScreen", "priceScreen", "deferredScreen"];
  if (r === "cutter") return ["cuttingScreen"];
  if (r === "courier") return ["courierScreen"];
  if (r === "logistics") return ["warehouseScreen"];
  if (r === "all") return ["orderScreen", "clientsScreen", "cuttingScreen", "courierScreen", "warehouseScreen", "subsScreen", "priceScreen", "deferredScreen"];
  return [];
}

function handleGetMyAccess(json, callback, fromPost) {
  var init = validateInitDataSoft_(json.initData || "");
  var user = init.user || {};
  var telegramId = String(json.telegramId || user.id || "").trim();
  var name = String(json.name || user.first_name || "").trim();
  var username = String(json.username || user.username || "").trim();

  var accKey = telegramId ? ("myacc:" + telegramId) : "";
  if (accKey && !(json && (json.force || json.nocache || json._))) {
    try {
      var accCached = cacheGetJson_(accKey);
      if (accCached && accCached.status === "success") {
        return fromPost ? jsonpText(callback, accCached) : jsonp(callback, accCached);
      }
    } catch (eAcc) {}
  }

  if (isOwnerId_(telegramId)) {
    // не пишем в «Доступы» на каждый старт — только если имя/username изменились
    try {
      var rowOwn = findAccessById_(telegramId);
      var needUp = !rowOwn ||
        String(rowOwn.name || "") !== name ||
        String(rowOwn.username || "") !== username ||
        String(rowOwn.role || "") !== "owner";
      if (needUp) upsertAccessRow_(telegramId, name, username, "owner", "active");
    } catch (eUp) {
      try { upsertAccessRow_(telegramId, name, username, "owner", "active"); } catch (e2) {}
    }
    var okOwner = {
      status: "success",
      role: "owner",
      access: "active",
      tabs: roleTabsFor_("owner"),
      telegramId: telegramId,
      name: name,
      initOk: init.ok
    };
    if (accKey) try { cachePutJson_(accKey, okOwner, 120); } catch (eP) {}
    return fromPost ? jsonpText(callback, okOwner) : jsonp(callback, okOwner);
  }

  var row = findAccessById_(telegramId);
  if (!row) {
    var owners = getOwnerTelegramIds_();
    if (!owners.length) {
      // первый запуск без OWNER_TELEGRAM_IDS — не блокируем команду
      var openAll = {
        status: "success",
        role: "all",
        access: "active",
        tabs: roleTabsFor_("all"),
        telegramId: telegramId,
        name: name,
        initOk: init.ok,
        message: "no_owners_configured"
      };
      return fromPost ? jsonpText(callback, openAll) : jsonp(callback, openAll);
    }
    var pending = {
      status: "success",
      role: "none",
      access: "none",
      tabs: [],
      telegramId: telegramId,
      name: name,
      initOk: init.ok,
      message: "need_request"
    };
    return fromPost ? jsonpText(callback, pending) : jsonp(callback, pending);
  }

  var role = row.role;
  var access = row.status;
  if (access === "denied" || role === "denied") {
    var denied = { status: "success", role: "denied", access: "denied", tabs: [], telegramId: telegramId, name: row.name || name };
    return fromPost ? jsonpText(callback, denied) : jsonp(callback, denied);
  }
  if (access === "pending" || role === "pending") {
    var wait = { status: "success", role: "pending", access: "pending", tabs: [], telegramId: telegramId, name: row.name || name };
    return fromPost ? jsonpText(callback, wait) : jsonp(callback, wait);
  }

  var ok = {
    status: "success",
    role: role,
    access: access || "active",
    tabs: roleTabsFor_(role),
    telegramId: telegramId,
    name: row.name || name,
    initOk: init.ok
  };
  if (accKey) try { cachePutJson_(accKey, ok, 90); } catch (eP2) {}
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function upsertAccessRow_(telegramId, name, username, role, status, timezone) {
  var id = String(telegramId || "").trim();
  try {
    CacheService.getScriptCache().remove("acc_row_" + id);
    CacheService.getScriptCache().remove("myacc:" + id);
  } catch (eRm) {}
  var sh = getAccessSheet_();
  try { ensureAccessSheetSchema_(sh); } catch (eSch) {}
  var existing = findAccessById_(id);
  var now = new Date();
  var tz = normalizePersonTimezone_(
    timezone != null && String(timezone).trim()
      ? timezone
      : (existing && existing.timezone) || ACCESS_DEFAULT_TZ_
  );
  var rowObj;
  if (existing) {
    rowObj = {
      rowIndex: existing.rowIndex,
      telegramId: id,
      name: name || existing.name,
      username: username || existing.username,
      role: String(role || "").toLowerCase(),
      status: String(status || "").toLowerCase(),
      requestedAt: existing.requestedAt || now,
      note: existing.note || "",
      timezone: tz
    };
    sh.getRange(existing.rowIndex, 1, 1, 8).setValues([[
      id, rowObj.name, rowObj.username, role, status, rowObj.requestedAt, rowObj.note, rowObj.timezone
    ]]);
  } else {
    sh.appendRow([id, name, username, role, status, now, "", tz]);
    rowObj = {
      rowIndex: sh.getLastRow(),
      telegramId: id,
      name: name || "",
      username: username || "",
      role: String(role || "").toLowerCase(),
      status: String(status || "").toLowerCase(),
      requestedAt: now,
      note: "",
      timezone: tz
    };
  }
  try { CacheService.getScriptCache().put("acc_row_" + id, JSON.stringify(rowObj), 180); } catch (eP) {}
}

function handleRequestAccess(json, callback, fromPost) {
  var telegramId = String(json.telegramId || "").trim();
  if (!telegramId) {
    var bad = { status: "error", message: "need_telegram_id" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  if (isOwnerId_(telegramId)) {
    upsertAccessRow_(telegramId, json.name || "", json.username || "", "owner", "active");
    var own = { status: "success", role: "owner", access: "active" };
    return fromPost ? jsonpText(callback, own) : jsonp(callback, own);
  }
  var existing = findAccessById_(telegramId);
  if (existing && (existing.status === "active" || existing.role === "owner")) {
    var already = { status: "success", role: existing.role, access: existing.status };
    return fromPost ? jsonpText(callback, already) : jsonp(callback, already);
  }
  upsertAccessRow_(telegramId, json.name || "", json.username || "", "pending", "pending");
  try {
    notifyOwnersAccessRequest_(telegramId, json.name || "", json.username || "");
  } catch (e3) {}
  var ok = { status: "success", role: "pending", access: "pending" };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleListAccess(json, callback, fromPost) {
  var actor = String(json.telegramId || "").trim();
  if (!isOwnerId_(actor) && (!findAccessById_(actor) || findAccessById_(actor).role !== "owner")) {
    // soft: всё равно отдаём список если actor пустой (тесты), иначе только owner
    if (actor && !isOwnerId_(actor)) {
      var forbid = { status: "error", message: "owner_only" };
      return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
    }
  }
  var rows = readAccessRows_().map(function (r) {
    return {
      telegramId: r.telegramId,
      name: r.name,
      username: r.username,
      role: r.role,
      status: r.status,
      note: r.note,
      timezone: r.timezone || ACCESS_DEFAULT_TZ_
    };
  });
  var ok = { status: "success", people: rows, owners: getOwnerTelegramIds_(), timezones: ACCESS_TZ_OPTIONS_ };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/** Участники для назначения напоминалок — любой активный доступ (не только owner). */
function handleListReminderPeople_(json, callback, fromPost) {
  var actor = String(json.telegramId || "").trim();
  if (!actor) {
    var need = { status: "error", message: "need_telegramId" };
    return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
  }
  var people = [];
  var seen = {};
  function pushPerson_(id, name, username, role) {
    id = String(id || "").trim();
    if (!id || seen[id]) return;
    seen[id] = true;
    people.push({
      telegramId: id,
      name: String(name || "").trim(),
      username: String(username || "").trim(),
      role: String(role || "").trim().toLowerCase()
    });
  }
  var rows = readAccessRows_();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var st = String(r.status || "").toLowerCase();
    var role = String(r.role || "").toLowerCase();
    if (st === "denied" || st === "pending") continue;
    if (role === "denied" || role === "pending") continue;
    if (!r.telegramId) continue;
    pushPerson_(r.telegramId, r.name, r.username, role);
  }
  var owners = getOwnerTelegramIds_();
  for (var o = 0; o < owners.length; o++) {
    pushPerson_(owners[o], "", "", "owner");
  }
  people.sort(function (a, b) {
    var an = (a.name || a.username || a.telegramId).toLowerCase();
    var bn = (b.name || b.username || b.telegramId).toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });
  var ok = { status: "success", people: people };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleSetAccessRole(json, callback, fromPost) {
  var actor = String(json.actorId || json.telegramIdOwner || "").trim();
  if (actor && !isOwnerId_(actor)) {
    var rowA = findAccessById_(actor);
    if (!rowA || rowA.role !== "owner") {
      var forbid = { status: "error", message: "owner_only" };
      return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
    }
  }
  var target = String(json.targetId || json.telegramId || "").trim();
  var role = String(json.role || "").toLowerCase().trim();
  if (!target || !role) {
    var bad = { status: "error", message: "need_target_and_role" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var status = (role === "denied") ? "denied" : (role === "pending" ? "pending" : "active");
  var existing = findAccessById_(target);
  upsertAccessRow_(
    target,
    (json.name || (existing && existing.name) || ""),
    (json.username || (existing && existing.username) || ""),
    role,
    status,
    (json.timezone != null ? json.timezone : (existing && existing.timezone))
  );
  try { telegramSendText_(target, "Вам назначена роль: " + role); } catch (e) {}
  var ok = { status: "success", telegramId: target, role: role, access: status };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleSetAccessTimezone(json, callback, fromPost) {
  var actor = String(json.actorId || json.telegramIdOwner || json.telegramId || "").trim();
  if (actor && !isOwnerId_(actor)) {
    var rowA = findAccessById_(actor);
    if (!rowA || rowA.role !== "owner") {
      var forbid = { status: "error", message: "owner_only" };
      return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
    }
  }
  var target = String(json.targetId || "").trim();
  var tz = normalizePersonTimezone_(json.timezone || json.tz || "");
  if (!target) {
    var bad = { status: "error", message: "need_target" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var existing = findAccessById_(target);
  if (!existing) {
    upsertAccessRow_(target, json.name || "", json.username || "", "pending", "pending", tz);
  } else {
    upsertAccessRow_(target, existing.name, existing.username, existing.role, existing.status, tz);
  }
  var ok = { status: "success", telegramId: target, timezone: tz };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/* ----- Склад ----- */

function getLedgerSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Склад_Движения");
  if (!sh) {
    sh = ss.insertSheet("Склад_Движения");
    sh.getRange(1, 1, 1, 7).setValues([["ts", "weekEnd", "skuRow", "type", "qty", "unit", "meta"]]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function round2_(n) {
  var x = Number(n);
  if (!isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function handleGetWarehouse(json, callback, fromPost) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var wh = ss.getSheetByName("Склад");
    if (!wh) {
      var bad = { status: "error", message: "no_warehouse" };
      return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
    }

    // короткий кэш — меньше таймаутов при частом открытии вкладки
    var cacheKey = "wh_get_v1";
    try {
      var cached = CacheService.getScriptCache().get(cacheKey);
      if (cached && !(json && (json.force || json.nocache || json._))) {
        var parsed = JSON.parse(cached);
        if (parsed && parsed.status === "success") {
          return fromPost ? jsonpText(callback, parsed) : jsonp(callback, parsed);
        }
      }
    } catch (eCache) {}

    var lastRow = Math.max(1, wh.getLastRow());
    var last = Math.min(80, Math.max(2, lastRow));
    var numRows = last - 1; // строки 2..last
    var items = [];
    if (numRows >= 1) {
      // A:M — шт-остаток смотрим в M (Остаток Вс), неделя до воскресенья
      var matrix = wh.getRange(2, 1, numRows, 13).getValues();
      for (var i = 0; i < matrix.length; i++) {
        var name = String(matrix[i][0] || "").trim();
        if (!name) continue;
        var row = i + 2;
        var piece = isPieceWarehouseRow_(row, name);
        var mVal = matrix[i][12];
        items.push({
          row: row,
          name: name,
          arrival: round2_(matrix[i][1]),
          coef: round2_(matrix[i][3]),
          stock: round2_(matrix[i][5]),
          buy: !!matrix[i][6],
          unit: piece ? "шт" : "кг",
          stockPcs: piece ? round2_(mVal) : null
        });
      }
    }

    var ledger = [];
    try {
      var led = getLedgerSheet_();
      var lr = led.getLastRow();
      if (lr > 1) {
        var from = Math.max(2, lr - 29);
        var ledNum = lr - from + 1;
        if (ledNum > 0) {
          var data = led.getRange(from, 1, ledNum, 7).getValues();
          for (var j = data.length - 1; j >= 0; j--) {
            ledger.push({
              ts: data[j][0],
              weekEnd: data[j][1],
              skuRow: data[j][2],
              type: data[j][3],
              qty: round2_(data[j][4]),
              unit: data[j][5],
              meta: data[j][6]
            });
          }
        }
      }
    } catch (e2) {}

    var ok = { status: "success", items: items, ledger: ledger };
    try {
      CacheService.getScriptCache().put(cacheKey, JSON.stringify(ok), 60);
    } catch (ePut) {}
    return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
  } catch (eAll) {
    var err = { status: "error", message: "warehouse_read_failed", detail: String(eAll) };
    return fromPost ? jsonpText(callback, err) : jsonp(callback, err);
  }
}

function handleSetWarehouseArrival(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wh = ss.getSheetByName("Склад");
  var row = Number(json.row) || 0;
  var qty = Number(json.qty != null ? json.qty : json.arrival) || 0;
  if (!wh || row < 2) {
    var bad = { status: "error", message: "bad_row" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  wh.getRange(row, 2).setValue(qty);
  try {
    getLedgerSheet_().appendRow([new Date(), "", row, "arrival", qty, "кг", JSON.stringify({ by: json.telegramId || "" })]);
  } catch (e) {}
  try { CacheService.getScriptCache().remove("wh_get_v1"); } catch (eC) {}
  var ok = { status: "success", row: row, arrival: qty };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/**
 * Ревизия остатка: пишет F (кг/шт), для шт-строк ещё M (Остаток Вс), B=0.
 * json.items: [{row, qty}] или [{name, qty}]
 */
function applyWarehouseRevision_(items, meta) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wh = ss.getSheetByName("Склад");
  if (!wh) return { ok: false, message: "no_warehouse", updated: [] };
  meta = meta || {};
  var nameToRow = {};
  var last = Math.min(80, Math.max(2, wh.getLastRow()));
  var names = wh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    var nm = String(names[i][0] || "").trim().toUpperCase().replace(/\s+/g, " ");
    if (nm) nameToRow[nm] = i + 2;
  }
  function resolveRow_(it) {
    var r = Number(it.row) || 0;
    if (r >= 2) return r;
    var key = String(it.name || "").trim().toUpperCase().replace(/\s+/g, " ");
    if (!key) return 0;
    if (nameToRow[key]) return nameToRow[key];
    // мягкий матч без «шт.»
    var key2 = key.replace(/\s*ШТ\.?/g, "").trim();
    for (var k in nameToRow) {
      if (!nameToRow.hasOwnProperty(k)) continue;
      var k2 = k.replace(/\s*ШТ\.?/g, "").trim();
      if (k2 === key2 || k.indexOf(key2) === 0 || key2.indexOf(k2) === 0) return nameToRow[k];
    }
    return 0;
  }
  var updated = [];
  var missed = [];
  for (var j = 0; j < (items || []).length; j++) {
    var it = items[j] || {};
    var row = resolveRow_(it);
    if (!(row >= 2)) {
      missed.push(String(it.name || it.row || ""));
      continue;
    }
    var qty = Number(it.qty);
    if (isNaN(qty)) qty = 0;
    var name = String(wh.getRange(row, 1).getValue() || "");
    var piece = isPieceWarehouseRow_(row, name);
    wh.getRange(row, 6).setValue(qty); // F остаток/ревизия
    wh.getRange(row, 2).setValue(0);   // B дозакуп сброс
    if (piece) {
      try { wh.getRange(row, 13).setValue(qty); } catch (eM) {} // M Остаток Вс
    }
    try {
      getLedgerSheet_().appendRow([
        new Date(), "", row, "revision", qty, piece ? "шт" : "кг",
        JSON.stringify({ by: meta.by || "", note: meta.note || "revision" })
      ]);
    } catch (eL) {}
    updated.push({ row: row, name: name, qty: qty, unit: piece ? "шт" : "кг" });
  }
  try { CacheService.getScriptCache().remove("wh_get_v1"); } catch (eC) {}
  return { ok: true, updated: updated, missed: missed, count: updated.length };
}

function handleApplyWarehouseRevision(json, callback, fromPost) {
  var items = (json && json.items) || [];
  if (typeof items === "string") {
    try { items = JSON.parse(items); } catch (e) { items = []; }
  }
  if (!items.length) {
    var bad = { status: "error", message: "no_items" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var r = applyWarehouseRevision_(items, {
    by: (json && json.telegramId) || "",
    note: (json && json.note) || "revision"
  });
  var ok = { status: r.ok ? "success" : "error", result: r };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/** Ревизия 2026-08-05 (после нарезки вт) — Run в редакторе после вставки Code.gs. */
function applyWarehouseRevisionManual() {
  var items = [
    { name: "ЛЁГКОЕ", qty: 15 },
    { name: "СЕРДЦЕ", qty: 0.5 },
    { name: "ПОЧКИ", qty: 7.2 },
    { name: "РУБЕЦ Т", qty: 5.5 },
    { name: "ПЕЧЕНЬ", qty: 3 },
    { name: "БАРАНЬЕ ЛЁГКОЕ", qty: 0.5 },
    { name: "ИНДЕЙКА", qty: 0 },
    { name: "МЯСНЫЕ ЛОМТИКИ", qty: 0 },
    { name: "ЛОП ХРЯЩ", qty: 60 },
    { name: "БЫЧИЙ КОРЕНЬ", qty: 7 },
    { name: "ТРАХЕЯ", qty: 12 },
    { name: "ПЕРЕПЁЛКИ", qty: 8 },
    { name: "УХО Г", qty: 0 },
    { name: "КОЛЕНИ", qty: 6 },
    { name: "КОПЫТО", qty: 0 },
    { name: "СТАНОВАЯ ЖИЛА", qty: 80 },
    { name: "АОРТА", qty: 40 },
    { name: "УТИНЫЕ ШЕИ", qty: 20 },
    { name: "НОСЫ", qty: 5 },
    { name: "ВЫМЯ", qty: 0.4 },
    { name: "СЕМЕННИКИ", qty: 7.5 },
    { name: "ПИКАЛЬНОЕ МЯСО", qty: 1 },
    { name: "БАНАНЫ", qty: 0 },
    { name: "ЯБЛОКИ", qty: 0 },
    { name: "МОРКОВЬ", qty: 0 },
    { name: "ГРУШЫ", qty: 0 },
    { name: "ТЫКВА", qty: 0 },
    { name: "БАТАТ", qty: 0 }
  ];
  try {
    var r = applyWarehouseRevision_(items, { by: "manual", note: "rev_2026-08-05_tue_cut" });
    Logger.log(JSON.stringify(r));
  } catch (e) {
    Logger.log("ERR revision: " + String(e));
  }
}

function handleWarehousePreview(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var opts = {
    dateFrom: (json && (json.dateFrom || json.from)) || "",
    dateTo: (json && (json.dateTo || json.to)) || "",
    force: !!(json && (json.force || json.refresh))
  };
  if (opts.force) {
    try {
      CacheService.getScriptCache().remove("WH_PLAN_V3");
      CacheService.getScriptCache().remove("WH_PLAN_V4");
      CacheService.getScriptCache().remove("WH_PLAN_V5");
      CacheService.getScriptCache().remove("WH_PLAN_V6");
    } catch (e) {}
  }
  var pack = computeWarehouseWeekPlan_(ss, opts);
  if (!pack || !pack.ok) {
    var bad = { status: "error", message: (pack && pack.message) || "no_warehouse" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  // задачи Дозакуп — только для полного плана недели (без среза дат)
  if (!opts.dateFrom && !opts.dateTo) {
    try { syncWarehouseBuyDeferred_(ss, pack.deficits || []); } catch (eSync) {}
  }
  var msg = "";
  try { msg = composeWarehouseBuyMessage_(pack); } catch (eM) {}
  var ok = {
    status: "success",
    deficits: pack.deficits || [],
    plan: pack.plan || [],
    withPlan: pack.withPlan || [],
    buyList: pack.buyList || [],
    days: pack.days || [],
    activeDays: pack.activeDays || [],
    dateFrom: pack.dateFrom || "",
    dateTo: pack.dateTo || "",
    rangeLabel: pack.rangeLabel || "",
    note: pack.note || "",
    messageText: msg,
    writeOffNote: "Галочки нарезки НЕ списывают склад. Списание F — только при Завершить неделю."
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleComposeWarehouseBuyMessage(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var opts = {
    dateFrom: (json && (json.dateFrom || json.from)) || "",
    dateTo: (json && (json.dateTo || json.to)) || "",
    force: !!(json && (json.force || json.refresh))
  };
  if (opts.force) {
    try {
      CacheService.getScriptCache().remove("WH_PLAN_V3");
      CacheService.getScriptCache().remove("WH_PLAN_V4");
      CacheService.getScriptCache().remove("WH_PLAN_V5");
      CacheService.getScriptCache().remove("WH_PLAN_V6");
    } catch (e) {}
  }
  var pack = computeWarehouseWeekPlan_(ss, opts);
  if (!pack || !pack.ok) {
    var bad2 = { status: "error", message: (pack && pack.message) || "no_warehouse" };
    return fromPost ? jsonpText(callback, bad2) : jsonp(callback, bad2);
  }
  if (!opts.dateFrom && !opts.dateTo) {
    try { syncWarehouseBuyDeferred_(ss, pack.deficits || []); } catch (eSync2) {}
  }
  var ok2 = {
    status: "success",
    text: composeWarehouseBuyMessage_(pack),
    deficits: pack.deficits || [],
    count: (pack.deficits || []).length,
    dateFrom: pack.dateFrom || "",
    dateTo: pack.dateTo || "",
    rangeLabel: pack.rangeLabel || ""
  };
  return fromPost ? jsonpText(callback, ok2) : jsonp(callback, ok2);
}

function lookupLastPpPartner_(ss, nick) {
  var want = clientMatchKey_(nick);
  if (!want && !nick) return "";
  var all = [];
  try { all = readAllCalendarRows_(); } catch (e) { return ""; }
  var best = "";
  var bestTs = -1;
  for (var i = 0; i < all.length; i++) {
    var p = String(all[i].ppPartner || "").trim();
    if (!p) continue;
    var mk = clientMatchKey_(all[i].client) || "";
    var okNick = (want && mk === want);
    if (!okNick) {
      try { okNick = nicksMatch_(all[i].client, nick); } catch (eN) { okNick = false; }
    }
    if (!okNick) continue;
    var d = null;
    try {
      d = parseFlexibleDate_(all[i].date) || parseFlexibleDate_(all[i].dateIso);
    } catch (eD) {}
    var t = d && d.getTime ? d.getTime() : i;
    if (t >= bestTs) {
      bestTs = t;
      best = p;
    }
  }
  return best;
}

function handleLookupBpPartner(json, callback, fromPost) {
  var nick = String((json && json.nick) || "").trim();
  if (!nick) {
    var bad = { status: "error", message: "no_nick", ppPartner: "" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var p = "";
  try { p = lookupLastPpPartner_(ss, nick); } catch (e) {}
  var ok = { status: "success", nick: nick, ppPartner: p || "" };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function clearCrmSheetCache_(sheetName) {
  try { _memoCrmSheets_ = {}; } catch (eM) {}
  try {
    var sid = "x";
    try { sid = String(getCrmSpreadsheet_().getId()).slice(-10); } catch (eId) {}
    var cache = CacheService.getScriptCache();
    var names = sheetName
      ? [String(sheetName)]
      : ["ПП", "АФК", "БП", "Контакты", "Опросник"];
    for (var i = 0; i < names.length; i++) {
      try { cache.remove("CRM:" + sid + ":" + names[i]); } catch (eR) {}
    }
  } catch (eC) {}
}

/** Живое чтение CRM без кэша (список подписок после переноса). */
/** Последняя строка с ником в колонке A (сироты «под таблицей»). */
function getCrmSheetScanLastRow_(sh) {
  if (!sh) return 1;
  var declared = Math.max(1, sh.getLastRow());
  var maxScan = Math.min(Math.max(declared + 80, 120), Math.max(200, sh.getMaxRows()));
  var colA = sh.getRange(1, 1, maxScan, 1).getValues();
  var last = 1;
  for (var i = 0; i < colA.length; i++) {
    if (String(colA[i][0] || "").trim()) last = i + 1;
  }
  return Math.max(declared, last);
}

function readCrmSheetLiveNarrow_(crmSs, sheetName, maxCols) {
  var sh = findSheetByBaseName_(crmSs, sheetName);
  if (!sh) return null;
  var lastRow = getCrmSheetScanLastRow_(sh);
  if (lastRow < 2) return null;
  var cols = Math.min(Math.max(1, maxCols || 5), Math.max(1, sh.getLastColumn()));
  return sh.getRange(1, 1, lastRow, cols).getValues();
}

/**
 * Люди ниже «дыры» из 3+ пустых строк — подтянуть вверх.
 */
function rescueOrphanSubscriptionRows_(sh) {
  if (!sh) return { moved: 0 };
  var last = getCrmSheetScanLastRow_(sh);
  if (last < 4) return { moved: 0 };
  var width = Math.min(Math.max(5, sh.getLastColumn()), sh.getMaxColumns());
  var data = sh.getRange(1, 1, last, width).getValues();
  var gap = 0;
  var seenGap = false;
  var mainEnd = 2;
  var emptySlots = [];
  var orphans = [];
  for (var r = 2; r < data.length; r++) {
    var sheetRow = r + 1;
    var nick = String(data[r][0] || "").trim();
    if (!nick) {
      gap++;
      if (!seenGap) emptySlots.push(sheetRow);
      if (gap >= 3) seenGap = true;
      continue;
    }
    if (/^себестоим/i.test(nick) || /^стоимость\s*100/i.test(nick)) {
      gap = 0;
      continue;
    }
    if (seenGap) {
      orphans.push({ row: sheetRow, vals: data[r].slice(0, width) });
    } else {
      mainEnd = sheetRow;
      gap = 0;
    }
  }
  if (!orphans.length) return { moved: 0 };
  orphans.sort(function (a, b) { return b.row - a.row; });
  var moved = 0;
  for (var oi = 0; oi < orphans.length; oi++) {
    var o = orphans[oi];
    var target = -1;
    while (emptySlots.length) {
      var cand = emptySlots.shift();
      if (cand >= o.row) continue;
      if (!String(sh.getRange(cand, 1).getValue() || "").trim()) {
        target = cand;
        break;
      }
    }
    if (target < 0) {
      target = mainEnd + 1;
      while (target < o.row && String(sh.getRange(target, 1).getValue() || "").trim()) target++;
      if (target >= o.row) continue;
    }
    var vals = o.vals.slice();
    while (vals.length < width) vals.push("");
    sh.getRange(target, 1, 1, width).setValues([vals.slice(0, width)]);
    sh.getRange(o.row, 1, 1, width).clearContent();
    mainEnd = Math.max(mainEnd, target);
    moved++;
  }
  try { SpreadsheetApp.flush(); } catch (eFl) {}
  return { moved: moved };
}

/** ID подписки: пусто / #REF! / прочие ошибки формул — не ID. */
function sanitizeSubId_(v) {
  var s = String(v == null ? "" : v).trim();
  if (!s) return "";
  if (s.charAt(0) === "#") return "";
  if (/^#(REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NULL!|NUM!|ERROR!)$/i.test(s)) return "";
  return s;
}

function sheetNeedsSubscriptionIdRepair_(data) {
  if (!data || data.length < 3) return false;
  var withNick = 0;
  var broken = 0;
  for (var r = 2; r < data.length; r++) {
    if (!String(data[r][0] || "").trim()) continue;
    withNick++;
    if (!sanitizeSubId_(data[r][1])) broken++;
  }
  return withNick > 0 && broken > 0;
}

/**
 * Колонка B = 1, 2, 3… Числа, не формулы.
 * Sheet.getRange(r,c,numRows,numColumns) — 3/4 = размер, не endRow.
 */
function repairSheetSubscriptionIds_(crmSs, sheetName) {
  var sh = findSheetByBaseName_(crmSs, sheetName);
  if (!sh || getCrmSheetScanLastRow_(sh) < 3) return { repaired: 0, nextId: 1 };
  var lastRow = getCrmSheetScanLastRow_(sh);
  var numRows = lastRow - 2;
  if (numRows < 1) return { repaired: 0, nextId: 1 };
  var nickCol = sh.getRange(3, 1, numRows, 1).getValues();
  var out = [];
  var n = 1;
  var repaired = 0;
  for (var i = 0; i < nickCol.length; i++) {
    if (String(nickCol[i][0] || "").trim()) {
      out.push([n]);
      n++;
      repaired++;
    } else {
      out.push([""]);
    }
  }
  if (out.length) {
    var idRange = sh.getRange(3, 2, numRows, 1);
    try { idRange.clearContent(); } catch (eClr) {}
    idRange.setValues(out);
    try { idRange.setNumberFormat("0"); } catch (eFmt) {}
  }
  try { SpreadsheetApp.flush(); } catch (eFl) {}
  try { clearCrmSheetCache_(sheetName); } catch (eC) {}
  return { repaired: repaired, nextId: n };
}

function nextSubscriptionNumericId_(sh) {
  if (!sh || getCrmSheetScanLastRow_(sh) < 3) return 1;
  var lr = getCrmSheetScanLastRow_(sh);
  var numRows = lr - 2;
  if (numRows < 1) return 1;
  var vals = sh.getRange(3, 2, numRows, 1).getValues();
  var max = 0;
  for (var i = 0; i < vals.length; i++) {
    var id = sanitizeSubId_(vals[i][0]);
    var num = parseInt(id, 10);
    if (isFinite(num) && String(num) === id && num > max) max = num;
  }
  return max + 1;
}

/** Следующий ID: PS0001… если на листе уже PS*, иначе число. */
function nextSubscriptionIdForSheet_(sh) {
  if (!sh || getCrmSheetScanLastRow_(sh) < 3) return 1;
  var lr = getCrmSheetScanLastRow_(sh);
  var numRows = lr - 2;
  if (numRows < 1) return 1;
  var vals = sh.getRange(3, 2, numRows, 1).getValues();
  var maxPs = 0;
  var maxNum = 0;
  var hasPs = false;
  for (var i = 0; i < vals.length; i++) {
    var id = sanitizeSubId_(vals[i][0]);
    if (!id) continue;
    var m = /^PS(\d+)$/i.exec(id);
    if (m) {
      hasPs = true;
      var n = parseInt(m[1], 10);
      if (isFinite(n) && n > maxPs) maxPs = n;
    } else {
      var num = parseInt(id, 10);
      if (isFinite(num) && String(num) === id && num > maxNum) maxNum = num;
    }
  }
  if (hasPs) {
    var next = maxPs + 1;
    var s = String(next);
    while (s.length < 4) s = "0" + s;
    return "PS" + s;
  }
  return maxNum + 1;
}

/** Первая пустая строка в основном блоке, не «под таблицей». */
function findEmptySubscriptionRow_(sh) {
  if (!sh) return 3;
  var last = getCrmSheetScanLastRow_(sh);
  var numRows = Math.max(1, last - 2);
  var nicks = sh.getRange(3, 1, numRows, 1).getValues();
  var gap = 0;
  var lastNickRow = 2;
  for (var i = 0; i < nicks.length; i++) {
    var sheetRow = i + 3;
    if (!String(nicks[i][0] || "").trim()) {
      gap++;
      if (gap === 1) return sheetRow;
      if (gap >= 3) break;
      continue;
    }
    gap = 0;
    lastNickRow = sheetRow;
  }
  return lastNickRow + 1;
}

function writeSubscriptionRowValues_(sh, row, vals) {
  var maxCols = Math.max(1, sh.getMaxColumns());
  var need = Math.min(Math.max(vals.length, 5), maxCols);
  var out = [];
  for (var i = 0; i < need; i++) {
    var v = i < vals.length ? vals[i] : "";
    if (v === null || typeof v === "undefined") v = "";
    out.push(v);
  }
  sh.getRange(row, 1, 1, need).setValues([out]);
  return need;
}

/* ----- Подписки CRM ----- */

function handleListSubscriptions(json, callback, fromPost) {
  var crmSs;
  try { crmSs = getCrmSpreadsheet_(); } catch (e) {
    var bad = { status: "error", message: "crm_unavailable", detail: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var only = String((json && (json.sheet || json.segment)) || "").trim();
  var forceRepair = String((json && json.repairIds) || "") === "1" || json.repairIds === true;
  var sheets = only ? [only] : ["ПП", "АФК", "БП"];
  var list = [];
  var repairedSheets = [];
  for (var s = 0; s < sheets.length; s++) {
    var sheetName = sheets[s];
    var seenInSheet = {};
    if (forceRepair) {
      try {
        var shRescue = findSheetByBaseName_(crmSs, sheetName);
        if (shRescue) rescueOrphanSubscriptionRows_(shRescue);
      } catch (eRes) {}
    }
    var data = forceRepair
      ? readCrmSheetLiveNarrow_(crmSs, sheetName, 5)
      : (getCrmSheetValuesFast_(crmSs, sheetName) || readCrmSheetLiveNarrow_(crmSs, sheetName, 5));
    if (!data || data.length < 3) continue;
    // починить ID только по явному repairIds=1 (не на каждый list — это запись на чтение)
    if (forceRepair) {
      try {
        repairSheetSubscriptionIds_(crmSs, sheetName);
        repairedSheets.push(sheetName);
        data = readCrmSheetLiveNarrow_(crmSs, sheetName, 5);
        if (!data || data.length < 3) continue;
      } catch (eRep) {}
    }
    for (var r = 2; r < data.length; r++) {
      var nickRaw = String(data[r][0] || "").trim();
      if (!nickRaw) continue;
      if (/^себестоим/i.test(nickRaw) || /^стоимость\s*100/i.test(nickRaw)) continue;
      var nick = extractInstagramNick_(nickRaw) || displayClientNick_(nickRaw) || nickRaw;
      var subId = sanitizeSubId_(data[r][1]);
      var key = subId
        ? ("id:" + subId.toUpperCase())
        : ("row:" + r + "|n:" + (clientMatchKey_(nickRaw) || nick || "").toUpperCase());
      if (seenInSheet[key]) continue;
      seenInSheet[key] = true;
      var wishesCell = String(data[r][4] || "");
      var statusCell = String(data[r][3] || "");
      var bpMeta = /^БП$/i.test(sheetName) ? parseBpMetaFromWishes_(wishesCell) : null;
      if (/^БП$/i.test(sheetName)) statusCell = normalizeBpStage_(statusCell);
      list.push({
        nick: nick,
        label: nickRaw.replace(/\s+/g, " ").trim().substring(0, 80),
        subId: subId,
        deliveries: Number(data[r][2]) || 0,
        status: statusCell,
        stage: statusCell,
        wishes: wishesCell,
        sheet: sheetName,
        rowIndex: r + 1,
        surveyBp2Due: bpMeta ? bpMeta.surveyBp2Due : "",
        surveyFinalDue: bpMeta ? bpMeta.surveyFinalDue : "",
        lastTouch: bpMeta ? bpMeta.lastTouch : "",
        ownerTelegramId: bpMeta ? bpMeta.ownerTelegramId : "",
        ownerName: bpMeta ? bpMeta.ownerName : ""
      });
    }
  }
  var ok = {
    status: "success",
    subscriptions: list,
    sheet: only || "all",
    count: list.length,
    repairedIds: repairedSheets
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleRepairSubscriptionIds(json, callback, fromPost) {
  var crmSs;
  try { crmSs = getCrmSpreadsheet_(); } catch (e) {
    var bad = { status: "error", message: "crm_unavailable", detail: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var only = String((json && (json.sheet || json.segment)) || "").trim();
  var sheets = only ? [only] : ["ПП", "АФК", "БП"];
  var results = [];
  for (var i = 0; i < sheets.length; i++) {
    results.push({
      sheet: sheets[i],
      result: repairSheetSubscriptionIds_(crmSs, sheets[i])
    });
  }
  var ok = { status: "success", sheets: results };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleGetSubscription(json, callback, fromPost) {
  var crmSs;
  try { crmSs = getCrmSpreadsheet_(); } catch (e) {
    var bad = { status: "error", message: "crm_unavailable" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var nick = String(json.nick || json.client || "").trim();
  var subId = String(json.subId || "").trim();
  var segment = String(json.segment || json.sheet || "ПП").trim() || "ПП";
  var found = findSubscriberBasket_(crmSs, nick || subId, segment);
  var contact = lookupContactAddress_(crmSs, nick);
  var deliveries = 0;
  var status = "";
  var label = nick;
  var factCost = "";
  var rowIndex = 0;
  var packCounts = { u1: 0, u2: 0, u3: 0, up4: 0 };
  try {
    var shName = found.sheet || segment;
    var data = getCrmSheetValuesFast_(crmSs, shName);
    if (data && data.length >= 3) {
      var headers = data[0];
      for (var r = 2; r < data.length; r++) {
        var cell = String(data[r][0] || "");
        if (!cell.trim()) continue;
        if (subId && String(data[r][1] || "").trim() === subId) {
          // ok
        } else if (!nicksMatch_(cell, nick)) continue;
        label = cell.replace(/\s+/g, " ").trim();
        deliveries = Number(data[r][2]) || 0;
        status = String(data[r][3] || "").trim();
        if (!found.wishes) found.wishes = String(data[r][4] || "").trim();
        if (!found.subId) found.subId = String(data[r][1] || "").trim();
        rowIndex = r + 1;
        for (var fc = 0; fc < headers.length; fc++) {
          var h = String(headers[fc] || "").toUpperCase().replace(/\s+/g, " ").trim();
          if (h.indexOf("ФАКТ") >= 0 && h.indexOf("СТОИМ") >= 0) {
            factCost = data[r][fc] != null && data[r][fc] !== "" ? String(data[r][fc]) : "";
          }
          if (h === "У1") packCounts.u1 = Number(data[r][fc]) || 0;
          else if (h === "У2") packCounts.u2 = Number(data[r][fc]) || 0;
          else if (h === "У3") packCounts.u3 = Number(data[r][fc]) || 0;
          else if (h === "УП4") packCounts.up4 = Number(data[r][fc]) || 0;
        }
        break;
      }
    }
  } catch (eRow) {}
  var wishesOut = found.wishes || "";
  var bpMetaGet = /^БП$/i.test(String(found.sheet || segment || "")) ? parseBpMetaFromWishes_(wishesOut) : null;
  if (/^БП$/i.test(String(found.sheet || segment || ""))) status = normalizeBpStage_(status);
  var dogGet = parseDogFromWishesGs_(wishesOut);
  var ok = {
    status: "success",
    nick: extractInstagramNick_(label) || nick,
    label: label,
    subId: found.subId || subId,
    basket: found.basket || [],
    wishes: wishesOut,
    address: contact.address || "",
    phone: contact.phone || "",
    note: contact.note || "",
    sheet: found.sheet || segment,
    deliveries: deliveries,
    ppStatus: status,
    stage: status,
    factCost: factCost,
    statedCost: factCost,
    packCounts: packCounts,
    packagesByn: packagesBynFromUCounts_(packCounts),
    dogName: dogGet.name,
    dogBreed: dogGet.breed,
    dogWeight: dogGet.weight,
    rowIndex: rowIndex,
    surveyBp2Due: bpMetaGet ? bpMetaGet.surveyBp2Due : "",
    surveyFinalDue: bpMetaGet ? bpMetaGet.surveyFinalDue : "",
    lastTouch: bpMetaGet ? bpMetaGet.lastTouch : "",
    ownerTelegramId: bpMetaGet ? bpMetaGet.ownerTelegramId : "",
    ownerName: bpMetaGet ? bpMetaGet.ownerName : ""
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/** Правка карточки подписки: мета + контакты; состав — если передан basket. */
function handleSaveSubscription(json, callback, fromPost) {
  var crmSs;
  try { crmSs = getCrmSpreadsheet_(); } catch (e) {
    var bad = { status: "error", message: "crm_unavailable", detail: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var nick = String(json.nick || json.client || "").trim();
  var label = String(json.label || nick).trim() || nick;
  if (!nick && !label) {
    var need = { status: "error", message: "need_nick" };
    return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
  }
  var sheetName = String(json.sheet || json.segment || "ПП").trim() || "ПП";
  var sh = findSheetByBaseName_(crmSs, sheetName);
  if (!sh) {
    var no = { status: "error", message: "sheet_missing", sheet: sheetName };
    return fromPost ? jsonpText(callback, no) : jsonp(callback, no);
  }
  var subId = String(json.subId || "").trim();
  var deliveriesN = Number(json.deliveries != null ? json.deliveries : json.deliveriesN) || 0;
  var ppStatus = String(json.ppStatus || json.status || "").trim();
  var wishes = String(json.wishes || "").trim();
  if (/^БП$/i.test(sheetName)) {
    ppStatus = normalizeBpStage_(ppStatus || "БП1");
  }
  if (/^ПП$/i.test(sheetName) && (json.coef != null && json.coef !== "")) {
    wishes = stampPpCoefIntoWishesGs_(wishes, json.coef);
  }
  if (json.dogName != null || json.dogBreed != null || json.dogWeight != null || json.dog) {
    wishes = stampDogIntoWishesGs_(wishes, {
      name: json.dogName != null ? json.dogName : (json.dog && json.dog.name),
      breed: json.dogBreed != null ? json.dogBreed : (json.dog && json.dog.breed),
      weight: json.dogWeight != null ? json.dogWeight : (json.dog && json.dog.weight)
    });
  }
  if (/^БП$/i.test(sheetName) || json.surveyBp2Due || json.surveyFinalDue || json.lastTouch || json.lastActivity || json.ownerTelegramId || json.respTelegramId) {
    wishes = stampBpMetaIntoWishes_(wishes, {
      surveyBp2Due: json.surveyBp2Due,
      surveyFinalDue: json.surveyFinalDue,
      lastTouch: json.lastTouch || json.lastActivity || new Date().toISOString(),
      ownerTelegramId: json.ownerTelegramId != null ? json.ownerTelegramId : json.respTelegramId,
      ownerName: json.ownerName != null ? json.ownerName : json.respName
    });
  }

  var factCost = json.factCost != null && json.factCost !== "" ? json.factCost : null;
  // указанная стоимость (ручная) — приоритет над старым factCost
  if (json.statedCost != null && json.statedCost !== "") factCost = json.statedCost;
  var basket = Array.isArray(json.basket) ? json.basket : null;
  var packCountsOpt = json.packCounts || null;
  if (typeof packCountsOpt === "string") {
    try { packCountsOpt = JSON.parse(packCountsOpt); } catch (ePc) { packCountsOpt = null; }
  }
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var data = sh.getDataRange().getValues();
  var rowIdx = -1;
  for (var r = 2; r < data.length; r++) {
    if (subId && String(data[r][1] || "").trim() === subId) { rowIdx = r; break; }
    if (nicksMatch_(data[r][0], nick) || nicksMatch_(data[r][0], label)) { rowIdx = r; break; }
  }
  var createdNew = false;
  if (rowIdx < 0) {
    if (basket != null && Array.isArray(basket) && (/^ПП$/i.test(sheetName) || /^БП$/i.test(sheetName))) {
      if (!subId) { try { subId = nextSubscriptionIdForSheet_(sh); } catch (e) {} }
      var createVals = writePpBasketToRowValues_(
        headers, basket, label, subId,
        deliveriesN || 1,
        ppStatus || (/^БП$/i.test(sheetName) ? "БП1" : "ПП1"),
        wishes, factCost, packCountsOpt
      );
      var up = upsertSubscriptionProductRow_(sh, headers, createVals, basket, nick || label);
      rowIdx = (up && up.row ? up.row : 1) - 1;
      createdNew = !!(up && up.created);
    } else {
      var miss = { status: "error", message: "not_found" };
      return fromPost ? jsonpText(callback, miss) : jsonp(callback, miss);
    }
  } else if (basket != null && Array.isArray(basket)) {
    var rowVals = writePpBasketToRowValues_(
      headers, basket, label, subId || String(data[rowIdx][1] || ""),
      deliveriesN || Number(data[rowIdx][2]) || 1,
      ppStatus || String(data[rowIdx][3] || "") || "ПП1",
      wishes || String(data[rowIdx][4] || ""),
      factCost, packCountsOpt
    );
    while (rowVals.length < headers.length) rowVals.push("");
    applyPpRowValuesPreservingFormulas_(sh, rowIdx + 1, headers, rowVals);
  } else {
    sh.getRange(rowIdx + 1, 1).setValue(label);
    if (headers.length > 1) sh.getRange(rowIdx + 1, 2).setValue(subId || String(data[rowIdx][1] || ""));
    if (headers.length > 2 && deliveriesN > 0) sh.getRange(rowIdx + 1, 3).setValue(deliveriesN);
    if (headers.length > 3 && ppStatus) sh.getRange(rowIdx + 1, 4).setValue(ppStatus);
    if (headers.length > 4) sh.getRange(rowIdx + 1, 5).setValue(wishes);
    if (factCost != null) {
      for (var fc = 0; fc < headers.length; fc++) {
        var h = String(headers[fc] || "").toUpperCase();
        if (h.indexOf("ФАКТ") >= 0 && h.indexOf("СТОИМ") >= 0) {
          sh.getRange(rowIdx + 1, fc + 1).setValue(Number(factCost) || factCost);
          break;
        }
      }
    }
  }
  try {
    var addr = String(json.address || "").trim();
    var phone = String(json.phone || "").trim();
    var note = String(json.note || "").trim();
    var displayName = String(json.displayName || "").trim();
    var matchNick = extractInstagramNick_(label) || nick;
    if (addr || phone || note || displayName) {
      var contacts = findSheetByBaseName_(crmSs, "Контакты");
      if (contacts && contacts.getLastRow() >= 1) {
        var cd = contacts.getDataRange().getValues();
        var foundC = false;
        for (var cr = 1; cr < cd.length; cr++) {
          if (!nicksMatch_(cd[cr][0], matchNick) && !nicksMatch_(cd[cr][0], label)) continue;
          if (displayName) contacts.getRange(cr + 1, 2).setValue(displayName);
          if (addr) contacts.getRange(cr + 1, 4).setValue(addr);
          if (phone) contacts.getRange(cr + 1, 5).setValue(phone);
          if (note || wishes) contacts.getRange(cr + 1, 7).setValue(note || wishes);
          foundC = true;
          break;
        }
        if (!foundC) {
          contacts.appendRow([matchNick, displayName, "", addr, phone, "", note || wishes]);
        }
      }
    }
  } catch (eC) {}
  var surveySync = null;
  if (/^БП$/i.test(sheetName) && rowIdx >= 0) {
    try {
      var nickForSv = extractInstagramNick_(label) || nick || label;
      surveySync = syncBpStageSurveys_(crmSs, nickForSv, ppStatus, {
        surveyBp2Due: json.surveyBp2Due,
        surveyFinalDue: json.surveyFinalDue,
        ownerTelegramId: json.ownerTelegramId != null ? json.ownerTelegramId : json.respTelegramId,
        ownerName: json.ownerName != null ? json.ownerName : json.respName,
        subId: subId,
        note: "from_saveSubscription"
      });
      if (surveySync) {
        var metaFix = { lastTouch: new Date().toISOString() };
        if (ppStatus === "ФИНАЛ" && surveySync.due) {
          metaFix.surveyFinalDue = surveySync.due;
        } else if (surveySync.due) {
          metaFix.surveyBp2Due = surveySync.due;
        }
        wishes = stampBpMetaIntoWishes_(wishes, metaFix);
        if (headers.length > 3) sh.getRange(rowIdx + 1, 4).setValue(ppStatus);
        if (headers.length > 4) sh.getRange(rowIdx + 1, 5).setValue(wishes);
      }
    } catch (eSvSync) {}
  }
  var ok = {
    status: "success",
    nick: extractInstagramNick_(label) || nick,
    label: label,
    sheet: sheetName,
    row: rowIdx + 1,
    created: createdNew,
    ppStatus: ppStatus,
    survey: surveySync && surveySync.survey ? surveySync.survey : null
  };
  try { clearCrmSheetCache_(sheetName); clearCrmSheetCache_("Контакты"); clearCrmSheetCache_("Опросник"); } catch (eClr) {}
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function findSubscriptionRowIndex_(sh, nick, subId) {
  if (!sh || sh.getLastRow() < 2) return -1;
  var data = sh.getDataRange().getValues();
  var wantId = sanitizeSubId_(subId);
  var wantNick = String(nick || "").trim();
  // row1 = headers; row2 иногда тоже шапка — сканируем с индекса 1
  // ВАЖНО: «себестоимость» не break — иначе клиенты ниже маркера не находятся (list их видит)
  for (var r = 1; r < data.length; r++) {
    var cell = String(data[r][0] || "").trim();
    if (!cell) continue;
    if (/^себестоим/i.test(cell) || /^стоимость\s*100/i.test(cell) || /^итого$/i.test(cell)) continue;
    if (/^(id|ник|nick|клиент|client)$/i.test(cell)) continue;
    if (wantId && sanitizeSubId_(data[r][1]) === wantId) return r;
    if (wantNick && (nicksMatch_(cell, wantNick) || cell === wantNick ||
      nicksMatch_(extractInstagramNick_(cell) || cell, wantNick))) return r;
  }
  return -1;
}

/** Все строки подписки по нику/subId (снизу вверх — для безопасного deleteRow). */
function findAllSubscriptionRowIndexes_(sh, nick, subId) {
  var out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var data = sh.getDataRange().getValues();
  var wantId = sanitizeSubId_(subId);
  var wantNick = String(nick || "").trim();
  var wantNick2 = extractInstagramNick_(wantNick) || wantNick;
  for (var r = 1; r < data.length; r++) {
    var cell = String(data[r][0] || "").trim();
    if (!cell) continue;
    if (/^себестоим/i.test(cell) || /^стоимость\s*100/i.test(cell) || /^итого$/i.test(cell)) continue;
    if (/^(id|ник|nick|клиент|client)$/i.test(cell)) continue;
    var hit = false;
    if (wantId && sanitizeSubId_(data[r][1]) === wantId) hit = true;
    if (!hit && wantNick && (nicksMatch_(cell, wantNick) || cell === wantNick)) hit = true;
    if (!hit && wantNick2 && nicksMatch_(cell, wantNick2)) hit = true;
    if (!hit && wantNick && nicksMatch_(extractInstagramNick_(cell) || "", wantNick)) hit = true;
    if (hit) out.push(r);
  }
  return out;
}

/** Все листы-кандидаты «БП» / «ПП» (канон + копии) — delete/list не должны смотреть в разные. */
function listCrmSheetCandidates_(ss, baseName) {
  var out = [];
  if (!ss || !baseName) return out;
  var seen = {};
  function add_(sh) {
    if (!sh) return;
    var id = sh.getSheetId();
    if (seen[id]) return;
    seen[id] = true;
    out.push(sh);
  }
  add_(ss.getSheetByName(baseName));
  add_(ss.getSheetByName(baseName + " (копия)"));
  add_(ss.getSheetByName(baseName + " (copy)"));
  var want = String(baseName).toUpperCase().replace(/ё/g, "Е");
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = String(sheets[i].getName() || "").toUpperCase().replace(/ё/g, "Е");
    if (n === want || n.indexOf(want + " (") === 0) add_(sheets[i]);
  }
  return out;
}

function cancelSurveysForNick_(crmSs, nick) {
  if (!nick) return 0;
  var sh = null;
  try { sh = ensureSurveySheet_(crmSs); } catch (e0) { sh = null; }
  if (!sh || sh.getLastRow() < 2) return 0;
  var data = sh.getDataRange().getValues();
  var n = 0;
  for (var r = 1; r < data.length; r++) {
    if (!nicksMatch_(data[r][1], nick)) continue;
    var st = String(data[r][6] || "").toLowerCase();
    if (st === "cancelled" || st === "done") continue;
    sh.getRange(r + 1, 7).setValue("cancelled");
    sh.getRange(r + 1, 12).setValue(new Date());
    n++;
  }
  return n;
}

/** Отменить открытые опросники ника только одного kind (bp2|final). */
function cancelOpenSurveysForNickKind_(crmSs, nick, kind) {
  if (!nick) return 0;
  var want = normalizeSurveyKind_(kind);
  var sh = null;
  try { sh = ensureSurveySheet_(crmSs); } catch (e0) { sh = null; }
  if (!sh || sh.getLastRow() < 2) return 0;
  var data = sh.getDataRange().getValues();
  var n = 0;
  for (var r = 1; r < data.length; r++) {
    if (!nicksMatch_(data[r][1], nick)) continue;
    if (normalizeSurveyKind_(data[r][3]) !== want) continue;
    var st = String(data[r][6] || "").toLowerCase();
    if (st !== "planned" && st !== "due") continue;
    sh.getRange(r + 1, 7).setValue("cancelled");
    sh.getRange(r + 1, 12).setValue(new Date());
    n++;
  }
  return n;
}

/** Канон этапов БП: БП1 | БП2 | ФИНАЛ */
function normalizeBpStage_(raw) {
  var u = String(raw || "").trim().toUpperCase();
  if (!u) return "БП1";
  if (/ФИНАЛ|FINAL|БП2_FINAL|БП2FINAL/.test(u)) return "ФИНАЛ";
  if (/БП1_SURVEY|БП1SURVEY/.test(u)) return "БП2";
  if (u.indexOf("БП2") >= 0) return "БП2";
  if (/ДУМА/.test(u)) return "ФИНАЛ";
  if (/^БП1$/.test(u) || u.indexOf("БП1") >= 0) return "БП1";
  return "БП1";
}

/**
 * Опросник следует за доставкой клиента БП:
 * БП1 / БП2 — 1-я доставка → опросник kind=bp2 (+4 дня после получения);
 * ФИНАЛ — 2-я доставка → опросник kind=final (+4 дня после получения).
 */
function syncBpStageSurveys_(crmSs, nick, stage, opts) {
  opts = opts || {};
  nick = String(nick || "").trim();
  if (!nick || !crmSs) return { stage: "БП1", survey: null, due: "" };
  stage = normalizeBpStage_(stage);
  var kind = stage === "ФИНАЛ" ? "final" : "bp2";
  var dueRaw = stage === "ФИНАЛ" ? opts.surveyFinalDue : opts.surveyBp2Due;
  var due = surveyDueYmd_(dueRaw) || String(dueRaw || "").trim() || ymdPlusDays_("", 4);
  var survey = null;
  try {
    survey = upsertOpenSurvey_(crmSs, {
      nick: nick,
      kind: kind,
      dueDate: due,
      stage: stage,
      status: "planned",
      templateId: surveyTemplateForKind_(kind),
      ownerTelegramId: opts.ownerTelegramId || "",
      ownerName: opts.ownerName || "",
      note: opts.note || "from_bp_stage",
      linkedSheet: "БП",
      linkedSubId: opts.subId || "",
      matchKey: opts.matchKey || clientMatchKey_(nick) || "",
      forceDue: true
    });
  } catch (eU) {}
  try {
    // на этапе 1-й доставки/опроса — не держим финальный; на финале — закрываем открытый bp2
    cancelOpenSurveysForNickKind_(crmSs, nick, stage === "ФИНАЛ" ? "bp2" : "final");
  } catch (eK) {}
  return { stage: stage, survey: survey, due: due, kind: kind };
}

function handleMoveSubscription(json, callback, fromPost) {
  var crmSs;
  try { crmSs = getCrmSpreadsheet_(); } catch (e) {
    var bad = { status: "error", message: "crm_unavailable", detail: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var fromSheet = String(json.fromSheet || json.sheet || "").trim();
  var toSheet = String(json.toSheet || json.targetSheet || "").trim();
  var nick = String(json.nick || json.client || "").trim();
  var subId = String(json.subId || "").trim();
  if (!fromSheet || !toSheet || (!nick && !subId)) {
    var need = { status: "error", message: "need_from_to_nick" };
    return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
  }
  if (fromSheet === toSheet) {
    var same = { status: "success", message: "same_sheet", sheet: toSheet };
    return fromPost ? jsonpText(callback, same) : jsonp(callback, same);
  }
  var fromSh = findSheetByBaseName_(crmSs, fromSheet);
  var toSh = findSheetByBaseName_(crmSs, toSheet);
  if (!fromSh || !toSh) {
    var no = { status: "error", message: "sheet_missing", fromSheet: fromSheet, toSheet: toSheet };
    return fromPost ? jsonpText(callback, no) : jsonp(callback, no);
  }
  var rowIdx = findSubscriptionRowIndex_(fromSh, nick, subId);
  if (rowIdx < 0) {
    var miss = { status: "error", message: "not_found" };
    return fromPost ? jsonpText(callback, miss) : jsonp(callback, miss);
  }
  var colsFrom = Math.max(fromSh.getLastColumn(), 1);
  var vals = fromSh.getRange(rowIdx + 1, 1, 1, colsFrom).getValues()[0];
  var movedLabel = String(vals[0] || nick || "").trim();
  if (!movedLabel) {
    var emptyNick = { status: "error", message: "empty_nick_row", row: rowIdx + 1 };
    return fromPost ? jsonpText(callback, emptyNick) : jsonp(callback, emptyNick);
  }
  vals[1] = nextSubscriptionIdForSheet_(toSh);
  var isBpToPp = /^БП$/i.test(fromSheet) && /^ПП$/i.test(toSheet);
  if (isBpToPp) {
    try {
      var tzMove = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Europe/Minsk";
      var ymdMove = Utilities.formatDate(new Date(), tzMove, "yyyy-MM-dd");
      vals[4] = stampFromBpIntoWishes_(String(vals[4] || ""), ymdMove);
    } catch (eStamp) {}
  }
  var insertRow = findEmptySubscriptionRow_(toSh);
  writeSubscriptionRowValues_(toSh, insertRow, vals);
  try { SpreadsheetApp.flush(); } catch (eFl0) {}
  var written = String(toSh.getRange(insertRow, 1).getValue() || "").trim();
  if (!written) {
    var failW = { status: "error", message: "write_failed", toSheet: toSheet, row: insertRow };
    return fromPost ? jsonpText(callback, failW) : jsonp(callback, failW);
  }
  fromSh.deleteRow(rowIdx + 1);
  try { SpreadsheetApp.flush(); } catch (eFl) {}
  var movedNick = extractInstagramNick_(movedLabel) || displayClientNick_(movedLabel) || nick;
  if (isBpToPp) {
    try {
      appendStatsConversion_(SpreadsheetApp.getActiveSpreadsheet(), {
        nick: movedNick,
        label: movedLabel,
        fromSheet: fromSheet,
        toSheet: toSheet,
        subId: sanitizeSubId_(toSh.getRange(insertRow, 2).getValue()),
        note: "moveSubscription"
      });
    } catch (eConv) {}
  }
  var surveysMoved = 0;
  try {
    var mv = moveSurveysWithClient_(crmSs, movedLabel || nick, {
      toNick: movedLabel || nick,
      toSheet: toSheet
    });
    surveysMoved = (mv && mv.moved) || 0;
    if (movedNick && movedNick !== movedLabel) {
      var mv2 = moveSurveysWithClient_(crmSs, movedNick, {
        toNick: movedLabel || movedNick,
        toSheet: toSheet
      });
      surveysMoved += (mv2 && mv2.moved) || 0;
    }
  } catch (eSvMove) {}
  try {
    var fromData = readCrmSheetLiveNarrow_(crmSs, fromSheet, 2);
    if (sheetNeedsSubscriptionIdRepair_(fromData)) repairSheetSubscriptionIds_(crmSs, fromSheet);
    var toDataFix = readCrmSheetLiveNarrow_(crmSs, toSheet, 2);
    if (sheetNeedsSubscriptionIdRepair_(toDataFix)) repairSheetSubscriptionIds_(crmSs, toSheet);
  } catch (eRep) {}
  try {
    clearCrmSheetCache_(fromSheet);
    clearCrmSheetCache_(toSheet);
    clearCrmSheetCache_("Опросник");
    clearCrmSheetCache_();
  } catch (eC) {}
  var movedId = sanitizeSubId_(toSh.getRange(insertRow, 2).getValue());
  var ok = {
    status: "success",
    nick: movedNick,
    label: movedLabel,
    subId: movedId || String(vals[1] || ""),
    fromSheet: fromSheet,
    toSheet: toSheet,
    row: insertRow,
    deliveries: Number(vals[2]) || 0,
    statusText: String(vals[3] || ""),
    wishes: String(vals[4] || ""),
    surveysMoved: surveysMoved
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/** Удалить строки подписки на листах-кандидатах. Без rescue/repair (дорого) — вызывающий чистит раз. */
function deleteSubscriptionRowsFast_(crmSs, sheetName, nick, subId) {
  var sheets = listCrmSheetCandidates_(crmSs, sheetName);
  var deletedRows = [];
  var deletedFrom = [];
  var total = 0;
  var tried = [];
  for (var s = 0; s < sheets.length; s++) {
    var sh = sheets[s];
    tried.push(sh.getName());
    var idxs = findAllSubscriptionRowIndexes_(sh, nick, subId);
    if (!idxs.length && nick) idxs = findAllSubscriptionRowIndexes_(sh, nick, "");
    if (!idxs.length && subId) idxs = findAllSubscriptionRowIndexes_(sh, "", subId);
    if (!idxs.length) continue;
    idxs.sort(function (a, b) { return b - a; });
    for (var i = 0; i < idxs.length; i++) {
      var row1 = idxs[i] + 1;
      try {
        sh.getRange(row1, 1).setValue("");
        sh.deleteRow(row1);
      } catch (eDel) {
        try { sh.getRange(row1, 1, 1, Math.min(5, sh.getLastColumn())).clearContent(); } catch (eClr) {}
      }
      deletedRows.push(row1);
      total++;
    }
    deletedFrom.push(sh.getName());
  }
  return {
    deletedCount: total,
    deletedRows: deletedRows,
    deletedFrom: deletedFrom,
    triedSheets: tried
  };
}

function handleDeleteSubscription(json, callback, fromPost) {
  var crmSs;
  try { crmSs = getCrmSpreadsheet_(); } catch (e) {
    var bad = { status: "error", message: "crm_unavailable", detail: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var sheetName = String(json.sheet || json.segment || "").trim() || "ПП";
  var nick = String(json.nick || json.client || json.label || "").trim();
  var subId = String(json.subId || "").trim();
  if (!nick && !subId) {
    var need = { status: "error", message: "need_nick" };
    return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
  }
  var sheets = listCrmSheetCandidates_(crmSs, sheetName);
  if (!sheets.length) {
    var no = { status: "error", message: "sheet_missing", sheet: sheetName };
    return fromPost ? jsonpText(callback, no) : jsonp(callback, no);
  }
  var del = deleteSubscriptionRowsFast_(crmSs, sheetName, nick, subId);
  if (!del.deletedCount) {
    var miss = {
      status: "error",
      message: "not_found",
      nick: nick,
      subId: subId,
      sheet: sheetName,
      triedSheets: del.triedSheets || []
    };
    return fromPost ? jsonpText(callback, miss) : jsonp(callback, miss);
  }
  var surveysCancelled = 0;
  try { surveysCancelled = cancelSurveysForNick_(crmSs, nick); } catch (eSv) {}
  try { SpreadsheetApp.flush(); } catch (eFl) {}
  try {
    clearCrmSheetCache_(sheetName);
    clearCrmSheetCache_("Опросник");
    clearCrmSheetCache_();
  } catch (eC) {}
  var ok = {
    status: "success",
    nick: nick,
    subId: subId,
    sheet: sheetName,
    deletedRow: del.deletedRows[0] || 0,
    deletedRows: del.deletedRows,
    deletedCount: del.deletedCount,
    deletedFrom: del.deletedFrom,
    surveysCancelled: surveysCancelled
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/** Пачка удаления БП/ПП: один запрос, опросники разом, без repair на каждого. */
function handleDeleteSubscriptionBatch(json, callback, fromPost) {
  var crmSs;
  try { crmSs = getCrmSpreadsheet_(); } catch (e) {
    var bad = { status: "error", message: "crm_unavailable", detail: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var sheetName = String(json.sheet || json.segment || "").trim() || "БП";
  var items = json.items || json.targets || json.nicks || [];
  if (typeof items === "string") {
    try { items = JSON.parse(items); } catch (eJ) { items = []; }
  }
  if (!Array.isArray(items)) items = [];
  if (!items.length && (json.nick || json.subId)) {
    items = [{ nick: json.nick || json.label || "", subId: json.subId || "" }];
  }
  if (!items.length) {
    var need = { status: "error", message: "need_items" };
    return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
  }
  var sheets = listCrmSheetCandidates_(crmSs, sheetName);
  if (!sheets.length) {
    var no = { status: "error", message: "sheet_missing", sheet: sheetName };
    return fromPost ? jsonpText(callback, no) : jsonp(callback, no);
  }
  var okN = 0;
  var fail = [];
  var totalRows = 0;
  var nickSet = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    if (typeof it === "string") it = { nick: it };
    var nick = String(it.nick || it.label || it.client || "").trim();
    var subId = String(it.subId || "").trim();
    if (!nick && !subId) {
      fail.push({ i: i, message: "need_nick" });
      continue;
    }
    var del = deleteSubscriptionRowsFast_(crmSs, sheetName, nick, subId);
    if (!del.deletedCount) {
      fail.push({ i: i, nick: nick, subId: subId, message: "not_found" });
      continue;
    }
    okN++;
    totalRows += del.deletedCount;
    if (nick) nickSet[nick] = true;
  }
  var surveysCancelled = 0;
  var nicks = Object.keys(nickSet);
  for (var n = 0; n < nicks.length; n++) {
    try { surveysCancelled += cancelSurveysForNick_(crmSs, nicks[n]) || 0; } catch (eSv) {}
  }
  try { SpreadsheetApp.flush(); } catch (eFl) {}
  try {
    clearCrmSheetCache_(sheetName);
    clearCrmSheetCache_("Опросник");
    clearCrmSheetCache_();
  } catch (eC) {}
  var ok = {
    status: "success",
    sheet: sheetName,
    deletedPeople: okN,
    deletedCount: totalRows,
    failed: fail,
    failCount: fail.length,
    surveysCancelled: surveysCancelled
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handlePushSubscriptionToDay(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dateStr = json.date || json.deliveryDate || "";
  var nick = String(json.nick || json.client || "").trim();
  if (!dateStr || !nick) {
    var bad = { status: "error", message: "need_date_and_nick" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var suggest = buildPpOrderSuggest_(ss, nick, "", dateStr);
  var contact = suggest.address != null ? { address: suggest.address, note: suggest.note || "" }
    : lookupContactAddress_(getCrmSpreadsheet_(), nick);
  return handleSaveBooking(ss, {
    date: dateStr,
    client: nick,
    subId: suggest.subId || json.subId || "",
    address: json.address || contact.address || suggest.address || "",
    note: json.note || ([suggest.wishes, contact.note || suggest.note].filter(Boolean).join(" ")),
    basket: suggest.proposedBasket || suggest.monthlyBasket || [],
    source: "subscription",
    alsoSaveOrder: false
  }, callback, fromPost);
}


/* ----- ПП: месячный состав → доставки + оплата N=2 ----- */

function ppBasketItemKey_(it) {
  var cat = String((it && it.cat) || "").trim().toLowerCase();
  var name = String((it && (it.main || it.name)) || "").trim().toUpperCase().replace(/Ё/g, "Е");
  var sub = String((it && it.sub) || "").trim().toUpperCase().replace(/Ё/g, "Е");
  return cat + "|" + name + "|" + sub;
}

function isPpChewItem_(it) {
  var cat = String((it && it.cat) || "").toLowerCase();
  if (cat === "chews" || cat === "chew") return true;
  if (cat === "dressura") return false;
  // шт / жевалки по имени
  var name = String((it && (it.main || it.name)) || "");
  return /шт\.?|колен|копыт|нос|ухо|уши|шея|хрящ|лоп|хвост|рога?|сустав|быч|трахе|аорт|станова|переп|губ|утин/i.test(name);
}

function clonePpBasket_(list) {
  var out = [];
  for (var i = 0; i < (list || []).length; i++) {
    var it = list[i] || {};
    var v = Number(it.value != null ? it.value : it.val) || 0;
    if (v <= 0) continue;
    out.push({
      cat: it.cat || (isPpChewItem_(it) ? "chews" : "dressura"),
      main: it.main || it.name || "",
      name: it.name || it.main || "",
      sub: it.sub || "",
      value: v,
      val: v
    });
  }
  return out;
}

/** Первая доля: дрессура floor(n/2), жевалки ceil(n/2). Вторая — остаток. */
function splitQtyForPpSlot_(qty, isChew, slot) {
  var v = Number(qty) || 0;
  if (v <= 0) return 0;
  var first = isChew ? Math.ceil(v / 2) : Math.floor(v / 2);
  if (first <= 0 && v > 0) first = v; // 1г дрессуры → целиком в 1-ю
  if (slot <= 1) return first;
  return Math.max(0, v - first);
}

function proposePpSlotBasket_(monthly, slot, deliveriesN, slot1Basket) {
  var full = clonePpBasket_(monthly);
  if (!full.length) return [];
  if (!(Number(deliveriesN) >= 2)) return full;
  var s = Number(slot) || 1;
  if (s >= 2 && slot1Basket && slot1Basket.length) {
    return remainderPpBasket_(full, slot1Basket);
  }
  var out = [];
  for (var i = 0; i < full.length; i++) {
    var it = full[i];
    var chew = isPpChewItem_(it);
    var part = splitQtyForPpSlot_(it.value, chew, s <= 1 ? 1 : 2);
    if (part <= 0) continue;
    out.push({
      cat: it.cat,
      main: it.main,
      name: it.name,
      sub: it.sub,
      value: part,
      val: part
    });
  }
  return out;
}

function remainderPpBasket_(monthly, delivered) {
  var left = {};
  var meta = {};
  var i;
  for (i = 0; i < (monthly || []).length; i++) {
    var m = monthly[i] || {};
    var k = ppBasketItemKey_(m);
    var v = Number(m.value != null ? m.value : m.val) || 0;
    left[k] = (left[k] || 0) + v;
    if (!meta[k]) meta[k] = m;
  }
  for (i = 0; i < (delivered || []).length; i++) {
    var d = delivered[i] || {};
    var kd = ppBasketItemKey_(d);
    var vd = Number(d.value != null ? d.value : d.val) || 0;
    left[kd] = (left[kd] || 0) - vd;
  }
  var out = [];
  for (var key in left) {
    if (!left.hasOwnProperty(key)) continue;
    var rem = left[key];
    if (!(rem > 0)) continue;
    var src = meta[key] || {};
    out.push({
      cat: src.cat || "dressura",
      main: src.main || src.name || "",
      name: src.name || src.main || "",
      sub: src.sub || "",
      value: rem,
      val: rem
    });
  }
  return out;
}

function ppMonthCycleKey_(dateValue, tz) {
  return "PP_CYCLE:" + Utilities.formatDate(dateValue, tz || "Europe/Minsk", "yyyy-MM");
}

function getPpMonthCycleStore_(memory, monthKey, tz) {
  var all = getMemoryJson_(memory, monthKey, tz);
  if (!all || typeof all !== "object" || Object.prototype.toString.call(all) === "[object Array]") return {};
  return all;
}

function getPpCycleEntry_(memory, dateValue, tz, clientName) {
  var store = getPpMonthCycleStore_(memory, ppMonthCycleKey_(dateValue, tz), tz);
  var want = clientMatchKey_(clientName) || String(clientName || "").trim().toUpperCase();
  var e = store[want] || store[String(clientName || "").trim().toUpperCase()];
  if (e && typeof e === "object") return e;
  for (var k in store) {
    if (!Object.prototype.hasOwnProperty.call(store, k)) continue;
    if (nicksMatch_(k, clientName) || (want && clientMatchKey_(k) === want)) {
      if (store[k] && typeof store[k] === "object") return store[k];
    }
  }
  return null;
}

function savePpCycleEntry_(memory, dateValue, tz, clientName, entry) {
  if (!memory) return;
  var key = ppMonthCycleKey_(dateValue, tz);
  var store = getPpMonthCycleStore_(memory, key, tz);
  var id = clientMatchKey_(clientName) || String(clientName || "").trim().toUpperCase();
  store[id] = entry;
  saveMemoryJson_(memory, key, store, tz);
}

function parseMemoryDateLoose_(v, tz) {
  if (v == null || v === "") return null;
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) return v;
  try {
    var s = String(v).trim();
    var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (m) {
      var y = Number(m[3]);
      if (y < 100) y += 2000;
      return new Date(y, Number(m[2]) - 1, Number(m[1]));
    }
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  } catch (e) {}
  return null;
}

/** История ПП-клиента в мини-аппе: был ли, последняя доставка, какой слот ждать. */
function findPpClientHistoryMeta_(ss, clientName, asOfDate) {
  var tz = (ss && ss.getSpreadsheetTimeZone()) || "Europe/Minsk";
  var asOf = asOfDate instanceof Date ? asOfDate : (parseFlexibleDate_(asOfDate, tz) || new Date());
  var asOfDay = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  var wantKey = clientMatchKey_(clientName) || "";
  var wantU = String(clientName || "").trim().toUpperCase();
  var everSeen = false;
  var lastDate = null;
  var lastSlot = 0;

  function considerDate_(d, slotHint) {
    if (!d || isNaN(d.getTime())) return;
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    everSeen = true;
    if (!lastDate || day.getTime() > lastDate.getTime()) {
      lastDate = day;
      if (slotHint >= 1) lastSlot = slotHint;
    } else if (lastDate && day.getTime() === lastDate.getTime() && slotHint >= 1) {
      lastSlot = slotHint;
    }
  }

  function slotFromLabel_(raw) {
    return parseForcedPpSlot_(raw, 2) || 0;
  }

  // Календарь_Дат — факт «числился в мини-аппе»
  try {
    var cal = readAllCalendarRows_();
    for (var i = 0; i < cal.length; i++) {
      var st = String(cal[i].status || "").toLowerCase();
      if (st === "cancelled") continue;
      var mk = cal[i].matchKey || clientMatchKey_(cal[i].client) || "";
      if (!(mk && wantKey && mk === wantKey) && !nicksMatch_(cal[i].client, clientName)) continue;
      everSeen = true;
      var bd = parseFlexibleDate_(cal[i].date, tz) || parseFlexibleDate_(cal[i].dateIso, tz);
      considerDate_(bd, slotFromLabel_(cal[i].ppSlot));
    }
  } catch (eCal) {}

  // Брони
  try {
    var books = readAllBookings_();
    for (var b = 0; b < books.length; b++) {
      if (String(books[b].status || "").toLowerCase() === "cancelled") continue;
      if (!nicksMatch_(books[b].client, clientName)) continue;
      everSeen = true;
      considerDate_(parseFlexibleDate_(books[b].date, tz), slotFromLabel_(books[b].ppSlot));
    }
  } catch (eBk) {}

  // Память_Доставок — реальные галочки «доставлен»
  try {
    var memory = getMemoryCourierSheet_();
    if (memory && memory.getLastRow() >= 1) {
      var data = memory.getDataRange().getValues();
      for (var r = 0; r < data.length; r++) {
        var rawKey = String(data[r][0] || "");
        if (/^(PP_CYCLE:|WEEK_PAID:|PP_SLOT_ANCHOR)/i.test(rawKey)) {
          // цикл месяца: слот1/слот2
          if (/^PP_CYCLE:/i.test(rawKey)) {
            var store = null;
            try { store = JSON.parse(String(data[r][1] || "")); } catch (eS) { store = null; }
            if (store && typeof store === "object") {
              var ent = store[wantKey] || store[wantU];
              if (ent && typeof ent === "object") {
                everSeen = true;
                if (ent.slot2 && ent.slot2.date) {
                  considerDate_(parseMemoryDateLoose_(ent.slot2.date, tz) || parseFlexibleDate_(ent.slot2.date, tz), 2);
                }
                if (ent.slot1 && ent.slot1.date) {
                  considerDate_(parseMemoryDateLoose_(ent.slot1.date, tz) || parseFlexibleDate_(ent.slot1.date, tz), 1);
                }
              }
            }
          }
          continue;
        }
        var parsed = parseMemoryDateLoose_(data[r][0], tz);
        if (!parsed) continue;
        var mem = null;
        try { mem = JSON.parse(String(data[r][1] || "")); } catch (eJ) { mem = null; }
        if (!mem || typeof mem !== "object" || Object.prototype.toString.call(mem) === "[object Array]") continue;
        var hit = false;
        if (wantU && normalizeMemDelivered_(mem[wantU])) hit = true;
        if (!hit && wantKey && normalizeMemDelivered_(mem[wantKey])) hit = true;
        if (!hit) {
          for (var k in mem) {
            if (!Object.prototype.hasOwnProperty.call(mem, k)) continue;
            if (nicksMatch_(k, clientName) && normalizeMemDelivered_(mem[k])) { hit = true; break; }
          }
        }
        if (hit) considerDate_(parsed, 0);
      }
    }
  } catch (eMem) {}

  // профиль «Клиенты»
  try {
    var phone = lookupClientProfilePhone_(ss, clientName);
    if (phone) everSeen = true;
    var sh = getClientsProfilesSheet_();
    var pdata = sh.getDataRange().getValues();
    for (var p = 1; p < pdata.length; p++) {
      var n = String(pdata[p][0] || "").trim();
      if (!n) continue;
      if (nicksMatch_(n, clientName) || (wantKey && clientMatchKey_(n) === wantKey)) {
        everSeen = true;
        var upd = pdata[p][4];
        if (upd) considerDate_(upd instanceof Date ? upd : parseFlexibleDate_(upd, tz), 0);
        break;
      }
    }
  } catch (eProf) {}

  var daysSince = null;
  if (lastDate) {
    daysSince = Math.floor((asOfDay.getTime() - lastDate.getTime()) / 86400000);
    if (daysSince < 0) daysSince = 0;
  }

  // какая «должна быть» следующая: после 1 → 2, после 2 (или неизвестно) → 1
  var suggestedSlot = 1;
  if (lastSlot === 1) suggestedSlot = 2;
  else if (lastSlot === 2) suggestedSlot = 1;
  else if (lastSlot >= 1) suggestedSlot = lastSlot;

  // needConfirmSlot — legacy; канон с v7.11.129: shouldAskPpSlotConfirm_(ss, nick, N)
  var needConfirmSlot = !everSeen || daysSince == null || daysSince > 30;

  return {
    everSeen: everSeen,
    lastDeliveryDate: lastDate ? dateKey_(lastDate, tz) : "",
    daysSinceLastDelivery: daysSince,
    lastSlot: lastSlot,
    suggestedSlot: suggestedSlot,
    needConfirmSlot: needConfirmSlot
  };
}

/** Один раз на клиента: менеджер подтвердил ПП 1/2 → дальше считаем от якоря. */
function ppSlotAnchorStoreKey_() {
  return "PP_SLOT_ANCHOR";
}

function getPpSlotAnchorEntry_(ss, clientName) {
  if (!clientName) return null;
  var memory = getMemoryCourierSheet_();
  if (!memory) return null;
  var tz = (ss && ss.getSpreadsheetTimeZone()) || "Europe/Minsk";
  var store = null;
  try { store = getMemoryJson_(memory, ppSlotAnchorStoreKey_(), tz); } catch (e) { store = null; }
  if (!store || typeof store !== "object" || Object.prototype.toString.call(store) === "[object Array]") return null;
  var want = clientMatchKey_(clientName) || String(clientName || "").trim().toUpperCase();
  if (store[want] && store[want].confirmed) return store[want];
  for (var k in store) {
    if (!Object.prototype.hasOwnProperty.call(store, k)) continue;
    if (nicksMatch_(k, clientName) || (want && clientMatchKey_(k) === want)) {
      if (store[k] && store[k].confirmed) return store[k];
    }
  }
  return null;
}

function hasPpSlotAnchor_(ss, clientName) {
  return !!getPpSlotAnchorEntry_(ss, clientName);
}

function markPpSlotAnchor_(ss, clientName, slot, dateValue) {
  if (!clientName || !(Number(slot) >= 1)) return false;
  var memory = getMemoryCourierSheet_();
  if (!memory) return false;
  var tz = (ss && ss.getSpreadsheetTimeZone()) || "Europe/Minsk";
  var store = null;
  try { store = getMemoryJson_(memory, ppSlotAnchorStoreKey_(), tz); } catch (eR) { store = null; }
  if (!store || typeof store !== "object" || Object.prototype.toString.call(store) === "[object Array]") store = {};
  var id = clientMatchKey_(clientName) || String(clientName || "").trim().toUpperCase();
  store[id] = {
    confirmed: true,
    slot: Number(slot),
    at: dateValue ? formatSheetDate(dateValue, tz) : formatSheetDate(new Date(), tz),
    client: String(clientName || "").trim(),
    ts: new Date().toISOString()
  };
  saveMemoryJson_(memory, ppSlotAnchorStoreKey_(), store, tz);
  return true;
}

/** ПП N=2: спросить слот один раз на клиента, пока нет якоря. */
function shouldAskPpSlotConfirm_(ss, clientName, deliveriesN) {
  if (!(Number(deliveriesN) >= 2)) return false;
  if (!clientName) return true;
  try {
    return !hasPpSlotAnchor_(ss, clientName);
  } catch (eAsk) {
    return true;
  }
}

/** Сколько ПП-доставок у клиента уже было в этом календарном месяце строго до dateValue. */
function countPpPriorDeliveriesThisMonth_(ss, clientName, dateValue, tz) {
  var wantKey = clientMatchKey_(clientName) || "";
  var wantU = String(clientName || "").trim().toUpperCase();
  if ((!wantKey && !wantU) || !dateValue) return 0;
  var ym = Utilities.formatDate(dateValue, tz, "yyyy-MM");
  var asOfMs = new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate()).getTime();
  var seen = {};

  function addDay_(d) {
    if (!d || isNaN(d.getTime())) return;
    if (Utilities.formatDate(d, tz, "yyyy-MM") !== ym) return;
    var dayMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (dayMs >= asOfMs) return; // только строго раньше сегодняшней даты доставки
    var dt = formatSheetDate(d, tz);
    if (dt && !seen[dt]) seen[dt] = true;
  }

  function memHit_(mem) {
    if (!mem || typeof mem !== "object" || Object.prototype.toString.call(mem) === "[object Array]") return false;
    if (wantKey && normalizeMemDelivered_(mem[wantKey])) return true;
    if (wantU && normalizeMemDelivered_(mem[wantU])) return true;
    if (normalizeMemDelivered_(memFlagEntry_(mem, clientName))) return true;
    for (var k in mem) {
      if (!Object.prototype.hasOwnProperty.call(mem, k)) continue;
      if (/^(PP_CYCLE:|WEEK_PAID:|PP_SLOT_ANCHOR)/i.test(k)) continue;
      if (nicksMatch_(k, clientName) && normalizeMemDelivered_(mem[k])) return true;
    }
    return false;
  }

  // 1) Память_Доставок — галочки «доставлен»
  try {
    var memory = getMemoryCourierSheet_();
    if (memory && memory.getLastRow() >= 1) {
      var data = memory.getDataRange().getValues();
      for (var i = 0; i < data.length; i++) {
        var rawKey = String(data[i][0] || "");
        if (/^(PP_CYCLE:|WEEK_PAID:|PP_SLOT_ANCHOR)/i.test(rawKey)) {
          if (/^PP_CYCLE:/i.test(rawKey) && rawKey.indexOf(ym) >= 0) {
            var store = null;
            try { store = JSON.parse(String(data[i][1] || "")); } catch (eS) { store = null; }
            if (store && typeof store === "object") {
              var ent = (wantKey && store[wantKey]) || store[wantU];
              if (!ent) {
                for (var sk in store) {
                  if (!Object.prototype.hasOwnProperty.call(store, sk)) continue;
                  if (nicksMatch_(sk, clientName)) { ent = store[sk]; break; }
                }
              }
              if (ent && typeof ent === "object") {
                if (ent.slot1 && ent.slot1.date) {
                  addDay_(parseMemoryDateLoose_(ent.slot1.date, tz) || parseFlexibleDate_(ent.slot1.date, tz));
                }
                if (ent.slot2 && ent.slot2.date) {
                  addDay_(parseMemoryDateLoose_(ent.slot2.date, tz) || parseFlexibleDate_(ent.slot2.date, tz));
                }
              }
            }
          }
          continue;
        }
        var parsed = parseMemoryDateLoose_(data[i][0], tz);
        if (!parsed) continue;
        var mem = null;
        try { mem = JSON.parse(String(data[i][1] || "")); } catch (eJ) { mem = null; }
        if (memHit_(mem)) addDay_(parsed);
      }
    }
  } catch (eMem) {}

  // 2) Календарь_Дат — запланированные/состоявшиеся ПП в месяце
  try {
    var cal = readAllCalendarRows_();
    for (var c = 0; c < cal.length; c++) {
      var st = String(cal[c].status || "").toLowerCase();
      if (st === "cancelled") continue;
      var mk = cal[c].matchKey || clientMatchKey_(cal[c].client) || "";
      if (!(wantKey && mk && mk === wantKey) && !nicksMatch_(cal[c].client, clientName)) continue;
      var seg = String(cal[c].segment || "").toUpperCase();
      var src = String(cal[c].source || "").toLowerCase();
      var isPp = (seg === "ПП" || seg === "PP" || seg === "АФК" || src === "pp" || src === "subscription");
      if (!isPp && String(cal[c].ppSlot || "").trim()) isPp = true;
      if (!isPp) continue;
      var bd = parseFlexibleDate_(cal[c].date, tz) || parseFlexibleDate_(cal[c].dateIso, tz);
      addDay_(bd);
    }
  } catch (eCal) {}

  // 3) Брони
  try {
    var books = readAllBookings_();
    for (var b = 0; b < books.length; b++) {
      if (String(books[b].status || "").toLowerCase() === "cancelled") continue;
      if (!nicksMatch_(books[b].client, clientName)) continue;
      var bseg = String(books[b].segment || "").toUpperCase();
      var bsrc = String(books[b].source || "").toLowerCase();
      var isPpB = (bseg === "ПП" || bseg === "PP" || bseg === "АФК" || bsrc === "pp" || bsrc === "subscription");
      if (!isPpB && String(books[b].ppSlot || "").trim()) isPpB = true;
      if (!isPpB) continue;
      addDay_(parseFlexibleDate_(books[b].date, tz));
    }
  } catch (eBk) {}

  // 4) лист «Доставки» если дата месяца и уже отмечен, и день раньше asOf
  try {
    var courier = ss.getSheetByName("Доставки");
    if (courier) {
      var curParsed = parseMemoryDateLoose_(courier.getRange("A1").getValue(), tz);
      if (curParsed && Utilities.formatDate(curParsed, tz, "yyyy-MM") === ym) {
        var col = findCourierClientCol_(courier, clientName);
        if (col > 0 && courier.getRange(2, col).getValue() === true) addDay_(curParsed);
      }
    }
  } catch (eC) {}

  var n = 0;
  for (var k in seen) {
    if (Object.prototype.hasOwnProperty.call(seen, k)) n++;
  }
  return n;
}

/** Явный слот с Календарь_Дат / Брони на эту дату (если менеджер уже выбрал ПП 1/2). */
function lookupStoredPpSlotForDate_(ss, clientName, dateValue, tz) {
  if (!clientName || !dateValue) return 0;
  var wantKey = clientMatchKey_(clientName) || "";
  var wantDate = dateKey_(dateValue, tz);
  var wantIso = isoDateKey_(dateValue, tz);
  try {
    var cal = readAllCalendarRows_();
    for (var i = 0; i < cal.length; i++) {
      var st = String(cal[i].status || "").toLowerCase();
      if (st === "cancelled") continue;
      var mk = cal[i].matchKey || clientMatchKey_(cal[i].client) || "";
      if (!(wantKey && mk && mk === wantKey) && !nicksMatch_(cal[i].client, clientName)) continue;
      var bd = parseFlexibleDate_(cal[i].date, tz) || parseFlexibleDate_(cal[i].dateIso, tz);
      if (!bd) continue;
      if (dateKey_(bd, tz) !== wantDate && isoDateKey_(bd, tz) !== wantIso) continue;
      var slot = parseForcedPpSlot_(cal[i].ppSlot, 2);
      if (slot >= 1) return slot;
    }
  } catch (eCal) {}
  try {
    var books = readAllBookings_();
    for (var b = 0; b < books.length; b++) {
      if (String(books[b].status || "").toLowerCase() === "cancelled") continue;
      if (!nicksMatch_(books[b].client, clientName)) continue;
      var bdate = parseFlexibleDate_(books[b].date, tz);
      if (!bdate) continue;
      if (dateKey_(bdate, tz) !== wantDate) continue;
      var slotB = parseForcedPpSlot_(books[b].ppSlot, 2);
      if (slotB >= 1) return slotB;
    }
  } catch (eBk) {}
  return 0;
}

function resolvePpDeliverySlot_(ss, clientName, dateValue, tz, deliveredToday, opts) {
  opts = opts || {};
  var memory = getMemoryCourierSheet_();
  var cycle = getPpCycleEntry_(memory, dateValue, tz, clientName);
  var deliveriesN = lookupPpDeliveries_(clientName);
  if (!(deliveriesN >= 1)) deliveriesN = 0;
  var dateText = formatSheetDate(dateValue, tz);

  // 1) явный слот заказа (календарь / бронь / opts)
  var forced = parseForcedPpSlot_(
    opts.ppSlot != null ? opts.ppSlot : (opts.deliverySlot != null ? opts.deliverySlot : opts.slot),
    deliveriesN || 2
  );
  if (!(forced >= 1)) {
    try { forced = lookupStoredPpSlotForDate_(ss, clientName, dateValue, tz); } catch (eSt) { forced = 0; }
  }
  if (forced >= 1) {
    if (deliveriesN >= 2) forced = Math.min(forced, deliveriesN);
    else if (deliveriesN === 1) forced = 1;
    return {
      slot: forced,
      deliveriesN: deliveriesN,
      cycle: cycle,
      deliveredBefore: Math.max(0, forced - 1),
      source: "stored"
    };
  }

  // 2) цикл месяца: эта дата уже записана как slot1/slot2
  if (cycle && cycle.slot1 && cycle.slot1.date === dateText) {
    return { slot: 1, deliveriesN: deliveriesN, cycle: cycle, deliveredBefore: 0, source: "cycle" };
  }
  if (cycle && cycle.slot2 && cycle.slot2.date === dateText) {
    return { slot: Math.min(2, deliveriesN || 2), deliveriesN: deliveriesN, cycle: cycle, deliveredBefore: 1, source: "cycle" };
  }

  var before = 0;
  try {
    before = countPpPriorDeliveriesThisMonth_(ss, clientName, dateValue, tz);
  } catch (eCnt) { before = 0; }

  // 3) в цикле уже есть slot1 на другую дату → это 2-я
  if (cycle && cycle.slot1 && cycle.slot1.date && cycle.slot1.date !== dateText) {
    before = Math.max(before, 1);
  }

  if (deliveredToday) {
    // сегодня уже отмечен: слот = max(1, before) если before не включал сегодня
    var slotDone = Math.max(1, before + 1);
    if (cycle && cycle.slot1 && cycle.slot1.date === dateText) slotDone = 1;
    else if (cycle && cycle.slot1) slotDone = Math.max(2, slotDone);
    if (deliveriesN >= 2) slotDone = Math.min(slotDone, deliveriesN);
    else if (deliveriesN === 1) slotDone = 1;
    return { slot: slotDone, deliveriesN: deliveriesN, cycle: cycle, deliveredBefore: before, source: "delivered" };
  }

  var slot = before + 1;
  if (deliveriesN >= 2) slot = Math.min(Math.max(1, slot), deliveriesN);
  else if (deliveriesN === 1) slot = 1;
  else slot = Math.max(1, slot);
  return { slot: slot, deliveriesN: deliveriesN, cycle: cycle, deliveredBefore: before, source: "count" };
}

/** @deprecated имя оставлено для совместимости — считает prior до даты. */
function countPpDeliveredThisMonth_(ss, clientName, dateValue, tz, excludeDateText) {
  // excludeDateText игнорируем: считаем строго даты < dateValue
  return countPpPriorDeliveriesThisMonth_(ss, clientName, dateValue, tz);
}

function buildPpOrderSuggest_(ss, nick, dayName, dateStr, opts) {
  opts = opts || {};
  var tz = ss.getSpreadsheetTimeZone() || "Europe/Minsk";
  var dateValue = null;
  if (dateStr) dateValue = parseFlexibleDate_(dateStr, tz) || parseMemoryDateLoose_(dateStr, tz);
  if (!dateValue && dayName) dateValue = getDayDate_(ss, dayName);
  if (!dateValue) dateValue = new Date();

  var crmSs = getCrmSpreadsheet_();
  var found = findSubscriberBasket_(crmSs, nick, "ПП");
  var contact = lookupContactAddress_(crmSs, nick);
  var deliveriesN = lookupPpDeliveries_(nick);
  if (!(deliveriesN >= 1) && found.basket && found.basket.length) deliveriesN = 1;

  var memory = getMemoryCourierSheet_();
  var dateText = formatSheetDate(dateValue, tz);
  var deliveredToday = false;
  try {
    var courier = ss.getSheetByName("Доставки");
    if (courier && formatSheetDate(courier.getRange("A1").getValue(), tz) === dateText) {
      var col = findCourierClientCol_(courier, nick);
      if (col > 0) deliveredToday = courier.getRange(2, col).getValue() === true;
    }
  } catch (eD) {}

  var resolved = resolvePpDeliverySlot_(ss, nick, dateValue, tz, deliveredToday, {
    ppSlot: opts.ppSlot,
    deliverySlot: opts.deliverySlot != null ? opts.deliverySlot : opts.slot
  });
  var slot = resolved.slot || 1;
  var cycle = resolved.cycle;
  var deliveredBefore = Number(resolved.deliveredBefore) || 0;
  var history = findPpClientHistoryMeta_(ss, nick, dateValue);
  // N=2: один раз на клиента, пока нет PP_SLOT_ANCHOR
  var needManualSlot = shouldAskPpSlotConfirm_(ss, nick, deliveriesN);
  // помним «какая должна быть»: из истории, иначе авто-слот месяца
  var suggestedSlot = Number(history.suggestedSlot) || Number(slot) || 1;
  if (!(cycle && cycle.slot1) && deliveredBefore <= 0 && history.lastSlot >= 1) {
    suggestedSlot = history.suggestedSlot || suggestedSlot;
  } else if (!needManualSlot) {
    suggestedSlot = slot;
  }
  var forced = parseForcedPpSlot_(
    opts.deliverySlot != null ? opts.deliverySlot : (opts.slot != null ? opts.slot : opts.ppSlot),
    deliveriesN
  );
  if (forced >= 1) {
    slot = forced;
  } else if (resolved.source === "stored" || resolved.source === "cycle" || resolved.source === "count") {
    // авто-слот уже посчитан с календарём/историей — не откатывать к «всегда 1»
    slot = Number(resolved.slot) || suggestedSlot || 1;
    if (!needManualSlot) suggestedSlot = slot;
  } else if (needManualSlot) {
    slot = suggestedSlot;
  } else {
    slot = suggestedSlot = Number(resolved.slot) || 1;
  }

  var slot1Basket = cycle && cycle.slot1 && cycle.slot1.basket ? cycle.slot1.basket : [];
  var monthly = clonePpBasket_(found.basket || []);
  var proposed = proposePpSlotBasket_(monthly, slot, deliveriesN, slot1Basket);
  var remaining = (deliveriesN >= 2 && slot <= 1)
    ? proposePpSlotBasket_(monthly, 2, deliveriesN, proposed)
    : remainderPpBasket_(monthly, slot1Basket.length ? slot1Basket : (slot >= 2 ? proposed : []));

  var paid = null;
  if (cycle && cycle.paid) paid = cycle.paid;
  else {
    try {
      var wStore = getWeekPaidStore_(memory, weekPaidKey_(dateValue, tz), tz);
      var pe = wStore[String(nick).trim().toUpperCase()];
      if (pe && typeof pe === "object") paid = pe.paid || null;
      else if (typeof pe === "string") paid = pe;
    } catch (eP) {}
  }

  var askPaid = false;
  if (deliveriesN >= 2) {
    if (paid === "yes") askPaid = false;
    else if (slot <= 1) askPaid = true;
    else askPaid = (paid === "no" || !paid);
  }

  var factCost = null;
  try {
    var shPp = findSheetByBaseName_(crmSs, "ПП");
    if (shPp && shPp.getLastRow() >= 2) {
      var dataPp = shPp.getDataRange().getValues();
      var headersPp = dataPp[0].map(function (h) { return String(h || "").trim().toUpperCase(); });
      var factCol = -1;
      for (var c = 0; c < headersPp.length; c++) {
        if (headersPp[c].indexOf("ФАКТ") >= 0 && headersPp[c].indexOf("СТОИМ") >= 0) { factCol = c; break; }
      }
      var wantNick = String(nick || "");
      for (var r = 2; r < dataPp.length; r++) {
        if (nicksMatch_(dataPp[r][0], wantNick)) {
          if (factCol >= 0) {
            var rawF = dataPp[r][factCol];
            factCost = Number(String(rawF != null ? rawF : "").replace(",", ".").replace(/[^\d.]/g, "")) || 0;
          }
          break;
        }
      }
    }
  } catch (eF) {}

  return {
    status: "success",
    nick: nick,
    subId: found.subId || "",
    sheet: found.sheet || "ПП",
    wishes: found.wishes || "",
    address: contact.address || "",
    note: contact.note || "",
    phone: contact.phone || "",
    date: dateText,
    day: dayName || "",
    deliveriesN: deliveriesN,
    deliverySlot: slot,
    ppSlot: formatPpSlotLabel_(slot, deliveriesN),
    suggestedSlot: suggestedSlot,
    needManualSlot: !!(needManualSlot && forced < 1),
    everSeenInApp: !!history.everSeen,
    daysSinceLastDelivery: history.daysSinceLastDelivery,
    lastSlot: history.lastSlot || 0,
    lastDeliveryDate: history.lastDeliveryDate || "",
    hasPpSlotAnchor: !needManualSlot,
    paid: paid,
    askPaid: askPaid,
    factCost: factCost,
    monthlyBasket: monthly,
    proposedBasket: proposed,
    slot1Basket: slot1Basket,
    remainingBasket: remaining,
    hint: deliveriesN >= 2
      ? ("ПП N=" + deliveriesN + " · доставка " + slot + "/" + deliveriesN + (slot >= 2 ? " (остаток)" : " (доля)") +
        (needManualSlot && forced < 1 ? " · уточни слот" : ""))
      : (deliveriesN === 1 ? "ПП N=1 · состав целиком" : "ПП: состав с листа")
  };
}

function handleGetPpOrderSuggest(json, callback, fromPost) {
  var nick = String(json.nick || json.client || "").trim();
  if (!nick) {
    var bad = { status: "error", message: "need_nick" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var out = buildPpOrderSuggest_(ss, nick, String(json.day || "").trim(), String(json.date || json.deliveryDate || "").trim(), {
      deliverySlot: json.deliverySlot != null ? json.deliverySlot : json.slot,
      ppSlot: json.ppSlot,
      slot: json.slot
    });
    return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
  } catch (e) {
    var err = { status: "error", message: String(e) };
    return fromPost ? jsonpText(callback, err) : jsonp(callback, err);
  }
}

function findClientDayBasket_(ss, dayName, clientName) {
  var data = getClientsData_(ss, dayName);
  if (!data || data.status !== "success") return [];
  var want = String(clientName || "").trim().toUpperCase();
  for (var i = 0; i < data.clients.length; i++) {
    if (String(data.clients[i].name || "").trim().toUpperCase() === want) {
      return clonePpBasket_(data.clients[i].basket || []);
    }
  }
  return [];
}

function recordPpDeliveryCycle_(ss, dayName, clientName, dateValue, tz, paidVal) {
  var deliveriesN = lookupPpDeliveries_(clientName);
  if (!(deliveriesN >= 1)) return;
  var memory = getMemoryCourierSheet_();
  if (!memory) return;
  var dateText = formatSheetDate(dateValue, tz);
  var cycle = getPpCycleEntry_(memory, dateValue, tz, clientName) || {
    paid: null,
    deliveriesN: deliveriesN,
    slot1: null,
    slot2: null
  };
  cycle.deliveriesN = deliveriesN;
  if (paidVal) cycle.paid = paidVal;

  var resolved = resolvePpDeliverySlot_(ss, clientName, dateValue, tz, true);
  var slot = resolved.slot || 1;
  // явный слот с календаря/брони на эту дату
  try {
    var storedRec = lookupStoredPpSlotForDate_(ss, clientName, dateValue, tz);
    if (storedRec >= 1) slot = storedRec;
  } catch (eSt) {}
  // если slot1 ещё нет — это первая доставка месяца (если слот не задан явно как 2)
  if (!cycle.slot1 && slot <= 1) slot = 1;
  else if (cycle.slot1 && cycle.slot1.date !== dateText) slot = Math.max(slot, 2);

  var dayBasket = findClientDayBasket_(ss, dayName, clientName);
  if (slot <= 1) {
    cycle.slot1 = { date: dateText, day: dayName, basket: dayBasket };
  } else {
    cycle.slot2 = { date: dateText, day: dayName, basket: dayBasket };
  }
  savePpCycleEntry_(memory, dateValue, tz, clientName, cycle);
}

function getWeekPaidStore_(memory, weekKey, tz) {
  var all = getMemoryJson_(memory, weekKey, tz);
  if (!all || typeof all !== "object" || Object.prototype.toString.call(all) === "[object Array]") return {};
  return all;
}
function weekPaidKey_(dateValue, tz) {
  // ключ недели по понедельнику даты
  var d = new Date(dateValue);
  var day = d.getDay(); // 0=вс
  var diff = (day === 0 ? -6 : 1 - day);
  var mon = new Date(d.getTime());
  mon.setDate(d.getDate() + diff);
  return "WEEK_PAID:" + formatSheetDate(mon, tz);
}
function lookupPpDeliveries_(clientName) {
  try {
    var crmSs = getCrmSpreadsheet_();
    var data = getCrmSheetValuesFast_(crmSs, "ПП");
    if (!data || data.length < 3) return 0;
    for (var r = 2; r < data.length; r++) {
      if (nicksMatch_(data[r][0], clientName)) return Number(data[r][2]) || 0;
    }
  } catch (e) {}
  return 0;
}
function normalizeMemDelivered_(v) {
  if (v === true) return true;
  if (v && typeof v === "object") return !!v.delivered;
  return false;
}
function countDeliveredThisWeek_(ss, clientName, dateValue, tz) {
  var want = String(clientName || "").trim().toUpperCase();
  var days = MANAGER_DAY_NAMES_;
  var n = 0;
  var memory = getMemoryCourierSheet_();
  for (var i = 0; i < days.length; i++) {
    var dv = getDayDate_(ss, days[i]);
    if (!dv) continue;
    // same calendar week as dateValue
    var k1 = weekPaidKey_(dv, tz);
    var k2 = weekPaidKey_(dateValue, tz);
    if (k1 !== k2) continue;
    var dateText = formatSheetDate(dv, tz);
    var courier = ss.getSheetByName("Доставки");
    var sheetActive = courier && formatSheetDate(courier.getRange("A1").getValue(), tz) === dateText;
    var delivered = false;
    if (sheetActive) {
      var col = findCourierClientCol_(courier, clientName);
      if (col > 0) delivered = courier.getRange(2, col).getValue() === true;
    }
    if (!delivered && memory) {
      var mem = getMemoryJson_(memory, dateText, tz) || {};
      if (mem && typeof mem === "object" && Object.prototype.toString.call(mem) !== "[object Array]") {
        delivered = normalizeMemDelivered_(mem[want]);
      }
    }
    if (delivered) n++;
  }
  return n;
}


/* ----- Цена ----- */

/** Розничный прайс с витрины IG (2026-07), BYN за 100г / шт / пакеты */
var RETAIL_PRICE_BYN_ = {
  "ЛЁГКОЕ|Мелкое": { per100: 12 },
  "ЛЁГКОЕ|Среднее": { per100: 10 },
  "ЛЁГКОЕ|Большое": { per100: 9 },
  "ЛЁГКОЕ|Целое": { per100: 8 },
  "ЛЁГКОЕ": { per100: 10 },
  "СЕРДЦЕ|Мелкое": { per100: 13 },
  "СЕРДЦЕ|Среднее": { per100: 12 },
  "СЕРДЦЕ|Большое": { per100: 11 },
  "СЕРДЦЕ|Целое": { per100: 10 },
  "СЕРДЦЕ": { per100: 12 },
  "РУБЕЦ Т|Мелкое": { per100: 13 },
  "РУБЕЦ Т|Среднее": { per100: 12 },
  "РУБЕЦ Т|Крупное": { per100: 11 },
  "РУБЕЦ Т|Целое": { per100: 10 },
  "РУБЕЦ Т": { per100: 12 },
  "ПОЧКИ|Мелкое": { per100: 11 },
  "ПОЧКИ|Целое": { per100: 10 },
  "ПОЧКИ": { per100: 10 },
  "БАРАНЬЕ ЛЁГКОЕ|Мелкое": { per100: 15 },
  "БАРАНЬЕ ЛЁГКОЕ|Среднее": { per100: 14 },
  "БАРАНЬЕ ЛЁГКОЕ|Большое": { per100: 13 },
  "БАРАНЬЕ ЛЁГКОЕ|Целое": { per100: 12 },
  "БАРАНЬЕ ЛЁГКОЕ": { per100: 14 },
  "ПЕЧЕНЬ": { per100: 9 },
  "СВЕТЛЫЙ РУБЕЦ": { per100: 9 },
  "КНИЖКА": { per100: 9 },
  "ВЫМЯ": { per100: 9 },
  "СЕМЕННИКИ": { per100: 12 },
  "МЯСНЫЕ ЛОМТИКИ": { per100: 13 },
  "ПИКАЛЬНОЕ МЯСО": { per100: 10 },
  "ИНДЕЙКА|Мелкое": { per100: 17 },
  "ИНДЕЙКА|Среднее": { per100: 16 },
  "ИНДЕЙКА|Целое": { per100: 15 },
  "ИНДЕЙКА": { per100: 16 },
  "БАРАНЬЯ ПЕЧЕНЬ|Мелкое": { per100: 18 },
  "БАРАНЬЯ ПЕЧЕНЬ|Среднее": { per100: 17 },
  "БАРАНЬЯ ПЕЧЕНЬ|Целое": { per100: 16 },
  "БАРАНЬЯ ПЕЧЕНЬ": { per100: 17 },
  "КРОШКА ЛЁГКОГО": { packs: { "20": 5, "50": 7, "100": 10 }, per100: 10 },
  "КРОШКА ПОЧЕК": { packs: { "20": 5, "50": 7, "100": 10 }, per100: 10 },
  "КРОШКА СЕРДЦА": { packs: { "20": 7, "50": 9, "100": 12 }, per100: 12 },
  "КРОШКА РУБЕЦ": { packs: { "20": 7, "50": 9, "100": 12 }, per100: 12 },
  "КРОШКА МИКС": { packs: { "20": 6, "50": 8, "100": 11 }, per100: 11 },
  "БАНАНЫ": { per100: 10 },
  "ЯБЛОКИ": { per100: 9 },
  "ГРУШИ": { per100: 10 },
  "КЛУБНИКА": { per100: 10 },
  "МОРКОВЬ": { per100: 10 },
  "ТЫКВА": { per100: 12 },
  "БАТАТ": { per100: 11 },
  "КАБАЧОК": { per100: 12 },
  "СВЕКЛА": { per100: 10 },
  "КОПЫТО шт.": { perPiece: 9 },
  "КОЛЕНИ шт.": { perPiece: 6 },
  "НОСЫ шт.": { perPiece: 7 },
  "ЛОП ХРЯЩ шт.": { perPiece: 4 },
  "УТИНЫЕ ШЕИ шт.": { perPiece: 3 },
  "ПЕРЕПЁЛКИ шт.": { perPiece: 4 },
  "ГУБЫ шт.": { perPiece: 4 },
  "ТРАХЕЯ|МАЛ": { perPiece: 4 },
  "ТРАХЕЯ|СРЕД": { perPiece: 7 },
  "ТРАХЕЯ|БОЛ": { perPiece: 12 },
  "ТРАХЕЯ|ПЛАСТ": { perPiece: 7 },
  "ТРАХЕЯ|ОГР": { perPiece: 12 },
  "ТРАХЕЯ": { perPiece: 7 },
  "БЫЧИЙ КОРЕНЬ|ОЧ МАЛ": { perPiece: 6 },
  "БЫЧИЙ КОРЕНЬ|МАЛ": { perPiece: 6 },
  "БЫЧИЙ КОРЕНЬ|СРЕД": { perPiece: 11 },
  "БЫЧИЙ КОРЕНЬ|БОЛ": { perPiece: 21 },
  "БЫЧИЙ КОРЕНЬ|ОГР": { perPiece: 25 },
  "БЫЧИЙ КОРЕНЬ": { perPiece: 11 },
  "УХО Г|ПОЛОВИНКА": { perPiece: 4 },
  "УХО Г|Обычное": { perPiece: 6 },
  "УХО Г": { perPiece: 6 },
  "АОРТА|ПОЛОВИНКА": { perPiece: 2 },
  "АОРТА|Обычная": { perPiece: 4 },
  "АОРТА": { perPiece: 4 },
  "СТАНОВАЯ ЖИЛА|ПАЛК": { perPiece: 1 },
  "СТАНОВАЯ ЖИЛА|СРЕД": { perPiece: 4 },
  "СТАНОВАЯ ЖИЛА|БОЛ": { perPiece: 6 },
  "СТАНОВАЯ ЖИЛА": { perPiece: 4 }
};

function retailNormalizeSub_(name, sub) {
  var s = String(sub || "").trim();
  if (!s) return "";
  var u = s.toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ");
  var n = String(name || "").toUpperCase().replace(/Ё/g, "Е");
  // жевалки — каталожные коды
  if (/БЫЧИЙ КОРЕН|ТРАХЕ|СТАНОВ/.test(n)) {
    if (/ОЧЕНЬ\s*МАЛ|ОЧ\s*МАЛ|СУПЕР/.test(u)) return "ОЧ МАЛ";
    if (/ОГРОМ|РОГАЛ|ОГР/.test(u)) return "ОГР";
    if (/БОЛЬШ|БОЛ/.test(u)) return "БОЛ";
    if (/СРЕДН|СРЕД|ПОЛОВИН/.test(u) && /СТАНОВ/.test(n)) return /ПАЛ/.test(u) ? "ПАЛК" : "СРЕД";
    if (/СРЕД/.test(u)) return "СРЕД";
    if (/ПАЛОЧ|ПАЛК/.test(u)) return "ПАЛК";
    if (/ПЛАСТ/.test(u)) return "ПЛАСТ";
    if (/МАЛ/.test(u)) return "МАЛ";
  }
  if (/УХО|УШК/.test(n)) {
    if (/ПОЛОВИН/.test(u)) return "ПОЛОВИНКА";
    return "Обычное";
  }
  if (/АОРТ/.test(n)) {
    if (/ПОЛОВИН/.test(u)) return "ПОЛОВИНКА";
    return "Обычная";
  }
  // дрессура / прайс-синонимы с фото
  if (/МЕЛК/.test(u)) return "Мелкое";
  if (/СРЕД|КУСОЧ|КУБИК/.test(u) && !/МЕЛК|БОЛЬШ|ЦЕЛ|ЛОМТ|ПОЛОСК/.test(u)) return "Среднее";
  if (/СРЕД|КУСОЧК/.test(u) && !/МЕЛК/.test(u)) return "Среднее";
  if (/КРУПН/.test(u)) return "Крупное";
  if (/БОЛЬШ|ПОЛОСК/.test(u)) return "Большое";
  if (/ЦЕЛ|ЛОМТ/.test(u)) return "Целое";
  if (/КУБИК/.test(u)) return "Среднее";
  return s;
}

function retailNormalizeName_(name) {
  var n = String(name || "").trim();
  var u = n.toUpperCase().replace(/Ё/g, "Е");
  var aliases = {
    "ЛЕГКОЕ": "ЛЁГКОЕ",
    "БАРАНЬЕ ЛЕГКОЕ": "БАРАНЬЕ ЛЁГКОЕ",
    "КРОШКА ЛЕГКОГО": "КРОШКА ЛЁГКОГО",
    "ПЕРЕПЕЛКИ ШТ.": "ПЕРЕПЁЛКИ шт.",
    "ПЕРЕПЕЛКИ ШТ": "ПЕРЕПЁЛКИ шт.",
    "КОПЫТО ШТ.": "КОПЫТО шт.",
    "КОЛЕНИ ШТ.": "КОЛЕНИ шт.",
    "НОСЫ ШТ.": "НОСЫ шт.",
    "ЛОП ХРЯЩ ШТ.": "ЛОП ХРЯЩ шт.",
    "УТИНЫЕ ШЕИ ШТ.": "УТИНЫЕ ШЕИ шт.",
    "ГУБЫ ШТ.": "ГУБЫ шт.",
    "ГУБЫ ШТ": "ГУБЫ шт.",
    "КАБАЧКИ": "КАБАЧОК",
    "ГРУШЫ": "ГРУШИ",
    "РУБЕЦ С": "СВЕТЛЫЙ РУБЕЦ",
    "СВЕТЛЫЙ РУБЕЦ": "СВЕТЛЫЙ РУБЕЦ"
  };
  if (aliases[u]) return aliases[u];
  if (u.indexOf("КРОШКА РУБ") === 0) return "КРОШКА РУБЕЦ";
  return n;
}

function retailLineCost_(name, sub, val, cat) {
  var n = retailNormalizeName_(name);
  var s = retailNormalizeSub_(n, sub);
  var key = n + (s ? "|" + s : "");
  var info = RETAIL_PRICE_BYN_[key] || RETAIL_PRICE_BYN_[n];
  var v = Number(val) || 0;
  if (!info || v <= 0) return { cost: 0, per: 0, found: !!info };
  if (info.packs) {
    var g = String(Math.round(v));
    if (info.packs[g] != null) return { cost: Number(info.packs[g]), per: Number(info.packs[g]), found: true };
    var p100 = info.packs["100"] != null ? Number(info.packs["100"]) : Number(info.per100 || 0);
    var c = p100 * (v / 100);
    return { cost: Math.round(c * 100) / 100, per: p100, found: true };
  }
  if (info.perPiece != null || String(cat || "") === "chew" || String(cat || "") === "chews" || /шт/i.test(n)) {
    var pp = Number(info.perPiece || 0);
    return { cost: Math.round(pp * v * 100) / 100, per: pp, found: true };
  }
  var p = Number(info.per100 || 0);
  return { cost: Math.round((v / 100) * p * 100) / 100, per: p, found: true };
}



var PRICE_SS_MEM_ = null;
var PRICE_COSTS_MEM_ = {};
/** Логистика одной БП-доставки (BYN), входит в себестоимость БП / CAC. */
var BP_DELIVERY_COST_BYN_ = 6;
/** ПП: свет на человека (BYN) — как в computePpFactFromCost_ (fixed=11). */
var PP_LIGHT_COST_BYN_ = 11;
/** ПП: логистика одной доставки (BYN) — как 6×N в computePpFactFromCost_. */
var PP_DELIVERY_COST_BYN_ = 6;

function getPriceSpreadsheet_() {
  if (PRICE_SS_MEM_) return PRICE_SS_MEM_;
  var id = PropertiesService.getScriptProperties().getProperty("PRICE_SPREADSHEET_ID") || PRICE_SPREADSHEET_ID_DEFAULT_;
  PRICE_SS_MEM_ = SpreadsheetApp.openById(id);
  return PRICE_SS_MEM_;
}

function readPriceCosts_(mode) {
  var m = String(mode || "").toLowerCase();
  var memKey = "pp";
  if (m.indexOf("розн") >= 0 || m === "retail") memKey = "retail";
  else if (m === "bp" || m.indexOf("бп") >= 0) memKey = "bp";
  else if (m === "pp" || m === "subscription" || m.indexOf("пп") >= 0) memKey = "pp";
  if (PRICE_COSTS_MEM_[memKey]) return PRICE_COSTS_MEM_[memKey];

  var ss = getPriceSpreadsheet_();
  var sheetName = "Подписка";
  if (memKey === "retail") sheetName = "Розница";
  else if (memKey === "bp") sheetName = ss.getSheetByName("БП") ? "БП" : "Подписка";
  var sh = ss.getSheetByName(sheetName) || ss.getSheets()[0];
  var data = sh.getDataRange().getValues();
  if (!data.length) {
    var empty = { costs: {}, headers: [], sheet: sheetName };
    PRICE_COSTS_MEM_[memKey] = empty;
    return empty;
  }
  var headers = data[0];
  // Важно: брать СЫРУЮ себестоимость, не «стоимость 100» / итоговую (там уже может быть ×2.3).
  var costRow = null;
  var costPri = -1;
  var costRowLabel = "";
  for (var r = 0; r < Math.min(10, data.length); r++) {
    var label = String(data[r][0] || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!label) continue;
    if (/итог|факт|выхлоп|наценк|клиент/.test(label)) continue;
    var pri = -1;
    if (/^себестоим/.test(label) || label.indexOf("себестоим") >= 0) pri = 3;
    else if (/сырь|закуп|cost/.test(label)) pri = 2;
    else if (/стоимость\s*100|цена\s*100|за\s*100/.test(label)) pri = 1;
    if (pri > costPri) {
      costPri = pri;
      costRow = data[r];
      costRowLabel = label;
      if (pri >= 3) break;
    }
  }
  if (!costRow && data.length > 1) costRow = data[1];
  var costs = {};
  for (var c = 6; c < headers.length; c++) {
    var map = mapCrmHeaderToItem_(headers[c]);
    if (!map) continue;
    var key = map.name + (map.sub ? " / " + map.sub : "");
    var price = Number(String(costRow[c] || "").replace(",", ".")) || 0;
    costs[key] = {
      per100: price,
      unitPrice: price,
      name: map.name,
      sub: map.sub,
      grams: map.grams !== false && map.cat !== "chew",
      cat: map.cat || "",
      piece: map.grams === false || map.cat === "chew"
    };
  }
  var out = { costs: costs, sheet: sheetName, costRowLabel: costRowLabel, costRowPriority: costPri };
  PRICE_COSTS_MEM_[memKey] = out;
  return out;
}

function handleCalcPrice(json, callback, fromPost) {
  var mode = json.mode || "subscription";
  var basket = json.basket || [];
  var m = String(mode || "").toLowerCase();
  var isRetail = m.indexOf("розн") >= 0 || m === "retail";

  // Розница — прайс с витрины (фото), без листа и без ×2.3
  if (isRetail) {
    var rLines = [];
    var rTotal = 0;
    for (var ri = 0; ri < basket.length; ri++) {
      var rit = basket[ri];
      var rname = String(rit.name || rit.main || "").trim();
      var rsub = String(rit.sub || "").trim();
      var rval = Number(rit.val != null ? rit.val : rit.value) || 0;
      if (!rname || rval <= 0) continue;
      var rc = retailLineCost_(rname, rsub, rval, rit.cat);
      rTotal += rc.cost;
      rLines.push({ name: rname, sub: rsub, val: rval, per100: rc.per, cost: rc.cost, found: rc.found });
    }
    rTotal = Math.round(rTotal * 100) / 100;
    var rN = Math.max(1, Number(json.deliveriesN) || 1);
    var rPer = rTotal / rN;
    var rDelivTimes = 0;
    if (rTotal > 0) {
      for (var rdi = 0; rdi < rN; rdi++) {
        if (rPer < 50) rDelivTimes++;
      }
    }
    var rDeliv = Math.round(rDelivTimes * 5 * 100) / 100;
    var rGrand = Math.round((rTotal + rDeliv) * 100) / 100;
    var rok = {
      status: "success",
      mode: mode,
      sheet: "витрина IG",
      lines: rLines,
      cost: rTotal,
      goods: rTotal,
      delivery: rDeliv,
      deliveryTimes: rDelivTimes,
      perDelivery: Math.round(rPer * 100) / 100,
      deliveriesN: rN,
      markup: 1,
      total: rGrand
    };
    return fromPost ? jsonpText(callback, rok) : jsonp(callback, rok);
  }

  var priceInfo;
  try {
    priceInfo = readPriceCosts_(mode);
  } catch (e) {
    var bad = { status: "error", message: "price_sheet_unavailable", detail: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var lines = [];
  var totalCost = 0;
  for (var i = 0; i < basket.length; i++) {
    var it = basket[i];
    var name = String(it.name || it.main || "").trim();
    var sub = String(it.sub || "").trim();
    var val = Number(it.val != null ? it.val : it.value) || 0;
    var cat = String(it.cat || "").trim();
    if (!name || val <= 0) continue;
    var key = name + (sub ? " / " + sub : "");
    var info = priceInfo.costs[key];
    if (!info) {
      for (var k in priceInfo.costs) {
        if (priceInfo.costs[k].name === name && (!sub || priceInfo.costs[k].sub === sub)) {
          info = priceInfo.costs[k];
          break;
        }
      }
    }
    var unitPrice = info ? Number(info.unitPrice != null ? info.unitPrice : info.per100) || 0 : 0;
    var piece = false;
    if (info && info.piece) piece = true;
    else if (cat === "chew" || cat === "chews") piece = true;
    else if (isPieceSkuName_(name) || /шт/i.test(name)) piece = true;
    else if (info && info.grams === false) piece = true;
    var cost = piece ? (unitPrice * val) : ((val / 100) * unitPrice);
    totalCost += cost;
    lines.push({
      name: name,
      sub: sub,
      val: val,
      per100: unitPrice,
      unitPrice: unitPrice,
      piece: piece,
      cost: Math.round(cost * 100) / 100
    });
  }
  var rawCost = Math.round(totalCost * 100) / 100;
  // markup здесь только справочно для «total» (= raw×2.3). Факт ПП считает coef отдельно — не домножать.
  var refMarkup = 2.3;
  var total = Math.round(rawCost * refMarkup * 100) / 100;
  var ok = {
    status: "success",
    mode: mode,
    sheet: priceInfo.sheet,
    costRowLabel: priceInfo.costRowLabel || "",
    lines: lines,
    cost: rawCost,
    rawCost: rawCost,
    markup: refMarkup,
    total: total
  };
  // полный факт ПП: сырая себест × coef (+11 +6×N …). coef ЗАМЕНЯЕТ 2.3, не множится сверху.
  if (json.fullFact === true || json.fullFact === "1" || json.fullFact === 1 ||
      String(mode || "").toLowerCase() === "pp" && (json.deliveriesN || json.deliveries)) {
    try {
      var coefIn = json.coef != null && json.coef !== "" ? json.coef : null;
      var fact = computePpFactFromCost_(rawCost, basket, json.deliveriesN || json.deliveries, coefIn);
      for (var fk in fact) {
        if (Object.prototype.hasOwnProperty.call(fact, fk)) ok[fk] = fact[fk];
      }
      // не затирать rawCost полем coef/total из fact
      ok.cost = rawCost;
      ok.rawCost = rawCost;
      ok.markup = fact.coef;
      ok.total = Math.round(rawCost * fact.coef * 100) / 100;
    } catch (eF) {}
  }
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/** Наценка фракций дрессуры: (г/100)×ставка; ставки по умолчанию 0/1/2/3. */
function dressuraFractionMarkupFromBasket_(basket, rates) {
  rates = rates || { whole: 0, large: 1, medium: 2, small: 3 };
  var sum = 0;
  for (var i = 0; i < (basket || []).length; i++) {
    var it = basket[i] || {};
    var cat = String(it.cat || "").toLowerCase();
    if (cat && cat !== "dressura") continue;
    var sub = String(it.sub || "").toUpperCase().replace(/\s+/g, " ").trim();
    var size = "";
    if (/^ЦЕЛ/.test(sub)) size = "whole";
    else if (/^БОЛЬ|^КРУП|^БОЛ\b/.test(sub) || sub === "БОЛ") size = "large";
    else if (/^СРЕД/.test(sub)) size = "medium";
    else if (/^МЕЛК|^МАЛ/.test(sub) && !/ОЧ/.test(sub)) size = "small";
    else if (/КУБИК/.test(sub) && /МЕЛК/.test(sub)) size = "small";
    else if (/КУБИК/.test(sub) && /КРУП/.test(sub)) size = "large";
    if (!size) continue;
    var rate = Number(rates[size]);
    if (!isFinite(rate)) rate = 0;
    var grams = Number(it.val != null ? it.val : it.value) || 0;
    if (grams <= 0) continue;
    sum += (grams / 100) * rate;
  }
  return Math.round(sum * 100) / 100;
}

function packagesBynFromUCounts_(pc) {
  pc = pc || {};
  return Math.round(
    ((Number(pc.u1) || 0) * 0.34 +
      (Number(pc.u2) || 0) * 0.56 +
      (Number(pc.u3) || 0) * 0.80 +
      (Number(pc.up4) || 0) * 1.40) * 100
  ) / 100;
}

function computePpFactFromCost_(costSum, basket, deliveriesN, coefIn, packCountsOpt) {
  var n = Math.max(1, Number(deliveriesN) || 1);
  var coef = Number(coefIn);
  if (!isFinite(coef) || coef <= 0) coef = 2.3;
  var fixed = 11;
  var delivery = 6 * n;
  var pc = packCountsOpt && typeof packCountsOpt === "object"
    ? {
        u1: Number(packCountsOpt.u1) || 0,
        u2: Number(packCountsOpt.u2) || 0,
        u3: Number(packCountsOpt.u3) || 0,
        up4: Number(packCountsOpt.up4) || 0
      }
    : packCountsUFromBasket_(basket || []);
  var packagesByn = packagesBynFromUCounts_(pc);
  var fracMark = dressuraFractionMarkupFromBasket_(basket);
  var factCost = Math.round((Number(costSum) * coef + fixed + delivery + packagesByn + fracMark) * 100) / 100;
  return {
    factCost: factCost,
    deliveriesN: n,
    coef: coef,
    fixed: fixed,
    deliveryByn: delivery,
    packagesByn: packagesByn,
    packCounts: pc,
    fractionMarkup: fracMark
  };
}

/** Полный пересчёт ФАКТ СТОИМОСТЬ ПП по составу. */
function handleCalcPpFact(json, callback, fromPost) {
  json = json || {};
  var basket = json.basket || [];
  if (typeof basket === "string") {
    try { basket = JSON.parse(basket); } catch (e0) { basket = []; }
  }
  if (!Array.isArray(basket)) basket = [];
  try {
    var priceInfo = readPriceCosts_("pp");
    var totalCost = 0;
    var lines = [];
    for (var i = 0; i < basket.length; i++) {
      var it = basket[i];
      var name = String(it.name || it.main || "").trim();
      var sub = String(it.sub || "").trim();
      var val = Number(it.val != null ? it.val : it.value) || 0;
      var cat = String(it.cat || "").trim();
      if (!name || val <= 0) continue;
      var key = name + (sub ? " / " + sub : "");
      var info = priceInfo.costs[key];
      if (!info) {
        for (var k in priceInfo.costs) {
          if (priceInfo.costs[k].name === name && (!sub || priceInfo.costs[k].sub === sub)) {
            info = priceInfo.costs[k];
            break;
          }
        }
      }
      var unitPrice = info ? Number(info.unitPrice != null ? info.unitPrice : info.per100) || 0 : 0;
      var piece = false;
      if (info && info.piece) piece = true;
      else if (cat === "chew" || cat === "chews") piece = true;
      else if (isPieceSkuName_(name) || /шт/i.test(name)) piece = true;
      else if (info && info.grams === false) piece = true;
      var cost = piece ? (unitPrice * val) : ((val / 100) * unitPrice);
      totalCost += cost;
      lines.push({ name: name, sub: sub, val: val, unitPrice: unitPrice, piece: piece, cost: Math.round(cost * 100) / 100 });
    }
    totalCost = Math.round(totalCost * 100) / 100;
    var coefIn = (json.coef != null && json.coef !== "") ? json.coef : null;
    var packOpt = json.packCounts || null;
    if (typeof packOpt === "string") {
      try { packOpt = JSON.parse(packOpt); } catch (ePc) { packOpt = null; }
    }
    var fact = computePpFactFromCost_(totalCost, basket, json.deliveriesN || json.deliveries, coefIn, packOpt);
    var ok = {
      status: "success",
      cost: totalCost,
      rawCost: totalCost,
      lines: lines,
      markup: fact.coef,
      total: Math.round(totalCost * fact.coef * 100) / 100
    };
    for (var fk in fact) {
      if (Object.prototype.hasOwnProperty.call(fact, fk)) ok[fk] = fact[fk];
    }
    return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
  } catch (e) {
    var bad = { status: "error", message: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
}

/* ----- Сборка / пакеты -----
 * Дойпаки позиций (не лёгкое): маленький ≤20г · средний ≤100г · большой ≤250г
 * Лёгкое: маленький ≤15г · средний ≤80г · большой ≤190г
 * Жевалки: обычно большой (по 4 шт); мало (≤2) + не бол.фрак → средний
 * Крафт: внешний пакет клиента — в него складывают дойпаки;
 *   1 крафт вмещает 4 больших | 7 средних | 35 маленьких (иначе +ещё крафт)
 * Остаток после полных больших → средний/маленький (не ещё один большой).
 */

var PACK_CAP_PRODUCT_ = { small: 20, medium: 100, large: 250 };
var PACK_CAP_LIGHT_ = { small: 15, medium: 80, large: 190 };
var PACK_CRAFT_HOLDS_ = { large: 4, medium: 7, small: 35 };
var PACK_CHEW_FEW_ = 2; // «мало» жевалок → средний (если фракция не большая)
var PACK_CHEW_PER_BIG_ = 4; // шт в большом дойпаке

/** Фракция жевалки «большая» (БОЛ/ОГР/…) — даже 1–2 шт идут в большой. */
function isLargeChewFraction_(sub) {
  var u = String(sub || '').trim().toUpperCase();
  if (!u) return false;
  if (/ОГР|ОГРОМ|ГИГАНТ|КРУПН|БОЛЬШ|БОЛ/.test(u)) return true;
  if (/^ОБЫЧН/.test(u)) return true;
  return false;
}

function packFormatOn_(enabled, key) {
  if (!enabled) return true;
  return enabled[key] !== false;
}

/**
 * Раскладка граммов в дойпаки: полные крупнейшие, остаток — в наименьший подходящий.
 * enabled: { маленький/средний/большой: false } — выключенный формат не использовать.
 * @returns {{маленький:number,средний:number,большой:number}}
 */
function packGramsIntoDoypacks_(grams, caps, enabled) {
  var out = { 'маленький': 0, 'средний': 0, 'большой': 0 };
  var g = Number(grams) || 0;
  if (g <= 0) return out;

  var levels = [];
  if (packFormatOn_(enabled, 'большой')) levels.push({ key: 'большой', cap: caps.large });
  if (packFormatOn_(enabled, 'средний')) levels.push({ key: 'средний', cap: caps.medium });
  if (packFormatOn_(enabled, 'маленький')) levels.push({ key: 'маленький', cap: caps.small });
  if (!levels.length) {
    levels = [
      { key: 'большой', cap: caps.large },
      { key: 'средний', cap: caps.medium },
      { key: 'маленький', cap: caps.small }
    ];
  }

  var rem = g;
  var largest = levels[0];
  var nFull = Math.floor(rem / largest.cap);
  if (nFull > 0) {
    out[largest.key] += nFull;
    rem -= nFull * largest.cap;
  }
  if (rem <= 0) return out;

  // остаток → самый мелкий формат, куда влезает
  for (var i = levels.length - 1; i >= 0; i--) {
    if (rem <= levels[i].cap) {
      out[levels[i].key]++;
      return out;
    }
  }
  // остаток больше любого доступного — ещё крупнейшими
  out[largest.key] += Math.ceil(rem / largest.cap);
  return out;
}

/** @deprecated совместимость: суммарное число дойпаков */
function packSizeAndCount_(grams, caps, enabled) {
  var dist = packGramsIntoDoypacks_(grams, caps, enabled);
  var bags = (dist['маленький'] || 0) + (dist['средний'] || 0) + (dist['большой'] || 0);
  var key = dist['большой'] ? 'большой' : (dist['средний'] ? 'средний' : (dist['маленький'] ? 'маленький' : ''));
  return { bags: bags, key: key, dist: dist, rule: 'дойпак' };
}

function packCountForLight_(grams) {
  return packSizeAndCount_(grams, PACK_CAP_LIGHT_).bags;
}

function packCountForBulk_(grams) {
  return packSizeAndCount_(grams, PACK_CAP_PRODUCT_).bags;
}

/** Сколько крафт-пакетов нужно, чтобы уложить дойпаки клиента. */
function craftBagsForDoypacks_(doyByKey) {
  var s = Number(doyByKey['маленький']) || 0;
  var m = Number(doyByKey['средний']) || 0;
  var l = (Number(doyByKey['большой']) || 0) + (Number(doyByKey['целое']) || 0);
  if (s + m + l <= 0) return 0;
  var fill =
    l / PACK_CRAFT_HOLDS_.large +
    m / PACK_CRAFT_HOLDS_.medium +
    s / PACK_CRAFT_HOLDS_.small;
  return Math.max(1, Math.ceil(fill - 1e-12));
}

function packChewsIntoDoypacks_(val, sub, enabled) {
  var out = { 'маленький': 0, 'средний': 0, 'большой': 0 };
  var n = Number(val) || 0;
  if (n <= 0) return out;
  var chewLarge = isLargeChewFraction_(sub);
  var wantMed = n <= PACK_CHEW_FEW_ && !chewLarge;
  var canM = packFormatOn_(enabled, 'средний');
  var canL = packFormatOn_(enabled, 'большой');
  if (wantMed && canM) {
    out['средний'] = 1;
    return out;
  }
  var bags = Math.max(1, Math.ceil(n / PACK_CHEW_PER_BIG_));
  if (canL) {
    out['большой'] = bags;
    return out;
  }
  if (canM) {
    out['средний'] = bags;
    return out;
  }
  out['большой'] = bags;
  return out;
}

/** Нормализация фракции лёгкого (для нарезки/отображения). */
function lightFractionCounterKey_(sub) {
  var u = String(sub || '').trim().toUpperCase();
  if (!u || u.indexOf('БЕЗ') >= 0) return 'средний';
  if (/МЕЛК|МАЛ/.test(u) && !/ОЧ/.test(u)) return 'маленький';
  if (/СРЕД/.test(u)) return 'средний';
  if (/КРУПН|БОЛЬШ|БОЛ/.test(u)) return 'большой';
  if (/ЦЕЛ/.test(u)) return 'целое';
  return 'средний';
}

function appendDoyDistToPacks_(packs, doyByKey, lightBagsByCounter, dist, meta) {
  var order = ['большой', 'средний', 'маленький'];
  for (var i = 0; i < order.length; i++) {
    var key = order[i];
    var n = Number(dist[key]) || 0;
    if (n <= 0) continue;
    doyByKey[key] = (doyByKey[key] || 0) + n;
    if (meta.type === 'light') {
      lightBagsByCounter[key] = (lightBagsByCounter[key] || 0) + n;
    }
    packs.push({
      name: meta.name,
      sub: meta.sub,
      val: meta.val,
      unit: meta.unit,
      bags: n,
      rule: meta.rulePrefix + ' → ' + key,
      type: meta.type,
      counterKey: key,
      label: meta.name + (meta.sub ? ' / ' + meta.sub : '') + ' → ' + n + ' дойп. (' + key + ')'
    });
  }
}

/** Лакомства для сборки = жевалки (chew) + штучные treat-имена. */
function isAssemblyTreatItem_(it) {
  var name = String((it && (it.name || it.main)) || "").trim();
  var cat = String((it && it.cat) || "").toLowerCase();
  if (!name && !cat) return false;
  if (cat === "chew" || cat === "chews") return true;
  if (isPieceSkuName_(name)) return true;
  return false;
}

function basketWithoutTreats_(basket) {
  var out = [];
  (basket || []).forEach(function (it) {
    if (!isAssemblyTreatItem_(it)) out.push(it);
  });
  return out;
}

/** @param {Object=} enabledOpt выключенные форматы дойпака: {маленький:false,...} */
function buildAssemblyForBasket_(basket, enabledOpt) {
  var enabled = enabledOpt || null;
  var packs = [];
  var totalBags = 0;
  var typeCounts = { light: 0, bulk: 0, chew: 0, craft: 0, other: 0 };
  var lightMap = {};
  var lightBagsByCounter = {};
  var doyByKey = { 'маленький': 0, 'средний': 0, 'большой': 0, 'целое': 0 };
  (basket || []).forEach(function (it) {
    var name = String(it.name || it.main || '').trim();
    var sub = String(it.sub || '').trim();
    var val = Number(it.val != null ? it.val : it.value) || 0;
    var cat = String(it.cat || '').toLowerCase();
    var unit = String(it.unit || '').trim() || (isPieceSkuName_(name) || cat === 'chew' || cat === 'chews' ? 'шт' : 'гр');
    if (!name || val <= 0) return;
    var dist = null;
    var type = 'other';
    var rulePrefix = 'дойпак';

    if (/л[её]гк/i.test(name) && !/баран/i.test(name) && !/крошк/i.test(name)) {
      dist = packGramsIntoDoypacks_(val, PACK_CAP_LIGHT_, enabled);
      type = 'light';
      rulePrefix = 'дойпак лёгкое';
      var fk = sub || 'Среднее';
      lightMap[fk] = (lightMap[fk] || 0) + val;
    } else if (/баран/i.test(name) && /л[её]гк/i.test(name)) {
      dist = packGramsIntoDoypacks_(val, PACK_CAP_PRODUCT_, enabled);
      type = 'bulk';
      rulePrefix = 'дойпак баранье лёгкое';
    } else if (cat === 'chew' || cat === 'chews' || isPieceSkuName_(name)) {
      dist = packChewsIntoDoypacks_(val, sub, enabled);
      type = 'chew';
      rulePrefix = 'дойпак жевалки';
    } else {
      dist = packGramsIntoDoypacks_(val, PACK_CAP_PRODUCT_, enabled);
      type = (cat === 'other') ? 'other' : 'bulk';
      rulePrefix = 'дойпак';
    }

    var lineBags = (dist['маленький'] || 0) + (dist['средний'] || 0) + (dist['большой'] || 0);
    totalBags += lineBags;
    typeCounts[type] = (typeCounts[type] || 0) + lineBags;
    appendDoyDistToPacks_(packs, doyByKey, lightBagsByCounter, dist, {
      name: name, sub: sub, val: val, unit: unit, type: type, rulePrefix: rulePrefix
    });
  });

  var craftBags = 0;
  if (packFormatOn_(enabled, 'крафт')) {
    craftBags = craftBagsForDoypacks_(doyByKey);
  }
  typeCounts.craft = craftBags;
  totalBags += craftBags;
  if (craftBags > 0) {
    packs.push({
      name: 'КРАФТ',
      sub: '',
      val: craftBags,
      unit: 'пак',
      bags: craftBags,
      rule: 'крафт клиента (вмест. ' + PACK_CRAFT_HOLDS_.large + 'бол/' +
        PACK_CRAFT_HOLDS_.medium + 'сред/' + PACK_CRAFT_HOLDS_.small + 'мал)',
      type: 'craft',
      counterKey: 'крафт',
      label: 'КРАФТ → ' + craftBags + ' пак.'
    });
  }

  var lightByFraction = [];
  for (var k in lightMap) {
    if (lightMap.hasOwnProperty(k)) lightByFraction.push({ sub: k, val: lightMap[k] });
  }
  return {
    packs: packs,
    totalBags: totalBags,
    typeCounts: typeCounts,
    lightByFraction: lightByFraction,
    lightBagsByCounter: lightBagsByCounter,
    craftBags: craftBags,
    doyByKey: doyByKey,
    craftHolds: PACK_CRAFT_HOLDS_
  };
}

function handleGetAssembly(json, callback, fromPost) {
  var day = json.day || '';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cacheKey = "ASM:" + String(day || "").toUpperCase();
  var cached = cacheGetJson_(cacheKey);
  if (cached && cached.status === "success") {
    return fromPost ? jsonpText(callback, cached) : jsonp(callback, cached);
  }
  var clientsData = getClientsData_(ss, day);
  if (clientsData.status !== 'success') {
    var bad = { status: 'error', message: clientsData.status || 'bad_day' };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var tz = ss.getSpreadsheetTimeZone();
  var dateValue = getDayDate_(ss, day);
  var dateText = dateValue ? formatSheetDate(dateValue, tz) : (clientsData.date || '');
  var memFlags = {};
  try {
    var memory = getMemoryCourierSheet_();
    if (memory && dateText) memFlags = getMemoryJson_(memory, dateText, tz) || {};
  } catch (eM) {}

  var typeTotals = { light: 0, bulk: 0, chew: 0, craft: 0, other: 0 };
  var counterTotals = {};
  var lightAll = {};
  var out = [];
  (clientsData.clients || []).forEach(function (c) {
    var baseName = String(c.name || "").replace(/\s*[·•#]\s*2\s*$/i, "").trim() || String(c.name || "");
    var parts = splitBasketByDog_(c.basket || []);
    var entries = [];
    if (parts && parts.dog2 && parts.dog2.length) {
      entries.push({ name: baseName, basket: parts.dog1 || [], dogPart: 1 });
      entries.push({ name: baseName + " · 2", basket: parts.dog2, dogPart: 2 });
    } else {
      entries.push({ name: c.name, basket: c.basket || [], dogPart: 0 });
    }
    entries.forEach(function (ent) {
      var memE = memFlagEntry_(memFlags, ent.name);
      var printed = !!(memE && memE.printed);
      var basketForPacks = printed ? basketWithoutTreats_(ent.basket || []) : (ent.basket || []);
      var plan = buildAssemblyForBasket_(basketForPacks);
      for (var t in plan.typeCounts) {
        if (plan.typeCounts.hasOwnProperty(t)) typeTotals[t] = (typeTotals[t] || 0) + plan.typeCounts[t];
      }
      var lbc = plan.lightBagsByCounter || {};
      for (var ck in lbc) {
        if (lbc.hasOwnProperty(ck)) counterTotals[ck] = (counterTotals[ck] || 0) + lbc[ck];
      }
      (plan.packs || []).forEach(function (p) {
        if (p.type === 'light') return;
        var key = p.counterKey || '';
        if (!key) return;
        counterTotals[key] = (counterTotals[key] || 0) + (Number(p.bags) || 0);
      });
      (plan.lightByFraction || []).forEach(function (lf) {
        lightAll[lf.sub] = (lightAll[lf.sub] || 0) + lf.val;
      });
      out.push({
        name: ent.name,
        address: c.address || '',
        note: c.note || '',
        basket: ent.basket || [],
        packs: plan.packs,
        totalBags: plan.totalBags,
        craftBags: plan.craftBags || 0,
        lightByFraction: plan.lightByFraction,
        lightBagsByCounter: plan.lightBagsByCounter || {},
        assembled: !!(memE && memE.assembled),
        printed: printed,
        dogPart: ent.dogPart || 0,
        ownerName: baseName
      });
    });
  });
  var lightByFraction = [];
  var lightGramsTotal = 0;
  for (var lk in lightAll) {
    if (!lightAll.hasOwnProperty(lk)) continue;
    lightByFraction.push({ sub: lk, val: lightAll[lk] });
    lightGramsTotal += Number(lightAll[lk]) || 0;
  }
  lightByFraction.sort(function (a, b) {
    var order = { 'Мелкое': 1, 'Среднее': 2, 'Крупное': 3, 'Большое': 3, 'Целое': 4 };
    return (order[a.sub] || 9) - (order[b.sub] || 9) || String(a.sub).localeCompare(String(b.sub));
  });
  var ok = {
    status: 'success',
    day: day,
    date: dateText || clientsData.date || '',
    clients: out,
    typeTotals: typeTotals,
    counterTotals: counterTotals,
    lightByFraction: lightByFraction,
    lightGramsTotal: lightGramsTotal
  };
  cachePutJson_(cacheKey, ok, 20);
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function setupOpsEcosystem() {
  getAccessSheet_();
  getBookingsSheet_();
  getLedgerSheet_();
  getClientsProfilesSheet_();
  // листы «данных» мини-аппа — в DATA_SPREADSHEET_ID (старая книга) или в active
  getGeoSheet_();
  getDeficitSheet_();
  getCuttingCompletionSheet_();
  try { ensureManagerWeekendBlocks_(SpreadsheetApp.getActiveSpreadsheet()); } catch (eW) {}
  var sku = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("SKU_Карта");
  if (!sku) {
    sku = SpreadsheetApp.getActiveSpreadsheet().insertSheet("SKU_Карта");
    sku.getRange(1, 1, 1, 5).setValues([["cutRow", "warehouseRow", "name", "unit", "notes"]]);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var crmLocal = hasLocalCrmSheets_(ss);
  var dataId = PropertiesService.getScriptProperties().getProperty("DATA_SPREADSHEET_ID") || "";
  var seed = { profilesAfter: 0 };
  if (crmLocal) {
    try { seed = seedCrmClientsIntoProfiles_(); } catch (eSeed) {
      seed = { error: String(eSeed) };
    }
  }
  Logger.log("setupOpsEcosystem ok; crmLocal=" + crmLocal + "; DATA_SPREADSHEET_ID=" + (dataId || "(active)") + "; seed=" + JSON.stringify(seed));
  var msg = crmLocal
    ? ("ok — CRM в чистовике; Клиенты: было " + (seed.profilesBefore || 0) + " → стало " + (seed.profilesAfter || 0) +
      " (контакты " + (seed.fromContacts || 0) + ", подписки " + (seed.fromSubs || 0) + ", календарь-ячейки " + (seed.fromMonths || 0) + ")")
    : "ok — CRM-листов не видно; скопируйте Контакты/ПП/АФК/БП/месяцы в эту книгу";
  if (dataId) {
    msg += "; DATA_SPREADSHEET_ID задан (гео/дефициты/итоги/память в старой книге)";
  } else {
    msg += "; данные мини-аппа в этой же книге";
  }
  return msg;
}



/* ========== v7.8 Обучение / репорты / статистика ========== */

function getOrCreateSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers && headers.length) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function handleLogEvent(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getOrCreateSheet_(ss, "Обучение_События", [
    "at", "event", "screen", "role", "telegramId", "client", "day", "meta"
  ]);
  var meta = json.meta;
  if (meta && typeof meta === "object") {
    try { meta = JSON.stringify(meta); } catch (e) { meta = String(meta); }
  }
  sh.appendRow([
    json.at || new Date(),
    String(json.event || ""),
    String(json.screen || ""),
    String(json.role || ""),
    String(json.telegramId || ""),
    String(json.client || (json.meta && json.meta.client) || ""),
    String(json.day || (json.meta && json.meta.day) || ""),
    String(meta || "")
  ]);
  var ok = { status: "success" };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleReportBug(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getOrCreateSheet_(ss, "Баг_Репорты", [
    "at", "screen", "role", "telegramId", "what", "expected", "client", "day", "status"
  ]);
  sh.appendRow([
    json.at || new Date(),
    String(json.screen || ""),
    String(json.role || ""),
    String(json.telegramId || ""),
    String(json.what || ""),
    String(json.expected || ""),
    String(json.client || ""),
    String(json.day || ""),
    "new"
  ]);
  var ok = { status: "success", message: "reported" };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function isCrmFinanceNick_(cell) {
  var t = String(cell || "").trim();
  if (!t) return true;
  if (/^себестоим/i.test(t) || /^стоимость\s*100/i.test(t) || /^итого$/i.test(t)) return true;
  if (/^(id|ник|nick|клиент|client)$/i.test(t)) return true;
  return false;
}

function parsePriceTagFromNote_(note) {
  var m = String(note || "").match(/\[ЦЕНА:\s*([0-9]+(?:[.,][0-9]+)?)\s*BYN\]/i);
  if (!m) return 0;
  return Number(String(m[1]).replace(",", ".")) || 0;
}

function numCrmMoney_(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  return Number(String(v).replace(/\s/g, "").replace(",", ".").replace(/[^\d.\-]/g, "")) || 0;
}

/** Первое ненулевое число из списка колонок (пустая «ОБЩАЯ …» не затирает рабочие). */
function firstPositiveMoney_(row, cols) {
  if (!row || !cols || !cols.length) return 0;
  for (var i = 0; i < cols.length; i++) {
    var c = cols[i];
    if (c == null || c < 0) continue;
    var v = numCrmMoney_(row[c]);
    if (v > 0) return v;
  }
  return 0;
}

function firstMoneyAny_(row, cols) {
  if (!row || !cols || !cols.length) return 0;
  for (var i = 0; i < cols.length; i++) {
    var c = cols[i];
    if (c == null || c < 0) continue;
    if (row[c] == null || row[c] === "") continue;
    return numCrmMoney_(row[c]);
  }
  return 0;
}

/**
 * Метрики с листа ПП (канон колонок):
 *  оборот   = ФАКТ.СТОИМОСТЬ (или «грязные» / ОБОРОТ)
 *  себест   = ОБЩАЯ СЕБЕСТОИМОСТЬ → иначе ИТОГОВАЯ → иначе СЕБЕСТОИМОСТЬ
 *  выхлоп   = ОБЩИЙ ВЫХЛОП → иначе ВЫХЛОП → иначе max(0, оборот − себест)
 * Пустые «ОБЩАЯ/ОБЩИЙ» не обнуляют сумму — fallback на рабочие колонки.
 */
function collectPpMoneyStats_(crmSs) {
  var out = {
    clients: 0,
    dirty: 0,
    clean: 0,
    cost: 0,
    turnover: 0,
    colsUsed: { fact: "", cost: "", clean: "" },
    byKey: {}
  };
  var data = null;
  try { data = getCrmSheetValuesFast_(crmSs, "ПП"); } catch (e0) { data = null; }
  if (!data || data.length < 3) return out;
  var headers = data[0];
  var factCols = [];
  var dirtyCols = [];
  var turnoverCols = [];
  var costCols = [];
  var itogSebCols = [];
  var rawSebCols = [];
  var vyhlopTotalCols = [];
  var vyhlopCols = [];
  var wishesCol = 4;
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || "").toUpperCase().replace(/\s+/g, " ").trim();
    if (!h) continue;
    if (h.indexOf("ФАКТ") >= 0 && h.indexOf("СТОИМ") >= 0) factCols.push(c);
    if (/^ГРЯЗН/.test(h) || h.indexOf("ГРЯЗН") === 0) dirtyCols.push(c);
    if (h.indexOf("ОБОРОТ") >= 0) turnoverCols.push(c);
    if (h.indexOf("ОБЩАЯ СЕБЕСТОИМ") >= 0) costCols.push(c);
    if (h.indexOf("ИТОГОВАЯ СЕБЕСТОИМ") >= 0) itogSebCols.push(c);
    if (h === "СЕБЕСТОИМОСТЬ" || (h.indexOf("СЕБЕСТОИМ") >= 0 && h.indexOf("ИТОГ") < 0 && h.indexOf("ОБЩ") < 0)) {
      rawSebCols.push(c);
    }
    if (h.indexOf("ОБЩИЙ ВЫХЛОП") >= 0) vyhlopTotalCols.push(c);
    if (/^ВЫХЛОП$/.test(h) || (h.indexOf("ВЫХЛОП") >= 0 && h.indexOf("ОБЩИЙ") < 0)) vyhlopCols.push(c);
    if (/ПОЖЕЛАН|WISH/.test(h)) wishesCol = c;
  }
  // приоритет колонок для оборота / себест / выхлопа
  var turnPick = turnoverCols.concat(factCols).concat(dirtyCols);
  var costPick = costCols.concat(itogSebCols).concat(rawSebCols);
  var cleanPick = vyhlopTotalCols.concat(vyhlopCols);

  out.colsUsed.fact = turnPick.length ? String(headers[turnPick[0]] || "") : "";
  out.colsUsed.cost = costPick.length ? String(headers[costPick[0]] || "") : "";
  out.colsUsed.clean = cleanPick.length ? String(headers[cleanPick[0]] || "") : "";

  var usedCostName = "";
  var usedCleanName = "";
  var usedTurnName = "";

  for (var r = 2; r < data.length; r++) {
    var nick = String(data[r][0] || "").trim();
    if (isCrmFinanceNick_(nick)) continue;
    out.clients++;

    var turn = firstPositiveMoney_(data[r], turnPick);
    if (!turn) turn = firstMoneyAny_(data[r], turnPick);
    var cost = firstPositiveMoney_(data[r], costPick);
    if (!cost) cost = firstMoneyAny_(data[r], costPick);
    var clean = firstPositiveMoney_(data[r], cleanPick);
    if (!clean) clean = firstMoneyAny_(data[r], cleanPick);
    if (!clean && (turn > 0 || cost > 0)) {
      clean = Math.max(0, Math.round((turn - cost) * 100) / 100);
    }

    if (!usedTurnName) {
      for (var ti = 0; ti < turnPick.length; ti++) {
        if (numCrmMoney_(data[r][turnPick[ti]]) > 0) {
          usedTurnName = String(headers[turnPick[ti]] || "");
          break;
        }
      }
    }
    if (!usedCostName) {
      for (var ci = 0; ci < costPick.length; ci++) {
        if (numCrmMoney_(data[r][costPick[ci]]) > 0) {
          usedCostName = String(headers[costPick[ci]] || "");
          break;
        }
      }
    }
    if (!usedCleanName) {
      for (var yi = 0; yi < cleanPick.length; yi++) {
        if (numCrmMoney_(data[r][cleanPick[yi]]) > 0) {
          usedCleanName = String(headers[cleanPick[yi]] || "");
          break;
        }
      }
    }

    out.dirty += turn;
    out.turnover += turn;
    out.clean += clean;
    out.cost += cost;
    var wishes = String(data[r][wishesCol] != null ? data[r][wishesCol] : data[r][4] || "");
    var key = clientMatchKey_(nick) || String(extractInstagramNick_(nick) || nick).toUpperCase();
    if (key) {
      out.byKey[key] = {
        label: nick,
        nick: extractInstagramNick_(nick) || nick,
        fact: turn,
        clean: clean,
        cost: cost,
        wishes: wishes,
        fromBpYmd: parseFromBpYmd_(wishes)
      };
    }
  }
  if (usedTurnName) out.colsUsed.fact = usedTurnName;
  if (usedCostName) out.colsUsed.cost = usedCostName;
  if (usedCleanName) out.colsUsed.clean = usedCleanName;
  out.dirty = Math.round(out.dirty * 100) / 100;
  out.turnover = Math.round(out.turnover * 100) / 100;
  out.clean = Math.round(out.clean * 100) / 100;
  out.cost = Math.round(out.cost * 100) / 100;
  return out;
}

var STATS_MONTH_HEADERS_ = [
  "monthKey", "at", "ppClients", "ppTurnover", "ppCost", "ppClean",
  "calPpActual", "retail", "partner", "calTurnover", "bpSpend", "deliveries", "bpConverted"
];

function ensureStatsMonthSheet_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Stats_Месяцы");
  if (!sh) {
    sh = ss.insertSheet("Stats_Месяцы");
    sh.getRange(1, 1, 1, STATS_MONTH_HEADERS_.length).setValues([STATS_MONTH_HEADERS_]);
    sh.setFrozenRows(1);
    try { sh.hideSheet(); } catch (eH) {}
  } else if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, STATS_MONTH_HEADERS_.length).setValues([STATS_MONTH_HEADERS_]);
  }
  return sh;
}

function upsertStatsMonthSnapshot_(ss, snap) {
  if (!snap || !snap.monthKey) return;
  var sh = ensureStatsMonthSheet_(ss);
  var data = sh.getDataRange().getValues();
  var rowIdx = -1;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0] || "").slice(0, 7) === String(snap.monthKey).slice(0, 7)) {
      rowIdx = r + 1;
      break;
    }
  }
  var vals = [
    String(snap.monthKey).slice(0, 7),
    new Date(),
    Number(snap.ppClients) || 0,
    Number(snap.ppTurnover) || 0,
    Number(snap.ppCost) || 0,
    Number(snap.ppClean) || 0,
    Number(snap.calPpActual) || 0,
    Number(snap.retail) || 0,
    Number(snap.partner) || 0,
    Number(snap.calTurnover) || 0,
    Number(snap.bpSpend) || 0,
    Number(snap.deliveries) || 0,
    Number(snap.bpConverted) || 0
  ];
  if (rowIdx > 0) sh.getRange(rowIdx, 1, 1, STATS_MONTH_HEADERS_.length).setValues([vals]);
  else sh.appendRow(vals);
}

function readStatsMonthHistory_(ss, currentKey, limitN) {
  limitN = Number(limitN) || 6;
  var out = [];
  var sh = null;
  try { sh = ensureStatsMonthSheet_(ss); } catch (e0) { return out; }
  var data = sh.getDataRange().getValues();
  var map = {};
  for (var r = 1; r < data.length; r++) {
    var mk = String(data[r][0] || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mk)) continue;
    map[mk] = {
      monthKey: mk,
      at: data[r][1],
      ppClients: Number(data[r][2]) || 0,
      ppTurnover: Number(data[r][3]) || 0,
      ppCost: Number(data[r][4]) || 0,
      ppClean: Number(data[r][5]) || 0,
      calPpActual: Number(data[r][6]) || 0,
      retail: Number(data[r][7]) || 0,
      partner: Number(data[r][8]) || 0,
      calTurnover: Number(data[r][9]) || 0,
      bpSpend: Number(data[r][10]) || 0,
      deliveries: Number(data[r][11]) || 0,
      bpConverted: Number(data[r][12]) || 0
    };
  }
  // добрать календарные метрики за прошлые месяцы, если снимка нет / пусто
  var keys = [];
  try {
    var parts = String(currentKey || "").split("-");
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    for (var i = 0; i < limitN; i++) {
      var mm = m - i;
      var yy = y;
      while (mm <= 0) { mm += 12; yy--; }
      keys.push(yy + "-" + (mm < 10 ? "0" : "") + mm);
    }
  } catch (eK) {
    keys = [currentKey];
  }
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var row = map[key];
    // только снимки — не пересчитывать календарь за 6 месяцев на каждый getStats
    if (!row) {
      row = {
        monthKey: key,
        ppClients: 0,
        ppTurnover: 0,
        ppCost: 0,
        ppClean: 0,
        calPpActual: 0,
        retail: 0,
        partner: 0,
        calTurnover: 0,
        bpSpend: 0,
        deliveries: 0,
        bpConverted: 0,
        fromCalendarOnly: false,
        missingSnapshot: true
      };
    }
    out.push(row);
  }
  return out;
}

function statsDelta_(cur, prev) {
  cur = Number(cur) || 0;
  prev = Number(prev) || 0;
  var abs = Math.round((cur - prev) * 100) / 100;
  var pct = null;
  if (prev !== 0) pct = Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
  else if (cur !== 0) pct = 100;
  return { abs: abs, pct: pct, cur: cur, prev: prev };
}

function stampFromBpIntoWishes_(wishes, ymd) {
  var base = String(wishes || "").replace(/\[FROMBP:[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();
  var d = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    try {
      d = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Europe/Minsk", "yyyy-MM-dd");
    } catch (e) { d = ""; }
  }
  if (!d) return base;
  return (base + (base ? " " : "") + "[FROMBP:" + d + "]").trim();
}

function parseFromBpYmd_(wishes) {
  var m = String(wishes || "").match(/\[FROMBP:(\d{4}-\d{2}-\d{2})\]/i);
  return m ? m[1] : "";
}

/** Журнал переходов БП→ПП (для статистики месяца). */
function ensureStatsConversionsSheet_(ss) {
  return getOrCreateSheet_(ss || SpreadsheetApp.getActiveSpreadsheet(), "Stats_Переходы", [
    "at", "ymd", "monthKey", "nick", "label", "fromSheet", "toSheet", "subId", "note"
  ]);
}

function appendStatsConversion_(ss, opts) {
  opts = opts || {};
  var sh = ensureStatsConversionsSheet_(ss);
  var tz = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSpreadsheetTimeZone() || "Europe/Minsk";
  var now = opts.at instanceof Date ? opts.at : new Date();
  var ymd = String(opts.ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) ymd = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  sh.appendRow([
    now,
    ymd,
    ymd.slice(0, 7),
    String(opts.nick || "").trim(),
    String(opts.label || opts.nick || "").trim(),
    String(opts.fromSheet || "БП").trim(),
    String(opts.toSheet || "ПП").trim(),
    String(opts.subId || "").trim(),
    String(opts.note || "").trim()
  ]);
}

/** Кол-во купонов (≥0, целое). */
function normalizeCouponsQty_(v) {
  var n = Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** Цена пачки купонов (вся партия), BYN. */
function normalizeCouponPackPrice_(v) {
  var n = Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}
/** @deprecated alias — цена пачки, не за штуку */
function normalizeCouponUnitPrice_(v) {
  return normalizeCouponPackPrice_(v);
}

/** Затраты на купоны строки = цена всей пачки (если кол-во > 0). */
function couponsCostFromRow_(row) {
  if (!row) return 0;
  var qty = normalizeCouponsQty_(row.couponsQty);
  var pack = normalizeCouponPackPrice_(row.couponPrice);
  if (!(qty > 0) || !(pack > 0)) return 0;
  return pack;
}

/** Сырая себест корзины по прайсу. modeHint: pp|retail|bp — какой лист пробовать первым. */
function estimateBasketRawCost_(basket, modeHint) {
  basket = basket || [];
  if (!basket.length) return 0;
  function sumWith_(mode) {
    var priceInfo;
    try { priceInfo = readPriceCosts_(mode); } catch (e) { return 0; }
    if (!priceInfo || !priceInfo.costs) return 0;
    var total = 0;
    for (var i = 0; i < basket.length; i++) {
      var it = basket[i] || {};
      var name = String(it.name || it.main || "").trim();
      var sub = String(it.sub || "").trim();
      var val = Number(it.val != null ? it.val : it.value) || 0;
      var cat = String(it.cat || "").trim();
      if (!name || val <= 0) continue;
      var key = name + (sub ? " / " + sub : "");
      var info = priceInfo.costs[key];
      if (!info) {
        for (var k in priceInfo.costs) {
          if (priceInfo.costs[k].name === name && (!sub || priceInfo.costs[k].sub === sub)) {
            info = priceInfo.costs[k];
            break;
          }
        }
      }
      var unitPrice = info ? Number(info.unitPrice != null ? info.unitPrice : info.per100) || 0 : 0;
      var piece = false;
      if (info && info.piece) piece = true;
      else if (cat === "chew" || cat === "chews") piece = true;
      else if (isPieceSkuName_(name) || /шт/i.test(name)) piece = true;
      total += piece ? (unitPrice * val) : ((val / 100) * unitPrice);
    }
    return Math.round(total * 100) / 100;
  }
  var hint = String(modeHint || "").toLowerCase();
  var order = ["pp", "retail", "bp"];
  if (hint === "bp") order = ["bp", "pp", "retail"];
  else if (hint === "retail" || hint === "partner") order = ["retail", "pp", "bp"];
  var t = 0;
  for (var oi = 0; oi < order.length; oi++) {
    t = sumWith_(order[oi]);
    if (t > 0) break;
  }
  return t;
}

function calendarSourceKind_(row) {
  function kindFromText_(raw) {
    var s = String(raw || "").toLowerCase().trim();
    if (!s) return "";
    if (/^бп\b|^bp\b|бесплат|trial/.test(s) || s.indexOf("бп") >= 0) return "bp";
    if (/^пп\b|^pp\b|подписк|афк/.test(s) || s.indexOf("пп") >= 0) return "pp";
    if (/партн|partner/.test(s)) return "partner";
    if (/розниц|^р$|^r$|retail/.test(s)) return "retail";
    return "";
  }
  // segment надёжнее source (source часто "manual"/"retail" по умолчанию)
  var fromSeg = kindFromText_(row && row.segment);
  if (fromSeg) return fromSeg;
  var fromSrc = kindFromText_(row && row.source);
  if (fromSrc) return fromSrc;
  var m = String((row && row.note) || "").match(/\[SEG:([^\]]+)\]/i);
  if (m) {
    var fromNote = kindFromText_(m[1]);
    if (fromNote) return fromNote;
  }
  // пустой source вроде manual/saveOrder — не тип
  return "other";
}

function collectBpFunnelStats_(crmSs) {
  var out = { total: 0, bp1: 0, bp2: 0, final: 0 };
  var data = null;
  try { data = getCrmSheetValuesFast_(crmSs, "БП"); } catch (e0) { data = null; }
  if (!data || data.length < 3) return out;
  for (var r = 2; r < data.length; r++) {
    var nick = String(data[r][0] || "").trim();
    if (isCrmFinanceNick_(nick)) continue;
    out.total++;
    var st = normalizeBpStage_(data[r][3]);
    if (st === "ФИНАЛ") out.final++;
    else if (st === "БП2") out.bp2++;
    else out.bp1++;
  }
  return out;
}

function collectBpToPpConversions_(ss, crmSs, monthKey, ppStatsOrOpts) {
  var allTime = !!(ppStatsOrOpts && ppStatsOrOpts.allTime);
  var ppStats = (ppStatsOrOpts && ppStatsOrOpts.byKey) ? ppStatsOrOpts : null;
  if (allTime && !ppStats) {
    try {
      var crmX = crmSs || getCrmSpreadsheet_();
      ppStats = collectPpMoneyStats_(crmX);
    } catch (e0) { ppStats = { byKey: {} }; }
  }
  var out = { count: 0, nicks: [], keys: [], ymdByKey: {}, fromLedger: 0, fromWishes: 0 };
  var want = String(monthKey || "").slice(0, 7);
  var seen = {};
  function addNick_(nick, label, ymd) {
    var k = clientMatchKey_(nick || label) || String(nick || label || "").toUpperCase();
    if (!k || seen[k]) return;
    seen[k] = true;
    out.count++;
    out.nicks.push(String(label || nick || k));
    out.keys.push(k);
    var y = String(ymd || "").slice(0, 10);
    if (y) out.ymdByKey[k] = y;
  }
  try {
    var sh = ss.getSheetByName("Stats_Переходы");
    if (sh && sh.getLastRow() >= 2) {
      var data = sh.getDataRange().getValues();
      for (var r = 1; r < data.length; r++) {
        var mk = String(data[r][2] || "").slice(0, 7);
        var ymd = String(data[r][1] || "").slice(0, 10);
        if (!allTime && want && mk !== want && ymd.slice(0, 7) !== want) continue;
        var fromS = String(data[r][5] || "").toUpperCase();
        var toS = String(data[r][6] || "").toUpperCase();
        if (fromS.indexOf("БП") < 0 || toS.indexOf("ПП") < 0) continue;
        out.fromLedger++;
        addNick_(data[r][3], data[r][4], ymd);
      }
    }
  } catch (eL) {}
  try {
    var byKey = (ppStats && ppStats.byKey) || {};
    for (var k in byKey) {
      if (!byKey.hasOwnProperty(k)) continue;
      var y = String(byKey[k].fromBpYmd || "").slice(0, 10);
      if (!y) continue;
      if (!allTime && want && y.slice(0, 7) !== want) continue;
      out.fromWishes++;
      addNick_(byKey[k].nick, byKey[k].label, y);
    }
  } catch (eW) {}
  return out;
}

function calendarRowPrice_(row) {
  var op = row && row.orderPrice;
  if (op != null && op !== "" && !isNaN(Number(op))) {
    var n = Number(op);
    if (isFinite(n) && n > 0) return n;
  }
  var fromTag = parsePriceTagFromNote_(row && row.note);
  if (fromTag > 0) return fromTag;
  try {
    var e = extractOrderPriceFromNote_(row && row.note);
    if (e !== "" && e != null && !isNaN(Number(e)) && Number(e) > 0) return Number(e);
  } catch (e0) {}
  return 0;
}

function collectMonthCalendarStats_(ss, monthKey, opts) {
  opts = opts || {};
  var out = {
    deliveriesTotal: 0,
    bySource: { pp: 0, retail: 0, bp: 0, partner: 0, other: 0 },
    revenueBySource: { pp: 0, retail: 0, bp: 0, partner: 0, other: 0 },
    costBySource: { pp: 0, retail: 0, bp: 0, partner: 0, other: 0 },
    revenueActual: 0,
    costActual: 0,
    retailRevenue: 0,
    partnerRevenue: 0,
    bpCost: 0,
    bpBasketCost: 0,
    bpDeliveryCost: 0,
    bpDeliveries: 0,
    ppClientsDelivered: 0,
    ppPriceByKey: {},
    ppDeliveredKeys: {},
    missingPrice: 0,
    missingBasketCost: 0,
    productCost: 0,
    couponsCost: 0,
    couponsQty: 0,
    couponsOrders: 0,
    partnerRows: [],
    ppBasketCost: 0,
    ppLightCost: 0,
    ppDeliveryCost: 0,
    ppLightPeople: 0,
    ppLightKeys: {}
  };
  var rows = [];
  try { rows = readAllCalendarRows_(); } catch (e0) { rows = []; }
  var books = [];
  try { books = readAllBookings_(); } catch (eB) { books = []; }
  var tz = ss.getSpreadsheetTimeZone();
  var want = String(monthKey || opts.monthKey || '').slice(0, 7);
  var onlyPast = opts.onlyPast === true;
  var fromIso = opts.fromIso ? String(opts.fromIso).slice(0, 10) : '';
  var toIso = opts.toIso ? String(opts.toIso).slice(0, 10) : '';
  var todayIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  var bookByKey = {};
  for (var bi = 0; bi < books.length; bi++) {
    var b = books[bi];
    if (!b || !b.client) continue;
    if (String(b.status || '').toLowerCase() === 'cancelled') continue;
    var bIso = '';
    var bDate = parseFlexibleDate_(b.date, tz);
    if (bDate) bIso = Utilities.formatDate(bDate, tz, 'yyyy-MM-dd');
    if (!bIso) continue;
    if (want && bIso.slice(0, 7) !== want) continue;
    if (fromIso && bIso < fromIso) continue;
    if (toIso && bIso > toIso) continue;
    if (onlyPast && bIso > todayIso) continue;
    var bCk = clientMatchKey_(b.client) || String(b.client || '').toUpperCase();
    if (!bCk) continue;
    bookByKey[bIso + '|' + bCk] = b;
  }

  var seenKeys = {};
  function ingestRow_(row) {
    if (!row) return;
    var st = String(row.status || '').toLowerCase();
    if (st === 'cancelled') return;
    var iso = String(row.dateIso || '').slice(0, 10);
    if (!iso || iso.length < 7) {
      var bd = parseFlexibleDate_(row.date, tz) || parseFlexibleDate_(row.dateIso, tz);
      if (bd) iso = Utilities.formatDate(bd, tz, 'yyyy-MM-dd');
    }
    if (!iso) return;
    if (want && iso.slice(0, 7) !== want) return;
    if (fromIso && iso < fromIso) return;
    if (toIso && iso > toIso) return;
    if (onlyPast && iso > todayIso) return;
    var ck = clientMatchKey_(row.client) || String(row.client || '').toUpperCase();
    var dedupe = iso + '|' + (ck || String(row.client || '').toUpperCase());
    if (seenKeys[dedupe]) return;
    seenKeys[dedupe] = true;

    var book = bookByKey[dedupe];
    if (book) {
      if (!(calendarRowPrice_(row) > 0) && calendarRowPrice_(book) > 0) {
        row.orderPrice = book.orderPrice;
        if (!row.note && book.note) row.note = book.note;
      }
      var hasBask = row.basket && row.basket.length;
      if (!hasBask && book.basket && book.basket.length) row.basket = book.basket;
      if (!row.source && book.source) row.source = book.source;
      if (!row.segment && book.segment) row.segment = book.segment;
      if (!(normalizeCouponsQty_(row.couponsQty) > 0) && normalizeCouponsQty_(book.couponsQty) > 0) {
        row.couponsQty = book.couponsQty;
        row.couponPrice = book.couponPrice;
      }
    }

    out.deliveriesTotal++;
    var src = calendarSourceKind_(row);
    if (src === 'other' && calendarRowPrice_(row) > 0) src = 'retail';
    out.bySource[src] = (out.bySource[src] || 0) + 1;
    var price = calendarRowPrice_(row);
    if (!(price > 0) && src !== 'bp') out.missingPrice++;
    out.revenueBySource[src] = Math.round(((out.revenueBySource[src] || 0) + price) * 100) / 100;
    out.revenueActual += price;
    var bask = row.basket;
    if ((!bask || !bask.length) && row.basketJson) {
      try { bask = JSON.parse(String(row.basketJson)); } catch (eB2) { bask = []; }
    }
    // продукция = себест состава из заказа; купоны = qty×цена;
    // БП +6р доставка; ПП +6р доставка + свет 11р на человека (раз за месяц)
    var product = estimateBasketRawCost_(bask, src);
    var coupons = couponsCostFromRow_(row);
    var deliveryFee = 0;
    var lightFee = 0;
    if (src === "bp") deliveryFee = BP_DELIVERY_COST_BYN_;
    if (src === "pp") {
      deliveryFee = PP_DELIVERY_COST_BYN_;
      if (ck && !out.ppLightKeys[ck]) {
        out.ppLightKeys[ck] = true;
        lightFee = PP_LIGHT_COST_BYN_;
        out.ppLightPeople = (out.ppLightPeople || 0) + 1;
      }
    }
    var costWithAll = Math.round((product + coupons + deliveryFee + lightFee) * 100) / 100;
    if (!(product > 0) && bask && bask.length) out.missingBasketCost++;
    out.productCost = Math.round(((out.productCost || 0) + product) * 100) / 100;
    out.couponsCost = Math.round(((out.couponsCost || 0) + coupons) * 100) / 100;
    if (coupons > 0) {
      out.couponsQty = (out.couponsQty || 0) + normalizeCouponsQty_(row.couponsQty);
      out.couponsOrders = (out.couponsOrders || 0) + 1;
    }
    out.costBySource[src] = Math.round(((out.costBySource[src] || 0) + costWithAll) * 100) / 100;
    out.costActual += costWithAll;
    if (src === 'pp' && ck) {
      out.ppDeliveredKeys[ck] = true;
      out.ppPriceByKey[ck] = Math.round(((out.ppPriceByKey[ck] || 0) + price) * 100) / 100;
      out.ppBasketCost = Math.round(((out.ppBasketCost || 0) + product) * 100) / 100;
      out.ppDeliveryCost = Math.round(((out.ppDeliveryCost || 0) + deliveryFee) * 100) / 100;
      out.ppLightCost = Math.round(((out.ppLightCost || 0) + lightFee) * 100) / 100;
    }
    if (src === 'bp') {
      out.bpDeliveries++;
      out.bpCost += Math.round((product + deliveryFee) * 100) / 100;
      out.bpBasketCost = Math.round(((out.bpBasketCost || 0) + product) * 100) / 100;
      out.bpDeliveryCost = Math.round(((out.bpDeliveryCost || 0) + deliveryFee) * 100) / 100;
      var pn = String(row.ppPartner || "").trim();
      // партнёр пришёл на БП (не на ПП)
      if (pn) {
        out.partnerRows.push({ name: pn, deliveries: 1, revenue: price, cost: costWithAll });
      }
    }
  }

  for (var i = 0; i < rows.length; i++) ingestRow_(rows[i]);
  for (var bk in bookByKey) {
    if (!bookByKey.hasOwnProperty(bk)) continue;
    if (seenKeys[bk]) continue;
    ingestRow_(bookByKey[bk]);
  }
  out.revenueActual = Math.round(out.revenueActual * 100) / 100;
  out.costActual = Math.round(out.costActual * 100) / 100;
  out.productCost = Math.round((out.productCost || 0) * 100) / 100;
  out.couponsCost = Math.round((out.couponsCost || 0) * 100) / 100;
  out.retailRevenue = out.revenueBySource.retail || 0;
  out.partnerRevenue = out.revenueBySource.partner || 0;
  out.bpCost = Math.round(out.bpCost * 100) / 100;
  out.bpBasketCost = Math.round((out.bpBasketCost || 0) * 100) / 100;
  out.bpDeliveryCost = Math.round((out.bpDeliveryCost || 0) * 100) / 100;
  out.ppBasketCost = Math.round((out.ppBasketCost || 0) * 100) / 100;
  out.ppDeliveryCost = Math.round((out.ppDeliveryCost || 0) * 100) / 100;
  out.ppLightCost = Math.round((out.ppLightCost || 0) * 100) / 100;
  out.ppClientsDelivered = Object.keys(out.ppDeliveredKeys).length;
  out.todayIso = todayIso;
  out.fromIso = fromIso;
  out.toIso = toIso;
  out.onlyPast = onlyPast;
  return out;
}

/** Сколько реально «вышло» с ПП: [ЦЕНА] по доставкам, иначе fact с листа при paid=yes. */
function collectPpActualOut_(ss, monthKey, ppStats, monthCal) {
  var out = {
    actual: 0,
    fromPriceTags: 0,
    fromPaidCycle: 0,
    clientsCounted: 0,
    clientsMissingPrice: 0
  };
  var byKey = (ppStats && ppStats.byKey) || {};
  var priceByKey = (monthCal && monthCal.ppPriceByKey) || {};
  var delivered = (monthCal && monthCal.ppDeliveredKeys) || {};
  var tz = ss.getSpreadsheetTimeZone() || "Europe/Minsk";
  var cycleStore = {};
  try {
    var memory = getMemoryCourierSheet_();
    var dummyDate = new Date(String(monthKey) + "-15T12:00:00");
    cycleStore = getPpMonthCycleStore_(memory, ppMonthCycleKey_(dummyDate, tz), tz) || {};
  } catch (eC) { cycleStore = {}; }

  var counted = {};
  function mark_(k) {
    if (!k || counted[k]) return false;
    counted[k] = true;
    out.clientsCounted++;
    return true;
  }

  // 1) суммы [ЦЕНА] по клиентам ПП
  for (var pk in priceByKey) {
    if (!priceByKey.hasOwnProperty(pk)) continue;
    var p = Number(priceByKey[pk]) || 0;
    if (p > 0) {
      out.fromPriceTags += p;
      out.actual += p;
      mark_(pk);
    }
  }

  // 2) paid=yes в цикле месяца без цены в календаре → fact с листа ПП
  for (var ck in cycleStore) {
    if (!cycleStore.hasOwnProperty(ck)) continue;
    var ent = cycleStore[ck];
    if (!ent || typeof ent !== "object") continue;
    if (String(ent.paid || "").toLowerCase() !== "yes") continue;
    if (priceByKey[ck] > 0) continue;
    var fact = byKey[ck] ? Number(byKey[ck].fact) || 0 : 0;
    if (!(fact > 0)) continue;
    out.fromPaidCycle += fact;
    out.actual += fact;
    mark_(ck);
  }

  // клиенты с доставкой ПП, но без цены и без paid
  for (var dk in delivered) {
    if (!delivered.hasOwnProperty(dk)) continue;
    if (counted[dk]) continue;
    if ((Number(priceByKey[dk]) || 0) > 0) continue;
    out.clientsMissingPrice++;
  }

  out.actual = Math.round(out.actual * 100) / 100;
  out.fromPriceTags = Math.round(out.fromPriceTags * 100) / 100;
  out.fromPaidCycle = Math.round(out.fromPaidCycle * 100) / 100;
  return out;
}


/* ========== Партнёры (источник ПП) ========== */
var PARTNERS_HEADERS_ = ["id", "name", "note", "active", "createdAt", "updatedAt"];

function getPartnersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Партнёры");
  if (!sh) {
    sh = ss.insertSheet("Партнёры");
    sh.getRange(1, 1, 1, PARTNERS_HEADERS_.length).setValues([PARTNERS_HEADERS_]);
    sh.setFrozenRows(1);
  } else {
    ensureSheetHeadersAppend_(sh, PARTNERS_HEADERS_);
  }
  return sh;
}

function readAllPartners_() {
  var sh = getPartnersSheet_();
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var name = String(data[r][1] || "").trim();
    if (!name) continue;
    out.push({
      rowIndex: r + 1,
      id: String(data[r][0] || ""),
      name: name,
      note: String(data[r][2] || ""),
      active: String(data[r][3] || "yes").toLowerCase() !== "no",
      createdAt: data[r][4],
      updatedAt: data[r][5]
    });
  }
  out.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name), "ru");
  });
  return out;
}

function handleListPartners(json, callback, fromPost) {
  var activeOnly = !(json && (json.all === "1" || json.all === true || json.all === 1));
  var list = [];
  try { list = readAllPartners_(); } catch (e0) { list = []; }
  if (activeOnly) list = list.filter(function (p) { return p.active; });
  var ok = { status: "success", partners: list };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleSavePartner(json, callback, fromPost) {
  var name = String((json && json.name) || "").trim();
  if (!name) {
    var bad = { status: "error", message: "Укажите имя партнёра" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var sh = getPartnersSheet_();
  var all = readAllPartners_();
  var now = new Date();
  var note = String((json && json.note) || "").trim();
  var active = (json && (json.active === false || json.active === "no" || json.active === 0 || json.active === "0")) ? "no" : "yes";
  var id = String((json && json.id) || "").trim();
  var hit = null;
  for (var i = 0; i < all.length; i++) {
    if (id && all[i].id === id) { hit = all[i]; break; }
    if (!id && String(all[i].name).toLowerCase() === name.toLowerCase()) { hit = all[i]; break; }
  }
  if (!id) id = hit ? hit.id : ("p_" + Utilities.getUuid().slice(0, 8));
  var vals = [id, name, note, active, hit ? hit.createdAt : now, now];
  if (hit) sh.getRange(hit.rowIndex, 1, 1, PARTNERS_HEADERS_.length).setValues([vals]);
  else sh.appendRow(vals);
  var ok = { status: "success", id: id, name: name, active: active === "yes" };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleDeletePartner(json, callback, fromPost) {
  var id = String((json && json.id) || "").trim();
  var name = String((json && json.name) || "").trim();
  var all = readAllPartners_();
  var hit = null;
  for (var i = 0; i < all.length; i++) {
    if (id && all[i].id === id) { hit = all[i]; break; }
    if (name && String(all[i].name).toLowerCase() === name.toLowerCase()) { hit = all[i]; break; }
  }
  if (!hit) {
    var bad = { status: "error", message: "Партнёр не найден" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  // soft-delete
  var sh = getPartnersSheet_();
  sh.getRange(hit.rowIndex, 4).setValue("no");
  sh.getRange(hit.rowIndex, 6).setValue(new Date());
  var ok = { status: "success", id: hit.id, deleted: true };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/* ========== Партнёрский мини-апп (сети / точки / доступы) ========== */
var PARTNER_NET_HEADERS_ = ["id", "name", "logo", "active", "updatedAt"];
var PARTNER_POINT_HEADERS_ = ["id", "networkId", "name", "address", "active", "updatedAt"];
var PARTNER_ACCESS_HEADERS_ = ["id", "username", "telegramId", "name", "networkId", "pointIds", "role", "status", "updatedAt"];
var PARTNER_ORDER_HEADERS_ = ["id", "dateIso", "locationId", "locationName", "networkId", "telegramId", "userName", "username", "basketJson", "status", "createdAt"];

function partnerNormUser_(u) {
  return String(u || "").replace(/^@/, "").trim().toLowerCase();
}

function partnerParsePointIds_(raw) {
  if (Array.isArray(raw)) {
    return raw.map(function (x) { return String(x || "").trim(); }).filter(Boolean);
  }
  var s = String(raw || "").trim();
  if (!s) return [];
  if (s.charAt(0) === "[") {
    try {
      var arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.map(function (x) { return String(x || "").trim(); }).filter(Boolean);
      }
    } catch (e) {}
  }
  return s.split(/[,;\s]+/).map(function (x) { return String(x || "").trim(); }).filter(Boolean);
}

function partnerRequireOwner_(actorId) {
  var actor = String(actorId || "").trim();
  if (!actor) return false;
  if (isOwnerId_(actor)) return true;
  var row = findAccessById_(actor);
  return !!(row && String(row.role || "").toLowerCase() === "owner" &&
    String(row.status || "").toLowerCase() !== "denied");
}

function getPartnerNetworksSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Partner_Networks");
  if (!sh) {
    sh = ss.insertSheet("Partner_Networks");
    sh.getRange(1, 1, 1, PARTNER_NET_HEADERS_.length).setValues([PARTNER_NET_HEADERS_]);
    sh.setFrozenRows(1);
  } else {
    ensureSheetHeadersAppend_(sh, PARTNER_NET_HEADERS_);
  }
  return sh;
}

function getPartnerPointsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Partner_Points");
  if (!sh) {
    sh = ss.insertSheet("Partner_Points");
    sh.getRange(1, 1, 1, PARTNER_POINT_HEADERS_.length).setValues([PARTNER_POINT_HEADERS_]);
    sh.setFrozenRows(1);
  } else {
    ensureSheetHeadersAppend_(sh, PARTNER_POINT_HEADERS_);
  }
  return sh;
}

function getPartnerAccessSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Partner_Access");
  if (!sh) {
    sh = ss.insertSheet("Partner_Access");
    sh.getRange(1, 1, 1, PARTNER_ACCESS_HEADERS_.length).setValues([PARTNER_ACCESS_HEADERS_]);
    sh.setFrozenRows(1);
  } else {
    ensureSheetHeadersAppend_(sh, PARTNER_ACCESS_HEADERS_);
  }
  return sh;
}

function getPartnerOrdersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Partner_Orders");
  if (!sh) {
    sh = ss.insertSheet("Partner_Orders");
    sh.getRange(1, 1, 1, PARTNER_ORDER_HEADERS_.length).setValues([PARTNER_ORDER_HEADERS_]);
    sh.setFrozenRows(1);
  } else {
    ensureSheetHeadersAppend_(sh, PARTNER_ORDER_HEADERS_);
  }
  return sh;
}

function partnerDefaultSeedPack_() {
  return {
    networks: [
      { id: "net_varka", name: "Varka", logo: "assets/varka-logo.png" },
      { id: "net_nan", name: "NaN clinic", logo: "assets/partners/nan.png" },
      { id: "net_fundog", name: "Fundog", logo: "assets/partners/fundog.png" },
      { id: "net_firedog", name: "Firedog", logo: "assets/partners/firedog.png" },
      { id: "net_polotno", name: "Polotno", logo: "" },
      { id: "net_indixvost", name: "Indixvost", logo: "" },
      { id: "net_bobwow", name: "Bob Wow Collar", logo: "" }
    ],
    points: [
      { id: "pt_varka_repina_4", networkId: "net_varka", name: "Varka · Репина 4", address: "Репина 4" },
      { id: "pt_varka_avia_17", networkId: "net_varka", name: "Varka · Авиационная 17", address: "Авиационная 17" },
      { id: "pt_varka_karskogo_23", networkId: "net_varka", name: "Varka · Карского 23", address: "Карского 23" },
      { id: "pt_varka_golodeda_15", networkId: "net_varka", name: "Varka · Голодеда 15", address: "Голодеда 15" },
      { id: "pt_varka_rokoss_80", networkId: "net_varka", name: "Varka · Рокоссовского 80", address: "Рокоссовского 80" },
      { id: "pt_varka_rokoss_150b", networkId: "net_varka", name: "Varka · Рокоссовского 150Б", address: "Рокоссовского 150Б" },
      { id: "pt_varka_kazintsa_120", networkId: "net_varka", name: "Varka · Казинца 120", address: "Казинца 120" },
      { id: "pt_varka_matus_70", networkId: "net_varka", name: "Varka · Матусевича 70", address: "Матусевича 70" },
      { id: "pt_varka_tsvirko_100", networkId: "net_varka", name: "Varka · Цвирко 100", address: "Цвирко 100" },
      { id: "pt_varka_skrip_1", networkId: "net_varka", name: "Varka · Скрипникова 1", address: "Скрипникова 1" },
      { id: "pt_nan_1", networkId: "net_nan", name: "NaN · Янковского", address: "ул. Янковского, 34" },
      { id: "pt_fundog_1", networkId: "net_fundog", name: "Fundog · точка 1", address: "Минск" },
      { id: "pt_firedog_1", networkId: "net_firedog", name: "Firedog · точка 1", address: "Минск" },
      { id: "pt_polotno_1", networkId: "net_polotno", name: "Polotno · точка 1", address: "—" },
      { id: "pt_indix_1", networkId: "net_indixvost", name: "Indixvost · точка 1", address: "—" },
      { id: "pt_bob_1", networkId: "net_bobwow", name: "Bob Wow Collar · точка 1", address: "—" }
    ],
    // доступы партнёров — только через вкладку Партнёры в Бойне
    access: []
  };
}

/** Пустой = все active из Partner_Access (+ владельцы Бойни всегда). */
var PARTNER_MINIAPP_ALLOWLIST_ = [];

function partnerIsOnAllowlist_(username) {
  var u = partnerNormUser_(username);
  if (!PARTNER_MINIAPP_ALLOWLIST_ || !PARTNER_MINIAPP_ALLOWLIST_.length) return true;
  if (!u) return false;
  for (var i = 0; i < PARTNER_MINIAPP_ALLOWLIST_.length; i++) {
    if (partnerNormUser_(PARTNER_MINIAPP_ALLOWLIST_[i]) === u) return true;
  }
  return false;
}

function readPartnerNetworks_() {
  var sh = getPartnerNetworksSheet_();
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var id = String(data[r][0] || "").trim();
    if (!id) continue;
    out.push({
      rowIndex: r + 1,
      id: id,
      name: String(data[r][1] || "").trim(),
      logo: String(data[r][2] || "").trim(),
      active: String(data[r][3] || "yes").toLowerCase() !== "no",
      updatedAt: data[r][4]
    });
  }
  return out;
}

function readPartnerPoints_() {
  var sh = getPartnerPointsSheet_();
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var id = String(data[r][0] || "").trim();
    if (!id) continue;
    out.push({
      rowIndex: r + 1,
      id: id,
      networkId: String(data[r][1] || "").trim(),
      name: String(data[r][2] || "").trim(),
      address: String(data[r][3] || "").trim(),
      active: String(data[r][4] || "yes").toLowerCase() !== "no",
      updatedAt: data[r][5]
    });
  }
  return out;
}

function readPartnerAccessRows_() {
  var sh = getPartnerAccessSheet_();
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var id = String(data[r][0] || "").trim();
    if (!id) continue;
    out.push({
      rowIndex: r + 1,
      id: id,
      username: partnerNormUser_(data[r][1]),
      telegramId: String(data[r][2] || "").trim(),
      name: String(data[r][3] || "").trim(),
      networkId: String(data[r][4] || "").trim(),
      pointIds: partnerParsePointIds_(data[r][5]),
      role: String(data[r][6] || "partner").toLowerCase() || "partner",
      status: String(data[r][7] || "active").toLowerCase() || "active",
      updatedAt: data[r][8]
    });
  }
  return out;
}

function partnerMigrateProdV3_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("PARTNER_PROD_V3") === "1") return { migrated: false };
  var now = new Date();
  var netSh = getPartnerNetworksSheet_();
  var ptSh = getPartnerPointsSheet_();
  var acSh = getPartnerAccessSheet_();
  var nets = readPartnerNetworks_();
  var pts = readPartnerPoints_();
  var acc = readPartnerAccessRows_();
  var pack = partnerDefaultSeedPack_();
  var haveNet = {};
  nets.forEach(function (n) { haveNet[n.id] = n; });

  // выключить Varka + старые bowwow id
  nets.forEach(function (n) {
    var id = String(n.id || "");
    var kill = id === "net_varka" || id.indexOf("varka") >= 0 || id === "net_bowwow";
    if (!kill) return;
    try { netSh.getRange(n.rowIndex, 4).setValue("no"); } catch (e1) {}
  });
  pts.forEach(function (p) {
    var id = String(p.id || "");
    var nid = String(p.networkId || "");
    var kill = id.indexOf("varka") >= 0 || nid === "net_varka" || nid.indexOf("varka") >= 0 ||
      id === "pt_bow_1" || nid === "net_bowwow";
    if (!kill) return;
    try { ptSh.getRange(p.rowIndex, 5).setValue("no"); } catch (e2) {}
  });

  // переименовать/добавить сети из прод-пака
  pack.networks.forEach(function (n) {
    if (haveNet[n.id]) {
      try {
        netSh.getRange(haveNet[n.id].rowIndex, 2, 1, 3).setValues([[n.name, n.logo || "", "yes"]]);
      } catch (e3) {}
      return;
    }
    netSh.appendRow([n.id, n.name, n.logo || "", "yes", now]);
  });
  var havePt = {};
  readPartnerPoints_().forEach(function (p) { havePt[p.id] = p; });
  pack.points.forEach(function (p) {
    if (havePt[p.id]) {
      try {
        ptSh.getRange(havePt[p.id].rowIndex, 2, 1, 4).setValues([[p.networkId, p.name, p.address || "", "yes"]]);
      } catch (e4) {}
      return;
    }
    ptSh.appendRow([p.id, p.networkId, p.name, p.address || "", "yes", now]);
  });

  // убрать демо-доступы и varka_* (снизу вверх — индексы строк)
  var killAcc = acc.filter(function (a) {
    var u = String(a.username || "");
    return /_demo$/.test(u) || u.indexOf("varka") === 0 ||
      String(a.networkId || "").indexOf("varka") >= 0 ||
      String(a.networkId || "") === "net_bowwow";
  }).sort(function (a, b) { return b.rowIndex - a.rowIndex; });
  killAcc.forEach(function (a) {
    try { acSh.deleteRow(a.rowIndex); } catch (e5) {}
  });

  props.setProperty("PARTNER_PROD_V3", "1");
  return { migrated: true };
}

/** V4: вернуть сеть Varka + 10 адресов точек (после V3, где Varka гасилась). */
function partnerMigrateProdV4_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("PARTNER_PROD_V4") === "1") return { migrated: false };
  var now = new Date();
  var netSh = getPartnerNetworksSheet_();
  var ptSh = getPartnerPointsSheet_();
  var pack = partnerDefaultSeedPack_();
  var varkaNet = null;
  for (var i = 0; i < pack.networks.length; i++) {
    if (pack.networks[i].id === "net_varka") { varkaNet = pack.networks[i]; break; }
  }
  if (!varkaNet) {
    props.setProperty("PARTNER_PROD_V4", "1");
    return { migrated: false };
  }

  var nets = readPartnerNetworks_();
  var haveNet = {};
  nets.forEach(function (n) { haveNet[n.id] = n; });
  if (haveNet["net_varka"]) {
    try {
      netSh.getRange(haveNet["net_varka"].rowIndex, 2, 1, 3).setValues([[
        varkaNet.name, varkaNet.logo || "assets/varka-logo.png", "yes"
      ]]);
    } catch (e1) {}
  } else {
    netSh.appendRow([varkaNet.id, varkaNet.name, varkaNet.logo || "assets/varka-logo.png", "yes", now]);
  }

  // старые placeholder-точки Varka — выключить
  var pts = readPartnerPoints_();
  var newIds = {};
  pack.points.forEach(function (p) {
    if (p.networkId === "net_varka") newIds[p.id] = true;
  });
  pts.forEach(function (p) {
    if (String(p.networkId || "") !== "net_varka" && String(p.id || "").indexOf("varka") < 0) return;
    if (newIds[p.id]) return;
    try { ptSh.getRange(p.rowIndex, 5).setValue("no"); } catch (e2) {}
  });

  var havePt = {};
  readPartnerPoints_().forEach(function (p) { havePt[p.id] = p; });
  pack.points.forEach(function (p) {
    if (p.networkId !== "net_varka") return;
    if (havePt[p.id]) {
      try {
        ptSh.getRange(havePt[p.id].rowIndex, 2, 1, 4).setValues([[
          p.networkId, p.name, p.address || "", "yes"
        ]]);
      } catch (e3) {}
      return;
    }
    ptSh.appendRow([p.id, p.networkId, p.name, p.address || "", "yes", now]);
  });

  props.setProperty("PARTNER_PROD_V4", "1");
  return { migrated: true };
}

/** V5: доступ @one_more_person_228 к Firedog / Indixvost / 3 точки Varka; остальные партнёры — inactive. */
function partnerMigrateProdV5_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("PARTNER_PROD_V5") === "1") return { migrated: false };
  try { partnerMigrateProdV4_(); } catch (e4) {}
  var now = new Date();
  var acSh = getPartnerAccessSheet_();
  var uname = "one_more_person_228";
  var pointIds = [
    "pt_firedog_1",
    "pt_indix_1",
    "pt_varka_karskogo_23",
    "pt_varka_rokoss_150b",
    "pt_varka_tsvirko_100"
  ];
  var rows = readPartnerAccessRows_();
  // погасить прочих партнёров
  rows.forEach(function (a) {
    if (a.username === uname) return;
    try { acSh.getRange(a.rowIndex, 8).setValue("inactive"); } catch (e1) {}
  });
  var hit = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].username === uname) { hit = rows[i]; break; }
  }
  var vals = [
    hit ? hit.id : ("pa_" + uname),
    uname,
    hit ? hit.telegramId : "",
    "one_more_person_228",
    "net_varka",
    JSON.stringify(pointIds),
    "partner",
    "active",
    now
  ];
  if (hit) acSh.getRange(hit.rowIndex, 1, 1, PARTNER_ACCESS_HEADERS_.length).setValues([vals]);
  else acSh.appendRow(vals);

  props.setProperty("PARTNER_PROD_V5", "1");
  return { migrated: true };
}

/**
 * V6: снова зафиксировать 5 точек для @one_more_person_228 и сбросить
 * мусорный telegramId (тестовые вызовы могли записать «1»/«999»).
 * Реальный tid привяжется при входе по @username.
 */
function partnerMigrateProdV6_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("PARTNER_PROD_V6") === "1") return { migrated: false };
  try { partnerMigrateProdV5_(); } catch (e5) {}
  var now = new Date();
  var acSh = getPartnerAccessSheet_();
  var uname = "one_more_person_228";
  var pointIds = [
    "pt_firedog_1",
    "pt_indix_1",
    "pt_varka_karskogo_23",
    "pt_varka_rokoss_150b",
    "pt_varka_tsvirko_100"
  ];
  var rows = readPartnerAccessRows_();
  var hit = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].username === uname) { hit = rows[i]; break; }
  }
  var vals = [
    hit ? hit.id : ("pa_" + uname),
    uname,
    "", // сброс tid — привяжем при реальном входе
    "one_more_person_228",
    "net_varka",
    JSON.stringify(pointIds),
    "partner",
    "active",
    now
  ];
  if (hit) acSh.getRange(hit.rowIndex, 1, 1, PARTNER_ACCESS_HEADERS_.length).setValues([vals]);
  else acSh.appendRow(vals);

  props.setProperty("PARTNER_PROD_V6", "1");
  return { migrated: true, pointIds: pointIds };
}

/** V7: снять тестовый Partner_Access у @one_more_person_228 — он обычный owner Бойни. */
function partnerMigrateProdV7_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("PARTNER_PROD_V7") === "1") return { migrated: false };
  try { partnerMigrateProdV6_(); } catch (e6) {}
  var uname = "one_more_person_228";
  var acSh = getPartnerAccessSheet_();
  var rows = readPartnerAccessRows_();
  var n = 0;
  rows.forEach(function (a) {
    if (a.username !== uname) return;
    try {
      acSh.getRange(a.rowIndex, 8).setValue("inactive");
      acSh.getRange(a.rowIndex, 9).setValue(new Date());
      n++;
    } catch (e1) {}
  });
  props.setProperty("PARTNER_PROD_V7", "1");
  return { migrated: true, revoked: n };
}

function ensurePartnerAppSeeded_(force) {
  try { partnerMigrateProdV3_(); } catch (eMig) {}
  try { partnerMigrateProdV4_(); } catch (eMig4) {}
  try { partnerMigrateProdV5_(); } catch (eMig5) {}
  try { partnerMigrateProdV6_(); } catch (eMig6) {}
  try { partnerMigrateProdV7_(); } catch (eMig7) {}
  var nets = readPartnerNetworks_();
  var pts = readPartnerPoints_();
  // access может быть пустым в проде — не перезасеивать из‑за этого
  if (!force && nets.length && pts.length) {
    return { seeded: false, networks: nets.length, points: pts.length, access: readPartnerAccessRows_().length };
  }
  var pack = partnerDefaultSeedPack_();
  var now = new Date();
  var netSh = getPartnerNetworksSheet_();
  var ptSh = getPartnerPointsSheet_();
  var acSh = getPartnerAccessSheet_();
  if (force || !nets.length) {
    if (netSh.getLastRow() > 1) netSh.getRange(2, 1, netSh.getLastRow(), PARTNER_NET_HEADERS_.length).clearContent();
    var netRows = pack.networks.map(function (n) {
      return [n.id, n.name, n.logo || "", "yes", now];
    });
    if (netRows.length) netSh.getRange(2, 1, 1 + netRows.length, PARTNER_NET_HEADERS_.length).setValues(netRows);
  }
  if (force || !pts.length) {
    if (ptSh.getLastRow() > 1) ptSh.getRange(2, 1, ptSh.getLastRow(), PARTNER_POINT_HEADERS_.length).clearContent();
    var ptRows = pack.points.map(function (p) {
      return [p.id, p.networkId, p.name, p.address || "", "yes", now];
    });
    if (ptRows.length) ptSh.getRange(2, 1, 1 + ptRows.length, PARTNER_POINT_HEADERS_.length).setValues(ptRows);
  }
  if (force) {
    if (acSh.getLastRow() > 1) acSh.getRange(2, 1, acSh.getLastRow(), PARTNER_ACCESS_HEADERS_.length).clearContent();
    var acRows = (pack.access || []).map(function (a) {
      return [
        "pa_" + partnerNormUser_(a.username),
        partnerNormUser_(a.username),
        "",
        a.name || "",
        a.networkId || "",
        JSON.stringify(a.pointIds || []),
        "partner",
        "active",
        now
      ];
    });
    if (acRows.length) acSh.getRange(2, 1, 1 + acRows.length, PARTNER_ACCESS_HEADERS_.length).setValues(acRows);
  }
  return {
    seeded: true,
    networks: pack.networks.length,
    points: pack.points.length,
    access: (pack.access || []).length
  };
}

function partnerCatalogStatic_() {
  return [
    { id: "vr_t_heart", type: "treat", name: "Сердце", unit: "г", active: true },
    { id: "vr_t_lung", type: "treat", name: "Лёгкое", unit: "г", active: true },
    { id: "vr_c_piece", type: "coupon", name: "Купон", unit: "шт", active: true },
    { id: "vr_c_banner", type: "coupon", name: "Баннер", unit: "шт", active: true }
  ];
}

function partnerParseBasket_(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    var arr = JSON.parse(String(raw || "[]"));
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function partnerNotifyNewOrder_(order) {
  try {
    var rec = readPartnerNotifyRecipients_();
    if (!rec.length) return;
    var lines = (order.basket || []).map(function (b) {
      return "• " + (b.name || b.id) + " — " + b.qty + " " + (b.unit || "");
    }).join("\n");
    var text = "🛍 Заявка партнёра " + (order.id || "") + "\n" +
      (order.locationName || order.locationId || "") + "\n" +
      (order.userName || order.username || order.telegramId || "") + "\n" +
      lines;
    for (var i = 0; i < rec.length; i++) {
      try { telegramSendMarkup_(rec[i].telegramId, text, null); } catch (eN) {}
    }
  } catch (e) {}
}

function handlePartnerSubmitOrder(json, callback, fromPost) {
  try { ensurePartnerAppSeeded_(false); } catch (eSeed) {}
  var tid = String((json && json.telegramId) || "").trim();
  var username = partnerNormUser_((json && json.username) || "");
  if (!tid && !username) {
    var bad = { status: "error", message: "need_user" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var locationId = String((json && json.locationId) || "").trim();
  if (!locationId) {
    var badLoc = { status: "error", message: "need_location" };
    return fromPost ? jsonpText(callback, badLoc) : jsonp(callback, badLoc);
  }
  var basket = partnerParseBasket_(json && (json.basket || json.basketJson));
  basket = basket.filter(function (b) { return b && (Number(b.qty) || 0) > 0; });
  if (!basket.length) {
    var badB = { status: "error", message: "empty_basket" };
    return fromPost ? jsonpText(callback, badB) : jsonp(callback, badB);
  }

  var isOwner = false;
  try { isOwner = partnerRequireOwner_(tid); } catch (eO) { isOwner = false; }
  var allowed = false;
  var locationName = String((json && json.locationName) || "").trim();
  var networkId = String((json && json.networkId) || "").trim();
  // владелец Бойни — любая точка; партнёр/staff — только из Access
  if (isOwner) {
    allowed = true;
  } else {
    var rows = readPartnerAccessRows_();
    var hit = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].status || "") !== "active") continue;
      if (username && rows[i].username === username) { hit = rows[i]; break; }
    }
    if (!hit && tid) {
      for (var j = 0; j < rows.length; j++) {
        if (String(rows[j].status || "") !== "active") continue;
        if (rows[j].telegramId && String(rows[j].telegramId) === tid) { hit = rows[j]; break; }
      }
    }
    if (hit && (hit.pointIds || []).indexOf(locationId) >= 0) {
      allowed = true;
      if (!networkId) networkId = hit.networkId || "";
    }
  }
  if (!allowed) {
    var forbid = { status: "error", message: "forbidden_point" };
    return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
  }
  if (!locationName) {
    var pts = readPartnerPoints_();
    for (var p = 0; p < pts.length; p++) {
      if (pts[p].id === locationId) {
        locationName = pts[p].name;
        if (!networkId) networkId = pts[p].networkId;
        break;
      }
    }
  }
  var id = "po_" + Utilities.getUuid().replace(/-/g, "").slice(0, 12);
  var now = new Date();
  var dateIso = Utilities.formatDate(now, "Europe/Minsk", "yyyy-MM-dd");
  var order = {
    id: id,
    dateIso: dateIso,
    locationId: locationId,
    locationName: locationName,
    networkId: networkId,
    telegramId: tid,
    userName: String((json && json.userName) || "").trim(),
    username: username,
    basket: basket,
    status: "new",
    createdAt: now
  };
  getPartnerOrdersSheet_().appendRow([
    order.id,
    order.dateIso,
    order.locationId,
    order.locationName,
    order.networkId,
    order.telegramId,
    order.userName,
    order.username,
    JSON.stringify(order.basket),
    order.status,
    order.createdAt
  ]);
  try { partnerNotifyNewOrder_(order); } catch (eN2) {}
  var ok = { status: "success", order: order, id: id };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handlePartnerListMyOrders(json, callback, fromPost) {
  try { ensurePartnerAppSeeded_(false); } catch (eSeed) {}
  var tid = String((json && json.telegramId) || "").trim();
  var username = partnerNormUser_((json && json.username) || "");
  var isOwner = false;
  try { isOwner = partnerRequireOwner_(tid); } catch (eO) { isOwner = false; }
  var sh = getPartnerOrdersSheet_();
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var r = data.length - 1; r >= 1; r--) {
    var id = String(data[r][0] || "").trim();
    if (!id) continue;
    var rowTid = String(data[r][5] || "").trim();
    var rowUser = partnerNormUser_(data[r][7]);
    if (!isOwner) {
      if (tid && rowTid && rowTid !== tid) continue;
      if (!tid && username && rowUser !== username) continue;
      if (tid && !rowTid && username && rowUser !== username) continue;
    }
    var basket = partnerParseBasket_(data[r][8]);
    out.push({
      id: id,
      dateIso: String(data[r][1] || ""),
      locationId: String(data[r][2] || ""),
      locationName: String(data[r][3] || ""),
      networkId: String(data[r][4] || ""),
      telegramId: rowTid,
      userName: String(data[r][6] || ""),
      username: rowUser,
      basket: basket,
      status: String(data[r][9] || "new")
    });
    if (out.length >= 100) break;
  }
  var ok = { status: "success", orders: out };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/** Кому слать TG о заявках партнёров (Script Properties). */
var PARTNER_NOTIFY_PROP_ = "PARTNER_ORDER_NOTIFY_IDS";

function readPartnerNotifyRecipients_() {
  var out = [];
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(PARTNER_NOTIFY_PROP_) || "[]";
    var arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (typeof it === "string" || typeof it === "number") {
        var id0 = String(it || "").trim();
        if (id0) out.push({ telegramId: id0, name: "" });
        continue;
      }
      if (!it) continue;
      var id = String(it.telegramId || it.id || "").trim();
      if (!id) continue;
      out.push({
        telegramId: id,
        name: String(it.name || "").trim()
      });
    }
  } catch (e) {}
  return out;
}

function writePartnerNotifyRecipients_(list) {
  var clean = [];
  var seen = {};
  (list || []).forEach(function (it) {
    var id = String((it && (it.telegramId || it.id)) || it || "").trim();
    if (!id || seen[id]) return;
    seen[id] = true;
    clean.push({
      telegramId: id,
      name: String((it && it.name) || "").trim()
    });
  });
  PropertiesService.getScriptProperties().setProperty(PARTNER_NOTIFY_PROP_, JSON.stringify(clean));
  return clean;
}

/** Для будущих пушей заявок: список telegramId (+ owners fallback если пусто). */
function getPartnerOrderNotifyIds_() {
  var rec = readPartnerNotifyRecipients_();
  var ids = rec.map(function (r) { return r.telegramId; }).filter(Boolean);
  if (ids.length) return ids;
  try {
    var owners = getOwnerTelegramIds_();
    return owners || [];
  } catch (e) {
    return [];
  }
}

function listPartnerNotifyCandidates_() {
  var people = [];
  var seen = {};
  function pushPerson_(id, name, username, role) {
    id = String(id || "").trim();
    if (!id || seen[id]) return;
    seen[id] = true;
    people.push({
      telegramId: id,
      name: String(name || "").trim(),
      username: String(username || "").trim(),
      role: String(role || "").trim().toLowerCase()
    });
  }
  try {
    var rows = readAccessRows_();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var st = String(r.status || "").toLowerCase();
      var role = String(r.role || "").toLowerCase();
      if (st === "denied" || st === "pending") continue;
      if (role === "denied" || role === "pending" || role === "none") continue;
      if (!r.telegramId) continue;
      pushPerson_(r.telegramId, r.name, r.username, role);
    }
  } catch (eR) {}
  try {
    var owners = getOwnerTelegramIds_();
    for (var o = 0; o < owners.length; o++) {
      pushPerson_(owners[o], "", "", "owner");
    }
  } catch (eO) {}
  people.sort(function (a, b) {
    var an = (a.name || a.username || a.telegramId).toLowerCase();
    var bn = (b.name || b.username || b.telegramId).toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });
  return people;
}

function handlePartnerListAdmin(json, callback, fromPost) {
  var actor = String((json && json.telegramId) || "").trim();
  if (actor && !partnerRequireOwner_(actor)) {
    var forbid = { status: "error", message: "owner_only" };
    return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
  }
  try { ensurePartnerAppSeeded_(false); } catch (eSeed) {}
  var notifyRecipients = [];
  try { notifyRecipients = readPartnerNotifyRecipients_(); } catch (eN) {}
  var notifyCandidates = [];
  try { notifyCandidates = listPartnerNotifyCandidates_(); } catch (eC) {}
  var ok = {
    status: "success",
    networks: readPartnerNetworks_().map(function (n) {
      return { id: n.id, name: n.name, logo: n.logo, active: n.active };
    }),
    points: readPartnerPoints_().map(function (p) {
      return { id: p.id, networkId: p.networkId, name: p.name, address: p.address, active: p.active };
    }),
    access: readPartnerAccessRows_().map(function (a) {
      return {
        id: a.id,
        username: a.username,
        telegramId: a.telegramId,
        name: a.name,
        networkId: a.networkId,
        pointIds: a.pointIds,
        role: a.role,
        status: a.status
      };
    }),
    notifyRecipients: notifyRecipients,
    notifyCandidates: notifyCandidates,
    miniAppUrl: "https://konchaarsenia-a11y.github.io/superboyna/varka/",
    catalog: partnerCatalogStatic_()
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handlePartnerSetNotifyRecipients(json, callback, fromPost) {
  if (!partnerRequireOwner_(json && json.telegramId)) {
    var forbid = { status: "error", message: "owner_only" };
    return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
  }
  var raw = (json && json.recipients != null) ? json.recipients : "[]";
  var parsed = [];
  if (Array.isArray(raw)) {
    parsed = raw;
  } else {
    try { parsed = JSON.parse(String(raw || "[]")); } catch (e) { parsed = []; }
  }
  var cand = listPartnerNotifyCandidates_();
  var byId = {};
  cand.forEach(function (p) { byId[p.telegramId] = p; });
  var list = [];
  for (var i = 0; i < parsed.length; i++) {
    var it = parsed[i];
    var id = String((it && (it.telegramId || it.id)) || it || "").trim();
    if (!id) continue;
    var hit = byId[id];
    list.push({
      telegramId: id,
      name: (it && it.name) || (hit && (hit.name || hit.username)) || ""
    });
  }
  var saved = writePartnerNotifyRecipients_(list);
  var ok = { status: "success", notifyRecipients: saved, count: saved.length };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handlePartnerGetMe(json, callback, fromPost) {
  try { ensurePartnerAppSeeded_(false); } catch (eSeed) {}
  var username = partnerNormUser_((json && json.username) || "");
  var tid = String((json && json.telegramId) || "").trim();
  try {
    var iu = parseInitDataUser_((json && json.initData) || "");
    if (iu) {
      if (!username && iu.username) username = partnerNormUser_(iu.username);
      if (!tid && iu.id) tid = String(iu.id).trim();
    }
  } catch (eInit) {}

  var nets = readPartnerNetworks_().filter(function (n) {
    return n.active && n.id !== "net_bowwow";
  });
  var pts = readPartnerPoints_().filter(function (p) {
    return p.active && p.networkId !== "net_bowwow";
  });

  var isBoynaOwner = false;
  try { isBoynaOwner = partnerRequireOwner_(tid); } catch (eOwn) { isBoynaOwner = false; }

  // 1) Владелец Бойни — все точки (как было). @one_more_person_228 = обычный owner.
  if (tid && isBoynaOwner) {
    var allIds = pts.map(function (p) { return p.id; });
    var allowedAll = {};
    allIds.forEach(function (id) { allowedAll[id] = true; });
    var firstNet = (pts[0] && pts[0].networkId) || (nets[0] && nets[0].id) || "";
    var ownerOk = {
      status: "success",
      allowed: true,
      ownersOnly: false,
      role: "owner",
      isPartner: false,
      isOwner: true,
      name: "Владелец Good Boy",
      username: username,
      telegramId: tid,
      networkId: firstNet,
      pointIds: allIds,
      allowedPointIds: allowedAll,
      networks: nets.map(function (n) { return { id: n.id, name: n.name, logo: n.logo }; }),
      points: pts.map(function (p) {
        return { id: p.id, networkId: p.networkId, name: p.name, address: p.address };
      }),
      catalog: partnerCatalogStatic_()
    };
    return fromPost ? jsonpText(callback, ownerOk) : jsonp(callback, ownerOk);
  }

  // 2) Партнёр / сотрудник — только точки из Partner_Access
  var rows = readPartnerAccessRows_();
  var hit = null;
  if (username) {
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].status || "") !== "active") continue;
      if (rows[i].username === username) { hit = rows[i]; break; }
    }
  }
  if (!hit && tid) {
    for (var j = 0; j < rows.length; j++) {
      if (String(rows[j].status || "") !== "active") continue;
      if (rows[j].telegramId && String(rows[j].telegramId) === tid) { hit = rows[j]; break; }
    }
  }

  if (hit) {
    if (PARTNER_MINIAPP_ALLOWLIST_ && PARTNER_MINIAPP_ALLOWLIST_.length &&
        !partnerIsOnAllowlist_(hit.username) && !partnerIsOnAllowlist_(username)) {
      var denyHit = {
        status: "success",
        role: "none",
        allowed: false,
        message: "not_on_allowlist",
        networks: [],
        points: [],
        catalog: partnerCatalogStatic_()
      };
      return fromPost ? jsonpText(callback, denyHit) : jsonp(callback, denyHit);
    }
    if (tid && !hit.telegramId) {
      try {
        getPartnerAccessSheet_().getRange(hit.rowIndex, 3).setValue(tid);
        hit.telegramId = tid;
      } catch (eBind) {}
    }
    var allowedIds = (hit.pointIds || []).filter(function (id) {
      for (var k = 0; k < pts.length; k++) if (pts[k].id === id) return true;
      return false;
    });
    var allowed = {};
    allowedIds.forEach(function (id) { allowed[id] = true; });
    var myPts = pts.filter(function (p) { return !!allowed[p.id]; });
    var myNetsMap = {};
    myPts.forEach(function (p) { myNetsMap[p.networkId] = true; });
    var myNets = nets.filter(function (n) { return myNetsMap[n.id]; });
    var okPartner = {
      status: "success",
      allowed: allowedIds.length > 0,
      ownersOnly: false,
      role: hit.role || "partner",
      isPartner: true,
      isOwner: false,
      name: hit.name || username || tid,
      username: hit.username || username,
      telegramId: hit.telegramId || tid,
      networkId: hit.networkId || (myPts[0] && myPts[0].networkId) || "",
      pointIds: allowedIds,
      allowedPointIds: allowed,
      networks: myNets.map(function (n) { return { id: n.id, name: n.name, logo: n.logo }; }),
      points: myPts.map(function (p) {
        return { id: p.id, networkId: p.networkId, name: p.name, address: p.address };
      }),
      catalog: partnerCatalogStatic_()
    };
    return fromPost ? jsonpText(callback, okPartner) : jsonp(callback, okPartner);
  }

  var no = {
    status: "success",
    role: "none",
    allowed: false,
    ownersOnly: false,
    message: (!username && !tid) ? "need_username" : "no_partner_access",
    networks: [],
    points: [],
    catalog: partnerCatalogStatic_()
  };
  return fromPost ? jsonpText(callback, no) : jsonp(callback, no);
}

function handlePartnerSaveNetwork(json, callback, fromPost) {
  if (!partnerRequireOwner_(json && json.telegramId)) {
    var forbid = { status: "error", message: "owner_only" };
    return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
  }
  var name = String((json && json.name) || "").trim();
  if (!name) {
    var bad = { status: "error", message: "need_name" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var id = String((json && json.id) || "").trim() || ("net_" + Utilities.getUuid().slice(0, 8));
  var logo = String((json && json.logo) || "").trim();
  var active = (json && (json.active === false || json.active === "no" || json.active === 0 || json.active === "0")) ? "no" : "yes";
  var sh = getPartnerNetworksSheet_();
  var all = readPartnerNetworks_();
  var hit = null;
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === id) { hit = all[i]; break; }
  }
  var vals = [id, name, logo, active, new Date()];
  if (hit) sh.getRange(hit.rowIndex, 1, 1, PARTNER_NET_HEADERS_.length).setValues([vals]);
  else sh.appendRow(vals);
  var ok = { status: "success", id: id, name: name, active: active === "yes" };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handlePartnerSavePoint(json, callback, fromPost) {
  if (!partnerRequireOwner_(json && json.telegramId)) {
    var forbid = { status: "error", message: "owner_only" };
    return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
  }
  var name = String((json && json.name) || "").trim();
  var networkId = String((json && json.networkId) || "").trim();
  if (!name || !networkId) {
    var bad = { status: "error", message: "need_name_network" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var id = String((json && json.id) || "").trim() || ("pt_" + Utilities.getUuid().slice(0, 8));
  var address = String((json && json.address) || "").trim();
  var active = (json && (json.active === false || json.active === "no" || json.active === 0 || json.active === "0")) ? "no" : "yes";
  var sh = getPartnerPointsSheet_();
  var all = readPartnerPoints_();
  var hit = null;
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === id) { hit = all[i]; break; }
  }
  var vals = [id, networkId, name, address, active, new Date()];
  if (hit) sh.getRange(hit.rowIndex, 1, 1, PARTNER_POINT_HEADERS_.length).setValues([vals]);
  else sh.appendRow(vals);
  var ok = { status: "success", id: id, networkId: networkId, name: name, active: active === "yes" };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handlePartnerSaveAccess(json, callback, fromPost) {
  var actor = String((json && json.telegramId) || "").trim();
  var actorRole = String((json && json.actorRole) || "").toLowerCase();
  var isOwner = partnerRequireOwner_(actor);
  // партнёр из мини-аппа может выдать staff только на свои точки
  var allowPartnerStaff = !isOwner && actorRole === "partner";
  if (!isOwner && !allowPartnerStaff) {
    var forbid = { status: "error", message: "forbidden" };
    return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
  }
  try { ensurePartnerAppSeeded_(false); } catch (eSeed) {}
  var username = partnerNormUser_((json && json.username) || "");
  var targetTid = String((json && (json.targetTelegramId || json.staffTelegramId)) || "").trim();
  var name = String((json && json.name) || "").trim();
  var networkId = String((json && json.networkId) || "").trim();
  var pointIds = partnerParsePointIds_((json && json.pointIds) || "");
  var role = String((json && json.role) || "partner").toLowerCase() || "partner";
  var status = String((json && json.status) || "active").toLowerCase() || "active";
  if (allowPartnerStaff) {
    role = "staff";
    // ограничить точкуми актёра
    var meRows = readPartnerAccessRows_();
    var me = null;
    for (var m = 0; m < meRows.length; m++) {
      if (meRows[m].telegramId && meRows[m].telegramId === actor && meRows[m].status === "active") {
        me = meRows[m]; break;
      }
    }
    if (!me) {
      for (var m2 = 0; m2 < meRows.length; m2++) {
        if (meRows[m2].username && partnerNormUser_(json.actorUsername) === meRows[m2].username) {
          me = meRows[m2]; break;
        }
      }
    }
    if (!me) {
      var noMe = { status: "error", message: "partner_not_found" };
      return fromPost ? jsonpText(callback, noMe) : jsonp(callback, noMe);
    }
    networkId = me.networkId;
    var allowed = {};
    (me.pointIds || []).forEach(function (pid) { allowed[pid] = true; });
    pointIds = pointIds.filter(function (pid) { return !!allowed[pid]; });
    if (!pointIds.length) pointIds = (me.pointIds || []).slice();
  }
  if (!username && !targetTid) {
    var bad = { status: "error", message: "need_username_or_telegramId" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  if (!pointIds.length) {
    var badP = { status: "error", message: "need_points" };
    return fromPost ? jsonpText(callback, badP) : jsonp(callback, badP);
  }
  var id = String((json && json.id) || "").trim();
  if (!id) id = "pa_" + (username || targetTid || Utilities.getUuid().slice(0, 8));
  var sh = getPartnerAccessSheet_();
  var all = readPartnerAccessRows_();
  var hit = null;
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === id) { hit = all[i]; break; }
    if (username && all[i].username === username) { hit = all[i]; id = all[i].id; break; }
    if (targetTid && all[i].telegramId === targetTid && all[i].role === role) {
      hit = all[i]; id = all[i].id; break;
    }
  }
  var vals = [
    id,
    username,
    targetTid,
    name || username || targetTid,
    networkId,
    JSON.stringify(pointIds),
    role,
    status,
    new Date()
  ];
  if (hit) sh.getRange(hit.rowIndex, 1, 1, PARTNER_ACCESS_HEADERS_.length).setValues([vals]);
  else sh.appendRow(vals);
  var ok = { status: "success", id: id, username: username, telegramId: targetTid, pointIds: pointIds, role: role };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handlePartnerRevokeAccess(json, callback, fromPost) {
  if (!partnerRequireOwner_(json && json.telegramId)) {
    var forbid = { status: "error", message: "owner_only" };
    return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
  }
  var id = String((json && json.id) || "").trim();
  var username = partnerNormUser_((json && json.username) || "");
  var all = readPartnerAccessRows_();
  var hit = null;
  for (var i = 0; i < all.length; i++) {
    if (id && all[i].id === id) { hit = all[i]; break; }
    if (username && all[i].username === username) { hit = all[i]; break; }
  }
  if (!hit) {
    var bad = { status: "error", message: "not_found" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var sh = getPartnerAccessSheet_();
  sh.getRange(hit.rowIndex, 8).setValue("revoked");
  sh.getRange(hit.rowIndex, 9).setValue(new Date());
  var ok = { status: "success", id: hit.id, revoked: true };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handlePartnerSeedDefaults(json, callback, fromPost) {
  if (!partnerRequireOwner_(json && json.telegramId)) {
    var forbid = { status: "error", message: "owner_only" };
    return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
  }
  var force = !!(json && (json.force === "1" || json.force === true || json.force === 1));
  var r = ensurePartnerAppSeeded_(force);
  var ok = { status: "success", result: r };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/** Lifetime БП→ПП: затраты на БП и выручка ПП с перешедших. */
function collectBpLifetimeEconomics_(ss, crmSs) {
  var out = {
    converted: 0,
    nicks: [],
    bpDeliveries: 0,
    bpCost: 0,
    bpBasketCost: 0,
    bpDeliveryCost: 0,
    ppRevenue: 0,
    ppDeliveries: 0,
    profit: 0,
    costPerConvert: null
  };
  var conv = collectBpToPpConversions_(ss, crmSs, "", { allTime: true });
  out.converted = Number(conv.count) || 0;
  out.nicks = (conv.nicks || []).slice(0, 40);
  var convertKeys = {};
  var convertYmd = {};
  (conv.keys || []).forEach(function (k) { convertKeys[k] = true; });
  var ymap = conv.ymdByKey || {};
  for (var yk in ymap) {
    if (ymap.hasOwnProperty(yk)) convertYmd[yk] = String(ymap[yk] || "").slice(0, 10);
  }

  var rows = [];
  try { rows = readAllCalendarRows_(); } catch (e0) { rows = []; }
  var books = [];
  try { books = readAllBookings_(); } catch (eB) { books = []; }
  var tz = ss.getSpreadsheetTimeZone();
  var fee = BP_DELIVERY_COST_BYN_;

  function ingest_(row) {
    if (!row || String(row.status || "").toLowerCase() === "cancelled") return;
    var iso = String(row.dateIso || "").slice(0, 10);
    if (!iso || iso.length < 7) {
      var bd = parseFlexibleDate_(row.date, tz) || parseFlexibleDate_(row.dateIso, tz);
      if (bd) iso = Utilities.formatDate(bd, tz, "yyyy-MM-dd");
    }
    if (!iso) return;
    var ck = clientMatchKey_(row.client) || String(row.client || "").toUpperCase();
    var src = calendarSourceKind_(row);
    var bask = row.basket;
    if ((!bask || !bask.length) && row.basketJson) {
      try { bask = JSON.parse(String(row.basketJson)); } catch (e1) { bask = []; }
    }
    if (src === "bp") {
      var raw = estimateBasketRawCost_(bask, "bp");
      var withFee = Math.round((raw + fee) * 100) / 100;
      out.bpDeliveries++;
      out.bpBasketCost += raw;
      out.bpDeliveryCost += fee;
      out.bpCost += withFee;
    }
    if (src === "pp" && ck && convertKeys[ck]) {
      var cy = convertYmd[ck] || "";
      if (cy && iso < cy) return;
      var price = calendarRowPrice_(row);
      out.ppRevenue += price;
      out.ppDeliveries++;
    }
  }

  var seen = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var iso2 = String(r.dateIso || "").slice(0, 10);
    var ck2 = clientMatchKey_(r.client) || String(r.client || "").toUpperCase();
    var k2 = iso2 + "|" + ck2;
    seen[k2] = true;
    ingest_(r);
  }
  for (var bi = 0; bi < books.length; bi++) {
    var b = books[bi];
    var bIso = "";
    var bDate = parseFlexibleDate_(b.date, tz);
    if (bDate) bIso = Utilities.formatDate(bDate, tz, "yyyy-MM-dd");
    var bCk = clientMatchKey_(b.client) || String(b.client || "").toUpperCase();
    var bk = bIso + "|" + bCk;
    if (seen[bk]) continue;
    ingest_(b);
  }

  out.bpCost = Math.round(out.bpCost * 100) / 100;
  out.bpBasketCost = Math.round(out.bpBasketCost * 100) / 100;
  out.bpDeliveryCost = Math.round(out.bpDeliveryCost * 100) / 100;
  out.ppRevenue = Math.round(out.ppRevenue * 100) / 100;
  out.profit = Math.round((out.ppRevenue - out.bpCost) * 100) / 100;
  if (out.converted > 0) out.costPerConvert = Math.round((out.bpCost / out.converted) * 100) / 100;
  return out;
}

function collectPartnerStatsFromMonth_(monthCal) {
  var map = {};
  var rows = (monthCal && monthCal.partnerRows) || [];
  for (var i = 0; i < rows.length; i++) {
    var pr = rows[i];
    var name = String(pr.name || "").trim();
    if (!name || name.indexOf("без партн") >= 0) continue;
    if (!map[name]) map[name] = { name: name, deliveries: 0, revenue: 0, cost: 0, profit: 0 };
    map[name].deliveries += Number(pr.deliveries) || 0;
    map[name].revenue += Number(pr.revenue) || 0;
    map[name].cost += Number(pr.cost) || 0;
  }
  var list = [];
  for (var k in map) {
    if (!map.hasOwnProperty(k)) continue;
    var x = map[k];
    x.revenue = Math.round(x.revenue * 100) / 100;
    x.cost = Math.round(x.cost * 100) / 100;
    x.profit = Math.round((x.revenue - x.cost) * 100) / 100;
    list.push(x);
  }
  list.sort(function (a, b) { return (b.profit || 0) - (a.profit || 0); });
  return list;
}

function handleGetStats(json, callback, fromPost) {
  json = json || {};
  // ожидаемая прибыль по диапазону — тот же getStats (чтобы не зависеть от отдельного action на старом Deploy)
  var mode = String(json.mode || "").toLowerCase();
  var fromRaw = json.from || json.fromDate || json.dateFrom || "";
  var toRaw = json.to || json.toDate || json.dateTo || "";
  if (mode === "expected" || mode === "expect" || json.expected === "1" || json.expected === true || json.expected === 1) {
    return handleGetExpectedProfit({ from: fromRaw, to: toRaw }, callback, fromPost);
  }
  if (fromRaw && toRaw && mode === "range") {
    return handleGetExpectedProfit({ from: fromRaw, to: toRaw }, callback, fromPost);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var now = new Date();
  var monthKey = String(json.month || json.monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    monthKey = Utilities.formatDate(now, tz, "yyyy-MM");
  }
  var cacheKey = "STATS15:" + monthKey;
  try {
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached && !json.force && json.force !== "1") {
      var parsed = JSON.parse(cached);
      if (parsed && parsed.status === "success") {
        return fromPost ? jsonpText(callback, parsed) : jsonp(callback, parsed);
      }
    }
  } catch (eCache) {}

  var monthLabel = Utilities.formatDate(now, tz, "MMMM yyyy");
  try {
    var parts = monthKey.split("-");
    var dLab = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    monthLabel = Utilities.formatDate(dLab, tz, "MMMM yyyy");
  } catch (eLab) {}

  var pp = { clients: 0, dirty: 0, clean: 0, cost: 0, turnover: 0, colsUsed: {}, byKey: {} };
  var bp = { total: 0, bp1: 0, bp2: 0, final: 0 };
  var crm = null;
  try {
    crm = getCrmSpreadsheet_();
    pp = collectPpMoneyStats_(crm);
    bp = collectBpFunnelStats_(crm);
  } catch (eCrm) {}

  // факт месяца — только даты ≤ сегодня (будущие записи не в обороте)
  var month = collectMonthCalendarStats_(ss, monthKey, { onlyPast: true });
  var ppOut = collectPpActualOut_(ss, monthKey, pp, month);
  var conv = collectBpToPpConversions_(ss, crm, monthKey, pp);

  // —— Факт через приложение (календарь/брони, уже прошедшие даты) ——
  var retail = Number(month.retailRevenue) || 0;
  var partner = Number(month.partnerRevenue) || 0;
  var ppActual = Number(month.revenueBySource && month.revenueBySource.pp) || 0;
  if (!(ppActual > 0) && Number(ppOut.actual) > 0) ppActual = Number(ppOut.actual) || 0;
  var calTurnover = Math.round((ppActual + retail + partner) * 100) / 100;
  var bpSpend = Number(month.bpCost) || 0;
  var costActual = Number(month.costActual) || 0;
  var converted = Number(conv.count) || 0;
  // CAC месяца: себестоимость БП-доставок месяца / число переходов БП→ПП в этом месяце
  var cac = null;
  if (converted > 0) cac = Math.round((bpSpend / converted) * 100) / 100;
  var bpDeliv = Number(month.bpDeliveries) || 0;
  var profitFact = calTurnover; // прибыль = общий приход = оборот
  var cleanFact = Math.round((calTurnover - costActual) * 100) / 100;
  var byPartner = [];
  try { byPartner = collectPartnerStatsFromMonth_(month); } catch (eP) { byPartner = []; }
  var bpLife = {
    converted: 0, bpDeliveries: 0, bpCost: 0, bpBasketCost: 0, bpDeliveryCost: 0,
    ppRevenue: 0, ppDeliveries: 0, profit: 0, costPerConvert: null, nicks: []
  };
  try { bpLife = collectBpLifetimeEconomics_(ss, crm); } catch (eL) {}

  // —— Лист ПП отдельно (снимок состава подписок, не «факт месяца») ——
  var ppSheetTurnover = Number(pp.turnover != null ? pp.turnover : pp.dirty) || 0;
  var ppSheetCost = Number(pp.cost) || 0;
  var ppSheetClean = Number(pp.clean) || 0;
  var ppExpected = ppSheetTurnover;
  var ppGap = Math.round((ppExpected - ppActual) * 100) / 100;

  // снимок: факт приложения + отдельно снимок листа ПП
  try {
    upsertStatsMonthSnapshot_(ss, {
      monthKey: monthKey,
      ppClients: pp.clients,
      ppTurnover: ppSheetTurnover,
      ppCost: ppSheetCost,
      ppClean: ppSheetClean,
      calPpActual: ppActual,
      retail: retail,
      partner: partner,
      calTurnover: calTurnover,
      bpSpend: bpSpend,
      deliveries: month.deliveriesTotal,
      bpConverted: converted
    });
  } catch (eSnap) {}

  var history = [];
  try { history = readStatsMonthHistory_(ss, monthKey, 6); } catch (eHist) { history = []; }
  if (history.length && history[0].monthKey === monthKey) {
    history[0].ppClients = pp.clients;
    history[0].ppTurnover = ppSheetTurnover;
    history[0].ppCost = ppSheetCost;
    history[0].ppClean = ppSheetClean;
    history[0].calPpActual = ppActual;
    history[0].retail = retail;
    history[0].partner = partner;
    history[0].calTurnover = calTurnover;
    history[0].bpSpend = bpSpend;
    history[0].deliveries = month.deliveriesTotal;
    history[0].bpConverted = converted;
    history[0].fromCalendarOnly = false;
  }
  var prev = history.length > 1 ? history[1] : null;
  // сравнение месяцев — только факт приложения (не цифры листа ПП)
  var compare = {
    prevMonthKey: prev ? prev.monthKey : "",
    deliveries: statsDelta_(month.deliveriesTotal, prev ? prev.deliveries : 0),
    calTurnover: statsDelta_(calTurnover, prev ? prev.calTurnover : 0),
    retail: statsDelta_(retail, prev ? prev.retail : 0),
    partner: statsDelta_(partner, prev ? prev.partner : 0),
    ppActual: statsDelta_(ppActual, prev ? prev.calPpActual : 0),
    bpSpend: statsDelta_(bpSpend, prev ? prev.bpSpend : 0),
    bpConverted: statsDelta_(converted, prev ? prev.bpConverted : 0),
    ppClients: statsDelta_(pp.clients, prev ? prev.ppClients : 0)
  };

  var ok = {
    status: "success",
    title: "Месяц · " + monthLabel,
    period: "month",
    monthKey: monthKey,
    monthLabel: monthLabel,
    // факт через мини-апп
    fact: {
      deliveries: month.deliveriesTotal,
      bySource: month.bySource,
      revenueBySource: month.revenueBySource,
      costBySource: month.costBySource,
      revenue: calTurnover,
      cost: costActual,
      profit: profitFact,
      clean: cleanFact,
      productCost: Number(month.productCost) || 0,
      couponsCost: Number(month.couponsCost) || 0,
      couponsQty: Number(month.couponsQty) || 0,
      couponsOrders: Number(month.couponsOrders) || 0,
      retail: retail,
      partner: partner,
      ppRevenue: ppActual,
      ppBasketCost: Number(month.ppBasketCost) || 0,
      ppLightCost: Number(month.ppLightCost) || 0,
      ppDeliveryCost: Number(month.ppDeliveryCost) || 0,
      ppLightPeople: Number(month.ppLightPeople) || 0,
      ppDeliveries: Number(month.bySource && month.bySource.pp) || 0,
      ppLightFeeEach: PP_LIGHT_COST_BYN_,
      ppDeliveryFeeEach: PP_DELIVERY_COST_BYN_,
      bpCost: bpSpend,
      bpBasketCost: Number(month.bpBasketCost) || 0,
      bpDeliveryCost: Number(month.bpDeliveryCost) || 0,
      bpDeliveryFeeEach: BP_DELIVERY_COST_BYN_,
      bpDeliveries: month.bpDeliveries,
      missingPrice: month.missingPrice || 0,
      missingBasketCost: month.missingBasketCost || 0,
      byPartner: byPartner
    },
    byPartner: byPartner,
    pp: {
      clients: pp.clients,
      expected: ppExpected,
      turnover: ppSheetTurnover,
      actual: ppActual,
      gap: ppGap,
      dirty: ppExpected,
      clean: ppSheetClean,
      cost: ppSheetCost,
      colsUsed: pp.colsUsed || {},
      sheetOnly: true,
      actualDetail: {
        fromCalendar: ppActual,
        fromPriceTags: ppOut.fromPriceTags,
        fromPaidCycle: ppOut.fromPaidCycle,
        clientsCounted: ppOut.clientsCounted,
        clientsMissingPrice: ppOut.clientsMissingPrice,
        clientsDelivered: month.ppClientsDelivered
      }
    },
    bp: {
      total: bp.total,
      bp1: bp.bp1,
      bp2: bp.bp2,
      final: bp.final,
      deliveries: month.bpDeliveries,
      spend: bpSpend,
      basketCost: Number(month.bpBasketCost) || 0,
      deliveryCost: Number(month.bpDeliveryCost) || 0,
      deliveryFeeEach: BP_DELIVERY_COST_BYN_,
      convertedToPp: converted,
      costPerConvert: cac,
      costPerConvertFormula: "bpSpend / converted",
      convertNicks: (conv.nicks || []).slice(0, 30),
      convertFromLedger: Number(conv.fromLedger) || 0,
      convertFromStamp: Number(conv.fromWishes) || 0,
      // lifetime: все когда-либо перешедшие БП→ПП
      life: {
        converted: bpLife.converted,
        bpDeliveries: bpLife.bpDeliveries,
        bpCost: bpLife.bpCost,
        bpBasketCost: bpLife.bpBasketCost,
        bpDeliveryCost: bpLife.bpDeliveryCost,
        ppRevenue: bpLife.ppRevenue,
        ppDeliveries: bpLife.ppDeliveries,
        profit: bpLife.profit,
        costPerConvert: bpLife.costPerConvert,
        nicks: bpLife.nicks || []
      }
    },
    money: {
      ppExpected: ppExpected,
      ppTurnover: ppSheetTurnover,
      ppActual: ppActual,
      ppClean: ppSheetClean,
      ppCost: ppSheetCost,
      retail: retail,
      partner: partner,
      turnover: calTurnover,
      cost: costActual,
      sheetTurnover: ppSheetTurnover,
      bpSpend: bpSpend
    },
    month: {
      deliveries: month.deliveriesTotal,
      bySource: month.bySource,
      revenueBySource: month.revenueBySource,
      costBySource: month.costBySource,
      revenueActual: month.revenueActual,
      costActual: costActual,
      retailRevenue: retail,
      partnerRevenue: partner,
      ppSheetDirty: ppExpected,
      ppExpected: ppExpected,
      ppActual: ppActual,
      expected: ppExpected,
      actual: ppActual,
      delta: -ppGap,
      turnover: calTurnover
    },
    history: history,
    compare: compare,
    ppActive: pp.clients,
    bpFunnel: bp.total,
    deliveries: month.deliveriesTotal,
    revenue: calTurnover,
    charts: {
      bpStages: [
        { label: "БП1", value: bp.bp1 },
        { label: "БП2", value: bp.bp2 },
        { label: "Финал", value: bp.final }
      ],
      sources: [
        { label: "ПП", value: month.bySource.pp || 0 },
        { label: "Розница", value: month.bySource.retail || 0 },
        { label: "БП", value: month.bySource.bp || 0 },
        { label: "Партнёр", value: month.bySource.partner || 0 }
      ],
      ppFlow: [
        { label: "Оборот ПП (лист)", value: ppSheetTurnover },
        { label: "Вышло ПП (приложение)", value: ppActual }
      ],
      turnover: [
        { label: "ПП", value: ppActual },
        { label: "Розница", value: retail },
        { label: "Партнёр", value: partner }
      ],
      ppMoney: [
        { label: "Оборот листа", value: ppSheetTurnover },
        { label: "Себест листа", value: ppSheetCost },
        { label: "Выхлоп листа", value: ppSheetClean }
      ]
    },
    factCutoff: month.todayIso || "",
    note: "Прибыль = оборот. Чистое = оборот − затраты. ПП затраты = состав + свет 11р/чел + доставка 6р. БП = состав + 6р."
  };
  try {
    CacheService.getScriptCache().put(cacheKey, JSON.stringify(ok), 600);
  } catch (ePut) {}
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/** Ожидаемая прибыль/оборот по диапазону дат (включая будущие записи в календаре). */
function handleGetExpectedProfit(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var fromD = parseFlexibleDate_(json.from || json.fromDate || json.dateFrom, tz);
  var toD = parseFlexibleDate_(json.to || json.toDate || json.dateTo, tz);
  if (!fromD || !toD) {
    var bad = { status: "error", message: "Укажите даты «с» и «по»" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  if (fromD.getTime() > toD.getTime()) {
    var tmp = fromD; fromD = toD; toD = tmp;
  }
  var fromIso = Utilities.formatDate(fromD, tz, "yyyy-MM-dd");
  var toIso = Utilities.formatDate(toD, tz, "yyyy-MM-dd");
  var stats = collectMonthCalendarStats_(ss, "", { fromIso: fromIso, toIso: toIso, onlyPast: false });
  var retail = Number(stats.retailRevenue) || 0;
  var partner = Number(stats.partnerRevenue) || 0;
  var ppRev = Number(stats.revenueBySource && stats.revenueBySource.pp) || 0;
  var revenue = Math.round((ppRev + retail + partner) * 100) / 100;
  var cost = Number(stats.costActual) || 0;
  var profit = revenue; // прибыль = оборот
  var clean = Math.round((revenue - cost) * 100) / 100;
  var ok = {
    status: "success",
    from: fromIso,
    to: toIso,
    deliveries: stats.deliveriesTotal || 0,
    bySource: stats.bySource || {},
    revenue: revenue,
    cost: cost,
    profit: profit,
    clean: clean,
    productCost: Number(stats.productCost) || 0,
    couponsCost: Number(stats.couponsCost) || 0,
    retail: retail,
    partner: partner,
    ppRevenue: ppRev,
    ppBasketCost: Number(stats.ppBasketCost) || 0,
    ppLightCost: Number(stats.ppLightCost) || 0,
    ppDeliveryCost: Number(stats.ppDeliveryCost) || 0,
    ppLightPeople: Number(stats.ppLightPeople) || 0,
    ppDeliveries: Number(stats.bySource && stats.bySource.pp) || 0,
    ppLightFeeEach: PP_LIGHT_COST_BYN_,
    ppDeliveryFeeEach: PP_DELIVERY_COST_BYN_,
    bpCost: Number(stats.bpCost) || 0,
    bpDeliveries: Number(stats.bpDeliveries) || 0,
    missingPrice: stats.missingPrice || 0,
    missingBasketCost: stats.missingBasketCost || 0,
    note: "Прибыль = оборот. Чистое = оборот − себест. ПП = состав + свет 11р/чел + доставка 6р."
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleExportStats(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var now = new Date();
  var monthKey = String(json.month || json.monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    monthKey = Utilities.formatDate(now, tz, "yyyy-MM");
  }
  var pp = { clients: 0, dirty: 0, clean: 0, cost: 0, byKey: {} };
  var bp = { total: 0, bp1: 0, bp2: 0, final: 0 };
  var crm = null;
  try {
    crm = getCrmSpreadsheet_();
    pp = collectPpMoneyStats_(crm);
    bp = collectBpFunnelStats_(crm);
  } catch (eCrm) {}
  var month = collectMonthCalendarStats_(ss, monthKey);
  var ppOut = collectPpActualOut_(ss, monthKey, pp, month);
  var conv = collectBpToPpConversions_(ss, crm, monthKey, pp);
  var turnover = Math.round((ppOut.actual + month.retailRevenue + month.partnerRevenue) * 100) / 100;
  var cac = conv.count > 0 ? Math.round((month.bpCost / conv.count) * 100) / 100 : "";
  var lines = [];
  lines.push("# Месяц\t" + monthKey);
  lines.push("# ПП клиентов\t" + pp.clients);
  lines.push("# ПП оборот (факт лист)\t" + (pp.turnover != null ? pp.turnover : pp.dirty));
  lines.push("# ПП выхлоп\t" + pp.clean);
  lines.push("# ПП себест (общая→итоговая)\t" + pp.cost);
  lines.push("# ПП вышло (календарь)\t" + ppOut.actual);
  lines.push("# Розница\t" + month.retailRevenue);
  lines.push("# Партнёр\t" + month.partnerRevenue);
  lines.push("# Оборот календаря (ПП вышло+розн+парт)\t" + turnover);
  lines.push("# БП воронка\t" + bp.total + "\tБП1\t" + bp.bp1 + "\tБП2\t" + bp.bp2 + "\tФинал\t" + bp.final);
  lines.push("# БП доставок\t" + month.bpDeliveries + "\tзатраты себест\t" + month.bpCost);
  lines.push("# БП→ПП за месяц\t" + conv.count + "\tна одного\t" + cac);
  lines.push("# Доставок всего\t" + month.deliveriesTotal);
  lines.push("date\tclient\tsegment\tsource\tstatus\tprice\taddress\tnote");
  var rows = [];
  try { rows = readAllCalendarRows_(); } catch (e0) { rows = []; }
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var st = String(row.status || "").toLowerCase();
    if (st === "cancelled") continue;
    var iso = String(row.dateIso || "").slice(0, 10);
    if (!iso || iso.length < 7) {
      var bd = parseFlexibleDate_(row.date, tz) || parseFlexibleDate_(row.dateIso, tz);
      if (bd) iso = Utilities.formatDate(bd, tz, "yyyy-MM-dd");
    }
    if (!iso || iso.slice(0, 7) !== monthKey) continue;
    var price = parsePriceTagFromNote_(row.note);
    lines.push([
      iso,
      String(row.client || "").replace(/\t/g, " "),
      String(row.segment || "").replace(/\t/g, " "),
      String(row.source || "").replace(/\t/g, " "),
      String(row.status || ""),
      price,
      String(row.address || "").replace(/\t/g, " "),
      String(row.note || "").replace(/\t/g, " ").replace(/\n/g, " ")
    ].join("\t"));
  }
  var ok = {
    status: "success",
    format: json.format || "accountant",
    monthKey: monthKey,
    message: "TSV месяца " + monthKey,
    tsv: lines.join("\n")
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

var SURVEY_HEADERS_ = [
  "id", "nick", "stage", "kind", "dueDate", "sentAt",
  "status", "templateId", "answer", "note", "linkedSubId", "updatedAt"
];

function ensureSurveySheet_(crmSs) {
  var ss = crmSs || getCrmSpreadsheet_();
  var sh = findSheetByBaseName_(ss, "Опросник");
  if (!sh) {
    try { sh = ss.insertSheet("Опросник"); } catch (eIns) { sh = null; }
  }
  if (!sh) return null;
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(1, 1, 1, Math.max(lastCol, SURVEY_HEADERS_.length)).getValues()[0];
  var h0 = String(headers[0] || "").trim().toLowerCase();
  // migrate old nick/tag/sentAt/dueAt/note/status → new if first header is nick
  if (h0 === "nick" || h0 === "ник") {
    var old = sh.getDataRange().getValues();
    sh.clear();
    sh.getRange(1, 1, 1, SURVEY_HEADERS_.length).setValues([SURVEY_HEADERS_]);
    for (var r = 1; r < old.length; r++) {
      if (!String(old[r][0] || "").trim()) continue;
      var tag = String(old[r][1] || "").toUpperCase();
      var kind = /ФИНАЛ|ПП|FINAL/.test(tag) ? "final" : "bp2";
      var id = "sv_m" + String(r) + "_" + String(Date.now()).slice(-6);
      sh.appendRow([
        id,
        String(old[r][0] || "").trim(),
        tag || (kind === "final" ? "ФИНАЛ" : "БП2"),
        kind,
        String(old[r][3] || old[r][2] || "").trim(), // dueAt or sentAt
        String(old[r][2] || "").trim(),
        String(old[r][5] || "planned").trim() || "planned",
        kind === "final" ? "survey_final" : "survey_bp2",
        "",
        String(old[r][4] || "").trim(),
        "",
        new Date()
      ]);
    }
    return sh;
  }
  if (h0 !== "id") {
    sh.getRange(1, 1, 1, SURVEY_HEADERS_.length).setValues([SURVEY_HEADERS_]);
  } else if (sh.getLastColumn() < SURVEY_HEADERS_.length) {
    sh.getRange(1, 1, 1, SURVEY_HEADERS_.length).setValues([SURVEY_HEADERS_]);
  }
  return sh;
}

function writeSurveyRowCells_(sh, rowIndex, values) {
  if (!sh || rowIndex < 1 || !values || !values.length) return;
  try {
    sh.getRange(rowIndex, 1, rowIndex, Math.max(values.length, SURVEY_HEADERS_.length)).breakApart();
  } catch (e0) {}
  for (var c = 0; c < values.length; c++) {
    // col 5 (index 4) = dueDate — писать как Date в полдень, не строкой UTC
    if (c === 4) {
      writeSurveyDueCell_(sh, rowIndex, 5, values[c]);
      continue;
    }
    try { sh.getRange(rowIndex, c + 1).setValue(values[c]); } catch (e1) {}
  }
}

function newSurveyId_() {
  return "sv_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Europe/Minsk", "yyyyMMddHHmmss") +
    "_" + String(Math.floor(Math.random() * 1e5));
}

function surveyRowToObj_(row, rowIndex1) {
  var note = String(row[9] || "").trim();
  var resp = parseRespFromSurveyNote_(note);
  var seg = parseSurveySegFromNote_(note);
  var dueRaw = row[4];
  var dueYmd = surveyDueYmd_(dueRaw);
  return {
    id: String(row[0] || "").trim(),
    nick: String(row[1] || "").trim(),
    stage: String(row[2] || "").trim(),
    kind: String(row[3] || "").trim(),
    dueDate: dueYmd || String(dueRaw || "").trim(),
    sentAt: String(row[5] || "").trim(),
    status: String(row[6] || "").trim() || "planned",
    templateId: String(row[7] || "").trim(),
    answer: String(row[8] || "").trim(),
    note: note,
    linkedSubId: String(row[10] || "").trim(),
    updatedAt: row[11] || "",
    ownerTelegramId: resp.ownerTelegramId,
    ownerName: resp.ownerName,
    linkedSheet: seg,
    rowIndex: rowIndex1
  };
}

function parseSurveySegFromNote_(note) {
  var m = String(note || "").match(/\[SEG:([^\]]+)\]/i);
  return m ? String(m[1] || "").trim() : "";
}

function stampSurveySegIntoNote_(note, sheet) {
  var base = String(note || "").replace(/\[SEG:[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();
  var seg = String(sheet || "").trim();
  if (!seg) return base;
  var tag = "[SEG:" + seg + "]";
  return (base + (base ? " " : "") + tag).trim();
}

function isSurveyStageKeyword_(s) {
  return /^(БП1|БП2|БП|ПП|АФК|ФИНАЛ|FINAL|BP1|BP2|PLANNED|DUE|SENT|DONE|CANCELLED)$/i.test(String(s || "").trim());
}

function isSurveyMetaLine_(line) {
  var s = String(line || "").trim();
  if (!s) return true;
  if (isSurveyStageKeyword_(s)) return true;
  if (/^(станет|будет|опрос|финал|напомнить|про состав)/i.test(s)) return true;
  if (/станет\s*(БП|ПП|бп|пп)/i.test(s)) return true;
  if (/финальн/i.test(s)) return true;
  if (/^\d{1,2}\s*[-–]?\s*[еeо]\b/i.test(s)) return true; // 04-e, 15-ое
  if (/\d{1,2}[\.\/\-]\d{1,2}/.test(s)) return true;
  if (/\d{1,2}\s*-\s*(го|е|ье|ого)/i.test(s)) return true;
  if (/(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/i.test(s)) return true;
  return false;
}

function isLikelySurveyNickLine_(line) {
  var s = String(line || "").trim();
  if (!s || s.length < 2 || s.length > 48) return false;
  if (isSurveyMetaLine_(s)) return false;
  if (/^sv_/i.test(s)) return false;
  if (/^https?:/i.test(s)) return false;
  // ник / имя: буквы, цифры, ._ 
  if (!/[A-Za-zА-Яа-яЁё]/.test(s)) return false;
  if (/^[\d\s\.\-]+$/.test(s)) return false;
  return true;
}

function inferSurveyKindFromText_(text) {
  var t = String(text || "");
  if (/финал|станет\s*пп|станет\s*п\.?п|→\s*пп|\bpp\b|final/i.test(t)) return "final";
  return "bp2";
}

function cleanSurveyNickDisplay_(raw) {
  var s = String(raw || "").replace(/\r/g, "\n");
  var first = s.split("\n")[0] || "";
  first = first.replace(/^\s*@/, "").trim();
  if (isSurveyStageKeyword_(first) || isSurveyMetaLine_(first)) return "";
  return extractInstagramNick_(first) || displayClientNick_(first) || first;
}

/** Строка уже в каноне: 1 ник, kind bp2|final, status простой. */
function isCleanSurveyRowObj_(obj) {
  if (!obj) return false;
  var nick = String(obj.nick || "");
  if (!nick || /[\n\r|]/.test(nick)) return false;
  if (isSurveyStageKeyword_(nick)) return false;
  if (/[\n\r|]/.test(String(obj.kind || "")) || /[\n\r|]/.test(String(obj.stage || ""))) return false;
  if (/[\n\r|]/.test(String(obj.status || ""))) return false;
  var st = String(obj.status || "").toLowerCase();
  if (st && !/^(planned|due|sent|done|cancelled)$/.test(st)) return false;
  var kind = normalizeSurveyKind_(obj.kind);
  if (kind !== "bp2" && kind !== "final") return false;
  // id = чужой ник (сдвиг колонок): id не sv_ и похож на ник, а nick=БП2
  if (obj.id && !/^sv_/i.test(obj.id) && isLikelySurveyNickLine_(obj.id) && isSurveyStageKeyword_(nick)) return false;
  return true;
}

function extractPeopleFromSurveyBlob_(text) {
  var raw = String(text || "").replace(/\r/g, "\n").replace(/\|/g, "\n");
  var lines = raw.split("\n").map(function (x) { return String(x || "").trim(); }).filter(Boolean);
  var people = [];
  var cur = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (isLikelySurveyNickLine_(line) && !isSurveyMetaLine_(line)) {
      var nick = cleanSurveyNickDisplay_(line) || line;
      cur = { nick: nick, note: "", kindHint: "", dueHint: "" };
      people.push(cur);
      continue;
    }
    if (!cur) continue;
    cur.note = (cur.note ? cur.note + " " : "") + line;
    if (!cur.kindHint) cur.kindHint = inferSurveyKindFromText_(line);
  }
  return people;
}

/**
 * Чинит лист «Опросник»: было «куча людей в ячейке» / сдвиг колонок →
 * ровно 1 человек = 1 строка.
 */
function repairSurveySheetToCanonical_(crmSs) {
  var sh = ensureSurveySheet_(crmSs);
  if (!sh || sh.getLastRow() < 2) return { repaired: 0, kept: 0 };
  var data = sh.getDataRange().getValues();
  var collected = []; // {nick, kind, stage, dueDate, status, note, templateId, linkedSubId, owner...}
  var seen = {};

  function pushPerson_(p) {
    var nick = cleanSurveyNickDisplay_(p.nick);
    if (!nick || isSurveyStageKeyword_(nick)) return;
    var kind = normalizeSurveyKind_(p.kind || p.kindHint || "bp2");
    var key = (clientMatchKey_(nick) || nick.toUpperCase()) + "|" + kind;
    if (seen[key]) {
      // дополнить note/due если пусто
      var prev = seen[key];
      if (!prev.dueDate && p.dueDate) prev.dueDate = p.dueDate;
      if (p.note && String(prev.note || "").indexOf(p.note) < 0) {
        prev.note = (prev.note ? prev.note + " " : "") + p.note;
      }
      return;
    }
    var item = {
      id: /^sv_/i.test(String(p.id || "").trim()) ? String(p.id).trim() : "",
      nick: nick,
      kind: kind,
      stage: surveyStageForKind_(kind, p.stage),
      dueDate: String(p.dueDate || "").trim(),
      status: /^(planned|due|sent|done|cancelled)$/i.test(String(p.status || "")) ? String(p.status).toLowerCase() : "planned",
      note: String(p.note || "").trim(),
      templateId: p.templateId || surveyTemplateForKind_(kind),
      linkedSubId: String(p.linkedSubId || "").trim(),
      sentAt: String(p.sentAt || "").trim(),
      answer: String(p.answer || "").trim(),
      ownerTelegramId: p.ownerTelegramId || "",
      ownerName: p.ownerName || "",
      linkedSheet: p.linkedSheet || ""
    };
    if (item.ownerTelegramId) item.note = stampRespIntoSurveyNote_(item.note, item.ownerTelegramId, item.ownerName);
    if (item.linkedSheet) item.note = stampSurveySegIntoNote_(item.note, item.linkedSheet);
    seen[key] = item;
    collected.push(item);
  }

  for (var r = 1; r < data.length; r++) {
    var obj = surveyRowToObj_(data[r], r + 1);
    // Сдвиг: nick=БП2, id=человек
    if (isSurveyStageKeyword_(obj.nick) && obj.id && !/^sv_/i.test(obj.id) && isLikelySurveyNickLine_(obj.id)) {
      pushPerson_({
        nick: obj.id,
        kind: inferSurveyKindFromText_(obj.nick + " " + obj.stage + " " + obj.kind),
        stage: obj.nick,
        dueDate: obj.dueDate,
        status: /^(planned|due|sent|done|cancelled)$/i.test(obj.status) ? obj.status : "planned",
        note: [obj.stage, obj.kind, obj.note].filter(Boolean).join(" ")
      });
      continue;
    }
    if (isCleanSurveyRowObj_(obj)) {
      pushPerson_({
        id: obj.id,
        nick: cleanSurveyNickDisplay_(obj.nick) || obj.nick,
        kind: obj.kind,
        stage: obj.stage,
        dueDate: obj.dueDate,
        status: obj.status,
        note: obj.note,
        templateId: obj.templateId,
        linkedSubId: obj.linkedSubId,
        sentAt: obj.sentAt,
        answer: obj.answer,
        ownerTelegramId: obj.ownerTelegramId,
        ownerName: obj.ownerName,
        linkedSheet: obj.linkedSheet
      });
      continue;
    }
    // Грязная строка: вытащить всех из всех текстовых ячеек
    var blob = [obj.id, obj.nick, obj.stage, obj.kind, obj.dueDate, obj.sentAt, obj.status, obj.note]
      .map(function (x) { return String(x || ""); })
      .join("\n");
    var people = extractPeopleFromSurveyBlob_(blob);
    if (!people.length && obj.nick) {
      var n0 = cleanSurveyNickDisplay_(obj.nick);
      if (n0) people = [{ nick: n0, note: String(obj.nick).split("\n").slice(1).join(" "), kindHint: inferSurveyKindFromText_(obj.nick) }];
    }
    for (var p = 0; p < people.length; p++) {
      pushPerson_({
        nick: people[p].nick,
        kind: people[p].kindHint || inferSurveyKindFromText_(people[p].note),
        note: people[p].note,
        status: "planned"
      });
    }
  }

  // Только с валидной датой — но НЕ отбрасываем будущие/сегодняшние planned;
  // past-due planned тоже оставляем (менеджер должен видеть), иначе «обновил — стёрлось»
  var tzR = Session.getScriptTimeZone() || "Europe/Minsk";
  var todayR = Utilities.formatDate(new Date(), tzR, "yyyy-MM-dd");
  var kept = [];
  for (var c = 0; c < collected.length; c++) {
    var it0 = collected[c];
    var due0 = surveyDueYmd_(it0.dueDate);
    var st0 = String(it0.status || "planned").toLowerCase();
    // done/cancelled/sent — не пишем обратно при repair (это мусор/архив)
    if (st0 === "done" || st0 === "cancelled") continue;
    if (st0 === "sent" && String(it0.sentAt || "").trim()) continue;
    if (!due0) {
      // без даты — дать +4д, не выкидывать
      due0 = ymdPlusDays_("", 4);
    }
    it0.dueDate = due0;
    it0.status = (st0 === "due" || st0 === "planned") ? st0 : "planned";
    kept.push(it0);
  }
  collected = kept;

  // Перезапись листа
  var lastRow = sh.getLastRow();
  if (lastRow > 1) {
    try { sh.getRange(2, 1, lastRow, Math.max(SURVEY_HEADERS_.length, sh.getLastColumn())).clearContent(); } catch (eClr) {}
    try {
      // удалить лишние строки снизу, оставить шапку
      var maxRows = sh.getMaxRows();
      if (maxRows > 1 && lastRow > 1) sh.deleteRows(2, lastRow - 1);
    } catch (eDel) {}
  }
  sh.getRange(1, 1, 1, SURVEY_HEADERS_.length).setValues([SURVEY_HEADERS_]);
  for (var i = 0; i < collected.length; i++) {
    var it = collected[i];
    // сохраняем прежний sv_* — иначе каждый repair/listSurvey плодит новый id и путает кнопку «Отправлено»
    var keepId = /^sv_/i.test(String(it.id || "").trim()) ? String(it.id).trim() : newSurveyId_();
    sh.appendRow([
      keepId,
      it.nick,
      it.stage,
      it.kind,
      it.dueDate,
      it.sentAt || "",
      it.status,
      it.templateId,
      it.answer || "",
      it.note || "",
      it.linkedSubId || "",
      new Date()
    ]);
  }
  try { PropertiesService.getScriptProperties().setProperty("survey_sheet_repair_ver", "v7.11.09"); } catch (eP) {}
  try { clearCrmSheetCache_("Опросник"); } catch (eC) {}
  return { repaired: 1, kept: collected.length };
}

function ensureSurveySheetRepaired_(crmSs) {
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty("survey_sheet_repair_ver") === "v7.11.09") {
      // только структурная грязь — НЕ даты (иначе past-due и пустой parse → полная перезапись листа)
      var sh = ensureSurveySheet_(crmSs);
      if (!sh || sh.getLastRow() < 2) return;
      var sample = sh.getRange(2, 1, Math.min(sh.getLastRow(), 20), 7).getValues();
      var dirty = false;
      for (var i = 0; i < sample.length; i++) {
        var nick = String(sample[i][1] || "").trim();
        var id0 = String(sample[i][0] || "").trim();
        // пустые строки / хвост после clear — не грязь (иначе repair на каждый listSurvey → новые sv_*)
        if (!nick && !id0) continue;
        var kind = String(sample[i][3] || "");
        var st = String(sample[i][6] || "");
        if (/[\n\r|]/.test(nick) || /[\n\r|]/.test(kind) || /[\n\r|]/.test(st)) { dirty = true; break; }
        if (nick && (isSurveyStageKeyword_(nick) || isSurveyMetaLine_(nick))) { dirty = true; break; }
      }
      if (!dirty) return;
    }
  } catch (e0) {}
  repairSurveySheetToCanonical_(crmSs);
}

/** Перенести открытые опросники вместе с клиентом (БП→ПП и т.п.). */
function moveSurveysWithClient_(crmSs, nick, opts) {
  opts = opts || {};
  var sh = ensureSurveySheet_(crmSs);
  if (!sh || !nick || sh.getLastRow() < 2) return { moved: 0 };
  var toSheet = String(opts.toSheet || "").trim();
  var toNick = String(opts.toNick || nick).trim() || nick;
  var data = sh.getDataRange().getValues();
  var n = 0;
  for (var r = 1; r < data.length; r++) {
    var obj = surveyRowToObj_(data[r], r + 1);
    var nickCell = cleanSurveyNickDisplay_(obj.nick) || obj.nick;
    if (!nicksMatch_(nickCell, nick) && !nicksMatch_(obj.nick, nick)) continue;
    var st = String(obj.status || "").toLowerCase();
    if (st === "cancelled") continue;
    // обновить ник (если label сменился)
    if (toNick && toNick !== obj.nick) {
      sh.getRange(r + 1, 2).setValue(cleanSurveyNickDisplay_(toNick) || toNick);
    }
    var note = stampSurveySegIntoNote_(obj.note, toSheet || obj.linkedSheet);
    // БП → ПП: открытый bp2 остаётся; финальный помечаем этапом ПП
    if (/^ПП$/i.test(toSheet)) {
      if (normalizeSurveyKind_(obj.kind) === "final" || /финал/i.test(obj.stage)) {
        sh.getRange(r + 1, 3).setValue("ПП");
      } else {
        sh.getRange(r + 1, 3).setValue(obj.stage || "БП2");
      }
      note = stampSurveySegIntoNote_(note, "ПП");
    } else if (/^БП$/i.test(toSheet)) {
      note = stampSurveySegIntoNote_(note, "БП");
    } else if (/^АФК$/i.test(toSheet)) {
      note = stampSurveySegIntoNote_(note, "АФК");
    }
    sh.getRange(r + 1, 10).setValue(note);
    sh.getRange(r + 1, 12).setValue(new Date());
    n++;
  }
  try { clearCrmSheetCache_("Опросник"); } catch (eC) {}
  return { moved: n };
}

/** Алиасы ника для матча опросников/БП при переносе (неделя ↔ CRM label ↔ @handle). */
function collectSurveyNickAliases_(crmSs, nick, opts) {
  opts = opts || {};
  var alts = [];
  function add_(x) {
    x = String(x || "").trim();
    if (!x) return;
    if (alts.indexOf(x) < 0) alts.push(x);
    try {
      var ig = extractInstagramNick_(x);
      if (ig && alts.indexOf(ig) < 0) alts.push(ig);
      var disp = displayClientNick_(x);
      if (disp && alts.indexOf(disp) < 0) alts.push(disp);
      var cleaned = cleanSurveyNickDisplay_(x);
      if (cleaned && alts.indexOf(cleaned) < 0) alts.push(cleaned);
    } catch (eA) {}
  }
  add_(nick);
  add_(opts.matchKey || "");
  if (!crmSs) return alts;
  try {
    var bp = findSheetByBaseName_(crmSs, "БП");
    if (bp) {
      var idxs = findAllSubscriptionRowIndexes_(bp, nick, opts.subId || "");
      if (!idxs.length && opts.matchKey) {
        var dataBp = bp.getDataRange().getValues();
        var wantKey = String(opts.matchKey || "").trim();
        for (var r = 1; r < dataBp.length; r++) {
          var cell = String(dataBp[r][0] || "").trim();
          if (!cell) continue;
          if (wantKey && clientMatchKey_(cell) === wantKey) idxs.push(r);
        }
      }
      for (var i = 0; i < idxs.length; i++) {
        add_(bp.getRange(idxs[i] + 1, 1).getValue());
      }
    }
  } catch (eBp) {}
  try {
    var contacts = findSheetByBaseName_(crmSs, "Контакты");
    if (contacts && contacts.getLastRow() >= 2) {
      var cd = contacts.getDataRange().getValues();
      for (var c = 1; c < cd.length; c++) {
        var cn = String(cd[c][0] || "").trim();
        if (!cn) continue;
        for (var a = 0; a < alts.length; a++) {
          if (nicksMatch_(cn, alts[a]) || (opts.matchKey && clientMatchKey_(cn) === String(opts.matchKey))) {
            add_(cn);
            break;
          }
        }
      }
    }
  } catch (eC) {}
  return alts;
}

function surveyNickMatchesAliases_(nickCell, rawNick, aliases, matchKey) {
  var cell = String(nickCell || "").trim();
  var raw = String(rawNick || "").trim();
  var mk = String(matchKey || "").trim();
  if (mk) {
    if (cell && clientMatchKey_(cell) === mk) return true;
    if (raw && clientMatchKey_(raw) === mk) return true;
  }
  for (var a = 0; a < (aliases || []).length; a++) {
    var alt = aliases[a];
    if (!alt) continue;
    if (nicksMatch_(cell, alt) || nicksMatch_(raw, alt)) return true;
    if (cell && clientMatchKey_(cell) && clientMatchKey_(cell) === clientMatchKey_(alt)) return true;
    if (raw && clientMatchKey_(raw) && clientMatchKey_(raw) === clientMatchKey_(alt)) return true;
  }
  return false;
}

/**
 * При переносе даты доставки сдвинуть dueDate открытых опросников на тот же Δ дней.
 * Отправленные/отменённые не трогаем. Также двигает [ОПРОС_БП2/ФИНАЛ] в карточке БП.
 */
function shiftOpenSurveysOnDeliveryMove_(crmSs, nick, oldDate, newDate, opts) {
  opts = opts || {};
  var out = { shifted: 0, deltaDays: 0, bpMeta: 0, items: [], sheets: 0 };
  nick = String(nick || "").trim();
  if (!crmSs || !nick || !oldDate || !newDate) return out;
  var tz = Session.getScriptTimeZone() || "Europe/Minsk";
  try {
    var act = SpreadsheetApp.getActiveSpreadsheet();
    if (act) tz = act.getSpreadsheetTimeZone() || tz;
  } catch (eTz) {}
  try {
    if (crmSs.getSpreadsheetTimeZone) tz = crmSs.getSpreadsheetTimeZone() || tz;
  } catch (eTz2) {}
  var oldD = oldDate instanceof Date ? oldDate : parseFlexibleDate_(oldDate, tz);
  var newD = newDate instanceof Date ? newDate : parseFlexibleDate_(newDate, tz);
  if (!oldD || !newD || isNaN(oldD.getTime()) || isNaN(newD.getTime())) return out;
  var deltaDays = Math.round((dateKeyMidnightMs_(newD, tz) - dateKeyMidnightMs_(oldD, tz)) / 86400000);
  out.deltaDays = deltaDays;
  if (!deltaDays) return out;

  var nickAlts = collectSurveyNickAliases_(crmSs, nick, opts);
  var matchKey = String(opts.matchKey || "").trim() || clientMatchKey_(nick) || "";
  var closedRe = /^(sent|done|cancelled|canceled|answered|completed|closed)$/i;
  var sheets = [];
  try {
    sheets = listCrmSheetCandidates_(crmSs, "Опросник");
  } catch (eList) { sheets = []; }
  if (!sheets.length) {
    try {
      var one = ensureSurveySheet_(crmSs);
      if (one) sheets = [one];
    } catch (eOne) {}
  }
  out.sheets = sheets.length;
  for (var si = 0; si < sheets.length; si++) {
    var sh = sheets[si];
    if (!sh || sh.getLastRow() < 2) continue;
    var data = sh.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      var obj = surveyRowToObj_(data[r], r + 1);
      var nickCell = cleanSurveyNickDisplay_(obj.nick) || obj.nick;
      if (!surveyNickMatchesAliases_(nickCell, obj.nick, nickAlts, matchKey)) continue;
      var st = String(obj.status || "planned").trim().split(/\n/)[0].trim() || "planned";
      if (closedRe.test(st)) continue;
      var dueYmd = surveyDueYmd_(obj.dueDate);
      var newDue = "";
      if (dueYmd) {
        newDue = ymdPlusDays_(dueYmd, deltaDays, tz);
      } else {
        // нет due — канон: новая доставка + 4 дня
        newDue = ymdPlusDays_(Utilities.formatDate(newD, tz, "yyyy-MM-dd"), 4, tz);
      }
      if (!newDue || newDue === dueYmd) continue;
      writeSurveyDueCell_(sh, r + 1, 5, newDue);
      try { sh.getRange(r + 1, 12).setValue(new Date()); } catch (eUp) {}
      out.shifted++;
      out.items.push({ id: obj.id || "", nick: nickCell, from: dueYmd || "", to: newDue, kind: obj.kind || "" });
    }
  }
  if (out.shifted) {
    try { clearCrmSheetCache_("Опросник"); } catch (eC) {}
  }

  try {
    var seenBp = {};
    for (var bi = 0; bi < nickAlts.length; bi++) {
      var bn = nickAlts[bi];
      if (!bn || seenBp[bn]) continue;
      seenBp[bn] = true;
      out.bpMeta += shiftBpSurveyMetaDates_(crmSs, bn, deltaDays) || 0;
    }
    if (matchKey) {
      out.bpMeta += shiftBpSurveyMetaDatesByMatchKey_(crmSs, matchKey, deltaDays) || 0;
    }
  } catch (eBp) {}
  return out;
}

/** Сдвиг meta БП по clientMatchKey_ (когда ник на неделе ≠ label в БП). */
function shiftBpSurveyMetaDatesByMatchKey_(crmSs, matchKey, deltaDays) {
  matchKey = String(matchKey || "").trim();
  deltaDays = Number(deltaDays) || 0;
  if (!crmSs || !matchKey || !deltaDays) return 0;
  var bp = findSheetByBaseName_(crmSs, "БП");
  if (!bp || bp.getLastRow() < 2) return 0;
  var data = bp.getDataRange().getValues();
  var n = 0;
  for (var r = 1; r < data.length; r++) {
    var cell = String(data[r][0] || "").trim();
    if (!cell) continue;
    if (/^себестоим/i.test(cell) || /^стоимость\s*100/i.test(cell)) continue;
    if (clientMatchKey_(cell) !== matchKey) continue;
    var wishes = String(data[r][4] || "");
    var meta = parseBpMetaFromWishes_(wishes);
    var next = {};
    var changed = false;
    if (meta.surveyBp2Due) {
      next.surveyBp2Due = ymdPlusDays_(meta.surveyBp2Due, deltaDays);
      changed = true;
    }
    if (meta.surveyFinalDue) {
      next.surveyFinalDue = ymdPlusDays_(meta.surveyFinalDue, deltaDays);
      changed = true;
    }
    if (!changed) continue;
    bp.getRange(r + 1, 5).setValue(stampBpMetaIntoWishes_(wishes, next));
    n++;
  }
  if (n) {
    try { clearCrmSheetCache_("БП"); } catch (eC) {}
  }
  return n;
}

function dateKeyMidnightMs_(d, tz) {
  var ymd = Utilities.formatDate(d, tz || Session.getScriptTimeZone() || "Europe/Minsk", "yyyy-MM-dd");
  var p = String(ymd).split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0).getTime();
}

/** Сдвинуть теги [ОПРОС_БП2]/ОПРОС_ФИНАЛ] в wishes карточки БП. */
function shiftBpSurveyMetaDates_(crmSs, nick, deltaDays) {
  nick = String(nick || "").trim();
  deltaDays = Number(deltaDays) || 0;
  if (!crmSs || !nick || !deltaDays) return 0;
  var bp = findSheetByBaseName_(crmSs, "БП");
  if (!bp) return 0;
  var rowIdx = -1;
  try { rowIdx = findSubscriptionRowIndex_(bp, nick, ""); } catch (eF) { rowIdx = -1; }
  if (rowIdx < 0) return 0;
  var wishes = String(bp.getRange(rowIdx + 1, 5).getValue() || "");
  var meta = parseBpMetaFromWishes_(wishes);
  var next = {};
  var changed = false;
  if (meta.surveyBp2Due) {
    next.surveyBp2Due = ymdPlusDays_(meta.surveyBp2Due, deltaDays);
    changed = true;
  }
  if (meta.surveyFinalDue) {
    next.surveyFinalDue = ymdPlusDays_(meta.surveyFinalDue, deltaDays);
    changed = true;
  }
  if (!changed) return 0;
  bp.getRange(rowIdx + 1, 5).setValue(stampBpMetaIntoWishes_(wishes, next));
  try { clearCrmSheetCache_("БП"); } catch (eC) {}
  return 1;
}

function handleRepairSurveys(json, callback, fromPost) {
  try {
    PropertiesService.getScriptProperties().deleteProperty("survey_sheet_repair_ver");
    var res = repairSurveySheetToCanonical_();
    var ok = { status: "success", message: "surveys_repaired", count: res.kept || 0 };
    return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
  } catch (e) {
    var bad = { status: "error", message: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
}

function normalizeSurveyKind_(k) {
  var s = String(k || "").trim().toLowerCase();
  if (s === "final" || s === "survey_final" || /финал|пп|final/.test(s)) return "final";
  return "bp2";
}

function surveyStageForKind_(kind, stageHint) {
  var st = String(stageHint || "").trim();
  if (st) return st;
  return kind === "final" ? "ФИНАЛ" : "БП2";
}

function surveyTemplateForKind_(kind) {
  return kind === "final" ? "survey_final" : "survey_bp2";
}

/** Upsert open (planned/due) survey for nick+kind; updates dueDate/stage/meta.
 * Не плодит новый due, если этот nick+kind(+due) уже sent/done — иначе тик из meta БП
 * снова создаёт опросник после «Отправлено».
 */
function upsertOpenSurvey_(crmSs, opts) {
  opts = opts || {};
  var sh = ensureSurveySheet_(crmSs);
  if (!sh) return null;
  var nick = String(opts.nick || "").trim();
  if (!nick) return null;
  var kind = normalizeSurveyKind_(opts.kind);
  var dueDate = String(opts.dueDate || "").trim();
  var dueWant = surveyDueYmd_(dueDate) || "";
  var stage = surveyStageForKind_(kind, opts.stage);
  var status = String(opts.status || "planned").trim() || "planned";
  var templateId = String(opts.templateId || surveyTemplateForKind_(kind)).trim();
  var note = String(opts.note || "").trim();
  var ownerTelegramId = String(opts.ownerTelegramId || opts.respTelegramId || "").trim();
  var ownerName = String(opts.ownerName || opts.respName || "").trim();
  if (ownerTelegramId) note = stampRespIntoSurveyNote_(note, ownerTelegramId, ownerName);
  var linkedSheet = String(opts.linkedSheet || opts.sheet || opts.segment || "").trim();
  if (linkedSheet) note = stampSurveySegIntoNote_(note, linkedSheet);
  var linkedSubId = String(opts.linkedSubId || opts.subId || "").trim();
  var sentAt = String(opts.sentAt || "").trim();
  var answer = String(opts.answer || "").trim();
  var forceNew = opts.forceNew === true || opts.forceNew === "1" || opts.forceNew === 1;
  // forceDue: явно задать due (ensureBp / sync). Без флага — не откатывать due назад (тик из старой meta).
  var forceDue = opts.forceDue === true || opts.forceDue === "1" || opts.forceDue === 1 ||
    opts.forceDueDate === true || opts.forceDueDate === "1";
  var data = sh.getDataRange().getValues();
  var openRe = /^(planned|due)$/i;
  var closedRe = /^(sent|done|cancelled|canceled|answered|completed|closed)$/i;
  var closedSame = null;
  var nickAlts = collectSurveyNickAliases_(crmSs, nick, {
    matchKey: opts.matchKey || clientMatchKey_(nick) || "",
    subId: linkedSubId || opts.subId || ""
  });
  var matchKeyUp = String(opts.matchKey || "").trim() || clientMatchKey_(nick) || "";
  for (var r = 1; r < data.length; r++) {
    if (!surveyNickMatchesAliases_(cleanSurveyNickDisplay_(data[r][1]) || data[r][1], data[r][1], nickAlts, matchKeyUp)) continue;
    if (normalizeSurveyKind_(data[r][3]) !== kind) continue;
    var st0 = String(data[r][6] || "planned").trim().split(/\n/)[0].trim() || "planned";
    var due0 = surveyDueYmd_(data[r][4]) || "";
    // Prefer updating open planned/due
    if (openRe.test(st0)) {
      if (dueDate) {
        var wantDue = surveyDueYmd_(dueDate) || "";
        var shouldWriteDue = forceDue || !due0 || !wantDue || wantDue >= due0;
        if (shouldWriteDue) writeSurveyDueCell_(sh, r + 1, 5, dueDate);
      }
      if (stage) sh.getRange(r + 1, 3).setValue(stage);
      if (opts.status) sh.getRange(r + 1, 7).setValue(status);
      if (sentAt) sh.getRange(r + 1, 6).setValue(sentAt);
      if (templateId) sh.getRange(r + 1, 8).setValue(templateId);
      if (answer) sh.getRange(r + 1, 9).setValue(answer);
      if (note || ownerTelegramId) sh.getRange(r + 1, 10).setValue(note);
      if (linkedSubId) sh.getRange(r + 1, 11).setValue(linkedSubId);
      sh.getRange(r + 1, 12).setValue(new Date());
      try { sh.getRange(r + 1, 1, r + 1, SURVEY_HEADERS_.length).breakApart(); } catch (eBr2) {}
      var row = sh.getRange(r + 1, 1, r + 1, SURVEY_HEADERS_.length).getValues()[0];
      return surveyRowToObj_(row, r + 1);
    }
    if (closedRe.test(st0)) {
      // тот же due или due не задан у закрытого — считаем «уже отработан»
      if (!dueWant || !due0 || due0 === dueWant) closedSame = surveyRowToObj_(data[r], r + 1);
    }
  }
  if (closedSame && !forceNew) {
    return closedSame;
  }
  var id = newSurveyId_();
  dueDate = surveyDueYmd_(dueDate) || dueDate || ymdPlusDays_("", 4);
  sh.appendRow([
    id, nick, stage, kind, "", sentAt,
    status, templateId, answer, note, linkedSubId, new Date()
  ]);
  var last = sh.getLastRow();
  writeSurveyRowCells_(sh, last, [
    id, nick, stage, kind, dueDate, sentAt,
    status, templateId, answer, note, linkedSubId, new Date()
  ]);
  writeSurveyDueCell_(sh, last, 5, dueDate);
  var row2 = sh.getRange(last, 1, last, SURVEY_HEADERS_.length).getValues()[0];
  return surveyRowToObj_(row2, last);
}

/**
 * После sent/done/cancelled убрать due из meta БП, иначе тик каждые 30 мин
 * снова upsert'ит опросник из [ОПРОС_БП2:…] / [ОПРОС_ФИНАЛ:…].
 */
function clearBpSurveyMetaAfterClose_(crmSs, nick, kind) {
  nick = String(nick || "").trim();
  if (!crmSs || !nick) return 0;
  kind = normalizeSurveyKind_(kind);
  var bp = findSheetByBaseName_(crmSs, "БП");
  if (!bp) return 0;
  var nicks = [nick];
  try {
    var shortN = extractInstagramNick_(nick) || displayClientNick_(nick) || "";
    if (shortN && nicks.indexOf(shortN) < 0) nicks.push(shortN);
  } catch (eN) {}
  var n = 0;
  for (var i = 0; i < nicks.length; i++) {
    var rowIdx = -1;
    try { rowIdx = findSubscriptionRowIndex_(bp, nicks[i], ""); } catch (eF) { rowIdx = -1; }
    if (rowIdx < 0) continue;
    var wishes = String(bp.getRange(rowIdx + 1, 5).getValue() || "");
    var meta = parseBpMetaFromWishes_(wishes);
    var next = {};
    var changed = false;
    if (kind === "final") {
      if (meta.surveyFinalDue) { next.surveyFinalDue = ""; changed = true; }
    } else {
      if (meta.surveyBp2Due) { next.surveyBp2Due = ""; changed = true; }
    }
    if (!changed) continue;
    bp.getRange(rowIdx + 1, 5).setValue(stampBpMetaIntoWishes_(wishes, next));
    n++;
  }
  if (n) {
    try { clearCrmSheetCache_("БП"); } catch (eC) {}
  }
  return n;
}

/** Закрыть лишние planned/due того же nick+kind (кроме keepId) — хвосты после ре-upsert тика. */
function cancelOpenSurveyDuplicatesExceptId_(sh, nick, kind, keepId) {
  if (!sh || sh.getLastRow() < 2) return 0;
  nick = String(nick || "").trim();
  keepId = String(keepId || "").trim();
  kind = normalizeSurveyKind_(kind);
  if (!nick) return 0;
  var data = sh.getDataRange().getValues();
  var openRe = /^(planned|due)$/i;
  var n = 0;
  for (var r = 1; r < data.length; r++) {
    var id0 = String(data[r][0] || "").trim();
    if (keepId && id0 === keepId) continue;
    if (!nicksMatch_(data[r][1], nick)) continue;
    if (normalizeSurveyKind_(data[r][3]) !== kind) continue;
    var st0 = String(data[r][6] || "planned").trim() || "planned";
    if (!openRe.test(st0)) continue;
    sh.getRange(r + 1, 7).setValue("cancelled");
    sh.getRange(r + 1, 12).setValue(new Date());
    n++;
  }
  return n;
}

/** Если по nick+kind уже есть sent/done — отменить висящие planned/due (лечение после бага тика). */
function suppressOpenSurveysIfAlreadySent_(sh) {
  if (!sh || sh.getLastRow() < 2) return 0;
  var data = sh.getDataRange().getValues();
  var sentKeys = {};
  var openRe = /^(planned|due)$/i;
  for (var r = 1; r < data.length; r++) {
    var nick = String(data[r][1] || "").trim();
    if (!nick) continue;
    var kind = normalizeSurveyKind_(data[r][3]);
    var st = String(data[r][6] || "").toLowerCase();
    var key = clientMatchKey_(nick) + "|" + kind;
    if (st === "sent" || st === "done") sentKeys[key] = true;
  }
  var n = 0;
  for (var r2 = 1; r2 < data.length; r2++) {
    var nick2 = String(data[r2][1] || "").trim();
    if (!nick2) continue;
    var kind2 = normalizeSurveyKind_(data[r2][3]);
    var st2 = String(data[r2][6] || "planned").trim().toLowerCase() || "planned";
    var key2 = clientMatchKey_(nick2) + "|" + kind2;
    if (!sentKeys[key2]) continue;
    if (!openRe.test(st2)) continue;
    sh.getRange(r2 + 1, 7).setValue("cancelled");
    sh.getRange(r2 + 1, 12).setValue(new Date());
    n++;
  }
  return n;
}

function surveySheetTz_() {
  try {
    var ss = getCrmSpreadsheet_();
    if (ss && ss.getSpreadsheetTimeZone) {
      return ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || "Europe/Minsk";
    }
  } catch (e0) {}
  return Session.getScriptTimeZone() || "Europe/Minsk";
}

/** Date в полдень локально — без сдвига «1 авг → 31 июл» из-за UTC. */
function sheetDateFromYmd_(ymd) {
  var y = surveyDueYmd_(ymd);
  if (!y) return null;
  var p = y.split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
}

function writeSurveyDueCell_(sh, row, col, ymd) {
  if (!sh || !(row >= 1) || !(col >= 1)) return;
  var y = surveyDueYmd_(ymd);
  var cell = sh.getRange(row, col);
  if (!y) {
    try { cell.clearContent(); } catch (eC) { cell.setValue(""); }
    return;
  }
  try { cell.setNumberFormat("yyyy-mm-dd"); } catch (eF) {}
  cell.setValue(sheetDateFromYmd_(y));
}

function surveyDueYmd_(raw) {
  if (raw === null || raw === undefined || raw === "") return "";
  var tz = surveySheetTz_();
  // Date-ячейка из Sheets — всегда через TZ таблицы
  if (Object.prototype.toString.call(raw) === "[object Date]" && !isNaN(raw.getTime())) {
    return Utilities.formatDate(raw, tz, "yyyy-MM-dd");
  }
  var s = String(raw || "").trim();
  if (!s) return "";
  if (/^(from_order|order|bp|none|null|undefined)$/i.test(s)) return "";
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  var mEn = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\s+(\d{4})\b/i);
  if (mEn) {
    var months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    var mi = months[String(mEn[1]).slice(0, 3).toLowerCase()];
    if (mi >= 0) {
      var dEn = new Date(Number(mEn[3]), mi, Number(mEn[2]), 12, 0, 0);
      if (!isNaN(dEn.getTime())) return Utilities.formatDate(dEn, tz, "yyyy-MM-dd");
    }
  }
  try {
    var d = parseFlexibleDate_(s);
    if (d && !isNaN(d.getTime())) {
      return Utilities.formatDate(d, tz, "yyyy-MM-dd");
    }
  } catch (e0) {}
  return "";
}

/**
 * Только опросники, которые ещё нужно отправить:
 * planned/due, без sentAt. Дата пустая — тоже показываем (не терять).
 * Просроченные due < сегодня — тоже показываем (менеджер догонит).
 */
function isSurveyPendingUnsent_(obj, todayYmd) {
  var st = String((obj && obj.status) || "planned").toLowerCase();
  if (st !== "planned" && st !== "due") return false;
  if (String((obj && obj.sentAt) || "").trim()) return false;
  return true;
}

/** Не вычищать sent/done — иначе тик meta БП снова создаст due. */
function shouldRetainSurveyRow_(obj) {
  if (isSurveyPendingUnsent_(obj)) return true;
  var st = String((obj && obj.status) || "").toLowerCase();
  if (st === "sent" || st === "done") return true;
  if (String((obj && obj.sentAt) || "").trim()) return true;
  return false;
}

/** Удаляет мусор/cancelled; открытые и sent/done оставляем. */
function purgeNonPendingSurveys_(sh, todayYmd) {
  if (!sh || sh.getLastRow() < 2) return 0;
  var data = sh.getDataRange().getValues();
  var keepers = [];
  var drop = 0;
  for (var r = 1; r < data.length; r++) {
    if (!String(data[r][0] || "").trim() && !String(data[r][1] || "").trim()) {
      drop++;
      continue;
    }
    var obj = surveyRowToObj_(data[r], r + 1);
    obj.nick = cleanSurveyNickDisplay_(obj.nick) || String(obj.nick || "").split(/\n/)[0].trim();
    if (!obj.nick || isSurveyStageKeyword_(obj.nick) || isSurveyMetaLine_(obj.nick)) {
      drop++;
      continue;
    }
    if (/[\n\r|]/.test(String(obj.kind || "")) || /[\n\r|]/.test(String(obj.status || ""))) {
      drop++;
      continue;
    }
    obj.kind = normalizeSurveyKind_(obj.kind);
    if (!shouldRetainSurveyRow_(obj)) {
      drop++;
      continue;
    }
    keepers.push([
      obj.id || newSurveyId_(),
      obj.nick,
      obj.stage || surveyStageForKind_(obj.kind),
      obj.kind,
      sheetDateFromYmd_(surveyDueYmd_(obj.dueDate) || obj.dueDate) || surveyDueYmd_(obj.dueDate) || obj.dueDate,
      obj.sentAt || "",
      obj.status || "planned",
      obj.templateId || surveyTemplateForKind_(obj.kind),
      obj.answer || "",
      obj.note || "",
      obj.linkedSubId || "",
      obj.updatedAt || new Date()
    ]);
  }
  if (!drop) return 0;
  // быстрее переписать лист, чем deleteRow по одному
  var lastRow = sh.getLastRow();
  try {
    if (lastRow > 1) sh.getRange(2, 1, lastRow, Math.max(SURVEY_HEADERS_.length, sh.getLastColumn())).clearContent();
  } catch (eClr) {}
  try {
    if (lastRow > 1) sh.deleteRows(2, lastRow - 1);
  } catch (eDel) {}
  if (keepers.length) {
    try {
      sh.getRange(2, 1, 1 + keepers.length, SURVEY_HEADERS_.length).setValues(keepers);
    } catch (eSet) {
      for (var i = 0; i < keepers.length; i++) {
        try { sh.appendRow(keepers[i]); } catch (eAp) {}
      }
    }
  }
  try { clearCrmSheetCache_("Опросник"); } catch (eC) {}
  return drop;
}

function handleListSurvey(json, callback, fromPost) {
  json = json || {};
  var out = { status: "success", items: [], headers: SURVEY_HEADERS_, purged: 0 };
  try {
    ensureSurveySheetRepaired_();
    var sh = ensureSurveySheet_();
    if (!sh || sh.getLastRow() < 2) {
      return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
    }
    var filterStatus = String(json.status || "").trim().toLowerCase();
    var filterKind = String(json.kind || "").trim();
    var filterNick = String(json.nick || json.client || "").trim();
    var filterSheet = String(json.sheet || json.segment || json.linkedSheet || "").trim();
    var wantKind = filterKind ? normalizeSurveyKind_(filterKind) : "";
    var activeOnly = !(json.activeOnly === false || json.activeOnly === "0" || json.activeOnly === 0 ||
      json.includeOld === true || json.includeOld === "1" || json.includeOld === 1);
    // по умолчанию НЕ чистим лист при открытии вкладки — только фильтр в ответе
    // purge=1 / force — явное удаление (кнопка «починить»)
    var wantPurge = json.purge === true || json.purge === "1" || json.purge === 1 ||
      json.purge === "force" || json.forcePurge === "1" || json.forcePurge === true;
    var forcePurge = json.purge === "force" || json.forcePurge === "1" || json.forcePurge === true;
    var tz = Session.getScriptTimeZone() || "Europe/Minsk";
    var todayYmd = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
    if (wantPurge) {
      var props = PropertiesService.getScriptProperties();
      var lastPurge = "";
      try { lastPurge = props.getProperty("survey_purge_ymd") || ""; } catch (eP0) {}
      if (forcePurge || lastPurge !== todayYmd) {
        out.purged = purgeNonPendingSurveys_(sh, todayYmd);
        try { props.setProperty("survey_purge_ymd", todayYmd); } catch (eP1) {}
        sh = ensureSurveySheet_();
      }
    }
    if (!sh || sh.getLastRow() < 2) {
      out.count = 0;
      out.activeOnly = activeOnly;
      out.today = todayYmd;
      return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
    }
    var data = sh.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (!String(data[r][0] || "").trim() && !String(data[r][1] || "").trim()) continue;
      var obj = surveyRowToObj_(data[r], r + 1);
      obj.nick = cleanSurveyNickDisplay_(obj.nick) || String(obj.nick || "").split(/\n/)[0].trim();
      if (!obj.nick || isSurveyStageKeyword_(obj.nick)) continue;
      if (/[\n\r|]/.test(String(obj.kind || "")) || /[\n\r|]/.test(String(obj.status || ""))) continue;
      obj.kind = normalizeSurveyKind_(obj.kind);
      obj.dueDate = surveyDueYmd_(obj.dueDate);
      if (activeOnly && !isSurveyPendingUnsent_(obj, todayYmd)) continue;
      if (filterStatus && String(obj.status || "").toLowerCase() !== filterStatus) continue;
      if (wantKind && obj.kind !== wantKind) continue;
      if (filterNick && !nicksMatch_(obj.nick, filterNick)) continue;
      if (filterSheet) {
        var seg = obj.linkedSheet || parseSurveySegFromNote_(obj.note);
        if (seg && String(seg).toUpperCase() !== String(filterSheet).toUpperCase()) continue;
      }
      out.items.push(obj);
    }
    var byKey = {};
    var order = [];
    for (var i = 0; i < out.items.length; i++) {
      var it = out.items[i];
      var k = (clientMatchKey_(it.nick) || String(it.nick).toUpperCase()) + "|" + normalizeSurveyKind_(it.kind);
      if (!byKey[k]) {
        byKey[k] = it;
        order.push(k);
      } else {
        var prev = byKey[k];
        var rank = function (s) {
          s = String(s || "").toLowerCase();
          if (s === "due") return 3;
          if (s === "planned") return 2;
          return 0;
        };
        if (rank(it.status) > rank(prev.status)) byKey[k] = it;
      }
    }
    out.items = order.map(function (k2) { return byKey[k2]; });
    out.items.sort(function (a, b) {
      var da = surveyDueYmd_(a.dueDate) || "9999-99-99";
      var db = surveyDueYmd_(b.dueDate) || "9999-99-99";
      if (da < db) return -1;
      if (da > db) return 1;
      return String(a.nick || "").localeCompare(String(b.nick || ""), "ru");
    });
    out.count = out.items.length;
    out.activeOnly = activeOnly;
    out.today = todayYmd;
  } catch (e) {
    out.status = "error";
    out.message = String(e);
  }
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}

function handleSaveSurvey(json, callback, fromPost) {
  json = json || {};
  var nick = String(json.nick || json.client || "").trim();
  var id = String(json.id || "").trim();
  if (!nick && !id) {
    var need = { status: "error", message: "need_nick_or_id" };
    return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
  }
  try {
    var sh = ensureSurveySheet_();
    if (!sh) {
      var nos = { status: "error", message: "survey_sheet_missing" };
      return fromPost ? jsonpText(callback, nos) : jsonp(callback, nos);
    }
    var kind = normalizeSurveyKind_(json.kind || json.surveyKind);
    var status = String(json.status || "planned").trim() || "planned";
    var allowed = { planned: 1, due: 1, sent: 1, done: 1, cancelled: 1 };
    if (!allowed[status]) status = "planned";
    var dueDate = surveyDueYmd_(json.dueDate || json.surveyDate) || String(json.dueDate || json.surveyDate || "").trim();
    var stage = String(json.stage || json.statusStage || "").trim();
    var templateId = String(json.templateId || "").trim();
    var answer = json.answer != null ? String(json.answer) : null;
    var noteIn = json.note != null ? String(json.note) : null;
    var ownerTelegramId = String(json.ownerTelegramId || json.respTelegramId || "").trim();
    var ownerName = String(json.ownerName || json.respName || "").trim();
    var linkedSubId = json.linkedSubId != null || json.subId != null
      ? String(json.linkedSubId || json.subId || "").trim()
      : null;
    var sentAt = json.sentAt != null ? String(json.sentAt || "").trim() : null;
    if (status === "sent" && !sentAt) {
      sentAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Europe/Minsk", "yyyy-MM-dd HH:mm");
    }

    var data = sh.getDataRange().getValues();
    var rowIndex = -1;
    var existing = null;
    if (id) {
      for (var r = 1; r < data.length; r++) {
        if (String(data[r][0] || "").trim() === id) {
          rowIndex = r + 1;
          existing = surveyRowToObj_(data[r], rowIndex);
          break;
        }
      }
    }
    // без id — найти открытую строку nick+kind (не плодить дубликаты)
    if (rowIndex < 0 && nick) {
      var openRe = /^(planned|due)$/i;
      var fallback = -1;
      for (var r2 = 1; r2 < data.length; r2++) {
        if (!nicksMatch_(data[r2][1], nick)) continue;
        if (normalizeSurveyKind_(data[r2][3]) !== kind) continue;
        var st0 = String(data[r2][6] || "planned").trim() || "planned";
        if (openRe.test(st0)) {
          rowIndex = r2 + 1;
          existing = surveyRowToObj_(data[r2], rowIndex);
          break;
        }
        if (fallback < 0) fallback = r2 + 1;
      }
      if (rowIndex < 0 && fallback > 0 && (status === "done" || status === "cancelled")) {
        rowIndex = fallback;
        existing = surveyRowToObj_(data[fallback - 1], rowIndex);
      }
    }

    if (existing) {
      if (!nick) nick = existing.nick;
      if (!kind) kind = normalizeSurveyKind_(existing.kind);
      if (!dueDate) dueDate = existing.dueDate;
      if (!stage) stage = existing.stage;
      if (!templateId) templateId = existing.templateId;
      if (answer === null) answer = existing.answer;
      if (sentAt === null) sentAt = existing.sentAt;
      if (linkedSubId === null) linkedSubId = existing.linkedSubId;
      id = existing.id || id;
      var note = existing.note || "";
      if (noteIn !== null && String(noteIn).trim()) note = String(noteIn).trim();
      if (ownerTelegramId) note = stampRespIntoSurveyNote_(note, ownerTelegramId, ownerName);
      else if (!ownerTelegramId && existing.ownerTelegramId && noteIn === null) {
        // сохранить прежнего ответственного
        note = stampRespIntoSurveyNote_(note, existing.ownerTelegramId, existing.ownerName);
      }
      if (!stage) stage = surveyStageForKind_(kind, existing.stage);
      if (!templateId) templateId = surveyTemplateForKind_(kind);
      writeSurveyRowCells_(sh, rowIndex, [
        id, nick, stage, kind, dueDate, sentAt || "",
        status, templateId || surveyTemplateForKind_(kind), answer || "", note, linkedSubId || "", new Date()
      ]);
      var savedUp = surveyRowToObj_(sh.getRange(rowIndex, 1, rowIndex, SURVEY_HEADERS_.length).getValues()[0], rowIndex);
      if (status === "sent" || status === "done" || status === "cancelled") {
        try { clearBpSurveyMetaAfterClose_(getCrmSpreadsheet_(), nick, kind); } catch (eMeta2) {}
        // закрыть дубликаты nick+kind (старые due, которые плодил тик)
        try { cancelOpenSurveyDuplicatesExceptId_(sh, nick, kind, id); } catch (eDup) {}
      }
      try { clearCrmSheetCache_("Опросник"); } catch (eC0) {}
      var okUp = { status: "success", item: savedUp, updated: true };
      return fromPost ? jsonpText(callback, okUp) : jsonp(callback, okUp);
    }

    // новая строка
    if (!nick) {
      var needN = { status: "error", message: "need_nick" };
      return fromPost ? jsonpText(callback, needN) : jsonp(callback, needN);
    }
    if (!dueDate && (status === "planned" || status === "due")) {
      // для нового planned без даты — +4 дня, иначе список его сразу вычистит
      dueDate = ymdPlusDays_("", 4);
    }
    if (!stage) stage = surveyStageForKind_(kind, json.stage);
    if (!templateId) templateId = surveyTemplateForKind_(kind);
    var noteNew = noteIn !== null ? String(noteIn || "").trim() : "";
    if (ownerTelegramId) noteNew = stampRespIntoSurveyNote_(noteNew, ownerTelegramId, ownerName);
    id = id || newSurveyId_();
    sh.appendRow([
      id, nick, stage, kind, dueDate, sentAt || "",
      status, templateId, answer || "", noteNew, linkedSubId || "", new Date()
    ]);
    var last = sh.getLastRow();
    // на случай merge — перезаписать по ячейкам
    writeSurveyRowCells_(sh, last, [
      id, nick, stage, kind, dueDate, sentAt || "",
      status, templateId, answer || "", noteNew, linkedSubId || "", new Date()
    ]);
    var saved = surveyRowToObj_(sh.getRange(last, 1, last, SURVEY_HEADERS_.length).getValues()[0], last);
    try { clearCrmSheetCache_("Опросник"); } catch (eC1) {}
    var ok = { status: "success", item: saved, created: true };
    return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
  } catch (e) {
    var bad = { status: "error", message: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
}

function handleDeleteSurvey(json, callback, fromPost) {
  json = json || {};
  if (!json.id && !json.nick) {
    var need = { status: "error", message: "need_id_or_nick" };
    return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
  }
  if (json.id && !String(json.nick || "").trim()) {
    try {
      var sh = ensureSurveySheet_();
      if (!sh) {
        var nos = { status: "error", message: "survey_sheet_missing" };
        return fromPost ? jsonpText(callback, nos) : jsonp(callback, nos);
      }
      var wantId = String(json.id || "").trim();
      var data = sh.getDataRange().getValues();
      for (var r = 1; r < data.length; r++) {
        if (String(data[r][0] || "").trim() !== wantId) continue;
        sh.getRange(r + 1, 7).setValue("cancelled");
        sh.getRange(r + 1, 12).setValue(new Date());
        var obj = surveyRowToObj_(sh.getRange(r + 1, 1, r + 1, SURVEY_HEADERS_.length).getValues()[0], r + 1);
        var ok = { status: "success", item: obj };
        return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
      }
      var miss = { status: "error", message: "not_found" };
      return fromPost ? jsonpText(callback, miss) : jsonp(callback, miss);
    } catch (e) {
      var bad = { status: "error", message: String(e) };
      return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
    }
  }
  json.status = "cancelled";
  return handleSaveSurvey(json, callback, fromPost);
}

/** Пачка: отменить опросники по id[] / nick[]. */
function handleDeleteSurveyBatch(json, callback, fromPost) {
  json = json || {};
  var ids = json.ids || json.idList || [];
  if (typeof ids === "string") {
    try { ids = JSON.parse(ids); } catch (e0) { ids = String(ids).split(/[,;]+/); }
  }
  if (!Array.isArray(ids)) ids = [];
  var nicks = json.nicks || [];
  if (typeof nicks === "string") {
    try { nicks = JSON.parse(nicks); } catch (e1) { nicks = String(nicks).split(/[,;]+/); }
  }
  if (!Array.isArray(nicks)) nicks = [];
  if (!ids.length && json.id) ids = [json.id];
  if (!nicks.length && json.nick) nicks = [json.nick];
  if (!ids.length && !nicks.length) {
    var need = { status: "error", message: "need_ids_or_nicks" };
    return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
  }
  var sh = ensureSurveySheet_();
  if (!sh || sh.getLastRow() < 2) {
    var nos = { status: "error", message: "survey_sheet_missing" };
    return fromPost ? jsonpText(callback, nos) : jsonp(callback, nos);
  }
  var wantIds = {};
  for (var i = 0; i < ids.length; i++) {
    var id0 = String(ids[i] || "").trim();
    if (id0) wantIds[id0] = 1;
  }
  var wantNicks = [];
  for (var n = 0; n < nicks.length; n++) {
    var nk = String(nicks[n] || "").trim();
    if (nk) wantNicks.push(nk);
  }
  var data = sh.getDataRange().getValues();
  var cancelled = 0;
  // если передали ids — удаляем только по id (ник не трогает соседние kind того же человека)
  var useIdsOnly = Object.keys(wantIds).length > 0;
  for (var r = 1; r < data.length; r++) {
    var rowId = String(data[r][0] || "").trim();
    var rowNick = String(data[r][1] || "").trim();
    var hit = !!(rowId && wantIds[rowId]);
    if (!hit && !useIdsOnly && wantNicks.length) {
      for (var w = 0; w < wantNicks.length; w++) {
        if (nicksMatch_(rowNick, wantNicks[w]) || cleanSurveyNickDisplay_(rowNick) === cleanSurveyNickDisplay_(wantNicks[w])) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) continue;
    var st = String(data[r][6] || "").toLowerCase();
    if (st === "cancelled") continue;
    sh.getRange(r + 1, 7).setValue("cancelled");
    sh.getRange(r + 1, 12).setValue(new Date());
    cancelled++;
  }
  try { clearCrmSheetCache_("Опросник"); } catch (eC) {}
  var ok = { status: "success", cancelled: cancelled };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}




function handleGetPpFactCost(json, callback, fromPost) {
  var nick = String(json.nick || json.client || "").trim();
  var out = {
    status: "success",
    nick: nick,
    factCost: null,
    deliveries: 0,
    deliverySlot: 1,
    needManualSlot: false,
    ppSlot: ""
  };
  try {
    var crmSs = getCrmSpreadsheet_();
    var data = getCrmSheetValuesFast_(crmSs, "ПП");
    if (!data || data.length < 2) {
      return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
    }
    var headers = data[0].map(function (h) { return String(h || "").trim().toUpperCase(); });
    var factCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (headers[c].indexOf("ФАКТ") >= 0 && headers[c].indexOf("СТОИМ") >= 0) { factCol = c; break; }
    }
    if (factCol < 0) {
      for (var c2 = 0; c2 < headers.length; c2++) {
        if (headers[c2].indexOf("ФАКТ СТОИМОСТЬ") >= 0 || headers[c2] === "ФАКТ СТОИМОСТЬ") { factCol = c2; break; }
      }
    }
    var wantNick = String(nick || "");
    for (var r = 2; r < data.length; r++) {
      if (nicksMatch_(data[r][0], wantNick)) {
        out.deliveries = Number(data[r][2]) || 0;
        if (factCol >= 0) {
          var raw = data[r][factCol];
          out.factCost = Number(String(raw != null ? raw : "").replace(",", ".").replace(/[^\d.]/g, "")) || 0;
        }
        break;
      }
    }
    if (out.deliveries >= 2) {
      try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var tz = ss.getSpreadsheetTimeZone() || "Europe/Minsk";
        var dateValue = parseFlexibleDate_(json.date || json.deliveryDate, tz);
        if (!dateValue && json.day) dateValue = getDayDate_(ss, String(json.day || "").trim());
        if (!dateValue) dateValue = new Date();
        var resolved = resolvePpDeliverySlot_(ss, nick, dateValue, tz, false);
        var history = findPpClientHistoryMeta_(ss, nick, dateValue);
        out.needManualSlot = shouldAskPpSlotConfirm_(ss, nick, out.deliveries);
        out.suggestedSlot = Number(history.suggestedSlot) || Number(resolved.slot) || 1;
        if (!out.needManualSlot) out.suggestedSlot = Number(resolved.slot) || 1;
        out.deliverySlot = out.suggestedSlot;
        out.ppSlot = formatPpSlotLabel_(out.deliverySlot, out.deliveries);
        out.everSeenInApp = !!history.everSeen;
        out.daysSinceLastDelivery = history.daysSinceLastDelivery;
        out.lastSlot = history.lastSlot || 0;
        out.lastDeliveryDate = history.lastDeliveryDate || "";
        out.hasPpSlotAnchor = !out.needManualSlot;
      } catch (eSlot) {
        out.needManualSlot = true;
        out.deliverySlot = 1;
        out.suggestedSlot = 1;
      }
    }
  } catch (e) {
    out.status = "error";
    out.message = String(e);
  }
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}


function defaultSurveyTemplates_() {
  return [
    {
      id: "survey_bp2",
      kind: "survey",
      title: "Опросник после 1-й коробки (БП2)",
      body:
        "Здравствуйте, ! Как себя чувствует после первой коробки? 🐾 Нам очень важно, чтобы лакомства действительно подошли — давайте немного уточним, чтобы вторая доставка была максимально точной. Можно отвечать прямо по пунктам:\n\n" +
        "1. Какие лакомства из первой коробки особенно понравились вашему питомцу? А какие он проигнорировал или ел без интереса?\n" +
        "2. Получилось ли использовать лакомства и в тренировках, и дома? Что было удобно, а что не очень?\n" +
        "3. Как вам количество — хватило на неделю, было впритык или с запасом?\n" +
        "4. Были ли сложности с хранением, дозировкой или формой лакомств?\n" +
        "5. Есть ли замечания по составу, запаху, текстуре или размеру?\n" +
        "6. Что бы вы хотели изменить, добавить или исключить во второй коробке, чтобы она идеально подошла именно вам и вашему пушистому другу?"
    },
    {
      id: "survey_final",
      kind: "survey",
      title: "Опросник после 2-й коробки (→ ПП)",
      body:
        "Здравствуйте, ! Как чувствует себя ваш питомец? 🐾 Мы очень рады, что вы были с нами весь пробный период. Хотим немного узнать, как вам опыт подписки — это поможет сделать её ещё удобнее. Можно отвечать прямо по пунктам:\n\n" +
        "1. Стало ли вам проще с лакомствами — меньше беготни, больше пользы?\n" +
        "2. Какие лакомства особенно понравились вашему питомцу? А какие можно исключить?\n" +
        "3. Удобно ли было получать коробку дважды в месяц? Хотели бы продолжать в таком ритме или перейти на раз в месяц?\n" +
        "4. Есть ли ещё моменты, которые стоит подправить, чтобы подписка стала идеальной именно для вас и вашего пушистого друга?\n" +
        "5. Готовы ли вы продолжить подписку на постоянной основе? Если да — мы подберём формат и ритм, который будет максимально комфортным.\n" +
        "6. И напоследок: что вам особенно понравилось в нашем подходе или коробке? Нам важно знать, что получилось хорошо 😊"
    }
  ];
}

function upsertSurveyTemplateRow_(sh, id, kind, title, body) {
  if (!sh || !id) return;
  var data = sh.getDataRange().getValues();
  var want = String(id).toLowerCase();
  var row = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim().toLowerCase() === want) {
      row = i + 1;
      break;
    }
  }
  if (!row) {
    sh.appendRow([id, kind || "survey", title || "", body || ""]);
    return;
  }
  writeTemplateCells_(sh, row, id, kind, title, body);
}

/** Пишет шаблон по ячейкам (устойчиво к merge на листе «Шаблоны»). */
function writeTemplateCells_(sh, row, id, kind, title, body) {
  try {
    var lastCol = Math.max(4, sh.getLastColumn());
    sh.getRange(row, 1, row, lastCol).breakApart();
  } catch (eBr) {}
  try {
    sh.getRange(row, 1).setValue(id);
    sh.getRange(row, 2).setValue(kind || "survey");
    sh.getRange(row, 3).setValue(title || "");
    sh.getRange(row, 4).setValue(body || "");
  } catch (eSet) {
    // fallback: удалить строку и append
    try { sh.deleteRow(row); } catch (eDel) {}
    sh.appendRow([id, kind || "survey", title || "", body || ""]);
  }
}

/** Лист «Шаблоны»: пишем в CRM (там же БП/Опросник), иначе в активную книгу. */
function getTemplatesSpreadsheet_() {
  try {
    var crm = getCrmSpreadsheet_();
    if (crm) return crm;
  } catch (e0) {}
  return SpreadsheetApp.getActiveSpreadsheet();
}

function openOrCreateTemplatesSheet_(ss) {
  if (!ss) return null;
  var sh = ss.getSheetByName("Шаблоны");
  if (!sh) {
    try {
      sh = ss.insertSheet("Шаблоны");
      sh.getRange(1, 1, 1, 4).setValues([["id", "kind", "title", "body"]]);
    } catch (eIns) {
      sh = ss.getSheetByName("Шаблоны");
    }
  }
  return sh;
}

/** Лист «Шаблоны» + канон опросников (старые короткие плейсхолдеры сносятся). */
function getTemplatesSheet_() {
  var sh = openOrCreateTemplatesSheet_(getTemplatesSpreadsheet_());
  if (!sh) {
    sh = openOrCreateTemplatesSheet_(SpreadsheetApp.getActiveSpreadsheet());
  }
  try {
    ensureCanonicalSurveyTemplates_(sh);
    // если CRM и active разные — продублировать канон и туда
    try {
      var active = SpreadsheetApp.getActiveSpreadsheet();
      if (active && sh.getParent().getId() !== active.getId()) {
        var sh2 = openOrCreateTemplatesSheet_(active);
        if (sh2) ensureCanonicalSurveyTemplates_(sh2);
      }
    } catch (eDupSs) {}
  } catch (eTpl) {}
  return sh;
}

function ensureCanonicalSurveyTemplates_(sh) {
  if (!sh) return;
  var VER = "v7.11.04";
  var props = PropertiesService.getScriptProperties();
  // уже синхронизировано — не трогать кастомные / отредактированные строки
  try {
    if (String(props.getProperty("survey_templates_ver") || "") === VER) return;
  } catch (eVer) {}
  var defs = defaultSurveyTemplates_();
  // Полностью очистить лист от survey-строк + любых старых плейсхолдеров
  try {
    var data = sh.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      var id0 = String(data[i][0] || "").trim().toLowerCase();
      var body0 = String(data[i][3] || data[i][2] || "");
      var title0 = String(data[i][2] || "");
      var isSurveyId = id0 === "survey_bp2" || id0 === "survey_final" ||
        id0 === "bp2" || id0 === "final" ||
        /^survey_/.test(id0) || /^опрос/.test(id0);
      var isOldPlaceholder =
        body0.indexOf("Привет! Как собака перенесла") >= 0 ||
        body0.indexOf("Готовы перейти на подписку ПП?") >= 0 ||
        (body0.length > 0 && body0.length < 200 && /опрос|бп2|survey/i.test(id0 + " " + title0));
      if (!isSurveyId && !isOldPlaceholder) continue;
      try { sh.getRange(i + 1, 1, i + 1, Math.max(4, sh.getLastColumn())).breakApart(); } catch (e1) {}
      try { sh.deleteRow(i + 1); } catch (e2) {}
    }
  } catch (eWipe) {}
  // Заголовок
  try {
    sh.getRange(1, 1, 1, 4).setValues([["id", "kind", "title", "body"]]);
  } catch (eH) {}
  for (var d = 0; d < defs.length; d++) {
    var def = defs[d];
    sh.appendRow([def.id, def.kind, def.title, def.body]);
  }
  props.setProperty("survey_templates_ver", VER);
}

/** Принудительная синхронизация текстов опросников в лист «Шаблоны». */
function handleSyncSurveyTemplates(json, callback, fromPost) {
  var synced = [];
  var errs = [];
  function syncOne_(ss, label) {
    if (!ss) return;
    try {
      var sh = openOrCreateTemplatesSheet_(ss);
      ensureCanonicalSurveyTemplates_(sh);
      synced.push({ book: label, id: ss.getId(), name: ss.getName() });
    } catch (e) {
      errs.push({ book: label, error: String(e) });
    }
  }
  try {
    syncOne_(getTemplatesSpreadsheet_(), "crm_or_active");
  } catch (e1) { errs.push({ book: "crm_or_active", error: String(e1) }); }
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    syncOne_(active, "active");
  } catch (e2) { errs.push({ book: "active", error: String(e2) }); }
  var defs = defaultSurveyTemplates_();
  var ok = {
    status: errs.length && !synced.length ? "error" : "success",
    message: "survey_templates_synced",
    count: defs.length,
    ids: defs.map(function (d) { return d.id; }),
    synced: synced,
    errors: errs,
    preview: defs.map(function (d) {
      return { id: d.id, title: d.title, bodyLen: String(d.body || "").length, bodyStart: String(d.body || "").slice(0, 60) };
    }),
    ver: "v7.11.04"
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function personalizeSurveyBody_(body, nick) {
  var text = String(body || "");
  var name = String(nick || "").trim();
  // «Здравствуйте, !» → «Здравствуйте, Name!»
  if (name) {
    text = text.replace(/Здравствуйте,\s*!/g, "Здравствуйте, " + name + "!");
  } else {
    text = text.replace(/Здравствуйте,\s*!/g, "Здравствуйте!");
  }
  return text;
}

function getSurveyTemplateBody_(kind, nick) {
  var sh = getTemplatesSheet_();
  var data = sh.getDataRange().getValues();
  var want = String(kind || "survey_bp2").toLowerCase();
  var body = "";
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0] || "").toLowerCase();
    var k = String(data[i][1] || "").toLowerCase();
    if (id === want || (k === "survey" && id.indexOf(want.replace("survey_", "")) >= 0)) {
      body = String(data[i][3] || data[i][2] || "");
      break;
    }
  }
  if (!body) {
    var defs = defaultSurveyTemplates_();
    for (var d = 0; d < defs.length; d++) {
      if (String(defs[d].id).toLowerCase() === want) { body = defs[d].body; break; }
    }
  }
  return personalizeSurveyBody_(body, nick);
}

function tickBpSurveyReminders_() {
  return runBpSurveyReminders_({ force: false });
}

/**
 * Принудительная рассылка due-опросников (игнор окна 9–21).
 * action=forceSurveyRemind&nick=zzz_test (nick опционально).
 */
function handleForceSurveyRemind(json, callback, fromPost) {
  json = json || {};
  try {
    var out = runBpSurveyReminders_({
      force: true,
      nick: String(json.nick || json.client || "").trim()
    });
    out.status = "success";
    return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
  } catch (e) {
    var bad = { status: "error", message: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
}

function runBpSurveyReminders_(opts) {
  opts = opts || {};
  var force = !!opts.force;
  var onlyNick = String(opts.nick || "").trim();
  var sent = [];
  var skipped = [];
  var lock = LockService.getScriptLock();
  // параллельные tickCuttingDeficit_ (дубли триггеров) иначе шлют 2–3 одинаковых пуша
  if (!lock.tryLock(force ? 30000 : 15000)) {
    return { sent: sent, skipped: [{ reason: "lock_busy" }], force: force, locked: true };
  }
  try {
    var crmSs = getCrmSpreadsheet_();
    var now = new Date();
    var props = PropertiesService.getScriptProperties();
    var dayKeyUtc = Utilities.formatDate(now, "UTC", "yyyy-MM-dd");
    var sentKey = "bp_survey_remind_" + dayKeyUtc;
    var already = {};
    try { already = JSON.parse(props.getProperty(sentKey) || "{}"); } catch (e0) { already = {}; }

    var bp = findSheetByBaseName_(crmSs, "БП");
    if (bp && !force) {
      var data = bp.getDataRange().getValues();
      for (var r = 2; r < data.length; r++) {
        var nickRaw = String(data[r][0] || "").trim();
        if (!nickRaw) continue;
        if (/^себестоим/i.test(nickRaw) || /^стоимость\s*100/i.test(nickRaw)) continue;
        var status = String(data[r][3] || "");
        var meta = parseBpMetaFromWishes_(String(data[r][4] || ""));
        var ownerTzSync = timezoneOfAccessId_(meta.ownerTelegramId);
        var ownerTodaySync = localPartsInTz_(now, ownerTzSync).ymd;
        var jobs = [];
        var dueBp2 = surveyDueYmd_(meta.surveyBp2Due) || String(meta.surveyBp2Due || "").trim();
        var dueFin = surveyDueYmd_(meta.surveyFinalDue) || String(meta.surveyFinalDue || "").trim();
        if (dueBp2 && dueBp2 <= ownerTodaySync) {
          jobs.push({ due: dueBp2, kind: "bp2", tpl: "survey_bp2" });
        }
        if (dueFin && dueFin <= ownerTodaySync) {
          jobs.push({ due: dueFin, kind: "final", tpl: "survey_final" });
        }
        for (var j = 0; j < jobs.length; j++) {
          try {
            upsertOpenSurvey_(crmSs, {
              nick: nickRaw,
              kind: jobs[j].kind,
              dueDate: jobs[j].due,
              stage: status,
              status: "due",
              templateId: jobs[j].tpl,
              ownerTelegramId: meta.ownerTelegramId,
              ownerName: meta.ownerName,
              note: "from_bp_meta",
              linkedSheet: "БП"
            });
          } catch (eUp) {}
        }
      }
    }

    var shSv = null;
    try { shSv = ensureSurveySheet_(crmSs); } catch (eSh) { shSv = null; }
    if (!shSv || shSv.getLastRow() < 2) {
      if (!force) props.setProperty(sentKey, JSON.stringify(already));
      return { sent: sent, skipped: skipped, empty: true, force: force };
    }
    try { suppressOpenSurveysIfAlreadySent_(shSv); } catch (eSup) {}
    var svData = shSv.getDataRange().getValues();
    // один ник+kind — один пуш за проход (дубли строк на листе)
    var remindedOpen = {};
    for (var s = 1; s < svData.length; s++) {
      var obj = surveyRowToObj_(svData[s], s + 1);
      if (!obj.nick || !obj.dueDate) continue;
      if (onlyNick && !nicksMatch_(obj.nick, onlyNick)) continue;
      var st = String(obj.status || "").toLowerCase();
      if (st === "done" || st === "cancelled" || st === "cancel" || st === "closed" || st === "sent") {
        skipped.push({ nick: obj.nick, reason: "closed:" + st });
        continue;
      }
      if (String(obj.sentAt || "").trim()) {
        skipped.push({ nick: obj.nick, reason: "has_sentAt" });
        continue;
      }
      if (st !== "planned" && st !== "due") continue;

      var openKey = (clientMatchKey_(obj.nick) || String(obj.nick).toUpperCase()) + "|" + normalizeSurveyKind_(obj.kind) + "|" + String(obj.dueDate);
      if (remindedOpen[openKey]) {
        skipped.push({ nick: obj.nick, reason: "dup_row" });
        continue;
      }

      var targets = [];
      var seenTid = {};
      function addTarget_(tid0) {
        tid0 = String(tid0 || "").trim();
        if (!tid0 || seenTid[tid0]) return;
        seenTid[tid0] = 1;
        targets.push(tid0);
      }
      if (obj.ownerTelegramId) addTarget_(obj.ownerTelegramId);
      if (!targets.length && bp) {
        var bpVals = bp.getDataRange().getValues();
        for (var br2 = 2; br2 < bpVals.length; br2++) {
          if (!nicksMatch_(bpVals[br2][0], obj.nick)) continue;
          var bm = parseBpMetaFromWishes_(String(bpVals[br2][4] || ""));
          if (bm.ownerTelegramId) {
            addTarget_(bm.ownerTelegramId);
            try {
              shSv.getRange(s + 1, 10).setValue(
                stampRespIntoSurveyNote_(obj.note, bm.ownerTelegramId, bm.ownerName)
              );
            } catch (eBf) {}
          }
          break;
        }
      }
      // без ответственного — НЕ спамим всем owner'ам; только если force+nick (явный тест)
      if (!targets.length && force && onlyNick) {
        try {
          var owners = getOwnerTelegramIds_();
          for (var o = 0; o < owners.length; o++) addTarget_(owners[o]);
        } catch (eOw) {}
      }
      if (!targets.length) {
        skipped.push({ nick: obj.nick, reason: "no_target" });
        continue;
      }

      var anySent = false;
      for (var t = 0; t < targets.length; t++) {
        var tid = targets[t];
        if (!tid) continue;
        var personTz = timezoneOfAccessId_(tid);
        var local = localPartsInTz_(now, personTz);
        // force+nick (тест) — шлём даже если due завтра; обычный тик / force без nick — только due≤сегодня
        if (String(obj.dueDate) > local.ymd && !(force && onlyNick)) {
          skipped.push({ nick: obj.nick, reason: "due_future:" + obj.dueDate + ">" + local.ymd, tid: tid });
          continue;
        }
        if (!force && !isPersonNotifyWindow_(now, personTz)) {
          skipped.push({ nick: obj.nick, reason: "outside_window:" + local.slot + "@" + personTz, tid: tid });
          continue;
        }

        var kindKey = normalizeSurveyKind_(obj.kind) === "final" ? "survey_final" : "survey_bp2";
        // один пуш на ник+kind+due+tid в сутки (force тоже — иначе 3 клика = 3 сообщения)
        var key = clientMatchKey_(obj.nick) + "|" + kindKey + "|" + obj.dueDate + "|" + tid;
        if (already[key]) {
          skipped.push({ nick: obj.nick, reason: "already_day", tid: tid });
          continue;
        }

        var body = getSurveyTemplateBody_(kindKey, obj.nick) ||
          getSurveyTemplateBody_(obj.templateId, obj.nick) ||
          ("Опросник для " + obj.nick);
        var kindLabel = normalizeSurveyKind_(obj.kind) === "final" ? "ПП (финал)" : "БП2";
        var text =
          "📋 Опросник · " + kindLabel + "\n" +
          "Кому отправить: " + obj.nick + "\n" +
          (obj.stage ? ("Этап: " + obj.stage + "\n") : "") +
          "Дата: " + obj.dueDate + "\n" +
          "Ваше время: " + local.slot.replace("T", " ") + " (" + personTz + ")" +
          (force ? "\n⚡ forceSurveyRemind" : "") + "\n\n" +
          "Текст опросника:\n" + body;

        var markup = null;
        if (obj.id) {
          markup = {
            inline_keyboard: [[{
              text: "✅ Отправлено",
              callback_data: ("svsent:" + String(obj.id)).slice(0, 64)
            }]]
          };
        }
        var sendRes = null;
        try {
          if (markup) sendRes = telegramSendMarkup_(tid, text, markup);
          else sendRes = telegramSendText_(tid, text);
        } catch (eS) {
          sendRes = { ok: false, error: String(eS) };
        }
        already[key] = 1;
        anySent = true;
        sent.push({
          nick: obj.nick,
          tid: tid,
          id: obj.id || "",
          ok: !!(sendRes && sendRes.ok !== false),
          raw: sendRes
        });
      }
      if (anySent) remindedOpen[openKey] = 1;

      try {
        if (st === "planned" || st === "due") {
          shSv.getRange(s + 1, 7).setValue("due");
          shSv.getRange(s + 1, 12).setValue(now);
        }
      } catch (eMk) {}
    }
    try { props.setProperty(sentKey, JSON.stringify(already)); } catch (eP) {}
  } catch (e) {
    return { sent: sent, skipped: skipped, error: String(e), force: force };
  } finally {
    try { lock.releaseLock(); } catch (eL) {}
  }
  return { sent: sent, skipped: skipped, force: force };
}

function actorCanEditTemplates_(telegramId) {
  var tid = String(telegramId || "").trim();
  if (!tid || tid === "undefined" || tid === "null") return true; // soft: тесты / без actor
  if (actorIsOwner_(tid) || isOwnerId_(tid)) return true;
  var row = findAccessById_(tid);
  // нет строки в «Доступы» — не блочим: экран Шаблоны и так только у manager/owner во фронте
  if (!row) return true;
  var role = String(row.role || "").toLowerCase().trim();
  if (role === "менеджер") role = "manager";
  if (role === "владелец") role = "owner";
  var st = String(row.status || "").toLowerCase().trim();
  if (st === "denied") return false;
  if (st === "pending") return false;
  return role === "manager" || role === "owner" || role === "all" || !role;
}

function isCanonicalSurveyTemplateId_(id) {
  var id0 = String(id || "").trim().toLowerCase();
  return id0 === "survey_bp2" || id0 === "survey_final";
}

function upsertTemplateOnSheet_(sh, id, kind, title, body) {
  if (!sh || !id) return 0;
  var data = sh.getDataRange().getValues();
  var row = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim().toLowerCase() === String(id).toLowerCase()) {
      row = i + 1;
      break;
    }
  }
  if (row) {
    writeTemplateCells_(sh, row, id, kind, title, body);
    return row;
  }
  sh.appendRow([id, kind, title, body]);
  return sh.getLastRow();
}

function deleteTemplateRowOnSheet_(sh, id) {
  if (!sh || !id) return false;
  var want = String(id).trim().toLowerCase();
  var data = sh.getDataRange().getValues();
  var deleted = false;
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0] || "").trim().toLowerCase() !== want) continue;
    var row = i + 1;
    var lastCol = Math.max(4, sh.getLastColumn());
    try { sh.getRange(row, 1, row, lastCol).breakApart(); } catch (eBr) {}
    try {
      sh.deleteRow(row);
      deleted = true;
    } catch (eDel) {
      try {
        sh.getRange(row, 1, row, lastCol).clearContent();
        deleted = true;
      } catch (eClr) {}
    }
  }
  return deleted;
}

function handleListTemplates(json, callback, fromPost) {
  json = json || {};
  var sh = getTemplatesSheet_();
  var data = sh.getDataRange().getValues();
  var wantKind = String(json.kind || "").trim().toLowerCase();
  var rows = [];
  var seen = {};
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0] || "").trim();
    if (!id) continue;
    var kind = String(data[i][1] || "").trim();
    if (wantKind && kind.toLowerCase() !== wantKind && id.toLowerCase().indexOf(wantKind) < 0) continue;
    var key = id.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    rows.push({
      id: id,
      kind: kind,
      title: String(data[i][2] || ""),
      body: String(data[i][3] || "")
    });
  }
  var ok = { status: "success", templates: rows, items: rows, count: rows.length };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleSaveTemplate(json, callback, fromPost) {
  json = json || {};
  try {
    if (json.titleB64 && !json.title) {
      try {
        json.title = Utilities.newBlob(Utilities.base64Decode(String(json.titleB64))).getDataAsString("UTF-8");
      } catch (e1) {}
    }
    if (json.bodyB64 && !json.body) {
      try {
        json.body = Utilities.newBlob(Utilities.base64Decode(String(json.bodyB64))).getDataAsString("UTF-8");
      } catch (e2) {}
    }
    var tid = String(json.telegramId || "").trim();
    if (tid === "undefined" || tid === "null") tid = "";
    if (tid && !actorCanEditTemplates_(tid)) {
      var forbid = { status: "error", message: "forbidden" };
      return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
    }
    var id = String(json.id || "").trim();
    var kind = String(json.kind || "text").trim() || "text";
    var title = String(json.title || "").trim();
    var body = String(json.body || "").trim();
    if (!id) {
      var slug = title.toLowerCase()
        .replace(/[^a-z0-9а-яё]+/gi, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 24);
      if (!slug) slug = "tpl";
      // ASCII-only id — без кириллицы в ключе строки
      slug = String(slug).replace(/[^a-z0-9_]+/gi, "").slice(0, 16) || "tpl";
      id = "tpl_" + slug + "_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Europe/Minsk", "yyyyMMddHHmmss");
    }
    if (!title && !body) {
      var empty = { status: "error", message: "need_title_or_body" };
      return fromPost ? jsonpText(callback, empty) : jsonp(callback, empty);
    }
    if (!title) title = id;
    var sh = getTemplatesSheet_();
    var row = upsertTemplateOnSheet_(sh, id, kind, title, body);
    // дубль в active, если CRM отдельная книга
    try {
      var active = SpreadsheetApp.getActiveSpreadsheet();
      if (active && sh.getParent().getId() !== active.getId()) {
        var sh2 = openOrCreateTemplatesSheet_(active);
        if (sh2) upsertTemplateOnSheet_(sh2, id, kind, title, body);
      }
    } catch (eDup) {}
    var ok = { status: "success", id: id, kind: kind, title: title, body: body, row: row };
    return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
  } catch (err) {
    var fail = { status: "error", message: String(err) };
    return fromPost ? jsonpText(callback, fail) : jsonp(callback, fail);
  }
}

function handleDeleteTemplate(json, callback, fromPost) {
  json = json || {};
  try {
    var tid = String(json.telegramId || "").trim();
    if (tid === "undefined" || tid === "null") tid = "";
    if (tid && !actorCanEditTemplates_(tid)) {
      var forbid = { status: "error", message: "forbidden" };
      return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
    }
    var id = String(json.id || "").trim();
    if (!id) {
      var need = { status: "error", message: "need_id" };
      return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
    }
    if (isCanonicalSurveyTemplateId_(id) && tid && !actorIsOwner_(tid) && !isOwnerId_(tid)) {
      var protect = { status: "error", message: "canonical_owner_only" };
      return fromPost ? jsonpText(callback, protect) : jsonp(callback, protect);
    }
    var deleted = false;
    var sh = getTemplatesSheet_();
    if (deleteTemplateRowOnSheet_(sh, id)) deleted = true;
    try {
      var active = SpreadsheetApp.getActiveSpreadsheet();
      if (active) {
        var shActive = openOrCreateTemplatesSheet_(active);
        if (shActive && (!sh || shActive.getSheetId() !== sh.getSheetId() || shActive.getParent().getId() !== sh.getParent().getId())) {
          if (deleteTemplateRowOnSheet_(shActive, id)) deleted = true;
        } else if (shActive && sh && shActive.getParent().getId() === sh.getParent().getId() && shActive.getName() !== sh.getName()) {
          if (deleteTemplateRowOnSheet_(shActive, id)) deleted = true;
        }
      }
    } catch (eDupD) {}
    // ещё раз CRM, если getTemplatesSheet_ брал active
    try {
      var crm = getCrmSpreadsheet_();
      if (crm) {
        var shCrm = crm.getSheetByName("Шаблоны");
        if (shCrm && deleteTemplateRowOnSheet_(shCrm, id)) deleted = true;
      }
    } catch (eCrm) {}
    var ok = deleted
      ? { status: "success", id: id, deleted: true }
      : { status: "error", message: "not_found" };
    return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
  } catch (err) {
    var fail = { status: "error", message: String(err) };
    return fromPost ? jsonpText(callback, fail) : jsonp(callback, fail);
  }
}

function stampPpCoefIntoWishesGs_(wishes, coef) {
  var base = String(wishes || "").replace(/\[COEF:[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();
  var v = Number(String(coef != null ? coef : "").replace(",", "."));
  if (!isFinite(v) || v <= 0) return base;
  var tag = "[COEF:" + (Math.round(v * 1000) / 1000) + "]";
  return (base + (base ? " " : "") + tag).trim();
}

function parseDogFromWishesGs_(wishes) {
  var m = String(wishes || "").match(/\[DOG:([^\]]*)\]/i);
  if (!m) return { name: "", breed: "", weight: "" };
  var parts = String(m[1] || "").split("|");
  return {
    name: String(parts[0] || "").trim(),
    breed: String(parts[1] || "").trim(),
    weight: String(parts[2] || "").trim()
  };
}

function stampDogIntoWishesGs_(wishes, dog) {
  var base = String(wishes || "").replace(/\[DOG:[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();
  dog = dog || {};
  var name = String(dog.name || dog.dogName || "").trim();
  var breed = String(dog.breed || dog.dogBreed || "").trim();
  var weight = String(dog.weight != null ? dog.weight : (dog.dogWeight != null ? dog.dogWeight : "")).trim();
  if (!name && !breed && !weight) return base;
  var tag = "[DOG:" + name + "|" + breed + "|" + weight + "]";
  return (base + (base ? " " : "") + tag).trim();
}

function parseBpMetaFromWishes_(wishes) {
  var w = String(wishes || "");
  var out = {
    surveyBp2Due: "",
    surveyFinalDue: "",
    lastTouch: "",
    ownerTelegramId: "",
    ownerName: "",
    clean: w
  };
  var m2 = w.match(/\[ОПРОС_БП2:([^\]]+)\]/i);
  var mf = w.match(/\[ОПРОС_ФИНАЛ:([^\]]+)\]/i);
  var mt = w.match(/\[TOUCH:([^\]]+)\]/i);
  var mr = w.match(/\[RESP:([^\]|]+)(?:\|([^\]]*))?\]/i);
  if (m2) out.surveyBp2Due = String(m2[1] || "").trim();
  if (mf) out.surveyFinalDue = String(mf[1] || "").trim();
  if (mt) out.lastTouch = String(mt[1] || "").trim();
  if (mr) {
    out.ownerTelegramId = String(mr[1] || "").trim();
    out.ownerName = String(mr[2] || "").trim();
  }
  out.clean = w
    .replace(/\[ОПРОС_БП2:[^\]]*\]/gi, "")
    .replace(/\[ОПРОС_ФИНАЛ:[^\]]*\]/gi, "")
    .replace(/\[TOUCH:[^\]]*\]/gi, "")
    .replace(/\[RESP:[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return out;
}

function stampBpMetaIntoWishes_(wishes, meta) {
  meta = meta || {};
  var parsed = parseBpMetaFromWishes_(wishes);
  var base = parsed.clean;
  var bp2 = parsed.surveyBp2Due;
  var fin = parsed.surveyFinalDue;
  if (meta.surveyBp2Due !== undefined && meta.surveyBp2Due !== null) bp2 = String(meta.surveyBp2Due || "").trim();
  if (meta.surveyFinalDue !== undefined && meta.surveyFinalDue !== null) fin = String(meta.surveyFinalDue || "").trim();
  var touch = meta.lastTouch != null && meta.lastTouch !== "" ? String(meta.lastTouch) : parsed.lastTouch;
  var ownerId = meta.ownerTelegramId != null ? String(meta.ownerTelegramId).trim() : parsed.ownerTelegramId;
  var ownerName = meta.ownerName != null ? String(meta.ownerName).trim() : parsed.ownerName;
  if (meta.ownerTelegramId === "") { ownerId = ""; ownerName = ""; }
  var tags = "";
  if (bp2) tags += "[ОПРОС_БП2:" + bp2 + "]";
  if (fin) tags += "[ОПРОС_ФИНАЛ:" + fin + "]";
  if (touch) tags += "[TOUCH:" + touch + "]";
  if (ownerId) tags += "[RESP:" + ownerId + (ownerName ? ("|" + ownerName) : "") + "]";
  return (base + (base && tags ? " " : "") + tags).trim();
}

function ymdPlusDays_(ymd, days, tz) {
  tz = tz || Session.getScriptTimeZone() || "Europe/Minsk";
  var base = null;
  if (ymd) {
    try { base = parseFlexibleDate_(ymd, tz); } catch (e0) { base = null; }
  }
  if (!base || isNaN(base.getTime())) base = new Date();
  var d = new Date(base.getTime());
  d.setDate(d.getDate() + (Number(days) || 0));
  return Utilities.formatDate(d, tz, "yyyy-MM-dd");
}

function stampRespIntoSurveyNote_(note, ownerTelegramId, ownerName) {
  var base = String(note || "")
    .replace(/\[RESP:[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  var id = String(ownerTelegramId || "").trim();
  if (!id) return base;
  var name = String(ownerName || "").trim();
  var tag = "[RESP:" + id + (name ? ("|" + name) : "") + "]";
  return (base + (base ? " " : "") + tag).trim();
}

function parseRespFromSurveyNote_(note) {
  var m = String(note || "").match(/\[RESP:([^\]|]+)(?:\|([^\]]*))?\]/i);
  if (!m) return { ownerTelegramId: "", ownerName: "" };
  return { ownerTelegramId: String(m[1] || "").trim(), ownerName: String(m[2] || "").trim() };
}

/** Если у БП мало колонок — скопировать шапку с ПП (только row1, values). */
function ensureBpSheetProductHeaders_(crmSs) {
  if (!crmSs) return null;
  var bp = findSheetByBaseName_(crmSs, "БП");
  var pp = findSheetByBaseName_(crmSs, "ПП");
  if (!bp || !pp) return bp;
  var bpCols = Math.max(1, bp.getLastColumn());
  var ppCols = Math.max(1, pp.getLastColumn());
  if (bpCols >= 10 || bpCols >= ppCols) return bp;
  try {
    var headers = pp.getRange(1, 1, 1, ppCols).getValues();
    bp.getRange(1, 1, 1, ppCols).setValues(headers);
  } catch (eH) {}
  return bp;
}

function handleEnsureBpFromOrder(json, callback, fromPost) {
  var crmSs;
  try { crmSs = getCrmSpreadsheet_(); } catch (e) {
    var bad = { status: "error", message: "crm_unavailable", detail: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var nick = String(json.nick || json.client || json.clientNick || "").trim();
  if (!nick) {
    var need = { status: "error", message: "need_nick" };
    return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
  }
  ensureBpSheetProductHeaders_(crmSs);
  var bp = findSheetByBaseName_(crmSs, "БП");
  if (!bp) {
    var no = { status: "error", message: "bp_sheet_missing" };
    return fromPost ? jsonpText(callback, no) : jsonp(callback, no);
  }
  var basket = Array.isArray(json.basket) ? mergeBasketItemsForPp_(json.basket) : [];
  if (!basket.length && typeof json.basket === "string" && String(json.basket).trim()) {
    try { basket = mergeBasketItemsForPp_(JSON.parse(json.basket)); } catch (eB) { basket = []; }
  }
  var createCard = json.createCard !== false && json.createCard !== "0";
  var status = normalizeBpStage_(json.ppStatus || json.status || json.stage || "БП1");
  var surveyDate = String(json.surveyDate || "").trim();
  var surveyKindRaw = String(json.surveyKind || "").trim();
  var needSurveyOff = json.needSurvey === false || json.needSurvey === "0" || json.needSurvey === 0;
  var needSurveyOn = json.needSurvey === true || json.needSurvey === "1" || json.needSurvey === 1;
  // БП1/БП2 = после 1-й доставки → опрос bp2; ФИНАЛ = после 2-й → final
  var surveyKind = status === "ФИНАЛ" ? "final" : "bp2";
  if (surveyKindRaw) surveyKind = normalizeSurveyKind_(surveyKindRaw);

  var needSurvey = !needSurveyOff;
  if (needSurveyOn) needSurvey = true;
  if (needSurvey) {
    if (!surveyDate) {
      var baseDay = String(json.compositionDate || json.deliveryDate || json.date || "").trim();
      surveyDate = ymdPlusDays_(baseDay, 4);
    }
  } else {
    surveyDate = "";
  }
  surveyDate = surveyDueYmd_(surveyDate) || String(surveyDate || "").trim();
  if (needSurvey && !surveyDate) surveyDate = ymdPlusDays_("", 4);

  var wishes = String(json.wishes || "").trim();
  var noteField = String(json.note || "").trim();
  if (!wishes && noteField) wishes = noteField;
  // не затирать [ОПРОС_*]/[RESP:*] из карточки БП при сохранении заказа (wishes = примечание заказа)
  var existingBpRow = -1;
  var bpSheetNick = nick;
  try {
    existingBpRow = findSubscriptionRowIndex_(bp, nick, String(json.subId || "").trim());
    if (existingBpRow >= 0) {
      bpSheetNick = String(bp.getRange(existingBpRow + 1, 1).getValue() || nick).trim() || nick;
      var existingWishes = String(bp.getRange(existingBpRow + 1, 5).getValue() || "");
      if (existingWishes) {
        var mergedClean = String(wishes || "").trim();
        var exMeta = parseBpMetaFromWishes_(existingWishes);
        // база = чистый текст заказа, иначе чистый текст карточки
        if (!mergedClean) mergedClean = exMeta.clean || "";
        wishes = stampBpMetaIntoWishes_(mergedClean, {
          surveyBp2Due: exMeta.surveyBp2Due,
          surveyFinalDue: exMeta.surveyFinalDue,
          ownerTelegramId: exMeta.ownerTelegramId,
          ownerName: exMeta.ownerName,
          lastTouch: exMeta.lastTouch
        });
      }
    }
  } catch (eExist) {}
  var ownerTelegramId = String(json.ownerTelegramId || json.respTelegramId || json.responsibleId || "").trim();
  var ownerName = String(json.ownerName || json.respName || json.responsibleName || "").trim();
  var meta = { lastTouch: new Date().toISOString() };
  if (needSurvey && surveyDate) {
    if (surveyKind === "final" || status === "ФИНАЛ") meta.surveyFinalDue = surveyDate;
    else meta.surveyBp2Due = surveyDate;
  }
  if (ownerTelegramId) {
    meta.ownerTelegramId = ownerTelegramId;
    meta.ownerName = ownerName;
  }
  wishes = stampBpMetaIntoWishes_(wishes, meta);
  var up = { row: 0, created: false };
  if (createCard) {
    var headers = bp.getRange(1, 1, 1, bp.getLastColumn()).getValues()[0];
    var subId = String(json.subId || "").trim();
    if (!subId && existingBpRow >= 0) {
      try { subId = sanitizeSubId_(bp.getRange(existingBpRow + 1, 2).getValue()); } catch (eSid) {}
    }
    if (!subId) {
      try { subId = nextSubscriptionIdForSheet_(bp); } catch (eId) {}
    }
    var createVals = writePpBasketToRowValues_(headers, basket, bpSheetNick || nick, subId, Number(json.deliveriesN || json.deliveries) || 1, status, wishes, json.factCost);
    up = upsertSubscriptionProductRow_(bp, headers, createVals, basket, bpSheetNick || nick);
  }
  var surveyItem = null;
  if (needSurvey) {
    try {
      var sync = syncBpStageSurveys_(crmSs, bpSheetNick || nick, status, {
        surveyBp2Due: (surveyKind !== "final" && status !== "ФИНАЛ") ? surveyDate : (json.surveyBp2Due || ""),
        surveyFinalDue: (surveyKind === "final" || status === "ФИНАЛ") ? surveyDate : (json.surveyFinalDue || ""),
        ownerTelegramId: ownerTelegramId,
        ownerName: ownerName,
        subId: String(json.subId || "").trim(),
        note: noteField || "from_ensureBp",
        matchKey: clientMatchKey_(bpSheetNick || nick) || clientMatchKey_(nick) || "",
        forceDue: true
      });
      surveyItem = sync && sync.survey ? sync.survey : null;
      if (sync && sync.due) {
        var meta2 = {};
        if (status === "ФИНАЛ" || surveyKind === "final") meta2.surveyFinalDue = sync.due;
        else meta2.surveyBp2Due = sync.due;
        wishes = stampBpMetaIntoWishes_(wishes, meta2);
        if (createCard && up.row) {
          try { bp.getRange(up.row, 5).setValue(wishes); } catch (eW) {}
        }
      }
    } catch (eSv) {}
  }
  try {
    var addr = String(json.address || "").trim();
    var phone = String(json.phone || "").trim();
    var displayName = String(json.displayName || "").trim();
    var matchNick = extractInstagramNick_(nick) || nick;
    if (addr || phone || noteField || displayName) {
      var contacts = findSheetByBaseName_(crmSs, "Контакты");
      if (contacts && contacts.getLastRow() >= 1) {
        var cd = contacts.getDataRange().getValues();
        var foundC = false;
        for (var cr = 1; cr < cd.length; cr++) {
          if (!nicksMatch_(cd[cr][0], matchNick) && !nicksMatch_(cd[cr][0], nick)) continue;
          if (displayName) contacts.getRange(cr + 1, 2).setValue(displayName);
          if (addr) contacts.getRange(cr + 1, 4).setValue(addr);
          if (phone) contacts.getRange(cr + 1, 5).setValue(phone);
          if (noteField || wishes) contacts.getRange(cr + 1, 7).setValue(noteField || wishes);
          foundC = true;
          break;
        }
        if (!foundC) {
          contacts.appendRow([matchNick, displayName, "", addr, phone, "", noteField || wishes]);
        }
      }
    }
  } catch (eC) {}
  try { clearCrmSheetCache_("БП"); clearCrmSheetCache_("Контакты"); clearCrmSheetCache_("Опросник"); } catch (eClr) {}
  var ok = {
    status: "success",
    nick: nick,
    sheet: "БП",
    row: up.row || 0,
    created: !!up.created,
    wishes: wishes,
    ppStatus: status,
    stage: status,
    surveyKind: surveyKind || "",
    surveyDate: surveyDate || "",
    ownerTelegramId: ownerTelegramId,
    ownerName: ownerName,
    survey: surveyItem
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleListBpIdle(json, callback, fromPost) {
  var crmSs;
  try { crmSs = getCrmSpreadsheet_(); } catch (e) {
    var bad = { status: "error", message: "crm_unavailable", detail: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var bp = findSheetByBaseName_(crmSs, "БП");
  if (!bp) {
    var no = { status: "error", message: "bp_sheet_missing" };
    return fromPost ? jsonpText(callback, no) : jsonp(callback, no);
  }
  var days = Number(json && json.days) || 7;
  if (days < 1) days = 7;
  var cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  var data = bp.getDataRange().getValues();
  var list = [];
  for (var r = 2; r < data.length; r++) {
    var nickRaw = String(data[r][0] || "").trim();
    if (!nickRaw) continue;
    if (/^себестоим/i.test(nickRaw) || /^стоимость\s*100/i.test(nickRaw)) continue;
    var status = String(data[r][3] || "").trim();
    if (!/^БП2$/i.test(status) && String(status).toUpperCase().indexOf("БП2") < 0) continue;
    var wishes = String(data[r][4] || "");
    var meta = parseBpMetaFromWishes_(wishes);
    var touchMs = 0;
    if (meta.lastTouch) {
      var td = new Date(meta.lastTouch);
      if (!isNaN(td.getTime())) touchMs = td.getTime();
    }
    if (touchMs && touchMs > cutoff) continue;
    list.push({
      nick: extractInstagramNick_(nickRaw) || nickRaw,
      label: nickRaw,
      subId: String(data[r][1] || "").trim(),
      status: status,
      stage: status,
      wishes: wishes,
      surveyBp2Due: meta.surveyBp2Due,
      surveyFinalDue: meta.surveyFinalDue,
      lastTouch: meta.lastTouch || "",
      rowIndex: r + 1,
      sheet: "БП"
    });
  }
  var ok = { status: "success", idle: list, count: list.length, days: days };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleCloseAllOpenDeficits(json, callback, fromPost) {
  var tid = String(json.telegramId || "").trim();
  if (!actorIsOwner_(tid)) {
    var forbid = { status: "error", message: "owner_only" };
    return fromPost ? jsonpText(callback, forbid) : jsonp(callback, forbid);
  }
  var sh = getDeficitSheet_();
  var data = sh.getDataRange().getValues();
  var n = 0;
  for (var i = 1; i < data.length; i++) {
    if (!isOpenDeficitStatus_(data[i][4])) continue;
    sh.getRange(i + 1, 5).setValue("closed");
    sh.getRange(i + 1, 8).setValue(new Date());
    n++;
  }
  var ok = { status: "success", closed: n };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function ensureBpAndSurveyFromOrder_(json) {
  if (String(json.orderType || "") !== "bp") return;
  var survey = json.survey || {};
  if (typeof survey === "string" && String(survey).trim()) {
    try { survey = JSON.parse(survey); } catch (eJ) { survey = {}; }
  }
  if (!survey || typeof survey !== "object") survey = {};
  var createCard = survey.createCard === true || survey.createCard === "1" || survey.createCard === 1;
  if (!createCard) return;

  var crmSs = getCrmSpreadsheet_();
  var nick = String(json.client || "").trim();
  if (!nick) return;
  var status = normalizeBpStage_(survey.status || survey.stage || "БП1");
  var needSurveyOff = survey.needSurvey === false || survey.needSurvey === "0" || survey.needSurvey === 0;
  var needSurvey = !needSurveyOff;
  var basket = json.basket || [];
  var due = String(survey.surveyDate || "").trim();
  if (needSurvey && !due) due = ymdPlusDays_(json.deliveryDate || json.date || "", 4);
  var kind = status === "ФИНАЛ" ? "final" : "bp2";
  if (survey.kind || survey.surveyKind) kind = normalizeSurveyKind_(survey.kind || survey.surveyKind);
  var ownerTelegramId = String(survey.ownerTelegramId || json.ownerTelegramId || "").trim();
  var ownerName = String(survey.ownerName || json.ownerName || "").trim();
  var wishes = String(json.note || "").trim();
  var meta = { lastTouch: new Date().toISOString() };
  if (needSurvey && due) {
    if (kind === "final" || status === "ФИНАЛ") meta.surveyFinalDue = due;
    else meta.surveyBp2Due = due;
  }
  if (ownerTelegramId) {
    meta.ownerTelegramId = ownerTelegramId;
    meta.ownerName = ownerName;
  }
  wishes = stampBpMetaIntoWishes_(wishes, meta);
  var bp = findSheetByBaseName_(crmSs, "БП");
  if (bp) {
    try { ensureBpSheetProductHeaders_(crmSs); } catch (eH) {}
    var headers = bp.getRange(1, 1, 1, bp.getLastColumn()).getValues()[0];
    var subId = "";
    try { subId = nextSubscriptionIdForSheet_(bp); } catch (eId) {}
    var createVals = writePpBasketToRowValues_(headers, basket, nick, subId, 1, status, wishes, null);
    try { upsertSubscriptionProductRow_(bp, headers, createVals, basket, nick); } catch (eUp) {
      var data = bp.getDataRange().getValues();
      var want = extractInstagramNick_(nick).toUpperCase();
      var found = false;
      for (var r = 2; r < data.length; r++) {
        if (extractInstagramNick_(data[r][0]).toUpperCase() === want) { found = true; break; }
      }
      if (!found) bp.appendRow([nick, "", 1, status, wishes, JSON.stringify(basket)]);
    }
  }
  if (needSurvey) {
    try {
      syncBpStageSurveys_(crmSs, nick, status, {
        surveyBp2Due: (kind !== "final" && status !== "ФИНАЛ") ? due : "",
        surveyFinalDue: (kind === "final" || status === "ФИНАЛ") ? due : "",
        ownerTelegramId: ownerTelegramId,
        ownerName: ownerName,
        note: "from_order"
      });
    } catch (eSv) {}
  }
}

/* ========== Отложенные расчёты (per telegramId) ========== */

function deferredSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return getOrCreateSheet_(ss, "Отложенное", [
    "id", "at", "telegramId", "mode", "title", "clientNick", "status", "payloadJson", "updatedAt"
  ]);
}

function deferredNewId_() {
  return "df_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Europe/Minsk", "yyyyMMddHHmmss") +
    "_" + String(Math.floor(Math.random() * 1e6));
}

function handleDeferredAction_(action, json, callback, fromPost) {
  var tid = String(json.telegramId || "").trim();
  if (!tid) {
    var need = { status: "error", message: "need_telegramId" };
    return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
  }
  if (action === "listDeferred") return handleListDeferred_(json, callback, fromPost);
  if (action === "saveDeferred") return handleSaveDeferred_(json, callback, fromPost);
  if (action === "updateDeferred") return handleUpdateDeferred_(json, callback, fromPost);
  if (action === "cancelDeferred") return handleCancelDeferred_(json, callback, fromPost);
  if (action === "enrollDeferredToPp") return handleEnrollDeferredToPp_(json, callback, fromPost);
  if (action === "setDeferredReminder") return handleSetDeferredReminder_(json, callback, fromPost);
  if (action === "notifyMissedDelivery") return handleNotifyMissedDelivery_(json, callback, fromPost);
  if (action === "getTransferTask") return handleGetTransferTask_(json, callback, fromPost);
  var bad = { status: "unknown_action" };
  return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
}

function handleListDeferred_(json, callback, fromPost) {
  var tid = String(json.telegramId || "").trim();
  var wantStatus = String(json.status || "open").trim().toLowerCase();
  var light = !(json.light === false || json.light === "0" || json.light === 0);
  var cacheKey = "DEF:" + tid + ":" + wantStatus + (light ? ":L" : "") + ":T2";
  var cached = cacheGetJson_(cacheKey);
  if (cached && cached.status === "success") {
    return fromPost ? jsonpText(callback, cached) : jsonp(callback, cached);
  }
  var sh = deferredSheet_();
  var data = sh.getDataRange().getValues();
  var items = [];
  var openN = 0;
  for (var r = 1; r < data.length; r++) {
    var ownerTid = String(data[r][2] || "").trim();
    var payloadFull = {};
    try { payloadFull = JSON.parse(String(data[r][7] || "{}")); } catch (e) { payloadFull = {}; }
    if (!payloadFull || typeof payloadFull !== "object") payloadFull = {};
    var targetTid = String(payloadFull.targetTelegramId || payloadFull.forTelegramId || "").trim();
    var modeRow = String(data[r][3] || "").trim().toLowerCase();
    var visible = (ownerTid === tid) || (targetTid && targetTid === tid);
    // переносы (не получил доставку) — видят manager/owner
    if (!visible && (modeRow === "transfer" || modeRow === "buy")) {
      try {
        var acc = findAccessById_(tid);
        var role = acc ? String(acc.role || "").toLowerCase() : "";
        if (role === "owner" || role === "manager" || role === "all" || role === "logistics" || isOwnerId_(tid)) visible = true;
      } catch (eVis) {}
    }
    if (!visible) continue;
    var st = String(data[r][6] || "open").trim().toLowerCase();
    if (st === "open") openN++;
    if (wantStatus && wantStatus !== "all" && st !== wantStatus) continue;
    var payload = payloadFull;
    if (light && payload && typeof payload === "object") {
      if (String(data[r][3] || "").toLowerCase() === "transfer") {
        payload = {
          mode: "transfer",
          reason: payload.reason || "",
          day: payload.day || "",
          date: payload.date || "",
          dateIso: payload.dateIso || "",
          segment: payload.segment || "",
          matchKey: payload.matchKey || "",
          basket: payload.basket || [],
          client: payload.client || "",
          createdBy: payload.createdBy || ownerTid,
          createdByName: payload.createdByName || ""
        };
      } else if (String(data[r][3] || "").toLowerCase() === "buy") {
        payload = {
          mode: "buy",
          row: payload.row || 0,
          name: payload.name || "",
          needRaw: payload.needRaw,
          available: payload.available,
          deficit: payload.deficit,
          unit: payload.unit || "кг",
          urgent: true,
          byDay: payload.byDay || []
        };
      } else {
      payload = {
        mode: payload.mode,
        baskets: payload.baskets || null,
        dogCount: payload.dogCount || 1,
        activeDog: payload.activeDog || 1,
        packCounts: payload.packCounts || null,
        note: payload.note || "",
        deliveriesN: payload.deliveriesN || 1,
        coef: payload.coef,
        fracRates: payload.fracRates || null,
        subTotal: payload.subTotal,
        retailTotal: payload.retailTotal,
        lastMessage: "",
        remindAt: payload.remindAt || "",
        remindAtMs: payload.remindAtMs || "",
        remindSent: !!payload.remindSent,
        targetTelegramId: payload.targetTelegramId || payload.forTelegramId || "",
        targetName: payload.targetName || "",
        createdBy: payload.createdBy || ownerTid,
        createdByName: payload.createdByName || ""
      };
      }
    }
    items.push({
      id: String(data[r][0] || ""),
      at: data[r][1],
      telegramId: ownerTid,
      mode: String(data[r][3] || ""),
      title: String(data[r][4] || ""),
      clientNick: String(data[r][5] || ""),
      status: st,
      payload: payload,
      remindAt: (payload && payload.remindAt) ? String(payload.remindAt) : "",
      remindAtMs: (payload && payload.remindAtMs) ? Number(payload.remindAtMs) : 0,
      remindSent: !!(payload && payload.remindSent),
      targetTelegramId: (payload && (payload.targetTelegramId || payload.forTelegramId))
        ? String(payload.targetTelegramId || payload.forTelegramId)
        : "",
      targetName: (payload && payload.targetName) ? String(payload.targetName) : "",
      createdBy: (payload && payload.createdBy) ? String(payload.createdBy) : ownerTid,
      createdByName: (payload && payload.createdByName) ? String(payload.createdByName) : "",
      updatedAt: data[r][8],
      row: r + 1
    });
  }
  items.reverse();
  var ok = { status: "success", items: items, openCount: openN, light: light };
  cachePutJson_(cacheKey, ok, 30);
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleSaveDeferred_(json, callback, fromPost) {
  var tid = String(json.telegramId || "").trim();
  var sh = deferredSheet_();
  var id = String(json.id || "").trim() || deferredNewId_();
  var mode = String(json.mode || "pp").trim().toLowerCase();
  if (mode !== "retail" && mode !== "remind" && mode !== "order" && mode !== "buy" && mode !== "transfer") mode = "pp";
  var title = String(json.title || "").trim();
  var nick = String(json.clientNick || json.client || "").trim();
  if (mode === "order" && !title) {
    title = "Заказ" + (nick ? (" · " + nick) : "");
  }
  var payloadObj = null;
  var payload = json.payload;
  if (payload && typeof payload === "object") {
    payloadObj = payload;
    try { payload = JSON.stringify(payload); } catch (e) { payload = "{}"; payloadObj = {}; }
  } else {
    payload = String(payload || "{}");
    try { payloadObj = JSON.parse(payload); } catch (e2) { payloadObj = {}; }
  }
  if (mode === "remind") {
    if (!title) {
      var needTitle = { status: "error", message: "need_title" };
      return fromPost ? jsonpText(callback, needTitle) : jsonp(callback, needTitle);
    }
    if (!payloadObj || typeof payloadObj !== "object") payloadObj = {};
    var msIn = Number(json.remindAtMs != null ? json.remindAtMs : payloadObj.remindAtMs);
    var when = null;
    if (isFinite(msIn) && msIn > 0) {
      when = new Date(msIn);
    } else {
      when = parseDeferredRemindAt_(json.remindAt || payloadObj.remindAt);
    }
    if (!when || isNaN(when.getTime())) {
      var needAt = { status: "error", message: "need_remindAt" };
      return fromPost ? jsonpText(callback, needAt) : jsonp(callback, needAt);
    }
    payloadObj.remindAtMs = when.getTime();
    payloadObj.remindAt = Utilities.formatDate(when, "GMT", "yyyy-MM-dd'T'HH:mm:ss'Z'");
    payloadObj.remindSent = false;
    delete payloadObj.remindSentAt;
    delete payloadObj.remindSendError;
    delete payloadObj.remindFailCount;
    var targetTid = String(
      json.targetTelegramId || json.forTelegramId ||
      payloadObj.targetTelegramId || payloadObj.forTelegramId || tid
    ).trim() || tid;
    var targetName = String(
      json.targetName || payloadObj.targetName || ""
    ).trim();
    var createdByName = String(json.createdByName || payloadObj.createdByName || "").trim();
    if (!createdByName) {
      try { createdByName = remindPersonLabel_(tid, ""); } catch (eCb) {}
    }
    payloadObj.targetTelegramId = targetTid;
    payloadObj.forTelegramId = targetTid;
    payloadObj.targetName = targetName || (targetTid === tid ? "себе" : remindPersonLabel_(targetTid, ""));
    payloadObj.createdBy = tid;
    payloadObj.createdByName = createdByName;
    payload = JSON.stringify(payloadObj);
    // подтверждение только создателю (цель получит одно сообщение в срок — без дубля «поставлено»)
    try {
      var whenLabel = Utilities.formatDate(when, Session.getScriptTimeZone() || "Europe/Minsk", "dd.MM HH:mm") +
        " (по времени таблицы / Минск)";
      var toLabelAck = remindPersonLabel_(targetTid, targetName);
      var ack =
        "⏰ Напоминание поставлено\n" +
        title +
        "\nКогда: " + whenLabel +
        "\nКому: " + (targetTid === tid ? "себе" : toLabelAck);
      telegramSendText_(tid, ack);
    } catch (eAck) {}
  } else if (payloadObj && typeof payloadObj === "object") {
    // опциональное напоминание к «На потом» / «В отложенное» (mode order|pp|retail)
    var msOpt = Number(json.remindAtMs != null ? json.remindAtMs : payloadObj.remindAtMs);
    var whenOpt = null;
    if (isFinite(msOpt) && msOpt > 0) whenOpt = new Date(msOpt);
    else whenOpt = parseDeferredRemindAt_(json.remindAt || payloadObj.remindAt);
    if (whenOpt && !isNaN(whenOpt.getTime())) {
      payloadObj.remindAtMs = whenOpt.getTime();
      payloadObj.remindAt = Utilities.formatDate(whenOpt, "GMT", "yyyy-MM-dd'T'HH:mm:ss'Z'");
      payloadObj.remindSent = false;
      delete payloadObj.remindSentAt;
      delete payloadObj.remindSendError;
      delete payloadObj.remindFailCount;
      if (!payloadObj.createdBy) payloadObj.createdBy = tid;
      if (!payloadObj.targetTelegramId && !payloadObj.forTelegramId) {
        payloadObj.targetTelegramId = tid;
        payloadObj.forTelegramId = tid;
      }
      payload = JSON.stringify(payloadObj);
    }
  }
  if (!title) {
    title = (mode === "retail" ? "Розница" : "ПП") + (nick ? (" · " + nick) : "");
  }
  var now = new Date();
  var data = sh.getDataRange().getValues();
  var targetForCache = "";
  var hasRemind = false;
  try {
    var po = JSON.parse(String(payload || "{}"));
    targetForCache = String(po.targetTelegramId || po.forTelegramId || "").trim();
    hasRemind = !!(po.remindAtMs || po.remindAt);
  } catch (ePo) {}
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]) === id && String(data[r][2]).trim() === tid) {
      // getRange(row, col, numRows, numColumns) — НЕ endRow/endCol
      sh.getRange(r + 1, 4, 1, 6).setValues([[mode, title, nick, "open", payload, now]]);
      bustDeferredCache_(tid);
      if (targetForCache && targetForCache !== tid) bustDeferredCache_(targetForCache);
      if (mode === "remind" || hasRemind) {
        try { ensureDeferredRemindTrigger_(); } catch (eTr) {}
      }
      var upd = { status: "success", id: id, updated: true, mode: mode };
      return fromPost ? jsonpText(callback, upd) : jsonp(callback, upd);
    }
  }
  sh.appendRow([id, now, tid, mode, title, nick, "open", payload, now]);
  bustDeferredCache_(tid);
  if (targetForCache && targetForCache !== tid) bustDeferredCache_(targetForCache);
  if (mode === "remind" || hasRemind) {
    try { ensureDeferredRemindTrigger_(); } catch (eTr2) {}
  }
  var ok = { status: "success", id: id, created: true, mode: mode };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleUpdateDeferred_(json, callback, fromPost) {
  var tid = String(json.telegramId || "").trim();
  var id = String(json.id || "").trim();
  if (!id) {
    var bad = { status: "error", message: "need_id" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var sh = deferredSheet_();
  var data = sh.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0] || "").trim() !== id) continue;
    var ownerTid = String(data[r][2] || "").trim();
    var payloadObj = {};
    try { payloadObj = JSON.parse(String(data[r][7] || "{}")); } catch (eP) { payloadObj = {}; }
    var targetTid = String((payloadObj && (payloadObj.targetTelegramId || payloadObj.forTelegramId)) || "").trim();
    if (ownerTid !== tid && targetTid !== tid) continue;
    var mode = json.mode != null ? String(json.mode) : String(data[r][3] || "pp");
    var title = json.title != null ? String(json.title) : String(data[r][4] || "");
    var nick = json.clientNick != null ? String(json.clientNick) : String(data[r][5] || "");
    var st = json.status != null ? String(json.status) : String(data[r][6] || "open");
    var payload = data[r][7];
    if (json.payload != null) {
      payload = typeof json.payload === "object" ? JSON.stringify(json.payload) : String(json.payload);
    }
    // getRange(row, col, numRows, numColumns)
    sh.getRange(r + 1, 4, 1, 6).setValues([[mode, title, nick, st, payload, new Date()]]);
    bustDeferredCache_(ownerTid);
    if (targetTid && targetTid !== ownerTid) bustDeferredCache_(targetTid);
    if (tid !== ownerTid && tid !== targetTid) bustDeferredCache_(tid);
    var ok = { status: "success", id: id };
    return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
  }
  var miss = { status: "error", message: "not_found" };
  return fromPost ? jsonpText(callback, miss) : jsonp(callback, miss);
}

/** Удалить строку отложенного / напоминалки (не просто status=cancelled). */
function handleCancelDeferred_(json, callback, fromPost) {
  var tid = String(json.telegramId || "").trim();
  var id = String(json.id || "").trim();
  if (!id) {
    var bad = { status: "error", message: "need_id" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  // локальный optimistic id с фронта — нечего удалять на сервере
  if (id.indexOf("local_") === 0) {
    var localOk = { status: "success", id: id, local: true };
    return fromPost ? jsonpText(callback, localOk) : jsonp(callback, localOk);
  }
  var sh = deferredSheet_();
  var data = sh.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0] || "").trim() !== id) continue;
    var ownerTid = String(data[r][2] || "").trim();
    var payloadObj = {};
    try { payloadObj = JSON.parse(String(data[r][7] || "{}")); } catch (eP) { payloadObj = {}; }
    var targetTid = String((payloadObj && (payloadObj.targetTelegramId || payloadObj.forTelegramId)) || "").trim();
    var modeRow = String(data[r][3] || "").trim().toLowerCase();
    var canCancel = (ownerTid === tid) || (targetTid && targetTid === tid);
    if (!canCancel && modeRow === "transfer") {
      try {
        var accC = findAccessById_(tid);
        var roleC = accC ? String(accC.role || "").toLowerCase() : "";
        if (roleC === "owner" || roleC === "manager" || roleC === "all" || isOwnerId_(tid)) canCancel = true;
      } catch (eCan) {}
    }
    if (!canCancel) continue;
    try {
      sh.deleteRow(r + 1);
    } catch (eDel) {
      // fallback: пометить cancelled корректным getRange
      try {
        sh.getRange(r + 1, 7, 1, 1).setValue("cancelled");
        sh.getRange(r + 1, 9, 1, 1).setValue(new Date());
      } catch (eMark) {
        var fail = { status: "error", message: "delete_failed", detail: String(eDel) };
        return fromPost ? jsonpText(callback, fail) : jsonp(callback, fail);
      }
    }
    bustDeferredCache_(ownerTid);
    if (targetTid && targetTid !== ownerTid) bustDeferredCache_(targetTid);
    bustDeferredCache_(tid);
    var ok = { status: "success", id: id, deleted: true };
    return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
  }
  var miss = { status: "error", message: "not_found" };
  return fromPost ? jsonpText(callback, miss) : jsonp(callback, miss);
}

/** Курьер: клиент сегодня не получил → задача «перенос» менеджеру. */
function handleNotifyMissedDelivery_(json, callback, fromPost) {
  var tid = String(json.telegramId || "").trim();
  var client = String(json.client || json.nick || "").trim();
  if (!client) {
    var need = { status: "error", message: "need_client" };
    return fromPost ? jsonpText(callback, need) : jsonp(callback, need);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone() || "Europe/Minsk";
  var day = String(json.day || "").trim();
  var dateValue = null;
  if (json.date) dateValue = parseFlexibleDate_(json.date, tz);
  if (!dateValue && day) dateValue = getDayDate_(ss, day);
  if (!dateValue) dateValue = new Date();
  var dateText = formatSheetDate(dateValue, tz);
  var dateIso = Utilities.formatDate(dateValue, tz, "yyyy-MM-dd");
  var reason = String(json.reason || "").trim() || "не получил";
  var segment = String(json.segment || "").trim();
  var matchKey = String(json.matchKey || "").trim() || clientMatchKey_(client) || "";
  var basket = [];
  if (json.basket) {
    if (typeof json.basket === "string") {
      try { basket = JSON.parse(json.basket); } catch (eB) { basket = []; }
    } else if (Array.isArray(json.basket)) basket = json.basket;
  }
  if (!basket.length && day) {
    try {
      var data = getClientsData_(ss, day);
      for (var i = 0; i < (data.clients || []).length; i++) {
        if (nicksMatch_(data.clients[i].name, client)) {
          basket = data.clients[i].basket || [];
          if (!segment) segment = data.clients[i].segment || "";
          break;
        }
      }
    } catch (eG) {}
  }
  if (!segment) {
    try {
      var cal = readCalendarForDate_(ss, dateValue) || [];
      for (var c = 0; c < cal.length; c++) {
        if (nicksMatch_(cal[c].client, client) || (matchKey && cal[c].matchKey === matchKey)) {
          segment = cal[c].segment || segment;
          if (!basket.length) basket = cal[c].basket || [];
          break;
        }
      }
    } catch (eC) {}
  }

  var id = deferredNewId_();
  var creatorName = String(json.createdByName || "").trim();
  if (!creatorName) {
    try { creatorName = remindPersonLabel_(tid, ""); } catch (eN) {}
  }
  var title = "Перенос · не получил";
  var payloadObj = {
    mode: "transfer",
    reason: reason,
    day: day,
    date: dateText,
    dateIso: dateIso,
    segment: segment,
    matchKey: matchKey,
    basket: basket.slice(0, 80),
    createdBy: tid,
    createdByName: creatorName,
    client: client
  };
  var sh = deferredSheet_();
  var now = new Date();
  sh.appendRow([id, now, tid, "transfer", title, client, "open", JSON.stringify(payloadObj), now]);
  bustDeferredCache_(tid);
  try {
    var mgrs = collectStaffTelegramIds_(["owner", "manager", "all"]);
    for (var m = 0; m < mgrs.length; m++) bustDeferredCache_(mgrs[m]);
  } catch (eB) {}

  var weekCounts = [];
  try { weekCounts = buildWeekDayCountsItems_(ss); } catch (eW2) {}

  var basketPreview = (basket || []).slice(0, 8).map(function (x) {
    var nm = String(x.name || x.main || "").trim();
    var v = x.val != null ? x.val : x.value;
    return nm ? (nm + (v != null && v !== "" ? (" " + v) : "")) : "";
  }).filter(Boolean);

  var text =
    "🚚 Не получил доставку\n" +
    "Клиент: " + client + "\n" +
    "Тип: " + (segment || "—") + "\n" +
    "День: " + (day || dateText) + " · " + dateText + "\n" +
    "Причина: " + reason + "\n" +
    (creatorName ? ("От курьера: " + creatorName + "\n") : "") +
    (basketPreview.length ? ("Состав: " + basketPreview.join(", ") + "\n") : "") +
    "\nОткрой Переносы в мини-аппе и перенеси клиента.";

  var appUrl = miniAppPublicUrl_() + "?xfer=" + encodeURIComponent(id) + "&v=71131";
  var markup = {
    inline_keyboard: [[{
      text: "📂 Открыть перенос",
      web_app: { url: appUrl }
    }]]
  };
  var ids = collectStaffTelegramIds_(["owner", "manager", "all"]);
  try {
    var owners = getOwnerTelegramIds_();
    for (var o = 0; o < owners.length; o++) {
      if (owners[o] && ids.indexOf(String(owners[o])) < 0) ids.push(String(owners[o]));
    }
  } catch (eO) {}
  var sent = 0;
  for (var n = 0; n < ids.length; n++) {
    if (tid && String(ids[n]) === tid) continue;
    try {
      var res = telegramSendMarkup_(ids[n], text, markup);
      if (res && res.ok) sent++;
    } catch (eS) {}
  }

  var okOut = {
    status: "success",
    id: id,
    client: client,
    notified: sent,
    weekCounts: weekCounts
  };
  return fromPost ? jsonpText(callback, okOut) : jsonp(callback, okOut);
}

function buildWeekDayCountsItems_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var days = [
    { day: "Понедельник", short: "Пн" },
    { day: "Вторник", short: "Вт" },
    { day: "Среда", short: "Ср" },
    { day: "Четверг", short: "Чт" },
    { day: "Пятница", short: "Пт" },
    { day: "Суббота", short: "Сб" },
    { day: "Воскресенье", short: "Вс" },
    { day: "Будущая неделя", short: "Буд" }
  ];
  var items = [];
  for (var i = 0; i < days.length; i++) {
    var row = countClientsOnDayNickRow_(ss, days[i].day);
    items.push({
      day: days[i].day,
      short: days[i].short,
      count: row.count || 0,
      date: row.date || ""
    });
  }
  return items;
}

function handleGetTransferTask_(json, callback, fromPost) {
  var tid = String(json.telegramId || "").trim();
  var id = String(json.id || "").trim();
  if (!id) {
    var bad = { status: "error", message: "need_id" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var sh = deferredSheet_();
  var data = sh.getDataRange().getValues();
  var item = null;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0] || "").trim() !== id) continue;
    var mode = String(data[r][3] || "").toLowerCase();
    var st = String(data[r][6] || "open").toLowerCase();
    var payload = {};
    try { payload = JSON.parse(String(data[r][7] || "{}")); } catch (e) { payload = {}; }
    var ownerTid = String(data[r][2] || "").trim();
    var can = ownerTid === tid;
    if (!can && mode === "transfer") {
      try {
        var acc = findAccessById_(tid);
        var role = acc ? String(acc.role || "").toLowerCase() : "";
        if (role === "owner" || role === "manager" || role === "all" || isOwnerId_(tid)) can = true;
      } catch (eA) {}
    }
    if (!can) continue;
    item = {
      id: id,
      mode: mode,
      title: String(data[r][4] || ""),
      clientNick: String(data[r][5] || ""),
      status: st,
      payload: payload,
      at: data[r][1]
    };
    break;
  }
  if (!item) {
    var miss2 = { status: "error", message: "not_found" };
    return fromPost ? jsonpText(callback, miss2) : jsonp(callback, miss2);
  }
  var weekCounts = [];
  try { weekCounts = buildWeekDayCountsItems_(); } catch (eW) {}
  var ok = {
    status: "success",
    item: item,
    weekCounts: weekCounts
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function parseDeferredRemindAt_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" && isFinite(v) && v > 0) {
    var dn = new Date(v);
    return isNaN(dn.getTime()) ? null : dn;
  }
  var s = String(v || "").trim();
  if (!s) return null;
  // абсолютное UTC / с offset
  if (/Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    var dAbs = new Date(s);
    return isNaN(dAbs.getTime()) ? null : dAbs;
  }
  // naive: трактуем как время скрипта (старые записи)
  var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    return new Date(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4]), Number(m[5]), Number(m[6] || 0), 0
    );
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function remindDueMs_(payload) {
  if (!payload) return 0;
  var ms = Number(payload.remindAtMs);
  if (isFinite(ms) && ms > 0) return ms;
  var when = parseDeferredRemindAt_(payload.remindAt);
  return when ? when.getTime() : 0;
}

function formatDeferredRemindAtIso_(d) {
  return Utilities.formatDate(d, "GMT", "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

/** Имя для TG: лист Доступы → fallback из payload. */
function remindPersonLabel_(tid, fallbackName) {
  var id = String(tid || "").trim();
  var fb = String(fallbackName || "").trim();
  if (fb && (fb === "себе" || fb.toLowerCase() === "self")) fb = "";
  try {
    if (id) {
      var row = findAccessById_(id);
      if (row) {
        var nm = String(row.name || "").trim();
        var un = String(row.username || "").trim();
        if (nm && un) return nm + " (@" + un + ")";
        if (nm) return nm;
        if (un) return "@" + un;
      }
    }
  } catch (eLab) {}
  return fb || id || "—";
}

function ensureDeferredRemindTrigger_() {
  var props = PropertiesService.getScriptProperties();
  var ver = "";
  try { ver = String(props.getProperty("DEF_REMIND_TRIG_V") || ""); } catch (eP) {}
  var triggers = ScriptApp.getProjectTriggers();
  var remindTriggers = [];
  var i;
  for (i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "tickDeferredReminders_") {
      remindTriggers.push(triggers[i]);
    }
  }
  // ровно один триггер; лишние — причина двойных сообщений
  if (remindTriggers.length === 1 && ver === "1m-v2") return;
  for (i = 0; i < remindTriggers.length; i++) {
    try { ScriptApp.deleteTrigger(remindTriggers[i]); } catch (eDel) {}
  }
  ScriptApp.newTrigger("tickDeferredReminders_").timeBased().everyMinutes(1).create();
  try { props.setProperty("DEF_REMIND_TRIG_V", "1m-v2"); } catch (eS) {}
}

function handleSetDeferredReminder_(json, callback, fromPost) {
  var tid = String(json.telegramId || "").trim();
  var id = String(json.id || "").trim();
  if (!id) {
    var bad = { status: "error", message: "need_id" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var msIn = Number(json.remindAtMs);
  var when = (isFinite(msIn) && msIn > 0) ? new Date(msIn) : parseDeferredRemindAt_(json.remindAt);
  if (!when || isNaN(when.getTime())) {
    var badAt = { status: "error", message: "need_remindAt" };
    return fromPost ? jsonpText(callback, badAt) : jsonp(callback, badAt);
  }
  var sh = deferredSheet_();
  var data = sh.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]) !== id) continue;
    var ownerTid = String(data[r][2] || "").trim();
    var payload = {};
    try { payload = JSON.parse(String(data[r][7] || "{}")); } catch (e) { payload = {}; }
    var targetTid = String((payload && (payload.targetTelegramId || payload.forTelegramId)) || "").trim();
    if (ownerTid !== tid && targetTid !== tid) continue;
    var st = String(data[r][6] || "open").trim().toLowerCase();
    if (st !== "open") {
      var closed = { status: "error", message: "not_open" };
      return fromPost ? jsonpText(callback, closed) : jsonp(callback, closed);
    }
    if (!payload || typeof payload !== "object") payload = {};
    payload.remindAtMs = when.getTime();
    payload.remindAt = formatDeferredRemindAtIso_(when);
    payload.remindSent = false;
    delete payload.remindSentAt;
    delete payload.remindSendError;
    delete payload.remindFailCount;
    sh.getRange(r + 1, 8, 1, 2).setValues([[JSON.stringify(payload), new Date()]]);
    bustDeferredCache_(ownerTid);
    if (targetTid && targetTid !== ownerTid) bustDeferredCache_(targetTid);
    try { ensureDeferredRemindTrigger_(); } catch (eTr) {}
    var ok = { status: "success", id: id, remindAt: payload.remindAt, remindAtMs: payload.remindAtMs };
    return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
  }
  var miss = { status: "error", message: "not_found" };
  return fromPost ? jsonpText(callback, miss) : jsonp(callback, miss);
}

/** Раз в ~1 мин: отправить TG-напоминания (абсолютное время remindAtMs). */
function tickDeferredReminders_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return;
  try {
    try { ensureDeferredRemindTrigger_(); } catch (eEns) {}
    var sh = deferredSheet_();
    var data = sh.getDataRange().getValues();
    var nowMs = Date.now();
    var changedTids = {};
    for (var r = 1; r < data.length; r++) {
      var st = String(data[r][6] || "open").trim().toLowerCase();
      if (st !== "open") continue;
      var payload = {};
      try { payload = JSON.parse(String(data[r][7] || "{}")); } catch (e) { payload = {}; }
      if (!payload) continue;
      var dueMs = remindDueMs_(payload);
      if (!dueMs || dueMs > nowMs) continue;
      if (payload.remindSent && !payload.remindSendError) continue;
      var fails = Number(payload.remindFailCount) || 0;
      if (fails >= 12) continue;
      var ownerTid = String(data[r][2] || "").trim();
      var title = String(data[r][4] || "Отложенное").trim();
      var nick = String(data[r][5] || "").trim();
      var mode = String(data[r][3] || "").trim().toLowerCase();
      var fromTid = String(payload.createdBy || ownerTid).trim() || ownerTid;
      var notifyTid = String(payload.targetTelegramId || payload.forTelegramId || ownerTid).trim() || ownerTid;
      var fromLabel = remindPersonLabel_(fromTid, payload.createdByName);
      var toLabel = remindPersonLabel_(notifyTid, payload.targetName);
      var text;
      if (mode === "remind") {
        text = "⏰ Напоминание\n" + title;
        if (fromTid && notifyTid && fromTid !== notifyTid) {
          text += "\nОт: " + fromLabel + "\nКому: " + toLabel;
        } else {
          text += "\n(себе)";
        }
        text += "\nОткрой задачи ☰ в приложении.";
      } else {
        text = "⏰ Напоминание\n" + title +
          (nick ? ("\nКлиент: " + nick) : "") +
          "\nОткрой задачи ☰ в приложении.";
      }
      // claim до отправки — иначе два триггера шлют одно и то же
      payload.remindSent = true;
      payload.remindSentAt = formatDeferredRemindAtIso_(new Date());
      delete payload.remindSendError;
      try {
        // getRange(row, col, numRows, numColumns) — НЕ endRow/endCol
        sh.getRange(r + 1, 8, 1, 2).setValues([[JSON.stringify(payload), new Date()]]);
        SpreadsheetApp.flush();
      } catch (eClaim) {
        continue;
      }
      var sentOk = false;
      if (notifyTid) {
        try {
          var res = telegramSendText_(notifyTid, text);
          sentOk = !!(res && res.ok);
        } catch (eSend) {
          sentOk = false;
        }
      }
      if (!sentOk) {
        payload.remindSent = false;
        payload.remindFailCount = fails + 1;
        payload.remindSendError = true;
        delete payload.remindSentAt;
        try {
          sh.getRange(r + 1, 8, 1, 2).setValues([[JSON.stringify(payload), new Date()]]);
        } catch (eWrite) {}
      } else {
        delete payload.remindFailCount;
        try {
          sh.getRange(r + 1, 8, 1, 2).setValues([[JSON.stringify(payload), new Date()]]);
        } catch (eOk) {}
      }
      if (ownerTid) changedTids[ownerTid] = true;
      if (notifyTid) changedTids[notifyTid] = true;
    }
    var keys = Object.keys(changedTids);
    for (var i = 0; i < keys.length; i++) {
      try { bustDeferredCache_(keys[i]); } catch (eB) {}
    }
  } finally {
    try { lock.releaseLock(); } catch (eL) {}
  }
}

function mergeBasketItemsForPp_(items) {
  var map = {};
  var out = [];
  for (var i = 0; i < (items || []).length; i++) {
    var it = items[i] || {};
    var name = String(it.main || it.name || "").trim();
    if (!name) continue;
    var sub = String(it.sub || "").trim();
    var cat = String(it.cat || "").trim();
    var key = cat + "|" + name.toUpperCase() + "|" + sub.toUpperCase();
    var val = Number(it.val != null ? it.val : it.value) || 0;
    if (val <= 0) continue;
    if (!map[key]) {
      map[key] = { cat: cat, main: name, name: name, sub: sub, val: 0, value: 0 };
      out.push(map[key]);
    }
    map[key].val += val;
    map[key].value += val;
  }
  return out;
}

function writePpBasketToRowValues_(headers, basket, nick, subId, deliveriesN, status, wishes, factCost, packCountsOpt) {
  var row = [];
  var i;
  for (i = 0; i < headers.length; i++) row.push("");
  row[0] = nick;
  if (headers.length > 1) row[1] = subId || "";
  if (headers.length > 2) row[2] = deliveriesN || 1;
  if (headers.length > 3) row[3] = status || "ПП1";
  if (headers.length > 4) row[4] = wishes || "";
  for (var b = 0; b < (basket || []).length; b++) {
    var it = basket[b];
    var iname = String(it.main || it.name || "").trim().toUpperCase().replace(/Ё/g, "Е");
    var isub = String(it.sub || "").trim().toUpperCase().replace(/Ё/g, "Е");
    var val = Number(it.val != null ? it.val : it.value) || 0;
    if (!iname || val <= 0) continue;
    for (var c = 6; c < headers.length; c++) {
      var map = mapCrmHeaderToItem_(headers[c]);
      if (!map) continue;
      var mname = String(map.name || "").toUpperCase().replace(/Ё/g, "Е");
      var msub = String(map.sub || "").toUpperCase().replace(/Ё/g, "Е");
      if (mname !== iname) continue;
      if (msub && isub && msub !== isub) continue;
      if (msub && !isub) continue;
      if (!msub && isub) continue;
      // Корзина в граммах/шт; на листе ПП сыпучее: 1 = 100г
      var sheetVal;
      if (map.grams) {
        sheetVal = Math.round((val / 100) * 1000) / 1000;
        if (!(sheetVal > 0)) continue;
      } else {
        sheetVal = Math.round(val);
      }
      row[c] = sheetVal;
      break;
    }
  }
  if (factCost != null && factCost !== "") {
    for (var fc = 0; fc < headers.length; fc++) {
      var h = String(headers[fc] || "").toUpperCase();
      if (h.indexOf("ФАКТ") >= 0 && h.indexOf("СТОИМ") >= 0) {
        row[fc] = Number(factCost) || factCost;
        break;
      }
    }
  }
  applyPackCountsToRowValues_(headers, row, basket, packCountsOpt);
  return row;
}

function isPpMetaOrFinanceHeader_(header) {
  var h = String(header || "").replace(/\s+/g, " ").trim().toUpperCase().replace(/Ё/g, "Е");
  if (!h) return true;
  if (/^(ЛЮДИ|ID|КОЛИЧ|СТАТУС|ПОЖЕЛАН|ЗАМЕТК)/.test(h)) return true;
  if (/СЕБЕСТОИМ|СТОИМОСТ|СУММА|ЦЕНА|ИТОГ|СКИДК|ВЫХЛОП|ФАКТ|КАРМАН|ФРАК|ГРЯЗН|^У[123]$|^УП4$|^С[123]$/.test(h)) return true;
  return false;
}

/** Счётчики пакетов У1..УП4 из корзины (для листа ПП/БП).
 * У1–У3 = дойпаки; УП4 = крафт-пакеты клиента (внешняя упаковка).
 */
function packCountsUFromBasket_(basket) {
  var asm = buildAssemblyForBasket_(basket || []);
  var u1 = 0, u2 = 0, u3 = 0;
  (asm.packs || []).forEach(function (p) {
    if (p.type === 'craft' || p.counterKey === 'крафт') return;
    var bags = Number(p.bags) || 0;
    if (bags <= 0) return;
    var k = String(p.counterKey || '');
    if (k === 'маленький') u1 += bags;
    else if (k === 'средний') u2 += bags;
    else if (k === 'большой') u3 += bags;
    else if (k === 'целое') u3 += bags; // целое → как большой дойпак в У3
  });
  var up4 = Number(asm.craftBags) || 0;
  return { u1: u1, u2: u2, u3: u3, up4: up4 };
}

function applyPackCountsToRowValues_(headers, row, basket, packCountsOpt) {
  if (!headers || !row) return row;
  var pc;
  if (packCountsOpt && typeof packCountsOpt === "object") {
    pc = {
      u1: Number(packCountsOpt.u1 != null ? packCountsOpt.u1 : packCountsOpt.small) || 0,
      u2: Number(packCountsOpt.u2 != null ? packCountsOpt.u2 : packCountsOpt.medium) || 0,
      u3: Number(packCountsOpt.u3 != null ? packCountsOpt.u3 : packCountsOpt.large) || 0,
      up4: Number(packCountsOpt.up4 != null ? packCountsOpt.up4 : packCountsOpt.legs) || 0
    };
  } else {
    pc = packCountsUFromBasket_(basket || []);
  }
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || "").replace(/\s+/g, " ").trim().toUpperCase();
    if (h === "У1") row[c] = pc.u1;
    else if (h === "У2") row[c] = pc.u2;
    else if (h === "У3") row[c] = pc.u3;
    else if (h === "УП4") row[c] = pc.up4;
  }
  return row;
}

/** Колонки с формулами метрик — не затирать при обновлении карточки. */
function isPpFinancePreserveHeader_(header) {
  var h = String(header || "").replace(/\s+/g, " ").trim().toUpperCase().replace(/Ё/g, "Е");
  if (!h) return false;
  if (/^У[123]$|^УП4$|^С[123]$/.test(h)) return false;
  if (h.indexOf("ФАКТ") >= 0 && h.indexOf("СТОИМ") >= 0) return false;
  if (/^(ЛЮДИ|ID|КОЛИЧ|СТАТУС|ПОЖЕЛАН)/.test(h)) return false;
  return /СЕБЕСТОИМ|СТОИМОСТ|СУММА|ЦЕНА|ИТОГ|СКИДК|ВЫХЛОП|КАРМАН|ФРАК|ГРЯЗН|ОБЩАЯ|ОБЩИЙ/.test(h);
}

/**
 * Запись строки ПП/БП без сноса формул (ОБЩАЯ СЕБЕСТОИМОСТЬ / ВЫХЛОП / ИТОГОВАЯ…).
 * Любая ячейка с формулой — не трогаем; пустые finance-колонки — тоже.
 */
function applyPpRowValuesPreservingFormulas_(sh, row1, headers, rowVals) {
  if (!sh || !(row1 >= 2) || !headers || !rowVals) return;
  var n = Math.min(headers.length, rowVals.length);
  if (n <= 0) return;
  var formulas = sh.getRange(row1, 1, 1, n).getFormulas()[0] || [];
  for (var c = 0; c < n; c++) {
    var formula = String(formulas[c] || "");
    if (formula) continue;
    var v = rowVals[c];
    if ((v === "" || v == null) && isPpFinancePreserveHeader_(headers[c])) continue;
    if (v === null || v === undefined) continue;
    sh.getRange(row1, c + 1).setValue(v);
  }
}

/** Первая пустая строка клиента (A пусто), не хвост «себестоимость/стоимость 100». */
function findFirstEmptySubscriptionRowIndex_(sh) {
  var lastCol = Math.max(1, sh.getLastColumn());
  var lastRow = Math.max(3, sh.getLastRow());
  // смотрим с запасом вниз, но не бесконечно
  var maxScan = Math.max(lastRow + 5, 80);
  var data = sh.getRange(1, 1, maxScan, 1).getValues();
  for (var r = 2; r < data.length; r++) {
    var a = String(data[r][0] || "").trim();
    if (!a) return r; // 0-based index in sheet values starting row1 → row number = r+1
    if (/^себестоим/i.test(a) || /^стоимость\s*100/i.test(a) || /^итого/i.test(a)) break;
  }
  return -1; // append
}

function copySubscriptionFinanceFormulas_(sh, templateRow1, targetRow1) {
  if (!sh || !(templateRow1 >= 2) || !(targetRow1 >= 2) || templateRow1 === targetRow1) return;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var c = 0; c < headers.length; c++) {
    if (!isPpMetaOrFinanceHeader_(headers[c])) continue;
    // не копируем У1-УП4 формулами — пишем числами пакетов
    var h = String(headers[c] || "").trim().toUpperCase();
    if (/^У[123]$|^УП4$/.test(h)) continue;
    // мета A-F не трогаем формулами
    if (c < 6) continue;
    try {
      var f = sh.getRange(templateRow1, c + 1).getFormula();
      if (f) {
        // R1C1 relative copy
        sh.getRange(templateRow1, c + 1).copyTo(sh.getRange(targetRow1, c + 1), { contentsOnly: false });
      }
    } catch (eF) {}
  }
}

/**
 * Upsert строки ПП/БП с товарными колонками: по нику обновить, иначе первая пустая + формулы.
 * rowVals уже с составом; packs применяются здесь.
 */
function upsertSubscriptionProductRow_(sh, headers, rowVals, basket, nickForMatch) {
  headers = headers || sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  rowVals = applyPackCountsToRowValues_(headers, rowVals.slice(), basket || []);
  while (rowVals.length < headers.length) rowVals.push("");
  var data = sh.getDataRange().getValues();
  var rowIdx = -1; // 0-based in data
  for (var r = 2; r < data.length; r++) {
    var a = String(data[r][0] || "").trim();
    if (/^себестоим/i.test(a) || /^стоимость\s*100/i.test(a)) continue;
    if (nicksMatch_(data[r][0], nickForMatch) || nicksMatch_(data[r][0], rowVals[0])) {
      rowIdx = r;
      break;
    }
  }
  var templateRow1 = 3;
  for (var t = 2; t < data.length; t++) {
    if (String(data[t][0] || "").trim() && !/^себестоим/i.test(String(data[t][0] || ""))) {
      templateRow1 = t + 1;
      break;
    }
  }
  if (rowIdx >= 0) {
    applyPpRowValuesPreservingFormulas_(sh, rowIdx + 1, headers, rowVals);
    return { row: rowIdx + 1, created: false };
  }
  var emptyIdx = findFirstEmptySubscriptionRowIndex_(sh); // 0-based from getRange row1
  if (emptyIdx >= 2) {
    var target1 = emptyIdx + 1;
    sh.getRange(target1, 1, 1, headers.length).setValues([rowVals.slice(0, headers.length)]);
    copySubscriptionFinanceFormulas_(sh, templateRow1, target1);
    // restore pack numbers after formula copy
    applyPackCountsToRowValues_(headers, rowVals, basket || []);
    for (var c2 = 0; c2 < headers.length; c2++) {
      var hh = String(headers[c2] || "").trim().toUpperCase();
      if (/^У[123]$|^УП4$/.test(hh)) sh.getRange(target1, c2 + 1).setValue(rowVals[c2]);
    }
    return { row: target1, created: true };
  }
  sh.appendRow(rowVals.slice(0, headers.length));
  var newRow = sh.getLastRow();
  copySubscriptionFinanceFormulas_(sh, templateRow1, newRow);
  applyPackCountsToRowValues_(headers, rowVals, basket || []);
  for (var c3 = 0; c3 < headers.length; c3++) {
    var hh3 = String(headers[c3] || "").trim().toUpperCase();
    if (/^У[123]$|^УП4$/.test(hh3)) sh.getRange(newRow, c3 + 1).setValue(rowVals[c3]);
  }
  return { row: newRow, created: true };
}

function handleEnrollDeferredToPp_(json, callback, fromPost) {
  var tid = String(json.telegramId || "").trim();
  var id = String(json.id || "").trim();
  var nick = String(json.clientNick || json.nick || json.client || "").trim();
  if (!nick) {
    var bad = { status: "error", message: "need_nick" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var deliveriesN = Number(json.deliveriesN || json.deliveries) || 1;
  if (deliveriesN < 1) deliveriesN = 1;
  if (deliveriesN > 8) deliveriesN = 8;
  var wishes = String(json.wishes || json.note || "").trim();
  var factCost = json.factCost != null ? json.factCost : json.subTotal;
  var basket = json.basket || [];
  if ((!basket || !basket.length) && id) {
    var shDef = deferredSheet_();
    var dataDef = shDef.getDataRange().getValues();
    for (var r = 1; r < dataDef.length; r++) {
      if (String(dataDef[r][0]) === id && String(dataDef[r][2]).trim() === tid) {
        try {
          var pl = JSON.parse(String(dataDef[r][7] || "{}"));
          var items = [];
          if (pl.baskets) {
            items = (pl.baskets["1"] || []).concat(pl.dogCount >= 2 ? (pl.baskets["2"] || []) : []);
          } else if (pl.items) items = pl.items;
          basket = mergeBasketItemsForPp_(items);
          if (factCost == null && pl.subTotal != null) factCost = pl.subTotal;
          if (!wishes && pl.note) wishes = String(pl.note);
          if (!(deliveriesN > 1) && pl.deliveriesN) deliveriesN = Number(pl.deliveriesN) || 1;
        } catch (eP) {}
        break;
      }
    }
  } else {
    basket = mergeBasketItemsForPp_(basket);
  }

  var crmSs;
  try { crmSs = getCrmSpreadsheet_(); } catch (eCrm) {
    var noCrm = { status: "error", message: "crm_unavailable", detail: String(eCrm) };
    return fromPost ? jsonpText(callback, noCrm) : jsonp(callback, noCrm);
  }
  var pp = findSheetByBaseName_(crmSs, "ПП");
  if (!pp) {
    var noPp = { status: "error", message: "pp_sheet_missing" };
    return fromPost ? jsonpText(callback, noPp) : jsonp(callback, noPp);
  }
  var headers = pp.getRange(1, 1, 1, pp.getLastColumn()).getValues()[0];
  var rowVals = writePpBasketToRowValues_(headers, basket, nick, json.subId || "", deliveriesN, json.ppStatus || "ПП1", wishes, factCost);

  if (!String(rowVals[1] || "").trim()) {
    try { rowVals[1] = nextSubscriptionIdForSheet_(pp); } catch (eId) {}
  }
  var upEnroll = upsertSubscriptionProductRow_(pp, headers, rowVals, basket, nick);
  var updated = !(upEnroll && upEnroll.created);

  try {
    var addr = String(json.address || "").trim();
    var phone = String(json.phone || "").trim();
    var displayName = String(json.displayName || json.name || "").trim();
    if (addr || phone || displayName) {
      var contacts = findSheetByBaseName_(crmSs, "Контакты");
      if (contacts && contacts.getLastRow() >= 1) {
        var cd = contacts.getDataRange().getValues();
        var foundC = false;
        for (var cr = 1; cr < cd.length; cr++) {
          if (!nicksMatch_(cd[cr][0], nick)) continue;
          if (displayName) contacts.getRange(cr + 1, 2).setValue(displayName);
          if (addr) contacts.getRange(cr + 1, 4).setValue(addr);
          if (phone) contacts.getRange(cr + 1, 5).setValue(phone);
          if (wishes) contacts.getRange(cr + 1, 7).setValue(wishes);
          foundC = true;
          break;
        }
        if (!foundC) {
          contacts.appendRow([nick, displayName, "", addr, phone, "", wishes]);
        }
      }
    }
  } catch (eC) {}

  if (id) {
    try {
      var shD = deferredSheet_();
      var dAll = shD.getDataRange().getValues();
      for (var dr = 1; dr < dAll.length; dr++) {
        if (String(dAll[dr][0]) === id && String(dAll[dr][2]).trim() === tid) {
          shD.getRange(dr + 1, 6).setValue(nick);
          shD.getRange(dr + 1, 7).setValue("enrolled");
          shD.getRange(dr + 1, 9).setValue(new Date());
          break;
        }
      }
      bustDeferredCache_(tid);
    } catch (eU) {}
  }

  try {
    moveSurveysWithClient_(crmSs, nick, { toNick: nick, toSheet: "ПП" });
  } catch (eSv) {}

  var ok = {
    status: "success",
    nick: nick,
    updated: updated,
    created: !updated,
    row: upEnroll && upEnroll.row ? upEnroll.row : 0,
    basketSize: basket.length,
    deliveriesN: deliveriesN
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/* --- native GBI auth (from native/CODE_GS_NATIVE_AUTH.snippet.gs) --- */
function getTelegramBotUsername_() {
  var props = PropertiesService.getScriptProperties();
  var cached = props.getProperty("TELEGRAM_BOT_USERNAME") || "";
  if (cached) return cached;
  var token = props.getProperty("TELEGRAM_BOT_TOKEN") || "";
  if (!token) return "";
  try {
    var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getMe", {
      muteHttpExceptions: true
    });
    var body = JSON.parse(res.getContentText() || "{}");
    if (body && body.ok && body.result && body.result.username) {
      props.setProperty("TELEGRAM_BOT_USERNAME", String(body.result.username));
      return String(body.result.username);
    }
  } catch (e) {}
  return "";
}

function handleGetNativeLinkInfo(callback, fromPost) {
  var username = getTelegramBotUsername_();
  var ok = {
    status: username ? "success" : "error",
    botUsername: username,
    message: username ? "ok" : "no_bot_username"
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handlePollNativeAuth(json, callback, fromPost) {
  var token = String((json && json.token) || "").trim();
  if (!token || !/^[A-Za-z0-9_-]{6,40}$/.test(token)) {
    var bad = { status: "error", message: "bad_token", linked: false };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var raw = "";
  try {
    raw = CacheService.getScriptCache().get("native_auth_" + token) || "";
  } catch (e) {}
  if (!raw) {
    var wait = { status: "success", linked: false };
    return fromPost ? jsonpText(callback, wait) : jsonp(callback, wait);
  }
  var data = {};
  try {
    data = JSON.parse(raw);
  } catch (e2) {
    data = {};
  }
  try {
    CacheService.getScriptCache().remove("native_auth_" + token);
  } catch (e3) {}
  var done = {
    status: "success",
    linked: true,
    telegramId: String(data.telegramId || ""),
    name: String(data.name || ""),
    username: String(data.username || "")
  };
  return fromPost ? jsonpText(callback, done) : jsonp(callback, done);
}
