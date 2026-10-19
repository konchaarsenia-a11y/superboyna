// Read-only: Telegram getMe/getWebhookInfo + D1 notify counters + Worker logs.
// Never prints a bot token. Does not send messages.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TOKEN_RE = /bot\d{5,}:[A-Za-z0-9_-]+|\d{5,}:[A-Za-z0-9_-]{15,}/g;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROXY = join(ROOT, "boinya-c", "proxy");
const OUT = process.env.BOT_DIAG_OUT || join(ROOT, "artifacts", "bot-ban-diag");

function redact(value) {
  return String(value == null ? "" : value).replace(TOKEN_RE, "[REDACTED]");
}

function say(obj) {
  const line = redact(typeof obj === "string" ? obj : JSON.stringify(obj));
  process.stdout.write(line + "\n");
}

function selfTest() {
  const sample = "err https://api.telegram.org/bot123456789:AAHdummyTokenValue_xxxxxxxx/getMe 401";
  const out = redact(sample);
  if (out.includes("123456789") || out.includes("AAHdummy")) {
    throw new Error("redact failed");
  }
  if (!out.includes("[REDACTED]") || !out.includes("401")) throw new Error("redact dropped context");
  say({ selfTest: "ok" });
}

function tokenSources() {
  const src = [];
  function add(label, raw) {
    const token = String(raw || "").trim();
    if (!token) {
      src.push({ label: label, present: false });
      return;
    }
    src.push({ label: label, present: true, token: token, fingerprint: token.length + ":" + token.slice(0, 0) });
  }
  add("TELEGRAM_BOT_TOKEN", process.env.TELEGRAM_BOT_TOKEN);
  add("BOINYA_BOT_TOKEN", process.env.BOINYA_BOT_TOKEN);
  add("TELEGRAM_TOKEN", process.env.TELEGRAM_TOKEN);
  const extra = String(process.env.TG_EXTRA_BOT_TOKENS || "");
  if (!extra.trim()) src.push({ label: "TG_EXTRA_BOT_TOKENS", present: false });
  else {
    extra.split(",").forEach(function (part, i) {
      add("TG_EXTRA_BOT_TOKENS#" + i, part);
    });
  }
  add("PARTNER_BOT_TOKEN", process.env.PARTNER_BOT_TOKEN);
  return src;
}

async function telegramCall(token, method) {
  const res = await fetch("https://api.telegram.org/bot" + token + "/" + method);
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch (e) {
    body = { ok: false, description: "non_json_http_" + res.status };
  }
  const result = body && body.result && typeof body.result === "object" ? body.result : {};
  const url = String(result.url || "");
  let host = "";
  try {
    host = url ? new URL(url).host : "";
  } catch (eUrl) {
    host = url ? "set" : "";
  }
  return {
    http: res.status,
    ok: body.ok === true,
    error_code: body.error_code == null ? null : body.error_code,
    description: redact(body.description || ""),
    username: result.username || "",
    first_name: redact(result.first_name || ""),
    bot_id: result.id || null,
    webhook_set: !!url,
    webhook_host: host,
    pending_update_count: result.pending_update_count == null ? null : result.pending_update_count,
    last_error_date: result.last_error_date || null,
    last_error_message: redact(result.last_error_message || ""),
    max_connections: result.max_connections == null ? null : result.max_connections
  };
}

