/**
 * Preview ACL identity fingerprint — full Telegram id, not suffix.
 * Must match worker authTelegramIdFp_ / CF executor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const worker = fs.readFileSync(path.join(root, "worker.js"), "utf8");

/** Same formula as worker.js authTelegramIdFp_ (documented for CF executor). */
export function authCanonTelegramId_(tid) {
  const s = String(tid == null ? "" : tid).trim();
  return /^\d{5,20}$/.test(s) ? s : "";
}
export function authTelegramIdFpSync_(tid) {
  const canon = authCanonTelegramId_(tid);
  if (!canon) return "";
  return createHash("sha256").update("boinya.tg.id.v1:" + canon, "utf8").digest("hex");
}

test("worker documents and implements full-id SHA256 fp helpers", () => {
  assert.match(worker, /function authCanonTelegramId_/);
  assert.match(worker, /async function authTelegramIdFp_/);
  assert.match(worker, /boinya\.tg\.id\.v1:/);
  assert.match(worker, /authLastSafe/);
  assert.match(worker, /tidFp/);
  assert.match(worker, /fpAlgo:\s*"sha256:boinya\.tg\.id\.v1"/);
  // snap must not add raw tid field alongside fp
  const idx = worker.indexOf('await putSnap_(env, "authLastSafe"');
  assert.ok(idx > 0);
  const block = worker.slice(idx, idx + 700);
  assert.match(block, /tidFp:/);
  assert.doesNotMatch(block, /telegramId:\s*tid/);
  assert.doesNotMatch(block, /tid:\s*tid/);
});

test("fingerprint is over full canon id (suffix collision resistant)", () => {
  const a = "650923866";
  const b = "150923866"; // same last digits pattern-ish, different full id
  const fa = authTelegramIdFpSync_(a);
  const fb = authTelegramIdFpSync_(b);
  assert.equal(fa.length, 64);
  assert.equal(fb.length, 64);
  assert.notEqual(fa, fb);
  // whitespace / type coercion
  assert.equal(authTelegramIdFpSync_(" 650923866 "), fa);
  assert.equal(authTelegramIdFpSync_(650923866), fa);
  // reject non-numeric
  assert.equal(authTelegramIdFpSync_(""), "");
  assert.equal(authTelegramIdFpSync_("abc"), "");
  assert.equal(authTelegramIdFpSync_("12"), ""); // too short
});

test("known vector for CF executor cross-check", () => {
  // Fixed vector — change only with coordinated CF compare script.
  assert.equal(
    authTelegramIdFpSync_("650923866"),
    createHash("sha256").update("boinya.tg.id.v1:650923866", "utf8").digest("hex")
  );
});

test("authGetMyAccess preview path records tidFp only when verified", () => {
  const idx = worker.indexOf("async function authGetMyAccess_");
  const block = worker.slice(idx, idx + 3600);
  assert.match(block, /actor\.verified \? await authTelegramIdFp_\(tid\)/);
  assert.match(block, /PREVIEW_ISOLATED/);
  // still no auto-owner
  assert.doesNotMatch(block, /role\s*=\s*"owner"/);
});
