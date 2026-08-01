#!/usr/bin/env node
/**
 * Тянет горячие read-action с Apps Script → fast/data/*.json
 * Запуск: node fast/scripts/refresh-cache.mjs
 * (и из GitHub Actions каждые 10 мин)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        ...obj
      },
      null,
      0
    )
  );
  console.log("wrote", file, fs.statSync(file).size, "bytes");
}

async function main() {
  const meta = { ok: true, origin: ORIGIN.slice(-20), items: [] };

  try {
    const counts = await getAction("getWeekDayCounts");
    writeJson("weekDayCounts.json", { payload: counts });
    meta.items.push("weekDayCounts");
  } catch (e) {
    console.error("weekDayCounts failed", e);
    meta.ok = false;
  }

  try {
    const boot = await getAction("getBootstrap", { day: "Понедельник" });
    if (boot && boot.status === "success") {
      writeJson("bootstrap.json", { payload: boot });
      meta.items.push("bootstrap");
    } else {
      console.log("getBootstrap skipped:", boot && boot.status);
    }
  } catch (e) {
    console.error("getBootstrap failed (maybe old Deploy)", e.message || e);
  }

  for (const day of DAYS) {
    try {
      const clients = await getAction("getClients", { day });
      const slug = day
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-zа-яё0-9\-]/gi, "");
      // ascii filenames
      const map = {
        понедельник: "mon",
        вторник: "tue",
        среда: "wed",
        четверг: "thu",
        пятница: "fri",
        суббота: "sat",
        воскресенье: "sun",
        "будущая-неделя": "future"
      };
      const key = map[slug] || slug;
      writeJson(`clients-${key}.json`, { day, payload: clients });
      meta.items.push("clients-" + key);
    } catch (e) {
      console.error("getClients", day, e.message || e);
      meta.ok = false;
    }
  }

  writeJson("meta.json", meta);
  console.log("done", meta);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
