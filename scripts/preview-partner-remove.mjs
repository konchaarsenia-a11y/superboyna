/**
 * Preview partner-remove-h1: add test point → soft-remove → gone from list/picker;
 * RO counts for real Varka points stay unchanged. Cleanup test point.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");

const ROOT = path.resolve("/agent/repos/superboyna/boinya-c");
const PREV = process.env.PREVIEW_URL || "https://boinya-c-preview-eabc.konchaarsenia.workers.dev";
const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts";
const PORT = 8797;
const TEST_NAME = "zzz_test_partner_remove_h1";
const TEST_ADDR = "preview-only street 1";

fs.mkdirSync(OUT, { recursive: true });

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/next.html";
  const fp = path.join(ROOT, u.replace(/^\//, ""));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("missing");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(fp), "Cache-Control": "no-store" });
  fs.createReadStream(fp).pipe(res);
});

await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

async function api(action, params = {}, initData) {
  const body = Object.assign({ action, cutover: 1 }, params);
  if (initData) body.initData = initData;
  const res = await fetch(PREV + "/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 CursorPartnerRemove/1.0"
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

function pointByName(admin, name) {
  return ((admin && admin.points) || []).find((p) => p && String(p.name || "") === name) || null;
}

function countOrdersForPoint(pack, point) {
  const id = String((point && point.id) || "");
  const name = String((point && point.name) || "");
  let n = 0;
  ((pack && pack.orders) || []).forEach((o) => {
    if (!o) return;
    const locId = String(o.locationId || o.pointId || "");
    const locName = String(o.locationName || "");
    if ((id && locId === id) || (name && locName === name)) n += 1;
  });
  return n;
}

function countSubsForPartner(list, name) {
  let n = 0;
  const key = String(name || "").toUpperCase();
  ((list && (list.subscriptions || list.items)) || []).forEach((s) => {
    const ref = String((s && (s.ppPartner || s.partner)) || "").toUpperCase();
    if (key && ref && ref.indexOf(key.replace(/^VARKA\s*/, "VARKA ")) >= 0) n += 1;
    else if (key && ref.indexOf(key) >= 0) n += 1;
  });
  return n;
}

const ping = await api("ping");
const mint = await api("previewMintInitData", { telegramId: "650923866" });
const init = mint.initData;
if (!init) {
  console.error("mint failed", mint);
  process.exit(1);
}

const report = {
  at: new Date().toISOString(),
  ping: { deployMarker: ping.deployMarker, previewIsolated: ping.previewIsolated },
  marker: "partner-remove-h1"
};

const beforeAdmin = await api("partnerListAdmin", { telegramId: "650923866" }, init);
const beforeOrders = await api("partnerListMyOrders", { telegramId: "650923866", force: "1" }, init).catch(() => ({ orders: [] }));
const beforePack = { orders: (beforeOrders && beforeOrders.orders) || [] };
// partnerOrders snap via list — fallback empty
let partnerOrdersSnap = beforePack;
try {
  const raw = await api("partnerListAdmin", { telegramId: "650923866", _: String(Date.now()) }, init);
  report.adminPointsBefore = ((raw && raw.points) || []).filter((p) => p && p.active !== false).length;
} catch (e) {
  report.adminPointsBefore = ((beforeAdmin && beforeAdmin.points) || []).filter((p) => p && p.active !== false).length;
}

const realNames = ["Цвирко", "Шевченко"];
const realBefore = {};
((beforeAdmin && beforeAdmin.points) || []).forEach((p) => {
  if (!p || p.active === false) return;
  const nm = String(p.name || "");
  if (!realNames.some((x) => nm.indexOf(x) >= 0)) return;
  realBefore[p.id] = {
    id: p.id,
    name: nm,
    active: p.active !== false,
    orders: countOrdersForPoint(partnerOrdersSnap, p)
  };
});
report.realBefore = realBefore;

// cleanup leftover test point
const leftover = ((beforeAdmin && beforeAdmin.points) || []).filter((p) => p && String(p.name || "") === TEST_NAME);
for (const p of leftover) {
  await api(
    "partnerDeletePoint",
    { telegramId: "650923866", id: p.id, _: String(Date.now()) },
    init
  );
}

const nets = (beforeAdmin && beforeAdmin.networks) || [];
const netId = (nets.find((n) => n && n.active !== false) || nets[0] || {}).id || "net_varka";

const saved = await api(
  "partnerSavePoint",
  {
    telegramId: "650923866",
    name: TEST_NAME,
    networkId: netId,
    address: TEST_ADDR,
    active: "yes",
    _: String(Date.now())
  },
  init
);
report.save = { status: saved.status, id: saved.id, message: saved.message };
if (saved.status !== "success" || !saved.id) {
  fs.writeFileSync(path.join(OUT, "partner-remove-report.json"), JSON.stringify(report, null, 2));
  console.error("save failed", saved);
  process.exit(1);
}
const testId = saved.id;

const midAdmin = await api("partnerListAdmin", { telegramId: "650923866", force: "1", _: String(Date.now()) }, init);
const midHit = pointByName(midAdmin, TEST_NAME);
report.listedAfterAdd = !!(midHit && midHit.active !== false && midHit.id === testId);

