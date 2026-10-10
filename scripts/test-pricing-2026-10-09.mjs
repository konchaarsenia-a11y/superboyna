/**
 * Канон PRICING-2026-10-09: состав → клиенту 153 при M=2.6, себес 91.61.
 * Плюс замер открытия карточки: список рисуется до сети.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = require(path.join(root, "boinya-c/next/formulas.js"));

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
}

const base = { S: 32.31, G: 660, P: 17, N: 2, F: 10, packages: 8.72, R: 196.2 };
const a = F.formulaSub_(Object.assign({ M: 2.6 }, base));
assert(a.price === 153.31, "fact M=2.6 " + a.price);
assert(a.stated === 153, "client M=2.6 " + a.stated);
assert(a.cost === 91.61, "cost " + a.cost);
assert(a.recover === 35.38, "recover " + a.recover);
assert(a.delivery === 15.2, "delivery " + a.delivery);
assert(a.margin === 61.39, "clean " + a.margin);
assert(a.cap === 180.5, "cap " + a.cap);
assert(a.M === 2.6, "default path M");

const b = F.formulaSub_(Object.assign({ M: 2.3 }, base));
assert(b.price === 143.61, "fact M=2.3 " + b.price);
assert(b.stated === 144, "client M=2.3 " + b.stated);
assert(b.cost === 91.61, "cost independent of M " + b.cost);
assert(b.margin === 52.39, "clean M=2.3 " + b.margin);

const def = F.formulaSub_(base);
assert(def.M === 2.6 && def.stated === 153, "M defaults to 2.6");

const retail = F.formulaRetail_({ S: 10, G: 100, P: 0, N: 1, R: 50 });
assert(retail.delivery === 9, "retail delivery 9 under 80, got " + retail.delivery);
assert(retail.recover === 3.9, "retail recover 3.90/100g, got " + retail.recover);
const free = F.formulaRetail_({ S: 10, G: 100, P: 0, N: 1, R: 80 });
assert(free.delivery === 0, "retail delivery 0 at 80");

function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const gs = read("Code.gs");
const worker = read("boinya-c/proxy/worker.js");
const price = read("boinya-c/next/price-logic.js");
const clients = read("boinya-c/next/clients.js");
const stats = read("boinya-c/next/stats.js");
assert(gs.includes("PP_RAW26_RECOVER_100_ = 3.30"), "Code.gs recover 3.30");
assert(gs.includes("PP_RAW26_RECOVER_PIECE_ = 0.80"), "Code.gs piece 0.80");
assert(gs.includes("PP_RAW26_DELIVERY_PER_ = 7.60"), "Code.gs delivery 7.60");
assert(gs.includes("PP_RAW26_RETAIL_DELIVERY_PER_ = 9"), "Code.gs retail delivery 9");
assert(gs.includes('"ГРУШИ": { v: 6.60'), "pears 6.60");
assert(gs.includes('asOf < "2026-10-09"'), "old pear date stays 6.67");
assert(worker.includes("PP_RAW26_RECOVER_100_D1_ = 3.3"), "worker recover");
assert(worker.includes("PP_RAW26_DELIVERY_PER_D1_ = 7.6"), "worker delivery");
assert(worker.includes("PP_RAW26_RETAIL_DELIVERY_PER_D1_ = 9"), "worker retail delivery");
assert(price.includes("PP_RAW26_DELIVERY_PER = 7.60"), "price-logic delivery");
assert(price.includes("PP_RAW26_RETAIL_DELIVERY_PER = 9"), "price-logic retail");
assert(worker.includes('return 17') && worker.includes('return 19') && worker.includes('return 22'), "crumb retail 17/19/22");
assert(worker.includes("КРОЛИК|ИНДЕЙК|БАРАН"), "hypo crumb names");

const open = clients.slice(clients.indexOf("async function openCard"), clients.indexOf("async function saveCard"));
const paintAt = open.indexOf("paint()");
const awaitAt = open.indexOf("await api().apiGet");
assert(paintAt > 0 && paintAt < awaitAt, "card paints before getSubscription");
assert(!/force:\s*"1"/.test(open), "openCard does not force a full GAS read");
assert(clients.includes('data-act="cl-econ"'), "economics button");
assert(!/if \(!opts\.force && cache\[key\]\) return;/.test(stats), "stats cache does not skip refresh");
assert(stats.includes("Часть статистики не посчиталась"), "broken formula shelf does not wipe the page");

const NET = 400;
async function beforePaint() {
  const t0 = performance.now();
  await new Promise(function (r) { setTimeout(r, NET); });
  return performance.now() - t0;
}
function afterPaint() {
  const t0 = performance.now();
  const rows = [];
  for (let i = 0; i < 400; i++) rows.push({ nick: "dog" + i, label: "Собака " + i });
  const q = "dog12";
  const hit = rows.filter(function (s) { return String(s.nick).indexOf(q) >= 0; });
  return { ms: performance.now() - t0, n: hit.length };
}
const slow = await beforePaint();
const fast = afterPaint();
assert(fast.ms < 50, "list preview under 50ms, got " + fast.ms);
assert(slow > 300, "old open waited on the network");
const log = [
  "pricing-2026-10-09 ok",
  "M=2.6 client " + a.stated + " fact " + a.price + " cost " + a.cost + " clean " + a.margin,
  "M=2.3 client " + b.stated + " cost " + b.cost + " clean " + b.margin,
  "clients open: before paint after network " + slow.toFixed(1) + " ms; after preview " + fast.ms.toFixed(2) + " ms (" + fast.n + " hits)"
];
console.log(log.join("\n"));
fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
fs.writeFileSync("/opt/cursor/artifacts/pricing-canon.log", log.join("\n") + "\n");
