#!/usr/bin/env node
/**
 * P0: order basket renderer must exist (not a second clearBasket).
 * Regression from #302 crumbs: function renderBasket() was renamed.
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
var html = fs.readFileSync(path.join(__dirname, "../boinya-c/app.html"), "utf8");
var tz = fs.readFileSync(path.join(__dirname, "../TZ.md"), "utf8");

assert(/function renderBasket\(\)/.test(ui), "function renderBasket() exists");
assert(
  /window\.renderBasket = renderBasket/.test(ui),
  "renderBasket exported to window"
);
assert(
  /id="basketContainer"/.test(html),
  "order screen has #basketContainer"
);

var renderer = ui.match(/function renderBasket\(\)\s*\{[\s\S]*?\n    \}/);
assert(!!renderer, "extract renderBasket body");
assert(
  /getElementById\("basketContainer"\)/.test(renderer[0]),
  "renderBasket paints #basketContainer"
);
assert(
  /Корзина пуста/.test(renderer[0]),
  "empty state text lives in renderBasket"
);
assert(
  /basket-card/.test(renderer[0]),
  "renderBasket emits .basket-card rows"
);
assert(
  /crumbKind/.test(renderer[0]),
  "crumb rows from #302 still rendered"
);

var namedFns = ui.match(/function renderBasket\s*\(/g) || [];
assert(namedFns.length === 1, "exactly one renderBasket function");

var clearFns = ui.match(/async function clearBasket\s*\(/g) || [];
assert(clearFns.length === 1, "exactly one async clearBasket (the confirm+wipe)");

var clearBody = ui.match(/async function clearBasket\(\)\s*\{[\s\S]*?\n    \}/);
assert(!!clearBody, "extract clearBasket");
assert(
  /Очистить корзину/.test(clearBody[0]),
  "clearBasket still confirms wipe"
);
assert(
  /renderBasket\(\)/.test(clearBody[0]),
  "clearBasket calls renderBasket after wipe"
);
assert(
  !/getElementById\("basketContainer"\)/.test(clearBody[0]),
  "clearBasket is not the renderer"
);

assert(
  /try \{ renderBasket\(\); \} catch \(eBasket\) \{\}/.test(ui),
  "edit existing record still calls renderBasket"
);
assert(
  /crmEditClient/.test(ui) && /switchTab\("orderScreen"\)/.test(ui),
  "✏️ edit still opens order screen"
);
assert(
  /function basketLinesHtml\(/.test(ui) && /function toggleOrderDetail\(/.test(ui),
  "view card composition helpers intact"
);
assert(
  /function shiftMonthKey_\(ym, delta\)/.test(ui) && /_orderCalMonthKey/.test(ui),
  "calendar #306 helpers still present"
);
assert(
  /openCrumbBuilder/.test(ui) && /addCrumbToBasket_/.test(ui),
  "crumb builder from #302 still present"
);
assert(
  /fix-order-basket-ui-h1/.test(tz),
  "TZ marker fix-order-basket-ui-h1"
);
assert(
  /v71115972/.test(html) && /v71115972/.test(ui),
  "Pages cache-bust v71115972"
);

if (process.exitCode) {
  console.error("test-order-basket-ui FAILED");
  process.exit(process.exitCode);
}
console.log("PASS  test-order-basket-ui");
