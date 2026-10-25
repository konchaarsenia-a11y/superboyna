/**
 * Копия gbUsers/gbLinks/gbPets и отдельный снимок gbTestClient.
 * Общие снимки, заказы, подписки и чужие строки не переписываются.
 * В лог попадают только id теста и имя копии.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { planGbTestClient_ } from "../boinya-c/proxy/cabinet-link.js";

const proxyDir = fileURLToPath(new URL("../boinya-c/proxy/", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "gb-test-"));

function rowsOf(text) {
  const data = JSON.parse(text);
  const blocks = Array.isArray(data) ? data : [data];
  const out = [];
  blocks.forEach(function (block) {
    if (block && Array.isArray(block.results)) out.push.apply(out, block.results);
  });
  return out;
}

function d1(sql) {
  const file = join(dir, "q.sql");
  writeFileSync(file, sql, "utf8");
  const out = execFileSync(
    "npx",
    ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--file", file],
    { cwd: proxyDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  return rowsOf(out);
}

function sqlStr(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function snap(row) {
  if (!row || !row.payload) return {};
  try {
    return JSON.parse(row.payload);
  } catch (e) {
    return {};
  }
}

function listOf(body, key) {
  return Array.isArray(body && body[key]) ? body[key] : [];
}

function nickHits(body, nick) {
  const subs = (body && (body.subscriptions || body.items || body.list)) || [];
  const want = String(nick || "").toLowerCase();
  let n = 0;
  if (!Array.isArray(subs)) return 0;
  subs.forEach(function (row) {
    const name = String((row && (row.nick || row.client || row.name)) || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
    if (name && name === want) n += 1;
  });
  return n;
}

const snaps = d1(
  "SELECT cache_key, updated_at, payload FROM snap_cache WHERE cache_key IN ('gbUsers','gbLinks','gbPets','listSubscriptions','gbTestClient')"
);
const byKey = Object.create(null);
const touched = Object.create(null);
snaps.forEach(function (row) {
  byKey[row.cache_key] = snap(row);
  touched[row.cache_key] = String(row.updated_at || "");
});
const counts = d1(
  "SELECT " +
    "(SELECT COUNT(*) FROM clients WHERE lower(replace(trim(nick), '@', '')) = 'arseniyhotko') AS c_hotko, " +
    "(SELECT COUNT(*) FROM clients WHERE lower(replace(trim(nick), '@', '')) = 'arseniyhotko_test') AS c_test, " +
    "(SELECT COUNT(*) FROM subs WHERE lower(replace(trim(nick), '@', '')) = 'arseniyhotko') AS s_hotko, " +
    "(SELECT COUNT(*) FROM subs WHERE lower(replace(trim(nick), '@', '')) = 'arseniyhotko_test') AS s_test, " +
    "(SELECT COUNT(*) FROM orders WHERE match_key = 'TEST:ARSENIY' OR lower(trim(client)) IN ('arseniyhotko','arseniyhotko_test','арсений хотько')) AS o_hit"
);
const count = counts[0] || {};
const now = new Date().toISOString();
const crm = {
  arseniyhotko: Number(count.c_hotko || 0) + Number(count.s_hotko || 0) + nickHits(byKey.listSubscriptions, "arseniyhotko"),
  arseniyhotko_test: Number(count.c_test || 0) + Number(count.s_test || 0) + nickHits(byKey.listSubscriptions, "arseniyhotko_test"),
  now: now
};
const plan = planGbTestClient_(
  {
    users: listOf(byKey.gbUsers, "users"),
    links: listOf(byKey.gbLinks, "links"),
    pets: listOf(byKey.gbPets, "pets")
  },
  crm
);
if (plan.action !== "write") {
  console.log("abort=" + (plan.reason || "no"));
  console.log("ordersHit=" + Number(count.o_hit || 0));
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}
const extra = JSON.stringify(plan.extra);
if (extra.indexOf(";") >= 0) {
  console.log("abort=payload");
  process.exit(1);
}
const stamp = now.replace(/[-:]/g, "").replace(/\.\d+/, "");
const backup = "gbTestBackup:arseniy:" + stamp;
["gbUsers", "gbLinks", "gbPets"].forEach(function (key) {
  d1(
    "INSERT INTO snap_cache (cache_key, payload, updated_at) " +
      "SELECT " + sqlStr(backup + ":" + key) + ", payload, updated_at FROM snap_cache WHERE cache_key = " + sqlStr(key) +
      " ON CONFLICT(cache_key) DO NOTHING"
  );
});
d1(
  "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES (" +
    sqlStr("gbTestClient") + ", " + sqlStr(extra) + ", " + sqlStr(now) +
    ") ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
);
const after = d1(
  "SELECT cache_key, updated_at, CASE WHEN cache_key = 'gbTestClient' OR cache_key LIKE 'gbTestBackup:arseniy:%' THEN payload ELSE '' END AS payload " +
    "FROM snap_cache WHERE cache_key IN ('gbUsers','gbLinks','gbPets','gbTestClient') OR cache_key LIKE " + sqlStr(backup + ":%")
);
const afterTouch = Object.create(null);
const afterBody = Object.create(null);
after.forEach(function (row) {
  afterTouch[row.cache_key] = String(row.updated_at || "");
  if (row.payload) afterBody[row.cache_key] = snap(row);
});
const sharedSame = ["gbUsers", "gbLinks", "gbPets"].every(function (key) {
  return afterTouch[key] === touched[key];
});
const copies = ["gbUsers", "gbLinks", "gbPets"].filter(function (key) { return !!afterBody[backup + ":" + key]; });
const saved = afterBody.gbTestClient || {};
const ordersAfter = d1(
  "SELECT COUNT(*) AS n FROM orders WHERE match_key = 'TEST:ARSENIY' OR lower(trim(client)) IN ('arseniyhotko','arseniyhotko_test','арсений хотько')"
);
const ordersN = Number((ordersAfter[0] && ordersAfter[0].n) || 0);
const missingCopy = ["gbUsers", "gbLinks", "gbPets"].filter(function (key) {
  return touched[key] != null && !afterBody[backup + ":" + key];
});
if (missingCopy.length || !sharedSame || !saved.user || saved.user.userId !== plan.userId || ordersN !== Number(count.o_hit || 0)) {
  console.log("abort=verify");
  console.log("backup=" + backup);
  console.log("sharedSame=" + (sharedSame ? "1" : "0"));
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}
console.log("backup=" + backup);
console.log("backupKeys=" + copies.join(","));
console.log("userId=" + plan.userId);
console.log("telegramId=" + plan.telegramId);
console.log("loginNick=" + plan.loginNick);
console.log("reason=" + plan.reason);
console.log("dog=Тест");
console.log("delivery=2026-11-02");
console.log("ordersSame=" + ordersN);
console.log("sharedUntouched=1");
rmSync(dir, { recursive: true, force: true });
