#!/usr/bin/env python3
"""Ждёт, пока деплой Worker на этот SHA закончит promote, и только потом secret put."""
import json
import os
import sys
import time
import urllib.request

ACTIVE = {"queued", "in_progress", "waiting", "pending", "requested"}
NAMES = ["boinya-c-worker", "boinya-c-worker-deploy"]


def fetch_runs(repo, sha, token):
    url = "https://api.github.com/repos/%s/actions/runs?head_sha=%s&per_page=100" % (repo, sha)
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "week-close-dupes",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    return data.get("workflow_runs") or []


def latest(items):
    return sorted(items, key=lambda r: (r.get("created_at") or "", r.get("id") or 0))[-1]


def must_wait(event, found, now, grace_until):
    """Какие workflow ещё обязаны стать success, прежде чем ставить секрет."""
    required = []
    if event == "push":
        required.append("boinya-c-worker")
        if found.get("boinya-c-worker-deploy") or now < grace_until:
            required.append("boinya-c-worker-deploy")
    else:
        for name in NAMES:
            if found.get(name):
                required.append(name)
    return required


def poll(event, runs_fn, sleep_fn, now_fn, grace_s=180, deadline_s=15 * 60):
    started = now_fn()
    grace_until = started + grace_s
    deadline = started + deadline_s
    while True:
        now = now_fn()
        found = {name: [] for name in NAMES}
        for run in runs_fn():
            name = run.get("name") or ""
            if name in found:
                found[name].append(run)
        failed = []
        ready = []
        pending = []
        for name in NAMES:
            items = found[name]
            if not items:
                pending.append(name)
                print(name + ": запуска ещё нет", flush=True)
                continue
            if any((r.get("status") in ACTIVE) for r in items):
                pending.append(name)
                print(name + ": ещё идёт", flush=True)
                continue
            conclusion = latest(items).get("conclusion") or ""
            if conclusion != "success":
                failed.append(name + " conclusion=" + conclusion)
            else:
                ready.append(name)
                print(name + ": success", flush=True)
        if failed:
            raise SystemExit("деплой Worker не успешный: " + "; ".join(failed))
        required = must_wait(event, found, now, grace_until)
        if required and all(name in ready for name in required):
            print("Worker задеплоен, можно secret put", flush=True)
            return
        if not required and now >= grace_until:
            print("деплой на этом SHA не запускался — секрет ставим на уже живой Worker", flush=True)
            return
        if (
            event == "push"
            and now >= grace_until
            and "boinya-c-worker" in ready
            and not found["boinya-c-worker-deploy"]
        ):
            print("boinya-c-worker-deploy на этом SHA нет — секрет ставим на уже живой Worker", flush=True)
            return
        if now > deadline:
            raise SystemExit("таймаут ожидания деплоя Worker")
        sleep_fn(20)


def self_test():
    def done(name, conclusion="success", status="completed"):
        return {"name": name, "status": status, "conclusion": conclusion, "created_at": "t", "id": 1}

    def run(event, items, grace_s=180, deadline_s=1000, start=1000):
        clock = {"n": start}

        def now():
            return clock["n"]

        def sleep(_s):
            clock["n"] += 20

        poll(event, lambda: items, sleep, now, grace_s=grace_s, deadline_s=deadline_s)

    run(
        "push",
        [done("boinya-c-worker"), done("boinya-c-worker-deploy")],
    )
    try:
        run(
            "push",
            [done("boinya-c-worker"), done("boinya-c-worker-deploy", conclusion="failure")],
        )
        raise SystemExit("failure deploy должен останавливать ожидание")
    except SystemExit as e:
        if "не успешный" not in str(e):
            raise
    try:
        run(
            "push",
            [done("boinya-c-worker", status="in_progress", conclusion=None)],
            deadline_s=30,
            start=0,
        )
        raise SystemExit("in_progress не должен отпускать secret put")
    except SystemExit as e:
        if "таймаут" not in str(e):
            raise
    run(
        "push",
        [done("boinya-c-worker")],
        grace_s=10,
        start=0,
    )
    run("workflow_dispatch", [], grace_s=10, start=0)
    print("wait-deploy self-test ok")


def main():
    if "--self-test" in sys.argv:
        self_test()
        return
    poll(
        os.environ.get("GITHUB_EVENT_NAME") or "",
        lambda: fetch_runs(os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_SHA"], os.environ["GH_TOKEN"]),
        time.sleep,
        time.time,
    )


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        print("не удалось дождаться деплоя: " + str(e), file=sys.stderr)
        sys.exit(1)
