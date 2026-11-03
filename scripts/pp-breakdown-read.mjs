/**
 * ТОЛЬКО ЧТЕНИЕ.
 * 1) Таблица себесов: priceCostsPp + «Себес сырья» (listRawCosts / builtin)
 * 2) Пошаговый breakdown карточек ПП с |указанная−правильная|>1
 *    (исключая Andreiprigunov, viihrova, ola_ba2ra, katya.dehtyarenko,
 *     es_furman, Lu_or_lu, mrkip). darya.vlc — LEGACY.
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const proxy = join(root, "..", "boinya-c", "proxy");
const outDir = process.env.PP_AUDIT_OUT || join(root, "..", "artifacts", "pp-breakdown");
const WORKER = "https://boinya-c.konchaarsenia.workers.dev/";
const OWNER_ID = Number(process.env.PP_AUDIT_TG_ID || "650923866");
const OWNER_NAME = process.env.PP_AUDIT_TG_NAME || "Арсений";

const SKIP_BREAKDOWN = new Set(
  [
    "andreiprigunov",
    "viihrova",
    "ola_ba2ra",
    "katya.dehtyarenko",
    "es_furman",
    "lu_or_lu",
    "mrkip"
  ].map((s) => s.toLowerCase())
);

const RECOVER_100 = 3.3;
const RECOVER_PIECE = 0.8;
const DELIVERY_RAW = 7.6;
const RETAIL_DELIV = 9;
const RETAIL_FREE = 80;
const CAP = 0.92;
const PACK = { u1: 0.34, u2: 0.56, u3: 0.8, up4: 1.4 };
const LEGACY_FIXED = 11;
const LEGACY_DELIV = 6;

const FRAC_RATES = {
  slices: 0,
  strips: 1,
  large: 1,
  medium: 2,
  small: 3,
  extraSmall: 4
};

const RAW_COST_BUILTIN = [
  { sku: "ЛЁГКОЕ", cost: 2.25 },
  { sku: "СЕРДЦЕ", cost: 4 },
  { sku: "ПОЧКИ", cost: 3 },
  { sku: "РУБЕЦ Т", cost: 2 },
  { sku: "БАРАНЬЕ ЛЁГКОЕ", cost: 8.4 },
  { sku: "ИНДЕЙКА", cost: 7.5 },
  { sku: "ПЕЧЕНЬ", cost: 2.76 },
  { sku: "БАРАНЬЯ ПЕЧЕНЬ", cost: 2.76 },
  { sku: "ВЫМЯ", cost: 1.5 },
  { sku: "СЕМЕННИКИ", cost: 4.17 },
  { sku: "МЯСНЫЕ ЛОМТИКИ", cost: 7.55 },
  { sku: "КРОЛИК", cost: null },
  { sku: "КРОШКА ЛЁГКОГО", cost: 2.25 },
  { sku: "КРОШКА ПОЧЕК", cost: 3 },
  { sku: "КРОШКА РУБЕЦ", cost: 2 },
  { sku: "БЫЧИЙ КОРЕНЬ", cost: 1.91 },
  { sku: "ТРАХЕЯ", cost: 0.88 },
  { sku: "СТАНОВАЯ ЖИЛА", cost: 0.38 },
  { sku: "УХО Г", cost: 0.88 },
  { sku: "УХО К", cost: 0.88 },
  { sku: "АОРТА", cost: 0.94 },
  { sku: "КОЛЕНИ шт.", cost: 1.17 },
  { sku: "ЛОП ХРЯЩ шт.", cost: 1 },
  { sku: "НОСЫ шт.", cost: 1.23 },
  { sku: "УТИНЫЕ ШЕИ шт.", cost: 0.78 },
  { sku: "ПЕРЕПЁЛКИ шт.", cost: 0.81 },
  { sku: "ТЫКВА", cost: 5.33 },
  { sku: "ЯБЛОКИ", cost: 3 },
  { sku: "МОРКОВЬ", cost: 2.3 },
  { sku: "БАТАТ", cost: 10 },
  { sku: "БАНАНЫ", cost: 5 },
  { sku: "ГРУШИ", cost: 6.6 }
];

function parseWrangler(text) {
  const raw = String(text || "");
  const at = raw.search(/[\[{]/);
  if (at < 0) throw new Error("wrangler: нет json");
  return JSON.parse(raw.slice(at));
}

function d1(sql) {
  const run = spawnSync(
    "npx",
    ["--yes", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: proxy, encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 }
  );
  if (run.status !== 0) throw new Error((run.stderr || run.stdout || "d1").slice(-800));
  const parsed = parseWrangler((run.stdout || "") + "\n" + (run.stderr || ""));
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return (block && block.results) || [];
}

function payloadOf(rows) {
  if (!rows || !rows.length) return null;
  let p = rows[0].payload;
  if (typeof p === "string") p = JSON.parse(p);
  return p;
}

function signInitData(token, fields) {
  const keys = Object.keys(fields).sort();
  const dcs = keys.map((k) => k + "=" + fields[k]).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(dcs).digest("hex");
  const sp = new URLSearchParams();
  keys.forEach((k) => sp.append(k, fields[k]));
  sp.append("hash", hash);
  return sp.toString();
}

function money(n) {
  const x = Math.round(Number(n) * 100) / 100;
  return isFinite(x) ? x : 0;
}

function roundRub(n) {
  return Math.round(Number(n) || 0);
}

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function skuNorm(s) {
  return String(s || "")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/\s+/g, " ");
}

function sheetOf(row) {
  const s = String((row && (row.sheet || row.segment)) || "").trim().toUpperCase();
  if (s === "AFK" || s === "АФК") return "АФК";
  if (s === "PP" || s === "ПП" || s === "SUBSCRIPTION") return "ПП";
  return s || "";
}

function nickKey(row) {
  return String((row && (row.nick || row.label)) || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

function parseCoef(card) {
  const w = String((card && (card.wishes || card.note)) || "");
  const m = w.match(/\[COEF:([0-9]+(?:[.,][0-9]+)?)\]/i);
  if (m) return Number(String(m[1]).replace(",", "."));
  const c = Number(card && card.coef);
  if (isFinite(c) && c > 0) return c;
  return null;
}

function parseScheme(card) {
  const w = String((card && (card.wishes || card.note)) || "");
  const m = w.match(/\[SCHEME:([^\]]+)\]/i);
  if (m) {
    const u = String(m[1]).trim().toUpperCase();
    if (u === "RAW26" || u === "RAW" || u === "NEW" || u === "V2") return "RAW26";
    if (u === "LEGACY" || u === "OLD" || u === "V1") return "LEGACY";
  }
  const s = String((card && (card.ppScheme || card.scheme)) || "").trim().toUpperCase();
  if (s === "RAW26" || s === "LEGACY") return s;
  return "LEGACY";
}

function isTestNick(nick) {
  const n = String(nick || "").toLowerCase();
  return n === "zzz_test" || n.startsWith("zzz_") || n.includes("_test") || n.includes("tokencheck");
}

function isDeletedStatus(row) {
  const st = String((row && (row.status || row.stage || row.ppStatus)) || "")
    .trim()
    .toLowerCase();
  return st === "deleted" || st === "удалён" || st === "удален" || st === "archive" || st === "архив";
}

function isPieceName(name) {
  const n = String(name || "");
  if (!n) return false;
  if (/шт/i.test(n)) return true;
  if (/ХРЯЩ|ЛОПАТ|ЛОП\s*ХРЯЩ/i.test(n)) return true;
  if (/КОЛЕН|КОПЫТ|НОСЫ|НОС\b|УХО|УШК|ШЕИ|ШЕЯ|ГУБЫ|ПЕРЕП[ЕЁ]?Л|АОРТ|ТРАХЕ|СТАНОВ|УТИН/i.test(n)) return true;
  if (/БЫЧ.*КОРЕН|КОРЕНЬ/i.test(n)) return true;
  return false;
}

function fracSizeKey(sub) {
  const fu = String(sub || "")
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/\s+/g, " ")
    .trim();
  if (!fu || /^КРОШК/.test(fu)) return "";
  if (/^ОЧЕНЬ\s*МЕЛК|^ОЧ\s*МЕЛК/.test(fu)) return "extraSmall";
  if (/^ЛОМТИК/.test(fu) || fu === "ЛОМТ") return "slices";
  if (/^ПОЛОСК/.test(fu) || fu === "ПОЛОСКИ") return "strips";
  if (/^ЦЕЛ/.test(fu)) return "slices";
  if (/^КРУП/.test(fu)) return "large";
  if (/^БОЛЬ/.test(fu) || fu === "БОЛ") return "large";
  if (/^СРЕД/.test(fu)) return "medium";
  if (/МЕЛК[А-ЯA-Z]*\s*КУСОЧ|КУСОЧ[А-ЯA-Z]*\s*МЕЛК/.test(fu)) return "small";
  if (/^КУСОЧК/.test(fu)) return "strips";
  if ((/^МЕЛК/.test(fu) || /^МАЛ/.test(fu)) && !/^ОЧ/.test(fu)) return "small";
  if (/КУБИК/.test(fu) && /МЕЛК/.test(fu)) return "small";
  if (/КУБИК/.test(fu) && /КРУП/.test(fu)) return "large";
  return "";
}

function lineRecover(L) {
  const val = Number(L.val != null ? L.val : L.value) || 0;
  if (val <= 0) return 0;
  let piece = !!L.piece;
  const cat = String(L.cat || "").toLowerCase();
  const name = String(L.name || L.main || "");
  if (/^крошка$/i.test(name) || cat === "crumb" || L.crumbKind || (Array.isArray(L.sources) && L.sources.length)) {
    piece = false;
  } else if (!piece) {
    if (cat === "chew" || cat === "chews" || cat === "powder") piece = true;
    else if (isPieceName(name) || /шт/i.test(name)) piece = true;
  }
  return piece ? RECOVER_PIECE * val : RECOVER_100 * (val / 100);
}

function lineFrac(it) {
  const cat = String(it.cat || "").toLowerCase();
  if (cat === "chew" || cat === "chews" || cat === "powder") return 0;
  if (cat && cat !== "dressura" && cat !== "other") return 0;
  const size = fracSizeKey(it.sub || "");
  if (!size) return 0;
  const rate = FRAC_RATES[size];
  if (!isFinite(rate)) return 0;
  const grams = Number(it.val != null ? it.val : it.value) || 0;
  return (grams / 100) * rate;
}

function packsMoney(pc) {
  pc = pc || {};
  return money(
    (Number(pc.u1) || 0) * PACK.u1 +
      (Number(pc.u2) || 0) * PACK.u2 +
      (Number(pc.u3) || 0) * PACK.u3 +
      (Number(pc.up4) || 0) * PACK.up4
  );
}

async function workerPost(body) {
  const res = await fetch(WORKER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json().catch(() => ({ status: "error", message: "non_json" }));
}

async function workerPostRetry(body, tries) {
  let last = null;
  for (let i = 0; i < (tries || 4); i++) {
    try {
      last = await workerPost(body);
      if (last && last.status === "success") return last;
      if (last && last.status === "error" && /forbidden|auth/i.test(String(last.message || ""))) {
        return last;
      }
    } catch (e) {
      last = { status: "error", message: String(e && e.message ? e.message : e) };
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return last || { status: "error", message: "retry_exhausted" };
}

async function calcPrice(initData, card) {
  const coef = parseCoef(card);
  const scheme = parseScheme(card);
  return workerPostRetry({
    action: "calcPrice",
    mode: "pp",
    cutover: 1,
    fullFact: 1,
    scheme: scheme,
    wishes: card.wishes || card.note || "",
    coef: coef != null ? coef : undefined,
    deliveriesN: card.deliveries != null ? card.deliveries : card.deliveriesN,
    deliveries: card.deliveries != null ? card.deliveries : card.deliveriesN,
    packCounts: card.packCounts || undefined,
    basket: Array.isArray(card.basket) ? card.basket : [],
    initData
  });
}

async function listRawCosts(initData) {
  return workerPost({ action: "listRawCosts", cutover: 1, initData });
}

function unitKindFromRow(name, pieceFlag) {
  if (pieceFlag || isPieceName(name)) return "шт";
  return "100 г";
}

function matchSebes(sebesByNorm, name) {
  const n = skuNorm(name);
  if (sebesByNorm[n]) return sebesByNorm[n];
  // soft match without «шт.»
  const bare = n.replace(/\s*ШТ\.?$/, "");
  if (sebesByNorm[bare]) return sebesByNorm[bare];
  for (const k of Object.keys(sebesByNorm)) {
    if (k.replace(/\s*ШТ\.?$/, "") === bare) return sebesByNorm[k];
    if (k.indexOf(bare) === 0 || bare.indexOf(k) === 0) return sebesByNorm[k];
  }
  // УХО К → УХО Г fallback for display? keep separate
  if (/^УХО\s*К$/.test(n) && sebesByNorm["УХО Г"]) return sebesByNorm["УХО Г"];
  if (/^ГРУШЫ$/.test(n) && sebesByNorm["ГРУШИ"]) return sebesByNorm["ГРУШИ"];
  return null;
}

mkdirSync(outDir, { recursive: true });
const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
if (!token) {
  console.error("NO_TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

const initData = signInitData(token, {
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id: OWNER_ID, first_name: OWNER_NAME })
});

const meta = d1(
  "SELECT cache_key, updated_at, length(payload) AS n FROM snap_cache WHERE cache_key IN ('listSubscriptions','priceCostsPp','retailPrices')"
);
const costsPayload = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'priceCostsPp'")) || {};
const subsPayload = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'"));
const costs = costsPayload.costs && typeof costsPayload.costs === "object" ? costsPayload.costs : {};
const zeroKeys = costsPayload.zeroKeys && typeof costsPayload.zeroKeys === "object" ? costsPayload.zeroKeys : {};

let sebesLive = await listRawCosts(initData);
const sebesItems =
  sebesLive && sebesLive.status === "success" && Array.isArray(sebesLive.items)
    ? sebesLive.items
    : RAW_COST_BUILTIN.map((r) => ({
        sku: r.sku,
        cost: r.cost,
        builtin: r.cost,
        effectiveFrom: "2026-10-09",
        history: [],
        _fallback: true
      }));

const sebesByNorm = Object.create(null);
sebesItems.forEach((it) => {
  sebesByNorm[skuNorm(it.sku)] = it;
});

/* ---------- 1) pp-costs.csv ---------- */
const costRows = [];
const seenBase = Object.create(null);

