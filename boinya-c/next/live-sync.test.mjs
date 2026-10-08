import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

test("клавиатура поднимает поле и не снимает запрет зума", () => {
  const shell = fs.readFileSync(path.join(here, "shell.js"), "utf8");
  const css = fs.readFileSync(path.join(here, "app.css"), "utf8");
  const html = fs.readFileSync(path.join(root, "next.html"), "utf8");
  assert.match(shell, /function liftField/);
  assert.match(shell, /scrollIntoView/);
  assert.match(shell, /viewportStableHeight/);
  assert.match(shell, /visualViewport/);
  assert.match(css, /--nx-kb/);
  assert.match(css, /--nx-vvh/);
  assert.match(html, /maximum-scale=1/);
  assert.match(html, /user-scalable=no/);
  assert.match(html, /gesturestart/);
  assert.doesNotMatch(html, /touchmove/);
});

test("запись сбрасывает кэш и тихо обновляет остальные вкладки", () => {
  const api = fs.readFileSync(path.join(here, "api.js"), "utf8");
  const app = fs.readFileSync(path.join(here, "app.js"), "utf8");
  const week = fs.readFileSync(path.join(here, "week.js"), "utf8");
  assert.match(api, /function isMutating/);
  assert.match(api, /bustMem\(null\)/);
  assert.match(api, /__nxAfterWrite/);
  assert.match(app, /function pokeNow/);
  assert.match(app, /noteMonth\(\{ op: "touch" \}\)/);
  assert.match(app, /refreshQuiet/);
  assert.match(week, /function rollbackChanges/);
  assert.match(week, /Не закрепилось, вернул как было/);
  ["warehouse.js", "production.js", "clients.js", "goals.js", "expenses.js", "stats.js", "partners.js", "tasks.js"].forEach(function (name) {
    const src = fs.readFileSync(path.join(here, name), "utf8");
    assert.match(src, /refreshQuiet|async function refresh/);
  });
});
