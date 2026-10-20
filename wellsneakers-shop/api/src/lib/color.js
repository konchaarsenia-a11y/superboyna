/**
 * Storefront color collections: white / black / bright from products.color.
 * Match the stored colorway token (WHITE, WHITE/RED, белый…), not the model name.
 */

export function parseColorQuery(value) {
  const v = String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/ё/g, "е");
  if (!v) return "";
  if (["white", "белый", "белая", "белое", "белые", "бел"].includes(v)) return "white";
  if (["black", "черный", "черная", "черное", "черные", "черн", "строгие", "строгий", "dark"].includes(v)) {
    return "black";
  }
  if (["bright", "яркие", "яркий", "яркая", "яркое", "colorful", "vivid"].includes(v)) return "bright";
  return "";
}

function colorHay(color) {
  return String(color ?? "")
    .toLowerCase()
    .replace(/ё/g, "е");
}

function colorTokens(color) {
  return colorHay(color)
    .split(/[/\s,_-]+/)
    .map((t) => t.replace(/[^a-zа-я0-9]+/gi, ""))
    .filter(Boolean);
}

const BRIGHT_TOKEN_RE =
  /^(red|pink|yellow|green|blue|orange|purple|violet|magenta|lime|volt|fuchsia|coral|gold|taxi|royal|teal|cyan|crimson|scarlet|chicago|hotpink|красн|розов|желт|зелен|син|голуб|оранж|фиолет|ярк)/;

function isBrightToken(token) {
  return BRIGHT_TOKEN_RE.test(String(token || ""));
}

export function colorMatchesFamily(color, family) {
  const want = parseColorQuery(family) || String(family || "").toLowerCase();
  const t = colorHay(color);
  if (!t || !want) return false;
  if (want === "white") {
    return /(white|off[\s-]?white|ivory|cream|sail|bone|белый|белая|белое|белые)/.test(t);
  }
  if (want === "black") {
    return /(black|\bblk\b|черн)/.test(t);
  }
  if (want === "bright") {
    return colorTokens(color).some(isBrightToken);
  }
  return false;
}

export function modelMatchesColor(model, family) {
  const want = parseColorQuery(family);
  if (!want) return true;
  return (model?.colors || []).some((c) => colorMatchesFamily(c.color, want));
}

export function filterModelsByColor(models, family) {
  const want = parseColorQuery(family);
  if (!want) return models || [];
  return (models || []).filter((m) => modelMatchesColor(m, want));
}

export function firstMatchingColorIndex(colors, family) {
  const want = parseColorQuery(family);
  if (!want) return 0;
  const idx = (colors || []).findIndex((c) => colorMatchesFamily(c.color, want));
  return idx >= 0 ? idx : 0;
}
