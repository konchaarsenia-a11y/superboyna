#!/usr/bin/env node
/**
 * andreiprigunov 2026-10-03/05:
 * надгробие subId чужой клички не снимает карточку ПП;
 * бейдж месяца становится 0, когда D1 и просмотр пустые;
 * удаление одной записи не трогает карточку.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function extractFn(src, name) {
  const marker = "function " + name + "(";
  const startFn = src.indexOf(marker);
  if (startFn < 0) throw new Error("missing function " + name);
  let start = startFn;
  if (src.slice(Math.max(0, startFn - 6), startFn) === "async ") start = startFn - 6;
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}

const wSrc = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
const gsSrc = fs.readFileSync(path.join(root, "Code.gs"), "utf8");

const oneBody = extractFn(wSrc, "deleteClientOneRecord_");
assert(!/deleteSubscription_/.test(oneBody), "one-record delete does not touch the PP card");
assert(/patchMonthOverviewCountFromD1_/.test(oneBody), "delete refreshes the month badge from D1");
assert(/viewDate:/.test(oneBody), "delete drops the date snap");

const moveBody = extractFn(wSrc, "moveClient_");
assert(/patchMonthOverviewCountFromD1_/.test(moveBody), "move refreshes month badges");
assert(/все дубли на старых днях-кандидатах/.test(moveBody), "move still clears source-day copies");

const clientsBody = extractFn(wSrc, "getClients_");
const healAt = clientsBody.indexOf("day_name = '' OR day_name IS NULL");
const tombAt = clientsBody.indexOf("hasFreshDeleteTombstone_");
assert(healAt > 0 && tombAt > healAt, "calendar leftover is not glued onto a tombstoned day");

const gasMove = extractFn(gsSrc, "handleMoveClient");
assert(/финальный съём источника/.test(gasMove), "sheet move clears the source column last");
assert(!/deleteSubscription/.test(gasMove), "move does not delete the PP card");

const code = [
  extractFn(wSrc, "monthBadgeNext_"),
  extractFn(wSrc, "isSubDeleteTombstoned_")
].join("\n");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);

const tombAndrei = [
  { nick: "Андрей", mk: "АНДРЕЙ", sheet: "ПП", subId: "53", repairNameOnly: true }
];
assert(
  ctx.isSubDeleteTombstoned_(tombAndrei, "ANDREIPRIGUNOV", "ПП", "53") === false,
  "copied subId must not tombstone the host nick"
);
assert(
  ctx.isSubDeleteTombstoned_(tombAndrei, "АНДРЕЙ", "ПП", "53") === true,
  "the removed name-only row stays tombstoned"
);
assert(
  ctx.isSubDeleteTombstoned_(tombAndrei, "ANDREIPRIGUNOV", "АФК", "53") === false,
  "other sheet is not the tomb"
);
assert(
  ctx.isSubDeleteTombstoned_(
    [{ mk: "", sheet: "ПП", subId: "9" }],
    "",
    "ПП",
    "9"
  ) === true,
  "legacy subId-only tomb still matches when nick is empty"
);
assert(
  ctx.isSubDeleteTombstoned_(
    [{ mk: "ZZZTEST", sheet: "ПП", subId: "1" }],
    "ZZZTEST",
    "ПП",
    "2"
  ) === true,
  "same nick is tombstoned even if subId differs"
);

assert(ctx.monthBadgeNext_(0, 0, true, 1).count === 0, "empty day drops the badge");
assert(ctx.monthBadgeNext_(1, 0, true, 1).count === 0, "stale view does not keep a deleted day");
assert(ctx.monthBadgeNext_(0, 5, true, 5).skip === true, "empty view does not wipe live D1");
assert(ctx.monthBadgeNext_(8, 2, true, 8).count === 2, "D1 caps a stale higher view");
assert(ctx.monthBadgeNext_(2, 0, false, 5).keep === true, "failed D1 query does not zero");
assert(ctx.monthBadgeNext_(0, 0, false, 1).skip === true, "unknown D1 does not invent a zero");

console.log("test-andrei-move-card ok");
