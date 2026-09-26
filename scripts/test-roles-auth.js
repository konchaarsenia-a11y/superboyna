#!/usr/bin/env node
/**
 * roles-audit 2026-09-26: Telegram initData HMAC (Worker + GAS), owner-only gate, роли/вкладки,
 * слияние заявок из листа «Доступы» в D1 listAccess, fail-closed UI.
 * initData подписывается фейковым bot token (Node crypto) — как настоящий Telegram.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const nodeCrypto = require("crypto");

let failed = 0;
function ok(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  } else {
    console.log("  ok", msg);
  }
}

function extractFn_(src, name) {
  let start = src.indexOf("async function " + name + "(");
  if (start < 0) start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("fn " + name + " not found");
  let i = src.indexOf("{", src.indexOf(")", start));
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unterminated " + name);
}
function extractLine_(src, prefix) {
  const i = src.indexOf(prefix);
  if (i < 0) throw new Error("line " + prefix + " not found");
  return src.slice(i, src.indexOf(";\n", i) + 1);
}

const ROOT = path.join(__dirname, "..");
const workerSrc = fs.readFileSync(path.join(ROOT, "boinya-c/proxy/worker.js"), "utf8");
const gsSrc = fs.readFileSync(path.join(ROOT, "Code.gs"), "utf8");
const uiSrc = fs.readFileSync(path.join(ROOT, "boinya-c/app.main.js"), "utf8");
const htmlSrc = fs.readFileSync(path.join(ROOT, "boinya-c/app.html"), "utf8");

const BOT_TOKEN = "123456:TEST_fake_bot_token_for_hmac";
const OWNER = "650923866";

function signInitData(user, token, authDate, extra) {
  const fields = Object.assign(
    { auth_date: String(authDate), query_id: "AAHtest", user: JSON.stringify(user) },
    extra || {}
  );
  const dcs = Object.keys(fields).sort().map((k) => k + "=" + fields[k]).join("\n");
  const secret = nodeCrypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = nodeCrypto.createHmac("sha256", secret).update(dcs).digest("hex");
  const sp = new URLSearchParams(fields);
  sp.set("hash", hash);
  return sp.toString();
}
const now = Math.floor(Date.now() / 1000);

/* ---------- Worker sandbox ---------- */
const a0 = workerSrc.indexOf("/* ===================== AUTH / ROLES");
const a1 = workerSrc.indexOf("/* =================== /AUTH =================== */");
if (a0 < 0 || a1 < 0) throw new Error("AUTH block markers not found");
const authBlock = workerSrc.slice(a0, a1);

const snaps = Object.create(null);
const gasCalls = [];
const innerCalls = [];
let gasListAccess = null;
const sb = {
  console, Date, Math, JSON, Object, String, Array, Number, RegExp, Map, Promise, Error,
  URLSearchParams, TextEncoder, Uint8Array,
  crypto: nodeCrypto.webcrypto,
  snaps,
  PARTNER_CANON_OWNER_TIDS: [],
  PARTNER_CANON_OWNER_USERS: [],
  getSnapRaw_: async (env, key) => (snaps[key] ? JSON.parse(JSON.stringify(snaps[key])) : null),
  putSnap_: async (env, key, val) => { snaps[key] = JSON.parse(JSON.stringify(val)); },
  gasProxy_: async (action, p) => {
    gasCalls.push({ action, p });
    if (action === "listAccess") return gasListAccess;
    if (action === "getMyAccess") return { status: "success", role: "none", access: "none" };
    return { status: "success" };
  },
  metaCanonLabel_: () => "d1-primary",
  cutoverGetMyAccess_: async (p) => ({ status: "success", telegramId: p.telegramId }),
  handleActionInner_: async (a, p) => {
    innerCalls.push({ a, p: Object.assign({}, p) });
    if (a === "calcPrice") return { status: "success", total: 10, rawCost: 5, cost: 5 };
    return { status: "success", action: a, inner: true };
  }
};
vm.createContext(sb);
vm.runInContext(
  [
    authBlock,
    extractFn_(workerSrc, "accessStatusFromRole_"),
    extractFn_(workerSrc, "authApplyEnvConfig_"),
    "var _authEnforceFlag = true;",
    extractLine_(workerSrc, "const AUTH_COST_ACTIONS_RE"),
    extractLine_(workerSrc, "const AUTH_ACTOR_AS_TID_RE"),
    extractFn_(workerSrc, "handleAction_"),
    extractFn_(workerSrc, "authGetMyAccess_"),
    extractFn_(workerSrc, "listAccessMerged_"),
    extractFn_(workerSrc, "setAccessTabs_"),
    extractFn_(workerSrc, "unlockSubs_"),
    "this.__t = { verifyTgInitData_, authEffectiveTabs_, authCheck_, resolveActor_, handleAction_, authInvalidateRole_, AUTH_ROLE_PRESETS, authStripCost_ };"
  ].join("\n"),
  sb
);
const T = sb.__t;
const ENV = { DB: {}, TELEGRAM_BOT_TOKEN: BOT_TOKEN, OWNER_TELEGRAM_IDS: OWNER, SUBS_VIEW_PASSWORD: "s3cret" };

