#!/usr/bin/env node
/**
 * Перенос ПП↔АФК: источник снимается, имя без ника не создаёт вторую карточку,
 * удаление «Андрей» не трогает andreiprigunov.
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
const uiSrc = fs.readFileSync(path.join(root, "boinya-c/next/clients.js"), "utf8");

assert(/nick: card\.nick \|\| ""/.test(uiSrc), "clients.js sends stable nick");
assert(/label: card\.label \|\| card\.nick/.test(uiSrc), "clients.js sends label separately");
assert(!/action: "moveSubscription",\s*nick: card\.label \|\| card\.nick/.test(uiSrc), "move no longer sends display as nick");
assert(/function selectSubscriptionMoveRows_/.test(gsSrc), "gas move selector");
assert(/function repairPpAfkTrioSheets_/.test(gsSrc), "gas trio repair");
assert(/confirm=evgenia-marga-andrei/.test(gsSrc), "confirm token documented in gas");
assert(/function subscriptionMovePlan_/.test(wSrc), "worker move plan");
assert(/function subscriptionDeleteHit_/.test(wSrc), "worker delete hit");
assert(/function planPpAfkTrioRepair_/.test(wSrc), "worker trio plan");

const wNames = [
  "normalizeMatchKey_",
  "matchKeyAliases_",
  "extractInstagramNick_",
  "subscriptionIgFromRow_",
  "stripIgFromText_",
  "subscriptionDisplayFromRow_",
  "preferSubscriptionIdentity_",
  "subscriptionBareWish_",
  "isDistinctPetPair_",
  "sameSubscriptionPerson_",
  "subscriptionSheetKey_",
  "subscriptionNickKeys_",
  "subscriptionMatch_",
  "findSubscriptionIndex_",
  "subscriptionSubstanceScore_",
  "unionSubscriptionBasket_",
  "mergeTextKeep_",
  "bpStageRank_",
  "mergeSubscriptionPair_",
  "collapseSubscriptionList_",
  "sanitizeRaw26CalcFactCost_",
  "gasSubscriptionLooksFound_",
  "sameSubscriptionIdentityAcrossSheets_",
  "subscriptionFieldAliases_",
  "subscriptionDeleteHit_",
  "subscriptionMovePlan_",
  "ppAfkNormName_",
  "isEvgeniaSubRow_",
  "isMargaSubRow_",
  "isAndreiNameOnlySubRow_",
  "isAndreiPrigSubRow_",
  "scanPpAfkIssues_",
  "planPpAfkTrioRepair_"
];

const ctx = vm.createContext({ Math, Number, String, isFinite, Object, Array, JSON, Date, RegExp });
vm.runInContext(wNames.map((n) => extractFn(wSrc, n)).join("\n"), ctx);

const gsNames = [
  "normalizeClientKey_",
  "extractInstagramNick_",
  "clientMatchKey_",
  "nicksMatch_",
  "sanitizeSubId_",
  "selectSubscriptionMoveRows_"
];
const gs = vm.createContext({ Math, Number, String, Object, Array, RegExp });
vm.runInContext(gsNames.map((n) => extractFn(gsSrc, n)).join("\n"), gs);

const evgPp = {
  sheet: "ПП",
  subId: "22",
  nick: "evgenia_In",
  label: "Евгения evgenia_In",
  wishes: "Хрящ полоски",
  basket: [{ main: "ЛЁГКОЕ", val: 100 }]
};
const evgAfk = {
  sheet: "АФК",
  subId: "22",
  nick: "evgenia_In",
  label: "Евгения evgenia_In",
  address: "Рыбалко 11"
};
const moved = ctx.subscriptionMovePlan_([evgPp, evgAfk], {
  nick: "Евгения evgenia_In",
  label: "Евгения evgenia_In",
  subId: "22",
  fromSheet: "АФК",
  toSheet: "ПП"
});
assert(!moved.error, "afk→pp move found the row, " + moved.error);
assert(moved.subscriptions.length === 1, "evgenia stays one card, got " + moved.subscriptions.length);
assert(ctx.subscriptionSheetKey_(moved.subscriptions[0]) === "ПП", "evgenia only ПП");
assert(moved.removed.length === 1, "afk source removed");

const back = ctx.subscriptionMovePlan_(moved.subscriptions, {
  nick: "evgenia_In",
  label: "Евгения evgenia_In",
  subId: "22",
  fromSheet: "ПП",
  toSheet: "АФК"
});
assert(!back.error, "pp→afk");
assert(back.subscriptions.length === 1 && ctx.subscriptionSheetKey_(back.subscriptions[0]) === "АФК", "only АФК");
const otherSpelling = ctx.subscriptionMovePlan_(moved.subscriptions, {
  nick: "evgenia_ln",
  label: "evgenia_ln",
  subId: "",
  fromSheet: "ПП",
  toSheet: "АФК"
});
assert(otherSpelling.error === "not_found", "evgenia_ln is not evgenia_In, no new card");

const ghost = ctx.subscriptionMovePlan_([evgPp], {
  nick: "Андрей",
  label: "Андрей",
  fromSheet: "ПП",
  toSheet: "АФК"
});
assert(ghost.error === "not_found", "display name does not create a row, got " + ghost.error);

const prig = {
  sheet: "ПП",
  subId: "7",
  nick: "andreiprigunov",
  label: "andreiprigunov",
  wishes: "европочта",
  address: "Жодино"
};
const andrei = {
  sheet: "ПП",
  subId: "99",
  nick: "Андрей",
  label: "Андрей",
  wishes: "только у дубля",
  deliveries: 2
};
const missCreate = ctx.subscriptionMovePlan_([prig, andrei], {
  nick: "Андрей",
  fromSheet: "БП",
  toSheet: "ПП"
});
assert(missCreate.error === "not_found", "move from empty source does not append Андрей");

const delAndrei = [prig, andrei].filter(function (row) {
  return !ctx.subscriptionDeleteHit_(row, { nick: "Андрей", label: "Андрей", sheet: "ПП", subId: "99" });
});
assert(delAndrei.length === 1 && delAndrei[0].nick === "andreiprigunov", "delete Андрей keeps andreiprigunov");

const delOriginal = [prig, andrei].filter(function (row) {
  return !ctx.subscriptionDeleteHit_(row, {
    nick: "andreiprigunov",
    label: "andreiprigunov",
    sheet: "ПП",
    subId: "7"
  });
});
assert(delOriginal.length === 1 && delOriginal[0].nick === "Андрей", "delete original keeps the name-only card");

const natalia = { sheet: "ПП", subId: "34", nick: "Наталья Фалютинская", label: "Наталья Фалютинская" };
assert(
  ctx.subscriptionDeleteHit_(natalia, { nick: "Маргарита Сергеевна", label: "Маргарита Сергеевна", subId: "34", sheet: "ПП" }) === false,
  "same subId does not delete Наталья"
);

const trio = ctx.planPpAfkTrioRepair_([
  evgPp,
  evgAfk,
  { sheet: "ПП", subId: "3", nick: "Маргарита Сергеевна", label: "Маргарита Сергеевна", wishes: "старое" },
  { sheet: "АФК", subId: "34", nick: "Маргарита Сергеевна", label: "Маргарита Сергеевна", wishes: "на афк" },
  prig,
  andrei,
  { sheet: "ПП", subId: "2", nick: "liliasamusik", label: "ЛИЛИЯ liliasamusik" }
]);
const left = trio.subscriptions;
assert(left.filter(ctx.isEvgeniaSubRow_).every((r) => ctx.subscriptionSheetKey_(r) === "ПП"), "trio evgenia only ПП");
assert(left.filter(ctx.isEvgeniaSubRow_).length === 1, "one evgenia");
assert(left.filter(ctx.isMargaSubRow_).every((r) => ctx.subscriptionSheetKey_(r) === "АФК"), "trio marga only АФК");
assert(left.filter(ctx.isMargaSubRow_).length === 1, "one marga");
assert(!left.some(ctx.isAndreiNameOnlySubRow_), "Андрей dropped");
const kept = left.find(ctx.isAndreiPrigSubRow_);
assert(kept && /только у дубля/.test(String(kept.wishes || "")), "dup wishes merged into andreiprigunov");
assert(left.some((r) => r.nick === "liliasamusik"), "other client untouched");

const sheetRows = [
  ["ник", "id"],
  ["Наталья Фалютинская", "34"],
  ["Маргарита Сергеевна", "34"],
  ["Евгения evgenia_In", "22"],
  ["Андрей", "99"],
  ["andreiprigunov", "7"]
];
const margaIdx = gs.selectSubscriptionMoveRows_(sheetRows, "Маргарита Сергеевна", "Маргарита Сергеевна", "34");
assert(margaIdx.length === 1 && sheetRows[margaIdx[0]][0] === "Маргарита Сергеевна", "subId 34 does not steal Наталья");
const evgIdx = gs.selectSubscriptionMoveRows_(sheetRows, "Евгения evgenia_In", "", "22");
assert(evgIdx.length === 1 && /evgenia_In/.test(sheetRows[evgIdx[0]][0]), "evgenia found by label");
const andreiIdx = gs.selectSubscriptionMoveRows_(sheetRows, "Андрей", "Андрей", "7");
assert(andreiIdx.length === 1 && sheetRows[andreiIdx[0]][0] === "Андрей", "Андрей is not andreiprigunov even with his subId");

assert(ctx.gasSubscriptionLooksFound_({ status: "success", nick: "Андрей", subId: "", rowIndex: 0, basket: [] }) === false, "empty gas stub is not a card");
assert(ctx.gasSubscriptionLooksFound_({ status: "success", nick: "evgenia_In", subId: "22", rowIndex: 31, basket: [{}] }) === true, "real gas row is a card");

const scan = ctx.scanPpAfkIssues_([
  evgPp,
  evgAfk,
  { sheet: "ПП", nick: "ДАША", label: "ДАША", subId: "14" },
  { sheet: "ПП", nick: "dasha_2135", label: "ДАША dasha_2135", subId: "14" },
  { sheet: "АФК", nick: "Маргарита Сергеевна", label: "Маргарита Сергеевна", subId: "34" }
]);
assert(scan.bothSheets.some((x) => /EVGENIA/i.test(x.key)), "scan sees evgenia on both sheets");
assert(scan.nameOnlyTwins.some((t) => t.nameOnly.nick === "ДАША"), "scan lists ДАША next to a handle, does not imply a write");
assert(!scan.bothSheets.some((x) => /МАРГАРИТА/.test(x.key)), "unique Маргарита is not a both-sheets dup");

console.log("ok pp-afk-move");
