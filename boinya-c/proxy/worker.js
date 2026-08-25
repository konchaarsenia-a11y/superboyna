/**
 * Бойня C — Worker + D1.
 * LIVE по умолчанию: D1 fast-read + запись/revalidate в боевой GAS.
 * Песочница только явно: ?sandbox=1 / ?cutover=0 (D1 write, Sheets skip).
 * deploy-marker: 2026-08-25 people-canon-instant-accept
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
        sandbox: false,
        cutover: "LIVE by default; ?sandbox=1 / ?cutover=0 → D1 only",
        d1: !!(env && env.DB),
        tip: "?action=getClients&day=Понедельник"
      });
    }

    try {
      let params = Object.fromEntries(url.searchParams.entries());
      if (request.method === "POST") {
        // text/plain из Mini App: request.json() иногда пустой — парсим text
        const raw = await request.text().catch(function () {
          return "";
        });
        let body = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch (eParse) {
          body = {};
        }
        if (body && typeof body === "object") {
          params = Object.assign({}, params, body);
        }
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
  const p = params || {};
  // явный sandbox / cutover=0 — только D1
  if (
    p.sandbox === "1" ||
    p.sandbox === 1 ||
    p.sandbox === true ||
    p.cutover === "0" ||
    p.cutover === 0 ||
    p.cutover === false ||
    p.cutover === "false" ||
    p.mode === "sandbox"
  ) {
    return false;
  }
  try {
    if (url && (url.searchParams.get("sandbox") === "1" || url.searchParams.get("cutover") === "0")) {
      return false;
    }
  } catch (eUrl) {}
  if (env && (env.CUTOVER === "0" || env.CUTOVER === "false" || env.SANDBOX === "1")) {
    return false;
  }
  // LIVE по умолчанию: иначе UI без cutover=1 пишет только в D1 → «успех», листы не меняются
  return true;
}

function isWriteAction_(a) {
  if (!a) return false;
  // явные чтения / списки — не write (даже если имя начинается с partner*)
  if (/^(get|list|resolve|calc|suggest|lookup|ping|keepWarm|poll|warehousePreview|checkOrderWarehouse)/i.test(a)) return false;
  if (
    a === "getMyAccess" ||
    a === "telegramStatus" ||
    a === "weekPullStatus" ||
    a === "partnerListAdmin" ||
    a === "partnerGetMe" ||
    a === "partnerListMyOrders" ||
    a === "composeWarehouseBuyMessage"
  ) {
    return false;
  }
  return /^(save|delete|move|update|finish|cancel|enroll|set|close|pull|materialize|start|stop|ensure|scrub|request|setup|create|add|remove|toggle|mark|send|prepare|register|upsert|sync|notify|compose|repair|report|log|partner|force|place)/i.test(
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
      d1: !!(env && env.DB),
      peopleCanon: "sheets-confirm-bg",
      deployMarker: "2026-08-25 people-canon-instant-accept"
    };
  }

  if (/^pollPeopleWrite$/i.test(a)) {
    const wid = String((params && params.writeId) || "").trim();
    if (!wid || !env || !env.DB) {
      return { status: "error", message: "need_writeId", sheetsVerified: false };
    }
    let job = await getSnapRaw_(env, "peopleWrite:" + wid);
    if (!job) {
      return { status: "pending", pendingSheets: true, sheetsVerified: false, writeId: wid };
    }
    // waitUntil мог оборваться — дожимаем на poll только если job «завис» (≥8с)
    const ageMs = Date.now() - (Number(job.startedAt || job._runningAt || 0) || 0);
    const runningFresh =
      !!(job._running && job._runningAt && Date.now() - Number(job._runningAt) < 20000);
    const stale =
      (job.status === "pending" || job.pendingSheets) &&
      !job.sheetsVerified &&
      job.params &&
      job.action &&
      ageMs >= 8000 &&
      !runningFresh;
    if (stale) {
      try {
        job = await runPeopleWriteJob_(wid, job, env, ctx);
      } catch (eCont) {
        try {
          await putSnap_(env, "peopleWrite:" + wid, Object.assign({}, job, {
            status: "error",
            pendingSheets: false,
            sheetsVerified: false,
            message: String((eCont && eCont.message) || eCont),
            finishedAt: Date.now()
          }));
          job = await getSnapRaw_(env, "peopleWrite:" + wid);
        } catch (e2) {}
      }
    }
    job = job || (await getSnapRaw_(env, "peopleWrite:" + wid)) || {
      status: "pending",
      pendingSheets: true,
      sheetsVerified: false
    };
    return Object.assign({}, job, {
      writeId: wid,
      cutover: !!live,
      sandbox: !live
    });
  }

  // Varka: partnerGetMe — D1 сразу (не ждать GAS); записи по-прежнему в GAS
  if (a === "partnerGetMe") {
    return cutoverPartnerGetMe_(params, env, ctx);
  }
  if (/^partner(SubmitOrder|ListMyOrders|SetOrderStatus)$/i.test(a)) {
    return handleCutover_(a, Object.assign({}, params, { cutover: "1" }), env, ctx);
  }

  // ——— CUTOVER: чтение из D1 сразу + фон GAS; запись → GAS ———
  if (live) {
    return handleCutover_(a, params, env, ctx);
  }
  // sandbox: люди (save/move/delete) — пишем в D1 (иначе бейдж «C · D1» = мёртвые кнопки).
  // В Sheets не ходим; UI видит d1Verified. Для боевых листов нужен LIVE (cutover=1).
  if (
    /^(saveOrder|saveBooking|deleteClient|removeCalendarClient|moveClient|placeTransferTask|notifyMissedDelivery)$/i.test(
      a
    )
  ) {
    try {
      let d1Res = null;
      if (env && env.DB) {
        if (/^(saveOrder|saveBooking)$/i.test(a)) {
          d1Res = await saveOrder_(params, env, /^saveBooking$/i.test(a));
        } else if (/^(deleteClient|removeCalendarClient)$/i.test(a)) {
          d1Res = await deleteClient_(params, env);
        } else if (/^moveClient$/i.test(a)) {
          d1Res = await moveClient_(params, env);
        } else if (/^placeTransferTask$/i.test(a)) {
          d1Res = await placeTransferTaskD1_(params, env);
        } else if (/^notifyMissedDelivery$/i.test(a)) {
          d1Res = await syncOpsWriteToD1_(a, params, env, {
            status: "success",
            id: "xfer_" + Date.now()
          });
        }
      }
      if (d1Res && d1Res.status === "success") {
        return Object.assign({}, d1Res, {
          cutover: false,
          sandbox: true,
          d1Verified: true,
          optimistic: true,
          sheetsSkipped: true,
          tip: "Песочница D1: в Google Sheets не пишем. Для листов открой с cutover=1 (LIVE).",
          action: a
        });
      }
      return {
        status: "error",
        message: (d1Res && d1Res.message) || "d1_write_failed",
        sandbox: true,
        action: a
      };
    } catch (eSand) {
      return {
        status: "error",
        message: String((eSand && eSand.message) || eSand),
        sandbox: true,
        action: a
      };
    }
  }
  // прочие write в sandbox — явная ошибка (не маскируем под успех)
  if (isWriteAction_(a)) {
    return {
      status: "error",
      message: "sandbox_no_write",
      tip: "Открой с cutover=1 (LIVE). Сейчас Worker в песочнице и в Google Sheets не пишет.",
      sandbox: true,
      action: a
    };
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
  // save*/move*/delete* — выше (sandbox_no_write); сюда не доходим
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
    if (a === "calcPrice" || a === "calcPpFact" || a === "getPpFactCost") {
      return { status: "error", message: "gas_proxy_failed", action: a, sandbox: true };
    }
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
  if (a === "saveDeferred") {
    try {
      await clearDeferredCancelTombstone_(
        env,
        params && params.id,
        (params && (params.matchKey || params.client || params.clientNick)) || ""
      );
    } catch (eClrS) {}
    return saveDeferredD1_(params, env);
  }
  if (a === "cancelDeferred") {
    try {
      var sid = String((params && params.id) || "").trim();
      var smk = "";
      try {
        var shit = await findDeferredSnapItem_(env, sid);
        if (shit) smk = deferredTransferClientKey_(shit);
      } catch (eSh) {}
      if (!smk) smk = normalizeMatchKey_((params && (params.matchKey || params.client || params.clientNick)) || "");
      await putDeferredCancelTombstone_(env, sid, smk);
    } catch (eTomb) {}
    return deleteFromList_(env, "listDeferred", "items", params, "id");
  }
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
  if (at) {
    handle = at[1];
  } else if (/^[A-Za-z0-9._]{3,}$/.test(s) && /[A-Za-z]/.test(s)) {
    handle = s;
  } else {
    // «ЕВГЕНИЯ es_furman» / «Имя nick» — брать латинский handle с конца (как viewClientKey / extractInstagramNick_)
    s = s
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/\s*\b(АФК|ПП|БП|Р)\b\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    var parts = s.split(/\s+/);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i].replace(/^[.,;:]+|[.,;:]+$/g, "");
      if (/^[A-Za-z0-9._]{3,}$/.test(p) && /[A-Za-z]/.test(p)) {
        handle = p;
        break;
      }
    }
  }
  if (handle) return handle.toUpperCase().replace(/[._]/g, "");
  return s.toUpperCase().replace(/Ё/g, "Е");
}

/** Все ключи матча: nick + legacy full upper (до извлечения handle). Иначе галочки/tomb «слетают». */
function matchKeyAliases_(raw) {
  var out = [];
  var seen = Object.create(null);
  function add(k) {
    k = String(k || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!k || seen[k]) return;
    seen[k] = true;
    out.push(k);
  }
  add(normalizeMatchKey_(raw));
  var legacy = String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е");
  add(legacy);
  if (legacy) add(legacy.replace(/\s+/g, ""));
  return out;
}

function indexByMatchAliases_(list, pick) {
  var by = Object.create(null);
  (list || []).forEach(function (c) {
    if (!c) return;
    var raw = pick ? pick(c) : c.matchKey || c.name || c.client;
    matchKeyAliases_(raw).forEach(function (k) {
      by[k] = c;
    });
  });
  return by;
}

function lookupByMatchAliases_(by, raw) {
  if (!by) return null;
  var aliases = matchKeyAliases_(raw);
  for (var i = 0; i < aliases.length; i++) {
    if (by[aliases[i]]) return by[aliases[i]];
  }
  return null;
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
  const segNorm = normalizeSegmentLabel_(r.segment || meta.segment || meta.orderType || "");
  const srcNorm =
    String(r.source || meta.source || "").trim() ||
    (segNorm === "ПП"
      ? "pp"
      : segNorm === "БП"
        ? "bp"
        : segNorm === "Р"
          ? "retail"
          : segNorm === "ПАРТНЁР"
            ? "partner"
            : "");
  const out = Object.assign({}, meta, {
    name: r.client,
    matchKey: r.match_key,
    address: r.address || meta.address || "",
    note: r.note || meta.note || "",
    phone: r.phone || meta.phone || "",
    basket: basket,
    segment: segNorm,
    source: srcNorm,
    orderCount: Array.isArray(basket) ? basket.length : Number(meta.orderCount) || 0,
    updatedAt: r.updated_at,
    dateIso: r.date_iso || "",
    day: r.day_name || "",
    noCut: !!meta.noCut
  });
  return out;
}

/** ПП/БП/Р/ПАРТНЁР из segment | orderType | source */
function normalizeSegmentLabel_(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return "";
  if (s === "ПП" || s === "PP" || s === "АФК" || s === "AFK" || s === "SUBSCRIPTION") return "ПП";
  if (s === "БП" || s === "BP") return "БП";
  if (s === "Р" || s === "R" || s === "RETAIL" || s === "РОЗНИЦА") return "Р";
  if (s.indexOf("ПАРТ") === 0 || s === "PARTNER" || s === "ВАРКА") return "ПАРТНЁР";
  if (s === "PP" || s.toLowerCase() === "pp") return "ПП";
  return "";
}

function segmentFromOrderParams_(params) {
  params = params || {};
  let seg = normalizeSegmentLabel_(params.segment);
  if (seg) return seg;
  const ot = String(params.orderType || params.source || "").trim().toLowerCase();
  if (ot === "pp" || ot === "subscription" || ot === "afk" || ot === "пп") return "ПП";
  if (ot === "bp" || ot === "бп") return "БП";
  if (ot === "retail" || ot === "розница" || ot === "r") return "Р";
  if (ot === "partner" || ot.indexOf("парт") === 0 || ot === "варка") return "ПАРТНЁР";
  seg = normalizeSegmentLabel_(ot);
  return seg || "";
}

function sourceFromSegment_(seg) {
  if (seg === "ПП") return "pp";
  if (seg === "БП") return "bp";
  if (seg === "Р") return "retail";
  if (seg === "ПАРТНЁР") return "partner";
  return "";
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

/** Дожать people-write (D1→GAS). Вызывается из waitUntil и из pollPeopleWrite. */
async function runPeopleWriteJob_(writeId, job, env, ctx) {
  if (!writeId || !env || !env.DB || !job) return job;
  if (job.sheetsVerified && job.status === "success") return job;
  if (job.status === "error" && !job.pendingSheets) return job;
  const runAt = Number(job._runningAt || 0) || 0;
  if (job._running && runAt && Date.now() - runAt < 25000) return job;

  const a = String(job.action || "");
  const gasWriteParams = job.params || {};
  job = Object.assign({}, job, { _running: true, _runningAt: Date.now() });
  try {
    await putSnap_(env, "peopleWrite:" + writeId, job);
  } catch (eLock) {}

  let d1WriteRes = job.d1Res || null;
  const sheetsFirst = /^(moveClient|deleteClient|removeCalendarClient)$/i.test(a);

  // move/delete: сначала Sheets (иначе D1 унесёт → GAS src_client_not_found)
  if (sheetsFirst && !job.sheetsVerified) {
    let sheetsRes = null;
    try {
      sheetsRes = await gasProxy_(a, gasWriteParams, env, { write: true });
    } catch (eG0) {
      sheetsRes = {
        status: "error",
        message: String((eG0 && eG0.message) || eG0 || "gas_proxy_failed")
      };
    }
    let ok =
      sheetsRes &&
      sheetsRes.status === "success" &&
      !/gas_proxy_failed|gas_timeout/i.test(String(sheetsRes.message || ""));
    if (!ok) {
      try {
        await new Promise(function (r) {
          setTimeout(r, 700);
        });
        const again = await Promise.race([
          gasProxy_(a, gasWriteParams, env, { write: true }).catch(function () {
            return null;
          }),
          new Promise(function (r) {
            setTimeout(function () {
              r(null);
            }, 14000);
          })
        ]);
        if (again) {
          sheetsRes = again;
          ok =
            sheetsRes &&
            sheetsRes.status === "success" &&
            !/gas_proxy_failed/i.test(String(sheetsRes.message || ""));
        }
      } catch (eRetry) {}
    }
    // мягкий ok: already gone / already moved
    if (
      !ok &&
      sheetsRes &&
      /already|not_found|src_client_not_found|same_/i.test(
        String(sheetsRes.status || "") + " " + String(sheetsRes.message || "")
      )
    ) {
      ok = true;
      sheetsRes = Object.assign({}, sheetsRes, { status: "success", softSheets: true });
    }

    if (!ok) {
      const fail = {
        status: "error",
        pendingSheets: false,
        sheetsVerified: false,
        d1Verified: !!job.d1Verified,
        action: a,
        params: gasWriteParams,
        message: (sheetsRes && (sheetsRes.message || sheetsRes.status)) || "sheets_write_failed",
        finishedAt: Date.now(),
        gas: sheetsRes || null
      };
      await putSnap_(env, "peopleWrite:" + writeId, fail);
      return fail;
    }

    // Sheets OK → D1
    try {
      if (/^(deleteClient|removeCalendarClient)$/i.test(a)) {
        d1WriteRes = await deleteClient_(gasWriteParams, env);
      } else if (/^moveClient$/i.test(a)) {
        d1WriteRes = await moveClient_(gasWriteParams, env);
      }
    } catch (eD1) {
      d1WriteRes = {
        status: "error",
        message: String((eD1 && eD1.message) || eD1)
      };
    }

    const done = {
      status: "success",
      pendingSheets: false,
      sheetsVerified: true,
      d1Verified: !!(d1WriteRes && d1WriteRes.status === "success"),
      action: a,
      params: gasWriteParams,
      message: d1WriteRes && d1WriteRes.status !== "success" ? "sheets_ok_d1_lag" : "",
      wrote: (d1WriteRes && d1WriteRes.wrote) != null ? d1WriteRes.wrote : sheetsRes.wrote,
      finishedAt: Date.now(),
      gas: sheetsRes || null,
      d1SyncWarning:
        d1WriteRes && d1WriteRes.status !== "success"
          ? d1WriteRes.message || "d1_sync_failed"
          : undefined
    };
    try {
      await putSnap_(env, "peopleWrite:" + writeId, done);
    } catch (eDone) {}
    try {
      await cutoverAfterWrite_(a, gasWriteParams, env, sheetsRes);
    } catch (eA) {}
    return done;
  }

  if (!job.d1Verified) {
    try {
      if (/^(saveOrder|saveBooking)$/i.test(a)) {
        d1WriteRes = await saveOrder_(gasWriteParams, env, /^saveBooking$/i.test(a));
      } else if (/^(deleteClient|removeCalendarClient)$/i.test(a)) {
        d1WriteRes = await deleteClient_(gasWriteParams, env);
      } else if (/^moveClient$/i.test(a)) {
        d1WriteRes = await moveClient_(gasWriteParams, env);
      }
    } catch (eD1) {
      d1WriteRes = {
        status: "error",
        message: String((eD1 && eD1.message) || eD1)
      };
    }
    if (!d1WriteRes || d1WriteRes.status !== "success") {
      const fail = {
        status: "error",
        pendingSheets: false,
        sheetsVerified: false,
        d1Verified: false,
        action: a,
        params: gasWriteParams,
        message: (d1WriteRes && d1WriteRes.message) || "d1_write_failed",
        finishedAt: Date.now()
      };
      await putSnap_(env, "peopleWrite:" + writeId, fail);
      return fail;
    }
    try {
      await putSnap_(env, "peopleWrite:" + writeId, {
        status: "pending",
        pendingSheets: true,
        sheetsVerified: false,
        d1Verified: true,
        action: a,
        params: gasWriteParams,
        d1Res: { status: "success", wrote: d1WriteRes.wrote },
        wrote: d1WriteRes.wrote,
        startedAt: job.startedAt || Date.now()
      });
    } catch (eMid) {}
  }

  let sheetsRes = null;
  try {
    sheetsRes = await gasProxy_(a, gasWriteParams, env, { write: true });
  } catch (eG0) {
    sheetsRes = {
      status: "error",
      message: String((eG0 && eG0.message) || eG0 || "gas_proxy_failed")
    };
  }
  let ok =
    sheetsRes &&
    sheetsRes.status === "success" &&
    !/gas_proxy_failed|gas_timeout/i.test(String(sheetsRes.message || ""));
  if (!ok) {
    try {
      await new Promise(function (r) {
        setTimeout(r, 700);
      });
      const again = await Promise.race([
        gasProxy_(a, gasWriteParams, env, { write: true }).catch(function () {
          return null;
        }),
        new Promise(function (r) {
          setTimeout(function () {
            r(null);
          }, 14000);
        })
      ]);
      if (again) {
        sheetsRes = again;
        ok =
          sheetsRes &&
          sheetsRes.status === "success" &&
          !/gas_proxy_failed/i.test(String(sheetsRes.message || ""));
      }
    } catch (eRetry) {}
  }

  const done = {
    status: ok ? "success" : "error",
    pendingSheets: false,
    sheetsVerified: !!ok,
    d1Verified: true,
    action: a,
    params: gasWriteParams,
    message: ok ? "" : (sheetsRes && sheetsRes.message) || "sheets_write_failed",
    wrote: (sheetsRes && sheetsRes.wrote) != null ? sheetsRes.wrote : (d1WriteRes && d1WriteRes.wrote),
    finishedAt: Date.now(),
    gas: sheetsRes || null
  };
  try {
    await putSnap_(env, "peopleWrite:" + writeId, done);
  } catch (eDone) {}

  try {
    await cutoverAfterWrite_(a, gasWriteParams, env, ok ? sheetsRes : d1WriteRes || done);
  } catch (eA) {}
  return done;
}

async function setMoveEpochDay_(env, matchKey, day, client) {
  const mk = normalizeMatchKey_(matchKey);
  if (!env || !env.DB || !mk || !day) return;
  try {
    await putSnap_(env, "moveEpoch:" + mk, {
      at: Date.now(),
      from: "",
      to: day,
      client: String(client || "")
    });
  } catch (eEpSet) {}
}

async function clearMoveEpoch_(env, matchKey) {
  const mk = normalizeMatchKey_(matchKey);
  if (!env || !env.DB || !mk) return;
  try {
    await env.DB.prepare("DELETE FROM snap_cache WHERE cache_key = ?")
      .bind("moveEpoch:" + mk)
      .run();
  } catch (eEpClr) {}
}

async function clientMovedAwayFromDay_(env, matchKey, clientName, day) {
  if (!day) return false;
  try {
    const mk = normalizeMatchKey_(matchKey || clientName);
    if (!mk) return false;
    const ep = await getSnapRaw_(env, "moveEpoch:" + mk);
    return !!(ep && ep.to && String(ep.to) !== String(day));
  } catch (eEpAway) {
    return false;
  }
}

async function saveOrderUnlessMovedAway_(params, env, asBooking) {
  const day = String((params && params.day) || "");
  const client = String((params && params.client) || "");
  const mk = normalizeMatchKey_((params && params.matchKey) || client);
  if (
    day &&
    (await clientMovedAwayFromDay_(env, (params && params.matchKey) || client, client, day))
  ) {
    return { status: "success", skippedStaleDay: true };
  }
  // свежий delete/move поставил tombstone — не воскрешать из фонового afterWrite save
  if (day && mk) {
    try {
      const tomb = (await getSnapRaw_(env, "deleteTombstones")) || { items: [] };
      const pk = await getSnapRaw_(env, "delTomb:" + String(day) + ":" + mk);
      const items = (tomb.items || []).slice();
      if (pk && pk.mk && !pk.cleared) items.push(pk);
      if (isTombstoned_({ items: items }, day, mk, client, null)) {
        return { status: "success", skippedTombstone: true };
      }
    } catch (eTomb) {}
  }
  return saveOrder_(params, env, asBooking);
}

function deferredItemModeOf_(it) {
  if (!it) return "";
  var m = String(it.mode || "").trim().toLowerCase();
  if (m) return m;
  m = String((it.payload && it.payload.mode) || "").trim().toLowerCase();
  if (m) return m;
  var title = String(it.title || "");
  if (/^перенос/i.test(title)) return "transfer";
  return "";
}

function deferredItemIsProtectedTransfer_(it) {
  if (!it) return false;
  var st = String(it.status || "open").toLowerCase();
  if (st && st !== "open") return false;
  var m = deferredItemModeOf_(it);
  if (m === "transfer") return true;
  if (it.fromD1 && (it.payload && it.payload.parked)) return true;
  if (it.payload && it.payload.parked && m !== "buy" && m !== "remind" && m !== "partner") return true;
  return false;
}

/** Напоминалки/заказы из D1 не затирать GAS listDeferred (как transfer). */
function deferredItemIsProtectedD1Keep_(it) {
  if (!it) return false;
  var st = String(it.status || "open").toLowerCase();
  if (st && st !== "open") return false;
  if (deferredItemIsProtectedTransfer_(it)) return true;
  var m = deferredItemModeOf_(it);
  if (m === "remind" || m === "order" || m === "buy") return true;
  // D1 id df_* — создать из Mini App, GAS мог не успеть
  var id = String(it.id || "");
  if (it.fromD1 || it.keptFromD1 || /^df_/i.test(id)) return true;
  return false;
}

function deferredTransferClientKey_(it) {
  if (!it) return "";
  var nick =
    it.clientNick ||
    it.client ||
    (it.payload && (it.payload.client || it.payload.clientNick)) ||
    "";
  var mk = (it.payload && it.payload.matchKey) || it.matchKey || nick;
  return normalizeMatchKey_(mk || nick);
}


/** Cancel tombstone: GAS/SWR и repair иначе возвращают задачу после «Убрать». */
const DEFERRED_CANCEL_TOMBSTONE_MS = 48 * 3600 * 1000;

async function putDeferredCancelTombstone_(env, id, matchKey) {
  if (!env) return;
  var tid = String(id || "").trim();
  var mk = normalizeMatchKey_(matchKey || "");
  if (!tid && !mk) return;
  try {
    var prev = (await getSnapRaw_(env, "deferredCancelTombstones")) || { items: [] };
    var now = Date.now();
    var items = (prev.items || []).filter(function (t) {
      return t && now - Number(t.at || 0) < DEFERRED_CANCEL_TOMBSTONE_MS;
    });
    items.push({ id: tid, mk: mk, at: now });
    await putSnap_(env, "deferredCancelTombstones", { items: items });
  } catch (eT) {}
}

async function clearDeferredCancelTombstone_(env, id, matchKey) {
  if (!env) return;
  var tid = String(id || "").trim();
  var mk = normalizeMatchKey_(matchKey || "");
  try {
    var prev = (await getSnapRaw_(env, "deferredCancelTombstones")) || { items: [] };
    var now = Date.now();
    var items = (prev.items || []).filter(function (t) {
      if (!t || now - Number(t.at || 0) >= DEFERRED_CANCEL_TOMBSTONE_MS) return false;
      if (tid && String(t.id || "") === tid) return false;
      if (mk && String(t.mk || "") === mk) return false;
      return true;
    });
    await putSnap_(env, "deferredCancelTombstones", { items: items });
  } catch (eC) {}
}

function isDeferredCancelTombstoned_(tomb, id, matchKey) {
  var tid = String(id || "").trim();
  var mk = normalizeMatchKey_(matchKey || "");
  var now = Date.now();
  return ((tomb && tomb.items) || []).some(function (t) {
    if (!t || now - Number(t.at || 0) > DEFERRED_CANCEL_TOMBSTONE_MS) return false;
    if (tid && String(t.id || "") === tid) return true;
    if (mk && String(t.mk || "") && String(t.mk) === mk) return true;
    return false;
  });
}

async function filterDeferredCancelTombstones_(env, items) {
  if (!items || !items.length) return items || [];
  try {
    var tomb = await getSnapRaw_(env, "deferredCancelTombstones");
    if (!tomb || !tomb.items || !tomb.items.length) return items;
    return items.filter(function (it) {
      if (!it) return false;
      var id = it.id != null ? String(it.id) : "";
      var mk = deferredTransferClientKey_(it);
      return !isDeferredCancelTombstoned_(tomb, id, mk);
    });
  } catch (eF) {
    return items;
  }
}


/** Слить listDeferred: open transfer/remind/df_* из D1 не убивать ответом GAS без них. */
async function mergeListDeferredPayload_(env, payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.status && payload.status !== "success") return null;
  var incoming = Array.isArray(payload.items) ? payload.items.slice() : [];
  var prevArr = [];
  try {
    var prev = await getSnapRaw_(env, "listDeferred");
    prevArr = prev && Array.isArray(prev.items) ? prev.items : [];
  } catch (ePrev) {
    prevArr = [];
  }
  if (!incoming.length && !prevArr.length) {
    return Object.assign({}, payload, { items: [], openCount: 0 });
  }
  // пустой GAS при непустом prev — не затираем
  if (!incoming.length && prevArr.length) return null;

  var byId = Object.create(null);
  var xferKeys = Object.create(null);
  var remindKeys = Object.create(null);
  function remindKey_(it) {
    if (!it) return "";
    var title = String(it.title || it.text || "").trim().toLowerCase();
    var at = String(it.remindAtMs || it.remindAt || it.due || "");
    var tid = String(it.telegramId || (it.payload && it.payload.telegramId) || "");
    if (!title) return "";
    return title + "|" + at + "|" + tid;
  }
  incoming.forEach(function (it) {
    if (!it) return;
    if (it.id != null && String(it.id)) byId[String(it.id)] = it;
    if (deferredItemIsProtectedTransfer_(it)) {
      var k = deferredTransferClientKey_(it);
      if (k) xferKeys[k] = true;
    }
    var rk = remindKey_(it);
    if (rk) remindKeys[rk] = true;
  });

  prevArr.forEach(function (it) {
    if (!deferredItemIsProtectedD1Keep_(it)) return;
    var id = it && it.id != null ? String(it.id) : "";
    var k = deferredTransferClientKey_(it);
    var rk = remindKey_(it);
    if (id && byId[id]) {
      var inc = byId[id];
      var st = String((inc && inc.status) || "open").toLowerCase();
      // явная отмена/закрытие из GAS — уважаем
      if (st === "cancelled" || st === "canceled" || st === "done" || st === "closed") return;
      return;
    }
    if (k && deferredItemIsProtectedTransfer_(it) && xferKeys[k]) return;
    if (rk && remindKeys[rk]) return;
    // вернуть D1-задачу, которую GAS «забыл»
    var kept = Object.assign({}, it, { fromD1: true, keptFromD1: true });
    incoming.unshift(kept);
    if (id) byId[id] = kept;
    if (k) xferKeys[k] = true;
    if (rk) remindKeys[rk] = true;
  });

  try {
    incoming = await filterDeferredCancelTombstones_(env, incoming);
  } catch (eMT) {}
  var openCount = incoming.filter(function (it) {
    return String((it && it.status) || "open").toLowerCase() === "open";
  }).length;
  return Object.assign({}, payload, {
    status: "success",
    items: incoming,
    openCount: openCount,
    mergedTransfers: true,
    mergedRemind: true
  });
}

