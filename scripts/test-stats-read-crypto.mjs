// node scripts/test-stats-read-crypto.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BEGIN, END, encryptFor, decryptWith } from "./stats-read-encrypted.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const pub = publicKey.export({ type: "spki", format: "pem" });
const priv = privateKey.export({ type: "pkcs8", format: "pem" });
const sample = { months: { "2026-09": { data: { status: "success", formula: { N: 3, S: 1.5 } } } }, ru: "отвёз" };

const blob = encryptFor(pub, sample);
assert.equal(blob.indexOf("отвёз"), -1);
assert.deepEqual(decryptWith(priv, blob), sample);

// tamper -> GCM fails
const env = JSON.parse(Buffer.from(blob, "base64").toString("utf8"));
env.ct = Buffer.from(Buffer.from(env.ct, "base64").map((x, i) => (i === 0 ? x ^ 1 : x))).toString("base64");
assert.throws(() => decryptWith(priv, Buffer.from(JSON.stringify(env)).toString("base64")));

// committed public key is a valid RSA key and is not a private key
const committed = fs.readFileSync(path.join(here, "keys", "stats-read.pub.pem"), "utf8");
assert.match(committed, /BEGIN PUBLIC KEY/);
assert.doesNotMatch(committed, /PRIVATE/);
assert.ok(encryptFor(committed, { ok: 1 }).length > 100);

// decrypt helper reads an Actions-style log with timestamps
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sr-"));
const logLines = ["2026-10-02T13:40:00.0000000Z month 2026-09: ok", "2026-10-02T13:40:00.1000000Z " + BEGIN];
for (let i = 0; i < blob.length; i += 1000) logLines.push("2026-10-02T13:40:00.2000000Z " + blob.slice(i, i + 1000));
logLines.push("2026-10-02T13:40:00.3000000Z " + END);
fs.writeFileSync(path.join(dir, "job.log"), logLines.join("\n"));
fs.writeFileSync(path.join(dir, "k.pem"), priv);
const outText = execFileSync(process.execPath, [path.join(here, "stats-read-decrypt.mjs"), path.join(dir, "job.log"), path.join(dir, "k.pem")], { encoding: "utf8" });
assert.deepEqual(JSON.parse(outText), sample);
fs.rmSync(dir, { recursive: true, force: true });

// no secret -> exit 3, prints nothing sensitive
let code = 0;
let printed = "";
try {
  printed = execFileSync(process.execPath, [path.join(here, "stats-read-encrypted.mjs")], { encoding: "utf8", env: { PATH: process.env.PATH } });
} catch (e) { code = e.status; printed = String(e.stdout || ""); }
assert.equal(code, 3);
assert.match(printed, /secret_missing/);

console.log("stats-read crypto: ok");
