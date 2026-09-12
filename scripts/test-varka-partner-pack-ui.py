#!/usr/bin/env python3
"""Playwright: Varka 3.3.45 — баннер Varka, точки без адреса, qty без custom, treats off. NaN banner deferred."""
from __future__ import annotations

import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / "varka"
ART = Path("/opt/cursor/artifacts")
ART.mkdir(parents=True, exist_ok=True)

CATALOG = [
    {"id": "vr_t_heart", "type": "treat", "name": "Сердце", "unit": "г", "active": True},
    {"id": "vr_t_lung", "type": "treat", "name": "Лёгкое", "unit": "г", "active": True},
    {"id": "vr_c_piece", "type": "coupon", "kind": "paper", "name": "Купон", "unit": "шт", "active": True},
    {"id": "vr_c_nfc", "type": "coupon", "kind": "nfc", "name": "Купон NFC", "unit": "шт", "active": True},
    {"id": "vr_c_banner", "type": "coupon", "kind": "paper", "name": "Баннер", "unit": "шт", "active": True},
]


def me_nan():
    pt = {"id": "pt_nan_1", "networkId": "net_nan", "name": "nan_animal_clinic", "address": "ул. Янковского, 34"}
    return {
        "status": "success",
        "allowed": True,
        "role": "partner",
        "isPartner": True,
        "isOwner": False,
        "name": "NaN test",
        "username": "nan_tester",
        "telegramId": "900001",
        "networkId": "net_nan",
        "pointIds": [pt["id"]],
        "allowedPointIds": {pt["id"]: True},
        "points": [pt],
        "networks": [{"id": "net_nan", "name": "NaN clinic"}],
        "catalog": CATALOG,
        "canPickInspectLoca": False,
    }


def me_varka():
    pt = {"id": "pt_varka_repina_4", "networkId": "net_varka", "name": "Varka Репина 4", "address": "Репина 4"}
    return {
        "status": "success",
        "allowed": True,
        "role": "partner",
        "isPartner": True,
        "isOwner": False,
        "name": "Varka test",
        "username": "varka_tester",
        "telegramId": "900003",
        "networkId": "net_varka",
        "pointIds": [pt["id"]],
        "allowedPointIds": {pt["id"]: True},
        "points": [pt],
        "networks": [{"id": "net_varka", "name": "Varka"}],
        "catalog": CATALOG,
        "canPickInspectLoca": False,
    }


def me_polotno():
    pt = {"id": "pt_polotno_1", "networkId": "net_polotno", "name": "polotno_an", "address": "Чечота 11"}
    return {
        "status": "success",
        "allowed": True,
        "role": "partner",
        "isPartner": True,
        "isOwner": False,
        "name": "Polotno test",
        "username": "polotno_tester",
        "telegramId": "900002",
        "networkId": "net_polotno",
        "pointIds": [pt["id"]],
        "allowedPointIds": {pt["id"]: True},
        "points": [pt],
        "networks": [{"id": "net_polotno", "name": "Polotno"}],
        "catalog": CATALOG,
        "canPickInspectLoca": False,
    }


def start_server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/app.html"


def attach_mocks(page, tid: str, username: str, me: dict):
    def handle_route(route):
        req = route.request
        url = req.url
        if "telegram.org" in url:
            route.fulfill(status=200, content_type="application/javascript",
                          body="window.Telegram=window.Telegram||{};")
            return
        if "workers.dev" not in url and "script.google.com" not in url:
            route.continue_()
            return
        try:
            post = req.post_data_json or {}
        except Exception:
            post = {}
        action = str(post.get("action") or "")
        if not action:
            qs = url.split("?", 1)[-1] if "?" in url else ""
            for part in qs.split("&"):
                if part.startswith("action="):
                    action = part.split("=", 1)[-1]
        if action == "partnerGetMe":
            route.fulfill(status=200, content_type="application/json", body=json.dumps(me))
            return
        if action == "partnerListMyOrders":
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps({"status": "success", "orders": []}))
            return
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps({"status": "success"}))

    page.route("**/*", handle_route)
    page.add_init_script(
        """
        window.Telegram = { WebApp: {
          initDataUnsafe: { user: { id: %s, username: %s, first_name: 'Test' } },
          initData: '',
          ready: function(){}, expand: function(){},
          setHeaderColor: function(){}, setBackgroundColor: function(){},
          HapticFeedback: { impactOccurred: function(){}, notificationOccurred: function(){} }
        }};
        try { localStorage.setItem('superboyna_tg_id', %s); } catch (e) {}
        """ % (json.dumps(int(tid) if str(tid).isdigit() else 1), json.dumps(username), json.dumps(tid))
    )


