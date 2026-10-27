import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const prodSrc = fs.readFileSync(path.join(here, "production.js"), "utf8");
const appSrc = fs.readFileSync(path.join(here, "app.js"), "utf8");
const L = require("./week-logic.js");
const payload = require("./order-payload.js");
const engine = require("./order-engine.js");

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function bootProd(opts) {
  opts = opts || {};
  const delays = opts.delays || {};
  const nodes = {};
  const calls = [];
  const mem = {};
  const inflight = {};
  function make(id) {
    const node = {
      id: id,
      innerHTML: "",
      textContent: "",
      value: "",
      hidden: false,
      setAttribute: function (k, v) { this[k] = v; },
      getAttribute: function (k) { return this[k] || ""; },
      contains: function () { return false; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; }
    };
    if (id) nodes[id] = node;
    return node;
  }
  function body(action) {
    if (action === "getCutting") {
      return { status: "success", fromOrders: true, items: [{ row: 4, name: "Рубец", unit: "гр", dry: 100, raw: 0.4, laid: false, done: false }] };
    }
    if (action === "getAssembly") return { status: "success", clients: [{ name: "СборкаТест", basket: [] }] };
    if (action === "getCourier") {
      return {
        status: "success",
        clients: [
          { name: "Партнёр", segment: "ПАРТНЁР", orderPrice: 24, address: "Цвирко 100", basket: [] },
          {
            name: "Розница",
            segment: "Р",
            orderPrice: 9,
            address: "Немига 5",
            entrance: "2",
            doorCode: "55",
            floor: "3",
            flat: "10",
            addressComment: "зелёная дверь",
            basket: []
          }
        ]
      };
    }
    if (action === "listWarehouses") {
      return { status: "success", warehouses: [{ id: "1", name: "Склад", address: "Белецкого 10к2", departure: true }] };
    }
    return { status: "success" };
  }
  const realm = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Promise: Promise,
    Date: Date,
    Number: Number,
    String: String,
    Object: Object,
    Array: Array,
    Math: Math,
    JSON: JSON,
    Intl: Intl,
    isFinite: isFinite,
    localStorage: { getItem: function () { return ""; }, setItem: function () {}, removeItem: function () {} },
    BoinyaWeekLogic: L,
    BoinyaOrderPayload: payload,
    BoinyaOrderEngine: engine,
    BoinyaAccess: { tabHas: function () { return true; } },
    BoinyaShell: {
      esc: function (s) { return String(s == null ? "" : s); },
      money: function (v) { return String(v); },
      toast: function () {},
      dock: function () {},
      closeAll: function () {},
      skeleton: function () { return "<p>skel</p>"; },
      empty: function () { return "<p>empty</p>"; },
      errorBox: function () { return "<p>err</p>"; },
      main: function (html) {
        make("nxMain").innerHTML = html;
        const re = /id="([^"]+)"/g;
        let m;
        while ((m = re.exec(String(html || "")))) make(m[1]);
      }
    }
  };
  realm.BoinyaApi = {
    apiGet: function (params, opt) {
      const action = String(params && params.action || "");
      const key = action + ":" + String((params && params.day) || "");
      const ttl = opt && opt.cacheTtlMs ? opt.cacheTtlMs : 0;
      const now = Date.now();
      if (ttl && mem[key] && mem[key].exp > now) return Promise.resolve(mem[key].res);
      if (inflight[key]) return inflight[key];
      calls.push({ action: action, at: performance.now() });
      const p = sleep(delays[action] != null ? delays[action] : 40).then(function () {
        const res = body(action);
        if (ttl) mem[key] = { exp: Date.now() + ttl, res: res };
        return res;
      });
      inflight[key] = p;
      p.then(function () { if (inflight[key] === p) delete inflight[key]; }, function () { if (inflight[key] === p) delete inflight[key]; });
      return p;
    },
    apiPost: function () { return Promise.resolve({ status: "success" }); },
    telegramUser: function () { return { id: 1, first_name: "Тест" }; }
  };
  realm.window = realm;
  realm.globalThis = realm;
  realm.document = {
    getElementById: function (id) { return nodes[id] || null; },
    querySelector: function () { return null; },
    createElement: function () { return make(""); },
    activeElement: null,
    hidden: false
  };
  vm.createContext(realm);
  vm.runInContext(prodSrc, realm, { filename: "production.js" });
  realm.BoinyaProduction.bind({ role: "owner", tabs: ["cuttingScreen", "courierScreen"] });
  realm.__nodes = nodes;
  realm.__calls = calls;
  return realm;
}

