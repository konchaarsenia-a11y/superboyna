#!/usr/bin/env bash
# Smoke: day money totals — clients have prices, calc works on live data.
set -euo pipefail

W="${WORKER_URL:-https://boinya-c.konchaarsenia.workers.dev}"
DAY="${1:-Понедельник}"
export W DAY

python3 - <<'PY'
import json, urllib.request, urllib.parse, os, re

W = os.environ["W"].rstrip("/")
DAY = os.environ["DAY"]

def get(qs):
    req = urllib.request.Request(f"{W}/?cutover=1&{qs}", headers={"User-Agent": "day-money-smoke/1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())

def extract_price(note):
    m = re.search(r"\[ЦЕНА:\s*([0-9]+(?:[.,][0-9]+)?)\s*BYN?\]", str(note or ""), re.I)
    if not m:
        return None
    n = float(m.group(1).replace(",", "."))
    return n

def seg_kind(c):
    seg = str(c.get("segment") or "").upper()
    src = str(c.get("source") or c.get("orderType") or "").lower()
    if seg in ("БП", "BP") or src == "bp":
        return "bp"
    if seg in ("ПП", "АФК", "AFK", "PP") or src == "pp":
        return "pp"
    if "ПАРТ" in seg or src == "partner":
        return "partner"
    if seg in ("Р", "R", "RETAIL") or src == "retail":
        return "retail"
    return "other"

def collect_amount(c):
    if seg_kind(c) == "bp":
        return 0.0
    if seg_kind(c) == "pp" and (c.get("ppPaid") or str(c.get("paid") or "").lower() == "yes"):
        return 0.0
    op = c.get("orderPrice")
    amt = 0.0
    if op is not None and str(op).strip() != "":
        try:
            amt = float(op)
        except Exception:
            amt = 0.0
    if amt <= 0:
        p = extract_price(c.get("note"))
        amt = p or 0.0
    cq = float(c.get("couponsQty") or 0)
    cp = float(c.get("couponPrice") or 0)
    if cq > 0 and cp > 0:
        amt += cp
    return round(max(0.0, amt), 2)

qs = urllib.parse.urlencode({"action": "getClients", "day": DAY, "force": "1"})
data = get(qs)
clients = data.get("clients") or []
total = round(sum(collect_amount(c) for c in clients), 2)
with_price = sum(1 for c in clients if collect_amount(c) > 0)
print(f"day={DAY} clients={len(clients)} with_price={with_price} total={total} BYN")
assert data.get("status") == "success", data
print("OK day-money-smoke")
PY
