/**
 * Фаза 2 — набросок: VPS забирает остатки из Google Sheet через GAS.
 *
 * Не пишет в Postgres и не ходит на прод, пока не заданы переменные.
 * Боевой приёмник на VPS ещё не сделан: POST /api/internal/sync/catalog
 * с заголовком X-Sync-Secret. Этот скрипт только читает exportCatalog.
 *
 *   GAS_EXEC_URL='https://script.google.com/macros/s/…/exec' \
 *   SYNC_SECRET='…' \
 *   node wellsneakers-ops/sync/pull-stock.mjs
 *
 * Печатает JSON. Ключ сопоставления с витриной — article (и vps_product_id, если заполнен).
 */

const url = process.env.GAS_EXEC_URL || "";
const secret = process.env.SYNC_SECRET || "";

if (!url || !secret) {
  console.error("Нужны GAS_EXEC_URL и SYNC_SECRET. Без них скрипт ничего не вызывает.");
  console.error("Ожидаемый приёмник VPS (ещё не в этом PR): POST /api/internal/sync/catalog");
  console.error("Тело: { source: 'wellsneakers-ops', products: [{ article, price_byn, sizes: [{ size, qty }] }] }");
  console.error("Заголовок: X-Sync-Secret");
  process.exit(2);
}

const endpoint = new URL(url);
endpoint.searchParams.set("action", "exportCatalog");
endpoint.searchParams.set("syncSecret", secret);

const response = await fetch(endpoint, { redirect: "follow" });
const text = await response.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  console.error("GAS вернул не JSON", response.status, text.slice(0, 400));
  process.exit(1);
}
if (!data.ok) {
  console.error(data.error || "export_failed");
  process.exit(1);
}

const products = data.products || [];
const sizes = products.reduce((n, p) => n + ((p.sizes || []).length), 0);
console.log(JSON.stringify({
  ok: true,
  dryRun: true,
  wrotePostgres: false,
  generated_at: data.generated_at,
  products: products.length,
  sizes,
  sample: products.slice(0, 3)
}, null, 2));
