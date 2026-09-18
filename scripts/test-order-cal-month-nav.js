#!/usr/bin/env node
/**
 * P0: month selector on client entry (Заказ) must walk calendar order
 * Sep → Oct → Nov with no gaps. Integer YYYY-MM, not Date overflow.
 */
var fs = require("fs");
var path = require("path");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL  " + msg);
    process.exitCode = 1;
    return false;
  }
  console.log("ok    " + msg);
  return true;
}

var uiPath = path.join(__dirname, "../boinya-c/app.main.js");
var ui = fs.readFileSync(uiPath, "utf8");

assert(
  /var MONTH_NAMES_RU_ = \[/.test(ui),
  "MONTH_NAMES_RU_ exists"
);
assert(
  /function shiftMonthKey_\(ym, delta\)/.test(ui),
  "shiftMonthKey_ exists"
);
assert(
  /_orderCalMonthKey/.test(ui),
  "order calendar has dedicated month pointer"
);
assert(
  !/new Date\(Number\(p\[0\]\), Number\(p\[1\]\) - 1 \+ Number\(delta/.test(ui),
  "shiftOrderCalMonth_ no longer uses Date month overflow"
);
assert(
  /fix-order-cal-month-nav-h1/.test(fs.readFileSync(path.join(__dirname, "../TZ.md"), "utf8")),
  "TZ marker fix-order-cal-month-nav-h1"
);

var namesBlock = ui.match(/var MONTH_NAMES_RU_ = \[([\s\S]*?)\];/);
assert(!!namesBlock, "extract MONTH_NAMES_RU_");
var padBlock = ui.match(/function pad2Month_\([\s\S]*?\n    \}/);
var shiftBlock = ui.match(/function shiftMonthKey_\([\s\S]*?\n    \}/);
var titleBlock = ui.match(/function monthTitleRu_\([\s\S]*?\n    \}/);
assert(!!padBlock && !!shiftBlock && !!titleBlock, "extract pad/shift/title helpers");

/* eslint-disable no-eval */
eval(namesBlock[0]);
eval(padBlock[0]);
eval(shiftBlock[0]);
eval(titleBlock[0]);

assert(MONTH_NAMES_RU_.length === 12, "12 Russian month names");
assert(MONTH_NAMES_RU_[8] === "сентябрь", "index 8 = сентябрь");
assert(MONTH_NAMES_RU_[9] === "октябрь", "index 9 = октябрь");
assert(MONTH_NAMES_RU_[10] === "ноябрь", "index 10 = ноябрь");
assert(MONTH_NAMES_RU_.indexOf("октябрь") === 9, "октябрь not missing");

assert(shiftMonthKey_("2026-09", 1) === "2026-10", "Sep +1 = Oct");
assert(shiftMonthKey_("2026-10", 1) === "2026-11", "Oct +1 = Nov");
assert(shiftMonthKey_("2026-10", -1) === "2026-09", "Oct -1 = Sep");
assert(shiftMonthKey_("2026-12", 1) === "2027-01", "Dec +1 = next Jan");
assert(shiftMonthKey_("2026-01", -1) === "2025-12", "Jan -1 = prev Dec");
assert(shiftMonthKey_("2026-08", 2) === "2026-10", "+2 from Aug lands on Oct, not Nov");

var walked = [];
var key = "2026-01";
for (var i = 0; i < 12; i++) {
  walked.push(key);
  key = shiftMonthKey_(key, 1);
}
assert(walked.join(",") === [
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
  "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"
].join(","), "full year consecutive, no gaps");
assert(key === "2027-01", "13th step is next January");

var titles = walked.map(function (ym) { return monthTitleRu_(ym); });
assert(titles[8] === "сентябрь 2026", "title Sep");
assert(titles[9] === "октябрь 2026", "title Oct");
assert(titles[10] === "ноябрь 2026", "title Nov");
assert(titles.indexOf("октябрь 2026") === 9, "Oct title sits between Sep and Nov");

// Reproduce the Date overflow class that skips a month (31 Oct + 1 month → Dec).
var overflow = new Date(2026, 9, 31); // Oct 31
overflow.setMonth(overflow.getMonth() + 1);
var overflowKey = overflow.getFullYear() + "-" + pad2Month_(overflow.getMonth() + 1);
assert(overflowKey === "2026-12", "Date overflow would skip Nov (sanity of the bug class)");
assert(shiftMonthKey_("2026-10", 1) !== overflowKey, "integer shift does not follow Date overflow");

if (process.exitCode) {
  console.error("test-order-cal-month-nav FAILED");
  process.exit(process.exitCode);
}
console.log("PASS  test-order-cal-month-nav");
