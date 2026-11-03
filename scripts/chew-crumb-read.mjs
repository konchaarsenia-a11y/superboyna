#!/usr/bin/env node
/**
 * Read-only: жевалка с фракцией не должна стать крошкой.
 * Имена клиентов не печатает. Заказы не пишет.
 */
import { execFileSync } from "node:child_process";
import mix from "../boinya-c/next/crumb-mix.js";

function sh(sql) {
  const raw = execFileSync(
    "npx",
    ["--yes", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: 40 * 1024 * 1024, env: process.env, cwd: "boinya-c/proxy" }
  );
  const data = JSON.parse(raw);
  const blocks = Array.isArray(data) ? data : [data];
  const rows = [];
  blocks.forEach(function (b) {
    if (b && Array.isArray(b.results)) rows.push.apply(rows, b.results);
  });
  return rows;
}

function parseBasket(raw) {
  try {
    const j = JSON.parse(raw || "[]");
    return Array.isArray(j) ? j : [];
  } catch (e) {
    return [];
  }
}

const rows = sh(
  "SELECT coalesce(segment,'(empty)') AS seg, basket_json FROM orders " +
    "WHERE lower(coalesce(status,'')) = 'active' AND date_iso >= '2026-10-01' AND date_iso < '2026-11-08' " +
    "AND basket_json IS NOT NULL AND length(basket_json) > 2 ORDER BY date_iso DESC LIMIT 80"
);

let pp = 0;
let other = 0;
let bad = 0;
let chewFrac = 0;
let realCrumb = 0;
const samples = [];
rows.forEach(function (row) {
  const seg = String(row.seg || "");
  if (seg === "ПП") pp++;
  else other++;
  const basket = parseBasket(row.basket_json);
  const html = mix.linesHtml(basket);
  if (/Крошка обычное|Крошка сред\b|Крошка мал\b|Крошка бол\b|Крошка огр\b/i.test(html)) bad++;
  const items = [];
  basket.forEach(function (it) {
    if (!it) return;
    const sub = String(it.sub || "").trim();
    const cat = String(it.cat || "");
    const crumb = mix.isCrumb(it);
    if (crumb) realCrumb++;
    if (/^(обычное|обычная|сред|мал|бол|огр|пласт|палк|половинка)$/i.test(sub) && !crumb) chewFrac++;
    if (samples.length < 8 && (crumb || /обыч|сред|мал|бол/i.test(sub))) {
      items.push({
        cat: cat || "(empty)",
        sub: sub || "",
        val: it.val != null ? it.val : it.value,
        crumb: crumb
      });
    }
  });
  if (items.length && samples.length < 8) samples.push({ seg: seg, items: items });
});

const report = {
  scanned: rows.length,
  pp: pp,
  other: other,
  badCrumbHtml: bad,
  chewFractionLines: chewFrac,
  realCrumbLines: realCrumb,
  samples: samples
};
console.log(JSON.stringify(report, null, 2));
if (bad > 0) process.exit(1);
