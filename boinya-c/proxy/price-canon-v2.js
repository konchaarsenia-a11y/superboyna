/**
 * price-canon-v2 (2026-11-04): единый каталог sku_id + датированные себесы/прайс в D1.
 * Google «Расчёты…» — только выгрузка; calc читает только версии D1.
 */

export const PRICE_CANON_V2_ = "price-canon-v2-2026-11-04";
export const PRICE_CANON_V2_SEED_FROM_ = "2026-10-11";

/** Каталог: стабильный id → имена/алиасы (без зависимости от регистра «шт.»). */
export const PRICE_SKU_CATALOG_ = [
  { id: "LEGKOE", name: "ЛЁГКОЕ", piece: 0, aliases: ["ЛЕГКОЕ"] },
  { id: "SERDCE", name: "СЕРДЦЕ", piece: 0, aliases: [] },
  { id: "POCHKI", name: "ПОЧКИ", piece: 0, aliases: [] },
  { id: "RUBEC_T", name: "РУБЕЦ Т", piece: 0, aliases: ["РУБЕЦТ"] },
  { id: "PECHEN", name: "ПЕЧЕНЬ", piece: 0, aliases: [] },
  { id: "RUBEC_S", name: "РУБЕЦ С", piece: 0, aliases: ["СВЕТЛЫЙ РУБЕЦ"] },
  { id: "INDEJKA", name: "ИНДЕЙКА", piece: 0, aliases: ["ИНДЕЙКА"] },
  { id: "MYAS_LOMT", name: "МЯСНЫЕ ЛОМТИКИ", piece: 0, aliases: ["МЯСНЫЕ ЛОМТИКИ (КОРЕКТ СТОИМОСТЬ)"] },
  { id: "PEREPELKI", name: "ПЕРЕПЁЛКИ", piece: 1, aliases: ["ПЕРЕПЕЛКИ", "ПЕРЕПЁЛКИ ШТ.", "ПЕРЕПЕЛКИ ШТ.", "ПЕРЕПЁЛКИ шт."] },
  { id: "BARAN_LEGKOE", name: "БАРАНЬЕ ЛЁГКОЕ", piece: 0, aliases: ["БАРАНЬЕ ЛЕГКОЕ"] },
  { id: "BARAN_PECHEN", name: "БАРАНЬЯ ПЕЧЕНЬ", piece: 0, aliases: [] },
  { id: "KROSHKA_LEGKOGO", name: "КРОШКА ЛЁГКОГО", piece: 0, aliases: ["КРОШКА ЛЕГКОГО", "КРОШКА ЛЁГКОГО/20Г"] },
  { id: "KROSHKA_POCHEK", name: "КРОШКА ПОЧЕК", piece: 0, aliases: [] },
  { id: "KROSHKA_RUBEC", name: "КРОШКА РУБЕЦ", piece: 0, aliases: [] },
  { id: "UHO_G", name: "УХО Г", piece: 1, aliases: ["УХО Г ШТ.", "УШКО ГОВЯЖЬЕ"] },
  { id: "UHO_G_HALF", name: "УХО Г", sub: "ПОЛОВИНКА", piece: 1, aliases: ["УХО Г ПОЛОВИНКО", "УХО Г ПОЛОВИНКА"] },
  { id: "UHO_K", name: "УХО К", piece: 1, aliases: ["УХО К ШТ."] },
  { id: "KOLENI", name: "КОЛЕНИ", piece: 1, aliases: ["КОЛЕНИ ШТ.", "КОЛЕНИ шт.", "КОЛЕНИ ШТ"] },
  { id: "KOREN_XS", name: "БЫЧИЙ КОРЕНЬ", sub: "ОЧ МАЛ", piece: 1, aliases: ["БЫЧИЙ КОРЕНЬ ОЧЕНЬ МАЛЕНЬКИЙ"] },
  { id: "KOREN_S", name: "БЫЧИЙ КОРЕНЬ", sub: "МАЛ", piece: 1, aliases: ["БЫЧИЙ КОРЕНЬ МАЛЕНЬКИЙ"] },
  { id: "KOREN_M", name: "БЫЧИЙ КОРЕНЬ", sub: "СРЕД", piece: 1, aliases: ["БЫЧИЙ КОРЕНЬ СРЕДНИЙ", "БЫЧИЙ КОРЕНЬ / Среднее"] },
  { id: "KOREN_L", name: "БЫЧИЙ КОРЕНЬ", sub: "БОЛ", piece: 1, aliases: ["БЫЧИЙ КОРЕНЬ БОЛЬШОЙ", "БЫЧИЙ КОРЕНЬ / Большое"] },
  { id: "KOREN_XL", name: "БЫЧИЙ КОРЕНЬ", sub: "ОГР", piece: 1, aliases: ["БЫЧИЙ КОРЕНЬ ОГРОМНЫЙ"] },
  { id: "LOP_HRYASH", name: "ЛОП ХРЯЩ", piece: 1, aliases: ["ЛОП ХРЯЩ ШТ.", "ЛОП ХРЯЩ шт.", "ЛОПАТОЧНЫЙ ХРЯЩ"] },
  { id: "TRAHEYA_PLAST", name: "ТРАХЕЯ", sub: "ПЛАСТ", piece: 1, aliases: ["ТРАХЕЯ ПЛАСТИНКИ"] },
  { id: "TRAHEYA_S", name: "ТРАХЕЯ", sub: "МАЛ", piece: 1, aliases: ["ТРАХЕЯ МАЛЕНЬКАЯ"] },
  { id: "TRAHEYA_M", name: "ТРАХЕЯ", sub: "СРЕД", piece: 1, aliases: ["ТРАХЕЯ СРЕДНЯЯ", "ТРАХЕЯ / Среднее"] },
  { id: "TRAHEYA_L", name: "ТРАХЕЯ", sub: "БОЛ", piece: 1, aliases: ["ТРАХЕЯ БОЛЬШАЯ", "ТРАХЕЯ / Большое"] },
  { id: "TRAHEYA_XL", name: "ТРАХЕЯ", sub: "ОГР", piece: 1, aliases: ["ТРАХЕЯ ОГРОМНАЯ"] },
  { id: "KOPYTO", name: "КОПЫТО", piece: 1, aliases: ["КОПЫТО ШТ.", "КОПЫТО шт."] },
  { id: "ZHILA_PALK", name: "СТАНОВАЯ ЖИЛА", sub: "ПАЛК", piece: 1, aliases: ["СТАНОВЫЕ ПАЛОЧКИ", "СТАНОВАЯ ЖИЛА / ПАЛК"] },
  { id: "ZHILA_M", name: "СТАНОВАЯ ЖИЛА", sub: "СРЕД", piece: 1, aliases: ["СТАНОВАЯ ЖИЛА СРЕДНЯЯ", "СТАНОВАЯ ЖИЛА / Среднее"] },
  { id: "ZHILA_L", name: "СТАНОВАЯ ЖИЛА", sub: "БОЛ", piece: 1, aliases: ["СТАНОВАЯ ЖИЛА БОЛЬШАЯ", "СТАНОВАЯ ЖИЛА / Большое"] },
  { id: "AORTA", name: "АОРТА", piece: 1, aliases: ["АОРТА ШТ.", "АОРТА шт."] },
  { id: "AORTA_HALF", name: "АОРТА", sub: "ПОЛОВИНКА", piece: 1, aliases: ["АОРТА ПОЛОВИНКА"] },
  { id: "UTINYE_SHEI", name: "УТИНЫЕ ШЕИ", piece: 1, aliases: ["УТИНЫЕ ШЕИ ШТ.", "УТИНЫЕ ШЕИ шт.", "УТИНЫЕ  ШЕИ"] },
  { id: "GUBY", name: "ГУБЫ", piece: 1, aliases: ["ГУБЫ ШТ.", "ГУБЫ шт."] },
  { id: "NOSY", name: "НОСЫ", piece: 1, aliases: ["НОСЫ ШТ.", "НОСЫ шт."] },
  { id: "KNIZHKA", name: "КНИЖКА", piece: 0, aliases: [] },
  { id: "VYMYA", name: "ВЫМЯ", piece: 0, aliases: [] },
  { id: "SEMENNIKI", name: "СЕМЕННИКИ", piece: 0, aliases: [] },
  { id: "PIKALNOE", name: "ПИКАЛЬНОЕ МЯСО", piece: 0, aliases: [] },
  { id: "BANANY", name: "БАНАНЫ", piece: 0, aliases: [] },
  { id: "YABLOKI", name: "ЯБЛОКИ", piece: 0, aliases: [] },
  { id: "GRUSHI", name: "ГРУШИ", piece: 0, aliases: ["ГРУШЫ"] },
  { id: "KLUBNIKA", name: "КЛУБНИКА", piece: 0, aliases: [] },
  { id: "MORKOV", name: "МОРКОВЬ", piece: 0, aliases: [] },
  { id: "KABACHKI", name: "КАБАЧКИ", piece: 0, aliases: [] },
  { id: "TYKVA", name: "ТЫКВА", piece: 0, aliases: [] },
  { id: "SVEKLA", name: "СВЕКЛА", piece: 0, aliases: [] },
  { id: "BATAT", name: "БАТАТ", piece: 0, aliases: [] },
  { id: "KROLIK", name: "КРОЛИК", piece: 0, aliases: [] }
];

