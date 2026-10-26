import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../boinya-c/proxy/worker.js");
const src = fs.readFileSync(workerPath, "utf8");

function grab(name) {
  const token = "function " + name + "(";
  const start = src.indexOf(token);
  if (start < 0) throw new Error("нет " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("не закрыта " + name);
}

const api = new Function(
  "cuttingAggKey_",
  "cutNameKey_",
  [
    grab("peopleForAssemblyCutting_"),
    grab("cuttingDryByAgg_"),
    grab("unionCuttingKeepAssembly_"),
    grab("cuttingSnapMissesAssembly_")
  ].join("\n") +
    "\nreturn { peopleForAssemblyCutting_, unionCuttingKeepAssembly_, cuttingSnapMissesAssembly_ };"
)(
  function (name) { return String(name || "").toUpperCase(); },
  function (name) { return String(name || "").toUpperCase(); }
);

const shaped = api.peopleForAssemblyCutting_([
  { name: "skip", skipAssemble: true, basket: [{ name: "БЫЧИЙ КОРЕНЬ", value: 2 }], note: "[НЕ РЕЗАТЬ]", cutMode: "none" },
  { name: "nocut", noCut: true, skipAssemble: false, basket: [{ name: "БЫЧИЙ КОРЕНЬ", value: 1 }], note: "текст [НЕ РЕЗАТЬ]", cutMode: "none" },
  { name: "part", topUp: true, cutMode: "partial", cutItemKeys: ["0"], basket: [{ name: "БЫЧИЙ КОРЕНЬ", value: 1 }] },
  { name: "full", basket: [{ name: "БЫЧИЙ КОРЕНЬ", value: 1 }], cutMode: "full" }
]);

assert.equal(shaped.length, 3);
assert.equal(shaped.some(function (p) { return p.name === "skip"; }), false);
const nocut = shaped.find(function (p) { return p.name === "nocut"; });
assert.equal(nocut.noCut, false);
assert.equal(nocut.cutMode, "full");
assert.equal(/НЕ\s*РЕЗАТЬ/i.test(nocut.note), false);
assert.equal(nocut.note, "текст");
const part = shaped.find(function (p) { return p.name === "part"; });
assert.equal(part.cutMode, "partial");
assert.deepEqual(part.cutItemKeys, ["0"]);

const base = [{ name: "БЫЧИЙ КОРЕНЬ МАЛ шт.", dry: 1, raw: 1, unit: "шт", sizes: [{ text: "маленькие", dry: 1 }], laid: true }];
const same = api.unionCuttingKeepAssembly_(base, [{ name: "БЫЧИЙ КОРЕНЬ МАЛ шт.", dry: 1, raw: 1, unit: "шт" }]);
assert.equal(same.length, 1);
assert.equal(same[0].dry, 1);
assert.equal(same[0].laid, true);

const raised = api.unionCuttingKeepAssembly_(base, [
  { name: "БЫЧИЙ КОРЕНЬ МАЛ шт.", dry: 2, raw: 2, unit: "шт", sizes: [{ text: "маленькие", dry: 2 }] },
  { name: "БЫЧИЙ КОРЕНЬ СРЕД шт.", dry: 1, raw: 1, unit: "шт", sizes: [{ text: "средние", dry: 1 }] }
]);
assert.equal(raised.length, 2);
assert.equal(raised[0].dry, 2);
assert.equal(raised[0].laid, true);
assert.equal(raised[0].sizes[0].dry, 2);
assert.equal(raised[1].name, "БЫЧИЙ КОРЕНЬ СРЕД шт.");
assert.equal(raised[1].laid, false);

assert.equal(api.cuttingSnapMissesAssembly_(base, [{ name: "БЫЧИЙ КОРЕНЬ МАЛ шт.", dry: 1 }]), false);
assert.equal(api.cuttingSnapMissesAssembly_(base, [{ name: "БЫЧИЙ КОРЕНЬ МАЛ шт.", dry: 2 }]), true);

assert.match(src, /unionCuttingKeepAssembly_\(items, cuttingItemsMatchingAssembly_\(/);
assert.match(src, /cuttingSnapNeedsAssemblyRebuild_/);

console.log("cut-asm-lines ok");
