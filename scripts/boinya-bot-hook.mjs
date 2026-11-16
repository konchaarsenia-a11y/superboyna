// Point @boyniaGB_bot webhook at the worker. Does not send messages or flush reminders.
//
// hook-secret-stable-h1: секрет только при изменении (GH TELEGRAM_WEBHOOK_SECRET или
// probe уже ок → skip put). Не крутить random каждый run. Put не параллельно с
// deploy (ждёт очередь в workflow). Put fail → НЕ setWebhook новым секретом;
// если getWebhookInfo уже здоров → exit 0 (рабочий Worker не трогаем).
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_URL = "https://boinya-c.konchaarsenia.workers.dev/telegram/boinya";
const WANT_USER = "boyniaGB_bot";
const PROXY = join(dirname(fileURLToPath(import.meta.url)), "..", "boinya-c", "proxy");
const OUT = process.env.BOT_HOOK_OUT || join(dirname(fileURLToPath(import.meta.url)), "..", "artifacts", "boinya-bot-hook");
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
  // hook-secret-stable-h1: versions secret put — не валит live через classic secret put race
  return wrangler(
    ["versions", "secret", "put", "TELEGRAM_WEBHOOK_SECRET", "--message", "hook-secret-stable-h1"],
    secret
  );
}

async function tg(token, method, body) {
  const res = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(function () {
    return { ok: false, description: "non_json" };
  });
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
    kind: String(res.headers.get("X-Boinya-Kind") || ""),
    body: redact(await res.text()).slice(0, 80)
  };
}

function makeUpdate(setAt) {
  return {
    update_id: 800000000 + (Date.now() % 100000000),
    message: {
      message_id: 1,
      date: setAt,
      chat: { id: 999000111, type: "private" },
      from: { id: 999000111, is_bot: false, first_name: "tokencheck", username: "tokencheck" },
      text: "/start"
    }
  };
}

function infoHealthy(info) {
  return !!(info && info.ok && info.url === HOOK_URL && !info.last_error_message);
}

