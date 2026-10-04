#!/usr/bin/env node
/**
 * Восстановление одной записи andreiprigunov на 2026-10-05.
 * id остаётся «Будущая неделя:ANDREIPRIGUNOV».
 * Суббота 2026-10-03 и карточка ПП не пишутся.
 *
 * Сеть только при RESTORE_CONFIRM=restore-andreiprigunov-oct5 и --allow-write.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CONFIRM = "restore-andreiprigunov-oct5";
const TARGET_ID = "Будущая неделя:ANDREIPRIGUNOV";
const BLOCKED_ID = "Суббота:ANDREIPRIGUNOV";
const TARGET_DATE = "2026-10-05";
const BLOCKED_DATE = "2026-10-03";
const TARGET_DAY = "Будущая неделя";
const BACKUP_KEY = "restoreBackup:2026-10-05:ANDREIPRIGUNOV";
const WORKER_NAME = "boinya-c-oct5-restore-tmp";
const DB_ID = "8ab3668c-a654-432c-9ebd-a1ac5c4db800";
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec";
const UPDATE_SQL =
  "UPDATE orders SET status = 'active', updated_at = ? WHERE id = ? AND status = 'deleted' AND date_iso = ? AND instr(upper(replace(replace(coalesce(match_key,''),'.',''),'_','')), 'ANDREIPRIGUNOV') > 0";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function stripPhone(s) {
  return String(s || "").replace(/\+?\d[\d\-\s()]{6,}\d/g, "[tel]");
}

function normalizeMatchKey_(raw) {
  var s = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  var at = s.match(/@([A-Za-z0-9._]{2,})/);
  var handle = "";
  if (at) handle = at[1];
  else if (/^[A-Za-z0-9._]{3,}$/.test(s) && /[A-Za-z]/.test(s)) handle = s;
  else {
    var parts = s.split(/\s+/);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i].replace(/^[.,;:]+|[.,;:]+$/g, "");
      if (/^[A-Za-z0-9._]{3,}$/.test(p) && /[A-Za-z]/.test(p)) {
        handle = p;
        break;
      }
    }
  }
  if (handle) return handle.toUpperCase().replace(/[._]/g, "");
  return s.toUpperCase().replace(/Ё/g, "Е");
}

function selfTest() {
  assert(TARGET_ID !== BLOCKED_ID, "ids differ");
  assert(TARGET_ID.indexOf("Будущая") === 0, "target is future week");
  assert(UPDATE_SQL.indexOf("Суббота") < 0, "update sql has no saturday");
  assert(UPDATE_SQL.indexOf("status = 'deleted'") > 0, "update only deleted");
  assert(UPDATE_SQL.indexOf("listSubscriptions") < 0, "update is orders only");
  assert(stripPhone("тел +375291112233").indexOf("375") < 0, "phone stripped");
  assert(normalizeMatchKey_("andreiprigunov") === "ANDREIPRIGUNOV", "mk");
  const src = workerSource("k", "sec");
  const updates = src.split("UPDATE orders");
  assert(updates.length === 2, "one update");
  assert(src.indexOf("Суббота:ANDREIPRIGUNOV") > 0, "saturday is read");
  assert(src.indexOf("listSubscriptions") > 0, "card is read");
  assert(!/UPDATE[^;]*listSubscriptions/.test(src), "card snap is not updated");
  assert(!/DELETE FROM orders/.test(src), "no order delete");
  assert(src.indexOf(BACKUP_KEY) < src.indexOf(UPDATE_SQL), "backup key is before the update sql");
  console.log("self_test ok");
}

function workerSource(key) {
  return `
const KEY = ${JSON.stringify(key)};
const CONFIRM = ${JSON.stringify(CONFIRM)};
const TARGET_ID = ${JSON.stringify(TARGET_ID)};
const BLOCKED_ID = ${JSON.stringify(BLOCKED_ID)};
const TARGET_DATE = ${JSON.stringify(TARGET_DATE)};
const BLOCKED_DATE = ${JSON.stringify(BLOCKED_DATE)};
const TARGET_DAY = ${JSON.stringify(TARGET_DAY)};
const BACKUP_KEY = ${JSON.stringify(BACKUP_KEY)};
const GAS_URL = ${JSON.stringify(GAS_URL)};
const UPDATE_SQL = ${JSON.stringify(UPDATE_SQL)};
const TOMB_MS = 48 * 60 * 60 * 1000;

${stripPhone.toString()}
${normalizeMatchKey_.toString()}

function parseJson(raw, fallback) {
  try { return JSON.parse(raw || ""); } catch (e) { return fallback; }
}

async function getSnap(env, cacheKey) {
  const row = await env.DB.prepare(
    "SELECT payload, updated_at FROM snap_cache WHERE cache_key = ?"
  ).bind(cacheKey).first();
  if (!row) return null;
  return { payload: parseJson(row.payload, null), updatedAt: row.updated_at || "", raw: row.payload || "" };
}

async function putSnap(env, cacheKey, payload) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at"
  ).bind(cacheKey, JSON.stringify(payload), now).run();
  return now;
}

function keysFor(row) {
  const out = Object.create(null);
  function add(raw) {
    const mk = normalizeMatchKey_(raw);
    if (mk) out[mk] = true;
    const up = String(raw || "").replace(/\\s+/g, " ").trim().toUpperCase().replace(/Ё/g, "Е");
    if (up) out[up] = true;
  }
  add(row && row.match_key);
  add(row && row.client);
  add("andreiprigunov");
  return Object.keys(out);
}

function tombFresh(pk) {
  if (!pk || !pk.mk || pk.cleared) return false;
  const at = Number(pk.at || 0);
  if (!(at > 0)) return false;
  return Date.now() - at < TOMB_MS;
}

async function tombPresent(env, cacheKey) {
  const hit = await getSnap(env, cacheKey);
  return tombFresh(hit && hit.payload);
}

function listHit(items, day, keys) {
  const now = Date.now();
  return (items || []).some(function (t) {
    if (!t || String(t.day) !== day) return false;
    if (now - Number(t.at || 0) >= TOMB_MS) return false;
    return keys.indexOf(String(t.mk || "")) >= 0;
  });
}

function epochHidesFuture(ep) {
  if (!ep || !ep.to) return false;
  if (String(ep.to) === TARGET_DAY) return false;
  const from = String(ep.from || "");
  const age = Date.now() - Number(ep.at || 0);
  if (!(age >= 0 && age < 7 * 24 * 60 * 60 * 1000)) return false;
  if (from) return from === TARGET_DAY;
  return false;
}

function basketInfo(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  let withQty = 0;
  const names = [];
  for (let i = 0; i < arr.length && i < 40; i++) {
    const it = arr[i];
    if (!it) continue;
    const name = String(it.name || it.main || it.title || "").slice(0, 80);
    if (name) names.push(name);
    const val = Number(it.val != null ? it.val : it.value) || 0;
    if (name && val > 0) withQty++;
  }
  return { count: arr.length, withQty: withQty, names: names };
}

function cardProbe(payload) {
  const arr = payload && (payload.subscriptions || payload.items) || [];
  const list = Array.isArray(arr) ? arr : [];
  let host = false;
  let name53 = false;
  for (let i = 0; i < list.length; i++) {
    const row = list[i] || {};
    const blob = [row.nick, row.label, row.name, row.client, row.match_key].join(" ").toUpperCase();
    if (blob.indexOf("ANDREIPRIGUNOV") >= 0 || blob.indexOf("ПРИГУНОВ") >= 0) host = true;
    const sid = String(row.subId || row.id || "");
    const nick = String(row.nick || row.label || row.name || "").toUpperCase().replace(/Ё/g, "Е").replace(/\\s+/g, "");
    if (sid === "53" && nick === "АНДРЕЙ") name53 = true;
  }
  return { subsStored: list.length, cardInList: host, nameOnly53: name53 };
}

async function patchMonth(env, iso) {
  const q = await env.DB.prepare(
    "SELECT COUNT(DISTINCT match_key) AS c FROM orders WHERE status = 'active' AND date_iso = ?"
  ).bind(iso).first();
  const d1c = Number(q && q.c) || 0;
  const month = iso.slice(0, 7);
  const keys = ["monthOverview:" + month, "monthOverview"];
  for (let i = 0; i < keys.length; i++) {
    const hit = await getSnap(env, keys[i]);
    let body = hit && hit.payload;
    if (!body || !Array.isArray(body.days)) {
      if (d1c === 0 || keys[i] !== "monthOverview:" + month) continue;
      body = { status: "success", month: month, days: [], total: 0 };
    }
    let found = false;
    body.days = (body.days || []).map(function (d) {
      if (!d || d.dateIso !== iso) return d;
      found = true;
      return Object.assign({}, d, { count: d1c, fromD1: true });
    });
    if (!found && d1c > 0) {
      body.days.push({ dateIso: iso, count: d1c, fromD1: true });
      body.days.sort(function (a, b) { return String(a.dateIso).localeCompare(String(b.dateIso)); });
    }
    if (!found && d1c === 0) continue;
    body.total = (body.days || []).reduce(function (s, d) { return s + (Number(d.count) || 0); }, 0);
    await putSnap(env, keys[i], body);
  }
  return d1c;
}

function unwrapGas(text) {
  const s = String(text || "").trim();
  if (s.charAt(0) === "{") return JSON.parse(s);
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
  return null;
}

async function mirrorSheet(row, secret) {
  const meta = parseJson(row.meta_json, {}) || {};
  const basket = parseJson(row.basket_json, []);
  const body = {
    action: "saveOrder"
    client: String(row.client || "andreiprigunov"),
    matchKey: String(row.match_key || ""),
    day: TARGET_DAY,
    date: TARGET_DATE,
    address: String(row.address || ""),
    phone: String(row.phone || ""),
    note: String(row.note || ""),
    basket: Array.isArray(basket) ? basket : [],
    segment: "ПП",
    orderType: "transfer",
    source: "transfer",
    orderPrice: meta.orderPrice != null && meta.orderPrice !== "" ? meta.orderPrice : "61",
    ppSlot: meta.ppSlot != null && meta.ppSlot !== "" ? String(meta.ppSlot) : "1",
    deliverySlot: meta.deliverySlot != null && meta.deliverySlot !== "" ? meta.deliverySlot : 1,
    deliveriesN: meta.deliveriesN != null && meta.deliveriesN !== "" ? meta.deliveriesN : 1,
    ppHint: meta.ppHint || "ПП N=1",
    noCut: meta.noCut === true,
    ppPartner: meta.ppPartner || ""
  };
  if (secret) body._wk = secret;
  let res = await fetch(GAS_URL, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("Location") || res.headers.get("location");
    if (loc) res = await fetch(loc, { method: "GET", redirect: "follow" });
  }
  const text = await res.text();
  let json = null;
  try { json = unwrapGas(text); } catch (e) { json = null; }
  if (!json) {
    return { status: "gas_parse", http: res.status, snippet: stripPhone(text).replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").slice(0, 160) };
  }
  return {
    status: json.status || "",
    http: res.status,
    wrote: json.wrote != null ? json.wrote : null,
    basketLen: json.basketLen != null ? json.basketLen : null,
    missed: Array.isArray(json.missed) ? json.missed.length : 0,
    day: json.day || "",
    redirected: !!json.redirected,
    segment: json.segment || "",
    orderPrice: json.orderPrice != null ? json.orderPrice : "",
    ppSlot: json.ppSlot || "",
    message: stripPhone(json.message || "").slice(0, 160)
  };
}

async function readOrders(env) {
  const q = await env.DB.prepare(
    "SELECT id, status, date_iso, day_name, match_key, client, address, phone, note, basket_json, meta_json, updated_at FROM orders WHERE id = ? OR id = ? OR ((instr(upper(replace(replace(coalesce(match_key,''),'.',''),'_','')), 'ANDREIPRIGUNOV') > 0 OR instr(upper(replace(replace(coalesce(client,''),'.',''),'_','')), 'ANDREIPRIGUNOV') > 0) AND date_iso IN (?, ?))"
  ).bind(TARGET_ID, BLOCKED_ID, TARGET_DATE, BLOCKED_DATE).all();
  return (q && q.results) || [];
}

function brief(row) {
  if (!row) return null;
  const basket = basketInfo(parseJson(row.basket_json, []));
  return {
    id: row.id,
    status: row.status,
    date: row.date_iso,
    day: row.day_name,
    updatedAt: row.updated_at,
    addressPresent: !!(row.address && String(row.address).trim()),
    phonePresent: !!(row.phone && String(row.phone).trim()),
    basketCount: basket.count,
    basketWithQty: basket.withQty,
    basketNames: basket.names
  };
}

export default {
  async fetch(request, env) {
    if (request.headers.get("x-repair-key") !== KEY) return new Response("denied", { status: 403 });
    if (request.headers.get("x-restore-confirm") !== CONFIRM) return new Response("denied", { status: 403 });
    const secret = String(request.headers.get("x-gas-secret") || "");
    const rows = await readOrders(env);
    const target = rows.filter(function (r) { return r.id === TARGET_ID; })[0] || null;
    const blocked = rows.filter(function (r) { return r.id === BLOCKED_ID; })[0] || null;
    if (!target) return Response.json({ ok: false, step: "missing_target" });
    if (target.id !== TARGET_ID || target.date_iso !== TARGET_DATE) {
      return Response.json({ ok: false, step: "target_mismatch", date: target.date_iso || "" });
    }
    const mk = normalizeMatchKey_(target.match_key || target.client || "");
    if (mk.indexOf("ANDREIPRIGUNOV") < 0) return Response.json({ ok: false, step: "match_mismatch" });
    if (blocked && String(blocked.status) === "active") {
      return Response.json({ ok: false, step: "saturday_active_abort" });
    }
    const cardBeforeHit = await getSnap(env, "listSubscriptions");
    const cardBefore = cardProbe(cardBeforeHit && cardBeforeHit.payload);
    const subsUpdatedBefore = (cardBeforeHit && cardBeforeHit.updatedAt) || "";
    const tombSnapBefore = await getSnap(env, "subDeleteTombstones");
    const tombUpdatedBefore = (tombSnapBefore && tombSnapBefore.updatedAt) || "";
    const keys = keysFor(target);
    const futureKey = "delTomb:" + TARGET_DAY + ":" + mk;
    const calKey = "delTomb:CAL:" + TARGET_DATE + ":" + mk;
    const satKey = "delTomb:Суббота:" + mk;
    const cal3Key = "delTomb:CAL:" + BLOCKED_DATE + ":" + mk;
    const tombsBefore = {
      future: await tombPresent(env, futureKey),
      cal5: await tombPresent(env, calKey),
      saturday: await tombPresent(env, satKey),
      cal3: await tombPresent(env, cal3Key)
    };
    const backupBefore = await getSnap(env, BACKUP_KEY);
    let backupWrote = false;
    if (String(target.status) === "deleted") {
      const backupRow = {
        id: target.id,
        status: target.status,
        date_iso: target.date_iso,
        day_name: target.day_name,
        client: target.client,
        match_key: target.match_key,
        address: target.address,
        note: target.note,
        phone: target.phone,
        basket_json: target.basket_json,
        segment: target.segment,
        source: target.source,
        meta_json: target.meta_json,
        updated_at: target.updated_at
      };
      await putSnap(env, BACKUP_KEY, backupRow);
      const check = await getSnap(env, BACKUP_KEY);
      if (!check || !check.payload || check.payload.id !== TARGET_ID || check.payload.date_iso !== TARGET_DATE) {
        return Response.json({ ok: false, step: "backup_failed" });
      }
      backupWrote = true;
      const now = new Date().toISOString();
      const upd = await env.DB.prepare(UPDATE_SQL).bind(now, TARGET_ID, TARGET_DATE).run();
      const changes = Number(upd && upd.meta && upd.meta.changes) || 0;
      if (changes !== 1) {
        const checkRow = await env.DB.prepare(
          "SELECT status, date_iso FROM orders WHERE id = ?"
        ).bind(TARGET_ID).first();
        if (!checkRow || checkRow.status !== "active" || checkRow.date_iso !== TARGET_DATE) {
          return Response.json({ ok: false, step: "update_changes", changes: changes, backupWrote: true });
        }
      }
    } else if (String(target.status) !== "active") {
      return Response.json({ ok: false, step: "bad_status", status: String(target.status || "") });
    } else if (!backupBefore) {
      return Response.json({ ok: false, step: "active_without_backup" });
    }
    const listHitBefore = await getSnap(env, "deleteTombstones");
    const items = ((listHitBefore && listHitBefore.payload && listHitBefore.payload.items) || []).filter(function (t) {
      if (!t) return false;
      if (String(t.day) !== TARGET_DAY) return true;
      return keys.indexOf(String(t.mk || "")) < 0;
    });
    await putSnap(env, "deleteTombstones", { items: items });
    for (let i = 0; i < keys.length; i++) {
      await env.DB.prepare("DELETE FROM snap_cache WHERE cache_key = ?").bind("delTomb:" + TARGET_DAY + ":" + keys[i]).run();
      await env.DB.prepare("DELETE FROM snap_cache WHERE cache_key = ?").bind("delTomb:CAL:" + TARGET_DATE + ":" + keys[i]).run();
    }
    await env.DB.prepare("DELETE FROM snap_cache WHERE cache_key = ?").bind("viewDate:" + TARGET_DATE).run();
    await env.DB.prepare("DELETE FROM snap_cache WHERE cache_key = ?").bind("view:" + TARGET_DAY).run();
    await env.DB.prepare("DELETE FROM snap_cache WHERE cache_key = ?").bind("clients:" + TARGET_DAY).run();
    const epoch = await getSnap(env, "moveEpoch:" + mk);
    let epochFixed = false;
    if (epochHidesFuture(epoch && epoch.payload)) {
      await putSnap(env, "moveEpoch:" + mk, { at: Date.now(), from: "", to: TARGET_DAY, client: String(target.client || "") });
      epochFixed = true;
    }
    const d1Count = await patchMonth(env, TARGET_DATE);
    let gas = { status: "skipped" };
    try {
      gas = await mirrorSheet(target, secret);
    } catch (eGas) {
      gas = { status: "gas_error", message: stripPhone(eGas && eGas.message || eGas).slice(0, 160) };
    }
    const afterRows = await readOrders(env);
    const after = afterRows.filter(function (r) { return r.id === TARGET_ID; })[0] || null;
    const sat = afterRows.filter(function (r) { return r.id === BLOCKED_ID; })[0] || null;
    const oct3Active = afterRows.filter(function (r) {
      return r.date_iso === BLOCKED_DATE && String(r.status) === "active";
    }).length;
    const cardAfterHit = await getSnap(env, "listSubscriptions");
    const cardAfter = cardProbe(cardAfterHit && cardAfterHit.payload);
    const subsUpdatedAfter = (cardAfterHit && cardAfterHit.updatedAt) || "";
    const tombSnapAfter = await getSnap(env, "subDeleteTombstones");
    const monthHit = await getSnap(env, "monthOverview:2026-10");
    let monthCount = null;
    const days = (monthHit && monthHit.payload && monthHit.payload.days) || [];
    for (let d = 0; d < days.length; d++) {
      if (days[d] && days[d].dateIso === TARGET_DATE) monthCount = Number(days[d].count) || 0;
    }
    const futureAfter = await tombPresent(env, futureKey);
    const cal5After = await tombPresent(env, calKey);
    const satAfter = await tombPresent(env, satKey);
    const cal3After = await tombPresent(env, cal3Key);
    const listAfter = await getSnap(env, "deleteTombstones");
    const listStill = listHit((listAfter && listAfter.payload && listAfter.payload.items) || [], TARGET_DAY, keys);
    const epochAfter = await getSnap(env, "moveEpoch:" + mk);
    const hides = epochHidesFuture(epochAfter && epochAfter.payload);
    const backup = await getSnap(env, BACKUP_KEY);
    const active = !!(after && after.status === "active" && after.date_iso === TARGET_DATE && after.id === TARGET_ID);
    const dayViewWouldShow = active && !futureAfter && !cal5After && !listStill && !hides;
    const oct3Inactive = oct3Active === 0 && (!sat || String(sat.status) !== "active");
    return Response.json({
      ok: active && oct3Inactive && !!(backup && backup.payload && backup.payload.id === TARGET_ID) && !cardAfter.cardInList && cardBefore.subsStored === cardAfter.subsStored && subsUpdatedBefore === subsUpdatedAfter,
      backupWrote: backupWrote,
      backupPresent: !!(backup && backup.payload && backup.payload.id === TARGET_ID),
      backupDate: (backup && backup.payload && backup.payload.date_iso) || "",
      backupStatus: (backup && backup.payload && backup.payload.status) || "",
      activatedFromDeleted: backupWrote,
      oct5: brief(after),
      oct3: brief(sat),
      oct3Active: oct3Active,
      hisRows: afterRows.map(function (r) { return { id: r.id, status: r.status, date: r.date_iso, day: r.day_name }; }),
      d1Count: d1Count,
      monthCount: monthCount,
      monthMatchesD1: monthCount === d1Count,
      dayViewWouldShow: dayViewWouldShow,
      tombsBefore: tombsBefore,
      tombsAfter: { future: futureAfter, cal5: cal5After, saturday: satAfter, cal3: cal3After },
      saturdayTombKept: tombsBefore.saturday === satAfter && tombsBefore.cal3 === cal3After,
      epochFixed: epochFixed,
      gas: gas,
      basket: basketInfo(parseJson(target.basket_json, [])),
      cardBefore: cardBefore,
      cardAfter: cardAfter,
      subsUpdatedSame: subsUpdatedBefore === subsUpdatedAfter,
      subTombUpdatedSame: tombUpdatedBefore === ((tombSnapAfter && tombSnapAfter.updatedAt) || ""),
      cardUntouched: !cardAfter.cardInList && cardBefore.subsStored === cardAfter.subsStored && subsUpdatedBefore === subsUpdatedAfter && tombUpdatedBefore === ((tombSnapAfter && tombSnapAfter.updatedAt) || "")
    });
  }
};
`;
}

async function main() {
  if (process.argv.indexOf("--self-test") >= 0) {
    selfTest();
    return;
  }
  const allowWrite = process.argv.indexOf("--allow-write") >= 0;
  const confirm = String(process.env.RESTORE_CONFIRM || "");
  if (!allowWrite || confirm !== CONFIRM) {
    console.log(JSON.stringify({
      write: false,
      target: TARGET_ID,
      date: TARGET_DATE,
      blocked: BLOCKED_ID,
      backup: BACKUP_KEY,
      card: false
    }));
    console.log("dry-run: запись не выполнялась");
    return;
  }
  const token = process.env.CLOUDFLARE_API_TOKEN || "";
  const gasSecret = String(process.env.GAS_SHARED_SECRET || "");
  if (!token) {
    console.log("no_cloudflare_token");
    process.exitCode = 3;
    return;
  }
  if (!gasSecret) console.log("gas_secret_absent");
  const key = crypto.randomBytes(24).toString("hex");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "andrei-oct5-restore-"));
  const scrub = function (s) {
    let out = String(s || "").split(key).join("[key]");
    if (gasSecret) out = out.split(gasSecret).join("[secret]");
    return out.replace(/\b[a-f0-9]{32}\b/g, "[id]");
  };
  fs.writeFileSync(
    path.join(dir, "wrangler.toml"),
    'name = "' + WORKER_NAME + '"\nmain = "worker.js"\ncompatibility_date = "2024-11-01"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "boinya-c"\ndatabase_id = "' + DB_ID + '"\n'
  );
  fs.writeFileSync(path.join(dir, "worker.js"), workerSource(key));
  const env = Object.assign({}, process.env, { CI: "true" });
  if (!env.CLOUDFLARE_ACCOUNT_ID) delete env.CLOUDFLARE_ACCOUNT_ID;
  function run(args) {
    return execFileSync("npx", args, { cwd: dir, env: env, encoding: "utf8", timeout: 180000 });
  }
  try {
    let out = "";
    try {
      out = run(["wrangler@4", "deploy"]);
    } catch (eDep) {
      console.log(scrub((eDep && (eDep.stdout || eDep.stderr || eDep.message)) || "").slice(0, 1500));
      process.exitCode = 4;
      return;
    }
    const urls = scrub(out).match(/https:\/\/boinya-c-oct5-restore-tmp\.[a-z0-9.-]+\.workers\.dev/g) || [];
    const host = urls[0] || "https://" + WORKER_NAME + ".konchaarsenia.workers.dev";
    console.log("helper_host_ok", urls.length ? "1" : "0");
    let res = null;
    let text = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await new Promise(function (r) { setTimeout(r, 3000); });
      res = await fetch(host + "/", {
        headers: {
          "x-repair-key": key,
          "x-restore-confirm": CONFIRM,
          "x-gas-secret": gasSecret
        }
      });
      text = await res.text();
      console.log("helper_http", res.status, "bytes", text.length, "try", attempt + 1);
      if (res.ok) break;
    }
    if (!res || !res.ok) {
      console.log(scrub(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 240));
      process.exitCode = 5;
      return;
    }
    const report = JSON.parse(text);
    console.log(JSON.stringify(report));
    if (!report.ok) process.exitCode = 6;
  } finally {
    try {
      run(["wrangler@4", "delete", "--force"]);
      console.log("helper_deleted");
    } catch (eDel) {
      console.log("helper_delete_failed");
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (eRm) {}
  }
}

main().catch(function (e) {
  console.log("restore_failed", String((e && e.message) || e).slice(0, 300));
  process.exitCode = 1;
});
