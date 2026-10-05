/**
 * Well Sneakers — бесплатная операционка (касса / склад).
 *
 * Отдельный Apps Script и отдельная Google-таблица.
 * Не вставлять в проект Бойни, Goodboy или Varka и не делать clasp push
 * в их scriptId.
 *
 * Секреты — только Script Properties (см. README.md):
 *   BOT_TOKEN, ADMIN_TELEGRAM_IDS, SPREADSHEET_ID,
 *   SYNC_SECRET, VPS_SYNC_URL, VPS_SYNC_SECRET, ALLOW_DEV_STAFF
 *
 * Контракт действий повторяет нужды miniapp Касса + Склад:
 *   me, search, getProduct, sale, stock, inventory, arrivals,
 *   arrivalPrinted, createProduct, nextArticle, exportCatalog
 */

var WS_TZ = "Europe/Minsk";

function doGet(e) {
  return wsDispatch_(e, false);
}

function doPost(e) {
  return wsDispatch_(e, true);
}

function setupWellOps() {
  var ss = wsSpreadsheet_();
  wsEnsureSheets_(ss);
  return "ok " + ss.getId();
}

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("Well Ops")
      .addItem("Создать листы", "setupWellOps")
      .addToUi();
  } catch (e) {}
}

function wsDispatch_(e, isPost) {
  var params = (e && e.parameter) || {};
  var callback = wsSafeCallback(params.callback);
  try {
    var req = {};
    if (isPost && e && e.postData && e.postData.contents) {
      var raw = String(e.postData.contents || "").trim();
      if (raw) req = JSON.parse(raw);
    }
    if (params.payload) {
      var extra = JSON.parse(params.payload);
      if (extra && typeof extra === "object") {
        Object.keys(extra).forEach(function (k) {
          if (req[k] == null || req[k] === "") req[k] = extra[k];
        });
      }
    }
    ["action", "initData", "q", "id", "all", "syncSecret", "dev", "devTelegramId", "devName"].forEach(function (k) {
      if ((req[k] == null || req[k] === "") && params[k]) req[k] = params[k];
    });
    if (!req.action && params.action) req.action = params.action;
    var result = wsRoute_(req);
    return wsRespond_(result, callback);
  } catch (err) {
    return wsRespond_({ ok: false, error: String(err && err.message ? err.message : err) }, callback);
  }
}

function wsRespond_(obj, callback) {
  var json = JSON.stringify(obj);
  var body = callback ? callback + "(" + json + ")" : json;
  return ContentService.createTextOutput(body).setMimeType(
    callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON
  );
}

