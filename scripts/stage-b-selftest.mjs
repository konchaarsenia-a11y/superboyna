import fs from "fs";
import vm from "vm";

const src = fs.readFileSync(new URL("../boinya-c/proxy/worker.js", import.meta.url), "utf8");
const start = src.indexOf("var STAGE_B_BEFORE_");
const end = src.indexOf("async function ensureStageBSchema_");
if (start < 0 || end < start) {
  console.error("stage-b slice not found");
  process.exit(1);
}
const result = vm.runInNewContext(src.slice(start, end) + "\nstageBSelfTest_();\n", {
  Math: Math,
  String: String,
  Object: Object,
  Number: Number
});
if (!result || !result.ok) {
  console.error(JSON.stringify(result));
  process.exit(1);
}
console.log("STAGE_B_SELFTEST_OK " + JSON.stringify(result));