async function main() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    say({ status: "error", message: "no_token" });
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const me = await tg(token, "getMe");
  if (!me.ok || me.username !== WANT_USER) {
    say({
      status: "error",
      message: "unexpected_bot",
      username: me.username,
      http: me.http,
      description: me.description
    });
    process.exit(1);
  }

  const configured = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  const info0 = await tg(token, "getWebhookInfo");
  const setAt = Math.floor(Date.now() / 1000);
  const update = makeUpdate(setAt);

  let secret = configured;
  let secretPut = { exit: 0, skipped: true, reason: "" };
  let hook = { http: 0, ok: true, description: "skipped_setWebhook" };

  if (!secret) {
    secretPut = { exit: 0, skipped: true, reason: "no_configured_secret" };
    say({ status: "skip_put", message: "hook_secret_stable_no_env", getWebhookInfo: info0 });
    if (!infoHealthy(info0)) {
      say({ status: "error", message: "webhook_unhealthy_and_no_secret_to_fix", getWebhookInfo: info0 });
      process.exit(1);
    }
    const reportSkip = {
      at: new Date().toISOString(),
      username: me.username,
      marker: "hook-secret-stable-h1",
      secretPut,
      setWebhook: hook,
      getWebhookInfo: {
        http: info0.http,
        ok: info0.ok,
        url: info0.url,
        pending_update_count: info0.pending_update_count,
        last_error_message: info0.last_error_message,
        last_error_date: info0.last_error_date,
        allowed: info0.allowed
      },
      note: "RO verify only — Worker untouched"
    };
    writeFileSync(join(OUT, "report.json"), JSON.stringify(reportSkip, null, 2));
    say(reportSkip);
    process.exit(0);
  }

  const probe0 = await postUpdate(secret, update);
  if (probe0.http === 200 && (probe0.kind === "start" || probe0.kind === "dup")) {
    secretPut = { exit: 0, skipped: true, reason: "unchanged_probe_ok" };
    say({ status: "skip_put", message: "hook_secret_unchanged", probe: probe0 });
    if (info0.url !== HOOK_URL) {
      hook = await tg(token, "setWebhook", {
        url: HOOK_URL,
        secret_token: secret,
        allowed_updates: ["message", "edited_message", "callback_query", "my_chat_member"],
        drop_pending_updates: false
      });
    }
  } else {
    let put = { exit: 1, text: "" };
    for (let i = 1; i <= 5; i++) {
      put = putHookSecret(secret);
      put = { exit: put.exit, text: put.text.split(secret).join("[secret]") };
      if (put.exit === 0) break;
      say({ status: "retry", message: "hook_secret_put_retry", attempt: i, put: put.text.slice(-240) });
      spawnSync("sleep", [String(i * 4)], { encoding: "utf8" });
    }
    secretPut = Object.assign({ skipped: false, reason: "probe_needed_put" }, put);
    if (put.exit !== 0) {
      say({ status: "warn", message: "hook_secret_put_failed_worker_untouched", put: put.text });
      if (infoHealthy(info0)) {
        const reportFailSoft = {
          at: new Date().toISOString(),
          username: me.username,
          marker: "hook-secret-stable-h1",
          secretPut,
          setWebhook: { http: 0, ok: true, description: "skipped_after_put_fail" },
          getWebhookInfo: {
            http: info0.http,
            ok: info0.ok,
            url: info0.url,
            pending_update_count: info0.pending_update_count,
            last_error_message: info0.last_error_message,
            last_error_date: info0.last_error_date
          },
          note: "put failed; existing webhook healthy — Worker untouched"
        };
        writeFileSync(join(OUT, "report.json"), JSON.stringify(reportFailSoft, null, 2));
        say(reportFailSoft);
        process.exit(0);
      }
      say({ status: "error", message: "hook_secret_put_failed", put: put.text });
      process.exit(1);
    }
    hook = await tg(token, "setWebhook", {
      url: HOOK_URL,
      secret_token: secret,
      allowed_updates: ["message", "edited_message", "callback_query", "my_chat_member"],
      drop_pending_updates: true
    });
  }

  let info = null;
  let started = null;
  let rejected = null;
  for (let i = 0; i < 8; i++) {
    const probe = await postUpdate(secret, update);
    if (!started || (started.kind !== "start" && started.kind !== "dup")) started = probe;
    rejected = await postUpdate("not-the-secret", {
      update_id: update.update_id + 1,
      message: update.message
    });
    info = await tg(token, "getWebhookInfo");
    const freshError =
      info.last_error_message && info.last_error_date && info.last_error_date >= setAt;
    if (
      started.http === 200 &&
      (started.kind === "start" || started.kind === "dup") &&
      rejected.http === 403 &&
      info.ok &&
      info.url === HOOK_URL &&
      !freshError
    ) {
      break;
    }
    await new Promise(function (r) {
      setTimeout(r, 8000);
    });
  }
  const dup = await postUpdate(secret, update);
  const report = {
    at: new Date().toISOString(),
    username: me.username,
    marker: "hook-secret-stable-h1",
    secretPut,
    setWebhook: { http: hook.http, ok: hook.ok, description: hook.description },
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
    rejected: { http: rejected && rejected.http },
    duplicate: { http: dup.http, kind: dup.kind }
  };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  say(report);
  const freshError =
    info && info.last_error_message && info.last_error_date && info.last_error_date >= setAt;
  const pass =
    hook.ok &&
    info &&
    info.ok &&
    info.url === HOOK_URL &&
    !freshError &&
    started &&
    started.http === 200 &&
    (started.kind === "start" || started.kind === "dup") &&
    rejected &&
    rejected.http === 403;
  if (!pass) process.exit(1);
}

main().catch(function (e) {
  say({ status: "error", message: redact(e && e.message ? e.message : e) });
  process.exit(1);
});
