/**
 * order-compose-readable-h1 — СОСТАВ: имя целиком, qty|frac|✕, без дубля фракции.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ordersSrc = fs.readFileSync(path.join(here, "orders.js"), "utf8");
const appCss = fs.readFileSync(path.join(here, "app.css"), "utf8");
const nextHtml = fs.readFileSync(path.join(here, "../next.html"), "utf8");

const rowFn = ordersSrc.slice(
  ordersSrc.indexOf("function basketRow"),
  ordersSrc.indexOf("function basketLines")
);

test("basketRow: compose layout markers (order-compose-readable-h1)", () => {
  assert.match(rowFn, /order-compose-readable-h1/);
  assert.match(rowFn, /nx-line--compose/);
  assert.match(rowFn, /nx-compose__name/);
  assert.match(rowFn, /nx-compose__ctrl/);
  assert.match(rowFn, /nx-compose__del/);
  assert.match(rowFn, />✕<\/button>/);
  assert.doesNotMatch(rowFn, />Удалить<\/button>/);
  assert.doesNotMatch(rowFn, /b-sheet__name/);
  /* фракция не дублируется под именем — только на кнопке ifrac */
  assert.doesNotMatch(rowFn, /else if \(it\.sub\) sub =/);
  assert.match(rowFn, /data-act="ifrac"/);
  assert.match(rowFn, /data-act="idel"/);
  assert.match(rowFn, /aria-label="Удалить позицию"/);
});

test("app.css: compose + dock no-ellipsis (order-compose-readable-h1)", () => {
  assert.match(appCss, /order-compose-readable-h1/);
  assert.match(appCss, /#nxLines \.nx-line--compose/);
  assert.match(appCss, /#nxLines \.nx-compose__name/);
  assert.match(appCss, /word-break:\s*break-word/);
  assert.match(appCss, /#nxLines \.nx-compose__ctrl[\s\S]*?flex-wrap:\s*nowrap/);
  assert.match(appCss, /#nxDock\.nx-dock--order \.b-sum__k[\s\S]*?text-overflow:\s*unset/);
});

test("cache VER bumped for phone SW (order-compose-readable-h1)", () => {
  assert.match(nextHtml, /var VER = "71125477"/);
});
