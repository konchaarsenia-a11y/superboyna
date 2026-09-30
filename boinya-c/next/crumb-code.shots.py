#!/usr/bin/env python3
"""Скриншоты крошки 390×844, темы A/B. PHASE=before|after."""
import os
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

PHASE = "before" if os.environ.get("PHASE") == "before" else "after"
ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / "next" / "audit" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
PORT = 8827

HOOK = r"""
window.__nxCalls = [];
window.Telegram = window.Telegram || {};
var scheme = "dark";
try { scheme = new URLSearchParams(location.search).get("scheme") || "dark"; } catch (e) {}
var wa = {
  initData: "shot",
  initDataUnsafe: { user: { id: 650923866, first_name: "Арс" } },
  colorScheme: scheme,
  themeParams: {},
  viewportStableHeight: 844,
  ready: function () {},
  expand: function () {},
  disableVerticalSwipes: function () {},
  onEvent: function () {},
  HapticFeedback: { impactOccurred: function () {} }
};
Object.defineProperty(window.Telegram, "WebApp", {
  configurable: true,
  get: function () { return wa; },
  set: function (v) {
    if (!v || v === wa) return;
    v.colorScheme = scheme;
    if (!v.ready) v.ready = function () {};
    if (!v.expand) v.expand = function () {};
    if (!v.disableVerticalSwipes) v.disableVerticalSwipes = function () {};
    if (!v.initDataUnsafe || !v.initDataUnsafe.user) v.initDataUnsafe = { user: { id: 650923866, first_name: "Арс" } };
    wa = v;
  }
});
function standBasket() {
  return [
    { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", value: 200, val: 200, unit: "г" },
    { cat: "dressura", main: "СЕРДЦЕ", name: "СЕРДЦЕ", sub: "Полоски", value: 80, val: 80, unit: "г" },
    { cat: "crumb", main: "КРОШКА", name: "КРОШКА", crumbKind: "meat", value: 100, val: 100, unit: "г", ratio: [100],
      sources: [{ cat: "dressura", name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", val: 100, value: 100 }] },
    { cat: "crumb", main: "КРОШКА", name: "КРОШКА", crumbKind: "meat", value: 100, val: 100, unit: "г", ratio: [50, 25, 25],
      sources: [
        { cat: "dressura", name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", val: 50, value: 50 },
        { cat: "dressura", name: "СЕРДЦЕ", main: "СЕРДЦЕ", val: 25, value: 25 },
        { cat: "dressura", name: "ПОЧКИ", main: "ПОЧКИ", val: 25, value: 25 }
      ] },
    { cat: "chew", main: "ТРАХЕЯ", name: "ТРАХЕЯ", sub: "МАЛ", value: 1, val: 1, unit: "шт" },
    { cat: "chew", main: "УХО Г", name: "УХО Г", sub: "Обычное", value: 1, val: 1, unit: "шт" }
  ];
}
window.__NEXT_API_HOOK__ = function (params) {
  var a = String((params && params.action) || "");
  window.__nxCalls.push(a);
  if (a === "getMyAccess") return { status: "success", role: "owner", name: "Арс", telegramId: "650923866" };
  if (a === "getWeekDayCounts") {
    return { status: "success", items: ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье","Будущая неделя"].map(function (day) {
      return { day: day, count: 3, date: "30.09.2026" };
    }) };
  }
  if (a === "getWeekBannerState") return { status: "success", finished: false, pulled: true };
  if (a === "getAssembly" || a === "getCourier") {
    return { status: "success", day: "Среда", date: "30.09.2026", dateIso: "2026-09-30", clients: [{
      name: "Рекс · mira_lab",
      segment: "ПП",
      address: "ул. Кальварийская, 21",
      phone: "+375291112233",
      orderPrice: 48,
      assembled: false,
      delivered: false,
      printed: false,
      basket: standBasket()
    }] };
  }
  if (a === "getCutting") return { status: "success", day: "Среда", rows: [], items: [] };
  if (a === "listWarehouses") return { status: "success", warehouses: [{ id: "w1", name: "Склад", address: "Белецкого 10к2", departure: true }] };
  if (a === "getRetailPriceList") return { status: "success", items: [], delivery: { fee: 9, freeFrom: 80 } };
  return { status: "success", clients: [], items: [], rows: [], people: [], partners: [], subscriptions: [], warehouses: [] };
};
"""

