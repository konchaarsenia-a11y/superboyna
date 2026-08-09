/**
 * Бойня C — Worker + D1 (песочница).
 * Прод GAS / Sheets не пишет.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

const WEEK_DAYS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
  "Будущая неделя"
];

const DAY_SHORT = {
  Понедельник: "Пн",
  Вторник: "Вт",
  Среда: "Ср",
  Четверг: "Чт",
  Пятница: "Пт",
  Суббота: "Сб",
  Воскресенье: "Вс",
  "Будущая неделя": "Буд"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const action = String(url.searchParams.get("action") || "").trim();

    if (request.method === "GET" && (!action || action === "health")) {
      return json({
        status: "ok",
        service: "boinya-c",
        sandbox: true,
        d1: !!(env && env.DB),
        tip: "?action=getClients&day=Понедельник"
      });
    }

    try {
      let params = Object.fromEntries(url.searchParams.entries());
      if (request.method === "POST") {
        const body = await request.json().catch(function () {
          return {};
        });
        params = Object.assign({}, params, body || {});
      }
      const act = String(params.action || action || "");
      const cb = params.callback;
      const result = await handleAction_(act, params, env);
      if (cb) {
        return new Response(String(cb) + "(" + JSON.stringify(result) + ")", {
          headers: {
            ...CORS,
            "Content-Type": "text/javascript; charset=utf-8"
          }
        });
      }
      return json(result);
    } catch (e) {
      return json(
        { status: "error", message: String(e && e.message ? e.message : e), sandbox: true },
        500
      );
    }
  }
};

async function handleAction_(action, params, env) {
  const a = String(action || "");
  if (a === "ping" || a === "keepWarm") {
    return { status: "success", sandbox: true, d1: !!(env && env.DB) };
  }
  if (a === "getClients") return getClients_(params, env);
  if (a === "getViewCompare") return getViewCompare_(params, env);
  if (a === "getWeekDayCounts") return rebuildWeekCounts_(env);
  if (a === "getMonthOverview") return getMonthOverview_(params, env);
  if (a === "getWeekBannerState") return getSnap_(env, "weekBanner", defaultBanner_(params));
  if (a === "getCutting") return getCutting_(params, env);
  if (a === "getCourier") return getCourier_(params, env);
  if (a === "getAssembly") return getAssembly_(params, env);
  if (a === "getWarehouse") {
    return getSnap_(env, "warehouse", { status: "success", items: [], rows: [], sandbox: true });
  }
  if (a === "warehousePreview") {
    const hit = await getSnapRaw_(env, "warehousePreview");
    if (hit) return hit;
    return getSnap_(env, "warehouse", { status: "success", items: [], rows: [], sandbox: true });
  }
  if (a === "resolveDayForDate") return resolveDay_(params, env);
  if (a === "getMyAccess") {
    // роль all — полный UI как у владельца; люди из listAccess
    return {
      status: "success",
      role: "all",
      access: "active",
      telegramId: String(params.telegramId || ""),
      name: params.name || "",
      tabs: [],
      sandbox: true
    };
  }
  if (a === "saveOrder") return saveOrder_(params, env, false);
  if (a === "saveBooking") return saveOrder_(params, env, true);
  if (a === "deleteClient" || a === "removeCalendarClient") return deleteClient_(params, env);
  if (a === "moveClient") return moveClient_(params, env);
  if (a === "setDelivered") return setDelivered_(params, env);
  if (a === "setAssembled") return setAssemblyFlag_(params, env, "assembled");
  if (a === "setPrinted") return setAssemblyFlag_(params, env, "printed");
  if (a === "updateCutting") return updateCutting_(params, env);
  if (a === "startCuttingSession" || a === "finishCutting" || a === "prepareFinishCutting") {
    return { status: "success", sandbox: true, wrote: 1, action: a };
  }
  if (a === "listTemplates") {
    const key = params.kind ? "listTemplates:" + String(params.kind) : "listTemplates";
    const hit = await getSnapRaw_(env, key);
    if (hit) return hit;
    const base = await getSnapRaw_(env, "listTemplates");
    if (base) return base;
  }
  if (
    a === "listDeferred" ||
    a === "listSurvey" ||
    a === "listSubscriptions" ||
    a === "listPartners" ||
    a === "listAccess" ||
    a === "listBookings" ||
    a === "listClientProfiles" ||
    a === "listReminderPeople" ||
    a === "listBpIdle" ||
    a === "getCouriers" ||
    a === "partnerListAdmin" ||
    a === "getStats" ||
    a === "getExpectedProfit" ||
    a === "telegramStatus" ||
    a === "weekPullStatus"
  ) {
    const hit = await getSnapRaw_(env, a);
    if (hit) return hit;
    return {
      status: "success",
      items: [],
      list: [],
      people: [],
      clients: [],
      partners: [],
      couriers: [],
      subscriptions: [],
      sandbox: true,
      empty: true
    };
  }
  if (a === "getSubscription") return getSubscription_(params, env);
  if (a === "exportStats") {
    const st = await getSnapRaw_(env, "getStats");
    if (st) return Object.assign({}, st, { format: params.format || "", sandbox: true });
    return { status: "success", rows: [], items: [], sandbox: true };
  }
  // живые калькуляции / подсказки — только чтение GAS (Sheets не пишет)
  if (
    a === "getPpFactCost" ||
    a === "getPpOrderSuggest" ||
    a === "calcPrice" ||
    a === "calcPpFact" ||
    a === "suggestAddress" ||
    a === "lookupBpPartner"
  ) {
    const proxied = await gasRead_(a, params, env);
    if (proxied) return proxied;
    return { status: "success", items: [], suggestions: [], basket: [], total: 0, price: 0, sandbox: true };
  }
  if (a === "getTransferTask") {
    return { status: "success", ok: true, ready: false, sandbox: true };
  }
  if (a === "setWeekBannerState") {
    const body = {
      status: "success",
      finished: !!toBool_(params.finished),
      pulled: !!toBool_(params.pulled),
      refused: !!toBool_(params.refused),
      weekKey: params.weekKey || "",
      sandbox: true
    };
    await putSnap_(env, "weekBanner", body);
    return body;
  }
  // мутации справочников — только D1 snap (не Sheets)
  if (a === "saveSubscription" || a === "moveSubscription") return upsertSubscription_(params, env);
  if (a === "deleteSubscription" || a === "deleteSubscriptionBatch") return deleteSubscription_(params, env);
  if (a === "saveSurvey") return upsertInList_(env, "listSurvey", "items", params, "id");
  if (a === "deleteSurvey" || a === "deleteSurveyBatch") return deleteFromList_(env, "listSurvey", "items", params, "id");
  if (a === "saveDeferred") return upsertInList_(env, "listDeferred", "items", params, "id");
  if (a === "cancelDeferred") return deleteFromList_(env, "listDeferred", "items", params, "id");
  if (a === "savePartner" || a === "deletePartner") return mutatePartners_(a, params, env);
  if (a === "saveTemplate" || a === "deleteTemplate") return mutateTemplates_(a, params, env);
  if (a === "setAccessRole" || a === "setAccessTimezone" || a === "requestAccess") {
    return mutateAccess_(a, params, env);
  }
  if (a === "setWarehouseArrival") return setWarehouseArrival_(params, env);
  if (a === "finishFullWeek" || a === "materializeWeek" || a === "pullClientsFromMonth") {
    // не трогаем боевую неделю Sheets
    return {
      status: "success",
      sandbox: true,
      wrote: 0,
      blocked: true,
      message: "sandbox_no_prod_week",
      action: a
    };
  }
  if (
    /^(save|delete|move|update|finish|cancel|enroll|set|close|pull|materialize|start|stop|ensure|scrub|request|setup|create|add|remove|toggle|mark|send|prepare|register|upsert|sync|notify|compose|repair|report|log|partner)/i.test(
      a
    )
  ) {
    return { status: "success", sandbox: true, wrote: 1, action: a };
  }
  // любой другой get/list — из snap или GAS read
  {
    const hit = await getSnapRaw_(env, a);
    if (hit) return hit;
    const proxied = await gasRead_(a, params, env);
    if (proxied) {
      try {
        await putSnap_(env, a, proxied);
      } catch (e) {}
      return proxied;
    }
  }
  return { status: "success", sandbox: true, action: a, empty: true };
}

function toBool_(v) {
  if (v === true || v === 1) return true;
  const s = String(v == null ? "" : v).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function normalizeMatchKey_(raw) {
  var s = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  var at = s.match(/@([A-Za-z0-9._]{2,})/);
  var handle = "";
  if (at) handle = at[1];
  else if (/^[A-Za-z0-9._]{3,}$/.test(s) && /[A-Za-z]/.test(s)) handle = s;
  if (handle) return handle.toUpperCase().replace(/[._]/g, "");
  return s.toUpperCase().replace(/Ё/g, "Е");
}

function parseBasket_(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw || "[]");
      return Array.isArray(j) ? j : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

function parseMeta_(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
}

function clientFromRow_(r) {
  const basket = parseBasket_(r.basket_json);
  const meta = parseMeta_(r.meta_json);
  const out = Object.assign({}, meta, {
    name: r.client,
    matchKey: r.match_key,
    address: r.address || meta.address || "",
    note: r.note || meta.note || "",
    phone: r.phone || meta.phone || "",
    basket: basket,
    segment: r.segment || meta.segment || "",
    source: r.source || meta.source || "",
    orderCount: Array.isArray(basket) ? basket.length : Number(meta.orderCount) || 0,
    updatedAt: r.updated_at,
    dateIso: r.date_iso || "",
    day: r.day_name || "",
    noCut: !!meta.noCut
  });
  return out;
}

async function ensureMetaColumn_(env) {
  if (!env || !env.DB || env.__metaColReady) return;
  try {
    await env.DB.prepare("ALTER TABLE orders ADD COLUMN meta_json TEXT DEFAULT '{}'").run();
  } catch (e) {
    /* already */
  }
  env.__metaColReady = true;
}

