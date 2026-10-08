import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const html = fs.readFileSync(path.join(root, "next.html"), "utf8");
const css = fs.readFileSync(path.join(here, "app.css"), "utf8");

test("двойной тап и щипок не зумят страницу", () => {
  assert.match(html, /maximum-scale=1/);
  assert.match(html, /user-scalable=no/);
  assert.match(html, /gesturestart/);
  assert.match(html, /gesturechange/);
  assert.match(html, /preventDefault/);
  assert.match(css, /touch-action:\s*pan-x pan-y/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /\.b-step__input[\s\S]*font-size:\s*16px/);
  assert.match(css, /input,\s*select,\s*textarea\s*\{[^}]*font-size:\s*16px/);
});
