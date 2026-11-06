// gb-phone-toast-h1 / gb-try-guest-h1 / gb-cabinet-desk-h1: toast, guest cabinet, desktop layout. Touches next so next-undef runs.
// auth-h4: desktop tgLogin → POST body (не JSONP); без утечки login в URL; live initData не подменяется.
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
    JSON,
    AbortController
  };
  sandbox.window = sandbox;
  if (setup) setup(sandbox);
  vm.runInNewContext(apiSrc, sandbox, { filename: "api.js" });
  return sandbox;
}

function mockFetchOk(box, capture) {
  box.fetch = function (url, opts) {
    capture.push({
      url: String(url || ""),
      method: String((opts && opts.method) || "GET"),
      body: String((opts && opts.body) || ""),
      headers: (opts && opts.headers) || {}
    });
    return Promise.resolve({
      text: function () {
        return Promise.resolve(JSON.stringify({ status: "success", role: "owner" }));
      }
    });
  };
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

test("tgLogin: live initData не подменяется; desktop → POST body без login в URL", async () => {
  const login = "id=7&first_name=Ник&photo_url=https://t.me/i/userpic/320/x.jpg&hash=abc";
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
    s.sessionStorage = s.localStorage;
    s.Telegram = { WebApp: { initData: "", initDataUnsafe: {} } };
    // Spoof: чужой remembered init не должен уехать вместе с widget login.
    mem.set("nx_tg_init_v1", "query_id=spoof&user=%7B%22id%22%3A999%7D&hash=evil");
  });
  desk.BoinyaApi.rememberLogin(login);
  assert.equal(desk.BoinyaApi.loginData(), login);
  assert.equal(desk.BoinyaApi.telegramUser().id, 7);
  assert.equal(desk.BoinyaApi.telegramUser().first_name, "Ник");

  const jsonpSeen = [];
  desk.document = {
    createElement() { return {}; },
    head: {
      appendChild(node) {
        jsonpSeen.push(String(node.src));
        const m = String(node.src).match(/[?&]callback=([^&]+)/);
        if (m) desk[decodeURIComponent(m[1])]({ status: "success", role: "owner" });
      }
    }
  };
  const posts = [];
  mockFetchOk(desk, posts);

  const res = await desk.BoinyaApi.apiGet({ action: "getMyAccess" }, { timeoutMs: 1000, retries: 0, cacheTtlMs: 0 });
  assert.equal(res.status, "success");
  assert.equal(jsonpSeen.length, 0, "auth-bearing getMyAccess must not use JSONP");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].method, "POST");
  assert.equal(posts[0].url.indexOf("tgLogin="), -1, "tgLogin must not leak into URL");
  assert.equal(posts[0].url.indexOf("initData="), -1, "initData must not leak into URL");
  assert.equal(posts[0].url.indexOf("photo_url="), -1);
  const body = JSON.parse(posts[0].body);
  assert.equal(body.tgLogin, login);
  assert.equal(body.action, "getMyAccess");
  assert.equal(body.initData == null || body.initData === "", true, "desktop login must not stamp spoofed remembered initData");

  desk.BoinyaApi.clearLogin();
  assert.equal(desk.BoinyaApi.loginData(), "");
});

test("отриц.: явный чужой initData/id в params не затирает live Telegram user", async () => {
  const box = loadApi((s) => {
    s.Telegram = {
      WebApp: {
        initData: "query_id=live&user=%7B%22id%22%3A42%7D",
        initDataUnsafe: { user: { id: 42, first_name: "Арс" } }
      }
    };
  });
  assert.equal(box.BoinyaApi.telegramUser().id, 42);
  const posts = [];
  mockFetchOk(box, posts);
  box.document = { createElement() { return {}; }, head: { appendChild() {} } };
  await box.BoinyaApi.apiGet({
    action: "getMyAccess",
    telegramId: "999",
    initData: "query_id=evil&user=%7B%22id%22%3A999%7D&hash=nope"
  }, { timeoutMs: 1000, retries: 0, cacheTtlMs: 0 });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].method, "POST");
  const body = JSON.parse(posts[0].body);
  // Client may forward explicit initData, but live user helper stays on WebApp identity.
  assert.equal(box.BoinyaApi.telegramUser().id, 42);
  assert.equal(body.telegramId, "999");
  assert.equal(posts[0].url.indexOf("initData="), -1);
  assert.equal(posts[0].url.indexOf("tgLogin="), -1);
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
  assert.match(apiSrc, /Auth payload \(tgLogin\/photo_url\)/);
  assert.match(apiSrc, /tgLogin: 1/);
  assert.match(apiSrc, /desktop widget: не подмешивать remembered\/hash initData/i);
  assert.match(swSrc, /callback=/);
  assert.match(swSrc, /boinya-c\\\/next\\/);
  assert.match(swSrc, /boinya-c-sw-v18-71125455/);
  assert.match(swSrc, /cache:\s*"no-store"/);
  assert.match(apiSrc, /function apiGet\(params, opts\) \{[\s\S]*var action = String\(params\.action \|\| ""\);[\s\S]*WRITE\.test\(action\)/);
});
