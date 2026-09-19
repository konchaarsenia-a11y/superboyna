#!/usr/bin/env node
/**
 * Deep editor must open; Instagram nick and display name are separate shelves.
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

var ui = fs.readFileSync(path.join(__dirname, "../boinya-c/app.main.js"), "utf8");
var html = fs.readFileSync(path.join(__dirname, "../boinya-c/app.html"), "utf8");
var idx = fs.readFileSync(path.join(__dirname, "../boinya-c/index.html"), "utf8");
var tz = fs.readFileSync(path.join(__dirname, "../TZ.md"), "utf8");

assert(/id="btnSubDeepEditor"/.test(html), "deep editor button exists");
assert(
  /toggleSubDetailDeepEditor_\(true\)/.test(html),
  "button opens editor with force=true (no click-rescue toggle-off)"
);
assert(/id="subDetailDeepPanel"/.test(html), "deep panel exists");
assert(
  /Ник в Instagram/.test(html) && /id="subDetailNick"/.test(html),
  "Instagram nick has its own shelf"
);
assert(
  />Имя</.test(html) && /id="subDetailLabel"/.test(html),
  "display name has its own shelf"
);
assert(
  !/Ник \/ строка/.test(html),
  "old combined «Ник / строка» shelf is gone"
);
assert(
  !/<input type="hidden" id="subDetailNick"/.test(html),
  "nick is no longer a hidden field"
);

assert(/function toggleSubDetailDeepEditor_/.test(ui), "toggle helper exists");
assert(
  /_subDetailDeepToggleAt/.test(ui) && /450/.test(ui),
  "debounce guards click-rescue double toggle"
);
assert(
  /scrollIntoView/.test(ui) && /block:\s*"start"/.test(ui),
  "open scrolls the panel into view (start, not nearest)"
);
assert(/function splitIgNickAndDisplay_/.test(ui), "nick/name splitter exists");
assert(/function fillSubDetailNickNameFields_/.test(ui), "card fill uses splitter");
assert(
  /client-name-shelf/.test(ui) && /client-name-shelf/.test(html),
  "view cards can render a separate name shelf"
);

assert(/v71115979/.test(html) && /71115979/.test(idx), "cache-bust version bumped");
assert(/fix-deep-editor-card-shelves-h1/.test(tz), "TZ checklist item exists");

function extractFn(name) {
  var re = new RegExp("function " + name + "\\([\\s\\S]*?\\n    \\}\\n");
  var m = ui.match(re);
  if (!m) throw new Error("cannot extract " + name);
  return m[0];
}
var fnSrc =
  extractFn("igHandleFromSubNick_") +
  extractFn("nickKeysEqual_") +
  extractFn("stripHandleFromText_") +
  extractFn("splitIgNickAndDisplay_");
var fns = {};
/* eslint-disable no-new-func */
new Function("exports", fnSrc +
  ";exports.igHandleFromSubNick_=igHandleFromSubNick_;" +
  "exports.splitIgNickAndDisplay_=splitIgNickAndDisplay_;")(fns);

var split = fns.splitIgNickAndDisplay_("zzz_test", "Тестовый");
assert(split.nick === "zzz_test" && split.name === "Тестовый",
  "zzz_test + Тестовый → separate nick and name");
var split2 = fns.splitIgNickAndDisplay_("Анна (@anna.ig)", "");
assert(split2.nick === "anna.ig" && /Анна/.test(split2.name),
  "combined «Анна (@anna.ig)» splits onto two shelves");
var split3 = fns.splitIgNickAndDisplay_("flamantgracieux", "flamantgracieux");
assert(split3.nick === "flamantgracieux" && !split3.name,
  "same handle twice does not duplicate a name shelf");
var dasha = fns.splitIgNickAndDisplay_("", "ДАША dasha_2135");
assert(dasha.nick === "dasha_2135" && dasha.name === "ДАША",
  "«ДАША dasha_2135» in one label → two shelves");
var dasha2 = fns.splitIgNickAndDisplay_("ДАША dasha_2135", "ДАША dasha_2135");
assert(dasha2.nick === "dasha_2135" && dasha2.name === "ДАША",
  "same combined string in nick+label still splits");

if (process.exitCode) {
  console.error("deep-editor-card-shelves: FAIL");
  process.exit(1);
}
console.log("deep-editor-card-shelves: OK");