function wsRoute_(req) {
  var action = wsAsText(req.action);
  if (!action || action === "ping") {
    return { ok: true, service: "wellsneakers-ops", status: "online", time: new Date().toISOString() };
  }
  if (action === "exportCatalog" || action === "markSynced") {
    var denied = wsAssertSyncSecret_(req);
    if (denied) return denied;
    var ssSync = wsSpreadsheet_();
    if (action === "markSynced") {
      wsMetaSet_(ssSync, "sync_products", "");
      wsMetaSet_(ssSync, "sync_dirty", "0");
      wsMetaSet_(ssSync, "sync_last_ok", wsNow_());
      return { ok: true, marked: true };
    }
    var only = [];
    if (req.onlyDirty === true || req.onlyDirty === "1" || req.onlyDirty === 1) {
      only = wsAsText(wsMetaGet_(ssSync, "sync_products")).split(",").filter(Boolean);
    }
    var data = wsLoad_(ssSync);
    return {
      ok: true,
      generated_at: new Date().toISOString(),
      dirty: wsMetaGet_(ssSync, "sync_dirty") === "1",
      products: wsBuildCatalog(data.products, data.sizes, only)
    };
  }

  var auth = wsAuthenticate_(req);
  if (!auth.ok) return auth;
  var staff = auth.staff;
  var ss = wsSpreadsheet_();

  if (action === "me") return { ok: true, staff: staff };
  if (action === "ensureSheets") {
    if (staff.role !== "admin") return { ok: false, error: "admin_only" };
    wsEnsureSheets_(ss);
    return { ok: true };
  }
  if (action === "orders" || action === "orderStatus") {
    return {
      ok: false,
      error: "web_orders_stay_on_vps",
      message: "Сайт-заказы в v1 остаются в Postgres на VPS."
    };
  }
  if (action === "photo") {
    return {
      ok: false,
      error: "photos_stay_on_vps",
      message: "Фото в v1 остаются на VPS (/uploads)."
    };
  }

  if (action === "search") {
    var data = wsLoad_(ss);
    var includeZero = req.all === "1" || req.all === 1 || req.all === true || req.includeZero === "1";
    return { ok: true, products: wsSearchProducts(data.products, data.sizes, req.q || "", includeZero) };
  }
  if (action === "getProduct") {
    var loaded = wsLoad_(ss);
    var product = wsProductDetail(loaded.products, loaded.sizes, req.id || req.product_id);
    if (!product) return { ok: false, error: "not_found" };
    return { ok: true, product: product };
  }
  if (action === "nextArticle") {
    if (staff.role !== "admin") return { ok: false, error: "admin_only" };
    return { ok: true, article: wsNextArticle(wsLoad_(ss).products) };
  }
  if (action === "arrivals") {
    if (staff.role !== "admin") return { ok: false, error: "admin_only" };
    return { ok: true, arrivals: wsListArrivals_(ss) };
  }

  return wsWithLock_(function () {
    if (action === "sale") return wsSale_(ss, staff, req);
    if (action === "stock") return wsStock_(ss, staff, req);
    if (action === "inventory") return wsInventory_(ss, staff, req);
    if (action === "arrivalPrinted") return wsArrivalPrinted_(ss, staff, req);
    if (action === "createProduct") return wsCreateProduct_(ss, staff, req);
    return { ok: false, error: "unknown_action", action: action };
  });
}

function wsProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || "";
}

function wsSpreadsheet_() {
  var id = wsProp_("SPREADSHEET_ID");
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error("spreadsheet_missing");
  return active;
}

function wsNow_() {
  return Utilities.formatDate(new Date(), WS_TZ, "yyyy-MM-dd HH:mm:ss");
}

function wsWithLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function wsAdminIds_() {
  return wsProp_("ADMIN_TELEGRAM_IDS")
    .split(/[,;\s]+/)
    .map(function (x) { return Number(String(x).trim()); })
    .filter(function (n) { return n > 0; });
}

function wsAuthenticate_(req) {
  var token = wsProp_("BOT_TOKEN") || wsProp_("TELEGRAM_BOT_TOKEN");
  var user = null;
  if (req.initData && token) {
    user = wsVerifyInitData_(String(req.initData), token);
    if (!user || !user.id) return { ok: false, error: "invalid_init_data" };
  } else if (wsProp_("ALLOW_DEV_STAFF") === "1" && (req.dev === true || req.dev === "1" || req.dev === 1)) {
    var devId = Number(req.devTelegramId || 0);
    if (!devId) return { ok: false, error: "dev_id_required" };
    user = { id: devId, first_name: wsAsText(req.devName) || "Dev" };
  } else {
    return { ok: false, error: "auth_required" };
  }

  var telegramId = Number(user.id);
  var name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Staff";
  var ss = wsSpreadsheet_();
  wsEnsureSheets_(ss);
  var isAdmin = wsAdminIds_().indexOf(telegramId) >= 0;
  var row = wsFindStaff_(ss, telegramId);
  if (isAdmin) {
    wsUpsertStaff_(ss, telegramId, name, "admin", true);
    return { ok: true, staff: { telegramId: telegramId, name: name, role: "admin", active: true, dev: !req.initData } };
  }
  if (!row || !wsIsActive(row.active)) return { ok: false, error: "staff_not_allowed" };
  var role = wsAsText(row.role).toLowerCase() === "admin" ? "admin" : "seller";
  return {
    ok: true,
    staff: {
      telegramId: telegramId,
      name: wsAsText(row.name) || name,
      role: role,
      active: true,
      dev: !req.initData
    }
  };
}

