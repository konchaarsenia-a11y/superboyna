#!/usr/bin/env node
/**
 * Read-only hunt for andreiprigunov's ПП card.
 * Prints field names and non-phone values. Does not write D1 or Sheets.
 * Time-travel info only looks up a bookmark. It does not restore.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WORKER_NAME = "boinya-c-card-hunt-tmp";
const DB_ID = "8ab3668c-a654-432c-9ebd-a1ac5c4db800";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function stripPhone(s) {
  return String(s || "").replace(/\+?\d[\d\-\s()]{6,}\d/g, "[tel]");
}

function loose(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/[._\s@]/g, "");
}

function isHost(row) {
  const blob = [row && row.match_key, row && row.client, row && row.nick, row && row.label, row && row.name, row && row.mk]
    .map(loose)
    .join(" ");
  return blob.indexOf("ANDREIPRIGUNOV") >= 0 || blob.indexOf("ПРИГУНОВ") >= 0;
}

function isNameOnly53(row) {
  if (!row) return false;
  const sid = String(row.subId || row.id || "").trim();
  if (sid !== "53") return false;
  const name = loose(row.nick || row.label || row.name || row.client || "");
  return name === "АНДРЕЙ";
}

function isTarget(row) {
  return isHost(row) || isNameOnly53(row);
}

function namesOf(raw) {
  let arr = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw || "[]"); } catch (e) { arr = []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 40).map(function (it) {
    return String((it && (it.name || it.title || it.product)) || "").slice(0, 80);
  }).filter(Boolean);
}

function cardFields(row) {
  const keys = [
    "nick", "label", "name", "sheet", "segment", "subId", "id", "status", "stage",
    "deliveries", "deliveriesN", "factCost", "statedCost", "calcFactCost",
    "clientPrice", "orderPrice", "ppScheme", "scheme", "coef", "ppSlot",
    "paid", "rowIndex", "row", "dogName", "dogBreed", "dogWeight"
  ];
  const out = { kind: isNameOnly53(row) && !isHost(row) ? "andrei-sub53" : "andreiprigunov" };
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (row[k] == null || row[k] === "") continue;
    out[k] = row[k];
  }
  if (row._d1Detail) out._d1Detail = true;
  if (row.wishes) out.wishes = stripPhone(row.wishes).slice(0, 500);
  if (row.note) out.note = stripPhone(row.note).slice(0, 500);
  const basket = namesOf(row.basket || row.basket_json);
  const basket2 = namesOf(row.basket2 || row.basketSlot2);
  if (basket.length) out.basket = basket;
  if (basket2.length) out.basket2 = basket2;
  out.addressPresent = !!(row.address && String(row.address).trim());
  out.phonePresent = !!(row.phone && String(row.phone).trim());
  return out;
}

function walk(node, hits, depth) {
  if (!node || depth > 8) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) walk(node[i], hits, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  if (isTarget(node)) hits.push(cardFields(node));
  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) {
    const v = node[keys[i]];
    if (v && typeof v === "object") walk(v, hits, depth + 1);
  }
}

function selfTest() {
  const hits = [];
  walk({
    subscriptions: [
      { nick: "andreiprigunov", sheet: "ПП", subId: "53", wishes: "сырое", phone: "+375291112233", address: "ул секрет", basket: [{ name: "ЛЁГКОЕ" }], factCost: 140 },
      { nick: "Андрей", sheet: "ПП", subId: "53", deliveries: 2, status: "ДОМ", wishes: "до склейки" },
      { nick: "Андрей", sheet: "ПП", subId: "9", wishes: "чужой" },
      { nick: "other", sheet: "ПП", phone: "+375290000000", wishes: "секрет" }
    ]
  }, hits, 0);
  const blob = JSON.stringify(hits);
  assert(hits.length === 2, "two cards");
  assert(hits[0].phonePresent === true && !/37529/.test(blob), "phone redacted");
  assert(hits[0].addressPresent === true && !/секрет/.test(blob) && !/ул/.test(blob), "address redacted");
  assert(hits[1].kind === "andrei-sub53" && hits[1].deliveries === 2, "name-only 53");
  assert(!/чужой/.test(blob) && !/other/.test(blob), "other client dropped");
  console.log("self_test ok");
}

function workerSource(key) {
  return `
const KEY = ${JSON.stringify(key)};
${stripPhone.toString()}
${loose.toString()}
${isHost.toString()}
${isNameOnly53.toString()}
${isTarget.toString()}
${namesOf.toString()}
${cardFields.toString()}
${walk.toString()}

function parseSnap(raw) {
  try { return JSON.parse(raw || "{}"); } catch (e) { return null; }
}

export default {
  async fetch(request, env) {
    if (request.headers.get("x-repair-key") !== KEY) return new Response("denied", { status: 403 });
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all();
    const tableNames = ((tables && tables.results) || []).map(function (r) { return r.name; });
    const snaps = await env.DB.prepare(
      "SELECT cache_key, updated_at, payload FROM snap_cache WHERE instr(payload, 'andreiprigunov') > 0 OR instr(payload, 'ANDREIPRIGUNOV') > 0 OR instr(payload, 'Andreiprigunov') > 0 OR instr(payload, 'ПРИГУНОВ') > 0 OR instr(payload, 'Пригунов') > 0 OR instr(payload, 'пригунов') > 0 OR cache_key IN ('listSubscriptions','subDeleteTombstones','wishesGeoBackup','listClientProfiles')"
    ).all();
    const rows = (snaps && snaps.results) || [];
    const snapHits = [];
    const cards = [];
    let subsStored = 0;
    let cardInList = false;
    let tomb = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const payload = parseSnap(row.payload);
      const found = [];
      if (payload) walk(payload, found, 0);
      if (row.cache_key === "listSubscriptions") {
        const arr = payload && (payload.subscriptions || payload.items) || [];
        subsStored = Array.isArray(arr) ? arr.length : 0;
        cardInList = found.some(function (c) { return c.kind === "andreiprigunov"; });
      }
      if (row.cache_key === "subDeleteTombstones" && payload && Array.isArray(payload.items)) {
        for (let t = 0; t < payload.items.length; t++) {
          const it = payload.items[t];
          if (!it) continue;
          if (String(it.subId || "") === "53" || isTarget(it)) {
            tomb = {
              nick: it.nick || "",
              mk: it.mk || "",
              sheet: it.sheet || "",
              subId: String(it.subId || ""),
              at: it.at || 0,
              ttl: it.ttl || 0,
              repairNameOnly: !!it.repairNameOnly
            };
          }
        }
      }
      if (!found.length && row.cache_key !== "listSubscriptions") continue;
      snapHits.push({
        key: row.cache_key,
        updatedAt: row.updated_at || "",
        cards: found.length
      });
      for (let f = 0; f < found.length; f++) {
        cards.push(Object.assign({ snap: row.cache_key, updatedAt: row.updated_at || "" }, found[f]));
      }
    }
    let geo = null;
    if (tableNames.indexOf("client_service_geo") >= 0) {
      try {
        const g = await env.DB.prepare(
          "SELECT nick, day FROM client_service_geo WHERE instr(upper(nick), 'ANDREIPRIGUNOV') > 0 OR instr(upper(nick), 'ПРИГУНОВ') > 0 LIMIT 5"
        ).all();
        geo = ((g && g.results) || []).map(function (r) { return { nick: r.nick || "", day: r.day || "" }; });
      } catch (eG) { geo = []; }
    }
    const orders = await env.DB.prepare(
      "SELECT id, status, date_iso, meta_json FROM orders WHERE instr(upper(replace(replace(coalesce(match_key,''),'.',''),'_','')), 'ANDREIPRIGUNOV') > 0 OR instr(upper(replace(replace(coalesce(client,''),'.',''),'_','')), 'ANDREIPRIGUNOV') > 0 ORDER BY updated_at DESC LIMIT 20"
    ).all();
    const metaKeys = {};
    ((orders && orders.results) || []).forEach(function (r) {
      let m = {};
      try { m = JSON.parse(r.meta_json || "{}"); } catch (e) { m = {}; }
      Object.keys(m || {}).forEach(function (k) {
        if (metaKeys[k] == null && m[k] != null && m[k] !== "") {
          const v = m[k];
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") metaKeys[k] = v;
          else metaKeys[k] = Array.isArray(v) ? "array" : "object";
        }
      });
    });
    const now = Date.now();
    const tombAlive = !!(tomb && now - Number(tomb.at || 0) < Number(tomb.ttl || 0));
    return Response.json({
      write: false,
      tables: tableNames,
      subsStored: subsStored,
      cardInList: cardInList,
      physicalGone: !cardInList,
      tomb: tomb,
      tombAlive: tombAlive,
      wouldOldSubIdFilterHideHost: !!(tomb && String(tomb.subId) === "53"),
      snapHits: snapHits,
      cards: cards,
      geo: geo,
      orderMetaSample: metaKeys,
      orderIds: ((orders && orders.results) || []).map(function (r) {
        return { id: r.id, status: r.status, date: r.date_iso };
      })
    });
  }
};
`;
}

async function timeTravelInfo(env, cwd) {
  const stamps = [
    "2026-10-03T18:40:00Z",
    "2026-10-03T19:10:00Z",
    "2026-10-03T19:18:30Z",
    "2026-10-04T07:40:00Z"
  ];
  const out = [];
  for (let i = 0; i < stamps.length; i++) {
    try {
      const text = execFileSync(
        "npx",
        ["wrangler@4", "d1", "time-travel", "info", "boinya-c", "--timestamp=" + stamps[i], "--json"],
        { cwd: cwd, env: env, encoding: "utf8", timeout: 90000 }
      );
      const parsed = JSON.parse(text);
      const bm = String(parsed.bookmark || (parsed.result && parsed.result.bookmark) || "");
      out.push({ timestamp: stamps[i], bookmark: !!bm, bytes: bm.length });
    } catch (e) {
      const msg = String((e && (e.stderr || e.stdout || e.message)) || e);
      out.push({ timestamp: stamps[i], bookmark: false, error: msg.replace(/\s+/g, " ").slice(0, 180) });
    }
  }
  return out;
}

async function main() {
  if (process.argv.indexOf("--self-test") >= 0) {
    selfTest();
    return;
  }
  if (process.env.RESTORE_CONFIRM || process.argv.indexOf("--allow-write") >= 0) {
    console.log("write_refused");
    process.exit(2);
  }
  const token = process.env.CLOUDFLARE_API_TOKEN || "";
  if (!token) {
    console.log("no_cloudflare_token");
    process.exit(3);
  }
  const key = crypto.randomBytes(24).toString("hex");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "andrei-card-hunt-"));
  const scrub = function (s) {
    return String(s || "").split(key).join("[key]");
  };
  fs.writeFileSync(
    path.join(dir, "wrangler.toml"),
    'name = "' + WORKER_NAME + '"\nmain = "worker.js"\ncompatibility_date = "2024-11-01"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "boinya-c"\ndatabase_id = "' + DB_ID + '"\n'
  );
  fs.writeFileSync(path.join(dir, "worker.js"), workerSource(key));
  const env = Object.assign({}, process.env, { CI: "true" });
  if (!env.CLOUDFLARE_ACCOUNT_ID) delete env.CLOUDFLARE_ACCOUNT_ID;
  function run(args, cwd) {
    return execFileSync("npx", args, { cwd: cwd || dir, env: env, encoding: "utf8", timeout: 180000 });
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
    const urls = scrub(out).match(/https:\/\/boinya-c-card-hunt-tmp\.[a-z0-9.-]+\.workers\.dev/g) || [];
    const host = urls[0] || "https://" + WORKER_NAME + ".konchaarsenia.workers.dev";
    console.log("helper_host_ok", urls.length ? "1" : "0");
    let res = null;
    let text = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await new Promise(function (r) { setTimeout(r, 3000); });
      res = await fetch(host + "/", { headers: { "x-repair-key": key } });
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
    report.timeTravel = await timeTravelInfo(env, dir);
    report.timeTravelNote = "bookmark lookup only; database was not restored";
    console.log(JSON.stringify(report));
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
  console.log("hunt_failed", String((e && e.message) || e).slice(0, 300));
  process.exit(1);
});
