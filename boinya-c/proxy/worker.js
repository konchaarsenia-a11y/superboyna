/**
 * Бойня C — Worker + D1.
 * По умолчанию: sandbox (D1, Sheets не пишет).
 * Cutover live: ?cutover=1 / mode=live → прокси в боевой GAS (чтение+запись).
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
  async fetch(request, env, ctx) {
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
        cutover: "cutover=1 → D1 fast read + GAS write/revalidate",
        d1: !!(env && env.DB),
        tip: "?action=getClients&day=Понедельник&cutover=1"
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
      const result = await handleAction_(act, params, env, url, ctx);
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

function isCutoverLive_(params, env, url) {
  if (env && (env.CUTOVER === "1" || env.CUTOVER === "true")) return true;
  const p = params || {};
  // UI/JSON иногда шлёт число 1, не строку "1"
  if (p.cutover === "1" || p.cutover === "true" || p.cutover === 1 || p.cutover === true) return true;
  if (p.mode === "live") return true;
  try {
    if (url && url.searchParams.get("cutover") === "1") return true;
  } catch (e) {}
  return false;
}

function isWriteAction_(a) {
  if (!a) return false;
  // явные чтения / списки — не write (даже если имя начинается с partner*)
  if (/^(get|list|resolve|calc|suggest|lookup|ping|keepWarm|warehousePreview)/i.test(a)) return false;
  if (
    a === "getMyAccess" ||
    a === "telegramStatus" ||
    a === "weekPullStatus" ||
    a === "partnerListAdmin" ||
    a === "composeWarehouseBuyMessage"
  ) {
    return false;
  }
  return /^(save|delete|move|update|finish|cancel|enroll|set|close|pull|materialize|start|stop|ensure|scrub|request|setup|create|add|remove|toggle|mark|send|prepare|register|upsert|sync|notify|compose|repair|report|log|partner|force)/i.test(
    a
  );
}

async function handleAction_(action, params, env, url, ctx) {
  const a = String(action || "");
  const live = isCutoverLive_(params, env, url);

  if (a === "ping" || a === "keepWarm") {
    return {
      status: "success",
      sandbox: !live,
      cutover: !!live,
      live: !!live,
      swr: !!live,
      d1: !!(env && env.DB)
    };
  }

  // ——— CUTOVER: чтение из D1 сразу + фон GAS; запись → GAS ———
  if (live) {
    return handleCutover_(a, params, env, ctx);
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
  // маппинг дата→слот листа: не брать overlay календаря (иначе 17.08 = «Пн» листа 07.09)
  let counts = await getSnapRaw_(env, "weekDayCountsSheet");
  if (!counts || !Array.isArray(counts.items) || !counts.items.length) {
    counts = await getSnapRaw_(env, "weekDayCounts");
    if (counts && counts.fromCalendar) counts = null;
  }
  const map = Object.create(null);
  ((counts && counts.items) || []).forEach(function (it) {
    const iso = dmyToIso_(it && it.date);
    if (iso && it.day) map[iso] = it.day;
  });
  if (Object.keys(map).length) return map;
  const mapWrap = await getSnapRaw_(env, "dateToDay");
  return (mapWrap && mapWrap.map) || mapWrap || {};
}

async function dayDateInfo_(env, day) {
  let counts = await getSnapRaw_(env, "weekDayCounts");
  if (counts && counts.fromCalendar) {
    const sheet = await getSnapRaw_(env, "weekDayCountsSheet");
    if (sheet && Array.isArray(sheet.items)) counts = sheet;
  }
  const items = (counts && counts.items) || [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].day === day) {
      return { date: items[i].date || "", iso: dmyToIso_(items[i].date) };
    }
  }
  // дата из живых orders этого дня
  if (env && env.DB && day) {
    const row = await env.DB.prepare(
      "SELECT date_iso FROM orders WHERE day_name = ? AND status = 'active' AND date_iso != '' LIMIT 1"
    )
      .bind(day)
      .first();
    if (row && row.date_iso) return { date: isoToDmy_(row.date_iso), iso: row.date_iso };
  }
  return { date: "", iso: "" };
}

function dayForDateFromCounts_(counts, dateIso) {
  const items = (counts && counts.items) || [];
  for (let i = 0; i < items.length; i++) {
    if (dmyToIso_(items[i].date) === dateIso) return String(items[i].day || "");
  }
  return "";
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
  const dateIsoParam = String(params.date || params.dateIso || "");
  if (!env || !env.DB) {
    return { status: "success", sandbox: true, day: day, source: "empty", clients: [] };
  }
  let rows = [];
  let dateIso = dateIsoParam;
  let dateDmy = "";
  if (day) {
    const info = await dayDateInfo_(env, day);
    if (!dateIso && info && info.iso) dateIso = info.iso;
    if (info && info.date) dateDmy = info.date;
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
  if (!dateDmy && dateIso) dateDmy = isoToDmy_(dateIso);
  return {
    status: "success",
    sandbox: true,
    day: day,
    date: dateDmy || "",
    dateIso: dateIso || "",
    source: "d1",
    clients: rows.map(clientFromRow_)
  };
}

async function getViewCompare_(params, env) {
  await ensureMetaColumn_(env);
  const day = String(params.day || "");
  const dateIso = String(params.date || "");
  let counts = await getSnapRaw_(env, "weekDayCounts");
  if (counts && counts.fromCalendar) {
    const sheet = await getSnapRaw_(env, "weekDayCountsSheet");
    if (sheet && Array.isArray(sheet.items)) counts = sheet;
  }

  // date → день ТОЛЬКО через актуальные weekDayCounts (не протухший dateToDay)
  let resolvedDay = "";
  let onWeek = false;
  if (dateIso) {
    const byCounts = dayForDateFromCounts_(counts, dateIso);
    if (byCounts) {
      resolvedDay = byCounts;
      onWeek = true;
    } else if (day) {
      // явный day + дата не из текущей недели → если day выбран в UI с пустой датой не сюда;
      // при клике календаря day пустой. Если оба и дата чужая — календарь.
      resolvedDay = "";
      onWeek = false;
    }
  } else if (day) {
    resolvedDay = day;
    onWeek = true;
  }

  // Неделя: snap + live orders
  if (resolvedDay && onWeek) {
    const snap = await getSnapRaw_(env, "view:" + resolvedDay);
    const live = await getClients_({ day: resolvedDay }, env);
    const info = await dayDateInfo_(env, resolvedDay);
    const iso = info.iso || (snap && snap.dateIso) || dateIso || "";
    // если спросили конкретную дату и у дня другая — это не этот слот
    if (dateIso && iso && dateIso !== iso) {
      // fall through to calendar-only for dateIso
    } else {
      const week =
        live.clients && live.clients.length
          ? live.clients
          : snap && Array.isArray(snap.week)
            ? snap.week
            : [];
      const weekKeys = Object.create(null);
      (week || []).forEach(function (c) {
        weekKeys[normalizeMatchKey_(c.matchKey || c.name)] = true;
      });
      let month = snap && Array.isArray(snap.month) ? snap.month.slice() : [];
      month = month.filter(function (c) {
        return !weekKeys[normalizeMatchKey_(c.matchKey || c.name)];
      });
      return {
        status: "success",
        day: resolvedDay,
        targetDay: resolvedDay,
        date: info.date || (snap && snap.date) || isoToDmy_(iso),
        dateIso: iso,
        dateNotInWeek: false,
        futureSlot: resolvedDay === "Будущая неделя",
        monthSheet: (snap && snap.monthSheet) || "D1",
        calendar: true,
        week: week || [],
        month: month,
        sandbox: true,
        source: snap ? "d1+snap" : "d1",
        fromSnap: !!snap
      };
    }
  }

  // вне недели — snap по дате / orders по date_iso
  if (dateIso) {
    const byDate = await getSnapRaw_(env, "viewDate:" + dateIso);
    if (byDate && byDate.status === "success") {
      const month = Array.isArray(byDate.month)
        ? byDate.month
        : Array.isArray(byDate.week)
          ? byDate.week
          : [];
      return {
        status: "success",
        day: "",
        dateIso: dateIso,
        date: byDate.date || isoToDmy_(dateIso),
        dateNotInWeek: true,
        calendarOnly: true,
        week: [],
        month: month,
        calendar: true,
        monthSheet: byDate.monthSheet || "Календарь_Дат",
        sandbox: true,
        source: "snap",
        fromSnap: true
      };
    }
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

  // только day без date (и без week counts hit выше — на всякий)
  if (day) {
    const live = await getClients_({ day: day }, env);
    const info = await dayDateInfo_(env, day);
    return {
      status: "success",
      day: day,
      targetDay: day,
      date: info.date || "",
      dateIso: info.iso || "",
      dateNotInWeek: false,
      futureSlot: day === "Будущая неделя",
      monthSheet: "D1",
      calendar: true,
      week: live.clients || [],
      month: [],
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

  const items = [];
  let total = 0;
  const dateToDay = Object.create(null);
  for (let i = 0; i < WEEK_DAYS.length; i++) {
    const d = WEEK_DAYS[i];
    const q = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM orders WHERE day_name = ? AND status = 'active'"
    )
      .bind(d)
      .first();
    const c = Number(q && q.c) || 0;
    total += c;
    // дата — из живых orders, иначе из предыдущего counts (не из протухшего dateToDay)
    let date = "";
    const dr = await env.DB.prepare(
      "SELECT date_iso, COUNT(*) AS n FROM orders WHERE day_name = ? AND status = 'active' AND date_iso != '' GROUP BY date_iso ORDER BY n DESC LIMIT 1"
    )
      .bind(d)
      .first();
    if (dr && dr.date_iso) date = isoToDmy_(dr.date_iso);
    if (!date) date = prevDates[d] || "";
    const iso = dmyToIso_(date);
    if (iso) dateToDay[iso] = d;
    items.push({ day: d, short: DAY_SHORT[d] || d, count: c, date: date });
  }
  const body = { status: "success", items: items, total: total, sandbox: true, source: "d1" };
  await putSnap_(env, "weekDayCounts", body);
  await putSnap_(env, "dateToDay", { map: dateToDay });
  return body;
}

async function overlayWeekSheetCountsOnMonth_(env, body) {
  if (!body || typeof body !== "object") return body;
  let counts = null;
  try {
    counts = await getSnapRaw_(env, "weekDayCounts");
  } catch (e0) {
    counts = null;
  }
  if (!counts || !Array.isArray(counts.items) || !counts.items.length) {
    try {
      counts = await rebuildWeekCounts_(env);
    } catch (e1) {
      counts = null;
    }
  }
  const weekMap = Object.create(null);
  ((counts && counts.items) || []).forEach(function (it) {
    if (!it) return;
    const iso = dmyToIso_(it.date);
    if (!iso) return;
    weekMap[iso] = Number(it.count) || 0;
  });
  if (!Object.keys(weekMap).length) return body;

  const byIso = Object.create(null);
  ((body.days || []) || []).forEach(function (d) {
    if (!d || !d.dateIso) return;
    byIso[d.dateIso] = {
      dateIso: d.dateIso,
      count: Number(d.count) || 0,
      segments: d.segments || {},
      fromWeekSheet: !!d.fromWeekSheet
    };
  });
  const bodyMonth = String(body.month || "").slice(0, 7);
  Object.keys(weekMap).forEach(function (iso) {
    // не вклеивать «Приём» 07.09 в обзор августа — лист уехал вперёд
    if (bodyMonth && String(iso).slice(0, 7) !== bodyMonth) return;
    if (!byIso[iso]) {
      byIso[iso] = {
        dateIso: iso,
        count: weekMap[iso],
        segments: {},
        fromWeekSheet: true
      };
    } else {
      byIso[iso].count = weekMap[iso];
      byIso[iso].fromWeekSheet = true;
    }
  });
  const days = Object.keys(byIso)
    .sort()
    .map(function (k) {
      return byIso[k];
    });
  const total = days.reduce(function (s, d) {
    return s + (Number(d.count) || 0);
  }, 0);
  body.days = days;
  body.total = total;
  body.weekOverlay = true;
  return body;
}

function minkTodayIso_() {
  const t = Date.now() + 3 * 3600 * 1000;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1);
  const day = String(d.getUTCDate());
  return y + "-" + (m.length < 2 ? "0" + m : m) + "-" + (day.length < 2 ? "0" + day : day);
}

function isoAddDays_(iso, n) {
  const p = String(iso || "").split("-");
  if (p.length !== 3) return "";
  const dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + Number(n || 0)));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1);
  const d = String(dt.getUTCDate());
  return y + "-" + (m.length < 2 ? "0" + m : m) + "-" + (d.length < 2 ? "0" + d : d);
}

function currentMondayIso_() {
  const iso = minkTodayIso_();
  const p = iso.split("-");
  const dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  const wd = dt.getUTCDay();
  const back = wd === 0 ? 6 : wd - 1;
  return isoAddDays_(iso, -back);
}

function daysBetweenIso_(a, b) {
  const pa = String(a || "").split("-");
  const pb = String(b || "").split("-");
  if (pa.length !== 3 || pb.length !== 3) return 0;
  const da = Date.UTC(Number(pa[0]), Number(pa[1]) - 1, Number(pa[2]));
  const db = Date.UTC(Number(pb[0]), Number(pb[1]) - 1, Number(pb[2]));
  return Math.round((db - da) / 86400000);
}

function mondayDmyFromCounts_(counts) {
  const items = (counts && counts.items) || [];
  for (let i = 0; i < items.length; i++) {
    if (items[i] && String(items[i].day) === "Понедельник") return String(items[i].date || "");
  }
  return "";
}

function isWeekSkewed_(counts) {
  const dmy = (counts && counts.sheetMonday) || mondayDmyFromCounts_(counts);
  const iso = dmyToIso_(dmy);
  if (!iso) return false;
  return Math.abs(daysBetweenIso_(iso, currentMondayIso_())) > 10;
}

function calendarIsoForDay_(dayName, mondayIso) {
  const raw = String(dayName || "").trim();
  let idx = WEEK_DAYS.indexOf(raw);
  if (idx < 0) {
    const shorts = { Пн: 0, Вт: 1, Ср: 2, Чт: 3, Пт: 4, Сб: 5, Вс: 6, Буд: 7 };
    if (shorts[raw] != null) idx = shorts[raw];
  }
  if (idx < 0) return "";
  return isoAddDays_(mondayIso, idx === 7 ? 7 : idx);
}

function uniqPeople_(list) {
  const seen = Object.create(null);
  const out = [];
  (list || []).forEach(function (c) {
    if (!c) return;
    const mk = normalizeMatchKey_(c.matchKey || c.name || c.client || c.nick);
    if (!mk || seen[mk]) return;
    seen[mk] = true;
    out.push(c);
  });
  return out;
}

function peopleFromViewPayload_(payload) {
  return uniqPeople_(
    [].concat(Array.isArray(payload && payload.week) ? payload.week : []).concat(
      Array.isArray(payload && payload.month) ? payload.month : []
    )
  );
}

async function fetchCalendarPeople_(env, dateIso, dateDmy) {
  if (dateIso) {
    try {
      const snap = await getSnapRaw_(env, "viewDate:" + dateIso);
      const people = peopleFromViewPayload_(snap);
      if (people.length) return people;
    } catch (e0) {}
  }
  try {
    const live = await gasProxy_(
      "getViewCompare",
      { date: dateDmy || isoToDmy_(dateIso), dateIso: dateIso },
      env,
      { write: false }
    );
    if (live && live.status === "success") {
      try {
        await cutoverStoreRead_(
          "getViewCompare",
          { date: dateDmy || isoToDmy_(dateIso), dateIso: dateIso },
          env,
          live
        );
      } catch (eS) {}
      return peopleFromViewPayload_(live);
    }
  } catch (e1) {}
  return [];
}

function calendarPersonToClient_(c, day, dateDmy, dateIso) {
  const name = String((c && (c.name || c.client || c.nick)) || "").trim();
  const note = String((c && c.note) || "");
  return {
    name: name,
    matchKey: String((c && c.matchKey) || name),
    address: (c && c.address) || "",
    note: note,
    phone: (c && c.phone) || "",
    basket: Array.isArray(c && c.basket) ? c.basket : [],
    segment: (c && c.segment) || "",
    source: (c && c.source) || "calendar",
    orderPrice: c && c.orderPrice != null ? c.orderPrice : "",
    ppSlot: (c && c.ppSlot) || "",
    ppHint: (c && c.ppHint) || "",
    ppPartner: (c && c.ppPartner) || "",
    dogCount: Number(c && c.dogCount) || 1,
    noCut: !!(c && c.noCut) || /\[НЕ\s*РЕЗАТЬ\]/i.test(note),
    geo: (c && c.geo) || null,
    delivered: false,
    assembled: false,
    dateIso: dateIso,
    day: day,
    date: dateDmy
  };
}

function isPieceSku_(name, cat, unit) {
  if (String(unit || "").toLowerCase().indexOf("шт") >= 0) return true;
  const c = String(cat || "").toLowerCase();
  if (c === "chew" || c === "chews") return true;
  const n = String(name || "");
  if (/шт/i.test(n)) return true;
  if (/УХО|УШК|КОРЕН|ХРЯЩ|КОПЫТ|НОСЫ|НОС\b|ШЕИ|ШЕЯ|ГУБЫ|АОРТ|ТРАХЕ|ЛОПАТ/i.test(n)) return true;
  return false;
}

function cuttingItemsFromPeople_(people, warehouseItems) {
  const coefByName = Object.create(null);
  const rowByName = Object.create(null);
  (warehouseItems || []).forEach(function (w) {
    const nm = String((w && w.name) || "").trim().toUpperCase();
    if (!nm) return;
    coefByName[nm] = Number(w.coef) || 0.2;
    if (w.row != null) rowByName[nm] = Number(w.row);
  });
  const acc = Object.create(null);
  (people || []).forEach(function (p) {
    if (p && (p.noCut || /\[НЕ\s*РЕЗАТЬ\]/i.test(String(p.note || "")))) return;
    (p.basket || []).forEach(function (it) {
      const name = String((it && (it.main || it.name)) || "").trim();
      if (!name) return;
      const val = Number(it.value != null ? it.value : it.val) || 0;
      if (!(val > 0)) return;
      const key = name.toUpperCase();
      if (!acc[key]) {
        acc[key] = {
          name: name,
          dry: 0,
          cat: it.cat || "",
          unitHint: it.unit || ""
        };
      }
      acc[key].dry += val;
    });
  });
  const items = [];
  Object.keys(acc)
    .sort()
    .forEach(function (k, i) {
      const it = acc[k];
      const piece = isPieceSku_(it.name, it.cat, it.unitHint);
      const coef = coefByName[k] || 0.2;
      const raw = piece ? it.dry : it.dry / 1000 / (coef || 0.2);
      items.push({
        row: rowByName[k] || 200 + i,
        name: it.name,
        dry: Math.round(it.dry * 100) / 100,
        unit: piece ? "шт" : "гр",
        raw: Math.round(raw * 100) / 100,
        surplus: 0,
        done: false,
        laid: false,
        outNext: false,
        fromCalendar: true
      });
    });
  return items;
}

async function calendarWeekPlan_(env, sheetCounts) {
  const mondayIso = currentMondayIso_();
  const sheetMonday = String((sheetCounts && sheetCounts.sheetMonday) || mondayDmyFromCounts_(sheetCounts) || "");
  let byIso = Object.create(null);
  try {
    const month = mondayIso.slice(0, 7);
    let ov = await getSnapRaw_(env, "monthOverview:" + month);
    if (!ov || !Array.isArray(ov.days)) ov = await getSnapRaw_(env, "monthOverview");
    ((ov && ov.days) || []).forEach(function (d) {
      if (d && d.dateIso && !d.fromWeekSheet) byIso[d.dateIso] = Number(d.count) || 0;
    });
  } catch (eO) {}
  const items = WEEK_DAYS.map(function (day, i) {
    const iso = isoAddDays_(mondayIso, i === 7 ? 7 : i);
    return {
      day: day,
      short: DAY_SHORT[day],
      count: byIso[iso] != null ? byIso[iso] : 0,
      date: isoToDmy_(iso),
      dateIso: iso
    };
  });
  const total = items.reduce(function (s, it) {
    return s + (Number(it.count) || 0);
  }, 0);
  return {
    status: "success",
    items: items,
    total: total,
    fromCalendar: true,
    calendarMonday: isoToDmy_(mondayIso),
    sheetMonday: sheetMonday,
    cutover: true,
    sandbox: false
  };
}

async function applyCalendarWeekIfSkewed_(a, params, env, sheetCounts) {
  if (!isWeekSkewed_(sheetCounts)) return null;
  const mondayIso = currentMondayIso_();
  if (a === "getWeekDayCounts") {
    const plan = await calendarWeekPlan_(env, sheetCounts);
    try {
      await putSnap_(env, "weekDayCounts", plan);
    } catch (eP) {}
    return plan;
  }
  const day = String((params && params.day) || "");
  if (!day) return null;
  const iso = calendarIsoForDay_(day, mondayIso);
  const dmy = isoToDmy_(iso);
  if (!iso) return null;
  const people = await fetchCalendarPeople_(env, iso, dmy);
  const clients = people.map(function (c) {
    return calendarPersonToClient_(c, day, dmy, iso);
  });
  const sheetMonday = String((sheetCounts && sheetCounts.sheetMonday) || mondayDmyFromCounts_(sheetCounts) || "");
  if (a === "getClients") {
    return {
      status: "success",
      day: day,
      date: dmy,
      dateIso: iso,
      clients: clients,
      fromCalendar: true,
      calendarMonday: isoToDmy_(mondayIso),
      sheetMonday: sheetMonday,
      cutover: true,
      sandbox: false,
      source: "calendar"
    };
  }
  if (a === "getCourier" || a === "getAssembly") {
    return {
      status: "success",
      day: day,
      date: dmy,
      dateIso: iso,
      clients: clients,
      fromCalendar: true,
      calendarMonday: isoToDmy_(mondayIso),
      sheetMonday: sheetMonday,
      cutover: true,
      sandbox: false
    };
  }
  if (a === "getCutting") {
    let wh = [];
    try {
      const wsnap = await getSnapRaw_(env, "warehouse");
      wh = (wsnap && (wsnap.items || wsnap.rows)) || [];
    } catch (eW) {}
    let items = [];
    try {
      items = cuttingItemsFromPeople_(clients, wh);
    } catch (eCut) {
      items = [];
    }
    return {
      status: "success",
      day: day,
      date: dmy,
      dateIso: iso,
      items: items,
      session: {},
      fromCalendar: true,
      calendarMonday: isoToDmy_(mondayIso),
      sheetMonday: sheetMonday,
      cutover: true,
      sandbox: false
    };
  }
  return null;
}

/** Уникальные люди из ответа Просмотра (week+month). */
function countPeopleFromViewPayload_(payload) {
  const seen = Object.create(null);
  const segments = { "ПП": 0, "БП": 0, "Р": 0, "ПАРТНЁР": 0, other: 0 };
  const lists = []
    .concat(Array.isArray(payload && payload.week) ? payload.week : [])
    .concat(Array.isArray(payload && payload.month) ? payload.month : []);
  let n = 0;
  lists.forEach(function (c) {
    if (!c) return;
    const mk = normalizeMatchKey_(c.matchKey || c.name || c.client || c.nick);
    if (!mk || seen[mk]) return;
    seen[mk] = true;
    n++;
    const seg = String(c.segment || c.source || "").trim().toUpperCase();
    if (seg === "ПП" || seg === "PP" || seg === "АФК" || seg === "AFK") segments["ПП"]++;
    else if (seg === "БП" || seg === "BP") segments["БП"]++;
    else if (seg === "Р" || seg === "R" || seg === "RETAIL" || seg === "РОЗНИЦА") segments["Р"]++;
    else if (seg.indexOf("ПАРТ") === 0 || seg === "PARTNER" || seg === "ВАРКА") segments["ПАРТНЁР"]++;
    else if (/partner/i.test(String(c.source || ""))) segments["ПАРТНЁР"]++;
    else segments.other++;
  });
  return { count: n, segments: segments };
}