function rowsOf(raw) {
  const text = String(raw || "").replace(/^\uFEFF/, "");
  const start = text.search(/[\[{]/);
  if (start < 0) return { rows: [], error: redact(text).slice(0, 400) };
  let data;
  try {
    data = JSON.parse(start > 0 ? text.slice(start) : text);
  } catch (e) {
    return { rows: [], error: redact(e.message || e) };
  }
  const blocks = Array.isArray(data) ? data : [data];
  const rows = [];
  blocks.forEach(function (b) {
    if (b && Array.isArray(b.results)) rows.push.apply(rows, b.results);
  });
  return { rows: rows };
}

function d1(sql) {
  const run = spawnSync(
    "npx",
    ["--yes", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: PROXY, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: process.env }
  );
  const parsed = rowsOf(run.stdout || "");
  return {
    exit: run.status,
    rows: parsed.rows,
    error: parsed.error || redact((run.stderr || "").slice(0, 500))
  };
}

function staffIds(accessPayload) {
  const ids = {};
  const people = (accessPayload && accessPayload.people) || [];
  people.forEach(function (p) {
    const id = String((p && p.telegramId) || "").trim();
    if (id) ids[id] = String((p && p.role) || "");
  });
  return ids;
}

function summarizeDeferred(payload, staff) {
  const items = (payload && payload.items) || [];
  const since = Date.parse("2026-10-16T00:00:00Z");
  const now = Date.now();
  let open = 0;
  let fail = 0;
  let maxFail = 0;
  let sendError = 0;
  let sentMarked = 0;
  let recentTouch = 0;
  let dueNow = 0;
  let dueFuture = 0;
  let silent = 0;
  const modes = {};
  const recipients = {};
  let outside = 0;
  items.forEach(function (item) {
    const st = String((item && item.status) || "").toLowerCase();
    const payloadItem = item && item.payload && typeof item.payload === "object" ? item.payload : {};
    const mode = String(payloadItem.mode || item.mode || item.kind || "").slice(0, 24) || "none";
    modes[mode] = (modes[mode] || 0) + 1;
    if (st !== "open") return;
    open++;
    const fails = Number(payloadItem.remindFailCount) || 0;
    if (fails > 0) fail++;
    if (fails > maxFail) maxFail = fails;
    if (payloadItem.remindSendError) sendError++;
    if (payloadItem.remindSent || item.remindSent) sentMarked++;
    const silentOn = payloadItem.remindSilent === true || payloadItem.remindSilent === "1" || payloadItem.remindSilent === 1;
    if (silentOn) silent++;
    const due = Number(payloadItem.remindAtMs || item.remindAtMs || Date.parse(payloadItem.remindAt || item.remindAt || "")) || 0;
    if (due && due <= now && !silentOn) dueNow++;
    if (due && due > now) dueFuture++;
    const stamp = Date.parse(payloadItem.remindSentAt || item.updatedAt || item.createdAt || "") || 0;
    if (stamp >= since) recentTouch++;
    const to = String(
      payloadItem.targetTelegramId || payloadItem.forTelegramId || item.targetTelegramId || item.telegramId || ""
    ).trim();
    if (!to) return;
    recipients[to] = (recipients[to] || 0) + 1;
    if (!staff[to]) outside++;
  });
  return {
    items: items.length,
    open: open,
    dueNow: dueNow,
    dueFuture: dueFuture,
    silentOpen: silent,
    withFailCount: fail,
    maxFail: maxFail,
    sendError: sendError,
    sentMarkedOpen: sentMarked,
    openTouchedSinceOct16: recentTouch,
    modes: modes,
    distinctRecipients: Object.keys(recipients).length,
    openRecipientsOutsideAccess: outside
  };
}

function summarizeDeficit(payload) {
  const items = (payload && payload.items) || [];
  let open = 0;
  let notifiedSince = 0;
  const since = Date.parse("2026-10-16T00:00:00Z");
  items.forEach(function (row) {
    const st = String((row && row.status) || "").toLowerCase();
    if (st !== "open" && st !== "открыт") return;
    open++;
    const last = Date.parse(row.lastNotify || "") || 0;
    if (last >= since) notifiedSince++;
  });
  return { items: items.length, open: open, notifiedSinceOct16: notifiedSince };
}

function summarizeSurvey(payload) {
  const items = (payload && payload.items) || [];
  const by = {};
  items.forEach(function (row) {
    const st = String((row && row.status) || "empty").toLowerCase() || "empty";
    by[st] = (by[st] || 0) + 1;
  });
  return { items: items.length, byStatus: by };
}

function countRemindKeys(payload, staff) {
  if (!payload || typeof payload !== "object") return { keys: 0, recipients: 0, outside: 0 };
  const map = payload.map && typeof payload.map === "object" ? payload.map : payload;
  const keys = Object.keys(map).filter(function (k) {
    return k !== "map" && k !== "day" && k !== "_savedAt";
  });
  const ids = {};
  let outside = 0;
  keys.forEach(function (k) {
    const id = String(k.split("|").pop() || "").trim();
    if (!/^\d{5,}$/.test(id)) return;
    ids[id] = true;
    if (staff && !staff[id]) outside++;
  });
  return { keys: keys.length, recipients: Object.keys(ids).length, outside: outside };
}

function snapPayload(cacheKey) {
  const q = d1("SELECT payload, updated_at FROM snap_cache WHERE cache_key = '" + cacheKey.replace(/'/g, "") + "'");
  if (!q.rows.length || !q.rows[0].payload) return { updated_at: q.rows[0] && q.rows[0].updated_at, payload: null, error: q.error, exit: q.exit };
  try {
    return { updated_at: q.rows[0].updated_at, payload: JSON.parse(q.rows[0].payload), exit: q.exit };
  } catch (e) {
    return { updated_at: q.rows[0].updated_at, payload: null, error: "bad_json", exit: q.exit };
  }
}

function secretNames() {
  const run = spawnSync("npx", ["--yes", "wrangler@4", "secret", "list"], {
    cwd: PROXY,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    env: process.env
  });
  const text = redact((run.stdout || "") + "\n" + (run.stderr || ""));
  const names = [];
  text.split(/\r?\n/).forEach(function (line) {
    const m = line.match(/\b([A-Z][A-Z0-9_]{3,})\b/);
    if (m && /TOKEN|SECRET|PIN|KEY/.test(m[1])) names.push(m[1]);
  });
  let parsed = null;
  try {
    const start = (run.stdout || "").search(/[\[{]/);
    if (start >= 0) parsed = JSON.parse(run.stdout.slice(start));
  } catch (e) {}
  if (Array.isArray(parsed)) {
    parsed.forEach(function (row) {
      const name = row && (row.name || row.key);
      if (name) names.push(String(name));
    });
  }
  return { exit: run.status, names: Array.from(new Set(names)), note: text.slice(0, 300) };
}

function pickLog(event) {
  const workers = event && (event["$workers"] || event.workers) || {};
  const source = event && event.source;
  let message = "";
  if (typeof source === "string") message = source;
  else if (source && typeof source === "object") message = source.message || JSON.stringify(source).slice(0, 300);
  message = redact(message).slice(0, 240);
  message = message.replace(/https:\/\/api\.telegram\.org\/bot\[REDACTED\]\/([A-Za-z]+)/g, "tg:$1");
  const ts = event && (event.timestamp || event.datetime) || null;
  return {
    ts: ts,
    iso: ts ? new Date(Number(ts)).toISOString() : "",
    eventType: workers.eventType || "",
    outcome: workers.outcome || "",
    script: workers.scriptName || "",
    message: message
  };
}

function windows(event, needle) {
  const s = redact(JSON.stringify(event));
  const low = s.toLowerCase();
  const n = String(needle || "").toLowerCase();
  const out = [];
  let i = 0;
  while (out.length < 2) {
    const at = low.indexOf(n, i);
    if (at < 0) break;
    out.push(s.slice(Math.max(0, at - 50), at + n.length + 50));
    i = at + n.length;
  }
  return out;
}

async function cloudflareAccounts() {
  const token = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
  if (!token) return [];
  const res = await fetch("https://api.cloudflare.com/client/v4/accounts?per_page=20", {
    headers: { Authorization: "Bearer " + token }
  });
  const json = await res.json().catch(function () { return {}; });
  return (json.result || []).map(function (a) {
    return { id: a.id, name: a.name };
  });
}

async function workerSettings(accountId) {
  const token = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
  if (!token || !accountId) return { skipped: "no_account" };
  const res = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/workers/scripts/boinya-c/settings",
    { headers: { Authorization: "Bearer " + token } }
  );
  const json = await res.json().catch(function () { return {}; });
  const bindings = ((json.result || {}).bindings) || [];
  const safe = bindings.map(function (b) {
    const type = String(b.type || "");
    const name = String(b.name || "");
    if (type === "secret_text") return { name: name, type: type };
    if (name === "TELEGRAM_BOT_USERNAME" || name === "GOALS_TG_NOTIFY" || name === "NOTIFY_CHAT_ENABLED" || name === "WEEK_CLOSE_CANON") {
      return { name: name, type: type, text: redact(b.text || "") };
    }
    if (/CHAT|TOKEN|SECRET|PIN|KEY|PASSWORD/i.test(name)) return { name: name, type: type, set: !!(b.text || b.value) };
    return { name: name, type: type };
  });
  return {
    http: res.status,
    success: json.success === true,
    errors: (json.errors || []).map(function (e) { return redact(e.message || ""); }).slice(0, 3),
    bindings: safe
  };
}

async function cfQuery(body) {
  const account = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
  if (!account || !token) return { skipped: "no_cloudflare_env" };
  const res = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/" + account + "/workers/observability/telemetry/query",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { http: res.status, error: "non_json", snippet: redact(text).slice(0, 300) };
  }
  const err = (json.errors || []).map(function (e) {
    return redact(e.message || JSON.stringify(e)).slice(0, 240);
  });
  const eventsNode = (json.result || {}).events;
  const events = Array.isArray(eventsNode) ? eventsNode : (eventsNode && eventsNode.events) || [];
  const needle = body && body.parameters && body.parameters.needle && body.parameters.needle.value;
  return {
    http: res.status,
    success: json.success === true,
    errors: err,
    resultKeys: Object.keys(json.result || {}).slice(0, 12),
    eventCount: eventsNode && eventsNode.count != null ? eventsNode.count : events.length,
    sample: events.slice(0, 5).map(pickLog),
    windows: needle ? events.slice(0, 2).map(function (ev) { return windows(ev, needle); }) : []
  };
}

async function logsSince(fromMs, toMs) {
  const base = {
    queryId: "bot-ban-diag",
    view: "events",
    limit: 20,
    dry: true,
    timeframe: { from: fromMs, to: toMs },
    parameters: {
      datasets: ["cloudflare-workers"],
      filters: [
        { key: "$workers.scriptName", operation: "eq", type: "string", value: "boinya-c" }
      ]
    }
  };
  const needles = ["429", "api.telegram.org", "sendMessage", "Unauthorized"];
  const out = {};
  for (let i = 0; i < needles.length; i++) {
    const body = JSON.parse(JSON.stringify(base));
    delete body.dry;
    body.parameters.needle = { value: needles[i], matchCase: false, isRegex: false };
    out[needles[i]] = await cfQuery(body);
  }
  const first = out["429"] || {};
  if ((first.errors && first.errors.length) || first.skipped) {
    const sec = JSON.parse(JSON.stringify(base));
    delete sec.dry;
    sec.timeframe = { from: Math.floor(fromMs / 1000), to: Math.floor(toMs / 1000) };
    sec.parameters.needle = { value: "Unauthorized", matchCase: false, isRegex: false };
    out.unauthorized_seconds = await cfQuery(sec);
    const alt = JSON.parse(JSON.stringify(sec));
    alt.view = "events";
    alt.parameters.filters = [
      { kind: "filter", key: "$workers.scriptName", operation: "eq", type: "string", value: "boinya-c" }
    ];
    out.unauthorized_filter_kind = await cfQuery(alt);
  }
  return out;
}

async function main() {
  if (process.argv.indexOf("--self-test") >= 0) {
    selfTest();
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const sources = tokenSources();
  const api = [];
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    if (!src.present) {
      api.push({ label: src.label, present: false });
      continue;
    }
    const me = await telegramCall(src.token, "getMe");
    const hook = await telegramCall(src.token, "getWebhookInfo");
    api.push({
      label: src.label,
      present: true,
      token_len: src.token.length,
      getMe: {
        http: me.http,
        ok: me.ok,
        error_code: me.error_code,
        description: me.description,
        username: me.username,
        first_name: me.first_name,
        bot_id: me.bot_id
      },
      getWebhookInfo: {
        http: hook.http,
        ok: hook.ok,
        error_code: hook.error_code,
        description: hook.description,
        webhook_set: hook.webhook_set,
        webhook_host: hook.webhook_host,
        pending_update_count: hook.pending_update_count,
        last_error_date: hook.last_error_date,
        last_error_message: hook.last_error_message
      }
    });
  }

  const meta = d1(
    "SELECT key, value, updated_at FROM meta WHERE key IN ('notify_cron_live','notify_cron_cutoff_ms') OR key GLOB 'DATE_NUDGE_2026-10-1*' ORDER BY updated_at DESC LIMIT 40"
  );
  const snaps = d1(
    "SELECT cache_key, updated_at, length(payload) AS n FROM snap_cache WHERE cache_key GLOB 'bp_survey_remind_2026-10-1*' OR cache_key IN ('listDeferred','listDeficit','listSurvey','notify_overdue_deferred','listAccess') ORDER BY updated_at DESC LIMIT 40"
  );
  const access = snapPayload("listAccess");
  const staff = staffIds(access.payload);
  const roleHist = {};
  Object.keys(staff).forEach(function (id) {
    const role = staff[id] || "empty";
    roleHist[role] = (roleHist[role] || 0) + 1;
  });
  const deferred = snapPayload("listDeferred");
  const deficit = snapPayload("listDeficit");
  const survey = snapPayload("listSurvey");
  const remind = {};
  (snaps.rows || []).forEach(function (row) {
    const key = String(row.cache_key || "");
    if (key.indexOf("bp_survey_remind_") !== 0) return;
    const one = snapPayload(key);
    remind[key] = Object.assign({ updated_at: row.updated_at, n: row.n }, countRemindKeys(one.payload, staff));
  });

  const accounts = await cloudflareAccounts();
  if (!process.env.CLOUDFLARE_ACCOUNT_ID && accounts.length === 1) {
    process.env.CLOUDFLARE_ACCOUNT_ID = accounts[0].id;
  }
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const settings = await workerSettings(accountId);
  const fromMs = Date.parse("2026-10-16T00:00:00Z");
  const toMs = Date.now();
  const report = {
    at: new Date().toISOString(),
    publicStartDesktopAuth: "no_bot_username",
    pingHasTelegramToken: true,
    api: api,
    accounts: accounts.map(function (a) { return { name: a.name, id_tail: String(a.id || "").slice(-6) }; }),
    workerSettings: settings,
    workerSecrets: secretNames(),
    meta: { exit: meta.exit, error: meta.error, rows: (meta.rows || []).map(function (r) {
      return { key: r.key, value: redact(r.value).slice(0, 40), updated_at: r.updated_at };
    }) },
    snaps: { exit: snaps.exit, error: snaps.error, rows: snaps.rows || [] },
    access: { people: Object.keys(staff).length, roles: roleHist, updated_at: access.updated_at || null },
    deferred: Object.assign({ updated_at: deferred.updated_at || null, error: deferred.error || "" }, summarizeDeferred(deferred.payload, staff)),
    deficit: Object.assign({ updated_at: deficit.updated_at || null }, summarizeDeficit(deficit.payload)),
    survey: Object.assign({ updated_at: survey.updated_at || null }, summarizeSurvey(survey.payload)),
    surveyRemind: remind,
    logs: await logsSince(fromMs, toMs)
  };
  const safe = JSON.parse(redact(JSON.stringify(report)));
  writeFileSync(join(OUT, "report.json"), JSON.stringify(safe, null, 2));
  say(safe);
}

main().catch(function (e) {
  say({ status: "error", message: redact(e && e.message ? e.message : e) });
  process.exit(1);
});
