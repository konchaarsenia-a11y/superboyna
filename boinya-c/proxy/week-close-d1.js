/**
 * Закрытие недели только в D1. Чистая функция: ничего не пишет.
 * Слоты прошедшей недели теряют day_name, строки остаются.
 * date_iso не меняется. Новые заказы не создаются.
 */

const WEEK_CLOSE_DAYS_ = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье"
];

function weekCloseCoerceIso_(raw) {
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return "";
  return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
}

function weekCloseAddDays_(iso, n) {
  const p = String(iso || "").split("-");
  if (p.length !== 3) return "";
  const dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + Number(n || 0)));
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1);
  const d = String(dt.getUTCDate());
  return y + "-" + (mo.length < 2 ? "0" + mo : mo) + "-" + (d.length < 2 ? "0" + d : d);
}

function weekCloseWeekday_(iso) {
  const p = String(iso || "").split("-");
  if (p.length !== 3) return "";
  const dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  const wd = dt.getUTCDay();
  return WEEK_CLOSE_DAYS_[wd === 0 ? 6 : wd - 1];
}

/** Слот и date_iso. Позднюю дату нельзя притянуть на более ранний слот. */
export function weekCloseSlotAction_(haveIso, wantIso, weekMap) {
  const have = weekCloseCoerceIso_(haveIso);
  const want = weekCloseCoerceIso_(wantIso);
  if (!want) return "skip";
  if (!have) return "stamp_empty";
  if (have === want) return "keep";
  if (have > want) return "keep";
  if (weekMap && weekMap[have] && weekMap[want]) return "stamp_slot";
  return "detach";
}

function weekCloseDmy_(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return m[3] + "." + m[2] + "." + m[1];
}

export function weekCloseCanonNative_(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "sheets" || v === "gas" || v === "gas-async" || v === "async") return false;
  return true;
}

function weekCloseLocked_(finished, iso) {
  const bag = finished || {};
  const a = String(bag["week_finished:" + iso] || "");
  const b = String(bag["WEEK_FINISHED_" + iso] || "");
  return a === "1" || a === "true" || b === "1" || b === "true";
}

function weekClosePointer_(counts) {
  const items = (counts && counts.items) || [];
  for (let i = 0; i < items.length; i++) {
    if (items[i] && String(items[i].day) === "Понедельник") {
      return weekCloseCoerceIso_(items[i].date) || weekCloseCoerceIso_(items[i].dateIso);
    }
  }
  return "";
}

export function weekCloseClientCounts_(orders) {
  const out = Object.create(null);
  (orders || []).forEach(function (o) {
    const k = String(o.key || o.match_key || o.client || "");
    if (!out[k]) out[k] = { active: 0, other: 0 };
    if (String(o.status) === "active") out[k].active += 1;
    else out[k].other += 1;
  });
  return out;
}

export function weekCloseCountsEqual_(before, after) {
  const keys = Object.create(null);
  Object.keys(before || {}).forEach(function (k) {
    keys[k] = true;
  });
  Object.keys(after || {}).forEach(function (k) {
    keys[k] = true;
  });
  const diff = [];
  Object.keys(keys)
    .sort()
    .forEach(function (k) {
      const x = (before && before[k]) || { active: 0, other: 0 };
      const y = (after && after[k]) || { active: 0, other: 0 };
      if (x.active !== y.active || x.other !== y.other) {
        diff.push({ key: k, before: x, after: y });
      }
    });
  return diff;
}

export function applyWeekClosePlan_(orders, plan) {
  const byId = Object.create(null);
  ((plan && plan.updates) || []).forEach(function (u) {
    byId[u.id] = u.day;
  });
  return (orders || []).map(function (o) {
    if (!Object.prototype.hasOwnProperty.call(byId, o.id)) return o;
    return Object.assign({}, o, { day: byId[o.id], day_name: byId[o.id] });
  });
}

export function weekCloseCalendarNicks_(orders, fromIso, toIso) {
  const from = weekCloseCoerceIso_(fromIso);
  const to = weekCloseCoerceIso_(toIso);
  const board = Object.create(null);
  let cursor = from;
  while (cursor && to && cursor <= to) {
    board[cursor] = [];
    cursor = weekCloseAddDays_(cursor, 1);
  }
  (orders || []).forEach(function (o) {
    if (String(o.status) !== "active") return;
    const iso = weekCloseCoerceIso_(o.date || o.date_iso);
    if (!iso || !board[iso]) return;
    board[iso].push(String(o.client || ""));
  });
  Object.keys(board).forEach(function (iso) {
    board[iso].sort();
  });
  return board;
}

