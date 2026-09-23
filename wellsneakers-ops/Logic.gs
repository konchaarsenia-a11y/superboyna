/**
 * Well Sneakers ops — чистые правила кассы/склада.
 * Без SpreadsheetApp: этот файл можно прогнать тестами в Node.
 * В Apps Script он лежит рядом с Code.gs (общий глобальный scope).
 */

var WS_SHEETS = {
  Products: ["id", "article", "barcode", "name", "brand", "price_byn", "old_price_byn", "active", "image_url", "vps_product_id", "created_at", "updated_at"],
  Sizes: ["id", "product_id", "article", "size", "qty"],
  Sales: ["id", "operation", "staff_telegram_id", "staff_name", "payment_method", "discount_byn", "total_byn", "comment", "created_at", "sync_status"],
  SaleItems: ["id", "sale_id", "product_id", "article", "size", "qty", "price_byn", "product_name"],
  Arrivals: ["id", "product_id", "article", "product_name", "size", "qty", "label_printed", "staff_telegram_id", "created_at"],
  Movements: ["id", "product_id", "article", "size", "delta", "reason", "ref_type", "ref_id", "created_at"],
  StaffUsers: ["telegram_id", "name", "role", "active", "updated_at"],
  Meta: ["key", "value"]
};

var WS_META_SEED = [
  ["schema_version", "1"],
  ["next_product_id", "1"],
  ["next_size_id", "1"],
  ["next_sale_id", "1"],
  ["next_sale_item_id", "1"],
  ["next_arrival_id", "1"],
  ["next_movement_id", "1"],
  ["sync_dirty", "0"],
  ["sync_products", ""],
  ["sync_last_ok", ""]
];

function wsAsText(v) {
  if (v == null) return "";
  if (typeof v === "number" && isFinite(v)) {
    if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
    return String(v);
  }
  return String(v).trim();
}