function wsVerifyInitData_(initData, botToken) {
  var parsed = wsBuildDataCheckString(initData);
  if (!parsed.hash || !parsed.check) return null;
  var secret = Utilities.computeHmacSha256Signature(botToken, "WebAppData");
  var sig = Utilities.computeHmacSha256Signature(Utilities.newBlob(parsed.check).getBytes(), secret);
  var hex = wsBytesToHex(sig);
  if (!wsConstantTimeEqual(hex, String(parsed.hash).toLowerCase())) return null;
  if (parsed.authDate && Date.now() / 1000 - parsed.authDate > 86400) return null;
  return parsed.user;
}

function wsAssertSyncSecret_(req) {
  var secret = wsProp_("SYNC_SECRET") || wsProp_("VPS_SYNC_SECRET");
  if (!secret) return { ok: false, error: "sync_secret_not_configured" };
  if (!wsConstantTimeEqual(String(req.syncSecret || ""), secret)) return { ok: false, error: "bad_sync_secret" };
  return null;
}

function wsEnsureSheets_(ss) {
  Object.keys(WS_SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(WS_SHEETS[name]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, WS_SHEETS[name].length).setFontWeight("bold");
    }
  });
  var meta = wsReadTable_(ss.getSheetByName("Meta"));
  var have = {};
  meta.forEach(function (row) { have[wsAsText(row.key)] = true; });
  WS_META_SEED.forEach(function (pair) {
    if (!have[pair[0]]) wsAppend_(ss.getSheetByName("Meta"), "Meta", { key: pair[0], value: pair[1] });
  });
}

function wsReadTable_(sh) {
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return [];
  var headers = values[0].map(function (h) { return wsAsText(h); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var obj = { _row: r + 1 };
    var empty = true;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      obj[headers[c]] = values[r][c];
      if (values[r][c] !== "" && values[r][c] != null) empty = false;
    }
    if (!empty) rows.push(obj);
  }
  return rows;
}

function wsAppend_(sh, sheetName, obj) {
  var headers = WS_SHEETS[sheetName];
  sh.appendRow(headers.map(function (h) { return obj[h] == null ? "" : obj[h]; }));
}

function wsUpdate_(sh, rowNumber, sheetName, key, value) {
  var col = WS_SHEETS[sheetName].indexOf(key);
  if (col < 0) throw new Error("unknown_col_" + key);
  sh.getRange(rowNumber, col + 1).setValue(value);
}

function wsLoad_(ss) {
  wsEnsureSheets_(ss);
  return {
    products: wsReadTable_(ss.getSheetByName("Products")),
    sizes: wsReadTable_(ss.getSheetByName("Sizes")),
    staff: wsReadTable_(ss.getSheetByName("StaffUsers"))
  };
}

function wsMetaGet_(ss, key) {
  var rows = wsReadTable_(ss.getSheetByName("Meta"));
  for (var i = 0; i < rows.length; i++) {
    if (wsAsText(rows[i].key) === key) return rows[i].value == null ? "" : String(rows[i].value);
  }
  return "";
}

function wsMetaSet_(ss, key, value) {
  var sh = ss.getSheetByName("Meta");
  var rows = wsReadTable_(sh);
  for (var i = 0; i < rows.length; i++) {
    if (wsAsText(rows[i].key) === key) {
      wsUpdate_(sh, rows[i]._row, "Meta", "value", value);
      return;
    }
  }
  wsAppend_(sh, "Meta", { key: key, value: value });
}

function wsNextId_(ss, key) {
  var n = Number(wsMetaGet_(ss, key) || "1");
  if (!isFinite(n) || n < 1) n = 1;
  wsMetaSet_(ss, key, String(n + 1));
  return n;
}

function wsFindStaff_(ss, telegramId) {
  var rows = wsReadTable_(ss.getSheetByName("StaffUsers"));
  for (var i = 0; i < rows.length; i++) {
    if (Number(rows[i].telegram_id) === Number(telegramId)) return rows[i];
  }
  return null;
}

