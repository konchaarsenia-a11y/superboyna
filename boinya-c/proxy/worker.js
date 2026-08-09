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
      return json({ status: "error", message: String(e && e.message ? e.message : e), sandbox: true }, 500);
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
  if (a === "getWeekDayCounts") return getSnapOrBuild_(env, "weekDayCounts", () => buildWeekCounts_(env));
  if (a === "getMonthOverview") return getMonthOverview_(params, env);
  if (a === "getWeekBannerState") return getSnap_(env, "weekBanner", defaultBanner_(params));
  if (a === "getCutting") return getDaySnap_(env, "cutting", params.day);
  if (a === "getCourier") return getDaySnap_(env, "courier", params.day);
  if (a === "getAssembly") return getDaySnap_(env, "assembly", params.day);
  if (a === "getWarehouse" || a === "warehousePreview") {
    return getSnap_(env, "warehouse", { status: "success", items: [], rows: [], sandbox: true });
  }
  if (a === "resolveDayForDate") return resolveDay_(params, env);
  if (a === "getMyAccess") {
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
  if (a === "saveOrder" || a === "saveBooking") return saveOrder_(params, env);
  if (a === "deleteClient") return deleteClient_(params, env);
  if (a === "moveClient") return moveClient_(params, env);
  if (a === "listDeferred" || a === "listSurvey" || a === "listSubscriptions" || a === "listPartners" || a === "listAccess" || a === "listBookings" || a === "listClientProfiles" || a === "listTemplates" || a === "listReminderPeople" || a === "listBpIdle" || a === "getCouriers" || a === "partnerListAdmin") {
    const hit = await getSnapRaw_(env, a);
    if (hit) return hit;
    return { status: "success", items: [], list: [], people: [], clients: [], partners: [], couriers: [], sandbox: true, empty: true };
  }
  if (a === "getSubscription") {
    return { status: "success", found: false, nick: params.nick || "", segment: params.segment || "", sandbox: true };
  }
  if (a === "getPpFactCost" || a === "getPpOrderSuggest" || a === "calcPrice" || a === "calcPpFact") {
    return { status: "success", items: [], basket: [], total: 0, price: 0, suggest: {}, sandbox: true };
  }
  if (a === "suggestAddress" || a === "lookupBpPartner") {
    return { status: "success", items: [], suggestions: [], sandbox: true };
  }
  if (a === "getStats" || a === "getExpectedProfit" || a === "exportStats") {
    return { status: "success", rows: [], items: [], total: 0, sandbox: true };
  }
  if (a === "getTransferTask" || a === "telegramStatus" || a === "weekPullStatus") {
    return { status: "success", ok: true, ready: false, sandbox: true };
  }
  if (a === "setWeekBannerState") {
    const body = {
      status: "success",
      finished: !!params.finished,
      pulled: !!params.pulled,
      refused: !!params.refused,
      weekKey: params.weekKey || "",
      sandbox: true
    };
    await putSnap_(env, "weekBanner", body);
    return body;
  }
  // мутации / прочие action миниаппа — песочница, не падаем в unknown
  if (/^(save|delete|move|update|finish|cancel|enroll|set|close|pull|materialize|start|stop|ensure|scrub|request|setup|create|add|remove|toggle|mark|send|prepare|register|upsert|sync|notify|compose|repair|report|log|partner)/i.test(a)) {
    return { status: "success", sandbox: true, wrote: "noop", action: a };
  }
  return { status: "success", sandbox: true, action: a, empty: true };
}

