/**
 * Preview must not let getMyAccess stub overwrite an elevated D1 ACL snap
 * (prod→preview owner copy). Behavioral contract via source wiring.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const worker = fs.readFileSync(path.join(root, "worker.js"), "utf8");

test("accessPutSnapGuardStub_ exists and skips stub none over elevated role", () => {
  const idx = worker.indexOf("async function accessPutSnapGuardStub_");
  assert.ok(idx > 0);
  const block = worker.slice(idx, idx + 1200);
  assert.match(block, /previewStub|preview_gas_stub/);
  assert.match(block, /curRole !== "none"/);
  assert.match(block, /return false/);
  assert.match(block, /putSnap_/);
});

test("cutoverGetMyAccess_: snapOk without requiring status===success; no preview SWR clobber", () => {
  const idx = worker.indexOf("async function cutoverGetMyAccess_");
  assert.ok(idx > 0);
  const block = worker.slice(idx, idx + 2800);
  assert.match(block, /accessPutSnapGuardStub_/);
  assert.match(block, /snapRole !== "none"/);
  assert.match(block, /PREVIEW_ISOLATED/);
  // must not waitUntil fetchLive_ on preview
  assert.match(block, /!previewIso && ctx && typeof ctx\.waitUntil/);
  // old strict status===\"success\" alone must not be the only snapOk gate
  const snapOkBlock = block.slice(block.indexOf("const snapOk"), block.indexOf("async function fetchLive_"));
  assert.doesNotMatch(snapOkBlock, /snap\.status === "success" &&\s*snap\.role/);
});

test("authLookupRole_ cold GAS uses stub guard for access put", () => {
  const idx = worker.indexOf("async function authLookupRole_");
  const block = worker.slice(idx, idx + 2800);
  assert.match(block, /accessPutSnapGuardStub_/);
  assert.doesNotMatch(
    block.slice(block.indexOf('gasProxy_("getMyAccess"'), block.indexOf('gasProxy_("getMyAccess"') + 600),
    /await putSnap_\(env, "access:" \+ tid, Object\.assign\(\{\}, live/
  );
});

test("previewGasStub_ getMyAccess still returns role none (no fake owner)", () => {
  const idx = worker.indexOf("function previewGasStub_");
  const block = worker.slice(idx, idx + 900);
  const g = block.indexOf("/^getMyAccess$/i");
  const stub = block.slice(g, g + 280);
  assert.match(stub, /role:\s*"none"/);
  assert.doesNotMatch(stub, /role:\s*"owner"/);
});

/** Pure decision mirror of accessPutSnapGuardStub_ + snapOk (no auth mocks). */
function normRole(r) {
  return String(r || "none").toLowerCase();
}
function shouldSkipStubPut(curRole, live) {
  const liveRole = normRole(live && live.role);
  const isStub = !!(live && (live.previewStub || live.message === "preview_gas_stub"));
  if (isStub && (liveRole === "none" || liveRole === "pending" || liveRole === "denied")) {
    const c = normRole(curRole);
    if (c !== "none" && c !== "pending" && c !== "denied") return true;
  }
  return false;
}
function snapOkElevated(snap, tid) {
  const snapRole = normRole(snap && snap.role);
  return (
    !!snap &&
    snapRole !== "none" &&
    snapRole !== "pending" &&
    snapRole !== "denied" &&
    (!tid || !snap.telegramId || String(snap.telegramId) === tid)
  );
}

test("behavioral: stub none must not overwrite owner ACL; elevated snapOk without status", () => {
  const ownerSnap = { role: "owner", access: "active", telegramId: "111", tabs: new Array(14) };
  const stubLive = {
    status: "success",
    role: "none",
    access: "none",
    tabs: [],
    previewStub: true,
    message: "preview_gas_stub",
    telegramId: "111"
  };
  assert.equal(shouldSkipStubPut(ownerSnap.role, stubLive), true);
  assert.equal(shouldSkipStubPut("none", stubLive), false);
  // prod copy may omit status:"success"
  assert.equal(snapOkElevated({ role: "owner", telegramId: "111" }, "111"), true);
  assert.equal(snapOkElevated({ status: "success", role: "none", telegramId: "111" }, "111"), false);
  assert.equal(snapOkElevated(ownerSnap, "111"), true);
});
