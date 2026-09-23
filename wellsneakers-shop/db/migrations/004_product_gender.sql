-- Optional catalog gender. Unknown stays NULL (do not guess the whole catalog).
-- Filter: GET /api/catalog?gender=men|women matches exact value only.
ALTER TABLE products ADD COLUMN IF NOT EXISTS gender TEXT;

CREATE INDEX IF NOT EXISTS products_gender_idx ON products (gender);
