#!/usr/bin/env python3
"""UI smoke: вкладки Расчёт | Подбор и отдельный экран Подбора."""
from playwright.sync_api import sync_playwright
import json, os

OUT = "/opt/cursor/artifacts"
os.makedirs(OUT, exist_ok=True)

ANKET = """Венгерская выжла, 6 лет, 35 кг. Давали лёгкое, бычий пенис.
Не понравилась трахея. Аллергия на рыбу. Нужно лёгкое.
Бюджет 50–80. Мелкие кубики.
"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 420, "height": 900})
    page.goto("http://127.0.0.1:8765/boinya-c/app.html?v=71115995&sandbox=1", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(1500)

    page.evaluate("""() => {
      try { window.APP_ROLE = 'manager'; } catch (e) {}
      try {
        const gate = document.getElementById('accessGate');
        if (gate) { gate.classList.remove('open'); gate.style.display = 'none'; }
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const sc = document.getElementById('priceScreen');
        if (sc) sc.classList.add('active');
        if (typeof setPriceMode === 'function') setPriceMode('pp');
        if (typeof setPriceShell_ === 'function') setPriceShell_('calc');
      } catch (e) { console.error(e); }
    }""")
    page.wait_for_timeout(400)

    assert page.locator("#priceShellCalc").is_visible()
    assert page.locator("#priceShellPick").is_visible()
    assert page.locator("#priceCalcPane").is_visible()
    assert page.locator("#pricePickPane").is_hidden()
    assert page.locator("#pricePickPanel").count() == 0
    assert page.locator("#btnPricePodbor").count() == 0
    assert page.locator("#priceModeBp1").is_visible()
    page.screenshot(path=f"{OUT}/podbor-tabs-calc.png", full_page=False)

    page.click("#priceShellPick")
    page.wait_for_timeout(250)
    assert page.locator("#pricePickPane").is_visible()
    assert page.locator("#priceCalcPane").is_hidden()
    assert page.locator("#pricePickTargetBp1").is_visible()
    assert page.locator("#pricePickTargetBp2").is_visible()
    assert page.locator("#pricePickTargetRet").is_visible()
    assert page.locator("#pricePickTargetPp").is_visible()
    assert "active" not in (page.locator("#pricePickTargetBp1").get_attribute("class") or "")
    page.screenshot(path=f"{OUT}/podbor-screen-types.png", full_page=False)

    page.click("#pricePickTargetBp1")
    page.fill("#pricePickPaste", ANKET)
    page.click("#btnPricePickRun")
    page.wait_for_timeout(700)
    preview = page.locator("#pricePickPreview")
    assert preview.is_visible(), "preview not shown"
    assert page.locator("#pricePickEditor").is_visible()
    assert page.locator("#priceCalcPane").is_hidden(), "подбор не должен оставаться на экране расчёта"
    text = preview.inner_text()
    up = text.upper()
    lung = page.locator("#pricePickPreview .basket-card").filter(has_text="ЛЁГКОЕ").locator("input")
    assert "БП1" in text
    assert lung.input_value() == "40"
    assert "ИТОГОВЫЙ" not in up
    page.locator("#pricePickPreview .basket-card").filter(has_text="ЛЁГКОЕ").locator("input").fill("45")
    page.screenshot(path=f"{OUT}/podbor-preview.png", full_page=False)

    page.click("#btnPricePickApply")
    page.wait_for_timeout(700)
    assert page.locator("#priceCalcPane").is_visible()
    assert page.locator("#pricePickPane").is_hidden()
    basket = page.locator("#priceBasketContainer").inner_text()
    assert "ЛЁГКОЕ" in basket and "45" in basket, basket[:240]
    bp1 = basket

    page.click("#priceShellPick")
    page.wait_for_timeout(250)
    assert ANKET.strip()[:20] in page.locator("#pricePickPaste").input_value()
    assert page.locator("#pricePickEditor").is_visible()
    page.click("#btnPricePickAgain")
    page.wait_for_timeout(200)
    page.click("#pricePickTargetRet")
    page.click("#btnPricePickRun")
    page.wait_for_timeout(700)
    assert page.locator("#pricePickPane").is_visible()
    page.click("#btnPricePickApply")
    page.wait_for_timeout(700)
    ret = page.locator("#priceBasketContainer").inner_text()
    assert len(bp1) > 10 and len(ret) > 10
    page.click("#priceModeBp1")
    page.wait_for_timeout(300)
    bp1_again = page.locator("#priceBasketContainer").inner_text()
    assert "45" in bp1_again and ("ЛЁГКОЕ" in bp1_again or "РУБЕЦ" in bp1_again), bp1_again[:240]
    page.screenshot(path=f"{OUT}/podbor-applied-retail.png", full_page=False)

    result = {
        "ok": True,
        "shell": "tabs",
        "bp1_chars": len(bp1),
        "retail_chars": len(ret),
        "basket_sample": basket[:240]
    }
    with open(f"{OUT}/podbor-ui-smoke.json", "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    browser.close()
