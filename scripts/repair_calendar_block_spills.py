# -*- coding: utf-8 -*-
"""Убрать из Календарь_Дат людей, залитых с нижнего блока CRM в верхнюю дату той же колонки."""
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


def csv_sheet(sheet):
    url = "https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv&sheet=%s" % (
        SSID,
        urllib.parse.quote(sheet),
    )
    with urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": "x"}), timeout=90
    ) as r:
        return list(csv.reader(io.StringIO(r.read().decode("utf-8", "replace"))))


def is_day_header_row(row):
    day_hits = nick_hits = 0
    for cell in row:
        s = str(cell or "").strip()
        if not s:
            continue
        if s.isdigit() and 1 <= int(s) <= 31 and len(s) <= 5 and "\n" not in s:
            day_hits += 1
        elif len(s) >= 2 and any(ch.isalpha() for ch in s):
            nick_hits += 1
    return day_hits >= 3 and day_hits >= nick_hits


def parse_blocks(rows):
    headers = [i for i, row in enumerate(rows) if is_day_header_row(row)]
    bls = []
    for i, hr in enumerate(headers):
        end = headers[i + 1] - 1 if i + 1 < len(headers) else len(rows) - 1
        dtc = {}
        for c, cell in enumerate(rows[hr]):
            s = str(cell or "").strip()
            if s.isdigit() and 1 <= int(s) <= 31:
                dtc[int(s)] = c
        bls.append((hr, hr + 1, end, dtc))
    return bls


def nick_key(s):
    s = str(s or "").strip().split("\n")[0].strip().lower()
    return re.sub(r"[^a-z0-9а-яё]+", "", s, flags=re.I)


def parse_cell(text):
    lines = [x.strip() for x in str(text or "").replace("\r", "").split("\n") if x.strip()]
    if not lines or (re.fullmatch(r"\d+", lines[0]) and len(lines) == 1):
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
    segment = address = phone = ""
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
        if (re.match(r"^\+?\d[\d\s\-()]{6,}", ln) or len(digits) >= 9) and not phone:
            phone = ln.strip()
            continue
        if not address and re.search(r"[а-яА-Яa-zA-Z]", ln) and not re.fullmatch(r"\d+\s*", ln):
            address = ln.strip()
            continue
        notes.append(ln)
    if not segment:
        segment = "Р" if re.search(r"варка", lines[0], re.I) else "ПП"
    return {
        "client": client,
        "segment": segment,
        "address": address,
        "phone": phone,
        "note": "; ".join(notes),
        "raw_first": lines[0],
    }


def people_cells(rows, bls, day):
    out = []
    for hr, start, end, dtc in bls:
        if day not in dtc:
            continue
        c = dtc[day]
        for r in range(start, end + 1):
            cell = rows[r][c] if c < len(rows[r]) else ""
            parsed = parse_cell(cell)
            if parsed:
                out.append(parsed)
    return out


def api(params, timeout=90):
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(WH + "?" + q + "&callback=cb", headers={"User-Agent": "x"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        t = r.read().decode("utf-8", "replace").strip()
    m = re.search(r"\(\s*(\{[\s\S]*\})\s*\)\s*;?\s*$", t)
    return json.loads(m.group(1) if m else t)


def post(payload, timeout=60):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        WH, data=body, headers={"User-Agent": "x", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        t = r.read().decode("utf-8", "replace").strip()
    m = re.search(r"(\{[\s\S]*\})", t)
    return json.loads(m.group(1) if m else t)


def main():
    removed = fixed = 0
    for sheet, month in [("Июль (копия)", 7), ("Август (копия)", 8)]:
        rows = csv_sheet(sheet)
        bls = parse_blocks(rows)
        if len(bls) < 2:
            continue
        col_days = {}
        for bi, (hr, start, end, dtc) in enumerate(bls):
            for day, c in dtc.items():
                col_days.setdefault(c, {})[bi] = day

        print("===", sheet)
        for c, m in sorted(col_days.items()):
            if 0 not in m or 1 not in m:
                continue
            d0, d1 = m[0], m[1]
            crm0 = {nick_key(p["client"]): p for p in people_cells(rows, bls, d0)}
            crm1 = {nick_key(p["client"]): p for p in people_cells(rows, bls, d1)}
            date0 = "%04d-%02d-%02d" % (YEAR, month, d0)
            date1 = "%04d-%02d-%02d" % (YEAR, month, d1)
            v0 = api({"action": "getViewCompare", "date": date0})
            for p in v0.get("month") or []:
                name = p.get("name") or ""
                k = nick_key(name)
                if k in crm0:
                    continue
                if k not in crm1:
                    continue
                # spill: на d0, а должен быть на d1
                print(" remove", name, "from", date0, "-> keep", date1)
                try:
                    r = api(
                        {
                            "action": "removeCalendarClient",
                            "date": date0,
                            "client": name,
                            "matchKey": p.get("matchKey") or "",
                            "_": str(time.time()),
                        }
                    )
                    print("  remove:", r.get("status"), r.get("message"), r.get("removed"))
                    if r.get("status") == "success":
                        removed += 1
                    elif r.get("status") == "unknown_action":
                        print("  NEED DEPLOY removeCalendarClient")
                        return
                except Exception as e:
                    print("  remove ERR", e)
                # ensure on correct day
                src = crm1[k]
                note = src["note"]
                if src["segment"]:
                    note = ("[" + src["segment"] + "] " + note).strip()
                try:
                    r2 = post(
                        {
                            "action": "saveBooking",
                            "date": date1,
                            "client": src["client"],
                            "address": src["address"],
                            "phone": src["phone"],
                            "note": note,
                            "basket": [],
                            "source": "crm_spill_fix",
                        }
                    )
                    print("  ensure", date1, r2.get("status"))
                    fixed += 1
                except Exception as e:
                    print("  ensure ERR", e)
                time.sleep(0.15)

    print("DONE removed=%s ensured=%s" % (removed, fixed))
    for d in ("2026-08-03", "2026-08-04", "2026-07-17", "2026-07-28"):
        v = api({"action": "getViewCompare", "date": d})
        print("check", d, [p.get("name") for p in (v.get("month") or [])])


if __name__ == "__main__":
    main()
