#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Contract: listBugReports routes + filter/sort/cap match the GAS handler.
 * Pure helpers here mirror Code.gs parseBugReportAtMs_ / format / filter.
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function parseBugReportAtMs_(val) {
  if (val == null || val === "") return 0;
  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) {
    return val.getTime();
  }
  if (typeof val === "number" && isFinite(val)) {
    if (val > 1e11) return val;
    if (val > 20000 && val < 80000) return Math.round((val - 25569) * 86400 * 1000);
    return 0;
  }
  var s = String(val).trim();
  if (!s) return 0;
  var iso = Date.parse(s);
  if (!isNaN(iso)) return iso;
  var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return 0;
  var d = new Date(
    Number(m[3]),
    Number(m[2]) - 1,
    Number(m[1]),
    Number(m[4] || 0),
    Number(m[5] || 0),
    Number(m[6] || 0)
  );
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function formatBugReportAt_(val) {
  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) {
    return val.toISOString();
  }
  var ms = parseBugReportAtMs_(val);
  if (!ms) return val == null || val === "" ? "" : String(val);
  return new Date(ms).toISOString();
}

function filterBugReports_(rows, opts) {
  opts = opts || {};
  var sinceMs = 0;
  if (opts.since != null && String(opts.since).trim()) {
    sinceMs = parseBugReportAtMs_(opts.since);
  }
  if (!sinceMs) sinceMs = Date.now() - 24 * 60 * 60 * 1000;
  var wantStatus = opts.status == null ? "new" : String(opts.status).trim().toLowerCase();
  if (!wantStatus) wantStatus = "new";
  var filterStatus = wantStatus !== "all" && wantStatus !== "*";
  var reports = [];
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var atVal = row.at;
    var st = String(row.status || "").trim() || "new";
    var atMs = parseBugReportAtMs_(atVal);
    if (atMs && atMs < sinceMs) continue;
    if (filterStatus && String(st).toLowerCase() !== wantStatus) continue;
    reports.push({
      at: formatBugReportAt_(atVal),
      screen: row.screen || "",
      role: row.role || "",
      telegramId: String(row.telegramId || ""),
      what: row.what || "",
      expected: row.expected || "",
      client: row.client || "",
      day: row.day || "",
      status: st,
      row: row.row,
      _ms: atMs
    });
  }
  reports.sort(function (a, b) {
    if (b._ms !== a._ms) return (b._ms || 0) - (a._ms || 0);
    return (b.row || 0) - (a.row || 0);
  });
  if (reports.length > 30) reports = reports.slice(0, 30);
  for (var i = 0; i < reports.length; i++) delete reports[i]._ms;
  return reports;
}

const now = Date.now();
const isoNow = new Date(now).toISOString();
const isoYesterday = new Date(now - 2 * 60 * 60 * 1000).toISOString();
const isoOld = new Date(now - 48 * 60 * 60 * 1000).toISOString();

const rows = [
  { at: isoOld, screen: "order", what: "old new", status: "new", row: 2, telegramId: "1" },
  { at: isoYesterday, screen: "cut", what: "fresh done", status: "done", row: 3, telegramId: "2" },
  { at: isoNow, screen: "view", what: "fresh new", status: "new", row: 4, telegramId: "3" },
  { at: isoNow, screen: "price", what: "also new", status: "NEW", row: 5, telegramId: "4" }
];

const def = filterBugReports_(rows, {});
assert(def.length === 2, "default 24h+new → 2, got " + def.length);
assert(def[0].what === "also new", "newest first (higher row on same ms)");
assert(def[1].what === "fresh new", "second is earlier same-window new");
assert(def.every(function (r) { return r.status.toLowerCase() === "new"; }), "default skips done");
assert(!def.some(function (r) { return r.what === "old new"; }), "default skips >24h");

const allFresh = filterBugReports_(rows, { status: "all" });
assert(allFresh.length === 3, "status=all includes done in 24h, got " + allFresh.length);
assert(allFresh.some(function (r) { return r.status === "done"; }), "all keeps done");

const sinceAll = filterBugReports_(rows, { since: isoOld, status: "all" });
assert(sinceAll.length === 4, "since old + all → 4");

const sinceNew = filterBugReports_(rows, { since: isoOld, status: "new" });
assert(sinceNew.length === 3, "since old + new skips done");

const many = [];
for (var n = 0; n < 40; n++) {
  many.push({
    at: new Date(now - n * 1000).toISOString(),
    what: "r" + n,
    status: "new",
    row: n + 2
  });
}
const capped = filterBugReports_(many, { since: new Date(now - 60000).toISOString() });
assert(capped.length === 30, "cap 30, got " + capped.length);
assert(capped[0].what === "r0", "newest first after cap");

assert(parseBugReportAtMs_("11.09.2026 15:30") > 0, "dd.MM.yyyy HH:mm parses");
assert(formatBugReportAt_(new Date("2026-09-11T12:00:00.000Z")) === "2026-09-11T12:00:00.000Z", "ISO format");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gs = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
assert(/action === "listBugReports"/.test(gs), "doGet/handleApiAction route listBugReports");
assert((gs.match(/action === "listBugReports"/g) || []).length >= 2, "listBugReports in doGet and handleApiAction");
assert(/function handleListBugReports\(/.test(gs), "handleListBugReports exists");
assert(/function handleReportBug\(/.test(gs), "handleReportBug kept");
assert(/function notifyBugReportWebhook_\(/.test(gs), "webhook helper kept");
assert(/BUG_REPORT_WEBHOOK_URL/.test(gs), "BUG_REPORT_WEBHOOK_URL still used");
assert(/BUG_REPORTS_LIST_CAP_ = 30/.test(gs), "cap 30");
assert(/getSheetByName\("Баг_Репорты"\)/.test(gs), "reads Баг_Репорты without creating");

console.log("test-list-bug-reports: ok");
