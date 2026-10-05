/**
 * Storefront sale = optional old_price_byn greater than the current price_byn.
 * Postgres NUMERIC often arrives as a string; coerce before comparing.
 */

export function isSaleQuery(value) {
  const v = String(value ?? "")
    .toLowerCase()
    .trim();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function parseOldPriceByn(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function isOnSale(row) {
  if (!row) return false;
  const old = Number(row.old_price_byn);
  const price = Number(row.price_byn);
  return Number.isFinite(old) && Number.isFinite(price) && old > price;
}

/** Map OpenCart price + optional special / old_price into our columns. */
export function mapOcPrices({ price, special, oldPrice } = {}) {
  const current = Number(price);
  const sellingBase = Number.isFinite(current) ? current : 0;
  const specialN = special == null || special === "" ? NaN : Number(special);
  const oldN = oldPrice == null || oldPrice === "" ? NaN : Number(oldPrice);

  if (Number.isFinite(specialN) && specialN > 0 && specialN < sellingBase) {
    return { price_byn: specialN, old_price_byn: sellingBase };
  }
  const old = Number.isFinite(oldN) && oldN > sellingBase ? oldN : null;
  return { price_byn: sellingBase, old_price_byn: old };
}

export function filterOnSaleProducts(products) {
  return (products || []).filter(isOnSale);
}

/** Keep models that still have at least one on-sale colorway. */
export function filterOnSaleModels(models) {
  return (models || [])
    .map((m) => ({
      ...m,
      colors: (m.colors || []).filter(isOnSale),
    }))
    .filter((m) => m.colors.length);
}

export function readOldPriceField(body) {
  if (!body || typeof body !== "object") return undefined;
  if (!("old_price_byn" in body) && !("oldPriceByn" in body)) return undefined;
  const raw = body.old_price_byn !== undefined ? body.old_price_byn : body.oldPriceByn;
  return parseOldPriceByn(raw);
}
