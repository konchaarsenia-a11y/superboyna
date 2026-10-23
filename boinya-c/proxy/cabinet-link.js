/** Решения кабинета Goodboy ↔ Бойня. Запись заказов остаётся в worker.js. */

export const PUBLIC_PREFIXES = ["ПП", "РЗ", "БП", "АФК", "ПАРТ"];

const PREFIX_SHEETS = {
  ПП: ["ПП", "PP"],
  БП: ["БП", "BP"],
  АФК: ["АФК", "AFK"],
  РЗ: ["Р", "РЗ", "РОЗНИЦА", "RETAIL", "R", "ДОМ"],
  ПАРТ: ["ПАРТ", "ПАРТНЕР", "ПАРТНЁР", "PARTNER"]
};

const STOCK_WARN =
  "Позиции сейчас нет. Можете оставить своё изменение или заменить на другую позицию. Мы сообщим, когда она появится";

export function publicIdPrefix_(sheet) {
  const s = String(sheet || "")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е");
  const keys = Object.keys(PREFIX_SHEETS);
  for (let i = 0; i < keys.length; i++) {
    if (PREFIX_SHEETS[keys[i]].indexOf(s) >= 0) return keys[i];
  }
  return "";
}

export function formatPublicId_(prefix, n) {
  const num = String(Math.max(0, Number(n) || 0));
  return String(prefix || "") + (num.length < 2 ? "0" + num : num);
}

