# Upload an undeployed Worker version, call getMe/getWebhookInfo, then upload the original source again.
# Does not deploy. Restores worker.js on disk. Never prints the bot token.
import json
import os
import re
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PROXY = os.path.join(ROOT, "boinya-c", "proxy")
OUT = os.environ.get("BOT_DIAG_OUT") or os.path.join(ROOT, "artifacts", "bot-ban-diag")
TOKEN_RE = re.compile(r"bot\d{5,}:[A-Za-z0-9_-]+|\d{5,}:[A-Za-z0-9_-]{15,}")
os.chdir(PROXY)
os.makedirs(OUT, exist_ok=True)


def redact(text):
    return TOKEN_RE.sub("[REDACTED]", text or "")


def wrangler(args):
    return subprocess.run(["npx", "--yes", "wrangler@4"] + args, capture_output=True, text=True)


def status():
    run = wrangler(["deployments", "status", "--json"])
    text = run.stdout or ""
    start = text.find("{")
    if start < 0:
        start = text.find("[")
    data = {}
    if start >= 0:
        try:
            data = json.loads(text[start:])
        except Exception as exc:
            data = {"parse": str(exc)}
    return run.returncode, data


def live_id(data):
    deps = data.get("deployments") if isinstance(data, dict) else None
    if deps is None and isinstance(data, list):
        deps = data
    if not isinstance(deps, list):
        return ""
    for dep in deps:
        versions = dep.get("versions") or []
        for ver in versions:
            if ver.get("percentage") == 100:
                return ver.get("version_id") or ""
    return ""


def ensure_account():
    if os.environ.get("CLOUDFLARE_ACCOUNT_ID"):
        return
    token = os.environ.get("CLOUDFLARE_API_TOKEN") or ""
    if not token:
        return
    import urllib.request
    req = urllib.request.Request(
        "https://api.cloudflare.com/client/v4/accounts?per_page=5",
        headers={"Authorization": "Bearer " + token},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    rows = data.get("result") or []
    if rows and rows[0].get("id"):
        os.environ["CLOUDFLARE_ACCOUNT_ID"] = rows[0]["id"]


def main():
    ensure_account()
    before_code, before = status()
    live_before = live_id(before)
    gate = subprocess.check_output(["openssl", "rand", "-hex", "16"], text=True).strip()
    alias = "bd" + gate[:10]
    src_path = os.path.join(PROXY, "worker.js")
    src = open(src_path, encoding="utf-8").read()
    needle = "    const url = new URL(request.url);\n"
    insert = needle + """    if (url.pathname === "/__bot_ban_diag") {
      if (request.headers.get("x-diag") !== %s) return new Response("no", { status: 404 });
      const token = getTelegramTokenWorker_(env);
      async function tg(method) {
        if (!token) return { http: 0, ok: false, error_code: null, description: "no_token" };
        const res = await fetch("https://api.telegram.org/bot" + token + "/" + method);
        let body = {};
        try { body = await res.json(); } catch (e) { body = { ok: false, description: "non_json" }; }
        const result = body && body.result ? body.result : {};
        return {
          http: res.status,
          ok: body.ok === true,
          error_code: body.error_code == null ? null : body.error_code,
          description: body.description || "",
          username: result.username || "",
          first_name: result.first_name || "",
          webhook_set: !!result.url,
          pending_update_count: result.pending_update_count == null ? null : result.pending_update_count,
          last_error_date: result.last_error_date || null,
          last_error_message: result.last_error_message || ""
        };
      }
      const payload = { getMe: await tg("getMe"), getWebhookInfo: await tg("getWebhookInfo") };
      return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
    }
""" % json.dumps(gate)
    if needle not in src:
        raise SystemExit("patch point missing")
    open(src_path, "w", encoding="utf-8").write(src.replace(needle, insert, 1))
    try:
        up = wrangler(["versions", "upload", "--keep-vars", "--preview-alias", alias, "--message", "readonly getMe preview"])
    finally:
        open(src_path, "w", encoding="utf-8").write(src)
    log = (up.stdout or "") + "\n" + (up.stderr or "")
    urls = re.findall(r"https://[a-z0-9.-]+\.workers\.dev", log)
    after_code, after = status()
    live_after = live_id(after)
    rolled = ""
    if live_before and live_after and live_before != live_after:
        rb = wrangler(["rollback", live_before, "--yes", "--message", "undo accidental diag deploy"])
        rolled = "rollback_exit_%s" % rb.returncode
    clean = wrangler(["versions", "upload", "--keep-vars", "--message", "version list back to current source"])
    _, final = status()
    live_final = live_id(final)
    api = None
    tries = []
    for url in urls:
        call = subprocess.run(
            ["curl", "-sS", "-m", "40", "-o", "/tmp/botdiag.body", "-w", "%{http_code}", "-H", "x-diag: " + gate, url + "/__bot_ban_diag"],
            capture_output=True, text=True,
        )
        body = ""
        if os.path.exists("/tmp/botdiag.body"):
            body = open("/tmp/botdiag.body", encoding="utf-8", errors="replace").read()
        host = url.split("//", 1)[-1].split("/")[0]
        if "getMe" in body or "error_code" in body:
            try:
                api = json.loads(body)
            except Exception:
                api = {"raw": body[:400]}
            break
        tries.append({"host": host, "http": (call.stdout or "").strip(), "head": body[:80]})
    report = {
        "upload_exit": up.returncode,
        "clean_upload_exit": clean.returncode,
        "upload_tail": redact(log)[-400:],
        "preview_host_count": len(urls),
        "alias_prefix": alias[:4],
        "live_before_tail": (live_before or "")[-8:],
        "live_after_tail": (live_after or "")[-8:],
        "live_final_tail": (live_final or "")[-8:],
        "live_same": bool(live_before) and live_before == live_final,
        "rolled_back": rolled,
        "status_before_exit": before_code,
        "status_after_exit": after_code,
        "curl_tries": tries,
        "api": api,
    }
    text = redact(json.dumps(report, ensure_ascii=False)).replace(gate, "[gate]")
    open(os.path.join(OUT, "preview.json"), "w", encoding="utf-8").write(text)
    print(text)


if __name__ == "__main__":
    main()