/** Бейдж дня = фактический список Просмотра, не сырой Календарь_Дат. */
async function patchMonthOverviewDayFromView_(env, iso, payload) {
  if (!env || !env.DB || !iso) return;
  const tallied = countPeopleFromViewPayload_(payload);
  const month = String(iso).slice(0, 7);
  const keys = ["monthOverview:" + month, "monthOverview"];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    let body = await getSnapRaw_(env, key);
    if (!body || !Array.isArray(body.days)) {
      if (key === "monthOverview:" + month) {
        body = { status: "success", month: month, days: [], total: 0 };
      } else {
        continue;
      }
    }
    let found = false;
    body.days = (body.days || []).map(function (d) {
      if (!d || d.dateIso !== iso) return d;
      found = true;
      return Object.assign({}, d, {
        count: tallied.count,
        segments: tallied.segments,
        fromView: true
      });
    });
    if (!found) {
      body.days.push({
        dateIso: iso,
        count: tallied.count,
        segments: tallied.segments,
        fromView: true
      });
      body.days.sort(function (a, b) {
        return String(a.dateIso).localeCompare(String(b.dateIso));
      });
    }
    body.total = body.days.reduce(function (s, d) {
      return s + (Number(d.count) || 0);
    }, 0);
    body.month = body.month || month;
    body.status = "success";
    await putSnap_(env, key, body);
  }
}

