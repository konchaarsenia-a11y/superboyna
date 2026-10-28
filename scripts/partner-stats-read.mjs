#!/usr/bin/env node
/**
 * Read-only October partner totals for stats. No client names, no writes.
 */
import { execFileSync } from "node:child_process";

function sh(sql) {
  const raw = execFileSync(
    "npx",
    ["--yes", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    {
      encoding: "utf8",
      maxBuffer: 40 * 1024 * 1024,
      env: process.env,
      cwd: "boinya-c/proxy"
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

const FACE =
  "(upper(client) LIKE '%ВАРК%' OR upper(client) LIKE '%VARKA%' OR upper(replace(client,'ё','е')) LIKE '%ВАРК%' OR upper(client) LIKE '%AIRO%')";
const TAGGED =
  "(upper(coalesce(segment,'')) LIKE 'ПАРТ%' OR lower(coalesce(source,'')) = 'partner' OR lower(coalesce(source,'')) LIKE 'парт%')";
const ALIVE = "lower(coalesce(status,'')) NOT IN ('cancelled','deleted')";
const OCT = "date_iso >= '2026-10-01' AND date_iso < '2026-11-01'";
const PRICE = "cast(json_extract(meta_json, '$.orderPrice') as real)";
const TRACK =
  "length(trim(coalesce(json_extract(meta_json, '$.mailTrack'), json_extract(meta_json, '$.track'), ''))) > 0";
const DELIV =
  "EXISTS (SELECT 1 FROM deliveries d WHERE d.date_iso = orders.date_iso AND d.delivered = 1 AND (d.match_key = orders.match_key OR d.match_key = orders.client))";

const bySeg = sh(
  "SELECT coalesce(nullif(segment,''),'(empty)') AS seg, coalesce(nullif(source,''),'(empty)') AS src, count(*) AS n, " +
    "sum(CASE WHEN " + PRICE + " > 0 THEN 1 ELSE 0 END) AS priced, " +
    "round(sum(CASE WHEN " + PRICE + " > 0 THEN " + PRICE + " ELSE 0 END), 2) AS price_sum, " +
    "sum(CASE WHEN " + DELIV + " OR " + TRACK + " THEN 1 ELSE 0 END) AS delivered, " +
    "sum(CASE WHEN " + FACE + " THEN 1 ELSE 0 END) AS face " +
    "FROM orders WHERE " + ALIVE + " AND " + OCT + " GROUP BY 1, 2 ORDER BY n DESC"
);

const partnerMonths = sh(
  "SELECT substr(date_iso,1,7) AS ym, count(*) AS n, " +
    "sum(CASE WHEN " + PRICE + " > 0 THEN 1 ELSE 0 END) AS priced, " +
    "round(sum(CASE WHEN " + PRICE + " > 0 THEN " + PRICE + " ELSE 0 END), 2) AS price_sum, " +
    "sum(CASE WHEN " + DELIV + " OR " + TRACK + " THEN 1 ELSE 0 END) AS delivered, " +
    "sum(CASE WHEN " + FACE + " THEN 1 ELSE 0 END) AS face " +
    "FROM orders WHERE " + ALIVE + " AND " + TAGGED +
    " AND date_iso >= '2026-09-01' AND date_iso < '2026-12-01' GROUP BY 1 ORDER BY 1"
);

const faceNotTagged = sh(
  "SELECT coalesce(nullif(segment,''),'(empty)') AS seg, coalesce(nullif(source,''),'(empty)') AS src, count(*) AS n, " +
    "sum(CASE WHEN " + PRICE + " > 0 THEN 1 ELSE 0 END) AS priced, " +
    "round(sum(CASE WHEN " + PRICE + " > 0 THEN " + PRICE + " ELSE 0 END), 2) AS price_sum, " +
    "sum(CASE WHEN " + DELIV + " OR " + TRACK + " THEN 1 ELSE 0 END) AS delivered " +
    "FROM orders WHERE " + ALIVE + " AND " + OCT + " AND " + FACE + " AND NOT " + TAGGED +
    " GROUP BY 1, 2"
);

const emptyDate = sh(
  "SELECT count(*) AS n FROM orders WHERE " + ALIVE + " AND (date_iso IS NULL OR date_iso = '') AND (" + TAGGED + " OR " + FACE + ")"
);

const statusMix = sh(
  "SELECT coalesce(status,'(empty)') AS status, count(*) AS n FROM orders WHERE " + OCT + " AND (" + TAGGED + " OR " + FACE + ") GROUP BY 1"
);

const partnerSplit = sh(
  "SELECT count(*) AS rows_n, count(DISTINCT date_iso || '|' || match_key) AS keys_n, " +
    "sum(CASE WHEN " + DELIV + " OR " + TRACK + " THEN 1 ELSE 0 END) AS delivered_rows, " +
    "round(sum(CASE WHEN " + PRICE + " > 0 AND (" + DELIV + " OR " + TRACK + ") THEN " + PRICE + " ELSE 0 END), 2) AS rev_if_delivered, " +
    "round(sum(CASE WHEN " + PRICE + " > 0 THEN " + PRICE + " ELSE 0 END), 2) AS rev_all_prices, " +
    "sum(CASE WHEN " + PRICE + " > 0 THEN 1 ELSE 0 END) AS priced_rows, " +
    "sum(CASE WHEN instr(ifnull(note,''), '[ЦЕНА:') > 0 THEN 1 ELSE 0 END) AS note_price_rows, " +
    "round(sum(CASE WHEN cast(json_extract(meta_json, '$.clientPrice') as real) > 0 THEN cast(json_extract(meta_json, '$.clientPrice') as real) ELSE 0 END), 2) AS client_price_sum " +
    "FROM orders WHERE " + ALIVE + " AND " + OCT + " AND " + TAGGED
);

let rabbitOrders = [];
let rabbitPrice = [];
try {
  rabbitOrders = sh(
    "SELECT date_iso, status, coalesce(segment,'(empty)') AS seg, " +
      "CASE WHEN upper(coalesce(basket_json,'')) LIKE '%\"КРОЛИК\"%' THEN 'name' ELSE 'text' END AS hit " +
      "FROM orders WHERE upper(coalesce(basket_json,'')) LIKE '%КРОЛИК%' " +
      "AND lower(coalesce(status,'')) NOT IN ('cancelled','deleted') ORDER BY date_iso LIMIT 40"
  );
} catch (eR) {
  rabbitOrders = [{ error: "orders" }];
}
try {
  rabbitPrice = sh(
    "SELECT name, cat, price, unit FROM price_positions WHERE upper(name) LIKE '%КРОЛИК%' LIMIT 20"
  );
} catch (eP) {
  rabbitPrice = [{ error: "no_table" }];
}

console.log(JSON.stringify({
  octoberBySegment: bySeg,
  taggedPartnerByMonth: partnerMonths,
  octoberFaceNotTagged: faceNotTagged,
  partnerLikeEmptyDate: emptyDate,
  octoberPartnerLikeByStatus: statusMix,
  octoberPartnerSplit: partnerSplit,
  rabbitOrders: rabbitOrders,
  rabbitPricePositions: rabbitPrice
}, null, 2));
