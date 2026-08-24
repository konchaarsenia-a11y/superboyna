/**
 * Бойня C — SW.
 * ВАЖНО: app.main.js / app.html / bridge / config — network-first.
 * Старый cache-first + ignoreSearch залипал на мёртвом JS → delete/move «не работают».
 */
const SW_VER = "boinya-c-sw-v12-71115874";
const SHELL = "boinya-c-shell-v12";
const API_CACHE = "boinya-c-api-v12";

const PRECACHE = [
  "./",
  "./index.html",
  "./app.html",
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
            // снести ВСЕ старые shell/api кэши Бойни
            if (k === SHELL || k === API_CACHE) return null;
            if (k.indexOf("boinya-c") === 0 || k.indexOf("boinya-fast") === 0) {
              return caches.delete(k);
            }
            return null;
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function isAppShellPath_(path) {
  return (
    /\/boinya-c\/?$/.test(path) ||
    /\/boinya-c\/(index|app)\.html/.test(path) ||
    /\/boinya-c\/(app\.main|seed-inline|bridge|sw)\.js/.test(path) ||
    /\/boinya-c\/client\//.test(path)
  );
}

/** JS/HTML приложения — всегда сначала сеть, иначе TG вечно на старом delete/move. */
function isCriticalAppAsset_(path) {
  return (
    /\/boinya-c\/(index|app)\.html$/.test(path) ||
    /\/boinya-c\/(app\.main|bridge|seed-inline|sw)\.js$/.test(path) ||
    /\/boinya-c\/client\/config\.js$/.test(path)
  );
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  var path = url.pathname || "";

  // Критичные файлы UI: network-first (не ignoreSearch-cache)
  if (isCriticalAppAsset_(path) && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            var clone = res.clone();
            caches.open(SHELL).then(function (cache) {
              try {
                cache.put(req, clone);
              } catch (ePut) {}
            });
          }
          return res;
        })
        .catch(function () {
          return caches.open(SHELL).then(function (cache) {
            return cache.match(req).then(function (hit) {
              return hit || cache.match(req, { ignoreSearch: true });
            });
          });
        })
    );
    return;
  }

  // прочая статика / data — stale-while-revalidate
  var isShell =
    isAppShellPath_(path) || /\/boinya-c\/data\//.test(path);

  if (isShell && url.origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL).then(function (cache) {
        return cache.match(req).then(function (hit) {
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

  // GAS: НЕ кэшировать getClients/getViewCompare — иначе удалённые «возвращаются»
  if (url.href.indexOf("script.google.com/macros") !== -1) {
    if (
      /[?&]action=(save|delete|move|update|finish|cancel|enroll|set|close|pull|materialize|remove)/i.test(
        url.search
      )
    ) {
      return;
    }
    if (/[?&]action=(getClients|getViewCompare|getWeekDayCounts)/i.test(url.search)) {
      return; // всегда сеть
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
