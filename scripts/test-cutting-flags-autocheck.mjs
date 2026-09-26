#!/usr/bin/env node
/**
 * Regression: cutting flags must not flip true unless the user sent that key
 * or a same-date saved D1 flag already had it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerSrc = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
const uiSrc = fs.readFileSync(path.join(root, "boinya-c/app.main.js"), "utf8");
const gsSrc = fs.readFileSync(path.join(root, "Code.gs"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function toBool_(v) {
  if (v === true || v === 1) return true;
  const s = String(v == null ? "" : v).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function cutNameKey_(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/\s+/g, " ")
    .trim();
}

function cutFuzzyKey_(name) {
  return cutNameKey_(name)
    .replace(/ШТ\.?/g, "")
    .replace(/[^A-ZА-Я0-9]+/g, "");
}

function isCuttingSheetRow_(row) {
  const n = Number(row);
  return n >= 3 && n <= 48 && n % 1 === 0;
}

function normalizeCuttingItemFlags_(it) {
  if (!it || typeof it !== "object") return it;
  it.laid = toBool_(it.laid);
  it.done = toBool_(it.done);
  it.outNext = toBool_(it.outNext);
  return it;
}

function findPrevCuttingByName_(prevItems, item) {
  if (!item) return null;
  const nk = cutNameKey_(item.name);
  const fz = cutFuzzyKey_(item.name);
  if (!nk && !fz) return null;
  for (let i = 0; i < (prevItems || []).length; i++) {
    const p = prevItems[i];
    if (!p) continue;
    if (nk && cutNameKey_(p.name) === nk) return p;
    if (fz && cutFuzzyKey_(p.name) === fz) return p;
  }
  return null;
}

function mergeCuttingFlags_(items, prevItems, sameDate) {
  if (!sameDate || !prevItems || !prevItems.length) return (items || []).map(normalizeCuttingItemFlags_);
  (items || []).forEach(function (it) {
    const old = findPrevCuttingByName_(prevItems, it);
    if (!old) return;
    if (toBool_(old.laid)) it.laid = true;
    if (toBool_(old.done)) it.done = true;
    if (toBool_(old.outNext)) it.outNext = true;
  });
  return (items || []).map(normalizeCuttingItemFlags_);
}

function overlayCuttingKeepFlags_(newItems, prevItems, sameDate, dropUnmatchedFlags) {
  if (!sameDate || !prevItems || !prevItems.length) {
    const fresh = mergeCuttingFlags_(newItems, prevItems, sameDate);
    if (!dropUnmatchedFlags) return fresh;
    return (fresh || []).map(function (it) {
      if (!it) return it;
      return normalizeCuttingItemFlags_(Object.assign({}, it, { laid: false, done: false, outNext: false }));
    });
  }
  const qtyByKey = Object.create(null);
  const qtyByFuzzy = Object.create(null);
  (newItems || []).forEach(function (it) {
    if (!it) return;
    qtyByKey[cutNameKey_(it.name)] = it;
    const fz = cutFuzzyKey_(it.name);
    if (fz) qtyByFuzzy[fz] = it;
  });
  const used = Object.create(null);
  const out = [];
  prevItems.forEach(function (p) {
    if (!p) return;
    const n = qtyByKey[cutNameKey_(p.name)] || qtyByFuzzy[cutFuzzyKey_(p.name)];
    if (n) {
      used[cutNameKey_(n.name)] = true;
      used[cutFuzzyKey_(n.name)] = true;
      out.push(
        normalizeCuttingItemFlags_(
          Object.assign({}, n, {
            laid: toBool_(p.laid),
            done: toBool_(p.done),
            outNext: toBool_(p.outNext)
          })
        )
      );
    }
  });
  (newItems || []).forEach(function (n) {
    if (!n) return;
    if (used[cutNameKey_(n.name)] || used[cutFuzzyKey_(n.name)]) return;
    const copy = normalizeCuttingItemFlags_(Object.assign({}, n));
    if (dropUnmatchedFlags) {
      copy.laid = false;
      copy.done = false;
      copy.outNext = false;
    }
    out.push(copy);
  });
  return out;
}

function patchCuttingItemsFlags_(items, params, proxied) {
  params = params || {};
  const list = Array.isArray(items) ? items : [];
  const rowNum = Number(params.row);
  const wantName = cutNameKey_(params.name || "");
  let idx = -1;
  if (wantName) {
    for (let i = 0; i < list.length; i++) {
      if (cutNameKey_(list[i] && list[i].name) === wantName) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0 && !wantName && isCuttingSheetRow_(rowNum)) {
    for (let i = 0; i < list.length; i++) {
      if (Number(list[i].row) === rowNum) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return { items: list, found: false };
  const it = list[idx];
  function take(key) {
    if (params[key] != null && params[key] !== "") return toBool_(params[key]);
    return null;
  }
  const laid = take("laid");
  const done = take("done");
  const outNext = take("outNext");
  if (laid !== null) it.laid = laid;
  if (done !== null) it.done = done;
  if (outNext !== null) it.outNext = outNext;
  if (proxied && isCuttingSheetRow_(proxied.row)) it.row = Number(proxied.row);
  return { items: list, found: true, item: it };
}

function parseFinishReadyList_(params, proxied) {
  const out = [];
  function push(it) {
    if (it == null) return;
    if (typeof it === "number" || typeof it === "string") {
      const row = Number(it) || 0;
      if (row) out.push({ row: row, name: "" });
      return;
    }
    out.push({ row: Number(it.row) || 0, name: String(it.name || "") });
  }
  let ready = (params && params.ready) || (proxied && proxied.ready);
  if (typeof ready === "string" && ready) {
    try {
      ready = JSON.parse(ready);
    } catch (eJ) {
      ready = null;
    }
  }
  if (Array.isArray(ready)) ready.forEach(push);
  String((params && params.readyRows) || "")
    .split(",")
    .forEach(function (s) {
      const r = Number(String(s || "").trim());
      if (r) push({ row: r, name: "" });
    });
  return out;
}

// --- contract ---
assert(toBool_("false") === false, "toBool false string");
assert(toBool_("0") === false, "toBool 0 string");
assert(toBool_("true") === true, "toBool true string");
assert(toBool_(1) === true, "toBool 1");

const items = [
  { row: 3, name: "ЛЁГКОЕ", done: false, laid: false, outNext: false },
  { row: 4, name: "СЕРДЦЕ", done: false, laid: false, outNext: false }
];
const patched = patchCuttingItemsFlags_(items, { name: "ЛЁГКОЕ", done: "true" }, {
  done: true,
  laid: true,
  outNext: true
});
assert(patched.item.done === true, "user done applied");
assert(patched.item.laid === false, "GAS laid must NOT apply when user did not send laid");
assert(items[1].done === false && items[1].laid === false, "other SKU untouched");

const merged = mergeCuttingFlags_(
  [{ name: "ЛЁГКОЕ", done: false, laid: false, outNext: false }],
  [{ name: "ЛЁГКОЕ", done: "false", laid: "0", outNext: "" }],
  true
);
assert(merged[0].done === false, "string false must not OR-up to true");
assert(merged[0].laid === false, "string 0 must not OR-up to true");

const overlay = overlayCuttingKeepFlags_(
  [
    { name: "ЛЁГКОЕ", done: true, laid: true, outNext: false },
    { name: "НОВАЯ", done: true, laid: true, outNext: true }
  ],
  [{ name: "ЛЁГКОЕ", done: false, laid: true, outNext: false }],
  true,
  true
);
const light = overlay.find(function (it) { return cutNameKey_(it.name) === "ЛЕГКОЕ"; });
const neu = overlay.find(function (it) { return it.name === "НОВАЯ"; });
assert(light && light.laid === true && light.done === false, "keep same-date saved laid, not GAS done");
assert(neu && neu.done === false && neu.laid === false, "unmatched GAS TRUE dropped");

const ready = parseFinishReadyList_({ readyRows: "5" }, { ready: [{ row: 5, name: "УХО" }] });
assert(ready.some(function (r) { return r.row === 5; }), "readyRows parsed");
const all = [
  { row: 5, name: "УХО", done: false, laid: false },
  { row: 6, name: "АОРТА", done: false, laid: false }
];
all.forEach(function (it) {
  const hit = ready.some(function (r) {
    return Number(it.row) === Number(r.row);
  });
  if (hit) {
    it.done = true;
    it.laid = true;
  }
});
assert(all[0].done === true, "ready row marked");
assert(all[1].done === false, "finish must not mark every SKU");

// --- source guards ---
assert(
  !/if \(proxied && proxied\[key\] !== undefined\) return !!proxied\[key\]/.test(workerSrc),
  "worker must not copy GAS flags via take(proxied)"
);
assert(
  workerSrc.includes("не накатывать GAS") || workerSrc.includes("не накатывать"),
  "worker comments the no-GAS-flag-mirror rule"
);
assert(
  !/items\.forEach\(function \(it\) \{\s*if \(!it\) return;\s*it\.done = true;\s*it\.laid = true;/.test(workerSrc),
  "finishCutting must not mark all items done/laid"
);
assert(workerSrc.includes("parseFinishReadyList_"), "finish uses ready list");
assert(workerSrc.includes("dropUnmatchedFlags"), "SWR/overlay can drop unmatched GAS flags");
assert(workerSrc.includes("persistCuttingFlagsTable_(env, day, [patched.item])"), "persist only patched item");
assert(uiSrc.includes("cutItemDomKey_"), "UI unique cut keys");
assert(uiSrc.includes('autocomplete="off"'), "cutting checkboxes opt out of browser restore");
assert(uiSrc.includes("cutFlagOn_"), "UI strict flag parse");
assert(!/toggleCutDone\(\$\{item\.row\}/.test(uiSrc), "toggle must use unique key, not raw row");
assert(workerSrc.includes("function sameCutDate_"), "date compare helper");
assert(workerSrc.includes("function cuttingFlagLookupKeys_"), "persist name+fuzzy keys");
assert(workerSrc.includes("function lookupCuttingFlagRow_"), "overlay fuzzy lookup");
assert(workerSrc.includes("async function cuttingFlagsDateIso_"), "iso fallback for persist/load");
assert(workerSrc.includes("async function applyDurableCuttingFlags_"), "GAS path must overlay D1 flags");
assert(workerSrc.includes("sameCutDate_(snapDate, wantDate)"), "getCutting dateOk uses sameCutDate_");
assert(workerSrc.includes("function cuttingSnapDateOk_"), "empty cut date is not the same day");
assert(!workerSrc.includes("!wantDate || !snapDate || sameCutDate_"), "getCutting must not treat a missing date as ok");
assert(workerSrc.includes("function zeroCuttingItemFlags_"), "date mismatch zeros laid/done/outNext");
assert(
  !/const snap = await getSnapRaw_\(env, "cutting:" \+ day\)/.test(
    workerSrc.slice(workerSrc.indexOf("async function cuttingFlagsDateIso_"), workerSrc.indexOf("async function cuttingFlagsDateIso_") + 500)
  ),
  "cutting_flags iso does not fall back to an old snap date"
);
assert(!/const dateMismatch = !!\(wantDate && snapDate && snapDate !== wantDate\)/.test(workerSrc), "cutover must not use raw !== date");
assert(workerSrc.includes("Другая неделя: нарезку пересобрать из D1"), "date mismatch rebuilds D1, not raw GAS");
assert(workerSrc.includes("cuttingHasItems"), "items+no date is not empty cutting");
assert(workerSrc.includes("persistCuttingFlagsTable_(env, day, [patched.item])"), "persist only patched item");

function sameCutDate_(a, b) {
  const sa = String(a || "").trim();
  const sb = String(b || "").trim();
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  function toIso(s) {
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    return m ? m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2) : "";
  }
  return !!(toIso(sa) && toIso(sa) === toIso(sb));
}
assert(sameCutDate_("15.09.2026", "2026-09-15"), "DMY vs ISO is same cut date");
assert(!sameCutDate_("15.09.2026", "16.09.2026"), "other day is not same");
assert(!sameCutDate_("", "16.09.2026"), "empty snap date is not the same day");
assert(!sameCutDate_("16.09.2026", ""), "empty want date is not the same day");

function cuttingSnapDateOk_(want, snap) {
  return sameCutDate_(snap, want);
}
assert(!cuttingSnapDateOk_("27.09.2026", ""), "new day does not inherit an undated snap");
assert(!cuttingSnapDateOk_("27.09.2026", "26.09.2026"), "yesterday flags do not inherit");
assert(cuttingSnapDateOk_("27.09.2026", "2026-09-27"), "same calendar day keeps manual flags");

const inherited = mergeCuttingFlags_(
  [{ name: "ЛЁГКОЕ", done: false, laid: false, outNext: false }],
  [{ name: "ЛЁГКОЕ", done: true, laid: true, outNext: true }],
  cuttingSnapDateOk_("27.09.2026", "26.09.2026")
);
assert(inherited[0].done === false && inherited[0].laid === false, "different day does not copy checks");

assert(uiSrc.includes("sameCutSession"), "UI merges flags only for the same day and date");
const getCutStart = gsSrc.indexOf("function handleGetCutting");
const getCutEnd = gsSrc.indexOf("\nfunction ", getCutStart + 20);
const getCut = gsSrc.slice(getCutStart, getCutEnd > getCutStart ? getCutEnd : getCutStart + 4000);
assert(!getCut.includes("saveCuttingState_"), "getCutting does not save checkboxes on read");
assert(getCut.includes("E3:G60"), "leftover sheet checkboxes cleared when this date has no memory");

function cuttingFlagLookupKeys_(it) {
  const keys = [];
  const nk = cutNameKey_(it && it.name);
  const fz = cutFuzzyKey_(it && it.name);
  if (nk) keys.push(nk);
  if (fz && keys.indexOf(fz) < 0) keys.push(fz);
  return keys;
}
function lookupCuttingFlagRow_(flagMap, it) {
  const keys = cuttingFlagLookupKeys_(it);
  for (let i = 0; i < keys.length; i++) {
    if (flagMap[keys[i]]) return flagMap[keys[i]];
  }
  return null;
}
function overlayCuttingFlagsFromTable_(items, flagMap) {
  return (items || []).map(function (it) {
    const f = lookupCuttingFlagRow_(flagMap, it);
    if (!f) return it;
    return Object.assign({}, it, { laid: toBool_(f.laid), done: toBool_(f.done), outNext: toBool_(f.outNext) });
  });
}
const gasFresh = [{ name: "ЛЁГКОЕ ШТ.", laid: false, done: false, outNext: false }];
const fromTable = overlayCuttingFlagsFromTable_(gasFresh, { "ЛЕГКОЕ": { laid: true, done: false, outNext: false } });
assert(fromTable[0].laid === true, "fuzzy/name overlay restores laid after GAS wipe");

console.log("cutting-flags-autocheck OK");
