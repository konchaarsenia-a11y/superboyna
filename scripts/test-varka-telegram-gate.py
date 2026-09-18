#!/usr/bin/env python3
"""Playwright: Varka Telegram gate — real WebApp sessions pass, external browser blocked."""
from __future__ import annotations

import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / "varka"
ART = Path("/opt/cursor/artifacts")
ART.mkdir(parents=True, exist_ok=True)

PT = {
    "id": "pt_nan_1",
    "networkId": "net_nan",
    "name": "nan_animal_clinic",
    "address": "ул. Янковского, 34",
}
ME = {
    "status": "success",
    "allowed": True,
    "role": "partner",
    "isPartner": True,
    "isOwner": False,
    "name": "NaN test",
    "username": "nan_tester",
    "telegramId": "900001",
    "networkId": "net_nan",
    "pointIds": [PT["id"]],
    "allowedPointIds": {PT["id"]: True},
    "points": [PT],
    "networks": [{"id": "net_nan", "name": "NaN clinic"}],
    "catalog": [
        {"id": "vr_t_heart", "type": "treat", "name": "Сердце", "unit": "г", "active": True},
    ],
}


def start_server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}"


def fail(msg: str):
    raise SystemExit("FAIL: " + msg)


def stub_network(page, me: dict):
    seen = {"getMe": []}

    def handle_route(route):
        req = route.request
        url = req.url
        if "telegram.org" in url:
            route.fulfill(
                status=200,
                content_type="application/javascript",
                body="window.Telegram=window.Telegram||{};",
            )
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
            seen["getMe"].append(
                {
                    "telegramId": str(post.get("telegramId") or ""),
                    "username": str(post.get("username") or ""),
                    "initData": str(post.get("initData") or ""),
                }
            )
            route.fulfill(status=200, content_type="application/json", body=json.dumps(me))
            return
        if action == "partnerListMyOrders":
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({"status": "success", "orders": []}),
            )
            return
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"status": "success"}))

    page.route("**/*", handle_route)
    return seen


TG_EMPTY = """
window.Telegram = { WebApp: {
  initDataUnsafe: {},
  initData: '',
  platform: 'unknown',
  ready: function(){}, expand: function(){},
  setHeaderColor: function(){}, setBackgroundColor: function(){},
  HapticFeedback: { impactOccurred: function(){}, notificationOccurred: function(){} }
}};
"""

TG_USER = """
window.Telegram = { WebApp: {
  initDataUnsafe: { user: { id: 900001, username: 'nan_tester', first_name: 'NaN' } },
  initData: 'user=%7B%22id%22%3A900001%2C%22username%22%3A%22nan_tester%22%7D',
  platform: 'tdesktop',
  ready: function(){}, expand: function(){},
  setHeaderColor: function(){}, setBackgroundColor: function(){},
  HapticFeedback: { impactOccurred: function(){}, notificationOccurred: function(){} }
}};
"""

TG_USERNAME_ONLY = """
window.Telegram = { WebApp: {
  initDataUnsafe: { user: { username: 'nan_tester', first_name: 'NaN' } },
  initData: 'user=%7B%22username%22%3A%22nan_tester%22%2C%22first_name%22%3A%22NaN%22%7D',
  platform: 'android',
  ready: function(){}, expand: function(){},
  setHeaderColor: function(){}, setBackgroundColor: function(){},
  HapticFeedback: { impactOccurred: function(){}, notificationOccurred: function(){} }
}};
"""

TG_DELAYED = """
window.Telegram = { WebApp: {
  initDataUnsafe: {},
  initData: '',
  platform: 'ios',
  ready: function(){}, expand: function(){},
  setHeaderColor: function(){}, setBackgroundColor: function(){},
  HapticFeedback: { impactOccurred: function(){}, notificationOccurred: function(){} }
}};
setTimeout(function () {
  window.Telegram.WebApp.initDataUnsafe = { user: { id: 900001, username: 'nan_tester', first_name: 'NaN' } };
  window.Telegram.WebApp.initData = 'user=%7B%22id%22%3A900001%2C%22username%22%3A%22nan_tester%22%7D';
}, 400);
"""


