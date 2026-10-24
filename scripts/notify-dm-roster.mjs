import fs from "node:fs";
import { notifyDmRoster_ } from "../boinya-c/proxy/notify-group.js";

function parseLoose(raw) {
  const start = raw.indexOf("[") >= 0 ? raw.indexOf("[") : raw.indexOf("{");
  if (start < 0) throw new Error("no json");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === "\"") inStr = false;
      continue;
    }
    if (c === "\"") inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return JSON.parse(raw.slice(start, i + 1));
    }
  }
  return JSON.parse(raw.slice(start));
}

function packs(file) {
  const raw = fs.readFileSync(file, "utf8");
  const data = parseLoose(raw);
  const list = Array.isArray(data) ? data : [data];
  const rows = [];
  list.forEach(function (pack) {
    const got = (pack && pack.results) || [];
    got.forEach(function (row) { rows.push(row); });
  });
  return rows;
}

function snapMap(rows) {
  const out = Object.create(null);
  rows.forEach(function (row) {
    const key = String((row && row.cache_key) || "");
    if (!key) return;
    try { out[key] = JSON.parse(String(row.payload || "")); } catch (e) { out[key] = null; }
  });
  return out;
}

const snaps = snapMap(packs(process.argv[2]));
const metaRows = packs(process.argv[3]);
const access = snaps.listAccess || {};
const chats = snaps.boinya_tg_chats || {};
const admin = snaps.partnerListAdmin || {};
const people = Array.isArray(access.people) ? access.people : [];
const started = Object.create(null);
Object.keys(chats || {}).forEach(function (tid) {
  const row = chats[tid];
  if (row && row.chatId) started[String(tid)] = true;
});
people.forEach(function (p) {
  const tid = String((p && p.telegramId) || "");
  const chat = String((p && p.chatId) || "");
  if (tid && chat && chat === tid) started[tid] = true;
});
metaRows.forEach(function (row) {
  const key = String((row && row.key) || "");
  const m = key.match(/^tg_start_ts:(\d{5,15})$/);
  if (m) started[m[1]] = true;
});
const hub = ((admin && admin.notifyRecipients) || []).map(function (r) {
  return String((r && (r.telegramId || r.id)) || r || "");
});
const roster = notifyDmRoster_({
  people: people,
  hubIds: hub,
  started: started,
  ownerIds: ["650923866"]
});
let probe = "wait";
metaRows.forEach(function (row) {
  if (String(row && row.key) === "notify_dm_probe_ok") {
    probe = String(row.value) === "1" ? "ok" : "fail";
  }
});
console.log("probe " + probe);
console.log("started " + roster.started.map(function (r) { return r.name + " [" + r.role + "]"; }).join("; "));
console.log("missing " + roster.missing.map(function (r) { return r.name + " [" + r.role + "]"; }).join("; "));
