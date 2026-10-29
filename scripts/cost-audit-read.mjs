#!/usr/bin/env node
/**
 * Read-only сверка себеса. Имена клиентов не печатает. В D1 не пишет.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

function sh(sql) {
  const raw = execFileSync(
    "npx",
    ["--yes", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: 80 * 1024 * 1024, env: process.env, cwd: "boinya-c/proxy" }
  );
  const data = JSON.parse(raw);
  const blocks = Array.isArray(data) ? data : [data];
  const rows = [];
  blocks.forEach(function (b) {
    if (b && Array.isArray(b.results)) rows.push.apply(rows, b.results);
  });
  return rows;
}

function extractFn(src, name) {
  const re = new RegExp("function " + name + "\\s*\\(");
  const i = src.search(re);
  if (i < 0) throw new Error("missing " + name);
  let depth = 0;
  let started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") { depth++; started = true; }
    else if (src[j] === "}") {
      depth--;
      if (started && depth === 0) return src.slice(i, j + 1);
    }
  }
  throw new Error("unclosed " + name);
}

function api() {
  const src = readFileSync("boinya-c/proxy/worker.js", "utf8");
  const builtinStart = src.indexOf("const RAW_COST_BUILTIN_");
  const builtinEnd = src.indexOf("async function ensureRawCostTable_");
  const names = [
    "retailNormalizeNameD1_",
    "isPieceSkuNameD1_",
    "ppCostUnitD1_",
    "ppCostFractionAliasesD1_",
    "ppCostNameVariantsD1_",
    "rawCostBuiltinInfoD1_",
    "rawCostBuiltinGramD1_",
    "meatFracParentCostD1_",
    "lookupPpCostInfoD1_",
    "overlayRawCostsD1_"
  ];
  const ctx = createContext({ Object, Number, String, Math, isFinite, Array });
  runInContext(src.slice(builtinStart, builtinEnd) + "\n" + names.map((n) => extractFn(src, n)).join("\n"), ctx);
  return ctx;
}

function fold(s) {
  return String(s || "").trim().toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ");
}

function unitOf(info) {
  if (!info) return 0;
  const n = Number(info.unitPrice != null ? info.unitPrice : info.per100);
  return isFinite(n) ? n : 0;
}

const CATALOG = [
  ["дрессура", "ЛЁГКОЕ"], ["дрессура", "СЕРДЦЕ"], ["дрессура", "РУБЕЦ Т"],
  ["дрессура", "БАРАНЬЕ ЛЁГКОЕ"], ["дрессура", "ПОЧКИ"],
  ["жевалки", "БЫЧИЙ КОРЕНЬ"], ["жевалки", "ТРАХЕЯ"], ["жевалки", "АОРТА"],
  ["жевалки", "УХО Г"], ["жевалки", "УХО К"], ["жевалки", "НОСЫ шт."],
  ["жевалки", "СТАНОВАЯ ЖИЛА"], ["жевалки", "КОЛЕНИ шт."], ["жевалки", "ПЕРЕПЁЛКИ шт."],
  ["жевалки", "ЛОП ХРЯЩ шт."], ["жевалки", "УТИНЫЕ ШЕИ шт."],
  ["другое", "ПЕЧЕНЬ"], ["другое", "БАРАНЬЯ ПЕЧЕНЬ"], ["другое", "ИНДЕЙКА"],
  ["другое", "КРОЛИК"], ["другое", "МЯСНЫЕ ЛОМТИКИ"], ["другое", "ВЫМЯ"], ["другое", "СЕМЕННИКИ"],
  ["овощи", "БАНАНЫ"], ["овощи", "ЯБЛОКИ"], ["овощи", "ГРУШИ"], ["овощи", "ГРУШЫ"],
  ["овощи", "МОРКОВЬ"], ["овощи", "ТЫКВА"], ["овощи", "БАТАТ"], ["овощи", "КАБАЧОК"],
  ["крошка", "КРОШКА ЛЁГКОГО"], ["крошка", "КРОШКА ПОЧЕК"], ["крошка", "КРОШКА РУБЕЦ"],
  ["крошка", "КРОШКА СЕРДЦА"], ["крошка", "КРОШКА МИКС"]
];

function main() {
  const eng = api();
  const versions = sh(
    "SELECT sku, cost, shrink, effective_from FROM raw_cost_ver ORDER BY effective_from, id"
  );
  const pos = sh(
    "SELECT name, cat, fractions, price, unit FROM price_positions ORDER BY name"
  );
  const snaps = sh(
    "SELECT cache_key, payload FROM snap_cache WHERE cache_key IN ('priceCostsPp','retailPrices')"
  );
  const baskets = sh(
    "SELECT segment, basket_json FROM orders WHERE lower(coalesce(status,'')) = 'active' " +
      "AND basket_json IS NOT NULL AND length(basket_json) > 2 LIMIT 4000"
  );

  let costs = {};
  let zeroKeys = {};
  let retailNames = [];
  snaps.forEach(function (row) {
    let payload = {};
    try { payload = JSON.parse(row.payload || "{}"); } catch (e) { payload = {}; }
    if (row.cache_key === "priceCostsPp") {
      costs = payload.costs || {};
      zeroKeys = payload.zeroKeys || {};
    }
    if (row.cache_key === "retailPrices" && Array.isArray(payload.items)) {
      payload.items.forEach(function (it) {
        const key = String((it && (it.key || it.name)) || "").trim();
        if (!key) return;
        const base = key.split("|")[0].trim();
        if (base) retailNames.push(base);
      });
    }
  });

  const orderNames = [];
  let ppBaskets = 0;
  let otherBaskets = 0;
  baskets.forEach(function (row) {
    if (String(row.segment || "") === "ПП") ppBaskets++;
    else otherBaskets++;
    let arr = [];
    try { arr = JSON.parse(row.basket_json || "[]"); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) return;
    arr.forEach(function (it) {
      if (!it) return;
      const name = String(it.name || it.main || "").trim();
      if (name) orderNames.push(name);
      if (Array.isArray(it.sources)) {
        it.sources.forEach(function (s) {
          const sn = String((s && (s.name || s.main)) || s || "").trim();
          if (sn) orderNames.push(sn);
        });
      }
    });
  });

  const positions = [];
  const seen = Object.create(null);
  function add(name, where) {
    const n = String(name || "").trim();
    if (!n || seen[fold(n)]) return;
    seen[fold(n)] = true;
    positions.push({ name: n, where: where });
  }
  CATALOG.forEach(function (pair) { add(pair[1], pair[0]); });
  retailNames.forEach(function (n) { add(n, "снимок прайса"); });
  pos.forEach(function (p) { add(p.name, "ещё:" + (p.cat || "")); });
  orderNames.forEach(function (n) { add(n, "заказ"); });

  const asOf = new Date().toISOString().slice(0, 10);
  const over = eng.overlayRawCostsD1_(costs, versions.map(function (v) {
    return { sku: v.sku, cost: v.cost, shrink: v.shrink, effectiveFrom: String(v.effective_from || "").slice(0, 10) };
  }), asOf);

  function dbRowsFor(name) {
    const canon = eng.retailNormalizeNameD1_(name);
    const wants = {};
    eng.ppCostNameVariantsD1_(name).forEach(function (n) {
      wants[fold(n)] = true;
    });
    wants[fold(canon)] = true;
    const hits = [];
    Object.keys(costs).forEach(function (k) {
      const info = costs[k] || {};
      const nm = fold(info.name || k);
      const kf = fold(k);
      if (!wants[nm] && !wants[kf] && kf.indexOf(fold(canon) + " /") !== 0) return;
      hits.push({
        key: k,
        name: info.name || "",
        unit: unitOf(info),
        piece: !!info.piece
      });
    });
    const vers = versions.filter(function (v) { return wants[fold(v.sku)]; });
    const zeros = Object.keys(zeroKeys).filter(function (k) {
      return wants[fold(k)] || fold(k).indexOf(fold(canon) + " /") === 0;
    });
    return { canon: canon, hits: hits, vers: vers, zeros: zeros };
  }

  const mismatch = [];
  const builtinOnly = [];
  const nowhere = [];
  const ok = [];
  const drift = [];

  positions.forEach(function (p) {
    const db = dbRowsFor(p.name);
    const looked = eng.lookupPpCostInfoD1_(over, p.name, "", zeroKeys);
    const unit = unitOf(looked);
    const builtin = eng.rawCostBuiltinInfoD1_(p.name);
    const positive = db.hits.filter(function (h) { return h.unit > 0; });
    const verPos = db.vers.filter(function (v) { return Number(v.cost) > 0; });
    const asked = fold(db.canon);
    const sameKey = positive.filter(function (h) {
      return fold(h.name || h.key) === asked || fold(h.key) === asked;
    });
    const otherKey = positive.filter(function (h) { return fold(h.name || h.key) !== asked && fold(h.key) !== asked; });
    const verOther = verPos.filter(function (v) { return fold(v.sku) !== asked; });

    if (otherKey.length || verOther.length || (db.zeros.length && db.zeros.some(function (z) { return fold(z) !== asked; }))) {
      const alt = otherKey[0] || null;
      const altVer = verOther[0] || null;
      mismatch.push({
        price: p.name,
        where: p.where,
        canon: db.canon,
        cacheKey: alt ? alt.key : "",
        cacheValue: alt ? alt.unit : null,
        versionSku: altVer ? altVer.sku : "",
        versionValue: altVer ? Number(altVer.cost) : null,
        zeroKeys: db.zeros,
        calc: unit,
        builtin: builtin ? builtin.unitPrice : null
      });
    }

    if (unit > 0 && looked && looked.builtin) {
      builtinOnly.push({
        price: p.name,
        where: p.where,
        value: unit,
        zeroKeys: db.zeros,
        versions: db.vers.length
      });
      return;
    }
    if (unit > 0 && sameKey.length) {
      ok.push({
        price: p.name,
        where: p.where,
        key: sameKey[0].key,
        value: sameKey[0].unit,
        builtin: builtin ? builtin.unitPrice : null
      });
      if (builtin && Math.abs(sameKey[0].unit - builtin.unitPrice) > 0.009) {
        drift.push({ price: p.name, db: sameKey[0].unit, builtin: builtin.unitPrice, key: sameKey[0].key });
      }
      return;
    }
    if (unit > 0 && (otherKey.length || verPos.length)) {
      return;
    }
    nowhere.push({
      price: p.name,
      where: p.where,
      zeroKeys: db.zeros,
      explicitZero: db.hits.filter(function (h) { return !(h.unit > 0); }).map(function (h) { return h.key; })
    });
  });

  const more = pos.map(function (p) {
    return { name: p.name, cat: p.cat || "", price: p.price, unit: p.unit || "" };
  });

  console.log(JSON.stringify({
    asOf: asOf,
    counts: {
      positions: positions.length,
      ok: ok.length,
      mismatch: mismatch.length,
      builtinOnly: builtinOnly.length,
      nowhere: nowhere.length,
      drift: drift.length,
      versions: versions.length,
      cacheKeys: Object.keys(costs).length,
      zeroKeys: Object.keys(zeroKeys).length,
      extraPositions: pos.length,
      baskets: baskets.length,
      ppBaskets: ppBaskets,
      otherBaskets: otherBaskets
    },
    mismatch: mismatch,
    builtinOnly: builtinOnly,
    nowhere: nowhere,
    ok: ok,
    drift: drift,
    extra: more
  }, null, 2));
}

main();
