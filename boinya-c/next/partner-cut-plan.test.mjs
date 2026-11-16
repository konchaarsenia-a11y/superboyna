/**
 * partner-cut-plan-h1: партнёры (qty) входят в сумму нарезки;
 * новый тип заказа с граммами не выпадает молча.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

function extractFn(src, name) {
  const re = new RegExp("function " + name + "\\s*\\(");
  const i = src.search(re);
  if (i < 0) throw new Error("missing " + name);
  let depth = 0;
  let started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") {
      depth++;
      started = true;
    } else if (src[j] === "}") {
      depth--;
      if (started && depth === 0) return src.slice(i, j + 1);
    }
  }
  throw new Error("unclosed " + name);
}

function fixture() {
  const src = readFileSync(new URL("../proxy/worker.js", import.meta.url), "utf8");
  const names = [
    "basketItemAmountRawD1_",
    "basketItemAmountD1_",
    "normalizeBasketItemAmountD1_",
    "normalizeBasketAmountsD1_",
    "catalogAliasNameD1_",
    "isCrumbBasketItemD1_",
    "crumbTierOrFractionSubD1_",
    "crumbCanonCutNameD1_",
    "expandCrumbsForCuttingD1_",
    "crumbPartCountD1_",
    "isPieceSku_",
    "chewSubToken_",
    "crumbParentFromBasketName_",
    "cuttingNameFromBasketItem_",
    "cuttingAggKey_",
    "basketForCutting_",
    "cuttingItemsFromPeople_",
    "cuttingDryByAgg_",
    "cuttingSnapMissesAssembly_",
    "isChewProductNameD1_",
    "isChewCrumbSourceD1_",
    "normalizeBasketItemAliasesD1_",
    "partnerOrderDate_",
    "partnerTreatMapForLine_",
    "partnerTreatsToPpBasket_",
    "partnerBasketForClients_",
    "partnerClientFromOrder_",
    "partnerPointKey_"
  ];
  const ctx = createContext({ console });
  const mapBlock = extractFn(src, "partnerTreatMapForLine_");
  // PARTNER_TREAT_PP_MAP_ sits above partnerTreatMapForLine_
  const mapConstIdx = src.lastIndexOf("const PARTNER_TREAT_PP_MAP_", src.indexOf("function partnerTreatMapForLine_"));
  const mapConstEnd = src.indexOf("};", mapConstIdx) + 2;
  const mapConst = src.slice(mapConstIdx, mapConstEnd);
  runInContext(
    mapConst +
      "\n" +
      names.map((n) => extractFn(src, n)).join("\n") +
      "\nfunction fracGridWordD1_(){return \"\";}\nfunction igFractionWordD1_(){return \"\";}\n",
    ctx
  );
  return ctx;
}

function dryOf(items, nameRe) {
  const hit = (items || []).find(function (it) {
    return nameRe.test(String((it && it.name) || ""));
  });
  return hit ? Number(hit.dry) || 0 : 0;
}

test("partner-cut-plan-h1: partner qty basket enters cutting sum", () => {
  const fx = fixture();
  const week = [
    {
      name: "polotno_an",
      segment: "ПП",
      source: "pp",
      basket: [
        { name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", val: 180, value: 180, cat: "dressura" },
        { name: "СЕРДЦЕ", main: "СЕРДЦЕ", val: 0, value: 0, cat: "dressura" }
      ]
    },
    {
      name: "Natnails_minsk",
      segment: "БП",
      source: "bp",
      basket: [
        { name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", val: 30, value: 30, cat: "dressura" },
        { name: "СЕРДЦЕ", main: "СЕРДЦЕ", val: 10, value: 10, cat: "dressura" }
      ]
    },
    {
      name: "Lerooo_",
      segment: "Р",
      source: "retail",
      basket: [
        { name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", val: 20, value: 20, cat: "dressura" },
        { name: "СЕРДЦЕ", main: "СЕРДЦЕ", val: 10, value: 10, cat: "dressura" }
      ]
    }
  ];
  const without = fx.cuttingItemsFromPeople_(week, []);
  assert.equal(dryOf(without, /Л[ЁЕ]ГК/), 230);

  const partner = fx.partnerClientFromOrder_(
    {
      id: "po_test_shev",
      locationName: "Varka Шевченко 1",
      dateIso: "2026-11-16",
      deliverDateIso: "2026-11-16",
      basket: [
        { id: "vr_t_heart", name: "Сердце", qty: 100, unit: "г" },
        { id: "vr_t_lung", name: "Лёгкое", qty: 100, unit: "г" }
      ]
    },
    "Будущая неделя"
  );
  assert.equal(partner.source, "partner");
  assert.ok(partner.basket.some((it) => Number(it.val) === 100));

  const withPartner = fx.cuttingItemsFromPeople_(week.concat([partner]), []);
  assert.equal(dryOf(withPartner, /Л[ЁЕ]ГК/), 330);
  assert.equal(dryOf(withPartner, /СЕРДЦ/), 120);

  const stale = without;
  assert.equal(fx.cuttingSnapMissesAssembly_(stale, withPartner), true);
});

test("partner-cut-plan-h1: unknown order type with grams still counts", () => {
  const fx = fixture();
  const people = [
    {
      name: "future-type-client",
      segment: "НОВЫЙ",
      source: "future_channel",
      orderType: "future_channel",
      basket: [{ name: "ЛЁГКОЕ", main: "ЛЁГКОЕ", grams: 40, cat: "dressura" }]
    }
  ];
  const items = fx.cuttingItemsFromPeople_(people, []);
  assert.equal(dryOf(items, /Л[ЁЕ]ГК/), 40);
});

test("partner-cut-plan-h1: partnerOrderDate_ reads dateIso", () => {
  const fx = fixture();
  assert.equal(fx.partnerOrderDate_({ dateIso: "2026-11-16" }), "2026-11-16");
  assert.equal(fx.partnerOrderDate_({ deliverDateIso: "2026-11-17" }), "2026-11-17");
  assert.equal(fx.partnerOrderDate_({ date: "2026-11-18" }), "2026-11-18");
});