/**
 * Первая версия себеса = лист «Подписка» «Себестоимость 100г» на 11.10.2026.
 * source: sheet|builtin. null = нет на листе и нет builtin → UI missing.
 */
export const PRICE_COST_SEED_1110_ = [
  { id: "LEGKOE", cost: 1.75, source: "sheet" },
  { id: "SERDCE", cost: 3.75, source: "sheet" },
  { id: "POCHKI", cost: 2.53, source: "sheet" },
  { id: "RUBEC_T", cost: 1.77, source: "sheet" },
  { id: "PECHEN", cost: 3.5, source: "sheet" },
  { id: "RUBEC_S", cost: 1.85, source: "sheet" },
  { id: "INDEJKA", cost: 7, source: "sheet" },
  { id: "MYAS_LOMT", cost: 6, source: "sheet" },
  { id: "PEREPELKI", cost: 1, source: "sheet" },
  { id: "BARAN_LEGKOE", cost: 2.77, source: "sheet" },
  { id: "BARAN_PECHEN", cost: 2.76, source: "builtin" },
  { id: "KROSHKA_LEGKOGO", cost: 2, source: "sheet" },
  { id: "KROSHKA_POCHEK", cost: 3, source: "sheet" },
  { id: "KROSHKA_RUBEC", cost: 3.44, source: "sheet" },
  { id: "UHO_G", cost: 1.17, source: "sheet" },
  { id: "UHO_G_HALF", cost: 0.59, source: "sheet" },
  { id: "UHO_K", cost: 0.88, source: "builtin" },
  { id: "KOLENI", cost: 1.17, source: "sheet" },
  { id: "KOREN_XS", cost: 0.75, source: "sheet" },
  { id: "KOREN_S", cost: 1.3, source: "sheet" },
  { id: "KOREN_M", cost: 2.5, source: "sheet" },
  { id: "KOREN_L", cost: 5, source: "sheet" },
  { id: "KOREN_XL", cost: 7.5, source: "sheet" },
  { id: "LOP_HRYASH", cost: 0.8, source: "sheet" },
  { id: "TRAHEYA_PLAST", cost: 1.75, source: "sheet" },
  { id: "TRAHEYA_S", cost: 0.88, source: "sheet" },
  { id: "TRAHEYA_M", cost: 1.75, source: "sheet" },
  { id: "TRAHEYA_L", cost: 3.5, source: "sheet" },
  { id: "TRAHEYA_XL", cost: 5.25, source: "sheet" },
  { id: "KOPYTO", cost: 7, source: "sheet" },
  { id: "ZHILA_PALK", cost: 0.25, source: "sheet" },
  { id: "ZHILA_M", cost: 1, source: "sheet" },
  { id: "ZHILA_L", cost: 2, source: "sheet" },
  { id: "AORTA", cost: 1.1, source: "sheet" },
  { id: "AORTA_HALF", cost: 0.55, source: "sheet" },
  { id: "UTINYE_SHEI", cost: 1, source: "sheet" },
  { id: "NOSY", cost: 1.5, source: "sheet" },
  { id: "VYMYA", cost: 2.7, source: "sheet" },
  { id: "SEMENNIKI", cost: 3.3, source: "sheet" },
  { id: "PIKALNOE", cost: 4, source: "sheet" },
  { id: "BANANY", cost: 3.3, source: "sheet" },
  { id: "YABLOKI", cost: 3.3, source: "sheet" },
  { id: "GRUSHI", cost: 7.5, source: "sheet" },
  { id: "KLUBNIKA", cost: 13.75, source: "sheet" },
  { id: "MORKOV", cost: 0.8, source: "sheet" },
  { id: "TYKVA", cost: 1.67, source: "sheet" },
  { id: "SVEKLA", cost: 0.6, source: "sheet" },
  { id: "BATAT", cost: 3.5, source: "sheet" },
  { id: "KROLIK", cost: null, source: "sheet" },
  { id: "GUBY", cost: null, source: "sheet" },
  { id: "KNIZHKA", cost: null, source: "sheet" },
  { id: "KABACHKI", cost: null, source: "sheet" }
];

