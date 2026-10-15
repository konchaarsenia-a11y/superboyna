import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { writeFileSync } from "fs";

const BAK = {
  subs: "subs_bak_20261014",
  orders: "orders_bak_20261014",
  clients: "clients_bak_20261014",
  snap: "snap_bak_20261014"
};

function d1run(opts) {
  const args = ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json"];
  if (opts.file) args.push("--file", opts.file);
  else args.push("--command", opts.sql);
  const out = execFileSync("npx", args, {
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
    cwd: new URL("../boinya-c/proxy/", import.meta.url).pathname
  });
  const i = out.indexOf("[");
  const j = out.indexOf("{");
  const start = i >= 0 && (j < 0 || i < j) ? i : j;
  if (start < 0) throw new Error("no json from d1");
  const parsed = JSON.parse(out.slice(start));
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!block || block.success === false || block.error) {
    throw new Error(String((block && (block.error || block.message)) || "d1 failed"));
  }
  return block;
}

function d1(sql) {
  return d1run({ sql: sql }).results || [];
}

function tableExists(name) {
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error("bad table");
  return d1("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '" + name + "'").length > 0;
}

function colsOf(table) {
  return d1("PRAGMA table_info(" + table + ")").map(function (r) { return r.name; });
}

function dump(table, whereSql) {
  const cols = colsOf(table);
  const order = cols.indexOf("id") >= 0 ? "id" : cols.indexOf("cache_key") >= 0 ? "cache_key" : cols[0];
  const sql =
    "SELECT " + cols.map(function (c) { return '"' + c + '"'; }).join(", ") +
    " FROM " + table +
    (whereSql ? " WHERE " + whereSql : "") +
    " ORDER BY \"" + order + "\"";
  const rows = d1(sql);
  const h = createHash("sha256");
  rows.forEach(function (r) {
    cols.forEach(function (c) {
      h.update(c + "=" + (r[c] == null ? "" : String(r[c])) + "\n");
    });
    h.update("\u0001");
  });
  return { n: rows.length, hash: h.digest("hex"), rows: rows, cols: cols };
}

function orderCounts(rows) {
  const per = {};
  rows.forEach(function (r) {
    const k = String(r.match_key || "");
    if (!per[k]) per[k] = { n: 0, live: 0, dead: 0 };
    per[k].n += 1;
    if (/^(deleted|cancelled)$/i.test(String(r.status || ""))) per[k].dead += 1;
    else per[k].live += 1;
  });
  return per;
}

function subsCounts(rows) {
  const per = {};
  rows.forEach(function (r) {
    const k = String(r.match_key || "") + "|" + String(r.sheet || "");
    per[k] = (per[k] || 0) + 1;
  });
  return per;
}

function rowHash(row, cols) {
  const h = createHash("sha256");
  cols.forEach(function (c) {
    h.update(c + "=" + (row[c] == null ? "" : String(row[c])) + "\n");
  });
  return h.digest("hex");
}

function subsById(dumpObj) {
  const map = {};
  dumpObj.rows.forEach(function (r) {
    map[String(r.id)] = rowHash(r, dumpObj.cols);
  });
  return map;
}

function diffMap(a, b) {
  const keys = Object.keys(Object.assign({}, a, b)).sort();
  const out = [];
  keys.forEach(function (k) {
    if (JSON.stringify(a[k] == null ? null : a[k]) !== JSON.stringify(b[k] == null ? null : b[k])) {
      out.push(k + " " + JSON.stringify(a[k] == null ? null : a[k]) + " -> " + JSON.stringify(b[k] == null ? null : b[k]));
    }
  });
  return out;
}

function snapPayload(dumpObj) {
  const row = (dumpObj.rows || [])[0] || {};
  return String(row.payload || "");
}

function snapCards(payload) {
  let list = [];
  try {
    const parsed = JSON.parse(payload || "{}");
    list = parsed.subscriptions || parsed.items || [];
  } catch (e) {
    list = [];
  }
  return list.map(function (it) {
    return {
      nick: String((it && it.nick) || ""),
      sheet: String((it && (it.sheet || it.segment)) || ""),
      subId: String((it && it.subId) || ""),
      status: String((it && it.status) || "")
    };
  });
}

function isBp(sheet) {
  return /бп|bp/i.test(String(sheet || ""));
}

function liveTotals(orders, subs, clients, cards) {
  let live = 0;
  Object.keys(orders).forEach(function (k) { live += orders[k].live; });
  return {
    subs: subs,
    clients: clients,
    orders_all: Object.keys(orders).reduce(function (s, k) { return s + orders[k].n; }, 0),
    orders_live: live,
    snap: cards
  };
}

