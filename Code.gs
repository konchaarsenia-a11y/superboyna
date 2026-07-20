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
  for (var cRow = 3; cRow <= 48; cRow++) {
    var total = 0;
    var rows = itemMap[cRow];
    if (matrix && rows) {
      for (var r = 0; r < rows.length; r++) {
        var rowIndex = rows[r] + offset - 1;
        for (var col = 0; col < 15; col++) total += Number(matrix[rowIndex][col]) || 0;
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

  var sheetMemory = ss.getSheetByName("Память_Нарезки");
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
  var sheetMemCourier = ss.getSheetByName("Память_Доставок");
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

  var sheetMemory = ss.getSheetByName("Память_Нарезки");
  if (sheetMemory && sheetMemory.getLastRow() > 0) {
    sheetMemory.getRange(1, 1, sheetMemory.getLastRow(), 2).clearContent();
  }
  var sheetMemCourier2 = ss.getSheetByName("Память_Доставок");
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
    newDay: e.parameter.newDay ? decodeURIComponent(e.parameter.newDay) : ""
  };

  // getClients — только чтение
  if (action === "getClients") {
    return handleGetClients(payload.day, callback);
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

  // delete / move доступны и через GET (JSONP из mini-app)
  if (action === "deleteClient" || action === "moveClient") {
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
  return fromPost ? jsonpText(callback, { status: "unknown_action" }) : jsonp(callback, { status: "unknown_action" });
}

function handleGetCutting(dayName, callback) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cutting = ss.getSheetByName("Нарезка");
  var warehouse = ss.getSheetByName("Склад");
  var memory = ss.getSheetByName("Память_Нарезки");
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
    cutterNotes: collectDayRoleNotes_(ss, dayName, "cut")
  });
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
    var memory = ss.getSheetByName("Память_Нарезки");
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
  var want = String(clientName || "").trim().toUpperCase();
  var nicks = courierSheet.getRange(3, 3, 1, 16).getValues()[0];
  for (var i = 0; i < nicks.length; i++) {
    var nick = String(nicks[i] || "").trim().toUpperCase();
    if (!nick || nick === "ИТОГО НА ДЕНЬ" || nick === "ИТОГО" || nick === "ФАКТ СНЯТОЕ") continue;
    if (nick === want) return i + 3; // 1-based column
  }
  return -1;
}

function handleGetCourier(dayName, callback) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var courier = ss.getSheetByName("Доставки");
  var memory = ss.getSheetByName("Память_Доставок");
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
        delivered = memFlags[String(client.name).toUpperCase()] === true;
      }
    }
    clients.push({
      name: client.name,
      address: client.address,
      note: client.note,
      geo: client.geo || null,
      basket: client.basket,
      delivered: delivered,
      col: client.col,
      courierCol: courierCol
    });
  }
  return jsonp(callback, { status: "success", day: dayName, date: dateText, clients: clients });
}

function handleSetDelivered(ss, json, callback) {
  var block = getDayBlock(json.day);
  var targetSheet = getTargetSheet(ss, block);
  var courier = ss.getSheetByName("Доставки");
  var memory = ss.getSheetByName("Память_Доставок");
  var tz = ss.getSpreadsheetTimeZone();
  var dateValue = getDayDate_(ss, json.day);
  if (!block || !targetSheet || !dateValue) return jsonpText(callback, { status: "bad_day" });

  var want = String(json.client || "").trim().toUpperCase();
  var nicks = targetSheet.getRange(block.nick, 3, 1, 15).getValues()[0];
  var mgrIdx = -1;
  for (var i = 0; i < nicks.length; i++) {
    if (String(nicks[i] || "").trim().toUpperCase() === want) {
      mgrIdx = i;
      break;
    }
  }
  if (mgrIdx < 0) return jsonpText(callback, { status: "client_not_found" });

  var dateText = formatSheetDate(dateValue, tz);
  var delivered = json.delivered === true || String(json.delivered).toLowerCase() === "true";
  var courierCol = findCourierClientCol_(courier, json.client);

  if (courier && formatSheetDate(courier.getRange("A1").getValue(), tz) === dateText && courierCol > 0) {
    courier.getRange(2, courierCol).setValue(delivered);
  } else {
    if (!memory) memory = ss.insertSheet("Память_Доставок");
    var values = getMemoryJson_(memory, dateText, tz);
    if (!values || Object.prototype.toString.call(values) === "[object Array]") {
      values = {};
    }
    values[want] = delivered;
    saveMemoryJson_(memory, dateText, values, tz);
  }
  return jsonpText(callback, { status: "success" });
}

