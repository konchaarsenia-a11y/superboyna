-- Recurring storefront promo windows («Все модели по 100 BYN»)
-- Times are stored as TIMESTAMPTZ; seed uses Europe/Minsk (UTC+3).

CREATE TABLE IF NOT EXISTS promos (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT NOT NULL DEFAULT 'Все модели по 100 BYN',
  price_byn       NUMERIC(12,2) NOT NULL DEFAULT 100,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  remind_sent_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT promos_ends_after_starts CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS promos_starts_at_idx ON promos (starts_at);
CREATE INDEX IF NOT EXISTS promos_ends_at_idx ON promos (ends_at);
CREATE INDEX IF NOT EXISTS promos_active_window_idx ON promos (starts_at, ends_at);

-- First window: 26.09.2026 00:00 → 27.09.2026 23:59:59 Europe/Minsk
INSERT INTO promos (title, price_byn, starts_at, ends_at)
SELECT
  'Все модели по 100 BYN',
  100,
  TIMESTAMPTZ '2026-09-26 00:00:00+03',
  TIMESTAMPTZ '2026-09-27 23:59:59+03'
WHERE NOT EXISTS (
  SELECT 1 FROM promos
  WHERE starts_at = TIMESTAMPTZ '2026-09-26 00:00:00+03'
    AND ends_at = TIMESTAMPTZ '2026-09-27 23:59:59+03'
);
