#!/usr/bin/env node
/**
 * seed-inline.js — ЛЁГКИЙ критический путь (counts + clients).
 * cutting/courier/assembly/warehouse — только data/*.json (async в bridge).
 * --full — старый жирный inline (не для продакшен-песочницы).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const out = path.join(__dirname, "..", "seed-inline.js");
const full = process.argv.includes("--full");

const DAY_FILE = {
  Понедельник: "mon",
  Вторник: "tue",
  Среда: "wed",
  Четверг: "thu",
  Пятница: "fri",
  Суббота: "sat",
  Воскресенье: "sun",
  "Будущая неделя": "future"
};

function loadPayload(name) {
  const f = path.join(dataDir, name);
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    return j.payload || j;
  } catch (e) {
    return null;
  }
}

const clients = {};
const cutting = {};
const courier = {};
const assembly = {};

for (const [day, key] of Object.entries(DAY_FILE)) {
  const c = loadPayload(`clients-${key}.json`);
  if (c && c.status === "success") clients[day] = c;
  if (full) {
    const cut = loadPayload(`cutting-${key}.json`);
    if (cut && cut.status === "success") cutting[day] = cut;
    const cour = loadPayload(`courier-${key}.json`);
    if (cour && cour.status === "success") courier[day] = cour;
    const asm = loadPayload(`assembly-${key}.json`);
    if (asm && asm.status === "success") assembly[day] = asm;
  }
}

const counts = loadPayload("weekDayCounts.json");
const weekBanner = loadPayload("weekBanner.json");
const warehouse = full ? loadPayload("warehouse.json") : null;

const monthOv = loadPayload("monthOverview.json");
const dateMapFile = (() => {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dataDir, "dateToDay.json"), "utf8"));
    return j.map || {};
  } catch (e) {
    return {};
  }
})();
const inline = {
  weekDayCounts: counts && counts.status === "success" ? counts : null,
  weekBanner: weekBanner && weekBanner.status === "success" ? weekBanner : null,
  warehouse: warehouse && warehouse.status === "success" ? warehouse : null,
  monthOverview: monthOv && monthOv.status === "success" ? { [monthOv.month || ""]: monthOv } : {},
  dateToDay: dateMapFile,
  // viewCompare не инлайним — bridge собирает из clients (меньше первый байт)
  viewCompare: {},
  clients,
  cutting: full ? cutting : {},
  courier: full ? courier : {},
  assembly: full ? assembly : {}
};

const body =
  "window.__BOINYA_C_INLINE__=" +
  JSON.stringify(inline) +
  ";window.__BOINYA_FAST_INLINE__=window.__BOINYA_C_INLINE__;";
fs.writeFileSync(out, body);
console.log(
  "wrote",
  out,
  fs.statSync(out).size,
  "bytes",
  full ? "FULL" : "LITE",
  "clients",
  Object.keys(clients).length
);
