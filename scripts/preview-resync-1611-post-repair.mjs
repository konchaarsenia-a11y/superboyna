#!/usr/bin/env node
/**
 * no-plus7-stamp-h1: после починки прода — свежая копия 16.11 на preview D1
 * (ровно 4 заказа из prod SELECT) + сброс cutting snap → getCutting с #748.
 * Пишет ТОЛЬКО в boinya-c-preview-eabc. Прод не трогает.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DB = "boinya-c-preview-eabc";
const DAY = "Будущая неделя";
const DATE = "2026-11-16";
const DATE_DMY = "16.11.2026";
const PREV = process.env.PREVIEW_URL || "https://boinya-c-preview-eabc.konchaarsenia.workers.dev";
const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts";
const now = new Date().toISOString();

fs.mkdirSync(OUT, { recursive: true });

function d1(sql) {
  const r = spawnSync(
    "npx",
    ["wrangler@4", "d1", "execute", DB, "--remote", "--json", "--command", sql],
    { cwd: path.resolve("boinya-c/proxy"), encoding: "utf8", env: process.env }
  );
  if (r.status !== 0) return { error: (r.stderr || r.stdout || "").slice(0, 1200) };
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { error: "bad_json", raw: (r.stdout || "").slice(0, 400) };
  }
}

function sqlStr(s) {
  return "'" + String(s == null ? "" : s).replace(/'/g, "''") + "'";
}

/** Real post-repair prod baskets (SELECT 16.11 after stamp restore). */
const ORDERS = [
  {
    id: "Будущая неделя:ALINAGIDAYATHANOVA",
    client: "Alinagidayathanova",
    match_key: "ALINAGIDAYATHANOVA",
    segment: "ПП",
    source: "pp",
    basket: [
      { name: "СЕРДЦЕ", val: 1, value: 1, cat: "dressura", sub: "Ломтики" },
      { name: "РУБЕЦ Т", val: 50, value: 50, cat: "dressura", sub: "Крупное" },
      { name: "ЛЁГКОЕ", val: 200, value: 200, cat: "dressura", sub: "Среднее" }
    ]
  },
  {
    id: "CAL:QWERTMOR:2026-11-16",
    client: "Qwert_mor",
    match_key: "QWERTMOR",
    segment: "ПП",
    source: "pp",
    basket: [
      { name: "ТРАХЕЯ", val: 2, value: 2, cat: "chew", sub: "СРЕД" },
      { name: "ЛОП ХРЯЩ ШТ.", val: 1, value: 1, cat: "chew", sub: "" },
      { name: "УХО Г", val: 2, value: 2, cat: "chew", sub: "Обычное" },
      { name: "ЛЁГКОЕ", val: 100, value: 100, cat: "dressura", sub: "Среднее" },
      { name: "СЕРДЦЕ", val: 20, value: 20, cat: "dressura", sub: "Целое" },
      { name: "РУБЕЦ Т", val: 20, value: 20, cat: "dressura", sub: "Среднее" },
      { name: "БАТАТ", val: 20, value: 20, cat: "veg", sub: "" },
      { name: "крошка", val: 200, value: 200, cat: "crumb", sub: "" }
    ]
  },
  {
    id: "Будущая неделя:ANUTA22",
    client: "anuta_22",
    match_key: "ANUTA22",
    segment: "Р",
    source: "retail",
    basket: [
      { name: "ЛЁГКОЕ", val: 100, value: 100, cat: "dressura", sub: "Мелкое" },
      { name: "БЫЧИЙ КОРЕНЬ", val: 2, value: 2, cat: "chew", sub: "СРЕД" }
    ]
  },
  {
    id: "Будущая неделя:ВАРКА ШЕВЧЕНКО 1",
    client: "Варка",
    match_key: "ВАРКА ШЕВЧЕНКО 1",
    segment: "ПАРТНЁР",
    source: "partner",
    basket: [
      { name: "ЛЁГКОЕ", val: 100, value: 100, cat: "dressura", sub: "Среднее" },
      { name: "СЕРДЦЕ", val: 100, value: 100, cat: "dressura", sub: "Ломтики" }
    ],
    meta: { partnerOrderId: "po_mwbtybgtheuh" }
  }
];

const STALE_IDS = [
  "PREV:POLOTNO:2026-11-16",
  "PREV:NATNAILS:2026-11-16",
  "PREV:LEROOO:2026-11-16",
  "Будущая неделя:LEROOO",
  "Будущая неделя:NATNAILSMINSK",
  "Будущая неделя:POLOTNOAN"
];

const report = { at: now, db: DB, marker: "no-plus7-stamp-h1", steps: [] };

function step(name, res) {
  report.steps.push({ name, ok: !res || !res.error, res: res && res.error ? res : { ok: true } });
}

