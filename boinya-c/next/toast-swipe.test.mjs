import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("./shell.js");
const sh = globalThis.BoinyaShell;

test("тост закрывается свайпом в сторону или вверх и не закрывается от короткого движения", () => {
  assert.equal(sh.toastDismissGesture(80, 10), "side");
  assert.equal(sh.toastDismissGesture(-64, 5), "side");
  assert.equal(sh.toastDismissGesture(4, -50), "up");
  assert.equal(sh.toastDismissGesture(10, 8), "");
  assert.equal(sh.toastDismissGesture(0, 40), "");
});