/** Подтянуть бейджи из уже открытых viewDate:* (иначе 9 на календаре / 6 в дне). */
async function reconcileMonthOverviewWithViewSnaps_(env, body) {
  if (!body || !env || !env.DB) return body;
  const month = String(body.month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return body;
  try {
    const q = await env.DB.prepare(
      "SELECT cache_key, payload FROM snap_cache WHERE cache_key LIKE ?"
    )
      .bind("viewDate:" + month + "-%")
      .all();
    const byIso = Object.create(null);
    ((body.days || []) || []).forEach(function (d) {
      if (d && d.dateIso) byIso[d.dateIso] = Object.assign({}, d);
    });
    (q.results || []).forEach(function (row) {
      const key = String(row.cache_key || "");
      const iso = key.indexOf("viewDate:") === 0 ? key.slice(9) : "";
      if (!iso) return;
      let payload = null;
      try {
        payload = JSON.parse(row.payload || "{}");
      } catch (eP) {
        return;
      }
      // week-sheet дни не трогаем (fromWeekSheet) — там источник Приём
      if (byIso[iso] && byIso[iso].fromWeekSheet) return;
      const tallied = countPeopleFromViewPayload_(payload);
      byIso[iso] = {
        dateIso: iso,
        count: tallied.count,
        segments: tallied.segments,
        fromView: true
      };
    });
    body.days = Object.keys(byIso)
      .sort()
      .map(function (k) {
        return byIso[k];
      });
    body.total = body.days.reduce(function (s, d) {
      return s + (Number(d.count) || 0);
    }, 0);
    body.viewReconcile = true;
  } catch (eR) {}
  return body;
}

async function cutoverGetMonthOverview_(params, env, ctx) {
  const month = String((params && params.month) || "").trim();
  const force =
    String((params && params.force) || "") === "1" ||
    (params && (params.force === true || params.force === 1));

  async function fromGas_() {
    const live = await gasProxy_("getMonthOverview", params || {}, env, { write: false });
    if (live && live.status === "success" && env && env.DB) {
      try {
        let body = Object.assign({}, live, { cachedAt: new Date().toISOString() });
        body = await overlayWeekSheetCountsOnMonth_(env, body);
        body = await reconcileMonthOverviewWithViewSnaps_(env, body);
        await putSnap_(env, "monthOverview", body);
        if (body.month) await putSnap_(env, "monthOverview:" + body.month, body);
        live.cutover = true;
        live.fromGas = true;
        live.sandbox = false;
        live.days = body.days;
        live.total = body.total;
        live.weekOverlay = body.weekOverlay;
        live.viewReconcile = body.viewReconcile;
        return live;
      } catch (eS) {}
    }
    if (live && typeof live === "object") {
      live.cutover = true;
      live.fromGas = true;
    }
    return live;
  }

  if (force) {
    return (await fromGas_()) || { status: "error", message: "gas_proxy_failed", cutover: true };
  }

  let body = await getMonthOverview_(params, env);
  body = await reconcileMonthOverviewWithViewSnaps_(env, body);
  if (body && body.status === "success" && Array.isArray(body.days) && body.days.length) {
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(
        (async function () {
          try {
            await fromGas_();
          } catch (eR) {}
        })()
      );
    }
    body.cutover = true;
    body.swr = true;
    body.fromGas = false;
    body.sandbox = false;
    return body;
  }
  return (await fromGas_()) || { status: "success", month: month, days: [], total: 0, cutover: true };
}