export function publicIdPrefixOf_(id) {
  const s = String(id || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const keys = PUBLIC_PREFIXES.slice().sort(function (a, b) {
    return b.length - a.length;
  });
  for (let i = 0; i < keys.length; i++) {
    if (s.indexOf(keys[i]) === 0 && /^\d{2,}$/.test(s.slice(keys[i].length))) return keys[i];
  }
  return "";
}

function emptyMap_(map) {
  const src = map || {};
  return {
    bySub: Object.assign({}, src.bySub || {}),
    byKey: Object.assign({}, src.byKey || {}),
    seq: Object.assign({}, src.seq || {})
  };
}

function bumpSeq_(map, id) {
  const prefix = publicIdPrefixOf_(id);
  if (!prefix) return;
  const n = Number(String(id).slice(prefix.length));
  if (n > (Number(map.seq[prefix]) || 0)) map.seq[prefix] = n;
}

function remember_(map, row, id) {
  if (!id) return;
  if (row.subId) map.bySub[String(row.subId)] = id;
  if (row.matchKey) map.byKey[String(row.matchKey)] = id;
  bumpSeq_(map, id);
}

/** ID один раз. Смена ника и листа не выдаёт новый. */
export function planPublicIds_(subs, map) {
  const next = emptyMap_(map);
  const issued = { ПП: 0, РЗ: 0, БП: 0, АФК: 0, ПАРТ: 0 };
  const rows = (subs || []).map(function (s) {
    return Object.assign({}, s);
  });
  rows.forEach(function (s) {
    if (s.publicId) remember_(next, s, s.publicId);
  });
  Object.keys(next.bySub).forEach(function (k) {
    bumpSeq_(next, next.bySub[k]);
  });
  rows.sort(function (a, b) {
    const an = Number(a.subId);
    const bn = Number(b.subId);
    const aOk = isFinite(an) && String(a.subId || "") !== "";
    const bOk = isFinite(bn) && String(b.subId || "") !== "";
    if (aOk && bOk && an !== bn) return an - bn;
    if (aOk && !bOk) return -1;
    if (!aOk && bOk) return 1;
    return String(a.nick || "").localeCompare(String(b.nick || ""));
  });
  rows.forEach(function (s) {
    if (s.publicId) return;
    const bySub = s.subId ? next.bySub[String(s.subId)] : "";
    if (bySub) {
      s.publicId = bySub;
      remember_(next, s, bySub);
      return;
    }
    const byKey = s.matchKey ? next.byKey[String(s.matchKey)] : "";
    if (byKey) {
      const owner = Object.keys(next.bySub).filter(function (k) {
        return next.bySub[k] === byKey;
      });
      if (!owner.length || (s.subId && owner.length === 1 && owner[0] === String(s.subId))) {
        s.publicId = byKey;
        remember_(next, s, byKey);
        return;
      }
    }
    const prefix = publicIdPrefix_(s.sheet || s.segment);
    if (!prefix) return;
    const n = (Number(next.seq[prefix]) || 0) + 1;
    next.seq[prefix] = n;
    const id = formatPublicId_(prefix, n);
    s.publicId = id;
    remember_(next, s, id);
    issued[prefix] += 1;
  });
  return { subscriptions: rows, map: next, issued: issued };
}

function normNick_(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function phoneDigits_(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function phonesEqual_(a, b) {
  const da = phoneDigits_(a);
  const db = phoneDigits_(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 9 && db.length >= 9) return da.slice(-9) === db.slice(-9);
  return false;
}

function normId_(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Точный поиск. Несколько полей — пересечение. Больше одного — не угадывать. */
export function exactClientHits_(subs, query) {
  query = query || {};
  const id = normId_(query.publicId);
  const nick = normNick_(query.nick);
  const phone = String(query.phone || "").trim();
  if (!id && !nick && !phone) return { status: "empty", hits: [] };
  const hits = [];
  const seen = Object.create(null);
  (subs || []).forEach(function (s) {
    if (!s) return;
    if (id && normId_(s.publicId) !== id) return;
    if (nick) {
      const sn = normNick_(s.nick || s.client || "");
      if (!sn || sn !== nick) return;
    }
    if (phone && !phonesEqual_(s.phone || s.tel, phone)) return;
    const key = String(s.subId || s.id || s.matchKey || s.nick || hits.length);
    if (seen[key]) return;
    seen[key] = true;
    hits.push(s);
  });
  if (!hits.length) return { status: "none", hits: [] };
  if (hits.length > 1) return { status: "many", hits: hits };
  return { status: "one", hits: hits };
}

/** Вход клиента: точный телефон или ник. Код клиента не принимается. */
export function clientLookup_(subs, query) {
  query = query || {};
  const nick = normNick_(query.nick);
  const phone = String(query.phone || "").trim();
  if (!nick && !phone) return { status: "empty", hits: [] };
  const seen = Object.create(null);
  const hits = [];
  function add(found) {
    (found && found.hits || []).forEach(function (s) {
      const key = String(s.subId || s.id || s.matchKey || s.nick || "");
      if (!key || seen[key]) return;
      seen[key] = true;
      hits.push(s);
    });
  }
  if (nick) add(exactClientHits_(subs, { nick: nick }));
  if (phone) add(exactClientHits_(subs, { phone: phone }));
  if (!hits.length) return { status: "none", hits: [] };
  if (hits.length > 1) return { status: "many", hits: hits };
  return { status: "one", hits: hits };
}

export function parseDogs_(raw) {
  let list = raw;
  if (typeof raw === "string") {
    try { list = JSON.parse(raw); } catch (e) { list = []; }
  }
  if (!Array.isArray(list)) list = [];
  const dogs = [];
  for (let i = 0; i < list.length && dogs.length < 2; i++) {
    const d = list[i] || {};
    const name = String(d.name || d.nick || "").trim();
    if (!name) continue;
    dogs.push({
      name: name,
      breed: String(d.breed || "").trim(),
      weight: String(d.weight != null ? d.weight : (d.weightKg != null ? d.weightKg : "")).trim(),
      allergies: String(d.allergies || "").trim()
    });
  }
  return dogs;
}

export function registerPlan_(lookup, dogs) {
  lookup = lookup || {};
  if (!dogs || !dogs.length) return { action: "error", message: "Укажите собаку" };
  if (lookup.status === "empty") return { action: "error", message: "Укажите телефон или ник" };
  if (lookup.status === "many") {
    return { action: "clarify", message: "Подходит несколько клиентов. Уточните телефон или ник." };
  }
  if (lookup.status === "one") return { action: "bind" };
  return { action: "lead" };
}

export function leadMatch_(leads, query) {
  const nick = normNick_(query && query.nick);
  const phone = String((query && query.phone) || "").trim();
  const items = leads || [];
  for (let i = 0; i < items.length; i++) {
    const row = items[i] || {};
    if (nick && normNick_(row.nick) === nick) return row;
    if (phone && phonesEqual_(row.phone, phone)) return row;
  }
  return null;
}

export function nextLeadId_(seq) {
  const n = (Number(seq) || 0) + 1;
  return { seq: n, publicId: formatPublicId_("НК", n) };
}

/** Ответ клиенту. Внутренний ID сюда не попадает. */
export function leadClientReply_(kind) {
  if (kind === "register") {
    return {
      status: "accepted",
      message: "Заявка принята, менеджер свяжется с вами",
      showTry: true
    };
  }
  return { status: "ok", message: "Заявка принята" };
}

export function leadStaffText_(row) {
  row = row || {};
  const dogs = (row.dogs || []).map(function (d) {
    return [d.name, d.breed, d.weight ? String(d.weight) + " кг" : "", d.allergies ? "аллергии: " + d.allergies : ""]
      .filter(Boolean)
      .join(", ");
  }).join("; ");
  const who = [row.name, row.phone, row.nick ? "@" + String(row.nick).replace(/^@/, "") : ""].filter(Boolean).join(" · ");
  const lines = [
    "🐾 GOOD BOY · новый клиент",
    row.publicId || "",
    who,
    dogs ? "Собаки: " + dogs : (row.pet ? "Питомец: " + row.pet : ""),
    row.note ? String(row.note).slice(0, 500) : "",
    "Источник: " + (row.kind === "register" ? "регистрация" : "хочу попробовать")
  ];
  return lines.filter(Boolean).join("\n");
}

/** Убрать код клиента из ответа кабинета. */
export function clientCabinetView_(view) {
  if (!view || typeof view !== "object") return view;
  const out = Object.assign({}, view);
  delete out.publicId;
  if (out.link && typeof out.link === "object") {
    out.link = Object.assign({}, out.link);
    delete out.link.publicId;
  }
  if (out.subscription && typeof out.subscription === "object") {
    out.subscription = Object.assign({}, out.subscription);
    delete out.subscription.publicId;
  }
  return out;
}

function slotOf_(row) {
  const n = Number(row && (row.slot != null ? row.slot : row.deliverySlot)) || 0;
  if (n >= 1) return n;
  const s = String((row && row.ppSlot) || "");
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  return m ? Number(m[1]) || 0 : 0;
}

function paidOf_(row) {
  const p = String(row && row.paid != null ? row.paid : "").toLowerCase();
  if (p === "yes" || p === "true" || p === "1") return "yes";
  if (p === "no" || p === "false" || p === "0") return "no";
  return "";
}

function moneyOf_(row) {
  const n = Number(row && (row.orderPrice != null ? row.orderPrice : row.price));
  if (!isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

function isPp_(row) {
  const s = String((row && (row.sheet || row.segment)) || "")
    .trim()
    .toUpperCase();
  return s === "ПП" || s === "АФК" || s === "PP";
}

function isRetail_(row) {
  const s = String((row && (row.sheet || row.segment)) || "")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е");
  return s === "Р" || s === "РЗ" || s === "РОЗНИЦА" || s === "ДОМ";
}

function isBp_(row) {
  const s = String((row && (row.sheet || row.segment)) || "")
    .trim()
    .toUpperCase();
  return s === "БП" || s === "BP";
}

const PAY_MOVE_NOTE_ = "перенесено на доставку 2";

function moveSlot_(row) {
  const pp = String((row && row.ppSlot) || "");
  const frac = pp.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) || 0;
  const delRaw = row && row.deliverySlot != null ? String(row.deliverySlot) : "";
  const delFrac = delRaw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (delFrac) return Number(delFrac[1]) || 0;
  const n = Number(row && (row.slot != null && row.slot !== "" ? row.slot : row.deliverySlot));
  if (n >= 1) return n;
  if (pp === "1" || pp === "2") return Number(pp);
  return 0;
}

function moveStarts_(prev, row) {
  const slot = moveSlot_(row);
  const prevSlot = moveSlot_(prev);
  if (slot === 1) return true;
  if (slot >= 1 && prevSlot >= 1 && slot < prevSlot) return true;
  return false;
}

function moveCycles_(rows) {
  const list = (rows || []).slice().sort(function (a, b) {
    const ad = String(a.date || "");
    const bd = String(b.date || "");
    if (ad !== bd) return ad < bd ? -1 : 1;
    return moveSlot_(a) - moveSlot_(b);
  });
  const cycles = [];
  let cur = [];
  let prev = null;
  list.forEach(function (row) {
    if (prev && moveStarts_(prev, row)) {
      cycles.push(cur);
      cur = [];
    }
    cur.push(row);
    prev = row;
  });
  if (cur.length) cycles.push(cur);
  return cycles;
}

function moveGroup_(row) {
  return String((row && (row.group || row.matchKey || row.client || row.name)) || "")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е");
}

function moveMonth_(row) {
  const d = String((row && row.date) || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(0, 7) : "";
}

function flagOn_(row, key) {
  const v = row && row[key];
  if (v == null || v === "") return false;
  if (key === "payDue" || key === "payMovedAmount") {
    const n = Number(v);
    return isFinite(n) && n > 0;
  }
  return true;
}

function sameFlag_(row, key, want) {
  const v = row && row[key];
  if (typeof want === "number") return Number(v) === want;
  if (want == null || want === "") return !flagOn_(row, key);
  return String(v == null ? "" : v) === String(want);
}

function pushPatch_(patches, row, set, clear) {
  const realSet = {};
  const realClear = [];
  Object.keys(set || {}).forEach(function (k) {
    if (!sameFlag_(row, k, set[k])) realSet[k] = set[k];
  });
  (clear || []).forEach(function (k) {
    if (flagOn_(row, k)) realClear.push(k);
  });
  if (!Object.keys(realSet).length && !realClear.length) return;
  patches.push({ id: row.id, set: realSet, clear: realClear });
}

/**
 * Неоплата ПП1 в том же цикле и том же месяце переносит сумму на ПП2.
 * orderPrice и paid не меняются. Нет ПП2 в месяце — сумма остаётся, notify.
 * Повтор с теми же пометками не даёт патч.
 */
export function planPpPayMove_(rows) {
  const patches = [];
  const notify = [];
  const groups = {};
  (rows || []).forEach(function (row) {
    if (!row || !row.id || !isPp_(row)) return;
    const month = moveMonth_(row);
    const who = moveGroup_(row);
    if (!month || !who) return;
    const key = who + "|" + month;
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });
  Object.keys(groups).forEach(function (key) {
    const monthRows = groups[key];
    const monthHasSecond = monthRows.some(function (row) { return moveSlot_(row) >= 2; });
    moveCycles_(monthRows).forEach(function (cycle) {
      let first = null;
      let second = null;
      cycle.forEach(function (row) {
        const slot = moveSlot_(row);
        if (slot < 2 && !first) first = row;
        if (slot >= 2 && !second) second = row;
      });
      if (!first) {
        cycle.forEach(function (row) {
          pushPatch_(patches, row, {}, ["payDue", "payFromDate", "payMoved", "payMovedAmount", "payMovedTo"]);
        });
        return;
      }
      const paid = paidOf_(first);
      const amount = moneyOf_(first);
      if (paid === "no" && second && amount > 0) {
        pushPatch_(
          patches,
          first,
          { payMoved: "pp2", payMovedAmount: amount, payMovedTo: String(second.date).slice(0, 10) },
          ["payDue", "payFromDate"]
        );
        pushPatch_(
          patches,
          second,
          { payDue: amount, payFromDate: String(first.date).slice(0, 10) },
          ["payMoved", "payMovedAmount", "payMovedTo"]
        );
        cycle.forEach(function (row) {
          if (row === first || row === second) return;
          pushPatch_(patches, row, {}, ["payMoved", "payMovedAmount", "payMovedTo", "payDue", "payFromDate"]);
        });
        return;
      }
      cycle.forEach(function (row) {
        pushPatch_(patches, row, {}, ["payMoved", "payMovedAmount", "payMovedTo", "payDue", "payFromDate"]);
      });
      if (paid === "no" && !second && !monthHasSecond && amount > 0) {
        notify.push({
          id: first.id,
          client: String(first.client || first.name || ""),
          date: String(first.date || "").slice(0, 10),
          amount: amount,
          matchKey: String(first.matchKey || "")
        });
      }
    });
  });
  return { patches: patches, notify: notify };
}

/**
 * ПП2 с переносом: «к оплате на доставке 2: N BYN».
 * ПП1 после переноса: «перенесено на доставку 2», к оплате 0.
 * Нет ПП2 — «К оплате N BYN» на первой.
 */
export function payLabel_(row) {
  row = row || {};
  const slot = moveSlot_(row) || slotOf_(row);
  const n = Math.max(0, Number(row.deliveriesN || row.deliveries) || 0);
  const paid = paidOf_(row);
  const money = moneyOf_(row);
  const due = Number(row.payDue);
  const moved = String(row.payMoved || "") === "pp2";
  if (isBp_(row)) return { role: "none", text: "", dueOnSecond: "" };
  if (isPp_(row) && slot >= 2 && isFinite(due) && due > 0) {
    return { role: "due", text: "к оплате на доставке 2: " + due + " BYN", dueOnSecond: "" };
  }
  if (isPp_(row) && (n >= 2 || slot >= 2) && slot >= 2) {
    return { role: "free", text: "Бесплатная, входит в первую", dueOnSecond: "" };
  }
  if (paid === "yes") return { role: "paid", text: "Оплачено", dueOnSecond: "" };
  if (paid === "no" && moved) {
    return { role: "moved", text: PAY_MOVE_NOTE_, dueOnSecond: "" };
  }
  if (paid === "no") {
    const text = money ? "Не оплачено. К оплате " + money + " BYN" : "Не оплачено. К оплате";
    return { role: "unpaid", text: text, dueOnSecond: "" };
  }
  if (isRetail_(row) || isPp_(row) || money) {
    if (!money) return { role: "due", text: "К оплате", dueOnSecond: "" };
    return { role: "due", text: "К оплате " + money + " BYN", dueOnSecond: "" };
  }
  return { role: "none", text: "", dueOnSecond: "" };
}

export function deliveryType_(row) {
  row = row || {};
  if (isBp_(row)) return "БП";
  if (isRetail_(row)) return "ДОМ";
  const s = String((row.sheet || row.segment) || "")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е");
  if (s.indexOf("ПАРТ") === 0 || s === "PARTNER") return "ПАРТ";
  const slot = slotOf_(row);
  if (slot >= 2) return "ПП2";
  return "ПП1";
}

export function pairRole_(row) {
  const due = Number(row && row.payDue);
  if (String(row && row.payMoved || "") === "pp2") return "";
  if (isFinite(due) && due > 0) return "";
  const slot = slotOf_(row);
  const n = Math.max(0, Number(row && (row.deliveriesN || row.deliveries)) || 0);
  if (isPp_(row) && n >= 2 && slot >= 2) return "бесплатная";
  if (isPp_(row) && n >= 2 && slot <= 1) return "платная";
  return "";
}

/** today и delivery — YYYY-MM-DD. В день доставки перенос не применяется. */
export function moveDecision_(today, delivery, confirmOnly) {
  const t = String(today || "").slice(0, 10);
  const d = String(delivery || "").slice(0, 10);
  if (!d) return { apply: false, reason: "no_date", clientText: "", staff: "" };
  if (confirmOnly) {
    return {
      apply: false,
      reason: "confirm_only",
      clientText: "менеджер свяжется с вами",
      staff: "клиент просит перенести"
    };
  }
  if (t && d && t >= d) {
    return {
      apply: false,
      reason: "same_day",
      clientText: "менеджер свяжется с вами",
      staff: "клиент просит перенести"
    };
  }
  return { apply: true, reason: "apply", clientText: "", staff: "клиент перенёс дату" };
}

export function pausePlan_(today, orders) {
  const t = String(today || "").slice(0, 10);
  const future = (orders || []).filter(function (o) {
    if (!o) return false;
    const st = String(o.status || "active").toLowerCase();
    if (st && st !== "active") return false;
    const d = String(o.date || o.date_iso || "").slice(0, 10);
    return !!(d && t && d > t);
  });
  return {
    moveSheet: "АФК",
    hadFuture: future.length > 0,
    deleteIds: future.map(function (o) {
      return o.id;
    })
  };
}

function normItem_(name) {
  return String(name || "")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/\s+/g, " ");
}

export function stockDecision_(names, stockRows, already) {
  const have = Object.create(null);
  (already || []).forEach(function (n) {
    const k = normItem_(n);
    if (k) have[k] = true;
  });
  const stock = Object.create(null);
  (stockRows || []).forEach(function (r) {
    if (!r) return;
    const k = normItem_(r.name);
    if (!k) return;
    const ok = Number(r.dry_g) > 0 || Number(r.raw_kg) > 0;
    if (ok) stock[k] = true;
  });
  const missing = [];
  (names || []).forEach(function (n) {
    const k = normItem_(n);
    if (!k || have[k]) return;
    if (!stock[k] && missing.indexOf(String(n).trim()) < 0) missing.push(String(n).trim());
  });
  if (!missing.length) return { ok: true, missing: [], message: "" };
  return { ok: false, missing: missing, message: STOCK_WARN };
}

export function waitNote_(note, names) {
  let text = String(note || "");
  (names || []).forEach(function (n) {
    const mark = "ждёт позицию " + String(n || "").trim();
    if (!n || text.indexOf(mark) >= 0) return;
    text = text ? text.replace(/\s+$/, "") + "\n" + mark : mark;
  });
  return text;
}

export function composeAddress_(street, entrance, floor, flat) {
  const st = String(street || "").trim();
  const parts = [];
  if (st) parts.push(st);
  const ent = String(entrance || "").trim();
  const fl = String(floor || "").trim();
  let ft = String(flat || "").trim();
  if (ent) {
    if (/^(подъезд|п\.|домофон)/i.test(ent)) parts.push(ent);
    else parts.push("п." + ent);
  }
  if (fl) {
    if (/^(этаж|эт\.)/i.test(fl)) parts.push(fl);
    else parts.push("эт." + fl);
  }
  if (ft) {
    ft = ft.replace(/^(квартира|кв\.?)\s*/i, "").trim();
    if (/^(квартира|кв\.)/i.test(ft)) parts.push(ft);
    else parts.push("кв." + ft);
  }
  return parts.join(" · ");
}

export function parseAddress_(line) {
  const raw = String(line || "").trim();
  const out = { street: "", entrance: "", floor: "", flat: "" };
  if (!raw) return out;
  const bits = raw.split(/\s*·\s*/);
  const streetBits = [];
  bits.forEach(function (bit) {
    const s = String(bit || "").trim();
    if (!s) return;
    if (/^(подъезд|п\.)/i.test(s) && !out.entrance) {
      out.entrance = s.replace(/^(подъезд|п\.)\s*/i, "").trim();
      return;
    }
    if (/^(этаж|эт\.)/i.test(s) && !out.floor) {
      out.floor = s.replace(/^(этаж|эт\.)\s*/i, "").trim();
      return;
    }
    if (/^(квартира|кв\.?)/i.test(s) && !out.flat) {
      out.flat = s.replace(/^(квартира|кв\.?)\s*/i, "").trim();
      return;
    }
    streetBits.push(s);
  });
  out.street = streetBits.join(" · ");
  return out;
}

function dogName_(v) {
  const n = String(v || "").trim();
  if (!n || /^собака\s*[12]$/i.test(n)) return "";
  return n;
}

/** Одна пара кличек: карточка клиента, затем заказ, затем питомец кабинета. */
export function dogPair_(clientsDogs, orderNames, pets) {
  const out = { 1: "", 2: "" };
  function put(slot, name) {
    const n = dogName_(name);
    const s = Number(slot) === 2 ? 2 : 1;
    if (n && !out[s]) out[s] = n;
  }
  (clientsDogs || []).forEach(function (d, i) {
    if (!d) return;
    put(d.dog || d.slot || d.part || i + 1, d.name || d.dogName || d.nick);
  });
  if (orderNames && typeof orderNames === "object") {
    put(1, orderNames[1] || orderNames["1"]);
    put(2, orderNames[2] || orderNames["2"]);
  }
  (pets || []).forEach(function (p, i) {
    put(i + 1, p && p.name);
  });
  return {
    dogNames: { 1: out[1], 2: out[2] },
    dogs: [out[1], out[2]]
      .map(function (name, i) {
        return name ? { slot: i + 1, name: name } : null;
      })
      .filter(Boolean)
  };
}

export function orderFingerprint_(rows) {
  return (rows || [])
    .map(function (r) {
      return [r.id, r.match_key || r.matchKey, r.status, r.updated_at || r.updatedAt].join("|");
    })
    .sort()
    .join("\n");
}

export function subFingerprint_(rows) {
  return (rows || [])
    .map(function (r) {
      return [r.id, r.nick, r.sheet, r.status].join("|");
    })
    .sort()
    .join("\n");
}

export function monthWindow_(today, dates) {
  const t = String(today || "").slice(0, 10);
  const future = (dates || [])
    .map(function (d) {
      return String(d || "").slice(0, 10);
    })
    .filter(function (d) {
      return d && d >= t;
    })
    .sort();
  if (!future.length) return { from: "", to: "" };
  const month = future[0].slice(0, 7);
  const end = month + "-31";
  return { from: month + "-01", to: end, nearest: future[0] };
}