function normKey_(s) {
  return String(s || "")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/\s+/g, " ")
    .replace(/\s*ШТ\.?$/g, "")
    .replace(/[|/]+/g, " ")
    .trim();
}

function fracNorm_(sub) {
  const u = String(sub || "")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/\s+/g, " ");
  if (!u) return "";
  if (/^ОЧ(\.| )?МАЛ|ОЧЕНЬ\s*МАЛ/.test(u)) return "ОЧ МАЛ";
  if (/^МАЛ|МАЛЕНЬК/.test(u)) return "МАЛ";
  if (/^СРЕД/.test(u)) return "СРЕД";
  if (/^БОЛ|БОЛЬШ/.test(u)) return "БОЛ";
  if (/^ОГР|ОГРОМ/.test(u)) return "ОГР";
  if (/^ПАЛК|ПАЛОЧ/.test(u)) return "ПАЛК";
  if (/^ПЛАСТ/.test(u)) return "ПЛАСТ";
  if (/^ПОЛОВИН/.test(u)) return "ПОЛОВИНКА";
  if (/^ОБЫЧН/.test(u)) return "";
  if (/ЛОМТИК/.test(u)) return "Ломтики";
  if (/МЕЛК/.test(u) && /ОЧЕНЬ/.test(u)) return "Очень мелкое";
  if (/^МЕЛК/.test(u)) return "Мелкое";
  if (/КРУПН|БОЛЬШОЕ|БОЛ\b/.test(u) && !/КУСОЧ/.test(u)) return "Крупное";
  if (/СРЕДН/.test(u)) return "Среднее";
  if (/ЦЕЛ/.test(u)) return "Целое";
  return String(sub || "").trim();
}

