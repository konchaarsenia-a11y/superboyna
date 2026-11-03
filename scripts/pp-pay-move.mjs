import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { planPpPayMove_ } from "../boinya-c/proxy/cabinet-link.js";
import { assertSqlBudget_, sqlLit_ } from "./public-id-assign.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const proxy = path.join(here, "..", "boinya-c", "proxy");
const FROM = "2026-09-01";
const TO = "2026-12-01";
const BACKUP = "ppPayMoveBackup:2026-10-23";
const NOTICE = "ppPayMoveNotice:2026-10-23";
const OWNER_ID = "650923866";
const PAY_KEYS = ["payMoved", "payMovedAmount", "payMovedTo", "payDue", "payFromDate"];

export function payMoveSql_(id, set, clear) {
  const sets = [];
  Object.keys(set || {}).forEach(function (k) {
    if (PAY_KEYS.indexOf(k) < 0) throw new Error("bad key " + k);
    const v = set[k];
    const arg = typeof v === "number" ? String(v) : sqlLit_(v);
    sets.push(sqlLit_("$." + k) + ", " + arg);
  });
  const removes = (clear || []).map(function (k) {
    if (PAY_KEYS.indexOf(k) < 0) throw new Error("bad key " + k);
    return sqlLit_("$." + k);
  });
  let expr = "COALESCE(meta_json, '{}')";
  if (sets.length) expr = "json_set(" + expr + ", " + sets.join(", ") + ")";
  if (removes.length) expr = "json_remove(" + expr + ", " + removes.join(", ") + ")";
  if (!sets.length && !removes.length) return "";
  const sql =
    "UPDATE orders SET meta_json = " + expr + " WHERE id = " + sqlLit_(id) + " AND status = 'active'";
  assertSqlBudget_(sql);
  if (/orderPrice|updated_at|basket_json/.test(sql)) throw new Error("pay sql touches a frozen column");
  return sql;
}

export function restorePaySql_(id, old) {
  const set = {};
  const clear = [];
  PAY_KEYS.forEach(function (k) {
    const v = old ? old[k] : null;
    if (v == null || v === "") clear.push(k);
    else if (k === "payDue" || k === "payMovedAmount") set[k] = Number(v);
    else set[k] = String(v);
  });
  return payMoveSql_(id, set, clear);
}

export function backupSql_() {
  const sql =
    "INSERT INTO snap_cache (cache_key, payload, updated_at) SELECT " +
    sqlLit_(BACKUP + ":") +
    " || id, json_object('id', id, 'payMoved', json_extract(meta_json, '$.payMoved'), 'payMovedAmount', json_extract(meta_json, '$.payMovedAmount'), 'payMovedTo', json_extract(meta_json, '$.payMovedTo'), 'payDue', json_extract(meta_json, '$.payDue'), 'payFromDate', json_extract(meta_json, '$.payFromDate'), 'orderPrice', json_extract(meta_json, '$.orderPrice'), 'paid', json_extract(meta_json, '$.paid')), '' FROM orders WHERE status = 'active' AND date_iso >= " +
    sqlLit_(FROM) +
    " AND date_iso < " +
    sqlLit_(TO) +
    " ON CONFLICT(cache_key) DO NOTHING";
  assertSqlBudget_(sql);
  return sql;
}

export function readSql_() {
  return (
    "SELECT id, date_iso, match_key, client, segment, " +
    "json_extract(meta_json, '$.ppSlot') AS ppSlot, " +
    "json_extract(meta_json, '$.deliverySlot') AS deliverySlot, " +
    "json_extract(meta_json, '$.paid') AS paid, " +
    "json_extract(meta_json, '$.orderPrice') AS orderPrice, " +
    "json_extract(meta_json, '$.payMoved') AS payMoved, " +
    "json_extract(meta_json, '$.payDue') AS payDue, " +
    "json_extract(meta_json, '$.payMovedAmount') AS payMovedAmount, " +
    "json_extract(meta_json, '$.payMovedTo') AS payMovedTo, " +
    "json_extract(meta_json, '$.payFromDate') AS payFromDate " +
    "FROM orders WHERE status = 'active' AND date_iso >= " +
    sqlLit_(FROM) +
    " AND date_iso < " +
    sqlLit_(TO) +
    " ORDER BY date_iso, id"
  );
}

export function orderPrintSql_() {
  return (
    "SELECT id, match_key, status, updated_at, length(basket_json) AS bl, length(coalesce(address, '')) AS al, " +
    "coalesce(json_extract(meta_json, '$.orderPrice'), '') AS price, " +
    "coalesce(json_extract(meta_json, '$.paid'), '') AS paid, " +
    "coalesce(json_extract(meta_json, '$.ppSlot'), '') AS slot " +
    "FROM orders ORDER BY id"
  );
}

export function subPrintSql_() {
  return "SELECT id, nick, sheet, status FROM subs ORDER BY id";
}

