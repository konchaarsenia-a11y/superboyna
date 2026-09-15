#!/usr/bin/env python3
"""Выгрузка себестоимости из прайс-таблицы (листы Подписка / Розница / БП).

Источник: PRICE_SPREADSHEET_ID в Code.gs (по умолчанию 1c3iETyh_eOGcL0_zsGapzliVEfhQk5fQqbg8aAGAgI0).
Строка «Себестоимость 100г» — канон для ПП и БП; розница на листе почти пустая (статистика берёт ПП).

Usage:
  python3 scripts/export-product-costs.py
  python3 scripts/export-product-costs.py --out artifacts/product-costs
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_SPREADSHEET_ID = "1c3iETyh_eOGcL0_zsGapzliVEfhQk5fQqbg8aAGAgI0"
SHEETS = ("Подписка", "Розница", "БП")
MODES = {"Подписка": "pp", "Розница": "retail", "БП": "bp"}


def fetch_gviz(ss_id: str, sheet: str) -> tuple[list[str], list[list]]:
    url = (
        f"https://docs.google.com/spreadsheets/d/{ss_id}/gviz/tq"
        f"?tqx=out:json&sheet={urllib.parse.quote(sheet)}"
    )
    with urllib.request.urlopen(url, timeout=60) as resp:
        text = resp.read().decode("utf-8")
    m = re.search(r"google\.visualization\.Query\.setResponse\((.*)\);?\s*$", text, re.S)
    if not m:
        raise RuntimeError(f"bad gviz response for sheet {sheet}")
    data = json.loads(m.group(1))
    cols = [c.get("label", "") for c in data["table"]["cols"]]
    rows: list[list] = []
    for row in data["table"]["rows"]:
        rows.append(["" if c is None else c.get("v", "") for c in (row.get("c") or [])])
    return cols, rows


def find_cost_row(rows: list[list]) -> int:
    for r in range(min(10, len(rows))):
        label = re.sub(r"\s+", " ", str(rows[r][0] if rows else "").lower()).strip()
        if "себестоим" in label:
            return r
    return 0


def map_header(header: str) -> tuple[str, str, str, str] | None:
    h = re.sub(r"\s+", " ", str(header or "").strip()).upper().replace("Ё", "Е")
    if not h:
        return None
    if re.match(r"^(ЛЮДИ|ID|КОЛИЧ|СТАТУС|ПОЖЕЛАН|ЗАМЕТК)", h):
        return None
    if re.search(
        r"СЕБЕСТОИМ|СТОИМОСТ|СУММА|ЦЕНА|ИТОГ|СКИДК|ВЫХЛОП|ФАКТ|КАРМАН|ФРАК|ГРЯЗН|^У[123]$|^УП4$|^С[123]$",
        h,
    ):
        return None
    if h in ("У1", "У2", "У3", "УП4", "С1", "С2", "С3"):
        return ("УПАКОВКА", h, "pack", "шт")

    def dress_sub(hh: str) -> str:
        if "МЕЛК" in hh:
            return "Мелкое"
        if "СРЕД" in hh or "КУБИК" in hh:
            return "Среднее"
        if "КРУПН" in hh:
            return "Крупное"
        if "БОЛЬШ" in hh or "ПОЛОСК" in hh:
            return "Большое"
        if "ЦЕЛ" in hh or "ЛОМТ" in hh:
            return "Целое"
        if "ПОЛОВИН" in hh:
            return "ПОЛОВИНКА"
        if "ОЧЕНЬ" in hh or "ОЧ МАЛ" in hh:
            return "ОЧ МАЛ"
        if "ОГР" in hh:
            return "ОГР"
        if "ПЛАСТ" in hh:
            return "ПЛАСТ"
        if "ПАЛ" in hh:
            return "ПАЛК"
        if "МАЛ" in hh and "БОЛ" not in hh:
            return "МАЛ"
        if "БОЛ" in hh:
            return "БОЛ"
        if "ОБЫЧН" in hh:
            return "Обычное" if "УХО" in hh else "Обычная"
        return ""

    rules = [
        (r"БЫЧ.*КОРЕН", "БЫЧИЙ КОРЕНЬ", "chew", "шт"),
        (r"ТРАХЕ", "ТРАХЕЯ", "chew", "шт"),
        (r"СТАНОВ", "СТАНОВАЯ ЖИЛА", "chew", "шт"),
        (r"УХО|УШК", "УХО Г", "chew", "шт"),
        (r"АОРТ", "АОРТА", "chew", "шт"),
        (r"КОЛЕН", "КОЛЕНИ шт.", "chew", "шт"),
        (r"КОПЫТ", "КОПЫТО шт.", "chew", "шт"),
        (r"НОС", "НОСЫ шт.", "chew", "шт"),
        (r"ЛОП.*ХРЯЩ", "ЛОП ХРЯЩ шт.", "chew", "шт"),
        (r"УТИН.*ШЕ", "УТИНЫЕ ШЕИ шт.", "chew", "шт"),
        (r"ПЕРЕП", "ПЕРЕПЁЛКИ шт.", "chew", "шт"),
        (r"ГУБ", "ГУБЫ шт.", "chew", "шт"),
        (r"КРОШК.*Л[ЕЁ]?ГК", "КРОШКА ЛЁГКОГО", "powder", "пак"),
        (r"КРОШК.*ПОЧ", "КРОШКА ПОЧЕК", "powder", "пак"),
        (r"КРОШК.*СЕРД", "КРОШКА СЕРДЦА", "powder", "пак"),
        (r"КРОШК.*РУБ", "КРОШКА РУБЕЦ", "powder", "пак"),
        (r"КРОШК.*МИКС", "КРОШКА МИКС", "powder", "пак"),
        (r"БАРАНЬ.*ПЕЧЕН", "БАРАНЬЯ ПЕЧЕНЬ", "dressura", "100г"),
        (r"БАРАНЬ.*Л[ЕЁ]?ГК", "БАРАНЬЕ ЛЁГКОЕ", "dressura", "100г"),
        (r"Л[ЕЁ]?ГК", "ЛЁГКОЕ", "dressura", "100г"),
        (r"СЕРДЦ", "СЕРДЦЕ", "dressura", "100г"),
        (r"РУБЕЦ\s*Т", "РУБЕЦ Т", "dressura", "100г"),
        (r"ПОЧК", "ПОЧКИ", "dressura", "100г"),
        (r"ИНДЕЙК", "ИНДЕЙКА", "dressura", "100г"),
        (r"ПЕЧЕНЬ", "ПЕЧЕНЬ", "other", "100г"),
        (r"РУБЕЦ\s*С|СВЕТЛ", "СВЕТЛЫЙ РУБЕЦ", "other", "100г"),
        (r"КНИЖК", "КНИЖКА", "other", "100г"),
        (r"ВЫМЯ", "ВЫМЯ", "other", "100г"),
        (r"СЕМЕНН", "СЕМЕННИКИ", "other", "100г"),
        (r"МЯСН.*ЛОМТ", "МЯСНЫЕ ЛОМТИКИ", "other", "100г"),
        (r"ПИКАЛЬН", "ПИКАЛЬНОЕ МЯСО", "other", "100г"),
        (r"БАНАН", "БАНАНЫ", "veg", "100г"),
        (r"ЯБЛОК", "ЯБЛОКИ", "veg", "100г"),
        (r"ГРУШ", "ГРУШИ", "veg", "100г"),
        (r"КЛУБНИК", "КЛУБНИКА", "veg", "100г"),
        (r"МОРКОВ", "МОРКОВЬ", "veg", "100г"),
        (r"ТЫКВ", "ТЫКВА", "veg", "100г"),
        (r"БАТАТ", "БАТАТ", "veg", "100г"),
        (r"КАБАЧ", "КАБАЧОК", "veg", "100г"),
        (r"СВЕКЛ", "СВЕКЛА", "veg", "100г"),
    ]
    for pat, name, cat, unit in rules:
        if re.search(pat, h):
            sub = dress_sub(h)
            if name == "УХО Г" and not sub:
                sub = "ПОЛОВИНКА" if "ПОЛОВИН" in h else "Обычное"
            if name == "АОРТА" and not sub:
                sub = "ПОЛОВИНКА" if "ПОЛОВИН" in h else "Обычная"
            return (name, sub, cat, unit)
    return None


def extract_sheet(ss_id: str, sheet_name: str, mode: str) -> list[dict]:
    cols, rows = fetch_gviz(ss_id, sheet_name)
    cost_row = find_cost_row(rows)
    out: list[dict] = []
    for c in range(6, len(cols)):
        mapped = map_header(cols[c])
        if not mapped:
            continue
        name, sub, cat, unit = mapped
        raw = rows[cost_row][c] if c < len(rows[cost_row]) else ""
        try:
            num = float(str(raw).replace(",", "."))
        except (TypeError, ValueError):
            num = 0.0
        key = name + (" / " + sub if sub else "")
        out.append(
            {
                "sheet": sheet_name,
                "mode": mode,
                "sheet_header": cols[c],
                "product": name,
                "fraction": sub,
                "category": cat,
                "unit": unit,
                "cost_byn": num,
                "key": key,
            }
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spreadsheet-id", default=DEFAULT_SPREADSHEET_ID)
    ap.add_argument("--out", default="artifacts/product-costs")
    args = ap.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    all_rows: list[dict] = []
    by_mode: dict[str, list[dict]] = {}
    for sheet in SHEETS:
        mode = MODES[sheet]
        rows = extract_sheet(args.spreadsheet_id, sheet, mode)
        by_mode[mode] = rows
        all_rows.extend(rows)

    all_path = out_dir / "product-costs-all.csv"
    with all_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "sheet",
                "mode",
                "sheet_header",
                "product",
                "fraction",
                "category",
                "unit",
                "cost_byn",
                "key",
            ],
        )
        w.writeheader()
        w.writerows(all_rows)

    canonical: dict[str, dict] = {}
    for it in by_mode.get("pp", []):
        canonical[it["key"]] = {
            "key": it["key"],
            "product": it["product"],
            "fraction": it["fraction"],
            "category": it["category"],
            "unit": it["unit"],
            "sheet_header": it["sheet_header"],
            "cost_pp_byn": it["cost_byn"],
            "cost_bp_byn": 0.0,
            "cost_retail_byn": 0.0,
            "note": "",
        }
    for mode, col in (("bp", "cost_bp_byn"), ("retail", "cost_retail_byn")):
        for it in by_mode.get(mode, []):
            k = it["key"]
            if k not in canonical:
                canonical[k] = {
                    "key": k,
                    "product": it["product"],
                    "fraction": it["fraction"],
                    "category": it["category"],
                    "unit": it["unit"],
                    "sheet_header": it["sheet_header"],
                    "cost_pp_byn": 0.0,
                    "cost_bp_byn": 0.0,
                    "cost_retail_byn": 0.0,
                    "note": "",
                }
            canonical[k][col] = it["cost_byn"]

    canon_rows = sorted(
        canonical.values(), key=lambda x: (x["category"], x["product"], x["fraction"])
    )
    for r in canon_rows:
        if r["category"] == "pack":
            continue
        if r["cost_pp_byn"] == 0 and r["cost_bp_byn"] == 0:
            r["note"] = "ZERO — заполнить"
        elif r["cost_pp_byn"] != r["cost_bp_byn"]:
            r["note"] = "PP≠BP"

    canon_path = out_dir / "product-costs-canonical.csv"
    with canon_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "key",
                "product",
                "fraction",
                "category",
                "unit",
                "cost_pp_byn",
                "cost_bp_byn",
                "cost_retail_byn",
                "sheet_header",
                "note",
            ],
        )
        w.writeheader()
        w.writerows(canon_rows)

    print(f"Wrote {all_path} ({len(all_rows)} rows)")
    print(f"Wrote {canon_path} ({len(canon_rows)} positions)")
    zeros = [r["key"] for r in canon_rows if r["note"] == "ZERO — заполнить"]
    if zeros:
        print("Zeros:", ", ".join(zeros))


if __name__ == "__main__":
    main()
