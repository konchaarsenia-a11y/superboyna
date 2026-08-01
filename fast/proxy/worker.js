/**
 * Бойня FAST — Cloudflare Worker (бесплатный план).
 * Edge-кэш перед Google Apps Script: cache hit ≈ 20–80 мс вместо 2–7 с.
 *
 * JSONP: callback у каждого клиента свой → кэшируем JSON без callback,
 * на отдаче оборачиваем в нужный callback(...).
 */

const DEFAULT_ORIGIN =
  "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec";

/** TTL секунд для read-action (edge Cache API) */
const READ_TTL = {
  getClients: 45,
  getWeekDayCounts: 45,
  getBootstrap: 30,
  getMyAccess: 90,
  getCourier: 30,
  getAssembly: 20,
  getWarehouse: 60,
  warehousePreview: 45,
  getStats: 600,
  listSubscriptions: 45,
  getSubscription: 30,
  listClientProfiles: 90,
  listBookings: 30,
  listAccess: 45,
  listDeferred: 30,
  listTemplates: 180,
  listSurvey: 45,
  crmInventory: 90,
  getCouriers: 60,
  telegramStatus: 180,
  getWeekBannerState: 60,
  weekPullStatus: 45,
  getMonthOverview: 45,
  getViewCompare: 25,
  calcPrice: 60,
  findClientMatch: 30,
  getPpFactCost: 30,
  getPpOrderSuggest: 30,
  resolveDayForDate: 90,
  suggestAddress: 60,
  listReminderPeople: 90,
  listPartners: 60,
  keepWarm: 120,
  ping: 120
};

/** Записи / мутации — никогда не кэшировать + сброс кэша */
const WRITE_RE =
  /^(save|delete|move|update|finish|cancel|enroll|set|close|pull|materialize|start|stop|ensure|scrub|request|setup|create|add|remove|toggle|mark|send|prepare|register|upsert|sync)/i;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const origin = String((env && env.GAS_ORIGIN) || DEFAULT_ORIGIN).replace(/\/$/, "");
    const url = new URL(request.url);

    // health
    if (url.pathname === "/" && !url.searchParams.get("action") && !url.searchParams.get("callback")) {
      return json(
        {
          status: "ok",
          service: "boinya-fast-proxy",
          origin: origin.slice(-24),
          tip: "JSONP: ?action=getClients&day=Понедельник&callback=cb"
        },
        200,
        { "Cache-Control": "public, max-age=30" }
      );
    }

    if (request.method === "POST") {
      const res = await forwardPost_(request, origin);
      ctx.waitUntil(bustReadCaches_(url.origin));
      return withCors(res);
    }

    // GET / JSONP
    const action = String(url.searchParams.get("action") || "").trim();
    const clientCb = String(url.searchParams.get("callback") || "callback").trim() || "callback";
    const forceNoCache =
      url.searchParams.has("_") ||
      url.searchParams.has("nocache") ||
      url.searchParams.get("force") === "1";

    if (!action) {
      // warm / online
      const warmBody = `${clientCb}(${JSON.stringify({ status: "online", msg: "Бойня FAST proxy", warm: true })})`;
      return new Response(warmBody, {
        headers: {
          ...CORS,
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=60"
        }
      });
    }

    const isWrite = WRITE_RE.test(action);
    const ttl = isWrite || forceNoCache ? 0 : READ_TTL[action] || 0;

    // cache key: без callback (у каждого клиента свой)
    const cacheKeyUrl = new URL(url.origin + url.pathname);
    url.searchParams.forEach(function (v, k) {
      if (k === "callback" || k === "_" || k === "nocache") return;
      cacheKeyUrl.searchParams.set(k, v);
    });
    cacheKeyUrl.searchParams.sort();
    const cacheRequest = new Request(cacheKeyUrl.toString(), { method: "GET" });

    if (ttl > 0) {
      const cached = await caches.default.match(cacheRequest);
      if (cached) {
        const jsonText = await cached.text();
        return jsonpResponse_(clientCb, jsonText, ttl, true);
      }
    }

    // к origin ходим с фиксированным callback, чтобы тело было стабильным
    const upstream = new URL(origin);
    url.searchParams.forEach(function (v, k) {
      if (k === "callback") return;
      upstream.searchParams.set(k, v);
    });
    upstream.searchParams.set("callback", "__boinyaProxy");

    let upstreamRes;
    try {
      upstreamRes = await fetch(upstream.toString(), {
        method: "GET",
        redirect: "follow",
        cf: ttl > 0 ? { cacheTtl: ttl, cacheEverything: true } : { cacheTtl: 0 }
      });
    } catch (e) {
      const err = { status: "error", message: "proxy_upstream_failed", detail: String(e) };
      return jsonpResponse_(clientCb, JSON.stringify(err), 0, false);
    }

    const raw = await upstreamRes.text();
    const payload = unwrapJsonp_(raw);
    if (payload == null) {
      // не JSONP — отдать как есть (редко)
      return new Response(raw, {
        status: upstreamRes.status,
        headers: {
          ...CORS,
          "Content-Type": upstreamRes.headers.get("Content-Type") || "text/plain; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }

    if (ttl > 0 && upstreamRes.ok) {
      const toStore = new Response(payload, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=" + ttl
        }
      });
      ctx.waitUntil(caches.default.put(cacheRequest, toStore.clone()));
    }

    if (isWrite) {
      ctx.waitUntil(bustReadCaches_(url.origin));
    }

    return jsonpResponse_(clientCb, payload, ttl, false);
  }
};

