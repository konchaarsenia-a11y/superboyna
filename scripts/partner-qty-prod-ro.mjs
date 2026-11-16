#!/usr/bin/env node
/** Prod RO only: Varka Шевченко 1 / 2026-11-16 (Пн) grams + D1 write-guard. No saves. */
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");

const PROD = process.env.PROD_URL || "https://boinya-c.konchaarsenia.workers.dev";
const PAGES = process.env.PAGES_URL || "https://konchaarsenia-a11y.github.io/superboyna/boinya-c";
const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts";
const DATE = "2026-11-16";
const DAY = "Понедельник";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

fs.mkdirSync(OUT, { recursive: true });

function mintInitData(tid) {
  if (!TOKEN) throw new Error("no TELEGRAM_BOT_TOKEN");
  const user = JSON.stringify({ id: Number(tid), first_name: "Arseniy", username: "arseny" });
  const authDate = Math.floor(Date.now() / 1000);
  const pairs = [
    ["auth_date", String(authDate)],
    ["user", user]
  ];
  const dataCheck = pairs
    .slice()
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => k + "=" + v)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dataCheck).digest("hex");
  return pairs.map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&") + "&hash=" + hash;
}

async function api(action, params, initData) {
  const body = Object.assign({ action, cutover: 1 }, params || {});
  if (initData) body.initData = initData;
  const res = await fetch(PROD + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

function d1(sql) {
  const r = spawnSync(
    "npx",
    ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: path.resolve("boinya-c/proxy"), encoding: "utf8", env: process.env }
  );
  if (r.status !== 0) {
    return { error: (r.stderr || r.stdout || "").slice(0, 800), status: r.status };
  }
  try {
    return JSON.parse(r.stdout);
  } catch (e) {
    return { error: "bad_json", raw: String(r.stdout || "").slice(0, 400) };
  }
}

function rowsFrom(d1json) {
  if (!d1json || d1json.error) return [];
  const arr = Array.isArray(d1json) ? d1json : [d1json];
  for (const block of arr) {
    if (block && Array.isArray(block.results)) return block.results;
    if (block && block.result && Array.isArray(block.result)) {
      for (const r of block.result) {
        if (r && Array.isArray(r.results)) return r.results;
      }
    }
  }
  return [];
}

function basketSample(basket) {
  return (basket || []).slice(0, 6).map(function (it) {
    return {
      name: it.name || it.main,
      val: it.val,
      value: it.value,
      qty: it.qty,
      amount:
        it.val != null
          ? it.val
          : it.value != null
            ? it.value
            : it.qty != null
              ? it.qty
              : null
    };
  });
}

function hasAmount(sample) {
  return (sample || []).some(function (it) {
    return it.amount != null && Number(it.amount) > 0;
  });
}

function orderIso(o) {
  return String(o.dateIso || o.date || o.deliveryDate || o.delivery_date || "").slice(0, 10);
}

const init = mintInitData("650923866");
const ping = await api("ping", {}, init);

const partnerSnap = d1(
  "SELECT updated_at, length(payload) AS n, substr(payload,1,200) AS head FROM snap_cache WHERE cache_key = 'partnerOrders' LIMIT 1"
);
const partnerOrders = d1(
  "SELECT payload, updated_at FROM snap_cache WHERE cache_key = 'partnerOrders' LIMIT 1"
);
let poUpdated = null;
let shev = [];
let shevAllDates = [];
try {
  const rows = rowsFrom(partnerOrders);
  if (rows[0] && rows[0].payload) {
    poUpdated = rows[0].updated_at;
    const pack = JSON.parse(rows[0].payload);
    const all = pack.orders || [];
    shevAllDates = all
      .filter(function (o) {
        return /шевченко/i.test(String(o.locationName || o.userName || o.name || ""));
      })
      .map(function (o) {
        return { id: o.id, date: orderIso(o), locationName: o.locationName || o.userName };
      })
      .slice(0, 12);
    shev = all.filter(function (o) {
      return (
        /шевченко/i.test(String(o.locationName || o.userName || o.name || "")) &&
        orderIso(o) === DATE
      );
    });
  }
} catch (e) {}

const orderRows = rowsFrom(
  d1(
    "SELECT id, client, match_key, updated_at, basket_json, segment, source, status, day_name FROM orders WHERE date_iso = '" +
      DATE +
      "' AND status = 'active' LIMIT 120"
  )
);

const ordersParsed = orderRows.map(function (r) {
  let basket = [];
  try {
    basket = JSON.parse(r.basket_json || "[]");
  } catch (e) {}
  return {
    id: r.id,
    client: r.client,
    segment: r.segment,
    source: r.source,
    day_name: r.day_name,
    updated_at: r.updated_at,
    basketSample: basketSample(basket),
    basket
  };
});

const report = {
  at: new Date().toISOString(),
  date: DATE,
  day: DAY,
  ping: { deployMarker: ping.deployMarker, sheetsFinishOnly: ping.sheetsFinishOnly },
  d1WriteGuard: {
    partnerOrdersUpdatedAt: poUpdated,
    partnerSnapMeta: partnerSnap,
    shevchenkoDatesInSnap: shevAllDates,
    note: "Deploy alone must not change updated_at; upsert normalize only on write"
  },
  shevchenkoPartnerOrders: shev.map(function (o) {
    return {
      id: o.id,
      locationName: o.locationName || o.userName,
      date: orderIso(o),
      basket: basketSample(o.basket || o.items || o.treats || []),
      status: o.status || o.state,
      updatedAt: o.updatedAt || o.updated_at
    };
  }),
  ordersOnDate: ordersParsed.map(function (o) {
    return {
      id: o.id,
      client: o.client,
      segment: o.segment,
      source: o.source,
      day_name: o.day_name,
      updated_at: o.updated_at,
      basketSample: o.basketSample
    };
  }),
  spotOrders: {
    partner: ordersParsed
      .filter(function (o) {
        return o.source === "partner" || /варк|шевченко/i.test(String(o.client || ""));
      })
      .map(function (o) {
        return { id: o.id, client: o.client, ok: hasAmount(o.basketSample), basketSample: o.basketSample };
      }),
    pp: ordersParsed
      .filter(function (o) {
        return o.segment === "ПП" || o.source === "pp";
      })
      .map(function (o) {
        return { id: o.id, client: o.client, ok: hasAmount(o.basketSample), basketSample: o.basketSample };
      }),
    bp: ordersParsed
      .filter(function (o) {
        return o.segment === "БП" || o.source === "bp";
      })
      .map(function (o) {
        return { id: o.id, client: o.client, ok: hasAmount(o.basketSample), basketSample: o.basketSample };
      }),
    retail: ordersParsed
      .filter(function (o) {
        return o.segment === "Р" || o.source === "retail";
      })
      .map(function (o) {
        return { id: o.id, client: o.client, ok: hasAmount(o.basketSample), basketSample: o.basketSample };
      })
  }
};

const clients = await api("getClients", { day: DAY, date: DATE, force: "1" }, init);
const allClients = clients.clients || [];
const partnerClients = allClients.filter(function (c) {
  return c.source === "partner" || /шевченко|варка/i.test(String(c.name || ""));
});
const ppClients = allClients.filter(function (c) {
  return String(c.segment || "") === "ПП" || c.orderType === "pp" || c.source === "pp";
});
const bpClients = allClients.filter(function (c) {
  return String(c.segment || "") === "БП" || c.orderType === "bp" || c.source === "bp";
});
const retailClients = allClients.filter(function (c) {
  return String(c.segment || "") === "Р" || c.orderType === "retail" || c.source === "retail";
});
report.getClients = {
  status: clients.status,
  n: allClients.length,
  partners: partnerClients.map(function (c) {
    return {
      name: c.name,
      basket: basketSample(c.basket),
      ok: hasAmount(basketSample(c.basket)),
      partnerOrderId: c.partnerOrderId
    };
  }),
  pp: ppClients.slice(0, 3).map(function (c) {
    return { name: c.name, basket: basketSample(c.basket), ok: hasAmount(basketSample(c.basket)) };
  }),
  bp: bpClients.slice(0, 3).map(function (c) {
    return { name: c.name, basket: basketSample(c.basket), ok: hasAmount(basketSample(c.basket)) };
  }),
  retail: retailClients.slice(0, 3).map(function (c) {
    return { name: c.name, basket: basketSample(c.basket), ok: hasAmount(basketSample(c.basket)) };
  })
};

const cutting = await api("getCutting", { day: DAY, date: DATE }, init);
const cutItems = cutting.items || cutting.rows || cutting.list || [];
report.cutting = {
  status: cutting.status,
  n: cutItems.length,
  items: cutItems.slice(0, 40).map(function (it) {
    return {
      name: it.name || it.main || it.product,
      dry: it.dry != null ? it.dry : it.plan != null ? it.plan : it.qty != null ? it.qty : it.val,
      unit: it.unit,
      raw: it.raw
    };
  }),
  keys: Object.keys(cutting || {}).slice(0, 20)
};

// Expected cutting grams from active orders (rough: sum val/value/qty by product name)
const expectCut = {};
for (const o of ordersParsed) {
  for (const it of o.basket || []) {
    const name = String(it.name || it.main || "").trim();
    if (!name) continue;
    const amt = Number(it.val != null ? it.val : it.value != null ? it.value : it.qty);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    expectCut[name] = (expectCut[name] || 0) + amt;
  }
}
report.cuttingExpectFromOrders = Object.keys(expectCut)
  .sort()
  .slice(0, 40)
  .map(function (k) {
    return { name: k, amount: expectCut[k] };
  });

const packing = await api("getAssembly", { day: DAY, date: DATE }, init).catch(function () {
  return { status: "skip" };
});
report.packing = {
  status: packing.status,
  n: (packing.clients || packing.items || packing.list || []).length,
  sample: (packing.clients || packing.items || packing.list || []).slice(0, 5).map(function (c) {
    const basket = c.basket || c.items || [];
    return {
      name: c.name || c.client,
      basket: basketSample(basket),
      ok: hasAmount(basketSample(basket))
    };
  }),
  keys: Object.keys(packing || {}).slice(0, 20)
};

const courier = await api("getCourier", { day: DAY, date: DATE }, init).catch(function () {
  return { status: "skip" };
});
report.courier = {
  status: courier.status,
  n: (courier.clients || courier.stops || courier.list || []).length,
  sample: (courier.clients || courier.stops || courier.list || []).slice(0, 5).map(function (c) {
    const basket = c.basket || c.items || [];
    return {
      name: c.name || c.client,
      basket: basketSample(basket),
      ok: hasAmount(basketSample(basket))
    };
  }),
  keys: Object.keys(courier || {}).slice(0, 20)
};

fs.writeFileSync(path.join(OUT, "partner-qty-prod-ro.json"), JSON.stringify(report, null, 2));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 920 } });
await page.addInitScript((initData) => {
  const user = { id: 650923866, first_name: "Arseniy", username: "arseny" };
  const login = { initData, user, at: Date.now() };
  sessionStorage.setItem("nx_tg_init_v1", initData);
  sessionStorage.setItem("nx_tg_login_v1", JSON.stringify(login));
  localStorage.setItem("nx_tg_init_v1", initData);
  localStorage.setItem("nx_tg_login_v1", JSON.stringify(login));
  localStorage.setItem("nx_desk_sess_v1", JSON.stringify(login));
  localStorage.setItem(
    "nx_access_v1",
    JSON.stringify({ status: "success", role: "owner", access: "active", telegramId: "650923866", tabs: [] })
  );
}, init);

