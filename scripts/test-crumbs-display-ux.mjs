#!/usr/bin/env node
/**
 * Arseniy crumb display: basket SKU+grams, kind subtitle, client «крошка SKU - Nг».
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing " + name);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}

const ui = fs.readFileSync(path.join(root, "boinya-c/app.main.js"), "utf8");
const html = fs.readFileSync(path.join(root, "boinya-c/app.html"), "utf8");
const idx = fs.readFileSync(path.join(root, "boinya-c/index.html"), "utf8");
const tz = fs.readFileSync(path.join(root, "TZ.md"), "utf8");

assert(ui.includes("function crumbBasketDisplayMain_"), "display main helper");
assert(ui.includes("function crumbBasketSubLabel_"), "subtitle helper");
assert(ui.includes("function crumbClientMessageLine_"), "client line helper");
assert(ui.includes("function crumbKindCategoryLabel_"), "kind chip labels");
assert(ui.includes('return "дрессура овощи/фрукты"'), "veg label matches chip");
assert(ui.includes('return "мясные"'), "meat label matches chip");
assert(ui.includes('return "гипоаллергенные"'), "hypo label matches chip");
assert(ui.includes("crumbBasketDisplayMain_(item)") || ui.includes("crumbBasketDisplayMain_(g)"), "renderers use SKU main");
assert(ui.includes("crumbBasketSubLabel_(item)"), "renderers use kind subtitle");
assert(ui.includes("if (isCrumbBasketItemUi_(it)) return crumbClientMessageLine_(it)"), "offer uses client line");
assert(ui.includes('row.name = "крошка"') && ui.includes('row.main = "крошка"'), "stored identity still крошка");
assert(!ui.includes("крошка · "), "no old «крошка · source» title");
assert(/crumbs-display-ux-h1/.test(tz), "TZ marker");
assert(/crumb-src-row-offer-h1/.test(tz), "offer TZ marker");
assert(ui.includes('crumb: "Присыпки"'), "client block title Присыпки");
assert(ui.includes("крошка микс - "), "mix line is крошка микс");
assert(html.includes("crumb-src-del"), "compact delete button class");
assert(ui.includes("Выбери позицию"), "source placeholder");

const ctx = vm.createContext({
  Math, Number, String, isFinite, Object, Array, JSON,
  catalogAliasNameUi_: function (name) { return String(name || "").trim(); }
});
vm.runInContext(
  [
    extractFn(ui, "isCrumbBasketItemUi_"),
    extractFn(ui, "crumbKindCategoryLabel_"),
    extractFn(ui, "crumbKindTitle_"),
    extractFn(ui, "crumbSourceNames_"),
    extractFn(ui, "crumbSourcesLabel_"),
    extractFn(ui, "crumbBasketDisplayMain_"),
    extractFn(ui, "crumbBasketSubLabel_"),
    extractFn(ui, "prettyProductName"),
    extractFn(ui, "crumbOfferGenitive_"),
    extractFn(ui, "crumbClientMessageLine_"),
    extractFn(ui, "formatPriceCompositionLine")
  ].join("\n"),
  ctx
);

const one = {
  cat: "crumb",
  crumbKind: "meat",
  name: "крошка",
  main: "крошка",
  sub: "ЛЁГКОЕ",
  val: 100,
  sources: [{ name: "ЛЁГКОЕ", cat: "dressura" }]
};
assert(ctx.crumbBasketDisplayMain_(one) === "ЛЁГКОЕ", "basket main = SKU, got " + ctx.crumbBasketDisplayMain_(one));
assert(ctx.crumbBasketSubLabel_(one) === "мясные", "basket sub = kind chip");
assert(ctx.crumbClientMessageLine_(one) === "крошка лёгкого - 100 г", "client one source, got " + ctx.crumbClientMessageLine_(one));
assert(ctx.formatPriceCompositionLine(one) === "крошка лёгкого - 100 г", "offer line one source");

const mix = {
  cat: "crumb",
  crumbKind: "veg",
  name: "крошка",
  main: "крошка",
  val: 100,
  sources: [{ name: "ЛЁГКОЕ" }, { name: "РУБЕЦ Т" }]
};
assert(ctx.crumbBasketDisplayMain_(mix) === "ЛЁГКОЕ + РУБЕЦ Т", "mix main with spaces");
assert(ctx.crumbBasketSubLabel_(mix) === "дрессура овощи/фрукты", "mix sub = veg chip");
assert(ctx.crumbClientMessageLine_(mix) === "крошка микс - 100 г", "client mix is крошка микс, got " + ctx.crumbClientMessageLine_(mix));

const hypo = { cat: "crumb", crumbKind: "hypo", sources: [{ name: "СЕРДЦЕ" }], val: 50 };
assert(ctx.crumbBasketSubLabel_(hypo) === "гипоаллергенные", "hypo chip");
assert(ctx.crumbClientMessageLine_(hypo) === "крошка сердца - 50 г", "hypo client line, got " + ctx.crumbClientMessageLine_(hypo));

const fromSub = { cat: "crumb", crumbKind: "meat", name: "крошка", sub: "ЛЁГКОЕ + РУБЕЦ Т", val: 80 };
assert(ctx.crumbBasketDisplayMain_(fromSub) === "ЛЁГКОЕ + РУБЕЦ Т", "fallback parse sources from sub");
assert(ctx.crumbClientMessageLine_(fromSub) === "крошка микс - 80 г", "fallback client from sub, got " + ctx.crumbClientMessageLine_(fromSub));
assert(ctx.crumbOfferGenitive_("ПОЧКИ") === "почек", "genitive почки");
assert(ctx.crumbOfferGenitive_("РУБЕЦ Т") === "рубца", "genitive рубец");
assert(ctx.crumbOfferGenitive_("ЯБЛОКИ") === "яблоки", "veg lowercase");
assert(ctx.crumbClientMessageLine_({ cat: "crumb", val: 10 }) === "крошка - 10 г", "no sources");

const regular = { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", val: 100 };
assert(!ctx.isCrumbBasketItemUi_(regular), "regular dressura is not crumb");

console.log("crumbs-display-ux OK");
