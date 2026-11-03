/**
 * ТОЛЬКО ЧТЕНИЕ. Продолжение аудита ПП:
 * 1) _madmazelka_ subId 47 — calcPrice + влияние надгробия (не снимаем)
 * 2) D1 unit costs vs builtin/dated; indix S=29.51 vs 42.51 построчно
 * + полный CSV всех 29 активных ПП (28 + madmazelka).
 * Ничего не пишет в D1/Sheets.
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const proxy = join(root, "..", "boinya-c", "proxy");
const outDir = process.env.PP_AUDIT_OUT || join(root, "..", "artifacts", "pp-audit-cont");
const WORKER = "https://boinya-c.konchaarsenia.workers.dev/";
const OWNER_ID = Number(process.env.PP_AUDIT_TG_ID || "650923866");
const OWNER_NAME = process.env.PP_AUDIT_TG_NAME || "Арсений";
const SUB_DELETE_TOMB_TTL_MS = 15 * 60 * 1000;

/** Ожидаемые ставки владельца для разбора indix (не пишем в D1). */
const INDIX_EXPECTED_UNIT = {
  "ЛЁГКОЕ": 2.25,
  "УХО Г": 0.88,
  "БЫЧИЙ КОРЕНЬ": 3.83,
  "ТРАХЕЯ": 0.88,
  "СТАНОВАЯ ЖИЛА": 0.75
};

const RAW_COST_BUILTIN = {
  "ЛЁГКОЕ": 2.25,
  "УХО Г": 0.88,
  "БЫЧИЙ КОРЕНЬ": 1.91,
  "ТРАХЕЯ": 0.88,
  "СТАНОВАЯ ЖИЛА": 0.38
};

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
  if (run.status !== 0) {
    throw new Error((run.stderr || run.stdout || "d1").slice(-800));
  }
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

function sheetOf(row) {
  const s = String((row && (row.sheet || row.segment)) || "").trim().toUpperCase();
  if (s === "AFK" || s === "АФК") return "АФК";
  if (s === "PP" || s === "ПП" || s === "SUBSCRIPTION") return "ПП";
  if (s === "BP" || s === "БП") return "БП";
  return s || "";
}

