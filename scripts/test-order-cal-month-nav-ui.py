#!/usr/bin/env python3
"""Playwright: client-entry month nav is Sep → Oct → Nov even if overview snap is stale."""
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
        month = (qs.get("month") or [""])[0]
        if req.method == "POST":
            try:
                body = req.post_data or ""
                if "action=" in body:
                    post_qs = parse_qs(body)
                    action = (post_qs.get("action") or [action])[0]
                    month = (post_qs.get("month") or [month])[0]
                elif body.strip().startswith("{"):
                    j = json.loads(body)
                    action = j.get("action") or action
                    month = j.get("month") or month
            except Exception:
                pass
        if "workers.dev" in url or "script.google.com" in url:
            if action == "getMonthOverview":
                # stale snap: always September — old UI skipped October; new UI still paints requested month
                json_ok(route, {"status": "success", "month": "2026-09", "days": [], "total": 0})
                return
            if action == "getMyAccess":
                json_ok(route, {"status": "success", "role": "all", "telegramId": "1", "name": "test"})
                return
            if action == "getWeekDayCounts":
                json_ok(route, {"status": "success", "items": [], "total": 0})
                return
            if action == "resolveDayForDate":
                json_ok(route, {"status": "success", "onWeek": False, "dayName": "", "calendarOnly": True})
                return
            json_ok(route, {"status": "success"})
            return
        route.continue_()

    page.route("**/*", handle_route)


def main():
    httpd, origin = start_server()
    titles = []
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
        page.goto(origin + "/app.html?sandbox=1&tid=1&v=71115971", wait_until="load", timeout=60000)
        page.wait_for_function("typeof window.ensureOrderDateCal_ === 'function'", timeout=20000)
        page.evaluate(
            """() => {
              const gate = document.getElementById('accessGate');
              if (gate) { gate.classList.remove('open'); gate.style.display = 'none'; gate.style.pointerEvents = 'none'; }
              const el = document.getElementById('deliveryDate');
              if (el) el.value = '2026-09-18';
            }"""
        )
        page.evaluate("() => window.ensureOrderDateCal_({ force: true })")
        page.wait_for_selector("#orderDateCal .ios-cal-title", timeout=15000)
        # force September start then walk › ›
        page.evaluate(
            """() => {
              const el = document.getElementById('deliveryDate');
              if (el) el.value = '2026-09-18';
              if (typeof window.shiftOrderCalMonth_ === 'function') {
                // reset pointer by picking Sep then we click DOM buttons
              }
            }"""
        )
        # If calendar already rendered a month, walk from whatever is shown.
        # Prefer setting via two evals: we click prev until September, then next twice.
        for _ in range(14):
            title = page.locator("#orderDateCal .ios-cal-title").inner_text().strip().lower()
            if "сентябрь" in title:
                break
            page.locator("#orderDateCal .ios-cal-nav-btn").first.click()
            page.wait_for_timeout(80)
        title_sep = page.locator("#orderDateCal .ios-cal-title").inner_text().strip()
        titles.append(title_sep)
        page.screenshot(path=str(ART / "order_cal_september.png"), full_page=False)
        page.locator("#orderDateCal .ios-cal-nav-btn").nth(1).click()
        page.wait_for_timeout(200)
        title_oct = page.locator("#orderDateCal .ios-cal-title").inner_text().strip()
        titles.append(title_oct)
        page.screenshot(path=str(ART / "order_cal_october.png"), full_page=False)
        page.locator("#orderDateCal .ios-cal-nav-btn").nth(1).click()
        page.wait_for_timeout(200)
        title_nov = page.locator("#orderDateCal .ios-cal-title").inner_text().strip()
        titles.append(title_nov)
        page.screenshot(path=str(ART / "order_cal_november.png"), full_page=False)
        browser.close()
    httpd.shutdown()
    print("TITLES", titles)
    joined = " | ".join(t.lower() for t in titles)
    if "октябрь" not in titles[1].lower():
        raise SystemExit("FAIL: expected October after September, got " + titles[1])
    if "ноябрь" not in titles[2].lower():
        raise SystemExit("FAIL: expected November after October, got " + titles[2])
    if "сентябрь" not in titles[0].lower():
        raise SystemExit("FAIL: expected to start at September, got " + titles[0])
    print("PASS  Sep → Oct → Nov", joined)


if __name__ == "__main__":
    main()
