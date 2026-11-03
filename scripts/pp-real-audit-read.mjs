/**
 * ТОЛЬКО ЧТЕНИЕ. D1 listSubscriptions + живой calcPrice (worker).
 * Ничего не пишет в D1/Sheets. CSV → artifacts.
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const proxy = join(root, "..", "boinya-c", "proxy");
const outDir = process.env.PP_AUDIT_OUT || join(root, "..", "artifacts", "pp-real-audit");
const WORKER = "https://boinya-c.konchaarsenia.workers.dev/";
const OWNER_ID = Number(process.env.PP_AUDIT_TG_ID || "650923866");
const OWNER_NAME = process.env.PP_AUDIT_TG_NAME || "Арсений";

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

function money(n) {
  const x = Math.round(Number(n) * 100) / 100;
  return isFinite(x) ? x : 0;
}

function roundRub(n) {
  return Math.round(Number(n) || 0);
}

function basketShort(basket) {
  return (basket || [])
    .map((it) => {
      const name = String((it && (it.name || it.main)) || "").trim();
      const sub = String((it && it.sub) || "").trim();
      const val = Number(it && (it.val != null ? it.val : it.value)) || 0;
      if (!name || val <= 0) return "";
      return name + (sub ? "/" + sub : "") + "×" + val;
    })
    .filter(Boolean)
    .join("; ");
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
  const json = await res.json().catch(() => ({ status: "error", message: "non_json" }));
  return json;
}

function invertCoefForPrice(stated, factParts) {
  /* Какому M соответствует указанная при том же S,R,N,P,F (без капа): P = S*M + R + D + P + F */
  const S = Number(factParts.rawCost) || 0;
  const R = Number(factParts.recoverByn) || 0;
  const D = Number(factParts.deliveryByn) || 0;
  const P = Number(factParts.packagesByn) || 0;
  const F = Number(factParts.fractionMarkup) || 0;
  const st = Number(stated) || 0;
  if (!(S > 0) || !(st > 0)) return null;
  const m = (st - R - D - P - F) / S;
  if (!isFinite(m) || m <= 0) return null;
  return Math.round(m * 1000) / 1000;
}

function reasonForDiff(card, calc, stated, factSaved, coef) {
  const diff = Math.abs(Number(stated) - Number(calc.factCost));
  if (!(diff > 1)) return "";
  if (!(Number(stated) > 0)) return "ноль или пустота";
  if (calc.missingLines) return "неизвестная позиция: " + calc.missingLines;
  if (String(calc.scheme || "") === "LEGACY" && parseScheme(card) === "LEGACY") {
    return "LEGACY-формула";
  }
  const implied = invertCoefForPrice(stated, calc);
  if (implied != null && Math.abs(implied - Number(coef || 0)) > 0.05) {
    return "цена заморожена обращением (соответствует ~coef " + implied + ")";
  }
  if (implied != null && Math.abs(implied - Number(coef || 0)) <= 0.05) {
    return "старая себестоимость (тот же coef, другое сырьё/состав)";
  }
  if (card.statedTouched === true || card.statedTouched === "1" || card.statedTouched === 1) {
    return "ручная цена";
  }
  return "старая себестоимость или ручная цена";
}

mkdirSync(outDir, { recursive: true });

