#!/usr/bin/env python3
import json, time, urllib.parse, urllib.request

WORKER = "https://boinya-c.konchaarsenia.workers.dev"

def call(params):
    q = urllib.parse.urlencode(params)
    with urllib.request.urlopen(f"{WORKER}?{q}", timeout=60) as r:
        return json.load(r)

def qday(d):
    return urllib.parse.quote(d)

for day in ["Суббота", "Понедельник"]:
    call({"action": "deleteClient", "day": day, "client": "zzz_test", "force": "1"})

basket = json.dumps([{"cat": "мясо", "main": "ГОВЯДИНА", "name": "ГОВЯДИНА", "sub": "", "val": 1}])
save = call({
    "action": "saveOrder", "day": "Суббота", "date": "2026-08-22",
    "client": "zzz_test", "address": "test", "basket": basket, "force": "1"
})
print("save", save.get("status"), save.get("d1Verified"), save.get("wrote"))
time.sleep(1)

sat = call({"action": "getClients", "day": "Суббота", "force": "1"})
print("sat before", [c["name"] for c in sat.get("clients", []) if "zzz" in c.get("name", "").lower()])

move = call({
    "action": "moveClient", "client": "zzz_test",
    "oldDay": "Суббота", "newDay": "Понедельник",
    "oldDate": "2026-08-22", "newDate": "2026-08-18",
    "cutRaw": "1", "force": "1"
})
print("move", json.dumps({k: move.get(k) for k in ["status", "wrote", "optimistic", "message", "alreadyMoved", "to", "from"]}, ensure_ascii=False))
time.sleep(2)

for day in ["Суббота", "Понедельник"]:
    d = call({"action": "getClients", "day": day, "force": "1"})
    names = [c["name"] for c in d.get("clients", []) if "zzz" in c.get("name", "").lower()]
    print(day, names, "source", d.get("source"))