export function weekCloseBoardNicks_(orders, mondayIso) {
  const monday = weekCloseCoerceIso_(mondayIso);
  const board = Object.create(null);
  for (let i = 0; i < 7; i++) {
    const iso = weekCloseAddDays_(monday, i);
    board[iso] = (orders || [])
      .filter(function (o) {
        if (String(o.status) !== "active") return false;
        const isoRow = weekCloseCoerceIso_(o.date || o.date_iso);
        const day = String(o.day || o.day_name || "");
        return isoRow === iso && WEEK_CLOSE_DAYS_.indexOf(day) >= 0;
      })
      .map(function (o) {
        return String(o.client || "");
      })
      .sort();
  }
  return board;
}

/** Счётчики слотов как у месяца: число активных заказов по date_iso, не по листу. */
export function weekSlotCountsFromOrders_(orders, mondayIso) {
  const monday = weekCloseCoerceIso_(mondayIso);
  const futureMonday = weekCloseAddDays_(monday, 7);
  const futureEnd = weekCloseAddDays_(monday, 13);
  return WEEK_CLOSE_DAYS_.concat(["Будущая неделя"]).map(function (day, idx) {
    const iso = idx < 7 ? weekCloseAddDays_(monday, idx) : futureMonday;
    let count = 0;
    (orders || []).forEach(function (o) {
      const st = o && o.status != null && String(o.status) !== "" ? String(o.status) : "active";
      if (st !== "active") return;
      const rowIso = weekCloseCoerceIso_(o.date || o.date_iso);
      if (!rowIso) return;
      if (idx < 7) {
        if (rowIso === iso) count += 1;
      } else if (futureMonday && futureEnd && rowIso >= futureMonday && rowIso <= futureEnd) {
        count += 1;
      }
    });
    return { day: day, short: day, date: weekCloseDmy_(iso), count: count, dateIso: iso };
  });
}

export function weekCloseNickDiff_(left, right) {
  const diff = [];
  const keys = Object.create(null);
  Object.keys(left || {}).forEach(function (k) {
    keys[k] = true;
  });
  Object.keys(right || {}).forEach(function (k) {
    keys[k] = true;
  });
  Object.keys(keys)
    .sort()
    .forEach(function (iso) {
      const a = ((left && left[iso]) || []).slice().sort();
      const b = ((right && right[iso]) || []).slice().sort();
      if (a.join("\n") !== b.join("\n")) diff.push({ date: iso, calendar: a, board: b });
    });
  return diff;
}

export function weekCloseFinishAllowed_(plan) {
  if (!plan || !plan.ok) {
    return { ok: false, reason: (plan && (plan.reason || plan.message)) || "plan" };
  }
  if (plan.warehouseApply) return { ok: false, reason: "warehouse" };
  if (plan.newMonday !== weekCloseAddDays_(plan.oldMonday, 7)) return { ok: false, reason: "step" };
  const diff = weekCloseCountsEqual_(plan.ordersBefore, plan.ordersAfter);
  if (diff.length) return { ok: false, reason: "clients", diff: diff };
  const bad = (plan.updates || []).filter(function (u) {
    return !u || !u.id || u.day == null;
  });
  if (bad.length) return { ok: false, reason: "update" };
  return { ok: true };
}

