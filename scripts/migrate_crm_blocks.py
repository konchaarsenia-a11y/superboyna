# -*- coding: utf-8 -*-
"""Дозалить оба блока дней Июль/Август (копия) → saveBooking → Календарь_Дат."""
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


def blocks(rows):
    headers = [i for i, row in enumerate(rows) if is_day_header_row(row)]
    out = []
    for i, hr in enumerate(headers):
        end = headers[i + 1] - 1 if i + 1 < len(headers) else len(rows) - 1
        day_to_col = {}
        for c, cell in enumerate(rows[hr]):
            s = str(cell or "").strip()
            if s.isdigit() and 1 <= int(s) <= 31:
                day_to_col[int(s)] = c
        out.append((hr, hr + 1, end, day_to_col))
    return out


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
    }


def post(payload, timeout=60):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        WH, data=body, headers={"User-Agent": "x", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        t = r.read().decode("utf-8", "replace").strip()
    m = re.search(r"(\{[\s\S]*\})", t)
    return json.loads(m.group(1)) if m else {"raw": t[:200]}


def get_jsonp(params, timeout=90):
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(WH + "?" + q + "&callback=cb", headers={"User-Agent": "x"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        t = r.read().decode("utf-8", "replace").strip()
    m = re.search(r"\(\s*(\{[\s\S]*\})\s*\)\s*;?\s*$", t)
    return json.loads(m.group(1) if m else t)


def main():
    ok = fail = 0
    for sheet, month in [("Июль (копия)", 7), ("Август (копия)", 8)]:
        rows = csv_sheet(sheet)
        bls = blocks(rows)
        print("===", sheet, "blocks", len(bls), [(b[0] + 1, sorted(b[3])) for b in bls])
        for hr, start, end, day_to_col in bls:
            for day, c in sorted(day_to_col.items()):
                date = "%04d-%02d-%02d" % (YEAR, month, day)
                for r in range(start, end + 1):
                    if c >= len(rows[r]):
                        continue
                    parsed = parse_cell(rows[r][c])
                    if not parsed:
                        continue
                    note = parsed["note"]
                    if parsed["segment"]:
                        note = ("[" + parsed["segment"] + "] " + note).strip()
                    try:
                        resp = post(
                            {
                                "action": "saveBooking",
                                "date": date,
                                "client": parsed["client"],
                                "address": parsed["address"],
                                "phone": parsed["phone"],
                                "note": note,
                                "basket": [],
                                "source": "crm_migrate_blocks",
                            }
                        )
                        if resp.get("status") == "error":
                            fail += 1
                            if fail <= 5:
                                print("FAIL", date, parsed["client"], resp)
                        else:
                            ok += 1
                    except Exception as e:
                        fail += 1
                        if fail <= 5:
                            print("ERR", date, parsed["client"], e)
                    time.sleep(0.1)
        print("progress ok", ok, "fail", fail)

    print("DONE ok=%s fail=%s" % (ok, fail))
    for date in ("2026-07-28", "2026-07-02", "2026-07-27", "2026-08-04"):
        v = get_jsonp({"action": "getViewCompare", "date": date}, timeout=120)
        names = [p.get("name") for p in (v.get("month") or [])]
        print("check", date, "n=", len(names), names)


if __name__ == "__main__":
    main()
