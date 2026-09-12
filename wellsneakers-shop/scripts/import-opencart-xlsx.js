/**
 * Import OpenCart Export/Import XLSX (Products + ProductOptionValues) into Postgres.
 * Usage:
 *   DATABASE_URL=... node scripts/import-opencart-xlsx.js [path/to/products.xlsx]
 * Does not touch the live OpenCart admin.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import XLSX from "xlsx";
import pg from "pg";
import { parseModelAndColor } from "../api/src/lib/modelGroup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const xlsxPath =
  process.argv[2] ||
  path.resolve(__dirname, "../data/export_products-2026-09-10.xlsx");

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgres://wellsneakers:wellsneakers@127.0.0.1:5432/wellsneakers";

function sheetToRows(wb, name) {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  // case-insensitive
  const map = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [String(k).toLowerCase(), v])
  );
  for (const k of keys) {
    const v = map[String(k).toLowerCase()];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

async function main() {
  if (!fs.existsSync(xlsxPath)) {
    console.error("File not found:", xlsxPath);
    process.exit(1);
  }
  console.log("Reading", xlsxPath);
  const wb = XLSX.readFile(xlsxPath);
  console.log("Sheets:", wb.SheetNames.join(", "));

  const products = sheetToRows(wb, "Products");
  const optionValues = sheetToRows(wb, "ProductOptionValues");
  console.log("Products rows:", products.length, "OptionValues:", optionValues.length);

  // sizes by product_id from OC
  const sizesByProduct = new Map();
  for (const row of optionValues) {
    const pid = String(pick(row, ["product_id", "Product ID", "productId"]));
    const size = String(pick(row, ["option_value", "Option Value", "name", "value", "option_value_name"]));
    const qty = Number(pick(row, ["quantity", "Quantity", "qty"]) || 0);
    if (!pid || !size) continue;
    if (!sizesByProduct.has(pid)) sizesByProduct.set(pid, []);
    sizesByProduct.get(pid).push({ size, qty: Number.isFinite(qty) ? Math.max(0, qty) : 0 });
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS model_key TEXT NOT NULL DEFAULT ''`);
  let upserted = 0;
  let skipped = 0;

  for (const row of products) {
    const ocId = pick(row, ["product_id", "Product ID", "productId"]);
    const name = String(
      pick(row, ["name(ru-ru)", "name", "Name", "product_name", "model", "Model"]) || ""
    ).trim();
    const model = String(pick(row, ["model", "Model"]) || name).trim();
    const article = String(pick(row, ["sku", "SKU", "upc", "UPC", "ean", "EAN"]) || ocId || "").trim();
    const brand = String(pick(row, ["manufacturer", "Manufacturer", "brand"]) || "").trim();
    const price = Number(pick(row, ["price", "Price"]) || 0);
    const status = String(pick(row, ["status", "Status"]) || "true");
    if (!name && !model) {
      skipped++;
      continue;
    }
    if (!article) {
      skipped++;
      continue;
    }
    const active =
      status === "1" ||
      status === "true" ||
      status.toLowerCase() === "enabled" ||
      status === "Включено";
    const displayName = name || model;
    const barcode = article;
    const parsed = parseModelAndColor(displayName, brand);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO products (name, brand, article, barcode, price_byn, oc_product_id, active, color, model_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (article) DO UPDATE SET
           name = EXCLUDED.name,
           brand = EXCLUDED.brand,
           barcode = EXCLUDED.barcode,
           price_byn = EXCLUDED.price_byn,
           oc_product_id = EXCLUDED.oc_product_id,
           active = EXCLUDED.active,
           color = EXCLUDED.color,
           model_key = EXCLUDED.model_key,
           updated_at = now()
         RETURNING id`,
        [
          displayName,
          brand,
          article,
          barcode,
          Number.isFinite(price) ? price : 0,
          ocId || null,
          active,
          parsed.color,
          parsed.modelKey,
        ]
      );
      const productId = rows[0].id;
      const sizes = sizesByProduct.get(String(ocId)) || [];
      for (const s of sizes) {
        await client.query(
          `INSERT INTO product_sizes (product_id, size, qty) VALUES ($1,$2,$3)
           ON CONFLICT (product_id, size) DO UPDATE SET qty = EXCLUDED.qty`,
          [productId, s.size, s.qty]
        );
      }
      await client.query("COMMIT");
      upserted++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.warn("skip", article, err.message);
      skipped++;
    } finally {
      client.release();
    }
  }

  console.log(JSON.stringify({ ok: true, upserted, skipped }, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