Object.keys(costs)
  .sort((a, b) => a.localeCompare(b, "ru"))
  .forEach((key) => {
    const row = costs[key] || {};
    const name = String(row.name || key.split(" / ")[0] || "").trim();
    const sub = String(row.sub || (key.includes(" / ") ? key.split(" / ").slice(1).join(" / ") : "")).trim();
    const unit = Number(row.unitPrice != null ? row.unitPrice : row.per100);
    const piece = !!row.piece || isPieceName(name);
    const sebes = matchSebes(sebesByNorm, name);
    const sebesCost = sebes && sebes.cost != null && sebes.cost !== "" ? Number(sebes.cost) : null;
    const d1Cost = isFinite(unit) ? unit : null;
    let match = "";
    if (d1Cost == null && sebesCost == null) match = "оба пусто";
    else if (d1Cost == null) match = "нет в priceCostsPp";
    else if (sebesCost == null) match = "нет в Себес сырья";
    else if (Math.abs(d1Cost - sebesCost) < 0.011) match = "да";
    else match = "нет (вариант≠база sku)";
    seenBase[skuNorm(name)] = true;
    costRows.push({
      позиция: name,
      вариант: sub,
      ключ: key,
      единица: unitKindFromRow(name, piece),
      себес_D1: d1Cost != null ? d1Cost : "",
      себес_сырья: sebesCost != null && isFinite(sebesCost) ? sebesCost : sebesCost === null && sebes ? "" : "",
      себес_сырья_effectiveFrom: sebes ? sebes.effectiveFrom || "" : "",
      совпадает: match,
      piece: piece ? 1 : 0,
      zeroKey: zeroKeys[key] ? 1 : 0,
      source: "priceCostsPp"
    });
  });