function wsUpsertStaff_(ss, telegramId, name, role, active) {
  var sh = ss.getSheetByName("StaffUsers");
  var rows = wsReadTable_(sh);
  for (var i = 0; i < rows.length; i++) {
    if (Number(rows[i].telegram_id) === Number(telegramId)) {
      wsUpdate_(sh, rows[i]._row, "StaffUsers", "name", name);
      wsUpdate_(sh, rows[i]._row, "StaffUsers", "role", role);
      wsUpdate_(sh, rows[i]._row, "StaffUsers", "active", active);
      wsUpdate_(sh, rows[i]._row, "StaffUsers", "updated_at", wsNow_());
      return;
    }
  }
  wsAppend_(sh, "StaffUsers", {
    telegram_id: telegramId,
    name: name,
    role: role,
    active: active,
    updated_at: wsNow_()
  });
}

function wsNoteDirty_(ss, productIds) {
  var set = {};
  wsAsText(wsMetaGet_(ss, "sync_products")).split(",").forEach(function (id) {
    if (id) set[id] = true;
  });
  (productIds || []).forEach(function (id) {
    if (wsAsText(id)) set[wsAsText(id)] = true;
  });
  wsMetaSet_(ss, "sync_products", Object.keys(set).join(","));
  wsMetaSet_(ss, "sync_dirty", "1");
}

function wsPushSync_(ss) {
  var url = wsProp_("VPS_SYNC_URL");
  var secret = wsProp_("VPS_SYNC_SECRET") || wsProp_("SYNC_SECRET");
  if (!url || !secret) return { pushed: false, reason: "vps_sync_not_configured" };
  var ids = wsAsText(wsMetaGet_(ss, "sync_products")).split(",").filter(Boolean);
  if (!ids.length) return { pushed: false, reason: "nothing_dirty" };
  var data = wsLoad_(ss);
  var products = wsBuildCatalog(data.products, data.sizes, ids);
  try {
    var res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "X-Sync-Secret": secret },
      payload: JSON.stringify({ source: "wellsneakers-ops", products: products }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      wsMetaSet_(ss, "sync_products", "");
      wsMetaSet_(ss, "sync_dirty", "0");
      wsMetaSet_(ss, "sync_last_ok", wsNow_());
      return { pushed: true, count: products.length, status: code };
    }
    return { pushed: false, reason: "vps_http_" + code };
  } catch (e) {
    return { pushed: false, reason: String(e && e.message ? e.message : e) };
  }
}

function wsAfterMutation_(ss, productIds) {
  wsNoteDirty_(ss, productIds);
  try {
    return wsPushSync_(ss);
  } catch (e) {
    return { pushed: false, reason: String(e && e.message ? e.message : e) };
  }
}

function wsSale_(ss, staff, req) {
  var data = wsLoad_(ss);
  var plan = wsPlanSale(data.products, data.sizes, req.items, req.discount_byn != null ? req.discount_byn : req.discountByn);
  if (!plan.ok) return plan;
  var saleId = wsNextId_(ss, "next_sale_id");
  var pay = wsAsText(req.payment_method || req.paymentMethod) || "cash";
  wsAppend_(ss.getSheetByName("Sales"), "Sales", {
    id: saleId,
    operation: "sale",
    staff_telegram_id: staff.telegramId,
    staff_name: staff.name,
    payment_method: pay,
    discount_byn: plan.discount,
    total_byn: plan.total,
    comment: wsAsText(req.comment),
    created_at: wsNow_(),
    sync_status: "pending"
  });
  var sizeSheet = ss.getSheetByName("Sizes");
  var touched = {};
  plan.lines.forEach(function (line) {
    var itemId = wsNextId_(ss, "next_sale_item_id");
    wsAppend_(ss.getSheetByName("SaleItems"), "SaleItems", {
      id: itemId,
      sale_id: saleId,
      product_id: line.product_id,
      article: line.article,
      size: line.size,
      qty: line.qty,
      price_byn: line.price_byn,
      product_name: line.product_name
    });
    wsSetSizeQty_(sizeSheet, data.sizes, line.product_id, line.article, line.size, plan.sizeQty[wsSizeKey(line.product_id, line.size)]);
    var moveId = wsNextId_(ss, "next_movement_id");
    wsAppend_(ss.getSheetByName("Movements"), "Movements", {
      id: moveId,
      product_id: line.product_id,
      article: line.article,
      size: line.size,
      delta: -line.qty,
      reason: "sale",
      ref_type: "sale",
      ref_id: saleId,
      created_at: wsNow_()
    });
    touched[line.product_id] = true;
  });
  var sync = wsAfterMutation_(ss, Object.keys(touched));
  if (sync.pushed) {
    var sales = ss.getSheetByName("Sales");
    var saleRows = wsReadTable_(sales);
    saleRows.forEach(function (row) {
      if (wsAsText(row.id) === String(saleId)) wsUpdate_(sales, row._row, "Sales", "sync_status", "pushed");
    });
  }
  return {
    ok: true,
    sale: { id: saleId, total_byn: plan.total, discount_byn: plan.discount, payment_method: pay },
    sync: sync
  };
}

