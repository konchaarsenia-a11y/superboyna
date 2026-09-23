import { query } from "../db.js";
import {
  DEFAULT_PROMO_PRICE,
  DEFAULT_PROMO_TITLE,
  PROMO_TZ,
  formatMinskDate,
  parsePromoRangeInput,
  pickCurrentAndNext,
  serializePromoRow,
  shouldSendDayBeforeRemind,
} from "../lib/promo.js";
import { notifyPromoRemind } from "./notify.js";

export async function ensurePromosTable() {
  await query(`
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
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS promos_starts_at_idx ON promos (starts_at)`);
  await query(`CREATE INDEX IF NOT EXISTS promos_ends_at_idx ON promos (ends_at)`);
}

/** Idempotent seed for first window 26.09–27.09.2026 Minsk. */
export async function seedDefaultPromoWindow() {
  await query(
    `INSERT INTO promos (title, price_byn, starts_at, ends_at)
     SELECT $1, $2,
       TIMESTAMPTZ '2026-09-26 00:00:00+03',
       TIMESTAMPTZ '2026-09-27 23:59:59+03'
     WHERE NOT EXISTS (
       SELECT 1 FROM promos
       WHERE starts_at = TIMESTAMPTZ '2026-09-26 00:00:00+03'
         AND ends_at = TIMESTAMPTZ '2026-09-27 23:59:59+03'
     )`,
    [DEFAULT_PROMO_TITLE, DEFAULT_PROMO_PRICE]
  );
}

export async function listPromoWindows() {
  const { rows } = await query(
    `SELECT id, title, price_byn, starts_at, ends_at, remind_sent_at, created_at, updated_at
     FROM promos
     ORDER BY starts_at ASC, id ASC`
  );
  return rows;
}

export async function getPromoPublicState(now = new Date()) {
  const rows = await listPromoWindows();
  const { current, next, active } = pickCurrentAndNext(rows, now);
  const title = current?.title || next?.title || DEFAULT_PROMO_TITLE;
  const price = Number(current?.price_byn ?? next?.price_byn ?? DEFAULT_PROMO_PRICE);
  return {
    title,
    price_byn: price,
    active,
    current: serializePromoRow(current),
    next: serializePromoRow(next),
    server_now: now.toISOString(),
    timezone: PROMO_TZ,
    next_label: next
      ? `Следующая: ${formatMinskDate(next.starts_at)}–${formatMinskDate(next.ends_at)}`
      : "Следующая дата не задана",
  };
}

export async function createPromoWindow({
  startsAt,
  endsAt,
  title = DEFAULT_PROMO_TITLE,
  priceByn = DEFAULT_PROMO_PRICE,
} = {}) {
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    throw Object.assign(new Error("invalid_starts_at"), { status: 400 });
  }
  if (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime())) {
    throw Object.assign(new Error("invalid_ends_at"), { status: 400 });
  }
  if (!(endsAt.getTime() > startsAt.getTime())) {
    throw Object.assign(new Error("ends_before_starts"), { status: 400 });
  }
  const { rows } = await query(
    `INSERT INTO promos (title, price_byn, starts_at, ends_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, price_byn, starts_at, ends_at, remind_sent_at, created_at, updated_at`,
    [title, priceByn, startsAt.toISOString(), endsAt.toISOString()]
  );
  return rows[0];
}

export async function setNextPromoFromOwnerText(text, now = new Date()) {
  const parsed = parsePromoRangeInput(text, now);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const row = await createPromoWindow({
    startsAt: parsed.startsAt,
    endsAt: parsed.endsAt,
  });
  return {
    ok: true,
    promo: row,
    label: `${formatMinskDate(parsed.startsAt)}–${formatMinskDate(parsed.endsAt)}`,
  };
}

/**
 * Find windows that need a day-before remind, send once, mark remind_sent_at.
 * Idempotent: UPDATE … WHERE remind_sent_at IS NULL.
 */
export async function processPromoReminds(now = new Date()) {
  const rows = await listPromoWindows();
  const due = rows.filter((r) => shouldSendDayBeforeRemind(r, now));
  const results = [];
  for (const row of due) {
    const claimed = await query(
      `UPDATE promos
       SET remind_sent_at = $2, updated_at = now()
       WHERE id = $1 AND remind_sent_at IS NULL
       RETURNING id, title, price_byn, starts_at, ends_at, remind_sent_at`,
      [row.id, now.toISOString()]
    );
    if (!claimed.rows.length) {
      results.push({ id: row.id, sent: false, skipped: "already_sent" });
      continue;
    }
    const promo = claimed.rows[0];
    const notify = await notifyPromoRemind(promo);
    results.push({ id: promo.id, sent: true, notify });
  }
  return { checked: rows.length, due: due.length, results };
}

let remindTimer = null;

/** Poll every `intervalMs` (default 5 min). Safe to call once on API boot. */
export function startPromoRemindScheduler(intervalMs = 5 * 60 * 1000) {
  if (remindTimer) return;
  const tick = async () => {
    try {
      const out = await processPromoReminds(new Date());
      if (out.results.some((r) => r.sent)) {
        console.log("[promo] day-before remind", JSON.stringify(out.results));
      }
    } catch (err) {
      console.warn("[promo] remind tick failed:", err.message);
    }
  };
  tick();
  remindTimer = setInterval(tick, intervalMs);
  if (typeof remindTimer.unref === "function") remindTimer.unref();
}
