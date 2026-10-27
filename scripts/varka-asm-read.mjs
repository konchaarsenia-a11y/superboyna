#!/usr/bin/env node
/**
 * Read-only: точки Варки на 2026-10-27 и карточки сборки вторника.
 * Ничего не пишет.
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] || path.join(process.cwd(), "artifacts/varka-asm");

function rowsOf(name) {
  const raw = fs.readFileSync(path.join(dir, name + ".json"), "utf8");
  const i = raw.indexOf("[") >= 0 ? raw.indexOf("[") : raw.indexOf("{");
  const data = JSON.parse(raw.slice(i));
  const blocks = Array.isArray(data) ? data : [data];
  const rows = [];
  blocks.forEach(function (b) {
    if (b && Array.isArray(b.results)) rows.push.apply(rows, b.results);
  });
  return rows;
}

function basketBrief(raw) {
  let arr = [];
  try { arr = JSON.parse(raw || "[]"); } catch (e) { arr = []; }
  if (!Array.isArray(arr)) return [];
  return arr.map(function (it) {
    if (!it || typeof it !== "object") return String(it || "");
    const name = it.name || it.main || "";
    const val = it.val != null ? it.val : it.value;
    const sub = it.sub || "";
    return [name, sub, val, it.unit || ""].filter(function (x) { return x != null && x !== ""; }).join(" ");
  });
}

function hit(s) {
  return /варк|varka|цвирк|шевчен/i.test(String(s || ""));
}

const orders = rowsOf("orders").map(function (r) {
  return {
    id: r.id,
    client: r.client,
    match_key: r.match_key,
    address: r.address || "",
    day: r.day_name,
    date: r.date_iso,
    status: r.status,
    segment: r.segment,
    basket: basketBrief(r.basket_json)
  };
});

let partner = [];
try {
  const snap = rowsOf("partners");
  const payload = snap[0] && snap[0].payload;
  const pack = JSON.parse(payload || "{}");
  (pack.orders || []).forEach(function (o) {
    const date = String((o && o.deliverDateIso) || "").slice(0, 10);
    const name = (o && (o.locationName || o.userName)) || "";
    if (date !== "2026-10-27" && !hit(name)) return;
    if (date !== "2026-10-27") return;
    partner.push({
      id: o.id,
      status: o.status || "",
      name: name,
      address: o.address || "",
      basket: basketBrief(JSON.stringify(o.basket || []))
    });
  });
} catch (e) {
  partner = [{ error: String(e && e.message || e) }];
}

let assembly = [];
try {
  const snap = rowsOf("assembly");
  const payload = snap[0] && snap[0].payload;
  const pack = JSON.parse(payload || "{}");
  assembly = (pack.clients || []).filter(function (c) {
    return hit(c && (c.name || c.matchKey || c.address || ""));
  }).map(function (c) {
    return {
      name: c.name,
      matchKey: c.matchKey || "",
      address: c.address || "",
      partnerOrderId: c.partnerOrderId || "",
      basket: basketBrief(JSON.stringify(c.basket || []))
    };
  });
} catch (e) {
  assembly = [{ error: String(e && e.message || e) }];
}

const summary = {
  orders: orders,
  partner: partner,
  assembly: assembly,
  orderCount: orders.length,
  partnerOpen: partner.filter(function (o) { return o && String(o.status || "").toLowerCase() !== "cancelled"; }).length,
  assemblyCards: assembly.filter(function (c) { return c && c.name; }).length
};
fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