Object.keys(zeroKeys).forEach((key) => {
  if (costs[key]) return;
  const parts = key.split(" / ");
  const name = parts[0];
  const sub = parts.slice(1).join(" / ");
  const sebes = matchSebes(sebesByNorm, name);
  const sebesCost = sebes && sebes.cost != null ? Number(sebes.cost) : null;
  costRows.push({
    позиция: name,
    вариант: sub,
    ключ: key,
    единица: unitKindFromRow(name, isPieceName(name)),
    себес_D1: 0,
    себес_сырья: sebesCost != null && isFinite(sebesCost) ? sebesCost : "",
    себес_сырья_effectiveFrom: sebes ? sebes.effectiveFrom || "" : "",
    совпадает: sebesCost != null && sebesCost === 0 ? "да" : "zeroKey в кэше",
    piece: isPieceName(name) ? 1 : 0,
    zeroKey: 1,
    source: "zeroKeys"
  });
});

sebesItems.forEach((it) => {
  const n = skuNorm(it.sku);
  if (seenBase[n]) return;
  // also check if any cost key has this base
  const has = Object.keys(costs).some((k) => skuNorm((costs[k] && costs[k].name) || k.split(" / ")[0]) === n);
  if (has) return;
  costRows.push({
    позиция: it.sku,
    вариант: "",
    ключ: it.sku,
    единица: unitKindFromRow(it.sku, isPieceName(it.sku)),
    себес_D1: "",
    себес_сырья: it.cost != null && isFinite(Number(it.cost)) ? Number(it.cost) : "",
    себес_сырья_effectiveFrom: it.effectiveFrom || "",
    совпадает: "только Себес сырья (нет ключа в priceCostsPp)",
    piece: isPieceName(it.sku) ? 1 : 0,
    zeroKey: 0,
    source: "listRawCosts"
  });
});

