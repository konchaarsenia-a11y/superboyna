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

async function queryLogs(account, token, filters, label) {
  const body = {
    queryId: "varka-save-" + label,
    view: "events",
    limit: 80,
    dry: true,
    timeframe: { from: FROM, to: TO },
    parameters: {
      filterCombination: "and",
      filters: [
        { key: "$metadata.service", operation: "eq", type: "string", value: "boinya-c" }
      ].concat(filters)
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
    varkaPoints: report.varkaPoints
  }, null, 2));
  let account = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
  if (!account && token) account = accountFromWhoami();
  report.accountFound = !!account;
  if (account && token) {
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
    accountFound: report.accountFound,
    logsNote: Array.isArray(report.logs) ? "" : report.logs,
    logs: logList.map(function (l) {
      return { label: l.label, http: l.http, ok: l.ok, count: l.count, error: l.error, keys: l.keys, events: l.events };
    })
  };
  console.log(JSON.stringify(pub, null, 2));
}

main().catch(function (e) {
  console.error(e && e.stack || e);
  process.exit(1);
});