async function rebuildMonthOverview_(env) {
  if (!env || !env.DB) return { status: "success", month: "", days: [], total: 0, sandbox: true };
  const prev = await getSnapRaw_(env, "monthOverview");
  const month =
    (prev && prev.month) ||
    new Date().toISOString().slice(0, 7);
  const q = await env.DB.prepare(
    "SELECT date_iso, segment, COUNT(*) AS c FROM orders WHERE status = 'active' AND date_iso != '' GROUP BY date_iso, segment"
  ).all();
  const byDate = Object.create(null);
  // стартуем с полного календарного snap (GAS), иначе пропадут даты вне недели
  ((prev && prev.days) || []).forEach(function (d) {
    if (!d || !d.dateIso) return;
    if (String(d.dateIso).slice(0, 7) !== month) return;
    byDate[d.dateIso] = {
      dateIso: d.dateIso,
      count: Number(d.count) || 0,
      segments: d.segments || {}
    };
  });
  const orderByDate = Object.create(null);
  (q.results || []).forEach(function (r) {
    const iso = r.date_iso;
    if (!iso || iso.slice(0, 7) !== month) return;
    if (!orderByDate[iso]) orderByDate[iso] = { count: 0, segments: {} };
    const c = Number(r.c) || 0;
    orderByDate[iso].count += c;
    const seg = r.segment || "";
    if (seg) orderByDate[iso].segments[seg] = (orderByDate[iso].segments[seg] || 0) + c;
  });
  Object.keys(orderByDate).forEach(function (iso) {
    const o = orderByDate[iso];
    if (!byDate[iso]) {
      byDate[iso] = { dateIso: iso, count: o.count, segments: o.segments };
      return;
    }
    // вне недели: max(calendar snap, D1). Даты недели перебьёт overlayWeekSheetCountsOnMonth_
    if (o.count >= (Number(byDate[iso].count) || 0)) {
      byDate[iso].count = o.count;
      byDate[iso].segments = o.segments;
    }
  });
  const days = Object.keys(byDate)
    .sort()
    .map(function (k) {
      return byDate[k];
    });
  const total = days.reduce(function (s, d) {
    return s + (Number(d.count) || 0);
  }, 0);
  let body = {
    status: "success",
    month: month,
    days: days,
    total: total,
    sandbox: true,
    source: prev && prev.days && prev.days.length > days.length ? "d1+snap" : "d1"
  };
  body = await overlayWeekSheetCountsOnMonth_(env, body);
  // не затираем более полный GAS-snap урезанной сборкой из orders
  const prevN = (prev && prev.days && prev.days.length) || 0;
  if ((body.days && body.days.length) >= prevN || prevN === 0) {
    await putSnap_(env, "monthOverview", body);
    await putSnap_(env, "monthOverview:" + month, body);
  }
  return body;
}

async function rebuildCourierDay_(env, day) {
  if (!day) return;
  const live = await getClients_({ day: day }, env);
  const info = await dayDateInfo_(env, day);
  const prev = await getSnapRaw_(env, "courier:" + day);
  // Галочки только для той же даты дня. После finishFullWeek день «Пн» тот же,
  // а дата новая — иначе «Доставки завершены» тянется со старой недели.
  const sameDate =
    !!(prev && prev.date && info.date && String(prev.date) === String(info.date));
  const prevBy = Object.create(null);
  if (sameDate) {
    ((prev && prev.clients) || []).forEach(function (c) {
      prevBy[normalizeMatchKey_(c.matchKey || c.name)] = c;
    });
  }
  const clients = (live.clients || []).map(function (c) {
    const mk = normalizeMatchKey_(c.matchKey || c.name);
    const old = prevBy[mk] || {};
    return Object.assign({}, c, {
      delivered: sameDate ? !!old.delivered : false,
      assembled: sameDate ? !!old.assembled : false,
      paid: sameDate ? old.paid : null,
      col: old.col,
      courierCol: old.courierCol,
      deliveriesN: old.deliveriesN,
      askPaid: sameDate ? old.askPaid : false
    });
  });
  // merge deliveries table (только текущий date_iso)
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
  const sameDate =
    !!(prev && prev.date && info.date && String(prev.date) === String(info.date));
  const prevBy = Object.create(null);
  if (sameDate) {
    ((prev && prev.clients) || []).forEach(function (c) {
      prevBy[normalizeMatchKey_(c.matchKey || c.name)] = c;
    });
  }
  const clients = (live.clients || []).map(function (c) {
    const mk = normalizeMatchKey_(c.matchKey || c.name);
    const old = prevBy[mk] || {};
    return Object.assign({}, {
      name: c.name,
      address: c.address,
      note: c.note,
      basket: c.basket,
      packs: sameDate ? old.packs || [] : [],
      totalBags: sameDate ? old.totalBags || 0 : 0,
      craftBags: sameDate ? old.craftBags || 0 : 0,
      lightByFraction: sameDate ? old.lightByFraction || {} : {},
      lightBagsByCounter: sameDate ? old.lightBagsByCounter || {} : {},
      assembled: sameDate ? !!old.assembled : false,
      printed: sameDate ? !!old.printed : false,
      dogPart: sameDate ? old.dogPart || "" : "",
      ownerName: old.ownerName || c.name,
      matchKey: c.matchKey
    });
  });
  await putSnap_(env, "assembly:" + day, {
    status: "success",
    day: day,
    date: info.date,
    clients: clients,
    typeTotals: sameDate ? (prev && prev.typeTotals) || {} : {},
    counterTotals: sameDate ? (prev && prev.counterTotals) || {} : {},
    lightByFraction: sameDate ? (prev && prev.lightByFraction) || {} : {},
    lightGramsTotal: sameDate ? (prev && prev.lightGramsTotal) || 0 : 0,
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
  const hitM = month ? await getSnapRaw_(env, "monthOverview:" + month) : null;
  const hit = hitM || (await getSnapRaw_(env, "monthOverview"));
  // полный календарь с GAS — отдаём сразу (merge week-дат сделает rebuild без потери)
  if (hit && Array.isArray(hit.days) && hit.days.length >= 10) {
    const body = await rebuildMonthOverview_(env);
    if (body && Array.isArray(body.days) && body.days.length >= hit.days.length) {
      return overlayWeekSheetCountsOnMonth_(env, body);
    }
    return overlayWeekSheetCountsOnMonth_(env, hit);
  }
  const body = await rebuildMonthOverview_(env);
  if (body && (!month || body.month === month || !body.month)) {
    return overlayWeekSheetCountsOnMonth_(env, body);
  }
  if (hit) return overlayWeekSheetCountsOnMonth_(env, hit);
  return body || { status: "success", month: month, days: [], total: 0, sandbox: true, source: "d1" };
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

async function cutoverGetMyAccess_(params, env, ctx) {
  const tid = String((params && params.telegramId) || "").trim();
  const snapKey = tid ? "access:" + tid : "";
  let snap = null;
  if (snapKey && env && env.DB) {
    try {
      snap = await getSnapRaw_(env, snapKey);
    } catch (e0) {
      snap = null;
    }
  }
  const snapOk =
    snap &&
    snap.status === "success" &&
    snap.role &&
    snap.role !== "none" &&
    (!tid || !snap.telegramId || String(snap.telegramId) === tid);

  async function fetchLive_() {
    const live = await gasProxy_("getMyAccess", params, env, { write: false });
    if (live && live.status === "success" && snapKey && env && env.DB) {
      try {
        const toStore = Object.assign({}, live, {
          telegramId: tid || live.telegramId || "",
          cachedAt: new Date().toISOString()
        });
        await putSnap_(env, snapKey, toStore);
      } catch (eS) {}
    }
    if (live && typeof live === "object") {
      live.cutover = true;
      live.fromGas = true;
    }
    return live;
  }

  if (snapOk) {
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(
        (async function () {
          try {
            await fetchLive_();
          } catch (eR) {}
        })()
      );
    }
    snap.cutover = true;
    snap.swr = true;
    snap.fromGas = false;
    snap.sandbox = false;
    return snap;
  }

  const live = await fetchLive_();
  if (live && typeof live === "object") return live;
  return { status: "error", message: "gas_proxy_failed", cutover: true, action: "getMyAccess" };
}

/** Статистика: D1 сразу (~мс), GAS в фоне. force=1 — только GAS. */
async function cutoverGetStats_(params, env, ctx) {
  const force = String((params && params.force) || "") === "1" || (params && params.force) === true;
  const mode = String((params && (params.mode || params.expected)) || "").toLowerCase();
  // expected/range — всегда живой GAS (другие даты)
  if (
    force ||
    mode === "expected" ||
    mode === "expect" ||
    mode === "range" ||
    (params && (params.dateFrom || params.fromDate || params.from)) ||
    (params && (params.expected === "1" || params.expected === 1 || params.expected === true))
  ) {
    const live = await gasProxy_("getStats", params, env, { write: false });
    if (live && live.status === "success" && env && env.DB && !mode && !params.dateFrom && !params.fromDate) {
      try {
        await putSnap_(env, "getStats", Object.assign({}, live, { cachedAt: new Date().toISOString() }));
      } catch (eS) {}
    }
    if (live && typeof live === "object") {
      live.cutover = true;
      live.fromGas = true;
      live.sandbox = false;
    }
    return live || { status: "error", message: "gas_proxy_failed", cutover: true, action: "getStats" };
  }

  const snap = await getSnapRaw_(env, "getStats");
  const snapOk = snap && snap.status === "success" && (snap.fact || snap.bp || snap.month);

  async function fetchLive_() {
    const live = await gasProxy_("getStats", params || {}, env, { write: false });
    if (live && live.status === "success" && env && env.DB) {
      try {
        await putSnap_(env, "getStats", Object.assign({}, live, { cachedAt: new Date().toISOString() }));
      } catch (eS) {}
    }
    if (live && typeof live === "object") {
      live.cutover = true;
      live.fromGas = true;
      live.sandbox = false;
    }
    return live;
  }

  if (snapOk) {
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(
        (async function () {
          try {
            await fetchLive_();
          } catch (eR) {}
        })()
      );
    }
    const out = Object.assign({}, snap);
    out.cutover = true;
    out.swr = true;
    out.fromGas = false;
    out.sandbox = false;
    return out;
  }

  const live = await fetchLive_();
  if (live && typeof live === "object") return live;
  return { status: "error", message: "gas_proxy_failed", cutover: true, action: "getStats" };
}

/** Универсальный D1+SWR для тяжёлых GAS-чтений. */
async function cutoverSwrGas_(action, params, env, ctx, opts) {
  opts = opts || {};
  const force =
    String((params && params.force) || "") === "1" ||
    (params && (params.force === true || params.force === 1));
  const snapKey = opts.snapKey || action;

  async function fetchLive_() {
    const live = await gasProxy_(action, params || {}, env, { write: false });
    if (live && live.status === "success" && env && env.DB) {
      try {
        const toStore = Object.assign({}, live, { cachedAt: new Date().toISOString() });
        await putSnap_(env, snapKey, toStore);
        if (typeof opts.afterStore === "function") {
          try {
            await opts.afterStore(live, env);
          } catch (eA) {}
        }
      } catch (eS) {}
    }
    if (live && typeof live === "object") {
      live.cutover = true;
      live.fromGas = true;
      live.sandbox = false;
    }
    return live;
  }

  if (force) {
    const live = await fetchLive_();
    return live || { status: "error", message: "gas_proxy_failed", cutover: true, action: action };
  }

  const snap = await getSnapRaw_(env, snapKey);
  const snapOk = snap && snap.status === "success" && (!opts.isOk || opts.isOk(snap));

  if (snapOk) {
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(
        (async function () {
          try {
            await fetchLive_();
          } catch (eR) {}
        })()
      );
    } else if (opts.inlineRevalidate) {
      try {
        await fetchLive_();
      } catch (eI) {}
    }
    const out = Object.assign({}, snap);
    out.cutover = true;
    out.swr = true;
    out.fromGas = false;
    out.sandbox = false;
    return out;
  }

  const live = await fetchLive_();
  if (live && typeof live === "object") return live;
  return { status: "error", message: "gas_proxy_failed", cutover: true, action: action };
}

