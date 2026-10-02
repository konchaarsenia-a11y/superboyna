import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { createContext, runInContext, Script } from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ctx = {};
createContext(ctx);
runInContext(readFileSync(root + "Logic.gs", "utf8"), ctx, { filename: "Logic.gs" });

const {
  wsSearchProducts,
  wsPlanSale,
  wsPlanStock,
  wsPlanInventory,
  wsNextArticle,
  wsBuildDataCheckString,
  wsBuildCatalog,
  wsProductDetail,
  WS_SHEETS
} = ctx;

const products = [
  { id: 101, article: 1577, barcode: "1577", name: "NIKE AIR FORCE 1", brand: "NIKE", price_byn: 220, old_price_byn: "", active: true, image_url: "", vps_product_id: 55 },
  { id: 102, article: "2201", barcode: "2201", name: "ADIDAS SAMBA", brand: "ADIDAS", price_byn: 180, active: true, image_url: "", vps_product_id: "" },
  { id: 103, article: "9999", name: "СКРЫТЫЙ", brand: "NIKE", price_byn: 10, active: false }
];
const sizes = [
  { product_id: 101, size: "42", qty: 1 },
  { product_id: 101, size: "43", qty: 0 },
  { product_id: 102, size: "40", qty: 2 },
  { product_id: 103, size: "42", qty: 5 }
];

test("search hides zero stock and inactive, exact article first", () => {
  const hits = wsSearchProducts(products, sizes, "nike", false);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].article, "1577");
  assert.equal(hits[0].sizes.map((s) => s.size).join(","), "42");
  const exact = wsSearchProducts(products, sizes, "2201", false);
  assert.equal(exact[0].id, "102");
  const all = wsSearchProducts(products, sizes, "1577", true);
  assert.equal(all[0].sizes.map((s) => s.size).join(","), "42,43");
});

test("sale decrements and refuses oversell", () => {
  const ok = wsPlanSale(products, sizes, [{ product_id: 101, size: "42", qty: 1, price_byn: 200 }], 20);
  assert.equal(ok.ok, true);
  assert.equal(ok.total, 180);
  assert.equal(ok.sizeQty["101\t42"], 0);
  const bad = wsPlanSale(products, sizes, [{ product_id: 101, size: "42", qty: 2, price_byn: 200 }], 0);
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "insufficient_stock");
  const missing = wsPlanSale(products, sizes, [{ product_id: 101, size: "41", qty: 1 }], 0);
  assert.equal(missing.error, "insufficient_stock");
});

test("stock add and inventory delta", () => {
  const add = wsPlanStock(products, sizes, "102", "40", 3);
  assert.equal(add.ok, true);
  assert.equal(add.prevQty, 2);
  assert.equal(add.nextQty, 5);
  const inv = wsPlanInventory(products, sizes, 101, [{ size: "42", qty: 4 }, { size: "44", qty: 1 }]);
  assert.equal(inv.ok, true);
  assert.equal(inv.changes[0].delta, 3);
  assert.equal(inv.changes[1].delta, 1);
  assert.equal(inv.changes[1].prev, 0);
});

test("next article and catalog export", () => {
  assert.equal(wsNextArticle(products), "10000");
  assert.equal(wsNextArticle([]), "1001");
  const detail = wsProductDetail(products, sizes, "55");
  assert.equal(detail, null);
  const byArticle = wsProductDetail(products, sizes, "1577");
  assert.equal(byArticle.vps_product_id, "55");
  const dirty = wsBuildCatalog(products, sizes, ["102"]);
  assert.equal(dirty.length, 1);
  assert.equal(dirty[0].sizes[0].qty, 2);
});

test("initData check string matches URLSearchParams + HMAC layout", () => {
  const user = JSON.stringify({ id: 650923866, first_name: "Арс" });
  const init = new URLSearchParams({ auth_date: "1700000000", query_id: "AAE", user }).toString() + "&hash=abc";
  const parsed = wsBuildDataCheckString(init);
  const params = new URLSearchParams(init);
  const hash = params.get("hash");
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  assert.equal(parsed.hash, hash);
  assert.equal(parsed.check, check);
  assert.equal(parsed.user.id, 650923866);
  const token = "123456:TEST";
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hex = createHmac("sha256", secret).update(check).digest("hex");
  assert.match(hex, /^[0-9a-f]{64}$/);
});

test("sheet headers cover kassa and stock", () => {
  for (const name of ["Products", "Sizes", "Sales", "SaleItems", "Arrivals", "StaffUsers", "Meta", "Movements"]) {
    assert.ok(WS_SHEETS[name].length > 1, name);
  }
  assert.ok(WS_SHEETS.Products.includes("vps_product_id"));
  assert.ok(WS_SHEETS.Sales.includes("sync_status"));
});

test("Code.gs parses as a script", () => {
  const code = readFileSync(root + "Code.gs", "utf8");
  assert.doesNotThrow(() => new Script(code, { filename: "Code.gs" }));
  assert.match(code, /function doPost/);
  assert.match(code, /function doGet/);
  assert.doesNotMatch(code, /PropertiesService\.getScriptProperties\(\)\.setProperty\(\s*"BOT_TOKEN"/);
});
