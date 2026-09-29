#!/usr/bin/env node
/* Точки входа бота Бойни ведут на next.html и не теряют query/hash. Без сети, Sheets и D1. */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function scriptOf(html) {
  var m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, "inline script");
  return m[1];
}

function run(src, href) {
  var u = new URL(href);
  var replaced = null;
  var location = {
    href: u.href,
    search: u.search,
    hash: u.hash,
    pathname: u.pathname,
    origin: u.origin,
    replace: function (next) {
      replaced = String(next);
    }
  };
  vm.runInNewContext(src, { location: location, URL: URL, URLSearchParams: URLSearchParams });
  assert.ok(replaced, "location.replace called for " + href);
  return replaced;
}

var gs = read("Code.gs");
assert.ok(
  gs.indexOf('return "https://konchaarsenia-a11y.github.io/superboyna/boinya-c/next.html"') > 0,
  "miniAppPublicUrl_ default"
);
assert.ok(gs.indexOf("web_app: { url: appUrl }") > 0, "transfer web_app still uses miniAppPublicUrl_");
assert.ok(gs.indexOf('miniAppPublicUrl_() + "?xfer="') > 0, "xfer query kept");

var worker = read("boinya-c/proxy/worker.js");
assert.ok(worker.indexOf("boinya-c/next.html") < 0, "worker does not host Boinya shell");
assert.ok(worker.indexOf("/varka/app.html") > 0, "Varka route untouched");

var legacy = read("boinya-c/app.html");
assert.ok(legacy.indexOf("app.main.js") > 0, "old shell stays");
assert.ok(!/location\.replace\([^)]*next\.html/.test(legacy), "old shell is not a redirect");

var folder = run(
  scriptOf(read("boinya-c/index.html")),
  "https://konchaarsenia-a11y.github.io/superboyna/boinya-c/?cutover=1&xfer=abc&role=courier#tgWebAppData=TOKEN"
);
assert.ok(folder.indexOf("next.html?") === 0, folder);
assert.ok(folder.indexOf("cutover=1") > 0, folder);
assert.ok(folder.indexOf("xfer=abc") > 0, folder);
assert.ok(folder.indexOf("role=courier") > 0, folder);
assert.ok(folder.indexOf("#tgWebAppData=TOKEN") > 0, folder);
assert.ok(folder.indexOf("app.html") < 0, folder);

var sand = run(
  scriptOf(read("boinya-c/index.html")),
  "https://konchaarsenia-a11y.github.io/superboyna/boinya-c/?sandbox=1&via=direct#tgWebAppData=S"
);
assert.ok(sand.indexOf("sandbox=1") > 0, sand);
assert.ok(sand.indexOf("via=direct") > 0, sand);
assert.ok(!/[?&]cutover=1/.test(sand), sand);
assert.ok(sand.indexOf("#tgWebAppData=S") > 0, sand);

var rootIdx = run(
  scriptOf(read("index.html")),
  "https://konchaarsenia-a11y.github.io/superboyna/?xfer=id1&v=9#tgWebAppData=R"
);
assert.ok(rootIdx.indexOf("boinya-c/next.html?") === 0, rootIdx);
assert.ok(rootIdx.indexOf("xfer=id1") > 0, rootIdx);
assert.ok(rootIdx.indexOf("v=9") > 0, rootIdx);
assert.ok(rootIdx.indexOf("cutover=1") > 0, rootIdx);
assert.ok(rootIdx.indexOf("#tgWebAppData=R") > 0, rootIdx);

var legacyEntry = run(
  scriptOf(read("app.html")),
  "https://konchaarsenia-a11y.github.io/superboyna/app.html?cutover=1&xfer=move1#tgWebAppData=L"
);
assert.ok(legacyEntry.indexOf("/boinya-c/next.html?") > 0, legacyEntry);
assert.ok(legacyEntry.indexOf("xfer=move1") > 0, legacyEntry);
assert.ok(legacyEntry.indexOf("cutover=1") > 0, legacyEntry);
assert.ok(legacyEntry.indexOf("#tgWebAppData=L") > 0, legacyEntry);
assert.ok(legacyEntry.indexOf("app.html") < 0, legacyEntry);

var reset = read("boinya-c/reset.html");
assert.ok(reset.indexOf("./next.html?") > 0, "reset opens next");
assert.ok(reset.indexOf("u.hash") > 0, "reset keeps hash");
assert.ok(reset.indexOf("new URLSearchParams(u.search)") > 0, "reset keeps query");
assert.ok(reset.indexOf("./app.html") < 0, "reset no longer opens old shell");

var prod = read("boinya-c/next/production.js");
assert.ok(prod.indexOf("function courBadge") > 0);
assert.ok(prod.indexOf('action: "getAssembly"') > 0);
assert.ok(prod.indexOf("overlayCour(list, asmClients)") > 0);
assert.ok(prod.indexOf("(badge ? \" · \" + badge : \"\")") > 0);
var main = read("boinya-c/app.main.js");
assert.ok(main.indexOf("function courierAsmBadgeHtml_") > 0);
assert.ok(read("boinya-c/next.html").indexOf("courier-asm.js") > 0);

console.log("bot next.html urls ok");