function handleDeleteClient(ss, json, callback) {
  var block = getDayBlock(json.day);
  if (!block) return jsonp(callback, { status: "bad_day" });
  var targetSheet = getTargetSheet(ss, block);
  if (!targetSheet) return jsonp(callback, { status: "error" });

  var nicksRowValues = targetSheet.getRange(block.nick, 3, 1, 15).getValues()[0];
  var want = String(json.client || "").trim().toUpperCase();
  for (var i = 0; i < 15; i++) {
    var currentNick = nicksRowValues[i] ? nicksRowValues[i].toString().trim().toUpperCase() : "";
    if (currentNick === want) {
      var targetCol = i + 3;
      targetSheet.getRange(block.nick, targetCol).setValue("");
      // товары + адрес + примечание
      targetSheet.getRange(block.start, targetCol, block.note - block.start + 1, 1).clearContent();
      checkLiveDeficitAndNotify();
      return jsonp(callback, { status: "success" });
    }
  }
  return jsonp(callback, { status: "client_not_found" });
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
  targetSheet.getRange(dstBlock.note, newClientCol).setValue(oldNoteValue);

  sourceSheet.getRange(srcBlock.nick, oldClientCol).setValue("");
  sourceSheet.getRange(srcBlock.start, oldClientCol, srcBlock.note - srcBlock.start + 1, 1).clearContent();

  checkLiveDeficitAndNotify();
  return jsonp(callback, { status: "success" });
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

  var want = String(json.client || "").trim().toUpperCase();
  if (!want) return jsonpText(callback, { status: "no_client" });

  var clientCol = -1;
  var mgrNicks = targetSheet.getRange(block.nick, 3, 1, 15).getValues()[0];
  for (var i = 0; i < 15; i++) {
    var mNick = mgrNicks[i] ? mgrNicks[i].toString().trim().toUpperCase() : "";
    if (mNick === want) {
      clientCol = i + 3;
      break;
    }
  }
  if (clientCol === -1) {
    for (var colIdx = 3; colIdx <= 17; colIdx++) {
      if (targetSheet.getRange(block.nick, colIdx).getValue().toString().trim() === "") {
        clientCol = colIdx;
        targetSheet.getRange(block.nick, clientCol).setValue(json.client);
        break;
      }
    }
  }
  if (clientCol === -1) return jsonpText(callback, { status: "no_free_columns" });

  // очистка товаров + адрес + примечание
  targetSheet.getRange(block.start, clientCol, block.note - block.start + 1, 1).clearContent();
  if (json.address) targetSheet.getRange(block.addr, clientCol).setValue(json.address);
  // GEO не пишем в примечание — только служебные теги доставки + текст курьеру
  var cleanNote = stripGeoTagsFromNote_(json.note || "");
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
      else if (sheetFull.indexOf(subNorm) > -1) score = 8;
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
    "МОРКОВИ": "МОРКОВЬ"
  };
  if (aliases[n]) return aliases[n];
  return n;
}

