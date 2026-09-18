/**
 * Storefront gender: men | women | unisex | null.
 * Unknown stays null — do not guess the whole catalog.
 */

export function parseGenderQuery(value) {
  const v = String(value ?? "")
    .toLowerCase()
    .trim();
  if (!v) return "";
  if (["men", "man", "male", "m", "муж", "мужское", "мужской", "ему"].includes(v)) return "men";
  if (["women", "woman", "female", "w", "жен", "женское", "женский", "ей"].includes(v)) return "women";
  if (["unisex", "унисекс", "uni"].includes(v)) return "unisex";
  return "";
}

export function normalizeGender(value) {
  if (value == null || value === "") return null;
  return parseGenderQuery(value) || null;
}

export function readGenderField(body) {
  if (!body || typeof body !== "object") return undefined;
  if (!("gender" in body) && !("Gender" in body)) return undefined;
  const raw = body.gender !== undefined ? body.gender : body.Gender;
  if (raw == null || raw === "") return null;
  return normalizeGender(raw);
}

function haystack(name, category) {
  return [name, category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/ё/g, "е");
}

export function inferGender({ name = "", category = "", gender } = {}) {
  const explicit = normalizeGender(gender);
  if (explicit) return explicit;
  const t = haystack(name, category);
  if (!t.trim()) return null;

  const unisex = /\b(unisex|унисекс)\b/.test(t);
  const women =
    /(wmns|\bwms\b|women'?s|\bwomen\b|\bwoman\b|\bladies\b|\blady\b|\bgirls?\b|женск|для женщин|девочк|девуш)/.test(
      t
    );
  const men = /(\bmens\b|\bmen\b|\bmale\b|мужск|для мужчин|мальчик)/.test(t);

  if (women && men) return "unisex";
  if (women) return "women";
  if (men) return "men";
  if (unisex) return "unisex";
  return null;
}

export function productMatchesGender(row, gender) {
  const want = parseGenderQuery(gender);
  if (!want) return true;
  return normalizeGender(row?.gender) === want;
}

export function filterProductsByGender(products, gender) {
  return (products || []).filter((p) => productMatchesGender(p, gender));
}