let _aliasIndex = null;
function aliasIndex_() {
  if (_aliasIndex) return _aliasIndex;
  _aliasIndex = Object.create(null);
  PRICE_SKU_CATALOG_.forEach(function (row) {
    const frac = fracNorm_(row.sub || "");
    const keys = [row.name].concat(row.aliases || []);
    keys.forEach(function (k) {
      const nk = normKey_(k);
      if (!nk) return;
      _aliasIndex[nk + "|" + frac] = row.id;
      if (!frac) _aliasIndex[nk + "|"] = row.id;
    });
    if (frac) {
      _aliasIndex[normKey_(row.name) + "|" + frac] = row.id;
    }
  });
  return _aliasIndex;
}

/** name+sub корзины → sku_id. */
export function resolvePriceSkuId_(name, sub) {
  const idx = aliasIndex_();
  const n = normKey_(name);
  const f = fracNorm_(sub);
  if (!n) return "";
  if (idx[n + "|" + f]) return idx[n + "|" + f];
  if (f && idx[n + "|"]) {
    /* базовый sku без фракции (лёгкое/сердце) */
    const baseId = idx[n + "|"];
    const base = PRICE_SKU_CATALOG_.find(function (r) {
      return r.id === baseId;
    });
    if (base && !base.sub) return baseId;
  }
  if (idx[n + "|"]) return idx[n + "|"];
  /* составное имя «БЫЧИЙ КОРЕНЬ СРЕДНИЙ» без sub */
  for (let i = 0; i < PRICE_SKU_CATALOG_.length; i++) {
    const row = PRICE_SKU_CATALOG_[i];
    if (!row.sub) continue;
    const needle = normKey_(row.name + " " + row.sub);
    if (n.indexOf(normKey_(row.name)) === 0 && n.indexOf(normKey_(row.sub)) >= 0) return row.id;
    if (n === needle) return row.id;
  }
  return "";
}

