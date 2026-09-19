import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseColorQuery,
  colorMatchesFamily,
  modelMatchesColor,
  filterModelsByColor,
  firstMatchingColorIndex,
} from "./color.js";

describe("parseColorQuery", () => {
  it("maps URL/API aliases to white/black", () => {
    assert.equal(parseColorQuery("white"), "white");
    assert.equal(parseColorQuery("WHITE"), "white");
    assert.equal(parseColorQuery("белый"), "white");
    assert.equal(parseColorQuery("белые"), "white");
    assert.equal(parseColorQuery("black"), "black");
    assert.equal(parseColorQuery("чёрный"), "black");
    assert.equal(parseColorQuery("черные"), "black");
  });
  it("rejects empty and unknown flags", () => {
    for (const v of ["", "red", "sale", "grey", null, undefined]) {
      assert.equal(parseColorQuery(v), "", String(v));
    }
  });
});

describe("colorMatchesFamily", () => {
  it("matches WHITE and WHITE-ish tokens", () => {
    assert.equal(colorMatchesFamily("WHITE", "white"), true);
    assert.equal(colorMatchesFamily("WHITE/RED", "white"), true);
    assert.equal(colorMatchesFamily("OFF-WHITE", "white"), true);
    assert.equal(colorMatchesFamily("SAIL", "white"), true);
    assert.equal(colorMatchesFamily("белый", "white"), true);
    assert.equal(colorMatchesFamily("BLACK", "white"), false);
    assert.equal(colorMatchesFamily("GREY/BLUE", "white"), false);
  });
  it("matches BLACK tokens", () => {
    assert.equal(colorMatchesFamily("BLACK", "black"), true);
    assert.equal(colorMatchesFamily("BLACK/RED", "black"), true);
    assert.equal(colorMatchesFamily("чёрный", "black"), true);
    assert.equal(colorMatchesFamily("WHITE", "black"), false);
  });
});

describe("model color filter", () => {
  const models = [
    { modelKey: "a", colors: [{ color: "WHITE" }, { color: "BLACK" }] },
    { modelKey: "b", colors: [{ color: "GREY/BLUE" }] },
    { modelKey: "c", colors: [{ color: "BLACK/RED" }] },
  ];

  it("keeps models that have a matching colorway", () => {
    assert.deepEqual(
      filterModelsByColor(models, "white").map((m) => m.modelKey),
      ["a"]
    );
    assert.deepEqual(
      filterModelsByColor(models, "black").map((m) => m.modelKey),
      ["a", "c"]
    );
  });
  it("passes through when color is empty", () => {
    assert.equal(filterModelsByColor(models, "").length, 3);
    assert.equal(modelMatchesColor(models[1], ""), true);
  });
  it("picks the matching color index", () => {
    assert.equal(firstMatchingColorIndex(models[0].colors, "black"), 1);
    assert.equal(firstMatchingColorIndex(models[0].colors, "white"), 0);
    assert.equal(firstMatchingColorIndex(models[1].colors, "white"), 0);
  });
});