async function getSnapRaw_(env, key) {
  if (!env || !env.DB) return null;
  const q = await env.DB.prepare("SELECT payload FROM snap_cache WHERE cache_key = ?").bind(key).first();
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

async function getSnap_(env, key, fallback) {
  const hit = await getSnapRaw_(env, key);
  return hit || fallback;
}

async function getSnapOrBuild_(env, key, builder) {
  const hit = await getSnapRaw_(env, key);
  if (hit) return hit;
  const built = await builder();
  try {
    await putSnap_(env, key, built);
  } catch (e) {
    /* ignore cache write */
  }
  return built;
}

async function getDaySnap_(env, kind, day) {
  const d = String(day || "Понедельник");
  const hit = await getSnapRaw_(env, kind + ":" + d);
  if (hit) return hit;
  if (kind === "getCutting" || kind === "cutting") {
    return { status: "success", items: [], day: d, date: "", sandbox: true, session: {} };
  }
  return { status: "success", clients: [], day: d, sandbox: true };
}

function clientFromRow_(r) {
  var basket = [];
  try {
    basket = JSON.parse(r.basket_json || "[]");
  } catch (e) {}
  return {
    name: r.client,
    matchKey: r.match_key,
    address: r.address || "",
    note: r.note || "",
    phone: r.phone || "",
    basket: basket,
    segment: r.segment || "",
    source: r.source || "",
    orderCount: Array.isArray(basket) ? basket.length : 0,
    updatedAt: r.updated_at
  };
}

async function getClients_(params, env) {
  const day = String(params.day || "Понедельник");
  if (!env || !env.DB) {
    return { status: "success", sandbox: true, day: day, source: "empty", clients: [] };
  }
  const q = await env.DB.prepare(
    "SELECT * FROM orders WHERE day_name = ? AND status = 'active' ORDER BY client"
  )
    .bind(day)
    .all();
  const rows = q.results || [];
  return {
    status: "success",
    sandbox: true,
    day: day,
    source: "d1",
    clients: rows.map(clientFromRow_)
  };
}

async function getViewCompare_(params, env) {
  const day = String(params.day || "");
  const dateIso = String(params.date || "");
  let resolvedDay = day;
  if (!resolvedDay && dateIso) {
    const map = await getSnapRaw_(env, "dateToDay");
    if (map && map.map && map.map[dateIso]) resolvedDay = map.map[dateIso];
    else if (map && map[dateIso]) resolvedDay = map[dateIso];
  }

  const cached = resolvedDay ? await getSnapRaw_(env, "view:" + resolvedDay) : null;
  if (cached && cached.status === "success") {
    // подмешать свежие orders в week
    if (resolvedDay && env && env.DB) {
      const live = await getClients_({ day: resolvedDay }, env);
      cached.week = live.clients || [];
      cached.month = live.clients || [];
      cached.day = resolvedDay;
      cached.source = "d1";
    }
    return cached;
  }

  if (resolvedDay) {
    const live = await getClients_({ day: resolvedDay }, env);
    const counts = await getSnapRaw_(env, "weekDayCounts");
    let date = "";
    let iso = dateIso;
    try {
      const items = (counts && counts.items) || [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].day === resolvedDay) {
          date = items[i].date || "";
          break;
        }
      }
    } catch (e) {}
    if (!iso && date) {
      const m = String(date).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (m) iso = m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    }
    return {
      status: "success",
      day: resolvedDay,
      targetDay: resolvedDay,
      date: date,
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

  return {
    status: "success",
    day: "",
    dateIso: dateIso,
    dateNotInWeek: !!dateIso,
    week: [],
    month: [],
    calendar: true,
    monthSheet: "D1",
    sandbox: true,
    source: "d1"
  };
}

async function buildWeekCounts_(env) {
  if (!env || !env.DB) return { status: "success", items: [], total: 0, sandbox: true };
  const days = [
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
    "Воскресенье",
    "Будущая неделя"
  ];
  const short = { Понедельник: "Пн", Вторник: "Вт", Среда: "Ср", Четверг: "Чт", Пятница: "Пт", Суббота: "Сб", Воскресенье: "Вс", "Будущая неделя": "Буд" };
  const items = [];
  let total = 0;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const q = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM orders WHERE day_name = ? AND status = 'active'"
    )
      .bind(d)
      .first();
    const c = Number(q && q.c) || 0;
    total += c;
    items.push({ day: d, short: short[d] || d, count: c, date: "" });
  }
  return { status: "success", items: items, total: total, sandbox: true, source: "d1" };
}

async function getMonthOverview_(params, env) {
  const month = String(params.month || "");
  const hit = await getSnapRaw_(env, "monthOverview");
  if (hit && hit.status === "success") {
    if (!month || !hit.month || hit.month === month) return hit;
  }
  const hitM = month ? await getSnapRaw_(env, "monthOverview:" + month) : null;
  if (hitM) return hitM;
  return { status: "success", month: month, days: [], sandbox: true, source: "d1" };
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
  const mapWrap = await getSnapRaw_(env, "dateToDay");
  const map = (mapWrap && mapWrap.map) || mapWrap || {};
  const dayName = map[iso] || "";
  if (dayName) {
    return { status: "success", date: iso, dayName: dayName, day: dayName, onWeek: true, sandbox: true };
  }
  return { status: "success", date: iso, dayName: "", day: "", onWeek: false, calendarOnly: true, sandbox: true };
}

