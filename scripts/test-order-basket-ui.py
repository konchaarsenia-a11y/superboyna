#!/usr/bin/env python3
"""Playwright: order basket visible on entry AND when viewing/editing a record."""
from __future__ import annotations

import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / "boinya-c"
ART = Path("/opt/cursor/artifacts")
ART.mkdir(parents=True, exist_ok=True)

SAMPLE_CLIENT = {
    "name": "zzz_test",
    "client": "zzz_test",
    "address": "Белецкого 10к2",
    "phone": "+375291000000",
    "basket": [
        {
            "cat": "dressura",
            "name": "ЛЁГКОЕ",
            "main": "ЛЁГКОЕ",
            "sub": "Среднее",
            "val": 320,
            "value": 320,
        },
        {
            "cat": "chew",
            "name": "АОРТА",
            "main": "АОРТА",
            "sub": "Обычная",
            "val": 1,
            "value": 1,
        },
    ],
    "orderCount": 2,
    "segment": "ПП",
}


def start_server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}"


def json_ok(route, body):
    route.fulfill(
        status=200,
        content_type="application/json; charset=utf-8",
        body=json.dumps(body, ensure_ascii=False),
    )


def attach_mocks(page):
    def handle_route(route):
        req = route.request
        url = req.url
        if "telegram.org" in url:
            route.fulfill(
                status=200,
                content_type="application/javascript",
                body="window.Telegram=window.Telegram||{};window.Telegram.WebApp={ready:function(){},expand:function(){}};",
            )
            return
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        action = (qs.get("action") or [""])[0]
        if req.method == "POST":
            try:
                body = req.post_data or ""
                if "action=" in body:
                    post_qs = parse_qs(body)
                    action = (post_qs.get("action") or [action])[0]
                elif body.strip().startswith("{"):
                    j = json.loads(body)
                    action = j.get("action") or action
            except Exception:
                pass
        if "workers.dev" in url or "script.google.com" in url:
            if action == "getMyAccess":
                json_ok(route, {"status": "success", "role": "all", "telegramId": "1", "name": "test"})
                return
            if action == "getMonthOverview":
                json_ok(route, {"status": "success", "month": "2026-09", "days": [], "total": 0})
                return
            if action == "getWeekDayCounts":
                json_ok(
                    route,
                    {
                        "status": "success",
                        "items": [{"day": "Понедельник", "date": "14.09.2026", "count": 1}],
                        "total": 1,
                    },
                )
                return
            if action == "getViewCompare":
                json_ok(
                    route,
                    {
                        "status": "success",
                        "day": "Понедельник",
                        "week": [SAMPLE_CLIENT],
                        "month": [SAMPLE_CLIENT],
                        "fromD1": True,
                        "d1Verified": True,
                    },
                )
                return
            if action == "getClients":
                json_ok(route, {"status": "success", "clients": [SAMPLE_CLIENT], "fromD1": True})
                return
            json_ok(route, {"status": "success"})
            return
        route.continue_()

    page.route("**/*", handle_route)


def dismiss_gate(page):
    page.evaluate(
        """() => {
          const gate = document.getElementById('accessGate');
          if (gate) { gate.classList.remove('open'); gate.style.display = 'none'; gate.style.pointerEvents = 'none'; }
        }"""
    )


def has_product(text, *needles):
    up = (text or "").upper().replace("Ё", "Е")
    return any(n.upper().replace("Ё", "Е") in up for n in needles)


def main():
    httpd, origin = start_server()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
        page = context.new_page()
        attach_mocks(page)
        page.add_init_script(
            """
            localStorage.setItem('superboyna_app_role', 'all');
            localStorage.setItem('superboyna_tg_id', '1');
            """
        )
        page.goto(origin + "/app.html?sandbox=1&tid=1&v=71115972", wait_until="load", timeout=60000)
        page.wait_for_function("typeof window.renderBasket === 'function'", timeout=20000)
        dismiss_gate(page)
        page.wait_for_selector("#orderScreen.active", timeout=10000)

        # --- 1) creating an entry: empty basket paints ---
        page.wait_for_function(
            """() => {
              var box = document.getElementById('basketContainer');
              return !!(box && /пуста/i.test(box.textContent || ''));
            }""",
            timeout=8000,
        )
        page.locator("#basketContainer").scroll_into_view_if_needed()
        page.screenshot(path=str(ART / "order_basket_empty.png"), full_page=False)

        # calendar from #306 still on the order form
        if page.locator("#orderDateCal").count() == 0:
            raise SystemExit("FAIL: #orderDateCal missing (calendar #306 regression)")

        # --- 2) add a position via the real picker ---
        page.locator("#btnManualEntry").click()
        page.wait_for_selector("#manualEntryPanel", timeout=5000)
        page.evaluate("() => openProductSelector('veg')")
        page.wait_for_selector("#selectorCard", timeout=5000)
        page.select_option("#mainSelect", label="БАНАНЫ")
        page.fill("#volumeInput", "80")
        page.locator("#selectorCard button", has_text="В корзину").click()
        page.wait_for_selector("#basketContainer .basket-card", timeout=5000)
        entry_txt = page.locator("#basketContainer").inner_text()
        if not has_product(entry_txt, "БАНАНЫ"):
            raise SystemExit("FAIL: order entry basket missing БАНАНЫ, got: " + entry_txt)
        if page.locator("#basketContainer .basket-card").count() < 1:
            raise SystemExit("FAIL: no .basket-card after add")
        page.locator("#basketContainer").scroll_into_view_if_needed()
        page.screenshot(path=str(ART / "order_basket_entry.png"), full_page=False)

        # --- 3) viewing an existing record: tap card → состав ---
        page.evaluate("() => switchTab('clientsScreen')")
        page.wait_for_selector("#clientsScreen.active", timeout=8000)
        page.evaluate("() => openViewWeekDay('Понедельник', '2026-09-14')")
        page.wait_for_selector("#clientsContainer .client-item-card", timeout=15000)
        page.locator("#clientsContainer .client-main-row").first.click()
        page.wait_for_selector("#details_0.open, #details_0[style*='display: block']", timeout=5000)
        view_txt = page.locator("#details_0").inner_text()
        if not has_product(view_txt, "ЛЁГКОЕ", "ЛЕГКОЕ"):
            raise SystemExit("FAIL: view record basket missing ЛЁГКОЕ, got: " + view_txt)
        if not has_product(view_txt, "АОРТА"):
            raise SystemExit("FAIL: view record basket missing АОРТА, got: " + view_txt)
        page.locator("#details_0").scroll_into_view_if_needed()
        page.screenshot(path=str(ART / "view_record_basket.png"), full_page=False)

        # --- 4) ✏️ existing record fills the order basket ---
        page.locator("#clientsContainer .crm-edit").first.click()
        page.wait_for_selector("#orderScreen.active", timeout=10000)
        page.wait_for_selector("#basketContainer .basket-card", timeout=8000)
        edit_txt = page.locator("#basketContainer").inner_text()
        if "пуста" in edit_txt.lower() and page.locator("#basketContainer .basket-card").count() == 0:
            raise SystemExit("FAIL: edit existing record left basket empty")
        if not has_product(edit_txt, "ЛЁГКОЕ", "ЛЕГКОЕ"):
            raise SystemExit("FAIL: edit record basket missing ЛЁГКОЕ, got: " + edit_txt)
        page.locator("#basketContainer").scroll_into_view_if_needed()
        page.screenshot(path=str(ART / "order_basket_edit_record.png"), full_page=False)

        browser.close()
    httpd.shutdown()
    print("PASS  order entry + view record basket visible")


if __name__ == "__main__":
    main()
