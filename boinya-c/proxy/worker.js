/**
 * Бойня C — Worker + D1.
 * LIVE по умолчанию: D1 fast-read + запись/revalidate в боевой GAS.
 * Песочница только явно: ?sandbox=1 / ?cutover=0 (D1 write, Sheets skip).
 * deploy-marker: 2026-08-30 price-retail-mode-fix
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

/** Varka Mini App с CDN (обход залипшего GitHub Pages). */
const VARKA_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/konchaarsenia-a11y/superboyna@main/varka";

async function serveVarkaApp_() {
  try {
    const upstream = await fetch(VARKA_CDN_BASE + "/app.html", {
      cf: { cacheTtl: 60, cacheEverything: true }
    });
    if (!upstream.ok) {
      return Response.redirect(VARKA_CDN_BASE + "/app.html", 302);
    }
    let html = await upstream.text();
    // Относительные assets/* → абсолютные на CDN
    html = html.replace(/(["'(])assets\//g, "$1" + VARKA_CDN_BASE + "/assets/");
    return new Response(html, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0"
      }
    });
  } catch (e) {
    return Response.redirect(VARKA_CDN_BASE + "/app.html", 302);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    // Обход GitHub Pages: Menu Button → https://boinya-c.konchaarsenia.workers.dev/varka/
    if (
      request.method === "GET" &&
      (url.pathname === "/varka" ||
        url.pathname === "/varka/" ||
        url.pathname === "/varka/app.html")
    ) {
      return serveVarkaApp_();
    }

    const action = String(url.searchParams.get("action") || "").trim();

    if (request.method === "GET" && (!action || action === "health")) {
      return json({
        status: "ok",
        service: "boinya-c",
        sandbox: false,
        cutover: "LIVE by default; ?sandbox=1 / ?cutover=0 → D1 only",
        d1: !!(env && env.DB),
        tip: "?action=getClients&day=Понедельник",
        varka: "/varka/ (CDN app, bypass Pages)"
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
          // body побеждает query; для контакта/корзины — явный приоритет body
          // (короткий/битый basket в URL не должен затирать полный JSON)
          const merged = Object.assign({}, params, body);
          ["basket", "address", "phone", "note", "permanentNote", "geo", "survey"].forEach(function (k) {
            if (body[k] != null && body[k] !== "") merged[k] = body[k];
          });
          params = merged;
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

/** D1 = источник правды; Sheets — фоновое зеркало (без обратного upsert). Откат: env PEOPLE_CANON=sheets-confirm-bg */
function isD1PrimaryCanon_(env) {
  const v = env && env.PEOPLE_CANON ? String(env.PEOPLE_CANON).trim().toLowerCase() : "";
  if (v === "sheets-confirm-bg" || v === "sheets" || v === "sheets-first") return false;
  return true;
}

function peopleCanonLabel_(env) {
  return isD1PrimaryCanon_(env) ? "d1-primary" : "sheets-confirm-bg";
}

/** Галочки нарезки/курьера/сборки: D1 правда, Sheets зеркало. Откат: OPS_CANON=sheets */
function isOpsD1PrimaryCanon_(env) {
  const v = env && env.OPS_CANON ? String(env.OPS_CANON).trim().toLowerCase() : "";
  if (v === "sheets" || v === "sheets-first" || v === "sheets-confirm-bg") return false;
  if (v === "d1-primary" || v === "d1") return true;
  return isD1PrimaryCanon_(env);
}

function opsCanonLabel_(env) {
  return isOpsD1PrimaryCanon_(env) ? "d1-primary" : "sheets-mirror";
}

/** Отложенные / переносы: D1 правда, Sheets зеркало. Откат: DEFERRED_CANON=sheets */
function isDeferredD1PrimaryCanon_(env) {
  const v = env && env.DEFERRED_CANON ? String(env.DEFERRED_CANON).trim().toLowerCase() : "";
  if (v === "sheets" || v === "sheets-first" || v === "sheets-confirm-bg") return false;
  if (v === "d1-primary" || v === "d1") return true;
  return isD1PrimaryCanon_(env);
}

function deferredCanonLabel_(env) {
  return isDeferredD1PrimaryCanon_(env) ? "d1-primary" : "sheets-mirror";
}

/** Подписки ПП/АФК/БП: D1 правда, Sheets зеркало. Откат: SUBS_CANON=sheets */
function isSubsD1PrimaryCanon_(env) {
  const v = env && env.SUBS_CANON ? String(env.SUBS_CANON).trim().toLowerCase() : "";
  if (v === "sheets" || v === "sheets-first" || v === "sheets-confirm-bg") return false;
  if (v === "d1-primary" || v === "d1") return true;
  return isD1PrimaryCanon_(env);
}

function subsCanonLabel_(env) {
  return isSubsD1PrimaryCanon_(env) ? "d1-primary" : "sheets-mirror";
}

/** Склад: arrival/ревизия/zero + preview/check/compose — D1 compute; finish F/B — GAS. Откат: WAREHOUSE_CANON=sheets */
function isWarehouseD1PrimaryCanon_(env) {
  const v = env && env.WAREHOUSE_CANON ? String(env.WAREHOUSE_CANON).trim().toLowerCase() : "";
  if (v === "sheets" || v === "sheets-first" || v === "sheets-confirm-bg") return false;
  if (v === "d1-primary" || v === "d1") return true;
  return isD1PrimaryCanon_(env);
}

function warehouseCanonLabel_(env) {
  return isWarehouseD1PrimaryCanon_(env) ? "d1-primary" : "sheets-mirror";
}

/** Доступы / шаблоны / опросники CRUD: D1 правда. TG remind — GAS. Откат: META_CANON=sheets */
function isMetaD1PrimaryCanon_(env) {
  const v = env && env.META_CANON ? String(env.META_CANON).trim().toLowerCase() : "";
  if (v === "sheets" || v === "sheets-first" || v === "sheets-confirm-bg") return false;
  if (v === "d1-primary" || v === "d1") return true;
  return isD1PrimaryCanon_(env);
}

function metaCanonLabel_(env) {
  return isMetaD1PrimaryCanon_(env) ? "d1-primary" : "sheets-mirror";
}

/** Структура плана нарезки из D1 orders; флаги — OPS. После finish — rebuild. Откат: CUTTING_STRUCT_CANON=sheets */
function isCuttingStructD1PrimaryCanon_(env) {
  const v = env && env.CUTTING_STRUCT_CANON ? String(env.CUTTING_STRUCT_CANON).trim().toLowerCase() : "";
  if (v === "sheets" || v === "sheets-first" || v === "sheets-confirm-bg") return false;
  if (v === "d1-primary" || v === "d1") return true;
  return isD1PrimaryCanon_(env);
}

function cuttingStructCanonLabel_(env) {
  return isCuttingStructD1PrimaryCanon_(env) ? "d1-primary" : "sheets-mirror";
}

/** Прайс: retail + calcPpFact/calcPrice(pp) D1 правда (unit costs кэш + формула). migrate/getPpFactCost — GAS. Откат: PRICE_CANON=sheets */
function isPriceD1PrimaryCanon_(env) {
  const v = env && env.PRICE_CANON ? String(env.PRICE_CANON).trim().toLowerCase() : "";
  if (v === "sheets" || v === "sheets-first" || v === "sheets-confirm-bg") return false;
  if (v === "d1-primary" || v === "d1") return true;
  return isD1PrimaryCanon_(env);
}

function priceCanonLabel_(env) {
  return isPriceD1PrimaryCanon_(env) ? "d1-primary" : "sheets-mirror";
}

/** Varka Partner_* : D1/snap правда → Sheets зеркало. Side effects TG/deferred — в GAS mirror. Откат: PARTNER_CANON=sheets */
function isPartnerD1PrimaryCanon_(env) {
  const v = env && env.PARTNER_CANON ? String(env.PARTNER_CANON).trim().toLowerCase() : "";
  if (v === "sheets" || v === "sheets-first" || v === "sheets-confirm-bg") return false;
  if (v === "d1-primary" || v === "d1") return true;
  return isD1PrimaryCanon_(env);
}

function partnerCanonLabel_(env) {
  return isPartnerD1PrimaryCanon_(env) ? "d1-primary" : "sheets-mirror";
}

/** Goodboy GB_* : D1/snap правда → Sheets зеркало; CRM только read (subs D1). Откат: GB_CANON=sheets */
function isGbD1PrimaryCanon_(env) {
  const v = env && env.GB_CANON ? String(env.GB_CANON).trim().toLowerCase() : "";
  if (v === "sheets" || v === "sheets-first" || v === "sheets-confirm-bg") return false;
  if (v === "d1-primary" || v === "d1") return true;
  return isD1PrimaryCanon_(env);
}

function gbCanonLabel_(env) {
  return isGbD1PrimaryCanon_(env) ? "d1-primary" : "sheets-mirror";
}

/**
 * После finishFullWeek / force week sync: слоты дней в D1 = список GAS (replace).
 * Обычные save/move/delete не трогаем. Откат: WEEK_D1_SYNC=upsert
 */
function isWeekD1GasAuthoritative_(env) {
  const v = env && env.WEEK_D1_SYNC ? String(env.WEEK_D1_SYNC).trim().toLowerCase() : "";
  if (v === "upsert" || v === "missing-only" || v === "off") return false;
  return true;
}

function weekD1SyncLabel_(env) {
  return isWeekD1GasAuthoritative_(env) ? "gas-authoritative" : "upsert";
}

/**
 * Закрытие недели / materialize / repair: GAS делает Sheets (склад F/B),
 * Worker ждёт полный D1 resync до ответа (не только waitUntil).
 * Откат: WEEK_CLOSE_CANON=gas-async (старое поведение d1ResyncStarted).
 */
function isWeekCloseD1SyncCanon_(env) {
  const v = env && env.WEEK_CLOSE_CANON ? String(env.WEEK_CLOSE_CANON).trim().toLowerCase() : "";
  if (v === "gas-async" || v === "async" || v === "sheets") return false;
  if (v === "d1-sync" || v === "d1-primary" || v === "d1" || v === "blocking") return true;
  return true; // default: careful blocking sync
}

function weekCloseCanonLabel_(env) {
  return isWeekCloseD1SyncCanon_(env) ? "d1-sync" : "gas-async";
}

/** Списание склада при закрытии недели: D1 compute. Откат: WAREHOUSE_CLOSE_CANON=sheets */
function isWarehouseCloseD1Canon_(env) {
  const v = env && env.WAREHOUSE_CLOSE_CANON ? String(env.WAREHOUSE_CLOSE_CANON).trim().toLowerCase() : "";
  if (v === "sheets" || v === "gas" || v === "off") return false;
  if (v === "d1" || v === "d1-compute" || v === "d1-primary") return true;
  return false; // default off until smoke preview OK — set wrangler to d1-compute to enable
}

function warehouseCloseCanonLabel_(env) {
  return isWarehouseCloseD1Canon_(env) ? "d1-compute" : "sheets";
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
    a === "composeWarehouseBuyMessage" ||
    a === "previewWeekCloseWarehouse" ||
    a === "gbBootstrap"
  ) {
    return false;
  }
  // Goodboy writes
  if (/^(gbMe|gbRegister|gbLogin|gbLinkClient|gbSavePet|gbEnsureSheets)$/i.test(a)) return true;
  return /^(save|delete|move|update|finish|cancel|enroll|set|close|pull|materialize|start|stop|ensure|scrub|request|setup|create|add|remove|toggle|mark|send|prepare|register|upsert|sync|notify|compose|repair|report|log|partner|force|place|submit|apply)/i.test(
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
      peopleCanon: peopleCanonLabel_(env),
      opsCanon: opsCanonLabel_(env),
      deferredCanon: deferredCanonLabel_(env),
      subsCanon: subsCanonLabel_(env),
      warehouseCanon: warehouseCanonLabel_(env),
      metaCanon: metaCanonLabel_(env),
      cuttingStructCanon: cuttingStructCanonLabel_(env),
      priceCanon: priceCanonLabel_(env),
      weekD1Sync: weekD1SyncLabel_(env),
      telegramCanon: hasTelegramToken_(env) ? "worker" : "sheets-fallback",
      hasTelegramToken: hasTelegramToken_(env),
      partnerCanon: partnerCanonLabel_(env),
      gbCanon: gbCanonLabel_(env),
      weekCloseCanon: weekCloseCanonLabel_(env),
      warehouseCloseCanon: warehouseCloseCanonLabel_(env),
      deployMarker: "2026-08-31 cal-offweek-crud"
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

  // Varka + Goodboy: всегда LIVE cutover (D1-primary при PARTNER_CANON/GB_CANON)
  if (a === "partnerGetMe") {
    return cutoverPartnerGetMe_(params, env, ctx);
  }
  if (/^partner/i.test(a) || /^gb/i.test(a) || a === "submitGoodboyTry") {
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
  if (a === "getSubscription") {
    const gSub = await getSubscription_(params, env);
    return Object.assign({}, gSub || { status: "success", found: false }, { sandbox: true });
  }
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
    a === "getRetailPriceList" ||
    a === "calcPpFact" ||
    a === "migratePpToRaw26Scheme" ||
    a === "suggestAddress" ||
    a === "lookupBpPartner"
  ) {
    const proxied = await gasRead_(a, params, env);
    if (proxied) return proxied;
    if (a === "calcPrice" || a === "calcPpFact" || a === "getPpFactCost" || a === "migratePpToRaw26Scheme") {
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

function segmentSourceFromMovePayload_(payload, params) {
  params = params || {};
  const meta = payload && payload.meta_json ? parseMeta_(payload.meta_json) : {};
  const note = String(
    (params && params.note) || (payload && payload.note) || meta.note || ""
  );
  let segment = segmentFromOrderParams_({
    segment: (params && params.segment) || (payload && payload.segment) || meta.segment || "",
    orderType:
      (params && params.orderType) ||
      meta.orderType ||
      (payload && payload.source) ||
      "",
    source:
      (params && params.source) ||
      (payload && payload.source) ||
      meta.source ||
      meta.orderType ||
      ""
  });
  if (!segment && note) {
    const segTag = note.match(/\[SEG:([^\]]+)\]/i);
    if (segTag) segment = normalizeSegmentLabel_(segTag[1]);
  }
  let source =
    String(
      (params && params.source) ||
        (payload && payload.source) ||
        meta.source ||
        meta.orderType ||
        ""
    ).trim() || sourceFromSegment_(segment);
  if (!segment && source) {
    segment = segmentFromOrderParams_({ source: source, orderType: source });
  }
  return { segment: segment || "", source: source || "" };
}

function enrichOrderRowSegment_(row) {
  if (!row) return row;
  const got = segmentSourceFromMovePayload_(row, {});
  if (!got.segment && !got.source) return row;
  const meta = parseMeta_(row.meta_json);
  const nextMeta = Object.assign({}, meta, {
    segment: got.segment || meta.segment || "",
    orderType: meta.orderType || got.source || sourceFromSegment_(got.segment) || ""
  });
  return Object.assign({}, row, {
    segment: got.segment || row.segment || "",
    source: got.source || row.source || "",
    meta_json: JSON.stringify(nextMeta)
  });
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

/** D1-primary: D1 → success для UI; Sheets только зеркало (ошибка листа не откатывает D1). */
async function runPeopleWriteJobD1Primary_(writeId, job, env, ctx) {
  if (!writeId || !env || !env.DB || !job) return job;
  // Не выходим, пока зеркало Sheets не дожато (иначе poll после обрыва waitUntil
  // навсегда оставляет pendingSheetsMirror и человека нет на листе).
  if (
    job.verified &&
    job.d1Verified &&
    job.status === "success" &&
    (job.sheetsVerified || job.sheetsMirrorFailed) &&
    !job.pendingSheetsMirror
  ) {
    return job;
  }
  if (job.status === "error" && job.d1Verified && !job.pendingSheetsMirror) return job;
  const runAt = Number(job._runningAt || 0) || 0;
  if (job._running && runAt && Date.now() - runAt < 25000) return job;

  const a = String(job.action || "");
  const gasWriteParams = job.params || {};
  job = Object.assign({}, job, { _running: true, _runningAt: Date.now() });
  try {
    await putSnap_(env, "peopleWrite:" + writeId, job);
  } catch (eLock) {}

  let gasAction = a;
  let gasParams = gasWriteParams;
  if (
    /^saveOrder$/i.test(a) &&
    (toBool_(gasWriteParams.calendarOnly) ||
      (!String(gasWriteParams.day || "").trim() &&
        String(gasWriteParams.date || gasWriteParams.dateIso || gasWriteParams.deliveryDate || "").trim()))
  ) {
    gasAction = "saveBooking";
    gasParams = Object.assign({}, gasWriteParams, {
      action: "saveBooking",
      alsoSaveOrder: "0",
      calendarOnly: "1",
      day: ""
    });
  }

  function sheetsOk_(sheetsRes) {
    if (!sheetsRes) return false;
    if (/gas_proxy_failed|gas_timeout/i.test(String(sheetsRes.message || ""))) return false;
    if (sheetsRes.status === "success") return true;
    if (
      /beyond_week|date_not_on_week/i.test(
        String(sheetsRes.status || "") + " " + String(sheetsRes.message || "")
      ) &&
      (toBool_(gasParams.calendarOnly) || !String(gasParams.day || "").trim())
    ) {
      return true;
    }
    if (
      /already|not_found|src_client_not_found|same_/i.test(
        String(sheetsRes.status || "") + " " + String(sheetsRes.message || "")
      )
    ) {
      return true;
    }
    return false;
  }

  let d1WriteRes = job.d1Res || null;
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
      d1WriteRes = { status: "error", message: String((eD1 && eD1.message) || eD1) };
    }
    if (!d1WriteRes || d1WriteRes.status !== "success") {
      const fail = {
        status: "error",
        pendingSheets: false,
        sheetsVerified: false,
        d1Verified: false,
        verified: false,
        action: a,
        params: gasWriteParams,
        message: (d1WriteRes && d1WriteRes.message) || "d1_write_failed",
        finishedAt: Date.now()
      };
      await putSnap_(env, "peopleWrite:" + writeId, fail);
      return fail;
    }
  } else {
    d1WriteRes = job.d1Res || d1WriteRes || { status: "success" };
  }

  const verified = {
    status: "success",
    verified: true,
    pendingSheets: false,
    pendingSheetsMirror: true,
    sheetsVerified: false,
    d1Verified: true,
    action: a,
    params: gasWriteParams,
    wrote: (d1WriteRes && d1WriteRes.wrote) != null ? d1WriteRes.wrote : job.wrote,
    finishedAt: Date.now(),
    d1Res: d1WriteRes
  };
  try {
    await putSnap_(env, "peopleWrite:" + writeId, verified);
  } catch (eMid) {}

  let sheetsRes = null;
  let mirrorOk = false;
  try {
    sheetsRes = await gasProxy_(gasAction, gasParams, env, { write: true });
    mirrorOk = sheetsOk_(sheetsRes);
    if (!mirrorOk) {
      await new Promise(function (r) {
        setTimeout(r, 700);
      });
      const again = await Promise.race([
        gasProxy_(gasAction, gasParams, env, { write: true }).catch(function () {
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
        mirrorOk = sheetsOk_(sheetsRes);
      }
    }
  } catch (eG) {
    sheetsRes = { status: "error", message: String((eG && eG.message) || eG || "gas_proxy_failed") };
  }
  if (mirrorOk && sheetsRes && sheetsRes.status !== "success") {
    sheetsRes = Object.assign({}, sheetsRes, { status: "success", softSheets: true });
  }

  const done = Object.assign({}, verified, {
    pendingSheetsMirror: false,
    sheetsVerified: !!mirrorOk,
    sheetsMirrorFailed: !mirrorOk,
    sheetsMirrorMessage: mirrorOk ? "" : (sheetsRes && (sheetsRes.message || sheetsRes.status)) || "sheets_mirror_failed",
    gas: sheetsRes || null,
    finishedAt: Date.now()
  });
  try {
    await putSnap_(env, "peopleWrite:" + writeId, done);
  } catch (eDone) {}

  try {
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(rebuildWeekCounts_(env));
    } else {
      await rebuildWeekCounts_(env);
    }
  } catch (eCnt) {}

  return done;
}

/** Дожать people-write (D1→GAS). Вызывается из waitUntil и из pollPeopleWrite. */
async function runPeopleWriteJob_(writeId, job, env, ctx) {
  if (isD1PrimaryCanon_(env)) {
    return runPeopleWriteJobD1Primary_(writeId, job, env, ctx);
  }
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

  // calendar-only: Sheets пишет Календарь через saveBooking, НЕ saveOrder (beyond_week)
  let gasAction = a;
  let gasParams = gasWriteParams;
  if (
    /^saveOrder$/i.test(a) &&
    (toBool_(gasWriteParams.calendarOnly) ||
      (!String(gasWriteParams.day || "").trim() &&
        String(gasWriteParams.date || gasWriteParams.dateIso || gasWriteParams.deliveryDate || "").trim()))
  ) {
    gasAction = "saveBooking";
    gasParams = Object.assign({}, gasWriteParams, {
      action: "saveBooking",
      alsoSaveOrder: "0",
      calendarOnly: "1",
      day: ""
    });
  }

  function sheetsOk_(sheetsRes) {
    if (!sheetsRes) return false;
    if (/gas_proxy_failed|gas_timeout/i.test(String(sheetsRes.message || ""))) return false;
    if (sheetsRes.status === "success") return true;
    // beyond_week на saveOrder = «не пишем в лист» — для calendar-only это успех маршрута
    if (
      /beyond_week|date_not_on_week/i.test(
        String(sheetsRes.status || "") + " " + String(sheetsRes.message || "")
      ) &&
      (toBool_(gasParams.calendarOnly) || !String(gasParams.day || "").trim())
    ) {
      return true;
    }
    if (
      /already|not_found|src_client_not_found|same_/i.test(
        String(sheetsRes.status || "") + " " + String(sheetsRes.message || "")
      )
    ) {
      return true;
    }
    return false;
  }

  // move/delete: сначала Sheets (иначе D1 унесёт → GAS src_client_not_found)
  if (sheetsFirst && !job.sheetsVerified) {
    let sheetsRes = null;
    try {
      sheetsRes = await gasProxy_(gasAction, gasParams, env, { write: true });
    } catch (eG0) {
      sheetsRes = {
        status: "error",
        message: String((eG0 && eG0.message) || eG0 || "gas_proxy_failed")
      };
    }
    let ok = sheetsOk_(sheetsRes);
    if (!ok) {
      try {
        await new Promise(function (r) {
          setTimeout(r, 700);
        });
        const again = await Promise.race([
          gasProxy_(gasAction, gasParams, env, { write: true }).catch(function () {
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
          ok = sheetsOk_(sheetsRes);
        }
      } catch (eRetry) {}
    }
    if (ok && sheetsRes && sheetsRes.status !== "success") {
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

    // Sheets OK → D1 (если ещё не сделали early D1 на accept)
    try {
      if (job.d1Verified && job.d1Res && job.d1Res.status === "success") {
        d1WriteRes = job.d1Res;
      } else if (/^(deleteClient|removeCalendarClient)$/i.test(a)) {
        d1WriteRes = await deleteClient_(gasWriteParams, env);
      } else if (/^moveClient$/i.test(a)) {
        d1WriteRes = await moveClient_(gasWriteParams, env);
        // после Sheets человек уже на newDay в D1 (early) → not_found ок
        if (
          d1WriteRes &&
          d1WriteRes.status !== "success" &&
          /not_found/i.test(String(d1WriteRes.message || ""))
        ) {
          try {
            const mk = gasWriteParams.matchKey || gasWriteParams.client;
            const onNew = gasWriteParams.newDay
              ? await findOrderRow_(
                  env,
                  mk,
                  gasWriteParams.newDay,
                  gasWriteParams.newDate || "",
                  gasWriteParams.client
                )
              : null;
            if (onNew) {
              d1WriteRes = {
                status: "success",
                wrote: 1,
                alreadyMoved: true,
                sandbox: true
              };
            }
          } catch (eAlready) {}
        }
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
    sheetsRes = await gasProxy_(gasAction, gasParams, env, { write: true });
  } catch (eG0) {
    sheetsRes = {
      status: "error",
      message: String((eG0 && eG0.message) || eG0 || "gas_proxy_failed")
    };
  }
  let ok = sheetsOk_(sheetsRes);
  if (!ok) {
    try {
      await new Promise(function (r) {
        setTimeout(r, 700);
      });
      const again = await Promise.race([
        gasProxy_(gasAction, gasParams, env, { write: true }).catch(function () {
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
        ok = sheetsOk_(sheetsRes);
      }
    } catch (eRetry) {}
  }
  if (ok && sheetsRes && sheetsRes.status !== "success") {
    sheetsRes = Object.assign({}, sheetsRes, { status: "success", softSheets: true });
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
    if (!ep || !ep.to || String(ep.to) === String(day)) return false;
    return moveEpochHidesFromDay_(ep, day);
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
  // Актуальные слоты недели: сначала D1 weekDayCounts (даты+onWeek), Sheet — fallback.
  let counts = await getSnapRaw_(env, "weekDayCounts");
  if (!counts || !Array.isArray(counts.items) || !counts.items.length || (counts && counts.fromCalendar)) {
    counts = await getSnapRaw_(env, "weekDayCountsSheet");
  }
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
  function fromItems_(items) {
    items = items || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].day === day) {
        const date = items[i].date || "";
        const iso = dmyToIso_(date) || String(items[i].dateIso || "");
        if (date || iso) return { date: date || isoToDmy_(iso), iso: iso };
      }
    }
    return null;
  }
  let hit = fromItems_((counts && counts.items) || []);
  // после пустого D1-rebuild в weekDayCounts может не быть даты — бери sheet
  if (!hit || !hit.iso) {
    try {
      const sheet = await getSnapRaw_(env, "weekDayCountsSheet");
      hit = fromItems_((sheet && sheet.items) || []) || hit;
    } catch (eSh) {}
  }
  if (hit && hit.iso) return hit;
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
 * Align D1 orders on a weekday column to that day's week date_iso.
 * Prefer UPDATE stamp over soft-delete — otherwise a force getClients after
 * saveOrder (new client with correct iso) wiped peers still stamped with the
 * previous week's date and left only the newcomer in UI.
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
    const nowFix = new Date().toISOString();
    for (let i = 0; i < list.length; i++) {
      try {
        await env.DB.prepare(
          "UPDATE orders SET date_iso = ?, updated_at = ? WHERE id = ? AND status = 'active'"
        )
          .bind(wantIso, nowFix, list[i].id)
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
  // D1-primary: active row в D1 = правда UI. Tomb после delete обязан сначала
  // soft-delete строку; иначе stale delTomb прячет живых (ложные «пропажи»).
  if (day && !isD1PrimaryCanon_(env)) {
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
      // D1 live success (в т.ч. []) = правда. Snap только если live сломался —
      // иначе после delete всех/последних UI снова показывает призраков из view:day.
      let weekRaw = [];
      if (live && Array.isArray(live.clients)) {
        weekRaw = live.clients;
      } else if (snap && Array.isArray(snap.week) && snap.week.length) {
        weekRaw = snap.week.slice();
      }      // live D1 уже authoritative — moveEpoch только для GAS-merge, иначе прячет arrive после переноса
      // d1-primary: не прятать active tomb-фильтром (строка active = правда)
      const week = isD1PrimaryCanon_(env)
        ? weekRaw
        : await filterTombstonedClients_(env, resolvedDay, weekRaw, { skipMoveEpoch: true });
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

  // вне недели — D1 live authoritative; snap только метаданные (не воскрешать delete)
  if (dateIso) {
    const live = await getClients_({ date: dateIso }, env);
    const liveClients = (live && live.clients) || [];
    const byDate = await getSnapRaw_(env, "viewDate:" + dateIso);
    let month = liveClients.slice();
    const liveOk = !!(live && live.status === "success");
    if (!liveOk || !isD1PrimaryCanon_(env)) {
      const seen = Object.create(null);
      month.forEach(function (c) {
        const k = normalizeMatchKey_((c && (c.matchKey || c.name)) || "");
        if (k) seen[k] = true;
      });
      let snapList = [];
      if (byDate && byDate.status === "success") {
        snapList = Array.isArray(byDate.month)
          ? byDate.month.slice()
          : Array.isArray(byDate.week)
            ? byDate.week.slice()
            : [];
      }
      try {
        snapList = await filterCalTombFromList_(env, dateIso, snapList);
      } catch (eFt) {}
      snapList.forEach(function (c) {
        const k = normalizeMatchKey_((c && (c.matchKey || c.name)) || "");
        if (k && seen[k]) return;
        if (k) seen[k] = true;
        month.push(c);
      });
      if (!isD1PrimaryCanon_(env)) {
        try {
          month = await filterTombstonedClients_(env, "", month, { dateIso: dateIso });
        } catch (eTombCal) {}
      }
      if (liveClients.length) {
        const seen2 = Object.create(null);
        month.forEach(function (c) {
          const k = normalizeMatchKey_((c && (c.matchKey || c.name)) || "");
          if (k) seen2[k] = true;
        });
        liveClients.forEach(function (c) {
          const k = normalizeMatchKey_((c && (c.matchKey || c.name)) || "");
          if (!k || seen2[k]) return;
          seen2[k] = true;
          month.push(c);
        });
      }
    }
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
      source: liveOk && liveClients.length ? "d1" : byDate ? "snap" : "d1",
      fromSnap: !!byDate && !liveOk
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
    } else if (!byIso[iso].count || byIso[iso].fromWeekSheet) {
      byIso[iso].count = wCount;
      byIso[iso].segments = segs;
      byIso[iso].fromWeekSheet = true;
    } else {
      // D1/календарь уже посчитали уникальных — не затирать nick-row
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

/** Durable cutting flags in D1 table (done/surplus + laid/out_next via ALTER). */
async function ensureCuttingFlagsColumns_(env) {
  if (!env || !env.DB) return;
  try {
    await env.DB.prepare(
      "ALTER TABLE cutting_flags ADD COLUMN laid INTEGER DEFAULT 0"
    ).run();
  } catch (e1) {}
  try {
    await env.DB.prepare(
      "ALTER TABLE cutting_flags ADD COLUMN out_next INTEGER DEFAULT 0"
    ).run();
  } catch (e2) {}
}

async function persistCuttingFlagsTable_(env, day, items) {
  if (!env || !env.DB || !day || !Array.isArray(items)) return;
  await ensureCuttingFlagsColumns_(env);
  const info = await dayDateInfo_(env, day);
  const iso = (info && info.iso) || "";
  if (!iso) return;
  const now = new Date().toISOString();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it) continue;
    const key = cutNameKey_(it.name) || ("row:" + String(it.row || i));
    if (!key) continue;
    try {
      await env.DB.prepare(
        `INSERT INTO cutting_flags (date_iso, row_key, surplus, done, laid, out_next, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(date_iso, row_key) DO UPDATE SET
           surplus=excluded.surplus, done=excluded.done, laid=excluded.laid,
           out_next=excluded.out_next, updated_at=excluded.updated_at`
      )
        .bind(
          iso,
          key,
          Number(it.surplus) || 0,
          it.done ? 1 : 0,
          it.laid ? 1 : 0,
          it.outNext ? 1 : 0,
          now
        )
        .run();
    } catch (eIns) {}
  }
}

async function loadCuttingFlagsTable_(env, day) {
  if (!env || !env.DB || !day) return {};
  await ensureCuttingFlagsColumns_(env);
  const info = await dayDateInfo_(env, day);
  const iso = (info && info.iso) || "";
  if (!iso) return {};
  try {
    const rs = await env.DB.prepare(
      "SELECT row_key, surplus, done, laid, out_next FROM cutting_flags WHERE date_iso = ?"
    )
      .bind(iso)
      .all();
    const map = Object.create(null);
    ((rs && rs.results) || []).forEach(function (r) {
      if (!r || !r.row_key) return;
      map[String(r.row_key)] = {
        surplus: Number(r.surplus) || 0,
        done: !!Number(r.done),
        laid: !!Number(r.laid),
        outNext: !!Number(r.out_next)
      };
    });
    return map;
  } catch (eLoad) {
    return {};
  }
}

function overlayCuttingFlagsFromTable_(items, flagMap) {
  if (!flagMap || !Object.keys(flagMap).length) return items;
  return (items || []).map(function (it) {
    if (!it) return it;
    const key = cutNameKey_(it.name);
    const f = (key && flagMap[key]) || null;
    if (!f) return it;
    return normalizeCuttingItemFlags_(
      Object.assign({}, it, {
        laid: !!f.laid,
        done: !!f.done,
        outNext: !!f.outNext,
        surplus: f.surplus != null ? f.surplus : it.surplus
      })
    );
  });
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
  snap.fromGas = false;
  snap.fromD1 = true;
  snap.fromOrders = !!snap.fromOrders;
  snap.fromCalendar = false;
  snap.flagsTouchedAt = Date.now();
  snap.cachedAt = new Date().toISOString();
  await putSnap_(env, "cutting:" + day, snap);
  try {
    await rememberCuttingRows_(env, snap.items);
  } catch (eR) {}
  try {
    await persistCuttingFlagsTable_(env, day, snap.items);
  } catch (eTbl) {}
  return Object.assign({ status: "success", wrote: patched.found ? 1 : 0, row: patched.row }, snap);
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
  let viewCount = tallied.count;
  let segments = tallied.segments;
  // пустой view-snap не должен обнулять день, если в D1 уже есть люди
  if (viewCount === 0) {
    try {
      const q = await env.DB.prepare(
        "SELECT COUNT(DISTINCT match_key) AS c FROM orders WHERE status = 'active' AND date_iso = ?"
      )
        .bind(iso)
        .first();
      const d1c = Number(q && q.c) || 0;
      if (d1c > 0) return;
    } catch (eD1) {}
  }
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
      const prev = Number(d.count) || 0;
      // не затирать больший count меньшим (гонка пустого snap)
      if (viewCount < prev) {
        return Object.assign({}, d, { fromView: true });
      }
      return Object.assign({}, d, {
        count: viewCount,
        segments: segments,
        fromView: true,
        fromWeekSheet: !!d.fromWeekSheet
      });
    });
    if (!found) {
      body.days.push({
        dateIso: iso,
        count: viewCount,
        segments: segments,
        fromView: true
      });
      body.days.sort(function (a, b) {
        return String(a.dateIso).localeCompare(String(b.dateIso));
      });
    }
    body.total = (body.days || []).reduce(function (s, d) {
      return s + (Number(d.count) || 0);
    }, 0);
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
    for (let ri = 0; ri < (q.results || []).length; ri++) {
      const row = q.results[ri];
      const key = String(row.cache_key || "");
      const iso = key.indexOf("viewDate:") === 0 ? key.slice(9) : "";
      if (!iso) continue;
      let payload = null;
      try {
        payload = JSON.parse(row.payload || "{}");
      } catch (eP) {
        continue;
      }
      const tallied = countPeopleFromViewPayload_(payload);
      let viewCount = tallied.count;
      let segments = tallied.segments;
      const prev = byIso[iso];
      const prevCount = Number(prev && prev.count) || 0;
      // пустой/урезанный view-snap не должен обнулять бейдж месяца
      if (viewCount === 0 && prevCount > 0) continue;
      if (viewCount < prevCount) {
        // D1/календарь уже больше — оставить, только пометить fromView
        byIso[iso] = Object.assign({}, prev, { fromView: true });
        continue;
      }
      byIso[iso] = Object.assign({}, prev || {}, {
        dateIso: iso,
        count: viewCount,
        segments: segments,
        fromView: true,
        fromWeekSheet: !!(prev && prev.fromWeekSheet)
      });
    }
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
        if (!live.weekOverlay) {
          body = await overlayWeekSheetCountsOnMonth_(env, body);
        }
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
  // SWR чужого месяца (залипший авг) — сразу GAS за запрошенный
  if (month && body && body.month && String(body.month).slice(0, 7) !== month) {
    return (await fromGas_()) || { status: "success", month: month, days: [], total: 0, cutover: true };
  }
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

async function rebuildMonthOverview_(env, monthWanted) {
  if (!env || !env.DB) return { status: "success", month: "", days: [], total: 0, sandbox: true };
  const want = String(monthWanted || "").trim();
  const prevGlobal = await getSnapRaw_(env, "monthOverview");
  const month =
    (/^\d{4}-\d{2}$/.test(want) ? want : "") ||
    (prevGlobal && prevGlobal.month) ||
    new Date().toISOString().slice(0, 7);
  // seed именно запрошенного месяца — иначе авг-snap «залипает» при переключении на сен
  let prev = month ? await getSnapRaw_(env, "monthOverview:" + month) : null;
  if (!prev || !Array.isArray(prev.days)) prev = prevGlobal;
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

function splitBasketByDogWorker_(basket) {
  var d1 = [];
  var d2 = [];
  var rest = [];
  (basket || []).forEach(function (it) {
    var d = Number(it && it.dog) || 0;
    if (d === 2) d2.push(it);
    else if (d === 1) d1.push(it);
    else rest.push(it);
  });
  if (!d2.length) return null;
  if (rest.length) d1 = d1.concat(rest);
  return { dog1: d1, dog2: d2 };
}

function dogNickFromMeta_(meta, part, fallback) {
  meta = meta || {};
  var names = meta.dogNames || meta.dog_names || {};
  var n = String((names && (names[part] || names[String(part)])) || "").trim();
  if (n) return n;
  return fallback || ("Собака " + part);
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
  const clients = [];
  (live.clients || []).forEach(function (c) {
    const baseName = String(c.name || "").replace(/\s*[·•#]\s*2\s*$/i, "").trim() || String(c.name || "");
    const meta = Object.assign(
      {},
      parseMeta_(c.meta_json || c.meta || {}),
      c.dogNames ? { dogNames: c.dogNames } : {}
    );
    const parts = splitBasketByDogWorker_(c.basket || []);
    const entries = [];
    if (parts && parts.dog2 && parts.dog2.length) {
      entries.push({
        name: baseName,
        displayName: dogNickFromMeta_(meta, 1, baseName),
        basket: parts.dog1 || [],
        dogPart: 1,
        dogName: dogNickFromMeta_(meta, 1, "Собака 1")
      });
      entries.push({
        name: baseName + " · 2",
        displayName: dogNickFromMeta_(meta, 2, baseName + " · 2"),
        basket: parts.dog2,
        dogPart: 2,
        dogName: dogNickFromMeta_(meta, 2, "Собака 2")
      });
    } else {
      entries.push({
        name: c.name,
        displayName: c.name,
        basket: c.basket || [],
        dogPart: 0,
        dogName: ""
      });
    }
    entries.forEach(function (ent) {
      const old =
        (sameDate &&
          (lookupByMatchAliases_(prevBy, ent.name) ||
            lookupByMatchAliases_(prevBy, c.matchKey || c.name) ||
            lookupByMatchAliases_(prevBy, baseName + (ent.dogPart === 2 ? " · 2" : "")))) ||
        {};
      // flags: prefer exact card name, then owner+part
      let assembled = sameDate ? !!old.assembled : false;
      let printed = sameDate ? !!old.printed : false;
      if (sameDate && ent.dogPart) {
        const prevList = (prev && prev.clients) || [];
        for (var pi = 0; pi < prevList.length; pi++) {
          var pc = prevList[pi];
          if (
            Number(pc.dogPart || 0) === Number(ent.dogPart) &&
            normalizeMatchKey_(pc.ownerName || pc.name) === normalizeMatchKey_(baseName)
          ) {
            assembled = !!pc.assembled;
            printed = !!pc.printed;
            break;
          }
        }
      }
      clients.push({
        name: ent.name,
        displayName: ent.displayName,
        dogName: ent.dogName || "",
        address: c.address,
        note: c.note,
        basket: ent.basket,
        packs: sameDate ? old.packs || [] : [],
        totalBags: sameDate ? old.totalBags || 0 : 0,
        craftBags: sameDate ? old.craftBags || 0 : 0,
        lightByFraction: sameDate ? old.lightByFraction || {} : {},
        lightBagsByCounter: sameDate ? old.lightBagsByCounter || {} : {},
        assembled: assembled,
        printed: printed,
        dogPart: ent.dogPart || 0,
        ownerName: baseName,
        matchKey: c.matchKey
      });
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
  try {
    const tbl = await loadCuttingFlagsTable_(env, day);
    items = overlayCuttingFlagsFromTable_(items, tbl);
  } catch (eTblOv) {}
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
  // быстрый путь: snap нужного месяца + overlay недели (полный rebuild — на write / SWR GAS)
  if (hitM && Array.isArray(hitM.days) && hitM.days.length) {
    const snapMonth = String(hitM.month || "").slice(0, 7);
    if (!month || !snapMonth || snapMonth === month) {
      return overlayWeekSheetCountsOnMonth_(
        env,
        Object.assign({}, hitM, { month: month || snapMonth || hitM.month, source: hitM.source || "snap" })
      );
    }
  }
  const hit = await getSnapRaw_(env, "monthOverview");
  // чужой месяц в глобальном snap — не подсовывать его как ответ на сентябрь
  if (hit && Array.isArray(hit.days) && hit.days.length && (!month || String(hit.month || "").slice(0, 7) === month)) {
    return overlayWeekSheetCountsOnMonth_(
      env,
      Object.assign({}, hit, { month: month || hit.month, source: hit.source || "snap" })
    );
  }
  // нет snap этого месяца — собрать из D1 (не GAS)
  const body = await rebuildMonthOverview_(env, month);
  if (body && (!month || body.month === month || !body.month)) {
    return overlayWeekSheetCountsOnMonth_(env, body);
  }
  if (hit && (!month || String(hit.month || "").slice(0, 7) === month)) {
    return overlayWeekSheetCountsOnMonth_(env, hit);
  }
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
  // свежие галочки — не пересобирать из D1 на каждый poll
  const touched = Number((hit && hit.flagsTouchedAt) || 0);
  if (touched && Date.now() - touched < 600000) {
    if (hit && Array.isArray(hit.items)) hit.items = normalizeCuttingItems_(hit.items);
    return hit;
  }
  // struct d1-primary: план из orders; GAS-snap не приоритетнее
  if (isCuttingStructD1PrimaryCanon_(env)) {
    if (hit && hit.fromOrders && !hit.fromCalendar) {
      if (Array.isArray(hit.items)) hit.items = normalizeCuttingItems_(hit.items);
      return hit;
    }
    try {
      const rebuilt = await rebuildCuttingDay_(env, day);
      if (rebuilt && rebuilt.status === "success" && Array.isArray(rebuilt.items) && rebuilt.items.length) {
        return rebuilt;
      }
    } catch (eRebS) {}
    if (hit && Array.isArray(hit.items)) {
      hit.items = normalizeCuttingItems_(hit.items);
      return hit;
    }
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
    dogNames: params.dogNames || null,
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

  // якорь ПП 1/2 в D1 — suggest N≥2 без GAS
  try {
    const slotRaw = params.ppSlot != null ? params.ppSlot : params.deliverySlot;
    if (slotRaw != null && String(slotRaw).trim() !== "" && matchKey) {
      await putSnap_(env, "ppSlotAnchor:" + matchKey, {
        mk: matchKey,
        nick: client,
        slot: String(slotRaw),
        at: Date.now()
      });
    }
  } catch (eAnc) {}

  // новый save снимает tombstone только на этом дне (не на всех — иначе ломает move)
  // afterWrite/повтор не снимает свежий tombstone удаления
  try {
    if (!toBool_(params._keepTombstone) && !toBool_(params.fromAfterWrite)) {
      if (day) {
        await clearTombstonesForMatch_(env, matchKey, day, client);
      }
      // calendar-only: иначе remove→save «невидим» в getViewCompare (force)
      if (dateIso) {
        await clearCalendarTombstone_(env, dateIso, matchKey, client);
      }
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
  if (dateIso && (!day || asBooking)) {
    try {
      await refreshViewDateSnap_(env, dateIso);
    } catch (eRefSave) {}
  }
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
/** moveEpoch старше — не прячем клиента (stale after повторного переноса). */
const MOVE_EPOCH_MS = 7 * 24 * 60 * 60 * 1000;

function moveEpochHidesFromDay_(ep, day) {
  if (!ep || !ep.to || String(ep.to) === String(day || "")) return false;
  const epAge = Date.now() - Number(ep.at || 0);
  return epAge >= 0 && epAge < MOVE_EPOCH_MS;
}

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

/** Off-week Просмотр: live D1 без merge stale viewDate snap (иначе delete «воскресает»). */
async function refreshViewDateSnap_(env, dateIso) {
  var iso = String(dateIso || "").trim();
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(iso)) iso = dmyToIso_(iso) || iso;
  if (!env || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
  try {
    await delSnap_(env, "viewDate:" + iso);
  } catch (eDel) {}
  try {
    const vc = await getViewCompare_({ date: iso }, env);
    if (vc && vc.status === "success") await putSnap_(env, "viewDate:" + iso, vc);
  } catch (eVc) {}
  try {
    await rebuildMonthOverview_(env, iso.slice(0, 7));
  } catch (eMo) {}
}

async function filterCalTombFromList_(env, dateIso, list) {
  if (!list || !list.length || !dateIso) return list || [];
  var iso = String(dateIso || "").trim();
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(iso)) iso = dmyToIso_(iso) || iso;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return list || [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (!c) continue;
    var mk = normalizeMatchKey_(c.matchKey || c.name || c.client || "");
    if (mk) {
      try {
        var pk = await getSnapRaw_(env, "delTomb:CAL:" + iso + ":" + mk);
        if (pk && pk.mk && !pk.cleared && Number(pk.at || 0) > 0) continue;
      } catch (ePk) {}
    }
    out.push(c);
  }
  return out;
}

/** Снять calendar tomb после saveBooking на date_iso (иначе Просмотр force пустой). */
async function clearCalendarTombstone_(env, dateIso, matchKey, clientName) {
  var iso = String(dateIso || "").trim();
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(iso)) iso = dmyToIso_(iso) || iso;
  if (!env || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
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
  addKey_(clientName);
  var keys = Object.keys(clearKeys);
  for (var i = 0; i < keys.length; i++) {
    try {
      await env.DB.prepare("DELETE FROM snap_cache WHERE cache_key = ?")
        .bind("delTomb:CAL:" + iso + ":" + keys[i])
        .run();
    } catch (eDel) {}
  }
  try {
    await clearTombstonesForMatch_(env, matchKey, "", clientName);
  } catch (eList) {}
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
            if (moveEpochHidesFromDay_(ep, dayKey)) continue;
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

/**
 * После закрытия недели / failed resync D1 может быть пустым, а Sheets уже с людьми.
 * UI (force getClients) раньше сразу отдавал [] из D1 → «пропали, потом появились».
 * Heal: если D1 пустой/реже expect — тянем GAS, пишем в D1, в UI всегда отдаём GAS-список.
 */
async function healWeekClientsFromGasIfSparse_(env, day, d1Payload, opts) {
  opts = opts || {};
  const diag = { day: String(day || ""), got: 0, expect: null, sparse: false, gasN: -1, step: "init" };
  if (!env || !env.DB || !day) {
    if (d1Payload && typeof d1Payload === "object") d1Payload.healDiag = diag;
    return d1Payload;
  }
  const got = Array.isArray(d1Payload && d1Payload.clients) ? d1Payload.clients.length : 0;
  diag.got = got;
  let expect = null;
  try {
    // D1 counts = правда после delete/save; Sheet counts отстают и ложно жгут sparse→resurrect
    let counts = await getSnapRaw_(env, "weekDayCounts");
    if (!(counts && Array.isArray(counts.items) && counts.items.length) || (counts && counts.fromCalendar)) {
      try {
        counts = await rebuildWeekCounts_(env);
      } catch (eRb) {
        counts = await getSnapRaw_(env, "weekDayCountsSheet");
      }
    }
    ((counts && counts.items) || []).forEach(function (it) {
      if (it && String(it.day) === String(day)) expect = Number(it.count) || 0;
    });
  } catch (eExp) {
    diag.expectErr = String((eExp && eExp.message) || eExp);
  }
  diag.expect = expect;
  const expectPos = expect != null && expect > 0;
  const sparse = got === 0 ? !!(opts.force || expectPos) : expect != null && got < expect;
  diag.sparse = sparse;
  if (!sparse) {
    diag.step = "not_sparse";
    if (d1Payload && typeof d1Payload === "object") d1Payload.healDiag = diag;
    return d1Payload;
  }
  let hasTomb = false;
  try {
    hasTomb = await dayHasFreshTombstone_(env, day);
  } catch (eT) {}
  diag.hasTomb = hasTomb;
  // got>0 и tomb: НЕ выходим — добираем недостающих с листа через upsert
  // (раньше tomb_partial оставлял UI с 1 человеком после save, пока Sheet ждал 2+).
  // replace только если D1 полностью пуст.
  let live = null;
  try {
    live = await gasProxy_("getClients", { day: day }, env, { write: false });
  } catch (eG) {
    diag.step = "gas_throw";
    diag.gasErr = String((eG && eG.message) || eG);
    if (d1Payload && typeof d1Payload === "object") d1Payload.healDiag = diag;
    return d1Payload;
  }
  diag.gasStatus = live && live.status;
  if (!(live && live.status === "success" && Array.isArray(live.clients))) {
    diag.step = "gas_bad";
    if (d1Payload && typeof d1Payload === "object") d1Payload.healDiag = diag;
    return d1Payload;
  }
  // нормализуем nick → name (на всякий)
  live.clients = live.clients.map(function (c) {
    if (!c || typeof c !== "object") return c;
    if (!c.name && (c.nick || c.client)) c.name = c.nick || c.client;
    return c;
  });
  // дата слота обязательна: иначе replace пишет date_iso="" и scrubMismatched сносит строки
  try {
    const infoHeal = await dayDateInfo_(env, day);
    diag.slotIso = (infoHeal && infoHeal.iso) || "";
    if (infoHeal && infoHeal.iso) {
      live.clients = live.clients.map(function (c) {
        if (!c || typeof c !== "object") return c;
        if (!c.dateIso) c.dateIso = infoHeal.iso;
        if (!c.date && infoHeal.date) c.date = infoHeal.date;
        return c;
      });
      if (!live.date) live.date = infoHeal.date || "";
      if (!live.dateIso) live.dateIso = infoHeal.iso;
    }
  } catch (eIso) {
    diag.isoErr = String((eIso && eIso.message) || eIso);
  }
  // Sparse heal: НЕ sanitize до upsert — иначе stale delTomb выкидывает с листа
  // людей, которых как раз надо вернуть (после save нового клиента UI оставался с 1).
  const gasN = live.clients.length;
  diag.gasN = gasN;
  if (!gasN) {
    diag.step = "gas_empty";
    if (d1Payload && typeof d1Payload === "object") d1Payload.healDiag = diag;
    return d1Payload;
  }
  // got===0 (настоящий провал D1): чистим tomb и можем ignoreTombstones.
  // got>0 (частичный день после save): НЕ сносим personal delTomb — иначе delete «воскресает».
  if (got === 0) {
    try {
      for (var ciT0 = 0; ciT0 < live.clients.length; ciT0++) {
        var cT0 = live.clients[ciT0];
        if (!cT0) continue;
        var nmT0 = String(cT0.name || cT0.client || cT0.nick || "");
        var mkT0 = normalizeMatchKey_(cT0.matchKey || nmT0);
        try {
          await clearTombstonesForMatch_(env, mkT0 || nmT0, day, nmT0);
        } catch (eCT0) {}
        try {
          await putMoveArriveProtect_(env, day, mkT0 || nmT0, nmT0);
        } catch (eAP0) {}
      }
      try {
        await putSnap_(env, "tombDay:" + String(day), { day: String(day), at: 0, cleared: true });
      } catch (eClrT0) {}
      diag.tombsCleared = live.clients.length;
    } catch (eClrAll0) {
      diag.tombClrErr = String((eClrAll0 && eClrAll0.message) || eClrAll0);
    }
  }
  try {
    if (got === 0 && (isWeekD1GasAuthoritative_(env) || opts.replace)) {
      const repHeal = await replaceDayOrdersFromClients_(env, day, live.clients || [], {
        gasAuthoritative: true,
        allowGasInsert: true,
        protectMs: 0,
        skipProtectMissing: true,
        ignoreTombstones: true
      });
      if (repHeal && repHeal.aborted) {
        await upsertMissingClientsFromGas_(env, day, live.clients || [], { ignoreTombstones: true });
        diag.wrote = "upsert_after_abort";
        diag.abortReason = repHeal.reason || "aborted";
      } else {
        diag.wrote = "replace";
      }
    } else {
      // Есть люди в D1 — дописать с листа; respect personal tombs (не ignore)
      await upsertMissingClientsFromGas_(env, day, live.clients || [], {
        ignoreTombstones: false
      });
      diag.wrote = "upsert";
    }
  } catch (eUp) {
    diag.writeErr = String((eUp && eUp.message) || eUp);
  }
  try {
    await putSnap_(env, "clients:" + day, Object.assign({}, live, { cachedAt: new Date().toISOString() }));
  } catch (eSnap) {}
  try {
    await rebuildWeekCounts_(env);
  } catch (eRc) {}
  let healed = null;
  try {
    healed = await getClients_({ day: day }, env);
  } catch (eReread) {
    healed = null;
  }
  diag.d1After = healed && Array.isArray(healed.clients) ? healed.clients.length : -1;
  diag.step = "ok";
  if (healed && Array.isArray(healed.clients) && healed.clients.length) {
    healed.healedFromGas = true;
    healed.source = healed.source || "d1";
    healed.sandbox = false;
    healed.healDiag = diag;
    return healed;
  }
  // D1 всё ещё пуст — всё равно отдать GAS в UI (главное: не показывать пусто)
  live.healedFromGas = true;
  live.source = "gas-heal";
  live.sandbox = false;
  live.cutover = true;
  live.healDiag = diag;
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
  // week delete: не сканировать ВСЕ calendar-only (day_name='') — loose-match может
  // задеть ту же кличку на другой date_iso. CAL трогаем только при calendarOnly / явной dateIso.
  if (calendarOnly || dateIso) {
    if (calendarOnly && !dateIso) {
      await softDeleteScan_("day_name = ''", []);
    }
    if (dateIso) {
      await softDeleteScan_("date_iso = ? AND day_name = ''", [dateIso]);
    }
  }
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
    try {
      await refreshViewDateSnap_(env, dateIso);
    } catch (eRefCal) {}
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

async function loadMovePayloadFromViewSnap_(env, oldDate, matchKeyRaw, client) {
  if (!env || !oldDate) return null;
  try {
    const snap = await getSnapRaw_(env, "viewDate:" + oldDate);
    const list =
      snap && snap.status === "success"
        ? Array.isArray(snap.month)
          ? snap.month
          : Array.isArray(snap.week)
            ? snap.week
            : []
        : [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!orderRowLooseMatch_({ client: c.name, match_key: c.matchKey }, matchKeyRaw, client)) continue;
      return {
        client: c.name,
        address: c.address || "",
        phone: c.phone || "",
        note: c.note || "",
        basket_json: JSON.stringify(c.basket || []),
        segment: c.segment || "",
        source: c.source || ""
      };
    }
  } catch (e) {}
  return null;
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
  let calendarOnly = toBool_(params.calendarOnly);
  const client = String(params.client || "");
  const matchKeyRaw = params.matchKey || client;
  const matchKey = normalizeMatchKey_(matchKeyRaw);
  const clientLow = client.trim().toLowerCase();
  const mkLow = String(matchKeyRaw || "").trim().toLowerCase();
  const now = new Date().toISOString();
  const cutRaw = String(params.cutRaw == null ? "1" : params.cutRaw);

  // Сначала resolve даты — не форсить calendarOnly только из «есть date, нет day»
  if (newDate) {
    try {
      const rNew = await resolveDay_({ date: newDate }, env);
      if (rNew && rNew.onWeek && rNew.dayName) {
        if (!newDay) newDay = rNew.dayName;
        if (!toBool_(params.calendarOnly)) calendarOnly = false;
      } else if (!newDay) {
        calendarOnly = true;
      }
    } catch (eResNew) {
      if (!newDay && newDate) calendarOnly = true;
    }
  } else if (!newDay && !calendarOnly) {
    return { status: "error", message: "no_new_day_or_date" };
  }

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
    let srcPayload = null;
    if (oldDate) {
      srcPayload = await loadMovePayloadFromViewSnap_(env, oldDate, matchKeyRaw, client);
    }
    if (!srcPayload) {
      try {
        const anyRow = await findActiveOrderByMatch_(env, matchKeyRaw, client);
        if (anyRow) {
          const dn = String(anyRow.day_name || "");
          const di = String(anyRow.date_iso || "");
          if (
            (oldDate && di === oldDate) ||
            (oldDay && dn === oldDay) ||
            fromDays.indexOf(dn) >= 0
          ) {
            srcPayload = anyRow;
          }
        }
      } catch (eAny) {}
    }
    let srcBasket = [];
    if (srcPayload && srcPayload.basket_json) {
      try {
        srcBasket = JSON.parse(String(srcPayload.basket_json || "[]"));
      } catch (eB) {
        srcBasket = [];
      }
    } else if (srcPayload && Array.isArray(srcPayload.basket)) {
      srcBasket = srcPayload.basket;
    }
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
    const segSrc = segmentSourceFromMovePayload_(srcPayload, params);
    try {
      created = await saveOrder_(
        Object.assign({}, params, {
          day: "",
          date: newDate,
          dateIso: newDate,
          calendarOnly: true,
          client: client,
          matchKey: matchKeyRaw,
          address: (srcPayload && srcPayload.address) || params.address || "",
          phone: (srcPayload && srcPayload.phone) || params.phone || "",
          note: (srcPayload && srcPayload.note) || params.note || "",
          basket: srcBasket.length ? srcBasket : params.basket || [],
          segment: segSrc.segment,
          orderType:
            params.orderType ||
            segSrc.source ||
            sourceFromSegment_(segSrc.segment) ||
            "",
          source:
            params.source ||
            segSrc.source ||
            sourceFromSegment_(segSrc.segment) ||
            "",
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
    // sheets-first: строка могла остаться под другим day_name / без oldDay в params
    try {
      row = await findActiveOrderByMatch_(env, matchKeyRaw, client);
    } catch (eFindAny) {
      row = null;
    }
    if (row && newDay && String(row.day_name || "") === String(newDay)) {
      return {
        status: "success",
        sandbox: true,
        wrote: 1,
        alreadyMoved: true,
        from: oldDay || "",
        to: newDay,
        newDate: newDate,
        calendarOnly: false
      };
    }
  }
  if (!row) {
    return { status: "error", message: "not_found", sandbox: true };
  }

  row = enrichOrderRowSegment_(row);

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
  let exact = false;
  (snap.clients || []).forEach(function (c) {
    if (String(c.name || "") === client) {
      c[flag] = val;
      exact = true;
    }
  });
  // без точного имени (старые карточки) — по matchKey, но не трогать обе собаки разом
  if (!exact) {
    (snap.clients || []).forEach(function (c) {
      var hit = matchKeyAliases_(c.matchKey || c.name).some(function (k) {
        return aliases.indexOf(k) >= 0;
      });
      if (hit && !c.dogPart) c[flag] = val;
    });
  }
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
        // meta d1-primary: не затирать D1 snap фоновым GAS
        let skipStore = false;
        if (
          isMetaD1PrimaryCanon_(env) &&
          /^(listSurvey|listAccess|listTemplates)$/i.test(action)
        ) {
          try {
            const prevMeta = await getSnapRaw_(env, snapKey);
            const arr =
              (prevMeta && (prevMeta.items || prevMeta.people || prevMeta.list || prevMeta.templates)) ||
              [];
            if (prevMeta && Array.isArray(arr) && arr.length) skipStore = true;
          } catch (ePrevM) {}
        }
        if (!skipStore) {
          const toStore = Object.assign({}, live, { cachedAt: new Date().toISOString() });
          await putSnap_(env, snapKey, toStore);
          if (typeof opts.afterStore === "function") {
            try {
              await opts.afterStore(live, env);
            } catch (eA) {}
          }
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
  {
    id: "vr_c_piece",
    type: "coupon",
    kind: "paper",
    name: "Купон",
    hint: "с ламинацией",
    unit: "шт",
    active: true
  },
  {
    id: "vr_c_nfc",
    type: "coupon",
    kind: "nfc",
    name: "Купон NFC",
    hint: "приложить к телефону клиента · 1 на точку",
    unit: "шт",
    active: true
  },
  {
    id: "vr_c_banner",
    type: "coupon",
    kind: "paper",
    name: "Баннер",
    hint: "с ламинацией",
    unit: "шт",
    active: true
  }
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
      out.partnerCanon = partnerCanonLabel_(env);
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
    instant.fromD1 = true;
    instant.sandbox = false;
    instant.partnerCanon = partnerCanonLabel_(env);
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
    out.fromD1 = true;
    out.sandbox = false;
    out.partnerCanon = partnerCanonLabel_(env);
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

  // Закрытие / откат дат / материализация — GAS (Sheets склад) + D1 resync
  if (/^(finishFullWeek|repairWeekMonday|materializeWeek)$/i.test(a)) {
    // finish/repair — только owner (materialize можно менеджеру; GAS всё равно проверит)
    if (/^(finishFullWeek|repairWeekMonday)$/i.test(a)) {
      const ownerOk = await actorIsOwnerRetail_(params, env);
      if (!ownerOk) {
        // cold access snap — пусть GAS решит owner_only
        const tid = String((params && params.telegramId) || "").trim();
        if (tid) {
          try {
            const liveAcc = await gasProxy_("getMyAccess", { telegramId: tid }, env, { write: false });
            if (liveAcc && liveAcc.status === "success") {
              try {
                await putSnap_(env, "access:" + tid, Object.assign({}, liveAcc, { cachedAt: new Date().toISOString() }));
              } catch (eA) {}
              if (!/^(owner|all)$/i.test(String(liveAcc.role || ""))) {
                return {
                  status: "error",
                  message: "owner_only",
                  cutover: true,
                  action: a,
                  weekCloseCanon: weekCloseCanonLabel_(env)
                };
              }
            }
          } catch (eOwn) {}
        }
      }
    }
    let whClosePack = null;
    const gasFinParams = Object.assign({}, params || {});
    if (/^finishFullWeek$/i.test(a) && isWarehouseCloseD1Canon_(env)) {
      try {
        whClosePack = await computeWarehouseCloseD1_(env);
      } catch (eWhC) {
        whClosePack = { ok: false, message: String((eWhC && eWhC.message) || eWhC) };
      }
      if (whClosePack && whClosePack.ok) {
        gasFinParams.skipWarehouseClose = "1";
      }
    }
    const proxiedFin = await gasProxy_(a, gasFinParams, env, { write: true });
    const okFin =
      proxiedFin &&
      (proxiedFin.status === "success" ||
        /week_already_finished|week_monday_repaired/i.test(String(proxiedFin.message || "")));
    if (
      okFin &&
      /^finishFullWeek$/i.test(a) &&
      isWarehouseCloseD1Canon_(env) &&
      whClosePack &&
      whClosePack.ok
    ) {
      try {
        await applyWarehouseCloseD1_(env, whClosePack);
        if (proxiedFin && typeof proxiedFin === "object") {
          proxiedFin.warehouseClose = {
            fromD1: true,
            rows: (whClosePack.updates || []).length,
            pieceRows: (whClosePack.pieceUpdates || []).length
          };
          proxiedFin.warehouseCloseCanon = warehouseCloseCanonLabel_(env);
        }
      } catch (eApply) {
        if (proxiedFin && typeof proxiedFin === "object") {
          proxiedFin.warehouseCloseError = String((eApply && eApply.message) || eApply);
        }
      }
    }
    async function runWeekD1Resync_() {
      try {
        await cutoverRefreshAllWeekDays_(env, { clearDayTombs: /^finishFullWeek$/i.test(a) });
      } catch (eRf0) {}
      try {
        if (!(isWarehouseCloseD1Canon_(env) && /^finishFullWeek$/i.test(a) && whClosePack && whClosePack.ok)) {
          await cutoverRevalidate_("getWarehouse", { force: "1" }, env);
        }
      } catch (eWhRf) {}
      try {
        await putSnap_(env, "weekBanner", {
          status: "success",
          finished: /^finishFullWeek$/i.test(a) && okFin,
          pulled: true,
          refused: false,
          weekKey: (proxiedFin && proxiedFin.weekKey) || (params && params.weekKey) || "",
          action: a,
          syncedAt: new Date().toISOString(),
          cutover: true,
          fromD1: true
        });
      } catch (eBan) {}
    }
    let d1Synced = false;
    if (okFin && isWeekCloseD1SyncCanon_(env)) {
      // careful: UI не видит «успех», пока D1 не догнал Sheets
      try {
        await runWeekD1Resync_();
        d1Synced = true;
      } catch (eSync) {
        d1Synced = false;
      }
    } else {
      const refreshJob = runWeekD1Resync_().catch(function () {
        return null;
      });
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(refreshJob);
      else {
        try {
          await refreshJob;
          d1Synced = true;
        } catch (eRf) {}
      }
    }
    if (!proxiedFin) {
      return {
        status: "error",
        message: "gas_proxy_failed",
        tip: "GAS мог уже отработать — проверь getWeekDayCounts (force=1).",
        cutover: true,
        action: a,
        d1ResyncStarted: !d1Synced,
        d1Verified: d1Synced,
        weekCloseCanon: weekCloseCanonLabel_(env)
      };
    }
    if (proxiedFin) {
      proxiedFin.cutover = true;
      proxiedFin.sandbox = false;
      proxiedFin.weekD1Sync = weekD1SyncLabel_(env);
      proxiedFin.weekCloseCanon = weekCloseCanonLabel_(env);
      if (d1Synced) {
        proxiedFin.d1Verified = true;
        proxiedFin.d1ResyncStarted = false;
        proxiedFin.fromD1 = true;
      } else {
        proxiedFin.d1ResyncStarted = true;
      }
    }
    return partnerGuardOrRewrite_(a, params, proxiedFin);
  }

  if (a === "getSubscription") {
    if (isSubsD1PrimaryCanon_(env) && env && env.DB) {
      try {
        const local = await getSubscription_(params, env);
        const hasDetail =
          !!(local &&
            local.found &&
            (local._d1Detail ||
              local._savedAt ||
              (Array.isArray(local.basket) && local.basket.length > 0)));
        if (hasDetail) {
          return Object.assign({}, local, {
            cutover: true,
            fromD1: true,
            fromGas: false,
            sandbox: false,
            subsCanon: "d1-primary",
            d1Verified: true
          });
        }
        const liveSub = await gasProxy_(a, params, env, { write: false });
        if (liveSub && typeof liveSub === "object" && liveSub.status === "success") {
          try {
            await mergeSubscriptionDetailIntoSnap_(env, liveSub);
          } catch (eMergeSub) {}
          liveSub.cutover = true;
          liveSub.fromGas = true;
          liveSub.sandbox = false;
          liveSub.subsCanon = "d1-primary";
          return liveSub;
        }
        if (local && local.found) {
          return Object.assign({}, local, {
            cutover: true,
            fromD1: true,
            fromGas: false,
            sandbox: false,
            subsCanon: "d1-primary"
          });
        }
      } catch (eSubD1) {}
    }
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
        // D1-primary: все core writes сразу в D1; Sheets — только зеркало в фоне
        let d1Early = null;
        const d1Primary = isD1PrimaryCanon_(env);
        if (env && env.DB && (d1Primary || /^(moveClient|deleteClient|removeCalendarClient)$/i.test(a))) {
          try {
            if (/^(saveOrder|saveBooking)$/i.test(a)) {
              d1Early = await saveOrder_(jobParams, env, /^saveBooking$/i.test(a));
            } else if (/^moveClient$/i.test(a)) d1Early = await moveClient_(jobParams, env);
            else if (/^(deleteClient|removeCalendarClient)$/i.test(a)) d1Early = await deleteClient_(jobParams, env);
          } catch (eD1Early) {
            d1Early = {
              status: "error",
              message: String((eD1Early && eD1Early.message) || eD1Early)
            };
          }
        }
        const d1Ok = !!(d1Early && d1Early.status === "success");
        try {
          await putSnap_(env, "peopleWrite:" + writeId, {
            status: d1Primary && d1Ok ? "success" : "pending",
            verified: !!(d1Primary && d1Ok),
            pendingSheets: !(d1Primary && d1Ok),
            pendingSheetsMirror: !!(d1Primary && d1Ok),
            sheetsVerified: false,
            d1Verified: d1Ok,
            d1Res: d1Early || null,
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
                status: d1Primary && d1Ok ? "success" : "pending",
                verified: !!(d1Primary && d1Ok),
                pendingSheets: !(d1Primary && d1Ok),
                pendingSheetsMirror: !!(d1Primary && d1Ok),
                d1Verified: d1Ok,
                d1Res: d1Early || null,
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
          peopleCanon: peopleCanonLabel_(env),
          pendingSheets: !(d1Primary && d1Ok),
          pendingSheetsMirror: !!(d1Primary && d1Ok),
          sheetsVerified: false,
          verified: !!(d1Primary && d1Ok),
          d1Verified: d1Ok,
          d1Pending: !d1Ok,
          writeId: writeId,
          action: a,
          message: d1Primary && d1Ok ? "d1_saved" : "pending_sheets"
        };
        if (d1Early && d1Early.status === "success") {
          if (d1Early.wrote != null) accepted.wrote = d1Early.wrote;
          if (d1Early.alreadyMoved) accepted.alreadyMoved = true;
          if (d1Early.alreadyGone) accepted.alreadyGone = true;
          if (d1Early.from) accepted.from = d1Early.from;
          if (d1Early.to) accepted.to = d1Early.to;
          if (d1Early.newDay) accepted.newDay = d1Early.newDay;
          if (d1Early.newDate) accepted.newDate = d1Early.newDate;
          if (d1Early.daysCleared) accepted.daysCleared = d1Early.daysCleared;
        }
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
      const deferredPrimary = isDeferredD1PrimaryCanon_(env);
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
            // d1-primary: не подменять D1 id на GAS df_* и не revalidate list из Sheets
            if (!deferredPrimary) {
              try {
                if (/^notifyMissedDelivery$/i.test(a) && env && env.DB && proxied) {
                  await syncOpsWriteToD1_(a, params, env, proxied);
                }
              } catch (eD1) {}
              try {
                await cutoverAfterWrite_(a, params, env, proxied || d1WriteRes);
              } catch (eA) {}
            }
          })()
        );
      }

      if (d1WriteRes && d1WriteRes.status === "success") {
        return Object.assign({}, d1WriteRes, {
          cutover: true,
          sandbox: false,
          d1Verified: true,
          optimistic: !deferredPrimary,
          deferredCanon: deferredCanonLabel_(env),
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
      const opsPrimary = isOpsD1PrimaryCanon_(env);
      let d1FlagRes = null;
      try {
        if (env && env.DB) {
          if (/^updateCutting$/i.test(a)) d1FlagRes = await applyCuttingFlagToSnap_(params, env, null);
          else if (/^setDelivered$/i.test(a)) d1FlagRes = await setDelivered_(params, env);
          else if (/^setAssembled$/i.test(a)) d1FlagRes = await setAssemblyFlag_(params, env, "assembled");
          else if (/^setPrinted$/i.test(a)) d1FlagRes = await setAssemblyFlag_(params, env, "printed");
        }
      } catch (eFlag) {
        d1FlagRes = { status: "error", message: String((eFlag && eFlag.message) || eFlag) };
      }
      // D1-primary: сразу success UI; Sheets только зеркало в фоне (не ждём 14с)
      if (opsPrimary) {
        const bgMirror = (async function () {
          let proxied = null;
          try {
            proxied = await gasProxy_(a, params, env, { write: true });
          } catch (eG) {
            proxied = null;
          }
          try {
            if (/^updateCutting$/i.test(a) && proxied) {
              await applyCuttingFlagToSnap_(params, env, proxied);
            }
          } catch (eD1) {}
        })();
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(bgMirror);
        else bgMirror.catch(function () {});
        return {
          status: "success",
          wrote: 1,
          d1Verified: true,
          optimistic: false,
          opsCanon: "d1-primary",
          cutover: true,
          sandbox: false,
          action: a,
          row: Number((params && params.row) || 0) || (d1FlagRes && d1FlagRes.row) || 0,
          name: String((params && params.name) || ""),
          delivered: d1FlagRes && d1FlagRes.delivered,
          assembled: d1FlagRes && d1FlagRes.assembled,
          printed: d1FlagRes && d1FlagRes.printed
        };
      }
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
        d1Res.d1Verified = true;
        d1Res.deferredCanon = deferredCanonLabel_(env);
        d1Res.optimistic = false;
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
    // Склад: arrival/ревизия — D1 правда → Sheets зеркало (preview/compose остаются GAS)
    if (
      isWarehouseD1PrimaryCanon_(env) &&
      /^(setWarehouseArrival|applyWarehouseRevision|zeroWarehouse)$/i.test(a)
    ) {
      let d1Wh = null;
      try {
        if (env && env.DB) {
          if (/^setWarehouseArrival$/i.test(a)) d1Wh = await setWarehouseArrival_(params, env);
          else if (/^applyWarehouseRevision$/i.test(a)) d1Wh = await applyWarehouseRevisionD1_(params, env);
          else d1Wh = await zeroWarehouseD1_(params, env);
        }
      } catch (eWh) {
        d1Wh = { status: "error", message: String((eWh && eWh.message) || eWh) };
      }
      const gasWhP = gasProxy_(a, params, env, { write: true }).catch(function () {
        return null;
      });
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(gasWhP);
      else {
        try {
          await gasWhP;
        } catch (eGWh) {}
      }
      if (d1Wh && d1Wh.status === "success") {
        return Object.assign({}, d1Wh, {
          cutover: true,
          sandbox: false,
          d1Verified: true,
          optimistic: false,
          warehouseCanon: warehouseCanonLabel_(env),
          action: a
        });
      }
      return {
        status: "error",
        message: (d1Wh && d1Wh.message) || "d1_write_failed",
        cutover: true,
        sandbox: false,
        action: a
      };
    }
    // Доступы / шаблоны / опросники CRUD — D1 правда (TG remind остаётся GAS)
    if (
      isMetaD1PrimaryCanon_(env) &&
      /^(setAccessRole|setAccessTimezone|requestAccess|saveTemplate|deleteTemplate|saveSurvey|deleteSurvey|deleteSurveyBatch)$/i.test(
        a
      )
    ) {
      let d1Meta = null;
      try {
        if (env && env.DB) {
          if (/^(setAccessRole|setAccessTimezone|requestAccess)$/i.test(a)) {
            d1Meta = await mutateAccess_(a, params, env);
          } else if (/^(saveTemplate|deleteTemplate)$/i.test(a)) {
            d1Meta = await mutateTemplates_(a, params, env);
          } else if (/^saveSurvey$/i.test(a)) {
            d1Meta = await upsertInList_(env, "listSurvey", "items", params, "id");
          } else {
            d1Meta = await deleteFromList_(env, "listSurvey", "items", params, "id");
          }
        }
      } catch (eMeta) {
        d1Meta = { status: "error", message: String((eMeta && eMeta.message) || eMeta) };
      }
      const gasMetaP = gasProxy_(a, params, env, { write: true }).catch(function () {
        return null;
      });
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(gasMetaP);
      else {
        try {
          await gasMetaP;
        } catch (eGM) {}
      }
      if (d1Meta && d1Meta.status === "success") {
        return Object.assign({}, d1Meta, {
          cutover: true,
          sandbox: false,
          d1Verified: true,
          optimistic: false,
          metaCanon: metaCanonLabel_(env),
          action: a
        });
      }
      return {
        status: "error",
        message: (d1Meta && d1Meta.message) || "d1_write_failed",
        cutover: true,
        sandbox: false,
        action: a
      };
    }
    // Подписки ПП/АФК/БП: D1 правда → Sheets зеркало в фоне
    if (
      isSubsD1PrimaryCanon_(env) &&
      /^(saveSubscription|moveSubscription|deleteSubscription|deleteSubscriptionBatch)$/i.test(a)
    ) {
      let d1SubRes = null;
      try {
        if (env && env.DB) {
          if (/^(saveSubscription|moveSubscription)$/i.test(a)) {
            d1SubRes = await upsertSubscription_(params, env);
          } else {
            d1SubRes = await deleteSubscription_(params, env);
          }
        }
      } catch (eSubW) {
        d1SubRes = { status: "error", message: String((eSubW && eSubW.message) || eSubW) };
      }
      const gasSubP = gasProxy_(a, params, env, { write: true }).catch(function () {
        return null;
      });
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(gasSubP);
      } else {
        try {
          await gasSubP;
        } catch (eGSub) {}
      }
      if (d1SubRes && d1SubRes.status === "success") {
        return Object.assign({}, d1SubRes, {
          cutover: true,
          sandbox: false,
          d1Verified: true,
          optimistic: false,
          subsCanon: subsCanonLabel_(env),
          action: a
        });
      }
      return {
        status: "error",
        message: (d1SubRes && d1SubRes.message) || "d1_write_failed",
        cutover: true,
        sandbox: false,
        action: a
      };
    }
    // Розничный прайс: D1 правда → Script Properties/лист через GAS
    if (isPriceD1PrimaryCanon_(env) && /^saveRetailPrices$/i.test(a)) {
      let d1Price = null;
      try {
        const ownerOk = await actorIsOwnerRetail_(params, env);
        if (!ownerOk) {
          // нет snap доступа — пусть GAS решит (owner_only)
          const gasOnly = await gasProxy_(a, params, env, { write: true });
          if (gasOnly && gasOnly.status === "success") {
            try {
              await putSnap_(env, "retailPrices", Object.assign({}, gasOnly, { cachedAt: new Date().toISOString() }));
            } catch (eStoreP) {}
          }
          if (gasOnly && typeof gasOnly === "object") {
            gasOnly.cutover = true;
            gasOnly.sandbox = false;
            gasOnly.priceCanon = priceCanonLabel_(env);
          }
          return gasOnly || { status: "error", message: "owner_only", cutover: true, action: a };
        }
        d1Price = await saveRetailPricesD1_(params, env);
      } catch (ePr) {
        d1Price = { status: "error", message: String((ePr && ePr.message) || ePr) };
      }
      const gasPrP = gasProxy_(a, params, env, { write: true }).catch(function () {
        return null;
      });
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(gasPrP);
      else {
        try {
          await gasPrP;
        } catch (eGPr) {}
      }
      if (d1Price && d1Price.status === "success") {
        return Object.assign({}, d1Price, {
          cutover: true,
          sandbox: false,
          d1Verified: true,
          optimistic: false,
          priceCanon: priceCanonLabel_(env),
          action: a
        });
      }
      return {
        status: "error",
        message: (d1Price && d1Price.message) || "d1_write_failed",
        cutover: true,
        sandbox: false,
        action: a
      };
    }
    // pullClientsFromMonth: GAS пишет Sheets; d1-primary afterWrite skip → явно догоняем D1+нарезку
    if (/^pullClientsFromMonth$/i.test(a)) {
      const proxiedPull = await gasProxy_(a, params, env, { write: true });
      if (!proxiedPull) {
        return { status: "error", message: "gas_proxy_failed", cutover: true, action: a };
      }
      const dayPull = String((proxiedPull && proxiedPull.day) || (params && params.day) || "");
      const bgPull = (async function () {
        try {
          if (!(dayPull && env && env.DB)) return;
          const fresh = await gasProxy_("getClients", { day: dayPull, force: "1" }, env, {
            write: false
          });
          if (fresh && fresh.status === "success") {
            await sanitizeGasClientsPayload_(env, dayPull, fresh);
            await upsertMissingClientsFromGas_(env, dayPull, fresh.clients || []);
            try {
              await putSnap_(env, "clients:" + dayPull, fresh);
            } catch (eS) {}
          }
          if (isCuttingStructD1PrimaryCanon_(env) || isOpsD1PrimaryCanon_(env)) {
            try {
              await rebuildCuttingDay_(env, dayPull);
            } catch (eCutP) {}
          }
        } catch (ePullD1) {}
      })();
      let pullSynced = false;
      if (isWeekCloseD1SyncCanon_(env)) {
        try {
          await bgPull;
          pullSynced = true;
        } catch (eBgP) {}
      } else if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(bgPull);
      } else {
        try {
          await bgPull;
          pullSynced = true;
        } catch (eBgP2) {}
      }
      proxiedPull.cutover = true;
      proxiedPull.sandbox = false;
      proxiedPull.d1SyncStarted = !pullSynced;
      proxiedPull.d1Verified = pullSynced;
      proxiedPull.weekCloseCanon = weekCloseCanonLabel_(env);
      return partnerGuardOrRewrite_(a, params, proxiedPull);
    }
    // Баннер недели + сессии нарезки — D1 (не week-close)
    if (/^setWeekBannerState$/i.test(a)) {
      const body = {
        status: "success",
        finished: !!toBool_(params.finished),
        pulled: !!toBool_(params.pulled),
        refused: !!toBool_(params.refused),
        weekKey: params.weekKey || "",
        cutover: true,
        fromD1: true,
        fromGas: false,
        sandbox: false,
        d1Verified: true,
        _savedAt: Date.now()
      };
      await putSnap_(env, "weekBanner", body);
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(
          gasProxy_(a, params, env, { write: true }).catch(function () {
            return null;
          })
        );
      }
      return body;
    }
    if (/^(startCuttingSession|stopCuttingSession|finishCutting|prepareFinishCutting)$/i.test(a)) {
      const day = String((params && params.day) || "").trim() || "Понедельник";
      let cut = (await getSnapRaw_(env, "cutting:" + day)) || {
        status: "success",
        day: day,
        items: [],
        clients: []
      };
      const now = Date.now();
      const sess = Object.assign({}, cut.session || {}, {
        action: a,
        at: now,
        active: /^startCuttingSession$/i.test(a),
        finished: /^finishCutting$/i.test(a),
        prepared: /^prepareFinishCutting$/i.test(a)
      });
      cut.session = sess;
      cut.status = "success";
      cut.day = day;
      await putSnap_(env, "cutting:" + day, cut);
      const okSess = {
        status: "success",
        action: a,
        day: day,
        session: sess,
        cutover: true,
        fromD1: true,
        fromGas: false,
        sandbox: false,
        d1Verified: true,
        pendingSheets: true
      };
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(
          gasProxy_(a, params, env, { write: true })
            .then(async function (live) {
              try {
                await syncOpsWriteToD1_(a, params, env, live || {});
              } catch (e) {}
            })
            .catch(function () {
              return null;
            })
        );
      }
      return okSess;
    }
    // Varka Partner_* — D1/snap правда → GAS зеркало (TG/deferred в GAS)
    if (
      isPartnerD1PrimaryCanon_(env) &&
      /^(partnerSaveNetwork|partnerSavePoint|partnerSaveAccess|partnerRevokeAccess|partnerSeedDefaults|partnerSetNotifyRecipients|partnerSubmitOrder|partnerSetOrderStatus)$/i.test(
        a
      )
    ) {
      let d1P = null;
      try {
        if (env && env.DB) d1P = await mutatePartnerD1_(a, params, env);
      } catch (eP) {
        d1P = { status: "error", message: String((eP && eP.message) || eP) };
      }
      const gasP = gasProxy_(a, params, env, { write: true }).catch(function () {
        return null;
      });
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(
          gasP.then(async function (live) {
            try {
              if (live && live.status === "success") await refreshPartnerSnapsFromGas_(a, params, env, live);
            } catch (eR) {}
            return live;
          })
        );
      } else {
        try {
          const live = await gasP;
          if (live && live.status === "success") await refreshPartnerSnapsFromGas_(a, params, env, live);
        } catch (eG) {}
      }
      if (d1P && d1P.status === "success") {
        return Object.assign({}, d1P, {
          cutover: true,
          sandbox: false,
          d1Verified: true,
          optimistic: false,
          partnerCanon: partnerCanonLabel_(env),
          action: a
        });
      }
      // cold / validation miss — дождаться уже запущенного GAS (без второго вызова)
      try {
        const liveOnly = await gasP;
        if (liveOnly && liveOnly.status === "success" && env && env.DB) {
          try {
            await refreshPartnerSnapsFromGas_(a, params, env, liveOnly);
          } catch (eS) {}
        }
        if (liveOnly && typeof liveOnly === "object") {
          liveOnly.cutover = true;
          liveOnly.fromGas = true;
          liveOnly.partnerCanon = partnerCanonLabel_(env);
        }
        return liveOnly || { status: "error", message: (d1P && d1P.message) || "partner_write_failed", cutover: true };
      } catch (eFall) {
        return {
          status: "error",
          message: (d1P && d1P.message) || String((eFall && eFall.message) || eFall),
          cutover: true,
          action: a
        };
      }
    }
    // Goodboy GB_* — D1/snap правда → GAS зеркало (CRM read-only)
    if (
      isGbD1PrimaryCanon_(env) &&
      /^(gbEnsureSheets|gbMe|gbRegister|gbLogin|gbLinkClient|gbSavePet)$/i.test(a)
    ) {
      let d1G = null;
      try {
        if (env && env.DB) d1G = await mutateGbD1_(a, params, env);
      } catch (eG0) {
        d1G = { status: "error", message: String((eG0 && eG0.message) || eG0) };
      }
      const gasG = gasProxy_(a, params, env, { write: true }).catch(function () {
        return null;
      });
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(
          gasG.then(async function (live) {
            try {
              if (live && live.status === "success") await refreshGbSnapsFromGas_(a, params, env, live);
            } catch (eR) {}
            return live;
          })
        );
      } else {
        try {
          const live = await gasG;
          if (live && live.status === "success") await refreshGbSnapsFromGas_(a, params, env, live);
        } catch (eG1) {}
      }
      if (d1G && d1G.status === "success") {
        return Object.assign({}, d1G, {
          cutover: true,
          sandbox: false,
          d1Verified: true,
          optimistic: false,
          gbCanon: gbCanonLabel_(env),
          action: a
        });
      }
      try {
        const liveOnly = await gasG;
        if (liveOnly && liveOnly.status === "success" && env && env.DB) {
          try {
            await refreshGbSnapsFromGas_(a, params, env, liveOnly);
          } catch (eS) {}
        }
        if (liveOnly && typeof liveOnly === "object") {
          liveOnly.cutover = true;
          liveOnly.fromGas = true;
          liveOnly.gbCanon = gbCanonLabel_(env);
        }
        return liveOnly || { status: "error", message: (d1G && d1G.message) || "gb_write_failed", cutover: true };
      } catch (eFallG) {
        return {
          status: "error",
          message: (d1G && d1G.message) || String((eFallG && eFallG.message) || eFallG),
          cutover: true,
          action: a
        };
      }
    }
    // Goodboy заявка с сайта — D1 snap + TG Worker + GAS зеркало листа
    if (isGbD1PrimaryCanon_(env) && /^submitGoodboyTry$/i.test(a)) {
      let d1Try = null;
      try {
        if (env && env.DB) d1Try = await submitGoodboyTryD1_(params, env);
      } catch (eTry) {
        d1Try = { status: "error", message: String((eTry && eTry.message) || eTry) };
      }
      const gasTry = gasProxy_(a, params, env, { write: true }).catch(function () {
        return null;
      });
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(gasTry);
      if (d1Try && (d1Try.status === "ok" || d1Try.status === "success")) {
        return Object.assign({}, d1Try, {
          cutover: true,
          sandbox: false,
          d1Verified: true,
          gbCanon: gbCanonLabel_(env),
          action: a
        });
      }
      try {
        const liveOnly = await gasTry;
        if (liveOnly && typeof liveOnly === "object") {
          liveOnly.cutover = true;
          liveOnly.fromGas = true;
          liveOnly.gbCanon = gbCanonLabel_(env);
        }
        return liveOnly || { status: "error", message: (d1Try && d1Try.message) || "try_failed", cutover: true };
      } catch (eFallT) {
        return {
          status: "error",
          message: (d1Try && d1Try.message) || String((eFallT && eFallT.message) || eFallT),
          cutover: true
        };
      }
    }
    // Telegram: Worker + D1 tickets (токен = secret TELEGRAM_BOT_TOKEN). Нет токена → GAS.
    if (/^prepareCourierRoute$/i.test(a)) {
      return prepareCourierRouteD1_(params, env);
    }
    if (/^(sendCourierRoute|sendDeficit)$/i.test(a)) {
      return sendCourierRouteD1_(params, env, a);
    }
    if (/^forceSurveyRemind$/i.test(a)) {
      return forceSurveyRemindD1_(params, env, ctx);
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
      } else if (/^(saveSubscription|moveSubscription)$/i.test(a) && env && env.DB) {
        await upsertSubscription_(params, env);
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
  if (a === "telegramStatus") {
    return telegramStatusD1_(params, env);
  }
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
      let live = await getClients_(params, env);
      try {
        live = await healWeekClientsFromGasIfSparse_(env, String(params.day), live, {
          force: true
        });
      } catch (eHealF) {}
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
      let liveVc = await getViewCompare_(params, env);
      try {
        const dayVc = String(
          (liveVc && liveVc.day) ||
            (liveVc && liveVc.targetDay) ||
            (params && params.day) ||
            ""
        );
        const weekEmpty =
          !liveVc || !Array.isArray(liveVc.week) || !liveVc.week.length;
        if (dayVc && weekEmpty && !(liveVc && liveVc.dateNotInWeek)) {
          const healed = await healWeekClientsFromGasIfSparse_(
            env,
            dayVc,
            { status: "success", day: dayVc, clients: [] },
            { force: true }
          );
          if (healed && Array.isArray(healed.clients) && healed.clients.length) {
            liveVc = liveVc && typeof liveVc === "object" ? liveVc : {};
            liveVc.status = "success";
            liveVc.day = dayVc;
            liveVc.targetDay = dayVc;
            liveVc.week = healed.clients.slice();
            liveVc.healedFromGas = true;
            if (healed.date) liveVc.date = healed.date;
            if (healed.dateIso) liveVc.dateIso = healed.dateIso;
          }
        }
      } catch (eHealVc) {}
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
      // Даты слотов — с листа; count — из D1 (иначе stale Sheet count → false sparse heal)
      let d1Body = null;
      try {
        d1Body = await rebuildWeekCounts_(env);
      } catch (eRb) {
        d1Body = null;
      }
      const sheetDate = Object.create(null);
      ((live.items || []) || []).forEach(function (it) {
        if (it && it.day && it.date) sheetDate[String(it.day)] = String(it.date);
      });
      const items = ((d1Body && d1Body.items) || []).map(function (it) {
        const dayN = String((it && it.day) || "");
        const date = sheetDate[dayN] || (it && it.date) || "";
        return Object.assign({}, it, { date: date });
      });
      // если D1 пуст по дням — всё равно проставь даты слотов с листа (count 0)
      if (!items.length && Array.isArray(live.items)) {
        (live.items || []).forEach(function (it) {
          if (!it || !it.day) return;
          items.push({
            day: it.day,
            short: it.short || DAY_SHORT[it.day] || it.day,
            count: 0,
            date: it.date || ""
          });
        });
      }
      const dateToDay = Object.create(null);
      let total = 0;
      items.forEach(function (it) {
        total += Number(it.count) || 0;
        const iso = dmyToIso_(it.date);
        if (iso && it.day) dateToDay[iso] = it.day;
      });
      const out = {
        status: "success",
        items: items,
        total: total,
        cutover: true,
        fromGas: false,
        fromD1: true,
        datesFromSheet: true,
        fromCalendar: false,
        sandbox: false
      };
      try {
        await putSnap_(env, "weekDayCounts", out);
        await putSnap_(env, "dateToDay", { map: dateToDay });
      } catch (eP) {}
      // Не full week-replace на каждый getWeekDayCounts — иначе неполный GAS вайпает D1.
      // Full resync только после finish (runWeekD1Resync_) или явном weekResync=1.
      if (String((params && params.weekResync) || "") === "1") {
        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(cutoverRefreshAllWeekDays_(env));
        }
      }
      return out;
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
        try {
          await putSnap_(e, "weekDayCountsSheet", live);
        } catch (eSh) {}
        if (isWeekSkewed_(live)) {
          await applyCalendarWeekIfSkewed_("getWeekDayCounts", params, e, live);
          return;
        }
        try {
          await scrubAllDayDateMismatches_(e, live);
        } catch (eScrub2) {}
        // перезаписать weekDayCounts D1-counts (cutoverSwrGas уже положил GAS — откатываем)
        try {
          const d1Body = await rebuildWeekCounts_(e);
          const sheetDate = Object.create(null);
          ((live && live.items) || []).forEach(function (it) {
            if (it && it.day && it.date) sheetDate[String(it.day)] = String(it.date);
          });
          const items = ((d1Body && d1Body.items) || []).map(function (it) {
            const dayN = String((it && it.day) || "");
            return Object.assign({}, it, { date: sheetDate[dayN] || (it && it.date) || "" });
          });
          const map = Object.create(null);
          let total = 0;
          items.forEach(function (it) {
            total += Number(it.count) || 0;
            const iso = dmyToIso_(it.date);
            if (iso && it.day) map[iso] = it.day;
          });
          await putSnap_(e, "weekDayCounts", {
            status: "success",
            items: items,
            total: total,
            fromD1: true,
            datesFromSheet: true,
            sandbox: false
          });
          await putSnap_(e, "dateToDay", { map: map });
        } catch (eMerge) {}
        if (String((params && params.weekResync) || "") === "1") {
          if (ctx && typeof ctx.waitUntil === "function") {
            ctx.waitUntil(cutoverRefreshAllWeekDays_(e));
          }
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
  // Склад preview: D1 snap-first (формулы листа — GAS только force/miss). Не списывает склад.
  if (isWarehouseD1PrimaryCanon_(env) && a === "warehousePreview") {
    return warehousePreviewD1_(params, env, ctx);
  }
  if (isWarehouseD1PrimaryCanon_(env) && a === "checkOrderWarehouse") {
    return checkOrderWarehouseD1_(params, env, ctx);
  }
  if (
    a === "suggestAddress" ||
    a === "lookupBpPartner" ||
    a === "calcPrice" ||
    a === "getRetailPriceList" ||
    a === "calcPpFact" ||
    a === "migratePpToRaw26Scheme" ||
    a === "getPpFactCost" ||
    a === "getPpOrderSuggest" ||
    a === "exportStats" ||
    a === "getExpectedProfit" ||
    a === "getTransferTask" ||
    a === "composeWarehouseBuyMessage" ||
    a === "partnerListAdmin" ||
    a === "partnerListMyOrders" ||
    a === "gbBootstrap" ||
    a === "previewWeekCloseWarehouse"
  ) {
    if (a === "suggestAddress") {
      return suggestAddressCutover_(params, env);
    }
    if (a === "getTransferTask") {
      return getTransferTaskCutover_(params, env);
    }
    if (a === "lookupBpPartner") {
      return lookupBpPartnerD1_(params, env, ctx);
    }
    // Розница: прайс + calc из D1
    if (isPriceD1PrimaryCanon_(env) && a === "getRetailPriceList") {
      return getRetailPriceListD1_(params, env, ctx);
    }
    if (isPriceD1PrimaryCanon_(env) && a === "calcPrice" && isRetailCalcMode_(params)) {
      return calcPriceRetailD1_(params, env, ctx);
    }
    if (isPriceD1PrimaryCanon_(env) && a === "calcPpFact") {
      return calcPpFactD1_(params, env, ctx);
    }
    if (isPriceD1PrimaryCanon_(env) && a === "calcPrice" && isPpCalcMode_(params)) {
      return calcPricePpD1_(params, env, ctx);
    }
    if (isPriceD1PrimaryCanon_(env) && a === "getPpFactCost") {
      return getPpFactCostD1_(params, env, ctx);
    }
    if (isPriceD1PrimaryCanon_(env) && a === "getPpOrderSuggest") {
      return getPpOrderSuggestD1_(params, env, ctx);
    }
    if (isSubsD1PrimaryCanon_(env) && a === "migratePpToRaw26Scheme") {
      return migratePpToRaw26SchemeD1_(params, env, ctx);
    }
    if (isWarehouseD1PrimaryCanon_(env) && a === "composeWarehouseBuyMessage") {
      return composeWarehouseBuyMessageD1_(params, env, ctx);
    }
    if (a === "getExpectedProfit" || a === "exportStats") {
      const st = await getSnapRaw_(env, "getStats");
      if (st && st.status === "success" && String((params && params.force) || "") !== "1") {
        return Object.assign({}, st, {
          cutover: true,
          fromD1: true,
          fromGas: false,
          sandbox: false,
          action: a,
          d1Verified: true,
          statsFromSnap: true
        });
      }
    }

    if (a === "previewWeekCloseWarehouse") {
      return previewWeekCloseWarehouseD1_(params, env, ctx);
    }
    if (isPartnerD1PrimaryCanon_(env) && a === "partnerListAdmin") {
      const adminFast = await partnerListAdminD1_(params, env, ctx);
      if (adminFast) return adminFast;
    }
    if (isPartnerD1PrimaryCanon_(env) && a === "partnerListMyOrders") {
      const ordFast = await partnerListMyOrdersD1_(params, env, ctx);
      if (ordFast) return ordFast;
    }
    if (isGbD1PrimaryCanon_(env) && a === "gbBootstrap") {
      return gbBootstrapD1_(params, env);
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
      if (a === "getRetailPriceList" && live.status === "success" && env && env.DB) {
        try {
          await putSnap_(env, "retailPrices", Object.assign({}, live, { cachedAt: new Date().toISOString() }));
        } catch (eRp) {}
      }
      if (
        (a === "calcPpFact" || (a === "calcPrice" && isPpCalcMode_(params))) &&
        live.status === "success" &&
        Array.isArray(live.lines) &&
        env &&
        env.DB
      ) {
        try {
          await mergePriceCostsPpFromLinesD1_(env, live.lines);
        } catch (ePp) {}
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

  const needGas = cutoverNeedsRevalidate_(a, params, fast, env);
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
          // D1 реже листа (часто пусто после finish) — heal из GAS до ответа UI
          if (!hasTomb && got < expect) {
            try {
              const healedFast = await healWeekClientsFromGasIfSparse_(
                env,
                params.day,
                fast,
                { force: got === 0 }
              );
              if (
                healedFast &&
                Array.isArray(healedFast.clients) &&
                healedFast.clients.length > got
              ) {
                healedFast.cutover = true;
                healedFast.swr = true;
                healedFast.fromGas = !!healedFast.healedFromGas;
                healedFast.source = healedFast.source || "d1";
                if (healedFast.sandbox === true) healedFast.sandbox = false;
                return healedFast;
              }
            } catch (eHealMis) {}
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
  // Подписки CRM: d1-primary — D1 snap; GAS только cold-start (пустой snap).
  // Иначе force/пустой → полный GAS (без sheet=), чтобы UI не кэшировал «Пусто».
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
    if (a === "listSubscriptions" && isSubsD1PrimaryCanon_(env) && !emptySubs) {
      const outSubs = Object.assign({}, fast, {
        cutover: true,
        fromD1: true,
        fromGas: false,
        subsCanon: "d1-primary",
        swr: true,
        sandbox: false
      });
      return outSubs;
    }
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
          liveSubs.fromGas = !isSubsD1PrimaryCanon_(env);
          liveSubs.fromD1 = !!isSubsD1PrimaryCanon_(env);
          liveSubs.subsCanon = subsCanonLabel_(env);
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
      // d1-primary: сначала finalize D1 snap; GAS только cold-start
      if (isDeferredD1PrimaryCanon_(env)) {
        try {
          const afterD1 = await getSnapRaw_(env, "listDeferred");
          if (afterD1 && Array.isArray(afterD1.items) && afterD1.items.length) {
            const finalD1 = await finalizeListDeferredPayload_(env, afterD1);
            try {
              await putSnap_(env, "listDeferred", finalD1);
            } catch (eFaD1) {}
            finalD1.cutover = true;
            finalD1.fromD1 = true;
            finalD1.deferredCanon = "d1-primary";
            finalD1.swr = true;
            finalD1.sandbox = false;
            return finalD1;
          }
        } catch (eAfterD1) {}
      }
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
            finalDef.fromGas = !isDeferredD1PrimaryCanon_(env);
            finalDef.fromD1 = !!isDeferredD1PrimaryCanon_(env);
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
      // в фоне: восстановить transfer из deleted orders; GAS merge только без deferredCanon
      ctx.waitUntil(
        (async function () {
          try {
            await repairParkedTransfersFromOrders_(env);
          } catch (eR) {}
          if (!isDeferredD1PrimaryCanon_(env)) {
            try {
              await cutoverRevalidate_("listDeferred", params || {}, env);
            } catch (eV) {}
          }
        })()
      );
    }
  }

  // склад / отложенные / просмотр без snap — подтянуть GAS
  if (
    fast &&
    (a === "getWarehouse" ||
      (a === "listDeferred" && !isDeferredD1PrimaryCanon_(env)) ||
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
    if (a === "listSubscriptions" && isSubsD1PrimaryCanon_(env)) {
      fast.fromD1 = true;
      fast.fromGas = false;
      fast.subsCanon = "d1-primary";
    }
    if (a === "getWarehouse" && isWarehouseD1PrimaryCanon_(env)) {
      fast.warehouseCanon = "d1-primary";
      fast.fromD1 = true;
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
function cutoverNeedsRevalidate_(a, params, fast, env) {
  if (isD1PrimaryCanon_(env) && a === "getClients") {
    const empty = !fast || !Array.isArray(fast.clients) || !fast.clients.length;
    if (!empty) return false;
  }
  if (isD1PrimaryCanon_(env) && a === "getViewCompare") {
    const empty =
      !fast ||
      ((!Array.isArray(fast.week) || !fast.week.length) &&
        (!Array.isArray(fast.month) || !fast.month.length));
    if (!empty) return false;
  }
  if (isDeferredD1PrimaryCanon_(env) && a === "listDeferred") {
    const empty = !fast || !Array.isArray(fast.items) || !fast.items.length;
    if (!empty) return false;
  }
  if (isSubsD1PrimaryCanon_(env) && a === "listSubscriptions") {
    const empty = !fast || !Array.isArray(fast.subscriptions) || !fast.subscriptions.length;
    if (!empty) return false;
  }
  if (isMetaD1PrimaryCanon_(env) && /^(listAccess|listSurvey|listTemplates)$/i.test(a)) {
    let empty = !fast;
    if (fast) {
      const arr = fast.items || fast.people || fast.list || fast.templates || fast.surveys || [];
      empty = !Array.isArray(arr) || !arr.length;
    }
    if (!empty) return false;
  }
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
  if (a === "calcPrice" || a === "calcPpFact" || a === "migratePpToRaw26Scheme" || a === "getPpFactCost" || a === "getPpOrderSuggest" || a === "getRetailPriceList") {
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
      a === "listBookings" ||
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
    if (!isD1PrimaryCanon_(env)) {
      list = await filterTombstonedClients_(env, params.day, list);
      payload = Object.assign({}, payload, { clients: list });
    }
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
    // Обычный GAS revalidate — только upsert недостающих (replace воскрешал delete / сжимал день).
    await putSnap_(env, "clients:" + params.day, payload);
    await upsertMissingClientsFromGas_(env, params.day, list);
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
    // Sheet — только даты слотов; count всегда из D1 (иначе stale Sheet → false sparse heal)
    try {
      await putSnap_(env, "weekDayCountsSheet", payload);
    } catch (eShCnt) {}
    try {
      await scrubAllDayDateMismatches_(env, payload);
    } catch (eScr) {}
    let d1Body = null;
    try {
      d1Body = await rebuildWeekCounts_(env);
    } catch (eRb2) {
      d1Body = null;
    }
    const sheetDate = Object.create(null);
    ((payload && payload.items) || []).forEach(function (it) {
      if (it && it.day && it.date) sheetDate[String(it.day)] = String(it.date);
    });
    const items = ((d1Body && d1Body.items) || []).map(function (it) {
      const dayN = String((it && it.day) || "");
      return Object.assign({}, it, { date: sheetDate[dayN] || (it && it.date) || "" });
    });
    const map = Object.create(null);
    let total = 0;
    items.forEach(function (it) {
      total += Number(it.count) || 0;
      const iso = dmyToIso_(it && it.date);
      if (iso && it.day) map[iso] = it.day;
    });
    const out = {
      status: "success",
      items: items,
      total: total,
      fromD1: true,
      datesFromSheet: true,
      sandbox: false
    };
    await putSnap_(env, "weekDayCounts", out);
    await putSnap_(env, "dateToDay", { map: map });
    return;
  }
  if (a === "getCutting" && params.day) {
    const prev = await getSnapRaw_(env, "cutting:" + params.day);
    // struct d1-primary: не затирать план fromOrders GAS-ом (только row-map)
    if (
      isCuttingStructD1PrimaryCanon_(env) &&
      prev &&
      prev.fromOrders &&
      Array.isArray(prev.items) &&
      prev.items.length
    ) {
      try {
        if (Array.isArray(payload.items) && payload.items.length) {
          await rememberCuttingRows_(env, payload.items);
        }
      } catch (eRowsKeep) {}
      return;
    }
    let items = Array.isArray(payload.items) ? payload.items.slice() : [];
    // ops d1-primary: структура может из GAS, флаги всегда из D1 snap/table
    if (isOpsD1PrimaryCanon_(env) && prev && Array.isArray(prev.items) && prev.items.length) {
      items = mergeCuttingFlags_(items, prev.items, true);
      items = overlayCuttingKeepFlags_(items, prev.items, true);
    } else if (prev && Array.isArray(prev.items) && prev.items.length) {
      const touched = Number(prev.flagsTouchedAt || 0);
      const recent = !!(touched && Date.now() - touched < 600000);
      if (recent || cuttingFlagScore_(prev.items) >= cuttingFlagScore_(items)) {
        items = mergeCuttingFlags_(items, prev.items, true);
      }
    }
    try {
      const tbl = await loadCuttingFlagsTable_(env, params.day);
      items = overlayCuttingFlagsFromTable_(items, tbl);
    } catch (eTblCut) {}
    items = resolveCuttingSheetRows_(items, (prev && prev.items) || [], null);
    items = normalizeCuttingItems_(items);
    const body = Object.assign({}, payload, {
      items: items,
      fromGas: !isOpsD1PrimaryCanon_(env) && !isCuttingStructD1PrimaryCanon_(env),
      fromD1: !!(isOpsD1PrimaryCanon_(env) || isCuttingStructD1PrimaryCanon_(env)),
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
      const opsP = isOpsD1PrimaryCanon_(env);
      const recentC =
        opsP ||
        !!(Number(prevC.flagsTouchedAt || 0) && Date.now() - Number(prevC.flagsTouchedAt) < 600000);
      const by = indexByMatchAliases_(prevC.clients);
      payload.clients.forEach(function (c) {
        const old = lookupByMatchAliases_(by, c.matchKey || c.name);
        if (!old) return;
        if (recentC || opsP) {
          c.delivered = !!old.delivered;
          if (old.paid) c.paid = old.paid;
          if (old.assembled) c.assembled = true;
        } else {
          if (old.delivered) c.delivered = true;
          if (old.assembled) c.assembled = true;
        }
      });
      if (recentC || opsP) {
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
      const opsPa = isOpsD1PrimaryCanon_(env);
      const recentA =
        opsPa ||
        !!(Number(prevA.flagsTouchedAt || 0) && Date.now() - Number(prevA.flagsTouchedAt) < 600000);
      const byA = indexByMatchAliases_(prevA.clients);
      payload.clients.forEach(function (c) {
        const old = lookupByMatchAliases_(byA, c.matchKey || c.name);
        if (!old) return;
        if (recentA || opsPa) {
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
      if (recentA || opsPa) {
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
    // d1-primary: не затирать arrival/stock, которые только что писал D1
    if (isWarehouseD1PrimaryCanon_(env)) {
      try {
        const prevWh = await getSnapRaw_(env, "warehouse");
        if (prevWh) {
          payload = mergeWarehousePreserveD1_(prevWh, payload);
        }
      } catch (eWhMerge) {}
    }
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
    if (isMetaD1PrimaryCanon_(env)) {
      try {
        const prevT = await getSnapRaw_(env, "listTemplates:" + params.kind);
        if (prevT && Array.isArray(prevT.items) && prevT.items.length) return;
      } catch (eT) {}
    }
    await putSnap_(env, "listTemplates:" + params.kind, payload);
    return;
  }
  if (a === "listAccess" || a === "listSurvey" || a === "listTemplates") {
    if (isMetaD1PrimaryCanon_(env)) {
      try {
        const prevM = await getSnapRaw_(env, a);
        const arr =
          (prevM && (prevM.items || prevM.people || prevM.list || prevM.templates || prevM.surveys)) ||
          [];
        if (prevM && Array.isArray(arr) && arr.length) return;
      } catch (eMetaStore) {}
    }
  }
  if (a === "listDeferred") {
    // d1-primary: snap меняют только write-handlers; GAS не затирает D1
    if (isDeferredD1PrimaryCanon_(env)) {
      try {
        const prev = await getSnapRaw_(env, "listDeferred");
        if (prev && Array.isArray(prev.items) && prev.items.length) {
          const finalPrev = await finalizeListDeferredPayload_(env, prev);
          await putSnap_(env, "listDeferred", finalPrev);
          return;
        }
      } catch (ePrevDef) {}
      // cold-start: только если snap пуст — один раз принять GAS
    }
    // Критично: GAS/SWR без tid или до дописки строки затирали D1-задачи mode=transfer.
    // Клиента уже сняли с дня («Не получил») → человек «просто пропал».
    payload = await mergeListDeferredPayload_(env, payload);
    if (!payload) return;
    payload = await finalizeListDeferredPayload_(env, payload);
    await putSnap_(env, "listDeferred", payload);
    return;
  }
  if (a === "listSubscriptions") {
    // d1-primary: snap меняют только write/detail-merge; GAS не затирает D1
    if (isSubsD1PrimaryCanon_(env)) {
      try {
        const prevKeep = await getSnapRaw_(env, "listSubscriptions");
        if (prevKeep && Array.isArray(prevKeep.subscriptions) && prevKeep.subscriptions.length) {
          return;
        }
      } catch (ePrevSub) {}
      // cold-start: только если snap пуст — один раз принять GAS
    }
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
        const merged = keep.concat(enrichSubsPreserveDetail_(prevArr, add));
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
    const fullIncoming = enrichSubsPreserveDetail_(prevArr, incoming);
    await putSnap_(
      env,
      a,
      Object.assign({}, payload, {
        subscriptions: fullIncoming,
        count: fullIncoming.length,
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
async function upsertMissingClientsFromGas_(env, day, clients, opts) {
  opts = opts || {};
  if (!env || !env.DB || !day || !Array.isArray(clients) || !clients.length) return 0;
  await ensureMetaColumn_(env);
  const info = await dayDateInfo_(env, day);
  const dateIso = (info && info.iso) || "";
  const now = new Date().toISOString();
  const ignoreTombs = opts.ignoreTombstones === true;
  let tomb = { items: [] };
  if (!ignoreTombs) {
    tomb = (await getSnapRaw_(env, "deleteTombstones")) || { items: [] };
    tomb.items = (tomb.items || []).slice();
    try {
      const td = await getSnapRaw_(env, "tombDay:" + String(day));
      if (td && td.at && Date.now() - Number(td.at) < TOMBSTONE_MS) tomb._dayFresh = true;
    } catch (eTd) {}
  }
  let added = 0;
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    if (!c) continue;
    const name = String(c.name || c.client || "").trim();
    const mk = normalizeMatchKey_(c.matchKey || name);
    if (!mk || !name) continue;
    if (!ignoreTombs) {
      try {
        const pkT = await getSnapRaw_(env, "delTomb:" + String(day) + ":" + mk);
        if (pkT && pkT.mk && !pkT.cleared && Number(pkT.at || 0) > 0) tomb.items.push(pkT);
      } catch (ePK) {}
      if (isTombstoned_(tomb, day, mk, name)) continue;
    }
    try {
      const ep = await getSnapRaw_(env, "moveEpoch:" + mk);
      if (moveEpochHidesFromDay_(ep, day)) continue;
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

/** Активных заказов на дне в D1 (anti-wipe guard для week-close resync). */
async function countActiveOrdersForDay_(env, day) {
  if (!env || !env.DB || !day) return 0;
  try {
    const q = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM orders WHERE day_name = ? AND status = 'active'"
    )
      .bind(day)
      .first();
    return Number(q && q.n) || 0;
  } catch (eCnt) {
    return 0;
  }
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
  // gasAuthoritative: после finishFullWeek / force week sync — список GAS = правда дня.
  const gasAuthoritative = opts.gasAuthoritative === true;
  const allowGasInsert = opts.allowGasInsert === true || gasAuthoritative;

  let tomb = null;
  try {
    tomb = await getSnapRaw_(env, "deleteTombstones");
  } catch (eTombLoad) {
    tomb = null;
  }
  if (!tomb) tomb = { items: [] };
  tomb.items = (tomb.items || []).slice();
  // Heal пустого слота после finish: stale tomb не должен блокировать залитие с листа
  if (opts.ignoreTombstones === true) {
    tomb = { items: [] };
  } else {
    try {
      const td = await getSnapRaw_(env, "tombDay:" + String(day));
      if (td && td.at && Date.now() - Number(td.at) < TOMBSTONE_MS) {
        // маркер дня с недавним delete/move — не заливать GAS-only людей
        tomb._dayFresh = true;
      }
    } catch (eTd) {}
  }
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
    var mk = normalizeMatchKey_(c.matchKey || c.name || c.client || c.nick || "");
    if (!mk) continue;
    if (opts.ignoreTombstones !== true) {
      try {
        var pkT = await getSnapRaw_(env, "delTomb:" + String(day) + ":" + mk);
        if (pkT && pkT.mk && !pkT.cleared && Number(pkT.at || 0) > 0) tomb.items.push(pkT);
      } catch (ePKT) {}
      if (isTombstoned_(tomb, day, mk, c.name || c.client || c.nick)) continue;
      if (isMoveArriveProtectedElsewhere_(arriveProtect, day, mk, c.name || c.client || c.nick)) continue;
      try {
        var epRep = await getSnapRaw_(env, "moveEpoch:" + mk);
        if (moveEpochHidesFromDay_(epRep, day)) continue;
      } catch (eEpR) {}
    }
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
        if (moveEpochHidesFromDay_(epRow, day)) continue;
      } catch (eEpRow) {}
      if (opts.dropMks && (opts.dropMks[mk] || opts.dropMks[String(row.client || "").toLowerCase()])) {
        continue;
      }
      const gasC = gasByMk[mk];
      if (gasAuthoritative) {
        // после смены недели: GAS = структура дня, но свежие D1-записи (ещё не в листе) не сносим
        const updatedMsGa = Date.parse(String(row.updated_at || "")) || 0;
        const d1FreshGa = !!(protectMs > 0 && updatedMsGa && nowMs - updatedMsGa < protectMs);
        if (!gasC) {
          if (d1FreshGa) {
            const keptMiss = clientFromRow_(row);
            keptMiss.updated_at = row.updated_at;
            byMk[mk] = keptMiss;
          }
          continue;
        }
        if (d1FreshGa) {
          const keptGa = clientFromRow_(row);
          keptGa.updated_at = row.updated_at;
          // дата слота недели — с GAS, состав/контакт — свежий D1
          if (gasC.date) keptGa.date = gasC.date;
          if (gasC.dateIso) keptGa.dateIso = gasC.dateIso;
          byMk[mk] = keptGa;
        } else {
          byMk[mk] = gasC;
        }
        continue;
      }
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

  // КРИТ: не сжимать день пустым/частичным GAS (таймаут листа / stale sanitize).
  // Иначе casual week-refresh или finish с неполным getClients вайпает D1.
  const gasN = Object.keys(gasByMk).length;
  const mergedN = merged.length;
  if (gasAuthoritative && existingCount > 0) {
    if (gasN === 0) {
      // лист пуст/не ответил — только выровнять date_iso, людей не трогать
      try {
        if (info && info.iso) await scrubMismatchedDayOrders_(env, day, info.iso);
      } catch (eStamp0) {}
      return { aborted: true, reason: "gas_empty", existingCount: existingCount, gasN: 0 };
    }
    // merged сильно меньше D1 и меньше GAS — что-то отфильтровало (tomb/epoch); не day-wipe
    if (mergedN < existingCount && mergedN < gasN) {
      try {
        await upsertMissingClientsFromGas_(env, day, clients || [], { ignoreTombstones: true });
        if (info && info.iso) await scrubMismatchedDayOrders_(env, day, info.iso);
      } catch (ePart) {}
      return {
        aborted: true,
        reason: "partial_merge",
        existingCount: existingCount,
        gasN: gasN,
        mergedN: mergedN
      };
    }
  }

  // Точечный soft-delete: только тех, кого нет в merged (не вайп всего дня → race «все пропали»).
  const keepMks = Object.create(null);
  for (let ki = 0; ki < merged.length; ki++) {
    const cK = merged[ki];
    if (!cK) continue;
    const mkK = normalizeMatchKey_(cK.matchKey || cK.name || cK.client || cK.nick || "");
    if (mkK) keepMks[mkK] = true;
  }
  try {
    const qDel = await env.DB.prepare(
      "SELECT id, match_key, client, updated_at FROM orders WHERE day_name = ? AND status = 'active'"
    )
      .bind(day)
      .all();
    const toCheck = (qDel && qDel.results) || [];
    for (let di = 0; di < toCheck.length; di++) {
      const rowD = toCheck[di];
      if (!rowD) continue;
      const mkD = normalizeMatchKey_(rowD.match_key || rowD.client || "");
      if (mkD && keepMks[mkD]) continue;
      // свежий writeGuard / свежая запись — не сносить
      try {
        if (mkD) {
          const wg = await getSnapRaw_(env, "writeGuard:" + String(day) + ":" + mkD);
          if (wg && Date.now() - Number(wg.at || 0) < Math.max(protectMs, 3 * 60 * 1000)) continue;
        }
      } catch (eWg) {}
      const updatedMsD = Date.parse(String(rowD.updated_at || "")) || 0;
      if (protectMs > 0 && updatedMsD && nowMs - updatedMsD < protectMs) continue;
      try {
        await env.DB.prepare(
          "UPDATE orders SET status = 'deleted', updated_at = ? WHERE id = ? AND status = 'active'"
        )
          .bind(now, rowD.id)
          .run();
      } catch (eDelRow) {}
    }
  } catch (eDelScan) {
    // НЕ day-wide wipe: скан упал — abort, люди в D1 остаются
    return { aborted: true, reason: "del_scan_failed", existingCount: existingCount, gasN: gasN };
  }
  for (let i = 0; i < merged.length; i++) {
    const c = merged[i];
    const mk = normalizeMatchKey_(c.matchKey || c.name || c.client || c.nick || "");
    if (!mk) continue;
    if (opts.ignoreTombstones !== true && isTombstoned_(tomb, day, mk, c.name || c.client || c.nick)) {
      continue;
    }
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
      client: c.name || c.client || c.nick || "",
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
  return { aborted: false, existingCount: existingCount, gasN: gasN, mergedN: mergedN };
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

async function cutoverRefreshAllWeekDays_(env, opts) {
  opts = opts || {};
  if (!env || !env.DB) return;
  const gasAuth = isWeekD1GasAuthoritative_(env);
  if (opts.clearDayTombs) {
    for (let ti = 0; ti < WEEK_DAYS.length; ti++) {
      try {
        await putSnap_(env, "tombDay:" + WEEK_DAYS[ti], {
          day: WEEK_DAYS[ti],
          at: 0,
          cleared: true
        });
      } catch (eClrT) {}
    }
  }
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
        const gasList = Array.isArray(fresh.clients) ? fresh.clients : [];
        const d1Count = await countActiveOrdersForDay_(env, day);
        const gasN = gasList.length;
        let rep = null;
        if (gasAuth) {
          // GAS короче D1 — только upsert, без gas-authoritative replace (anti-shrink).
          if (d1Count > 0 && gasN < d1Count) {
            await upsertMissingClientsFromGas_(env, day, gasList, { ignoreTombstones: false });
            try {
              const infoDay = await dayDateInfo_(env, day);
              if (infoDay && infoDay.iso) await scrubMismatchedDayOrders_(env, day, infoDay.iso);
            } catch (eSt) {}
            try {
              await putSnap_(env, "clients:" + day, fresh);
            } catch (eS0) {}
            continue;
          }
          // После закрытия недели GAS = правда слота, но пустой/битый ответ не вайпает D1.
          rep = await replaceDayOrdersFromClients_(env, day, gasList, {
            gasAuthoritative: true,
            allowGasInsert: true,
            protectMs: 5 * 60 * 1000,
            skipProtectMissing: true,
            ignoreTombstones: true
          });
          if (rep && rep.aborted) {
            await upsertMissingClientsFromGas_(env, day, gasList, { ignoreTombstones: false });
            try {
              const infoDay = await dayDateInfo_(env, day);
              if (infoDay && infoDay.iso) await scrubMismatchedDayOrders_(env, day, infoDay.iso);
            } catch (eSt) {}
          }
        } else {
          await upsertMissingClientsFromGas_(env, day, gasList, { ignoreTombstones: true });
        }
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
    // нарезка: struct d1-primary → rebuild из orders; иначе живой GAS
    try {
      if (isCuttingStructD1PrimaryCanon_(env)) {
        await rebuildCuttingDay_(env, day);
        try {
          const cutGas = await gasProxy_("getCutting", { day: day }, env, { write: false });
          if (cutGas && Array.isArray(cutGas.items) && cutGas.items.length) {
            await rememberCuttingRows_(env, cutGas.items);
          }
        } catch (eRowsG) {}
      } else {
        const cut = await gasProxy_("getCutting", { day: day }, env, { write: false });
        if (cut && cut.status === "success") {
          await cutoverStoreRead_("getCutting", { day: day }, env, cut);
        }
      }
    } catch (eCut) {}
  }
  // даты уже из GAS weekDayCounts — не перетирать rebuild из старых order.date_iso
  try {
    const sheetCounts = await getSnapRaw_(env, "weekDayCountsSheet");
    if (sheetCounts && Array.isArray(sheetCounts.items) && sheetCounts.items.length) {
      await putSnap_(env, "weekDayCounts", sheetCounts);
      const dateToDay = Object.create(null);
      sheetCounts.items.forEach(function (it) {
        const iso = dmyToIso_(it && it.date);
        if (iso && it.day) dateToDay[iso] = it.day;
      });
      await putSnap_(env, "dateToDay", { map: dateToDay });
      // финальный stamp date_iso по слотам — даже если какой-то replace aborted
      try {
        await scrubAllDayDateMismatches_(env, sheetCounts);
      } catch (eScrubEnd) {}
    } else {
      await rebuildWeekCounts_(env);
    }
  } catch (eC) {}
}

async function cutoverAfterWrite_(a, params, env, writeRes) {
  try {
    if (isD1PrimaryCanon_(env)) return;
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
          try {
            var mo = String(dateIsos[0] || "").slice(0, 7);
            await rebuildMonthOverview_(env, /^\d{4}-\d{2}$/.test(mo) ? mo : undefined);
          } catch (eMo3) {}
        }
      }
    } catch (eCalAw) {}

    await Promise.all([
      cutoverRevalidate_("getWeekDayCounts", {}, env),
      cutoverRevalidate_("getWarehouse", {}, env),
      cutoverRevalidate_("getStats", {}, env)
    ]);
    if (/subscription/i.test(a)) {
      if (!isSubsD1PrimaryCanon_(env)) {
        await cutoverRevalidate_("listSubscriptions", {}, env);
      }
    }
    if (/deferred|remind|missed|transfer/i.test(a)) {
      if (!isDeferredD1PrimaryCanon_(env)) {
        await cutoverRevalidate_("listDeferred", params, env);
      }
    }
    if (/cutting|warehouse|composeWarehouse|setWarehouse/i.test(a)) {
      await cutoverRevalidate_("warehousePreview", {}, env);
    }
    if (/survey/i.test(a) && !/forceSurveyRemind/i.test(a)) {
      if (!isMetaD1PrimaryCanon_(env)) {
        await cutoverRevalidate_("listSurvey", { activeOnly: "1" }, env);
      }
    }
    if (/access|Access/i.test(a)) {
      if (!isMetaD1PrimaryCanon_(env)) {
        await cutoverRevalidate_("listAccess", {}, env);
      }
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
    const preferPostRead = /^(calcPrice|calcPpFact|getPpFactCost|migratePpToRaw26Scheme|getRetailPriceList)$/i.test(action);
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

function parseMaybeJson_(v) {
  if (v == null || v === "") return v;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch (eJ) {
    return v;
  }
}

function subscriptionSheetKey_(it) {
  return String((it && (it.sheet || it.segment || it.kind)) || "")
    .trim()
    .toUpperCase();
}

function subscriptionMatch_(it, nickKey, sheetWant, subId) {
  if (!it) return false;
  const n = normalizeMatchKey_(it.nick || it.name || it.label || "");
  const sid = String(it.subId || it.id || "").trim();
  const wantSid = String(subId || "").trim();
  if (wantSid && sid && sid === wantSid) {
    if (!sheetWant) return true;
    const sh = subscriptionSheetKey_(it);
    return !sh || sh === sheetWant;
  }
  if (!nickKey || n !== nickKey) return false;
  if (!sheetWant) return true;
  const sh = subscriptionSheetKey_(it);
  return !sh || sh === sheetWant;
}

/** При merge GAS→snap сохранить basket/detail из prev (list GAS без состава). */
function enrichSubsPreserveDetail_(prevArr, incoming) {
  const prev = Array.isArray(prevArr) ? prevArr : [];
  const add = Array.isArray(incoming) ? incoming : [];
  return add.map(function (s) {
    if (!s) return s;
    const nickKey = normalizeMatchKey_(s.nick || s.name || s.label || "");
    const sheetWant = subscriptionSheetKey_(s);
    const subId = String(s.subId || s.id || "").trim();
    let old = null;
    for (let i = 0; i < prev.length; i++) {
      if (subscriptionMatch_(prev[i], nickKey, sheetWant, subId)) {
        old = prev[i];
        break;
      }
    }
    if (!old) return s;
    const out = Object.assign({}, s);
    const richKeys = [
      "basket",
      "basketBp1",
      "basketBp2",
      "address",
      "phone",
      "note",
      "factCost",
      "statedCost",
      "calcFactCost",
      "coef",
      "scheme",
      "ppScheme",
      "packCounts",
      "dogName",
      "dogBreed",
      "dogWeight",
      "packagesByn",
      "xtraCount",
      "_d1Detail",
      "_savedAt"
    ];
    for (let k = 0; k < richKeys.length; k++) {
      const key = richKeys[k];
      const hasNew =
        out[key] != null &&
        out[key] !== "" &&
        !(Array.isArray(out[key]) && !out[key].length && Array.isArray(old[key]) && old[key].length);
      if (!hasNew && old[key] != null && old[key] !== "") out[key] = old[key];
    }
    return out;
  });
}

async function mergeSubscriptionDetailIntoSnap_(env, detail) {
  if (!env || !env.DB || !detail) return;
  let list = (await getSnapRaw_(env, "listSubscriptions")) || {
    status: "success",
    subscriptions: []
  };
  const arr = (list.subscriptions || list.items || []).slice();
  const nickKey = normalizeMatchKey_(detail.nick || detail.label || detail.name || "");
  const sheetWant = subscriptionSheetKey_(detail);
  const subId = String(detail.subId || "").trim();
  let idx = -1;
  for (let i = 0; i < arr.length; i++) {
    if (subscriptionMatch_(arr[i], nickKey, sheetWant, subId)) {
      idx = i;
      break;
    }
  }
  const merged = Object.assign({}, idx >= 0 ? arr[idx] : {}, detail, {
    _d1Detail: true,
    _savedAt: Date.now(),
    sheet: detail.sheet || (idx >= 0 && arr[idx].sheet) || sheetWant || "ПП",
    nick: detail.nick || (idx >= 0 && arr[idx].nick) || detail.label || ""
  });
  delete merged.action;
  delete merged.cutover;
  delete merged.fromGas;
  delete merged.fromD1;
  delete merged.sandbox;
  delete merged.subsCanon;
  delete merged.swr;
  if (idx >= 0) arr[idx] = merged;
  else arr.push(merged);
  list.subscriptions = arr;
  list.count = arr.length;
  list.status = "success";
  await putSnap_(env, "listSubscriptions", list);
}

async function getSubscription_(params, env) {
  const nick = String(params.nick || params.label || "").trim();
  const segment = String(params.segment || params.sheet || "").trim();
  const subId = String(params.subId || "").trim();
  const list = await getSnapRaw_(env, "listSubscriptions");
  const arr = (list && (list.subscriptions || list.items || list.list)) || [];
  const nickKey = normalizeMatchKey_(nick);
  const sheetWant = segment ? segment.toUpperCase() : "";
  let found = null;
  for (let i = 0; i < arr.length; i++) {
    if (subscriptionMatch_(arr[i], nickKey, sheetWant, subId)) {
      found = arr[i];
      break;
    }
  }
  if (!found) {
    return { status: "success", found: false, nick: nick, segment: segment };
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
    nick: nick || found.nick,
    segment: segment || found.sheet || "",
    sheet: found.sheet || segment || "",
    subStatus: found.status
  });
}

async function upsertSubscription_(params, env) {
  let list = (await getSnapRaw_(env, "listSubscriptions")) || {
    status: "success",
    subscriptions: []
  };
  const arr = (list.subscriptions || list.items || []).slice();
  const nick = String(params.nick || params.client || params.label || "").trim();
  const mk = normalizeMatchKey_(nick);
  const isMove =
    !!(params.toSheet && params.fromSheet) ||
    String(params.action || "").toLowerCase() === "movesubscription";
  const findSheet = String(
    (isMove ? params.fromSheet : params.sheet || params.segment) || ""
  )
    .trim()
    .toUpperCase();
  const toSheet = String(
    (isMove ? params.toSheet : params.sheet || params.segment || findSheet) || "ПП"
  ).trim() || "ПП";
  const subId = String(params.subId || "").trim();
  let idx = -1;
  for (let i = 0; i < arr.length; i++) {
    if (subscriptionMatch_(arr[i], mk, findSheet, subId)) {
      idx = i;
      break;
    }
  }
  const row = Object.assign({}, idx >= 0 ? arr[idx] : {}, params);
  delete row.action;
  delete row.fromSheet;
  delete row.toSheet;
  delete row._;
  delete row.callback;
  delete row.cutover;
  delete row.mode;
  row.nick = nick || (arr[idx] && arr[idx].nick) || "";
  row.label = String(params.label || row.label || row.nick).trim();
  row.sheet = toSheet;
  row.segment = toSheet;
  if (subId) row.subId = subId;
  else if (arr[idx] && arr[idx].subId) row.subId = arr[idx].subId;
  if (params.basket != null) row.basket = parseMaybeJson_(params.basket);
  if (params.packCounts != null) row.packCounts = parseMaybeJson_(params.packCounts);
  if (params.basketBp1 != null) row.basketBp1 = parseMaybeJson_(params.basketBp1);
  if (params.basketBp2 != null) row.basketBp2 = parseMaybeJson_(params.basketBp2);
  if (params.ppStatus) {
    row.status = params.ppStatus;
    row.stage = params.ppStatus;
  }
  row._d1Detail = true;
  row._savedAt = Date.now();
  if (idx >= 0) arr[idx] = row;
  else arr.push(row);
  list.subscriptions = arr;
  list.count = arr.length;
  list.status = "success";
  await putSnap_(env, "listSubscriptions", list);
  return {
    status: "success",
    wrote: 1,
    nick: row.nick,
    label: row.label,
    subId: row.subId || "",
    sheet: row.sheet,
    deliveries: row.deliveries,
    statusText: row.status || row.stage || "",
    wishes: row.wishes || "",
    d1Verified: true
  };
}

async function deleteSubscription_(params, env) {
  let list = (await getSnapRaw_(env, "listSubscriptions")) || { status: "success", subscriptions: [] };
  let arr = (list.subscriptions || list.items || []).slice();
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
      params.label ? [params.label] : [],
      params.ids || []
    )
    .map(String)
    .filter(Boolean);
  const keys = nicks.map(normalizeMatchKey_);
  const subId = String(params.subId || "").trim();
  if (!keys.length && !subId && !items.length) {
    return { status: "error", message: "need_nick" };
  }
  const before = arr.length;
  const sheetWant = String(params.sheet || params.segment || "").trim().toUpperCase();
  arr = arr.filter(function (it) {
    const k = normalizeMatchKey_(it.nick || it.name || it.label || it.subId || it.id);
    const sid = String(it.subId || it.id || "").trim();
    let hit = false;
    if (subId && sid && sid === subId) hit = true;
    if (!hit && keys.length && keys.indexOf(k) >= 0) hit = true;
    if (!hit && items.length) {
      for (let ii = 0; ii < items.length; ii++) {
        const itm = items[ii];
        if (typeof itm === "string") continue;
        const ink = normalizeMatchKey_((itm && (itm.nick || itm.label)) || "");
        const isid = String((itm && itm.subId) || "").trim();
        const ish = String((itm && (itm.sheet || itm.segment)) || "")
          .trim()
          .toUpperCase();
        if (isid && sid && isid === sid) {
          hit = !ish || !subscriptionSheetKey_(it) || ish === subscriptionSheetKey_(it);
          if (hit) break;
        }
        if (ink && ink === k) {
          hit = !ish || !subscriptionSheetKey_(it) || ish === subscriptionSheetKey_(it);
          if (hit) break;
        }
      }
    }
    if (!hit) return true;
    if (!sheetWant) return false;
    const sh = subscriptionSheetKey_(it);
    return sh && sh !== sheetWant;
  });
  list.subscriptions = arr;
  list.count = arr.length;
  await putSnap_(env, "listSubscriptions", list);
  return { status: "success", wrote: before - arr.length, deletedPeople: before - arr.length };
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
  let res;
  if (action === "deleteTemplate") res = await deleteFromList_(env, kind, "items", params, "id");
  else res = await upsertInList_(env, kind, "items", params, "id");
  if (res && res.status === "success") {
    res.sandbox = false;
    res.d1Verified = true;
  }
  return res;
}

async function mutateAccess_(action, params, env) {
  let list = (await getSnapRaw_(env, "listAccess")) || { status: "success", people: [] };
  let people = (list.people || []).slice();
  const tid = String(params.telegramId || params.id || "");
  let idx = -1;
  for (let i = 0; i < people.length; i++) {
    if (String(people[i].telegramId) === tid) {
      idx = i;
      break;
    }
  }
  if (action === "requestAccess") {
    if (idx < 0) {
      people.push({
        telegramId: tid,
        name: params.name || "",
        role: "pending",
        status: "pending"
      });
    }
  } else if (idx >= 0) {
    if (params.role != null) people[idx].role = params.role;
    if (params.timezone != null) people[idx].timezone = params.timezone;
    if (params.status != null) people[idx].status = params.status;
  } else if (tid && params.role != null) {
    people.push({
      telegramId: tid,
      name: params.name || "",
      role: params.role,
      timezone: params.timezone || "",
      status: "active"
    });
  }
  list.people = people;
  list.status = "success";
  await putSnap_(env, "listAccess", list);
  if (tid) {
    try {
      const person = people.find(function (p) {
        return String(p.telegramId) === tid;
      });
      if (person) {
        await putSnap_(env, "access:" + tid, {
          status: "success",
          telegramId: tid,
          name: person.name || "",
          role: person.role || "",
          access: person.status === "pending" ? "pending" : "active",
          timezone: person.timezone || "",
          cachedAt: new Date().toISOString()
        });
      }
    } catch (eAcc) {}
  }
  return { status: "success", wrote: 1, telegramId: tid, d1Verified: true };
}

async function setWarehouseArrival_(params, env) {
  let wh = (await getSnapRaw_(env, "warehouse")) || { status: "success", rows: [], items: [] };
  const items = (wh.rows || wh.items || []).slice();
  const row = Number(params.row);
  const qty = Number(params.qty != null ? params.qty : params.arrival) || 0;
  if (!(row >= 2)) {
    return { status: "error", message: "bad_row", row: row };
  }
  let hit = false;
  for (let i = 0; i < items.length; i++) {
    if (Number(items[i].row) === row) {
      items[i] = Object.assign({}, items[i], {
        arrival: qty,
        _d1ArrivalAt: Date.now()
      });
      hit = true;
      break;
    }
  }
  if (!hit) {
    items.push({
      row: row,
      name: String(params.name || ""),
      arrival: qty,
      stock: 0,
      coef: 0,
      _d1ArrivalAt: Date.now()
    });
  }
  wh.rows = items;
  wh.items = items;
  wh.status = "success";
  wh._d1TouchedAt = Date.now();
  await putSnap_(env, "warehouse", wh);
  return { status: "success", wrote: 1, row: row, arrival: qty, d1Verified: true };
}

function warehouseRows_(wh) {
  if (!wh) return [];
  return (wh.rows || wh.items || []).slice();
}

/** GAS getWarehouse не должен откатывать свежие D1 arrival/stock. */
function mergeWarehousePreserveD1_(prevWh, gasPayload) {
  const prevRows = warehouseRows_(prevWh);
  const gasRows = warehouseRows_(gasPayload);
  if (!prevRows.length) return gasPayload;
  const byRow = Object.create(null);
  prevRows.forEach(function (r) {
    if (r && r.row != null) byRow[Number(r.row)] = r;
  });
  const touched = Number((prevWh && prevWh._d1TouchedAt) || 0);
  const freshMs = 15 * 60 * 1000;
  const outRows = gasRows.map(function (g) {
    const p = byRow[Number(g.row)];
    if (!p) return g;
    const out = Object.assign({}, g);
    const pArrAt = Number(p._d1ArrivalAt || touched || 0);
    if (pArrAt && Date.now() - pArrAt < freshMs && p.arrival != null) {
      out.arrival = p.arrival;
      out._d1ArrivalAt = pArrAt;
    }
    const pStAt = Number(p._d1StockAt || 0);
    if (pStAt && Date.now() - pStAt < freshMs && p.stock != null) {
      out.stock = p.stock;
      out._d1StockAt = pStAt;
      if (p.arrival === 0 || p.arrival === "0") out.arrival = 0;
    }
    return out;
  });
  // строки только в D1 (ещё не в GAS ответе)
  prevRows.forEach(function (p) {
    if (!p || p.row == null) return;
    if (!outRows.some(function (g) {
      return Number(g.row) === Number(p.row);
    })) {
      outRows.push(p);
    }
  });
  const out = Object.assign({}, gasPayload, {
    rows: outRows,
    items: outRows,
    _d1TouchedAt: touched || gasPayload._d1TouchedAt
  });
  return out;
}

async function applyWarehouseRevisionD1_(params, env) {
  let wh = (await getSnapRaw_(env, "warehouse")) || { status: "success", rows: [], items: [] };
  let items = warehouseRows_(wh);
  let rev = params.items || params.rows || params.revisions || [];
  if (typeof rev === "string") {
    try {
      rev = JSON.parse(rev);
    } catch (eJ) {
      rev = [];
    }
  }
  if (!Array.isArray(rev)) rev = [];
  const now = Date.now();
  const updated = [];
  for (let i = 0; i < rev.length; i++) {
    const it = rev[i] || {};
    let row = Number(it.row) || 0;
    const qty = Number(it.qty != null ? it.qty : it.stock) || 0;
    const nameKey = String(it.name || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
    let idx = -1;
    for (let j = 0; j < items.length; j++) {
      if (row >= 2 && Number(items[j].row) === row) {
        idx = j;
        break;
      }
      if (
        nameKey &&
        String(items[j].name || "")
          .trim()
          .toUpperCase()
          .replace(/\s+/g, " ") === nameKey
      ) {
        idx = j;
        row = Number(items[j].row) || row;
        break;
      }
    }
    if (idx < 0 && row >= 2) {
      items.push({ row: row, name: it.name || "", stock: qty, arrival: 0, _d1StockAt: now });
      updated.push({ row: row, qty: qty });
      continue;
    }
    if (idx < 0) continue;
    items[idx] = Object.assign({}, items[idx], {
      stock: qty,
      arrival: 0,
      _d1StockAt: now,
      _d1ArrivalAt: now
    });
    updated.push({ row: Number(items[idx].row), qty: qty });
  }
  wh.rows = items;
  wh.items = items;
  wh.status = "success";
  wh._d1TouchedAt = now;
  await putSnap_(env, "warehouse", wh);
  return { status: "success", wrote: updated.length, updated: updated, d1Verified: true };
}

async function zeroWarehouseD1_(params, env) {
  let wh = (await getSnapRaw_(env, "warehouse")) || { status: "success", rows: [], items: [] };
  const items = warehouseRows_(wh).map(function (r) {
    return Object.assign({}, r, {
      stock: 0,
      arrival: 0,
      weekStart: 0,
      asOfStock: 0,
      _d1StockAt: Date.now(),
      _d1ArrivalAt: Date.now()
    });
  });
  wh.rows = items;
  wh.items = items;
  wh.status = "success";
  wh._d1TouchedAt = Date.now();
  await putSnap_(env, "warehouse", wh);
  return { status: "success", wrote: items.length, zeroed: true, d1Verified: true };
}

function isRetailCalcMode_(params) {
  const m = String((params && params.mode) || "").toLowerCase();
  // mode=live/sandbox/cutover — флаги Worker, не режим calc
  if (!m || m === "live" || m === "sandbox" || m === "cutover") return false;
  return m.indexOf("розн") >= 0 || m === "retail";
}

function retailMapFromItemsD1_(items) {
  const map = Object.create(null);
  (items || []).forEach(function (it) {
    if (!it || !it.key) return;
    const kind = String(it.kind || "per100").toLowerCase();
    const price = Number(it.price);
    if (!isFinite(price) || price < 0) return;
    if (kind === "perpiece" || kind === "piece" || kind === "шт") map[it.key] = { perPiece: price };
    else if (kind === "pack" || kind === "packs") map[it.key] = { per100: price, packs: { "100": price } };
    else map[it.key] = { per100: price };
  });
  return map;
}

function retailItemsFromMapD1_(map) {
  const items = [];
  Object.keys(map || {})
    .sort()
    .forEach(function (key) {
      const info = map[key] || {};
      if (info.perPiece != null) items.push({ key: key, kind: "perPiece", price: Number(info.perPiece) || 0 });
      else if (info.packs && info.packs["100"] != null) {
        items.push({
          key: key,
          kind: "pack",
          price: Number(info.packs["100"]) || Number(info.per100) || 0
        });
      } else items.push({ key: key, kind: "per100", price: Number(info.per100) || 0 });
    });
  return items;
}

function retailNormalizeNameD1_(name) {
  const n = String(name || "").trim();
  const u = n
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/\s+/g, " ");
  const aliases = {
    ЛЕГКОЕ: "ЛЁГКОЕ",
    "БАРАНЬЕ ЛЕГКОЕ": "БАРАНЬЕ ЛЁГКОЕ",
    "КРОШКА ЛЕГКОГО": "КРОШКА ЛЁГКОГО",
    "ПЕРЕПЕЛКИ ШТ.": "ПЕРЕПЁЛКИ шт.",
    "ПЕРЕПЕЛКИ ШТ": "ПЕРЕПЁЛКИ шт.",
    "КОПЫТО ШТ.": "КОПЫТО шт.",
    "КОЛЕНИ ШТ.": "КОЛЕНИ шт.",
    "НОСЫ ШТ.": "НОСЫ шт.",
    "ЛОП ХРЯЩ ШТ.": "ЛОП ХРЯЩ шт.",
    "УТИНЫЕ ШЕИ ШТ.": "УТИНЫЕ ШЕИ шт.",
    "ГУБЫ ШТ.": "ГУБЫ шт.",
    "ГУБЫ ШТ": "ГУБЫ шт.",
    КАБАЧКИ: "КАБАЧОК",
    ГРУШЫ: "ГРУШИ",
    "РУБЕЦ С": "СВЕТЛЫЙ РУБЕЦ"
  };
  if (aliases[u]) return aliases[u];
  if (u.indexOf("КРОШКА РУБ") === 0) return "КРОШКА РУБЕЦ";
  return n;
}

function retailNormalizeSubD1_(name, sub) {
  const s = String(sub || "").trim();
  if (!s) return "";
  const u = s
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/\s+/g, " ");
  const n = String(name || "").toUpperCase();
  if (/БЫЧИЙ КОРЕН|ТРАХЕ|СТАНОВ/.test(n)) {
    if (/ОЧЕНЬ\s*МАЛ|ОЧ\s*МАЛ|СУПЕР/.test(u)) return "ОЧ МАЛ";
    if (/ОГРОМ|РОГАЛ|ОГР/.test(u)) return "ОГР";
    if (/БОЛЬШ|БОЛ/.test(u)) return "БОЛ";
    if (/СРЕД/.test(u)) return /ПАЛ/.test(u) ? "ПАЛК" : "СРЕД";
    if (/ПАЛОЧ|ПАЛК/.test(u)) return "ПАЛК";
    if (/ПЛАСТ/.test(u)) return "ПЛАСТ";
    if (/МАЛ/.test(u)) return "МАЛ";
  }
  if (/УХО|УШК/.test(n)) return /ПОЛОВИН/.test(u) ? "ПОЛОВИНКА" : "Обычное";
  if (/АОРТ/.test(n)) return /ПОЛОВИН/.test(u) ? "ПОЛОВИНКА" : "Обычная";
  if (/МЕЛК/.test(u)) return "Мелкое";
  if (/СРЕД|КУСОЧ|КУБИК/.test(u) && !/МЕЛК|БОЛЬШ|ЦЕЛ|ЛОМТ|ПОЛОСК/.test(u)) return "Среднее";
  if (/КРУПН/.test(u)) return "Крупное";
  if (/БОЛЬШ|ПОЛОСК/.test(u)) return "Большое";
  if (/ЦЕЛ|ЛОМТ/.test(u)) return "Целое";
  return s;
}

function retailLineCostD1_(map, name, sub, val, cat) {
  const n = retailNormalizeNameD1_(name);
  const s = retailNormalizeSubD1_(n, sub);
  const key = n + (s ? "|" + s : "");
  const info = (map && (map[key] || map[n])) || null;
  const v = Number(val) || 0;
  if (!info || v <= 0) return { cost: 0, per: 0, found: !!info };
  if (info.packs) {
    const g = String(Math.round(v));
    if (info.packs[g] != null) return { cost: Number(info.packs[g]), per: Number(info.packs[g]), found: true };
    const p100 = info.packs["100"] != null ? Number(info.packs["100"]) : Number(info.per100 || 0);
    const c = p100 * (v / 100);
    return { cost: Math.round(c * 100) / 100, per: p100, found: true };
  }
  if (info.perPiece != null || String(cat || "") === "chew" || String(cat || "") === "chews" || /шт/i.test(n)) {
    const pp = Number(info.perPiece || 0);
    return { cost: Math.round(pp * v * 100) / 100, per: pp, found: true };
  }
  const p = Number(info.per100 || 0);
  return { cost: Math.round((v / 100) * p * 100) / 100, per: p, found: true };
}

async function actorIsOwnerRetail_(params, env) {
  const tid = String((params && (params.telegramId || params.actorId)) || "").trim();
  if (!tid) return false;
  try {
    const acc = await getSnapRaw_(env, "access:" + tid);
    if (acc && /^(owner|all)$/i.test(String(acc.role || ""))) return true;
  } catch (eA) {}
  try {
    const list = await getSnapRaw_(env, "listAccess");
    const people = (list && list.people) || [];
    for (let i = 0; i < people.length; i++) {
      if (
        String(people[i].telegramId) === tid &&
        /^(owner|all)$/i.test(String(people[i].role || ""))
      ) {
        return true;
      }
    }
  } catch (eL) {}
  return false;
}

async function ensureRetailPricesSnap_(env, ctx) {
  let snap = await getSnapRaw_(env, "retailPrices");
  if (snap && snap.status === "success" && Array.isArray(snap.items) && snap.items.length) return snap;
  const live = await gasProxy_("getRetailPriceList", {}, env, { write: false });
  if (live && live.status === "success" && Array.isArray(live.items) && live.items.length) {
    snap = Object.assign({}, live, { cachedAt: new Date().toISOString(), fromGas: true });
    try {
      await putSnap_(env, "retailPrices", snap);
    } catch (eS) {}
    return snap;
  }
  return snap || null;
}

async function getRetailPriceListD1_(params, env, ctx) {
  const force =
    String((params && params.force) || "") === "1" ||
    (params && (params.force === true || params.force === 1));
  if (!force) {
    const snap = await getSnapRaw_(env, "retailPrices");
    if (snap && snap.status === "success" && Array.isArray(snap.items) && snap.items.length) {
      return Object.assign({}, snap, {
        cutover: true,
        fromD1: true,
        fromGas: false,
        sandbox: false,
        priceCanon: "d1-primary",
        d1Verified: true
      });
    }
  }
  const live = await gasProxy_("getRetailPriceList", params || {}, env, { write: false });
  if (live && live.status === "success") {
    try {
      await putSnap_(env, "retailPrices", Object.assign({}, live, { cachedAt: new Date().toISOString() }));
    } catch (e) {}
    live.cutover = true;
    live.fromGas = true;
    live.fromD1 = false;
    live.sandbox = false;
    live.priceCanon = "d1-primary";
    return live;
  }
  const fallback = await getSnapRaw_(env, "retailPrices");
  if (fallback && fallback.status === "success") {
    return Object.assign({}, fallback, {
      cutover: true,
      fromD1: true,
      sandbox: false,
      priceCanon: "d1-primary"
    });
  }
  return { status: "error", message: "gas_proxy_failed", cutover: true, action: "getRetailPriceList" };
}

async function saveRetailPricesD1_(params, env) {
  let items = params.items;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch (eJ) {
      items = null;
    }
  }
  if (!items || !items.length) return { status: "error", message: "need_items" };
  const map = retailMapFromItemsD1_(items);
  if (!Object.keys(map).length) return { status: "error", message: "empty_map" };
  let delIn = params.delivery || {};
  if (typeof delIn === "string") {
    try {
      delIn = JSON.parse(delIn);
    } catch (eD) {
      delIn = {};
    }
  }
  const prev = (await getSnapRaw_(env, "retailPrices")) || {};
  const prevDel = (prev && prev.delivery) || { fee: 9, freeFrom: 80 };
  const delivery = {
    fee: delIn.fee != null ? Number(delIn.fee) : Number(prevDel.fee) || 9,
    freeFrom: delIn.freeFrom != null ? Number(delIn.freeFrom) : Number(prevDel.freeFrom) || 80
  };
  const outItems = retailItemsFromMapD1_(map);
  const body = {
    status: "success",
    version: "retail-d1",
    items: outItems,
    delivery: delivery,
    saved: outItems.length,
    cachedAt: new Date().toISOString(),
    _d1SavedAt: Date.now()
  };
  await putSnap_(env, "retailPrices", body);
  return {
    status: "success",
    items: outItems,
    delivery: delivery,
    saved: outItems.length,
    d1Verified: true
  };
}



/** stamp [SCHEME:RAW26] into wishes string (mirror GAS). */
function stampPpSchemeIntoWishesD1_(wishes, scheme) {
  const base = String(wishes || "")
    .replace(/\[SCHEME:[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const sch = String(scheme || "").trim().toUpperCase();
  if (!sch) return base;
  const tag = "[SCHEME:" + sch + "]";
  return (base + (base ? " " : "") + tag).trim();
}

function stampPpCoefIntoWishesD1_(wishes, coef) {
  const c = Number(coef);
  if (!isFinite(c) || c <= 0) return String(wishes || "");
  const base = String(wishes || "")
    .replace(/\[COEF:[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const tag = "[COEF:" + c + "]";
  return (base + (base ? " " : "") + tag).trim();
}

async function getPpFactCostD1_(params, env, ctx) {
  const force =
    String((params && params.force) || "") === "1" ||
    (params && (params.force === true || params.force === 1));
  const nick = String((params && (params.nick || params.client || params.name)) || "").trim();
  async function fromGas_() {
    const live = await gasProxy_("getPpFactCost", params || {}, env, { write: false });
    if (live && live.status === "success" && env && env.DB && nick) {
      try {
        await mergeSubscriptionDetailIntoSnap_(env, {
          nick: live.nick || nick,
          sheet: "ПП",
          factCost: live.factCost,
          deliveries: live.deliveries,
          ppSlot: live.ppSlot,
          deliverySlot: live.deliverySlot,
          needManualSlot: live.needManualSlot,
          suggestedSlot: live.suggestedSlot
        });
      } catch (eM) {}
    }
    if (live && typeof live === "object") {
      live.cutover = true;
      live.fromGas = true;
      live.fromD1 = false;
      live.sandbox = false;
      live.priceCanon = "d1-primary";
    }
    return live;
  }
  if (force || !nick) return (await fromGas_()) || { status: "error", message: "need_nick", cutover: true };

  let local = null;
  try {
    local = await getSubscription_(
      { nick: nick, sheet: "ПП", segment: "ПП", subId: (params && params.subId) || "" },
      env
    );
  } catch (eL) {}

  const hasFact =
    local &&
    local.found &&
    local.factCost != null &&
    local.factCost !== "";
  const hasDeliv = local && local.found && local.deliveries != null && local.deliveries !== "";
  if (hasFact || hasDeliv) {
    const deliveries = Math.max(0, Number(local.deliveries) || 0);
    const factRaw = local.factCost;
    const factCost =
      factRaw == null || factRaw === ""
        ? null
        : Number(String(factRaw).replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
    const out = {
      status: "success",
      nick: local.nick || nick,
      factCost: factCost,
      deliveries: deliveries,
      deliverySlot: Number(local.deliverySlot || local.suggestedSlot) || 1,
      needManualSlot: deliveries >= 2 ? !!local.needManualSlot || local.needManualSlot == null : false,
      ppSlot: local.ppSlot || "",
      suggestedSlot: Number(local.suggestedSlot || local.deliverySlot) || 1,
      cutover: true,
      fromD1: true,
      fromGas: false,
      sandbox: false,
      priceCanon: "d1-primary",
      d1Verified: true
    };
    // N≥2 без явного слота в snap — безопаснее спросить / добрать GAS в фоне
    if (deliveries >= 2 && (local.needManualSlot == null || local.ppSlot == null || local.ppSlot === "")) {
      out.needManualSlot = true;
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(
          fromGas_().catch(function () {
            return null;
          })
        );
      }
    }
    return out;
  }
  return (await fromGas_()) || { status: "error", message: "gas_proxy_failed", cutover: true, action: "getPpFactCost" };
}


function ppBasketItemKeyD1_(it) {
  const cat = String((it && it.cat) || "").trim().toLowerCase();
  const name = String((it && (it.main || it.name)) || "")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е");
  const sub = String((it && it.sub) || "")
    .trim()
    .toUpperCase()
    .replace(/Ё/g, "Е");
  return cat + "|" + name + "|" + sub;
}

function isPpChewItemD1_(it) {
  const cat = String((it && it.cat) || "").toLowerCase();
  if (cat === "chews" || cat === "chew") return true;
  if (cat === "dressura") return false;
  const name = String((it && (it.main || it.name)) || "");
  return /шт\.?|колен|копыт|нос|ухо|уши|шея|хрящ|лоп|хвост|рога?|сустав|быч|трахе|аорт|станова|переп|губ|утин/i.test(
    name
  );
}

function clonePpBasketD1_(list) {
  const out = [];
  for (let i = 0; i < (list || []).length; i++) {
    const it = list[i] || {};
    const v = Number(it.value != null ? it.value : it.val) || 0;
    if (v <= 0) continue;
    out.push({
      cat: it.cat || (isPpChewItemD1_(it) ? "chews" : "dressura"),
      main: it.main || it.name || "",
      name: it.name || it.main || "",
      sub: it.sub || "",
      value: v,
      val: v
    });
  }
  return out;
}

function splitQtyForPpSlotD1_(qty, isChew, slot) {
  const v = Number(qty) || 0;
  if (v <= 0) return 0;
  let first = isChew ? Math.ceil(v / 2) : Math.floor(v / 2);
  if (first <= 0 && v > 0) first = v;
  if (slot <= 1) return first;
  return Math.max(0, v - first);
}

function remainderPpBasketD1_(monthly, delivered) {
  const left = Object.create(null);
  const meta = Object.create(null);
  let i;
  for (i = 0; i < (monthly || []).length; i++) {
    const m = monthly[i] || {};
    const k = ppBasketItemKeyD1_(m);
    const v = Number(m.value != null ? m.value : m.val) || 0;
    left[k] = (left[k] || 0) + v;
    if (!meta[k]) meta[k] = m;
  }
  for (i = 0; i < (delivered || []).length; i++) {
    const d = delivered[i] || {};
    const kd = ppBasketItemKeyD1_(d);
    const vd = Number(d.value != null ? d.value : d.val) || 0;
    left[kd] = (left[kd] || 0) - vd;
  }
  const out = [];
  Object.keys(left).forEach(function (key) {
    const rem = left[key];
    if (!(rem > 0)) return;
    const src = meta[key] || {};
    out.push({
      cat: src.cat || "dressura",
      main: src.main || src.name || "",
      name: src.name || src.main || "",
      sub: src.sub || "",
      value: rem,
      val: rem
    });
  });
  return out;
}

function proposePpSlotBasketD1_(monthly, slot, deliveriesN, slot1Basket) {
  const full = clonePpBasketD1_(monthly);
  if (!full.length) return [];
  if (!(Number(deliveriesN) >= 2)) return full;
  const s = Number(slot) || 1;
  if (s >= 2 && slot1Basket && slot1Basket.length) {
    return remainderPpBasketD1_(full, slot1Basket);
  }
  const out = [];
  for (let i = 0; i < full.length; i++) {
    const it = full[i];
    const chew = isPpChewItemD1_(it);
    const part = splitQtyForPpSlotD1_(it.value, chew, s <= 1 ? 1 : 2);
    if (part <= 0) continue;
    out.push({
      cat: it.cat,
      main: it.main,
      name: it.name,
      sub: it.sub,
      value: part,
      val: part
    });
  }
  return out;
}

function parseForcedPpSlotD1_(raw, deliveriesN) {
  if (raw == null || raw === "") return 0;
  const s = String(raw).trim();
  const m = s.match(/(\d+)/);
  const n = m ? Number(m[1]) : Number(s);
  if (!isFinite(n) || n < 1) return 0;
  const max = Math.max(1, Number(deliveriesN) || 1);
  return Math.min(max, Math.floor(n));
}

function formatPpSlotLabelD1_(slot, deliveriesN) {
  const s = Number(slot) || 1;
  const n = Math.max(1, Number(deliveriesN) || 1);
  if (n <= 1) return String(s);
  return s + "/" + n;
}

function resolveAsOfIsoD1_(params) {
  const raw = String((params && (params.date || params.deliveryDate || params.dateIso)) || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (raw) {
    const iso = dmyToIso_(raw);
    if (iso) return iso;
  }
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Minsk",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

async function hasPpSlotAnchorD1_(env, matchKey) {
  if (!env || !matchKey) return false;
  try {
    const a = await getSnapRaw_(env, "ppSlotAnchor:" + matchKey);
    if (a && (a.mk || a.at || a.slot)) return true;
  } catch (e) {}
  return false;
}

async function countPpPriorDeliveriesMonthD1_(env, nick, matchKey, asOfIso) {
  if (!env || !env.DB || !asOfIso) return { count: 0, slot1Basket: [], lastSlot: 0, lastDate: "" };
  const ym = asOfIso.slice(0, 7);
  const mk = matchKey || normalizeMatchKey_(nick);
  const nickL = String(nick || "").toLowerCase();
  const seen = Object.create(null);
  let slot1Basket = [];
  let lastSlot = 0;
  let lastDate = "";
  try {
    const q = await env.DB.prepare(
      `SELECT date_iso, segment, source, basket_json, meta_json FROM orders
       WHERE status = 'active' AND date_iso != '' AND date_iso LIKE ? AND date_iso < ?
         AND (match_key = ? OR lower(client) = ?)
       ORDER BY date_iso ASC LIMIT 60`
    )
      .bind(ym + "%", asOfIso, mk, nickL)
      .all();
    const rows = (q && q.results) || [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const seg = String(r.segment || "").toUpperCase();
      const src = String(r.source || "").toLowerCase();
      const meta = parseMeta_(r.meta_json);
      const slotMeta = String(meta.ppSlot || meta.deliverySlot || "").trim();
      let isPp =
        seg === "ПП" ||
        seg === "PP" ||
        seg === "АФК" ||
        src === "pp" ||
        src === "subscription" ||
        !!slotMeta;
      if (!isPp) continue;
      const di = String(r.date_iso || "");
      if (!di || seen[di]) continue;
      seen[di] = true;
      const forced = parseForcedPpSlotD1_(slotMeta, 2);
      if (forced >= 1) {
        lastSlot = forced;
        lastDate = di;
      }
      if (forced === 1 || (!slot1Basket.length && Object.keys(seen).length === 1)) {
        try {
          const b = JSON.parse(r.basket_json || "[]");
          if (Array.isArray(b) && b.length) slot1Basket = clonePpBasketD1_(b);
        } catch (eB) {}
      }
    }
  } catch (eO) {}
  // delivered flags same month before asOf
  try {
    const dq = await env.DB.prepare(
      `SELECT date_iso FROM deliveries WHERE delivered = 1 AND date_iso LIKE ? AND date_iso < ?
         AND (match_key = ? OR lower(match_key) = ?) LIMIT 40`
    )
      .bind(ym + "%", asOfIso, mk, nickL)
      .all();
    ((dq && dq.results) || []).forEach(function (r) {
      const di = String(r.date_iso || "");
      if (di) seen[di] = true;
    });
  } catch (eD) {}
  return {
    count: Object.keys(seen).length,
    slot1Basket: slot1Basket,
    lastSlot: lastSlot,
    lastDate: lastDate
  };
}

async function lookupStoredPpSlotDateD1_(env, nick, matchKey, dateIso) {
  if (!env || !env.DB || !dateIso) return 0;
  const mk = matchKey || normalizeMatchKey_(nick);
  const nickL = String(nick || "").toLowerCase();
  try {
    const q = await env.DB.prepare(
      `SELECT meta_json FROM orders WHERE status = 'active' AND date_iso = ?
         AND (match_key = ? OR lower(client) = ?) LIMIT 5`
    )
      .bind(dateIso, mk, nickL)
      .all();
    const rows = (q && q.results) || [];
    for (let i = 0; i < rows.length; i++) {
      const meta = parseMeta_(rows[i].meta_json);
      const forced = parseForcedPpSlotD1_(meta.ppSlot || meta.deliverySlot, 2);
      if (forced >= 1) return forced;
    }
  } catch (e) {}
  return 0;
}

async function getPpOrderSuggestD1_(params, env, ctx) {
  const force =
    String((params && params.force) || "") === "1" ||
    (params && (params.force === true || params.force === 1));
  const nick = String((params && (params.nick || params.client)) || "").trim();
  async function fromGas_() {
    const live = await gasProxy_("getPpOrderSuggest", params || {}, env, { write: false });
    if (live && live.status === "success" && env && env.DB) {
      try {
        await mergeSubscriptionDetailIntoSnap_(
          env,
          Object.assign({}, live, {
            nick: live.nick || nick,
            sheet: live.sheet || "ПП",
            basket: live.monthlyBasket || live.proposedBasket || live.basket,
            factCost: live.factCost,
            deliveries: live.deliveriesN != null ? live.deliveriesN : live.deliveries,
            needManualSlot: live.needManualSlot,
            ppSlot: live.ppSlot,
            deliverySlot: live.deliverySlot,
            suggestedSlot: live.suggestedSlot,
            hasPpSlotAnchor: live.hasPpSlotAnchor
          })
        );
        if (live.hasPpSlotAnchor) {
          const mk = normalizeMatchKey_(live.nick || nick);
          if (mk) {
            await putSnap_(env, "ppSlotAnchor:" + mk, {
              mk: mk,
              nick: live.nick || nick,
              slot: live.deliverySlot || live.ppSlot || 1,
              at: Date.now(),
              fromGas: true
            });
          }
        }
      } catch (eM) {}
    }
    if (live && typeof live === "object") {
      live.cutover = true;
      live.fromGas = true;
      live.fromD1 = false;
      live.sandbox = false;
      live.priceCanon = "d1-primary";
    }
    return live;
  }
  if (force || !nick) {
    return (await fromGas_()) || { status: "error", message: "need_nick", cutover: true };
  }

  let local = null;
  try {
    local = await getSubscription_(
      { nick: nick, sheet: "ПП", segment: "ПП", subId: (params && params.subId) || "" },
      env
    );
  } catch (eL) {}

  let basket = (local && Array.isArray(local.basket) && local.basket.length && local.basket) || null;
  // нет состава в snap — один раз GAS warm (не конфликт, cold start)
  if (!local || !local.found || !basket) {
    return (await fromGas_()) || { status: "error", message: "gas_proxy_failed", cutover: true };
  }

  const deliveriesN = Math.max(1, Number(local.deliveries) || 1);
  const matchKey = normalizeMatchKey_(local.nick || nick);
  const asOfIso = resolveAsOfIsoD1_(params);
  const factRaw = local.factCost;
  const factCost =
    factRaw == null || factRaw === ""
      ? null
      : Number(String(factRaw).replace(",", ".").replace(/[^\d.-]/g, "")) || 0;

  const monthly = clonePpBasketD1_(basket);
  let slot = 1;
  let suggestedSlot = 1;
  let needManualSlot = false;
  let hasAnchor = false;
  let slot1Basket = [];
  let prior = { count: 0, slot1Basket: [], lastSlot: 0, lastDate: "" };

  if (deliveriesN >= 2) {
    hasAnchor = await hasPpSlotAnchorD1_(env, matchKey);
    if (!hasAnchor && local.hasPpSlotAnchor) hasAnchor = true;
    needManualSlot = !hasAnchor;
    prior = await countPpPriorDeliveriesMonthD1_(env, local.nick || nick, matchKey, asOfIso);
    slot1Basket = prior.slot1Basket || [];
    const stored = await lookupStoredPpSlotDateD1_(env, local.nick || nick, matchKey, asOfIso);
    const forced = parseForcedPpSlotD1_(
      (params && (params.deliverySlot != null ? params.deliverySlot : params.slot != null ? params.slot : params.ppSlot)) ||
        "",
      deliveriesN
    );
    if (forced >= 1) {
      slot = forced;
      suggestedSlot = forced;
      needManualSlot = false;
    } else if (stored >= 1) {
      slot = stored;
      suggestedSlot = stored;
    } else {
      suggestedSlot = Math.min(deliveriesN, (Number(prior.count) || 0) + 1);
      if (prior.lastSlot >= 1 && prior.count <= 0) suggestedSlot = prior.lastSlot >= 2 ? 1 : 2;
      slot = needManualSlot ? suggestedSlot : suggestedSlot;
    }
  }

  const proposed = proposePpSlotBasketD1_(monthly, slot, deliveriesN, slot1Basket);
  const remaining =
    deliveriesN >= 2 && slot <= 1
      ? proposePpSlotBasketD1_(monthly, 2, deliveriesN, proposed)
      : remainderPpBasketD1_(monthly, slot1Basket.length ? slot1Basket : slot >= 2 ? proposed : []);

  let askPaid = true;
  if (deliveriesN >= 1) {
    if (deliveriesN === 1 || slot <= 1) askPaid = true;
    else askPaid = true;
  }

  const hint =
    deliveriesN <= 1
      ? "ПП N=1 · состав целиком · d1"
      : "ПП N=" + deliveriesN + " · слот " + slot + (needManualSlot ? " · спросить" : "") + " · d1";

  return {
    status: "success",
    nick: local.nick || nick,
    subId: local.subId || "",
    sheet: local.sheet || "ПП",
    wishes: local.wishes || "",
    address: local.address || "",
    note: local.note || "",
    phone: local.phone || "",
    date: (params && (params.date || params.deliveryDate)) || asOfIso,
    day: (params && params.day) || "",
    deliveriesN: deliveriesN,
    deliverySlot: slot,
    ppSlot: formatPpSlotLabelD1_(slot, deliveriesN),
    suggestedSlot: suggestedSlot,
    needManualSlot: needManualSlot,
    hasPpSlotAnchor: hasAnchor || !needManualSlot,
    everSeenInApp: true,
    daysSinceLastDelivery: prior.lastDate ? null : null,
    lastSlot: prior.lastSlot || 0,
    lastDeliveryDate: prior.lastDate || "",
    paid: null,
    askPaid: askPaid,
    factCost: factCost,
    monthlyBasket: monthly,
    proposedBasket: proposed,
    slot1Basket: slot1Basket,
    remainingBasket: remaining,
    hint: hint,
    cutover: true,
    fromD1: true,
    fromGas: false,
    sandbox: false,
    priceCanon: "d1-primary",
    d1Verified: true
  };
}

async function migratePpToRaw26SchemeD1_(params, env, ctx) {
  const nick = String((params && (params.nick || params.client)) || "").trim();
  const subId = String((params && params.subId) || "").trim();
  if (!nick && !subId) return { status: "error", message: "need_nick", cutover: true };

  let local = null;
  try {
    local = await getSubscription_({ nick: nick, sheet: "ПП", segment: "ПП", subId: subId }, env);
  } catch (eL) {}

  // без состава в D1 — только GAS (нужен лист)
  const basket = local && Array.isArray(local.basket) ? local.basket : [];
  if (!(local && local.found && basket.length)) {
    const live = await gasProxy_("migratePpToRaw26Scheme", params || {}, env, { write: true });
    if (live && live.status === "success" && env && env.DB) {
      try {
        await mergeSubscriptionDetailIntoSnap_(
          env,
          Object.assign({}, live, {
            nick: live.nick || nick,
            sheet: "ПП",
            factCost: live.factCost,
            wishes: live.wishes,
            scheme: "RAW26",
            ppScheme: "RAW26",
            coef: live.coef
          })
        );
      } catch (eM) {}
    }
    if (live && typeof live === "object") {
      live.cutover = true;
      live.fromGas = true;
      live.fromD1 = false;
      live.sandbox = false;
    }
    return live || { status: "error", message: "gas_proxy_failed", cutover: true };
  }

  const deliveriesN = Math.max(1, Number(local.deliveries) || 1);
  const costsSnap = (await getSnapRaw_(env, "priceCostsPp")) || { costs: {} };
  const built = buildPpLinesFromCostsD1_(basket, costsSnap.costs || {});
  let rawCost = built.rawCost;
  let lines = built.lines;
  if (built.missing > 0) {
    // cold unit costs
    try {
      const warm = await gasProxy_(
        "calcPpFact",
        { basket: basket, scheme: "RAW26", deliveriesN: deliveriesN, coef: 2.6 },
        env,
        { write: false }
      );
      if (warm && warm.status === "success") {
        rawCost = Number(warm.cost) || rawCost;
        lines = warm.lines || lines;
        try {
          await mergePriceCostsPpFromLinesD1_(env, lines);
        } catch (eW) {}
      }
    } catch (eC) {}
  }
  let packOpt = local.packCounts || null;
  if (typeof packOpt === "string") {
    try {
      packOpt = JSON.parse(packOpt);
    } catch (eP) {
      packOpt = null;
    }
  }
  let retailGoods = 0;
  try {
    const retailSnap = await ensureRetailPricesSnap_(env, ctx);
    if (retailSnap && Array.isArray(retailSnap.items)) {
      retailGoods = retailGoodsBynFromBasketD1_(retailMapFromItemsD1_(retailSnap.items), basket);
    }
  } catch (eR) {}
  const fact = computePpFactFromCostD1_(
    rawCost,
    basket,
    deliveriesN,
    PP_RAW26_COEF_DEFAULT_D1_,
    packOpt,
    "RAW26",
    lines,
    retailGoods
  );
  let wishes = stampPpSchemeIntoWishesD1_(local.wishes || "", "RAW26");
  wishes = stampPpCoefIntoWishesD1_(wishes, PP_RAW26_COEF_DEFAULT_D1_);
  const applyStated = !(
    params.applyStated === false ||
    params.applyStated === "0" ||
    params.applyStated === 0
  );
  const detail = Object.assign({}, local, {
    nick: local.nick || nick,
    sheet: "ПП",
    wishes: wishes,
    scheme: "RAW26",
    ppScheme: "RAW26",
    coef: PP_RAW26_COEF_DEFAULT_D1_,
    factCost: applyStated ? fact.factCost : local.factCost,
    _d1Detail: true,
    _savedAt: Date.now()
  });
  try {
    await mergeSubscriptionDetailIntoSnap_(env, detail);
  } catch (eS) {}

  const ok = {
    status: "success",
    nick: local.nick || nick,
    label: local.label || local.nick || nick,
    subId: local.subId || subId,
    prevScheme: parsePpSchemeFromWishesD1_(local.wishes) || local.ppScheme || local.scheme || "LEGACY",
    scheme: "RAW26",
    coef: PP_RAW26_COEF_DEFAULT_D1_,
    rawCost: rawCost,
    factCost: fact.factCost,
    statedApplied: applyStated,
    recoverByn: fact.recoverByn,
    wishes: wishes,
    cutover: true,
    fromD1: true,
    fromGas: false,
    sandbox: false,
    d1Verified: true,
    pendingSheets: true,
    subsCanon: "d1-primary"
  };

  // Sheets зеркало в фоне — не блокируем UI
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(
      gasProxy_("migratePpToRaw26Scheme", params || {}, env, { write: true })
        .then(function (live) {
          return live;
        })
        .catch(function () {
          return null;
        })
    );
  }
  return ok;
}



function matchWarehouseRowD1_(rows, cutName) {
  const want = cutNameKey_(cutName);
  const fuzzy = cutFuzzyKey_(cutName);
  let best = null;
  for (let i = 0; i < (rows || []).length; i++) {
    const r = rows[i];
    const nm = cutNameKey_(r && r.name);
    if (!nm) continue;
    if (nm === want) return r;
    if (cutFuzzyKey_(r.name) === fuzzy) best = best || r;
  }
  return best;
}

function todayIsoMinskD1_() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Minsk",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

async function loadWeekDayMetasD1_(env) {
  const days = [];
  for (let i = 0; i < WEEK_DAYS.length; i++) {
    const day = WEEK_DAYS[i];
    const info = await dayDateInfo_(env, day);
    days.push({
      day: day,
      date: (info && info.date) || "",
      iso: (info && info.iso) || ""
    });
  }
  return days;
}

async function loadPeopleForDaysD1_(env, dayMetas) {
  const people = [];
  if (!env || !env.DB) return people;
  for (let i = 0; i < (dayMetas || []).length; i++) {
    const meta = dayMetas[i];
    const day = meta.day;
    const iso = meta.iso;
    try {
      let rows = [];
      if (day) {
        const q = await env.DB.prepare(
          "SELECT client, match_key, basket_json, note, date_iso, day_name FROM orders WHERE status = 'active' AND day_name = ? LIMIT 200"
        )
          .bind(day)
          .all();
        rows = (q && q.results) || [];
      }
      if (iso) {
        const q2 = await env.DB.prepare(
          "SELECT client, match_key, basket_json, note, date_iso, day_name FROM orders WHERE status = 'active' AND date_iso = ? AND (day_name = '' OR day_name IS NULL) LIMIT 200"
        )
          .bind(iso)
          .all();
        rows = rows.concat((q2 && q2.results) || []);
      }
      rows.forEach(function (r) {
        let basket = [];
        try {
          basket = JSON.parse(r.basket_json || "[]");
        } catch (eB) {
          basket = [];
        }
        people.push({
          name: r.client,
          matchKey: r.match_key,
          basket: basket,
          note: r.note || "",
          noCut: /\[НЕ\s*РЕЗАТЬ\]/i.test(String(r.note || "")),
          dateIso: r.date_iso || iso || "",
          day: r.day_name || day || ""
        });
      });
    } catch (eDay) {}
  }
  return people;
}

function accumulateDryNeedD1_(people, warehouseRows) {
  const dryByKey = Object.create(null);
  const metaByKey = Object.create(null);
  (people || []).forEach(function (p) {
    if (p && (p.noCut || /\[НЕ\s*РЕЗАТЬ\]/i.test(String(p.note || "")))) return;
    (p.basket || []).forEach(function (it) {
      const cname = cuttingNameFromBasketItem_(it);
      if (!cname) return;
      const val = Number(it.value != null ? it.value : it.val) || 0;
      if (!(val > 0)) return;
      const wh = matchWarehouseRowD1_(warehouseRows, cname) || matchWarehouseRowD1_(warehouseRows, it.main || it.name);
      const key = wh ? cutNameKey_(wh.name) : cutNameKey_(cname);
      if (!key) return;
      dryByKey[key] = (dryByKey[key] || 0) + val;
      if (!metaByKey[key]) {
        metaByKey[key] = {
          name: (wh && wh.name) || cname,
          row: wh ? wh.row : 0,
          unit: wh ? wh.unit : isPieceSku_(cname, it.cat, it.unit) ? "шт" : "кг",
          coef: wh ? Number(wh.coef) || 0.2 : 0.2,
          piece: isPieceSku_((wh && wh.name) || cname, it.cat, (wh && wh.unit) || it.unit),
          stock: wh ? Number(wh.stock) || 0 : 0,
          arrival: wh ? Number(wh.arrival) || 0 : 0
        };
      }
    });
  });
  return { dryByKey: dryByKey, metaByKey: metaByKey };
}

async function surplusByWarehouseD1_(env, dayMetas, warehouseRows) {
  const out = Object.create(null);
  for (let i = 0; i < (dayMetas || []).length; i++) {
    const day = dayMetas[i].day;
    try {
      const cut = await getSnapRaw_(env, "cutting:" + day);
      (cut && cut.items ? cut.items : []).forEach(function (it) {
        const sur = Number(it.surplus) || 0;
        if (!(sur > 0)) return;
        const wh = matchWarehouseRowD1_(warehouseRows, it.name);
        const key = wh ? cutNameKey_(wh.name) : cutNameKey_(it.name);
        if (!key) return;
        out[key] = (out[key] || 0) + sur;
      });
    } catch (eC) {}
  }
  return out;
}

function round2_(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function computeWarehouseWeekPlanD1_(env, opts) {
  opts = opts || {};
  let wh = await getSnapRaw_(env, "warehouse");
  if (!wh || !warehouseRows_(wh).length) {
    try {
      const live = await gasProxy_("getWarehouse", {}, env, { write: false });
      if (live && live.status === "success") {
        wh = live;
        try {
          await putSnap_(env, "warehouse", Object.assign({}, live, { cachedAt: new Date().toISOString() }));
        } catch (eS) {}
      }
    } catch (eW) {}
  }
  const rows = warehouseRows_(wh);
  if (!rows.length) return { ok: false, message: "no_warehouse" };

  const asOf = String(opts.asOf || todayIsoMinskD1_()).slice(0, 10);
  const dateFrom = String(opts.dateFrom || "").slice(0, 10);
  const dateTo = String(opts.dateTo || "").slice(0, 10);
  const dayMetas = await loadWeekDayMetasD1_(env);
  const activeDays = dayMetas.filter(function (d) {
    return !!d.iso;
  });
  const needMetas = activeDays.filter(function (d) {
    if (dateFrom && d.iso < dateFrom) return false;
    if (dateTo && d.iso > dateTo) return false;
    return d.iso >= asOf;
  });
  const priorMetas = activeDays.filter(function (d) {
    return d.iso && d.iso < asOf && (!dateFrom || d.iso >= dateFrom);
  });

  const needPeople = await loadPeopleForDaysD1_(env, needMetas.length ? needMetas : activeDays);
  const priorPeople = await loadPeopleForDaysD1_(env, priorMetas);
  // optional extra basket (check order)
  if (opts.extraBasket && opts.extraBasket.length) {
    needPeople.push({
      name: opts.extraClient || "order",
      basket: opts.extraBasket,
      note: "",
      dateIso: opts.extraDateIso || asOf,
      day: opts.extraDay || ""
    });
  }

  const needAcc = accumulateDryNeedD1_(needPeople, rows);
  const priorAcc = accumulateDryNeedD1_(priorPeople, rows);
  const surplus = await surplusByWarehouseD1_(env, activeDays, rows);

  const plan = [];
  const deficits = [];
  const buyList = [];
  const withPlan = [];

  rows.forEach(function (r) {
    const key = cutNameKey_(r.name);
    const meta = needAcc.metaByKey[key] || {
      name: r.name,
      row: r.row,
      unit: r.unit || "кг",
      coef: Number(r.coef) || 0.2,
      piece: isPieceSku_(r.name, "", r.unit),
      stock: Number(r.stock) || 0,
      arrival: Number(r.arrival) || 0
    };
    const dryG = Number(needAcc.dryByKey[key]) || 0;
    const priorDryG = Number(priorAcc.dryByKey[key]) || 0;
    const sur = Number(surplus[key]) || 0;
    const coef = Number(meta.coef) || Number(r.coef) || 0.2;
    const piece = !!meta.piece || isPieceSku_(r.name, "", r.unit);
    const stockStart = (Number(r.stock) || 0) + (Number(r.arrival) || 0);
    let needRaw = 0;
    let priorRaw = 0;
    if (piece) {
      needRaw = dryG + sur;
      priorRaw = priorDryG;
    } else {
      needRaw = (dryG / 1000) / (coef || 0.2) + sur;
      priorRaw = (priorDryG / 1000) / (coef || 0.2);
    }
    needRaw = round2_(needRaw);
    priorRaw = round2_(priorRaw);
    const available = round2_(Math.max(0, stockStart - priorRaw));
    const deficit = round2_(Math.max(0, needRaw - available));
    const rowPlan = {
      row: r.row,
      name: r.name,
      unit: piece ? "шт" : r.unit || "кг",
      piece: piece,
      coef: coef,
      stock: Number(r.stock) || 0,
      arrival: Number(r.arrival) || 0,
      stockStart: round2_(stockStart),
      dryG: round2_(dryG),
      priorDryG: round2_(priorDryG),
      surplus: round2_(sur),
      needRaw: needRaw,
      priorRaw: priorRaw,
      available: available,
      deficit: deficit,
      buy: !!r.buy
    };
    plan.push(rowPlan);
    if (needRaw > 0 || dryG > 0) withPlan.push(rowPlan);
    if (deficit > 0) {
      deficits.push(rowPlan);
      buyList.push({
        name: r.name,
        need: deficit,
        needRaw: deficit,
        available: available,
        unit: rowPlan.unit,
        row: r.row
      });
    }
  });

  const isos = activeDays.map(function (d) {
    return d.iso;
  }).filter(Boolean);
  const rangeFrom = dateFrom || (isos.length ? isos.slice().sort()[0] : asOf);
  const rangeTo = dateTo || (isos.length ? isos.slice().sort().slice(-1)[0] : asOf);

  return {
    ok: true,
    deficits: deficits,
    plan: plan,
    withPlan: withPlan,
    buyList: buyList,
    days: activeDays,
    activeDays: needMetas,
    dateFrom: rangeFrom,
    dateTo: rangeTo,
    asOf: asOf,
    rangeLabel: rangeFrom + " — " + rangeTo,
    note: "D1 plan: stock+arrival − prior, need = dry÷coef (+surplus cutting)",
    writeOffNote: "Галочки нарезки НЕ списывают склад. Списание F — только при Завершить неделю.",
    fromD1Compute: true
  };
}

function composeWarehouseBuyMessageFromPlanD1_(pack) {
  pack = pack || {};
  const defs = pack.deficits || [];
  const lines = [];
  lines.push("🛒 Дозакуп сырья");
  let rangeLab = "";
  if (pack.dateFrom || pack.dateTo) rangeLab = String(pack.dateFrom || "…") + " — " + String(pack.dateTo || "…");
  else if (pack.rangeLabel) rangeLab = String(pack.rangeLabel);
  if (rangeLab) lines.push("Период: " + rangeLab);
  else lines.push("Под план выбранных дат:");
  lines.push("«Нужно» = сырьё (сухое ÷ коэф усушки), не граммы с заказа.");
  lines.push("");
  if (!defs.length) {
    lines.push("Нехватки нет (остаток покрывает план).");
    return lines.join("\n");
  }
  defs.forEach(function (d) {
    const unit = d.unit || "кг";
    let line =
      "· " + d.name + " — нужно " + d.needRaw + " " + unit + ", есть " + d.available + " " + unit;
    if (!d.piece && d.dryG > 0) {
      line +=
        " (план " +
        (d.dryG >= 1000 ? round2_(d.dryG / 1000) + " кг" : round2_(d.dryG) + " г") +
        " сухого)";
    }
    lines.push(line);
  });
  lines.push("");
  lines.push("Бойня-Конвейер · склад");
  return lines.join("\n");
}

async function warehousePreviewD1_(params, env, ctx) {
  const force =
    String((params && params.force) || "") === "1" ||
    (params && (params.force === true || params.force === 1 || params.refresh));
  // D1 compute — основной путь (force тоже D1, без GAS)
  try {
    const pack = await computeWarehouseWeekPlanD1_(env, {
      asOf: (params && (params.asOf || params.asOfDate)) || "",
      dateFrom: (params && (params.dateFrom || params.from)) || "",
      dateTo: (params && (params.dateTo || params.to)) || ""
    });
    if (pack && pack.ok) {
      const msg = composeWarehouseBuyMessageFromPlanD1_(pack);
      const out = {
        status: "success",
        deficits: pack.deficits || [],
        plan: pack.plan || [],
        withPlan: pack.withPlan || [],
        buyList: pack.buyList || [],
        days: pack.days || [],
        activeDays: pack.activeDays || [],
        dateFrom: pack.dateFrom || "",
        dateTo: pack.dateTo || "",
        asOf: pack.asOf || "",
        rangeLabel: pack.rangeLabel || "",
        note: pack.note || "",
        messageText: msg,
        writeOffNote: pack.writeOffNote || "",
        cutover: true,
        fromD1: true,
        fromGas: false,
        sandbox: false,
        warehouseCanon: "d1-primary",
        d1Verified: true,
        fromD1Compute: true
      };
      try {
        await putSnap_(env, "warehousePreview", Object.assign({}, out, { cachedAt: new Date().toISOString() }));
      } catch (eS) {}
      return out;
    }
  } catch (eComp) {}
  // cold: нет склада в D1 — один раз GAS
  const live = await gasProxy_("warehousePreview", params || {}, env, { write: false });
  if (live && live.status === "success" && env && env.DB) {
    try {
      await putSnap_(env, "warehousePreview", Object.assign({}, live, { cachedAt: new Date().toISOString() }));
    } catch (e) {}
  }
  if (live && typeof live === "object") {
    live.cutover = true;
    live.fromGas = true;
    live.fromD1 = false;
    live.sandbox = false;
    live.warehouseCanon = "d1-primary";
  }
  return live || { status: "error", message: "gas_proxy_failed", cutover: true, action: "warehousePreview" };
}

async function checkOrderWarehouseD1_(params, env, ctx) {
  let basket = params && params.basket;
  if (typeof basket === "string") {
    try {
      basket = JSON.parse(basket);
    } catch (eB) {
      basket = [];
    }
  }
  if (!Array.isArray(basket)) basket = [];
  try {
    const pack = await computeWarehouseWeekPlanD1_(env, {
      asOf: todayIsoMinskD1_(),
      dateFrom: (params && (params.date || params.dayDate)) || "",
      dateTo: (params && (params.date || params.dayDate)) || "",
      extraBasket: basket,
      extraClient: (params && params.client) || "",
      extraDay: (params && params.day) || ""
    });
    if (pack && pack.ok) {
      const defs = pack.deficits || [];
      const alert =
        defs.length > 0
          ? {
              count: defs.length,
              clientCount: defs.length,
              items: defs.slice(0, 12).map(function (d) {
                return { name: d.name, need: d.deficit, unit: d.unit };
              }),
              client: (params && params.client) || "",
              day: (params && params.day) || ""
            }
          : null;
      return {
        status: "success",
        warehouseAlert: alert,
        hasDeficit: defs.length > 0,
        cutover: true,
        fromD1: true,
        fromGas: false,
        sandbox: false,
        warehouseCanon: "d1-primary",
        d1Verified: true,
        fromD1Compute: true
      };
    }
  } catch (eC) {}
  const live = await gasProxy_("checkOrderWarehouse", params || {}, env, { write: false });
  if (live && typeof live === "object") {
    live.cutover = true;
    live.fromGas = true;
    live.fromD1 = false;
    live.sandbox = false;
    live.warehouseCanon = "d1-primary";
  }
  return live || { status: "error", message: "gas_proxy_failed", cutover: true, action: "checkOrderWarehouse" };
}

async function composeWarehouseBuyMessageD1_(params, env, ctx) {
  try {
    const pack = await computeWarehouseWeekPlanD1_(env, {
      asOf: (params && (params.asOf || params.asOfDate)) || "",
      dateFrom: (params && (params.dateFrom || params.from)) || "",
      dateTo: (params && (params.dateTo || params.to)) || ""
    });
    if (pack && pack.ok) {
      const msg = composeWarehouseBuyMessageFromPlanD1_(pack);
      return {
        status: "success",
        messageText: msg,
        message: msg,
        buyList: pack.buyList || [],
        deficits: pack.deficits || [],
        cutover: true,
        fromD1: true,
        fromGas: false,
        sandbox: false,
        warehouseCanon: "d1-primary",
        d1Verified: true,
        fromD1Compute: true
      };
    }
  } catch (e) {}
  const live = await gasProxy_("composeWarehouseBuyMessage", params || {}, env, { write: false });
  if (live && typeof live === "object") {
    live.cutover = true;
    live.fromGas = true;
    live.fromD1 = false;
    live.sandbox = false;
  }
  return live || { status: "error", message: "gas_proxy_failed", cutover: true, action: "composeWarehouseBuyMessage" };
}

async function lookupBpPartnerD1_(params, env, ctx) {
  const nick = String((params && (params.nick || params.client || params.q || params.query)) || "")
    .trim()
    .toLowerCase();
  if (!nick) {
    return { status: "success", partner: "", items: [], cutover: true, fromD1: true };
  }
  try {
    const list = await getSnapRaw_(env, "listSubscriptions");
    const arr = (list && (list.subscriptions || list.items)) || [];
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      const n = String(s.nick || s.label || "").toLowerCase();
      if (!n) continue;
      if (n === nick || n.indexOf(nick) >= 0 || nick.indexOf(n) >= 0) {
        const partner = String(s.ppPartner || s.partner || s.ownerName || "").trim();
        if (partner) {
          return {
            status: "success",
            partner: partner,
            nick: s.nick || s.label,
            sheet: s.sheet || "",
            cutover: true,
            fromD1: true,
            fromGas: false,
            d1Verified: true
          };
        }
      }
    }
  } catch (e) {}
  const live = await gasProxy_("lookupBpPartner", params || {}, env, { write: false });
  if (live && typeof live === "object") {
    live.cutover = true;
    live.fromGas = true;
    live.fromD1 = false;
  }
  return live || { status: "success", partner: "", cutover: true, fromD1: false };
}

function isPpCalcMode_(params) {
  const m = String((params && params.mode) || "").toLowerCase();
  if (!m || m === "live" || m === "sandbox" || m === "cutover") return false;
  return (
    m === "pp" ||
    m === "subscription" ||
    m.indexOf("подп") >= 0 ||
    m === "факт" ||
    m === "fact"
  );
}

function isPieceSkuNameD1_(name) {
  const n = String(name || "");
  if (!n) return false;
  if (/шт/i.test(n)) return true;
  if (/ХРЯЩ|ЛОПАТ|ЛОП\s*ХРЯЩ/i.test(n)) return true;
  if (/КОЛЕН|КОПЫТ|НОСЫ|НОС\b|УХО|УШК|ШЕИ|ШЕЯ|ГУБЫ|ПЕРЕП[ЕЁ]?Л|АОРТ|ТРАХЕ|СТАНОВ|УТИН/i.test(n)) {
    return true;
  }
  if (/БЫЧ.*КОРЕН|КОРЕНЬ/i.test(n)) return true;
  return false;
}

const PP_SCHEME_CUTOFF_YMD_D1_ = "2026-08-31";
const PP_RAW26_COEF_DEFAULT_D1_ = 2.6;
const PP_RAW26_RECOVER_100_D1_ = 3.9;
const PP_RAW26_RECOVER_PIECE_D1_ = 0.5;
const PP_RAW26_DELIVERY_PER_D1_ = 9;
const PP_RAW26_RETAIL_CAP_D1_ = 0.92;
const PP_LEGACY_COEF_DEFAULT_D1_ = 2.3;
const PP_LEGACY_FIXED_D1_ = 11;
const PP_LEGACY_DELIVERY_PER_D1_ = 6;
const PACK_CAP_PRODUCT_D1_ = { small: 20, medium: 100, large: 250 };
const PACK_CAP_LIGHT_D1_ = { small: 15, medium: 80, large: 190 };
const PACK_CRAFT_HOLDS_D1_ = { large: 4, medium: 7, small: 35 };
const PACK_CHEW_FEW_D1_ = 2;
const PACK_CHEW_PER_BIG_D1_ = 4;

function todayYmdMinskD1_() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Minsk",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

function normalizePpSchemeD1_(s) {
  const u = String(s || "").trim().toUpperCase();
  if (u === "RAW26" || u === "RAW" || u === "NEW" || u === "V2") return "RAW26";
  if (u === "LEGACY" || u === "OLD" || u === "V1") return "LEGACY";
  return "";
}

function parsePpSchemeFromWishesD1_(wishes) {
  const m = String(wishes || "").match(/\[SCHEME:([^\]]+)\]/i);
  if (!m) return "";
  return normalizePpSchemeD1_(m[1]);
}

function resolvePpSchemeD1_(opt) {
  opt = opt || {};
  const fromIn = normalizePpSchemeD1_(opt.scheme);
  if (fromIn) return fromIn;
  const fromW = parsePpSchemeFromWishesD1_(opt.wishes);
  if (fromW) return fromW;
  if (opt.forNew) return todayYmdMinskD1_() >= PP_SCHEME_CUTOFF_YMD_D1_ ? "RAW26" : "LEGACY";
  return "LEGACY";
}

function isLargeChewFractionD1_(sub) {
  const u = String(sub || "").trim().toUpperCase();
  if (!u) return false;
  if (/ОГР|ОГРОМ|ГИГАНТ|КРУПН|БОЛЬШ|БОЛ/.test(u)) return true;
  if (/^ОБЫЧН/.test(u)) return true;
  return false;
}

function packFormatOnD1_(enabled, key) {
  if (!enabled) return true;
  return enabled[key] !== false;
}

function packGramsIntoDoypacksD1_(grams, caps, enabled) {
  const out = { маленький: 0, средний: 0, большой: 0 };
  const g = Number(grams) || 0;
  if (g <= 0) return out;
  const levels = [];
  if (packFormatOnD1_(enabled, "большой")) levels.push({ key: "большой", cap: caps.large });
  if (packFormatOnD1_(enabled, "средний")) levels.push({ key: "средний", cap: caps.medium });
  if (packFormatOnD1_(enabled, "маленький")) levels.push({ key: "маленький", cap: caps.small });
  if (!levels.length) {
    levels.push(
      { key: "большой", cap: caps.large },
      { key: "средний", cap: caps.medium },
      { key: "маленький", cap: caps.small }
    );
  }
  let rem = g;
  const largest = levels[0];
  const nFull = Math.floor(rem / largest.cap);
  if (nFull > 0) {
    out[largest.key] += nFull;
    rem -= nFull * largest.cap;
  }
  if (rem <= 0) return out;
  for (let i = levels.length - 1; i >= 0; i--) {
    if (rem <= levels[i].cap) {
      out[levels[i].key]++;
      return out;
    }
  }
  out[largest.key] += Math.ceil(rem / largest.cap);
  return out;
}

function packChewsIntoDoypacksD1_(val, sub, enabled) {
  const out = { маленький: 0, средний: 0, большой: 0 };
  const n = Number(val) || 0;
  if (n <= 0) return out;
  const chewLarge = isLargeChewFractionD1_(sub);
  const wantMed = n <= PACK_CHEW_FEW_D1_ && !chewLarge;
  const canM = packFormatOnD1_(enabled, "средний");
  const canL = packFormatOnD1_(enabled, "большой");
  if (wantMed && canM) {
    out["средний"] = 1;
    return out;
  }
  const bags = Math.max(1, Math.ceil(n / PACK_CHEW_PER_BIG_D1_));
  if (canL) {
    out["большой"] = bags;
    return out;
  }
  if (canM) {
    out["средний"] = bags;
    return out;
  }
  out["большой"] = bags;
  return out;
}

function craftBagsForDoypacksD1_(doyByKey) {
  const s = Number(doyByKey["маленький"]) || 0;
  const m = Number(doyByKey["средний"]) || 0;
  const l = (Number(doyByKey["большой"]) || 0) + (Number(doyByKey["целое"]) || 0);
  if (s + m + l <= 0) return 0;
  const fill =
    l / PACK_CRAFT_HOLDS_D1_.large +
    m / PACK_CRAFT_HOLDS_D1_.medium +
    s / PACK_CRAFT_HOLDS_D1_.small;
  return Math.max(1, Math.ceil(fill - 1e-12));
}

function appendDoyDistToPacksD1_(packs, doyByKey, lightBagsByCounter, dist, meta) {
  const order = ["большой", "средний", "маленький"];
  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const n = Number(dist[key]) || 0;
    if (n <= 0) continue;
    doyByKey[key] = (doyByKey[key] || 0) + n;
    if (meta.type === "light") {
      lightBagsByCounter[key] = (lightBagsByCounter[key] || 0) + n;
    }
    packs.push({
      name: meta.name,
      sub: meta.sub,
      val: meta.val,
      unit: meta.unit,
      bags: n,
      rule: meta.rulePrefix + " → " + key,
      type: meta.type,
      counterKey: key,
      label: meta.name + (meta.sub ? " / " + meta.sub : "") + " → " + n + " дойп. (" + key + ")"
    });
  }
}

function buildAssemblyForBasketD1_(basket, enabledOpt) {
  const enabled = enabledOpt || null;
  const packs = [];
  let totalBags = 0;
  const typeCounts = { light: 0, bulk: 0, chew: 0, craft: 0, other: 0 };
  const lightMap = {};
  const lightBagsByCounter = {};
  const doyByKey = { маленький: 0, средний: 0, большой: 0, целое: 0 };
  (basket || []).forEach(function (it) {
    const name = String(it.name || it.main || "").trim();
    const sub = String(it.sub || "").trim();
    const val = Number(it.val != null ? it.val : it.value) || 0;
    const cat = String(it.cat || "").toLowerCase();
    const unit =
      String(it.unit || "").trim() ||
      (isPieceSkuNameD1_(name) || cat === "chew" || cat === "chews" ? "шт" : "гр");
    if (!name || val <= 0) return;
    let dist = null;
    let type = "other";
    let rulePrefix = "дойпак";
    if (/л[её]гк/i.test(name) && !/баран/i.test(name) && !/крошк/i.test(name)) {
      dist = packGramsIntoDoypacksD1_(val, PACK_CAP_LIGHT_D1_, enabled);
      type = "light";
      rulePrefix = "дойпак лёгкое";
      const fk = sub || "Среднее";
      lightMap[fk] = (lightMap[fk] || 0) + val;
    } else if (/баран/i.test(name) && /л[её]гк/i.test(name)) {
      dist = packGramsIntoDoypacksD1_(val, PACK_CAP_PRODUCT_D1_, enabled);
      type = "bulk";
      rulePrefix = "дойпак баранье лёгкое";
    } else if (cat === "chew" || cat === "chews" || isPieceSkuNameD1_(name)) {
      dist = packChewsIntoDoypacksD1_(val, sub, enabled);
      type = "chew";
      rulePrefix = "дойпак жевалки";
    } else {
      dist = packGramsIntoDoypacksD1_(val, PACK_CAP_PRODUCT_D1_, enabled);
      type = cat === "other" ? "other" : "bulk";
      rulePrefix = "дойпак";
    }
    const lineBags =
      (dist["маленький"] || 0) + (dist["средний"] || 0) + (dist["большой"] || 0);
    totalBags += lineBags;
    typeCounts[type] = (typeCounts[type] || 0) + lineBags;
    appendDoyDistToPacksD1_(packs, doyByKey, lightBagsByCounter, dist, {
      name: name,
      sub: sub,
      val: val,
      unit: unit,
      type: type,
      rulePrefix: rulePrefix
    });
  });
  let craftBags = 0;
  if (packFormatOnD1_(enabled, "крафт")) {
    craftBags = craftBagsForDoypacksD1_(doyByKey);
  }
  typeCounts.craft = craftBags;
  totalBags += craftBags;
  if (craftBags > 0) {
    packs.push({
      name: "КРАФТ",
      sub: "",
      val: craftBags,
      unit: "пак",
      bags: craftBags,
      rule:
        "крафт клиента (вмест. " +
        PACK_CRAFT_HOLDS_D1_.large +
        "бол/" +
        PACK_CRAFT_HOLDS_D1_.medium +
        "сред/" +
        PACK_CRAFT_HOLDS_D1_.small +
        "мал)",
      type: "craft",
      counterKey: "крафт",
      label: "КРАФТ → " + craftBags + " пак."
    });
  }
  return {
    packs: packs,
    totalBags: totalBags,
    typeCounts: typeCounts,
    craftBags: craftBags,
    doyByKey: doyByKey
  };
}

function packCountsUFromBasketD1_(basket) {
  const asm = buildAssemblyForBasketD1_(basket || []);
  let u1 = 0;
  let u2 = 0;
  let u3 = 0;
  (asm.packs || []).forEach(function (p) {
    if (p.type === "craft" || p.counterKey === "крафт") return;
    const bags = Number(p.bags) || 0;
    if (bags <= 0) return;
    const k = String(p.counterKey || "");
    if (k === "маленький") u1 += bags;
    else if (k === "средний") u2 += bags;
    else if (k === "большой") u3 += bags;
    else if (k === "целое") u3 += bags;
  });
  const up4 = Number(asm.craftBags) || 0;
  return { u1: u1, u2: u2, u3: u3, up4: up4 };
}

function packagesBynFromUCountsD1_(pc) {
  pc = pc || {};
  return (
    Math.round(
      ((Number(pc.u1) || 0) * 0.34 +
        (Number(pc.u2) || 0) * 0.56 +
        (Number(pc.u3) || 0) * 0.8 +
        (Number(pc.up4) || 0) * 1.4) *
        100
    ) / 100
  );
}

function dressuraFractionMarkupFromBasketD1_(basket, rates) {
  rates = rates || { whole: 0, large: 1, medium: 2, small: 3 };
  let sum = 0;
  for (let i = 0; i < (basket || []).length; i++) {
    const it = basket[i] || {};
    const cat = String(it.cat || "").toLowerCase();
    if (cat && cat !== "dressura") continue;
    const sub = String(it.sub || "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();
    let size = "";
    if (/^ЦЕЛ/.test(sub)) size = "whole";
    else if (/^БОЛЬ|^КРУП|^БОЛ\b/.test(sub) || sub === "БОЛ") size = "large";
    else if (/^СРЕД/.test(sub)) size = "medium";
    else if (/^МЕЛК|^МАЛ/.test(sub) && !/ОЧ/.test(sub)) size = "small";
    else if (/КУБИК/.test(sub) && /МЕЛК/.test(sub)) size = "small";
    else if (/КУБИК/.test(sub) && /КРУП/.test(sub)) size = "large";
    if (!size) continue;
    const rate = Number(rates[size]);
    if (!isFinite(rate)) continue;
    const grams = Number(it.val != null ? it.val : it.value) || 0;
    if (grams <= 0) continue;
    sum += (grams / 100) * rate;
  }
  return Math.round(sum * 100) / 100;
}

function recoverBynFromPpLinesD1_(lines) {
  let sum = 0;
  for (let i = 0; i < (lines || []).length; i++) {
    const L = lines[i] || {};
    const val = Number(L.val != null ? L.val : L.value) || 0;
    if (val <= 0) continue;
    let piece = !!L.piece;
    if (!piece) {
      const cat = String(L.cat || "").toLowerCase();
      const name = String(L.name || L.main || "");
      if (cat === "chew" || cat === "chews" || cat === "powder") piece = true;
      else if (isPieceSkuNameD1_(name) || /шт/i.test(name) || /крошка/i.test(name)) piece = true;
    }
    if (piece) sum += PP_RAW26_RECOVER_PIECE_D1_ * val;
    else sum += PP_RAW26_RECOVER_100_D1_ * (val / 100);
  }
  return Math.round(sum * 100) / 100;
}

function retailGoodsBynFromBasketD1_(map, basket) {
  let sum = 0;
  for (let i = 0; i < (basket || []).length; i++) {
    const it = basket[i] || {};
    const name = String(it.name || it.main || "").trim();
    const sub = String(it.sub || "").trim();
    const val = Number(it.val != null ? it.val : it.value) || 0;
    if (!name || val <= 0) continue;
    const rc = retailLineCostD1_(map, name, sub, val, it.cat);
    sum += Number(rc.cost) || 0;
  }
  return Math.round(sum * 100) / 100;
}

function computePpFactFromCostD1_(
  costSum,
  basket,
  deliveriesN,
  coefIn,
  packCountsOpt,
  schemeOpt,
  linesOpt,
  retailGoodsOpt
) {
  const scheme = normalizePpSchemeD1_(schemeOpt) || "LEGACY";
  const n = Math.max(1, Number(deliveriesN) || 1);
  let coef = Number(coefIn);
  const pc =
    packCountsOpt && typeof packCountsOpt === "object"
      ? {
          u1: Number(packCountsOpt.u1) || 0,
          u2: Number(packCountsOpt.u2) || 0,
          u3: Number(packCountsOpt.u3) || 0,
          up4: Number(packCountsOpt.up4) || 0
        }
      : packCountsUFromBasketD1_(basket || []);
  const packagesByn = packagesBynFromUCountsD1_(pc);
  const fracMark = dressuraFractionMarkupFromBasketD1_(basket);
  const raw = Number(costSum) || 0;
  let out;
  if (scheme === "RAW26") {
    if (!isFinite(coef) || coef <= 0) coef = PP_RAW26_COEF_DEFAULT_D1_;
    const recover = recoverBynFromPpLinesD1_(linesOpt && linesOpt.length ? linesOpt : basket);
    const delivery = PP_RAW26_DELIVERY_PER_D1_ * n;
    let goods = Math.round((raw * coef + recover) * 100) / 100;
    const retailGoods =
      retailGoodsOpt != null && retailGoodsOpt !== ""
        ? Number(retailGoodsOpt)
        : 0;
    let capped = false;
    let capAt = 0;
    if (isFinite(retailGoods) && retailGoods > 0) {
      capAt = Math.round(retailGoods * PP_RAW26_RETAIL_CAP_D1_ * 100) / 100;
      if (goods > capAt) {
        goods = capAt;
        capped = true;
      }
    }
    const factCost = Math.round((goods + delivery + packagesByn + fracMark) * 100) / 100;
    out = {
      scheme: "RAW26",
      factCost: factCost,
      deliveriesN: n,
      coef: coef,
      fixed: 0,
      recoverByn: recover,
      goodsByn: goods,
      retailGoods: isFinite(retailGoods) ? retailGoods : 0,
      retailCapped: capped,
      retailCapAt: capAt,
      deliveryByn: delivery,
      packagesByn: packagesByn,
      packCounts: pc,
      fractionMarkup: fracMark
    };
  } else {
    if (!isFinite(coef) || coef <= 0) coef = PP_LEGACY_COEF_DEFAULT_D1_;
    const fixed = PP_LEGACY_FIXED_D1_;
    const deliveryL = PP_LEGACY_DELIVERY_PER_D1_ * n;
    const factL =
      Math.round((raw * coef + fixed + deliveryL + packagesByn + fracMark) * 100) / 100;
    out = {
      scheme: "LEGACY",
      factCost: factL,
      deliveriesN: n,
      coef: coef,
      fixed: fixed,
      recoverByn: 0,
      deliveryByn: deliveryL,
      packagesByn: packagesByn,
      packCounts: pc,
      fractionMarkup: fracMark
    };
  }
  return out;
}

function parseBasketParamD1_(params) {
  let basket = params && params.basket;
  if (typeof basket === "string") {
    try {
      basket = JSON.parse(basket);
    } catch (eB) {
      basket = [];
    }
  }
  if (!Array.isArray(basket)) basket = [];
  return basket;
}

function parsePackCountsParamD1_(params) {
  let packOpt = params && params.packCounts;
  if (typeof packOpt === "string") {
    try {
      packOpt = JSON.parse(packOpt);
    } catch (ePc) {
      packOpt = null;
    }
  }
  return packOpt && typeof packOpt === "object" ? packOpt : null;
}

function lookupPpCostInfoD1_(costs, name, sub) {
  costs = costs || {};
  const key = name + (sub ? " / " + sub : "");
  if (costs[key]) return costs[key];
  const keys = Object.keys(costs);
  for (let i = 0; i < keys.length; i++) {
    const info = costs[keys[i]];
    if (!info) continue;
    if (info.name === name && (!sub || info.sub === sub)) return info;
  }
  if (!sub && costs[name]) return costs[name];
  return null;
}

async function mergePriceCostsPpFromLinesD1_(env, lines) {
  if (!env || !env.DB || !lines || !lines.length) return;
  let snap = (await getSnapRaw_(env, "priceCostsPp")) || { status: "success", costs: {} };
  if (!snap.costs || typeof snap.costs !== "object") snap.costs = {};
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i] || {};
    const name = String(L.name || "").trim();
    if (!name) continue;
    const sub = String(L.sub || "").trim();
    const unitPrice = Number(L.unitPrice != null ? L.unitPrice : L.per100) || 0;
    const piece = !!L.piece;
    const key = name + (sub ? " / " + sub : "");
    const row = { name: name, sub: sub, unitPrice: unitPrice, piece: piece };
    snap.costs[key] = row;
    if (!sub) snap.costs[name] = row;
  }
  snap.status = "success";
  snap.cachedAt = new Date().toISOString();
  snap._d1TouchedAt = Date.now();
  try {
    await putSnap_(env, "priceCostsPp", snap);
  } catch (eM) {}
}

function buildPpLinesFromCostsD1_(basket, costs) {
  const lines = [];
  let totalCost = 0;
  let missing = 0;
  for (let i = 0; i < (basket || []).length; i++) {
    const it = basket[i] || {};
    const name = String(it.name || it.main || "").trim();
    const sub = String(it.sub || "").trim();
    const val = Number(it.val != null ? it.val : it.value) || 0;
    const cat = String(it.cat || "").trim();
    if (!name || val <= 0) continue;
    const info = lookupPpCostInfoD1_(costs, name, sub);
    const unitPrice = info ? Number(info.unitPrice != null ? info.unitPrice : info.per100) || 0 : 0;
    if (!info || !(unitPrice > 0)) missing++;
    let piece = false;
    if (info && info.piece) piece = true;
    else if (cat === "chew" || cat === "chews") piece = true;
    else if (isPieceSkuNameD1_(name) || /шт/i.test(name)) piece = true;
    else if (info && info.grams === false) piece = true;
    const cost = piece ? unitPrice * val : (val / 100) * unitPrice;
    totalCost += cost;
    lines.push({
      name: name,
      sub: sub,
      val: val,
      per100: unitPrice,
      unitPrice: unitPrice,
      piece: piece,
      cat: cat,
      cost: Math.round(cost * 100) / 100
    });
  }
  return {
    lines: lines,
    rawCost: Math.round(totalCost * 100) / 100,
    missing: missing
  };
}

async function calcPpFactFromD1Costs_(params, env, ctx, costs) {
  const basket = parseBasketParamD1_(params);
  const built = buildPpLinesFromCostsD1_(basket, costs);
  if (built.missing > 0 || !built.lines.length) return null;
  const schemeFact = resolvePpSchemeD1_({
    scheme: params.scheme,
    wishes: params.wishes,
    forNew: params.forNew === true || params.forNew === "1" || params.forNew === 1
  });
  const coefIn = params.coef != null && params.coef !== "" ? params.coef : null;
  const packOpt = parsePackCountsParamD1_(params);
  let retailGoods = 0;
  try {
    const retailSnap = await ensureRetailPricesSnap_(env, ctx);
    if (retailSnap && Array.isArray(retailSnap.items) && retailSnap.items.length) {
      retailGoods = retailGoodsBynFromBasketD1_(retailMapFromItemsD1_(retailSnap.items), basket);
    }
  } catch (eR) {}
  const fact = computePpFactFromCostD1_(
    built.rawCost,
    basket,
    params.deliveriesN || params.deliveries,
    coefIn,
    packOpt,
    schemeFact,
    built.lines,
    retailGoods
  );
  const ok = {
    status: "success",
    cost: built.rawCost,
    rawCost: built.rawCost,
    lines: built.lines,
    markup: fact.coef,
    scheme: fact.scheme,
    total: Math.round(built.rawCost * fact.coef * 100) / 100,
    cutover: true,
    fromD1: true,
    fromGas: false,
    sandbox: false,
    priceCanon: "d1-primary",
    d1Verified: true
  };
  Object.keys(fact).forEach(function (fk) {
    ok[fk] = fact[fk];
  });
  ok.cost = built.rawCost;
  ok.rawCost = built.rawCost;
  ok.markup = fact.coef;
  ok.scheme = fact.scheme;
  ok.total = Math.round(built.rawCost * fact.coef * 100) / 100;
  return ok;
}

async function warmPpCostsFromGas_(params, env, ctx) {
  const live = await gasProxy_("calcPpFact", params, env, { write: false });
  if (live && live.status === "success" && Array.isArray(live.lines)) {
    try {
      await mergePriceCostsPpFromLinesD1_(env, live.lines);
    } catch (eW) {}
  }
  if (live && typeof live === "object") {
    live.cutover = true;
    live.fromGas = true;
    live.fromD1 = false;
    live.sandbox = false;
    live.priceCanon = "d1-primary";
  }
  return live;
}

async function calcPpFactD1_(params, env, ctx) {
  const force =
    String((params && params.force) || "") === "1" ||
    (params && (params.force === true || params.force === 1));
  if (!force) {
    const snap = await getSnapRaw_(env, "priceCostsPp");
    if (snap && snap.costs && typeof snap.costs === "object") {
      const local = await calcPpFactFromD1Costs_(params, env, ctx, snap.costs);
      if (local) return local;
    }
  }
  return warmPpCostsFromGas_(params, env, ctx);
}

async function calcPricePpD1_(params, env, ctx) {
  const force =
    String((params && params.force) || "") === "1" ||
    (params && (params.force === true || params.force === 1));
  const wantFact =
    params.fullFact === true ||
    params.fullFact === "1" ||
    params.fullFact === 1 ||
    !!(params.deliveriesN || params.deliveries);
  if (!force) {
    const snap = await getSnapRaw_(env, "priceCostsPp");
    if (snap && snap.costs && typeof snap.costs === "object") {
      const basket = parseBasketParamD1_(params);
      const built = buildPpLinesFromCostsD1_(basket, snap.costs);
      if (built.missing === 0 && built.lines.length) {
        const refMarkup = 2.3;
        const ok = {
          status: "success",
          mode: params.mode || "pp",
          sheet: "пп d1",
          costRowLabel: "",
          lines: built.lines,
          cost: built.rawCost,
          rawCost: built.rawCost,
          markup: refMarkup,
          total: Math.round(built.rawCost * refMarkup * 100) / 100,
          cutover: true,
          fromD1: true,
          fromGas: false,
          sandbox: false,
          priceCanon: "d1-primary",
          d1Verified: true
        };
        if (wantFact) {
          const factFull = await calcPpFactFromD1Costs_(params, env, ctx, snap.costs);
          if (factFull) {
            Object.keys(factFull).forEach(function (fk) {
              if (fk === "mode" || fk === "sheet") return;
              ok[fk] = factFull[fk];
            });
            ok.cost = built.rawCost;
            ok.rawCost = built.rawCost;
            ok.mode = params.mode || "pp";
            ok.sheet = "пп d1";
          }
        }
        return ok;
      }
    }
  }
  const live = await gasProxy_("calcPrice", params, env, { write: false });
  if (live && live.status === "success" && Array.isArray(live.lines)) {
    try {
      await mergePriceCostsPpFromLinesD1_(env, live.lines);
    } catch (eW2) {}
  }
  if (live && typeof live === "object") {
    live.cutover = true;
    live.fromGas = true;
    live.fromD1 = false;
    live.sandbox = false;
    live.priceCanon = "d1-primary";
  }
  return live || { status: "error", message: "gas_proxy_failed", cutover: true, action: "calcPrice" };
}

async function calcPriceRetailD1_(params, env, ctx) {
  const snap = await ensureRetailPricesSnap_(env, ctx);
  if (!snap || !Array.isArray(snap.items) || !snap.items.length) {
    // fallback GAS
    const live = await gasProxy_("calcPrice", params, env, { write: false });
    if (live && typeof live === "object") {
      live.cutover = true;
      live.fromGas = true;
      live.sandbox = false;
      return live;
    }
    return { status: "error", message: "retail_prices_missing", cutover: true, action: "calcPrice" };
  }
  const map = retailMapFromItemsD1_(snap.items);
  const del = snap.delivery || { fee: 9, freeFrom: 80 };
  let basket = params.basket;
  if (typeof basket === "string") {
    try {
      basket = JSON.parse(basket);
    } catch (eB) {
      basket = [];
    }
  }
  if (!Array.isArray(basket)) basket = [];
  const rLines = [];
  let rTotal = 0;
  for (let ri = 0; ri < basket.length; ri++) {
    const rit = basket[ri] || {};
    const rname = String(rit.name || rit.main || "").trim();
    const rsub = String(rit.sub || "").trim();
    const rval = Number(rit.val != null ? rit.val : rit.value) || 0;
    if (!rname || rval <= 0) continue;
    const rc = retailLineCostD1_(map, rname, rsub, rval, rit.cat);
    rTotal += rc.cost;
    rLines.push({ name: rname, sub: rsub, val: rval, per100: rc.per, cost: rc.cost, found: rc.found });
  }
  rTotal = Math.round(rTotal * 100) / 100;
  const rN = Math.max(1, Number(params.deliveriesN) || 1);
  const rPer = rTotal / rN;
  const fee = Number(del.fee) || 9;
  const freeFrom = Number(del.freeFrom) || 80;
  let rDelivTimes = 0;
  if (rTotal > 0) {
    for (let rdi = 0; rdi < rN; rdi++) {
      if (rPer < freeFrom) rDelivTimes++;
    }
  }
  const rDeliv = Math.round(rDelivTimes * fee * 100) / 100;
  const rGrand = Math.round((rTotal + rDeliv) * 100) / 100;
  return {
    status: "success",
    mode: params.mode || "retail",
    sheet: "розница d1",
    lines: rLines,
    cost: rTotal,
    goods: rTotal,
    delivery: rDeliv,
    deliveryTimes: rDelivTimes,
    perDelivery: Math.round(rPer * 100) / 100,
    deliveriesN: rN,
    markup: 1,
    total: rGrand,
    cutover: true,
    fromD1: true,
    fromGas: false,
    sandbox: false,
    priceCanon: "d1-primary",
    d1Verified: true
  };
}


function hasTelegramToken_(env) {
  const t = env && (env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_TOKEN);
  return !!(t && String(t).trim());
}

function getTelegramTokenWorker_(env) {
  return String((env && (env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_TOKEN)) || "").trim();
}

async function telegramSendTextWorker_(env, chatId, text, markup) {
  const token = getTelegramTokenWorker_(env);
  const id = chatId != null ? String(chatId).trim() : "";
  if (!token) {
    return { ok: false, error: "no_token", message: "no_token", description: "Нет TELEGRAM_BOT_TOKEN в Worker secrets" };
  }
  if (!id) {
    return { ok: false, error: "no_chat", message: "no_chat", description: "Пустой chat id" };
  }
  const payload = {
    chat_id: id,
    text: String(text || "").slice(0, 3500),
    disable_web_page_preview: false
  };
  if (markup) payload.reply_markup = markup;
  try {
    const res = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await res.json();
    return body;
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

async function telegramStatusD1_(params, env) {
  if (hasTelegramToken_(env)) {
    return {
      status: "success",
      hasToken: true,
      telegramCanon: "worker",
      cutover: true,
      fromD1: true,
      fromGas: false,
      sandbox: false,
      d1Verified: true
    };
  }
  // fallback GAS (токен только в Script Properties)
  const live = await gasProxy_("telegramStatus", params || {}, env, { write: false });
  if (live && typeof live === "object") {
    live.cutover = true;
    live.fromGas = true;
    live.fromD1 = false;
    live.telegramCanon = "sheets-fallback";
  }
  return live || { status: "success", hasToken: false, telegramCanon: "none", cutover: true };
}

async function prepareCourierRouteD1_(params, env) {
  const text = String((params && params.text) || "");
  if (!text) return { status: "error", message: "empty_text", cutover: true };
  let ticket = params && params.ticket ? String(params.ticket).replace(/[^a-zA-Z0-9_:-]/g, "").slice(0, 64) : "";
  if (!ticket) ticket = String(Date.now()) + "_" + String(Math.floor(Math.random() * 1e6));
  await putSnap_(env, "routeTicket:" + ticket, {
    text: text.slice(0, 90000),
    at: Date.now(),
    status: "success"
  });
  return {
    status: "success",
    ticket: ticket,
    cutover: true,
    fromD1: true,
    fromGas: false,
    sandbox: false,
    d1Verified: true
  };
}

async function sendCourierRouteD1_(params, env, actionName) {
  const chatId = (params && (params.telegramId || params.chatId || params.id)) || "";
  let text = String((params && params.text) || "");
  const ticket = params && params.ticket ? String(params.ticket) : "";
  if (ticket) {
    try {
      const cached = await getSnapRaw_(env, "routeTicket:" + ticket);
      if (cached && cached.text) text = String(cached.text);
    } catch (eT) {}
  }
  if (!chatId) {
    return {
      status: "error",
      message: "no_chat",
      description: "Пустой chat id курьера",
      cutover: true
    };
  }
  if (!text) {
    // ticket мог быть только в GAS Cache — fallback
    if (!hasTelegramToken_(env) || ticket) {
      const live = await gasProxy_(actionName || "sendCourierRoute", params || {}, env, { write: true });
      if (live && typeof live === "object") {
        live.cutover = true;
        live.fromGas = true;
        live.fromD1 = false;
      }
      return live || { status: "error", message: "need_id_and_text", cutover: true };
    }
    return {
      status: "error",
      message: "need_id_and_text",
      description: "Нет текста маршрута",
      cutover: true
    };
  }
  if (!hasTelegramToken_(env)) {
    const live = await gasProxy_(actionName || "sendCourierRoute", params || {}, env, { write: true });
    if (live && typeof live === "object") {
      live.cutover = true;
      live.fromGas = true;
      live.fromD1 = false;
      live.telegramCanon = "sheets-fallback";
    }
    return live || { status: "error", message: "no_token", cutover: true };
  }
  const result = await telegramSendTextWorker_(env, chatId, text, null);
  if (result && result.ok) {
    return {
      status: "success",
      cutover: true,
      fromD1: true,
      fromGas: false,
      sandbox: false,
      d1Verified: true,
      telegramCanon: "worker",
      action: actionName || "sendCourierRoute"
    };
  }
  return {
    status: "error",
    message: (result && (result.description || result.message || result.error)) || "send_failed",
    raw: result,
    cutover: true,
    fromD1: true,
    telegramCanon: "worker"
  };
}

function personalizeSurveyBodyD1_(body, nick) {
  const n = String(nick || "").trim();
  let t = String(body || "");
  if (n) t = t.replace(/!\s/, n + "! ").replace(/Здравствуйте,\s*!/, "Здравствуйте, " + n + "!");
  return t;
}

async function forceSurveyRemindD1_(params, env, ctx) {
  if (!hasTelegramToken_(env)) {
    const live = await gasProxy_("forceSurveyRemind", params || {}, env, { write: true });
    if (live && typeof live === "object") {
      live.cutover = true;
      live.fromGas = true;
      live.fromD1 = false;
      live.telegramCanon = "sheets-fallback";
    }
    return live || { status: "error", message: "no_token", cutover: true };
  }
  const onlyNick = String((params && (params.nick || params.client)) || "").trim();
  const today = todayIsoMinskD1_();
  const sentKey = "bp_survey_remind_" + today;
  let already = {};
  try {
    already = (await getSnapRaw_(env, sentKey)) || {};
    if (already && already.map) already = already.map;
  } catch (eA) {
    already = {};
  }
  if (!already || typeof already !== "object") already = {};

  let surveys = [];
  try {
    const snap = await getSnapRaw_(env, "listSurvey");
    surveys = (snap && (snap.items || snap.surveys || snap.list)) || [];
  } catch (eS) {
    surveys = [];
  }
  if (!surveys.length) {
    // cold
    try {
      const liveList = await gasProxy_("listSurvey", {}, env, { write: false });
      if (liveList && liveList.status === "success") {
        surveys = liveList.items || liveList.surveys || [];
        try {
          await putSnap_(env, "listSurvey", Object.assign({}, liveList, { cachedAt: new Date().toISOString() }));
        } catch (eP) {}
      }
    } catch (eL) {}
  }

  let templates = [];
  try {
    const tpl =
      (await getSnapRaw_(env, "listTemplates:survey")) || (await getSnapRaw_(env, "listTemplates"));
    templates = (tpl && (tpl.items || tpl.templates || tpl.list)) || [];
  } catch (eT) {
    templates = [];
  }

  function tplBody(id, nick) {
    const want = String(id || "").toLowerCase();
    for (let i = 0; i < templates.length; i++) {
      if (String(templates[i].id || "").toLowerCase() === want) {
        return personalizeSurveyBodyD1_(templates[i].body || "", nick);
      }
    }
    return "";
  }

  const sent = [];
  const skipped = [];
  for (let i = 0; i < surveys.length; i++) {
    const obj = surveys[i] || {};
    const nick = String(obj.nick || "").trim();
    if (!nick) continue;
    if (onlyNick && !nicksMatchLooseD1_(nick, onlyNick)) continue;
    const st = String(obj.status || "").toLowerCase();
    if (st && st !== "due" && st !== "planned" && st !== "open") {
      skipped.push({ nick: nick, reason: "status:" + st });
      continue;
    }
    const due = String(obj.dueDate || "").slice(0, 10);
    if (due && due > today && !onlyNick) {
      skipped.push({ nick: nick, reason: "due_future:" + due });
      continue;
    }
    const tid = String(obj.ownerTelegramId || "").trim();
    if (!tid) {
      skipped.push({ nick: nick, reason: "no_target" });
      continue;
    }
    const kindKey = /final/i.test(String(obj.kind || "")) ? "survey_final" : "survey_bp2";
    const dedupe = normalizeMatchKey_(nick) + "|" + kindKey + "|" + due + "|" + tid;
    if (already[dedupe]) {
      skipped.push({ nick: nick, reason: "already_day", tid: tid });
      continue;
    }
    const body =
      tplBody(obj.templateId, nick) ||
      tplBody(kindKey, nick) ||
      ("Опросник для " + nick);
    const kindLabel = kindKey === "survey_final" ? "ПП (финал)" : "БП2";
    const text =
      "📋 Опросник · " +
      kindLabel +
      "\nКому отправить: " +
      nick +
      "\n" +
      (obj.stage ? "Этап: " + obj.stage + "\n" : "") +
      "Дата: " +
      (due || today) +
      "\n⚡ forceSurveyRemind · worker\n\nТекст опросника:\n" +
      body;
    let markup = null;
    if (obj.id) {
      markup = {
        inline_keyboard: [[{ text: "✅ Отправлено", callback_data: ("svsent:" + String(obj.id)).slice(0, 64) }]]
      };
    }
    const sendRes = await telegramSendTextWorker_(env, tid, text, markup);
    already[dedupe] = 1;
    sent.push({
      nick: nick,
      tid: tid,
      id: obj.id || "",
      ok: !!(sendRes && sendRes.ok !== false),
      raw: sendRes
    });
  }

  try {
    await putSnap_(env, sentKey, Object.assign({}, already, { _savedAt: Date.now(), day: today }));
  } catch (eSave) {}

  return {
    status: "success",
    sent: sent,
    skipped: skipped,
    force: true,
    cutover: true,
    fromD1: true,
    fromGas: false,
    sandbox: false,
    d1Verified: true,
    telegramCanon: "worker"
  };
}

function nicksMatchLooseD1_(a, b) {
  const x = normalizeMatchKey_(a);
  const y = normalizeMatchKey_(b);
  if (!x || !y) return false;
  return x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0;
}



/* —— Varka / Goodboy D1-primary (snap) —— */

async function ensurePartnerAdminSnap_(env, ctx) {
  let admin = await getSnapRaw_(env, "partnerListAdmin");
  if (admin && admin.status === "success" && Array.isArray(admin.networks)) return admin;
  try {
    const live = await gasProxy_("partnerListAdmin", {}, env, { write: false });
    if (live && live.status === "success") {
      await putSnap_(env, "partnerListAdmin", Object.assign({}, live, { cachedAt: new Date().toISOString() }));
      return live;
    }
  } catch (e) {}
  return admin || { status: "success", networks: [], points: [], access: [], catalog: PARTNER_CATALOG_STATIC };
}

async function partnerListAdminD1_(params, env, ctx) {
  let admin = await getSnapRaw_(env, "partnerListAdmin");
  const force = String((params && params.force) || "") === "1";
  const ok =
    admin &&
    admin.status === "success" &&
    Array.isArray(admin.networks) &&
    !force;
  if (ok) {
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(
        (async function () {
          try {
            const live = await gasProxy_("partnerListAdmin", params || {}, env, { write: false });
            if (live && live.status === "success") {
              await putSnap_(env, "partnerListAdmin", Object.assign({}, live, { cachedAt: new Date().toISOString() }));
            }
          } catch (e) {}
        })()
      );
    }
    return Object.assign({}, admin, {
      cutover: true,
      fromD1: true,
      fromGas: false,
      sandbox: false,
      d1Verified: true,
      partnerCanon: partnerCanonLabel_(env)
    });
  }
  const live = await gasProxy_("partnerListAdmin", params || {}, env, { write: false });
  if (live && live.status === "success" && env && env.DB) {
    try {
      await putSnap_(env, "partnerListAdmin", Object.assign({}, live, { cachedAt: new Date().toISOString() }));
    } catch (eS) {}
  }
  if (live && typeof live === "object") {
    live.cutover = true;
    live.fromGas = true;
    live.fromD1 = false;
    live.partnerCanon = partnerCanonLabel_(env);
  }
  return live;
}

async function partnerListMyOrdersD1_(params, env, ctx) {
  const tid = String((params && params.telegramId) || "").trim();
  const user = partnerNormUserWorker_(params && params.username);
  let pack = (await getSnapRaw_(env, "partnerOrders")) || { status: "success", orders: [] };
  let orders = Array.isArray(pack.orders) ? pack.orders.slice() : [];
  if (orders.length || String((params && params.force) || "") !== "1") {
    if (isPartnerArseniy_(params)) {
      orders = orders.filter(function (o) {
        return String((o && (o.locationId || o.pointId)) || "") === PARTNER_ARSENIY_POINT.id;
      });
    } else if (tid || user) {
      orders = orders.filter(function (o) {
        const ot = String((o && o.telegramId) || "").trim();
        const ou = partnerNormUserWorker_(o && o.username);
        return (tid && ot === tid) || (user && ou === user);
      });
    }
    if (orders.length || (pack && pack._d1TouchedAt)) {
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(
          (async function () {
            try {
              const live = await gasProxy_("partnerListMyOrders", params || {}, env, { write: false });
              if (live && live.status === "success" && Array.isArray(live.orders)) {
                // merge into global pack by id
                let all = (await getSnapRaw_(env, "partnerOrders")) || { status: "success", orders: [] };
                const byId = {};
                (all.orders || []).forEach(function (o) {
                  if (o && o.id) byId[o.id] = o;
                });
                live.orders.forEach(function (o) {
                  if (o && o.id) byId[o.id] = o;
                });
                all.orders = Object.keys(byId).map(function (k) {
                  return byId[k];
                });
                all.status = "success";
                await putSnap_(env, "partnerOrders", all);
              }
            } catch (e) {}
          })()
        );
      }
      return {
        status: "success",
        orders: orders,
        cutover: true,
        fromD1: true,
        fromGas: false,
        sandbox: false,
        d1Verified: true,
        partnerCanon: partnerCanonLabel_(env)
      };
    }
  }
  const live = await gasProxy_("partnerListMyOrders", params || {}, env, { write: false });
  if (live && live.status === "success" && env && env.DB) {
    try {
      let all = (await getSnapRaw_(env, "partnerOrders")) || { status: "success", orders: [] };
      const byId = {};
      (all.orders || []).forEach(function (o) {
        if (o && o.id) byId[o.id] = o;
      });
      (live.orders || []).forEach(function (o) {
        if (o && o.id) byId[o.id] = o;
      });
      all.orders = Object.keys(byId).map(function (k) {
        return byId[k];
      });
      all.status = "success";
      await putSnap_(env, "partnerOrders", all);
    } catch (eS) {}
    live.cutover = true;
    live.fromGas = true;
    live.partnerCanon = partnerCanonLabel_(env);
  }
  return partnerGuardOrRewrite_("partnerListMyOrders", params, live);
}

function partnerUid_(prefix) {
  return String(prefix || "po") + "_" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

function partnerDefaultSlotWorker_() {
  const now = new Date();
  // Europe/Minsk approx: UTC+3
  const minsk = new Date(now.getTime() + 3 * 3600 * 1000);
  let d = new Date(Date.UTC(minsk.getUTCFullYear(), minsk.getUTCMonth(), minsk.getUTCDate() + 1));
  // skip Sunday (0)
  if (d.getUTCDay() === 0) d = new Date(d.getTime() + 86400000);
  const iso = d.toISOString().slice(0, 10);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return {
    dateIso: iso,
    dateLabel: dd + "." + mm,
    timeFrom: "12:00",
    timeTo: "18:00",
    timeLabel: "12:00–18:00"
  };
}

async function mutatePartnerD1_(action, params, env) {
  const a = String(action || "");
  if (/^partnerSeedDefaults$/i.test(a)) {
    // seed — только GAS (миграции V3…V13); D1 подтянет после
    return { status: "error", message: "seed_via_gas" };
  }
  let admin = await ensurePartnerAdminSnap_(env, null);
  admin = Object.assign({ status: "success", networks: [], points: [], access: [], notifyRecipients: [], catalog: PARTNER_CATALOG_STATIC }, admin || {});
  admin.networks = Array.isArray(admin.networks) ? admin.networks.slice() : [];
  admin.points = Array.isArray(admin.points) ? admin.points.slice() : [];
  admin.access = Array.isArray(admin.access) ? admin.access.slice() : [];
  admin.notifyRecipients = Array.isArray(admin.notifyRecipients) ? admin.notifyRecipients.slice() : [];

  if (/^partnerSaveNetwork$/i.test(a)) {
    const name = String((params && params.name) || "").trim();
    if (!name) return { status: "error", message: "need_name" };
    const id = String((params && params.id) || "").trim() || partnerUid_("net");
    const logo = String((params && params.logo) || "").trim();
    const active = !(params && (params.active === false || params.active === "no" || params.active === 0 || params.active === "0"));
    let hit = -1;
    for (let i = 0; i < admin.networks.length; i++) {
      if (String(admin.networks[i].id) === id) {
        hit = i;
        break;
      }
    }
    const row = { id: id, name: name, logo: logo, active: active };
    if (hit >= 0) admin.networks[hit] = Object.assign({}, admin.networks[hit], row);
    else admin.networks.push(row);
    await putSnap_(env, "partnerListAdmin", Object.assign({}, admin, { cachedAt: new Date().toISOString(), _d1TouchedAt: Date.now() }));
    return { status: "success", id: id, name: name, active: active, d1Verified: true };
  }

  if (/^partnerSavePoint$/i.test(a)) {
    const name = String((params && params.name) || "").trim();
    const networkId = String((params && params.networkId) || "").trim();
    if (!name || !networkId) return { status: "error", message: "need_name_network" };
    const id = String((params && params.id) || "").trim() || partnerUid_("pt");
    const address = String((params && params.address) || "").trim();
    const active = !(params && (params.active === false || params.active === "no" || params.active === 0 || params.active === "0"));
    let hit = -1;
    for (let i = 0; i < admin.points.length; i++) {
      if (String(admin.points[i].id) === id) {
        hit = i;
        break;
      }
    }
    const row = { id: id, networkId: networkId, name: name, address: address, active: active };
    if (hit >= 0) admin.points[hit] = Object.assign({}, admin.points[hit], row);
    else admin.points.push(row);
    await putSnap_(env, "partnerListAdmin", Object.assign({}, admin, { cachedAt: new Date().toISOString(), _d1TouchedAt: Date.now() }));
    return { status: "success", id: id, name: name, networkId: networkId, active: active, d1Verified: true };
  }

  if (/^partnerSaveAccess$/i.test(a)) {
    const username = partnerNormUserWorker_(params && params.username);
    const telegramId = String((params && params.telegramId) || "").trim();
    if (!username && !telegramId) return { status: "error", message: "need_user" };
    const id = String((params && params.id) || "").trim() || partnerUid_("pa");
    let pointIds = params && params.pointIds;
    if (typeof pointIds === "string") {
      try {
        pointIds = JSON.parse(pointIds);
      } catch (e) {
        pointIds = String(pointIds)
          .split(",")
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean);
      }
    }
    if (!Array.isArray(pointIds)) pointIds = [];
    const row = {
      id: id,
      username: username,
      telegramId: telegramId,
      name: String((params && params.name) || "").trim(),
      networkId: String((params && params.networkId) || "").trim(),
      pointIds: pointIds,
      role: String((params && params.role) || "partner").trim() || "partner",
      status: String((params && params.status) || "active").trim() || "active"
    };
    let hit = -1;
    for (let i = 0; i < admin.access.length; i++) {
      if (String(admin.access[i].id) === id) {
        hit = i;
        break;
      }
    }
    if (hit < 0 && username) {
      for (let j = 0; j < admin.access.length; j++) {
        if (partnerNormUserWorker_(admin.access[j].username) === username) {
          hit = j;
          row.id = admin.access[j].id || id;
          break;
        }
      }
    }
    if (hit >= 0) admin.access[hit] = Object.assign({}, admin.access[hit], row);
    else admin.access.push(row);
    await putSnap_(env, "partnerListAdmin", Object.assign({}, admin, { cachedAt: new Date().toISOString(), _d1TouchedAt: Date.now() }));
    return { status: "success", id: row.id, d1Verified: true };
  }

  if (/^partnerRevokeAccess$/i.test(a)) {
    const id = String((params && (params.id || params.accessId)) || "").trim();
    const username = partnerNormUserWorker_(params && params.username);
    let changed = 0;
    for (let i = 0; i < admin.access.length; i++) {
      const row = admin.access[i];
      if ((id && String(row.id) === id) || (username && partnerNormUserWorker_(row.username) === username)) {
        admin.access[i] = Object.assign({}, row, { status: "revoked" });
        changed++;
      }
    }
    if (!changed) return { status: "error", message: "not_found" };
    await putSnap_(env, "partnerListAdmin", Object.assign({}, admin, { cachedAt: new Date().toISOString(), _d1TouchedAt: Date.now() }));
    return { status: "success", revoked: changed, d1Verified: true };
  }

  if (/^partnerSetNotifyRecipients$/i.test(a)) {
    let raw = params && params.recipients != null ? params.recipients : "[]";
    let parsed = [];
    if (Array.isArray(raw)) parsed = raw;
    else {
      try {
        parsed = JSON.parse(String(raw || "[]"));
      } catch (e) {
        parsed = [];
      }
    }
    const list = [];
    for (let i = 0; i < parsed.length; i++) {
      const it = parsed[i];
      const id = String((it && (it.telegramId || it.id)) || it || "").trim();
      if (!id) continue;
      list.push({ telegramId: id, name: (it && it.name) || "" });
    }
    admin.notifyRecipients = list;
    await putSnap_(env, "partnerListAdmin", Object.assign({}, admin, { cachedAt: new Date().toISOString(), _d1TouchedAt: Date.now() }));
    return { status: "success", notifyRecipients: list, count: list.length, d1Verified: true };
  }

  if (/^partnerSubmitOrder$/i.test(a)) {
    const tid = String((params && params.telegramId) || "").trim();
    const username = partnerNormUserWorker_(params && params.username);
    if (!tid && !username) return { status: "error", message: "need_user" };
    const locationId = String((params && params.locationId) || "").trim();
    if (!locationId) return { status: "error", message: "need_location" };
    if (isPartnerArseniy_(params) && locationId !== PARTNER_ARSENIY_POINT.id) {
      return { status: "error", message: "forbidden_point" };
    }
    let basket = params && (params.basket || params.basketJson);
    if (typeof basket === "string") {
      try {
        basket = JSON.parse(basket);
      } catch (e) {
        basket = [];
      }
    }
    if (!Array.isArray(basket)) basket = [];
    basket = basket.filter(function (b) {
      return b && (Number(b.qty) || 0) > 0;
    });
    if (!basket.length) return { status: "error", message: "empty_basket" };
    // NFC rules
    for (let bi = 0; bi < basket.length; bi++) {
      const bb = basket[bi];
      if (!bb || String(bb.id || "") !== "vr_c_nfc") continue;
      const nq = Number(bb.qty) || 0;
      if (nq > 2) return { status: "error", message: "nfc_max_2" };
      if (nq > 1) {
        const reason = String(bb.reason || bb.reasonLabel || bb.note || "").trim();
        if (!reason) return { status: "error", message: "nfc_need_reason" };
      }
    }
    let allowed = false;
    let networkId = String((params && params.networkId) || "").trim();
    let locationName = String((params && params.locationName) || "").trim();
    const access = admin.access || [];
    for (let i = 0; i < access.length; i++) {
      const row = access[i];
      if (String(row.status || "active").toLowerCase() === "revoked") continue;
      const matchU = username && partnerNormUserWorker_(row.username) === username;
      const matchT = tid && String(row.telegramId || "") === tid;
      if (!(matchU || matchT)) continue;
      const pids = row.pointIds || [];
      if (pids.indexOf(locationId) >= 0) {
        allowed = true;
        if (!networkId) networkId = row.networkId || "";
        break;
      }
    }
    // owner without access row: allow if admin snap empty access check fails — GAS will validate
    if (!allowed && !(admin.access || []).length) {
      return { status: "error", message: "need_admin_snap" };
    }
    if (!allowed) {
      // let GAS decide (owner Бойни)
      return { status: "error", message: "forbidden_point_or_owner_gas" };
    }
    for (let p = 0; p < (admin.points || []).length; p++) {
      if (String(admin.points[p].id) === locationId) {
        if (!locationName) locationName = admin.points[p].name || "";
        if (!networkId) networkId = admin.points[p].networkId || "";
        break;
      }
    }
    const slot = partnerDefaultSlotWorker_();
    const id = partnerUid_("po");
    const order = {
      id: id,
      dateIso: new Date().toISOString().slice(0, 10),
      locationId: locationId,
      locationName: locationName,
      networkId: networkId,
      telegramId: tid,
      userName: String((params && params.userName) || "").trim(),
      username: username,
      basket: basket,
      status: "new",
      createdAt: new Date().toISOString(),
      deliverDateIso: slot.dateIso,
      deliverDateLabel: slot.dateLabel,
      deliverTimeFrom: slot.timeFrom,
      deliverTimeTo: slot.timeTo,
      deliverTimeLabel: slot.timeLabel,
      deferredId: ""
    };
    let pack = (await getSnapRaw_(env, "partnerOrders")) || { status: "success", orders: [] };
    pack.orders = Array.isArray(pack.orders) ? pack.orders.slice() : [];
    pack.orders.unshift(order);
    pack.status = "success";
    pack._d1TouchedAt = Date.now();
    await putSnap_(env, "partnerOrders", pack);
    return { status: "success", order: order, id: id, deferredId: "", d1Verified: true, pendingSheets: true };
  }

  if (/^partnerSetOrderStatus$/i.test(a)) {
    const id = String((params && (params.id || params.orderId)) || "").trim();
    const st = String((params && params.status) || "").trim().toLowerCase();
    if (!id || !st) return { status: "error", message: "need_id_status" };
    let pack = (await getSnapRaw_(env, "partnerOrders")) || { status: "success", orders: [] };
    pack.orders = Array.isArray(pack.orders) ? pack.orders.slice() : [];
    let hit = -1;
    for (let i = 0; i < pack.orders.length; i++) {
      if (String(pack.orders[i].id) === id) {
        hit = i;
        break;
      }
    }
    if (hit < 0) return { status: "error", message: "not_found" };
    pack.orders[hit] = Object.assign({}, pack.orders[hit], { status: st, statusAt: new Date().toISOString() });
    pack._d1TouchedAt = Date.now();
    await putSnap_(env, "partnerOrders", pack);
    return { status: "success", id: id, status: st, order: pack.orders[hit], d1Verified: true, pendingSheets: true };
  }

  return { status: "error", message: "unsupported_partner_action" };
}

async function refreshPartnerSnapsFromGas_(action, params, env, live) {
  if (!env || !env.DB || !live) return;
  if (/^partnerSubmitOrder$/i.test(action) && live.order) {
    let pack = (await getSnapRaw_(env, "partnerOrders")) || { status: "success", orders: [] };
    pack.orders = Array.isArray(pack.orders) ? pack.orders.slice() : [];
    const oid = String(live.order.id || live.id || "");
    let replaced = false;
    for (let i = 0; i < pack.orders.length; i++) {
      if (String(pack.orders[i].id) === oid || (live.order && pack.orders[i]._tmp && pack.orders[i].locationId === live.order.locationId)) {
        pack.orders[i] = live.order;
        replaced = true;
        break;
      }
    }
    if (!replaced && live.order) pack.orders.unshift(live.order);
    pack.status = "success";
    await putSnap_(env, "partnerOrders", pack);
  }
  if (/^partnerSetOrderStatus$/i.test(action) && (live.order || live.id)) {
    let pack = (await getSnapRaw_(env, "partnerOrders")) || { status: "success", orders: [] };
    pack.orders = Array.isArray(pack.orders) ? pack.orders.slice() : [];
    const oid = String((live.order && live.order.id) || live.id || params.id || "");
    for (let i = 0; i < pack.orders.length; i++) {
      if (String(pack.orders[i].id) === oid) {
        pack.orders[i] = live.order || Object.assign({}, pack.orders[i], { status: live.status || params.status });
        break;
      }
    }
    await putSnap_(env, "partnerOrders", pack);
  }
  if (/^partner(Save|Revoke|SetNotify|Seed)/i.test(action)) {
    try {
      const admin = await gasProxy_("partnerListAdmin", { telegramId: params && params.telegramId }, env, { write: false });
      if (admin && admin.status === "success") {
        await putSnap_(env, "partnerListAdmin", Object.assign({}, admin, { cachedAt: new Date().toISOString() }));
      }
    } catch (e) {}
  }
}

function gbPartnersStatic_() {
  return [
    {
      id: "varok",
      slug: "varok",
      name: "VARKA",
      blurb: "12 кофеен в Минске — лакомства Бойни уже на витрине",
      locationsCount: 12
    }
  ];
}

function gbBootstrapD1_(params, env) {
  return {
    status: "success",
    demo: false,
    message: "live ok",
    partners: gbPartnersStatic_(),
    sheets: ["GB_Пользователи", "GB_Связки", "GB_Питомцы"],
    cutover: true,
    fromD1: true,
    fromGas: false,
    sandbox: false,
    d1Verified: true,
    gbCanon: gbCanonLabel_(env)
  };
}

function gbPhoneDigitsWorker_(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 12 && d.indexOf("375") === 0) return d;
  if (d.length === 11 && d.charAt(0) === "8") return "375" + d.slice(1);
  if (d.length === 9) return "375" + d;
  return d;
}

function gbPhonesMatchWorker_(a, b) {
  const da = gbPhoneDigitsWorker_(a);
  const db = gbPhoneDigitsWorker_(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 9 && db.length >= 9 && da.slice(-9) === db.slice(-9)) return true;
  return false;
}

function gbUidWorker_(prefix) {
  return String(prefix || "gb") + "_" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

async function gbLoadPack_(env) {
  const users = (await getSnapRaw_(env, "gbUsers")) || { status: "success", users: [] };
  const links = (await getSnapRaw_(env, "gbLinks")) || { status: "success", links: [] };
  const pets = (await getSnapRaw_(env, "gbPets")) || { status: "success", pets: [] };
  return {
    users: Array.isArray(users.users) ? users.users.slice() : [],
    links: Array.isArray(links.links) ? links.links.slice() : [],
    pets: Array.isArray(pets.pets) ? pets.pets.slice() : []
  };
}

async function gbSavePack_(env, pack) {
  await putSnap_(env, "gbUsers", { status: "success", users: pack.users || [], _d1TouchedAt: Date.now() });
  await putSnap_(env, "gbLinks", { status: "success", links: pack.links || [], _d1TouchedAt: Date.now() });
  await putSnap_(env, "gbPets", { status: "success", pets: pack.pets || [], _d1TouchedAt: Date.now() });
}

async function gbFindCrmFromD1_(nick, phone, env) {
  const wantNick = String(nick || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  const snap = await getSnapRaw_(env, "listSubscriptions");
  const subs = (snap && (snap.subscriptions || snap.items || snap.list)) || [];
  if (!Array.isArray(subs) || !subs.length) return null;
  const hits = [];
  for (let i = 0; i < subs.length; i++) {
    const s = subs[i] || {};
    const sn = String(s.client || s.nick || s.name || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
    const matchNick = wantNick && sn && (sn === wantNick || sn.indexOf(wantNick) >= 0 || wantNick.indexOf(sn) >= 0);
    const matchPhone = phone && (gbPhonesMatchWorker_(s.phone, phone) || gbPhonesMatchWorker_(s.tel, phone));
    if (matchNick || matchPhone) {
      hits.push({
        matchKey: s.matchKey || normalizeMatchKey_(s.client || s.nick || ""),
        clientNick: s.client || s.nick || "",
        subId: s.id || s.subId || "",
        segment: s.segment || s.type || ""
      });
    }
  }
  if (!hits.length) return { hit: null, ambiguous: false };
  if (hits.length > 1) return { hit: null, ambiguous: true, candidates: hits.slice(0, 5) };
  return { hit: hits[0], ambiguous: false };
}

function gbBuildMeFromPack_(user, pack, subscription) {
  const tid = String((user && user.telegramId) || "");
  const pets = (pack.pets || []).filter(function (p) {
    return String(p.ownerTelegramId || "") === tid;
  });
  let link = null;
  for (let i = 0; i < (pack.links || []).length; i++) {
    if (String(pack.links[i].telegramId || "") === tid || String(pack.links[i].userId || "") === String(user.userId || "")) {
      link = pack.links[i];
      break;
    }
  }
  return {
    status: "success",
    user: {
      userId: user.userId,
      telegramId: user.telegramId,
      name: user.name || "",
      username: user.username || "",
      phone: user.phone || "",
      access: user.access || "limited"
    },
    pets: pets,
    activePetId: pets[0] ? pets[0].id : null,
    link: link,
    subscription: subscription || null,
    partners: gbPartnersStatic_(),
    privilege: subscription && String(subscription.segment || "").toUpperCase().indexOf("ПП") >= 0
      ? { active: true }
      : { active: false }
  };
}

async function mutateGbD1_(action, params, env) {
  const a = String(action || "");
  if (/^gbEnsureSheets$/i.test(a)) {
    return {
      status: "success",
      sheets: ["GB_Пользователи", "GB_Связки", "GB_Питомцы"],
      d1Verified: true
    };
  }
  let pack = await gbLoadPack_(env);
  const now = new Date().toISOString();

  function upsertUser(opts) {
    const tid = String((opts && opts.telegramId) || "").trim();
    if (!tid) return null;
    let idx = -1;
    for (let i = 0; i < pack.users.length; i++) {
      if (String(pack.users[i].telegramId) === tid) {
        idx = i;
        break;
      }
    }
    const base =
      idx >= 0
        ? Object.assign({}, pack.users[idx])
        : {
            userId: gbUidWorker_("u"),
            telegramId: tid,
            createdAt: now,
            access: "limited"
          };
    if (opts.name != null && String(opts.name).trim()) base.name = String(opts.name).trim();
    if (opts.username != null && String(opts.username).trim()) base.username = String(opts.username).trim().replace(/^@/, "");
    if (opts.phone != null && String(opts.phone).trim()) base.phone = String(opts.phone).trim();
    if (opts.access != null) base.access = String(opts.access);
    base.lastLoginAt = now;
    if (idx >= 0) pack.users[idx] = base;
    else pack.users.push(base);
    return base;
  }

  if (/^gbMe$/i.test(a)) {
    const tid = String((params && params.telegramId) || "").trim();
    if (!tid) return { status: "error", message: "need_telegramId" };
    if (!pack.users.length) return { status: "error", message: "cold_gb" };
    const user = upsertUser({
      telegramId: tid,
      name: (params && params.name) || "",
      username: (params && (params.username || params.nick)) || "",
      phone: (params && params.phone) || ""
    });
    await gbSavePack_(env, pack);
    return Object.assign({}, gbBuildMeFromPack_(user, pack, null), { d1Verified: true });
  }

  if (/^gbRegister$/i.test(a)) {
    const name = String((params && params.name) || "").trim();
    const phone = String((params && params.phone) || "").trim();
    const nick = String((params && (params.nick || params.username)) || "").trim().replace(/^@/, "");
    const hasSub =
      params &&
      (params.hasSubscription === true ||
        params.hasSubscription === "true" ||
        params.hasSubscription === "1" ||
        params.hasSubscription === "yes");
    if (!name) return { status: "error", message: "Укажите имя" };
    if (!phone || gbPhoneDigitsWorker_(phone).length < 9) return { status: "error", message: "Укажите телефон" };
    const telegramId = String((params && params.telegramId) || "").trim() || gbUidWorker_("web");
    let user = upsertUser({
      telegramId: telegramId,
      name: name,
      username: nick,
      phone: phone,
      access: hasSub ? "full" : "limited"
    });
    let needsLink = !!hasSub;
    if (hasSub) {
      const found = await gbFindCrmFromD1_(nick, phone, env);
      if (found && found.hit && !found.ambiguous) {
        const link = {
          userId: user.userId,
          telegramId: user.telegramId,
          matchKey: found.hit.matchKey,
          clientNick: found.hit.clientNick,
          subId: found.hit.subId,
          segment: found.hit.segment,
          status: "linked",
          verifyMethod: nick ? "nick" : "phone",
          phone: phone,
          linkedAt: now
        };
        let li = -1;
        for (let i = 0; i < pack.links.length; i++) {
          if (String(pack.links[i].telegramId) === telegramId) {
            li = i;
            break;
          }
        }
        if (li >= 0) pack.links[li] = Object.assign({}, pack.links[li], link);
        else pack.links.push(link);
        user = upsertUser({
          telegramId: telegramId,
          name: name,
          username: nick,
          phone: phone,
          access: found.hit.segment ? "full" : "limited"
        });
        needsLink = !found.hit.segment;
      }
    }
    await gbSavePack_(env, pack);
    const payload = gbBuildMeFromPack_(user, pack, null);
    payload.needsLink = needsLink && !(payload.link && payload.link.status === "linked" && payload.link.segment);
    payload.registered = true;
    payload.d1Verified = true;
    return payload;
  }

  if (/^gbLogin$/i.test(a)) {
    const phone = String((params && params.phone) || "").trim();
    const nick = String((params && (params.nick || params.username)) || "").trim().replace(/^@/, "");
    if (!phone && !nick) return { status: "error", message: "Укажите телефон или ник" };
    if (!pack.users.length) return { status: "error", message: "cold_gb" };
    let telegramId = String((params && params.telegramId) || "").trim();
    let existing = null;
    if (telegramId) {
      for (let i = 0; i < pack.users.length; i++) {
        if (String(pack.users[i].telegramId) === telegramId) {
          existing = pack.users[i];
          break;
        }
      }
    }
    if (!existing) {
      for (let i = 0; i < pack.users.length; i++) {
        const row = pack.users[i];
        if (phone && gbPhonesMatchWorker_(row.phone, phone)) {
          existing = row;
          break;
        }
        const un = String(row.username || "")
          .trim()
          .replace(/^@/, "")
          .toLowerCase();
        if (nick && un && un === nick.toLowerCase()) {
          existing = row;
          break;
        }
      }
    }
    if (!existing) return { status: "error", message: "cold_or_not_found" };
    telegramId = String(existing.telegramId);
    const user = upsertUser({
      telegramId: telegramId,
      phone: phone || existing.phone,
      username: nick || existing.username,
      name: (params && params.name) || existing.name
    });
    await gbSavePack_(env, pack);
    const payload = gbBuildMeFromPack_(user, pack, null);
    payload.loggedIn = true;
    payload.d1Verified = true;
    return payload;
  }

  if (/^gbLinkClient$/i.test(a)) {
    const telegramId = String((params && params.telegramId) || "").trim();
    if (!telegramId) return { status: "error", message: "need_telegramId" };
    const phone = String((params && params.phone) || "").trim();
    const nick = String((params && (params.nick || params.username)) || "").trim().replace(/^@/, "");
    if (!phone && !nick) return { status: "error", message: "Укажите телефон или ник" };
    const found = await gbFindCrmFromD1_(nick, phone, env);
    if (!found) return { status: "error", message: "cold_crm" };
    if (found.ambiguous) {
      return {
        status: "error",
        message: "Несколько совпадений — уточните Instagram-ник",
        code: "ambiguous",
        candidates: found.candidates || []
      };
    }
    if (!found.hit) return { status: "error", message: "Клиент не найден в подписках", code: "not_found" };
    const user = upsertUser({
      telegramId: telegramId,
      phone: phone || undefined,
      username: nick || undefined,
      name: (params && params.name) || found.hit.clientNick,
      access: found.hit.segment ? "full" : "limited"
    });
    const link = {
      userId: user.userId,
      telegramId: user.telegramId,
      matchKey: found.hit.matchKey,
      clientNick: found.hit.clientNick,
      subId: found.hit.subId,
      segment: found.hit.segment,
      status: "linked",
      verifyMethod: nick ? "nick" : "phone",
      phone: phone,
      linkedAt: now
    };
    let li = -1;
    for (let i = 0; i < pack.links.length; i++) {
      if (String(pack.links[i].telegramId) === telegramId) {
        li = i;
        break;
      }
    }
    if (li >= 0) pack.links[li] = Object.assign({}, pack.links[li], link);
    else pack.links.push(link);
    await gbSavePack_(env, pack);
    const payload = gbBuildMeFromPack_(user, pack, null);
    payload.link = link;
    payload.d1Verified = true;
    return payload;
  }

  if (/^gbSavePet$/i.test(a)) {
    const telegramId = String((params && params.telegramId) || "").trim();
    if (!telegramId) return { status: "error", message: "need_telegramId" };
    let pet = null;
    if (params && params.pet && typeof params.pet === "object") pet = params.pet;
    else if (params && params.petJson) {
      try {
        pet = JSON.parse(String(params.petJson));
      } catch (eJ) {
        pet = null;
      }
    } else pet = params;
    if (!pet || typeof pet !== "object") return { status: "error", message: "need_pet" };
    upsertUser({ telegramId: telegramId });
    const id = String(pet.id || "").trim() || gbUidWorker_("pet");
    const row = {
      id: id,
      ownerTelegramId: telegramId,
      name: String(pet.name || "").trim(),
      breed: String(pet.breed || "").trim(),
      weightKg: pet.weightKg != null ? Number(pet.weightKg) : "",
      ageYears: pet.ageYears != null ? Number(pet.ageYears) : "",
      sex: String(pet.sex || "").trim(),
      allergies: String(pet.allergies || "").trim(),
      notes: String(pet.notes || "").trim(),
      updatedAt: now
    };
    let pi = -1;
    for (let i = 0; i < pack.pets.length; i++) {
      if (String(pack.pets[i].id) === id) {
        pi = i;
        break;
      }
    }
    if (pi >= 0) pack.pets[pi] = Object.assign({}, pack.pets[pi], row);
    else pack.pets.push(row);
    await gbSavePack_(env, pack);
    return { status: "success", pet: row, d1Verified: true };
  }

  return { status: "error", message: "unsupported_gb_action" };
}

async function refreshGbSnapsFromGas_(action, params, env, live) {
  if (!env || !env.DB || !live || live.status !== "success") return;
  // merge user/pets/link from live payload into snaps
  let pack = await gbLoadPack_(env);
  if (live.user) {
    const tid = String(live.user.telegramId || "");
    let idx = -1;
    for (let i = 0; i < pack.users.length; i++) {
      if (String(pack.users[i].telegramId) === tid) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) pack.users[idx] = Object.assign({}, pack.users[idx], live.user);
    else pack.users.push(live.user);
  }
  if (live.link) {
    const tid = String(live.link.telegramId || (live.user && live.user.telegramId) || "");
    let idx = -1;
    for (let i = 0; i < pack.links.length; i++) {
      if (String(pack.links[i].telegramId) === tid) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) pack.links[idx] = Object.assign({}, pack.links[idx], live.link);
    else pack.links.push(live.link);
  }
  if (Array.isArray(live.pets)) {
    live.pets.forEach(function (p) {
      if (!p || !p.id) return;
      let idx = -1;
      for (let i = 0; i < pack.pets.length; i++) {
        if (String(pack.pets[i].id) === String(p.id)) {
          idx = i;
          break;
        }
      }
      if (idx >= 0) pack.pets[idx] = Object.assign({}, pack.pets[idx], p);
      else pack.pets.push(p);
    });
  }
  if (live.pet && live.pet.id) {
    let idx = -1;
    for (let i = 0; i < pack.pets.length; i++) {
      if (String(pack.pets[i].id) === String(live.pet.id)) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) pack.pets[idx] = Object.assign({}, pack.pets[idx], live.pet);
    else pack.pets.push(live.pet);
  }
  await gbSavePack_(env, pack);
}



async function submitGoodboyTryD1_(params, env) {
  const name = String((params && params.name) || "").trim();
  const phone = String((params && params.phone) || "").trim();
  const pet = String((params && params.pet) || "").trim();
  const note = String((params && params.note) || "").trim();
  const mode = String((params && params.mode) || "").trim();
  if (!name || !phone || !pet) {
    return { status: "error", message: "need_fields" };
  }
  const when = new Date().toISOString();
  const source = mode === "full" ? "try-full" : "try-short";
  const row = {
    id: "try_" + Date.now().toString(36),
    when: when,
    name: name,
    phone: phone,
    pet: pet,
    note: note,
    source: source
  };
  let pack = (await getSnapRaw_(env, "goodboyLeads")) || { status: "success", items: [] };
  pack.items = Array.isArray(pack.items) ? pack.items.slice() : [];
  pack.items.unshift(row);
  if (pack.items.length > 500) pack.items = pack.items.slice(0, 500);
  pack.status = "success";
  pack._d1TouchedAt = Date.now();
  await putSnap_(env, "goodboyLeads", pack);
  // TG команде — бот Бойни (тот же TELEGRAM_BOT_TOKEN)
  try {
    const chat =
      String((env && (env.TELEGRAM_CHAT_ID || env.TELEGRAM_NOTIFY_CHAT)) || "").trim() ||
      "";
    if (chat && hasTelegramToken_(env)) {
      const text =
        "🐾 GOOD BOY · заявка с сайта (worker)\n" +
        name +
        " · " +
        phone +
        "\nПитомец: " +
        pet +
        (note ? "\n" + note.slice(0, 3200) : "");
      await telegramSendTextWorker_(env, chat, text, null);
    }
  } catch (eTg) {}
  return { status: "ok", message: "saved", id: row.id, d1Verified: true, fromD1: true };
}



async function computeWarehouseCloseD1_(env) {
  let wh = await getSnapRaw_(env, "warehouse");
  if (!wh || !warehouseRows_(wh).length) {
    try {
      const live = await gasProxy_("getWarehouse", {}, env, { write: false });
      if (live && live.status === "success") {
        wh = live;
        try {
          await putSnap_(env, "warehouse", Object.assign({}, live, { cachedAt: new Date().toISOString() }));
        } catch (eS) {}
      }
    } catch (eW) {}
  }
  const rows = warehouseRows_(wh);
  if (!rows.length) return { ok: false, message: "no_warehouse" };
  const dayMetas = await loadWeekDayMetasD1_(env);
  const activeDays = (dayMetas || []).filter(function (d) {
    return !!d.iso;
  });
  if (!activeDays.length) return { ok: false, message: "no_week_days" };
  const people = await loadPeopleForDaysD1_(env, activeDays);
  const acc = accumulateDryNeedD1_(people, rows);
  const surplus = await surplusByWarehouseD1_(env, activeDays, rows);
  const updates = [];
  const pieceUpdates = [];
  const skipped = [];
  rows.forEach(function (r) {
    const row = Number(r.row) || 0;
    if (!(row >= 2 && row <= 35)) return;
    const key = cutNameKey_(r.name);
    const piece = isPieceSku_(r.name, "", r.unit) || row === 10 || (row >= 15 && row <= 25);
    if (piece && row >= 15 && row <= 25) {
      // Sheets: F = M (остаток Вс). В D1 stockPcs ≈ M, stock ≈ F.
      const sun = r.stockPcs != null && r.stockPcs !== "" ? Number(r.stockPcs) : Number(r.stock) || 0;
      pieceUpdates.push({
        row: row,
        name: r.name,
        beforeStock: Number(r.stock) || 0,
        beforeArrival: Number(r.arrival) || 0,
        afterStock: sun,
        afterArrival: 0,
        mode: "piece_sunday"
      });
      return;
    }
    if (row === 10 || (row >= 15 && row <= 25)) {
      skipped.push({ row: row, name: r.name, reason: "piece_special" });
      return;
    }
    const dryG = Number(acc.dryByKey[key]) || 0;
    const sur = Number(surplus[key]) || 0;
    const coef = Number(r.coef) || 0.2;
    const dryPlanKg = dryG / 1000;
    const totalRaw = dryPlanKg / (coef || 0.2) + sur;
    const arrival = Number(r.arrival) || 0;
    const revision = Number(r.stock) || 0;
    const after = Math.max(0, revision + arrival - totalRaw);
    updates.push({
      row: row,
      name: r.name,
      coef: coef,
      dryG: round2_(dryG),
      surplus: round2_(sur),
      totalRaw: round2_(totalRaw),
      beforeStock: revision,
      beforeArrival: arrival,
      afterStock: round2_(after),
      afterArrival: 0,
      mode: "raw_spend"
    });
  });
  return {
    ok: true,
    days: activeDays.map(function (d) {
      return { day: d.day, iso: d.iso };
    }),
    people: (people || []).length,
    updates: updates,
    pieceUpdates: pieceUpdates,
    skipped: skipped,
    computedAt: new Date().toISOString()
  };
}

async function applyWarehouseCloseD1_(env, pack) {
  if (!pack || !pack.ok) return { status: "error", message: "bad_pack" };
  let wh = (await getSnapRaw_(env, "warehouse")) || { status: "success", rows: [], items: [] };
  const items = (wh.rows || wh.items || []).slice();
  const byRow = Object.create(null);
  items.forEach(function (it, idx) {
    byRow[Number(it.row)] = idx;
  });
  function applyOne(u) {
    const idx = byRow[Number(u.row)];
    if (idx == null) {
      items.push({
        row: u.row,
        name: u.name || "",
        stock: u.afterStock,
        arrival: u.afterArrival,
        coef: u.coef != null ? u.coef : 0.2,
        _d1CloseAt: Date.now()
      });
      byRow[Number(u.row)] = items.length - 1;
      return;
    }
    items[idx] = Object.assign({}, items[idx], {
      stock: u.afterStock,
      arrival: u.afterArrival,
      _d1CloseAt: Date.now()
    });
  }
  (pack.updates || []).forEach(applyOne);
  (pack.pieceUpdates || []).forEach(applyOne);
  wh.rows = items;
  wh.items = items;
  wh.status = "success";
  wh._d1CloseAt = Date.now();
  wh.warehouseCloseCanon = "d1-compute";
  await putSnap_(env, "warehouse", wh);
  try {
    await putSnap_(env, "warehouseCloseLast", Object.assign({}, pack, { appliedAt: new Date().toISOString() }));
  } catch (eL) {}
  return { status: "success", wrote: (pack.updates || []).length + (pack.pieceUpdates || []).length };
}

async function previewWeekCloseWarehouseD1_(params, env, ctx) {
  const pack = await computeWarehouseCloseD1_(env);
  if (!pack || !pack.ok) {
    return {
      status: "error",
      message: (pack && pack.message) || "compute_failed",
      cutover: true,
      warehouseCloseCanon: warehouseCloseCanonLabel_(env)
    };
  }
  try {
    await putSnap_(env, "warehouseClosePreview", Object.assign({}, pack, { cachedAt: new Date().toISOString() }));
  } catch (eP) {}
  return {
    status: "success",
    preview: true,
    days: pack.days,
    people: pack.people,
    updates: pack.updates,
    pieceUpdates: pack.pieceUpdates,
    skipped: pack.skipped,
    totals: {
      rawRows: (pack.updates || []).length,
      pieceRows: (pack.pieceUpdates || []).length,
      spentRaw: round2_(
        (pack.updates || []).reduce(function (s, u) {
          return s + (Number(u.totalRaw) || 0);
        }, 0)
      )
    },
    cutover: true,
    fromD1: true,
    fromGas: false,
    sandbox: false,
    d1Verified: true,
    warehouseCloseCanon: warehouseCloseCanonLabel_(env),
    tip: "Dry-run. Apply only on finish when WAREHOUSE_CLOSE_CANON=d1-compute (+ Deploy Code.gs skipWarehouseClose)."
  };
}


function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" }
  });
}

// deploy bump 20260826161747

// beyond-week deploy 162750
