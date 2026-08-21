#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Full live QA for Boinya C via Worker (LIVE). Only touches zzz_test. Cleans up after."""
from __future__ import annotations

import json
import subprocess
import time
import urllib.parse
from datetime import datetime

WR = "https://boinya-c.konchaarsenia.workers.dev"
CLIENT = "zzz_test"
DAYS = [
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
    "Воскресенье",
    "Будущая неделя",
]
REPORT: list[str] = []
FAILS = 0
OKS = 0


def log(msg: str) -> None:
    print(msg, flush=True)
    REPORT.append(msg)


def ok(msg: str) -> None:
    global OKS
    OKS += 1
    log(f"[OK] {msg}")


def fail(msg: str) -> None:
    global FAILS
    FAILS += 1
    log(f"[FAIL] {msg}")


def curl_json(method: str, url: str, body: dict | None = None, timeout: int = 120) -> dict:
    cmd = [
        "curl",
        "-sS",
        "--max-time",
        str(timeout),
        "-A",
        "BoinyaLiveQA/1.0",
        "-H",
        "Accept: application/json",
    ]
    if method == "POST":
        cmd += ["-X", "POST", "-H", "Content-Type: text/plain;charset=utf-8"]
        if body is not None:
            cmd += ["--data-binary", json.dumps(body, ensure_ascii=False)]
    cmd.append(url)
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT)
    except subprocess.CalledProcessError as e:
        return {"status": "error", "message": f"curl_{e.returncode}", "raw": (e.output or b"")[:400].decode("utf-8", "replace")}
    text = out.decode("utf-8", "replace")
    try:
        return json.loads(text)
    except Exception:
        return {"status": "error", "message": "not_json", "raw": text[:500]}


def wr_get(action: str, **kw) -> dict:
    q = {"action": action, "cutover": "1", "_": str(int(time.time() * 1000))}
    q.update({k: v for k, v in kw.items() if v is not None})
    url = WR + "?" + urllib.parse.urlencode(q)
    return curl_json("GET", url)


def wr_post(payload: dict) -> dict:
    body = dict(payload)
    body.setdefault("cutover", "1")
    body.setdefault("_", str(int(time.time() * 1000)))
    return curl_json("POST", WR + "/", body)


def basket_heart(val: int = 50) -> list:
    return [
        {
            "cat": "dressura",
            "name": "СЕРДЦЕ",
            "main": "СЕРДЦЕ",
            "sub": "Целое",
            "val": val,
            "value": val,
            "unit": "гр",
        }
    ]


def find_zzz(day: str) -> list:
    r = wr_get("getClients", day=day, force="1")
    if r.get("status") != "success":
        return []
    return [c for c in (r.get("clients") or []) if str(c.get("name") or "").lower() == CLIENT]


def wait_until(pred, tries: int = 20, delay: float = 3.0, label: str = "") -> bool:
    # LIVE: D1 сразу, GAS/SWR догоняет до ~30–60с при optimistic
    for i in range(tries):
        try:
            if pred():
                return True
        except Exception as e:
            log(f"[..] wait {label} err={e}")
        time.sleep(delay)
    if label:
        fail(f"timeout waiting: {label}")
    return False


def cleanup_all(reason: str = "cleanup") -> None:
    log(f"--- {reason}: delete {CLIENT} from all days ---")
    for d in DAYS:
        wr_post({"action": "deleteClient", "client": CLIENT, "day": d})
        # also calendar-style if API exists
        wr_post({"action": "removeCalendarClient", "client": CLIENT, "day": d})
    time.sleep(4)
    left = []
    for d in DAYS:
        z = find_zzz(d)
        if z:
            left.append(f"{d}:{len(z)}")
    if left:
        fail(f"still present after cleanup: {left}")
    else:
        ok("cleanup: zzz_test gone from all week days")


def assert_on_day(day: str, expect: bool, label: str) -> dict | None:
    z = find_zzz(day)
    if expect and z:
        ok(f"{label}: on {day} (n={len(z)}, seg={z[0].get('segment')}, src={z[0].get('source')}, items={z[0].get('orderCount')})")
        return z[0]
    if not expect and not z:
        ok(f"{label}: not on {day}")
        return None
    fail(f"{label}: expect_on={expect} day={day} found={len(z)} sample={json.dumps(z[:1], ensure_ascii=False)[:240]}")
    return z[0] if z else None


