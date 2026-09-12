import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeBrand, inferBrandFromName, resolveBrand, aggregateBrands } from "./brand.js";
import { groupProductsIntoModels, parseModelAndColor } from "./modelGroup.js";

describe("normalizeBrand", () => {
  it("maps obfuscated OC manufacturers", () => {
    assert.equal(normalizeBrand("ad1das"), "Adidas");
    assert.equal(normalizeBrand("AD1DAS"), "Adidas");
    assert.equal(normalizeBrand("ree6ok"), "Reebok");
    assert.equal(normalizeBrand("REE6OK"), "Reebok");
  });

  it("uses Title Case for known brands", () => {
    assert.equal(normalizeBrand("NIKE"), "Nike");
    assert.equal(normalizeBrand("nike"), "Nike");
    assert.equal(normalizeBrand("ASICS"), "Asics");
    assert.equal(normalizeBrand("adidas"), "Adidas");
    assert.equal(normalizeBrand("ALEXANDER MCQUEEN"), "Alexander McQueen");
    assert.equal(normalizeBrand("under armour"), "Under Armour");
    assert.equal(normalizeBrand("DR. MARTENS"), "Dr. Martens");
    assert.equal(normalizeBrand("SAUCONY"), "Saucony");
    assert.equal(normalizeBrand("MERRELL"), "Merrell");
  });

  it("keeps unknown non-empty brands and clears blanks", () => {
    assert.equal(normalizeBrand(""), "");
    assert.equal(normalizeBrand("   "), "");
    assert.equal(normalizeBrand("Custom Lab"), "Custom Lab");
  });
});

describe("inferBrandFromName", () => {
  it("reads leading brand tokens from live empty-brand names", () => {
    assert.equal(inferBrandFromName("NIKE AIR FORCE 1 WHITE"), "Nike");
    assert.equal(inferBrandFromName("ASICS GEL-VENTURE 6"), "Asics");
    assert.equal(inferBrandFromName("CONVERSE CHUCK 70"), "Converse");
    assert.equal(inferBrandFromName("Hoka Clifton 9"), "Hoka");
    assert.equal(inferBrandFromName("HOKA SPEEDGOAT 5"), "Hoka");
    assert.equal(inferBrandFromName("LACOSTE T-CLIP"), "Lacoste");
    assert.equal(inferBrandFromName("DC SHOE COURT GRAFFIK"), "DC");
    assert.equal(inferBrandFromName("DC COURT GRAFFIK"), "DC");
    assert.equal(inferBrandFromName("Alexander McQueen Oversized"), "Alexander McQueen");
  });

  it("maps identifiable model lines without a manufacturer", () => {
    assert.equal(inferBrandFromName("CAMPUS BROWN/BLACK"), "Adidas");
    assert.equal(inferBrandFromName("CAMPUS 00S GREY"), "Adidas");
    assert.equal(inferBrandFromName("BERMUDA BLACK"), "Adidas");
    assert.equal(inferBrandFromName("BERMUBA GREY"), "Adidas");
    assert.equal(inferBrandFromName("YEEZY 350 BLACK/RED"), "Adidas");
    assert.equal(inferBrandFromName("AIR JORDAN 11 BLACK"), "Nike");
  });

  it("leaves truly unknown names empty", () => {
    assert.equal(inferBrandFromName(""), "");
    assert.equal(inferBrandFromName("NUMERIS BLACK/WHITE"), "");
    assert.equal(inferBrandFromName("RANDOM SNEAKER 42"), "");
  });
});

describe("resolveBrand", () => {
  it("prefers manufacturer, then name", () => {
    assert.equal(resolveBrand("ad1das", "CAMPUS BROWN"), "Adidas");
    assert.equal(resolveBrand("ree6ok", "CLASSIC LEATHER"), "Reebok");
    assert.equal(resolveBrand("", "NIKE INITIATOR BLACK"), "Nike");
    assert.equal(resolveBrand("  ", "ASICS GEL"), "Asics");
    assert.equal(resolveBrand("", "FOO BAR BAZ"), "");
    assert.equal(resolveBrand("NIKE", "ASICS GEL"), "Nike");
  });
});

describe("aggregateBrands", () => {
  it("collapses obfuscated + inferred rows and skips unknown empties", () => {
    const brands = aggregateBrands([
      { id: 1, brand: "ad1das", name: "CAMPUS BROWN", model_key: "ad1das|campus" },
      { id: 2, brand: "", name: "NIKE AIR FORCE 1 WHITE", model_key: "" },
      { id: 3, brand: "ree6ok", name: "CLASSIC LEATHER", model_key: "ree6ok|classic leather" },
      { id: 4, brand: "NIKE", name: "AIR JORDAN 11 BLACK", model_key: "nike|air jordan 11" },
      { id: 5, brand: "", name: "NUMERIS BLACK/WHITE", model_key: "_|numeris" },
    ]);
    assert.deepEqual(
      brands.map((b) => b.brand),
      ["Adidas", "Nike", "Reebok"]
    );
    assert.equal(
      brands.find((b) => b.brand === "Nike").products,
      2
    );
    assert.equal(
      brands.some((b) => /ad1das|ree6ok/i.test(b.brand)),
      false
    );
  });
});

describe("catalog grouping uses resolved brands", () => {
  it("shows Adidas for obfuscated and inferred Campus rows", () => {
    const models = groupProductsIntoModels([
      {
        id: 10,
        name: "CAMPUS BROWN/BLACK",
        brand: "ad1das",
        article: "2001",
        price_byn: 120,
        active: true,
        sizes: [{ size: "42", qty: 1 }],
      },
      {
        id: 11,
        name: "CAMPUS 00S GREY",
        brand: "",
        article: "2002",
        price_byn: 120,
        active: true,
        sizes: [{ size: "43", qty: 2 }],
      },
    ]);
    assert.equal(models.length, 2);
    assert.ok(models.every((m) => m.brand === "Adidas"));
    const keys = new Set(models.map((m) => m.modelKey));
    assert.ok([...keys].every((k) => k.startsWith("adidas|")));
  });

  it("keeps model_key stable after Title Case normalize", () => {
    const raw = parseModelAndColor("NIKE AIR FORCE 1 WHITE", "NIKE");
    const clean = parseModelAndColor("NIKE AIR FORCE 1 WHITE", resolveBrand("NIKE"));
    assert.equal(raw.modelKey, clean.modelKey);
    assert.equal(clean.modelKey, "nike|nike air force 1");
  });
});