async function getSnapRaw_(env, key) {
  if (!env || !env.DB) return null;
  const q = await env.DB.prepare("SELECT payload FROM snap_cache WHERE cache_key = ?")
    .bind(key)
    .first();
  if (!q || !q.payload) return null;
  try {
    return JSON.parse(q.payload);
  } catch (e) {
    return null;
  }
}

async function putSnap_(env, key, payload) {
  if (!env || !env.DB || !payload) return;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at`
  )
    .bind(key, JSON.stringify(payload), now)
    .run();
}

async function delSnap_(env, key) {
  if (!env || !env.DB) return;
  await env.DB.prepare("DELETE FROM snap_cache WHERE cache_key = ?").bind(key).run();
}

async function getSnap_(env, key, fallback) {
  const hit = await getSnapRaw_(env, key);
  return hit || fallback;
}

function dmyToIso_(dmy) {
  const m = String(dmy || "")
    .trim()
    .match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return "";
  return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
}

function isoToDmy_(iso) {
  const m = String(iso || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return m[3] + "." + m[2] + "." + m[1];
}

async function dateMap_(env) {
  const mapWrap = await getSnapRaw_(env, "dateToDay");
  return (mapWrap && mapWrap.map) || mapWrap || {};
}

async function dayDateInfo_(env, day) {
  const counts = await getSnapRaw_(env, "weekDayCounts");
  const items = (counts && counts.items) || [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].day === day) {
      return { date: items[i].date || "", iso: dmyToIso_(items[i].date) };
    }
  }
  const map = await dateMap_(env);
  for (const iso of Object.keys(map)) {
    if (map[iso] === day) return { date: isoToDmy_(iso), iso: iso };
  }
  return { date: "", iso: "" };
}

async function findOrderRow_(env, matchKey, day, dateIso) {
  const mk = normalizeMatchKey_(matchKey);
  const mkLow = String(matchKey || "").trim().toLowerCase();
  if (day) {
    let row = await env.DB.prepare(
      "SELECT * FROM orders WHERE day_name = ? AND status = 'active' AND (match_key = ? OR match_key = ? OR lower(client) = ?) LIMIT 1"
    )
      .bind(day, mk, mkLow, mkLow)
      .first();
    if (row) return row;
  }
  if (dateIso) {
    let row = await env.DB.prepare(
      "SELECT * FROM orders WHERE date_iso = ? AND status = 'active' AND (match_key = ? OR match_key = ? OR lower(client) = ?) LIMIT 1"
    )
      .bind(dateIso, mk, mkLow, mkLow)
      .first();
    if (row) return row;
  }
  return env.DB.prepare(
    "SELECT * FROM orders WHERE status = 'active' AND (match_key = ? OR match_key = ? OR lower(client) = ?) LIMIT 1"
  )
    .bind(mk, mkLow, mkLow)
    .first();
}

async function getClients_(params, env) {
  await ensureMetaColumn_(env);
  const day = String(params.day || "");
  const dateIso = String(params.date || params.dateIso || "");
  if (!env || !env.DB) {
    return { status: "success", sandbox: true, day: day, source: "empty", clients: [] };
  }
  let rows = [];
  if (day) {
    const q = await env.DB.prepare(
      "SELECT * FROM orders WHERE day_name = ? AND status = 'active' ORDER BY client"
    )
      .bind(day)
      .all();
    rows = q.results || [];
  } else if (dateIso) {
    const q = await env.DB.prepare(
      "SELECT * FROM orders WHERE date_iso = ? AND status = 'active' ORDER BY client"
    )
      .bind(dateIso)
      .all();
    rows = q.results || [];
  }
  return {
    status: "success",
    sandbox: true,
    day: day,
    date: dateIso,
    source: "d1",
    clients: rows.map(clientFromRow_)
  };
}

async function getViewCompare_(params, env) {
  await ensureMetaColumn_(env);
  const day = String(params.day || "");
  const dateIso = String(params.date || "");
  let resolvedDay = day;
  if (!resolvedDay && dateIso) {
    const map = await dateMap_(env);
    if (map[dateIso]) resolvedDay = map[dateIso];
  }

  if (resolvedDay) {
    const live = await getClients_({ day: resolvedDay }, env);
    const info = await dayDateInfo_(env, resolvedDay);
    const iso = dateIso || info.iso;
    return {
      status: "success",
      day: resolvedDay,
      targetDay: resolvedDay,
      date: info.date || isoToDmy_(iso),
      dateIso: iso,
      dateNotInWeek: false,
      futureSlot: resolvedDay === "Будущая неделя",
      monthSheet: "D1",
      calendar: true,
      week: live.clients || [],
      month: (live.clients || []).slice(),
      sandbox: true,
      source: "d1"
    };
  }

  // вне недели — клиенты по date_iso
  if (dateIso) {
    const live = await getClients_({ date: dateIso }, env);
    return {
      status: "success",
      day: "",
      dateIso: dateIso,
      date: isoToDmy_(dateIso),
      dateNotInWeek: true,
      calendarOnly: true,
      week: [],
      month: live.clients || [],
      calendar: true,
      monthSheet: "D1",
      sandbox: true,
      source: "d1"
    };
  }

  return {
    status: "success",
    day: "",
    dateIso: "",
    dateNotInWeek: false,
    week: [],
    month: [],
    calendar: true,
    monthSheet: "D1",
    sandbox: true,
    source: "d1"
  };
}

async function rebuildWeekCounts_(env) {
  if (!env || !env.DB) return { status: "success", items: [], total: 0, sandbox: true };
  const prev = await getSnapRaw_(env, "weekDayCounts");
  const prevDates = {};
  ((prev && prev.items) || []).forEach(function (it) {
    if (it && it.day) prevDates[it.day] = it.date || "";
  });
  const map = await dateMap_(env);
  Object.keys(map).forEach(function (iso) {
    const d = map[iso];
    if (d && !prevDates[d]) prevDates[d] = isoToDmy_(iso);
  });

  const items = [];
  let total = 0;
  for (let i = 0; i < WEEK_DAYS.length; i++) {
    const d = WEEK_DAYS[i];
    const q = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM orders WHERE day_name = ? AND status = 'active'"
    )
      .bind(d)
      .first();
    const c = Number(q && q.c) || 0;
    total += c;
    items.push({ day: d, short: DAY_SHORT[d] || d, count: c, date: prevDates[d] || "" });
  }
  const body = { status: "success", items: items, total: total, sandbox: true, source: "d1" };
  await putSnap_(env, "weekDayCounts", body);
  return body;
}

async function rebuildMonthOverview_(env) {
  if (!env || !env.DB) return;
  const prev = await getSnapRaw_(env, "monthOverview");
  const month =
    (prev && prev.month) ||
    new Date().toISOString().slice(0, 7);
  const q = await env.DB.prepare(
    "SELECT date_iso, segment, COUNT(*) AS c FROM orders WHERE status = 'active' AND date_iso != '' GROUP BY date_iso, segment"
  ).all();
  const byDate = Object.create(null);
  (q.results || []).forEach(function (r) {
    const iso = r.date_iso;
    if (!iso || iso.slice(0, 7) !== month) return;
    if (!byDate[iso]) byDate[iso] = { dateIso: iso, count: 0, segments: {} };
    const c = Number(r.c) || 0;
    byDate[iso].count += c;
    const seg = r.segment || "";
    if (seg) byDate[iso].segments[seg] = (byDate[iso].segments[seg] || 0) + c;
  });
  const days = Object.keys(byDate)
    .sort()
    .map(function (k) {
      return byDate[k];
    });
  const body = { status: "success", month: month, days: days, sandbox: true, source: "d1" };
  await putSnap_(env, "monthOverview", body);
  await putSnap_(env, "monthOverview:" + month, body);
  return body;
}

async function rebuildCourierDay_(env, day) {
  if (!day) return;
  const live = await getClients_({ day: day }, env);
  const info = await dayDateInfo_(env, day);
  const prev = await getSnapRaw_(env, "courier:" + day);
  const prevBy = Object.create(null);
  ((prev && prev.clients) || []).forEach(function (c) {
    prevBy[normalizeMatchKey_(c.matchKey || c.name)] = c;
  });
  const clients = (live.clients || []).map(function (c) {
    const mk = normalizeMatchKey_(c.matchKey || c.name);
    const old = prevBy[mk] || {};
    return Object.assign({}, old, c, {
      delivered: !!old.delivered,
      assembled: !!old.assembled,
      paid: old.paid,
      col: old.col,
      courierCol: old.courierCol,
      deliveriesN: old.deliveriesN,
      askPaid: old.askPaid
    });
  });
  // merge deliveries table
  if (info.iso) {
    const dq = await env.DB.prepare("SELECT match_key, delivered FROM deliveries WHERE date_iso = ?")
      .bind(info.iso)
      .all();
    const flags = Object.create(null);
    (dq.results || []).forEach(function (r) {
      flags[normalizeMatchKey_(r.match_key)] = !!r.delivered;
    });
    clients.forEach(function (c) {
      const mk = normalizeMatchKey_(c.matchKey || c.name);
      if (mk in flags) c.delivered = !!flags[mk];
    });
  }
  await putSnap_(env, "courier:" + day, {
    status: "success",
    day: day,
    date: info.date,
    clients: clients,
    sandbox: true,
    source: "d1"
  });
}

async function rebuildAssemblyDay_(env, day) {
  if (!day) return;
  const live = await getClients_({ day: day }, env);
  const info = await dayDateInfo_(env, day);
  const prev = await getSnapRaw_(env, "assembly:" + day);
  const prevBy = Object.create(null);
  ((prev && prev.clients) || []).forEach(function (c) {
    prevBy[normalizeMatchKey_(c.matchKey || c.name)] = c;
  });
  const clients = (live.clients || []).map(function (c) {
    const mk = normalizeMatchKey_(c.matchKey || c.name);
    const old = prevBy[mk] || {};
    return Object.assign({}, old, {
      name: c.name,
      address: c.address,
      note: c.note,
      basket: c.basket,
      packs: old.packs || [],
      totalBags: old.totalBags || 0,
      craftBags: old.craftBags || 0,
      lightByFraction: old.lightByFraction || {},
      lightBagsByCounter: old.lightBagsByCounter || {},
      assembled: !!old.assembled,
      printed: !!old.printed,
      dogPart: old.dogPart || "",
      ownerName: old.ownerName || c.name,
      matchKey: c.matchKey
    });
  });
  await putSnap_(env, "assembly:" + day, {
    status: "success",
    day: day,
    date: info.date,
    clients: clients,
    typeTotals: (prev && prev.typeTotals) || {},
    counterTotals: (prev && prev.counterTotals) || {},
    lightByFraction: (prev && prev.lightByFraction) || {},
    lightGramsTotal: (prev && prev.lightGramsTotal) || 0,
    sandbox: true,
    source: "d1"
  });
}

async function invalidateDays_(env, days) {
  const uniq = [];
  (days || []).forEach(function (d) {
    if (d && uniq.indexOf(d) < 0) uniq.push(d);
  });
  for (let i = 0; i < uniq.length; i++) {
    const d = uniq[i];
    await delSnap_(env, "view:" + d);
    await rebuildCourierDay_(env, d);
    await rebuildAssemblyDay_(env, d);
  }
  await rebuildWeekCounts_(env);
  await rebuildMonthOverview_(env);
}

async function getMonthOverview_(params, env) {
  const month = String(params.month || "");
  // всегда пересобираем из orders — иначе после переносов врёт
  const body = await rebuildMonthOverview_(env);
  if (body && (!month || body.month === month)) return body;
  const hitM = month ? await getSnapRaw_(env, "monthOverview:" + month) : null;
  if (hitM) return hitM;
  return body || { status: "success", month: month, days: [], sandbox: true, source: "d1" };
}

function defaultBanner_(params) {
  return {
    status: "success",
    finished: false,
    pulled: false,
    refused: false,
    weekKey: params.weekKey || "",
    sandbox: true
  };
}

async function resolveDay_(params, env) {
  const iso = String(params.date || "");
  const map = await dateMap_(env);
  const dayName = map[iso] || "";
  if (dayName) {
    return { status: "success", date: iso, dayName: dayName, day: dayName, onWeek: true, sandbox: true };
  }
  return {
    status: "success",
    date: iso,
    dayName: "",
    day: "",
    onWeek: false,
    calendarOnly: true,
    sandbox: true
  };
}

async function getCourier_(params, env) {
  const day = String(params.day || "Понедельник");
  let hit = await getSnapRaw_(env, "courier:" + day);
  if (!hit) {
    await rebuildCourierDay_(env, day);
    hit = await getSnapRaw_(env, "courier:" + day);
  }
  return hit || { status: "success", clients: [], day: day, sandbox: true };
}

async function getAssembly_(params, env) {
  const day = String(params.day || "Понедельник");
  let hit = await getSnapRaw_(env, "assembly:" + day);
  if (!hit) {
    await rebuildAssemblyDay_(env, day);
    hit = await getSnapRaw_(env, "assembly:" + day);
  }
  return hit || { status: "success", clients: [], day: day, sandbox: true };
}

async function getCutting_(params, env) {
  const day = String(params.day || "Понедельник");
  const hit = await getSnapRaw_(env, "cutting:" + day);
  if (hit) return hit;
  return { status: "success", items: [], day: day, date: "", sandbox: true, session: {} };
}

async function upsertOrderRow_(env, row) {
  await ensureMetaColumn_(env);
  await env.DB.prepare(
    `INSERT INTO orders (id, date_iso, day_name, client, match_key, address, note, phone, basket_json, segment, source, status, updated_at, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       date_iso=excluded.date_iso, day_name=excluded.day_name, client=excluded.client,
       match_key=excluded.match_key, address=excluded.address, note=excluded.note, phone=excluded.phone,
       basket_json=excluded.basket_json, segment=excluded.segment, source=excluded.source,
       status=excluded.status, updated_at=excluded.updated_at, meta_json=excluded.meta_json`
  )
    .bind(
      row.id,
      row.date_iso || "",
      row.day_name || "",
      row.client,
      row.match_key,
      row.address || "",
      row.note || "",
      row.phone || "",
      row.basket_json || "[]",
      row.segment || "",
      row.source || "",
      row.status || "active",
      row.updated_at,
      row.meta_json || "{}"
    )
    .run();
}

async function saveOrder_(params, env, asBooking) {
  await ensureMetaColumn_(env);
  if (!env || !env.DB) return { status: "error", message: "no_d1" };
  const client = String(params.client || "").trim();
  if (!client) return { status: "error", message: "no_client" };

  let day = String(params.day || "").trim();
  let dateIso = String(params.date || params.dateIso || params.newDate || params.deliveryDate || "").trim();
  if (!day && dateIso) {
    const r = await resolveDay_({ date: dateIso }, env);
    if (r.onWeek && r.dayName) day = r.dayName;
  }
  if (!asBooking && !day) day = "Понедельник";
  if (asBooking && !day && !dateIso) {
    return { status: "error", message: "no_day_or_date" };
  }

  const matchKey = normalizeMatchKey_(params.matchKey || client);
  const now = new Date().toISOString();
  const id = (day || "CAL") + ":" + matchKey + (day ? "" : ":" + dateIso);
  const basketArr = parseBasket_(params.basket);
  const basket = JSON.stringify(basketArr);
  const meta = {
    orderPrice: params.orderPrice,
    ppSlot: params.ppSlot,
    ppHint: params.ppHint,
    ppPartner: params.ppPartner,
    deliveryAfter: params.deliveryAfter,
    deliveryBefore: params.deliveryBefore,
    dogCount: params.dogCount,
    geo: params.geo,
    noCut: toBool_(params.noCut),
    couponsQty: params.couponsQty,
    couponPrice: params.couponPrice
  };

  // soft-delete duplicates with other key forms
  await env.DB.prepare(
    "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND day_name = ? AND (match_key = ? OR lower(client) = ?) AND id != ?"
  )
    .bind(now, day || "", matchKey, client.toLowerCase(), id)
    .run();

  await upsertOrderRow_(env, {
    id: id,
    date_iso: dateIso || (day ? (await dayDateInfo_(env, day)).iso : ""),
    day_name: day || "",
    client: client,
    match_key: matchKey,
    address: String(params.address || ""),
    note: String(params.note || ""),
    phone: String(params.phone || ""),
    basket_json: basket,
    segment: String(params.segment || ""),
    source: String(params.source || ""),
    status: "active",
    updated_at: now,
    meta_json: JSON.stringify(meta)
  });

  await invalidateDays_(env, day ? [day] : []);
  return {
    status: "success",
    sandbox: true,
    wrote: basketArr.length || 1,
    basketLen: basketArr.length,
    weekWritten: !!day,
    id: id,
    updatedAt: now
  };
}

async function deleteClient_(params, env) {
  if (!env || !env.DB) return { status: "error", message: "no_d1" };
  const day = String(params.day || "");
  const dateIso = String(params.date || params.dateIso || "");
  const matchKey = normalizeMatchKey_(params.matchKey || params.client || "");
  if (!matchKey && !params.client) return { status: "error", message: "no_client" };
  const now = new Date().toISOString();
  const row = await findOrderRow_(env, params.matchKey || params.client, day, dateIso);
  if (!row) {
    return { status: "success", sandbox: true, wrote: 0, missing: true };
  }
  await env.DB.prepare("UPDATE orders SET status = 'deleted', updated_at = ? WHERE id = ?")
    .bind(now, row.id)
    .run();
  await invalidateDays_(env, [row.day_name, day].filter(Boolean));
  return { status: "success", sandbox: true, wrote: 1 };
}

async function moveClient_(params, env) {
  await ensureMetaColumn_(env);
  if (!env || !env.DB) return { status: "error", message: "no_d1" };
  const oldDay = String(params.oldDay || "");
  let newDay = String(params.newDay || "");
  const oldDate = String(params.oldDate || "");
  const newDate = String(params.newDate || "");
  const calendarOnly = toBool_(params.calendarOnly) || (!newDay && !!newDate);
  const client = String(params.client || "");
  const matchKeyRaw = params.matchKey || client;
  const matchKey = normalizeMatchKey_(matchKeyRaw);
  const now = new Date().toISOString();
  const cutRaw = String(params.cutRaw == null ? "1" : params.cutRaw);

  if (!newDay && newDate && !calendarOnly) {
    const r = await resolveDay_({ date: newDate }, env);
    if (r.onWeek && r.dayName) newDay = r.dayName;
  }

  const row = await findOrderRow_(env, matchKeyRaw, oldDay, oldDate);
  if (!row) {
    return { status: "error", message: "not_found", sandbox: true };
  }

  const meta = parseMeta_(row.meta_json);
  if (cutRaw === "0" || cutRaw === "no") meta.noCut = true;
  else if (cutRaw === "1" || cutRaw === "yes") meta.noCut = false;

  await env.DB.prepare("UPDATE orders SET status = 'deleted', updated_at = ? WHERE id = ?")
    .bind(now, row.id)
    .run();

  let toLabel = "(calendar)";
  if (newDay) {
    const info = await dayDateInfo_(env, newDay);
    const iso = newDate || info.iso || row.date_iso || "";
    const newId = newDay + ":" + matchKey;
    await upsertOrderRow_(env, {
      id: newId,
      date_iso: iso,
      day_name: newDay,
      client: row.client,
      match_key: matchKey,
      address: row.address || "",
      note: row.note || "",
      phone: row.phone || "",
      basket_json: row.basket_json || "[]",
      segment: row.segment || "",
      source: row.source || "",
      status: "active",
      updated_at: now,
      meta_json: JSON.stringify(meta)
    });
    toLabel = newDay;
  } else if (newDate) {
    // календарь вне недели
    const newId = "CAL:" + matchKey + ":" + newDate;
    await upsertOrderRow_(env, {
      id: newId,
      date_iso: newDate,
      day_name: "",
      client: row.client,
      match_key: matchKey,
      address: row.address || "",
      note: row.note || "",
      phone: row.phone || "",
      basket_json: row.basket_json || "[]",
      segment: row.segment || "",
      source: row.source || "",
      status: "active",
      updated_at: now,
      meta_json: JSON.stringify(meta)
    });
    toLabel = newDate;
  }

  await invalidateDays_(env, [oldDay || row.day_name, newDay].filter(Boolean));

  return {
    status: "success",
    sandbox: true,
    wrote: 1,
    local: false,
    from: oldDay || row.day_name,
    to: toLabel,
    newDate: newDate,
    calendarOnly: !newDay && !!newDate
  };
}

async function setDelivered_(params, env) {
  if (!env || !env.DB) return { status: "error", message: "no_d1" };
  const day = String(params.day || "");
  const client = String(params.client || "");
  const delivered = toBool_(params.delivered);
  const info = await dayDateInfo_(env, day);
  const iso = info.iso || String(params.date || "");
  const mk = normalizeMatchKey_(params.matchKey || client);
  const now = new Date().toISOString();
  if (iso) {
    await env.DB.prepare(
      `INSERT INTO deliveries (date_iso, match_key, delivered, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(date_iso, match_key) DO UPDATE SET delivered=excluded.delivered, updated_at=excluded.updated_at`
    )
      .bind(iso, mk, delivered ? 1 : 0, now)
      .run();
  }
  const snap = await getCourier_({ day: day }, env);
  (snap.clients || []).forEach(function (c) {
    if (normalizeMatchKey_(c.matchKey || c.name) === mk || c.name === client) {
      c.delivered = delivered;
    }
  });
  await putSnap_(env, "courier:" + day, snap);
  return { status: "success", sandbox: true, wrote: 1, delivered: delivered };
}

async function setAssemblyFlag_(params, env, flag) {
  const day = String(params.day || "");
  const client = String(params.client || "");
  const mk = normalizeMatchKey_(params.matchKey || client);
  const val = toBool_(params[flag] != null ? params[flag] : params.value);
  const snap = await getAssembly_({ day: day }, env);
  (snap.clients || []).forEach(function (c) {
    if (normalizeMatchKey_(c.matchKey || c.name) === mk || c.name === client) {
      c[flag] = val;
    }
  });
  await putSnap_(env, "assembly:" + day, snap);
  return { status: "success", sandbox: true, wrote: 1, [flag]: val };
}

async function updateCutting_(params, env) {
  const day = String(params.day || "");
  const rowNum = Number(params.row);
  const snap = await getCutting_({ day: day }, env);
  const items = snap.items || [];
  for (let i = 0; i < items.length; i++) {
    if (Number(items[i].row) === rowNum) {
      if (params.surplus != null && params.surplus !== "") items[i].surplus = Number(params.surplus) || 0;
      if (params.done != null && params.done !== "") items[i].done = toBool_(params.done);
      if (params.laid != null && params.laid !== "") items[i].laid = toBool_(params.laid);
      if (params.outNext != null && params.outNext !== "") items[i].outNext = toBool_(params.outNext);
      if (params.noteInfo != null) items[i].noteInfo = String(params.noteInfo);
      break;
    }
  }
  snap.items = items;
  snap.sandbox = true;
  await putSnap_(env, "cutting:" + day, snap);
  return { status: "success", sandbox: true, wrote: 1, day: day, row: rowNum };
}

const GAS_ORIGIN =
  "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec";

function unwrapGas_(text) {
  const s = String(text || "").trim();
  const m = s.match(/^[a-zA-Z_$][\w$]*\s*\(\s*([\s\S]*)\s*\)\s*;?\s*$/);
  return JSON.parse(m ? m[1] : s);
}

async function gasRead_(action, params, env) {
  try {
    const origin = (env && env.GAS_ORIGIN) || GAS_ORIGIN;
    const u = new URL(origin);
    u.searchParams.set("action", action);
    Object.keys(params || {}).forEach(function (k) {
      if (k === "action" || k === "callback" || k === "_" || params[k] == null || params[k] === "") return;
      // не прокидываем мутационные confirm в прокси-чтение
      if (k === "confirm" && String(params[k]) === "1" && /finish|materialize|closeAll/i.test(action)) return;
      u.searchParams.set(k, String(params[k]));
    });
    u.searchParams.set("callback", "cb");
    const res = await fetch(u.toString(), { redirect: "follow" });
    const text = await res.text();
    const json = unwrapGas_(text);
    if (json && typeof json === "object") json.sandboxProxy = true;
    return json;
  } catch (e) {
    return null;
  }
}

async function getSubscription_(params, env) {
  const nick = String(params.nick || "").trim();
  const segment = String(params.segment || "").trim();
  const list = await getSnapRaw_(env, "listSubscriptions");
  const arr = (list && (list.subscriptions || list.items || list.list)) || [];
  const nickKey = normalizeMatchKey_(nick);
  let found = null;
  for (let i = 0; i < arr.length; i++) {
    const it = arr[i];
    const n = normalizeMatchKey_(it.nick || it.name || "");
    if (n !== nickKey) continue;
    if (segment) {
      const seg = String(it.segment || it.sheet || it.kind || "").toUpperCase();
      const want = segment.toUpperCase();
      if (seg !== want && seg.indexOf(want) < 0) continue;
    }
    found = it;
    break;
  }
  if (!found) {
    return { status: "success", found: false, nick: nick, segment: segment, sandbox: true };
  }
  return Object.assign({}, found, {
    status: "success",
    found: true,
    nick: nick,
    segment: segment || found.sheet || "",
    subStatus: found.status,
    sandbox: true
  });
}

async function upsertSubscription_(params, env) {
  let list = (await getSnapRaw_(env, "listSubscriptions")) || {
    status: "success",
    subscriptions: [],
    sandbox: true
  };
  const arr = list.subscriptions || list.items || [];
  const nick = String(params.nick || params.client || "").trim();
  const mk = normalizeMatchKey_(nick);
  let idx = -1;
  for (let i = 0; i < arr.length; i++) {
    if (normalizeMatchKey_(arr[i].nick || arr[i].name) === mk) {
      idx = i;
      break;
    }
  }
  const row = Object.assign({}, idx >= 0 ? arr[idx] : {}, params, { nick: nick || (arr[idx] && arr[idx].nick) });
  delete row.action;
  if (idx >= 0) arr[idx] = row;
  else arr.push(row);
  list.subscriptions = arr;
  list.count = arr.length;
  list.status = "success";
  list.sandbox = true;
  await putSnap_(env, "listSubscriptions", list);
  return { status: "success", sandbox: true, wrote: 1, nick: nick };
}

async function deleteSubscription_(params, env) {
  let list = (await getSnapRaw_(env, "listSubscriptions")) || { status: "success", subscriptions: [] };
  let arr = list.subscriptions || list.items || [];
  const nicks = []
    .concat(params.nicks || [], params.nick ? [params.nick] : [], params.ids || [])
    .map(String);
  const keys = nicks.map(normalizeMatchKey_);
  const before = arr.length;
  arr = arr.filter(function (it) {
    const k = normalizeMatchKey_(it.nick || it.name || it.subId || it.id);
    return keys.indexOf(k) < 0;
  });
  list.subscriptions = arr;
  list.count = arr.length;
  list.sandbox = true;
  await putSnap_(env, "listSubscriptions", list);
  return { status: "success", sandbox: true, wrote: before - arr.length };
}

async function upsertInList_(env, snapKey, arrKey, params, idField) {
  let list = (await getSnapRaw_(env, snapKey)) || { status: "success" };
  const arr = list[arrKey] || list.items || list.list || [];
  list[arrKey] = arr;
  const id = String(params[idField] || params.id || params.nick || Date.now());
  let idx = -1;
  for (let i = 0; i < arr.length; i++) {
    if (String(arr[i][idField] || arr[i].id || arr[i].nick) === id) {
      idx = i;
      break;
    }
  }
  const row = Object.assign({}, idx >= 0 ? arr[idx] : {}, params);
  delete row.action;
  row[idField] = id;
  if (idx >= 0) arr[idx] = row;
  else arr.push(row);
  list.status = "success";
  list.count = arr.length;
  list.sandbox = true;
  await putSnap_(env, snapKey, list);
  return { status: "success", sandbox: true, wrote: 1, id: id };
}

async function deleteFromList_(env, snapKey, arrKey, params, idField) {
  let list = (await getSnapRaw_(env, snapKey)) || { status: "success" };
  let arr = list[arrKey] || list.items || list.list || [];
  const ids = [].concat(params.ids || [], params.id != null ? [params.id] : [], params.nicks || []).map(String);
  const before = arr.length;
  arr = arr.filter(function (it) {
    const id = String(it[idField] || it.id || it.nick || "");
    return ids.indexOf(id) < 0;
  });
  list[arrKey] = arr;
  list.items = arr;
  list.count = arr.length;
  list.sandbox = true;
  await putSnap_(env, snapKey, list);
  return { status: "success", sandbox: true, wrote: before - arr.length };
}

async function mutatePartners_(action, params, env) {
  let list = (await getSnapRaw_(env, "listPartners")) || { status: "success", partners: [] };
  let arr = list.partners || list.items || [];
  const id = String(params.id || params.nick || params.name || "");
  if (action === "deletePartner") {
    arr = arr.filter(function (p) {
      return String(p.id || p.nick || p.name) !== id;
    });
  } else {
    let idx = -1;
    for (let i = 0; i < arr.length; i++) {
      if (String(arr[i].id || arr[i].nick || arr[i].name) === id) {
        idx = i;
        break;
      }
    }
    const row = Object.assign({}, idx >= 0 ? arr[idx] : {}, params);
    delete row.action;
    if (idx >= 0) arr[idx] = row;
    else arr.push(row);
  }
  list.partners = arr;
  list.sandbox = true;
  await putSnap_(env, "listPartners", list);
  return { status: "success", sandbox: true, wrote: 1 };
}

async function mutateTemplates_(action, params, env) {
  const kind = params.kind ? "listTemplates:" + String(params.kind) : "listTemplates";
  if (action === "deleteTemplate") return deleteFromList_(env, kind, "items", params, "id");
  return upsertInList_(env, kind, "items", params, "id");
}

async function mutateAccess_(action, params, env) {
  let list = (await getSnapRaw_(env, "listAccess")) || { status: "success", people: [] };
  let people = list.people || [];
  const tid = String(params.telegramId || "");
  let idx = -1;
  for (let i = 0; i < people.length; i++) {
    if (String(people[i].telegramId) === tid) {
      idx = i;
      break;
    }
  }
  if (action === "requestAccess") {
    if (idx < 0) people.push({ telegramId: tid, name: params.name || "", role: "pending", status: "pending" });
  } else if (idx >= 0) {
    if (params.role != null) people[idx].role = params.role;
    if (params.timezone != null) people[idx].timezone = params.timezone;
  }
  list.people = people;
  list.sandbox = true;
  await putSnap_(env, "listAccess", list);
  return { status: "success", sandbox: true, wrote: 1 };
}

async function setWarehouseArrival_(params, env) {
  let wh = (await getSnapRaw_(env, "warehouse")) || { status: "success", items: [] };
  const items = wh.items || wh.rows || [];
  const row = Number(params.row);
  const qty = Number(params.qty) || 0;
  for (let i = 0; i < items.length; i++) {
    if (Number(items[i].row) === row) {
      items[i].arrival = qty;
      break;
    }
  }
  wh.items = items;
  wh.sandbox = true;
  await putSnap_(env, "warehouse", wh);
  return { status: "success", sandbox: true, wrote: 1 };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" }
  });
}