function unwrapJsonp_(raw) {
  const s = String(raw || "").trim();
  // __boinyaProxy({...}) или любой callback({...})
  const m = s.match(/^[a-zA-Z_$][\w$]*\s*\(\s*([\s\S]*)\s*\)\s*;?\s*$/);
  if (m) {
    try {
      JSON.parse(m[1]);
      return m[1];
    } catch (e) {}
  }
  // чистый JSON
  try {
    JSON.parse(s);
    return s;
  } catch (e2) {}
  return null;
}

function jsonpResponse_(callback, jsonText, ttl, fromCache) {
  const body = String(callback) + "(" + jsonText + ")";
  const headers = {
    ...CORS,
    "Content-Type": "text/javascript; charset=utf-8",
    "X-Boinya-Cache": fromCache ? "HIT" : ttl > 0 ? "MISS" : "BYPASS"
  };
  if (ttl > 0) headers["Cache-Control"] = "public, max-age=" + Math.min(ttl, 60);
  else headers["Cache-Control"] = "no-store";
  return new Response(body, { headers: headers });
}

async function forwardPost_(request, origin) {
  const body = await request.arrayBuffer();
  const headers = new Headers();
  const ct = request.headers.get("Content-Type");
  if (ct) headers.set("Content-Type", ct);
  else headers.set("Content-Type", "text/plain;charset=utf-8");
  const res = await fetch(origin, {
    method: "POST",
    headers: headers,
    body: body,
    redirect: "follow"
  });
  const outHeaders = new Headers(res.headers);
  Object.keys(CORS).forEach(function (k) {
    outHeaders.set(k, CORS[k]);
  });
  outHeaders.set("Cache-Control", "no-store");
  return new Response(res.body, { status: res.status, headers: outHeaders });
}

function withCors(res) {
  const headers = new Headers(res.headers);
  Object.keys(CORS).forEach(function (k) {
    headers.set(k, CORS[k]);
  });
  return new Response(res.body, { status: res.status, headers: headers });
}

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign(
      { "Content-Type": "application/json; charset=utf-8" },
      CORS,
      extra || {}
    )
  });
}

/** Сброс типичных read-ключей в этом colo (best-effort) */
async function bustReadCaches_(originBase) {
  const actions = Object.keys(READ_TTL);
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
  const urls = [];
  actions.forEach(function (a) {
    const u = new URL(originBase + "/");
    u.searchParams.set("action", a);
    urls.push(u.toString());
    if (a === "getClients" || a === "getCourier" || a === "getAssembly" || a === "getCutting") {
      days.forEach(function (d) {
        const u2 = new URL(originBase + "/");
        u2.searchParams.set("action", a);
        u2.searchParams.set("day", d);
        urls.push(u2.toString());
      });
    }
  });
  await Promise.all(
    urls.map(function (u) {
      return caches.default.delete(u).catch(function () {
        return false;
      });
    })
  );
}
