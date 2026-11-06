/**
 * auth-h4: stub/soft-miss не выдают owner без валидной подписи;
 * ROLE owner только через OWNER_TELEGRAM_IDS / authLookupRole_, не из previewGasStub_.
 * Не логируем реальные auth payloads.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const worker = fs.readFileSync(path.join(root, "worker.js"), "utf8");

function fnBlock(name, span) {
  const idx = worker.indexOf(name);
  assert.ok(idx > 0, name + " missing");
  return worker.slice(idx, idx + (span || 1800));
}

test("previewGasStub_ getMyAccess → role none (never owner)", () => {
  const block = fnBlock("function previewGasStub_", 1200);
  const gma = block.indexOf("/^getMyAccess$/i");
  assert.ok(gma > 0, "getMyAccess stub branch");
  const stub = block.slice(gma, gma + 280);
  assert.match(stub, /role:\s*"none"/);
  assert.match(stub, /access:\s*"none"/);
  assert.doesNotMatch(stub, /role:\s*"owner"/);
});

test("authGetMyAccess_: unverified enforce → authRequired, no owner elevate", () => {
  const block = fnBlock("async function authGetMyAccess_", 2200);
  assert.match(block, /actor\.enforce\s*&&\s*!actor\.verified/);
  assert.match(block, /authRequired:\s*true/);
  // softMiss only synthesizes success shell; role comes from authLookupRole_
  assert.match(block, /softMiss/);
  assert.match(block, /const r = await authLookupRole_\(tid, env\)/);
  assert.match(
    block,
    /let role = r\.role && r\.role !== "none" \? r\.role : authNormRole_\(\(res && res\.role\) \|\| "none"\)/
  );
});

test("authLookupRole_: OWNER_TELEGRAM_IDS wins before D1/GAS/stub", () => {
  const block = fnBlock("async function authLookupRole_", 2200);
  const ownerIdx = block.indexOf("authOwnerIds_(env).indexOf(tid)");
  const listIdx = block.indexOf('getSnapRaw_(env, "listAccess")');
  const gasIdx = block.indexOf('gasProxy_("getMyAccess"');
  assert.ok(ownerIdx > 0, "owner ids check");
  assert.ok(listIdx > ownerIdx, "owner before listAccess");
  assert.ok(gasIdx > listIdx, "listAccess before GAS getMyAccess");
  assert.match(block, /role = "owner"/);
});

test("resolveActor_: enforce tid only from verified signature", () => {
  const block = fnBlock("async function resolveActor_", 1600);
  assert.match(block, /verifyTgInitData_/);
  assert.match(block, /verifyTgLoginWidget_/);
  assert.match(block, /verifyDesktopSession_/);
  // legacy telegramId only when !enforce
  assert.match(block, /else if \(!enforce\)/);
  assert.match(block, /params\.actorId \|\| params\.telegramId/);
  assert.match(block, /verified:\s*verified/);
  assert.match(block, /isOwner:\s*r\.role === "owner"/);
});

test("softMiss does not invent owner from stub role", () => {
  const block = fnBlock("async function authGetMyAccess_", 2200);
  // When softMiss and role none → success + role none (stranger path), never force owner
  assert.match(block, /if \(role === "none" && !softMiss\)/);
  assert.doesNotMatch(block, /role\s*=\s*"owner"/);
  assert.doesNotMatch(block, /isOwner\s*=\s*true/);
});

test("gasProxy_ preview stub before sheets_finish_only (no getMyAccess skip)", () => {
  const idx = worker.indexOf("async function gasProxy_");
  assert.ok(idx > 0);
  const head = worker.slice(idx, idx + 1400);
  const previewIdx = head.indexOf("PREVIEW_ISOLATED");
  const skipIdx = head.indexOf("sheetsFinishOnlySkip_");
  assert.ok(previewIdx > 0 && skipIdx > previewIdx);
  assert.match(head, /previewGasStub_/);
});

test("preview getMyAccess writes authLastSafe with idEqOwnerEnv (no ACL auto-owner)", () => {
  const idx = worker.indexOf("async function authGetMyAccess_");
  assert.ok(idx > 0);
  const block = worker.slice(idx, idx + 3200);
  assert.match(block, /idEqOwnerEnv/);
  assert.match(block, /authLastSafe/);
  assert.match(block, /PREVIEW_ISOLATED/);
  // must not auto-assign owner from stub / softMiss
  assert.doesNotMatch(block, /role\s*=\s*"owner"/);
  assert.doesNotMatch(block, /OWNER_TELEGRAM_IDS.*=/);
});
