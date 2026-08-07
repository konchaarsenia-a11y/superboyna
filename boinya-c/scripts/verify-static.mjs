#!/usr/bin/env node
/** Быстрая проверка, что песочница на месте и не лезет в прод-файлы. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const sand = path.join(root, "boinya-c");

const need = [
  "README.md",
  "index.html",
  "app.html",
  "bridge.js",
  "seed-inline.js",
  "lab.html",
  "data/seed.json",
  "data/clients-mon.json",
  "client/idb.js",
  "client/optimistic.js",
  "proxy/worker.js",
  "proxy/schema.sql",
  "docs/ISOLATION.md",
  "scripts/sync-from-prod.sh"
];
const app = fs.readFileSync(path.join(sand, "app.html"), "utf8");
if (!app.includes("C · SANDBOX") || !app.includes("__boinyaCTrySnap")) {
  console.error("app.html missing C patches");
  process.exit(1);
}
const rootApp = fs.readFileSync(path.join(root, "app.html"), "utf8");
if (rootApp.includes("BOINYA_C_EDITION") || rootApp.includes("C · SANDBOX")) {
  console.error("root app.html was polluted — abort");
  process.exit(1);
}

let ok = true;
for (const f of need) {
  const p = path.join(sand, f);
  if (!fs.existsSync(p)) {
    console.error("missing", f);
    ok = false;
  }
}

// прод-файлы не должны упоминаться как «править»
const isolation = fs.readFileSync(path.join(sand, "docs/ISOLATION.md"), "utf8");
if (!isolation.includes("не правят")) {
  console.error("ISOLATION.md incomplete");
  ok = false;
}

console.log(ok ? "boinya-c verify OK" : "boinya-c verify FAIL");
process.exit(ok ? 0 : 1);