function restoreTable(live, bak, pk) {
  d1("INSERT OR REPLACE INTO " + live + " SELECT * FROM " + bak);
  if (pk) {
    d1("DELETE FROM " + live + " WHERE \"" + pk + "\" NOT IN (SELECT \"" + pk + "\" FROM " + bak + ")");
  }
}

function rollback(why, parts) {
  console.log("ROLLBACK " + why);
  if (parts.subs) restoreTable("subs", BAK.subs, "id");
  if (parts.orders) restoreTable("orders", BAK.orders, "id");
  if (parts.clients) restoreTable("clients", BAK.clients, "id");
  if (parts.snap) d1("INSERT OR REPLACE INTO snap_cache SELECT * FROM " + BAK.snap);
  console.log("ROLLBACK_DONE " + why);
}

function subsDiffOk(bakDump, liveDump) {
  const a = subsById(bakDump);
  const b = subsById(liveDump);
  const onlyBak = Object.keys(a).filter(function (id) { return !b[id]; });
  const onlyLive = Object.keys(b).filter(function (id) { return !a[id]; });
  const changed = Object.keys(a).filter(function (id) { return b[id] && a[id] !== b[id]; });
  return { onlyBak: onlyBak, onlyLive: onlyLive, changed: changed };
}

function ensureBackups() {
  const names = [BAK.subs, BAK.orders, BAK.clients, BAK.snap];
  const have = names.map(tableExists);
  if (have.some(Boolean) && !have.every(Boolean)) {
    throw new Error("PARTIAL_BACKUP " + names.filter(function (n, i) { return !have[i]; }).join(","));
  }
  if (have.every(Boolean)) return "exists";
  d1("CREATE TABLE " + BAK.subs + " AS SELECT * FROM subs");
  d1("CREATE TABLE " + BAK.orders + " AS SELECT * FROM orders");
  d1("CREATE TABLE " + BAK.clients + " AS SELECT * FROM clients");
  d1("CREATE TABLE " + BAK.snap + " AS SELECT * FROM snap_cache WHERE cache_key = 'listSubscriptions'");
  return "created";
}

function preflight() {
  const rows = d1(
    "SELECT id, match_key, nick, sheet, status, updated_at, " +
      "length(IFNULL(basket_json,'')) AS basket_len, IFNULL(n,'') AS n, IFNULL(price,'') AS price, " +
      "length(IFNULL(label,'')) AS label_len, IFNULL(client_id,'') AS client_id, IFNULL(bp_stage,'') AS bp_stage " +
      "FROM subs WHERE id IN ('56','58') ORDER BY id"
  );
  console.log("PRE_ROWS " + JSON.stringify(rows));
  const byId = {};
  rows.forEach(function (r) { byId[String(r.id)] = r; });
  const a = byId["56"];
  const b = byId["58"];
  if (!a || !b) throw new Error("NEED_BOTH_56_AND_58");
  if (a.match_key !== "VOLHA" || !isBp(a.sheet)) throw new Error("ROW_56_NOT_VOLHA_BP");
  if (b.match_key !== "VOLHA" || b.nick !== "Volha" || !isBp(b.sheet)) throw new Error("ROW_58_NOT_VOLHA_BP");
  if (Number(b.basket_len) > 2) throw new Error("ROW_58_HAS_BASKET");
  const snap = dump("snap_cache", "cache_key = 'listSubscriptions'");
  const cards = snapCards(snapPayload(snap));
  const volha = cards.filter(function (c) { return c.nick === "Volha" && isBp(c.sheet); });
  const andrei = cards.filter(function (c) { return c.nick === "Andreiprigunov"; });
  console.log("PRE_SNAP_VOLHA " + JSON.stringify(volha));
  console.log("PRE_SNAP_ANDREI " + JSON.stringify(andrei));
  if (volha.length !== 1 || volha[0].subId !== "56") throw new Error("SNAP_VOLHA_NOT_56");
  if (andrei.length !== 1 || andrei[0].subId !== "56") throw new Error("SNAP_ANDREI_MOVED");
  return { cards: cards.length };
}

