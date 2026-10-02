/**
 * Read-only month stats, encrypted for the owner's box.
 *
 * Calls Apps Script getExpectedProfit (from/to range) for each month.
 * It returns the formula rollup (collectFormulaRollup_: money only after «отвёз»,
 * ПП price once on the paid slot). getStats is NOT called: it upserts a month
 * snapshot row in Sheets. Nothing goes through the Worker, so D1 is not touched.
 *
 * The repo is public, so the job log is public. The script prints only
 * month status codes and one base64 envelope:
 *   RSA-OAEP(SHA-256) wraps a random AES-256-GCM key; the private key lives
 *   only on the owner's box. Decrypt with scripts/stats-read-decrypt.mjs.
 *
 *   GAS_SHARED_SECRET=… node scripts/stats-read-encrypted.mjs
 *   MONTHS=2026-09,2026-10  PUBKEY=scripts/keys/stats-read.pub.pem
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const GAS_URL = process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec";
const PUBKEY = process.env.PUBKEY || path.join(here, "keys", "stats-read.pub.pem");
const MONTHS = String(process.env.MONTHS || "2026-09,2026-10")
  .split(/[,\s]+/).map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}$/.test(s));
const READ_ONLY_ACTIONS = new Set(["getExpectedProfit"]);

export const BEGIN = "-----BEGIN STATS-READ-----";
export const END = "-----END STATS-READ-----";

export function encryptFor(publicPem, obj) {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(obj), "utf8");
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ek = crypto.publicEncrypt(
    { key: publicPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    key
  );
  const env = {
    v: 1,
    alg: "RSA-OAEP-256+A256GCM",
    ek: ek.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64")
  };
  return Buffer.from(JSON.stringify(env), "utf8").toString("base64");
}

export function decryptWith(privatePem, b64) {
  const env = JSON.parse(Buffer.from(String(b64).replace(/\s+/g, ""), "base64").toString("utf8"));
  if (env.v !== 1 || env.alg !== "RSA-OAEP-256+A256GCM") throw new Error("bad_envelope");
  const key = crypto.privateDecrypt(
    { key: privatePem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(env.ek, "base64")
  );
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(env.iv, "base64"));
  d.setAuthTag(Buffer.from(env.tag, "base64"));
  const plain = Buffer.concat([d.update(Buffer.from(env.ct, "base64")), d.final()]);
  return JSON.parse(plain.toString("utf8"));
}

function monthRange(mk, todayIso) {
  const y = Number(mk.slice(0, 4));
  const m = Number(mk.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let to = mk + "-" + String(last).padStart(2, "0");
  if (todayIso && to > todayIso) to = todayIso;
  return { from: mk + "-01", to };
}

function unwrap(text) {
  const s = String(text || "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
}

async function readAction(action, params, secret) {
  if (!READ_ONLY_ACTIONS.has(action)) throw new Error("not_read_only:" + action);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 240000);
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action }, params, { _wk: secret }))
    });
    const text = await res.text();
    const json = unwrap(text);
    return { http: res.status, json };
  } catch (e) {
    return { http: 0, json: null, error: String((e && e.name) || "fetch_failed") };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const secret = String(process.env.GAS_SHARED_SECRET || "").trim();
  if (!secret) {
    console.log("secret_missing: GAS_SHARED_SECRET is empty");
    process.exitCode = 3;
    return;
  }
  const pub = fs.readFileSync(PUBKEY, "utf8");
  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Minsk", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  const out = { fetchedAt: new Date().toISOString(), todayIso, action: "getExpectedProfit", months: {} };
  for (const mk of MONTHS) {
    const range = monthRange(mk, todayIso);
    const t0 = Date.now();
    const got = await readAction("getExpectedProfit", range, secret);
    const st = (got.json && got.json.status) || "no_json";
    console.log("month " + mk + ": http " + got.http + " status " + (st === "success" ? "success" : "error") +
      " " + Math.round((Date.now() - t0) / 1000) + "s");
    out.months[mk] = { range, http: got.http, error: got.error || "", data: got.json };
  }
  const blob = encryptFor(pub, out);
  if (blob.indexOf(secret) >= 0) throw new Error("leak_guard");
  console.log(BEGIN);
  for (let i = 0; i < blob.length; i += 1000) console.log(blob.slice(i, i + 1000));
  console.log(END);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.log("failed: " + String((e && e.message) || "error").slice(0, 80));
    process.exitCode = 1;
  });
}
