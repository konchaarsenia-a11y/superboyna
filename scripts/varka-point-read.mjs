#!/usr/bin/env node
/**
 * Read-only: заказы Варки на 2026-10-27 и состав, если он ещё лежит в D1.
 * Ничего не пишет. Повтор 2026-10-23 20:34 UTC: только диагностика дубля Цвирко.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.OUT || path.join(process.cwd(), "artifacts/varka-point");
const DATE = "2026-10-27";

function sh(sql) {
  const raw = execFileSync(
    "npx",
    ["--yes", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    {
      encoding: "utf8",
      maxBuffer: 80 * 1024 * 1024,
      env: process.env,
      cwd: path.join(process.cwd(), "boinya-c/proxy")
    }
  );
  const i = raw.indexOf("[") >= 0 ? raw.indexOf("[") : raw.indexOf("{");
  const data = JSON.parse(raw.slice(i));
  const blocks = Array.isArray(data) ? data : [data];
  const rows = [];
  blocks.forEach(function (b) {
    if (b && Array.isArray(b.results)) rows.push.apply(rows, b.results);
  });
  return rows;
}

function hit(s) {
  return /варк|varka|цвирк|tsvir|шевчен|shevchen/i.test(String(s || ""));
}

function basketBrief(raw) {
  let arr = [];
  try { arr = JSON.parse(raw || "[]"); } catch (e) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  return arr.map(function (it) {
    if (!it || typeof it !== "object") return String(it || "");
    return it;
  });
}

function accountId() {
  const fromEnv = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = execFileSync("npx", ["--yes", "wrangler@4", "whoami"], {
      encoding: "utf8",
      env: process.env,
      cwd: path.join(process.cwd(), "boinya-c/proxy")
    });
    const m = raw.match(/[0-9a-f]{32}/i);
    return m ? m[0] : "";
  } catch (e) {
    return "";
  }
}

function orderBrief(r) {
  let price = "";
  try {
    const meta = JSON.parse(r.meta_json || "{}");
    price = meta.orderPrice != null ? meta.orderPrice : "";
  } catch (e) {}
  return {
    id: r.id,
    client: r.client,
    match_key: r.match_key,
    address: r.address || "",
    date: r.date_iso,
    day: r.day_name,
    segment: r.segment,
    source: r.source,
    status: r.status,
    updated_at: r.updated_at,
    price: price,
    basket: basketBrief(r.basket_json),
    note: String(r.note || "").slice(0, 160)
  };
}

function poBrief(o) {
  const basket = Array.isArray(o.basket) ? o.basket : [];
  return {
    id: o.id || "",
    location: o.locationName || "",
    user: o.userName || "",
    address: o.address || "",
    status: o.status || "",
    date: o.deliverDateIso || o.date || "",
    total: o.totalByn != null ? o.totalByn : "",
    created: o.createdAt || "",
    slotAt: o.slotAt || o.statusAt || "",
    basket: basket.map(function (it) {
      if (!it) return "";
      const name = it.name || it.title || it.product || "";
      const g = it.grams != null ? it.grams : it.qty;
      return String(name) + (g != null && g !== "" ? " " + g : "");
    }).filter(Boolean)
  };
}

function hashRows(rows) {
  const lines = rows.map(function (r) { return JSON.stringify(r); }).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex") + ":" + lines.length;
}

async function logs(account, token) {
  const from = Date.parse("2026-10-23T12:00:00Z");
  const to = Date.now();
  const filters = [
    ["tsvir", "Цвирко"],
    ["shev", "Шевченко"],
    ["varka", "VARKA"],
    ["save", "saveOrder"],
    ["date", "2026-10-27"],
    ["addr", "Шевченко"]
  ];
  const out = [];
  for (const pair of filters) {
    const body = {
      queryId: "varka-point-" + pair[0],
      view: "events",
      limit: 30,
      dry: true,
      timeframe: { from: from, to: to },
      parameters: {
        filterCombination: "and",
        filters: [
          { key: "$metadata.service", operation: "eq", type: "string", value: "boinya-c" },
          { key: "$metadata.message", operation: "includes", type: "string", value: pair[1] }
        ]
      }
    };
    try {
      const res = await fetch(
        "https://api.cloudflare.com/client/v4/accounts/" + account + "/workers/observability/telemetry/query",
        {
          method: "POST",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );
      const json = await res.json().catch(function () { return {}; });
      const events = (((json || {}).result || {}).events) || [];
      out.push({
        label: pair[0],
        http: res.status,
        count: Array.isArray(events) ? events.length : 0,
        sample: (Array.isArray(events) ? events : []).slice(0, 8).map(function (ev) {
          const meta = ev.$metadata || {};
          return {
            t: meta.timestamp || "",
            message: String(meta.message || "").slice(0, 400)
          };
        })
      });
    } catch (e) {
      out.push({ label: pair[0], error: String(e && e.message || e) });
    }
  }
  return out;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const day = sh(
    "SELECT id, client, match_key, address, date_iso, day_name, segment, source, status, updated_at, note, basket_json, meta_json FROM orders WHERE date_iso = '" + DATE + "'"
  );
  const recent = sh(
    "SELECT id, client, match_key, address, date_iso, day_name, segment, source, status, updated_at, note, basket_json, meta_json FROM orders WHERE updated_at >= '2026-10-23T19:40:00'"
  );
  const keys = sh(
    "SELECT id, client, match_key, address, date_iso, day_name, segment, source, status, updated_at, note, basket_json, meta_json FROM orders WHERE match_key IN ('VARKA','ВАРКА') OR id LIKE '%VARKA%' OR id LIKE '%ВАРКА%'"
  );
  const poRows = sh("SELECT payload, updated_at FROM snap_cache WHERE cache_key = 'partnerOrders'");
  const defRows = sh("SELECT payload, updated_at FROM snap_cache WHERE cache_key = 'listDeferred'");
  const snaps = sh(
    "SELECT cache_key, updated_at, length(payload) AS n FROM snap_cache WHERE cache_key = 'partnerOrders' OR cache_key LIKE 'dupBackup:%varka%' OR cache_key LIKE 'dupBackup:%VARKA%' OR cache_key LIKE 'dupBackup:CAL:%' OR cache_key = 'viewDate:" + DATE + "' OR cache_key LIKE 'writeGuard:%VARKA%' OR cache_key LIKE 'writeGuard:%ВАРКА%'"
  );
  const ordersFp = sh(
    "SELECT id, match_key, status, updated_at, length(ifnull(basket_json,'')) AS bl, length(ifnull(address,'')) AS al FROM orders"
  );
  const subsFp = sh("SELECT id, nick, sheet, status FROM subs");
  const counts = {
    orders: ordersFp.length,
    ordersActive: ordersFp.filter(function (r) { return r.status === "active"; }).length,
    subs: subsFp.length,
    ordersHash: hashRows(ordersFp),
    subsHash: hashRows(subsFp)
  };

  let partnerOrders = [];
  let poAt = "";
  if (poRows[0]) {
    poAt = poRows[0].updated_at || "";
    try {
      const payload = JSON.parse(poRows[0].payload || "{}");
      partnerOrders = (payload.orders || []).filter(function (o) {
        return hit([o && o.locationName, o && o.userName, o && o.address, o && o.deliverDateIso].join(" ")) || String(o && o.deliverDateIso || "") === DATE;
      }).map(poBrief);
    } catch (e) {
      partnerOrders = [{ error: String(e.message || e) }];
    }
  }
  let deferred = [];
  if (defRows[0]) {
    try {
      const payload = JSON.parse(defRows[0].payload || "{}");
      deferred = (payload.items || []).filter(function (it) {
        const pl = (it && it.payload) || {};
        return hit([pl.locationName, pl.userName, it && it.title, pl.deliverDateIso].join(" "));
      }).map(function (it) {
        const pl = it.payload || {};
        return {
          id: it.id,
          status: it.status,
          po: pl.partnerOrderId || "",
          location: pl.locationName || it.title || "",
          date: pl.deliverDateIso || "",
          orderStatus: pl.orderStatus || "",
          updatedAt: it.updatedAt || ""
        };
      });
    } catch (e2) {
      deferred = [{ error: String(e2.message || e2) }];
    }
  }

  const dayHit = day.filter(function (r) {
    return hit([r.client, r.match_key, r.address, r.note, r.id].join(" "));
  }).map(orderBrief);
  const recentHit = recent.filter(function (r) {
    return hit([r.client, r.match_key, r.address, r.id].join(" "));
  }).map(orderBrief);
  const keyHit = keys.filter(function (r) {
    return String(r.date_iso || "") === DATE || String(r.updated_at || "") >= "2026-10-23" || hit(r.client + " " + r.address);
  }).map(orderBrief);

  const account = accountId();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
  const logReport = account && token ? await logs(account, token) : { why: "no-token", hasAccount: !!account, hasToken: !!token };
  let viewClients = [];
  const viewRows = sh("SELECT payload FROM snap_cache WHERE cache_key = 'viewDate:" + DATE + "'");
  if (viewRows[0]) {
    try {
      const view = JSON.parse(viewRows[0].payload || "{}");
      const list = view.clients || view.people || view.rows || [];
      viewClients = (Array.isArray(list) ? list : []).map(function (c) {
        return { name: c.name || c.client || "", address: c.address || "", matchKey: c.matchKey || "", basket: c.basket || c.orderCount || "" };
      });
    } catch (eV) {
      viewClients = [{ error: String(eV.message || eV) }];
    }
  }
  let backup = null;
  const bak = sh("SELECT payload FROM snap_cache WHERE cache_key = 'dupBackup:CAL:ВАРКА:2026-10-27'");
  if (bak[0]) {
    try {
      const payload = JSON.parse(bak[0].payload || "{}");
      backup = {
        keys: Object.keys(payload),
        id: payload.id || (payload.row && payload.row.id) || "",
        client: payload.client || (payload.row && payload.row.client) || "",
        address: payload.address || (payload.row && payload.row.address) || "",
        sample: JSON.stringify(payload).slice(0, 500)
      };
    } catch (eB) {
      backup = { error: String(eB.message || eB) };
    }
  }

  const report = {
    counts: counts,
    dayAll: day.length,
    dayHit: dayHit,
    recentHit: recentHit,
    keyHit: keyHit,
    partnerOrdersAt: poAt,
    partnerOrders: partnerOrders.filter(function (o) {
      return !o || o.error || String(o.date || "") === DATE || hit(o.location + " " + o.user + " " + o.address);
    }),
    deferred: deferred,
    snaps: snaps,
    logs: logReport,
    viewClients: viewClients,
    backup: backup,
    dayEvery: day.map(orderBrief),
    sinceRekey: recent.map(orderBrief)
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const pub = {
    counts: counts,
    dayHit: dayHit,
    recentHit: recentHit,
    keyOnDate: keyHit.filter(function (r) { return r.date === DATE; }),
    partnerOnDate: (report.partnerOrders || []).filter(function (o) { return o.date === DATE || hit(o.location); }),
    snaps: snaps,
    logs: logReport,
    viewClients: viewClients,
    backup: backup,
    dayEvery: day.map(orderBrief),
    sinceRekey: recent.map(orderBrief)
  };
  console.log(JSON.stringify(pub, null, 2));
}

main().catch(function (e) {
  console.error(e && e.stack || e);
  process.exit(1);
});