export function catalogRowById_(id) {
  for (let i = 0; i < PRICE_SKU_CATALOG_.length; i++) {
    if (PRICE_SKU_CATALOG_[i].id === id) return PRICE_SKU_CATALOG_[i];
  }
  return null;
}

export function displayKeyForSku_(row) {
  if (!row) return "";
  const sub = row.sub ? String(row.sub) : "";
  return row.name + (sub ? " / " + sub : "");
}

/** raw-kg-shrink: себес_100г = цена_кг/10/(1−усушка%/100). Штуки не через эту формулу. */
export function cost100FromKgShrink_(costKg, shrinkPct) {
  const kg = Number(String(costKg == null ? "" : costKg).replace(",", "."));
  const pct = Number(String(shrinkPct == null ? "" : shrinkPct).replace(",", "."));
  if (!isFinite(kg) || kg < 0) return null;
  if (!isFinite(pct) || pct < 0 || pct >= 100) return null;
  const out = kg / 10 / (1 - pct / 100);
  if (!isFinite(out) || out < 0) return null;
  return Math.round(out * 10000) / 10000;
}

/** raw-kg-shrink: piece из каталога sku_id (жевалки/ШТ.). */
export function isPieceSkuId_(skuId) {
  const row = catalogRowById_(String(skuId || "").trim());
  return !!(row && row.piece);
}

/** chew-batch-avg: себес партии за шт = цена_кг × вес_кг / штук. */
export function costPieceFromBatch_(costKg, weightKg, pieces) {
  const kg = Number(String(costKg == null ? "" : costKg).replace(",", "."));
  const w = Number(String(weightKg == null ? "" : weightKg).replace(",", "."));
  const n = Number(String(pieces == null ? "" : pieces).replace(",", "."));
  if (!isFinite(kg) || kg < 0) return null;
  if (!isFinite(w) || !(w > 0)) return null;
  if (!isFinite(n) || !(n > 0)) return null;
  const out = (kg * w) / n;
  if (!isFinite(out) || out < 0) return null;
  return Math.round(out * 10000) / 10000;
}

/** chew-batch-avg: средняя факт. себес/шт, взвешенная по числу штук. */
export function weightedAvgPieceCost_(batches) {
  let sumCost = 0;
  let sumPcs = 0;
  (batches || []).forEach(function (b) {
    const pcs = Number(b && (b.pieces != null ? b.pieces : b.pcs));
    const unit = Number(b && (b.costPiece != null ? b.costPiece : b.cost_piece));
    if (!(pcs > 0) || !(unit > 0) || !isFinite(pcs) || !isFinite(unit)) return;
    sumCost += unit * pcs;
    sumPcs += pcs;
  });
  if (!(sumPcs > 0)) return null;
  return Math.round((sumCost / sumPcs) * 10000) / 10000;
}

