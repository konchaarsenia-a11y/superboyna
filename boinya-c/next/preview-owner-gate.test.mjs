/**
 * auth-h10: client gate vs actual owner/active/tabs14 snap shape.
 * Empty tabs:[] must not deny elevated roles; getAssembly stub ≠ gate.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const accessSrc = fs.readFileSync(path.join(root, "access.js"), "utf8");
const appSrc = fs.readFileSync(path.join(root, "app.js"), "utf8");
const workerSrc = fs.readFileSync(path.join(root, "../proxy/worker.js"), "utf8");

function loadAccess() {
  const sandbox = { window: {}, console };
  sandbox.window = sandbox;
  vm.runInNewContext(accessSrc, sandbox);
  return sandbox.BoinyaAccess;
}

/** Actual D1 access snap keys after prod→preview copy (no PII). */
const OWNER_SNAP = {
  status: "success",
  role: "owner",
  access: "active",
  tabs: [
    "orderScreen",
    "clientsScreen",
    "priceScreen",
    "deferredScreen",
    "templatesScreen",
    "subsScreen",
    "subDetailScreen",
    "cuttingScreen",
    "courierScreen",
    "warehouseScreen",
    "partnerHubScreen",
    "statsScreen",
    "retailPriceScreen",
    "peopleScreen"
  ],
  initOk: true,
  sandboxProxy: true,
  cachedAt: "2026-11-06T18:18:59.267Z"
};

function gateTitle(access) {
  const role = access.role;
  if (role === "denied") return "Доступ закрыт";
  if (role === "pending") return "Заявка отправлена";
  if (role === "none" || !access.tabs.length) return "Нет доступа";
  return "OPEN";
}

test("normalize: owner/active/tabs14 snap opens (initOk/sandboxProxy ignored)", () => {
  const ax = loadAccess();
  const a = ax.normalize(OWNER_SNAP);
  assert.equal(a.role, "owner");
  assert.equal(a.access, "active");
  assert.equal(a.status, "success");
  assert.ok(a.tabs.length >= 14);
  assert.equal(gateTitle(a), "OPEN");
});

test("normalize: owner + tabs:[] fills ROLE_TABS.owner — not «Нет доступа»", () => {
  const ax = loadAccess();
  const a = ax.normalize({
    status: "success",
    role: "owner",
    access: "active",
    tabs: [],
    initOk: true,
    sandboxProxy: true
  });
  assert.equal(a.role, "owner");
  assert.ok(a.tabs.length >= 10, "preset tabs required");
  assert.equal(gateTitle(a), "OPEN");
});

test("normalize: all + tabs:[] fills preset; none stays denied", () => {
  const ax = loadAccess();
  const all = ax.normalize({ status: "success", role: "all", access: "active", tabs: [] });
  assert.equal(gateTitle(all), "OPEN");
  const none = ax.normalize({ status: "success", role: "none", access: "none", tabs: [] });
  assert.equal(gateTitle(none), "Нет доступа");
});

test("app.js gate: elevated empty tabs path removed; getAssembly not in showFail", () => {
  assert.match(appSrc, /auth-h10/);
  assert.match(appSrc, /role === "denied"/);
  assert.match(appSrc, /role === "pending"/);
  assert.match(appSrc, /role === "none" \|\| !access\.tabs\.length/);
  // old combined check that denied owner+empty before normalize fill
  assert.doesNotMatch(
    appSrc,
    /if \(role === "none" \|\| role === "pending" \|\| role === "denied" \|\| !access\.tabs\.length\)/
  );
  const prod = fs.readFileSync(path.join(root, "production.js"), "utf8");
  assert.match(prod, /getAssembly/);
  assert.doesNotMatch(prod, /showFail|Нет доступа|nxGate/);
});

test("preview worker serves next/access.js from branch tip", () => {
  // Source regex is written as /^next\/(api|app|access)\.js$/
  assert.ok(workerSrc.includes("api|app|access"));
  assert.ok(workerSrc.includes("/ui/next/access.js"));
  assert.ok(workerSrc.includes("auth-h10"));
  assert.ok(workerSrc.includes("authBuildMarker"));
  assert.ok(workerSrc.includes("tabsLen"));
  assert.ok(workerSrc.includes('servePreviewSourceFile_("next/access.js")') || workerSrc.includes("servePreviewSourceFile_(\"next/access.js\")") || workerSrc.includes("/ui/next/access.js"));
});