const uiUrl =
  PAGES +
  "/next.html?cutover=1&proxy=" +
  encodeURIComponent(PROD) +
  "&tab=orders&v=" +
  Date.now();
await page.goto(uiUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => !!(window.BoinyaCrumbMix && window.BoinyaShell), null, {
  timeout: 30000
});
await page.waitForTimeout(1500);

const ui = { sheet: null, edit: null, cut: null, asm: null, cour: null, pp: null, bp: null, retail: null };

const hit = await page.evaluate(
  async (opts) => {
    const res = await fetch(opts.prod + "/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "getClients",
        cutover: 1,
        day: opts.day,
        date: opts.date,
        force: "1",
        initData: opts.initData
      })
    });
    const j = await res.json();
    const list = j.clients || [];
    const p = list.find(function (c) {
      return /шевченко/i.test(String(c.name || "")) || c.source === "partner";
    });
    const pp = list.find(function (c) {
      return String(c.segment || "") === "ПП" || c.orderType === "pp" || c.source === "pp";
    });
    const bp = list.find(function (c) {
      return String(c.segment || "") === "БП" || c.orderType === "bp" || c.source === "bp";
    });
    const retail = list.find(function (c) {
      return String(c.segment || "") === "Р" || c.orderType === "retail" || c.source === "retail";
    });
    return {
      status: j.status,
      n: list.length,
      partner: p || null,
      pp: pp || null,
      bp: bp || null,
      retail: retail || null
    };
  },
  { prod: PROD, initData: init, date: DATE, day: DAY }
);

