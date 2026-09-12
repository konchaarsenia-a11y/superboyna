#!/usr/bin/env python3
"""Playwright smoke: inspect-loca picker only for tid 827494606."""
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

ME_POINTS = [
    {"id": "pt_nan_1", "networkId": "net_nan", "name": "nan_animal_clinic", "address": "ул. Янковского, 34"},
    {"id": "pt_fundog_1", "networkId": "net_fundog", "name": "Fundog", "address": "Минск"},
    {"id": "pt_polotno_1", "networkId": "net_polotno", "name": "polotno_an", "address": "Чечота 11"},
    {"id": "pt_varka_repina_4", "networkId": "net_varka", "name": "Varka Репина 4", "address": "Репина 4"},
]
ME_NETS = [
    {"id": "net_nan", "name": "NaN clinic"},
    {"id": "net_fundog", "name": "Fundog"},
    {"id": "net_polotno", "name": "Polotno"},
    {"id": "net_varka", "name": "Varka"},
]
ORDERS = [
    {"id": "o1", "status": "new", "locationId": "pt_fundog_1", "locationName": "Fundog", "networkId": "net_fundog",
     "dateIso": "2026-09-12", "basket": [{"name": "Сердце", "qty": 100, "unit": "г"}]},
    {"id": "o2", "status": "new", "locationId": "pt_nan_1", "locationName": "nan_animal_clinic", "networkId": "net_nan",
     "dateIso": "2026-09-11", "basket": [{"name": "Лёгкое", "qty": 50, "unit": "г"}]},
    {"id": "o3", "status": "delivered", "locationId": "pt_varka_repina_4", "locationName": "Varka Репина 4",
     "networkId": "net_varka", "dateIso": "2026-09-10", "basket": [{"name": "Купон", "qty": 1, "unit": "шт"}]},
]


def mock_me(tid: str, username: str, inspect: bool):
    pts = [p for p in ME_POINTS if p["networkId"] != "net_varka"] if inspect else ME_POINTS[:1]
    nets = [n for n in ME_NETS if n["id"] != "net_varka"] if inspect else ME_NETS[:1]
    return {
        "status": "success",
        "allowed": True,
        "ownersOnly": inspect,
        "role": "owner" if inspect else "partner",
        "isPartner": not inspect,
        "isOwner": inspect,
        "name": "Live test" if inspect else "Обычный партнёр",
        "username": username,
        "telegramId": tid,
        "networkId": pts[0]["networkId"],
        "pointIds": [p["id"] for p in pts],
        "allowedPointIds": {p["id"]: True for p in pts},
        "points": pts,
        "networks": nets,
        "catalog": [
            {"id": "vr_t_heart", "type": "treat", "name": "Сердце", "unit": "г", "active": True},
            {"id": "vr_t_lung", "type": "treat", "name": "Лёгкое", "unit": "г", "active": True},
        ],
        "canPickInspectLoca": inspect,
        "partnerOverride": "owner_all_except_net_varka" if inspect else "",
    }


def start_server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/app.html"


def attach_mocks(page, tid: str, username: str, inspect: bool, hits: list):
    me = mock_me(tid, username, inspect)

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
        hits.append(action or url)
        if action == "partnerGetMe":
            route.fulfill(status=200, content_type="application/json", body=json.dumps(me))
            return
        if action == "partnerListMyOrders":
            loc = str(post.get("locationId") or "")
            orders = [o for o in ORDERS if o["networkId"] != "net_varka"]
            if loc:
                orders = [o for o in orders if o["locationId"] == loc and not loc.startswith("pt_varka_")]
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps({"status": "success", "orders": orders}))
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


def run():
    httpd, url = start_server()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        hits = []
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        attach_mocks(page, "827494606", "one_more_person_228", True, hits)
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(800)
        page.wait_for_function(
            "() => document.getElementById('inspectLocaChip') && document.getElementById('inspectLocaChip').style.display !== 'none'",
            timeout=8000,
        )
        page.screenshot(path=str(ART / "inspect-loca-order.png"), full_page=True)

        page.click("#inspectLocaChip")
        page.wait_for_selector("#screenPoints.on")
        cart_disp = page.evaluate("() => getComputedStyle(document.getElementById('cartBar')).display")
        if cart_disp != "none":
            fail("inspect picker must hide cart bar")
        html = page.inner_html("#pointsList")
        if "Varka" in html or "pt_varka_" in html:
            fail("Varka leaked into inspect picker")
        if "Fundog" not in html or "nan_animal_clinic" not in html:
            fail("allowed points missing in inspect picker")
        page.screenshot(path=str(ART / "inspect-loca-picker.png"), full_page=True)

        page.click("button.loc:has-text('Fundog')")
        page.wait_for_timeout(400)
        stored = page.evaluate("() => localStorage.getItem('gb_inspect_loca_v1')")
        if stored != "pt_fundog_1":
            fail("localStorage want pt_fundog_1 got " + repr(stored))
        loc_name = page.inner_text("#orderLocName")
        if "Fundog" not in loc_name:
            fail("order header should show Fundog, got " + loc_name)

        page.click("[data-nav='orders']")
        page.wait_for_selector("#inspectLocaOrdersBar")
        page.wait_for_function("() => document.getElementById('inspectLocaOrdersBar').style.display !== 'none'")
        page.wait_for_timeout(500)
        orders_html = page.inner_html("#myOrdersList")
        if "Fundog" not in orders_html:
            fail("history should keep Fundog order")
        if "nan_animal_clinic" in orders_html or "Varka" in orders_html:
            fail("history filter leaked other/Varka orders: " + orders_html)
        sel = page.locator("#inspectLocaOrdersSelect").inner_html()
        if "pt_varka_" in sel or "Varka" in sel:
            fail("history select lists Varka")
        page.screenshot(path=str(ART / "inspect-loca-history.png"), full_page=True)

        page.click("[data-nav='cabinet']")
        page.wait_for_selector("#inspectLocaCard")
        page.wait_for_function("() => document.getElementById('inspectLocaCard').style.display !== 'none'")
        cab_sel = page.locator("#inspectLocaSelect").inner_html()
        if "pt_varka_" in cab_sel or "Varka" in cab_sel:
            fail("cabinet select lists Varka")
        page.screenshot(path=str(ART / "inspect-loca-cabinet.png"), full_page=True)
        ctx.close()

        hits2 = []
        ctx2 = browser.new_context(viewport={"width": 390, "height": 844})
        page2 = ctx2.new_page()
        attach_mocks(page2, "111", "regular_partner", False, hits2)
        page2.goto(url, wait_until="domcontentloaded")
        page2.wait_for_timeout(1500)
        chip_disp = page2.evaluate("() => getComputedStyle(document.getElementById('inspectLocaChip')).display")
        card_disp = page2.evaluate("() => getComputedStyle(document.getElementById('inspectLocaCard')).display")
        if chip_disp != "none" or card_disp != "none":
            fail("ordinary partner must not see inspect UI")
        page2.screenshot(path=str(ART / "inspect-loca-other-user.png"), full_page=True)
        ctx2.close()
        browser.close()
    httpd.shutdown()
    print("OK: inspect-loca UI smoke")
    print("  picker + persist Fundog, history filtered, Varka hidden, other tid no UI")


if __name__ == "__main__":
    run()
