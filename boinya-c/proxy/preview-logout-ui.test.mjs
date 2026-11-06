/**
 * Preview wrapper: visible logout on denied/login; only 4 :preview-eabc keys; host-locked.
 * Production next/app.js must not gain this button.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const worker = fs.readFileSync(path.join(root, "worker.js"), "utf8");
const appJs = fs.readFileSync(path.resolve(root, "../next/app.js"), "utf8");

test("PREVIEW_EABC_AUTH_KEYS_ is exactly four :preview-eabc keys", () => {
  const m = worker.match(/const PREVIEW_EABC_AUTH_KEYS_\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(m, "PREVIEW_EABC_AUTH_KEYS_ missing");
  const keys = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(keys, [
    "nx_tg_login_v1:preview-eabc",
    "nx_desk_sess_v1:preview-eabc",
    "nx_access_v1:preview-eabc",
    "nx_tg_init_v1:preview-eabc"
  ]);
});

test("preview logout UI: bar button + gate inject + hostname guard", () => {
  assert.match(worker, /id="previewEabcLogoutBtn"/);
  assert.match(worker, /Выйти из тестового входа/);
  assert.match(worker, /Сменить Telegram-аккаунт/);
  assert.match(worker, /data-act=['"]preview-eabc-logout['"]/);
  assert.match(worker, /__boinyaPreviewEabcLogout/);
  assert.match(worker, /location\.hostname\|\|''\)!==H/);
  // Absolute preview origin — NOT path-only /ui (base href = github.io → 404).
  assert.match(worker, /location\.replace\(dest\)/);
  assert.match(worker, /var dest='https:\/\/'\+H\+'\/ui'/);
  // live call must use dest, not a string literal path
  const boot = worker.slice(worker.indexOf("__boinyaPreviewEabcLogout"), worker.indexOf("__boinyaPreviewEabcLogout") + 900);
  assert.match(boot, /location\.replace\(dest\)/);
  assert.doesNotMatch(boot, /location\.replace\(['"]\/ui['"]\)/);
  assert.match(worker, /getElementById\('nxGate'\)/);
  assert.match(worker, /PREVIEW_EABC_AUTH_KEYS_/);
});

test("production next/app.js has no preview-eabc logout button", () => {
  assert.doesNotMatch(appJs, /previewEabcLogout|preview-eabc-logout|Выйти из тестового входа|Сменить Telegram-аккаунт/);
});

test("desk-logout in app.js stays post-auth More menu only (not access-denied)", () => {
  assert.match(appJs, /desk-logout/);
  assert.match(appJs, /function logoutDesktop/);
  // access-denied still only gate-ask — no desk-logout on that path
  const denied = appJs.match(/Нет доступа[\s\S]{0,220}/);
  assert.ok(denied);
  assert.doesNotMatch(denied[0], /desk-logout|preview-eabc-logout/);
  assert.match(denied[0], /gate-ask/);
});