/** chew-batch-avg: наложить средние партий на costs-map (без партий — не трогаем). */
export function overlayPieceBatchAvg_(costs, batchesBySkuId) {
  const next = Object.assign(Object.create(null), costs || {});
  const byId = batchesBySkuId || {};
  Object.keys(byId).forEach(function (skuId) {
    const list = byId[skuId] || [];
    if (!list.length) return;
    const avg = weightedAvgPieceCost_(list);
    if (!(avg > 0)) return;
    const cat = catalogRowById_(skuId);
    if (!cat || !cat.piece) return;
    const last = list[list.length - 1] || {};
    const key = displayKeyForSku_(cat);
    const prev = next[skuId] || next[key] || {};
    const row = Object.assign({}, prev, {
      name: cat.name,
      sub: cat.sub || "",
      unitPrice: avg,
      per100: avg,
      piece: true,
      skuId: skuId,
      source: "piece-batch-avg",
      batchAvg: avg,
      lastBatchCost: Number(last.costPiece != null ? last.costPiece : last.cost_piece) || null,
      batchN: list.length,
      batchPieces: list.reduce(function (s, b) {
        return s + (Number(b.pieces) || 0);
      }, 0)
    });
    next[skuId] = row;
    next[key] = row;
    if (!cat.sub) next[cat.name] = row;
  });
  return next;
}

export async function ensurePriceCanonV2Schema_(env) {
  if (!env || !env.DB) return;
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS price_sku (" +
      "id TEXT PRIMARY KEY, name TEXT NOT NULL, sub TEXT NOT NULL DEFAULT '', piece INTEGER NOT NULL DEFAULT 0, " +
      "aliases TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS raw_cost_ver (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL, cost REAL, shrink REAL, " +
      "effective_from TEXT NOT NULL, created_at TEXT NOT NULL)"
  ).run();
  try {
    await env.DB.prepare("ALTER TABLE raw_cost_ver ADD COLUMN sku_id TEXT").run();
  } catch (eA) {}
  try {
    await env.DB.prepare("ALTER TABLE raw_cost_ver ADD COLUMN actor_tg TEXT").run();
  } catch (eB) {}
  try {
    await env.DB.prepare("ALTER TABLE raw_cost_ver ADD COLUMN source TEXT").run();
  } catch (eC) {}
  /* raw-kg-shrink: новые версии хранят цену/кг и усушку%; старые строки не трогаем. */
  try {
    await env.DB.prepare("ALTER TABLE raw_cost_ver ADD COLUMN cost_kg REAL").run();
  } catch (eD) {}
  try {
    await env.DB.prepare("ALTER TABLE raw_cost_ver ADD COLUMN shrink_pct REAL").run();
  } catch (eE) {}
  /* chew-batch-avg: партии жевалок (кг→шт), отдельно от raw_cost_ver. */
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS raw_piece_batch (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, sku_id TEXT NOT NULL, sku TEXT NOT NULL DEFAULT '', " +
      "batch_date TEXT NOT NULL, cost_kg REAL NOT NULL, weight_kg REAL NOT NULL, pieces REAL NOT NULL, " +
      "cost_piece REAL NOT NULL, created_at TEXT NOT NULL, actor_tg TEXT, source TEXT)"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS retail_price_ver (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, sku_id TEXT NOT NULL, price REAL, unit TEXT NOT NULL DEFAULT '', " +
      "effective_from TEXT NOT NULL, created_at TEXT NOT NULL, actor_tg TEXT, source TEXT)"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')"
  ).run();
}

async function putMeta_(env, key, value) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  )
    .bind(key, String(value == null ? "" : value), now)
    .run();
}

async function getMeta_(env, key) {
  try {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key = ?").bind(key).first();
    return row ? String(row.value || "") : "";
  } catch (e) {
    return "";
  }
}

export async function isPriceCanonV2Live_(env) {
  return (await getMeta_(env, "price_canon_v2")) === PRICE_CANON_V2_;
}

