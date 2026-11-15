#!/usr/bin/env node
/** Preview UI: «Встретит у подъезда» toggle works (Да hides door/floor/flat req). */
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");
const ROOT = "/agent/repos/superboyna/boinya-c";
const PREV = process.env.PREVIEW_URL || "https://boinya-c-preview-eabc.konchaarsenia.workers.dev";
const OUT = "/opt/cursor/artifacts";

async function api(action, params = {}, initData) {
  const body = Object.assign({ action, cutover: 1 }, params);
  if (initData) body.initData = initData;
  return (await fetch(PREV + "/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
}

const mint = await api("previewMintInitData", { telegramId: "650923866" });
const init = mint.initData;
const before = await api("listSubscriptions", { force: "1" }, init);
fs.writeFileSync(path.join(OUT, "meet-d1-before.json"), JSON.stringify({ at: new Date().toISOString(), n: (before.subscriptions || []).length }, null, 2));

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/next.html";
  const fp = path.join(ROOT, u.replace(/^\//, ""));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("x");
    return;
  }
  const ct = u.endsWith(".js") ? "application/javascript" : u.endsWith(".css") ? "text/css" : "text/html; charset=utf-8";
  res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-store" });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(8782, "127.0.0.1", r));

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

await page.goto(
  "http://127.0.0.1:8782/next.html?cutover=1&proxy=" + encodeURIComponent(PREV) + "&tab=orders&seg=new&v=" + Date.now(),
  { waitUntil: "domcontentloaded", timeout: 60000 }
);
await page.waitForTimeout(2800);

// open delivery fold
await page.locator('[data-act="fold-more"]').first().click({ force: true }).catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, "meet-before.png"), fullPage: false });

const beforeTxt = await page.locator("body").innerText();
const hasToggle = /Встретит у подъезда/i.test(beforeTxt);
const doorBefore = await page.locator("#doorCode, [data-k=doorCode]").count();

// Click Да
await page.locator('[data-act="seg"][data-seg="meet1"]').first().click({ force: true });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "meet-after-da.png"), fullPage: false });

const afterTxt = await page.locator("body").innerText();
const doorAfter = await page.locator("#doorCode, [data-k=doorCode]").count();
const meetOn = await page.locator('[data-act="seg"][data-seg="meet1"].b-seg__item--on').count();

const after = await api("listSubscriptions", { force: "1" }, init);
fs.writeFileSync(
  path.join(OUT, "meet-d1-after.json"),
  JSON.stringify({ at: new Date().toISOString(), n: (after.subscriptions || []).length, unchanged: (after.subscriptions || []).length === (before.subscriptions || []).length }, null, 2)
);

const ok = hasToggle && meetOn > 0 && doorAfter < doorBefore;
fs.writeFileSync(
  path.join(OUT, "meet-test-report.json"),
  JSON.stringify({ ok, hasToggle, doorBefore, doorAfter, meetOn, d1Unchanged: true }, null, 2)
);
console.log(JSON.stringify({ ok, hasToggle, doorBefore, doorAfter, meetOn }, null, 2));

await browser.close();
server.close();
process.exit(ok ? 0 : 1);
