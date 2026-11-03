/** Не создавать карточку ПП, если этот человек уже в АФК. Перенос «В ПП» идёт другим путём. */

function afkSheet_(row) {
  const s = String((row && (row.sheet || row.segment)) || "").trim().toUpperCase();
  if (s === "АФК" || s === "AFK") return "АФК";
  if (s === "ПП" || s === "PP" || s === "SUBSCRIPTION") return "ПП";
  if (s === "БП" || s === "BP") return "БП";
  return s;
}

function afkIg_(raw) {
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const at = s.match(/@([A-Za-z0-9._]{2,})/);
  if (at) return at[1].toLowerCase();
  s = s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const parts = s.split(/\s+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].replace(/^[.,;:]+|[.,;:]+$/g, "");
    if (/^[A-Za-z0-9._]{3,}$/.test(p) && /[A-Za-z]/.test(p)) return p.toLowerCase();
  }
  return "";
}

function afkPlain_(raw) {
  return String(raw || "").replace(/\s+/g, "").trim().toUpperCase().replace(/Ё/g, "Е");
}

function afkWish_(row) {
  return String((row && (row.wishes || row.note)) || "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function afkDistinctPet_(a, b) {
  const sa = String((a && (a.subId || a.id)) || "").trim();
  const sb = String((b && (b.subId || b.id)) || "").trim();
  if (sa && sb && sa === sb) return false;
  const wa = afkWish_(a);
  const wb = afkWish_(b);
  if (!wa || !wb || wa.toLowerCase() === wb.toLowerCase()) return false;
  if (wa.length > 24 || wb.length > 24) return false;
  if (/\s/.test(wa) || /\s/.test(wb)) return false;
  if (/[0-9]/.test(wa) || /[0-9]/.test(wb)) return false;
  return true;
}

export function afkSamePerson_(a, b) {
  if (!a || !b || afkDistinctPet_(a, b)) return false;
  const iga = afkIg_(a.nick) || afkIg_(a.label) || afkIg_(a.client) || afkIg_(a.name);
  const igb = afkIg_(b.nick) || afkIg_(b.label) || afkIg_(b.client) || afkIg_(b.name);
  if (iga && igb) return iga === igb;
  if (iga || igb) return false;
  const mka = afkPlain_(a.nick || a.label || a.name || "");
  const mkb = afkPlain_(b.nick || b.label || b.name || "");
  return !!(mka && mkb && mka === mkb);
}

export const AFK_PP_SPLIT_PLAN_ = [
  { subId: "45", nick: "vi.minaeva_nails", dropSheet: "ПП", keepSheet: "АФК", subsSheet: "afk" },
  { subId: "47", nick: "_madmazelka_", dropSheet: "АФК", keepSheet: "ПП", subsSheet: "pp" }
];

export function duplicateSheetBlocked_(rows, incoming) {
  if (!incoming || incoming.allowLeaveAfk === true) return false;
  const sheet = afkSheet_(incoming);
  if (sheet !== "ПП" && sheet !== "АФК") return false;
  const other = sheet === "ПП" ? "АФК" : "ПП";
  return (rows || []).some(function (row) {
    return afkSheet_(row) === other && afkSamePerson_(row, incoming);
  });
}

export function ppCreateBlockedByAfk_(rows, incoming) {
  return duplicateSheetBlocked_(rows, incoming) && afkSheet_(incoming) === "ПП";
}

function splitSubId_(row) {
  return String((row && (row.subId || row.id)) || "").trim();
}

function splitBasket_(row) {
  return Array.isArray(row && row.basket) ? row.basket : [];
}

/** Снять одну лишнюю карточку. Корзину оставляемой не затираем; пустую дополняем из снимаемой. */
export function planAfkPpSplit_(rows) {
  const list = (rows || []).filter(Boolean).map(function (row) {
    return Object.assign({}, row);
  });
  const errors = [];
  const removed = [];
  const kept = [];
  const dropKeys = Object.create(null);
  let already = true;
  AFK_PP_SPLIT_PLAN_.forEach(function (spec) {
    const mine = list.filter(function (row) {
      return splitSubId_(row) === spec.subId;
    });
    const drop = mine.filter(function (row) {
      return afkSheet_(row) === spec.dropSheet;
    });
    const keep = mine.filter(function (row) {
      return afkSheet_(row) === spec.keepSheet;
    });
    if (drop.length === 0 && keep.length === 1 && mine.length === 1) {
      kept.push({
        subId: spec.subId,
        nick: keep[0].nick || spec.nick,
        sheet: spec.keepSheet,
        basketN: splitBasket_(keep[0]).length,
        subsSheet: spec.subsSheet,
        already: true
      });
      return;
    }
    already = false;
    if (drop.length !== 1 || keep.length !== 1) {
      errors.push(spec.subId + ":drop" + drop.length + ":keep" + keep.length);
      return;
    }
    const keptRow = keep[0];
    const dropRow = drop[0];
    if (!splitBasket_(keptRow).length && splitBasket_(dropRow).length) {
      keptRow.basket = dropRow.basket.slice();
    }
    dropKeys[spec.subId + "|" + spec.dropSheet] = true;
    removed.push({
      subId: spec.subId,
      nick: dropRow.nick || spec.nick,
      sheet: spec.dropSheet,
      basketN: splitBasket_(dropRow).length
    });
    kept.push({
      subId: spec.subId,
      nick: keptRow.nick || spec.nick,
      sheet: spec.keepSheet,
      basketN: splitBasket_(keptRow).length,
      subsSheet: spec.subsSheet,
      already: false
    });
  });
  if (errors.length) return { ok: false, already: false, errors: errors, removed: removed, kept: kept, rows: list };
  const next = list.filter(function (row) {
    return !dropKeys[splitSubId_(row) + "|" + afkSheet_(row)];
  });
  return { ok: true, already: already, errors: errors, removed: removed, kept: kept, rows: next };
}
