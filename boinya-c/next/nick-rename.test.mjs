import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wSrc = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
const gsSrc = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
const clients = fs.readFileSync(path.join(root, "boinya-c/next/clients.js"), "utf8");
const partners = fs.readFileSync(path.join(root, "boinya-c/next/partners.js"), "utf8");
const orders = fs.readFileSync(path.join(root, "boinya-c/next/order-payload.js"), "utf8");

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

const wNames = [
  "normalizeMatchKey_",
  "extractInstagramNick_",
  "subscriptionIgFromRow_",
  "stripIgFromText_",
  "subscriptionDisplayFromRow_",
  "preferSubscriptionIdentity_",
  "identityForNickRename_",
  "subscriptionBareWish_",
  "isDistinctPetPair_",
  "sameSubscriptionPerson_",
  "subscriptionSheetKey_",
  "subscriptionNickKeys_",
  "subscriptionMatch_",
  "findSubscriptionIndex_",
  "findSubscriptionRenameIndex_",
  "planSubscriptionUpsert_"
];
const ctx = vm.createContext({ Math, Number, String, isFinite, Object, Array, JSON, Date });
vm.runInContext(wNames.map((n) => extractFn(wSrc, n)).join("\n"), ctx);

const gsNames = [
  "normalizeClientKey_",
  "extractInstagramNick_",
  "clientMatchKey_",
  "nicksMatch_",
  "composeSubscriptionNickCell_",
  "composeRenamedSubscriptionNickCell_",
  "findSubscriptionRenameRowIndex_"
];
const gsCtx = vm.createContext({ Math, Number, String, Object, Array, RegExp });
vm.runInContext(gsNames.map((n) => extractFn(gsSrc, n)).join("\n"), gsCtx);

test("смена ника ПП попадает в ту же строку D1", () => {
  const arr = [
    { sheet: "ПП", subId: "7", nick: "old_pp", label: "Маша old_pp", phone: "+375291111111" },
    { sheet: "ПП", subId: "24", nick: "kafetafreya", label: "kafetafreya" }
  ];
  const plan = ctx.planSubscriptionUpsert_(arr, {
    nick: "new_pp",
    label: "Маша old_pp",
    prevNick: "old_pp",
    prevLabel: "Маша old_pp",
    sheet: "ПП",
    subId: "7"
  });
  assert.equal(plan.idx, 0);
  assert.equal(plan.renamed, true);
  const ident = ctx.identityForNickRename_("new_pp", "Маша old_pp", "old_pp", "Маша old_pp");
  assert.equal(ident.nick, "new_pp");
  assert.equal(ident.label, "Маша new_pp");
  assert.equal(arr.length, 2);
});

test("чужой subId и вторая собака не переименовываются", () => {
  const shared = [
    { sheet: "ПП", subId: "24", nick: "rit_murr", label: "РИТА rit_murr" },
    { sheet: "ПП", subId: "24", nick: "kafetafreya", label: "kafetafreya" }
  ];
  const miss = ctx.planSubscriptionUpsert_(shared, {
    nick: "brand_new",
    prevNick: "rit_murr",
    sheet: "ПП",
    subId: "99"
  });
  assert.equal(miss.idx, -1);
  assert.equal(miss.renamed, false);
  const pets = [
    { sheet: "ПП", subId: "15", nick: "wow_masha20", label: "wow_masha20", wishes: "ЛЕО" },
    { sheet: "ПП", subId: "16", nick: "wow_masha20", label: "wow_masha20", wishes: "Лэйла" }
  ];
  const ambiguous = ctx.findSubscriptionRenameIndex_(pets, "wow_masha20", "", "ПП", "");
  assert.equal(ambiguous, -1);
  const oneDog = ctx.findSubscriptionRenameIndex_(pets, "wow_masha20", "", "ПП", "16");
  assert.equal(oneDog, 1);
});

test("БП переименовывается, имя без смены ника не затирает handle", () => {
  const bp = [{ sheet: "БП", subId: "3", nick: "bp_old", label: "Пёс bp_old", status: "БП1" }];
  const plan = ctx.planSubscriptionUpsert_(bp, {
    nick: "bp_new",
    label: "Пёс",
    prevNick: "bp_old",
    sheet: "БП",
    subId: "3"
  });
  assert.equal(plan.renamed, true);
  assert.equal(plan.idx, 0);
  const kept = ctx.preferSubscriptionIdentity_("РИТА", "РИТА", "rit_murr", "РИТА rit_murr");
  assert.equal(kept.nick, "rit_murr");
});

test("лист CRM пишет новый ник в старую строку", () => {
  const data = [
    ["Ник", "ID"],
    ["шапка", ""],
    ["Маша old_pp", "7"],
    ["kafetafreya", "24"]
  ];
  assert.equal(gsCtx.findSubscriptionRenameRowIndex_(data, "old_pp", "Маша old_pp", "7"), 2);
  assert.equal(gsCtx.findSubscriptionRenameRowIndex_(data, "old_pp", "", "24"), -1);
  assert.equal(gsCtx.findSubscriptionRenameRowIndex_(data, "nobody", "", "7"), -1);
  const cell = gsCtx.composeRenamedSubscriptionNickCell_("new_pp", "Маша old_pp", "old_pp", "Маша old_pp");
  assert.equal(cell, "Маша new_pp");
});

test("карточка шлёт прежний ник, партнёр и заказ не плодят строку", () => {
  const save = clients.slice(clients.indexOf("async function saveCard"), clients.indexOf("async function enrollGo"));
  assert.match(save, /prevNick/);
  assert.match(save, /openedNick/);
  assert.match(partners, /if \(editId\) body\.id = editId/);
  assert.match(orders, /editClient/);
  assert.match(orders, /originalClient/);
  assert.match(gsSrc, /editNickSave/);
  assert.match(gsSrc, /renameClientProfileIfAlone_/);
});
