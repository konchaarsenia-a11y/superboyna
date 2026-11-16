#!/usr/bin/env node
/**
 * Prod RO: getWebhookInfo + signed initData → getClients/getAssembly/getCourier/getCutting.
 * No date/force on getClients. No write actions. No D1 writes.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PROD = process.env.PROD_URL || "https://boinya-c.konchaarsenia.workers.dev";
const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts";
const TID = String(process.env.OWNER_TID || "650923866");

function mintInitData(token, tid) {
  const user = JSON.stringify({
    id: Number(tid),
    first_name: "Arseniy",
    username: "arseny"
  });
  const authDate = String(Math.floor(Date.now() / 1000));
  const fields = { user, auth_date: authDate, query_id: "prod_ro_" + authDate };
  const keys = Object.keys(fields).sort();
  const dataCheck = keys.map((k) => k + "=" + fields[k]).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheck).digest("hex");
  return (
    keys.map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(fields[k])).join("&") +
    "&hash=" +
    hash
  );
}

async function tg(token, method) {
  const res = await fetch("https://api.telegram.org/bot" + token + "/" + method);
  const json = await res.json().catch(() => ({ ok: false }));
  const r = json.result && typeof json.result === "object" ? json.result : {};
  return {
    http: res.status,
    ok: json.ok === true,
    url: r.url || "",
    pending_update_count: r.pending_update_count,
    last_error_message: r.last_error_message || "",
    last_error_date: r.last_error_date == null ? null : r.last_error_date,
    username: r.username || ""
  };
}

async function api(action, params, initData) {
  const body = Object.assign({ action, cutover: 1 }, params || {});
  if (initData) body.initData = initData;
  const res = await fetch(PROD + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 ProdRo/1" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { status: "error", message: "non_json", raw: text.slice(0, 200) };
  }
  return { http: res.status, json };
}

const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
if (!token) {
  console.error(JSON.stringify({ status: "error", message: "no_token" }));
  process.exit(1);
}

const ping = await api("ping");
const hookInfo = await tg(token, "getWebhookInfo");
const me = await tg(token, "getMe");
const initData = mintInitData(token, TID);

// getClients: day only — no date, no force
const clients = await api("getClients", { day: "Будущая неделя" }, initData);
const assembly = await api("getAssembly", { day: "Будущая неделя" }, initData);
const courier = await api("getCourier", { day: "Будущая неделя" }, initData);
const cutting = await api("getCutting", { day: "Будущая неделя" }, initData);

function okAction(r) {
  const s = r && r.json && r.json.status;
  return r.http === 200 && (s === "success" || s === "ok" || Array.isArray((r.json && r.json.clients) || (r.json && r.json.items)));
}

const report = {
  at: new Date().toISOString(),
  ping: {
    http: ping.http,
    marker: ping.json && ping.json.deployMarker,
    tg: ping.json && ping.json.hasTelegramToken,
    live: ping.json && ping.json.live
  },
  bot: { ok: me.ok, username: me.username },
  getWebhookInfo: {
    ok: hookInfo.ok,
    url: hookInfo.url,
    pending_update_count: hookInfo.pending_update_count,
    last_error_message: hookInfo.last_error_message,
    last_error_date: hookInfo.last_error_date
  },
  clients: {
    http: clients.http,
    status: clients.json && clients.json.status,
    n: ((clients.json && clients.json.clients) || []).length,
    message: clients.json && clients.json.message
  },
  assembly: {
    http: assembly.http,
    status: assembly.json && assembly.json.status,
    n: ((assembly.json && assembly.json.clients) || []).length,
    message: assembly.json && assembly.json.message
  },
  courier: {
    http: courier.http,
    status: courier.json && courier.json.status,
    n: ((courier.json && (courier.json.clients || courier.json.stops || courier.json.items)) || []).length,
    message: courier.json && courier.json.message
  },
  cutting: {
    http: cutting.http,
    status: cutting.json && cutting.json.status,
    n: ((cutting.json && cutting.json.items) || []).length,
    message: cutting.json && cutting.json.message
  }
};

const hookOk =
  hookInfo.ok &&
  String(hookInfo.url).includes("boinya-c.konchaarsenia.workers.dev/telegram/boinya") &&
  !hookInfo.last_error_message;
const apiOk =
  okAction(clients) && okAction(assembly) && okAction(courier) && okAction(cutting);
report.ok =
  ping.json &&
  ping.json.live === true &&
  ping.json.hasTelegramToken === true &&
  hookOk &&
  apiOk;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "prod-ro-api.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 2);
