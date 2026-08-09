#!/usr/bin/env node
/**
 * Полный дамп read-API GAS → boinya-c/data (для 1:1 песочницы).
 * Только чтение. Запись в Sheets не трогает.
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

const LIST_ACTIONS = [
  ["listSubscriptions", {}],
  ["listSurvey", { activeOnly: "1" }],
  ["listDeferred", {}],
  ["listPartners", {}],
  ["listAccess", {}],
  ["listClientProfiles", {}],
  ["listTemplates", {}],
  ["listTemplates", { kind: "survey" }],
  ["listReminderPeople", {}],
  ["listBpIdle", { days: "7" }],
  ["getCouriers", {}],
  ["partnerListAdmin", {}],
  ["getStats", {}],
  ["getExpectedProfit", {}],
  ["telegramStatus", {}],
  ["weekPullStatus", {}],
  ["warehousePreview", {}]
];

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
    if (v != null && v !== "") u.searchParams.set(k, String(v));
  }
  u.searchParams.set("callback", "cb");
  const t0 = Date.now();
  const res = await fetch(u.toString(), { redirect: "follow" });
  const text = await res.text();
  let json;
  try {
    json = unwrap(text);
  } catch (e) {
    throw new Error("bad_json " + String(text).slice(0, 120));
  }
  console.log(
    `${action} ${JSON.stringify(params)} ${Date.now() - t0}ms status=${json && json.status}`
  );
  return json;
}

function writeJson(name, obj) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify({ fetchedAt: new Date().toISOString(), ...obj }));
  console.log("wrote", path.basename(file), fs.statSync(file).size);
}

function snapKey(action, params) {
  if (action === "listTemplates" && params.kind) return "listTemplates:" + params.kind;
  return action;
}

async function main() {
  const meta = { ok: true, origin: ORIGIN.slice(-24), items: [], full: true };
  const snaps = {};

  async function pull(action, params, fileName) {
    try {
      const payload = await getAction(action, params);
      if (fileName) writeJson(fileName, { payload, params });
      snaps[snapKey(action, params)] = payload;
      meta.items.push(snapKey(action, params));
      return payload;
    } catch (e) {
      console.error("FAIL", action, e.message || e);
      meta.ok = false;
      return null;
    }
  }

  await pull("getWeekDayCounts", {}, "weekDayCounts.json");
  await pull("getWeekBannerState", {}, "weekBanner.json");
  await pull("getWarehouse", {}, "warehouse.json");

  const now = new Date();
  const month = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  await pull("getMonthOverview", { month }, "monthOverview.json");

  for (const day of DAYS) {
    const key = DAY_KEY[day];
    await pull("getClients", { day }, `clients-${key}.json`);
    for (const action of ["getCutting", "getCourier", "getAssembly"]) {
      const kind = action.replace(/^get/, "").toLowerCase();
      await pull(action, { day }, `${kind}-${key}.json`);
    }
    await pull("getViewCompare", { day }, `view-${key}.json`);
  }

  for (const [action, params] of LIST_ACTIONS) {
    const fname =
      "snap-" +
      snapKey(action, params)
        .replace(/:/g, "-")
        .replace(/[^a-zA-Z0-9_-]/g, "_") +
      ".json";
    await pull(action, params, fname);
  }

  // dateToDay из weekDayCounts
  try {
    const counts = JSON.parse(fs.readFileSync(path.join(OUT, "weekDayCounts.json"), "utf8"));
    const map = {};
    ((counts.payload && counts.payload.items) || []).forEach((it) => {
      const m = String(it.date || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (!m || !it.day) return;
      const iso = m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
      map[iso] = it.day;
    });
    writeJson("dateToDay.json", { map });
    snaps.dateToDay = { map };
  } catch (e) {
    console.error("dateToDay", e.message || e);
  }

  writeJson("snaps-index.json", { snaps: Object.keys(snaps), full: true });
  writeJson("meta.json", meta);

  // НЕ пересобираем view-*.json из clients: это затирает GAS month (календарные сироты).
  // dateToDay уже записан выше; seed-inline — лёгкий кэш для sandbox.
  spawnSync(process.execPath, [path.join(__dirname, "build-seed-inline.mjs")], { stdio: "inherit" });
  console.log("FULL refresh done", meta.items.length, "ok=", meta.ok);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