async function run() {
  console.log("Worker: initData HMAC");
  const owner = { id: Number(OWNER), first_name: "Арсений", username: "arseniy" };
  const good = signInitData(owner, BOT_TOKEN, now);
  let v = await T.verifyTgInitData_(good, ENV);
  ok(v.ok && String(v.user.id) === OWNER, "valid signature → verified owner tid");
  const tampered = good.replace(encodeURIComponent('"id":' + OWNER), encodeURIComponent('"id":762080386'));
  ok(tampered !== good, "tamper changed the payload");
  v = await T.verifyTgInitData_(tampered, ENV);
  ok(!v.ok, "tampered user.id → rejected (" + v.reason + ")");
  v = await T.verifyTgInitData_(signInitData(owner, "999:other_bot", now), ENV);
  ok(!v.ok, "signature by another bot token → rejected");
  v = await T.verifyTgInitData_(signInitData(owner, BOT_TOKEN, now - 8 * 86400), ENV);
  ok(!v.ok && v.reason === "expired", "auth_date older than 7d → expired");
  v = await T.verifyTgInitData_(signInitData(owner, "777:partner", now), Object.assign({}, ENV, { PARTNER_BOT_TOKEN: "777:partner" }));
  ok(v.ok, "PARTNER_BOT_TOKEN (Varka bot) also accepted");
  v = await T.verifyTgInitData_("user=%7B%22id%22%3A1%7D&auth_date=" + now, ENV);
  ok(!v.ok, "no hash → rejected");

  console.log("Worker: tabs / presets");
  ok(T.authEffectiveTabs_("owner", []).indexOf("peopleScreen") >= 0, "owner gets peopleScreen");
  ok(T.authEffectiveTabs_("all", []).indexOf("statsScreen") < 0 && T.authEffectiveTabs_("all", []).indexOf("peopleScreen") < 0, "'all' = everything except stats/retail/people");
  ok(T.authEffectiveTabs_("weird_role", []).length === 0, "unknown role → []");
  ok(T.authEffectiveTabs_("none", []).length === 0 && T.authEffectiveTabs_("pending", ["orderScreen"]).length === 0, "none/pending → []");
  const cust = T.authEffectiveTabs_("courier", ["courierScreen", "warehouseScreen"]);
  ok(cust.length === 2 && cust.indexOf("warehouseScreen") >= 0, "custom tabs override preset");

  console.log("Worker: gate (handleAction_)");
  snaps.listAccess = {
    status: "success",
    people: [
      { telegramId: OWNER, name: "Арсений", role: "owner", status: "active" },
      { telegramId: "222", name: "Курьер", role: "courier", status: "active" },
      { telegramId: "333", name: "Менеджер+", role: "manager", status: "active", customTabs: ["orderScreen", "statsScreen"] }
    ]
  };
  const courierInit = signInitData({ id: 222, first_name: "К" }, BOT_TOKEN, now);
  const mgrInit = signInitData({ id: 333, first_name: "М" }, BOT_TOKEN, now);

  let r = await T.handleAction_("getStats", { telegramId: OWNER }, ENV);
  ok(r.status === "error" && r.message === "auth_required", "getStats with spoofed telegramId, no initData → auth_required");
  r = await T.handleAction_("getStats", { initData: good }, ENV);
  ok(r.inner === true, "owner (verified) → getStats allowed");
  ok(innerCalls[innerCalls.length - 1].p.telegramId === OWNER, "getStats telegramId forced to verified tid");
  r = await T.handleAction_("getStats", { initData: courierInit, telegramId: OWNER }, ENV);
  ok(r.status === "error" && r.message === "forbidden_role", "courier → getStats forbidden");
  r = await T.handleAction_("getStats", { initData: mgrInit }, ENV);
  ok(r.inner === true, "manager with custom statsScreen tab → getStats allowed");
  r = await T.handleAction_("setAccessRole", { initData: courierInit, targetId: "222", role: "owner" }, ENV);
  ok(r.status === "error" && r.message === "owner_only", "courier → setAccessRole owner_only");
  r = await T.handleAction_("setAccessRole", { initData: good, telegramId: "222", role: "cutter" }, ENV);
  const last = innerCalls[innerCalls.length - 1];
  ok(r.inner === true && last.p.targetId === "222" && last.p.actorId === OWNER, "owner setAccessRole: target→targetId, actor=verified owner");
  r = await T.handleAction_("finishFullWeek", { initData: mgrInit }, ENV);
  ok(r.message === "owner_only", "manager → finishFullWeek owner_only");
  r = await T.handleAction_("forceWeekD1Resync", { initData: courierInit }, ENV);
  ok(r.message === "owner_only", "courier → maintenance owner_only");
  r = await T.handleAction_("saveRetailPrices", { initData: mgrInit }, ENV);
  ok(r.message === "forbidden_role", "manager → saveRetailPrices forbidden");
  r = await T.handleAction_("getCourierData", { initData: courierInit }, ENV);
  ok(r.inner === true, "courier → courier data allowed");
  r = await T.handleAction_("saveOrder", { initData: courierInit }, ENV);
  ok(r.message === "forbidden_role", "courier → saveOrder forbidden");
  r = await T.handleAction_("getStats", { initData: good, _actorTid: "x", _wk: "forged" }, ENV);
  ok(innerCalls[innerCalls.length - 1].p._wk === undefined && innerCalls[innerCalls.length - 1].p._actorTid === OWNER, "client _wk/_actorTid stripped");

  console.log("Worker: getMyAccess fail-closed");
  r = await T.handleAction_("getMyAccess", { telegramId: OWNER }, ENV);
  ok(r.role === "none" && r.authRequired === true, "no initData → role none + authRequired (no ?tid spoof)");
  r = await T.handleAction_("getMyAccess", { initData: good }, ENV);
  ok(r.role === "owner" && r.tabs.indexOf("peopleScreen") >= 0, "owner from Telegram → owner, all tabs (no lockout)");
  const stranger = signInitData({ id: 5555, first_name: "S" }, BOT_TOKEN, now);
  r = await T.handleAction_("getMyAccess", { initData: stranger }, ENV);
  ok(r.role === "none" && r.tabs.length === 0, "unknown user → none, no tabs");

  console.log("Worker: owner via OWNER_TELEGRAM_IDS even if D1 is empty");
  const saved = snaps.listAccess;
  delete snaps.listAccess;
  T.authInvalidateRole_();
  r = await T.handleAction_("listStatsStaff", { initData: good }, ENV);
  ok(r.inner === true, "owner allowed with empty D1 (config owner)");
  snaps.listAccess = saved;
  T.authInvalidateRole_();

  console.log("Worker: listAccess merges pending from sheet «Доступы»");
  gasListAccess = {
    status: "success",
    people: [
      { telegramId: "762080386", name: "Анастасия Злобина", username: "nastyzb", role: "", status: "pending", requestedAt: "2026-09-25" },
      { telegramId: "222", name: "Курьер", role: "courier", status: "active" }
    ]
  };
  r = await T.handleAction_("listAccess", { initData: good }, ENV);
  const nasty = (r.people || []).find((p) => String(p.telegramId) === "762080386");
  ok(r.status === "success" && nasty && nasty.pending === true && nasty.tabs.length === 0, "pending request (Настя-like) appears as pending, no tabs");
  ok(r.pendingCount === 1 && r.people[0].telegramId === "762080386", "pending sorted first, pendingCount=1");
  ok(snaps.listAccess.people.some((p) => String(p.telegramId) === "762080386" && p.status === "pending"), "pending written into D1 listAccess, status unchanged");
  r = await T.handleAction_("listAccess", { initData: courierInit }, ENV);
  ok(r.message === "owner_only", "courier → listAccess owner_only");
  T.authInvalidateRole_();
  r = await T.handleAction_("getMyAccess", { initData: signInitData({ id: 762080386, first_name: "Н" }, BOT_TOKEN, now) }, ENV);
  ok(r.role === "pending" && r.tabs.length === 0, "pending user → no tabs");

  console.log("Worker: setAccessTabs");
  r = await T.handleAction_("setAccessTabs", { initData: good, targetId: "222", tabs: "courierScreen,warehouseScreen" }, ENV);
  ok(r.status === "success" && r.tabs.length === 2, "owner sets custom tabs");
  T.authInvalidateRole_();
  r = await T.handleAction_("getWarehouse", { initData: courierInit }, ENV);
  ok(r.inner === true, "custom tab warehouseScreen enforced server-side (allowed)");
  r = await T.handleAction_("setAccessTabs", { initData: courierInit, targetId: "222", tabs: "statsScreen" }, ENV);
  ok(r.message === "owner_only", "courier cannot set own tabs");

  console.log("Worker: subs password server-side");
  r = await T.handleAction_("unlockSubs", { initData: mgrInit, password: "nope" }, ENV);
  ok(r.unlocked !== true && r.status === "error", "wrong password / no subs tab rejected");
  T.authInvalidateRole_();
  snaps.listAccess.people.push({ telegramId: "444", role: "all", status: "active" });
  const allInit = signInitData({ id: 444, first_name: "A" }, BOT_TOKEN, now);
  r = await T.handleAction_("unlockSubs", { initData: allInit, password: "s3cret" }, ENV);
  ok(r.unlocked === true, "right password (secret) accepted");
  r = await T.handleAction_("getStats", { initData: allInit }, ENV);
  ok(r.message === "forbidden_role", "role 'all' does NOT include stats");

  console.log("Worker: cost strip (COST_STRIP_NON_OWNER=1)");
  r = await T.handleAction_("calcPrice", { initData: mgrInit }, Object.assign({}, ENV, { COST_STRIP_NON_OWNER: "1" }));
  ok(r.rawCost === undefined && r.cost === undefined && r.total === 10, "non-owner: rawCost/cost stripped");
  r = await T.handleAction_("calcPrice", { initData: good }, Object.assign({}, ENV, { COST_STRIP_NON_OWNER: "1" }));
  ok(r.rawCost === 5, "owner keeps rawCost");

  console.log("Worker: partner-owner config + legacy escape hatch");
  await T.handleAction_("partnerGetMe", { telegramId: "1", username: "one_more_person_228" }, ENV);
  ok(innerCalls[innerCalls.length - 1].p._unverified === "1", "unverified partner call marked _unverified (username spoof no longer owner)");
  ok(sb.PARTNER_CANON_OWNER_TIDS.indexOf("827494606") >= 0 && sb.PARTNER_CANON_OWNER_USERS.indexOf("one_more_person_228") >= 0, "partner owner defaults kept (827494606 / one_more_person_228)");
  const helperInit = signInitData({ id: 827494606, first_name: "H", username: "one_more_person_228" }, BOT_TOKEN, now);
  await T.handleAction_("partnerListAdmin", { initData: helperInit, telegramId: "1" }, ENV);
  const hp = innerCalls[innerCalls.length - 1].p;
  ok(hp.telegramId === "827494606" && hp._authVerified === "1", "verified partner helper identity forwarded");
  T.authInvalidateRole_();
  r = await T.handleAction_("getStats", { telegramId: OWNER }, Object.assign({}, ENV, { AUTH_ENFORCE: "0" }));
  ok(r.inner === true, "AUTH_ENFORCE=0 → legacy (rollback hatch)");
  T.authInvalidateRole_();

  /* ---------- GAS ---------- */
  console.log("GAS: validateInitDataStrict_ / gate");
  const props = { TELEGRAM_BOT_TOKEN: BOT_TOKEN, WORKER_SHARED_SECRET: "wk-secret", OWNER_TELEGRAM_IDS: OWNER };
  const gsb = {
    console, Date, Math, JSON, Object, String, Array, Number, RegExp, decodeURIComponent,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    Utilities: {
      newBlob: (str) => ({ getBytes: () => Array.from(Buffer.from(String(str), "utf8")).map((b) => (b > 127 ? b - 256 : b)) }),
      // Apps Script: computeHmacSha256Signature(value, key)
      computeHmacSha256Signature: (value, key) => {
        const un = (x) => (Array.isArray(x) ? Buffer.from(x.map((b) => (b < 0 ? b + 256 : b))) : x);
        return Array.from(nodeCrypto.createHmac("sha256", un(key)).update(un(value)).digest()).map((b) => (b > 127 ? b - 256 : b));
      }
    },
    actorIsOwner_: (tid) => String(tid) === OWNER
  };
  vm.createContext(gsb);
  vm.runInContext(
    [
      extractFn_(gsSrc, "parseInitDataUser_"),
      extractFn_(gsSrc, "validateInitDataSoft_"),
      extractFn_(gsSrc, "gasInitDataHmacOk_"),
      "var GAS_AUTH_ = null;",
      extractLine_(gsSrc, "var GAS_OWNER_ACTIONS_RE_"),
      extractLine_(gsSrc, "var GAS_PUBLIC_RE_"),
      extractFn_(gsSrc, "gasSafeEq_"),
      extractFn_(gsSrc, "gasAuthEnforced_"),
      extractFn_(gsSrc, "validateInitDataStrict_"),
      extractFn_(gsSrc, "gasResolveAuth_"),
      extractFn_(gsSrc, "gasAuthGate_"),
      "this.__g = { validateInitDataStrict_, gasAuthGate_ };"
    ].join("\n"),
    gsb
  );
  const G = gsb.__g;
  ok(G.validateInitDataStrict_(good).ok === true, "GAS: valid initData verified");
  ok(G.validateInitDataStrict_(tampered).ok === false, "GAS: tampered rejected");
  ok(G.validateInitDataStrict_(signInitData(owner, BOT_TOKEN, now - 9 * 86400)).ok === false, "GAS: expired rejected");
  ok(G.gasAuthGate_("setAccessRole", { actorId: OWNER, targetId: "222" }) !== null, "GAS: setAccessRole with bare actorId → rejected");
  ok(G.gasAuthGate_("setAccessRole", { initData: good, targetId: "222" }) === null, "GAS: owner initData → allowed");
  ok(G.gasAuthGate_("listAccess", { initData: courierInit }) !== null, "GAS: courier initData → listAccess rejected");
  ok(G.gasAuthGate_("getStats", { _wk: "forged", _actorTid: OWNER }) !== null, "GAS: forged _wk rejected");
  ok(G.gasAuthGate_("getStats", { _wk: "wk-secret", _actorTid: OWNER }) === null, "GAS: Worker shared secret + actor → allowed");
  ok(G.gasAuthGate_("getStats", { _wk: "wk-secret" }) === null, "GAS: Worker system call (background refresh) → allowed");
  ok(G.gasAuthGate_("getMyAccess", {}) === null, "GAS: public action passes");
  props.AUTH_ENFORCE = "0";
  ok(G.gasAuthGate_("setAccessRole", { actorId: OWNER }) === null, "GAS: AUTH_ENFORCE=0 rollback");
  delete props.AUTH_ENFORCE;

  /* ---------- UI static ---------- */
  console.log("UI: fail-closed bootstrap");
  ok(/(let|var) APP_ROLE = "none"/.test(uiSrc), "APP_ROLE defaults to none");
  ok(uiSrc.indexOf('localStorage.setItem("superboyna_app_role", "all")') < 0, "never caches 'all'");
  ok(uiSrc.indexOf('SUBS_VIEW_PASSWORD = "') < 0, "no subs password in public JS");
  const readTid = extractFn_(uiSrc, "readTelegramIdFromTg");
  ok(!/\.get\(\s*["']tid["']\s*\)/.test(readTid), "?tid= override removed");
  ok(uiSrc.indexOf("retryBootstrapAccess_") >= 0, "retry on bootstrap failure");
  ok(htmlSrc.indexOf('id="phPanelBp"') > htmlSrc.indexOf('id="partnerHubScreen"'), "BP partners moved to Партнёры");
  ok(gsSrc.indexOf("Заказы (удерживать вкладку) → Доступы") >= 0, "notify text points to Заказы → Доступы");
  ok(!fs.existsSync(path.join(ROOT, "boinya-c/data/snap-listAccess.json")), "boinya-c/data snapshots removed from repo");
  ok(fs.readFileSync(path.join(ROOT, "boinya-c/seed-inline.js"), "utf8").length < 400, "seed-inline.js has no client data");

  if (failed) {
    console.error("\n" + failed + " check(s) failed");
    process.exit(1);
  }
  console.log("\nOK roles-auth");
}
run().catch((e) => {
  console.error("FAIL:", (e && e.stack) || e);
  process.exit(1);
});