async function handleCutover_(a, params, env, ctx) {
  // Опасные действия: пускаем при allowDanger=1 ИЛИ confirm=1
  // (старый UI на Pages мог не слать allowDanger → cutover_danger_blocked)
  if (
    (a === "finishFullWeek" || a === "materializeWeek" || a === "closeAllOpenDeficits") &&
    String(params.allowDanger || "") !== "1" &&
    String(params.confirm || "") !== "1" &&
    String(params.confirm || "").toLowerCase() !== "true"
  ) {
    return {
      status: "error",
      message: "cutover_danger_blocked",
      tip: "Нужен confirm=1 (кнопка «Завершить неделю») или allowDanger=1",
      cutover: true,
      action: a
    };
  }

  // запись — GAS быстро; D1 optimistic сразу; тяжёлый revalidate в фоне
  if (isWriteAction_(a)) {
    const proxied = await gasProxy_(a, params, env, { write: true });
    if (!proxied) return { status: "error", message: "gas_proxy_failed", cutover: true, action: a };
    // optimistic D1 (~мс) — UI сразу видит позиции; GAS-догон в waitUntil
    try {
      if (/^(saveOrder|saveBooking)$/i.test(a) && env && env.DB) {
        await saveOrder_(params, env, /^saveBooking$/i.test(a));
      } else if (/^(deleteClient|removeCalendarClient)$/i.test(a) && env && env.DB) {
        await deleteClient_(params, env);
      } else if (/^moveClient$/i.test(a) && env && env.DB) {
        await moveClient_(params, env);
      } else if (/^(deleteSubscription|deleteSubscriptionBatch)$/i.test(a) && env && env.DB) {
        await deleteSubscription_(params, env);
      }
    } catch (eOpt) {}
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(cutoverAfterWrite_(a, params, env, proxied));
    } else {
      try {
        await cutoverAfterWrite_(a, params, env, proxied);
      } catch (e) {}
    }
    return proxied;
  }

  // подсказки / калькуляции / экспорт / задачи / опросники — живой GAS
  // getWeekDayCounts — всегда GAS: после finishFullWeek D1 иначе месяцами врёт даты
  // getMyAccess — отдельно: D1 snap по telegramId + SWR (иначе TG ждёт GAS ~4с на каждый вход)
  // getViewCompare — D1+SWR ниже
  if (a === "getMyAccess") {
    return cutoverGetMyAccess_(params, env, ctx);
  }
  // getStats — тяжёлый GAS (~10с): D1 сразу + SWR в фоне (как getMyAccess)
  if (a === "getStats") {
    return cutoverGetStats_(params, env, ctx);
  }
  if (a === "getMonthOverview") {
    return cutoverGetMonthOverview_(params, env, ctx);
  }
  // listSurvey / week meta — тоже тяжёлые; D1+SWR
  if (a === "listSurvey") {
    return cutoverSwrGas_("listSurvey", params, env, ctx, {
      isOk: function (s) {
        return Array.isArray(s.items) || Array.isArray(s.list) || Array.isArray(s.surveys);
      }
    });
  }
  if (a === "getWeekDayCounts") {
    const force =
      String((params && params.force) || "") === "1" ||
      (params && (params.force === true || params.force === 1));
    const snap = await getSnapRaw_(env, "weekDayCounts");
    async function syncLiveCounts_() {
      const live = await gasProxy_("getWeekDayCounts", params || {}, env, { write: false });
      if (!(live && live.status === "success")) return null;
      try {
        await putSnap_(env, "weekDayCountsSheet", live);
      } catch (eS) {}
      if (isWeekSkewed_(live)) {
        return await applyCalendarWeekIfSkewed_("getWeekDayCounts", params, env, live);
      }
      try {
        await putSnap_(env, "weekDayCounts", live);
      } catch (eP) {}
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(cutoverRefreshAllWeekDays_(env));
      }
      live.cutover = true;
      live.fromGas = true;
      live.fromCalendar = false;
      live.sandbox = false;
      return live;
    }
    // overlay на устаревшем snap не должен прятать свежий A1 после смены даты
    if (force || (snap && snap.fromCalendar)) {
      try {
        const synced = await syncLiveCounts_();
        if (synced) return synced;
      } catch (eSync) {}
    }
    if (snap && snap.fromCalendar && isWeekSkewed_(snap)) {
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(
          (async function () {
            try {
              await syncLiveCounts_();
            } catch (eR) {}
          })()
        );
      }
      const out = Object.assign({}, snap);
      out.cutover = true;
      out.swr = true;
      out.fromGas = false;
      out.sandbox = false;
      return out;
    }
    const body = await cutoverSwrGas_("getWeekDayCounts", params, env, ctx, {
      isOk: function (s) {
        return Array.isArray(s.items) && s.items.length > 0 && !s.fromCalendar;
      },
      afterStore: async function (live, e) {
        if (isWeekSkewed_(live)) {
          try {
            await putSnap_(e, "weekDayCountsSheet", live);
          } catch (eSh) {}
          await applyCalendarWeekIfSkewed_("getWeekDayCounts", params, e, live);
          return;
        }
        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(cutoverRefreshAllWeekDays_(e));
        }
      }
    });
    const cal = await applyCalendarWeekIfSkewed_("getWeekDayCounts", params, env, body);
    return cal || body;
  }
  if (a === "getWeekBannerState") {
    return cutoverSwrGas_("getWeekBannerState", params, env, ctx, {
      snapKey: "weekBanner",
      isOk: function (s) {
        return s && (s.weekKey != null || s.finished != null || s.pulled != null || s.status === "success");
      }
    });
  }
  if (
    a === "suggestAddress" ||
    a === "lookupBpPartner" ||
    a === "calcPrice" ||
    a === "calcPpFact" ||
    a === "getPpFactCost" ||
    a === "getPpOrderSuggest" ||
    a === "exportStats" ||
    a === "getExpectedProfit" ||
    a === "getTransferTask" ||
    a === "composeWarehouseBuyMessage" ||
    a === "listBookings" ||
    a === "partnerListAdmin"
  ) {
    if (a === "suggestAddress") {
      return suggestAddressCutover_(params, env);
    }
    const live = await gasProxy_(a, params, env, { write: false });
    if (live && typeof live === "object") {
      live.cutover = true;
      live.fromGas = true;
      if (a === "partnerListAdmin" && live.status === "success" && env && env.DB) {
        try {
          await cutoverStoreRead_(a, params, env, live);
        } catch (eSv) {}
      }
      return live;
    }
    return { status: "error", message: "gas_proxy_failed", cutover: true, action: a };
  }

  // Лист Приёма уехал вперёд — клиенты/нарезка с календаря. Если A1 уже текущая неделя — не подменять.
  if (a === "getClients" || a === "getCutting" || a === "getCourier" || a === "getAssembly") {
    try {
      const sheet = await getSnapRaw_(env, "weekDayCountsSheet");
      const counts = await getSnapRaw_(env, "weekDayCounts");
      const liveLike = sheet && Array.isArray(sheet.items) && sheet.items.length ? sheet : counts;
      if (isWeekSkewed_(liveLike) || (counts && counts.fromCalendar && isWeekSkewed_(counts))) {
        if (!(sheet && !isWeekSkewed_(sheet))) {
          const cal = await applyCalendarWeekIfSkewed_(a, params, env, liveLike || counts);
          if (cal) return cal;
        }
      }
    } catch (eCalOps) {}
  }

  // чтение: D1 сразу. Исключение — дата календаря вне недели без snap (иначе UI «никого нет»).
  let fast = await cutoverFastRead_(a, params, env);
  // битый/ошибочный snap (например need_telegramId) — не отдаём UI, идём в GAS
  if (fast && typeof fast === "object" && fast.status && fast.status !== "success") {
    fast = null;
  }
  const calEmpty =
    a === "getViewCompare" &&
    params &&
    params.date &&
    fast &&
    fast.dateNotInWeek &&
    (!Array.isArray(fast.month) || !fast.month.length) &&
    (!Array.isArray(fast.week) || !fast.week.length);
  if (calEmpty) {
    try {
      const fresh = await gasProxy_(a, params, env, { write: false });
      if (fresh && fresh.status === "success") {
        await cutoverStoreRead_(a, params, env, fresh);
        fresh.cutover = true;
        fresh.swr = true;
        fresh.fromGas = true;
        return fresh;
      }
    } catch (eCal) {}
  }

  const needGas = cutoverNeedsRevalidate_(a, params, fast);
  if (needGas && ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(cutoverRevalidate_(a, params, env));
  }

  // Приёмка: если D1 count ≠ getWeekDayCounts — сразу GAS (иначе «на Будущей 6 вместо 2»)
  if (a === "getClients" && fast && params && params.day) {
    try {
      const counts = await getSnapRaw_(env, "weekDayCounts");
      let expect = null;
      ((counts && counts.items) || []).forEach(function (it) {
        if (it && String(it.day) === String(params.day)) expect = Number(it.count) || 0;
      });
      const got = Array.isArray(fast.clients) ? fast.clients.length : -1;
      if (expect != null && got !== expect) {
        const live = await gasProxy_(a, params, env, { write: false });
        if (live && live.status === "success") {
          try {
            await cutoverStoreRead_(a, params, env, live);
          } catch (eStore) {}
          live.cutover = true;
          live.fromGas = true;
          live.swr = true;
          live.sandbox = false;
          return live;
        }
      }
    } catch (eMis) {}
  }

  // Нарезка/курьер/сборка: snap с датой другой недели → сразу GAS (не «день завершён» со старой)
  if (
    fast &&
    (a === "getCutting" || a === "getCourier" || a === "getAssembly") &&
    params &&
    params.day
  ) {
    try {
      const info = await dayDateInfo_(env, params.day);
      const snapDate = String((fast && fast.date) || "");
      const wantDate = String((info && info.date) || "");
      const dateMismatch = !!(wantDate && snapDate && snapDate !== wantDate);
      const staleDone =
        a === "getCutting" && fast.completion && wantDate && (!snapDate || snapDate !== wantDate);
      if (dateMismatch || staleDone) {
        await delSnap_(env, (a === "getCutting" ? "cutting:" : a === "getCourier" ? "courier:" : "assembly:") + params.day);
        const live = await gasProxy_(a, params, env, { write: false });
        if (live && live.status === "success") {
          try {
            await cutoverStoreRead_(a, params, env, live);
          } catch (eSt) {}
          live.cutover = true;
          live.fromGas = true;
          live.swr = true;
          live.sandbox = false;
          return live;
        }
        fast = null;
      }
    } catch (eDate) {}
  }

  // Нарезка/курьер/сборка: пустой snap
  // — если по счётчикам дня 0 клиентов → не ждём GAS (пусто нормально)
  // — если люди есть → сразу GAS
  if (
    fast &&
    (a === "getCutting" || a === "getCourier" || a === "getAssembly") &&
    ((Array.isArray(fast.items) && !fast.items.length) ||
      (Array.isArray(fast.clients) && !fast.clients.length) ||
      !fast.date)
  ) {
    let dayCount = null;
    try {
      const counts = await getSnapRaw_(env, "weekDayCounts");
      ((counts && counts.items) || []).forEach(function (it) {
        if (it && String(it.day) === String(params.day || "")) dayCount = Number(it.count) || 0;
      });
    } catch (eCnt) {}
    if (dayCount === 0) {
      const emptyOut = Object.assign({}, fast, {
        cutover: true,
        swr: true,
        fromGas: false,
        sandbox: false,
        empty: true
      });
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(cutoverRevalidate_(a, params, env));
      }
      return emptyOut;
    }
    try {
      const live = await gasProxy_(a, params, env, { write: false });
      if (live && live.status === "success") {
        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(cutoverStoreRead_(a, params, env, live));
        } else {
          try {
            await cutoverStoreRead_(a, params, env, live);
          } catch (eStore) {}
        }
        live.cutover = true;
        live.fromGas = true;
        live.swr = true;
        return live;
      }
    } catch (eCut) {}
  }
  // склад / отложенные / просмотр без snap — подтянуть GAS
  if (
    fast &&
    (a === "getWarehouse" ||
      a === "listDeferred" ||
      (a === "getViewCompare" && !fast.fromSnap)) &&
    ((Array.isArray(fast.items) && !fast.items.length) ||
      (a === "getViewCompare" &&
        (!Array.isArray(fast.week) || !fast.week.length) &&
        (!Array.isArray(fast.month) || !fast.month.length)) ||
      (Array.isArray(fast.rows) && !fast.rows.length && a === "getWarehouse") ||
      (a === "listDeferred" && Array.isArray(fast.items) && !fast.items.length))
  ) {
    try {
      const live = await gasProxy_(a, params, env, { write: false });
      if (live && live.status === "success") {
        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(cutoverStoreRead_(a, params, env, live));
        } else {
          try {
            await cutoverStoreRead_(a, params, env, live);
          } catch (eStore) {}
        }
        live.cutover = true;
        live.fromGas = true;
        live.swr = true;
        return live;
      }
    } catch (eCut) {}
  }
  if (fast && typeof fast === "object") {
    fast.cutover = true;
    fast.swr = true;
    // D1-ответ для LIVE: не путать UI флагом sandbox
    if (fast.sandbox === true) fast.sandbox = false;
    return fast;
  }

  // нет D1-обработчика / битый snap — не врём пустым stub: идём в GAS
  try {
    const live = await gasProxy_(a, params, env, { write: false });
    if (live && typeof live === "object") {
      live.cutover = true;
      live.fromGas = true;
      if (live.status === "success" && ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(cutoverStoreRead_(a, params, env, live));
      }
      return live;
    }
  } catch (eLive) {}
  return cutoverEmptyRead_(a, params);
}