/**
 * Раньше: любой deleted order за 48ч → xfer_repair_* («Перенос · восстановлен»).
 * После чистки D1 / закрытия недели это плодило ~70 ложных переносов и затирало
 * нормальные отложенные (finalize подменял GAS snap’ом).
 * Теперь: только чистим фантомы; новые задачи — из notifyMissedDelivery / placeTransfer.
 */
async function repairParkedTransfersFromOrders_(env) {
  if (!env || !env.DB) return;
  var list = (await getSnapRaw_(env, "listDeferred")) || { status: "success", items: [] };
  var items = Array.isArray(list.items) ? list.items.slice() : [];
  if (!items.length) return;

  var activeKeys = Object.create(null);
  try {
    var aq = await env.DB.prepare(
      "SELECT match_key, lower(client) AS cl FROM orders WHERE status = 'active'"
    ).all();
    ((aq && aq.results) || []).forEach(function (r) {
      var mk = normalizeMatchKey_(r.match_key || r.cl || "");
      if (mk) activeKeys[mk] = true;
      var cl = normalizeMatchKey_(r.cl || "");
      if (cl) activeKeys[cl] = true;
    });
  } catch (eA) {}

  var before = items.length;
  items = items.filter(function (it) {
    if (!it) return false;
    var id = String(it.id || "");
    var isRepair = !!it.repaired || id.indexOf("xfer_repair_") === 0;
    if (!isRepair) return true;
    // фантом repair — всегда убрать
    return false;
  });
  // open transfer, клиент снова active на дне — закрыть (уже вернули)
  items = items.map(function (it) {
    if (!deferredItemIsProtectedTransfer_(it)) return it;
    if (String(it.status || "open").toLowerCase() !== "open") return it;
    var k = deferredTransferClientKey_(it);
    if (k && activeKeys[k]) {
      return Object.assign({}, it, {
        status: "done",
        title: "Перенесён · на дне",
        autoClosedActive: true
      });
    }
    return it;
  });
  if (items.length === before && !items.some(function (it) { return it && it.autoClosedActive; })) {
    return;
  }
  list.items = items;
  list.status = "success";
  list.openCount = items.filter(function (it) {
    return String((it && it.status) || "open").toLowerCase() === "open";
  }).length;
  list.purgedRepairs = before - items.filter(function (it) {
    var id = String((it && it.id) || "");
    return !(it && (it.repaired || id.indexOf("xfer_repair_") === 0));
  }).length;
  list.fromD1 = true;
  await putSnap_(env, "listDeferred", list);
}

/** Убрать xfer_repair / repaired из массива задач (на чтении). */
function stripRepairedTransfers_(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(function (it) {
    if (!it) return false;
    var id = String(it.id || "");
    if (it.repaired) return false;
    if (id.indexOf("xfer_repair_") === 0) return false;
    return true;
  });
}

function buildDeferredItemFromParams_(params) {
  params = params || {};
  var id = String(params.id || "").trim() || ("df_" + Date.now());
  var mode = String(params.mode || "pp").trim().toLowerCase();
  if (
    mode !== "retail" &&
    mode !== "remind" &&
    mode !== "order" &&
    mode !== "buy" &&
    mode !== "transfer" &&
    mode !== "partner"
  ) {
    mode = "pp";
  }
  var payload = params.payload;
  if (payload && typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch (eP) {
      payload = {};
    }
  }
  if (!payload || typeof payload !== "object") payload = {};
  var nowIso = new Date().toISOString();
  var item = {
    id: id,
    at: nowIso,
    telegramId: String(params.telegramId || "").trim(),
    mode: mode,
    title: String(params.title || "").trim(),
    clientNick: String(params.clientNick || params.client || "").trim(),
    status: String(params.status || "open").trim() || "open",
    payload: payload,
    remindAt: String(params.remindAt || payload.remindAt || "").trim(),
    remindAtMs: Number(params.remindAtMs != null ? params.remindAtMs : payload.remindAtMs) || 0,
    remindSent: !!payload.remindSent,
    targetTelegramId: String(
      params.targetTelegramId || payload.targetTelegramId || payload.forTelegramId || ""
    ).trim(),
    fromD1: true,
    updatedAt: nowIso
  };
  if (!item.title) {
    item.title =
      (mode === "retail" ? "Розница" : mode === "order" ? "Заказ" : mode === "remind" ? "Напоминание" : "ПП") +
      (item.clientNick ? " · " + item.clientNick : "");
  }
  return item;
}

async function saveDeferredD1_(params, env) {
  if (!env || !env.DB) return { status: "error", message: "no_db", cutover: true };
  try {
    await clearDeferredCancelTombstone_(
      env,
      params && params.id,
      (params && (params.matchKey || params.client || params.clientNick)) || ""
    );
  } catch (eClr) {}
  var item = buildDeferredItemFromParams_(params);
  var list = (await getSnapRaw_(env, "listDeferred")) || { status: "success", items: [] };
  var items = Array.isArray(list.items) ? list.items.slice() : [];
  items = stripRepairedTransfers_(items);
  var idx = -1;
  for (var i = 0; i < items.length; i++) {
    if (String((items[i] && items[i].id) || "") === item.id) {
      idx = i;
      break;
    }
  }
  if (idx >= 0) {
    items[idx] = Object.assign({}, items[idx], item, { at: items[idx].at || item.at });
  } else {
    items.unshift(item);
  }
  list.items = items;
  list.status = "success";
  list.openCount = items.filter(function (it) {
    return String((it && it.status) || "open").toLowerCase() === "open";
  }).length;
  list.fromD1 = true;
  list.sandbox = false;
  await putSnap_(env, "listDeferred", list);
  return {
    status: "success",
    id: item.id,
    created: idx < 0,
    updated: idx >= 0,
    mode: item.mode,
    cutover: true,
    sandbox: false,
    d1Verified: true
  };
}

/** Недавно поставленные через перенос (source=transfer) — чтобы не «пропадали» из вкладки. */
async function appendRecentPlacedTransfers_(env, list) {
  if (!env || !env.DB) return list;
  if (!list || typeof list !== "object") list = { status: "success", items: [] };
  var items = Array.isArray(list.items) ? list.items.slice() : [];
  var since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  var rows = [];
  try {
    var q = await env.DB.prepare(
      "SELECT day_name, date_iso, client, match_key, basket_json, address, note, phone, segment, updated_at, meta_json FROM orders WHERE status = 'active' AND source = 'transfer' AND updated_at >= ? ORDER BY updated_at DESC LIMIT 40"
    )
      .bind(since)
      .all();
    rows = (q && q.results) || [];
  } catch (eQ) {
    return list;
  }
  if (!rows.length) return list;

  var openXferKeys = Object.create(null);
  var doneIds = Object.create(null);
  items.forEach(function (it) {
    if (!it) return;
    if (deferredItemIsProtectedTransfer_(it)) {
      var k = deferredTransferClientKey_(it);
      if (k) openXferKeys[k] = true;
    }
    if (it.id != null) doneIds[String(it.id)] = true;
  });

  var added = 0;
  rows.forEach(function (r) {
    if (!r) return;
    var nick = String(r.client || "").trim();
    var mk = normalizeMatchKey_(r.match_key || nick);
    if (!nick || !mk) return;
    if (openXferKeys[mk]) return;
    var placedId = "xfer_placed_" + mk.slice(0, 24);
    if (doneIds[placedId]) return;
    var basket = [];
    try {
      basket = JSON.parse(r.basket_json || "[]");
    } catch (eB) {
      basket = [];
    }
    if (!Array.isArray(basket)) basket = [];
    var ppPartner = "";
    try {
      ppPartner = String(parseMeta_(r.meta_json).ppPartner || "").trim();
    } catch (eMp) {}
    var placedDay = String(r.day_name || "");
    var placedDate = String(r.date_iso || "");
    items.unshift({
      id: placedId,
      mode: "transfer",
      title: "Перенесён · " + (placedDay || placedDate || "новый день"),
      clientNick: nick,
      status: "done",
      fromD1: true,
      placed: true,
      placedAt: String(r.updated_at || ""),
      placedDay: placedDay,
      placedDate: placedDate,
      payload: {
        mode: "transfer",
        parked: false,
        placed: true,
        placedDay: placedDay,
        placedDate: placedDate,
        day: placedDay,
        date: placedDate,
        client: nick,
        matchKey: mk,
        segment: String(r.segment || ""),
        ppPartner: ppPartner,
        basket: basket,
        address: String(r.address || ""),
        phone: String(r.phone || ""),
        note: String(r.note || "")
      }
    });
    doneIds[placedId] = true;
    added++;
  });

  if (!added) return list;
  list.items = items;
  list.recentPlacedTransfers = added;
  list.fromD1 = true;
  return list;
}

async function finalizeListDeferredPayload_(env, payload) {
  if (!payload || typeof payload !== "object") return payload;
  // НЕ подменять GAS/merged items целиком snap’ом — иначе saveDeferred «не пишется»,
  // а xfer_repair затирает реальные задачи.
  try {
    await repairParkedTransfersFromOrders_(env);
  } catch (eR) {}
  var items = Array.isArray(payload.items) ? payload.items.slice() : [];
  items = stripRepairedTransfers_(items);
  // дописать protected transfer из snap, которых нет в payload (после «Не получил»)
  try {
    var snap = await getSnapRaw_(env, "listDeferred");
    var snapArr = snap && Array.isArray(snap.items) ? snap.items : [];
    var byId = Object.create(null);
    var xferKeys = Object.create(null);
    items.forEach(function (it) {
      if (!it) return;
      if (it.id != null) byId[String(it.id)] = true;
      if (deferredItemIsProtectedTransfer_(it)) {
        var k0 = deferredTransferClientKey_(it);
        if (k0) xferKeys[k0] = true;
      }
    });
    snapArr.forEach(function (it) {
      if (!deferredItemIsProtectedTransfer_(it)) return;
      if (it.repaired || String(it.id || "").indexOf("xfer_repair_") === 0) return;
      var id = it && it.id != null ? String(it.id) : "";
      var k = deferredTransferClientKey_(it);
      if (id && byId[id]) return;
      if (k && xferKeys[k]) return;
      items.unshift(Object.assign({}, it, { fromD1: true, keptFromD1: true }));
      if (id) byId[id] = true;
      if (k) xferKeys[k] = true;
    });
  } catch (eS) {}
  payload = Object.assign({}, payload, { items: items });
  payload = await appendRecentPlacedTransfers_(env, payload);
  if (Array.isArray(payload.items)) {
    payload.items = stripRepairedTransfers_(payload.items);
    try {
      payload.items = await filterDeferredCancelTombstones_(env, payload.items);
    } catch (eFT) {}
    payload.openCount = payload.items.filter(function (it) {
      return String((it && it.status) || "open").toLowerCase() === "open";
    }).length;
  }
  return payload;
}

async function resolveBpPartnerForClient_(env, client, matchKey, payloadPartner, segment) {
  let p = String(payloadPartner || "").trim();
  if (p) return p;
  const seg = normalizeSegmentLabel_(segment || "");
  if (seg !== "БП") return "";
  const mk = normalizeMatchKey_(matchKey || client);
  const cl = String(client || "").trim().toLowerCase();
  try {
    const del = await env.DB.prepare(
      "SELECT meta_json FROM orders WHERE status = 'deleted' AND (match_key = ? OR lower(client) = ?) ORDER BY updated_at DESC LIMIT 1"
    )
      .bind(mk, cl)
      .first();
    if (del && del.meta_json) {
      p = String(parseMeta_(del.meta_json).ppPartner || "").trim();
      if (p) return p;
    }
  } catch (eDel) {}
  try {
    const act = await env.DB.prepare(
      "SELECT meta_json FROM orders WHERE status = 'active' AND (match_key = ? OR lower(client) = ?) ORDER BY updated_at DESC LIMIT 1"
    )
      .bind(mk, cl)
      .first();
    if (act && act.meta_json) {
      p = String(parseMeta_(act.meta_json).ppPartner || "").trim();
      if (p) return p;
    }
  } catch (eAct) {}
  return "Другое";
}

async function findDeferredSnapItem_(env, id) {
  id = String(id || "").trim();
  if (!id) return null;
  try {
    const list = await getSnapRaw_(env, "listDeferred");
    const arr = (list && list.items) || [];
    for (let i = 0; i < arr.length; i++) {
      if (String((arr[i] && arr[i].id) || "") === id) return arr[i];
    }
  } catch (e) {}
  return null;
}

async function weekCountsForTransfer_(env) {
  try {
    let counts = await getSnapRaw_(env, "weekDayCounts");
    if (!counts || !Array.isArray(counts.items) || !counts.items.length) {
      counts = await rebuildWeekCounts_(env);
    }
    return (counts && counts.items) || [];
  } catch (e) {}
  return [];
}

async function getTransferTaskCutover_(params, env) {
  const id = String((params && params.id) || "").trim();
  if (!id) return { status: "error", message: "need_id", cutover: true };
  const hit = await findDeferredSnapItem_(env, id);
  if (hit) {
    const st = String(hit.status || "open").toLowerCase();
    if (st && st !== "open") {
      return { status: "error", message: "not_open", cutover: true };
    }
    const weekCounts = await weekCountsForTransfer_(env);
    return {
      status: "success",
      item: {
        id: hit.id,
        mode: deferredItemModeOf_(hit) || "transfer",
        title: String(hit.title || ""),
        clientNick: String(
          hit.clientNick || (hit.payload && (hit.payload.client || hit.payload.clientNick)) || ""
        ),
        status: st || "open",
        payload: hit.payload || {},
        at: hit.at || ""
      },
      weekCounts: weekCounts,
      cutover: true,
      fromD1: !!hit.fromD1,
      sandbox: false
    };
  }
  const live = await gasProxy_("getTransferTask", params, env, { write: false });
  if (live && live.status === "success" && live.item) {
    live.cutover = true;
    live.fromGas = true;
    live.sandbox = false;
    return live;
  }
  return {
    status: "error",
    message: (live && live.message) || "not_found",
    cutover: true,
    action: "getTransferTask"
  };
}

