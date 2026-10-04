#!/usr/bin/env node
/**
 * Дубли после закрытия недели 04.10.2026.
 * По умолчанию DRY RUN: только чтение D1 (локально, если токен умеет query).
 * CI ходит в Worker POST /admin/week-close-dupes: токен CI D1 query не имеет.
 * Apply: APPLY_CONFIRM=delete-week-close-dupes-2026-10-04 и APPLY_IDS
 * точно как строка плана. GAS / календарь / брони / лист / карточки ПП /
 * tombs / sheet_outbox не трогает.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIRM = "delete-week-close-dupes-2026-10-04";
const OUT_DIR = path.join(root, "artifacts/week-close-dupes-2026-10-04");

const A_TARGETS = [
  { label: "evgenia_In", main: "2026-10-06", copy: "2026-09-29" },
  { label: "_ann22_", main: "2026-10-06", copy: "2026-09-29" },
  { label: "polotno_an", main: "2026-10-07", copy: "2026-09-30" },
  { label: "confettins97", main: "2026-10-07", copy: "2026-09-30" },
  { label: "karpusha_me", main: "2026-10-07", copy: "2026-09-30" },
  { label: "Наталья Фалютинская", main: "2026-10-09", copy: "2026-10-02" }
];

const DAY_BY_ISO = {
  "2026-10-05": "Понедельник",
  "2026-10-06": "Вторник",
  "2026-10-07": "Среда",
  "2026-10-08": "Четверг",
  "2026-10-09": "Пятница",
  "2026-10-10": "Суббота",
  "2026-10-11": "Воскресенье",
  "2026-10-12": "Будущая неделя"
};

function looseKey(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/[._\s@]/g, "");
}

function normAddr(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function normClient(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJson(raw, fallback) {
  if (raw && typeof raw === "object") return raw;
  try {
    return JSON.parse(raw || "") ?? fallback;
  } catch (e) {
    return fallback;
  }
}

function basketItems(row) {
  const arr = parseJson(row && row.basket_json, []);
  return Array.isArray(arr) ? arr : [];
}

function basketBrief(row) {
  return basketItems(row)
    .map((it) => {
      it = it || {};
      const name = String(it.name || it.main || "").trim();
      const sub = String(it.sub || "").trim();
      const val = it.val != null ? it.val : it.value != null ? it.value : "";
      if (!name) return "";
      return name + (sub ? "/" + sub : "") + (val !== "" ? "×" + val : "");
    })
    .filter(Boolean)
    .join(", ");
}

function priceScore(row) {
  const m = parseJson(row && row.meta_json, {});
  let n = 0;
  ["orderPrice", "statedCost", "factCost", "clientPrice"].forEach((k) => {
    const v = m && m[k];
    if (v != null && String(v).trim() !== "") n++;
  });
  return n;
}

function score(row) {
  const basket = basketItems(row).filter((it) => it && (it.name || it.main)).length;
  return {
    basket,
    prices: priceScore(row),
    phone: String((row && row.phone) || "").trim() ? 1 : 0,
    address: String((row && row.address) || "").trim() ? 1 : 0,
    note: String((row && row.note) || "").trim() ? 1 : 0
  };
}

function notPoorer(main, other) {
  const a = score(main);
  const b = score(other);
  return a.basket >= b.basket && a.prices >= b.prices && a.phone >= b.phone && a.address >= b.address && a.note >= b.note;
}

function rowMatchesLabel(row, label) {
  const want = looseKey(label);
  if (!want) return false;
  const mk = looseKey(row.match_key);
  const client = looseKey(row.client);
  if (mk === want || client === want) return true;
  const raw = String(row.client || "");
  if (raw.toLowerCase().includes(String(label).toLowerCase())) return true;
  return false;
}

function lineOf(row) {
  return (
    "id=" +
    row.id +
    " date=" +
    row.date_iso +
    " day=" +
    (row.day_name || "—") +
    " updated_at=" +
    (row.updated_at || "") +
    " basket=" +
    (basketBrief(row) || "—")
  );
}

function classify(rows) {
  const active = (rows || []).filter((r) => r && String(r.status || "active") === "active");
  const plan = [];
  const manual = [];
  const plannedIds = Object.create(null);

  function addDupe(kind, dup, main) {
    if (!dup || !main || dup.id === main.id) return;
    if (plannedIds[dup.id]) return;
    plannedIds[dup.id] = true;
    plan.push({ kind, dup, main });
  }

  for (let i = 0; i < A_TARGETS.length; i++) {
    const t = A_TARGETS[i];
    const hits = active.filter((r) => rowMatchesLabel(r, t.label));
    const mains = hits.filter((r) => r.date_iso === t.main);
    const copies = hits.filter((r) => r.date_iso === t.copy);
    if (!mains.length || !copies.length) continue;
    if (mains.length !== 1) {
      manual.push({
        kind: "A",
        why: t.label + ": несколько основных на " + t.main + ", не удалять",
        rows: mains.concat(copies)
      });
      continue;
    }
    const main = mains[0];
    for (let c = 0; c < copies.length; c++) {
      if (notPoorer(main, copies[c])) addDupe("A", copies[c], main);
      else {
        manual.push({
          kind: "A",
          why: t.label + ": копия на " + t.copy + " богаче основной, не удалять",
          rows: [copies[c], main]
        });
      }
    }
  }

  const groups = Object.create(null);
  for (let i = 0; i < active.length; i++) {
    const r = active[i];
    if (r.date_iso < "2026-10-05" || r.date_iso > "2026-10-11") continue;
    const key = [r.date_iso, String(r.match_key || ""), normClient(r.client), normAddr(r.address)].join("|");
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }
  Object.keys(groups).forEach((key) => {
    const g = groups[key];
    if (g.length < 2) return;
    const iso = g[0].date_iso;
    const wantDay = DAY_BY_ISO[iso] || "";
    const correct = g.filter((r) => String(r.day_name || "") === wantDay);
    if (!correct.length) {
      manual.push({ kind: "B", why: "нет строки с day_name " + wantDay + " на " + iso, rows: g });
      return;
    }
    const keeper = correct.slice().sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0];
    const poorer = g.some((r) => r.id !== keeper.id && !notPoorer(keeper, r));
    if (poorer) {
      manual.push({ kind: "B", why: "строка с верным днём беднее другой на " + iso, rows: g });
      return;
    }
    for (let i = 0; i < g.length; i++) {
      if (g[i].id !== keeper.id) addDupe("B", g[i], keeper);
    }
  });

  const byMk = Object.create(null);
  for (let i = 0; i < active.length; i++) {
    const r = active[i];
    const mk = String(r.match_key || "");
    if (!mk) continue;
    if (!byMk[mk]) byMk[mk] = [];
    byMk[mk].push(r);
  }
  Object.keys(byMk).forEach((mk) => {
    const list = byMk[mk];
    const mondays = list.filter((r) => r.date_iso === "2026-10-05" && String(r.day_name || "") === "Понедельник");
    const futures = list.filter((r) => r.date_iso === "2026-10-12");
    if (!mondays.length || !futures.length) return;
    if (mondays.length !== 1) {
      manual.push({ kind: "C", why: mk + ": несколько Пн 05.10, не удалять 12.10", rows: mondays.concat(futures) });
      return;
    }
    const main = mondays[0];
    const richerFuture = futures.some((r) => !notPoorer(main, r));
    if (richerFuture) {
      manual.push({
        kind: "C",
        why: mk + ": Пн 05.10 беднее строки на 12.10, вручную, не удалять",
        rows: [main].concat(futures)
      });
      return;
    }
    for (let i = 0; i < futures.length; i++) addDupe("C", futures[i], main);
  });

  plan.sort((a, b) => String(a.dup.id).localeCompare(String(b.dup.id)));
  const applyIds = plan.map((p) => p.dup.id).join(",");
  return { plan, manual, applyIds };
}

function formatReport(classified) {
  const lines = [];
  lines.push("DRY RUN week-close dupes 2026-10-04");
  ["A", "B", "C"].forEach((kind) => {
    const part = classified.plan.filter((p) => p.kind === kind);
    lines.push("");
    lines.push(kind === "A" ? "A) копия на −7" : kind === "B" ? "B) одна дата 05.10–11.10" : "C) Пн 05.10 продублирован на 12.10");
    if (!part.length) {
      lines.push("(нет)");
      return;
    }
    part.forEach((p) => {
      lines.push("дубль " + lineOf(p.dup) + "  ⇢  основная " + lineOf(p.main));
    });
  });
  lines.push("");
  lines.push("вручную");
  if (!classified.manual.length) lines.push("(нет)");
  classified.manual.forEach((m) => {
    lines.push("- " + m.why);
    (m.rows || []).forEach((r) => lines.push("  " + lineOf(r)));
  });
  lines.push("");
  lines.push("APPLY_IDS=" + classified.applyIds);
  return lines.join("\n");
}

function parseWrangler(text) {
  const s = String(text || "");
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("wrangler: нет JSON в ответе");
  const parsed = JSON.parse(s.slice(start, end + 1));
  if (Array.isArray(parsed) && parsed[0] && Array.isArray(parsed[0].results)) return parsed[0].results;
  if (parsed && Array.isArray(parsed.results)) return parsed.results;
  throw new Error("wrangler: неожиданный JSON");
}

function scrubSecrets(text) {
  let s = String(text || "");
  [process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ACCOUNT_ID, process.env.GAS_SHARED_SECRET].forEach(
    (sec) => {
      if (sec && String(sec).length >= 4) s = s.split(String(sec)).join("[secret]");
    }
  );
  return s;
}

function d1(sql) {
  let out = "";
  try {
    out = execFileSync(
      "npx",
      ["--yes", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
      {
        cwd: path.join(root, "boinya-c/proxy"),
        env: process.env,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024
      }
    );
  } catch (e) {
    const err = new Error("wrangler d1 failed");
    err.wranglerLog = scrubSecrets([e && e.stderr, e && e.stdout, e && e.message].filter(Boolean).join("\n"));
    throw err;
  }
  try {
    return parseWrangler(out);
  } catch (e) {
    const err = new Error("wrangler: нет JSON");
    err.wranglerLog = scrubSecrets(String(out || "") + "\n" + String((e && e.message) || e));
    throw err;
  }
}

function sqlLit(v) {
  return "'" + String(v == null ? "" : v).replace(/'/g, "''") + "'";
}

function writeOut(name, text) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), text);
}

function selfTest() {
  const rows = [
    {
      id: "tue-main",
      date_iso: "2026-10-06",
      day_name: "Вторник",
      client: "evgenia_In",
      match_key: "EVGENIAIN",
      address: "a",
      note: "n",
      phone: "+375291112233",
      basket_json: '[{"name":"ЛЁГКОЕ","val":100}]',
      meta_json: '{"orderPrice":10}',
      status: "active",
      updated_at: "2026-10-04T18:00:00.000Z"
    },
    {
      id: "tue-copy",
      date_iso: "2026-09-29",
      day_name: "Вторник",
      client: "evgenia_In",
      match_key: "EVGENIAIN",
      address: "a",
      note: "",
      phone: "",
      basket_json: "[]",
      meta_json: "{}",
      status: "active",
      updated_at: "2026-09-29T10:00:00.000Z"
    },
    {
      id: "same-good",
      date_iso: "2026-10-05",
      day_name: "Понедельник",
      client: "dupemon",
      match_key: "DUPEMON",
      address: "ул одна",
      note: "n",
      phone: "1",
      basket_json: '[{"name":"СЕРДЦЕ","val":50}]',
      meta_json: '{"orderPrice":5}',
      status: "active",
      updated_at: "2026-10-04T12:00:00.000Z"
    },
    {
      id: "same-extra",
      date_iso: "2026-10-05",
      day_name: "Будущая неделя",
      client: "dupemon",
      match_key: "DUPEMON",
      address: "ул одна",
      note: "",
      phone: "",
      basket_json: "[]",
      meta_json: "{}",
      status: "active",
      updated_at: "2026-10-03T12:00:00.000Z"
    },
    {
      id: "varka-1",
      date_iso: "2026-10-06",
      day_name: "Вторник",
      client: "varka",
      match_key: "VARKA",
      address: "точка А",
      note: "",
      phone: "",
      basket_json: "[]",
      meta_json: "{}",
      status: "active",
      updated_at: "2026-10-04T12:00:00.000Z"
    },
    {
      id: "varka-2",
      date_iso: "2026-10-06",
      day_name: "Вторник",
      client: "varka",
      match_key: "VARKA",
      address: "точка Б",
      note: "",
      phone: "",
      basket_json: "[]",
      meta_json: "{}",
      status: "active",
      updated_at: "2026-10-04T12:00:00.000Z"
    },
    {
      id: "mon-main",
      date_iso: "2026-10-05",
      day_name: "Понедельник",
      client: "mondayperson",
      match_key: "MONDAYPERSON",
      address: "дом",
      note: "n",
      phone: "1",
      basket_json: '[{"name":"ПОЧКИ","val":100}]',
      meta_json: '{"orderPrice":8}',
      status: "active",
      updated_at: "2026-10-04T12:00:00.000Z"
    },
    {
      id: "mon-future",
      date_iso: "2026-10-12",
      day_name: "Будущая неделя",
      client: "mondayperson",
      match_key: "MONDAYPERSON",
      address: "дом",
      note: "",
      phone: "",
      basket_json: "[]",
      meta_json: "{}",
      status: "active",
      updated_at: "2026-10-04T19:00:00.000Z"
    },
    {
      id: "poor-mon",
      date_iso: "2026-10-05",
      day_name: "Понедельник",
      client: "poor",
      match_key: "POOR",
      address: "",
      note: "",
      phone: "",
      basket_json: "[]",
      meta_json: "{}",
      status: "active",
      updated_at: "2026-10-04T12:00:00.000Z"
    },
    {
      id: "rich-future",
      date_iso: "2026-10-12",
      day_name: "Будущая неделя",
      client: "poor",
      match_key: "POOR",
      address: "дом",
      note: "есть",
      phone: "1",
      basket_json: '[{"name":"УХО","val":1}]',
      meta_json: '{"orderPrice":9}',
      status: "active",
      updated_at: "2026-10-04T19:00:00.000Z"
    }
  ];
  const c = classify(rows);
  const ids = c.plan.map((p) => p.dup.id).sort();
  const expect = ["mon-future", "same-extra", "tue-copy"];
  if (JSON.stringify(ids) !== JSON.stringify(expect)) {
    console.error("self-test plan", ids, "expected", expect);
    process.exit(1);
  }
  if (!c.manual.some((m) => m.kind === "C" && m.why.includes("POOR"))) {
    console.error("self-test: бедный Пн должен остаться вручную");
    process.exit(1);
  }
  if (c.plan.some((p) => p.dup.id === "varka-1" || p.dup.id === "varka-2")) {
    console.error("self-test: разные адреса Варки склеились");
    process.exit(1);
  }
  const report = formatReport(c);
  if (report.includes("+375291112233") || report.includes("375291112233") || /phone\s*=/.test(report)) {
    console.error("self-test: в отчёте телефон");
    process.exit(1);
  }
  const worker = loadWorkerDupes_();
  const c2 = worker.weekCloseDupesClassify_(rows);
  if (c2.applyIds !== c.applyIds) {
    console.error("worker classify разошёлся", c2.applyIds, c.applyIds);
    process.exit(1);
  }
  const pub = JSON.stringify(worker.weekCloseDupesPublicPlan_(c2));
  const workerReport = worker.weekCloseDupesFormat_(c2);
  if (
    pub.includes("+375291112233") ||
    pub.includes("375291112233") ||
    pub.includes('"phone"') ||
    pub.includes('"address"') ||
    pub.includes('"note"')
  ) {
    console.error("self-test: публичный план Worker содержит телефон или адрес");
    process.exit(1);
  }
  const last = worker.weekCloseLastWeekDecide_([
    {
      id: "Понедельник:WYVD",
      date_iso: "2026-09-28",
      day_name: "Понедельник",
      client: "w.yvd",
      match_key: "WYVD",
      basket_json: '[{"name":"ЛЁГКОЕ","val":100}]',
      status: "active"
    },
    {
      id: "Вторник:LUORLU",
      date_iso: "2026-09-29",
      day_name: "Вторник",
      client: "Lu_or_lu",
      match_key: "LUORLU",
      basket_json: '[{"name":"СЕРДЦЕ","val":50}]',
      status: "deleted"
    },
    {
      id: "Вторник:LUORLU2",
      date_iso: "2026-10-06",
      day_name: "Вторник",
      client: "Lu_or_lu",
      match_key: "LUORLU",
      basket_json: "[]",
      status: "active"
    },
    {
      id: "Будущая неделя:FLAFFYFON",
      date_iso: "2026-10-12",
      day_name: "Будущая неделя",
      client: "flaffyfon",
      match_key: "FLAFFYFON",
      basket_json: '[{"name":"УХО","val":1}]',
      status: "active"
    },
    {
      id: "Понедельник:FLAFFYFON",
      date_iso: "2026-10-05",
      day_name: "Понедельник",
      client: "flaffyfon",
      match_key: "FLAFFYFON",
      basket_json: '[{"name":"УХО","val":1}]',
      status: "active"
    }
  ]);
  const wyvd = last.find((d) => d.label === "w.yvd");
  const lu = last.find((d) => d.label === "Lu_or_lu");
  const ola = last.find((d) => d.label === "ola_ba2ra");
  if (!wyvd || wyvd.result !== "alive-before") {
    console.error("self-test: w.yvd должен быть alive-before", wyvd);
    process.exit(1);
  }
  if (!lu || lu.result !== "would-restore" || lu.action !== "undelete" || lu.id !== "Вторник:LUORLU") {
    console.error("self-test: Lu_or_lu должен восстанавливаться из deleted", lu);
    process.exit(1);
  }
  if (!ola || ola.result !== "still-missing") {
    console.error("self-test: ola_ba2ra без строки — still-missing", ola);
    process.exit(1);
  }
  const extras = worker.weekCloseExtraDecide_(
    [
      {
        id: "Будущая неделя:FLAFFYFON",
        date_iso: "2026-10-12",
        day_name: "Будущая неделя",
        client: "flaffyfon",
        match_key: "FLAFFYFON",
        status: "active",
        basket_json: "[]"
      },
      {
        id: "Понедельник:FLAFFYFON",
        date_iso: "2026-10-05",
        day_name: "Понедельник",
        client: "flaffyfon",
        match_key: "FLAFFYFON",
        status: "active",
        basket_json: "[]"
      }
    ],
    ["Будущая неделя:FLAFFYFON"]
  );
  if (!extras[0] || extras[0].error || !extras[0].main || extras[0].main.id !== "Понедельник:FLAFFYFON") {
    console.error("self-test: extra FLAFFYFON", extras[0]);
    process.exit(1);
  }
  const blocked = worker.weekCloseDeleteBlocked_(
    { id: "Вторник:LUORLU", client: "Lu_or_lu", match_key: "LUORLU", date_iso: "2026-09-29" },
    last
  );
  if (!blocked) {
    console.error("self-test: удаление записи прошлой недели должно блокироваться");
    process.exit(1);
  }
  const lastText = worker.weekCloseLastWeekFormat_(last, "LAST WEEK");
  if (lastText.includes("+375") || /phone\s*=/.test(lastText) || /address\s*=/.test(lastText)) {
    console.error("self-test: отчёт прошлой недели содержит персональные данные");
    process.exit(1);
  }
  if (workerReport.includes("+375291112233") || /phone\s*=/.test(workerReport)) {
    console.error("self-test: отчёт Worker содержит телефон");
    process.exit(1);
  }
  const approvedPath = path.join(root, "scripts/week-close-dupes-approved.json");
  const approved = JSON.parse(fs.readFileSync(approvedPath, "utf8"));
  const approvedIds = String(approved.applyIds || "").split(",").filter(Boolean);
  if (approved.confirm !== CONFIRM || approvedIds.length !== 14) {
    console.error("self-test: approved.json confirm/applyIds");
    process.exit(1);
  }
  const extraOk =
    Array.isArray(approved.extraIds) &&
    approved.extraIds.includes("Будущая неделя:FLAFFYFON") &&
    approved.extraIds.includes("Будущая неделя:ROSTISLOVE") &&
    approved.extraIds.length === 2;
  if (!extraOk) {
    console.error("self-test: extraIds");
    process.exit(1);
  }
  const approvedRaw = fs.readFileSync(approvedPath, "utf8");
  if (/phone|address|\+375/i.test(approvedRaw)) {
    console.error("self-test: в approved.json персональные поля");
    process.exit(1);
  }
  console.log("self-test ok");
  console.log(formatReport(c));
}

function loadWorkerDupes_() {
  const src = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
  if (!src.includes('url.pathname === "/admin/week-close-dupes"')) {
    console.error("worker: нет POST /admin/week-close-dupes");
    process.exit(1);
  }
  const start = src.indexOf("var WEEK_CLOSE_DUPES_CONFIRM_");
  const end = src.indexOf("\nfunction json(obj, status)", start);
  if (start < 0 || end < 0) {
    console.error("worker: блок дублей не найден");
    process.exit(1);
  }
  const block = src.slice(start, end);
  [
    'WEEK_CLOSE_DUPES_CONFIRM_ = "delete-week-close-dupes-2026-10-04"',
    "DUPES_ADMIN_TOKEN",
    "x-dupes-admin-token",
    "UPDATE orders SET status = 'deleted', updated_at = ?",
    "AND status = 'active' AND date_iso = ?",
    "AND match_key = ?",
    "main.status = 'active' AND main.id != orders.id",
    'if (k === "phone" || k === "address" || k === "note" || k === "permanentNote" || k === "geo") return;',
    "weekCloseLastWeekTargets_",
    "w.yvd",
    "extraIds"
  ].forEach((needle) => {
    if (!block.includes(needle)) {
      console.error("worker source missing: " + needle);
      process.exit(1);
    }
  });
  const admin = block.slice(block.indexOf("async function weekCloseDupesAdmin_"));
  ["gasProxy_", "putSnap_", "sheet_outbox", "deleteClient", "removeCalendarClient"].forEach((bad) => {
    if (admin.includes(bad) || block.includes(bad)) {
      console.error("worker dupes трогает " + bad);
      process.exit(1);
    }
  });
  const fns = block.slice(0, block.indexOf("async function weekCloseDupesLoad_"));
  const ctx = vm.createContext({});
  vm.runInContext(fns, ctx);
  return ctx;
}

function ciBody() {
  const file =
    process.env.APPROVED_FILE || path.join(root, "scripts/week-close-dupes-approved.json");
  function emit(obj) {
    process.stdout.write(JSON.stringify(obj));
  }
  if (!fs.existsSync(file)) {
    emit({ mode: "dry-run" });
    console.error("нет scripts/week-close-dupes-approved.json — dry-run");
    return;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    emit({ mode: "dry-run" });
    console.error("файл подтверждения не JSON — остаётся dry-run");
    process.exitCode = 2;
    return;
  }
  const got = String((data && data.confirm) || "").trim();
  const ids = data && data.applyIds;
  const extraIds = Array.isArray(data && data.extraIds)
    ? data.extraIds.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  if (got === CONFIRM && typeof ids === "string") {
    const body = { mode: "apply", confirm: got, applyIds: ids };
    if (extraIds.length) body.extraIds = extraIds;
    emit(body);
    console.error("apply по файлу подтверждения, extra=" + extraIds.length);
    return;
  }
  emit({ mode: "dry-run" });
  console.error("файл подтверждения без верного confirm и applyIds — остаётся dry-run");
  process.exitCode = 2;
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

if (process.argv.includes("--ci-body")) {
  ciBody();
  process.exit(process.exitCode || 0);
}

const checkAt = process.argv.indexOf("--check-response");
if (checkAt >= 0) {
  const file = process.argv[checkAt + 1];
  const code = String(process.argv[checkAt + 2] || "");
  const bodyRc = Number(process.argv[checkAt + 3] || "0");
  const raw = fs.readFileSync(file, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(raw.slice(0, 4000));
    console.error("ответ Worker не JSON, HTTP " + code);
    process.exit(1);
  }
  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    Object.keys(node).forEach((k) => {
      if (["phone", "address", "note"].includes(String(k).toLowerCase())) {
        console.error("в ответе есть ключ " + k);
        process.exit(1);
      }
      walk(node[k]);
    });
  }
  walk(data);
  const report = String(data.report || "");
  if (/phone\s*=/.test(report)) {
    console.error("в отчёте есть phone=");
    process.exit(1);
  }
  console.log(report);
  writeOut("plan.txt", report + "\n");
  writeOut("response.json", raw.endsWith("\n") ? raw : raw + "\n");
  const modeOut = String(data.mode || "");
  const status = String(data.status || "");
  if (bodyRc !== 0 && bodyRc !== 2) {
    console.error("разбор файла подтверждения завершился кодом " + bodyRc);
    process.exit(1);
  }
  if (modeOut === "dry-run") {
    if (code !== "200" || status !== "success") {
      console.error("dry-run не success, HTTP " + code + " status=" + status);
      process.exit(1);
    }
    if (bodyRc === 2) {
      console.error("файл подтверждения битый — apply не делался, dry-run выше");
      process.exit(1);
    }
    process.exit(0);
  }
  if (code !== "200" || status !== "success") {
    console.error("apply не success, HTTP " + code + " status=" + status);
    process.exit(1);
  }
  process.exit(0);
}

const mode = String(process.env.MODE || "dry-run").trim().toLowerCase();
const confirm = String(process.env.APPLY_CONFIRM || "").trim();
const givenIds = String(process.env.APPLY_IDS || "").trim();
const wantApply = mode === "apply";

let rows = [];
try {
  rows = d1(
    "SELECT id, date_iso, day_name, client, match_key, address, note, phone, basket_json, segment, source, status, updated_at, meta_json FROM orders WHERE status = 'active' AND date_iso >= '2026-09-28' AND date_iso <= '2026-10-12'"
  );
} catch (e) {
  const detail = scrubSecrets((e && e.wranglerLog) || (e && e.stderr) || (e && e.message) || e);
  console.error("DRY RUN не выполнен: нет чтения D1");
  console.error(detail);
  try {
    writeOut("plan.txt", "DRY RUN не выполнен: нет чтения D1\n" + detail + "\n");
  } catch (eW) {}
  process.exit(2);
}

const classified = classify(rows);
const report = formatReport(classified).replace(/^DRY RUN/, wantApply ? "APPLY REQUEST" : "DRY RUN");
console.log(report);
writeOut("plan.txt", report + "\n");
writeOut(
  "backup.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      applyIds: classified.applyIds,
      rows: classified.plan
        .map((p) => [p.dup, p.main])
        .flat()
        .map((r) => {
          const copy = Object.assign({}, r);
          delete copy.phone;
          return copy;
        })
    },
    null,
    2
  )
);

if (!wantApply) process.exit(0);

if (confirm !== CONFIRM) {
  console.error("apply отклонён: нужен APPLY_CONFIRM=" + CONFIRM);
  process.exit(2);
}
if (givenIds !== classified.applyIds) {
  console.error("apply отклонён: APPLY_IDS не совпал с текущим планом");
  console.error("план  " + classified.applyIds);
  console.error("дан   " + givenIds);
  process.exit(2);
}
if (!classified.plan.length) {
  console.log("план пуст, записей нет");
  process.exit(0);
}

const now = new Date().toISOString();
for (let i = 0; i < classified.plan.length; i++) {
  const p = classified.plan[i];
  const sql =
    "UPDATE orders SET status = 'deleted', updated_at = " +
    sqlLit(now) +
    " WHERE id = " +
    sqlLit(p.dup.id) +
    " AND status = 'active' AND date_iso = " +
    sqlLit(p.dup.date_iso) +
    " AND match_key = " +
    sqlLit(p.dup.match_key) +
    " AND EXISTS (SELECT 1 FROM orders AS main WHERE main.id = " +
    sqlLit(p.main.id) +
    " AND main.status = 'active' AND main.id != orders.id)";
  d1(sql);
}

const mainIds = [];
classified.plan.forEach((p) => {
  if (mainIds.indexOf(p.main.id) < 0) mainIds.push(p.main.id);
});
const check = d1(
  "SELECT id, status FROM orders WHERE id IN (" + mainIds.map(sqlLit).join(",") + ")"
);
const dead = mainIds.filter((id) => !check.some((r) => r.id === id && r.status === "active"));
if (dead.length) {
  console.error("основные не active после apply: " + dead.join(","));
  process.exit(1);
}
console.log("apply ok, основные active: " + mainIds.length);