def run():
    httpd, origin = start_server()
    user_obj = {"id": 900001, "username": "nan_tester", "first_name": "NaN"}
    hash_q = (
        "#tgWebAppData="
        + quote("user=" + quote(json.dumps(user_obj, separators=(",", ":"))) + "&auth_date=1&hash=abc")
        + "&tgWebAppPlatform=tdesktop&tgWebAppVersion=8.0"
    )

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # 1) External browser — gate stays.
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        stub_network(page, ME)
        page.add_init_script(TG_EMPTY)
        page.goto(origin + "/app.html", wait_until="domcontentloaded")
        page.wait_for_selector("#screenLogin.on", timeout=8000)
        hint = page.inner_text("#loginTgHint")
        if "Откройте мини-апп из Telegram" not in hint:
            fail("external browser must keep Telegram gate, got: " + hint)
        if page.locator("#screenOrder.on").count():
            fail("external browser must not enter order")
        page.screenshot(path=str(ART / "varka-tg-gate-external.png"), full_page=True)
        ctx.close()

        # 2) Hash-only (index redirect used to strip this) — must enter.
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        seen_hash = stub_network(page, ME)
        page.add_init_script(TG_EMPTY)
        page.goto(origin + "/" + hash_q, wait_until="domcontentloaded")
        page.wait_for_selector("#screenOrder.on", timeout=8000)
        if not seen_hash["getMe"]:
            fail("hash session must call partnerGetMe")
        last = seen_hash["getMe"][0]
        if last["telegramId"] != "900001" and "900001" not in last["initData"]:
            fail("hash session must send telegramId or initData, got " + json.dumps(last))
        if "Откройте мини-апп из Telegram" in page.inner_text("body"):
            fail("hash session still shows Telegram gate")
        page.screenshot(path=str(ART / "varka-tg-gate-hash.png"), full_page=True)
        ctx.close()

        # 3) Delayed WebApp user (race) — must enter, not gate.
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        stub_network(page, ME)
        page.add_init_script(TG_DELAYED)
        page.goto(origin + "/app.html", wait_until="domcontentloaded")
        page.wait_for_selector("#screenOrder.on", timeout=8000)
        if page.locator("#screenLogin.on").count():
            fail("delayed WebApp still gated: " + page.inner_text("#loginTgHint"))
        page.screenshot(path=str(ART / "varka-tg-gate-delayed.png"), full_page=True)
        ctx.close()

        # 4) Username-only first login — partnerGetMe, not telegramId gate.
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        seen_user = stub_network(page, ME)
        page.add_init_script(TG_USERNAME_ONLY)
        page.goto(origin + "/app.html", wait_until="domcontentloaded")
        page.wait_for_selector("#screenOrder.on", timeout=8000)
        if not seen_user["getMe"]:
            fail("username-only must call partnerGetMe")
        if seen_user["getMe"][0]["username"] != "nan_tester":
            fail("username-only must send username, got " + json.dumps(seen_user["getMe"][0]))
        page.screenshot(path=str(ART / "varka-tg-gate-username.png"), full_page=True)
        ctx.close()

        # 5) Immediate WebApp (control) still works.
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        stub_network(page, ME)
        page.add_init_script(TG_USER)
        page.goto(origin + "/app.html", wait_until="domcontentloaded")
        page.wait_for_selector("#screenOrder.on", timeout=8000)
        page.screenshot(path=str(ART / "varka-tg-gate-webapp.png"), full_page=True)
        ctx.close()

        browser.close()
    httpd.shutdown()
    print("OK: varka telegram gate UI")
    print("  external blocked; hash/delay/username/webapp enter catalog")


if __name__ == "__main__":
    run()