def fail(msg: str):
    raise SystemExit("FAIL: " + msg)


def wait_order(page):
    page.wait_for_selector("#screenOrder.on", timeout=8000)
    page.wait_for_timeout(400)


def run():
    httpd, url = start_server()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        ctx_v = browser.new_context(viewport={"width": 390, "height": 844})
        page_v = ctx_v.new_page()
        attach_mocks(page_v, "900003", "varka_tester", me_varka())
        page_v.goto(url, wait_until="domcontentloaded")
        wait_order(page_v)
        page_v.click('[data-cat="coupon"]')
        page_v.wait_for_timeout(300)
        cat_v = page_v.inner_html("#catalogList")
        if "Баннер" not in cat_v:
            fail("Varka coupons tab must show title Баннер, got: " + cat_v[:400])
        page_v.screenshot(path=str(ART / "varka-pack-varka-banner.png"), full_page=True)
        ctx_v.close()

        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        attach_mocks(page, "900001", "nan_tester", me_nan())
        page.goto(url, wait_until="domcontentloaded")
        wait_order(page)
        page.click('[data-cat="coupon"]')
        page.wait_for_timeout(300)
        cat = page.inner_html("#catalogList")
        if "Баннер" in cat:
            fail("NaN banner is deferred — coupons tab must not show Баннер")
        if "qty-custom" in cat:
            fail("coupon qty must not render custom input")
        if "своё" in cat:
            fail("coupon qty still has custom placeholder")
        for preset in ("48", "73", "96", "120"):
            if preset not in cat:
                fail("missing coupon preset " + preset)
        page.screenshot(path=str(ART / "varka-pack-nan-coupons.png"), full_page=True)

        page.evaluate("() => { if (typeof goPointsForOrder_ === 'function') goPointsForOrder_(); else goPoints(); }")
        page.wait_for_selector("#screenPoints.on", timeout=5000)
        pts = page.inner_html("#pointsList")
        if "nan_animal_clinic" not in pts:
            fail("points list missing nan name")
        if "Янковского" in pts or "ул." in pts:
            fail("points list still shows address: " + pts)
        page.screenshot(path=str(ART / "varka-pack-nan-points.png"), full_page=True)
        ctx.close()

        ctx2 = browser.new_context(viewport={"width": 390, "height": 844})
        page2 = ctx2.new_page()
        attach_mocks(page2, "900002", "polotno_tester", me_polotno())
        page2.goto(url, wait_until="domcontentloaded")
        wait_order(page2)
        treat_disp = page2.evaluate(
            """() => {
              const el = document.querySelector('.tab[data-cat="treat"]');
              return el ? getComputedStyle(el).display : 'missing';
            }"""
        )
        if treat_disp != "none":
            fail("polotno must hide treats tab, display=" + treat_disp)
        cat2 = page2.inner_html("#catalogList")
        if "Сердце" in cat2 or "Лёгкое" in cat2:
            fail("polotno catalog still shows treats")
        if "nfc" not in cat2.lower() and "NFC" not in cat2:
            fail("polotno must keep NFC coupons")
        page2.screenshot(path=str(ART / "varka-pack-polotno-coupons.png"), full_page=True)
        ctx2.close()
        browser.close()
    httpd.shutdown()
    print("OK: varka partner-pack UI")
    print("  Varka Баннер label, NaN no banner, qty presets, points names-only, polotno no treats")


if __name__ == "__main__":
    run()
