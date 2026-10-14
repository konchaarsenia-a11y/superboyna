import { execFileSync } from "child_process";

function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    {
      encoding: "utf8",
      maxBuffer: 80 * 1024 * 1024,
      cwd: new URL("../boinya-c/proxy/", import.meta.url).pathname
    }
  );
  const i = out.indexOf("[");
  const j = out.indexOf("{");
  const start = i >= 0 && (j < 0 || i < j) ? i : j;
  const parsed = JSON.parse(out.slice(start));
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  if (block && block.error) throw new Error(String(block.error));
  return (block && block.results) || [];
}

function one(sql) {
  const rows = d1(sql);
  return rows[0] || null;
}

const totals = one(
  "SELECT " +
    "(SELECT COUNT(*) FROM subs) AS subs, " +
    "(SELECT COUNT(*) FROM subs WHERE status = 'deleted') AS subs_deleted, " +
    "(SELECT COUNT(*) FROM clients) AS clients, " +
    "(SELECT COUNT(*) FROM orders) AS orders_all, " +
    "(SELECT COUNT(*) FROM orders WHERE lower(coalesce(status,'')) NOT IN ('deleted','cancelled')) AS orders_live"
);
console.log("TOTALS " + JSON.stringify(totals));

const volha = d1(
  "SELECT id, match_key, nick, sheet, status, updated_at, IFNULL(n,'') AS n, IFNULL(price,'') AS price, " +
    "length(IFNULL(basket_json,'')) AS basket_len, length(IFNULL(label,'')) AS label_len " +
    "FROM subs WHERE id IN ('56','58') OR upper(match_key) LIKE '%VOLHA%' OR upper(nick) LIKE '%VOLHA%' " +
    "OR upper(match_key) LIKE '%ANDREI%' OR upper(nick) LIKE '%ANDREI%' OR upper(nick) LIKE '%ПРИГУН%'"
);
console.log("VOLHA_ANDREI_ROWS " + JSON.stringify(volha));

const pending = d1(
  "SELECT id, match_key, nick, sheet, status, updated_at, length(IFNULL(basket_json,'')) AS basket_len " +
    "FROM subs WHERE id LIKE 'pending:%' ORDER BY id"
);
console.log("PENDING " + JSON.stringify(pending));

const dupIds = d1(
  "SELECT id, COUNT(*) AS c, group_concat(match_key) AS keys, group_concat(nick) AS nicks, group_concat(sheet) AS sheets " +
    "FROM subs GROUP BY id HAVING c > 1"
);
console.log("DUP_PK " + JSON.stringify(dupIds));

const ordersVolha = d1(
  "SELECT id, date_iso, match_key, client, status, " +
    "json_extract(meta_json, '$.subId') AS sid, json_extract(meta_json, '$.import') AS src " +
    "FROM orders WHERE upper(match_key) LIKE '%VOLHA%' OR upper(client) LIKE '%VOLHA%' " +
    "OR upper(match_key) LIKE '%ANDREI%' OR upper(client) LIKE '%ANDREI%' " +
    "OR json_extract(meta_json, '$.subId') IN ('56','58') " +
    "ORDER BY date_iso"
);
console.log("ORDERS_VOLHA " + JSON.stringify(ordersVolha.map(function (r) {
  return { id: r.id, date: r.date_iso, mk: r.match_key, client: r.client, status: r.status, sid: r.sid, src: r.src };
})));

const perClient = d1(
  "SELECT match_key, COUNT(*) AS live_orders FROM orders " +
    "WHERE lower(coalesce(status,'')) NOT IN ('deleted','cancelled') " +
    "GROUP BY match_key"
);
const perSub = d1(
  "SELECT match_key, sheet, COUNT(*) AS cards FROM subs WHERE coalesce(status,'') != 'deleted' GROUP BY match_key, sheet"
);
console.log("ORDER_CLIENTS " + perClient.length + " SUB_GROUPS " + perSub.length);

const snapRow = one("SELECT length(payload) AS n FROM snap_cache WHERE cache_key = 'listSubscriptions'");
console.log("SNAP_LEN " + JSON.stringify(snapRow));
const snap = one("SELECT payload FROM snap_cache WHERE cache_key = 'listSubscriptions'");
let list = [];
try {
  const parsed = JSON.parse((snap && snap.payload) || "{}");
  list = parsed.subscriptions || parsed.items || [];
} catch (e) {
  console.log("SNAP_PARSE_FAIL");
}
console.log("SNAP_CARDS " + list.length);

function card(it) {
  return {
    nick: String((it && (it.nick || it.client)) || ""),
    label: String((it && it.label) || "").slice(0, 40),
    subId: String((it && (it.subId || it.id)) || ""),
    sheet: String((it && (it.sheet || it.segment)) || ""),
    status: String((it && (it.status || it.stage)) || ""),
    basket: Array.isArray(it && it.basket) ? it.basket.length : 0
  };
}
const want = /volha|andre|пригун|patrick_beagle|poodle_sliva|jagger_border|sashin|border_papillon|two_merry|ollie|olga_danilova|masha_korik|frenchbulldog_arni|mr\.barney|zertorn|shibainu|wow_masha|sharkoolj|darya\.prodog|kafeta|rit|рита|katya\.deht|фалют|прохор|маргарит|confettins|snowy|darya\.vlc|lena|sunflower|маша|qwert|юлия/i;
const hit = list.filter(function (it) {
  const blob = JSON.stringify(card(it));
  return want.test(blob);
}).map(card);
console.log("SNAP_HIT " + JSON.stringify(hit));

