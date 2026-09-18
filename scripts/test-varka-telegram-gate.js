#!/usr/bin/env node
/**
 * Partner Mini App must accept a real Telegram WebApp session.
 * index.html must keep #tgWebAppData; client must not require telegramId
 * before hash/username; Worker hydrates identity from initData.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function extractFn_(src, name) {
  let start = src.indexOf("function " + name);
  if (start < 0) fail("helper " + name + " not found");
  let i = src.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) fail("could not extract " + name);
  return src.slice(start, end);
}

const root = path.join(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(root, "varka/index.html"), "utf8");
const appSrc = fs.readFileSync(path.join(root, "varka/app.html"), "utf8");
const workerSrc = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");

const varokSrc = fs.readFileSync(path.join(root, "varok/index.html"), "utf8");

if (!/location\.hash/.test(indexSrc)) {
  fail("varka/index.html must preserve location.hash on redirect");
}
if (!/gb_varka_tg_hash/.test(indexSrc) || !/__telegram__initParams/.test(indexSrc)) {
  fail("varka/index.html must stash tgWebAppData before redirect");
}
if (/location\.replace\("app\.html\?v=" \+ ver\)\s*;/.test(indexSrc)) {
  fail("varka/index.html still drops hash (old replace)");
}
if (/location\.replace\("\.\.\/varka\/"\)/.test(varokSrc)) {
  fail("varok/index.html still drops hash on alias redirect");
}
if (!/location\.hash/.test(varokSrc) || !/varka\/app\.html/.test(varokSrc)) {
  fail("varok/index.html must redirect to app.html and keep hash");
}

if (!/function readLaunchInitDataRaw_/.test(appSrc)) {
  fail("app.html must parse launch initData from hash/session");
}
if (!/function isTelegramWebAppContext_/.test(appSrc)) {
  fail("app.html must detect Telegram WebApp context");
}
if (!/function userHasIdentity_/.test(appSrc)) {
  fail("app.html must treat username/initData as identity");
}
if (!/waits = inTg \? \[50, 100, 150, 250, 400, 600, 800\]/.test(appSrc)) {
  fail("resolveUser_ must wait longer inside Telegram than 4×50ms");
}
if (/if \(!u\.telegramId\) \{\s*renderLogin_\(\);/.test(appSrc)) {
  fail("bootFromApi_ must not gate on telegramId alone");
}
if (!/initData: u\.initData \|\| ""/.test(appSrc)) {
  fail("partnerGetMe must send initData");
}
if (!/Не удалось прочитать профиль Telegram/.test(appSrc)) {
  fail("in-Telegram empty identity must not reuse the external-browser copy");
}
if (!/APP_VER = "3.3.55"/.test(appSrc)) {
  fail("APP_VER must bump so Pages cache drops");
}

if (!/function partnerHydrateIdentityFromInitData_/.test(workerSrc)) {
  fail("Worker must hydrate partnerGetMe from initData");
}
if (!/params = partnerHydrateIdentityFromInitData_\(params \|\| \{\}\)/.test(workerSrc)) {
  fail("cutoverPartnerGetMe_ must hydrate before snap key");
}
if (!/fix-varka-tg-gate-h1/.test(workerSrc)) {
  fail("Worker deploy-marker fix-varka-tg-gate-h1 missing");
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  extractFn_(workerSrc, "partnerNormUserWorker_") +
    "\n" +
    extractFn_(workerSrc, "partnerParseInitDataUser_") +
    "\n" +
    extractFn_(workerSrc, "partnerHydrateIdentityFromInitData_"),
  sandbox
);

const initData =
  "user=" +
  encodeURIComponent(JSON.stringify({ id: 900001, username: "nan_tester", first_name: "NaN" })) +
  "&auth_date=1&hash=abc";

const hydrated = sandbox.partnerHydrateIdentityFromInitData_({
  action: "partnerGetMe",
  telegramId: "",
  username: "",
  initData: initData
});
if (String(hydrated.telegramId) !== "900001") {
  fail("hydrate must lift telegramId from initData, got " + hydrated.telegramId);
}
if (sandbox.partnerNormUserWorker_(hydrated.username) !== "nan_tester") {
  fail("hydrate must lift username from initData, got " + hydrated.username);
}

const already = sandbox.partnerHydrateIdentityFromInitData_({
  telegramId: "1",
  username: "keep_me",
  initData: initData
});
if (already.telegramId !== "1" || already.username !== "keep_me") {
  fail("hydrate must not overwrite an already-complete identity");
}

const empty = sandbox.partnerHydrateIdentityFromInitData_({ telegramId: "", username: "" });
if (empty.telegramId || empty.username) {
  fail("hydrate without initData must stay empty (external browser)");
}

console.log("OK: varka telegram gate contracts");
console.log("  index hash preserve, client wait/parse, worker initData hydrate");
