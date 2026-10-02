import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("./week-logic.js");

function monthFixture() {
  const byDate = {};
  let n = 0;
  for (let d = 1; d <= 16; d++) {
    const iso = "2026-10-" + String(d).padStart(2, "0");
    const count = d === 2 ? 8 : 2;
    byDate[iso] = Array.from({ length: count }, (_, i) => ({
      name: "Клиент " + d + "-" + i,
      segment: i % 2 ? "ПП" : "БП",
      address: "ул. Пример " + i
    }));
    n += count;
  }
  return { total: n, byDate: byDate };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("замер: день из людей месяца рисуется сразу, старый путь ждёт сеть", async () => {
  const month = monthFixture();
  assert.ok(month.total >= 30, "в месяце меньше 30 записей");
  assert.equal(month.byDate["2026-10-02"].length, 8);
  const delay = 550;
  const tOld = performance.now();
  await sleep(delay);
  const before = performance.now() - tOld;
  const tNew = performance.now();
  const plan = L.dayOpenPlan({
    date: "2026-10-02",
    people: month.byDate["2026-10-02"],
    now: Date.now(),
    overviewCount: 8
  });
  const after = performance.now() - tNew;
  console.log("CALDAY_BEFORE_MS " + before.toFixed(1));
  console.log("CALDAY_AFTER_MS " + after.toFixed(1));
  assert.ok(before >= 500, "старый путь должен ждать сеть, было " + before);
  assert.equal(plan.fetch, "none");
  assert.equal(plan.res.month.length, 8);
  assert.ok(after < 30, "новый путь должен уложиться в кадр, было " + after);
});
