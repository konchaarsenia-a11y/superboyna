#!/usr/bin/env node
/** Собирает data/view-*.json из clients + дат weekDayCounts (без GAS). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");

const DAY_KEY = {
  Понедельник: "mon",
  Вторник: "tue",
  Среда: "wed",
  Четверг: "thu",
  Пятница: "fri",
  Суббота: "sat",
  Воскресенье: "sun",
  "Будущая неделя": "future"
};

function load(name) {
  const f = path.join(dataDir, name);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

function dmyToIso(dmy) {
  const m = String(dmy || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return "";
  return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
}

const counts = load("weekDayCounts.json");
const items = (counts && counts.payload && counts.payload.items) || [];
const dateToDay = {};
let n = 0;

for (const it of items) {
  const day = it.day;
  const key = DAY_KEY[day];
  if (!key) continue;
  const cl = load(`clients-${key}.json`);
  const clients =
    cl && cl.payload && Array.isArray(cl.payload.clients) ? cl.payload.clients : [];
  const date = it.date || (cl && cl.payload && cl.payload.date) || "";
  const dateIso = dmyToIso(date);
  if (dateIso) dateToDay[dateIso] = day;
  // month = дельта календаря (как в GAS), НЕ копия week — иначе Просмотр врёт
  const prev = load(`view-${key}.json`);
  const prevMonth =
    prev && prev.payload && Array.isArray(prev.payload.month) && !prev.payload.fromSeed
      ? prev.payload.month
      : [];
  const weekKeys = new Set(
    clients.map((c) => String((c && (c.matchKey || c.name)) || "").toUpperCase().replace(/[._\s]/g, ""))
  );
  const month = prevMonth.filter((c) => {
    const k = String((c && (c.matchKey || c.name)) || "").toUpperCase().replace(/[._\s]/g, "");
    return k && !weekKeys.has(k);
  });
  const payload = {
    status: "success",
    day: day,
    targetDay: day,
    date: date,
    dateIso: dateIso,
    dateNotInWeek: false,
    futureSlot: day === "Будущая неделя",
    monthSheet: (prev && prev.payload && prev.payload.monthSheet) || "sandbox",
    calendar: true,
    week: clients,
    month: month,
    sandbox: true,
    fromSeed: true
  };
  fs.writeFileSync(
    path.join(dataDir, `view-${key}.json`),
    JSON.stringify({ fetchedAt: new Date().toISOString(), day, payload })
  );
  n++;
}

fs.writeFileSync(
  path.join(dataDir, "dateToDay.json"),
  JSON.stringify({ fetchedAt: new Date().toISOString(), map: dateToDay })
);
console.log("view snaps", n, "dateToDay", Object.keys(dateToDay).length);