export function planWeekCloseD1_(input) {
  const src = input || {};
  const calendarMonday = weekCloseCoerceIso_(src.calendarMonday);
  const todayIso = weekCloseCoerceIso_(src.todayIso);
  const pointer = weekClosePointer_(src.counts);
  const finished = src.finished || {};
  if (!pointer) {
    return {
      ok: false,
      status: "error",
      message: "missing_date",
      sheets: false,
      fromD1: true,
      weekCloseCanon: "d1-only"
    };
  }
  if (calendarMonday && pointer > calendarMonday) {
    return {
      ok: false,
      status: "error",
      message: "week_already_finished",
      reason: "pointer_ahead",
      sheetMonday: weekCloseDmy_(pointer),
      calendarMonday: weekCloseDmy_(calendarMonday),
      sheets: false,
      fromD1: true,
      weekCloseCanon: "d1-only"
    };
  }
  // Замок на той же неделе, что и указатель: закрытие отметилось, а слоты остались.
  // Повтор доводит day_name. date_iso эта функция не меняет.
  const retriedStuckLock = weekCloseLocked_(finished, pointer);
  const prev = weekCloseAddDays_(pointer, -7);
  if (calendarMonday && pointer === calendarMonday && todayIso === calendarMonday && weekCloseLocked_(finished, prev)) {
    return {
      ok: false,
      status: "error",
      message: "week_already_finished",
      reason: "monday_lock",
      sheets: false,
      fromD1: true,
      weekCloseCanon: "d1-only"
    };
  }

  const oldMonday = pointer;
  const newMonday = weekCloseAddDays_(oldMonday, 7);
  const oldEnd = weekCloseAddDays_(oldMonday, 6);
  const newEnd = weekCloseAddDays_(newMonday, 6);
  const futureMonday = weekCloseAddDays_(newMonday, 7);
  const orders = (src.orders || []).map(function (o) {
    return {
      id: String(o.id || ""),
      client: String(o.client || ""),
      key: String(o.key || o.match_key || ""),
      date: String(o.date || o.date_iso || ""),
      iso: weekCloseCoerceIso_(o.date || o.date_iso || ""),
      day: String(o.day != null ? o.day : o.day_name || ""),
      status: String(o.status || "")
    };
  });

  const desired = orders.map(function (o) {
    let day = o.day;
    let reason = "";
    const onWeekday = WEEK_CLOSE_DAYS_.indexOf(o.day) >= 0;
    if (onWeekday && o.iso && o.iso >= oldMonday && o.iso <= oldEnd) {
      day = "";
      reason = "archive";
    } else if (o.day === "Будущая неделя") {
      if (o.status !== "active") {
        day = "";
        reason = "future-clear";
      } else if (o.iso && o.iso >= newMonday && o.iso <= newEnd) {
        day = weekCloseWeekday_(o.iso);
        reason = "future-move";
      }
    } else if (o.status === "active" && !o.day && o.iso && o.iso >= newMonday && o.iso <= newEnd) {
      day = weekCloseWeekday_(o.iso);
      reason = "materialize";
    } else if (
      o.status === "active" &&
      o.iso &&
      o.iso >= futureMonday &&
      o.iso <= weekCloseAddDays_(futureMonday, 6) &&
      o.day !== "Будущая неделя"
    ) {
      day = "Будущая неделя";
      reason = "future-label";
    }
    return { o: o, day: day, reason: reason };
  });

  const seen = Object.create(null);
  const updates = [];
  const skippedDupes = [];
  desired.forEach(function (row) {
    const o = row.o;
    if (row.day && o.status === "active" && o.iso && o.key) {
      const k = o.key + "|" + o.iso;
      if (seen[k]) {
        skippedDupes.push({ id: o.id, client: o.client, key: o.key, iso: o.iso });
        if (o.day) {
          updates.push({
            id: o.id,
            fromDay: o.day,
            day: "",
            status: o.status,
            client: o.client,
            key: o.key,
            iso: o.iso,
            reason: "dupe"
          });
        }
        return;
      }
      seen[k] = o.id;
    }
    if (row.day !== o.day) {
      updates.push({
        id: o.id,
        fromDay: o.day,
        day: row.day,
        status: o.status,
        client: o.client,
        key: o.key,
        iso: o.iso,
        reason: row.reason
      });
    }
  });

  const after = applyWeekClosePlan_(orders, { updates: updates });
  const board = weekCloseBoardNicks_(after, newMonday);
  const counts = weekSlotCountsFromOrders_(after, newMonday);
  const materializeAdded = updates.filter(function (u) {
    return u.reason === "materialize";
  }).length;
  const futureMoved = updates.filter(function (u) {
    return u.reason === "future-move";
  }).length;
  const archived = updates.filter(function (u) {
    return u.reason === "archive";
  }).length;
  const stageCOk = !!src.stageCOk;
  const warehouseCanon = !!src.warehouseCanon;
  return {
    ok: true,
    status: "success",
    message: "week_closed",
    oldMonday: oldMonday,
    newMonday: newMonday,
    mondayDate: weekCloseDmy_(newMonday),
    prevMondayIso: oldMonday,
    prevMondayDate: weekCloseDmy_(oldMonday),
    futureMonday: futureMonday,
    courierDate: weekCloseDmy_(newMonday),
    updates: updates,
    skippedDupes: skippedDupes,
    board: board,
    counts: counts,
    materializeAdded: materializeAdded,
    newEnd: newEnd,
    futureMoved: futureMoved,
    archived: archived,
    ordersBefore: weekCloseClientCounts_(orders),
    ordersAfter: weekCloseClientCounts_(after),
    retriedStuckLock: retriedStuckLock,
    warehouseApply: stageCOk && warehouseCanon,
    warehouseReason: stageCOk && warehouseCanon ? "d1-compute" : !stageCOk ? "stage_c_formula_ok_not_1" : "warehouse_canon_off",
    sheets: false,
    fromD1: true,
    weekCloseCanon: "d1-only"
  };
}