/** suggestAddress: GAS + fallback Nominatim с края CF (GAS иногда source:none). */
async function suggestAddressCutover_(params, env) {
  const text = String((params && (params.text || params.q || params.query)) || "").trim();
  let live = null;
  try {
    live = await gasProxy_("suggestAddress", params, env, { write: false });
  } catch (e) {}
  if (live && Array.isArray(live.results) && live.results.length) {
    live.cutover = true;
    live.fromGas = true;
    return live;
  }
  const fallback = await nominatimSuggestWorker_(text);
  if (fallback.length) {
    return {
      status: "success",
      results: fallback,
      source: "worker_nominatim",
      cutover: true,
      fromGas: false
    };
  }
  if (live && typeof live === "object") {
    live.cutover = true;
    live.fromGas = true;
    if (!Array.isArray(live.results)) live.results = [];
    return live;
  }
  return { status: "success", results: [], source: "empty", cutover: true };
}

async function nominatimSuggestWorker_(text) {
  const q = String(text || "").trim();
  if (q.length < 2) return [];
  try {
    const u =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=by&accept-language=ru&q=" +
      encodeURIComponent(q + ", Минск");
    const res = await fetch(u, {
      headers: {
        "User-Agent": "boinya-c-worker/1.0 (cutover address suggest)",
        Accept: "application/json"
      }
    });
    if (!res.ok) return [];
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr.map(function (it) {
      const lat = Number(it.lat);
      const lon = Number(it.lon);
      const title = String(it.display_name || it.name || "").split(",")[0] || String(it.display_name || "");
      return {
        title: title,
        subtitle: String(it.display_name || ""),
        address: title,
        house: (it.address && (it.address.house_number || "")) || "",
        kind: it.type || it.class || "",
        lat: lat,
        lon: lon,
        yandexUrl:
          isFinite(lat) && isFinite(lon)
            ? "https://yandex.ru/maps/?pt=" + lon + "," + lat + "&z=17&l=map"
            : ""
      };
    });
  } catch (e) {
    return [];
  }
}

