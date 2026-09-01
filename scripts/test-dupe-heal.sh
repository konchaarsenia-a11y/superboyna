#!/usr/bin/env bash
# Smoke: edit/move не дублируют zzz_test на старом дне (heal/tomb).
set -euo pipefail

W="${WORKER_URL:-https://boinya-c.konchaarsenia.workers.dev}"
CLIENT="zzz_test"
FROM_DAY="${1:-Понедельник}"
TO_DAY="${2:-Вторник}"
TS="$(date +%s)"
export W CLIENT FROM_DAY TO_DAY TS

python3 - <<'PY'
import json, urllib.request, urllib.parse, time, os, sys

W = os.environ["W"].rstrip("/")
CLIENT = os.environ["CLIENT"]
FROM_DAY = os.environ["FROM_DAY"]
TO_DAY = os.environ["TO_DAY"]
TS = os.environ["TS"]
PASS = []

def get(qs, timeout=60):
    req = urllib.request.Request(
        f"{W}/?cutover=1&{qs}",
        headers={"User-Agent": "boinya-dupe-heal-smoke/1"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def post(body, timeout=90):
    req = urllib.request.Request(
        f"{W}/?cutover=1",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "text/plain;charset=UTF-8",
            "User-Agent": "boinya-dupe-heal-smoke/1",
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

def count_day(day):
    qs = urllib.parse.urlencode({"action": "getClients", "day": day, "force": "1", "_": str(TS) + day})
    gc = get(qs)
    return len(gc.get("clients") or []), gc

print("=== PING ===")
ping = get("action=ping")
print("marker:", ping.get("deployMarker"))
assert ping.get("live") is True
PASS.append("PING")

print("=== cleanup ===")
for d in ("Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье", "Будущая неделя"):
    _, gc = count_day(d)
    if has_client(gc):
        post({
            "action": "deleteClient", "client": CLIENT, "day": d,
            "matchKey": CLIENT, "_explicitDelete": "1", "_userDelete": "1",
        })
        time.sleep(0.4)

print("=== save on", FROM_DAY, "===")
basket = json.dumps([{"cat":"Мясо","main":"ГОВЯДИНА","sub":"Мелкое","value":50}])
save1 = post({
    "action": "saveOrder",
    "day": FROM_DAY,
    "client": CLIENT,
    "matchKey": CLIENT,
    "address": "dupe-test addr",
    "phone": "+375000000000",
    "note": "dupe heal smoke",
    "basket": basket,
})
print("save1:", save1.get("status"), save1.get("day"))
assert save1.get("status") in ("success", "accepted"), save1
time.sleep(1)
n_from, gc_from = count_day(FROM_DAY)
assert has_client(gc_from), gc_from
PASS.append("SAVE_FROM")

print("=== move to", TO_DAY, "===")
move = post({
    "action": "moveClient",
    "client": CLIENT,
    "matchKey": CLIENT,
    "oldDay": FROM_DAY,
    "day": TO_DAY,
    "newDay": TO_DAY,
})
print("move:", move.get("status"))
assert move.get("status") in ("success", "accepted"), move
time.sleep(1.2)

print("=== force getClients old day (must NOT have client) ===")
n_old, gc_old = count_day(FROM_DAY)
print(FROM_DAY, "n=", n_old, "has=", has_client(gc_old), "healDiag=", (gc_old.get("healDiag") or {}).get("step"))
assert not has_client(gc_old), ("DUPE on old day!", gc_old)
PASS.append("NO_DUPE_OLD")

print("=== force getClients new day (must have client) ===")
n_new, gc_new = count_day(TO_DAY)
print(TO_DAY, "n=", n_new, "has=", has_client(gc_new))
assert has_client(gc_new), gc_new
PASS.append("HAS_NEW")

print("=== cleanup ===")
post({
    "action": "deleteClient", "client": CLIENT, "day": TO_DAY,
    "matchKey": CLIENT, "_explicitDelete": "1", "_userDelete": "1",
})

print("\nALL PASSED:", ", ".join(PASS))
PY
