/**
 * t444u/t445u RO: ПП N=2 с полным basket и пустым basket2.
 * Только чтение D1. Полные составы before→delivery1/2 для штатного UI save.
 * Ничего не пишет.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyPpCardForN2Split_,
  parsePpDeliveriesN_,
  ppCloneBasket_,
  ppBasketItemKey_
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
    const k = ppBasketItemKey_(it);
    m[k] = (m[k] || 0) + (Number(it.value) || 0);
  });
  return m;
}

function basketFinger(list) {
  return ppCloneBasket_(list)
    .map(function (it) {
      return ppBasketItemKey_(it) + "=" + (Number(it.value) || 0);
    })
    .sort()
    .join(";");
}

function slimItem(it) {
  return {
    cat: it.cat || "",
    main: it.main || it.name || "",
    name: it.name || it.main || "",
    sub: it.sub || "",
    value: Number(it.value) || 0,
    val: Number(it.value) || 0,
    key: ppBasketItemKey_(it)
  };
}

function identityKey(row) {
  const subId = String((row && row.subId) || "").trim();
  const nick = String((row && row.nick) || "")
    .trim()
    .toUpperCase();
  const label = String((row && row.label) || "")
    .trim()
    .toUpperCase();
  return {
    identityKey: subId ? "sub:" + subId : "nick:" + nick,
    subId: subId,
    nick: row.nick || "",
    label: row.label || "",
    matchHint: subId
      ? "open by subId " + subId + " (nick " + (row.nick || "") + ")"
      : "no subId — open by nick «" + (row.nick || label) + "»"
  };
}

mkdirSync(outDir, { recursive: true });

const auditedAt = new Date().toISOString();
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
    "json_array_length(basket_json) AS basket_n, status, price FROM subs " +
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
const ownerChanged = [];

cards.forEach(function (row) {
  const cls = classifyPpCardForN2Split_(row);
  const id = identityKey(row);
  const subMeta = bySubId[String(row.subId || "")] || null;
  const brief = {
    ...id,
    sheet: "ПП",
    deliveries: row.deliveries,
    deliveriesN: parsePpDeliveriesN_(row.deliveries),
    basketN: ppCloneBasket_(row.basket).length,
    basket2N: ppCloneBasket_(row.basket2).length,
    basketFinger: basketFinger(row.basket),
    basket2Finger: basketFinger(row.basket2),
    statedCost: row.statedCost != null ? row.statedCost : null,
    factCost: row.factCost != null ? row.factCost : null,
    calcFactCost: row.calcFactCost != null ? row.calcFactCost : null,
    address: row.address || "",
    phone: row.phone || "",
    wishes: row.wishes || "",
    _savedAt: row._savedAt || null,
    _d1Detail: row._d1Detail != null ? row._d1Detail : null,
    kind: cls.kind,
    reason: cls.reason || "",
    subs: subMeta
      ? { id: subMeta.id, n: subMeta.n, price: subMeta.price, basket_n: subMeta.basket_n }
      : null
  };
  if (cls.kind === "migrate") {
    brief.before = (cls.before || []).map(slimItem);
    brief.delivery1 = (cls.delivery1 || []).map(slimItem);
    brief.delivery2 = (cls.delivery2 || []).map(slimItem);
    brief.beforeQty = qtyMap(cls.before);
    brief.delivery1Qty = qtyMap(cls.delivery1);
    brief.delivery2Qty = qtyMap(cls.delivery2);
    brief.uiSteps = [
      "Клиенты → ПП → открыть " + id.matchHint,
      "Проверить N доставок = 2 и цену " + String(brief.statedCost != null ? brief.statedCost : brief.factCost),
      "Слот «Доставка 1»: заменить состав на delivery1 (не меняя N/цену)",
      "Слот «Доставка 2»: выставить delivery2",
      "Сохранить (saveSubscription). Сверить 1+2 = before по key/value"
    ];
    migrate.push(brief);
  } else if (cls.kind === "already") {
    brief.before = ppCloneBasket_(row.basket).map(slimItem);
    brief.delivery2Live = ppCloneBasket_(row.basket2).map(slimItem);
    already.push(brief);
  } else if (cls.kind === "skip_n1") skipN1.push(brief);
  else if (cls.kind === "ambiguous") ambiguous.push(Object.assign(brief, { detail: cls.detail || null }));
  else other.push(brief);
});

// Сверка с прошлым audit: кто из целевых уже изменён владельцем.
let prior = null;
const priorCandidates = [
  process.env.PP_N2_PRIOR_AUDIT,
  join(root, "pp-n2-audit-prior-fingerprints.json"),
  join(outDir, "audit.prior.json"),
  join(outDir, "audit.json")
].filter(Boolean);
for (let pi = 0; pi < priorCandidates.length; pi++) {
  try {
    if (existsSync(priorCandidates[pi])) {
      prior = JSON.parse(readFileSync(priorCandidates[pi], "utf8"));
      break;
    }
  } catch (ePrior) {}
}

function normQtyMap(sample) {
  const out = Object.create(null);
  Object.keys(sample || {}).forEach(function (k) {
    const parts = String(k).split("|");
    const nk =
      String(parts[0] || "").toLowerCase() +
      "|" +
      String(parts[1] || "").toUpperCase() +
      "|" +
      String(parts[2] || "").toUpperCase();
    out[nk] = (out[nk] || 0) + (Number(sample[k]) || 0);
  });
  return out;
}

function qtyMapsEqual(a, b) {
  const na = normQtyMap(a);
  const nb = normQtyMap(b);
  const keys = Object.keys(na);
  if (keys.length !== Object.keys(nb).length) return false;
  for (let i = 0; i < keys.length; i++) {
    if (na[keys[i]] !== nb[keys[i]]) return false;
  }
  return true;
}

const priorMigrate = (prior && prior.migrate) || [];
const priorByKey = Object.create(null);
priorMigrate.forEach(function (m) {
  const k = m.identityKey || (m.subId ? "sub:" + m.subId : "nick:" + String(m.nick || "").toUpperCase());
  priorByKey[k] = m;
});

const stillMigrate = [];
const goneFromMigrate = [];
migrate.forEach(function (m) {
  const prev = priorByKey[m.identityKey];
  if (!prev) {
    m.freshness = "new_or_no_prior";
    stillMigrate.push(m);
    return;
  }
  const prevQty = prev.beforeQty || prev.beforeSample || null;
  const same =
    (prev.basketFinger && prev.basketFinger === m.basketFinger) ||
    (prevQty && qtyMapsEqual(prevQty, m.beforeQty));
  if (!same) {
    m.freshness = "owner_changed_basket";
    m.priorBasketFinger = prev.basketFinger || "";
    ownerChanged.push({
      identityKey: m.identityKey,
      nick: m.nick,
      subId: m.subId,
      priorFinger: prev.basketFinger || "",
      liveFinger: m.basketFinger,
      action: "do_not_overwrite — пересчитать split от live или пропустить"
    });
    stillMigrate.push(m);
  } else {
    m.freshness = "unchanged_since_prior";
    stillMigrate.push(m);
  }
});

priorMigrate.forEach(function (p) {
  const k = p.identityKey || (p.subId ? "sub:" + p.subId : "nick:" + String(p.nick || "").toUpperCase());
  const still = migrate.some(function (m) {
    return m.identityKey === k;
  });
  if (!still) {
    goneFromMigrate.push({
      identityKey: k,
      nick: p.nick,
      subId: p.subId,
      action: "больше не кандидат (уже basket2 / N изменился) — не перезаписывать"
    });
  }
});

const report = {
  status: "success",
  mode: "read-only",
  marker: "pp-n2-basket2-audit-t445u",
  auditedAt: auditedAt,
  hold: "NO merge/deploy per-delivery until these 8 split via staff saveSubscription",
  noAdminEndpoint: true,
  snap: snapMeta[0] || null,
  priorAuditAt: (prior && (prior.auditedAt || prior.snap)) || null,
  totals: {
    ppCards: cards.length,
    migrate: migrate.length,
    already: already.length,
    skipN1: skipN1.length,
    ambiguous: ambiguous.length,
    other: other.length,
    subsPp: subsN.length,
    ownerChanged: ownerChanged.length,
    goneFromMigrate: goneFromMigrate.length
  },
  migrate: stillMigrate,
  already: already,
  skipN1: skipN1,
  ambiguous: ambiguous,
  other: other,
  ownerChanged: ownerChanged,
  goneFromMigrate: goneFromMigrate,
  sources: {
    canonCard: "snap_cache.listSubscriptions.subscriptions[] (D1 detail, basket+basket2)",
    uiSave: "Mini App Клиенты→карточка→saveSubscription (auth initData)",
    suggestAfter: "getPpOrderSuggest → resolvePpPerDeliverySuggest_ (ПП1=basket, ПП2=basket2)",
    staffSplit: "splitQtyForPpSlot_ (dressura floor, chew ceil) — как proposePpSlotBasket_",
    subsTable: "subs.n + basket_json (=delivery1 only; no basket2 column)"
  },
  staffUiPath: {
    screen: "Клиенты → сегмент ПП → карточка",
    slots: "Доставка 1 / Доставка 2",
    saveAction: "cl-save → saveSubscription",
    doNotChange: ["deliveries/N", "statedCost/factCost", "address", "phone", "orders/history"]
  },
  note:
    ambiguous.length
      ? "Есть неоднозначные — стоп"
      : "ambiguous=0; migrate[] = полный before/delivery1/delivery2 для UI"
};

writeFileSync(join(outDir, "audit.json"), JSON.stringify(report, null, 2), "utf8");
writeFileSync(
  join(outDir, "audit.full.json"),
  JSON.stringify(report, null, 2),
  "utf8"
);
writeFileSync(
  join(outDir, "migrate-ui-pack.json"),
  JSON.stringify(
    {
      auditedAt: auditedAt,
      count: stillMigrate.length,
      cards: stillMigrate.map(function (m) {
        return {
          identityKey: m.identityKey,
          nick: m.nick,
          label: m.label,
          subId: m.subId,
          matchHint: m.matchHint,
          deliveries: m.deliveries,
          statedCost: m.statedCost,
          factCost: m.factCost,
          basketFinger: m.basketFinger,
          freshness: m.freshness,
          before: m.before,
          delivery1: m.delivery1,
          delivery2: m.delivery2,
          beforeQty: m.beforeQty,
          delivery1Qty: m.delivery1Qty,
          delivery2Qty: m.delivery2Qty,
          uiSteps: m.uiSteps
        };
      }),
      ownerChanged: ownerChanged,
      goneFromMigrate: goneFromMigrate
    },
    null,
    2
  ),
  "utf8"
);
writeFileSync(
  join(outDir, "migrate-nicks.txt"),
  stillMigrate
    .map(function (m) {
      return [m.identityKey, m.nick, m.subId, m.basketN, m.freshness, m.statedCost].join("\t");
    })
    .join("\n") + (stillMigrate.length ? "\n" : ""),
  "utf8"
);

console.log(JSON.stringify(report.totals, null, 2));
console.log("auditedAt " + auditedAt);
console.log("MIGRATE " + stillMigrate.length);
stillMigrate.forEach(function (m) {
  console.log(
    " - " +
      m.identityKey +
      " " +
      m.nick +
      " sub=" +
      m.subId +
      " freshness=" +
      m.freshness +
      " beforeN=" +
      m.before.length
  );
});
if (ownerChanged.length) {
  console.log("OWNER_CHANGED " + ownerChanged.length);
  ownerChanged.forEach(function (o) {
    console.log(" - " + o.identityKey + " " + o.action);
  });
}
if (goneFromMigrate.length) {
  console.log("GONE " + goneFromMigrate.length);
  goneFromMigrate.forEach(function (g) {
    console.log(" - " + g.identityKey + " " + g.action);
  });
}
if (ambiguous.length) {
  console.log("AMBIGUOUS " + ambiguous.length);
  process.exitCode = 2;
}
