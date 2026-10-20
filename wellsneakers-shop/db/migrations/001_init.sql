-- Wellsneakers Shop — initial schema
-- One warehouse, products with sizes, website orders, kassa sales, arrivals

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM ('admin', 'seller');
CREATE TYPE order_status AS ENUM ('processing', 'in_transit', 'issued', 'cancelled');
CREATE TYPE fulfillment_type AS ENUM ('pickup', 'delivery');
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'mixed');
CREATE TYPE sale_operation AS ENUM ('sale', 'return');

CREATE TABLE staff_users (
  id            BIGSERIAL PRIMARY KEY,
  telegram_id   BIGINT UNIQUE NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  role          user_role NOT NULL DEFAULT 'seller',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  brand           TEXT NOT NULL DEFAULT '',
  article         TEXT NOT NULL UNIQUE,          -- sku / артикул на бирке
  barcode         TEXT NOT NULL UNIQUE,          -- генерим (часто = article)
  price_byn       NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- label header fields (editable, so no pen cross-outs)
  label_type      TEXT NOT NULL DEFAULT 'Кроссовки (обувь повседневная)',
  label_upper     TEXT NOT NULL DEFAULT 'текстиль',
  label_lining    TEXT NOT NULL DEFAULT 'текстиль 100%',
  label_sole      TEXT NOT NULL DEFAULT 'Полимерная ЭВА',
  label_season    TEXT NOT NULL DEFAULT 'весна осень',
  label_width     TEXT NOT NULL DEFAULT 'M',
  label_country   TEXT NOT NULL DEFAULT 'Китай Вьетнам Индонезия',
  label_maker     TEXT NOT NULL DEFAULT '',
  label_importer  TEXT NOT NULL DEFAULT 'Шевчук 192364587',
  label_importer_address TEXT NOT NULL DEFAULT 'Острошицкий Городок Ул. Ленина д1, пом3 каб3-1-6',
  label_warranty  TEXT NOT NULL DEFAULT 'Гарантийный срок 30 дней',
  label_tr        TEXT NOT NULL DEFAULT 'ТР ТС 017/2011',
  store_address   TEXT NOT NULL DEFAULT 'пр-т Дзержинского 19',
  oc_product_id   BIGINT,                        -- id из OpenCart при импорте
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX products_brand_idx ON products (brand);
CREATE INDEX products_name_lower_idx ON products ((lower(name)));

CREATE TABLE product_sizes (
  id          BIGSERIAL PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size        TEXT NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  UNIQUE (product_id, size)
);

CREATE INDEX product_sizes_available_idx ON product_sizes (product_id) WHERE qty > 0;

CREATE TABLE product_images (
  id          BIGSERIAL PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE website_orders (
  id              BIGSERIAL PRIMARY KEY,
  order_number    TEXT NOT NULL UNIQUE,          -- видимый клиенту
  customer_name   TEXT NOT NULL,
  phone           TEXT NOT NULL,
  address         TEXT NOT NULL DEFAULT '',
  fulfillment     fulfillment_type NOT NULL DEFAULT 'pickup',
  status          order_status NOT NULL DEFAULT 'processing',
  tracking_number TEXT NOT NULL DEFAULT '',
  comment         TEXT NOT NULL DEFAULT '',
  total_byn       NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE website_order_items (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES website_orders(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id),
  size        TEXT NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  price_byn   NUMERIC(12,2) NOT NULL,
  product_name TEXT NOT NULL,
  article     TEXT NOT NULL
);

CREATE TABLE sales (
  id              BIGSERIAL PRIMARY KEY,          -- номер продажи в кассе
  operation       sale_operation NOT NULL DEFAULT 'sale',
  staff_user_id   BIGINT REFERENCES staff_users(id),
  payment_method  payment_method NOT NULL DEFAULT 'cash',
  delivery        BOOLEAN NOT NULL DEFAULT FALSE,
  discount_byn    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_byn       NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_cash_byn   NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_card_byn   NUMERIC(12,2) NOT NULL DEFAULT 0,
  comment         TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sale_items (
  id          BIGSERIAL PRIMARY KEY,
  sale_id     BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id),
  size        TEXT NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  price_byn   NUMERIC(12,2) NOT NULL,            -- цена в этой продаже (можно менять)
  product_name TEXT NOT NULL,
  article     TEXT NOT NULL
);

CREATE TABLE stock_arrivals (
  id              BIGSERIAL PRIMARY KEY,
  product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size            TEXT NOT NULL,
  qty             INTEGER NOT NULL CHECK (qty > 0),
  label_printed   BOOLEAN NOT NULL DEFAULT FALSE,
  staff_user_id   BIGINT REFERENCES staff_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stock_movements (
  id          BIGSERIAL PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES products(id),
  size        TEXT NOT NULL,
  delta       INTEGER NOT NULL,                  -- + приход, − продажа/заказ
  reason      TEXT NOT NULL,                     -- sale | website_order | arrival | inventory | cancel
  ref_type    TEXT,
  ref_id      BIGINT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO app_meta (key, value) VALUES
  ('schema_version', '1'),
  ('store_address', 'пр-т Дзержинского 19'),
  ('store_phone', '+375 29 790-49-93');