const sidCount = {};
list.forEach(function (it) {
  const sid = String((it && (it.subId || "")) || "").trim();
  const sheet = String((it && (it.sheet || it.segment)) || "");
  if (!sid) return;
  const k = sheet + "|" + sid;
  if (!sidCount[k]) sidCount[k] = [];
  sidCount[k].push(String(it.nick || ""));
});
const shared = Object.keys(sidCount).filter(function (k) { return sidCount[k].length > 1; }).map(function (k) {
  return { key: k, nicks: sidCount[k] };
});
console.log("SNAP_SHARED " + JSON.stringify(shared));

const emptyBp = list.filter(function (it) {
  const sheet = String((it && (it.sheet || it.segment)) || "");
  const sid = String((it && (it.subId || "")) || "").trim();
  return /бп|bp/i.test(sheet) && !sid;
}).map(card);
console.log("SNAP_EMPTY_BP " + JSON.stringify(emptyBp));

const subsAll = d1("SELECT id, match_key, nick, sheet, status FROM subs ORDER BY id");
console.log("SUBS_ALL " + JSON.stringify(subsAll.map(function (r) {
  return r.id + "|" + r.nick + "|" + r.sheet + "|" + r.match_key;
})));
console.log("SNAP_ALL " + JSON.stringify(list.map(function (it) {
  return String(it.nick || "") + "|" + String(it.subId || "") + "|" + String(it.sheet || it.segment || "");
})));
const nums = subsAll.map(function (r) { return Number(r.id); }).filter(function (n) { return isFinite(n) && n > 0; });
console.log("MAX_NUM " + Math.max.apply(null, nums.concat([0])));

const orderSid = d1(
  "SELECT json_extract(meta_json, '$.subId') AS sid, match_key, COUNT(*) AS c " +
    "FROM orders WHERE json_extract(meta_json, '$.subId') IS NOT NULL AND trim(json_extract(meta_json, '$.subId')) != '' " +
    "GROUP BY sid, match_key ORDER BY sid"
);
console.log("ORDER_SIDS " + JSON.stringify(orderSid));

const metaKeys = d1(
  "SELECT je.key AS k, COUNT(*) AS c FROM orders, json_each(orders.meta_json) je GROUP BY je.key ORDER BY c DESC"
);
console.log("META_KEYS " + JSON.stringify(metaKeys));

const bySid = {};
list.forEach(function (it) {
  const sid = String((it && it.subId) || "").trim();
  if (!sid) return;
  if (!bySid[sid]) bySid[sid] = [];
  bySid[sid].push(String(it.nick || "") + "|" + String(it.sheet || it.segment || ""));
});
const cross = Object.keys(bySid).filter(function (k) { return bySid[k].length > 1; }).map(function (k) {
  return { sid: k, cards: bySid[k] };
});
console.log("SNAP_SAME_NUMBER " + JSON.stringify(cross));

const used = {};
subsAll.forEach(function (r) {
  if (/^[0-9]+$/.test(String(r.id))) used[String(r.id)] = "subs:" + r.match_key;
});
Object.keys(bySid).forEach(function (k) {
  if (!used[k]) used[k] = "snap";
});
const usedNums = Object.keys(used).map(Number).filter(function (n) { return n > 0; }).sort(function (a, b) { return a - b; });
const free = [];
const maxNum = usedNums.length ? usedNums[usedNums.length - 1] : 0;
for (let n = 1; n <= maxNum + 20 && free.length < 30; n++) {
  if (used[String(n)]) continue;
  free.push(n);
}
console.log("USED_NUMS " + usedNums.join(","));
console.log("FREE_NUMS " + free.join(","));

const orderByMk = {};
perClient.forEach(function (r) { orderByMk[r.match_key] = r.live_orders; });
const allOrders = d1(
  "SELECT match_key, COUNT(*) AS n, " +
    "SUM(CASE WHEN lower(coalesce(status,'')) IN ('deleted','cancelled') THEN 1 ELSE 0 END) AS dead " +
    "FROM orders GROUP BY match_key"
);
const allByMk = {};
allOrders.forEach(function (r) { allByMk[r.match_key] = r.n + "/" + r.dead; });
console.log("ORDERS_PER " + allOrders.map(function (r) {
  return r.match_key + ":" + r.n + ":dead" + r.dead;
}).join(" "));

const snapPer = {};
list.forEach(function (it) {
  const k = String(it.nick || "") + "|" + String(it.sheet || it.segment || "");
  snapPer[k] = (snapPer[k] || 0) + 1;
});
console.log("SNAP_PER " + Object.keys(snapPer).sort().map(function (k) {
  return k + ":" + snapPer[k];
}).join(" "));
console.log("SUBS_PER " + perSub.map(function (r) {
  return r.match_key + "|" + r.sheet + ":" + r.cards;
}).join(" "));
