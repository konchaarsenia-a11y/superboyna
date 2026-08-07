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
  basket_json TEXT DEFAULT '[]',
  segment TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_day ON orders(day_name);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date_iso);
CREATE INDEX IF NOT EXISTS idx_orders_match ON orders(match_key);

CREATE TABLE IF NOT EXISTS cutting_flags (
  date_iso TEXT NOT NULL,
  row_key TEXT NOT NULL,
  surplus REAL DEFAULT 0,
  done INTEGER DEFAULT 0,
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