const costsHeader = [
  "позиция",
  "вариант",
  "ключ",
  "единица",
  "себес_D1_priceCostsPp",
  "себес_сырья",
  "себес_сырья_с",
  "совпадает",
  "piece",
  "zeroKey",
  "source"
];
const costsCsv = [costsHeader.join(",")];
costRows.forEach((r) => {
  costsCsv.push(
    [
      r.позиция,
      r.вариант,
      r.ключ,
      r.единица,
      r.себес_D1,
      r.себес_сырья,
      r.себес_сырья_effectiveFrom,
      r.совпадает,
      r.piece,
      r.zeroKey,
      r.source
    ]
      .map(csvEscape)
      .join(",")
  );
});
writeFileSync(join(outDir, "pp-costs.csv"), costsCsv.join("\n") + "\n");

/* ---------- 2) breakdown ---------- */
if (!subsPayload || !Array.isArray(subsPayload.subscriptions)) {
  console.error("NO_LIST_SUBSCRIPTIONS");
  process.exit(1);
}

const ppCards = subsPayload.subscriptions.filter((row) => {
  if (sheetOf(row) !== "ПП") return false;
  if (isTestNick(row.nick) || isTestNick(row.label)) return false;
  if (isDeletedStatus(row)) return false;
  return true;
});