const _revalCooldown = new Map();
function cutoverNeedsRevalidate_(a, params, fast) {
  // calc/ping/suggest — не гоняем в GAS из UI
  if (/^(calc|ping|keepWarm|suggest|lookup)/i.test(a)) return false;
  const key =
    a +
    "|" +
    String((params && (params.day || params.date || params.month || params.nick || "")) || "");
  const now = Date.now();
  const prev = _revalCooldown.get(key) || 0;

  let empty = !fast;
  if (fast && typeof fast === "object") {
    if (a === "getClients") empty = !Array.isArray(fast.clients) || !fast.clients.length;
    else if (a === "getViewCompare") {
      empty =
        (!Array.isArray(fast.week) || !fast.week.length) &&
        (!Array.isArray(fast.month) || !fast.month.length);
    } else if (a === "listSubscriptions") {
      empty = !Array.isArray(fast.subscriptions) || !fast.subscriptions.length;
    } else if (Array.isArray(fast.items)) empty = !fast.items.length;
    else if (Array.isArray(fast.clients)) empty = !fast.clients.length;
    else if (Array.isArray(fast.list)) empty = !fast.list.length;
    else if (fast.empty) empty = true;
  }
  // Просмотр — чаще подтягиваем GAS в фоне (ответ всё равно мгновенный из D1/snap)
  let minGap = empty ? 20000 : 90000;
  if (a === "getViewCompare" || a === "getClients" || a === "getMonthOverview") {
    minGap = empty ? 10000 : 45000;
  }
  if (now - prev < minGap) return false;
  _revalCooldown.set(key, now);
  return true;
}

function cutoverEmptyRead_(a, params) {
  const day = String((params && params.day) || "");
  if (a === "getClients") {
    return { status: "success", day: day, clients: [], cutover: true, swr: true, empty: true };
  }
  if (a === "getViewCompare") {
    return {
      status: "success",
      day: day,
      week: [],
      month: [],
      cutover: true,
      swr: true,
      empty: true,
      calendar: true
    };
  }
  if (a === "getWeekDayCounts") {
    return { status: "success", items: [], total: 0, cutover: true, swr: true, empty: true };
  }
  if (a === "getCutting") {
    return { status: "success", items: [], day: day, session: {}, cutover: true, swr: true, empty: true };
  }
  if (a === "getCourier" || a === "getAssembly") {
    return { status: "success", clients: [], day: day, cutover: true, swr: true, empty: true };
  }
  if (a === "calcPrice" || a === "calcPpFact" || a === "getPpFactCost" || a === "getPpOrderSuggest") {
    // эти редко дергаются — пусть UI не висит; точный расчёт придёт после revalidate в mem
    return { status: "success", items: [], basket: [], total: 0, price: 0, cutover: true, swr: true, empty: true };
  }
  if (a === "suggestAddress" || a === "lookupBpPartner") {
    return {
      status: "success",
      results: [],
      items: [],
      suggestions: [],
      cutover: true,
      swr: true,
      empty: true
    };
  }
  return {
    status: "success",
    items: [],
    list: [],
    people: [],
    clients: [],
    subscriptions: [],
    cutover: true,
    swr: true,
    empty: true,
    action: a
  };
}

async function cutoverFastRead_(a, params, env) {
  try {
    if (a === "getClients") return getClients_(params, env);
    if (a === "getViewCompare") return getViewCompare_(params, env);
    if (a === "getWeekDayCounts") return rebuildWeekCounts_(env);
    if (a === "getMonthOverview") return getMonthOverview_(params, env);
    if (a === "getWeekBannerState") return getSnap_(env, "weekBanner", null);
    if (a === "getCutting") return getCutting_(params, env);
    if (a === "getCourier") return getCourier_(params, env);
    if (a === "getAssembly") return getAssembly_(params, env);
    if (a === "getWarehouse") return getSnapRaw_(env, "warehouse");
    if (a === "warehousePreview") {
      return (await getSnapRaw_(env, "warehousePreview")) || (await getSnapRaw_(env, "warehouse"));
    }
    if (a === "resolveDayForDate") return resolveDay_(params, env);
    // getMyAccess — только live GAS (см. handleCutover_), здесь не stub'им role:all
    if (a === "listTemplates") {
      const key = params.kind ? "listTemplates:" + String(params.kind) : "listTemplates";
      return (await getSnapRaw_(env, key)) || (await getSnapRaw_(env, "listTemplates"));
    }
    if (
      a === "listDeferred" ||
      a === "listSurvey" ||
      a === "listSubscriptions" ||
      a === "listPartners" ||
      a === "listAccess" ||
      a === "listClientProfiles" ||
      a === "listReminderPeople" ||
      a === "listBpIdle" ||
      a === "getCouriers" ||
      a === "partnerListAdmin" ||
      a === "getStats" ||
      a === "telegramStatus" ||
      a === "weekPullStatus"
    ) {
      return getSnapRaw_(env, a);
    }
    if (a === "getSubscription") return getSubscription_(params, env);
  } catch (e) {
    return null;
  }
  return null;
}

async function cutoverStoreRead_(a, params, env, payload) {
  if (!payload || !env || !env.DB) return;
  // не кэшируем ошибки GAS (иначе listDeferred навсегда need_telegramId)
  if (payload.status && payload.status !== "success") return;
  if (a === "getClients" && params.day) {
    const list = Array.isArray(payload.clients) ? payload.clients : [];
    // всегда синхронизируем с GAS (в т.ч. пустой) — иначе в Просмотре живут seed/фантомы
    await replaceDayOrdersFromClients_(env, params.day, list);
    return;
  }
  if (a === "getViewCompare" && (payload.day || params.day || payload.dateIso || params.date)) {
    const day = payload.day || params.day;
    if (day && Array.isArray(payload.week)) {
      await replaceDayOrdersFromClients_(env, day, payload.week);
    }
    if (day) await putSnap_(env, "view:" + day, payload);
    const iso = payload.dateIso || dmyToIso_(payload.date) || params.date || "";
    if (iso) {
      await putSnap_(env, "viewDate:" + iso, payload);
      try {
        await patchMonthOverviewDayFromView_(env, iso, payload);
      } catch (ePatch) {}
    }
    return;
  }
  if (a === "getWeekDayCounts") {
    await putSnap_(env, "weekDayCounts", payload);
    const map = Object.create(null);
    ((payload && payload.items) || []).forEach(function (it) {
      const iso = dmyToIso_(it && it.date);
      if (iso && it.day) map[iso] = it.day;
    });
    await putSnap_(env, "dateToDay", { map: map });
    return;
  }
  if (a === "getCutting" && params.day) {
    await putSnap_(env, "cutting:" + params.day, payload);
    return;
  }
  if (a === "getCourier" && params.day) {
    await putSnap_(env, "courier:" + params.day, payload);
    return;
  }
  if (a === "getAssembly" && params.day) {
    await putSnap_(env, "assembly:" + params.day, payload);
    return;
  }
  if (a === "getWarehouse") {
    await putSnap_(env, "warehouse", payload);
    return;
  }
  if (a === "warehousePreview") {
    await putSnap_(env, "warehousePreview", payload);
    return;
  }
  if (a === "getWeekBannerState") {
    await putSnap_(env, "weekBanner", payload);
    return;
  }
  if (a === "getMonthOverview") {
    await putSnap_(env, "monthOverview", payload);
    if (payload.month) await putSnap_(env, "monthOverview:" + payload.month, payload);
    return;
  }
  if (a === "listTemplates" && params.kind) {
    await putSnap_(env, "listTemplates:" + params.kind, payload);
    return;
  }
  if (
    a.indexOf("list") === 0 ||
    a === "getCouriers" ||
    a === "partnerListAdmin" ||
    a === "getStats" ||
    a === "telegramStatus" ||
    a === "weekPullStatus"
  ) {
    await putSnap_(env, a, payload);
  }
}

async function replaceDayOrdersFromClients_(env, day, clients) {
  await ensureMetaColumn_(env);
  const info = await dayDateInfo_(env, day);
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE orders SET status = 'deleted', updated_at = ? WHERE day_name = ? AND status = 'active'"
  )
    .bind(now, day)
    .run();
  for (let i = 0; i < (clients || []).length; i++) {
    const c = clients[i];
    const mk = normalizeMatchKey_(c.matchKey || c.name || "");
    if (!mk) continue;
    const basket = JSON.stringify(c.basket || []);
    const meta = {
      orderPrice: c.orderPrice,
      ppSlot: c.ppSlot,
      ppHint: c.ppHint,
      ppPartner: c.ppPartner,
      noCut: !!c.noCut,
      dogCount: c.dogCount,
      geo: c.geo
    };
    await upsertOrderRow_(env, {
      id: day + ":" + mk,
      date_iso: info.iso || c.dateIso || "",
      day_name: day,
      client: c.name,
      match_key: mk,
      address: c.address || "",
      note: c.note || "",
      phone: c.phone || "",
      basket_json: basket,
      segment: c.segment || "",
      source: c.source || "",
      status: "active",
      updated_at: now,
      meta_json: JSON.stringify(meta)
    });
  }
  await rebuildWeekCounts_(env);
}

async function cutoverRevalidate_(a, params, env) {
  try {
    const fresh = await gasProxy_(a, params, env, { write: false });
    if (fresh && fresh.status === "success") await cutoverStoreRead_(a, params, env, fresh);
  } catch (e) {}
}

