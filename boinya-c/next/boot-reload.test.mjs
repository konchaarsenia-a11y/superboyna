import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiSrc = fs.readFileSync(path.resolve(here, "api.js"), "utf8");
const appSrc = fs.readFileSync(path.resolve(here, "app.js"), "utf8");
const swSrc = fs.readFileSync(path.resolve(here, "../sw.js"), "utf8");

function loadApi(setup) {
  const store = new Map();
  const sandbox = {
    sessionStorage: {
      getItem(k) { return store.has(k) ? store.get(k) : ""; },
      setItem(k, v) { store.set(k, String(v)); }
    },
    location: { hash: "" },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    URLSearchParams,
    encodeURIComponent,
    decodeURIComponent,
    Promise,
    Object,
    String,
    Number,
    Math,
    Error,
    JSON
  };
  sandbox.window = sandbox;
  if (setup) setup(sandbox);
  vm.runInNewContext(apiSrc, sandbox, { filename: "api.js" });
  return sandbox;
}

test("initData: живой Telegram важнее hash и памяти", () => {
  const box = loadApi((s) => {
    s.location.hash = "#tgWebAppData=" + encodeURIComponent("query_id=old&user=%7B%22id%22%3A1%7D");
    s.Telegram = { WebApp: { initData: "query_id=live&user=%7B%22id%22%3A42%7D", initDataUnsafe: { user: { id: 42, first_name: "Арс" } } } };
  });
  assert.equal(box.BoinyaApi.initData(), "query_id=live&user=%7B%22id%22%3A42%7D");
  assert.equal(box.BoinyaApi.telegramUser().id, 42);
});

test("initData: hash tgWebAppData, если скрипт Telegram ещё пустой", () => {
  const raw = "query_id=hash&user=" + encodeURIComponent(JSON.stringify({ id: 7, first_name: "Ник" }));
  const box = loadApi((s) => {
    s.location.hash = "#tgWebAppData=" + encodeURIComponent(raw) + "&tgWebAppVersion=7.0";
    s.Telegram = { WebApp: { initData: "", initDataUnsafe: {} } };
  });
  assert.equal(box.BoinyaApi.liveInitData(), "");
  assert.equal(box.BoinyaApi.initData(), raw);
  assert.equal(box.BoinyaApi.telegramUser().id, 7);
});

test("waitForInitData дожидается позднего initData и не висит", async () => {
  const box = loadApi((s) => {
    s.Telegram = { WebApp: { initData: "", initDataUnsafe: {} } };
  });
  const pending = box.BoinyaApi.waitForInitData(400);
  setTimeout(() => { box.Telegram.WebApp.initData = "query_id=late"; }, 80);
  const got = await pending;
  assert.equal(got, "query_id=late");
  const empty = loadApi(() => {});
  const none = await empty.BoinyaApi.waitForInitData(60);
  assert.equal(none, "");
});

test("apiGet отдаёт успешный JSONP и не падает", async () => {
  const box = loadApi((s) => {
    s.document = {
      createElement() { return {}; },
      head: {
        appendChild(node) {
          const m = String(node.src).match(/[?&]callback=([^&]+)/);
          s[decodeURIComponent(m[1])]({ status: "success", role: "owner", tabs: ["orderScreen"] });
        }
      }
    };
  });
  const res = await box.BoinyaApi.apiGet({ action: "getMyAccess" }, { timeoutMs: 1000, retries: 0, cacheTtlMs: 0 });
  assert.equal(res.status, "success");
  assert.equal(res.role, "owner");
});

test("перезагрузка: кэш остаётся, запрос доступа с таймаутом", () => {
  assert.equal(appSrc.includes("if (booting) return"), false);
  assert.match(appSrc, /waitForInitData\(1600\)/);
  assert.match(appSrc, /показываю как было/);
  assert.match(appSrc, /timeoutMs: 8000, retries: 1/);
  assert.match(apiSrc, /function bounded\(/);
  assert.match(apiSrc, /tgWebAppData/);
  assert.match(swSrc, /callback=/);
  assert.match(swSrc, /boinya-c\\\/next\\/);
  assert.match(swSrc, /boinya-c-sw-v15-71123100/);
  assert.match(apiSrc, /function apiGet\(params, opts\) \{[\s\S]*var action = String\(params\.action \|\| ""\);[\s\S]*WRITE\.test\(action\)/);
});
