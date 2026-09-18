#!/usr/bin/env python3
"""Playwright: helper tid 827494606 sees full owner cabinet including Varka + grant."""
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

POINTS = [
    {"id": "pt_nan_1", "networkId": "net_nan", "name": "nan_animal_clinic", "address": "ул. Янковского, 34"},
    {"id": "pt_fundog_1", "networkId": "net_fundog", "name": "Fundog", "address": "Минск"},
    {"id": "pt_varka_repina_4", "networkId": "net_varka", "name": "Varka Репина 4", "address": "Репина 4"},
]
NETS = [
    {"id": "net_nan", "name": "NaN clinic"},
    {"id": "net_fundog", "name": "Fundog"},
    {"id": "net_varka", "name": "Varka"},
]


def mock_me(tid: str, username: str, owner: bool):
    pts = POINTS if owner else POINTS[:1]
    nets = NETS if owner else NETS[:1]
    return {
        "status": "success",
        "allowed": True,
        "ownersOnly": owner,
        "ownerMode": owner,
        "role": "owner" if owner else "partner",
        "isPartner": not owner,
        "isOwner": owner,
        "name": "Helper" if owner else "Обычный партнёр",
        "username": username,
        "telegramId": tid,
        "networkId": pts[0]["networkId"],
        "pointIds": [p["id"] for p in pts],
        "allowedPointIds": {p["id"]: True for p in pts},
        "points": pts,
        "networks": nets,
        "access": [
            {"id": "pa_staff", "telegramId": "111", "username": "clinic_staff",
             "name": "Сотрудник", "role": "staff", "status": "active", "pointIds": ["pt_nan_1"]}
        ] if owner else [],
        "catalog": [
            {"id": "vr_t_heart", "type": "treat", "name": "Сердце", "unit": "г", "active": True},
        ],
        "canPickInspectLoca": False,
        "partnerOverride": "owner_cabinet_all_points" if owner else "",
    }


def start_server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/app.html"


def attach_mocks(page, tid: str, username: str, owner: bool):
    me = mock_me(tid, username, owner)

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
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        attach_mocks(page, "827494606", "one_more_person_228", True)
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(900)
        page.click("[data-nav='cabinet']")
        page.wait_for_selector("#screenCabinet.on")
        page.wait_for_timeout(300)
        info = page.inner_html("#accessInfo")
        if "Режим владельца" not in info:
            fail("helper cabinet missing owner mode: " + info)
        if "Varka" not in info and "Репина" not in info:
            fail("helper cabinet missing Varka: " + info)
        if "Fundog" not in info or "nan_animal_clinic" not in info:
            fail("helper cabinet missing other points: " + info)
        grant = page.evaluate("() => getComputedStyle(document.getElementById('grantStaffCard')).display")
        if grant == "none":
            fail("helper owner must see grant card")
        if "Выдать доступ" not in page.inner_html("#grantStaffCard"):
            fail("grant button missing")
        chip = page.evaluate("() => getComputedStyle(document.getElementById('inspectLocaChip')).display")
        card = page.evaluate("() => getComputedStyle(document.getElementById('inspectLocaCard')).display")
        if chip != "none" or card != "none":
            fail("helper owner must not see inspect loca picker")
        page.screenshot(path=str(ART / "helper-owner-cabinet.png"), full_page=True)
        ctx.close()

        ctx2 = browser.new_context(viewport={"width": 390, "height": 844})
        page2 = ctx2.new_page()
        attach_mocks(page2, "650923866", "arseniyhotko", True)
        page2.goto(url, wait_until="domcontentloaded")
        page2.wait_for_timeout(900)
        page2.click("[data-nav='cabinet']")
        page2.wait_for_selector("#screenCabinet.on")
        info2 = page2.inner_html("#accessInfo")
        if "Режим владельца" in info2:
            fail("Arseniy must not see owner cabinet")
        grant2 = page2.evaluate("() => getComputedStyle(document.getElementById('grantStaffCard')).display")
        if grant2 != "none":
            fail("Arseniy must not see grant card")
        page2.screenshot(path=str(ART / "arseniy-owner-cabinet.png"), full_page=True)
        ctx2.close()

        ctx3 = browser.new_context(viewport={"width": 390, "height": 844})
        page3 = ctx3.new_page()
        attach_mocks(page3, "111", "clinic_staff", False)
        page3.goto(url, wait_until="domcontentloaded")
        page3.wait_for_timeout(1200)
        page3.click("[data-nav='cabinet']")
        page3.wait_for_selector("#screenCabinet.on")
        info3 = page3.inner_html("#accessInfo")
        if "Режим владельца" in info3:
            fail("staff must not see owner mode")
        grant3 = page3.evaluate("() => getComputedStyle(document.getElementById('grantStaffCard')).display")
        if grant3 != "none":
            fail("staff must not see grant card")
        page3.screenshot(path=str(ART / "staff-no-owner-cabinet.png"), full_page=True)
        ctx3.close()
        browser.close()
    httpd.shutdown()
    print("OK: helper owner cabinet UI")
    print("  helper 827494606: owner mode + Varka + grant")
    print("  Arseniy 650923866: not canon owner")
    print("  staff 111: no owner UI")


if __name__ == "__main__":
    run()
