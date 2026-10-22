#!/usr/bin/env node
/**
 * Read-only: заявки партнёров и заказы Варки на октябрь 2026.
 * Ничего не пишет в D1.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.OUT || path.join(process.cwd(), "artifacts/varka-month");

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
  const data = JSON.parse(raw);
  const blocks = Array.isArray(data) ? data : [data];
  const rows = [];
  blocks.forEach(function (b) {
    if (b && Array.isArray(b.results)) rows.push.apply(rows, b.results);
  });
  return rows;
}

function briefOrder(o) {
  if (!o) return null;
  return {
    id: o.id || "",
    location: o.locationName || o.locationId || "",
    user: o.userName || o.username || "",
    status: o.status || "",
    date: o.deliverDateIso || "",
    needsSlot: o.needsSlot,
    created: o.createdAt || o.created || "",
    slotAt: o.slotAt || "",
    total: o.totalByn
  };
}

function briefDeferred(it) {
  const pl = (it && it.payload) || {};
  return {
    id: it.id || "",
    status: it.status || "",
    mode: it.mode || pl.mode || "",
    po: pl.partnerOrderId || "",
    location: pl.locationName || it.title || "",
    orderStatus: pl.orderStatus || "",
    date: pl.deliverDateIso || "",
    needsSlot: pl.needsSlot,
    updatedAt: it.updatedAt || ""
  };
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const orders = sh(
    "SELECT id, client, match_key, date_iso, day_name, segment, source, status, updated_at, substr(ifnull(note,''),1,180) AS note, substr(ifnull(basket_json,''),1,220) AS basket FROM orders WHERE status = 'active' AND date_iso = '2026-10-27' ORDER BY client LIMIT 80"
  );
  const recent = sh(
    "SELECT id, client, date_iso, day_name, segment, source, status, updated_at FROM orders WHERE updated_at >= '2026-10-22T12:00:00' AND status = 'active' ORDER BY updated_at DESC LIMIT 40"
  );
  const poRows = sh("SELECT payload, updated_at FROM snap_cache WHERE cache_key = 'partnerOrders'");
  const defRows = sh("SELECT payload, updated_at FROM snap_cache WHERE cache_key = 'listDeferred'");
  let po = [];
  let poAt = "";
  if (poRows[0]) {
    poAt = poRows[0].updated_at || "";
    try {
      const payload = JSON.parse(poRows[0].payload || "{}");
      po = (payload.orders || []).map(briefOrder);
    } catch (e) {
      po = [{ error: String(e.message || e) }];
    }
  }
  let deferred = [];
  let defAt = "";
  if (defRows[0]) {
    defAt = defRows[0].updated_at || "";
    try {
      const payload = JSON.parse(defRows[0].payload || "{}");
      deferred = (payload.items || []).filter(function (it) {
        const pl = (it && it.payload) || {};
        return String(it.mode || pl.mode || "").toLowerCase() === "partner" || String(pl.orderType || "") === "partner";
      }).map(briefDeferred);
    } catch (e2) {
      deferred = [{ error: String(e2.message || e2) }];
    }
  }
  const dated = deferred.filter(function (it) { return it.date; });
  const report = {
    orders: orders,
    recent: recent,
    partnerOrdersAt: poAt,
    partnerOrders: po,
    deferredAt: defAt,
    deferredPartner: deferred,
    datedCount: dated.length,
    dated: dated
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    orders: orders,
    recent: recent,
    partnerOrdersAt: poAt,
    partnerOrderCount: po.length,
    partnerOrders: po,
    deferredAt: defAt,
    deferredCount: deferred.length,
    datedCount: dated.length,
    dated: dated
  }, null, 2));
}

main();
