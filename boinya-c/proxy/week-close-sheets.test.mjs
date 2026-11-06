import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWeekCloseSheetsParams_,
  summarizeWeekCloseSheets_
} from "./week-close-sheets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const worker = fs.readFileSync(path.join(root, "worker.js"), "utf8");

test("buildWeekCloseSheetsParams_ marks fromD1Close write-only payload", () => {
  const p = buildWeekCloseSheetsParams_(
    {
      prevMondayIso: "2026-11-02",
      prevMondayDate: "02.11.2026",
      mondayDate: "09.11.2026",
      materializeAdded: 1,
      backup: "weekCloseBackup:x"
    },
    { telegramId: "650923866", initData: "user=%7B%7D&hash=abc", confirm: "1" }
  );
  assert.equal(p.confirm, "1");
  assert.equal(p.fromD1Close, "1");
  assert.equal(p.skipWarehouseClose, "1");
  assert.equal(p.prevMondayIso, "2026-11-02");
  assert.equal(p.mondayDate, "09.11.2026");
  assert.equal(p.telegramId, "650923866");
  assert.equal(p.d1Report.prevMondayIso, "2026-11-02");
  assert.equal(p.d1Report.message, "week_closed");
});

test("summarizeWeekCloseSheets_ accepts stub marker and real write", () => {
  const stub = summarizeWeekCloseSheets_({
    status: "success",
    previewStub: true,
    fromD1Close: true,
    message: "preview_gas_stub"
  });
  assert.equal(stub.ok, true);
  assert.equal(stub.stub, true);
  assert.equal(stub.sheetsWritten, false);

  const real = summarizeWeekCloseSheets_({
    status: "success",
    message: "week_closed",
    sheetsWritten: true,
    fromD1Close: true
  });
  assert.equal(real.ok, true);
  assert.equal(real.sheetsWritten, true);

  const fail = summarizeWeekCloseSheets_({ status: "error", message: "sheets_write_failed" });
  assert.equal(fail.ok, false);
  assert.equal(fail.sheetsWritten, false);
});

test("worker wires D1 close then Sheets fromD1Close (production path)", () => {
  assert.match(worker, /from "\.\/week-close-sheets\.js"/);
  assert.match(worker, /buildWeekCloseSheetsParams_/);
  assert.match(worker, /summarizeWeekCloseSheets_/);
  assert.match(worker, /weekCloseCanon:\s*"d1-sheets"/);
  assert.match(worker, /fromD1Close/);
  const idx = worker.indexOf('if (a === "finishFullWeek" && isWeekCloseD1Native_(env))');
  assert.ok(idx > 0);
  const block = worker.slice(idx, idx + 2200);
  assert.match(block, /closeWeekInD1_/);
  assert.match(block, /gasProxy_/);
  assert.match(block, /buildWeekCloseSheetsParams_/);
  assert.match(block, /summarizeWeekCloseSheets_/);
  // Production candidate: Sheets push must not require preview isolation.
  assert.doesNotMatch(block, /PREVIEW_ISOLATED/);
  assert.doesNotMatch(worker, /servePreviewUi_/);
  assert.doesNotMatch(worker, /previewGasStub_/);
});

test("#23 move SQL is in-place UPDATE of source id (not INSERT)", () => {
  const idx = worker.indexOf("orders-pack2 #23");
  assert.ok(idx > 0);
  const block = worker.slice(idx, idx + 3500);
  assert.match(
    block,
    /UPDATE orders SET id = \?, date_iso = \?, day_name = \?, note = \?, meta_json = \?, status = 'active', updated_at = \? WHERE id = \?/
  );
  assert.match(block, /\.bind\(\s*moveNewId,[\s\S]*?row\.id\s*\)/);
  assert.doesNotMatch(block, /INSERT INTO orders/i);
});
