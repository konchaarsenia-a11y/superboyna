import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { console, module: { exports: {} } };
sandbox.exports = sandbox.module.exports;
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(dir, "order-payload.js"), "utf8"), sandbox, { filename: "order-payload.js" });
const pay = sandbox.module.exports;

function eng() {
  return {
    serializeOrderNotes: function () { return ""; },
    parseLatLonFromText_: function () { return null; },
    applyState: function () {},
    currentPpSlotPayload_: function () { return {}; }
  };
}

const crumb = {
  cat: "crumb",
  main: "КРОШКА",
  crumbKind: "meat",
  sources: [
    { name: "говядина", val: 40, value: 40 },
    { name: "рубец", val: 60, value: 60 }
  ],
  ratio: [40, 60],
  value: 100
};

test("розница из расчёта: состав, крошка, ник и платная доставка", () => {
  const baskets = {
    1: [
      { cat: "dressura", main: "говядина", name: "говядина", sub: "мелкая", val: 200, value: 200 },
      crumb
    ],
    2: [{ cat: "chew", main: "трахея", value: 2 }]
  };
  const snap = pay.retailOrderSnapshot({
    client: " @murka ",
    baskets: baskets,
    dogCount: 2,
    activeDog: 1,
    retailPaidDelivery: true,
    priceInput: "36.5"
  }, eng());
  assert.equal(snap.mode, "order");
  assert.equal(snap.orderType, "retail");
  assert.equal(snap.client, "@murka");
  assert.equal(snap.retailPaidDelivery, true);
  assert.equal(snap.isEdit, false);
  assert.equal(snap.address, "");
  assert.equal(snap.deliveryDate, "");
  assert.equal(snap.dogCount, 2);
  assert.equal(snap.orderPrice, "36.5");
  assert.equal(snap.baskets[1][0].value, 200);
  assert.equal(snap.baskets[1][1].crumbKind, "meat");
  assert.equal(snap.baskets[1][1].sources[1].name, "рубец");
  assert.equal(snap.baskets[1][1].sources[1].value, 60);
  assert.equal(snap.baskets[2][0].value, 2);
  crumb.sources[0].value = 1;
  assert.equal(snap.baskets[1][1].sources[0].value, 40);
  assert.equal(JSON.stringify(snap).includes("·"), false);
});

test("без ника и без доставки заказ пустой по этим полям, вторая собака не тащится", () => {
  const snap = pay.retailOrderSnapshot({
    client: "",
    baskets: { 1: [{ main: "лёгкое", value: 100 }], 2: [{ main: "лишнее", value: 50 }] },
    dogCount: 1,
    retailDelivery: "free"
  }, eng());
  assert.equal(snap.client, "");
  assert.equal(snap.retailPaidDelivery, false);
  assert.equal(snap.orderType, "retail");
  assert.equal(snap.dogCount, 1);
  assert.equal(snap.baskets[1][0].value, 100);
  assert.equal(snap.baskets[2].length, 0);
  assert.equal(snap.isEdit, false);
});

test("кнопка розницы и подсказка без точки-разделителя", () => {
  const clients = fs.readFileSync(path.join(dir, "clients.js"), "utf8");
  const app = fs.readFileSync(path.join(dir, "app.js"), "utf8");
  const open = clients.slice(clients.indexOf("function openRetailOrder"), clients.indexOf("async function deferCalc"));
  assert.match(clients, /data-act="cl-order-open">Внести заказ/);
  assert.match(clients, /data-act="cl-enroll-open">Внести в ПП/);
  assert.match(open, /loadDeferred\(snap, ""\)/);
  assert.doesNotMatch(open, /apiPost|apiGet|enrollGo|saveBooking|saveSubscription/);
  const help = app.match(/route\.seg === "calc"\) \{\s*return "([^"]+)"/);
  assert.ok(help, "подсказка расчёта");
  assert.match(help[1], /Внести заказ/);
  assert.match(help[1], /Внести в ПП/);
  assert.equal(help[1].includes("·"), false);
});
