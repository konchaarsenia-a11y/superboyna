#!/usr/bin/env node
/**
 * Подписки: дубли схлопываются, имя без ника не затирает Instagram,
 * две собаки одного инста остаются, rit_murr не матчится с чужим subId.
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
const uiSrc = fs.readFileSync(path.join(root, "boinya-c/app.main.js"), "utf8");

assert(/v71115996/.test(uiSrc), "APP_VERSION v71115996");
assert(/function preferSubscriptionIdentity_/.test(wSrc), "worker identity");
assert(/function collapseSubscriptionList_/.test(wSrc), "worker collapse");
assert(/function composeSubscriptionNickCell_/.test(gsSrc), "gas compose nick cell");
assert(/action === "repairSubscriptionDupes"/.test(gsSrc), "gas repair route");
assert(/sub-row-nick/.test(uiSrc) && /splitIgNickAndDisplay_/.test(uiSrc), "UI shelves");

const wNames = [
  "normalizeMatchKey_",
  "extractInstagramNick_",
  "subscriptionIgFromRow_",
  "stripIgFromText_",
  "subscriptionDisplayFromRow_",
  "preferSubscriptionIdentity_",
  "subscriptionBareWish_",
  "isDistinctPetPair_",
  "sameSubscriptionPerson_",
  "subscriptionSubstanceScore_",
  "unionSubscriptionBasket_",
  "mergeTextKeep_",
  "bpStageRank_",
  "mergeSubscriptionPair_",
  "collapseSubscriptionList_",
  "phoneTail9_",
  "addrTokens_",
  "addrOverlapScore_",
  "addrLooksSame_",
  "handleEditDistance_",
  "handlesAreTypoTwins_",
  "countPpMissingIg_",
  "restoreMissingSubscriptionNicks_",
  "subscriptionSheetKey_",
  "subscriptionNickKeys_",
  "subscriptionMatch_",
  "sanitizeRaw26CalcFactCost_",
  "surveyKindKey_",
  "surveyPersonKey_",
  "collapseSurveyItems_"
];

const ctx = vm.createContext({
  Math,
  Number,
  String,
  isFinite,
  Object,
  Array,
  JSON,
  Date,
  getSnapRaw_: async function () {
    return { clients: [] };
  }
});
vm.runInContext(wNames.map((n) => extractFn(wSrc, n)).join("\n"), ctx);

const gsNames = [
  "extractInstagramNick_",
  "composeSubscriptionNickCell_",
  "subscriptionBareWishGs_",
  "bpStageRankGs_",
  "isDistinctPetWishPairGs_",
  "sheetRowDisplayNameGs_",
  "sheetRowsSamePerson_"
];
const gsCtx = vm.createContext({ Math, Number, String, Object, Array, RegExp });
vm.runInContext(gsNames.map((n) => extractFn(gsSrc, n)).join("\n"), gsCtx);

const ident = ctx.preferSubscriptionIdentity_("РИТА", "РИТА", "rit_murr", "РИТА rit_murr");
assert(ident.nick === "rit_murr", "name-only must not erase rit_murr, got " + ident.nick);
assert(/rit_murr/i.test(ident.label) && /РИТА/.test(ident.label), "label keeps name and handle");

const composed = gsCtx.composeSubscriptionNickCell_("dasha_2135", "ДАША", "ДАША");
assert(composed === "ДАША dasha_2135", "compose ДАША dasha_2135, got " + composed);

const collapsed = ctx.collapseSubscriptionList_([
  {
    sheet: "АФК",
    subId: "25",
    nick: "navoichyk.tattoo",
    label: "navoichyk.tattoo",
    address: "ул Ленина 1",
    phone: "+375291111111",
    basket: [{ main: "Сердце", sub: "мелкое", val: 2 }]
  },
  {
    sheet: "АФК",
    subId: "25",
    nick: "navoichyk.tattoo",
    label: "Имя navoichyk.tattoo",
    basket: [
      { main: "Сердце", sub: "мелкое", val: 2 },
      { main: "Лёгкое", sub: "мелкое", val: 1 }
    ]
  }
]);
assert(collapsed.length === 1, "same subId AFK collapses to 1");
assert(collapsed[0].address === "ул Ленина 1", "address kept");
assert(collapsed[0].phone === "+375291111111", "phone kept");
assert(collapsed[0].basket.length === 2, "basket union, not dropped");
assert(collapsed[0].nick === "navoichyk.tattoo", "nick stays handle");

const pets = ctx.collapseSubscriptionList_([
  { sheet: "АФК", subId: "15", nick: "wow_masha20", label: "wow_masha20", wishes: "ЛЕО", basket: [{ main: "A", val: 1 }] },
  { sheet: "АФК", subId: "16", nick: "wow_masha20", label: "wow_masha20", wishes: "Лэйла", basket: [{ main: "B", val: 1 }] }
]);
assert(pets.length === 2, "wow_masha20 two dogs stay");

const bp = ctx.collapseSubscriptionList_([
  {
    sheet: "БП",
    subId: "42",
    nick: "Andreiprigunov",
    label: "Andreiprigunov",
    status: "БП1",
    wishes: "старая длинная заметка про доставку и европочту на дом",
    address: "старый"
  },
  {
    sheet: "БП",
    subId: "52",
    nick: "Andreiprigunov",
    label: "Andreiprigunov",
    status: "ФИНАЛ",
    wishes: "европочта новая длинная заметка не короткая кличка",
    phone: "+375290000000"
  }
]);
assert(bp.length === 1, "Andreiprigunov stages collapse");
assert(/ФИНАЛ/.test(String(bp[0].status)), "ФИНАЛ wins");
assert(bp[0].phone === "+375290000000", "phone filled from sibling");
assert(/старый|европочта/.test(String(bp[0].wishes || "") + String(bp[0].address || "")), "notes not dropped");

assert(
  ctx.subscriptionMatch_({ nick: "rit_murr", label: "РИТА rit_murr", sheet: "ПП", subId: "24" }, "RITMURR", "ПП", "") === true,
  "rit_murr matches own key"
);
assert(
  ctx.subscriptionMatch_({ nick: "kafetafreya", label: "kafetafreya", sheet: "ПП", subId: "24" }, "RITMURR", "ПП", "24") === false,
  "same subId does not match a different person"
);
assert(
  ctx.sameSubscriptionPerson_(
    { sheet: "ПП", subId: "24", nick: "РИТА", label: "РИТА" },
    { sheet: "ПП", subId: "24", nick: "kafetafreya", label: "kafetafreya" }
  ) === false,
  "РИТА is not kafetafreya"
);
assert(
  ctx.sameSubscriptionPerson_(
    { sheet: "ПП", subId: "14", nick: "ДАША", label: "ДАША" },
    { sheet: "ПП", subId: "15", nick: "daria.nsv", label: "ДАША daria.nsv" }
  ) === false,
  "ДАША subId 14 is not daria.nsv"
);

assert(
  gsCtx.sheetRowsSamePerson_("Andreiprigunov", "42", "длинная заметка один", "Andreiprigunov", "52", "длинная заметка два") === true,
  "sheet rows same person"
);
assert(
  gsCtx.sheetRowsSamePerson_("wow_masha20", "15", "ЛЕО", "wow_masha20", "16", "Лэйла") === false,
  "sheet pet pair skipped"
);

const raw = ctx.sanitizeRaw26CalcFactCost_({
  scheme: "RAW26",
  factCost: 157.5,
  calcFactCost: 161.18,
  clientPrice: 171.2
});
assert(Number(raw.calcFactCost) === 157.5, "RAW26 calc still capped to fact");
assert(Number(raw.clientPrice) === 157.5, "RAW26 clientPrice still capped to fact");

const surveys = ctx.collapseSurveyItems_([
  { nick: "Boris.halepov", kind: "final", dueDate: "2026-09-20", id: "old" },
  { nick: "@Boris.halepov", kind: "final", dueDate: "2026-09-26", id: "new", note: "keep" }
]);
assert(surveys.length === 1 && surveys[0].dueDate === "2026-09-26", "survey dedupe by handle+kind");
assert(surveys[0].note === "keep" || surveys[0].id === "new", "later survey kept");

const profiles = [
  { nick: "sunfkower2175", phone: "375333126263", address: "Кунцевщина 13 кв 15" },
  { nick: "rit_murr", phone: "+375296077213", address: "Нововиленская 7б кв 3" },
  { nick: "confettins97", phone: "375297396003", address: "В. Гостинец 158" },
  { nick: "Qwert_mor", phone: "+375259364034", address: "Восточная 54" },
  { nick: "Юлия", phone: "375297429163", address: "Руссиянова 1" },
  { nick: "dasha_2135", phone: "", address: "Горовца 34" },
  { nick: "daria.nsv", phone: "375290000001", address: "другая улица 9" }
];
ctx.getSnapRaw_ = async function (_env, key) {
  if (key === "listClientProfiles") return { clients: profiles };
  return null;
};
const pp = [
  { sheet: "ПП", subId: "3", nick: "Тамара", label: "Тамара", phone: "375333126263", address: "Кунцевщина 13 кв 15" },
  { sheet: "ПП", subId: "24", nick: "РИТА", label: "РИТА", phone: "375296077213", address: "Нововиленская 7б кв 3" },
  { sheet: "ПП", subId: "31", nick: "ТАТЬЯНА", label: "ТАТЬЯНА", phone: "375297396003", address: "В. Гостинец 158" },
  { sheet: "ПП", subId: "52", nick: "Юлия", label: "Юлия", phone: "+375259364034", address: "Восточная 54" },
  { sheet: "ПП", subId: "14", nick: "ДАША", label: "ДАША", phone: "-", address: "Райниса 9", wishes: "Средце не интересно" },
  { sheet: "ПП", subId: "29", nick: "Маргарита Сергеевна", label: "Маргарита Сергеевна", phone: "", address: "" }
];
const restored = await ctx.restoreMissingSubscriptionNicks_({ DB: null }, pp);
assert(restored === 4, "phone restore count 4, got " + restored);
assert(pp[0].nick === "sunfkower2175", "Тамара → sunfkower2175");
assert(pp[1].nick === "rit_murr", "РИТА → rit_murr");
assert(pp[2].nick === "confettins97", "ТАТЬЯНА → confettins97");
assert(pp[3].nick === "Qwert_mor", "Юлия phone → Qwert_mor not the other Юлия");
assert(pp[4].nick === "ДАША", "ДАША without matching phone stays");
assert(pp[5].nick === "Маргарита Сергеевна", "no source stays");

const tamara = [
  {
    sheet: "ПП",
    subId: "3",
    nick: "Тамара",
    label: "Тамара",
    phone: "375333126263",
    address: "УЛ. КУНЦЕВЩИНА 13  КВ. 15"
  }
];
ctx.getSnapRaw_ = async function () {
  return {
    clients: [
      { nick: "sunfkower2175", phone: "375333126263", address: "улица Кунцевщина · 13 · кв.15" },
      { nick: "sunflower2175", phone: "333126263", address: "Кунцевщина 13" }
    ]
  };
};
const tamaraN = await ctx.restoreMissingSubscriptionNicks_({ DB: null }, tamara);
assert(tamaraN === 1 && tamara[0].nick === "sunfkower2175", "typo twins pick fuller address, got " + tamara[0].nick);

console.log("ok subs-dedupe-nicks");
