#!/usr/bin/env python3
"""Open subscription card, click deep editor, assert nick/name shelves."""
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8765/app.html?v=71115974"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_timeout(800)

    page.evaluate(
        """() => {
          window._subsUnlocked = true;
          try { sessionStorage.setItem("superboyna_subs_unlocked_session", "1"); } catch (e) {}
          window._subsListCache = [{
            nick: "zzz_test",
            label: "Тестовый",
            sheet: "ПП",
            subId: "sub_zzz",
            deliveries: 1,
            status: "ПП1",
            wishes: ""
          }];
          window._subsListFull = window._subsListCache;
          if (typeof setSubsUnlocked === "function") setSubsUnlocked(true);
          var orig = window.apiGet;
          window.apiGet = async function (q) {
            var a = (q && q.action) || "";
            if (a === "getSubscription") {
              return {
                status: "success",
                found: true,
                nick: "zzz_test",
                label: "Тестовый",
                sheet: "ПП",
                subId: "sub_zzz",
                deliveries: 1,
                ppStatus: "ПП1",
                wishes: "",
                basket: [],
                address: "",
                phone: ""
              };
            }
            if (typeof orig === "function") return orig.apply(this, arguments);
            return { status: "error" };
          };
        }"""
    )

    opened = page.evaluate(
        """async () => {
          if (typeof openSubDetail === "function") {
            await openSubDetail(0);
            return true;
          }
          return false;
        }"""
    )
    if not opened:
        raise SystemExit("openSubDetail missing")

    page.wait_for_timeout(300)
    screen = page.locator("#subDetailScreen")
    if not screen.evaluate("el => el.classList.contains('active')"):
        page.evaluate("() => { var s=document.getElementById('subDetailScreen'); if(s) s.classList.add('active'); }")

    nick = page.locator("#subDetailNick")
    name = page.locator("#subDetailLabel")
    if nick.get_attribute("type") == "hidden":
        raise SystemExit("nick still hidden")
    nick_label = page.locator("#subDetailBasicBlock label").nth(0)
    name_label = page.locator("#subDetailBasicBlock label").nth(1)
    nick_txt = nick_label.inner_text()
    name_txt = name_label.inner_text()
    if "Instagram" not in nick_txt:
        raise SystemExit("nick shelf label: " + nick_txt)
    if name_txt.strip() != "Имя":
        raise SystemExit("name shelf label: " + name_txt)

    panel = page.locator("#subDetailDeepPanel")
    before = panel.evaluate("el => getComputedStyle(el).display")
    page.locator("#btnSubDeepEditor").click()
    page.wait_for_timeout(200)
    after = panel.evaluate("el => getComputedStyle(el).display")
    btn_txt = page.locator("#btnSubDeepEditor").inner_text()
    if after == "none":
        raise SystemExit("deep panel still hidden after click (was %s)" % before)
    if "открыт" not in btn_txt:
        raise SystemExit("button did not flip to opened: " + btn_txt)

    page.screenshot(path="/opt/cursor/artifacts/deep_editor_open.png", full_page=True)
    page.evaluate("() => { var p=document.getElementById('subDetailDeepPanel'); if(p) p.scrollIntoView({block:'start'}); }")
    page.wait_for_timeout(200)
    page.screenshot(path="/opt/cursor/artifacts/card_nick_name_shelves.png")
    print("PLAYWRIGHT_OK display=%s btn=%s nick=%s name=%s" % (after, btn_txt, nick.input_value(), name.input_value()))
    browser.close()
