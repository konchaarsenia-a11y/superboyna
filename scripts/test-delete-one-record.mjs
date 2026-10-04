#!/usr/bin/env node
/**
 * Удаление одной записи не снимает другую дату того же клиента и не трогает карточку ПП.
 * Перенос по-прежнему чистит день-источник.
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

assert(/async function deleteClientOneRecord_/.test(wSrc), "one-record delete exists");
assert(/function rowsForUserDelete_/.test(wSrc), "row picker exists");
assert(/function weekDupeDropIds_/.test(wSrc), "same-date dupe picker exists");
assert(/if \(userOne\)/.test(wSrc), "user delete takes the one-record path");
assert(/все дубли на старых днях-кандидатах/.test(wSrc), "move still clears source-day copies");
assert(/function subscriptionMovePlan_/.test(wSrc), "pp/afk move plan still present");

const oneBody = extractFn(wSrc, "deleteClientOneRecord_");
assert(!/deleteSubscription_/.test(oneBody), "one-record delete does not touch the PP card");
assert(!/findActiveOrderByMatch_/.test(oneBody), "one-record delete does not sweep other days");

const delBody = extractFn(wSrc, "deleteClient_");
const userIdx = delBody.indexOf("if (userOne)");
const verifyIdx = delBody.indexOf("still = await findActiveOrderByMatch_");
assert(userIdx > 0 && verifyIdx > userIdx, "wide verify stays behind the user-delete return");

assert(/function daysToClearForDelete_/.test(gsSrc), "sheet day filter exists");
const gasDel = extractFn(gsSrc, "handleDeleteClient");
assert(/daysToClearForDelete_/.test(gasDel), "sheet delete uses the date filter");
assert(!/deleteSubscription/.test(gasDel), "sheet delete does not remove the PP card");
assert(/function clearClientFromWeekSheets_/.test(gsSrc), "move still has week-wide clear");

const code = [
  extractFn(wSrc, "normalizeMatchKey_"),
  extractFn(wSrc, "nicksLooseMatch_"),
  extractFn(wSrc, "orderRowLooseMatch_"),
  extractFn(wSrc, "rowsForUserDelete_"),
  extractFn(wSrc, "weekDupeDropIds_"),
  extractFn(gsSrc, "daysToClearForDelete_")
].join("\n");

const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);

const mon = {
  id: "mon-1",
  status: "active",
  date_iso: "2026-10-05",
  day_name: "Понедельник",
  client: "zzz_test",
  match_key: "ZZZTEST",
  meta_json: JSON.stringify({ ppSlot: "1", orderPrice: 40 })
};
const tue = {
  id: "tue-1",
  status: "active",
  date_iso: "2026-10-06",
  day_name: "Вторник",
  client: "zzz_test",
  match_key: "ZZZTEST",
  meta_json: JSON.stringify({ ppSlot: "2", orderPrice: 55 })
};
const fut = {
  id: "fut-1",
  status: "active",
  date_iso: "2026-10-05",
  day_name: "Будущая неделя",
  client: "zzz_test",
  match_key: "ZZZTEST",
  meta_json: JSON.stringify({ ppSlot: "1", orderPrice: 40 })
};
const other = {
  id: "other",
  status: "active",
  date_iso: "2026-10-05",
  day_name: "Понедельник",
  client: "other_person",
  match_key: "OTHER"
};

const byDate = ctx.rowsForUserDelete_([mon, tue, fut, other], {
  client: "zzz_test",
  matchKey: "ZZZTEST",
  date: "2026-10-05"
});
assert(byDate.map((r) => r.id).sort().join() === "fut-1,mon-1", "same date copies only, other day stays");

const byId = ctx.rowsForUserDelete_([mon, tue], {
  client: "zzz_test",
  matchKey: "ZZZTEST",
  date: "2026-10-05",
  id: "tue-1"
});
assert(byId.length === 1 && byId[0].id === "tue-1", "id wins over date");

const byDay = ctx.rowsForUserDelete_([mon, tue], {
  client: "zzz_test",
  matchKey: "ZZZTEST",
  day: "Вторник"
});
assert(byDay.length === 1 && byDay[0].id === "tue-1", "day-only delete stays on that day");

const missed = ctx.rowsForUserDelete_([tue], {
  client: "zzz_test",
  matchKey: "ZZZTEST",
  date: "2026-10-05"
});
assert(missed.length === 0, "missing date does not fall through to another day");

const slotted = ctx.rowsForUserDelete_(
  [
    Object.assign({}, mon, { id: "s1", meta_json: JSON.stringify({ ppSlot: "1" }) }),
    Object.assign({}, mon, { id: "s2", meta_json: JSON.stringify({ ppSlot: "2" }) })
  ],
  { client: "zzz_test", matchKey: "ZZZTEST", date: "2026-10-05", ppSlot: "2" }
);
assert(slotted.length === 1 && slotted[0].id === "s2", "slot narrows two rows on one date");

const drops = ctx.weekDupeDropIds_([mon, tue, fut]);
assert(drops.length === 1 && drops[0].id === "fut-1", "scrub drops only the same-date copy");
assert(!drops.some((r) => r.id === "tue-1"), "scrub keeps the other day");

const keys = {
  Понедельник: "2026-10-05",
  "Будущая неделя": "2026-10-05",
  Вторник: "2026-10-06"
};
const cleared = ctx.daysToClearForDelete_("Понедельник", "2026-10-05", keys);
assert(cleared.indexOf("Понедельник") >= 0 && cleared.indexOf("Будущая неделя") >= 0, "same sheet date");
assert(cleared.indexOf("Вторник") < 0, "other sheet date stays");
const namedOnly = ctx.daysToClearForDelete_("Вторник", "", keys);
assert(namedOnly.length === 1 && namedOnly[0] === "Вторник", "no date clears only the named day");
const dateWins = ctx.daysToClearForDelete_("Вторник", "2026-10-05", keys);
assert(dateWins.indexOf("Вторник") < 0 && dateWins.indexOf("Понедельник") >= 0, "date beats a mismatched day name");

console.log("test-delete-one-record ok");
