#!/usr/bin/env bash
# Live people-canon smoke via Worker (zzz_test only).
# Fast-confirm: accepted + pollPeopleWrite → sheetsVerified.
set -euo pipefail

W="${WORKER_URL:-https://boinya-c.konchaarsenia.workers.dev}"
CLIENT="zzz_test"
DAY="${1:-Понедельник}"
TS="$(date +%s)"
export W CLIENT DAY TS

python3 - <<'PY'
import json, urllib.request, urllib.parse, time, os, sys

W = os.environ["W"].rstrip("/")
CLIENT = os.environ["CLIENT"]
DAY = os.environ["DAY"]
TS = os.environ["TS"]

def get(qs, timeout=60):
    with urllib.request.urlopen(f"{W}/?cutover=1&{qs}", timeout=timeout) as r:
        return json.loads(r.read().decode())

def post(body, timeout=90):
    req = urllib.request.Request(
        f"{W}/?cutover=1",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "text/plain;charset=UTF-8"},
        method="POST",
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read().decode())
    ms = int((time.time() - t0) * 1000)
    return data, ms

def poll_sheets(wid, label):
    for i in range(45):
        time.sleep(1.1)
        p = get("action=pollPeopleWrite&writeId=" + urllib.parse.quote(wid), timeout=15)
        print("poll", label, i, p.get("status"), p.get("sheetsVerified"), p.get("message"))
        if p.get("sheetsVerified") and p.get("status") == "success":
            print(label, "SHEETS OK")
            return
        if p.get("status") == "error" and not p.get("pendingSheets"):
            raise SystemExit(f"{label} sheets fail: {p}")
    raise SystemExit(f"{label} poll timeout")

def assert_write(d, label, http_ms):
    print(label, "http_ms=", http_ms, {k: d.get(k) for k in (
        "status","sheetsVerified","optimistic","d1Verified","wrote","writeId","pendingSheets","message","action")})
    assert d.get("optimistic") is not True, d
    assert d.get("status") in ("success", "accepted"), d
    assert d.get("d1Verified") is True or d.get("sheetsVerified") is True, d
    if http_ms > 8000:
        print("WARN: slow accept", http_ms, "ms (want <~3–5s)")
    if d.get("sheetsVerified") and d.get("status") == "success":
        print(label, "instant sheets OK")
        return
    wid = d.get("writeId") or ""
    assert wid, d
    poll_sheets(wid, label)

print("=== ping ===")
ping = get("action=ping")
print(ping)
assert ping.get("live") is True
assert ping.get("peopleCanon") in ("sheets-confirm-bg", "sheets-first")

print("=== saveOrder ===")
basket = json.dumps([{"cat":"Мясо","main":"ГОВЯДИНА","sub":"Мелкое","value":50}])
save, ms = post({
    "action": "saveOrder", "client": CLIENT, "day": DAY,
    "address": f"test addr {TS}", "note": f"canon {TS}",
    "basket": basket, "matchKey": CLIENT, "_": TS,
})
assert_write(save, "SAVE", ms)

day_q = urllib.parse.quote(DAY)
gc = get(f"action=getClients&day={day_q}&force=1&_={TS}")
ok = any("zzz_test" in (c.get("name") or c.get("client") or "").lower() for c in (gc.get("clients") or []))
print("on day:", ok, "n=", len(gc.get("clients") or []))
assert ok

print("=== moveClient → Вторник ===")
move, ms = post({
    "action": "moveClient", "client": CLIENT, "oldDay": DAY, "newDay": "Вторник",
    "cutRaw": "0", "matchKey": CLIENT, "_": TS + "m",
})
assert_write(move, "MOVE", ms)
time.sleep(1)
vt = urllib.parse.quote("Вторник")
gc2 = get(f"action=getClients&day={vt}&force=1&_={TS}2")
ok2 = any("zzz_test" in (c.get("name") or c.get("client") or "").lower() for c in (gc2.get("clients") or []))
print("on Вторник:", ok2)
assert ok2

print("=== deleteClient ===")
dele, ms = post({
    "action": "deleteClient", "client": CLIENT, "day": "Вторник",
    "matchKey": CLIENT, "_explicitDelete": "1", "_userDelete": "1", "_": TS + "d",
})
assert_write(dele, "DELETE", ms)
time.sleep(1)
gc3 = get(f"action=getClients&day={vt}&force=1&_={TS}3")
still = any("zzz_test" in (c.get("name") or c.get("client") or "").lower() for c in (gc3.get("clients") or []))
print("still:", still)
assert not still

print("=== calendar booking/move/remove ===")
d1, d2 = "2026-09-20", "2026-09-21"
book, ms = post({
    "action": "saveBooking", "client": CLIENT, "day": "", "date": d1,
    "alsoSaveOrder": "0", "calendarOnly": "1",
    "address": f"cal {TS}", "note": f"cal {TS}",
    "basket": json.dumps([{"cat":"Мясо","main":"ГОВЯДИНА","sub":"Мелкое","value":20}]),
    "matchKey": CLIENT, "_": TS + "b",
})
assert_write(book, "CAL_BOOK", ms)
m2, ms = post({
    "action": "moveClient", "client": CLIENT, "oldDay": "", "newDay": "",
    "oldDate": d1, "newDate": d2, "calendarOnly": "1", "dateOnly": "1",
    "cutRaw": "0", "matchKey": CLIENT, "_": TS + "cm",
})
assert_write(m2, "CAL_MOVE", ms)
r2, ms = post({
    "action": "removeCalendarClient", "client": CLIENT, "date": d2,
    "matchKey": CLIENT, "_explicitDelete": "1", "_userDelete": "1", "_": TS + "cr",
})
assert_write(r2, "CAL_REMOVE", ms)

print("ALL PEOPLE-CANON LIVE CHECKS PASSED")
PY
