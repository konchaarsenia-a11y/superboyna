-- Optional crossed-out price. On sale when old_price_byn IS NOT NULL AND old_price_byn > price_byn.
ALTER TABLE products ADD COLUMN IF NOT EXISTS old_price_byn NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS products_on_sale_idx
  ON products (id)
  WHERE old_price_byn IS NOT NULL AND old_price_byn > price_byn;