/** Поставить клиента на новый день из задачи переноса (клиент уже снят с листа). */
async function placeTransferTaskD1_(params, env) {
  const id = String((params && params.id) || "").trim();
  if (!id) return { status: "error", message: "need_id", cutover: true };
  const hit = await findDeferredSnapItem_(env, id);
  if (!hit) return { status: "error", message: "not_found", cutover: true };
  const st = String(hit.status || "open").toLowerCase();
  if (st && st !== "open") return { status: "error", message: "not_open", cutover: true };

  const p = hit.payload || {};
  const client = String(hit.clientNick || p.client || p.clientNick || "").trim();
  if (!client) return { status: "error", message: "no_client", cutover: true };
  const matchKey = normalizeMatchKey_(p.matchKey || client);

  let newDate = String(params.newDate || params.date || params.deliveryDate || "").trim();
  let newDay = String(params.newDay || "").trim();
  if (!newDate && newDay) {
    const info = await dayDateInfo_(env, newDay);
    newDate = info.iso || "";
  }
  if (!newDate) return { status: "error", message: "need_date", cutover: true };
  if (!newDay) {
    const r = await resolveDay_({ date: newDate }, env);
    if (r.onWeek && r.dayName) newDay = r.dayName;
  }

  const cutRaw = !(
    params.cutRaw === false ||
    params.cutRaw === "0" ||
    params.cutRaw === 0 ||
    params.cutRaw === "false"
  );
  let note = String(p.note || "").trim();
  note = note.replace(/\s*\[НЕ РЕЗАТЬ\]/gi, "").replace(/\s*\[РЕЗАТЬ\]/gi, "").trim();
  note = (note ? note + " " : "") + (cutRaw ? "[РЕЗАТЬ]" : "[НЕ РЕЗАТЬ]");

  const basket = Array.isArray(p.basket) ? p.basket : [];
  const seg = String(p.segment || "");
  const ppPartner = await resolveBpPartnerForClient_(env, client, matchKey, p.ppPartner, seg);
  const saveRes = await saveOrder_(
    {
      client: client,
      matchKey: matchKey,
      day: newDay,
      date: newDate,
      address: String(p.address || ""),
      phone: String(p.phone || ""),
      note: note,
      basket: JSON.stringify(basket),
      segment: seg,
      source: "transfer",
      ppPartner: ppPartner
    },
    env,
    false
  );
  if (!saveRes || saveRes.status !== "success") {
    return Object.assign({}, saveRes || { status: "error", message: "save_failed" }, { cutover: true });
  }

  // не удалять — пометить done (иначе «пропали из переносов» сразу после клика)
  try {
    const list = (await getSnapRaw_(env, "listDeferred")) || { status: "success", items: [] };
    const arr = Array.isArray(list.items) ? list.items.slice() : [];
    const nowIso = new Date().toISOString();
    let found = false;
    const next = arr.map(function (it) {
      if (!it || String(it.id || "") !== id) return it;
      found = true;
      const p2 = it.payload || {};
      return Object.assign({}, it, {
        status: "done",
        placed: true,
        placedAt: nowIso,
        placedDay: newDay,
        placedDate: newDate,
        title: "Перенесён · " + (newDay || newDate),
        payload: Object.assign({}, p2, {
          placed: true,
          placedDay: newDay,
          placedDate: newDate,
          parked: false
        })
      });
    });
    if (found) {
      list.items = next;
      list.status = "success";
      list.openCount = next.filter(function (it) {
        return String((it && it.status) || "open").toLowerCase() === "open";
      }).length;
      list.fromD1 = true;
      list.sandbox = false;
      await putSnap_(env, "listDeferred", list);
    } else {
      await deleteFromList_(env, "listDeferred", "items", params, "id");
    }
    try {
      await putDeferredCancelTombstone_(env, id, matchKey || client);
    } catch (eTombPlace) {}
  } catch (eDone) {}

  return {
    status: "success",
    id: id,
    client: client,
    newDate: newDate,
    newDay: newDay,
    weekWritten: !!newDay,
    parkedPlaced: true,
    fromD1: true,
    cutover: true,
    sandbox: false,
    wrote: saveRes.wrote || 1
  };
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

function orderRowLooseMatch_(row, matchKey, clientName) {
  if (!row) return false;
  return (
    nicksLooseMatch_(matchKey, row.match_key) ||
    nicksLooseMatch_(matchKey, row.client) ||
    nicksLooseMatch_(clientName, row.match_key) ||
    nicksLooseMatch_(clientName, row.client)
  );
}

async function findOrderRow_(env, matchKey, day, dateIso, clientName) {
  const mk = normalizeMatchKey_(matchKey);
  const mkClient = normalizeMatchKey_(clientName);
  const mkLow = String(matchKey || "").trim().toLowerCase();
  const clientLow = String(clientName || "").trim().toLowerCase();
  let row = null;
  if (day) {
    row = await env.DB.prepare(
      "SELECT * FROM orders WHERE day_name = ? AND status = 'active' AND (match_key = ? OR match_key = ? OR match_key = ? OR lower(client) = ? OR lower(client) = ?) LIMIT 1"
    )
      .bind(day, mk, mkLow, mkClient || mk, mkLow || clientLow, clientLow || mkLow)
      .first();
    if (!row) {
      try {
        const all = await env.DB.prepare(
          "SELECT * FROM orders WHERE day_name = ? AND status = 'active' LIMIT 120"
        )
          .bind(day)
          .all();
        const list = (all && all.results) || [];
        for (var i = 0; i < list.length; i++) {
          if (orderRowLooseMatch_(list[i], matchKey, clientName)) {
            row = list[i];
            break;
          }
        }
      } catch (eScan) {}
    }
  }
  // день мог быть «Пн», а человек на «Будущая неделя» с date=сегодня — не врать d1Verified
  if (!row && dateIso) {
    row = await env.DB.prepare(
      "SELECT * FROM orders WHERE date_iso = ? AND status = 'active' AND (match_key = ? OR match_key = ? OR match_key = ? OR lower(client) = ? OR lower(client) = ?) LIMIT 1"
    )
      .bind(dateIso, mk, mkLow, mkClient || mk, mkLow || clientLow, clientLow || mkLow)
      .first();
    if (!row) {
      try {
        const all = await env.DB.prepare(
          "SELECT * FROM orders WHERE date_iso = ? AND status = 'active' LIMIT 120"
        )
          .bind(dateIso)
          .all();
        const list = (all && all.results) || [];
        for (var j = 0; j < list.length; j++) {
          if (orderRowLooseMatch_(list[j], matchKey, clientName)) {
            row = list[j];
            break;
          }
        }
      } catch (eScan2) {}
    }
  }
  return row;
}

/** Живая строка по нику на любом дне недели (сегодняшний пн = «Будущая неделя»). */
async function findActiveOrderByMatch_(env, matchKey, clientName) {
  if (!env || !env.DB) return null;
  const aliases = matchKeyAliases_(matchKey).concat(matchKeyAliases_(clientName));
  const seen = Object.create(null);
  for (let ai = 0; ai < aliases.length; ai++) {
    const a = aliases[ai];
    if (!a || seen[a]) continue;
    seen[a] = true;
    try {
      const row = await env.DB.prepare(
        "SELECT * FROM orders WHERE status = 'active' AND match_key = ? LIMIT 1"
      )
        .bind(a)
        .first();
      if (row) return row;
    } catch (eMk) {}
  }
  const clientLow = String(clientName || "").trim().toLowerCase();
  if (clientLow) {
    try {
      const row2 = await env.DB.prepare(
        "SELECT * FROM orders WHERE status = 'active' AND lower(client) = ? LIMIT 1"
      )
        .bind(clientLow)
        .first();
      if (row2) return row2;
    } catch (eCl) {}
  }
  try {
    const all = await env.DB.prepare(
      "SELECT * FROM orders WHERE status = 'active' AND day_name != '' LIMIT 400"
    ).all();
    const list = (all && all.results) || [];
    for (let i = 0; i < list.length; i++) {
      if (orderRowLooseMatch_(list[i], matchKey, clientName)) return list[i];
    }
  } catch (eScan) {}
  return null;
}

/**
 * Soft-delete D1 orders on a weekday column whose date_iso ≠ that day's week date.
 * Keep empty date_iso (sheet sync without booking stamp) — never infer orphans from CRM alone.
 */
async function scrubMismatchedDayOrders_(env, day, wantIso) {
  if (!env || !env.DB || !day || !wantIso) return 0;
  let n = 0;
  try {
    const q = await env.DB.prepare(
      "SELECT id, date_iso FROM orders WHERE day_name = ? AND status = 'active' AND date_iso != '' AND date_iso != ? LIMIT 200"
    )
      .bind(day, wantIso)
      .all();
    const list = (q && q.results) || [];
    const nowDel = new Date().toISOString();
    for (let i = 0; i < list.length; i++) {
      try {
        await env.DB.prepare(
          "UPDATE orders SET status = 'deleted', updated_at = ? WHERE id = ?"
        )
          .bind(nowDel, list[i].id)
          .run();
        n++;
      } catch (e1) {}
    }
  } catch (e0) {}
  return n;
}

/** После смены дат недели (GAS weekDayCounts) — выкинуть D1-сирот с чужим date_iso. */
async function scrubAllDayDateMismatches_(env, countsPayload) {
  if (!env || !env.DB || !countsPayload) return { scrubbed: 0 };
  const items = countsPayload.items || [];
  let scrubbed = 0;
  for (let i = 0; i < items.length; i++) {
    const day = String((items[i] && items[i].day) || "").trim();
    const iso = dmyToIso_((items[i] && items[i].date) || "") || "";
    if (!day || !iso) continue;
    scrubbed += await scrubMismatchedDayOrders_(env, day, iso);
  }
  if (scrubbed) {
    try {
      await invalidateDays_(
        env,
        items.map(function (it) {
          return it && it.day;
        }).filter(Boolean)
      );
    } catch (eInv) {}
  }
  return { scrubbed: scrubbed };
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
    // сироты после отката дат недели: day=Среда но date_iso=02.09 при Ср=26.08
    if (dateIso && rows.length) {
      await scrubMismatchedDayOrders_(env, day, dateIso);
      const q2 = await env.DB.prepare(
        "SELECT * FROM orders WHERE day_name = ? AND status = 'active' ORDER BY client"
      )
        .bind(day)
        .all();
      rows = (q2 && q2.results) || [];
    }
  } else if (dateIso) {
    const q = await env.DB.prepare(
      "SELECT * FROM orders WHERE date_iso = ? AND status = 'active' ORDER BY client"
    )
      .bind(dateIso)
      .all();
    rows = q.results || [];
  }
  if (!dateDmy && dateIso) dateDmy = isoToDmy_(dateIso);
  let clientsOut = rows.map(clientFromRow_);
  if (day) {
    try {
      clientsOut = await filterTombstonedClients_(env, day, clientsOut, { skipMoveEpoch: true });
    } catch (eTombG) {}
  }
  return {
    status: "success",
    sandbox: true,
    day: day,
    date: dateDmy || "",
    dateIso: dateIso || "",
    source: "d1",
    clients: clientsOut
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
      const weekRaw = live && Array.isArray(live.clients) ? live.clients : (snap && Array.isArray(snap.week) ? snap.week : []);
      // live D1 уже authoritative — moveEpoch только для GAS-merge, иначе прячет arrive после переноса
      const week = await filterTombstonedClients_(env, resolvedDay, weekRaw, { skipMoveEpoch: true });
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

  // вне недели — snap по дате + live D1 orders (snap без CAL-строк врёт «пусто» после move)
  if (dateIso) {
    const live = await getClients_({ date: dateIso }, env);
    const liveClients = (live && live.clients) || [];
    const byDate = await getSnapRaw_(env, "viewDate:" + dateIso);
    let month = [];
    if (byDate && byDate.status === "success") {
      month = Array.isArray(byDate.month)
        ? byDate.month.slice()
        : Array.isArray(byDate.week)
          ? byDate.week.slice()
          : [];
    }
    const seen = Object.create(null);
    month.forEach(function (c) {
      const k = normalizeMatchKey_((c && (c.matchKey || c.name)) || "");
      if (k) seen[k] = true;
    });
    liveClients.forEach(function (c) {
      const k = normalizeMatchKey_((c && (c.matchKey || c.name)) || "");
      if (k && seen[k]) return;
      if (k) seen[k] = true;
      month.push(c);
    });
    // tombstone / deleted — убрать из month
    try {
      month = await filterTombstonedClients_(env, "", month, { dateIso: dateIso });
    } catch (eTombCal) {}
    return {
      status: "success",
      day: "",
      dateIso: dateIso,
      date: (byDate && byDate.date) || isoToDmy_(dateIso),
      dateNotInWeek: true,
      calendarOnly: true,
      week: [],
      month: month,
      calendar: true,
      monthSheet: (byDate && byDate.monthSheet) || "D1",
      sandbox: true,
      source: liveClients.length ? "d1+snap" : byDate ? "snap" : "d1",
      fromSnap: !!byDate
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
    weekMap[iso] = { count: Number(it.count) || 0, day: String(it.day || "") };
  });
  if (!Object.keys(weekMap).length) return body;

  // сегменты с D1 по date_iso (count уже с листа)
  const segByIso = Object.create(null);
  try {
    const isos = Object.keys(weekMap);
    for (let si = 0; si < isos.length; si++) {
      const iso = isos[si];
      const q = await env.DB.prepare(
        "SELECT segment, source, COUNT(*) AS c FROM orders WHERE status = 'active' AND date_iso = ? GROUP BY segment, source"
      )
        .bind(iso)
        .all();
      const segments = { "ПП": 0, "БП": 0, "Р": 0, "ПАРТНЁР": 0, other: 0 };
      ((q && q.results) || []).forEach(function (r) {
        const c = Number(r.c) || 0;
        const seg =
          normalizeSegmentLabel_(r.segment) || normalizeSegmentLabel_(r.source) || "";
        if (seg === "ПП") segments["ПП"] += c;
        else if (seg === "БП") segments["БП"] += c;
        else if (seg === "Р") segments["Р"] += c;
        else if (seg === "ПАРТНЁР") segments["ПАРТНЁР"] += c;
        else segments.other += c;
      });
      segByIso[iso] = segments;
    }
  } catch (eSeg) {}

  const byIso = Object.create(null);
  ((body.days || []) || []).forEach(function (d) {
    if (!d || !d.dateIso) return;
    byIso[d.dateIso] = {
      dateIso: d.dateIso,
      count: Number(d.count) || 0,
      segments: d.segments || {},
      fromWeekSheet: !!d.fromWeekSheet,
      fromView: !!d.fromView
    };
  });
  const bodyMonth = String(body.month || "").slice(0, 7);
  Object.keys(weekMap).forEach(function (iso) {
    // не вклеивать «Приём» 07.09 в обзор августа — лист уехал вперёд
    if (bodyMonth && String(iso).slice(0, 7) !== bodyMonth) return;
    const wCount = weekMap[iso].count;
    const segs = segByIso[iso] || { "ПП": 0, "БП": 0, "Р": 0, "ПАРТНЁР": 0, other: 0 };
    if (!byIso[iso]) {
      byIso[iso] = {
        dateIso: iso,
        count: wCount,
        segments: segs,
        fromWeekSheet: true
      };
    } else if (byIso[iso].fromView) {
      // уже сверено с Просмотром — только помечаем week
      byIso[iso].fromWeekSheet = true;
    } else {
      byIso[iso].count = wCount;
      byIso[iso].segments = segs;
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

/** Жевалка: «ТРАХЕЯ» + «СРЕД» → «ТРАХЕЯ СРЕД шт.» как на листе Нарезка. Дрессуру не дробим. */
function chewSubToken_(sub) {
  const u = String(sub || "")
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/\s+/g, " ")
    .trim();
  if (!u) return "";
  if (/ПОЛОВИН/.test(u)) return "ПОЛОВИНКА";
  if (/ОЧ\s*МАЛ|ОЧЕНЬ/.test(u)) return "ОЧ МАЛ";
  if (/ОГР|ОГРОМ|ГИГАНТ|РОГАЛ/.test(u)) return "ОГР";
  if (/ПАЛК|ПАЛОЧ/.test(u)) return "ПАЛК";
  if (/ПЛАСТ/.test(u)) return "ПЛАСТ";
  if (/БОЛ|БОЛЬШ/.test(u)) return "БОЛ";
  if (/СРЕД/.test(u)) return "СРЕД";
  if (/(^|[^А-ЯA-Z0-9])МАЛ([^А-ЯA-Z0-9]|$)|МЕЛК/.test(u)) return "МАЛ";
  return u;
}

function cuttingNameFromBasketItem_(it) {
  const name = String((it && (it.main || it.name)) || "").trim();
  if (!name) return "";
  const sub = String((it && it.sub) || "").trim();
  const piece = isPieceSku_(name, it && it.cat, it && it.unit);
  if (!piece || !sub) return name;
  const nu = name.toUpperCase().replace(/Ё/g, "Е");
  const tok = chewSubToken_(sub);
  if (!tok) return name;
  if (nu.indexOf(tok) >= 0) return name;
  const base = name.replace(/\s*шт\.?\s*$/i, "").trim();
  return base + " " + tok + " шт.";
}

function cuttingItemsFromPeople_(people, warehouseItems) {
  const coefByName = Object.create(null);
  (warehouseItems || []).forEach(function (w) {
    const nm = String((w && w.name) || "").trim().toUpperCase();
    if (!nm) return;
    coefByName[nm] = Number(w.coef) || 0.2;
  });
  const acc = Object.create(null);
  (people || []).forEach(function (p) {
    if (p && (p.noCut || /\[НЕ\s*РЕЗАТЬ\]/i.test(String(p.note || "")))) return;
    (p.basket || []).forEach(function (it) {
      const name = cuttingNameFromBasketItem_(it);
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
        row: 0,
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

function cutNameKey_(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/\s+/g, " ")
    .trim();
}

function cutFuzzyKey_(name) {
  return cutNameKey_(name)
    .replace(/ШТ\.?/g, "")
    .replace(/[^A-ZА-Я0-9]+/g, "");
}

function cuttingFlagScore_(items) {
  let n = 0;
  (items || []).forEach(function (it) {
    if (!it) return;
    if (it.laid) n += 1;
    if (it.done) n += 2;
    if (it.outNext) n += 1;
  });
  return n;
}

function normalizeCuttingItemFlags_(it) {
  if (!it || typeof it !== "object") return it;
  it.laid = toBool_(it.laid);
  it.done = toBool_(it.done);
  it.outNext = toBool_(it.outNext);
  return it;
}

function normalizeCuttingItems_(items) {
  return (items || []).map(function (it) {
    return normalizeCuttingItemFlags_(it);
  });
}

function findPrevCuttingByName_(prevItems, item) {
  if (!item) return null;
  const nk = cutNameKey_(item.name);
  const fz = cutFuzzyKey_(item.name);
  if (!nk && !fz) return null;
  for (let i = 0; i < (prevItems || []).length; i++) {
    const p = prevItems[i];
    if (!p) continue;
    if (nk && cutNameKey_(p.name) === nk) return p;
    if (fz && cutFuzzyKey_(p.name) === fz) return p;
  }
  return null;
}

function isCuttingSheetRow_(row) {
  const n = Number(row);
  return n >= 3 && n <= 48 && n % 1 === 0;
}

function sameCutDate_(a, b) {
  const sa = String(a || "").trim();
  const sb = String(b || "").trim();
  if (!sa || !sb) return true;
  if (sa === sb) return true;
  function toIso(s) {
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return dmyToIso_(s);
  }
  const ia = toIso(sa);
  const ib = toIso(sb);
  return !!(ia && ib && ia === ib);
}

function cuttingRowsMapFromItems_(items, into) {
  const map = into || Object.create(null);
  (items || []).forEach(function (it) {
    if (!it || !isCuttingSheetRow_(it.row)) return;
    const k = cutNameKey_(it.name);
    const fz = cutFuzzyKey_(it.name);
    if (k) map[k] = Number(it.row);
    if (fz) map[fz] = Number(it.row);
  });
  return map;
}

function resolveCuttingSheetRows_(items, prevItems, catalogMap) {
  const map = cuttingRowsMapFromItems_(prevItems, Object.assign(Object.create(null), catalogMap || {}));
  (items || []).forEach(function (it) {
    if (!it) return;
    if (isCuttingSheetRow_(it.row)) return;
    const hit = map[cutNameKey_(it.name)] || map[cutFuzzyKey_(it.name)];
    it.row = isCuttingSheetRow_(hit) ? Number(hit) : 0;
  });
  return items;
}

function patchCuttingItemsFlags_(items, params, proxied) {
  params = params || {};
  const list = Array.isArray(items) ? items : [];
  const rowNum = Number(params.row);
  const wantName = cutNameKey_(params.name || "");
  const wantFz = cutFuzzyKey_(params.name || "");
  let idx = -1;
  if (wantName || wantFz) {
    for (let i = 0; i < list.length; i++) {
      const n = cutNameKey_(list[i] && list[i].name);
      const fz = cutFuzzyKey_(list[i] && list[i].name);
      if ((wantName && n === wantName) || (wantFz && fz && fz === wantFz)) {
        idx = i;
        break;
      }
    }
  }
  // row — только если имя не задано (иначе галочка на другой позиции с тем же row)
  if (idx < 0 && !wantName && !wantFz && isCuttingSheetRow_(rowNum)) {
    for (let i = 0; i < list.length; i++) {
      if (Number(list[i].row) === rowNum) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0 && rowNum && !wantName && !wantFz) {
    for (let i = 0; i < list.length; i++) {
      if (Number(list[i].row) === rowNum) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return { items: list, found: false, row: rowNum || 0 };
  const it = list[idx];
  function take(key) {
    if (params[key] != null && params[key] !== "") return toBool_(params[key]);
    if (proxied && proxied[key] !== undefined) return !!proxied[key];
    return null;
  }
  const laid = take("laid");
  const done = take("done");
  const outNext = take("outNext");
  if (laid !== null) it.laid = laid;
  if (done !== null) it.done = done;
  if (outNext !== null) it.outNext = outNext;
  if (params.surplus != null && params.surplus !== "") it.surplus = Number(params.surplus) || 0;
  if (params.noteInfo != null) it.noteInfo = String(params.noteInfo);
  if (isCuttingSheetRow_(rowNum)) it.row = rowNum;
  else if (proxied && isCuttingSheetRow_(proxied.row)) it.row = Number(proxied.row);
  return { items: list, found: true, row: Number(it.row) || rowNum || 0 };
}

async function rememberCuttingRows_(env, items) {
  if (!env || !env.DB) return;
  const add = cuttingRowsMapFromItems_(items);
  if (!Object.keys(add).length) return;
  try {
    const prev = (await getSnapRaw_(env, "cuttingRows")) || { map: {} };
    const map = Object.assign({}, prev.map || {}, add);
    await putSnap_(env, "cuttingRows", { map: map, cachedAt: new Date().toISOString() });
  } catch (eCat) {}
}

async function applyCuttingFlagToSnap_(params, env, proxied) {
  const day = String((params && params.day) || "");
  if (!day) return null;
  let snap = await getSnapRaw_(env, "cutting:" + day);
  if (!snap || !Array.isArray(snap.items)) {
    try {
      snap = await getCutting_({ day: day }, env);
    } catch (eCut) {
      snap = { status: "success", day: day, items: [] };
    }
  }
  const items = Array.isArray(snap.items) ? snap.items.slice() : [];
  const patched = patchCuttingItemsFlags_(items, params, proxied);
  snap.items = patched.items;
  snap.fromGas = true;
  snap.fromD1 = false;
  snap.fromOrders = false;
  snap.fromCalendar = false;
  snap.flagsTouchedAt = Date.now();
  snap.cachedAt = new Date().toISOString();
  await putSnap_(env, "cutting:" + day, snap);
  try {
    await rememberCuttingRows_(env, snap.items);
  } catch (eR) {}
  return snap;
}

function overlayCuttingKeepFlags_(newItems, prevItems, sameDate) {
  if (!sameDate || !prevItems || !prevItems.length) {
    return normalizeCuttingItems_(mergeCuttingFlags_(newItems, prevItems, sameDate));
  }
  const qtyByKey = Object.create(null);
  const qtyByFuzzy = Object.create(null);
  (newItems || []).forEach(function (it) {
    if (!it) return;
    qtyByKey[cutNameKey_(it.name)] = it;
    const fz = cutFuzzyKey_(it.name);
    if (fz) qtyByFuzzy[fz] = it;
  });
  const used = Object.create(null);
  const out = [];
  prevItems.forEach(function (p) {
    if (!p) return;
    const n = qtyByKey[cutNameKey_(p.name)] || qtyByFuzzy[cutFuzzyKey_(p.name)];
    if (n) {
      used[cutNameKey_(n.name)] = true;
      used[cutFuzzyKey_(n.name)] = true;
      // база — свежий план (row/qty); флаги только от той же позиции по имени
      out.push(
        normalizeCuttingItemFlags_(
          Object.assign({}, n, {
            laid: !!p.laid,
            done: !!p.done,
            outNext: !!p.outNext,
            surplus: p.surplus != null && p.surplus !== "" ? Number(p.surplus) || 0 : n.surplus,
            noteInfo: p.noteInfo || n.noteInfo
          })
        )
      );
    }
    // не тащить «призраков» с флагами — иначе синий/зелёный без позиции в плане
  });
  (newItems || []).forEach(function (n) {
    if (!n) return;
    if (used[cutNameKey_(n.name)] || used[cutFuzzyKey_(n.name)]) return;
    out.push(normalizeCuttingItemFlags_(n));
  });
  return out;
}

function transferOnlyFromPeople_(people) {
  const map = Object.create(null);
  const clients = [];
  (people || []).forEach(function (p) {
    if (!(p && (p.noCut || /\[НЕ\s*РЕЗАТЬ\]/i.test(String(p.note || ""))))) return;
    clients.push(p.name);
    (p.basket || []).forEach(function (it) {
      const name = String((it && (it.main || it.name)) || "").trim();
      const sub = String((it && it.sub) || "").trim();
      const val = Number(it && (it.value != null ? it.value : it.val)) || 0;
      if (!name || !(val > 0)) return;
      const key = name + (sub ? " / " + sub : "");
      map[key] = (map[key] || 0) + val;
    });
  });
  const lines = Object.keys(map).map(function (k) {
    return { label: k, val: map[k] };
  });
  return { clients: clients, lines: lines };
}

function mergeCuttingFlags_(items, prevItems, sameDate) {
  if (!sameDate || !prevItems || !prevItems.length) return normalizeCuttingItems_(items);
  (items || []).forEach(function (it) {
    const old = findPrevCuttingByName_(prevItems, it);
    if (!old) return;
    // только по имени — row меняется при пересборке, иначе цвет ≠ галочка
    if (old.laid) it.laid = true;
    if (old.done) it.done = true;
    if (old.outNext) it.outNext = true;
    if (old.surplus != null && old.surplus !== "") it.surplus = Number(old.surplus) || 0;
    if (old.noteInfo) it.noteInfo = old.noteInfo;
    if (isCuttingSheetRow_(old.row) && isCuttingSheetRow_(it.row)) it.row = Number(it.row) || Number(old.row);
  });
  return normalizeCuttingItems_(items);
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
    let clientsOut = clients;
    try {
      clientsOut = await filterTombstonedClients_(env, day, clients);
    } catch (eT) {}
    return {
      status: "success",
      day: day,
      date: dmy,
      dateIso: iso,
      clients: clientsOut,
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
    const seg =
      normalizeSegmentLabel_(c.segment) ||
      normalizeSegmentLabel_(c.orderType) ||
      normalizeSegmentLabel_(c.source) ||
      "";
    if (seg === "ПП") segments["ПП"]++;
    else if (seg === "БП") segments["БП"]++;
    else if (seg === "Р") segments["Р"]++;
    else if (seg === "ПАРТНЁР") segments["ПАРТНЁР"]++;
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
      // факт Просмотра важнее и Календаря, и nick-row (там часто дубли/дыры)
      return Object.assign({}, d, {
        count: tallied.count,
        segments: tallied.segments,
        fromView: true,
        fromWeekSheet: !!d.fromWeekSheet
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
      const tallied = countPeopleFromViewPayload_(payload);
      byIso[iso] = Object.assign({}, byIso[iso] || {}, {
        dateIso: iso,
        count: tallied.count,
        segments: tallied.segments,
        fromView: true,
        fromWeekSheet: !!(byIso[iso] && byIso[iso].fromWeekSheet)
      });
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
    "SELECT date_iso, match_key, client, segment, source FROM orders WHERE status = 'active' AND date_iso != ''"
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
    const mk = normalizeMatchKey_(r.match_key || r.client);
    if (!mk) return;
    if (!orderByDate[iso]) {
      orderByDate[iso] = { seen: Object.create(null), count: 0, segments: {} };
    }
    if (orderByDate[iso].seen[mk]) return;
    orderByDate[iso].seen[mk] = true;
    orderByDate[iso].count++;
    const seg =
      normalizeSegmentLabel_(r.segment) ||
      normalizeSegmentLabel_(r.source) ||
      "";
    if (seg === "ПП") orderByDate[iso].segments["ПП"] = (orderByDate[iso].segments["ПП"] || 0) + 1;
    else if (seg === "БП") orderByDate[iso].segments["БП"] = (orderByDate[iso].segments["БП"] || 0) + 1;
    else if (seg === "Р") orderByDate[iso].segments["Р"] = (orderByDate[iso].segments["Р"] || 0) + 1;
    else if (seg === "ПАРТНЁР") orderByDate[iso].segments["ПАРТНЁР"] = (orderByDate[iso].segments["ПАРТНЁР"] || 0) + 1;
    else orderByDate[iso].segments.other = (orderByDate[iso].segments.other || 0) + 1;
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
  const prevBy = sameDate
    ? indexByMatchAliases_((prev && prev.clients) || [])
    : Object.create(null);
  const clients = (live.clients || []).map(function (c) {
    const old = (sameDate && lookupByMatchAliases_(prevBy, c.matchKey || c.name)) || {};
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
      // и nick, и legacy ключ строки deliveries
      matchKeyAliases_(r.match_key).forEach(function (k) {
        flags[k] = !!r.delivered;
      });
      flags[String(r.match_key || "")] = !!r.delivered;
    });
    clients.forEach(function (c) {
      const aliases = matchKeyAliases_(c.matchKey || c.name);
      for (var ai = 0; ai < aliases.length; ai++) {
        if (aliases[ai] in flags) {
          c.delivered = !!flags[aliases[ai]];
          break;
        }
      }
    });
  }
  await putSnap_(env, "courier:" + day, {
    status: "success",
    day: day,
    date: info.date,
    clients: clients,
    sandbox: true,
    source: "d1",
    // иначе после invalidate SWR getCourier/getAssembly сразу перетирает галочки с GAS
    flagsTouchedAt: sameDate ? Number((prev && prev.flagsTouchedAt) || 0) : 0
  });
}

async function rebuildAssemblyDay_(env, day) {
  if (!day) return;
  const live = await getClients_({ day: day }, env);
  const info = await dayDateInfo_(env, day);
  const prev = await getSnapRaw_(env, "assembly:" + day);
  const sameDate =
    !!(prev && prev.date && info.date && String(prev.date) === String(info.date));
  const prevBy = sameDate
    ? indexByMatchAliases_((prev && prev.clients) || [])
    : Object.create(null);
  const clients = (live.clients || []).map(function (c) {
    const old = (sameDate && lookupByMatchAliases_(prevBy, c.matchKey || c.name)) || {};
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
    source: "d1",
    flagsTouchedAt: sameDate ? Number((prev && prev.flagsTouchedAt) || 0) : 0
  });
}

async function rebuildCuttingDay_(env, day) {
  if (!day) return null;
  const live = await getClients_({ day: day }, env);
  const info = await dayDateInfo_(env, day);
  const prev = await getSnapRaw_(env, "cutting:" + day);
  const sameDate = sameCutDate_(prev && prev.date, info.date);
  let wh = [];
  try {
    const wsnap = await getSnapRaw_(env, "warehouse");
    wh = (wsnap && (wsnap.items || wsnap.rows)) || [];
  } catch (eW) {
    wh = [];
  }
  let catalogMap = {};
  try {
    const cat = await getSnapRaw_(env, "cuttingRows");
    catalogMap = (cat && cat.map) || {};
  } catch (eCat) {
    catalogMap = {};
  }
  let items = [];
  try {
    items = cuttingItemsFromPeople_(live.clients || [], wh);
  } catch (eCut) {
    items = [];
  }
  items = overlayCuttingKeepFlags_(items, (prev && prev.items) || [], sameDate);
  items = resolveCuttingSheetRows_(items, (prev && prev.items) || [], catalogMap);
  let transferOnly = { clients: [], lines: [] };
  try {
    transferOnly = transferOnlyFromPeople_(live.clients || []);
  } catch (eTr) {}
  const payload = {
    status: "success",
    day: day,
    date: info.date || "",
    dateIso: info.iso || "",
    items: normalizeCuttingItems_(items),
    session: sameDate ? (prev && prev.session) || {} : {},
    completion: sameDate ? (prev && prev.completion) || null : null,
    transferOnly: transferOnly,
    sandbox: true,
    source: "d1",
    fromD1: true,
    fromOrders: true,
    fromGas: !!(sameDate && prev && prev.fromGas),
    flagsTouchedAt: sameDate ? (prev && prev.flagsTouchedAt) || 0 : 0
  };
  await putSnap_(env, "cutting:" + day, payload);
  try {
    await rememberCuttingRows_(env, items);
  } catch (eRows) {}
  return payload;
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
    try {
      await rebuildCuttingDay_(env, d);
    } catch (eCutInv) {
      await delSnap_(env, "cutting:" + d);
    }
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
  const info = await dayDateInfo_(env, day);
  const wantDate = String((info && info.date) || "");
  let hit = await getSnapRaw_(env, "cutting:" + day);
  if (hit) {
    const snapDate = String((hit && hit.date) || "");
    const dateOk = !wantDate || !snapDate || snapDate === wantDate;
    const staleDone = !!(hit && hit.completion && wantDate && snapDate !== wantDate);
    if (!dateOk || staleDone) hit = null;
  }
  // свежие галочки / GAS-snap — не пересобирать из D1 на каждый poll
  const touched = Number((hit && hit.flagsTouchedAt) || 0);
  if (touched && Date.now() - touched < 600000) {
    if (hit && Array.isArray(hit.items)) hit.items = normalizeCuttingItems_(hit.items);
    return hit;
  }
  if (hit && hit.fromGas && !hit.fromCalendar) {
    if (Array.isArray(hit.items)) hit.items = normalizeCuttingItems_(hit.items);
    return hit;
  }
  if (hit && hit.fromOrders && !hit.fromCalendar) {
    if (Array.isArray(hit.items)) hit.items = normalizeCuttingItems_(hit.items);
    return hit;
  }
  if (hit && !hit.fromD1 && !hit.fromCalendar) {
    if (Array.isArray(hit.items)) hit.items = normalizeCuttingItems_(hit.items);
    return hit;
  }
  try {
    const rebuilt = await rebuildCuttingDay_(env, day);
    if (rebuilt && rebuilt.status === "success") return rebuilt;
  } catch (eReb) {}
  return hit;
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
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(dateIso)) dateIso = dmyToIso_(dateIso) || dateIso;

  // Дата вне текущей (возможно незакрытой) недели → только календарь.
  // Иначе day=Вт из селекта + date=25.08 писало в слот старой недели / в Понедельник.
  let dateOnWeek = false;
  if (dateIso) {
    try {
      const r = await resolveDay_({ date: dateIso }, env);
      if (r && r.onWeek && r.dayName) {
        dateOnWeek = true;
        day = String(r.dayName);
      } else {
        day = "";
      }
    } catch (eResDay) {
      day = "";
    }
  }
  if (!asBooking && !day && !dateIso) day = "Понедельник";
  if (!day && !dateIso) {
    return { status: "error", message: "no_day_or_date" };
  }

  const matchKey = normalizeMatchKey_(params.matchKey || client);
  const now = new Date().toISOString();
  const id = (day || "CAL") + ":" + matchKey + (day ? "" : ":" + dateIso);
  const basketArr = parseBasket_(params.basket);
  const basket = JSON.stringify(basketArr);
  const segSave = segmentFromOrderParams_(params);
  const srcSave =
    String(params.source || "").trim() || sourceFromSegment_(segSave) || "";
  // writeGuard ДО upsert — иначе waitUntil-delete между upsert и guard сносит строку
  try {
    if (day && matchKey && !toBool_(params.fromAfterWrite)) {
      await putSnap_(env, "writeGuard:" + String(day) + ":" + matchKey, {
        day: String(day),
        mk: matchKey,
        at: Date.now()
      });
      try {
        await putMoveArriveProtect_(env, day, matchKey, client);
      } catch (eProtSave) {}
    }
  } catch (eWgEarly) {}
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
    couponPrice: params.couponPrice,
    segment: segSave,
    orderType: params.orderType || srcSave
  };

  // soft-delete duplicates with other key forms
  await env.DB.prepare(
    "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND day_name = ? AND (match_key = ? OR lower(client) = ?) AND id != ?"
  )
    .bind(now, day || "", matchKey, client.toLowerCase(), id)
    .run();

  // календарь-only: снести дубли на той же date_iso (в т.ч. ошибочно записанные в Пн/Вт)
  if (!day && dateIso) {
    try {
      await env.DB.prepare(
        "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND date_iso = ? AND (match_key = ? OR lower(client) = ?) AND id != ?"
      )
        .bind(now, dateIso, matchKey, client.toLowerCase(), id)
        .run();
    } catch (eCalDup) {}
  }

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
    segment: segSave,
    source: srcSave,
    status: "active",
    updated_at: now,
    meta_json: JSON.stringify(meta)
  });

  // новый save снимает tombstone только на этом дне (не на всех — иначе ломает move)
  // afterWrite/повтор не снимает свежий tombstone удаления
  try {
    if (day && !toBool_(params._keepTombstone) && !toBool_(params.fromAfterWrite)) {
      await clearTombstonesForMatch_(env, matchKey, day);
    }
  } catch (eClrT) {}
  // метка свежей записи — фоновый deleteClient из waitUntil не должен сносить save
  try {
    if (day && matchKey) {
      await putSnap_(env, "writeGuard:" + String(day) + ":" + matchKey, {
        day: String(day),
        mk: matchKey,
        at: Date.now()
      });
    }
  } catch (eWg) {}
  // клиент только на одном дне недели; иначе stale moveEpoch прячет из getClients
  if (day && matchKey) {
    try {
      await env.DB.prepare(
        "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND day_name != ? AND day_name != '' AND (match_key = ? OR match_key = ? OR lower(client) = ?)"
      )
        .bind(now, day, matchKey, client.toLowerCase(), client.toLowerCase())
        .run();
    } catch (eDelOther) {}
    // календарь-only (day_name пустой) — иначе дубль «неделя + дата»
    try {
      await env.DB.prepare(
        "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND day_name = '' AND (match_key = ? OR match_key = ? OR lower(client) = ?)"
      )
        .bind(now, matchKey, client.toLowerCase(), client.toLowerCase())
        .run();
    } catch (eDelCal) {}
    try {
      await setMoveEpochDay_(env, matchKey, day, client);
    } catch (eEpSave) {}
  }

  await invalidateDays_(env, day ? [day] : []);
  return {
    status: "success",
    sandbox: true,
    wrote: basketArr.length || 1,
    basketLen: basketArr.length,
    weekWritten: !!day,
    calendarOnly: !day && !!dateIso,
    dateOnWeek: dateOnWeek,
    id: id,
    segment: segSave,
    source: srcSave,
    updatedAt: now
  };
}

// Перенос/удаление: GAS часто отстаёт — tombstone держит D1/UI от «воскрешения»
const TOMBSTONE_MS = 48 * 60 * 60 * 1000;

async function putDeleteTombstone_(env, day, matchKey) {
  const mk = normalizeMatchKey_(matchKey);
  // day="" — календарный tomb (дата вне недели)
  if (!env || !mk) return;
  if (day == null) return;
  const now = Date.now();
  var keys = [mk];
  var rawUp = String(matchKey || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е");
  if (rawUp && rawUp !== mk) keys.push(rawUp);
  // per-key snap — переживает RMW-гонку списка deleteTombstones
  for (var ki = 0; ki < keys.length; ki++) {
    if (!keys[ki]) continue;
    try {
      await putSnap_(env, "delTomb:" + String(day) + ":" + keys[ki], {
        day: String(day),
        mk: keys[ki],
        at: now
      });
    } catch (ePK) {}
  }
  // день с свежим tomb — чтобы getClients не уходил в GAS при RMW-потере списка
  try {
    await putSnap_(env, "tombDay:" + String(day), { day: String(day), at: now });
  } catch (eTD) {}
  // legacy list (best-effort merge, 2 попытки)
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      const prev = (await getSnapRaw_(env, "deleteTombstones")) || { items: [] };
      const items = (prev.items || []).filter(function (t) {
        return t && now - Number(t.at || 0) < TOMBSTONE_MS;
      });
      keys.forEach(function (k) {
        if (!k) return;
        var exists = items.some(function (t) {
          return t && String(t.day) === String(day) && t.mk === k;
        });
        if (!exists) items.push({ day: String(day), mk: k, at: now });
      });
      await putSnap_(env, "deleteTombstones", { items: items });
      break;
    } catch (eList) {}
  }
}

async function clearTombstonesForMatch_(env, matchKey, day, clientName) {
  const mk = normalizeMatchKey_(matchKey);
  if (!env || (!mk && !matchKey && !clientName)) return;
  try {
    const prev = (await getSnapRaw_(env, "deleteTombstones")) || { items: [] };
    const now = Date.now();
    // putDeleteTombstone_ пишет и нормализованный handle, и «СЫРОЕ ИМЯ» —
    // иначе обратный перенос на день с tombstone «ЕВГЕНИЯ ZZZ_…» прячет клиента из getClients.
    var clearKeys = Object.create(null);
    function addKey_(raw) {
      var n = normalizeMatchKey_(raw);
      if (n) clearKeys[n] = true;
      var up = String(raw || "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase()
        .replace(/Ё/g, "Е");
      if (up) clearKeys[up] = true;
    }
    addKey_(matchKey);
    addKey_(mk);
    addKey_(clientName);
    const items = (prev.items || []).filter(function (t) {
      if (!t || now - Number(t.at || 0) >= TOMBSTONE_MS) return false;
      // day="" — только «календарные» tomb (пустой day), НЕ все дни матча
      if (day) {
        if (String(t.day) !== String(day)) return true;
      } else {
        if (String(t.day || "") !== "") return true;
      }
      if (t.mk && clearKeys[t.mk]) return false;
      if (
        nicksLooseMatch_(t.mk, matchKey) ||
        nicksLooseMatch_(t.mk, mk) ||
        nicksLooseMatch_(t.mk, clientName)
      ) {
        return false;
      }
      return true;
    });
    
    if (day) {
      var keyList = Object.keys(clearKeys);
      for (var ck = 0; ck < keyList.length; ck++) {
        try {
          await env.DB.prepare("DELETE FROM snap_cache WHERE cache_key = ?")
            .bind("delTomb:" + String(day) + ":" + keyList[ck])
            .run();
        } catch (ePKD) {}
      }
    }
await putSnap_(env, "deleteTombstones", { items: items });
  } catch (eClr) {}
}

function isTombstoned_(tomb, day, matchKey, name, protect) {
  const mk = normalizeMatchKey_(matchKey || name);
  const mkName = normalizeMatchKey_(name);
  const now = Date.now();
  var tombAt = 0;
  var hit = ((tomb && tomb.items) || []).some(function (t) {
    if (!t || String(t.day) !== String(day)) return false;
    if (now - Number(t.at || 0) > TOMBSTONE_MS) return false;
    var matched =
      t.mk === mk ||
      (mkName && t.mk === mkName) ||
      nicksLooseMatch_(t.mk, name) ||
      nicksLooseMatch_(t.mk, matchKey);
    if (matched) tombAt = Math.max(tombAt, Number(t.at || 0));
    return matched;
  });
  if (!hit) return false;
  // protect побеждает только если новее tombstone (свежий приход), не старый protect с прошлого визита
  if (isMoveArriveProtectedNewerThan_(protect, day, matchKey, name, tombAt)) return false;
  return true;
}

/** Короткий protect после upsert на день назначения — переживает гонку tombstone/фонового delete. */
const MOVE_ARRIVE_PROTECT_MS = 3 * 60 * 1000;

async function putMoveArriveProtect_(env, day, matchKey, clientName) {
  if (!env || !day) return;
  var mk = normalizeMatchKey_(matchKey || clientName);
  if (!mk) return;
  try {
    var prev = (await getSnapRaw_(env, "moveArriveProtect")) || { items: [] };
    var now = Date.now();
    var items = (prev.items || []).filter(function (t) {
      return t && now - Number(t.at || 0) < MOVE_ARRIVE_PROTECT_MS;
    });
    items.push({
      day: String(day),
      mk: mk,
      raw: String(clientName || matchKey || "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase()
        .replace(/Ё/g, "Е"),
      at: now
    });
    await putSnap_(env, "moveArriveProtect", { items: items });
  } catch (eP) {}
}

function isMoveArriveProtected_(protect, day, matchKey, name) {
  var mk = normalizeMatchKey_(matchKey || name);
  var mkName = normalizeMatchKey_(name);
  var now = Date.now();
  return ((protect && protect.items) || []).some(function (t) {
    if (!t || String(t.day) !== String(day)) return false;
    if (now - Number(t.at || 0) > MOVE_ARRIVE_PROTECT_MS) return false;
    if (t.mk && (t.mk === mk || (mkName && t.mk === mkName))) return true;
    return (
      nicksLooseMatch_(t.mk, name) ||
      nicksLooseMatch_(t.mk, matchKey) ||
      nicksLooseMatch_(t.raw, name) ||
      nicksLooseMatch_(t.raw, matchKey)
    );
  });
}

/** Клиент только что приехал на другой день — не возвращать на этот день из GAS. */
function isMoveArriveProtectedElsewhere_(protect, day, matchKey, name) {
  var mk = normalizeMatchKey_(matchKey || name);
  var mkName = normalizeMatchKey_(name);
  var now = Date.now();
  return ((protect && protect.items) || []).some(function (t) {
    if (!t || !t.day || String(t.day) === String(day)) return false;
    if (now - Number(t.at || 0) > MOVE_ARRIVE_PROTECT_MS) return false;
    if (t.mk && (t.mk === mk || (mkName && t.mk === mkName))) return true;
    return (
      nicksLooseMatch_(t.mk, name) ||
      nicksLooseMatch_(t.mk, matchKey) ||
      nicksLooseMatch_(t.raw, name) ||
      nicksLooseMatch_(t.raw, matchKey)
    );
  });
}

/** protect перекрывает tombstone только если он новее (только что пришли), не старый protect. */
function isMoveArriveProtectedNewerThan_(protect, day, matchKey, name, tombAt) {
  var mk = normalizeMatchKey_(matchKey || name);
  var mkName = normalizeMatchKey_(name);
  var now = Date.now();
  var tombMs = Number(tombAt || 0);
  return ((protect && protect.items) || []).some(function (t) {
    if (!t || String(t.day) !== String(day)) return false;
    var at = Number(t.at || 0);
    if (now - at > MOVE_ARRIVE_PROTECT_MS) return false;
    if (tombMs && at < tombMs) return false;
    if (t.mk && (t.mk === mk || (mkName && t.mk === mkName))) return true;
    return (
      nicksLooseMatch_(t.mk, name) ||
      nicksLooseMatch_(t.mk, matchKey) ||
      nicksLooseMatch_(t.raw, name) ||
      nicksLooseMatch_(t.raw, matchKey)
    );
  });
}

/** Снять arrive-protect при уходе с дня — иначе protect перекрывает tombstone и GAS возвращает человека. */
async function clearMoveArriveProtect_(env, day, matchKey, clientName, onlyAtOrBefore) {
  if (!env || !day) return;
  var mk = normalizeMatchKey_(matchKey || clientName);
  if (!mk && !clientName) return;
  var cutoff = Number(onlyAtOrBefore || 0) || 0;
  try {
    var prev = (await getSnapRaw_(env, "moveArriveProtect")) || { items: [] };
    var now = Date.now();
    var items = (prev.items || []).filter(function (t) {
      if (!t || now - Number(t.at || 0) >= MOVE_ARRIVE_PROTECT_MS) return false;
      if (String(t.day) !== String(day)) return true;
      var at = Number(t.at || 0);
      // stale clear старого move не снимает более новый arrive (обратный перенос)
      if (cutoff && at && at > cutoff) return true;
      if (t.mk && (t.mk === mk || nicksLooseMatch_(t.mk, matchKey) || nicksLooseMatch_(t.mk, clientName)))
        return false;
      if (nicksLooseMatch_(t.raw, matchKey) || nicksLooseMatch_(t.raw, clientName)) return false;
      return true;
    });
    await putSnap_(env, "moveArriveProtect", { items: items });
  } catch (eClrP) {}
}

async function filterTombstonedClients_(env, day, list, opts) {
  opts = opts || {};
  if (!list || !list.length) return list || [];
  var dayKey = String(day || "").trim();
  var dateIso = String(opts.dateIso || opts.date || "").trim();
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(dateIso)) dateIso = dmyToIso_(dateIso) || dateIso;
  // calendar-only: day пустой — всё равно фильтруем по delTomb:CAL:dateIso
  if (!dayKey && !dateIso) return list || [];
  try {
    var tomb = (await getSnapRaw_(env, "deleteTombstones")) || { items: [] };
    var items = (tomb.items || []).slice();
    // подмешать per-key delTomb:* (устойчивы к RMW)
    try {
      for (var fi = 0; fi < list.length; fi++) {
        var c0 = list[fi];
        if (!c0) continue;
        var mk0 = normalizeMatchKey_(c0.matchKey || c0.name || c0.client || "");
        if (!mk0) continue;
        if (dayKey) {
          var pk = await getSnapRaw_(env, "delTomb:" + String(dayKey) + ":" + mk0);
          if (pk && pk.mk && !pk.cleared && Number(pk.at || 0) > 0) items.push(pk);
        }
        if (dateIso) {
          var pkCal = await getSnapRaw_(env, "delTomb:CAL:" + dateIso + ":" + mk0);
          if (pkCal && pkCal.mk && !pkCal.cleared && Number(pkCal.at || 0) > 0) items.push(pkCal);
        }
      }
    } catch (ePK) {}
    tomb = { items: items };
    var protect = null;
    try {
      protect = await getSnapRaw_(env, "moveArriveProtect");
    } catch (ePr) {
      protect = null;
    }
    var out = [];
    for (var fi2 = 0; fi2 < list.length; fi2++) {
      var c = list[fi2];
      if (!c) continue;
      if (
        items.length &&
        dayKey &&
        isTombstoned_(
          tomb,
          dayKey,
          c.matchKey || c.name,
          c.name || c.client,
          protect
        )
      ) {
        continue;
      }
      // calendar-only tomb: delTomb:CAL:dateIso:mk
      if (dateIso) {
        try {
          var mkC = normalizeMatchKey_(c.matchKey || c.name || c.client || "");
          if (mkC) {
            var pkDirect = await getSnapRaw_(env, "delTomb:CAL:" + dateIso + ":" + mkC);
            if (pkDirect && pkDirect.mk && !pkDirect.cleared && Number(pkDirect.at || 0) > 0) continue;
          }
        } catch (eD) {}
      }
      // moveEpoch: скрывать с чужого дня при merge GAS; D1-строка day уже authoritative
      if (!opts.skipMoveEpoch && dayKey) {
        try {
          var mkEp = normalizeMatchKey_(c.matchKey || c.name || c.client || "");
          if (mkEp) {
            var ep = await getSnapRaw_(env, "moveEpoch:" + mkEp);
            if (ep && ep.to && String(ep.to) !== String(dayKey)) continue;
          }
        } catch (eEpF) {}
      }
      out.push(c);
    }
    return out;
  } catch (eT) {
    return list;
  }
}

/** Есть ли свежий tombstone на день (удаление/перенос ещё не «устарел»). */
async function dayHasFreshTombstone_(env, day) {
  if (!env || !day) return false;
  try {
    const now = Date.now();
    try {
      const td = await getSnapRaw_(env, "tombDay:" + String(day));
      if (td && now - Number(td.at || 0) < TOMBSTONE_MS) return true;
    } catch (eTd) {}
    const tomb = await getSnapRaw_(env, "deleteTombstones");
    return ((tomb && tomb.items) || []).some(function (t) {
      return t && String(t.day) === String(day) && now - Number(t.at || 0) < TOMBSTONE_MS;
    });
  } catch (e) {
    return false;
  }
}

/** GAS getClients → убрать tombstone, иначе UI сразу «воскрешает» удалённых. */
async function sanitizeGasClientsPayload_(env, day, live) {
  if (!live || typeof live !== "object") return live;
  if (!day || !Array.isArray(live.clients)) return live;
  try {
    live.clients = await filterTombstonedClients_(env, day, live.clients);
  } catch (eS) {}
  return live;
}

/** Фоновый delete (waitUntil) не должен сносить D1-строку, записанную save ПОСЛЕ старта delete.
 * Явный delete из UI / force — всегда сносить: иначе move afterWrite upsert → skippedStaleDelete
 * и клиент «не удаляется» на Вт–Вс после недавнего переноса. */
async function deleteWouldEraseFreshWrite_(env, params, liveRow, day, mk, deleteStartedAt) {
  if (!env || !liveRow || String(liveRow.status || "") !== "active") return false;
  if (
    toBool_(params && params._explicitDelete) ||
    toBool_(params && params._userDelete) ||
    toBool_(params && params.force)
  ) {
    return false;
  }
  const started = Number(
    deleteStartedAt || (params && (params._deleteStartedAt || params.deleteStartedAt)) || 0
  );
  if (!started) return false;
  const rowDay = String(liveRow.day_name || day || "");
  const rowMk = normalizeMatchKey_(liveRow.match_key || mk);
  let guardAt = 0;
  try {
    const g = await getSnapRaw_(env, "writeGuard:" + rowDay + ":" + rowMk);
    guardAt = Number((g && g.at) || 0);
  } catch (eG) {}
  const rowAt = Date.parse(String(liveRow.updated_at || "")) || 0;
  const freshMs = Math.max(rowAt, guardAt);
  return !!(freshMs && freshMs >= started - 250);
}

/** Есть свежий delete-tombstone на день+клиент (не воскрешать из move afterWrite). */
async function hasFreshDeleteTombstone_(env, day, matchKey, clientName) {
  if (!env || !day) return false;
  const mk = normalizeMatchKey_(matchKey || clientName);
  if (!mk && !clientName) return false;
  try {
    const tomb = (await getSnapRaw_(env, "deleteTombstones")) || { items: [] };
    const items = (tomb.items || []).slice();
    try {
      const pk = await getSnapRaw_(env, "delTomb:" + String(day) + ":" + mk);
      if (pk && pk.mk && !pk.cleared) items.push(pk);
    } catch (ePk) {}
    return isTombstoned_({ items: items }, day, mk, clientName, null);
  } catch (e) {
    return false;
  }
}

async function clearWriteGuard_(env, day, matchKey) {
  const mk = normalizeMatchKey_(matchKey);
  if (!env || !env.DB || !day || !mk) return;
  try {
    await env.DB.prepare("DELETE FROM snap_cache WHERE cache_key = ?")
      .bind("writeGuard:" + String(day) + ":" + mk)
      .run();
  } catch (e) {}
}

async function deleteClient_(params, env) {
  if (!env || !env.DB) return { status: "error", message: "no_d1" };
  let day = String(params.day || "");
  let dateIso = String(params.date || params.dateIso || "").trim();
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(dateIso)) dateIso = dmyToIso_(dateIso) || dateIso;
  const client = String(params.client || "").trim();
  const matchKeyRaw = params.matchKey || client;
  const mk = normalizeMatchKey_(matchKeyRaw);
  const deleteStartedAt = Number(
    (params && (params._deleteStartedAt || params.deleteStartedAt)) || 0
  );
  // move afterWrite: только указанный день — НЕ искать клиента на newDay и не сносить arrive
  const strictDay = toBool_(params._strictDay) || toBool_(params.strictDay);
  let calendarOnly =
    toBool_(params.calendarOnly) ||
    toBool_(params._calendarOnly) ||
    /^removeCalendarClient$/i.test(String((params && params.action) || ""));
  if (!mk && !client) return { status: "error", message: "no_client" };
  if (!day && !dateIso) return { status: "error", message: "need_day_or_date" };

  // removeCalendar / дата вне недели: не тащить day=Вт из UI — сносим по date_iso
  if (dateIso) {
    try {
      const rCal = await resolveDay_({ date: dateIso }, env);
      if (!(rCal && rCal.onWeek && rCal.dayName)) {
        calendarOnly = true;
        day = "";
      }
    } catch (eCalDay) {
      if (calendarOnly) day = "";
    }
  }

  // Сегодняшний пн часто = «Будущая неделя»: UI мог прислать day=Понедельник + date=сегодня.
  // Ищем реальный слот клиента и tombstone'им все кандидаты, иначе success без эффекта.
  const daysToClear = [];
  function addDay_(d) {
    d = String(d || "").trim();
    if (d && daysToClear.indexOf(d) < 0) daysToClear.push(d);
  }
  if (!calendarOnly) addDay_(day);
  if (dateIso && !strictDay && !calendarOnly) {
    try {
      const r = await resolveDay_({ date: dateIso }, env);
      if (r && r.onWeek && r.dayName) addDay_(r.dayName);
    } catch (eRes) {}
    try {
      let counts = await getSnapRaw_(env, "weekDayCountsSheet");
      if (!counts || !Array.isArray(counts.items)) counts = await getSnapRaw_(env, "weekDayCounts");
      const byC = dayForDateFromCounts_(counts, dateIso);
      if (byC) addDay_(byC);
    } catch (eC) {}
  }

  let homeRow = null;
  try {
    if (day && !calendarOnly) homeRow = await findOrderRow_(env, matchKeyRaw, day, "", client);
    if (!homeRow && dateIso) homeRow = await findOrderRow_(env, matchKeyRaw, "", dateIso, client);
    // НЕ findActiveOrderByMatch_ при strictDay / calendarOnly — иначе снос чужого слота
    if (!homeRow && !strictDay && !calendarOnly) homeRow = await findActiveOrderByMatch_(env, matchKeyRaw, client);
  } catch (eHome) {
    homeRow = null;
  }
  if (homeRow && !strictDay && !calendarOnly) {
    if (homeRow.day_name) addDay_(homeRow.day_name);
    if (!dateIso && homeRow.date_iso) dateIso = String(homeRow.date_iso || "");
    // канонический day для GAS afterWrite — где человек реально сидит
    if (homeRow.day_name) day = String(homeRow.day_name);
  } else if (!day && daysToClear.length) {
    day = daysToClear[0];
  } else if (day && daysToClear.length > 1 && daysToClear.indexOf(day) >= 0 && !strictDay) {
    // если дата указывает на другой слот (Будущая) — предпочитаем его при отсутствии home
    for (let di = 0; di < daysToClear.length; di++) {
      if (daysToClear[di] === "Будущая неделя") {
        day = "Будущая неделя";
        break;
      }
    }
  }

  // чтобы waitUntil → GAS deleteClient шёл в правильный лист
  try {
    params.day = day;
    if (dateIso) {
      params.date = dateIso;
      params.dateIso = dateIso;
    }
  } catch (ePar) {}

  for (let ti = 0; ti < daysToClear.length; ti++) {
    try {
      await clearMoveArriveProtect_(env, daysToClear[ti], matchKeyRaw, client, Date.now());
    } catch (eClrProt) {}
  }

  // waitUntil/afterWrite delete, начатый до save — не трогать свежую D1-запись
  // (явный UI-delete сюда не попадает — deleteWouldEraseFreshWrite_ = false)
  try {
    let liveGuard =
      homeRow ||
      (day ? await findOrderRow_(env, matchKeyRaw, day, dateIso, client) : null) ||
      (await findActiveOrderByMatch_(env, matchKeyRaw, client));
    if (
      liveGuard &&
      (await deleteWouldEraseFreshWrite_(env, params, liveGuard, day, mk, deleteStartedAt))
    ) {
      return {
        status: "success",
        sandbox: true,
        wrote: 0,
        skippedStaleDelete: true,
        d1Verified: true,
        day: day,
        daysCleared: daysToClear
      };
    }
  } catch (eStaleDel) {}

  // снять writeGuard на целевых днях — иначе concurrent afterWrite + verify снова «stale»
  try {
    for (let wg = 0; wg < daysToClear.length; wg++) {
      await clearWriteGuard_(env, daysToClear[wg], matchKeyRaw || client);
      if (client) await clearWriteGuard_(env, daysToClear[wg], client);
    }
  } catch (eWgClr) {}

  const now = new Date().toISOString();
  let changed = 0;
  const touchedIds = Object.create(null);

  async function softDeleteRow_(row) {
    if (!row || !row.id || touchedIds[row.id]) return;
    touchedIds[row.id] = true;
    try {
      const res = await env.DB.prepare(
        "UPDATE orders SET status = 'deleted', updated_at = ? WHERE id = ?"
      )
        .bind(now, row.id)
        .run();
      changed += Number((res && res.meta && res.meta.changes) || 0) || 1;
    } catch (eRow) {}
  }

  async function softDeleteScan_(whereSql, bindArgs) {
    try {
      const stmt = env.DB.prepare(
        "SELECT * FROM orders WHERE status = 'active' AND " + whereSql + " LIMIT 200"
      );
      const bound = bindArgs && bindArgs.length ? stmt.bind.apply(stmt, bindArgs) : stmt;
      const all = await bound.all();
      const list = (all && all.results) || [];
      for (let i = 0; i < list.length; i++) {
        if (orderRowLooseMatch_(list[i], matchKeyRaw, client)) {
          await softDeleteRow_(list[i]);
        }
      }
    } catch (eScan) {}
  }

  // СНАЧАЛА tombstone на ВСЕХ слотах-кандидатах (Пн + Будущая)
  try {
    for (let tj = 0; tj < daysToClear.length; tj++) {
      await putDeleteTombstone_(env, daysToClear[tj], matchKeyRaw || client);
      if (client && normalizeMatchKey_(client) !== mk) {
        await putDeleteTombstone_(env, daysToClear[tj], client);
      }
    }
    if (dateIso && !daysToClear.length) await putDeleteTombstone_(env, "", matchKeyRaw || client);
  } catch (eTomb0) {}

  for (let dj = 0; dj < daysToClear.length; dj++) {
    const dClear = daysToClear[dj];
    await softDeleteScan_("day_name = ?", [dClear]);
    try {
      const aliases = matchKeyAliases_(matchKeyRaw).concat(matchKeyAliases_(client));
      for (let ai = 0; ai < aliases.length; ai++) {
        if (!aliases[ai]) continue;
        const res = await env.DB.prepare(
          "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND day_name = ? AND match_key = ?"
        )
          .bind(now, dClear, aliases[ai])
          .run();
        changed += Number((res && res.meta && res.meta.changes) || 0);
      }
      const res2 = await env.DB.prepare(
        "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND day_name = ? AND lower(client) = ?"
      )
        .bind(now, dClear, client.toLowerCase())
        .run();
      changed += Number((res2 && res2.meta && res2.meta.changes) || 0);
    } catch (eSql) {}
  }
  // обычный delete: ещё снести calendar-only строки клиента
  // calendarOnly: тоже снести day_name='' (раньше пропускали — removeCalendar «успех» без эффекта)
  await softDeleteScan_("day_name = ''", []);
  if (dateIso) {
    await softDeleteScan_("date_iso = ?", [dateIso]);
    try {
      const aliasesD = matchKeyAliases_(matchKeyRaw).concat(matchKeyAliases_(client));
      for (let adi = 0; adi < aliasesD.length; adi++) {
        if (!aliasesD[adi]) continue;
        const resD = await env.DB.prepare(
          "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND date_iso = ? AND match_key = ?"
        )
          .bind(now, dateIso, aliasesD[adi])
          .run();
        changed += Number((resD && resD.meta && resD.meta.changes) || 0);
      }
      const resD2 = await env.DB.prepare(
        "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND date_iso = ? AND lower(client) = ?"
      )
        .bind(now, dateIso, client.toLowerCase())
        .run();
      changed += Number((resD2 && resD2.meta && resD2.meta.changes) || 0);
    } catch (eSqlD) {}
  }
  // calendar remove: tombstone по дате (пустой day), чтобы getViewCompare month не воскрешал
  if (calendarOnly && dateIso) {
    try {
      await putDeleteTombstone_(env, "", matchKeyRaw || client);
      await putSnap_(env, "delTomb:CAL:" + dateIso + ":" + mk, {
        day: "",
        dateIso: dateIso,
        mk: mk,
        at: Date.now()
      });
    } catch (eTombCal) {}
  }

  if (!toBool_(params._keepMoveEpoch) && !toBool_(params.keepMoveEpoch)) {
    try {
      await clearMoveEpoch_(env, matchKeyRaw);
    } catch (eEpDel) {}
  }
  await invalidateDays_(env, daysToClear.filter(Boolean));
  try {
    await rebuildWeekCounts_(env);
  } catch (eCntDel) {}

  // VERIFY: ещё active где угодно по нику / дате — снести; иначе «удалился и вернулся»
  // НЕ трогать строку, если это свежий save после старта этого delete (writeGuard).
  // strictDay (move afterWrite): только этот день — не трогать arrive на newDay.
  // calendarOnly: только эта date_iso — не сносить другие дни недели.
  let still = null;
  try {
    if (calendarOnly && dateIso) {
      still = await findOrderRow_(env, matchKeyRaw, "", dateIso, client);
    } else {
      still = await findOrderRow_(env, matchKeyRaw, day, strictDay ? "" : dateIso, client);
      if (!still && !strictDay) still = await findActiveOrderByMatch_(env, matchKeyRaw, client);
    }
    if (
      still &&
      (await deleteWouldEraseFreshWrite_(env, params, still, day, mk, deleteStartedAt))
    ) {
      return {
        status: "success",
        sandbox: true,
        wrote: changed,
        skippedStaleDelete: true,
        d1Verified: true,
        day: day,
        daysCleared: daysToClear
      };
    }
    if (still) {
      // strictDay: если нашли не на этом дне — не сносить
      if (strictDay && still.day_name && String(still.day_name) !== String(day)) {
        still = null;
      } else if (
        calendarOnly &&
        dateIso &&
        still.date_iso &&
        String(still.date_iso) !== String(dateIso)
      ) {
        still = null;
      } else {
        await softDeleteRow_(still);
        if (still.day_name) {
          try {
            await putDeleteTombstone_(env, still.day_name, matchKeyRaw || client);
          } catch (eT2) {}
        }
        if (calendarOnly && dateIso) {
          still = await findOrderRow_(env, matchKeyRaw, "", dateIso, client);
        } else {
          still = await findOrderRow_(env, matchKeyRaw, day, strictDay ? "" : dateIso, client);
          if (!still && !strictDay) still = await findActiveOrderByMatch_(env, matchKeyRaw, client);
        }
      }
    }
  } catch (eVer) {}

  if (still) {
    return {
      status: "error",
      message: "delete_not_sticky",
      sandbox: true,
      wrote: changed,
      stillPresent: true,
      d1Verified: false,
      day: day,
      daysCleared: daysToClear
    };
  }
  if (changed === 0) {
    return {
      status: "success",
      sandbox: true,
      wrote: 0,
      missing: true,
      alreadyGone: true,
      d1Verified: true,
      day: day,
      daysCleared: daysToClear
    };
  }
  return {
    status: "success",
    sandbox: true,
    wrote: changed,
    missing: false,
    d1Verified: true,
    day: day,
    daysCleared: daysToClear
  };
}

async function moveClient_(params, env) {
  await ensureMetaColumn_(env);
  const moveStartedAt = Date.now();
  if (!env || !env.DB) return { status: "error", message: "no_d1" };
  let oldDay = String(params.oldDay || "");
  let newDay = String(params.newDay || "");
  let oldDate = String(params.oldDate || "").trim();
  let newDate = String(params.newDate || "").trim();
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(oldDate)) oldDate = dmyToIso_(oldDate) || oldDate;
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(newDate)) newDate = dmyToIso_(newDate) || newDate;
  const calendarOnly = toBool_(params.calendarOnly) || (!newDay && !!newDate);
  const client = String(params.client || "");
  const matchKeyRaw = params.matchKey || client;
  const matchKey = normalizeMatchKey_(matchKeyRaw);
  const clientLow = client.trim().toLowerCase();
  const mkLow = String(matchKeyRaw || "").trim().toLowerCase();
  const now = new Date().toISOString();
  const cutRaw = String(params.cutRaw == null ? "1" : params.cutRaw);

  if (!newDay && newDate && !calendarOnly) {
    const r = await resolveDay_({ date: newDate }, env);
    if (r.onWeek && r.dayName) newDay = r.dayName;
  }

  // сегодняшний пн = «Будущая неделя»: UI мог прислать oldDay=Понедельник
  const fromDays = [];
  function addFromDay_(d) {
    d = String(d || "").trim();
    if (d && fromDays.indexOf(d) < 0) fromDays.push(d);
  }
  addFromDay_(oldDay);
  if (oldDate) {
    try {
      const rOld = await resolveDay_({ date: oldDate }, env);
      if (rOld && rOld.onWeek && rOld.dayName) addFromDay_(rOld.dayName);
    } catch (eRO) {}
    try {
      let counts = await getSnapRaw_(env, "weekDayCountsSheet");
      if (!counts || !Array.isArray(counts.items)) counts = await getSnapRaw_(env, "weekDayCounts");
      const byC = dayForDateFromCounts_(counts, oldDate);
      if (byC) addFromDay_(byC);
    } catch (eC) {}
  }

  let row = await findOrderRow_(env, matchKeyRaw, oldDay, oldDate, client);
  if (!row) {
    for (let fi = 0; fi < fromDays.length && !row; fi++) {
      if (fromDays[fi] === oldDay) continue;
      row = await findOrderRow_(env, matchKeyRaw, fromDays[fi], "", client);
    }
  }
  // calendar-only: не искать week-слот через findActiveOrderByMatch_ —
  // иначе «переносим» Пн, а CAL на oldDate остаётся
  if (!row && oldDate) {
    row = await findOrderRow_(env, matchKeyRaw, "", oldDate, client);
  }
  if (!row && !calendarOnly) row = await findActiveOrderByMatch_(env, matchKeyRaw, client);

  // уже перенесён (повтор после store / retry) — не ошибка
  if (!row && newDay) {
    const already = await findOrderRow_(env, matchKeyRaw, newDay, newDate, client);
    if (already) {
      for (let ti = 0; ti < fromDays.length; ti++) {
        try {
          await putDeleteTombstone_(env, fromDays[ti], matchKey);
        } catch (eT0) {}
        try {
          await env.DB.prepare(
            "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND day_name = ? AND (match_key = ? OR lower(client) = ?)"
          )
            .bind(now, fromDays[ti], matchKey, clientLow || matchKey)
            .run();
        } catch (eDelOld) {}
      }
      return {
        status: "success",
        sandbox: true,
        wrote: 1,
        alreadyMoved: true,
        from: fromDays[0] || oldDay,
        to: newDay,
        newDate: newDate,
        calendarOnly: false
      };
    }
  }
  // уже на newDate (calendar retry)
  if (!row && calendarOnly && newDate) {
    const alreadyCal = await findOrderRow_(env, matchKeyRaw, "", newDate, client);
    if (alreadyCal) {
      if (oldDate) {
        try {
          await putSnap_(env, "delTomb:CAL:" + oldDate + ":" + matchKey, {
            mk: matchKey,
            at: Date.now(),
            dateIso: oldDate,
            scope: "CAL"
          });
        } catch (eTCal) {}
        try {
          await env.DB.prepare(
            "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND (day_name = '' OR day_name IS NULL) AND date_iso = ? AND (match_key = ? OR lower(client) = ?)"
          )
            .bind(now, oldDate, matchKey, clientLow || matchKey)
            .run();
        } catch (eDelCal) {}
        try { await delSnap_(env, "viewDate:" + oldDate); } catch (eV0) {}
      }
      try { await delSnap_(env, "viewDate:" + newDate); } catch (eV1) {}
      return {
        status: "success",
        sandbox: true,
        wrote: 1,
        alreadyMoved: true,
        from: oldDate || "",
        to: "",
        newDate: newDate,
        calendarOnly: true
      };
    }
  }
  // calendar-only без D1-строки: создать на newDate (человек мог быть только в snap/Sheets)
  if (!row && calendarOnly && newDate) {
    if (oldDate) {
      try {
        await putSnap_(env, "delTomb:CAL:" + oldDate + ":" + matchKey, {
          mk: matchKey,
          at: Date.now(),
          dateIso: oldDate,
          scope: "CAL"
        });
      } catch (eTOld) {}
      try {
        await env.DB.prepare(
          "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND (day_name = '' OR day_name IS NULL) AND date_iso = ? AND (match_key = ? OR lower(client) = ?)"
        )
          .bind(now, oldDate, matchKey, clientLow || matchKey)
          .run();
      } catch (eDelO) {}
      try { await delSnap_(env, "viewDate:" + oldDate); } catch (eVo) {}
    }
    let created = null;
    try {
      created = await saveOrder_(
        Object.assign({}, params, {
          day: "",
          date: newDate,
          dateIso: newDate,
          calendarOnly: true,
          client: client,
          matchKey: matchKeyRaw,
          fromAfterWrite: "1"
        }),
        env,
        true
      );
    } catch (eSo) {
      created = { status: "error", message: String(eSo && eSo.message || eSo) };
    }
    if (!created || created.status !== "success") {
      return {
        status: "error",
        message: (created && created.message) || "not_found",
        sandbox: true,
        calendarOnly: true
      };
    }
    try { await delSnap_(env, "viewDate:" + newDate); } catch (eVn) {}
    try { await rebuildMonthOverview_(env); } catch (eMo) {}
    return {
      status: "success",
      sandbox: true,
      wrote: 1,
      from: oldDate || "",
      to: "",
      newDate: newDate,
      calendarOnly: true,
      createdCalendar: true
    };
  }
  if (!row) {
    return { status: "error", message: "not_found", sandbox: true };
  }

  const meta = parseMeta_(row.meta_json);
  if (cutRaw === "0" || cutRaw === "no") meta.noCut = true;
  else if (cutRaw === "1" || cutRaw === "yes") meta.noCut = false;

  // канонический from = где человек реально сидит (не «Пн» при слоте «Будущая»)
  if (row.day_name) addFromDay_(row.day_name);
  const fromDay = String(row.day_name || oldDay || fromDays[0] || "");
  oldDay = fromDay;
  if (!oldDate && row.date_iso) oldDate = String(row.date_iso || "");
  try {
    params.oldDay = fromDay;
    if (oldDate) params.oldDate = oldDate;
    if (newDay) params.newDay = newDay;
    if (newDate) params.newDate = newDate;
  } catch (ePar) {}

  const clearName = row.client || client;
  try {
    await putSnap_(env, "moveEpoch:" + matchKey, {
      at: moveStartedAt,
      from: fromDay,
      to: newDay || newDate || "",
      client: clearName
    });
  } catch (eEp) {}
  // СНАЧАЛА protect на newDay + tombstone на fromDay — иначе параллельный GAS-revalidate
  // между await вставляет человека обратно на старый день (RMW/гонка).
  if (newDay) {
    try {
      await putMoveArriveProtect_(env, newDay, matchKey, clearName);
    } catch (eProtEarly) {}
    try {
      await clearTombstonesForMatch_(env, matchKey, newDay, clearName);
    } catch (eClrPre) {}
  }
  for (let tj = 0; tj < fromDays.length; tj++) {
    try {
      await putDeleteTombstone_(env, fromDays[tj], matchKey);
      await putDeleteTombstone_(env, fromDays[tj], clearName);
      await clearMoveArriveProtect_(env, fromDays[tj], matchKey, clearName, moveStartedAt);
    } catch (eTombEarly) {}
  }
  // удалить исходную строку по id — надёжнее OR по match_key
  await env.DB.prepare("UPDATE orders SET status = 'deleted', updated_at = ? WHERE id = ?")
    .bind(now, row.id)
    .run();
  // все дубли на старых днях-кандидатах (Пн + Будущая)
  for (let dj = 0; dj < fromDays.length; dj++) {
    const dClear = fromDays[dj];
    await env.DB.prepare(
      "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND day_name = ? AND (match_key = ? OR match_key = ? OR lower(client) = ? OR lower(client) = ?)"
    )
      .bind(now, dClear, matchKey, mkLow, clientLow, String(row.client || "").toLowerCase())
      .run();
    try {
      const left = await env.DB.prepare(
        "SELECT id, client, match_key FROM orders WHERE status = 'active' AND day_name = ? LIMIT 120"
      )
        .bind(dClear)
        .all();
      const leftList = (left && left.results) || [];
      for (var li = 0; li < leftList.length; li++) {
        if (orderRowLooseMatch_(leftList[li], matchKeyRaw, client) || orderRowLooseMatch_(leftList[li], matchKey, row.client)) {
          await env.DB.prepare("UPDATE orders SET status = 'deleted', updated_at = ? WHERE id = ?")
            .bind(now, leftList[li].id)
            .run();
        }
      }
    } catch (eLooseDel) {}
    try {
      await putDeleteTombstone_(env, dClear, matchKey);
      await putDeleteTombstone_(env, dClear, clearName);
    } catch (eTombM) {}
  }
  if (oldDate) {
    try {
      await env.DB.prepare(
        "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND date_iso = ? AND (match_key = ? OR match_key = ? OR lower(client) = ?)"
      )
        .bind(now, oldDate, matchKey, mkLow, clientLow)
        .run();
    } catch (eDateDel) {}
  }

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
    try {
      await clearTombstonesForMatch_(env, matchKey, newDay, clearName);
    } catch (eClrT) {}
    try {
      await putMoveArriveProtect_(env, newDay, matchKey, clearName);
    } catch (eProt) {}
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
    try {
      await clearTombstonesForMatch_(env, matchKey, "", clearName);
    } catch (eClrTc) {}
    try {
      await putDeleteTombstone_(env, "", matchKey);
      if (oldDate) {
        await putSnap_(env, "delTomb:CAL:" + oldDate + ":" + matchKey, {
          day: "",
          dateIso: oldDate,
          mk: matchKey,
          at: Date.now()
        });
      }
    } catch (eTombCalMv) {}
    // повторно снести oldDate (фон save мог вернуть) + финальный upsert newDate
    if (oldDate) {
      try {
        await env.DB.prepare(
          "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND date_iso = ? AND (match_key = ? OR match_key = ? OR lower(client) = ?) AND id != ?"
        )
          .bind(now, oldDate, matchKey, mkLow, clientLow, newId)
          .run();
      } catch (eOldWipe) {}
    }
    try {
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
        updated_at: new Date().toISOString(),
        meta_json: JSON.stringify(meta)
      });
    } catch (eFinalCal) {}
  }

  // жёстко: ещё раз снести со старых дней (фон GAS/protect мог вернуть)
  for (let hj = 0; hj < fromDays.length; hj++) {
    try {
      await env.DB.prepare(
        "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND day_name = ? AND (match_key = ? OR match_key = ? OR lower(client) = ? OR lower(client) = ?)"
      )
        .bind(now, fromDays[hj], matchKey, mkLow, clientLow, String(row.client || "").toLowerCase())
        .run();
      await putDeleteTombstone_(env, fromDays[hj], matchKey);
      try {
        await clearMoveArriveProtect_(env, fromDays[hj], matchKey, row.client || client, moveStartedAt);
      } catch (eClrAP) {}
    } catch (eHardDel) {}
  }

  // финальный re-upsert: параллельный after-write/GAS мог снести newDay в ту же мс
  if (newDay) {
    try {
      const info2 = await dayDateInfo_(env, newDay);
      const iso2 = newDate || info2.iso || row.date_iso || "";
      await upsertOrderRow_(env, {
        id: newDay + ":" + matchKey,
        date_iso: iso2,
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
        updated_at: new Date().toISOString(),
        meta_json: JSON.stringify(meta)
      });
      await putMoveArriveProtect_(env, newDay, matchKey, clearName);
      await clearTombstonesForMatch_(env, matchKey, newDay, clearName);
    } catch (eFinal) {}
  }

  await invalidateDays_(env, fromDays.concat([newDay]).filter(Boolean));
  // calendar-only: сбросить snap по датам (иначе Просмотр врёт)
  try {
    if (oldDate) await delSnap_(env, "viewDate:" + oldDate);
  } catch (eVo2) {}
  try {
    if (newDate) await delSnap_(env, "viewDate:" + newDate);
  } catch (eVn2) {}
  try {
    if (calendarOnly || (newDate && !newDay) || (oldDate && !fromDay)) {
      await rebuildMonthOverview_(env);
    }
  } catch (eMo2) {}

  return {
    status: "success",
    sandbox: true,
    wrote: 1,
    local: false,
    from: fromDay,
    fromDays: fromDays,
    to: toLabel,
    newDay: newDay,
    newDate: newDate,
    calendarOnly: !newDay && !!newDate,
    d1Verified: true
  };
}

async function setDelivered_(params, env) {
  if (!env || !env.DB) return { status: "error", message: "no_d1" };
  const day = String(params.day || "");
  const client = String(params.client || "");
  const delivered = toBool_(params.delivered);
  const info = await dayDateInfo_(env, day);
  const iso = info.iso || String(params.date || "");
  const rawKey = params.matchKey || client;
  const mk = normalizeMatchKey_(rawKey);
  const aliases = matchKeyAliases_(rawKey);
  if (client) {
    matchKeyAliases_(client).forEach(function (k) {
      if (aliases.indexOf(k) < 0) aliases.push(k);
    });
  }
  const now = new Date().toISOString();
  if (iso) {
    for (var ai = 0; ai < aliases.length; ai++) {
      try {
        await env.DB.prepare(
          `INSERT INTO deliveries (date_iso, match_key, delivered, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(date_iso, match_key) DO UPDATE SET delivered=excluded.delivered, updated_at=excluded.updated_at`
        )
          .bind(iso, aliases[ai], delivered ? 1 : 0, now)
          .run();
      } catch (eDelW) {}
    }
  }
  const snap = await getCourier_({ day: day }, env);
  (snap.clients || []).forEach(function (c) {
    var hit =
      !!lookupByMatchAliases_(
        indexByMatchAliases_([{ matchKey: mk, name: client }]),
        c.matchKey || c.name
      ) ||
      c.name === client ||
      matchKeyAliases_(c.matchKey || c.name).some(function (k) {
        return aliases.indexOf(k) >= 0;
      });
    if (hit) {
      c.delivered = delivered;
      if (params.paid) c.paid = params.paid;
    }
  });
  snap.flagsTouchedAt = Date.now();
  await putSnap_(env, "courier:" + day, snap);
  return { status: "success", sandbox: true, wrote: 1, delivered: delivered };
}

async function setAssemblyFlag_(params, env, flag) {
  const day = String(params.day || "");
  const client = String(params.client || "");
  const rawKey = params.matchKey || client;
  const aliases = matchKeyAliases_(rawKey);
  if (client) {
    matchKeyAliases_(client).forEach(function (k) {
      if (aliases.indexOf(k) < 0) aliases.push(k);
    });
  }
  const val = toBool_(params[flag] != null ? params[flag] : params.value);
  const snap = await getAssembly_({ day: day }, env);
  (snap.clients || []).forEach(function (c) {
    var hit =
      c.name === client ||
      matchKeyAliases_(c.matchKey || c.name).some(function (k) {
        return aliases.indexOf(k) >= 0;
      });
    if (hit) c[flag] = val;
  });
  snap.flagsTouchedAt = Date.now();
  await putSnap_(env, "assembly:" + day, snap);
  return { status: "success", sandbox: true, wrote: 1, [flag]: val };
}

async function syncOpsWriteToD1_(action, params, env, proxied) {
  if (!env || !env.DB) return;

  // курьерский перенос: D1 сразу (не ждать GAS), иначе CF рвёт и UI «Ошибка сети»
  if (/^notifyMissedDelivery$/i.test(action)) {
    try {
      await deleteClient_(params, env);
    } catch (eDel) {}
    try {
      let list = (await getSnapRaw_(env, "listDeferred")) || { status: "success", items: [] };
      let arr = Array.isArray(list.items) ? list.items.slice() : [];
      const nick = String(params.client || params.nick || "").trim();
      const mk = normalizeMatchKey_(nick || params.matchKey || "");
      arr = arr.filter(function (it) {
        if (!it) return false;
        const m = String(it.mode || (it.payload && it.payload.mode) || "").toLowerCase();
        if (m === "buy" || m === "remind" || m === "partner") return true;
        const n = String(
          it.clientNick || (it.payload && (it.payload.client || it.payload.clientNick)) || it.client || ""
        );
        const nk = normalizeMatchKey_(n);
        if (mk && nk && mk === nk) return false;
        return true;
      });
      const xferId = String((proxied && proxied.id) || ("xfer_" + Date.now()));
      const ppPartner = await resolveBpPartnerForClient_(
        env,
        nick,
        mk,
        params.ppPartner,
        params.segment
      );
      arr.unshift({
        id: xferId,
        mode: "transfer",
        title: "Перенос · не получил",
        clientNick: nick,
        status: "open",
        fromD1: true,
        payload: {
          mode: "transfer",
          parked: true,
          reason: String(params.reason || ""),
          day: String(params.day || ""),
          date: String(params.date || ""),
          client: nick,
          matchKey: String(params.matchKey || ""),
          segment: String(params.segment || ""),
          ppPartner: ppPartner,
          basket: parseBasket_(params.basket),
          createdByName: String(params.createdByName || "")
        }
      });
      list.items = arr;
      list.status = "success";
      list.openCount = arr.filter(function (it) {
        return String(it.status || "open").toLowerCase() === "open";
      }).length;
      list.fromD1 = true;
      list.sandbox = false;
      await putSnap_(env, "listDeferred", list);
    } catch (eDef) {}
    return;
  }

  if (!proxied || proxied.status !== "success") return;
  const day = String(params.day || "");
  if (!day) return;
  const client = String(params.client || "");
  const mk = normalizeMatchKey_(params.matchKey || client);

  if (/^updateCutting$/i.test(action)) {
    await applyCuttingFlagToSnap_(params, env, proxied);
    return;
  }

  if (/^finishCutting$/i.test(action)) {
    let snap = (await getSnapRaw_(env, "cutting:" + day)) || {
      status: "success",
      day: day,
      items: [],
      session: { active: false, day: "", startedAt: 0 }
    };
    const items = Array.isArray(snap.items) ? snap.items.slice() : [];
    items.forEach(function (it) {
      if (!it) return;
      it.done = true;
      it.laid = true;
    });
    snap.items = items;
    snap.completion = proxied.completion || {
      day: day,
      dateText: snap.date || "",
      date: snap.date || "",
      elapsedMs: Number(params.elapsed) || 0,
      finishedAt: new Date().toISOString(),
      count: items.length,
      items: items
    };
    snap.session = { active: false, day: "", startedAt: 0 };
    snap.fromGas = true;
    snap.fromD1 = false;
    snap.sandbox = false;
    await putSnap_(env, "cutting:" + day, snap);
    return;
  }

  if (/^setDelivered$/i.test(action)) {
    const delivered = toBool_(params.delivered);
    const aliases = matchKeyAliases_(params.matchKey || client);
    if (client) {
      matchKeyAliases_(client).forEach(function (k) {
        if (aliases.indexOf(k) < 0) aliases.push(k);
      });
    }
    let snap = (await getSnapRaw_(env, "courier:" + day));
    if (!snap) {
      await rebuildCourierDay_(env, day);
      snap = await getSnapRaw_(env, "courier:" + day);
    }
    if (snap && Array.isArray(snap.clients)) {
      snap.clients.forEach(function (c) {
        var hit =
          c.name === client ||
          matchKeyAliases_(c.matchKey || c.name).some(function (k) {
            return aliases.indexOf(k) >= 0;
          });
        if (hit) {
          c.delivered = delivered;
          if (params.paid) c.paid = params.paid;
        }
      });
      snap.flagsTouchedAt = Date.now();
      await putSnap_(env, "courier:" + day, snap);
    }
    const info = await dayDateInfo_(env, day);
    if (info.iso && aliases.length) {
      const now = new Date().toISOString();
      for (var di = 0; di < aliases.length; di++) {
        try {
          await env.DB.prepare(
            `INSERT INTO deliveries (date_iso, match_key, delivered, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(date_iso, match_key) DO UPDATE SET delivered=excluded.delivered, updated_at=excluded.updated_at`
          )
            .bind(info.iso, aliases[di], delivered ? 1 : 0, now)
            .run();
        } catch (eDw) {}
      }
    }
    return;
  }

  if (/^set(Assembled|Printed)$/i.test(action)) {
    const flag = /^setAssembled$/i.test(action) ? "assembled" : "printed";
    const val = toBool_(params[flag] != null ? params[flag] : params.value);
    const aliasesA = matchKeyAliases_(params.matchKey || client);
    if (client) {
      matchKeyAliases_(client).forEach(function (k) {
        if (aliasesA.indexOf(k) < 0) aliasesA.push(k);
      });
    }
    let snap = (await getSnapRaw_(env, "assembly:" + day));
    if (!snap) {
      await rebuildAssemblyDay_(env, day);
      snap = await getSnapRaw_(env, "assembly:" + day);
    }
    if (snap && Array.isArray(snap.clients)) {
      snap.clients.forEach(function (c) {
        var hit =
          c.name === client ||
          matchKeyAliases_(c.matchKey || c.name).some(function (k) {
            return aliasesA.indexOf(k) >= 0;
          });
        if (hit) c[flag] = val;
      });
      snap.flagsTouchedAt = Date.now();
      await putSnap_(env, "assembly:" + day, snap);
    }
  }
}

async function updateCutting_(params, env) {
  const day = String(params.day || "");
  await applyCuttingFlagToSnap_(params, env, null);
  return {
    status: "success",
    sandbox: true,
    wrote: 1,
    day: day,
    row: Number((params && params.row) || 0),
    name: String((params && params.name) || "")
  };
}

const GAS_ORIGIN =
  "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec";

function unwrapGas_(text) {
  const s = String(text || "").trim();
  // HTML login / Page Not Found от Apps Script echo — не JSON
  if (/^<!DOCTYPE|^<html/i.test(s)) {
    throw new Error("gas_html_response");
  }
  const m = s.match(/^[a-zA-Z_$][\w$]*\s*\(\s*([\s\S]*)\s*\)\s*;?\s*$/);
  const json = JSON.parse(m ? m[1] : s);
  // POST→битый redirect иногда отдаёт doGet без action
  if (json && typeof json === "object" && json.status === "online") {
    throw new Error("gas_online_stub");
  }
  return json;
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
  const snapAgeMs =
    snap && snap.cachedAt ? Date.now() - Date.parse(String(snap.cachedAt)) : Number.POSITIVE_INFINITY;
  const snapStale = snapAgeMs > 6 * 60 * 60 * 1000;

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

  if (snapOk && !snapStale) {
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

  if (snapOk && snapStale) {
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(
        (async function () {
          try {
            await fetchLive_();
          } catch (eR) {}
        })()
      );
    }
    const outStale = Object.assign({}, snap);
    outStale.cutover = true;
    outStale.swr = true;
    outStale.fromGas = false;
    outStale.snapStale = true;
    outStale.sandbox = false;
    return outStale;
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

/** @arseniyhotko — NaN clinic, одна точка (роль owner Бойни не трогаем). */
const PARTNER_ARSENIY_USER = "arseniyhotko";
const PARTNER_ARSENIY_TID = "650923866";
const PARTNER_ARSENIY_POINT = {
  id: "pt_nan_1",
  networkId: "net_nan",
  name: "NaN · Янковского",
  address: "ул. Янковского, 34"
};
const PARTNER_ARSENIY_NET = { id: "net_nan", name: "NaN clinic", logo: "assets/partners/nan.png" };
const PARTNER_CATALOG_STATIC = [
  { id: "vr_t_heart", type: "treat", name: "Сердце", unit: "г", active: true },
  { id: "vr_t_lung", type: "treat", name: "Лёгкое", unit: "г", active: true },
  { id: "vr_c_piece", type: "coupon", name: "Купон", unit: "шт", active: true },
  { id: "vr_c_banner", type: "coupon", name: "Баннер", unit: "шт", active: true }
];

function partnerNormUserWorker_(raw) {
  return String(raw || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
}

function isPartnerArseniy_(params) {
  const u = partnerNormUserWorker_(params && params.username);
  const tid = String((params && params.telegramId) || "").trim();
  return u === PARTNER_ARSENIY_USER || tid === PARTNER_ARSENIY_TID;
}

function partnerScopedGetMe_(json, point, net, fallbackName, fallbackUser, fallbackTid, overrideKey) {
  const src = json && typeof json === "object" && json.status !== "error" ? json : {};
  const pts = Array.isArray(src.points) ? src.points : [];
  let one = null;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i] && pts[i].id === point.id) {
      one = pts[i];
      break;
    }
  }
  if (!one) one = point;
  const nets = Array.isArray(src.networks)
    ? src.networks.filter(function (n) {
        return n && n.id === net.id;
      })
    : [];
  const allowedPointIds = {};
  allowedPointIds[point.id] = true;
  return Object.assign({}, src, {
    status: "success",
    allowed: true,
    ownersOnly: false,
    role: "partner",
    isPartner: true,
    isOwner: false,
    name: src.name && src.name !== "Владелец Good Boy" ? src.name : fallbackName,
    username: src.username || fallbackUser,
    telegramId: src.telegramId || fallbackTid || "",
    networkId: net.id,
    pointIds: [point.id],
    allowedPointIds: allowedPointIds,
    networks: nets.length ? nets : [net],
    points: [
      {
        id: one.id || point.id,
        networkId: one.networkId || net.id,
        name: one.name || point.name,
        address: one.address || point.address
      }
    ],
    catalog: Array.isArray(src.catalog) && src.catalog.length ? src.catalog : PARTNER_CATALOG_STATIC,
    cutover: true,
    partnerOverride: overrideKey
  });
}

function partnerArseniyGetMe_(json) {
  return partnerScopedGetMe_(
    json,
    PARTNER_ARSENIY_POINT,
    PARTNER_ARSENIY_NET,
    "Арсений Хотько",
    PARTNER_ARSENIY_USER,
    PARTNER_ARSENIY_TID,
    "arseniy_nan_yankovskogo"
  );
}

function partnerBlockWrongPoint_(a, params) {
  if (a !== "partnerSubmitOrder" || !isPartnerArseniy_(params)) return null;
  const pointId = PARTNER_ARSENIY_POINT.id;
  const loc = String((params && (params.locationId || params.pointId)) || "").trim();
  if (loc && loc !== pointId) {
    return { status: "error", message: "forbidden_point", cutover: true };
  }
  if (!loc && params) params.locationId = pointId;
  return null;
}

/** GAS moveClient мог не успеть — если D1 уже перенёс, UI не должен видеть ошибку. */
async function patchMoveWithD1_(params, proxied, env, d1Res) {
  if (!proxied || proxied.status !== "success") {
    if (d1Res && d1Res.status === "success") {
      return Object.assign({}, d1Res, {
        cutover: true,
        sandbox: false,
        d1Verified: true,
        gasPending: true
      });
    }
    return proxied;
  }
  if (!/^moveClient$/i.test(String((params && params.action) || "moveClient"))) return proxied;
  if (d1Res && d1Res.status === "success") {
    return Object.assign({}, proxied, {
      newDay: proxied.newDay || d1Res.newDay || params.newDay || "",
      newDate: proxied.newDate || d1Res.newDate || params.newDate || "",
      d1Verified: true,
      alreadyMoved: !!(proxied.alreadyMoved || d1Res.alreadyMoved)
    });
  }
  const newDay = String((params && params.newDay) || "").trim();
  const client = String((params && params.client) || "").trim();
  if (!newDay || !client || !env || !env.DB) return proxied;
  try {
    const live = await getClients_({ day: newDay }, env);
    const onNew = ((live && live.clients) || []).some(function (c) {
      return nicksLooseMatch_(c && (c.name || c.client), client);
    });
    if (onNew) {
      return Object.assign({}, proxied, {
        d1Verified: true,
        newDay: newDay,
        newDate: params.newDate || proxied.newDate || ""
      });
    }
  } catch (eChk) {}
  return proxied;
}

/** GAS saveOrder может вернуть wrote:0/missed, хотя D1 уже записал — не ломать UI. */
async function patchSaveWithD1_(params, proxied, env) {
  if (!proxied || proxied.status !== "success" || !env || !env.DB) return proxied;
  const a = String((params && params.action) || "saveOrder");
  if (!/^(saveOrder|saveBooking)$/i.test(a)) return proxied;
  const basketLen = parseBasket_(params && params.basket).length;
  const wrote = Number(proxied.wrote) || 0;
  const missed = Array.isArray(proxied.missed) ? proxied.missed : [];
  if (wrote > 0 && !missed.length) return proxied;
  let day = String((params && params.day) || "").trim();
  if (!day) {
    const dateIso = String(
      (params && (params.date || params.dateIso || params.deliveryDate)) || ""
    ).trim();
    if (dateIso) {
      try {
        const r = await resolveDay_({ date: dateIso }, env);
        if (r && r.onWeek && r.dayName) day = r.dayName;
      } catch (eRd) {}
    }
  }
  if (!day) return proxied;
  try {
    const live = await getClients_({ day: day }, env);
    const want = String((params && params.client) || "").trim();
    const row = ((live && live.clients) || []).find(function (c) {
      return nicksLooseMatch_(c && (c.name || c.client), want);
    });
    const gotLen = row && Array.isArray(row.basket) ? row.basket.length : 0;
    if (gotLen > 0) {
      return Object.assign({}, proxied, {
        wrote: gotLen,
        basketLen: basketLen || gotLen,
        d1Verified: true,
        verified: true,
        gasSheetMissed: missed.length ? missed : undefined,
        missed: wrote === 0 && missed.length ? missed : []
      });
    }
  } catch (eD1) {}
  return proxied;
}

function partnerGuardOrRewrite_(a, params, json) {
  if (!isPartnerArseniy_(params)) return json;
  if (a === "partnerGetMe") return partnerArseniyGetMe_(json);
  if (a === "partnerListMyOrders" && json && json.status === "success" && Array.isArray(json.orders)) {
    return Object.assign({}, json, {
      orders: json.orders.filter(function (o) {
        return String((o && (o.locationId || o.pointId)) || "") === PARTNER_ARSENIY_POINT.id;
      })
    });
  }
  return json;
}

function partnerMeSnapKey_(params) {
  const tid = String((params && params.telegramId) || "").trim();
  const u = partnerNormUserWorker_(params && params.username);
  return "partnerMe:" + (tid || u || "anon");
}

async function cutoverPartnerGetMe_(params, env, ctx) {
  params = params || {};
  const snapKey = partnerMeSnapKey_(params);

  async function fetchLive_() {
    const live = await gasProxy_("partnerGetMe", params, env, { write: false });
    const out = partnerGuardOrRewrite_("partnerGetMe", params, live);
    if (out && out.status === "success" && env && env.DB) {
      try {
        await putSnap_(env, snapKey, Object.assign({}, out, { cachedAt: new Date().toISOString() }));
      } catch (eS) {}
    }
    if (out && typeof out === "object") {
      out.cutover = true;
      out.fromGas = true;
      out.sandbox = false;
    }
    return out;
  }

  if (isPartnerArseniy_(params)) {
    let snap = null;
    try {
      snap = await getSnapRaw_(env, snapKey);
    } catch (e0) {
      snap = null;
    }
    const instant = partnerArseniyGetMe_(snap && snap.status === "success" ? snap : { status: "success" });
    instant.cutover = true;
    instant.swr = true;
    instant.fromGas = false;
    instant.sandbox = false;
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(
        (async function () {
          try {
            await fetchLive_();
          } catch (eR) {}
        })()
      );
    }
    return instant;
  }

  let snap = null;
  try {
    snap = await getSnapRaw_(env, snapKey);
  } catch (e1) {
    snap = null;
  }
  const snapOk = snap && snap.status === "success" && snap.allowed && Array.isArray(snap.pointIds) && snap.pointIds.length;
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
  return { status: "error", message: "gas_proxy_failed", cutover: true, action: "partnerGetMe" };
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

  if (a === "finishFullWeek") {
    try {
      const counts =
        (await getSnapRaw_(env, "weekDayCountsSheet")) || (await getSnapRaw_(env, "weekDayCounts"));
      const a1iso = dmyToIso_(mondayDmyFromCounts_(counts));
      const caliso = currentMondayIso_();
      if (a1iso && caliso && a1iso > caliso) {
        return {
          status: "error",
          message: "week_already_finished",
          tip:
            "Понедельник листа уже " +
            mondayDmyFromCounts_(counts) +
            " (текущая неделя с " +
            isoToDmy_(caliso) +
            "). Повторно закрывать нельзя.",
          sheetMonday: mondayDmyFromCounts_(counts),
          calendarMonday: isoToDmy_(caliso),
          cutover: true
        };
      }
    } catch (eFinGuard) {}
  }

  if (a === "getSubscription") {
    const liveSub = await gasProxy_(a, params, env, { write: false });
    if (liveSub && typeof liveSub === "object") {
      liveSub.cutover = true;
      liveSub.fromGas = true;
      liveSub.sandbox = false;
      return liveSub;
    }
    return { status: "error", message: "gas_proxy_failed", cutover: true, action: a };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PEOPLE CANON (LIVE): быстро принять в D1 → GAS в фоне → UI поллит
  // «Точно внесено» только при sheetsVerified. Не врать success до Sheets.
  // placeTransfer/saveDeferred/notifyMissed — по-прежнему D1-first.
  // ═══════════════════════════════════════════════════════════════════
  if (isWriteAction_(a)) {
    const blocked = partnerBlockWrongPoint_(a, params);
    if (blocked) return blocked;
    const isFastPeopleWrite =
      /^(saveOrder|saveBooking|deleteClient|removeCalendarClient|moveClient|notifyMissedDelivery|placeTransferTask|saveDeferred)$/i.test(
        a
      );
    const isFastFlagWrite = /^(updateCutting|setDelivered|setAssembled|setPrinted)$/i.test(a);
    const isCorePeopleWrite =
      /^(saveOrder|saveBooking|deleteClient|removeCalendarClient|moveClient)$/i.test(a);

    if (isFastPeopleWrite) {
      const peopleWriteParams =
        /^(deleteClient|removeCalendarClient)$/i.test(a) && params
          ? Object.assign({}, params, {
              action: a,
              _explicitDelete: params._explicitDelete != null ? params._explicitDelete : "1",
              _userDelete: "1",
              _deleteStartedAt: String(Date.now()),
              calendarOnly:
                /^removeCalendarClient$/i.test(a) || toBool_(params.calendarOnly)
                  ? "1"
                  : params.calendarOnly || ""
            })
          : params;

      // --- CORE PEOPLE: мгновенный accept → D1+GAS в фоне → poll «Точно» ---
      if (isCorePeopleWrite) {
        const gasWriteParams = peopleWriteParams;
        const writeId =
          "pw_" +
          Date.now().toString(36) +
          "_" +
          Math.random().toString(36).slice(2, 8);
        const alsoWeek =
          gasWriteParams.alsoSaveOrder === true ||
          String(gasWriteParams.alsoSaveOrder || "") === "1" ||
          String(gasWriteParams.alsoSaveOrder || "").toLowerCase() === "true";
        const basketLen = parseBasket_(gasWriteParams.basket).length;

        // компактные params для продолжения на poll (без огромного basket duplicate если можно)
        const jobParams = Object.assign({}, gasWriteParams);
        try {
          await putSnap_(env, "peopleWrite:" + writeId, {
            status: "pending",
            pendingSheets: true,
            sheetsVerified: false,
            d1Verified: false,
            action: a,
            params: jobParams,
            client: String(gasWriteParams.client || gasWriteParams.nick || ""),
            day: String(gasWriteParams.day || gasWriteParams.newDay || gasWriteParams.oldDay || ""),
            startedAt: Date.now()
          });
        } catch (eJob0) {}

        const bg = (async function () {
          try {
            await runPeopleWriteJob_(
              writeId,
              {
                status: "pending",
                pendingSheets: true,
                action: a,
                params: jobParams,
                startedAt: Date.now()
              },
              env,
              ctx
            );
          } catch (eBg) {
            try {
              await putSnap_(env, "peopleWrite:" + writeId, {
                status: "error",
                pendingSheets: false,
                sheetsVerified: false,
                action: a,
                params: jobParams,
                message: String((eBg && eBg.message) || eBg),
                finishedAt: Date.now()
              });
            } catch (eFail) {}
          }
        })();

        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(bg);
        } else {
          bg.catch(function () {});
        }

        const accepted = {
          status: "accepted",
          cutover: true,
          sandbox: false,
          optimistic: false,
          pendingSheets: true,
          sheetsVerified: false,
          d1Verified: false,
          d1Pending: true,
          writeId: writeId,
          action: a,
          message: "pending_sheets"
        };
        if (/^(saveOrder|saveBooking)$/i.test(a)) {
          accepted.weekWritten =
            alsoWeek ||
            (!toBool_(gasWriteParams.calendarOnly) && /^saveOrder$/i.test(a));
          accepted.wrote = basketLen || 1;
          accepted.basketLen = basketLen;
        }
        if (/^moveClient$/i.test(a)) {
          accepted.newDay = gasWriteParams.newDay || "";
          accepted.newDate = gasWriteParams.newDate || "";
          accepted.from = gasWriteParams.oldDay || "";
          accepted.to = gasWriteParams.newDay || gasWriteParams.newDate || "";
        }
        return partnerGuardOrRewrite_(a, gasWriteParams, accepted);
      }

      // --- non-core (deferred / transfer park): D1-first OK ---
      let d1WriteRes = null;
      try {
        if (env && env.DB) {
          if (/^notifyMissedDelivery$/i.test(a)) {
            d1WriteRes = await syncOpsWriteToD1_(a, params, env, {
              status: "success",
              id: "xfer_" + Date.now()
            });
            if (!d1WriteRes || typeof d1WriteRes !== "object") {
              d1WriteRes = { status: "success", wrote: 1 };
            }
          } else if (/^placeTransferTask$/i.test(a)) {
            d1WriteRes = await placeTransferTaskD1_(params, env);
          } else if (/^saveDeferred$/i.test(a)) {
            d1WriteRes = await saveDeferredD1_(params, env);
          }
        }
      } catch (eOpt) {
        d1WriteRes = { status: "error", message: String((eOpt && eOpt.message) || eOpt) };
      }

      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(
          (async function () {
            let proxied = null;
            try {
              proxied = await gasProxy_(a, params, env, { write: true });
            } catch (eG) {
              proxied = null;
            }
            try {
              if (/^notifyMissedDelivery$/i.test(a) && env && env.DB && proxied) {
                await syncOpsWriteToD1_(a, params, env, proxied);
              }
            } catch (eD1) {}
            try {
              await cutoverAfterWrite_(a, params, env, proxied || d1WriteRes);
            } catch (eA) {}
          })()
        );
      }

      if (d1WriteRes && d1WriteRes.status === "success") {
        return Object.assign({}, d1WriteRes, {
          cutover: true,
          sandbox: false,
          d1Verified: true,
          optimistic: true,
          action: a,
          parkedPlaced: /^placeTransferTask$/i.test(a) ? true : undefined
        });
      }
      return {
        status: "error",
        message: (d1WriteRes && d1WriteRes.message) || "d1_write_failed",
        cutover: true,
        sandbox: false,
        action: a
      };
    }
    if (isFastFlagWrite) {
      try {
        if (env && env.DB) {
          if (/^updateCutting$/i.test(a)) await applyCuttingFlagToSnap_(params, env, null);
          else if (/^setDelivered$/i.test(a)) await setDelivered_(params, env);
          else if (/^setAssembled$/i.test(a)) await setAssemblyFlag_(params, env, "assembled");
          else if (/^setPrinted$/i.test(a)) await setAssemblyFlag_(params, env, "printed");
        }
      } catch (eFlag) {}
      const gasP = gasProxy_(a, params, env, { write: true }).catch(function () {
        return null;
      });
      let proxied = null;
      let gotGas = false;
      await Promise.race([
        gasP.then(function (p) {
          proxied = p;
          gotGas = true;
        }),
        new Promise(function (r) {
          setTimeout(r, 14000);
        })
      ]);
      const bg = (async function () {
        try {
          if (!gotGas) proxied = await gasP;
        } catch (eG) {}
        try {
          if (/^updateCutting$/i.test(a)) await applyCuttingFlagToSnap_(params, env, proxied);
          else if (proxied) await syncOpsWriteToD1_(a, params, env, proxied);
        } catch (eD1) {}
      })();
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(bg);
      else await bg;
      if (
        gotGas &&
        proxied &&
        proxied.status === "success" &&
        !/gas_proxy_failed/i.test(String(proxied.message || ""))
      ) {
        return partnerGuardOrRewrite_(a, params, proxied);
      }
      return {
        status: "success",
        wrote: 1,
        optimistic: true,
        cutover: true,
        sandbox: false,
        action: a,
        row: Number((params && params.row) || 0),
        name: String((params && params.name) || "")
      };
    }
    if (/^cancelDeferred$/i.test(a)) {
      let d1Res = { status: "success", wrote: 0, cutover: true, sandbox: false, action: a };
      try {
        var cancelId = String((params && (params.id || params.taskId)) || "").trim();
        var cancelMk = "";
        try {
          var hitCan = await findDeferredSnapItem_(env, cancelId);
          if (hitCan) cancelMk = deferredTransferClientKey_(hitCan);
        } catch (eHit) {}
        if (!cancelMk) {
          cancelMk = normalizeMatchKey_(
            (params && (params.matchKey || params.client || params.clientNick)) || ""
          );
        }
        await putDeferredCancelTombstone_(env, cancelId, cancelMk);
        d1Res = await deleteFromList_(env, "listDeferred", "items", params, "id");
        d1Res.cutover = true;
        d1Res.sandbox = false;
        d1Res.action = a;
        d1Res.cancelled = true;
        d1Res.tombstone = true;
      } catch (eCan) {}
      const gasCanP = gasProxy_(a, params, env, { write: true }).catch(function () {
        return null;
      });
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(gasCanP);
      else {
        try {
          await gasCanP;
        } catch (eG) {}
      }
      return d1Res;
    }
    const proxied = await gasProxy_(a, params, env, { write: true });
    if (!proxied) return { status: "error", message: "gas_proxy_failed", cutover: true, action: a };
    try {
      await syncOpsWriteToD1_(a, params, env, proxied);
    } catch (eOps) {}
    try {
      if (/^(deleteClient|removeCalendarClient)$/i.test(a) && env && env.DB) {
        await deleteClient_(params, env);
      } else if (/^moveClient$/i.test(a) && env && env.DB) {
        // сюда move почти не попадает (fast-path выше); повторный move со stale params опасен
        try {
          var optMk = normalizeMatchKey_(params.matchKey || params.client || "");
          var optNew = String(params.newDay || "");
          var optEp = optMk ? await getSnapRaw_(env, "moveEpoch:" + optMk) : null;
          if (optNew && (!optEp || !optEp.to || String(optEp.to) === optNew)) {
            await putMoveArriveProtect_(env, optNew, optMk, params.client);
          }
        } catch (eProtOpt) {}
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
    return partnerGuardOrRewrite_(a, params, proxied);
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
  if (a === "getClients") {
    const forceClientsEarly =
      String((params && params.force) || "") === "1" ||
      (params && (params.force === true || params.force === 1));
    if (forceClientsEarly && params && params.day) {
      const live = await getClients_(params, env);
      if (live && typeof live === "object") {
        live.cutover = true;
        live.swr = true;
        live.source = live.source || "d1";
        live.force = true;
        live.sandbox = false;
        return live;
      }
    }
  }
  if (a === "getViewCompare") {
    const forceViewEarly =
      String((params && params.force) || "") === "1" ||
      (params && (params.force === true || params.force === 1));
    if (forceViewEarly) {
      const liveVc = await getViewCompare_(params, env);
      if (liveVc && typeof liveVc === "object") {
        liveVc.cutover = true;
        liveVc.swr = true;
        liveVc.source = liveVc.source || "d1";
        liveVc.force = true;
        liveVc.sandbox = false;
        return liveVc;
      }
    }
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
      try {
        await scrubAllDayDateMismatches_(env, live);
      } catch (eScrub) {}
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
        try {
          await scrubAllDayDateMismatches_(e, live);
        } catch (eScrub2) {}
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
    if (a === "getTransferTask") {
      return getTransferTaskCutover_(params, env);
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
          // нарезку из календаря не отдаём — без фракций (трахея мал/сред…) и с дублями
          if (cal && a !== "getCutting") return cal;
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

  // Нарезка: сразу D1 (fromOrders, с фракциями жевалок) или GAS-snap. Календарную оценку без заказов не отдаём.
  if (a === "getCutting" && fast && typeof fast === "object") {
    const isCalendarGuess = !!(fast.fromCalendar && !fast.fromOrders && !fast.fromGas);
    const canServe =
      !isCalendarGuess &&
      (fast.fromOrders ||
        fast.fromGas ||
        (Array.isArray(fast.items) && fast.items.length) ||
        fast.completion);
    if (canServe) {
      fast.cutover = true;
      fast.swr = true;
      if (fast.fromGas) fast.fromGas = true;
      if (fast.sandbox === true && (fast.fromOrders || fast.fromGas)) fast.sandbox = false;
      return fast;
    }
  }

  // Приёмка: если D1 count ≠ getWeekDayCounts — осторожно с GAS.
  // got > expect = свежий save в D1 — НЕ подменять GAS (иначе UI «не закрепилось»).
  // got < expect + tombstone = delete/move — D1 важнее.
  // КРИТИЧНО: НИКОГДА не return live (сырой GAS) в UI — удалённый «возвращается» мгновенно,
  // даже если D1 уже чистый. Ответ всегда D1; недостающих (не tombstone) — upsert в фоне.
  if (a === "getClients" && fast && params && params.day) {
    try {
      const forceClients =
        String((params && params.force) || "") === "1" ||
        (params && (params.force === true || params.force === 1));
      const counts = await getSnapRaw_(env, "weekDayCounts");
      let expect = null;
      ((counts && counts.items) || []).forEach(function (it) {
        if (it && String(it.day) === String(params.day)) expect = Number(it.count) || 0;
      });
      const got = Array.isArray(fast.clients) ? fast.clients.length : -1;
      if (expect != null && got !== expect) {
        const hasTomb = await dayHasFreshTombstone_(env, params.day);
        // D1 — источник правды для ответа UI
        if (forceClients || got > expect || hasTomb || got >= 0) {
          if (got > expect || hasTomb) {
            try {
              if (ctx && typeof ctx.waitUntil === "function") {
                ctx.waitUntil(rebuildWeekCounts_(env));
              } else {
                await rebuildWeekCounts_(env);
              }
            } catch (eRc) {}
          }
          // фон: подтянуть только недостающих (не tombstone), без подмены ответа
          if (!hasTomb && got < expect && ctx && typeof ctx.waitUntil === "function") {
            ctx.waitUntil(
              (async function () {
                try {
                  const live = await gasProxy_(a, params, env, { write: false });
                  if (!(live && live.status === "success")) return;
                  await sanitizeGasClientsPayload_(env, params.day, live);
                  await upsertMissingClientsFromGas_(env, params.day, live.clients || []);
                  await rebuildWeekCounts_(env);
                } catch (eBg) {}
              })()
            );
          } else if (needGas && ctx && typeof ctx.waitUntil === "function") {
            ctx.waitUntil(cutoverRevalidate_(a, params, env));
          }
          fast.cutover = true;
          fast.swr = true;
          fast.fromGas = false;
          fast.source = fast.source || "d1";
          if (fast.sandbox === true) fast.sandbox = false;
          return fast;
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
  // Подписки CRM: пустой/битый snap или force=1 — сразу полный GAS (без sheet=),
  // иначе UI кэширует «Пусто в ПП/АФК/БП» и soft больше не ходит в сеть.
  {
    const forceSubs =
      a === "listSubscriptions" &&
      (String((params && params.force) || "") === "1" ||
        (params && (params.force === true || params.force === 1)));
    const emptySubs =
      a === "listSubscriptions" &&
      (!fast ||
        !Array.isArray(fast.subscriptions) ||
        !fast.subscriptions.length);
    if (forceSubs || emptySubs) {
      try {
        const liveSubs = await gasProxy_(
          "listSubscriptions",
          {},
          env,
          { write: false }
        );
        if (
          liveSubs &&
          liveSubs.status === "success" &&
          Array.isArray(liveSubs.subscriptions) &&
          liveSubs.subscriptions.length
        ) {
          try {
            await cutoverStoreRead_("listSubscriptions", {}, env, liveSubs);
          } catch (eSubStore) {}
          liveSubs.cutover = true;
          liveSubs.fromGas = true;
          liveSubs.swr = true;
          liveSubs.sandbox = false;
          return liveSubs;
        }
      } catch (eSubLive) {}
    }
  }

  // Переносы/задачи: force или пустой snap — GAS + merge D1.
  // (snap с pp/remind но без transfer НЕ блокируем на GAS каждый раз — repair в фоне)
  {
    const forceDef =
      a === "listDeferred" &&
      (String((params && params.force) || "") === "1" ||
        (params && (params.force === true || params.force === 1)));
    const snapXferN =
      a === "listDeferred" && fast && Array.isArray(fast.items)
        ? fast.items.filter(function (it) {
            return deferredItemIsProtectedTransfer_(it);
          }).length
        : 0;
    const emptyDef =
      a === "listDeferred" &&
      (!fast || !Array.isArray(fast.items) || !fast.items.length);
    if (forceDef || emptyDef) {
      try {
        await repairParkedTransfersFromOrders_(env);
      } catch (eRep0) {}
      try {
        const liveDef = await gasProxy_("listDeferred", params || {}, env, { write: false });
        if (liveDef && liveDef.status === "success") {
          const mergedDef = await mergeListDeferredPayload_(env, liveDef);
          if (mergedDef) {
            const finalDef = await finalizeListDeferredPayload_(env, mergedDef);
            try {
              await putSnap_(env, "listDeferred", finalDef);
            } catch (eDefStore) {}
            finalDef.cutover = true;
            finalDef.fromGas = true;
            finalDef.swr = true;
            finalDef.sandbox = false;
            return finalDef;
          }
        }
      } catch (eDefLive) {}
      try {
        const after = await getSnapRaw_(env, "listDeferred");
        if (after && Array.isArray(after.items)) {
          const finalAfter = await finalizeListDeferredPayload_(env, after);
          try {
            await putSnap_(env, "listDeferred", finalAfter);
          } catch (eFa) {}
          finalAfter.cutover = true;
          finalAfter.fromD1 = true;
          finalAfter.swr = true;
          finalAfter.sandbox = false;
          return finalAfter;
        }
      } catch (eAfter) {}
    } else if (a === "listDeferred" && snapXferN === 0 && ctx && typeof ctx.waitUntil === "function") {
      // в фоне: восстановить transfer из deleted orders + merge GAS, не тормозя UI
      ctx.waitUntil(
        (async function () {
          try {
            await repairParkedTransfersFromOrders_(env);
          } catch (eR) {}
          try {
            await cutoverRevalidate_("listDeferred", params || {}, env);
          } catch (eV) {}
        })()
      );
    }
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
    // delete/move: пустой D1 + tombstone — не воскрешать из GAS в Просмотре
    if (a === "getViewCompare") {
      const dayHint = String((params && params.day) || (fast && fast.day) || "");
      if (dayHint) {
        try {
          if (await dayHasFreshTombstone_(env, dayHint)) {
            fast.cutover = true;
            fast.swr = true;
            fast.fromGas = false;
            fast.source = fast.source || "d1";
            if (fast.sandbox === true) fast.sandbox = false;
            return fast;
          }
        } catch (eTombVc) {}
      }
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
  if (fast && typeof fast === "object") {
    if (a === "listDeferred") {
      try {
        fast = await finalizeListDeferredPayload_(env, fast);
      } catch (eFinDef) {}
    }
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
      if (a === "getClients" && params && params.day) {
        await sanitizeGasClientsPayload_(env, params.day, live);
      }
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
  const q0 = String(text || "").trim();
  if (q0.length < 2) return [];

  function parseHouse_(s) {
    const raw = String(s || "").trim().replace(/\s+/g, " ");
    let m = raw.match(/^(.*?)(?:,\s*|\s+)(?:д\.?|дом)\s*([0-9]+[а-яa-z]?(?:\s*[\/кk]\s*[0-9]+[а-яa-z]?)?)\s*$/i);
    if (m && /[а-яa-z]/i.test(m[1])) {
      return { street: String(m[1]).trim(), house: String(m[2]).replace(/\s+/g, "") };
    }
    m = raw.match(/^(.*?)(?:,\s*|\s+)([0-9]+[а-яa-z]?(?:\s*[\/кk]\s*[0-9]+[а-яa-z]?)?)\s*$/i);
    if (m && /[а-яa-z]/i.test(m[1]) && !/^\d{5,6}$/.test(m[2])) {
      return { street: String(m[1]).trim().replace(/[,\s]+$/g, ""), house: String(m[2]).replace(/\s+/g, "") };
    }
    return { street: raw, house: "" };
  }

  function foldKey_(s) {
    return String(s || "")
      .toUpperCase()
      .replace(/Ё/g, "Е")
      .replace(/І/g, "И")
      .replace(/Ў/g, "У")
      .replace(/['’ʻ]/g, "")
      .replace(/\bУЛ\.?\b/g, " ")
      .replace(/\bУЛИЦ[АЫ]\b/g, " ")
      .replace(/\bВУЛ\.?\b/g, " ")
      .replace(/\bВУЛІЦ[АЫЕУ]?\b/g, " ")
      .replace(/\bПРОСПЕКТ(Е|А|У)?\b/g, " ")
      .replace(/\bПРАСПЕКТ(Е|А|У)?\b/g, " ")
      .replace(/\bПР\.?\b/g, " ")
      .replace(/\bМИНСК\b/g, " ")
      .replace(/\bМІНСК\b/g, " ")
      .replace(/АЎСКАГА\b/g, "ОВСКОГО")
      .replace(/АУСКАГА\b/g, "ОВСКОГО")
      .replace(/СКАГА\b/g, "СКОГО")
      .replace(/АВА\b/g, "ОВА")
      .replace(/[.,«»"']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function fuzzyStreet_(qStreet, aStreet) {
    const qw = foldKey_(qStreet).split(" ").filter(function (w) { return w.length >= 4 && !/^\d/.test(w); });
    const aw = foldKey_(aStreet).split(" ").filter(function (w) { return w.length >= 3 && !/^\d/.test(w); });
    if (!qw.length) return true;
    if (!aw.length) return false;
    for (let i = 0; i < qw.length; i++) {
      for (let j = 0; j < aw.length; j++) {
        if (aw[j].indexOf(qw[i]) >= 0 || qw[i].indexOf(aw[j]) >= 0) return true;
        const n = Math.min(5, qw[i].length, aw[j].length);
        if (n >= 4 && qw[i].slice(0, n) === aw[j].slice(0, n)) return true;
        if (qw[i].length >= 6 && aw[j].length >= 6) {
          let same = 0;
          const lim = Math.min(qw[i].length, aw[j].length, 10);
          for (let k = 0; k < lim; k++) if (qw[i].charAt(k) === aw[j].charAt(k)) same++;
          if (same >= Math.max(4, Math.floor(lim * 0.55))) return true;
        }
      }
    }
    return false;
  }

  function mapRows_(arr, want) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    const seen = {};
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      const lat = Number(it.lat);
      const lon = Number(it.lon);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      if (!(lat >= 53.65 && lat <= 54.15 && lon >= 27.15 && lon <= 28.05) &&
          !(lat >= 51.2 && lat <= 56.3 && lon >= 23.1 && lon <= 32.9)) continue;
      const ad = it.address || {};
      const street = String(ad.road || ad.pedestrian || ad.street || ad.avenue || "").trim();
      const house = String(ad.house_number || "").trim();
      let title = street && house ? street + ", " + house : street || house || String(it.display_name || "").split(",")[0];
      title = String(title || "").replace(/,\s*(Беларусь|Belarus|Минск|Minsk|Мінск).*$/i, "").trim();
      if (!title) continue;
      const wantH = String(want.house || "").toLowerCase().replace(/\s+/g, "");
      const gotH = house.toLowerCase().replace(/\s+/g, "");
      if (wantH) {
        if (gotH && (gotH === wantH || gotH.indexOf(wantH) === 0 || wantH.indexOf(gotH) === 0)) {
          // ok — house match, keep even if BY street spelling
        } else if (!fuzzyStreet_(want.street || q0, title)) {
          continue;
        }
      } else if (!fuzzyStreet_(want.street || q0, title)) {
        continue;
      }
      const key = foldKey_(title) + "#" + gotH;
      if (seen[key]) continue;
      seen[key] = true;
      out.push({
        title: title,
        subtitle: String(it.display_name || ""),
        address: title,
        house: house,
        kind: it.type || it.class || it.addresstype || "",
        lat: lat,
        lon: lon,
        yandexUrl:
          isFinite(lat) && isFinite(lon)
            ? "https://yandex.ru/maps/?pt=" + lon + "," + lat + "&z=17&l=map"
            : ""
      });
    }
    if (want.house) {
      out.sort(function (a, b) {
        const ah = String(a.house || "").toLowerCase() === String(want.house).toLowerCase() ? 1 : 0;
        const bh = String(b.house || "").toLowerCase() === String(want.house).toLowerCase() ? 1 : 0;
        return bh - ah;
      });
    }
    return out.slice(0, 8);
  }

  async function fetchJson_(url) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "boinya-c-worker/1.1 (cutover address suggest)",
        Accept: "application/json"
      }
    });
    if (!res.ok) return [];
    const arr = await res.json();
    return Array.isArray(arr) ? arr : [];
  }

  try {
    const want = parseHouse_(q0);
    const queries = [];
    if (want.house && want.street) {
      const bare = want.street
        .replace(/^(ул\.?|улица|пр\.?-?\s*т\.?|проспект|пер\.?|переулок|бул\.?|бульвар)\s+/i, "")
        .trim();
      const stVariants = [want.street];
      if (bare && bare !== want.street) stVariants.push(bare);
      if (!/^(ул\.?|улица|пр)/i.test(want.street)) stVariants.push("улица " + bare, "проспект " + bare);
      for (let si = 0; si < stVariants.length; si++) {
        const streetParam = want.house + " " + stVariants[si];
        const rows = await fetchJson_(
          "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=by&accept-language=ru" +
            "&street=" + encodeURIComponent(streetParam) +
            "&city=" + encodeURIComponent("Минск") +
            "&viewbox=" + encodeURIComponent("27.15,54.15,28.05,53.65") + "&bounded=0"
        );
        const mapped = mapRows_(rows, want);
        if (mapped.length) return mapped;
      }
      queries.push("Минск, " + want.street + ", " + want.house);
      queries.push("Минск, " + bare + ", " + want.house);
      queries.push(want.street + " " + want.house + ", Минск");
    }
    queries.push(q0 + ", Минск");
    queries.push("Минск, " + q0);
    for (let qi = 0; qi < queries.length; qi++) {
      const rows = await fetchJson_(
        "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=by&accept-language=ru&q=" +
          encodeURIComponent(queries[qi]) +
          "&viewbox=" + encodeURIComponent("27.15,54.15,28.05,53.65")
      );
      const mapped = mapRows_(rows, want);
      if (mapped.length) return mapped;
    }
    return [];
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
  if (a === "getCutting") {
    const touched = Number((fast && fast.flagsTouchedAt) || 0);
    if (touched && now - touched < 600000) return false;
    minGap = empty ? 60000 : 180000;
  }
  if (a === "getCourier" || a === "getAssembly") {
    const touchedOps = Number((fast && fast.flagsTouchedAt) || 0);
    if (touchedOps && now - touchedOps < 600000) return false;
    minGap = empty ? 30000 : 120000;
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
    return { status: "error", message: "calc_unavailable", action: a, cutover: true, empty: true };
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
    if (a === "getWarehouse") {
      if (params.view || params.asOf || String(params.force || "") === "1") return null;
      return getSnapRaw_(env, "warehouse");
    }
    if (a === "warehousePreview") {
      if (params.dateFrom || params.dateTo || params.asOf || String(params.force || "") === "1") return null;
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
    if (a === "getSubscription") return null;
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
    let list = Array.isArray(payload.clients) ? payload.clients : [];
    list = await filterTombstonedClients_(env, params.day, list);
    payload = Object.assign({}, payload, { clients: list });
    // после move/delete не заливать GAS на день-источник — иначе «призрак» на старом дне
    const tomb = await getSnapRaw_(env, "deleteTombstones");
    let freshTomb = ((tomb && tomb.items) || []).some(function (t) {
      return t && String(t.day) === String(params.day) && Date.now() - Number(t.at || 0) < TOMBSTONE_MS;
    });
    if (!freshTomb) {
      try {
        const td = await getSnapRaw_(env, "tombDay:" + String(params.day));
        if (td && Date.now() - Number(td.at || 0) < TOMBSTONE_MS) freshTomb = true;
      } catch (eTd2) {}
    }
    const explicitDrop = !!(payload._explicitDelete || payload._moveDropClient);
    if (freshTomb || payload._d1MoveKeep || explicitDrop) {
      await putSnap_(env, "clients:" + params.day, payload);
      // на дне-источнике переноса / явном delete — снести drop-клиента из D1
      if (payload._moveDropClient || payload._explicitDelete) {
        const dropWho = payload._moveDropClient || payload._explicitDeleteClient || "";
        try {
          // stale after-write старого move не должен сносить свежий arrive на этот день
          var protDrop = await getSnapRaw_(env, "moveArriveProtect");
          if (
            !payload._explicitDelete &&
            isMoveArriveProtected_(protDrop, params.day, dropWho, dropWho)
          ) {
            return;
          }
          try {
            var epNow = await getSnapRaw_(env, "moveEpoch:" + normalizeMatchKey_(dropWho || ""));
            if (!payload._explicitDelete && epNow && String(epNow.to || "") === String(params.day || "")) {
              return;
            }
          } catch (eEpG) {}
          await deleteClient_(
            {
              client: dropWho,
              day: params.day,
              matchKey: normalizeMatchKey_(dropWho),
              _keepMoveEpoch: payload._explicitDelete ? "" : "1",
              _strictDay: payload._explicitDelete ? "" : "1"
            },
            env
          );
        } catch (eDrop) {}
      }
      return;
    }
    const replaceOpts = {};
    if (payload._skipProtectMissing) replaceOpts.skipProtectMissing = true;
    var skipDropArrive = false;
    if (payload._moveDropClient) {
      try {
        var protDrop2 = await getSnapRaw_(env, "moveArriveProtect");
        if (isMoveArriveProtected_(protDrop2, params.day, payload._moveDropClient, payload._moveDropClient)) {
          skipDropArrive = true;
        }
      } catch (ePD2) {}
      try {
        var epNow2 = await getSnapRaw_(env, "moveEpoch:" + normalizeMatchKey_(payload._moveDropClient || ""));
        if (epNow2 && String(epNow2.to || "") === String(params.day || "")) {
          skipDropArrive = true;
        }
      } catch (eEp2) {}
    }
    if (payload._moveDropClient && !skipDropArrive) {
      const dropMk2 = normalizeMatchKey_(payload._moveDropClient);
      replaceOpts.dropMks = {};
      if (dropMk2) replaceOpts.dropMks[dropMk2] = true;
      replaceOpts.dropMks[String(payload._moveDropClient).trim().toLowerCase()] = true;
      replaceOpts.skipProtectMissing = true;
    }
    // Явный delete/move-drop — точечный replace+drop.
    // Обычный GAS revalidate — только upsert недостающих (полный replace воскрешал delete в UI/D1).
    if (payload._explicitDelete || payload._moveDropClient || payload._d1MoveKeep) {
      await replaceDayOrdersFromClients_(env, params.day, list, replaceOpts);
    } else {
      await putSnap_(env, "clients:" + params.day, payload);
      await upsertMissingClientsFromGas_(env, params.day, list);
      return;
    }
    if (payload._moveDropClient && !skipDropArrive) {
      try {
        const dropMk3 = normalizeMatchKey_(payload._moveDropClient);
        const dropLow3 = String(payload._moveDropClient || "").trim().toLowerCase();
        const nowDrop3 = new Date().toISOString();
        await env.DB.prepare(
          "UPDATE orders SET status = 'deleted', updated_at = ? WHERE status = 'active' AND day_name = ? AND (match_key = ? OR lower(client) = ?)"
        )
          .bind(nowDrop3, params.day, dropMk3, dropLow3)
          .run();
        await putDeleteTombstone_(env, params.day, dropMk3 || payload._moveDropClient);
      } catch (eDrop3) {}
    }
    return;
  }
  if (a === "getViewCompare" && (payload.day || params.day || payload.dateIso || params.date)) {
    const day = payload.day || params.day;
    // не затираем D1-заказы week-списком GAS: иначе удаление/перенос «воскресает» человека
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
    const prev = await getSnapRaw_(env, "cutting:" + params.day);
    let items = Array.isArray(payload.items) ? payload.items.slice() : [];
    if (prev && Array.isArray(prev.items) && prev.items.length) {
      const touched = Number(prev.flagsTouchedAt || 0);
      const recent = !!(touched && Date.now() - touched < 600000);
      if (recent || cuttingFlagScore_(prev.items) >= cuttingFlagScore_(items)) {
        items = mergeCuttingFlags_(items, prev.items, true);
      }
    }
    items = resolveCuttingSheetRows_(items, (prev && prev.items) || [], null);
    items = normalizeCuttingItems_(items);
    const body = Object.assign({}, payload, {
      items: items,
      fromGas: true,
      fromD1: false,
      fromOrders: false,
      fromCalendar: false,
      cachedAt: new Date().toISOString(),
      flagsTouchedAt: (prev && prev.flagsTouchedAt) || 0
    });
    await putSnap_(env, "cutting:" + params.day, body);
    try {
      await rememberCuttingRows_(env, items);
    } catch (eRows) {}
    return;
  }
  if (a === "getCourier" && params.day) {
    const prevC = await getSnapRaw_(env, "courier:" + params.day);
    if (prevC && Array.isArray(prevC.clients) && Array.isArray(payload.clients)) {
      const recentC = !!(Number(prevC.flagsTouchedAt || 0) && Date.now() - Number(prevC.flagsTouchedAt) < 600000);
      const by = indexByMatchAliases_(prevC.clients);
      payload.clients.forEach(function (c) {
        const old = lookupByMatchAliases_(by, c.matchKey || c.name);
        if (!old) return;
        if (recentC) {
          c.delivered = !!old.delivered;
          if (old.paid) c.paid = old.paid;
          if (old.assembled) c.assembled = true;
        } else {
          if (old.delivered) c.delivered = true;
          if (old.assembled) c.assembled = true;
        }
      });
      // GAS иногда без части людей — не терять проставленные галочки
      if (recentC) {
        const inGas = indexByMatchAliases_(payload.clients);
        prevC.clients.forEach(function (pc) {
          if (!pc || !(pc.delivered || pc.assembled)) return;
          if (!lookupByMatchAliases_(inGas, pc.matchKey || pc.name)) payload.clients.push(pc);
        });
      }
      payload.flagsTouchedAt = prevC.flagsTouchedAt || 0;
    }
    await putSnap_(env, "courier:" + params.day, payload);
    return;
  }
  if (a === "getAssembly" && params.day) {
    const prevA = await getSnapRaw_(env, "assembly:" + params.day);
    if (prevA && Array.isArray(prevA.clients) && Array.isArray(payload.clients)) {
      const recentA = !!(Number(prevA.flagsTouchedAt || 0) && Date.now() - Number(prevA.flagsTouchedAt) < 600000);
      const byA = indexByMatchAliases_(prevA.clients);
      payload.clients.forEach(function (c) {
        const old = lookupByMatchAliases_(byA, c.matchKey || c.name);
        if (!old) return;
        if (recentA) {
          c.assembled = !!old.assembled;
          c.printed = !!old.printed;
          if (old.packs) c.packs = old.packs;
          if (old.totalBags != null) c.totalBags = old.totalBags;
          if (old.craftBags != null) c.craftBags = old.craftBags;
        } else {
          if (old.assembled) c.assembled = true;
          if (old.printed) c.printed = true;
        }
      });
      if (recentA) {
        const inGasA = indexByMatchAliases_(payload.clients);
        prevA.clients.forEach(function (pc) {
          if (!pc || !(pc.assembled || pc.printed)) return;
          if (!lookupByMatchAliases_(inGasA, pc.matchKey || pc.name)) payload.clients.push(pc);
        });
      }
      payload.flagsTouchedAt = prevA.flagsTouchedAt || 0;
      if (prevA.typeTotals && !payload.typeTotals) payload.typeTotals = prevA.typeTotals;
      if (prevA.counterTotals && !payload.counterTotals) payload.counterTotals = prevA.counterTotals;
    }
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
  if (a === "listDeferred") {
    // Критично: GAS/SWR без tid или до дописки строки затирали D1-задачи mode=transfer.
    // Клиента уже сняли с дня («Не получил») → человек «просто пропал».
    payload = await mergeListDeferredPayload_(env, payload);
    if (!payload) return;
    payload = await finalizeListDeferredPayload_(env, payload);
    await putSnap_(env, "listDeferred", payload);
    return;
  }
  if (a === "listSubscriptions") {
    const sheetFilter = String((params && (params.sheet || params.segment)) || "").trim();
    const incoming = Array.isArray(payload.subscriptions) ? payload.subscriptions : [];
    let prevArr = [];
    try {
      const prev = await getSnapRaw_(env, "listSubscriptions");
      prevArr = prev && Array.isArray(prev.subscriptions) ? prev.subscriptions : [];
    } catch (ePrev) {
      prevArr = [];
    }
    // Пустым ответом полный snap не затираем
    if (!incoming.length && prevArr.length) return;
    // Ответ с фильтром sheet=… — не класть как весь список (иначе ПП/АФК/БП пустеют)
    if (sheetFilter) {
      const sheetsSeen = Object.create(null);
      incoming.forEach(function (s) {
        const sh = String((s && s.sheet) || "").trim();
        if (sh) sheetsSeen[sh] = 1;
      });
      const multiSheet = Object.keys(sheetsSeen).length > 1;
      if (!multiSheet) {
        // merge: заменить только этот sheet, остальное из prev
        const keep = prevArr.filter(function (s) {
          return String((s && s.sheet) || "").trim() !== sheetFilter;
        });
        const add = incoming.filter(function (s) {
          const sh = String((s && s.sheet) || "").trim();
          return !sh || sh === sheetFilter;
        });
        const merged = keep.concat(add);
        if (!merged.length && prevArr.length) return;
        if (merged.length < prevArr.length && add.length === 0) return;
        await putSnap_(
          env,
          "listSubscriptions",
          Object.assign({}, payload, {
            subscriptions: merged,
            count: merged.length,
            sheet: "all",
            mergedSheet: sheetFilter
          })
        );
        return;
      }
    }
    // Полный ответ короче prev больше чем вдвое — подозрительно, не затираем
    if (prevArr.length >= 10 && incoming.length < Math.floor(prevArr.length * 0.5)) return;
    await putSnap_(
      env,
      a,
      Object.assign({}, payload, {
        subscriptions: incoming,
        count: incoming.length,
        sheet: sheetFilter && Object.keys(
          incoming.reduce(function (acc, s) {
            const sh = String((s && s.sheet) || "").trim();
            if (sh) acc[sh] = 1;
            return acc;
          }, Object.create(null))
        ).length > 1
          ? "all"
          : payload.sheet || "all"
      })
    );
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

/** Добавить в D1 только тех, кого нет (и нет tombstone). Не трогает уже активных. */
async function upsertMissingClientsFromGas_(env, day, clients) {
  if (!env || !env.DB || !day || !Array.isArray(clients) || !clients.length) return 0;
  await ensureMetaColumn_(env);
  const info = await dayDateInfo_(env, day);
  const dateIso = (info && info.iso) || "";
  const now = new Date().toISOString();
  let tomb = (await getSnapRaw_(env, "deleteTombstones")) || { items: [] };
  tomb.items = (tomb.items || []).slice();
  try {
    const td = await getSnapRaw_(env, "tombDay:" + String(day));
    if (td && td.at && Date.now() - Number(td.at) < TOMBSTONE_MS) tomb._dayFresh = true;
  } catch (eTd) {}
  let added = 0;
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    if (!c) continue;
    const name = String(c.name || c.client || "").trim();
    const mk = normalizeMatchKey_(c.matchKey || name);
    if (!mk || !name) continue;
    try {
      const pkT = await getSnapRaw_(env, "delTomb:" + String(day) + ":" + mk);
      if (pkT && pkT.mk && !pkT.cleared && Number(pkT.at || 0) > 0) tomb.items.push(pkT);
    } catch (ePK) {}
    if (isTombstoned_(tomb, day, mk, name)) continue;
    try {
      const ep = await getSnapRaw_(env, "moveEpoch:" + mk);
      if (ep && ep.to && String(ep.to) !== String(day)) continue;
    } catch (eEp) {}
    let exists = null;
    try {
      exists = await findOrderRow_(env, mk, day, dateIso, name);
    } catch (eF) {
      exists = null;
    }
    if (exists && String(exists.status || "") === "active") continue;
    try {
      await upsertOrderRow_(env, {
        id: day + ":" + mk,
        date_iso: dateIso,
        day_name: day,
        client: name,
        match_key: mk,
        address: String(c.address || ""),
        note: String(c.note || ""),
        phone: String(c.phone || ""),
        basket_json: JSON.stringify(c.basket || []),
        segment: normalizeSegmentLabel_(c.segment || c.orderType || c.source || ""),
        source: String(c.source || ""),
        status: "active",
        updated_at: now,
        meta_json: "{}"
      });
      added++;
    } catch (eUp) {}
  }
  return added;
}

async function replaceDayOrdersFromClients_(env, day, clients, opts) {
  opts = opts || {};
  await ensureMetaColumn_(env);
  const info = await dayDateInfo_(env, day);
  const now = new Date().toISOString();
  const nowMs = Date.now();
  // Не затирать свежие D1-записи старым GAS (edit ещё не доехал / таймаут)
  const protectMs = opts.protectMs != null ? Number(opts.protectMs) : 12 * 60 * 1000;
  // По умолчанию D1 — источник правды: GAS не может «вернуть» удалённого.
  const allowGasInsert = opts.allowGasInsert === true;

  let tomb = null;
  try {
    tomb = await getSnapRaw_(env, "deleteTombstones");
  } catch (eTombLoad) {
    tomb = null;
  }
  if (!tomb) tomb = { items: [] };
  tomb.items = (tomb.items || []).slice();
  try {
    const td = await getSnapRaw_(env, "tombDay:" + String(day));
    if (td && td.at && Date.now() - Number(td.at) < TOMBSTONE_MS) {
      // маркер дня с недавним delete/move — не заливать GAS-only людей
      tomb._dayFresh = true;
    }
  } catch (eTd) {}
  let arriveProtect = null;
  try {
    arriveProtect = await getSnapRaw_(env, "moveArriveProtect");
  } catch (eAP) {
    arriveProtect = null;
  }

  const gasByMk = Object.create(null);
  for (var ci = 0; ci < (clients || []).length; ci++) {
    var c = clients[ci];
    if (!c) continue;
    var mk = normalizeMatchKey_(c.matchKey || c.name || c.client || "");
    if (!mk) continue;
    try {
      var pkT = await getSnapRaw_(env, "delTomb:" + String(day) + ":" + mk);
      if (pkT && pkT.mk && !pkT.cleared && Number(pkT.at || 0) > 0) tomb.items.push(pkT);
    } catch (ePKT) {}
    if (isTombstoned_(tomb, day, mk, c.name || c.client)) continue;
    if (isMoveArriveProtectedElsewhere_(arriveProtect, day, mk, c.name || c.client)) continue;
    try {
      var epRep = await getSnapRaw_(env, "moveEpoch:" + mk);
      if (epRep && epRep.to && String(epRep.to) !== String(day)) continue;
    } catch (eEpR) {}
    gasByMk[mk] = c;
  }

  const byMk = Object.create(null);
  let existingCount = 0;
  try {
    const q = await env.DB.prepare(
      "SELECT * FROM orders WHERE day_name = ? AND status = 'active'"
    )
      .bind(day)
      .all();
    const existing = (q && q.results) || [];
    existingCount = existing.length;

    // 1) Сначала все живые D1 (минус tomb/drop) — база правды
    for (let ei = 0; ei < existing.length; ei++) {
      const row = existing[ei];
      if (!row) continue;
      const mk = normalizeMatchKey_(row.match_key || row.client || "");
      if (!mk) continue;
      if (isTombstoned_(tomb, day, mk, row.client)) continue;
      if (isMoveArriveProtectedElsewhere_(arriveProtect, day, mk, row.client)) continue;
      try {
        var epRow = await getSnapRaw_(env, "moveEpoch:" + mk);
        if (epRow && epRow.to && String(epRow.to) !== String(day)) continue;
      } catch (eEpRow) {}
      if (opts.dropMks && (opts.dropMks[mk] || opts.dropMks[String(row.client || "").toLowerCase()])) {
        continue;
      }
      const gasC = gasByMk[mk];
      const updatedMs = Date.parse(String(row.updated_at || "")) || 0;
      const d1Fresh = !!(updatedMs && nowMs - updatedMs < protectMs);
      const d1Sig = basketSig_(row.basket_json);
      const gasSig = basketSig_(gasC && gasC.basket);
      // свежий D1 / нет GAS / другой состав → оставляем D1
      if (d1Fresh || !gasC || (d1Sig && d1Sig !== gasSig) || opts.skipProtectMissing) {
        const kept = clientFromRow_(row);
        kept.updated_at = row.updated_at;
        byMk[mk] = kept;
      } else {
        byMk[mk] = gasC;
      }
    }
  } catch (eProt) {}

  // 2) GAS-only: ТОЛЬКО при явном allowGasInsert (bootstrap).
  //    Никогда не заливать лист в D1 при existingCount===0 — иначе delete «вернулся»
  //    и параллельно «пропадали» люди при гонке replace.
  const canInsertGas = allowGasInsert === true;
  if (canInsertGas) {
    Object.keys(gasByMk).forEach(function (mk) {
      if (!byMk[mk]) byMk[mk] = gasByMk[mk];
    });
  }

  const merged = Object.keys(byMk).map(function (k) {
    return byMk[k];
  });

  await env.DB.prepare(
    "UPDATE orders SET status = 'deleted', updated_at = ? WHERE day_name = ? AND status = 'active'"
  )
    .bind(now, day)
    .run();
  for (let i = 0; i < merged.length; i++) {
    const c = merged[i];
    const mk = normalizeMatchKey_(c.matchKey || c.name || c.client || "");
    if (!mk) continue;
    if (isTombstoned_(tomb, day, mk, c.name || c.client)) continue;
    const basket = JSON.stringify(c.basket || []);
    const segC = normalizeSegmentLabel_(c.segment || c.orderType || c.source || "");
    const srcC = String(c.source || "").trim() || sourceFromSegment_(segC);
    const meta = {
      orderPrice: c.orderPrice,
      ppSlot: c.ppSlot,
      ppHint: c.ppHint,
      ppPartner: c.ppPartner,
      noCut: !!c.noCut,
      dogCount: c.dogCount,
      geo: c.geo,
      deliveryAfter: c.deliveryAfter,
      deliveryBefore: c.deliveryBefore,
      couponsQty: c.couponsQty,
      couponPrice: c.couponPrice,
      segment: segC
    };
    const keepUpdated =
      (c.updated_at || c.updatedAt) &&
      Date.parse(String(c.updated_at || c.updatedAt)) &&
      nowMs - Date.parse(String(c.updated_at || c.updatedAt)) < protectMs
        ? String(c.updated_at || c.updatedAt)
        : now;
    await upsertOrderRow_(env, {
      id: day + ":" + mk,
      date_iso: info.iso || c.dateIso || "",
      day_name: day,
      client: c.name || c.client || "",
      match_key: mk,
      address: c.address || "",
      note: c.note || "",
      phone: c.phone || "",
      basket_json: basket,
      segment: segC,
      source: srcC,
      status: "active",
      updated_at: keepUpdated,
      meta_json: JSON.stringify(meta)
    });
  }
  await rebuildWeekCounts_(env);
}

function basketSig_(basketOrJson) {
  try {
    let arr = basketOrJson;
    if (typeof arr === "string") arr = JSON.parse(arr || "[]");
    if (!Array.isArray(arr)) return "";
    return arr
      .map(function (it) {
        const name = String((it && (it.name || it.main)) || "").trim().toUpperCase();
        const sub = String((it && it.sub) || "").trim().toUpperCase();
        const val = Number(it && (it.val != null ? it.val : it.value)) || 0;
        return name + "|" + sub + "|" + val;
      })
      .filter(Boolean)
      .sort()
      .join(";");
  } catch (e) {
    return "";
  }
}

function overlayWriteClientOnList_(list, params) {
  const wantClient = String((params && (params.client || params.nick)) || "").trim();
  if (!wantClient) return list || [];
  const mk = normalizeMatchKey_((params && params.matchKey) || wantClient);
  const basketArr = parseBasket_(params && params.basket);
  const segSave = segmentFromOrderParams_(params);
  const srcSave =
    String((params && params.source) || "").trim() || sourceFromSegment_(segSave) || "";
  const row = {
    name: wantClient,
    matchKey: mk,
    address: String((params && params.address) || ""),
    note: String((params && params.note) || ""),
    phone: String((params && params.phone) || ""),
    basket: basketArr,
    segment: segSave,
    source: srcSave,
    orderPrice: params && params.orderPrice,
    ppSlot: params && (params.ppSlot || params.deliverySlot),
    ppPartner: params && params.ppPartner,
    deliveryAfter: params && params.deliveryAfter,
    deliveryBefore: params && params.deliveryBefore,
    couponsQty: params && params.couponsQty,
    couponPrice: params && params.couponPrice,
    updated_at: new Date().toISOString()
  };
  let found = false;
  const out = (list || []).map(function (c) {
    if (
      nicksLooseMatch_(c && (c.name || c.client), wantClient) ||
      normalizeMatchKey_(c && c.matchKey) === mk
    ) {
      found = true;
      return Object.assign({}, c, row, {
        basket: basketArr.length ? basketArr : c.basket || []
      });
    }
    return c;
  });
  if (!found) out.push(row);
  return out;
}

async function cutoverRevalidate_(a, params, env) {
  try {
    // listSubscriptions: всегда полный список в snap.
    // UI/GAS с sheet=ПП|АФК|БП иначе перезаписывают snap урезанным → другие вкладки «Пусто».
    let p = params || {};
    if (a === "listSubscriptions") {
      p = Object.assign({}, p);
      delete p.sheet;
      delete p.segment;
      delete p.force;
      delete p._;
    }
    const fresh = await gasProxy_(a, p, env, { write: false });
    if (!(fresh && fresh.status === "success")) return;
    if (a === "getClients" && p.day) {
      await sanitizeGasClientsPayload_(env, p.day, fresh);
      // не full-replace из GAS (воскрешает delete) — только недостающие
      await upsertMissingClientsFromGas_(env, p.day, fresh.clients || []);
      try {
        await putSnap_(env, "clients:" + p.day, fresh);
      } catch (eSnap) {}
      return;
    }
    await cutoverStoreRead_(a, p, env, fresh);
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
        await sanitizeGasClientsPayload_(env, day, fresh);
        await upsertMissingClientsFromGas_(env, day, fresh.clients || []);
        try {
          await putSnap_(env, "clients:" + day, fresh);
        } catch (eS) {}
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
    if (
      /^(updateCutting|startCuttingSession|stopCuttingSession|finishCutting|setDelivered|setAssembled)$/i.test(
        a
      )
    ) {
      return;
    }
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
          let gasClientsFresh = false;
          const wantClient = String(params.client || params.nick || "").trim();
          const oldDay = String(params.oldDay || "");
          const newDay = String(params.newDay || "");
          try {
            const fresh = await gasProxy_("getClients", { day: day }, env, { write: false });
            if (fresh && fresh.status === "success") {
              let list = Array.isArray(fresh.clients) ? fresh.clients.slice() : [];
              let gasClientRow = null;
              const inGas = wantClient
                ? list.some(function (c) {
                    if (nicksLooseMatch_(c && (c.name || c.client), wantClient)) {
                      gasClientRow = c;
                      return true;
                    }
                    return false;
                  })
                : false;
              const gasBasketMatchesWrite =
                !wantClient ||
                !/^(saveOrder|saveBooking)$/i.test(a) ||
                (basketSig_(params && params.basket) &&
                  basketSig_(params.basket) === basketSig_(gasClientRow && gasClientRow.basket));
              // всегда накладываем состав из write — иначе edit затирается старым GAS
              if (/^(saveOrder|saveBooking)$/i.test(a) && wantClient) {
                list = overlayWriteClientOnList_(list, params);
                fresh.clients = list;
              }
              if (/^(deleteClient|removeCalendarClient)$/i.test(a) && wantClient) {
                list = list.filter(function (c) {
                  return !nicksLooseMatch_(c && (c.name || c.client), wantClient);
                });
                fresh.clients = list;
                fresh._explicitDelete = true;
                fresh._explicitDeleteClient = wantClient;
                fresh._moveDropClient = wantClient;
                fresh._skipProtectMissing = true;
              }
              if (/^moveClient$/i.test(a) && wantClient) {
                if (day && oldDay && day === oldDay) {
                  list = list.filter(function (c) {
                    return !nicksLooseMatch_(c && (c.name || c.client), wantClient);
                  });
                  fresh.clients = list;
                  fresh._moveDropClient = wantClient;
                  fresh._skipProtectMissing = true;
                }
                if (day && newDay && day === newDay) {
                  try {
                    var mkEpochNew = normalizeMatchKey_(params.matchKey || wantClient);
                    var epNew = await getSnapRaw_(env, "moveEpoch:" + mkEpochNew);
                    // Обратный перенос уже увёл клиента с этого newDay — не воскрешать.
                    var stillDest =
                      !epNew ||
                      !epNew.to ||
                      String(epNew.to || "") === String(day || "");
                    if (!stillDest) {
                      list = list.filter(function (c) {
                        return !nicksLooseMatch_(c && (c.name || c.client), wantClient);
                      });
                      fresh.clients = list;
                      fresh._moveStaleSkip = true;
                    } else {
                      var mkKeep0 = normalizeMatchKey_(params.matchKey || wantClient);
                      var tombArrive = await hasFreshDeleteTombstone_(
                        env,
                        day,
                        mkKeep0,
                        wantClient
                      );
                      if (tombArrive) {
                        list = list.filter(function (c) {
                          return !nicksLooseMatch_(c && (c.name || c.client), wantClient);
                        });
                        fresh.clients = list;
                        fresh._moveDropClient = wantClient;
                        fresh._explicitDelete = true;
                        fresh._explicitDeleteClient = wantClient;
                        fresh._skipProtectMissing = true;
                      } else {
                      var rowD1 = await findOrderRow_(
                        env,
                        params.matchKey || wantClient,
                        day,
                        params.newDate || "",
                        wantClient
                      );
                      // GAS на newDay почти всегда без человека — не давать replaceDayOrders снести D1.
                      // Если строки нет (гонка) — восстановить из writeRes/params.
                      if (!rowD1 && writeRes && writeRes.status === "success") {
                        try {
                          var mkKeep = mkKeep0;
                          await upsertOrderRow_(env, {
                            id: day + ":" + mkKeep,
                            date_iso: String(params.newDate || ""),
                            day_name: day,
                            client: wantClient,
                            match_key: mkKeep,
                            address: "",
                            note: "",
                            phone: "",
                            basket_json: "[]",
                            segment: "",
                            source: "",
                            status: "active",
                            updated_at: new Date().toISOString(),
                            meta_json: "{}"
                          });
                          rowD1 = await findOrderRow_(
                            env,
                            params.matchKey || wantClient,
                            day,
                            params.newDate || "",
                            wantClient
                          );
                        } catch (eRe) {}
                      }
                      const fromD1 = rowD1 ? clientFromRow_(rowD1) : {
                        name: wantClient,
                        client: wantClient,
                        matchKey: normalizeMatchKey_(params.matchKey || wantClient)
                      };
                      list = list.filter(function (c) {
                        return !nicksLooseMatch_(c && (c.name || c.client), wantClient);
                      });
                      list = list.concat([fromD1]);
                      fresh.clients = list;
                      fresh._d1MoveKeep = true;
                      fresh._skipProtectMissing = false;
                      }
                    }
                  } catch (eKeep) {
                    fresh._d1MoveKeep = true;
                  }
                }
              }
              const writeOk =
                writeRes &&
                writeRes.status === "success" &&
                !writeRes.gasError &&
                !/gas_proxy_failed/i.test(String(writeRes.message || ""));
              // save: GAS «свежий» только если человек есть И состав уже совпал (иначе cutting с листа сотрёт D1-план)
              if (/^(saveOrder|saveBooking)$/i.test(a))
                gasClientsFresh = !!(writeOk && inGas && gasBasketMatchesWrite);
              else if (/^(deleteClient|removeCalendarClient)$/i.test(a)) gasClientsFresh = !!(writeOk && !inGas);
              else if (/^moveClient$/i.test(a)) {
                if (day === oldDay) gasClientsFresh = !!(writeOk && !inGas);
                else if (day === newDay) gasClientsFresh = !!(writeOk && inGas);
                else gasClientsFresh = !!writeOk;
              } else {
                gasClientsFresh = true;
              }
              // moveClient: НИКОГДА не cutoverStoreRead/replaceDayOrders — только точечный delete на oldDay.
              // deleteClient: то же — sync уже снёс D1; replaceDayOrders из GAS убивает свежий saveOrder.
              if (/^moveClient$/i.test(a)) {
                if (newDay && day === newDay) {
                  try {
                    var mkFix = normalizeMatchKey_(params.matchKey || wantClient);
                    var epFix = await getSnapRaw_(env, "moveEpoch:" + mkFix);
                    // Stale after-write прошлого move: клиент уже на другом дне — не protect/upsert сюда.
                    if (epFix && epFix.to && String(epFix.to) !== String(newDay)) {
                      // skip
                    } else {
                      try {
                        var tombFix0 = await hasFreshDeleteTombstone_(
                          env,
                          newDay,
                          mkFix,
                          wantClient
                        );
                        if (!tombFix0) {
                          await putMoveArriveProtect_(
                            env,
                            newDay,
                            mkFix,
                            wantClient
                          );
                        }
                      } catch (eP2) {}
                      // убедиться что arrive жив в D1 (не если уже удалили)
                      try {
                        var liveNew = await findOrderRow_(env, params.matchKey || wantClient, newDay, params.newDate || "", wantClient);
                        var tombFix = await hasFreshDeleteTombstone_(env, newDay, mkFix, wantClient);
                        if (!liveNew && !tombFix) {
                          await upsertOrderRow_(env, {
                            id: newDay + ":" + mkFix,
                            date_iso: String(params.newDate || ""),
                            day_name: newDay,
                            client: wantClient,
                            match_key: mkFix,
                            address: "",
                            note: "",
                            phone: "",
                            basket_json: "[]",
                            segment: "",
                            source: "",
                            status: "active",
                            updated_at: new Date().toISOString(),
                            meta_json: "{}"
                          });
                        }
                      } catch (eFix) {}
                    }
                  } catch (eFixOuter) {}
                } else if (oldDay && day === oldDay) {
                  try {
                    var epLive0 = await getSnapRaw_(
                      env,
                      "moveEpoch:" + normalizeMatchKey_(params.matchKey || wantClient)
                    );
                    if (epLive0 && String(epLive0.to || "") === String(oldDay)) {
                      // новый move уже сюда приехал — не сносить
                    } else {
                      // epoch говорит «не здесь» → protect на oldDay устарел (фон прошлого move).
                      // Игнорим protect и жёстко сносим.
                      await deleteClient_(
                        {
                          client: wantClient,
                          day: oldDay,
                          matchKey: params.matchKey || wantClient,
                          force: "1",
                          _keepMoveEpoch: "1",
                          _strictDay: "1",
                          _deleteStartedAt: String(params._deleteStartedAt || Date.now())
                        },
                        env
                      );
                    }
                  } catch (eOldOnly) {}
                }
              } else if (/^(deleteClient|removeCalendarClient)$/i.test(a)) {
                // sync delete уже сделал D1+tombstone. cutoverStoreRead/replaceDayOrders
                // из GAS затирал бы параллельный saveOrder; повторный deleteClient_ — тоже.
              } else {
                var staleSaveDay = false;
                if (
                  /^(saveOrder|saveBooking)$/i.test(a) &&
                  wantClient &&
                  params.day &&
                  String(day) === String(params.day)
                ) {
                  staleSaveDay = await clientMovedAwayFromDay_(
                    env,
                    params.matchKey || wantClient,
                    wantClient,
                    day
                  );
                }
                if (!staleSaveDay) {
                  await cutoverStoreRead_("getClients", { day: day }, env, fresh);
                }
              }
              // после возможного merge — ещё раз зафиксировать write в D1
              if (/^(saveOrder|saveBooking)$/i.test(a) && wantClient) {
                try {
                  await saveOrderUnlessMovedAway_(
                    Object.assign({}, params, { fromAfterWrite: "1" }),
                    env,
                    /^saveBooking$/i.test(a)
                  );
                } catch (eResave) {}
              }
              // delete: НЕ rerun deleteClient_ здесь (гонка со свежим save)

            }
          } catch (eG) {}
          try {
            const v = await getViewCompare_({ day: day }, env);
            if (v && v.status === "success") {
              await putSnap_(env, "view:" + day, v);
              if (v.dateIso) await putSnap_(env, "viewDate:" + v.dateIso, v);
            }
          } catch (eV) {}
          try {
            await rebuildCuttingDay_(env, day);
          } catch (eCutD1) {}
          const ops = [
            cutoverRevalidate_("getCourier", { day: day }, env),
            cutoverRevalidate_("getAssembly", { day: day }, env)
          ];
          if (gasClientsFresh) {
            ops.push(cutoverRevalidate_("getViewCompare", { day: day }, env));
            ops.push(cutoverRevalidate_("getCutting", { day: day }, env));
          } else {
            ops.push(
              (async function () {
                await new Promise(function (r) {
                  setTimeout(r, 8000);
                });
                try {
                  await rebuildCuttingDay_(env, day);
                } catch (eR2) {}
                try {
                  const again = await gasProxy_("getClients", { day: day }, env, { write: false });
                  const list2 = (again && again.clients) || [];
                  const inGas2 = wantClient
                    ? list2.some(function (c) {
                        return nicksLooseMatch_(c && (c.name || c.client), wantClient);
                      })
                    : false;
                  let freshNow = false;
                  if (/^(saveOrder|saveBooking)$/i.test(a)) freshNow = inGas2;
                  else if (/^(deleteClient|removeCalendarClient)$/i.test(a)) freshNow = !inGas2;
                  else if (/^moveClient$/i.test(a)) {
                    if (day === oldDay) freshNow = !inGas2;
                    else if (day === newDay) freshNow = inGas2;
                    else freshNow = true;
                  }
                  if (freshNow) await cutoverRevalidate_("getCutting", { day: day }, env);
                } catch (eLate) {}
              })()
            );
          }
          await Promise.all(ops);
        })()
      );
    }
    await Promise.all(jobs);

    // calendar-only writes: обновить viewDate snap (иначе Просмотр пустой / старый)
    try {
      if (/^(saveOrder|saveBooking|deleteClient|removeCalendarClient|moveClient)$/i.test(a)) {
        var dateIsos = [];
        function addIso_(x) {
          x = String(x || "").trim();
          if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(x)) x = dmyToIso_(x) || x;
          if (/^\d{4}-\d{2}-\d{2}$/.test(x) && dateIsos.indexOf(x) < 0) dateIsos.push(x);
        }
        addIso_(params.date || params.dateIso || params.deliveryDate);
        addIso_(params.oldDate);
        addIso_(params.newDate);
        addIso_(writeRes && (writeRes.dateIso || writeRes.newDate || writeRes.date));
        for (var di = 0; di < dateIsos.length; di++) {
          var iso = dateIsos[di];
          try {
            await delSnap_(env, "viewDate:" + iso);
          } catch (eDelV) {}
          try {
            var vc = await getViewCompare_({ date: iso }, env);
            if (vc && vc.status === "success") {
              await putSnap_(env, "viewDate:" + iso, vc);
            }
          } catch (eVc) {}
        }
        if (dateIsos.length) {
          try { await rebuildMonthOverview_(env); } catch (eMo3) {}
        }
      }
    } catch (eCalAw) {}

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
        k === "allowDanger" ||
        params[k] == null ||
        params[k] === ""
      ) {
        return;
      }
      // mode=live/sandbox — флаг Worker, не режим calcPrice (pp/retail)
      if (k === "mode" && /^(live|sandbox|cutover)$/i.test(String(params[k]))) {
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
    const preferPostRead = /^(calcPrice|calcPpFact|getPpFactCost)$/i.test(action);
    const mustPost = ((opts.write && !preferGet) || preferPostRead);
    if (preferPostRead && typeof clean.basket === "string") {
      try {
        clean.basket = JSON.parse(clean.basket);
      } catch (eBask) {}
    }
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
    let unwrapFailed = false;
    try {
      json = unwrapGas_(text);
    } catch (eUnwrap) {
      unwrapFailed = true;
      try {
        json = JSON.parse(String(text || "").trim());
      } catch (eParse) {
        json = null;
      }
    }
    if (json && typeof json === "object") {
      if (opts.write) json.cutover = true;
      else json.sandboxProxy = true;
    }
    // write: POST echo иногда «Бэкенд Жив» / HTML — для CRM пробуем GET JSONP
    // (не трогаем реальные ошибки GAS вроде no_free_columns / src_client_not_found)
    const postBroken =
      !json ||
      json.status === "online" ||
      unwrapFailed && (!json || !json.status) ||
      /gas_html_response|gas_online_stub/i.test(String((json && json.message) || ""));
    if (
      opts.write &&
      postBroken &&
      /^(deleteClient|removeCalendarClient|moveClient|saveOrder|saveBooking)$/i.test(action)
    ) {
      try {
        const uGet = new URL(origin);
        uGet.searchParams.set("action", action);
        Object.keys(clean).forEach(function (k) {
          var val = clean[k];
          if (typeof val === "object") {
            try {
              val = JSON.stringify(val);
            } catch (eJ2) {
              val = String(val);
            }
          }
          uGet.searchParams.set(k, String(val));
        });
        uGet.searchParams.set("callback", "cb");
        const resGet = await fetch(uGet.toString(), {
          redirect: "follow",
          headers: { "Cache-Control": "no-cache" }
        });
        const textGet = await resGet.text();
        const viaGet = unwrapGas_(textGet);
        if (viaGet && viaGet.status === "success") {
          viaGet.cutover = true;
          viaGet.gasViaGet = true;
          return viaGet;
        }
      } catch (eGetFb) {}
    }
    return json;
  } catch (e) {
    // write fallback GET при полном провале POST
    if (
      opts.write &&
      /^(deleteClient|removeCalendarClient|moveClient|saveOrder|saveBooking)$/i.test(action)
    ) {
      try {
        const origin2 = (env && env.GAS_ORIGIN) || GAS_ORIGIN;
        const clean2 = {};
        Object.keys(params || {}).forEach(function (k) {
          if (
            k === "action" ||
            k === "callback" ||
            k === "_" ||
            k === "cutover" ||
            k === "allowDanger" ||
            params[k] == null ||
            params[k] === ""
          ) {
            return;
          }
          if (k === "mode" && /^(live|sandbox|cutover)$/i.test(String(params[k]))) return;
          clean2[k] = params[k];
        });
        const uGet2 = new URL(origin2);
        uGet2.searchParams.set("action", action);
        Object.keys(clean2).forEach(function (k) {
          var val = clean2[k];
          if (typeof val === "object") {
            try {
              val = JSON.stringify(val);
            } catch (eJ3) {
              val = String(val);
            }
          }
          uGet2.searchParams.set(k, String(val));
        });
        uGet2.searchParams.set("callback", "cb");
        const resGet2 = await fetch(uGet2.toString(), {
          redirect: "follow",
          headers: { "Cache-Control": "no-cache" }
        });
        const viaGet2 = unwrapGas_(await resGet2.text());
        if (viaGet2 && viaGet2.status === "success") {
          viaGet2.cutover = true;
          viaGet2.gasViaGet = true;
          return viaGet2;
        }
      } catch (eGet2) {}
    }
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
  if ((!found.address || !found.phone) && env) {
    try {
      const profSnap = await getSnapRaw_(env, "listClientProfiles");
      const profs = (profSnap && profSnap.clients) || [];
      for (let pi = 0; pi < profs.length; pi++) {
        const p = profs[pi];
        if (normalizeMatchKey_(p.nick || "") !== nickKey) continue;
        if (!found.address && p.address) found.address = p.address;
        if (!found.phone && p.phone) found.phone = p.phone;
        break;
      }
    } catch (eProf) {}
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