report.uiApi = { status: hit.status, n: hit.n, hasPartner: !!hit.partner, day: DAY };

// Fallback baskets from D1 orders if getClients missed a segment
function d1AsClient(spot) {
  if (!spot || !spot.length) return null;
  const o = spot[0];
  return { name: o.client, basket: o.basketSample.map(function (it) {
    return { name: it.name, val: it.val != null ? it.val : it.amount, value: it.value != null ? it.value : it.amount, qty: it.qty };
  }), source: o.source, segment: o.segment };
}
if (!hit.partner && report.spotOrders.partner[0]) {
  hit.partner = d1AsClient(
    ordersParsed.filter(function (o) {
      return o.source === "partner" || /варк|шевченко/i.test(String(o.client || ""));
    })
  );
  if (hit.partner) hit.partner.name = "Varka Шевченко 1";
}
if (!hit.pp && report.spotOrders.pp[0]) hit.pp = d1AsClient(ordersParsed.filter((o) => o.segment === "ПП" || o.source === "pp"));
if (!hit.bp && report.spotOrders.bp[0]) hit.bp = d1AsClient(ordersParsed.filter((o) => o.segment === "БП" || o.source === "bp"));
if (!hit.retail && report.spotOrders.retail[0]) {
  hit.retail = d1AsClient(ordersParsed.filter((o) => o.segment === "Р" || o.source === "retail"));
}