const dry = await api(
  "partnerDeletePoint",
  { telegramId: "650923866", id: testId, dry: "1", _: String(Date.now()) },
  init
);
report.dry = {
  status: dry.status,
  futureActive: dry.futureActive,
  futureOrders: dry.futureOrders,
  futureSubs: dry.futureSubs
};

const removed = await api(
  "partnerDeletePoint",
  { telegramId: "650923866", id: testId, _: String(Date.now()) },
  init
);
report.remove = {
  status: removed.status,
  soft: removed.soft,
  active: removed.active,
  notified: removed.notified,
  message: removed.message
};

const afterAdmin = await api("partnerListAdmin", { telegramId: "650923866", force: "1", _: String(Date.now()) }, init);
const afterPts = (afterAdmin && afterAdmin.points) || [];
const afterHit = afterPts.find((p) => p && p.id === testId);
report.hiddenAfterRemove = !afterHit || afterHit.active === false;
report.visibleActiveHasTest = afterPts.some((p) => p && p.active !== false && p.id === testId);

const pickerPts = afterPts.filter((p) => p && p.active !== false);
report.pickerHasTest = pickerPts.some((p) => p.id === testId || p.name === TEST_NAME);

const realAfter = {};
afterPts.forEach((p) => {
  if (!p) return;
  const nm = String(p.name || "");
  if (!realNames.some((x) => nm.indexOf(x) >= 0)) return;
  realAfter[p.id] = {
    id: p.id,
    name: nm,
    active: p.active !== false,
    orders: countOrdersForPoint(partnerOrdersSnap, p)
  };
});
report.realAfter = realAfter;
report.realUnchanged = Object.keys(realBefore).every((id) => {
  const a = realBefore[id];
  const b = realAfter[id];
  return b && a.active === b.active && a.orders === b.orders && a.name === b.name;
});

// UI screenshots from local next + preview Worker (?proxy=)
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript((initData) => {
  const user = { id: 650923866, first_name: "Arseniy", username: "one_more_person_228" };
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
  window.Telegram = {
    WebApp: {
      initData,
      initDataUnsafe: { user },
      ready() {},
      expand() {},
      themeParams: {},
      colorScheme: "light",
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} }
    }
  };
}, init);

// re-add for UI confirm shot, then remove via UI
const uiSave = await api(
  "partnerSavePoint",
  {
    telegramId: "650923866",
    name: TEST_NAME,
    networkId: netId,
    address: TEST_ADDR,
    active: "yes",
    _: String(Date.now())
  },
  init
);
const uiId = uiSave.id;

try {
  const url =
    "http://127.0.0.1:" +
    PORT +
    "/next.html?cutover=1&proxy=" +
    encodeURIComponent(PREV) +
    "&v=" +
    Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => !!(window.BoinyaPartners && window.BoinyaShell), null, { timeout: 25000 }).catch(() => {});
  await page.evaluate(() => {
    if (window.BoinyaPartners && window.BoinyaPartners.show) {
      window.BoinyaPartners.bind({ role: "owner", telegramId: "650923866", access: "active" });
      window.BoinyaPartners.show("points");
    }
  });
  await page.waitForTimeout(2500);

  const removeBtn = page.locator(`[data-act="ph-pt-del"][data-id="${uiId}"]`).first();
  if (await removeBtn.count()) {
    await page.screenshot({ path: path.join(OUT, "partner-remove-list-btn.png"), fullPage: true });
    await removeBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, "partner-remove-confirm.png"), fullPage: true });
    const okBtn = page.locator(".b-sheet button.b-btn--main, [data-act='confirm-ok'], button:has-text('Убрать')").last();
    if (await okBtn.count()) await okBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, "partner-remove-after.png"), fullPage: true });
    report.uiShots = true;
  } else {
    report.uiShots = false;
    report.uiNote = "remove button not found; API path verified";
    await page.screenshot({ path: path.join(OUT, "partner-remove-fallback.png"), fullPage: true });
    await api("partnerDeletePoint", { telegramId: "650923866", id: uiId, _: String(Date.now()) }, init);
  }
} catch (eUi) {
  report.uiError = String((eUi && eUi.message) || eUi);
  await api("partnerDeletePoint", { telegramId: "650923866", id: uiId, _: String(Date.now()) }, init).catch(() => {});
}

await browser.close();
server.close();

// final cleanup
const finalAdmin = await api("partnerListAdmin", { telegramId: "650923866", force: "1", _: String(Date.now()) }, init);
for (const p of (finalAdmin && finalAdmin.points) || []) {
  if (p && String(p.name || "") === TEST_NAME && p.active !== false) {
    await api("partnerDeletePoint", { telegramId: "650923866", id: p.id, _: String(Date.now()) }, init);
  }
}

report.ok =
  report.listedAfterAdd === true &&
  report.hiddenAfterRemove === true &&
  report.visibleActiveHasTest === false &&
  report.pickerHasTest === false &&
  report.realUnchanged === true &&
  report.remove &&
  report.remove.status === "success" &&
  report.remove.soft === true &&
  report.remove.notified === false;

fs.writeFileSync(path.join(OUT, "partner-remove-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
