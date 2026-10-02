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
    assert.equal(normalizeBrand("triger"), "New Balance");
    assert.equal(normalizeBrand("TRIGGER"), "New Balance");
    assert.equal(normalizeBrand("TR1GER"), "New Balance");
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
    assert.equal(normalizeBrand("SALOMON"), "Salomon");
    assert.equal(normalizeBrand("saloman"), "Salomon");
    assert.equal(normalizeBrand("SUPERSTAR"), "Adidas");
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
    assert.equal(inferBrandFromName("TRIGER 550 GREY"), "New Balance");
    assert.equal(inferBrandFromName("TRIGGER 574 BLACK"), "New Balance");
    assert.equal(inferBrandFromName("TRIGER 2002R WHITE"), "New Balance");
    assert.equal(inferBrandFromName("SALOMON XT-6 BLACK"), "Salomon");
    assert.equal(inferBrandFromName("SUPERSTAR WHITE"), "Adidas");
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
    assert.equal(inferBrandFromName("OCAI BLACK"), "");
    assert.equal(inferBrandFromName("ROBOT WHITE"), "");
    assert.equal(inferBrandFromName("RANDOM SNEAKER 42"), "");
  });
});

describe("resolveBrand", () => {
  it("prefers manufacturer, then name, when they agree or name has no brand", () => {
    assert.equal(resolveBrand("ad1das", "CAMPUS BROWN"), "Adidas");
    assert.equal(resolveBrand("ree6ok", "CLASSIC LEATHER"), "Reebok");
    assert.equal(resolveBrand("", "NIKE INITIATOR BLACK"), "Nike");
    assert.equal(resolveBrand("  ", "ASICS GEL"), "Asics");
    assert.equal(resolveBrand("", "FOO BAR BAZ"), "");
    assert.equal(resolveBrand("Nike", "AIR FORCE 1 WHITE"), "Nike");
  });

  it("prefers a name-leading known brand over a conflicting manufacturer", () => {
    assert.equal(resolveBrand("Nike", "ASICS LIGHT BLUE"), "Asics");
    assert.equal(resolveBrand("NIKE", "ASICS GEL"), "Asics");
    assert.equal(resolveBrand("nike", "ASICS LIGHT BLUE"), "Asics");
  });

  it("fills empty manufacturers from TRIGER / SALOMON / SUPERSTAR leftovers", () => {
    assert.equal(resolveBrand("", "TRIGER 550 GREY"), "New Balance");
    assert.equal(resolveBrand("", "TRIGER 9060 BLACK"), "New Balance");
    assert.equal(resolveBrand("", "SALOMON XT-6 BLACK"), "Salomon");
    assert.equal(resolveBrand("", "SUPERSTAR WHITE"), "Adidas");
    assert.equal(resolveBrand("", "NUMERIS BLACK/WHITE"), "");
    assert.equal(resolveBrand("", "OCAI BLACK"), "");
    assert.equal(resolveBrand("", "ROBOT WHITE"), "");
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
      { id: 6, brand: "Nike", name: "ASICS LIGHT BLUE", model_key: "nike|asics" },
      { id: 7, brand: "", name: "TRIGER 550 GREY", model_key: "_|triger 550" },
      { id: 8, brand: "", name: "SALOMON XT-6 BLACK", model_key: "_|salomon xt-6" },
      { id: 9, brand: "", name: "OCAI BLACK", model_key: "_|ocai" },
    ]);
    assert.deepEqual(
      brands.map((b) => b.brand),
      ["Adidas", "Asics", "New Balance", "Nike", "Reebok", "Salomon"]
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

  it("art. 1441: name ASICS + manufacturer Nike groups under Asics", () => {
    const models = groupProductsIntoModels([
      {
        id: 1441,
        name: "ASICS LIGHT BLUE",
        brand: "Nike",
        article: "1441",
        model_key: "nike|asics",
        price_byn: 150,
        active: true,
        sizes: [{ size: "42", qty: 1 }],
      },
      {
        id: 1400,
        name: "ASICS GEL-VENTURE 6",
        brand: "Asics",
        article: "1400",
        model_key: "asics|asics gel-venture 6",
        price_byn: 150,
        active: true,
        sizes: [{ size: "43", qty: 1 }],
      },
    ]);
    const art1441 = models.find((m) => m.colors.some((c) => c.article === "1441"));
    assert.ok(art1441);
    assert.equal(art1441.brand, "Asics");
    assert.ok(art1441.modelKey.startsWith("asics|"));
    assert.equal(art1441.modelKey, "asics|asics");
    assert.ok(models.every((m) => m.brand === "Asics"));
  });

  it("TRIGER / SALOMON empty rows group under New Balance / Salomon", () => {
    const models = groupProductsIntoModels([
      {
        id: 20,
        name: "TRIGER 550 GREY",
        brand: "",
        article: "3010",
        price_byn: 180,
        active: true,
        sizes: [{ size: "42", qty: 1 }],
      },
      {
        id: 21,
        name: "SALOMON XT-6 BLACK",
        brand: "",
        article: "3011",
        price_byn: 220,
        active: true,
        sizes: [{ size: "43", qty: 1 }],
      },
      {
        id: 22,
        name: "NUMERIS BLACK/WHITE",
        brand: "",
        article: "3012",
        price_byn: 90,
        active: true,
        sizes: [{ size: "41", qty: 1 }],
      },
    ]);
    const nb = models.find((m) => m.colors.some((c) => c.article === "3010"));
    const salomon = models.find((m) => m.colors.some((c) => c.article === "3011"));
    const numeris = models.find((m) => m.colors.some((c) => c.article === "3012"));
    assert.equal(nb.brand, "New Balance");
    assert.ok(nb.modelKey.startsWith("new balance|"));
    assert.equal(salomon.brand, "Salomon");
    assert.ok(salomon.modelKey.startsWith("salomon|"));
    assert.equal(numeris.brand, "");
  });
});

/** Same persist contract as catalog.backfillProductModelKeys / import. */
function persistResolved(row) {
  const brand = resolveBrand(row.brand, row.name);
  const parsed = parseModelAndColor(row.name, brand);
  const storedColor = String(row.color || "").trim();
  const brandChanged = brand !== String(row.brand || "");
  const refreshKey = brandChanged || !storedColor;
  const modelKey = refreshKey
    ? parsed.modelKey
    : String(row.model_key || "").trim() || parsed.modelKey;
  return { brand, modelKey, color: storedColor || parsed.color };
}

describe("boot backfill persist contract", () => {
  it("recomputes model_key when name-leading brand overrides manufacturer", () => {
    const row = persistResolved({
      name: "ASICS LIGHT BLUE",
      brand: "Nike",
      model_key: "nike|asics",
    });
    assert.equal(row.brand, "Asics");
    assert.equal(row.modelKey, "asics|asics");
  });

  it("writes TRIGER / SALOMON / SUPERSTAR and leaves NUMERIS empty", () => {
    assert.deepEqual(persistResolved({ name: "TRIGER 550 GREY", brand: "", model_key: "" }), {
      brand: "New Balance",
      modelKey: parseModelAndColor("TRIGER 550 GREY", "New Balance").modelKey,
      color: "GREY",
    });
    assert.equal(persistResolved({ name: "SALOMON XT-6 BLACK", brand: "" }).brand, "Salomon");
    assert.equal(persistResolved({ name: "SUPERSTAR WHITE", brand: "" }).brand, "Adidas");
    assert.equal(persistResolved({ name: "NUMERIS BLACK/WHITE", brand: "" }).brand, "");
  });
});