export function planFromRows_(rows) {
  return planPpPayMove_(
    (rows || []).map(function (r) {
      return {
        id: r.id,
        date: r.date_iso || r.date,
        matchKey: r.match_key || r.matchKey || "",
        client: r.client || "",
        segment: r.segment || (r.ppSlot || r.deliverySlot ? "ПП" : ""),
        ppSlot: r.ppSlot == null ? "" : r.ppSlot,
        deliverySlot: r.deliverySlot == null ? "" : r.deliverySlot,
        paid: r.paid == null ? "" : r.paid,
        orderPrice: r.orderPrice,
        payMoved: r.payMoved || "",
        payDue: r.payDue || 0,
        payMovedAmount: r.payMovedAmount || 0,
        payMovedTo: r.payMovedTo || "",
        payFromDate: r.payFromDate || ""
      };
    })
  );
}

export function noticeText_(stayed) {
  const lines = (stayed || []).map(function (s) {
    return "- " + (s.client || "клиент") + " " + s.date + " " + s.amount + " BYN";
  });
  let text = "Неоплата ПП1. ПП2 в этом месяце нет. Сумма остаётся на первой доставке:\n" + lines.join("\n");
  if (text.length > 3500) text = text.slice(0, 3400) + "\n…";
  return text;
}

export function printOf_(rows, cols) {
  return (rows || [])
    .map(function (r) {
      return cols.map(function (c) { return String(r[c] == null ? "" : r[c]); }).join("|");
    })
    .sort()
    .join("\n");
}

