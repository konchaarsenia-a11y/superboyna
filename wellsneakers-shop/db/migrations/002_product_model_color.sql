-- Colorways of one sneaker stay as product rows (staff article/SKU).
-- model_key + color let GET /api/catalog group them into one card.
ALTER TABLE products ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_key TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS products_model_key_idx ON products (model_key);
CREATE INDEX IF NOT EXISTS products_color_lower_idx ON products ((lower(color)));
