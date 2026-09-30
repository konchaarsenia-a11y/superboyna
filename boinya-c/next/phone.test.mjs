import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

function extractFn(src, name) {
  const re = new RegExp("function " + name + "\\s*\\(");
  const i = src.search(re);
  if (i < 0) throw new Error("missing " + name);
  let depth = 0;
  let started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") { depth++; started = true; }
    else if (src[j] === "}") {
      depth--;
      if (started && depth === 0) return src.slice(i, j + 1);
    }
  }
  throw new Error("unclosed " + name);
}

const src = readFileSync(new URL("./production.js", import.meta.url), "utf8");
const ctx = createContext({});
runInContext(extractFn(src, "telHref"), ctx);

test("Belarus numbers become +375", () => {
  assert.equal(ctx.telHref("80291234567"), "tel:+375291234567");
  assert.equal(ctx.telHref("80 29 123-45-67"), "tel:+375291234567");
  assert.equal(ctx.telHref("291234567"), "tel:+375291234567");
  assert.equal(ctx.telHref("+375291234567"), "tel:+375291234567");
  assert.equal(ctx.telHref("375291234567"), "tel:+375291234567");
  assert.equal(ctx.telHref("+375 29 123-45-67"), "tel:+375291234567");
  assert.equal(ctx.telHref(""), "");
  assert.equal(ctx.telHref("12345"), "tel:+12345");
});