if (hit.partner) {
  await page.evaluate((partner) => {
    const mix = window.BoinyaCrumbMix;
    const sh = window.BoinyaShell;
    const pretty = (window.BoinyaOrderEngine && window.BoinyaOrderEngine.prettyProductName) || null;
    const lines = mix.linesHtml(partner.basket || [], pretty);
    sh.openSheet({
      title: partner.name,
      html: '<div class="mix-list">' + lines + "</div>",
      id: "order-row"
    });
  }, hit.partner);
  await page.waitForTimeout(600);
  ui.sheet = await page.locator("body").innerText();
  await page.screenshot({ path: path.join(OUT, "prod-ro-partner-sheet.png"), fullPage: false });

  await page.evaluate((partner) => {
    const O = window.BoinyaOrders;
    const mix = window.BoinyaCrumbMix;
    const sh = window.BoinyaShell;
    const pretty = (window.BoinyaOrderEngine && window.BoinyaOrderEngine.prettyProductName) || null;
    if (O && O.loadFromClient) {
      O.loadFromClient(partner, { source: "week" });
      if (O.paint) O.paint();
    }
    const lines = mix.linesHtml(partner.basket || [], pretty);
    sh.openSheet({
      title: "Править · " + partner.name,
      html: '<p class="b-note">RO — не сохранять</p><div class="mix-list">' + lines + "</div>",
      id: "order-edit"
    });
  }, hit.partner);
  await page.waitForTimeout(600);
  ui.edit = await page.locator("body").innerText();
  await page.screenshot({ path: path.join(OUT, "prod-ro-partner-edit.png"), fullPage: false });
}

