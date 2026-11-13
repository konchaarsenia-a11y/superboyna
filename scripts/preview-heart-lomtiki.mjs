#!/usr/bin/env node
/**
 * Preview-only: сердце «Целое» → «Ломтики» на копии D1.
 * Usage:
 *   node scripts/preview-heart-lomtiki.mjs dry-run
 *   node scripts/preview-heart-lomtiki.mjs apply
 *   node scripts/preview-heart-lomtiki.mjs verify
 *   node scripts/preview-heart-lomtiki.mjs rollback
 * NEVER against prod worker.
 */
import fs from "node:fs";

const PREV = process.env.PREVIEW_URL || "https://boinya-c-preview-eabc.konchaarsenia.workers.dev";
const PROD = "https://boinya-c.konchaarsenia.workers.dev";
const mode = String(process.argv[2] || "dry-run").toLowerCase();
const OUT = `/opt/cursor/artifacts/heart-lomtiki-${mode}.json`;

if (/prod|boinya-c\.konchaarsenia/i.test(PREV) && !/preview/i.test(PREV)) {
  console.error("REFUSE: PREVIEW_URL looks like prod");
  process.exit(2);
}

async function api(action, params = {}, initData) {
  const body = Object.assign({ action, cutover: 1 }, params);
  if (initData) body.initData = initData;
  const res = await fetch(PREV + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { status: "error", message: "bad_json", raw: text.slice(0, 300), http: res.status };
  }
  json._http = res.status;
  return json;
}

async function main() {
  const ping = await api("ping", {});
  if (ping.previewIsolated !== true) {
    console.error("REFUSE: previewIsolated!=true", ping);
    process.exit(2);
  }
  // Guard: never call prod accidentally
  const prodPing = await fetch(PROD + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "ping", cutover: 1 })
  }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  if (prodPing && prodPing.previewIsolated === true) {
    console.error("unexpected: prod marked previewIsolated");
  }

  const mint = await api("previewMintInitData", { telegramId: "650923866" });
  if (mint.status !== "success" || !mint.initData) {
    console.error("mint failed", mint);
    process.exit(1);
  }
  const res = await api("previewHeartNormalize", { mode }, mint.initData);
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), preview: PREV, mode, res }, null, 2));
  console.log(JSON.stringify({ mode, status: res.status, changedCards: res.changedCards, affectedCards: res.affectedCards, remainingWholeHearts: res.remainingWholeHearts, nonHeartUnchanged: res.nonHeartUnchanged, out: OUT }, null, 2));
  if (res.status !== "success") process.exit(1);
  if (mode === "apply" && res.nonHeartUnchanged === false) {
    console.error("FAIL: non-heart baskets changed");
    process.exit(1);
  }
  if ((mode === "verify" || mode === "apply") && Number(res.remainingWholeHearts) > 0) {
    console.error("FAIL: remaining whole hearts", res.remainingWholeHearts);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
