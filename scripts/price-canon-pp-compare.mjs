/**
 * RO: 29 активных ПП — указанная vs новый calc (canon v2 / RAW26). Карточки не пишет.
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const proxy = join(root, "..", "boinya-c", "proxy");
const outDir = process.env.PRICE_CANON_OUT || join(root, "..", "artifacts", "price-canon-v2");
const WORKER = "https://boinya-c.konchaarsenia.workers.dev/";
const OWNER_ID = Number(process.env.PP_AUDIT_TG_ID || "650923866");
const OWNER_NAME = process.env.PP_AUDIT_TG_NAME || "Арсений";

function parseWrangler(text) {
  const raw = String(text || "");
  const at = raw.search(/[\[{]/);
  if (at < 0) throw new Error("wrangler: нет json");
  return JSON.parse(raw.slice(at));
}
function d1(sql) {
  const run = spawnSync(
    "npx",
    ["--yes", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: proxy, encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 }
  );
  if (run.status !== 0) throw new Error((run.stderr || run.stdout || "d1").slice(-800));
  const parsed = parseWrangler((run.stdout || "") + "\n" + (run.stderr || ""));
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return (block && block.results) || [];
}
function payloadOf(rows) {
  if (!rows || !rows.length) return null;
  let p = rows[0].payload;
  if (typeof p === "string") p = JSON.parse(p);
  return p;
}
function signInitData(token, fields) {
  const keys = Object.keys(fields).sort();
  const dcs = keys.map((k) => k + "=" + fields[k]).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(dcs).digest("hex");
  const sp = new URLSearchParams();
  keys.forEach((k) => sp.append(k, fields[k]));
  sp.append("hash", hash);
  return sp.toString();
}
async function workerPost(body) {
  const res = await fetch(WORKER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { status: "error", message: "bad_json", raw: text.slice(0, 300) };
  }
}

const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
if (!token) {
  console.error("NO_TELEGRAM_BOT_TOKEN");
  process.exit(1);
}
const initData = signInitData(token, {
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id: OWNER_ID, first_name: OWNER_NAME })
});

mkdirSync(outDir, { recursive: true });

const subsPayload = payloadOf(d1("SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'"));
const list = (subsPayload && (subsPayload.subscriptions || subsPayload.list || subsPayload.items)) || [];
const active = list.filter((s) => {
  const sheet = String((s && (s.sheet || s.segment)) || "").toUpperCase();
  if (sheet !== "ПП" && sheet !== "PP") return false;
  const st = String((s && s.status) || "").toLowerCase();
  if (st === "deleted" || st === "afk" || st === "афк") return false;
  return true;
});

const rows = [];
for (const s of active) {
  const nick = String(s.nick || s.label || s.name || "").trim();
  const basket = s.basket || s.items || [];
  const stated = Number(s.statedCost != null ? s.statedCost : s.stated) || 0;
  const coef = Number(s.coef) || 2.6;
  const n = Number(s.deliveriesN != null ? s.deliveriesN : s.deliveries) || 1;
  const packs = s.packCounts || s.packs || {};
  let calc = null;
  try {
    calc = await workerPost({
      action: "calcPrice",
      mode: "pp",
      fullFact: 1,
      cutover: 1,
      initData,
      basket,
      coef,
      deliveriesN: n,
      scheme: "RAW26",
      forNew: 1,
      packCounts: packs,
      u1: packs.u1,
      u2: packs.u2,
      u3: packs.u3,
      up4: packs.up4
    });
  } catch (e) {
    calc = { status: "error", message: String(e) };
  }
  const newPrice =
    calc && calc.status === "success" && !calc.costIncomplete
      ? Number(calc.clientPrice != null ? calc.clientPrice : calc.factCost != null ? calc.factCost : calc.total)
      : null;
  rows.push({
    nick,
    subId: s.subId || s.id || "",
    coef,
    scheme: s.scheme || "",
    stated,
    newCalc: newPrice,
    diff: newPrice != null ? Math.round((stated - newPrice) * 100) / 100 : null,
    costIncomplete: !!(calc && calc.costIncomplete),
    missing: (calc && calc.missing) || 0,
    S: calc && calc.rawCost != null ? calc.rawCost : calc && calc.cost,
    priceCanon: (calc && calc.priceCanon) || ""
  });
}

const csv = ["ник,subId,coef,указанная,новый_calc,diff,incomplete,missing,S,canon"]
  .concat(
    rows.map((r) =>
      [
        r.nick,
        r.subId,
        r.coef,
        r.stated,
        r.newCalc != null ? r.newCalc : "",
        r.diff != null ? r.diff : "",
        r.costIncomplete ? 1 : 0,
        r.missing,
        r.S != null ? r.S : "",
        r.priceCanon
      ].join(",")
    )
  )
  .join("\n");

writeFileSync(join(outDir, "pp-stated-vs-new.csv"), csv + "\n");
writeFileSync(join(outDir, "pp-stated-vs-new.json"), JSON.stringify({ at: new Date().toISOString(), n: rows.length, rows }, null, 2));
console.log(JSON.stringify({ wrote: outDir, n: rows.length }, null, 2));
