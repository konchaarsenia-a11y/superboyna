#!/usr/bin/env node
/**
 * Разовый ремонт трёх карточек ПП/АФК.
 * Репозиторий публичный: в лог попадают только счётчики, subId, номера строк
 * и присутствие трёх ников. Чужие пары — счётчик и ник, без ячеек и пожеланий.
 *
 *   node scripts/repair-pp-afk-trio-ci.mjs --self-test
 *   GAS_SHARED_SECRET=… CLOUDFLARE_API_TOKEN=… node scripts/repair-pp-afk-trio-ci.mjs
 *
 * Запись только при REPAIR_CONFIRM=evgenia-marga-andrei и если план меняет
 * лишь этих троих так, как задано: evgenia только ПП, Маргарита Сергеевна
 * только АФК, дубль «Андрей» в ПП сливается в andreiprigunov и снимается.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAS_URL =
  process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec";
const CONFIRM = "evgenia-marga-andrei";
const SHEETS = ["ПП", "АФК", "БП"];

function extractFn(src, name) {
  const marker = "function " + name + "(";
  const startFn = src.indexOf(marker);
  if (startFn < 0) throw new Error("missing function " + name);
  let start = startFn;
  if (src.slice(Math.max(0, startFn - 6), startFn) === "async ") start = startFn - 6;
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}

const W_NAMES = [
  "normalizeMatchKey_",
  "matchKeyAliases_",
  "extractInstagramNick_",
  "subscriptionIgFromRow_",
  "stripIgFromText_",
  "subscriptionDisplayFromRow_",
  "preferSubscriptionIdentity_",
  "subscriptionBareWish_",
  "isDistinctPetPair_",
  "sameSubscriptionPerson_",
  "subscriptionSheetKey_",
  "subscriptionNickKeys_",
  "subscriptionMatch_",
  "findSubscriptionIndex_",
  "subscriptionSubstanceScore_",
  "unionSubscriptionBasket_",
  "mergeTextKeep_",
  "bpStageRank_",
  "mergeSubscriptionPair_",
  "collapseSubscriptionList_",
  "sanitizeRaw26CalcFactCost_",
  "gasSubscriptionLooksFound_",
  "sameSubscriptionIdentityAcrossSheets_",
  "subscriptionFieldAliases_",
  "subscriptionDeleteHit_",
  "subscriptionMovePlan_",
  "ppAfkNormName_",
  "isEvgeniaSubRow_",
  "isMargaSubRow_",
  "isAndreiNameOnlySubRow_",
  "isAndreiPrigSubRow_",
  "scanPpAfkIssues_",
  "planPpAfkTrioRepair_"
];

const GS_NAMES = ["extractInstagramNick_", "clientMatchKey_", "normalizeClientKey_"];

export function loadPlanners() {
  const wSrc = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
  const gsSrc = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
  const ctx = vm.createContext({
    Math, Number, String, isFinite, Object, Array, JSON, Date, RegExp
  });
  vm.runInContext(W_NAMES.map((n) => extractFn(wSrc, n)).join("\n"), ctx);
  const gs = vm.createContext({ Math, Number, String, Object, Array, RegExp });
  vm.runInContext(GS_NAMES.map((n) => extractFn(gsSrc, n)).join("\n"), gs);
  return { ctx, gs };
}

function sheetOf(v) {
  const s = String(v || "").trim();
  return SHEETS.indexOf(s) >= 0 ? s : "other";
}

function safeId(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return "";
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(s)) return "bad_id";
  return s;
}

function publicNick(v) {
  let t = String(v || "")
    .replace(/\d{6,}/g, "")
    .replace(/https?:\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "noname";
  return t.slice(0, 48);
}

function d1Nick(ctx, row) {
  if (!row) return "";
  if (ctx.isEvgeniaSubRow_(row)) return String(ctx.subscriptionIgFromRow_(row) || "").toLowerCase();
  if (ctx.isAndreiPrigSubRow_(row)) return "andreiprigunov";
  if (ctx.isMargaSubRow_(row)) return "Маргарита Сергеевна";
  if (ctx.isAndreiNameOnlySubRow_(row)) return "Андрей";
  return "";
}

function sheetNick(gs, cell) {
  const ig = String(gs.extractInstagramNick_(cell) || "").toLowerCase();
  if (ig === "evgenia_ln" || ig === "evgenia_in" || ig === "andreiprigunov") return ig;
  const key = gs.clientMatchKey_(cell);
  if (key && key === gs.clientMatchKey_("Маргарита Сергеевна")) return "Маргарита Сергеевна";
  if (!ig && key && key === gs.clientMatchKey_("Андрей")) return "Андрей";
  return "";
}

function countBySheet(items, nickOf) {
  const out = { ПП: 0, АФК: 0, БП: 0, other: 0 };
  for (let i = 0; i < items.length; i++) {
    const nick = nickOf(items[i]);
    if (!nick) continue;
    const sh = sheetOf(items[i].sheet);
    if (!out[nick]) out[nick] = { ПП: 0, АФК: 0, БП: 0, other: 0 };
    out[nick][sh] += 1;
  }
  return out;
}

function presenceLines(prefix, counts, rows, nickOf, withRow) {
  const lines = [];
  const nicks = ["evgenia_ln", "evgenia_in", "Маргарита Сергеевна", "Андрей", "andreiprigunov"];
  for (let i = 0; i < nicks.length; i++) {
    const nick = nicks[i];
    const c = counts[nick] || { ПП: 0, АФК: 0, БП: 0, other: 0 };
    for (let s = 0; s < SHEETS.length; s++) {
      const sh = SHEETS[s];
      const n = c[sh] || 0;
      const hits = rows.filter((r) => nickOf(r) === nick && sheetOf(r.sheet) === sh);
      if (!n && !hits.length) {
        lines.push(prefix + " nick=" + nick + " sheet=" + sh + " present=0");
        continue;
      }
      if (!withRow) {
        const ids = hits.map((r) => safeId(r.subId || r.id)).filter(Boolean);
        lines.push(
          prefix + " nick=" + nick + " sheet=" + sh + " present=" + hits.length +
          " subId=" + (ids.join(",") || "-")
        );
        continue;
      }
      if (!hits.length) {
        lines.push(prefix + " nick=" + nick + " sheet=" + sh + " present=0");
        continue;
      }
      for (let h = 0; h < hits.length; h++) {
        const rowNo = Number(hits[h].row);
        lines.push(
          prefix + " nick=" + nick + " sheet=" + sh + " present=1 row=" +
          (Number.isFinite(rowNo) ? String(rowNo) : "-") + " subId=" + (safeId(hits[h].subId) || "-")
        );
      }
    }
  }
  return lines;
}

function changeLine(prefix, c) {
  const op = String(c.op || "");
  const who = String(c.who || c.from || "");
  const bits = [prefix + " op=" + (op || "unknown")];
  if (who === "evgenia" || who === "Маргарита Сергеевна" || who === "Андрей") bits.push("who=" + who);
  else if (who) bits.push("who=unexpected");
  if (c.to === "ПП" || c.to === "АФК") bits.push("to=" + c.to);
  const sh = sheetOf(c.sheet);
  if (c.sheet) bits.push("sheet=" + sh);
  if (c.subId != null && String(c.subId)) bits.push("subId=" + (safeId(c.subId) || "-"));
  if (c.row != null) bits.push("row=" + String(Number(c.row) || 0));
  if (op === "merge") bits.push("into=andreiprigunov");
  if (op === "skip") bits.push("reason=no_andreiprigunov_card");
  return bits.join(" ");
}

function otherNicks(list, pick) {
  const names = [];
  const seen = Object.create(null);
  for (let i = 0; i < (list || []).length; i++) {
    const n = publicNick(pick(list[i]));
    if (!n || seen[n]) continue;
    seen[n] = true;
    names.push(n);
  }
  return names;
}

function d1ChangeOk(c) {
  const op = String(c.op || "");
  if (op === "skip") return c.who === "Андрей" && c.reason === "no_andreiprigunov_card";
  if (op === "drop" || op === "retarget") {
    if (c.who !== "evgenia" && c.who !== "Маргарита Сергеевна" && c.who !== "Андрей") return false;
    if (c.nick && !/^(evgenia_ln|evgenia_in|andreiprigunov|Андрей|Маргарита Сергеевна)$/i.test(String(c.nick))) {
      return false;
    }
    return true;
  }
  if (op === "merge") {
    return c.from === "Андрей" && String(c.into || "").toLowerCase().indexOf("andreiprigunov") >= 0;
  }
  return false;
}

function sheetChangeOk(gs, c) {
  const op = String(c.op || "");
  if (op === "skip") return c.who === "Андрей" && c.reason === "no_andreiprigunov_card";
  if (op === "drop" || op === "retarget") {
    return c.who === "evgenia" || c.who === "Маргарита Сергеевна" || c.who === "Андрей";
  }
  if (op === "merge") {
    const intoIg = String(gs.extractInstagramNick_(c.into) || "").toLowerCase();
    const fromIg = String(gs.extractInstagramNick_(c.from) || "").toLowerCase();
    const fromName = sheetNick(gs, c.from);
    const intoHas = intoIg === "andreiprigunov" || String(c.into || "").toLowerCase().indexOf("andreiprigunov") >= 0;
    return !fromIg && fromName === "Андрей" && intoHas;
  }
  return false;
}

function outcomeOk(ctx, rows) {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const sh = ctx.subscriptionSheetKey_(r);
    if (ctx.isEvgeniaSubRow_(r) && sh === "АФК") return false;
    if (ctx.isMargaSubRow_(r) && sh === "ПП") return false;
    if (ctx.isAndreiNameOnlySubRow_(r) && sh === "ПП") return false;
  }
  return true;
}

function sheetOutcomeFrom(gs, before, changes) {
  const rows = (before || []).map((r) => Object.assign({}, r));
  for (let i = 0; i < (changes || []).length; i++) {
    const c = changes[i];
    if (c.op === "skip") continue;
    if (c.op === "drop" || c.op === "merge") {
      const nick = c.op === "merge" ? "Андрей" : (c.who === "evgenia" ? "" : c.who);
      for (let j = rows.length - 1; j >= 0; j--) {
        const hitRow = c.row != null && Number(rows[j].row) === Number(c.row) && sheetOf(rows[j].sheet) === sheetOf(c.sheet);
        const hitWho = c.op === "drop" && c.who === "evgenia" && /^evgenia_/.test(sheetNick(gs, rows[j].cell)) && sheetOf(rows[j].sheet) === sheetOf(c.sheet);
        const hitNamed = nick && sheetNick(gs, rows[j].cell) === nick && (!c.sheet || sheetOf(rows[j].sheet) === sheetOf(c.sheet));
        if (c.op === "merge") {
          if (sheetNick(gs, rows[j].cell) === "Андрей" && sheetOf(rows[j].sheet) === "ПП") rows.splice(j, 1);
        } else if (hitRow || hitWho || hitNamed) rows.splice(j, 1);
      }
    }
    if (c.op === "retarget" && (c.to === "ПП" || c.to === "АФК")) {
      const want = c.who === "evgenia" ? /^evgenia_/ : null;
      for (let j = 0; j < rows.length; j++) {
        const n = sheetNick(gs, rows[j].cell);
        if (c.who === "evgenia" && want.test(n) && n) rows[j].sheet = c.to;
        if (c.who !== "evgenia" && n === c.who) rows[j].sheet = c.to;
      }
    }
  }
  for (let i = 0; i < rows.length; i++) {
    const n = sheetNick(gs, rows[i].cell);
    const sh = sheetOf(rows[i].sheet);
    if (/^evgenia_/.test(n) && sh === "АФК") return false;
    if (n === "Маргарита Сергеевна" && sh === "ПП") return false;
    if (n === "Андрей" && sh === "ПП") return false;
  }
  return true;
}

export function assess(ctx, gs, d1Rows, gasReport) {
  const plan = ctx.planPpAfkTrioRepair_(d1Rows || []);
  const gasChanges = (gasReport && gasReport.changes) || [];
  const gasBefore = (gasReport && gasReport.before) || [];
  const reasons = [];
  const d1Changes = plan.changes || [];
  for (let i = 0; i < d1Changes.length; i++) if (!d1ChangeOk(d1Changes[i])) reasons.push("d1_change");
  for (let i = 0; i < gasChanges.length; i++) if (!sheetChangeOk(gs, gasChanges[i])) reasons.push("sheet_change");
  const skip = d1Changes.some((c) => c.op === "skip") || gasChanges.some((c) => c.op === "skip");
  if (skip) reasons.push("andrei_skip");
  if (!outcomeOk(ctx, plan.subscriptions || [])) reasons.push("d1_outcome");
  if (gasReport && !sheetOutcomeFrom(gs, gasBefore, gasChanges)) reasons.push("sheet_outcome");
  const d1Counts = {};
  const trio = (d1Rows || []).filter((r) => d1Nick(ctx, r));
  for (let i = 0; i < trio.length; i++) {
    const n = d1Nick(ctx, trio[i]);
    if (!d1Counts[n]) d1Counts[n] = { ПП: 0, АФК: 0, БП: 0, other: 0 };
    d1Counts[n][sheetOf(ctx.subscriptionSheetKey_(trio[i]))] += 1;
  }
  const sheetCounts = {};
  for (let i = 0; i < gasBefore.length; i++) {
    const n = sheetNick(gs, gasBefore[i].cell);
    if (!n) continue;
    if (!sheetCounts[n]) sheetCounts[n] = { ПП: 0, АФК: 0, БП: 0, other: 0 };
    sheetCounts[n][sheetOf(gasBefore[i].sheet)] += 1;
  }
  const scan = plan.scan || { bothSheets: [], nameOnlyTwins: [] };
  const d1OtherBoth = (scan.bothSheets || []).filter((x) => {
    const k = String(x.key || "");
    return k !== "EVGENIA_LN" && k !== "EVGENIA_IN" && k !== "EVGENIALN" && k !== "EVGENIAIN";
  });
  const d1OtherTwins = (scan.nameOnlyTwins || []).filter((t) => {
    const n = ctx.ppAfkNormName_((t.nameOnly && (t.nameOnly.label || t.nameOnly.nick)) || "");
    return n !== "АНДРЕЙ" && n !== "МАРГАРИТА СЕРГЕЕВНА";
  });
  const gasOther = (gasReport && gasReport.otherClients) || { bothSheets: [], nameOnlyTwins: [] };
  return {
    ok: reasons.length === 0,
    reasons,
    writes: d1Changes.filter((c) => c.op !== "skip").length + gasChanges.filter((c) => c.op !== "skip").length,
    plan,
    lines: []
      .concat(["d1_subs count=" + (d1Rows || []).length])
      .concat(["d1_changes count=" + d1Changes.length])
      .concat(presenceLines("d1", d1Counts, trio.map((r) => Object.assign({}, r, { sheet: ctx.subscriptionSheetKey_(r) })), (r) => d1Nick(ctx, r), false))
      .concat(d1Changes.map((c) => changeLine("d1_change", c)))
      .concat(["d1_other_both count=" + d1OtherBoth.length])
      .concat(["d1_other_both nicks=" + (otherNicks(d1OtherBoth, (x) => x.key).join("|") || "-")])
      .concat(["d1_other_twins count=" + d1OtherTwins.length])
      .concat(["d1_other_twins nicks=" + (otherNicks(d1OtherTwins, (t) => (t.nameOnly && (t.nameOnly.nick || t.nameOnly.label)) || "").join("|") || "-")])
      .concat(["sheet_rows count=" + gasBefore.length])
      .concat(["sheet_changes count=" + gasChanges.length])
      .concat(presenceLines("sheet", sheetCounts, gasBefore, (r) => sheetNick(gs, r.cell), true))
      .concat(gasChanges.map((c) => changeLine("sheet_change", c)))
      .concat(["sheet_other_both count=" + ((gasOther.bothSheets || []).length)])
      .concat(["sheet_other_both nicks=" + (otherNicks(gasOther.bothSheets || [], (x) => x.key).join("|") || "-")])
      .concat(["sheet_other_twins count=" + ((gasOther.nameOnlyTwins || []).length)])
      .concat(["sheet_other_twins nicks=" + (otherNicks(gasOther.nameOnlyTwins || [], (t) => (t.nameOnly && t.nameOnly.cell) || "").join("|") || "-")])
  };
}

function leakGuard(line, secret) {
  const s = String(line);
  if (secret && s.indexOf(secret) >= 0) throw new Error("leak_secret");
  if (/wishes|address|phone|телефон|адрес/i.test(s)) throw new Error("leak_field");
  if (s.length > 500) throw new Error("leak_long");
  return s;
}

function unwrap(text) {
  const s = String(text || "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
}

const D1_ID = "8ab3668c-a654-432c-9ebd-a1ac5c4db800";

function cfErr(json) {
  const err = json && json.errors && json.errors[0];
  if (!err) return "none";
  const msg = String(err.message || "").replace(/[A-Za-z0-9_\-]{24,}/g, "[redacted]").replace(/\s+/g, " ").slice(0, 100);
  return "code=" + (err.code || 0) + " message=" + msg;
}

async function cfJson(urlPath, body) {
  const token = String(process.env.CLOUDFLARE_API_TOKEN || "");
  const res = await fetch("https://api.cloudflare.com/client/v4" + urlPath, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { json = null; }
  return { http: res.status, json, bytes: text.length };
}

async function accountIds() {
  const one = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  if (one) return { ids: [one], http: 0, err: "", count: 1 };
  const got = await cfJson("/accounts?per_page=20");
  const list = (got.json && got.json.result) || [];
  return {
    ids: list.map((a) => a && a.id).filter(Boolean),
    http: got.http,
    err: cfErr(got.json),
    count: list.length
  };
}

async function d1Query(sql, params) {
  const acc = await accountIds();
  if (!acc.ids.length) return { ok: false, reason: "no_account http=" + acc.http + " " + acc.err, rows: [] };
  let last = "no_try";
  for (let i = 0; i < acc.ids.length; i++) {
    const got = await cfJson("/accounts/" + acc.ids[i] + "/d1/database/" + D1_ID + "/query", {
      sql: sql,
      params: params || []
    });
    const result = got.json && got.json.result && got.json.result[0];
    if (got.json && got.json.success && result) return { ok: true, rows: result.results || [] };
    last = "http=" + got.http + " " + cfErr(got.json);
  }
  return { ok: false, reason: last, rows: [] };
}

async function d1Select(cacheKey) {
  return d1Query("SELECT payload FROM snap_cache WHERE cache_key = ?1", [cacheKey]);
}

async function gasCall(secret, params) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 240000);
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action: "repairPpAfkTrio" }, params, secret ? { _wk: secret } : {}))
    });
    const text = await res.text();
    return { http: res.status, json: unwrap(text), bytes: text.length };
  } catch (e) {
    return { http: 0, json: null, bytes: 0, error: String((e && e.name) || "fetch_failed") };
  } finally {
    clearTimeout(timer);
  }
}

function say(line, secret) {
  console.log(leakGuard(line, secret));
}

async function writeD1(ctx, list, plan) {
  const next = Object.assign({}, list || { status: "success" });
  next.subscriptions = plan.subscriptions;
  next.count = plan.subscriptions.length;
  next.status = "success";
  const payload = JSON.stringify(next);
  if (payload.length > 700000) return { ok: false, reason: "payload_too_large", bytes: payload.length };
  const now = new Date().toISOString();
  const wrote = await d1Query(
    "UPDATE snap_cache SET payload = ?1, updated_at = ?2 WHERE cache_key = 'listSubscriptions'",
    [payload, now]
  );
  if (!wrote.ok) return { ok: false, reason: "d1_update_failed" };
  const tombRead = await d1Select("subDeleteTombstones");
  let bag = { items: [] };
  if (tombRead.ok && tombRead.rows[0] && tombRead.rows[0].payload) {
    try { bag = JSON.parse(tombRead.rows[0].payload) || bag; } catch (e) { bag = { items: [] }; }
  }
  let items = Array.isArray(bag.items) ? bag.items.slice() : [];
  const nowMs = Date.now();
  items = items.filter((it) => it && nowMs - (Number(it.at) || 0) < (Number(it.ttl) > 0 ? Number(it.ttl) : 15 * 60 * 1000));
  const removed = plan.removed || [];
  for (let i = 0; i < removed.length; i++) {
    const row = removed[i];
    const nick = String(row.nick || row.label || "");
    const mk = ctx.normalizeMatchKey_(nick);
    const sheet = ctx.subscriptionSheetKey_(row) || "ПП";
    const subId = String(row.subId || row.id || "").trim();
    items = items.filter((it) => {
      if (subId && String(it.subId || "") === subId && String(it.sheet || "") === sheet) return false;
      if (mk && String(it.mk || "") === mk && String(it.sheet || "") === sheet) return false;
      return true;
    });
    items.push({ nick, mk, sheet, subId, at: nowMs, ttl: 24 * 60 * 60 * 1000 });
  }
  if (items.length > 200) items = items.slice(-200);
  const tombPayload = JSON.stringify({ items, updatedAt: nowMs });
  const tombWrote = await d1Query(
    "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES ('subDeleteTombstones', ?1, ?2) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
    [tombPayload, now]
  );
  return tombWrote.ok ? { ok: true, removed: removed.length } : { ok: false, reason: "tomb_update_failed" };
}

async function main() {
  const { ctx, gs } = loadPlanners();
  if (process.argv.indexOf("--self-test") >= 0) {
    const secret = "super-secret-value";
    const d1 = [
      { sheet: "ПП", subId: "22", nick: "evgenia_In", label: "Евгения evgenia_In", wishes: "SECRET_WISH_DO_NOT_PRINT", phone: "+375291112233" },
      { sheet: "АФК", subId: "22", nick: "evgenia_In", label: "Евгения evgenia_In", address: "SECRET_ADDR" },
      { sheet: "АФК", subId: "34", nick: "Маргарита Сергеевна", label: "Маргарита Сергеевна" },
      { sheet: "ПП", subId: "34", nick: "Маргарита Сергеевна", label: "Маргарита Сергеевна" },
      { sheet: "ПП", subId: "9", nick: "andreiprigunov", label: "Андрей andreiprigunov" },
      { sheet: "ПП", subId: "10", nick: "Андрей", label: "Андрей", wishes: "SECRET_WISH_DO_NOT_PRINT" },
      { sheet: "ПП", subId: "77", nick: "other_one", label: "Other One" },
      { sheet: "АФК", subId: "77", nick: "other_one", label: "Other One" }
    ];
    const gas = {
      before: [
        { sheet: "ПП", row: 31, cell: "Евгения evgenia_In", subId: "22", wishes: "SECRET_WISH_DO_NOT_PRINT" },
        { sheet: "АФК", row: 14, cell: "Евгения evgenia_In", subId: "22" },
        { sheet: "АФК", row: 32, cell: "Маргарита Сергеевна", subId: "34" },
        { sheet: "ПП", row: 40, cell: "Маргарита Сергеевна", subId: "34" },
        { sheet: "ПП", row: 8, cell: "Андрей andreiprigunov", subId: "9" },
        { sheet: "ПП", row: 9, cell: "Андрей", subId: "10" }
      ],
      changes: [
        { op: "drop", who: "evgenia", sheet: "АФК", cell: "Евгения evgenia_In", subId: "22", row: 14 },
        { op: "drop", who: "Маргарита Сергеевна", sheet: "ПП", cell: "Маргарита Сергеевна", subId: "34", row: 40 },
        { op: "merge", from: "Андрей", into: "Андрей andreiprigunov", sheet: "ПП" },
        { op: "drop", who: "Андрей", sheet: "ПП", cell: "Андрей", subId: "10", row: 9 }
      ],
      otherClients: {
        bothSheets: [{ key: "OTHER_ONE", a: { cell: "Other secret address" }, b: { cell: "Other" } }],
        nameOnlyTwins: [{ nameOnly: { cell: "zzz_twin" }, handled: [{ cell: "zzz_twin handled" }] }]
      }
    };
    const view = assess(ctx, gs, d1, gas);
    if (!view.ok) throw new Error("self_test_expected_ok:" + view.reasons.join(","));
    const text = view.lines.map((line) => leakGuard(line, secret)).join("\n");
    if (text.indexOf("SECRET_WISH") >= 0 || text.indexOf("SECRET_ADDR") >= 0 || text.indexOf("37529") >= 0) {
      throw new Error("self_test_leaked");
    }
    if (text.indexOf("OTHER_ONE") < 0 || text.indexOf("zzz_twin") < 0) throw new Error("self_test_missing_other");
    if (text.indexOf("subId=22") < 0 || text.indexOf("row=31") < 0) throw new Error("self_test_missing_ids");
    const foreign = assess(ctx, gs, d1.concat([{ sheet: "БП", nick: "stranger", label: "stranger" }]), {
      before: gas.before,
      changes: gas.changes.concat([{ op: "drop", who: "stranger", sheet: "БП", cell: "stranger", subId: "1", row: 2 }]),
      otherClients: gas.otherClients
    });
    if (foreign.ok) throw new Error("self_test_foreign_passed");
    const skip = assess(ctx, gs, [
      { sheet: "ПП", subId: "10", nick: "Андрей", label: "Андрей" }
    ], { before: [{ sheet: "ПП", row: 9, cell: "Андрей", subId: "10" }], changes: [{ op: "skip", who: "Андрей", reason: "no_andreiprigunov_card" }], otherClients: { bothSheets: [], nameOnlyTwins: [] } });
    if (skip.ok || skip.reasons.indexOf("andrei_skip") < 0) throw new Error("self_test_skip");
    console.log("self_test ok lines=" + view.lines.length + " other_both=1");
    return;
  }

  const secret = String(process.env.GAS_SHARED_SECRET || "").trim();
  say("gas_secret=" + (secret ? "set" : "absent"), secret);
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    say("token_missing", secret);
    process.exitCode = 3;
    return;
  }
  const confirm = String(process.env.REPAIR_CONFIRM || "") === CONFIRM;
  say("mode=" + (confirm ? "confirm" : "dry"), secret);

  const snap = await d1Select("listSubscriptions");
  if (!snap.ok) {
    say("d1_read_failed " + String(snap.reason || "").slice(0, 160), secret);
    process.exitCode = 4;
    return;
  }
  let list = { status: "success", subscriptions: [] };
  if (snap.rows[0] && snap.rows[0].payload) {
    try { list = JSON.parse(snap.rows[0].payload) || list; } catch (e) { list = { subscriptions: [] }; }
  }
  const d1Rows = Array.isArray(list.subscriptions) ? list.subscriptions : [];
  const gas = await gasCall(secret, { confirm: "", dry: "1" });
  say("gas_dry http=" + gas.http + " status=" + ((gas.json && gas.json.status) || gas.error || "no_json") + " bytes=" + gas.bytes, secret);
  if (!gas.json || gas.json.status !== "success") {
    say("gas_dry_failed", secret);
    process.exitCode = 4;
    return;
  }
  const view = assess(ctx, gs, d1Rows, gas.json);
  for (let i = 0; i < view.lines.length; i++) say(view.lines[i], secret);
  say("gate ok=" + (view.ok ? "1" : "0") + " reasons=" + (view.reasons.join(",") || "-") + " writes=" + view.writes, secret);
  if (!view.ok) {
    say("stop_no_write", secret);
    process.exitCode = 2;
    return;
  }
  if (!confirm) {
    say("dry_only", secret);
    return;
  }
  if (!view.writes) {
    say("nothing_to_write", secret);
    return;
  }
  const d1w = await writeD1(ctx, list, view.plan);
  say("d1_write ok=" + (d1w.ok ? "1" : "0") + " removed=" + (d1w.removed || 0) + (d1w.reason ? " reason=" + d1w.reason : ""), secret);
  if (!d1w.ok) {
    process.exitCode = 5;
    return;
  }
  const gasW = await gasCall(secret, { confirm: CONFIRM, dry: "0" });
  say("gas_write http=" + gasW.http + " status=" + ((gasW.json && gasW.json.status) || gasW.error || "no_json") + " bytes=" + gasW.bytes, secret);
  if (!gasW.json || gasW.json.status !== "success") {
    say("gas_write_failed", secret);
    process.exitCode = 5;
    return;
  }
  const snap2 = await d1Select("listSubscriptions");
  let list2 = { subscriptions: [] };
  if (snap2.ok && snap2.rows[0] && snap2.rows[0].payload) {
    try { list2 = JSON.parse(snap2.rows[0].payload) || list2; } catch (e2) { list2 = { subscriptions: [] }; }
  }
  const gas2 = await gasCall(secret, { confirm: "", dry: "1" });
  say("gas_verify http=" + gas2.http + " status=" + ((gas2.json && gas2.json.status) || gas2.error || "no_json"), secret);
  const again = assess(
    ctx,
    gs,
    Array.isArray(list2.subscriptions) ? list2.subscriptions : [],
    gas2.json || { changes: [{ op: "unread" }], before: [], otherClients: { bothSheets: [], nameOnlyTwins: [] } }
  );
  for (let i = 0; i < again.lines.length; i++) say("verify " + again.lines[i], secret);
  const left = (again.plan.changes || []).filter((c) => c.op !== "skip").length +
    (((gas2.json && gas2.json.changes) || []).filter((c) => c.op !== "skip").length);
  say("verify_left writes=" + left, secret);
  if (left) {
    say("verify_not_clean", secret);
    process.exitCode = 6;
  } else {
    say("verify_clean", secret);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    const msg = String((e && e.message) || "error").slice(0, 80);
    console.log("failed: " + msg);
    process.exitCode = 1;
  });
}
