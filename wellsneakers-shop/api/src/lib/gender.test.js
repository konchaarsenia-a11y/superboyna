import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseGenderQuery,
  normalizeGender,
  inferGender,
  readGenderField,
  filterProductsByGender,
  productMatchesGender,
} from "./gender.js";
import { groupProductsIntoModels } from "./modelGroup.js";

describe("parseGenderQuery", () => {
  it("maps URL/API aliases to men/women/unisex", () => {
    assert.equal(parseGenderQuery("men"), "men");
    assert.equal(parseGenderQuery("Male"), "men");
    assert.equal(parseGenderQuery("ему"), "men");
    assert.equal(parseGenderQuery("women"), "women");
    assert.equal(parseGenderQuery("женское"), "women");
    assert.equal(parseGenderQuery("ей"), "women");
    assert.equal(parseGenderQuery("unisex"), "unisex");
  });
  it("rejects empty and unknown flags", () => {
    for (const v of ["", "0", "kids", "sale", null, undefined]) {
      assert.equal(parseGenderQuery(v), "", String(v));
    }
  });
});

describe("inferGender", () => {
  it("does not guess generic sneaker names", () => {
    assert.equal(inferGender({ name: "AIR JORDAN 11 BLACK" }), null);
    assert.equal(inferGender({ name: "NIKE INITIATOR BLACK" }), null);
    assert.equal(inferGender({ name: "ADIDAS SUPERSTAR WHITE" }), null);
    assert.equal(inferGender({ name: "AIR MAX 90" }), null);
  });
  it("reads explicit WMNS / women / женск tokens", () => {
    assert.equal(inferGender({ name: "NIKE AIR FORCE 1 WMNS WHITE" }), "women");
    assert.equal(inferGender({ name: "ADIDAS GAZELLE WOMEN PINK" }), "women");
    assert.equal(inferGender({ category: "Женские кроссовки" }), "women");
    assert.equal(inferGender({ name: "Кроссовки женские белые" }), "women");
  });
  it("reads men / мужск tokens", () => {
    assert.equal(inferGender({ name: "NIKE DUNK LOW MENS BLACK" }), "men");
    assert.equal(inferGender({ category: "Мужская обувь" }), "men");
  });
  it("keeps explicit column and unisex", () => {
    assert.equal(inferGender({ name: "AIR FORCE 1", gender: "women" }), "women");
    assert.equal(inferGender({ name: "SLIDE UNISEX BLACK" }), "unisex");
    assert.equal(inferGender({ name: "MENS WMNS PACK" }), "unisex");
  });
});

describe("readGenderField", () => {
  it("omits when the client did not send the field", () => {
    assert.equal(readGenderField({ name: "x" }), undefined);
  });
  it("clears on empty and accepts a value", () => {
    assert.equal(readGenderField({ gender: "" }), null);
    assert.equal(readGenderField({ Gender: "women" }), "women");
  });
});

describe("gender catalog filter", () => {
  const rows = [
    {
      id: 1,
      name: "AIR FORCE 1 WMNS WHITE",
      brand: "Nike",
      article: "1001",
      gender: "women",
      price_byn: 150,
      active: true,
      sizes: [{ size: "38", qty: 1 }],
    },
    {
      id: 2,
      name: "AIR FORCE 1 BLACK",
      brand: "Nike",
      article: "1002",
      gender: null,
      price_byn: 150,
      active: true,
      sizes: [{ size: "42", qty: 1 }],
    },
    {
      id: 3,
      name: "DUNK LOW MENS",
      brand: "Nike",
      article: "1003",
      gender: "men",
      price_byn: 160,
      active: true,
      sizes: [{ size: "43", qty: 2 }],
    },
  ];

  it("men/women cut the list; unknown stays out", () => {
    const women = filterProductsByGender(rows, "women");
    assert.equal(women.length, 1);
    assert.equal(women[0].article, "1001");
    const men = filterProductsByGender(rows, "men");
    assert.equal(men.length, 1);
    assert.equal(men[0].article, "1003");
    assert.equal(productMatchesGender(rows[1], "men"), false);
  });

  it("gender filter with no tagged rows yields total 0", () => {
    const none = rows.map((r) => ({ ...r, gender: null }));
    const models = groupProductsIntoModels(filterProductsByGender(none, "women"));
    assert.equal(models.length, 0);
  });

  it("empty gender query keeps every product", () => {
    assert.equal(filterProductsByGender(rows, "").length, 3);
    assert.equal(filterProductsByGender(rows, "nope").length, 3);
  });
});
