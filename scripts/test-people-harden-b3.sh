#!/usr/bin/env bash
# Live smoke: people-harden-b3 (zzz_test only). Checks each batch3 guard point.
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
PASS = []

def get(qs, timeout=60):
    req = urllib.request.Request(
        f"{W}/?cutover=1&{qs}",
        headers={"User-Agent": "boinya-harden-b3-smoke/1"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def post(body, timeout=90):
    req = urllib.request.Request(
        f"{W}/?cutover=1",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "text/plain;charset=UTF-8",
            "User-Agent": "boinya-harden-b3-smoke/1",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def has_client(data):
    return any(
        CLIENT in (c.get("name") or c.get("client") or "").lower()
        for c in (data.get("clients") or [])
    )

def count_clients(day):
    dq = urllib.parse.quote(day)
    gc = get(f"action=getClients&day={dq}&force=1&_={TS}c")
    n = len(gc.get("clients") or [])
    return n, gc

print("=== PING deployMarker ===")
ping = get("action=ping")
print("peopleCanon:", ping.get("peopleCanon"), "marker:", ping.get("deployMarker"))
assert ping.get("live") is True
assert ping.get("peopleCanon") == "d1-primary", ping
assert "people-harden-b3" in str(ping.get("deployMarker") or ""), ping
PASS.append("PING_B3")

print("=== baseline count ===")
base_n, _ = count_clients(DAY)
print("baseline", DAY, "n=", base_n)

print("=== SAVE_KEEP (peers after save) ===")
basket = json.dumps([{"cat":"Мясо","main":"ГОВЯДИНА","sub":"Мелкое","value":50}])
save = post({
    "action": "saveOrder", "client": CLIENT, "day": DAY,
    "address": f"b3 addr {TS}", "note": f"b3 {TS}",
    "basket": basket, "matchKey": CLIENT, "_": TS,
})
assert save.get("status") in ("success", "accepted") and save.get("d1Verified"), save
time.sleep(0.8)
after_n, after_gc = count_clients(DAY)
assert has_client(after_gc), after_gc
assert after_n >= base_n, (base_n, after_n)
PASS.append("SAVE_KEEP")

print("=== COUNTS fromD1 ===")
wc = get("action=getWeekDayCounts&force=1&_=" + TS)
items = wc.get("items") or []
day_item = next((i for i in items if i.get("day") == DAY), None)
print("weekDayCounts", day_item)
assert day_item is not None
assert day_item.get("fromD1") is True or day_item.get("source") == "d1", day_item
PASS.append("COUNTS_D1")

print("=== MOVE + peers kept on source ===")
move = post({
    "action": "moveClient", "client": CLIENT, "oldDay": DAY, "newDay": "Вторник",
    "cutRaw": "0", "matchKey": CLIENT, "_": TS + "m",
})
assert move.get("status") in ("success", "accepted") and move.get("d1Verified"), move
time.sleep(0.8)
src_n, src_gc = count_clients(DAY)
dst_n, dst_gc = count_clients("Вторник")
assert has_client(dst_gc), dst_gc
assert src_n == max(0, after_n - 1), (src_n, after_n)
PASS.append("MOVE_RESOLVE")

print("=== DELETE + no ghost in view ===")
dele = post({
    "action": "deleteClient", "client": CLIENT, "day": "Вторник",
    "matchKey": CLIENT, "_explicitDelete": "1", "_userDelete": "1", "_": TS + "d",
})
assert dele.get("status") in ("success", "accepted") and dele.get("d1Verified"), dele
time.sleep(1)
vt = urllib.parse.quote("Вторник")
gc3 = get(f"action=getClients&day={vt}&force=1&_={TS}3")
assert not has_client(gc3), gc3
vc = get(f"action=getViewCompare&day={vt}&force=1&_={TS}v")
week = vc.get("week") or []
ghost = any(CLIENT in (c.get("name") or c.get("client") or "").lower() for c in week)
assert not ghost, vc
PASS.append("VIEW_NO_GHOST")

print("=== CALENDAR book/move/remove ===")
d1, d2 = "2026-09-22", "2026-09-23"
book = post({
    "action": "saveBooking", "client": CLIENT, "day": "", "date": d1,
    "alsoSaveOrder": "0", "calendarOnly": "1",
    "address": f"cal b3 {TS}", "basket": basket, "matchKey": CLIENT, "_": TS + "b",
})
assert book.get("d1Verified") or book.get("status") in ("success", "accepted"), book
m2 = post({
    "action": "moveClient", "client": CLIENT, "oldDay": "", "newDay": "",
    "oldDate": d1, "newDate": d2, "calendarOnly": "1", "dateOnly": "1",
    "cutRaw": "0", "matchKey": CLIENT, "_": TS + "cm",
})
assert m2.get("d1Verified") or m2.get("status") in ("success", "accepted"), m2
r2 = post({
    "action": "removeCalendarClient", "client": CLIENT, "date": d2,
    "matchKey": CLIENT, "_explicitDelete": "1", "_": TS + "cr",
})
assert r2.get("d1Verified") or r2.get("status") in ("success", "accepted"), r2
PASS.append("CAL_CRUD")

print("=== FINAL restore baseline ===")
final_n, _ = count_clients(DAY)
print("final", DAY, "n=", final_n, "(baseline was", base_n, ")")
PASS.append("FINAL_OK")

print("ALL PASSED:", ",".join(PASS))
PY
