/**
 * Миграция price-canon-v2: snapshot + seed 11.10. Карточки не трогает.
 * Owner initData. Запуск только из CI workflow_dispatch / PR.
 */
import crypto from "node:crypto";

const WORKER = "https://boinya-c.konchaarsenia.workers.dev/";
const OWNER_ID = Number(process.env.PP_AUDIT_TG_ID || "650923866");
const OWNER_NAME = process.env.PP_AUDIT_TG_NAME || "Арсений";

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

const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
if (!token) {
  console.error("NO_TELEGRAM_BOT_TOKEN");
  process.exit(1);
}
const dry = String(process.env.PRICE_CANON_DRY || "") === "1";
const initData = signInitData(token, {
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id: OWNER_ID, first_name: OWNER_NAME })
});

if (dry) {
  console.log(JSON.stringify({ dry: true, action: "migratePriceCanonV2", skip: true }, null, 2));
  process.exit(0);
}

const res = await fetch(WORKER, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "migratePriceCanonV2", cutover: 1, initData })
});
const text = await res.text();
let json = null;
try {
  json = JSON.parse(text);
} catch (e) {
  console.error(text.slice(0, 500));
  process.exit(1);
}
console.log(JSON.stringify(json, null, 2));
if (!json || json.status !== "success") process.exit(1);
