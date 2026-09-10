#!/usr/bin/env python3
"""Replace the pulled Apps Script code file with repo Code.gs.

Keeps every other pulled file (appsscript.json, index.html, extra .gs, …)
so `clasp push` cannot wipe remote files that are not in git.
"""
from __future__ import annotations

import pathlib
import shutil
import sys

CODE_STEMS = ("Код", "Code", "code")


def main() -> int:
    if len(sys.argv) != 3:
        print(
            "usage: clasp-overlay-code.py <repo_Code.gs> <clasp_workdir>",
            file=sys.stderr,
        )
        return 2
    src = pathlib.Path(sys.argv[1])
    work = pathlib.Path(sys.argv[2])
    if not src.is_file() or src.stat().st_size < 1000:
        print(f"Code.gs missing or too small: {src}", file=sys.stderr)
        return 1
    if not work.is_dir():
        print(f"workdir missing: {work}", file=sys.stderr)
        return 1

    names = sorted(p.name for p in work.iterdir() if p.is_file())
    print("pulled files:", ", ".join(names) if names else "(none)")
    if "appsscript.json" not in names:
        print(
            "clasp pull did not produce appsscript.json — abort to avoid a partial push",
            file=sys.stderr,
        )
        return 1

    code_files = [n for n in names if n.endswith((".js", ".gs", ".ts"))]
    preferred = [
        n
        for n in code_files
        if n.rsplit(".", 1)[0] in CODE_STEMS or n.startswith("Код")
    ]
    if not preferred:
        preferred = code_files
    if not preferred:
        print("no .js/.gs/.ts code file after clasp pull", file=sys.stderr)
        return 1

    target_name = next((n for n in preferred if n.startswith("Код")), preferred[0])
    target = work / target_name
    print(f"overlay {src} → {target}")
    shutil.copyfile(src, target)

    extras = [n for n in code_files if n != target_name]
    if extras:
        print("keeping other script files (not overlayed):", ", ".join(extras))
    html = [n for n in names if n.endswith(".html")]
    print("html files kept:", ", ".join(html) if html else "(none)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