function outDir() {
  const dir = process.env.GITHUB_WORKSPACE
    ? path.join(process.env.GITHUB_WORKSPACE, "artifacts", "pp-pay-move")
    : path.join(here, "..", "artifacts", "pp-pay-move");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function d1(sql, name) {
  assertSqlBudget_(sql);
  const dir = outDir();
  fs.writeFileSync(path.join(dir, name + ".sql"), sql);
  const cmd = ["npx", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql];
  const proc = spawnSync(cmd[0], cmd.slice(1), {
    cwd: proxy,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: process.env
  });
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

function cell_(row, name) {
  if (!row) return "";
  if (row[name] != null && row[name] !== "") return row[name];
  const lower = name.toLowerCase();
  if (row[lower] != null && row[lower] !== "") return row[lower];
  return row[name] == null ? "" : row[name];
}

export function tallyRows_(rows) {
  const paid = {};
  const seg = {};
  const unpaid = [];
  (rows || []).forEach(function (r) {
    const p = String(r.paid == null ? "" : r.paid);
    paid[p] = (paid[p] || 0) + 1;
    const s = String(r.segment || "");
    seg[s] = (seg[s] || 0) + 1;
    const low = p.toLowerCase();
    if (low === "no" || low === "false" || low === "0") {
      unpaid.push({
        client: String(r.client || ""),
        date: String(r.date_iso || ""),
        segment: s,
        ppSlot: r.ppSlot == null ? "" : String(r.ppSlot),
        deliverySlot: r.deliverySlot == null ? "" : String(r.deliverySlot),
        orderPrice: r.orderPrice == null ? "" : r.orderPrice,
        match: String(r.match_key || "")
      });
    }
  });
  return {
    paid: paid,
    seg: seg,
    unpaid: unpaid.slice(0, 40),
    unpaidN: unpaid.length,
    keys: rows && rows[0] ? Object.keys(rows[0]) : []
  };
}

function movedStayed_(rows, plan) {
  const byId = {};
  (rows || []).forEach(function (r) { byId[r.id] = r; });
  const moved = [];
  (plan.patches || []).forEach(function (p) {
    if (!p.set || !(Number(p.set.payDue) > 0)) return;
    const row = byId[p.id] || {};
    moved.push({
      client: String(row.client || ""),
      to: String(row.date_iso || row.date || ""),
      from: String(p.set.payFromDate || ""),
      amount: p.set.payDue
    });
  });
  const stayed = (plan.notify || []).map(function (n) {
    return { client: n.client, date: n.date, amount: n.amount };
  });
  return { moved: moved, stayed: stayed };
}

function main() {
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) delete process.env.CLOUDFLARE_ACCOUNT_ID;
  const dir = outDir();
  const ordersBefore = results(d1(orderPrintSql_(), "orders-before"));
  const subsBefore = results(d1(subPrintSql_(), "subs-before"));
  if (!ordersBefore.length) throw new Error("no orders");
  const orderPrint = printOf_(ordersBefore, ["id", "match_key", "status", "updated_at", "bl", "al", "price", "paid", "slot"]);
  const subPrint = printOf_(subsBefore, ["id", "nick", "sheet", "status"]);
  fs.writeFileSync(path.join(dir, "orders-before.txt"), orderPrint);
  fs.writeFileSync(path.join(dir, "subs-before.txt"), subPrint);

  const rows = results(d1(readSql_(), "read")).map(function (r) {
    return {
      id: cell_(r, "id"),
      date_iso: cell_(r, "date_iso"),
      match_key: cell_(r, "match_key"),
      client: cell_(r, "client"),
      segment: cell_(r, "segment"),
      ppSlot: cell_(r, "ppSlot"),
      deliverySlot: cell_(r, "deliverySlot"),
      paid: cell_(r, "paid"),
      orderPrice: cell_(r, "orderPrice"),
      payMoved: cell_(r, "payMoved"),
      payDue: cell_(r, "payDue"),
      payMovedAmount: cell_(r, "payMovedAmount"),
      payMovedTo: cell_(r, "payMovedTo"),
      payFromDate: cell_(r, "payFromDate")
    };
  });
  const plan = planFromRows_(rows);
  const story = movedStayed_(rows, plan);
  d1(backupSql_(), "backup");
  const oldById = {};
  rows.forEach(function (r) { oldById[r.id] = r; });
  let dirty = false;
  const applied = [];
  try {
    (plan.patches || []).forEach(function (patch, i) {
      const sql = payMoveSql_(patch.id, patch.set, patch.clear);
      if (!sql) return;
      dirty = true;
      applied.push(patch.id);
      d1(sql, "patch-" + i);
    });
    const ordersAfter = results(d1(orderPrintSql_(), "orders-after"));
    const subsAfter = results(d1(subPrintSql_(), "subs-after"));
    const ordersMatch = printOf_(ordersAfter, ["id", "match_key", "status", "updated_at", "bl", "al", "price", "paid", "slot"]) === orderPrint;
    const subsMatch = printOf_(subsAfter, ["id", "nick", "sheet", "status"]) === subPrint;
    if (!ordersMatch || !subsMatch) {
      applied.forEach(function (id, i) {
        const sql = restorePaySql_(id, oldById[id]);
        if (sql) d1(sql, "restore-" + i);
      });
      throw new Error("reconcile orders=" + ordersMatch + " subs=" + subsMatch);
    }
    let notice = { sent: false, reason: "none" };
    if (story.stayed.length) {
      const have = results(d1("SELECT cache_key FROM snap_cache WHERE cache_key = " + sqlLit_(NOTICE), "notice-exists"));
      if (!have.length) {
        const text = noticeText_(story.stayed);
        notice = awaitSend_(text);
        if (notice.sent) {
          d1(
            "INSERT INTO snap_cache (cache_key, payload, updated_at) VALUES (" +
              sqlLit_(NOTICE) + ", " + sqlLit_(text) + ", '') ON CONFLICT(cache_key) DO NOTHING",
            "notice-save"
          );
        }
      } else notice = { sent: false, reason: "already" };
    }
    const summary = {
      backup: BACKUP,
      from: FROM,
      to: TO,
      rows: rows.length,
      patchCount: (plan.patches || []).length,
      moved: story.moved,
      stayed: story.stayed,
      orders: ordersBefore.length,
      subs: subsBefore.length,
      ordersMatch: true,
      subsMatch: true,
      notice: notice,
      tally: tallyRows_(rows)
    };
    fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } catch (err) {
    if (dirty) {
      applied.forEach(function (id, i) {
        try {
          const sql = restorePaySql_(id, oldById[id]);
          if (sql) d1(sql, "restore-fail-" + i);
        } catch (eR) {
          console.error(eR);
        }
      });
    }
    throw err;
  }
}

function awaitSend_(text) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return { sent: false, reason: "no_token" };
  const chatRows = results(d1("SELECT value FROM meta WHERE key = 'telegram_chat_id'", "chat"));
  const ids = [];
  const chat = chatRows[0] && chatRows[0].value ? String(chatRows[0].value).trim() : "";
  if (chat) ids.push(chat);
  if (ids.indexOf(OWNER_ID) < 0) ids.push(OWNER_ID);
  return sendSync_(token, ids, text);
}

function sendSync_(token, ids, text) {
  let sent = 0;
  for (let i = 0; i < ids.length; i++) {
    const body = JSON.stringify({ chat_id: ids[i], text: text });
    const proc = spawnSync(
      process.execPath,
      [
        "-e",
        "fetch(process.env.PP_TG_URL,{method:'POST',headers:{'content-type':'application/json'},body:process.env.PP_TG_BODY}).then(r=>process.exit(r.ok?0:2)).catch(()=>process.exit(3))"
      ],
      {
        encoding: "utf8",
        env: Object.assign({}, process.env, {
          PP_TG_URL: "https://api.telegram.org/bot" + token + "/sendMessage",
          PP_TG_BODY: body
        })
      }
    );
    if (proc.status === 0) sent += 1;
    else console.error("notice rc=" + proc.status);
  }
  return { sent: sent > 0, chats: sent };
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