const md = [];
md.push("# Пошаговый расчёт ПП (только чтение)");
md.push("");
md.push("Источник: D1 `priceCostsPp` (обновлён " + ((meta.find((m) => m.cache_key === "priceCostsPp") || {}).updated_at || "?") + ") + live `calcPrice`.");
md.push("«Себес сырья» = `listRawCosts` (builtin + `raw_cost_ver`).");
md.push("Пакеты: u1×0.34 + u2×0.56 + u3×0.80 + up4×1.40.");
md.push("RAW26 recover: 3.30/100г, 0.80/шт. Доставка 7.60×N. Потолок 0.92×B (B = розница товара + 9×N если товар/N < 80).");
md.push("LEGACY: S×coef + 11 + 6×N + пакеты + фракции (без recover/капа).");
md.push("");
md.push("Исключены из breakdown (|diff|≤1): Andreiprigunov, viihrova, ola_ba2ra, katya.dehtyarenko, es_furman, Lu_or_lu, mrkip.");
md.push("");
md.push("Таблица себестоимостей: `pp-costs.csv` (" + costRows.length + " строк).");
md.push("");

const summary = [];
let done = 0;

for (const card of ppCards.sort((a, b) => nickKey(a).localeCompare(nickKey(b), "ru"))) {
  const nick = String(card.nick || "").trim();
  const nk = nickKey(card);
  if (SKIP_BREAKDOWN.has(nk)) continue;

  const stated = money(card.statedCost);
  const factSaved = money(card.factCost != null ? card.factCost : card.calcFactCost);
  const coef = parseCoef(card);
  const scheme = parseScheme(card);
  let calc = {};
  try {
    calc = await calcPrice(initData, card);
  } catch (e) {
    calc = { status: "error", message: String(e && e.message ? e.message : e) };
  }
  const ok = calc && calc.status === "success";
  if (!ok) {
    md.push("## " + nick);
    md.push("");
    md.push("calcPrice error: " + (calc.message || calc.status));
    md.push("");
    continue;
  }
  const correct = money(calc.factCost != null ? calc.factCost : calc.clientPrice);
  const diff = money(stated - correct);
  if (!(Math.abs(diff) > 1)) continue;

  done++;
  const N = Math.max(1, Math.round(Number(calc.deliveriesN != null ? calc.deliveriesN : card.deliveries) || 1));
  const usedCoef = Number(calc.coef != null ? calc.coef : coef) || (scheme === "LEGACY" ? 2.3 : 2.6);
  const usedScheme = String(calc.scheme || scheme);
  const pc = calc.packCounts || card.packCounts || { u1: 0, u2: 0, u3: 0, up4: 0 };
  const lines = Array.isArray(calc.lines) ? calc.lines : [];
  const basket = Array.isArray(card.basket) ? card.basket : [];

  md.push("## " + nick + (card.subId ? " (subId " + card.subId + ")" : ""));
  md.push("");
  md.push("- схема: **" + usedScheme + "**, coef **" + usedCoef + "**, N=**" + N + "**");
  md.push(
    "- пакеты: u1=" +
      (pc.u1 || 0) +
      ", u2=" +
      (pc.u2 || 0) +
      ", u3=" +
      (pc.u3 || 0) +
      ", up4=" +
      (pc.up4 || 0)
  );
  md.push("- указанная: **" + stated + "**, сохранённый факт: " + factSaved);
  md.push("");

  // merge basket meta into lines for cat/sub
  const enriched = lines.map((L) => {
    const name = String(L.name || L.main || "").trim();
    const sub = String(L.sub || "").trim();
    const hit =
      basket.find(
        (b) =>
          skuNorm(b.name || b.main) === skuNorm(name) &&
          (!sub || skuNorm(b.sub || "") === skuNorm(sub) || !String(b.sub || "").trim())
      ) ||
      basket.find((b) => skuNorm(b.name || b.main) === skuNorm(name));
    return Object.assign({}, L, {
      cat: L.cat || (hit && hit.cat) || "",
      val: L.val != null ? L.val : L.value != null ? L.value : hit ? hit.val != null ? hit.val : hit.value : 0,
      sub: sub || (hit && hit.sub) || ""
    });
  });

  md.push("| позиция | вариант | кол-во | unit | себес | сырьё | recover | фракция |");
  md.push("|---|---|---:|---|---:|---:|---:|---:|");

  let S = 0;
  let Rsum = 0;
  let Fsum = 0;
  for (const L of enriched) {
    const name = String(L.name || "").trim();
    const sub = String(L.sub || "").trim();
    const val = Number(L.val != null ? L.val : L.value) || 0;
    if (!name || val <= 0) continue;
    const unitP = Number(L.unitPrice != null ? L.unitPrice : L.per100) || 0;
    const piece = !!L.piece || isPieceName(name);
    const lineS =
      L.cost != null && isFinite(Number(L.cost))
        ? money(L.cost)
        : money(piece ? unitP * val : (unitP * val) / 100);
    const rec = money(lineRecover(L));
    const fr = money(lineFrac(Object.assign({}, L, { cat: L.cat || (piece ? "chew" : "dressura") })));
    // if cat missing, infer: piece chew-like → no dressura frac; else try frac on sub
    let frUse = fr;
    if (!L.cat) {
      if (piece && isPieceName(name) && !/лёгк|сердц|почк|рубец|индейк|вымя|семенн|ломтик|баран/i.test(name)) {
        frUse = 0;
      }
    }
    S += lineS;
    Rsum += rec;
    Fsum += frUse;
    const unitLabel = piece ? "шт" : "100г";
    md.push(
      "| " +
        name +
        " | " +
        (sub || "—") +
        " | " +
        val +
        " | " +
        unitLabel +
        " | " +
        unitP +
        " | " +
        lineS +
        " | " +
        rec +
        " | " +
        frUse +
        " |"
    );
  }
  S = money(S);
  Rsum = money(Rsum);
  Fsum = money(Fsum);

  // prefer calc totals when close
  const S_calc = money(calc.rawCost != null ? calc.rawCost : calc.cost);
  const R_calc = money(calc.recoverByn);
  const F_calc = money(calc.fractionMarkup);
  const P_calc = money(calc.packagesByn != null ? calc.packagesByn : packsMoney(pc));
  if (Math.abs(S - S_calc) > 0.02) S = S_calc;
  if (usedScheme === "RAW26" && Math.abs(Rsum - R_calc) > 0.02) Rsum = R_calc;
  if (Math.abs(Fsum - F_calc) > 0.02) Fsum = F_calc;

  md.push("");
  md.push("**Итого сырьё S = " + S + "**");
  md.push("");

  const pU1 = money((Number(pc.u1) || 0) * PACK.u1);
  const pU2 = money((Number(pc.u2) || 0) * PACK.u2);
  const pU3 = money((Number(pc.u3) || 0) * PACK.u3);
  const pUp4 = money((Number(pc.up4) || 0) * PACK.up4);
  const P = money(pU1 + pU2 + pU3 + pUp4);

  if (usedScheme === "LEGACY") {
    const goods = money(S * usedCoef);
    const D = money(LEGACY_DELIV * N);
    const fixed = LEGACY_FIXED;
    const sum = money(goods + fixed + D + P + Fsum);
    md.push("### LEGACY");
    md.push("");
    md.push("- S × coef = " + S + " × " + usedCoef + " = **" + goods + "**");
    md.push("- fixed = **" + fixed + "**");
    md.push("- доставка = " + LEGACY_DELIV + " × " + N + " = **" + D + "**");
    md.push(
      "- пакеты = u1×0.34(" +
        pU1 +
        ") + u2×0.56(" +
        pU2 +
        ") + u3×0.80(" +
        pU3 +
        ") + up4×1.40(" +
        pUp4 +
        ") = **" +
        P +
        "** (calc " +
        P_calc +
        ")"
    );
    md.push("- фракции F = **" + Fsum + "** (calc " + F_calc + ")");
    md.push("- сумма = " + goods + " + " + fixed + " + " + D + " + " + P + " + " + Fsum + " = **" + sum + "**");
    md.push("- правильная round2 = **" + correct + "**, в рублях = **" + roundRub(correct) + "**");
    md.push("- указанная = **" + stated + "**, разница указанная−правильная = **" + diff + "**");
    md.push("");
    summary.push({ nick, scheme: "LEGACY", stated, correct, diff, S });
  } else {
    const goods = money(S * usedCoef + Rsum);
    const D = money(DELIVERY_RAW * N);
    const uncapped = money(goods + D + P + Fsum);
    const retailGoods = money(calc.retailGoods);
    const per = N > 0 ? retailGoods / N : retailGoods;
    const retailDeliv = per > 0 && per < RETAIL_FREE ? money(RETAIL_DELIV * N) : 0;
    const B = money(retailGoods + retailDeliv);
    const capAt = B > 0 ? money(B * CAP) : 0;
    const capped = capAt > 0 && uncapped > capAt + 0.001;
    const final = capped ? capAt : uncapped;

    md.push("### RAW26");
    md.push("");
    md.push("- S × coef = " + S + " × " + usedCoef + " = " + money(S * usedCoef));
    md.push("- recover R = **" + Rsum + "** (calc " + R_calc + ")");
    md.push("- товар (S×M+R) = **" + goods + "**");
    md.push("- доставка = " + DELIVERY_RAW + " × " + N + " = **" + D + "**");
    md.push(
      "- пакеты = u1×0.34 → " +
        pU1 +
        "; u2×0.56 → " +
        pU2 +
        "; u3×0.80 → " +
        pU3 +
        "; up4×1.40 → " +
        pUp4 +
        "; Σ = **" +
        P +
        "** (calc " +
        P_calc +
        ")"
    );
    md.push("- фракции F = **" + Fsum + "** (calc " + F_calc + ")");
    md.push("- сумма до капа = " + goods + " + " + D + " + " + P + " + " + Fsum + " = **" + uncapped + "**");
    md.push(
      "- розница товар B₀ = **" +
        retailGoods +
        "**; доставка прайса " +
        (retailDeliv > 0 ? RETAIL_DELIV + "×" + N + "=" + retailDeliv : "0 (товар/N≥80 или B₀=0)") +
        "; **B = " +
        B +
        "**"
    );
    md.push("- потолок 0.92×B = **" + capAt + "**" + (capped ? " → кап сработал" : " → кап не сработал"));
    md.push("- итог = **" + money(final) + "**; calc factCost = **" + correct + "**");
    md.push("- правильная round2 = **" + correct + "**, в рублях = **" + roundRub(correct) + "**");
    md.push("- указанная = **" + stated + "**, разница указанная−правильная = **" + diff + "**");
    md.push("");
    summary.push({
      nick,
      scheme: "RAW26",
      stated,
      correct,
      diff,
      S,
      capped,
      B,
      capAt
    });
  }

  if (done % 5 === 0) console.error("breakdown " + done);
}

md.unshift("");
md.unshift(
  "Карточек в breakdown: **" +
    summary.length +
    "** (из " +
    ppCards.length +
    " активных ПП, минус 7 «в допуске»)."
);

writeFileSync(join(outDir, "pp-breakdown.md"), md.join("\n") + "\n");
writeFileSync(
  join(outDir, "pp-breakdown-meta.json"),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      wrote: false,
      snapMeta: meta,
      sebesSource: sebesLive && sebesLive.status === "success" ? "listRawCosts" : "builtin-fallback",
      sebesVersions: (sebesLive && sebesLive.versions && sebesLive.versions.length) || 0,
      costsRows: costRows.length,
      breakdownN: summary.length,
      summary
    },
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      costsRows: costRows.length,
      breakdownN: summary.length,
      costsCsv: join(outDir, "pp-costs.csv"),
      breakdownMd: join(outDir, "pp-breakdown.md")
    },
    null,
    2
  )
);
