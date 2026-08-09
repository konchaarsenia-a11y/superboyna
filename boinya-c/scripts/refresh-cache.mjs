#!/usr/bin/env node
/**
 * Тянет горячие read-action → boinya-c/data/*.json + seed-inline.js
 * Только чтение GAS. Запись не трогает.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "data");
const ORIGIN =
  process.env.GAS_ORIGIN ||
  "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec";

const DAYS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
  "Будущая неделя"
];

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

function unwrap(text) {
  const s = String(text || "").trim();
  const m = s.match(/^[a-zA-Z_$][\w$]*\s*\(\s*([\s\S]*)\s*\)\s*;?\s*$/);
  const body = m ? m[1] : s;
  return JSON.parse(body);
}

async function getAction(action, params = {}) {
  const u = new URL(ORIGIN);
  u.searchParams.set("action", action);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") u.searchParams.set(k, v);
  }
  u.searchParams.set("callback", "cb");
  const t0 = Date.now();
  const res = await fetch(u.toString(), { redirect: "follow" });
  const text = await res.text();
  const json = unwrap(text);
  console.log(`${action} ${JSON.stringify(params)} ${Date.now() - t0}ms status=${json.status}`);
  return json;
}

function writeJson(name, obj) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify({ fetchedAt: new Date().toISOString(), ...obj }));
  console.log("wrote", file, fs.statSync(file).size, "bytes");
}

async function main() {
  const meta = { ok: true, origin: ORIGIN.slice(-20), items: [] };

  try {
    const counts = await getAction("getWeekDayCounts");
    writeJson("weekDayCounts.json", { payload: counts });
    meta.items.push("weekDayCounts");
  } catch (e) {
    console.error("weekDayCounts", e.message || e);
    meta.ok = false;
  }

  try {
    const banner = await getAction("getWeekBannerState");
    writeJson("weekBanner.json", { payload: banner });
    meta.items.push("weekBanner");
  } catch (e) {
    console.error("weekBanner", e.message || e);
  }

  try {
    const wh = await getAction("getWarehouse");
    writeJson("warehouse.json", { payload: wh });
    meta.items.push("warehouse");
  } catch (e) {
    console.error("warehouse", e.message || e);
  }

  try {
    const now = new Date();
    const month = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    const mo = await getAction("getMonthOverview", { month });
    writeJson("monthOverview.json", { payload: mo });
    meta.items.push("monthOverview");
  } catch (e) {
    console.error("monthOverview", e.message || e);
  }

  for (const day of DAYS) {
    const key = DAY_KEY[day] || "x";
    try {
      const clients = await getAction("getClients", { day });
      writeJson(`clients-${key}.json`, { day, payload: clients });
      meta.items.push("clients-" + key);
    } catch (e) {
      console.error("getClients", day, e.message || e);
      meta.ok = false;
    }
    for (const action of ["getCutting", "getCourier", "getAssembly"]) {
      try {
        const payload = await getAction(action, { day });
        const kind = action.replace(/^get/, "").toLowerCase();
        writeJson(`${kind}-${key}.json`, { day, payload });
        meta.items.push(`${kind}-${key}`);
      } catch (e) {
        console.error(action, day, e.message || e);
      }
    }
  }

  writeJson("meta.json", meta);
  const build = path.join(__dirname, "build-seed-inline.mjs");
  spawnSync(process.execPath, [path.join(__dirname, "build-view-snaps.mjs")], { stdio: "inherit" });
  spawnSync(process.execPath, [build], { stdio: "inherit" });
  console.log("done", meta);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
