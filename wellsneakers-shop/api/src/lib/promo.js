/**
 * Promo window helpers (Europe/Minsk, fixed UTC+3 — no DST).
 */

export const PROMO_TZ = "Europe/Minsk";
export const PROMO_OFFSET = "+03:00";
export const DEFAULT_PROMO_TITLE = "Все модели по 100 BYN";
export const DEFAULT_PROMO_PRICE = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Parts of `date` in Europe/Minsk calendar. */
export function minskParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: PROMO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map = Object.fromEntries(
    fmt.formatToParts(d).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Build a Date for a local Minsk wall-clock instant. */
export function minskDateTime(year, month, day, hour = 0, minute = 0, second = 0) {
  const iso =
    `${year}-${pad2(month)}-${pad2(day)}T` +
    `${pad2(hour)}:${pad2(minute)}:${pad2(second)}${PROMO_OFFSET}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid_minsk_datetime:${iso}`);
  }
  return d;
}

/** Inclusive end of calendar day in Minsk (23:59:59.000). */
export function minskEndOfDay(year, month, day) {
  return minskDateTime(year, month, day, 23, 59, 59);
}

/** Start of calendar day in Minsk. */
export function minskStartOfDay(year, month, day) {
  return minskDateTime(year, month, day, 0, 0, 0);
}

/**
 * Parse a day token: `04.10`, `4.10`, `04.10.2026`.
 * Returns { day, month, year? } or null.
 */
export function parseDayToken(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3] ? Number(m[3]) : undefined;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  if (year != null && (year < 2000 || year > 2100)) return null;
  return { day, month, year };
}

/**
 * Resolve year for a day/month relative to `now` in Minsk.
 * If the date (start of day) is already in the past, bump to next year.
 */
export function resolvePromoYear(day, month, explicitYear, now = new Date()) {
  if (explicitYear) return explicitYear;
  const p = minskParts(now);
  let year = p.year;
  const start = minskStartOfDay(year, month, day);
  if (start.getTime() < now.getTime()) year += 1;
  return year;
}

/**
 * Parse owner input into a { startsAt, endsAt } window.
 * Accepts:
 *   "04.10 05.10" | "04.10-05.10" | "04.10–05.10" | ["/promo","04.10","05.10"]
 * Same-day allowed (one calendar day).
 */
export function parsePromoRangeInput(input, now = new Date()) {
  const text = Array.isArray(input)
    ? input.join(" ")
    : String(input || "").replace(/^\/promo\s*/i, "").trim();
  if (!text) return { ok: false, error: "empty" };

  const normalized = text.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  let startTok;
  let endTok;

  const dash = normalized.match(/^(\d{1,2}\.\d{1,2}(?:\.\d{4})?)\s*-\s*(\d{1,2}\.\d{1,2}(?:\.\d{4})?)$/);
  if (dash) {
    startTok = dash[1];
    endTok = dash[2];
  } else {
    const parts = normalized.split(" ").filter(Boolean);
    if (parts.length === 2) {
      startTok = parts[0];
      endTok = parts[1];
    } else if (parts.length === 1 && /^\d{1,2}\.\d{1,2}(?:\.\d{4})?$/.test(parts[0])) {
      startTok = parts[0];
      endTok = parts[0];
    } else {
      return { ok: false, error: "bad_format" };
    }
  }

  const startParsed = parseDayToken(startTok);
  const endParsed = parseDayToken(endTok);
  if (!startParsed || !endParsed) return { ok: false, error: "bad_day" };

  const startYear = resolvePromoYear(
    startParsed.day,
    startParsed.month,
    startParsed.year,
    now
  );
  let endYear = endParsed.year
    ? endParsed.year
    : startYear;
  // Cross-year range without explicit end year (e.g. 30.12-02.01)
  if (!endParsed.year) {
    const startOrd = startParsed.month * 100 + startParsed.day;
    const endOrd = endParsed.month * 100 + endParsed.day;
    if (endOrd < startOrd) endYear = startYear + 1;
  }

  let startsAt;
  let endsAt;
  try {
    startsAt = minskStartOfDay(startYear, startParsed.month, startParsed.day);
    endsAt = minskEndOfDay(endYear, endParsed.month, endParsed.day);
  } catch {
    return { ok: false, error: "invalid_date" };
  }

  if (!(endsAt.getTime() > startsAt.getTime())) {
    return { ok: false, error: "ends_before_starts" };
  }

  return { ok: true, startsAt, endsAt };
}

export function isPromoActive(row, now = new Date()) {
  if (!row) return false;
  const t = now.getTime();
  const start = new Date(row.starts_at).getTime();
  const end = new Date(row.ends_at).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && t >= start && t <= end;
}

/** Day-before window: now in [ends_at - 1d, ends_at) and remind not yet sent. */
export function shouldSendDayBeforeRemind(row, now = new Date()) {
  if (!row || row.remind_sent_at) return false;
  const end = new Date(row.ends_at).getTime();
  if (!Number.isFinite(end)) return false;
  const t = now.getTime();
  const remindFrom = end - DAY_MS;
  return t >= remindFrom && t < end;
}

export function formatMinskDate(date) {
  const p = minskParts(date);
  return `${pad2(p.day)}.${pad2(p.month)}.${p.year}`;
}

export function formatMinskDateTime(date) {
  const p = minskParts(date);
  return `${pad2(p.day)}.${pad2(p.month)}.${p.year} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function serializePromoRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    title: row.title || DEFAULT_PROMO_TITLE,
    price_byn: Number(row.price_byn ?? DEFAULT_PROMO_PRICE),
    starts_at: new Date(row.starts_at).toISOString(),
    ends_at: new Date(row.ends_at).toISOString(),
    remind_sent_at: row.remind_sent_at ? new Date(row.remind_sent_at).toISOString() : null,
  };
}

/**
 * Pick current (active) and next (soonest future start) from a list of rows.
 * Next is the earliest window that starts after now; if a current exists,
 * prefer the earliest that starts at/after current.ends_at.
 */
export function pickCurrentAndNext(rows, now = new Date()) {
  const list = (rows || [])
    .map((r) => ({
      ...r,
      _start: new Date(r.starts_at).getTime(),
      _end: new Date(r.ends_at).getTime(),
    }))
    .filter((r) => Number.isFinite(r._start) && Number.isFinite(r._end))
    .sort((a, b) => a._start - b._start || a._end - b._end);

  const t = now.getTime();
  const current = list.find((r) => t >= r._start && t <= r._end) || null;
  const after = current ? current._end : t;
  const next = list.find((r) => r._start >= after && (!current || r.id !== current.id)) || null;

  return {
    current: current ? stripInternal(current) : null,
    next: next ? stripInternal(next) : null,
    active: Boolean(current),
  };
}

function stripInternal(row) {
  const { _start, _end, ...rest } = row;
  return rest;
}

/** Human countdown parts (whole units). */
export function countdownParts(target, now = new Date()) {
  const ms = Math.max(0, new Date(target).getTime() - now.getTime());
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { ms, days, hours, minutes, seconds };
}

/** Telegram copy for the day-before owner remind. */
export function buildPromoRemindText(promo) {
  const ends = formatMinskDate(promo.ends_at);
  const endsAt = formatMinskDateTime(promo.ends_at);
  const title = promo.title || DEFAULT_PROMO_TITLE;
  return (
    `⏰ Акция «${title}» заканчивается завтра (${ends}).\n` +
    `Конец окна: ${endsAt} (Минск).\n\n` +
    `Задайте следующую дату командой:\n` +
    `/promo 04.10 05.10\n` +
    `или\n` +
    `/promo 04.10-05.10`
  );
}
