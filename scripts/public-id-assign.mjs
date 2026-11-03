import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { planPublicIds_, publicIdPrefixOf_ } from "../boinya-c/proxy/cabinet-link.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const proxy = path.join(here, "..", "boinya-c", "proxy");
const BACKUP = "publicIdBackup:2026-10-23";
const ARRAY_KEYS = ["subscriptions", "items", "list"];
export const SQL_BUDGET = 70000;
const BATCH = 15;

export function sqlLit_(value) {
  return "'" + String(value == null ? "" : value).replace(/'/g, "''") + "'";
}

export function assertSqlBudget_(sql) {
  if (String(sql).length > SQL_BUDGET) throw new Error("sql too long " + String(sql).length);
}

export function assertArrayKey_(key) {
  if (ARRAY_KEYS.indexOf(key) < 0) throw new Error("bad array " + key);
}

export function subscriptionArrayKey_(list) {
  for (let i = 0; i < ARRAY_KEYS.length; i++) {
    if (list && Array.isArray(list[ARRAY_KEYS[i]])) return ARRAY_KEYS[i];
  }
  throw new Error("no subscriptions array");
}

export function rowSubId_(row) {
  return String((row && (row.subId || row.id)) || "");
}

function cell_(row, name) {
  if (!row) return undefined;
  if (row[name] != null && row[name] !== "") return row[name];
  const lower = name.toLowerCase();
  if (row[lower] != null && row[lower] !== "") return row[lower];
  return undefined;
}

export function remoteSubId_(row) {
  const sid = cell_(row, "subId");
  if (sid != null) return String(sid);
  const id = cell_(row, "id");
  return id == null ? "" : String(id);
}

export function idBySub_(plannedRows) {
  const bySub = Object.create(null);
  (plannedRows || []).forEach(function (s) {
    if (s && s.subId && s.publicId && publicIdPrefixOf_(s.publicId)) bySub[String(s.subId)] = String(s.publicId);
  });
  return bySub;
}

function wantAt_(spec, row, index) {
  if (Array.isArray(spec)) return String(spec[index] || "");
  const sid = rowSubId_(row);
  return String((sid && spec && spec[sid]) || "");
}

export function patchesForSubs_(subs, idBySub, arrayKey) {
  assertArrayKey_(arrayKey);
  const patches = [];
  (subs || []).forEach(function (s, index) {
    const publicId = wantAt_(idBySub, s, index);
    if (!publicId || !publicIdPrefixOf_(publicId)) return;
    if (String((s && s.publicId) || "") === publicId) return;
    patches.push({
      index: index,
      publicId: publicId,
      path: "$." + arrayKey + "[" + index + "].publicId",
      text: true
    });
  });
  return patches;
}

function jsonArg_(pair) {
  const raw = pair.publicId != null ? pair.publicId : pair.value;
  return sqlLit_(pair.path) + ", " + (pair.text === false ? String(Number(raw) || 0) : sqlLit_(raw));
}

function patchSectionSql_(cacheKey, section, obj, asText, batchSize) {
  const size = batchSize || BATCH;
  const keys = Object.keys(obj || {}).filter(function (k) {
    return k && (section === "seq" || publicIdPrefixOf_(obj[k]));
  });
  const out = [];
  for (let i = 0; i < keys.length; i += size) {
    const patchObj = {};
    keys.slice(i, i + size).forEach(function (k) {
      patchObj[k] = asText ? String(obj[k]) : (Number(obj[k]) || 0);
    });
    const sql =
      "UPDATE snap_cache SET payload = json_patch(payload, " +
      sqlLit_(JSON.stringify({ [section]: patchObj })) +
      ") WHERE cache_key = " +
      sqlLit_(cacheKey);
    assertSqlBudget_(sql);
    out.push(sql);
  }
  return out;
}

export function mapPatchStatements_(cacheKey, map, batchSize) {
  const src = map || {};
  return patchSectionSql_(cacheKey, "bySub", src.bySub, true, batchSize)
    .concat(patchSectionSql_(cacheKey, "byKey", src.byKey, true, batchSize))
    .concat(patchSectionSql_(cacheKey, "seq", src.seq, false, batchSize));
}

export function jsonSetStatements_(cacheKey, pairs, batchSize) {
  const size = batchSize || BATCH;
  const out = [];
  const list = pairs || [];
  for (let i = 0; i < list.length; i += size) {
    const chunk = list.slice(i, i + size);
    const sql =
      "UPDATE snap_cache SET payload = json_set(payload, " +
      chunk.map(jsonArg_).join(", ") +
      ") WHERE cache_key = " +
      sqlLit_(cacheKey);
    assertSqlBudget_(sql);
    out.push(sql);
  }
  return out;
}

export function mapSeedSql_(cacheKey, now) {
  const empty = '{"bySub":{},"byKey":{},"seq":{}}';
  const sql =
    "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES (" +
    sqlLit_(cacheKey) + ", " + sqlLit_(empty) + ", " + sqlLit_(now) +
    ") ON CONFLICT(cache_key) DO UPDATE SET payload = " + sqlLit_(empty) + ", updated_at = excluded.updated_at";
  assertSqlBudget_(sql);
  return sql;
}

export function copySnapSql_(fromKey, toKey) {
  const sql =
    "INSERT INTO snap_cache (cache_key, payload, updated_at) SELECT " +
    sqlLit_(toKey) + ", payload, updated_at FROM snap_cache WHERE cache_key = " + sqlLit_(fromKey) +
    " ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at";
  assertSqlBudget_(sql);
  return sql;
}

export function backupOnceSql_(fromKey, toKey) {
  const sql =
    "INSERT INTO snap_cache (cache_key, payload, updated_at) SELECT " +
    sqlLit_(toKey) + ", payload, updated_at FROM snap_cache WHERE cache_key = " + sqlLit_(fromKey) +
    " ON CONFLICT(cache_key) DO NOTHING";
  assertSqlBudget_(sql);
  return sql;
}

function identityKey_(row) {
  return [
    String((row && (row.matchKey || row.match_key)) || ""),
    String((row && (row.nick || row.client)) || ""),
    String((row && (row.sheet || row.segment)) || "")
  ].join("\u0000");
}

/** Код по subId. Без subId — только если пара ник+лист одна. */
export function wantPublicIds_(subs, plannedRows) {
  const bySub = idBySub_(plannedRows);
  const lone = new Map();
  const multi = new Set();
  (plannedRows || []).forEach(function (s) {
    if (rowSubId_(s)) return;
    const key = identityKey_(s);
    if (multi.has(key) || lone.has(key)) {
      lone.delete(key);
      multi.add(key);
      return;
    }
    if (s.publicId && publicIdPrefixOf_(s.publicId)) lone.set(key, String(s.publicId));
  });
  return (subs || []).map(function (s) {
    const sid = rowSubId_(s);
    if (sid && bySub[sid]) return bySub[sid];
    if (!sid && lone.has(identityKey_(s))) return lone.get(identityKey_(s));
    return String((s && s.publicId) || "");
  });
}

export function restoreSnapSql_(fromKey, toKey) {
  const sql =
    "UPDATE snap_cache SET payload = (SELECT payload FROM snap_cache WHERE cache_key = " + sqlLit_(fromKey) +
    "), updated_at = (SELECT updated_at FROM snap_cache WHERE cache_key = " + sqlLit_(fromKey) +
    ") WHERE cache_key = " + sqlLit_(toKey) +
    " AND EXISTS (SELECT 1 FROM snap_cache WHERE cache_key = " + sqlLit_(fromKey) + ")";
  assertSqlBudget_(sql);
  return sql;
}

export function deleteSnapSql_(key) {
  return "DELETE FROM snap_cache WHERE cache_key = " + sqlLit_(key);
}

export function idRowsSql_(arrayKey) {
  assertArrayKey_(arrayKey);
  return (
    "SELECT json_each.key AS idx, json_extract(json_each.value, '$.subId') AS subId, " +
    "json_extract(json_each.value, '$.id') AS id, json_extract(json_each.value, '$.publicId') AS publicId " +
    "FROM snap_cache, json_each(json_extract(payload, '$." + arrayKey + "')) " +
    "WHERE cache_key = 'listSubscriptions' ORDER BY CAST(json_each.key AS INTEGER)"
  );
}

export function assignmentMismatches_(remoteRows, subs, idBySub) {
  const bad = [];
  const rows = remoteRows || [];
  const list = subs || [];
  const map = idBySub || {};
  if (rows.length !== list.length) {
    return [{ index: -1, want: "len " + list.length, got: "len " + rows.length }];
  }
  for (let i = 0; i < list.length; i++) {
    const row = rows[i] || {};
    const idx = cell_(row, "idx");
    if (Number(idx) !== i) bad.push({ index: i, want: "idx " + i, got: "idx " + idx });
    const sid = rowSubId_(list[i]);
    const gotSid = remoteSubId_(row);
    if (sid !== gotSid) bad.push({ index: i, want: "sub " + sid, got: "sub " + gotSid });
    const wantPid = Array.isArray(idBySub)
      ? String(idBySub[i] || "")
      : ((sid && map[sid]) || String((list[i] && list[i].publicId) || ""));
    const gotRaw = cell_(row, "publicId");
    const gotPid = gotRaw == null ? "" : String(gotRaw);
    if ((wantPid || "") !== gotPid) bad.push({ index: i, want: wantPid, got: gotPid });
    if (bad.length > 5) break;
  }
  return bad;
}

export function prefixTotals_(rows) {
  const totals = { ПП: 0, РЗ: 0, БП: 0, АФК: 0, ПАРТ: 0 };
  (rows || []).forEach(function (row) {
    const prefix = publicIdPrefixOf_(cell_(row, "publicId"));
    if (prefix && totals[prefix] != null) totals[prefix] += 1;
  });
  return totals;
}

function printOf(rows, cols) {
  return rows
    .map(function (r) {
      return cols.map(function (c) { return String(r[c] == null ? "" : r[c]); }).join("|");
    })
    .sort()
    .join("\n");
}

function outDir() {
  const dir = process.env.GITHUB_WORKSPACE
    ? path.join(process.env.GITHUB_WORKSPACE, "artifacts", "public-id-assign")
    : path.join(here, "..", "artifacts", "public-id-assign");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function d1(sql, name) {
  assertSqlBudget_(sql);
  const dir = outDir();
  const sqlPath = path.join(dir, name + ".sql");
  fs.writeFileSync(sqlPath, sql);
  const cmd = ["npx", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql];
  const proc = spawnSync(cmd[0], cmd.slice(1), { cwd: proxy, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const text = String(proc.stdout || "");
  fs.writeFileSync(path.join(dir, name + ".json"), text);
  fs.writeFileSync(path.join(dir, name + ".err"), String(proc.stderr || ""));
  if (proc.status !== 0 || !text.trim()) {
    throw new Error("wrangler " + name + " rc=" + proc.status + " " + text.slice(0, 300) + " " + String(proc.stderr || "").slice(-400));
  }
  let i = 0;
  while (i < text.length && text[i] !== "[" && text[i] !== "{") i += 1;
  const data = JSON.parse(text.slice(i));
  const blocks = Array.isArray(data) ? data : [data];
  blocks.forEach(function (block, n) {
    if (block && block.success === false) throw new Error("wrangler " + name + " block " + n + " failed");
  });
  return blocks;
}

function results(blocks) {
  const block = blocks && blocks[0];
  return (block && block.results) || [];
}

function runSql(statements, prefix) {
  const list = statements || [];
  list.forEach(function (sql, i) {
    assertSqlBudget_(sql);
    if (i % 10 === 0) console.log(prefix + " " + (i + 1) + "/" + list.length);
    d1(sql, prefix + "-" + i);
  });
}

function main() {
  const dir = outDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-") + "-" + process.pid;
  const runBackup = "publicIdBackup:run:" + stamp;
  const mapBackup = "publicIdMapBackup:run:" + stamp;
  const nextKey = "clientPublicIdsNext";
  let dirty = false;

  const ordersBefore = results(d1("SELECT id, match_key, status, updated_at FROM orders ORDER BY id", "orders-before"));
  const subsBefore = results(d1("SELECT id, nick, sheet, status FROM subs ORDER BY id", "subs-before"));
  const orderPrint = printOf(ordersBefore, ["id", "match_key", "status", "updated_at"]);
  const subPrint = printOf(subsBefore, ["id", "nick", "sheet", "status"]);
  fs.writeFileSync(path.join(dir, "orders-before.txt"), orderPrint);
  fs.writeFileSync(path.join(dir, "subs-before.txt"), subPrint);

  const snapRows = results(d1("SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'", "snap-before"));
  if (!snapRows.length || snapRows[0].payload == null || snapRows[0].payload === "") throw new Error("no listSubscriptions");
  let list = snapRows[0].payload;
  if (typeof list === "string") list = JSON.parse(list);
  const arrayKey = subscriptionArrayKey_(list);
  const subs = list[arrayKey];

  d1(backupOnceSql_("listSubscriptions", BACKUP), "backup");
  d1(
    "INSERT INTO snap_cache (cache_key, payload, updated_at) SELECT " + sqlLit_(runBackup) +
      ", payload, updated_at FROM snap_cache WHERE cache_key = 'listSubscriptions'",
    "backup-run"
  );
  d1(
    "INSERT INTO snap_cache (cache_key, payload, updated_at) SELECT " + sqlLit_(mapBackup) +
      ", payload, updated_at FROM snap_cache WHERE cache_key = 'clientPublicIds'",
    "backup-map"
  );
  const lens = results(d1(
    "SELECT cache_key, length(payload) AS n FROM snap_cache WHERE cache_key IN (" +
      sqlLit_("listSubscriptions") + ", " + sqlLit_(runBackup) + ")",
    "backup-len"
  ));
  const lenLive = lens.filter(function (r) { return cell_(r, "cache_key") === "listSubscriptions"; })[0];
  const lenBack = lens.filter(function (r) { return cell_(r, "cache_key") === runBackup; })[0];
  if (!lenLive || !lenBack || Number(cell_(lenLive, "n")) !== Number(cell_(lenBack, "n")) || Number(cell_(lenLive, "n")) < 2) {
    throw new Error("копия списка не совпала по длине");
  }

  let map = { bySub: {}, byKey: {}, seq: {} };
  try {
    const mapRows = results(d1("SELECT payload FROM snap_cache WHERE cache_key = 'clientPublicIds'", "map-before"));
    if (mapRows[0] && mapRows[0].payload) {
      map = typeof mapRows[0].payload === "string" ? JSON.parse(mapRows[0].payload) : mapRows[0].payload;
    }
  } catch (eMap) {
    map = { bySub: {}, byKey: {}, seq: {} };
  }
  const planned = planPublicIds_(
    subs.map(function (s) {
      return {
        subId: rowSubId_(s),
        matchKey: String((s && (s.matchKey || s.match_key)) || ""),
        sheet: String((s && (s.sheet || s.segment)) || ""),
        nick: String((s && (s.nick || s.client)) || ""),
        publicId: String((s && s.publicId) || "")
      };
    }),
    map
  );
  const plannedIds = wantPublicIds_(subs, planned.subscriptions);
  const beforeIds = idBySub_(subs.map(function (s) {
    return { subId: rowSubId_(s), publicId: String((s && s.publicId) || "") };
  }));
  const remoteBefore = results(d1(idRowsSql_(arrayKey), "ids-before"));
  const drifted = assignmentMismatches_(remoteBefore, subs, beforeIds);
  if (drifted.length) throw new Error("список подписок изменился после чтения, запись остановлена");

  const now = new Date().toISOString();
  const patches = patchesForSubs_(subs, plannedIds, arrayKey);
  console.log("array=" + arrayKey + " subs=" + subs.length + " patch=" + patches.length);

  function restore() {
    d1(restoreSnapSql_(runBackup, "listSubscriptions"), "restore-subs");
    const mapBack = results(d1("SELECT cache_key FROM snap_cache WHERE cache_key = " + sqlLit_(mapBackup), "map-backup-exists"));
    if (mapBack.length) d1(restoreSnapSql_(mapBackup, "clientPublicIds"), "restore-map");
    else d1(deleteSnapSql_("clientPublicIds"), "drop-map");
    d1(deleteSnapSql_(nextKey), "drop-next");
  }

  try {
    runSql([mapSeedSql_(nextKey, now)].concat(mapPatchStatements_(nextKey, planned.map, BATCH)), "write-map");
    dirty = true;
    d1(copySnapSql_(nextKey, "clientPublicIds"), "publish-map");
    runSql(jsonSetStatements_("listSubscriptions", patches, BATCH), "write-subs");
    d1("UPDATE snap_cache SET updated_at = " + sqlLit_(now) + " WHERE cache_key = 'listSubscriptions'", "touch-subs");

    const remoteAfter = results(d1(idRowsSql_(arrayKey), "ids-after"));
    const bad = assignmentMismatches_(remoteAfter, subs, plannedIds);
    if (bad.length) throw new Error("коды не совпали со сверкой, список возвращён " + JSON.stringify(bad));
    const ordersAfter = results(d1("SELECT id, match_key, status, updated_at FROM orders ORDER BY id", "orders-after"));
    const subsAfter = results(d1("SELECT id, nick, sheet, status FROM subs ORDER BY id", "subs-after"));
    const orderAfter = printOf(ordersAfter, ["id", "match_key", "status", "updated_at"]);
    const subAfter = printOf(subsAfter, ["id", "nick", "sheet", "status"]);
    if (orderAfter !== orderPrint || subAfter !== subPrint) throw new Error("сверка не сошлась, список подписок возвращён");
    dirty = false;
    d1(deleteSnapSql_(nextKey), "drop-next-ok");
    const issued = { ПП: 0, РЗ: 0, БП: 0, АФК: 0, ПАРТ: 0 };
    patches.forEach(function (p) {
      const prefix = publicIdPrefixOf_(p.publicId);
      if (prefix) issued[prefix] += 1;
    });
    const summary = {
      backup: BACKUP,
      runBackup: runBackup,
      issued: issued,
      planned: planned.issued,
      totals: prefixTotals_(remoteAfter),
      patched: patches.length,
      orders: ordersBefore.length,
      subs: subsBefore.length,
      ordersMatch: true,
      subsMatch: true
    };
    fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } catch (err) {
    if (dirty) {
      try { restore(); } catch (restoreErr) { console.error(restoreErr); }
    } else {
      try { d1(deleteSnapSql_(nextKey), "drop-next-fail"); } catch (dropErr) { console.error(dropErr); }
    }
    throw err;
  }
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