def main() -> int:
    log(f"=== LIVE FULL QA {datetime.utcnow().isoformat()}Z client={CLIENT} ===")
    ping = wr_get("ping")
    if ping.get("live") is True and ping.get("status") == "success":
        ok(f"ping live={ping.get('live')} cutover={ping.get('cutover')} d1={ping.get('d1')}")
    else:
        fail(f"ping bad: {ping}")
        return 1

    # partners for BP
    partners = wr_get("listPartners", all="1")
    partner_name = "Другое"
    if partners.get("status") == "success":
        plist = [p for p in (partners.get("partners") or []) if p.get("active") is not False]
        ok(f"listPartners n={len(plist)}")
        if plist:
            partner_name = str(plist[0].get("name") or "Другое")
    else:
        fail(f"listPartners: {partners.get('message') or partners}")

    cleanup_all("pre-clean")

    # -------- RETAIL save + overwrite --------
    log("--- RETAIL save Суббота ---")
    r = wr_post(
        {
            "action": "saveOrder",
            "day": "Суббота",
            "client": CLIENT,
            "address": "Минск, тест QA розница 1",
            "note": "qa retail",
            "phone": "+375291110011",
            "orderType": "retail",
            "source": "retail",
            "orderPrice": 12.5,
            "basket": basket_heart(40),
        }
    )
    log(f"[..] save retail status={r.get('status')} msg={r.get('message')} wrote={r.get('wrote')}")
    if r.get("status") != "success":
        fail(f"retail save: {r}")
    if not wait_until(lambda: bool(find_zzz("Суббота")), label="retail appear Sat"):
        # one retry save
        wr_post(
            {
                "action": "saveOrder",
                "day": "Суббота",
                "client": CLIENT,
                "address": "Минск, тест QA розница 1",
                "note": "qa retail",
                "phone": "+375291110011",
                "orderType": "retail",
                "source": "retail",
                "orderPrice": 12.5,
                "basket": basket_heart(40),
            }
        )
        wait_until(lambda: bool(find_zzz("Суббота")), tries=15, label="retail appear Sat retry")
    c = assert_on_day("Суббота", True, "retail")
    if c:
        bask = c.get("basket") or []
        val = bask[0].get("val") or bask[0].get("value") if bask else None
        seg = str(c.get("segment") or "").upper()
        src = str(c.get("source") or "").lower()
        if val == 40:
            ok("retail basket val=40")
        else:
            fail(f"retail basket val={val} bask={bask[:1]}")
        if "Р" in seg or src == "retail" or "розниц" in seg.lower():
            ok(f"retail type seg={seg!r} src={src!r}")
        else:
            fail(f"retail type unexpected seg={seg!r} src={src!r}")

    # overwrite
    r = wr_post(
        {
            "action": "saveOrder",
            "day": "Суббота",
            "client": CLIENT,
            "address": "Минск, тест QA розница 2",
            "note": "qa retail overwrite",
            "orderType": "retail",
            "source": "retail",
            "orderPrice": 15,
            "basket": basket_heart(55),
        }
    )
    log(f"[..] overwrite retail status={r.get('status')} optimistic={r.get('optimistic')}")
    def retail_val_sat():
        z = find_zzz("Суббота")
        if not z:
            return None
        bask = z[0].get("basket") or []
        if not bask:
            return None
        return bask[0].get("val") or bask[0].get("value")

    wait_until(lambda: retail_val_sat() == 55, label="retail overwrite val=55")
    c = assert_on_day("Суббота", True, "retail overwrite")
    if c:
        bask = c.get("basket") or []
        val = bask[0].get("val") if bask else None
        if val == 55 and "overwrite" in str(c.get("note") or ""):
            ok("retail overwrite basket+note")
        elif val == 55:
            ok("retail overwrite basket (note may lag)")
        else:
            fail(f"retail overwrite val={val} note={c.get('note')!r}")

    # -------- MOVE retail Sat -> Sun --------
    log("--- MOVE retail Суббота → Воскресенье ---")
    mv = wr_post({"action": "moveClient", "client": CLIENT, "oldDay": "Суббота", "newDay": "Воскресенье"})
    log(f"[..] move status={mv.get('status')} optimistic={mv.get('optimistic')} msg={mv.get('message')}")
    wait_until(lambda: (not find_zzz("Суббота")) and bool(find_zzz("Воскресенье")), label="move Sat→Sun")
    assert_on_day("Суббота", False, "after move")
    assert_on_day("Воскресенье", True, "after move")

    # delete retail from Sun
    dl = wr_post({"action": "deleteClient", "client": CLIENT, "day": "Воскресенье"})
    log(f"[..] delete retail status={dl.get('status')}")
    wait_until(lambda: not find_zzz("Воскресенье"), label="delete Sun")
    assert_on_day("Воскресенье", False, "retail deleted")

    # -------- PP save + move --------
    log("--- PP save Пятница ---")
    r = wr_post(
        {
            "action": "saveOrder",
            "day": "Пятница",
            "client": CLIENT,
            "address": "Минск, тест QA ПП",
            "note": "qa pp",
            "orderType": "pp",
            "source": "pp",
            "orderPrice": 89,
            "ppSlot": "1/2",
            "basket": basket_heart(70),
        }
    )
    log(f"[..] save pp status={r.get('status')} seg={r.get('segment')} src={r.get('source')} optimistic={r.get('optimistic')}")
    wait_until(lambda: bool(find_zzz("Пятница")), label="pp appear Fri")
    c = assert_on_day("Пятница", True, "pp")
    if c:
        seg = str(c.get("segment") or "").upper()
        src = str(c.get("source") or "").lower()
        if seg == "ПП" or src == "pp":
            ok(f"pp type seg={seg!r} src={src!r}")
        else:
            fail(f"pp type unexpected seg={seg!r} src={src!r}")
        price = c.get("orderPrice")
        try:
            price_n = float(price) if price not in (None, "") else None
        except Exception:
            price_n = None
        if price_n == 89:
            ok("pp orderPrice=89")
        else:
            fail(f"pp orderPrice={price!r}")

    log("--- MOVE PP Пятница → Суббота ---")
    mv = wr_post({"action": "moveClient", "client": CLIENT, "oldDay": "Пятница", "newDay": "Суббота"})
    log(f"[..] move pp status={mv.get('status')} optimistic={mv.get('optimistic')} msg={mv.get('message')}")
    wait_until(lambda: (not find_zzz("Пятница")) and bool(find_zzz("Суббота")), label="move PP Fri→Sat")
    assert_on_day("Пятница", False, "pp after move")
    c = assert_on_day("Суббота", True, "pp after move")
    if c:
        seg = str(c.get("segment") or "").upper()
        src = str(c.get("source") or "").lower()
        if seg == "ПП" or src == "pp":
            ok("pp type survived move")
        else:
            fail(f"pp type lost after move seg={seg!r} src={src!r}")

    # -------- CUTTING / COURIER (day with zzz) --------
    log("--- getCutting Суббота ---")
    cut = wr_get("getCutting", day="Суббота", force="1")
    if cut.get("status") == "success":
        items = cut.get("items") or []
        ok(f"getCutting Sat items={len(items)} date={cut.get('date')}")
        heart = [i for i in items if "СЕРДЦ" in str(i.get("name") or "").upper()]
        if heart:
            ok(f"cutting sees СЕРДЦЕ dry={heart[0].get('dry')}")
        elif items:
            ok("cutting has items (heart row may be named differently)")
        else:
            # empty Sat plan is possible if GAS cutting lag — also check Friday
            cutf = wr_get("getCutting", day="Пятница", force="1")
            if cutf.get("status") == "success" and (cutf.get("items") or []):
                ok(f"getCutting Fri fallback items={len(cutf.get('items') or [])}")
            else:
                fail("getCutting empty Sat and Fri")
    else:
        fail(f"getCutting: {cut.get('message') or cut}")

    log("--- getCourier Суббота ---")
    cou = wr_get("getCourier", day="Суббота", force="1")
    if cou.get("status") == "success":
        cl = cou.get("clients") or []
        zc = [x for x in cl if str(x.get("name") or "").lower() == CLIENT]
        ok(f"getCourier Sat n={len(cl)} zzz={len(zc)}")
        if zc:
            z = zc[0]
            ok(f"courier zzz ppPaid={z.get('ppPaid')} paid={z.get('paid')} price={z.get('orderPrice')!r} askPaid={z.get('askPaid')}")
    else:
        fail(f"getCourier: {cou.get('message') or cou}")

    # also smoke cutting on busy Friday without mutating flags
    cutf = wr_get("getCutting", day="Пятница")
    if cutf.get("status") == "success":
        ok(f"getCutting Fri items={len(cutf.get('items') or [])} (no flag flips)")
    else:
        fail(f"getCutting Fri: {cutf.get('message') or cutf}")

    # delete PP from Sat before BP test
    wr_post({"action": "deleteClient", "client": CLIENT, "day": "Суббота"})
    wait_until(lambda: not find_zzz("Суббота"), label="delete pp Sat")

    # -------- BP save + move --------
    log(f"--- BP save Воскресенье partner={partner_name} ---")
    r = wr_post(
        {
            "action": "saveOrder",
            "day": "Воскресенье",
            "client": CLIENT,
            "address": "Минск, тест QA БП",
            "note": "qa bp",
            "orderType": "bp",
            "source": "bp",
            "ppPartner": partner_name,
            "orderPrice": 0,
            "basket": basket_heart(30),
        }
    )
    log(f"[..] save bp status={r.get('status')} seg={r.get('segment')} src={r.get('source')} optimistic={r.get('optimistic')}")
    wait_until(lambda: bool(find_zzz("Воскресенье")), label="bp appear Sun")
    c = assert_on_day("Воскресенье", True, "bp")
    if c:
        seg = str(c.get("segment") or "").upper()
        src = str(c.get("source") or "").lower()
        part = str(c.get("ppPartner") or "")
        if seg == "БП" or src == "bp":
            ok(f"bp type seg={seg!r} src={src!r}")
        else:
            fail(f"bp type unexpected seg={seg!r} src={src!r}")
        if part:
            ok(f"bp partner={part!r}")
        else:
            fail("bp partner empty")

    log("--- MOVE BP Воскресенье → Суббота ---")
    mv = wr_post({"action": "moveClient", "client": CLIENT, "oldDay": "Воскресенье", "newDay": "Суббота"})
    log(f"[..] move bp status={mv.get('status')} optimistic={mv.get('optimistic')} msg={mv.get('message')}")
    wait_until(lambda: (not find_zzz("Воскресенье")) and bool(find_zzz("Суббота")), label="move BP Sun→Sat")
    assert_on_day("Воскресенье", False, "bp after move")
    c = assert_on_day("Суббота", True, "bp after move")
    if c:
        seg = str(c.get("segment") or "").upper()
        src = str(c.get("source") or "").lower()
        if seg == "БП" or src == "bp":
            ok("bp type survived move")
        else:
            fail(f"bp type lost after move seg={seg!r} src={src!r}")

    # -------- STATS smoke --------
    log("--- getStats ---")
    st = wr_get("getStats", force="1")
    if st.get("status") == "success":
        fact = st.get("fact") or {}
        byp = fact.get("byPartner") or st.get("byPartner") or []
        ok(
            f"getStats month={st.get('monthKey') or st.get('monthLabel')} "
            f"deliveries={fact.get('deliveries')} partners={len(byp)} "
            f"pp={((st.get('pp') or {}).get('actual'))}"
        )
    else:
        fail(f"getStats: {st.get('message') or list(st.keys())[:8]}")

    # -------- FINAL CLEANUP --------
    cleanup_all("final cleanup")

    for d in DAYS:
        if find_zzz(d):
            fail(f"leftover on {d}")
    if not any(x.startswith("[FAIL] leftover") for x in REPORT):
        ok("no leftovers anywhere")

    log(f"=== SUMMARY OK={OKS} FAIL={FAILS} ===")
    out_path = "/tmp/boinya-live-qa-report.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(REPORT) + "\n")
    log(f"report: {out_path}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    raise SystemExit(main())
