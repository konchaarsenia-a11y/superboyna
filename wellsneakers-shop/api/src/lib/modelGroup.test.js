import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseModelAndColor,
  groupProductsIntoModels,
  modelMatchesQuery,
  isColorToken,
  resolveProductModel,
  parseCatalogSort,
  modelStockSizeCount,
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

  it("splits compound Soft Blue (art. 1347)", () => {
    const parsed = parseModelAndColor("AIR JORDAN 4 RETRO SOFTBLUE", "NIKE");
    assert.equal(parsed.modelName, "AIR JORDAN 4 RETRO");
    assert.equal(parsed.color, "SOFT BLUE");
    assert.equal(parsed.modelKey, "nike|air jordan 4 retro");
  });

  it("peels PSG nickname (art. 207)", () => {
    const parsed = parseModelAndColor("AIR JORDAN 4 RETRO PSG", "NIKE");
    assert.equal(parsed.modelName, "AIR JORDAN 4 RETRO");
    assert.equal(parsed.color, "PSG");
    assert.equal(parsed.modelKey, "nike|air jordan 4 retro");
  });

  it("maps bordo / persik aliases and keeps a written label", () => {
    const bordo = parseModelAndColor("DUNK LOW BORDO", "NIKE");
    const persik = parseModelAndColor("CAMPUS PERSIK", "adidas");
    assert.equal(bordo.modelName, "DUNK LOW");
    assert.equal(bordo.color, "BURGUNDY");
    assert.equal(persik.modelName, "CAMPUS");
    assert.equal(persik.color, "PEACH");
  });

  it("peels slash colorways with spaced or glued suffixes", () => {
    const mex = parseModelAndColor("AIR FORCE 1 BLACK/WHITE MEX", "NIKE");
    assert.equal(mex.modelName, "AIR FORCE 1");
    assert.equal(mex.color, "BLACK/WHITE MEX");
    const glued = parseModelAndColor("AIR FORCE 1 BLACK/WHITEMEX", "NIKE");
    assert.equal(glued.modelName, "AIR FORCE 1");
    assert.match(glued.color, /BLACK\/WHITE/i);
    const zamsh = parseModelAndColor("DUNK LOW GREY/BLACK ZAMSH", "NIKE");
    assert.equal(zamsh.modelName, "DUNK LOW");
    assert.equal(zamsh.color, "GREY/BLACK ZAMSH");
    const swoosh = parseModelAndColor("AIR FORCE 1 WHITE/BLACK SWOOSH", "NIKE");
    assert.equal(swoosh.color, "WHITE/BLACK SWOOSH");
  });

  it("peels leftover colorway nicknames and collabs", () => {
    const cases = [
      ["NIKE SB DUNK LOW APPLE", "NIKE", "NIKE SB DUNK LOW", "APPLE"],
      ["CAMPUS BODEGA BAMS", "adidas", "CAMPUS", "BODEGA BAMS"],
      ["NIKE SB DUNK LOW CACTUS JACK", "NIKE", "NIKE SB DUNK LOW", "CACTUS JACK"],
      ["NIKE SB DUNK LOW KOVER", "NIKE", "NIKE SB DUNK LOW", "KOVER"],
      ["NIKE AIR FORCE 1 LOW COFFE", "NIKE", "NIKE AIR FORCE 1 LOW", "COFFEE"],
      [
        "NIKE AIR JORDAN 1 LOW CACTUS BLACK PHANTOM TIFFANY",
        "NIKE",
        "NIKE AIR JORDAN 1 LOW",
        "CACTUS BLACK PHANTOM TIFFANY",
      ],
      ["NIKE AIR JORDAN 1 HIGH SPIDER-MAN", "NIKE", "NIKE AIR JORDAN 1 HIGH", "SPIDER-MAN"],
      ["NIKE CORTEZ GREEN MUSLIN", "NIKE", "NIKE CORTEZ", "GREEN MUSLIN"],
      ["NIKE SB DUNK LOW BANAN", "NIKE", "NIKE SB DUNK LOW", "BANAN"],
      ["NIKE SB DUNK LOW MINI SWOOSH", "NIKE", "NIKE SB DUNK LOW", "MINI SWOOSH"],
    ];
    for (const [name, brand, model, color] of cases) {
      const parsed = parseModelAndColor(name, brand);
      assert.equal(parsed.modelName, model, name);
      assert.equal(parsed.color, color, name);
    }
  });

  it("peels a known color before junk (BLACK 2 SWOOSH)", () => {
    const parsed = parseModelAndColor("NIKE TN BLACK 2 SWOOSH", "NIKE");
    assert.equal(parsed.modelName, "NIKE TN");
    assert.equal(parsed.color, "BLACK 2 SWOOSH");
  });

  it("uses leftover suffix after a known model prefix", () => {
    const parsed = parseModelAndColor("NIKE SB DUNK LOW FOOBAR NICK", "NIKE");
    assert.equal(parsed.modelName, "NIKE SB DUNK LOW");
    assert.equal(parsed.color, "FOOBAR NICK");
  });

  it("groups nickname dunks with plain color dunks", () => {
    const apple = parseModelAndColor("NIKE SB DUNK LOW APPLE", "NIKE");
    const black = parseModelAndColor("NIKE SB DUNK LOW BLACK", "NIKE");
    assert.equal(apple.modelKey, black.modelKey);
    assert.equal(apple.modelKey, "nike|nike sb dunk low");
  });
});

