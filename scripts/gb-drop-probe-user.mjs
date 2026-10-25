/**
 * Снимает одну служебную строку gbUsers, которую создал проверочный gbMe.
 * Чужие пользователи, связки, питомцы, заказы и gbTestClient не меняет.
 * В лог не попадают телефоны и чужие записи.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const proxyDir = fileURLToPath(new URL("../boinya-c/proxy/", import.meta.url));
const PROBE_TID = "web_probe_do_not_save";
const PROBE_UID = "u_mvoh0kb81wl1";

function balancedJson(raw, start) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw.charAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === "\"") inStr = false;
      continue;
    }
    if (ch === "\"") {
      inStr = true;
      continue;
    }
    if (ch === "[" || ch === "{") depth += 1;
    else if (ch === "]" || ch === "}") {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return "";
}

function extractJson(text) {
  const raw = String(text || "");
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charAt(i);
    if (ch !== "[" && ch !== "{") continue;
    const slice = balancedJson(raw, i);
    if (!slice) continue;
    try {
      return JSON.parse(slice);
    } catch (e) {}
  }
  throw new Error("d1: no json");
}

function rowsOf(text) {
  const data = extractJson(text);
  const blocks = Array.isArray(data) ? data : [data];
  const out = [];
  blocks.forEach(function (block) {
    if (block && Array.isArray(block.results)) out.push.apply(out, block.results);
  });
  return out;
}

function d1(sql) {
  const run = spawnSync(
    "npx",
    ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: proxyDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: process.env }
  );
  if (run.status !== 0) {
    const line = String(run.stderr || run.stdout || "")
      .split("\n")
      .map(function (row) { return row.trim(); })
      .filter(function (row) { return row && !/INSERT|SELECT|UPDATE|payload|cache_key/i.test(row); })[0] || "d1_fail";
    console.log(line.slice(0, 180));
    throw new Error("d1_fail");
  }
  return rowsOf(run.stdout);
}

function sqlStr(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function snap(row) {
  if (!row || row.payload == null || row.payload === "") return {};
  let value = row.payload;
  if (typeof value === "object") return value;
  try {
    value = JSON.parse(value);
  } catch (e) {
    return {};
  }
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (e2) {
      return {};
    }
  }
  return value && typeof value === "object" ? value : {};
}

function listOf(body, key) {
  return Array.isArray(body && body[key]) ? body[key] : [];
}

const meta = d1(
  "SELECT cache_key, updated_at, length(payload) AS n FROM snap_cache WHERE cache_key IN ('gbUsers','gbLinks','gbPets','gbTestClient')"
);
const touch = Object.create(null);
meta.forEach(function (row) {
  touch[row.cache_key] = String(row.updated_at || "");
  console.log("seen=" + row.cache_key + ":" + Number(row.n || 0));
});
const userRows = d1("SELECT payload FROM snap_cache WHERE cache_key = 'gbUsers'");
const linkRows = d1("SELECT payload FROM snap_cache WHERE cache_key = 'gbLinks'");
const petRows = d1("SELECT payload FROM snap_cache WHERE cache_key = 'gbPets'");
const usersBody = snap(userRows[0] || {});
const links = listOf(snap(linkRows[0] || {}), "links");
const pets = listOf(snap(petRows[0] || {}), "pets");
const users = listOf(usersBody, "users");
const hit = users.filter(function (user) {
  return user && String(user.telegramId || "") === PROBE_TID;
});
const linkHit = links.filter(function (row) {
  return row && (String(row.telegramId || "") === PROBE_TID || String(row.userId || "") === PROBE_UID);
});
const petHit = pets.filter(function (row) {
  return row && (String(row.ownerTelegramId || "") === PROBE_TID || String(row.ownerUserId || "") === PROBE_UID);
});
const orders = d1(
  "SELECT COUNT(*) AS n FROM orders WHERE match_key = 'TEST:ARSENIY' OR lower(trim(client)) IN ('arseniyhotko','arseniyhotko_test')"
);
const ordersN = Number((orders[0] && (orders[0].n != null ? orders[0].n : orders[0].N)) || 0);
console.log("users=" + users.length);
console.log("hit=" + hit.length);
console.log("linkHit=" + linkHit.length);
console.log("petHit=" + petHit.length);
console.log("orders=" + ordersN);
if (!hit.length && !linkHit.length && !petHit.length) {
  console.log("removed=0");
  process.exit(0);
}
if (hit.length !== 1 || String(hit[0].userId || "") !== PROBE_UID || linkHit.length || petHit.length) {
  console.log("abort=shape");
  process.exit(1);
}
const nextUsers = users.filter(function (user) {
  return !(user && String(user.userId || "") === PROBE_UID && String(user.telegramId || "") === PROBE_TID);
});
if (nextUsers.length !== users.length - 1) {
  console.log("abort=count");
  process.exit(1);
}
const now = new Date().toISOString();
const body = JSON.stringify({
  status: usersBody.status || "success",
  users: nextUsers,
  _d1TouchedAt: usersBody._d1TouchedAt || Date.now()
});
if (body.indexOf(";") >= 0 || body.indexOf(PROBE_TID) >= 0 || body.indexOf(PROBE_UID) >= 0) {
  console.log("abort=payload");
  process.exit(1);
}
const stamp = now.replace(/[-:]/g, "").replace(/\.\d+/, "");
const backup = "gbProbeBackup:arseniy:" + stamp + ":gbUsers";
d1(
  "INSERT INTO snap_cache (cache_key, payload, updated_at) " +
    "SELECT " + sqlStr(backup) + ", payload, updated_at FROM snap_cache WHERE cache_key = 'gbUsers' " +
    "ON CONFLICT(cache_key) DO NOTHING"
);
d1(
  "UPDATE snap_cache SET payload = " + sqlStr(body) + ", updated_at = " + sqlStr(now) +
    " WHERE cache_key = 'gbUsers'"
);
const after = d1(
  "SELECT cache_key, updated_at, length(payload) AS n FROM snap_cache WHERE cache_key IN ('gbUsers','gbLinks','gbPets','gbTestClient'," +
    sqlStr(backup) + ")"
);
const afterTouch = Object.create(null);
const afterLen = Object.create(null);
after.forEach(function (row) {
  afterTouch[row.cache_key] = String(row.updated_at || "");
  afterLen[row.cache_key] = Number(row.n || 0);
});
const savedRows = d1("SELECT payload FROM snap_cache WHERE cache_key = 'gbUsers'");
const saved = listOf(snap(savedRows[0] || {}), "users");
const still = saved.some(function (user) {
  return user && (String(user.telegramId || "") === PROBE_TID || String(user.userId || "") === PROBE_UID);
});
const testRows = d1("SELECT payload FROM snap_cache WHERE cache_key = 'gbTestClient'");
const testUser = (snap(testRows[0] || {}).user) || {};
const ordersAfter = d1(
  "SELECT COUNT(*) AS n FROM orders WHERE match_key = 'TEST:ARSENIY' OR lower(trim(client)) IN ('arseniyhotko','arseniyhotko_test')"
);
const ordersAfterN = Number((ordersAfter[0] && (ordersAfter[0].n != null ? ordersAfter[0].n : ordersAfter[0].N)) || 0);
const linksSame = afterTouch.gbLinks === touch.gbLinks && afterTouch.gbPets === touch.gbPets && afterTouch.gbTestClient === touch.gbTestClient;
if (still || saved.length !== nextUsers.length || !linksSame || ordersAfterN !== ordersN || testUser.userId !== "u_arseniy_test" || !(afterLen[backup] > 0)) {
  console.log("abort=verify");
  console.log("still=" + (still ? "1" : "0"));
  console.log("linksSame=" + (linksSame ? "1" : "0"));
  console.log("ordersAfter=" + ordersAfterN);
  console.log("testUser=" + (testUser.userId === "u_arseniy_test" ? "1" : "0"));
  process.exit(1);
}
console.log("backup=" + backup);
console.log("removed=1");
console.log("usersBefore=" + users.length);
console.log("usersAfter=" + saved.length);
console.log("ordersSame=" + ordersAfterN);
console.log("sharedUntouched=1");
