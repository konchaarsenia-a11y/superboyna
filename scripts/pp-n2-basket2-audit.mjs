/**
 * t444u RO: ПП N=2 с полным basket и пустым basket2.
 * Только чтение D1 (snap listSubscriptions + сверка subs.n). Ничего не пишет.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyPpCardForN2Split_,
  parsePpDeliveriesN_,
  ppCloneBasket_
} from "../boinya-c/proxy/pp-per-delivery.js";

const root = dirname(fileURLToPath(import.meta.url));
const proxy = join(root, "..", "boinya-c", "proxy");
const outDir = process.env.PP_N2_AUDIT_OUT || join(root, "..", "artifacts", "pp-n2-basket2-audit");

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

function sheetOf(row) {
  const s = String((row && (row.sheet || row.segment)) || "")
    .trim()
    .toUpperCase();
  if (s === "PP" || s === "ПП") return "ПП";
  return s;
}

function qtyMap(list) {
  const m = Object.create(null);
  ppCloneBasket_(list).forEach(function (it) {
    const k = String(it.cat || "") + "|" + String(it.main || "") + "|" + String(it.sub || "");
    m[k] = (m[k] || 0) + (Number(it.value) || 0);
  });
  return m;
}

mkdirSync(outDir, { recursive: true });

const snapMeta = d1(
  "SELECT cache_key, updated_at, length(payload) AS n FROM snap_cache WHERE cache_key = 'listSubscriptions'"
);

const rawRows = d1(
  "SELECT j.value AS json FROM snap_cache, json_each(snap_cache.payload, '$.subscriptions') AS j " +
    "WHERE cache_key = 'listSubscriptions'"
);

const cards = [];
for (let i = 0; i < rawRows.length; i++) {
  let row;
  try {
    row = typeof rawRows[i].json === "string" ? JSON.parse(rawRows[i].json) : rawRows[i].json;
  } catch (e) {
    continue;
  }
  if (!row || typeof row !== "object") continue;
  if (sheetOf(row) !== "ПП") continue;
  cards.push(row);
}

const subsN = d1(
  "SELECT id, nick, label, sheet, n, length(basket_json) AS basket_len, " +
    "json_array_length(basket_json) AS basket_n, status FROM subs " +
    "WHERE lower(sheet) IN ('pp','пп') AND status != 'deleted'"
);

const bySubId = Object.create(null);
subsN.forEach(function (s) {
  bySubId[String(s.id || "")] = s;
});

const migrate = [];
const already = [];
const skipN1 = [];
const ambiguous = [];
const other = [];

cards.forEach(function (row) {
  const cls = classifyPpCardForN2Split_(row);
  const brief = {
    nick: row.nick || "",
    label: row.label || "",
    subId: row.subId || "",
    deliveries: row.deliveries,
    deliveriesN: parsePpDeliveriesN_(row.deliveries),
    basketN: ppCloneBasket_(row.basket).length,
    basket2N: ppCloneBasket_(row.basket2).length,
    statedCost: row.statedCost != null ? row.statedCost : row.factCost,
    kind: cls.kind,
    reason: cls.reason || "",
    subsN: bySubId[String(row.subId || "")] ? bySubId[String(row.subId || "")].n : null
  };
  if (cls.kind === "migrate") {
    brief.beforeSample = qtyMap(cls.before);
    brief.after1 = qtyMap(cls.delivery1);
    brief.after2 = qtyMap(cls.delivery2);
    migrate.push(brief);
  } else if (cls.kind === "already") already.push(brief);
  else if (cls.kind === "skip_n1") skipN1.push(brief);
  else if (cls.kind === "ambiguous") ambiguous.push(Object.assign(brief, { detail: cls.detail || null }));
  else other.push(brief);
});

const report = {
  status: "success",
  mode: "read-only",
  marker: "pp-n2-basket2-audit-t444u",
  snap: snapMeta[0] || null,
  totals: {
    ppCards: cards.length,
    migrate: migrate.length,
    already: already.length,
    skipN1: skipN1.length,
    ambiguous: ambiguous.length,
    other: other.length,
    subsPp: subsN.length
  },
  migrate: migrate,
  already: already,
  skipN1: skipN1.slice(0, 30),
  ambiguous: ambiguous,
  other: other,
  sources: {
    canonCard: "snap_cache.listSubscriptions.subscriptions[] (D1 detail, basket+basket2)",
    uiSave: "saveSubscription → upsertSubscription_ (basket / basket2)",
    suggest: "getPpOrderSuggest → resolvePpPerDeliverySuggest_ (после split: ПП1=basket, ПП2=basket2)",
    staffSplit: "splitQtyForPpSlot_ / splitMonthlyBasketToTwoDeliveries_ (карточки/proposePpSlotBasket_)",
    subsTable: "subs.n + basket_json (=delivery1 only; no basket2 column)"
  },
  note:
    ambiguous.length
      ? "Есть неоднозначные — миграция этих строк стоп до разбора"
      : "Неоднозначных нет; migrate = кандидаты на штатный split"
};

writeFileSync(join(outDir, "audit.json"), JSON.stringify(report, null, 2), "utf8");
writeFileSync(
  join(outDir, "migrate-nicks.txt"),
  migrate.map(function (m) {
    return m.nick + "\t" + m.subId + "\t" + m.basketN;
  }).join("\n") + (migrate.length ? "\n" : ""),
  "utf8"
);

console.log(JSON.stringify(report.totals, null, 2));
if (ambiguous.length) {
  console.log("AMBIGUOUS " + ambiguous.length);
  ambiguous.slice(0, 20).forEach(function (a) {
    console.log(" - " + a.nick + " sub=" + a.subId + " reason=" + a.reason);
  });
}
console.log("MIGRATE " + migrate.length);
migrate.forEach(function (m) {
  console.log(" - " + m.nick + " sub=" + m.subId + " basketN=" + m.basketN);
});