function wsNum(v) {
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

function wsRound2(n) {
  return Math.round(wsNum(n) * 100) / 100;
}

function wsIsActive(v) {
  if (v === false || v === 0) return false;
  var s = wsAsText(v).toLowerCase();
  return s !== "false" && s !== "0" && s !== "no";
}

function wsSizeKey(productId, size) {
  return wsAsText(productId) + "\t" + wsAsText(size);
}

function wsGroupSizes(sizes) {
  var map = {};
  (sizes || []).forEach(function (s) {
    var id = wsAsText(s.product_id);
    if (!map[id]) map[id] = [];
    map[id].push(s);
  });
  return map;
}

function wsShapeProduct(p, sizeList) {
  return {
    id: wsAsText(p.id),
    name: wsAsText(p.name),
    brand: wsAsText(p.brand),
    article: wsAsText(p.article),
    barcode: wsAsText(p.barcode || p.article),
    price_byn: wsNum(p.price_byn),
    old_price_byn: p.old_price_byn === "" || p.old_price_byn == null ? null : wsNum(p.old_price_byn),
    image_url: wsAsText(p.image_url),
    vps_product_id: wsAsText(p.vps_product_id),
    active: wsIsActive(p.active),
    sizes: sizeList || []
  };
}

function wsSearchProducts(products, sizes, q, includeZero) {
  var query = wsAsText(q).toLowerCase();
  if (!query) return [];
  var grouped = wsGroupSizes(sizes);
  var hits = [];
  (products || []).forEach(function (p) {
    if (!wsIsActive(p.active)) return;
    var article = wsAsText(p.article).toLowerCase();
    var barcode = wsAsText(p.barcode).toLowerCase();
    var name = wsAsText(p.name).toLowerCase();
    var brand = wsAsText(p.brand).toLowerCase();
    if (article.indexOf(query) < 0 && barcode.indexOf(query) < 0 && name.indexOf(query) < 0 && brand.indexOf(query) < 0) {
      return;
    }
    var list = (grouped[wsAsText(p.id)] || []).map(function (s) {
      return { size: wsAsText(s.size), qty: wsNum(s.qty) };
    });
    var stock = list.reduce(function (sum, s) { return sum + (s.qty > 0 ? s.qty : 0); }, 0);
    if (!includeZero && stock <= 0) return;
    if (!includeZero) list = list.filter(function (s) { return s.qty > 0; });
    list.sort(function (a, b) { return a.size.localeCompare(b.size, "ru", { numeric: true }); });
    hits.push({
      exact: article === query || barcode === query ? 0 : 1,
      name: wsAsText(p.name),
      product: wsShapeProduct(p, list)
    });
  });
  hits.sort(function (a, b) {
    if (a.exact !== b.exact) return a.exact - b.exact;
    return a.name.localeCompare(b.name, "ru");
  });
  return hits.slice(0, 20).map(function (h) { return h.product; });
}

function wsFindProduct(products, idOrArticle) {
  var key = wsAsText(idOrArticle);
  if (!key) return null;
  var byId = null;
  var byArticle = null;
  (products || []).forEach(function (p) {
    if (wsAsText(p.id) === key) byId = p;
    if (wsAsText(p.article) === key || wsAsText(p.barcode) === key) byArticle = byArticle || p;
  });
  return byId || byArticle || null;
}

function wsProductDetail(products, sizes, idOrArticle) {
  var p = wsFindProduct(products, idOrArticle);
  if (!p) return null;
  var list = (sizes || []).filter(function (s) {
    return wsAsText(s.product_id) === wsAsText(p.id);
  }).map(function (s) {
    return { size: wsAsText(s.size), qty: wsNum(s.qty) };
  });
  list.sort(function (a, b) { return a.size.localeCompare(b.size, "ru", { numeric: true }); });
  return wsShapeProduct(p, list);
}

function wsNextArticle(products) {
  var max = 1000;
  (products || []).forEach(function (p) {
    var digits = wsAsText(p.article).replace(/\D/g, "");
    if (!digits) return;
    var n = Number(digits);
    if (n > max) max = n;
  });
  return String(max + 1);
}

function wsPlanSale(products, sizes, items, discountByn) {
  if (!Array.isArray(items) || !items.length) return { ok: false, error: "empty_items" };
  var left = {};
  (sizes || []).forEach(function (s) {
    left[wsSizeKey(s.product_id, s.size)] = wsNum(s.qty);
  });
  var lines = [];
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var product = null;
    (products || []).forEach(function (p) {
      if (wsAsText(p.id) === wsAsText(item.product_id) && wsIsActive(p.active)) product = p;
    });
    if (!product) return { ok: false, error: "product_not_found" };
    var qty = wsNum(item.qty) || 1;
    if (qty <= 0) return { ok: false, error: "invalid_qty" };
    var size = wsAsText(item.size);
    if (!size) return { ok: false, error: "size_required" };
    var k = wsSizeKey(product.id, size);
    if (left[k] == null || left[k] < qty) {
      return { ok: false, error: "insufficient_stock", detail: { article: wsAsText(product.article), size: size } };
    }
    left[k] = left[k] - qty;
    var rawPrice = Number(item.price_byn);
    var price = isFinite(rawPrice) ? rawPrice : wsNum(product.price_byn);
    total += price * qty;
    lines.push({
      product_id: wsAsText(product.id),
      article: wsAsText(product.article),
      size: size,
      qty: qty,
      price_byn: wsRound2(price),
      product_name: wsAsText(product.name)
    });
  }
  var discount = wsNum(discountByn);
  if (discount < 0) discount = 0;
  return {
    ok: true,
    discount: wsRound2(discount),
    total: wsRound2(Math.max(0, total - discount)),
    lines: lines,
    sizeQty: left
  };
}