function printRenumberSkip(orderPer) {
  const pending = d1(
    "SELECT id, match_key, nick FROM subs WHERE id LIKE 'pending:%' ORDER BY id"
  );
  console.log("RENUMBER_SKIP нельзя перенести заказ: в заказах нет этого subId, кроме PS0034 у VIIHROVA");
  console.log("RENUMBER_EMPTY_BP " + pending.map(function (r) {
    const c = orderPer[r.match_key] || { n: 0, live: 0, dead: 0 };
    return r.nick + ":" + r.match_key + ":orders" + c.n + "/live" + c.live;
  }).join(" "));
  const sids = d1(
    "SELECT json_extract(meta_json, '$.subId') AS sid, match_key, COUNT(*) AS c " +
      "FROM orders WHERE trim(coalesce(json_extract(meta_json, '$.subId'), '')) != '' " +
      "GROUP BY sid, match_key"
  );
  console.log("ORDER_NONEMPTY_SIDS " + JSON.stringify(sids));
}

function fingerprint(which) {
  const subs = dump(which === "bak" ? BAK.subs : "subs");
  const orders = dump(which === "bak" ? BAK.orders : "orders");
  const clients = dump(which === "bak" ? BAK.clients : "clients");
  const snap = dump(
    which === "bak" ? BAK.snap : "snap_cache",
    which === "bak" ? "" : "cache_key = 'listSubscriptions'"
  );
  return { subs: subs, orders: orders, clients: clients, snap: snap };
}

function reportPair(label, beforeOrders, afterOrders, beforeSubs, afterSubs, beforeSnap, afterSnap, beforeClients, afterClients) {
  const bCards = snapCards(snapPayload(beforeSnap)).length;
  const aCards = snapCards(snapPayload(afterSnap)).length;
  const bt = liveTotals(beforeOrders, beforeSubs.n, beforeClients, bCards);
  const at = liveTotals(afterOrders, afterSubs.n, afterClients, aCards);
  console.log(label + "_BEFORE " + JSON.stringify(bt));
  console.log(label + "_AFTER " + JSON.stringify(at));
  console.log(label + "_ORDER_DIFF " + JSON.stringify(diffMap(beforeOrders, afterOrders)));
  console.log(label + "_SUB_DIFF " + JSON.stringify(diffMap(subsCounts(beforeSubs.rows), subsCounts(afterSubs.rows))));
  console.log(label + "_SNAP_SAME " + (beforeSnap.hash === afterSnap.hash));
  console.log(label + "_CLIENTS_SAME " + (beforeClients === afterClients));
  const volhaB = beforeOrders.VOLHA || { n: 0, live: 0, dead: 0 };
  const volhaA = afterOrders.VOLHA || { n: 0, live: 0, dead: 0 };
  const andreiB = beforeOrders.ANDREIPRIGUNOV || { n: 0, live: 0, dead: 0 };
  const andreiA = afterOrders.ANDREIPRIGUNOV || { n: 0, live: 0, dead: 0 };
  console.log("VOLHA_ORDERS before " + JSON.stringify(volhaB) + " after " + JSON.stringify(volhaA));
  console.log("ANDREI_ORDERS before " + JSON.stringify(andreiB) + " after " + JSON.stringify(andreiA));
}

function allowedAfter(bakF, liveF) {
  const sd = subsDiffOk(bakF.subs, liveF.subs);
  const ordersSame = bakF.orders.hash === liveF.orders.hash;
  const clientsSame = bakF.clients.hash === liveF.clients.hash;
  const snapSame = snapPayload(bakF.snap) === snapPayload(liveF.snap);
  const only58 = sd.onlyBak.length === 1 && sd.onlyBak[0] === "58" && sd.onlyLive.length === 0 && sd.changed.length === 0;
  const orderDiff = diffMap(orderCounts(bakF.orders.rows), orderCounts(liveF.orders.rows));
  const subDiff = diffMap(subsCounts(bakF.subs.rows), subsCounts(liveF.subs.rows));
  const subOnlyVolha = subDiff.length === 1 && subDiff[0] === "VOLHA|bp 2 -> 1";
  return {
    ok: only58 && ordersSame && clientsSame && snapSame && orderDiff.length === 0 && subOnlyVolha,
    sd: sd,
    ordersSame: ordersSame,
    clientsSame: clientsSame,
    snapSame: snapSame,
    orderDiff: orderDiff,
    subDiff: subDiff
  };
}