test("догрузка Цеха не возвращает Нарезку и открывается из кэша входа", async () => {
  const slow = { getCutting: 180, getAssembly: 180, getCourier: 40, listWarehouses: 40 };
  const race = bootProd({ delays: slow });
  const cutJob = race.BoinyaProduction.show("cut");
  await sleep(15);
  const routeJob = race.BoinyaProduction.show("route");
  await Promise.all([cutJob, routeJob]);
  await sleep(220);
  const html = race.__nodes.nxMain.innerHTML;
  assert.equal(race.BoinyaProduction.seg(), "route");
  assert.match(html, /Точка выезда/);
  assert.equal(html.includes("осталось нарезать"), false);
  assert.match(html, /data-seg="route"[^>]*>Курьер/);
  assert.match(html, /24 BYN/);
  assert.match(html, /Немига 5/);
  assert.match(html, /п\.2/);
  assert.match(html, /домофон 55/);
  assert.match(html, /эт\.3/);
  assert.match(html, /кв\.10/);
  assert.match(html, /зелёная дверь/);
  assert.match(html, /Этаж и квартира/);

  const cold = bootProd({ delays: { getCutting: 400, getAssembly: 400, getCourier: 400, listWarehouses: 400 } });
  const tCold = performance.now();
  await cold.BoinyaProduction.show("cut");
  const coldMs = performance.now() - tCold;
  assert.ok(coldMs > 300, "холодная нарезка " + coldMs);
  assert.match(cold.__nodes.nxMain.innerHTML, /Рубец/);

  const warm = bootProd({ delays: { getCutting: 400, getAssembly: 400, getCourier: 400, listWarehouses: 400 } });
  const tWarm = performance.now();
  warm.BoinyaProduction.warm();
  await sleep(20);
  const pack = warm.__calls.map(function (c) { return c.action; });
  const spread = warm.__calls[warm.__calls.length - 1].at - warm.__calls[0].at;
  assert.ok(pack.indexOf("getCutting") >= 0);
  assert.ok(pack.indexOf("getAssembly") >= 0);
  assert.ok(pack.indexOf("getCourier") >= 0);
  assert.ok(pack.indexOf("listWarehouses") >= 0);
  assert.ok(spread < 30, "запросы Цеха ушли пачкой, разъезд " + spread);
  await sleep(430);
  const tOpen = performance.now();
  await warm.BoinyaProduction.show("cut");
  const openMs = performance.now() - tOpen;
  assert.match(warm.__nodes.nxMain.innerHTML, /Рубец/);
  assert.ok(openMs < 40, "нарезка после догрузки " + openMs);
  const tPack = performance.now();
  await warm.BoinyaProduction.show("pack");
  const packMs = performance.now() - tPack;
  assert.match(warm.__nodes.nxMain.innerHTML, /СборкаТест/);
  assert.equal(warm.BoinyaProduction.seg(), "pack");
  assert.ok(packMs < 40, "сборка после догрузки " + packMs);
  const tRoute = performance.now();
  await warm.BoinyaProduction.show("route");
  const routeMs = performance.now() - tRoute;
  assert.equal(warm.BoinyaProduction.seg(), "route");
  assert.ok(routeMs < 40, "курьер после догрузки " + routeMs);
  console.log("CEH_SPEED coldCut=" + Math.round(coldMs) + " warmOpen=" + Math.round(openMs) + " pack=" + Math.round(packMs) + " route=" + Math.round(routeMs) + " parallelSpread=" + Math.round(spread));
  race.BoinyaProduction.pauseBackground();
  cold.BoinyaProduction.pauseBackground();
  warm.BoinyaProduction.pauseBackground();
});

test("партнёру видна сумма заказа, рознице полный адрес, сбор партнёра не растёт", () => {
  const realm = bootProd();
  const money = realm.BoinyaProduction.previewCardMoney_;
  const addr = realm.BoinyaProduction.previewCourierAddr_;
  assert.equal(L.courierStopMoney({ segment: "ПАРТНЁР", orderPrice: 24 }), null);
  assert.equal(L.courierCollectSum([
    { segment: "ПАРТНЁР", orderPrice: 24 },
    { segment: "Р", orderPrice: 9 },
    { segment: "БП", orderPrice: 15 }
  ]), 9);
  assert.equal(money({ segment: "ПАРТНЁР", orderPrice: 24 }), 24);
  assert.equal(money({ segment: "ПАРТНЁР", source: "partner", totalByn: "18,5" }), 18.5);
  assert.equal(money({ segment: "ПАРТНЁР", note: "[ЦЕНА: 21 BYN]" }), 21);
  assert.equal(money({ segment: "БП", orderPrice: 15 }), null);
  assert.equal(money({ segment: "Р", orderPrice: 9 }), 9);
  const retail = addr({
    segment: "Р",
    address: "Немига 5",
    entrance: "2",
    doorCode: "55",
    floor: "3",
    flat: "10",
    addressComment: "зелёная дверь"
  });
  assert.match(retail.street, /Немига 5/);
  assert.match(retail.street, /п\.2/);
  assert.match(retail.street, /домофон 55/);
  assert.match(retail.street, /эт\.3/);
  assert.match(retail.street, /кв\.10/);
  assert.match(retail.street, /зелёная дверь/);
  const pp = addr({ segment: "ПП", address: "Немига 5", entrance: "2", floor: "3", flat: "10", doorCode: "55" });
  assert.equal(pp.street.includes("этаж"), false);
  assert.match(pp.details, /этаж 3/);
  assert.match(pp.details, /домофон 55/);
  assert.match(prodSrc, /Этаж и квартира/);
  assert.match(appSrc, /prod\(\)\.warm\(\)/);
});
