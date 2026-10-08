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
      setItem(k, v) { store.set(k, String(v)); },
      removeItem(k) { store.delete(k); }
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

test("tgLogin не подменяет живой initData и уходит, только если мини-аппа нет", async () => {
  const login = "id=7&first_name=Ник&hash=abc";
  const box = loadApi((s) => {
    s.localStorage = {
      getItem(k) { return k === "nx_tg_login_v1" ? login : ""; },
      setItem() {},
      removeItem() {}
    };
    s.Telegram = { WebApp: { initData: "query_id=live&user=%7B%22id%22%3A42%7D", initDataUnsafe: { user: { id: 42, first_name: "Арс" } } } };
  });
  assert.equal(box.BoinyaApi.initData().indexOf("query_id=live"), 0);
  assert.equal(box.BoinyaApi.loginData(), "");
  assert.equal(box.BoinyaApi.hasDesktopLogin(), false);
  assert.equal(box.BoinyaApi.telegramUser().id, 42);

  const desk = loadApi((s) => {
    const mem = new Map();
    s.localStorage = {
      getItem(k) { return mem.has(k) ? mem.get(k) : ""; },
      setItem(k, v) { mem.set(k, String(v)); },
      removeItem(k) { mem.delete(k); }
    };
    s.Telegram = { WebApp: { initData: "", initDataUnsafe: {} } };
  });
  desk.BoinyaApi.rememberLogin(login);
  assert.equal(desk.BoinyaApi.loginData(), login);
  assert.equal(desk.BoinyaApi.telegramUser().id, 7);
  assert.equal(desk.BoinyaApi.telegramUser().first_name, "Ник");
  const seen = [];
  desk.document = {
    createElement() { return {}; },
    head: {
      appendChild(node) {
        seen.push(String(node.src));
        const m = String(node.src).match(/[?&]callback=([^&]+)/);
        desk[decodeURIComponent(m[1])]({ status: "success", role: "owner" });
      }
    }
  };
  await desk.BoinyaApi.apiGet({ action: "getMyAccess" }, { timeoutMs: 1000, retries: 0, cacheTtlMs: 0 });
  assert.match(seen[0], /tgLogin=/);
  assert.equal(seen[0].indexOf("initData="), -1);
  desk.BoinyaApi.clearLogin();
  assert.equal(desk.BoinyaApi.loginData(), "");
});

test("перезагрузка: кэш остаётся, запрос доступа с таймаутом", () => {
  assert.equal(appSrc.includes("if (booting) return"), false);
  assert.match(appSrc, /waitForInitData\(1600\)/);
  assert.match(appSrc, /показываю как было/);
  assert.match(appSrc, /Откройте через Telegram/);
  assert.match(appSrc, /Войти через Telegram/);
  assert.match(appSrc, /insideTelegramApp/);
  assert.match(appSrc, /timeoutMs: 8000, retries: 1/);
  assert.match(apiSrc, /function bounded\(/);
  assert.match(apiSrc, /tgWebAppData/);
  assert.match(swSrc, /callback=/);
  assert.match(swSrc, /boinya-c\\\/next\\/);
  assert.match(swSrc, /boinya-c-sw-v17-71125260/);
  assert.match(apiSrc, /function apiGet\(params, opts\) \{[\s\S]*var action = String\(params\.action \|\| ""\);[\s\S]*WRITE\.test\(action\)/);
});
