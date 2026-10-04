#!/usr/bin/env node
/**
 * Read-only: кто потерял вторую дату или карточку ПП за последние ~сутки.
 * Пишет в D1 только если RESTORE_CONFIRM=restore-one-record и --allow-write.
 * Этот запуск так не вызывает. По умолчанию сухой отчёт.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SINCE = "2026-10-03T00:00:00.000Z";
const SINCE_WIDE = "2026-10-02T00:00:00.000Z";
const WORKER_NAME = "boinya-c-del-read-tmp";
const DB_ID = "8ab3668c-a654-432c-9ebd-a1ac5c4db800";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function stripPhone(s) {
  return String(s || "").replace(/\+?\d[\d\-\s()]{6,}\d/g, "[tel]");
}

function looseKey(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/[._\s@]/g, "");
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
  return {
    ppSlot: m.ppSlot || "",
    deliverySlot: m.deliverySlot != null ? m.deliverySlot : "",
    deliveriesN: m.deliveriesN != null ? m.deliveriesN : "",
    orderPrice: m.orderPrice != null ? m.orderPrice : "",
    statedCost: m.statedCost != null ? m.statedCost : "",
    factCost: m.factCost != null ? m.factCost : "",
    segment: m.segment || m.orderType || ""
  };
}

function subBrief(row) {
  if (!row) return null;
  const keys = [
    "nick",
    "label",
    "name",
    "sheet",
    "segment",
    "subId",
    "status",
    "stage",
    "deliveries",
    "wishes",
    "factCost",
    "statedCost",
    "scheme",
    "ppSlot"
  ];
  const copy = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (row[k] == null || row[k] === "") continue;
    copy[k] = k === "wishes" ? stripPhone(row[k]).slice(0, 400) : row[k];
  }
  return copy;
}

function samePerson(rowKey, client, candidate) {
  const a = looseKey(rowKey);
  const b = looseKey(client);
  const fields = [candidate && candidate.nick, candidate && candidate.label, candidate && candidate.name, candidate && candidate.mk];
  for (let i = 0; i < fields.length; i++) {
    const f = looseKey(fields[i]);
    if (f && (f === a || f === b)) return true;
  }
  return false;
}

function buildDeleteCascadeReport(input) {
  input = input || {};
  const sinceMs = Date.parse(input.since || SINCE);
  const orders = (input.orders || []).filter(function (r) {
    return Date.parse(r.updated_at || "") >= sinceMs;
  });
  const groups = Object.create(null);
  for (let i = 0; i < orders.length; i++) {
    const r = orders[i];
    const key = String(r.match_key || r.client || "").trim().toUpperCase();
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }
  const tombs = Array.isArray(input.subTombs) ? input.subTombs : [];
  function tombFor(key, client) {
    return tombs.filter(function (t) {
      return samePerson(key, client, t);
    });
  }
  const victims = [];
  const keys = Object.keys(groups);
  for (let gi = 0; gi < keys.length; gi++) {
    const key = keys[gi];
    const list = groups[key].slice().sort(function (a, b) {
      return String(a.updated_at || "").localeCompare(String(b.updated_at || ""));
    });
    const dates = Object.create(null);
    for (let j = 0; j < list.length; j++) {
      if (list[j].date_iso) dates[list[j].date_iso] = true;
    }
    const dateList = Object.keys(dates);
    const t0 = Date.parse(list[0].updated_at || "") || 0;
    const t1 = Date.parse(list[list.length - 1].updated_at || "") || 0;
    const close = t1 - t0 <= 6 * 3600 * 1000;
    const hitTombs = tombFor(key, list[0].client);
    const multi = dateList.length >= 2 && close;
    if (!multi && !hitTombs.length) continue;
    victims.push({
      client: list[0].client || "",
      matchKey: key,
      reason: multi && hitTombs.length ? "multi_date_and_sub_tomb" : multi ? "multi_date" : "order_and_sub_tomb",
      orders: list.map(function (r) {
        return Object.assign(
          {
            id: r.id,
            date: r.date_iso || "",
            day: r.day_name || "",
            segment: r.segment || "",
            source: r.source || "",
            updatedAt: r.updated_at || "",
            note: stripPhone(r.note || "").slice(0, 300),
            basket: basketBrief(r.basket_json)
          },
          metaBrief(r.meta_json)
        );
      }),
      subTombs: hitTombs.map(function (t) {
        return { nick: t.nick || "", sheet: t.sheet || "", subId: t.subId || "", at: t.at || 0 };
      })
    });
  }
  const subs = Array.isArray(input.subs) ? input.subs : [];
  for (let vi = 0; vi < victims.length; vi++) {
    const v = victims[vi];
    const cards = [];
    for (let si = 0; si < subs.length; si++) {
      if (samePerson(v.matchKey, v.client, subs[si])) cards.push(subBrief(subs[si]));
    }
    v.cards = cards;
    v.cardMissing = cards.length === 0;
    v.restore = {
      write: false,
      confirm: "restore-one-record",
      source: "D1 orders.status=deleted, same id",
      d1: v.orders.map(function (o) {
        return { id: o.id, from: "deleted", to: "active" };
      }),
      backupBeforeWrite: "snap_cache key restoreBackup:<iso> with the deleted row JSON",
      sheets: "after D1 revive, mirror those rows with saveOrder/saveBooking. Do not call deleteSubscription.",
      card: v.cardMissing
        ? "listSubscriptions has no card. Tomb stores nick/sheet/subId only. Do not invent the rest. Sheets version history is the full-card source if the CRM row is gone."
        : "card still in listSubscriptions. Do not rewrite it."
    };
  }
  return {
    since: input.since || SINCE,
    deletedOrders: orders.length,
    deletedPeople: keys.length,
    victimCount: victims.length,
    otherPeople: keys.length - victims.length,
    victims: victims
  };
}

function selfTest() {
  const report = buildDeleteCascadeReport({
    since: SINCE,
    orders: [
      {
        id: "a",
        match_key: "ZZZVICTIM",
        client: "zzz_victim",
        date_iso: "2026-10-05",
        day_name: "Понедельник",
        updated_at: "2026-10-04T04:00:00.000Z",
        note: "окна во двор",
        basket_json: JSON.stringify([{ name: "ШЕЯ", qty: 1, grams: 500 }]),
        meta_json: JSON.stringify({ ppSlot: "1", orderPrice: 42 }),
        segment: "ПП",
        phone: "375291112233",
        address: "секрет улица"
      },
      {
        id: "b",
        match_key: "ZZZVICTIM",
        client: "zzz_victim",
        date_iso: "2026-10-07",
        day_name: "Среда",
        updated_at: "2026-10-04T04:00:01.000Z",
        basket_json: "[]",
        meta_json: JSON.stringify({ ppSlot: "2", orderPrice: 50 }),
        segment: "ПП"
      },
      {
        id: "c",
        match_key: "OTHERPERSON",
        client: "other_person",
        date_iso: "2026-10-05",
        day_name: "Понедельник",
        updated_at: "2026-10-04T04:10:00.000Z",
        note: "чужое",
        basket_json: JSON.stringify([{ name: "СКРЫТО", qty: 9 }])
      }
    ],
    subs: [{ nick: "other_person", sheet: "ПП", subId: "9", wishes: "чужие" }],
    subTombs: [{ nick: "zzz_victim", mk: "ZZZVICTIM", sheet: "ПП", subId: "15", at: Date.parse("2026-10-04T04:00:02.000Z") }]
  });
  assert(report.victimCount === 1, "one victim");
  assert(report.victims[0].client === "zzz_victim", "victim name");
  assert(report.victims[0].orders.length === 2, "both dates");
  assert(report.victims[0].cardMissing === true, "card missing");
  assert(report.otherPeople === 1, "other people counted");
  const blob = JSON.stringify(report);
  assert(!/other_person/.test(blob), "other name leaked");
  assert(!/СКРЫТО/.test(blob), "other basket leaked");
  assert(!/37529/.test(blob), "phone leaked");
  assert(!/секрет/.test(blob), "address leaked");
  assert(/ШЕЯ/.test(blob), "victim basket kept");
  console.log("self_test ok victims=" + report.victimCount);
}

function workerSource(key) {
  return `
const KEY = ${JSON.stringify(key)};
const SINCE = ${JSON.stringify(SINCE)};
const SINCE_WIDE = ${JSON.stringify(SINCE_WIDE)};
${buildDeleteCascadeReport.toString()}
${stripPhone.toString()}
${looseKey.toString()}
${basketBrief.toString()}
${metaBrief.toString()}
${subBrief.toString()}
${samePerson.toString()}

function parseSnap(raw) {
  try { return JSON.parse(raw || "{}"); } catch (e) { return {}; }
}

export default {
  async fetch(request, env) {
    if (request.headers.get("x-repair-key") !== KEY) return new Response("denied", { status: 403 });
    if (!env || !env.DB) return Response.json({ error: "no_d1" });
    const deleted = await env.DB.prepare(
      "SELECT id, date_iso, day_name, client, match_key, segment, source, status, updated_at, note, basket_json, meta_json FROM orders WHERE status = 'deleted' AND updated_at >= ? ORDER BY updated_at DESC LIMIT 500"
    ).bind(SINCE_WIDE).all();
    const snaps = await env.DB.prepare(
      "SELECT cache_key, payload, updated_at FROM snap_cache WHERE cache_key IN ('listSubscriptions','subDeleteTombstones','deleteTombstones')"
    ).all();
    const byKey = {};
    const snapRows = (snaps && snaps.results) || [];
    for (let i = 0; i < snapRows.length; i++) byKey[snapRows[i].cache_key] = parseSnap(snapRows[i].payload);
    const subsWrap = byKey.listSubscriptions || {};
    const subs = subsWrap.subscriptions || subsWrap.items || [];
    const tombWrap = byKey.subDeleteTombstones || {};
    const subTombs = Array.isArray(tombWrap.items) ? tombWrap.items : [];
    const report = buildDeleteCascadeReport({
      since: SINCE,
      orders: (deleted && deleted.results) || [],
      subs: subs,
      subTombs: subTombs
    });
    report.deletedWide = ((deleted && deleted.results) || []).length;
    report.subTombStored = subTombs.length;
    report.subsStored = Array.isArray(subs) ? subs.length : 0;
    const orderTombs = (byKey.deleteTombstones && byKey.deleteTombstones.items) || [];
    for (let vi = 0; vi < report.victims.length; vi++) {
      const v = report.victims[vi];
      v.orderTombs = [];
      for (let ti = 0; ti < orderTombs.length; ti++) {
        const t = orderTombs[ti];
        if (!t) continue;
        if (looseKey(t.mk) && (looseKey(t.mk) === looseKey(v.matchKey) || looseKey(t.mk) === looseKey(v.client))) {
          v.orderTombs.push({ day: t.day || "", at: t.at || 0 });
        }
      }
      try {
        const live = await env.DB.prepare(
          "SELECT id, date_iso, day_name, segment FROM orders WHERE status = 'active' AND (match_key = ? OR upper(client) = ?) LIMIT 20"
        ).bind(v.matchKey, String(v.client || "").toUpperCase()).all();
        v.stillActive = ((live && live.results) || []).map(function (r) {
          return { id: r.id, date: r.date_iso || "", day: r.day_name || "", segment: r.segment || "" };
        });
      } catch (eLive) {
        v.stillActive = [];
      }
      v.snapCopies = [];
      const wantSnaps = [];
      for (let oi = 0; oi < v.orders.length; oi++) {
        if (v.orders[oi].day) wantSnaps.push("clients:" + v.orders[oi].day);
        if (v.orders[oi].date) wantSnaps.push("viewDate:" + v.orders[oi].date);
      }
      for (let si = 0; si < wantSnaps.length; si++) {
        try {
          const row = await env.DB.prepare("SELECT payload FROM snap_cache WHERE cache_key = ? LIMIT 1").bind(wantSnaps[si]).first();
          const payload = parseSnap(row && row.payload);
          const list = payload.clients || payload.month || payload.week || [];
          if (!Array.isArray(list)) continue;
          for (let ci = 0; ci < list.length; ci++) {
            const c = list[ci];
            if (!samePerson(v.matchKey, v.client, { nick: c && (c.name || c.client), label: c && c.matchKey, mk: c && c.matchKey })) continue;
            v.snapCopies.push({
              snap: wantSnaps[si],
              name: (c && (c.name || c.client)) || "",
              date: (c && (c.dateIso || c.date || c._sumDate)) || "",
              day: (c && c.day) || "",
              segment: (c && c.segment) || "",
              ppSlot: (c && c.ppSlot) || "",
              orderPrice: c && c.orderPrice != null ? c.orderPrice : "",
              note: stripPhone((c && c.note) || "").slice(0, 300),
              basket: basketBrief(c && c.basket)
            });
          }
        } catch (eSnap) {}
      }
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
    console.log("restore_refused read_only_script");
    process.exit(2);
  }
  const token = process.env.CLOUDFLARE_API_TOKEN || "";
  if (!token) {
    console.log("no_cloudflare_token");
    process.exit(3);
  }
  const key = crypto.randomBytes(24).toString("hex");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "del-read-"));
  const scrub = function (s) {
    return String(s || "").split(key).join("[key]");
  };
  fs.writeFileSync(
    path.join(dir, "wrangler.toml"),
    'name = "' +
      WORKER_NAME +
      '"\nmain = "worker.js"\ncompatibility_date = "2024-11-01"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "boinya-c"\ndatabase_id = "' +
      DB_ID +
      '"\n'
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
      out = scrub((eDep && eDep.stdout) || "") + "\n" + scrub((eDep && eDep.stderr) || "") + "\n" + scrub(eDep && eDep.message);
      console.log(out.slice(0, 2000));
      process.exit(4);
    }
    const urlMatch = scrub(out).match(/https:\/\/[a-z0-9-]+\.[a-z0-9.-]+\.workers\.dev/);
    const host = (urlMatch && urlMatch[0]) || "https://" + WORKER_NAME + ".konchaarsenia.workers.dev";
    console.log("helper_host", host.replace(WORKER_NAME, "del-read-tmp"));
    const res = await fetch(host + "/", { headers: { "x-repair-key": key } });
    const text = await res.text();
    console.log("helper_http", res.status, "bytes", text.length);
    if (!res.ok) {
      console.log(scrub(text).slice(0, 300));
      process.exit(5);
    }
    const report = JSON.parse(text);
    console.log(JSON.stringify(report));
  } finally {
    try {
      run(["wrangler@4", "delete", "--force"]);
      console.log("helper_deleted");
    } catch (eDel) {
      console.log("helper_delete_failed", scrub(eDel && eDel.message).slice(0, 300));
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (eRm) {}
  }
}

main().catch(function (e) {
  console.log("read_failed", String((e && e.message) || e).slice(0, 400));
  process.exit(1);
});
