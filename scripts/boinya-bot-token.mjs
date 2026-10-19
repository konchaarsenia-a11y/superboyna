// Put TELEGRAM_BOT_TOKEN on boinya-c, point webhook/menu at the existing Boinya URLs.
// Never prints the token. Does not send messages.
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec";
const MENU_URL = "https://konchaarsenia-a11y.github.io/superboyna/boinya-c/next.html?cutover=1";
const WANT_USER = "boyniaGB_bot";
const WORKER = "https://boinya-c.konchaarsenia.workers.dev";
const PROXY = join(dirname(fileURLToPath(import.meta.url)), "..", "boinya-c", "proxy");
const OUT = process.env.BOT_TOKEN_OUT || join(dirname(fileURLToPath(import.meta.url)), "..", "artifacts", "boinya-bot-token");
const TOKEN_RE = /bot\d{5,}:[A-Za-z0-9_-]+|\d{5,}:[A-Za-z0-9_-]{15,}/g;

function redact(value) {
  return String(value == null ? "" : value).replace(TOKEN_RE, "[REDACTED]");
}

function say(obj) {
  process.stdout.write(redact(typeof obj === "string" ? obj : JSON.stringify(obj)) + "\n");
}

function signInitData(token, fields) {
  const keys = Object.keys(fields).sort();
  const dcs = keys.map(function (k) { return k + "=" + fields[k]; }).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(dcs).digest("hex");
  const sp = new URLSearchParams();
  keys.forEach(function (k) { sp.append(k, fields[k]); });
  sp.append("hash", hash);
  return sp.toString();
}

function selfTest() {
  const sample = "https://api.telegram.org/bot123456789:AAHdummyTokenValue_xxxxxxxx/getMe";
  if (redact(sample).includes("123456789") || redact(sample).includes("AAHdummy")) {
    throw new Error("redact failed");
  }
  const token = "000000000:SELFTESTTOKEN_value_xxxxxxxx";
  const raw = signInitData(token, {
    auth_date: "1700000000",
    user: JSON.stringify({ id: 999000111, first_name: "tokencheck" })
  });
  const sp = new URLSearchParams(raw);
  const hash = sp.get("hash");
  const pairs = [];
  sp.forEach(function (v, k) { if (k !== "hash") pairs.push(k + "=" + v); });
  pairs.sort();
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const calc = crypto.createHmac("sha256", secret).update(pairs.join("\n")).digest("hex");
  if (calc !== hash) throw new Error("initData hmac mismatch");
  say({ selfTest: "ok" });
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

function putSecret(token) {
  return wrangler(["secret", "put", "TELEGRAM_BOT_TOKEN"], token);
}

function deployCurrent() {
  const deployed = wrangler(["deploy"]);
  const id = (deployed.text.match(/Current Version ID: ([^\s]+)/) || [])[1] || "";
  let promoted = { exit: 0, text: "no-version-id" };
  if (id) promoted = wrangler(["versions", "deploy", id + "@100", "-y", "--message", "bot token switch promote"]);
  return { deployed: deployed.exit, promoted: promoted.exit, tail: promoted.text || deployed.text };
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
    first_name: redact(result.first_name || ""),
    url: result.url || "",
    pending_update_count: result.pending_update_count == null ? null : result.pending_update_count,
    last_error_message: redact(result.last_error_message || ""),
    menu_type: result.type || (result.menu_button && result.menu_button.type) || "",
    menu_url: (result.web_app && result.web_app.url) || (result.menu_button && result.menu_button.web_app && result.menu_button.web_app.url) || "",
    commands: Array.isArray(json.result) ? json.result.map(function (c) { return c.command; }) : undefined
  };
}

async function workerGet(action) {
  const res = await fetch(WORKER + "/?action=" + action);
  return res.json();
}

async function workerAccess(initData) {
  const res = await fetch(WORKER + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getMyAccess", initData: initData })
  });
  const body = await res.json().catch(function () { return { status: "error", message: "non_json" }; });
  return {
    http: res.status,
    status: body.status || "",
    reason: body.reason || "",
    verified: body.verified === true,
    authVia: body.authVia || "",
    authRequired: body.authRequired === true,
    role: body.role || "",
    message: redact(body.message || "")
  };
}

