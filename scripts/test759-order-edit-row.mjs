/**
 * TEST759 live: create → edit frac/delete line → save → D1 verify → full cleanup.
 * Same Worker path as UI (saveOrder/deleteClient + owner initData).
 * No getClients?date/force. No client/partner sends expected for retail create.
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const WORKER = "https://boinya-c.konchaarsenia.workers.dev/";
const PAGES = "https://konchaarsenia-a11y.github.io/superboyna/boinya-c";
const OWNER_ID = Number(process.env.PP_AUDIT_TG_ID || "650923866");
const OWNER_NAME = process.env.PP_AUDIT_TG_NAME || "Арсений";
const CLIENT = "TEST759";
const DAY = "Будущая неделя";
const OUT = process.env.TEST759_OUT || "/tmp/test759";
const PROXY = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "boinya-c", "proxy");

fs.mkdirSync(OUT, { recursive: true });

function signInitData(token, fields) {
  const keys = Object.keys(fields).sort();
  const dcs = keys.map((k) => k + "=" + fields[k]).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(dcs).digest("hex");
  const sp = new URLSearchParams();
  keys.forEach((k) => sp.append(k, fields[k]));
  sp.append("hash", hash);
  return sp.toString();
}

function d1(sql) {
  const r = spawnSync(
    "npx",
    ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: PROXY, encoding: "utf8", env: process.env }
  );
  if (r.status !== 0) {
    throw new Error("d1 fail: " + (r.stderr || r.stdout || "").slice(0, 800));
  }
  const j = JSON.parse(r.stdout || "[]");
  const block = Array.isArray(j) ? j[0] : j;
  return (block && block.results) || [];
}

async function api(body) {
  const res = await fetch(WORKER + "?cutover=1", {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", "user-agent": "test759-order-edit" },
    body: JSON.stringify(Object.assign({ cutover: 1 }, body))
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("bad json: " + text.slice(0, 400));
  }
}

async function pollWrite(writeId) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1200));
    const p = await api({ action: "pollPeopleWrite", writeId, initData });
    if (p.sheetsVerified && p.status === "success") return p;
    if (p.status === "error" && !p.pendingSheets) throw new Error("write fail " + JSON.stringify(p));
  }
  throw new Error("poll timeout " + writeId);
}

async function assertWrite(label, res) {
  console.log(label, {
    status: res.status,
    d1Verified: res.d1Verified,
    sheetsVerified: res.sheetsVerified,
    writeId: res.writeId,
    id: res.id,
    message: res.message
  });
  if (!["success", "accepted"].includes(res.status)) throw new Error(label + " bad status");
  if (res.sheetsVerified && res.status === "success") return;
  if (res.writeId) await pollWrite(res.writeId);
}

function snap() {
  const ordersN = d1("SELECT COUNT(*) AS n FROM orders WHERE status = 'active'");
  const fut = d1(
    "SELECT COUNT(*) AS n FROM orders WHERE status = 'active' AND day_name = 'Будущая неделя'"
  );
  const testRows = d1(
    "SELECT id, client, day_name, date_iso, status, basket_json, updated_at FROM orders WHERE lower(client) = 'test759' OR match_key = 'TEST759' ORDER BY updated_at DESC LIMIT 10"
  );
  let clientsN = [{ n: 0 }];
  try {
    const hasClients = d1(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='clients'"
    );
    if (hasClients[0] && Number(hasClients[0].n) > 0) {
      clientsN = d1(
        "SELECT COUNT(*) AS n FROM clients WHERE lower(COALESCE(nick, client, '')) = 'test759'"
      );
    }
  } catch (e) {
    clientsN = [{ n: 0 }];
  }
  let cutN = [{ n: 0 }];
  try {
    cutN = d1(
      "SELECT COUNT(*) AS n FROM cutting_flags WHERE date_iso IN (SELECT date_iso FROM orders WHERE lower(client)='test759' AND date_iso != '')"
    );
  } catch (e) {
    cutN = [{ n: 0 }];
  }
  let delivN = [{ n: 0 }];
  try {
    delivN = d1(
      "SELECT COUNT(*) AS n FROM deliveries WHERE match_key = 'TEST759' OR lower(match_key) = 'test759'"
    );
  } catch (e) {
    delivN = [{ n: 0 }];
  }
  return {
    ordersActive: Number((ordersN[0] && ordersN[0].n) || 0),
    futureActive: Number((fut[0] && fut[0].n) || 0),
    testRows,
    clientsTest: Number((clientsN[0] && clientsN[0].n) || 0),
    cuttingForTest: Number((cutN[0] && cutN[0].n) || 0),
    deliveriesTest: Number((delivN[0] && delivN[0].n) || 0)
  };
}

const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
if (!token) {
  console.error("NO_TELEGRAM_BOT_TOKEN");
  process.exit(1);
}
if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error("NO_CLOUDFLARE_API_TOKEN");
  process.exit(1);
}

const initData = signInitData(token, {
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id: OWNER_ID, first_name: OWNER_NAME })
});

const report = {
  mergeHint: process.env.GITHUB_SHA || "",
  notifyAudit: {
    saveOrder_worker: "no sendMessage/telegramSend/partnerNotify in saveOrder_ / runPeopleWriteJob_",
    handleSaveOrder_gas: "no telegram sends",
    cut_increase: "only saveBooking near prep-day + volume↑ — not on new future-week retail create",
    partner_order: "partner path only — TEST759 is retail"
  },
  steps: []
};

console.log("=== ping ===");
const ping = await api({ action: "ping", initData });
report.ping = {
  live: ping.live,
  d1: ping.d1,
  notifyGroup: ping.notifyGroup,
  authMode: ping.authMode,
  peopleCanon: ping.peopleCanon
};
if (!ping.live || !ping.d1) throw new Error("ping fail");
if (ping.notifyGroup !== "off") {
  console.warn("WARN notifyGroup is not off:", ping.notifyGroup);
}

console.log("=== before snap ===");
const before = snap();
report.before = before;
fs.writeFileSync(path.join(OUT, "before.json"), JSON.stringify(before, null, 2));

const basketCreate = [
  { cat: "dressura", main: "СЕРДЦЕ", name: "СЕРДЦЕ", sub: "Ломтики", value: 100, val: 100 },
  { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", value: 100, val: 100 },
  { cat: "chew", main: "ТРАХЕЯ", name: "ТРАХЕЯ", sub: "Большая", value: 1, val: 1 }
];

console.log("=== create saveOrder TEST759 ===");
const create = await api({
  action: "saveOrder",
  client: CLIENT,
  matchKey: CLIENT,
  day: DAY,
  address: "TEST759 addr do-not-deliver",
  phone: "",
  note: "TEST759 order-edit-row-actions — delete me",
  orderType: "retail",
  segment: "Розница",
  source: "retail",
  basket: JSON.stringify(basketCreate),
  orderPrice: "12",
  telegramId: String(OWNER_ID),
  initData
});
await assertWrite("CREATE", create);
report.steps.push({ create: { id: create.id, writeId: create.writeId, status: create.status } });

const afterCreate = d1(
  "SELECT id, client, day_name, date_iso, status, basket_json, order_price FROM orders WHERE status='active' AND (lower(client)='test759' OR match_key='TEST759') LIMIT 5"
);
report.afterCreate = afterCreate;
if (!afterCreate.length) throw new Error("TEST759 not in D1 after create");

async function renderBasket(basket, label) {
  const ordersJs = await (await fetch(PAGES + "/next/orders.js?v=71125460")).text();
  if (!ordersJs.includes("order-edit-row-actions-h1")) throw new Error("live orders.js missing marker");
  const html = `<!doctype html><html><body>
<div id="nxMain"></div><div id="nxDock"></div>
<script src="${PAGES}/next/order-engine.js?v=71125460"></script>
<script src="${PAGES}/next/ig-labels.js?v=71125460"></script>
<script src="${PAGES}/next/crumb-scheme.js?v=71125460"></script>
<script src="${PAGES}/next/basket-amount.js?v=71125460"></script>
<script src="${PAGES}/next/crumb-mix.js?v=71125460"></script>
<script src="${PAGES}/next/order-payload.js?v=71125460"></script>
<script>
window.BoinyaShell={esc:s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),
toast:()=>{},choice:async o=>{window.__c=o;return (o.options||[])[0]?.value;},confirm:async()=>true,openSheet:()=>{},closeTop:()=>{},sheetOpen:()=>false,ico:()=>"",errorBox:()=>"",skeleton:()=>"",money:n=>String(n??0),
main:h=>{document.getElementById("nxMain").innerHTML=h;},dock:h=>{document.getElementById("nxDock").innerHTML=h||"";}};
window.BoinyaApi={apiGet:async()=>({status:"success",items:[]}),apiPost:async()=>({status:"success"})};
window.BoinyaAccess={role:()=>"owner",telegramId:()=>"650923866"};
</script>
<script>${ordersJs.replace(/<\/script>/gi, "<\\/script>")}</script>
<script>
(async()=>{
  const O=window.BoinyaOrders; const st=O.blank();
  st.isEdit=true; st.orderType="retail"; st.client="TEST759"; st.day="Будущая неделя";
  st.baskets[1]=${JSON.stringify(basket)};
  O.setState(st); O.paint(); window.__ready=true;
})();
</script></body></html>`;
  const pagePath = path.join(OUT, label + ".html");
  fs.writeFileSync(pagePath, html);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("file://" + pagePath, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  const info = await page.evaluate(() => {
    const lines = [...document.querySelectorAll(".nx-line")].map((el) => ({
      text: el.innerText.replace(/\s+/g, " ").trim(),
      del: !!el.querySelector('[data-act="idel"]'),
      frac: (el.querySelector('[data-act="ifrac"]') || {}).innerText || null
    }));
    return { lines, dels: document.querySelectorAll('[data-act="idel"]').length, fracs: document.querySelectorAll('[data-act="ifrac"]').length };
  });
  // open frac picker for first dressura line
  if (await page.locator('[data-act="ifrac"]').count()) {
    await page.locator('[data-act="ifrac"]').first().click();
    await page.waitForTimeout(100);
  }
  const choice = await page.evaluate(() => window.__c || null);
  await page.screenshot({ path: path.join(OUT, label + ".png"), fullPage: true });
  await browser.close();
  return { info, choiceOptions: (choice && choice.options) || [] };
}

const render1 = await renderBasket(basketCreate, "create-ui");
report.renderCreate = {
  lines: render1.info.lines,
  dels: render1.info.dels,
  fracs: render1.info.fracs,
  fracOptionsSample: render1.choiceOptions.slice(0, 6).map((o) => o.label || o.value)
};
if (render1.info.dels !== 3 || render1.info.fracs < 2) {
  throw new Error("UI buttons missing after create: " + JSON.stringify(render1.info));
}

const basketEdited = [
  { cat: "dressura", main: "СЕРДЦЕ", name: "СЕРДЦЕ", sub: "Кусочки", value: 100, val: 100 },
  { cat: "chew", main: "ТРАХЕЯ", name: "ТРАХЕЯ", sub: "Большая", value: 1, val: 1 }
];

console.log("=== edit saveOrder (frac Сердце→Кусочки, drop Лёгкое) ===");
const edit = await api({
  action: "saveOrder",
  client: CLIENT,
  matchKey: CLIENT,
  day: DAY,
  editClient: CLIENT,
  originalClient: CLIENT,
  isEdit: "1",
  address: "TEST759 addr do-not-deliver",
  note: "TEST759 edited",
  orderType: "retail",
  segment: "Розница",
  source: "retail",
  basket: JSON.stringify(basketEdited),
  orderPrice: "10",
  telegramId: String(OWNER_ID),
  initData
});
await assertWrite("EDIT", edit);
report.steps.push({ edit: { id: edit.id, writeId: edit.writeId, status: edit.status } });

const afterEdit = d1(
  "SELECT id, basket_json, note FROM orders WHERE status='active' AND (lower(client)='test759' OR match_key='TEST759') LIMIT 3"
);
report.afterEdit = afterEdit;
const bj = String((afterEdit[0] && afterEdit[0].basket_json) || "");
if (!/Кусочк/i.test(bj) && !/"sub"\s*:\s*"Кусочки"/i.test(bj)) {
  // accept case variants
  if (!/кусоч/i.test(bj)) throw new Error("edited frac not in D1: " + bj.slice(0, 400));
}
if (/ЛЁГКОЕ|ЛЕГКОЕ|Лёгк/i.test(bj)) throw new Error("lung still in basket after delete: " + bj.slice(0, 400));

const render2 = await renderBasket(basketEdited, "edit-ui");
report.renderEdit = render2.info;

console.log("=== deleteClient TEST759 ===");
const del = await api({
  action: "deleteClient",
  client: CLIENT,
  matchKey: CLIENT,
  day: DAY,
  telegramId: String(OWNER_ID),
  initData
});
await assertWrite("DELETE", del);
report.steps.push({ delete: { status: del.status, writeId: del.writeId } });

// extra cleanup remnants
try {
  d1("DELETE FROM orders WHERE lower(client)='test759' OR match_key='TEST759'");
} catch (e) {
  report.cleanupOrdersErr = String(e.message || e);
}
try {
  d1("DELETE FROM deliveries WHERE match_key='TEST759' OR lower(match_key)='test759'");
} catch (e) {}
try {
  d1("DELETE FROM snap_cache WHERE cache_key LIKE '%TEST759%' OR cache_key LIKE '%test759%'");
} catch (e) {}
try {
  d1("DELETE FROM clients WHERE lower(COALESCE(nick,client,''))='test759'");
} catch (e) {}

const after = snap();
report.after = after;
report.countsMatch = {
  ordersActive: before.ordersActive === after.ordersActive,
  futureActive: before.futureActive === after.futureActive,
  clientsTestGone: after.clientsTest === 0 || after.clientsTest === before.clientsTest,
  cutting: before.cuttingForTest === after.cuttingForTest,
  deliveries: before.deliveriesTest === after.deliveriesTest,
  testRowsGone: !(after.testRows || []).some((r) => r.status === "active")
};
report.ok = Object.values(report.countsMatch).every(Boolean) && report.renderCreate.dels === 3;

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
console.log("TEST759 OK");
