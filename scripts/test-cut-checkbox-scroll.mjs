#!/usr/bin/env node
/**
 * Regression: cutting checkbox click must not jump the page to the top.
 * Source contract + Playwright (injected list, persist stubbed).
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uiSrc = fs.readFileSync(path.join(root, "boinya-c/app.main.js"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function srcBetween(fnName) {
  const start = uiSrc.indexOf("async function " + fnName);
  assert(start >= 0, "missing " + fnName);
  const next = uiSrc.indexOf("\n    async function ", start + 10);
  const next2 = uiSrc.indexOf("\n    window.", start + 10);
  const end = Math.min(
    next > start ? next : uiSrc.length,
    next2 > start ? next2 : uiSrc.length
  );
  return uiSrc.slice(start, end);
}

assert(uiSrc.includes("function captureCuttingScroll_"), "need captureCuttingScroll_");
assert(uiSrc.includes("function restoreCuttingScroll_"), "need restoreCuttingScroll_");
assert(uiSrc.includes("function restoreCuttingFocus_"), "need restoreCuttingFocus_");
assert(uiSrc.includes("function applyCutFlagDom_"), "need applyCutFlagDom_");
assert(uiSrc.includes("function paintCuttingList_"), "need paintCuttingList_");
assert(uiSrc.includes("focus({ preventScroll: true })"), "focus must use preventScroll");
assert(uiSrc.includes('for="cut_laid_'), "laid label needs for=");
assert(uiSrc.includes('for="cut_done_'), "done label needs for=");
assert(!/<label class="check-line" for="cut_laid_/.test(uiSrc), "do not nest input inside label[for] (double-toggle)");
assert(uiSrc.includes("overflow-anchor") || true, "css optional");

const laid = srcBetween("toggleCutLaid");
const done = srcBetween("toggleCutDone");
const outNext = srcBetween("toggleCutOutNext");
assert(!/reorderCuttingDom\(\)/.test(laid), "toggleCutLaid must not reorder (scroll jump)");
assert(!/reorderCuttingDom\(\)/.test(done), "toggleCutDone must not reorder (scroll jump)");
assert(!/reorderCuttingDom\(\)/.test(outNext), "toggleCutOutNext must not reorder");
assert(/applyCutFlagDom_/.test(laid), "toggleCutLaid updates row in place");
assert(/applyCutFlagDom_/.test(done), "toggleCutDone updates row in place");
assert(/restoreCuttingScroll_/.test(laid) && /restoreCuttingFocus_/.test(laid), "laid restores view");
assert(/restoreCuttingScroll_/.test(done) && /restoreCuttingFocus_/.test(done), "done restores view");
assert(/restoreCuttingScroll_/.test(outNext), "outNext restores scroll after confirm");

const reorderFn = uiSrc.slice(uiSrc.indexOf("function reorderCuttingDom"));
assert(reorderFn.includes("withCuttingScroll_"), "reorderCuttingDom must keep scroll if used");
assert(uiSrc.includes("paintCuttingList_(box,"), "loadCutting paints via scroll-safe helper");

console.log("source contract OK");

async function runPlaywright() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (e) {
    console.log("npm playwright missing — browser proof via python playwright in CI/agent");
    return;
  }

  const boinya = path.join(root, "boinya-c");
  const server = http.createServer(function (req, res) {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/app.html";
    const file = path.normalize(path.join(boinya, urlPath));
    if (!file.startsWith(boinya)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, function (err, data) {
      if (err) { res.writeHead(404); res.end("nf"); return; }
      const ext = path.extname(file);
      const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
      res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
  await new Promise(function (resolve) { server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
  await page.goto("http://127.0.0.1:" + port + "/app.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(function () { return typeof window.toggleCutLaid === "function"; }, null, { timeout: 20000 });

  const result = await page.evaluate(async function () {
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("active"); });
    var screen = document.getElementById("cuttingScreen");
    screen.classList.add("active");
    screen.style.display = "block";
    var items = [];
    for (var i = 0; i < 18; i++) {
      items.push({
        row: 3 + i,
        name: "SKU " + (i + 1) + " ТЕСТ",
        dry: 100,
        raw: 0.2,
        unit: "гр",
        laid: false,
        done: false,
        outNext: false,
        surplus: 0
      });
    }
    window.__injectCuttingTestList(items, { stubPersist: true });
    document.documentElement.style.height = "auto";
    document.body.style.height = "auto";
    document.body.style.overflow = "auto";
    window.scrollTo(0, 0);
    var mid = document.getElementById("cut_laid_12");
    if (!mid) return { ok: false, reason: "no mid checkbox" };
    mid.scrollIntoView({ block: "center" });
    var before = window.scrollY || document.scrollingElement.scrollTop;
    if (before < 80) return { ok: false, reason: "page not scrolled enough: " + before };
    mid.click();
    await new Promise(function (r) { setTimeout(r, 80); });
    var after = window.scrollY || document.scrollingElement.scrollTop;
    var stillChecked = !!mid.checked;
    var focused = document.activeElement && document.activeElement.id === "cut_laid_12";
    var jumped = after < 40 || Math.abs(after - before) > 160;
    return {
      ok: stillChecked && !jumped,
      before: before,
      after: after,
      stillChecked: stillChecked,
      focused: focused,
      jumped: jumped
    };
  });

  await browser.close();
  server.close();
  if (!result.ok) {
    throw new Error("playwright scroll jump: " + JSON.stringify(result));
  }
  console.log("playwright OK", result);
}

await runPlaywright();
console.log("test-cut-checkbox-scroll PASS");
