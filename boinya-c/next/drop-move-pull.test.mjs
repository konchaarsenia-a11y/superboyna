/**
 * drop-move-pull-h1 — убрать черновик переносов (#23 draft) и «Подтянуть из месяца» (#26).
 * Обычный Перенести / moveOne остаётся.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const weekSrc = fs.readFileSync(path.join(here, "week.js"), "utf8");
const appSrc = fs.readFileSync(path.join(here, "app.js"), "utf8");
const nextHtml = fs.readFileSync(path.join(here, "../next.html"), "utf8");

test("#23 draft: нет stage/draft UI", () => {
  assert.match(weekSrc, /drop-move-pull: #23/);
  assert.doesNotMatch(weekSrc, /data-act="wstage"/);
  assert.doesNotMatch(weekSrc, /data-act="wstage-all"/);
  assert.doesNotMatch(weekSrc, /data-act="wdraft-save"/);
  assert.doesNotMatch(weekSrc, /data-act="wdraft-clear"/);
  assert.doesNotMatch(weekSrc, /async function saveDrafts/);
  assert.doesNotMatch(weekSrc, /b-sum__k">Черновик/);
});

test("#23 обычный Перенести остаётся", () => {
  assert.match(weekSrc, /data-act="wmove"/);
  assert.match(weekSrc, /async function moveOne/);
  assert.match(weekSrc, /async function askMoveCut/);
  assert.match(weekSrc, /data-act="wbatch-move"/);
  assert.match(weekSrc, /moveParams/);
});

test("#26 нет materialize/pull UI", () => {
  assert.match(weekSrc, /drop-move-pull: #26/);
  assert.match(appSrc, /drop-move-pull: #26/);
  assert.doesNotMatch(appSrc, /data-act="wpull"/);
  assert.doesNotMatch(weekSrc, /action: "materializeWeek"/);
  assert.doesNotMatch(weekSrc, /async function runPull/);
  assert.doesNotMatch(weekSrc, /data-act="wpull"/);
});

test("cache bump present (VER may rise; draft/pull stay gone)", () => {
  // Allow cache bust bumps (71125455 → 71125456 → …); do not pin a stale VER.
  assert.match(nextHtml, /\bv=7112545\d\b/);
  assert.match(nextHtml, /var VER = "7112545\d"/);
  // Behavioral lock from #23/#26 must survive any bump.
  assert.doesNotMatch(weekSrc, /data-act="wstage"/);
  assert.doesNotMatch(weekSrc, /data-act="wpull"/);
  assert.doesNotMatch(appSrc, /data-act="wpull"/);
});