/** Снимок D1 до миграции (откат глазами). */
export async function snapshotPriceCanonBefore_(env, getSnapRaw) {
  const pack = {
    at: new Date().toISOString(),
    priceCostsPp: null,
    retailPrices: null,
    raw_cost_ver: [],
    raw_costs: []
  };
  try {
    pack.priceCostsPp = await getSnapRaw(env, "priceCostsPp");
  } catch (e1) {}
  try {
    pack.retailPrices = await getSnapRaw(env, "retailPrices");
  } catch (e2) {}
  try {
    const q = await env.DB.prepare("SELECT * FROM raw_cost_ver").all();
    pack.raw_cost_ver = (q && q.results) || [];
  } catch (e3) {}
  try {
    const q2 = await env.DB.prepare("SELECT * FROM raw_costs").all();
    pack.raw_costs = (q2 && q2.results) || [];
  } catch (e4) {}
  await env.DB.prepare(
    "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES (?, ?, ?) " +
      "ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
  )
    .bind("priceCanonBackup:2026-11-04", JSON.stringify(pack), new Date().toISOString())
    .run();
  return { key: "priceCanonBackup:2026-11-04", verN: pack.raw_cost_ver.length, retailN: ((pack.retailPrices && pack.retailPrices.items) || []).length };
}

export async function seedPriceSkuCatalog_(env) {
  const now = new Date().toISOString();
  for (let i = 0; i < PRICE_SKU_CATALOG_.length; i++) {
    const row = PRICE_SKU_CATALOG_[i];
    await env.DB.prepare(
      "INSERT INTO price_sku (id, name, sub, piece, aliases, active, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?) " +
        "ON CONFLICT(id) DO UPDATE SET name = excluded.name, sub = excluded.sub, piece = excluded.piece, " +
        "aliases = excluded.aliases, updated_at = excluded.updated_at"
    )
      .bind(
        row.id,
        row.name,
        row.sub || "",
        row.piece ? 1 : 0,
        JSON.stringify(row.aliases || []),
        now
      )
      .run();
  }
}

