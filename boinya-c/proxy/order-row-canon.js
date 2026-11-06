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
  (opts.occupants || []).forEach(function (o) {
    if (!o || !o.id) return;
    if (String(o.id) === String(row.id)) return;
    if (String(o.id) === targetId && String(o.status || "active") !== "deleted") clash.push(String(o.id));
  });
  return {
    ok: true,
    sourceId: String(row.id),
    targetId: targetId,
    dateIso: dateIso,
    dayName: dayName,
    matchKey: matchKey,
    softDeleteClashIds: clash,
    sameRow: true
  };
}

export function orderNickRenameIsInPlace_(plan) {
  return !!(plan && plan.rename && plan.keepId && (plan.softDeleteIds || []).indexOf(plan.keepId) < 0);
}

export function orderMoveIsInPlace_(plan) {
  return !!(plan && plan.ok && plan.sameRow && plan.sourceId && plan.targetId);
}
