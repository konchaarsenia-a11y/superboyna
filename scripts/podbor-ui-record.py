#!/usr/bin/env python3
from playwright.sync_api import sync_playwright
import os, subprocess, json

OUT = "/opt/cursor/artifacts"
os.makedirs(OUT, exist_ok=True)
ANKET = """1. Особенно понравился рубец и лёгкое, печень проигнорировал.
2. Количества не хватило, было впритык.
3. Удобнее мелкое.
ЛЁГКОЕ — 100 г (среднее)
РУБЕЦ Т — 80 г (среднее)
УХО Г — 1 шт (обычное)
"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 420, "height": 900},
        record_video_dir=OUT,
        record_video_size={"width": 420, "height": 900},
    )
    page = context.new_page()
    page.goto(
        "http://127.0.0.1:8765/boinya-c/app.html?v=71115993&sandbox=1",
        wait_until="domcontentloaded",
        timeout=60000,
    )
    page.wait_for_timeout(1800)
    page.evaluate(
        """() => {
      document.querySelectorAll('.modal,.overlay,.toast,[class*=Modal]').forEach(el => { try{el.style.display='none';}catch(e){} });
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const sc = document.getElementById('priceScreen');
      if (sc) sc.classList.add('active');
      if (typeof setPriceMode === 'function') setPriceMode('pp');
    }"""
    )
    page.wait_for_timeout(400)
    page.locator("#btnPricePodbor").click()
    page.wait_for_timeout(350)
    page.click("#pricePickTargetBp1")
    page.wait_for_timeout(250)
    page.screenshot(path=f"{OUT}/podbor-01-button.png")
    page.fill("#pricePickPaste", ANKET)
    page.wait_for_timeout(300)
    page.click("#btnPricePickRun")
    page.wait_for_timeout(700)
    page.evaluate("() => document.querySelectorAll('.toast').forEach(t => t.remove())")
    page.locator("#pricePickPreview").scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    page.screenshot(path=f"{OUT}/podbor-02-preview.png")
    page.locator("#priceBasketContainer").scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    page.screenshot(path=f"{OUT}/podbor-03-bp1-applied.png")
    page.click("#btnPricePickAgain")
    page.wait_for_timeout(300)
    page.click("#pricePickTargetRet")
    page.wait_for_timeout(200)
    page.click("#btnPricePickRun")
    page.wait_for_timeout(700)
    page.evaluate("() => document.querySelectorAll('.toast').forEach(t => t.remove())")
    page.locator("#priceBasketContainer").scroll_into_view_if_needed()
    page.screenshot(path=f"{OUT}/podbor-04-retail-applied.png")
    page.wait_for_timeout(400)
    context.close()
    browser.close()

vids = sorted(
    [f for f in os.listdir(OUT) if f.endswith(".webm")],
    key=lambda f: os.path.getmtime(os.path.join(OUT, f)),
    reverse=True,
)
assert vids, "no webm"
src = os.path.join(OUT, vids[0])
dst = os.path.join(OUT, "podbor-demo.webm")
if src != dst:
    os.replace(src, dst)
mp4 = os.path.join(OUT, "podbor-demo.mp4")
r = subprocess.run(
    ["ffmpeg", "-y", "-i", dst, "-c:v", "libx264", "-pix_fmt", "yuv420p", mp4],
    capture_output=True,
    text=True,
)
print(json.dumps({"webm": dst, "mp4": mp4 if r.returncode == 0 else None, "ffmpeg": r.returncode}, ensure_ascii=False))
