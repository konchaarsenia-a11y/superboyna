#!/usr/bin/env node
/**
 * Read-only D1 for andreiprigunov only. Does not write.
 * RESTORE_CONFIRM is refused.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WORKER_NAME = "boinya-c-andrei-read-tmp";
const DB_ID = "8ab3668c-a654-432c-9ebd-a1ac5c4db800";
const NICK = "andreiprigunov";

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

function isAndrei(row) {
  const blob = [row && row.match_key, row && row.client, row && row.nick, row && row.label, row && row.name, row && row.mk]
    .map(loose)
    .join(" ");
  return blob.indexOf("ANDREIPRIGUNOV") >= 0;
}

function isRepairAndreiTomb(row) {
  const n = loose(row && (row.nick || row.label || row.name || row.mk));
  return n === "АНДРЕЙ";
}

function basketBrief(raw) {
  let arr = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw || "[]");
    } catch (e) {
      arr = [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 40).map(function (it) {
    it = it || {};
    return {
      name: String(it.name || it.title || it.product || "").slice(0, 80),
      qty: it.qty != null ? it.qty : it.count != null ? it.count : "",
      grams: it.grams != null ? it.grams : it.weight != null ? it.weight : ""
    };
  });
}

function metaBrief(raw) {
  let m = raw;
  if (typeof raw === "string") {
    try {
      m = JSON.parse(raw || "{}");
    } catch (e) {
      m = {};
    }
  }
  m = m || {};
  const keep = ["ppSlot", "deliverySlot", "deliveriesN", "orderPrice", "statedCost", "factCost", "segment", "orderType", "noCut", "ppHint"];
  const out = {};
  for (let i = 0; i < keep.length; i++) {
    if (m[keep[i]] != null && m[keep[i]] !== "") out[keep[i]] = m[keep[i]];
  }
  return out;
}

function cardBrief(row) {
  if (!row) return null;
  const keys = [
    "nick", "label", "name", "sheet", "segment", "subId", "status", "stage",
    "deliveries", "wishes", "factCost", "statedCost", "scheme", "ppSlot",
    "clientPrice", "orderPrice", "paid", "note"
  ];
  const copy = { basket: basketBrief(row.basket), basket2: basketBrief(row.basket2 || row.basketSlot2) };
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (row[k] == null || row[k] === "") continue;
    copy[k] = k === "wishes" || k === "note" ? stripPhone(row[k]).slice(0, 500) : row[k];
  }
  return copy;
}

function orderBrief(r) {
  return Object.assign(
    {
      id: r.id,
      date: r.date_iso || "",
      day: r.day_name || "",
      status: r.status || "",
      segment: r.segment || "",
      source: r.source || "",
      updatedAt: r.updated_at || "",
      note: stripPhone(r.note || "").slice(0, 300),
      basket: basketBrief(r.basket_json)
    },
    metaBrief(r.meta_json)
  );
}

function buildAndreiReport(input) {
  input = input || {};
  const orders = (input.orders || []).filter(isAndrei).map(orderBrief);
  const cards = (input.subs || []).filter(isAndrei).map(cardBrief);
  const tombs = (input.subTombs || []).filter(function (t) {
    return isAndrei(t) || isRepairAndreiTomb(t);
  }).map(function (t) {
    return {
      nick: t.nick || "",
      mk: t.mk || "",
      sheet: t.sheet || "",
      subId: t.subId || "",
      at: t.at || 0,
      ttl: t.ttl || 0,
      repairNameOnly: isRepairAndreiTomb(t) && !isAndrei(t)
    };
  });
  const jobs = (input.jobs || []).filter(function (j) {
    const p = j.params || j;
    return isAndrei(p) || isAndrei(j);
  }).map(function (j) {
    const p = j.params || {};
    return {
      action: j.action || p.action || "",
      at: j.finishedAt || j._runningAt || p._deleteStartedAt || "",
      day: p.day || "",
      date: p.date || p.dateIso || "",
      oldDay: p.oldDay || "",
      newDay: p.newDay || "",
      oldDate: p.oldDate || "",
      newDate: p.newDate || "",
      status: j.status || "",
      wrote: j.wrote != null ? j.wrote : "",
      oneRecord: !!(j.d1Res && j.d1Res.oneRecord)
    };
  });
  const oct5 = orders.filter(function (o) { return o.date === "2026-10-05"; });
  const oct3 = orders.filter(function (o) { return o.date === "2026-10-03"; });
  return {
    nick: NICK,
    orders: orders,
    oct5: oct5,
    oct3: oct3,
    cards: cards,
    cardMissing: cards.length === 0,
    subTombs: tombs,
    jobs: jobs,
    monthCounts: input.monthCounts || {},
    snapCopies: input.snapCopies || [],
    restore: {
      write: false,
      confirm: "restore-andreiprigunov-oct5",
      doNotTouch: ["Alinagidayathanova", "2026-10-03 duplicate"],
      order: oct5.filter(function (o) { return o.status === "deleted"; }).map(function (o) {
        return { id: o.id, to: "active" };
      }),
      card: cards.length ? "still present, do not rewrite" : "missing from listSubscriptions"
    }
  };
}

function selfTest() {
  const report = buildAndreiReport({
    orders: [
      {
        id: "Пн:ANDREIPRIGUNOV",
        match_key: "ANDREIPRIGUNOV",
        client: "andreiprigunov",
        date_iso: "2026-10-05",
        day_name: "Понедельник",
        status: "deleted",
        updated_at: "2026-10-03T20:00:00.000Z",
        note: "ок",
        basket_json: JSON.stringify([{ name: "ШЕЯ", qty: 1 }]),
        meta_json: JSON.stringify({ orderPrice: 90, ppSlot: "1/2" }),
        phone: "37529111",
        address: "улица секрет"
      },
      {
        id: "Сб:OTHER",
        match_key: "OTHERPERSON",
        client: "other_person",
        date_iso: "2026-10-03",
        status: "deleted",
        basket_json: JSON.stringify([{ name: "СКРЫТО" }])
      }
    ],
    subs: [{ nick: "other_person", sheet: "ПП", wishes: "чужое" }],
    subTombs: [
      { nick: "Андрей", mk: "АНДРЕЙ", sheet: "ПП", subId: "53", at: 1, ttl: 86400000 },
      { nick: "evgenia_ln", mk: "EVGENIALN", sheet: "АФК", subId: "22", at: 1 }
    ],
    jobs: [{ action: "moveClient", params: { client: "andreiprigunov", oldDate: "2026-10-01", newDate: "2026-10-05" }, status: "success" }]
  });
  const blob = JSON.stringify(report);
  assert(report.oct5.length === 1, "oct5");
  assert(report.cardMissing === true, "card");
  assert(report.subTombs.length === 1 && report.subTombs[0].repairNameOnly === true, "repair tomb");
  assert(!/other_person/.test(blob) && !/СКРЫТО/.test(blob) && !/evgenia/.test(blob), "leak");
  assert(!/секрет/.test(blob) && !/37529/.test(blob), "pii");
  console.log("self_test ok");
}

function workerSource(key) {
  return `
const KEY = ${JSON.stringify(key)};
${stripPhone.toString()}
${loose.toString()}
${isAndrei.toString()}
${isRepairAndreiTomb.toString()}
${basketBrief.toString()}
${metaBrief.toString()}
${cardBrief.toString()}
${orderBrief.toString()}
${buildAndreiReport.toString()}
const NICK = ${JSON.stringify(NICK)};

function parseSnap(raw) {
  try { return JSON.parse(raw || "{}"); } catch (e) { return {}; }
}

export default {
  async fetch(request, env) {
    if (request.headers.get("x-repair-key") !== KEY) return new Response("denied", { status: 403 });
    const orders = await env.DB.prepare(
      "SELECT id, date_iso, day_name, client, match_key, segment, source, status, updated_at, note, basket_json, meta_json FROM orders WHERE upper(replace(replace(coalesce(match_key,''),'.',''),'_','')) LIKE '%ANDREIPRIGUNOV%' OR upper(replace(replace(coalesce(client,''),'.',''),'_','')) LIKE '%ANDREIPRIGUNOV%' ORDER BY updated_at DESC LIMIT 40"
    ).all();
    const snaps = await env.DB.prepare(
      "SELECT cache_key, payload, updated_at FROM snap_cache WHERE cache_key IN ('listSubscriptions','subDeleteTombstones','deleteTombstones','listClientProfiles','monthOverview','monthOverview:2026-10','viewDate:2026-10-03','viewDate:2026-10-05','ppSlotAnchor:ANDREIPRIGUNOV') OR (cache_key LIKE 'peopleWrite:%' AND updated_at >= '2026-10-02')"
    ).all();
    const byKey = {};
    const rows = (snaps && snaps.results) || [];
    const jobs = [];
    for (let i = 0; i < rows.length; i++) {
      const k = rows[i].cache_key;
      const payload = parseSnap(rows[i].payload);
      if (k.indexOf("peopleWrite:") === 0) {
        if (String(rows[i].updated_at || "") >= "2026-10-02") jobs.push(payload);
        continue;
      }
      byKey[k] = payload;
    }
    const subsWrap = byKey.listSubscriptions || {};
    const tombWrap = byKey.subDeleteTombstones || {};
    const month = byKey["monthOverview:2026-10"] || byKey.monthOverview || {};
    const monthCounts = {};
    const days = Array.isArray(month.days) ? month.days : [];
    for (let di = 0; di < days.length; di++) {
      const d = days[di];
      if (d && (d.dateIso === "2026-10-03" || d.dateIso === "2026-10-05")) {
        monthCounts[d.dateIso] = Number(d.count) || 0;
      }
    }
    const report = buildAndreiReport({
      orders: (orders && orders.results) || [],
      subs: subsWrap.subscriptions || subsWrap.items || [],
      subTombs: Array.isArray(tombWrap.items) ? tombWrap.items : [],
      jobs: jobs,
      monthCounts: monthCounts
    });
    report.subsStored = Array.isArray(subsWrap.subscriptions) ? subsWrap.subscriptions.length : 0;
    report.subTombStored = Array.isArray(tombWrap.items) ? tombWrap.items.length : 0;
    const profiles = ((byKey.listClientProfiles || {}).clients) || [];
    report.profile = null;
    for (let pi = 0; pi < profiles.length; pi++) {
      if (!isAndrei(profiles[pi])) continue;
      report.profile = {
        nick: profiles[pi].nick || "",
        label: profiles[pi].label || profiles[pi].name || ""
      };
      break;
    }
    const anchor = byKey["ppSlotAnchor:ANDREIPRIGUNOV"];
    report.ppSlotAnchor = anchor ? { slot: anchor.slot || "", at: anchor.at || 0 } : null;
    report.snapCopies = [];
    const viewKeys = ["viewDate:2026-10-03", "viewDate:2026-10-05"];
    for (let vi = 0; vi < viewKeys.length; vi++) {
      const payload = byKey[viewKeys[vi]] || {};
      const list = payload.clients || payload.month || payload.week || [];
      if (!Array.isArray(list)) continue;
      for (let ci = 0; ci < list.length; ci++) {
        const c = list[ci];
        if (!isAndrei({ client: c && (c.name || c.client), match_key: c && c.matchKey, nick: c && c.name })) continue;
        report.snapCopies.push({
          snap: viewKeys[vi],
          name: (c && (c.name || c.client)) || "",
          date: (c && (c.dateIso || c.date)) || "",
          segment: (c && c.segment) || "",
          ppSlot: (c && c.ppSlot) || "",
          orderPrice: c && c.orderPrice != null ? c.orderPrice : "",
          note: stripPhone((c && c.note) || "").slice(0, 300),
          basket: basketBrief(c && c.basket)
        });
      }
    }
    const orderTombs = ((byKey.deleteTombstones || {}).items) || [];
    report.orderTombs = [];
    for (let ti = 0; ti < orderTombs.length; ti++) {
      const t = orderTombs[ti];
      if (!isAndrei(t)) continue;
      report.orderTombs.push({ day: t.day || "", at: t.at || 0 });
    }
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
  if (process.env.RESTORE_CONFIRM || process.argv.indexOf("--allow-write") >= 0) {
    console.log("restore_refused");
    process.exit(2);
  }
  const token = process.env.CLOUDFLARE_API_TOKEN || "";
  if (!token) {
    console.log("no_cloudflare_token");
    process.exit(3);
  }
  const key = crypto.randomBytes(24).toString("hex");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "andrei-read-"));
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
  function run(args) {
    return execFileSync("npx", args, { cwd: dir, env: env, encoding: "utf8" });
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
    const scrubbed = scrub(out);
    const urls = scrubbed.match(/https:\/\/boinya-c-andrei-read-tmp\.[a-z0-9.-]+\.workers\.dev/g) || [];
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
    console.log(JSON.stringify(JSON.parse(text)));
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