FILL = r"""
(function () {
  var ord = window.BoinyaOrders;
  var st = ord.blank();
  st.orderType = "pp";
  st.client = "mira_lab";
  st.dogNames = { 1: "Рекс", 2: "" };
  st.day = "Среда";
  st.deliveryDate = "2026-09-30";
  st.address = "ул. Кальварийская, 21";
  st.priceInput = "48";
  st.baskets = { 1: window.__standBasket ? window.__standBasket() : [], 2: [] };
  ord.setState(st);
  ord.paint();
})();
"""


def wait_server():
    import urllib.request
    for _ in range(40):
        try:
            urllib.request.urlopen("http://127.0.0.1:%d/next.html" % PORT, timeout=1)
            return
        except Exception:
            time.sleep(0.15)
    raise SystemExit("server")


def shot(page, name):
    page.screenshot(path=str(SHOTS / name), full_page=False)
    print(name)


def main():
    server = subprocess.Popen(
        ["python3", "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        wait_server()
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path="/usr/local/bin/google-chrome")
            for scheme, letter in (("dark", "a"), ("light", "b")):
                ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1)
                page = ctx.new_page()
                page.add_init_script(HOOK)
                page.goto("http://127.0.0.1:%d/next.html?cutover=1&scheme=%s" % (PORT, scheme), wait_until="domcontentloaded")
                page.wait_for_selector("#nxMain", timeout=15000)
                page.wait_for_timeout(600)
                page.evaluate(
                    """() => {
                      window.__standBasket = function () {
                        return [
                          { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", value: 200, val: 200, unit: "г" },
                          { cat: "dressura", main: "СЕРДЦЕ", name: "СЕРДЦЕ", sub: "Полоски", value: 80, val: 80, unit: "г" },
                          { cat: "crumb", main: "КРОШКА", name: "КРОШКА", crumbKind: "meat", value: 100, val: 100, unit: "г", ratio: [100],
                            sources: [{ cat: "dressura", name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", val: 100, value: 100 }] },
                          { cat: "crumb", main: "КРОШКА", name: "КРОШКА", crumbKind: "meat", value: 100, val: 100, unit: "г", ratio: [50, 25, 25],
                            sources: [
                              { cat: "dressura", name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", val: 50, value: 50 },
                              { cat: "dressura", name: "СЕРДЦЕ", main: "СЕРДЦЕ", val: 25, value: 25 },
                              { cat: "dressura", name: "ПОЧКИ", main: "ПОЧКИ", val: 25, value: 25 }
                            ] },
                          { cat: "chew", main: "ТРАХЕЯ", name: "ТРАХЕЯ", sub: "МАЛ", value: 1, val: 1, unit: "шт" },
                          { cat: "chew", main: "УХО Г", name: "УХО Г", sub: "Обычное", value: 1, val: 1, unit: "шт" }
                        ];
                      };
                    }"""
                )
                page.evaluate(FILL)
                page.wait_for_timeout(200)
                page.evaluate("() => { var n = document.getElementById('nxLines'); if (n) n.scrollIntoView({ block: 'start' }); }")
                page.wait_for_timeout(150)
                shot(page, "crumb-code-order-%s-%s.png" % (PHASE, letter))

                page.evaluate("() => { document.querySelector('#nxNav [data-tab=production]').click(); }")
                page.wait_for_timeout(400)
                page.evaluate("() => { var b = document.querySelector('[data-act=pseg][data-seg=pack]'); if (b) b.click(); }")
                page.wait_for_timeout(700)
                shot(page, "crumb-code-assembly-%s-%s.png" % (PHASE, letter))

                page.evaluate("() => { var b = document.querySelector('[data-act=pseg][data-seg=route]'); if (b) b.click(); }")
                page.wait_for_timeout(700)
                shot(page, "crumb-code-courier-%s-%s.png" % (PHASE, letter))

                page.evaluate(
                    """() => {
                      var list = window.__standBasket();
                      var msg = window.BoinyaPrice.composePpClientMessage(list, 2, "", 48, 40, "RAW26", { statedTouched: 1 });
                      window.BoinyaShell.openSheet({
                        title: "Сообщение клиенту",
                        html: '<article class="b-card" style="white-space:pre-wrap">' + window.BoinyaShell.esc(msg) + '</article>'
                      });
                    }"""
                )
                page.wait_for_timeout(300)
                shot(page, "crumb-code-offer-%s-%s.png" % (PHASE, letter))
                ctx.close()
            browser.close()
    finally:
        server.terminate()


if __name__ == "__main__":
    main()