function apply() {
  preflight();
  const how = ensureBackups();
  console.log("BACKUP " + how + " " + JSON.stringify(BAK));
  const bakF = fingerprint("bak");
  let liveF = fingerprint("live");
  const ordersSame0 = bakF.orders.hash === liveF.orders.hash;
  const clientsSame0 = bakF.clients.hash === liveF.clients.hash;
  const snapSame0 = snapPayload(bakF.snap) === snapPayload(liveF.snap);
  const beforeDelete = subsDiffOk(bakF.subs, liveF.subs);
  const already = beforeDelete.onlyBak.length === 1 && beforeDelete.onlyBak[0] === "58" && beforeDelete.onlyLive.length === 0 && beforeDelete.changed.length === 0;
  if (already && ordersSame0 && clientsSame0 && snapSame0) {
    const chk = allowedAfter(bakF, liveF);
    console.log("ALREADY " + JSON.stringify({ ok: chk.ok, subDiff: chk.subDiff, orderDiff: chk.orderDiff }));
    reportPair("ALREADY", orderCounts(bakF.orders.rows), orderCounts(liveF.orders.rows), bakF.subs, liveF.subs, bakF.snap, liveF.snap, bakF.clients.n, liveF.clients.n);
    if (!chk.ok) throw new Error("ALREADY_NOT_CLEAN");
    printRenumberSkip(orderCounts(liveF.orders.rows));
    console.log("APPLY_OK already");
    return;
  }
  if (!ordersSame0 || !clientsSame0 || !snapSame0 || beforeDelete.onlyBak.length || beforeDelete.onlyLive.length || beforeDelete.changed.length || bakF.subs.hash !== liveF.subs.hash) {
    console.log("DRIFT " + JSON.stringify({
      ordersSame0: ordersSame0,
      clientsSame0: clientsSame0,
      snapSame0: snapSame0,
      onlyBak: beforeDelete.onlyBak,
      onlyLive: beforeDelete.onlyLive,
      changed: beforeDelete.changed
    }));
    if (beforeDelete.onlyBak.indexOf("58") >= 0) {
      rollback("drift_after_delete", { subs: true, orders: !ordersSame0, clients: !clientsSame0, snap: !snapSame0 });
      throw new Error("ROLLED_BACK_DRIFT");
    }
    throw new Error("DRIFT_BEFORE_DELETE_NO_WRITE");
  }
  ["subs", "orders", "clients"].forEach(function (name) {
    const a = colsOf(name).join("|");
    const b = colsOf(BAK[name]).join("|");
    if (a !== b) throw new Error("COLS " + name);
  });
  if (colsOf("snap_cache").join("|") !== colsOf(BAK.snap).join("|")) throw new Error("COLS snap");
  printRenumberSkip(orderCounts(bakF.orders.rows));
  const del = d1run({ sql: "DELETE FROM subs WHERE id = '58'" });
  console.log("DELETE_META " + JSON.stringify(del.meta || {}));
  if (del.meta && del.meta.changes != null && Number(del.meta.changes) !== 1) {
    if (Number(del.meta.changes) > 1) {
      rollback("delete_changes_" + del.meta.changes, { subs: true, orders: false, clients: false, snap: false });
    }
    throw new Error("DELETE_CHANGES " + del.meta.changes);
  }
  liveF = fingerprint("live");
  const chk = allowedAfter(bakF, liveF);
  console.log("CHECK " + JSON.stringify({
    ok: chk.ok,
    onlyBak: chk.sd.onlyBak,
    onlyLive: chk.sd.onlyLive,
    changed: chk.sd.changed,
    ordersSame: chk.ordersSame,
    clientsSame: chk.clientsSame,
    snapSame: chk.snapSame,
    orderDiff: chk.orderDiff,
    subDiff: chk.subDiff
  }));
  reportPair("APPLY", orderCounts(bakF.orders.rows), orderCounts(liveF.orders.rows), bakF.subs, liveF.subs, bakF.snap, liveF.snap, bakF.clients.n, liveF.clients.n);
  if (!chk.ok) {
    rollback("verify_failed", {
      subs: true,
      orders: !chk.ordersSame,
      clients: !chk.clientsSame,
      snap: !chk.snapSame
    });
    const again = fingerprint("live");
    const back = again.subs.hash === bakF.subs.hash && again.orders.hash === bakF.orders.hash && again.clients.hash === bakF.clients.hash && snapPayload(again.snap) === snapPayload(bakF.snap);
    console.log("RESTORE_MATCH " + back);
    throw new Error("ROLLED_BACK_VERIFY");
  }
  const gone = d1("SELECT id FROM subs WHERE id = '58'");
  const kept = d1("SELECT id, match_key, sheet FROM subs WHERE id = '56'");
  console.log("ROW58_GONE " + JSON.stringify(gone));
  console.log("ROW56_KEPT " + JSON.stringify(kept));
  console.log("APPLY_OK deleted_subs_id_58");
}

if (process.env.APPLY === "1") {
  try {
    apply();
  } catch (e) {
    console.log("APPLY_FAIL " + (e && e.message ? e.message : String(e)));
    process.exit(1);
  }
} else {
  console.log("APPLY_OFF read_only");
  process.exit(0);
}
