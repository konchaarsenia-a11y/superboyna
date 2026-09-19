/**
 * Group OpenCart colorways of the same sneaker into one catalog card.
 * Live OC rows are unique full names ("AIR JORDAN 11 BLACK" vs "… GREY/BLUE").
 *
 * Default catalog order (no `sort` query): richest in-stock size rows first.
 * stockSizeCount = total size-lines with qty>0 across all colorways
 * (same EU size in two colors counts twice). Tie-break: brand, then name.
 */

import { resolveBrand } from "./brand.js";
import { isOnSale, parseOldPriceByn } from "./sale.js";

const COLOR_WORDS = new Set(
  [
    "black",
    "white",
    "grey",
    "gray",
    "blue",
    "red",
    "green",
    "yellow",
    "orange",
    "pink",
    "purple",
    "brown",
    "beige",
    "cream",
    "ivory",
    "navy",
    "teal",
    "burgundy",
    "maroon",
    "gold",
    "silver",
    "bronze",
    "copper",
    "khaki",
    "olive",
    "camo",
    "multicolor",
    "multi",
    "rainbow",
    "cyan",
    "magenta",
    "lime",
    "coral",
    "salmon",
    "tan",
    "taupe",
    "sand",
    "stone",
    "charcoal",
    "graphite",
    "anthracite",
    "ivory",
    "bone",
    "oatmeal",
    "natural",
    "nude",
    "wine",
    "bordeaux",
    "violet",
    "lilac",
    "lavender",
    "indigo",
    "turquoise",
    "aqua",
    "mint",
    "forest",
    "army",
    "military",
    "chocolate",
    "coffee",
    "camel",
    "cognac",
    "rust",
    "burgundy",
    "crimson",
    "scarlet",
    "cherry",
    "rose",
    "blush",
    "peach",
    "apricot",
    "mustard",
    "lemon",
    "amber",
    "honey",
    "platinum",
    "chrome",
    "gunmetal",
    "smoke",
    "ash",
    "slate",
    "steel",
    "ice",
    "frost",
    "snow",
    "offwhite",
    "off-white",
    "gum",
    "volt",
    "infrared",
    "concord",
    "bred",
    "panda",
    "chicago",
    "shadow",
    "taxi",
    "mocha",
    "cement",
    "royal",
    "unc",
    "oreo",
    "fragment",
    "bredtoe",
    "royaltoe",
    "spacejam",
    "bordo",
    "бордо",
    "persik",
    "персик",
    "milk",
    "молоко",
    "raduga",
    "радуга",
    "softblue",
    "lightblue",
    "darkblue",
    "darkgrey",
    "lightgrey",
    "darkgray",
    "lightgray",
    "softgrey",
    "psg",
    "mummy",
    "safari",
    "leopard",
    "flower",
    "expression",
    "зелёный",
    "зеленый",
    "чёрный",
    "черный",
    "белый",
    "серый",
    "синий",
    "красный",
    "коричневый",
    "бежевый",
    "розовый",
    "жёлтый",
    "желтый",
    "оранжевый",
    "фиолетовый",
    "голубой",
    "бордовый",
    "хаки",
    "оливковый",
    "золотой",
    "серебряный",
  ].map((s) => s.toLowerCase())
);

