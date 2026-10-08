#!/usr/bin/env node
/**
 * Read-only: ПП2 07–08.10, карточка N=1, стёртые вторые записи, уведомления партнёрам.
 * Ничего не пишет в D1 и не вызывает sendMessage.
 * Запуск без токена: node scripts/pp2-partner-read.mjs --self-test
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WORKER_NAME = "boinya-c-pp2-read-tmp";
const DB_ID = "8ab3668c-a654-432c-9ebd-a1ac5c4db800";
const SINCE = "2026-10-01T00:00:00.000Z";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function looseKey(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/[._\s@]/g, "");
}

function slotNum(raw) {
  const s = String(raw == null ? "" : raw).trim();
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) || 0;
  if (/^[1-4]$/.test(s)) return Number(s);
  return 0;
}

function metaOf(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch (e) {
    return {};
  }
}

function buildPp2ReadReport(input) {
  input = input || {};
  const orders = input.orders || [];
  const subs = input.subs || [];
  const flags = input.flags || [];
  const partners = input.partners || [];
  const cardBy = Object.create(null);
  subs.forEach(function (s) {
    if (!s) return;
    const sheet = String(s.sheet || s.segment || "").toUpperCase();
    if (sheet && sheet !== "ПП" && sheet !== "PP") return;
    const k = looseKey(s.nick || s.label || s.name || "");
    if (!k) return;
    cardBy[k] = {
      deliveries: Number(s.deliveries != null ? s.deliveries : s.deliveriesN) || 0,
      status: String(s.status || s.subStatus || "")
    };
  });
  const delivered = Object.create(null);
  flags.forEach(function (f) {
    if (!f || Number(f.delivered) === 0) return;
    delivered[String(f.date_iso) + "|" + looseKey(f.match_key)] = true;
  });
  const days = {};
  const n1slot2 = [];
  orders.forEach(function (o) {
    if (!o) return;
    const meta = metaOf(o.meta_json);
    const date = String(o.date_iso || "");
    const key = looseKey(o.match_key || o.client);
    const slot = String(meta.ppSlot || meta.deliverySlot || "");
    const row = {
      client: String(o.client || ""),
      date: date,
      day: String(o.day_name || ""),
      segment: String(o.segment || ""),
      status: String(o.status || ""),
      ppSlot: slot,
      deliveriesN: meta.deliveriesN != null ? meta.deliveriesN : "",
      delivered: !!(date && delivered[date + "|" + key]),
      hasTrack: !!String(meta.mailTrack || "").trim()
    };
    if (date === "2026-10-05" || date === "2026-10-06" || date === "2026-10-07" || date === "2026-10-08") {
      if (!days[date]) days[date] = [];
      days[date].push(row);
    }
    const card = cardBy[key];
    if (card && card.deliveries === 1 && slotNum(slot) >= 2 && String(o.status) === "active") {
      n1slot2.push({
        client: row.client,
        date: date,
        day: row.day,
        ppSlot: slot,
        wouldSet: "ppSlot 1, deliverySlot 1, deliveriesN 1"
      });
    }
  });
  const byPerson = Object.create(null);
  orders.forEach(function (o) {
    if (!o || String(o.updated_at || "") < SINCE) return;
    const k = looseKey(o.match_key || o.client);
    if (!k) return;
    if (!byPerson[k]) byPerson[k] = [];
    byPerson[k].push(o);
  });
  const victims = [];
  Object.keys(byPerson).forEach(function (k) {
    const list = byPerson[k].slice().sort(function (a, b) {
      return String(a.updated_at).localeCompare(String(b.updated_at));
    });
    const deleted = list.filter(function (o) { return String(o.status) === "deleted"; });
    if (!deleted.length) return;
    const active = list.filter(function (o) { return String(o.status) === "active"; });
    const hit = deleted.filter(function (d) {
      return active.some(function (a) {
        const segDiff = String(d.segment || "") && String(a.segment || "") && String(d.segment) !== String(a.segment);
        const dateDiff = String(d.date_iso || "") && String(a.date_iso || "") && String(d.date_iso) !== String(a.date_iso);
        const dt = Math.abs(Date.parse(a.updated_at) - Date.parse(d.updated_at));
        return (segDiff || dateDiff) && dt < 6 * 60 * 60 * 1000;
      });
    });
    if (!hit.length) return;
    victims.push({
      client: String((active[0] || deleted[0]).client || ""),
      deleted: hit.map(function (d) {
        return { date: d.date_iso || "", day: d.day_name || "", segment: d.segment || "", at: d.updated_at || "" };
      }),
      active: active.map(function (a) {
        return { date: a.date_iso || "", day: a.day_name || "", segment: a.segment || "", at: a.updated_at || "" };
      })
    });
  });
  const byStatus = {};
  let withTid = 0;
  let withoutTid = 0;
  partners.forEach(function (p) {
    if (!p) return;
    const st = String(p.status || "unknown");
    if (!byStatus[st]) byStatus[st] = { n: 0, withTid: 0, withoutTid: 0 };
    byStatus[st].n++;
    if (String(p.telegramId || "").trim()) {
      byStatus[st].withTid++;
      withTid++;
    } else {
      byStatus[st].withoutTid++;
      withoutTid++;
    }
  });
  return {
    days: days,
    katya: {
      card: cardBy[looseKey("katya.dehtyarenko")] || null,
      orders: (days["2026-10-05"] || []).concat(days["2026-10-06"] || [], days["2026-10-07"] || [], days["2026-10-08"] || []).filter(function (r) {
        return looseKey(r.client) === looseKey("katya.dehtyarenko");
      })
    },
    n1slot2: n1slot2,
    victims: victims,
    partners: {
      orders: partners.length,
      withTid: withTid,
      withoutTid: withoutTid,
      byStatus: byStatus,
      notifyLog: false
    }
  };
}

function selfTest() {
  const report = buildPp2ReadReport({
    subs: [{ nick: "katya.dehtyarenko", sheet: "ПП", deliveries: 1, status: "active" }],
    flags: [{ date_iso: "2026-10-07", match_key: "KATYADEHTYARENKO", delivered: 1 }],
    orders: [
      {
        client: "katya.dehtyarenko",
        match_key: "KATYADEHTYARENKO",
        date_iso: "2026-10-07",
        day_name: "Среда",
        segment: "ПП",
        status: "deleted",
        updated_at: "2026-10-07T09:00:00.000Z",
        meta_json: JSON.stringify({ ppSlot: "2", deliveriesN: 2, mailTrack: "SECRET" }),
        phone: "375291112233",
        address: "секрет"
      },
      {
        client: "katya.dehtyarenko",
        match_key: "KATYADEHTYARENKO",
        date_iso: "2026-10-07",
        day_name: "Среда",
        segment: "ПАРТНЁР",
        status: "active",
        updated_at: "2026-10-07T09:05:00.000Z",
        meta_json: "{}"
      }
    ],
    partners: [
      { status: "new", telegramId: "111" },
      { status: "delivered", telegramId: "" }
    ]
  });
  assert(report.n1slot2.length === 0, "deleted PP2 is not a live clamp candidate");
  assert(report.victims.length === 1, "partner overwrite is a victim");
  assert(report.days["2026-10-07"].length === 2, "both wednesday rows");
  assert(report.days["2026-10-07"][0].hasTrack === true, "track presence without the code");
  const blob = JSON.stringify(report);
  assert(!/37529/.test(blob), "phone stays out");
  assert(!/секрет/.test(blob), "address stays out");
  assert(!/"111"/.test(blob) && !/telegramId/.test(blob), "chat id stays out");
  assert(!/SECRET/.test(blob), "track code stays out");
  assert(report.partners.withTid === 1 && report.partners.withoutTid === 1, "partner tid counts");
  assert(report.partners.notifyLog === false, "no send log in this store");
  console.log("self_test ok");
}

function workerSource(key) {
  return `
const KEY = ${JSON.stringify(key)};
const SINCE = ${JSON.stringify(SINCE)};
${looseKey.toString()}
${slotNum.toString()}
${metaOf.toString()}
${buildPp2ReadReport.toString()}

function parseSnap(raw) {
  try { return JSON.parse(raw || "{}"); } catch (e) { return {}; }
}

export default {
  async fetch(request, env) {
    if (request.headers.get("x-repair-key") !== KEY) return new Response("denied", { status: 403 });
    if (!env || !env.DB) return Response.json({ error: "no_d1" });
    const orders = await env.DB.prepare(
      "SELECT id, date_iso, day_name, client, match_key, segment, status, updated_at, meta_json FROM orders WHERE date_iso IN ('2026-10-05','2026-10-06','2026-10-07','2026-10-08') OR (updated_at >= ? AND status IN ('active','deleted')) ORDER BY updated_at DESC LIMIT 800"
    ).bind(SINCE).all();
    const flags = await env.DB.prepare(
      "SELECT date_iso, match_key, delivered FROM deliveries WHERE date_iso IN ('2026-10-06','2026-10-07','2026-10-08')"
    ).all();
    const snaps = await env.DB.prepare(
      "SELECT cache_key, payload FROM snap_cache WHERE cache_key IN ('listSubscriptions','partnerOrders','subDeleteTombstones')"
    ).all();
    const byKey = {};
    ((snaps && snaps.results) || []).forEach(function (r) { byKey[r.cache_key] = parseSnap(r.payload); });
    const subsWrap = byKey.listSubscriptions || {};
    const subs = subsWrap.subscriptions || subsWrap.items || [];
    const pack = byKey.partnerOrders || {};
    const partners = Array.isArray(pack.orders) ? pack.orders : [];
    const sinceMs = Date.parse("2026-10-02T00:00:00.000Z");
    const recentPartners = partners.filter(function (p) {
      const t = Date.parse(p && (p.createdAt || p.updatedAt || p.dateIso || ""));
      return !t || t >= sinceMs;
    }).map(function (p) {
      return { status: p && p.status, telegramId: p && p.telegramId ? "1" : "" };
    });
    const report = buildPp2ReadReport({
      orders: (orders && orders.results) || [],
      flags: (flags && flags.results) || [],
      subs: subs,
      partners: recentPartners
    });
    report.partnerOrderStored = partners.length;
    report.subTombStored = Array.isArray((byKey.subDeleteTombstones || {}).items) ? byKey.subDeleteTombstones.items.length : 0;
    report.notifyLog = false;
    let chat = { skipped: "no_token" };
    const token = env.PARTNER_BOT_TOKEN || env.GOODBOY_BOT_TOKEN || "";
    if (token) {
      chat = { me: "", started: 0, notFound: 0, blocked: 0, other: 0 };
      try {
        const me = await fetch("https://api.telegram.org/bot" + token + "/getMe");
        const mj = await me.json();
        chat.me = (mj && mj.result && mj.result.username) || "";
      } catch (eMe) {
        chat.me = "";
      }
      const seen = Object.create(null);
      for (let i = 0; i < partners.length; i++) {
        const id = String((partners[i] && partners[i].telegramId) || "").trim();
        if (!id || seen[id]) continue;
        seen[id] = true;
        try {
          const r = await fetch("https://api.telegram.org/bot" + token + "/getChat?chat_id=" + encodeURIComponent(id));
          const j = await r.json();
          if (j && j.ok) chat.started++;
          else {
            const d = String((j && j.description) || "");
            if (/not found/i.test(d)) chat.notFound++;
            else if (/blocked/i.test(d)) chat.blocked++;
            else chat.other++;
          }
        } catch (eChat) {
          chat.other++;
        }
      }
    }
    report.chat = chat;
    return Response.json(report);
  }
};
`;
}

async function main() {
  if (process.argv.indexOf("--self-test") >= 0) {
    selfTest();
    return;
  }
  const token = process.env.CLOUDFLARE_API_TOKEN || "";
  if (!token) {
    console.log("no_cloudflare_token");
    process.exit(3);
  }
  const key = crypto.randomBytes(24).toString("hex");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pp2-read-"));
  const scrub = function (s) {
    return String(s || "").split(key).join("[key]");
  };
  fs.writeFileSync(
    path.join(dir, "wrangler.toml"),
    'name = "' + WORKER_NAME + '"\nmain = "worker.js"\ncompatibility_date = "2024-11-01"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "boinya-c"\ndatabase_id = "' + DB_ID + '"\n'
  );
  fs.writeFileSync(path.join(dir, "worker.js"), workerSource(key));
  const env = Object.assign({}, process.env);
  if (!env.CLOUDFLARE_ACCOUNT_ID) delete env.CLOUDFLARE_ACCOUNT_ID;
  env.CI = "true";
  function run(args, extra) {
    return execFileSync("npx", args, { cwd: dir, env: Object.assign({}, env, extra || {}), encoding: "utf8" });
  }
  try {
    if (process.env.PARTNER_BOT_TOKEN) {
      try {
        execFileSync("npx", ["wrangler@4", "secret", "put", "PARTNER_BOT_TOKEN"], {
          cwd: dir,
          env: env,
          input: process.env.PARTNER_BOT_TOKEN,
          encoding: "utf8"
        });
      } catch (ePut) {
        console.log("partner_token_bind_failed");
      }
    }
    let out = "";
    try {
      out = run(["wrangler@4", "deploy"]);
    } catch (eDep) {
      console.log(scrub((eDep && eDep.stderr) || (eDep && eDep.message) || "").slice(0, 800));
      process.exitCode = 4;
      return;
    }
    const urls = scrub(out).match(/https:\/\/boinya-c-pp2-read-tmp\.[a-z0-9.-]+\.workers\.dev/g) || [];
    const host = urls[0] || "https://" + WORKER_NAME + ".konchaarsenia.workers.dev";
    let text = "";
    let res = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await new Promise(function (r) { setTimeout(r, 3000); });
      res = await fetch(host + "/", { headers: { "x-repair-key": key } });
      text = await res.text();
      if (res.ok) break;
    }
    if (!res || !res.ok) {
      console.log("helper_http_failed", res && res.status);
      process.exitCode = 5;
      return;
    }
    console.log(scrub(text));
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
  console.log("read_failed", String((e && e.message) || e).slice(0, 300));
  process.exit(1);
});
