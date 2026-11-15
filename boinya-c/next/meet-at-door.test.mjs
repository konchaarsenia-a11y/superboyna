import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "orders.js"),
  "utf8"
);

test("Встретит у подъезда: segBtn meet* обрабатывается в onSeg", () => {
  assert.match(src, /segBtn\("meet0"/);
  assert.match(src, /segBtn\("meet1"/);
  /* data-act=seg → onSeg(data-seg); без meet0/meet1 в onSeg клик молчит */
  assert.match(src, /t561s2624-meet/);
  assert.match(src, /if \(id === "meet0"\)/);
  assert.match(src, /if \(id === "meet1"\)/);
  const onSegIdx = src.indexOf("function onSeg(id)");
  const meetInOnSeg = src.indexOf('id === "meet1"', onSegIdx);
  assert.ok(meetInOnSeg > onSegIdx, "meet1 must be inside onSeg");
});
