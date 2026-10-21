import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const eng = require(path.join(root, "boinya-c/next/order-engine.js"));
const pay = require(path.join(root, "boinya-c/next/order-payload.js"));

const FROM = "2026-10-22";

function normalizeMatchKey_(raw) {
  var s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  var at = s.match(/@([A-Za-z0-9._]{2,})/);
  var handle = "";
  if (at) handle = at[1];
  else if (/^[A-Za-z0-9._]{3,}$/.test(s) && /[A-Za-z]/.test(s)) handle = s;
  else {
    s = s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s*\b(АФК|ПП|БП|Р)\b\s*/gi, " ").replace(/\s+/g, " ").trim();
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

function isoDay(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

function sheetFold(raw) {
  const x = String(raw || "").trim().toUpperCase();
  if (x === "PP") return "ПП";
  if (x === "AFK") return "АФК";
  if (x === "BP") return "БП";
  return x;
}

function rowsOf(file) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const blocks = Array.isArray(data) ? data : [data];
  const out = [];
  blocks.forEach(function (block) {
    if (block && Array.isArray(block.results)) out.push.apply(out, block.results);
  });
  return out;
}

function cardKeys(card) {
  const keys = [];
  const seen = Object.create(null);
  [card.nick, card.label, card.name, card.client].forEach(function (raw) {
    const k = normalizeMatchKey_(raw);
    if (!k || seen[k]) return;
    seen[k] = true;
    keys.push(k);
  });
  return keys;
}

export function planAddrParts_(orders, cards, clients) {
  const future = [];
  const past = [];
  const skip = [];
  (orders || []).forEach(function (row) {
    const raw = String(row.address || "");
    const split = pay.addressLossless(raw, eng);
    const iso = isoDay(row.date_iso);
    const item = {
      id: row.id,
      client: row.client,
      date: row.date_iso || "",
      iso: iso,
      before: raw,
      shown: split.shown,
      reason: split.reason,
      street: split.parts.street,
      entrance: split.parts.entrance,
      doorCode: split.parts.doorCode,
      floor: split.parts.floor,
      flat: split.parts.flat
    };
    if (!split.ok) {
      skip.push(item);
      return;
    }
    if (iso && iso >= FROM && String(row.status || "active") === "active") future.push(item);
    else past.push(item);
  });
  const byKey = Object.create(null);
  (cards || []).forEach(function (card) {
    const sheet = sheetFold(card.sheet || card.segment);
    cardKeys(card).forEach(function (key) {
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push({
        nick: card.nick || "",
        label: card.label || "",
        subId: String(card.subId || card.id || ""),
        sheet: sheet,
        hasAddr: !!(card.address && String(card.address).trim()),
        hasPhone: !!(card.phone && String(card.phone).trim()),
        hasDog: !!(card.dogName && String(card.dogName).trim())
      });
    });
  });
  const clientBy = Object.create(null);
  (clients || []).forEach(function (row) {
    const key = normalizeMatchKey_(row.match_key || row.nick || row.label);
    if (key) clientBy[key] = row;
  });
  const misses = [];
  const dupes = [];
  Object.keys(byKey).forEach(function (key) {
    const pp = byKey[key].filter(function (c) { return c.sheet === "ПП"; });
    const ids = Object.create(null);
    pp.forEach(function (c) { if (c.subId) ids[c.subId] = true; });
    if (Object.keys(ids).length > 1) dupes.push({ key: key, cards: pp });
  });
  return { from: FROM, future: future, past: past, skip: skip, byKey: byKey, clientBy: clientBy, dupes: dupes, misses: misses };
}

function missForOrder(order, plan) {
  const key = normalizeMatchKey_(order.match_key || order.client);
  const seg = String(order.segment || "").toUpperCase();
  const src = String(order.source || "").toLowerCase();
  const isPp = seg === "ПП" || seg === "PP" || seg === "АФК" || seg === "AFK" || src === "pp" || src === "subscription" || src === "afk";
  if (!isPp) return null;
  const hits = (key && plan.byKey[key]) || [];
  const pp = hits.filter(function (c) { return c.sheet === "ПП"; });
  const client = key && plan.clientBy[key];
  const ids = Object.create(null);
  pp.forEach(function (c) { if (c.subId) ids[c.subId] = true; });
  let why = "";
  if (Object.keys(ids).length > 1) why = "две карточки ПП";
  else if (!pp.length && hits.length) why = "карточка на листе " + hits.map(function (c) { return c.sheet; }).join(",");
  else if (!pp.length && !hits.length && client) why = "нет карточки, есть строка clients";
  else if (!pp.length && !hits.length) why = "нет карточки с этим ключом";
  else if (pp.length && !pp.some(function (c) { return c.hasAddr || c.hasPhone || c.hasDog; })) {
    why = client && (client.has_addr || client.has_phone || client.has_dog) ? "карточка пустая, данные в clients" : "карточка без адреса, телефона и клички";
  }
  if (!why) return null;
  return {
    client: order.client,
    key: key,
    date: order.date_iso,
    why: why,
    card: pp[0] ? { nick: pp[0].nick, label: pp[0].label, subId: pp[0].subId, hasAddr: pp[0].hasAddr } : null,
    other: hits.filter(function (c) { return c.sheet !== "ПП"; }).map(function (c) {
      return { nick: c.nick, sheet: c.sheet, subId: c.subId };
    })
  };
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("need dir");
    process.exit(1);
  }
  const orders = rowsOf(path.join(dir, "glued.json"));
  const recent = rowsOf(path.join(dir, "recent.json"));
  const snapRows = rowsOf(path.join(dir, "subs.json"));
  const clients = rowsOf(path.join(dir, "clients.json"));
  let cards = [];
  snapRows.forEach(function (row) {
    try {
      const payload = JSON.parse(row.payload || "{}");
      cards = cards.concat(payload.subscriptions || payload.items || []);
    } catch (e) {}
  });
  const plan = planAddrParts_(orders, cards, clients);
  const seenMiss = Object.create(null);
  recent.forEach(function (order) {
    const miss = missForOrder(order, plan);
    if (!miss) return;
    const id = miss.key + "|" + miss.why;
    if (seenMiss[id]) return;
    seenMiss[id] = true;
    plan.misses.push(miss);
  });
  const out = {
    from: plan.from,
    future: plan.future,
    past: plan.past,
    skip: plan.skip.map(function (row) {
      return { id: row.id, client: row.client, date: row.date, reason: row.reason, before: row.before };
    }),
    dupes: plan.dupes,
    misses: plan.misses
  };
  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(out, null, 2));
  const writeRows = plan.future.map(function (row) {
    return {
      id: row.id,
      before: row.before,
      street: row.street,
      entrance: row.entrance,
      doorCode: row.doorCode,
      floor: row.floor,
      flat: row.flat
    };
  });
  fs.writeFileSync(path.join(dir, "write.json"), JSON.stringify({ rows: writeRows }));
  console.log(JSON.stringify({
    future: plan.future.length,
    past: plan.past.length,
    skip: plan.skip.length,
    dupes: plan.dupes.length,
    misses: plan.misses.length
  }));
}

if (process.argv[1] && process.argv[1].endsWith("addr-parts-plan.mjs")) main();
