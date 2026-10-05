-- Бойня C — D1 (песочница). Не связана с прод-Sheets.

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  date_iso TEXT NOT NULL,
  day_name TEXT NOT NULL,
  client TEXT NOT NULL,
  match_key TEXT NOT NULL,
  address TEXT DEFAULT '',
  note TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  basket_json TEXT DEFAULT '[]',
  segment TEXT DEFAULT '',
  source TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  updated_at TEXT NOT NULL,
  meta_json TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_orders_day ON orders(day_name);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date_iso);
CREATE INDEX IF NOT EXISTS idx_orders_match ON orders(match_key);

CREATE TABLE IF NOT EXISTS assembly_dry (
  date_iso TEXT NOT NULL,
  row_key TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  dry_g REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date_iso, row_key)
);

CREATE TABLE IF NOT EXISTS cutting_flags (
  date_iso TEXT NOT NULL,
  row_key TEXT NOT NULL,
  surplus REAL DEFAULT 0,
  done INTEGER DEFAULT 0,
  laid INTEGER DEFAULT 0,
  out_next INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date_iso, row_key)
);

CREATE TABLE IF NOT EXISTS deliveries (
  date_iso TEXT NOT NULL,
  match_key TEXT NOT NULL,
  delivered INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date_iso, match_key)
);

-- Готовые ответы API (нарезка/курьер/месяц/…) — JSON как в GAS
CREATE TABLE IF NOT EXISTS snap_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Очередь зеркалирования D1 → Sheets (d1-primary canon)
CREATE TABLE IF NOT EXISTS sheet_outbox (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  last_error TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sheet_outbox_status ON sheet_outbox(status);

-- Точки выезда курьера. Остатки склада не делятся.
CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  is_departure INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT ''
);

-- Цели: задачи (общие и личные) и показатели владельца. Не зеркалится в Sheets.
-- scope пустой = общая задача (старые строки без колонки тоже общие). person + owner_tg_id = личная.
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  horizon TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT NOT NULL DEFAULT '',
  metric_id TEXT NOT NULL DEFAULT '',
  target REAL,
  period TEXT NOT NULL DEFAULT '',
  date_from TEXT NOT NULL DEFAULT '',
  date_to TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  owner_tg_id TEXT NOT NULL DEFAULT '',
  parent_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
