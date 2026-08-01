/* Boinya FAST — Service Worker edge-кэш в браузере (без Cloudflare аккаунта).
 * Перехватывает JSONP к Apps Script и ответы с /fast/data/.
 * Cache HIT → мгновенно; MISS → сеть + запись в Cache Storage.
 */
const SW_VER = "boinya-fast-sw-v1";
const API_CACHE = "boinya-fast-api-v1";
const GAS_HINT = "script.google.com/macros";
const WRITE_RE =
  /[?&]action=(save|delete|move|update|finish|cancel|enroll|set|close|pull|materialize|start|stop|ensure|scrub|request|setup|create|add|remove|toggle|mark|send|prepare|register|upsert|sync)/i;

self.addEventListener("install", function (e) {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== API_CACHE && k.indexOf("boinya-fast") === 0) return caches.delete(k);
        })
      );
    }).then(function () {
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

  // предзаполненные снапшоты с Pages (мгновенно)
  if (url.origin === self.location.origin && /\/fast\/data\/.+\.json$/.test(url.pathname)) {
    event.respondWith(cacheFirst_(req, 300));
    return;
  }

  var isGas = url.href.indexOf(GAS_HINT) >= 0;
  var isProxy =
    url.searchParams.has("action") &&
    (url.hostname.indexOf("workers.dev") >= 0 || url.searchParams.has("callback"));

  if (!isGas && !isProxy) return;
  if (WRITE_RE.test(url.search)) {
    event.respondWith(
      fetch(req).then(function (res) {
        return bustApiCache_().then(function () {
          return res;
        });
      })
    );
    return;
  }

  event.respondWith(swrJsonp_(req, url));
});

function cacheKeyFromUrl_(url) {
  var u = new URL(url.href);
  u.searchParams.delete("callback");
  u.searchParams.delete("_");
  u.searchParams.delete("nocache");
  u.searchParams.sort();
  return u.toString();
}

function swrJsonp_(req, url) {
  var key = cacheKeyFromUrl_(url);
  return caches.open(API_CACHE).then(function (cache) {
    return cache.match(key).then(function (hit) {
      var network = fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            try {
              cache.put(key, res.clone());
            } catch (e) {}
          }
          return res;
        })
        .catch(function () {
          return hit || Response.error();
        });
      if (hit) return hit;
      return network;
    });
  });
}

function cacheFirst_(req, maxAgeSec) {
  return caches.open(API_CACHE).then(function (cache) {
    return cache.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var headers = new Headers(res.headers);
          headers.set("Cache-Control", "public, max-age=" + (maxAgeSec || 60));
          var copy = new Response(res.clone().body, {
            status: res.status,
            statusText: res.statusText,
            headers: headers
          });
          cache.put(req, copy.clone());
          return copy;
        }
        return res;
      });
    });
  });
}

function bustApiCache_() {
  return caches.delete(API_CACHE);
}

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "BUST") {
    event.waitUntil(bustApiCache_());
  }
});
