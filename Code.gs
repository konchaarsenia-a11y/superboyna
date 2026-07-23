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
  "БУДУЩАЯ НЕДЕЛЯ": { nick: 3, start: 4, end: 59, addr: 60, note: 61, sheet: "future" }
};

var MANAGER_DATE_CELLS = { 0: "A1", 1: "A62", 2: "A123", 3: "A184", 4: "A245" };

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

function jsonpText(callback, obj) {
  var cb = callback || "callback";
  return ContentService.createTextOutput(cb + "(" + JSON.stringify(obj) + ")").setMimeType(ContentService.MimeType.TEXT);
}

function formatSheetDate(val, tz) {
  if (!val) return "";
  if (val instanceof Date) return Utilities.formatDate(val, tz, "dd.MM.yyyy");
  return val.toString();
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

function getWarehouseRowForCuttingRow_(cRow) {
  var wRow = cRow < 7 ? cRow - 1 : cRow - 2;
  if (cRow >= 12) wRow = cRow < 16 ? 11 : cRow + 10;
  if (cRow >= 43) wRow = cRow - 13;
  return wRow;
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

  if (future && formatSheetDate(future.getRange("A1").getValue(), tz) === dateText) {
    sourceSheet = future;
  } else if (manager) {
    for (var i = 0; i < 5; i++) {
      if (formatSheetDate(manager.getRange(MANAGER_DATE_CELLS[i]).getValue(), tz) === dateText) {
        sourceSheet = manager;
        offset = i * 61;
        break;
      }
    }
  }

  var matrixRows = sourceSheet === future ? 60 : 310;
  var matrix = sourceSheet ? sourceSheet.getRange(1, 3, matrixRows, 15).getValues() : null;
  // колонки с [НЕ РЕЗАТЬ] в примечании — не входят в план резки дня
  var skipCols = {};
  if (matrix) {
    var noteRowIdx = (sourceSheet === future ? 61 : (61 + offset)) - 1;
    if (noteRowIdx >= 0 && noteRowIdx < matrix.length) {
      for (var sc = 0; sc < 15; sc++) {
        var nv = String(matrix[noteRowIdx][sc] || "");
        if (/\[НЕ РЕЗАТЬ\]/i.test(nv)) skipCols[sc] = true;
      }
    }
  }
  for (var cRow = 3; cRow <= 48; cRow++) {
    var total = 0;
    var rows = itemMap[cRow];
    if (matrix && rows) {
      for (var r = 0; r < rows.length; r++) {
        var rowIndex = rows[r] + offset - 1;
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

function asBool_(v) {
  return v === true || v === "TRUE" || v === "true" || v === 1 || v === "1";
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

function finishFullWeekProduction() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetCourier = ss.getSheetByName("Доставки");
  var sheetManager = ss.getSheetByName("Прием заказов");
  var sheetWarehouse = ss.getSheetByName("Склад");
  var sheetArchive = ss.getSheetByName("Архив");
  var sheetFuture = ss.getSheetByName("Будущая неделя");
  var sheetCutting = ss.getSheetByName("Нарезка");
  var tz = ss.getSpreadsheetTimeZone();

  if (!sheetCourier || !sheetManager || !sheetWarehouse || !sheetCutting) {
    Browser.msgBox("❌ Ошибка листов!");
    return;
  }

  var dateVal = sheetCourier.getRange("A1").getValue();
  if (!dateVal) {
    Browser.msgBox("❌ Ошибка даты!");
    return;
  }

  var today = dateVal instanceof Date ? dateVal : new Date();
  var formattedDate = Utilities.formatDate(today, tz, "dd.MM.yyyy");
  var weekDaysGeo = [
    { start: 4, end: 59 },
    { start: 65, end: 120 },
    { start: 126, end: 181 },
    { start: 187, end: 242 },
    { start: 248, end: 303 }
  ];

  if (!sheetArchive) {
    sheetArchive = ss.insertSheet("Архив");
    sheetArchive.appendRow(["Дата закрытия", "Успешных клиентов", "Позиция товара", "Объём (гр / шт)"]);
  }

  var weeklyDispatchedItems = {};
  var successClientsCount = 0;
  var sheetMemCourier = getMemoryCourierSheet_();
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

  weekDaysGeo.forEach(function (day, index) {
    var dayDateStr = sheetManager.getRange(MANAGER_DATE_CELLS[index]).getValue();
    var currentDayStatuses = [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false];
    var dayDateCmp = formatSheetDate(dayDateStr, tz);

    if (dayDateCmp == formattedDate) {
      var deliveryStatusesMatrix = sheetCourier.getRange("C2:Q2").getValues();
      if (deliveryStatusesMatrix.length > 0) currentDayStatuses = deliveryStatusesMatrix[0];
    } else if (sheetMemCourier && sheetMemCourier.getLastRow() > 0) {
      var memRowsC = sheetMemCourier.getLastRow();
      var memDatesC = sheetMemCourier.getRange(1, 1, memRowsC, 1).getValues();
      for (var m = 0; m < memDatesC.length; m++) {
        if (formatSheetDate(memDatesC[m][0], tz) == dayDateCmp) {
          var parsed = JSON.parse(sheetMemCourier.getRange(m + 1, 2).getValue());
          if (parsed.length > 0) currentDayStatuses = parsed;
          break;
        }
      }
    }

    var namesArray = sheetCourier.getRange(day.start, 1, day.end - day.start + 1, 1).getValues();
    var ordersMatrix = sheetCourier.getRange(day.start, 3, day.end - day.start + 1, 15).getValues();
    for (var c = 0; c < 15; c++) {
      if (currentDayStatuses[c] === true) {
        successClientsCount++;
        for (var r = 0; r < ordersMatrix.length; r++) {
          var itemVolume = Number(ordersMatrix[r][c]) || 0;
          var itemName = namesArray[r] ? namesArray[r][0].toString().trim() : "";
          if (itemVolume > 0 && itemName !== "") {
            if (!weeklyDispatchedItems[itemName]) weeklyDispatchedItems[itemName] = 0;
            weeklyDispatchedItems[itemName] += itemVolume;
          }
        }
      }
    }
  });

  var cuttingSurplusValues = sheetCutting.getRange("C3:C60").getValues();
  for (var cRow = 3; cRow <= 48; cRow++) {
    var rowsToSum = itemMap[cRow.toString()];
    if (rowsToSum) {
      var wRow = cRow < 7 ? cRow - 1 : cRow - 2;
      if (cRow >= 12) wRow = cRow < 16 ? 11 : cRow + 10;
      if (cRow >= 43) wRow = cRow - 13;
      var totalGramsWeek = 0;
      weekDaysGeo.forEach(function (day) {
        var dayOffset = day.start - 4;
        var fullManagerMatrix = sheetManager.getRange("C1:Q310").getValues();
        rowsToSum.forEach(function (rNum) {
          var targetRowIdx = rNum + dayOffset - 1;
          for (var colM = 0; colM < 15; colM++) {
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

  var pieceStockValues = sheetWarehouse.getRange("K15:K25").getValues();
  sheetWarehouse.getRange("F15:F25").setValues(pieceStockValues);
  sheetWarehouse.getRange("B15:B25").setValue(0);

  var itemsKeys = Object.keys(weeklyDispatchedItems);
  if (itemsKeys.length > 0) {
    itemsKeys.forEach(function (pName) {
      sheetArchive.appendRow([formattedDate, successClientsCount / 5 + " чел.", pName, weeklyDispatchedItems[pName]]);
    });
  }

  for (var k = 0; k < 5; k++) {
    var cellRef = MANAGER_DATE_CELLS[k];
    var oldManagerDate = sheetManager.getRange(cellRef).getValue();
    if (oldManagerDate instanceof Date && !isNaN(oldManagerDate.getTime())) {
      var nextManagerDate = new Date(oldManagerDate);
      nextManagerDate.setDate(nextManagerDate.getDate() + 7);
      sheetManager.getRange(cellRef).setValue(Utilities.formatDate(nextManagerDate, tz, "dd.MM.yyyy"));
    }
  }

  var nextCourierDate = new Date(today);
  nextCourierDate.setDate(nextCourierDate.getDate() + 7);
  sheetCourier.getRange("A1").setValue(Utilities.formatDate(nextCourierDate, tz, "dd.MM.yyyy"));

  // Очистка всех блоков Пн–Пт: ники + товары + адрес + примечание
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

  var sheetMemory = getMemoryCuttingSheet_();
  if (sheetMemory && sheetMemory.getLastRow() > 0) {
    sheetMemory.getRange(1, 1, sheetMemory.getLastRow(), 2).clearContent();
  }
  var sheetMemCourier2 = getMemoryCourierSheet_();
  if (sheetMemCourier2 && sheetMemCourier2.getLastRow() > 0) {
    sheetMemCourier2.getRange(1, 1, sheetMemCourier2.getLastRow(), 2).clearContent();
  }

  sendTelegramSnabNotification();
  Browser.msgBox("🎉 СМЕНА ЗАКРЫТА!");
}

// ===================== HTTP API =====================

function doPost(e) {
  var callback = (e.parameter && e.parameter.callback) || "jsonp_callback";
  try {
    var json = JSON.parse(e.postData.contents);
    // Входящие апдейты Telegram (если webhook смотрит на этот же URL)
    if (json && (json.message || json.callback_query || json.edited_message)) {
      handleTelegramUpdate_(json);
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
  if (action === "materializeWeek") {
    return handleMaterializeWeek({
      onlyMissing: e.parameter.onlyMissing,
      includeFuture: e.parameter.includeFuture
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
  if (action === "getStats") {
    return handleGetStats({
      period: e.parameter.period || "month"
    }, callback, false);
  }
  if (action === "exportStats") {
    return handleExportStats({
      format: e.parameter.format || "accountant"
    }, callback, false);
  }
  if (action === "listSurvey") {
    return handleListSurvey({}, callback, false);
  }
  if (action === "getPpFactCost") {
    return handleGetPpFactCost({
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : "",
      client: e.parameter.client ? decodeURIComponent(e.parameter.client) : ""
    }, callback, false);
  }
  if (action === "getPpOrderSuggest") {
    return handleGetPpOrderSuggest({
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : "",
      client: e.parameter.client ? decodeURIComponent(e.parameter.client) : "",
      day: e.parameter.day ? decodeURIComponent(e.parameter.day) : "",
      date: e.parameter.date ? decodeURIComponent(e.parameter.date) : ""
    }, callback, false);
  }
  if (action === "setupBookingTriggers") {
    return handleSetupBookingTriggers(callback, false);
  }
  if (action === "getMyAccess") {
    return handleGetMyAccess({
      telegramId: e.parameter.telegramId || "",
      name: e.parameter.name ? decodeURIComponent(e.parameter.name) : "",
      username: e.parameter.username ? decodeURIComponent(e.parameter.username) : "",
      initData: e.parameter.initData ? decodeURIComponent(e.parameter.initData) : ""
    }, callback, false);
  }
  if (action === "listAccess") {
    return handleListAccess({ telegramId: e.parameter.telegramId || "" }, callback, false);
  }
  if (action === "getWarehouse") {
    return handleGetWarehouse({}, callback, false);
  }
  if (action === "warehousePreview") {
    return handleWarehousePreview({}, callback, false);
  }
  if (action === "listSubscriptions") {
    return handleListSubscriptions({}, callback, false);
  }
  if (action === "getSubscription") {
    return handleGetSubscription({
      nick: e.parameter.nick ? decodeURIComponent(e.parameter.nick) : "",
      subId: e.parameter.subId ? decodeURIComponent(e.parameter.subId) : "",
      segment: e.parameter.segment ? decodeURIComponent(e.parameter.segment) : ""
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
      basket: e.parameter.basket ? JSON.parse(decodeURIComponent(e.parameter.basket)) : []
    }, callback, false);
  }

  // delete / move доступны и через GET (JSONP из mini-app)
  if (action === "deleteClient" || action === "moveClient") {
    payload.cutRaw = e.parameter.cutRaw;
    return handleApiAction(payload, callback, false);
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
    return handleSaveOrder(ss, json, callback);
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
  if (action === "materializeWeek") {
    return handleMaterializeWeek(json, callback, fromPost);
  }
  if (action === "weekPullStatus") {
    return handleWeekPullStatus(json, callback, fromPost);
  }
  if (action === "resolveDayForDate") {
    return handleResolveDayForDate(json, callback, fromPost);
  }
  if (action === "setupBookingTriggers") {
    return handleSetupBookingTriggers(callback, fromPost);
  }
  if (action === "updateCutting") {
    return handleUpdateCutting(ss, json, callback, fromPost);
  }
  if (action === "setDelivered") {
    return handleSetDelivered(ss, json, callback);
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
  if (action === "requestAccess") {
    return handleRequestAccess(json, callback, fromPost);
  }
  if (action === "listAccess") {
    return handleListAccess(json, callback, fromPost);
  }
  if (action === "setAccessRole") {
    return handleSetAccessRole(json, callback, fromPost);
  }
  if (action === "getWarehouse") {
    return handleGetWarehouse(json, callback, fromPost);
  }
  if (action === "setWarehouseArrival") {
    return handleSetWarehouseArrival(json, callback, fromPost);
  }
  if (action === "warehousePreview") {
    return handleWarehousePreview(json, callback, fromPost);
  }
  if (action === "listSubscriptions") {
    return handleListSubscriptions(json, callback, fromPost);
  }
  if (action === "getSubscription") {
    return handleGetSubscription(json, callback, fromPost);
  }
  if (action === "pushSubscriptionToDay") {
    return handlePushSubscriptionToDay(json, callback, fromPost);
  }
  if (action === "calcPrice") {
    return handleCalcPrice(json, callback, fromPost);
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
  if (action === "exportStats") {
    return handleExportStats(json, callback, fromPost);
  }
  if (action === "listSurvey") {
    return handleListSurvey(json, callback, fromPost);
  }
  if (action === "getPpFactCost") {
    return handleGetPpFactCost(json, callback, fromPost);
  }
  if (action === "getPpOrderSuggest") {
    return handleGetPpOrderSuggest(json, callback, fromPost);
  }
  return fromPost ? jsonpText(callback, { status: "unknown_action" }) : jsonp(callback, { status: "unknown_action" });
}

function handleGetCutting(dayName, callback) {
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
  var activeState = isActiveDate ? cutting.getRange("C3:G48").getValues() : null;
  var savedState = isActiveDate ? null : getMemoryJson_(memory, dateText, tz);
  var rowNotes = collectCuttingRowNotes_(ss, dayName);
  var items = [];

  for (var i = 0; i < 46; i++) {
    var dry = Number(totals[i][0]) || 0;
    if (dry <= 0) continue;
    var name = names[i][0] == null ? "" : String(names[i][0]).trim();
    var row = i + 3;
    var piece = /шт/i.test(name);
    var state = activeState ? activeState[i] : (savedState && savedState[i] ? savedState[i] : []);
    var surplus = Number(state[0]) || 0;
    // active C3:G = [C,D,E,F,G] → laid=E[2], done=F[3], outNext=G[4]
    // memory packed = [surplus,"",laid,done,outNext]
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
      var coef = warehouse ? Number(warehouse.getRange("D" + wRow).getValue()) : 0;
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
  return jsonp(callback, {
    status: "success",
    date: dateText,
    day: dayName,
    items: items,
    session: getCuttingSession_(),
    completion: getCuttingCompletion_(dateText),
    cutterNotes: collectDayRoleNotes_(ss, dayName, "cut"),
    transferOnly: collectTransferOnlyCutting_(ss, dayName)
  });
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
    } else {
      // дата уже активна — только пересчёт плана, флаги E/F/G не трогаем
      recalculateCuttingForDate_(ss, dateText);
    }

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
    saveCuttingState_(cutting, memory, dateText, tz);
    var ok = { status: "success" };
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

function handleGetCourier(dayName, callback) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var courier = ss.getSheetByName("Доставки");
  var memory = getMemoryCourierSheet_();
  var tz = ss.getSpreadsheetTimeZone();
  var dateValue = getDayDate_(ss, dayName);
  var clientData = getClientsData_(ss, dayName);
  if (!dateValue || clientData.status !== "success") {
    return jsonp(callback, { status: "bad_day", clients: [] });
  }
  var dateText = formatSheetDate(dateValue, tz);
  var memFlags = getMemoryJson_(memory, dateText, tz) || {};
  var sheetActive = courier && formatSheetDate(courier.getRange("A1").getValue(), tz) === dateText;

  var clients = [];
  for (var i = 0; i < clientData.clients.length; i++) {
    var client = clientData.clients[i];
    var delivered = false;
    var courierCol = findCourierClientCol_(courier, client.name);
    if (sheetActive && courierCol > 0) {
      delivered = courier.getRange(2, courierCol).getValue() === true;
    } else if (memFlags && typeof memFlags === "object") {
      if (Object.prototype.toString.call(memFlags) === "[object Array]") {
        delivered = memFlags[client.col] === true;
      } else {
        var mk = clientMatchKey_(client.name) || String(client.name).toUpperCase();
        delivered = normalizeMemDelivered_(memFlags[mk]) ||
          normalizeMemDelivered_(memFlags[String(client.name).toUpperCase()]);
      }
    }
    var deliveriesN = lookupPpDeliveries_(client.name);
    var paidCycle = null;
    var deliverySlot = 1;
    var ppHint = "";
    try {
      var resolved = resolvePpDeliverySlot_(ss, client.name, dateValue, tz, delivered);
      deliveriesN = resolved.deliveriesN || deliveriesN;
      deliverySlot = resolved.slot || 1;
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
    } catch (ePaid) {
      // fallback на старую недельную логику
      try {
        var wKey2 = weekPaidKey_(dateValue, tz);
        var wStore2 = getWeekPaidStore_(memory, wKey2, tz);
        var pe2 = wStore2[String(client.name).toUpperCase()];
        if (pe2 && typeof pe2 === "object") paidCycle = pe2.paid || null;
        else if (typeof pe2 === "string") paidCycle = pe2;
        var deliveredBefore = countDeliveredThisWeek_(ss, client.name, dateValue, tz);
        deliverySlot = delivered ? Math.max(1, deliveredBefore) : (deliveredBefore + 1);
      } catch (e2) {}
    }
    var askPaid = false;
    if (deliveriesN >= 2) {
      if (paidCycle === "yes") askPaid = false;
      else if (deliverySlot <= 1) askPaid = true;
      else if (paidCycle === "no") askPaid = true;
      else askPaid = true;
    }
    clients.push({
      name: client.name,
      address: client.address,
      note: client.note,
      phone: client.phone || "",
      geo: client.geo || null,
      basket: client.basket,
      delivered: delivered,
      col: client.col,
      courierCol: courierCol,
      deliveriesN: deliveriesN,
      paid: paidCycle,
      deliverySlot: deliverySlot,
      ppHint: ppHint,
      askPaid: askPaid && !delivered
    });
  }
  return jsonp(callback, { status: "success", day: dayName, date: dateText, clients: clients });
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
  values[memKey] = { delivered: delivered, paid: paidVal || null };
  saveMemoryJson_(memory, dateText, values, tz);

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

/** Ключ личности клиента: @handle / латиница, иначе полное имя. */
function clientMatchKey_(raw) {
  var ex = extractInstagramNick_(raw);
  var base = ex || String(raw || "").replace(/\s*\b(АФК|ПП|БП|Р)\b\s*/gi, " ").replace(/\s+/g, " ").trim();
  return normalizeClientKey_(base);
}

function nicksMatch_(a, b) {
  var ka = clientMatchKey_(a);
  var kb = clientMatchKey_(b);
  if (ka && kb && ka === kb) return true;
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
  var want = normalizeClientKey_(clientName);
  if (!want) return { cancelled: 0 };
  var dateStr = deliveryDate ? dateKey_(deliveryDate, tz) : "";
  var sh = getBookingsSheet_();
  var all = readAllBookings_();
  var n = 0;
  for (var i = 0; i < all.length; i++) {
    var b = all[i];
    if (String(b.status) === "cancelled") continue;
    if (normalizeClientKey_(b.client) !== want) continue;
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
  var want = normalizeClientKey_(json.client);
  if (block && want) {
    var targetSheet = getTargetSheet(ss, block);
    if (targetSheet) {
      var nicksRowValues = targetSheet.getRange(block.nick, 3, 1, 15).getValues()[0];
      // все столбцы с этим ником (дубликаты тоже)
      for (var i = 0; i < 15; i++) {
        var currentNick = normalizeClientKey_(nicksRowValues[i]);
        if (currentNick && currentNick === want) {
          var targetCol = i + 3;
          targetSheet.getRange(block.nick, targetCol).setValue("");
          targetSheet.getRange(block.start, targetCol, block.note - block.start + 1, 1).clearContent();
          clearedWeek = true;
          clearedCols++;
        }
      }
    }
  }

  var bookRes = { cancelled: 0 };
  try {
    // только на дату дня — не трогаем брони других дат того же ника
    if (deliveryDate) {
      bookRes = cancelBookingsForClient_(ss, json.client, deliveryDate);
    }
  } catch (eBook) {}

  // курьерская галочка на дату дня — убрать ник/флаг, если есть
  try {
    var courier = ss.getSheetByName("Доставки");
    if (courier && deliveryDate) {
      var dateText = formatSheetDate(deliveryDate, tz);
      if (formatSheetDate(courier.getRange("A1").getValue(), tz) === dateText) {
        var cCol = findCourierClientCol_(courier, json.client);
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

  if (clearedWeek || (bookRes && bookRes.cancelled > 0)) {
    return jsonp(callback, {
      status: "success",
      clearedWeek: clearedWeek,
      clearedCols: clearedCols,
      cancelledBookings: bookRes.cancelled || 0,
      day: dayName || ""
    });
  }
  // уже нет ни в неделе, ни в бронях — не ошибка (повторное удаление / рассинхрон UI)
  return jsonp(callback, {
    status: "success",
    alreadyGone: true,
    day: dayName || ""
  });
}

function handleMoveClient(ss, json, callback) {
  var srcBlock = getDayBlock(json.oldDay);
  var dstBlock = getDayBlock(json.newDay || json.day);
  if (!srcBlock || !dstBlock) return jsonp(callback, { status: "bad_day" });

  var sourceSheet = getTargetSheet(ss, srcBlock);
  var targetSheet = getTargetSheet(ss, dstBlock);
  if (!sourceSheet || !targetSheet) return jsonp(callback, { status: "error" });

  var want = String(json.client || "").trim().toUpperCase();
  var oldClientCol = -1;
  var srcNicks = sourceSheet.getRange(srcBlock.nick, 3, 1, 15).getValues()[0];
  for (var i = 0; i < 15; i++) {
    var sNick = srcNicks[i] ? srcNicks[i].toString().trim().toUpperCase() : "";
    if (sNick === want) {
      oldClientCol = i + 3;
      break;
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
    if (tNick === want) {
      newClientCol = j + 3;
      break;
    }
  }
  if (newClientCol === -1) {
    for (var colIdx = 3; colIdx <= 17; colIdx++) {
      if (targetSheet.getRange(dstBlock.nick, colIdx).getValue().toString().trim() === "") {
        newClientCol = colIdx;
        targetSheet.getRange(dstBlock.nick, newClientCol).setValue(json.client);
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

  checkLiveDeficitAndNotify();
  return jsonp(callback, { status: "success", cutRaw: cutRaw });
}

/**
 * Сохранение заказа с учётом фракции (sub).
 * orderItem: { name|main, sub, val|value, cat }
 */
function handleSaveOrder(ss, json, callback) {
  var block = getDayBlock(json.day);
  if (!block) return jsonpText(callback, { status: "bad_day" });
  var targetSheet = getTargetSheet(ss, block);
  if (!targetSheet) return jsonpText(callback, { status: "error" });
  if (!String(json.client || "").trim()) return jsonpText(callback, { status: "no_client" });

  var clientCol = -1;
  var mgrNicks = targetSheet.getRange(block.nick, 3, 1, 15).getValues()[0];
  for (var i = 0; i < 15; i++) {
    if (nicksMatch_(mgrNicks[i], json.client)) {
      clientCol = i + 3;
      break;
    }
  }
  if (clientCol === -1) {
    for (var colIdx = 3; colIdx <= 17; colIdx++) {
      if (String(targetSheet.getRange(block.nick, colIdx).getValue() || "").trim() === "") {
        clientCol = colIdx;
        targetSheet.getRange(block.nick, clientCol).setValue(String(json.client || "").trim());
        break;
      }
    }
  }
  if (clientCol === -1) return jsonpText(callback, { status: "no_free_columns" });

  // очистка товаров + адрес + примечание
  targetSheet.getRange(block.start, clientCol, block.note - block.start + 1, 1).clearContent();
  if (json.address) targetSheet.getRange(block.addr, clientCol).setValue(json.address);
  // GEO/TEL не пишем в примечание — телефон только в профиле/поле phone
  var cleanNote = stripGeoTagsFromNote_(String(json.note || "").replace(/\[TEL:[^\]]+\]/gi, "").replace(/\s{2,}/g, " ").trim());
  // цена заказа (розница/партнёр/ПП) — тег в примечании столбца
  var op = json.orderPrice;
  if (op != null && op !== "" && !isNaN(Number(op))) {
    cleanNote = String(cleanNote || "").replace(/\[ЦЕНА:[^\]]*\]/gi, "").replace(/\s{2,}/g, " ").trim();
    cleanNote = ("[ЦЕНА: " + Number(op) + " BYN]" + (cleanNote ? " " + cleanNote : "")).trim();
  }
  if (cleanNote) targetSheet.getRange(block.note, clientCol).setValue(cleanNote);

  var geo = json.geo || null;
  if (geo && geo.lat != null && geo.lon != null) {
    upsertClientGeo_(ss, json.day, json.client, geo.lat, geo.lon, geo.yandexUrl || "");
  } else {
    clearClientGeo_(ss, json.day, json.client);
  }

  var itemsInSheet = targetSheet.getRange(block.start, 1, block.end - block.start + 1, 1).getValues();
  var basket = json.basket || [];

  basket.forEach(function (orderItem) {
    var rawName = String(orderItem.name || orderItem.main || "").trim();
    var rawSub = String(orderItem.sub || "").trim();
    var inputVal = Number(orderItem.val != null ? orderItem.val : orderItem.value) || 0;
    if (!rawName || inputVal <= 0) return;

    var targetRowOffset = findSheetRowForItem(itemsInSheet, rawName, rawSub);
    if (targetRowOffset >= 0) {
      targetSheet.getRange(block.start + targetRowOffset, clientCol).setValue(inputVal);
    }
  });

  try {
    var perm = String(json.permanentNote || "").trim();
    var profileNote = perm || ""; // постоянные — в Клиенты/Контакты; разовые не затирают профиль пустым
    var src = String(json.orderType || json.source || "saveOrder");
    upsertClientProfile_(ss, json.client, json.address, json.phone || extractPhoneFromNote_(cleanNote), profileNote, src, json.basket || []);
  } catch (eProf) {}

  try { ensureBpAndSurveyFromOrder_(json); } catch (eBp) {}
  // Telegram-проверку склада не зовём на каждый save — сильно тормозит запись
  return jsonpText(callback, { status: "success" });
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
    var sheetFull = sheetRaw.toString().trim().toUpperCase();
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
        .replace(/\s*ПОЛОВИНКА/g, "")
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

    var nameMatch =
      sheetBase === nameU ||
      sheetBase.indexOf(nameU) === 0 ||
      nameU.indexOf(sheetBase) === 0 ||
      sheetFull.indexOf(nameU) === 0 ||
      (nameU.length >= 4 && sheetBase.indexOf(nameU) > -1) ||
      (sheetBase.length >= 4 && nameU.indexOf(sheetBase) > -1);
    if (!nameMatch) continue;

    var score = 1;
    if (subNorm) {
      if (sheetFrac && sheetFrac === subNorm) score = 10;
      // разная фракция на строке — не матчить через indexOf («МАЛ» ⊂ «ОЧ МАЛ»)
      else if (sheetFrac && sheetFrac !== subNorm) score = 0;
      else if (!sheetFrac && sheetFull.indexOf(subNorm) > -1) score = 8;
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

/** Опечатки / варианты написания в таблице */
function normalizeProductAlias_(nameU) {
  var n = String(nameU || "").trim();
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
    "ЛЕГКОЕ": "ЛЁГКОЕ"
  };
  if (aliases[n]) return aliases[n];
  return n;
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
  if (u === "ПОЛОВИНКА") return "ПОЛОВИНКА";
  if (u === "ПАЛК") return "ПАЛК";
  if (u === "ПЛАСТ") return "ПЛАСТ";
  if (u === "ОГР") return "ОГР";
  if (u === "ОБЫЧНОЕ" || u === "ОБЫЧНАЯ") return "";
  return u;
}

function extractEmbeddedFraction(sheetFull) {
  if (sheetFull.indexOf("ОЧ МАЛ") > -1) return "ОЧ МАЛ";
  if (sheetFull.indexOf("ПОЛОВИНКА") > -1) return "ПОЛОВИНКА";
  if (sheetFull.indexOf("ПАЛК") > -1) return "ПАЛК";
  if (sheetFull.indexOf("ПЛАСТ") > -1) return "ПЛАСТ";
  if (sheetFull.indexOf("ОГР") > -1) return "ОГР";
  if (/\bМАЛ\b/.test(sheetFull) || sheetFull.indexOf(" МЕЛКОЕ") > -1) return "МАЛ";
  if (sheetFull.indexOf("СРЕД") > -1) return "СРЕД";
  if (sheetFull.indexOf("БОЛ") > -1 || sheetFull.indexOf("БОЛЬШОЕ") > -1) return "БОЛ";
  if (sheetFull.indexOf("КРУПНОЕ") > -1) return "КРУПНОЕ";
  if (sheetFull.indexOf("ЦЕЛОЕ") > -1) return "ЦЕЛОЕ";
  return "";
}

function handleGetClients(dayName, callback, dateStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var resolvedDay = dayName;
  var deliveryDate = null;
  if (dateStr) {
    deliveryDate = parseFlexibleDate_(dateStr, tz);
    if (deliveryDate) {
      var byDate = findDayNameForDate_(ss, deliveryDate);
      if (byDate) resolvedDay = byDate;
    }
  }
  if (resolvedDay) {
    var data = getClientsData_(ss, resolvedDay);
    for (var i = 0; i < data.clients.length; i++) delete data.clients[i].col;
    data.day = resolvedDay;
    data.date = deliveryDate ? dateKey_(deliveryDate, tz) : "";
    // если день в неделе пуст, но есть брони на дату — отдать брони
    if (deliveryDate && (!data.clients || !data.clients.length)) {
      var fromBookings = clientsFromBookings_(ss, deliveryDate);
      if (fromBookings.length) {
        data.status = "success";
        data.clients = fromBookings;
        data.fromBookings = true;
      }
    }
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

function getClientsData_(ss, dayName) {
  var block = getDayBlock(dayName);
  if (!block) return { status: "bad_day", clients: [] };
  var targetSheet = getTargetSheet(ss, block);
  if (!targetSheet) return { status: "error", clients: [] };

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
        nameClean.length > 1
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

        var rawAddr = addressesMatrix && addressesMatrix[0] ? addressesMatrix[0][colIdx] : "";
        var rawNote = notesMatrix && notesMatrix[0] ? notesMatrix[0][colIdx] : "";
        var noteStr = rawNote != null ? String(rawNote).trim() : "";
        // Миграция: GEO из старых примечаний → лист Гео_Клиентов, из ячейки убираем
        var legacyGeo = parseGeoTagsFromNote_(noteStr);
        if (legacyGeo) {
          upsertClientGeo_(ss, dayName, nameClean, legacyGeo.lat, legacyGeo.lon, legacyGeo.yandexUrl || "");
          noteStr = stripGeoTagsFromNote_(noteStr);
          try {
            targetSheet.getRange(noteRow, colIdx + 3).setValue(noteStr);
          } catch (eMig) {}
        }
        var geoObj = getClientGeo_(ss, dayName, nameClean);
        if (!geoObj && legacyGeo) geoObj = legacyGeo;
        var phone = "";
        var telM = noteStr.match(/\[TEL:([^\]]+)\]/i);
        if (telM) phone = String(telM[1] || "").trim();
        if (!phone) {
          var phM = noteStr.match(/(\+?375[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})/);
          if (phM) phone = phM[1].replace(/\s+/g, "");
        }
        try {
          if (!phone) {
            var crm = getCrmSpreadsheet_();
            var contact = lookupContactAddress_(crm, nameClean);
            if (contact && contact.phone) phone = contact.phone;
          }
        } catch (ePhone) {}
        clientsDataList.push({
          name: nameClean,
          orderCount: totalItemsInOrder,
          address: rawAddr != null ? String(rawAddr).trim() : "",
          note: noteStr,
          phone: phone,
          geo: geoObj || null,
          basket: clientBasket,
          col: colIdx,
          noCut: /\[НЕ РЕЗАТЬ\]/i.test(noteStr)
        });
      }
    }
  }
  return { status: "success", clients: clientsDataList };
}

/** Единый разбор имени строки листа → name/sub/cat/unit для mini-app. */
function parseSheetItemName(currentItemName, rIdx) {
  var upper = currentItemName.toUpperCase();
  var cat = "other";
  var unit = "гр";

  // Ориентиры по строкам понедельничного блока (индекс 0 = строка 4)
  // 0–11 дрессура-подобные с « / »; жевалки со шт.; и т.д.
  if (currentItemName.indexOf("шт.") > -1 || currentItemName.indexOf("ШТ") > -1) {
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
    upper.indexOf("СЕРДЦЕ") === 0 ||
    upper.indexOf("ПОЧКИ") === 0 ||
    upper.indexOf("РУБЕЦ Т") === 0 ||
    upper.indexOf("БАРАНЬЕ") === 0
  ) {
    if (currentItemName.indexOf(" / ") > -1) {
      cat = "dressura";
      unit = "гр";
    } else {
      cat = "chew";
      unit = unit === "шт" ? "шт" : "гр";
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
    upper.indexOf("ЛОП") > -1 ||
    upper.indexOf("УТИНЫЕ") > -1 ||
    upper.indexOf("ГУБЫ") > -1 ||
    upper.indexOf("КНИЖКА") > -1
  ) {
    cat = "chew";
    unit = "шт";
  }

  var cleanNameOnly = currentItemName;
  var frac = "";

  if (currentItemName.indexOf(" / ") > -1) {
    var splitIdx = currentItemName.indexOf(" / ");
    cleanNameOnly = currentItemName.substring(0, splitIdx).trim();
    var subText = currentItemName.substring(splitIdx + 3).trim();
    frac = subText;
    if (subText === "Мелкое") frac = "Мелкое";
    if (subText === "Среднее") frac = "Среднее";
    if (subText === "Большое") frac = "Большое";
    if (subText === "Крупное") frac = "Крупное";
    if (subText === "Целое") frac = "Целое";
  } else {
    frac = "";
    if (upper.indexOf("ОЧ МАЛ") > -1) frac = "ОЧ МАЛ";
    else if (upper.indexOf("ПОЛОВИНКА") > -1) frac = "ПОЛОВИНКА";
    else if (upper.indexOf("ПАЛК") > -1) frac = "ПАЛК";
    else if (upper.indexOf("ПЛАСТ") > -1) frac = "ПЛАСТ";
    else if (upper.indexOf("ОГР") > -1) frac = "ОГР";
    else if (/\bМАЛ\b/.test(upper)) frac = "МАЛ";
    else if (upper.indexOf("СРЕД") > -1) frac = "СРЕД";
    else if (upper.indexOf("БОЛ") > -1) frac = "БОЛ";

    cleanNameOnly = currentItemName
      .replace(/\s*шт\.?/gi, "")
      .replace(/\s*ШТ\.?/g, "")
      .replace(/\s*ОЧ МАЛ/gi, "")
      .replace(/\s*ПОЛОВИНКА/gi, "")
      .replace(/\s*ПАЛК/gi, "")
      .replace(/\s*ПЛАСТ/gi, "")
      .replace(/\s*ОГР/gi, "")
      .replace(/\s*МАЛ/gi, "")
      .replace(/\s*СРЕД/gi, "")
      .replace(/\s*БОЛ/gi, "")
      .trim();
  }

  return { cat: cat, name: cleanNameOnly, sub: frac, unit: unit };
}

// ===================== Telegram =====================

function checkLiveDeficitAndNotify() {
  sendTelegramSnabNotificationInternal("🚨 *ОПЕРАТИВНЫЙ ДЕФИЦИТ СЫРЬЯ НА СКЛАДЕ!*");
}

function sendTelegramSnabNotification() {
  sendTelegramSnabNotificationInternal("🚨 *ПЛАН СНАБЖЕНИЯ НА НОВУЮ НЕДЕЛЮ*");
}

function sendTelegramSnabNotificationInternal(headerText) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetWarehouse = ss.getSheetByName("Склад");
  if (!sheetWarehouse) return;

  var names = sheetWarehouse.getRange("A2:A35").getValues();
  var snabValues = sheetWarehouse.getRange("G2:G35").getValues();
  var messageLines = [];
  var hasDeficit = false;

  for (var i = 0; i < names.length; i++) {
    var itemName = names[i][0].toString().trim();
    var needToBuy = Number(snabValues[i][0]) || 0;
    if (itemName !== "" && needToBuy > 0) {
      hasDeficit = true;
      var rowNum = i + 2;
      var unit = rowNum >= 15 && rowNum <= 25 ? " шт." : " кг";
      messageLines.push("• " + itemName + ": " + needToBuy.toFixed(1) + unit);
    }
  }

  if (!hasDeficit) return;

  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("TELEGRAM_BOT_TOKEN");
  var chatId = props.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !chatId) {
    Logger.log("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы в Script Properties");
    return;
  }

  var fullMessage = headerText + "\n" + messageLines.join("\n") + "\n\n🏭 _Бойня-Конвейер v4.0_";
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text: fullMessage, parse_mode: "Markdown" }),
    muteHttpExceptions: true
  });
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

function handleTelegramUpdate_(update) {
  try {
    if (update && update.callback_query) {
      handleDeficitCallback_(update.callback_query);
      return;
    }
    var msg = update.message || update.edited_message;
    if (!msg || !msg.chat) return;
    var chat = msg.chat;
    if (chat.type !== "private") return;
    var from = msg.from || {};
    var name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
    upsertCourier_(chat.id, name, from.username || "");
    var text = String(msg.text || "");
    if (/^\/start/i.test(text)) {
      telegramSendText_(chat.id, "Привет! Ты в списке курьеров Бойни. Когда сменщик пришлёт маршрут — придёт сюда.");
    }
  } catch (eTg) {
    try {
      if (update && update.callback_query && update.callback_query.id) {
        telegramAnswerCallback_(update.callback_query.id, "Ошибка обработки");
      }
    } catch (eAns) {}
  }
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
 * Подсказки адресов — бесплатно (Photon + Nominatim).
 * Платный ключ Яндекса не нужен. YANDEX_MAPS_API_KEY можно не задавать.
 */
function handleSuggestAddress(json, callback, fromPost) {
  var text = String(json.text || json.q || "").trim();
  var body;
  if (text.length < 2) {
    body = { status: "success", results: [], source: "empty" };
    return fromPost ? jsonpText(callback, body) : jsonp(callback, body);
  }
  var results = [];
  var source = "none";
  try {
    results = photonSuggest_(text);
    if (results.length) source = "photon";
  } catch (e0) {
    Logger.log("photon suggest err: " + e0);
  }
  if (!results.length) {
    try {
      results = nominatimSuggest_(text);
      if (results.length) source = "nominatim";
    } catch (e2) {
      Logger.log("nominatim suggest err: " + e2);
    }
  }
  // Опционально: если вдруг ключ Яндекса уже есть — дополним/заменим пустой ответ
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
  body = { status: "success", results: results, source: source };
  return fromPost ? jsonpText(callback, body) : jsonp(callback, body);
}

/** Бесплатный геокодер Photon (OSM), хорошо понимает улицы Минска */
function photonSuggest_(text) {
  var q = String(text || "").trim();
  if (!q) return [];
  if (!/минск|беларусь|брест|гродн|гомел|витебск|могил/i.test(q)) {
    q = q + ", Минск";
  }
  var url = "https://photon.komoot.io/api/?limit=7&lang=ru&lat=53.9&lon=27.56&q=" + encodeURIComponent(q);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() >= 400) return [];
  var data = JSON.parse(res.getContentText());
  var features = (data && data.features) || [];
  var out = [];
  var seen = {};
  for (var i = 0; i < features.length; i++) {
    var f = features[i] || {};
    var geom = f.geometry || {};
    var coords = geom.coordinates || [];
    if (coords.length < 2) continue;
    var lon = Number(coords[0]);
    var lat = Number(coords[1]);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    // ограничиваем примерно Минском + область (~80 км), чтобы не тащить чужие города без нужды
    if (Math.abs(lat - 53.9) > 1.2 || Math.abs(lon - 27.56) > 1.5) {
      if (!/брест|гродн|гомел|витебск|могил|борисов|жодино|молодечн/i.test(q)) continue;
    }
    var p = f.properties || {};
    var street = String(p.street || "").trim();
    var house = String(p.housenumber || "").trim();
    if (!street && p.name && (String(p.osm_key || "") === "highway" || String(p.type || "") === "street" || !house)) {
      street = String(p.name || "").trim();
    }
    var title = "";
    if (street && house) title = street + ", " + house;
    else if (street) title = street;
    else if (p.name && house) title = String(p.name).trim() + ", " + house;
    else title = [p.name, p.street, p.housenumber].filter(Boolean).join(", ");
    // без района/города/страны
    title = String(title || "").replace(/,\s*(Беларусь|Belarus|Минск|Minsk|Минская область).*$/i, "").trim();
    if (!title) continue;
    var keyDup = lat.toFixed(5) + "," + lon.toFixed(5);
    if (seen[keyDup]) continue;
    seen[keyDup] = true;
    out.push({
      title: title,
      subtitle: "",
      address: title,
      lat: lat,
      lon: lon,
      yandexUrl: "https://yandex.ru/maps/?pt=" + lon + "," + lat + "&z=17&l=map"
    });
  }
  return out;
}

function yandexGeocodeSuggest_(text, key) {
  var q = text;
  if (!/минск|беларусь|брест|гродн|гомел|витебск|могил/i.test(text)) {
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

function nominatimSuggest_(text) {
  var q = text;
  if (!/минск|беларусь|брест|гродн/i.test(text)) q = "Минск, " + text;
  var url = "https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=by&q=" +
    encodeURIComponent(q);
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { "User-Agent": "superboyna-courier/1.0" }
  });
  if (res.getResponseCode() >= 400) return [];
  var data = JSON.parse(res.getContentText());
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var lat = Number(row.lat);
    var lon = Number(row.lon);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    var address = String(row.display_name || "").trim();
    out.push({
      title: address.split(",")[0] || address,
      subtitle: address,
      address: address,
      lat: lat,
      lon: lon,
      yandexUrl: "https://yandex.ru/maps/?pt=" + lon + "," + lat + "&z=17&l=map"
    });
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
    var re = /\[NOTE:([^|\]]+)\|(perm|once)\]/gi;
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

/** Текст примечания только для роли (поддержка [NOTE:roles|once|perm]). */
function noteTextForRole_(note, role) {
  var raw = String(note || "");
  if (/\[NOTE:/i.test(raw)) {
    var bits = [];
    var re = /\[NOTE:([^\|\]]+)\|(perm|once)\]\s*([\s\S]*?)(?=\s*\|\|\s*\[NOTE:|$)/gi;
    var m;
    while ((m = re.exec(raw))) {
      var rolesArr = String(m[1] || "").toLowerCase().split(/[,;\s]+/);
      var ok = false;
      for (var j = 0; j < rolesArr.length; j++) {
        if (rolesArr[j] === role) { ok = true; break; }
      }
      if (!ok) continue;
      var t = String(m[3] || "").replace(/\[TEL:[^\]]+\]/gi, "").replace(/\+?375[\d\s\-]{9,}/g, "").trim();
      if (t) bits.push(t);
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
    var text = noteTextForRole_(raw, role);
    if (!text) continue;
    out.push({ client: clients[i].name || "", text: text });
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
  var rev = getProductRowToCuttingRowMap_();
  var byRow = {};

  for (var col = 0; col < cols; col++) {
    var nick = nicks[col] != null ? String(nicks[col]).trim() : "";
    if (!nick || nick.length <= 1) continue;
    var upper = nick.toUpperCase();
    if (upper === "ИТОГО НА ДЕНЬ" || upper === "ИТОГО" || upper === "ФАКТ СНЯТОЕ") continue;
    var rawNote = notes[col] != null ? String(notes[col]).trim() : "";
    if (!noteVisibleForRole_(rawNote, "cut")) continue;
    var text = noteTextForRole_(rawNote, "cut");
    if (!text) continue;

    for (var rIdx = 0; rIdx < orders.length; rIdx++) {
      var val = Number(orders[rIdx][col]) || 0;
      if (val <= 0) continue;
      var mondayRow = 4 + rIdx;
      var cutRow = rev[mondayRow];
      if (!cutRow) continue;
      var key = String(cutRow);
      if (!byRow[key]) byRow[key] = [];
      byRow[key].push({ client: nick, text: text, qty: val });
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
        unit: /шт/i.test(String(names[i][0] || "")) ? "шт" : "гр",
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
    var id = normalizeDeficitId_(data[i][0]);
    if (!id || !/^d[a-f0-9]{8,}$/i.test(id)) {
      id = newDeficitId_();
      sh.getRange(i + 1, 1).setNumberFormat("@").setValue(id);
      data[i][0] = id;
    }
    sendDeficitPushForRow_(data[i]);
    sh.getRange(i + 1, 8).setValue(now);
  }
  SpreadsheetApp.flush();
}

function closeDeficitRowsById_(sh, id) {
  var rows = sh.getDataRange().getValues();
  var want = normalizeDeficitId_(id);
  var closed = [];
  for (var i = 1; i < rows.length; i++) {
    if (normalizeDeficitId_(rows[i][0]) !== want) continue;
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
    // Попробуем вытащить день/позицию из текста сообщения и закрыть open-дубли
    var fallbackDay = "";
    var fallbackItem = "";
    try {
      var msgText = String((cq.message && cq.message.text) || "");
      var dayM = msgText.match(/День:\s*(.+)/i);
      var itemM = msgText.match(/Позиция:\s*(.+)/i);
      if (dayM) fallbackDay = String(dayM[1] || "").trim();
      if (itemM) fallbackItem = String(itemM[1] || "").trim();
    } catch (eFb) {}
    if (fallbackDay && fallbackItem) {
      closeSiblingOpenDeficits_(sh, fallbackDay, fallbackItem, 0);
      SpreadsheetApp.flush();
      telegramEditDeficitDone_(cq, fallbackDay, fallbackItem);
      answerText = "Закрыто: " + fallbackItem;
    } else {
      telegramEditDeficitDone_(cq, "—", "уже закрыто или не найдено");
      answerText = "Уже закрыто или не найдено";
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



/* ========== Брони заказов (дата) + материализация D-1 ========== */

var BOOKINGS_HEADERS_ = [
  "id", "date", "client", "subId", "address", "note", "basketJson",
  "source", "status", "dayName", "updatedAt", "pulledAt"
];

function getBookingsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Брони_Заказов");
  if (!sh) {
    sh = ss.insertSheet("Брони_Заказов");
    sh.getRange(1, 1, 1, BOOKINGS_HEADERS_.length).setValues([BOOKINGS_HEADERS_]);
    sh.setFrozenRows(1);
  }
  return sh;
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
  var names = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница"];
  for (var i = 0; i < 5; i++) {
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
      var unit = /шт/i.test(k) ? "шт" : "г";
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
    out.push({
      rowIndex: i + 1,
      id: String(row[0] || ""),
      date: row[1],
      client: String(row[2] || ""),
      subId: String(row[3] || ""),
      address: String(row[4] || ""),
      note: String(row[5] || ""),
      basket: basket,
      source: String(row[7] || "retail"),
      status: String(row[8] || "planned"),
      dayName: String(row[9] || ""),
      updatedAt: row[10],
      pulledAt: row[11]
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
      dayName: b.dayName
    };
  });
  var ok = { status: "success", bookings: list };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
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
  var basket = json.basket || [];
  var note = stripGeoTagsFromNote_(json.note || "");
  if (json.orderPrice != null && json.orderPrice !== "" && !isNaN(Number(json.orderPrice))) {
    note = String(note || "").replace(/\[ЦЕНА:[^\]]*\]/gi, "").replace(/\s{2,}/g, " ").trim();
    note = ("[ЦЕНА: " + Number(json.orderPrice) + " BYN]" + (note ? " " + note : "")).trim();
  }
  if (json.phone) note = applyTelTag_(note, json.phone);
  if (json.subId) note = ("[SUB:" + String(json.subId).trim() + "] " + note).trim();
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
  var rowVals = [
    id, dateStr, client,
    String(json.subId || (existing && existing.subId) || ""),
    String(json.address != null ? json.address : (existing && existing.address) || ""),
    note, JSON.stringify(basket),
    String(json.source || (existing && existing.source) || "retail"),
    wasPulled ? "pulled" : "planned",
    dayName, now,
    wasPulled ? (existing.pulledAt || "") : ""
  ];

  if (existing) {
    sh.getRange(existing.rowIndex, 1, 1, BOOKINGS_HEADERS_.length).setValues([rowVals]);
  } else {
    sh.appendRow(rowVals);
  }

  try {
    upsertClientProfile_(ss, client, json.address, json.phone || extractPhoneFromNote_(note), note, json.source || "retail");
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

  if (json.alsoSaveOrder && (json.day || dayName)) {
    try {
      handleSaveOrder(ss, {
        day: json.day || dayName, client: client, address: json.address,
        note: note, basket: basket, geo: json.geo || null
      }, "cb");
    } catch (eSave) {}
  }

  var ok = {
    status: "success",
    bookingId: id,
    date: dateStr,
    dayName: dayName,
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

  var basketItems = (basket || []).filter(function (it) {
    var v = Number(it && (it.val != null ? it.val : it.value)) || 0;
    var n = String((it && (it.name || it.main)) || "").trim();
    return n && v > 0;
  });

  // Пустая бронь + в дне уже есть состав → только адрес/телефон/note, состав НЕ трогаем
  if (!basketItems.length && hasQty && !opts.forceClear) {
    try {
      var curAddr = String(targetSheet.getRange(block.addr, clientCol).getValue() || "").trim();
      if (address && !curAddr) targetSheet.getRange(block.addr, clientCol).setValue(address);
      else if (address && opts.overwriteMeta) targetSheet.getRange(block.addr, clientCol).setValue(address);
      var cleanNote = stripGeoTagsFromNote_(note || "");
      var curNote = String(targetSheet.getRange(block.note, clientCol).getValue() || "").trim();
      if (cleanNote && !curNote) targetSheet.getRange(block.note, clientCol).setValue(cleanNote);
      else if (cleanNote && opts.overwriteMeta) targetSheet.getRange(block.note, clientCol).setValue(cleanNote);
    } catch (eMeta) {}
    return { ok: true, col: clientCol, preserved: true, created: created };
  }

  // Пустая бронь + пустой день → оболочка (ник/адрес/note), без clear продуктов
  if (!basketItems.length && !hasQty) {
    if (address) targetSheet.getRange(block.addr, clientCol).setValue(address);
    var shellNote = stripGeoTagsFromNote_(note || "");
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
  var cleanNote2 = stripGeoTagsFromNote_(note || "");
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

function handleEnsureDayMaterialized(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var deliveryDate = parseFlexibleDate_(json.deliveryDate || json.date, tz);
  if (!deliveryDate && json.day) {
    deliveryDate = getDayDate_(ss, json.day);
    if (deliveryDate && !(deliveryDate instanceof Date)) {
      deliveryDate = parseFlexibleDate_(deliveryDate, tz);
    }
  }
  if (!deliveryDate) {
    var now = new Date();
    deliveryDate = addDaysDate_(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
  }
  var onlyMissing = !(json.onlyMissing === false || json.onlyMissing === "0" || json.onlyMissing === 0 || json.onlyMissing === "false");
  var result = materializeDeliveryDate_(ss, deliveryDate, { onlyMissing: onlyMissing });
  var out = { status: result.ok ? "success" : "error", result: result };
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}

/** Даты Пн–Пт текущей операционной недели из «Прием заказов». */
function getWeekDayDates_(ss) {
  var tz = ss.getSpreadsheetTimeZone();
  var manager = ss.getSheetByName("Прием заказов");
  var names = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница"];
  var out = [];
  if (!manager) return out;
  for (var i = 0; i < 5; i++) {
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
  return { ok: true, weekKey: weekKey, totalAdded: total, onlyMissing: onlyMissing, days: results };
}

function handleMaterializeWeek(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = materializeCurrentWeek_(ss, json || {});
  var out = { status: "success", result: result };
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}

function handleResolveDayForDate(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var d = parseFlexibleDate_(json.date || json.deliveryDate, tz);
  var dayName = d ? (findDayNameForDate_(ss, d) || "") : "";
  var out = {
    status: "success",
    date: d ? dateKey_(d, tz) : "",
    dayName: dayName,
    onWeek: !!dayName
  };
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}

function handleWeekPullStatus(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
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
  var ok = {
    status: "success",
    weekKey: weekKey,
    days: list,
    weekPeople: weekPeople,
    monthPeople: monthPeople,
    maybeMissing: missingEstimate,
    suggestPull: !!(weekKey && monthPeople > 0 && (weekPeople === 0 || missingEstimate > 0))
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
  var ok = { status: "success", trigger: "morningMaterializeTomorrow@07:00" };
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
function findSheetByBaseName_(ss, baseName) {
  if (!ss || !baseName) return null;
  var exact = ss.getSheetByName(baseName);
  if (exact) return exact;
  var copyRu = ss.getSheetByName(baseName + " (копия)");
  if (copyRu) return copyRu;
  var copyEn = ss.getSheetByName(baseName + " (copy)");
  if (copyEn) return copyEn;
  var want = String(baseName).toUpperCase().replace(/ё/g, "Е");
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = String(sheets[i].getName() || "").toUpperCase().replace(/ё/g, "Е");
    if (n === want || n === want + " (КОПИЯ)" || n === want + " (COPY)") return sheets[i];
  }
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
  var clean = String(note || "").replace(/\[TEL:[^\]]+\]/gi, "").replace(/\s{2,}/g, " ").trim();
  phone = String(phone || "").trim();
  if (!phone) return clean;
  return (clean ? clean + " " : "") + "[TEL:" + phone + "]";
}

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
    var segM = ln.match(/\b(АФК|ПП|БП|Р)\b/i);
    if (segM && !segment) {
      segment = segM[1].toUpperCase();
      var rest = ln.replace(/\b(АФК|ПП|БП|Р)\b/i, "").trim();
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
  return {
    client: display,
    matchKey: clientMatchKey_(extracted || display),
    address: address,
    phone: phone,
    segment: segment || (/варка/i.test(lines[0]) ? "Р" : "ПП"),
    note: noteBits.join("; ")
  };
}

/** Лист месяца: «Июль», «Июль 2026», «Июль (копия)» — без переименования существующих. */
function resolveCrmMonthSheet_(crmSs, deliveryDate) {
  if (!crmSs || !deliveryDate) return null;
  var monthName = CRM_MONTH_NAMES_RU_[deliveryDate.getMonth()];
  var year = deliveryDate.getFullYear();
  var candidates = [
    monthName + " " + year,
    monthName + "_" + year,
    monthName + "-" + year,
    monthName
  ];
  for (var i = 0; i < candidates.length; i++) {
    var sh = findSheetByBaseName_(crmSs, candidates[i]);
    if (sh) return sh;
  }
  // регистронезависимый / «Июль 26»
  var sheets = crmSs.getSheets();
  var wantBase = monthName.toUpperCase().replace(/ё/g, "Е");
  var yearShort = String(year).slice(-2);
  var bestPlain = null;
  for (var s = 0; s < sheets.length; s++) {
    var title = String(sheets[s].getName() || "").trim();
    var tU = title.toUpperCase().replace(/ё/g, "Е").replace(/\s*\(КОПИЯ\)\s*$/, "").replace(/\s*\(COPY\)\s*$/, "");
    if (tU === wantBase) { bestPlain = sheets[s]; continue; }
    if (tU.indexOf(wantBase) !== 0) continue;
    if (tU.indexOf(String(year)) >= 0 || tU.indexOf(yearShort) >= 0) return sheets[s];
  }
  return bestPlain;
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
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var col = -1;
  for (var c = 0; c < headers.length; c++) {
    if (headerDayNumber_(headers[c]) === dayNum) { col = c + 1; break; }
  }
  if (col < 0) return [];
  // важно: getRange(r1,c1,r2,c2) — до lastRow включительно, только нужный столбец
  var values = sh.getRange(2, col, lastRow, col).getValues();
  var out = [];
  var seen = {};
  for (var r = 0; r < values.length; r++) {
    var parsed = parseCrmCalendarCell_(values[r][0]);
    if (!parsed) continue;
    var key = parsed.matchKey || clientMatchKey_(parsed.client);
    if (!key || seen[key]) continue;
    seen[key] = true;
    out.push(parsed);
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
      var headers = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      var days = [];
      var cellsWithNick = 0;
      for (var c = 0; c < headers.length; c++) {
        var dn = headerDayNumber_(headers[c]);
        if (!isFinite(dn) || dn < 1 || dn > 31) continue;
        days.push(dn);
        if (lastRow >= 2) {
          var colVals = sh.getRange(2, c + 1, lastRow, c + 1).getValues();
          for (var r = 0; r < colVals.length; r++) {
            if (parseCrmCalendarCell_(colVals[r][0])) cellsWithNick++;
          }
        }
      }
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
  var h = String(header || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!h || h.indexOf("ЛЮДИ") === 0 || h.indexOf("ID") === 0 || h.indexOf("КОЛИЧ") === 0) return null;
  if (/СТАТУС|ПОЖЕЛАН|ЗАМЕТК|СЕБЕСТОИМ|СУММА|ЦЕНА|ИТОГО/.test(h)) return null;

  var sub = "";
  if (/МЕЛК/.test(h)) sub = "Мелкое";
  else if (/СРЕДН/.test(h)) sub = "Среднее";
  else if (/БОЛЬШ|КРУПН/.test(h)) sub = /РУБЕЦ/.test(h) ? "Крупное" : "Большое";
  else if (/ЦЕЛ/.test(h)) sub = "Целое";

  var name = "";
  if (/БАРАНЬ?Е?\s*Л[ЕЁ]ГК/.test(h)) name = "БАРАНЬЕ ЛЁГКОЕ";
  else if (/Л[ЕЁ]ГК/.test(h)) name = "ЛЁГКОЕ";
  else if (/СЕРДЦ/.test(h)) name = "СЕРДЦЕ";
  else if (/ПОЧК/.test(h)) name = "ПОЧКИ";
  else if (/РУБЕЦ/.test(h)) name = "РУБЕЦ Т";
  else if (/ШЕЯ|ТРАХЕ|УХО|УШИ|НОС|ХВОСТ|СУСТАВ|КОЛЕНО|КОПЫТ|РОГ|СУХОЖИЛ|ПОЗВОН|РЁБР|РЕБР|МОРД|ГУБА|ПЕЧЕН|СЕЛЕЗ|ВЫМЯ|ПЕНИС|БЫЧ/.test(h)) {
    // жевалки / шт — берём исходный заголовок укороченно
    name = String(header || "").replace(/\s+/g, " ").trim();
    sub = "";
    return { name: name, sub: "", cat: "chews", grams: false };
  } else {
    return null;
  }
  return { name: name, sub: sub, cat: "dressura", grams: true };
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
    var val = map.grams ? Math.round(num * 1000) : Math.round(num);
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
    var sh = findSheetByBaseName_(crmSs, sheets[s]);
    if (!sh || sh.getLastRow() < 3) continue;
    var data = sh.getDataRange().getValues();
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
  var sh = findSheetByBaseName_(crmSs, "Контакты");
  if (!sh || sh.getLastRow() < 2) return { address: "", note: "", phone: "" };
  var data = sh.getDataRange().getValues();
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
function syncCrmIntoBookings_(ss, deliveryDate) {
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

  for (var i = 0; i < clients.length; i++) {
    var c = clients[i];
    var existing = null;
    var wasCancelled = false;
    for (var j = 0; j < all.length; j++) {
      var bd = parseFlexibleDate_(all[j].date, tz);
      if (!bd || dateKey_(bd, tz) !== dateStr) continue;
      if (!nicksMatch_(all[j].client, c.client)) continue;
      if (String(all[j].status) === "cancelled") {
        wasCancelled = true;
        continue;
      }
      existing = all[j];
      break;
    }
    // удалили вручную — не возвращать из CRM-календаря
    if (wasCancelled && !existing) {
      skipped++;
      continue;
    }
    if (existing && String(existing.source) === "retail") {
      skipped++;
      continue;
    }
    if (existing && existing.basket && existing.basket.length) {
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
    if (subId) noteParts.push("[SUB:" + subId + "]");
    if (c.segment) noteParts.push("[SEG:" + c.segment + "]");
    if (phone) noteParts.push("[TEL:" + phone + "]");
    if (c.note) noteParts.push(c.note);
    if (contact.note) noteParts.push(contact.note);
    if (filled.hint) noteParts.push(filled.hint);
    var note = noteParts.join(" ").trim();
    var now = new Date();
    var id = existing ? existing.id : ("crm" + Date.now() + "_" + Math.floor(Math.random() * 1e5));
    var clientName = displayClientNick_(c.client);
    if (existing && existing.client && String(existing.client).trim().length >= clientName.length) {
      clientName = String(existing.client).trim();
    }
    var rowVals = [
      id, dateStr, clientName, subId || "", address, note,
      JSON.stringify(basket), "subscription",
      existing && String(existing.status) === "pulled" ? "pulled" : "planned",
      existing ? existing.dayName : "", now,
      existing ? (existing.pulledAt || "") : ""
    ];
    if (existing) {
      sh.getRange(existing.rowIndex, 1, 1, BOOKINGS_HEADERS_.length).setValues([rowVals]);
    } else {
      sh.appendRow(rowVals);
      added++;
    }
  }
  return { ok: true, date: dateStr, fromCalendar: clients.length, added: added, skipped: skipped };
}

/**
 * Состав для брони на дату: ПП → доля слота (N=1 целиком / N=2 половина или остаток);
 * АФК/БП → полный состав с листа подписки.
 */
function fillSubscriptionBasketForDate_(ss, crmSs, client, segment, deliveryDate) {
  var seg = String(segment || "").toUpperCase();
  if (seg === "Р" || seg === "R" || seg === "RETAIL") {
    return { basket: [], subId: "", hint: "" };
  }
  var tz = ss.getSpreadsheetTimeZone() || "Europe/Minsk";
  var dateStr = deliveryDate ? dateKey_(deliveryDate, tz) : "";

  // ПП (или сегмент не указан, но клиент есть в ПП)
  if (!seg || seg === "ПП" || seg === "PP") {
    try {
      var sug = buildPpOrderSuggest_(ss, client, "", dateStr);
      if (sug && sug.proposedBasket && sug.proposedBasket.length) {
        return {
          basket: sug.proposedBasket,
          subId: sug.subId || "",
          hint: sug.hint ? ("[" + sug.hint + "]") : ""
        };
      }
      if (sug && sug.deliveriesN >= 1) {
        return { basket: sug.monthlyBasket || [], subId: sug.subId || "", hint: sug.hint || "" };
      }
    } catch (ePp) {}
  }

  try {
    var found = findSubscriberBasket_(crmSs || getCrmSpreadsheet_(), client, seg || "ПП");
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

var ACCESS_HEADERS_ = ["telegramId", "name", "username", "role", "status", "requestedAt", "note"];
var PRICE_SPREADSHEET_ID_DEFAULT_ = "1c3iETyh_eOGcL0_zsGapzliVEfhQk5fQqbg8aAGAgI0";
var OWNER_IDS_FALLBACK_ = []; // задайте OWNER_TELEGRAM_IDS в Script Properties

function getAccessSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Доступы");
  if (!sh) {
    sh = ss.insertSheet("Доступы");
    sh.getRange(1, 1, 1, ACCESS_HEADERS_.length).setValues([ACCESS_HEADERS_]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function getOwnerTelegramIds_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("OWNER_TELEGRAM_IDS") || "";
  var ids = raw.split(/[,;\s]+/).map(function (s) { return String(s || "").trim(); }).filter(Boolean);
  for (var i = 0; i < OWNER_IDS_FALLBACK_.length; i++) {
    if (ids.indexOf(String(OWNER_IDS_FALLBACK_[i])) < 0) ids.push(String(OWNER_IDS_FALLBACK_[i]));
  }
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
      note: String(data[i][6] || "")
    });
  }
  return out;
}

function findAccessById_(telegramId) {
  var id = String(telegramId || "").trim();
  if (!id) return null;
  var rows = readAccessRows_();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].telegramId === id) return rows[i];
  }
  return null;
}

function roleTabsFor_(role) {
  var r = String(role || "").toLowerCase();
  if (r === "owner") return ["orderScreen", "clientsScreen", "cuttingScreen", "courierScreen", "warehouseScreen", "subsScreen", "priceScreen", "peopleScreen"];
  if (r === "manager") return ["orderScreen", "clientsScreen", "subsScreen", "priceScreen"];
  if (r === "cutter") return ["cuttingScreen"];
  if (r === "courier") return ["courierScreen"];
  if (r === "logistics") return ["warehouseScreen"];
  if (r === "all") return ["orderScreen", "clientsScreen", "cuttingScreen", "courierScreen", "warehouseScreen", "subsScreen", "priceScreen"];
  return [];
}

function handleGetMyAccess(json, callback, fromPost) {
  var init = validateInitDataSoft_(json.initData || "");
  var user = init.user || {};
  var telegramId = String(json.telegramId || user.id || "").trim();
  var name = String(json.name || user.first_name || "").trim();
  var username = String(json.username || user.username || "").trim();

  if (isOwnerId_(telegramId)) {
    upsertAccessRow_(telegramId, name, username, "owner", "active");
    var okOwner = {
      status: "success",
      role: "owner",
      access: "active",
      tabs: roleTabsFor_("owner"),
      telegramId: telegramId,
      name: name,
      initOk: init.ok
    };
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
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function upsertAccessRow_(telegramId, name, username, role, status) {
  var sh = getAccessSheet_();
  var existing = findAccessById_(telegramId);
  var now = new Date();
  if (existing) {
    sh.getRange(existing.rowIndex, 1, 1, 7).setValues([[
      telegramId, name || existing.name, username || existing.username,
      role, status, existing.requestedAt || now, existing.note || ""
    ]]);
  } else {
    sh.appendRow([telegramId, name, username, role, status, now, ""]);
  }
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
    var owners = getOwnerTelegramIds_();
    var text = "Запрос доступа в Бойню\nID: " + telegramId +
      "\nИмя: " + (json.name || "") +
      "\n@" + (json.username || "") +
      "\nНазначьте роль во вкладке Люди.";
    for (var i = 0; i < owners.length; i++) {
      try { telegramSendText_(owners[i], text); } catch (e) {}
    }
    var chat = PropertiesService.getScriptProperties().getProperty("TELEGRAM_CHAT_ID");
    if (chat) try { telegramSendText_(chat, text); } catch (e2) {}
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
      note: r.note
    };
  });
  var ok = { status: "success", people: rows, owners: getOwnerTelegramIds_() };
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
  upsertAccessRow_(target, (json.name || (existing && existing.name) || ""), (json.username || (existing && existing.username) || ""), role, status);
  try { telegramSendText_(target, "Вам назначена роль: " + role); } catch (e) {}
  var ok = { status: "success", telegramId: target, role: role, access: status };
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wh = ss.getSheetByName("Склад");
  if (!wh) {
    var bad = { status: "error", message: "no_warehouse" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var last = Math.min(60, Math.max(2, wh.getLastRow()));
  var names = wh.getRange(2, 1, last - 1, 1).getValues();
  var arrivals = wh.getRange(2, 2, last - 1, 1).getValues();
  var stock = wh.getRange(2, 6, last - 1, 1).getValues();
  var buyFlags = wh.getRange(2, 7, last - 1, 1).getValues();
  var items = [];
  for (var i = 0; i < names.length; i++) {
    var name = String(names[i][0] || "").trim();
    if (!name) continue;
    var row = i + 2;
    var piece = /шт/i.test(name);
    var kVal = "";
    try {
      if (piece) kVal = wh.getRange(row, 11).getValue();
    } catch (e) {}
    items.push({
      row: row,
      name: name,
      arrival: round2_(arrivals[i][0]),
      stock: round2_(stock[i][0]),
      buy: !!buyFlags[i][0],
      unit: piece ? "шт" : "кг",
      stockPcs: piece ? round2_(kVal) : null
    });
  }
  var ledger = [];
  try {
    var led = getLedgerSheet_();
    var lr = led.getLastRow();
    if (lr > 1) {
      var from = Math.max(2, lr - 29);
      var data = led.getRange(from, 1, lr - from + 1, 7).getValues();
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
  } catch (e2) {}
  var ok = { status: "success", items: items, ledger: ledger };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
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
  var ok = { status: "success", row: row, arrival: qty };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleWarehousePreview(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wh = ss.getSheetByName("Склад");
  var cutting = ss.getSheetByName("Нарезка");
  if (!wh) {
    var bad = { status: "error", message: "no_warehouse" };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  // упрощённый preview: текущий остаток F + дозакуп B vs сырьё по активной нарезке D
  var last = Math.min(50, Math.max(2, wh.getLastRow()));
  var names = wh.getRange(2, 1, last - 1, 1).getValues();
  var arrivals = wh.getRange(2, 2, last - 1, 1).getValues();
  var stock = wh.getRange(2, 6, last - 1, 1).getValues();
  var deficits = [];
  for (var i = 0; i < names.length; i++) {
    var name = String(names[i][0] || "").trim();
    if (!name || /шт/i.test(name)) continue;
    var f = Number(stock[i][0]) || 0;
    var b = Number(arrivals[i][0]) || 0;
    var need = 0;
    try {
      if (cutting) {
        // эвристика: строки нарезки с объёмом
        var cRow = i + 3;
        var dry = 0;
        // skip detailed map — flag low stock only
      }
    } catch (e) {}
    if (f + b <= 0.01 && f === 0) {
      /* skip empty names without stock concern */
    }
    if (f + b < 0.5 && (f > 0 || b > 0)) {
      deficits.push({ row: i + 2, name: name, stock: f, arrival: b, available: f + b });
    }
  }
  var buyList = [];
  try {
    var flags = wh.getRange(2, 7, last - 1, 1).getValues();
    for (var j = 0; j < names.length; j++) {
      if (flags[j][0]) buyList.push({ row: j + 2, name: String(names[j][0] || "") });
    }
  } catch (e2) {}
  var ok = { status: "success", deficits: deficits, buyList: buyList, note: "Полный расход недели — при закрытии (owner)." };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/* ----- Подписки CRM ----- */

function handleListSubscriptions(json, callback, fromPost) {
  var crmSs;
  try { crmSs = getCrmSpreadsheet_(); } catch (e) {
    var bad = { status: "error", message: "crm_unavailable", detail: String(e) };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var sheets = ["ПП", "АФК", "БП"];
  var list = [];
  var seen = {};
  for (var s = 0; s < sheets.length; s++) {
    var sh = findSheetByBaseName_(crmSs, sheets[s]);
    if (!sh || sh.getLastRow() < 3) continue;
    var data = sh.getDataRange().getValues();
    for (var r = 2; r < data.length; r++) {
      var nickRaw = String(data[r][0] || "").trim();
      if (!nickRaw) continue;
      var nick = extractInstagramNick_(nickRaw);
      var subId = String(data[r][1] || "").trim();
      var key = (subId || nick).toUpperCase();
      if (!key || seen[key]) continue;
      seen[key] = true;
      list.push({
        nick: nick,
        label: nickRaw.replace(/\s+/g, " ").trim().substring(0, 80),
        subId: subId,
        deliveries: Number(data[r][2]) || 0,
        status: String(data[r][3] || ""),
        wishes: String(data[r][4] || ""),
        sheet: sheets[s]
      });
    }
  }
  var ok = { status: "success", subscriptions: list };
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
  var found = findSubscriberBasket_(crmSs, nick || subId, json.segment || "ПП");
  var contact = lookupContactAddress_(crmSs, nick);
  var ok = {
    status: "success",
    nick: nick,
    subId: found.subId || subId,
    basket: found.basket || [],
    wishes: found.wishes || "",
    address: contact.address || "",
    note: contact.note || "",
    sheet: found.sheet || ""
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
  return /шт\.?|колен|копыт|нос|ухо|уши|шея|хрящ|хвост|рога?|сустав/i.test(name);
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
  return e && typeof e === "object" ? e : null;
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

/** Сколько раз клиент уже отмечен доставленным в этом календарном месяце (по Память_Доставок + лист Доставки). */
function countPpDeliveredThisMonth_(ss, clientName, dateValue, tz, excludeDateText) {
  var want = String(clientName || "").trim().toUpperCase();
  if (!want || !dateValue) return 0;
  var ym = Utilities.formatDate(dateValue, tz, "yyyy-MM");
  var seen = {};
  var n = 0;
  var memory = getMemoryCourierSheet_();
  if (memory && memory.getLastRow() >= 1) {
    var data = memory.getDataRange().getValues();
    for (var i = 0; i < data.length; i++) {
      var rawKey = String(data[i][0] || "");
      if (/^(PP_CYCLE:|WEEK_PAID:)/i.test(rawKey)) continue;
      var dt = formatSheetDate(data[i][0], tz);
      if (!dt || (excludeDateText && dt === excludeDateText)) continue;
      var parsed = parseMemoryDateLoose_(data[i][0], tz);
      if (!parsed) continue;
      if (Utilities.formatDate(parsed, tz, "yyyy-MM") !== ym) continue;
      var mem = null;
      try { mem = JSON.parse(String(data[i][1] || "")); } catch (eJ) { mem = null; }
      if (!mem || typeof mem !== "object" || Object.prototype.toString.call(mem) === "[object Array]") continue;
      if (normalizeMemDelivered_(mem[want])) {
        if (!seen[dt]) { seen[dt] = true; n++; }
      }
    }
  }
  // текущий лист «Доставки», если дата этого месяца
  try {
    var courier = ss.getSheetByName("Доставки");
    if (courier) {
      var curTxt = formatSheetDate(courier.getRange("A1").getValue(), tz);
      var curParsed = parseMemoryDateLoose_(courier.getRange("A1").getValue(), tz);
      if (curParsed && Utilities.formatDate(curParsed, tz, "yyyy-MM") === ym &&
          (!excludeDateText || curTxt !== excludeDateText) && !seen[curTxt]) {
        var col = findCourierClientCol_(courier, clientName);
        if (col > 0 && courier.getRange(2, col).getValue() === true) {
          seen[curTxt] = true;
          n++;
        }
      }
    }
  } catch (eC) {}
  return n;
}

function resolvePpDeliverySlot_(ss, clientName, dateValue, tz, deliveredToday) {
  var memory = getMemoryCourierSheet_();
  var cycle = getPpCycleEntry_(memory, dateValue, tz, clientName);
  var deliveriesN = lookupPpDeliveries_(clientName);
  if (!(deliveriesN >= 1)) deliveriesN = 0;
  var dateText = formatSheetDate(dateValue, tz);
  var before = countPpDeliveredThisMonth_(ss, clientName, dateValue, tz, deliveredToday ? null : dateText);
  // если сегодня уже в счётчике — before включает сегодня
  if (deliveredToday) {
    var slotDone = Math.max(1, before);
    if (cycle && cycle.slot1 && cycle.slot1.date === dateText) slotDone = 1;
    else if (cycle && cycle.slot1) slotDone = Math.max(2, slotDone);
    return { slot: Math.min(deliveriesN || slotDone, slotDone), deliveriesN: deliveriesN, cycle: cycle };
  }
  var slot = before + 1;
  if (cycle && cycle.slot1 && cycle.slot1.date !== dateText) slot = Math.max(slot, 2);
  if (cycle && !cycle.slot1) slot = Math.max(1, Math.min(slot, 1));
  if (deliveriesN >= 2) slot = Math.min(Math.max(1, slot), deliveriesN);
  else if (deliveriesN === 1) slot = 1;
  return { slot: slot, deliveriesN: deliveriesN, cycle: cycle, deliveredBefore: before };
}

function buildPpOrderSuggest_(ss, nick, dayName, dateStr) {
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

  var resolved = resolvePpDeliverySlot_(ss, nick, dateValue, tz, deliveredToday);
  var slot = resolved.slot || 1;
  var cycle = resolved.cycle;
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
    else if (paid === "no") askPaid = true;
    else askPaid = true;
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
    paid: paid,
    askPaid: askPaid,
    factCost: factCost,
    monthlyBasket: monthly,
    proposedBasket: proposed,
    slot1Basket: slot1Basket,
    remainingBasket: remaining,
    hint: deliveriesN >= 2
      ? ("ПП N=" + deliveriesN + " · доставка " + slot + "/" + deliveriesN + (slot >= 2 ? " (остаток)" : " (доля)"))
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
    var out = buildPpOrderSuggest_(ss, nick, String(json.day || "").trim(), String(json.date || json.deliveryDate || "").trim());
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
  // если slot1 ещё нет — это первая доставка месяца
  if (!cycle.slot1) slot = 1;
  else if (cycle.slot1.date !== dateText) slot = 2;

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
    var sh = findSheetByBaseName_(crmSs, "ПП");
    if (!sh || sh.getLastRow() < 3) return 0;
    var data = sh.getDataRange().getValues();
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
  var days = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница"];
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
  "БАРАНЬЕ ЛЁГКОЕ|Целое": { per100: 12 },
  "БАРАНЬЕ ЛЁГКОЕ": { per100: 14 },
  "ПЕЧЕНЬ": { per100: 9 },
  "СВЕТЛЫЙ РУБЕЦ": { per100: 9 },
  "КНИЖКА": { per100: 9 },
  "ВЫМЯ": { per100: 9 },
  "СЕМЕННИКИ": { per100: 12 },
  "МЯСНЫЕ ЛОМТИКИ": { per100: 13 },
  "ПИКАЛЬНОЕ МЯСО": { per100: 10 },
  "ИНДЕЙКА": { per100: 16 },
  "БАРАНЬЯ ПЕЧЕНЬ": { per100: 17 },
  "КРОШКА ЛЁГКОГО": { packs: { "20": 5, "50": 7, "100": 10 }, per100: 10 },
  "КРОШКА ПОЧЕК": { packs: { "20": 5, "50": 7, "100": 10 }, per100: 10 },
  "КРОШКА СЕРДЦА": { packs: { "20": 7, "50": 9, "100": 12 }, per100: 12 },
  "КРОШКА РУБЕЦ": { packs: { "20": 7, "50": 9, "100": 12 }, per100: 12 },
  "КРОШКА МИКС": { packs: { "20": 6, "50": 8, "100": 11 }, per100: 11 },
  "БАНАНЫ": { per100: 10 },
  "ЯБЛОКИ": { per100: 9 },
  "ГРУШИ": { per100: 10 },
  "МОРКОВЬ": { per100: 10 },
  "ТЫКВА": { per100: 12 },
  "БАТАТ": { per100: 11 },
  "КАБАЧОК": { per100: 12 },
  "КОПЫТО шт.": { perPiece: 9 },
  "КОЛЕНИ шт.": { perPiece: 6 },
  "НОСЫ шт.": { perPiece: 7 },
  "ЛОП ХРЯЩ шт.": { perPiece: 4 },
  "УТИНЫЕ ШЕИ шт.": { perPiece: 3 },
  "ПЕРЕПЁЛКИ шт.": { perPiece: 4 },
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
    "УТИНЫЕ ШЕИ ШТ.": "УТИНЫЕ ШЕИ шт."
  };
  if (aliases[u]) return aliases[u];
  if (u.indexOf("КРОШКА РУБ") === 0) return "КРОШКА РУБЕЦ";
  return n;
}

function retailLineCost_(name, sub, val, cat) {
  var n = retailNormalizeName_(name);
  var s = String(sub || "").trim();
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
  if (info.perPiece != null || String(cat || "") === "chew" || /шт/i.test(n)) {
    var pp = Number(info.perPiece || 0);
    return { cost: Math.round(pp * v * 100) / 100, per: pp, found: true };
  }
  var p = Number(info.per100 || 0);
  return { cost: Math.round((v / 100) * p * 100) / 100, per: p, found: true };
}



function getPriceSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty("PRICE_SPREADSHEET_ID") || PRICE_SPREADSHEET_ID_DEFAULT_;
  return SpreadsheetApp.openById(id);
}

function readPriceCosts_(mode) {
  var ss = getPriceSpreadsheet_();
  var m = String(mode || "").toLowerCase();
  var sheetName = "Подписка";
  if (m.indexOf("розн") >= 0 || m === "retail") sheetName = "Розница";
  else if (m === "bp" || m.indexOf("бп") >= 0) sheetName = ss.getSheetByName("БП") ? "БП" : "Подписка";
  else if (m === "pp" || m === "subscription" || m.indexOf("пп") >= 0) sheetName = "Подписка";
  var sh = ss.getSheetByName(sheetName) || ss.getSheets()[0];
  var data = sh.getDataRange().getValues();
  if (!data.length) return { costs: {}, headers: [] };
  var headers = data[0];
  var costRow = null;
  for (var r = 0; r < Math.min(5, data.length); r++) {
    var label = String(data[r][0] || "").toLowerCase();
    if (label.indexOf("себестоим") >= 0 || label.indexOf("100") >= 0) {
      costRow = data[r];
      break;
    }
  }
  if (!costRow && data.length > 1) costRow = data[1];
  var costs = {};
  for (var c = 6; c < headers.length; c++) {
    var map = mapCrmHeaderToItem_(headers[c]);
    if (!map) continue;
    var key = map.name + (map.sub ? " / " + map.sub : "");
    var price = Number(String(costRow[c] || "").replace(",", ".")) || 0;
    costs[key] = { per100: price, name: map.name, sub: map.sub, grams: map.grams };
  }
  return { costs: costs, sheet: sheetName };
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
    var rok = {
      status: "success",
      mode: mode,
      sheet: "витрина IG",
      lines: rLines,
      cost: rTotal,
      markup: 1,
      total: rTotal
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
    var per100 = info ? info.per100 : 0;
    var cost = (val / 100) * per100;
    totalCost += cost;
    lines.push({ name: name, sub: sub, val: val, per100: per100, cost: Math.round(cost * 100) / 100 });
  }
  var markup = 2.3;
  var total = Math.round(totalCost * markup * 100) / 100;
  var ok = {
    status: "success",
    mode: mode,
    sheet: priceInfo.sheet,
    lines: lines,
    cost: Math.round(totalCost * 100) / 100,
    markup: markup,
    total: total
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

/* ----- Сборка / пакеты ----- */

function packCountForLight_(grams) {
  var g = Number(grams) || 0;
  if (g <= 0) return 0;
  if (g <= 20) return 1;
  if (g <= 80) return 2;
  if (g <= 150) return 3;
  if (g <= 200) return 4;
  return Math.ceil(g / 200) * 4;
}

function packCountForBulk_(grams) {
  var g = Number(grams) || 0;
  if (g <= 0) return 0;
  if (g <= 25) return 1;
  if (g <= 120) return 2;
  if (g <= 200) return 3;
  if (g <= 300) return 4;
  return Math.ceil(g / 300) * 4;
}

/** Нормализация фракции лёгкого → ключ счётчика. */
function lightFractionCounterKey_(sub) {
  var u = String(sub || '').trim().toUpperCase();
  if (!u || u.indexOf('БЕЗ') >= 0) return 'средний';
  if (/МЕЛК|МАЛ/.test(u) && !/ОЧ/.test(u)) return 'маленький';
  if (/СРЕД/.test(u)) return 'средний';
  if (/КРУПН|БОЛЬШ|БОЛ/.test(u)) return 'большой';
  if (/ЦЕЛ/.test(u)) return 'целое';
  return 'средний';
}

function buildAssemblyForBasket_(basket) {
  var packs = [];
  var totalBags = 0;
  var typeCounts = { light: 0, bulk: 0, chew: 0, craft: 0, other: 0 };
  var lightMap = {};
  var lightBagsByCounter = {};
  (basket || []).forEach(function (it) {
    var name = String(it.name || it.main || '').trim();
    var sub = String(it.sub || '').trim();
    var val = Number(it.val != null ? it.val : it.value) || 0;
    var cat = String(it.cat || '').toLowerCase();
    var unit = String(it.unit || '').trim() || (/шт/i.test(name) ? 'шт' : 'гр');
    if (!name || val <= 0) return;
    var bags = 0;
    var rule = '';
    var type = 'other';
    var counterKey = '';
    if (/л[её]гк/i.test(name)) {
      bags = packCountForLight_(val);
      rule = 'лёгкое';
      type = 'light';
      var fk = sub || 'Среднее';
      lightMap[fk] = (lightMap[fk] || 0) + val;
      counterKey = lightFractionCounterKey_(fk);
      lightBagsByCounter[counterKey] = (lightBagsByCounter[counterKey] || 0) + bags;
    } else if (cat === 'chew' || /шт/i.test(name) || /быч|трахе|аорт|ухо|нос|станова|колен|копыт|переп|губ|книжк/i.test(name)) {
      bags = Math.max(1, Math.ceil(val / 4));
      rule = 'жевалки×4';
      type = 'chew';
      counterKey = '';
    } else if (cat === 'other' || /крафт|индейк|ломтик|вымя|семен|пикальн|печень|светл/i.test(name)) {
      bags = Math.max(1, Math.ceil(val / 5)) + 1;
      rule = 'крафт×5+запас';
      type = 'craft';
      counterKey = 'крафт';
    } else if (cat === 'dressura' || cat === 'powder' || cat === 'veg') {
      bags = packCountForBulk_(val);
      rule = 'сыпучее';
      type = 'bulk';
      counterKey = '';
    } else {
      bags = packCountForBulk_(val);
      rule = 'сыпучее';
      type = 'bulk';
      counterKey = '';
    }
    totalBags += bags;
    typeCounts[type] = (typeCounts[type] || 0) + bags;
    packs.push({
      name: name,
      sub: sub,
      val: val,
      unit: unit,
      bags: bags,
      rule: rule,
      type: type,
      counterKey: counterKey,
      label: name + (sub ? ' / ' + sub : '') + ' → ' + bags + ' пак.'
    });
  });
  var lightByFraction = [];
  for (var k in lightMap) {
    if (lightMap.hasOwnProperty(k)) lightByFraction.push({ sub: k, val: lightMap[k] });
  }
  return {
    packs: packs,
    totalBags: totalBags,
    typeCounts: typeCounts,
    lightByFraction: lightByFraction,
    lightBagsByCounter: lightBagsByCounter
  };
}

function handleGetAssembly(json, callback, fromPost) {
  var day = json.day || '';
  var clientsData = getClientsData_(SpreadsheetApp.getActiveSpreadsheet(), day);
  if (clientsData.status !== 'success') {
    var bad = { status: 'error', message: clientsData.status || 'bad_day' };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var typeTotals = { light: 0, bulk: 0, chew: 0, craft: 0, other: 0 };
  var counterTotals = {};
  var lightAll = {};
  var out = (clientsData.clients || []).map(function (c) {
    var plan = buildAssemblyForBasket_(c.basket || []);
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
    return {
      name: c.name,
      address: c.address || '',
      note: c.note || '',
      basket: c.basket || [],
      packs: plan.packs,
      totalBags: plan.totalBags,
      lightByFraction: plan.lightByFraction,
      lightBagsByCounter: plan.lightBagsByCounter || {}
    };
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
    date: clientsData.date || '',
    clients: out,
    typeTotals: typeTotals,
    counterTotals: counterTotals,
    lightByFraction: lightByFraction,
    lightGramsTotal: lightGramsTotal
  };
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

function handleGetStats(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var now = new Date();
  var monthName = Utilities.formatDate(now, tz, "MMMM yyyy");
  var ppActive = 0, bpFunnel = 0, deliveries = 0;
  try {
    var crm = getCrmSpreadsheet_();
    var pp = findSheetByBaseName_(crm, "ПП");
    if (pp && pp.getLastRow() >= 3) ppActive = Math.max(0, pp.getLastRow() - 2);
    var bp = findSheetByBaseName_(crm, "БП");
    if (bp && bp.getLastRow() >= 3) bpFunnel = Math.max(0, bp.getLastRow() - 2);
  } catch (e) {}
  try {
    var days = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница"];
    for (var i = 0; i < days.length; i++) {
      var d = getClientsData_(ss, days[i]);
      deliveries += (d.clients || []).length;
    }
  } catch (e2) {}
  var ok = {
    status: "success",
    title: "Календарный месяц · " + monthName,
    period: json.period || "month",
    ppActive: ppActive,
    bpFunnel: bpFunnel,
    deliveries: deliveries,
    revenue: "—",
    note: "Каркас: полный архив/воронка/CAC — наращиваем. Экспорт — exportStats."
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleExportStats(json, callback, fromPost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = ["date\tclient\tday\taddress"];
  try {
    var days = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница"];
    for (var i = 0; i < days.length; i++) {
      var d = getClientsData_(ss, days[i]);
      var dateText = d.date || "";
      (d.clients || []).forEach(function (c) {
        lines.push([dateText, c.name || "", days[i], (c.address || "").replace(/\t/g, " ")].join("\t"));
      });
    }
  } catch (e) {}
  var ok = {
    status: "success",
    format: json.format || "accountant",
    message: "TSV текущей недели (каркас бухгалтера)",
    tsv: lines.join("\n")
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handleListSurvey(json, callback, fromPost) {
  var ok = {
    status: "success",
    items: [],
    note: "Опросник БП2/ПП1 — каркас; лист подключим в полном F"
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}



function handleGetPpFactCost(json, callback, fromPost) {
  var nick = String(json.nick || json.client || "").trim();
  var out = { status: "success", nick: nick, factCost: null, deliveries: 0 };
  try {
    var crmSs = getCrmSpreadsheet_();
    var sh = findSheetByBaseName_(crmSs, "ПП");
    if (!sh || sh.getLastRow() < 2) {
      return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
    }
    var data = sh.getDataRange().getValues();
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
  } catch (e) {
    out.status = "error";
    out.message = String(e);
  }
  return fromPost ? jsonpText(callback, out) : jsonp(callback, out);
}

function ensureBpAndSurveyFromOrder_(json) {
  if (String(json.orderType || "") !== "bp") return;
  if (json.survey && json.survey.needSurvey === false) return;
  var crmSs = getCrmSpreadsheet_();
  var nick = String(json.client || "").trim();
  if (!nick) return;
  var bp = findSheetByBaseName_(crmSs, "БП");
  if (bp) {
    // append minimal row if not exists
    var data = bp.getDataRange().getValues();
    var want = extractInstagramNick_(nick).toUpperCase();
    var found = false;
    for (var r = 2; r < data.length; r++) {
      if (extractInstagramNick_(data[r][0]).toUpperCase() === want) { found = true; break; }
    }
    if (!found) {
      var basket = json.basket || [];
      bp.appendRow([nick, "", 1, "БП1", "", JSON.stringify(basket)]);
    }
  }
  var survey = findSheetByBaseName_(crmSs, "Опросник");
  if (!survey) {
    try {
      survey = crmSs.insertSheet("Опросник");
      survey.appendRow(["nick", "tag", "sentAt", "dueAt", "note", "status"]);
    } catch (e2) {}
  }
  if (survey) {
    var sent = json.survey && json.survey.surveyDate ? json.survey.surveyDate : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    survey.appendRow([nick, "БП2", sent, "", "from_order", "new"]);
  }
}