async function main() {
  if (process.argv.indexOf("--self-test") >= 0) {
    selfTest();
    return;
  }
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    say({ status: "error", message: "no_token" });
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  let put = putSecret(token);
  let deploy = null;
  if (put.exit !== 0) {
    deploy = deployCurrent();
    put = putSecret(token);
  }
  if (put.exit !== 0) {
    say({ status: "error", message: "secret_put_failed", put: put.text, deploy: deploy });
    process.exit(1);
  }
  const hook = await tg(token, "setWebhook", {
    url: WEBHOOK_URL,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true
  });
  const menu = await tg(token, "setChatMenuButton", {
    menu_button: { type: "web_app", text: "Бойня", web_app: { url: MENU_URL } }
  });
  const commands = await tg(token, "setMyCommands", {
    commands: [{ command: "start", description: "Открыть Бойню" }]
  });
  const me = await tg(token, "getMe");
  const info = await tg(token, "getWebhookInfo");
  const menuNow = await tg(token, "getChatMenuButton");
  const cmds = await tg(token, "getMyCommands");
  let desktop = null;
  let access = null;
  let bad = null;
  const fields = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 999000111, first_name: "tokencheck" })
  };
  const goodInit = signInitData(token, fields);
  const badInit = goodInit.replace(/hash=[0-9a-f]+/, "hash=" + "0".repeat(64));
  for (let i = 0; i < 12; i++) {
    desktop = await workerGet("startDesktopAuth");
    access = await workerAccess(goodInit);
    bad = await workerAccess(badInit);
    const userOk = desktop && desktop.botUsername === WANT_USER;
    const hashOk = access && access.reason !== "bad_hash" && access.reason !== "no_bot_token" && (access.verified || access.authVia === "webapp" || access.authRequired !== true);
    const badOk = bad && bad.reason === "bad_hash";
    if (userOk && hashOk && badOk && me.ok && info.ok) break;
    await new Promise(function (r) { setTimeout(r, 10000); });
  }
  const report = {
    at: new Date().toISOString(),
    secretPut: put.exit === 0,
    deploy: deploy,
    wantUser: WANT_USER,
    getMe: { http: me.http, ok: me.ok, error_code: me.error_code, description: me.description, username: me.username, first_name: me.first_name },
    setWebhook: { http: hook.http, ok: hook.ok, error_code: hook.error_code, description: hook.description },
    getWebhookInfo: {
      http: info.http,
      ok: info.ok,
      error_code: info.error_code,
      description: info.description,
      url: info.url,
      pending_update_count: info.pending_update_count,
      last_error_message: info.last_error_message
    },
    setChatMenuButton: { http: menu.http, ok: menu.ok, error_code: menu.error_code, description: menu.description },
    menuNow: { type: menuNow.menu_type, url: menuNow.menu_url, ok: menuNow.ok, description: menuNow.description },
    setMyCommands: { http: commands.http, ok: commands.ok, error_code: commands.error_code, description: commands.description, commands: cmds.commands },
    workerGetMe: { status: desktop && desktop.status, message: desktop && desktop.message, botUsername: desktop && desktop.botUsername },
    initData: access,
    initDataRejected: bad
  };
  const safe = JSON.parse(redact(JSON.stringify(report)));
  writeFileSync(join(OUT, "report.json"), JSON.stringify(safe, null, 2));
  say(safe);
  const pass = me.ok && me.username === WANT_USER && info.ok && info.url === WEBHOOK_URL && !info.last_error_message &&
    hook.ok && menu.ok && commands.ok &&
    desktop && desktop.botUsername === WANT_USER &&
    access && access.reason !== "bad_hash" && access.reason !== "no_bot_token" &&
    (access.verified === true || access.authVia === "webapp") &&
    bad && bad.reason === "bad_hash";
  if (!pass) process.exit(1);
}

main().catch(function (e) {
  say({ status: "error", message: redact(e && e.message ? e.message : e) });
  process.exit(1);
});
