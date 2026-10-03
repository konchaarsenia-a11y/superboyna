import { chromium } from "playwright-core";
import { spawn, execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const imgDir = join(root, "img");
const chrome = process.env.CHROME || "/usr/local/bin/google-chrome";

function wait(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function serve(cwd, port) {
  return spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: cwd,
    stdio: "ignore"
  });
}

async function ready(url) {
  for (var i = 0; i < 40; i++) {
    try {
      var res = await fetch(url);
      if (res.ok) return;
    } catch (e) {}
    await wait(150);
  }
  throw new Error("server " + url);
}

var shots = ["v1", "v2", "v3", "v4"].flatMap(function (v) {
  return [v + "-a", v + "-b"];
});

var browser = await chromium.launch({
  executablePath: chrome,
  args: ["--disable-dev-shm-usage"]
});
var port = 8844;
var server = serve(root, port);
try {
  await ready("http://127.0.0.1:" + port + "/index.html");
  await mkdir(imgDir, { recursive: true });
  var page = await browser.newPage({ viewport: { width: 1400, height: 980 }, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(function () { return document.fonts && document.fonts.ready; });
  await wait(300);
  var audit = await page.evaluate(function () {
    var clipped = [];
    var dots = [];
    var periods = [];
    var overflow = [];
    document.querySelectorAll("article.phone").forEach(function (el) {
      var h = el.querySelector("h1");
      if (h && h.scrollWidth > h.clientWidth + 1) clipped.push(el.id);
      var text = el.innerText || "";
      if (text.indexOf("·") >= 0 || text.indexOf("•") >= 0) dots.push(el.id);
      var cleaned = text.replace(/ул\./g, "").replace(/\d\.\d/g, "");
      if (cleaned.indexOf(".") >= 0) periods.push(el.id + " " + cleaned.replace(/\s+/g, " ").slice(0, 180));
      var body = el.querySelector(".body");
      if (body && body.scrollHeight > body.clientHeight + 1) {
        overflow.push(el.id + " " + body.scrollHeight + ">" + body.clientHeight);
      }
    });
    var icons = [];
    document.querySelectorAll("article.phone .icon-btn").forEach(function (b) {
      var r = b.getBoundingClientRect();
      if (Math.abs(r.width - 44) > 1.2 || Math.abs(r.height - 44) > 1.2) {
        icons.push(b.closest("article").id + " " + Math.round(r.width) + "x" + Math.round(r.height));
      }
    });
    var chromeBad = [];
    document.querySelectorAll("article.phone").forEach(function (el) {
      var top = el.querySelector(".top");
      var tabs = el.querySelector(".tabs");
      if (top && Math.abs(top.getBoundingClientRect().height - 56) > 1.2) chromeBad.push(el.id + " top");
      if (tabs && Math.abs(tabs.getBoundingClientRect().height - 62) > 1.2) chromeBad.push(el.id + " tabs");
      var box = el.getBoundingClientRect();
      if (Math.abs(box.width - 390) > 1.2 || Math.abs(box.height - 844) > 1.2) {
        chromeBad.push(el.id + " " + Math.round(box.width) + "x" + Math.round(box.height));
      }
    });
    return { clipped: clipped, dots: dots, periods: periods, overflow: overflow, icons: icons, chromeBad: chromeBad };
  });
  console.log(JSON.stringify(audit, null, 2));
  if (audit.clipped.length || audit.dots.length || audit.periods.length || audit.overflow.length || audit.icons.length || audit.chromeBad.length) {
    throw new Error("mockup audit failed");
  }
  for (var i = 0; i < shots.length; i++) {
    var id = "crumb-" + shots[i];
    var file = join(imgDir, id + ".png");
    await page.locator("#" + id).screenshot({ path: file });
    console.log(file);
  }
  execFileSync("python3", ["-c", `
from PIL import Image
from pathlib import Path
root = Path(${JSON.stringify(imgDir)})
for f in root.glob("crumb-v*.png"):
    im = Image.open(f)
    if im.size != (390, 844):
        im = im.crop((0, 0, 390, 844))
        im.save(f)
    im = Image.open(f)
    if im.size != (390, 844):
        raise SystemExit("bad size " + f.name + " " + str(im.size))
    print(f.name, im.size)
`]);
} finally {
  await browser.close();
  server.kill();
}
