#!/usr/bin/env node
/**
 * Read-only: партнёр «Варка Шевченко 1» около 2026-10-22 14:35 UTC.
 * Ничего не пишет в D1.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.OUT || path.join(process.cwd(), "artifacts/varka-save");
const FROM = Date.parse("2026-10-22T14:00:00Z");
const TO = Date.parse("2026-10-22T15:30:00Z");

function sh(sql) {
  const raw = execFileSync(
    "npx",
    ["--yes", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: 80 * 1024 * 1024, env: process.env }
  );
  const data = JSON.parse(raw);
  const blocks = Array.isArray(data) ? data : [data];
  const rows = [];
  blocks.forEach(function (b) {
    if (b && Array.isArray(b.results)) rows.push.apply(rows, b.results);
  });
  return rows;
}

function hit(s) {
  return /шевчен|shevchen|варка|varka/i.test(String(s || ""));
}

function namesFrom(payload, kind) {
  const out = [];
  const list = Array.isArray(payload) ? payload : [];
  list.forEach(function (row) {
    if (!row) return;
    const blob = [row.name, row.address, row.note, row.id, row.networkId].join(" ");
    if (!hit(blob) && kind === "match") return;
    out.push({
      id: row.id || "",
      name: row.name || "",
      address: row.address || "",
      note: row.note || "",
      networkId: row.networkId || "",
      active: row.active,
      paysCost: row.paysCost
    });
  });
  return out;
}

async function queryLogs(account, token, filters, label, opts) {
  opts = opts || {};
  const body = {
    queryId: "varka-save-" + label,
    view: opts.view || "events",
    limit: opts.limit || 20,
    dry: true,
    timeframe: { from: opts.from || FROM, to: opts.to || TO },
    parameters: {
      filterCombination: "and",
      filters: (opts.noService ? [] : [
        { key: "$metadata.service", operation: "eq", type: "string", value: "boinya-c" }
      ]).concat(filters),
      calculations: opts.calculations || [],
      groupBys: opts.groupBys || []
    }
  };
  const res = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/" + account + "/workers/observability/telemetry/query",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { json = { raw: text.slice(0, 800) }; }
  const events = (((json || {}).result || {}).events) || json.events || [];
  const brief = (Array.isArray(events) ? events : []).slice(0, 40).map(function (ev) {
    const meta = ev.$metadata || ev.metadata || {};
    const workers = ev.$workers || {};
    const req = (workers.event && workers.event.request) || workers.request || {};
    const url = String(req.url || meta.url || "");
    let action = "";
    const m = url.match(/[?&]action=([^&]+)/);
    if (m) {
      try { action = decodeURIComponent(m[1]); } catch (eA) { action = m[1]; }
    }
    let name = "";
    const nm = url.match(/[?&]name=([^&]+)/);
    if (nm) {
      try { name = decodeURIComponent(nm[1]).slice(0, 80); } catch (eN) { name = nm[1].slice(0, 80); }
    }
    return {
      t: meta.timestamp || ev.timestamp || "",
      level: meta.level || "",
      message: String(meta.message || ev.message || "").slice(0, 300),
      error: String(meta.error || "").slice(0, 300),
      status: (workers.outcome) || meta.statusCode || "",
      action: action,
      name: name,
      urlHasShev: /шевчен|shevchen|%D0%A8%D0%B5%D0%B2/i.test(url)
    };
  });
  return {
    label: label,
    http: res.status,
    ok: json.success !== false && res.ok,
    error: json.errors || json.messages || null,
    count: Array.isArray(events) ? events.length : 0,
    statistics: (json.result && json.result.statistics) || null,
    calculations: (json.result && (json.result.calculations || json.result.aggregates)) || null,
    keys: json.result ? Object.keys(json.result) : Object.keys(json || {}),
    events: brief
  };
}

function accountFromWhoami() {
  try {
    const raw = execFileSync("npx", ["--yes", "wrangler@4", "whoami"], {
      encoding: "utf8",
      env: process.env
    });
    const m = raw.match(/[0-9a-f]{32}/i);
    return m ? m[0] : "";
  } catch (e) {
    return "";
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const snaps = sh(
    "SELECT cache_key, updated_at, length(payload) AS n FROM snap_cache WHERE cache_key IN ('listPartners','partnerListAdmin') OR payload LIKE '%Шевченко%' OR payload LIKE '%шевченко%' OR payload LIKE '%Shevchenko%' OR payload LIKE '%SHEVCHENKO%'"
  );
  const partners = sh("SELECT payload, updated_at FROM snap_cache WHERE cache_key = 'listPartners'");
  const admin = sh("SELECT payload, updated_at FROM snap_cache WHERE cache_key = 'partnerListAdmin'");
  function parseSnap(rows) {
    if (!rows[0]) return null;
    try { return { at: rows[0].updated_at, payload: JSON.parse(rows[0].payload || "{}") }; }
    catch (e) { return { at: rows[0].updated_at, payload: {} }; }
  }
  const p = parseSnap(partners);
  const a = parseSnap(admin);
  const report = {
    snaps: snaps,
    listPartnersAt: p && p.at,
    partnerCount: p && p.payload && (p.payload.partners || []).length,
    partnerHits: p ? namesFrom((p.payload.partners || []).concat(p.payload.items || []), "match") : [],
    partnerAll: p ? namesFrom(p.payload.partners || p.payload.items || [], "all").map(function (r) { return r.name + (r.active === false ? " (off)" : ""); }) : [],
    adminAt: a && a.at,
    pointHits: a ? namesFrom(a.payload.points || [], "match") : [],
    networkHits: a ? namesFrom(a.payload.networks || [], "match") : [],
    accessHits: a ? (a.payload.access || []).filter(function (r) { return hit([r.name, r.username, (r.pointIds || []).join(" ")].join(" ")); }).map(function (r) {
      return { id: r.id, name: r.name, username: r.username, pointIds: r.pointIds, status: r.status };
    }) : [],
    varkaPoints: a ? (a.payload.points || []).filter(function (r) {
      return String(r.networkId || "") === "net_varka" || /varka|варка/i.test(String(r.name || "") + String(r.address || ""));
    }).map(function (r) {
      return { id: r.id, name: r.name, address: r.address, active: r.active };
    }) : []
  };
  report.touched = sh(
    "SELECT cache_key, updated_at, length(payload) AS n FROM snap_cache WHERE updated_at >= '2026-10-22T14:20:00.000Z' AND updated_at <= '2026-10-22T15:10:00.000Z' ORDER BY updated_at"
  );
  const ordersSnap = sh("SELECT payload, updated_at FROM snap_cache WHERE cache_key = 'partnerOrders'");
  const defSnap = sh("SELECT payload, updated_at FROM snap_cache WHERE cache_key = 'listDeferred'");
  function parseOne(rows) {
    if (!rows[0]) return null;
    try { return { at: rows[0].updated_at, payload: JSON.parse(rows[0].payload || "{}") }; }
    catch (e) { return { at: rows[0].updated_at, payload: {} }; }
  }
  const po = parseOne(ordersSnap);
  const df = parseOne(defSnap);
  const poList = (po && po.payload && (po.payload.orders || po.payload.items)) || [];
  report.partnerOrdersAt = po && po.at;
  report.partnerOrdersN = poList.length;
  report.recentOrders = poList.slice(0, 25).map(function (o) {
    return {
      id: o && o.id,
      createdAt: o && (o.createdAt || o.at),
      status: o && o.status,
      locationId: o && (o.locationId || o.pointId),
      locationName: o && (o.locationName || o.name),
      user: o && (o.userName || o.username || o.telegramId),
      total: o && o.totalByn,
      note: String((o && o.note) || "").slice(0, 80),
      slotAt: o && o.slotAt,
      statusAt: o && o.statusAt,
      deliverDateIso: o && o.deliverDateIso,
      needsSlot: o && o.needsSlot
    };
  });
  report.shevOrders = poList.filter(function (o) {
    return hit(JSON.stringify(o || {}).slice(0, 2000));
  }).slice(0, 20).map(function (o) {
    return {
      id: o.id,
      createdAt: o.createdAt || o.at,
      status: o.status,
      locationName: o.locationName,
      locationId: o.locationId,
      user: o.userName || o.username
    };
  });
  const defItems = (df && df.payload && df.payload.items) || [];
  report.deferredAt = df && df.at;
  report.deferredNow = defItems.filter(function (it) {
    return String((it && it.updatedAt) || "") >= "2026-10-22T14:20";
  }).slice(0, 30).map(function (it) {
    const pl = (it && it.payload) || {};
    return {
      id: it.id,
      updatedAt: it.updatedAt,
      status: it.status,
      title: it.title,
      location: pl.locationName,
      orderStatus: pl.orderStatus,
      deliverDateIso: pl.deliverDateIso,
      partnerOrderId: pl.partnerOrderId
    };
  });
  report.recentDeferred = defItems.filter(function (it) {
    const blob = JSON.stringify(it || {});
    const at = String((it && (it.updatedAt || it.at)) || "");
    return hit(blob) || at >= "2026-10-22T14:00";
  }).slice(0, 20).map(function (it) {
    const pl = (it && it.payload) || {};
    return {
      id: it.id,
      at: it.at,
      updatedAt: it.updatedAt,
      status: it.status,
      mode: it.mode,
      title: it.title,
      location: pl.locationName || pl.locationId,
      orderStatus: pl.orderStatus,
      partnerOrderId: pl.partnerOrderId
    };
  });
  fs.writeFileSync(path.join(OUT, "d1.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    snaps: report.snaps,
    listPartnersAt: report.listPartnersAt,
    partnerCount: report.partnerCount,
    partnerHits: report.partnerHits,
    partnerAll: report.partnerAll,
    adminAt: report.adminAt,
    pointHits: report.pointHits,
    networkHits: report.networkHits,
    varkaPoints: report.varkaPoints,
    partnerOrdersAt: report.partnerOrdersAt,
    partnerOrdersN: report.partnerOrdersN,
    recentOrders: report.recentOrders,
    shevOrders: report.shevOrders,
    deferredAt: report.deferredAt,
    deferredNow: report.deferredNow,
    recentDeferred: report.recentDeferred,
    touched: report.touched
  }, null, 2));
  let account = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
  if (!account && token) account = accountFromWhoami();
  report.dayOrders = sh(
    "SELECT id, client, match_key, date_iso, day_name, segment, status, substr(ifnull(note,''),1,80) AS note, substr(ifnull(meta_json,''),1,240) AS meta FROM orders WHERE date_iso IN ('2026-10-27','27.10.2026') OR client LIKE '%Шевченко%' OR client = 'Варка'"
  );
  report.writes = sh(
    "SELECT cache_key, payload FROM snap_cache WHERE cache_key IN ('peopleWrite:pw_mvjn9gbj_wh54qt','peopleWrite:pw_mvjnb2tr_302ywt','deleteTombstones','viewDate:2026-10-27')"
  ).map(function (row) {
    let payload = {};
    try { payload = JSON.parse(row.payload || "{}"); } catch (e) { payload = { raw: String(row.payload || "").slice(0, 500) }; }
    const bits = [];
    function walk(obj, depth) {
      if (!obj || depth > 5 || bits.length > 40) return;
      if (typeof obj === "string") {
        if (/шевчен|цвирко|варка|varka|error|tomb/i.test(obj)) bits.push(obj.slice(0, 140));
        return;
      }
      if (typeof obj !== "object") return;
      const list = Array.isArray(obj) ? obj.slice(0, 20) : obj;
      const keys = Array.isArray(list) ? list : Object.keys(list).slice(0, 30);
      if (Array.isArray(list)) {
        list.forEach(function (x) { walk(x, depth + 1); });
        return;
      }
      keys.forEach(function (k) {
        const v = list[k];
        if (v == null || typeof v === "object") {
          walk(v, depth + 1);
          return;
        }
        if (/client|nick|name|action|status|message|day|date|error|segment|sheet|source|match/i.test(k)) {
          bits.push(k + "=" + String(v).slice(0, 100));
        }
      });
    }
    walk(payload, 0);
    return { key: row.cache_key, bits: bits.slice(0, 40) };
  });
  report.accountFound = !!account;
  if (process.env.SKIP_LOGS === "1") {
    report.logs = "skipped";
  } else if (account && token) {
    report.logs = [];
    const jobs = [
      ["shev", [{ key: "$metadata.message", operation: "includes", type: "string", value: "Шевченко" }]],
      ["shev-lat", [{ key: "$metadata.message", operation: "includes", type: "string", value: "Shevchenko" }]],
      ["savePartner", [{ key: "$metadata.message", operation: "includes", type: "string", value: "savePartner" }]],
      ["savePoint", [{ key: "$metadata.message", operation: "includes", type: "string", value: "partnerSavePoint" }]],
      ["enc", [{ key: "$metadata.message", operation: "includes", type: "string", value: "%D0%A8%D0%B5%D0%B2" }]],
      ["err", [{ key: "$metadata.error", operation: "exists", type: "string", value: "" }]]
    ];
    for (const job of jobs) {
      try {
        report.logs.push(await queryLogs(account, token, job[1], job[0]));
      } catch (e) {
        report.logs.push({ label: job[0], error: String(e && e.message || e) });
      }
    }
    try {
      report.logs.push(await queryLogs(account, token, [], "sample", { noService: true, limit: 3 }));
    } catch (eS) {
      report.logs.push({ label: "sample", error: String(eS && eS.message || eS) });
    }
    try {
      report.logs.push(await queryLogs(account, token, [], "by-service", {
        noService: true,
        view: "calculations",
        limit: 20,
        calculations: [{ key: "$metadata.service", operator: "count" }],
        groupBys: [{ key: "$metadata.service", type: "string" }]
      }));
    } catch (eG) {
      report.logs.push({ label: "by-service", error: String(eG && eG.message || eG) });
    }
  } else {
    report.logs = "no-token";
  }
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const logList = Array.isArray(report.logs) ? report.logs : [];
  const pub = {
    snaps: snaps,
    listPartnersAt: report.listPartnersAt,
    partnerCount: report.partnerCount,
    partnerHits: report.partnerHits,
    partnerAll: report.partnerAll,
    adminAt: report.adminAt,
    pointHits: report.pointHits,
    networkHits: report.networkHits,
    varkaPoints: report.varkaPoints,
    partnerOrdersAt: report.partnerOrdersAt,
    partnerOrdersN: report.partnerOrdersN,
    recentOrders: report.recentOrders,
    shevOrders: report.shevOrders,
    deferredAt: report.deferredAt,
    deferredNow: report.deferredNow,
    recentDeferred: report.recentDeferred,
    touched: report.touched,
    dayOrders: report.dayOrders,
    writes: report.writes,
    accountFound: report.accountFound,
    logsNote: Array.isArray(report.logs) ? "" : report.logs,
    logs: logList.map(function (l) {
      return { label: l.label, http: l.http, ok: l.ok, count: l.count, error: l.error, keys: l.keys, statistics: l.statistics, calculations: l.calculations, events: l.events };
    })
  };
  console.log(JSON.stringify(pub, null, 2));
}

main().catch(function (e) {
  console.error(e && e.stack || e);
  process.exit(1);
});
