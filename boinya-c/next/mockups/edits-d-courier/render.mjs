/** Снимки макетов Курьер, 390×844, темы A и B. */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const img = join(here, "img");
mkdirSync(img, { recursive: true });
const port = 8942;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  cwd: root,
  stdio: "ignore"
});

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:" + port + "/next/mockups/edits-d-courier/index.html");
      if (res.ok) return;
    } catch (e) {}
    await wait(150);
  }
  throw new Error("server");
}

const shots = [
  ["v1", "edits-d-courier-v1"],
  ["v2", "edits-d-courier-v2"],
  ["v3", "edits-d-courier-v3"]
];

async function main() {
  await ready();
  const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome" });
  const page = await browser.newPage({ viewport: { width: 420, height: 3600 }, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:" + port + "/next/mockups/edits-d-courier/index.html", { waitUntil: "networkidle" });
  for (const scheme of [["dark", "a"], ["light", "b"]]) {
    await page.evaluate((s) => document.documentElement.setAttribute("data-scheme", s), scheme[0]);
    await wait(80);
    for (const pair of shots) {
      const el = page.locator("#" + pair[0]);
      const box = await el.boundingBox();
      if (!box || box.width < 380 || box.height < 800) throw new Error("size " + pair[0] + " " + JSON.stringify(box));
      const name = pair[1] + "-" + scheme[1] + ".png";
      await page.screenshot({
        path: join(img, name),
        clip: { x: Math.round(box.x), y: Math.round(box.y), width: 390, height: 844 }
      });
      console.log("shot", name);
    }
  }
  await browser.close();
  server.kill();
}

main().catch((e) => {
  console.error(e);
  server.kill();
  process.exit(1);
});
