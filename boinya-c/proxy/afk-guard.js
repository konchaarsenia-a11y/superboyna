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

export function ppCreateBlockedByAfk_(rows, incoming) {
  if (!incoming || incoming.allowLeaveAfk === true) return false;
  if (afkSheet_(incoming) !== "ПП") return false;
  return (rows || []).some(function (row) {
    return afkSheet_(row) === "АФК" && afkSamePerson_(row, incoming);
  });
}
