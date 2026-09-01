#!/usr/bin/env python3
"""
Goodboy static site smoke tests (Playwright).

Usage:
  python3 scripts/goodboy-smoke.py
  python3 scripts/goodboy-smoke.py --screenshot-dir /tmp/gb-smoke
  python3 scripts/goodboy-smoke.py --base-url https://konchaarsenia-a11y.github.io/superboyna/goodboy

Starts a local http.server on goodboy/ when --base-url is omitted.
"""

from __future__ import annotations

import argparse
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]
GOODBOY_DIR = ROOT / "goodboy"
VIEWPORT = {"width": 390, "height": 844}


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_port(port: int, timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            time.sleep(0.25)
    return False


def start_server(port: int) -> subprocess.Popen:
    proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=str(GOODBOY_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if not wait_port(port):
        proc.kill()
        raise RuntimeError(f"goodboy http.server did not start on port {port}")
    return proc


def assert_true(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def check_subscription(page, base: str, errors: list[str], shot_dir: Path | None) -> None:
    url = f"{base}/subscription.html"
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(800)

    body = page.locator("body")
    assert_true("page-sub" in (body.get_attribute("class") or ""), "subscription: body.page-sub", errors)

    h1 = page.locator(".sub-hero h1").first
    assert_true(h1.count() > 0, "subscription: h1 present", errors)
    if h1.count():
        assert_true("подписк" in h1.inner_text().lower(), "subscription: h1 is Подписка", errors)

    trial_btn = page.locator('a[href*="trial.html"]')
    assert_true(trial_btn.count() > 0, "subscription: link to trial.html", errors)

    steps = page.locator(".sub-steps li")
    assert_true(steps.count() == 3, f"subscription: expected 3 steps, got {steps.count()}", errors)

    if shot_dir:
        page.screenshot(path=str(shot_dir / "subscription-390.png"), full_page=False)


def check_trial(page, base: str, errors: list[str], shot_dir: Path | None) -> None:
    url = f"{base}/trial.html"
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(800)

    title = page.locator(".sub-trial-title--center, .sub-trial-title")
    assert_true(title.count() > 0, "trial: title present", errors)
    if title.count():
        text = title.inner_text().lower()
        trial_ok = ("недел" in text) and ("бесплат" in text)
        assert_true(trial_ok, "trial: hero mentions free week", errors)

    steps = page.locator(".sub-steps li")
    assert_true(steps.count() == 3, f"trial: expected 3 steps, got {steps.count()}", errors)

    cta = page.locator("#subIgBtn.invite-btn, .sub-trial-cta").first
    assert_true(cta.count() > 0, "trial: CTA present", errors)
    if cta.count():
        href = cta.get_attribute("href") or ""
        assert_true("ig.me/m/goodboy_rb" in href, f"trial: IG href ok ({href[:80]})", errors)
        ig_js = page.locator('script[src*="trial-ig.js"]')
        assert_true(ig_js.count() > 0, "trial: trial-ig.js loaded (clipboard for iOS)", errors)
        box = cta.bounding_box()
        if box:
            assert_true(box["height"] >= 44, f"trial: CTA height {box['height']:.0f}px < 44", errors)

    if shot_dir:
        page.screenshot(path=str(shot_dir / "trial-390.png"), full_page=False)


def check_index(page, base: str, errors: list[str], shot_dir: Path | None) -> None:
    url = f"{base}/index.html" if base.endswith("/goodboy") else f"{base}/"
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(800)

    hero = page.locator(".promise-hero")
    assert_true(hero.count() > 0, "index: .promise-hero present", errors)

    tabs = page.locator(".nav-tabs a")
    assert_true(tabs.count() >= 4, f"index: nav tabs ({tabs.count()})", errors)

    sub_link = page.locator('.nav-tabs a[href*="subscription"]')
    assert_true(sub_link.count() > 0, "index: subscription tab link", errors)

    if shot_dir:
        page.screenshot(path=str(shot_dir / "index-390.png"), full_page=False)


CHECKS: list[tuple[str, Callable]] = [
    ("subscription.html", check_subscription),
    ("trial.html", check_trial),
    ("index.html", check_index),
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Goodboy static smoke tests")
    parser.add_argument(
        "--base-url",
        help="Base URL (e.g. https://…/goodboy). Omit to start local server.",
    )
    parser.add_argument("--port", type=int, default=0, help="Local server port (0 = auto)")
    parser.add_argument("--screenshot-dir", type=Path, help="Save 390px screenshots here")
    args = parser.parse_args()

    if not GOODBOY_DIR.is_dir():
        print(f"ERROR: missing {GOODBOY_DIR}", file=sys.stderr)
        return 1

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: pip install playwright && playwright install chromium", file=sys.stderr)
        return 1

    server: subprocess.Popen | None = None
    base_url = args.base_url

    if not base_url:
        port = args.port or find_free_port()
        server = start_server(port)
        base_url = f"http://127.0.0.1:{port}"
        print(f"local server: {base_url}")

    shot_dir = args.screenshot_dir
    if shot_dir:
        shot_dir.mkdir(parents=True, exist_ok=True)

    errors: list[str] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport=VIEWPORT)
        for name, fn in CHECKS:
            try:
                fn(page, base_url.rstrip("/"), errors, shot_dir)
                print(f"OK  {name}")
            except Exception as exc:  # noqa: BLE001 — smoke harness
                errors.append(f"{name}: {exc}")
                print(f"FAIL {name}: {exc}")
        browser.close()

    if server:
        server.terminate()
        server.wait(timeout=5)

    if errors:
        print("\nSmoke FAILED:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("\nSmoke passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
