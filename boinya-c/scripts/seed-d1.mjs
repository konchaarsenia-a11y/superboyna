#!/usr/bin/env node
/**
 * Заливает boinya-c/data → D1 (orders + snap_cache).
 * Нужны: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "390357cec5b74985576a04dbc68d5694";
const DB_ID = process.env.D1_DATABASE_ID || "8ab3668c-a654-432c-9ebd-a1ac5c4db800";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
if (!TOKEN) {
  console.error("Need CLOUDFLARE_API_TOKEN");
  process.exit(1);
}

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

function loadJson(name) {
  const f = path.join(dataDir, name);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

function sqlEscape(s) {
  return String(s ?? "").replace(/'/g, "''");
}

function normalizeMatchKey(raw) {
  var s = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  var at = s.match(/@([A-Za-z0-9._]{2,})/);
  var handle = "";
  if (at) handle = at[1];
  else if (/^[A-Za-z0-9._]{3,}$/.test(s) && /[A-Za-z]/.test(s)) handle = s;
  if (handle) return handle.toUpperCase().replace(/[._]/g, "");
  return s.toUpperCase().replace(/Ё/g, "Е");
}

async function d1(sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB_ID}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ sql })
  });
  const j = await res.json();
  if (!j.success) {
    console.error("D1 error", JSON.stringify(j.errors || j, null, 2));
    throw new Error("d1_failed");
  }
  return j;
}

function dmyToIso(dmy) {
  const m = String(dmy || "")
    .trim()
    .match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return "";
  return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
}

async function main() {
  console.log("migrate columns…");
  for (const col of [
    "phone TEXT DEFAULT ''",
    "source TEXT DEFAULT ''",
    "meta_json TEXT DEFAULT '{}'"
  ]) {
    try {
      await d1(`ALTER TABLE orders ADD COLUMN ${col}`);
    } catch (e) {
      /* already / duplicate */
    }
  }
  await d1(`CREATE TABLE IF NOT EXISTS snap_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await d1(`CREATE TABLE IF NOT EXISTS deliveries (
    date_iso TEXT NOT NULL,
    match_key TEXT NOT NULL,
    delivered INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (date_iso, match_key)
  )`);
  await d1(`CREATE TABLE IF NOT EXISTS cutting_flags (
    date_iso TEXT NOT NULL,
    row_key TEXT NOT NULL,
    surplus REAL DEFAULT 0,
    done INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (date_iso, row_key)
  )`);

  const now = new Date().toISOString();
  console.log("clear old sandbox orders…");
  await d1("DELETE FROM orders");
  await d1("DELETE FROM snap_cache");
  try {
    await d1("DELETE FROM deliveries");
  } catch (e) {}

  const counts = loadJson("weekDayCounts.json");
  const dateByDay = {};
  ((counts && counts.payload && counts.payload.items) || []).forEach((it) => {
    dateByDay[it.day] = { date: it.date || "", iso: dmyToIso(it.date) };
  });

  let orderN = 0;
  for (const [day, key] of Object.entries(DAY_KEY)) {
    const cl = loadJson(`clients-${key}.json`);
    const clients = (cl && cl.payload && cl.payload.clients) || [];
    const meta = dateByDay[day] || { date: "", iso: "" };
    for (const c of clients) {
      const mk = normalizeMatchKey(c.matchKey || c.name || "");
      if (!mk) continue;
      const id = day + ":" + mk;
      const basket = JSON.stringify(c.basket || []);
      const metaObj = {
        orderPrice: c.orderPrice,
        ppSlot: c.ppSlot,
        ppHint: c.ppHint,
        ppPartner: c.ppPartner,
        deliveryAfter: c.deliveryAfter,
        deliveryBefore: c.deliveryBefore,
        dogCount: c.dogCount,
        geo: c.geo,
        noCut: !!c.noCut,
        couponsQty: c.couponsQty,
        couponPrice: c.couponPrice,
        orderCount: c.orderCount
      };
      const sql = `INSERT INTO orders (id, date_iso, day_name, client, match_key, address, note, phone, basket_json, segment, source, status, updated_at, meta_json)
        VALUES ('${sqlEscape(id)}', '${sqlEscape(meta.iso)}', '${sqlEscape(day)}', '${sqlEscape(c.name)}', '${sqlEscape(mk)}',
        '${sqlEscape(c.address)}', '${sqlEscape(c.note)}', '${sqlEscape(c.phone)}', '${sqlEscape(basket)}',
        '${sqlEscape(c.segment)}', '${sqlEscape(c.source)}', 'active', '${sqlEscape(c.updatedAt || now)}',
        '${sqlEscape(JSON.stringify(metaObj))}')`;
      await d1(sql);
      orderN++;
    }
    console.log("orders", day, clients.length);
  }

  async function putSnap(key, obj) {
    if (!obj) return;
    const payload = JSON.stringify(obj);
    await d1(
      `INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES ('${sqlEscape(key)}', '${sqlEscape(payload)}', '${now}')
       ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at`
    );
  }

  if (counts && counts.payload) await putSnap("weekDayCounts", counts.payload);
  const banner = loadJson("weekBanner.json");
  if (banner && banner.payload) await putSnap("weekBanner", banner.payload);
  const wh = loadJson("warehouse.json");
  if (wh && wh.payload) await putSnap("warehouse", wh.payload);
  const mo = loadJson("monthOverview.json");
  if (mo && mo.payload) {
    await putSnap("monthOverview", mo.payload);
    if (mo.payload.month) await putSnap("monthOverview:" + mo.payload.month, mo.payload);
  }
  const dtd = loadJson("dateToDay.json");
  if (dtd) await putSnap("dateToDay", dtd.map ? dtd : { map: dtd });

  for (const [day, key] of Object.entries(DAY_KEY)) {
    for (const kind of ["cutting", "courier", "assembly"]) {
      const j = loadJson(`${kind}-${key}.json`);
      if (j && j.payload) await putSnap(`${kind}:${day}`, j.payload);
    }
    const v = loadJson(`view-${key}.json`);
    if (v && v.payload) await putSnap(`view:${day}`, v.payload);
  }

  for (const a of [
    "listDeferred",
    "listSurvey",
    "listSubscriptions",
    "listPartners",
    "listAccess",
    "listBookings",
    "listClientProfiles",
    "listTemplates",
    "listReminderPeople",
    "listBpIdle",
    "getCouriers",
    "partnerListAdmin"
  ]) {
    await putSnap(a, {
      status: "success",
      items: [],
      list: [],
      people: [],
      clients: [],
      partners: [],
      couriers: [],
      sandbox: true
    });
  }

  await putSnap("meta:seededAt", { at: now, orders: orderN });
  console.log("DONE orders=", orderN, "seededAt", now);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
