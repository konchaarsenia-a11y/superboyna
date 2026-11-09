/**
 * #19 / #23: заказы правятся UPDATE той же строки, не delete+create.
 * PK составной (день|CAL + match + дата) — после смены ника id может
 * ещё содержать старый фрагмент; match_key/client/client_id — актуальные.
 */

function normalizeMatchKeyCanon_(raw) {
  return String(raw || "")
    .replace(/@/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е");
}

function orderDateIsoCanon_(row) {
  const s = String((row && (row.date_iso || row.dateIso || row.date)) || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function orderDayCanon_(row) {
  return String((row && (row.day_name || row.day)) || "").trim();
}

function orderSegCanon_(row) {
  return String((row && (row.segment || row.orderType || "")) || "")
    .trim()
    .toUpperCase();
}

function retailSegCanon_(seg) {
  const s = String(seg || "").toUpperCase();
  return s === "Р" || s === "RETAIL" || s.indexOf("РОЗН") >= 0;
}

function segsCompatibleCanon_(a, b) {
  const sa = String(a || "").toUpperCase();
  const sb = String(b || "").toUpperCase();
  if (!sa || !sb) return true;
  if (sa === sb) return true;
  if (retailSegCanon_(sa) && retailSegCanon_(sb)) return true;
  return false;
}

function sameSlotCanon_(row, day, dateIso) {
  const di = orderDateIsoCanon_(row);
  const dn = orderDayCanon_(row);
  if (dateIso && di) return di === dateIso;
  if (day && dn) return dn === day;
  if (dateIso && !di && day && dn) return dn === day;
  return false;
}

/**
 * #19 план смены ника: оставить keepId, обновить match_key, не soft-delete цели.
 * @returns {{rename:boolean, keepId:string, newMatchKey:string, fromMatchKey:string, softDeleteIds:string[]}}
 */
export function planOrderNickRenameKeep_(rows, opts) {
  opts = opts || {};
  const editClient = String(opts.editClient || "").trim();
  const client = String(opts.client || "").trim();
  const fromMatchKey = normalizeMatchKeyCanon_(opts.editMatchKey || editClient);
  const newMatchKey = normalizeMatchKeyCanon_(client);
  const day = String(opts.day || opts.oldDay || "").trim();
  const dateIso = String(opts.dateIso || opts.oldDate || "").trim().slice(0, 10);
  const seg = String(opts.segment || "").trim().toUpperCase();
  if (!editClient || !client || editClient.toLowerCase() === client.toLowerCase()) {
    return { rename: false, keepId: "", newMatchKey: newMatchKey, fromMatchKey: fromMatchKey, softDeleteIds: [] };
  }
  const editLow = editClient.toLowerCase();
  const candidates = (rows || []).filter(function (r) {
    if (!r || String(r.status || "active") === "deleted") return false;
    const mk = normalizeMatchKeyCanon_(r.match_key || r.matchKey || "");
    const cl = String(r.client || "").trim().toLowerCase();
    if (!(mk === fromMatchKey || cl === editLow)) return false;
    if (!sameSlotCanon_(r, day, dateIso) && (day || dateIso)) return false;
    if (seg && !segsCompatibleCanon_(orderSegCanon_(r), seg)) return false;
    return true;
  });
  let keepId = candidates.length ? String(candidates[0].id) : "";
  const softDeleteIds = [];
  (rows || []).forEach(function (r) {
    if (!r || !keepId || String(r.id) === keepId) return;
    if (String(r.status || "active") === "deleted") return;
    if (!sameSlotCanon_(r, day, dateIso) && (day || dateIso)) return;
    const mk = normalizeMatchKeyCanon_(r.match_key || r.matchKey || "");
    const cl = String(r.client || "").trim().toLowerCase();
    if (mk === fromMatchKey || cl === editLow || mk === newMatchKey || cl === client.toLowerCase()) {
      softDeleteIds.push(String(r.id));
    }
  });
  return {
    rename: true,
    keepId: keepId,
    newMatchKey: newMatchKey,
    fromMatchKey: fromMatchKey,
    softDeleteIds: softDeleteIds
  };
}

/**
 * #23 план переноса: тот же rowId → новый составной id (дата/день в PK).
 * Источник не soft-delete; clash — чужой id на цели.
 */
export function planOrderMoveInPlace_(row, opts) {
  opts = opts || {};
  if (!row || !row.id) {
    return { ok: false, message: "no_row", sourceId: "", targetId: "", softDeleteClashIds: [] };
  }
  const matchKey = normalizeMatchKeyCanon_(opts.matchKey || row.match_key || row.matchKey || row.client);
  const newDay = String(opts.newDay || "").trim();
  const newDate = String(opts.newDate || "").trim().slice(0, 10);
  let targetId = "";
  let dateIso = "";
  let dayName = "";
  if (newDay) {
    dayName = newDay;
    dateIso = newDate || orderDateIsoCanon_(row) || "";
    targetId = newDay + ":" + matchKey;
  } else if (newDate) {
    dayName = "";
    dateIso = newDate;
    targetId = "CAL:" + matchKey + ":" + newDate;
  } else {
    return { ok: false, message: "no_target", sourceId: String(row.id), targetId: "", softDeleteClashIds: [] };
  }
  const clash = [];
  // t502: deleted occupant on target PK still blocks SQLite UPDATE id=
  const hardClearClashIds = [];
  (opts.occupants || []).forEach(function (o) {
    if (!o || !o.id) return;
    if (String(o.id) === String(row.id)) return;
    if (String(o.id) !== targetId) return;
    if (String(o.status || "active") === "deleted") hardClearClashIds.push(String(o.id));
    else clash.push(String(o.id));
  });
  return {
    ok: true,
    sourceId: String(row.id),
    targetId: targetId,
    dateIso: dateIso,
    dayName: dayName,
    matchKey: matchKey,
    softDeleteClashIds: clash,
    hardClearClashIds: hardClearClashIds,
    sameRow: true
  };
}

/** t502: twin scan must include destination day, not only fromDays. */
export function moveTwinScanDays_(fromDays, newDay) {
  const days = [];
  (fromDays || []).forEach(function (d) {
    d = String(d || "").trim();
    if (d && days.indexOf(d) < 0) days.push(d);
  });
  const nd = String(newDay || "").trim();
  if (nd && days.indexOf(nd) < 0) days.push(nd);
  return days;
}

/** t502: twin scan must include newDate/moveIso after keep-PK recolor. */
export function moveTwinScanDates_(oldDate, rowDateIso, newDate, moveIso) {
  const dates = [];
  function add(d) {
    d = String(d || "").trim();
    if (!d) return;
    if (dates.indexOf(d) < 0) dates.push(d);
  }
  add(oldDate);
  add(rowDateIso);
  add(newDate);
  add(moveIso);
  return dates;
}

/**
 * t502: after keep-PK fallback + canonical upsert, retire the old source id.
 * In-memory sourceId stays old even when SQL rename succeeded (no-op delete).
 */
export function moveShouldRetireKeepPkSource_(sourceId, canonId) {
  const src = String(sourceId || "").trim();
  const canon = String(canonId || "").trim();
  return !!(src && canon && src !== canon);
}

export function orderNickRenameIsInPlace_(plan) {
  return !!(plan && plan.rename && plan.keepId && (plan.softDeleteIds || []).indexOf(plan.keepId) < 0);
}

export function orderMoveIsInPlace_(plan) {
  return !!(plan && plan.ok && plan.sameRow && plan.sourceId && plan.targetId);
}

/**
 * #19 clients: смена ника — тот же clients.id, UPDATE match_key/nick.
 * Ищем старую строку по order.client_id, aliases(edit) и nick;
 * не создаём c_* дубль на новый match_key.
 * @returns {{rename:boolean, keepId:string, newMatchKey:string, fromKeys:string[], dropIds:string[]}}
 */
export function planClientNickRenameKeep_(clients, opts) {
  opts = opts || {};
  const editClient = String(opts.editClient || "").trim();
  const client = String(opts.client || "").trim();
  const newMatchKey = normalizeMatchKeyCanon_(opts.newMatchKey || client);
  const orderClientId = String(opts.orderClientId || opts.clientId || "").trim();
  const fromKeys = [];
  function addKey_(k) {
    k = String(k || "").trim();
    if (!k) return;
    if (fromKeys.indexOf(k) < 0) fromKeys.push(k);
    const stripped = k.replace(/[._@]/g, "");
    if (stripped && fromKeys.indexOf(stripped) < 0) fromKeys.push(stripped);
  }
  addKey_(opts.editMatchKey);
  addKey_(normalizeMatchKeyCanon_(editClient));
  (opts.editAliases || []).forEach(addKey_);
  if (!editClient || !client || editClient.toLowerCase() === client.toLowerCase()) {
    return {
      rename: false,
      keepId: orderClientId || "",
      newMatchKey: newMatchKey,
      fromKeys: fromKeys,
      dropIds: []
    };
  }
  const rows = clients || [];
  let keepId = "";
  if (orderClientId) {
    const byId = rows.find(function (r) {
      return r && String(r.id) === orderClientId;
    });
    if (byId) keepId = String(byId.id);
  }
  const editLow = editClient.toLowerCase();
  if (!keepId) {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r.id) continue;
      const mk = String(r.match_key || r.matchKey || "").trim();
      const nick = String(r.nick || r.client || "").trim().toLowerCase();
      if (fromKeys.indexOf(mk) >= 0 || nick === editLow) {
        keepId = String(r.id);
        break;
      }
    }
  }
  const dropIds = [];
  rows.forEach(function (r) {
    if (!r || !r.id) return;
    const id = String(r.id);
    if (keepId && id === keepId) return;
    const mk = String(r.match_key || r.matchKey || "").trim();
    const nick = String(r.nick || r.client || "").trim().toLowerCase();
    if (mk === newMatchKey || nick === client.toLowerCase()) dropIds.push(id);
  });
  return {
    rename: true,
    keepId: keepId,
    newMatchKey: newMatchKey,
    fromKeys: fromKeys,
    dropIds: dropIds
  };
}