describe("resolveProductModel — empty color backfill", () => {
  it("refreshes model_key when stored color is empty (1347)", () => {
    const meta = resolveProductModel({
      name: "AIR JORDAN 4 RETRO SOFTBLUE",
      brand: "NIKE",
      color: "",
      model_key: "nike|air jordan 4 retro softblue",
    });
    assert.equal(meta.color, "SOFT BLUE");
    assert.equal(meta.modelKey, "nike|air jordan 4 retro");
  });

  it("backfills leftover nickname when stored color is empty (1558)", () => {
    const meta = resolveProductModel({
      name: "NIKE SB DUNK LOW APPLE",
      brand: "NIKE",
      color: "",
      model_key: "nike|nike sb dunk low apple",
    });
    assert.equal(meta.color, "APPLE");
    assert.equal(meta.modelKey, "nike|nike sb dunk low");
  });

  it("keeps a staff-written color and stored key", () => {
    const meta = resolveProductModel({
      name: "AIR JORDAN 4 RETRO SOFTBLUE",
      brand: "Nike",
      color: "Custom",
      model_key: "nike|kept key",
    });
    assert.equal(meta.color, "Custom");
    assert.equal(meta.modelKey, "nike|kept key");
  });
});

describe("isColorToken", () => {
  it("accepts slash combos even with unknown second half", () => {
    assert.equal(isColorToken("WHITE/REDSNOR"), true);
    assert.equal(isColorToken("GREY/BLUE"), true);
  });
  it("accepts compounds, aliases and nicknames", () => {
    assert.equal(isColorToken("SOFTBLUE"), true);
    assert.equal(isColorToken("LIGHTBLUE"), true);
    assert.equal(isColorToken("PSG"), true);
    assert.equal(isColorToken("BORDO"), true);
    assert.equal(isColorToken("PERSIK"), true);
    assert.equal(isColorToken("BLACK/WHITEMEX"), true);
    assert.equal(isColorToken("APPLE"), true);
    assert.equal(isColorToken("COFFE"), true);
    assert.equal(isColorToken("SPIDER-MAN"), true);
    assert.equal(isColorToken("BANAN"), true);
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
    assert.equal(models[0].colors[0].old_price_byn, null);
    assert.equal(models[0].colors[0].onSale, false);
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

  it("default sort puts richer size stock first; same size in two colors counts twice", () => {
    const stockRows = [
      {
        id: 10,
        name: "CAMPUS BLACK",
        brand: "Adidas",
        article: "2001",
        price_byn: 100,
        active: true,
        sizes: [
          { size: "41", qty: 1 },
          { size: "42", qty: 1 },
        ],
      },
      {
        id: 11,
        name: "CAMPUS WHITE",
        brand: "Adidas",
        article: "2002",
        price_byn: 100,
        active: true,
        sizes: [{ size: "41", qty: 2 }],
      },
      {
        id: 12,
        name: "YEEZY 350 BLACK",
        brand: "Adidas",
        article: "2003",
        price_byn: 200,
        active: true,
        sizes: [{ size: "42", qty: 5 }],
      },
    ];
    const models = groupProductsIntoModels(stockRows);
    assert.equal(models[0].name, "CAMPUS");
    assert.equal(models[0].stockSizeCount, 3);
    assert.equal(models[1].name, "YEEZY 350");
    assert.equal(models[1].stockSizeCount, 1);
    assert.equal(modelStockSizeCount(models[0]), 3);
    const byName = groupProductsIntoModels(stockRows, { sort: "name" });
    assert.equal(byName[0].name, "CAMPUS");
    assert.equal(byName[1].name, "YEEZY 350");
    assert.equal(parseCatalogSort(""), "stock");
    assert.equal(parseCatalogSort("name"), "name");
  });

  it("tie-breaks equal stock by brand then name", () => {
    const models = groupProductsIntoModels([
      {
        id: 21,
        name: "ZETA BLACK",
        brand: "Nike",
        article: "1",
        price_byn: 1,
        active: true,
        sizes: [{ size: "41", qty: 1 }],
      },
      {
        id: 22,
        name: "ALPHA BLACK",
        brand: "Nike",
        article: "2",
        price_byn: 1,
        active: true,
        sizes: [{ size: "42", qty: 1 }],
      },
      {
        id: 23,
        name: "BETA BLACK",
        brand: "Adidas",
        article: "3",
        price_byn: 1,
        active: true,
        sizes: [{ size: "40", qty: 1 }],
      },
    ]);
    assert.deepEqual(
      models.map((m) => m.brand + "|" + m.name),
      ["Adidas|BETA", "Nike|ALPHA", "Nike|ZETA"]
    );
  });
});
