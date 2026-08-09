/**
 * Бойня C — SW: прекэш оболочки + cache-first статики песочницы.
 * Ускоряет 2-й заход; на 1-м — install в фоне.
 */
const SW_VER = "boinya-c-sw-v10";
const SHELL = "boinya-c-shell-v10";
const API_CACHE = "boinya-c-api-v10";

const PRECACHE = [
  "./",
  "./index.html",
  "./app.html",
  "./app.main.js",
  "./seed-inline.js",
  "./bridge.js",
  "./client/config.js",
  "./sw.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches
      .open(SHELL)
      .then(function (c) {
        return c.addAll(
          PRECACHE.map(function (u) {
            return new Request(u, { cache: "reload" });
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
      .catch(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (k) {
            if (k !== SHELL && k !== API_CACHE && k.indexOf("boinya-c") === 0) {
              return caches.delete(k);
            }
            if (k.indexOf("boinya-fast") === 0) return caches.delete(k);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // статика песочницы — cache-first
  var path = url.pathname || "";
  var isShell =
    /\/boinya-c\/?$/.test(path) ||
    /\/boinya-c\/(index|app)\.html/.test(path) ||
    /\/boinya-c\/(app\.main|seed-inline|bridge|sw)\.js/.test(path) ||
    /\/boinya-c\/client\//.test(path) ||
    /\/boinya-c\/data\//.test(path);

  if (isShell && url.origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL).then(function (cache) {
        return cache.match(req, { ignoreSearch: true }).then(function (hit) {
          var fetchPromise = fetch(req)
            .then(function (res) {
              if (res && res.ok) cache.put(req, res.clone());
              return res;
            })
            .catch(function () {
              return hit;
            });
          return hit || fetchPromise;
        });
      })
    );
    return;
  }

  // JSONP GAS — cache-first для read (как раньше во FAST sw)
  if (url.href.indexOf("script.google.com/macros") !== -1) {
    if (/[?&]action=(save|delete|move|update|finish|cancel|enroll|set|close|pull|materialize)/i.test(url.search)) {
      return;
    }
    event.respondWith(
      caches.open(API_CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          });
        });
      })
    );
  }
});
