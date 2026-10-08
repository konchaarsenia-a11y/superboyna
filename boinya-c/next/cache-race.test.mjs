import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function loadApi() {
  const realm = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Promise: Promise,
    Date: Date,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    URLSearchParams: URLSearchParams,
    location: { search: "", hash: "", href: "https://example/" },
    sessionStorage: { getItem: function () { return ""; }, setItem: function () {} }
  };
  realm.window = realm;
  realm.globalThis = realm;
  let fire = null;
  realm.document = {
    createElement: function () {
      const s = { remove: function () {} };
      Object.defineProperty(s, "src", {
        set: function (v) {
          const m = String(v).match(/[?&]callback=([^&]+)/);
          const cb = m ? decodeURIComponent(m[1]) : "";
          fire = function (data) {
            if (typeof realm[cb] === "function") realm[cb](data);
          };
        }
      });
      return s;
    },
    head: { appendChild: function () {} }
  };
  vm.createContext(realm);
  vm.runInContext(fs.readFileSync(path.join(here, "api.js"), "utf8"), realm, { filename: "api.js" });
  realm.__fire = function (data) { if (fire) fire(data); };
  realm.__arm = function () { fire = null; };
  return realm;
}

test("поздний ответ чтения не возвращает кэш после записи", async () => {
  const realm = loadApi();
  const pending = realm.BoinyaApi.apiGet(
    { action: "getStats", month: "2026-10" },
    { cacheTtlMs: 60000, timeoutMs: 5000 }
  );
  realm.BoinyaApi.bustMem(null);
  realm.__fire({ status: "success", monthKey: "2026-10", n: 1 });
  const first = await pending;
  assert.equal(first.n, 1);

  realm.__arm();
  let secondSrc = false;
  const prev = realm.document.createElement;
  realm.document.createElement = function () {
    secondSrc = true;
    return prev();
  };
  const again = realm.BoinyaApi.apiGet(
    { action: "getStats", month: "2026-10" },
    { cacheTtlMs: 60000, timeoutMs: 5000 }
  );
  assert.equal(secondSrc, true, "после сброса кэш не должен ответить старым getStats");
  realm.__fire({ status: "success", monthKey: "2026-10", n: 2 });
  const second = await again;
  assert.equal(second.n, 2);
});

test("люди месяца: старый ответ не затирает новый снимок", () => {
  const week = fs.readFileSync(path.join(here, "week.js"), "utf8");
  assert.match(week, /peopleApplyGen\[month\] !== ticket/);
});
