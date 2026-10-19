import assert from "node:assert/strict";
import test from "node:test";
import { costDigestDue_, costDigestMonth_, costDigestText_ } from "./cost-digest.js";

test("only the 1st at 11:00 Minsk, previous month", function () {
  assert.equal(costDigestDue_({ ymd: "2026-11-01", hour: 11, minute: 0 }), "2026-10");
  assert.equal(costDigestDue_({ ymd: "2026-11-01", hour: 19, minute: 0 }), "");
  assert.equal(costDigestDue_({ ymd: "2026-11-01", hour: 11, minute: 30 }), "");
  assert.equal(costDigestDue_({ ymd: "2026-10-19", hour: 11, minute: 0 }), "");
  assert.equal(costDigestDue_({ ymd: "2026-01-01", hour: 11, minute: 0 }), "2025-12");
  assert.equal(costDigestMonth_("2026-11-02"), "");
});

test("text matches the Apps Script digest", function () {
  const text = costDigestText_("2026-10", [
    { sku: "Индейка", cost: 12.5, yield: 0.2, from: "2026-10-03" }
  ]);
  assert.match(text, /^Себес за 2026-10:\n• Индейка · 12\.5 · выход 0\.2 · с 2026-10-03\n\nКнопка пересчитает розницу/);
});

test("1 Nov 2026 08:00 UTC is 11:00 Minsk", function () {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Minsk",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  const g = {};
  fmt.formatToParts(new Date("2026-11-01T08:00:00Z")).forEach(function (p) {
    g[p.type] = p.value;
  });
  const ymd = g.year + "-" + g.month + "-" + g.day;
  let hour = Number(g.hour);
  if (hour === 24) hour = 0;
  assert.equal(costDigestDue_({ ymd: ymd, hour: hour, minute: Number(g.minute) }), "2026-10");
});
