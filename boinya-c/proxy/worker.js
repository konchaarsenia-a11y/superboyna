/**
 * Бойня C — Worker песочницы.
 * Прод GAS / fast/proxy не использует и не меняет.
 *
 * Без D1: отвечает из встроенного seed (демо).
 * С D1 (env.DB): читает/пишет таблицу orders.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

/** Демо-seed, если D1 ещё не подключён */
const DEMO_ORDERS = [
  {
    id: "demo-mon-zzz",
    date_iso: "2026-08-10",
    day_name: "Понедельник",
    client: "zzz_test_c",
    match_key: "zzz_test_c",
    address: "песочница, не прод",
    note: "C sandbox",
    basket_json: JSON.stringify([{ cat: "demo", name: "ЛЁГКОЕ", sub: "Среднее", val: 100 }]),
    segment: "Р",
    status: "active",
    updated_at: "2026-08-07T00:00:00.000Z"
  }
];

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const action = String(url.searchParams.get("action") || "").trim();

    if (!action && request.method === "GET") {
      return json({
        status: "ok",
        service: "boinya-c",
        sandbox: true,
        d1: !!(env && env.DB),
        tip: "?action=getClients&day=Понедельник"
      });
    }

    try {
      if (request.method === "POST") {
        const body = await request.json().catch(function () {
          return {};
        });
        return json(await handleAction_(body.action || action, body, env));
      }

      const params = Object.fromEntries(url.searchParams.entries());
      const cb = params.callback;
      const result = await handleAction_(action, params, env);
      if (cb) {
        return new Response(String(cb) + "(" + JSON.stringify(result) + ")", {
          headers: { ...CORS, "Content-Type": "text/javascript; charset=utf-8" }
        });
      }
      return json(result);
    } catch (e) {
      return json({ status: "error", message: String(e && e.message ? e.message : e) }, 500);
    }
  }
};

async function handleAction_(action, params, env) {
  const a = String(action || "");
  if (a === "ping" || a === "keepWarm") {
    return { status: "success", sandbox: true, d1: !!(env && env.DB) };
  }
  if (a === "getClients") return getClients_(params, env);
  if (a === "saveOrder") return saveOrder_(params, env);
  if (a === "deleteClient") return deleteClient_(params, env);
  return { status: "unknown_action", action: a, sandbox: true };
}

async function getClients_(params, env) {
  const day = String(params.day || "Понедельник");
  let rows = DEMO_ORDERS.filter(function (r) {
    return r.day_name === day && r.status === "active";
  });

  if (env && env.DB) {
    const q = await env.DB.prepare(
      "SELECT * FROM orders WHERE day_name = ? AND status = 'active' ORDER BY client"
    )
      .bind(day)
      .all();
    rows = (q.results || []).map(mapRow_);
  }

  return {
    status: "success",
    sandbox: true,
    day: day,
    source: env && env.DB ? "d1" : "demo",
    clients: rows.map(function (r) {
      var basket = [];
      try {
        basket = JSON.parse(r.basket_json || "[]");
      } catch (e) {}
      return {
        name: r.client,
        matchKey: r.match_key,
        address: r.address || "",
        note: r.note || "",
        basket: basket,
        segment: r.segment || "",
        orderCount: Array.isArray(basket) ? basket.length : 0,
        updatedAt: r.updated_at
      };
    })
  };
}

async function saveOrder_(params, env) {
  const day = String(params.day || "Понедельник");
  const client = String(params.client || "").trim();
  if (!client) return { status: "error", message: "no_client" };

  const matchKey = String(params.matchKey || client).toLowerCase();
  const now = new Date().toISOString();
  const id = String(params.id || day + ":" + matchKey);
  const basket =
    typeof params.basket === "string" ? params.basket : JSON.stringify(params.basket || []);

  const row = {
    id: id,
    date_iso: String(params.date || params.dateIso || ""),
    day_name: day,
    client: client,
    match_key: matchKey,
    address: String(params.address || ""),
    note: String(params.note || ""),
    basket_json: basket,
    segment: String(params.segment || ""),
    status: "active",
    updated_at: now
  };

  if (env && env.DB) {
    await env.DB.prepare(
      `INSERT INTO orders (id, date_iso, day_name, client, match_key, address, note, basket_json, segment, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         address=excluded.address, note=excluded.note, basket_json=excluded.basket_json,
         segment=excluded.segment, status='active', updated_at=excluded.updated_at, client=excluded.client`
    )
      .bind(
        row.id,
        row.date_iso,
        row.day_name,
        row.client,
        row.match_key,
        row.address,
        row.note,
        row.basket_json,
        row.segment,
        row.status,
        row.updated_at
      )
      .run();
    return { status: "success", sandbox: true, wrote: "d1", id: row.id, updatedAt: now };
  }

  // без D1 — подтверждаем контракт (клиент хранит в IDB)
  return { status: "success", sandbox: true, wrote: "ack-no-d1", id: row.id, updatedAt: now, row: row };
}

async function deleteClient_(params, env) {
  const day = String(params.day || "");
  const matchKey = String(params.matchKey || params.client || "")
    .trim()
    .toLowerCase();
  if (!matchKey) return { status: "error", message: "no_client" };
  const now = new Date().toISOString();

  if (env && env.DB) {
    await env.DB.prepare(
      "UPDATE orders SET status = 'deleted', updated_at = ? WHERE day_name = ? AND match_key = ?"
    )
      .bind(now, day, matchKey)
      .run();
    return { status: "success", sandbox: true, wrote: "d1" };
  }
  return { status: "success", sandbox: true, wrote: "ack-no-d1", matchKey: matchKey };
}

function mapRow_(r) {
  return {
    id: r.id,
    date_iso: r.date_iso,
    day_name: r.day_name,
    client: r.client,
    match_key: r.match_key,
    address: r.address,
    note: r.note,
    basket_json: r.basket_json,
    segment: r.segment,
    status: r.status,
    updated_at: r.updated_at
  };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" }
  });
}
