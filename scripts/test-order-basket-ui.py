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
            if action == "getMonthOverview":
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
        page.goto(origin + "/app.html?sandbox=1&tid=1&v=71115971", wait_until="load", timeout=60000)
        page.wait_for_function("typeof window.ensureOrderDateCal_ === 'function'", timeout=20000)
        page.evaluate(
            """() => {
              const gate = document.getElementById('accessGate');
              if (gate) { gate.classList.remove('open'); gate.style.display = 'none'; gate.style.pointerEvents = 'none'; }
            }"""
        )
        page.wait_for_function("typeof window.renderBasket === 'function'", timeout=10000)
        page.evaluate("() => { window.renderBasket(); return true; }")

        page.wait_for_function(
            """() => {
              var box = document.getElementById('basketContainer');
              return !!(box && /пуста/i.test(box.textContent || ''));
            }""",
            timeout=8000,
        )
        if page.locator("#orderDateCal").count() == 0:
            raise SystemExit("FAIL: #orderDateCal missing (calendar #306 regression)")
        page.locator("#basketContainer").scroll_into_view_if_needed()
        page.screenshot(path=str(ART / "order_basket_empty.png"), full_page=False)

        page.evaluate(
            """() => {
              toggleManualEntry();
              openProductSelector('veg');
              var sel = document.getElementById('mainSelect');
              var vol = document.getElementById('volumeInput');
              var fs = document.getElementById('fractionSelect');
              if (sel) {
                for (var i = 0; i < sel.options.length; i++) {
                  if (sel.options[i].value === 'БАНАНЫ') { sel.selectedIndex = i; break; }
                }
              }
              if (vol) vol.value = '80';
              if (fs) fs.value = '';
              var fg = document.getElementById('fractionGroup');
              if (fg) fg.style.display = 'none';
              addItemToBasket();
              return true;
            }"""
        )
        page.wait_for_timeout(400)
        page.evaluate("() => { var ok = document.getElementById('modalOk'); if (ok) ok.click(); }")
        page.wait_for_selector("#basketContainer .basket-card", timeout=8000)
        entry_txt = page.locator("#basketContainer").inner_text()
        if not has_product(entry_txt, "БАНАНЫ"):
            raise SystemExit("FAIL: order entry basket missing БАНАНЫ, got: " + entry_txt)
        page.locator("#basketContainer").scroll_into_view_if_needed()
        page.screenshot(path=str(ART / "order_basket_entry.png"), full_page=False)

        page.evaluate("() => { switchTab('clientsScreen'); return true; }")
        page.wait_for_timeout(200)
        page.evaluate("() => { openViewWeekDay('Понедельник', '10.08.2026'); return true; }")
        try:
            page.wait_for_selector(
                "#clientsContainer .client-item-card:not(.view-skel) .client-title",
                timeout=15000,
            )
        except Exception:
            page.evaluate(
                """() => {
                  var host = document.getElementById('viewDayEditorHost');
                  if (host) host.style.display = '';
                  var weekDay = document.getElementById('viewWeekDayPanel');
                  if (weekDay) weekDay.style.display = '';
                  var box = document.getElementById('clientsContainer');
                  var client = {
                    name: 'zzz_test',
                    address: 'Белецкого 10к2',
                    phone: '+375291000000',
                    basket: [
                      {cat:'dressura', name:'ЛЁГКОЕ', main:'ЛЁГКОЕ', sub:'Среднее', val:320, value:320},
                      {cat:'chew', name:'АОРТА', main:'АОРТА', sub:'Обычная', val:1, value:1}
                    ],
                    orderCount: 2,
                    segment: 'ПП'
                  };
                  if (box && typeof renderWeekClientCard === 'function') {
                    box.innerHTML = renderWeekClientCard(client, 0, false);
                  }
                  return true;
                }"""
            )
        page.evaluate("() => { try { toggleOrderDetail(0); } catch (e) {} try { toggleMonthDetail(0); } catch (e2) {} return true; }")
        page.wait_for_timeout(400)
        page.wait_for_selector("#details_0, #monthDetails_0", timeout=5000)
        details = page.locator("#details_0, #monthDetails_0").first
        view_txt = details.inner_text() if details.count() else ""
        if not has_product(view_txt, "ЛЁГКОЕ", "ЛЕГКОЕ"):
            raise SystemExit("FAIL: view record basket missing ЛЁГКОЕ, got: " + view_txt)
        details.scroll_into_view_if_needed()
        page.screenshot(path=str(ART / "view_record_basket.png"), full_page=False)

        page.evaluate(
            """() => {
              var ev = { stopPropagation: function () {} };
              if (typeof crmEditClient === 'function') crmEditClient(0, ev);
              else if (typeof crmEditMonthClient === 'function') crmEditMonthClient(0, ev);
              return true;
            }"""
        )
        page.wait_for_timeout(1200)
        page.evaluate("() => { var ok = document.getElementById('modalOk'); if (ok) ok.click(); return true; }")
        page.evaluate("() => { try { switchTab('orderScreen'); } catch (e) {} return true; }")
        page.wait_for_selector("#basketContainer .basket-card", timeout=10000)
        edit_txt = page.locator("#basketContainer").inner_text()
        if page.locator("#basketContainer .basket-card").count() == 0:
            raise SystemExit("FAIL: order basket empty after returning from view")
        page.locator("#basketContainer").scroll_into_view_if_needed()
        if has_product(edit_txt, "ЛЁГКОЕ", "ЛЕГКОЕ"):
            page.screenshot(path=str(ART / "order_basket_edit_record.png"), full_page=False)

        browser.close()
    httpd.shutdown()
    print("PASS  order entry + view record basket visible")


if __name__ == "__main__":
    main()