/** После сдвига недели: сбросить ops-снимки (нарезка/курьер/сборка), иначе UI «день завершён». */
async function cutoverResetOpsSnaps_(env) {
  if (!env || !env.DB) return;
  for (let i = 0; i < WEEK_DAYS.length; i++) {
    const day = WEEK_DAYS[i];
    try {
      await delSnap_(env, "cutting:" + day);
      await delSnap_(env, "courier:" + day);
      await delSnap_(env, "assembly:" + day);
      await delSnap_(env, "view:" + day);
    } catch (eDel) {}
  }
}

async function cutoverRefreshAllWeekDays_(env) {
  if (!env || !env.DB) return;
  // сначала актуальные даты недели, потом сброс ops (сравнение date в rebuildCourier)
  try {
    const liveCounts = await gasProxy_("getWeekDayCounts", {}, env, { write: false });
    if (liveCounts && liveCounts.status === "success") {
      await cutoverStoreRead_("getWeekDayCounts", {}, env, liveCounts);
    }
  } catch (eCnt) {}
  try {
    await cutoverResetOpsSnaps_(env);
  } catch (eOps) {}
  for (let i = 0; i < WEEK_DAYS.length; i++) {
    const day = WEEK_DAYS[i];
    try {
      const fresh = await gasProxy_("getClients", { day: day }, env, { write: false });
      if (fresh && fresh.status === "success") {
        await cutoverStoreRead_("getClients", { day: day }, env, fresh);
      }
    } catch (eDay) {}
    // курьер/сборка — чистый rebuild по новым датам (без старых галочек)
    try {
      await rebuildCourierDay_(env, day);
    } catch (eCour) {}
    try {
      await rebuildAssemblyDay_(env, day);
    } catch (eAsm) {}
    // нарезка — только живой GAS (completion/laid не из старого snap)
    try {
      const cut = await gasProxy_("getCutting", { day: day }, env, { write: false });
      if (cut && cut.status === "success") {
        await cutoverStoreRead_("getCutting", { day: day }, env, cut);
      }
    } catch (eCut) {}
  }
  try {
    await rebuildWeekCounts_(env);
  } catch (eC) {}
}

async function cutoverAfterWrite_(a, params, env, writeRes) {
  try {
    const days = [];
    if (params.day) days.push(String(params.day));
    if (params.oldDay) days.push(String(params.oldDay));
    if (params.newDay) days.push(String(params.newDay));
    const uniq = [];
    days.forEach(function (d) {
      if (d && uniq.indexOf(d) < 0) uniq.push(d);
    });

    // лёгкая пауза — Sheets flush; без 4 ретраев (кнопки не ждут этот фон)
    if (/^(saveOrder|saveBooking|deleteClient|removeCalendarClient|moveClient)$/i.test(a)) {
      await new Promise(function (r) {
        setTimeout(r, 250);
      });
    }

    const jobs = [];
    for (let i = 0; i < uniq.length; i++) {
      const day = uniq[i];
      jobs.push(
        (async function () {
          try {
            const fresh = await gasProxy_("getClients", { day: day }, env, { write: false });
            if (fresh && fresh.status === "success") {
              let list = Array.isArray(fresh.clients) ? fresh.clients : [];
              const wantClient = String(params.client || params.nick || "").trim();
              // merge optimistic row if GAS ещё не видит save
              if (
                /^(saveOrder|saveBooking)$/i.test(a) &&
                wantClient &&
                !list.some(function (c) {
                  return nicksLooseMatch_(c && (c.name || c.client), wantClient);
                })
              ) {
                const basketArr = parseBasket_(params.basket);
                list = list.concat([
                  {
                    name: wantClient,
                    matchKey: normalizeMatchKey_(params.matchKey || wantClient),
                    address: String(params.address || ""),
                    note: String(params.note || ""),
                    phone: String(params.phone || ""),
                    basket: basketArr,
                    segment: String(params.segment || params.orderType || ""),
                    source: String(params.source || "")
                  }
                ]);
                fresh.clients = list;
              }
              await cutoverStoreRead_("getClients", { day: day }, env, fresh);
            }
          } catch (eG) {}
          await Promise.all([
            cutoverRevalidate_("getViewCompare", { day: day }, env),
            cutoverRevalidate_("getCourier", { day: day }, env),
            cutoverRevalidate_("getAssembly", { day: day }, env),
            cutoverRevalidate_("getCutting", { day: day }, env)
          ]);
        })()
      );
    }
    await Promise.all(jobs);
    await Promise.all([
      cutoverRevalidate_("getWeekDayCounts", {}, env),
      cutoverRevalidate_("getWarehouse", {}, env),
      cutoverRevalidate_("getStats", {}, env)
    ]);
    if (/subscription/i.test(a)) await cutoverRevalidate_("listSubscriptions", {}, env);
    if (/deferred|remind|missed|transfer/i.test(a)) {
      await cutoverRevalidate_("listDeferred", params, env);
    }
    if (/cutting|warehouse|composeWarehouse|setWarehouse/i.test(a)) {
      await cutoverRevalidate_("warehousePreview", {}, env);
    }
    if (/survey/i.test(a)) {
      await cutoverRevalidate_("listSurvey", { activeOnly: "1" }, env);
    }
    if (/access|Access/i.test(a)) {
      await cutoverRevalidate_("listAccess", {}, env);
    }
  } catch (e) {}
}

function nicksLooseMatch_(a, b) {
  const na = normalizeMatchKey_(a);
  const nb = normalizeMatchKey_(b);
  return !!(na && nb && na === nb);
}

async function gasRead_(action, params, env) {
  return gasProxy_(action, params, env, { write: false });
}

async function gasProxy_(action, params, env, opts) {
  opts = opts || {};
  try {
    const origin = (env && env.GAS_ORIGIN) || GAS_ORIGIN;
    const clean = {};
    Object.keys(params || {}).forEach(function (k) {
      if (
        k === "action" ||
        k === "callback" ||
        k === "_" ||
        k === "cutover" ||
        k === "mode" ||
        k === "allowDanger" ||
        params[k] == null ||
        params[k] === ""
      ) {
        return;
      }
      if (
        !opts.write &&
        k === "confirm" &&
        String(params[k]) === "1" &&
        /finish|materialize|closeAll/i.test(action)
      ) {
        return;
      }
      clean[k] = params[k];
    });

    let text = "";
    // GET JSONP + redirect:follow на GAS часто дублирует doGet (двойной save*).
    // Все write → doPost, кроме коротких TG-текстов (sendCourierRoute и т.п. — GET).
    // sendCourierRoute: POST+redirect ломался; оставляем GET.
    const preferGet =
      /^(sendCourierRoute|sendDeficit|telegramStatus)$/i.test(action);
    const mustPost = opts.write && !preferGet;
    if (mustPost) {
      const body = Object.assign({}, clean, { action: action });
      // Apps Script /exec часто отвечает 302; redirect:follow превращает POST→GET без body → «Бэкенд Жив».
      let res = await fetch(origin, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
          "Cache-Control": "no-cache"
        },
        body: JSON.stringify(body)
      });
      // 302 → Location уже содержит результат doPost; повторный POST даёт HTML.
      // fetch redirect:follow на 302 сам делает GET — здесь явно GET Location.
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("Location") || res.headers.get("location");
        if (loc) {
          res = await fetch(loc, {
            method: "GET",
            redirect: "follow",
            headers: { "Cache-Control": "no-cache" }
          });
        }
      }
      text = await res.text();
    } else {
      const u = new URL(origin);
      u.searchParams.set("action", action);
      Object.keys(clean).forEach(function (k) {
        var val = clean[k];
        if (typeof val === "object") {
          try {
            val = JSON.stringify(val);
          } catch (eJ) {
            val = String(val);
          }
        }
        u.searchParams.set(k, String(val));
      });
      u.searchParams.set("callback", "cb");
      const res = await fetch(u.toString(), {
        redirect: "follow",
        headers: { "Cache-Control": "no-cache" }
      });
      text = await res.text();
    }

    let json;
    try {
      json = unwrapGas_(text);
    } catch (eUnwrap) {
      json = JSON.parse(String(text || "").trim());
    }
    if (json && typeof json === "object") {
      if (opts.write) json.cutover = true;
      else json.sandboxProxy = true;
    }
    return json;
  } catch (e) {
    return {
      status: "error",
      message: "gas_proxy_failed",
      detail: String((e && e.message) || e),
      action: action,
      cutover: !!opts.write
    };
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
  let items = params.items || params.targets || params.nicks || [];
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch (eJ) {
      items = [];
    }
  }
  if (!Array.isArray(items)) items = [];
  const nicks = []
    .concat(
      items.map(function (it) {
        if (typeof it === "string") return it;
        return (it && (it.nick || it.label || it.client || it.name)) || "";
      }),
      params.nicks || [],
      params.nick ? [params.nick] : [],
      params.ids || []
    )
    .map(String)
    .filter(Boolean);
  const keys = nicks.map(normalizeMatchKey_);
  if (!keys.length) {
    return { status: "error", message: "need_nick", sandbox: true };
  }
  const before = arr.length;
  const sheetWant = String(params.sheet || params.segment || "").trim().toUpperCase();
  arr = arr.filter(function (it) {
    const k = normalizeMatchKey_(it.nick || it.name || it.subId || it.id);
    if (keys.indexOf(k) < 0) return true;
    if (!sheetWant) return false;
    const sh = String(it.sheet || it.segment || "").trim().toUpperCase();
    return sh && sh !== sheetWant;
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
