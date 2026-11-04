import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePriceSkuId_,
  costsMapFromVersionsV2_,
  lookupCostV2_,
  cost100FromKgShrink_,
  costPieceFromKgPcs_,
  costPieceFromBatch_,
  pcsPerKgFromBatch_,
  weightedAvgPieceCost_,
  weightedAvgPcsPerKg_,
  annotatePieceBatchHints_,
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

test("raw-kg-shrink: себес100 = кг/10/(1−%/100)", () => {
  assert.equal(cost100FromKgShrink_(17.5, 0), 1.75);
  assert.equal(cost100FromKgShrink_(20, 80), 10);
  assert.equal(cost100FromKgShrink_(10, 50), 2);
  assert.equal(cost100FromKgShrink_(20, 100), null);
  assert.equal(cost100FromKgShrink_("20", "80"), 10);
});

test("chew-pcs-kg: себес/шт = кг/шт_в_кг; партия не трогает unitPrice/pcsPerKg", () => {
  assert.equal(costPieceFromKgPcs_(45, 20), 2.25);
  assert.equal(costPieceFromKgPcs_(10, 10), 1);
  assert.equal(costPieceFromBatch_(10, 2, 20), 1);
  assert.equal(pcsPerKgFromBatch_(2, 20), 10);
  const batches = [
    { pieces: 20, weightKg: 2, costPiece: 1 },
    { pieces: 10, weightKg: 1, costPiece: 3 }
  ];
  assert.equal(weightedAvgPieceCost_(batches), 1.6667);
  assert.equal(weightedAvgPcsPerKg_(batches), 10);
  /* ручные pcsPerKg=15 / unitPrice=1.17; партия только hint. */
  const costs = annotatePieceBatchHints_(
    { KOLENI: { name: "КОЛЕНИ", unitPrice: 1.17, pcsPerKg: 15, piece: true, skuId: "KOLENI" } },
    { KOLENI: batches }
  );
  assert.equal(costs.KOLENI.unitPrice, 1.17);
  assert.equal(costs.KOLENI.pcsPerKg, 15);
  assert.equal(costs.KOLENI.batchAvg, 1.6667);
  assert.equal(costs.KOLENI.batchPcsPerKg, 10);
  assert.equal(costs.KOLENI.lastBatchCost, 3);
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
