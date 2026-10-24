/** Общий чат «снабжение gb» выключен. Код чата остаётся. Включить снова: NOTIFY_GROUP_CHAT=on. */

export function notifyGroupChatOn_(env) {
  const v = String((env && env.NOTIFY_GROUP_CHAT) || "").trim().toLowerCase();
  return v === "1" || v === "on" || v === "true" || v === "yes";
}

export function notifyDedupeIds_(ids) {
  const out = [];
  const seen = Object.create(null);
  const list = Array.isArray(ids) ? ids : [];
  for (let i = 0; i < list.length; i++) {
    const s = String(list[i] == null ? "" : list[i]).trim();
    if (!s || seen[s]) continue;
    seen[s] = true;
    out.push(s);
  }
  return out;
}

const NOTIFY_KEYS = [
  "wh_buy", "cut_deficit", "out_next", "cut_increase", "date_nudge",
  "missed_delivery", "week_done", "access_req", "survey",
  "partner_order", "partner_suggest", "partner_access_request", "gb_lead"
];

const ROLE_DEFAULTS = {
  owner: NOTIFY_KEYS.slice(),
  manager: ["wh_buy", "date_nudge", "missed_delivery", "week_done", "survey"],
  cutter: ["cut_deficit", "out_next", "cut_increase"],
  logistics: ["wh_buy", "cut_deficit", "out_next"],
  courier: [],
  all: ["wh_buy", "date_nudge", "missed_delivery", "week_done", "survey", "cut_deficit", "out_next", "cut_increase"]
};

/** Ключи, которые раньше дублировались в общий чат. Опрос — только личному ответственному. */
export const NOTIFY_GROUP_KEYS = [
  "cut_deficit", "out_next", "cut_increase", "date_nudge", "week_done", "access_req",
  "partner_order", "partner_suggest", "partner_access_request", "gb_lead"
];

const HUB_KEYS = ["partner_order", "partner_suggest", "partner_access_request"];

function parseOverride_(raw) {
  const plus = Object.create(null);
  const minus = Object.create(null);
  String(raw == null ? "" : raw).trim().split(/[,;\s]+/).forEach(function (part) {
    let t = String(part || "").trim();
    if (!t) return;
    let sign = "+";
    if (t.charAt(0) === "+" || t.charAt(0) === "-") {
      sign = t.charAt(0);
      t = t.slice(1);
    }
    t = t.toLowerCase();
    if (NOTIFY_KEYS.indexOf(t) < 0) return;
    if (sign === "-") {
      minus[t] = true;
      delete plus[t];
    } else {
      plus[t] = true;
      delete minus[t];
    }
  });
  return { plus: plus, minus: minus };
}

function effectiveKeys_(role, override) {
  const base = (ROLE_DEFAULTS[role] || []).slice();
  const o = parseOverride_(override);
  return NOTIFY_KEYS.filter(function (k) {
    let on = base.indexOf(k) >= 0;
    if (o.plus[k]) on = true;
    if (o.minus[k]) on = false;
    return on;
  });
}

function personLabel_(p) {
  const name = String((p && p.name) || "").trim();
  const user = String((p && p.username) || "").replace(/^@/, "").trim();
  if (name && user) return name + " (@" + user + ")";
  if (name) return name;
  if (user) return "@" + user;
  return "без имени";
}

/**
 * Кто получит личку вместо общего чата и кто ещё не нажимал Start.
 * Имена без telegram id.
 */
export function notifyDmRoster_(input) {
  input = input || {};
  const owners = (input.ownerIds || ["650923866"]).map(function (id) { return String(id || "").trim(); }).filter(Boolean);
  const started = input.started || {};
  const hub = (input.hubIds || []).map(function (id) { return String(id || "").trim(); }).filter(Boolean);
  const byId = Object.create(null);
  (input.people || []).forEach(function (p) {
    p = p || {};
    const tid = String(p.telegramId || "").trim();
    if (!tid) return;
    let role = String(p.role || "").toLowerCase();
    const st = String(p.status || "").toLowerCase();
    if (owners.indexOf(tid) >= 0) role = "owner";
    const active = owners.indexOf(tid) >= 0 ||
      (!!role && !/^(pending|denied|none)$/.test(role) && !/^(pending|denied)$/.test(st));
    byId[tid] = {
      active: active,
      role: role,
      notify: p.notify || "",
      name: p.name || "",
      username: p.username || ""
    };
  });
  owners.forEach(function (id) {
    if (!byId[id]) byId[id] = { active: true, role: "owner", notify: "", name: "", username: "" };
  });
  const seenName = Object.create(null);
  const startedRows = [];
  const missingRows = [];
  function push(tid, row) {
    const key = row.name + "|" + row.role;
    if (seenName[key]) return;
    seenName[key] = true;
    if (started[tid]) startedRows.push(row);
    else missingRows.push(row);
  }
  Object.keys(byId).forEach(function (tid) {
    const h = byId[tid];
    if (!h.active) return;
    const keys = effectiveKeys_(h.role, h.notify);
    const o = parseOverride_(h.notify);
    let hit = NOTIFY_GROUP_KEYS.some(function (k) { return keys.indexOf(k) >= 0; });
    if (!hit && hub.indexOf(tid) >= 0) {
      hit = HUB_KEYS.some(function (k) { return !o.minus[k]; });
    }
    if (!hit) return;
    push(tid, { name: personLabel_(h), role: h.role || "none" });
  });
  hub.forEach(function (tid) {
    if (byId[tid]) return;
    push(tid, { name: "без имени", role: "hub" });
  });
  function byName(a, b) { return a.name.localeCompare(b.name, "ru"); }
  startedRows.sort(byName);
  missingRows.sort(byName);
  return { started: startedRows, missing: missingRows };
}
