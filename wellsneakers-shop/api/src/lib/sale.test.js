import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isSaleQuery,
  isOnSale,
  parseOldPriceByn,
  mapOcPrices,
  filterOnSaleProducts,
  filterOnSaleModels,
  readOldPriceField,
} from "./sale.js";
import { groupProductsIntoModels } from "./modelGroup.js";

describe("isSaleQuery", () => {
  it("accepts 1/true/yes/on in any case", () => {
    for (const v of ["1", "true", "TRUE", "yes", "On"]) {
      assert.equal(isSaleQuery(v), true, v);
    }
  });
  it("rejects empty and other flags", () => {
    for (const v of ["", "0", "false", "no", null, undefined, "sale"]) {
      assert.equal(isSaleQuery(v), false, String(v));
    }
  });
});

describe("parseOldPriceByn / isOnSale", () => {
  it("treats missing, empty and non-positive as null", () => {
    assert.equal(parseOldPriceByn(null), null);
    assert.equal(parseOldPriceByn(""), null);
    assert.equal(parseOldPriceByn(0), null);
    assert.equal(parseOldPriceByn("abc"), null);
  });
  it("is on sale only when old_price_byn is set and greater than price", () => {
    assert.equal(isOnSale({ price_byn: 150, old_price_byn: 200 }), true);
    assert.equal(isOnSale({ price_byn: "150.00", old_price_byn: "200.00" }), true);
    assert.equal(isOnSale({ price_byn: 150, old_price_byn: 150 }), false);
    assert.equal(isOnSale({ price_byn: 150, old_price_byn: null }), false);
    assert.equal(isOnSale({ price_byn: 150, old_price_byn: "" }), false);
    assert.equal(isOnSale({ price_byn: 150 }), false);
  });
});

describe("mapOcPrices", () => {
  it("leaves old_price null when OC has only the selling price", () => {
    assert.deepEqual(mapOcPrices({ price: 170 }), { price_byn: 170, old_price_byn: null });
  });
  it("uses OC special as selling price and regular as old", () => {
    assert.deepEqual(mapOcPrices({ price: 170, special: 140 }), {
      price_byn: 140,
      old_price_byn: 170,
    });
  });
  it("maps an explicit old_price column when it is higher", () => {
    assert.deepEqual(mapOcPrices({ price: 170, oldPrice: 200 }), {
      price_byn: 170,
      old_price_byn: 200,
    });
  });
  it("ignores special/old that are not a real markdown", () => {
    assert.deepEqual(mapOcPrices({ price: 170, special: 170 }), {
      price_byn: 170,
      old_price_byn: null,
    });
    assert.deepEqual(mapOcPrices({ price: 170, special: 0 }), {
      price_byn: 170,
      old_price_byn: null,
    });
    assert.deepEqual(mapOcPrices({ price: 170, oldPrice: 100 }), {
      price_byn: 170,
      old_price_byn: null,
    });
  });
});

describe("sale catalog filter", () => {
  const rows = [
    {
      id: 1,
      name: "AIR JORDAN 11 BLACK",
      brand: "NIKE",
      article: "1577",
      price_byn: 140,
      old_price_byn: 170,
      active: true,
      sizes: [{ size: "41", qty: 1 }],
    },
    {
      id: 2,
      name: "AIR JORDAN 11 GREY/BLUE",
      brand: "NIKE",
      article: "1576",
      price_byn: 170,
      old_price_byn: null,
      active: true,
      sizes: [{ size: "42", qty: 2 }],
    },
    {
      id: 3,
      name: "NIKE INITIATOR BLACK",
      brand: "NIKE",
      article: "1401",
      price_byn: 150,
      active: true,
      sizes: [{ size: "42", qty: 1 }],
    },
  ];

  it("filters products then grouping keeps only on-sale colorways", () => {
    const saleRows = filterOnSaleProducts(rows);
    assert.equal(saleRows.length, 1);
    assert.equal(saleRows[0].article, "1577");
    const models = groupProductsIntoModels(saleRows);
    assert.equal(models.length, 1);
    assert.equal(models[0].colors.length, 1);
    assert.equal(models[0].colors[0].article, "1577");
    assert.equal(models[0].colors[0].old_price_byn, 170);
    assert.equal(models[0].colors[0].onSale, true);
  });

  it("filterOnSaleModels drops models with no sale color", () => {
    const models = groupProductsIntoModels(rows);
    assert.equal(models.length, 2);
    const sale = filterOnSaleModels(models);
    assert.equal(sale.length, 1);
    assert.equal(sale[0].name, "AIR JORDAN 11");
    assert.equal(sale[0].colors.length, 1);
  });

  it("sale=1 with no markdowns yields total 0", () => {
    const none = rows.map((r) => ({ ...r, old_price_byn: null, price_byn: 150 }));
    const models = groupProductsIntoModels(filterOnSaleProducts(none));
    assert.equal(models.length, 0);
  });
});

describe("readOldPriceField", () => {
  it("omits when the client did not send the field", () => {
    assert.equal(readOldPriceField({ price_byn: 150 }), undefined);
  });
  it("clears on empty and accepts a number", () => {
    assert.equal(readOldPriceField({ old_price_byn: "" }), null);
    assert.equal(readOldPriceField({ oldPriceByn: 220 }), 220);
  });
});
