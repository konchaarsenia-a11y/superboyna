// Point @klientGB_bot webhook at the worker and set the cabinet menu button.
// Probe uses a fake chat id. Does not message real clients.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { KLIENT_BOT_USERNAME, KLIENT_CABINET_URL, KLIENT_HOOK_PATH, KLIENT_PROBE_TID } from "../boinya-c/proxy/klient-hook.js";

const HOOK_URL = "https://boinya-c.konchaarsenia.workers.dev" + KLIENT_HOOK_PATH;
const PROXY = join(dirname(fileURLToPath(import.meta.url)), "..", "boinya-c", "proxy");
const OUT = process.env.KLIENT_HOOK_OUT || join(dirname(fileURLToPath(import.meta.url)), "..", "artifacts", "klient-bot-hook");
const TOKEN_RE = /bot\d{5,}:[A-Za-z0-9_-]+|\d{5,}:[A-Za-z0-9_-]{15,}/g;

function redact(value) {
  return String(value == null ? "" : value).replace(TOKEN_RE, "[REDACTED]");
}

function say(obj) {
  process.stdout.write(redact(typeof obj === "string" ? obj : JSON.stringify(obj)) + "\n");
}

function wrangler(args, input) {
  const run = spawnSync("npx", ["--yes", "wrangler@4"].concat(args), {
    cwd: PROXY,
    input: input,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 8 * 1024 * 1024
  });
  return {
    exit: run.status,
    text: redact((run.stdout || "") + "\n" + (run.stderr || "")).slice(-500)
  };
}

function putHookSecret(secret) {
  return wrangler(["secret", "put", "CLIENT_WEBHOOK_SECRET"], secret);
}

async function tg(token, method, body) {
  const res = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(function () { return { ok: false, description: "non_json" }; });
  const result = json.result && typeof json.result === "object" ? json.result : {};
  return {
    http: res.status,
    ok: json.ok === true,
    error_code: json.error_code == null ? null : json.error_code,
    description: redact(json.description || ""),
    username: result.username || "",
    url: result.url || "",
    pending_update_count: result.pending_update_count == null ? null : result.pending_update_count,
    last_error_message: redact(result.last_error_message || ""),
    last_error_date: result.last_error_date == null ? null : result.last_error_date,
    allowed: result.allowed_updates || []
  };
}

async function postUpdate(secret, update) {
  const res = await fetch(HOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": secret
    },
    body: JSON.stringify(update)
  });
  return {
    http: res.status,
    kind: String(res.headers.get("X-Klient-Kind") || ""),
    body: redact(await res.text()).slice(0, 80)
  };
}

async function main() {
  const token = String(process.env.CLIENT_BOT_TOKEN || "").trim();
  if (!token) {
    say({ status: "error", message: "no_token" });
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const me = await tg(token, "getMe");
  if (!me.ok || me.username !== KLIENT_BOT_USERNAME) {
    say({ status: "error", message: "unexpected_bot", username: me.username, http: me.http, description: me.description });
    process.exit(1);
  }
  const secret = randomBytes(24).toString("hex");
  let put = putHookSecret(secret);
  put = { exit: put.exit, text: put.text.split(secret).join("[secret]") };
  if (put.exit !== 0) {
    say({ status: "error", message: "hook_secret_put_failed", put: put.text });
    process.exit(1);
  }
  const setAt = Math.floor(Date.now() / 1000);
  const hook = await tg(token, "setWebhook", {
    url: HOOK_URL,
    secret_token: secret,
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: true
  });
  const menu = await tg(token, "setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Кабинет",
      web_app: { url: KLIENT_CABINET_URL }
    }
  });
  const update = {
    update_id: 810000000 + (Date.now() % 100000000),
    message: {
      message_id: 1,
      date: setAt,
      chat: { id: Number(KLIENT_PROBE_TID), type: "private" },
      from: { id: Number(KLIENT_PROBE_TID), is_bot: false, first_name: "tokencheck", username: "tokencheck" },
      text: "/start"
    }
  };
  let info = null;
  let started = null;
  let rejected = null;
  for (let i = 0; i < 8; i++) {
    started = await postUpdate(secret, update);
    rejected = await postUpdate("not-the-secret", {
      update_id: update.update_id + 1,
      message: update.message
    });
    info = await tg(token, "getWebhookInfo");
    const freshError = info.last_error_message && info.last_error_date && info.last_error_date >= setAt;
    if (started.http === 200 && started.kind === "start" && rejected.http === 403 && info.ok && info.url === HOOK_URL && !freshError) break;
    await new Promise(function (r) { setTimeout(r, 8000); });
  }
  const report = {
    at: new Date().toISOString(),
    username: me.username,
    cabinet: KLIENT_CABINET_URL,
    secretPut: put.exit === 0,
    setWebhook: { http: hook.http, ok: hook.ok, description: hook.description },
    menu: { http: menu.http, ok: menu.ok, description: menu.description },
    getWebhookInfo: {
      http: info && info.http,
      ok: info && info.ok,
      url: info && info.url,
      pending_update_count: info && info.pending_update_count,
      last_error_message: info && info.last_error_message,
      last_error_date: info && info.last_error_date,
      allowed: info && info.allowed
    },
    start: started,
    rejected: { http: rejected && rejected.http }
  };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  say(report);
  const freshError = info && info.last_error_message && info.last_error_date && info.last_error_date >= setAt;
  const pass = hook.ok && info && info.ok && info.url === HOOK_URL && !freshError &&
    started && started.http === 200 && started.kind === "start" &&
    rejected && rejected.http === 403;
  if (!pass) process.exit(1);
}

main().catch(function (e) {
  say({ status: "error", message: redact(e && e.message ? e.message : e) });
  process.exit(1);
});