function normalizeFraction(s) {
  if (!s) return "";
  var u = String(s).trim().toUpperCase();
  if (u === "МЕЛКОЕ" || u === "МАЛ") return "МАЛ";
  if (u === "СРЕДНЕЕ" || u === "СРЕД") return "СРЕД";
  if (u === "БОЛЬШОЕ" || u === "БОЛ") return "БОЛ";
  if (u === "КРУПНОЕ") return "КРУПНОЕ";
  if (u === "ЦЕЛОЕ" || u === "ЦЕЛ") return "ЦЕЛОЕ";
  if (u === "ОЧ МАЛ" || u === "ОЧЕНЬ МЕЛКОЕ") return "ОЧ МАЛ";
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

function handleGetClients(dayName, callback) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = getClientsData_(ss, dayName);
  for (var i = 0; i < data.clients.length; i++) delete data.clients[i].col;
  return jsonp(callback, data);
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
        clientsDataList.push({
          name: nameClean,
          orderCount: totalItemsInOrder,
          address: rawAddr != null ? String(rawAddr).trim() : "",
          note: noteStr,
          geo: geoObj || null,
          basket: clientBasket,
          col: colIdx
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
    var parts = [];
    if (p.name) parts.push(String(p.name));
    if (p.street && p.street !== p.name) parts.push(String(p.street));
    if (p.housenumber) parts.push(String(p.housenumber));
    var title = parts.length ? parts.join(", ") : String(p.name || p.street || "Адрес");
    var subParts = [];
    if (p.district) subParts.push(String(p.district));
    if (p.city || p.town || p.village) subParts.push(String(p.city || p.town || p.village));
    if (p.state && !/минск/i.test(String(p.city || ""))) subParts.push(String(p.state));
    var subtitle = subParts.join(", ");
    var address = title + (subtitle ? (", " + subtitle) : "");
    if (!/минск/i.test(address) && (p.city === "Minsk" || /Minsk/i.test(String(p.city || p.state || "")))) {
      address = address + ", Минск";
    }
    var keyDup = lat.toFixed(5) + "," + lon.toFixed(5);
    if (seen[keyDup]) continue;
    seen[keyDup] = true;
    out.push({
      title: title,
      subtitle: subtitle || "Минск",
      address: address,
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
  ));
}

function collectDayRoleNotes_(ss, dayName, role) {
  var data = getClientsData_(ss, dayName);
  var out = [];
  var clients = (data && data.clients) || [];
  for (var i = 0; i < clients.length; i++) {
    var raw = clients[i].note || "";
    if (!noteVisibleForRole_(raw, role)) continue;
    var text = cleanNoteText_(raw);
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
    var text = cleanNoteText_(rawNote);
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

function getGeoSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Гео_Клиентов");
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
  var sh = ss.getSheetByName("Гео_Клиентов");
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
  var sh = ss.getSheetByName("Гео_Клиентов");
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Дефицит_Нарезки");
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
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var id = String(Date.now()) + "_" + String(Math.floor(Math.random() * 1e5)) + "_" + i;
    var rowVals = [
      id,
      day,
      String(it.name || ""),
      Number(it.row) || 0,
      "open",
      now,
      notifyFrom,
      ""
    ];
    sh.appendRow(rowVals);
    if (immediate) {
      try {
        sendDeficitPushForRow_(rowVals);
        sh.getRange(sh.getLastRow(), 8).setValue(now);
      } catch (ePush) {}
    }
  }
  ensureDeficitTrigger_();
  var ok = { status: "success", count: items.length };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
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
    var memory = ss.getSheetByName("Память_Нарезки");
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Итоги_Нарезки");
  if (!sh) {
    sh = ss.insertSheet("Итоги_Нарезки");
    sh.getRange(1, 1, 1, 3).setValues([["date", "day", "json"]]);
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
    var sh = ss.getSheetByName("Итоги_Нарезки");
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
      text: text || "Ок",
      show_alert: false
    }),
    muteHttpExceptions: true
  });
}

function sendDeficitPushForRow_(rowValues) {
  var id = String(rowValues[0] || "");
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
  var sh = getDeficitSheet_();
  var data = sh.getDataRange().getValues();
  var now = new Date();
  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][4] || "");
    if (status !== "open") continue;
    var notifyFrom = data[i][6] ? new Date(data[i][6]) : null;
    if (notifyFrom && now < notifyFrom) continue;
    var last = data[i][7] ? new Date(data[i][7]) : null;
    if (last && (now.getTime() - last.getTime()) < 29 * 60 * 1000) continue;
    sendDeficitPushForRow_(data[i]);
    sh.getRange(i + 1, 8).setValue(now);
  }
}

function handleDeficitCallback_(cq) {
  var data = String((cq && cq.data) || "");
  var m = data.match(/^defdone:(.+)$/);
  if (!m) {
    telegramAnswerCallback_(cq.id, "Неизвестная кнопка");
    return;
  }
  var id = m[1];
  var sh = getDeficitSheet_();
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === id) {
      sh.getRange(i + 1, 5).setValue("closed");
      var item = String(rows[i][2] || "");
      var day = String(rows[i][1] || "");
      var rowNum = Number(rows[i][3]) || 0;
      if (rowNum >= 3) {
        try {
          handleUpdateCutting(SpreadsheetApp.getActiveSpreadsheet(), {
            day: day, row: rowNum, done: true, laid: true
          }, "cb", true);
        } catch (e) {}
      }
      telegramAnswerCallback_(cq.id, "Куплено и заготовлено: " + item);
      try {
        var token = getTelegramToken_();
        if (token && cq.message && cq.message.chat) {
          UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/editMessageText", {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify({
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              text: "✅ Куплено и заготовлено\n" + day + " · " + item
            }),
            muteHttpExceptions: true
          });
        }
      } catch (eEdit) {}
      try {
        if (cq.from) {
          upsertCourier_(cq.from.id, [cq.from.first_name, cq.from.last_name].filter(Boolean).join(" "), cq.from.username || "");
        }
      } catch (e2) {}
      return;
    }
  }
  telegramAnswerCallback_(cq.id, "Уже закрыто или не найдено");
}

