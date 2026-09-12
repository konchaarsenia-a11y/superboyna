/**
 * Canonical storefront brands.
 * OpenCart manufacturers are obfuscated (ad1das, ree6ok) or blank;
 * product names often start with the real brand.
 *
 * Convention: Title Case (Nike, Adidas, Asics) so filter chips stay consistent.
 */

/** @typedef {{ canonical: string, aliases: string[], namePrefixes?: string[] }} BrandDef */

/** @type {BrandDef[]} */
const BRANDS = [
  {
    canonical: "Adidas",
    aliases: ["adidas", "ad1das", "adiidas"],
    namePrefixes: ["adidas", "ad1das"],
  },
  {
    canonical: "Reebok",
    aliases: ["reebok", "ree6ok"],
    namePrefixes: ["reebok", "ree6ok"],
  },
  {
    canonical: "Nike",
    aliases: ["nike", "n1ke"],
    namePrefixes: ["nike", "air jordan", "jordan"],
  },
  {
    canonical: "Asics",
    aliases: ["asics", "asic"],
    namePrefixes: ["asics"],
  },
  {
    canonical: "Converse",
    aliases: ["converse"],
    namePrefixes: ["converse"],
  },
  {
    canonical: "Hoka",
    aliases: ["hoka", "hoka one one", "hokaoneone"],
    namePrefixes: ["hoka one one", "hoka"],
  },
  {
    canonical: "Lacoste",
    aliases: ["lacoste"],
    namePrefixes: ["lacoste"],
  },
  {
    canonical: "DC",
    aliases: ["dc", "dc shoe", "dc shoes", "dcshoe", "dcshoes"],
    namePrefixes: ["dc shoes", "dc shoe", "dc"],
  },
  {
    canonical: "Alexander McQueen",
    aliases: ["alexander mcqueen", "alexandermcqueen", "mcqueen"],
    namePrefixes: ["alexander mcqueen"],
  },
  {
    canonical: "Dr. Martens",
    aliases: ["dr. martens", "dr martens", "drmartens", "doc martens", "docmartens"],
    namePrefixes: ["dr. martens", "dr martens"],
  },
  {
    canonical: "Merrell",
    aliases: ["merrell"],
    namePrefixes: ["merrell"],
  },
  {
    canonical: "Saucony",
    aliases: ["saucony"],
    namePrefixes: ["saucony"],
  },
  {
    canonical: "Under Armour",
    aliases: ["under armour", "under armor", "underarmour", "underarmor"],
    namePrefixes: ["under armour", "under armor"],
  },
  {
    canonical: "New Balance",
    aliases: ["new balance", "newbalance"],
    namePrefixes: ["new balance"],
  },
  {
    canonical: "Puma",
    aliases: ["puma"],
    namePrefixes: ["puma"],
  },
  {
    canonical: "Vans",
    aliases: ["vans"],
    namePrefixes: ["vans"],
  },
];

/**
 * Unique model-line prefixes (no manufacturer on the row).
 * Only unambiguous lines — do not invent a brand from generic words.
 */
const MODEL_TO_BRAND = new Map(
  [
    ["campus", "Adidas"],
    ["bermuda", "Adidas"],
    ["bermuba", "Adidas"],
    ["yeezy", "Adidas"],
    ["spezial", "Adidas"],
  ].map(([k, v]) => [foldKey(k), v])
);

const ALIAS_TO_CANONICAL = new Map();
for (const def of BRANDS) {
  ALIAS_TO_CANONICAL.set(foldKey(def.canonical), def.canonical);
  for (const alias of def.aliases) {
    ALIAS_TO_CANONICAL.set(foldKey(alias), def.canonical);
  }
}

const NAME_PREFIXES = BRANDS.flatMap((def) =>
  (def.namePrefixes || []).map((prefix) => ({ prefix: prefix.toLowerCase(), brand: def.canonical }))
).sort((a, b) => b.prefix.length - a.prefix.length || a.prefix.localeCompare(b.prefix));

export function foldKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’`.,/_-]/g, "")
    .replace(/\s+/g, "")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/6/g, "b")
    .replace(/0/g, "o")
    .replace(/7/g, "t")
    .replace(/8/g, "b");
}

function collapseWs(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/**
 * Map an OC / staff brand string to the canonical storefront form.
 * Unknown non-empty values are kept (trimmed) — do not invent.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeBrand(raw) {
  const trimmed = collapseWs(raw);
  if (!trimmed) return "";
  return ALIAS_TO_CANONICAL.get(foldKey(trimmed)) || trimmed;
}

function prefixMatches(lowerName, prefix) {
  if (lowerName === prefix) return true;
  if (lowerName.startsWith(prefix + " ")) return true;
  if (lowerName.startsWith(prefix + "/")) return true;
  if (lowerName.startsWith(prefix + "-")) return true;
  return false;
}

/**
 * Infer brand from a leading name token / known model line.
 * @param {string} name
 * @returns {string} canonical brand or ""
 */
export function inferBrandFromName(name) {
  const original = collapseWs(name);
  if (!original) return "";
  const lower = original.toLowerCase();

  for (const { prefix, brand } of NAME_PREFIXES) {
    if (prefixMatches(lower, prefix)) return brand;
  }

  const first = original.split(/[\s/-]+/).filter(Boolean)[0] || "";
  const fromAlias = ALIAS_TO_CANONICAL.get(foldKey(first));
  if (fromAlias) return fromAlias;

  return MODEL_TO_BRAND.get(foldKey(first)) || "";
}

/**
 * Prefer a normalized manufacturer; if empty, infer from the product name.
 * @param {string} brand
 * @param {string} [name]
 * @returns {string}
 */
export function resolveBrand(brand, name = "") {
  const fromField = normalizeBrand(brand);
  if (fromField) return fromField;
  return inferBrandFromName(name);
}

export const CANONICAL_BRANDS = BRANDS.map((b) => b.canonical);

/**
 * Group active product rows into storefront brand chips.
 * Counts distinct model_key (same idea as GET /api/brands).
 * @param {{ brand?: string, name?: string, model_key?: string, id?: string|number }[]} rows
 */
export function aggregateBrands(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const brand = resolveBrand(row.brand, row.name);
    if (!brand) continue;
    const modelId = String(row.model_key || "").trim() || String(row.id ?? "");
    if (!modelId) continue;
    if (!map.has(brand)) map.set(brand, new Set());
    map.get(brand).add(modelId);
  }
  return [...map.entries()]
    .map(([brand, ids]) => ({ brand, products: ids.size }))
    .sort((a, b) => a.brand.localeCompare(b.brand, "en"));
}
