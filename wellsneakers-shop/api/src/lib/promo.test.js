import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  minskDateTime,
  minskEndOfDay,
  minskStartOfDay,
  parseDayToken,
  parsePromoRangeInput,
  pickCurrentAndNext,
  shouldSendDayBeforeRemind,
  isPromoActive,
  buildPromoRemindText,
  formatMinskDate,
  countdownParts,
} from "./promo.js";

describe("minskDateTime / seed window", () => {
  it("builds 26.09.2026 00:00 Minsk as UTC+3", () => {
    const d = minskStartOfDay(2026, 9, 26);
    assert.equal(d.toISOString(), "2026-09-25T21:00:00.000Z");
  });
  it("builds 27.09.2026 23:59:59 Minsk inclusive end", () => {
    const d = minskEndOfDay(2026, 9, 27);
    assert.equal(d.toISOString(), "2026-09-27T20:59:59.000Z");
  });
});

describe("parseDayToken / parsePromoRangeInput", () => {
  it("parses DD.MM and DD.MM.YYYY", () => {
    assert.deepEqual(parseDayToken("04.10"), { day: 4, month: 10, year: undefined });
    assert.deepEqual(parseDayToken("4.10.2026"), { day: 4, month: 10, year: 2026 });
    assert.equal(parseDayToken("bad"), null);
  });

  it("parses 04.10 05.10 and dash form relative to now before October", () => {
    const now = minskDateTime(2026, 9, 22, 12, 0, 0);
    const a = parsePromoRangeInput("04.10 05.10", now);
    assert.equal(a.ok, true);
    assert.equal(a.startsAt.toISOString(), minskStartOfDay(2026, 10, 4).toISOString());
    assert.equal(a.endsAt.toISOString(), minskEndOfDay(2026, 10, 5).toISOString());

    const b = parsePromoRangeInput("04.10-05.10", now);
    assert.equal(b.ok, true);
    assert.equal(b.startsAt.toISOString(), a.startsAt.toISOString());
  });

  it("parses /promo prefix and same-day window", () => {
    const now = minskDateTime(2026, 9, 22, 12, 0, 0);
    const one = parsePromoRangeInput("/promo 10.10", now);
    assert.equal(one.ok, true);
    assert.equal(formatMinskDate(one.startsAt), "10.10.2026");
    assert.equal(formatMinskDate(one.endsAt), "10.10.2026");
  });

  it("rejects inverted range with explicit years", () => {
    const bad = parsePromoRangeInput("05.10.2026 04.10.2026", minskDateTime(2026, 9, 1));
    assert.equal(bad.ok, false);
  });
});

describe("pickCurrentAndNext", () => {
  const seed = {
    id: 1,
    title: "Все модели по 100 BYN",
    price_byn: 100,
    starts_at: minskStartOfDay(2026, 9, 26).toISOString(),
    ends_at: minskEndOfDay(2026, 9, 27).toISOString(),
    remind_sent_at: null,
  };
  const next = {
    id: 2,
    title: "Все модели по 100 BYN",
    price_byn: 100,
    starts_at: minskStartOfDay(2026, 10, 4).toISOString(),
    ends_at: minskEndOfDay(2026, 10, 5).toISOString(),
    remind_sent_at: null,
  };

  it("before window: no current, next is seed", () => {
    const now = minskDateTime(2026, 9, 22, 12, 0, 0);
    const { current, next: n, active } = pickCurrentAndNext([seed], now);
    assert.equal(active, false);
    assert.equal(current, null);
    assert.equal(n.id, 1);
  });

  it("during window: current=seed, next=upcoming", () => {
    const now = minskDateTime(2026, 9, 26, 15, 0, 0);
    const { current, next: n, active } = pickCurrentAndNext([seed, next], now);
    assert.equal(active, true);
    assert.equal(current.id, 1);
    assert.equal(n.id, 2);
  });

  it("after window without next: both null current / next", () => {
    const now = minskDateTime(2026, 9, 28, 0, 0, 1);
    const { current, next: n, active } = pickCurrentAndNext([seed], now);
    assert.equal(active, false);
    assert.equal(current, null);
    assert.equal(n, null);
  });

  it("isPromoActive matches inclusive end second", () => {
    assert.equal(isPromoActive(seed, minskEndOfDay(2026, 9, 27)), true);
    assert.equal(isPromoActive(seed, new Date(minskEndOfDay(2026, 9, 27).getTime() + 1000)), false);
  });
});

describe("shouldSendDayBeforeRemind (idempotent)", () => {
  const row = {
    id: 1,
    starts_at: minskStartOfDay(2026, 9, 26).toISOString(),
    ends_at: minskEndOfDay(2026, 9, 27).toISOString(),
    remind_sent_at: null,
  };

  it("false more than 24h before end", () => {
    // end = 27.09 23:59:59; 24h before ≈ 26.09 23:59:59
    assert.equal(shouldSendDayBeforeRemind(row, minskDateTime(2026, 9, 26, 12, 0, 0)), false);
  });

  it("true inside the last 24 hours", () => {
    assert.equal(shouldSendDayBeforeRemind(row, minskDateTime(2026, 9, 27, 0, 0, 0)), true);
    assert.equal(shouldSendDayBeforeRemind(row, minskDateTime(2026, 9, 27, 12, 0, 0)), true);
  });

  it("false after end or when already sent", () => {
    assert.equal(shouldSendDayBeforeRemind(row, minskDateTime(2026, 9, 28, 0, 0, 0)), false);
    assert.equal(
      shouldSendDayBeforeRemind({ ...row, remind_sent_at: new Date().toISOString() }, minskDateTime(2026, 9, 27, 12, 0, 0)),
      false
    );
  });
});

describe("buildPromoRemindText / countdownParts", () => {
  it("mentions /promo command", () => {
    const text = buildPromoRemindText({
      title: "Все модели по 100 BYN",
      ends_at: minskEndOfDay(2026, 9, 27).toISOString(),
    });
    assert.match(text, /заканчивается завтра/);
    assert.match(text, /\/promo 04\.10 05\.10/);
  });

  it("countdownParts floors remaining time", () => {
    const now = minskDateTime(2026, 9, 26, 0, 0, 0);
    const target = minskDateTime(2026, 9, 27, 0, 0, 0);
    const p = countdownParts(target, now);
    assert.equal(p.days, 1);
    assert.equal(p.hours, 0);
  });
});
