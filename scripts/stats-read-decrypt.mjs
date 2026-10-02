/**
 * Decrypt a stats-read job log on the owner's box.
 *   node scripts/stats-read-decrypt.mjs job.log /home/box/.secrets/stats-read.key > stats.json
 * Accepts a raw Actions log: takes the lines between the markers, strips timestamps.
 */
import fs from "node:fs";
import { BEGIN, END, decryptWith } from "./stats-read-encrypted.mjs";

const [logPath, keyPath] = process.argv.slice(2);
if (!logPath || !keyPath) {
  console.error("usage: stats-read-decrypt.mjs <job.log> <private.key>");
  process.exit(2);
}
const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/)
  .map((l) => l.replace(/^\S*\d{4}-\d{2}-\d{2}T\S+Z\s/, "").trim());
const a = lines.indexOf(BEGIN);
const b = lines.indexOf(END, a + 1);
if (a < 0 || b < 0) {
  console.error("markers_not_found");
  process.exit(1);
}
const data = decryptWith(fs.readFileSync(keyPath, "utf8"), lines.slice(a + 1, b).join(""));
process.stdout.write(JSON.stringify(data, null, 2) + "\n");