const COLOR_PHRASES = [
  "off white",
  "wolf grey",
  "cool grey",
  "dark grey",
  "light grey",
  "dark gray",
  "light gray",
  "university blue",
  "royal blue",
  "navy blue",
  "ice blue",
  "light blue",
  "dark blue",
  "midnight navy",
  "dark brown",
  "light brown",
  "dark green",
  "light green",
  "forest green",
  "black cat",
  "black cement",
  "white cement",
  "bred cement",
  "space jam",
  "game royal",
  "fire red",
  "varsity red",
  "gym red",
  "university red",
  "true red",
  "summit white",
  "sail white",
  "photon dust",
  "particle grey",
  "iron grey",
  "smoke grey",
  "black white",
  "white black",
  "white green",
  "black red",
  "grey blue",
  "gray blue",
  "soft blue",
  "soft grey",
  "soft gray",
  "soft pink",
  "soft white",
].sort((a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length);

/** Catalog nicknames / local aliases that are colorways, not silhouette words. */
const COLOR_ALIASES = new Map(
  [
    ["bordo", "BURGUNDY"],
    ["бордо", "BURGUNDY"],
    ["persik", "PEACH"],
    ["персик", "PEACH"],
    ["raduga", "RAINBOW"],
    ["радуга", "RAINBOW"],
    ["milk", "MILK"],
    ["молоко", "MILK"],
    ["psg", "PSG"],
    ["mummy", "MUMMY"],
    ["safari", "SAFARI"],
    ["leopard", "LEOPARD"],
    ["flower", "FLOWER"],
    ["expression", "EXPRESSION"],
    ["softblue", "SOFT BLUE"],
    ["lightblue", "LIGHT BLUE"],
    ["darkblue", "DARK BLUE"],
    ["darkgrey", "DARK GREY"],
    ["lightgrey", "LIGHT GREY"],
    ["darkgray", "DARK GRAY"],
    ["lightgray", "LIGHT GRAY"],
    ["softgrey", "SOFT GREY"],
  ].map(([k, v]) => [k.toLowerCase(), v])
);

const COMPOUND_PREFIXES = new Set([
  "soft",
  "light",
  "dark",
  "off",
  "mid",
  "pale",
  "neon",
  "hot",
  "deep",
  "bright",
  "wolf",
  "cool",
  "ice",
  "midnight",
  "true",
  "gym",
  "fire",
  "sail",
  "iron",
  "smoke",
  "university",
  "royal",
  "navy",
  "forest",
  "summit",
  "particle",
  "photon",
  "varsity",
  "game",
  "baby",
  "sky",
  "dusty",
  "washed",
  "electric",
  "hyper",
  "ultra",
]);

/** Material / edition suffixes glued or spaced after a slash colorway. */
const COLOR_SUFFIXES = new Set([
  "mex",
  "zamsh",
  "zamsu",
  "zamsha",
  "zamshevyi",
  "new",
  "original",
  "swoosh",
  "nubuk",
  "nubuck",
  "suede",
  "leather",
  "koja",
  "kozha",
  "mesh",
]);

const SWATCH = {
  black: "#141416",
  white: "#f5f2ec",
  grey: "#8a8680",
  gray: "#8a8680",
  blue: "#3b6fd4",
  red: "#c41e2a",
  green: "#2f7d4a",
  yellow: "#e6c84a",
  orange: "#e07a2f",
  pink: "#e89bb0",
  purple: "#6b4c9a",
  brown: "#6b4423",
  beige: "#d4c4a8",
  cream: "#efe6d0",
  navy: "#1a2a4a",
  gold: "#c9a227",
  silver: "#c0c4c8",
  khaki: "#9a8b5a",
  olive: "#5a6b3a",
  burgundy: "#6e1a2a",
  teal: "#1f7a72",
  cyan: "#4fd4ff",
  ivory: "#f3ead6",
  bone: "#e8dfd0",
  gum: "#c9895a",
  volt: "#c6ff00",
  infrared: "#d1001f",
  concord: "#5b4b8a",
  bred: "#8e121c",
  panda: "#f5f2ec",
  chicago: "#c41e2a",
  shadow: "#4a4a4e",
  taxi: "#e6c84a",
  mocha: "#6b4423",
  cement: "#b8b3aa",
  royal: "#1e4dad",
  unc: "#7ba3d4",
  oreo: "#141416",
  зелёный: "#2f7d4a",
  зеленый: "#2f7d4a",
  чёрный: "#141416",
  черный: "#141416",
  белый: "#f5f2ec",
  серый: "#8a8680",
  синий: "#3b6fd4",
  красный: "#c41e2a",
  коричневый: "#6b4423",
  бежевый: "#d4c4a8",
  розовый: "#e89bb0",
  жёлтый: "#e6c84a",
  желтый: "#e6c84a",
  голубой: "#7ba3d4",
  бордовый: "#6e1a2a",
  bordo: "#6e1a2a",
  persik: "#e8a87c",
  peach: "#e8a87c",
  milk: "#f3ead6",
  raduga: "#e07a2f",
  rainbow: "#e07a2f",
  psg: "#1a2a4a",
  mummy: "#efe6d0",
  safari: "#9a8b5a",
  leopard: "#6b4423",
  flower: "#e89bb0",
  expression: "#6b4c9a",
  softblue: "#7ba3d4",
  lightblue: "#7ba3d4",
};

export function normalizeKeyPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’`.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function makeModelKey(brand, modelName) {
  const model = normalizeKeyPart(modelName);
  const b = normalizeKeyPart(brand) || "_";
  return `${b}|${model}`;
}

function colorBase(token) {
  return String(token || "")
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-zа-яё0-9/-]+/gi, "")
    .replace(/\d+$/, "");
}

export function isColorSuffix(token) {
  const lower = String(token || "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "");
  return COLOR_SUFFIXES.has(lower);
}

function splitGluedSuffix(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const suffixes = [...COLOR_SUFFIXES].sort((a, b) => b.length - a.length);
  for (const suf of suffixes) {
    if (lower.endsWith(suf) && lower.length > suf.length) {
      const head = raw.slice(0, raw.length - suf.length);
      if (isColorToken(head) || expandCompoundColor(head)) {
        return { head, suffix: raw.slice(head.length) };
      }
    }
  }
  return null;
}

/**
 * SOFTBLUE → "SOFT BLUE", LIGHTPINK → "LIGHT PINK".
 * Leaves GREEN2 alone (color word + trailing digits).
 */
export function expandCompoundColor(token) {
  const original = String(token || "").trim();
  if (!original || original.includes("/")) return "";
  const lower = original.toLowerCase();
  const raw = colorBase(original);
  if (!raw) return "";
  const alias = COLOR_ALIASES.get(raw) || COLOR_ALIASES.get(lower);
  if (alias && alias.includes(" ")) return alias;
  const simple = raw === lower.replace(/[^a-zа-яё0-9/-]+/gi, "").replace(/\d+$/, "");
  if (simple && (COLOR_WORDS.has(raw) || COLOR_ALIASES.has(raw)) && !alias) return "";

  const words = [...COLOR_WORDS].sort((a, b) => b.length - a.length);
  for (const word of words) {
    if (word.length < 3) continue;
    if (raw === word) continue;
    if (raw.endsWith(word) && raw.length > word.length) {
      const prefix = raw.slice(0, raw.length - word.length);
      if (COMPOUND_PREFIXES.has(prefix) || COLOR_WORDS.has(prefix) || COLOR_ALIASES.has(prefix)) {
        return `${prefix} ${word}`.toUpperCase();
      }
    }
    if (raw.startsWith(word) && raw.length > word.length) {
      const rest = raw.slice(word.length);
      if (COLOR_WORDS.has(rest) || COLOR_ALIASES.has(rest) || COLOR_SUFFIXES.has(rest) || COMPOUND_PREFIXES.has(rest)) {
        return `${word} ${rest}`.toUpperCase();
      }
    }
  }
  return alias || "";
}

export function formatColorLabel(token) {
  const raw = String(token || "").trim();
  if (!raw) return "";
  if (raw.includes("/")) {
    return raw
      .split("/")
      .map((part) => formatColorLabel(part.trim()) || part.trim())
      .join("/");
  }
  const glued = splitGluedSuffix(raw);
  if (glued) {
    const left = formatColorLabel(glued.head) || glued.head;
    return `${left} ${glued.suffix}`.replace(/\s+/g, " ").trim();
  }
  const expanded = expandCompoundColor(raw);
  if (expanded) return expanded;
  const alias = COLOR_ALIASES.get(colorBase(raw)) || COLOR_ALIASES.get(raw.toLowerCase());
  if (alias) return alias;
  return raw;
}

export function isColorToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return false;
  if (raw.includes("/")) return true;
  const lower = raw.toLowerCase();
  const base = colorBase(raw);
  if (COLOR_WORDS.has(lower) || COLOR_WORDS.has(base)) return true;
  if (COLOR_ALIASES.has(lower) || COLOR_ALIASES.has(base)) return true;
  if (expandCompoundColor(raw)) return true;
  if (splitGluedSuffix(raw)) return true;
  const hyphenParts = raw.split("-").map((p) => p.trim()).filter(Boolean);
  if (hyphenParts.length > 1 && hyphenParts.every((p) => isColorToken(p))) return true;
  return false;
}

function joinTokens(tokens) {
  return tokens.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * @param {string} name
 * @param {string} [brand]
 * @returns {{ modelName: string, color: string, modelKey: string, originalName: string }}
 */
export function parseModelAndColor(name, brand = "") {
  const originalName = String(name || "").replace(/\s+/g, " ").trim();
  if (!originalName) {
    return { modelName: "", color: "", modelKey: makeModelKey(brand, ""), originalName: "" };
  }

  let working = originalName;
  const paren = working.match(/\s*\(([^)]+)\)\s*$/);
  let parenColor = "";
  if (paren && isColorToken(paren[1])) {
    parenColor = formatColorLabel(paren[1].trim());
    working = working.slice(0, paren.index).trim();
  }

  const tokens = working.split(" ").filter(Boolean);
  const colorBits = [];
  if (parenColor) colorBits.push(parenColor);

  const peelPhrase = () => {
    for (const phrase of COLOR_PHRASES) {
      const parts = phrase.split(" ");
      if (tokens.length <= parts.length) continue;
      const tail = tokens.slice(-parts.length).join(" ").toLowerCase();
      if (tail === phrase) {
        colorBits.unshift(tokens.splice(-parts.length, parts.length).join(" "));
        return true;
      }
    }
    return false;
  };

  const peelLast = () => {
    if (tokens.length <= 1) return false;
    if (peelPhrase()) return true;
    const last = tokens[tokens.length - 1];
    if (isColorToken(last)) {
      colorBits.unshift(formatColorLabel(tokens.pop()));
      return true;
    }
    if (tokens.length > 2 && isColorSuffix(last) && isColorToken(tokens[tokens.length - 2])) {
      const suffix = tokens.pop();
      const head = formatColorLabel(tokens.pop());
      colorBits.unshift(`${head} ${suffix}`.replace(/\s+/g, " ").trim());
      return true;
    }
    return false;
  };

  while (peelLast()) {
    /* peel trailing color / phrase / slash+suffix */
  }

  // Slash colorway in the middle: MODEL GREY/BLACK MEX → peel from the slash token.
  if (!colorBits.length || tokens.some((t, i) => i > 0 && t.includes("/"))) {
    let slashIdx = -1;
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i].includes("/")) slashIdx = i;
    }
    if (slashIdx > 0) {
      const tail = tokens.splice(slashIdx).map((t) => formatColorLabel(t) || t);
      colorBits.unshift(joinTokens(tail));
    }
  }

  const modelName = joinTokens(tokens) || originalName;
  const color = joinTokens(colorBits);
  return {
    modelName,
    color,
    modelKey: makeModelKey(brand, modelName),
    originalName,
  };
}

export function resolveProductModel(product) {
  const brand = resolveBrand(product?.brand, product?.name);
  const parsed = parseModelAndColor(product?.name, brand);
  const storedKey = String(product?.model_key || "").trim();
  const storedColor = String(product?.color || "").trim();
  const storedBrand = String(product?.brand || "").trim();
  const brandChanged = Boolean(brand) && brand !== storedBrand;
  // Empty color: re-parse so SOFTBLUE/PSG peel into model_key + written colorway.
  const refreshKey = brandChanged || !storedColor;
  return {
    modelName: parsed.modelName,
    color: storedColor || parsed.color,
    modelKey: refreshKey ? parsed.modelKey : storedKey || parsed.modelKey,
    originalName: parsed.originalName,
    brand,
  };
}

export function swatchCss(color) {
  const parts = String(color || "")
    .split(/[/\s-]+/)
    .map((p) => colorBase(p))
    .filter((p) => SWATCH[p]);
  if (parts.length >= 2) {
    return `linear-gradient(135deg, ${SWATCH[parts[0]]} 50%, ${SWATCH[parts[1]]} 50%)`;
  }
  if (parts.length === 1) return SWATCH[parts[0]];
  return "#6b6b70";
}

function inStockSizes(sizes, inStockOnly) {
  const list = Array.isArray(sizes) ? sizes : [];
  return list
    .map((s) => ({ size: String(s.size), qty: Number(s.qty) || 0 }))
    .filter((s) => (inStockOnly ? s.qty > 0 : true));
}

/** Size rows with qty>0 across colorways. Same size in two colors counts twice. */
export function modelStockSizeCount(model) {
  return (model?.colors || []).reduce((n, colorway) => {
    return (
      n +
      (colorway.sizes || []).filter((s) => Number(s.qty) > 0).length
    );
  }, 0);
}

export function parseCatalogSort(value) {
  const v = String(value ?? "")
    .toLowerCase()
    .trim();
  if (v === "name" || v === "alpha" || v === "az") return "name";
  return "stock";
}

function compareBrandName(a, b) {
  return (
    String(a.brand || "").localeCompare(String(b.brand || ""), "en") ||
    String(a.name || "").localeCompare(String(b.name || ""), "en") ||
    String(a.modelKey || "").localeCompare(String(b.modelKey || ""), "en")
  );
}

export function sortCatalogModels(models, sort) {
  const key = parseCatalogSort(sort);
  const list = [...(models || [])].map((model) => ({
    ...model,
    stockSizeCount: model.stockSizeCount ?? modelStockSizeCount(model),
  }));
  if (key === "name") {
    list.sort(compareBrandName);
    return list;
  }
  list.sort((a, b) => {
    const ds = (b.stockSizeCount || 0) - (a.stockSizeCount || 0);
    if (ds) return ds;
    return compareBrandName(a, b);
  });
  return list;
}

/**
 * @param {object[]} products
 * @param {{ inStockOnly?: boolean, sort?: string }} [opts]
 */
export function groupProductsIntoModels(products, { inStockOnly = true, sort = "stock" } = {}) {
  const map = new Map();
  for (const product of products || []) {
    if (product.active === false) continue;
    const meta = resolveProductModel(product);
    const sizes = inStockSizes(product.sizes, inStockOnly);
    if (inStockOnly && !sizes.length) continue;
    if (!map.has(meta.modelKey)) {
      map.set(meta.modelKey, {
        modelKey: meta.modelKey,
        name: meta.modelName || product.name,
        brand: meta.brand || "",
        colors: [],
      });
    }
    const card = map.get(meta.modelKey);
    if (!card.brand && meta.brand) card.brand = meta.brand;
    card.colors.push({
      color: meta.color,
      article: product.article || "",
      productId: Number(product.id),
      price_byn: Number(product.price_byn) || 0,
      old_price_byn: parseOldPriceByn(product.old_price_byn),
      onSale: isOnSale(product),
      sizes,
    });
  }

  const models = [...map.values()].map((card) => {
    card.colors.sort((a, b) => {
      const ac = a.color || a.article;
      const bc = b.color || b.article;
      return ac.localeCompare(bc, "en") || String(a.article).localeCompare(String(b.article));
    });
    card.stockSizeCount = modelStockSizeCount(card);
    return card;
  });
  return sortCatalogModels(models, sort);
}

export function modelMatchesQuery(model, q) {
  const qq = String(q || "")
    .toLowerCase()
    .trim();
  if (!qq) return true;
  if (model.name.toLowerCase().includes(qq)) return true;
  if (String(model.brand || "").toLowerCase().includes(qq)) return true;
  if (String(model.modelKey || "").toLowerCase().includes(qq)) return true;
  return (model.colors || []).some(
    (c) =>
      String(c.color || "").toLowerCase().includes(qq) ||
      String(c.article || "").toLowerCase().includes(qq) ||
      String(c.productId) === qq
  );
}

export function modelHasSize(model, size) {
  if (!size) return true;
  const want = String(size);
  return (model.colors || []).some((c) => (c.sizes || []).some((s) => String(s.size) === want && Number(s.qty) > 0));
}
