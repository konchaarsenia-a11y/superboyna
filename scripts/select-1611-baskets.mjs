import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
function d1(sql) {
  const r = spawnSync("npx", ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: path.resolve("boinya-c/proxy"), encoding: "utf8", env: process.env });
  if (r.status !== 0) return { error: (r.stderr || r.stdout || "").slice(0, 800) };
  try { return JSON.parse(r.stdout); } catch { return { error: "bad_json" }; }
}
function rows(j) {
  if (!j || j.error) return [];
  const arr = Array.isArray(j) ? j : [j];
  for (const b of arr) {
    if (b && Array.isArray(b.results)) return b.results;
    if (b && b.result) for (const r of b.result) if (r && Array.isArray(r.results)) return r.results;
  }
  return [];
}
const list = rows(d1("SELECT id, client, day_name, date_iso, segment, source, basket_json FROM orders WHERE status='active' AND date_iso='2026-11-16' ORDER BY client"));
const out = list.map(r => {
  let basket = [];
  try { basket = JSON.parse(r.basket_json || "[]"); } catch {}
  return { id: r.id, client: r.client, day_name: r.day_name, segment: r.segment, source: r.source,
    basket: basket.map(it => ({ name: it.name || it.main, val: it.val, value: it.value, qty: it.qty, cat: it.cat, sub: it.sub })) };
});
const lung = out.reduce((s, o) => s + o.basket.filter(i => /легк/i.test(String(i.name||""))).reduce((a,i)=>a+(Number(i.val!=null?i.val:i.value!=null?i.value:i.qty)||0),0), 0);
const heart = out.reduce((s, o) => s + o.basket.filter(i => /сердц/i.test(String(i.name||""))).reduce((a,i)=>a+(Number(i.val!=null?i.val:i.value!=null?i.value:i.qty)||0),0), 0);
const report = { n: out.length, lungSum: lung, heartSum: heart, orders: out };
fs.mkdirSync(process.env.OUT_DIR || "/opt/cursor/artifacts", { recursive: true });
fs.writeFileSync((process.env.OUT_DIR || "/opt/cursor/artifacts") + "/select-1611-baskets.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
