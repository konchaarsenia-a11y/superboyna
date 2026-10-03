#!/usr/bin/env python3
"""Аудит: запись сразу видна в месяце, без перезагрузки мини-аппа."""
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path("/workspace/boinya-c")
PORT = 8943
SHOT = Path("/opt/cursor/artifacts/11-month-fresh.png")


def wait_http():
    import urllib.request
    for _ in range(40):
        try:
            urllib.request.urlopen("http://127.0.0.1:%s/next/week.js" % PORT, timeout=1)
            return
        except Exception:
            time.sleep(0.15)
    raise SystemExit("server")


def main():
    SHOT.parent.mkdir(parents=True, exist_ok=True)
    server = subprocess.Popen(
        ["python3", "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        wait_http()
        html = """<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="http://127.0.0.1:%(port)s/ds.css">
<link rel="stylesheet" href="http://127.0.0.1:%(port)s/next/app.css">
<link rel="stylesheet" href="http://127.0.0.1:%(port)s/next/theme.css">
<style>body{margin:0;background:#0a0a0a} #nxMain{padding:12px 12px 24px}</style>
</head><body>
<div id="nxMain"></div><div id="nxDock"></div>
<script>
window.__nxWeekVisible = function () { return true; };
window.__paints = [];
window.__loads = [];
window.__bust = 0;
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
window.BoinyaShell = {
  esc: esc,
  main: function (html) {
    window.__paints.push(html);
    document.getElementById("nxMain").innerHTML = html;
  },
  dock: function () {},
  toast: function () {},
  empty: function (o) { return "<p>" + esc(o.title) + "</p>"; },
  skeleton: function () { return '<p class="b-skel">Считаю месяц</p>'; },
  errorBox: function (o) { return "<p>" + esc(o.title) + "</p>"; },
  closeAll: function () {}
};
window.BoinyaApi = {
  telegramUser: function () { return { id: 1 }; },
  bustMem: function () { window.__bust += 1; },
  apiGet: function (params) {
    params = params || {};
    window.__loads.push(String(params.action || "") + (params.force ? ":force" : ""));
    var month = "2026-10";
    if (params.action === "getMonthOverview") {
      var res = { status: "success", month: month, days: [{ dateIso: "2026-10-03", count: 1, segments: { "ПП": 1 } }] };
      if (String(params.force || "") === "1") return new Promise(function (ok) { setTimeout(function () { ok(res); }, 300); });
      return Promise.resolve(res);
    }
    if (params.action === "getCalendarMonthPeople") {
      var pack = { status: "success", month: month, source: "d1", total: 1, byDate: { "2026-10-03": [{ name: "Мира", matchKey: "MIRA", segment: "ПП" }] } };
      return new Promise(function (ok) { setTimeout(function () { ok(pack); }, params.force ? 320 : 20); });
    }
    if (params.action === "getWeekDayCounts") return Promise.resolve({ status: "success", items: [] });
    if (params.action === "getWeekBannerState") return Promise.resolve({ status: "success", finished: false, pulled: true });
    return Promise.resolve({ status: "success" });
  }
};
</script>
<script src="http://127.0.0.1:%(port)s/next/week-logic.js"></script>
<script src="http://127.0.0.1:%(port)s/next/week.js"></script>
</body></html>
""" % {"port": PORT}
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.set_content(html, wait_until="load")
            page.wait_for_function("() => !!(window.BoinyaWeek && window.BoinyaWeek.show)")
            page.evaluate("() => window.BoinyaWeek.show('month', 'owner')")
            page.wait_for_selector("#nxCalGrid")
            page.wait_for_function("() => document.body.innerText.indexOf('Мира') >= 0")
            paints_before = page.evaluate("() => window.__paints.length")
            page.evaluate(
                """() => {
                  var node = document.querySelector('[data-date="2026-10-03"]');
                  window.BoinyaWeek.onAct('wcal', node);
                  window.__mark = 1;
                  window.BoinyaWeek.noteMonth({
                    op: 'save',
                    date: '2026-10-03',
                    client: { name: 'zzz_test', matchKey: 'zzz_test', orderType: 'pp', segment: 'ПП' }
                  });
                }"""
            )
            page.wait_for_function("() => document.body.innerText.indexOf('zzz_test') >= 0")
            immediate = page.evaluate(
                """() => {
                  var cell = document.querySelector('[data-date="2026-10-03"]');
                  var count = cell ? (cell.querySelector('.cell-count') || {}).textContent : '';
                  return {
                    count: count,
                    name: document.body.innerText.indexOf('zzz_test') >= 0,
                    skel: !!document.querySelector('.b-skel'),
                    paints: window.__paints.length,
                    bust: window.__bust,
                    loads: window.__loads.slice(),
                    mark: window.__mark
                  };
                }"""
            )
            if paints_before != immediate["paints"]:
                raise SystemExit("full paint after save: %s -> %s" % (paints_before, immediate["paints"]))
            if immediate["count"] != "2":
                raise SystemExit("count %r" % immediate)
            if not immediate["name"] or immediate["skel"] or not immediate["bust"]:
                raise SystemExit("fresh %r" % immediate)
            if not any(x.startswith("getMonthOverview:force") for x in immediate["loads"]):
                raise SystemExit("no force refetch %r" % immediate["loads"])
            page.wait_for_timeout(700)
            after = page.evaluate(
                """() => {
                  var cell = document.querySelector('[data-date="2026-10-03"]');
                  return {
                    count: cell ? (cell.querySelector('.cell-count') || {}).textContent : '',
                    name: document.body.innerText.indexOf('zzz_test') >= 0,
                    mira: document.body.innerText.indexOf('Мира') >= 0,
                    skel: !!document.querySelector('.b-skel'),
                    mark: window.__mark
                  };
                }"""
            )
            if after["count"] != "2" or not after["name"] or not after["mira"] or after["skel"] or after["mark"] != 1:
                raise SystemExit("stale refetch wiped the row %r" % after)
            page.screenshot(path=str(SHOT), full_page=False)
            browser.close()
            print("ok", SHOT, immediate["count"], "bust", immediate["bust"])
    finally:
        server.terminate()
        try:
            server.wait(timeout=3)
        except Exception:
            server.kill()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAIL", e, file=sys.stderr)
        sys.exit(1)