function nickKey(row) {
  return String((row && (row.nick || row.label || row.mk)) || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

function normalizeMk(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/\s+/g, "");
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

function tombAlive(it, now) {
  if (!it) return false;
  const ttl = Number(it.ttl) > 0 ? Number(it.ttl) : SUB_DELETE_TOMB_TTL_MS;
  return now - (Number(it.at) || 0) < ttl;
}

function packStr(card, calc) {
  const pc = (card && card.packCounts) || (calc && calc.packCounts) || null;
  if (!pc) return "";
  return (
    "u1=" +
    (pc.u1 || 0) +
    ";u2=" +
    (pc.u2 || 0) +
    ";u3=" +
    (pc.u3 || 0) +
    ";up4=" +
    (pc.up4 || 0)
  );
}

function basketFull(basket) {
  return (basket || [])
    .map((it) => {
      const name = String((it && (it.name || it.main)) || "").trim();
      const sub = String((it && it.sub) || "").trim();
      const val = Number(it && (it.val != null ? it.val : it.value)) || 0;
      const cat = String((it && it.cat) || "").trim();
      if (!name || val <= 0) return "";
      const unit = /шт/i.test(name) || (cat && /chew|жевал/i.test(cat) && !/г$/i.test(String(val)))
        ? "шт"
        : cat === "dressura" || cat === "crumb" || /лёгк|сердц|почк|рубец|индейк|вымя|семенн|ломтик|банан|яблок|груш|тыкв|батат|морков|крошк/i.test(name)
          ? "г"
          : "шт/г";
      // жевалки без «шт.» в имени — штуки; дрессура/овощи/крошка — граммы
      let u = "г";
      if (/шт\.?/i.test(name)) u = "шт";
      else if (cat === "chew" || /ухо|корень|трахе|жил|аорт|колен|нос|ше|переп|хрящ/i.test(name)) u = "шт";
      else if (cat === "dressura" || cat === "crumb" || cat === "veg" || cat === "other") u = "г";
      return name + (sub ? " / " + sub : "") + " × " + val + " " + u;
    })
    .filter(Boolean)
    .join("; ");
}

function skuNorm(s) {
  return String(s || "")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/\s+/g, " ");
}

async function calcPrice(initData, card) {
  const basket = Array.isArray(card.basket) ? card.basket : [];
  const coef = parseCoef(card);
  const scheme = parseScheme(card);
  const body = {
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
    basket: basket,
    initData: initData
  };
  const res = await fetch(WORKER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json().catch(() => ({ status: "error", message: "non_json" }));
}

function unitFromCosts(costs, name, sub) {
  const key = name + (sub ? " / " + sub : "");
  const hit = (costs && (costs[key] || costs[name])) || null;
  if (!hit) return { unit: null, key: key, piece: null, source: "missing" };
  const unit = Number(hit.unitPrice != null ? hit.unitPrice : hit.per100);
  return {
    unit: isFinite(unit) ? unit : null,
    key: key,
    piece: !!hit.piece,
    source: "priceCostsPp"
  };
}

mkdirSync(outDir, { recursive: true });

const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
if (!token) {
  console.error("NO_TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

const now = Date.now();
const meta = d1(
  "SELECT cache_key, updated_at, length(payload) AS n FROM snap_cache WHERE cache_key IN ('listSubscriptions','subDeleteTombstones','priceCostsPp','retailPrices')"
);
const subsPayload = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'"));
const tombsPayload = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'subDeleteTombstones'")) || { items: [] };
const costsPayload = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'priceCostsPp'")) || { costs: {} };
let rawCostVers = [];
try {
  rawCostVers = d1(
    "SELECT sku, cost, shrink, effective_from AS effectiveFrom, created_at AS createdAt FROM raw_cost_ver ORDER BY effective_from, id"
  );
} catch (e) {
  rawCostVers = [];
}

if (!subsPayload || !Array.isArray(subsPayload.subscriptions)) {
  console.error("NO_LIST_SUBSCRIPTIONS");
  process.exit(1);
}

const all = subsPayload.subscriptions.slice();
const tombsRaw = Array.isArray(tombsPayload.items) ? tombsPayload.items : [];
const tombsAlive = tombsRaw.filter((t) => tombAlive(t, now));
const costs = costsPayload.costs && typeof costsPayload.costs === "object" ? costsPayload.costs : {};
const zeroKeys = costsPayload.zeroKeys && typeof costsPayload.zeroKeys === "object" ? costsPayload.zeroKeys : {};

const ppAll = all.filter((row) => sheetOf(row) === "ПП");
const excluded = [];
const ppLive = [];
for (const row of ppAll) {
  const nick = String(row.nick || "").trim();
  const sid = String(row.subId || row.id || "").trim();
  if (isTestNick(nick) || isTestNick(row.label)) {
    excluded.push({ nick, subId: sid, why: "тест" });
    continue;
  }
  if (isDeletedStatus(row)) {
    excluded.push({ nick, subId: sid, why: "удалён/архив" });
    continue;
  }
  ppLive.push(row);
}

/* 29 = все живые ПП без фильтра tomb (madmazelka входит). Alive-tomb — отдельно в отчёте. */
const active29 = ppLive.slice().sort((a, b) => {
  const na = nickKey(a);
  const nb = nickKey(b);
  if (na < nb) return -1;
  if (na > nb) return 1;
  return String(a.subId || "").localeCompare(String(b.subId || ""));
});

const madmazelka = ppLive.find((r) => String(r.subId || "") === "47" || nickKey(r) === "_madmazelka_") || null;
const madTombHits = tombsRaw
  .filter((t) => {
    const sid = String((t && t.subId) || "").trim();
    const mk = normalizeMk(t.mk || t.nick || "");
    return sid === "47" || mk === "_madmazelka_" || nickKey(t) === "_madmazelka_";
  })
  .map((t) => {
    const ttl = Number(t.ttl) > 0 ? Number(t.ttl) : SUB_DELETE_TOMB_TTL_MS;
    const ageMs = now - (Number(t.at) || 0);
    return {
      nick: t.nick || "",
      mk: t.mk || "",
      sheet: t.sheet || "",
      subId: t.subId || "",
      at: t.at || 0,
      atIso: t.at ? new Date(Number(t.at)).toISOString() : "",
      ttlMs: ttl,
      ttlHours: Math.round((ttl / 3600000) * 100) / 100,
      ageMs,
      ageHours: Math.round((ageMs / 3600000) * 100) / 100,
      aliveNow: tombAlive(t, now),
      wouldExcludeInPrevAudit: true
    };
  });

const initData = signInitData(token, {
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id: OWNER_ID, first_name: OWNER_NAME })
});

const rows = [];
const skuUsed = Object.create(null);

for (let i = 0; i < active29.length; i++) {
  const card = active29[i];
  const nick = String(card.nick || "").trim();
  const coef = parseCoef(card);
  const scheme = parseScheme(card);
  const stated = money(card.statedCost);
  const factSaved = money(card.factCost != null ? card.factCost : card.calcFactCost);
  let calc = {};
  try {
    calc = await calcPrice(initData, card);
  } catch (e) {
    calc = { status: "error", message: String(e && e.message ? e.message : e) };
  }
  const ok = calc && calc.status === "success";
  const correct = ok ? money(calc.factCost != null ? calc.factCost : calc.clientPrice) : null;
  const S = ok ? money(calc.rawCost != null ? calc.rawCost : calc.cost) : null;
  const lines = ok && Array.isArray(calc.lines) ? calc.lines : [];

  (card.basket || []).forEach((it) => {
    const name = String((it && (it.name || it.main)) || "").trim();
    if (!name) return;
    const sub = String((it && it.sub) || "").trim();
    const key = name + (sub ? " / " + sub : "");
    skuUsed[key] = (skuUsed[key] || 0) + 1;
    skuUsed[name] = (skuUsed[name] || 0) + 1;
  });

  const tombHitAlive = tombsAlive.some((t) => {
    const sid = String(t.subId || "").trim();
    const mk = normalizeMk(t.mk || t.nick || "");
    const cardMk = normalizeMk(card.nick || card.label || "");
    const cardSid = String(card.subId || "").trim();
    const sh = String(t.sheet || "").trim().toUpperCase() || "ПП";
    if (sh !== "ПП" && sh !== "PP") return false;
    if (cardSid && sid === cardSid) return true;
    if (cardMk && mk === cardMk) return true;
    return false;
  });

  rows.push({
    nick,
    label: card.label || "",
    subId: String(card.subId || card.id || ""),
    состав: basketFull(card.basket),
    basket: card.basket || [],
    N: card.deliveries != null ? card.deliveries : card.deliveriesN != null ? card.deliveriesN : "",
    пакеты: packStr(card, calc),
    коэффициент: coef != null ? coef : ok && calc.coef != null ? calc.coef : "",
    схема: ok ? String(calc.scheme || scheme) : scheme,
    сырьё_S: S != null ? S : "",
    recover_R: ok ? money(calc.recoverByn) : "",
    доставка: ok ? money(calc.deliveryByn) : "",
    пакеты_P: ok ? money(calc.packagesByn) : "",
    фракции_F: ok ? money(calc.fractionMarkup) : "",
    правильная_round2: correct != null ? correct : "",
    правильная_рубль: correct != null ? roundRub(correct) : "",
    текущая_указанная: stated,
    текущий_факт: factSaved,
    разница: correct != null ? money(stated - correct) : "",
    calc_status: ok ? "ok" : String(calc.message || calc.reason || calc.status || "error"),
    fromD1: !!calc.fromD1,
    tombAliveNow: tombHitAlive,
    lines
  });

  if ((i + 1) % 5 === 0) console.error("calc " + (i + 1) + "/" + active29.length);
}

/* --- п.1 madmazelka --- */
let madCalc = null;
if (madmazelka) {
  try {
    madCalc = await calcPrice(initData, madmazelka);
  } catch (e) {
    madCalc = { status: "error", message: String(e && e.message ? e.message : e) };
  }
}
const madRow = rows.find((r) => r.subId === "47" || nickKey({ nick: r.nick }) === "_madmazelka_");

const point1 = {
  foundInListSubscriptions: !!madmazelka,
  subId: madmazelka ? String(madmazelka.subId || "") : "47",
  nick: madmazelka ? madmazelka.nick : "_madmazelka_",
  sheet: madmazelka ? sheetOf(madmazelka) : "",
  status: madmazelka ? madmazelka.status || madmazelka.stage || madmazelka.ppStatus || "" : "",
  statedCost: madmazelka ? money(madmazelka.statedCost) : null,
  factCost: madmazelka ? money(madmazelka.factCost != null ? madmazelka.factCost : madmazelka.calcFactCost) : null,
  coef: madmazelka ? parseCoef(madmazelka) : null,
  scheme: madmazelka ? parseScheme(madmazelka) : null,
  basket: madmazelka ? madmazelka.basket : null,
  deliveries: madmazelka ? madmazelka.deliveries : null,
  packCounts: madmazelka ? madmazelka.packCounts : null,
  tombHitsRaw: madTombHits,
  tombAliveNow: madTombHits.some((t) => t.aliveNow),
  prevAuditExcludedBecause: "фильтр без TTL: любой item в subDeleteTombstones",
  workerListFilter: "listSubDeleteTombstones_ оставляет только alive (TTL default 15м, иначе it.ttl)",
  impact:
    madTombHits.some((t) => t.aliveNow)
      ? "Живое надгробие: worker listSubscriptions/UI скрывает карточку; в D1 snap она есть"
      : "Надгробие протухло (или custom ttl истёк): worker НЕ скрывает; прошлый audit ошибочно исключил без TTL",
  tombNotRemoved: true,
  calcPrice: madCalc
    ? {
        status: madCalc.status,
        fromD1: !!madCalc.fromD1,
        scheme: madCalc.scheme,
        coef: madCalc.coef,
        rawCost: money(madCalc.rawCost != null ? madCalc.rawCost : madCalc.cost),
        recoverByn: money(madCalc.recoverByn),
        deliveryByn: money(madCalc.deliveryByn),
        packagesByn: money(madCalc.packagesByn),
        fractionMarkup: money(madCalc.fractionMarkup),
        factCost: money(madCalc.factCost),
        factRound2: money(madCalc.factCost),
        factRub: roundRub(madCalc.factCost),
        lines: madCalc.lines || []
      }
    : null,
  inCsv29: !!madRow
};

/* --- п.2 costs + indix lines --- */
const costKeysRelevant = Object.keys(costs)
  .filter((k) => skuUsed[k] || Object.keys(skuUsed).some((u) => skuNorm(k).includes(skuNorm(u.split(" / ")[0]))))
  .sort();

const costsDump = costKeysRelevant.map((k) => {
  const row = costs[k] || {};
  const unit = Number(row.unitPrice != null ? row.unitPrice : row.per100);
  const base = String(row.name || k.split(" / ")[0] || "").trim();
  return {
    key: k,
    name: row.name || "",
    sub: row.sub || "",
    unit: isFinite(unit) ? unit : null,
    piece: !!row.piece,
    builtin: RAW_COST_BUILTIN[skuNorm(base)] != null ? RAW_COST_BUILTIN[skuNorm(base)] : RAW_COST_BUILTIN[base] || null,
    zeroKey: !!zeroKeys[k],
    usedInBaskets: skuUsed[k] || 0
  };
});

const indix = rows.find((r) => nickKey({ nick: r.nick }) === "indixvost");
const indixLines = [];
let S_live = 0;
let S_exp = 0;
let S_builtin = 0;
if (indix) {
  const basket = indix.basket || [];
  const calcLines = Array.isArray(indix.lines) ? indix.lines : [];
  for (const it of basket) {
    const name = String((it && (it.name || it.main)) || "").trim();
    const sub = String((it && it.sub) || "").trim();
    const val = Number(it && (it.val != null ? it.val : it.value)) || 0;
    if (!name || val <= 0) continue;
    const fromCache = unitFromCosts(costs, name, sub);
    const calcL = calcLines.find(
      (L) =>
        skuNorm(L.name || L.main) === skuNorm(name) &&
        (!sub || skuNorm(L.sub || "") === skuNorm(sub) || !String(L.sub || "").trim())
    );
    const calcUnit = calcL
      ? Number(calcL.unitPrice != null ? calcL.unitPrice : calcL.per100)
      : null;
    const piece =
      (calcL && !!calcL.piece) ||
      fromCache.piece ||
      /шт/i.test(name) ||
      /ухо|корень|трахе|жил|аорт/i.test(name);
    const liveUnit =
      calcUnit != null && isFinite(calcUnit) && calcUnit > 0
        ? calcUnit
        : fromCache.unit != null && fromCache.unit > 0
          ? fromCache.unit
          : RAW_COST_BUILTIN[name] || null;
    const builtinUnit = RAW_COST_BUILTIN[name] != null ? RAW_COST_BUILTIN[name] : null;
    const expectedUnit = INDIX_EXPECTED_UNIT[name] != null ? INDIX_EXPECTED_UNIT[name] : liveUnit;
    const lineLive = piece ? liveUnit * val : (liveUnit * val) / 100;
    const lineExp = piece ? expectedUnit * val : (expectedUnit * val) / 100;
    const lineBuiltin = builtinUnit != null ? (piece ? builtinUnit * val : (builtinUnit * val) / 100) : null;
    S_live += lineLive || 0;
    S_exp += lineExp || 0;
    if (lineBuiltin != null) S_builtin += lineBuiltin;
    const vers = rawCostVers.filter((v) => skuNorm(v.sku) === skuNorm(name));
    indixLines.push({
      name,
      sub,
      qty: val,
      unitKind: piece ? "шт" : "г (за 100г)",
      d1CacheKey: fromCache.key,
      d1CacheUnit: fromCache.unit,
      d1CacheSource: fromCache.source,
      calcLineUnit: calcUnit,
      calcLineCost: calcL ? money(calcL.cost != null ? calcL.cost : calcL.lineCost) : null,
      builtinUnit,
      expectedUnit,
      lineLive: money(lineLive),
      lineBuiltin: lineBuiltin != null ? money(lineBuiltin) : null,
      lineExpected: money(lineExp),
      deltaVsExpected: money((lineExp || 0) - (lineLive || 0)),
      raw_cost_ver: vers
    });
  }
}

const point2 = {
  priceCostsPpMeta: meta.find((m) => m.cache_key === "priceCostsPp") || null,
  priceCostsPpCanon: costsPayload.ppCostCanon || null,
  priceCostsPpUpdatedHint: costsPayload.updatedAt || null,
  raw_cost_ver_count: rawCostVers.length,
  raw_cost_ver_sample: rawCostVers.slice(0, 50),
  costsForUsedSkus: costsDump,
  indix: indix
    ? {
        nick: indix.nick,
        subId: indix.subId,
        calcRawS: indix.сырьё_S,
        stated: indix.текущая_указанная,
        factSaved: indix.текущий_факт,
        correctRound2: indix.правильная_round2,
        correctRub: indix.правильная_рубль,
        coef: indix.коэффициент,
        packages: indix.пакеты,
        N: indix.N,
        lines: indixLines,
        S_sumLiveLines: money(S_live),
        S_sumBuiltin: money(S_builtin),
        S_sumExpectedOwner: money(S_exp),
        gapExpectedMinusLive: money(S_exp - S_live),
        note:
          "Gap 13.00 = корень (1.91→3.83)×6 = +11.52 + жила (0.38→0.75)×4 = +1.48. Лёгкое/ухо/трахея совпадают. Live S совпадает с builtin RAW_COST_BUILTIN_, не с «ожидаемыми» 3.83/0.75.",
        expectedAtCoef26:
          "S=42.51 → fact≈166.63 @2.6 (как в карточке после live raw); S=29.51 → fact≈132.83 @2.6"
      }
    : null
};

/* --- CSV 29 --- */
const header = [
  "ник",
  "subId",
  "полный состав (позиция / фракция × кол-во)",
  "N доставок",
  "пакеты",
  "сохранённый coef",
  "схема",
  "правильная цена round2",
  "правильная до рубля",
  "указанная",
  "факт",
  "сырьё S",
  "tombAliveNow"
];
const csvLines = [header.join(",")];
for (const r of rows) {
  csvLines.push(
    [
      r.nick,
      r.subId,
      r.состав,
      r.N,
      r.пакеты,
      r.коэффициент,
      r.схема,
      r.правильная_round2,
      r.правильная_рубль,
      r.текущая_указанная,
      r.текущий_факт,
      r.сырьё_S,
      r.tombAliveNow ? "1" : "0"
    ]
      .map(csvEscape)
      .join(",")
  );
}
writeFileSync(join(outDir, "pp-real-29.csv"), csvLines.join("\n") + "\n");

const report = {
  at: new Date().toISOString(),
  wrote: false,
  point3: "cancelled",
  snapMeta: meta,
  counts: {
    sheetPp: ppAll.length,
    active29: active29.length,
    excluded: excluded.length,
    tombsRaw: tombsRaw.length,
    tombsAliveNow: tombsAlive.length
  },
  excluded,
  point1_madmazelka: point1,
  point2_costs_indix: point2,
  rows29: rows.map((r) => ({
    nick: r.nick,
    subId: r.subId,
    состав: r.состав,
    N: r.N,
    пакеты: r.пакеты,
    коэффициент: r.коэффициент,
    схема: r.схема,
    правильная_round2: r.правильная_round2,
    правильная_рубль: r.правильная_рубль,
    указанная: r.текущая_указанная,
    факт: r.текущий_факт,
    сырьё_S: r.сырьё_S,
    tombAliveNow: r.tombAliveNow,
    calc_status: r.calc_status,
    fromD1: r.fromD1
  }))
};
writeFileSync(join(outDir, "pp-audit-cont.json"), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      active29: active29.length,
      madmazelka: !!madmazelka,
      madTombAlive: point1.tombAliveNow,
      indixS: point2.indix && point2.indix.calcRawS,
      indixGap: point2.indix && point2.indix.gapExpectedMinusLive,
      csv: join(outDir, "pp-real-29.csv")
    },
    null,
    2
  )
);
