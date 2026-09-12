import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";
import { backfillProductModelKeys, ensureProductModelColumns } from "./services/catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../db/migrations");

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows: haveProducts } = await pool.query(
    `SELECT to_regclass('public.products') IS NOT NULL AS ok`
  );
  if (haveProducts[0]?.ok) {
    await pool.query(
      `INSERT INTO schema_migrations (filename) VALUES ('001_init.sql') ON CONFLICT DO NOTHING`
    );
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const { rows } = await pool.query(`SELECT 1 FROM schema_migrations WHERE filename = $1`, [file]);
    if (rows.length) {
      console.log(`Skip ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    process.stdout.write(`Applying ${file}... `);
    await pool.query(sql);
    await pool.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
    console.log("ok");
  }

  await ensureProductModelColumns();
  const n = await backfillProductModelKeys();
  console.log(`Backfilled model_key/color: ${n}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