function wsSetSizeQty_(sizeSheet, sizes, productId, article, size, qty) {
  for (var i = 0; i < sizes.length; i++) {
    if (wsAsText(sizes[i].product_id) === wsAsText(productId) && wsAsText(sizes[i].size) === wsAsText(size)) {
      wsUpdate_(sizeSheet, sizes[i]._row, "Sizes", "qty", qty);
      return;
    }
  }
  throw new Error("size_row_missing");
}

function wsStock_(ss, staff, req) {
  if (staff.role !== "admin") return { ok: false, error: "admin_only" };
  var data = wsLoad_(ss);
  var plan = wsPlanStock(data.products, data.sizes, req.product_id || req.productId, req.size, req.qty);
  if (!plan.ok) return plan;
  var sizeSheet = ss.getSheetByName("Sizes");
  if (plan.existing) {
    wsUpdate_(sizeSheet, plan.existing._row, "Sizes", "qty", plan.nextQty);
  } else {
    wsAppend_(sizeSheet, "Sizes", {
      id: wsNextId_(ss, "next_size_id"),
      product_id: plan.product.id,
      article: plan.product.article,
      size: plan.size,
      qty: plan.nextQty
    });
  }
  var arrivalId = wsNextId_(ss, "next_arrival_id");
  wsAppend_(ss.getSheetByName("Arrivals"), "Arrivals", {
    id: arrivalId,
    product_id: plan.product.id,
    article: plan.product.article,
    product_name: plan.product.name,
    size: plan.size,
    qty: plan.addQty,
    label_printed: false,
    staff_telegram_id: staff.telegramId,
    created_at: wsNow_()
  });
  wsAppend_(ss.getSheetByName("Movements"), "Movements", {
    id: wsNextId_(ss, "next_movement_id"),
    product_id: plan.product.id,
    article: plan.product.article,
    size: plan.size,
    delta: plan.addQty,
    reason: "arrival",
    ref_type: "arrival",
    ref_id: arrivalId,
    created_at: wsNow_()
  });
  var sync = wsAfterMutation_(ss, [plan.product.id]);
  return {
    ok: true,
    arrival: { id: arrivalId, product_id: plan.product.id, size: plan.size, qty: plan.addQty, label_printed: false },
    labelUrl: wsLabelPath_(plan.product, plan.size),
    sync: sync
  };
}

function wsInventory_(ss, staff, req) {
  if (staff.role !== "admin") return { ok: false, error: "admin_only" };
  var data = wsLoad_(ss);
  var plan = wsPlanInventory(data.products, data.sizes, req.product_id || req.productId, req.sizes);
  if (!plan.ok) return plan;
  var sizeSheet = ss.getSheetByName("Sizes");
  plan.changes.forEach(function (ch) {
    if (ch.existing) {
      wsUpdate_(sizeSheet, ch.existing._row, "Sizes", "qty", ch.qty);
    } else {
      wsAppend_(sizeSheet, "Sizes", {
        id: wsNextId_(ss, "next_size_id"),
        product_id: plan.product.id,
        article: plan.product.article,
        size: ch.size,
        qty: ch.qty
      });
    }
    if (ch.delta !== 0) {
      wsAppend_(ss.getSheetByName("Movements"), "Movements", {
        id: wsNextId_(ss, "next_movement_id"),
        product_id: plan.product.id,
        article: plan.product.article,
        size: ch.size,
        delta: ch.delta,
        reason: "inventory",
        ref_type: "inventory",
        ref_id: plan.product.id,
        created_at: wsNow_()
      });
    }
  });
  var sync = wsAfterMutation_(ss, [plan.product.id]);
  var fresh = wsLoad_(ss);
  return { ok: true, product: wsProductDetail(fresh.products, fresh.sizes, plan.product.id), sync: sync };
}

