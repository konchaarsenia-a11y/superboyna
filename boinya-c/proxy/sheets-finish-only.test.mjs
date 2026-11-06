import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isSheetsFinishOnly_,
  sheetsFinishOnlySkip_,
  sheetsGasAllowed_,
  sheetsModeLabel_
} from "./sheets-finish-only.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const worker = fs.readFileSync(path.join(root, "worker.js"), "utf8");

test("default env is finish-only", () => {
  assert.equal(isSheetsFinishOnly_({}), true);
  assert.equal(isSheetsFinishOnly_(null), true);
  assert.equal(sheetsModeLabel_({}), "finish-only");
});

test("rollback flags restore legacy mirror", () => {
  assert.equal(isSheetsFinishOnly_({ SHEETS_MODE: "mirror" }), false);
  assert.equal(isSheetsFinishOnly_({ SHEETS_MODE: "on" }), false);
  assert.equal(isSheetsFinishOnly_({ SHEETS_FINISH_ONLY: "0" }), false);
  assert.equal(sheetsModeLabel_({ SHEETS_MODE: "write" }), "legacy-mirror");
});

test("only finishFullWeek* may talk to Sheets", () => {
  assert.equal(sheetsGasAllowed_("finishFullWeek"), true);
  assert.equal(sheetsGasAllowed_("finishFullWeekProduction"), true);
  assert.equal(sheetsGasAllowed_("getClients"), false);
  assert.equal(sheetsGasAllowed_("getStats"), false);
  assert.equal(sheetsGasAllowed_("getMyAccess"), false);
  assert.equal(sheetsGasAllowed_("saveOrder"), false);
  assert.equal(sheetsGasAllowed_("moveClient"), false);
  assert.equal(sheetsGasAllowed_("materializeWeek"), false);
  assert.equal(sheetsGasAllowed_("pullClientsFromMonth"), false);
  assert.equal(sheetsGasAllowed_("getFinishWeekStatus"), false);
  assert.equal(sheetsGasAllowed_("repairWeekMonday"), false);
  assert.equal(sheetsGasAllowed_("partnerListAdmin"), false);
  assert.equal(sheetsGasAllowed_("gbMe"), false);
});

test("skip payload marks finish-only", () => {
  const skip = sheetsFinishOnlySkip_("getClients");
  assert.equal(skip.status, "skipped");
  assert.equal(skip.message, "sheets_finish_only");
  assert.equal(skip.sheetsFinishOnly, true);
  assert.equal(skip.action, "getClients");
});

test("worker wires finish-only gate in gasProxy_", () => {
  assert.match(worker, /from "\.\/sheets-finish-only\.js"/);
  assert.match(worker, /isSheetsFinishOnly_/);
  assert.match(worker, /sheetsGasAllowed_/);
  assert.match(worker, /sheetsFinishOnlySkip_/);
  assert.match(worker, /sheetsModeLabel_/);
  const idx = worker.indexOf("async function gasProxy_");
  assert.ok(idx > 0, "gasProxy_ missing");
  const head = worker.slice(idx, idx + 1200);
  assert.match(head, /isSheetsFinishOnly_\(env\)/);
  assert.match(head, /sheetsGasAllowed_\(action\)/);
  assert.match(head, /sheetsFinishOnlySkip_\(action\)/);
  assert.match(worker, /sheetsMode:\s*sheetsModeLabel_\(env\)/);
  // Preview stub must run before sheets_finish_only skip — иначе getMyAccess → «Нет связи».
  const previewIdx = head.indexOf('PREVIEW_ISOLATED');
  const skipIdx = head.indexOf("sheetsFinishOnlySkip_");
  assert.ok(previewIdx > 0 && skipIdx > previewIdx, "PREVIEW_ISOLATED stub before finish-only skip");
});

test("authGetMyAccess soft-miss skipped (not transport fail)", () => {
  const idx = worker.indexOf("async function authGetMyAccess_");
  assert.ok(idx > 0);
  const block = worker.slice(idx, idx + 2200);
  assert.match(block, /softMiss/);
  assert.match(block, /sheets_finish_only/);
  assert.match(block, /previewStub|preview_gas_stub/);
});
