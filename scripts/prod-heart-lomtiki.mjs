#!/usr/bin/env node
/**
 * Production heart «Целое»→«Ломтики» on D1 snap listSubscriptions.
 * Mirrors previewHeartNormalize_ / scripts/preview-heart-lomtiki.mjs logic,
 * but uses Cloudflare D1 API (previewHeartNormalize is preview_only).
 *
 * Usage (needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID):
 *   node scripts/prod-heart-lomtiki.mjs dry-run
 *   node scripts/prod-heart-lomtiki.mjs apply   # only after owner «да»
 *   node scripts/prod-heart-lomtiki.mjs verify
 *   node scripts/prod-heart-lomtiki.mjs rollback
 *
 * Apply 2026-11-14 (t561s2624): 17 cards / 19 lines; backup
 * /opt/cursor/artifacts/heartLomtikiBackup-2026-11-14.json
 * + D1 snap_cache key heartLomtikiBackup.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "390357cec5b74985576a04dbc68d5694";
const DB = process.env.BOINYA_D1_ID || "8ab3668c-a654-432c-9ebd-a1ac5c4db800";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
const mode = String(process.argv[2] || "dry-run").toLowerCase();
const OUT = process.env.HEART_OUT || "/opt/cursor/artifacts";

if (!TOKEN) {
  console.error("Need CLOUDFLARE_API_TOKEN");
  process.exit(2);
}

async function d1(sql, params) {
  const body = params ? { sql, params } : { sql };
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );
  const json = await res.json();
  if (!json.success) throw new Error(JSON.stringify(json.errors || json));
  return (json.result && json.result[0] && json.result[0].results) || [];
}

function heartHits(sub) {
  const hits = [];
  for (const k of ["basket", "basket2", "basketBp1", "basketBp2"]) {
    const arr = sub[k];
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      if (!it) continue;
      const main = String(it.main || it.name || "");
      const subFrac = String(it.sub || "").trim();
      if (/сердц/i.test(main) && /^цел/i.test(subFrac)) {
        hits.push({
          nick: String(sub.nick || sub.label || ""),
          sheet: String(sub.sheet || ""),
          basketKey: k,
          index: i,
          main,
          sub: subFrac
        });
      }
    }
  }
  return hits;
}

function normalizeHeart(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map((it) => {
    if (!it || typeof it !== "object") return it;
    const main = String(it.main || it.name || "");
    const sub = String(it.sub || "").trim();
    if (!/сердц/i.test(main) || !/^цел/i.test(sub)) return it;
    return Object.assign({}, it, { sub: "Ломтики" });
  });
}

function nonHeartFp(list) {
  const out = [];
  for (const sub of list) {
    if (!sub) continue;
    for (const k of ["basket", "basket2", "basketBp1", "basketBp2"]) {
      const arr = sub[k];
      if (!Array.isArray(arr)) continue;
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        if (!it) continue;
        const main = String(it.main || it.name || "");
        if (/сердц/i.test(main)) continue;
        out.push(
          [
            String(sub.nick || ""),
            String(sub.sheet || ""),
            k,
            i,
            main,
            String(it.sub || ""),
            String(it.val != null ? it.val : it.value != null ? it.value : "")
          ].join("|")
        );
      }
    }
  }
  return out.sort().join("\n");
}

async function loadSubs() {
  const rows = await d1("SELECT payload, updated_at FROM snap_cache WHERE cache_key = 'listSubscriptions'");
  let payload = rows[0] && rows[0].payload;
  if (typeof payload === "string") payload = JSON.parse(payload);
  return { payload, updatedAt: rows[0] && rows[0].updated_at };
}

async function main() {
  if (mode === "rollback") {
    const bakRows = await d1("SELECT payload FROM snap_cache WHERE cache_key = 'heartLomtikiBackup'");
    let bak = bakRows[0] && bakRows[0].payload;
    if (typeof bak === "string") bak = JSON.parse(bak);
    if (!bak || !Array.isArray(bak.subscriptions)) throw new Error("no_backup");
    const next = {
      status: "success",
      subscriptions: bak.subscriptions,
      cachedAt: new Date().toISOString(),
      restoredFrom: "heartLomtikiBackup",
      restoredAt: bak.at || null
    };
    await d1(
      "UPDATE snap_cache SET payload = ?, updated_at = ? WHERE cache_key = 'listSubscriptions'",
      [JSON.stringify(next), next.cachedAt]
    );
    console.log(JSON.stringify({ status: "success", mode: "rollback", restored: bak.subscriptions.length }, null, 2));
    return;
  }

  const { payload, updatedAt } = await loadSubs();
  const subs = Array.isArray(payload && payload.subscriptions) ? payload.subscriptions : [];
  const affected = [];
  for (const s of subs) {
    const hits = heartHits(s);
    if (hits.length) affected.push({ nick: String(s.nick || s.label || ""), sheet: String(s.sheet || ""), hits });
  }
  const hitLines = affected.reduce((a, c) => a + c.hits.length, 0);

  if (mode === "dry-run" || mode === "verify") {
    const out = {
      status: "success",
      mode,
      totalSubs: subs.length,
      affectedCards: affected.length,
      hitLines,
      remainingWholeHearts: hitLines,
      affected
    };
    fs.writeFileSync(path.join(OUT, `heart-prod-${mode}.json`), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    if (mode === "verify" && hitLines !== 0) process.exit(1);
    return;
  }

  if (mode !== "apply") throw new Error("bad_mode");

  const beforeFp = nonHeartFp(subs);
  const backup = {
    at: new Date().toISOString(),
    source: "prod-d1-boinya-c",
    updatedAtBefore: updatedAt || null,
    subscriptions: JSON.parse(JSON.stringify(subs)),
    affected,
    nonHeartFp: beforeFp
  };
  const bakPath = path.join(OUT, `heartLomtikiBackup-${backup.at.slice(0, 10)}.json`);
  const compact = JSON.stringify(backup);
  fs.writeFileSync(bakPath, JSON.stringify(backup, null, 2));
  const sha = crypto.createHash("sha256").update(compact).digest("hex");
  fs.writeFileSync(
    bakPath.replace(/\.json$/, ".sha256.json"),
    JSON.stringify({ path: bakPath, sha256_compact: sha, bytes: Buffer.byteLength(compact) }, null, 2)
  );
  await d1(
    "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at",
    ["heartLomtikiBackup", compact, backup.at]
  );

  let changedCards = 0;
  let changedLines = 0;
  for (const sub of subs) {
    const hits = heartHits(sub);
    if (!hits.length) continue;
    for (const k of ["basket", "basket2", "basketBp1", "basketBp2"]) {
      if (Array.isArray(sub[k])) sub[k] = normalizeHeart(sub[k]);
    }
    changedCards += 1;
    changedLines += hits.length;
  }
  const next = Object.assign({}, payload || {}, {
    status: "success",
    subscriptions: subs,
    cachedAt: new Date().toISOString(),
    heartLomtikiAt: new Date().toISOString(),
    heartLomtikiChanged: changedCards,
    heartLomtikiLines: changedLines
  });
  await d1(
    "UPDATE snap_cache SET payload = ?, updated_at = ? WHERE cache_key = 'listSubscriptions'",
    [JSON.stringify(next), next.heartLomtikiAt]
  );

  const after = await loadSubs();
  const afterSubs = (after.payload && after.payload.subscriptions) || [];
  let remaining = 0;
  for (const s of afterSubs) remaining += heartHits(s).length;
  const result = {
    status: "success",
    mode: "apply",
    changedCards,
    changedLines,
    remainingWholeHearts: remaining,
    nonHeartUnchanged: beforeFp === nonHeartFp(afterSubs),
    backupPath: bakPath,
    sha256_compact: sha,
    rollback_cmd: "node scripts/prod-heart-lomtiki.mjs rollback"
  };
  fs.writeFileSync(path.join(OUT, "heart-prod-apply.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (remaining !== 0 || result.nonHeartUnchanged !== true) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
