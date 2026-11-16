/**
 * Local preview: «Правка заказа» — delete + frac buttons.
 * Serves against http://127.0.0.1:8765 (boinya-c static).
 */
import { chromium } from "playwright";
import fs from "fs";

const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });

const html = `<!doctype html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="stylesheet" href="http://127.0.0.1:8765/ds.css"/>
<link rel="stylesheet" href="http://127.0.0.1:8765/next/app.css"/>
<link rel="stylesheet" href="http://127.0.0.1:8765/next/theme.css"/>
</head><body>
<div id="nxMain"></div>
<div id="nxDock"></div>
<script src="http://127.0.0.1:8765/next/order-engine.js"></script>
<script src="http://127.0.0.1:8765/next/ig-labels.js"></script>
<script src="http://127.0.0.1:8765/next/crumb-scheme.js"></script>
<script src="http://127.0.0.1:8765/next/basket-amount.js"></script>
<script src="http://127.0.0.1:8765/next/crumb-mix.js"></script>
<script src="http://127.0.0.1:8765/next/order-payload.js"></script>
<script>
window.BoinyaShell = {
  esc: function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  },
  toast: function (t) { window.__toasts = (window.__toasts || []).concat([String(t)]); },
  choice: async function (opts) {
    window.__choices = (window.__choices || []).concat([opts]);
    var optsList = (opts && opts.options) || [];
    var hit = optsList.find(function (o) { return /Средн|Кусочк|Ломтик/i.test(String(o.label || o.value || "")); });
    return hit ? hit.value : (optsList[0] && optsList[0].value);
  },
  confirm: async function () { return true; },
  openSheet: function () {},
  closeTop: function () {},
  sheetOpen: function () { return false; },
  ico: function () { return ""; },
  errorBox: function (o) { return '<p class="b-note">' + this.esc((o && o.text) || "") + "</p>"; },
  skeleton: function () { return ""; },
  money: function (n) { return String(n == null ? "0" : n); },
  main: function (html) { document.getElementById("nxMain").innerHTML = html; },
  dock: function (html) { document.getElementById("nxDock").innerHTML = html || ""; }
};
window.BoinyaApi = {
  apiGet: async function () { return { status: "success", items: [], people: [], subscriptions: [] }; },
  apiPost: async function () { return { status: "success" }; }
};
window.BoinyaAccess = { role: function () { return "owner"; }, telegramId: function () { return "1"; } };
</script>
<script src="http://127.0.0.1:8765/next/orders.js"></script>
<script>
document.addEventListener("click", function (ev) {
  var n = ev.target.closest("[data-act]");
  if (!n || !window.BoinyaOrders) return;
  window.BoinyaOrders.onAct(n.getAttribute("data-act"), n);
});
(async function () {
  var O = window.BoinyaOrders;
  var st = O.blank();
  st.isEdit = true;
  st.orderType = "retail";
  st.client = "zzz_preview_row";
  st.day = "Будущая неделя";
  st.deliveryDate = "2026-11-23";
  st.baskets[1] = [
    { cat: "dressura", main: "СЕРДЦЕ", name: "СЕРДЦЕ", sub: "Ломтики", value: 100, val: 100 },
    { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Ломтики", value: 100, val: 100 }
  ];
  O.setState(st);
  O.paint();
  window.__ready = true;
})();
</script>
</body></html>`;

const pagePath = outDir + "/order-edit-row-actions-preview.html";
fs.writeFileSync(pagePath, html);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("PAGEERROR", e.message));
await page.goto("file://" + pagePath, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.__ready === true && window.BoinyaOrders, null, { timeout: 20000 });
await page.waitForSelector(".nx-line", { timeout: 10000 });

const before = await page.evaluate(() => ({
  lines: document.querySelectorAll(".nx-line").length,
  dels: document.querySelectorAll('[data-act="idel"]').length,
  fracs: document.querySelectorAll('[data-act="ifrac"]').length,
  steps: document.querySelectorAll('[data-act="step"]').length,
  add: !!document.querySelector('[data-act="add"]'),
  save: !!document.querySelector('[data-act="save"]'),
  htmlSample: (document.querySelector(".nx-line") || {}).innerText || ""
}));

await page.screenshot({ path: outDir + "/order-edit-row-actions-before.png", fullPage: true });

await page.locator('[data-act="ifrac"]').first().click();
await page.waitForTimeout(150);
const fracChoice = await page.evaluate(() => (window.__choices || [])[0] || null);

await page.locator('[data-act="idel"]').nth(1).click();
await page.waitForTimeout(150);
const afterDel = await page.evaluate(() => ({
  lines: document.querySelectorAll(".nx-line").length,
  dels: document.querySelectorAll('[data-act="idel"]').length,
  heart: /Сердце/i.test(document.getElementById("nxLines").innerText),
  lung: /Лёгк/i.test(document.getElementById("nxLines").innerText)
}));

// F5 reload persistence of markup (re-paint)
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
await page.waitForSelector('[data-act="idel"]', { timeout: 10000 });
const afterF5 = await page.evaluate(() => ({
  dels: document.querySelectorAll('[data-act="idel"]').length,
  fracs: document.querySelectorAll('[data-act="ifrac"]').length
}));

await page.screenshot({ path: outDir + "/order-edit-row-actions-after.png", fullPage: true });

const report = {
  before,
  fracChoiceOpened: !!(fracChoice && fracChoice.options && fracChoice.options.length),
  fracOptionsSample: (fracChoice && fracChoice.options || []).slice(0, 4).map((o) => o.label || o.value),
  afterDel,
  afterF5,
  ok:
    before.lines === 2 &&
    before.dels === 2 &&
    before.fracs === 2 &&
    before.add &&
    before.save &&
    afterDel.lines === 1 &&
    afterDel.heart &&
    !afterDel.lung &&
    afterF5.dels >= 1 &&
    afterF5.fracs >= 1
};
fs.writeFileSync(outDir + "/order-edit-row-actions-preview.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!report.ok) process.exit(1);