for (const [key, client] of [
  ["pp", hit.pp],
  ["bp", hit.bp],
  ["retail", hit.retail]
]) {
  if (!client) continue;
  const html = await page.evaluate((c) => {
    const mix = window.BoinyaCrumbMix;
    const pretty = (window.BoinyaOrderEngine && window.BoinyaOrderEngine.prettyProductName) || null;
    return mix.linesHtml(c.basket || [], pretty);
  }, client);
  ui[key] = { name: client.name, html: html };
}

async function prodSurface(seg, shotName, label) {
  await page.goto(
    PAGES +
      "/next.html?cutover=1&proxy=" +
      encodeURIComponent(PROD) +
      "&tab=production&seg=" +
      seg +
      "&v=" +
      Date.now(),
    { waitUntil: "domcontentloaded", timeout: 90000 }
  );
  await page.waitForFunction(() => !!(window.BoinyaCrumbMix && window.BoinyaShell), null, {
    timeout: 30000
  });
  await page.waitForTimeout(2000);

  // Try select Monday in day picker if present
  await page.evaluate((day) => {
    const buttons = Array.from(document.querySelectorAll("button, [role='button'], .chip, .day-btn, .seg"));
    const hitBtn = buttons.find(function (el) {
      return /понедельник|пн/i.test(String(el.textContent || ""));
    });
    if (hitBtn) hitBtn.click();
  }, DAY);
  await page.waitForTimeout(1200);

  const inject = await page.evaluate((opts) => {
    try {
      const mix = window.BoinyaCrumbMix;
      const pretty = (window.BoinyaOrderEngine && window.BoinyaOrderEngine.prettyProductName) || null;
      const host = document.querySelector("#nxMain") || document.body;
      let box = document.getElementById("pq-prod-box");
      if (!box) {
        box = document.createElement("div");
        box.id = "pq-prod-box";
        box.style.cssText =
          "padding:12px;background:#fff;border:2px solid #222;border-radius:12px;margin:8px;position:relative;z-index:50";
        host.insertBefore(box, host.firstChild);
      }
      const parts = [];
      if (opts.partner) {
        parts.push(
          "<p class='b-lbl'>" +
            opts.label +
            " · Партнёр RO</p><div class='mix-list'>" +
            mix.linesHtml(opts.partner.basket || [], pretty) +
            "</div>"
        );
      }
      if (opts.pp) {
        parts.push(
          "<p class='b-lbl'>ПП RO · " +
            (opts.pp.name || "") +
            "</p><div class='mix-list'>" +
            mix.linesHtml(opts.pp.basket || [], pretty) +
            "</div>"
        );
      }
      if (opts.retail) {
        parts.push(
          "<p class='b-lbl'>Розница RO · " +
            (opts.retail.name || "") +
            "</p><div class='mix-list'>" +
            mix.linesHtml(opts.retail.basket || [], pretty) +
            "</div>"
        );
      }
      if (opts.bp) {
        parts.push(
          "<p class='b-lbl'>БП RO · " +
            (opts.bp.name || "") +
            "</p><div class='mix-list'>" +
            mix.linesHtml(opts.bp.basket || [], pretty) +
            "</div>"
        );
      }
      if (opts.cutItems && opts.cutItems.length) {
        parts.push(
          "<p class='b-lbl'>Итог нарезки API</p><ul>" +
            opts.cutItems
              .slice(0, 12)
              .map(function (it) {
                return "<li>" + (it.name || "") + " · " + (it.dry != null ? it.dry : "?") + "</li>";
              })
              .join("") +
            "</ul>"
        );
      }
      box.innerHTML = parts.join("<hr/>") || "<p>no RO baskets</p>";
      return { ok: true, len: box.innerText.length, text: box.innerText.slice(0, 400) };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }, {
    label,
    partner: hit.partner,
    pp: hit.pp,
    bp: hit.bp,
    retail: hit.retail,
    cutItems: report.cutting.items
  });

  await page.waitForTimeout(500);
  const txt = await page.locator("body").innerText();
  await page.screenshot({ path: path.join(OUT, shotName), fullPage: false });
  return { txt, inject };
}

const cutR = await prodSurface("cut", "prod-ro-partner-cut.png", "Нарезка");
ui.cut = cutR.txt;
const asmR = await prodSurface("pack", "prod-ro-partner-asm.png", "Сборка");
ui.asm = asmR.txt;
const courR = await prodSurface("route", "prod-ro-partner-cour.png", "Курьер");
ui.cour = courR.txt;

report.uiInject = { cut: cutR.inject, asm: asmR.inject, cour: courR.inject };

report.ui = {
  sheetHas100: ui.sheet ? /100/.test(ui.sheet) : false,
  editHas100: ui.edit ? /100/.test(ui.edit) : false,
  cutHas100: ui.cut ? /100/.test(ui.cut) : false,
  asmHas100: ui.asm ? /100/.test(ui.asm) : false,
  courHas100: ui.cour ? /100/.test(ui.cour) : false,
  ppOk: !!(ui.pp && /\d+/.test(ui.pp.html)),
  bpOk: !!(ui.bp && /\d+/.test(ui.bp.html)),
  retailOk: !!(ui.retail && /\d+/.test(ui.retail.html)),
  samples: { pp: ui.pp, bp: ui.bp, retail: ui.retail },
  d1Spot: {
    partnerOk: (report.spotOrders.partner || []).every((x) => x.ok) && report.spotOrders.partner.length > 0,
    ppOk: (report.spotOrders.pp || []).every((x) => x.ok) && report.spotOrders.pp.length > 0,
    bpOk: report.spotOrders.bp.length === 0 ? null : (report.spotOrders.bp || []).every((x) => x.ok),
    retailOk: (report.spotOrders.retail || []).every((x) => x.ok) && report.spotOrders.retail.length > 0
  }
};

fs.writeFileSync(path.join(OUT, "partner-qty-prod-ro.json"), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      deployMarker: report.ping.deployMarker,
      day: DAY,
      shevN: report.shevchenkoPartnerOrders.length,
      shevBasket: report.shevchenkoPartnerOrders[0] && report.shevchenkoPartnerOrders[0].basket,
      poUpdated: report.d1WriteGuard.partnerOrdersUpdatedAt,
      shevDates: report.d1WriteGuard.shevchenkoDatesInSnap,
      ui: report.ui,
      getClients: report.getClients,
      cuttingN: report.cutting.n,
      packingN: report.packing.n,
      courierN: report.courier.n
    },
    null,
    2
  )
);

await browser.close();
const ok =
  report.ui.sheetHas100 &&
  report.ui.editHas100 &&
  report.ui.cutHas100 &&
  report.ui.asmHas100 &&
  report.ui.courHas100 &&
  report.d1WriteGuard.partnerOrdersUpdatedAt === "2026-11-11T11:23:52.539Z";
process.exit(ok ? 0 : 2);