function wsPlanStock(products, sizes, productId, size, qty) {
  var add = wsNum(qty);
  var sizeText = wsAsText(size);
  if (!sizeText || !(add > 0)) return { ok: false, error: "invalid_body" };
  var product = wsFindProduct(products, productId);
  if (!product || !wsIsActive(product.active)) return { ok: false, error: "product_not_found" };
  var prev = 0;
  var row = null;
  (sizes || []).forEach(function (s) {
    if (wsAsText(s.product_id) === wsAsText(product.id) && wsAsText(s.size) === sizeText) {
      prev = wsNum(s.qty);
      row = s;
    }
  });
  return {
    ok: true,
    product: wsShapeProduct(product, []),
    size: sizeText,
    addQty: add,
    prevQty: prev,
    nextQty: prev + add,
    existing: row
  };
}

function wsPlanInventory(products, sizes, productId, incoming) {
  if (!Array.isArray(incoming)) return { ok: false, error: "invalid_body" };
  var product = wsFindProduct(products, productId);
  if (!product) return { ok: false, error: "product_not_found" };
  var changes = [];
  incoming.forEach(function (s) {
    var size = wsAsText(s && s.size);
    if (!size) return;
    var qty = Math.max(0, Math.round(wsNum(s.qty)));
    var prev = 0;
    var row = null;
    (sizes || []).forEach(function (ex) {
      if (wsAsText(ex.product_id) === wsAsText(product.id) && wsAsText(ex.size) === size) {
        prev = wsNum(ex.qty);
        row = ex;
      }
    });
    changes.push({ size: size, qty: qty, prev: prev, delta: qty - prev, existing: row });
  });
  return { ok: true, product: wsShapeProduct(product, []), changes: changes };
}

function wsBuildCatalog(products, sizes, onlyIds) {
  var allow = null;
  if (onlyIds && onlyIds.length) {
    allow = {};
    onlyIds.forEach(function (id) { if (wsAsText(id)) allow[wsAsText(id)] = true; });
  }
  var grouped = wsGroupSizes(sizes);
  var out = [];
  (products || []).forEach(function (p) {
    var id = wsAsText(p.id);
    if (allow && !allow[id]) return;
    var list = (grouped[id] || []).map(function (s) {
      return { size: wsAsText(s.size), qty: wsNum(s.qty) };
    });
    out.push(wsShapeProduct(p, list));
  });
  return out;
}

/** Разбор Telegram initData в data-check-string (как URLSearchParams в Express). HMAC считает Code.gs. */
function wsBuildDataCheckString(initData) {
  var params = {};
  var order = [];
  String(initData || "").split("&").forEach(function (part) {
    if (!part) return;
    var i = part.indexOf("=");
    var rawK = i < 0 ? part : part.slice(0, i);
    var rawV = i < 0 ? "" : part.slice(i + 1);
    var k = decodeURIComponent(String(rawK).replace(/\+/g, " "));
    var v = decodeURIComponent(String(rawV).replace(/\+/g, " "));
    if (!Object.prototype.hasOwnProperty.call(params, k)) order.push(k);
    params[k] = v;
  });
  var hash = params.hash || "";
  delete params.hash;
  var keys = Object.keys(params).sort(function (a, b) { return a.localeCompare(b); });
  var check = keys.map(function (k) { return k + "=" + params[k]; }).join("\n");
  var user = null;
  try { user = JSON.parse(params.user || "null"); } catch (e) { user = null; }
  return {
    hash: hash,
    check: check,
    authDate: Number(params.auth_date || 0),
    user: user
  };
}

function wsConstantTimeEqual(a, b) {
  var left = String(a || "");
  var right = String(b || "");
  if (left.length !== right.length) return false;
  var diff = 0;
  for (var i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function wsBytesToHex(bytes) {
  var hex = "";
  for (var i = 0; i < bytes.length; i++) {
    var v = (bytes[i] + 256) % 256;
    var s = v.toString(16);
    hex += s.length === 1 ? "0" + s : s;
  }
  return hex;
}

function wsSafeCallback(name) {
  var cb = String(name || "");
  return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(cb) ? cb : "";
}
