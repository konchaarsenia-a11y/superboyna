/**
 * Storefront color collections: white / black from products.color.
 * Match the stored colorway token (WHITE, WHITE/RED, белый…), not the model name.
 */

export function parseColorQuery(value) {
  const v = String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/ё/g, "е");
  if (!v) return "";
  if (["white", "белый", "белая", "белое", "белые", "бел"].includes(v)) return "white";
  if (["black", "черный", "черная", "черное", "черные", "черн"].includes(v)) return "black";
  return "";
}

function colorHay(color) {
  return String(color ?? "")
    .toLowerCase()
    .replace(/ё/g, "е");
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