const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
if (!token) {
  console.error("NO_TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

const meta = d1(
  "SELECT cache_key, updated_at, length(payload) AS n FROM snap_cache WHERE cache_key IN ('listSubscriptions','subDeleteTombstones','priceCostsPp','retailPrices')"
);
const subsPayload = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'"));
const tombsPayload = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'subDeleteTombstones'")) || { items: [] };
if (!subsPayload || !Array.isArray(subsPayload.subscriptions)) {
  console.error("NO_LIST_SUBSCRIPTIONS");
  process.exit(1);
}

const all = subsPayload.subscriptions.slice();
const tombs = Array.isArray(tombsPayload.items) ? tombsPayload.items : [];
const tombKeys = new Set(
  tombs.map((t) => {
    const nick = nickKey(t);
    const sid = String((t && (t.subId || t.id)) || "").trim();
    return nick + "|" + sid;
  })
);

const bySheet = { ПП: [], АФК: [], БП: [], other: [] };
for (const row of all) {
  const sh = sheetOf(row);
  if (sh === "ПП") bySheet["ПП"].push(row);
  else if (sh === "АФК") bySheet["АФК"].push(row);
  else if (sh === "БП") bySheet["БП"].push(row);
  else bySheet.other.push(row);
}

const excluded = [];
const ppCandidates = [];
for (const row of bySheet["ПП"]) {
  const nick = String(row.nick || "").trim();
  const sid = String(row.subId || row.id || "").trim();
  const key = nickKey(row) + "|" + sid;
  if (isTestNick(nick) || isTestNick(row.label)) {
    excluded.push({ nick, subId: sid, sheet: "ПП", why: "тест" });
    continue;
  }
  if (isDeletedStatus(row)) {
    excluded.push({ nick, subId: sid, sheet: "ПП", why: "удалённая/архив status=" + (row.status || row.stage || "") });
    continue;
  }
  if (tombKeys.has(key) || tombKeys.has(nickKey(row) + "|")) {
    excluded.push({ nick, subId: sid, sheet: "ПП", why: "надгробие subDeleteTombstones" });
    continue;
  }
  ppCandidates.push(row);
}

/* Дубли по нику внутри ПП */
const nickCount = Object.create(null);
for (const row of ppCandidates) {
  const k = nickKey(row) || String(row.subId || "");
  nickCount[k] = (nickCount[k] || 0) + 1;
}
const dupNicks = Object.keys(nickCount).filter((k) => nickCount[k] > 1);
const duplicates = ppCandidates.filter((row) => dupNicks.includes(nickKey(row) || String(row.subId || "")));
const active = ppCandidates.filter((row) => !dupNicks.includes(nickKey(row) || String(row.subId || "")));
/* если дубли — в active оставим все? User asked: without duplicates, list duplicates separately.
   Keep one? Or exclude all dups from active? Safer: exclude all members of dup groups from "active unique", list them in duplicates. */
const activeUnique = ppCandidates.filter((row) => {
  const k = nickKey(row) || String(row.subId || "");
  return nickCount[k] === 1;
});

const initData = signInitData(token, {
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id: OWNER_ID, first_name: OWNER_NAME })
});

const rows = [];
const coefMismatch = [];
const bigDiff = [];

for (let i = 0; i < activeUnique.length; i++) {
  const card = activeUnique[i];
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
  const R = ok ? money(calc.recoverByn) : null;
  const D = ok ? money(calc.deliveryByn) : null;
  const P = ok ? money(calc.packagesByn) : null;
  const F = ok ? money(calc.fractionMarkup) : null;
  const B = ok ? money(calc.retailGoods != null ? calc.retailGoods : calc.retailCapBase) : null;
  const cap = ok ? money(calc.retailCapAt) : null;
  const usedCoef = ok ? money(calc.coef != null ? calc.coef : coef) : coef;
  const usedScheme = ok ? String(calc.scheme || scheme) : scheme;
  const diff = correct != null ? money(stated - correct) : null;
  const reason =
    correct != null && Math.abs(diff) > 1
      ? reasonForDiff(
          card,
          {
            rawCost: S,
            recoverByn: R,
            deliveryByn: D,
            packagesByn: P,
            fractionMarkup: F,
            scheme: usedScheme,
            factCost: correct,
            missingLines: Array.isArray(calc.lines)
              ? calc.lines.filter((L) => !(Number(L.unitPrice || L.per100) > 0) && !L.knownZero).map((L) => L.name).join(",")
              : ""
          },
          stated,
          factSaved,
          usedCoef
        )
      : "";

  if (correct != null && Math.abs(diff) > 1) {
    bigDiff.push({ nick, stated, correct, coef: usedCoef, reason });
  }

  /* сохранённая цена не соответствует сохранённому коэффициенту:
     при том же S live quote(coef) сильно ≠ stated */
  if (ok && coef != null && Number(stated) > 0 && Math.abs(stated - correct) > 1) {
    coefMismatch.push({
      nick,
      coef,
      stated,
      correctAtSavedCoef: correct,
      impliedCoef: invertCoefForPrice(stated, {
        rawCost: S,
        recoverByn: R,
        deliveryByn: D,
        packagesByn: P,
        fractionMarkup: F
      })
    });
  }

  rows.push({
    nick,
    label: card.label || "",
    subId: card.subId || "",
    состав: basketShort(card.basket),
    N: card.deliveries != null ? card.deliveries : "",
    пакеты: card.packCounts
      ? "u1=" + (card.packCounts.u1 || 0) + ";u2=" + (card.packCounts.u2 || 0) + ";u3=" + (card.packCounts.u3 || 0) + ";up4=" + (card.packCounts.up4 || 0)
      : ok && calc.packCounts
        ? "u1=" + (calc.packCounts.u1 || 0) + ";u2=" + (calc.packCounts.u2 || 0) + ";u3=" + (calc.packCounts.u3 || 0) + ";up4=" + (calc.packCounts.up4 || 0)
        : "",
    коэффициент: usedCoef != null ? usedCoef : "",
    сырьё_S: S != null ? S : "",
    recover_R: R != null ? R : "",
    доставка: D != null ? D : "",
    пакеты_P: P != null ? P : "",
    фракции_F: F != null ? F : "",
    розница_B: B != null ? B : "",
    кап_0_92B: cap != null ? cap : "",
    правильная_round2: correct != null ? correct : "",
    правильная_рубль: correct != null ? roundRub(correct) : "",
    текущая_указанная: stated,
    текущий_факт: factSaved,
    разница: diff != null ? diff : "",
    схема: usedScheme,
    причина: reason,
    calc_status: ok ? "ok" : String(calc.message || calc.reason || calc.status || "error"),
    fromD1: !!calc.fromD1
  });

  if ((i + 1) % 5 === 0) {
    console.error("calc " + (i + 1) + "/" + activeUnique.length);
  }
}