function wsArrivalPrinted_(ss, staff, req) {
  if (staff.role !== "admin") return { ok: false, error: "admin_only" };
  var sh = ss.getSheetByName("Arrivals");
  var rows = wsReadTable_(sh);
  var found = null;
  rows.forEach(function (row) {
    if (wsAsText(row.id) === wsAsText(req.id)) found = row;
  });
  if (!found) return { ok: false, error: "not_found" };
  wsUpdate_(sh, found._row, "Arrivals", "label_printed", true);
  return { ok: true, arrival: { id: wsAsText(found.id), label_printed: true } };
}

function wsCreateProduct_(ss, staff, req) {
  if (staff.role !== "admin") return { ok: false, error: "admin_only" };
  var name = wsAsText(req.name);
  var article = wsAsText(req.article);
  if (!name || !article) return { ok: false, error: "name_and_article_required" };
  var data = wsLoad_(ss);
  var dup = false;
  data.products.forEach(function (p) {
    if (wsAsText(p.article).toLowerCase() === article.toLowerCase()) dup = true;
  });
  if (dup) return { ok: false, error: "article_exists" };
  var id = wsNextId_(ss, "next_product_id");
  var now = wsNow_();
  var oldPrice = req.old_price_byn === "" || req.old_price_byn == null ? "" : wsNum(req.old_price_byn);
  wsAppend_(ss.getSheetByName("Products"), "Products", {
    id: id,
    article: article,
    barcode: wsAsText(req.barcode) || article,
    name: name,
    brand: wsAsText(req.brand),
    price_byn: wsNum(req.price_byn),
    old_price_byn: oldPrice,
    active: true,
    image_url: "",
    vps_product_id: "",
    created_at: now,
    updated_at: now
  });
  var sizes = Array.isArray(req.sizes) ? req.sizes : [];
  sizes.forEach(function (s) {
    var size = wsAsText(s && s.size);
    var qty = wsNum(s && s.qty);
    if (!size || qty <= 0) return;
    wsAppend_(ss.getSheetByName("Sizes"), "Sizes", {
      id: wsNextId_(ss, "next_size_id"),
      product_id: id,
      article: article,
      size: size,
      qty: qty
    });
    var arrivalId = wsNextId_(ss, "next_arrival_id");
    wsAppend_(ss.getSheetByName("Arrivals"), "Arrivals", {
      id: arrivalId,
      product_id: id,
      article: article,
      product_name: name,
      size: size,
      qty: qty,
      label_printed: false,
      staff_telegram_id: staff.telegramId,
      created_at: now
    });
    wsAppend_(ss.getSheetByName("Movements"), "Movements", {
      id: wsNextId_(ss, "next_movement_id"),
      product_id: id,
      article: article,
      size: size,
      delta: qty,
      reason: "arrival",
      ref_type: "product",
      ref_id: id,
      created_at: now
    });
  });
  var sync = wsAfterMutation_(ss, [id]);
  var fresh = wsLoad_(ss);
  return {
    ok: true,
    product: wsProductDetail(fresh.products, fresh.sizes, id),
    labelUrls: [],
    sync: sync
  };
}

function wsListArrivals_(ss) {
  var rows = wsReadTable_(ss.getSheetByName("Arrivals"));
  rows.sort(function (a, b) { return wsAsText(b.created_at).localeCompare(wsAsText(a.created_at)); });
  return rows.slice(0, 100).map(function (a) {
    return {
      id: wsAsText(a.id),
      product_id: wsAsText(a.product_id),
      article: wsAsText(a.article),
      product_name: wsAsText(a.product_name),
      size: wsAsText(a.size),
      qty: wsNum(a.qty),
      label_printed: a.label_printed === true || wsAsText(a.label_printed).toLowerCase() === "true",
      created_at: wsAsText(a.created_at)
    };
  });
}

function wsLabelPath_(product, size) {
  var id = product.vps_product_id || "";
  if (!id) return "";
  return "/api/labels/" + encodeURIComponent(id) + "?size=" + encodeURIComponent(size);
}
