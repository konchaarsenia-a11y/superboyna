import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseModelAndColor,
  groupProductsIntoModels,
  modelMatchesQuery,
  isColorToken,
} from "./modelGroup.js";

describe("parseModelAndColor — live OC names", () => {
  it("groups Jordan 11 colorways", () => {
    const black = parseModelAndColor("AIR JORDAN 11 BLACK", "NIKE");
    const grey = parseModelAndColor("AIR JORDAN 11 GREY/BLUE", "NIKE");
    assert.equal(black.modelName, "AIR JORDAN 11");
    assert.equal(black.color, "BLACK");
    assert.equal(grey.modelName, "AIR JORDAN 11");
    assert.equal(grey.color, "GREY/BLUE");
    assert.equal(black.modelKey, grey.modelKey);
    assert.equal(black.modelKey, "nike|air jordan 11");
  });

  it("keeps STAR as model, not color", () => {
    const blue = parseModelAndColor("NIKE AIR FORCE 1 STAR BLUE", "NIKE");
    const white = parseModelAndColor("NIKE AIR FORCE 1 STAR WHITE", "NIKE");
    assert.equal(blue.modelName, "NIKE AIR FORCE 1 STAR");
    assert.equal(white.modelName, "NIKE AIR FORCE 1 STAR");
    assert.equal(blue.color, "BLUE");
    assert.equal(white.color, "WHITE");
    assert.equal(blue.modelKey, white.modelKey);
  });

  it("does not merge STAR with plain Air Force 1", () => {
    const star = parseModelAndColor("NIKE AIR FORCE 1 STAR BLUE", "NIKE");
    const force = parseModelAndColor("NIKE AIR FORCE 1 WHITE", "NIKE");
    assert.equal(force.modelName, "NIKE AIR FORCE 1");
    assert.notEqual(star.modelKey, force.modelKey);
  });

  it("handles slash colorways and numbered colors", () => {
    assert.equal(parseModelAndColor("YEEZY 350 BLACK/RED", "adidas").modelName, "YEEZY 350");
    assert.equal(parseModelAndColor("YEEZY 350 BLACK/RED", "adidas").color, "BLACK/RED");
    assert.equal(parseModelAndColor("SPEZIAL GREEN2").modelName, "SPEZIAL");
    assert.equal(parseModelAndColor("SPEZIAL GREEN2").color, "GREEN2");
    assert.equal(parseModelAndColor("CAMPUS BROWN/BLACK").modelName, "CAMPUS");
    assert.equal(parseModelAndColor("NIKE SB DUNK LOW WHITE/REDSNOR").modelName, "NIKE SB DUNK LOW");
    assert.equal(parseModelAndColor("NIKE SB DUNK LOW WHITE/REDSNOR").color, "WHITE/REDSNOR");
  });

  it("keeps silhouette words (LOW/HIGH) in the model", () => {
    const parsed = parseModelAndColor("NIKE SB DUNK LOW BLACK", "NIKE");
    assert.equal(parsed.modelName, "NIKE SB DUNK LOW");
    assert.equal(parsed.color, "BLACK");
  });

  it("strips trailing multi-word greys", () => {
    const parsed = parseModelAndColor("AIR JORDAN 11 COOL GREY", "NIKE");
    assert.equal(parsed.modelName, "AIR JORDAN 11");
    assert.equal(parsed.color, "COOL GREY");
  });

  it("leaves names without color tokens intact", () => {
    const parsed = parseModelAndColor("MERRELL MOAB 3", "MERRELL");
    assert.equal(parsed.modelName, "MERRELL MOAB 3");
    assert.equal(parsed.color, "");
  });

  it("groups Initiator and Numeris colorways", () => {
    const a = parseModelAndColor("NIKE INITIATOR BROWN", "NIKE");
    const b = parseModelAndColor("NIKE INITIATOR BLACK", "NIKE");
    assert.equal(a.modelName, "NIKE INITIATOR");
    assert.equal(a.modelKey, b.modelKey);
    assert.equal(parseModelAndColor("NUMERIS BLACK/WHITE").modelName, "NUMERIS");
    assert.equal(parseModelAndColor("NIKE SPIRIDON STUSSY BEIGE", "NIKE").modelName, "NIKE SPIRIDON STUSSY");
  });
});

describe("isColorToken", () => {
  it("accepts slash combos even with unknown second half", () => {
    assert.equal(isColorToken("WHITE/REDSNOR"), true);
    assert.equal(isColorToken("GREY/BLUE"), true);
  });
  it("rejects model tokens", () => {
    assert.equal(isColorToken("JORDAN"), false);
    assert.equal(isColorToken("11"), false);
    assert.equal(isColorToken("LOW"), false);
  });
});

describe("groupProductsIntoModels", () => {
  const rows = [
    {
      id: 1,
      name: "AIR JORDAN 11 BLACK",
      brand: "NIKE",
      article: "1577",
      price_byn: 170,
      active: true,
      sizes: [
        { size: "41", qty: 1 },
        { size: "40", qty: 0 },
      ],
    },
    {
      id: 2,
      name: "AIR JORDAN 11 GREY/BLUE",
      brand: "NIKE",
      article: "1576",
      price_byn: 170,
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
      sizes: [{ size: "42", qty: 0 }],
    },
  ];

  it("merges Jordan 11 into one card with two colors", () => {
    const models = groupProductsIntoModels(rows);
    assert.equal(models.length, 1);
    assert.equal(models[0].name, "AIR JORDAN 11");
    assert.equal(models[0].colors.length, 2);
    assert.deepEqual(
      models[0].colors.map((c) => c.color),
      ["BLACK", "GREY/BLUE"]
    );
    assert.equal(models[0].colors[0].article, "1577");
    assert.equal(models[0].colors[0].productId, 1);
    assert.deepEqual(models[0].colors[0].sizes, [{ size: "41", qty: 1 }]);
    assert.deepEqual(models[0].colors[1].sizes, [{ size: "42", qty: 2 }]);
  });

  it("hides qty 0 per color and drops empty variants", () => {
    const models = groupProductsIntoModels(rows, { inStockOnly: true });
    assert.ok(!models[0].colors[0].sizes.some((s) => s.qty === 0));
    assert.equal(
      models.some((m) => m.colors.some((c) => c.article === "1401")),
      false
    );
  });

  it("staff article search still finds a variant on the card", () => {
    const models = groupProductsIntoModels(rows);
    assert.equal(modelMatchesQuery(models[0], "1577"), true);
    assert.equal(modelMatchesQuery(models[0], "1576"), true);
    assert.equal(modelMatchesQuery(models[0], "GREY"), true);
    assert.equal(modelMatchesQuery(models[0], "yeezy"), false);
  });
});