for (const id of STALE_IDS) {
  step(
    "deactivate:" + id,
    d1(
      "UPDATE orders SET status='inactive', updated_at=" +
        sqlStr(now) +
        " WHERE id=" +
        sqlStr(id)
    )
  );
}

for (const o of ORDERS) {
  const bj = JSON.stringify(o.basket);
  const mj = JSON.stringify(o.meta || {});
  const sql =
    "INSERT INTO orders (id, client, match_key, day_name, date_iso, status, segment, source, basket_json, address, note, phone, meta_json, updated_at) VALUES (" +
    [
      sqlStr(o.id),
      sqlStr(o.client),
      sqlStr(o.match_key),
      sqlStr(DAY),
      sqlStr(DATE),
      sqlStr("active"),
      sqlStr(o.segment),
      sqlStr(o.source),
      sqlStr(bj),
      sqlStr("Минск"),
      sqlStr(""),
      sqlStr(""),
      sqlStr(mj),
      sqlStr(now)
    ].join(",") +
    ") ON CONFLICT(id) DO UPDATE SET client=excluded.client, match_key=excluded.match_key, day_name=excluded.day_name, date_iso=excluded.date_iso, status='active', segment=excluded.segment, source=excluded.source, basket_json=excluded.basket_json, meta_json=excluded.meta_json, updated_at=excluded.updated_at";
  step("upsert:" + o.id, d1(sql));
}

const partnerPack = {
  status: "success",
  orders: [
    {
      id: "po_mwbtybgtheuh",
      dateIso: DATE,
      deliverDateIso: DATE,
      locationId: "pt_varka_shevchenko_1",
      locationName: "Varka Шевченко 1",
      networkId: "net_varka",
      status: "open",
      basket: [
        { id: "vr_t_heart", name: "Сердце", qty: 100, unit: "г" },
        { id: "vr_t_lung", name: "Лёгкое", qty: 100, unit: "г" }
      ],
      totalByn: 24
    }
  ]
};
step(
  "partnerOrders",
  d1(
    "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES (" +
      sqlStr("partnerOrders") +
      "," +
      sqlStr(JSON.stringify(partnerPack)) +
      "," +
      sqlStr(now) +
      ") ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at"
  )
);

step("delCuttingSnap", d1("DELETE FROM snap_cache WHERE cache_key=" + sqlStr("cutting:" + DAY)));

const verify = d1(
  "SELECT id, client, day_name, date_iso, segment, source, status FROM orders WHERE status='active' AND date_iso=" +
    sqlStr(DATE) +
    " ORDER BY client"
);
report.verifyRows = (() => {
  if (!verify || verify.error) return [];
  const arr = Array.isArray(verify) ? verify : [verify];
  for (const b of arr) {
    if (b && Array.isArray(b.results)) return b.results;
    if (b && b.result)
      for (const r of b.result) if (r && Array.isArray(r.results)) return r.results;
  }
  return [];
})();

async function api(action, params, initData) {
  const body = Object.assign({ action, cutover: 1 }, params || {});
  if (initData) body.initData = initData;
  const res = await fetch(PREV + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 CursorPostRepairCut/1.0" },
    body: JSON.stringify(body)
  });
  return res.json();
}

const mint = await api("previewMintInitData", { telegramId: "650923866" });
const init = mint && mint.initData;
report.mintOk = !!init;
const cut = init
  ? await api("getCutting", { day: DAY, date: DATE }, init)
  : { status: "error", message: "no_mint" };
const items = (cut && cut.items) || [];
const lung = items.find((it) => /Л[ЁЕ]ГК/i.test(String((it && it.name) || "")));
const heart = items.find((it) => /СЕРДЦ/i.test(String((it && it.name) || "")));
report.cutting = {
  status: cut && cut.status,
  fromOrders: !!(cut && cut.fromOrders),
  date: cut && (cut.date || cut.dateIso),
  cuttingLung: lung ? lung.dry : null,
  cuttingHeart: heart ? heart.dry : null,
  n: items.length,
  items: items.map((it) => ({ name: it.name, dry: it.dry, unit: it.unit }))
};

/** Basket math: stamped trio was 180+30+20=230; real 16.11 = 200+100+100(+100 Varka). */
report.math = {
  stampedTrioLung: 180 + 30 + 20,
  realPeopleLung: 200 + 100 + 100,
  withPartnerLung: 200 + 100 + 100 + 100,
  realHeartGramsApprox: 1 + 20 + 100,
  note: "230 г ДО = сдвинутые polotno180+natnails30+lerooo20; после A на 16.11 их нет"
};

report.ok =
  report.verifyRows.length === 4 &&
  Number(report.cutting.cuttingLung) === 500 &&
  report.verifyRows.every((r) => r.date_iso === DATE);

fs.writeFileSync(path.join(OUT, "preview-resync-1611-post-repair.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 2);
