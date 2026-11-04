import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePriceSkuId_,
  costsMapFromVersionsV2_,
  lookupCostV2_,
  PRICE_COST_SEED_1110_,
  PRICE_CANON_V2_SEED_FROM_
} from "./price-canon-v2.js";

test("sku_id: ШТ. и шт. → один id (колени/носы/шеи)", () => {
  assert.equal(resolvePriceSkuId_("КОЛЕНИ ШТ.", ""), "KOLENI");
  assert.equal(resolvePriceSkuId_("КОЛЕНИ шт.", ""), "KOLENI");
  assert.equal(resolvePriceSkuId_("НОСЫ ШТ.", ""), "NOSY");
  assert.equal(resolvePriceSkuId_("НОСЫ шт.", ""), "NOSY");
  assert.equal(resolvePriceSkuId_("УТИНЫЕ ШЕИ ШТ.", ""), "UTINYE_SHEI");
  assert.equal(resolvePriceSkuId_("ЛОП ХРЯЩ ШТ.", ""), "LOP_HRYASH");
  assert.equal(resolvePriceSkuId_("ПЕРЕПЕЛКИ ШТ.", ""), "PEREPELKI");
  assert.equal(resolvePriceSkuId_("ПЕРЕПЁЛКИ шт.", ""), "PEREPELKI");
});

test("sku_id: корень/жила фракции", () => {
  assert.equal(resolvePriceSkuId_("БЫЧИЙ КОРЕНЬ", "СРЕД"), "KOREN_M");
  assert.equal(resolvePriceSkuId_("БЫЧИЙ КОРЕНЬ", "БОЛ"), "KOREN_L");
  assert.equal(resolvePriceSkuId_("БЫЧИЙ КОРЕНЬ", "МАЛ"), "KOREN_S");
  assert.equal(resolvePriceSkuId_("СТАНОВАЯ ЖИЛА", "ПАЛК"), "ZHILA_PALK");
  assert.equal(resolvePriceSkuId_("СТАНОВАЯ ЖИЛА", "СРЕД"), "ZHILA_M");
  assert.equal(resolvePriceSkuId_("СТАНОВАЯ ЖИЛА", "БОЛ"), "ZHILA_L");
});

test("seed 11.10: корень сред 2.5 / бол 5, жила сред 1 / бол 2", () => {
  const byId = Object.create(null);
  PRICE_COST_SEED_1110_.forEach((r) => {
    byId[r.id] = r;
  });
  assert.equal(byId.KOREN_M.cost, 2.5);
  assert.equal(byId.KOREN_L.cost, 5);
  assert.equal(byId.KOREN_S.cost, 1.3);
  assert.equal(byId.ZHILA_M.cost, 1);
  assert.equal(byId.ZHILA_L.cost, 2);
  assert.equal(byId.ZHILA_PALK.cost, 0.25);
  assert.equal(PRICE_CANON_V2_SEED_FROM_, "2026-10-11");
});

test("lookupCostV2: map from versions, missing → null (не 0)", () => {
  const versions = PRICE_COST_SEED_1110_.filter((r) => r.cost != null).map((r) => ({
    sku_id: r.id,
    cost: r.cost,
    effectiveFrom: "2026-10-11",
    source: r.source
  }));
  const costs = costsMapFromVersionsV2_(versions, "2026-11-04");
  costs.__canonV2 = true;
  const knee = lookupCostV2_(costs, "КОЛЕНИ ШТ.", "");
  assert.ok(knee);
  assert.equal(knee.unitPrice, 1.17);
  const root = lookupCostV2_(costs, "БЫЧИЙ КОРЕНЬ", "СРЕД");
  assert.equal(root.unitPrice, 2.5);
  const miss = lookupCostV2_(costs, "НЕСУЩЕСТВУЮЩЕЕ", "");
  assert.equal(miss, null);
});
