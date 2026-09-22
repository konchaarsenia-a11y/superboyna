#!/usr/bin/env python3
"""Короткое демо: вкладки сверху → экран Подбора → выбор типа → в расчёт."""
from playwright.sync_api import sync_playwright
import os, subprocess, json

OUT = "/opt/cursor/artifacts"
os.makedirs(OUT, exist_ok=True)
ANKET = """Венгерская выжла, 6 лет, 35 кг. Давали лёгкое, бычий пенис.
Не понравилась трахея. Аллергия на рыбу. Нужно лёгкое.
Бюджет 50–80. Мелкие кубики.
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
        "http://127.0.0.1:8765/boinya-c/app.html?v=71115995&sandbox=1",
        wait_until="domcontentloaded",
        timeout=60000,
    )
    page.wait_for_timeout(2200)
    page.evaluate(
        """() => {
      const gate = document.getElementById('accessGate');
      if (gate) { gate.classList.remove('open'); gate.style.display = 'none'; }
      const overlay = document.getElementById('modalOverlay');
      if (overlay) { overlay.classList.remove('open'); overlay.style.display = 'none'; overlay.style.pointerEvents = 'none'; }
      document.querySelectorAll('.toast').forEach(t => t.remove());
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const sc = document.getElementById('priceScreen');
      if (sc) sc.classList.add('active');
      if (typeof setPriceMode === 'function') setPriceMode('pp');
      if (typeof setPriceShell_ === 'function') setPriceShell_('calc');
      window.scrollTo(0, 0);
    }"""
    )
    # Setup (order screen + week modal) is before this pause. Demo trim starts here.
    page.wait_for_timeout(1400)
    page.screenshot(path=f"{OUT}/podbor-01-tabs.png")
    page.click("#priceShellPick")
    page.wait_for_timeout(1600)
    page.screenshot(path=f"{OUT}/podbor-02-pick-types.png")
    page.click("#pricePickTargetBp1")
    page.wait_for_timeout(900)
    page.screenshot(path=f"{OUT}/podbor-03-type-bp1.png")
    page.fill("#pricePickPaste", ANKET)
    page.wait_for_timeout(500)
    page.click("#btnPricePickRun")
    page.wait_for_timeout(900)
    page.evaluate("() => document.querySelectorAll('.toast').forEach(t => t.remove())")
    page.locator("#pricePickPreview .basket-card").filter(has_text="ЛЁГКОЕ").locator("input").scroll_into_view_if_needed()
    page.wait_for_timeout(500)
    page.locator("#pricePickPreview .basket-card").filter(has_text="ЛЁГКОЕ").locator("input").fill("45")
    page.wait_for_timeout(700)
    page.screenshot(path=f"{OUT}/podbor-04-edit-rows.png")
    page.locator("#btnPricePickApply").scroll_into_view_if_needed()
    page.wait_for_timeout(1000)
    page.click("#btnPricePickApply")
    page.wait_for_timeout(1400)
    page.evaluate("() => document.querySelectorAll('.toast').forEach(t => t.remove())")
    page.locator("#priceBasketContainer").scroll_into_view_if_needed()
    page.wait_for_timeout(900)
    page.screenshot(path=f"{OUT}/podbor-05-applied.png")
    page.locator("#priceShellTabs").scroll_into_view_if_needed()
    page.wait_for_timeout(700)
    page.click("#priceShellPick")
    page.wait_for_timeout(1400)
    page.screenshot(path=f"{OUT}/podbor-06-draft-kept.png")
    page.wait_for_timeout(600)
    context.close()
    browser.close()

vids = sorted(
    [f for f in os.listdir(OUT) if f.endswith(".webm")],
    key=lambda f: os.path.getmtime(os.path.join(OUT, f)),
    reverse=True,
)
assert vids, "no webm"
src = os.path.join(OUT, vids[0])
dst = os.path.join(OUT, "podbor-shell-demo.webm")
if src != dst:
    os.replace(src, dst)
mp4 = os.path.join(OUT, "podbor-shell-demo.mp4")
# Drop the boot frame (order screen / week modal) before the calc tabs are on screen.
r = subprocess.run(
    ["ffmpeg", "-y", "-ss", "3.4", "-i", dst, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4],
    capture_output=True,
    text=True,
)
print(json.dumps({"webm": dst, "mp4": mp4 if r.returncode == 0 else None, "ffmpeg": r.returncode, "err": r.stderr[-400:]}, ensure_ascii=False))
