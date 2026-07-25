# -*- coding: utf-8 -*-
"""Перенос Июль/Август (копия) → Календарь_Дат через saveBooking (живой webhook)."""
import csv
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

WH = "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec"
SSID = "1aBNcgobp5GNBKySjMKRWEDWWKebF5kqb5A-cZoDuvG8"
YEAR = 2026
SHEETS = [("Июль (копия)", 7), ("Август (копия)", 8)]  # month 1-12


def csv_sheet(sheet):
    url = "https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv&sheet=%s" % (
        SSID,
        urllib.parse.quote(sheet),
    )
    req = urllib.request.Request(url, headers={"User-Agent": "superboyna-migrate/1"})
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read().decode("utf-8", "replace")
    return list(csv.reader(io.StringIO(raw)))


def parse_cell(text):
    lines = [x.strip() for x in str(text or "").replace("\r", "").split("\n") if x.strip()]
    if not lines:
        return None
    if re.fullmatch(r"\d+", lines[0]) and len(lines) == 1:
        return None
    start = 0
    nick = lines[0]
    if re.match(r"^(варка|только|написать)\b", nick, re.I):
        if len(lines) < 2:
            return None
        start = 1
        nick = lines[1]
    client = re.sub(r"^[@\s]+", "", nick).strip()
    if len(client) < 2:
        return None
    segment = ""
    address = ""
    phone = ""
    notes = []
    for ln in lines[start + 1 :]:
        m = re.search(r"\b(АФК|ПП|БП|Р)\b", ln, re.I)
        if m and not segment:
            segment = m.group(1).upper()
            rest = re.sub(r"\b(АФК|ПП|БП|Р)\b", "", ln, flags=re.I).strip()
            if rest:
                notes.append(rest)
            continue
        digits = re.sub(r"\D", "", ln)
        if (re.match(r"^\+?\d[\d\s\-()]{6,}", ln) or (len(digits) >= 9 and digits.isdigit())) and not phone:
            phone = ln.strip()
            continue
        if not address and re.search(r"[а-яА-Яa-zA-Z]", ln) and not re.fullmatch(r"\d+\s*", ln):
            address = ln.strip()
            continue
        notes.append(ln)
    if not segment and re.search(r"варка", lines[0], re.I):
        segment = "Р"
    elif not segment:
        segment = "ПП"
    return {
        "client": client,
        "segment": segment,
        "address": address,
        "phone": phone,
        "note": "; ".join(notes),
    }


def post(payload, timeout=90):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        WH,
        data=body,
        headers={"User-Agent": "superboyna-migrate/1", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        t = r.read().decode("utf-8", "replace").strip()
    m = re.search(r"(\{[\s\S]*\})", t)
    return json.loads(m.group(1)) if m else {"raw": t[:300]}


def get_jsonp(params, timeout=90):
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(WH + "?" + q + "&callback=cb", headers={"User-Agent": "superboyna-migrate/1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        t = r.read().decode("utf-8", "replace").strip()
    m = re.search(r"\(\s*(\{[\s\S]*\})\s*\)\s*;?\s*$", t)
    return json.loads(m.group(1) if m else t)


def main():
    # 1) Prefer server-side bulk migrate if Deploy already has it
    print("try migrateCalendar months=7,8 ...")
    try:
        d = post({"action": "migrateCalendar", "months": "7,8", "year": YEAR, "skipBookings": 0}, timeout=300)
        print("migrateCalendar:", json.dumps(d, ensure_ascii=False)[:500])
        stats = d.get("stats") or {}
        sheets = stats.get("sheets") or []
        crm_people = int(stats.get("crmPeople") or 0)
        # новый Deploy отдаёт sheets[] с людьми с «Июль (копия)» и т.п.
        if d.get("status") == "success" and (crm_people > 0 or any((s or {}).get("people") for s in sheets)):
            print("OK server migrate")
            return
        print("server migrate without CRM people — fallback CSV→saveBooking")
    except Exception as e:
        print("migrateCalendar failed:", e)

    # 2) Fallback: saveBooking per cell from CSV copies
    ok = fail = 0
    for sheet, month in SHEETS:
        rows = csv_sheet(sheet)
        if not rows:
            print(sheet, "empty")
            continue
        headers = rows[0]
        print("===", sheet, "days", headers)
        for c, hv in enumerate(headers):
            hv = str(hv or "").strip()
            if not hv.isdigit():
                continue
            day = int(hv)
            date = "%04d-%02d-%02d" % (YEAR, month, day)
            for r in range(1, len(rows)):
                if c >= len(rows[r]):
                    continue
                parsed = parse_cell(rows[r][c])
                if not parsed:
                    continue
                note = parsed["note"]
                if parsed["segment"]:
                    note = (("[" + parsed["segment"] + "] " + note).strip())
                payload = {
                    "action": "saveBooking",
                    "date": date,
                    "client": parsed["client"],
                    "address": parsed["address"],
                    "phone": parsed["phone"],
                    "note": note,
                    "basket": [],
                    "source": "crm_migrate",
                }
                try:
                    resp = post(payload, timeout=60)
                    st = resp.get("status")
                    if st in ("success", "ok") or resp.get("id") or resp.get("bookingId"):
                        ok += 1
                    else:
                        fail += 1
                        print("FAIL", date, parsed["client"], resp)
                except Exception as e:
                    fail += 1
                    print("ERR", date, parsed["client"], e)
                time.sleep(0.15)
    print("DONE ok=%s fail=%s" % (ok, fail))

    # spot-check
    for date in ("2026-07-01", "2026-07-22", "2026-08-03", "2026-08-14"):
        try:
            v = get_jsonp({"action": "getViewCompare", "date": date}, timeout=120)
            print(
                "check",
                date,
                "monthSheet=",
                v.get("monthSheet"),
                "month=",
                len(v.get("month") or []),
                "week=",
                len(v.get("week") or []),
            )
        except Exception as e:
            print("check", date, e)


if __name__ == "__main__":
    main()