export async function seedRawCosts1110_(env, actorTg) {
  const now = new Date().toISOString();
  const from = PRICE_CANON_V2_SEED_FROM_;
  let n = 0;
  const items = [];
  for (let i = 0; i < PRICE_COST_SEED_1110_.length; i++) {
    const seed = PRICE_COST_SEED_1110_[i];
    const cat = catalogRowById_(seed.id);
    if (!cat) continue;
    const skuLabel = displayKeyForSku_(cat);
    await env.DB.prepare(
      "INSERT INTO raw_cost_ver (sku, cost, shrink, effective_from, created_at, sku_id, actor_tg, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(skuLabel, seed.cost, null, from, now, seed.id, actorTg || "", seed.source || "sheet")
      .run();
    n++;
    items.push({
      skuId: seed.id,
      sku: skuLabel,
      cost: seed.cost,
      source: seed.source,
      effectiveFrom: from
    });
  }
  return { n: n, items: items };
}

/** Собрать costs-map для calc из версий (ключ = display + sku_id). */
export function costsMapFromVersionsV2_(versions, asOf) {
  const when = String(asOf || "9999-12-31").slice(0, 10);
  const best = Object.create(null);
  (versions || []).forEach(function (v) {
    const id = String((v && (v.sku_id || v.skuId)) || "").trim();
    const from = String((v && (v.effectiveFrom || v.effective_from)) || "").slice(0, 10);
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return;
    if (from > when) return;
    if (!best[id] || from >= best[id].from) {
      best[id] = { from: from, cost: v.cost, shrink: v.shrink, source: v.source || "" };
    }
  });
  const costs = Object.create(null);
  Object.keys(best).forEach(function (id) {
    const cat = catalogRowById_(id);
    if (!cat) return;
    const hit = best[id];
    if (hit.cost == null || hit.cost === "" || !isFinite(Number(hit.cost))) return;
    const unit = Number(hit.cost);
    if (!(unit > 0)) return;
    const key = displayKeyForSku_(cat);
    const row = {
      name: cat.name,
      sub: cat.sub || "",
      unitPrice: unit,
      per100: unit,
      piece: !!cat.piece,
      skuId: id,
      source: hit.source || "",
      effectiveFrom: hit.from
    };
    costs[key] = row;
    costs[id] = row;
    if (!cat.sub) costs[cat.name] = row;
  });
  return costs;
}

export async function rebuildPriceCostsPpV2_(env, putSnap, loadVersions, loadBatches) {
  const versions = await loadVersions(env);
  let costs = costsMapFromVersionsV2_(versions, "9999-12-31");
  /* chew-batch-avg: если есть партии — unitPrice = взвешенная средняя по шт. */
  if (typeof loadBatches === "function") {
    try {
      const grouped = await loadBatches(env);
      costs = overlayPieceBatchAvg_(costs, grouped || {});
    } catch (eBat) {}
  }
  const snap = {
    status: "success",
    costs: costs,
    zeroKeys: {},
    ppCostCanon: PRICE_CANON_V2_,
    cachedAt: new Date().toISOString(),
    _d1TouchedAt: Date.now(),
    priceCanonV2: true
  };
  await putSnap(env, "priceCostsPp", snap);
  return { keys: Object.keys(costs).length };
}

/**
 * Миграция: бэкап → каталог → seed 11.10 → priceCostsPp без zeroKeys.
 * Карточки/заказы не трогает. Прайс retailPrices оставляем как есть (03.11).
 */
export async function migratePriceCanonV2_(env, deps) {
  deps = deps || {};
  const actorTg = String(deps.actorTg || "");
  await ensurePriceCanonV2Schema_(env);
  const backup = await snapshotPriceCanonBefore_(env, deps.getSnapRaw);
  await seedPriceSkuCatalog_(env);
  /* не дублировать seed если уже live */
  const already = await isPriceCanonV2Live_(env);
  let seeded = { n: 0, items: [] };
  if (!already) {
    seeded = await seedRawCosts1110_(env, actorTg);
  }
  /* chew-batch-avg: loadBatches опционален — миграция без партий ок. */
  const rebuilt = await rebuildPriceCostsPpV2_(env, deps.putSnap, deps.loadVersions, deps.loadBatches);
  await putMeta_(env, "price_canon_v2", PRICE_CANON_V2_);
  await putMeta_(env, "price_canon_v2_at", new Date().toISOString());
  /* прайс «Ещё» 03.11 уже в retailPrices — фиксируем метку, не переписываем цены */
  try {
    const retail = await deps.getSnapRaw(env, "retailPrices");
    if (retail && typeof retail === "object") {
      retail.priceCanonV2 = PRICE_CANON_V2_;
      retail.costBasisNote = "retail kept from 2026-11-03; costs seeded 2026-10-11 sheet";
      await deps.putSnap(env, "retailPrices", retail);
    }
  } catch (eR) {}
  return {
    status: "success",
    canon: PRICE_CANON_V2_,
    backup: backup,
    seeded: seeded.n,
    seedItems: seeded.items,
    costsKeys: rebuilt.keys,
    cardsUntouched: true,
    already: already
  };
}

/** Lookup: только каталог+costs; missing → null (не 0, не builtin). */
export function lookupCostV2_(costs, name, sub) {
  costs = costs || {};
  const id = resolvePriceSkuId_(name, sub);
  if (id && costs[id] && Number(costs[id].unitPrice || costs[id].per100) > 0) return costs[id];
  const key = String(name || "").trim() + (sub ? " / " + String(sub).trim() : "");
  if (costs[key] && Number(costs[key].unitPrice || costs[key].per100) > 0) return costs[key];
  if (id) {
    const cat = catalogRowById_(id);
    const dk = displayKeyForSku_(cat);
    if (dk && costs[dk] && Number(costs[dk].unitPrice || costs[dk].per100) > 0) return costs[dk];
  }
  return null;
}