async function saveOrder_(params, env) {
  const day = String(params.day || "Понедельник");
  const client = String(params.client || "").trim();
  if (!client) return { status: "error", message: "no_client" };
  if (!env || !env.DB) return { status: "error", message: "no_d1" };

  const matchKey = String(params.matchKey || client).toLowerCase();
  const now = new Date().toISOString();
  const id = String(params.id || day + ":" + matchKey);
  const basket =
    typeof params.basket === "string" ? params.basket : JSON.stringify(params.basket || []);
  const dateIso = String(params.date || params.dateIso || params.newDate || "");

  await env.DB.prepare(
    `INSERT INTO orders (id, date_iso, day_name, client, match_key, address, note, phone, basket_json, segment, source, status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
     ON CONFLICT(id) DO UPDATE SET
       date_iso=excluded.date_iso, day_name=excluded.day_name, client=excluded.client,
       address=excluded.address, note=excluded.note, phone=excluded.phone,
       basket_json=excluded.basket_json, segment=excluded.segment, source=excluded.source,
       status='active', updated_at=excluded.updated_at`
  )
    .bind(
      id,
      dateIso,
      day,
      client,
      matchKey,
      String(params.address || ""),
      String(params.note || ""),
      String(params.phone || ""),
      basket,
      String(params.segment || ""),
      String(params.source || ""),
      now
    )
    .run();

  return { status: "success", sandbox: true, wrote: "d1", id: id, updatedAt: now };
}

async function deleteClient_(params, env) {
  const day = String(params.day || "");
  const matchKey = String(params.matchKey || params.client || "")
    .trim()
    .toLowerCase();
  if (!matchKey) return { status: "error", message: "no_client" };
  if (!env || !env.DB) return { status: "error", message: "no_d1" };
  const now = new Date().toISOString();
  if (day) {
    await env.DB.prepare(
      "UPDATE orders SET status = 'deleted', updated_at = ? WHERE day_name = ? AND (match_key = ? OR lower(client) = ?)"
    )
      .bind(now, day, matchKey, matchKey)
      .run();
  } else {
    await env.DB.prepare(
      "UPDATE orders SET status = 'deleted', updated_at = ? WHERE match_key = ? OR lower(client) = ?"
    )
      .bind(now, matchKey, matchKey)
      .run();
  }
  return { status: "success", sandbox: true, wrote: "d1" };
}

async function moveClient_(params, env) {
  if (!env || !env.DB) return { status: "error", message: "no_d1" };
  const oldDay = String(params.oldDay || "");
  let newDay = String(params.newDay || "");
  const newDate = String(params.newDate || "");
  const client = String(params.client || "");
  const matchKey = String(params.matchKey || client).toLowerCase();
  const now = new Date().toISOString();

  if (!newDay && newDate) {
    const r = await resolveDay_({ date: newDate }, env);
    if (r.onWeek && r.dayName) newDay = r.dayName;
  }

  let row = null;
  if (oldDay) {
    row = await env.DB.prepare(
      "SELECT * FROM orders WHERE day_name = ? AND status = 'active' AND (match_key = ? OR lower(client) = ?) LIMIT 1"
    )
      .bind(oldDay, matchKey, matchKey)
      .first();
  }
  if (!row) {
    row = await env.DB.prepare(
      "SELECT * FROM orders WHERE status = 'active' AND (match_key = ? OR lower(client) = ?) LIMIT 1"
    )
      .bind(matchKey, matchKey)
      .first();
  }
  if (!row) {
    return { status: "error", message: "not_found", sandbox: true };
  }

  // soft-delete old
  await env.DB.prepare("UPDATE orders SET status = 'deleted', updated_at = ? WHERE id = ?")
    .bind(now, row.id)
    .run();

  if (newDay) {
    const newId = newDay + ":" + matchKey;
    await env.DB.prepare(
      `INSERT INTO orders (id, date_iso, day_name, client, match_key, address, note, phone, basket_json, segment, source, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
       ON CONFLICT(id) DO UPDATE SET
         date_iso=excluded.date_iso, client=excluded.client, address=excluded.address, note=excluded.note,
         phone=excluded.phone, basket_json=excluded.basket_json, segment=excluded.segment,
         source=excluded.source, status='active', updated_at=excluded.updated_at, day_name=excluded.day_name`
    )
      .bind(
        newId,
        newDate || row.date_iso || "",
        newDay,
        row.client,
        row.match_key,
        row.address || "",
        row.note || "",
        row.phone || "",
        row.basket_json || "[]",
        row.segment || "",
        row.source || "",
        now
      )
      .run();
  }

  return {
    status: "success",
    sandbox: true,
    wrote: "d1",
    local: false,
    from: oldDay || row.day_name,
    to: newDay || "(calendar)",
    newDate: newDate
  };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" }
  });
}