const header = [
  "ник",
  "состав коротко",
  "N доставок",
  "пакеты",
  "коэффициент",
  "сырьё S",
  "recover R",
  "доставка",
  "пакеты P",
  "фракции F",
  "розница B",
  "кап 0.92B",
  "правильная цена round2",
  "правильная до рубля",
  "текущая указанная",
  "текущий факт",
  "разница",
  "RAW26 или LEGACY",
  "причина если |diff|>1"
];

const csvLines = [header.join(",")];
for (const r of rows) {
  csvLines.push(
    [
      r.nick,
      r.состав,
      r.N,
      r.пакеты,
      r.коэффициент,
      r.сырьё_S,
      r.recover_R,
      r.доставка,
      r.пакеты_P,
      r.фракции_F,
      r.розница_B,
      r.кап_0_92B,
      r.правильная_round2,
      r.правильная_рубль,
      r.текущая_указанная,
      r.текущий_факт,
      r.разница,
      r.схема,
      r.причина
    ]
      .map(csvEscape)
      .join(",")
  );
}

writeFileSync(join(outDir, "pp-real-audit.csv"), csvLines.join("\n") + "\n");
const report = {
  at: new Date().toISOString(),
  source: "D1 snap_cache.listSubscriptions (boinya-c)",
  wrote: false,
  snapMeta: meta,
  counts: {
    allSubs: all.length,
    sheetPp: bySheet["ПП"].length,
    sheetAfk: bySheet["АФК"].length,
    sheetBp: bySheet["БП"].length,
    activeUniquePp: activeUnique.length,
    duplicatesPp: duplicates.length,
    excludedPp: excluded.length,
    tombs: tombs.length,
    bigDiff: bigDiff.length,
    coefMismatch: coefMismatch.length
  },
  excluded,
  duplicates: duplicates.map((r) => ({
    nick: r.nick,
    subId: r.subId,
    status: r.status || r.stage || "",
    statedCost: r.statedCost,
    coef: parseCoef(r)
  })),
  otherSheetsSample: {
    afkNicks: bySheet["АФК"].slice(0, 50).map((r) => r.nick),
    bpNicks: bySheet["БП"].slice(0, 50).map((r) => r.nick)
  },
  bigDiff,
  coefMismatch,
  rows
};
writeFileSync(join(outDir, "pp-real-audit.json"), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      activeUniquePp: activeUnique.length,
      duplicatesPp: duplicates.length,
      excludedPp: excluded.length,
      bigDiff: bigDiff.length,
      coefMismatch: coefMismatch.length,
      csv: join(outDir, "pp-real-audit.csv")
    },
    null,
    2
  )
);
