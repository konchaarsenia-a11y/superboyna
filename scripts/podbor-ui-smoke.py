#!/usr/bin/env python3
"""UI smoke: Подбор on priceScreen (local static serve)."""
from playwright.sync_api import sync_playwright
import json, os, time

OUT = "/opt/cursor/artifacts"
os.makedirs(OUT, exist_ok=True)

ANKET = """Венгерская выжла, 6 лет, 35 кг. Давали лёгкое, бычий пенис.
Не понравилась трахея. Аллергия на рыбу. Нужно лёгкое.
Бюджет 50–80. Мелкие кубики.
"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 420, "height": 900})
    page.goto("http://127.0.0.1:8765/boinya-c/app.html?v=71115994&sandbox=1", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(1500)

    # Bypass access gate for local smoke
    page.evaluate("""() => {
      try { window.APP_ROLE = 'manager'; } catch (e) {}
      try {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const sc = document.getElementById('priceScreen');
        if (sc) sc.classList.add('active');
        if (typeof setPriceMode === 'function') setPriceMode('pp');
      } catch (e) { console.error(e); }
    }""")
    page.wait_for_timeout(400)

    # Ensure Подбор visible
    btn = page.locator("#btnPricePodbor")
    assert btn.count() == 1, "Подбор button missing"
    assert page.locator("#priceModeBp1").count() == 1
    assert page.locator("#priceModeBp2").count() == 1
    page.screenshot(path=f"{OUT}/podbor-price-screen.png", full_page=False)

    btn.click()
    page.wait_for_timeout(200)
    assert page.locator("#pricePickPanel").is_visible()
    assert page.locator("#pricePickTargetBp1").count() == 1
    page.click("#pricePickTargetBp1")
    page.fill("#pricePickPaste", ANKET)
    page.click("#btnPricePickRun")
    page.wait_for_timeout(700)
    preview = page.locator("#pricePickPreview")
    assert preview.is_visible(), "preview not shown"
    text = preview.inner_text()
    up = text.upper()
    assert "БП1" in text
    assert "40" in text and ("ЛЁГКОЕ" in up or "ЛЕГКОЕ" in up)
    assert "ИТОГОВЫЙ" not in up
    page.screenshot(path=f"{OUT}/podbor-preview.png", full_page=False)

    basket = page.locator("#priceBasketContainer").inner_text()
    assert "ЛЁГКОЕ" in basket and "40" in basket, basket[:240]
    bp1 = basket
    page.click("#btnPricePickAgain")
    page.wait_for_timeout(200)
    page.click("#pricePickTargetRet")
    page.click("#btnPricePickRun")
    page.wait_for_timeout(700)
    ret = page.locator("#priceBasketContainer").inner_text()
    assert len(bp1) > 10 and len(ret) > 10
    # BP1 slot stays filled when we switch back
    page.click("#priceModeBp1")
    page.wait_for_timeout(300)
    bp1_again = page.locator("#priceBasketContainer").inner_text()
    assert "ЛЁГКОЕ" in bp1_again or "РУБЕЦ" in bp1_again
    page.screenshot(path=f"{OUT}/podbor-applied-retail.png", full_page=False)

    result = {
        "ok": True,
        "preview_has_slots": True,
        "bp1_chars": len(bp1),
        "retail_chars": len(ret),
        "basket_sample": basket[:240]
    }
    with open(f"{OUT}/podbor-ui-smoke.json", "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    browser.close()
