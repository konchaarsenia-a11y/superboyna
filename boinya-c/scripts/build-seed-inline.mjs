#!/usr/bin/env node
/** Собирает seed-inline.js из boinya-c/data/*.json */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const out = path.join(__dirname, "..", "seed-inline.js");

const DAY_FILE = {
  Понедельник: "clients-mon.json",
  Вторник: "clients-tue.json",
  Среда: "clients-wed.json",
  Четверг: "clients-thu.json",
  Пятница: "clients-fri.json",
  Суббота: "clients-sat.json",
  Воскресенье: "clients-sun.json",
  "Будущая неделя": "clients-future.json"
};

function loadPayload(name) {
  const f = path.join(dataDir, name);
  if (!fs.existsSync(f)) return null;
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  return j.payload || j;
}

const clients = {};
for (const [day, file] of Object.entries(DAY_FILE)) {
  const p = loadPayload(file);
  if (p && p.status === "success") clients[day] = p;
}

const counts = loadPayload("weekDayCounts.json");
const inline = {
  weekDayCounts: counts && counts.status === "success" ? counts : null,
  clients
};

const body =
  "window.__BOINYA_C_INLINE__=" +
  JSON.stringify(inline) +
  ";window.__BOINYA_FAST_INLINE__=window.__BOINYA_C_INLINE__;";
fs.writeFileSync(out, body);
console.log("wrote", out, fs.statSync(out).size, "bytes", "days", Object.keys(clients).length);
